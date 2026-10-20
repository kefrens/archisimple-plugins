/**
 * A service is not a package (Sprint 002.5a DEC-1, criterion 1): neither the
 * editor's Development Repository nor `tools/build-index.mjs` may list
 * anything under `services/`.
 *
 * Both rules are copied here, since neither can be imported:
 *
 * - `findPackageRoots` (archisimple `apps/web/src/resources/developmentRepository.ts`):
 *   the root itself when it holds a `package.json`, otherwise every immediate
 *   subfolder that does — "deliberately one level deep";
 * - `pluginFolders` (`tools/build-index.mjs`): an immediate folder whose
 *   `package.json` declares an `id`.
 *
 * If either rule changes over there, this copy must change with it.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from '../../fr-urban-rules-service/tests/helpers.mjs';

function findPackageRoots(root) {
  if (existsSync(join(root, 'package.json'))) return [''];
  return readdirSync(root).filter((name) => {
    const folder = join(root, name);
    return statSync(folder).isDirectory() && existsSync(join(folder, 'package.json'));
  });
}

function buildIndexFolders(root) {
  return readdirSync(root).filter((entry) => {
    if (entry.startsWith('.') || entry === 'tools' || entry === 'docs') return false;
    const folder = join(root, entry);
    if (!statSync(folder).isDirectory()) return false;
    try {
      return typeof JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).id === 'string';
    } catch {
      return false;
    }
  });
}

test('the Development Repository sees no service: services/ holds no package.json, and the root none', () => {
  assert.equal(existsSync(join(REPO, 'package.json')), false, 'a root package.json would make the repository one package');
  assert.equal(existsSync(join(REPO, 'services', 'package.json')), false);
  const roots = findPackageRoots(REPO);
  assert.ok(roots.includes('fr-urban-rules'), 'the rule still finds the packages');
  assert.ok(!roots.includes('services'));
  assert.ok(!roots.some((r) => r === '' || r.includes('/')));
});

test('build-index lists no service: no service manifest declares an id', () => {
  const folders = buildIndexFolders(REPO);
  assert.ok(folders.includes('fr-urban-rules'));
  assert.ok(!folders.includes('services'));
  for (const name of readdirSync(join(REPO, 'services'))) {
    const manifest = join(REPO, 'services', name, 'package.json');
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
    assert.equal(parsed.id, undefined, `${name} must not look like an ArchiSimple manifest`);
    assert.equal(parsed.private, true, `${name} is never published`);
  }
});
