/* Preflight — pure logic. No DOM. Shared by the app and the tests. */
(function (root) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function daysBetween(aKey, bKey) {
    // Whole calendar days from a to b; uses noon to dodge DST edges.
    const a = parseKey(aKey); a.setHours(12);
    const b = parseKey(bKey); b.setHours(12);
    return Math.round((b - a) / 86400000);
  }

  function sprintDays(plan) {
    const out = [];
    const total = daysBetween(plan.start, plan.end) + 1;
    for (let i = 0; i < total; i++) {
      const d = parseKey(plan.start); d.setDate(d.getDate() + i);
      out.push(dateKey(d));
    }
    return out;
  }

  function dayNumber(key, plan) {
    return daysBetween(plan.start, key) + 1; // 1-based; <1 before, >N after
  }

  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fmtMin = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

  function dayEntry(key, plan) {
    return plan.schedule[key] || { session: 'rest' };
  }

  function sessionFor(key, plan, override) {
    return override || dayEntry(key, plan).session || 'rest';
  }

  /** Busy ranges in minutes-from-midnight: shift (with travel buffer) and gym. */
  function busyRanges(key, plan, sessionId) {
    const e = dayEntry(key, plan);
    const out = [];
    if (e.shift) {
      out.push({ kind: 'shift', from: toMin(e.shift[0]) - plan.shiftBufferBefore, to: toMin(e.shift[1]) + plan.shiftBufferAfter });
    }
    if (sessionId !== 'rest') {
      const g = toMin(e.gym || plan.defaultGym);
      out.push({ kind: 'gym', from: g, to: g + plan.gymMinutes });
      if (sessionId === 'upper') out.push({ kind: 'pre-upper', from: g - plan.pushups.upperBlockBefore, to: g });
    }
    return out;
  }

  const inside = (m, r) => m >= r.from && m < r.to;
  const overlaps = (a, b) => a.from < b.to && b.from < a.to;

  /** Hours (on the hour) that get a push-up set today. */
  function pushupHours(key, plan, sessionId) {
    const cfg = plan.pushups;
    const busy = busyRanges(key, plan, sessionId);
    const hours = [];
    for (let h = cfg.firstHour; h <= cfg.lastHour; h++) {
      if (!busy.some((r) => inside(h * 60, r))) hours.push(h);
    }
    return hours;
  }

  /** Walk blocks for the day: dropped if they clash with a shift, relabelled if they clash with the gym. */
  function walksFor(key, plan, sessionId) {
    const busy = busyRanges(key, plan, sessionId);
    const out = [];
    plan.walks.forEach((w) => {
      const r = { from: toMin(w.time), to: toMin(w.time) + w.minutes };
      if (busy.some((b) => b.kind === 'shift' && overlaps(r, b))) return;
      const gym = busy.find((b) => b.kind === 'gym');
      const near = gym && overlaps(r, { from: gym.from - 30, to: gym.to });
      out.push(Object.assign({}, w, near ? { label: plan.gymWalkLabel, atGym: true } : {}));
    });
    return out;
  }

  function gymTime(key, plan) {
    return dayEntry(key, plan).gym || plan.defaultGym;
  }

  function shiftOf(key, plan) {
    return dayEntry(key, plan).shift || null;
  }

  function isLightWeek(key, plan) {
    return key <= plan.lightWeekEnds;
  }

  function setsFor(baseSets, key, plan) {
    return isLightWeek(key, plan) ? Math.min(baseSets, 2) : baseSets;
  }

  /**
   * Where you are in today's push-up schedule.
   * status: 'active' (a set is due this hour) | 'paused' (busy: shift/gym; next = next set hour)
   *         | 'before' (first set later) | 'done' (no more sets today)
   */
  function slotInfo(now, key, plan, sessionId) {
    const hours = pushupHours(key, plan, sessionId);
    const h = now.getHours();
    const total = hours.length;
    const idx = hours.indexOf(h);
    if (idx >= 0) return { status: 'active', hour: h, setNo: idx + 1, total };
    const next = hours.find((x) => x > h);
    if (next === undefined) return { status: 'done', hour: h, setNo: total, total };
    if (hours[0] === next) return { status: 'before', hour: next, setNo: 0, total };
    const busy = busyRanges(key, plan, sessionId).find((r) => inside(h * 60 + now.getMinutes(), r) || inside(h * 60, r));
    return { status: 'paused', hour: next, setNo: hours.indexOf(next), total, reason: busy ? busy.kind : null };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /**
   * Adaptive target.
   * - Hit (n >= target): streak +1. At `hitsToStepUp` hits in a row, target += stepUp, streak resets.
   * - Miss: target meets you halfway between target and what you did; streak resets.
   * Returns the new {target, streak} plus what happened.
   */
  function applySet(state, n, cfg) {
    const t = state.target;
    if (n >= t) {
      const streak = state.streak + 1;
      if (streak >= cfg.hitsToStepUp) {
        const next = clamp(t + cfg.stepUp, cfg.minTarget, cfg.maxTarget);
        return { target: next, streak: 0, outcome: next > t ? 'up' : 'hit' };
      }
      return { target: t, streak: streak, outcome: 'hit' };
    }
    const next = clamp(Math.round((t + n) / 2), cfg.minTarget, cfg.maxTarget);
    return { target: next, streak: 0, outcome: 'miss' };
  }

  function applySore(state, cfg) {
    return {
      target: clamp(Math.round(state.target * cfg.soreFactor), cfg.minTarget, cfg.maxTarget),
      streak: 0
    };
  }

  function dayTotals(day) {
    const sets = (day && day.sets) || [];
    return {
      pushups: sets.reduce((s, x) => s + x.n, 0),
      sets: sets.length,
      steps: (day && day.steps) || 0,
      gym: !!(day && day.gym)
    };
  }

  /** 12-hour clock: 9am, 4:30pm, 12pm. */
  function fmt12(mins) {
    const h = Math.floor(mins / 60) % 24, m = mins % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (m ? ':' + pad(m) : '') + (h < 12 ? 'am' : 'pm');
  }
  const fmtHour = (h) => fmt12(h * 60);
  const fmtTime = (hhmm) => fmt12(toMin(hhmm));

  function fmtNum(n) {
    return Math.round(n).toLocaleString('en-AU');
  }

  const api = {
    pad, toMin, fmtMin, dateKey, parseKey, daysBetween, sprintDays, dayNumber,
    dayEntry, sessionFor, busyRanges, pushupHours, walksFor, gymTime, shiftOf,
    isLightWeek, setsFor, slotInfo, applySet, applySore,
    dayTotals, fmtHour, fmtTime, fmt12, fmtNum
  };

  root.PreflightLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
