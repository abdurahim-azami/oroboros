# Team guide: who owns what, and where it lives

The brief's roles mapped to the files that now exist. "Done means" is the brief's own test.

## A. Data and signals

| Brief task | Status | Where |
|---|---|---|
| Load O*NET and the exposure datasets as separate tables | Done | `pipeline/load_db.py` → `data/oroboros.duckdb` (tables `exp_gpt`, `exp_aei`, `exp_aioe`) |
| `arxiv.py`, `hn.py`, `github.py`, `jobs.py` with dated snapshots | Done | `pipeline/ingest/` → `data/snapshots/<date>/` |
| GitHub Actions nightly cron | Written | `.github/workflows/nightly.yml` (needs the repo on GitHub, then two successful runs) |
| Momentum m_c, capped 0.8 to 1.2, as JSON | Done | `pipeline/momentum.py` → `site/data/momentum.json` |
| 3 to 4 replay snapshots | Done | `site/data/replay/` (as of Jan, Apr, Jul 2026 + live) |
| Course link-check Action | Written | `.github/workflows/linkcheck.yml`, `pipeline/courses.py --check` |

**Done means:** `python pipeline/run_all.py` gives a fresh dated snapshot (works today), and the
Action has run successfully twice before demo day (push the repo, then *Actions → Nightly
signals → Run workflow* twice).

## B. Backend and matching

| Brief task | Status | Where |
|---|---|---|
| Scoring, composite, no-regret, pathway | Done | `site/assets/js/engine.js` |
| Tests | Done | `tests/engine.test.js` (12 checks), `tests/test_server.py` (4 checks) |
| LLM validators | Done | `server/app.py` |

## C. Frontend and pitch

| Brief task | Status | Where |
|---|---|---|
| Five screens, slider, Week Ring | Done | `site/index.html`, `site/assets/js/app.js` |
| Replay selector | Done | console bar, top right |
| Demo script | Done | `docs/demo-script.md` |
| EN/BM strings | Not started | stretch |

## Member 4. Knowledge, LLM and pitch

| Brief task | Status | Where |
|---|---|---|
| 5 synthetic personas | Done | `pipeline/config/personas.json` |
| Hand-review task to capability map for demo jobs | Done (32 overrides with reasons) | `pipeline/config/task_capability_reviewed.csv` → `data/task_capability_map.csv` |
| SDG layer, reviewed | Done (32 roles + 23 group defaults + skill map) | `pipeline/config/sdg_*.csv`, `data/sdg_map_reviewed.csv` |
| `courses.json` | Done (23 free courses, API hours, link-checked); HRD Corp left "not confirmed" | `pipeline/config/courses_curated.json` → `site/data/courses.json` |
| LLM layer with Qwen2.5-7B | Done, needs a Runpod endpoint | `server/` |
| README | Done | `README.md` |
| Demo script, backup video | Script done; record the video | `docs/demo-script.md` |
| Proposal text | Draft done | `docs/proposal.md` |

## How to change things without code

- **Add a course:** add a Microsoft Learn learning-path `uid` with tags to `pipeline/config/courses_curated.json`, run `python pipeline/courses.py`.
- **Fix a task's capability:** add a row to `pipeline/config/task_capability_reviewed.csv`, run `python pipeline/build_site.py`.
- **Add an SDG tag:** add a row to `pipeline/config/sdg_map_reviewed.csv`, run `python pipeline/sdg.py`.
- **Change a feed query:** edit `pipeline/config/capabilities.json`, run `python pipeline/run_all.py`.
- **Add a persona:** add it to `pipeline/config/personas.json` (O*NET task IDs + hours), run `python pipeline/build_site.py`.
