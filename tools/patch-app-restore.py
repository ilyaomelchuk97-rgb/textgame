# -*- coding: utf-8 -*-
"""Патч 6 (п.17): при возврате в сейв кадр берётся из офлайн-хранилища, а не из ссылки."""
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

sub_once('возврат в сейв',
u'''    } else if (game.scene && game.scene.image) {
      setSceneImage(game.scene.image, game.scene.imageSource);
    } else if (game.scene) {''',
u'''    } else if (game.scene && game.scene.image) {
      setSceneImage(game.scene.image, game.scene.imageSource);
      restoreStoredFrame(game);
    } else if (game.scene) {''')

sub_once('функция восстановления',
u'''  /**
   * Картинка места: рисуется один раз и переиспользуется. Вернулись в знакомое
   * место — фон остаётся, меняется только слой действия.
   */''',
u'''  /**
   * Кадр, нарисованный раньше, лежит в IndexedDB. Ссылка из сейва может не
   * открыться (сеть пропала, серверный кэш остыл), а копия в телефоне — нет.
   */
  function restoreStoredFrame(game) {
    const g = game || State.game;
    const place = (g && g.scene && g.scene.place) || '';
    if (!place) return;
    const key = E.placeKey(g, place);
    FrameStore.get(key).then(stored => {
      if (!stored || !stored.url || State.game !== g) return;
      State.imageCache[key] = { url: stored.url, source: stored.source, at: stored.at || Date.now() };
      State.imageKey = key;
      if (g.scene) g.scene.placeKey = key;
      setSceneImage(stored.url, stored.source);
      $('#scene-badge').hidden = true;
    }).catch(() => { /* без офлайн-копии обойдёмся */ });
  }

  /**
   * Картинка места: рисуется один раз и переиспользуется. Вернулись в знакомое
   * место — фон остаётся, меняется только слой действия.
   */''')

io.open(path, 'w', encoding='utf-8').write(src)
print('OK: app.js — %d симв. (было %d)' % (len(src), len(orig)))
