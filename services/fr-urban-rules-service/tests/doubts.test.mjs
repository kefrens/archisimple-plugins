/**
 * Sprint 002.46, Epic 4: a rule that is not read with full confidence says why. `confidence` stays what it was
 * (a label for a person); `doubts` lists the causes, so a consumer can tell a placement doubt (the sentence repeats
 * across sectors) from a doubt about the reading itself (a quoted condition not found, a figure not in the text).
 * The list is always present on a placed rule, empty when nothing is in doubt. No schema or prompt change.
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

const SENTENCE = 'Le retrait par rapport aux limites séparatives est au moins égal à 4 mètres.';
const min4 = { kind: 'value', comparison: 'min', value: 4, unit: 'm' };
const setback = (fields) =>
  rule({ kind: 'boundary_setback', statement: 'limit', limit: min4, ...fields });

const readOne = async (value, passage, lines = [passage]) => {
  const ai = fakeAi({ plan: () => [{ value, passage }] });
  return (await extractChapter({ prepared: chapter(...lines), ai })).rules[0];
};

test('a rule nothing doubts has an empty list and keeps its confidence', async () => {
  const r = await readOne(setback(), SENTENCE);
  assert.deepEqual(r.doubts, []);
  assert.equal(r.confidence, 'high');
});

test('the model’s own hedge is a doubt, with what it said', async () => {
  assert.deepEqual((await readOne(setback({ confidence: 'medium' }), SENTENCE)).doubts, [
    'model-medium'
  ]);
  const low = await readOne(setback({ confidence: 'low' }), SENTENCE);
  assert.deepEqual(low.doubts, ['model-low']);
  assert.equal(low.confidence, 'low');
  // A confidence the model wrote as something else is read as low, and says so.
  assert.deepEqual((await readOne(setback({ confidence: 'sure' }), SENTENCE)).doubts, [
    'model-low'
  ]);
});

test('a sentence that repeats and that the sector heading cannot place is a placement doubt', async () => {
  const r = await readOne(setback(), SENTENCE, [SENTENCE, SENTENCE]);
  assert.equal(r.occurrence.of, 2);
  assert.deepEqual(r.doubts, ['sentence-repeated']);
  assert.equal(r.confidence, 'low');
});

test('a quoted condition the text does not hold is a doubt about the reading', async () => {
  const r = await readOne(setback({ conditions: ['dans le secteur UZ9 imaginaire'] }), SENTENCE);
  assert.deepEqual(r.conditions, []);
  assert.deepEqual(r.doubts, ['condition-not-found']);
  assert.equal(r.confidence, 'low');
});

test('a figure that is not in the quoted passage is a doubt about the reading', async () => {
  const r = await readOne(
    setback({ limit: { kind: 'value', comparison: 'min', value: 5, unit: 'm' } }),
    SENTENCE
  );
  assert.deepEqual(r.doubts, ['figure-not-in-text']);
});

test('a comparison that disagrees with the words is a doubt', async () => {
  const r = await readOne(
    setback({ limit: { kind: 'value', comparison: 'max', value: 4, unit: 'm' } }),
    SENTENCE
  );
  assert.ok(r.doubts.includes('comparison-disagrees'));
});

test('a formula read as a fixed figure and a strip the text does not write are doubts', async () => {
  const formula =
    'Un recul (L) au moins égal à la différence de niveau (H), diminuée de 4 mètres, avec un minimum de 4 mètres, soit L = H-4 ≥ 4m.';
  const f = await readOne(setback(), formula);
  assert.equal(f.statement, 'described');
  assert.deepEqual(f.doubts, ['formula-read-as-fixed']);
  const strip = await readOne(
    rule({
      kind: 'height_total',
      statement: 'limit',
      limit: { kind: 'value', comparison: 'max', value: 4, unit: 'm' },
      strip: { depthMetres: 7, edges: 'side_rear', permits: true }
    }),
    'La hauteur totale est inférieure ou égale à 4 mètres.'
  );
  assert.equal(strip.statement, 'described');
  assert.deepEqual(strip.doubts, ['strip-not-in-text']);
});

test('doubts add up, in the order the checks run', async () => {
  const r = await readOne(
    setback({ confidence: 'medium', conditions: ['une condition absente du texte'] }),
    SENTENCE
  );
  assert.deepEqual(r.doubts, ['model-medium', 'condition-not-found']);
});
