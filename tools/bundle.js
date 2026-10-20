// tools/bundle.js — turn a raw Overpass JSON file into data/bundled.js (the offline sample town).
// usage: node tools/bundle.js <overpass.json> "<Place name>" <south> <west> <north> <east>
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '..', 'js', 'osm.js'));
const [file, name, s, w, n, e] = process.argv.slice(2);
if (!e) { console.error('usage: node tools/bundle.js <overpass.json> "<name>" <s> <w> <n> <e>'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const bbox = [s, w, n, e].map(Number);
const place = globalThis.OSM.compact(raw, { id: 'bundled-' + globalThis.OSM.slug(name), name, bbox }, 1);
const out = path.join(__dirname, '..', 'data', 'bundled.js');
fs.writeFileSync(out, 'window.BUNDLED_PLACE = ' + JSON.stringify(place) + ';\n');
console.log('wrote', out, JSON.stringify(place.stats), place.w + 'x' + place.h, 'tiles', (fs.statSync(out).size / 1e6).toFixed(1) + ' MB');
