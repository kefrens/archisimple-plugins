/**
 * The catalogue parser, its encoding and its identity rules.
 *
 * Runs with `node --test` — no install, no build step, because the entry point
 * is plain ES module JavaScript the runtime can import directly. That is the
 * same property the application relies on when it hot-reloads this package from
 * a Development Repository, so a test that needed a build step would be testing
 * something other than what ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  catalogueIndices,
  isNearThreshold,
  normaliseSourceKey,
  openingKindFor,
  parseProperties,
  toMetres,
  unescapeProperties
} from '../src/index.js';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('the manifest declares an extension that needs the import capability', () => {
  assert.equal(manifest.type, 'extension');
  assert.equal(manifest.entryPoint, 'src/index.js');
  assert.deepEqual(manifest.capabilities, ['import']);
  // 1.1 is the SDK build that shipped the importer contract; a 1.0 host has no
  // `importer` token and refuses this with a reason rather than failing later.
  assert.equal(manifest.sdkVersion, '1.1');
});

/* -------------------------------------------------------------------------- */

test('parses keys, values and both separators', () => {
  const values = parseProperties(['a=1', 'b:2', '  c = 3  '].join('\n'));
  assert.equal(values.a, '1');
  assert.equal(values.b, '2');
  assert.equal(values.c, '3  ');
});

test('ignores comments in both forms, and blank lines', () => {
  const values = parseProperties(['# a comment', '! another', '', 'a=1'].join('\n'));
  assert.deepEqual(Object.keys(values), ['a']);
});

test('joins a continued line', () => {
  const values = parseProperties(['name#1=Chaise \\', '  pliante', 'width#1=45'].join('\n'));
  assert.equal(values['name#1'], 'Chaise pliante');
  assert.equal(values['width#1'], '45');
});

test('a duplicate key takes the last value, as every properties reader does', () => {
  assert.equal(parseProperties('a=1\na=2').a, '2');
});

test('a bare key with no separator is the empty string', () => {
  assert.equal(parseProperties('lonely').lonely, '');
});

/* -------------------------------------------------------------------------- */

test('unescapes \\uXXXX, which is how Latin-1 carries what it cannot hold', () => {
  // Exact strings, not "non-empty": mojibake in a name is found by users, not by
  // a test asserting a name is a string.
  assert.equal(unescapeProperties('Chaise pliante en m\\u00e9tal'), 'Chaise pliante en métal');
  assert.equal(unescapeProperties('\\u00c9tag\\u00e8re'), 'Étagère');
});

test('unescapes the ordinary escapes and leaves a malformed one alone', () => {
  assert.equal(unescapeProperties('a\\nb'), 'a\nb');
  assert.equal(unescapeProperties('a\\tb'), 'a\tb');
  assert.equal(unescapeProperties('a\\:b'), 'a:b');
  assert.equal(unescapeProperties('a\\\\b'), 'a\\b');
  assert.equal(unescapeProperties('a\\uZZZZ'), 'auZZZZ');
});

test('an escaped separator stays inside the key', () => {
  const values = parseProperties('a\\=b=1');
  assert.equal(values['a=b'], '1');
});

/* -------------------------------------------------------------------------- */

test('reads every declared index, including across gaps', () => {
  // A real library has gaps: an author deleting an entry leaves one, and
  // counting from 1 would stop at the first hole.
  const values = parseProperties(['name#1=A', 'name#3=C', 'name#10=J'].join('\n'));
  assert.deepEqual(catalogueIndices(values), [1, 3, 10]);
});

test('library-level keys carry no index and are not mistaken for one', () => {
  const values = parseProperties(['name=Contributions', 'name#1=A'].join('\n'));
  assert.deepEqual(catalogueIndices(values), [1]);
});

/* -------------------------------------------------------------------------- */

test('converts centimetres to metres, asserted as specific metre values', () => {
  // The bug that would otherwise ship: a 45 cm chair becoming a 45 m chair is a
  // plausible number in the wrong unit, and passes every "positive and finite"
  // check there is.
  assert.equal(toMetres(45), 0.45);
  assert.equal(toMetres(204), 2.04);
  assert.equal(toMetres(0), 0);
  assert.equal(toMetres(83), 0.83);
});

/* -------------------------------------------------------------------------- */

test('normalises a name into a reproducible identifier', () => {
  assert.equal(normaliseSourceKey('  Chaise pliante en métal '), 'chaise-pliante-en-metal');
  assert.equal(normaliseSourceKey('Étagère 2 portes'), 'etagere-2-portes');
  assert.equal(normaliseSourceKey('!!!'), '');
});

test('two names that differ only by accent or case collide, which is fatal upstream', () => {
  // Documented rather than worked around: a suffix assigned by position is the
  // index problem wearing a disguise, so `readSh3f` refuses the whole library.
  assert.equal(normaliseSourceKey('Étagère'), normaliseSourceKey('etagere'));
});

/* -------------------------------------------------------------------------- */

test('doorOrWindow says that it is one; elevation says which', () => {
  assert.equal(openingKindFor(0), 'door');
  assert.equal(openingKindFor(9.9), 'door');
  assert.equal(openingKindFor(10), 'window');
  assert.equal(openingKindFor(90), 'window');
  // Absent elevation is floor level, which is a door.
  assert.equal(openingKindFor(undefined), 'door');
});

test('an item near the threshold is flagged, so the guess is visible', () => {
  assert.equal(isNearThreshold(8), true);
  assert.equal(isNearThreshold(14), true);
  assert.equal(isNearThreshold(0), false);
  assert.equal(isNearThreshold(90), false);
});
