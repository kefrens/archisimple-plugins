/**
 * Sprint 002.21: a height held to a strip along the plot limits, and the window the exceptions
 * after a rule are looked for in. The model is a fake (`ai-fake.mjs`); the Marseille UD text and
 * the answers recorded with the real model are in `test-fixtures/fr-urban-rules/marseille-ud`.
 */

import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CONDITION_WINDOW_AFTER,
  INSTRUCTIONS,
  ITEM_SCHEMA,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  STRIP_EDGES,
  extractChapter,
  verifiedStrip
} from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import { fakeAi, rule } from './ai-fake.mjs';
import { FIXTURES } from './helpers.mjs';

const PAD =
  'Les dispositions du présent article s’appliquent aux constructions nouvelles et aux extensions.';

/** The owner's case, written as a règlement would: a setback, and lower constructions allowed within it. */
const SETBACK =
  'Les constructions doivent être implantées en retrait d’au moins 5 mètres des limites séparatives*.';
const LOWER =
  'Les constructions dont la hauteur totale n’excède pas 2 mètres peuvent s’implanter dans la bande de 5 mètres à compter des limites séparatives*.';

const chapter = (...lines) =>
  prepareChapter([
    {
      page: 20,
      text: [
        '2.2 - Implantation par rapport aux limites séparatives',
        PAD,
        PAD,
        ...lines,
        PAD
      ].join('\n')
    }
  ]);

const height = (strip, fields = {}) =>
  rule({
    kind: 'height_total',
    statement: 'limit',
    limit: { kind: 'value', comparison: 'max', value: 2, unit: 'm' },
    strip,
    ...fields
  });
const setback = (fields = {}) =>
  rule({
    kind: 'boundary_setback',
    statement: 'limit',
    limit: { kind: 'value', comparison: 'min', value: 5, unit: 'm' },
    strip: null,
    ...fields
  });
const STRIP = { depthMetres: 5, edges: 'side_rear', permits: true };

test('002.21: this version of the prompt and the schema — a strip, nothing else changed in the result’s shape', () => {
  assert.equal(PROMPT_VERSION, 3);
  assert.equal(
    SCHEMA_VERSION,
    1,
    'the strip is optional: a result without it still reads, so the cache is not emptied'
  );
  assert.ok(ITEM_SCHEMA.required.includes('strip'));
  const object = ITEM_SCHEMA.properties.strip.anyOf.find((s) => s.type === 'object');
  assert.deepEqual(object.properties.edges.enum, STRIP_EDGES);
  assert.deepEqual(STRIP_EDGES, ['all', 'street', 'side', 'rear', 'side_rear']);
  assert.deepEqual(object.required, ['depthMetres', 'edges', 'permits']);
  assert.match(INSTRUCTIONS, /^strip — /mu);
});

test('002.21: the owner’s sentence — a 5 m setback and 2 m constructions allowed within it — is a setback and a height with its strip', async () => {
  const ai = fakeAi({
    plan: () => [
      { value: setback(), passage: SETBACK },
      { value: height(STRIP), passage: LOWER }
    ]
  });
  const out = await extractChapter({ prepared: chapter(SETBACK, LOWER), ai });
  const [first, second] = out.rules;
  assert.equal(first.kind, 'boundary_setback');
  assert.equal(
    'strip' in first,
    false,
    'a rule with no strip carries none: results read as before'
  );
  assert.equal(second.kind, 'height_total');
  assert.equal(second.statement, 'limit');
  assert.deepEqual(second.limit, { kind: 'value', comparison: 'max', value: 2, unit: 'm' });
  assert.deepEqual(second.strip, STRIP);
  assert.equal(second.confidence, 'high');
  assert.equal(out.dropped.stripNotInPassage, undefined);
});

test('002.21: a strip whose depth the passage does not write, or that cannot qualify the item, leaves a statement in words — never a plain height', async () => {
  const unwritten = { depthMetres: 7, edges: 'side_rear', permits: true };
  const cases = [
    ['a depth the passage does not write', height(unwritten), LOWER],
    ['an unknown edges word', height({ ...STRIP, edges: 'north' }), LOWER],
    ['a permits that is not a boolean', height({ ...STRIP, permits: 'yes' }), LOWER],
    ['a strip on a setback', setback({ strip: STRIP }), SETBACK],
    [
      'a strip on a ratio',
      rule({
        kind: 'footprint_ratio',
        statement: 'limit',
        limit: { kind: 'value', comparison: 'max', value: 5, unit: 'percent' },
        strip: STRIP
      }),
      'L’emprise au sol* ne peut excéder 5 % dans la bande de 5 mètres.'
    ],
    ['a depth under 10 cm', height({ ...STRIP, depthMetres: 0.05 }), LOWER]
  ];
  for (const [name, value, passage] of cases) {
    const ai = fakeAi({ plan: () => [{ value, passage }] });
    const out = await extractChapter({ prepared: chapter(SETBACK, LOWER, passage), ai });
    const [r] = out.rules;
    assert.equal(r.statement, 'described', name);
    assert.equal(r.limit, null, name);
    assert.equal('strip' in r, false, name);
    assert.equal(r.confidence, 'low', name);
    assert.equal(out.dropped.stripNotInPassage, 1, name);
  }
});

