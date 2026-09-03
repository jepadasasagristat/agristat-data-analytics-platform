"""
Reshape wide OpenSTAT Vegetables and Root Crops CSVs into a combined long CSV + SQLite DB.

Final long form (province-level, non-Total aggregates, quarter rows only):
  year, quarter, semester, crop_group, crop_subtype, is_aggregate,
  region, province, volume_mt, area_ha

Crop hierarchy uses PSA leading-dot indentation (e.g. Onion → Bermuda → yellow granex).
Parent / mid-level aggregate rows are excluded from the long table.
"""

from __future__ import annotations

import csv
import re
import sqlite3
from pathlib import Path

try:
    from .paths import DATA_DIR, RAW_DIR, ensure_data_dirs
except ImportError:
    from paths import DATA_DIR, RAW_DIR, ensure_data_dirs

ensure_data_dirs()
DB_PATH = DATA_DIR / "vegetables.db"
FINAL_CSV = DATA_DIR / "vegetables_long.csv"
WIDE_VOLUME = RAW_DIR / "_wide_vegetables_volume.csv"
WIDE_AREA = RAW_DIR / "_wide_vegetables_area.csv"
LONG_TABLE = "vegetables_long"
ANNUAL_TABLE = "vegetables_annual"
DIM_PREFIX = "vegetables_dim"

JOIN_KEYS = [
    "year",
    "quarter",
    "semester",
    "crop_group",
    "crop_subtype",
    "is_aggregate",
    "region",
    "province",
]
FINAL_FIELDS = JOIN_KEYS + ["volume_mt", "area_ha"]

MISSING = {"", "..", "...", "-", "NA", "N/A"}

QUARTER_META = {
    "Quarter1": 1,
    "Quarter2": 2,
    "Quarter3": 3,
    "Quarter4": 4,
}

# Reconcile volume vs area label mismatches if needed.
CROP_ALIASES: dict[str, str] = {}

GEO_PROPER_NAMES = {
    "PHILIPPINES": "Philippines",
    "CORDILLERA ADMINISTRATIVE REGION (CAR)": "CAR",
    "REGION I (ILOCOS REGION)": "Region I",
    "REGION II (CAGAYAN VALLEY)": "Region II",
    "REGION III (CENTRAL LUZON)": "Region III",
    "REGION IV-A (CALABARZON)": "Region IV-A",
    "MIMAROPA REGION": "MIMAROPA",
    "REGION V (BICOL REGION)": "Region V",
    "REGION VI (WESTERN VISAYAS)": "Region VI",
    "NEGROS ISLAND REGION": "NIR",
    "REGION VII (CENTRAL VISAYAS)": "Region VII",
    "REGION VIII (EASTERN VISAYAS)": "Region VIII",
    "REGION IX (ZAMBOANGA PENINSULA)": "Region IX",
    "REGION X (NORTHERN MINDANAO)": "Region X",
    "REGION XI (DAVAO REGION)": "Region XI",
    "REGION XII (SOCCSKSARGEN)": "Region XII",
    "REGION XIII (CARAGA)": "Region XIII",
    "BANGSAMORO AUTONOMOUS REGION IN MUSLIM MINDANAO (BARMM)": "BARMM",
    "Davao de Oro (Compostela Valley)": "Davao de Oro",
    "Cotabato (North Cotabato)": "Cotabato",
    "City of Davao": "Davao City",
    "Tawi-tawi": "Tawi-Tawi",
    "Puerto Princesa City": "Puerto Princesa",
}

CLEANUP_GLOBS = [
    "_wide_vegetables_*.csv",
    "*.tmp.csv",
]
CLEANUP_DIRS = (RAW_DIR, DATA_DIR)


def semester_from_quarter(quarter: int) -> int:
    return 1 if quarter <= 2 else 2


def normalize_crop_type(crop_type: str) -> str:
    return CROP_ALIASES.get(crop_type, crop_type)


def crop_depth(label: str) -> int:
    return len(label) - len(label.lstrip("."))


def clean_leaf_name(label: str) -> str:
    return re.sub(r"^\.+", "", label).strip()


