/* Oroboros engine UI: five screens over one shared state. Every number shown comes from
   OroEngine (engine.js) applied to the data files in /data. Nothing here invents a role,
   task, course or statistic: if the data does not have it, the screen says so. */
(function () {
  'use strict';
  var E = window.OroEngine;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pct = function (x) { return Math.round(x * 100) + '%'; };
  var f2 = function (x) { return (Math.round(x * 100) / 100).toFixed(2); };
  var hrs = function (x) { return String(Math.round(x * 10) / 10); };   // 15 h, 9.6 h: no trailing zeros
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) { if (!iso) return ''; var d = new Date(iso.length <= 10 ? iso + 'T00:00:00Z' : iso); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function fmtInt(n) { return Number(n).toLocaleString('en-US'); }
  var API = (new URLSearchParams(location.search).get('api')) || window.OROBOROS_API || '';

  var SDG_COLORS = ['', '#E5243B', '#DDA63A', '#4C9F38', '#C5192D', '#FF3A21', '#26BDE2', '#FCC30B', '#A21942', '#FD6925', '#DD1367', '#FD9D24', '#BF8B2E', '#3F7E44', '#0A97D9', '#56C02B', '#00689D', '#19486A'];
  var LABEL = { 0: 'E0 · not exposed', 0.5: 'E2 · exposed with extra tools', 1: 'E1 · directly exposed' };
  var CARDS = [
    { q: 'Something looks off but passes every check. What do you do?', o: [['Dig into the records myself', '4.A.2.a.4'], ['Call the people involved', '4.A.4.a.3'], ['Flag it to a senior and move on', '4.A.4.b.1']] },
    { q: 'Your team gets a new tool nobody understands.', o: [['Learn it, then show the others', '4.A.4.b.3'], ['Test it on old cases first', '4.A.2.a.1'], ['Wait for the official guide', '4.A.2.b.3']] },
    { q: 'A customer is upset and the rule is on your side.', o: [['Explain the rule clearly in writing', '4.A.4.a.1'], ['Listen first, then look for any give', '4.A.4.a.7'], ['Pass it to a supervisor', '4.A.4.a.2']] },
    { q: 'You get a free afternoon.', o: [['Clean up a messy spreadsheet', '4.A.2.a.2'], ['Redesign a slow process', '4.A.2.b.6'], ['Help a new colleague find their feet', '4.A.4.b.5']] },
    { q: 'Two urgent requests land at once.', o: [['Rank them by impact and tell both people', '4.A.2.b.6'], ['Do the quick one first', '4.A.2.b.5'], ['Ask my manager to choose', '4.A.4.a.2']] },
    { q: 'A report you sent has a mistake in it.', o: [['Send a correction that says what changed', '4.A.3.b.6'], ['Find why it happened and add a check', '4.A.2.a.3'], ['Call the reader before anything else', '4.A.4.a.4']] }
  ];

  var D = {};          // loaded data
  var S = {            // state
    step: 1, t: 0.5, s: 1.0, persona: null, occ: null, sel: {}, learnH: 6, style: {}, widen: false,
    purpose: 0, target: null, showAll: false, replayFile: 'momentum.json'
  };
  var mByCap = {}, capName = {}, cache = {};

  /* ---------------- data loading ---------------- */
  function getJSON(path) {
    if (cache[path]) return Promise.resolve(cache[path]);
    return fetch('data/' + path).then(function (r) {
      if (!r.ok) throw new Error(path + ' HTTP ' + r.status);
      return r.json();
    }).then(function (j) { cache[path] = j; return j; });
  }
  function boot() {
    if (location.protocol === 'file:') {
      bootError('The engine reads its data files over HTTP. Run <code>python -m http.server</code> inside the <code>site</code> folder and open <code>http://localhost:8000</code>.');
      return;
    }
    Promise.all(['occupations.json', 'roles.json', 'momentum.json', 'replay/index.json', 'courses.json', 'sdg.json', 'meta.json', 'personas.json']
      .map(getJSON)).then(function (r) {
      D.occupations = r[0]; D.roles = r[1]; D.momentum = r[2]; D.replay = r[3]; D.courses = r[4].courses;
      D.coursesDoc = r[4]; D.sdg = r[5]; D.meta = r[6]; D.personas = r[7];
      D.roleRow = {}; D.roles.roles.forEach(function (row) { D.roleRow[row[0]] = row; });
      setMomentum(D.momentum);
      renderReplay(); renderPersonas(); renderCards(); renderLedger(); wire();
      $('#boot').classList.add('done');
      if (pendingPersona !== null) { loadPersona(pendingPersona); pendingPersona = null; }
      else loadPersona('huimin', true);
      if (API) probeApi();
    }).catch(function (e) { bootError('Could not load the data files (' + esc(e.message) + ').'); });
  }
  function bootError(html) { var b = $('#boot'); b.classList.add('error'); b.innerHTML = html; }
  function setMomentum(m) {
    D.momentum = m; mByCap = E.mapMomentum(m);
    m.areas.forEach(function (a) { capName[a.id] = a.name; });
    var at = m.fetched_at || (m.sources.arxiv || {}).fetched_at || '';
    $('#stamp').textContent = (m.kind === 'replay' ? 'Replay · signals as of ' + fmtDate(m.as_of) : 'Live · fetched ' + fmtDate(at) + ' ' + at.slice(11, 16) + ' UTC');
  }

  /* ---------------- shared helpers ---------------- */
  function userTasks() {
    if (!S.occ) return [];
    return S.occ.tasks.filter(function (t) { return S.sel[t.id] > 0; }).map(function (t) { return { task: t, hours: S.sel[t.id] }; });
  }
  function ready() { return userTasks().length >= 1; }
  function styleGwas() { var g = {}; Object.keys(S.style).forEach(function (k) { g[CARDS[k].o[S.style[k]][1]] = 1; }); return g; }
  function sdgTags(code) {
    var t = D.sdg.roles[code];
    if (t && t.length) return t;
    var g = D.sdg.groups[code.slice(0, 2)];
    return g ? [g] : [];
  }
  function sdgScore(code) { return sdgTags(code).reduce(function (m, t) { return Math.max(m, t.strength || 0); }, 0); }
  function sdgChip(target, why) {
    var goal = parseInt(target, 10), info = D.sdg.targets[target];
    return '<span class="sdg-chip" title="' + esc('SDG ' + target + ': ' + (info ? info.title : '') + (why ? '\n' + why : '')) + '"><i style="background:' + SDG_COLORS[goal] + '">' + esc(target) + '</i>SDG ' + goal + '</span>';
  }
  function ctxFor(s) {
    return { roles: D.roles, mByCap: mByCap, s: s, userTasks: userTasks(), currentCode: S.occ ? S.occ.code : null,
             currentZone: S.occ ? S.occ.zone : 3, stretch: S.widen, minFit: S.widen ? 0.2 : E.MIN_FIT };
  }
  var memo = {};
  function memoKey(extra) { return [S.occ && S.occ.code, JSON.stringify(S.sel), S.s.toFixed(3), S.widen, S.replayFile, extra || ''].join('|'); }
  function ranking(s) {
    var k = memoKey('rank' + (s != null ? s : S.s));
    if (!memo[k]) memo[k] = E.rankRoles(ctxFor(s != null ? s : S.s));
    return memo[k];
  }
  function noRegret() {
    var k = memoKey('nr');
    if (!memo[k]) memo[k] = E.noRegret(ctxFor(S.s));
    return memo[k];
  }

  /* ---------------- step 1: intake ---------------- */
  function renderPersonas() {
    $('#personas').innerHTML = D.personas.map(function (p) {
      return '<button class="pcard" type="button" data-pid="' + p.id + '" aria-pressed="false"><em>Synthetic</em><b>' + esc(p.name) + ', ' + p.age + '</b><span>' + esc(p.headline) + '</span><span>' + esc(p.place) + '</span></button>';
    }).join('');
  }
  var pendingPersona = null;
  function loadPersona(pid, silent) {
    if (!D.personas) { pendingPersona = pid; return; }
    if (!pid) {   // "Start with mine"
      S.persona = null; S.occ = null; S.sel = {};
      $$('.pcard').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      $('#who').textContent = 'Your job';
      $('#occ-head').innerHTML = ''; $('#task-table').innerHTML = '<p class="empty">Search for your occupation above, then tick the tasks you do.</p>';
      goStep(1, true);
      setTimeout(function () { $('#occ-q').focus({ preventScroll: true }); }, 600);
      return;
    }
    var p = D.personas.filter(function (x) { return x.id === pid; })[0];
    if (!p) return;
    S.persona = p; S.learnH = p.learn_hours_per_week; S.target = null;
    $('#learn-h').value = S.learnH; $('#learn-h-out').textContent = S.learnH + ' h';
    $$('.pcard').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pid') === pid)); });
    loadOccupation(p.occupation, p.tasks).then(function () {
      $('#who').textContent = p.name + ' · ' + S.occ.title;
      if (!silent) goStep(1, true);
    });
  }
  function loadOccupation(code, preset) {
    return getJSON('occ/' + code + '.json').then(function (occ) {
      S.occ = occ; S.sel = {}; S.showAll = false; S.target = null;
      if (preset) Object.keys(preset).forEach(function (id) { S.sel[id] = preset[id]; });
      if (!S.persona) $('#who').textContent = occ.title;
      renderOccHead(); renderTasks(); invalidate();
    });
  }
  function renderOccHead() {
    var o = S.occ;
    $('#occ-head').innerHTML = '<h4>' + esc(o.title) + '</h4><span>O*NET-SOC ' + o.code + '</span><span>Job zone ' + (o.zone || 'n/a') + '</span><span>' + o.tasks.length + ' tasks · O*NET 31.0</span>' +
      (o.aioe_pct != null ? '<span>Felten AIOE: ' + Math.round(o.aioe_pct * 100) + 'th percentile</span>' : '') +
      '<span><a href="https://www.onetonline.org/link/summary/' + o.code + '" target="_blank" rel="noopener">O*NET OnLine ↗</a></span>';
  }
  function renderTasks() {
    var o = S.occ, tasks = o.tasks.slice();
    tasks.sort(function (a, b) { return (S.sel[b.id] > 0) - (S.sel[a.id] > 0) || (b.im || 0) - (a.im || 0); });
    var shown = S.showAll ? tasks : tasks.slice(0, 12);
    var total = Object.keys(S.sel).reduce(function (a, k) { return a + (S.sel[k] || 0); }, 0);
    var html = '<div class="hours-bar"><span>Your week</span><div class="hours-bar__track"><div class="hours-bar__fill" style="transform:scaleX(' + Math.min(1, total / 40) + ')"></div></div><b>' + total + ' h mapped</b></div>';
    html += shown.map(function (t) {
      var on = S.sel[t.id] > 0, h = S.sel[t.id] || 0;
      return '<div class="task-row' + (on ? ' on' : '') + '" data-tid="' + t.id + '"><input type="checkbox" id="t' + t.id + '"' + (on ? ' checked' : '') + '>' +
        '<label for="t' + t.id + '">' + esc(t.text) + '<span class="ttype">' + esc(t.type) + '</span></label>' +
        '<div class="stepper" aria-label="Hours per week"><button type="button" data-d="-1" aria-label="One hour less">−</button><output>' + h + ' h</output><button type="button" data-d="1" aria-label="One hour more">+</button></div></div>';
    }).join('');
    if (tasks.length > 12) html += '<button type="button" class="btn btn--ghost btn--small more-tasks" id="more">' + (S.showAll ? 'Show fewer' : 'Show all ' + tasks.length + ' tasks') + '</button>';
    $('#task-table').innerHTML = html;
  }
  function renderCards() {
    $('#cards').innerHTML = CARDS.map(function (c, i) {
      return '<div class="rcard"><p>' + (i + 1) + '. ' + esc(c.q) + '</p><div class="opts">' + c.o.map(function (o, j) {
        return '<button type="button" data-card="' + i + '" data-opt="' + j + '" aria-pressed="' + (S.style[i] === j) + '">' + esc(o[0]) + '</button>';
      }).join('') + '</div></div>';
    }).join('') + '<p class="style-tags" id="style-tags"></p>';
    renderStyleTags();
  }
  function renderStyleTags() {
    var g = Object.keys(styleGwas());
    $('#style-tags').innerHTML = g.length ? '<b>Your work style leans to:</b> ' + g.map(function (id) { return esc(D.roles.gwa[id] || id); }).join(' · ') + '<br><span class="muted">Roles that share these activities get a "matches your style" badge.</span>' : '';
  }

  /* occupation search: a small accessible combobox over 923 titles */
  var qActive = -1, qItems = [];
  function searchOcc(q) {
    q = q.trim().toLowerCase();
    var list = $('#occ-list');
    if (q.length < 2) { list.hidden = true; $('#occ-q').setAttribute('aria-expanded', 'false'); return; }
    var words = q.split(/\s+/);
    qItems = D.occupations.filter(function (o) { var t = o.t.toLowerCase(); return words.every(function (w) { return t.indexOf(w) >= 0; }); })
      .sort(function (a, b) { return a.t.toLowerCase().indexOf(words[0]) - b.t.toLowerCase().indexOf(words[0]) || a.t.length - b.t.length; }).slice(0, 12);
    qActive = -1;
    list.innerHTML = qItems.length ? qItems.map(function (o, i) { return '<li role="option" id="oq' + i + '" data-code="' + o.c + '" aria-selected="false">' + esc(o.t) + '<small>' + o.c + ' · ' + o.n + ' tasks</small></li>'; }).join('')
      : '<li aria-disabled="true">No match. Try a broader word.</li>';
    list.hidden = false; $('#occ-q').setAttribute('aria-expanded', 'true');
  }
  function pickOcc(code) {
    var o = D.occupations.filter(function (x) { return x.c === code; })[0];
    $('#occ-list').hidden = true; $('#occ-q').setAttribute('aria-expanded', 'false');
    $('#occ-q').value = o ? o.t : '';
    S.persona = null; $$('.pcard').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    loadOccupation(code);
  }

  /* CV text: local word-overlap matcher (LLM extraction is optional, see server/) */
  var STOP = 'a an and are as at be by for from has have i in is it of on or our that the their this to was were will with my me we you your us they them he she his her also into than then over per via etc'.split(' ');
  function toks(s) {
    return s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && STOP.indexOf(w) < 0; })
      .map(function (w) { return w.replace(/(ing|ed|es|s)$/, ''); });
  }
  function cvMatch() {
    var text = $('#cv').value;
    var bag = {}; toks(text).forEach(function (w) { bag[w] = 1; });
    var out = $('#cv-out');
    if (Object.keys(bag).length < 4) { out.textContent = 'Paste a few sentences about what you do day to day.'; return; }
    if (!S.occ) {
      var scored = D.occupations.map(function (o) { var t = toks(o.t), hit = t.filter(function (w) { return bag[w]; }).length; return { o: o, sc: hit / Math.max(1, t.length) }; })
        .filter(function (x) { return x.sc > 0; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 5);
      out.innerHTML = scored.length ? 'Closest occupations by title: ' + scored.map(function (x) { return '<a href="#" data-code="' + x.o.c + '">' + esc(x.o.t) + '</a>'; }).join(' · ') + '. Pick one, then run this again to tick tasks.'
        : 'No occupation title matched. Search for one above first.';
      return;
    }
    if (apiOk) {   // the LLM may only pick ids from this occupation's list; the server drops anything else
      out.textContent = 'Reading your text with the language model.';
      fetch(API.replace(/\/$/, '') + '/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv_text: text, occupation: S.occ.code }) }).then(function (r) { return r.json(); }).then(function (j) {
        (j.task_ids || []).forEach(function (id) { if (!(S.sel[id] > 0)) S.sel[id] = 4; });
        out.textContent = 'The model matched ' + (j.task_ids || []).length + ' tasks' + (j.dropped && j.dropped.length ? ' (' + j.dropped.length + ' unknown ids dropped)' : '') + '. Check them and set the hours.';
        renderTasks(); invalidate();
      }).catch(function () { apiOk = false; cvMatch(); });
      return;
    }
    var scoredT = S.occ.tasks.map(function (t) { var tt = toks(t.text), hit = tt.filter(function (w) { return bag[w]; }).length; return { t: t, sc: hit / Math.sqrt(Math.max(1, tt.length)) }; })
      .filter(function (x) { return x.sc >= 0.6; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 8);
    scoredT.forEach(function (x) { if (!(S.sel[x.t.id] > 0)) S.sel[x.t.id] = 4; });
    out.textContent = scoredT.length ? 'Ticked ' + scoredT.length + ' tasks that share words with your text. Check them and set the hours.' : 'No task matched closely. Tick tasks by hand.';
    renderTasks(); invalidate();
  }

  /* ---------------- step 2: radar ---------------- */
  function spark(series) {
    if (!series || series.length < 2) return '';
    var max = Math.max.apply(null, series), min = Math.min.apply(null, series), W = 240, H = 42;
    var pts = series.map(function (v, i) { return [i / (series.length - 1) * W, H - 4 - ((v - min) / Math.max(1e-9, max - min)) * (H - 8)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="' + d + ' L' + W + ' ' + H + ' L0 ' + H + 'Z"/><path d="' + d + '"/></svg>';
  }
  function renderRadar() {
    var m = D.momentum, src = m.sources;
    $('#m-formula').textContent = m.formula;
    var capH = {};
    userTasks().forEach(function (u) { capH[u.task.cap] = (capH[u.task.cap] || 0) + u.hours; });
    $('#radar').innerHTML = m.areas.slice().sort(function (a, b) { return (capH[b.id] || 0) - (capH[a.id] || 0); }).map(function (a) {
      var dir = a.no_feed ? 'flat' : (a.m > 1.03 ? 'up' : (a.m < 0.97 ? 'down' : 'flat'));
      var word = a.no_feed ? 'fixed' : { up: 'rising', down: 'cooling', flat: 'steady' }[dir];
      var pos = ((a.m - 0.8) / 0.4 * 100).toFixed(1);
      var f = a.feeds, chips = [];
      if (f.arxiv) chips.push('<span class="src"><b>arXiv</b> · fetched ' + fmtDate(f.arxiv.fetched_at || src.arxiv.fetched_at) + ((src.arxiv.older_areas || []).indexOf(a.id) >= 0 ? ' (last good snapshot)' : '') + ' · ' + fmtInt(f.arxiv.last90) + ' papers in 90 days</span>');
      if (f.github) chips.push('<span class="src"><b>GitHub</b> · ' + f.github.repos.length + ' reference repos · ' + fmtInt(f.github.series.slice(-3).reduce(function (x, y) { return x + y; }, 0)) + ' commits in 90 days</span>');
      if (f.hn) chips.push('<span class="src"><b>HN hiring</b> · ' + fmtInt(f.hn.last90_mentions) + ' keyword mentions in 90 days</span>');
      if (f.jobs) chips.push('<span class="src"><b>Job boards</b> · ratio ' + f2(f.jobs.ratio) + '</span>');
      if (a.no_feed) chips.push('<span class="src">No feed by design. Care, trust and leadership have no paper count.</span>');
      if (a.capped) chips.push('<span class="src">Raw ratio ' + f2(a.raw_ratio) + ', capped to ' + f2(a.m) + '</span>');
      return '<article class="cap' + (capH[a.id] ? ' touch' : '') + (a.no_feed ? ' human' : '') + '">' +
        '<span class="cap__m ' + dir + '">×' + f2(a.m) + '</span><h4>' + esc(a.name) + '</h4><p>' + esc(a.blurb) + '</p>' +
        (capH[a.id] ? '<span class="tag tag--aqua touch-tag">Touches ' + capH[a.id] + ' h of your week</span>' : '') +
        '<div class="gauge" role="img" aria-label="Momentum ' + f2(a.m) + ', ' + word + '"><i style="left:' + pos + '%"></i></div>' +
        '<div class="gauge__ends"><span>0.8 cooling</span><span>' + word + '</span><span>1.2 rising</span></div>' +
        (f.arxiv ? spark(f.arxiv.series) : '') + '<div class="srcs">' + chips.join('') + '</div></article>';
    }).join('');
    $('#jobs-note').textContent = m.jobs_note + ' Signals snapshot: ' + fmtDate(m.as_of) + (m.kind === 'replay' ? ' (replay, rebuilt from the same historical counts).' : '.');
  }

  /* ---------------- step 3: consume ---------------- */
  function arcPath(cx, cy, r0, r1, a0, a1) {
    var p = function (r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    var large = a1 - a0 > Math.PI ? 1 : 0, A = p(r1, a0), B = p(r1, a1), C = p(r0, a1), Dd = p(r0, a0);
    return 'M' + A[0].toFixed(2) + ' ' + A[1].toFixed(2) + ' A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + B[0].toFixed(2) + ' ' + B[1].toFixed(2) +
      ' L' + C[0].toFixed(2) + ' ' + C[1].toFixed(2) + ' A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + Dd[0].toFixed(2) + ' ' + Dd[1].toFixed(2) + 'Z';
  }
  function renderConsume() {
    var ut = userTasks();
    if (!ut.length) { $('#summary').textContent = 'Pick a job and tick some tasks first.'; $('#tasks-out').innerHTML = ''; $('#counts').innerHTML = ''; $('#week-ring').innerHTML = ''; return; }
    var w = E.weekSummary(ut, mByCap, S.s), name = E.scenarioName(S.s);
    var rows = ut.map(function (u) { return { u: u, v: E.taskView(u.task, mByCap, S.s) }; }).sort(function (a, b) { return b.v.aMid - a.v.aMid; });
    // ring
    var cx = 200, cy = 200, r0 = 116, r1 = 148, gap = 0.022, a = -Math.PI / 2, total = w.hours;
    var svg = '<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#b7a2ff"/><rect width="3.5" height="7" fill="#ff7a5c"/></pattern>' +
      '<radialGradient id="core"><stop offset="0" stop-color="rgba(111,240,222,.10)"/><stop offset="1" stop-color="rgba(12,10,29,0)"/></radialGradient></defs>' +
      '<title>Your week as a ring</title><circle cx="200" cy="200" r="112" fill="url(#core)"/>';
    rows.forEach(function (x) {
      var span = x.u.hours / total * Math.PI * 2;
      var a0 = a + gap / 2, a1 = a + span - gap / 2;
      if (a1 > a0) svg += '<path class="seg ' + x.v.status + '" data-tid="' + x.u.task.id + '" d="' + arcPath(cx, cy, r0, r1, a0, a1) + '"><title>' + esc(x.u.task.text) + ' · ' + x.u.hours + ' h · A ' + f2(x.v.aLo) + ' to ' + f2(x.v.aHi) + '</title></path>';
      a += span;
    });
    var C = 2 * Math.PI * 170, lo = w.loPct, hi = w.hiPct, mid = w.midPct;
    svg += '<circle class="band-arc" cx="200" cy="200" r="170" stroke-width="14" transform="rotate(-90 200 200)" stroke-dasharray="' + ((hi - lo) * C).toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-lo * C).toFixed(1) + '"/>';
    svg += '<circle class="eaten" cx="200" cy="200" r="170" stroke-width="6" transform="rotate(-90 200 200)" stroke-dasharray="' + (mid * C).toFixed(1) + ' ' + C.toFixed(1) + '"/>';
    var ha = -Math.PI / 2 + mid * Math.PI * 2;
    svg += '<circle class="head" cx="' + (200 + 170 * Math.cos(ha)).toFixed(1) + '" cy="' + (200 + 170 * Math.sin(ha)).toFixed(1) + '" r="9"/>';
    svg += '<text class="ring-pct" x="200" y="214">' + pct(mid) + '</text><text class="ring-band" x="200" y="242">' + pct(lo) + ' to ' + pct(hi) + ' of your week</text><text class="ring-scen" x="200" y="150">' + esc(name) + '</text>';
    $('#week-ring').innerHTML = svg;

    $('#summary').innerHTML = 'AI may absorb roughly <em>' + pct(lo) + ' to ' + pct(hi) + '</em> of your week under ' + esc(name) + '. That is about ' + Math.round(mid * w.hours) + ' of your ' + w.hours + ' hours.';
    var c = w.counts;
    $('#counts').innerHTML = ['consumed', 'shrinking', 'safe', 'uncertain'].map(function (k) { return '<span class="pill ' + k + '">' + c[k] + ' ' + k + '</span>'; }).join('');
    var open = {}; $$('#tasks-out details[open]').forEach(function (d) { open[d.getAttribute('data-tid')] = 1; });
    $('#tasks-out').innerHTML = rows.map(function (x) {
      var t = x.u.task, v = x.v, e = t.e;
      var srcs = '<li>GPT-4 rater: ' + (e.gpt4 != null ? LABEL[e.gpt4] : 'no label') + '</li><li>Human rater: ' + (e.human != null ? LABEL[e.human] : 'no label') + '</li><li>Anthropic Economic Index: ' + (e.aei != null ? 'usage observed, penetration ' + f2(e.aei) : 'no usage observed (left out of the range)') + '</li>' + (t.imputed ? '<li>No task-level label: band uses this occupation\'s average (imputed).</li>' : '');
      return '<li><details class="tout" data-tid="' + t.id + '"' + (open[t.id] ? ' open' : '') + '><summary><span class="pill ' + v.status + '">' + v.status + '</span><span class="t">' + esc(t.text) + (v.status === 'uncertain' ? '<small class="range">datasets disagree: ' + v.stLo + ' to ' + v.stHi + '</small>' : '') + '</span><span class="h">' + x.u.hours + ' h</span>' +
        '<span class="abar" aria-hidden="true"><span class="abar__th" style="left:35%"></span><span class="abar__th" style="left:60%"></span><span class="abar__band" style="left:' + (v.aLo * 100).toFixed(1) + '%;width:' + Math.max(1.2, (v.aHi - v.aLo) * 100).toFixed(1) + '%"></span><span class="abar__mid" style="left:' + (v.aMid * 100).toFixed(1) + '%"></span></span></summary>' +
        '<div class="why"><b>Why.</b> Capability: ' + esc(capName[t.cap] || t.cap) + ' (momentum ×' + f2(v.m) + ', mapped by ' + (t.capMethod === 'reviewed' ? 'hand review' : t.capMethod === 'keyword' ? 'keyword rule' : 'O*NET work-activity vote') + ').' +
        '<code>A = min(1, E × m × s)  low: min(1, ' + f2(t.low) + ' × ' + f2(v.m) + ' × ' + f2(S.s) + ') = ' + f2(v.aLo) + '   high: min(1, ' + f2(t.high) + ' × ' + f2(v.m) + ' × ' + f2(S.s) + ') = ' + f2(v.aHi) + '</code>' +
        '<ul>' + srcs + '</ul></div></details></li>';
    }).join('');
  }

  /* ---------------- step 4: regrow ---------------- */
  function dwaNames(list, n) {
    var seen = {}, out = [];
    list.forEach(function (g) { g.dwas.forEach(function (d) { var nm = D.roles.dwa[d][1]; if (!seen[nm] && out.length < n) { seen[nm] = 1; out.push({ name: nm, cov: g.cov }); } }); });
    return out;
  }
  function matchesStyle(code) {
    var g = styleGwas(); if (!Object.keys(g).length) return false;
    return D.roleRow[code][5].some(function (t) { return t[4].some(function (d) { return g[D.roles.dwa[d][3]]; }); });
  }
  function renderRegrow() {
    if (!ready()) { $('#roles').innerHTML = '<li class="empty">Pick a job and tick some tasks first.</li>'; $('#composite').innerHTML = ''; return; }
    var res = ranking(), ranked = res.ranked;
    $('#rank-count').textContent = 'Scored ' + res.considered + ' real occupations in job zones ' + res.zones[0] + ' to ' + res.zones[1] + '. ' +
      ranked.filter(function (r) { return !r.isCurrent; }).length + ' cleared the realism filter (Fit ≥ ' + f2(res.minFit) + '). Scenario: ' + E.scenarioName(S.s) + ', s = ' + f2(S.s) + '.';
    var comp = E.composite(ranked, res.profile, D.roles);
    $('#composite').innerHTML = comp ? '<div class="comp"><p class="comp__k">Composite option · two real occupations, no invented title</p>' +
      '<p class="comp__h">About <b>' + pct(comp.r1Share) + ' ' + esc(comp.r1.title) + '</b> (your retained tasks) + <span class="b2">' + pct(comp.r2Share) + ' ' + esc(comp.r2.title) + '</span> (tasks the first one misses)</p>' +
      '<div class="comp__bar"><span class="a" style="flex-grow:' + comp.r1Share + '"></span><span class="b" style="flex-grow:' + comp.r2Share + '"></span></div>' +
      '<div class="comp__legend"><span>' + hrs(comp.r1Hours) + ' of your ' + hrs(comp.keptHours) + ' kept hours fit the first role</span><span>+' + hrs(comp.r2Hours) + ' h covered by adding the second</span></div></div>'
      : '<div class="empty">No second role adds coverage of your kept tasks in this scenario, so there is no composite to show.</div>';
    var top = ranked.slice(0, 8);
    $('#roles').innerHTML = top.length ? top.map(function (r, i) {
      var drivers = dwaNames(r.drivers.map(function (d) { return { dwas: d.dwas, cov: 1 }; }), 4);
      var gaps = dwaNames(r.gaps, 5);
      var tags = sdgTags(r.code);
      var badges = (r.isCurrent ? '<span class="tag tag--lilac">Your current role, redesigned</span>' : '') +
        (matchesStyle(r.code) ? '<span class="tag tag--aqua">Matches your style</span>' : '') +
        (r.emerging ? '<span class="tag tag--gold">' + r.emerging + ' emerging task' + (r.emerging > 1 ? 's' : '') + '</span>' : '') +
        tags.slice(0, 2).map(function (t) { return sdgChip(t.target, t.why); }).join('');
      return '<li><details class="role' + (r.isCurrent ? ' current' : '') + '" style="--i:' + i + '"><summary><span class="role__n">' + (i + 1) + '</span><div><p class="role__t">' + esc(r.title) + '</p><div class="role__badges">' + badges + '</div></div>' +
        '<div class="role__score"><b>' + f2(r.rank) + '</b>' + f2(r.fit) + ' × ' + f2(r.resilience) + (r.purpose ? ' × ' + f2(1 + r.purpose * r.S) : '') + '</div>' +
        '<div class="bars"><span class="bar fit">Fit ' + pct(r.fit) + '<i><b style="transform:scaleX(' + r.fit.toFixed(3) + ')"></b></i></span><span class="bar res">Resilience ' + pct(r.resilience) + '<i><b style="transform:scaleX(' + r.resilience.toFixed(3) + ')"></b></i></span></div></summary>' +
        '<div class="role__body"><div><h5>Kept from your work</h5><ul>' + (drivers.length ? drivers.map(function (d) { return '<li>' + esc(d.name) + '</li>'; }).join('') : '<li>Nothing exact yet</li>') + '</ul></div>' +
        '<div><h5>Gap to close</h5><ul>' + gaps.map(function (d) { return '<li>' + esc(d.name) + ' <span class="muted small">(' + (d.cov > 0 ? 'partly familiar' : 'new') + ')</span></li>'; }).join('') + '</ul></div>' +
        '<div class="full small muted">O*NET-SOC ' + r.code + ' · job zone ' + r.zone + ' · ' + r.nTasks + ' core tasks' + (r.aioePct != null ? ' · Felten AIOE ' + Math.round(r.aioePct * 100) + 'th percentile' : '') +
        ' · <a class="role__link" href="https://www.onetonline.org/link/summary/' + r.code + '" target="_blank" rel="noopener">O*NET OnLine ↗</a> · <a class="role__link" href="#" data-plan="' + r.code + '">Plan toward this role</a></div></div></details></li>';
    }).join('') : '<li class="empty">No role cleared the realism filter. Try "Widen the search".</li>';
    var nr = noRegret();
    $('#noregret').innerHTML = nr.length ? nr.map(function (n) { return '<li title="Needed by: ' + esc(Object.keys(n.roles).map(function (c) { return n.roles[c]; }).join(', ')) + '">' + esc(n.name) + '</li>'; }).join('')
      : '<li style="background:none;color:var(--text-secondary);padding:0">No gap was shared by the top roles of all three futures. That usually means the futures point in different directions: follow the composite.</li>';
    $('#compare').innerHTML = E.SCENARIOS.map(function (sc) {
      var rr = ranking(sc.s).ranked.filter(function (r) { return !r.isCurrent; }).slice(0, 3);
      return '<div><h5>' + sc.name + '</h5><ol>' + (rr.length ? rr.map(function (r) { return '<li>' + esc(r.title) + '</li>'; }).join('') : '<li>none passed</li>') + '</ol></div>';
    }).join('');
  }

  /* ---------------- step 5: plan + SDG ---------------- */
  function targetRole() {
    var ranked = ranking().ranked;
    var code = S.target || (ranked.filter(function (r) { return !r.isCurrent; })[0] || ranked[0] || {}).code;
    return { ranked: ranked, role: ranked.filter(function (r) { return r.code === code; })[0] || null };
  }
  function renderPlan() {
    if (!ready()) { $('#steps').innerHTML = '<li class="empty">Pick a job and tick some tasks first.</li>'; return; }
    var tr = targetRole(), role = tr.role;
    var opts = tr.ranked.slice(0, 8);
    if (S.target && !opts.some(function (r) { return r.code === S.target; }) && role) opts.push(role);
    $('#target').innerHTML = opts.map(function (r) { return '<option value="' + r.code + '"' + (role && r.code === role.code ? ' selected' : '') + '>' + esc(r.title) + (r.isCurrent ? ' (stay and reshape)' : '') + '</option>'; }).join('');
    if (!role) { $('#steps').innerHTML = '<li class="empty">No target role in this scenario.</li>'; return; }
    var nr = noRegret();
    var plan = E.pathway({ courses: D.courses, roles: D.roles, mByCap: mByCap, s: S.s, userTasks: userTasks(), noRegret: nr, target: role, learnHours: S.learnH });
    S.lastPlan = { plan: plan, role: role, nr: nr };
    $('#plan-stats').innerHTML = '<dt>Steps</dt><dd>' + plan.steps.length + '</dd><dt>Hours</dt><dd>' + plan.hours + '</dd><dt>Weeks</dt><dd>' + plan.weeks + '</dd><dt>Cost</dt><dd>RM0</dd>' +
      '<dt style="grid-column:1/-1;grid-row:3;text-transform:none;letter-spacing:0;margin-top:6px">at ' + S.learnH + ' h a week · practice steps counted as 3 h</dt>';
    $('#steps').innerHTML = plan.steps.map(function (st, i) {
      var gapsTxt = st.gaps.map(function (g) { return esc(g.name.replace(/\.$/, '')); }).join(' · ');
      var why = st.kind === 'literacy'
        ? 'AI is likely to absorb about ' + hrs(st.capHours) + ' hours of your week in ' + esc(capName[st.cap] || st.cap) + '. Learn how it works and how to check its output, so you supervise it instead of competing with it.'
        : 'Closes: ' + gapsTxt + '.';
      var gwaTags = (D.sdg.skills['*'] || []).concat(st.gwa ? (D.sdg.skills[st.gwa] || []) : []);
      var course = st.course ? '<div class="course"><a href="' + esc(st.course.url) + '" target="_blank" rel="noopener">' + esc(st.course.title) + '</a><span class="hrs">' + st.course.hours + ' h · RM0</span>' +
        '<span class="meta">' + esc(st.course.provider) + ' · ' + esc((st.course.level || []).join(', ')) + ' · ' + (st.course.modules || '?') + ' modules · link checked ' + fmtDate(st.course.last_checked) + ' · HRD Corp claimable: not confirmed</span></div>'
        : '<div class="course" style="background:var(--lilac-muted);border-color:rgba(183,162,255,.3)"><span>No verified free course in the catalogue for this yet. This step is practice with feedback.</span><span class="hrs" style="color:var(--lilac)">~3 h</span></div>';
      var proof = st.course ? st.course.proof_task : 'Do "' + (st.gaps[0] ? st.gaps[0].name.replace(/\.$/, '') : 'this activity') + '" on a synthetic case, then ask an experienced colleague to review it against how they would do it.';
      return '<li class="step' + (st.kind === 'practice' ? ' practice' : '') + '" style="--i:' + i + '"><span class="step__n">' + (i + 1) + '</span><div class="step__card">' +
        '<p class="step__k">' + (st.kind === 'literacy' ? 'Supervise the tool' : esc(st.gwaName)) + (st.noRegret ? ' <span class="tag tag--aqua">no-regret</span>' : '') + '</p>' +
        '<h4 class="step__t">' + esc(st.kind === 'literacy' ? st.title : (st.gaps[0] ? st.gaps[0].name.replace(/\.$/, '') : st.title)) + '</h4><p class="step__why">' + why + '</p>' + course +
        '<p class="proof"><b>Proof task</b>' + esc(proof) + '</p><div class="sdgs">' + gwaTags.map(function (t) { return sdgChip(t.target, t.why); }).join('') + '</div></div></li>';
    }).join('');
    renderSdg(role, plan);
    renderPurpose();
    renderExplain(role, plan, nr);
  }
  function renderSdg(role, plan) {
    var tags = sdgTags(role.code);
    $('#sdg-role').innerHTML = '<p class="muted small">Role: ' + esc(role.title) + '</p><div class="sdg-role">' + tags.map(function (t) {
      var info = D.sdg.targets[t.target] || {}, goal = parseInt(t.target, 10);
      return '<div class="sdg-item"><i style="background:' + SDG_COLORS[goal] + '">' + esc(t.target) + '</i><p><b>' + esc(t.why) + '</b><small>Target ' + esc(t.target) + ': ' + esc((info.title || '').slice(0, 150)) + ((info.title || '').length > 150 ? '…' : '') + '</small><small>' + esc(t.review) + (t.group ? ' · ' + esc(t.group) : '') + '</small></p></div>';
    }).join('') + '</div>';
    var count = {};
    plan.steps.forEach(function (st) { (D.sdg.skills['*'] || []).concat(st.gwa ? (D.sdg.skills[st.gwa] || []) : []).forEach(function (t) { count[t.target] = (count[t.target] || 0) + 1; }); });
    $('#sdg-skills').innerHTML = '<p class="muted small">Skills in this plan</p><div class="sdgs">' + Object.keys(count).map(function (k) { return sdgChip(k) + '<span class="muted small" style="align-self:center">×' + count[k] + '</span>'; }).join('') + '</div>';
    $('#mys').innerHTML = (D.sdg.malaysia || []).map(function (x) { return '<li><b>' + x.value + '%</b>' + esc(x.label) + '<small>SDG ' + x.indicator + ' · Malaysia · ' + x.year + ' · ' + esc(x.source) + '</small></li>'; }).join('') || '<li>Malaysia indicators unavailable in this snapshot.</li>';
  }
  function renderPurpose() {
    var p = S.purpose;
    $('#purpose-out').textContent = 'p = ' + f2(p);
    var ctx = ctxFor(S.s); ctx.purpose = p; ctx.sdgScoreOf = sdgScore;
    var rr = E.rankRoles(ctx).ranked.filter(function (r) { return !r.isCurrent; }).slice(0, 5);
    $('#purpose-list').innerHTML = rr.map(function (r) { return '<li>' + esc(r.title) + ' <code>' + f2(r.fit) + ' × ' + f2(r.resilience) + ' × (1 + ' + f2(p) + ' × ' + f2(r.S) + ') = ' + f2(r.rank) + '</code></li>'; }).join('');
  }
  function planNarrative(role, plan, nr) {
    var w = E.weekSummary(userTasks(), mByCap, S.s), name = E.scenarioName(S.s);
    var rows = userTasks().map(function (u) { return { u: u, v: E.taskView(u.task, mByCap, S.s) }; }).sort(function (a, b) { return b.v.aMid - a.v.aMid; });
    var first = rows[0], safest = rows[rows.length - 1];
    var who = S.persona ? S.persona.name : 'You';
    var p1 = 'Under ' + name + ', AI may absorb about ' + pct(w.loPct) + ' to ' + pct(w.hiPct) + ' of ' + (S.persona ? who + '\'s' : 'your') + ' ' + w.hours + '-hour week. The most exposed task is "' + first.u.task.text.replace(/\.$/, '') + '"; the most durable is "' + safest.u.task.text.replace(/\.$/, '') + '".';
    var p2 = role.isCurrent ? 'The strongest option is to stay and reshape the current role: Fit ' + f2(role.fit) + ' × Resilience ' + f2(role.resilience) + '.'
      : 'The best move from the work that remains is ' + role.title + ': it already matches ' + pct(role.fit) + ' of that role\'s core work, and ' + pct(role.resilience) + ' of the role holds up in the same scenario (score ' + f2(role.rank) + ').';
    var p3 = 'The plan has ' + plan.steps.length + ' steps, about ' + plan.hours + ' hours, so roughly ' + plan.weeks + ' weeks at ' + S.learnH + ' hours a week, and every course is free.' + (nr.length ? ' Skills worth learning in every future: ' + nr.slice(0, 3).map(function (n) { return n.name.replace(/\.$/, '').toLowerCase(); }).join('; ') + '.' : '');
    return [p1, p2, p3];
  }
  function renderExplain(role, plan, nr) {
    var paras = planNarrative(role, plan, nr);
    $('#explain').innerHTML = paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    if (apiOk) explainWithLlm(role, plan, nr, paras);
  }

  /* optional LLM: only phrases computed results; the server validates every id */
  var apiOk = false;
  function probeApi() {
    fetch(API.replace(/\/$/, '') + '/api/health').then(function (r) { return r.json(); }).then(function (j) {
      apiOk = !!j.llm; $('#llm-stamp').textContent = apiOk ? 'LLM: ' + j.model + ' · grounded on computed results' : 'LLM: server up, model not configured · template text';
    }).catch(function () { apiOk = false; });
  }
  function explainWithLlm(role, plan, nr, fallback) {
    fetch(API.replace(/\/$/, '') + '/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      facts: fallback, role_code: role.code, task_ids: userTasks().map(function (u) { return u.task.id; }),
      course_ids: plan.steps.filter(function (s) { return s.course; }).map(function (s) { return s.course.id; }), occupation: S.occ.code
    }) }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.text && j.validated) $('#explain').innerHTML = j.text.split(/\n+/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    }).catch(function () {});
  }
  function downloadMd() {
    var lp = S.lastPlan; if (!lp) return;
    var role = lp.role, plan = lp.plan, w = E.weekSummary(userTasks(), mByCap, S.s), m = D.momentum;
    var L = [];
    L.push('# Oroboros plan: ' + (S.persona ? S.persona.name + ' (synthetic persona)' : 'my job'));
    L.push('', '> Generated ' + new Date().toISOString().slice(0, 10) + ' by Oroboros. Decision aid only, not a hiring or job-loss prediction.', '');
    L.push('## Situation', '', '- Occupation: **' + S.occ.title + '** (O*NET-SOC ' + S.occ.code + ', O*NET 31.0)', '- Scenario: **' + E.scenarioName(S.s) + '** (s = ' + f2(S.s) + ')', '- Signals: ' + (m.kind === 'replay' ? 'replay as of ' : 'live, fetched ') + fmtDate(m.as_of), '- AI may absorb **' + pct(w.loPct) + ' to ' + pct(w.hiPct) + '** of a ' + w.hours + '-hour week', '');
    L.push('## Tasks', '', '| Task | Hours | A low | A high | Status |', '|---|---:|---:|---:|---|');
    userTasks().forEach(function (u) { var v = E.taskView(u.task, mByCap, S.s); L.push('| ' + u.task.text.replace(/\|/g, '/') + ' | ' + u.hours + ' | ' + f2(v.aLo) + ' | ' + f2(v.aHi) + ' | ' + v.status + ' |'); });
    L.push('', '## Target role', '', '**' + role.title + '** (O*NET-SOC ' + role.code + ')', '', '`Rank = Fit × Resilience = ' + f2(role.fit) + ' × ' + f2(role.resilience) + ' = ' + f2(role.fit * role.resilience) + '`', '');
    L.push('## Steps (' + plan.hours + ' h, about ' + plan.weeks + ' weeks at ' + S.learnH + ' h/week, RM0)', '');
    plan.steps.forEach(function (st, i) {
      L.push((i + 1) + '. **' + (st.kind === 'literacy' ? st.title : (st.gaps[0] ? st.gaps[0].name : st.title)) + '**');
      if (st.course) L.push('   - Course: [' + st.course.title + '](' + st.course.url + '), ' + st.course.hours + ' h, free, link checked ' + fmtDate(st.course.last_checked));
      else L.push('   - Practice step (no verified free course yet), about 3 h');
      L.push('   - Proof task: ' + (st.course ? st.course.proof_task : 'apply this on a synthetic case and get it reviewed'));
    });
    L.push('', '## SDG links', '');
    sdgTags(role.code).forEach(function (t) { L.push('- SDG ' + t.target + ': ' + t.why + ' (' + t.review + ')'); });
    L.push('- SDG 4.4: every step builds job-relevant skills', '', '---', 'Data: O*NET 31.0 (USDOL/ETA, CC BY 4.0), GPTs are GPTs, Anthropic Economic Index, arXiv, HN, GitHub, Microsoft Learn, UN SDG API.');
    var blob = new Blob([L.join('\n')], { type: 'text/markdown' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'oroboros-plan-' + (S.persona ? S.persona.id : S.occ.code) + '.md';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- sources ledger (below the engine) ---------------- */
  function renderLedger() {
    var m = D.momentum, st = D.meta.static_sources, rows = [
      ['Occupations & tasks', 'O*NET 31.0 · ' + fmtInt(D.meta.counts.occupations) + ' occupations, ' + fmtInt(D.meta.counts.tasks) + ' task statements', 'CC BY 4.0, USDOL/ETA', 'v31.0 · Aug 2026'],
      ['Task exposure', 'GPTs are GPTs (GPT-4 and human rater labels) · Anthropic Economic Index (observed usage) · Felten AIOE (occupation context)', fmtInt(D.meta.counts.tasks_with_gpt_labels) + ' tasks labelled · ' + fmtInt(D.meta.counts.tasks_with_aei_usage) + ' with observed usage', 'fetched ' + fmtDate(st['gpts_full_labelset.tsv'].fetched_at)],
      ['Live momentum', 'arXiv API · HN Algolia (Who is hiring) · GitHub REST · Remotive + Arbeitnow', 'Nightly GitHub Action writes dated snapshots to data/snapshots/', 'fetched ' + fmtDate((m.sources.arxiv || {}).fetched_at)],
      ['SDG targets', 'UN Stats SDG API · ' + D.sdg.n_targets + ' official targets · Malaysia indicators (area 458)', 'Role and skill tags reviewed by the team', 'fetched ' + fmtDate(D.sdg.generated_at)],
      ['Courses', 'Microsoft Learn Catalog API · ' + D.courses.length + ' free learning paths', 'Durations from the API · every URL link-checked nightly', 'checked ' + fmtDate(D.coursesDoc.generated_at)]
    ];
    $('#ledger').innerHTML = rows.map(function (r) { return '<div class="lrow"><h4>' + r[0] + '</h4><p>' + esc(r[1]) + '<small>' + esc(r[2]) + '</small></p><span class="when">' + esc(r[3]) + '</span></div>'; }).join('');
  }
  function renderReplay() {
    $('#replay').innerHTML = D.replay.map(function (r) { return '<option value="' + r.file + '">' + (r.kind === 'live' ? 'Live · ' : 'Replay · as of ') + fmtDate(r.as_of) + '</option>'; }).join('');
  }

  /* ---------------- navigation + rendering ---------------- */
  var renderQueued = false;
  function invalidate() { memo = {}; schedule(); }
  function schedule() {
    if (renderQueued) return; renderQueued = true;
    var run = function () { if (!renderQueued) return; renderQueued = false; renderStep(); };
    requestAnimationFrame(run);
    setTimeout(run, 120);   // background tabs pause rAF; the timer keeps state and screen in sync
  }
  function renderStep() {
    if (!D.roles) return;
    if (S.step === 2) renderRadar();
    else if (S.step === 3) renderConsume();
    else if (S.step === 4) renderRegrow();
    else if (S.step === 5) renderPlan();
  }
  function goStep(n, scroll) {
    S.step = n;
    $$('.tabs [role=tab]').forEach(function (b) { var on = +b.getAttribute('data-step') === n; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $$('.panel').forEach(function (p) { p.hidden = p.id !== 'p-' + n; });
    renderStep();
    if (scroll) { var c = $('#console'); var y = c.getBoundingClientRect().top + scrollY - 70; if (Math.abs(scrollY - y) > 40) scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  }
  function setScenario(t) {
    S.t = t; S.s = E.sliderToS(t);
    $('#scen-name').textContent = E.scenarioName(S.s);
    $('#scen-s').textContent = 's = ' + f2(S.s);
    schedule();
  }

  function wire() {
    $('#scen').addEventListener('input', function (e) { setScenario(e.target.value / 1000); });
    $('#replay').addEventListener('change', function (e) {
      S.replayFile = e.target.value;
      getJSON(S.replayFile).then(function (m) { setMomentum(m); invalidate(); });
    });
    $('.tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-step]'); if (b) goStep(+b.getAttribute('data-step')); });
    $('.tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var n = S.step + (e.key === 'ArrowRight' ? 1 : -1); n = n < 1 ? 5 : (n > 5 ? 1 : n);
      goStep(n); $('#tab-' + n).focus();
    });
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-goto]'); if (g) { goStep(+g.getAttribute('data-goto'), true); return; }
      var pl = e.target.closest('[data-plan]'); if (pl) { e.preventDefault(); S.target = pl.getAttribute('data-plan'); goStep(5, true); return; }
      var oc = e.target.closest('#cv-out [data-code]'); if (oc) { e.preventDefault(); pickOcc(oc.getAttribute('data-code')); }
    });
    $('#go-radar').addEventListener('click', function () { goStep(2, true); });
    $('#personas').addEventListener('click', function (e) { var b = e.target.closest('[data-pid]'); if (b) loadPersona(b.getAttribute('data-pid')); });
    document.addEventListener('oro:persona', function (e) { loadPersona(e.detail); });

    $('#task-table').addEventListener('change', function (e) {
      var row = e.target.closest('[data-tid]'); if (!row || e.target.type !== 'checkbox') return;
      var id = row.getAttribute('data-tid');
      S.sel[id] = e.target.checked ? (S.sel[id] > 0 ? S.sel[id] : 4) : 0;
      renderTasks(); invalidate();
    });
    $('#task-table').addEventListener('click', function (e) {
      if (e.target.id === 'more') { S.showAll = !S.showAll; renderTasks(); return; }
      var b = e.target.closest('[data-d]'); if (!b) return;
      var id = b.closest('[data-tid]').getAttribute('data-tid');
      S.sel[id] = Math.max(0, Math.min(40, (S.sel[id] || 0) + +b.getAttribute('data-d')));
      renderTasks(); invalidate();
    });
    $('#learn-h').addEventListener('input', function (e) { S.learnH = +e.target.value; $('#learn-h-out').textContent = S.learnH + ' h'; schedule(); });
    $('#cards').addEventListener('click', function (e) {
      var b = e.target.closest('[data-card]'); if (!b) return;
      var c = +b.getAttribute('data-card'), o = +b.getAttribute('data-opt');
      if (S.style[c] === o) delete S.style[c]; else S.style[c] = o;
      $$('[data-card="' + c + '"]').forEach(function (x) { x.setAttribute('aria-pressed', String(S.style[c] === +x.getAttribute('data-opt'))); });
      renderStyleTags(); schedule();
    });
    $('#cv-go').addEventListener('click', cvMatch);

    var q = $('#occ-q');
    q.addEventListener('input', function () { searchOcc(q.value); });
    q.addEventListener('keydown', function (e) {
      var list = $('#occ-list'); if (list.hidden || !qItems.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); qActive = (qActive + (e.key === 'ArrowDown' ? 1 : -1) + qItems.length) % qItems.length;
        $$('#occ-list li').forEach(function (li, i) { li.setAttribute('aria-selected', String(i === qActive)); });
        q.setAttribute('aria-activedescendant', 'oq' + qActive);
      } else if (e.key === 'Enter') { e.preventDefault(); pickOcc(qItems[Math.max(0, qActive)].c); }
      else if (e.key === 'Escape') { list.hidden = true; }
    });
    $('#occ-list').addEventListener('mousedown', function (e) { var li = e.target.closest('[data-code]'); if (li) { e.preventDefault(); pickOcc(li.getAttribute('data-code')); } });
    q.addEventListener('blur', function () { setTimeout(function () { $('#occ-list').hidden = true; }, 150); });

    $('#widen').addEventListener('change', function (e) { S.widen = e.target.checked; invalidate(); });
    $('#target').addEventListener('change', function (e) { S.target = e.target.value; schedule(); });
    $('#purpose').addEventListener('input', function (e) { S.purpose = e.target.value / 100; renderPurpose(); });
    $('#dl-md').addEventListener('click', downloadMd);
    $('#print').addEventListener('click', function () { window.print(); });

    // Week Ring <-> task list cross-highlight
    $('#week-ring').addEventListener('mouseover', function (e) { var s = e.target.closest('.seg'); hl(s ? s.getAttribute('data-tid') : null); });
    $('#week-ring').addEventListener('mouseleave', function () { hl(null); });
    $('#week-ring').addEventListener('click', function (e) { var s = e.target.closest('.seg'); if (!s) return; var d = $('#tasks-out [data-tid="' + s.getAttribute('data-tid') + '"]'); if (d) { d.open = true; d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
    $('#tasks-out').addEventListener('mouseover', function (e) { var d = e.target.closest('[data-tid]'); hl(d ? d.getAttribute('data-tid') : null); });
  }
  function hl(tid) {
    $$('#week-ring .seg.hl, #tasks-out .tout.hl').forEach(function (x) { x.classList.remove('hl'); });
    if (!tid) return;
    $$('#week-ring .seg[data-tid="' + tid + '"], #tasks-out .tout[data-tid="' + tid + '"]').forEach(function (x) { x.classList.add('hl'); });
  }

  document.addEventListener('oro:persona', function (e) { if (!D.personas) pendingPersona = e.detail; });
  boot();
})();