test('002.21: verifiedStrip reads the number the way the text writes it', () => {
  const value = (strip) => ({
    kind: 'height_facade',
    statement: 'limit',
    limit: { kind: 'value', comparison: 'max', value: 3.5, unit: 'm' },
    strip
  });
  assert.deepEqual(
    verifiedStrip(
      value({ depthMetres: 4, edges: 'side_rear', permits: false }),
      'dans une bande de 0 à 4 mètres, la hauteur de façade n’excède pas 3,5 mètres'
    ),
    { depthMetres: 4, edges: 'side_rear', permits: false }
  );
  assert.deepEqual(
    verifiedStrip(
      value({ depthMetres: 1.5, edges: 'all', permits: false }),
      'une bande de 1,5 mètre'
    ),
    {
      depthMetres: 1.5,
      edges: 'all',
      permits: false
    }
  );
  assert.equal(
    verifiedStrip(
      value({ depthMetres: 4, edges: 'all', permits: false }),
      'dans la bande de quatre mètres'
    ),
    null
  );
});

test('002.21: an exception written after the rule is kept — the 600 characters past the passage — and one far past it is not', async () => {
  const near = 'Les extensions* existantes peuvent être implantées à une distance inférieure.';
  const far = 'Une phrase écartée sans rapport avec la règle précédente.';
  const filler = `${PAD} `.repeat(Math.ceil((CONDITION_WINDOW_AFTER + 100) / (PAD.length + 1)));
  const ai = fakeAi({
    plan: () => [{ value: setback({ exceptions: [near], conditions: [far] }), passage: SETBACK }]
  });
  const out = await extractChapter({ prepared: chapter(SETBACK, near, filler, far), ai });
  const [r] = out.rules;
  assert.deepEqual(r.exceptions, [near]);
  assert.deepEqual(
    r.conditions,
    [],
    'a phrase past the window is the model’s attribution, not the rule’s'
  );
  assert.equal(out.dropped.conditionNotVerbatim, 1);
  assert.equal(r.confidence, 'low');
});

// The real règlement: Marseille PLUi, zone UD (article UD4.2: implantation par rapport aux limites séparatives).
const MARSEILLE = join(FIXTURES, 'marseille-ud');
const marseille = () => ({
  pages: JSON.parse(readFileSync(join(MARSEILLE, 'pages.json'), 'utf8')),
  answers: JSON.parse(readFileSync(join(MARSEILLE, 'strip-answers.json'), 'utf8'))
});

test('002.21: on Marseille UD the 0–4 m strip is a height with its strip (4 m total, 3.5 m façade), and the 4 m setback keeps the alternative rule written after it', async () => {
  const { pages, answers } = marseille();
  const prepared = prepareChapter(pages);
  const ai = fakeAi({ plan: () => answers });
  const out = await extractChapter({ prepared, ai });
  const strips = out.rules.filter((r) => r.strip !== undefined);
  const total = strips.find((r) => r.kind === 'height_total' && r.sector === 'UDa1');
  const facade = strips.find((r) => r.kind === 'height_facade' && r.sector === 'UDa1');
  assert.deepEqual(total.limit, { kind: 'value', comparison: 'max', value: 4, unit: 'm' });
  assert.deepEqual(total.strip, { depthMetres: 4, edges: 'side_rear', permits: true });
  assert.deepEqual(facade.limit, { kind: 'value', comparison: 'max', value: 3.5, unit: 'm' });
  assert.deepEqual(facade.strip, { depthMetres: 4, edges: 'side_rear', permits: true });
  // The 4 m setback of UDa1 carries the alternative rule, which stands after it in the text: before
  // 002.21 the window looked only before the passage and the rule read as unconditional.
  const setback = out.rules.find(
    (r) => r.kind === 'boundary_setback' && r.sector === 'UDa1' && r.limit?.value === 4
  );
  assert.equal(setback.exceptions.length, 1);
  assert.match(setback.exceptions[0], /bande de 0 à 4 mètres/u);
  assert.equal(
    out.dropped.stripNotInPassage,
    undefined,
    'every strip the model gave is written in the text'
  );
});
