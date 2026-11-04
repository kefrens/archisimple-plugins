/**
 * Sprint 002.26: what is left to decide, grouped. The same rule read twice, a bullet of another rule
 * and a rule implied by a stricter one are decided like the other automatic decisions (ruled out,
 * visible, reversible); the rules that apply without shaping the area, and the readings that can be
 * checked against their own text, are listed apart and confirmed together by one click of a person.
 * The counts are made on the real Marseille zone UD result (`test-fixtures/fr-urban-rules/marseille-ud`).
 * No network.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, createReader } from '../src/index.js';
import { FIXTURES, loadPlot, recordedFetch, recordedSiteService, requestFor } from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const {
  triageOf,
  foldedSectors,
  checkedResult,
  noDrawingOf,
  checkedReadingOf,
  conditionReadable,
  quantityIn,
  sentenceOf
} = __testing;
const BASE = 'https://editor.example/plugins-api/com.archisimple.fr-urban-rules/';
const CURRENT = { providerId: 'lmstudio', schemaVersion: 1, promptVersion: 3 };
const p = (easting, northing) => ({ easting, northing });
const BOX = [p(0, 0), p(20, 0), p(20, 30), p(0, 30)];
const SOUTH_ROAD = [
  {
    id: 'r',
    line: [p(-20, -6), p(40, -6)],
    kind: 'road',
    level: 'ground',
    widthMetres: 6,
    name: 'Rue',
    attribution: '© IGN'
  }
];
const signal = () => new AbortController().signal;
const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  text: async () => JSON.stringify(body)
});

let lyon;
let recorded;
let marseille;
before(async () => {
  lyon = await loadPlot('lyon');
  recorded = JSON.parse(await readFile(new URL('lyon/extraction/result.json', FIXTURES), 'utf8'));
  marseille = JSON.parse(await readFile(new URL('marseille-ud/result-ud.json', FIXTURES), 'utf8'));
});

// ── the pieces ──────────────────────────────────────────────────────────────────

const candidate = (fields) => ({
  kind: 'other',
  sector: null,
  statement: 'described',
  limit: undefined,
  page: 10,
  passage: 'Un texte.',
  conditions: [],
  exceptions: [],
  confidence: 'high',
  ...fields
});
const metres = (comparison, value) => ({ kind: 'value', comparison, value, unit: 'm' });

test('002.26: a sentence is compared without its list marker, its accents, its case or its punctuation — a decimal comma stays', () => {
  assert.equal(
    sentenceOf('[b] Les clôtures sont limitées à 2,5 mètres ;'),
    sentenceOf('(a) les clotures sont limitees a 2,5 metres.')
  );
  assert.equal(
    sentenceOf('de la construction existante ; • et qu’elles'),
    sentenceOf('de la construction existante, • et qu’elles')
  );
  assert.notEqual(sentenceOf('limitées à 2,5 mètres'), sentenceOf('limitées à 25 mètres'));
});

test('002.26: a figure counts as written in the passage only in its own unit', () => {
  assert.equal(quantityIn('un recul de 4 mètres', { kind: 'value', value: 4, unit: 'm' }), true);
  assert.equal(quantityIn('une hauteur de 3,5 m', { kind: 'value', value: 3.5, unit: 'm' }), true);
  assert.equal(
    quantityIn('au moins 30 % du terrain', { kind: 'ratio', percent: 30, base: 'plot_area' }),
    true
  );
  assert.equal(
    quantityIn('une surface de 250 m2', { kind: 'value', value: 250, unit: 'm2' }),
    true
  );
  // The same digits as another figure, or in another unit, are no match.
  assert.equal(quantityIn('un recul de 14 mètres', { kind: 'value', value: 4, unit: 'm' }), false);
  assert.equal(
    quantityIn('une surface de 250 m2', { kind: 'value', value: 250, unit: 'm' }),
    false
  );
  assert.equal(quantityIn('au moins 3 places', { kind: 'value', value: 3, unit: 'm' }), false);
  assert.equal(
    quantityIn('la moitié de la hauteur', { kind: 'value', value: 2, unit: 'm' }),
    false
  );
});

test('002.26: a rule applies without shaping the area when it is parking or a connection to a network — never when it speaks of a distance, a height or a footprint', () => {
  assert.equal(
    noDrawingOf(candidate({ kind: 'parking', passage: 'Logement 1 place pour 60 m2' })),
    true
  );
  assert.equal(
    noDrawingOf(
      candidate({
        passage: 'Toute construction doit être raccordée au réseau public d’assainissement.'
      })
    ),
    true
  );
  assert.equal(
    noDrawingOf(
      candidate({
        passage:
          'Pour des raisons de faisabilité technique, le débit de fuite ne pourra être inférieur à 5 l/s.'
      })
    ),
    true
  );
  assert.equal(
    noDrawingOf(
      candidate({
        passage:
          'Toute surface nouvellement imperméabilisée supérieure ou égale à 50 m2 doit faire l’objet d’une compensation.'
      })
    ),
    true
  );
  // A network word beside a geometric one: the rule stays where a person looks at it.
  assert.equal(
    noDrawingOf(
      candidate({
        passage:
          'Le raccordement au réseau est implanté à une distance de 3 mètres de la limite séparative.'
      })
    ),
    false
  );
  assert.equal(
    noDrawingOf(candidate({ kind: 'boundary_setback', passage: 'Retrait de 4 mètres.' })),
    false
  );
  assert.equal(noDrawingOf(candidate({ passage: 'Les façades sont soignées.' })), false);
  assert.equal(
    noDrawingOf(
      candidate({
        statement: 'see_graphic',
        passage: 'Réseau public : voir le règlement graphique.'
      })
    ),
    false
  );
});

test('002.26: a reading can be checked when its figure is in its text, it is high-confidence, it has no exception and every condition is one this reads', () => {
  const limit = candidate({
    kind: 'other',
    statement: 'limit',
    limit: { kind: 'value', comparison: 'max', value: 12, unit: 'm' },
    passage:
      'La longueur totale de façade des constructions implantées en limite séparative est limitée à 12 mètres.',
    conditions: ['Dans la zone UD']
  });
  assert.equal(checkedReadingOf({ item: limit, zone: 'UDa1' }), true);
  assert.equal(checkedReadingOf({ item: { ...limit, conditions: [] }, zone: 'UDa1' }), true);
  // A heading that names only other sectors of the zone is not read for this plot.
  assert.equal(
    checkedReadingOf({ item: { ...limit, conditions: ['Dans le secteur UCf'] }, zone: 'UDa1' }),
    false
  );
  assert.equal(checkedReadingOf({ item: { ...limit, confidence: 'medium' }, zone: 'UDa1' }), false);
  assert.equal(checkedReadingOf({ item: { ...limit, sectorUnplaced: true }, zone: 'UDa1' }), false);
  assert.equal(
    checkedReadingOf({
      item: { ...limit, exceptions: ['Sauf pour les extensions.'] },
      zone: 'UDa1'
    }),
    false
  );
  assert.equal(
    checkedReadingOf({ item: { ...limit, statement: 'described' }, zone: 'UDa1' }),
    false
  );
  // The figure must be written in the passage: « half the height » has none.
  assert.equal(
    checkedReadingOf({
      item: { ...limit, passage: 'La longueur de façade est limitée au tiers du terrain.' },
      zone: 'UDa1'
    }),
    false
  );
  // A condition this does not read — a subject that narrows the rule, a case, a graphic — keeps it for a person.
  for (const condition of [
    'Le bassin de piscine non couvert',
    'Le long des linéaires de gabarit figurant sur le règlement graphique',
    'Dans le cas d’un projet dont le terrain d’assiette présente une configuration en drapeau',
    'lorsqu’elle existe'
  ])
    assert.equal(
      checkedReadingOf({ item: { ...limit, conditions: [condition] }, zone: 'UDa1' }),
      false,
      condition
    );
  // A strip is a band, never a plain limit.
  assert.equal(
    checkedReadingOf({
      item: {
        ...limit,
        passage:
          'La hauteur est limitée à 4 mètres dans une bande de 0 à 4 mètres à compter de la limite séparative.'
      },
      zone: 'UDa1'
    }),
    false
  );
});

test('002.26: a condition is read when it is a heading for the plot’s zone, the scale of the plot, a use, an extension or a threshold the zone is concerned by', () => {
  const item = candidate({});
  assert.equal(
    conditionReadable('Dans la zone UD et les secteurs UDa et UDa2', item, 'UDa1'),
    true
  );
  assert.equal(
    conditionReadable('Dans la zone UD et les secteurs UDa et UDa2', item, 'UDb'),
    true,
    'UD begins UDb'
  );
  assert.equal(conditionReadable('Dans les secteurs UDb et UDa2', item, 'UDa1'), false);
  assert.equal(
    conditionReadable('à l’échelle du terrain d’assiette* du projet', item, 'UDa1'),
    true
  );
  assert.equal(conditionReadable('Logement', item, 'UDa1'), true);
  assert.equal(conditionReadable('Une seule extension des constructions', item, 'UDa1'), true);
  assert.equal(
    conditionReadable(
      'Pour les constructions d’une surface de plancher inférieure à 500 m2 dans les secteurs UDa et UDa1',
      item,
      'UDa1'
    ),
    true
  );
  assert.equal(
    conditionReadable(
      'Pour les constructions d’une surface de plancher inférieure à 500 m2 dans les secteurs UDa et UDa1',
      item,
      'UDa2'
    ),
    false,
    'a threshold stated for other sectors'
  );
  assert.equal(
    conditionReadable(
      'qu’elles soient nécessaires à une activité principale existante à proximité',
      item,
      'UDa1'
    ),
    false
  );
});

// ── the real règlement: Marseille UD ────────────────────────────────────────────

function foldsOf(zone) {
  const result = checkedResult({ ...marseille });
  const keys = result.rules.map((_, i) => `k${i}`);
  const folded = foldedSectors(
    result.rules,
    keys,
    zone,
    new Set(),
    (index) => triageOf({ item: result.rules[index], zone, commune: 'Marseille' }) === undefined
  );
  return result.rules.flatMap((item, index) => {
    const fold = folded.get(index)?.fold;
    return fold === undefined
      ? []
      : [
          {
            kind: fold.kind,
            pages: [item.page, result.rules[fold.of].page],
            sector: item.sector,
            of: result.rules[fold.of].sector
          }
        ];
  });
}

test('002.26 on Marseille UD, UDa1: the restaurant sentence, the road-side exemption and the pool distance are each read once; three bullets and the 20 % green ratio fold under what they belong to', () => {
  const folds = foldsOf('UDa1');
  const by = (kind) => folds.filter((f) => f.kind === kind);
  assert.equal(by('duplicate').length, 3);
  assert.deepEqual(
    by('duplicate').map((f) => f.pages),
    [
      [172, 172],
      [173, 173],
      [174, 174]
    ]
  );
  assert.equal(by('fragment').length, 3);
  assert.ok(
    by('fragment').every((f) => f.pages[0] === 176 && f.pages[1] === 175),
    'the bullets of page 176, read with the exemption of page 175'
  );
  assert.deepEqual(
    by('implied').map((f) => [f.sector, f.of]),
    [['UD', 'UDa']]
  );
  assert.equal(folds.length, 7);
});

test('002.26 on Marseille UD: UDb and the zone with no sector fold only what is the same sentence — two sectors of one zone stay two rules', () => {
  assert.deepEqual(
    foldsOf('UDb').map((f) => f.kind),
    ['duplicate', 'duplicate']
  );
  // For « UD » alone the UDa and UDa2 copies of a sentence are two sectors’ rules: only the sentence with no sector folds.
  assert.deepEqual(
    foldsOf('UD').map((f) => f.kind),
    ['duplicate']
  );
});

test('002.26 on Marseille UD: 15 rules apply without shaping the area — seven parking rows and eight connections — whichever sector', () => {
  for (const zone of ['UDa1', 'UDb', 'UD']) {
    const result = checkedResult({ ...marseille });
    const keys = result.rules.map((_, i) => `k${i}`);
    const folded = foldedSectors(result.rules, keys, zone, new Set(), () => true);
    const grouped = result.rules.filter(
      (item, index) =>
        folded.get(index)?.drop !== true &&
        triageOf({ item, zone, commune: 'Marseille' }) === undefined &&
        noDrawingOf(item)
    );
    assert.equal(grouped.filter((item) => item.kind === 'parking').length, 7, zone);
    assert.equal(grouped.filter((item) => item.kind === 'other').length, 8, zone);
  }
});

// ── the reader ──────────────────────────────────────────────────────────────────

const serviceRule = (fields) => ({
  kind: 'other',
  sector: null,
  statement: 'described',
  limit: null,
  page: 126,
  article: '2.2.1.2',
  passage: 'Une règle de test.',
  offset: { start: 1, end: 10 },
  occurrence: { of: 1, chosenBy: 'only' },
  conditions: [],
  exceptions: [],
  sectorUnplaced: false,
  confidence: 'high',
  ...fields
});
const CHECKED = serviceRule({
  kind: 'boundary_setback',
  statement: 'limit',
  limit: metres('min', 4),
  conditions: ['Dans la zone UCe'],
  passage: 'Dans la zone UCe, le retrait est d’au moins 4 mètres.'
});
const NETWORK = serviceRule({
  passage: 'Toute construction doit être raccordée au réseau public d’assainissement.'
});
const PARK = serviceRule({ kind: 'parking', passage: 'Une place par logement.' });
const LOOSE = serviceRule({ passage: 'Les façades sont soignées.' });
const FENCE_A = serviceRule({ passage: '[a] Les clôtures doivent être ajourées ;' });
const FENCE_B = serviceRule({ sector: 'UCe1', passage: '[b] Les clôtures doivent être ajourées.' });
const PARENT = serviceRule({
  kind: 'boundary_setback',
  passage: 'Les extensions peuvent être implantées plus près, à condition :'
});
const FRAGMENT = serviceRule({ passage: 'et qu’elles respectent l’article 4.1 ;' });
const green = (sector, percent) =>
  serviceRule({
    kind: 'green_ratio',
    sector,
    statement: 'limit',
    limit: { kind: 'ratio', comparison: 'min', percent, base: 'plot_area' },
    sectorUnplaced: true,
    passage: `${sector} Au moins ${percent} % du terrain`
  });
const ALL = [
  CHECKED,
  NETWORK,
  PARK,
  LOOSE,
  FENCE_A,
  FENCE_B,
  PARENT,
  FRAGMENT,
  green('UCe', 20),
  green('UCe1', 30)
];

function store(initial) {
  let held = initial;
  return {
    held: () => held,
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next) => {
        held = structuredClone(next);
        return true;
      }
    }
  };
}
function context({ rules, section } = {}) {
  const cached = { ...structuredClone(recorded), promptVersion: 3, rules };
  const planning = recordedFetch(lyon.answers, {});
  const fetch = async (url) => {
    if (!String(url).startsWith(BASE)) return planning.fetch(url, {});
    const path = new URL(String(url)).pathname.replace(
      '/plugins-api/com.archisimple.fr-urban-rules/',
      ''
    );
    if (path === 'v1/chapter')
      return json(200, {
        pages: [121, 144],
        found: 'outline',
        match: 'prefix',
        title: 'Zone UCe1',
        documentPages: 803
      });
    if (path === 'v1/extractions') return json(200, { result: cached, current: CURRENT });
    return json(404, { error: 'not_found' });
  };
  const site = { ...lyon.site, boundary: { ring: BOX } };
  const data = store(section);
  const reader = createReader({
    fetch,
    site: () => recordedSiteService(site, lyon.conversions, {}),
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    pluginService: () => ({ locate: async () => ({ baseUrl: BASE }) }),
    packageData: () => data.service,
    document: () => ({ find: () => [] }),
    translate: (key) => key
  });
  return { reader, site, data };
}
const read = (c) => c.reader.read(requestFor(c.site), { signal: signal() });
const act = (c, actionId, target) =>
  c.reader.runAction({ actionId, target, site: c.site }, { signal: signal() });
const blocksOf = (report) => report.views.find((v) => v.id === 'rules').blocks;
const sectionOf = (report, id) => blocksOf(report).find((b) => b.kind === 'section' && b.id === id);
const written = (report) => report.rules.filter((r) => r.provenance === 'written');
const byPassage = (report, start) =>
  written(report).find((r) => r.citation.passage.text.startsWith(start));
const idsIn = (section) => section.blocks.find((b) => b.kind === 'rules').ids;
const batchAction = (section) => section.blocks.find((b) => b.kind === 'actions').actions[0];

test('002.26: the view folds the same rule read twice, the bullet and the implied minimum — ruled out, with their reason — and lists the two groups apart; nothing is confirmed', async () => {
  const report = await read(context({ rules: ALL }));
  const reason = (rule) => rule.conditions.at(-1);
  assert.equal(byPassage(report, '[b] Les clôtures').status, 'not_applicable');
  assert.deepEqual(reason(byPassage(report, '[b] Les clôtures')), {
    key: 'fr-urban-rules.triage.reason.duplicate',
    params: { page: 126 }
  });
  assert.equal(byPassage(report, 'et qu’elles respectent').status, 'not_applicable');
  assert.deepEqual(reason(byPassage(report, 'et qu’elles respectent')), {
    key: 'fr-urban-rules.triage.reason.fragment',
    params: { page: 126 }
  });
  assert.equal(byPassage(report, 'UCe Au moins 20').status, 'not_applicable');
  assert.deepEqual(reason(byPassage(report, 'UCe Au moins 20')), {
    key: 'fr-urban-rules.triage.reason.implied',
    params: { page: 126 }
  });
  // The ones they stand under are still to confirm.
  for (const start of ['[a] Les clôtures', 'Les extensions', 'UCe1 Au moins 30'])
    assert.equal(byPassage(report, start).status, 'to_confirm', start);
  assert.ok(
    !written(report).some((r) => r.status === 'confirmed'),
    'nothing is confirmed on the user’s behalf'
  );

  const decided = sectionOf(report, 'decided-automatically');
  assert.deepEqual(decided.title, { key: 'fr-urban-rules.triage.heading', params: { count: 3 } });
  assert.deepEqual(
    decided.blocks.filter((b) => b.kind === 'heading').map((b) => b.text),
    decided.blocks.filter((b) => b.kind === 'heading').length < 2
      ? []
      : [{ key: 'fr-urban-rules.triage.group.folded', params: { count: 3 } }]
  );

  // The groups, apart from the rules a person looks at one by one.
  const open = blocksOf(report).find((b) => b.kind === 'rules');
  const idOf = (start) => byPassage(report, start).id;
  assert.deepEqual(
    // (The plot’s two drawn rules are in the list too; the written ones are what this sprint sorts.)
    open.ids.filter((id) => id.startsWith('written:')).sort(),
    ['Les façades', '[a] Les clôtures', 'Les extensions', 'UCe1 Au moins 30'].map(idOf).sort()
  );
  const checked = sectionOf(report, 'checked-readings');
  assert.deepEqual(checked.title, {
    key: 'fr-urban-rules.batch.checked.heading',
    params: { count: 1 }
  });
  assert.deepEqual(idsIn(checked), [idOf('Dans la zone UCe')]);
  const applies = sectionOf(report, 'applies-no-drawing');
  assert.deepEqual(applies.title, {
    key: 'fr-urban-rules.batch.applies.heading',
    params: { count: 2 }
  });
  assert.deepEqual(
    [...idsIn(applies)].sort(),
    ['Toute construction', 'Une place'].map(idOf).sort()
  );
  assert.deepEqual(batchAction(applies).label, {
    key: 'fr-urban-rules.batch.applies.confirm',
    params: { count: 2 }
  });
  assert.deepEqual(batchAction(checked).label, {
    key: 'fr-urban-rules.batch.checked.confirm',
    params: { count: 1 }
  });
  const notice = blocksOf(report).find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.batch.notice'
  );
  assert.deepEqual(notice.text.params, { count: 3 });
  const left = blocksOf(report).find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.triage.notice'
  );
  // Four written rules and the plot’s two drawn ones.
  assert.deepEqual(left.text.params, { count: 3, left: 6 });
});

test('002.26: with nothing to group or fold the view is what it was — all the rules in one block', async () => {
  const report = await read(context({ rules: [LOOSE, FENCE_A] }));
  assert.deepEqual(
    blocksOf(report).find((b) => b.kind === 'rules'),
    { kind: 'rules' }
  );
  assert.equal(sectionOf(report, 'checked-readings'), undefined);
  assert.equal(sectionOf(report, 'applies-no-drawing'), undefined);
});

test('002.26: one click confirms a group — one undoable write, the very entries a single « Confirm » writes — and each rule can still be reopened', async () => {
  const c = context({ rules: ALL });
  const report = await read(c);
  const applies = sectionOf(report, 'applies-no-drawing');
  const writes = [];
  const original = c.data.service.write;
  c.data.service.write = (next, label, expected) => {
    writes.push(label);
    return original(next, label, expected);
  };
  assert.equal(c.data.held(), undefined, 'nothing is stored before the click');
  assert.equal((await act(c, 'confirm-batch', batchAction(applies).target)).status, 'done');
  assert.deepEqual(writes, ['fr-urban-rules.undo.confirmBatch'], 'one write, one undo step');
  const stored = c.data.held().confirmations;
  assert.equal(stored.length, 2);
  assert.ok(
    stored.every(
      (e) => e.decision === 'confirmed' && e.provenance === 'written' && e.edited === false
    )
  );

  // The same entry as a single « Confirm » on the same rule (the time of the act aside).
  const single = context({ rules: ALL });
  const first = await read(single);
  const network = byPassage(first, 'Toute construction');
  const confirm = first.views
    .find((v) => v.id === 'rules')
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions)
    .find((a) => a.id === 'confirm' && a.target.ruleId === network.id);
  assert.equal((await act(single, 'confirm', confirm.target)).status, 'done');
  const alone = single.data.held().confirmations[0];
  const together = stored.find((e) => e.ruleKey === network.id);
  assert.deepEqual({ ...together, at: undefined }, { ...alone, at: undefined });

  // They are confirmed now, and the group is gone; the other group and the folds are untouched.
  const after = await read(c);
  // A rule confirmed is not « left to decide »: the count does not grow when a group is confirmed.
  const leftOf = (r) =>
    blocksOf(r).find((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.triage.notice')
      .text.params.left;
  assert.equal(leftOf(after), leftOf(report));
  assert.equal(byPassage(after, 'Toute construction').status, 'confirmed');
  assert.equal(byPassage(after, 'Une place').status, 'confirmed');
  assert.equal(sectionOf(after, 'applies-no-drawing'), undefined);
  assert.ok(sectionOf(after, 'checked-readings') !== undefined);
  assert.equal(byPassage(after, '[b] Les clôtures').status, 'not_applicable');

  // Reopening one brings back only that one.
  assert.equal((await act(c, 'reopen', { ruleId: network.id })).status, 'done');
  const reopened = await read(c);
  assert.equal(byPassage(reopened, 'Toute construction').status, 'to_confirm');
  assert.equal(byPassage(reopened, 'Une place').status, 'confirmed');
  assert.deepEqual(idsIn(sectionOf(reopened, 'applies-no-drawing')), [network.id]);
});

test('002.26: the readings checked are confirmed the same way; a click on a list that is no longer the one shown is « read again », and writes nothing', async () => {
  const c = context({ rules: ALL });
  const report = await read(c);
  const checked = sectionOf(report, 'checked-readings');
  const applies = sectionOf(report, 'applies-no-drawing');
  const writes = [];
  const original = c.data.service.write;
  c.data.service.write = (...args) => {
    writes.push(args[1]);
    return original(...args);
  };
  const swapped = {
    subjectId: batchAction(checked).target.subjectId.replace(/\|b=checked/u, '|b=applies')
  };
  assert.deepEqual((await act(c, 'confirm-batch', swapped)).message, {
    key: 'fr-urban-rules.written.readAgain'
  });
  const unknown = {
    subjectId: batchAction(checked).target.subjectId.replace(/\|b=checked/u, '|b=everything')
  };
  assert.deepEqual((await act(c, 'confirm-batch', unknown)).message, {
    key: 'fr-urban-rules.edges.changed'
  });
  const older = {
    subjectId: batchAction(applies).target.subjectId.replace(/d=[^|]*/u, 'd=19990101')
  };
  assert.equal(
    (await act(c, 'confirm-batch', older)).status,
    'refused',
    'another version of the document'
  );
  assert.deepEqual(writes, []);
  assert.equal(c.data.held(), undefined);

  assert.equal((await act(c, 'confirm-batch', batchAction(checked).target)).status, 'done');
  const entry = c.data.held().confirmations[0];
  assert.equal(entry.decision, 'confirmed');
  assert.deepEqual(entry.limit, {
    kind: 'value',
    comparison: 'min',
    quantity: { value: 4, unit: 'm' }
  });
  assert.equal(byPassage(await read(c), 'Dans la zone UCe').status, 'confirmed');
});

