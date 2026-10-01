const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const build = fs.readFileSync(path.join(root, 'build.py'), 'utf8');

test('the prologue play button keeps equal side margins on narrow screens', () => {
  const rule = /\.prologue__go\s*\{([^}]*)\}/.exec(css)?.[1] || '';
  assert.match(rule, /width:\s*auto/);
  assert.match(rule, /align-self:\s*stretch/);
  assert.match(rule, /margin:\s*10px 12px 12px/);
});

test('the home backdrop changes on each visit without repeating the last scene', () => {
  assert.match(app, /const HOME_SCENES = Array\.from\(\{ length: 10 \}/);
  assert.match(app, /const HOME_SCENE_KEY = 'dt2:lastHomeScene'/);
  assert.match(app, /const previous = Local\.get\(HOME_SCENE_KEY, ''\)/);
  assert.match(app, /HOME_SCENES\.filter\(name => name !== previous\)/);
  assert.match(app, /Local\.set\(HOME_SCENE_KEY, selected\)/);
  assert.match(html, /class="menu-bg__image" src="assets\/home-scenes\/home-01\.jpg"/);
  assert.match(app, /function applyHomeScene\(name, bg\)/);
  assert.match(app, /image\.src = homeSceneUrl\(scene\)/);
  assert.match(app, /return new URL\(path, document\.baseURI\)\.href/);
  assert.match(app, /assets\/home-scenes\/home-/);
  assert.match(build, /HOME_SCENES = \["home-scene-%02d" % i for i in range\(1, 11\)\]/);
  assert.match(build, /ASSETS \/ "home-scenes"/);
  assert.match(build, /src="assets\/home-scenes\/home-01\.jpg"/);

  const scenes = fs.readdirSync(path.join(root, 'assets', 'home-scenes')).filter(name => name.endsWith('.jpg')).sort();
  assert.equal(scenes.length, 10);
  scenes.forEach((name, i) => {
    assert.equal(name, `home-${String(i + 1).padStart(2, '0')}.jpg`);
    assert.ok(fs.statSync(path.join(root, 'assets', 'home-scenes', name)).size > 100_000, `${name} is unexpectedly small`);
  });
});

test('menu parallax is subtle and respects the in-game and OS reduced-motion settings', () => {
  assert.match(css, /animation:\s*menuBackdropDrift 32s ease-in-out infinite alternate/);
  assert.match(css, /animation:\s*menuHazeDrift 21s ease-in-out infinite alternate/);
  assert.match(css, /#screen-menu\[data-motion="off"\] \.menu-bg/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(app, /menuScreen\.dataset\.motion = Settings\.data\.motion === false \? 'off' : 'on'/);
  assert.match(app, /screen\.addEventListener\('pointerdown', move, \{ passive: true \}\)/);
  assert.match(app, /screen\.addEventListener\('pointermove', move, \{ passive: true \}\)/);
  assert.match(app, /matchMedia && window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(app, /requestAnimationFrame\(\(\) => \{/);
});
