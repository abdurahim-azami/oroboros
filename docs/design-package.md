# Oroboros design package

The single source for every creative decision. Copy in this file ships verbatim.
Numbers are starting points, checked later with the flick test.

## 1. Brand premise

**Ouroboros: the serpent that eats its own tail and keeps growing.** AI eats some of the
tasks inside a job; what is left is not a loss, it is the seed of the next job. Every
section serves one idea: *Consume. Regrow. Plan.* The signature element, the **Week Ring**,
is the user's own week drawn as that serpent, eaten live as the scenario slider moves.

## 2. Palette (sampled from the approved hero footage)

```css
:root{
  --canvas:#0c0a1d;        /* deep ink indigo, the haze of the footage */
  --canvas-2:#13102b;
  --panel:#1a1638;         /* raised cards */
  --panel-2:#221d48;
  --accent:#6ff0de;        /* bioluminescent aqua: regrow, the CTA, focus */
  --accent-hover:#9ff7ea;
  --accent-muted:rgba(111,240,222,.16);
  --ember:#ff7a5c;         /* the coral arc: consumed */
  --gold:#f2c26b;          /* shrinking */
  --lilac:#b7a2ff;         /* uncertain, model assumptions */
  --text-secondary:#aaa4d2;
  --text-primary:#efecff;  /* pearl, the hottest core of the ring */
}
```

Not one of the banned default looks: no cream and terracotta, no acid green, no amber serif.

## 3. Type trio

- Display: **Syne** 600, 700, 800. Wide, strange, a little serpentine in the S.
- Body: **Figtree** 400, 500, 600.
- Mono: **JetBrains Mono** 400, 500, for every formula, number chip and source stamp.

## 4. Band map (Tier 1, one 4-second shot, hero 520vh (about 90vh per beat))

| Band | Range | Footage moment | Copy (verbatim) | Entrance |
|---|---|---|---|---|
| 1 | 0.00 to 0.22 | Ring at rest, embers start | Kicker "Career what-if engine". "Your job is not a title." / "It is a bundle of tasks. Some of them are about to change hands." | Blur to sharp, settled on load |
| 2 | 0.27 to 0.50 | Embers fall from the coral arc (left) | "AI eats some of them." / "Not overnight. One task at a time, faster in some futures than others." | Ember drift: characters fall into place from above |
| 3 | 0.55 to 0.77 | Aqua roots grow (right) | "What is left can regrow." / "Into a real job you can grow into, with a plan that fits your week." | Root rise: words grow up from below |
| 4 | 0.82 to 1.00 | Ring closes large, calm | "Consume. Regrow. Plan." / "See it on your own job." / buttons "Run Hui Min's job" and "Start with mine" | Staged rise inside the ring |

## 5. Static hero copy (phones, reduced motion)

"Your job, minus what AI absorbs, plus what you can grow into."
"Oroboros shows which of your tasks AI may take over, under slow and fast futures, and which real job the rest can grow into."
Buttons: "Run Hui Min's job", "Start with mine".

## 6. Below the fold (one call to action: the engine, `#engine`)

1. **The idea**: "AI changes tasks before it changes job titles." Three beats: Consume, Regrow, Plan.
2. **Meet Hui Min** (synthetic): the story, three facts, "Synthetic persona" tag.
3. **How it works**: "Three formulas. Nothing hidden." The formulas, printed, with the stated assumptions.
4. **The engine** (the interactive moment): five screens, one scenario slider that redraws the Week Ring live.
5. **Sources**: "Every number has a date." Live source table plus "Known limits, said up front."
6. **FAQ**: six real objections, answered plainly.
7. **Closing band** over the ending frame: "Your week, redrawn." Button "Run Hui Min's job".
8. **Footer**: O*NET attribution, dataset licences, model disclosure, synthetic-data statement, "Not a hiring tool."

Form handling: there is no form that sends anything. Everything runs in the browser.

## 7. Vector layer

- The Week Ring (SVG, live): task arcs, a coral "eaten" arc with a pearl head that travels clockwise.
- A self-drawing ring stroke behind "Three formulas", drawn on scroll.
- Whisper-level embers (coral, drifting down) and spores (aqua, drifting up) on one fixed canvas.
- One fixed background environment: a slow nebula drift, 90-second cycle, plus fine grain.
All of it honours reduced motion: final states shown, drives stopped.

## 8. Engineering list

Blob fetch with loading ring and watchdog, dt-normalised lerp, gated seeks, delta-gated DOM
writes, band pacing in vh, four-layer legibility (base scrim, two-sided band scrims, text
shadow token, chips), five static-hero gates live in CSS and JS, complete without video,
the quality floor in `scrub-pipeline.md`.

## 9. Copy gate

Every viewer-facing line above ships verbatim. The built page must pass the grep gate:
zero em dashes and none of: leverage, seamless, empower, unlock, robust, actionable,
data-driven, solutions. Deliberate devices ("Consume. Regrow. Plan.") are craft and stay.
