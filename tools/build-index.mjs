/**
 * Builds every plugin here into an `.aspkg` and writes the `index.json` a
 * remote ArchiSimple repository serves.
 *
 * ```text
 * plugin folders ──► archisimple package build ──► dist/*.aspkg
 *                                   │
 *                                   └─► dist/index.json ──► Preferences → Repositories
 * ```
 *
 * ## It builds with the real builder, and computes nothing itself
 *
 * The archive format, its determinism and its SHA-256 belong to
 * `@archisimple/package-builder`, reached through the platform's CLI. This
 * script runs that and copies three numbers out of its JSON report; it never
 * zips, hashes or validates anything of its own.
 *
 * That restraint is the point. ArchiSimple's Finding I-82 records four sprints
 * lost to a second implementation of a host capability that drifted from the
 * first — and a *second* implementation of the package format would drift the
 * same way, except the symptom would be a checksum mismatch on a user's machine
 * rather than a fixture nobody read.
 *
 * ## Why `download` is relative
 *
 * `parsePackageIndex` resolves a relative `download` against the URL the index
 * was fetched from, "so a repository can be moved or mirrored without its index
 * being rewritten". Publishing the archives beside the index therefore works on
 * GitHub Pages, on a release, or from a folder served by anything at all — with
 * no build-time knowledge of where it will live.
 *
 *     node tools/build-index.mjs --cli <path to archisimple.js> [--out dist]
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}

const cli = argument('--cli', undefined);
const outDir = resolve(ROOT, argument('--out', 'dist'));

if (cli === undefined) {
  console.error(
    'Usage: node tools/build-index.mjs --cli <path to archisimple.js> [--out dist]\n\n' +
      'The CLI is `@archisimple/cli`, which is private and unpublished, so this\n' +
      'takes a path to a built one rather than pretending it can install it.'
  );
  process.exit(2);
}

/** A plugin is any folder holding a `package.json` that declares a package id. */
function pluginFolders() {
  const found = [];
  for (const entry of readdirSync(ROOT)) {
    if (entry.startsWith('.') || entry === 'tools' || entry === 'docs') continue;
    const folder = join(ROOT, entry);
    if (!statSync(folder).isDirectory()) continue;
    try {
      const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
      if (typeof manifest.id === 'string') found.push({ entry, folder, manifest });
    } catch {
      // No manifest, or an unreadable one. `package build` would refuse it and
      // say why; a folder that is simply not a plugin is not an error here.
    }
  }
  return found.sort((a, b) => a.entry.localeCompare(b.entry));
}

mkdirSync(outDir, { recursive: true });

const packages = [];
let failed = 0;

for (const { entry, folder, manifest } of pluginFolders()) {
  process.stdout.write(`building ${entry}… `);

  let report;
  try {
    report = JSON.parse(
      execFileSync('node', [cli, 'package', 'build', folder, '--out', outDir, '--json'], {
        encoding: 'utf8',
        cwd: ROOT
      })
    );
  } catch (error) {
    // A build that fails is reported and skipped, not fatal on its own: one
    // broken plugin should not deny every other one an index entry. The exit
    // code below still refuses to publish a partial index silently.
    console.log('FAILED');
    console.error(String(error.stdout ?? error.message).trim());
    failed += 1;
    continue;
  }

  if (!report.ok || report.archive === undefined) {
    console.log(`refused (${report.errors} error(s))`);
    for (const issue of report.issues ?? []) console.error(`  ${issue.message ?? issue}`);
    failed += 1;
    continue;
  }

  packages.push({
    // The manifest, inlined, so listing the repository costs one request.
    manifest,
    // Relative on purpose — see the header.
    download: report.archive.fileName,
    sha256: report.archive.sha256,
    size: report.archive.size
  });

  console.log(`${report.archive.fileName} (${report.archive.sha256.slice(0, 12)}…)`);
}

const index = {
  schemaVersion: 1,
  name: 'ArchiSimple plugins',
  packages
};

writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, undefined, 2)}\n`);
console.log(`\nWrote ${join(outDir, 'index.json')} with ${packages.length} package(s).`);

if (failed > 0) {
  console.error(`${failed} package(s) did not build; the index above omits them.`);
  process.exit(1);
}
