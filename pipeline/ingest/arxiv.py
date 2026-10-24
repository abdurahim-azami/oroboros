"""arXiv API: paper counts per AI capability area, in 30-day windows.

    python pipeline/ingest/arxiv.py [--windows 21]

Uses the public arXiv API (https://info.arxiv.org/help/api/) with max_results=1,
so each call returns only the total count. arXiv asks for one request every
3 seconds; we respect that.
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import client, get_with_retry, load_capabilities, month_windows, now_utc, write_snapshot  # noqa: E402

API = "https://export.arxiv.org/api/query"
TOTAL_RE = re.compile(r"<opensearch:totalResults[^>]*>(\d+)</opensearch:totalResults>")


def count(c, query: str, start, stop) -> int:
    q = f"({query}) AND submittedDate:[{start:%Y%m%d}0000 TO {stop:%Y%m%d}0000]"
    # max_results=1, not 0: the API answers 0 with an HTTP 500 since 2026.
    r = get_with_retry(c, API, params={"search_query": q, "max_results": 1}, tries=5, backoff=5)
    m = TOTAL_RE.search(r.text)
    if not m:
        raise RuntimeError("arXiv response had no totalResults")
    return int(m.group(1))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--windows", type=int, default=21, help="30-day windows to fetch (21 covers replay)")
    args = ap.parse_args()
    fetched = now_utc()
    windows = month_windows(fetched.date(), args.windows)
    out, rows, failed = {}, 0, []
    with client(timeout=60) as c:
        for area in load_capabilities():
            if not area.get("arxiv"):
                continue
            try:
                series = []
                for start, stop in windows:
                    n = count(c, area["arxiv"], start, stop)
                    series.append({"start": start.isoformat(), "end": stop.isoformat(), "value": n})
                    time.sleep(3.1)
            except Exception as e:  # keep the areas already fetched; momentum falls back per area
                failed.append(area["id"])
                print(f"[arxiv] {area['id']:12s} FAILED: {e}")
                time.sleep(60)      # let the rate limit cool before the next area
                continue
            rows += len(series)
            out[area["id"]] = {"query": area["arxiv"], "series": series}
            print(f"[arxiv] {area['id']:12s} last={series[-1]['value']:>6}  first={series[0]['value']:>6}")
    if not out:
        raise SystemExit("[arxiv] every area failed; no snapshot written")
    write_snapshot("arxiv", out, rows, fetched, extra={
        "label": "arXiv API", "url": "https://export.arxiv.org/api/query",
        "unit": "papers submitted per 30-day window", "windows": args.windows, "failed_areas": failed})
    if failed:
        sys.exit(1)    # partial: snapshot saved, but the receipt shows FAIL so nobody misses it


if __name__ == "__main__":
    main()
