/**
 * The regulation sheet's content (Sprint 002.7 DEC-5, DEC-6, DEC-7): what the
 * report declares for Print & PDF, on 002.4's reference plots, and the words
 * it can print. The host draws and prints it (096.10); nothing here renders.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, createReader } from '../src/index.js';
import { loadAcceptance, replayFetch, replayService, requestFor } from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const read = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const en = JSON.parse(await read('../resources/i18n/fr-urban-rules/en.json'));
const fr = JSON.parse(await read('../resources/i18n/fr-urban-rules/fr.json'));

const now = () => new Date(Date.UTC(2026, 9, 20, 12, 0));
const captures = {};
before(async () => {
  for (const plot of ['lyon', 'gordes', 'brouennes', 'mouzay', 'rochefort'])
    captures[plot] = await loadAcceptance(plot);
});

async function readAcceptance(plot) {
  const captured = captures[plot];
  const site = replayService(captured.siteCalls, { name: 'site' });
  const reader = createReader({
    fetch: replayFetch(captured.answers),
    now,
    site: () => site,
    roads: () => replayService(captured.context.roads, { name: 'roads' }),
    mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
    document: () => replayService(captured.context.document, { name: 'document' }),
    packageData: () => ({
      read: () => captured.section ?? undefined,
      write: () => {
        throw new Error('a read never writes');
      }
    }),
    translate: (key) => key
  });
  try {
    return await reader.read(
      { site: captured.site, country: 'FR', reason: 'site' },
      { signal: new AbortController().signal, progress: () => {} }
    );
  } finally {
    reader.dispose();
  }
}

const kinds = (sheet) => sheet.blocks.map((b) => b.kind);
const fieldsOf = (sheet) => sheet.blocks.find((b) => b.kind === 'fields').rows;

test('criterion 10: Lyon’s sheet holds, in order, the plot, the flags, the checks with every rule not checked, the rules meter, the plot plan and the assumptions; and the scope sentence', async () => {
  const report = await readAcceptance('lyon');
  const { sheet } = report;
  assert.deepEqual(sheet.title, { key: 'fr-urban-rules.sheet.title' });
  assert.deepEqual(sheet.scope, { key: 'fr-urban-rules.sheet.scope' });
  // Headings aside, Screen 7's order.
  assert.deepEqual(
    kinds(sheet).filter((k) => k !== 'heading'),
    ['fields', 'flags', 'checks', 'meter', 'plot-plan', 'assumptions']
  );
  assert.deepEqual(
    sheet.blocks.filter((b) => b.kind === 'heading').map((b) => b.text.key),
    [
      'fr-urban-rules.sheet.heading.plot',
      'fr-urban-rules.sheet.heading.rules'
    ]
  );
  assert.deepEqual(
    fieldsOf(sheet).map((r) => [r.label.key, r.value]),
    [
      ['fr-urban-rules.field.commune', { text: 'LYON', lang: 'fr' }],
      ['fr-urban-rules.sheet.field.parcels', { text: '69382000AB0105' }],
      ['fr-urban-rules.sheet.field.plotArea', { value: 1183.3, unit: 'm2' }],
      ['fr-urban-rules.field.zone', { text: 'UCe1b', lang: 'fr' }]
    ],
    'the zone’s date is the document’s (2026-03-26): not repeated'
  );
  assert.deepEqual(
    sheet.blocks.find((b) => b.kind === 'checks'),
    { kind: 'checks', unchecked: true },
    'every rule of the zone: the host lists those without a check as Not checked'
  );
  assert.deepEqual(sheet.blocks.find((b) => b.kind === 'meter'), { kind: 'meter', rules: true });
  assert.deepEqual(sheet.blocks.find((b) => b.kind === 'plot-plan'), {
    kind: 'plot-plan',
    categories: ['zone', 'prescription', 'easement', 'risk', 'alignment', 'setback-band', 'envelope'],
    caption: { key: 'fr-urban-rules.sheet.plotPlan.caption' }
  });
  assert.deepEqual(sheet.blocks.find((b) => b.kind === 'assumptions'), { kind: 'assumptions' });
  // DEC-5: no sources block (the host's footer prints them), no notice, no count beside the rules.
  assert.equal(kinds(sheet).includes('sources'), false);
  assert.equal(kinds(sheet).includes('notice'), false);
  // The attribution is 002.0's joined string, unchanged (the host's footer prints it): the
  // sources read, and no licence the README has not checked (DEC-5 quoted one; Outcome).
  assert.match(report.attribution, /Géoportail de l’Urbanisme/);
  assert.match(report.attribution, /Géorisques/);
  assert.doesNotMatch(report.attribution, /Licence/);
});

test('criterion 10 (DEC-5 block 1): Gordes’ zone has its own date (2022-04-11, not its document’s), said on the sheet', async () => {
  const report = await readAcceptance('gordes');
  const rows = fieldsOf(report.sheet);
  assert.deepEqual(rows.at(-1), {
    label: { key: 'fr-urban-rules.sheet.field.zoneDate' },
    value: { text: '2022-04-11' }
  });
  assert.notEqual(report.document.validFrom, '2022-04-11');
});

test('criterion 11: Rochefort’s sheet holds « plan non disponible » and no invented rule; the RNU and the carte communale have no such notice', async () => {
  const report = await readAcceptance('rochefort');
  assert.equal(report.regime.code, 'not_published');
  const notices = report.sheet.blocks.filter((b) => b.kind === 'notice').map((b) => b.text.key);
  assert.deepEqual(notices, ['fr-urban-rules.sheet.notice.notPublished']);
  // Only the walk's own entered height: no coded, drawn or written rule.
  assert.deepEqual(
    [...new Set(report.rules.map((r) => r.provenance))],
    ['entered']
  );
  for (const plot of ['brouennes', 'mouzay']) {
    const other = await readAcceptance(plot);
    assert.ok(other.sheet, plot);
    assert.equal(
      other.sheet.blocks.some((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.sheet.notice.notPublished'),
      false,
      plot
    );
  }
});

test('criterion 11: `unknown` with nothing read has no sheet; with something read (a risk flag), a sheet saying a source failed', async () => {
  const reader = createReader({ fetch: () => Promise.reject(new Error('down')), site: () => undefined });
  const empty = await reader.read(requestFor(undefined), { signal: new AbortController().signal });
  assert.equal(empty.regime.code, 'unknown');
  assert.equal(empty.sheet, undefined);
  const sheet = __testing.sheetOf({
    ...empty,
    flags: [{ id: 'radon', kind: 'radon', label: { key: 'fr-urban-rules.flag.radon', params: { class: '1' } } }],
    sources: [{ id: 'gpu', name: { key: 'fr-urban-rules.source.label' }, state: 'unavailable' }]
  });
  assert.ok(sheet);
  assert.ok(sheet.blocks.some((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.sheet.notice.sourceFailed'));
});

test('criterion 11 (DEC-5 block 3): a source that failed is said on the sheet, without a count or a name in the phrase', () => {
  const report = {
    regime: { code: 'plu', label: { key: 'fr-urban-rules.regime.plu' } },
    zones: [],
    features: [],
    flags: [],
    rules: [],
    checks: [],
    assumptions: [],
    sources: [
      { id: 'gpu', name: { key: 'fr-urban-rules.source.label' }, state: 'ready' },
      { id: 'roads', name: { key: 'fr-urban-rules.source.roads' }, state: 'unavailable' }
    ],
    attribution: ''
  };
  const sheet = __testing.sheetOf(report, { site: { parcels: [], plotArea: 0 } });
  const notice = sheet.blocks.find((b) => b.kind === 'notice');
  assert.deepEqual(notice.text, { key: 'fr-urban-rules.sheet.notice.sourceFailed' });
  assert.equal(kinds(sheet).includes('assumptions'), false, 'no assumption, no empty list');
});

/**
 * The print font's coverage (096.10 DEC-7): WinAnsi — copied here as code
 * points from `packages/sheet-writer/src/winAnsi.ts`, which this repository
 * does not import — less the 17 characters the subset font lacks
 * (`packages/drawing/src/font/metrics.ts`, `PRINT_FONT_ADVANCES`).
 */
