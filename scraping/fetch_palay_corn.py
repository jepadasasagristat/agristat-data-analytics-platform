"""
Fetch Palay and Corn Volume of Production + Area Harvested from PSA OpenSTAT
(PXWeb API), years 1990-2026.

Writes intermediate wide CSVs under data/raw/ for reshape_palay_corn.py.

Run from project root:
  python -m scraping.fetch_palay_corn
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

YEAR_FROM, YEAR_TO = 1990, 2026
BASE_YEAR = 1987
# PSA often rejects very large single pulls; fetch in year chunks.
YEAR_CHUNK = 5


@dataclass(frozen=True)
class Dataset:
    name: str
    api_url: str
    out_csv: Path


def datasets() -> list[Dataset]:
    ensure_data_dirs()
    return [
        Dataset(
            name="volume of production",
            api_url="https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2E/CS/0012E4EVCP0.px",
            out_csv=RAW_DIR / "_wide_volume.csv",
        ),
        Dataset(
            name="area harvested",
            api_url="https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2E/CS/0022E4EAHC0.px",
            out_csv=RAW_DIR / "_wide_area.csv",
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
                "code": "Ecosystem/Croptype",
                "selection": {
                    "filter": "item",
                    "values": by_code["Ecosystem/Croptype"]["values"],
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
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read().decode("utf-8-sig")


def merge_wide_chunks(chunk_texts: list[str]) -> str:
    """Outer-join PXWeb wide CSV chunks on Ecosystem/Croptype + Geolocation."""
    merged: dict[tuple[str, str], dict[str, str]] = {}
    headers: list[str] = []
    id_cols = ("Ecosystem/Croptype", "Geolocation")

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
    year_var = next(v for v in meta["variables"] if v.get("time") or v["code"] == "Year")
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
