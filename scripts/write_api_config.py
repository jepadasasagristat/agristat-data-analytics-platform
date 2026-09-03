"""Write static/assets/config.js from API_ORIGIN (Vercel frontend build)."""

from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "static" / "assets" / "config.js"


def main() -> int:
    origin = os.environ.get("API_ORIGIN", "").strip().rstrip("/")
    CONFIG.write_text(
        "window.AGRI_API_BASE = "
        + json.dumps(origin)
        + ";\n\n"
        + "window.agriApiUrl = function agriApiUrl(path) {\n"
        + '  const base = String(window.AGRI_API_BASE || "").replace(/\\/$/, "");\n'
        + '  const suffix = path.startsWith("/") ? path : `/${path}`;\n'
        + "  return base ? `${base}${suffix}` : suffix;\n"
        + "};\n",
        encoding="utf-8",
    )
    print(f"Wrote {CONFIG.relative_to(ROOT)} with API_ORIGIN={origin or '(same origin)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
