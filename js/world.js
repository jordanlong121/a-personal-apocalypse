// world.js — chunked tile world generated lazily from compact OSM features (plus noise beyond the data edge).
(function (global) {
  'use strict';

  const CH = 64; // chunk size in tiles

  const T = {
    GRASS: 0, TREE: 1, FARM: 2, WATER: 3, ROAD: 4, PATH: 5, ASPHALT: 6, WALL: 7, FLOOR: 8, DOOR: 9,
    GRAVEL: 10, WETLAND: 11, SAND: 12, SCRUB: 13, LAWN: 14, IWALL: 15, FOREST_FLOOR: 16, BRIDGE: 17,
    DOOR_OPEN: 18, DOOR_BROKEN: 19, WINDOW: 20, WINDOW_BROKEN: 21, WALL_BROKEN: 22, RAIL: 23, CAR: 24, OBJ: 25,
  };
  // DOOR is a closed door: it blocks movement and sight until opened (player) or broken down (zombies).
  // WINDOW blocks movement but not sight; once broken it is a way in. WALL_BROKEN is a hole a horde made.
  const BLOCKS_MOVE = new Set([T.TREE, T.WATER, T.WALL, T.IWALL, T.DOOR, T.WINDOW, T.CAR, T.OBJ]); // OBJ: a container; bump it to search
  const BLOCKS_SIGHT = new Set([T.WALL, T.DOOR]); // only exterior walls and closed doors block sight: no shadows inside buildings
  const AREA_TILE = { water: T.WATER, forest: T.TREE, scrub: T.SCRUB, wetland: T.WETLAND, sand: T.SAND, farm: T.FARM,
    grass: T.GRASS, asphalt: T.ASPHALT, gravel: T.GRAVEL, lawn: T.LAWN };

  // ---- deterministic randomness ---------------------------------------------
  function hash2(seed, x, y) {
    let h = (seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ (x | 0), 0x85EBCA6B); h ^= h >>> 13;
    h = Math.imul(h ^ (y | 0), 0xC2B2AE35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function valueNoise(seed, x, y, scale) {
    const fx = x / scale, fy = y / scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0), c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }

  // ---- geometry rasterization -----------------------------------------------
  // Fill polygon (flat pts) restricted to window [x0,x0+w) x [y0,y0+h); cb(x,y).
  function fillPolygon(pts, x0, y0, w, h, cb) {
    const n = pts.length / 2;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { const y = pts[2 * i + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const ys = Math.max(y0, Math.floor(minY)), ye = Math.min(y0 + h - 1, Math.ceil(maxY));
    const xs = [];
    for (let y = ys; y <= ye; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = pts[2 * i], ay = pts[2 * i + 1], bx = pts[2 * j], by = pts[2 * j + 1];
        if ((ay <= sy) !== (by <= sy)) xs.push(ax + (sy - ay) * (bx - ax) / (by - ay));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.max(x0, Math.ceil(xs[i] - 0.5)), xb = Math.min(x0 + w - 1, Math.floor(xs[i + 1] - 0.5));
        for (let x = xa; x <= xb; x++) cb(x, y);
      }
    }
  }

  // Stamp a thick polyline into the window. cb(x,y).
  function strokePolyline(pts, width, x0, y0, w, h, cb) {
    const r = width / 2, r2 = r * r;
    const n = pts.length / 2;
    for (let i = 0; i + 1 < n; i++) {
      const ax = pts[2 * i], ay = pts[2 * i + 1], bx = pts[2 * i + 2], by = pts[2 * i + 3];
      const minx = Math.max(x0, Math.floor(Math.min(ax, bx) - r)), maxx = Math.min(x0 + w - 1, Math.ceil(Math.max(ax, bx) + r));
      const miny = Math.max(y0, Math.floor(Math.min(ay, by) - r)), maxy = Math.min(y0 + h - 1, Math.ceil(Math.max(ay, by) + r));
      if (minx > maxx || miny > maxy) continue;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-9;
      for (let y = miny; y <= maxy; y++) {
        const py = y + 0.5;
        for (let x = minx; x <= maxx; x++) {
          const px = x + 0.5;
          let t = ((px - ax) * dx + (py - ay) * dy) / len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + t * dx - px, ey = ay + t * dy - py;
          if (ex * ex + ey * ey <= r2) cb(x, y);
        }
      }
    }
  }

  function pointInPoly(x, y, pts) {
    let inside = false; const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // ---- World ----------------------------------------------------------------
  class World {
    constructor(place, seed) {
      this.place = place;
      this.seed = seed >>> 0;
      this.chunks = new Map();
      this.buildingCache = new Map(); // feature index -> interior layout
      this.index = new Map();         // chunk key -> feature indices
      this.buildIndex();
    }

    buildIndex() {
      const feats = this.place.feats;
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const pad = f.k === 'r' ? Math.ceil(f.w / 2) + 1 : 1;
        const cx0 = Math.floor((f.b[0] - pad) / CH), cx1 = Math.floor((f.b[2] + pad) / CH);
        const cy0 = Math.floor((f.b[1] - pad) / CH), cy1 = Math.floor((f.b[3] + pad) / CH);
        if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 4000) continue; // absurdly large feature; skip
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const key = cx + ',' + cy;
          let arr = this.index.get(key);
          if (!arr) { arr = []; this.index.set(key, arr); }
          arr.push(i);
        }
      }
    }

    key(cx, cy) { return cx + ',' + cy; }

    getChunk(cx, cy) {
      const key = this.key(cx, cy);
      let c = this.chunks.get(key);
      if (!c) { c = this.generateChunk(cx, cy); this.chunks.set(key, c); }
      return c;
    }

    tileAt(x, y) {
      const c = this.getChunk(Math.floor(x / CH), Math.floor(y / CH));
      return c.tiles[(y - c.y0) * CH + (x - c.x0)];
    }
    setTile(x, y, t) {
      const c = this.getChunk(Math.floor(x / CH), Math.floor(y / CH));
      c.tiles[(y - c.y0) * CH + (x - c.x0)] = t;
    }
    buildingIdxAt(x, y) {
      const c = this.getChunk(Math.floor(x / CH), Math.floor(y / CH));
      return c.bid[(y - c.y0) * CH + (x - c.x0)];
    }
    // Door tiles of building feature i (exterior doors only).
    buildingDoors(i) {
      const lay = this.buildingLayout(i), out = [];
      for (const [k, t] of lay.cells) if (t === T.DOOR) out.push(k.split(',').map(Number));
      return out;
    }
    // Any exterior wall/window/door tile of building i (what a horde can breach).
    isBarrierOf(x, y, i) {
      if (this.buildingIdxAt(x, y) !== i) return false;
      const t = this.tileAt(x, y);
      return t === T.WALL || t === T.WINDOW || t === T.DOOR;
    }
    buildingAt(x, y) {
      const c = this.getChunk(Math.floor(x / CH), Math.floor(y / CH));
      const b = c.bid[(y - c.y0) * CH + (x - c.x0)];
      return b >= 0 ? this.place.feats[b] : null;
    }
    seen(x, y) {
      const c = this.getChunk(Math.floor(x / CH), Math.floor(y / CH));
      return c.seen[(y - c.y0) * CH + (x - c.x0)];
    }
    markSeen(x, y) {
      const c = this.getChunk(Math.floor(x / CH), Math.floor(y / CH));
      c.seen[(y - c.y0) * CH + (x - c.x0)] = 1;
    }
    containerAt(x, y) {
      const c = this.getChunk(Math.floor(x / CH), Math.floor(y / CH));
      return c.containers.find(k => k.x === x && k.y === y) || null;
    }
    passable(x, y) { return !BLOCKS_MOVE.has(this.tileAt(x, y)); }
    opaque(x, y) { return BLOCKS_SIGHT.has(this.tileAt(x, y)); }
    inData(x, y) { return x >= 0 && y >= 0 && x < this.place.w && y < this.place.h; }

    generateChunk(cx, cy) {
      const x0 = cx * CH, y0 = cy * CH;
      const tiles = new Uint8Array(CH * CH);
      const bid = new Int32Array(CH * CH).fill(-1);
      const seen = new Uint8Array(CH * CH);
      const seed = this.seed;
      const feats = this.place.feats;
      const W = this.place.w, H = this.place.h;

      // 1. Base ground (noise outside the data, lawn/grass inside).
      for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
        const wx = x0 + x, wy = y0 + y;
        let t;
        if (wx < 0 || wy < 0 || wx >= W || wy >= H) {
          const n = valueNoise(seed, wx, wy, 48) * 0.7 + valueNoise(seed + 7, wx, wy, 12) * 0.3;
          if (n < 0.42) t = hash2(seed + 3, wx, wy) < 0.8 ? T.TREE : T.FOREST_FLOOR;
          else if (n < 0.47) t = T.SCRUB;
          else if (n > 0.66) t = T.FARM;
          else t = T.GRASS;
        } else {
          t = T.GRASS;
        }
        tiles[y * CH + x] = t;
      }

      const ids = this.index.get(this.key(cx, cy)) || [];
      const set = (x, y, t) => { tiles[(y - y0) * CH + (x - x0)] = t; };

      // 2. Areas (already sorted large→small).
      for (const i of ids) {
        const f = feats[i]; if (f.k !== 'a') continue;
        const t = AREA_TILE[f.t]; if (t === undefined) continue;
        if (f.t === 'forest') {
          fillPolygon(f.p, x0, y0, CH, CH, (x, y) => set(x, y, hash2(seed + 3, x, y) < 0.78 ? T.TREE : T.FOREST_FLOOR));
        } else if (f.t === 'lawn') {
          fillPolygon(f.p, x0, y0, CH, CH, (x, y) => set(x, y, hash2(seed + 4, x, y) < 0.025 ? T.TREE : T.LAWN));
        } else if (f.t === 'scrub') {
          fillPolygon(f.p, x0, y0, CH, CH, (x, y) => set(x, y, hash2(seed + 5, x, y) < 0.15 ? T.TREE : T.SCRUB));
        } else {
          fillPolygon(f.p, x0, y0, CH, CH, (x, y) => set(x, y, t));
        }
      }

      // 3. Linear features: water first, then paths, then roads (wide roads on top), bridges last.
      const lines = ids.map(i => feats[i]).filter(f => f.k === 'r');
      const order = f => f.t === 'water' ? 0 : f.t === 'path' ? 1 : f.t === 'rail' ? 1.5 : 2 + f.w;
      lines.sort((a, b) => order(a) - order(b));
      for (const f of lines) {
        if (f.br) continue;
        const t = f.t === 'water' ? T.WATER : f.t === 'path' ? T.PATH : f.t === 'rail' ? T.RAIL : T.ROAD;
        strokePolyline(f.p, f.w, x0, y0, CH, CH, (x, y) => {
          const cur = tiles[(y - y0) * CH + (x - x0)];
          if ((t === T.PATH || t === T.RAIL) && (cur === T.ROAD || cur === T.WATER)) return;
          set(x, y, t);
        });
      }
      for (const f of lines) {
        if (!f.br) continue;
        strokePolyline(f.p, f.w, x0, y0, CH, CH, (x, y) => set(x, y, T.BRIDGE));
      }

      // 4. Buildings: raster with a 1-tile margin so walls at chunk edges are correct.
      const M = 1, EW = CH + 2 * M;
      const ext = new Int32Array(EW * EW).fill(-1);
      const blds = ids.filter(i => feats[i].k === 'b');
      for (const i of blds) {
        fillPolygon(feats[i].p, x0 - M, y0 - M, EW, EW, (x, y) => { ext[(y - y0 + M) * EW + (x - x0 + M)] = i; });
      }
      for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
        const ei = (y + M) * EW + (x + M);
        const b = ext[ei]; if (b < 0) continue;
        bid[y * CH + x] = b;
        const edge = ext[ei - 1] !== b || ext[ei + 1] !== b || ext[ei - EW] !== b || ext[ei + EW] !== b;
        tiles[y * CH + x] = edge ? T.WALL : T.FLOOR;
      }
      // Interior layouts (doors, internal walls) — computed once per building, deterministic.
      const containers = [];
      for (const i of blds) {
        const lay = this.buildingLayout(i);
        for (const k of lay.cells.keys()) {
          const [sx, sy] = k.split(',').map(Number);
          if (sx < x0 || sy < y0 || sx >= x0 + CH || sy >= y0 + CH) continue;
          const t = lay.cells.get(k);
          const cur = tiles[(sy - y0) * CH + (sx - x0)];
          if ((t === T.DOOR || t === T.WINDOW) && cur !== T.WALL) continue;   // doors and windows must replace a wall
          if (t === T.IWALL && cur !== T.FLOOR) continue; // interior walls only on floor
          if (t === T.FLOOR && cur !== T.IWALL && cur !== T.FLOOR && cur !== T.WALL) continue;
          set(sx, sy, t);
        }
        // No tree directly outside a door.
        for (const [k, t] of lay.cells) {
          if (t !== T.DOOR) continue;
          const [sx, sy] = k.split(',').map(Number);
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = sx + ox, y = sy + oy;
            if (x < x0 || y < y0 || x >= x0 + CH || y >= y0 + CH) continue;
            if (tiles[(y - y0) * CH + (x - x0)] === T.TREE) set(x, y, T.GRASS);
          }
        }
        for (const c of lay.containers) {
          if (c.x < x0 || c.y < y0 || c.x >= x0 + CH || c.y >= y0 + CH) continue;
          if (tiles[(c.y - y0) * CH + (c.x - x0)] !== T.FLOOR) continue;
          set(c.x, c.y, T.OBJ);
          containers.push({ x: c.x, y: c.y, kind: c.kind, use: c.use, items: null, opened: false, bld: i });
        }
      }

      const decor = [];
      const inChunk = (x, y) => x >= x0 && y >= y0 && x < x0 + CH && y < y0 + CH;
      const tileOf = (x, y) => tiles[(y - y0) * CH + (x - x0)];
      const outdoors = (x, y) => inChunk(x, y) && bid[(y - y0) * CH + (x - x0)] < 0;
      const openGround = (x, y) => outdoors(x, y) && !BLOCKS_MOVE.has(tileOf(x, y));

      // Mapped point features: real trees become trees, the rest become street furniture.
      for (const i of ids) {
        const f = feats[i]; if (f.k !== 'n') continue;
        const x = Math.floor(f.p[0]), y = Math.floor(f.p[1]);
        if (!outdoors(x, y)) continue;
        if (f.t === 'tree') { if (openGround(x, y) && tileOf(x, y) !== T.ROAD) set(x, y, T.TREE); }
        else if (openGround(x, y)) decor.push({ x, y, kind: f.t });
      }

      // Cars and lamps along the roads. A car is two tiles long and blocks movement.
      const cars = [];
      const placeCar = (cxf, cyf, ang, kind, onRoad) => {
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const t1 = [Math.floor(cxf - ux * 0.5), Math.floor(cyf - uy * 0.5)], t2 = [Math.floor(cxf + ux * 0.5), Math.floor(cyf + uy * 0.5)];
        const ts = t1[0] === t2[0] && t1[1] === t2[1] ? [t1] : [t1, t2];
        for (const [x, y] of ts) {
          if (!openGround(x, y)) return false;
          const t = tileOf(x, y);
          if (t === T.PATH || t === T.FARM || t === T.WETLAND || (!onRoad && t === T.ROAD)) return false;
        }
        for (const [x, y] of ts) set(x, y, T.CAR);
        const car = { x: ts[0][0], y: ts[0][1], fx: cxf, fy: cyf, a: ang, kind, use: 'car', car: true, tiles: ts, items: null, opened: false, bld: -1, color: Math.floor(hash2(seed + 41, Math.round(cxf * 3), Math.round(cyf * 3)) * 5) };
        containers.push(car); cars.push(car);
        return true;
      };
      for (const f of lines) {
        if (f.t === 'water' || f.t === 'path' || f.t === 'rail' || f.br) continue;
        const big = f.w >= 8, residential = f.w <= 7 && f.w >= 4;
        const step = big ? 6 : 7;
        let carry = 0;
        for (let i = 0; i + 3 < f.p.length; i += 2) {
          const ax = f.p[i], ay = f.p[i + 1], bx = f.p[i + 2], by = f.p[i + 3];
          const len = Math.hypot(bx - ax, by - ay); if (len < 0.5) continue;
          const ang = Math.atan2(by - ay, bx - ax), nx = -Math.sin(ang), ny = Math.cos(ang);
          for (let d = carry; d <= len; d += step) {
            const px = ax + Math.cos(ang) * d, py = ay + Math.sin(ang) * d;
            if (!inChunk(Math.floor(px), Math.floor(py))) continue;
            const h = hash2(seed + 13, Math.round(px * 2), Math.round(py * 2));
            if (big) {
              // Traffic jams: clustered, some burnt out.
              const jam = valueNoise(seed + 21, px, py, 70);
              if (jam > 0.6 && h < 0.75) {
                const lane = (h < 0.375 ? 1 : -1) * f.w * 0.27;
                const wreck = hash2(seed + 17, Math.round(px), Math.round(py)) < 0.3;
                placeCar(px + nx * lane, py + ny * lane, ang + (wreck ? 0.35 : 0), wreck ? 'wreck' : 'car', true);
              }
            } else if (residential) {
              if (h < 0.22) { const side = hash2(seed + 19, Math.round(px), Math.round(py)) < 0.5 ? 1 : -1; placeCar(px + nx * side * (f.w / 2 + 1.3), py + ny * side * (f.w / 2 + 1.3), ang, 'car', false); }
              else if (h > 0.955 && f.w >= 6) { const side = hash2(seed + 23, Math.round(px), Math.round(py)) < 0.5 ? 1 : -1; const lx = Math.floor(px + nx * side * (f.w / 2 + 0.8)), ly = Math.floor(py + ny * side * (f.w / 2 + 0.8)); if (openGround(lx, ly) && tileOf(lx, ly) !== T.ROAD) decor.push({ x: lx, y: ly, kind: 'lamp' }); }
              else if (h > 0.94 && f.w >= 6) { const side = hash2(seed + 29, Math.round(px), Math.round(py)) < 0.5 ? 1 : -1; const lx = Math.floor(px + nx * side * (f.w / 2 + 1.5)), ly = Math.floor(py + ny * side * (f.w / 2 + 1.5)); if (openGround(lx, ly) && tileOf(lx, ly) !== T.ROAD) decor.push({ x: lx, y: ly, kind: 'hydrant' }); }
            }
          }
          carry = (carry + Math.ceil((len - carry) / step) * step) - len;
        }
      }
      // Bins beside house doors; shopping carts on big parking lots.
      for (const i of blds) {
        const lay = this.buildingLayout(i); if (!lay.door) continue;
        const f = feats[i];
        if (f.u !== 'home' || hash2(seed + 37, i, 1) > 0.55) continue;
        const [dx, dy] = lay.door;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (bid[(dy + oy - y0) * CH + (dx + ox - x0)] === undefined) continue;
          if (!outdoors(dx + ox, dy + oy)) continue;
          const bx = dx + ox + oy, by = dy + oy + ox; // one step sideways from the stoop
          if (openGround(bx, by) && tileOf(bx, by) !== T.ROAD) { decor.push({ x: bx, y: by, kind: 'bin' }); break; }
        }
      }
      for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
        if (tiles[y * CH + x] !== T.ASPHALT || bid[y * CH + x] >= 0) continue;
        if (hash2(seed + 43, x0 + x, y0 + y) < 0.004) decor.push({ x: x0 + x, y: y0 + y, kind: 'cart' });
      }

      return { cx, cy, x0, y0, tiles, bid, seen, containers, decor, cars, spawned: false };
    }

    carAt(x, y) {
      const c = this.getChunk(Math.floor(x / CH), Math.floor(y / CH));
      return c.cars.find(k => k.tiles.some(t => t[0] === x && t[1] === y)) || null;
    }

    // Compute the interior layout for building feature i: exterior door, internal walls with doors, container spots.
    buildingLayout(i) {
      let lay = this.buildingCache.get(i);
      if (lay) return lay;
      const f = this.place.feats[i];
      const [bx0, by0, bx1, by1] = f.b;
      const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
      const inside = new Uint8Array(bw * bh);
      let floorCount = 0;
      fillPolygon(f.p, bx0, by0, bw, bh, (x, y) => { inside[(y - by0) * bw + (x - bx0)] = 1; floorCount++; });
      const isIn = (x, y) => x >= bx0 && y >= by0 && x <= bx1 && y <= by1 && inside[(y - by0) * bw + (x - bx0)] === 1;
      const cells = new Map();
      const containers = [];
      const rng = mulberry32((this.seed ^ Math.imul(i + 1, 2654435761)) >>> 0);

      // Perimeter wall tiles with the outside neighbour direction.
      const perim = [];
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        if (!isIn(x, y)) continue;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) if (!isIn(x + dx, y + dy)) { perim.push({ x, y, dx, dy }); break; }
      }
      if (perim.length === 0) { lay = { cells, containers, door: null }; this.buildingCache.set(i, lay); return lay; }

      // Door: perimeter tile closest to the nearest road vertex (fallback: random).
      const cxm = (bx0 + bx1) / 2, cym = (by0 + by1) / 2;
      let target = null, bd = Infinity;
      const ck = this.key(Math.floor(cxm / CH), Math.floor(cym / CH));
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const ids = this.index.get(this.key(Math.floor(cxm / CH) + ox, Math.floor(cym / CH) + oy)) || [];
        for (const j of ids) {
          const r = this.place.feats[j]; if (r.k !== 'r' || r.t === 'water') continue;
          for (let p = 0; p < r.p.length; p += 2) {
            const d = (r.p[p] - cxm) ** 2 + (r.p[p + 1] - cym) ** 2;
            if (d < bd) { bd = d; target = [r.p[p], r.p[p + 1]]; }
          }
        }
      }
      void ck;
      // Neighbouring buildings (attached garages, row houses): a door must not open into one.
      const nearBlds = [];
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const ids = this.index.get(this.key(Math.floor(cxm / CH) + ox, Math.floor(cym / CH) + oy)) || [];
        for (const j of ids) if (j !== i && this.place.feats[j].k === 'b') nearBlds.push(this.place.feats[j]);
      }
      const inOther = (x, y) => {
        const px = x + 0.5, py = y + 0.5;
        for (const o of nearBlds) if (px >= o.b[0] && px <= o.b[2] + 1 && py >= o.b[1] && py <= o.b[3] + 1 && pointInPoly(px, py, o.p)) return true;
        return false;
      };
      const isFloorBehind = (p) => isIn(p.x - p.dx, p.y - p.dy) && isIn(p.x - p.dx + 1, p.y - p.dy) && isIn(p.x - p.dx - 1, p.y - p.dy) && isIn(p.x - p.dx, p.y - p.dy + 1) && isIn(p.x - p.dx, p.y - p.dy - 1);
      let cands = perim.filter(p => isFloorBehind(p) && !inOther(p.x + p.dx, p.y + p.dy));
      if (!cands.length) cands = perim.filter(p => isIn(p.x - p.dx, p.y - p.dy) && !inOther(p.x + p.dx, p.y + p.dy));
      if (!cands.length) cands = perim.filter(p => isIn(p.x - p.dx, p.y - p.dy));
      if (!cands.length) cands = perim;
      let door = null;
      if (target) {
        let best = Infinity;
        for (const p of cands) {
          const d = (p.x - target[0]) ** 2 + (p.y - target[1]) ** 2;
          if (d < best) { best = d; door = p; }
        }
      }
      if (!door) door = cands[Math.floor(rng() * cands.length)];
      const farDoor = (from) => {
        let far = null, fd = -1;
        for (const p of cands) { const d = (p.x - from.x) ** 2 + (p.y - from.y) ** 2; if (d > fd) { fd = d; far = p; } }
        return far;
      };
      cells.set(door.x + ',' + door.y, T.DOOR);
      // Large buildings get a second door on the far side.
      if (floorCount > 300) {
        const far = farDoor(door);
        if (far) { cells.set(far.x + ',' + far.y, T.DOOR); cells.set((far.x - far.dx) + ',' + (far.y - far.dy), T.FLOOR); }
      }

      // Interior walls via BSP on the bounding box, clipped to interior floor (not the perimeter ring).
      const isFloor = (x, y) => isIn(x, y) && isIn(x + 1, y) && isIn(x - 1, y) && isIn(x, y + 1) && isIn(x, y - 1);
      const walls = [];
      if (floorCount >= 36) {
        const minRoom = floorCount > 400 ? 8 : 4;
        const split = (x0, y0, x1, y1, depth) => {
          const w = x1 - x0 + 1, h = y1 - y0 + 1;
          if (depth > 5 || (w < minRoom * 2 + 1 && h < minRoom * 2 + 1)) return;
          if (floorCount > 400 && rng() < 0.3 && depth > 1) return; // big boxes keep open halls
          const vertical = w > h ? true : h > w ? false : rng() < 0.5;
          if (vertical) {
            if (w < minRoom * 2 + 1) return;
            const sx = x0 + minRoom + Math.floor(rng() * (w - 2 * minRoom));
            walls.push({ v: true, at: sx, a: y0, b: y1 });
            split(x0, y0, sx - 1, y1, depth + 1); split(sx + 1, y0, x1, y1, depth + 1);
          } else {
            if (h < minRoom * 2 + 1) return;
            const sy = y0 + minRoom + Math.floor(rng() * (h - 2 * minRoom));
            walls.push({ v: false, at: sy, a: x0, b: x1 });
            split(x0, y0, x1, sy - 1, depth + 1); split(x0, sy + 1, x1, y1, depth + 1);
          }
        };
        split(bx0 + 1, by0 + 1, bx1 - 1, by1 - 1, 0);
      }
      for (const wl of walls) {
        const seg = [];
        for (let k = wl.a; k <= wl.b; k++) {
          const x = wl.v ? wl.at : k, y = wl.v ? k : wl.at;
          if (isFloor(x, y)) seg.push([x, y]);
        }
        if (seg.length < 2) continue;
        for (const [x, y] of seg) cells.set(x + ',' + y, T.IWALL);
        // A doorway somewhere along the segment where both sides are floor; avoid the ends.
        const mid = seg.filter(([x, y]) => wl.v ? (isFloor(x - 1, y) && isFloor(x + 1, y)) : (isFloor(x, y - 1) && isFloor(x, y + 1)));
        const pick = mid.length ? mid[Math.floor(rng() * mid.length)] : seg[Math.floor(seg.length / 2)];
        cells.set(pick[0] + ',' + pick[1], T.FLOOR);
        // Never wall off the exterior door: keep the tile just inside the door open.
      }
      cells.set((door.x - door.dx) + ',' + (door.y - door.dy), T.FLOOR);

      // Windows along exterior walls (not on sheds, not beside doors), roughly every fourth wall tile.
      if (floorCount >= 16) {
        for (const p of perim) {
          if (cells.has(p.x + ',' + p.y)) continue;
          if (Math.abs(p.x - door.x) + Math.abs(p.y - door.y) <= 2) continue;
          if (!isFloor(p.x - p.dx, p.y - p.dy)) continue;
          if (((p.x * 7 + p.y * 3) & 3) !== 0 || rng() > 0.85) continue;
          cells.set(p.x + ',' + p.y, T.WINDOW);
        }
      }

      // Containers: along interior floor, count scales with area and loot class.
      const kindsByUse = {
        home: ['fridge', 'cupboard', 'closet', 'dresser', 'cupboard'],
        food: ['shelf', 'fridge', 'shelf', 'freezer', 'shelf'],
        medical: ['cabinet', 'cabinet', 'desk', 'shelf'],
        tools: ['toolbox', 'shelf', 'crate', 'locker'],
        weapons: ['locker', 'locker', 'desk', 'crate'],
        fuel: ['shelf', 'fridge', 'toolbox'],
        office: ['desk', 'desk', 'cupboard', 'cabinet'],
      };
      const kinds = kindsByUse[f.u] || kindsByUse.home;
      const want = Math.max(1, Math.min(14, Math.round(floorCount / 22)));
      const spots = [];
      for (let y = by0 + 1; y < by1; y++) for (let x = bx0 + 1; x < bx1; x++) {
        if (!isIn(x, y)) continue;
        const k = x + ',' + y; if (cells.has(k)) continue;
        if (Math.abs(x - door.x) + Math.abs(y - door.y) <= 1) continue;
        // prefer spots against a wall
        const nearWall = !isFloor(x + 1, y) || !isFloor(x - 1, y) || !isFloor(x, y + 1) || !isFloor(x, y - 1) ||
          cells.get((x + 1) + ',' + y) === T.IWALL || cells.get((x - 1) + ',' + y) === T.IWALL ||
          cells.get(x + ',' + (y + 1)) === T.IWALL || cells.get(x + ',' + (y - 1)) === T.IWALL;
        if (nearWall) spots.push([x, y]);
      }
      const taken = new Set();
      for (let n = 0; n < want && spots.length; n++) {
        const idx = Math.floor(rng() * spots.length);
        const [x, y] = spots.splice(idx, 1)[0];
        if (taken.has((x + 1) + ',' + y) || taken.has((x - 1) + ',' + y) || taken.has(x + ',' + (y + 1)) || taken.has(x + ',' + (y - 1))) continue;
        taken.add(x + ',' + y);
        containers.push({ x, y, kind: kinds[Math.floor(rng() * kinds.length)], use: f.u });
      }

      const fire = hash2(this.seed + 31, i, 7);
      lay = { cells, containers, door: [door.x, door.y], floorCount, burnt: fire < 0.03, burning: fire < 0.008 };
      this.buildingCache.set(i, lay);
      return lay;
    }
  }

  global.World = World;
  global.T = T;
  global.CH = CH;
  global.WorldUtil = { hash2, mulberry32, valueNoise, fillPolygon, strokePolyline, BLOCKS_MOVE, BLOCKS_SIGHT };
})(typeof window !== 'undefined' ? window : globalThis);
