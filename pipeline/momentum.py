"""Momentum multiplier m_c per capability area, from the latest snapshots.

    python pipeline/momentum.py [--day YYYY-MM-DD] [--replay]

For each area and each feed with enough history:
    r_feed = (activity in the last 90 days) / (past-year average per 90 days)
           = sum(last 3 windows) / (sum(last 12 windows) / 4)
Feeds are combined with a geometric mean, then
    m_c = clamp(r, 0.8, 1.2)
The cap is a modelling assumption so one noisy feed cannot dominate. The jobs feed
joins only after 90 days of nightly history. 'human' is fixed at 1.0.

--replay rebuilds dated "as of" readings from the same historical windows
(as of 90, 180 and 270 days ago), for the Replay selector. They are reconstructions
from real historical counts, labelled as such on the site.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math

from common import SITE_DATA, SNAPSHOTS, iso, load_capabilities, now_utc

CAP_LO, CAP_HI = 0.8, 1.2


def snapshot_days() -> list[str]:
    return sorted(p.name for p in SNAPSHOTS.iterdir() if p.is_dir())


def latest_day() -> str:
    days = [d for d in snapshot_days() if any((SNAPSHOTS / d / f"{s}.json").exists() for s in ("arxiv", "hn", "github"))]
    if not days:
        raise SystemExit("No snapshots yet. Run the ingest scripts first.")
    return days[-1]


def load(day: str, source: str) -> dict | None:
    p = SNAPSHOTS / day / f"{source}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def latest(source: str, upto: str, area: str | None = None) -> dict | None:
    """Newest snapshot of `source` on or before `upto`. With `area` (arXiv), newest one that
    holds that area, so one failed night falls back per area, not for every feed."""
    for d in reversed([x for x in snapshot_days() if x <= upto]):
        doc = load(d, source)
        if doc and (area is None or area in doc["data"]):
            return doc
    return None


def ratio(values: list[float]) -> float | None:
    """values: 12 equal windows, oldest first. Last 3 vs the 12-window average per 3."""
    if len(values) < 12:
        return None
    year = sum(values[-12:])
    if year <= 0:
        return None
    return sum(values[-3:]) / (year / 4)


def windows_from_weeks(weeks: list[dict], end: dt.date, n: int) -> list[float] | None:
    """Fold weekly commit counts into n 30-day windows ending at `end`. None if history is short."""
    first = dt.date.fromisoformat(weeks[0]["week"])
    if end - dt.timedelta(days=30 * n) < first - dt.timedelta(days=7):
        return None
    out = []
    for i in range(n, 0, -1):
        lo, hi = end - dt.timedelta(days=30 * i), end - dt.timedelta(days=30 * (i - 1))
        out.append(sum(w["commits"] for w in weeks if lo <= dt.date.fromisoformat(w["week"]) < hi))
    return out


def hn_windows(series: list[dict], end: dt.date, n: int) -> list[float] | None:
    """Average share per 30-day window; windows with no thread borrow the nearest earlier value."""
    pts = [(dt.date.fromisoformat(s["date"]), s["value"]) for s in series]
    if not pts or pts[0][0] > end - dt.timedelta(days=30 * n - 31):
        return None
    out, last = [], None
    for i in range(n, 0, -1):
        lo, hi = end - dt.timedelta(days=30 * i), end - dt.timedelta(days=30 * (i - 1))
        vals = [v for d, v in pts if lo <= d < hi]
        last = sum(vals) / len(vals) if vals else last
        out.append(last if last is not None else 0.0)
    return out


def jobs_history(end: dt.date) -> dict[str, list[float]]:
    """Daily jobs snapshots folded to 30-day windows; needs >= 12 windows to be usable."""
    pts = {}
    for p in sorted(SNAPSHOTS.iterdir()):
        j = load(p.name, "jobs") if p.is_dir() else None
        if not j:
            continue
        d = dt.date.fromisoformat(p.name)
        for b in j["data"]["boards"].values():
            for area, n in (b.get("mentions") or {}).items():
                pts.setdefault(area, []).append((d, n / max(1, b["postings"])))
    out = {}
    for area, vals in pts.items():
        series = [{"date": d.isoformat(), "value": v} for d, v in vals]
        w = hn_windows(series, end, 12)
        if w:
            out[area] = w
    return out


def compute(day: str, offset_windows: int = 0) -> dict:
    """offset_windows=k reads the series as it stood 30*k days before the snapshot day."""
    hn, gh, jobs_doc = latest("hn", day), latest("github", day), latest("jobs", day)
    arxiv_used = {}   # area -> the arXiv snapshot it came from (per-area fallback)
    snap_end = dt.date.fromisoformat(day)
    as_of = snap_end - dt.timedelta(days=30 * offset_windows)
    jobs = jobs_history(as_of)
    areas = []
    for area in load_capabilities():
        aid = area["id"]
        feeds = {}
        if aid != "human":
            arxiv = latest("arxiv", day, aid)
            if arxiv:
                arxiv_used[aid] = arxiv
                s = arxiv["data"][aid]["series"]
                vals = [w["value"] for w in s][: len(s) - offset_windows]
                r = ratio(vals)
                if r:
                    feeds["arxiv"] = {"ratio": round(r, 4), "last90": int(sum(vals[-3:])),
                                      "year": int(sum(vals[-12:])), "series": vals[-12:],
                                      "fetched_at": arxiv["fetched_at"]}
            if hn and aid in hn["data"]["areas"]:
                vals = hn_windows(hn["data"]["areas"][aid]["series"], as_of, 12)
                r = ratio(vals) if vals else None
                if r:
                    feeds["hn"] = {"ratio": round(r, 4), "series": [round(v, 5) for v in vals],
                                   "last90_mentions": sum(x["mentions"] for x in hn["data"]["areas"][aid]["series"]
                                                          if as_of - dt.timedelta(days=90) <= dt.date.fromisoformat(x["date"]) < as_of)}
            if gh and aid in gh["data"]:
                tot = None
                for weeks in gh["data"][aid]["repos"].values():
                    w = windows_from_weeks(weeks, as_of, 12)
                    if w:
                        tot = w if tot is None else [a + b for a, b in zip(tot, w)]
                r = ratio(tot) if tot else None
                if r:
                    feeds["github"] = {"ratio": round(r, 4), "series": tot,
                                       "repos": list(gh["data"][aid]["repos"].keys())}
            if aid in jobs:
                r = ratio(jobs[aid])
                if r:
                    feeds["jobs"] = {"ratio": round(r, 4), "series": jobs[aid]}
        rs = [f["ratio"] for f in feeds.values() if f["ratio"] > 0]
        raw = math.exp(sum(math.log(x) for x in rs) / len(rs)) if rs else 1.0
        m = min(CAP_HI, max(CAP_LO, raw))
        areas.append({"id": aid, "name": area["name"], "blurb": area["blurb"],
                      "raw_ratio": round(raw, 4), "m": round(m, 4), "capped": raw != m,
                      "feeds": feeds, "no_feed": aid == "human"})
    newest_arxiv = max(arxiv_used.values(), key=lambda d: d["fetched_at"], default=None)
    stamp = {}
    for name, doc in (("arxiv", newest_arxiv), ("hn", hn), ("github", gh), ("jobs", jobs_doc)):
        if doc:
            stamp[name] = {"label": doc.get("label", name), "url": doc.get("url"),
                           "fetched_at": doc["fetched_at"], "row_count": doc["row_count"],
                           "unit": doc.get("unit")}
    if newest_arxiv:
        older = sorted(a for a, d in arxiv_used.items() if d["fetched_at"] != newest_arxiv["fetched_at"])
        if older:   # said out loud on the Radar instead of hidden
            stamp["arxiv"]["older_areas"] = older
    return {
        "as_of": as_of.isoformat(),
        "snapshot_day": day,
        "kind": "live" if offset_windows == 0 else "replay",
        "formula": "m_c = clamp( geomean_f( sum(last 90 days) / (past-year total / 4) ), 0.8, 1.2 )",
        "cap": [CAP_LO, CAP_HI],
        "computed_at": iso(now_utc()),
        "fetched_at": max((v["fetched_at"] for v in stamp.values()), default=None),
        "jobs_note": ("Jobs feed active." if jobs else
                      "Jobs feed is building history (needs 90+ days of nightly snapshots); not yet in m_c."),
        "sources": stamp,
        "areas": areas,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day")
    ap.add_argument("--replay", action="store_true")
    args = ap.parse_args()
    day = args.day or latest_day()
    SITE_DATA.mkdir(parents=True, exist_ok=True)
    live = compute(day)
    (SITE_DATA / "momentum.json").write_text(json.dumps(live, indent=1), encoding="utf-8")
    print(f"[momentum] live as of {live['as_of']}")
    for a in live["areas"]:
        print(f"   {a['id']:12s} m={a['m']:.3f} raw={a['raw_ratio']:.3f} feeds={','.join(a['feeds'])}")
    if args.replay:
        rdir = SITE_DATA / "replay"
        rdir.mkdir(exist_ok=True)
        index = [{"as_of": live["as_of"], "file": "momentum.json", "kind": "live"}]
        for k in (3, 6, 9):
            rep = compute(day, k)
            f = f"replay/momentum-{rep['as_of']}.json"
            (SITE_DATA / f).write_text(json.dumps(rep, indent=1), encoding="utf-8")
            index.append({"as_of": rep["as_of"], "file": f, "kind": "replay"})
            print(f"[momentum] replay as of {rep['as_of']}: " +
                  " ".join(f"{a['id']}={a['m']:.2f}" for a in rep["areas"]))
        (SITE_DATA / "replay" / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
