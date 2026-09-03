"""Shared paths for PSA scraping scripts and outputs."""

from __future__ import annotations

from pathlib import Path

SCRAPING_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRAPING_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"


def ensure_data_dirs() -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        RAW_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        # Vercel (and similar) filesystems are read-only except /tmp.
        return
