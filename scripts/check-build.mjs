#!/usr/bin/env node
/**
 * Checks the built extension against the claims made about it.
 *
 * The Chrome Web Store submission states that the package contains no remote
 * code and no `eval`, and Manifest V3 rejects an extension that breaks that.
 * It was true when checked by hand; this makes it true on every build,
 * because a dependency upgrade is all it would take.
 *
 * What counts as remote code: a bare URL in the bundle is not evidence of
 * anything. Namespace identifiers, links inside library error messages and a
 * placeholder in a form field all look identical to a URL scan, and flagging
 * them produces a page of findings with nothing in it. What matters is a
 * *loader* reaching for a remote address, so the patterns below match the
 * call site rather than the string.
 *
 * Run after `pnpm build`.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const OUT_DIR = '.output/chrome-mv3';

const REMOTE_CODE = [
  // `eval(` as a call, not as part of a longer identifier such as `medieval(`
  // or the `_eval` many bundlers emit internally.
  { name: 'eval()', pattern: /(?<![A-Za-z0-9_$.])eval\s*\(/ },
  { name: 'new Function()', pattern: /new\s+Function\s*\(/ },
  { name: 'importScripts()', pattern: /(?<![A-Za-z0-9_$.])importScripts\s*\(/ },
  {
    name: 'dynamic import of a remote URL',
    pattern: /(?<![A-Za-z0-9_$.])import\s*\(\s*[`'"]https?:/i,
  },
  {
    name: 'fetch of a remote URL',
    pattern: /(?<![A-Za-z0-9_$.])fetch\s*\(\s*[`'"]https?:/i,
  },
  { name: 'element src set to a remote URL', pattern: /\.src\s*=\s*[`'"]https?:/i },
  {
    name: 'element href set to a remote URL',
    // w3.org appears as an XML namespace, which is an identifier rather than
    // something fetched.
    pattern: /\.href\s*=\s*[`'"]https?:\/\/(?!www\.w3\.org)/i,
  },
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

async function main() {
  try {
    await stat(OUT_DIR);
  } catch {
    console.error(`Build output not found at ${OUT_DIR}. Run "pnpm build" first.`);
    process.exit(1);
  }

  const failures = [];
  let scanned = 0;

  for await (const path of walk(OUT_DIR)) {
    if (!path.endsWith('.js')) continue;
    scanned += 1;
    const source = await readFile(path, 'utf8');
    const where = relative(OUT_DIR, path);

    for (const { name, pattern } of REMOTE_CODE) {
      if (pattern.test(source)) failures.push(`${where}: contains ${name}`);
    }
  }

  console.log(`Build check: ${scanned} scripts scanned in ${OUT_DIR}`);

  if (failures.length > 0) {
    console.error('\nFAIL: the package does not match what the store listing claims.\n');
    for (const failure of failures.slice(0, 40)) console.error(`  ${failure}`);
    if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
    console.error(
      '\nManifest V3 forbids remote code, and the store listing says the package' +
        '\ncontains none. Bundle the dependency rather than fetching it.',
    );
    process.exit(1);
  }

  console.log('OK: nothing loads code from a remote address.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
