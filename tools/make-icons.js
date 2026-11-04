// Draws the app icon (gold ring + birthday candle on plum) and writes PNGs into docs/icons: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const out = path.join(__dirname, '..', 'docs', 'icons');
fs.mkdirSync(out, { recursive: true });

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const PLUM = hex('#2a1830'), GOLD = hex('#ecc979'), BERRY = hex('#c2456a'), CREAM = hex('#fff1d6');

// shape tests in unit coordinates (0..1); later shapes paint over earlier ones
function colourAt(x, y) {
  const dx = x - 0.5, dy = y - 0.5, r = Math.hypot(dx, dy);
  let c = PLUM;
  if (r > 0.315 && r < 0.35) c = GOLD;                                                 // ring
  if (x > 0.32 && x < 0.68 && y > 0.64 && y < 0.69) c = GOLD;                          // cake top
  if (x > 0.455 && x < 0.545 && y > 0.43 && y < 0.64) c = BERRY;                       // candle
  if (x > 0.455 && x < 0.545 && ((y - 0.43) * 40 | 0) % 3 === 1 && y < 0.64) c = CREAM; // candle stripes
  const fx = (x - 0.5) / 0.045, fy = (y - 0.355) / 0.075;
  if (fx * fx + fy * fy < 1 && !(y > 0.355 && fx * fx + fy * fy > 0.6 && y > 0.40)) c = GOLD; // flame
  return c;
}

function png(size) {
  const ss = 4, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = colourAt((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = acc[0] / (ss * ss); raw[o + 1] = acc[1] / (ss * ss); raw[o + 2] = acc[2] / (ss * ss); raw[o + 3] = 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

[['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]].forEach(([name, size]) => {
  fs.writeFileSync(path.join(out, name), png(size));
  console.log('wrote', name);
});
