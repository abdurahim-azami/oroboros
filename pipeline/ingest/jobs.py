"""Remotive and Arbeitnow public job APIs: postings that mention each area today.

    python pipeline/ingest/jobs.py

These APIs return only current postings, so one run is one dated point. The
momentum step uses jobs only once 90+ days of nightly snapshots exist; until then
the site labels this feed "building history". Remotive asks for attribution and
no more than a few requests a day: we make one.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import client, get_with_retry, load_capabilities, now_utc, write_snapshot  # noqa: E402

TAG_RE = re.compile(r"<[^>]+>")


def fetch_remotive(c) -> list[str]:
    r = get_with_retry(c, "https://remotive.com/api/remote-jobs")
    return [f"{j.get('title','')} {' '.join(j.get('tags') or [])} {TAG_RE.sub(' ', j.get('description',''))}"
            for j in r.json().get("jobs", [])]


def fetch_arbeitnow(c, pages: int = 5) -> list[str]:
    texts = []
    for p in range(1, pages + 1):
        r = get_with_retry(c, "https://www.arbeitnow.com/api/job-board-api", params={"page": p})
        data = r.json().get("data", [])
        texts += [f"{j.get('title','')} {' '.join(j.get('tags') or [])} {TAG_RE.sub(' ', j.get('description',''))}"
                  for j in data]
        if not data:
            break
    return texts


def main() -> None:
    fetched = now_utc()
    out, rows = {"boards": {}}, 0
    with client(timeout=60) as c:
        for board, fn in (("remotive", fetch_remotive), ("arbeitnow", fetch_arbeitnow)):
            try:
                texts = fn(c)
            except Exception as e:  # one board down must not sink the other
                out["boards"][board] = {"error": str(e)}
                print(f"[jobs] {board}: {e}")
                continue
            counts = {}
            for area in load_capabilities():
                if not area["hn"]:
                    continue
                pats = [re.compile(re.escape(k), re.I) for k in area["hn"]]
                counts[area["id"]] = sum(1 for t in texts if any(p.search(t) for p in pats))
            out["boards"][board] = {"postings": len(texts), "mentions": counts}
            rows += len(texts)
            print(f"[jobs] {board}: {len(texts)} postings")
    write_snapshot("jobs", out, rows, fetched, extra={
        "label": "Remotive + Arbeitnow job APIs",
        "url": "https://remotive.com/api/remote-jobs ; https://www.arbeitnow.com/api/job-board-api",
        "unit": "postings mentioning the area, per daily snapshot"})


if __name__ == "__main__":
    main()
