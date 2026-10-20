// store.js — IndexedDB for downloaded places, localStorage for save games.
(function (global) {
  'use strict';
  const DB_NAME = 'zombie-rogue', DB_VER = 1, STORE = 'places';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  // In-memory fallback so the game still runs where IndexedDB is blocked (some file:// setups).
  const mem = new Map();

  const Store = {
    async putPlace(place) {
      try { await tx('readwrite', s => s.put(place)); } catch (e) { mem.set(place.id, place); }
    },
    async getPlace(id) {
      try { const r = await tx('readonly', s => s.get(id)); if (r) return r; } catch (e) { /* fall through */ }
      return mem.get(id) || null;
    },
    async listPlaces() {
      let out = [];
      try {
        const all = await tx('readonly', s => s.getAll());
        out = (all || []).map(p => ({ id: p.id, name: p.name, stats: p.stats, fetched: p.fetched, w: p.w, h: p.h, v: p.v }));
      } catch (e) { out = [...mem.values()].map(p => ({ id: p.id, name: p.name, stats: p.stats, fetched: p.fetched, w: p.w, h: p.h, v: p.v })); }
      return out.sort((a, b) => (b.fetched || 0) - (a.fetched || 0));
    },
    async deletePlace(id) {
      try { await tx('readwrite', s => s.delete(id)); } catch (e) { /* ignore */ }
      mem.delete(id);
      Store.deleteSave(id);
    },
    saveKey(id) { return 'zr_save_' + id; },
    putSave(id, data) {
      try { localStorage.setItem(Store.saveKey(id), JSON.stringify(data)); return true; } catch (e) { return false; }
    },
    getSave(id) {
      try { const s = localStorage.getItem(Store.saveKey(id)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    },
    deleteSave(id) { try { localStorage.removeItem(Store.saveKey(id)); } catch (e) { /* ignore */ } },
  };

  global.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
