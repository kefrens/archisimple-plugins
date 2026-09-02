/**
 * Reads `dist/index.json` with **the platform's own parser**, and fails if it
 * would refuse anything.
 *
 * `parsePackageIndex` is what the application runs when a user adds this
 * repository under Preferences → Repositories. Checking against it — rather than
 * against a schema restated here — means an index this accepts is one the
 * application accepts, and the failure arrives in CI instead of as a package
 * that silently never appears in somebody's list.
 *
 * The parser drops a bad entry rather than refusing the document, which is right
 * for a user (one broken package should not cost them the other nine) and wrong
 * for a publisher: an index that quietly lost a package is exactly what should
 * stop a release. So this treats **any** issue as a failure, and compares the
 * entry count against what the index claims to hold.
 *
 *     node tools/check-index.mjs --platform <path to an archisimple checkout>
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}

const platform = resolve(ROOT, argument('--platform', '.platform'));
const indexPath = resolve(ROOT, argument('--index', 'dist/index.json'));

const { parsePackageIndex } = await import(
  pathToFileURL(resolve(platform, 'packages/package-manager/dist/index.js')).href
).catch((error) => {
  console.error(
    `Could not load the platform's package manager from ${platform}.\n` +
      'Build it first: pnpm --filter @archisimple/cli build\n\n' +
      String(error.message)
  );
  process.exit(2);
});

const raw = JSON.parse(readFileSync(indexPath, 'utf8'));

// A plausible published URL. It matters only because relative `download` values
// resolve against it, so this proves they resolve at all.
const parsed = parsePackageIndex(raw, 'https://example.invalid/plugins/index.json');

console.log(`${parsed.entries.length} of ${raw.packages.length} package(s) accepted.`);
for (const entry of parsed.entries) {
  console.log(`  - ${entry.id}@${entry.version} → ${entry.download}`);
}

let failed = false;

for (const issue of parsed.issues) {
  console.error(`  ! ${issue.message ?? String(issue)}`);
  failed = true;
}

if (parsed.entries.length !== raw.packages.length) {
  console.error(
    `The parser kept ${parsed.entries.length} of ${raw.packages.length} entries. ` +
      'A dropped entry is a package nobody can install and nobody is told about.'
  );
  failed = true;
}

if (parsed.entries.length === 0) {
  console.error('The index advertises nothing, which is not a repository worth publishing.');
  failed = true;
}

process.exit(failed ? 1 : 0);
