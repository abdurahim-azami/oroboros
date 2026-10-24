"""One command for a fresh, dated snapshot and updated site data.

    python pipeline/run_all.py            # nightly: live feeds + momentum + link check
    python pipeline/run_all.py --full     # also re-download O*NET, exposure, courses, SDGs and rebuild

Each feed runs on its own: if one source is down, the others still land and the
momentum step uses whatever history exists. The step list printed at the end is
the receipt (source, fetch time, row count).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable


def run(args: list[str], must: bool = False) -> bool:
    print(f"\n$ python {' '.join(args)}", flush=True)
    ok = subprocess.run([PY, *args], cwd=HERE.parent).returncode == 0
    if not ok and must:
        sys.exit(f"step failed: {args}")
    return ok


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--arxiv-windows", default="21")
    a = ap.parse_args()
    results = {}
    if a.full:
        for step in (["pipeline/fetch_static.py"], ["pipeline/load_db.py"], ["pipeline/build_site.py"],
                     ["pipeline/courses.py"], ["pipeline/sdg.py"]):
            results[step[0]] = run(step, must=True)
    results["arxiv"] = run(["pipeline/ingest/arxiv.py", "--windows", a.arxiv_windows])
    results["hn"] = run(["pipeline/ingest/hn.py"])
    results["github"] = run(["pipeline/ingest/github.py"])
    results["jobs"] = run(["pipeline/ingest/jobs.py"])
    results["momentum"] = run(["pipeline/momentum.py", "--replay"], must=True)
    results["linkcheck"] = run(["pipeline/courses.py", "--check"])
    print("\n== receipt ==")
    for k, v in results.items():
        print(f"{'OK ' if v else 'FAIL'}  {k}")
    m = json.loads((HERE.parent / "site" / "data" / "momentum.json").read_text(encoding="utf-8"))
    for name, s in m["sources"].items():
        print(f"      {name:8s} fetched {s['fetched_at']}  rows={s['row_count']}")


if __name__ == "__main__":
    main()
