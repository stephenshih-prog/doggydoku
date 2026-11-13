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
test('normal win still opens its dialog', async t => {
  const { a, el } = setup(t);
  a.startGame('campaign', 0);
  const g = a.getG();
  g.p.solution.forEach((c, r) => a.tryDog(r * g.n + c));
  await wait(700);
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
