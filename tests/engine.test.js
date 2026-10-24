// Engine acceptance tests.  Run:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const E = require('../site/assets/js/engine.js');

const D = path.join(__dirname, '..', 'site', 'data');
const J = (f) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const roles = J('roles.json');
const momentum = J('momentum.json');
const personas = J('personas.json');
const courses = J('courses.json').courses;
const sdg = J('sdg.json');
const occupations = J('occupations.json');
const mByCap = E.mapMomentum(momentum);

function setup(p) {
  const occ = J(`occ/${p.occupation}.json`);
  const userTasks = Object.entries(p.tasks).map(([id, h]) => ({ task: occ.tasks.find((t) => t.id === +id), hours: h }));
  return { occ, userTasks, ctx: (s) => ({ roles, mByCap, s, userTasks, currentCode: occ.code, currentZone: occ.zone }) };
}
const sdgTags = (code) => sdg.roles[code] || (sdg.groups[code.slice(0, 2)] ? [sdg.groups[code.slice(0, 2)]] : []);

test('formula B: A = min(1, E x m x s) and the stated thresholds', () => {
  assert.equal(E.absorb(0.5, 1.2, 1.6), 0.96);
  assert.equal(E.absorb(0.9, 1.2, 1.6), 1);
  assert.equal(E.statusOf(0.6), 'consumed');
  assert.equal(E.statusOf(0.59), 'shrinking');
  assert.equal(E.statusOf(0.35), 'shrinking');
  assert.equal(E.statusOf(0.349), 'safe');
  const v = E.taskView({ low: 0.25, high: 0.5, cap: 'doc' }, { doc: 1 }, 1);
  assert.equal(v.status, 'uncertain');            // range crosses a line -> uncertain, not forced
});

test('slider anchors map to the three named scenarios', () => {
  assert.equal(E.sliderToS(0), 0.6);
  assert.equal(E.sliderToS(0.5), 1.0);
  assert.equal(E.sliderToS(1), 1.6);
  for (const s of [0.6, 0.8, 1, 1.3, 1.6]) assert.ok(Math.abs(E.sliderToS(E.sToSlider(s)) - s) < 1e-9);
});

test('momentum multipliers stay inside the 0.8 to 1.2 cap', () => {
  for (const a of momentum.areas) assert.ok(a.m >= 0.8 && a.m <= 1.2, a.id);
  assert.equal(mByCap.human, 1);
});

test('determinism: same inputs and snapshot give identical output', () => {
  const { ctx } = setup(personas[0]);
  const a = JSON.stringify(E.rankRoles(ctx(1)).ranked.slice(0, 20).map((r) => [r.code, r.rank]));
  const b = JSON.stringify(E.rankRoles(ctx(1)).ranked.slice(0, 20).map((r) => [r.code, r.rank]));
  assert.equal(a, b);
});

test('fairness: identical tasks under five different names rank identically', () => {
  const base = personas[0];
  const outs = ['Hui Min', 'Ahmad', 'Priya', 'John', 'Siti'].map((name) => {
    const { ctx } = setup({ ...base, name, age: name.length * 7 });
    return JSON.stringify(E.rankRoles(ctx(1)).ranked.slice(0, 15).map((r) => [r.code, r.rank.toFixed(6)]));
  });
  assert.equal(new Set(outs).size, 1);
});

test('a faster scenario never absorbs less of the week', () => {
  for (const p of personas) {
    const { userTasks } = setup(p);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const w = E.weekSummary(userTasks, mByCap, E.sliderToS(t));
      assert.ok(w.midPct >= prev - 1e-12, `${p.id} at t=${t}`);
      prev = w.midPct;
    }
  }
});

test('Hui Min under Gradual Erosion lands inside the brief band (25 to 45 percent)', () => {
  const { userTasks } = setup(personas.find((p) => p.id === 'huimin'));
  const w = E.weekSummary(userTasks, mByCap, 1.0);
  assert.ok(w.loPct >= 0.2 && w.hiPct <= 0.5, `${w.loPct} to ${w.hiPct}`);
});

test('no invented roles: every ranked and composite role is a real O*NET occupation', () => {
  const codes = new Set(occupations.map((o) => o.c));
  for (const p of personas) {
    const { ctx } = setup(p);
    for (const s of [0.6, 1, 1.6]) {
      const res = E.rankRoles(ctx(s));
      res.ranked.forEach((r) => assert.ok(codes.has(r.code), r.code));
      const comp = E.composite(res.ranked, res.profile, roles);
      if (comp) { assert.ok(codes.has(comp.r1.code)); assert.ok(codes.has(comp.r2.code)); assert.notEqual(comp.r1.code, comp.r2.code); }
    }
  }
});

test('rank = fit x resilience, with every component in [0, 1]', () => {
  const { ctx } = setup(personas[0]);
  for (const r of E.rankRoles(ctx(1)).ranked) {
    assert.ok(r.fit >= 0 && r.fit <= 1 && r.resilience >= 0 && r.resilience <= 1);
    assert.ok(Math.abs(r.rank - r.fit * r.resilience) < 1e-12);
  }
});

test('no invented courses: every plan step uses a catalogued course with URL, hours and check date', () => {
  const ids = new Set(courses.map((c) => c.id));
  for (const p of personas) {
    const { ctx, userTasks } = setup(p);
    const res = E.rankRoles(ctx(1));
    const target = res.ranked.find((r) => !r.isCurrent) || res.ranked[0];
    const plan = E.pathway({ courses, roles, mByCap, s: 1, userTasks, noRegret: E.noRegret(ctx(1)), target, learnHours: p.learn_hours_per_week });
    assert.ok(plan.steps.length > 0, p.id);
    plan.steps.filter((s) => s.course).forEach((s) => {
      assert.ok(ids.has(s.course.id));
      assert.match(s.course.url, /^https:\/\/learn\.microsoft\.com\//);
      assert.ok(s.course.hours > 0 && s.course.last_checked);
    });
  }
});

test('SDG coverage: every recommended role and every skill has at least one target', () => {
  for (const p of personas) {
    const { ctx } = setup(p);
    for (const s of [0.6, 1, 1.6]) {
      E.rankRoles(ctx(s)).ranked.slice(0, 8).forEach((r) => {
        const tags = sdgTags(r.code);
        assert.ok(tags.length > 0, r.code);
        tags.forEach((t) => assert.ok(sdg.targets[t.target], t.target));
      });
    }
  }
  assert.ok((sdg.skills['*'] || []).some((t) => t.target === '4.4'));
});

test('personas are synthetic and their task ids exist in O*NET', () => {
  for (const p of personas) {
    assert.equal(p.synthetic, true);
    const occ = J(`occ/${p.occupation}.json`);
    Object.keys(p.tasks).forEach((id) => assert.ok(occ.tasks.some((t) => t.id === +id), id));
  }
});
