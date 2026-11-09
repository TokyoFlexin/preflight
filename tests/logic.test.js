// node tests/logic.test.js
const assert = require('assert');
const L = require('../logic.js');
const plan = require('../plan.json');
const cfg = plan.pushups;

// adaptive algorithm
let s = { target: 20, streak: 0 };
s = L.applySet(s, 20, cfg); assert.deepStrictEqual([s.target, s.streak, s.outcome], [20, 1, 'hit']);
s = L.applySet(s, 25, cfg); assert.deepStrictEqual([s.target, s.streak], [20, 2]);
s = L.applySet(s, 20, cfg); assert.deepStrictEqual([s.target, s.streak, s.outcome], [22, 0, 'up']);
s = L.applySet(s, 14, cfg); assert.deepStrictEqual([s.target, s.streak, s.outcome], [18, 0, 'miss']);
assert.strictEqual(L.applySet({ target: 6, streak: 0 }, 1, cfg).target, 5, 'floor at minTarget');
assert.strictEqual(L.applySet({ target: 30, streak: 2 }, 30, cfg).target, 30, 'cap at maxTarget');
assert.strictEqual(L.applySore({ target: 20, streak: 2 }, cfg).target, 12);

// push-up hours around gym + shifts
assert.deepStrictEqual(L.pushupHours('2026-11-09', plan, 'legs'), [9,10,11,12,13,14,15,16,17,18,19,20,22,23]);
assert.deepStrictEqual(L.pushupHours('2026-11-11', plan, 'upper'), [9,10,11,12,13,14,15,16,17,22,23]);
assert.deepStrictEqual(L.pushupHours('2026-11-13', plan, 'legs'), [9,10,11,12,15,21,22,23]);
assert.deepStrictEqual(L.pushupHours('2026-11-19', plan, 'upper'), [9,10,15,16,22,23]);
assert.deepStrictEqual(L.pushupHours('2026-11-14', plan, 'shoulders'), [9,10,11,12,13,16,17,23]);

// walks: shift clashes dropped, gym clashes relabelled
const w13 = L.walksFor('2026-11-13', plan, 'legs');
assert.deepStrictEqual(w13.map(w => w.id), ['morning', 'lunch']);
assert.ok(w13.find(w => w.id === 'lunch').atGym);
const w09 = L.walksFor('2026-11-09', plan, 'legs');
assert.ok(w09.find(w => w.id === 'evening').atGym && !w09.find(w => w.id === 'lunch').atGym);
const w12 = L.walksFor('2026-11-12', plan, 'rest');
assert.deepStrictEqual(w12.map(w => w.id), ['morning', 'lunch', 'afternoon']);

// slot status
const at = (d, h, m) => { const x = L.parseKey(d); x.setHours(h, m || 0); return x; };
assert.strictEqual(L.slotInfo(at('2026-11-13', 8, 40), '2026-11-13', plan, 'legs').status, 'before');
let si = L.slotInfo(at('2026-11-13', 17, 10), '2026-11-13', plan, 'legs');
assert.deepStrictEqual([si.status, si.hour, si.reason], ['paused', 21, 'shift']);
si = L.slotInfo(at('2026-11-13', 15, 5), '2026-11-13', plan, 'legs');
assert.deepStrictEqual([si.status, si.setNo, si.total], ['active', 5, 8]);
assert.strictEqual(L.slotInfo(at('2026-11-13', 23, 40), '2026-11-13', plan, 'legs').status, 'active');

// sprint shape
assert.strictEqual(L.sprintDays(plan).length, 18);
assert.strictEqual(L.daysBetween('2026-11-09', plan.route.departure), 18);
assert.strictEqual(L.setsFor(3, '2026-11-15', plan), 2);
assert.strictEqual(L.setsFor(3, '2026-11-16', plan), 3);

// dump for cross-check with python
const dump = {};
for (const k of L.sprintDays(plan)) {
  const sess = L.sessionFor(k, plan);
  dump[k] = { hours: L.pushupHours(k, plan, sess), walks: L.walksFor(k, plan, sess).map(w => w.id + (w.atGym ? '@gym' : '')) };
}
require('fs').writeFileSync(__dirname + '/js-dump.json', JSON.stringify(dump));
console.log('logic tests passed');

// 12-hour display
assert.deepStrictEqual(['00:00','09:00','12:00','12:30','16:30','20:30','23:00'].map(L.fmtTime), ['12am','9am','12pm','12:30pm','4:30pm','8:30pm','11pm']);
assert.strictEqual(L.fmtHour(21), '9pm');
console.log('12-hour tests passed');
