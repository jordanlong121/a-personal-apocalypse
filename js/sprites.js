// sprites.js — tiny embedded pixel-art sprites (12×12). No image files; each sprite is a palette plus rows of
// characters, rendered once to an offscreen canvas and scaled up with smoothing off.
(function (global) {
  'use strict';
  const S = 12;

  // Shared palette letters. '.' is transparent. Per-sprite palettes may add or override.
  const BASE = {
    k: '#1b1b1f', // outline / black
    w: '#f2f2ee', // white
    W: '#c9c9c4', // off-white shade
    g: '#8d8f93', // grey metal
    G: '#5f6166', // dark grey
    b: '#8a5a32', // wood
    B: '#5e3b1e', // dark wood
    y: '#d9b24a', // brass / yellow
    r: '#c43a2e', // red
    R: '#7d1f18', // dark red
    u: '#3f6fb5', // blue
    U: '#24456f', // dark blue
    n: '#e8b894', // skin
    N: '#b8886a', // skin shade
    h: '#3a2a1e', // hair
    j: '#4f6b3a', // jacket green
    J: '#334a26', // jacket shade
    p: '#3b4a6b', // pants
    z: '#8fae6e', // zombie skin
    Z: '#5f7d45', // zombie skin shade
    t: '#6b4a4a', // torn shirt
    o: '#e07a2a', // orange
    O: '#c8782f', // door wood (bright, reads against dark walls)
    a: '#5e5248', // wall
    i: '#9fd3e8', // glass
    I: '#5a8aa5', // glass shade
    m: '#3b3b40', // metal dark
    M: '#6c6c72', // metal light
    x: '#2a2a2a', // charred
    X: '#4a4038', // charred brown
    e: '#2f6b2a', // leaf
    E: '#1e4a1c', // leaf dark
    c: '#5fbf6a', // light green
    l: '#f6e7a1', // light / paper
  };

  const DEF = {
    player: [
      '....hhhh....',
      '...hhhhhh...',
      '...hnnnnh...',
      '...nkn nkn..',
      '....nnnn....',
      '..BjjjjjjB..',
      '.nBjjJJjjBn.',
      '..jjjjjjjj..',
      '..jJjjjjJj..',
      '...pp..pp...',
      '...pp..pp...',
      '...kk..kk...',
    ],
    zombie: [
      '....hhhh....',
      '...hhhhhh...',
      '...zzzzzz...',
      '...zRzzRz...',
      '....zZzz....',
      '..tttttttt..',
      'zzzttZttt.zz',
      '..ttt.tttt..',
      '..tZttttZt..',
      '...GG..GG...',
      '...GG..GG...',
      '...kk..kk...',
    ],
    zombie_alert: [
      '....hhhh....',
      '...hhhhhh...',
      '...zzzzzz...',
      '...zrzzrz...',
      '....zZzz....',
      '..tttttttt..',
      'zzzttZttt.zz',
      '..ttt.tttt..',
      '..tZttttZt..',
      '...GG..GG...',
      '...GG..GG...',
      '...kk..kk...',
    ],
    fridge: [
      '..kkkkkkkk..',
      '..kwwwwwwk..',
      '..kwwwwwGk..',
      '..kwwwwwGk..',
      '..kkkkkkkk..',
      '..kwwwwwwk..',
      '..kwwwwwGk..',
      '..kwwwwwGk..',
      '..kwwwwwGk..',
      '..kwwwwwwk..',
      '..kkkkkkkk..',
      '...k....k...',
    ],
    freezer: [
      '............',
      '............',
      '.kkkkkkkkkk.',
      '.kWWWWWWWWk.',
      '.kkkkkkkkkk.',
      '.kwwwwwwwwk.',
      '.kwwwwGwwwk.',
      '.kwwwwwwwwk.',
      '.kwwwwwwwwk.',
      '.kwwwwwwwwk.',
      '.kkkkkkkkkk.',
      '............',
    ],
    cupboard: [
      '.kkkkkkkkkk.',
      '.kbbbbbbbbk.',
      '.kbbbbbbbbk.',
      '.kbbbykybbk.',
      '.kbbbbbbbbk.',
      '.kBBBBBBBBk.',
      '.kbbbbbbbbk.',
      '.kbbbbbbbbk.',
      '.kbbbykybbk.',
      '.kbbbbbbbbk.',
      '.kbbbbbbbbk.',
      '.kkkkkkkkkk.',
    ],
    closet: [
      '..kkkkkkkk..',
      '..kbbbkbbbk.',
      '..kbbbkbbbk.',
      '..kbbbkbbbk.',
      '..kbbykybbk.',
      '..kbbbkbbbk.',
      '..kbbbkbbbk.',
      '..kbbbkbbbk.',
      '..kbbbkbbbk.',
      '..kbbbkbbbk.',
      '..kkkkkkkkk.',
      '...k.....k..',
    ],
    dresser: [
      '............',
      '............',
      '.kkkkkkkkkk.',
      '.kbbbbbbbbk.',
      '.kBBBByBBBk.',
      '.kbbbbbbbbk.',
      '.kBBBByBBBk.',
      '.kbbbbbbbbk.',
      '.kBBBByBBBk.',
      '.kbbbbbbbbk.',
      '.kkkkkkkkkk.',
      '..k......k..',
    ],
    shelf: [
      '.GGGGGGGGGG.',
      '.G.r.u.y.o.G',
      '.G.r.u.y.o.G',
      '.GGGGGGGGGG.',
      '.G.c.l.r.u.G',
      '.G.c.l.r.u.G',
      '.GGGGGGGGGG.',
      '.G.y.o.c.l.G',
      '.G.y.o.c.l.G',
      '.GGGGGGGGGG.',
      '.G........G.',
      '.G........G.',
    ],
    cabinet: [
      '............',
      '.kkkkkkkkkk.',
      '.kwwwwwwwwk.',
      '.kwwwrrwwwk.',
      '.kwwrrrrwwk.',
      '.kwwrrrrwwk.',
      '.kwwwrrwwwk.',
      '.kwwwwwwwwk.',
      '.kwwwwwGwwk.',
      '.kwwwwwwwwk.',
      '.kkkkkkkkkk.',
      '............',
    ],
    desk: [
      '............',
      '.......y....',
      '......yyy...',
      '.ll....y....',
      '.lll...y....',
      'kkkkkkkkkkkk',
      'kbbbbbbbbbbk',
      'kBBBBBBBBBBk',
      '.kb......bk.',
      '.kb......bk.',
      '.kb......bk.',
      '.kk......kk.',
    ],
    toolbox: [
      '............',
      '............',
      '....kkkk....',
      '...k....k...',
      '.kkkkkkkkkk.',
      '.krrrrrrrrk.',
      '.krrrrrrrrk.',
      '.kkkkkkkkkk.',
      '.kRRRRRRRRk.',
      '.kRRRRRRRRk.',
      '.kRRRRRRRRk.',
      '.kkkkkkkkkk.',
    ],
    crate: [
      '............',
      '.kkkkkkkkkk.',
      '.kBbbbbbbBk.',
      '.kbBbbbbBbk.',
      '.kbbBbbBbbk.',
      '.kbbbBBbbbk.',
      '.kbbbBBbbbk.',
      '.kbbBbbBbbk.',
      '.kbBbbbbBbk.',
      '.kBbbbbbbBk.',
      '.kkkkkkkkkk.',
      '............',
    ],
    locker: [
      '..kkkkkkkk..',
      '..kggggggk..',
      '..kgGGGGgk..',
      '..kgGGGGgk..',
      '..kggggggk..',
      '..kgggggyk..',
      '..kggggggk..',
      '..kgGGGGgk..',
      '..kgGGGGgk..',
      '..kggggggk..',
      '..kggggggk..',
      '..kkkkkkkk..',
    ],
    car: [
      '............',
      '............',
      '....kkkkk...',
      '...kUUUUUk..',
      '..kUwwUwwUk.',
      '.kuuuuuuuuuk',
      'kuuuuuuuuuuk',
      'kuuuuuuuuuuk',
      'kkkkkkkkkkkk',
      '.kGGk..kGGk.',
      '..kk....kk..',
      '............',
    ],
    door: [
      '..wwwwwwww..',
      '..wOOOOOOw..',
      '..wOkkkkOw..',
      '..wOkOOkOw..',
      '..wOkOOkOw..',
      '..wOkkkkOw..',
      '..wOOOOyOw..',
      '..wOkkkkOw..',
      '..wOkOOkOw..',
      '..wOkOOkOw..',
      '..wOkkkkOw..',
      '..wwwwwwww..',
    ],
    door_open: [
      '..wwwwwwww..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wkkkkkkw..',
      '..wwwwwwww..',
    ],
    door_broken: [
      '..wwwwwwww..',
      '..wkkkkkkw..',
      '..wOkkkkOw..',
      '..wOOkkkkw..',
      '..wkOkkOkw..',
      '..wkkkkOOw..',
      '..wkkkkkOw..',
      '..wOkkkkkw..',
      '..wOOkkOkw..',
      '..wkOkOOkw..',
      '..wkkkkkkw..',
      '..wwwwwwww..',
    ],
    window: [
      '............',
      '..wwwwwwww..',
      '..wiiwwiiw..',
      '..wiiwwiiw..',
      '..wiIwwiIw..',
      '..wwwwwwww..',
      '..wiiwwiiw..',
      '..wiiwwiiw..',
      '..wiIwwiIw..',
      '..wwwwwwww..',
      '............',
      '............',
    ],
    window_broken: [
      '............',
      '..wwwwwwww..',
      '..wikwwkiw..',
      '..wkkwwkkw..',
      '..wkkwwikw..',
      '..wwwwwwww..',
      '..wkiwwkkw..',
      '..wkkwwkkw..',
      '..wkkwwkiw..',
      '..wwwwwwww..',
      '............',
      '............',
    ],
    rubble: [
      '............',
      '....gg......',
      '...gGGg..a..',
      '.a.gGGg.aa..',
      '.aa..g..a...',
      '....GG....gg',
      '.gg.GGg..gGg',
      'gGGg.g...gg.',
      '.gg....aa...',
      '...a...aaa..',
      '..aaa.....g.',
      '............',
    ],
    // Top-down car, 12 wide x 24 tall, pointing up. Body letters u/U are swapped for colour variants.
    car_top: [
      '....kkkk....',
      '..kkuuuukk..',
      '.kuuuuuuuuk.',
      '.kuuuuuuuuk.',
      'kkuuuuuuuukk',
      'kkuIIIIIIukk',
      '.kuIIIIIIuk.',
      '.kuuuuuuuuk.',
      '.kuUUUUUUuk.',
      '.kuUUUUUUuk.',
      '.kuUUUUUUuk.',
      '.kuUUUUUUuk.',
      '.kuUUUUUUuk.',
      '.kuUUUUUUuk.',
      '.kuuuuuuuuk.',
      '.kuIIIIIIuk.',
      'kkuIIIIIIukk',
      'kkuuuuuuuukk',
      '.kuuuuuuuuk.',
      '.kuuuuuuuuk.',
      '.kurruuurruk',
      '..kkkkkkkk..',
      '............',
      '............',
    ],
    wreck_top: [
      '....kkkk....',
      '..kkxxxxkk..',
      '.kxxXxxxxxk.',
      '.kxxxxxXxxk.',
      'kkxxxxxxxxkk',
      'kkxkkkkkkxkk',
      '.kxkkkkkkxk.',
      '.kxxxXxxxxk.',
      '.kxXxxxxxxk.',
      '.kxxxxxxXxk.',
      '.kxxxXxxxxk.',
      '.kxxxxxxxxk.',
      '.kxXxxxXxxk.',
      '.kxxxxxxxxk.',
      '.kxxxxXxxxk.',
      '.kxkkkkkkxk.',
      'kkxkkkkkkxkk',
      'kkxxxxxxxxkk',
      '.kxxXxxxxxk.',
      '.kxxxxxxxxk.',
      '.kxxxxxxxxk.',
      '..kkkkkkkk..',
      '............',
      '............',
    ],
    bin: [
      '............',
      '............',
      '...kkkkkk...',
      '..keeeeeek..',
      '..kkkkkkkk..',
      '...kEeeEk...',
      '...kEeeEk...',
      '...kEeeEk...',
      '...kEeeEk...',
      '...kEeeEk...',
      '...kkkkkk...',
      '............',
    ],
    cart: [
      '............',
      '..........k.',
      '.kkkkkkkk.k.',
      '.kMMMMMMkk..',
      '.kMMMMMMk...',
      '.kMMMMMMk...',
      '.kMMMMMMk...',
      '.kkkkkkkk...',
      '..k....k....',
      '.kk....kk...',
      '............',
      '............',
    ],
    hydrant: [
      '............',
      '............',
      '.....kk.....',
      '....krrk....',
      '....krrk....',
      '...kkrrkk...',
      '...kRrrRk...',
      '....krrk....',
      '....krrk....',
      '....krrk....',
      '...kkkkkk...',
      '............',
    ],
    lamp: [
      '....kkkk....',
      '...kllllk...',
      '...kllllk...',
      '....kkkk....',
      '.....mm.....',
      '.....mm.....',
      '.....mm.....',
      '.....mm.....',
      '.....mm.....',
      '.....mm.....',
      '....mmmm....',
      '....kkkk....',
    ],
    bench: [
      '............',
      '............',
      '............',
      '.kkkkkkkkkk.',
      '.kbbbbbbbbk.',
      '.kkkkkkkkkk.',
      '.kbbbbbbbbk.',
      '.kkkkkkkkkk.',
      '..k......k..',
      '..k......k..',
      '............',
      '............',
    ],
    bus_stop: [
      '....kkkkk...',
      '....kuuuk...',
      '....kuwuk...',
      '....kuuuk...',
      '....kkkkk...',
      '.....mm.....',
      '.....mm.....',
      '.....mm.....',
      '.....mm.....',
      '.....mm.....',
      '....mmmm....',
      '............',
    ],
    postbox: [
      '............',
      '............',
      '...kkkkkk...',
      '..krrrrrrk..',
      '..krkkkkrk..',
      '..krrrrrrk..',
      '..krrrrrrk..',
      '..krrrrrrk..',
      '..kkkkkkkk..',
      '....k..k....',
      '....k..k....',
      '............',
    ],
    hvac: [
      'kkkkkkkkkkkk',
      'kMMMMMMMMMMk',
      'kMmmmmmmmmMk',
      'kMmMMMMMMmMk',
      'kMmMmmmmMmMk',
      'kMmMmMMmMmMk',
      'kMmMmMMmMmMk',
      'kMmMmmmmMmMk',
      'kMmMMMMMMmMk',
      'kMmmmmmmmmMk',
      'kMMMMMMMMMMk',
      'kkkkkkkkkkkk',
    ],
    steeple: [
      '.....yy.....',
      '....yyyy....',
      '.....yy.....',
      '.....yy.....',
      '.....ww.....',
      '....wwww....',
      '....wwww....',
      '...wwwwww...',
      '...wwwwww...',
      '..wwwwwwww..',
      '..wwwwwwww..',
      '..kkkkkkkk..',
      '..kwwwwwwk..',
      '..kwkwwkwk..',
      '..kwkwwkwk..',
      '..kwwwwwwk..',
      '..kkkkkkkk..',
      '..kWWWWWWk..',
      '..kWWWWWWk..',
      '..kWWkkWWk..',
      '..kWWkkWWk..',
      '..kWWkkWWk..',
      '..kkkkkkkk..',
      '............',
    ],
    water_tower: [
      '....kkkk....',
      '..kkiiiikk..',
      '.kiiiiiiiik.',
      '.kiiiiiiiik.',
      '.kIIIIIIIIk.',
      '.kiiiiiiiik.',
      '..kkkkkkkk..',
      '...kMMMMk...',
      '...kMMMMk...',
      '....kMMk....',
      '...kkMMkk...',
      '...k.MM.k...',
      '..k..MM..k..',
      '..k..MM..k..',
      '.k...MM...k.',
      '.k...MM...k.',
      'k....MM....k',
      'k....MM....k',
      'kkkkkkkkkkkk',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    flag: [
      '..k.........',
      '..krrwwwrr..',
      '..krrwrwrr..',
      '..krrwwwrr..',
      '..krrwwwrr..',
      '..k.........',
      '..k.........',
      '..k.........',
      '..k.........',
      '..k.........',
      '..k.........',
      '.kkk........',
    ],
    tree: [
      '....EEEE....',
      '..EEeeeeEE..',
      '.EeeeceeeeE.',
      '.EeeeeeeceE.',
      'EeceeeeeeeeE',
      'EeeeeeeeeeeE',
      'EeeeeeceeeeE',
      '.EeeeeeeeeE.',
      '.EEeeeeeeEE.',
      '...EEBBEE...',
      '....BBBB....',
      '....BBBB....',
    ],
    pine: [
      '.....EE.....',
      '....EeeE....',
      '....EeeE....',
      '...EeeeeE...',
      '...EeeeeE...',
      '..EeeeeeeE..',
      '..EeeeeeeE..',
      '.EeeeeeeeeE.',
      '.EeeeeeeeeE.',
      'EeeeeeeeeeeE',
      '.....BB.....',
      '.....BB.....',
    ],
  };

  const cache = new Map();

  // Colour variants: 'car_top|r' swaps the body letters u/U for r/R.
  const VARIANTS = { r: { u: 'r', U: 'R' }, w: { u: 'W', U: 'g' }, g: { u: 'G', U: 'm' }, y: { u: 'y', U: 'o' }, e: { u: 'e', U: 'E' } };
  function render(name) {
    const [base, vkey] = name.split('|');
    const rows = DEF[base];
    if (!rows) return null;
    const map = (vkey && VARIANTS[vkey]) || {};
    const h = rows.length, w = rows[0].length;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < w; x++) {
        let ch = row[x];
        if (!ch || ch === '.' || ch === ' ') continue;
        ch = map[ch] || ch;
        ctx.fillStyle = BASE[ch] || '#f0f';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  const Sprites = {
    size: S,
    names: Object.keys(DEF),
    get(name) {
      let cv = cache.get(name);
      if (cv === undefined) { cv = render(name); cache.set(name, cv); }
      return cv;
    },
    // Draw sprite `name` into a tile at (px,py) of size ts. Returns false if the sprite is unknown.
    draw(ctx, name, px, py, ts, alpha) {
      const cv = this.get(name);
      if (!cv) return false;
      const w = ts * cv.width / S, h = ts * cv.height / S;
      if (alpha !== undefined && alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(cv, px, py, w, h); ctx.restore(); }
      else ctx.drawImage(cv, px, py, w, h);
      return true;
    },
    // Draw centred at (cx,cy) in pixels, rotated by angle (radians; the sprite's natural orientation points up).
    drawRotated(ctx, name, cx, cy, ts, angle, alpha) {
      const cv = this.get(name);
      if (!cv) return false;
      const w = ts * cv.width / S, h = ts * cv.height / S;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
      if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
      ctx.drawImage(cv, -w / 2, -h / 2, w, h);
      ctx.restore();
      return true;
    },
    validate() {
      const bad = [];
      for (const [n, rows] of Object.entries(DEF)) {
        if (rows.length % S !== 0) bad.push(n + ': ' + rows.length + ' rows');
        const w = rows[0].length; if (w % S !== 0) bad.push(n + ': ' + w + ' cols');
        rows.forEach((r, i) => { if (r.length !== w) bad.push(n + ' row ' + i + ': ' + r.length + ' cols'); for (const ch of r) if (ch !== '.' && ch !== ' ' && !BASE[ch]) bad.push(n + ' row ' + i + ': unknown colour ' + ch); });
      }
      return bad;
    },
  };

  global.Sprites = Sprites;
})(typeof window !== 'undefined' ? window : globalThis);