const WIN_ANSI_HIGH = [
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178
];
const NOT_IN_PRINT_FONT = [
  0x201a, 0x0192, 0x201e, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x017d, 0x2022, 0x02dc,
  0x2122, 0x0161, 0x203a, 0x017e, 0x0178
];
const printable = (character) => {
  const code = character.codePointAt(0);
  const winAnsi = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_HIGH.includes(code);
  return winAnsi && !NOT_IN_PRINT_FONT.includes(code);
};

test('criterion 12: every sheet and envelope string — and every string a report can carry — is in the print font’s WinAnsi, in both locales', () => {
  for (const [locale, strings] of Object.entries({ en, fr })) {
    const sheetKeys = Object.keys(strings).filter(
      (key) => key.startsWith('fr-urban-rules.sheet.') || key.startsWith('fr-urban-rules.envelope.')
    );
    assert.ok(sheetKeys.length >= 60, `${locale}: ${sheetKeys.length} keys`);
    for (const [key, value] of Object.entries(strings)) {
      // The programme warning goes to the assistant, never into a report;
      if (key.startsWith('fr-urban-rules.programme.')) continue;
      // 002.8: the questions' answers go to the assistant's dock, never into a report.
      if (key.startsWith('fr-urban-rules.question.')) continue;
      const outside = [...value].filter((c) => !printable(c));
      assert.deepEqual(outside, [], `${locale} ${key}: ${outside.join('')}`);
    }
    // The screen's symbols and the narrow no-break space, named once more.
    for (const key of sheetKeys) assert.doesNotMatch(strings[key], /[≥≤Δ− ]/u, key);
  }
});

