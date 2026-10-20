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

  // ---- Avatars: the player sprite composed from layers ---------------------------------------------
  const SKIN = ['#f3dcc4', '#e8b894', '#d29a6b', '#b87a4b', '#8d5a33', '#5c3a22'];
  const HAIR_COLORS = ['#1b1b1f', '#3a2a1e', '#6b4423', '#c99a4a', '#b5451b', '#8a8a8a', '#f0ece0'];
  const CLOTH_COLORS = ['#4f6b3a', '#3f6fb5', '#c43a2e', '#6a4c93', '#2a2a2a', '#d9b24a', '#2a8a7a', '#e07a2a'];
  const BODY = [
    '............', '............', '...nnnnnn...', '...nknnkn...', '....nnNn....', '....nnnn....',
    '............', '............', '............', '...pp..pp...', '...pp..pp...', '...kk..kk...',
  ];
  const OUTFITS = {
    civ:         { name: 'Hoodie',          rows: ['..oooooooo..', '.noooOOooon.', '..oooooooo..', '..oOooooOo..'] },
    soldier:     { name: 'Combat fatigues', rows: ['..jJjjjjJj..', '.njjBjjBjjn.', '..JjjjjjjJ..', '..jjBjjjjj..'] },
    police:      { name: 'Police uniform',  rows: ['..UUUUUUUU..', '.nUUyUUUUUn.', '..UUUUUUUU..', '..UkkkkkkU..'] },
    doctor:      { name: 'White coat',      rows: ['..wwiiiiww..', '.nwwiiiiwwn.', '..wwiiiiww..', '..wwwwwwww..'] },
    engineer:    { name: 'Hi-vis vest',     rows: ['..yyyyyyyy..', '.nyywwwwyyn.', '..yyyyyyyy..', '..yywwwwyy..'] },
    firefighter: { name: 'Turnout gear',    rows: ['..mmmmmmmm..', '.nmyyyyyymn.', '..mmmmmmmm..', '..myyyyyym..'] },
    hunter:      { name: 'Blaze vest',      rows: ['..rRooooRr..', '.nrRooooRrn.', '..rRooooRr..', '..RrooooRr..'] },
    chef:        { name: 'Chef whites',     rows: ['..wwwwwwww..', '.nwwwkwwwwn.', '..wwwwkwww..', '..wwwwwwww..'] },
  };
  const HAIR = {
    short:    { name: 'Short',    rows: ['............', '....hhhh....', '...hhhhhh...', '...h....h...'] },
    buzz:     { name: 'Buzz cut', rows: ['............', '....hhhh....', '...h....h...'] },
    bald:     { name: 'Bald',     rows: [] },
    long:     { name: 'Long',     rows: ['....hhhh....', '...hhhhhh...', '..hhhhhhhh..', '..hh....hh..', '..hh....hh..', '..hh....hh..', '..h......h..'] },
    ponytail: { name: 'Ponytail', rows: ['............', '....hhhh....', '...hhhhhh...', '...h....hh..', '.........hh.', '.........hh.', '..........h.'] },
    bun:      { name: 'Bun',      rows: ['.....hh.....', '....hhhh....', '...hhhhhh...', '...h....h...'] },
    curly:    { name: 'Curly',    rows: ['...hhhhhh...', '..hhhhhhhh..', '..hhhhhhhh..', '..hh....hh..', '..hh....hh..'] },
    braids:   { name: 'Braids',   rows: ['............', '....hhhh....', '...hhhhhh...', '..hh....hh..', '..h......h..', '..h......h..', '..h......h..', '..h......h..'] },
    mohawk:   { name: 'Mohawk',   rows: ['.....hh.....', '.....hh.....', '....hhhh....'] },
  };
  const BEARD = ['............', '............', '............', '............', '...h.hh.h...', '....hhhh....'];
  const ACC = {
    none:    { name: 'None', rows: [] },
    glasses: { name: 'Sunglasses', rows: ['............', '............', '............', '...kkkkkk...'] },
    toque:   { name: 'Toque', rows: ['.....ww.....', '....cccc....', '...cccccc...', '...cwwwwc...'] },
    cap:     { name: 'Ball cap', rows: ['............', '....cccc....', '...cccccccc.'] },
    hijab:   { name: 'Hijab', rows: ['....cccc....', '...cccccc...', '..cc....cc..', '..cc....cc..', '..ccc..ccc..', '..cccccccc..', '.cc......cc.'] },
  };
  function shade(hex, f) { const v = parseInt(hex.slice(1), 16); const r = Math.round(((v >> 16) & 255) * f), g = Math.round(((v >> 8) & 255) * f), b = Math.round((v & 255) * f); return 'rgb(' + r + ',' + g + ',' + b + ')'; }
  const avatarCache = new Map();
  const DEFAULT_AVATAR = { skin: 1, hair: 'short', hairColor: 1, beard: false, acc: 'none', outfit: 'civ', cloth: 0 };
  function paintRows(ctx, rows, map) {
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch === '.' || ch === ' ') continue; ctx.fillStyle = map[ch] || BASE[ch] || '#f0f'; ctx.fillRect(x, y, 1, 1); } });
  }
  Sprites.avatarOptions = { SKIN, HAIR_COLORS, CLOTH_COLORS, OUTFITS, HAIR, ACC, DEFAULT_AVATAR };
  // Returns a 12x12 canvas for an avatar spec {skin, hair, hairColor, beard, acc, outfit, cloth}.
  Sprites.avatar = function (spec) {
    spec = Object.assign({}, DEFAULT_AVATAR, spec || {});
    const key = JSON.stringify(spec);
    let cv = avatarCache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');
    const skin = SKIN[spec.skin % SKIN.length], hair = HAIR_COLORS[spec.hairColor % HAIR_COLORS.length], cloth = CLOTH_COLORS[spec.cloth % CLOTH_COLORS.length];
    const map = { n: skin, N: shade(skin, 0.8), h: hair, H: shade(hair, 0.8), o: cloth, O: shade(cloth, 0.75), c: cloth };
    paintRows(ctx, BODY, map);
    const outfit = OUTFITS[spec.outfit] || OUTFITS.civ;
    ctx.save(); ctx.translate(0, 5); paintRows(ctx, outfit.rows, map); ctx.restore();
    if (spec.acc !== 'hijab') paintRows(ctx, (HAIR[spec.hair] || HAIR.short).rows, map);
    if (spec.beard) paintRows(ctx, BEARD, map);
    paintRows(ctx, (ACC[spec.acc] || ACC.none).rows, map);
    avatarCache.set(key, cv);
    return cv;
  };
  Sprites.avatarDataUrl = function (spec) { return Sprites.avatar(spec).toDataURL(); };
  Sprites.PRESETS = [
    { name: 'Short dark hair, medium skin',        spec: { skin: 2, hair: 'short', hairColor: 0 } },
    { name: 'Long blond hair, light skin',          spec: { skin: 0, hair: 'long', hairColor: 3 } },
    { name: 'Braids, dark skin',                    spec: { skin: 4, hair: 'braids', hairColor: 0 } },
    { name: 'Curly hair and beard, deep skin',      spec: { skin: 5, hair: 'curly', hairColor: 0, beard: true } },
    { name: 'Red ponytail, light skin, sunglasses', spec: { skin: 0, hair: 'ponytail', hairColor: 4, acc: 'glasses' } },
    { name: 'Black bun, tan skin',                  spec: { skin: 3, hair: 'bun', hairColor: 0 } },
    { name: 'Teal hijab, medium skin',              spec: { skin: 2, hair: 'bald', acc: 'hijab', cloth: 6 } },
    { name: 'Grey buzz cut and beard, light skin',  spec: { skin: 1, hair: 'buzz', hairColor: 5, beard: true } },
    { name: 'Black mohawk, brown skin',             spec: { skin: 3, hair: 'mohawk', hairColor: 0 } },
    { name: 'Red toque, brown hair, light skin',    spec: { skin: 1, hair: 'short', hairColor: 2, acc: 'toque', cloth: 2 } },
    { name: 'Ball cap and beard, dark skin',        spec: { skin: 4, hair: 'buzz', hairColor: 0, beard: true, acc: 'cap', cloth: 1 } },
    { name: 'Bald, deep skin',                      spec: { skin: 5, hair: 'bald', hairColor: 0 } },
    { name: 'White long hair, light skin',          spec: { skin: 0, hair: 'long', hairColor: 6 } },
    { name: 'Brown curly hair, medium skin',        spec: { skin: 2, hair: 'curly', hairColor: 2 } },
  ];

  global.Sprites = Sprites;
})(typeof window !== 'undefined' ? window : globalThis);
