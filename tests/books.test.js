/* Книги-игры: главы без ИИ. Проверяем, что их можно пройти до конца,
   что условия на выборы работают и что прохождение выгружается текстом. */

const test = require('node:test');
const assert = require('node:assert');
const Books = require('../src/books.js');

test('книги на месте: у каждой есть главы, начало и концовки', () => {
  const list = Books.listBooks();
  assert.ok(list.length >= 2, 'нужно хотя бы две книги: ' + list.length);
  list.forEach(short => {
    const b = Books.bookById(short.id);
    const chapters = Object.keys(b.nodes).length;
    assert.ok(chapters >= 6, `${b.id}: глав должно быть не меньше шести, а их ${chapters}`);
    assert.ok(b.nodes[b.start], `${b.id}: стартовой главы нет среди узлов`);
    const endings = Object.keys(b.nodes).filter(id => b.nodes[id].ending);
    assert.ok(endings.length >= 2, `${b.id}: концовок должно быть минимум две, а их ${endings.length}`);
    Object.entries(b.nodes).forEach(([id, node]) => {
      assert.ok(node.chapter && node.text && node.text.length, `${b.id}/${id}: глава без названия или текста`);
      assert.ok(node.ending || (node.choices && node.choices.length), `${b.id}/${id}: глава без выборов`);
      (node.choices || []).forEach(c => {
        assert.ok(b.nodes[c.to], `${b.id}/${id}: выбор ведёт в несуществующую главу ${c.to}`);
      });
    });
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

test('книга проходится до концовки: любой разрешённый путь не ломает состояние', () => {
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

test('прохождение книги выгружается текстом', () => {
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

test('книга не зависит от сети и ИИ: только свои данные', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'books.js'), 'utf8');
  ['fetch(', 'XMLHttpRequest', 'localStorage', '/api/', 'http://', 'https://'].forEach(bad => {
    assert.ok(!src.includes(bad), 'книга не должна зависеть от сети: найдено ' + bad);
  });
});