test('criterion 12: never « conforme », « autorisé », "compliant", nor the envelope called « constructible » / buildable', () => {
  for (const [locale, strings] of Object.entries({ en, fr })) {
    for (const [key, value] of Object.entries(strings)) {
      if (!key.startsWith('fr-urban-rules.sheet.') && !key.startsWith('fr-urban-rules.envelope.')) continue;
      assert.doesNotMatch(value, /conforme|autoris|compliant|constructible|buildable|allowed/iu, `${locale} ${key}`);
    }
  }
  // The envelope's own label and assumptions: theoretical, never a right.
  assert.equal(fr['fr-urban-rules.envelope.label'], 'Enveloppe théorique');
  assert.equal(en['fr-urban-rules.envelope.label'], 'Theoretical envelope');
  for (const strings of [en, fr]) {
    for (const key of [
      'fr-urban-rules.assumption.envelopeLattice',
      'fr-urban-rules.assumption.envelopeChecks',
      'fr-urban-rules.assumption.envelopeApproximate',
      'fr-urban-rules.assumption.envelopeReentrantCorners'
    ]) {
      assert.doesNotMatch(strings[key], /conforme|autoris|compliant|constructible|buildable|never above|jamais au-dessus/iu, key);
      // Sprint 002.12: the title is short and the detail says the rest — the same words held.
      assert.doesNotMatch(strings[`${key}.detail`], /conforme|autoris|compliant|constructible|buildable|never above|jamais au-dessus/iu, `${key}.detail`);
    }
  }
  // DEC-4's corrected sentence, not the draft's « never above the confirmed rules ».
  assert.match(en['fr-urban-rules.assumption.envelopeLattice.detail'], /exact at each computed point/i);
  assert.match(fr['fr-urban-rules.assumption.envelopeLattice.detail'], /exact en chaque point de calcul/i);
});

/** Every phrase's params in a value, recursively. */
function paramsIn(value, out = []) {
  if (Array.isArray(value)) for (const item of value) paramsIn(item, out);
  else if (value !== null && typeof value === 'object') {
    if (value.params !== undefined) out.push(value.params);
    for (const item of Object.values(value)) paramsIn(item, out);
  }
  return out;
}

test('criterion 12 (DEC-6): on all five plots no phrase the sheet carries has a number of 1,000 or more as a parameter — figures are quantities', async () => {
  for (const plot of ['lyon', 'gordes', 'brouennes', 'mouzay', 'rochefort']) {
    const report = await readAcceptance(plot);
    // What the sheet prints: its own blocks, and the collections its reference blocks name.
    const printed = [
      report.sheet,
      report.flags,
      report.assumptions,
      report.rules.map((r) => [r.label, r.limit, r.citation]),
      report.checks.map((c) => [c.subject.label])
    ];
    for (const params of paramsIn(printed)) {
      for (const [name, value] of Object.entries(params))
        assert.ok(
          typeof value !== 'number' || Math.abs(value) < 1000,
          `${plot}: ${name} = ${value} would be grouped with U+202F in French`
        );
    }
    assert.deepEqual(paramsIn(report.sheet), [], `${plot}: the sheet's own blocks carry no parameter`);
  }
});

test('DEC-7: the sheet adds nothing about variations — the host names the open design', async () => {
  const { sheet } = await readAcceptance('lyon');
  assert.doesNotMatch(JSON.stringify(sheet), /variation/i);
});
