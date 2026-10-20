// game.js — turn engine: player, items, loot, zombies, FOV, combat, save/load.
(function (global) {
  'use strict';
  const { hash2, mulberry32 } = global.WorldUtil;
  const T = global.T, CH = global.CH;

  const TURN_SECONDS = 6;           // one step ≈ one cautious metre (hunger, thirst and weather still run per turn)
  const START_HOUR = 8;             // unused now that the clock follows the real local time
  const INV_MAX = 16;

  const ITEMS = {
    beans:      { name: 'Can of beans',     cat: 'food',  hunger: 35 },
    soup:       { name: 'Can of soup',      cat: 'food',  hunger: 25, thirst: 10 },
    chips:      { name: 'Bag of chips',     cat: 'food',  hunger: 12, thirst: -4 },
    granola:    { name: 'Granola bar',      cat: 'food',  hunger: 15 },
    jerky:      { name: 'Beef jerky',       cat: 'food',  hunger: 20, thirst: -5 },
    pb:         { name: 'Peanut butter',    cat: 'food',  hunger: 40, thirst: -6 },
    crackers:   { name: 'Box of crackers',  cat: 'food',  hunger: 18, thirst: -3 },
    poutine:    { name: 'Cold poutine',     cat: 'food',  hunger: 30 },
    timbits:    { name: 'Box of Timbits',   cat: 'food',  hunger: 22 },
    water:      { name: 'Bottle of water',  cat: 'drink', thirst: 40 },
    soda:       { name: 'Can of soda',      cat: 'drink', thirst: 22, hunger: 5 },
    juice:      { name: 'Juice box',        cat: 'drink', thirst: 25, hunger: 4 },
    energy:     { name: 'Energy drink',     cat: 'drink', thirst: 18 },
    coffee:     { name: 'Cold coffee',      cat: 'drink', thirst: 15 },
    bandage:    { name: 'Bandage',          cat: 'med',   heal: 15 },
    painkiller: { name: 'Painkillers',      cat: 'med',   heal: 10 },
    firstaid:   { name: 'First aid kit',    cat: 'med',   heal: 45 },
    knife:      { name: 'Kitchen knife',    cat: 'weapon', dmg: 2, hit: 0.85 },
    bat:        { name: 'Baseball bat',     cat: 'weapon', dmg: 3, hit: 0.8 },
    hockey:     { name: 'Hockey stick',     cat: 'weapon', dmg: 2, hit: 0.85 },
    hammer:     { name: 'Claw hammer',      cat: 'weapon', dmg: 2, hit: 0.8 },
    crowbar:    { name: 'Crowbar',          cat: 'weapon', dmg: 3, hit: 0.8 },
    axe:        { name: 'Fire axe',         cat: 'weapon', dmg: 5, hit: 0.7 },
    machete:    { name: 'Machete',          cat: 'weapon', dmg: 4, hit: 0.8 },
    shovel:     { name: 'Shovel',           cat: 'weapon', dmg: 3, hit: 0.7 },
    pipe:       { name: 'Steel pipe',       cat: 'weapon', dmg: 3, hit: 0.75 },
    // Ranged weapons: fire with F + direction. range in tiles; noise is how far a shot alerts zombies.
    bow:        { name: 'Compound bow',     cat: 'weapon', ranged: true, dmg: 3, hit: 0.75, range: 8,  ammo: 'arrow',     noise: 3,  melee: 1 },
    pistol:     { name: 'Pistol',           cat: 'weapon', ranged: true, dmg: 4, hit: 0.75, range: 10, ammo: 'ammo9',     noise: 14, melee: 1 },
    shotgun:    { name: 'Shotgun',          cat: 'weapon', ranged: true, dmg: 8, hit: 0.85, range: 6,  ammo: 'shell',     noise: 16, melee: 2 },
    rifle:      { name: 'Hunting rifle',    cat: 'weapon', ranged: true, dmg: 7, hit: 0.8,  range: 16, ammo: 'rifleammo', noise: 18, melee: 2, falloff: 0.01 },
    arrow:      { name: 'Arrows',           cat: 'ammo', short: 'arrows' },
    ammo9:      { name: '9mm rounds',       cat: 'ammo', short: '9mm' },
    shell:      { name: 'Shotgun shells',   cat: 'ammo', short: 'shells' },
    rifleammo:  { name: 'Rifle rounds',     cat: 'ammo', short: 'rifle rds' },
    flashlight: { name: 'Flashlight',       cat: 'tool',  note: 'Dead batteries.' },
    lighter:    { name: 'Lighter',          cat: 'tool',  note: 'Useful later.' },
    ducttape:   { name: 'Duct tape',        cat: 'tool',  note: 'Fixes everything, eventually.' },
    gascan:     { name: 'Jerry can',        cat: 'tool',  note: 'For a vehicle, someday.' },
    rope:       { name: 'Rope',             cat: 'tool',  note: 'Useful later.' },
  };
  const FISTS = { name: 'Fists', cat: 'weapon', dmg: 1, hit: 0.75 };

  // Character classes: starting kit plus one or two perks. Perk keys are read by the rules below.
  const CLASSES = {
    soldier:     { name: 'Soldier',        hp: 110, weapon: 'pistol', items: ['pistol', 'knife', 'bandage', 'jerky'], ammo: { ammo9: 14 },
                   perks: { melee: 1, ranged: 0.1 }, desc: 'Reservist out of Petawawa. A pistol and fourteen rounds. You hit harder and you shoot straighter. 110 body.' },
    police:      { name: 'Police Officer', hp: 100, weapon: 'pistol', items: ['pistol', 'bat', 'bandage', 'coffee'], ammo: { ammo9: 10 },
                   perks: { ranged: 0.15, noiseDamp: 3 }, desc: 'Off-duty constable. Pistol and baton. You shoot straighter than most and you dont waste the noise.' },
    doctor:      { name: 'Doctor',         hp: 90,  weapon: 'knife',  items: ['knife', 'firstaid', 'firstaid', 'painkiller', 'bandage', 'bandage'], ammo: {},
                   perks: { medMult: 1.5, regen: 2 }, desc: 'Emergency physician. Two kits. What you bind heals half again as well and twice as fast. 90 body.' },
    engineer:    { name: 'Engineer',       hp: 100, weapon: 'crowbar', items: ['crowbar', 'ducttape', 'rope', 'granola', 'water'], ammo: {},
                   perks: { loot: 1 }, desc: 'Civil engineer. Crowbar and tape. You know where people keep things. One thing more from every drawer.' },
    firefighter: { name: 'Firefighter',    hp: 130, weapon: 'axe',    items: ['axe', 'firstaid', 'water', 'water'], ammo: {},
                   perks: { hpMax: 130 }, desc: 'Ottawa Fire. An axe and 130 body. You hit hard and you take it.' },
    hunter:      { name: 'Hunter',         hp: 100, weapon: 'rifle',  items: ['rifle', 'knife', 'jerky', 'jerky', 'water'], ammo: { rifleammo: 10, arrow: 6 },
                   perks: { stealth: 3, ranged: 0.05 }, desc: 'Valley deer hunter. A rifle, ten rounds, six arrows against the day you find a bow. They see you three paces later than they should.' },
    chef:        { name: 'Chef',           hp: 100, weapon: 'knife',  items: ['knife', 'beans', 'soup', 'pb', 'water', 'coffee'], ammo: {},
                   perks: { foodMult: 1.5 }, desc: 'Line cook off Elgin Street. A big knife and a full pantry. You make food go half again as far.' },
  };

  // Loot tables: [itemId, weight]; "nothing" is implicit via emptyChance.
  const LOOT = {
    fridge:   { empty: 0.25, n: [1, 3], t: [['water', 5], ['soda', 4], ['juice', 3], ['pb', 1], ['poutine', 1], ['coffee', 2]] },
    freezer:  { empty: 0.3,  n: [1, 3], t: [['poutine', 3], ['jerky', 1], ['timbits', 2], ['soup', 1]] },
    cupboard: { empty: 0.3,  n: [1, 3], t: [['beans', 4], ['soup', 4], ['crackers', 3], ['pb', 2], ['granola', 3], ['chips', 3], ['painkiller', 1], ['lighter', 1]] },
    closet:   { empty: 0.4,  n: [1, 2], t: [['bat', 2], ['hockey', 3], ['rope', 1], ['bandage', 2], ['ducttape', 1], ['bow', 1], ['arrow', 1, 3, 8], ['rifle', 1], ['rifleammo', 1, 2, 6]] },
    dresser:  { empty: 0.5,  n: [1, 1], t: [['painkiller', 2], ['bandage', 2], ['granola', 1]] },
    shelf:    { empty: 0.2,  n: [1, 4], t: [['beans', 4], ['soup', 3], ['chips', 4], ['crackers', 3], ['granola', 4], ['water', 4], ['soda', 3], ['jerky', 2], ['pb', 2], ['juice', 2], ['energy', 2]] },
    cabinet:  { empty: 0.25, n: [1, 3], t: [['bandage', 5], ['painkiller', 4], ['firstaid', 2]] },
    desk:     { empty: 0.5,  n: [1, 2], t: [['granola', 2], ['coffee', 2], ['painkiller', 1], ['energy', 1]] },
    toolbox:  { empty: 0.2,  n: [1, 2], t: [['hammer', 4], ['crowbar', 3], ['pipe', 2], ['ducttape', 3], ['knife', 1]] },
    crate:    { empty: 0.4,  n: [1, 2], t: [['pipe', 3], ['shovel', 2], ['rope', 2], ['gascan', 2], ['axe', 1], ['ducttape', 1], ['rifleammo', 1, 3, 6]] },
    locker:   { empty: 0.35, n: [1, 2], t: [['machete', 2], ['axe', 2], ['bat', 2], ['firstaid', 2], ['crowbar', 1], ['pistol', 2], ['shotgun', 1], ['ammo9', 3, 6, 12], ['shell', 2, 4, 8]] },
    car:      { empty: 0.5,  n: [1, 2], t: [['water', 2], ['soda', 2], ['chips', 2], ['painkiller', 1], ['gascan', 1], ['bandage', 1], ['ammo9', 1, 3, 6], ['granola', 2], ['coffee', 1]] },
    wreck:    { empty: 0.85, n: [1, 1], t: [['gascan', 2], ['pipe', 2], ['ducttape', 1]] },
  };
  // Use-class tweaks: weapons shops give weapons from shelves, pharmacies give meds from shelves, etc.
  const USE_SHELF = {
    weapons: [['machete', 2], ['axe', 1], ['bat', 2], ['knife', 2], ['bow', 2], ['arrow', 4, 5, 12], ['rifle', 2], ['rifleammo', 3, 4, 10], ['shotgun', 1], ['shell', 2, 4, 8], ['pistol', 1], ['ammo9', 2, 6, 12]],
    medical: [['bandage', 5], ['painkiller', 4], ['firstaid', 3]],
    tools:   [['hammer', 3], ['crowbar', 3], ['pipe', 2], ['shovel', 2], ['ducttape', 3], ['gascan', 2], ['rope', 2], ['axe', 1]],
    fuel:    [['chips', 4], ['soda', 4], ['water', 3], ['jerky', 3], ['energy', 3], ['gascan', 2], ['lighter', 2], ['coffee', 2]],
  };

  const CONTAINER_NAME = { fridge: 'fridge', freezer: 'freezer', cupboard: 'cupboard', closet: 'closet', dresser: 'dresser', shelf: 'shelf',
    cabinet: 'cabinet', desk: 'desk', toolbox: 'toolbox', crate: 'crate', locker: 'locker', car: 'abandoned car', wreck: 'burnt-out car' };

  const DOOR_HP = 10;          // pounding turns (at 70% per zombie per turn) before a door gives way
  const BARRIER_HP = { [T.DOOR]: DOOR_HP, [T.WINDOW]: 3, [T.WALL]: 60 };
  const HORDE_MIN_GAP = 500;   // turns between hordes at minimum
  const HORDE_CHANCE = 1 / 700; // per turn, once the gap has passed
  const DIRS = { 0: [0, 0], 1: [-1, 1], 2: [0, 1], 3: [1, 1], 4: [-1, 0], 6: [1, 0], 7: [-1, -1], 8: [0, -1], 9: [1, -1] };

  class Game {
    constructor(place, seed, world) {
      this.place = place;
      this.seed = seed >>> 0;
      this.world = world || new global.World(place, this.seed);
      this.turn = 0;
      this.msgs = [];
      this.zombies = [];
      this.zmap = new Map();
      this.nextId = 1;
      this.dead = false;
      this.rng = mulberry32((this.seed ^ 0xA5A5A5A5) >>> 0);
      this.player = { x: 0, y: 0, hp: 100, hpMax: 100, hunger: 100, thirst: 100, inv: [], ammo: {}, weapon: null, kills: 0, looted: 0, cls: null, avatar: null };
      this.lastShot = null;
      this.doors = new Map(); // 'x,y' -> { t: tile state, hp } for doors/windows/walls that changed from their generated state
      this.lastHorde = 0;
      this.weather = { k: 'clear', until: 0, live: false };
      this.snow = 0;
      this.startedAt = Date.now();
      this.live = null; // last live weather reading, if any
      this.sunCache = null;
      this.fov = { r: 0, x: 0, y: 0, data: null };
      this.onChange = null;
    }

    // ---- setup ---------------------------------------------------------------
    start(clsId, avatar) {
      const cls = CLASSES[clsId] || null;
      this.player.avatar = Object.assign({ outfit: clsId && CLASSES[clsId] ? clsId : 'civ' }, avatar || {});
      if (cls) {
        const pl = this.player;
        pl.cls = clsId; pl.hpMax = cls.hp; pl.hp = cls.hp;
        pl.inv = cls.items.slice(); pl.ammo = Object.assign({}, cls.ammo); pl.weapon = cls.weapon;
      }
      const p = this.findStart();
      this.player.x = p[0]; this.player.y = p[1];
      this.ensureSpawns();
      this.computeFov();
      this.log('You wake in ' + this.place.name.split(',')[0] + '. Grey light. Nothing moves. You were ' + (cls ? 'a ' + cls.name.toLowerCase() : 'somebody') + ', once.');
      this.log('Find food. Find water. Something to hold. Press ? if you need to know more.');
    }

    findStart() {
      // Random street somewhere in the mapped area: a road tile whose chunk has several buildings.
      const W = this.place.w, H = this.place.h, mx = Math.floor(W * 0.1), my = Math.floor(H * 0.1);
      for (let tries = 0; tries < 4000; tries++) {
        const x = mx + Math.floor(this.rng() * (W - 2 * mx)), y = my + Math.floor(this.rng() * (H - 2 * my));
        if (this.world.tileAt(x, y) !== T.ROAD) continue;
        const c = this.world.getChunk(Math.floor(x / CH), Math.floor(y / CH));
        if (!c.blds) { const s = new Set(); for (let i = 0; i < c.bid.length; i += 3) if (c.bid[i] >= 0) s.add(c.bid[i]); c.blds = s.size; }
        if (c.blds >= 4) return [x, y];
      }
      // Fallback: nearest qualifying road to the centre.
      const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
      let best = null, bd = Infinity;
      for (let r = 0; r < 600 && !best; r += 48) {
        for (let dy = -r; dy <= r; dy += 6) for (let dx = -r; dx <= r; dx += 6) {
          const x = cx + dx, y = cy + dy;
          if (this.world.tileAt(x, y) !== T.ROAD) continue;
          const c = this.world.getChunk(Math.floor(x / CH), Math.floor(y / CH));
          if (!c.blds) { const s = new Set(); for (let i = 0; i < c.bid.length; i += 3) if (c.bid[i] >= 0) s.add(c.bid[i]); c.blds = s.size; }
          if (c.blds < 4) continue;
          const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [x, y]; }
        }
      }
      if (best) return best;
      for (let r = 0; r < 2000; r++) {
        const x = cx + Math.floor(this.rng() * 2 * r) - r, y = cy + Math.floor(this.rng() * 2 * r) - r;
        if (this.world.passable(x, y) && this.world.tileAt(x, y) !== T.FLOOR) return [x, y];
      }
      return [cx, cy];
    }

    // Spawn zombies in chunks around the player the first time they come near.
    ensureSpawns() {
      const pcx = Math.floor(this.player.x / CH), pcy = Math.floor(this.player.y / CH);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const c = this.world.getChunk(pcx + ox, pcy + oy);
        if (c.spawned) continue;
        c.spawned = true;
        this.spawnChunk(c);
      }
    }

    spawnChunk(c) {
      const rng = mulberry32(hash2(this.seed + 99, c.cx, c.cy) * 1e9);
      const blds = new Set(); let roadTiles = 0;
      for (let i = 0; i < CH * CH; i++) { if (c.bid[i] >= 0) blds.add(c.bid[i]); if (c.tiles[i] === T.ROAD) roadTiles++; }
      let n = Math.round(blds.size * 0.22 + roadTiles / 500 + rng() * 2);
      if (!this.world.inData(c.x0 + CH / 2, c.y0 + CH / 2)) n = rng() < 0.3 ? 1 : 0; // wilderness is quiet
      n = Math.min(n, 14);
      const startSafe = this.turn === 0;
      for (let k = 0; k < n * 4 && n > 0; k++) {
        const x = c.x0 + Math.floor(rng() * CH), y = c.y0 + Math.floor(rng() * CH);
        const t = c.tiles[(y - c.y0) * CH + (x - c.x0)];
        if (t === T.FLOOR || !this.world.passable(x, y) || this.zmap.has(x + ',' + y)) continue;
        if (startSafe && Math.abs(x - this.player.x) + Math.abs(y - this.player.y) < 14) continue;
        this.addZombie(x, y, rng);
        n--;
      }
      // Some buildings have a zombie inside.
      for (const b of blds) {
        if (rng() > 0.18) continue;
        const spots = [];
        for (let i = 0; i < CH * CH; i++) if (c.bid[i] === b && c.tiles[i] === T.FLOOR) spots.push(i);
        if (!spots.length) continue;
        const i = spots[Math.floor(rng() * spots.length)];
        const x = c.x0 + (i % CH), y = c.y0 + Math.floor(i / CH);
        if (!this.zmap.has(x + ',' + y)) this.addZombie(x, y, rng);
      }
    }

    addZombie(x, y, rng, hp) {
      const z = { id: this.nextId++, x, y, hp: hp || (3 + Math.floor((rng || this.rng)() * 3)), alert: false, tx: 0, ty: 0, ttl: 0 };
      this.zombies.push(z); this.zmap.set(x + ',' + y, z);
      return z;
    }

    // ---- helpers ---------------------------------------------------------------
    perk(key, dflt) { const c = CLASSES[this.player.cls]; const v = c && c.perks[key]; return v === undefined ? dflt : v; }
    className() { const c = CLASSES[this.player.cls]; return c ? c.name : 'Survivor'; }
    log(s) { this.msgs.push({ t: this.turn, s }); if (this.msgs.length > 60) this.msgs.shift(); }
    // The game clock is the player's real local clock. Sunrise and sunset come from the town's latitude and today's date.
    hour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
    day() { return Math.floor((Date.now() - (this.startedAt || Date.now())) / 86400000) + 1; }
    sun() {
      const key = new Date().toDateString();
      if (this.sunCache && this.sunCache.key === key) return this.sunCache;
      const [lat, lon] = this.place.center || [45.4, -75.7];
      const now = new Date();
      const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
      const rad = Math.PI / 180;
      const decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + doy) / 365);
      const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
      let rise, set;
      if (cosH <= -1) { rise = 0; set = 24; } else if (cosH >= 1) { rise = 12; set = 12; }
      else {
        const H = Math.acos(cosH) / rad / 15;
        const B = 2 * Math.PI * (doy - 81) / 365;
        const eot = (9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)) / 60; // hours
        const tzOffset = -now.getTimezoneOffset() / 60;
        const solarNoon = 12 - lon / 15 + tzOffset - eot;
        rise = solarNoon - H; set = solarNoon + H;
      }
      this.sunCache = { key, rise, set };
      return this.sunCache;
    }
    // 0 by day, 1 at night, easing through dusk and dawn.
    nightness() {
      const h = this.hour(), { rise, set } = this.sun();
      if (h >= rise + 0.5 && h <= set - 0.3) return 0;
      if (h > set - 0.3 && h < set + 1.4) return (h - (set - 0.3)) / 1.7;
      if (h > rise - 1.2 && h < rise + 0.5) return ((rise + 0.5) - h) / 1.7;
      return 1;
    }
    isNight() { return this.nightness() >= 0.6; }
    phase() {
      const h = this.hour(), { rise, set } = this.sun();
      if (h >= rise - 1 && h < rise + 0.5) return 'dawn';
      if (h >= rise + 0.5 && h < 11) return 'morning';
      if (h >= 11 && h < 14) return 'midday';
      if (h >= 14 && h < set - 1.5) return 'afternoon';
      if (h >= set - 1.5 && h < set - 0.3) return 'evening';
      if (h >= set - 0.3 && h < set + 0.8) return 'dusk';
      return 'night';
    }
    hasItem(id) { return this.player.inv.includes(id); }
    weapon() { return this.player.weapon ? ITEMS[this.player.weapon] : FISTS; }
    viewRadius() { return 13; } // same sight range day and night; unexplored areas are still revealed only within it
    zombieAt(x, y) { return this.zmap.get(x + ',' + y) || null; }

    moveZombie(z, x, y) { this.zmap.delete(z.x + ',' + z.y); z.x = x; z.y = y; this.zmap.set(x + ',' + y, z); }

    los(x0, y0, x1, y1) {
      // Bresenham; returns true if no opaque tile strictly between the endpoints.
      let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
      let x = x0, y = y0;
      for (;;) {
        if (x === x1 && y === y1) return true;
        if (!(x === x0 && y === y0) && this.world.opaque(x, y)) return false;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
      }
    }

    computeFov() {
      const r = this.viewRadius(), px = this.player.x, py = this.player.y, n = 2 * r + 1;
      const data = new Uint8Array(n * n);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r) continue;
        const x = px + dx, y = py + dy;
        if (this.los(px, py, x, y)) { data[(dy + r) * n + (dx + r)] = 1; this.world.markSeen(x, y); }
      }
      this.fov = { r, x: px, y: py, data };
    }
    visible(x, y) {
      const f = this.fov, dx = x - f.x, dy = y - f.y;
      if (Math.abs(dx) > f.r || Math.abs(dy) > f.r) return false;
      return f.data[(dy + f.r) * (2 * f.r + 1) + (dx + f.r)] === 1;
    }

    // ---- doors -----------------------------------------------------------------
    isDoor(t) { return t === T.DOOR || t === T.DOOR_OPEN || t === T.DOOR_BROKEN; }
    setDoor(x, y, t, hp) {
      const k = x + ',' + y, cur = this.doors.get(k) || {};
      this.world.setTile(x, y, t);
      this.doors.set(k, { t, hp: hp !== undefined ? hp : (cur.hp !== undefined ? cur.hp : (BARRIER_HP[t] || DOOR_HP)) });
    }
    doorHp(x, y) {
      const d = this.doors.get(x + ',' + y);
      if (d && d.hp !== undefined) return d.hp;
      return BARRIER_HP[this.world.tileAt(x, y)] || DOOR_HP;
    }
    closeDoor(dx, dy) {
      const x = this.player.x + dx, y = this.player.y + dy, t = this.world.tileAt(x, y);
      if (t === T.DOOR) { this.log('Its shut.'); return false; }
      if (t === T.DOOR_BROKEN) { this.log('Its in splinters. Nothing left to shut.'); return false; }
      if (t !== T.DOOR_OPEN) { this.log('No door.'); return false; }
      if (this.zombieAt(x, y)) { this.log('One of them is in the doorway.'); return false; }
      this.setDoor(x, y, T.DOOR);
      this.log('You pull the door to behind you.');
      return true;
    }
    // A zombie pounds on the barrier (closed door, window or wall) at (x,y). Returns true (its turn is spent).
    bashDoor(z, x, y) {
      const p = this.player, near = Math.max(Math.abs(p.x - x), Math.abs(p.y - y));
      const t = this.world.tileAt(x, y);
      if (t !== T.DOOR && t !== T.WINDOW && t !== T.WALL) return false;
      this.noise(x, y, t === T.WALL ? 4 : 5);
      const hitChance = t === T.WALL ? 0.5 : 0.7;
      if (this.rng() < hitChance) {
        const hp = this.doorHp(x, y) - 1;
        if (hp <= 0) {
          if (t === T.DOOR) { this.setDoor(x, y, T.DOOR_BROKEN, 0); if (near <= 14) this.log(near <= 6 ? 'The door comes in.' : 'Somewhere close a door gives.'); }
          else if (t === T.WINDOW) { this.setDoor(x, y, T.WINDOW_BROKEN, 0); if (near <= 14) this.log(near <= 6 ? 'The window comes in with them behind it.' : 'Glass, somewhere close.'); }
          else { this.setDoor(x, y, T.WALL_BROKEN, 0); if (near <= 18) this.log(near <= 8 ? 'The wall comes down.' : 'Somewhere close, a wall going.'); }
          return true;
        }
        this.setDoor(x, y, t, hp);
        if (near <= 12 && this.turn % 2 === 0) {
          if (t === T.DOOR) this.log(near <= 5 ? 'Something at the door. Pounding.' + (hp <= 3 ? ' The frame is going.' : '') : 'Pounding on a door, not far.');
          else if (t === T.WINDOW) this.log(near <= 5 ? 'Hands on the glass. It wont hold.' : 'Knocking on glass, not far.');
          else if (this.turn % 6 === 0) this.log(near <= 5 ? 'The wall shudders. A dull thudding that doesnt stop.' + (hp <= 15 ? ' Dust sifts down.' : '') : 'A heavy thudding against a wall somewhere.');
        }
      }
      return true;
    }

    // Nearest existing way into/out of building i (open or broken door, broken window, wall hole) within range.
    nearestOpening(i, x, y, range) {
      let best = null, bd = range * range;
      const consider = (ox, oy) => { const d = (ox - x) ** 2 + (oy - y) ** 2; if (d < bd) { bd = d; best = [ox, oy]; } };
      for (const d of this.world.buildingDoors(i)) { const t = this.world.tileAt(d[0], d[1]); if (t === T.DOOR_OPEN || t === T.DOOR_BROKEN) consider(d[0], d[1]); }
      for (const [k, d] of this.doors) {
        if (d.t !== T.WINDOW_BROKEN && d.t !== T.WALL_BROKEN) continue;
        const [ox, oy] = k.split(',').map(Number);
        if (Math.abs(ox - x) > range || Math.abs(oy - y) > range) continue;
        if (this.world.buildingIdxAt(ox, oy) === i) consider(ox, oy);
      }
      return best;
    }

    // ---- weather -----------------------------------------------------------------
    updateWeather() {
      const w = this.weather;
      if (w.live && this.live && Date.now() - this.live.at > 30 * 60000) { w.live = false; w.until = this.turn; } // reading went stale
      if (!w.live && this.turn >= w.until) {
        const r = this.rng(), prev = w.k;
        w.k = r < 0.38 ? 'clear' : r < 0.62 ? 'overcast' : r < 0.78 ? 'rain' : r < 0.86 ? 'fog' : 'snow';
        w.until = this.turn + 400 + Math.floor(this.rng() * 1400);
        if (w.k !== prev) this.log({ clear: 'The sky clears. It doesnt help.', overcast: 'The sky goes the colour of ash.', rain: 'Rain. Cold and steady.', fog: 'Fog comes up off the river and takes the far houses.', snow: 'Snow. It comes down grey.' }[w.k]);
      }
      if (w.k === 'snow') this.snow = Math.min(1, this.snow + 1 / 300);
      else if (w.k === 'rain') this.snow = Math.max(0, this.snow - 1 / 200);
      else this.snow = Math.max(0, this.snow - 1 / 1200);
    }
    weatherName() { return { clear: 'clear', overcast: 'overcast', rain: 'rain', fog: 'fog', snow: 'snowing' }[this.weather.k]; }
    // Live weather from the real world (WMO code from Open-Meteo). Holds until the next reading; procedural weather pauses.
    applyLiveWeather(r) {
      const code = r.code | 0;
      const kind = code === 0 || code === 1 || code === 2 ? 'clear' : code === 3 ? 'overcast' : code === 45 || code === 48 ? 'fog'
        : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 ? 'rain' : 'overcast';
      const prev = this.weather.k, first = !this.live;
      this.weather = { k: kind, until: Infinity, live: true };
      if (typeof r.snowDepth === 'number') this.snow = Math.max(0, Math.min(1, r.snowDepth / 0.25));
      this.live = { temp: r.temp, code, wind: r.wind, at: Date.now() };
      if (first || kind !== prev) this.log('Outside, ' + (typeof r.temp === 'number' ? Math.round(r.temp) + ' degrees and ' : 'it is ') + { clear: 'clear', overcast: 'grey', rain: 'raining', fog: 'fog', snow: 'snowing' }[kind] + '. The same as out your window.');
    }

    // ---- hordes ------------------------------------------------------------------
    maybeSpawnHorde() {
      if (this.turn - this.lastHorde < HORDE_MIN_GAP || this.rng() > HORDE_CHANCE) return;
      if (!this.world.inData(this.player.x, this.player.y)) return;
      this.spawnHorde();
    }
    spawnHorde(count) {
      const p = this.player, n = count || 6 + Math.floor(this.rng() * 9);
      const ang = this.rng() * Math.PI * 2, dist = 26 + this.rng() * 10;
      const cx = Math.round(p.x + Math.cos(ang) * dist), cy = Math.round(p.y + Math.sin(ang) * dist);
      let placed = 0;
      for (let tries = 0; tries < 400 && placed < n; tries++) {
        const r = Math.floor(tries / 8) + 1;
        const x = cx + Math.floor(this.rng() * (2 * r + 1)) - r, y = cy + Math.floor(this.rng() * (2 * r + 1)) - r;
        if (!this.world.passable(x, y) || this.zmap.has(x + ',' + y) || this.world.buildingIdxAt(x, y) >= 0) continue;
        if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) < 18) continue;
        const z = this.addZombie(x, y, null, 3 + Math.floor(this.rng() * 3));
        z.horde = true; z.alert = true; z.tx = p.x; z.ty = p.y; z.ttl = 90;
        placed++;
      }
      if (!placed) return;
      this.lastHorde = this.turn;
      const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
      const dir = dirs[Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
      this.log('A sound from the ' + dir + ' like wind in a culvert. Many of them. Coming.');
    }

    // ---- player actions ------------------------------------------------------
    // Each returns true if a turn was consumed.
    act(cmd, arg) {
      if (this.dead) return false;
      let took = false;
      switch (cmd) {
        case 'move': took = this.tryMove(arg[0], arg[1]); break;
        case 'wait': took = true; this.log('You wait. Nothing comes.'); break;
        case 'grab': took = this.grab(); break;
        case 'use': took = this.useItem(arg); break;
        case 'drop': took = this.dropItem(arg); break;
        case 'fire': took = this.fire(arg[0], arg[1]); break;
        case 'close': took = this.closeDoor(arg[0], arg[1]); break;
      }
      if (took) this.endTurn();
      if (this.onChange) this.onChange();
      return took;
    }

    // Below a quarter of your body you stagger: a growing share of your steps go wherever your legs take them.
    staggerChance() {
      const pct = 100 * this.player.hp / (this.player.hpMax || 100);
      if (pct > 25) return 0;
      return Math.min(1, 0.25 + (25 - pct) * (0.65 / 15)); // 25% at a quarter, 90% at a tenth, worse below
    }
    tryMove(dx, dy) {
      const sc = this.staggerChance();
      if (sc > 0 && (dx || dy) && this.rng() < sc) {
        const d = DIRS[[1, 2, 3, 4, 6, 7, 8, 9][Math.floor(this.rng() * 8)]];
        if (d[0] !== dx || d[1] !== dy) { dx = d[0]; dy = d[1]; if (this.rng() < 0.5) this.log(['You stagger.', 'Your legs go their own way.', 'The ground tilts and you go with it.', 'You cant make your feet do it.'][Math.floor(this.rng() * 4)]); }
      }
      const x = this.player.x + dx, y = this.player.y + dy;
      const z = this.zombieAt(x, y);
      if (z) { this.attack(z); return true; }
      const bt = this.world.tileAt(x, y);
      if (bt === T.DOOR) { this.setDoor(x, y, T.DOOR_OPEN); this.log('The door gives. You go in.'); return true; }
      if (bt === T.WINDOW) { this.setDoor(x, y, T.WINDOW_BROKEN, 0); this.noise(x, y, 8); this.log('The glass goes. The sound carries a long way in the quiet.'); return true; }
      if (bt === T.CAR) { const car = this.world.carAt(x, y); if (car) return this.searchContainer(car); }
      if (bt === T.OBJ) { const c = this.world.containerAt(x, y); if (c) return this.searchContainer(c); }
      if (!this.world.passable(x, y) || this.cornerBlocked(this.player.x, this.player.y, dx, dy)) {
        const t = this.world.tileAt(x, y);
        if (t === T.WATER) this.log('Black water. You dont go in.');
        return false;
      }
      this.player.x = x; this.player.y = y;
      return true;
    }

    attack(z) {
      let w = this.weapon();
      if (w.ranged) w = { name: 'butt of your ' + w.name.toLowerCase(), dmg: w.melee, hit: 0.75 };
      this.noise(this.player.x, this.player.y, 7);
      if (this.rng() < w.hit) {
        const dmg = w.dmg + this.perk('melee', 0) + (this.rng() < 0.25 ? 1 : 0);
        z.hp -= dmg;
        if (z.hp <= 0) {
          this.zombies.splice(this.zombies.indexOf(z), 1); this.zmap.delete(z.x + ',' + z.y);
          this.player.kills++;
          this.log('It goes down and doesnt get up. The ' + w.name.toLowerCase() + '.');
        } else this.log('The ' + w.name.toLowerCase() + ' lands. ' + dmg + '.');
      } else this.log('You swing at it. Air.');
    }

    // Fire the wielded ranged weapon along a straight line (8 directions). Returns true if a turn passed.
    fire(dx, dy) {
      const w = this.weapon();
      if (!w.ranged) { this.log('Nothing in your hands that will reach that far.'); return false; }
      const have = this.player.ammo[w.ammo] || 0;
      if (have <= 0) { this.log('No ' + ITEMS[w.ammo].short + '. You check again anyway.'); return false; }
      this.player.ammo[w.ammo] = have - 1;
      let x = this.player.x, y = this.player.y, target = null, dist = 0;
      for (let i = 1; i <= w.range; i++) {
        const nx = x + dx, ny = y + dy;
        const t = this.world.tileAt(nx, ny);
        if (t === T.WALL || t === T.IWALL || t === T.TREE || t === T.DOOR || t === T.WINDOW) break;
        x = nx; y = ny; dist = i;
        const z = this.zombieAt(x, y);
        if (z) { target = z; break; }
      }
      this.lastShot = { x0: this.player.x, y0: this.player.y, x1: x, y1: y, turn: this.turn + 1, hit: !!target };
      this.noise(this.player.x, this.player.y, Math.max(2, w.noise - this.perk('noiseDamp', 0)));
      if (!target) { this.log('The shot goes out across the lots. Nothing.'); return true; }
      const hitChance = Math.min(0.97, Math.max(0.3, w.hit + this.perk('ranged', 0) - (w.falloff || 0.025) * dist));
      if (this.rng() < hitChance) {
        const dmg = w.dmg + (this.rng() < 0.25 ? 1 : 0);
        target.hp -= dmg;
        if (target.hp <= 0) {
          this.zombies.splice(this.zombies.indexOf(target), 1); this.zmap.delete(target.x + ',' + target.y);
          this.player.kills++;
          this.log('It drops at ' + dist + ' paces and lies there.');
        } else this.log('Hit, at ' + dist + ' paces. ' + dmg + '. It keeps coming.');
      } else this.log('The shot goes wide.');
      return true;
    }

    // g: go through the nearest unsearched container or car beside you (walking into one does the same).
    grab() {
      const p = this.player; let best = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const c = this.world.containerAt(p.x + dx, p.y + dy) || this.world.carAt(p.x + dx, p.y + dy);
        if (c && (!best || (best.opened && !c.opened))) best = c;
      }
      if (!best) { this.log('Nothing here to go through.'); return false; }
      return this.searchContainer(best);
    }
    searchContainer(c) {
      if (c.opened) { this.log('Youve been through this already.'); return false; }
      if (c.items === null) c.items = this.rollLoot(c);
      c.opened = true;
      this.player.looted++;
      if (!c.items.length) { this.log('Nothing. Someone was here before you.'); return true; }
      const got = [], left = [];
      for (const entry of c.items) {
        const [id, qty] = entry.split('*');
        if (ITEMS[id].cat === 'ammo') { const n = parseInt(qty || '1', 10); this.player.ammo[id] = (this.player.ammo[id] || 0) + n; got.push(n + ' ' + ITEMS[id].short); continue; }
        if (this.player.inv.length >= INV_MAX) left.push(entry); else { this.player.inv.push(id); got.push(ITEMS[id].name); }
      }
      if (got.length) this.log('In the ' + CONTAINER_NAME[c.kind] + ': ' + got.join(', ').toLowerCase() + '. You take ' + (got.length > 1 ? 'them' : 'it') + '.');
      if (left.length) { this.log('The pack wont take any more. You leave ' + left.map(i => ITEMS[i.split('*')[0]].name.toLowerCase()).join(', ') + '.'); c.items = left; c.opened = false; }
      else c.items = [];
      return true;
    }

    rollLoot(c) {
      const rng = mulberry32(hash2(this.seed + 1234, c.x, c.y) * 1e9);
      const tbl = LOOT[c.kind] || LOOT.shelf;
      if (rng() < tbl.empty) return [];
      let table = tbl.t;
      if (c.kind === 'shelf' && USE_SHELF[c.use]) table = USE_SHELF[c.use];
      if (c.kind === 'cabinet' && c.use === 'medical' && rng() < 0.5) table = USE_SHELF.medical;
      const n = tbl.n[0] + Math.floor(rng() * (tbl.n[1] - tbl.n[0] + 1)) + this.perk('loot', 0);
      const out = [];
      const total = table.reduce((s, e) => s + e[1], 0);
      for (let i = 0; i < n; i++) {
        let r = rng() * total;
        for (const [id, w, qa, qb] of table) {
          r -= w;
          if (r <= 0) { out.push(qa ? id + '*' + (qa + Math.floor(rng() * (qb - qa + 1))) : id); break; }
        }
      }
      return out;
    }

    useItem(idx) {
      const id = this.player.inv[idx]; if (!id) return false;
      const it = ITEMS[id], p = this.player;
      switch (it.cat) {
        case 'food': case 'drink':
          const fm = this.perk('foodMult', 1);
          p.hunger = Math.max(0, Math.min(100, p.hunger + Math.round((it.hunger || 0) * ((it.hunger || 0) > 0 ? fm : 1))));
          p.thirst = Math.max(0, Math.min(100, p.thirst + Math.round((it.thirst || 0) * ((it.thirst || 0) > 0 ? fm : 1))));
          p.inv.splice(idx, 1);
          this.log(it.cat === 'food' ? 'You eat the ' + it.name.toLowerCase() + ' cold, standing up.' : 'You drink the ' + it.name.toLowerCase() + '. It helps.');
          return true;
        case 'med':
          if (p.hp >= p.hpMax) { this.log('Youre not hurt. Not that way.'); return false; }
          p.hp = Math.min(p.hpMax, p.hp + Math.round(it.heal * this.perk('medMult', 1))); p.inv.splice(idx, 1);
          this.log('You bind it as best you can. ' + p.hp + '.');
          return true;
        case 'weapon':
          if (p.weapon === id) { this.log('Its already in your hand.'); return false; }
          p.weapon = id; this.log('You take up the ' + it.name.toLowerCase() + '.');
          return true;
        default:
          this.log(it.name + '. ' + (it.note || 'No use for it yet.'));
          return false;
      }
    }

    dropItem(idx) {
      const id = this.player.inv[idx]; if (!id) return false;
      this.player.inv.splice(idx, 1);
      if (this.player.weapon === id && !this.player.inv.includes(id)) this.player.weapon = null;
      this.log('You leave the ' + ITEMS[id].name.toLowerCase() + ' in the road.');
      return true;
    }

    hurt(amount) {
      this.player.hp -= amount;
      this.hurtTime = Date.now();
      this.hurtAmount = amount;
    }
    noise(x, y, radius) {
      for (const z of this.zombies) {
        if (Math.abs(z.x - x) <= radius && Math.abs(z.y - y) <= radius) { z.alert = true; z.tx = x; z.ty = y; z.ttl = 30; }
      }
    }

    // ---- turn resolution -----------------------------------------------------
    endTurn() {
      this.turn++;
      const p = this.player;
      if (this.turn % 90 === 0) p.hunger = Math.max(0, p.hunger - 1);
      if (this.turn % 55 === 0) p.thirst = Math.max(0, p.thirst - 1);
      if (p.hunger === 0 && this.turn % 20 === 0) { this.hurt(1); if (this.turn % 100 === 0) this.log('You are starving. You know it the way you know the cold.'); }
      if (p.thirst === 0 && this.turn % 12 === 0) { this.hurt(1); if (this.turn % 60 === 0) this.log('There is no water. Your body keeps telling you.'); }
      if (p.hunger === 25 && this.turn % 90 === 0) this.log('The hunger is a stone in you.');
      if (p.thirst === 25 && this.turn % 55 === 0) this.log('Your mouth is ash.');
      if (p.hp > 0 && p.hp < p.hpMax && p.hunger > 50 && p.thirst > 50 && this.turn % Math.round(40 / this.perk('regen', 1)) === 0) p.hp++;
      this.updateWeather();
      this.ensureSpawns();
      this.maybeSpawnHorde();
      this.zombiesAct();
      this.computeFov();
      const low = 100 * p.hp / (p.hpMax || 100) <= 25;
      if (low && !this.wasLow && p.hp > 0) this.log('You are losing too much blood. Your legs are not yours anymore.');
      this.wasLow = low;
      if (p.hp <= 0) { p.hp = 0; this.dead = true; this.log('Then nothing.'); }
    }

    zombiesAct() {
      const p = this.player;
      for (const z of this.zombies.slice()) {
        const dx = p.x - z.x, dy = p.y - z.y, ad = Math.abs(dx), bd = Math.abs(dy);
        if (ad > 40 || bd > 40) continue; // dormant far away
        const dist = Math.max(ad, bd);
        const seesPlayer = dist <= Math.max(2, (this.isNight() ? 6 : 10) - this.perk('stealth', 0) - (this.weather.k === 'fog' ? 3 : 0)) && this.los(z.x, z.y, p.x, p.y);
        if (seesPlayer || dist <= 1) { z.alert = true; z.tx = p.x; z.ty = p.y; z.ttl = 25; }
        if (dist <= 1) { this.zombieAttack(z); continue; }
        if (z.alert) {
          if (this.rng() < 0.22) continue; // shambling
          // If a building wall separates the zombie from its target, head for that building's nearest door.
          let tx = z.tx, ty = z.ty;
          const zb = this.world.buildingIdxAt(z.x, z.y), pb = this.world.buildingIdxAt(z.tx, z.ty);
          if (zb !== pb) {
            const bidx = zb >= 0 ? zb : pb;
            if (z.horde) {
              // Hordes go straight at you: whatever stands in the way gets pounded, unless a breach already exists nearby.
              const opening = this.nearestOpening(bidx, z.x, z.y, 8);
              if (opening) { tx = opening[0]; ty = opening[1]; }
              const sx = Math.sign(tx - z.x), sy = Math.sign(ty - z.y);
              let hit = null;
              for (const [ddx, ddy] of [[sx, sy], [sx, 0], [0, sy]]) {
                if (!ddx && !ddy) continue;
                if (this.world.isBarrierOf(z.x + ddx, z.y + ddy, bidx)) { hit = [z.x + ddx, z.y + ddy]; break; }
              }
              if (hit) { z.ttl = Math.max(z.ttl, 20); this.bashDoor(z, hit[0], hit[1]); continue; }
            } else {
              const doors = this.world.buildingDoors(bidx);
              let door = null, dd = Infinity;
              for (const d of doors) { const dist2 = (d[0] - z.x) ** 2 + (d[1] - z.y) ** 2; if (dist2 < dd) { dd = dist2; door = d; } }
              if (door && !(door[0] === z.x && door[1] === z.y)) {
                const adj = Math.max(Math.abs(door[0] - z.x), Math.abs(door[1] - z.y)) <= 1;
                if (adj && this.world.tileAt(door[0], door[1]) === T.DOOR) { z.ttl = Math.max(z.ttl, 12); this.bashDoor(z, door[0], door[1]); continue; }
                tx = door[0]; ty = door[1];
              }
            }
          }
          if (!this.stepToward(z, tx, ty)) {
            if (z.horde) {
              // Stuck against the building: hammer any adjacent barrier of it.
              let hit = null;
              for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                if (this.world.isBarrierOf(z.x + ddx, z.y + ddy, zb >= 0 ? zb : pb)) { hit = [z.x + ddx, z.y + ddy]; break; }
              }
              if (hit) { z.ttl = Math.max(z.ttl, 20); this.bashDoor(z, hit[0], hit[1]); continue; }
            }
            z.ttl -= 3;
          }
          if (z.x === z.tx && z.y === z.ty) z.ttl = 0;
          if (--z.ttl <= 0) z.alert = false;
        } else if (this.rng() < 0.3) {
          const d = DIRS[[1, 2, 3, 4, 6, 7, 8, 9][Math.floor(this.rng() * 8)]];
          this.tryStep(z, z.x + d[0], z.y + d[1]);
        }
      }
    }

    stepToward(z, tx, ty) {
      const sx = Math.sign(tx - z.x), sy = Math.sign(ty - z.y);
      const opts = [[sx, sy], [sx, 0], [0, sy], [sx, -sy], [-sx, sy]];
      for (const [dx, dy] of opts) {
        if (!dx && !dy) continue;
        if (this.tryStep(z, z.x + dx, z.y + dy)) return true;
      }
      return false;
    }
    // No squeezing diagonally between two blocking tiles (keeps diagonal walls solid).
    cornerBlocked(x, y, dx, dy) {
      return dx !== 0 && dy !== 0 && !this.world.passable(x + dx, y) && !this.world.passable(x, y + dy);
    }
    tryStep(z, x, y) {
      if (x === this.player.x && y === this.player.y) return false;
      if (!this.world.passable(x, y) || this.zmap.has(x + ',' + y)) return false;
      if (this.cornerBlocked(z.x, z.y, x - z.x, y - z.y)) return false;
      this.moveZombie(z, x, y);
      return true;
    }
    zombieAttack(z) {
      if (this.rng() < 0.65) {
        const dmg = 3 + Math.floor(this.rng() * 6);
        this.hurt(dmg);
        this.log('It gets its teeth in you. ' + dmg + '.');
      } else this.log('It comes at you and finds nothing.');
    }

    // ---- save / load -----------------------------------------------------------
    serialize() {
      const seen = {}, looted = [], spawned = [];
      for (const [k, c] of this.world.chunks) {
        if (c.spawned) spawned.push(k);
        for (const ct of c.containers) if (ct.opened || ct.items) looted.push([ct.x, ct.y, ct.opened ? 1 : 0, ct.items]);
        let any = false; for (let i = 0; i < c.seen.length; i++) if (c.seen[i]) { any = true; break; }
        if (any) seen[k] = rle(c.seen);
      }
      const doors = [...this.doors].map(([k, d]) => [...k.split(',').map(Number), d.t, d.hp]);
      return { v: 1, placeId: this.place.id, seed: this.seed, turn: this.turn, player: this.player, nextId: this.nextId, doors,
        zombies: this.zombies.map(z => ({ x: z.x, y: z.y, hp: z.hp, h: z.horde ? 1 : 0 })), lastHorde: this.lastHorde, weather: this.weather.live ? { k: this.weather.k, until: this.turn } : this.weather, snow: this.snow, startedAt: this.startedAt, spawned, looted, seen, msgs: this.msgs.slice(-10), saved: Date.now() };
    }
    static restore(place, data) {
      const g = new Game(place, data.seed);
      g.turn = data.turn; g.player = data.player; if (!g.player.ammo) g.player.ammo = {}; if (!g.player.hpMax) g.player.hpMax = 100; g.nextId = data.nextId || 1; g.msgs = data.msgs || [];
      for (const k of data.spawned) { const [cx, cy] = k.split(',').map(Number); g.world.getChunk(cx, cy).spawned = true; }
      for (const z of data.zombies) { const zz = g.addZombie(z.x, z.y, null, z.hp); if (z.h) zz.horde = true; }
      g.lastHorde = data.lastHorde || 0; if (data.weather) g.weather = Object.assign({ live: false }, data.weather); g.snow = data.snow || 0; g.startedAt = data.startedAt || Date.now();
      for (const [x, y, opened, items] of data.looted) { const c = g.world.containerAt(x, y) || g.world.carAt(x, y); if (c) { c.opened = !!opened; c.items = items; } }
      for (const [x, y, t, hp] of data.doors || []) g.setDoor(x, y, t, hp);
      for (const k in data.seen) { const [cx, cy] = k.split(',').map(Number); unrle(data.seen[k], g.world.getChunk(cx, cy).seen); }
      g.computeFov();
      g.log('You pick it up where you left it.');
      return g;
    }
  }

  function rle(arr) { const out = []; let cur = arr[0], n = 0; for (const v of arr) { if (v === cur) n++; else { out.push(cur, n); cur = v; n = 1; } } out.push(cur, n); return out; }
  function unrle(r, arr) { let i = 0; for (let k = 0; k < r.length; k += 2) { const v = r[k], n = r[k + 1]; for (let j = 0; j < n; j++) arr[i++] = v; } }

  global.Game = Game;
  global.ITEMS = ITEMS;
  global.CLASSES = CLASSES;
  global.CONTAINER_NAME = CONTAINER_NAME;
})(typeof window !== 'undefined' ? window : globalThis);