def group_display_name(label: str) -> str:
    """Short commodity group label, e.g. 'Onion, mature bulb' -> 'Onion'."""
    name = clean_leaf_name(label)
    name = re.split(r"\s*\[", name)[0].strip()
    if "," in name:
        name = name.split(",", 1)[0].strip()
    return name


def classify_crop_labels(ordered_labels: list[str]) -> dict[str, tuple[str, str, bool]]:
    """
    Map raw PSA crop label -> (crop_group, crop_subtype, is_aggregate)
    using leading-dot hierarchy.
    """
    depths = [crop_depth(label) for label in ordered_labels]
    has_child = [False] * len(ordered_labels)
    for i, depth in enumerate(depths):
        for j in range(i + 1, len(ordered_labels)):
            if depths[j] <= depth:
                break
            has_child[i] = True
            break

    result: dict[str, tuple[str, str, bool]] = {}
    stack: list[tuple[int, str]] = []  # (depth, root_group)

    for i, label in enumerate(ordered_labels):
        depth = depths[i]
        while stack and stack[-1][0] >= depth:
            stack.pop()
        leaf = clean_leaf_name(label)

        if not stack:
            group = group_display_name(label)
            if has_child[i]:
                result[label] = (group, "Total", True)
                stack.append((depth, group))
            else:
                result[label] = (group, leaf, False)
        else:
            root_group = stack[0][1]
            if has_child[i]:
                result[label] = (root_group, leaf, True)
                stack.append((depth, root_group))
            else:
                result[label] = (root_group, leaf, False)

    return result


def strip_psa_markup(label: str) -> str:
    name = re.sub(r"^\.+", "", label).strip()
    name = re.sub(r"\s*\d+/\s*$", "", name).strip()
    name = re.sub(r"\s+[a-z]/?\s*$", "", name, flags=re.I).strip()
    return name


def proper_geo_name(label: str) -> str:
    stripped = strip_psa_markup(label)
    if stripped in GEO_PROPER_NAMES:
        return GEO_PROPER_NAMES[stripped]
    return re.sub(r"\s+", " ", stripped).strip()


def geo_level_from_label(label: str) -> str:
    dots = len(label) - len(label.lstrip("."))
    if dots == 0:
        return "national"
    if dots <= 2:
        return "region"
    return "province"


def parse_time_header(header: str) -> tuple[int, str]:
    year_s, period = header.split(" ", 1)
    return int(year_s), period


def parse_value(raw: str) -> float | None:
    text = (raw or "").strip()
    if text in MISSING:
        return None
    return float(text.replace(",", ""))


def build_geo_rows(labels: list[str]) -> list[dict]:
    rows: list[dict] = []
    current_region_id: int | None = None
    current_region_name: str | None = None
    national_id: int | None = None

    for i, raw_label in enumerate(labels, start=1):
        level = geo_level_from_label(raw_label)
        name = proper_geo_name(raw_label)
        parent_id: int | None = None
        region = ""
        province = ""

        if level == "national":
            national_id = i
            parent_id = None
        elif level == "region":
            current_region_id = i
            current_region_name = name
            parent_id = national_id
            region, province = name, ""
        else:
            parent_id = current_region_id or national_id
            region = current_region_name or ""
            province = name

        rows.append(
            {
                "geo_id": i,
                "geo_name": name,
                "geo_level": level,
                "parent_geo_id": parent_id,
                "source_label": name,
                "psa_label": raw_label,
                "region": region,
                "province": province,
            }
        )
    return rows


def build_crop_rows(
    crop_types: list[str],
    classification: dict[str, tuple[str, str, bool]],
) -> list[dict]:
    rows = []
    for i, crop_type in enumerate(crop_types, start=1):
        group, subtype, is_agg = classification[crop_type]
        rows.append(
            {
                "crop_id": i,
                "crop_group": group,
                "crop_subtype": subtype,
                "crop_type": crop_type,
                "is_aggregate": int(is_agg),
            }
        )
    return rows


