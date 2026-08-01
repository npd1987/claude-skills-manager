'use strict';

// Generates the app icon from scratch: a rounded square in the app's accent
// gradient with a white "/" through it, for the slash commands skills provide.
// Written by hand so the project keeps its zero-dependency promise:
//
//   assets/icon.ico    Windows shortcut
//   assets/icon.png    Linux, for hicolor/256x256
//   assets/icon.icns   the macOS .app bundle
//
// PNG and ICNS are both containers we assemble ourselves. zlib is the only
// thing needed for either, and it is in the standard library.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZE = 256;
// macOS picks whichever of these fits the context it is drawing.
const ICNS_ENTRIES = [
  { type: 'ic11', size: 32 },
  { type: 'ic12', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic09', size: 512 },
];

const SS = 3; // supersampling factor per axis

const TOP = [232, 128, 90];
const BOTTOM = [160, 68, 40];

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Signed distance to a rounded rectangle centred on the origin. */
function roundedRectDistance(x, y, halfW, halfH, radius) {
  const dx = Math.abs(x) - (halfW - radius);
  const dy = Math.abs(y) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Signed distance to a thick line segment. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(wx - t * vx, wy - t * vy);
}

/**
 * Renders one size as a top-down RGBA buffer, which is the layout PNG wants, and one
 * short transform away from the bottom-up BGRA that ICO wants.
 */
function renderRGBA(size) {
  const out = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const halfBox = size * 0.47;
  const radius = size * 0.23;
  const strokeHalf = size * 0.072;

  // Endpoints of the "/" stroke, in centred coordinates.
  const ax = -size * 0.15;
  const ay = size * 0.26;
  const bx = size * 0.15;
  const by = -size * 0.26;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = col + (sx + 0.5) / SS - half;
          const y = row + (sy + 0.5) / SS - half;

          // Coverage of the rounded square, softened over one pixel.
          const plate = clamp01(0.5 - roundedRectDistance(x, y, halfBox, halfBox, radius));
          if (plate <= 0) continue;

          // Diagonal gradient across the plate.
          const t = clamp01((x + y) / (size * 0.94) + 0.5);
          let pr = TOP[0] + (BOTTOM[0] - TOP[0]) * t;
          let pg = TOP[1] + (BOTTOM[1] - TOP[1]) * t;
          let pb = TOP[2] + (BOTTOM[2] - TOP[2]) * t;

          // The white slash, clipped to the plate.
          const stroke = clamp01(0.5 - (segmentDistance(x, y, ax, ay, bx, by) - strokeHalf));
          if (stroke > 0) {
            pr += (255 - pr) * stroke;
            pg += (255 - pg) * stroke;
            pb += (255 - pb) * stroke;
          }

          r += pr * plate;
          g += pg * plate;
          b += pb * plate;
          a += plate;
        }
      }

      const samples = SS * SS;
      const alpha = a / samples;
      const offset = (row * size + col) * 4;
      if (alpha > 0) {
        out[offset] = Math.round(r / a);
        out[offset + 1] = Math.round(g / a);
        out[offset + 2] = Math.round(b / a);
      }
      out[offset + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/* --------------------------------------------------------------------- ICO */

/** ICO stores pixels as BGRA with the rows running bottom-up. */
function toBGRABottomUp(size, rgba) {
  const out = Buffer.alloc(rgba.length);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const from = (row * size + col) * 4;
      const to = ((size - 1 - row) * size + col) * 4;
      out[to] = rgba[from + 2];
      out[to + 1] = rgba[from + 1];
      out[to + 2] = rgba[from];
      out[to + 3] = rgba[from + 3];
    }
  }
  return out;
}

/** Wraps BGRA pixels in a BITMAPINFOHEADER + empty AND mask. */
function toDIB(size, bgra) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND mask heights
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(bgra.length, 20);

  // 1bpp AND mask, rows padded to 4 bytes. All zero: alpha does the masking.
  const maskStride = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, bgra, Buffer.alloc(maskStride * size)]);
}

function buildICO(images) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // 1 = icon
  dir.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map((img) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 0); // 0 means 256
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += img.data.length;
    return entry;
  });

  return Buffer.concat([dir, ...entries, ...images.map((i) => i.data)]);
}

/* --------------------------------------------------------------------- PNG */

// Standard CRC-32, built once. PNG puts one on the end of every chunk.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function toPNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = RGBA
  // Compression, filter and interlace methods are all 0, which Buffer.alloc
  // has already given us.

  // Every scanline carries a leading filter byte; 0 means "store as-is" and
  // costs nothing to write, since deflate does the real work.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row++) {
    rgba.copy(raw, row * (stride + 1) + 1, row * stride, row * stride + stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------- ICNS */

/** ICNS is a length-prefixed header wrapping typed entries, PNG here. */
function buildICNS(entries) {
  const blocks = entries.map(({ type, png }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'latin1');
    header.writeUInt32BE(png.length + 8, 4); // length includes this header
    return Buffer.concat([header, png]);
  });

  const total = 8 + blocks.reduce((n, b) => n + b.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'latin1');
  header.writeUInt32BE(total, 4);
  return Buffer.concat([header, ...blocks]);
}

/* ------------------------------------------------------------------- build */

function build() {
  const outDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(outDir, { recursive: true });

  // One render per distinct size, shared by whichever formats want it.
  const sizes = [...new Set([...ICO_SIZES, PNG_SIZE, ...ICNS_ENTRIES.map((e) => e.size)])];
  const pixels = new Map(sizes.map((size) => [size, renderRGBA(size)]));

  const written = [];

  const ico = buildICO(
    ICO_SIZES.map((size) => ({ size, data: toDIB(size, toBGRABottomUp(size, pixels.get(size))) }))
  );
  fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
  written.push(`icon.ico   ${ICO_SIZES.join(', ')} px`);

  const png = toPNG(PNG_SIZE, pixels.get(PNG_SIZE));
  fs.writeFileSync(path.join(outDir, 'icon.png'), png);
  written.push(`icon.png   ${PNG_SIZE} px`);

  const icns = buildICNS(
    ICNS_ENTRIES.map(({ type, size }) => ({ type, png: toPNG(size, pixels.get(size)) }))
  );
  fs.writeFileSync(path.join(outDir, 'icon.icns'), icns);
  written.push(`icon.icns  ${ICNS_ENTRIES.map((e) => e.size).join(', ')} px`);

  for (const line of written) console.log(`  Wrote ${line}`);
}

build();
