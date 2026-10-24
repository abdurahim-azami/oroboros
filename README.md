# Oroboros

**Your job, minus what AI absorbs, plus what you can grow into.**

> Oroboros shows you which parts of your own job AI may eat, under slow and fast scenarios,
> and which real career the leftover can grow into.

A job is a bundle of tasks. AI does not delete jobs overnight: it eats some tasks inside them,
and what is left becomes a different job. Oroboros walks one person through that process:

| Step | What happens | Must-have covered |
|---|---|---|
| **1. Your job** | Pick an O*NET occupation (923 with task lists), tick the tasks you really do, set hours. Optional reflection cards and CV-text paste. | Skills intake |
| **2. Radar** | Momentum for 10 AI capability areas from arXiv, HN hiring threads, GitHub and job boards, refreshed nightly, every number dated. | AI-trend signal layer |
| **3. Consume** | Each task coloured consumed, shrinking, safe or uncertain. The **Week Ring** is eaten live as you drag *Slow drift ↔ Fast Shockwave*. | Uncertainty |
| **4. Regrow** | Every real occupation ranked by `Fit × Resilience`, with the printed score, the gap, the tasks that drove the match, a two-role composite and no-regret skills. | Future-role matching |
| **5. Plan & SDGs** | Ordered steps with verified free courses, hours, weeks at your pace, a proof task per step, SDG tags for each role and skill, and a Purpose slider. | Reskilling pathway, SDG mapping |

Built for the **Aiversecity Future-Ready Workforce** hackathon (Domain 1). Synthetic personas only.

---

## Run it

```bash
# 1. The site (no build step)
python -m http.server 8765 --directory site
# open http://localhost:8765

# 2. Tests (no install needed)
node --test tests/engine.test.js
```

Refresh the live signals and rebuild everything the site reads:

```bash
python -m venv .venv && .venv/Scripts/activate        # Windows; use bin/activate on Mac/Linux
pip install -r pipeline/requirements.txt
python pipeline/run_all.py --full     # first time: downloads O*NET 31.0 and the exposure datasets
python pipeline/run_all.py            # nightly: one command, fresh dated snapshot
```

Optional LLM layer (the app works fully without it):

```bash
pip install -r server/requirements.txt
cp server/.env.example server/.env    # add your Runpod endpoint
uvicorn server.app:app --port 8000
# open http://localhost:8765/?api=http://localhost:8000
```

## How it works (three formulas, printed in the UI)

```
A. Momentum      m_c = clamp( last 90 days ÷ past-year average per 90 days, 0.8, 1.2 )
B. Absorption    A_t = min(1, E_t × m_c × s)        s: Slow 0.6 · Gradual 1.0 · Shockwave 1.6
                 consumed ≥ 0.6 · shrinking 0.35–0.6 · safe < 0.35 · uncertain if the band crosses a line
C. Ranking       Rank = Fit × Resilience            (× (1 + p·S) only when the Purpose slider is used)
```

Full method, every assumption and every threshold: [docs/methodology.md](docs/methodology.md).

## Data sources

| Layer | Source | Update |
|---|---|---|
| Occupations and tasks | O*NET 31.0 (1,016 occupations, 18,838 tasks, DWA hierarchy), CC BY 4.0 | Version stamp |
| Task exposure | GPTs are GPTs labels (MIT), Anthropic Economic Index (MIT), Felten AIOE (context) | Release-based, re-ingested on change |
| Live momentum | arXiv API, HN Algolia API, GitHub REST API, Remotive and Arbeitnow | **Nightly GitHub Action**, dated snapshots in `data/snapshots/` |
| SDG targets | UN Stats SDG API (169 targets, Malaysia area 458 indicators) | Dated pull |
| Courses | Microsoft Learn Catalog API (23 free learning paths) | Nightly link check |

Details, versions, licences and fetch dates: [docs/data-sources.md](docs/data-sources.md).

## Language model disclosure

- **The core runs without an LLM.** Every number, role, task, course and SDG tag on screen is computed by code from the data files.
- Optional model: **Qwen2.5-7B-Instruct** (open weights, Apache-2.0), served on Runpod's OpenAI-compatible vLLM endpoint.
- It does two jobs only: mapping pasted CV text to task IDs from the chosen occupation's list, and rephrasing sentences the engine already computed.
- Guardrails in `server/app.py`: IDs not in the database are dropped; an explanation containing a number or link not present in the input is rejected and the computed text is shown instead.

## Known limits (said before anyone asks)

1. **O*NET is US-based.** Malaysian titles map through ISCO-08, the base of MASCO 2020. The match is close, not exact.
2. **Exposure is not job loss.** The datasets say which tasks an AI system could speed up.
3. **Exposure datasets update by release, not daily.** Only the momentum layer is nightly.
4. **Robots are under-counted.** The exposure data measure language-model AI; physical work can look safer than it is.
5. **Momentum, scenario speeds and thresholds are our stated assumptions**, printed on every screen.
6. **The jobs feed is young.** It joins momentum after 90 days of nightly history.
7. **Replay snapshots** are rebuilt from real historical counts (arXiv dates, HN threads, GitHub weekly stats), and are labelled "replay".

## Repository map

```text
site/                 the website (index.html + assets/ + data/), deployable as-is
  assets/js/engine.js the scoring engine: every formula, pure functions, tested
  assets/js/app.js    the five screens
  assets/js/site.js   scroll-scrubbed hero, captions, motes, reveals
  data/               generated JSON (occupations, roles, momentum, replay, courses, sdg, personas)
pipeline/             Python: fetch, DuckDB load, ingest scripts, momentum, courses, SDG, export
  ingest/             arxiv.py · hn.py · github.py · jobs.py
  config/             capabilities, reviewed maps, personas, curated courses (all hand-editable)
data/snapshots/       dated nightly snapshots (source, fetch time, row count)
data/*.csv            hand-off files: task_capability_map.csv, sdg_map_reviewed.csv
server/               optional FastAPI LLM layer with validators
tests/                engine acceptance tests (node) + server guardrail tests (pytest)
docs/                 methodology, data sources, demo script, proposal, team guide, design package
.github/workflows/    nightly ingest, link check, GitHub Pages deploy
```

## Rules we follow

Public, open or synthetic data only. No real CVs. Every recommendation cites a source. No
invented jobs, courses or statistics: composite roles are always two real, named O*NET
occupations, and courses come only from the catalogue with a URL and a check date. Oroboros
assists a person's own choice; it must not be used for hiring or firing.

Attribution and licences: [LICENSE_NOTICES.md](LICENSE_NOTICES.md).
