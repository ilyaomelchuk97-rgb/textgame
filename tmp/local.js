// Как выглядит ход встроенного мастера: связность, имена, места, варианты
const E = require('../src/engine.js');
const g = E.createGame({
  scenarioId: 'mygame', heroName: 'Райн', classId: 'wanderer', raceId: 'human', originId: 'soldier',
  worldConfig: { gameName: 'Стеклянные Степи Немо', genre: 'постапокалипсис', place: 'стеклянная пустошь', goal: 'найти пропавший караван', danger: 'normal' }
});
const open = E.offlineOpening(g);
g.intro = { world: open.world, backstory: open.backstory, plan: open.plan };
g.plan = open.plan;
console.log('ВСТУПЛЕНИЕ:', open.scene.slice(0, 220));
const outcomes = ['success', 'success', 'fail', 'crit', 'fail', 'success'];
outcomes.forEach((out, i) => {
  const beat = E.storyBeat(g.scenarioId, g.offlineBeat || 0);
  const act = (beat.options && beat.options[0]) || { text: 'Идти по следу', stat: 'per', diff: 'medium' };
  const turn = E.offlineTurn(g, { text: act.t, stat: act.stat, dc: 11 }, { outcome: out, roll: 12 });
  E.rememberTurn(g, turn, { text: act.t });
  E.pushLog(g, { kind: 'turn', text: turn.scene });
  console.log('\nХОД ' + (i + 1) + ' (' + out + ') | глава:', turn.chapter || '—', '| место:', turn.place || '—', '| рядом:', turn.npc || '—');
  console.log('  ' + turn.scene.replace(/\s+/g, ' ').slice(0, 320));
  console.log('  варианты:', turn.options.map(o => o.text + ' [' + o.stat + '/' + o.difficulty + ']').join(' · '));
  console.log('  память: место=' + E.memoryOf(g).place + ', знакомых=' + E.memoryOf(g).npcs.length + ', фактов=' + E.memoryOf(g).facts.length);
});
