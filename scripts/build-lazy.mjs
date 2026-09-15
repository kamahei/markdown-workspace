#!/usr/bin/env node
/**
 * Bundles the enrichment libraries into standalone ES modules.
 *
 * A Manifest V3 content script is a classic script, so the bundler cannot
 * code-split it: a dynamic import() inside the reader would be inlined,
 * putting Shiki, KaTeX and Mermaid into every document load. Instead these are
 * built separately into `public/lazy/` and imported by URL at runtime, which
 * was verified to work in a real content script (open question Q11).
 *
 * The output is generated, not source: it is gitignored and rebuilt by
 * `pnpm build` and `pnpm dev`.
 */
import { build } from 'vite';
import { rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

const OUT_DIR = 'public/lazy';

const ENTRIES = {
  highlight: 'src/lazy/highlight.entry.ts',
  math: 'src/lazy/math.entry.ts',
  diagram: 'src/lazy/diagram.entry.ts',
};

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });

  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      outDir: OUT_DIR,
      // outDir lives inside publicDir; disabling the public copy stops Vite
      // from trying to copy the folder into itself.
      copyPublicDir: false,
      emptyOutDir: true,
      target: 'chrome120',
      minify: true,
      cssCodeSplit: false,
      rollupOptions: {
        input: ENTRIES,
        // Without this the entries are treated as application roots and their
        // exports are tree-shaken away, leaving modules that load fine and
        // export nothing.
        preserveEntrySignatures: 'strict',
        output: {
          format: 'es',
          // Stable names: the reader imports these by URL, and a hashed name
          // would change every build and break the manifest declaration.
          entryFileNames: '[name].js',
          chunkFileNames: 'chunk-[name]-[hash].js',
          assetFileNames: '[name][extname]',
        },
      },
    },
  });

  const files = await readdir(OUT_DIR);
  let total = 0;
  const rows = [];

  for (const name of files) {
    const path = join(OUT_DIR, name);
    if (!(await stat(path)).isFile()) continue;
    const buf = await readFile(path);
    total += buf.byteLength;
    rows.push([name, buf.byteLength, gzipSync(buf).byteLength]);
  }

  rows.sort((a, b) => b[1] - a[1]);
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

  console.log(`Lazy chunks -> ${OUT_DIR}`);
  for (const [name, raw, gz] of rows.slice(0, 8)) {
    console.log(`  ${name.padEnd(36)} ${kb(raw).padStart(10)} / ${kb(gz)} gzip`);
  }
  if (rows.length > 8) console.log(`  … and ${rows.length - 8} more`);
  console.log(`  total ${kb(total)} across ${rows.length} files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
