# -*- coding: utf-8 -*-
"""Патч 4 (п.13): слои сцены в локальном фоне игры + в промпте генератору."""
import io, sys

path = '/home/user/src/app.js'
src = io.open(path, encoding='utf-8').read()
orig = src

def sub_once(tag, old, new):
    global src
    n = src.count(old)
    if n != 1:
        print('ЯКОРЬ НЕ НАЙДЕН (%d): %s' % (n, tag)); sys.exit(1)
    src = src.replace(old, new, 1)

# 1. paintBackdrop: kind + слои
sub_once('paintBackdrop',
u'''    const narration = [sceneText, prompt, g.scene && g.scene.npc, g.goal].filter(Boolean).join(' ');
    const kind = E.sceneKindFromText(narration);
    const actors = E.sceneActors(narration);
    if (!o.keepSeed || !State.backdropSeed) State.backdropSeed = E.rnd.seed();
    try {
      // нижний слой: место и свет. Фигуры и погода живут на отдельном холсте,
      // поэтому фон можно оставить, а происходящее — сменить.
      Backdrop.draw($('#scene-canvas'), { kind, palette: paletteFor(g, s), seed: State.backdropSeed });
      const canvas = $('#scene-canvas');
      canvas.dataset.kind = kind;
      canvas.dataset.enemies = actors.enemies.join(',');
    } catch (e) { /* canvas может быть недоступен — не критично */ }''',
u'''    const narration = [sceneText, prompt, g.scene && g.scene.npc, g.goal].filter(Boolean).join(' ');
    const kind = E.sceneKindFromText(narration);
    const layers = E.sceneLayersFromText(narration);
    const actors = E.sceneActors(narration);
    if (!o.keepSeed || !State.backdropSeed) State.backdropSeed = E.rnd.seed();
    State.sceneLayers = layers;
    try {
      // нижний слой: место и свет. Фигуры и погода живут на отдельном холсте,
      // поэтому фон можно оставить, а происходящее — сменить.
      Backdrop.draw($('#scene-canvas'), {
        kind, palette: paletteFor(g, s), seed: State.backdropSeed,
        daypart: layers.daypart, weather: layers.weather, fire: layers.fire
      });
      const canvas = $('#scene-canvas');
      canvas.dataset.kind = kind;
      canvas.dataset.daypart = layers.daypart;
      canvas.dataset.weather = layers.weather;
      canvas.dataset.enemies = actors.enemies.join(',');
    } catch (e) { /* canvas может быть недоступен — не критично */ }''')

# 2. localSceneImage: те же слои
sub_once('localSceneImage',
u'''      const canvas = $('#scene-canvas');
      const kind = (canvas && canvas.dataset.kind) || E.sceneKindFromText([g.scene && g.scene.text, g.title, g.goal].filter(Boolean).join(' '));
      return Backdrop.toDataUrl({ kind, palette: paletteFor(g, E.scenarioById(g.scenarioId)), seed: State.backdropSeed || 7 });''',
u'''      const canvas = $('#scene-canvas');
      const text = [g.scene && g.scene.text, g.title, g.goal].filter(Boolean).join(' ');
      const kind = (canvas && canvas.dataset.kind) || E.sceneKindFromText(text);
      const layers = State.sceneLayers || E.sceneLayersFromText(text);
      return Backdrop.toDataUrl({
        kind, palette: paletteFor(g, E.scenarioById(g.scenarioId)), seed: State.backdropSeed || 7,
        daypart: layers.daypart, weather: layers.weather, fire: layers.fire
      });''')

# 3. drawActorLayer: слои поверх картинки
sub_once('drawActorLayer',
u'''      Backdrop.drawOver(canvas, {
        kind, seed: State.backdropSeed, actors, palette: paletteFor(g, s),
        over: hasImage, time: time || 0,
        progress: progress === undefined ? State.actorProgress : progress
      });''',
u'''      const layers = State.sceneLayers || E.sceneLayersFromText(narration);
      Backdrop.drawOver(canvas, {
        kind, seed: State.backdropSeed, actors, palette: paletteFor(g, s),
        over: hasImage, time: time || 0,
        daypart: layers.daypart, weather: layers.weather, fire: layers.fire,
        progress: progress === undefined ? State.actorProgress : progress
      });''')

# 4. пролог: та же картинка, что и в игре
sub_once('пролог',
u'''          const kind = E.sceneKindFromText([scene.text, g.title, g.goal].filter(Boolean).join(' '));
          const url = Backdrop.toDataUrl({ kind, palette: paletteFor(g, E.scenarioById(g.scenarioId)), seed: State.backdropSeed || 7 });''',
u'''          const ptext = [scene.text, g.title, g.goal].filter(Boolean).join(' ');
          const kind = E.sceneKindFromText(ptext);
          const players = E.sceneLayersFromText(ptext);
          const url = Backdrop.toDataUrl({
            kind, palette: paletteFor(g, E.scenarioById(g.scenarioId)), seed: State.backdropSeed || 7,
            daypart: players.daypart, weather: players.weather, fire: players.fire
          });''')

# 5. ранний кадр (первые строки сцены) — тоже со слоями через paintBackdrop, проверим вызовы
io.open(path, 'w', encoding='utf-8').write(src)
print('OK: app.js — %d симв. (было %d)' % (len(src), len(orig)))