test('002.26: a rule brought back is looked at one by one — out of the groups — and a rule folded comes back with « Bring back »', async () => {
  const c = context({ rules: ALL });
  const report = await read(c);
  const network = byPassage(report, 'Toute construction');
  // « Bring back » exists for the folded ones only; a grouped rule is not decided, so it has none.
  const decided = sectionOf(report, 'decided-automatically');
  const back = decided.blocks.find((b) => b.kind === 'actions').actions;
  assert.deepEqual(
    back.map((a) => a.id),
    ['bring-back', 'bring-back', 'bring-back']
  );
  const fragment = byPassage(report, 'et qu’elles respectent');
  assert.equal(
    (await act(c, 'bring-back', back.find((a) => a.target.ruleId === fragment.id).target)).status,
    'done'
  );
  const after = await read(c);
  assert.equal(byPassage(after, 'et qu’elles respectent').status, 'to_confirm');
  assert.ok(
    blocksOf(after)
      .find((b) => b.kind === 'rules')
      .ids.includes(fragment.id)
  );
  assert.ok(idsIn(sectionOf(after, 'applies-no-drawing')).includes(network.id));
});

test('002.26: a decision the user took stands over a fold — the confirmed sentence stays, the other is the one folded', async () => {
  const first = await read(context({ rules: [FENCE_A, FENCE_B] }));
  const confirmed = {
    schema: 1,
    confirmations: [
      {
        ruleKey: byPassage(first, '[b] Les clôtures').id,
        decision: 'confirmed',
        kind: 'other',
        statement: 'described',
        idurba: '200046977_PLUI_20260326',
        datvalid: '20260326',
        edited: false,
        at: '2026-11-04T10:00:00.000Z',
        provenance: 'written',
        zone: 'UCe1b'
      }
    ]
  };
  const report = await read(context({ rules: [FENCE_A, FENCE_B], section: confirmed }));
  assert.equal(byPassage(report, '[b] Les clôtures').status, 'confirmed');
  assert.equal(byPassage(report, '[a] Les clôtures').status, 'not_applicable');
});

