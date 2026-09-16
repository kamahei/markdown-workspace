import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * What this repository is allowed to publish.
 *
 * The source is public; the development documentation is not, and neither is
 * anything about the machine a file was captured on. A committed Chrome
 * directory listing once carried the absolute temporary path it was taken
 * from, username included — captured honestly, published carelessly. These
 * run in the ordinary suite so the answer is checked on every commit rather
 * than remembered before a release.
 */

function trackedFiles(): string[] | null {
  try {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  } catch {
    // No git, or not a checkout: nothing to assert about tracking.
    return null;
  }
}

const files = trackedFiles();
const describeTracked = files ? describe : describe.skip;

/** Text files only: a binary would produce noise, not findings. */
function textContents(): Array<[string, string]> {
  return (files ?? [])
    .filter((f) => !/\.(png|jpg|jpeg|gif|webp|woff2?|ico|zip|pdf)$/i.test(f))
    .filter((f) => {
      try {
        // A lockfile is large and machine-generated; paths in it would be
        // package names, not filesystem paths.
        return statSync(f).size < 2_000_000;
      } catch {
        return false;
      }
    })
    .map((f) => [f, readFileSync(f, 'utf8')]);
}

describeTracked('what gets published', () => {
  it('tracks no local-only development documentation', () => {
    // These are gitignored by design. A stray `git add -f` would publish the
    // whole planning pack, which is deliberately not public.
    const leaked = files!.filter((f) => f === 'AGENTS.md' || f.startsWith('.project/'));
    expect(leaked).toEqual([]);
  });

  it('embeds no absolute path from a developer machine', () => {
    // Home directories carry the account name on every platform. Test
    // fixtures legitimately contain invented ones — a path has to look like
    // a path — so the placeholder list is what separates a made-up user from
    // a real one.
    const PLACEHOLDERS = new Set(['me', 'user', 'test', 'example', 'runner']);
    const patterns = [
      /[A-Za-z]:\\+Users\\+([A-Za-z0-9._~-]+)/g,
      /\/(?:Users|home)\/([A-Za-z0-9._-]+)\//g,
    ];

    const offenders: string[] = [];
    for (const [name, text] of textContents()) {
      // This file names the patterns it looks for.
      if (name === 'tests/unit/repo-hygiene.test.ts') continue;
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          if (PLACEHOLDERS.has(match[1]!.toLowerCase())) continue;
          offenders.push(`${name}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('tracks no secret or credential file', () => {
    const suspicious = files!.filter((f) =>
      /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|store-credentials\.json|.*\.p12)$/.test(f),
    );
    expect(suspicious).toEqual([]);
  });
});
