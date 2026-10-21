// osm.js — geocoding, Overpass download, and compaction of raw OSM into the game's place format.
// Works in the browser and in Node (used by tools/bundle.js).
(function (global) {
  'use strict';

  // Only the official overpass-api.de hosts send CORS headers, so browsers cannot use the community mirrors.
  const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
  ];
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

  const M_PER_DEG_LAT = 110574;
  const M_PER_DEG_LON_EQ = 111320;

  function overpassQuery(bbox) {
    const b = bbox.map(v => v.toFixed(5)).join(',');
    return `[out:json][timeout:120];
(
  way["building"](${b});
  way["highway"](${b});
  way["landuse"](${b});
  way["natural"](${b});
  way["waterway"](${b});
  way["leisure"](${b});
  way["amenity"](${b});
  way["shop"](${b});
  node["shop"](${b});
  node["amenity"](${b});
  node["natural"="tree"](${b});
  node["highway"~"^(street_lamp|bus_stop|crossing)$"](${b});
  node["emergency"="fire_hydrant"](${b});
  node["man_made"~"^(water_tower|flagpole)$"](${b});
  way["man_made"="water_tower"](${b});
  way["railway"~"^(rail|light_rail|tram)$"](${b});
  way["barrier"~"^(fence|wall|hedge)$"](${b});
  way["bridge"](${b});
);
out geom;`;
  }

  async function geocode(query) {
    const url = `${NOMINATIM}?format=json&limit=8&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Geocoder returned HTTP ' + res.status);
    const arr = await res.json();
    if (!arr.length) throw new Error('No place found for "' + query + '"');
    // Prefer settlements over administrative areas: "Perth, Ontario" should be the town, not Perth County.
    const settlement = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'locality', 'borough', 'municipality']);
    const r = arr.find(x => settlement.has(x.type) || (x.addresstype && settlement.has(x.addresstype))) || arr[0];
    return { lat: parseFloat(r.lat), lon: parseFloat(r.lon), name: r.display_name, type: r.type };
  }

  function bboxAround(lat, lon, radiusM) {
    const dLat = radiusM / M_PER_DEG_LAT;
    const dLon = radiusM / (M_PER_DEG_LON_EQ * Math.cos(lat * Math.PI / 180));
    return [lat - dLat, lon - dLon, lat + dLat, lon + dLon]; // s, w, n, e
  }

  async function fetchOverpass(bbox, onStatus, onProgress) {
    const body = 'data=' + encodeURIComponent(overpassQuery(bbox));
    let lastErr = null;
    for (const url of OVERPASS_MIRRORS) {
      const host = new URL(url).host;
      try {
        if (onStatus) onStatus('Downloading map data from ' + host + ' …');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 150000);
        const res = await fetch(url, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + host);
        // Stream the body so the caller can show how much has come down (Overpass rarely sends a length).
        const total = parseInt(res.headers.get('Content-Length') || '0', 10) || 0;
        let text;
        if (res.body && res.body.getReader) {
          const reader = res.body.getReader(), chunks = []; let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); got += value.length;
            if (onProgress) onProgress(got, total);
          }
          const all = new Uint8Array(got); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
          text = new TextDecoder().decode(all);
        } else text = await res.text();
        const json = JSON.parse(text);
        if (!json.elements) throw new Error('Malformed response from ' + host);
        return json;
      } catch (e) {
        lastErr = e;
        if (onStatus) onStatus('Mirror ' + host + ' failed (' + e.message + '), trying next …');
      }
    }
    throw lastErr || new Error('All Overpass mirrors failed');
  }

  // ---- classification -------------------------------------------------------

  const FOOD_SHOPS = new Set(['supermarket', 'convenience', 'variety_store', 'frozen_food', 'bakery', 'butcher',
    'greengrocer', 'deli', 'general', 'farm', 'alcohol', 'beverages', 'wholesale', 'department_store']);
  const FOOD_AMENITY = new Set(['restaurant', 'fast_food', 'cafe', 'pub', 'bar', 'food_court', 'ice_cream']);
  const MED_AMENITY = new Set(['pharmacy', 'clinic', 'doctors', 'dentist', 'hospital', 'veterinary', 'nursing_home', 'social_facility']);
  const MED_SHOPS = new Set(['chemist', 'medical_supply', 'optician', 'hearing_aids']);
  const TOOL_SHOPS = new Set(['hardware', 'doityourself', 'car_repair', 'car_parts', 'car', 'garden_centre', 'trade', 'tyres', 'farm_equipment']);
  const WEAPON_SHOPS = new Set(['hunting', 'outdoor', 'sports', 'weapons', 'fishing']);
  const OFFICE_BUILDINGS = new Set(['school', 'church', 'office', 'commercial', 'retail', 'civic', 'public', 'university', 'college', 'kindergarten', 'hotel', 'government', 'bank']);
  const TOOL_BUILDINGS = new Set(['industrial', 'warehouse', 'garage', 'garages', 'barn', 'farm_auxiliary', 'shed', 'service', 'hangar']);

  // Returns a loot "use" class for a building given its tags (and POI tags merged in).
  function classifyUse(tags) {
    const shop = tags.shop, am = tags.amenity, b = tags.building;
    if (am === 'police') return 'weapons';
    if (shop && WEAPON_SHOPS.has(shop)) return 'weapons';
    if (am === 'fuel') return 'fuel';
    if (am === 'fire_station') return 'tools';
    if (shop && FOOD_SHOPS.has(shop)) return 'food';
    if (am && FOOD_AMENITY.has(am)) return 'food';
    if (am && MED_AMENITY.has(am)) return 'medical';
    if (shop && MED_SHOPS.has(shop)) return 'medical';
    if (shop && TOOL_SHOPS.has(shop)) return 'tools';
    if (b && TOOL_BUILDINGS.has(b)) return 'tools';
    if (b && OFFICE_BUILDINGS.has(b)) return 'office';
    if (shop || am) return 'office';
    return 'home';
  }

  // Landmark class for special roof treatment and labels, or undefined.
  function classifyLandmark(tags) {
    const am = tags.amenity, b = tags.building, name = (tags.name || '').toLowerCase();
    if (am === 'place_of_worship' || b === 'church' || b === 'cathedral' || b === 'chapel' || b === 'mosque' || b === 'synagogue' || b === 'temple') return 'church';
    if (am === 'hospital' || b === 'hospital') return 'hospital';
    if (am === 'school' || b === 'school' || am === 'college' || am === 'university' || b === 'university' || b === 'college') return 'school';
    if (am === 'townhall' || b === 'government' || b === 'civic' || am === 'courthouse') return 'townhall';
    if (am === 'police') return 'police';
    if (am === 'fire_station') return 'fire';
    if (am === 'library') return 'library';
    if (tags.leisure === 'sports_centre' || tags.leisure === 'ice_rink' || b === 'sports_hall' || b === 'stadium' || /\b(arena|rink|sportsplex|community centre|recreation)\b/.test(name)) return 'arena';
    if (am === 'fuel') return 'fuel';
    if (tags.shop === 'supermarket' || tags.shop === 'department_store' || tags.shop === 'mall') return 'bigbox';
    if (tags.railway === 'station' || tags.public_transport === 'station') return 'station';
    return undefined;
  }
  // Roof style: pitched (houses), flat (commercial/industrial/apartments), shed (garages, sheds).
  function classifyRoof(tags, areaTiles) {
    const b = tags.building;
    if (tags['roof:shape'] === 'flat') return 'flat';
    if (tags['roof:shape'] && tags['roof:shape'] !== 'flat') return 'pitched';
    if (['house', 'detached', 'semidetached_house', 'terrace', 'residential', 'bungalow', 'cabin', 'farm', 'church', 'chapel', 'cathedral'].includes(b)) return 'pitched';
    if (['garage', 'garages', 'shed', 'hut', 'roof', 'carport', 'farm_auxiliary', 'barn'].includes(b)) return 'shed';
    if (['apartments', 'commercial', 'retail', 'industrial', 'warehouse', 'office', 'school', 'hospital', 'supermarket', 'civic', 'public', 'hotel', 'government', 'university', 'college'].includes(b)) return 'flat';
    const lv = parseInt(tags['building:levels'] || '0', 10);
    if (lv >= 3) return 'flat';
    return areaTiles > 300 ? 'flat' : 'pitched';
  }

  // Ground type from an area feature's tags, or null if not an area we care about.
  function classifyArea(tags) {
    const lu = tags.landuse, nat = tags.natural, le = tags.leisure, am = tags.amenity;
    if (nat === 'water' || lu === 'reservoir' || lu === 'basin' || nat === 'bay') return 'water';
    if (nat === 'wood' || lu === 'forest') return 'forest';
    if (nat === 'scrub' || nat === 'heath') return 'scrub';
    if (nat === 'wetland') return 'wetland';
    if (nat === 'beach' || nat === 'sand') return 'sand';
    if (lu === 'farmland' || lu === 'farmyard' || lu === 'orchard' || lu === 'vineyard') return 'farm';
    if (lu === 'meadow' || lu === 'grass' || nat === 'grassland' || lu === 'recreation_ground' || lu === 'cemetery' || lu === 'village_green') return 'grass';
    if (le === 'park' || le === 'pitch' || le === 'playground' || le === 'garden' || le === 'golf_course' || le === 'dog_park') return 'grass';
    if (am === 'parking' || lu === 'garages') return 'asphalt';
    if (lu === 'industrial' || lu === 'commercial' || lu === 'retail' || lu === 'construction' || lu === 'railway' || lu === 'quarry') return 'gravel';
    if (lu === 'residential') return 'lawn';
    return null;
  }

  const ROAD_WIDTH = {
    motorway: 14, motorway_link: 8, trunk: 12, trunk_link: 7, primary: 10, primary_link: 7,
    secondary: 8, secondary_link: 6, tertiary: 7, tertiary_link: 6, unclassified: 6, residential: 6,
    living_street: 5, service: 4, track: 3, road: 5,
  };
  const PATH_TYPES = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps', 'bridleway']);

  // ---- compaction -----------------------------------------------------------

  // Convert raw Overpass JSON into the compact place format used by the game.
  // tileM: metres per tile.
  function compact(json, meta, tileM) {
    tileM = tileM || 1;
    const [s, w, n, e] = meta.bbox;
    const lat0 = (s + n) / 2;
    const kx = M_PER_DEG_LON_EQ * Math.cos(lat0 * Math.PI / 180) / tileM;
    const ky = M_PER_DEG_LAT / tileM;
    const W = Math.ceil((e - w) * kx), H = Math.ceil((n - s) * ky);
    const proj = (lat, lon) => [(lon - w) * kx, (n - lat) * ky];

    const feats = [];
    const pois = [];
    for (const el of json.elements) {
      const tags = el.tags || {};
      if (el.type === 'node') {
        const p = proj(el.lat, el.lon);
        let dk = null;
        if (tags.natural === 'tree') dk = 'tree';
        else if (tags.highway === 'street_lamp') dk = 'lamp';
        else if (tags.highway === 'bus_stop') dk = 'bus_stop';
        else if (tags.emergency === 'fire_hydrant') dk = 'hydrant';
        else if (tags.man_made === 'water_tower') dk = 'water_tower';
        else if (tags.man_made === 'flagpole') dk = 'flagpole';
        else if (tags.amenity === 'bench') dk = 'bench';
        else if (tags.amenity === 'post_box') dk = 'postbox';
        else if (tags.amenity === 'waste_basket' || tags.amenity === 'recycling') dk = 'bin';
        if (dk) { feats.push({ k: 'n', t: dk, p: [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10], b: [Math.floor(p[0]), Math.floor(p[1]), Math.ceil(p[0]), Math.ceil(p[1])] }); continue; }
        if (!(tags.shop || tags.amenity)) continue;
        pois.push({ x: p[0], y: p[1], tags });
        continue;
      }
      if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
      const pts = [];
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const g of el.geometry) {
        const p = proj(g.lat, g.lon);
        const x = Math.round(p[0] * 10) / 10, y = Math.round(p[1] * 10) / 10;
        pts.push(x, y);
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
      const closed = el.geometry.length > 3 &&
        el.geometry[0].lat === el.geometry[el.geometry.length - 1].lat &&
        el.geometry[0].lon === el.geometry[el.geometry.length - 1].lon;
      const bb = [Math.floor(minx), Math.floor(miny), Math.ceil(maxx), Math.ceil(maxy)];
      const name = tags.name || tags.brand || undefined;

      if (tags.building && closed) {
        const areaTiles = bbArea(bb) * 0.7;
        feats.push({ k: 'b', t: tags.building, u: classifyUse(tags), n: name, p: pts, b: bb,
          lv: tags['building:levels'] ? parseInt(tags['building:levels']) : undefined,
          lm: classifyLandmark(tags), rf: classifyRoof(tags, areaTiles) });
      } else if (tags.man_made === 'water_tower' && closed) {
        const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
        feats.push({ k: 'n', t: 'water_tower', p: [cx, cy], b: bb });
      } else if (tags.railway) {
        feats.push({ k: 'r', t: 'rail', w: 3 / tileM, n: name, p: pts, b: bb, br: tags.bridge ? 1 : undefined });
      } else if (tags.barrier && !tags.highway) {
        feats.push({ k: 'f', t: tags.barrier, p: pts, b: bb });
      } else if (tags.highway) {
        if (tags.area === 'yes' && closed) { feats.push({ k: 'a', t: 'asphalt', p: pts, b: bb }); continue; }
        const isPath = PATH_TYPES.has(tags.highway);
        const width = isPath ? 2 : (ROAD_WIDTH[tags.highway] || 0);
        if (!width) continue;
        feats.push({ k: 'r', t: isPath ? 'path' : tags.highway, w: width / tileM, n: name, p: pts, b: bb,
          br: tags.bridge ? 1 : undefined });
      } else if (tags.waterway && !closed) {
        const wd = tags.waterway === 'river' ? 14 : tags.waterway === 'canal' ? 10 : tags.waterway === 'stream' ? 2 : 0;
        if (!wd) continue;
        feats.push({ k: 'r', t: 'water', w: wd / tileM, n: name, p: pts, b: bb });
      } else if (closed) {
        const g = classifyArea(tags);
        if (!g) continue;
        feats.push({ k: 'a', t: g, n: name, p: pts, b: bb });
      }
    }

    // Attach POI nodes to the building that contains them (upgrades the building's loot class and name).
    const buildings = feats.filter(f => f.k === 'b');
    for (const poi of pois) {
      let best = null;
      for (const b of buildings) {
        if (poi.x < b.b[0] || poi.x > b.b[2] || poi.y < b.b[1] || poi.y > b.b[3]) continue;
        if (pointInPoly(poi.x, poi.y, b.p)) { best = b; break; }
      }
      if (!best) {
        // Nearest building within 25 m, if any (many shops are mapped as a node beside the footprint).
        let bd = (25 / tileM) ** 2;
        for (const b of buildings) {
          const cx = (b.b[0] + b.b[2]) / 2, cy = (b.b[1] + b.b[3]) / 2;
          const d = (cx - poi.x) ** 2 + (cy - poi.y) ** 2;
          if (d < bd) { bd = d; best = b; }
        }
      }
      if (best) {
        const use = classifyUse(Object.assign({ building: best.t }, poi.tags));
        if (use !== 'home' && (best.u === 'home' || best.u === 'office')) best.u = use;
        if (!best.lm) best.lm = classifyLandmark(Object.assign({ building: best.t }, poi.tags));
        if (best.lm === 'bigbox' || best.lm === 'hospital' || best.lm === 'school') best.rf = 'flat';
        if (!best.n && (poi.tags.name || poi.tags.brand)) best.n = poi.tags.name || poi.tags.brand;
      }
    }

    // Sort areas large→small so small areas paint over large ones.
    feats.sort((a, b) => {
      const order = { a: 0, r: 1, f: 2, b: 3, n: 4 };
      if (order[a.k] !== order[b.k]) return order[a.k] - order[b.k];
      if (a.k === 'a') return bbArea(b.b) - bbArea(a.b);
      return 0;
    });

    return {
      id: meta.id, name: meta.name, bbox: meta.bbox, center: meta.center || [lat0, (w + e) / 2],
      tileM, w: W, h: H, feats, fetched: Date.now(), v: 2,
      stats: { buildings: buildings.length, roads: feats.filter(f => f.k === 'r').length, areas: feats.filter(f => f.k === 'a').length, pois: pois.length, nodes: feats.filter(f => f.k === 'n').length, landmarks: buildings.filter(b => b.lm).length },
    };
  }

  function bbArea(b) { return (b[2] - b[0]) * (b[3] - b[1]); }

  function pointInPoly(x, y, pts) {
    let inside = false;
    const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'place';
  }

  global.OSM = { geocode, bboxAround, fetchOverpass, compact, pointInPoly, slug, classifyUse, overpassQuery };
})(typeof window !== 'undefined' ? window : globalThis);
