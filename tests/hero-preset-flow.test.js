const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

function bodyBetween(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  assert.notEqual(start, -1, 'function exists: ' + startMarker);
  const end = app.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, 'function boundary exists: ' + endMarker);
  return app.slice(start, end);
}

test('готовые сценарии получают профиль героя, не перегенерируя мир', () => {
  const preset = bodyBetween('function preparePresetScenario(scenario)', 'function prepareCustomWorld()');
  const offlineBranch = preset.indexOf('if (scenario && scenario.offline)');
  const heroRequest = preset.indexOf('requestHeroProfile(draft, 1)');

  assert.ok(offlineBranch >= 0 && offlineBranch < heroRequest, 'офлайн-ветка завершает работу до AI-запроса');
  assert.ok(preset.includes('return null;'), 'офлайн-сценарий остаётся локальным');
  assert.ok(heroRequest > offlineBranch, 'для онлайн-заготовки запрашивается профиль героя');
  assert.ok(!preset.includes('requestWorldProfile('), 'заготовка не просит заново собирать мир');
  assert.ok(!preset.includes('API.generateWorld('), 'описание и вступление заготовки сохраняются');

  const pick = bodyBetween('function pickScenario(s)', '/* --- конструктор мира --- */');
  assert.ok(pick.includes('preparePresetScenario(s)'), 'выбор готового сценария проходит через новую логику');
});

test('повтор профиля доступен онлайн-сценариям и выключен для офлайна', () => {
  const reroll = bodyBetween('async function rerollHero()', 'function pickScenario(s)');
  assert.ok(reroll.includes('base.offline'), 'офлайн-сценарии исключены из retry/reroll');
  assert.ok(reroll.includes('requestHeroProfile(draft, State.rerollCount + 1)'), 'варианты можно запросить заново');
  assert.ok(!reroll.includes('!(base.custom || base.customGame)'), 'повтор не ограничен «своей игрой»');
});
