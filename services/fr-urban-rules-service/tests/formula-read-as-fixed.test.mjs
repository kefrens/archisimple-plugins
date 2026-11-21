/**
 * Sprint 002.45, from the other-document run of 002.44: « un recul (L) au moins égal à la différence de niveau (H) …,
 * diminuée de 4 mètres, avec un minimum de 4 mètres, soit L = H-4 ≥ 4m » was read once in three as a plain
 * « minimum 4 m » (3 rules). The 4 m is the floor of a formula, not the distance: a number the plot would be measured
 * by, wrongly. A fixed metre limit on a setback whose passage makes the distance depend on a difference of level is
 * kept as a statement in words. The formula read as `height_relative` and every plain setback are untouched.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractChapter } from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import { fakeAi, rule } from './ai-fake.mjs';

const PAD =
  'Les dispositions du présent article s’appliquent aux constructions nouvelles et aux extensions.';
const chapter = (...lines) =>
  prepareChapter([
    { page: 20, text: ['Article 7 – Implantation', PAD, PAD, ...lines, PAD].join('\n') }
  ]);

const FORMULA =
  'Dans le reste de la zone UC, les constructions doivent s’implanter en respectant un recul (L) au moins égal à la différence de niveau (H) entre tout point du bâtiment à édifier et le point le plus proche de la limite séparative, diminuée de 4 mètres, avec un minimum de 4 mètres, soit L = H-4 ≥ 4m.';
const PLAIN =
  'Les annexes et piscines doivent s’implanter en respectant un recul minimum de 4 mètres des limites séparatives.';

const fixed = { kind: 'value', comparison: 'min', value: 4, unit: 'm' };
const relative = {
  kind: 'height_relative',
  reference: 'altitude_difference',
  factor: 1,
  offsetMetres: -4,
  minimumMetres: 4
};

const read = async (kind, limit, passage) => {
  const ai = fakeAi({
    plan: () => [{ value: rule({ kind, statement: 'limit', limit }), passage }]
  });
  return extractChapter({ prepared: chapter(passage), ai });
};

test('a fixed 4 m on a setback that depends on a difference of level is a statement in words, not a number', async () => {
  const out = await read('boundary_setback', fixed, FORMULA);
  const [r] = out.rules;
  assert.equal(r.statement, 'described');
  assert.equal(r.limit, null);
  assert.equal(r.confidence, 'low');
  assert.equal(out.dropped.formulaReadAsFixed, 1);
});

test('the same on a road setback and with « différence d’altitude »', async () => {
  const text = FORMULA.replace('différence de niveau', 'différence d’altitude');
  const out = await read('road_setback', fixed, text);
  assert.equal(out.rules[0].statement, 'described');
  assert.equal(out.rules[0].limit, null);
});

test('the formula read as a relative height is kept', async () => {
  const out = await read('boundary_setback', relative, FORMULA);
  assert.equal(out.rules[0].statement, 'limit');
  assert.deepEqual(out.rules[0].limit, relative);
  assert.equal(out.dropped.formulaReadAsFixed, undefined);
});

test('a plain fixed setback is untouched', async () => {
  const out = await read('boundary_setback', fixed, PLAIN);
  assert.equal(out.rules[0].statement, 'limit');
  assert.deepEqual(out.rules[0].limit, fixed);
  assert.equal(out.dropped.formulaReadAsFixed, undefined);
});

test('a height that only mentions a difference of level is not a setback: untouched', async () => {
  const text =
    'La hauteur totale ne peut excéder 9 mètres, mesurée à partir du terrain naturel, sans tenir compte de la différence de niveau entre les points.';
  const out = await read(
    'height_total',
    { kind: 'value', comparison: 'max', value: 9, unit: 'm' },
    text
  );
  assert.equal(out.rules[0].statement, 'limit');
  assert.equal(out.dropped.formulaReadAsFixed, undefined);
});
