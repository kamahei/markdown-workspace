#!/usr/bin/env node
/**
 * Generates the `_locales` files Chrome reads, from the TypeScript
 * catalogues in `src/ui/i18n/`.
 *
 * Chrome wants one JSON file per language, in a fixed shape, under
 * `public/_locales/<lang>/messages.json`. Keeping the catalogues in
 * TypeScript instead and generating those is what lets the compiler see a
 * mistyped key and lets one type assert that both languages carry the same
 * ones.
 *
 * It also decides something beyond the extension: the Chrome Web Store
 * derives the languages a listing may be written in from the `_locales`
 * folders in the uploaded package. Without this there is no Japanese tab in
 * the dashboard to paste a Japanese listing into.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', '_locales');

/** Strips TypeScript so the catalogues can be read without a compiler. */
async function readCatalogue(name) {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(join(root, 'src', 'ui', 'i18n', `${name}.ts`), 'utf8');

  const body = source.slice(source.indexOf('{', source.indexOf('export const')));
  const entries = {};
  // key: 'value' or key: "value", with the value possibly wrapped over lines.
  const pattern =
    /(\w+):\s*(['"])((?:\\.|(?!\2)[^\\])*)\2\s*(?:\+\s*(['"])((?:\\.|(?!\4)[^\\])*)\4\s*)*,/g;
  for (const match of body.matchAll(pattern)) {
    const whole = match[0];
    // Concatenated string literals are joined; the source wraps long ones.
    const parts = [...whole.matchAll(/(['"])((?:\\.|(?!\1)[^\\])*)\1/g)].map((p) =>
      p[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
    );
    entries[match[1]] = parts.join('');
  }
  return entries;
}

async function main() {
  const en = await readCatalogue('en');
  const ja = await readCatalogue('ja');

  const enKeys = Object.keys(en);
  if (enKeys.length === 0) {
    console.error('Read no messages from src/ui/i18n/en.ts. Has its shape changed?');
    process.exit(1);
  }

  const missing = enKeys.filter((key) => !(key in ja));
  const extra = Object.keys(ja).filter((key) => !(key in en));
  if (missing.length > 0 || extra.length > 0) {
    console.error('The catalogues disagree.');
    if (missing.length > 0) console.error('  missing from ja:', missing.join(', '));
    if (extra.length > 0) console.error('  not in en:', extra.join(', '));
    process.exit(1);
  }

  const badKey = enKeys.find((key) => !/^[A-Za-z0-9_]+$/.test(key));
  if (badKey) {
    console.error(`Chrome only accepts [A-Za-z0-9_] in a message key: "${badKey}".`);
    process.exit(1);
  }

  for (const [lang, catalogue] of [
    ['en', en],
    ['ja', ja],
  ]) {
    const messages = {};
    for (const key of enKeys) messages[key] = { message: catalogue[key] };
    const dir = join(OUT, lang);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'messages.json'),
      `${JSON.stringify(messages, null, 2)}\n`,
      'utf8',
    );
    console.log(`  public/_locales/${lang}/messages.json  (${enKeys.length} messages)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
