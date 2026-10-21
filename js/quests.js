// quests.js — goals. Each quest has an id, a title, a line of text, and goal(game) returning { cur, max }.
// A quest is done when cur >= max; the game remembers done quests in the save. Edit or add freely:
// anything on `game` is fair game, most usefully game.player.stats (see game.js) and game.player.inv.
(function (global) {
  'use strict';
  const total = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

  global.QUESTS = [
    { id: 'hold', title: 'Something to hold', text: 'Find a weapon better than your hands and take it up.',
      goal: g => ({ cur: g.player.weapon && global.ITEMS[g.player.weapon] && global.ITEMS[g.player.weapon].dmg >= 2 ? 1 : 0, max: 1 }) },
    { id: 'search10', title: 'Go through ten places', text: 'Fridges, shelves, lockers, cars. Ten of them.',
      goal: g => ({ cur: g.player.stats.searched, max: 10 }) },
    { id: 'five', title: 'Put five of them down', text: 'Any way you can.',
      goal: g => ({ cur: total(g.player.stats.kills), max: 5 }) },
    { id: 'morning', title: 'See a morning', text: 'Live through a night. Shut a door behind you.',
      goal: g => ({ cur: g.player.stats.nights, max: 1 }) },
    { id: 'paces', title: 'A thousand paces', text: 'Keep moving.',
      goal: g => ({ cur: g.player.stats.distance, max: 1000 }) },
    { id: 'sanctuary', title: 'Sanctuary', text: 'Get inside a church.',
      goal: g => { const b = g.world.buildingAt(g.player.x, g.player.y); return { cur: b && b.lm === 'church' ? 1 : 0, max: 1 }; } },
    { id: 'brute', title: 'The big one', text: 'Put down a brute.',
      goal: g => ({ cur: g.player.stats.kills.brute || 0, max: 1 }) },
    // ---- placeholders: fill these in ----
    { id: 'placeholder1', title: 'Placeholder quest one', text: 'Not written yet.', goal: () => ({ cur: 0, max: 1 }) },
    { id: 'placeholder2', title: 'Placeholder quest two', text: 'Not written yet.', goal: () => ({ cur: 0, max: 1 }) },
    { id: 'placeholder3', title: 'Placeholder quest three', text: 'Not written yet.', goal: () => ({ cur: 0, max: 1 }) },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
