const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('js/royal-bet-ranking-odds.js', 'utf8'), sandbox);
const engine = sandbox.window.RoyalBetRankingOdds;

test('season deadline is March 31 and monthly deadlines are month-end', () => {
  assert.equal(new Date(engine.marketDeadline('season', 2027)).toISOString(), '2027-03-31T21:59:59.999Z');
  assert.equal(new Date(engine.marketDeadline('month', 2026, 10)).toISOString(), '2026-10-31T22:59:59.999Z');
  assert.equal(new Date(engine.marketDeadline('month', 2027, 2)).toISOString(), '2027-02-28T22:59:59.999Z');
});

test('dynamic odds change as the same standings approach deadline', () => {
  const standings = [
    { selection_key: 'a', selection_label: 'Leader', points: 80 },
    { selection_key: 'b', selection_label: 'Second', points: 75 },
    { selection_key: 'c', selection_label: 'Third', points: 60 }
  ];
  const start = engine.calculateRankingOdds(standings, {
    now: '2026-10-01T10:00:00Z', opensAt: '2026-10-01T00:00:00Z', closesAt: '2026-10-31T22:59:59.999Z'
  });
  const late = engine.calculateRankingOdds(standings, {
    now: '2026-10-30T10:00:00Z', opensAt: '2026-10-01T00:00:00Z', closesAt: '2026-10-31T22:59:59.999Z'
  });
  assert.ok(start.every(x => x.odds > 0 && x.is_bettable));
  assert.notDeepEqual(start.map(x => x.odds), late.map(x => x.odds));
  assert.ok(late[0].theoretical_probability > start[0].theoretical_probability);
});

test('mathematically clinched result is not bettable and receives zero odds', () => {
  const rows = engine.calculateRankingOdds([
    { selection_key: 'a', points: 100, max_points_remaining: 0 },
    { selection_key: 'b', points: 70, max_points_remaining: 20 },
    { selection_key: 'c', points: 65, max_points_remaining: 10 }
  ], { now: '2027-03-30T10:00:00Z', opensAt: '2026-09-15T00:00:00Z', closesAt: '2027-03-31T21:59:59Z' });
  assert.equal(rows.find(x => x.selection_key === 'a').is_bettable, false);
  assert.equal(rows.find(x => x.selection_key === 'a').odds, 0);
  assert.ok(rows.every(x => !x.is_bettable && x.odds === 0));
});

test('invalid deadline and duplicate selections are rejected', () => {
  assert.throws(() => engine.calculateRankingOdds([], { closesAt: '2027-03-31T00:00:00Z' }));
  assert.throws(() => engine.calculateRankingOdds([
    { selection_key: 'a', points: 1 }, { selection_key: 'a', points: 0 }
  ], { now: '2026-10-01T00:00:00Z', closesAt: '2026-10-31T00:00:00Z' }), /duplicate/i);
});
