# Self-test report

Run on 24 to 25 Oct 2026 against the first live snapshot.

## Automated

| Suite | Command | Result |
|---|---|---|
| Engine acceptance (formulas, thresholds, slider anchors, momentum cap, determinism, fairness across 5 names, monotone scenarios, Hui Min band, no invented roles, rank = fit × resilience, no invented courses, SDG coverage, synthetic personas) | `node --test tests/engine.test.js` | 12 / 12 pass |
| Server guardrails (health, unknown occupation, path injection, unknown course or task rejected before any model call) | `python -m pytest tests/test_server.py` | 4 / 4 pass |
| Copy gate (em dashes, stock words, AI tells) | grep over `site/index.html`, `site/assets/js/app.js` | 0 hits |

## In the browser (1440×900 and 375×812)

| Check | Result |
|---|---|
| Hero video loads as a Blob, scrubs forward and back, captions in all four bands | Pass |
| Settle band sits inside the ring with both buttons | Pass |
| Phone: static hero, no video request, no sideways scroll (scrollWidth = 375) | Pass |
| Persona load, occupation search (keyboard and mouse), CV text matching (7 tasks ticked for a nurse) | Pass |
| Slider Gradual → Shockwave redraws the Week Ring and task list (29–37% → 46–60%) | Pass |
| Replay selector swaps signals and re-ranks roles | Pass |
| Widen search, target switch, Purpose slider formula, Markdown export content | Pass |
| Console errors | None |

## Known issues

- The in-app preview pane pauses animation frames when hidden; use a real browser for the scroll hero.
- The jobs feed contributes to momentum only after 90 days of nightly snapshots.
- EN/BM language toggle not built (stretch).
