"""GitHub REST API: weekly commit activity on reference repos per capability area.

    python pipeline/ingest/github.py

Uses /repos/{owner}/{repo}/stats/commit_activity (last 52 weeks). Set GITHUB_TOKEN
for a higher rate limit (GitHub Actions provides one automatically).
"""
from __future__ import annotations

import datetime as dt
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import client, load_capabilities, now_utc, write_snapshot  # noqa: E402

API = "https://api.github.com"


def commit_activity(c, repo: str) -> list[dict] | None:
    for _ in range(8):  # GitHub returns 202 while it computes stats; poll politely
        r = c.get(f"{API}/repos/{repo}/stats/commit_activity")
        if r.status_code == 200 and isinstance(r.json(), list):
            return [{"week": dt.datetime.fromtimestamp(w["week"], dt.timezone.utc).date().isoformat(),
                     "commits": w["total"]} for w in r.json()]
        if r.status_code in (202, 204):
            time.sleep(4)
            continue
        print(f"[github] {repo}: HTTP {r.status_code}")
        return None
    return None


def main() -> None:
    fetched = now_utc()
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    out, rows = {}, 0
    with client(headers=headers) as c:
        for area in load_capabilities():
            repos = {}
            for repo in area["github"]:
                weeks = commit_activity(c, repo)
                if weeks:
                    repos[repo] = weeks
                    rows += len(weeks)
            if area["github"]:
                out[area["id"]] = {"repos": repos}
                print(f"[github] {area['id']:12s} repos_ok={len(repos)}/{len(area['github'])}")
    write_snapshot("github", out, rows, fetched, extra={
        "label": "GitHub REST API", "url": "https://docs.github.com/en/rest/metrics/statistics",
        "unit": "commits per week on reference repositories"})


if __name__ == "__main__":
    main()
