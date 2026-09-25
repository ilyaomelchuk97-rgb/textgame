/* Истории без ИИ: главы написаны вручную. Проверяем не только то, что они
   открываются, но и то, что они логичны: каждая концовка достижима по правилам
   книги (с уликами, силами и припасами), тупиков нет, а ни один выбор не
   требует того, чего в истории не бывает. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Books = require('../src/books.js');

const SRC = path.join(__dirname, '..', 'src');

test('истории на месте: их не меньше восьми и они разных жанров', () => {
  const list = Books.listBooks();
  assert.ok(list.length >= 8, 'нужно хотя бы восемь историй: ' + list.length);
  const genres = new Set(list.map(b => b.genre));
  assert.ok(genres.size >= 6, 'жанры должны различаться: ' + genres.size);
  const groups = new Set(list.map(b => b.group));
  assert.ok(groups.size >= 3, 'нужны и фэнтези, и будущее, и прошлое: ' + [...groups].join(', '));
  list.forEach(b => {
    assert.ok(b.title && b.tagline && b.icon, `${b.id}: у истории нет названия, подписи или значка`);
    assert.ok(b.chapters >= 6, `${b.id}: глав должно быть не меньше шести, а их ${b.chapters}`);
    assert.ok(b.endings >= 2, `${b.id}: концовок должно быть минимум две, а их ${b.endings}`);
  });
});

test('каждая глава цела: текст, выборы и переходы в существующие главы', () => {
  Books.listBooks().forEach(short => {
    const b = Books.bookById(short.id);
    assert.ok(b.nodes[b.start], `${b.id}: стартовой главы нет среди узлов`);
    assert.ok(b.world && b.world.length > 80, `${b.id}: не описан мир истории`);
    Object.entries(b.nodes).forEach(([id, node]) => {
      assert.ok(node.chapter && node.text && node.text.length, `${b.id}/${id}: глава без названия или текста`);
      assert.ok(node.text.join(' ').length >= 140, `${b.id}/${id}: глава короче абзаца — текст потерялся`);
      assert.ok(node.ending || (node.choices && node.choices.length), `${b.id}/${id}: глава без выборов`);
      (node.choices || []).forEach(c => {
        assert.ok(c.text && c.text.length > 3, `${b.id}/${id}: у выбора нет текста`);
        assert.ok(b.nodes[c.to], `${b.id}/${id}: выбор ведёт в несуществующую главу ${c.to}`);
      });
    });
  });
});

test('в истории нет потерянных глав: до каждой можно дойти от начала', () => {
  Books.listBooks().forEach(short => {
    const b = Books.bookById(short.id);
    const seen = new Set([b.start]);
    const queue = [b.start];
    while (queue.length) {
      const cur = b.nodes[queue.shift()];
      (cur.choices || []).forEach(c => {
        if (!seen.has(c.to)) { seen.add(c.to); queue.push(c.to); }
      });
    }
    const lost = Object.keys(b.nodes).filter(id => !seen.has(id));
    assert.equal(lost.length, 0, `${b.id}: в эти главы не попасть: ${lost.join(', ')}`);
  });
});

test('тупиков нет: у героя в силах всегда есть хотя бы один путь', () => {
  Books.listBooks().forEach(short => {
    const b = Books.bookById(short.id);
    const allFlags = [];
    Object.values(b.nodes).forEach(n => (n.choices || []).forEach(c => {
      [].concat(c.flag || [], c.flags || []).forEach(f => { if (allFlags.indexOf(f) < 0) allFlags.push(f); });
    }));
    const hero = { bookId: b.id, node: b.start, hp: 5, maxHp: 5, items: 3, flags: allFlags, steps: [] };
    Object.keys(b.nodes).forEach(id => {
      const node = b.nodes[id];
      if (node.ending) return;
      const open = (node.choices || []).filter(c => !Books.choiceLocked(Object.assign({}, hero, { node: id }), c));
      assert.ok(open.length, `${b.id}/${id}: все выборы закрыты — герой заперт`);
    });
  });
});

test('каждая концовка достижима по правилам: улики, силы и припасы считаются', () => {
  const key = s => [s.node, s.flags.slice().sort().join('|'), s.hp, s.items].join('::');
  Books.listBooks().forEach(short => {
    const b = Books.bookById(short.id);
    const endings = Object.keys(b.nodes).filter(id => b.nodes[id].ending);
    const start = Books.startBook(b.id, { name: 'Проверка' });
    const seen = new Set([key(start)]);
    const queue = [start];
    const reached = new Set();
    let guard = 0;
    while (queue.length && guard < 20000) {
      const st = queue.shift();
      guard++;
      if (b.nodes[st.node].ending) { reached.add(st.node); continue; }
      (b.nodes[st.node].choices || []).forEach((c, i) => {
        const res = Books.bookStep(st, i);
        if (!res) return;
        const next = res.state;
        const k = key(next);
        if (seen.has(k)) return;
        seen.add(k);
        queue.push(next);
      });
    }
    const lost = endings.filter(id => !reached.has(id));
    assert.equal(lost.length, 0, `${b.id}: эти концовки недостижимы: ${lost.map(id => b.nodes[id].chapter).join(', ')}`);
  });
});

test('условия выборов опираются на то, что в истории есть', () => {
  Books.listBooks().forEach(short => {
    const b = Books.bookById(short.id);
    const obtainable = new Set();
    Object.values(b.nodes).forEach(n => (n.choices || []).forEach(c => {
      [].concat(c.flag || [], c.flags || []).forEach(f => obtainable.add(f));
    }));
    Object.entries(b.nodes).forEach(([id, node]) => {
      (node.choices || []).forEach(c => {
        (c.needs || []).forEach(f => {
          assert.ok(obtainable.has(f), `${b.id}/${id}: выбор требует «${f}», но получить это в истории нельзя`);
        });
        if (c.needs && c.needs.length) {
          assert.ok(c.needHint, `${b.id}/${id}: у закрытого выбора нет подсказки игроку`);
        }
      });
    });
  });
});

test('концовкам даны заголовки, а историям — вес', () => {
  Books.listBooks().forEach(short => {
    const b = Books.bookById(short.id);
    const endings = Object.keys(b.nodes).filter(id => b.nodes[id].ending);
    endings.forEach(id => {
      const meta = (b.endings || {})[id];
      assert.ok(meta && meta.title, `${b.id}/${id}: у концовки нет заголовка в списке концовок`);
    });
    let words = 0;
    Object.values(b.nodes).forEach(n => {
      (n.text || []).forEach(p => { words += String(p).split(/\s+/).length; });
      (n.choices || []).forEach(c => { words += String(c.text || '').split(/\s+/).length; });
    });
    assert.ok(words >= 500, `${b.id}: история коротковата — ${words} слов`);
  });
});

test('главу нельзя пройти мимо: голодный герой не берётся за смертельный путь', () => {
  // ресурс героя — здоровье и припасы: проверяем, что книга их честно считает
  const b = Books.bookById('ash');
  const drains = Object.entries(b.nodes).flatMap(([id, n]) =>
    (n.choices || []).filter(c => c.hp < 0 || c.item === -1).map(c => ({ id, c })));
  assert.ok(drains.length, 'в книге должен быть выбор, который тратит силы или припасы');
  drains.forEach(({ id, c }) => {
    const empty = { bookId: 'ash', node: id, hp: 1, maxHp: 5, items: 0, flags: [], steps: [] };
    const full = { bookId: 'ash', node: id, hp: 5, maxHp: 5, items: 3, flags: [], steps: [] };
    assert.ok(Books.choiceLocked(empty, c), 'пустому герою такой выбор предлагать нельзя');
    assert.equal(Books.choiceLocked(full, c), '', 'сытому герою путь открыт');
  });
});

test('закрытый выбор объясняет себя: без улики герой видит подсказку', () => {
  const b = Books.bookById('trakt');
  const guard = Object.entries(b.nodes).flatMap(([id, n]) =>
    (n.choices || []).filter(c => (c.needs || []).length).map(c => ({ id, c })));
  assert.ok(guard.length >= 3, 'в истории с уликами должны быть закрытые пути');
  guard.forEach(({ id, c }) => {
    const empty = { bookId: 'trakt', node: id, hp: 5, maxHp: 5, items: 3, flags: [], steps: [] };
    const locked = Books.choiceLocked(empty, c);
    assert.ok(locked && locked.indexOf('нужно') === 0, `${id}: закрытый выбор должен говорить, чего не хватает`);
    const full = { bookId: 'trakt', node: id, hp: 5, maxHp: 5, items: 3, flags: c.needs.slice(), steps: [] };
    assert.equal(Books.choiceLocked(full, c), '', `${id}: с уликой путь должен открыться`);
  });
});

test('история проходится до концовки: любой разрешённый путь не ломает состояние', () => {
  const state = Books.startBook('ash', { name: 'Свет' });
  assert.ok(state.node, 'книга должна начинаться главой');
  let steps = 0;
  let ended = null;
  while (steps < 60) {
    const choices = Books.bookChoices(state);
    if (!choices.length) { ended = Books.bookEnding(state); break; }
    const res = Books.bookStep(state, 0);
    assert.ok(res && res.state, 'шаг книги должен возвращать состояние');
    Object.assign(state, res.state);
    steps++;
    if (res.ending) { ended = Books.bookEnding(state); break; }
  }
  assert.ok(ended, 'за 60 шагов книга обязана прийти к концовке');
  assert.ok(ended.title, 'у концовки должен быть заголовок');
  assert.ok(state.steps.length > 0, 'шаги должны записаться в историю');
});

test('все стартовые концовки достижимы: у каждой есть путь от начала', () => {
  Books.listBooks().forEach(short => {
    const b = Books.bookById(short.id);
    const endings = Object.keys(b.nodes).filter(id => b.nodes[id].ending);
    endings.forEach(endId => {
      const seen = new Set([b.start]);
      const queue = [b.start];
      while (queue.length) {
        const cur = b.nodes[queue.shift()];
        (cur.choices || []).forEach(c => {
          if (!seen.has(c.to)) { seen.add(c.to); queue.push(c.to); }
        });
      }
      assert.ok(seen.has(endId), `${b.id}: до концовки «${b.nodes[endId].chapter}» нельзя дойти`);
    });
  });
});

test('прохождение истории выгружается текстом', () => {
  let state = Books.startBook('line', { name: 'Проводник' });
  for (let i = 0; i < 5; i++) {
    const res = Books.bookStep(state, 0);
    if (!res) break;
    Object.assign(state, res.state);
    if (res.ending) break;
  }
  const md = Books.bookStory(state);
  assert.ok(md.includes('# ' + Books.bookById('line').title), 'в выгрузке нет названия книги');
  assert.ok(md.includes('Проводник'), 'в выгрузке нет имени героя');
  assert.ok(md.includes('Выбор:'), 'в выгрузке не видно выборов');
  assert.ok(md.length > 400, 'выгрузка не должна быть огрызком: ' + md.length);
});

test('истории не зависят от сети и ИИ: только свои данные', () => {
  const bad = ['fetch(', 'XMLHttpRequest', 'localStorage', '/api/', 'http://', 'https://'];
  ['books.js', 'stories.js'].forEach(name => {
    const src = fs.readFileSync(path.join(SRC, name), 'utf8');
    bad.forEach(word => {
      assert.ok(!src.includes(word), `${name}: история не должна зависеть от сети: найдено ${word}`);
    });
  });
});
