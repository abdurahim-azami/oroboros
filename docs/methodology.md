# Methodology

Everything below is implemented in `site/assets/js/engine.js` (scoring) and `pipeline/`
(data). Each rule is labelled **evidence** (from a published source), **assumption** (our
stated modelling choice) or **review** (a human judgement we recorded with a reason).

## 1. Tasks (evidence)

O*NET 31.0 task statements: 18,838 tasks across 923 occupations. Importance weights come from
O*NET Task Ratings (scale `IM`, 1 to 5). Each task links to Detailed Work Activities (DWAs),
which roll up to Intermediate (IWA) and Generalized Work Activities (GWA). The DWA vocabulary
is shared across occupations, which is what lets us compare jobs task by task without a
language model.

## 2. Task exposure E_t (evidence, kept separate)

| Source | Level | How it enters |
|---|---|---|
| GPTs are GPTs, GPT-4 rater label | task | E0 → 0, E2 (needs extra tools) → 0.5, E1 (direct) → 1 |
| GPTs are GPTs, human rater label | task | same mapping |
| Anthropic Economic Index, task penetration | task | only where usage was observed (> 0); zero means "not seen", not "not exposed", so it is left out |
| Felten AIOE | occupation | shown as a percentile for context, not used in A_t (it does not separate tasks inside a job) |

`low = min`, `high = max` of the available task-level values, then both are multiplied by
**0.5** (assumption): the paper defines exposure as AI cutting a task's time by at least half,
so a fully exposed task contributes half its time. `mid = (low + high) / 2`.
Coverage: 18,738 of 18,838 tasks have labels; 100 are imputed from their occupation's mean
and flagged in the UI.

## 3. Capability areas and momentum m_c (evidence + assumption)

Ten AI capability areas plus one "human-centred" area (`pipeline/config/capabilities.json`).
Each task maps to one area by a majority vote of its DWAs' GWAs
(`config/gwa_capability_map.csv`, 41 reviewed rows), a few keyword rules (for example
"translat" → Translation), and 32 hand-reviewed overrides for the five demo occupations
(`config/task_capability_reviewed.csv`, each with a reason). Output: `data/task_capability_map.csv`.

For each area and feed, with 30-day windows:

```
r_feed = sum(last 3 windows) / (sum(last 12 windows) / 4)
m_c    = clamp( geometric_mean(r_feed over feeds), 0.8, 1.2 )
```

Feeds: arXiv paper counts, HN "Who is hiring" share of comments mentioning the area,
GitHub weekly commits on reference repos, and job-board postings (after 90 days of history).
The 0.8 to 1.2 cap is an assumption so one noisy feed cannot dominate. Human-centred work has
no feed and is fixed at 1.0.

## 4. Absorption and status (assumption)

```
A_t = min(1, E_t × m_c × s)        s = 0.6 Slow drift · 1.0 Gradual Erosion · 1.6 Fast Shockwave
consumed  A ≥ 0.60
shrinking 0.35 ≤ A < 0.60
safe      A < 0.35
uncertain the low and high estimates fall in different bands
```

The week summary is the hours-weighted share: `Σ hours × A / Σ hours`, reported as a
low-to-high band. The slider moves s continuously through the three anchors.

## 5. Ranking (assumption, printed)

```
Rank       = Fit × Resilience
Fit        = Σ_j im_j × match_j / Σ_j im_j        over the role's core tasks that have DWAs
match_j    = 1    she keeps doing this exact activity (DWA) in this scenario
             0.5  same activity but AI absorbs it, or a closely related one (same IWA) she keeps
             0.25 a related activity that AI absorbs
             0    nothing similar
Resilience = Σ_j im_j × (1 − A_j,mid) / Σ_j im_j  over all the role's core tasks, same scenario
```

Realism filters (assumption): job zone within ±1 of the current job (+2 with "widen"), Fit ≥
0.30 (0.20 with "widen"), at least 3 DWA-linked core tasks. The current occupation is always
shown, labelled "your current role, redesigned".

**Composite:** take the best role R1; among the next 40, add the R2 that covers the most of her
*retained* hours that R1 misses. Shares = covered hours of each. Both are real O*NET
occupations; we never coin a title.

**No-regret skills:** DWAs that are gaps in the top-5 roles of *all three* scenarios and stay
below the consumed line even under Fast Shockwave.

**Purpose slider:** `Rank × (1 + p × S)`, where S is the role's strongest SDG tag (1 direct,
0.5 supporting or group default) and p runs from 0 to 0.5. At p = 0 it is the plain formula.

## 6. Learning plan (evidence + rule)

1. A literacy step for the capability that absorbs the most expected hours (`hours × A_mid`).
2. Gap activities, no-regret first, grouped by GWA; each group takes the shortest catalogue
   course whose primary activity matches.
3. At most one practice-only step where no verified free course exists.
Weeks = ceil(total hours ÷ weekly learning hours). Courses come only from
`site/data/courses.json` (Microsoft Learn Catalog API durations, link-checked).

## 7. SDG mapping (review)

Targets and their official text come from the UN Stats SDG API. Every recommended role gets at
least one tag: a role-specific reviewed tag (32 roles, `config/sdg_map_reviewed.csv`) or the
reviewed default for its SOC major group (23 groups). Every learning step carries SDG 4.4 plus
an activity-specific tag where one fits (`config/gwa_sdg_map.csv`). Each tag shows its target
number, the official target text and the reason.

## 8. Fairness and determinism (tested)

No name, age, gender or background enters any formula. `tests/engine.test.js` checks that
five different names with identical tasks give identical rankings, that the same inputs give
the same output, that a faster scenario never absorbs less, and that every role, course and
SDG tag shown exists in the data.
