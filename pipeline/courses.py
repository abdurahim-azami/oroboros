"""Build site/data/courses.json from the curated list + the Microsoft Learn Catalog API,
then link-check every URL.

    python pipeline/courses.py            # build + link-check
    python pipeline/courses.py --check    # link-check only (the nightly Action)

A course is published only if the catalog returns it (title, URL, minutes, last
modified) AND its URL answers 200. Anything else is dropped and reported, so the
app can never show a dead or invented course.
"""
from __future__ import annotations

import argparse
import json
import sys

from common import CONFIG, RAW, SITE_DATA, client, get_with_retry, iso, now_utc

CATALOG = "https://learn.microsoft.com/api/catalog/?locale=en-us&type=learningPaths"


def link_ok(c, url: str) -> tuple[bool, int]:
    try:
        r = c.get(url)
        return r.status_code == 200, r.status_code
    except Exception:
        return False, 0


def build() -> dict:
    curated = json.loads((CONFIG / "courses_curated.json").read_text(encoding="utf-8"))["courses"]
    with client(timeout=120) as c:
        r = get_with_retry(c, CATALOG)
        (RAW / "mslearn_catalog.json").write_bytes(r.content)
        paths = {p["uid"]: p for p in r.json()["learningPaths"]}
        out, dropped = [], []
        checked = iso(now_utc())
        for cur in curated:
            p = paths.get(cur["uid"])
            if not p:
                dropped.append({"uid": cur["uid"], "reason": "not in catalog"})
                continue
            url = p["url"].split("?")[0]
            ok, code = link_ok(c, url)
            if not ok:
                dropped.append({"uid": cur["uid"], "reason": f"HTTP {code}"})
                continue
            out.append({
                "id": cur["uid"], "title": p["title"], "provider": "Microsoft Learn", "url": url,
                "hours": round(p["duration_in_minutes"] / 60, 1), "minutes": p["duration_in_minutes"],
                "cost_rm": 0, "level": p["levels"], "modules": p.get("number_of_children"),
                "provider_last_modified": p["last_modified"][:10], "last_checked": checked,
                "hrd_corp": None, "caps": cur["caps"], "gwa": cur["gwa"], "kind": cur["kind"],
                "proof_task": cur["proof_task"],
            })
    return {"generated_at": checked, "source": "Microsoft Learn Catalog API", "source_url": CATALOG,
            "courses": out, "dropped": dropped}


def check_only() -> int:
    doc = json.loads((SITE_DATA / "courses.json").read_text(encoding="utf-8"))
    bad = []
    with client(timeout=60) as c:
        for co in doc["courses"]:
            ok, code = link_ok(c, co["url"])
            if ok:
                co["last_checked"] = iso(now_utc())
            else:
                bad.append((co["id"], code))
    (SITE_DATA / "courses.json").write_text(json.dumps(doc, indent=1), encoding="utf-8")
    for b in bad:
        print(f"[linkcheck] BROKEN {b[0]} HTTP {b[1]}")
    print(f"[linkcheck] {len(doc['courses']) - len(bad)}/{len(doc['courses'])} OK")
    return 1 if bad else 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        sys.exit(check_only())
    doc = build()
    SITE_DATA.mkdir(parents=True, exist_ok=True)
    (SITE_DATA / "courses.json").write_text(json.dumps(doc, indent=1), encoding="utf-8")
    print(f"[courses] published {len(doc['courses'])}, dropped {len(doc['dropped'])}: {doc['dropped']}")


if __name__ == "__main__":
    main()
