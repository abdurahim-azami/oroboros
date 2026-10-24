# Proposal draft: Oroboros

*Problem → approach → outcome. Edit to the official length limit before submitting.*

## Problem

Workers see headlines about AI and jobs, and career tools that suggest titles from a CV. Neither
tells a person **which of their own tasks** may change, **how fast**, or **what to learn first**
with the time and money they actually have. In Malaysia, administrative, claims, customer
service and bookkeeping roles sit in the middle of this shift: DOSM counted 555,509 online
job ads in Q2 2026, down 11.4 percent from Q1 (we use this as context, not as proof that AI
caused it).

## Approach

Oroboros treats a job as a bundle of tasks and runs three printed formulas over public data:

1. **Consume.** Each of the person's O*NET tasks gets an exposure range from three published
   datasets, scaled by a live momentum reading for its AI capability area (arXiv, Hacker News
   hiring threads, GitHub, job boards, refreshed nightly) and a scenario speed the user drags
   from *Slow drift* to *Fast Shockwave*: `A = min(1, E × m × s)`.
2. **Regrow.** Every real occupation is ranked by `Fit × Resilience`: how much of its core work
   the person already does, times how much of it survives the same scenario. A composite option
   blends two real occupations. Skills that matter in all three futures are flagged "no-regret".
3. **Plan.** Ordered steps with free, link-checked courses, hours per step, weeks at the
   person's pace, a proof task per step, and SDG targets for every role and skill.

The core runs in the browser with no language model. An optional Qwen2.5-7B-Instruct layer
reads CV text and rewrites results in plain words, and validators drop anything not in the data.

## Outcome

For Hui Min, a synthetic claims processor in Kuala Lumpur with six hours a week: AI may absorb
29 to 37 percent of her week under Gradual Erosion and 46 to 60 percent under Fast Shockwave.
Her best moves are Cost Estimators, or a 56/44 blend with Accountants and Auditors, through a
five-step, roughly 15-hour free plan tagged to SDG 4.4, 9.1 and 12.2.

**All six requirements:** intake (task triage, reflection cards, CV text) · live trend layer
(nightly, dated) · role matching (printed score, gaps, composite) · reskilling pathway (ordered,
timed, free, cited) · SDG mapping (every role and skill, with rationale) · uncertainty (three
scenarios, dataset ranges, "uncertain" label, no-regret view).

**Responsible by design:** synthetic personas only, no protected attributes in any formula
(tested), every number dated and sourced, limits stated up front, not a hiring tool.

GitHub: `<repo URL>` · Live demo: `<pages URL>`
