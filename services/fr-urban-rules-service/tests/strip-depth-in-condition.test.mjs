/**
 * Sprint 002.35, Epic 2: the depth of a strip may be written in a verified condition, not only in the passage the
 * model quoted. « Dans une bande de 0 à 4 mètres … » is the clause that gives the depth, and « leur hauteur de
 * façade n'excède pas 3,5 mètres » is the sentence after it. A condition is checked verbatim against the text, so
 * the strip is as grounded as when the depth sits in the passage; a depth written nowhere still leaves a statement
 * in words (Sprint 002.21).
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
const CLAUSE = 'Dans une bande de 0 à 4 mètres à compter de la limite séparative*';
const PASSAGE = 'leur hauteur de façade* n’excède pas 3,5 mètres.';

const chapter = () =>
  prepareChapter([
    {
      page: 20,
      text: [
        '2.2 - Hauteur des constructions',
        PAD,
        PAD,
        `${CLAUSE}, les annexes sont admises`,
        PASSAGE,
        PAD
      ].join('\n')
    }
  ]);

const facade = (strip, conditions) =>
  rule({
    kind: 'height_facade',
    statement: 'limit',
    limit: { kind: 'value', comparison: 'max', value: 3.5, unit: 'm' },
    strip,
    conditions
  });
const STRIP = { depthMetres: 4, edges: 'side_rear', permits: true };

const read = async (value) => {
  const ai = fakeAi({ plan: () => [{ value, passage: PASSAGE }] });
  return extractChapter({ prepared: chapter(), ai });
};

test('a depth written in a verified condition keeps the limit and its strip', async () => {
  const out = await read(facade(STRIP, [CLAUSE]));
  const [r] = out.rules;
  assert.equal(r.statement, 'limit');
  assert.deepEqual(r.limit, { kind: 'value', comparison: 'max', value: 3.5, unit: 'm' });
  assert.deepEqual(r.strip, STRIP);
  assert.equal(r.conditions.length, 1, 'the condition that gave the depth is on the rule');
  assert.equal(out.dropped.stripNotInPassage, undefined);
});

test('a condition the text does not hold verbatim gives no depth: the limit is still a statement in words', async () => {
  const out = await read(facade(STRIP, ['Dans une bande de 0 à 4 mètres de la voie publique']));
  const [r] = out.rules;
  assert.equal(r.statement, 'described');
  assert.equal(r.limit, null);
  assert.equal('strip' in r, false);
  assert.equal(out.dropped.stripNotInPassage, 1);
});

test('a depth written nowhere is refused as before, whatever the conditions say', async () => {
  const out = await read(facade({ ...STRIP, depthMetres: 7 }, [CLAUSE]));
  const [r] = out.rules;
  assert.equal(r.statement, 'described');
  assert.equal(out.dropped.stripNotInPassage, 1);
});

test('a depth in the passage itself still needs no condition', async () => {
  const both = `dans une bande de 0 à 4 mètres, ${PASSAGE}`;
  const ai = fakeAi({
    plan: () => [{ value: facade({ ...STRIP, depthMetres: 4 }, []), passage: both }]
  });
  const prepared = prepareChapter([
    { page: 20, text: ['2.2 - Hauteur des constructions', PAD, PAD, both, PAD].join('\n') }
  ]);
  const out = await extractChapter({ prepared, ai });
  assert.equal(out.rules[0].statement, 'limit');
  assert.equal(out.rules[0].strip.depthMetres, 4);
});

test('Sprint 002.42: a depth that is only the height’s own figure is not a depth (the old test said it was)', async () => {
  const ai = fakeAi({
    plan: () => [{ value: facade({ ...STRIP, depthMetres: 3.5 }, []), passage: PASSAGE }]
  });
  const out = await extractChapter({ prepared: chapter(), ai });
  assert.equal(out.rules[0].statement, 'described');
  assert.equal(out.dropped.stripNotInPassage, 1);
});