test('002.26: a minimum is implied only by a stricter one of a sector that contains the plot’s zone — a sector that is not the plot’s, or an unrelated figure, folds nothing', async () => {
  // UCg is not the plot’s sector; UCe1b contains no UCe1c.
  const report = await read(
    context({ rules: [green('UCe', 20), green('UCg', 30), serviceRule({ ...green('UCe1c', 40) })] })
  );
  assert.equal(byPassage(report, 'UCe Au moins 20').status, 'to_confirm');
  // A maximum is implied by a smaller one in a sector that contains the zone.
  const max = (sector, value) =>
    serviceRule({
      kind: 'height_total',
      sector,
      statement: 'limit',
      limit: metres('max', value),
      sectorUnplaced: true,
      passage: `${sector} Hauteur maximale ${value} mètres`
    });
  const both = await read(context({ rules: [max('UCe', 12), max('UCe1', 9)] }));
  assert.equal(byPassage(both, 'UCe Hauteur').status, 'not_applicable');
  assert.equal(byPassage(both, 'UCe1 Hauteur').status, 'to_confirm');
  // The relaxing direction folds nothing: a larger maximum in the more specific sector is its own rule.
  const relaxed = await read(context({ rules: [max('UCe', 9), max('UCe1', 12)] }));
  assert.equal(byPassage(relaxed, 'UCe Hauteur').status, 'to_confirm');
  assert.equal(byPassage(relaxed, 'UCe1 Hauteur').status, 'to_confirm');
});

test('002.26: a group is not offered to a read-only section — the rules are listed, with no action', async () => {
  const report = await read(context({ rules: ALL, section: { schema: 999, confirmations: [] } }));
  const applies = sectionOf(report, 'applies-no-drawing');
  if (applies !== undefined)
    assert.equal(
      applies.blocks.some((b) => b.kind === 'actions'),
      false
    );
});
