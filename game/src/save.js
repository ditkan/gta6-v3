// save.js — persistence for Port Azura: Heat. One localStorage record holds the
// run: cash, story progress, found briefcases, the player's vitals and position,
// and lifetime stats. Loading is defensive: a corrupt or older save is ignored
// rather than crashing the game.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const KEY = 'portAzuraHeatSaveV1';

  function storage() {
    try {
      return window.localStorage || null;
    } catch (err) {
      return null;
    }
  }

  function exists() {
    const s = storage();
    if (!s) return false;
    try {
      return s.getItem(KEY) != null;
    } catch (err) {
      return false;
    }
  }

  function load() {
    const s = storage();
    if (!s) return null;
    try {
      const raw = s.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (typeof data.cash !== 'number' || typeof data.storyIndex !== 'number') return null;
      if (!Array.isArray(data.briefcases)) data.briefcases = [];
      return data;
    } catch (err) {
      return null;
    }
  }

  function store(data) {
    const s = storage();
    if (!s) return false;
    try {
      s.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      return false;
    }
  }

  function clear() {
    const s = storage();
    if (!s) return;
    try {
      s.removeItem(KEY);
    } catch (err) {
      /* nothing to clear */
    }
  }

  // Snapshot the parts of the live game state that survive a reload.
  function snapshot(G) {
    return {
      cash: G.player.cash,
      storyIndex: G.storyIndex,
      briefcases: Array.from(G.foundCases),
      health: G.player.health,
      armour: G.player.armour,
      hasPistol: G.player.hasPistol,
      ammo: G.player.ammo,
      reserve: G.player.reserve,
      x: Math.round(G.player.x),
      y: Math.round(G.player.y),
      timeOfDay: G.timeOfDay,
      stats: G.stats,
    };
  }

  function apply(G, data) {
    G.player.cash = data.cash;
    G.storyIndex = data.storyIndex;
    G.foundCases = new Set(data.briefcases);
    G.player.health = typeof data.health === 'number' ? data.health : 100;
    G.player.armour = typeof data.armour === 'number' ? data.armour : 0;
    G.player.hasPistol = !!data.hasPistol;
    G.player.ammo = typeof data.ammo === 'number' ? data.ammo : 0;
    G.player.reserve = typeof data.reserve === 'number' ? data.reserve : 0;
    if (typeof data.x === 'number' && typeof data.y === 'number') {
      G.player.x = data.x;
      G.player.y = data.y;
    }
    if (typeof data.timeOfDay === 'number') G.timeOfDay = data.timeOfDay;
    if (data.stats && typeof data.stats === 'object') G.stats = data.stats;
  }

  PA.Save = { exists, load, store, clear, snapshot, apply };
})();