def load_wide(path: Path) -> tuple[list[str], list[str], list[dict]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or len(reader.fieldnames) < 3:
            raise SystemExit(f"Unexpected CSV headers in {path}")
        return reader.fieldnames[:2], reader.fieldnames[2:], list(reader)


def to_long(
    wide_path: Path,
    value_field: str,
    geo_by_psa: dict[str, dict],
    crop_by_type: dict[str, int],
    crop_meta_by_type: dict[str, tuple[str, str, bool]],
) -> tuple[list[dict], list[dict]]:
    id_cols, time_cols, wide_rows = load_wide(wide_path)
    fact_rows: list[dict] = []
    long_map: dict[tuple, dict] = {}
    row_id = 0

    for row in wide_rows:
        crop_type = normalize_crop_type(row[id_cols[0]])
        psa_label = row[id_cols[1]]
        crop_id = crop_by_type[crop_type]
        geo = geo_by_psa[psa_label]
        crop_group, crop_subtype, is_agg = crop_meta_by_type[crop_type]

        for col in time_cols:
            year, period = parse_time_header(col)
            if period not in QUARTER_META:
                continue

            quarter = QUARTER_META[period]
            semester = semester_from_quarter(quarter)
            row_id += 1
            value = parse_value(row[col])
            fact_rows.append(
                {
                    "id": row_id,
                    "crop_id": crop_id,
                    "geo_id": geo["geo_id"],
                    "year": year,
                    "quarter": quarter,
                    "semester": semester,
                    value_field: value,
                }
            )

            if (
                not is_agg
                and geo["geo_level"] == "province"
                and geo["province"]
                and geo["region"]
            ):
                key = (
                    year,
                    quarter,
                    semester,
                    crop_group,
                    crop_subtype,
                    int(is_agg),
                    geo["region"],
                    geo["province"],
                )
                long_map[key] = {
                    "year": year,
                    "quarter": quarter,
                    "semester": semester,
                    "crop_group": crop_group,
                    "crop_subtype": crop_subtype,
                    "is_aggregate": int(is_agg),
                    "region": geo["region"],
                    "province": geo["province"],
                    value_field: value,
                }

    return fact_rows, list(long_map.values())


def combine_long(volume_rows: list[dict], area_rows: list[dict]) -> list[dict]:
    combined: dict[tuple, dict] = {}

    def key_of(row: dict) -> tuple:
        return tuple(row[k] for k in JOIN_KEYS)

    for row in volume_rows:
        k = key_of(row)
        combined[k] = {
            **{f: row[f] for f in JOIN_KEYS},
            "volume_mt": row["volume_mt"],
            "area_ha": None,
        }

    for row in area_rows:
        k = key_of(row)
        if k in combined:
            combined[k]["area_ha"] = row["area_ha"]
        else:
            combined[k] = {
                **{f: row[f] for f in JOIN_KEYS},
                "volume_mt": None,
                "area_ha": row["area_ha"],
            }

    rows = list(combined.values())
    rows.sort(
        key=lambda r: (
            r["year"],
            r["quarter"],
            r["region"],
            r["province"],
            r["crop_group"],
            r["crop_subtype"],
        )
    )
    return rows


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        f"""
        PRAGMA foreign_keys = ON;

        DROP TABLE IF EXISTS {LONG_TABLE};
        DROP TABLE IF EXISTS production;
        DROP TABLE IF EXISTS area_harvested;
        DROP TABLE IF EXISTS crop;
        DROP TABLE IF EXISTS geo;

        CREATE TABLE geo (
            geo_id INTEGER PRIMARY KEY,
            geo_name TEXT NOT NULL,
            geo_level TEXT NOT NULL CHECK (geo_level IN ('national', 'region', 'province')),
            parent_geo_id INTEGER REFERENCES geo(geo_id),
            source_label TEXT NOT NULL
        );

        CREATE TABLE crop (
            crop_id INTEGER PRIMARY KEY,
            crop_group TEXT NOT NULL,
            crop_subtype TEXT NOT NULL,
            crop_type TEXT NOT NULL UNIQUE,
            is_aggregate INTEGER NOT NULL CHECK (is_aggregate IN (0, 1))
        );

        CREATE TABLE production (
            production_id INTEGER PRIMARY KEY,
            crop_id INTEGER NOT NULL REFERENCES crop(crop_id),
            geo_id INTEGER NOT NULL REFERENCES geo(geo_id),
            year INTEGER NOT NULL,
            quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
            semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
            volume_mt REAL,
            UNIQUE (crop_id, geo_id, year, quarter)
        );

        CREATE TABLE area_harvested (
            area_id INTEGER PRIMARY KEY,
            crop_id INTEGER NOT NULL REFERENCES crop(crop_id),
            geo_id INTEGER NOT NULL REFERENCES geo(geo_id),
            year INTEGER NOT NULL,
            quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
            semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
            area_ha REAL,
            UNIQUE (crop_id, geo_id, year, quarter)
        );

        CREATE TABLE {LONG_TABLE} (
            year INTEGER NOT NULL,
            quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
            semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
            crop_group TEXT NOT NULL,
            crop_subtype TEXT NOT NULL,
            is_aggregate INTEGER NOT NULL,
            region TEXT NOT NULL,
            province TEXT NOT NULL,
            volume_mt REAL,
            area_ha REAL
        );

        CREATE INDEX idx_veg_production_year ON production(year);
        CREATE INDEX idx_veg_area_year ON area_harvested(year);
        CREATE INDEX idx_veg_long_year ON {LONG_TABLE}(year);
        CREATE INDEX idx_veg_long_quarter ON {LONG_TABLE}(quarter);
        CREATE INDEX idx_veg_long_region ON {LONG_TABLE}(region);
        CREATE INDEX idx_veg_long_crop ON {LONG_TABLE}(crop_group, crop_subtype);
        CREATE INDEX idx_veg_long_crop_year ON {LONG_TABLE}(crop_group, year);
        CREATE INDEX idx_veg_long_year_crop ON {LONG_TABLE}(year, crop_group);
        CREATE INDEX idx_veg_long_crop_year_region ON {LONG_TABLE}(crop_group, year, region);
        """
    )


