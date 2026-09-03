"""
Palay & Corn Live Dashboard — FastAPI backend.

- Serves analytics APIs from SQLite refreshed via PSA OpenSTAT
- Schedules automatic data refresh (default: weekly)
- Optional manual refresh endpoint (no manual data entry)
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from scraping import pipeline
from scraping.reshape_palay_corn import DB_PATH as PALAY_CORN_DB, FINAL_CSV
from scraping.reshape_fruits import DB_PATH as FRUITS_DB, ensure_fruits_perf
from scraping.reshape_vegetables import DB_PATH as VEGETABLES_DB, ensure_vegetables_perf

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
IS_SERVERLESS = os.getenv("VERCEL") == "1"

DATASETS: dict[str, dict[str, Any]] = {
    "palay_corn": {
        "db_path": PALAY_CORN_DB,
        "table": "palay_corn_long",
        "label": "Palay & Corn",
    },
    "fruits": {
        "db_path": FRUITS_DB,
        "table": "fruits_long",
        "label": "Fruit Crops",
        "annual_table": "fruits_annual",
        "dim_prefix": "fruits_dim",
        "priority_crop_top_n": 3,
        "ensure_perf": ensure_fruits_perf,
    },
    "vegetables": {
        "db_path": VEGETABLES_DB,
        "table": "vegetables_long",
        "label": "Vegetables and Root Crops",
        "annual_table": "vegetables_annual",
        "dim_prefix": "vegetables_dim",
        "priority_crop_top_n": 3,
        "ensure_perf": ensure_vegetables_perf,
    },
}

# Backward-compatible alias used by health / bootstrap messaging
DB_PATH = PALAY_CORN_DB

app = FastAPI(title="AgriStat Data Analytics Platform", version="1.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

scheduler: BackgroundScheduler | None = None
if not IS_SERVERLESS:
    scheduler = BackgroundScheduler()


def _is_sqlite_file(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 100:
        return False
    try:
        with path.open("rb") as fh:
            return fh.read(16).startswith(b"SQLite format 3")
    except OSError:
        return False


def resolve_dataset(dataset: Optional[str]) -> dict[str, Any]:
    key = (dataset or "palay_corn").strip().lower()
    if key not in DATASETS:
        raise HTTPException(status_code=400, detail=f"Unknown dataset: {dataset}")
    cfg = DATASETS[key]
    db_path = Path(cfg["db_path"])
    if not _is_sqlite_file(db_path):
        raise HTTPException(
            status_code=503,
            detail=f"Dataset '{key}' is not ready yet.",
        )
    return {"key": key, **cfg}


class RefreshResponse(BaseModel):
    status: str
    message: str
    last_success: Optional[str] = None
    last_error: Optional[str] = None
    last_started: Optional[str] = None


@contextmanager
def db(dataset: str = "palay_corn") -> Iterator[sqlite3.Connection]:
    cfg = resolve_dataset(dataset)
    db_path = Path(cfg["db_path"])
    if IS_SERVERLESS:
        conn = sqlite3.connect(
            f"file:{db_path.as_posix()}?mode=ro&immutable=1",
            uri=True,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only=ON")
    else:
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA temp_store=MEMORY")
        conn.execute("PRAGMA cache_size=-64000")
        conn.execute("PRAGMA mmap_size=268435456")
    try:
        yield conn
    finally:
        conn.close()


def _agg_table(
    cfg: dict[str, Any],
    *,
    quarter: Optional[list[int]] = None,
    semester: Optional[list[int]] = None,
) -> str:
    """Prefer annual rollup when quarter/semester filters are inactive."""
    annual = cfg.get("annual_table")
    if annual and not quarter and not semester:
        return annual
    return cfg["table"]


def _ensure_perf_tables() -> None:
    for cfg in DATASETS.values():
        ensure_perf = cfg.get("ensure_perf")
        db_path = Path(cfg["db_path"])
        if not ensure_perf or not db_path.exists():
            continue
        try:
            conn = sqlite3.connect(db_path)
            try:
                ensure_perf(conn)
            finally:
                conn.close()
        except sqlite3.Error:
            pass


def _ensure_dataset() -> None:
    if _is_sqlite_file(DB_PATH):
        pipeline._state.update(
            {
                "status": "ok",
                "message": "Using existing local dataset",
                "last_success": datetime.utcfromtimestamp(DB_PATH.stat().st_mtime).isoformat() + "Z",
            }
        )
        return

    if IS_SERVERLESS:
        pipeline._state.update(
            {
                "status": "error",
                "message": "Dataset missing in deployment bundle. Run scripts/vercel_build.py during build.",
            }
        )
        return

    # Prefer instant bootstrap from CSV if present; otherwise pull from PSA
    if pipeline.bootstrap_db_from_csv_if_needed():
        return

    pipeline.refresh_in_background()


def _scheduled_refresh() -> None:
    try:
        pipeline.refresh_from_psa()
    except Exception:
        pass


@app.on_event("startup")
def on_startup() -> None:
    try:
        _ensure_dataset()
        if not IS_SERVERLESS:
            _ensure_perf_tables()
            if scheduler is not None and not scheduler.running:
                scheduler.add_job(
                    _scheduled_refresh,
                    trigger="cron",
                    day_of_week="mon",
                    hour=2,
                    minute=0,
                    id="psa_weekly_refresh",
                    replace_existing=True,
                )
                scheduler.start()
    except Exception:
        # Never crash the function on boot; serve a degraded health response instead.
        pass


@app.on_event("shutdown")
def on_shutdown() -> None:
    if scheduler is not None and scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "db_exists": _is_sqlite_file(PALAY_CORN_DB),
        "datasets": {
            key: {
                "ready": _is_sqlite_file(Path(cfg["db_path"])),
                "label": cfg["label"],
            }
            for key, cfg in DATASETS.items()
        },
        "refresh": pipeline.get_refresh_state(),
    }


@app.get("/api/refresh/status", response_model=RefreshResponse)
def refresh_status() -> dict:
    return pipeline.get_refresh_state()


@app.post("/api/refresh", response_model=RefreshResponse)
def refresh_now() -> dict:
    """Kick off a background PSA OpenSTAT pull + reshape (no manual upload)."""
    if IS_SERVERLESS:
        raise HTTPException(
            status_code=501,
            detail="PSA refresh is disabled on Vercel. Update data locally and redeploy.",
        )
    return pipeline.refresh_in_background()


@app.get("/api/meta")
def meta(dataset: str = Query("palay_corn")) -> dict[str, Any]:
    cfg = resolve_dataset(dataset)
    table = cfg["table"]
    with db(dataset) as conn:
        dim_prefix = cfg.get("dim_prefix")
        annual_table = cfg.get("annual_table")
        use_dims = bool(
            dim_prefix
            and annual_table
            and conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (f"{dim_prefix}_year",),
            ).fetchone()
        )
        if use_dims:
            years = [
                r[0]
                for r in conn.execute(f"SELECT value FROM {dim_prefix}_year ORDER BY value")
            ]
            regions = [
                r[0]
                for r in conn.execute(f"SELECT value FROM {dim_prefix}_region ORDER BY value")
            ]
            provinces = [
                {"region": r["region"], "province": r["province"]}
                for r in conn.execute(
                    f"SELECT region, province FROM {dim_prefix}_province "
                    "ORDER BY region, province"
                )
            ]
            crops = [
                {"crop_group": r["crop_group"], "crop_subtype": r["crop_subtype"]}
                for r in conn.execute(
                    f"SELECT crop_group, crop_subtype FROM {dim_prefix}_crop "
                    "ORDER BY crop_group, crop_subtype"
                )
            ]
            crop_groups = sorted({c["crop_group"] for c in crops})
            quarters = [
                r[0]
                for r in conn.execute(f"SELECT value FROM {dim_prefix}_quarter ORDER BY value")
            ]
            semesters = [
                r[0]
                for r in conn.execute(f"SELECT value FROM {dim_prefix}_semester ORDER BY value")
            ]
            totals = conn.execute(
                f"""
                SELECT COUNT(*) AS rows,
                       MIN(year) AS year_min,
                       MAX(year) AS year_max,
                       SUM(volume_mt) AS volume_sum,
                       SUM(area_ha) AS area_sum
                FROM {annual_table}
                """
            ).fetchone()
            totals = dict(totals)
            totals["rows"] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        else:
            years = [r[0] for r in conn.execute(f"SELECT DISTINCT year FROM {table} ORDER BY year")]
            regions = [
                r[0] for r in conn.execute(f"SELECT DISTINCT region FROM {table} ORDER BY region")
            ]
            provinces = [
                {"region": r["region"], "province": r["province"]}
                for r in conn.execute(
                    f"SELECT DISTINCT region, province FROM {table} ORDER BY region, province"
                )
            ]
            crops = [
                {"crop_group": r["crop_group"], "crop_subtype": r["crop_subtype"]}
                for r in conn.execute(
                    f"SELECT DISTINCT crop_group, crop_subtype FROM {table} "
                    "ORDER BY crop_group, crop_subtype"
                )
            ]
            crop_groups = sorted({c["crop_group"] for c in crops})
            quarters = [
                r[0] for r in conn.execute(f"SELECT DISTINCT quarter FROM {table} ORDER BY quarter")
            ]
            semesters = [
                r[0]
                for r in conn.execute(f"SELECT DISTINCT semester FROM {table} ORDER BY semester")
            ]
            totals = conn.execute(
                f"""
                SELECT COUNT(*) AS rows,
                       MIN(year) AS year_min,
                       MAX(year) AS year_max,
                       SUM(volume_mt) AS volume_sum,
                       SUM(area_ha) AS area_sum
                FROM {table}
                """
            ).fetchone()

    return {
        "dataset": cfg["key"],
        "years": years,
        "regions": regions,
        "provinces": provinces,
        "crops": crops,
        "crop_groups": crop_groups,
        "quarters": quarters,
        "semesters": semesters,
        "summary": dict(totals) if totals else {},
        "refresh": pipeline.get_refresh_state(),
        "source": "Philippine Statistics Authority (OpenSTAT)",
    }


def _filters_sql(
    *,
    year_from: Optional[int],
    year_to: Optional[int],
    region: Optional[list[str]],
    province: Optional[list[str]],
    crop_group: Optional[list[str]],
    crop_subtype: Optional[list[str]],
    quarter: Optional[list[int]],
    semester: Optional[list[int]],
) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    if year_from is not None:
        clauses.append("year >= ?")
        params.append(year_from)
    if year_to is not None:
        clauses.append("year <= ?")
        params.append(year_to)
    if region:
        clauses.append(f"region IN ({','.join('?' for _ in region)})")
        params.extend(region)
    if province:
        clauses.append(f"province IN ({','.join('?' for _ in province)})")
        params.extend(province)
    if crop_group:
        clauses.append(f"crop_group IN ({','.join('?' for _ in crop_group)})")
        params.extend(crop_group)
    if crop_subtype:
        clauses.append(f"crop_subtype IN ({','.join('?' for _ in crop_subtype)})")
        params.extend(crop_subtype)
    if quarter:
        clauses.append(f"quarter IN ({','.join('?' for _ in quarter)})")
        params.extend(quarter)
    if semester:
        clauses.append(f"semester IN ({','.join('?' for _ in semester)})")
        params.extend(semester)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


@app.get("/api/series")
def series(
    dataset: str = Query("palay_corn"),
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    region: Optional[list[str]] = Query(None),
    province: Optional[list[str]] = Query(None),
    crop_group: Optional[list[str]] = Query(None),
    crop_subtype: Optional[list[str]] = Query(None),
    quarter: Optional[list[int]] = Query(None),
    semester: Optional[list[int]] = Query(None),
) -> dict[str, Any]:
    """Filtered time series for charts (sums selected quarters by year)."""
    cfg = resolve_dataset(dataset)
    table = _agg_table(cfg, quarter=quarter, semester=semester)
    where, params = _filters_sql(
        year_from=year_from,
        year_to=year_to,
        region=region,
        province=province,
        crop_group=crop_group,
        crop_subtype=crop_subtype,
        quarter=quarter if table == cfg["table"] else None,
        semester=semester if table == cfg["table"] else None,
    )
    sql = f"""
        SELECT year,
               SUM(volume_mt) AS volume_mt,
               SUM(area_ha) AS area_ha,
               CASE WHEN SUM(area_ha) > 0 THEN SUM(volume_mt) / SUM(area_ha) END AS yield_mt_ha
        FROM {table}
        {where}
        GROUP BY year
        ORDER BY year
    """
    with db(dataset) as conn:
        rows = [dict(r) for r in conn.execute(sql, params)]
    return {"quarter": quarter, "semester": semester, "points": rows}


@app.get("/api/series-by-ecosystem")
def series_by_ecosystem(
    dataset: str = Query("palay_corn"),
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    region: Optional[list[str]] = Query(None),
    province: Optional[list[str]] = Query(None),
    crop_group: Optional[list[str]] = Query(None),
    crop_subtype: Optional[list[str]] = Query(None),
    quarter: Optional[list[int]] = Query(None),
    semester: Optional[list[int]] = Query(None),
    split_by: str = Query("crop_subtype"),
) -> dict[str, Any]:
    """Annual time series split by subtype or crop group."""
    cfg = resolve_dataset(dataset)
    table = _agg_table(cfg, quarter=quarter, semester=semester)
    dim = "crop_group" if split_by == "crop_group" else "crop_subtype"
    where, params = _filters_sql(
        year_from=year_from,
        year_to=year_to,
        region=region,
        province=province,
        crop_group=crop_group,
        crop_subtype=crop_subtype,
        quarter=quarter if table == cfg["table"] else None,
        semester=semester if table == cfg["table"] else None,
    )
    sql = f"""
        SELECT year,
               {dim} AS crop_subtype,
               SUM(volume_mt) AS volume_mt,
               SUM(area_ha) AS area_ha,
               CASE WHEN SUM(area_ha) > 0 THEN SUM(volume_mt) / SUM(area_ha) END AS yield_mt_ha
        FROM {table}
        {where}
        GROUP BY year, {dim}
        ORDER BY year, {dim}
    """
    with db(dataset) as conn:
        rows = [dict(r) for r in conn.execute(sql, params)]
    return {"points": rows, "split_by": dim}


@app.get("/api/series-by-region")
def series_by_region(
    dataset: str = Query("palay_corn"),
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    region: Optional[list[str]] = Query(None),
    province: Optional[list[str]] = Query(None),
    crop_group: Optional[list[str]] = Query(None),
    crop_subtype: Optional[list[str]] = Query(None),
    quarter: Optional[list[int]] = Query(None),
    semester: Optional[list[int]] = Query(None),
) -> dict[str, Any]:
    """Annual time series split by region."""
    cfg = resolve_dataset(dataset)
    table = _agg_table(cfg, quarter=quarter, semester=semester)
    where, params = _filters_sql(
        year_from=year_from,
        year_to=year_to,
        region=region,
        province=province,
        crop_group=crop_group,
        crop_subtype=crop_subtype,
        quarter=quarter if table == cfg["table"] else None,
        semester=semester if table == cfg["table"] else None,
    )
    sql = f"""
        SELECT year,
               region,
               SUM(volume_mt) AS volume_mt,
               SUM(area_ha) AS area_ha,
               CASE WHEN SUM(area_ha) > 0 THEN SUM(volume_mt) / SUM(area_ha) END AS yield_mt_ha
        FROM {table}
        {where}
        GROUP BY year, region
        ORDER BY year, region
    """
    with db(dataset) as conn:
        rows = [dict(r) for r in conn.execute(sql, params)]
    return {"points": rows}


@app.get("/api/series-by-province")
def series_by_province(
    dataset: str = Query("palay_corn"),
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    region: Optional[list[str]] = Query(None),
    province: Optional[list[str]] = Query(None),
    crop_group: Optional[list[str]] = Query(None),
    crop_subtype: Optional[list[str]] = Query(None),
    quarter: Optional[list[int]] = Query(None),
    semester: Optional[list[int]] = Query(None),
) -> dict[str, Any]:
    """Annual production volume split by province."""
    cfg = resolve_dataset(dataset)
    table = _agg_table(cfg, quarter=quarter, semester=semester)
    where, params = _filters_sql(
        year_from=year_from,
        year_to=year_to,
        region=region,
        province=province,
        crop_group=crop_group,
        crop_subtype=crop_subtype,
        quarter=quarter if table == cfg["table"] else None,
        semester=semester if table == cfg["table"] else None,
    )
    sql = f"""
        SELECT year,
               region,
               province,
               SUM(volume_mt) AS volume_mt
        FROM {table}
        {where}
        GROUP BY year, region, province
        ORDER BY year, region, province
    """
    with db(dataset) as conn:
        rows = [dict(r) for r in conn.execute(sql, params)]
    return {"points": rows}


@app.get("/api/by-region-ecosystem")
def by_region_ecosystem(
    dataset: str = Query("palay_corn"),
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    region: Optional[list[str]] = Query(None),
    province: Optional[list[str]] = Query(None),
    crop_group: Optional[list[str]] = Query(None),
    crop_subtype: Optional[list[str]] = Query(None),
    quarter: Optional[list[int]] = Query(None),
    semester: Optional[list[int]] = Query(None),
    split_by: str = Query("crop_subtype"),
) -> dict[str, Any]:
    """Region × subtype/crop aggregates for volume, area, and yield."""
    cfg = resolve_dataset(dataset)
    table = _agg_table(cfg, quarter=quarter, semester=semester)
    dim = "crop_group" if split_by == "crop_group" else "crop_subtype"
    where, params = _filters_sql(
        year_from=year_from,
        year_to=year_to,
        region=region,
        province=province,
        crop_group=crop_group,
        crop_subtype=crop_subtype,
        quarter=quarter if table == cfg["table"] else None,
        semester=semester if table == cfg["table"] else None,
    )
    sql = f"""
        SELECT region,
               {dim} AS crop_subtype,
               SUM(volume_mt) AS volume_mt,
               SUM(area_ha) AS area_ha,
               CASE WHEN SUM(area_ha) > 0 THEN SUM(volume_mt) / SUM(area_ha) END AS yield_mt_ha
        FROM {table}
        {where}
        GROUP BY region, {dim}
        ORDER BY region, {dim}
    """
    with db(dataset) as conn:
        rows = [dict(r) for r in conn.execute(sql, params)]
    return {"rows": rows, "split_by": dim}


@app.get("/api/by-region")
def by_region(
    dataset: str = Query("palay_corn"),
    year: Optional[int] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    crop_group: Optional[list[str]] = Query(None),
    crop_subtype: Optional[list[str]] = Query(None),
    quarter: Optional[list[int]] = Query(None),
    semester: Optional[list[int]] = Query(None),
) -> dict[str, Any]:
    cfg = resolve_dataset(dataset)
    if year is not None:
        year_from = year
        year_to = year
    table = _agg_table(cfg, quarter=quarter, semester=semester)
    where, params = _filters_sql(
        year_from=year_from,
        year_to=year_to,
        region=None,
        province=None,
        crop_group=crop_group,
        crop_subtype=crop_subtype,
        quarter=quarter if table == cfg["table"] else None,
        semester=semester if table == cfg["table"] else None,
    )
    sql = f"""
        SELECT region,
               SUM(volume_mt) AS volume_mt,
               SUM(area_ha) AS area_ha,
               CASE WHEN SUM(area_ha) > 0 THEN SUM(volume_mt) / SUM(area_ha) END AS yield_mt_ha
        FROM {table}
        {where}
        GROUP BY region
        ORDER BY volume_mt DESC
    """
    with db(dataset) as conn:
        rows = [dict(r) for r in conn.execute(sql, params)]
    return {"quarter": quarter, "semester": semester, "rows": rows}


@app.get("/api/by-province")
def by_province(
    dataset: str = Query("palay_corn"),
    year: Optional[int] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    region: Optional[list[str]] = Query(None),
    province: Optional[list[str]] = Query(None),
    crop_group: Optional[list[str]] = Query(None),
    crop_subtype: Optional[list[str]] = Query(None),
    quarter: Optional[list[int]] = Query(None),
    semester: Optional[list[int]] = Query(None),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    cfg = resolve_dataset(dataset)
    if year is not None:
        year_from = year
        year_to = year
    table = _agg_table(cfg, quarter=quarter, semester=semester)
    where, params = _filters_sql(
        year_from=year_from,
        year_to=year_to,
        region=region,
        province=province,
        crop_group=crop_group,
        crop_subtype=crop_subtype,
        quarter=quarter if table == cfg["table"] else None,
        semester=semester if table == cfg["table"] else None,
    )
    sql = f"""
        SELECT region, province,
               SUM(volume_mt) AS volume_mt,
               SUM(area_ha) AS area_ha,
               CASE WHEN SUM(area_ha) > 0 THEN SUM(volume_mt) / SUM(area_ha) END AS yield_mt_ha
        FROM {table}
        {where}
        GROUP BY region, province
        ORDER BY volume_mt DESC
        LIMIT ?
    """
    with db(dataset) as conn:
        rows = [dict(r) for r in conn.execute(sql, [*params, limit])]
    return {"quarter": quarter, "semester": semester, "rows": rows}


@app.get("/api/kpis")
def kpis(
    dataset: str = Query("palay_corn"),
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    year: Optional[int] = None,
    region: Optional[list[str]] = Query(None),
    province: Optional[list[str]] = Query(None),
    crop_group: Optional[list[str]] = Query(None),
    crop_subtype: Optional[list[str]] = Query(None),
    quarter: Optional[list[int]] = Query(None),
    semester: Optional[list[int]] = Query(None),
) -> dict[str, Any]:
    """Scorecard averages = period totals ÷ number of selected years."""
    cfg = resolve_dataset(dataset)
    table = _agg_table(cfg, quarter=quarter, semester=semester)
    q_filter = quarter if table == cfg["table"] else None
    s_filter = semester if table == cfg["table"] else None

    with db(dataset) as conn:
        bounds = conn.execute(
            f"SELECT MIN(year) AS y_min, MAX(year) AS y_max FROM {table}"
        ).fetchone()
        y_min = int(bounds["y_min"]) if bounds and bounds["y_min"] is not None else 1990
        y_max = int(bounds["y_max"]) if bounds and bounds["y_max"] is not None else 2026
        compare_to = y_max
        compare_from = max(y_min, compare_to - 1)

        if year is not None and year_from is None and year_to is None:
            year_from = year
            year_to = year
        if year_from is None:
            year_from = y_min
        if year_to is None:
            year_to = y_max
        if year_from > year_to:
            year_from, year_to = year_to, year_from

        year_count = year_to - year_from + 1

        def _avgs_from_sums(
            volume_sum: Optional[float], area_sum: Optional[float], n_years: int
        ) -> dict[str, Any]:
            denom = n_years if n_years > 0 else None
            volume_avg = (volume_sum / denom) if volume_sum is not None and denom else None
            area_avg = (area_sum / denom) if area_sum is not None and denom else None
            yield_mt_ha = (
                (volume_avg / area_avg)
                if volume_avg is not None and area_avg not in (None, 0)
                else None
            )
            return {
                "volume_mt_avg": volume_avg,
                "area_ha_avg": area_avg,
                "yield_mt_ha": yield_mt_ha,
                "years_with_data": n_years,
            }

        def _period_year_avgs(
            yf: int,
            yt: int,
            n_years: int,
            *,
            subtypes: Optional[list[str]] = None,
            groups: Optional[list[str]] = None,
        ) -> dict[str, Any]:
            where, params = _filters_sql(
                year_from=yf,
                year_to=yt,
                region=region,
                province=province,
                crop_group=groups if groups is not None else crop_group,
                crop_subtype=subtypes if subtypes is not None else crop_subtype,
                quarter=q_filter,
                semester=s_filter,
            )
            row = conn.execute(
                f"""
                SELECT SUM(volume_mt) AS volume_sum,
                       SUM(area_ha) AS area_sum
                FROM {table}
                {where}
                """,
                params,
            ).fetchone()
            volume_sum = row["volume_sum"] if row else None
            area_sum = row["area_sum"] if row else None
            return _avgs_from_sums(volume_sum, area_sum, n_years)

        def _total_volume(y: int) -> Optional[float]:
            where, params = _filters_sql(
                year_from=y,
                year_to=y,
                region=region,
                province=province,
                crop_group=crop_group,
                crop_subtype=crop_subtype,
                quarter=q_filter,
                semester=s_filter,
            )
            row = conn.execute(
                f"SELECT SUM(volume_mt) AS volume_mt FROM {table} {where}",
                params,
            ).fetchone()
            return row["volume_mt"] if row else None

        by_priority_crop: list[dict[str, Any]] = []
        priority_top_n = cfg.get("priority_crop_top_n")
        priority = list(cfg.get("priority_crops") or [])

        if priority_top_n or priority:
            where, params = _filters_sql(
                year_from=year_from,
                year_to=year_to,
                region=region,
                province=province,
                crop_group=crop_group,
                crop_subtype=crop_subtype,
                quarter=q_filter,
                semester=s_filter,
            )
            by_group = {
                r["crop_group"]: dict(r)
                for r in conn.execute(
                    f"""
                    SELECT crop_group,
                           SUM(volume_mt) AS volume_sum,
                           SUM(area_ha) AS area_sum
                    FROM {table}
                    {where}
                    GROUP BY crop_group
                    ORDER BY SUM(volume_mt) IS NULL, SUM(volume_mt) DESC, crop_group
                    """,
                    params,
                )
            }
            if by_group:
                volume_sum = sum((r["volume_sum"] or 0) for r in by_group.values())
                area_sum = sum((r["area_sum"] or 0) for r in by_group.values())
            else:
                volume_sum = None
                area_sum = None
            current = _avgs_from_sums(volume_sum, area_sum, year_count)

            ranked = list(by_group.keys())
            if priority_top_n:
                priority = ranked[: int(priority_top_n)]
            subtype_pair = (ranked + list(priority)[:2])[:2]
            while len(subtype_pair) < 2:
                subtype_pair.append("—")

            def _group_avgs(group_name: str) -> dict[str, Any]:
                if not group_name or group_name == "—":
                    return _avgs_from_sums(None, None, year_count)
                row = by_group.get(group_name)
                return _avgs_from_sums(
                    row["volume_sum"] if row else None,
                    row["area_sum"] if row else None,
                    year_count,
                )

            subtype_a = _group_avgs(subtype_pair[0])
            subtype_b = _group_avgs(subtype_pair[1])

            missing = [c for c in priority if c not in by_group]
            priority_map = {k: by_group[k] for k in priority if k in by_group}
            if missing and not priority_top_n:
                p_where, p_params = _filters_sql(
                    year_from=year_from,
                    year_to=year_to,
                    region=region,
                    province=province,
                    crop_group=list(priority),
                    crop_subtype=[],
                    quarter=q_filter,
                    semester=s_filter,
                )
                for r in conn.execute(
                    f"""
                    SELECT crop_group,
                           SUM(volume_mt) AS volume_sum,
                           SUM(area_ha) AS area_sum
                    FROM {table}
                    {p_where}
                    GROUP BY crop_group
                    """,
                    p_params,
                ):
                    priority_map[r["crop_group"]] = dict(r)

            # Share denominator: filtered view uses selected crops; otherwise all crops.
            crop_filter_active = bool(crop_group) or bool(crop_subtype)
            if crop_filter_active:
                share_denominator = volume_sum
            else:
                all_where, all_params = _filters_sql(
                    year_from=year_from,
                    year_to=year_to,
                    region=region,
                    province=province,
                    crop_group=None,
                    crop_subtype=[],
                    quarter=q_filter,
                    semester=s_filter,
                )
                all_row = conn.execute(
                    f"SELECT SUM(volume_mt) AS volume_sum FROM {table} {all_where}",
                    all_params,
                ).fetchone()
                share_denominator = all_row["volume_sum"] if all_row else None

            for crop_name in priority:
                row = priority_map.get(crop_name)
                av = _avgs_from_sums(
                    row["volume_sum"] if row else None,
                    row["area_sum"] if row else None,
                    year_count,
                )
                crop_sum = row["volume_sum"] if row else None
                share_pct = None
                if (
                    crop_sum is not None
                    and share_denominator is not None
                    and share_denominator != 0
                ):
                    share_pct = (crop_sum / share_denominator) * 100.0
                by_priority_crop.append(
                    {
                        "crop_group": crop_name,
                        "volume_mt_avg": av["volume_mt_avg"],
                        "share_pct": share_pct,
                    }
                )
        else:
            current = _period_year_avgs(year_from, year_to, year_count)
            primary_group = (crop_group[0] if crop_group else None) or "Palay"
            subtype_defaults = {
                "Palay": ["Irrigated", "Rainfed"],
                "Corn": ["Yellow", "White"],
            }
            defaults = list(
                subtype_defaults.get(primary_group, subtype_defaults["Palay"])
            )
            subtype_pair = defaults[:]
            if crop_subtype:
                requested = [s for s in defaults if s in crop_subtype]
                extras = [s for s in crop_subtype if s not in requested]
                ordered = requested + extras
                for name in defaults:
                    if name not in ordered:
                        ordered.append(name)
                subtype_pair = ordered[:2] or defaults[:]
            # KPI cards always expect a pair; pad from defaults if needed.
            while len(subtype_pair) < 2:
                fallback = defaults[len(subtype_pair)] if len(subtype_pair) < len(defaults) else "—"
                subtype_pair.append(fallback)

            empty_avgs = _avgs_from_sums(None, None, year_count)
            subtype_a = (
                _period_year_avgs(
                    year_from,
                    year_to,
                    year_count,
                    subtypes=[subtype_pair[0]],
                    groups=[primary_group],
                )
                if subtype_pair[0] and subtype_pair[0] != "—"
                else empty_avgs
            )
            subtype_b = (
                _period_year_avgs(
                    year_from,
                    year_to,
                    year_count,
                    subtypes=[subtype_pair[1]],
                    groups=[primary_group],
                )
                if subtype_pair[1] and subtype_pair[1] != "—"
                else empty_avgs
            )

        vol_2025 = _total_volume(compare_to)
        vol_2024 = _total_volume(compare_from)

    variance = None
    growth_rate_pct = None
    if vol_2025 is not None and vol_2024 is not None:
        variance = vol_2025 - vol_2024
        if vol_2024 != 0:
            growth_rate_pct = (variance / vol_2024) * 100.0

    a_vol = subtype_a["volume_mt_avg"]
    b_vol = subtype_b["volume_mt_avg"]
    subtype_total = None
    if a_vol is not None or b_vol is not None:
        subtype_total = (a_vol or 0) + (b_vol or 0)

    def _share(part: Optional[float]) -> Optional[float]:
        if part is None or subtype_total in (None, 0):
            return None
        return part / subtype_total * 100.0

    return {
        "year_from": year_from,
        "year_to": year_to,
        "year_count": year_count,
        "years_with_data": current["years_with_data"],
        "quarter": quarter,
        "semester": semester,
        "volume_mt_avg": current["volume_mt_avg"],
        "area_ha_avg": current["area_ha_avg"],
        "yield_mt_ha": current["yield_mt_ha"],
        "by_subtype": [
            {
                "crop_subtype": subtype_pair[0],
                "volume_mt_avg": a_vol,
                "area_ha_avg": subtype_a["area_ha_avg"],
                "yield_mt_ha": subtype_a["yield_mt_ha"],
                "share_pct": _share(a_vol),
            },
            {
                "crop_subtype": subtype_pair[1],
                "volume_mt_avg": b_vol,
                "area_ha_avg": subtype_b["area_ha_avg"],
                "yield_mt_ha": subtype_b["yield_mt_ha"],
                "share_pct": _share(b_vol),
            },
        ],
        "by_priority_crop": by_priority_crop,
        "comparison": {
            "year_from": compare_from,
            "year_to": compare_to,
            "volume_mt_from": vol_2024,
            "volume_mt_to": vol_2025,
            "variance_mt": variance,
            "growth_rate_pct": growth_rate_pct,
        },
    }


LANDING_SNAPSHOTS: list[dict[str, Any]] = [
    {"id": "palay", "dataset": "palay_corn", "label": "Palay", "crop_group": "Palay"},
    {"id": "corn", "dataset": "palay_corn", "label": "Corn", "crop_group": "Corn"},
    {"id": "fruits", "dataset": "fruits", "label": "Fruit Crops", "crop_group": None},
    {"id": "vegetables", "dataset": "vegetables", "label": "Vegetables", "crop_group": None},
]

LANDING_BREAKDOWN: dict[str, dict[str, Any]] = {
    "palay": {"title": "Ecosystem", "subtypes": ("Irrigated", "Rainfed")},
    "corn": {"title": "Variety", "subtypes": ("Yellow", "White")},
}


def _volume_for_years(
    conn: sqlite3.Connection,
    table: str,
    year_from: int,
    year_to: int,
    *,
    crop_group: Optional[str] = None,
) -> Optional[float]:
    clauses = ["year >= ?", "year <= ?"]
    params: list[Any] = [year_from, year_to]
    if crop_group:
        clauses.append("crop_group = ?")
        params.append(crop_group)
    row = conn.execute(
        f"SELECT SUM(volume_mt) AS volume_mt FROM {table} WHERE {' AND '.join(clauses)}",
        params,
    ).fetchone()
    if not row or row["volume_mt"] is None:
        return None
    return float(row["volume_mt"])


def _top_crop_group(
    conn: sqlite3.Connection,
    table: str,
    year_from: int,
    year_to: int,
) -> Optional[dict[str, Any]]:
    row = conn.execute(
        f"""
        SELECT crop_group,
               SUM(volume_mt) AS volume_sum
        FROM {table}
        WHERE year >= ? AND year <= ?
        GROUP BY crop_group
        ORDER BY SUM(volume_mt) IS NULL, SUM(volume_mt) DESC, crop_group
        LIMIT 1
        """,
        (year_from, year_to),
    ).fetchone()
    return dict(row) if row else None


def _annual_volume_series(
    conn: sqlite3.Connection,
    table: str,
    year_from: int,
    year_to: int,
    *,
    crop_group: Optional[str] = None,
) -> list[dict[str, Any]]:
    clauses = ["year >= ?", "year <= ?"]
    params: list[Any] = [year_from, year_to]
    if crop_group:
        clauses.append("crop_group = ?")
        params.append(crop_group)
    rows = conn.execute(
        f"""
        SELECT year, SUM(volume_mt) AS volume_mt
        FROM {table}
        WHERE {' AND '.join(clauses)}
        GROUP BY year
        ORDER BY year
        """,
        params,
    ).fetchall()
    return [
        {
            "year": int(r["year"]),
            "volume_mt": float(r["volume_mt"]) if r["volume_mt"] is not None else None,
        }
        for r in rows
    ]


def _subtype_breakdown(
    conn: sqlite3.Connection,
    table: str,
    year_from: int,
    year_to: int,
    crop_group: str,
    subtypes: tuple[str, ...],
) -> Optional[list[dict[str, Any]]]:
    placeholders = ",".join("?" for _ in subtypes)
    year_count = year_to - year_from + 1
    rows = conn.execute(
        f"""
        SELECT crop_subtype, SUM(volume_mt) AS volume_sum
        FROM {table}
        WHERE year >= ? AND year <= ?
          AND crop_group = ?
          AND crop_subtype IN ({placeholders})
        GROUP BY crop_subtype
        """,
        [year_from, year_to, crop_group, *subtypes],
    ).fetchall()
    by_subtype = {
        r["crop_subtype"]: float(r["volume_sum"])
        for r in rows
        if r["volume_sum"] is not None
    }
    if not by_subtype:
        return None
    total = sum(by_subtype.values())
    if total <= 0:
        return None
    items: list[dict[str, Any]] = []
    for name in subtypes:
        vol_sum = by_subtype.get(name)
        if vol_sum is None:
            continue
        items.append(
            {
                "label": name,
                "volume_mt_avg": vol_sum / year_count if year_count else None,
                "share_pct": (vol_sum / total) * 100.0,
            }
        )
    return items if len(items) >= 2 else None


def _landing_snapshot_item(item: dict[str, Any]) -> dict[str, Any]:
    cfg = DATASETS.get(item["dataset"])
    if not cfg or not Path(cfg["db_path"]).exists():
        return {
            "id": item["id"],
            "label": item["label"],
            "ready": False,
        }

    table = _agg_table(cfg)
    crop_group = item.get("crop_group")
    with sqlite3.connect(cfg["db_path"]) as conn:
        conn.row_factory = sqlite3.Row
        bounds = conn.execute(
            f"SELECT MIN(year) AS y_min, MAX(year) AS y_max FROM {table}"
        ).fetchone()
        if not bounds or bounds["y_max"] is None:
            return {"id": item["id"], "label": item["label"], "ready": False}

        y_min = int(bounds["y_min"])
        y_max = int(bounds["y_max"])
        current_year = datetime.now().year
        # Prefer the latest complete year so partial current-year rows do not skew YoY.
        complete_through = y_max if y_max < current_year else max(y_min, y_max - 1)
        compare_to = complete_through
        compare_from = max(y_min, compare_to - 1)
        window_years = min(5, compare_to - y_min + 1)
        year_from = max(y_min, compare_to - window_years + 1)
        year_to = compare_to

        total_sum = _volume_for_years(conn, table, year_from, year_to, crop_group=crop_group)
        year_count = year_to - year_from + 1
        volume_avg = (total_sum / year_count) if total_sum is not None and year_count else None

        vol_to = _volume_for_years(conn, table, compare_to, compare_to, crop_group=crop_group)
        vol_from = _volume_for_years(
            conn, table, compare_from, compare_from, crop_group=crop_group
        )
        growth_rate_pct = None
        if vol_to is not None and vol_from is not None and vol_from != 0:
            growth_rate_pct = ((vol_to - vol_from) / abs(vol_from)) * 100.0

        top_crop = None
        if not crop_group:
            leader = _top_crop_group(conn, table, year_from, year_to)
            if leader and leader.get("crop_group"):
                leader_vol = leader.get("volume_sum")
                total_vol = _volume_for_years(conn, table, year_from, year_to)
                share_pct = None
                if (
                    leader_vol is not None
                    and total_vol is not None
                    and total_vol > 0
                ):
                    share_pct = (float(leader_vol) / float(total_vol)) * 100.0
                top_crop = {
                    "crop_group": leader["crop_group"],
                    "volume_sum": leader_vol,
                    "share_pct": share_pct,
                }

        spark_from = max(y_min, compare_to - 9)
        series = _annual_volume_series(
            conn, table, spark_from, compare_to, crop_group=crop_group
        )

        breakdown = None
        bd_cfg = LANDING_BREAKDOWN.get(item["id"])
        if bd_cfg and crop_group:
            bd_items = _subtype_breakdown(
                conn,
                table,
                year_from,
                year_to,
                crop_group,
                bd_cfg["subtypes"],
            )
            if bd_items:
                breakdown = {"title": bd_cfg["title"], "items": bd_items}

    return {
        "id": item["id"],
        "label": item["label"],
        "ready": True,
        "year_from": year_from,
        "year_to": year_to,
        "year_count": year_count,
        "volume_mt_avg": volume_avg,
        "comparison": {
            "year_from": compare_from,
            "year_to": compare_to,
            "volume_mt_from": vol_from,
            "volume_mt_to": vol_to,
            "growth_rate_pct": growth_rate_pct,
        },
        "top_crop": top_crop,
        "series": series,
        "breakdown": breakdown,
    }


@app.get("/api/landing/summary")
def landing_summary() -> dict[str, Any]:
    """Aggregated KPIs and freshness metadata for the platform landing page."""
    snapshots = [_landing_snapshot_item(item) for item in LANDING_SNAPSHOTS]
    year_through = max(
        (s["year_to"] for s in snapshots if s.get("ready") and s.get("year_to") is not None),
        default=None,
    )
    ready_count = sum(1 for s in snapshots if s.get("ready"))
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "year_through": year_through,
        "ready_count": ready_count,
        "snapshot_count": len(snapshots),
        "refresh": pipeline.get_refresh_state(),
        "snapshots": snapshots,
    }


# Static dashboard UI
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/")
def index() -> FileResponse:
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Platform landing page missing")
    return FileResponse(index_path)


@app.get("/dashboards/{crop}")
def crop_dashboard(crop: str) -> FileResponse:
    slug = crop.lower().strip()
    dashboard_path = STATIC_DIR / "dashboards" / f"{slug}.html"
    if not dashboard_path.exists():
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return FileResponse(dashboard_path)
