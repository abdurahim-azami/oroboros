"""SDG layer: official targets from the UN Stats SDG API + reviewed role and skill tags.

    python pipeline/sdg.py

Every role gets at least one tag: a role-specific reviewed tag where we have one,
otherwise the reviewed default for its SOC major group (shown as "group default").
Every skill (O*NET work activity) gets SDG 4.4 plus any activity-specific tag.
Each tag carries its target number and the official target text as evidence.
"""
from __future__ import annotations

import csv
import json
import shutil

import duckdb

from common import CONFIG, DB_PATH, RAW, ROOT, SITE_DATA, client, get_with_retry, iso, now_utc

API = "https://unstats.un.org/sdgapi/v1/sdg"
MYS_SERIES = [  # (series code, indicator, filter, label)
    ("SL_TLF_UEM", "8.5.2", {"Sex": "BOTHSEX", "Age": "15+"}, "Unemployment rate, age 15+ (%)"),
    ("SL_TLF_UEM", "8.5.2", {"Sex": "BOTHSEX", "Age": "15-24"}, "Youth unemployment rate, age 15-24 (%)"),
    ("SL_TLF_NEET", "8.6.1", {"Sex": "BOTHSEX", "Age": "15-24"}, "Youth not in education, employment or training (%)"),
]


def fetch_targets(c) -> list[dict]:
    r = get_with_retry(c, f"{API}/Target/List", params={"includechildren": "false"})
    (RAW / "sdg_targets.json").write_bytes(r.content)
    return [{"code": t["code"], "goal": int(t["goal"]), "title": t["title"]} for t in r.json()]


def fetch_malaysia(c) -> list[dict]:
    out = []
    for series, indicator, flt, label in MYS_SERIES:
        try:
            r = get_with_retry(c, f"{API}/Series/Data", params={"seriesCode": series, "areaCode": 458, "pageSize": 500})
        except Exception as e:  # context only: a failure hides the card, never fakes it
            print(f"[sdg] Malaysia {series}: {e}")
            continue
        rows = [d for d in r.json().get("data", []) if all(d["dimensions"].get(k) == v for k, v in flt.items())]
        if not rows:
            continue
        last = max(rows, key=lambda d: d["timePeriodStart"])
        out.append({"indicator": indicator, "series": series, "label": label, "value": float(last["value"]),
                    "year": int(last["timePeriodStart"]), "source": "UN SDG Global Database (UN Stats SDG API)",
                    "url": f"{API}/Series/Data?seriesCode={series}&areaCode=458"})
    return out


def main() -> None:
    with client(timeout=90) as c:
        targets = fetch_targets(c)
        malaysia = fetch_malaysia(c)
    tmap = {t["code"]: t for t in targets}
    con = duckdb.connect(str(DB_PATH), read_only=True)
    codes = {r[0]: r[1] for r in con.execute("SELECT code, title FROM occupations").fetchall()}

    def check(target: str, where: str) -> bool:
        if target not in tmap:
            print(f"[sdg] WARNING unknown target {target} in {where}; dropped")
            return False
        return True

    roles = {}
    with open(CONFIG / "sdg_map_reviewed.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["onet_soc_code"] not in codes:
                print(f"[sdg] WARNING unknown occupation {r['onet_soc_code']}; dropped")
                continue
            if check(r["target"], r["onet_soc_code"]):
                roles.setdefault(r["onet_soc_code"], []).append(
                    {"target": r["target"], "strength": float(r["strength"]), "why": r["rationale"], "review": "role (reviewed)"})
    groups = {}
    with open(CONFIG / "sdg_group_defaults.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if check(r["target"], f"group {r['soc_major']}"):
                groups[r["soc_major"]] = {"target": r["target"], "strength": 0.5, "why": r["rationale"],
                                          "group": r["group"], "review": "occupation group default (reviewed)"}
    skills = {}
    with open(CONFIG / "gwa_sdg_map.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if check(r["target"], f"gwa {r['gwa_id']}"):
                skills.setdefault(r["gwa_id"], []).append({"target": r["target"], "why": r["rationale"]})

    used = {t["target"] for v in roles.values() for t in v} | {g["target"] for g in groups.values()} \
        | {t["target"] for v in skills.values() for t in v}
    doc = {
        "generated_at": iso(now_utc()),
        "targets_source": "UN Stats SDG API, Target/List (169 targets)",
        "targets_url": f"{API}/Target/List?includechildren=false",
        "n_targets": len(targets),
        "targets": {k: tmap[k] for k in sorted(used)},
        "roles": roles, "groups": groups, "skills": skills, "malaysia": malaysia,
        "method": "Tags assigned by team review of the official target text. Role tags carry a strength: 1 = the role's core output serves the target, 0.5 = supporting. Roles without a specific review fall back to their SOC major group default.",
    }
    (SITE_DATA / "sdg.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
    shutil.copy(CONFIG / "sdg_map_reviewed.csv", ROOT / "data" / "sdg_map_reviewed.csv")
    print(f"[sdg] targets={len(targets)} reviewed_roles={len(roles)} groups={len(groups)} "
          f"skill_maps={len(skills)} malaysia_indicators={len(malaysia)}")


if __name__ == "__main__":
    main()
