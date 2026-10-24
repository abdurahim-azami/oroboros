"""Hacker News "Ask HN: Who is hiring?" threads via the HN Algolia API.

    python pipeline/ingest/hn.py [--months 21]

For each monthly hiring thread, counts top-level job comments that mention each
capability area's keywords, and divides by the thread's comment count. The share
(not the raw count) is the signal, so a busy month does not look like momentum.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import client, get_with_retry, load_capabilities, now_utc, write_snapshot  # noqa: E402

API = "https://hn.algolia.com/api/v1"


def hiring_threads(c, months: int) -> list[dict]:
    r = get_with_retry(c, f"{API}/search_by_date", params={
        "tags": "story,author_whoishiring", "query": "who is hiring", "hitsPerPage": 100})
    threads = [h for h in r.json()["hits"] if h["title"].lower().startswith("ask hn: who is hiring")]
    threads.sort(key=lambda h: h["created_at_i"], reverse=True)
    return list(reversed(threads[:months]))


def mentions(c, story_id: int, keyword: str) -> int:
    r = get_with_retry(c, f"{API}/search", params={
        "tags": f"comment,story_{story_id}", "query": f'"{keyword}"', "hitsPerPage": 0,
        "typoTolerance": "false", "restrictSearchableAttributes": "comment_text"})
    return int(r.json()["nbHits"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=21)
    args = ap.parse_args()
    fetched = now_utc()
    areas = [a for a in load_capabilities() if a["hn"]]
    out, rows = {"threads": [], "areas": {a["id"]: {"keywords": a["hn"], "series": []} for a in areas}}, 0
    with client() as c:
        for t in hiring_threads(c, args.months):
            sid = int(t["objectID"])
            total = get_with_retry(c, f"{API}/search", params={
                "tags": f"comment,story_{sid}", "hitsPerPage": 0}).json()["nbHits"]
            day = dt.datetime.fromtimestamp(t["created_at_i"], dt.timezone.utc).date().isoformat()
            out["threads"].append({"id": sid, "title": t["title"], "date": day, "comments": total})
            for a in areas:
                hits = sum(mentions(c, sid, kw) for kw in a["hn"])
                time.sleep(0.15)
                share = hits / total if total else 0.0
                out["areas"][a["id"]]["series"].append({"date": day, "mentions": hits, "comments": total,
                                                        "value": round(share, 5)})
                rows += 1
            print(f"[hn] {t['title'][:40]:40s} comments={total}")
    write_snapshot("hn", out, rows, fetched, extra={
        "label": "HN Algolia API (Who is hiring)", "url": "https://hn.algolia.com/api",
        "unit": "share of hiring-thread comments mentioning the area"})


if __name__ == "__main__":
    main()
