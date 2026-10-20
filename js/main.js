// main.js — title screen, place download/caching, input handling, game loop glue.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const titleEl = $('title'), gameEl = $('game'), statusEl = $('status'), placesEl = $('places');
  const canvas = $('canvas'), side = $('side'), overlay = $('overlay'), overlayBox = $('overlay-box');
  let game = null, renderer = null, mode = 'play';

  function setStatus(s) { statusEl.textContent = s; }

  // ---- title screen ----------------------------------------------------------
  async function refreshPlaces() {
    const cached = await Store.listPlaces();
    placesEl.innerHTML = '';
    const bundled = window.BUNDLED_PLACE;
    if (bundled && !cached.some(p => p.id === bundled.id)) {
      placesEl.appendChild(card({ id: bundled.id, name: bundled.name, stats: bundled.stats, w: bundled.w, h: bundled.h, bundled: true }));
    }
    for (const p of cached) placesEl.appendChild(card(p));
    if (!placesEl.children.length) placesEl.innerHTML = '<div class="muted">No places yet. Type one above.</div>';
  }

  function card(p) {
    const el = document.createElement('div'); el.className = 'card';
    const save = Store.getSave(p.id);
    const st = p.stats || {};
    const km = p.w ? ` · ${(p.w / 1000).toFixed(1)} × ${(p.h / 1000).toFixed(1)} km` : '';
    el.innerHTML = `<div class="name"><b>${escapeHtml(p.name.split(',').slice(0, 3).join(','))}</b>
      <span>${st.buildings || 0} buildings · ${st.roads || 0} roads${km}${p.bundled ? ' · bundled offline sample' : ''}${!p.bundled && !(p.v >= 2) ? ' · <i>re-download for street detail</i>' : ''}${save ? ' · <b style="color:#c9b87a">save: day ' + Math.floor((8 * 3600 + save.turn * 6) / 86400 + 1) + '</b>' : ''}</span></div>`;
    if (save) { const b = btn('Continue', 'primary', () => launch(p, true)); el.appendChild(b); }
    el.appendChild(btn(save ? 'New game' : 'Play', save ? '' : 'primary', () => {
      if (save && !confirm('Start over? Your save in this place will be erased.')) return;
      launch(p, false);
    }));
    if (!p.bundled) el.appendChild(btn('Delete', 'danger', async () => { if (confirm('Delete this place and its save?')) { await Store.deletePlace(p.id); refreshPlaces(); } }));
    return el;
  }
  function btn(label, cls, fn) { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = fn; return b; }

  async function download() {
    const q = $('q').value.trim(); if (!q) return;
    const radius = parseInt($('radius').value, 10);
    $('go').disabled = true;
    try {
      setStatus('Looking up "' + q + '" …');
      const g = await OSM.geocode(q);
      setStatus('Found: ' + g.name);
      const bbox = OSM.bboxAround(g.lat, g.lon, radius);
      const raw = await OSM.fetchOverpass(bbox, setStatus);
      setStatus('Building the world (' + raw.elements.length + ' map elements) …');
      await new Promise(r => setTimeout(r, 20));
      const id = OSM.slug(g.name.split(',').slice(0, 2).join(' ')) + '-' + radius;
      const place = OSM.compact(raw, { id, name: g.name, bbox, center: [g.lat, g.lon] }, 1);
      if (place.stats.buildings < 40) { setStatus('That area has almost no mapped buildings (' + place.stats.buildings + '). Try a more specific name (e.g. "Perth, Lanark County"), a town centre, or a larger radius.'); $('go').disabled = false; return; }
      await Store.putPlace(place);
      setStatus('Saved ' + place.name.split(',')[0] + ': ' + place.stats.buildings + ' buildings, ' + place.stats.roads + ' roads, ' + place.stats.pois + ' points of interest.');
      await refreshPlaces();
      launchPlace(place, false);
    } catch (e) {
      setStatus('Failed: ' + e.message + (location.protocol === 'file:' ? '\nIf you are opening the file directly and downloads fail, try serving the folder: python3 -m http.server 8000' : ''));
    }
    $('go').disabled = false;
  }

  async function launch(p, cont) {
    let place = p.bundled ? window.BUNDLED_PLACE : await Store.getPlace(p.id);
    if (!place) { setStatus('Place data missing.'); return; }
    launchPlace(place, cont);
  }

  function launchPlace(place, cont) {
    const save = cont ? Store.getSave(place.id) : null;
    if (!cont) Store.deleteSave(place.id);
    titleEl.style.display = 'none'; gameEl.classList.add('on');
    if (!renderer) renderer = new Renderer(canvas, side);
    renderer.resize(); renderer.mapCanvas = null; renderer.paths = new Map(); renderer.wallAngles = new Map();
    if (save) {
      game = Game.restore(place, save);
      game.onChange = () => { if (mode === 'play') render(); };
      window.__game = game; // for automation/debugging
      mode = 'play'; render();
      return;
    }
    game = new Game(place, (Math.random() * 0xffffffff) >>> 0);
    game.onChange = () => { if (mode === 'play') render(); };
    window.__game = game;
    showClassPicker();
  }

  function showClassPicker() {
    mode = 'class';
    const cards = Object.entries(CLASSES).map(([id, c], i) => `
      <button class="cls" data-cls="${id}"><b><kbd>${i + 1}</kbd> ${c.name}</b><span>${escapeHtml(c.desc)}</span></button>`).join('');
    overlayBox.innerHTML = `<h2>Who were you, before?</h2><div class="cls-grid">${cards}</div>
      <div class="muted" style="margin-top:8px">Pick a class with a number key or a click. <kbd>Esc</kbd> returns to the title.</div>`;
    overlayBox.querySelectorAll('.cls').forEach(b => b.onclick = () => chooseClass(b.dataset.cls));
    overlay.classList.add('on');
    side.innerHTML = '';
    renderer.ctx.fillStyle = '#07080a'; renderer.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  function chooseClass(id) {
    if (!game || mode !== 'class') return;
    game.start(id);
    overlay.classList.remove('on');
    mode = 'play'; render();
  }

  function quit() {
    if (game && !game.dead && mode !== 'class') Store.putSave(game.place.id, game.serialize());
    game = null; gameEl.classList.remove('on'); titleEl.style.display = ''; overlay.classList.remove('on');
    refreshPlaces();
  }

  // ---- game loop glue --------------------------------------------------------
  function render() {
    if (!game) return;
    if (mode === 'map') renderer.drawMap(game); else renderer.draw(game);
    if (game.dead && mode !== 'dead') showDeath();
  }
  // Weather and smoke animate; redraw at a modest rate only while something is moving.
  (function animate() {
    if (game && mode === 'play' && renderer && renderer.animated) renderer.draw(game);
    setTimeout(animate, 70);
  })();

  function showDeath() {
    mode = 'dead';
    Store.deleteSave(game.place.id);
    const p = game.player;
    overlayBox.innerHTML = `<h2>You died.</h2>
      <div>The ${escapeHtml(game.className().toLowerCase())} survived ${game.day() - 1} day${game.day() - 1 === 1 ? '' : 's'} and ${game.turn} turns in ${escapeHtml(game.place.name.split(',')[0])}.</div>
      <div>Zombies put down: ${p.kills}. Containers searched: ${p.looted}.</div>
      <div class="muted" style="margin-top:10px">Permadeath: the save for this place is gone. Press <kbd>Enter</kbd> or <kbd>Esc</kbd> to return to the title.</div>`;
    overlay.classList.add('on');
  }

  function showHelp() {
    mode = 'help';
    overlayBox.innerHTML = `<h2>How to survive</h2>
      <div><kbd>←↑→↓</kbd>, numpad, or <kbd>h j k l y u b n</kbd> move. Walk into a zombie to attack it.</div>
      <div><kbd>g</kbd> search the container you stand on (fridges, shelves, lockers, abandoned cars, …).</div>
      <div><kbd>a</kbd>–<kbd>p</kbd> use an item: eat, drink, heal, or wield a weapon. <kbd>d</kbd> then a letter drops it.</div>
      <div>Doors start closed. Walk into one to open it; <kbd>c</kbd> then a direction closes it behind you. A closed door stops zombies and hides you, but a zombie that knows you are inside will pound on it until it breaks, which takes a while and makes noise. Walk into a window to smash it and climb through. Broken doors and windows stay open.</div>
      <div>Cars line the streets and jam the highways: walk into one to search it. Buildings show their roofs until you step inside.</div>
      <div><b>Hordes</b> roam in now and then, announced by a groaning chorus. They come straight at you and will batter down doors, windows and, given time, walls.</div>
      <div><kbd>F</kbd> then a direction fires the wielded ranged weapon in a straight line. Bow range 8 (quiet), shotgun 6, pistol 10, rifle 16. Guns are loud. Ammo lives in a pouch and takes no pack space.</div>
      <div><kbd>.</kbd> or <kbd>space</kbd> wait a turn. <kbd>m</kbd> overview map. <kbd>S</kbd> save. <kbd>Esc</kbd> quit to title (autosaves).</div>
      <div class="muted" style="margin-top:10px">Zombies with red eyes have noticed you. Zombies see about 10 tiles by day, less at night. Hitting makes noise. Food and water drain over time; starving drains HP. HP slowly recovers when fed and watered. You see 13 tiles; loot and zombies only show within that range. At night everything beyond it falls into darkness. At night zombies notice you from less far away.</div>
      <div class="muted">Colours on the map: gold = food, red = medical, blue = hardware, purple = weapons, orange = gas station.</div>
      <div class="muted" style="margin-top:10px">Press any key to close.</div>`;
    overlay.classList.add('on');
  }

  function closeOverlay() { overlay.classList.remove('on'); mode = 'play'; render(); }

  const MOVE_KEYS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    h: [-1, 0], l: [1, 0], k: [0, -1], j: [0, 1], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
    Numpad4: [-1, 0], Numpad6: [1, 0], Numpad8: [0, -1], Numpad2: [0, 1], Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
    Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
  };
  let dropPending = false, firePending = false, closePending = false;

  document.addEventListener('keydown', e => {
    if (!game) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, code = e.code;
    if (mode === 'dead') { if (k === 'Enter' || k === 'Escape') quit(); e.preventDefault(); return; }
    if (mode === 'class') {
      const ids = Object.keys(CLASSES); const n = parseInt(k, 10);
      if (n >= 1 && n <= ids.length) chooseClass(ids[n - 1]);
      else if (k === 'Escape') { game = null; gameEl.classList.remove('on'); titleEl.style.display = ''; overlay.classList.remove('on'); }
      e.preventDefault(); return;
    }
    if (mode === 'help') { closeOverlay(); e.preventDefault(); return; }
    if (mode === 'map') { if (k === 'm' || k === 'Escape') { mode = 'play'; render(); } e.preventDefault(); return; }
    if (dropPending) {
      dropPending = false;
      if (k.length === 1 && k >= 'a' && k <= 'p') game.act('drop', k.charCodeAt(0) - 97); else game.log('Drop cancelled.');
      render(); e.preventDefault(); return;
    }
    const mv = MOVE_KEYS[code] || MOVE_KEYS[k];
    if (firePending) {
      firePending = false;
      if (mv) game.act('fire', mv); else { game.log('Fire cancelled.'); render(); }
      e.preventDefault(); return;
    }
    if (closePending) {
      closePending = false;
      if (mv) game.act('close', mv); else { game.log('Close cancelled.'); render(); }
      e.preventDefault(); return;
    }
    if (mv && !e.shiftKey) { game.act('move', mv); e.preventDefault(); return; }
    if (k === 'c') { closePending = true; game.log('Close the door in which direction?'); render(); e.preventDefault(); return; }
    if (k === 'f' || k === 'F') {
      const w = game.weapon();
      if (!w.ranged) game.log('You need to wield a ranged weapon first (bow, pistol, shotgun, rifle).');
      else if (!(game.player.ammo[w.ammo] > 0)) game.log('No ' + ITEMS[w.ammo].short + ' left.');
      else { firePending = true; game.log('Fire the ' + w.name.toLowerCase() + ' in which direction? (range ' + w.range + ')'); }
      render(); e.preventDefault(); return;
    }
    if (k === '.' || k === ' ' || code === 'Numpad5') { game.act('wait'); e.preventDefault(); return; }
    if (k === 'g' || k === ',') { game.act('grab'); e.preventDefault(); return; }
    if (k === 'd') { dropPending = true; game.log('Drop which item? (letter, or any other key to cancel)'); render(); e.preventDefault(); return; }
    if (k === 'm') { mode = 'map'; render(); e.preventDefault(); return; }
    if (k === 'S') { const ok = Store.putSave(game.place.id, game.serialize()); game.log(ok ? 'Game saved.' : 'Save failed (storage blocked?).'); render(); e.preventDefault(); return; }
    if (k === '?') { showHelp(); e.preventDefault(); return; }
    if (k === 'Escape') { quit(); e.preventDefault(); return; }
    if (k.length === 1 && k >= 'a' && k <= 'p') { game.act('use', k.charCodeAt(0) - 97); e.preventDefault(); return; }
  });

  // Mouse/touch: click a tile adjacent to the player to step there.
  canvas.addEventListener('click', e => {
    if (!game || mode !== 'play') return;
    const ts = renderer.tile, cols = Math.ceil(canvas.width / ts) + 1, rows = Math.ceil(canvas.height / ts) + 1;
    const r = canvas.getBoundingClientRect();
    const tx = Math.floor((e.clientX - r.left) / ts) - Math.floor(cols / 2), ty = Math.floor((e.clientY - r.top) / ts) - Math.floor(rows / 2);
    if (tx === 0 && ty === 0) game.act('grab');
    else game.act('move', [Math.sign(tx), Math.sign(ty)]);
  });

  $('btn-map').onclick = () => { mode = mode === 'map' ? 'play' : 'map'; render(); };
  $('btn-save').onclick = () => { if (game) { Store.putSave(game.place.id, game.serialize()); game.log('Game saved.'); render(); } };
  $('btn-quit').onclick = quit;
  $('go').onclick = download;
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') download(); });
  window.addEventListener('resize', () => { if (renderer) { renderer.resize(); renderer.mapCanvas = null; renderer.paths = new Map(); renderer.wallAngles = new Map(); render(); } });
  window.addEventListener('beforeunload', () => { if (game && !game.dead && mode !== 'class') Store.putSave(game.place.id, game.serialize()); });

  refreshPlaces();
})();
