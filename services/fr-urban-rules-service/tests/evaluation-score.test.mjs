/**
 * Sprint 002.32, Epic 1: the scorer of a reading against a zone's validated truth. Pure, no model, no
 * network. Small synthetic truths and results show each outcome; the recorded Lyon result shows that a
 * result in the service's own shape scores without conversion.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  checkQuotes,
  figuresIn,
  matchRules,
  scoreReading,
  summarise,
  validateTruth
} from '../../../tools/evaluate-reading/score.mjs';
import { FIXTURES } from './helpers.mjs';

const value = (comparison, v, unit = 'm') => ({ kind: 'value', comparison, value: v, unit });
const rule = (kind, sector, limit, extra = {}) => ({
  kind,
  sector,
  statement: limit === null ? 'not_regulated' : 'limit',
  limit,
  ...extra
});
const withPassage = (r, passage, page = 10) => ({
  ...r,
  passage,
  page,
  conditions: [],
  exceptions: [],
  confidence: 'high'
});

const truth = (rules, over = {}) => ({
  format: 'archisimple-reading-truth',
  version: 1,
  zone: 'UX',
  document: { idurba: 'TEST_PLUI_20260101', nomfic: 'reglement.pdf' },
  chapter: { pages: [10, 12] },
  draftedBy: 'Claude Code',
  draftedAt: '2026-11-20',
  validatedBy: 'owner',
  validatedAt: '2026-11-21',
  rules: rules.map((r, i) => ({
    id: `r${i + 1}`,
    page: 10,
    quote: 'Les constructions sont implantées à 4 mètres.',
    ...r
  })),
  ...over
});

// ── The truth file ─────────────────────────────────────────────────────────────

test('a well-formed truth validates, and says whether the owner has validated it', () => {
  const ok = validateTruth(truth([rule('road_setback', null, value('min', 4))]));
  assert.deepEqual(ok, { ok: true, errors: [], validated: true });
  const draft = validateTruth(
    truth([rule('road_setback', null, value('min', 4))], { validatedBy: null, validatedAt: null })
  );
  assert.equal(draft.ok, true);
  assert.equal(draft.validated, false);
});

test('a truth with a missing or inconsistent field is refused with a reason for each', () => {
  const bad = validateTruth(
    truth(
      [
        rule('road_setback', null, value('min', 4)),
        rule('road_setback', null, value('min', 4), { id: 'r1' }), // duplicate id
        rule('nonsense', null, null), // unknown kind
        { ...rule('height_total', null, value('max', 9)), page: 99 }, // page outside the chapter
        { ...rule('parking', null, null), statement: 'limit' }, // a limit statement with no limit
        { ...rule('parking', null, value('min', 1)), statement: 'not_regulated' }, // a limit on a statement that has none
        { ...rule('parking', null, null), quote: '' }
      ],
      { validatedBy: 'owner', validatedAt: null }
    )
  );
  assert.equal(bad.ok, false);
  assert.equal(bad.validated, false);
  const text = bad.errors.join('\n');
  for (const needle of ['duplicate', 'kind', 'page', 'limit', 'quote', 'validatedBy'])
    assert.match(text, new RegExp(needle, 'i'));
  assert.equal(validateTruth({}).ok, false);
  assert.equal(validateTruth(null).ok, false);
});

// ── Matching ───────────────────────────────────────────────────────────────────

test('an exact rule matches; a spelling of the sector does not matter', () => {
  const t = truth([rule('road_setback', 'UCe1b', value('min', 4))]).rules;
  const m = matchRules(t, [rule('road_setback', 'uce 1b', value('min', 4))]);
  assert.equal(m.found.length, 1);
  assert.equal(m.sectorError.length, 0);
  assert.equal(m.missed.length + m.extra.length + m.wrongValue.length, 0);
});

test('same kind and sector, another value, is a wrong value, not a miss plus an extra', () => {
  const t = truth([rule('road_setback', null, value('min', 4))]).rules;
  const m = matchRules(t, [rule('road_setback', null, value('min', 3))]);
  assert.equal(m.wrongValue.length, 1);
  assert.deepEqual([m.wrongValue[0].truth.limit.value, m.wrongValue[0].read.limit.value], [4, 3]);
  assert.equal(m.missed.length + m.extra.length + m.found.length, 0);
  // Another unit is a wrong value too.
  const unit = matchRules(t, [rule('road_setback', null, value('min', 4, 'm2'))]);
  assert.equal(unit.wrongValue.length, 1);
});

test('the right rule under the wrong sector is found, with a sector error', () => {
  const t = truth([rule('height_total', 'UCa', value('max', 9))]).rules;
  const m = matchRules(t, [rule('height_total', 'UCb', value('max', 9))]);
  assert.equal(m.found.length, 0);
  assert.equal(m.sectorError.length, 1);
  assert.equal(m.missed.length + m.extra.length, 0);
  const whole = matchRules(t, [rule('height_total', null, value('max', 9))]);
  assert.equal(whole.sectorError.length, 1, 'whole zone instead of a sector is a sector error too');
});

test('a truth rule nothing read resembles is missed; a read rule no truth rule resembles is extra', () => {
  const t = truth([
    rule('road_setback', null, value('min', 4)),
    rule('green_ratio', null, { kind: 'ratio', comparison: 'min', percent: 20, base: 'plot_area' })
  ]).rules;
  const m = matchRules(t, [
    rule('road_setback', null, value('min', 4)),
    rule('parking', null, value('min', 2))
  ]);
  assert.equal(m.found.length, 1);
  assert.deepEqual(
    m.missed.map((r) => r.kind),
    ['green_ratio']
  );
  assert.deepEqual(
    m.extra.map((r) => r.kind),
    ['parking']
  );
});

test('two rules of one kind and sector with different values are matched to the right one each', () => {
  const t = truth([
    rule('footprint_ratio', 'UC', {
      kind: 'ratio',
      comparison: 'max',
      percent: 30,
      base: 'plot_area'
    }),
    rule('footprint_ratio', 'UC', {
      kind: 'ratio',
      comparison: 'max',
      percent: 25,
      base: 'plot_area'
    })
  ]).rules;
  const read = [
    rule('footprint_ratio', 'UC', {
      kind: 'ratio',
      comparison: 'max',
      percent: 25,
      base: 'plot_area'
    }),
    rule('footprint_ratio', 'UC', {
      kind: 'ratio',
      comparison: 'max',
      percent: 30,
      base: 'plot_area'
    })
  ];
  const m = matchRules(t, read);
  assert.equal(m.found.length, 2);
  assert.equal(m.wrongValue.length + m.missed.length + m.extra.length, 0);
});

test('rules with no limit (not regulated, see graphic, described) match by kind, sector and statement; an identical second read is a duplicate, not an extra', () => {
  const nr = (kind, sector) => ({ kind, sector, statement: 'not_regulated', limit: null });
  const t = truth([nr('building_distance', 'UDa')]).rules;
  const m = matchRules(t, [nr('building_distance', 'UDa'), nr('building_distance', 'UDa')]);
  assert.equal(m.found.length, 1);
  assert.equal(m.duplicates.length, 1);
  assert.equal(m.extra.length, 0);
});

test('a height-relative limit matches on its parts', () => {
  const hr = (factor, min) => ({
    kind: 'height_relative',
    reference: 'facade_height',
    factor,
    offsetMetres: null,
    minimumMetres: min
  });
  const t = truth([rule('boundary_setback', null, hr(0.5, 3))]).rules;
  assert.equal(matchRules(t, [rule('boundary_setback', null, hr(0.5, 3))]).found.length, 1);
  assert.equal(matchRules(t, [rule('boundary_setback', null, hr(1, 3))]).wrongValue.length, 1);
});

// ── Figures ────────────────────────────────────────────────────────────────────

test('figuresIn finds numbers with a unit, in the ways a règlement writes them', () => {
  const keys = (s) =>
    figuresIn(s)
      .map((f) => f.key)
      .sort();
  assert.deepEqual(keys('un recul de 4 mètres, 1 500 m² et 30 % de la surface, soit 2,5 m.'), [
    '1500|m2',
    '2.5|m',
    '30|percent',
    '4|m'
  ]);
  assert.deepEqual(keys('4 m2 et 4 m²'), ['4|m2', '4|m2']);
  assert.deepEqual(
    keys('le lot 12, article 4-02 et 10 mm'),
    [],
    'a number without a length, area or percent unit is not a figure'
  );
  assert.deepEqual(keys('au bout de 4 mois'), [], 'a unit inside a word is not a unit');
});

// ── Scoring a reading ──────────────────────────────────────────────────────────

const TEXT =
  'Les constructions sont implantées à 4 mètres de la voie. La hauteur ne peut excéder 9 m. Le coefficient de pleine terre est de 30 % et le recul est de 7 m.';
const result = (rules, extra = {}) => ({
  rules,
  dropped: 0,
  chunks: { of: 1, failed: 0 },
  ...extra
});

test('a reading is scored on recall, wrong values, extras, sectors, verification and figure coverage', () => {
  const t = truth([
    rule('road_setback', null, value('min', 4)),
    rule('height_total', 'UA', value('max', 9)),
    rule('green_ratio', null, { kind: 'ratio', comparison: 'min', percent: 30, base: 'plot_area' }),
    rule('boundary_setback', null, value('min', 7))
  ]);
  const read = result([
    withPassage(rule('road_setback', null, value('min', 4)), 'implantées à 4 mètres de la voie'),
    withPassage(rule('height_total', 'UB', value('max', 9)), 'ne peut excéder 9 m'), // sector error
    withPassage(
      rule('green_ratio', null, {
        kind: 'ratio',
        comparison: 'min',
        percent: 25,
        base: 'plot_area'
      }),
      'pleine terre est de 30 %'
    ), // wrong value, and the passage holds no 25
    withPassage(rule('parking', null, value('min', 1)), 'une place') // extra
  ]);
  const s = scoreReading({ truth: t, result: read, chapterText: TEXT });
  assert.equal(s.counts.truth, 4);
  assert.equal(s.counts.found, 2, 'exact plus sector error');
  assert.equal(s.counts.sectorError, 1);
  assert.equal(s.counts.wrongValue, 1);
  assert.equal(s.counts.missed, 1);
  assert.equal(s.counts.extra, 1);
  assert.equal(s.recall, 0.5);
  assert.equal(s.sectorAttribution, 0.5, 'one of the two found rules has the right sector');
  assert.equal(s.verified, 0.5, 'two of four rules have their figure in their passage');
  // The text writes 4 m, 9 m, 30 % and 7 m; the passages hold 4 m, 9 m and 30 %.
  assert.deepEqual(s.figureCoverage, { covered: 3, total: 4, uncovered: ['7|m'] });
  assert.equal(s.details.missed[0].kind, 'boundary_setback');
});

test('rules that repeat across sectors are counted as repeats', () => {
  const t = truth([rule('road_setback', null, value('min', 4))]);
  const p = 'implantées à 4 mètres de la voie';
  const read = result(
    ['UC', 'UC1', 'UC2'].map((sector) =>
      withPassage(rule('road_setback', sector, value('min', 4)), p)
    )
  );
  const s = scoreReading({ truth: t, result: read, chapterText: TEXT });
  assert.equal(
    s.repeats.acrossSectors,
    2,
    'three sectors of one sentence: two are repeats of the first'
  );
  assert.equal(s.repeats.exact, 0);
});

test("the service's own shape scores without conversion: the recorded Lyon reading against a truth made from five of its rules", () => {
  const recorded = JSON.parse(readFileSync(join(FIXTURES, 'lyon/extraction/result.json'), 'utf8'));
  const five = recorded.rules.slice(0, 5).map((r) => ({
    kind: r.kind,
    sector: r.sector,
    statement: r.statement,
    limit: r.limit,
    page: r.page,
    quote: r.passage
  }));
  const t = truth(five, { chapter: { pages: recorded.chapter.pages } });
  assert.equal(validateTruth(t).ok, true);
  const s = scoreReading({ truth: t, result: recorded, chapterText: '' });
  assert.equal(s.recall, 1);
  assert.equal(s.counts.read, recorded.rules.length);
  assert.equal(s.counts.extra, recorded.rules.length - 5 - s.counts.duplicates);
  assert.equal(s.figureCoverage.total, 0, 'no chapter text, no figures to cover');
});

test('the dropped count is read from a number (the service result) or an object of counts (the raw extraction)', () => {
  const t = truth([rule('road_setback', null, value('min', 4))]);
  const base = [withPassage(rule('road_setback', null, value('min', 4)), 'à 4 mètres')];
  assert.equal(
    scoreReading({ truth: t, result: { rules: base, dropped: 6 }, chapterText: '' }).droppedTotal,
    6
  );
  assert.equal(
    scoreReading({
      truth: t,
      result: { rules: base, dropped: { passageNotFound: 2, incoherent: 3 } },
      chapterText: ''
    }).droppedTotal,
    5
  );
});

// ── The headline ───────────────────────────────────────────────────────────────

test('the headline counts only validated truths; the others are shown apart', () => {
  const t1 = truth([rule('road_setback', null, value('min', 4))], { zone: 'A' });
  const t2 = truth(
    [rule('road_setback', null, value('min', 4)), rule('height_total', null, value('max', 9))],
    { zone: 'B' }
  );
  const t3 = truth([rule('road_setback', null, value('min', 4))], {
    zone: 'C',
    validatedBy: null,
    validatedAt: null
  });
  const good = [withPassage(rule('road_setback', null, value('min', 4)), 'à 4 mètres')];
  const scored = [t1, t2, t3].map((t) => ({
    zone: t.zone,
    model: 'm',
    validated: validateTruth(t).validated,
    score: scoreReading({ truth: t, result: result(good), chapterText: '' })
  }));
  const h = summarise(scored);
  assert.deepEqual(h.headline.zones, ['A', 'B']);
  assert.deepEqual(h.notValidated.zones, ['C']);
  // Micro-average over the validated zones: 2 of 3 truth rules found.
  assert.equal(h.headline.recall, 2 / 3);
  assert.equal(h.headline.truthRules, 3);
  assert.equal(summarise([scored[2]]).headline.zones.length, 0);
  assert.equal(summarise([scored[2]]).headline.recall, null);
});

// ── Scope: a truth may cover only some kinds of rule ──────────────────────────────────────────────

test('a truth may name the kinds it covers; a rule outside them is refused in the truth', () => {
  const ok = validateTruth(
    truth([rule('road_setback', null, value('min', 4))], {
      scopeKinds: ['road_setback', 'height_total']
    })
  );
  assert.equal(ok.ok, true);
  const unknown = validateTruth(
    truth([rule('road_setback', null, value('min', 4))], {
      scopeKinds: ['road_setback', 'nonsense']
    })
  );
  assert.match(unknown.errors.join('\n'), /scopeKinds/);
  const outside = validateTruth(
    truth([rule('parking', null, value('min', 1))], { scopeKinds: ['road_setback'] })
  );
  assert.match(outside.errors.join('\n'), /outside/);
  assert.equal(
    validateTruth(
      truth([rule('road_setback', null, value('min', 4))], { scopeKinds: 'road_setback' })
    ).ok,
    false
  );
});

test("a read rule of a kind outside the truth's scope is neither extra nor counted as read; it is reported apart", () => {
  const t = truth([rule('road_setback', null, value('min', 4))], { scopeKinds: ['road_setback'] });
  const read = result([
    withPassage(rule('road_setback', null, value('min', 4)), 'à 4 mètres'),
    withPassage(rule('parking', null, value('min', 2)), 'deux places')
  ]);
  const s = scoreReading({ truth: t, result: read, chapterText: '' });
  assert.equal(s.counts.read, 1);
  assert.equal(s.counts.extra, 0);
  assert.equal(s.counts.outOfScope, 1);
  assert.equal(s.details.outOfScope[0].kind, 'parking');
  assert.equal(s.recall, 1);
  // Without a scope nothing is outside it.
  const open = scoreReading({
    truth: truth([rule('road_setback', null, value('min', 4))]),
    result: read,
    chapterText: ''
  });
  assert.equal(open.counts.outOfScope, 0);
  assert.equal(open.counts.extra, 1);
});

// ── The drafter's check: every quote is in its page ─────────────────────────────────────────────────

test('every truth quote must be found in its page, whatever the line breaks; a missing quote or page is named', () => {
  const pages = [
    { page: 10, text: 'Les constructions sont\nimplantées à 4 mètres\nde la limite.' },
    { page: 11, text: 'Autre page.' }
  ];
  const t = truth([
    rule('road_setback', null, value('min', 4), {
      id: 'ok',
      page: 10,
      quote: 'implantées à 4 mètres de la limite'
    }),
    rule('road_setback', null, value('min', 4), {
      id: 'wrongpage',
      page: 11,
      quote: 'implantées à 4 mètres'
    }),
    rule('road_setback', null, value('min', 4), { id: 'nopage', page: 12, quote: 'x' }),
    rule('road_setback', null, value('min', 4), { id: 'invented', page: 10, quote: 'à 5 mètres' })
  ]);
  const problems = checkQuotes(t, pages);
  assert.deepEqual(problems.map((p) => p.id).sort(), ['invented', 'nopage', 'wrongpage']);
  assert.match(problems.find((p) => p.id === 'nopage').problem, /page/);
  assert.deepEqual(
    checkQuotes(
      truth([
        rule('road_setback', null, value('min', 4), { page: 10, quote: 'implantées à 4 mètres' })
      ]),
      pages
    ),
    []
  );
});

// ── The review sheet the owner validates a truth with ───────────────────────────────────────────────

test('the review sheet lists the truth by sector with page and quote, and the figures of the chapter no truth quote covers', async () => {
  const { reviewSheet } = await import('../../../tools/evaluate-reading/review.mjs');
  const pages = [
    {
      page: 10,
      text: 'Les constructions sont implantées à 4 mètres de la limite. Le coefficient est de 30 % et la clôture de 2 m.'
    }
  ];
  const t = truth(
    [
      rule('road_setback', 'UA', value('min', 4), {
        page: 10,
        quote: 'implantées à 4 mètres de la limite'
      })
    ],
    { validatedBy: null, validatedAt: null }
  );
  const md = reviewSheet({ truth: t, pages });
  assert.match(md, /UA/);
  assert.match(md, /road_setback/);
  assert.match(md, /page 10/);
  assert.match(md, /implantées à 4 mètres/);
  assert.match(md, /not validated/i);
  // 4 m is covered by the quote; 30 % and 2 m are figures in the text that no truth rule covers.
  assert.match(md, /30 %/);
  assert.match(md, /2 m/);
  assert.ok(
    !/Figures the text writes.*4 m\b/s.test(md.split('Figures the text writes')[1] ?? ''),
    'a covered figure is not listed as uncovered'
  );
  // With a recorded reading, what it found, missed and read beyond the truth is listed for the owner to adjudicate.
  const withReading = reviewSheet({
    truth: t,
    pages,
    result: {
      rules: [
        {
          kind: 'road_setback',
          sector: 'UA',
          statement: 'limit',
          limit: value('min', 3),
          passage: 'à 3 mètres',
          page: 10
        }
      ]
    },
    readingLabel: 'recorded 2026-10-20'
  });
  assert.match(withReading, /recorded 2026-10-20/);
  assert.match(withReading, /wrong value/i);
});

// ── The zone's own name as a sector ─────────────────────────────────────────────────────────────────

test("a sector that is the zone's own name is the whole zone: a table row labelled « UC » in zone UC is no sector", () => {
  const t = truth(
    [
      rule('green_ratio', null, {
        kind: 'ratio',
        comparison: 'min',
        percent: 30,
        base: 'plot_area'
      })
    ],
    { zone: 'UC' }
  );
  const read = [
    rule('green_ratio', 'UC', { kind: 'ratio', comparison: 'min', percent: 30, base: 'plot_area' })
  ];
  const m = matchRules(t.rules, read, { zone: 'UC' });
  assert.equal(m.found.length, 1);
  assert.equal(m.sectorError.length, 0);
  // Without the zone's name it is still a sector error; another real sector is one either way.
  assert.equal(matchRules(t.rules, read).sectorError.length, 1);
  assert.equal(
    matchRules(t.rules, [rule('green_ratio', 'UCa', read[0].limit)], { zone: 'UC' }).sectorError
      .length,
    1
  );
  // scoreReading uses the truth's own zone.
  assert.equal(
    scoreReading({ truth: t, result: { rules: read }, chapterText: '' }).counts.exact,
    1
  );
});

test("the headline says who validated each zone it counts, so an owner's validation and a model's cross-check are never confused", () => {
  const t1 = truth([rule('road_setback', null, value('min', 4))], { zone: 'A' });
  const t2 = truth([rule('road_setback', null, value('min', 4))], { zone: 'B' });
  const good = [withPassage(rule('road_setback', null, value('min', 4)), 'à 4 mètres')];
  const item = (t, validatedBy) => ({
    zone: t.zone,
    model: 'm',
    validated: true,
    validatedBy,
    score: scoreReading({ truth: t, result: result(good), chapterText: '' })
  });
  const h = summarise([item(t1, 'owner'), item(t2, 'independent cross-check (a second model)')]);
  assert.deepEqual(h.headline.validators, {
    A: 'owner',
    B: 'independent cross-check (a second model)'
  });
  assert.deepEqual(h.byModel.m.validators, h.headline.validators);
});

// ── Sprint 002.35: a share of the plot is one thing, however it is written ─────────────────────

test('for the footprint and the green ratio, « 15 % » and « 15 % of the plot area » are the same limit, as the extension reads them', () => {
  const percent = (comparison, n) => ({ kind: 'value', comparison, value: n, unit: 'percent' });
  const ofPlot = (comparison, n) => ({ kind: 'ratio', comparison, percent: n, base: 'plot_area' });
  const green = matchRules(
    [rule('green_ratio', null, ofPlot('min', 15))],
    [rule('green_ratio', null, percent('min', 15))]
  );
  assert.equal(green.found.length, 1);
  assert.equal(green.wrongValue.length, 0);
  const footprint = matchRules(
    [rule('footprint_ratio', 'UDa', percent('max', 30))],
    [rule('footprint_ratio', 'UDa', ofPlot('max', 30))]
  );
  assert.equal(footprint.found.length, 1);
  // The numbers still count: 15 % is not 20 %, in either spelling.
  const wrong = matchRules(
    [rule('green_ratio', null, ofPlot('min', 15))],
    [rule('green_ratio', null, percent('min', 20))]
  );
  assert.equal(wrong.found.length, 0);
  assert.equal(wrong.wrongValue.length, 1);
});

test('the equivalence stops where the extension stops: another base, another comparison, another kind', () => {
  const percent = (comparison, n) => ({ kind: 'value', comparison, value: n, unit: 'percent' });
  const of = (base, comparison, n) => ({ kind: 'ratio', comparison, percent: n, base });
  // A share of the existing footprint is not a share of the plot.
  assert.equal(
    matchRules(
      [rule('footprint_ratio', null, of('existing_emprise', 'max', 30))],
      [rule('footprint_ratio', null, percent('max', 30))]
    ).found.length,
    0
  );
  // An extension cap is a share of something else: the two spellings are not interchanged.
  assert.equal(
    matchRules(
      [rule('extension_max', null, of('plot_area', 'max', 30))],
      [rule('extension_max', null, percent('max', 30))]
    ).found.length,
    0
  );
  // A minimum footprint is not a footprint cap.
  assert.equal(
    matchRules(
      [rule('footprint_ratio', null, of('plot_area', 'min', 30))],
      [rule('footprint_ratio', null, percent('max', 30))]
    ).found.length,
    0
  );
});

// ── Sprint 002.43: what the truth has considered and left out is not an extra ──────────────────

test('a read rule the truth recorded as « not adopted » (same page, its sentence) is accepted, not an extra; any other is still an extra', () => {
  const quote = 'Les piscines visées à l’article A2 sont limitées à 80 m2 de surface de bassin.';
  const t = truth([rule('annex_max', null, value('max', 30, 'm2'), { page: 10, quote: 'Les annexes sont limitées à 30 m2.' })]);
  t.crossCheck = {
    notAdopted: [
      { kind: 'annex_max', sector: null, statement: 'limit', limit: value('max', 80, 'm2'), page: 10, quote, why: 'a pool basin: out of scope' }
    ]
  };
  const result = {
    rules: [
      withPassage(rule('annex_max', null, value('max', 30, 'm2')), 'Les annexes sont limitées à 30 m2.'),
      // The same sentence, quoted a little differently, typed under another kind.
      withPassage(rule('other', null, value('max', 80, 'm2')), 'Les piscines visées à l’article A2 sont limitées à 80 m2 de surface de bassin'),
      // Another sentence, on the same page: a real extra.
      withPassage(rule('green_ratio', null, { kind: 'ratio', comparison: 'min', percent: 20, base: 'plot_area' }), 'Au moins 20 % du terrain.')
    ],
    dropped: 0
  };
  const s = scoreReading({ truth: { ...t, scopeKinds: ['annex_max', 'green_ratio', 'other'] }, result, chapterText: '' });
  assert.equal(s.counts.found, 1);
  assert.equal(s.counts.accepted, 1);
  assert.equal(s.counts.extra, 1, 'only the green ratio is unknown to the truth');
  assert.equal(s.details.accepted.length, 1);
  assert.equal(s.details.extra[0].kind, 'green_ratio');
});

test('a truth with no cross-check, or a not-adopted sentence on another page, accepts nothing', () => {
  const t = truth([rule('annex_max', null, value('max', 30, 'm2'))]);
  const read = withPassage(rule('other', null, value('max', 80, 'm2')), 'Les piscines sont limitées à 80 m2 de surface de bassin.', 12);
  const none = scoreReading({ truth: t, result: { rules: [read], dropped: 0 }, chapterText: '' });
  assert.equal(none.counts.accepted, 0);
  assert.equal(none.counts.extra, 1);
  t.crossCheck = { notAdopted: [{ kind: 'annex_max', page: 10, quote: 'Les piscines sont limitées à 80 m2 de surface de bassin.' }] };
  const otherPage = scoreReading({ truth: t, result: { rules: [read], dropped: 0 }, chapterText: '' });
  assert.equal(otherPage.counts.accepted, 0, 'page 10 is not page 12');
});
