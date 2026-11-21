/**
 * Sprint 002.34, Epic 1: a missed truth rule is explained, not only counted. The triage says, for each miss, what
 * the reading did with the passage (never saw it in the text, read it as another kind, read it for another sector,
 * the model left the sector out, the code refused it, or nothing at all) and what the passage looks like (a
 * sector-specific rule, a table). Synthetic zone: no model, no network.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatTriage,
  stableMisses,
  triageMisses
} from '../../../tools/evaluate-reading/triage.mjs';

const pages = [
  {
    page: 10,
    text: [
      'Article 4.1 Implantation par rapport aux voies',
      'Les constructions doivent être implantées avec un recul minimum de 4 mètres par rapport à l’alignement.',
      'Article 4.2 Implantation par rapport aux limites séparatives',
      'Dans les secteurs UDa et UDa1, les constructions sont implantées en limite séparative ou avec un retrait de 3 mètres.',
      'Article 4.3 Emprise au sol',
      "L'emprise au sol des constructions n'est pas réglementée.",
      'Article 4.4 Hauteur',
      'La hauteur maximale des constructions est fixée à 9 mètres.'
    ].join('\n')
  },
  {
    page: 11,
    text: [
      'Article 5 Stationnement',
      'Secteur',
      'Hauteur',
      'UDa',
      '7 m',
      'UDa1',
      '9 m',
      'UDb',
      '12 m',
      'Fin du tableau.'
    ].join('\n')
  }
];

const truthRule = (id, over) => ({
  id,
  kind: 'road_setback',
  sector: null,
  statement: 'limit',
  limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' },
  page: 10,
  quote:
    'Les constructions doivent être implantées avec un recul minimum de 4 mètres par rapport à l’alignement.',
  note: '',
  ...over
});

const read = (over) => ({
  kind: 'road_setback',
  sector: null,
  statement: 'limit',
  limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' },
  page: 10,
  passage:
    'Les constructions doivent être implantées avec un recul minimum de 4 mètres par rapport à l’alignement.',
  ...over
});

const LIMIT_3 = { kind: 'value', comparison: 'max', value: 3, unit: 'm' };
const SEPARATIVE =
  'Dans les secteurs UDa et UDa1, les constructions sont implantées en limite séparative ou avec un retrait de 3 mètres.';

const truth = {
  zone: 'UD',
  rules: [
    truthRule('t-road'),
    truthRule('t-sep-a', {
      kind: 'boundary_setback',
      sector: 'UDa',
      limit: LIMIT_3,
      quote: SEPARATIVE
    }),
    truthRule('t-sep-a1', {
      kind: 'boundary_setback',
      sector: 'UDa1',
      limit: LIMIT_3,
      quote: SEPARATIVE
    }),
    truthRule('t-foot', {
      kind: 'footprint_ratio',
      statement: 'not_regulated',
      limit: null,
      quote: "L'emprise au sol des constructions n'est pas réglementée."
    }),
    truthRule('t-height-a', {
      kind: 'height_total',
      sector: 'UDa',
      limit: { kind: 'value', comparison: 'max', value: 7, unit: 'm' },
      page: 11,
      quote: 'UDa 7 m'
    }),
    truthRule('t-ghost', {
      kind: 'green_ratio',
      statement: 'described',
      limit: null,
      quote: 'Un quart de la parcelle reste en pleine terre.'
    })
  ]
};

const bySource = (t) => Object.fromEntries(t.missed.map((m) => [m.id, m]));

test('with only the reading: found rules are not listed, each miss gets the cause the text and the reading allow', () => {
  const result = {
    rules: [
      read(),
      // The same sentence read for UDa1 only: UDa's rule is missed while its sibling is read.
      read({
        kind: 'boundary_setback',
        sector: 'UDa1',
        limit: LIMIT_3,
        page: 10,
        passage: SEPARATIVE
      }),
      // The footprint sentence read as another kind.
      read({
        kind: 'height_total',
        sector: null,
        statement: 'not_regulated',
        limit: null,
        passage: "L'emprise au sol des constructions n'est pas réglementée."
      })
    ]
  };
  const t = triageMisses({ truth, pages, result });
  const m = bySource(t);
  assert.deepEqual(Object.keys(m).sort(), ['t-foot', 't-ghost', 't-height-a', 't-sep-a']);
  assert.equal(m['t-sep-a'].cause, 'other-sector-read');
  assert.equal(m['t-foot'].cause, 'read-as-other-kind');
  assert.match(m['t-foot'].detail, /height_total/);
  assert.equal(m['t-ghost'].cause, 'quote-not-in-text');
  assert.equal(
    m['t-height-a'].cause,
    'no-rule-on-passage',
    'nothing read there, and no raw answer to say more'
  );
});

test('a miss carries what the passage looks like: sector-specific or not, its statement, and whether it sits in a table', () => {
  const t = triageMisses({ truth, pages, result: { rules: [] } });
  const m = bySource(t);
  assert.equal(m['t-height-a'].sectorSpecific, true);
  assert.equal(m['t-foot'].sectorSpecific, false);
  assert.equal(m['t-foot'].statement, 'not_regulated');
  assert.equal(m['t-height-a'].tabular, true, 'short lines of figures around the quote');
  assert.equal(m['t-road'].tabular, false, 'a running sentence is not a table');
});

test('with the raw answers: the model left the sector out, the code refused it, or the model never offered it', () => {
  const item = (value, passage) => ({ value, passage });
  const raw = [
    {
      chunk: 1,
      items: [
        // Says UDa1 only for a sentence that holds both sectors: UDa was left out by the model.
        item(
          { kind: 'boundary_setback', appliesTo: ['UDa1'], statement: 'limit', limit: LIMIT_3 },
          SEPARATIVE
        ),
        // Offers the footprint sentence for the zone, but the result holds no rule for it: the code refused it.
        item(
          { kind: 'footprint_ratio', appliesTo: 'zone', statement: 'not_regulated', limit: null },
          "L'emprise au sol des constructions n'est pas réglementée."
        )
      ],
      rejected: []
    }
  ];
  const result = {
    rules: [
      read({
        kind: 'boundary_setback',
        sector: 'UDa1',
        limit: LIMIT_3,
        passage: SEPARATIVE
      })
    ]
  };
  const m = bySource(triageMisses({ truth, pages, result, raw }));
  assert.equal(m['t-sep-a'].cause, 'sector-left-out');
  assert.equal(m['t-foot'].cause, 'refused-by-code');
  assert.equal(m['t-road'].cause, 'not-returned');
  assert.equal(m['t-height-a'].cause, 'not-returned');
});

test('"all" covers every sector, so an item that said it and left no rule was refused by the code, not left out', () => {
  const raw = [
    {
      chunk: 1,
      items: [
        {
          value: { kind: 'boundary_setback', appliesTo: 'all', statement: 'limit', limit: LIMIT_3 },
          passage: SEPARATIVE
        }
      ],
      rejected: []
    }
  ];
  const m = bySource(triageMisses({ truth, pages, result: { rules: [] }, raw }));
  assert.equal(m['t-sep-a'].cause, 'refused-by-code');
});

test('an older-shaped item (one sector per item) is told apart the same way', () => {
  const raw = [
    {
      chunk: 1,
      items: [
        {
          value: { kind: 'boundary_setback', sector: 'UDa1', statement: 'limit', limit: LIMIT_3 },
          passage: SEPARATIVE
        }
      ],
      rejected: []
    }
  ];
  const m = bySource(triageMisses({ truth, pages, result: { rules: [] }, raw }));
  assert.equal(m['t-sep-a'].cause, 'sector-left-out');
  assert.equal(m['t-sep-a1'].cause, 'refused-by-code');
});

test('the summary counts by cause, by sector-specific and by statement', () => {
  const t = triageMisses({ truth, pages, result: { rules: [] } });
  assert.equal(t.truth, 6);
  assert.equal(t.missed.length, 6);
  assert.equal(t.byCause['quote-not-in-text'], 1);
  assert.equal(t.byCause['no-rule-on-passage'], 5);
  assert.deepEqual(t.bySector, { zone: 3, sector: 3 });
  assert.equal(t.byStatement.limit, 4);
});

test('misses stable over several runs: missed in every run, or in some', () => {
  const run = (rules) => triageMisses({ truth, pages, result: { rules } });
  const both = run([read()]);
  const second = run([
    read(),
    read({
      kind: 'footprint_ratio',
      statement: 'not_regulated',
      limit: null,
      passage: "L'emprise au sol des constructions n'est pas réglementée."
    })
  ]);
  const s = stableMisses([both, second]);
  assert.ok(s.always.includes('t-ghost'));
  assert.ok(s.always.includes('t-sep-a'));
  assert.deepEqual(s.sometimes, ['t-foot']);
  assert.equal(s.runs, 2);
});

test('the markdown table lists each miss with its cause, and the causes in a line', () => {
  const t = triageMisses({ truth, pages, result: { rules: [] } });
  const text = formatTriage(t);
  assert.match(text, /UD: 6 of 6 truth rules missed/);
  assert.match(text, /\| t-height-a \| height_total \| UDa \|/);
  assert.match(text, /quote-not-in-text/);
});

test('an item that was placed, but as another statement or figure, is "read as other values", not "refused by the code"', () => {
  const raw = [
    {
      chunk: 1,
      items: [
        {
          value: {
            kind: 'footprint_ratio',
            appliesTo: 'zone',
            statement: 'described',
            limit: null
          },
          passage: "L'emprise au sol des constructions n'est pas réglementée."
        }
      ],
      rejected: []
    }
  ];
  const result = {
    rules: [
      read({
        kind: 'footprint_ratio',
        statement: 'described',
        limit: null,
        passage: "L'emprise au sol des constructions n'est pas réglementée."
      })
    ]
  };
  const m = bySource(triageMisses({ truth, pages, result, raw }));
  assert.equal(m['t-foot'].cause, 'read-as-other-values');
  assert.equal(m['t-foot'].detail, 'described');
});
