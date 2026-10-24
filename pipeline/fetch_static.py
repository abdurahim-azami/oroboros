"""Download the release-based datasets (they change by release, not daily).

    python pipeline/fetch_static.py

Writes into data/raw/ and records each file's URL, size and fetch time in
data/raw/SOURCES.json so the site can show a version stamp.
"""
from __future__ import annotations

import json
import zipfile

from common import RAW, client, get_with_retry, iso, now_utc

SOURCES = {
    "onet_31_text.zip": {
        "url": "https://www.onetcenter.org/dl_files/database/db_31_0_text.zip",
        "name": "O*NET 31.0 Database (text)",
        "licence": "CC BY 4.0, USDOL/ETA. https://www.onetcenter.org/license_db.html",
        "version": "31.0 (Aug 2026)",
    },
    "gpts_full_labelset.tsv": {
        "url": "https://raw.githubusercontent.com/openai/GPTs-are-GPTs/main/data/full_labelset.tsv",
        "name": "GPTs are GPTs task exposure labels (Eloundou et al., 2023)",
        "licence": "MIT (repository licence), https://github.com/openai/GPTs-are-GPTs",
        "version": "main branch",
    },
    "AIOE_DataAppendix.xlsx": {
        "url": "https://raw.githubusercontent.com/AIOE-Data/AIOE/main/AIOE_DataAppendix.xlsx",
        "name": "AI Occupational Exposure (Felten, Raj & Seamans, 2021)",
        "licence": "No licence file in repository; cited for research use, verify with authors. https://github.com/AIOE-Data/AIOE",
        "version": "main branch",
    },
    "aei_task_penetration.csv": {
        "url": "https://huggingface.co/datasets/Anthropic/EconomicIndex/resolve/main/labor_market_impacts/task_penetration.csv",
        "name": "Anthropic Economic Index: task penetration",
        "licence": "MIT (dataset card), https://huggingface.co/datasets/Anthropic/EconomicIndex",
        "version": "labor_market_impacts",
    },
    "aei_job_exposure.csv": {
        "url": "https://huggingface.co/datasets/Anthropic/EconomicIndex/resolve/main/labor_market_impacts/job_exposure.csv",
        "name": "Anthropic Economic Index: observed job exposure",
        "licence": "MIT (dataset card), https://huggingface.co/datasets/Anthropic/EconomicIndex",
        "version": "labor_market_impacts",
    },
}

ONET_MEMBERS = [
    "Occupation Data.txt", "Task Statements.txt", "Task Ratings.txt", "Tasks to DWAs.txt",
    "GWAs to IWAs to DWAs.txt", "Content Model Reference.txt", "Emerging Tasks.txt",
    "Job Zones.txt", "Read Me.txt",
]


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    manifest = {}
    with client(timeout=300) as c:
        for fname, meta in SOURCES.items():
            r = get_with_retry(c, meta["url"])
            (RAW / fname).write_bytes(r.content)
            manifest[fname] = {**meta, "bytes": len(r.content), "fetched_at": iso(now_utc())}
            print(f"[fetch] {fname}  {len(r.content):,} bytes")
    with zipfile.ZipFile(RAW / "onet_31_text.zip") as z:
        for m in ONET_MEMBERS:
            z.extract(f"db_31_0_text/{m}", RAW)
    (RAW / "SOURCES.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
