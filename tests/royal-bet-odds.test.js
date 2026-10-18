const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('js/royal-bet-odds.js', 'utf8'), sandbox);
const odds = sandbox.window.RoyalBetOdds;

test('probabilities and odds stay in valid ranges', () => {
  const history = odds.buildHistory([
    {pair_a_player_1:1,pair_a_player_2:2,pair_b_player_1:3,pair_b_player_2:4,games_a:6,games_b:3},
    {pair_a_player_1:1,pair_a_player_2:2,pair_b_player_1:3,pair_b_player_2:4,games_a:6,games_b:4},
    {pair_a_player_1:3,pair_a_player_2:4,pair_b_player_1:1,pair_b_player_2:2,games_a:6,games_b:2}
  ]);
  const estimate = odds.estimatePairWin(history,[1,2],[3,4]);
  assert.ok(estimate.probabilityA >= 0.08 && estimate.probabilityA <= 0.92);
  assert.ok(Math.abs(estimate.probabilityA + estimate.probabilityB - 1) < 1e-12);
  assert.ok(odds.odds(estimate.probabilityA) > 1);
});

test('market selections are normalized', () => {
  const rows = odds.marketSelections([
    {selection_key:'a',selection_label:'A',probability:0.6},
    {selection_key:'b',selection_label:'B',probability:0.4}
  ]);
  assert.equal(rows.length,2);
  assert.ok(Math.abs(rows.reduce((n,x)=>n+x.theoretical_probability,0)-1)<0.00011);
  assert.ok(rows.every(x=>x.odds>1));
});

test('rejects invalid pair inputs and empty probability mass', () => {
  const history = odds.buildHistory([]);
  assert.throws(() => odds.estimatePairWin(history,[1],[2,3]));
  assert.throws(() => odds.marketSelections([{selection_key:'x',selection_label:'X',probability:0}]));
});
