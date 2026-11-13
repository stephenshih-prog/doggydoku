const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function setup(t) {
  // Expose existing game actions only in the test copy, never in the shipped page.
  const source = html.replace('  start({});', '  window.audit = { startGame, tryDog, getG: () => G, getL: () => L }; start({});');
  const dom = new JSDOM(source, { runScripts: 'dangerously', url: 'https://example.org', pretendToBeVisual: true,
    beforeParse(w) { w.HTMLElement.prototype.scrollIntoView = () => {}; } });
  t.after(() => dom.window.close());
  const w = dom.window, el = id => w.document.getElementById(id);
  el('btn-howto-close').click();
  return { w, a: w.audit, el };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('all campaign and daily puzzles have exactly one solution', t => {
  const { w, a } = setup(t);
  for (const p of [...a.getL().campaign, ...a.getL().daily]) assert.equal(w.DoggyEngine.countSolutions(p, 2), 1, p.id);
});
test('daily failure returns home', async t => {
  const { a, el } = setup(t);
  a.startGame('daily', 0, '2026-11-13');
  const g = a.getG();
  g.cells.map((_, i) => i).filter(i => g.p.solution[Math.floor(i / g.n)] !== i % g.n).slice(0, 3).forEach(a.tryDog);
  await wait(600);
  assert.equal(el('dlg-lose').hidden, false);
  el('btn-lose-back').click();
  assert.equal(el('s-home').hidden, false);
});
test('leaving before win dialog prevents stale dialog', async t => {
  const { a, el } = setup(t);
  a.startGame('campaign', 0);
  const g = a.getG();
  g.p.solution.forEach((c, r) => a.tryDog(r * g.n + c));
  el('btn-game-back').click();
  await wait(700);
  assert.equal(el('s-levels').hidden, false);
  assert.equal(el('dlg-win').hidden, true);
});
test('reentering a paused game resets pause button', t => {
  const { a, el } = setup(t);
  a.startGame('campaign', 0);
  el('btn-pause').click();
  el('btn-game-back').click();
  a.startGame('campaign', 0);
  assert.equal(a.getG().paused, false);
  assert.equal(el('btn-pause').getAttribute('aria-label'), '暫停');
});
test('normal win celebrates for five seconds then opens its dialog', async t => {
  const { a, el } = setup(t);
  a.startGame('campaign', 0);
  const g = a.getG();
  g.p.solution.forEach((c, r) => a.tryDog(r * g.n + c));
  assert.equal(el('dlg-dance').hidden, false);
  await wait(5100);
  assert.equal(el('dlg-dance').hidden, true);
  assert.equal(el('dlg-win').hidden, false);
});
test('leaving a loss then starting a new game prevents stale loss dialog', async t => {
  const { a, el } = setup(t);
  a.startGame('campaign', 0);
  const g = a.getG();
  g.cells.map((_, i) => i).filter(i => g.p.solution[Math.floor(i / g.n)] !== i % g.n).slice(0, 3).forEach(a.tryDog);
  el('btn-game-back').click();
  a.startGame('campaign', 0);
  await wait(600);
  assert.equal(a.getG().over, false);
  assert.equal(el('dlg-lose').hidden, true);
});

function solve(a) { const g = a.getG(); g.p.solution.forEach((c, r) => a.tryDog(r * g.n + c)); }
test('all five random variants render and skip to the next level without stale results', async t => {
  for (let variant = 0; variant < 5; variant++) {
    const { w, a, el } = setup(t);
    a.startGame('campaign', 0);
    w.Math.random = () => (variant + 0.1) / 5;
    solve(a);
    assert.equal(el('dance-stage').dataset.variant, String(variant));
    assert.ok(el('dance-stage').shadowRoot.querySelector('.stage'));
    assert.equal(w.document.activeElement.id, 'btn-dance-skip');
    el('btn-dance-skip').click();
    el('btn-dance-skip').click(); // stale/double click must not skip another level
    assert.equal(a.getG().index, 1);
    assert.equal(a.getG().over, false);
    assert.equal(el('dlg-dance').hidden, true);
    await wait(5100);
    assert.equal(el('dlg-win').hidden, true);
    assert.equal(a.getG().index, 1);
  }
});
test('daily and final campaign skip to results, never to another puzzle', t => {
  const { a, el } = setup(t);
  for (const [mode, index, date] of [['daily', 0, '2026-11-13'], ['campaign', a.getL().campaign.length - 1, undefined]]) {
    a.startGame(mode, index, date); solve(a);
    assert.equal(el('btn-dance-skip').textContent, '略過，看成績');
    el('btn-dance-skip').click();
    assert.equal(el('dlg-win').hidden, false);
    assert.equal(a.getG().mode, mode);
    assert.equal(a.getG().index, index);
    el('btn-win-home').click();
  }
});
test('curtain dance includes every dog in a nine-dog puzzle', t => {
  const { w, a, el } = setup(t);
  const index = a.getL().campaign.findIndex(p => p.n === 9);
  a.startGame('campaign', index); w.Math.random = () => 0.65; solve(a);
  assert.equal(el('dance-stage').shadowRoot.querySelectorAll('.puppy').length, 9);
  assert.ok(JSON.parse(w.localStorage.getItem(w.localStorage.key(0))).campaign[a.getG().p.id]);
});
