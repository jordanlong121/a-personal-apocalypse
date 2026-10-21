// render.js — canvas renderer: vector ground from OSM geometry, roofs with interior cutaway, street furniture,
// time-of-day grading, weather, landmarks; plus the overview map and the sidebar HUD.
(function (global) {
  'use strict';
  const T = global.T, ITEMS = global.ITEMS, CONTAINER_NAME = global.CONTAINER_NAME, CH = global.CH;

  const TILE_COLOR = {
    [T.GRASS]: '#3f6b35', [T.LAWN]: '#4a7a3c', [T.TREE]: '#2f4d2a', [T.FOREST_FLOOR]: '#2f4d2a', [T.FARM]: '#8a7a3a',
    [T.WATER]: '#2a5d8f', [T.ROAD]: '#4a4a4f', [T.PATH]: '#7b7462', [T.ASPHALT]: '#55555a', [T.BRIDGE]: '#5a5a60',
    [T.WALL]: '#5e5248', [T.IWALL]: '#6b5f55', [T.FLOOR]: '#d2c6ad', [T.DOOR]: '#5e5248', [T.GRAVEL]: '#6e6a62',
    [T.WETLAND]: '#4e6b55', [T.SAND]: '#c8b98a', [T.SCRUB]: '#5c7a3f', [T.DOOR_OPEN]: '#5e5248', [T.DOOR_BROKEN]: '#5e5248',
    [T.WINDOW]: '#5e5248', [T.WINDOW_BROKEN]: '#5e5248', [T.WALL_BROKEN]: '#d2c6ad', [T.RAIL]: '#5a534c', [T.CAR]: '#4a4a4f', [T.OBJ]: '#d2c6ad',
  };
  const SNOWY = new Set([T.GRASS, T.LAWN, T.FOREST_FLOOR, T.FARM, T.SCRUB, T.WETLAND, T.SAND, T.GRAVEL, T.TREE]);
  const AREA_COLOR = { water: '#2a5d8f', forest: '#2f4d2a', scrub: '#5c7a3f', wetland: '#4e6b55', sand: '#c8b98a', farm: '#8a7a3a', grass: '#3f6b35', asphalt: '#55555a', gravel: '#6e6a62', lawn: '#4a7a3c' };
  const SPRITE_TILES = { [T.DOOR]: 'door', [T.DOOR_OPEN]: 'door_open', [T.DOOR_BROKEN]: 'door_broken', [T.WINDOW]: 'window', [T.WINDOW_BROKEN]: 'window_broken', [T.WALL_BROKEN]: 'rubble' };
  const USE_COLOR = { home: '#b8a98e', food: '#d9a441', medical: '#d85a5a', tools: '#7f9ac9', weapons: '#c44fc4', fuel: '#e08a3c', office: '#9fb3a6' };
  const USE_LABEL = { home: 'residence', food: 'food', medical: 'medical', tools: 'tools & hardware', weapons: 'weapons', fuel: 'gas station', office: 'office / public' };
  const CONTAINER_GLYPH = { fridge: '▯', freezer: '▯', cupboard: '≡', closet: '▮', dresser: '≡', shelf: '≡', cabinet: '▯', desk: '▭', toolbox: '▣', crate: '▣', locker: '▮', car: '⌂' };
  const ROOF = { pitched: ['#7c6252', '#6f5d55', '#7a6a5a', '#6b5a4e'], flat: ['#6f6b66', '#75716b', '#67635e'], shed: ['#6a5d4e'] };
  const LANDMARK_LABEL = { church: 'church', hospital: 'hospital', school: 'school', townhall: 'town hall', police: 'police', fire: 'fire hall', library: 'library', arena: 'arena', fuel: 'gas', bigbox: 'store', station: 'station' };
  const CAR_VARIANTS = ['', '|r', '|w', '|g', '|y'];
  const DIM = 'rgba(5,6,10,0.38)';

  function lerpColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t), g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  // Light colour by hour (multiplied over the scene). Keyframes: hour -> [r,g,b].
  function lightAt(h, sun) {
    const { rise, set } = sun;
    const LIGHT = [[-1, [120, 130, 180]], [rise - 1.2, [120, 130, 180]], [rise - 0.2, [255, 200, 165]], [rise + 1.2, [255, 255, 255]], [set - 1.5, [255, 255, 255]],
      [set - 0.2, [255, 195, 150]], [set + 0.6, [170, 150, 170]], [set + 1.4, [120, 130, 180]], [25, [120, 130, 180]]];
    for (let i = 0; i + 1 < LIGHT.length; i++) {
      const [h0, c0] = LIGHT[i], [h1, c1] = LIGHT[i + 1];
      if (h >= h0 && h <= h1) { const t = h1 > h0 ? (h - h0) / (h1 - h0) : 0; return 'rgb(' + c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(',') + ')'; }
    }
    return '#fff';
  }

  class Renderer {
    constructor(canvas, sidebar) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.sidebar = sidebar;
      this.tile = 24;
      this.mapCanvas = null;
      this.paths = new Map();
      this.wallAngles = new Map();
      this.noise = null;
      this.animated = false;
      this.resize();
    }
    resize() {
      const r = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = Math.floor(r.width); this.canvas.height = Math.floor(r.height);
    }
    path(game, i) {
      let p = this.paths.get(i);
      if (p) return p;
      const f = game.place.feats[i];
      p = new Path2D();
      for (let k = 0; k < f.p.length; k += 2) k ? p.lineTo(f.p[k], f.p[k + 1]) : p.moveTo(f.p[k], f.p[k + 1]);
      if (f.k === 'b' || f.k === 'a') p.closePath();
      this.paths.set(i, p);
      return p;
    }
    // Rotation that lays a door/window sprite along the nearest wall segment of building bi, its top facing outward.
    wallAngle(game, bi, x, y) {
      if (!this.wallAngles) this.wallAngles = new Map();
      const key = x + ',' + y;
      let a = this.wallAngles.get(key);
      if (a !== undefined) return a;
      const f = game.place.feats[bi], px = x + 0.5, py = y + 0.5;
      let best = Infinity, nx = 0, ny = -1;
      for (let i = 0; i + 3 < f.p.length; i += 2) {
        const ax = f.p[i], ay = f.p[i + 1], bx = f.p[i + 2], by = f.p[i + 3];
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-9;
        let t = ((px - ax) * dx + (py - ay) * dy) / len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
        if (d < best) { best = d; const len = Math.sqrt(len2); nx = -dy / len; ny = dx / len; }
      }
      if (global.OSM.pointInPoly(px + nx * 1.2, py + ny * 1.2, f.p)) { nx = -nx; ny = -ny; }
      a = Math.atan2(nx, -ny);
      this.wallAngles.set(key, a);
      return a;
    }
    // Floor textures by building use, built once at tile scale.
    floorPattern(kind) {
      if (!this.floors) this.floors = {};
      if (this.floors[kind]) return this.floors[kind];
      const P = this.tile * 4, cv = document.createElement('canvas'); cv.width = P; cv.height = P;
      const c = cv.getContext('2d'), ts = this.tile;
      const rnd = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
      const r = rnd(kind.length * 977);
      if (kind === 'wood') {
        c.fillStyle = '#b08a5a'; c.fillRect(0, 0, P, P);
        const plank = ts * 0.5;
        for (let y = 0; y < P; y += plank) {
          const off = (Math.floor(y / plank) % 2) * ts * 1.3;
          for (let x = -ts * 2; x < P + ts * 2; x += ts * 2.6) {
            const tone = 0.88 + r() * 0.24;
            c.fillStyle = 'rgb(' + Math.round(176 * tone) + ',' + Math.round(138 * tone) + ',' + Math.round(90 * tone) + ')';
            c.fillRect(x + off, y, ts * 2.6 - 1, plank - 1);
          }
        }
        c.fillStyle = 'rgba(60,35,15,0.25)'; for (let y = 0; y < P; y += plank) c.fillRect(0, y, P, 1);
      } else if (kind === 'tile') {
        c.fillStyle = '#d9d4c7'; c.fillRect(0, 0, P, P);
        const g = ts;
        for (let y = 0; y < P; y += g) for (let x = 0; x < P; x += g) { const t = 0.94 + r() * 0.08; c.fillStyle = 'rgb(' + Math.round(217 * t) + ',' + Math.round(212 * t) + ',' + Math.round(199 * t) + ')'; c.fillRect(x + 1, y + 1, g - 2, g - 2); }
        c.fillStyle = 'rgba(90,85,75,0.35)'; for (let y = 0; y < P; y += g) c.fillRect(0, y, P, 1); for (let x = 0; x < P; x += g) c.fillRect(x, 0, 1, P);
      } else if (kind === 'concrete') {
        c.fillStyle = '#9a9790'; c.fillRect(0, 0, P, P);
        for (let k = 0; k < 400; k++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '60,58,55' : '200,198,190') + ',' + (0.08 + r() * 0.12) + ')'; c.fillRect(Math.floor(r() * P), Math.floor(r() * P), 1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2)); }
        c.strokeStyle = 'rgba(40,40,40,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, P / 2 + 0.5); c.lineTo(P, P / 2 + 0.5); c.moveTo(P / 2 + 0.5, 0); c.lineTo(P / 2 + 0.5, P); c.stroke();
      } else { // carpet
        c.fillStyle = '#7d8a8f'; c.fillRect(0, 0, P, P);
        for (let k = 0; k < 900; k++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '40,50,55' : '170,185,190') + ',' + (0.05 + r() * 0.1) + ')'; c.fillRect(Math.floor(r() * P), Math.floor(r() * P), 1, 1); }
      }
      this.floors[kind] = this.ctx.createPattern(cv, 'repeat');
      this.floors[kind].size = P;
      return this.floors[kind];
    }

    // The building you are standing in: textured floor clipped to the footprint, clean partition walls, shadowed outer wall.
    drawInterior(game, i, f, p, ox, oy, ts, W, H, cols, rows) {
      const ctx = this.ctx, world = game.world, T = global.T;
      const kind = f.u === 'home' ? 'wood' : (f.u === 'food' || f.u === 'medical' || f.lm === 'school' || f.lm === 'hospital') ? 'tile' : (f.u === 'tools' || f.u === 'fuel' || f.rf === 'shed') ? 'concrete' : 'carpet';
      const pat = this.floorPattern(kind), P = pat.size;
      ctx.save();
      ctx.clip(p);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pat; ctx.save(); ctx.translate(-((ox * ts) % P), -((oy * ts) % P)); ctx.fillRect(0, 0, W + P, H + P); ctx.restore();
      if (game.snow > 0.05) { ctx.fillStyle = 'rgba(230,234,238,' + (0.12 * game.snow) + ')'; ctx.fillRect(0, 0, W, H); }
      ctx.setTransform(ts, 0, 0, ts, -ox * ts, -oy * ts);
      // inner shadow along the outer wall
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2.6; ctx.stroke(p);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.2; ctx.stroke(p);
      ctx.restore();
      // partition walls: merge runs of interior-wall tiles into bars
      const isW = (x, y) => world.buildingIdxAt(x, y) === i && world.tileAt(x, y) === T.IWALL;
      ctx.save(); ctx.setTransform(ts, 0, 0, ts, -ox * ts, -oy * ts); ctx.lineJoin = 'round';
      const bar = (x, y, w, h) => { ctx.fillStyle = '#6e6257'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#3e352e'; ctx.lineWidth = 0.09; ctx.strokeRect(x, y, w, h); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y, w, Math.min(0.12, h)); };
      const th = 0.56, in0 = (1 - th) / 2;
      for (let r = -1; r <= rows; r++) for (let c = -1; c <= cols; c++) {
        const x = ox + c, y = oy + r; if (!isW(x, y)) continue;
        const left = isW(x - 1, y), up = isW(x, y - 1), right = isW(x + 1, y), down = isW(x, y + 1);
        if (!left && right) { let len = 1; while (isW(x + len, y)) len++; bar(x, y + in0, len, th); }
        if (!up && down) { let len = 1; while (isW(x, y + len)) len++; bar(x + in0, y, th, len); }
        if (!left && !right && !up && !down) bar(x + in0, y + in0, th, th);
      }
      // outer wall: dark body with a lighter top edge
      ctx.strokeStyle = '#3e352e'; ctx.lineWidth = 1.15; ctx.stroke(p);
      ctx.strokeStyle = '#6e6257'; ctx.lineWidth = 0.7; ctx.stroke(p);
      ctx.restore();
    }
    noisePattern() {
      if (this.noise) return this.noise;
      const n = 96, cv = document.createElement('canvas'); cv.width = n; cv.height = n;
      const c = cv.getContext('2d'), img = c.createImageData(n, n);
      for (let i = 0; i < n * n; i++) { const v = 215 + Math.floor(Math.random() * 40); img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      c.putImageData(img, 0, 0);
      const big = document.createElement('canvas'); big.width = n * 3; big.height = n * 3;
      const bc = big.getContext('2d'); bc.imageSmoothingEnabled = false; bc.drawImage(cv, 0, 0, n * 3, n * 3);
      this.noise = this.ctx.createPattern(big, 'repeat');
      return this.noise;
    }

    draw(game, now) {
      now = now || performance.now();
      const ctx = this.ctx, ts = this.tile, W = this.canvas.width, H = this.canvas.height;
      const cols = Math.ceil(W / ts) + 1, rows = Math.ceil(H / ts) + 1;
      const px = game.player.x, py = game.player.y;
      const ox = px - Math.floor(cols / 2), oy = py - Math.floor(rows / 2);
      const world = game.world, place = game.place, SP = global.Sprites, hash2 = global.WorldUtil.hash2;
      const snow = game.snow, weather = game.weather.k;
      const inside = world.buildingIdxAt(px, py);
      this.animated = weather === 'rain' || weather === 'snow';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#07080a'; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      const tileColor = (t) => {
        let c = TILE_COLOR[t] || '#f0f';
        if (snow > 0.05 && SNOWY.has(t)) c = lerpColor(c, '#e6eaee', snow * 0.9);
        else if (snow > 0.05 && (t === T.ROAD || t === T.ASPHALT || t === T.PATH || t === T.CAR)) c = lerpColor(c, '#c9ccd0', snow * 0.35);
        return c;
      };

      // 1. Tile ground pass (collision truth; also everything outside the mapped box).
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = ox + c, y = oy + r, t = world.tileAt(x, y);
        ctx.fillStyle = tileColor(t === T.TREE ? T.FOREST_FLOOR : t);
        ctx.fillRect(c * ts, r * ts, ts, ts);
      }

      // 2. Vector ground: smooth areas, roads with sidewalks and centre lines, water, rail, fences.
      const feats = new Set();
      const cx0 = Math.floor(ox / CH), cx1 = Math.floor((ox + cols) / CH), cy0 = Math.floor(oy / CH), cy1 = Math.floor((oy + rows) / CH);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const i of (world.index.get(cx + ',' + cy) || [])) feats.add(i);
      const list = [...feats];
      ctx.save();
      ctx.setTransform(ts, 0, 0, ts, -ox * ts, -oy * ts);
      ctx.beginPath(); ctx.rect(0, 0, place.w, place.h); ctx.clip();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const i of list) {
        const f = place.feats[i]; if (f.k !== 'a') continue;
        let col = AREA_COLOR[f.t] || '#555';
        if (snow > 0.05 && f.t !== 'water' && f.t !== 'asphalt') col = lerpColor(col, '#e6eaee', snow * (f.t === 'gravel' ? 0.5 : 0.9));
        ctx.fillStyle = col; ctx.fill(this.path(game, i));
      }
      const roads = list.map(i => [i, place.feats[i]]).filter(([, f]) => f.k === 'r');
      roads.sort((a, b) => a[1].w - b[1].w);
      const roadCol = snow > 0.05 ? lerpColor('#4a4a4f', '#c9ccd0', snow * 0.35) : '#4a4a4f';
      const isStreet = f => f.t !== 'water' && f.t !== 'path' && f.t !== 'rail';
      const strokeAll = (pred, style, width, dash) => {
        if (dash) ctx.setLineDash(dash);
        for (const [i, f] of roads) { if (!pred(f)) continue; ctx.strokeStyle = typeof style === 'function' ? style(f) : style; ctx.lineWidth = width(f); ctx.stroke(this.path(game, i)); }
        if (dash) ctx.setLineDash([]);
      };
      // Layered passes so streets merge at junctions instead of painting over each other.
      strokeAll(f => f.t === 'water', '#2a5d8f', f => f.w);
      strokeAll(f => f.t === 'rail', '#4a4440', f => f.w);
      strokeAll(f => f.t === 'rail', '#6b5a45', f => f.w * 0.75, [0.5, 1.1]);
      strokeAll(f => f.t === 'rail', '#9a9a9a', () => 0.22);
      strokeAll(f => isStreet(f) && !f.br && f.w >= 6, snow > 0.3 ? '#d4d6d8' : '#8a8578', f => f.w + 2.4);   // sidewalks
      strokeAll(f => isStreet(f) && f.br, '#2b2a2e', f => f.w + 1.2);                                          // bridge decks
      strokeAll(f => f.t === 'path', snow > 0.3 ? '#b9b3a6' : '#7b7462', f => f.w);
      strokeAll(f => isStreet(f), roadCol, f => f.w);                                                           // all surfaces
      strokeAll(f => isStreet(f) && f.br, '#c9c4b4', f => f.w + 0.9, [0.8, 0.8]);                               // railings
      strokeAll(f => isStreet(f) && f.br, roadCol, f => f.w);
      if (snow < 0.5) strokeAll(f => isStreet(f) && f.w >= 6 && f.t !== 'service' && f.t !== 'living_street', f => f.w >= 8 ? '#b9a84a' : '#a09a7c', () => 0.22, [2.5, 2.5]);
      // Street names, laid along the road every so often, upright whichever way the road runs.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = 'bold ' + Math.max(9, Math.floor(ts * 0.5)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const labelSpacing = 42; // tiles between repeats of a name
      for (const [i, f] of roads) {
        if (!f.n || !isStreet(f) || f.w < 4) continue;
        const text = f.n, tw = ctx.measureText(text).width;
        let acc = labelSpacing * 0.55; // first label partway in
        for (let k = 0; k + 3 < f.p.length; k += 2) {
          const ax = f.p[k], ay = f.p[k + 1], bx = f.p[k + 2], by = f.p[k + 3];
          const len = Math.hypot(bx - ax, by - ay);
          acc += len;
          if (acc < labelSpacing || len * ts < tw + ts) continue;
          acc = 0;
          const mx = (ax + bx) / 2, my = (ay + by) / 2;
          const sx = (mx - ox) * ts, sy = (my - oy) * ts;
          if (sx < -tw || sy < -ts || sx > W + tw || sy > H + ts) continue;
          let ang = Math.atan2(by - ay, bx - ax);
          if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,20,24,0.75)'; ctx.strokeText(text, 0, 0);
          ctx.fillStyle = 'rgba(235,228,210,0.9)'; ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
      ctx.setTransform(ts, 0, 0, ts, -ox * ts, -oy * ts);
      for (const i of list) {
        const f = place.feats[i]; if (f.k !== 'f') continue;
        ctx.strokeStyle = f.t === 'hedge' ? '#2f5a2a' : f.t === 'wall' ? '#6e6258' : '#7a5a35'; ctx.lineWidth = f.t === 'hedge' ? 0.8 : 0.3;
        if (f.t === 'fence') ctx.setLineDash([0.5, 0.4]);
        ctx.stroke(this.path(game, i)); ctx.setLineDash([]);
      }
      ctx.restore();

      // 3. Ground texture.
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.55;
      ctx.fillStyle = this.noisePattern(); ctx.translate(-((ox * ts) % 288), -((oy * ts) % 288)); ctx.fillRect(0, 0, W + 288, H + 288);
      ctx.restore();

      // 4. Tile overlays that sit on the ground: interior tiles of the building you are in, trees, rail, decor.
      const chunksInView = [];
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) chunksInView.push(world.getChunk(cx, cy));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = ox + c, y = oy + r, t = world.tileAt(x, y);
        // The building you are in: redraw its floor and interior walls over any lawn or lot polygon painted in pass 2.
        if (inside >= 0 && world.buildingIdxAt(x, y) === inside) { ctx.fillStyle = tileColor(t === T.WALL_BROKEN ? T.FLOOR : t); ctx.fillRect(c * ts, r * ts, ts, ts); }
        if (t === T.TREE) SP.draw(ctx, hash2(7, x, y) < 0.45 ? 'pine' : 'tree', c * ts, r * ts, ts);
        else if (t === T.WALL_BROKEN) { ctx.fillStyle = tileColor(T.FLOOR); ctx.fillRect(c * ts, r * ts, ts, ts); SP.draw(ctx, 'rubble', c * ts, r * ts, ts); }
      }
      for (const ch of chunksInView) for (const d of ch.decor) {
        const c = d.x - ox, r = d.y - oy; if (c < -1 || r < -2 || c > cols || r > rows) continue;
        if (d.kind === 'water_tower') SP.drawRotated(ctx, 'water_tower', c * ts + ts / 2, r * ts, ts * 3, 0);
        else SP.draw(ctx, d.kind, c * ts, r * ts, ts);
      }

      // 5. Buildings: roofs, or the interior cutaway for the one you are in.
      const blds = list.filter(i => place.feats[i].k === 'b');
      const smokeSources = [];
      ctx.save();
      ctx.setTransform(ts, 0, 0, ts, -ox * ts, -oy * ts);
      ctx.lineJoin = 'round';
      for (const i of blds) {
        const f = place.feats[i], lay = world.buildingLayout(i), p = this.path(game, i);
        if (i === inside) {
          this.drawInterior(game, i, f, p, ox, oy, ts, W, H, cols, rows);
          continue;
        }
        const pal = ROOF[f.rf] || ROOF.pitched;
        let col = lay.burnt ? '#2a2520' : pal[Math.floor(hash2(3, i, 0) * pal.length)];
        if (snow > 0.05 && !lay.burning) col = lerpColor(col, '#dfe3e8', snow * (f.rf === 'flat' ? 0.85 : 0.7));
        ctx.fillStyle = col; ctx.fill(p);
        const [bx0, by0, bx1, by1] = f.b, bw = bx1 - bx0, bh = by1 - by0, mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
        if (!lay.burnt && snow < 0.5) {
          ctx.save(); ctx.clip(p);
          if (f.rf === 'pitched' || f.rf === 'shed') {
            // Ridge along the long axis plus shingle lines perpendicular to it.
            const horiz = bw >= bh;
            ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.08; ctx.beginPath();
            if (horiz) for (let x = bx0; x <= bx1; x += 0.7) { ctx.moveTo(x, by0); ctx.lineTo(x, by1); }
            else for (let y = by0; y <= by1; y += 0.7) { ctx.moveTo(bx0, y); ctx.lineTo(bx1, y); }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 0.06; ctx.beginPath();
            if (horiz) for (let y = by0; y <= by1; y += 0.5) { ctx.moveTo(bx0, y); ctx.lineTo(bx1, y); }
            else for (let x = bx0; x <= bx1; x += 0.5) { ctx.moveTo(x, by0); ctx.lineTo(x, by1); }
            ctx.stroke();
            if (f.rf === 'pitched') {
              ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.35; ctx.beginPath();
              if (horiz) { ctx.moveTo(bx0 + bh * 0.4, my); ctx.lineTo(bx1 - bh * 0.4, my); } else { ctx.moveTo(mx, by0 + bw * 0.4); ctx.lineTo(mx, by1 - bw * 0.4); }
              ctx.stroke();
              ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath();
              if (horiz) ctx.rect(bx0, my, bw, bh); else ctx.rect(mx, by0, bw, bh);
              ctx.fill();
            }
          } else {
            ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 0.07; ctx.beginPath();
            for (let x = bx0; x <= bx1; x += 1.5) { ctx.moveTo(x, by0); ctx.lineTo(x, by1); }
            for (let y = by0; y <= by1; y += 1.5) { ctx.moveTo(bx0, y); ctx.lineTo(bx1, y); }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.rect(bx0 + 0.6, by0 + 0.6, bw - 1.2, bh - 1.2); ctx.stroke();
          }
          ctx.restore();
        }
        ctx.strokeStyle = lay.burnt ? '#141210' : '#2b2420'; ctx.lineWidth = 0.35; ctx.stroke(p);
        if (lay.burning) smokeSources.push([mx, my, bw]);
        // Rooftop detail and landmarks (drawn in pixel space).
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        const sx = (mx - ox) * ts, sy = (my - oy) * ts;
        if (f.rf === 'flat' && lay.floorCount > 150 && !lay.burnt) {
          const n = Math.min(4, 1 + Math.floor(lay.floorCount / 400));
          for (let k = 0; k < n; k++) {
            const hx = bx0 + 2 + hash2(5, i, k) * Math.max(1, bw - 5), hy = by0 + 2 + hash2(6, i, k) * Math.max(1, bh - 5);
            if (global.OSM.pointInPoly(hx + 0.5, hy + 0.5, f.p)) SP.draw(ctx, 'hvac', (hx - ox) * ts, (hy - oy) * ts, ts * 1.4);
          }
        }
        if (f.lm === 'church') SP.drawRotated(ctx, 'steeple', sx, sy - ts * 1.2, ts * 2.2, 0);
        else if (f.lm === 'hospital') { ctx.fillStyle = '#f2f2ee'; ctx.beginPath(); ctx.arc(sx, sy, ts * 1.3, 0, 6.3); ctx.fill(); ctx.fillStyle = '#c43a2e'; ctx.font = 'bold ' + Math.floor(ts * 1.6) + 'px sans-serif'; ctx.fillText('H', sx, sy + 1); }
        else if (f.lm === 'school' || f.lm === 'townhall' || f.lm === 'police' || f.lm === 'fire' || f.lm === 'library') SP.draw(ctx, 'flag', sx - ts * 0.9, sy - ts * 2, ts * 1.8);
        else if (f.lm === 'arena' && !lay.burnt) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.beginPath();
          const horiz = bw >= bh, n = 7;
          for (let k = 1; k < n; k++) { const t = k / n; if (horiz) { const yy = (by0 + bh * t - oy) * ts; ctx.moveTo((bx0 - ox) * ts, yy); ctx.lineTo((bx1 - ox) * ts, yy); } else { const xx = (bx0 + bw * t - ox) * ts; ctx.moveTo(xx, (by0 - oy) * ts); ctx.lineTo(xx, (by1 - oy) * ts); } }
          ctx.stroke();
        }
        const label = f.lm && f.n ? f.n : (f.n && lay.floorCount > 500 ? f.n : (f.lm && f.lm !== 'fuel' && f.lm !== 'bigbox' ? LANDMARK_LABEL[f.lm] : null));
        if (label && bw * ts > 60) {
          const size = Math.max(10, Math.min(16, Math.floor(ts * 0.55)));
          ctx.font = 'bold ' + size + 'px sans-serif';
          const txt = label.length > 28 ? label.slice(0, 26) + '…' : label;
          const yy = sy + (f.lm === 'church' ? ts * 1.6 : f.lm ? ts * 0.9 : 0);
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(txt, sx, yy);
          ctx.fillStyle = '#f0e8d8'; ctx.fillText(txt, sx, yy);
        }
        ctx.restore();
      }
      // Doors and windows, rotated to lie along the wall they are set in, facing outward.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = ox + c, y = oy + r, t = world.tileAt(x, y);
        if (!SPRITE_TILES[t] || t === T.WALL_BROKEN) continue;
        const bi = world.buildingIdxAt(x, y); if (bi < 0) continue;
        SP.drawRotated(ctx, SPRITE_TILES[t], c * ts + ts / 2, r * ts + ts / 2, ts, this.wallAngle(game, bi, x, y));
      }
      ctx.restore();

      // 6. Cars.
      for (const ch of chunksInView) for (const car of ch.cars) {
        const sx = (car.fx - ox) * ts, sy = (car.fy - oy) * ts;
        if (sx < -2 * ts || sy < -2 * ts || sx > W + 2 * ts || sy > H + 2 * ts) continue;
        SP.drawRotated(ctx, car.kind === 'wreck' ? 'wreck_top' : 'car_top' + CAR_VARIANTS[car.color % CAR_VARIANTS.length], sx, sy, ts, car.a + Math.PI / 2, car.opened ? 0.75 : 1);
      }

      // 7. Containers, zombies, player (only within sight).
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = ox + c, y = oy + r;
        if (!game.visible(x, y)) continue;
        const k = world.containerAt(x, y);
        if (!k || k.car) continue;
        if (!SP.draw(ctx, k.kind, c * ts, r * ts, ts, k.opened ? 0.45 : 1)) {
          ctx.font = Math.floor(ts * 0.8) + 'px monospace'; ctx.fillStyle = k.opened ? '#6f6a60' : '#f2d27a';
          ctx.fillText(CONTAINER_GLYPH[k.kind] || '?', c * ts + ts / 2, r * ts + ts / 2 + 1);
        }
      }
      for (const z of game.zombies) {
        const c = z.x - ox, r = z.y - oy;
        if (c < 0 || r < 0 || c >= cols || r >= rows || !game.visible(z.x, z.y)) continue;
        SP.draw(ctx, z.alert ? 'zombie_alert' : 'zombie', c * ts, r * ts, ts);
      }
      ctx.drawImage(SP.avatar(game.player.avatar), (px - ox) * ts, (py - oy) * ts, ts, ts);

      // 8. Shot tracer.
      const shot = game.lastShot;
      if (shot && shot.turn === game.turn) {
        ctx.strokeStyle = shot.hit ? '#ffd166' : '#d8d2b8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo((shot.x0 - ox) * ts + ts / 2, (shot.y0 - oy) * ts + ts / 2); ctx.lineTo((shot.x1 - ox) * ts + ts / 2, (shot.y1 - oy) * ts + ts / 2); ctx.stroke();
      }

      // 9. Smoke from burning buildings (animated).
      if (smokeSources.length) {
        this.animated = true;
        for (const [mx, my, bw] of smokeSources) {
          const sx = (mx - ox) * ts, sy = (my - oy) * ts;
          for (let k = 0; k < 14; k++) {
            const life = ((now / 1400) + k * 0.37) % 1;
            const drift = Math.sin(k * 1.7 + now / 900) * ts * 0.8 + k * 1.5;
            const rad = ts * (0.5 + life * 1.8) * Math.min(1, bw / 10 + 0.4);
            ctx.fillStyle = 'rgba(40,38,36,' + (0.45 * (1 - life)) + ')';
            ctx.beginPath(); ctx.arc(sx + drift * (0.5 + life), sy - life * ts * 7 - k * 2, rad, 0, 6.3); ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,120,30,' + (0.25 + 0.15 * Math.sin(now / 120)) + ')'; ctx.beginPath(); ctx.arc(sx, sy, ts * 0.9, 0, 6.3); ctx.fill();
        }
      }

      // 10. Weather.
      if (weather === 'rain') {
        ctx.strokeStyle = 'rgba(180,200,230,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
        const n = 260, t = now / 1000;
        for (let k = 0; k < n; k++) {
          const x = ((k * 97.3 + t * 260 * (0.6 + (k % 5) * 0.1)) % (W + 60)) - 30, y = ((k * 53.7 + t * 900 * (0.7 + (k % 7) * 0.08)) % (H + 60)) - 30;
          ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(60,70,90,0.18)'; ctx.fillRect(0, 0, W, H);
      } else if (weather === 'snow') {
        ctx.fillStyle = 'rgba(240,244,250,0.85)';
        const n = 220, t = now / 1000;
        for (let k = 0; k < n; k++) {
          const x = ((k * 131.1 + Math.sin(t * 0.8 + k) * 25 + t * 12) % (W + 40)) - 20, y = ((k * 71.3 + t * (45 + (k % 6) * 12)) % (H + 40)) - 20;
          ctx.beginPath(); ctx.arc(x, y, 1.2 + (k % 3) * 0.6, 0, 6.3); ctx.fill();
        }
        ctx.fillStyle = 'rgba(200,210,225,0.10)'; ctx.fillRect(0, 0, W, H);
      } else if (weather === 'overcast') {
        ctx.fillStyle = 'rgba(120,125,135,0.12)'; ctx.fillRect(0, 0, W, H);
      }
      if (weather === 'fog') {
        const cxp = (px - ox) * ts + ts / 2, cyp = (py - oy) * ts + ts / 2;
        const g = ctx.createRadialGradient(cxp, cyp, ts * 3, cxp, cyp, ts * 15);
        g.addColorStop(0, 'rgba(200,205,210,0)'); g.addColorStop(1, 'rgba(200,205,210,0.75)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      // 10a. Low health: the edges of the screen go orange at half, deepening to red as it falls.
      const pct = game.player.hp / (game.player.hpMax || 100);
      if (pct < 0.5 && game.player.hp > 0) {
        const t = Math.min(1, (0.5 - pct) / 0.5);
        const r = 255, gch = Math.round(140 * (1 - t)), bch = 0;
        const eg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.42 - 0.12 * t), W / 2, H / 2, Math.max(W, H) * 0.72);
        eg.addColorStop(0, 'rgba(' + r + ',' + gch + ',' + bch + ',0)'); eg.addColorStop(1, 'rgba(' + r + ',' + gch + ',' + bch + ',' + (0.35 + 0.45 * t) + ')');
        ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
      }

      // 10b. Red flash when you have just been hurt, fading out over a third of a second.
      const hurtAge = game.hurtTime ? Date.now() - game.hurtTime : Infinity;
      if (hurtAge < 350) {
        const k = 1 - hurtAge / 350, strength = Math.min(1, 0.5 + (game.hurtAmount || 1) / 12);
        ctx.fillStyle = 'rgba(200,20,20,' + (0.22 * k * strength) + ')'; ctx.fillRect(0, 0, W, H);
        const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
        rg.addColorStop(0, 'rgba(180,0,0,0)'); rg.addColorStop(1, 'rgba(180,0,0,' + (0.6 * k * strength) + ')');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
        this.animated = true;
      }

      // 11. Time-of-day grading and a soft vignette.
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = lightAt(game.hour(), game.sun()); ctx.fillRect(0, 0, W, H); ctx.restore();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

      // 12. At night, dim everything outside your sight with a soft edge (a tile-resolution mask scaled up with
      // smoothing). By day there is no dimming at all; loot and zombies are still only drawn within sight.
      const nightness = game.nightness();
      if (nightness > 0.02 && (!this.mask || this.mask.width !== cols || this.mask.height !== rows)) { this.mask = document.createElement('canvas'); this.mask.width = cols; this.mask.height = rows; }
      if (nightness > 0.02) {
        const mctx = this.mask.getContext('2d'), mimg = mctx.createImageData(cols, rows), a = Math.round(140 * nightness);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = (r * cols + c) * 4; mimg.data[i] = 5; mimg.data[i + 1] = 6; mimg.data[i + 2] = 14; mimg.data[i + 3] = game.visible(ox + c, oy + r) ? 0 : a; }
        mctx.putImageData(mimg, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.mask, 0, 0, cols, rows, -ts / 2, -ts / 2, cols * ts, rows * ts);
        ctx.imageSmoothingEnabled = false;
      }

      if (!world.inData(px, py)) { ctx.fillStyle = '#ccc'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Past the edge of the map. The country out here is made up.', 12, H - 14); }
      this.drawSidebar(game);
    }

    drawSidebar(game) {
      const p = game.player, w = game.weapon(), SP = global.Sprites;
      const bar = (v, color) => `<div class="bar"><div style="width:${v}%;background:${color}"></div></div>`;
      const b = game.world.buildingAt(p.x, p.y);
      let where = 'Out in the open';
      if (b) where = (b.n ? b.n + ' · ' : '') + (USE_LABEL[b.u] || b.u);
      else {
        const near = nearestNamed(game, p.x, p.y);
        if (near) where = 'Near ' + near;
      }
      const h = game.hour(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      const temp = game.live && typeof game.live.temp === 'number' ? ' · ' + Math.round(game.live.temp) + '°' : '';
      const timeStr = `Day ${game.day()} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${game.phase()} · ${game.weatherName()}${temp}`;
      let inv = '';
      p.inv.forEach((id, i) => {
        const it = ITEMS[id];
        const wield = p.weapon === id && it.cat === 'weapon' ? ' <span class="muted">(wielded)</span>' : (it.ranged ? ` <span class="muted">(range ${it.range})</span>` : '');
        inv += `<div class="item cat-${it.cat}"><span class="key">${String.fromCharCode(97 + i)}</span> ${it.name}${wield}</div>`;
      });
      if (!p.inv.length) inv = '<div class="muted">Nothing in it</div>';
      const msgs = game.msgs.slice(-9).map((m, i, a) => `<div class="${i === a.length - 1 ? 'latest' : ''}">${escapeHtml(m.s)}</div>`).join('');
      this.sidebar.innerHTML = `
        <div class="place">${escapeHtml(game.place.name.split(',').slice(0, 2).join(','))}</div>
        <div class="time"><img class="avatar" src="${SP.avatarDataUrl(game.player.avatar)}" alt=""> ${escapeHtml(game.className())} · ${timeStr}</div>
        <div class="where">${escapeHtml(where)}</div>
        <div class="stat"><span>Body</span>${bar(100 * p.hp / (p.hpMax || 100), p.hp > 40 ? '#5fbf6a' : '#d44')}<span class="num">${p.hp}</span></div>
        <div class="stat"><span>Food</span>${bar(p.hunger, p.hunger > 25 ? '#d9a441' : '#d44')}<span class="num">${p.hunger}</span></div>
        <div class="stat"><span>Water</span>${bar(p.thirst, p.thirst > 25 ? '#5a9bd8' : '#d44')}<span class="num">${p.thirst}</span></div>
        <div class="weapon">In hand: <b>${w.name}</b> <span class="muted">(dmg ${w.dmg}${w.ranged ? ', range ' + w.range + ', ' + (p.ammo[w.ammo] || 0) + ' ' + ITEMS[w.ammo].short : ''})</span> · Put down: ${p.kills}</div>
        <div class="muted">Rounds: ${Object.entries(p.ammo || {}).filter(([, n]) => n > 0).map(([id, n]) => n + ' ' + ITEMS[id].short).join(' · ') || 'none'}</div>
        <div class="section">Pack <span class="muted">(${p.inv.length}/16)</span></div>
        <div class="muted">u and a letter uses it. d and a letter leaves it.</div>
        <div class="inv">${inv}</div>
        <div class="section">What happened</div>
        <div class="log">${msgs}</div>
        <div class="help muted">move: arrows / numpad · u use · g search beside you · F+dir fire · c+dir shut door · . wait · d drop · m map · S save · ? help</div>`;
    }

    drawMap(game) {
      const W = this.canvas.width, H = this.canvas.height, ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const place = game.place;
      if (!this.mapCanvas || this.mapCanvas.placeId !== place.id || this.mapCanvas.width !== W || this.mapCanvas.height !== H) {
        const mc = document.createElement('canvas'); mc.width = W; mc.height = H; mc.placeId = place.id;
        const m = mc.getContext('2d');
        const scale = Math.min((W - 40) / place.w, (H - 40) / place.h);
        const ox = (W - place.w * scale) / 2, oy = (H - place.h * scale) / 2;
        mc.scale = scale; mc.ox = ox; mc.oy = oy;
        m.fillStyle = '#1b2a1a'; m.fillRect(0, 0, W, H);
        m.fillStyle = '#2d4a2b'; m.fillRect(ox, oy, place.w * scale, place.h * scale);
        const poly = (pts) => { m.beginPath(); for (let i = 0; i < pts.length; i += 2) { const X = ox + pts[i] * scale, Y = oy + pts[i + 1] * scale; i ? m.lineTo(X, Y) : m.moveTo(X, Y); } m.closePath(); };
        for (const f of place.feats) if (f.k === 'a') { m.fillStyle = AREA_COLOR[f.t] || '#555'; poly(f.p); m.fill(); }
        m.lineCap = 'round'; m.lineJoin = 'round';
        for (const f of place.feats) if (f.k === 'r') {
          m.strokeStyle = f.t === 'water' ? '#2a5d8f' : f.t === 'path' ? '#6b6452' : f.t === 'rail' ? '#3a3632' : '#5c5c62';
          m.lineWidth = Math.max(0.6, f.w * scale);
          m.beginPath(); for (let i = 0; i < f.p.length; i += 2) { const X = ox + f.p[i] * scale, Y = oy + f.p[i + 1] * scale; i ? m.lineTo(X, Y) : m.moveTo(X, Y); } m.stroke();
        }
        for (const f of place.feats) if (f.k === 'b') { m.fillStyle = USE_COLOR[f.u] || '#aaa'; poly(f.p); m.fill(); }
        this.mapCanvas = mc;
      }
      const mc = this.mapCanvas;
      ctx.drawImage(mc, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      for (const c of game.world.chunks.values()) {
        let n = 0; for (let i = 0; i < c.seen.length; i += 7) n += c.seen[i];
        if (!n) continue;
        const sx = mc.ox + c.x0 * mc.scale, sy = mc.oy + c.y0 * mc.scale, sw = CH * mc.scale;
        ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sw); ctx.clip(); ctx.drawImage(mc, 0, 0); ctx.restore();
      }
      const px = mc.ox + game.player.x * mc.scale, py = mc.oy + game.player.y * mc.scale;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 6, 0, 6.3); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, 6.3); ctx.fill();
      ctx.font = '13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      let ly = 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, 8, 190, 20 * 8 + 10);
      for (const [u, col] of Object.entries(USE_COLOR)) { ctx.fillStyle = col; ctx.fillRect(16, ly + 2, 12, 12); ctx.fillStyle = '#eee'; ctx.fillText(USE_LABEL[u], 36, ly); ly += 20; }
      ctx.fillStyle = '#eee'; ctx.fillText('m or Esc. Back to the road.', 16, ly + 2);
      ctx.textAlign = 'center'; ctx.fillStyle = '#eee'; ctx.font = '15px sans-serif';
      ctx.fillText(game.place.name.split(',').slice(0, 3).join(', ') + ' — ' + Math.round(game.place.w * game.place.tileM / 1000 * 10) / 10 + ' × ' + Math.round(game.place.h * game.place.tileM / 1000 * 10) / 10 + ' km', W / 2, 10);
    }
  }

  function nearestNamed(game, x, y) {
    const cx = Math.floor(x / CH), cy = Math.floor(y / CH);
    let best = null, bd = 60 * 60;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const ids = game.world.index.get((cx + ox) + ',' + (cy + oy)) || [];
      for (const i of ids) {
        const f = game.place.feats[i]; if (!f.n) continue;
        let d;
        if (f.k === 'b') d = ((f.b[0] + f.b[2]) / 2 - x) ** 2 + ((f.b[1] + f.b[3]) / 2 - y) ** 2;
        else { d = Infinity; for (let p = 0; p < f.p.length; p += 2) d = Math.min(d, (f.p[p] - x) ** 2 + (f.p[p + 1] - y) ** 2); if (f.k === 'r') d *= 1.5; }
        if (d < bd) { bd = d; best = f.n; }
      }
    }
    return best;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  global.Renderer = Renderer;
  global.escapeHtml = escapeHtml;
})(typeof window !== 'undefined' ? window : globalThis);
