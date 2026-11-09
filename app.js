(function () {
  'use strict';
  const L = window.PreflightLogic;
  const KEY = 'preflight.v1';
  const $ = (id) => document.getElementById(id);
  const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let plan = null;
  let state = null;
  let selectedDay = null;
  let lastRenderStamp = '';

  /* ---------------- storage ---------------- */
  function freshState() {
    return { v: 1, target: plan.pushups.startTarget, streak: 0, days: {}, checkin: { start: {}, end: {} } };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === 'object' && s.days) {
          s.checkin = s.checkin || { start: {}, end: {} };
          return s;
        }
      }
    } catch (e) { /* fall through to fresh */ }
    return freshState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { note('push-note', 'Couldn’t save on this device. Export a backup so nothing is lost.'); }
  }
  function day(key) {
    if (!state.days[key]) state.days[key] = { sets: [], steps: 0, walks: {}, gym: false, sore: null, sessionOverride: null };
    return state.days[key];
  }

  /* ---------------- helpers ---------------- */
  const todayKey = () => L.dateKey(new Date());
  const sessionOf = (key) => L.sessionFor(key, plan, state.days[key] && state.days[key].sessionOverride);
  function prettyDate(key) {
    const d = L.parseKey(key);
    return WEEKDAY[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH[d.getMonth()];
  }
  function note(id, html) { $(id).innerHTML = html; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------------- render ---------------- */
  function renderPass(key) {
    const total = L.sprintDays(plan).length;
    const n = L.dayNumber(key, plan);
    const left = L.daysBetween(key, plan.route.departure);
    $('pass-day').textContent = n > total ? 'Done' : L.pad(Math.max(n, 1)) + ' / ' + total;
    $('pass-tminus').textContent = left > 1 ? left + ' days' : left === 1 ? '1 day' : left === 0 ? 'Today' : 'Landed';
    $('pass-date').textContent = prettyDate(key);
    const s = sessionOf(key);
    const shift = L.shiftOf(key, plan);
    $('pass-date').textContent = prettyDate(key) + (shift ? ' · Shift ' + L.fmtTime(shift[0]) : '');
    $('pass-session').textContent = s === 'rest' ? 'Rest day' : plan.sessions[s].title.split(' ')[0] + ' ' + L.fmtTime(L.gymTime(key, plan));
    const pct = Math.max(0, Math.min(100, ((n - 1) / total) * 100));
    document.querySelector('.pass__line').style.setProperty('--progress', pct + '%');
  }

  function renderPushups(key) {
    const cfg = plan.pushups;
    const d = day(key);
    const s = sessionOf(key);
    const slot = L.slotInfo(new Date(), key, plan, s);

    $('push-target').textContent = state.target;
    if (slot.status === 'active') {
      $('push-slot').textContent = 'Set ' + slot.setNo + ' of ' + slot.total + ' · ' + L.fmtHour(slot.hour);
      $('push-cap').textContent = 'push-ups this hour';
    } else if (slot.status === 'paused') {
      const why = { shift: 'At work', gym: 'At the gym', 'pre-upper': 'Pre-bench rest' }[slot.reason] || 'Paused';
      $('push-slot').textContent = why + ' · next ' + L.fmtHour(slot.hour);
      $('push-cap').textContent = 'next set at ' + L.fmtHour(slot.hour);
    } else if (slot.status === 'before') {
      $('push-slot').textContent = 'First set ' + L.fmtHour(slot.hour);
      $('push-cap').textContent = 'first set at ' + L.fmtHour(slot.hour);
    } else {
      $('push-slot').textContent = 'Window closed';
      $('push-cap').textContent = 'bonus sets still count';
    }

    const streakEl = $('push-streak');
    streakEl.innerHTML = '';
    for (let i = 0; i < cfg.hitsToStepUp; i++) {
      const dot = document.createElement('i');
      if (i < state.streak) dot.className = 'on';
      streakEl.appendChild(dot);
    }
    streakEl.setAttribute('aria-label', state.streak + ' of ' + cfg.hitsToStepUp + ' hits toward the next step up');

    const t = L.dayTotals(d);
    $('push-total').textContent = L.fmtNum(t.pushups);
    $('push-sets').textContent = t.sets;
    const sprintTotal = Object.values(state.days).reduce((a, x) => a + L.dayTotals(x).pushups, 0);
    $('push-sprint').textContent = L.fmtNum(sprintTotal);

    const ledger = $('push-ledger');
    ledger.innerHTML = d.sets.map((x) => {
      const at = new Date(x.at);
      const time = L.fmt12(at.getHours() * 60 + at.getMinutes());
      return '<li class="' + (x.n < x.target ? 'miss' : '') + '"><span class="t">' + time + '</span><span class="n">' + x.n + '/' + x.target + '</span></li>';
    }).join('');

    $('push-undo').disabled = d.sets.length === 0;
    $('push-sore').setAttribute('aria-pressed', d.sore ? 'true' : 'false');
    $('push-sore').textContent = d.sore ? 'Eased off today' : 'Sore joints';
  }

  function renderSteps(key) {
    const d = day(key);
    const goal = plan.stepGoal;
    const input = $('steps-input');
    if (document.activeElement !== input) input.value = d.steps ? d.steps : '';
    const pct = Math.min(100, Math.round((d.steps / goal) * 100));
    const bar = $('steps-bar');
    bar.firstElementChild.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', pct);
    $('steps-aside').textContent = d.steps >= goal ? 'Goal hit' : L.fmtNum(Math.max(0, goal - d.steps)) + ' to go';

    const rows = L.walksFor(key, plan, sessionOf(key)).map((w) => ({ t: w.time, html:
      '<li><button class="walk" role="checkbox" aria-checked="' + !!d.walks[w.id] + '" data-walk="' + w.id + '">' +
        '<span class="walk__t">' + L.fmtTime(w.time) + '</span>' +
        '<span class="walk__l">' + esc(w.label) + '<small>≈ ' + L.fmtNum(w.minutes * 100) + ' steps</small></span>' +
        '<span class="walk__m">' + w.minutes + ' min</span>' +
        '<span class="walk__box" aria-hidden="true"></span></button></li>' }));
    const shift = L.shiftOf(key, plan);
    if (shift) rows.push({ t: shift[0], html:
      '<li><div class="walk walk--shift"><span class="walk__t">' + L.fmtTime(shift[0]) + '</span>' +
      '<span class="walk__l">Dough Addict shift<small>On your feet till ' + L.fmtTime(shift[1]) + '. It all counts.</small></span>' +
      '<span class="walk__m">' + ((L.toMin(shift[1]) - L.toMin(shift[0])) / 60) + ' h</span><span></span></div></li>' });
    rows.sort((a, b) => a.t.localeCompare(b.t));
    $('walks').innerHTML = rows.map((r) => r.html).join('');
  }

  function renderGym(key) {
    const d = day(key);
    const s = sessionOf(key);
    const sess = plan.sessions[s];
    $('gym-title').textContent = sess.title;
    $('gym-aside').textContent = s === 'rest' ? plan.gymName : plan.gymName + ' · ' + L.fmtTime(L.gymTime(key, plan));
    $('gym-swap').value = s;

    const tbody = $('gym-lifts').querySelector('tbody');
    tbody.innerHTML = sess.exercises.map(([name, sets, reps]) =>
      '<tr><td>' + esc(name) + '</td><td>' + L.setsFor(sets, key, plan) + '</td><td>' + esc(reps) + '</td></tr>'
    ).join('');

    let msg = '';
    if (s === 'rest') msg = 'Rest day. Get the walk blocks done on the pad.';
    else if (s === 'light') msg = 'Day before the flight. Keep it easy, don’t chase soreness.';
    else if (L.isLightWeek(key, plan)) msg = '<strong>Week 1:</strong> 2 working sets, leave 2–3 reps in the tank.';
    else msg = 'Leave 1–2 reps in the tank on each working set.';
    if (s === 'upper') msg += ' Push-ups pause ' + (plan.pushups.upperBlockBefore / 60) + ' hours before you train.';
    const sh = L.shiftOf(key, plan);
    if (sh && s !== 'rest') msg += ' Shift at ' + L.fmtTime(sh[0]) + ', so train early and eat before you go.';
    note('gym-note', msg);

    const btn = $('gym-done');
    btn.hidden = s === 'rest';
    btn.setAttribute('aria-pressed', d.gym ? 'true' : 'false');
    btn.textContent = d.gym ? 'Session done' : 'Mark session done';
  }

  function renderGrid(key) {
    const goal = plan.stepGoal;
    const grid = $('grid');
    grid.innerHTML = L.sprintDays(plan).map((k) => {
      const dt = L.parseKey(k);
      const x = state.days[k];
      const t = L.dayTotals(x);
      const future = k > key;
      const s = sessionOf(k);
      const cls = ['day', future ? 'is-future' : '', k === key ? 'is-today' : '', k === selectedDay ? 'is-sel' : ''].join(' ');
      let foot = '';
      if (!future) {
        foot = (t.steps >= goal ? '<i class="mk mk--steps"></i>' : '') +
          (s !== 'rest' ? '<i class="mk mk--gym' + (t.gym ? ' on' : '') + '"></i>' : '') +
          '<span>' + (t.pushups || '') + '</span>';
      }
      return '<button class="' + cls + '" role="listitem" data-day="' + k + '" aria-label="' + prettyDate(k) + '">' +
        '<span class="day__w">' + WEEKDAY[dt.getDay()].slice(0, 2) + '</span>' +
        '<span class="day__d">' + dt.getDate() + '</span>' +
        '<span class="day__f">' + foot + '</span></button>';
    }).join('');

    if (selectedDay) {
      const t = L.dayTotals(state.days[selectedDay]);
      const s = sessionOf(selectedDay);
      const future = selectedDay > key;
      const parts = [prettyDate(selectedDay), plan.sessions[s].title];
      if (!future) {
        parts.push(L.fmtNum(t.pushups) + ' push-ups in ' + t.sets + ' set' + (t.sets === 1 ? '' : 's'));
        parts.push(L.fmtNum(t.steps) + ' steps');
        if (s !== 'rest') parts.push(t.gym ? 'gym done' : 'gym not logged');
      }
      note('grid-detail', parts.join(' · '));
    } else {
      note('grid-detail', '');
    }
  }

  function renderCheckin() {
    const c = state.checkin;
    const set = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v != null && v !== '' ? v : ''; };
    set('ci-start-w', c.start.w); set('ci-start-waist', c.start.waist); set('ci-start-bf', c.start.bf);
    set('ci-end-w', c.end.w); set('ci-end-waist', c.end.waist); set('ci-end-bf', c.end.bf);
    const parts = [];
    const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1);
    if (c.start.w && c.end.w) parts.push('<strong>' + sign(c.end.w - c.start.w) + ' kg</strong>');
    if (c.start.waist && c.end.waist) parts.push('<strong>' + sign(c.end.waist - c.start.waist) + ' cm</strong> waist');
    if (c.start.bf && c.end.bf) parts.push('<strong>' + sign(c.end.bf - c.start.bf) + '%</strong> body fat');
    if (parts.length) note('ci-delta', parts.join(' · '));
    else if (c.start.w || c.start.waist) note('ci-delta', 'Same routine on Thu 26 Nov, then compare.');
    else note('ci-delta', 'Tomorrow morning: weigh in after the bathroom, before food. Tape around the belly button, relaxed, not sucked in.');
  }

  function render() {
    const key = todayKey();
    renderPass(key);
    renderPushups(key);
    renderSteps(key);
    renderGym(key);
    renderGrid(key);
    renderCheckin();
    lastRenderStamp = key + 'T' + new Date().getHours();
  }

  /* ---------------- actions ---------------- */
  function adjust(delta) {
    const input = $('push-count');
    const v = parseInt(input.value, 10);
    input.value = Math.max(0, Math.min(200, (isNaN(v) ? state.target : v) + delta));
  }

  function logSet() {
    const cfg = plan.pushups;
    const input = $('push-count');
    const n = parseInt(input.value, 10);
    if (isNaN(n) || n < 1 || n > 200) {
      note('push-note', 'Enter a number from 1 to 200. Skipping an hour is fine, it doesn’t count against you.');
      input.focus();
      return;
    }
    const key = todayKey();
    const d = day(key);
    const before = { target: state.target, streak: state.streak };
    const res = L.applySet(state, n, cfg);
    d.sets.push({ at: Date.now(), n: n, target: before.target, prevTarget: before.target, prevStreak: before.streak });
    state.target = res.target;
    state.streak = res.streak;
    save();

    let msg;
    if (res.outcome === 'up') msg = '<strong>Three on target.</strong> Next set goes up to ' + res.target + '.';
    else if (res.outcome === 'hit' && before.target >= cfg.maxTarget) msg = '<strong>Hit.</strong> You’re at the ' + cfg.maxTarget + ' cap. Hold it there.';
    else if (res.outcome === 'hit') {
      const left = cfg.hitsToStepUp - res.streak;
      msg = '<strong>Hit.</strong> ' + left + ' more on target and it goes up to ' + Math.min(cfg.maxTarget, before.target + cfg.stepUp) + '.';
    } else if (res.target === before.target) msg = 'Logged ' + n + '. Target holds at ' + res.target + '.';
    else msg = 'Logged ' + n + '. Next set meets you halfway: <strong>' + res.target + '</strong>.';
    note('push-note', msg);
    input.value = state.target;
    render();
  }

  function undo() {
    const d = day(todayKey());
    const last = d.sets.pop();
    if (!last) return;
    state.target = last.prevTarget;
    state.streak = last.prevStreak;
    if (d.sore && d.sore.setsAt > d.sets.length) d.sore.setsAt = d.sets.length;
    save();
    $('push-count').value = state.target;
    note('push-note', 'Removed the ' + last.n + '. Target is back to ' + state.target + '.');
    render();
  }

  function toggleSore() {
    const cfg = plan.pushups;
    const d = day(todayKey());
    if (!d.sore) {
      d.sore = { prevTarget: state.target, prevStreak: state.streak, setsAt: d.sets.length };
      const r = L.applySore(state, cfg);
      state.target = r.target; state.streak = r.streak;
      note('push-note', 'Dropped to <strong>' + state.target + '</strong>. Muscle burn is fine. Sharp elbow, wrist or shoulder pain means stop for today.');
    } else if (d.sets.length === d.sore.setsAt) {
      state.target = d.sore.prevTarget; state.streak = d.sore.prevStreak; d.sore = null;
      note('push-note', 'Back to ' + state.target + '.');
    } else {
      note('push-note', 'You’ve logged sets since easing off, so the target now adapts from there.');
      return;
    }
    save();
    $('push-count').value = state.target;
    render();
  }

  let stepsTimer = null;
  function onSteps() {
    clearTimeout(stepsTimer);
    stepsTimer = setTimeout(() => {
      const v = parseInt($('steps-input').value, 10);
      day(todayKey()).steps = isNaN(v) ? 0 : Math.max(0, Math.min(80000, v));
      save();
      const key = todayKey();
      renderSteps(key); renderGrid(key);
    }, 250);
  }

  function onWalk(e) {
    const btn = e.target.closest('[data-walk]');
    if (!btn) return;
    const d = day(todayKey());
    d.walks[btn.dataset.walk] = !d.walks[btn.dataset.walk];
    save();
    renderSteps(todayKey());
  }

  function onSwap() {
    const key = todayKey();
    const v = $('gym-swap').value;
    day(key).sessionOverride = v === plan.schedule[key] ? null : v;
    save();
    render();
  }

  function onGymDone() {
    const d = day(todayKey());
    d.gym = !d.gym;
    save();
    render();
  }

  function onGrid(e) {
    const btn = e.target.closest('[data-day]');
    if (!btn) return;
    selectedDay = selectedDay === btn.dataset.day ? null : btn.dataset.day;
    renderGrid(todayKey());
  }

  function onCheckin(e) {
    const map = { 'ci-start-w': ['start', 'w'], 'ci-start-waist': ['start', 'waist'], 'ci-end-w': ['end', 'w'], 'ci-end-waist': ['end', 'waist'], 'ci-start-bf': ['start', 'bf'], 'ci-end-bf': ['end', 'bf'] };
    const m = map[e.target.id];
    if (!m) return;
    const v = parseFloat(e.target.value);
    state.checkin[m[0]][m[1]] = isNaN(v) ? null : Math.round(v * 10) / 10;
    save();
    renderCheckin();
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'preflight-backup-' + todayKey() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importBackup(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!s || typeof s !== 'object' || !s.days || typeof s.target !== 'number') throw new Error('shape');
        if (!window.confirm('Replace everything on this phone with the backup?')) return;
        s.checkin = s.checkin || { start: {}, end: {} };
        state = s; save(); render();
      } catch (err) {
        window.alert('That file isn’t a Preflight backup.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    const res = await fetch('plan.json', { cache: 'no-cache' });
    plan = await res.json();
    state = load();
    $('push-count').value = state.target;

    $('push-minus').addEventListener('click', () => adjust(-1));
    $('push-plus').addEventListener('click', () => adjust(1));
    $('push-log').addEventListener('click', logSet);
    $('push-count').addEventListener('keydown', (e) => { if (e.key === 'Enter') logSet(); });
    $('push-count').addEventListener('input', () => note('push-note', ''));
    $('push-undo').addEventListener('click', undo);
    $('push-sore').addEventListener('click', toggleSore);
    $('steps-input').addEventListener('input', onSteps);
    $('walks').addEventListener('click', onWalk);
    $('gym-swap').addEventListener('change', onSwap);
    $('gym-done').addEventListener('click', onGymDone);
    $('grid').addEventListener('click', onGrid);
    document.querySelector('.checkin').addEventListener('change', onCheckin);
    $('backup-export').addEventListener('click', exportBackup);
    $('backup-import').addEventListener('change', importBackup);

    render();

    const tick = () => {
      const stamp = todayKey() + 'T' + new Date().getHours();
      if (stamp !== lastRenderStamp) render();
    };
    setInterval(tick, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  boot().catch((err) => {
    document.querySelector('.app').insertAdjacentHTML('afterbegin',
      '<p class="note">Couldn’t load the plan. Check your connection and reopen.</p>');
    console.error(err);
  });
})();
