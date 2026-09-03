"""Prepare SQLite databases for Vercel deployment."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def build_palay_corn() -> None:
    db = DATA / "palay_corn.db"
    csv = DATA / "palay_corn_long.csv"
    if db.exists():
        print(f"Found {db.name}")
        return
    if not csv.exists():
        print(f"Skip {db.name}: {csv.name} not found")
        return
    print(f"Building {db.name} from {csv.name}…")
    from scraping.reshape_palay_corn import transform

    transform()


def build_fruits() -> None:
    db = DATA / "fruits.db"
    csv = DATA / "fruits_long.csv"
    if db.exists():
        print(f"Found {db.name}")
        return
    if not csv.exists():
        print(f"Skip {db.name}: {csv.name} not found")
        return
    print(f"Building {db.name} from {csv.name}…")
    from scraping.reshape_fruits import transform

    transform()


def build_vegetables() -> None:
    db = DATA / "vegetables.db"
    csv = DATA / "vegetables_long.csv"
    if db.exists():
        print(f"Found {db.name}")
        return
    if not csv.exists():
        print(f"Skip {db.name}: {csv.name} not found")
        return
    print(f"Building {db.name} from {csv.name}…")
    from scraping.reshape_vegetables import transform

    transform()


def main() -> int:
    sys.path.insert(0, str(ROOT))
    build_palay_corn()
    build_fruits()
    build_vegetables()
    print("Vercel build data step complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
