# -*- coding: utf-8 -*-
"""Патч 5 (п.42 + п.17): честный прогресс кадра и кэш кадров в IndexedDB."""
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

# ---- прогресс кадра: вместо «рисуем кадр…» — честные секунды и что происходит
sub_once('прогресс кадра',
u'''    if (!silent) {
      setSceneStatus('рисуем кадр…');
      clearTimeout(State.imageStatusTimer);
      State.imageStatusTimer = setTimeout(() => { if (!State.imagePending[key]) setSceneStatus(''); }, 5000);
    }
    $('#scene-badge').textContent = 'кадр подтягивается';
    $('#scene-badge').hidden = false;''',
u'''    if (!silent) startFrameProgress();
    $('#scene-badge').textContent = 'кадр подтягивается';
    $('#scene-badge').hidden = false;''')

sub_once('функция прогресса',
u'''  function setSceneStatus(text, done) {''',
u'''  /**
   * Честный прогресс кадра (п.42): видно, сколько уже ждём и что происходит.
   * Локальный фон к этому моменту уже на экране — его и называем вслух.
   */
  function startFrameProgress() {
    stopFrameProgress();
    const started = Date.now();
    const tick = () => {
      if (!State.game || document.body.dataset.screen !== 'game') return;
      const sec = Math.round((Date.now() - started) / 1000);
      if (sec < 3) {
        setSceneStatus('кадр: ищем генератор…');
        return;
      }
      if (sec < 8) setSceneStatus('кадр ' + sec + ' с — генераторы молчат, рисуем локально');
      else setSceneStatus('кадр ' + sec + ' с — генераторы молчат, локальный фон уже в кадре');
      const badge = $('#scene-badge');
      if (badge && !State.imagePending.late) {
        badge.textContent = 'локальный фон';
        badge.hidden = false;
      }
    };
    tick();
    State.frameProgress = setInterval(tick, 1000);
  }

  function stopFrameProgress() {
    if (State.frameProgress) { clearInterval(State.frameProgress); State.frameProgress = null; }
    clearTimeout(State.imageStatusTimer);
  }

  /**
   * Кадры живут в IndexedDB (п.17): вернулись в знакомое место — картинка
   * встаёт мгновенно, без сети. В памяти держим только последние восемь.
   */
  const FrameStore = (function () {
    const DB = 'dt2-frames-db', STORE = 'frames', LIMIT = 24, TTL = 21 * 24 * 3600 * 1000;
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(resolve => {
        if (typeof indexedDB === 'undefined') return resolve(null);
        try {
          const req = indexedDB.open(DB, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
      return dbp;
    }
    function write(db, fn) {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        fn(tx.objectStore(STORE));
        return tx;
      } catch (e) { return null; }
    }
    return {
      async get(key) {
        const db = await open();
        if (!db) return null;
        return new Promise(resolve => {
          try {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            req.onsuccess = () => {
              const rec = req.result;
              if (!rec || !rec.blob) return resolve(null);
              if (Date.now() - (rec.at || 0) > TTL) return resolve(null);
              let url = '';
              try { url = URL.createObjectURL(rec.blob); } catch (e) { return resolve(null); }
              resolve({ url, source: rec.source || 'кэш кадра', at: rec.at });
            };
            req.onerror = () => resolve(null);
          } catch (e) { resolve(null); }
        });
      },
      async put(key, url, source, place) {
        if (!key || !url || /^data:/.test(url)) return false;
        const db = await open();
        if (!db) return false;
        let blob = null;
        try {
          const res = await fetch(url, { cache: 'force-cache' });
          if (res && res.ok) blob = await res.blob();
        } catch (e) { return false; }
        if (!blob || !blob.size || blob.size > 1.6e6) return false;
        const tx = write(db, store => store.put({ key, blob, source: source || '', place: place || '', at: Date.now() }, key));
        if (!tx) return false;
        tx.oncomplete = () => {
          // подрезаем хранилище: оставляем самые свежие кадры
          try {
            const all = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
            all.onsuccess = () => {
              const rows = (all.result || []).sort((a, b) => (b.at || 0) - (a.at || 0));
              rows.slice(LIMIT).forEach(r => write(db, store => store.delete(r.key)));
            };
          } catch (e) { /* подрезка не критична */ }
        };
        return true;
      },
      async count() {
        const db = await open();
        if (!db) return 0;
        return new Promise(resolve => {
          try {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
          } catch (e) { resolve(0); }
        });
      },
      async clear() {
        const db = await open();
        if (!db) return;
        write(db, store => store.clear());
      }
    };
  })();

  function setSceneStatus(text, done) {''')

# ---- встраивание чтения из IDB и записи после успеха
sub_once('чтение из IDB',
u'''    // Кадр, начатый по первым строкам сцены: место тогда называлось иначе —
    // не запускаем второй запрос, а дожидаемся того, что уже рисуется.''',
u'''    // Кадр этого места уже рисовали раньше: показываем сразу и без сети (п.17).
    if (!o.force) {
      const stored = await FrameStore.get(key);
      if (stored && stored.url) {
        State.imageCache[key] = { url: stored.url, source: stored.source, at: stored.at || Date.now() };
        State.imageKey = key;
        if (g.scene) g.scene.placeKey = key;
        if (g === State.game) { setSceneImage(stored.url, stored.source); $('#scene-badge').hidden = true; }
        return;
      }
    }
    // Кадр, начатый по первым строкам сцены: место тогда называлось иначе —
    // не запускаем второй запрос, а дожидаемся того, что уже рисуется.''')

sub_once('сброс прогресса при показе',
u'''      State.imageKey = key;
      if (g.scene) g.scene.placeKey = key;
      setSceneImage(res.url, res.source);
      $('#scene-badge').hidden = true;
      if (res.source === 'stock') {''',
u'''      State.imageKey = key;
      if (g.scene) g.scene.placeKey = key;
      stopFrameProgress();
      setSceneImage(res.url, res.source);
      $('#scene-badge').hidden = true;
      FrameStore.put(key, res.url, res.source, place);
      if (res.source === 'stock') {''')

sub_once('сброс прогресса при провале',
u'''    } else {
      setSceneStatus('');
      $('#scene-badge').hidden = true;
      const local = localSceneImage();''',
u'''    } else {
      stopFrameProgress();
      setSceneStatus('');
      $('#scene-badge').hidden = false;
      $('#scene-badge').textContent = 'локальный фон — генераторы молчат';
      const local = localSceneImage();''')

sub_once('отложенный кадр — тоже в кэш',
u'''      State.imageCache[key] = { url: cached.url, source: cached.source, at: Date.now() };
      State.imageKey = key;
      if (g.scene) g.scene.placeKey = key;
      setSceneImage(cached.url, cached.source);''',
u'''      State.imageCache[key] = { url: cached.url, source: cached.source, at: Date.now() };
      State.imageKey = key;
      if (g.scene) g.scene.placeKey = key;
      stopFrameProgress();
      setSceneImage(cached.url, cached.source);
      FrameStore.put(key, cached.url, cached.source, place);''')

# 3. сброс таймера при показе картинки
sub_once('setSceneImage стоп',
u'''    $('#scene-badge').hidden = true;
    setSceneStatus('');''',
u'''    $('#scene-badge').hidden = true;
    stopFrameProgress();
    setSceneStatus('');''')

io.open(path, 'w', encoding='utf-8').write(src)
print('OK: app.js — %d симв. (было %d)' % (len(src), len(orig)))
