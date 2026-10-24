"""Export everything the static site needs into site/data/.

    python pipeline/build_site.py

Outputs
  occupations.json        picker list (occupations that have task statements)
  occ/<code>.json         one occupation: tasks, exposure band per source, capability, DWAs
  roles.json              compact matrix for ranking every occupation in the browser
  exposure.json           exposure band per task, keyed by occupation (hand-off file)
  personas.json           the five synthetic personas, validated against O*NET
  meta.json               version stamps, sources, licences, counts
  ../../data/task_capability_map.csv   the reviewed task -> capability map (hand-off file)
"""
from __future__ import annotations

import csv
import json
import shutil

import duckdb

from common import CONFIG, DB_PATH, RAW, ROOT, SITE_DATA, iso, load_capabilities, now_utc


def r3(x):
    return None if x is None else round(float(x), 3)


def main() -> None:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    caps = [a["id"] for a in load_capabilities()]
    cap_idx = {c: i for i, c in enumerate(caps)}

    # Reviewed overrides win over the automatic GWA vote.
    reviewed = {}
    with open(CONFIG / "task_capability_reviewed.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            reviewed[(r["code"], int(r["task_id"]))] = (r["capability"], r["rationale"])

    dwa_rows = con.execute("SELECT dwa_id, iwa_id, gwa_id, name FROM dwa ORDER BY dwa_id").fetchall()
    dwa_idx = {d[0]: i for i, d in enumerate(dwa_rows)}
    iwa_ids = sorted({d[1] for d in dwa_rows})
    iwa_idx = {w: i for i, w in enumerate(iwa_ids)}
    gwa_names = dict(con.execute("SELECT gwa_id, gwa_name FROM gwa_capability").fetchall())

    task_dwas: dict[tuple, list[int]] = {}
    for code, tid, dwa in con.execute("SELECT code, task_id, dwa_id FROM task_dwas").fetchall():
        if dwa in dwa_idx:
            task_dwas.setdefault((code, tid), []).append(dwa_idx[dwa])

    occs = con.execute("""
        SELECT o.code, o.title, o.description, o.job_zone, a.aioe_pct, j.observed_exposure
        FROM occupations o
        LEFT JOIN exp_aioe a ON a.soc6 = left(o.code, 7)
        LEFT JOIN aei_job j ON j.soc6 = left(o.code, 7)
        WHERE o.code IN (SELECT DISTINCT code FROM tasks) ORDER BY o.title""").fetchall()

    tasks = con.execute("""
        SELECT t.code, t.task_id, t.task, t.task_type, t.updated, i.im, c.capability, c.method,
               e.e_gpt4, e.e_human, e.e_aei, e.low, e.high, e.imputed
        FROM tasks t JOIN task_exposure e USING (code, task_id)
        JOIN task_capability c USING (code, task_id)
        LEFT JOIN task_importance i USING (code, task_id)
        ORDER BY t.code, i.im DESC NULLS LAST, t.task_id""").fetchall()
    by_occ: dict[str, list] = {}
    for row in tasks:
        by_occ.setdefault(row[0], []).append(row)
    emerging: dict[str, list] = {}
    for code, task, cat in con.execute("SELECT code, task, category FROM emerging").fetchall():
        emerging.setdefault(code, []).append({"task": task, "category": cat})

    out_occ = SITE_DATA / "occ"
    if out_occ.exists():
        shutil.rmtree(out_occ)
    out_occ.mkdir(parents=True)

    occ_list, roles, exposure, cap_map_rows = [], [], {}, []
    for code, title, desc, zone, aioe_pct, aei_obs in occs:
        rows = by_occ.get(code, [])
        tlist = []
        for (_, tid, text, ttype, updated, im, cap, method, g4, hu, aei, lo, hi, imp) in rows:
            if (code, tid) in reviewed:
                cap, method = reviewed[(code, tid)][0], "reviewed"
            tlist.append({
                "id": tid, "text": text, "type": ttype, "updated": updated,
                "im": r3(im) if im is not None else None, "cap": cap, "capMethod": method,
                "e": {"gpt4": g4, "human": hu, "aei": r3(aei)}, "low": r3(lo), "high": r3(hi),
                "imputed": bool(imp), "dwas": task_dwas.get((code, tid), []),
            })
            cap_map_rows.append([code, tid, cap, method,
                                 reviewed.get((code, tid), ("", ""))[1]])
        core = [t for t in tlist if t["type"] == "Core"] or tlist
        doc = {"code": code, "title": title, "description": desc, "zone": zone,
               "aioe_pct": r3(aioe_pct), "aei_observed": r3(aei_obs),
               "tasks": tlist, "emerging": emerging.get(code, [])}
        (out_occ / f"{code}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        occ_list.append({"c": code, "t": title, "z": zone, "n": len(tlist)})
        # Compact rows for ranking: [im, low, high, capIdx, [dwaIdx...]] for core tasks.
        roles.append([code, title, zone, r3(aioe_pct), len(emerging.get(code, [])),
                      [[t["im"] or 3.0, t["low"], t["high"], cap_idx[t["cap"]], t["dwas"]] for t in core]])
        exposure[code] = {str(t["id"]): [t["low"], t["high"]] for t in tlist}

    (SITE_DATA / "occupations.json").write_text(json.dumps(occ_list, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (SITE_DATA / "roles.json").write_text(json.dumps({
        "caps": caps,
        "iwa": iwa_ids,
        "dwa": [[d[0], d[3], iwa_idx[d[1]], d[2]] for d in dwa_rows],
        "gwa": gwa_names,
        "roles": roles,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (SITE_DATA / "exposure.json").write_text(json.dumps({
        "_about": "Task exposure band [low, high] per O*NET task, keyed by occupation. Sources: GPT-4 and human rater labels (GPTs are GPTs), Anthropic Economic Index observed usage. See docs/methodology.md.",
        "bands": exposure}, separators=(",", ":")), encoding="utf-8")

    with open(ROOT / "data" / "task_capability_map.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["onet_soc_code", "task_id", "capability", "method", "review_rationale"])
        w.writerows(cap_map_rows)

    # Personas: validate every task id against the occupation.
    personas = json.loads((CONFIG / "personas.json").read_text(encoding="utf-8"))["personas"]
    valid = {code: {t[1] for t in rows} for code, rows in by_occ.items()}
    for p in personas:
        bad = [tid for tid in p["tasks"] if int(tid) not in valid.get(p["occupation"], set())]
        if bad:
            raise SystemExit(f"Persona {p['id']} has task ids not in {p['occupation']}: {bad}")
        p["synthetic"] = True
    (SITE_DATA / "personas.json").write_text(json.dumps(personas, ensure_ascii=False, indent=1), encoding="utf-8")

    sources = json.loads((RAW / "SOURCES.json").read_text(encoding="utf-8"))
    counts = dict(con.execute("""SELECT 'occupations', COUNT(*) FROM occupations UNION ALL
        SELECT 'tasks', COUNT(*) FROM tasks UNION ALL SELECT 'dwa', COUNT(*) FROM dwa UNION ALL
        SELECT 'tasks_with_gpt_labels', COUNT(e_gpt4) FROM task_exposure UNION ALL
        SELECT 'tasks_with_aei_usage', COUNT(e_aei) FROM task_exposure UNION ALL
        SELECT 'tasks_imputed', SUM(imputed) FROM task_exposure UNION ALL
        SELECT 'emerging_tasks', COUNT(*) FROM emerging""").fetchall())
    (SITE_DATA / "meta.json").write_text(json.dumps({
        "built_at": iso(now_utc()),
        "onet_version": "O*NET 31.0 (August 2026)",
        "counts": {k: int(v) for k, v in counts.items()},
        "occupations_with_tasks": len(occ_list),
        "static_sources": sources,
        "reviewed_task_capability_overrides": len(reviewed),
    }, indent=1), encoding="utf-8")
    print(f"[build] occupations={len(occ_list)} roles={len(roles)} personas={len(personas)} "
          f"reviewed_overrides={len(reviewed)}")


if __name__ == "__main__":
    main()
