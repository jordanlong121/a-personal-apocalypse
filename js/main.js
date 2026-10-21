// main.js — title screen, place download/caching, input handling, game loop glue.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const titleEl = $('title'), gameEl = $('game'), statusEl = $('status'), placesEl = $('places');
  const canvas = $('canvas'), side = $('side'), overlay = $('overlay'), overlayBox = $('overlay-box');
  let game = null, renderer = null, mode = 'play';

  function setStatus(s) { statusEl.textContent = s; }
  const progressEl = $('progress');
  // stage: text under the bar; frac: 0..1 for a known amount, null for "busy, unknown"; off: hide
  function setProgress(stage, frac, off) {
    if (off) { progressEl.classList.remove('on', 'busy'); return; }
    progressEl.classList.add('on');
    progressEl.classList.toggle('busy', frac === null);
    progressEl.querySelector('.fill').style.width = frac === null ? '30%' : Math.round(frac * 100) + '%';
    progressEl.querySelector('.pct').textContent = stage;
  }

  // ---- title screen ----------------------------------------------------------
  async function refreshPlaces() {
    const cached = await Store.listPlaces();
    placesEl.innerHTML = '';
    const bundled = window.BUNDLED_PLACE;
    if (bundled && !cached.some(p => p.id === bundled.id)) {
      placesEl.appendChild(card({ id: bundled.id, name: bundled.name, stats: bundled.stats, w: bundled.w, h: bundled.h, bundled: true }));
    }
    for (const p of cached) placesEl.appendChild(card(p));
    if (!placesEl.children.length) placesEl.innerHTML = '<div class="muted">No places yet.</div>';
  }

  function card(p) {
    const el = document.createElement('div'); el.className = 'card';
    const save = Store.getSave(p.id);
    const st = p.stats || {};
    const km = p.w ? ` · ${(p.w / 1000).toFixed(1)} × ${(p.h / 1000).toFixed(1)} km` : '';
    el.innerHTML = `<div class="name"><b>${escapeHtml(p.name.split(',').slice(0, 3).join(','))}</b>
      <span>${st.buildings || 0} buildings · ${st.roads || 0} roads${km}${p.bundled ? ' · comes with the game' : ''}${!p.bundled && !(p.v >= 2) ? ' · <i>pull it down again for the streets</i>' : ''}${save ? ' · <b style="color:#c9b87a">save: day ' + Math.floor((8 * 3600 + save.turn * 6) / 86400 + 1) + '</b>' : ''}</span></div>`;
    if (save) { const b = btn('Continue', 'primary', () => launch(p, true)); el.appendChild(b); }
    el.appendChild(btn(save ? 'New game' : 'Play', save ? '' : 'primary', () => {
      if (save && !confirm('Start again? What you had here will be gone.')) return;
      launch(p, false);
    }));
    if (!p.bundled) el.appendChild(btn('Delete', 'danger', async () => { if (confirm('Forget this place?')) { await Store.deletePlace(p.id); refreshPlaces(); } }));
    return el;
  }
  function btn(label, cls, fn) { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = fn; return b; }

  async function download() {
    const q = $('q').value.trim(); if (!q) return;
    const radius = parseInt($('radius').value, 10);
    $('go').disabled = true;
    const t0 = Date.now();
    try {
      setStatus('Looking for ' + q + '.'); setProgress('finding it', null);
      const g = await OSM.geocode(q);
      setStatus('There it is. ' + g.name);
      const bbox = OSM.bboxAround(g.lat, g.lon, radius);
      setProgress('waiting on the map', null);
      const raw = await OSM.fetchOverpass(bbox, setStatus, (got, total, exact) => {
        const mb = v => (v / 1048576).toFixed(1);
        if (total) setProgress(mb(got) + ' of ' + (exact ? '' : 'about ') + mb(total) + ' MB', Math.min(0.99, got / total));
        else setProgress(mb(got) + ' MB · ' + Math.round((Date.now() - t0) / 1000) + 's', null);
      });
      setStatus('Laying the town out. ' + raw.elements.length + ' pieces of it.'); setProgress('laying it out', null);
      await new Promise(r => setTimeout(r, 20));
      const id = OSM.slug(g.name.split(',').slice(0, 2).join(' ')) + '-' + radius;
      const place = OSM.compact(raw, { id, name: g.name, bbox, center: [g.lat, g.lon] }, 1);
      if (place.stats.buildings < 40) { setStatus('Hardly anything mapped there. ' + place.stats.buildings + ' buildings. Try a closer name, like Perth, Lanark County, or a town centre, or a wider reach.'); $('go').disabled = false; return; }
      setProgress('writing it down', 0.95);
      await Store.putPlace(place);
      setProgress('done', 1);
      setStatus(place.name.split(',')[0] + '. ' + place.stats.buildings + ' buildings. ' + place.stats.roads + ' roads. ' + place.stats.pois + ' places that mattered once.');
      await refreshPlaces();
      launchPlace(place, false);
    } catch (e) {
      setProgress('', 0, true);
      setStatus('It didnt work. ' + e.message + (location.protocol === 'file:' ? '\nIf the file is opened straight from disk and this keeps failing, serve the folder: python3 -m http.server 8000' : ''));
    }
    $('go').disabled = false;
    setTimeout(() => setProgress('', 0, true), 1500);
  }

  async function launch(p, cont) {
    let place = p.bundled ? window.BUNDLED_PLACE : await Store.getPlace(p.id);
    if (!place) { setStatus('The map for that place is gone.'); return; }
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
      focusGame();
      fetchLiveWeather(game);
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
    overlayBox.innerHTML = `<h2>Who were you. Before.</h2><div class="cls-grid">${cards}</div>
      <div class="muted" style="margin-top:8px">A number, or click. <kbd>Esc</kbd> goes back.</div>`;
    overlayBox.querySelectorAll('.cls').forEach(b => b.onclick = () => chooseClass(b.dataset.cls));
    overlay.classList.add('on');
    side.innerHTML = '';
    renderer.ctx.fillStyle = '#07080a'; renderer.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  let pendingClass = null, avatarSpec = null;
  function chooseClass(id) {
    if (!game || mode !== 'class') return;
    pendingClass = id;
    showAvatarPicker();
  }

  function showAvatarPicker() {
    mode = 'avatar';
    const O = Sprites.avatarOptions;
    if (!avatarSpec) avatarSpec = Object.assign({}, O.DEFAULT_AVATAR, Sprites.PRESETS[0].spec, { outfit: pendingClass });
    avatarSpec.outfit = avatarSpec.outfit === 'civ' ? 'civ' : pendingClass;
    const sel = (id, label, opts, val) => `<label>${label}<select data-k="${id}">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>`;
    const swatches = (arr) => arr.map((c, i) => [i, ['Light', 'Fair', 'Medium', 'Tan', 'Dark', 'Deep'][i] || ('#' + i)]);
    overlayBox.innerHTML = `<h2>What you look like.</h2>
      <div class="av-row">
        <div class="av-presets">${Sprites.PRESETS.map((p, i) => `<button class="av-preset" data-i="${i}" title="${escapeHtml(p.name)}"><img src="${Sprites.avatarDataUrl(Object.assign({}, O.DEFAULT_AVATAR, p.spec, { outfit: pendingClass }))}" alt=""><span>${escapeHtml(p.name)}</span></button>`).join('')}</div>
        <div class="av-custom">
          <img id="av-preview" src="" alt="">
          ${sel('skin', 'Skin', swatches(O.SKIN), avatarSpec.skin)}
          ${sel('hair', 'Hair', Object.entries(O.HAIR).map(([k, v]) => [k, v.name]), avatarSpec.hair)}
          ${sel('hairColor', 'Hair colour', [['0', 'Black'], ['1', 'Dark brown'], ['2', 'Brown'], ['3', 'Blond'], ['4', 'Red'], ['5', 'Grey'], ['6', 'White']], avatarSpec.hairColor)}
          ${sel('beard', 'Beard', [['false', 'No'], ['true', 'Yes']], avatarSpec.beard)}
          ${sel('acc', 'Headwear', Object.entries(O.ACC).map(([k, v]) => [k, v.name]), avatarSpec.acc)}
          ${sel('outfit', 'Outfit', [[pendingClass, O.OUTFITS[pendingClass].name + ' (' + CLASSES[pendingClass].name.toLowerCase() + ')'], ['civ', 'Civilian hoodie']], avatarSpec.outfit)}
          ${sel('cloth', 'Colour', [['0', 'Green'], ['1', 'Blue'], ['2', 'Red'], ['3', 'Purple'], ['4', 'Black'], ['5', 'Yellow'], ['6', 'Teal'], ['7', 'Orange']], avatarSpec.cloth)}
          <button id="av-start" class="primary">Go on.</button>
        </div>
      </div>
      <div class="muted" style="margin-top:8px">Pick one, or make your own. The colour is for the hoodie, the toque, the cap, the hijab. <kbd>Enter</kbd> goes on. <kbd>Esc</kbd> goes back.</div>`;
    const refresh = () => { document.getElementById('av-preview').src = Sprites.avatarDataUrl(avatarSpec); };
    overlayBox.querySelectorAll('.av-preset').forEach(b => b.onclick = () => { avatarSpec = Object.assign({}, O.DEFAULT_AVATAR, Sprites.PRESETS[+b.dataset.i].spec, { outfit: avatarSpec.outfit }); showAvatarPicker(); });
    overlayBox.querySelectorAll('select').forEach(el => el.onchange = () => {
      const k = el.dataset.k, v = el.value;
      avatarSpec[k] = k === 'beard' ? v === 'true' : (k === 'skin' || k === 'hairColor' || k === 'cloth') ? parseInt(v, 10) : v;
      if (k === 'acc' && v === 'hijab') avatarSpec.hair = 'bald';
      refresh();
    });
    document.getElementById('av-start').onclick = startWithAvatar;
    refresh();
    overlay.classList.add('on');
  }
  function startWithAvatar() {
    if (!game || mode !== 'avatar') return;
    game.start(pendingClass, avatarSpec);
    overlay.classList.remove('on');
    mode = 'play'; render();
    focusGame();
    fetchLiveWeather(game);
  }

  function quit() {
    if (game && !game.dead && mode !== 'class' && mode !== 'avatar') Store.putSave(game.place.id, game.serialize());
    game = null; gameEl.classList.remove('on'); titleEl.style.display = ''; overlay.classList.remove('on');
    refreshPlaces();
  }

  // ---- game loop glue --------------------------------------------------------
  function render() {
    if (!game) return;
    if (mode === 'map') renderer.drawMap(game); else renderer.draw(game);
    if (game.dead && mode !== 'dead') showDeath();
  }
  // Weather and smoke animate; redraw at a modest rate only while something is moving. The clock is real time,
  // so also redraw when the minute changes and the light moves on without you.
  let lastMinute = -1;
  (function animate() {
    if (game && mode === 'play' && renderer) {
      const m = Math.floor(game.hour() * 60);
      if (renderer.animated || m !== lastMinute) { lastMinute = m; renderer.draw(game); }
    }
    setTimeout(animate, 70);
  })();

  // Live weather for the town from Open-Meteo (free, no key). Refreshed every ten minutes while you play.
  async function fetchLiveWeather(g) {
    if (!g || !g.place.center || !navigator.onLine) return;
    const [lat, lon] = g.place.center;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m,snowfall&hourly=snow_depth&forecast_days=1&timezone=auto`;
      const res = await fetch(url); if (!res.ok) return;
      const j = await res.json();
      if (!j.current) return;
      let snowDepth;
      if (j.hourly && j.hourly.snow_depth && j.hourly.time) {
        const hourKey = j.current.time.slice(0, 13);
        const i = j.hourly.time.findIndex(t => t.startsWith(hourKey));
        if (i >= 0 && typeof j.hourly.snow_depth[i] === 'number') snowDepth = j.hourly.snow_depth[i];
      }
      if (game !== g) return;
      g.applyLiveWeather({ code: j.current.weather_code, temp: j.current.temperature_2m, wind: j.current.wind_speed_10m, snowDepth });
      if (mode === 'play') render();
    } catch (e) { /* offline or blocked: the made-up weather carries on */ }
  }
  setInterval(() => fetchLiveWeather(game), 10 * 60000);

  function showDeath() {
    mode = 'dead';
    Store.deleteSave(game.place.id);
    const p = game.player;
    overlayBox.innerHTML = `<h2>Then nothing.</h2>
      <div>The ${escapeHtml(game.className().toLowerCase())} lasted ${game.day() - 1} day${game.day() - 1 === 1 ? '' : 's'} in ${escapeHtml(game.place.name.split(',')[0])}.</div>
      <div>${p.kills} of them put down. ${p.looted} places gone through. ${p.stats ? p.stats.distance + ' paces. ' + p.stats.items + ' things taken. ' + Object.keys(game.player.quests.done).length + ' things done.' : ''}</div>
      <div class="muted" style="margin-top:10px">The save is gone. It doesnt come back. <kbd>Enter</kbd> or <kbd>Esc</kbd>.</div>`;
    overlay.classList.add('on');
  }

  function showHelp() {
    mode = 'help';
    overlayBox.innerHTML = `<h2>What you need to know</h2>
      <div class="section">Keyboard</div>
      <div class="keys">
        <div><kbd>←↑→↓</kbd> <kbd>numpad</kbd></div><div>Walk. Into them to hit. Into doors, windows, cars, shelves to open them.</div>
        <div><kbd>u</kbd></div><div>Use. Then a letter.</div>
        <div><kbd>d</kbd></div><div>Drop. Then a letter.</div>
        <div><kbd>g</kbd></div><div>Search beside you.</div>
        <div><kbd>F</kbd></div><div>Fire. Then a direction.</div>
        <div><kbd>c</kbd></div><div>Shut a door. Then a direction.</div>
        <div><kbd>.</kbd> <kbd>space</kbd></div><div>Wait.</div>
        <div><kbd>m</kbd></div><div>Map.</div>
        <div><kbd>q</kbd></div><div>Quests.</div>
        <div><kbd>x</kbd></div><div>Tally.</div>
        <div><kbd>S</kbd></div><div>Save.</div>
        <div><kbd>Esc</kbd></div><div>Leave. It saves.</div>
      </div>
      <div class="section" style="margin-top:12px">General</div>
      <div class="keys">
        <div>Them</div><div>Red eyes have seen you. Walkers, runners, brutes, spitters, howlers.</div>
        <div>Noise</div><div>Hitting, shooting and glass carry. Hordes follow it.</div>
        <div>Doors</div><div>Shut, they hold a while. Not forever.</div>
        <div>Body</div><div>Food and water run it. Below a quarter you stagger.</div>
        <div>Sight</div><div>Thirteen paces. Night takes the rest.</div>
        <div>Time</div><div>Your clock. Your weather, when the net is on.</div>
      </div>
      <div class="muted" style="margin-top:10px">Any key.</div>`;
    overlay.classList.add('on');
  }

  function showQuests() {
    mode = 'help';
    const rows = game.questList().map(q => `<div class="qrow${q.done ? ' done' : ''}"><b>${escapeHtml(q.title)}</b><span class="muted">${escapeHtml(q.text)}</span><div class="bar"><div style="width:${Math.round(100 * q.cur / q.max)}%;background:${q.done ? '#5fbf6a' : '#c9b87a'}"></div></div><span class="num">${q.done ? 'done' : q.cur + ' / ' + q.max}</span></div>`).join('');
    overlayBox.innerHTML = `<h2>What there is to do.</h2><div class="qlist">${rows}</div><div class="muted" style="margin-top:10px">Any key.</div>`;
    overlay.classList.add('on');
  }
  function showTally() {
    mode = 'help';
    const s = game.player.stats, k = s.kills || {};
    const kills = Object.keys(ZTYPES).map(t => (k[t] || 0) + ' ' + t + (k[t] === 1 ? '' : 's')).join(' · ');
    const row = (a, b) => `<div class="trow"><span>${a}</span><b>${b}</b></div>`;
    overlayBox.innerHTML = `<h2>The tally.</h2>
      ${row('Days', game.day())}${row('Nights lived through', s.nights)}${row('Paces', s.distance)}${row('Put down', Object.values(k).reduce((x, y) => x + y, 0))}
      <div class="muted" style="margin:-4px 0 6px">${kills}</div>
      ${row('Shots fired', s.shots)}${row('Places gone through', s.searched)}${row('Things taken', s.items)}${row('Eaten', s.eaten)}${row('Drunk', s.drunk)}${row('Wounds bound', s.healed)}
      ${row('Doors opened', s.doors)}${row('Windows broken', s.windows)}${row('Blood lost', s.hurt)}${row('Hordes', s.hordes)}
      <div class="muted" style="margin-top:10px">Any key.</div>`;
    overlay.classList.add('on');
  }
  function closeOverlay() { overlay.classList.remove('on'); mode = 'play'; render(); focusGame(); }

  const MOVE_KEYS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    Numpad4: [-1, 0], Numpad6: [1, 0], Numpad8: [0, -1], Numpad2: [0, 1], Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
    Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
  };
  let dropPending = false, firePending = false, closePending = false, usePending = false;

  document.addEventListener('keydown', e => {
    if (!game) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (mode !== 'avatar' && (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) document.activeElement.blur();
    const k = e.key, code = e.code;
    if (mode === 'dead') { if (k === 'Enter' || k === 'Escape') quit(); e.preventDefault(); return; }
    if (mode === 'avatar') {
      if (k === 'Enter') startWithAvatar();
      else if (k === 'Escape') showClassPicker();
      return; // let selects handle their own keys
    }
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
      if (k.length === 1 && k >= 'a' && k <= 'p') game.act('drop', game.slotForLetter(k.charCodeAt(0) - 97)); else game.log('You keep it.');
      render(); e.preventDefault(); return;
    }
    if (usePending) {
      usePending = false;
      if (k.length === 1 && k >= 'a' && k <= 'p') game.act('use', game.slotForLetter(k.charCodeAt(0) - 97)); else game.log('You leave it where it is.');
      render(); e.preventDefault(); return;
    }
    const mv = MOVE_KEYS[code] || MOVE_KEYS[k];
    if (firePending) {
      firePending = false;
      if (mv) game.act('fire', mv); else { game.log('You lower it.'); render(); }
      e.preventDefault(); return;
    }
    if (closePending) {
      closePending = false;
      if (mv) game.act('close', mv); else { game.log('You leave it.'); render(); }
      e.preventDefault(); return;
    }
    if (mv) { game.act('move', mv); e.preventDefault(); return; }
    if (k === 'c') { closePending = true; game.log('Which door.'); render(); e.preventDefault(); return; }
    if (k === 'f' || k === 'F') {
      const w = game.weapon();
      if (!w.ranged) game.log('Nothing in your hands that will reach that far.');
      else if (!(game.player.ammo[w.ammo] > 0)) game.log('No ' + ITEMS[w.ammo].short + '. You check again anyway.');
      else { firePending = true; game.log('Which way. It reaches ' + w.range + '.'); }
      render(); e.preventDefault(); return;
    }
    if (k === '.' || k === ' ' || code === 'Numpad5') { game.act('wait'); e.preventDefault(); return; }
    if (k === 'g' || k === ',') { game.act('grab'); e.preventDefault(); return; }
    if (k === 'd') { dropPending = true; game.log('Leave what.'); render(); e.preventDefault(); return; }
    if (k === 'u') { if (!game.player.inv.length) { game.log('Nothing in the pack.'); } else { usePending = true; game.log('Use what.'); } render(); e.preventDefault(); return; }
    if (k === 'm') { mode = 'map'; render(); e.preventDefault(); return; }
    if (k === 'q') { showQuests(); e.preventDefault(); return; }
    if (k === 'x') { showTally(); e.preventDefault(); return; }
    if (k === 'S') { const ok = Store.putSave(game.place.id, game.serialize()); game.log(ok ? 'Written down.' : 'It wouldnt write. The browser is keeping nothing.'); render(); e.preventDefault(); return; }
    if (k === '?') { showHelp(); e.preventDefault(); return; }
    if (k === 'Escape') { quit(); e.preventDefault(); return; }

  });

  // Mouse/touch: click a tile adjacent to the player to step there.
  canvas.addEventListener('click', e => {
    focusGame();
    if (!game || mode !== 'play') return;
    const ts = renderer.tile, cols = Math.ceil(canvas.width / ts) + 1, rows = Math.ceil(canvas.height / ts) + 1;
    const r = canvas.getBoundingClientRect();
    const tx = Math.floor((e.clientX - r.left) / ts) - Math.floor(cols / 2), ty = Math.floor((e.clientY - r.top) / ts) - Math.floor(rows / 2);
    if (tx === 0 && ty === 0) game.act('grab');
    else game.act('move', [Math.sign(tx), Math.sign(ty)]);
  });

  $('btn-map').onclick = (e) => { e.currentTarget.blur(); mode = mode === 'map' ? 'play' : 'map'; render(); focusGame(); };
  $('btn-save').onclick = (e) => { e.currentTarget.blur(); if (game) { Store.putSave(game.place.id, game.serialize()); game.log('Written down.'); render(); } focusGame(); };
  $('btn-quit').onclick = (e) => { e.currentTarget.blur(); quit(); };
  for (const b of document.querySelectorAll('#topbar button')) b.tabIndex = -1;
  canvas.tabIndex = 0; canvas.style.outline = 'none';
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  $('go').onclick = download;
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') download(); });
  window.addEventListener('resize', () => { if (renderer) { renderer.resize(); renderer.mapCanvas = null; renderer.paths = new Map(); renderer.wallAngles = new Map(); render(); } });
  window.addEventListener('beforeunload', () => { if (game && !game.dead && mode !== 'class' && mode !== 'avatar') Store.putSave(game.place.id, game.serialize()); });

  refreshPlaces();
})();
