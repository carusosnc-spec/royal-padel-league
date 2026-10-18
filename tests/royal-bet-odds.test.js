const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('js/royal-bet-odds.js', 'utf8'), sandbox);
const odds = sandbox.window.RoyalBetOdds;

const set = (overrides = {}) => ({
  pair_a_player_1: 1, pair_a_player_2: 2,
  pair_b_player_1: 3, pair_b_player_2: 4,
  games_a: 6, games_b: 3, ...overrides
});

test('probabilities and odds stay in valid ranges', () => {
  const history = odds.buildHistory([
    set(), set({ games_a: 6, games_b: 4 }),
    set({ pair_a_player_1: 3, pair_a_player_2: 4, pair_b_player_1: 1, pair_b_player_2: 2, games_a: 6, games_b: 2 })
  ]);
  const estimate = odds.estimatePairWin(history, [1, 2], [3, 4]);
  assert.ok(estimate.probabilityA >= 0.08 && estimate.probabilityA <= 0.92);
  assert.ok(Math.abs(estimate.probabilityA + estimate.probabilityB - 1) < 1e-12);
  assert.ok(odds.odds(estimate.probabilityA) > 1);
  assert.equal(estimate.historySets, 3);
});

test('market selections are normalized', () => {
  const rows = odds.marketSelections([
    { selection_key: 'a', selection_label: 'A', probability: 0.6 },
    { selection_key: 'b', selection_label: 'B', probability: 0.4 }
  ]);
  assert.equal(rows.length, 2);
  assert.ok(Math.abs(rows.reduce((n, x) => n + x.theoretical_probability, 0) - 1) < 0.00011);
  assert.ok(rows.every(x => x.odds > 1));
});

test('rejects invalid pair inputs, repeated players, and empty probability mass', () => {
  const history = odds.buildHistory([]);
  assert.throws(() => odds.estimatePairWin(history, [1], [2, 3]));
  assert.throws(() => odds.estimatePairWin(history, [1, 2], [2, 3]));
  assert.throws(() => odds.marketSelections([{ selection_key: 'x', selection_label: 'X', probability: 0 }]));
  assert.throws(() => odds.marketSelections([
    { selection_key: 'a', selection_label: 'A', probability: 1 },
    { selection_key: 'b', selection_label: 'B', probability: 0 }
  ]), /maggiore di zero/);
});

test('only valid padel set scores and distinct players enter historical data', () => {
  const history = odds.buildHistory([
    set(),
    set({ games_a: 3, games_b: 4 }), // unfinished / invalid result
    set({ games_a: null, games_b: 0 }), // missing score must not become 0-0
    set({ pair_b_player_2: 1 }), // same player appears twice
    set({ games_a: 7, games_b: 4 }), // invalid padel score
    set({ games_a: 7, games_b: 6 }) // valid tiebreak set
  ]);
  assert.equal(history.setsUsed, 2);
  assert.equal(history.players.get('1').played, 2);
});

test('rejects non-finite probabilities and invalid margins', () => {
  assert.throws(() => odds.odds(NaN));
  assert.throws(() => odds.odds(0));
  assert.throws(() => odds.odds(0.5, 0.5));
  assert.throws(() => odds.marketSelections([
    { selection_key: 'a', selection_label: 'A', probability: NaN }
  ]));
  assert.throws(() => odds.marketSelections([
    { selection_key: 'a', selection_label: 'A', probability: Number.MAX_VALUE },
    { selection_key: 'b', selection_label: 'B', probability: Number.MAX_VALUE }
  ]), /somma finita/);
});


test('market draft planner validates scope and removes duplicates without writing', () => {
  const plannerSandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync('js/royal-bet-market-planner.js', 'utf8'), plannerSandbox);
  const planner = plannerSandbox.window.RoyalBetMarketPlanner;
  const candidate = {
    market_scope: 'match', calendar_match_id: 22, season_key: null,
    market_type: 'set_winner', set_number: 1,
    selection_key: 'pair_a', selection_label: 'Coppia A',
    theoretical_probability: 0.55, odds: 1.68
  };
  const other = { ...candidate, selection_key: 'pair_b', selection_label: 'Coppia B', theoretical_probability: 0.45, odds: 2.05 };
  const result = planner.planMarketDrafts([candidate, other, candidate, {
    ...candidate, selection_key: 'bad', theoretical_probability: 0
  }], []);
  assert.equal(result.planned.length, 2);
  assert.equal(result.planned[0].status, 'draft');
  assert.equal(result.writePerformed, false);
  assert.equal(result.skipped.length, 2);
  const repeated = planner.planMarketDrafts([candidate, other], [candidate, other]);
  assert.equal(repeated.planned.length, 0);
  assert.match(repeated.skipped[0].reason, /duplicato/);
  const incomplete = planner.planMarketDrafts([candidate], []);
  assert.equal(incomplete.planned.length, 0);
  assert.match(incomplete.skipped[0].reason, /gruppo incompleto/);
});

test('market draft planner enforces match/season scope consistency', () => {
  const plannerSandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync('js/royal-bet-market-planner.js', 'utf8'), plannerSandbox);
  const planner = plannerSandbox.window.RoyalBetMarketPlanner;
  const invalid = {
    market_scope: 'match', calendar_match_id: null, season_key: '2026-27',
    market_type: 'mvp', selection_key: 'p1', selection_label: 'Giocatore 1',
    theoretical_probability: 0.5, odds: 1.85
  };
  const result = planner.planMarketDrafts([invalid], []);
  assert.equal(result.planned.length, 0);
  assert.match(result.skipped[0].reason, /ambito partita incoerente/);
});


test('historical odds only use sets linked to explicitly confirmed matches', () => {
  const matches = [
    { id: 10, is_confirmed: true, approval_status: 'confirmed' },
    { id: 11, is_confirmed: false, approval_status: 'pending' },
    { id: 12, is_confirmed: true, approval_status: 'pending' }
  ];
  const sets = [
    set({ match_id: 10 }),
    set({ match_id: 11, games_a: 0, games_b: 6 }),
    set({ match_id: 12, games_a: 6, games_b: 1 }),
    set({ match_id: 999, games_a: 6, games_b: 2 }),
    set({ match_id: 10, games_a: 3, games_b: 4 })
  ];
  const history = odds.buildConfirmedHistory(matches, sets);
  assert.equal(history.confirmedMatchesUsed, 1);
  assert.equal(history.eligibleSetRows, 2);
  assert.equal(history.setsUsed, 1);
  assert.equal(history.players.get('1').played, 1);
});
