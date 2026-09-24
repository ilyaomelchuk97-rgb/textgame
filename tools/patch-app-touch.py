# -*- coding: utf-8 -*-
"""Патч: жесты (24), режим «одной рукой» (27), доступность (26)."""
import io, sys


def patch(path, pairs):
    src = io.open(path, encoding='utf-8').read()
    for tag, old, new in pairs:
        n = src.count(old)
        if n != 1:
            print('ЯКОРЬ (%d) %s в %s' % (n, tag, path))
            sys.exit(1)
        src = src.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(src)
    print('ok: %s — %d симв.' % (path, len(src)))


APP = '/home/user/src/app.js'
IDX = '/home/user/index.html'

patch(APP, [
    # ---------- 27: режим «одной рукой» ----------
    ('настройка handOne',
     """      haptics: true,                       // отклик вибрацией там, где телефон умеет""",
     """      haptics: true,                       // отклик вибрацией там, где телефон умеет
      handOne: false,                      // режим «одной рукой»: кнопки ниже и выше"""),

    ('функция режима',
     """  function applyTextSize() {""",
     """  /** Режим «одной рукой»: варианты прижимаются к низу и становятся выше. */
  function applyHandOne() {
    document.body.classList.toggle('hand-one', !!Settings.data.handOne);
  }

  function applyTextSize() {"""),

    ('вызов при старте',
     """    applyTheme(null);
    applyTextSize();""",
     """    applyTheme(null);
    applyTextSize();
    applyHandOne();"""),

    ('секция в настройках',
     """      h('div', { class: 'section-title', text: 'Оформление' }),""",
     """      h('div', { class: 'section-title', text: 'Как держу телефон' }),
      h('p', { class: 'muted small', text: 'Режим «одной рукой» поднимает кнопки вариантов выше и делает их крупнее — удобно в транспорте.' }),
      choiceRow([
        { id: 'hand-two', title: '🖐 Как обычно', hint: 'кнопки на своих местах' },
        { id: 'hand-one', title: '👍 Одной рукой', hint: 'крупнее и ниже, ближе к пальцу' }
      ], Settings.data.handOne ? 'hand-one' : 'hand-two', id => {
        Settings.set({ handOne: id === 'hand-one' });
        applyHandOne();
        closeModal(); openSettings();
      }),

      h('div', { class: 'section-title', text: 'Оформление' }),"""),

    # ---------- 24: подсказка шансов долгим нажатием ----------
    ('подсказка шансов',
     """      wrap.appendChild(h('button', {
        class: 'action-btn', type: 'button',
        onclick: () => onActionChosen(opt)
      }, [
        h('span', { class: 'action-btn__text', text: opt.text }),
        h('span', { class: 'action-btn__meta' }, meta)
      ]));
    });
  }""",
     """      const btn = h('button', {
        class: 'action-btn', type: 'button',
        'aria-label': opt.text + '. ' + diff.label + ', шанс ' + chance + ' процентов',
        onclick: () => {
          if (opt.__held) { opt.__held = false; return; }   // долгое нажатие — это вопрос, а не выбор
          onActionChosen(opt);
        }
      }, [
        h('span', { class: 'action-btn__text', text: opt.text }),
        h('span', { class: 'action-btn__meta' }, meta)
      ]);
      attachLongPress(btn, opt, { stat, diff, mod: totalMod, chance, dc: opt.dc || diff.dc, advantage });
      wrap.appendChild(btn);
    });
  }

  /**
   * Долгое нажатие на вариант — объяснение шанса словами (п.24).
   * Пальцем по телефону это быстрее, чем разбирать чипы.
   */
  function attachLongPress(btn, opt, info) {
    let timer = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('touchstart', () => {
      clear();
      timer = setTimeout(() => {
        opt.__held = true;
        clear();
        Sound.tap();
        const src = info.advantage
          ? 'преимущество: два d20, берём лучший'
          : (info.mod >= 0 ? '+' + info.mod : String(info.mod)) + ' к броску';
        notify('Почему ' + info.chance + '%: ' + info.stat.short + ' ' + info.mod +
          ' против сложности ' + info.dc + ' (' + info.diff.label + '), ' + src + '.', { timeout: 5200 });
      }, 550);
    }, { passive: true });
    btn.addEventListener('touchmove', clear, { passive: true });
    btn.addEventListener('touchend', clear, { passive: true });
    btn.addEventListener('touchcancel', clear, { passive: true });
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }"""),

    # ---------- 24: жесты ----------
    ('вызов жестов',
     """    $('#scene-media').addEventListener('dblclick', () => loadSceneImage(State.game && State.game.scene && State.game.scene.imagePrompt, null, false));""",
     """    $('#scene-media').addEventListener('dblclick', () => loadSceneImage(State.game && State.game.scene && State.game.scene.imagePrompt, null, false));
    attachGestures();"""),

    ('функция жестов',
     """  /* --- мгновенный фон + догрузка ИИ-картинки --- */""",
     """  /**
   * Жесты, которых ждёт палец (п.24): свайп влево по кадру — перерисовать,
   * свайп вверх по панели — история. Всё дополнительно к кнопкам.
   * Здесь же — клавиатура и фокус-ловушка (п.26).
   */
  function attachGestures() {
    const media = $('#scene-media');
    if (media) {
      let sx = 0, sy = 0;
      media.addEventListener('touchstart', e => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        sx = t.clientX; sy = t.clientY;
      }, { passive: true });
      media.addEventListener('touchend', e => {
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!t) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (dx > -46 || Math.abs(dy) > 60) return;               // нужен именно свайп влево
        if (State.book) {
          const cur = bookCurrent();
          State.backdropSeed = E.rnd.seed();
          if (cur) paintBackdrop(cur.node.art || cur.node.chapter, cur.node.text.join(' '));
          toast('Кадр перерисован', { timeout: 1400 });
          return;
        }
        Sound.tap();
        toast('Рисуем кадр заново', { timeout: 1500 });
        loadSceneImage(State.game && State.game.scene && State.game.scene.imagePrompt, null, false, { force: true });
      }, { passive: true });
    }

    const panel = $('#panel');
    if (panel) {
      let py = 0;
      panel.addEventListener('touchstart', e => {
        const t = e.touches && e.touches[0];
        if (t) py = t.clientY;
      }, { passive: true });
      panel.addEventListener('touchend', e => {
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!t) return;
        const dy = t.clientY - py;
        const wrap = $('#log-wrap');
        const toggle = $('#log-toggle');
        if (!wrap || !toggle || toggle.hidden) return;
        if (dy < -46 && wrap.hidden) {
          wrap.hidden = false;
          toggle.textContent = 'Скрыть историю';
          Sound.tap();
        } else if (dy > 46 && !wrap.hidden) {
          wrap.hidden = true;
          toggle.textContent = 'История';
        }
      }, { passive: true });
    }

    // клавиатура: цифры выбирают вариант, Esc — назад, Tab не уходит из модалки
    document.addEventListener('keydown', e => {
      const modalOpen = !$('#modal').hidden;
      if (e.key === 'Tab' && modalOpen) {
        const items = $$('#modal button, #modal [href], #modal input, #modal [tabindex]:not([tabindex="-1"])')
          .filter(el => !el.disabled && el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key === 'Escape') {
        if (modalOpen) { closeModal(); return; }
        if (document.body.dataset.screen === 'game' && $('#prologue') && !$('#prologue').hidden) {
          $('#prologue').hidden = true;
          return;
        }
        if (document.body.dataset.screen === 'game') {
          const close = $('[data-act="close-game"]');
          if (close) close.click();
        } else if (document.body.dataset.screen !== 'menu') {
          const back = $('[data-act="back"]');
          if (back) back.click();
        }
        return;
      }
      if (document.body.dataset.screen !== 'game' || modalOpen) return;
      if (/^[1-9]$/.test(e.key)) {
        const btns = $$('#actions .action-btn:not(.action-btn--ghost)');
        const btn = btns[Number(e.key) - 1];
        if (btn) { e.preventDefault(); btn.click(); }
      }
    });
  }

  /* --- мгновенный фон + догрузка ИИ-картинки --- */"""),
])

patch(IDX, [
    ('живое объявление сцены',
     """        <div class="scene-text__body" id="scene-text"></div>""",
     """        <div class="scene-text__body" id="scene-text" role="status" aria-live="polite" aria-atomic="false"></div>"""),
])
