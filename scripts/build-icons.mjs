#!/usr/bin/env node
/**
 * Generates the extension icons.
 *
 * Written as a generator rather than committed binaries so the mark can be
 * adjusted in one place and every size stays consistent. Rasterizes with 4x
 * supersampling; a 16px icon drawn without antialiasing looks broken.
 *
 * Output: public/icon/{16,32,48,128}.png, and the Chrome Web Store icon in
 * store-assets/.
 *
 * The store icon is the same mark on a 128 canvas with the artwork inset,
 * which is what the store's image guidance asks for: it draws its own frame
 * around what you supply, and a full-bleed square gets its corners clipped.
 * The extension icons stay full-bleed, because Chrome frames those itself.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = 'public/icon';
const STORE_DIR = 'store-assets';
const SUPERSAMPLE = 4;

/** Transparent margin, as a fraction of the canvas. */
const EXTENSION_INSET = 0.02;
/** 16px of 128, the padding the store's guidance describes. */
const STORE_INSET = 16 / 128;

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
 * A sidebar beside lines of text: the one thing this extension does that a
 * single-file viewer does not. The first mark was a downward chevron over a
 * bar, which at any size read as a download arrow -- the wrong verb entirely
 * for something that renders what you already have.
 *
 * Deliberately chunky, because the smallest size it has to survive is 16
 * pixels: two text lines rather than three, and a sidebar wide enough to
 * stay a shape rather than becoming a hairline.
 *
 * `inset` is the transparent margin. Zero for the extension icons, which
 * Chrome frames itself; the store icon asks for artwork inside a 128 canvas,
 * so it renders the same mark smaller rather than a different mark.
 */
function shapeAt(x, y, inset = EXTENSION_INSET) {
  const span = 1 - inset * 2;
  const r = 0.22 * span;
  if (!roundedRect(x, y, inset, inset, span, span, r)) return null;

  // Everything below is in 0..1 of the mark, then mapped onto the canvas.
  const u = (x - inset) / span;
  const v = (y - inset) / span;

  // Sidebar: a full-height column on the left.
  const sidebar = u >= 0.18 && u <= 0.34 && v >= 0.22 && v <= 0.78;

  // Text lines: the document beside it. Two, of different lengths.
  //
  // Sized against the 16px grid rather than by eye. At that size the mark
  // has about twelve usable pixels: a third line, or thinner ones, drop out
  // entirely at the rounding -- which is how a previous attempt rendered as
  // two disconnected dashes.
  const line = (top, right) => u >= 0.44 && u <= right && v >= top && v <= top + 0.16;
  const text = line(0.26, 0.82) || line(0.58, 0.68);

  return sidebar || text ? FG : BG;
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

function renderIcon(size, inset = EXTENSION_INSET) {
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
          const colour = shapeAt(nx, ny, inset);
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

  await mkdir(STORE_DIR, { recursive: true });
  const store = renderIcon(128, STORE_INSET);
  await writeFile(`${STORE_DIR}/store-icon-128.png`, store);
  console.log(`  ${STORE_DIR}/store-icon-128.png  ${store.length} bytes`);

  console.log(`Generated ${SIZES.length} icons and the store icon.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