def ensure_vegetables_perf(conn: sqlite3.Connection, *, force: bool = False) -> None:
    """Annual rollup + dim tables for fast default dashboard queries."""
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA cache_size=-128000")

    for sql in (
        f"CREATE INDEX IF NOT EXISTS idx_veg_long_crop_year ON {LONG_TABLE}(crop_group, year)",
        f"CREATE INDEX IF NOT EXISTS idx_veg_long_year_crop ON {LONG_TABLE}(year, crop_group)",
        f"CREATE INDEX IF NOT EXISTS idx_veg_long_crop_year_region ON {LONG_TABLE}(crop_group, year, region)",
    ):
        conn.execute(sql)

    has_annual = conn.execute(
        f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{ANNUAL_TABLE}'"
    ).fetchone()
    needs_rebuild = force or not has_annual
    if has_annual and not force:
        long_n = conn.execute(f"SELECT COUNT(*) FROM {LONG_TABLE}").fetchone()[0]
        annual_n = conn.execute(f"SELECT COUNT(*) FROM {ANNUAL_TABLE}").fetchone()[0]
        if annual_n <= 0 or long_n <= 0 or long_n / annual_n >= 6:
            needs_rebuild = True

    if needs_rebuild:
        conn.execute(f"DROP TABLE IF EXISTS {ANNUAL_TABLE}")
        conn.execute(
            f"""
            CREATE TABLE {ANNUAL_TABLE} AS
            SELECT year,
                   crop_group,
                   crop_subtype,
                   region,
                   province,
                   SUM(volume_mt) AS volume_mt,
                   SUM(area_ha) AS area_ha
            FROM {LONG_TABLE}
            GROUP BY year, crop_group, crop_subtype, region, province
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_veg_annual_crop_year ON {ANNUAL_TABLE}(crop_group, year)"
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_veg_annual_year_crop ON {ANNUAL_TABLE}(year, crop_group)"
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_veg_annual_crop_year_region "
            f"ON {ANNUAL_TABLE}(crop_group, year, region)"
        )

    dim_year = f"{DIM_PREFIX}_year"
    has_dims = conn.execute(
        f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{dim_year}'"
    ).fetchone()
    if needs_rebuild or not has_dims:
        for suffix in ("year", "region", "province", "crop", "quarter", "semester"):
            conn.execute(f"DROP TABLE IF EXISTS {DIM_PREFIX}_{suffix}")
        conn.execute(
            f"CREATE TABLE {DIM_PREFIX}_year AS "
            f"SELECT DISTINCT year AS value FROM {ANNUAL_TABLE} ORDER BY year"
        )
        conn.execute(
            f"CREATE TABLE {DIM_PREFIX}_region AS "
            f"SELECT DISTINCT region AS value FROM {ANNUAL_TABLE} ORDER BY region"
        )
        conn.execute(
            f"""
            CREATE TABLE {DIM_PREFIX}_province AS
            SELECT DISTINCT region, province FROM {ANNUAL_TABLE} ORDER BY region, province
            """
        )
        conn.execute(
            f"""
            CREATE TABLE {DIM_PREFIX}_crop AS
            SELECT DISTINCT crop_group, crop_subtype FROM {ANNUAL_TABLE}
            ORDER BY crop_group, crop_subtype
            """
        )
        conn.execute(
            f"CREATE TABLE {DIM_PREFIX}_quarter AS "
            f"SELECT DISTINCT quarter AS value FROM {LONG_TABLE} ORDER BY quarter"
        )
        conn.execute(
            f"CREATE TABLE {DIM_PREFIX}_semester AS "
            f"SELECT DISTINCT semester AS value FROM {LONG_TABLE} ORDER BY semester"
        )

    conn.commit()


def write_final_csv(rows: list[dict]) -> str:
    tmp = FINAL_CSV.with_suffix(".tmp.csv")
    with tmp.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FINAL_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    try:
        tmp.replace(FINAL_CSV)
        return FINAL_CSV.name
    except PermissionError:
        alt = DATA_DIR / "vegetables_long_new.csv"
        tmp.replace(alt)
        print(f"Note: {FINAL_CSV.name} was locked; wrote {alt.name}")
        return alt.name


def cleanup_intermediate_csvs(keep: set[str]) -> None:
    removed = []
    for directory in CLEANUP_DIRS:
        for pattern in CLEANUP_GLOBS:
            for path in directory.glob(pattern):
                if path.name in keep:
                    continue
                try:
                    path.unlink()
                    removed.append(path.name)
                except PermissionError:
                    print(f"Could not delete locked file: {path.name}")
    if removed:
        print("Removed:", ", ".join(removed))


def transform() -> None:
    if not WIDE_VOLUME.exists() or not WIDE_AREA.exists():
        raise SystemExit(
            f"Missing wide CSVs. Run fetch_vegetables.py first "
            f"(need {WIDE_VOLUME.name} and {WIDE_AREA.name})."
        )

    id_cols, _, wide_rows = load_wide(WIDE_VOLUME)
    geo_labels: list[str] = []
    seen_geo: set[str] = set()
    crop_types: list[str] = []
    seen_crop: set[str] = set()
    for row in wide_rows:
        crop = normalize_crop_type(row[id_cols[0]])
        if crop not in seen_crop:
            seen_crop.add(crop)
            crop_types.append(crop)
        label = row[id_cols[1]]
        if label not in seen_geo:
            seen_geo.add(label)
            geo_labels.append(label)

    id_cols_area, _, area_wide_rows = load_wide(WIDE_AREA)
    for row in area_wide_rows:
        crop = normalize_crop_type(row[id_cols_area[0]])
        if crop not in seen_crop:
            seen_crop.add(crop)
            crop_types.append(crop)
        label = row[id_cols_area[1]]
        if label not in seen_geo:
            seen_geo.add(label)
            geo_labels.append(label)

    classification = classify_crop_labels(crop_types)
    # Ensure area-only crops also have classification (flat leaf).
    for crop in crop_types:
        if crop not in classification:
            leaf = clean_leaf_name(crop)
            classification[crop] = (group_display_name(crop), leaf, False)

    geo_rows = build_geo_rows(geo_labels)
    crop_rows = build_crop_rows(crop_types, classification)
    geo_by_psa = {g["psa_label"]: g for g in geo_rows}
    crop_by_type = {c["crop_type"]: c["crop_id"] for c in crop_rows}
    crop_meta_by_type = {
        c["crop_type"]: (c["crop_group"], c["crop_subtype"], bool(c["is_aggregate"]))
        for c in crop_rows
    }

    vol_fact, vol_long = to_long(
        WIDE_VOLUME, "volume_mt", geo_by_psa, crop_by_type, crop_meta_by_type
    )
    area_fact, area_long = to_long(
        WIDE_AREA, "area_ha", geo_by_psa, crop_by_type, crop_meta_by_type
    )
    combined = combine_long(vol_long, area_long)

    # Write to a temp DB then replace, so a locked live DB does not block rebuild.
    tmp_db = DB_PATH.with_suffix(".db.tmp")
    if tmp_db.exists():
        tmp_db.unlink()

    conn = sqlite3.connect(tmp_db)
    try:
        ensure_schema(conn)
        conn.executemany(
            """
            INSERT INTO geo (geo_id, geo_name, geo_level, parent_geo_id, source_label)
            VALUES (:geo_id, :geo_name, :geo_level, :parent_geo_id, :source_label)
            """,
            geo_rows,
        )
        conn.executemany(
            """
            INSERT INTO crop (crop_id, crop_group, crop_subtype, crop_type, is_aggregate)
            VALUES (:crop_id, :crop_group, :crop_subtype, :crop_type, :is_aggregate)
            """,
            crop_rows,
        )
        conn.executemany(
            """
            INSERT INTO production (
                production_id, crop_id, geo_id, year, quarter, semester, volume_mt
            )
            VALUES (
                :id, :crop_id, :geo_id, :year, :quarter, :semester, :volume_mt
            )
            """,
            vol_fact,
        )
        conn.executemany(
            """
            INSERT INTO area_harvested (
                area_id, crop_id, geo_id, year, quarter, semester, area_ha
            )
            VALUES (
                :id, :crop_id, :geo_id, :year, :quarter, :semester, :area_ha
            )
            """,
            area_fact,
        )
        conn.executemany(
            f"""
            INSERT INTO {LONG_TABLE} (
                year, quarter, semester, crop_group, crop_subtype, is_aggregate,
                region, province, volume_mt, area_ha
            )
            VALUES (
                :year, :quarter, :semester, :crop_group, :crop_subtype, :is_aggregate,
                :region, :province, :volume_mt, :area_ha
            )
            """,
            combined,
        )
        conn.commit()
        ensure_vegetables_perf(conn, force=True)
    finally:
        conn.close()

    try:
        if DB_PATH.exists():
            DB_PATH.unlink()
        tmp_db.replace(DB_PATH)
        db_written = DB_PATH
    except PermissionError:
        # Live server may hold vegetables.db open; keep the rebuilt copy alongside.
        alt = DB_PATH.with_name("vegetables_new.db")
        if alt.exists():
            alt.unlink()
        tmp_db.replace(alt)
        print(
            f"Note: {DB_PATH.name} was locked; wrote {alt.name}. "
            "Stop the API server and rename it to vegetables.db."
        )
        db_written = alt

    written = write_final_csv(combined)
    print(f"Wrote {written}: {len(combined)} rows")
    print(f"Wrote {db_written.name}")
    if combined:
        print(
            f"Years in long file: {min(r['year'] for r in combined)}-{max(r['year'] for r in combined)}"
        )
        groups = sorted({r["crop_group"] for r in combined})
        print(f"Crop groups: {len(groups)}")
    cleanup_intermediate_csvs(keep={written, db_written.name, DB_PATH.name})


def main() -> None:
    transform()


if __name__ == "__main__":
    main()
