// tools/favicon.js — build favicon.svg and favicon.png from a 12x12 pixel grid (no image libraries needed).
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const PAL = { h: '#2b3a22', z: '#8fae6e', Z: '#5f7d45', r: '#e02020', k: '#1b1b1f', w: '#f2f2ee', x: '#6b1515' };
const ROWS = [
  '..hhhhhhhh..',
  '.hhhhhhhhhh.',
  'hhzzzzzzzzhh',
  'hzzzzzzzzzzh',
  '.zzxxzzzxxz.',
  '.zzrkzzzkrz.',
  '.zzzzzzzzzz.',
  '.zzzzZZzzzz.',
  '.zzkkkkkkzz.',
  '.zzkwkwkwzz.',
  '..zzkkkkzz..',
  '...zzzzzz...',
];
const S = 12;
// SVG: one rect per pixel, crisp at any size.
let rects = '';
ROWS.forEach((row, y) => [...row].forEach((ch, x) => { if (PAL[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[ch]}"/>`; }));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges">${rects}</svg>\n`;
fs.writeFileSync(path.join(__dirname, '..', 'favicon.svg'), svg);
// PNG: scale 4x to 48x48, RGBA, filter 0 on every scanline.
const scale = 4, W = S * scale;
const raw = Buffer.alloc((W * 4 + 1) * W);
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const ch = ROWS[Math.floor(y / scale)][Math.floor(x / scale)], col = PAL[ch];
    const o = y * (W * 4 + 1) + 1 + x * 4;
    if (col) { raw[o] = parseInt(col.slice(1, 3), 16); raw[o + 1] = parseInt(col.slice(3, 5), 16); raw[o + 2] = parseInt(col.slice(5, 7), 16); raw[o + 3] = 255; }
  }
}
const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable.push(c >>> 0); }
const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, '..', 'favicon.png'), png);
console.log('wrote favicon.svg (' + svg.length + ' bytes) and favicon.png (' + png.length + ' bytes, ' + W + 'x' + W + ')');
