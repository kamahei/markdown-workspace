#!/usr/bin/env node
/**
 * Generates the extension icons.
 *
 * Written as a generator rather than committed binaries so the mark can be
 * adjusted in one place and every size stays consistent. Rasterizes with 4x
 * supersampling; a 16px icon drawn without antialiasing looks broken.
 *
 * Output: public/icon/{16,32,48,128}.png
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = 'public/icon';
const SUPERSAMPLE = 4;

/** Accent blue, matching --mw-accent in the light theme. */
const BG = [31, 111, 235];
const FG = [255, 255, 255];

// --- PNG encoding ---------------------------------------------------------

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes RGBA pixel data as a PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte per scanline; filter 0 (none) keeps this simple and the
  // images are tiny enough that the compression difference is irrelevant.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- The mark -------------------------------------------------------------

/**
 * Coverage of the icon shape at a normalized point, 0..1 across the icon.
 *
 * The mark is a rounded square with a downward chevron over a baseline bar:
 * a document that reads downward. Deliberately chunky, because the smallest
 * size it has to survive is 16 pixels.
 */
function shapeAt(x, y) {
  // Rounded-square background.
  const r = 0.22;
  const inside = roundedRect(x, y, 0.02, 0.02, 0.96, 0.96, r);
  if (!inside) return null;

  // Chevron: two strokes meeting at a point.
  const chevron =
    stroke(x, y, 0.26, 0.4, 0.5, 0.64, 0.115) ||
    stroke(x, y, 0.74, 0.4, 0.5, 0.64, 0.115);

  // Vertical stem above the chevron's meeting point.
  const stem = stroke(x, y, 0.5, 0.24, 0.5, 0.6, 0.115);

  // Baseline bar.
  const bar = x >= 0.26 && x <= 0.74 && y >= 0.72 && y <= 0.81;

  return chevron || stem || bar ? FG : BG;
}

function roundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (
    (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2 + 1e-9 ||
    (px >= x + r && px <= x + w - r) ||
    (py >= y + r && py <= y + h - r)
  );
}

/** True when the point lies within `half` of the segment (ax,ay)-(bx,by). */
function stroke(px, py, ax, ay, bx, by, half) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0), 1);
  const nx = ax + t * dx;
  const ny = ay + t * dy;
  return (px - nx) ** 2 + (py - ny) ** 2 <= half * half;
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const nx = (x + (sx + 0.5) / SUPERSAMPLE) / size;
          const ny = (y + (sy + 0.5) / SUPERSAMPLE) / size;
          const colour = shapeAt(nx, ny);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 255;
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const offset = (y * size + x) * 4;
      const covered = a / 255;
      if (covered > 0) {
        rgba[offset] = Math.round(r / covered);
        rgba[offset + 1] = Math.round(g / covered);
        rgba[offset + 2] = Math.round(b / covered);
      }
      rgba[offset + 3] = Math.round(a / samples);
    }
  }

  return encodePng(size, size, rgba);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const size of SIZES) {
    const png = renderIcon(size);
    await writeFile(`${OUT_DIR}/${size}.png`, png);
    console.log(`  ${OUT_DIR}/${size}.png  ${png.length} bytes`);
  }

  console.log(`Generated ${SIZES.length} icons.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
