/* Oroboros engine: every number on screen is computed here, by code, from data files.
   No LLM, no randomness. Same inputs + same snapshot = same output (tested in tests/engine.test.js).

   A. Momentum m_c       comes precomputed in data/momentum.json (see pipeline/momentum.py)
   B. Absorption         A_t = min(1, E_t * m_c * s)
   C. Ranking            Rank = Fit * Resilience   (* (1 + p * S) when the Purpose slider is used)
*/
(function (root) {
  'use strict';

  var SCENARIOS = [
    { id: 'slow', name: 'Slow drift', s: 0.6 },
    { id: 'gradual', name: 'Gradual Erosion', s: 1.0 },
    { id: 'shockwave', name: 'Fast Shockwave', s: 1.6 }
  ];
  var TH = { consumed: 0.6, shrinking: 0.35 };
  var S_MIN = 0.6, S_MAX = 1.6;
  var MIN_FIT = 0.3;   // realism filter: at least 30% of a role's core work must already be familiar

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round(v, d) { var k = Math.pow(10, d || 0); return Math.round(v * k) / k; }

  /* Slider position 0..1 -> scenario speed s, piecewise through the three named anchors. */
  function sliderToS(t) {
    t = clamp(t, 0, 1);
    return t <= 0.5 ? 0.6 + (1.0 - 0.6) * (t / 0.5) : 1.0 + (1.6 - 1.0) * ((t - 0.5) / 0.5);
  }
  function sToSlider(s) {
    s = clamp(s, S_MIN, S_MAX);
    return s <= 1 ? 0.5 * (s - 0.6) / 0.4 : 0.5 + 0.5 * (s - 1) / 0.6;
  }
  function scenarioName(s) {
    if (s < 0.8) return 'Slow drift';
    if (s <= 1.25) return 'Gradual Erosion';
    return 'Fast Shockwave';
  }

  function absorb(E, m, s) { return Math.min(1, E * m * s); }
  function statusOf(a) { return a >= TH.consumed ? 'consumed' : (a >= TH.shrinking ? 'shrinking' : 'safe'); }

  function mapMomentum(momentum) {
    var m = {};
    (momentum.areas || []).forEach(function (a) { m[a.id] = a.m; });
    return m;
  }

  /* One task under a scenario. task: {low, high, cap}. */
  function taskView(task, mByCap, s) {
    var m = mByCap[task.cap] != null ? mByCap[task.cap] : 1;
    var mid = (task.low + task.high) / 2;
    var aLo = absorb(task.low, m, s), aHi = absorb(task.high, m, s), aMid = absorb(mid, m, s);
    var stLo = statusOf(aLo), stHi = statusOf(aHi);
    return {
      m: m, aLo: aLo, aHi: aHi, aMid: aMid, stLo: stLo, stHi: stHi,
      status: stLo === stHi ? stLo : 'uncertain',
      leaning: statusOf(aMid),
      retained: aMid < TH.consumed
    };
  }

  /* userTasks: [{task, hours}] -> share of the week AI may absorb, as a band. */
  function weekSummary(userTasks, mByCap, s) {
    var H = 0, lo = 0, hi = 0, mid = 0, counts = { consumed: 0, shrinking: 0, safe: 0, uncertain: 0 };
    var consumedHours = 0;
    userTasks.forEach(function (u) {
      var v = taskView(u.task, mByCap, s);
      H += u.hours; lo += u.hours * v.aLo; hi += u.hours * v.aHi; mid += u.hours * v.aMid;
      counts[v.status] += 1;
      if (!v.retained) consumedHours += u.hours;
    });
    return {
      hours: H,
      loPct: H ? lo / H : 0, hiPct: H ? hi / H : 0, midPct: H ? mid / H : 0,
      counts: counts, consumedHours: consumedHours, retainedHours: H - consumedHours
    };
  }

  /* What she can already do, split into what she keeps and what AI absorbs in this scenario.
     Work activities come from O*NET: DWA (detailed) and IWA (the broader group a DWA sits in). */
  function retainedProfile(userTasks, mByCap, s, roles) {
    var dwas = {}, iwas = {}, dwasAll = {}, iwasAll = {}, kept = [];
    userTasks.forEach(function (u) {
      var v = taskView(u.task, mByCap, s);
      if (v.retained) kept.push({ task: u.task, hours: u.hours });
      (u.task.dwas || []).forEach(function (d) {
        var w = roles.dwa[d][2];
        dwasAll[d] = 1; iwasAll[w] = 1;
        if (v.retained) { dwas[d] = (dwas[d] || 0) + u.hours; iwas[w] = (iwas[w] || 0) + u.hours; }
      });
    });
    return { dwas: dwas, iwas: iwas, dwasAll: dwasAll, iwasAll: iwasAll, kept: kept };
  }

  /* Match credit for one role task (printed in the UI):
       1    she keeps doing this exact activity
       0.5  she does this exact activity but AI absorbs it, or she keeps a closely related one
       0.25 a closely related activity that AI absorbs
       0    nothing similar */
  var MATCH = { keep: 1, absorbedExact: 0.5, keepRelated: 0.5, absorbedRelated: 0.25 };
  function coverage(dwaList, prof, roles) {
    var best = 0;
    for (var i = 0; i < dwaList.length; i++) {
      var d = dwaList[i], w = roles.dwa[d][2];
      if (prof.dwas[d]) return MATCH.keep;
      if (prof.dwasAll[d] || prof.iwas[w]) best = Math.max(best, 0.5);
      else if (prof.iwasAll[w]) best = Math.max(best, 0.25);
    }
    return best;
  }

  /* Score one role. roleRow: [code, title, zone, aioePct, nEmerging, tasks[[im, low, high, capIdx, dwas]]] */
  function scoreRole(roleRow, prof, mByCap, s, roles, opts) {
    opts = opts || {};
    var tasks = roleRow[5];
    var fitNum = 0, fitDen = 0, resNum = 0, resDen = 0, gaps = [], drivers = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i], im = t[0], cap = roles.caps[t[3]];
      var m = mByCap[cap] != null ? mByCap[cap] : 1;
      var aMid = absorb((t[1] + t[2]) / 2, m, s);
      resNum += im * (1 - aMid); resDen += im;
      if (!t[4].length) continue;            // no DWA link: cannot be matched either way
      var cov = coverage(t[4], prof, roles);
      fitNum += im * cov; fitDen += im;
      if (cov < 1) gaps.push({ i: i, im: im, cov: cov, dwas: t[4], aMid: aMid });
      else drivers.push({ i: i, im: im, dwas: t[4] });
    }
    var fit = fitDen ? fitNum / fitDen : 0;
    var resilience = resDen ? resNum / resDen : 0;
    var S = opts.sdgScore || 0, p = opts.purpose || 0;
    gaps.sort(function (a, b) { return b.im - a.im; });
    drivers.sort(function (a, b) { return b.im - a.im; });
    return {
      code: roleRow[0], title: roleRow[1], zone: roleRow[2], aioePct: roleRow[3], emerging: roleRow[4],
      fit: fit, resilience: resilience, base: fit * resilience, S: S, purpose: p,
      rank: fit * resilience * (1 + p * S), gaps: gaps, drivers: drivers, nTasks: tasks.length
    };
  }

  /* Rank every occupation. ctx: {roles, mByCap, s, userTasks, currentCode, currentZone, purpose, sdgScoreOf, stretch} */
  function rankRoles(ctx) {
    if (!ctx.roles._byCode) {
      ctx.roles._byCode = {};
      ctx.roles.roles.forEach(function (r) { ctx.roles._byCode[r[0]] = r; });
    }
    var prof = retainedProfile(ctx.userTasks, ctx.mByCap, ctx.s, ctx.roles);
    var z = ctx.currentZone || 3;
    var maxZone = z + (ctx.stretch ? 2 : 1), minZone = z - 1;
    var minFit = ctx.minFit != null ? ctx.minFit : MIN_FIT;
    var out = [], considered = 0;
    ctx.roles.roles.forEach(function (row) {
      if (row[2] != null && (row[2] > maxZone || row[2] < minZone)) return;
      var linked = 0;
      for (var i = 0; i < row[5].length; i++) if (row[5][i][4].length) linked++;
      if (linked < 3) return;
      considered++;
      var S = ctx.sdgScoreOf ? ctx.sdgScoreOf(row[0]) : 0;
      var r = scoreRole(row, prof, ctx.mByCap, ctx.s, ctx.roles, { purpose: ctx.purpose || 0, sdgScore: S });
      r.isCurrent = row[0] === ctx.currentCode;
      if (r.fit < minFit && !r.isCurrent) return;   // a move must build on work she already knows
      out.push(r);
    });
    out.sort(function (a, b) { return b.rank - a.rank || a.code.localeCompare(b.code); });
    return { ranked: out, profile: prof, considered: considered, zones: [minZone, maxZone], minFit: minFit };
  }

  /* Composite: best role + the role that covers most of her retained hours the first one misses. */
  function composite(ranked, prof, roles, opts) {
    opts = opts || {};
    var pool = ranked.filter(function (r) { return !r.isCurrent; }).slice(0, opts.pool || 40);
    if (pool.length < 2) return null;
    var r1 = pool[0];
    var r1Dwas = roleDwaSet(r1.code, roles);
    var covered = 0, missed = [];
    prof.kept.forEach(function (k) {
      var c = taskCoveredBy(k.task.dwas || [], r1Dwas, roles);
      if (c >= 1) covered += k.hours;
      else missed.push({ k: k, c: c });
      if (c > 0 && c < 1) covered += k.hours * c;
    });
    var best = null;
    for (var j = 1; j < pool.length; j++) {
      var set = roleDwaSet(pool[j].code, roles), add = 0, hits = [];
      missed.forEach(function (x) {
        var c = taskCoveredBy(x.k.task.dwas || [], set, roles);
        var gain = Math.max(0, c - x.c) * x.k.hours;
        if (gain > 0) { add += gain; hits.push(x.k.task.id); }
      });
      if (!best || add > best.add) best = { role: pool[j], add: add, hits: hits };
    }
    if (!best || best.add <= 0) return null;
    var total = covered + best.add;
    return {
      r1: r1, r2: best.role, r1Share: covered / total, r2Share: best.add / total,
      r1Hours: covered, r2Hours: best.add, r2Tasks: best.hits,
      keptHours: prof.kept.reduce(function (a, k) { return a + k.hours; }, 0)
    };
  }

  var _dwaSetCache = {};
  function roleDwaSet(code, roles) {
    if (_dwaSetCache[code]) return _dwaSetCache[code];
    var row = roles._byCode ? roles._byCode[code] : null;
    if (!row) { roles._byCode = {}; roles.roles.forEach(function (r) { roles._byCode[r[0]] = r; }); row = roles._byCode[code]; }
    var d = {}, w = {};
    row[5].forEach(function (t) { t[4].forEach(function (x) { d[x] = 1; w[roles.dwa[x][2]] = 1; }); });
    _dwaSetCache[code] = { dwas: d, iwas: w };
    return _dwaSetCache[code];
  }
  function taskCoveredBy(dwaList, set, roles) {
    var half = false;
    for (var i = 0; i < dwaList.length; i++) {
      if (set.dwas[dwaList[i]]) return 1;
      if (set.iwas[roles.dwa[dwaList[i]][2]]) half = true;
    }
    return half ? 0.5 : 0;
  }

  /* Skills that matter in every scenario: gap DWAs shared by the top roles of all three. */
  function noRegret(ctxBase, topN) {
    topN = topN || 5;
    var tallies = SCENARIOS.map(function (sc) {
      var res = rankRoles(Object.assign({}, ctxBase, { s: sc.s }));
      var tally = {};
      res.ranked.filter(function (r) { return !r.isCurrent; }).slice(0, topN).forEach(function (r) {
        r.gaps.forEach(function (g) {
          if (g.cov > 0.5) return;
          g.dwas.forEach(function (d) {
            tally[d] = tally[d] || { im: 0, roles: {}, aMax: 0 };
            tally[d].im += g.im; tally[d].roles[r.code] = r.title;
          });
        });
      });
      return tally;
    });
    var shock = rankRoles(Object.assign({}, ctxBase, { s: 1.6 }));
    var aAtShock = {};
    shock.ranked.slice(0, 60).forEach(function (r) {
      var row = ctxBase.roles._byCode ? ctxBase.roles._byCode[r.code] : null;
      if (!row) return;
      row[5].forEach(function (t) {
        var m = ctxBase.mByCap[ctxBase.roles.caps[t[3]]] || 1, a = absorb((t[1] + t[2]) / 2, m, 1.6);
        t[4].forEach(function (d) { aAtShock[d] = Math.max(aAtShock[d] || 0, a); });
      });
    });
    var out = [];
    Object.keys(tallies[0]).forEach(function (d) {
      if (!tallies[1][d] || !tallies[2][d]) return;
      var a = aAtShock[d] != null ? aAtShock[d] : 0;
      if (a >= TH.consumed) return;             // must stay human-led even in the fast scenario
      var roleNames = {};
      tallies.forEach(function (t) { Object.keys(t[d].roles).forEach(function (c) { roleNames[c] = t[d].roles[c]; }); });
      out.push({ dwa: +d, name: ctxBase.roles.dwa[d][1], gwa: ctxBase.roles.dwa[d][3],
                 weight: tallies[0][d].im + tallies[1][d].im + tallies[2][d].im,
                 aShock: a, roles: roleNames });
    });
    out.sort(function (a, b) { return b.weight - a.weight; });
    return out.slice(0, 8);
  }

  /* Ordered learning plan from verified courses only. */
  function pathway(opts) {
    var courses = opts.courses, used = {}, steps = [], roles = opts.roles;
    // Step 1: learn to supervise the capability that absorbs most of her hours.
    var capHours = {};   // expected hours AI absorbs, per capability: hours * A_mid
    opts.userTasks.forEach(function (u) {
      var v = taskView(u.task, opts.mByCap, opts.s);
      if (u.task.cap !== 'human') capHours[u.task.cap] = (capHours[u.task.cap] || 0) + u.hours * v.aMid;
    });
    var topCap = Object.keys(capHours).sort(function (a, b) { return capHours[b] - capHours[a]; })[0];
    if (topCap) {
      var lit = courses.filter(function (c) { return c.kind === 'literacy' && c.caps.indexOf(topCap) >= 0; })
                       .sort(function (a, b) { return a.minutes - b.minutes; })[0];
      if (lit) {
        used[lit.id] = 1;
        steps.push({ kind: 'literacy', cap: topCap, capHours: capHours[topCap], course: lit, gaps: [],
                     title: 'Learn to supervise the AI that absorbs your work' });
      }
    }
    // Next steps: gap skills, no-regret first, grouped by work activity (GWA).
    var gapList = [];
    (opts.noRegret || []).forEach(function (n) { gapList.push({ dwa: n.dwa, name: n.name, gwa: n.gwa, weight: n.weight * 2, noRegret: true }); });
    (opts.target ? opts.target.gaps : []).forEach(function (g) {
      g.dwas.forEach(function (d) { gapList.push({ dwa: d, name: roles.dwa[d][1], gwa: roles.dwa[d][3], weight: g.im, noRegret: false }); });
    });
    var byGwa = {}, order = [];
    gapList.forEach(function (g) {
      if (!byGwa[g.gwa]) { byGwa[g.gwa] = { gwa: g.gwa, weight: 0, items: {}, noRegret: false }; order.push(g.gwa); }
      byGwa[g.gwa].weight += g.weight;
      byGwa[g.gwa].noRegret = byGwa[g.gwa].noRegret || g.noRegret;
      byGwa[g.gwa].items[g.dwa] = g;
    });
    order.sort(function (a, b) { return (byGwa[b].noRegret - byGwa[a].noRegret) || (byGwa[b].weight - byGwa[a].weight); });
    var practice = [], maxSteps = opts.maxSteps || 5;
    for (var i = 0; i < order.length && steps.length < maxSteps; i++) {
      var grp = byGwa[order[i]];
      // A course whose primary activity (first listed) is this one beats a shorter side match.
      var course = courses.filter(function (c) { return !used[c.id] && c.gwa.indexOf(grp.gwa) >= 0; })
                          .sort(function (a, b) { return (a.gwa.indexOf(grp.gwa) - b.gwa.indexOf(grp.gwa)) || (a.minutes - b.minutes); })[0];
      var items = Object.keys(grp.items).map(function (k) { return grp.items[k]; })
                        .sort(function (a, b) { return b.weight - a.weight; }).slice(0, 3);
      var step = { kind: course ? 'course' : 'practice', gwa: grp.gwa, gwaName: (roles.gwa || {})[grp.gwa] || grp.gwa,
                   course: course || null, gaps: items, noRegret: grp.noRegret,
                   title: (roles.gwa || {})[grp.gwa] || 'Practice' };
      if (course) { used[course.id] = 1; steps.push(step); }
      else practice.push(step);           // no verified course: keep as a practice step, at most one, at the end
    }
    if (practice.length && steps.length < maxSteps) steps.push(practice[0]);
    var hours = steps.reduce(function (a, st) { return a + (st.course ? st.course.hours : 3); }, 0);
    return { steps: steps, hours: round(hours, 1), weeks: Math.ceil(hours / Math.max(1, opts.learnHours || 1)) };
  }

  var api = {
    SCENARIOS: SCENARIOS, TH: TH, S_MIN: S_MIN, S_MAX: S_MAX, MIN_FIT: MIN_FIT, MATCH: MATCH,
    clamp: clamp, round: round, sliderToS: sliderToS, sToSlider: sToSlider, scenarioName: scenarioName,
    absorb: absorb, statusOf: statusOf, mapMomentum: mapMomentum, taskView: taskView,
    weekSummary: weekSummary, retainedProfile: retainedProfile, scoreRole: scoreRole,
    rankRoles: rankRoles, composite: composite, noRegret: noRegret, pathway: pathway
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OroEngine = api;
})(this);
