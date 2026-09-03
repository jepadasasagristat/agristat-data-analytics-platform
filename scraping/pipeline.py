"""Run the full PSA -> SQLite/CSV refresh pipeline."""

from __future__ import annotations

import json
import threading
import traceback
from datetime import datetime, timezone

try:
    from .paths import DATA_DIR, ensure_data_dirs
except ImportError:
    from paths import DATA_DIR, ensure_data_dirs

ensure_data_dirs()
STATUS_PATH = DATA_DIR / "data_status.json"

_lock = threading.Lock()
_state: dict = {
    "status": "idle",
    "last_success": None,
    "last_error": None,
    "last_started": None,
    "message": "Not refreshed yet",
}


def get_refresh_state() -> dict:
    return dict(_state)


def _write_status() -> None:
    STATUS_PATH.write_text(json.dumps(_state, indent=2), encoding="utf-8")


def refresh_from_psa(*, force: bool = True) -> dict:
    """
    Fetch latest Palay/Corn volume + area from PSA OpenSTAT and reshape
    into palay_corn.db / palay_corn_long.csv.
    """
    if not _lock.acquire(blocking=False):
        return {**_state, "message": "Refresh already in progress"}

    try:
        _state.update(
            {
                "status": "running",
                "last_started": datetime.now(timezone.utc).isoformat(),
                "last_error": None,
                "message": "Fetching from PSA OpenSTAT…",
            }
        )
        _write_status()

        try:
            from . import fetch_palay_corn as fetch
            from . import reshape_palay_corn as reshape
        except ImportError:
            import fetch_palay_corn as fetch
            import reshape_palay_corn as reshape

        # Keep end year current so new PSA releases appear automatically
        fetch.YEAR_TO = max(fetch.YEAR_TO, datetime.now().year)

        fetch.main()
        _state["message"] = "Reshaping and combining datasets…"
        _write_status()
        reshape.transform()

        _state.update(
            {
                "status": "ok",
                "last_success": datetime.now(timezone.utc).isoformat(),
                "message": "Data refreshed from PSA OpenSTAT",
            }
        )
        _write_status()
        return dict(_state)
    except Exception as exc:
        _state.update(
            {
                "status": "error",
                "last_error": str(exc),
                "message": "Refresh failed",
                "traceback": traceback.format_exc(),
            }
        )
        _write_status()
        raise
    finally:
        _lock.release()


def bootstrap_db_from_csv_if_needed() -> bool:
    """Create SQLite from existing final CSV so the dashboard can start instantly."""
    import csv
    import sqlite3

    try:
        from .reshape_palay_corn import DB_PATH, FINAL_CSV, FINAL_FIELDS, ensure_schema
    except ImportError:
        from reshape_palay_corn import DB_PATH, FINAL_CSV, FINAL_FIELDS, ensure_schema

    if DB_PATH.exists():
        return False
    if not FINAL_CSV.exists():
        return False

    rows = []
    with FINAL_CSV.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        if "quarter" not in fields:
            return False
        for row in reader:
            rows.append(
                {
                    **row,
                    "year": int(row["year"]),
                    "quarter": int(row["quarter"]),
                    "semester": int(row["semester"]),
                    "is_aggregate": int(float(row["is_aggregate"])),
                    "volume_mt": None if row["volume_mt"] in ("", None) else float(row["volume_mt"]),
                    "area_ha": None if row["area_ha"] in ("", None) else float(row["area_ha"]),
                }
            )

    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_schema(conn)
        conn.executemany(
            f"""
            INSERT INTO palay_corn_long ({", ".join(FINAL_FIELDS)})
            VALUES ({", ".join(":" + f for f in FINAL_FIELDS)})
            """,
            rows,
        )
        conn.commit()
    finally:
        conn.close()

    _state.update(
        {
            "status": "ok",
            "message": "Bootstrapped from local CSV; scheduled PSA refresh still active",
            "last_success": datetime.now(timezone.utc).isoformat(),
        }
    )
    _write_status()
    return True


def refresh_in_background() -> dict:
    if _state.get("status") == "running":
        return get_refresh_state()

    def _run() -> None:
        try:
            refresh_from_psa()
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True, name="psa-refresh").start()
    return {
        **get_refresh_state(),
        "status": "running",
        "message": "Refresh started in background",
    }
