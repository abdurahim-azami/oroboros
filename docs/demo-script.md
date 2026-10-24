# Demo script

Numbers below are from the 24 Oct 2026 snapshot. Re-check them on demo morning
(`node tests/run_personas.js huimin`) because the live layer moves nightly.

## 60-second version (preliminary round)

| Time | Do | Say |
|---|---|---|
| 0:00 | Scroll the hero once, top to bottom. | "A job isn't a title. It's a bundle of tasks, and AI eats some of them. Oroboros shows which ones, and what the rest can grow into." |
| 0:10 | Click **Run Hui Min's job**. | "Hui Min, 29, claims processor in KL, a synthetic persona. AI triage pilot announced, three months, six hours a week to learn. These are her real O*NET tasks with her hours." |
| 0:18 | Tab **2 Radar**. Point at a source chip. | "This is live. arXiv, Hacker News hiring threads and GitHub, fetched last night by a GitHub Action. Every number carries its source and date." |
| 0:26 | Tab **3 Consume**. Drag the slider from Gradual to Fast Shockwave. | "Under Gradual Erosion AI may absorb 29 to 37 percent of her week. Drag to Fast Shockwave: 46 to 60. It's a range because the datasets disagree, and we show that instead of hiding it." |
| 0:38 | Tab **4 Regrow**. | "Every real occupation, ranked by Fit times Resilience, formula printed. Top move: Cost Estimators. Or a composite of two real jobs: 56 percent Cost Estimators, 44 percent Accountants and Auditors. We never invent a title." |
| 0:50 | Tab **5 Plan**. | "Five steps, about 15 hours, three weeks at her pace, all free, each with a proof task and an SDG target. Every course link was checked last night." |
| 0:58 | | "Not a prediction of who loses their job. A plan for the person doing it." |

## 3-minute version (final round)

1. **Problem (0:00 to 0:20).** Career tools recommend jobs from a CV. AI changes tasks before titles.
2. **Intake (0:20 to 0:40).** Hui Min's tasks and hours. Show search: type "nurse", pick, paste a made-up CV line, watch tasks tick.
3. **Signals (0:40 to 1:10).** Radar. Open the **Replay** menu. Explain the replay honestly: "these are rebuilt from the same historical counts, labelled replay."
4. **The live link (1:10 to 1:30).** Set the slider to Fast Shockwave. Switch Replay from **26 Jul 2026** to **Live**: on Regrow, *Cost Estimators* overtakes *staying in claims* (0.266 vs 0.269 in July becomes 0.281 vs 0.280 now). "Same person, same data, new signals, different ranking."
5. **Consume (1:30 to 1:55).** Week Ring, an uncertain task, open "Why": the formula with real numbers and the three dataset labels.
6. **Regrow (1:55 to 2:20).** Composite, no-regret skills, "Same person, three futures", fairness check.
7. **Plan + SDG (2:20 to 2:45).** Steps, Purpose slider to 0.5 (watch the formula change), Malaysia context, Download plan (.md).
8. **Close (2:45 to 3:00).** Known limits in one breath: US task data with ISCO crosswalk, exposure isn't job loss, only momentum is nightly.

## Questions judges will ask

| Question | Answer |
|---|---|
| Is the signal really live? | Yes: nightly GitHub Action, snapshots in `data/snapshots/` with fetch time and row count. Show the commit history. |
| Why trust the exposure numbers? | We don't trust one: three published datasets, kept separate, range shown. |
| Malaysia? | O*NET via ISCO-08 (MASCO's base); Malaysia SDG indicators from the UN API on the Plan screen. |
| Which LLM? | None in the core. Optional Qwen2.5-7B-Instruct for CV parsing and wording, with ID validators. |
| What if the internet dies on stage? | The site runs from local files; the last snapshot is in the repo. Backup video in `docs/`. |

## Backup

Record the 60-second run as `docs/demo-backup.mp4` the night before (screen recorder, 1080p).
