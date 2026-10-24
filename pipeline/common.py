"""Shared paths and helpers for the Oroboros pipeline.

Every ingest writes a dated snapshot with: source name, fetch time (UTC), row count.
Nothing in the pipeline invents a number: if a fetch fails, the snapshot records the
failure and the site shows the last good snapshot instead.
"""
from __future__ import annotations

import datetime as dt
import json
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
ONET_DIR = RAW / "db_31_0_text"
SNAPSHOTS = ROOT / "data" / "snapshots"
DB_PATH = ROOT / "data" / "oroboros.duckdb"
SITE_DATA = ROOT / "site" / "data"
CONFIG = Path(__file__).resolve().parent / "config"

USER_AGENT = "Oroboros-hackathon-pipeline/1.0 (+https://github.com/; synthetic-data demo)"


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def iso(ts: dt.datetime) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def load_capabilities() -> list[dict]:
    return json.loads((CONFIG / "capabilities.json").read_text(encoding="utf-8"))["areas"]


def client(timeout: float = 30.0, headers: dict | None = None) -> httpx.Client:
    h = {"User-Agent": USER_AGENT}
    if headers:
        h.update(headers)
    return httpx.Client(timeout=timeout, headers=h, follow_redirects=True)


def get_with_retry(c: httpx.Client, url: str, params: dict | None = None, tries: int = 4,
                   backoff: float = 3.0, ok=(200,)) -> httpx.Response:
    last = None
    for i in range(tries):
        wait = backoff * (i + 1)
        try:
            r = c.get(url, params=params)
            if r.status_code in ok:
                return r
            last = RuntimeError(f"HTTP {r.status_code} for {r.url}")
            if r.status_code in (429, 503):  # rate limited: honour Retry-After, never less than 30 s
                ra = r.headers.get("Retry-After", "")
                wait = max(30 * (i + 1), int(ra) if ra.isdigit() else 0)
        except httpx.HTTPError as e:  # network hiccup: retry
            last = e
        if i < tries - 1:
            time.sleep(wait)
    raise last  # type: ignore[misc]


def snapshot_dir(day: str | None = None) -> Path:
    d = SNAPSHOTS / (day or now_utc().strftime("%Y-%m-%d"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def write_snapshot(source: str, payload: dict, rows: int, fetched_at: dt.datetime,
                   day: str | None = None, extra: dict | None = None) -> Path:
    """Write data/snapshots/<day>/<source>.json with the standard header."""
    doc = {
        "source": source,
        "fetched_at": iso(fetched_at),
        "row_count": rows,
        **(extra or {}),
        "data": payload,
    }
    p = snapshot_dir(day) / f"{source}.json"
    p.write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"[snapshot] {p.relative_to(ROOT)}  rows={rows}")
    return p


def month_windows(end: dt.date, months: int = 12) -> list[tuple[dt.date, dt.date]]:
    """Return `months` consecutive 30-day windows ending at `end` (oldest first).

    Fixed 30-day windows (not calendar months) keep every bucket the same length,
    so a 90-day total is exactly 3 buckets and comparisons stay fair.
    """
    out = []
    for i in range(months, 0, -1):
        start = end - dt.timedelta(days=30 * i)
        stop = end - dt.timedelta(days=30 * (i - 1))
        out.append((start, stop))
    return out
