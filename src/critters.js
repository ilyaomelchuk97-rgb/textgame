/* ============================================================
 * Dice Tales — critters.js
 * Мультяшные герои главного экрана: смешной рыцарь убегает
 * через весь экран и за край, а за ним по пятам несётся
 * красный дракоша (иногда наоборот — дракоша бежит первым).
 *
 * Всё нарисовано кодом (встроенный SVG), поэтому работает
 * без сети и в однофайловой сборке.
 *
 * Публичный интерфейс:
 *   DTCritters.mount(el, { onTap }) → { start, stop, destroy, els }
 *   DTCritters.knightSvg() / dragonSvg() — разметка (для тестов)
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DTCritters = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------- */
  /* Рыцарь: горшковый шлем, плюмаж, крошечный меч и щит         */
  /* Два кадра ног меняются местами, как в старом мультике        */
  /* ---------------------------------------------------------- */
  function knightSvg() {
    return `
<svg class="critter__art" viewBox="0 0 120 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <g class="dust">
    <circle class="puff puff--1" cx="26" cy="122" r="5"/>
    <circle class="puff puff--2" cx="16" cy="114" r="3.5"/>
    <circle class="puff puff--3" cx="34" cy="112" r="2.5"/>
  </g>
  <g class="knight">
    <!-- плащ развевается за спиной -->
    <path class="art-cloak" d="M48 56 L30 88 L36 96 L48 74 Z"/>
    <path class="art-cloak" d="M50 58 L38 92 L46 94 L54 70 Z" opacity=".75"/>

    <!-- ноги: два кадра бега, у каждой сапог -->
    <g class="legs legs--a">
      <path class="art-leg" d="M62 90 L66 118 h-9 L54 90 Z"/>
      <path class="art-boot" d="M66 114 h11 v9 h-20 v-6 Z"/>
      <path class="art-leg" d="M56 90 L44 118 h-9 L50 90 Z"/>
      <path class="art-boot" d="M44 114 h11 v9 h-20 v-6 Z"/>
    </g>
    <g class="legs legs--b">
      <path class="art-leg" d="M62 90 L68 118 h-9 L54 90 Z"/>
      <path class="art-boot" d="M68 114 h11 v9 h-20 v-6 Z"/>
      <path class="art-leg" d="M56 90 L58 118 h-9 L50 90 Z"/>
      <path class="art-boot" d="M58 114 h11 v9 h-20 v-6 Z"/>
    </g>

    <!-- корпус -->
    <path class="art-body" d="M48 60 q-4 -16 16 -16 q20 0 16 16 l4 24 q1 9 -20 9 q-21 0 -20 -9 Z"/>
    <path class="art-belt" d="M45 84 h35 v8 h-35 Z"/>
    <circle class="art-buckle" cx="62" cy="88" r="3.4"/>

    <!-- щит со звездой в передней руке -->
    <g class="knight__shield">
      <path class="art-shield" d="M86 64 q15 5 15 18 q0 16 -15 24 q-15 -8 -15 -24 q0 -13 15 -18 Z"/>
      <path class="art-star" d="M86 78 l3 6 6.5 1 -4.7 4.6 1.1 6.6 -5.9 -3.3 -5.9 3.3 1.1 -6.6 -4.7 -4.6 6.5 -1 Z"/>
      <path class="art-body" d="M74 68 l12 -6 6 11 -12 6 Z"/>
    </g>

    <!-- голова: горшковый шлем с плюмажем -->
    <g class="knight__head">
      <path class="art-plume" d="M60 26 q-4 -16 -20 -18 q14 7 11 18 Z"/>
      <path class="art-steel" d="M44 32 q0 -8 16 -8 q16 0 16 8 l2 20 q0 8 -18 8 q-18 0 -18 -8 Z"/>
      <path class="art-visor" d="M45 42 h33 v7 h-33 Z"/>
      <circle class="art-glow" cx="54" cy="45.5" r="2.4"/>
      <circle class="art-glow" cx="70" cy="45.5" r="2.4"/>
      <circle class="art-cheek" cx="44" cy="58" r="4.4"/>
      <path class="art-nose" d="M62 52 q4 3 0 6"/>
    </g>

    <!-- занесённый над головой меч (справа от щита, чтобы клинок читался целиком) -->
    <g class="knight__arm">
      <path class="art-body" d="M74 60 l18 -8 4 8 -18 9 Z"/>
      <path class="art-steel" d="M100 4 l11 3 -6 48 -11 -3 Z"/>
      <path class="art-hilt" d="M88 50 l28 7 -3 9 -28 -7 Z"/>
      <path class="art-hilt" d="M98 62 l9 2 -3 11 -9 -2 Z"/>
      <circle class="art-buckle" cx="99" cy="78" r="4"/>
    </g>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Дракоша: толстый, красный, крылья хлопают, из носа дымок     */
  /* ---------------------------------------------------------- */
  function dragonSvg() {
    // Рисунок нарисован «вправо» (как и рыцарь): голова справа, хвост слева.
    // Для бега влево вся фигурка отражается CSS-анимацией.
    return `
<svg class="critter__art" viewBox="0 0 150 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <g class="smoke">
    <circle class="fume fume--1" cx="146" cy="42" r="6"/>
    <circle class="fume fume--2" cx="152" cy="32" r="4"/>
    <circle class="fume fume--3" cx="138" cy="30" r="3"/>
  </g>

  <!-- хвост со стрелкой на конце -->
  <path class="art-dragon art-tail" d="M56 78 q-20 4 -30 -6 q4 12 14 14 q-10 6 -12 14 q18 0 26 -8 q10 -8 6 -20 Z"/>
  <path class="art-spike" d="M22 70 l-10 -6 3 11 Z"/>
  <path class="art-spike" d="M34 60 l-2 -12 8 8 Z"/>

  <!-- крылья: два кадра взмаха -->
  <g class="wings wings--a">
    <path class="art-wing" d="M84 62 q-18 -38 -10 -56 q12 16 24 19 q-10 13 5 19 q-17 7 -19 18 Z"/>
    <path class="art-wing-bone" d="M84 62 q-8 -26 -8 -46 M96 62 q-4 -24 0 -34 M104 68 q2 -18 0 -24"/>
  </g>
  <g class="wings wings--b">
    <path class="art-wing" d="M84 64 q-26 -14 -40 -9 q17 5 21 16 q9 -7 19 -7 Z"/>
    <path class="art-wing-bone" d="M84 64 q-14 -10 -30 -8 M96 66 q-10 -8 -22 -6"/>
  </g>

  <!-- лапы: два кадра бега, с когтями -->
  <g class="legs legs--a">
    <path class="art-dragon" d="M78 96 l-8 20 h-11 l10 -20 Z"/>
    <path class="art-claw" d="M59 114 h13 v8 h-15 Z"/>
    <path class="art-dragon" d="M112 96 l8 20 h-11 l-10 -20 Z"/>
    <path class="art-claw" d="M109 114 h13 v8 h-15 Z"/>
  </g>
  <g class="legs legs--b">
    <path class="art-dragon" d="M80 96 l4 20 h-11 l-2 -20 Z"/>
    <path class="art-claw" d="M73 114 h13 v8 h-15 Z"/>
    <path class="art-dragon" d="M110 96 l-2 20 h-11 l6 -20 Z"/>
    <path class="art-claw" d="M97 114 h13 v8 h-15 Z"/>
  </g>

  <!-- пузо и туловище -->
  <path class="art-belly" d="M66 96 q24 10 44 -2 q-6 16 -24 18 q-18 1 -20 -16 Z"/>
  <path class="art-dragon" d="M54 78 q2 -18 28 -18 q26 0 34 20 q6 18 -8 26 q-14 8 -34 4 q-22 -4 -20 -32 Z"/>
  <path class="art-spike" d="M66 62 l4 -12 8 10 Z"/>
  <path class="art-spike" d="M80 56 l6 -12 6 12 Z"/>
  <path class="art-spike" d="M94 58 l8 -10 3 11 Z"/>

  <!-- шея и голова -->
  <path class="art-dragon" d="M100 62 q6 -14 20 -16 l6 14 q-12 4 -14 14 Z"/>
  <g class="dragon__head" transform="translate(110 42) scale(1.14) translate(-110 -42)">
    <path class="art-dragon" d="M108 44 q0 -16 18 -18 q18 -1 22 12 q3 9 -6 14 q-14 8 -28 2 q-6 -4 -6 -10 Z"/>
    <path class="art-horn" d="M112 30 q-2 -14 8 -20 q-2 12 2 17 Z"/>
    <path class="art-horn" d="M124 26 q4 -12 15 -12 q-9 7 -8 14 Z"/>
    <circle class="art-eye-white" cx="122" cy="42" r="7"/>
    <circle class="art-eye" cx="124" cy="42" r="3"/>
    <path class="art-brow" d="M114 32 l14 4"/>
    <path class="art-mouth" d="M118 58 q14 2 22 -6"/>
    <path class="art-tooth" d="M126 55 l4 7 3 -8 Z"/>
    <circle class="art-cheek" cx="116" cy="52" r="4"/>
    <circle class="art-nostril" cx="142" cy="44" r="1.8"/>
    <path class="art-ear" d="M110 36 q-8 -6 -12 0 q6 2 8 6 Z"/>
  </g>
  <g class="blink">
    <path class="art-mouth" d="M116 42 h12"/>
  </g>
</svg>`;
  }

  const ROLES = ['knight', 'dragon'];

  function mount(container, opts) {
    if (!container) return null;
    opts = opts || {};
    if (container.dataset.crittersReady === '1') return container.__dtCritters || null;

    container.dataset.crittersReady = '1';
    container.innerHTML =
      '<div class="critter critter--knight" data-role="knight">' + knightSvg() + '</div>' +
      '<div class="critter critter--dragon" data-role="dragon">' + dragonSvg() + '</div>';

    const els = {
      knight: container.querySelector('[data-role="knight"]'),
      dragon: container.querySelector('[data-role="dragon"]')
    };
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const timers = [];
    const state = { active: false, reduced, els, container };

    const rnd = (min, max) => min + Math.random() * (max - min);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    const clearAll = () => { while (timers.length) clearTimeout(timers.pop()); };

    /* В каком положении фигурка «паркуется» за краем экрана */
    const PARK = {
      right: 'translateX(-140px)',
      left: 'translateX(calc(100vw + 40px)) scaleX(-1)'
    };

    function park(el, dir) {
      el.classList.remove('is-running', 'is-hit');
      el.style.animation = 'none';
      el.style.transform = PARK[dir];
    }

    function run(el, dir, duration, delay) {
      park(el, dir === 'right' ? 'left' : 'right'); // стартовая точка — за противоположным краем
      el.classList.add('is-running');
      el.style.animation =
        (dir === 'right' ? 'critter-run-right ' : 'critter-run-left ') +
        duration.toFixed(2) + 's linear ' + delay.toFixed(2) + 's 1 both';
      el.style.transform = dir === 'right'
        ? 'translateX(calc(100vw + 40px))'
        : 'translateX(-140px) scaleX(-1)';
    }

    function tick() {
      if (!state.active) return;
      const dir = Math.random() < 0.5 ? 'right' : 'left';
      const dragonFirst = Math.random() < 0.22;      // иногда дракоша бежит первым
      const lead = dragonFirst ? els.dragon : els.knight;
      const chase = dragonFirst ? els.knight : els.dragon;
      const duration = rnd(3.4, 5.4);
      // преследователь стартует чуть позже и бежит медленнее — держится на хвосте,
      // но не наезжает на убегающего
      const gap = dragonFirst ? rnd(0.6, 1.2) : rnd(0.7, 1.3);

      run(lead, dir, duration, 0);
      run(chase, dir, duration * rnd(1.08, 1.22), gap);

      // дракоша иногда притормаживает и «налетает» — просто смешная пауза
      const pause = rnd(0.9, 4.6) * 1000;
      later(tick, (duration + Math.max(gap, 0.4)) * 1000 + pause);
    }

    function start() {
      if (state.active || reduced) return;
      state.active = true;
      tick();
    }

    function stop() {
      state.active = false;
      clearAll();
      park(els.knight, 'left');
      park(els.dragon, 'left');
    }

    function hop(el) {
      el.classList.remove('is-hit');
      void el.offsetWidth;
      el.classList.add('is-hit');
      later(() => el.classList.remove('is-hit'), 900);
      if (typeof opts.onTap === 'function') opts.onTap(el.dataset.role);
    }

    ROLES.forEach(role => {
      els[role].addEventListener('click', () => hop(els[role]));
    });

    if (reduced) {
      // при «уменьшении движения» герои просто стоят у краёв без беготни
      els.knight.classList.add('critter--still');
      els.dragon.classList.add('critter--still');
    } else {
      park(els.knight, 'left');
      park(els.dragon, 'left');
    }

    const api = { start, stop, els, roleNames: ROLES, reduced, destroy: () => { stop(); container.innerHTML = ''; container.dataset.crittersReady = ''; } };
    container.__dtCritters = api;
    return api;
  }

  return { mount, knightSvg, dragonSvg, ROLES };
});
