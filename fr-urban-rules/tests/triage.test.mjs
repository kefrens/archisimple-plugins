/**
 * Sprint 002.22: the candidate rules the system decides on its own — another sector, other
 * communes, a reference to another article, « not regulated » — folded under « Decided
 * automatically », one click to bring any back; the same text read for several sectors as one card.
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

const { triageOf, foldedSectors, sectorsDiffer, communesIn, checkedResult } = __testing;
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

// ── the decisions ───────────────────────────────────────────────────────────────

test('002.22 (a): another sector is positively another sector only when both are codes and neither begins the other', () => {
  assert.equal(sectorsDiffer('UDa2', 'UDa1'), true);
  assert.equal(sectorsDiffer('UDb', 'UDa1'), true);
  assert.equal(sectorsDiffer('UCf', 'UCe1b'), true);
  // The same, a parent of it, or one it is a parent of: they overlap, so nothing is decided.
  assert.equal(sectorsDiffer('UDa1', 'UDa1'), false);
  assert.equal(sectorsDiffer('UDa', 'UDa1'), false);
  assert.equal(sectorsDiffer('UD', 'UDa1'), false);
  assert.equal(sectorsDiffer('UDa1', 'UDa'), false);
  assert.equal(sectorsDiffer('uda1', 'UDa1'), false);
  // A word the model put in the sector decides nothing.
  assert.equal(sectorsDiffer('Espaces', 'UDa1'), false);
  assert.equal(sectorsDiffer('secteur de stationnement Aa', 'UDa1'), false);
  assert.equal(sectorsDiffer(null, 'UDa1'), false);
});

const candidate = (fields) => ({
  kind: 'other',
  sector: null,
  statement: 'described',
  limit: undefined,
  passage: 'Un texte.',
  conditions: [],
  exceptions: [],
  ...fields
});

test('002.22 (b): a commune is positively absent from the list a condition states — and named nowhere in the passage', () => {
  assert.deepEqual(
    communesIn('pour les communes de : Aix-en-Provence, Peynier et Saint-\nPaul-lez-Durance'),
    ['aixenprovence', 'peynier', 'saintpaullezdurance']
  );
  assert.deepEqual(communesIn('pour la commune de Venelles'), ['venelles']);
  assert.equal(communesIn('Dans le secteur UDa'), undefined);
  assert.equal(communesIn('pour les autres communes'), undefined);
  const fence = candidate({
    statement: 'limit',
    passage:
      'La hauteur des clôtures est inférieure ou égale à 2 mètres pour les communes de : Aix-en-Provence, Peynier.',
    conditions: ['pour les communes de : Aix-en-Provence, Peynier']
  });
  assert.deepEqual(triageOf({ item: fence, zone: 'UD', commune: 'Marseille' }).reason, {
    key: 'fr-urban-rules.triage.reason.commune',
    params: { commune: 'Marseille' }
  });
  assert.equal(
    triageOf({ item: fence, zone: 'UD', commune: 'Peynier' }),
    undefined,
    'its own commune is in the list'
  );
  assert.equal(
    triageOf({ item: fence, zone: 'UD', commune: undefined }),
    undefined,
    'no commune known: nothing decided'
  );
  // The list cut by a length limit decides nothing when the passage names the commune.
  const cut = {
    ...fence,
    conditions: ['pour les communes de : Aix-en-Provence'],
    passage: `${fence.passage} Marseille aussi.`
  };
  assert.equal(triageOf({ item: cut, zone: 'UD', commune: 'Marseille' }), undefined);
});

test('002.22 (c) and (d): a reference to another article, and « not regulated », are for information — a rule with a number is neither', () => {
  const reference = candidate({
    passage:
      '8.1 / Conditions d’accès aux voies* Se reporter à l’article 8 du titre IV A (dispositions communes applicables aux zones urbaines).'
  });
  assert.equal(
    triageOf({ item: reference, zone: 'UD', commune: 'Marseille' }).decision,
    'informational'
  );
  const withNumber = candidate({
    passage: 'Se reporter à l’article 8 : la largeur est de 4 mètres au moins.'
  });
  assert.equal(triageOf({ item: withNumber, zone: 'UD', commune: 'Marseille' }), undefined);
  const silent = candidate({
    kind: 'footprint_ratio',
    statement: 'not_regulated',
    passage: 'L’emprise au sol n’est pas règlementée.'
  });
  assert.deepEqual(triageOf({ item: silent, zone: 'UD', commune: 'Marseille' }), {
    decision: 'informational',
    reason: { key: 'fr-urban-rules.triage.reason.notRegulated' }
  });
  // A described rule that is no reference is left to the user, and so is a limit.
  assert.equal(
    triageOf({
      item: candidate({ passage: 'Toute construction doit être raccordée au réseau.' }),
      zone: 'UD',
      commune: 'Marseille'
    }),
    undefined
  );
});

// ── the real règlement: Marseille UD, 98 rules read ─────────────────────────────

function counts(zone, commune) {
  const result = checkedResult({ ...marseille });
  const keys = result.rules.map((_, i) => `k${i}`);
  const folded = foldedSectors(result.rules, keys, zone, new Set());
  let listed = 0;
  let decided = 0;
  result.rules.forEach((item, index) => {
    if (folded.get(index)?.drop === true) return;
    listed += 1;
    if (triageOf({ item, zone, commune }) !== undefined) decided += 1;
  });
  return { read: result.rules.length, listed, decided, left: listed - decided };
}

test('002.22 on Marseille UD: 98 rules read; for a plot in UDa1, in UDb and in the zone with no sector, so many are left to decide', () => {
  assert.deepEqual(counts('UDa1', 'Marseille'), { read: 98, listed: 82, decided: 26, left: 56 });
  assert.deepEqual(counts('UDb', 'Marseille'), { read: 98, listed: 81, decided: 28, left: 53 });
  // A plot labelled « UD » alone: its sectors could be anyone's, so the sector rules are kept.
  assert.deepEqual(counts('UD', 'Marseille'), { read: 98, listed: 71, decided: 5, left: 66 });
  // Without the commune the fence rules of other communes stay to decide.
  assert.equal(counts('UDa1', undefined).decided, 22);
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
  sectorUnplaced: true,
  confidence: 'high',
  ...fields
});
const metres = (comparison, value) => ({ kind: 'value', comparison, value, unit: 'm' });

const OTHER_SECTOR = serviceRule({
  kind: 'boundary_setback',
  sector: 'UCf',
  statement: 'limit',
  limit: metres('min', 6),
  passage: 'Dans le secteur UCf, le retrait est d’au moins 6 mètres.'
});
const SAME_SECTOR = serviceRule({
  kind: 'boundary_setback',
  sector: null,
  statement: 'limit',
  limit: metres('min', 4),
  sectorUnplaced: false,
  // Medium: a high-confidence reading with a figure in its text would be one of « the readings I checked » (002.26), listed apart.
  confidence: 'medium',
  passage: 'Le retrait est d’au moins 4 mètres.'
});
const OTHER_COMMUNE = serviceRule({
  kind: 'other',
  statement: 'limit',
  limit: metres('max', 2),
  passage:
    'La hauteur des clôtures est de 2 mètres pour les communes de : Aix-en-Provence, Venelles.',
  conditions: ['pour les communes de : Aix-en-Provence, Venelles'],
  sectorUnplaced: false
});
const REFERENCE = serviceRule({
  passage: '8.1 / Voirie Se reporter à l’article 8 du titre IV A (dispositions communes).',
  sectorUnplaced: false
});
const SILENT = serviceRule({
  kind: 'footprint_ratio',
  statement: 'not_regulated',
  passage: 'L’emprise au sol n’est pas réglementée.',
  sectorUnplaced: false
});
// A loose note, ranked after the setback (002.26: a parking rule is listed apart, with the rules that do not shape the area).
const PARKING = serviceRule({
  kind: 'other',
  statement: 'described',
  passage: 'Une place de stationnement par logement.',
  sectorUnplaced: false
});

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
function context({ rules, section, commune } = {}) {
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
const view = (report, id) => report.views.find((v) => v.id === id);
const written = (report) => report.rules.filter((r) => r.provenance === 'written');
const byPassage = (report, start) =>
  written(report).find((r) => r.citation.passage.text.startsWith(start));
const folded = (report) => view(report, 'rules').blocks.find((b) => b.kind === 'section');
const flat = (report) => view(report, 'rules').blocks;

test('002.22: decided automatically — ruled out is « does not apply », a reference is « for information », neither confirmed; each says why in the rule’s own conditions', async () => {
  const c = context({
    rules: [OTHER_SECTOR, SAME_SECTOR, OTHER_COMMUNE, REFERENCE, SILENT, PARKING]
  });
  const report = await read(c);
  const sector = byPassage(report, 'Dans le secteur UCf');
  assert.equal(sector.status, 'not_applicable');
  assert.deepEqual(sector.conditions.at(-1), {
    key: 'fr-urban-rules.triage.reason.sector',
    params: { sector: 'UCf', zone: 'UCe1b' }
  });
  assert.equal(byPassage(report, 'La hauteur des clôtures').status, 'not_applicable');
  assert.deepEqual(byPassage(report, 'La hauteur des clôtures').conditions.at(-1), {
    key: 'fr-urban-rules.triage.reason.commune',
    params: { commune: 'LYON' }
  });
  assert.equal(byPassage(report, '8.1 / Voirie').status, 'information');
  assert.equal(byPassage(report, 'L’emprise au sol').status, 'information');
  assert.equal(byPassage(report, 'Le retrait est').status, 'to_confirm');
  assert.equal(byPassage(report, 'Une place').status, 'to_confirm');
  assert.ok(
    !written(report).some((r) => r.status === 'confirmed'),
    'nothing is confirmed on the user’s behalf'
  );
});

test('002.22: the Rules view lists what is left — what shapes the area first — and folds the rest under « Decided automatically » with its count, a reason and « Bring back » on each card', async () => {
  const c = context({
    rules: [PARKING, OTHER_SECTOR, SAME_SECTOR, OTHER_COMMUNE, REFERENCE, SILENT]
  });
  const report = await read(c);
  const blocks = flat(report);
  const notice = blocks.find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.triage.notice'
  );
  const open = blocks.find((b) => b.kind === 'rules');
  assert.deepEqual(notice.text.params, { count: 4, left: open.ids.length });
  const setback = open.ids.indexOf(byPassage(report, 'Le retrait est').id);
  const parking = open.ids.indexOf(byPassage(report, 'Une place').id);
  assert.ok(
    setback >= 0 && parking > setback,
    'the setback before the parking, whatever the order read'
  );
  assert.ok(
    !open.ids.includes(byPassage(report, 'Dans le secteur UCf').id),
    'a decided rule is not in the open list'
  );
  const section = folded(report);
  assert.equal(section.id, 'decided-automatically');
  assert.deepEqual(section.title, { key: 'fr-urban-rules.triage.heading', params: { count: 4 } });
  assert.equal(section.open, undefined, 'folded');
  assert.deepEqual(section.summary.value.params, { ruledOut: 2, informational: 2 });
  // Sprint 002.24: by what decided them — another sector, other communes, for information — each under its heading.
  const insideBlocks = section.blocks.filter((b) => b.kind === 'rules');
  assert.deepEqual(
    section.blocks.filter((b) => b.kind === 'heading').map((b) => b.text.key),
    [
      'fr-urban-rules.triage.group.sector',
      'fr-urban-rules.triage.group.commune',
      'fr-urban-rules.triage.group.info'
    ]
  );
  const inside = { ids: insideBlocks.flatMap((b) => b.ids) };
  assert.equal(inside.ids.length, 4);
  const actions = section.blocks.find((b) => b.kind === 'actions').actions;
  assert.deepEqual(
    actions.map((a) => a.id),
    ['bring-back', 'bring-back', 'bring-back', 'bring-back']
  );
  assert.ok(
    actions.every((a) => inside.ids.includes(a.target.ruleId)),
    'beside the rules block it belongs to'
  );
  // The top-level actions are the rules still to decide, none of the folded ones.
  const top = blocks.filter((b) => b.kind === 'actions').flatMap((b) => b.actions);
  assert.ok(top.every((a) => open.ids.includes(a.target.ruleId) || a.target?.ruleId === undefined));
  assert.ok(!top.some((a) => a.id === 'bring-back'));
});

test('002.22: with nothing decided automatically the view is what it was — all the rules in one block', async () => {
  const c = context({ rules: [SAME_SECTOR, PARKING] });
  const report = await read(c);
  assert.equal(folded(report), undefined);
  assert.deepEqual(
    flat(report).find((b) => b.kind === 'rules'),
    { kind: 'rules' }
  );
});

test('002.22: « Bring back » is one entry on the plot, against this document version — the rule is to confirm again, and a new version lets it go', async () => {
  const c = context({ rules: [OTHER_SECTOR, SAME_SECTOR] });
  let report = await read(c);
  const rule = byPassage(report, 'Dans le secteur UCf');
  const bring = folded(report).blocks.find((b) => b.kind === 'actions').actions[0];
  const writes = [];
  const original = c.data.service.write;
  c.data.service.write = (next, label, expected) => {
    writes.push(label);
    return original(next, label, expected);
  };
  assert.equal((await act(c, 'bring-back', bring.target)).status, 'done');
  assert.deepEqual(writes, ['fr-urban-rules.undo.bringBack']);
  const section = c.data.held();
  assert.equal(section.broughtBack.length, 1);
  assert.equal(section.broughtBack[0].ruleKey, rule.id);
  assert.equal(__testing.sectionOf(section).readOnly, false);
  report = await read(c);
  assert.equal(byPassage(report, 'Dans le secteur UCf').status, 'to_confirm');
  assert.equal(folded(report), undefined, 'nothing is folded any more');
  // The same entry made against another version of the document is no longer one.
  const older = structuredClone(section);
  older.broughtBack[0].datvalid = '20200101';
  const after = await read(context({ rules: [OTHER_SECTOR, SAME_SECTOR], section: older }));
  assert.equal(byPassage(after, 'Dans le secteur UCf').status, 'not_applicable');
  // A malformed entry makes the section read-only, as any member this version owns does.
  assert.equal(__testing.sectionOf({ schema: 1, broughtBack: [{ nope: 1 }] }).readOnly, true);
});

test('002.22: a decision the user took stands over the automatic one — a stored confirmation of a rule that would be ruled out keeps it confirmed', async () => {
  const first = context({ rules: [OTHER_SECTOR] });
  const rule = byPassage(await read(first), 'Dans le secteur UCf');
  const section = {
    schema: 1,
    confirmations: [
      {
        ruleKey: rule.id,
        decision: 'confirmed',
        kind: 'boundary_setback',
        value: { kind: 'value', value: 6, unit: 'm' },
        limit: { kind: 'value', comparison: 'min', quantity: { value: 6, unit: 'm' } },
        idurba: '200046977_PLUI_20260326',
        datvalid: '20260326',
        edited: false,
        at: '2026-11-03T10:00:00.000Z',
        provenance: 'written',
        zone: 'UCe1b'
      }
    ]
  };
  const report = await read(context({ rules: [OTHER_SECTOR], section }));
  assert.equal(byPassage(report, 'Dans le secteur UCf').status, 'confirmed');
  assert.equal(folded(report), undefined);
});

test('002.22 (e): the same text read for several sectors is one card showing them — those of another sector fold into one ruled-out card; the stored key stays the one the user decided on', async () => {
  const text = 'Le retrait est d’au moins 4 mètres des limites.';
  const same = (sector) => ({ ...OTHER_SECTOR, sector, passage: text, limit: metres('min', 4) });
  const rules = [same('UCe1'), same('UCe1b'), same('UCf'), same('UCg')];
  const c = context({ rules });
  const report = await read(c);
  const cards = written(report).filter((r) => r.citation.passage.text === text);
  assert.equal(cards.length, 2, 'one for this plot’s sectors, one for the others');
  const mine = cards.find((r) => r.status === 'to_confirm');
  assert.ok(
    mine.conditions.some(
      (x) => x.key === 'fr-urban-rules.written.alsoSectors' && x.params.sectors === 'UCe1b'
    )
  );
  const others = cards.find((r) => r.status === 'not_applicable');
  assert.ok(
    others.conditions.some(
      (x) => x.key === 'fr-urban-rules.written.alsoSectors' && x.params.sectors === 'UCg'
    )
  );
  // A card decided before stands for the group, whatever order the sectors come in.
  const confirmed = {
    schema: 1,
    confirmations: [
      {
        ruleKey: written(await read(context({ rules: [same('UCe1b')] }))).find(
          (r) => r.citation.passage.text === text
        ).id,
        decision: 'confirmed',
        idurba: '200046977_PLUI_20260326',
        datvalid: '20260326',
        kind: 'boundary_setback',
        limit: { kind: 'value', comparison: 'min', quantity: { value: 4, unit: 'm' } },
        edited: false,
        at: '2026-11-03T10:00:00.000Z',
        provenance: 'written',
        zone: 'UCe1b'
      }
    ]
  };
  const again = await read(context({ rules: [same('UCe1'), same('UCe1b')], section: confirmed }));
  const standing = written(again).filter((r) => r.citation.passage.text === text);
  assert.equal(standing.length, 1);
  assert.equal(standing[0].status, 'confirmed');
});

test('002.22: a rule decided automatically is in the Rules view, not in the area’s list of what it did not apply', async () => {
  const c = context({ rules: [OTHER_SECTOR, SAME_SECTOR] });
  const report = await read(c);
  assert.ok(
    !JSON.stringify(view(report, 'envelope') ?? {}).includes(
      byPassage(report, 'Dans le secteur UCf').id
    )
  );
});
