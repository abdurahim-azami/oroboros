# Data sources and evidence register

Every number the app shows traces to one of these. Fetch dates below are from the first build
(24 Oct 2026 UTC); the live values are always in `site/data/meta.json`,
`site/data/momentum.json` and on screen.

| ID | Source | What we use | Licence | Version / fetched | Pipeline |
|---|---|---|---|---|---|
| D1 | [O*NET 31.0 Database](https://www.onetcenter.org/database.html) | Occupation Data, Task Statements, Task Ratings (IM), Tasks to DWAs, GWA/IWA/DWA hierarchy, Emerging Tasks, Job Zones | CC BY 4.0, USDOL/ETA | 31.0, Aug 2026 | `fetch_static.py`, `load_db.py` |
| E1 | [GPTs are GPTs](https://github.com/openai/GPTs-are-GPTs) (Eloundou et al., 2023) | Task-level GPT-4 and human exposure labels (`full_labelset.tsv`) | MIT | main branch, 24 Oct 2026 | `load_db.py` |
| E2 | [Anthropic Economic Index](https://huggingface.co/datasets/Anthropic/EconomicIndex) | `labor_market_impacts/task_penetration.csv`, `job_exposure.csv` | MIT | 24 Oct 2026 | `load_db.py` |
| E3 | [AIOE](https://github.com/AIOE-Data/AIOE) (Felten, Raj and Seamans, 2021) | Appendix A occupation scores, shown as percentile | No licence file in the repo; cited for research use, to verify with the authors | main branch | `load_db.py` |
| S1 | [arXiv API](https://info.arxiv.org/help/api/) | Paper counts per capability query, 21 windows of 30 days | arXiv API terms (metadata) | nightly | `ingest/arxiv.py` |
| S2 | [HN Algolia API](https://hn.algolia.com/api) | "Ask HN: Who is hiring?" threads, keyword mention share | Public API | nightly | `ingest/hn.py` |
| S3 | [GitHub REST API](https://docs.github.com/en/rest/metrics/statistics) | Weekly commit activity on 2 to 3 reference repos per area | GitHub API terms | nightly | `ingest/github.py` |
| S4 | [Remotive](https://remotive.com/api/remote-jobs), [Arbeitnow](https://www.arbeitnow.com/api/job-board-api) | Postings mentioning each area | Public APIs, attribution | nightly (history building) | `ingest/jobs.py` |
| G1 | [UN Stats SDG API](https://unstats.un.org/sdgapi/v1/sdg/Target/List) | 169 targets, official text | UN | 24 Oct 2026 | `sdg.py` |
| G2 | UN SDG Global Database, Malaysia (area 458) | 8.5.2 unemployment (3.9%, 2022), youth unemployment (11.73%, 2022), 8.6.1 youth NEET (10.22%, 2022) | UN | 24 Oct 2026 | `sdg.py` |
| C1 | [Microsoft Learn Catalog API](https://learn.microsoft.com/api/catalog/) | Title, URL, duration, level, last modified for 23 free learning paths | Microsoft Learn terms | nightly link check | `courses.py` |

## Snapshot format

Every ingest writes `data/snapshots/<YYYY-MM-DD>/<source>.json`:

```json
{ "source": "arxiv", "fetched_at": "2026-10-24T15:55:39Z", "row_count": 210,
  "label": "arXiv API", "url": "https://export.arxiv.org/api/query",
  "unit": "papers submitted per 30-day window", "data": { "...": "..." } }
```

## Replay snapshots

`site/data/replay/` holds momentum "as of" 90, 180 and 270 days before the live snapshot,
rebuilt from the same real historical counts (arXiv submission dates, past HN threads, GitHub
weekly stats). The UI labels them "Replay · as of <date>". They show roles re-ranking on stage
even if one night's data barely moves. Say so in the demo.

## Hand-off files

| File | Owner (brief) | Content |
|---|---|---|
| `site/data/momentum.json` | Member A | Live m_c per area with feeds, formula, sources |
| `site/data/exposure.json` | Member A | [low, high] band per task |
| `data/task_capability_map.csv` | Member 4 | Every task's capability, method and review reason |
| `data/sdg_map_reviewed.csv` | Member 4 | Reviewed role SDG tags with rationale |
| `site/data/courses.json` | Member 4 | Verified courses with URL, hours, cost, check date |
