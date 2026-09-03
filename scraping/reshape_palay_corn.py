"""
Reshape wide OpenSTAT Palay/Corn CSVs into a combined final long CSV + SQLite DB.

Final long form (province-level, non-Total, quarter rows only):
  year, quarter, semester, crop_group, crop_subtype, is_aggregate,
  region, province, volume_mt, area_ha

Excludes period_type annual and semester. Semester is derived from quarter
(Q1–Q2 -> 1, Q3–Q4 -> 2).

Removes intermediate wide/old CSV artifacts after a successful write.
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
DB_PATH = DATA_DIR / "palay_corn.db"
FINAL_CSV = DATA_DIR / "palay_corn_long.csv"
WIDE_VOLUME = RAW_DIR / "_wide_volume.csv"
WIDE_AREA = RAW_DIR / "_wide_area.csv"

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

# Only quarter labels are kept in the final long table.
QUARTER_META = {
    "Quarter 1": 1,
    "Quarter 2": 2,
    "Quarter 3": 3,
    "Quarter 4": 4,
}

CROP_META = {
    "Irrigated Palay": ("Palay", "Irrigated", False),
    "Rainfed Palay": ("Palay", "Rainfed", False),
    "Palay": ("Palay", "Total", True),
    "White Corn": ("Corn", "White", False),
    "Yellow Corn": ("Corn", "Yellow", False),
    "Corn": ("Corn", "Total", True),
}

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
    "_wide_*.csv",
    "palay_corn_2015_2026.csv",
    "palay_corn_area_2015_2026.csv",
    "palay_corn_production_long*.csv",
    "palay_corn_area_long*.csv",
    "*.tmp.csv",
]
CLEANUP_DIRS = (RAW_DIR, DATA_DIR)


def semester_from_quarter(quarter: int) -> int:
    return 1 if quarter <= 2 else 2


def strip_psa_markup(label: str) -> str:
    name = re.sub(r"^\.+", "", label).strip()
    name = re.sub(r"\s*[a-z]/$", "", name, flags=re.I).strip()
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


def build_crop_rows() -> list[dict]:
    return [
        {
            "crop_id": i,
            "crop_group": group,
            "crop_subtype": subtype,
            "crop_type": crop_type,
            "is_aggregate": int(is_agg),
        }
        for i, (crop_type, (group, subtype, is_agg)) in enumerate(CROP_META.items(), start=1)
    ]


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
) -> tuple[list[dict], list[dict]]:
    id_cols, time_cols, wide_rows = load_wide(wide_path)
    fact_rows: list[dict] = []
    long_map: dict[tuple, dict] = {}
    row_id = 0

    for row in wide_rows:
        crop_type = row[id_cols[0]]
        psa_label = row[id_cols[1]]
        crop_id = crop_by_type[crop_type]
        geo = geo_by_psa[psa_label]
        crop_group, crop_subtype, is_agg = CROP_META[crop_type]

        for col in time_cols:
            year, period = parse_time_header(col)
            if period not in QUARTER_META:
                # Drop annual and semester period types
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
                crop_subtype != "Total"
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
        combined[k] = {**{f: row[f] for f in JOIN_KEYS}, "volume_mt": row["volume_mt"], "area_ha": None}

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
        """
        PRAGMA foreign_keys = ON;

        DROP VIEW IF EXISTS palay_corn_long;
        DROP TABLE IF EXISTS palay_corn_long;
        DROP VIEW IF EXISTS production_long;
        DROP VIEW IF EXISTS area_long;
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

        CREATE TABLE palay_corn_long (
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

        CREATE INDEX idx_production_year ON production(year);
        CREATE INDEX idx_area_year ON area_harvested(year);
        CREATE INDEX idx_long_year ON palay_corn_long(year);
        CREATE INDEX idx_long_quarter ON palay_corn_long(quarter);
        CREATE INDEX idx_long_region ON palay_corn_long(region);
        """
    )


def write_final_csv(rows: list[dict]) -> str:
    tmp = FINAL_CSV.with_suffix(".tmp.csv")
    with tmp.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FINAL_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    targets = [FINAL_CSV, DATA_DIR / "palay_corn_long_new.csv"]
    for target in targets:
        try:
            tmp.replace(target)
            if target != FINAL_CSV:
                print(f"Note: {FINAL_CSV.name} was locked; wrote {target.name}")
            return target.name
        except PermissionError:
            continue
    raise PermissionError("Could not write final long CSV")


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


def migrate_existing_long_csv() -> list[dict]:
    """Rebuild final rows from an older long CSV that still has period columns."""
    if not FINAL_CSV.exists():
        raise SystemExit(f"Missing {FINAL_CSV.name}")

    period_to_quarter = {
        "Quarter 1": 1,
        "Quarter 2": 2,
        "Quarter 3": 3,
        "Quarter 4": 4,
    }
    rows: list[dict] = []
    with FINAL_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            period = row.get("period", "")
            period_type = row.get("period_type", "")
            if period_type in ("annual", "semester") or period not in period_to_quarter:
                continue
            quarter = period_to_quarter[period]
            rows.append(
                {
                    "year": int(row["year"]),
                    "quarter": quarter,
                    "semester": semester_from_quarter(quarter),
                    "crop_group": row["crop_group"],
                    "crop_subtype": row["crop_subtype"],
                    "is_aggregate": int(float(row["is_aggregate"])),
                    "region": row["region"],
                    "province": row["province"],
                    "volume_mt": None if row.get("volume_mt") in ("", None) else float(row["volume_mt"]),
                    "area_ha": None if row.get("area_ha") in ("", None) else float(row["area_ha"]),
                }
            )
    return rows


def write_db_from_long(rows: list[dict]) -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_schema(conn)
        conn.executemany(
            """
            INSERT INTO palay_corn_long (
                year, quarter, semester, crop_group, crop_subtype, is_aggregate,
                region, province, volume_mt, area_ha
            )
            VALUES (
                :year, :quarter, :semester, :crop_group, :crop_subtype, :is_aggregate,
                :region, :province, :volume_mt, :area_ha
            )
            """,
            rows,
        )
        conn.commit()
    finally:
        conn.close()


def transform() -> None:
    if WIDE_VOLUME.exists() and WIDE_AREA.exists():
        id_cols, _, wide_rows = load_wide(WIDE_VOLUME)
        geo_labels: list[str] = []
        seen: set[str] = set()
        for row in wide_rows:
            label = row[id_cols[1]]
            if label not in seen:
                seen.add(label)
                geo_labels.append(label)

        geo_rows = build_geo_rows(geo_labels)
        crop_rows = build_crop_rows()
        geo_by_psa = {g["psa_label"]: g for g in geo_rows}
        crop_by_type = {c["crop_type"]: c["crop_id"] for c in crop_rows}

        vol_fact, vol_long = to_long(WIDE_VOLUME, "volume_mt", geo_by_psa, crop_by_type)
        area_fact, area_long = to_long(WIDE_AREA, "area_ha", geo_by_psa, crop_by_type)
        combined = combine_long(vol_long, area_long)

        if DB_PATH.exists():
            DB_PATH.unlink()

        conn = sqlite3.connect(DB_PATH)
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
                """
                INSERT INTO palay_corn_long (
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
        finally:
            conn.close()
    else:
        print("Wide CSVs not found; migrating existing long CSV…")
        combined = migrate_existing_long_csv()
        write_db_from_long(combined)

    written = write_final_csv(combined)
    print(f"Wrote {written}: {len(combined)} rows")
    print(f"Wrote {DB_PATH.name}")
    if combined:
        print(
            f"Years in long file: {min(r['year'] for r in combined)}-{max(r['year'] for r in combined)}"
        )
    cleanup_intermediate_csvs(keep={written, DB_PATH.name})


def main() -> None:
    transform()


if __name__ == "__main__":
    main()
