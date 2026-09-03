"""
Fetch Fruit Crops Volume of Production + Area Planted/Harvested from PSA OpenSTAT
(PXWeb API), years 2010-2026.

Writes intermediate wide CSVs under data/raw/ for reshape_fruits.py.

Run from project root:
  python -m scraping.fetch_fruits
"""

from __future__ import annotations

import csv
import io
import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path

try:
    from .paths import RAW_DIR, ensure_data_dirs
except ImportError:
    from paths import RAW_DIR, ensure_data_dirs

YEAR_FROM, YEAR_TO = 2010, 2026
# Fruit tables encode Year as 0=2010, 1=2011, ...
BASE_YEAR = 2010
# More crop series than palay/corn; one year per request avoids API 403s.
YEAR_CHUNK = 1


@dataclass(frozen=True)
class Dataset:
    name: str
    api_url: str
    out_csv: Path


def datasets() -> list[Dataset]:
    ensure_data_dirs()
    return [
        Dataset(
            name="fruit volume of production",
            api_url="https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2E/CS/0072E4EVCP2.px",
            out_csv=RAW_DIR / "_wide_fruits_volume.csv",
        ),
        Dataset(
            name="fruit area planted/harvested",
            api_url="https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2E/CS/0102E4EAHM2.px",
            out_csv=RAW_DIR / "_wide_fruits_area.csv",
        ),
    ]


def year_codes(start: int, end: int) -> list[str]:
    return [str(y - BASE_YEAR) for y in range(start, end + 1)]


def year_chunks(start: int, end: int, size: int) -> list[tuple[int, int]]:
    chunks = []
    y = start
    while y <= end:
        chunks.append((y, min(y + size - 1, end)))
        y += size
    return chunks


def fetch_metadata(api_url: str) -> dict:
    req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build_query(meta: dict, years: list[str]) -> dict:
    by_code = {v["code"]: v for v in meta["variables"]}
    return {
        "query": [
            {
                "code": "Crop",
                "selection": {
                    "filter": "item",
                    "values": by_code["Crop"]["values"],
                },
            },
            {
                "code": "Geolocation",
                "selection": {
                    "filter": "item",
                    "values": by_code["Geolocation"]["values"],
                },
            },
            {
                "code": "Year",
                "selection": {"filter": "item", "values": years},
            },
            {
                "code": "Period",
                "selection": {
                    "filter": "item",
                    "values": by_code["Period"]["values"],
                },
            },
        ],
        "response": {"format": "csv"},
    }


def fetch_csv(api_url: str, query: dict) -> str:
    body = json.dumps(query).encode("utf-8")
    req = urllib.request.Request(
        api_url,
        data=body,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        return resp.read().decode("utf-8-sig")


def merge_wide_chunks(chunk_texts: list[str]) -> str:
    """Outer-join PXWeb wide CSV chunks on Crop + Geolocation."""
    merged: dict[tuple[str, str], dict[str, str]] = {}
    headers: list[str] = []
    id_cols = ("Crop", "Geolocation")

    for text in chunk_texts:
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise RuntimeError("Empty CSV chunk from API")
        if not headers:
            headers = list(reader.fieldnames)
        else:
            for col in reader.fieldnames:
                if col not in headers:
                    headers.append(col)
        for row in reader:
            key = (row[id_cols[0]], row[id_cols[1]])
            merged.setdefault(key, {id_cols[0]: key[0], id_cols[1]: key[1]})
            for col, val in row.items():
                if col not in id_cols:
                    merged[key][col] = val

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for key in merged:
        writer.writerow(merged[key])
    return buf.getvalue()


def fetch_dataset(ds: Dataset) -> None:
    meta = fetch_metadata(ds.api_url)
    year_var = next(v for v in meta["variables"] if v["code"] == "Year")
    available = set(year_var["valueTexts"])
    missing = [y for y in range(YEAR_FROM, YEAR_TO + 1) if str(y) not in available]
    if missing:
        raise RuntimeError(f"{ds.name}: years not in metadata: {missing}")

    print(f"Fetching {meta['title']}")
    print(f"Years: {YEAR_FROM}-{YEAR_TO}")
    chunks: list[str] = []
    for start, end in year_chunks(YEAR_FROM, YEAR_TO, YEAR_CHUNK):
        codes = year_codes(start, end)
        print(f"  {start}-{end} ...", end=" ", flush=True)
        text = fetch_csv(ds.api_url, build_query(meta, codes))
        chunks.append(text)
        print("ok")

    merged = merge_wide_chunks(chunks) if len(chunks) > 1 else chunks[0]
    ds.out_csv.write_text(merged, encoding="utf-8")
    rows = list(csv.reader(io.StringIO(merged)))
    print(f"Saved {ds.out_csv.name}: {len(rows) - 1} rows, {len(rows[0])} columns")


def main() -> None:
    for ds in datasets():
        fetch_dataset(ds)
        print()
    print("Source: Philippine Statistics Authority (OpenSTAT). Attribute PSA when reusing.")


if __name__ == "__main__":
    main()
