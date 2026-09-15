#!/usr/bin/env node
/**
 * Fails the build when the reader content script's initial payload exceeds the
 * budget in .project/product-spec.md (NFR-2).
 *
 * Only the *initial* chunk counts. Shiki, KaTeX and Mermaid are dynamic
 * imports and are expected to be large; the point of the budget is that they
 * never become part of what every document pays for.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const OUT_DIR = '.output/chrome-mv3';
const BUDGET_BYTES = 300 * 1024;

async function fileSize(path) {
  const buf = await readFile(path);
  return { raw: buf.byteLength, gzip: gzipSync(buf).byteLength };
}

async function main() {
  const scriptPath = join(OUT_DIR, 'content-scripts', 'reader.js');
  try {
    await stat(scriptPath);
  } catch {
    console.error(`Build output not found at ${scriptPath}. Run "pnpm build" first.`);
    process.exit(1);
  }

  const reader = await fileSize(scriptPath);

  let chunkTotal = { raw: 0, gzip: 0 };
  try {
    const chunkDir = join(OUT_DIR, 'chunks');
    for (const name of await readdir(chunkDir)) {
      if (!name.endsWith('.js')) continue;
      const size = await fileSize(join(chunkDir, name));
      chunkTotal = { raw: chunkTotal.raw + size.raw, gzip: chunkTotal.gzip + size.gzip };
    }
  } catch {
    // No chunks directory is fine.
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log('Bundle report');
  console.log(`  reader.js (initial)   ${kb(reader.raw)} raw / ${kb(reader.gzip)} gzip`);
  console.log(
    `  all lazy chunks       ${kb(chunkTotal.raw)} raw / ${kb(chunkTotal.gzip)} gzip`,
  );
  console.log(`  budget (initial gzip) ${kb(BUDGET_BYTES)}`);

  if (reader.gzip > BUDGET_BYTES) {
    console.error(
      `\nFAIL: reader initial chunk is ${kb(reader.gzip)} gzipped, over the ${kb(BUDGET_BYTES)} budget.` +
        `\nMove the heavy dependency behind a dynamic import() instead of raising the budget.`,
    );
    process.exit(1);
  }

  console.log('\nOK: within budget.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
