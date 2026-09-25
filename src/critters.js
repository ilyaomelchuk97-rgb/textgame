/* ============================================================
 * Dice Tales — critters.js
 * Мультяшные герои главного экрана: кто-то убегает через весь
 * экран и за край, а за ним по пятам несётся погоня — иногда
 * наоборот, первым бежит монстр.
 *
 * Фигур целый отряд (12), и пара выбирается заново каждый раз,
 * когда игрок возвращается в меню: рыцарь с драконом, космо-инженер
 * с некроморфом, кибер-самурай с дроном, орк с големом и так далее.
 * Названия отсылают к знакомым играм, но нарисованы все своими
 * руками — встроенным SVG, без сети и без чужих картинок.
 *
 * Публичный интерфейс:
 *   DTCritters.mount(el, { onTap }) → { start, stop, destroy, els, pickPair, pair }
 *   DTCritters.roster() / svgFor(id) / infoFor(id) / knightSvg() / dragonSvg()
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DTCritters = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------- */
  /* Общие мелочи рисования                                      */
  /* ---------------------------------------------------------- */

  /** Пыль под ногами: одинаковая у всех, чтобы бег читался единым мультиком. */
  const dust = () => `
  <g class="dust">
    <circle class="puff puff--1" cx="26" cy="122" r="5"/>
    <circle class="puff puff--2" cx="16" cy="114" r="3.5"/>
    <circle class="puff puff--3" cx="34" cy="112" r="2.5"/>
  </g>`;

  /** Ноги: два кадра (a/b) — как в рисованном мультике. */
  const legs = (cls) => `
  <g class="legs--a"><path class="${cls}" d="M44 96 l-4 24 h11 l6 -24 Z"/><path class="${cls}" d="M70 96 l4 24 h-11 l-6 -24 Z"/></g>
  <g class="legs--b"><path class="${cls}" d="M44 96 l6 24 h-11 l-2 -24 Z"/><path class="${cls}" d="M70 96 l-2 24 h11 l-4 -24 Z"/></g>`;

  /** Ноги зверя: четыре, двумя кадрами. */
  const beastLegs = (cls) => `
  <g class="legs--a"><path class="${cls}" d="M40 98 l-3 22 h10 l4 -22 Z"/><path class="${cls}" d="M68 98 l-4 22 h10 l4 -22 Z"/></g>
  <g class="legs--b"><path class="${cls}" d="M50 98 l3 22 h-10 l-3 -22 Z"/><path class="${cls}" d="M78 98 l3 22 h-10 l-3 -22 Z"/></g>`;

  /* ---------------------------------------------------------- */
  /* Рыцарь: горшковый шлем, плюмаж, крошечный меч и щит          */
  /* ---------------------------------------------------------- */
  function knightSvg() {
    return `
<svg class="critter__art" viewBox="0 0 120 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  ${legs('art-leg')}
  <path class="art-cloak" d="M34 60 q-10 22 -6 40 q14 8 22 2 q-6 -22 -2 -42 Z"/>
  <path class="art-body" d="M40 52 q20 -10 40 0 q6 20 3 46 q-23 8 -46 0 q-3 -26 3 -46 Z"/>
  <path class="art-belt" d="M38 80 h44 v8 h-44 Z"/>
  <path class="art-buckle" d="M56 78 h9 v12 h-9 Z"/>
  <path class="art-steel" d="M36 54 q-8 4 -10 16 q6 6 12 6 q2 -12 4 -22 Z"/>
  <g class="knight__arm"><path class="art-steel" d="M80 58 q12 4 16 16 l-6 6 q-8 -8 -16 -10 Z"/>
  <path class="art-hilt" d="M92 74 l14 -14 l7 7 l-14 14 Z"/><path class="art-steel" d="M104 58 l10 -10 l6 6 l-10 10 Z"/></g>
  <g class="knight__shield"><path class="art-shield" d="M24 62 q-6 18 4 30 q10 -2 13 -10 q-10 -12 -8 -24 Z"/>
  <path class="art-star" d="M30 72 l2 5 l5 1 l-4 4 l1 5 l-4 -3 l-5 3 l1 -5 l-4 -4 l5 -1 Z"/></g>
  <g class="knight__head">
    <path class="art-steel" d="M46 22 q14 -8 28 0 q4 16 0 32 q-14 6 -28 0 q-4 -16 0 -32 Z"/>
    <path class="art-visor" d="M50 34 h20 v7 h-20 Z"/>
    <path class="art-visor" d="M52 45 h16 v3 h-16 Z"/>
    <path class="art-plume" d="M60 14 q10 -6 14 2 q-8 4 -10 12 q-3 -8 -4 -14 Z"/>
    <g class="blink"><path class="art-eye" d="M53 37 h4 v3 h-4 Z"/><path class="art-eye" d="M63 37 h4 v3 h-4 Z"/></g>
  </g>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Дракон: крылья, гребень, зубастая пасть                      */
  /* ---------------------------------------------------------- */
  function dragonSvg() {
    return `
<svg class="critter__art" viewBox="0 0 150 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  <g class="wings--a"><path class="art-wing" d="M74 60 q-26 -30 -50 -26 q16 20 22 42 q14 -8 28 -16 Z"/></g>
  <g class="wings--b"><path class="art-wing" d="M74 62 q-22 -18 -44 -12 q18 14 22 32 q12 -8 22 -20 Z"/></g>
  ${beastLegs('art-leg')}
  <path class="art-claw" d="M36 120 l-4 5 h6 Z"/><path class="art-claw" d="M74 120 l-4 5 h6 Z"/>
  <path class="art-tail" d="M56 78 q-20 4 -30 -6 q4 12 14 14 q-10 6 -12 14 q18 0 26 -8 q10 -8 6 -20 Z"/>
  <path class="art-dragon" d="M54 78 q2 -18 28 -18 q26 0 34 20 q6 18 -8 26 q-14 8 -34 4 q-22 -4 -20 -32 Z"/>
  <path class="art-belly" d="M64 84 q16 -6 30 0 q2 10 -4 16 q-14 4 -24 0 q-6 -6 -2 -16 Z"/>
  <path class="art-spike" d="M60 62 l4 -12 l6 10 Z"/><path class="art-spike" d="M72 58 l5 -12 l6 11 Z"/>
  <path class="art-dragon" d="M96 60 q4 -18 22 -20 l8 16 q-14 4 -18 16 Z"/>
  <path class="art-horn" d="M118 42 l8 -10 l3 12 Z"/>
  <g class="dragon__head"><path class="art-dragon" d="M108 44 q14 -4 20 6 q2 8 -6 10 q-10 2 -16 -4 Z"/>
  <path class="art-jaw" d="M112 58 q10 4 16 -2 q-2 10 -12 10 q-6 0 -4 -8 Z"/>
  <path class="art-tooth" d="M118 56 l3 5 l3 -5 Z"/>
  <path class="art-cheek" d="M112 54 a4 3 0 1 0 0.2 0 Z"/>
  <path class="art-eyewhite" d="M114 46 a4 4 0 1 0 0.2 0 Z"/>
  <path class="art-eye" d="M116 46 a2 2 0 1 0 0.2 0 Z"/><path class="art-nostril" d="M126 50 l3 2 l-3 2 Z"/></g>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Космо-инженер: тяжёлый шлем со светящейся прорезью,           */
  /* ранцевый блок и плазменный резак (по мотивам Dead Space)      */
  /* ---------------------------------------------------------- */
  function engineerSvg() {
    return `
<svg class="critter__art" viewBox="0 0 120 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  ${legs('art-leg')}
  <path class="art-rig" d="M40 50 q20 -8 40 0 l4 46 q-24 8 -48 0 Z"/>
  <path class="art-plate" d="M60 56 h12 v40 h-12 Z"/>
  <path class="art-glowline" d="M62 62 h8 v4 h-8 Z"/><path class="art-glowline" d="M62 72 h8 v4 h-8 Z"/>
  <path class="art-rig" d="M28 52 q-8 6 -8 20 l10 4 q2 -14 6 -20 Z"/>
  <g class="knight__arm"><path class="art-rig" d="M84 56 q12 4 16 18 l-8 6 q-6 -12 -14 -16 Z"/>
  <path class="art-steel" d="M96 74 l16 -6 l3 8 l-16 6 Z"/><path class="art-glowline" d="M112 72 l8 -3 l2 6 l-8 3 Z"/></g>
  <g class="knight__head">
    <path class="art-steel" d="M44 20 q16 -8 32 0 q6 16 2 34 q-18 6 -36 0 q-4 -18 2 -34 Z"/>
    <path class="art-visor" d="M50 32 h22 v12 h-22 Z"/>
    <path class="art-glow" d="M52 35 h7 v5 h-7 Z"/><path class="art-glow" d="M63 35 h7 v5 h-7 Z"/>
    <path class="art-steel" d="M46 46 h30 v4 h-30 Z"/>
  </g>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Некроморф: косые клинки вместо рук, вытянутый череп           */
  /* (монстр из «Мёртвого космоса»)                                */
  /* ---------------------------------------------------------- */
  function necroSvg() {
    return `
<svg class="critter__art" viewBox="0 0 130 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  ${legs('art-necro')}
  <path class="art-necro" d="M48 62 q14 -12 34 -4 q10 20 6 40 q-22 8 -44 0 q-4 -22 4 -36 Z"/>
  <path class="art-bone" d="M56 70 h20 v6 h-20 Z"/><path class="art-bone" d="M58 82 h16 v5 h-16 Z"/>
  <g class="blade--a"><path class="art-blade" d="M84 62 l34 -24 l3 7 l-32 26 Z"/></g>
  <g class="blade--b"><path class="art-blade" d="M30 66 l-28 -20 l-3 8 l28 20 Z"/></g>
  <path class="art-necro" d="M60 40 q14 -16 26 0 q-2 22 -14 24 q-12 -2 -12 -24 Z"/>
  <path class="art-bone" d="M64 34 h18 v5 h-18 Z"/>
  <path class="art-glow" d="M64 40 l6 -4 l1 6 Z"/><path class="art-glow" d="M76 40 l-6 -4 l-1 6 Z"/>
  <path class="art-bone" d="M66 52 h6 v7 h-6 Z"/><path class="art-bone" d="M74 52 h6 v7 h-6 Z"/><path class="art-bone" d="M70 59 h6 v4 h-6 Z"/>
  <path class="art-bone" d="M60 26 l-6 -12 l10 6 Z"/><path class="art-bone" d="M82 26 l6 -12 l-10 6 Z"/>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Кибер-самурай: плащ, висок, катана с неоновой кромкой         */
  /* (по мотивам Cyberpunk)                                        */
  /* ---------------------------------------------------------- */
  function cyberSvg() {
    return `
<svg class="critter__art" viewBox="0 0 130 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  ${legs('art-cyber')}
  <path class="art-cloak" d="M40 54 q22 -10 44 4 q8 26 4 46 q-30 10 -56 -2 q2 -28 8 -48 Z"/>
  <path class="art-cyber" d="M46 52 q18 -8 32 2 q4 20 0 40 q-16 6 -32 -2 q-4 -20 0 -40 Z"/>
  <path class="art-glowline" d="M50 62 h26 v4 h-26 Z"/><path class="art-glowline" d="M52 72 h22 v4 h-22 Z"/>
  <g class="blade--b"><path class="art-steel" d="M44 66 l-34 -18 l-3 7 l34 20 Z"/><path class="art-hilt" d="M44 64 l8 6 l-5 6 l-8 -6 Z"/></g>
  <path class="art-cyber" d="M52 26 q14 -10 26 0 q4 14 0 26 q-14 5 -26 0 q-4 -12 0 -26 Z"/>
  <path class="art-visor" d="M48 30 h34 v9 h-34 Z"/><path class="art-glow" d="M50 32 h12 v5 h-12 Z"/><path class="art-glow" d="M66 32 h14 v5 h-14 Z"/>
  <path class="art-cyber" d="M78 24 l10 4 l-2 12 l-6 -4 Z"/>
  <path class="art-glowline" d="M80 34 l6 2 l-1 6 l-6 -2 Z"/>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Орк-воин: клыки, топор, наплечник (по мотивам WoW)            */
  /* ---------------------------------------------------------- */
  function orcSvg() {
    return `
<svg class="critter__art" viewBox="0 0 130 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  ${legs('art-orc')}
  <path class="art-orc" d="M38 52 q24 -12 46 2 q6 26 2 44 q-26 10 -50 0 q-4 -26 2 -46 Z"/>
  <path class="art-hide" d="M36 78 h52 v10 h-52 Z"/>
  <path class="art-metal" d="M30 52 q-6 12 0 22 l12 2 q-4 -12 -2 -22 Z"/>
  <path class="art-metal" d="M88 48 q14 2 18 14 l-8 8 q-6 -12 -14 -14 Z"/>
  <g class="knight__arm"><path class="art-orc" d="M92 62 q10 6 12 18 l-9 5 q-4 -12 -10 -16 Z"/>
  <path class="art-hilt" d="M100 76 l16 -10 l4 7 l-16 10 Z"/><path class="art-metal" d="M116 62 q10 -4 12 6 q-8 6 -12 8 Z"/></g>
  <g class="knight__head">
    <path class="art-orc" d="M46 24 q16 -10 30 2 q4 14 0 26 q-16 6 -30 0 q-4 -14 0 -28 Z"/>
    <path class="art-tooth" d="M52 48 l4 9 l4 -9 Z"/><path class="art-tooth" d="M70 48 l-4 9 l-4 -9 Z"/>
    <path class="art-brow" d="M50 34 q8 -4 14 0"/><path class="art-brow" d="M66 34 q8 -4 12 0"/>
    <g class="blink"><path class="art-eye" d="M53 40 h5 v4 h-5 Z"/><path class="art-eye" d="M67 40 h5 v4 h-5 Z"/></g>
    <path class="art-ear" d="M78 34 l10 -6 l-2 12 Z"/>
  </g>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Тёмный маг: балахон, посох с шаром, светящиеся глаза          */
  /* ---------------------------------------------------------- */
  function mageSvg() {
    return `
<svg class="critter__art" viewBox="0 0 120 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  <path class="art-robe" d="M40 60 q18 -12 40 0 q10 30 8 46 q-28 8 -56 0 q-2 -18 8 -46 Z"/>
  ${legs('art-robe')}
  <path class="art-robe" d="M36 54 q-8 8 -6 18 l9 4 q0 -12 4 -18 Z"/>
  <g class="blade--a"><path class="art-wood" d="M84 82 l6 -56 l6 0 l-2 56 Z"/>
  <circle class="art-glow" cx="92" cy="24" r="9"/><circle class="art-glowline" cx="92" cy="24" r="4"/></g>
  <g class="knight__head">
    <path class="art-robe" d="M44 20 q16 -12 32 0 q2 16 -2 28 q-14 6 -28 0 q-4 -12 -2 -28 Z"/>
    <path class="art-steel" d="M42 22 q20 -18 36 0 q-18 -8 -36 0 Z"/>
    <path class="art-glow" d="M54 36 l4 -3 l1 5 Z"/><path class="art-glow" d="M66 36 l-4 -3 l-1 5 Z"/>
    <path class="art-beard" d="M50 46 q10 16 20 0 q-2 12 -10 14 q-8 -2 -10 -14 Z"/>
  </g>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Ассасин: капюшон, шарф, два клинка (по мотивам LoL)           */
  /* ---------------------------------------------------------- */
  function assassinSvg() {
    return `
<svg class="critter__art" viewBox="0 0 130 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  ${legs('art-assassin')}
  <path class="art-assassin" d="M42 56 q20 -10 38 4 q6 24 2 42 q-22 8 -44 0 q-2 -26 4 -46 Z"/>
  <path class="art-scarf" d="M74 62 q16 6 22 18 q-10 -2 -16 -6 q6 10 4 18 q-10 -12 -16 -22 Z"/>
  <g class="blade--a"><path class="art-steel" d="M86 66 l30 -16 l3 6 l-30 18 Z"/><path class="art-hilt" d="M84 64 l8 6 l-4 6 l-8 -6 Z"/></g>
  <g class="blade--b"><path class="art-steel" d="M40 68 l-28 -14 l-3 6 l28 16 Z"/><path class="art-hilt" d="M40 66 l8 6 l-4 6 l-8 -6 Z"/></g>
  <path class="art-assassin" d="M48 24 q16 -12 30 0 q6 12 4 26 q-18 8 -34 0 q-4 -14 0 -26 Z"/>
  <path class="art-hood" d="M46 26 q18 -16 34 0 q-16 -6 -34 0 Z"/>
  <path class="art-visor" d="M52 38 h22 v5 h-22 Z"/>
  <g class="blink"><path class="art-glow" d="M55 39 h5 v3 h-5 Z"/><path class="art-glow" d="M67 39 h5 v3 h-5 Z"/></g>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Каменный голем: блоки, светящееся ядро                        */
  /* ---------------------------------------------------------- */
  function golemSvg() {
    return `
<svg class="critter__art" viewBox="0 0 140 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  <path class="art-stone" d="M40 100 h20 v22 h-20 Z"/><path class="art-stone" d="M72 100 h20 v22 h-20 Z"/>
  <path class="art-stone" d="M34 48 h60 v54 h-60 Z"/>
  <path class="art-stone" d="M42 60 h18 v16 h-18 Z"/><path class="art-stone" d="M68 62 h18 v14 h-18 Z"/>
  <circle class="art-glow" cx="64" cy="80" r="10"/><circle class="art-glowline" cx="64" cy="80" r="5"/>
  <path class="art-stone" d="M22 50 q-8 18 -2 34 l14 -4 q-4 -14 -2 -26 Z"/>
  <path class="art-stone" d="M106 50 q10 16 4 34 l-14 -6 q4 -14 2 -24 Z"/>
  <path class="art-stone" d="M44 16 h40 v30 h-40 Z"/>
  <path class="art-glowline" d="M52 30 h10 v5 h-10 Z"/><path class="art-glowline" d="M68 30 h10 v5 h-10 Z"/>
  <path class="art-stone" d="M46 12 h36 v6 h-36 Z"/>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Ледяной волк: четыре лапы, шерсть, светящиеся глаза           */
  /* ---------------------------------------------------------- */
  function wolfSvg() {
    return `
<svg class="critter__art" viewBox="0 0 150 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  ${beastLegs('art-wolf')}
  <path class="art-wolf" d="M38 70 q16 -12 44 -10 q26 2 34 14 q-6 18 -26 20 q-30 2 -50 -8 q-6 -10 -2 -16 Z"/>
  <path class="art-fur" d="M52 60 l6 -10 l6 10 Z"/><path class="art-fur" d="M68 58 l6 -11 l6 11 Z"/>
  <path class="art-wolf" d="M104 62 q10 -14 22 -8 l4 14 q-12 6 -24 4 Z"/>
  <path class="art-wolf" d="M108 52 l6 -12 l5 12 Z"/><path class="art-wolf" d="M120 50 l7 -10 l4 12 Z"/>
  <path class="art-jaw" d="M112 74 q12 2 16 -4 q-4 10 -14 10 q-4 -2 -2 -6 Z"/>
  <path class="art-tooth" d="M118 72 l3 5 l3 -5 Z"/>
  <g class="blink"><path class="art-glow" d="M114 62 l5 2 l-4 3 Z"/></g>
  <path class="art-wolf" d="M34 68 q-14 6 -20 18 q10 -2 14 -8 q-4 10 0 16 q6 -12 12 -18 Z"/>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Дрон-охотник: зависает, крутит винты, светит красным глазом   */
  /* ---------------------------------------------------------- */
  function droneSvg() {
    return `
<svg class="critter__art" viewBox="0 0 140 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <g class="smoke"><circle cx="34" cy="106" r="5"/><circle cx="24" cy="98" r="3.5"/></g>
  <g class="bob">
  <path class="art-metal" d="M48 44 h44 v26 h-44 Z"/>
  <path class="art-metal" d="M44 70 h52 v8 h-52 Z"/>
  <circle class="art-glow" cx="70" cy="58" r="6"/>
  <path class="art-metal" d="M44 48 l-18 -8 h-6 v6 l20 10 Z"/><path class="art-metal" d="M96 48 l18 -8 h6 v6 l-20 10 Z"/>
  <g class="wings--a"><path class="art-blade" d="M14 34 h34 v4 h-34 Z"/><path class="art-blade" d="M92 34 h34 v4 h-34 Z"/></g>
  <g class="wings--b"><path class="art-blade" d="M18 40 h26 v3 h-26 Z"/><path class="art-blade" d="M96 40 h26 v3 h-26 Z"/></g>
  <path class="art-metal" d="M50 78 l-6 14 h10 l6 -14 Z"/><path class="art-metal" d="M90 78 l6 14 h-10 l-6 -14 Z"/>
  <path class="art-glowline" d="M56 90 h28 v4 h-28 Z"/>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Призрак: полупрозрачный, без ног, с фонарём                  */
  /* ---------------------------------------------------------- */
  function ghostSvg() {
    return `
<svg class="critter__art" viewBox="0 0 120 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <g class="smoke"><circle cx="40" cy="116" r="6"/><circle cx="54" cy="122" r="4"/><circle cx="30" cy="108" r="3"/></g>
  <g class="bob">
  <path class="art-ghost" d="M40 44 q20 -18 40 0 q8 30 6 54 q-10 12 -22 6 q-10 10 -20 -2 q-6 -28 -4 -58 Z"/>
  <path class="art-ghost" d="M34 46 q-12 12 -8 26 l14 0 q-2 -14 0 -24 Z"/>
  <path class="art-ghost" d="M86 46 q12 12 8 26 l-14 0 q2 -14 0 -24 Z"/>
  <path class="art-ghost" d="M46 20 q14 -12 28 0 q4 14 0 24 q-14 6 -28 0 q-4 -10 0 -24 Z"/>
  <g class="blink"><path class="art-eye" d="M54 32 h6 v5 h-6 Z"/><path class="art-eye" d="M66 32 h6 v5 h-6 Z"/></g>
  <path class="art-eye" d="M58 44 q6 6 12 0 q-2 8 -6 8 q-4 0 -6 -8 Z"/>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Пират: треуголка, сабля, деревянная нога                     */
  /* ---------------------------------------------------------- */
  function pirateSvg() {
    return `
<svg class="critter__art" viewBox="0 0 130 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  <g class="legs--a"><path class="art-coat" d="M44 96 l-4 24 h12 l6 -24 Z"/><path class="art-wood" d="M74 98 l6 22 h-12 l-4 -22 Z"/></g>
  <g class="legs--b"><path class="art-coat" d="M44 96 l6 24 h-12 l-2 -24 Z"/><path class="art-wood" d="M74 98 l-6 22 h12 l2 -22 Z"/></g>
  <path class="art-coat" d="M38 54 q24 -12 46 0 q6 26 2 46 q-24 8 -50 0 q-4 -24 2 -46 Z"/>
  <path class="art-sash" d="M38 74 l50 -8 l2 8 l-50 10 Z"/>
  <g class="blade--a"><path class="art-steel" d="M86 62 q22 -14 34 -6 q-16 8 -28 16 Z"/>
  <path class="art-hilt" d="M84 60 l10 4 l-4 8 l-10 -4 Z"/></g>
  <path class="art-coat" d="M36 52 q-8 8 -6 20 l10 4 q0 -12 2 -20 Z"/>
  <path class="art-skin" d="M48 26 q16 -10 28 0 q4 14 0 26 q-14 6 -28 0 q-4 -14 0 -26 Z"/>
  <path class="art-hat" d="M38 26 q24 -16 48 0 q2 6 -4 6 q-20 -8 -40 0 q-6 0 -4 -6 Z"/>
  <path class="art-hat" d="M44 18 q16 -10 32 0 q-16 -2 -32 0 Z"/>
  <path class="art-beard" d="M50 44 q12 14 22 0 q-2 12 -10 14 q-8 -2 -12 -14 Z"/>
  <g class="blink"><path class="art-eye" d="M55 36 h5 v4 h-5 Z"/><path class="art-eye" d="M67 36 h5 v4 h-5 Z"/></g>
  <path class="art-visor" d="M62 33 h16 v7 h-16 Z"/><path class="art-visor" d="M62 33 l-8 -6 l0 6 Z"/>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Зомби: рваная куртка, вытянутые руки, шрам                 */
  /* ---------------------------------------------------------- */
  function zombieSvg() {
    return `
<svg class="critter__art" viewBox="0 0 130 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  ${dust()}
  <g class="bob">
  ${legs('art-zombie')}
  <path class="art-zombie" d="M40 54 q22 -12 42 0 q6 24 2 44 q-24 8 -46 0 q-4 -24 2 -44 Z"/>
  <path class="art-rot" d="M46 62 l10 6 l-8 6 Z"/><path class="art-rot" d="M74 74 l8 6 l-10 4 Z"/>
  <g class="knight__arm"><path class="art-zombie" d="M84 58 q16 2 26 -6 l2 10 q-14 8 -28 6 Z"/>
  <path class="art-skin" d="M110 48 l6 -2 l2 8 l-6 2 Z"/></g>
  <path class="art-skin" d="M46 26 q18 -10 32 0 q4 14 0 26 q-16 8 -32 0 q-6 -14 0 -26 Z"/>
  <path class="art-beard" d="M52 44 q12 8 20 0 q-2 10 -10 10 q-8 0 -10 -10 Z"/>
  <g class="blink"><path class="art-eye-white" d="M52 34 a5 5 0 1 0 0.2 0 Z"/><path class="art-eye-white" d="M70 34 a5 5 0 1 0 0.2 0 Z"/>
  <path class="art-eye" d="M53 35 a2 2 0 1 0 0.2 0 Z"/><path class="art-eye" d="M71 35 a2 2 0 1 0 0.2 0 Z"/></g>
  <path class="art-rot" d="M60 24 l14 4 l-2 4 l-13 -3 Z"/>
  </g>
</svg>`;
  }

  /* ---------------------------------------------------------- */
  /* Отряд: кто бегает по главному экрану                        */
  /* ---------------------------------------------------------- */
  const ROSTER = [
    { id: 'knight',   kind: 'hero',  svg: knightSvg,   name: 'Рыцарь',        line: '«Я его не звал!»',
      skin: { '--knight-armor': '#9db4c4', '--knight-steel': '#c9d8e4', '--knight-plume': '#e0574a', '--knight-cloak': '#3f6f8f', '--knight-shield': '#e0b356' } },
    { id: 'dragon',   kind: 'beast', svg: dragonSvg,   name: 'Дракоша',       line: '«Обед!.. то есть, привет»',
      skin: { '--dragon-red': '#d9553f', '--dragon-wing': '#ef6a52', '--dragon-belly': '#f2c98a' } },
    { id: 'engineer', kind: 'hero',  svg: engineerSvg, name: 'Космо-инженер', line: '«Резак заряжен, пошли»',
      skin: { '--rig': '#6f7d8c', '--plate': '#8a97a6', '--steel2': '#c2ccd8', '--glow': '#8ef0c8', '--glowline': '#57e0a6', '--visor2': '#1d2530' } },
    { id: 'necro',    kind: 'beast', svg: necroSvg,    name: 'Некроморф',     line: '«Ш-ш-ш...» (клинки раскрылись)',
      skin: { '--necro': '#7f8f74', '--bone': '#e6dcc0', '--blade': '#cfd8de', '--glow': '#f0d060' } },
    { id: 'cyber',    kind: 'hero',  svg: cyberSvg,    name: 'Кибер-самурай', line: '«Клинок дороже города»',
      skin: { '--cyber': '#3d4b6e', '--cloak': '#7a2c56', '--glowline': '#39e6d0', '--steel2': '#d7e3ff', '--visor2': '#242c44' } },
    { id: 'orc',      kind: 'hero',  svg: orcSvg,      name: 'Орк-воин',      line: '«За Орду!» (и за ужин)',
      skin: { '--orc': '#6f9c4a', '--hide': '#7a5a34', '--metal': '#a9b3bd', '--ear': '#6f9c4a' } },
    { id: 'mage',     kind: 'hero',  svg: mageSvg,     name: 'Тёмный маг',    line: '«Не мешай читать»',
      skin: { '--robe': '#4b3a78', '--wood': '#8a6a3c', '--glow': '#b98cff', '--glowline': '#e0c8ff', '--beard': '#e8e2d0', '--steel2': '#d7cff0' } },
    { id: 'assassin', kind: 'hero',  svg: assassinSvg, name: 'Ассасин',       line: '«Ты меня не видел»',
      skin: { '--assassin': '#2f3b48', '--hood': '#243040', '--scarf': '#b8434a', '--steel2': '#cfdae6', '--glow': '#8ef0c8', '--visor2': '#1b222b' } },
    { id: 'golem',    kind: 'beast', svg: golemSvg,    name: 'Каменный голем', line: '«...» (глухо гудит ядро)',
      skin: { '--stone': '#8d8b84', '--glow': '#ffb04c', '--glowline': '#ffd08a' } },
    { id: 'wolf',     kind: 'beast', svg: wolfSvg,     name: 'Ледяной волк',  line: '«Р-р-рф!»',
      skin: { '--wolf': '#8fb3d1', '--fur': '#bcd8ee', '--jaw': '#dbe9f6', '--glow': '#9fe8ff' } },
    { id: 'drone',    kind: 'beast', svg: droneSvg,    name: 'Дрон-охотник',  line: '«Цель найдена» (жужжит)',
      skin: { '--metal': '#98a4b2', '--blade': '#c3ced9', '--glow': '#ff5a4c', '--glowline': '#ff8a74' } },
    { id: 'ghost',    kind: 'beast', svg: ghostSvg,    name: 'Призрак',       line: '«Х-о-л-о-д-н-о...»',
      skin: { '--ghost': '#cfe3f2', '--eye': '#2a3a4a' } },
    { id: 'zombie',   kind: 'beast', svg: zombieSvg,   name: 'Зомби',         line: '«Мо-о-озг... ну или обед»',
      skin: { '--zombie': '#7f8f6a', '--rot': '#5d6b4c', '--skin': '#a8b894', '--beard': '#6d5a44' } },
    { id: 'pirate',   kind: 'hero',  svg: pirateSvg,   name: 'Пират',         line: '«Йо-хо-хо и бутылка»',
      skin: { '--coat': '#6b3f2e', '--hat': '#2f2a26', '--sash': '#b8434a', '--skin': '#e0b48c', '--beard': '#e6e0d2', '--wood': '#8a6a3c', '--steel2': '#cfdae6', '--visor2': '#1b222b' } }
  ];
  const ROLES = ROSTER.map(r => r.id);
  const byId = id => ROSTER.find(r => r.id === id) || null;

  /**
   * Пара для главного экрана: герой и погоня. Прошлые участники не повторяются,
   * поэтому каждый заход в меню показывает других персонажей. Принимает прошлую
   * пару и фигурами, и их метками.
   */
  function pickPair(previous) {
    const heroes = ROSTER.filter(r => r.kind === 'hero');
    const beasts = ROSTER.filter(r => r.kind === 'beast');
    const before = (previous || []).map(item => (item && item.id) || item).filter(Boolean);
    const pickFrom = list => {
      const fresh = list.filter(r => !before.includes(r.id));
      const pool = fresh.length ? fresh : list;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    return [pickFrom(heroes), pickFrom(beasts)];
  }

  function mount(container, opts) {
    if (!container) return null;
    opts = opts || {};
    if (container.dataset.crittersReady === '1' && container.__dtCritters) {
      return container.__dtCritters;               // уже смонтировано: меняем пару, не пересобирая
    }

    container.dataset.crittersReady = '1';
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const timers = [];
    const state = { active: false, reduced, els: {}, container, pair: null };

    const rnd = (min, max) => min + Math.random() * (max - min);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    const clearAll = () => { while (timers.length) clearTimeout(timers.pop()); };

    const PARK = {
      right: 'translateX(-140px)',
      left: 'translateX(calc(100vw + 40px)) scaleX(-1)'
    };

    function parkEl(el, dir) {
      el.classList.remove('is-running', 'is-hit');
      el.style.animation = 'none';
      el.style.transform = PARK[dir];
    }

    function run(el, dir, duration, delay) {
      parkEl(el, dir === 'right' ? 'left' : 'right');
      el.classList.add('is-running');
      el.style.animation =
        (dir === 'right' ? 'critter-run-right ' : 'critter-run-left ') +
        duration.toFixed(2) + 's linear ' + delay.toFixed(2) + 's 1 both';
      el.style.transform = dir === 'right'
        ? 'translateX(calc(100vw + 40px))'
        : 'translateX(-140px) scaleX(-1)';
    }

    /** Смена фигур: рисуем новую пару и раздаём роли. */
    function applyPair(pair) {
      state.pair = pair;
      clearAll();
      container.innerHTML = pair.map(entry => {
        const skin = Object.keys(entry.skin || {})
          .map(k => k + ':' + entry.skin[k]).join(';');
        return '<div class="critter critter--' + entry.id + '" data-role="' + entry.id + '" style="' + skin + '">' +
          entry.svg() + '</div>';
      }).join('');
      state.els = {};
      pair.forEach(entry => {
        const el = container.querySelector('[data-role="' + entry.id + '"]');
        state.els[entry.id] = el;
        el.addEventListener('click', () => hop(el));
      });
      if (reduced) Object.keys(state.els).forEach(id => state.els[id].classList.add('critter--still'));
      else Object.keys(state.els).forEach(id => parkEl(state.els[id], 'left'));
    }

    function tick() {
      if (!state.active || !state.pair) return;
      const [hero, beast] = state.pair;
      const dir = Math.random() < 0.5 ? 'right' : 'left';
      const beastFirst = Math.random() < 0.24;          // иногда первым бежит монстр
      const lead = beastFirst ? beast : hero;
      const chase = beastFirst ? hero : beast;
      const duration = rnd(3.4, 5.4);
      const gap = rnd(0.6, 1.3);                         // преследователь держится на хвосте
      run(state.els[lead.id], dir, duration, 0);
      run(state.els[chase.id], dir, duration * rnd(1.08, 1.22), gap);
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
      Object.keys(state.els).forEach(id => parkEl(state.els[id], 'left'));
    }

    function hop(el) {
      el.classList.remove('is-hit');
      void el.offsetWidth;
      el.classList.add('is-hit');
      later(() => el.classList.remove('is-hit'), 900);
      const info = byId(el.dataset.role);
      if (typeof opts.onTap === 'function') opts.onTap(el.dataset.role, info);
    }

    applyPair(pickPair(null));

    const api = {
      start, stop, els: state.els, roleNames: ROLES, reduced, pickPair, applyPair,
      get pair() { return (state.pair || []).map(r => r.id); },
      get names() { return (state.pair || []).map(r => r.name); },
      /** Новая пара на каждый заход в меню: игрок видит других персонажей. */
      rotate() { applyPair(pickPair(state.pair ? state.pair.map(r => r.id) : null)); },
      destroy: () => { stop(); container.innerHTML = ''; container.dataset.crittersReady = ''; container.__dtCritters = null; }
    };
    container.__dtCritters = api;
    return api;
  }

  return {
    mount, knightSvg, dragonSvg, ROLES, ROSTER, roster: () => ROSTER.slice(),
    svgFor: id => { const r = byId(id); return r ? r.svg() : ''; },
    infoFor: id => byId(id), pickPair
  };
});
