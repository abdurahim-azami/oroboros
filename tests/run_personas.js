// Prints each persona's results in all three scenarios. Used to review outputs by hand.
//   node tests/run_personas.js [personaId]
const fs = require('fs');
const path = require('path');
const E = require('../site/assets/js/engine.js');

const D = path.join(__dirname, '..', 'site', 'data');
const J = (f) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const roles = J('roles.json');
const momentum = J('momentum.json');
const personas = J('personas.json');
const courses = J('courses.json').courses;
const mByCap = E.mapMomentum(momentum);

function userTasksFor(p) {
  const occ = J(`occ/${p.occupation}.json`);
  return { occ, userTasks: Object.entries(p.tasks).map(([id, h]) => ({ task: occ.tasks.find((t) => t.id === +id), hours: h })) };
}

const only = process.argv[2];
const seen = {};
for (const p of personas) {
  if (only && p.id !== only) continue;
  const { occ, userTasks } = userTasksFor(p);
  console.log(`\n=== ${p.name}: ${occ.title} (zone ${occ.zone})`);
  for (const sc of E.SCENARIOS) {
    const w = E.weekSummary(userTasks, mByCap, sc.s);
    const ctx = { roles, mByCap, s: sc.s, userTasks, currentCode: occ.code, currentZone: occ.zone };
    const { ranked, profile } = E.rankRoles(ctx);
    const comp = E.composite(ranked, profile, roles);
    console.log(`  [${sc.name}] absorb ${(w.loPct * 100).toFixed(0)}-${(w.hiPct * 100).toFixed(0)}% (mid ${(w.midPct * 100).toFixed(0)}%)  counts=${JSON.stringify(w.counts)}`);
    ranked.slice(0, 6).forEach((r, i) => {
      seen[r.code] = r.title;
      console.log(`     ${i + 1}. ${r.title.slice(0, 50).padEnd(50)} fit=${r.fit.toFixed(2)} res=${r.resilience.toFixed(2)} rank=${r.rank.toFixed(3)}${r.isCurrent ? ' (current)' : ''}`);
    });
    if (comp) {
      seen[comp.r2.code] = comp.r2.title;
      console.log(`     composite: ${(comp.r1Share * 100).toFixed(0)}% ${comp.r1.title} + ${(comp.r2Share * 100).toFixed(0)}% ${comp.r2.title}`);
    }
    if (sc.id === 'gradual') {
      const nr = E.noRegret(ctx);
      console.log('     no-regret:', nr.map((n) => n.name).join(' | '));
      const target = ranked.find((r) => !r.isCurrent);
      const plan = E.pathway({ courses, roles, mByCap, s: sc.s, userTasks, noRegret: nr, target, learnHours: p.learn_hours_per_week });
      console.log(`     plan: ${plan.steps.length} steps, ${plan.hours} h, ${plan.weeks} weeks`);
      plan.steps.forEach((st) => console.log(`        - ${st.title}: ${st.course ? st.course.title + ' (' + st.course.hours + 'h)' : 'practice only'}`));
    }
  }
}
if (!only) fs.writeFileSync(path.join(__dirname, 'roles_seen.json'), JSON.stringify(seen, null, 1));
