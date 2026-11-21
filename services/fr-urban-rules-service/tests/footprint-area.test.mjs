/**
 * Sprint 002.36, Epic 1: a footprint cap written as an area (« L'emprise au sol … est limitée à 250 m² »), alone or
 * beside a percentage. Lotissement and hameau rules often state it; both apply and the stricter binds. The kind stays
 * `footprint_ratio` (the kinds are the extension SDK's contract); its limit may now be a value in m².
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coherent, comparisonAgrees, extractChapter } from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import { fakeAi, rule } from './ai-fake.mjs';

const footprint = (limit, fields = {}) => ({
  kind: 'footprint_ratio',
  statement: 'limit',
  limit,
  ...fields
});
const area = (comparison, value) => ({ kind: 'value', comparison, value, unit: 'm2' });
const percent = (comparison, value) => ({ kind: 'value', comparison, value, unit: 'percent' });

test('a footprint limit may be a share or an area; a length or a ratio of the floor area is still incoherent', () => {
  assert.equal(coherent(footprint(area('max', 250))), true);
  assert.equal(coherent(footprint(percent('max', 30))), true);
  assert.equal(
    coherent(footprint({ kind: 'ratio', comparison: 'max', percent: 30, base: 'plot_area' })),
    true
  );
  assert.equal(
    coherent(footprint({ kind: 'value', comparison: 'max', value: 12, unit: 'm' })),
    false
  );
  // The green ratio is not an area: only the footprint takes one.
  assert.equal(coherent({ ...footprint(area('min', 250)), kind: 'green_ratio' }), false);
});

test('a footprint area is a cap: its comparison agrees when it is a maximum', () => {
  assert.equal(comparisonAgrees(footprint(area('max', 250))), true);
  assert.equal(comparisonAgrees(footprint(area('min', 250))), false);
});

const SENTENCE_AREA = 'L’emprise au sol des constructions est limitée à 250 m2.';
const SENTENCE_BOTH =
  'L’emprise au sol est limitée à 30 % de la surface du terrain et à 250 m2 au plus.';
const chapter = (...lines) =>
  prepareChapter([
    {
      page: 30,
      text: [
        '3.1 - Emprise au sol',
        'Les dispositions du présent article s’appliquent aux constructions nouvelles et aux extensions.',
        'Les dispositions du présent article s’appliquent aux constructions nouvelles et aux extensions.',
        ...lines
      ].join('\n')
    }
  ]);

test('an area footprint is read, placed on its passage and kept as a limit (it used to be dropped as incoherent)', async () => {
  const ai = fakeAi({
    plan: () => [{ value: rule(footprint(area('max', 250))), passage: SENTENCE_AREA }]
  });
  const out = await extractChapter({ prepared: chapter(SENTENCE_AREA), ai });
  assert.equal(out.dropped.incoherent, 0);
  assert.equal(out.rules.length, 1);
  assert.deepEqual(out.rules[0].limit, area('max', 250));
  assert.equal(out.rules[0].kind, 'footprint_ratio');
  assert.equal(out.rules[0].page, 30);
  assert.equal(out.rules[0].confidence, 'high', 'the 250 is written in the passage');
});

test('a percentage and an area from one sentence are two rules, both kept', async () => {
  const ai = fakeAi({
    plan: () => [
      { value: rule(footprint(percent('max', 30))), passage: SENTENCE_BOTH },
      { value: rule(footprint(area('max', 250))), passage: SENTENCE_BOTH }
    ]
  });
  const out = await extractChapter({ prepared: chapter(SENTENCE_BOTH), ai });
  assert.deepEqual(
    out.rules.map((r) => r.limit),
    [percent('max', 30), area('max', 250)]
  );
});
