/**
 * Drawn and entered rules (Sprint 002.2): the parser against the recorded
 * corpus, the keys, the section's decisions, the actions' single writes, the
 * version matching, the checks and the envelope. No network: 002.0's
 * recordings, a stubbed section store that records every write, and measures
 * stubbed per building.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, createReader } from '../src/index.js';
import {
  FIXTURES,
  answering,
  loadPlot,
  recordedFetch,
  recordedSiteService,
  requestFor
} from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const plots = {};
let corpus;
before(async () => {
  for (const plot of ['lyon', 'gordes', 'rochefort']) plots[plot] = await loadPlot(plot);
  corpus = JSON.parse(await readFile(new URL('prescription-corpus.json', FIXTURES), 'utf8'));
});

const signal = () => new AbortController().signal;
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

/** Measures for named outlines: `buildings` maps an id (`building-main` first) to `{ outline, top, eaves, distances }`. */
function measuresFor(buildings) {
  const ids = Object.keys(buildings);
  const projection = (input = {}) => {
    const id = input.buildingId ?? ids[0];
    const b = buildings[id];
    if (b === undefined) return { available: false, reason: 'unknown-building' };
    return {
      available: true,
      buildingId: id,
      storeys: { polygons: [{ outer: b.outline, holes: [] }], area: 1 },
      height: b.height ?? {
        frame: 'datum',
        groundAtFoot: { min: 0, max: 0 },
        top: b.top,
        topAboveGround: { fromLowest: b.top, fromHighest: b.top },
        ...(b.eaves === undefined
          ? {}
          : { eaves: b.eaves, eavesAboveGround: { fromLowest: b.eaves, fromHighest: b.eaves } }),
        notModelled: []
      }
    };
  };
  const calls = [];
  return {
    calls,
    projection,
    distances: (input) => {
      calls.push(input);
      const b = buildings[input.buildingId ?? ids[0]];
      return {
        available: true,
        buildingId: input.buildingId ?? ids[0],
        targets: input.targets.map((t) => ({
          target: t,
          nearest: { building: p(0, 0), target: p(0, 1), distance: b.distances?.[t.edge] ?? 10 }
        }))
      };
    }
  };
}

/** A recording section store, as 096.4's: `write(next, label, expected)` → boolean. */
function store(initial, { write } = {}) {
  let held = initial;
  const writes = [];
  return {
    writes,
    held: () => held,
    set: (value) => (held = value),
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next, label, expected) => {
        writes.push({ next: structuredClone(next), label, expected });
        if (write !== undefined) return write(next);
        held = structuredClone(next);
        return true;
      }
    }
  };
}

function rulesReader(
  plot,
  {
    section,
    measured,
    boundary,
    roads = SOUTH_ROAD,
    buildings = [],
    overrides = {},
    scaled = false
  } = {}
) {
  const { site: recordedSite, conversions, answers } = plots[plot];
  const site =
    boundary === undefined ? recordedSite : { ...recordedSite, boundary: { ring: boundary } };
  const recorded = recordedSiteService(
    site,
    conversions,
    measured === undefined ? {} : { measures: measured }
  );
  const service = scaled
    ? {
        ...recorded,
        toGeographicRing: (ring) =>
          ring.map((q) => ({ longitude: q.easting / 1e5, latitude: q.northing / 1e5 })),
        fromGeographicRing: (ring) =>
          ring.map((q) => ({ easting: q.longitude * 1e5, northing: q.latitude * 1e5 }))
      }
    : recorded;
  const fetched = recordedFetch(answers, overrides);
  const data = section ?? store(undefined);
  const reader = createReader({
    fetch: fetched.fetch,
    site: () => service,
    roads: () => ({ queryRoads: async () => roads }),
    packageData: () => data.service,
    document: () => ({ find: (type) => (type === 'Building' ? buildings : []) }),
    translate: (key) => `label:${key}`
  });
  return { reader, site, data, fetched };
}

const read = (context, reason = 'site') =>
  context.reader.read(requestFor(context.site, reason), { signal: signal() });
const act = (context, actionId, target, values) =>
  context.reader.runAction(
    { actionId, target, ...(values === undefined ? {} : { values }), site: context.site },
    { signal: signal() }
  );
const view = (report, id) => report.views.find((v) => v.id === id);
const ruleActions = (report) =>
  view(report, 'rules')
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions);
const actionOn = (report, id, ruleId) =>
  ruleActions(report).find((a) => a.id === id && a.target?.ruleId === ruleId);
const heightRule = (report) => report.rules.find((r) => r.label.text === 'Hauteur Max-22');

// ── Criterion 1: the parser ─────────────────────────────────────────────────────

test('criterion 1: « Hauteur Max-22 » / « 22 » parses to height_total 22 m, confidence high', () => {
  assert.deepEqual(
    __testing.parsePrescriptionValue({ typepsc: '39', libelle: 'Hauteur Max-22', txt: '22' }),
    {
      kind: 'height_total',
      value: 22,
      unit: 'm',
      confidence: 'high',
      conditions: []
    }
  );
});

test('criterion 1: every pair of the recorded corpus (12 communes) parses to its reviewed expectation', () => {
  let count = 0;
  for (const [commune, { pairs }] of Object.entries(corpus.communes)) {
    for (const pair of pairs) {
      assert.deepEqual(
        __testing.parsePrescriptionValue(pair),
        pair.expected,
        `${commune}: ${pair.libelle} | ${pair.txt}`
      );
      count += 1;
    }
  }
  assert.ok(count >= 50, `${count} pairs`);
  assert.ok(Object.keys(corpus.communes).length >= 12);
});

test('DEC-1: the parser’s special cases — R+n a condition, a coefficient a percentage, « ET » the eaves', () => {
  const parse = __testing.parsePrescriptionValue;
  assert.deepEqual(parse({ typepsc: '39', libelle: 'hauteur par niveaux', txt: 'R+5+C' }), {
    kind: 'height_total',
    conditions: ['R+5+C']
  });
  assert.equal(parse({ typepsc: '42', libelle: 'Coefficient de biotope', txt: '0.3' }).value, 30);
  assert.equal(parse({ typepsc: '42', libelle: 'Pleine terre', txt: '40 %' }).value, 40);
  assert.equal(
    parse({ typepsc: '39', libelle: 'Hauteur maximale', txt: '10mET' }).kind,
    'height_facade'
  );
  assert.equal(parse({ typepsc: '38', libelle: 'Emprise', txt: '60%' }).kind, 'footprint_ratio');
  assert.equal(parse({ typepsc: '38', libelle: 'Surface', txt: '250 m²' }).kind, 'floor_area_max');
  assert.equal(parse({ typepsc: '44', libelle: 'Stationnement', txt: '2' }).value, undefined);
  assert.equal(
    parse({ typepsc: '39', libelle: '9 m à l’égout, 12 m au faîtage', txt: '' }).confidence,
    'low'
  );
});

// ── Criterion 2: a drawn rule to confirm, with its real result ─────────────────

test('criterion 2: a drawn rule enters to_confirm; its check carries its real result and the host would not count it', async () => {
  const lyon = rulesReader('lyon');
  const plain = await read(lyon);
  const rule = heightRule(plain);
  assert.equal(rule.status, 'to_confirm');
  assert.equal(rule.provenance, 'drawn');
  assert.deepEqual(rule.limit, {
    kind: 'value',
    comparison: 'max',
    quantity: { value: 22, unit: 'm' }
  });
  assert.equal(rule.confidence, 'high');
  assert.equal(rule.citation.href, plain.document.href);
  // A building inside the prescription, 25 m high.
  const outline = plain.features.find((f) => f.label.text === 'Hauteur Max-22').rings[0];
  const context = rulesReader('lyon', {
    measured: measuresFor({ 'building-main': { outline, top: 25 } })
  });
  const report = await read(context);
  const check = report.checks.find((c) => c.ruleId === rule.id);
  assert.equal(check.result, 'potential_issue');
  assert.deepEqual([check.measured.value, check.limit.value], [25, 22]);
  // The host's isPotentialIssue: a potential issue on a confirmed rule only.
  const counted = report.checks.filter(
    (c) =>
      c.result === 'potential_issue' &&
      report.rules.find((r) => r.id === c.ruleId)?.status === 'confirmed'
  );
  assert.equal(counted.length, 0);
});

// ── Criteria 3, 4: the actions, one write each; undo ───────────────────────────

test('criterion 3: Confirm, Edit value, Does not apply and Reopen each write once, with expected, and the report shows it', async () => {
  const section = store({ schema: 1, edgeRoles: [] });
  const context = rulesReader('lyon', { section });
  let report = await read(context);
  const id = heightRule(report).id;

  assert.deepEqual(await act(context, 'confirm', actionOn(report, 'confirm', id).target), {
    status: 'done'
  });
  assert.equal(section.writes.length, 1);
  assert.deepEqual(section.writes[0].expected, { schema: 1, edgeRoles: [] });
  assert.equal(section.writes[0].label, 'label:fr-urban-rules.undo.confirm');
  assert.deepEqual(section.writes[0].next.edgeRoles, []);
  const entry = section.writes[0].next.confirmations[0];
  assert.deepEqual(
    {
      ruleKey: entry.ruleKey,
      plot: entry.plot,
      idurba: entry.idurba,
      datvalid: entry.datvalid,
      decision: entry.decision,
      value: entry.value,
      edited: entry.edited
    },
    {
      ruleKey: id,
      plot: ['69382000AB0105'],
      idurba: '200046977_PLUI_20260326',
      datvalid: '20260326',
      decision: 'confirmed',
      value: { kind: 'value', value: 22, unit: 'm' },
      edited: false
    }
  );
  report = await read(context);
  assert.equal(heightRule(report).status, 'confirmed');

  await act(context, 'edit-value', actionOn(report, 'edit-value', id).target, { value: 18 });
  assert.equal(section.writes.length, 2);
  report = await read(context);
  assert.deepEqual(heightRule(report).limit.quantity, { value: 18, unit: 'm' });
  assert.equal(section.held().confirmations[0].edited, true);

  await act(context, 'not-applicable', actionOn(report, 'not-applicable', id).target);
  report = await read(context);
  assert.equal(heightRule(report).status, 'not_applicable');

  await act(context, 'reopen', actionOn(report, 'reopen', id).target);
  assert.equal(section.writes.length, 4);
  for (const w of section.writes) assert.notEqual(w.expected, undefined);
  report = await read(context);
  assert.equal(heightRule(report).status, 'to_confirm');
});

const addTarget = (report, id) => ruleActions(report).find((a) => a.id === id).target;

test('criterion 3: each Add action, Edit and Remove write once; the report shows the entered rule', async () => {
  const section = store(undefined);
  const context = rulesReader('lyon', { section });
  let report = await read(context);
  const add = (id, values) => act(context, id, addTarget(report, id), values);
  assert.deepEqual(
    await add('add-distance', {
      kind: 'rear_setback',
      statement: 'limit',
      value: 4,
      source: 'Règlement PLUi',
      page: 132,
      note: 'Art. 2.1.3'
    }),
    { status: 'done' }
  );
  assert.deepEqual(
    await add('add-ratio', {
      kind: 'green_ratio',
      statement: 'limit',
      value: 30,
      source: 'Règlement PLUi'
    }),
    { status: 'done' }
  );
  assert.deepEqual(
    await add('add-area', {
      kind: 'annex_max',
      statement: 'limit',
      value: 20,
      source: 'Règlement PLUi'
    }),
    { status: 'done' }
  );
  assert.equal(section.writes.length, 3);
  report = await read(context);
  const rear = report.rules.find((r) => r.label.key === 'fr-urban-rules.entered.kind.rear_setback');
  assert.equal(rear.provenance, 'entered');
  assert.equal(rear.status, 'confirmed');
  assert.deepEqual(rear.limit, {
    kind: 'value',
    comparison: 'min',
    quantity: { value: 4, unit: 'm' }
  });
  assert.equal(section.held().entered[0].zone, 'UCe1b');
  assert.deepEqual(section.held().entered[0].edgeRoles, ['rear']);

  await act(context, 'edit-entered', actionOn(report, 'edit-entered', rear.id).target, {
    statement: 'limit',
    value: 5,
    source: 'Règlement PLUi',
    page: 133
  });
  report = await read(context);
  assert.deepEqual(report.rules.find((r) => r.id === rear.id).limit.quantity, {
    value: 5,
    unit: 'm'
  });
  await act(context, 'remove-entered', actionOn(report, 'remove-entered', rear.id).target);
  assert.equal(section.writes.length, 5);
  report = await read(context);
  assert.equal(
    report.rules.some((r) => r.id === rear.id),
    false
  );
});

test('criterion 3: a stale write (false) is refused with nothing written; a throwing write is refused with its reason', async () => {
  const stale = store(undefined, { write: () => false });
  const context = rulesReader('lyon', { section: stale });
  const report = await read(context);
  const target = actionOn(report, 'confirm', heightRule(report).id).target;
  assert.deepEqual(await act(context, 'confirm', target), {
    status: 'refused',
    message: { key: 'fr-urban-rules.rules.stale' }
  });
  assert.equal(stale.held(), undefined);
  const throwing = store(undefined, {
    write: () => {
      throw new Error('over 262144 characters');
    }
  });
  const result = await act(rulesReader('lyon', { section: throwing }), 'confirm', target);
  assert.equal(result.status, 'refused');
  assert.match(result.message.params.reason, /262144/);
});

test('criterion 4: an undo — the section put back — restores to_confirm, with no state of the extension left behind', async () => {
  const section = store(undefined);
  const context = rulesReader('lyon', { section });
  const first = await read(context);
  await act(context, 'confirm', actionOn(first, 'confirm', heightRule(first).id).target);
  assert.equal(heightRule(await read(context)).status, 'confirmed');
  section.set(section.writes[0].expected ?? undefined); // the host's undo: the section as it was
  assert.equal(heightRule(await read(context)).status, 'to_confirm');
});

// ── Criteria 5, 6, 12, 13: versions ─────────────────────────────────────────────

const confirmationFor = (ruleKey, version) => ({
  schema: 1,
  confirmations: [
    {
      ruleKey,
      plot: ['69382000AB0105'],
      decision: 'confirmed',
      value: { kind: 'value', value: 22, unit: 'm' },
      edited: false,
      at: '2026-10-19T10:42:00Z',
      ...version
    }
  ]
});

test('criterion 5: a confirmation against datvalid 20260326 read against 20261002 reopens, with the old value and date, counted', async () => {
  const id = heightRule(await read(rulesReader('lyon'))).id;
  const prescriptions = structuredClone(plots.lyon.answers.get('apicarto-prescription-surf').body);
  for (const f of prescriptions.features) f.properties.datvalid = '20261002';
  const context = rulesReader('lyon', {
    section: store(
      confirmationFor(id, { idurba: '200046977_PLUI_20260326', datvalid: '20260326' })
    ),
    overrides: { 'apicarto-prescription-surf': answering(200, prescriptions) }
  });
  const report = await read(context);
  const rule = heightRule(report);
  assert.equal(rule.status, 'to_confirm');
  const reopened = rule.conditions.find((c) => c.key === 'fr-urban-rules.rule.reopened');
  assert.deepEqual(reopened.params, {
    decision: 'confirmed',
    value: '22 m',
    date: '2026-10-19',
    version: '20260326'
  });
  const notice = report.overview.find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.rulesReopened'
  );
  assert.deepEqual(notice.text.params, { count: 1 });
  assert.equal(notice.actions[0].opensView, 'rules');
});

test('criterion 12: idurba PLUi against a confirmation stored PLUI stays confirmed (case-insensitive)', async () => {
  const id = heightRule(await read(rulesReader('lyon'))).id;
  const report = await read(
    rulesReader('lyon', {
      section: store(
        confirmationFor(id, { idurba: '200046977_PLUi_20260326', datvalid: '20260326' })
      )
    })
  );
  assert.equal(heightRule(report).status, 'confirmed');
});

test('criterion 6: Gordes — a rule entered under the 2024 idurba with the zone’s 2022 datvalid stays confirmed, and reopens if either changes', async () => {
  const entry = (version) => ({
    schema: 1,
    entered: [
      {
        key: 'entered:aaaaaaaaaaaa',
        plot: ['84050000AC0323'],
        kind: 'height_total',
        statement: 'limit',
        limit: { kind: 'value', value: 7, unit: 'm' },
        source: { document: 'Règlement PLU' },
        at: '2026-10-19T10:00:00Z',
        ...version
      }
    ]
  });
  const status = async (version, overrides = {}) =>
    (await read(rulesReader('gordes', { section: store(entry(version)), overrides }))).rules.find(
      (r) => r.id === 'entered:aaaaaaaaaaaa'
    ).status;
  assert.equal(await status({ idurba: '84050_PLU_20241017', datvalid: '20220411' }), 'confirmed');
  assert.equal(await status({ idurba: '84050_PLU_20241017', datvalid: '20240101' }), 'to_confirm');
  assert.equal(await status({ idurba: '84050_PLU_20250101', datvalid: '20220411' }), 'to_confirm');
});

test('criterion 13: the key ignores the parsed kind — a relabel keeps the key and its confirmation', () => {
  const prescription = {
    type: '39',
    subtype: '02',
    libelle: 'Hauteur Max-22',
    txt: '22',
    geometry: { rings: [[p(1, 1), p(5, 1), p(5, 5)]] }
  };
  const key = __testing.drawnKey(prescription);
  assert.match(key, /^psc:39:02:[0-9a-f]{14}$/);
  // 002.6 relabels the kind; the words and the place are unchanged, so is the key.
  assert.equal(__testing.drawnKey({ ...prescription, kind: 'height_facade' }), key);
  // Moved by more than a metre: another prescription.
  assert.notEqual(
    __testing.drawnKey({ ...prescription, geometry: { rings: [[p(3, 3), p(7, 3), p(7, 7)]] } }),
    key
  );
});

// ── Criteria 7, 8, 11, 14, 15, 16 ────────────────────────────────────────────────

test('criterion 7: an entered rule with page 132 links to the regulation at #page=132', async () => {
  const section = store(undefined);
  const context = rulesReader('lyon', { section });
  const report = await read(context);
  await act(context, 'add-distance', addTarget(report, 'add-distance'), {
    kind: 'rear_setback',
    statement: 'limit',
    value: 4,
    source: 'Règlement PLUi',
    page: 132
  });
  const rule = (await read(context)).rules.find((r) => r.provenance === 'entered');
  assert.equal(rule.citation.href, `${report.document.href}#page=132`);
  assert.equal(rule.citation.page, 132);
});

test('criterion 8: a section with schema 2 is shown read-only and never rewritten', async () => {
  const section = store({ schema: 2, confirmations: 'their own' });
  const context = rulesReader('lyon', { section });
  const report = await read(context);
  assert.equal(ruleActions(report).length, 0);
  assert.ok(
    view(report, 'rules').blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.newerSection'
    )
  );
  const result = await act(context, 'confirm', {
    ruleId: heightRule(report).id,
    subjectId: 'i=X|d=Y|v=22|u=m'
  });
  assert.equal(result.status, 'refused');
  assert.equal(section.writes.length, 0);
});

test('criterion 11: "Add a ratio", footprint, not regulated — an entered rule with no limit; the report says not_regulated', async () => {
  const section = store(undefined);
  const context = rulesReader('lyon', { section });
  const report = await read(context);
  await act(context, 'add-ratio', addTarget(report, 'add-ratio'), {
    kind: 'footprint_ratio',
    statement: 'not_regulated',
    source: 'Règlement PLUi'
  });
  const entry = section.held().entered[0];
  assert.equal(entry.statement, 'not_regulated');
  assert.equal(entry.limit, undefined);
  const rule = (await read(context)).rules.find((r) => r.provenance === 'entered');
  assert.equal(rule.kind, 'footprint_ratio');
  assert.equal(rule.statement, 'not_regulated');
  assert.equal(rule.limit, undefined);
  // A limit without a value is refused with a phrase, nothing written.
  const refused = await act(context, 'add-ratio', addTarget(report, 'add-ratio'), {
    kind: 'footprint_ratio',
    statement: 'limit',
    source: 'x'
  });
  assert.deepEqual(refused, {
    status: 'refused',
    message: { key: 'fr-urban-rules.entered.valueRequired' }
  });
  assert.equal(section.writes.length, 1);
});

test('criterion 14: a site read after a write, on the same plot, makes no request; a refresh fetches', async () => {
  const section = store(undefined);
  const context = rulesReader('lyon', { section });
  const report = await read(context);
  const count = context.fetched.requests.length;
  await act(context, 'confirm', actionOn(report, 'confirm', heightRule(report).id).target);
  await read(context, 'site');
  assert.equal(context.fetched.requests.length, count);
  await read(context, 'refresh');
  assert.ok(context.fetched.requests.length > count);
});

test('criterion 15: entries of another plot are not applied, and are listed "from another plot" with Forget', async () => {
  const id = heightRule(await read(rulesReader('lyon'))).id;
  const section = store({
    schema: 1,
    confirmations: [
      {
        ruleKey: id,
        plot: ['99999000ZZ0001'],
        idurba: '200046977_PLUI_20260326',
        datvalid: '20260326',
        decision: 'confirmed',
        edited: false,
        at: '2026-10-01T00:00:00Z'
      }
    ],
    entered: [
      {
        key: 'entered:bbbbbbbbbbbb',
        plot: ['99999000ZZ0001'],
        kind: 'height_total',
        statement: 'limit',
        limit: { kind: 'value', value: 9, unit: 'm' },
        source: { document: 'x' },
        idurba: 'A',
        datvalid: 'B',
        at: '2026-10-01T00:00:00Z'
      }
    ]
  });
  const context = rulesReader('lyon', { section });
  const report = await read(context);
  assert.equal(heightRule(report).status, 'to_confirm');
  assert.equal(
    report.rules.some((r) => r.id === 'entered:bbbbbbbbbbbb'),
    false
  );
  const blocks = view(report, 'rules').blocks;
  const at = blocks.findIndex(
    (b) => b.kind === 'heading' && b.text.key === 'fr-urban-rules.heading.otherPlotRules'
  );
  assert.ok(at > 0);
  assert.equal(blocks[at + 1].rows.length, 2);
  const forget = blocks[at + 2].actions;
  assert.equal(forget.length, 2);
  assert.deepEqual(await act(context, 'forget-entry', forget[0].target), { status: 'done' });
  assert.equal(section.held().confirmations.length + section.held().entered.length, 1);
});

test('DEC-4: a confirmation whose rule left the plan is listed "no longer in the plan", never dropped', async () => {
  const section = store(
    confirmationFor('psc:39:02:00000000000000', {
      idurba: '200046977_PLUI_20260326',
      datvalid: '20260326'
    })
  );
  const report = await read(rulesReader('lyon', { section }));
  assert.ok(
    view(report, 'rules').blocks.some(
      (b) => b.kind === 'heading' && b.text.key === 'fr-urban-rules.heading.noLongerInPlan'
    )
  );
  assert.equal(section.writes.length, 0);
});

test('criterion 16: the entry forms declare their unit; the extension takes the host’s metres as they come', async () => {
  const report = await read(rulesReader('lyon'));
  const forms = Object.fromEntries(
    ruleActions(report)
      .filter((a) => a.id.startsWith('add-'))
      .map((a) => [a.id, a])
  );
  assert.equal(forms['add-distance'].fields.find((f) => f.key === 'value').unit, 'm');
  assert.equal(forms['add-ratio'].fields.find((f) => f.key === 'value').unit, 'percent');
  assert.equal(forms['add-area'].fields.find((f) => f.key === 'value').unit, 'm2');
  for (const form of Object.values(forms)) {
    assert.ok(form.fields.length <= 6);
    assert.deepEqual(
      form.fields.map((f) => f.key),
      ['kind', 'statement', 'value', 'source', 'page', 'note']
    );
  }
  // A project in feet: the host converts 13.12 ft to 4 m before calling; stored as given.
  const section = store(undefined);
  const context = rulesReader('lyon', { section });
  await act(context, 'add-distance', forms['add-distance'].target, {
    kind: 'street_setback',
    statement: 'limit',
    value: 4,
    source: 'x'
  });
  assert.deepEqual(section.held().entered[0].limit, { kind: 'value', value: 4, unit: 'm' });
});

// ── Criterion 10, DEC-7: checks and the envelope ────────────────────────────────

test('criterion 10: a prescription drawn over half the plot limits only the building it meets', async () => {
  // The prescription over the plot's west half (scaled coordinates); two buildings, west and east.
  const west = [
    [0, 0],
    [10, 0],
    [10, 30],
    [0, 30],
    [0, 0]
  ];
  const surf = {
    type: 'FeatureCollection',
    totalFeatures: 1,
    features: [
      {
        type: 'Feature',
        id: 'prescription_surf.half',
        geometry: { type: 'Polygon', coordinates: [west.map(([x, y]) => [x / 1e5, y / 1e5])] },
        properties: {
          libelle: 'Hauteur Max-9',
          txt: '9',
          typepsc: '39',
          stypepsc: '02',
          datvalid: '20260326'
        }
      }
    ]
  };
  const square = (x0) => [p(x0, 10), p(x0 + 4, 10), p(x0 + 4, 14), p(x0, 14)];
  const annex = {
    id: 'b-east',
    type: 'Building',
    property: () => ({ kind: 'string', value: 'Atelier' })
  };
  const context = rulesReader('lyon', {
    scaled: true,
    overrides: { 'apicarto-prescription-surf': answering(200, surf) },
    measured: measuresFor({
      'building-main': { outline: square(2), top: 12 },
      'b-east': { outline: square(14), top: 12 }
    }),
    buildings: [annex]
  });
  const report = await read(context);
  const rule = report.rules.find((r) => r.label.text === 'Hauteur Max-9');
  const checks = report.checks.filter((c) => c.ruleId === rule.id);
  assert.deepEqual(
    checks.map((c) => c.subject.id),
    ['building-main']
  );
  assert.equal(checks[0].result, 'potential_issue');
  assert.ok(checks[0].assumptionIds.includes('applies-where-drawn'));
});

test('DEC-7: a confirmed rear setback is checked on the rear edges from the storeys outline, and makes the envelope', async () => {
  const section = store(undefined);
  const measured = measuresFor({
    'building-main': {
      outline: [p(5, 5), p(15, 5), p(15, 25), p(5, 25)],
      top: 8,
      distances: { 3: 3.5 }
    }
  });
  const context = rulesReader('lyon', { section, measured, boundary: BOX });
  let report = await read(context);
  await act(context, 'add-distance', addTarget(report, 'add-distance'), {
    kind: 'rear_setback',
    statement: 'limit',
    value: 4,
    source: 'Règlement'
  });
  report = await read(context);
  const rule = report.rules.find((r) => r.provenance === 'entered');
  const checks = report.checks.filter((c) => c.ruleId === rule.id);
  assert.deepEqual(
    checks.map((c) => [c.subject.id, c.result, c.measured.value]),
    [['3', 'potential_issue', 3.5]]
  );
  assert.equal(measured.calls.at(-1).outline, 'storeys');
  assert.equal(measured.calls.at(-1).ratios, undefined);
  const envelope = report.features.find((f) => f.id === 'envelope');
  assert.equal(envelope.category, 'envelope');
  assert.equal(envelope.official, false);
  const ys = envelope.rings[0].map((q) => q.northing);
  // Within a millimetre: 002.7's inset grows each strip by a tenth of one (its review, 2026-10-21).
  assert.ok(Math.abs(Math.max(...ys) - 26) < 1e-3, 'the north (rear) edge cut 4 m in');
  assert.ok(report.assumptions.some((a) => a.id === 'envelope-approximate'));
});

test('002.4 Q5: a setback on several edges is one check per building — the worst edge governs, the others listed', async () => {
  const run = async (distances) => {
    const section = store(undefined);
    const measured = measuresFor({
      'building-main': { outline: [p(5, 5), p(15, 5), p(15, 25), p(5, 25)], top: 8, distances }
    });
    const context = rulesReader('lyon', { section, measured, boundary: BOX });
    let report = await read(context);
    await act(context, 'add-distance', addTarget(report, 'add-distance'), {
      kind: 'side_setback',
      statement: 'limit',
      value: 3,
      source: 'Règlement'
    });
    report = await read(context);
    const rule = report.rules.find((r) => r.provenance === 'entered');
    return report.checks.filter((c) => c.ruleId === rule.id);
  };
  // Both sides short: the larger shortfall (edge 4, 1.2 m) governs, its figure shown.
  const short = await run({ 2: 2.5, 4: 1.8 });
  assert.equal(short.length, 1);
  assert.deepEqual(
    [short[0].id.endsWith(':building-main'), short[0].subject.id, short[0].result],
    [true, '4', 'potential_issue']
  );
  assert.deepEqual(short[0].measured, { value: 1.8, unit: 'm' });
  assert.deepEqual(short[0].limit, { value: 3, unit: 'm' });
  assert.ok(short[0].figure.dimension);
  assert.deepEqual(short[0].subject.label, {
    key: 'fr-urban-rules.check.subject.mainEdges',
    params: { edge: 4, others: '2 (2.5 m)' }
  });
  // No issue anywhere: the smallest margin governs.
  const clear = await run({ 2: 3.2 });
  assert.deepEqual(
    clear.map((c) => [c.subject.id, c.result, c.measured.value, c.subject.label.params.others]),
    [['2', 'no_issue', 3.2, '4 (10 m)']]
  );
});

test('DEC-7: no height (no terrain) is not_checked with its reason; a datum-derived one runs, said', async () => {
  const outline = (await read(rulesReader('lyon'))).features.find(
    (f) => f.label.text === 'Hauteur Max-22'
  ).rings[0];
  const none = await read(
    rulesReader('lyon', {
      measured: measuresFor({ 'building-main': { outline, height: { unavailable: 'no-terrain' } } })
    })
  );
  const check = none.checks.find((c) => c.ruleId === heightRule(none).id);
  assert.equal(check.result, 'not_checked');
  assert.ok(check.assumptionIds.includes('not-checked-no-terrain'));
  const derived = await read(
    rulesReader('lyon', {
      measured: measuresFor({
        'building-main': {
          outline,
          height: {
            frame: 'datum',
            groundAtFoot: { min: 0, max: 0 },
            top: 20,
            topAboveGround: { fromLowest: 20, fromHighest: 20 },
            notModelled: [],
            datumDerived: true
          }
        }
      })
    })
  );
  const ok = derived.checks.find((c) => c.ruleId === heightRule(derived).id);
  assert.equal(ok.result, 'no_issue');
  assert.ok(ok.assumptionIds.includes('datum-derived'));
});

test('DEC-6: on a plan not on the GPU the overview says to ask the town hall, and the entry forms are there', async () => {
  const report = await read(rulesReader('rochefort'));
  assert.ok(
    report.overview.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.askTownHall'
    )
  );
  assert.ok(ruleActions(report).some((a) => a.id === 'add-distance'));
});

test('a coded rule to confirm (R.111-15) is confirmed against the Légifrance version', async () => {
  const { site, conversions, answers } = await loadPlot('brouennes');
  const section = store(undefined);
  const reader = createReader({
    fetch: recordedFetch(answers).fetch,
    site: () => recordedSiteService(site, conversions),
    packageData: () => section.service,
    translate: () => 'x'
  });
  const report = await reader.read(requestFor(site), { signal: signal() });
  const confirm = actionOn(report, 'confirm', 'rnu:R.111-15');
  assert.ok(confirm);
  await reader.runAction(
    { actionId: 'confirm', target: confirm.target, site },
    { signal: signal() }
  );
  const entry = section.held().confirmations[0];
  assert.deepEqual([entry.idurba, entry.datvalid], ['CU', '2016-01-01']);
  const after = await reader.read(requestFor(site), { signal: signal() });
  assert.equal(after.rules.find((r) => r.id === 'rnu:R.111-15').status, 'confirmed');
});

// ── Review fixes (2026-10-20) ────────────────────────────────────────────────────

const gordesEntry = (version) => ({
  schema: 1,
  entered: [
    {
      key: 'entered:aaaaaaaaaaaa',
      plot: ['84050000AC0323'],
      kind: 'height_total',
      statement: 'limit',
      limit: { kind: 'value', value: 7, unit: 'm' },
      source: { document: 'Règlement PLU' },
      at: '2026-10-19T10:00:00Z',
      ...version
    }
  ]
});

test('B1: a reopened entered rule is counted, offers Confirm, and Confirm stamps the version read now', async () => {
  const section = store(gordesEntry({ idurba: '84050_PLU_20241017', datvalid: '20200101' }));
  const context = rulesReader('gordes', { section });
  let report = await read(context);
  const rule = report.rules.find((r) => r.id === 'entered:aaaaaaaaaaaa');
  assert.equal(rule.status, 'to_confirm');
  const notice = report.overview.find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.rulesReopened'
  );
  assert.deepEqual(notice.text.params, { count: 1 });
  const confirm = actionOn(report, 'confirm-entered', rule.id);
  assert.ok(confirm);
  assert.deepEqual(await act(context, 'confirm-entered', confirm.target), { status: 'done' });
  assert.equal(section.writes.length, 1);
  const stamped = section.held().entered[0];
  assert.deepEqual([stamped.idurba, stamped.datvalid], ['84050_PLU_20241017', '20220411']);
  assert.equal(stamped.limit.value, 7, 'the rest of the entry is kept');
  report = await read(context);
  assert.equal(report.rules.find((r) => r.id === rule.id).status, 'confirmed');
  assert.equal(actionOn(report, 'confirm-entered', rule.id), undefined);
});

test('B1: Edit on a reopened entered rule stamps the version read now, so it is confirmed again', async () => {
  const section = store(gordesEntry({ idurba: '84050_PLU_20200101', datvalid: '20220411' }));
  const context = rulesReader('gordes', { section });
  let report = await read(context);
  await act(
    context,
    'edit-entered',
    actionOn(report, 'edit-entered', 'entered:aaaaaaaaaaaa').target,
    {
      statement: 'limit',
      value: 8,
      source: 'Règlement PLU'
    }
  );
  report = await read(context);
  const rule = report.rules.find((r) => r.id === 'entered:aaaaaaaaaaaa');
  assert.equal(rule.status, 'confirmed');
  assert.equal(rule.limit.quantity.value, 8);
});

/** `count` height prescriptions over the scaled plot, each with its own words. */
function manyPrescriptions(
  count,
  typepsc = '39',
  words = (i) => `Hauteur Max-${10 + (i % 20)} n°${i}`
) {
  const ring = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0]
  ].map(([x, y]) => [x / 1e5, y / 1e5]);
  return {
    type: 'FeatureCollection',
    totalFeatures: count,
    features: Array.from({ length: count }, (_, i) => ({
      type: 'Feature',
      id: `prescription_surf.${i}`,
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { libelle: words(i), txt: '', typepsc, stypepsc: '02', datvalid: '20260326' }
    }))
  };
}

test('S1: entered and valued rules keep their actions first; a cut list says so; no Does not apply on a rule with no number', async () => {
  const section = store({
    schema: 1,
    entered: [
      {
        key: 'entered:cccccccccccc',
        plot: ['69382000AB0105'],
        kind: 'rear_setback',
        statement: 'limit',
        limit: { kind: 'value', value: 4, unit: 'm' },
        source: { document: 'Règlement' },
        idurba: '200046977_PLUI_20260326',
        datvalid: '20260326',
        at: '2026-10-19T00:00:00Z'
      }
    ]
  });
  const context = rulesReader('lyon', {
    section,
    scaled: true,
    overrides: { 'apicarto-prescription-surf': answering(200, manyPrescriptions(120)) }
  });
  const report = await read(context);
  const actions = ruleActions(report).filter((a) => a.target?.ruleId !== undefined);
  assert.ok(actions.length <= 200);
  assert.equal(actions[0].target.ruleId, 'entered:cccccccccccc');
  assert.ok(
    view(report, 'rules').blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.actionsCut'
    )
  );
  // Lyon's parking prescription is not evaluable: no Does not apply on it.
  const plain = await read(rulesReader('lyon'));
  const parking = plain.rules.find((r) => r.status === 'not_evaluable' && r.provenance === 'drawn');
  assert.ok(parking);
  assert.equal(actionOn(plain, 'not-applicable', parking.id), undefined);
});

test('S2: never past 1,000 rules — the drawn ones past the room left are counted in a notice', async () => {
  const context = rulesReader('lyon', {
    scaled: true,
    overrides: { 'apicarto-prescription-surf': answering(200, manyPrescriptions(1100)) }
  });
  const report = await read(context);
  assert.ok(report.rules.length <= 1000);
  const notice = view(report, 'rules').blocks.find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.rulesCapped'
  );
  assert.ok(notice);
  assert.equal(notice.text.params.limit, 1000);
  assert.ok(notice.text.params.count >= 100);
});

test('S3: altitudes, thousands, levels, minimums, zeros, signs and unkeyed figures give no value (not evaluable, words quoted)', () => {
  const parse = __testing.parsePrescriptionValue;
  const none = [
    { typepsc: '39', libelle: 'Hauteur minimale', txt: '6 m' },
    { typepsc: '39', libelle: 'Hauteur au moins 9 m', txt: '' },
    { typepsc: '39', libelle: 'Hauteur minimum', txt: '7' },
    { typepsc: '39', libelle: 'Hauteur max 3 niveaux', txt: '' },
    { typepsc: '39', libelle: 'Nombre de niveaux', txt: '3' },
    { typepsc: '39', libelle: 'Hauteur max 4 étages', txt: '' },
    { typepsc: '39', libelle: 'Cote maximale', txt: '182 m NGF' },
    { typepsc: '39', libelle: 'Altitude maximale 245 m', txt: '' },
    { typepsc: '38', libelle: 'Surface de plancher', txt: '1 200 m²' },
    { typepsc: '39', libelle: 'Hauteur', txt: '0' },
    { typepsc: '39', libelle: 'Hauteur', txt: '0 m' },
    { typepsc: '39', libelle: 'Hauteur', txt: '.5 m' },
    { typepsc: '15', libelle: 'Recul', txt: '-3 m' },
    { typepsc: '39', libelle: 'Hauteurs 9 m et 12 m', txt: '' },
    { typepsc: '38', libelle: 'Emprise', txt: '40 % ou 60 %' },
    { typepsc: '38', libelle: 'Emprise minimale', txt: '20 %' }
  ];
  for (const pair of none) {
    const parsed = parse(pair);
    assert.equal(parsed.value, undefined, `${pair.libelle} | ${pair.txt}`);
  }
  // Still read: a « max » beside a minimum, a keyed pair, « Max-22 », a bare number (low).
  assert.equal(
    parse({ typepsc: '39', libelle: 'hauteur mini 10 m et max 18 m', txt: '' }).value,
    18
  );
  assert.equal(parse({ typepsc: '39', libelle: 'Hauteur Max-22', txt: '22' }).value, 22);
  assert.deepEqual(
    [
      parse({ typepsc: '39', libelle: 'Hauteur', txt: '12' }).value,
      parse({ typepsc: '39', libelle: 'Hauteur', txt: '12' }).confidence
    ],
    [12, 'low']
  );
  assert.equal(
    parse({ typepsc: '15', libelle: 'Recul', txt: 'au moins 5 m' }).value,
    5,
    'a setback is a minimum'
  );
  // An unkeyed pair keeps the words as a condition.
  assert.deepEqual(parse({ typepsc: '39', libelle: 'Hauteurs 9 m et 12 m', txt: '' }).conditions, [
    'Hauteurs 9 m et 12 m'
  ]);
});

test('S4: the key reads the unsimplified area centroid; same words without a place get a suffix, a duplicate is counted', async () => {
  // The centroid stored with the geometry wins over its simplified rings.
  const prescription = {
    type: '39',
    subtype: '02',
    libelle: 'Hauteur Max-22',
    txt: '22',
    geometry: { rings: [[p(0, 0), p(10, 0), p(10, 10)]], centroid: p(100, 100) }
  };
  assert.notEqual(
    __testing.drawnKey(prescription),
    __testing.drawnKey({
      ...prescription,
      geometry: { ...prescription.geometry, centroid: p(50, 50) }
    })
  );
  const points = {
    type: 'FeatureCollection',
    totalFeatures: 2,
    features: [0, 1].map((i) => ({
      type: 'Feature',
      id: `prescription_pct.${i}`,
      geometry: { type: 'Point', coordinates: [i / 1e5, i / 1e5] },
      properties: { libelle: 'Hauteur Max-9', txt: '9', typepsc: '39', stypepsc: '02' }
    }))
  };
  const twice = manyPrescriptions(2, '39', () => 'Hauteur Max-12');
  const report = await read(
    rulesReader('lyon', {
      scaled: true,
      overrides: {
        'apicarto-prescription-pct': answering(200, points),
        'apicarto-prescription-surf': answering(200, twice)
      }
    })
  );
  const nine = report.rules.filter((r) => r.label.text === 'Hauteur Max-9');
  assert.equal(nine.length, 2);
  assert.match(nine[1].id, /~2$/);
  assert.equal(report.rules.filter((r) => r.label.text === 'Hauteur Max-12').length, 1);
  const notice = view(report, 'rules').blocks.find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.drawnDuplicates'
  );
  assert.deepEqual(notice.text.params, { duplicates: 1, suffixed: 1 });
});

test('S5, rewritten by 002.7 (DEC-1): on an L-shaped boundary the envelope is L-shaped, the rear setback taken edge by edge', async () => {
  const L = [p(0, 0), p(20, 0), p(20, 10), p(10, 10), p(10, 30), p(0, 30)];
  const section = store(undefined);
  const measured = measuresFor({
    'building-main': { outline: [p(2, 2), p(6, 2), p(6, 6), p(2, 6)], top: 6 }
  });
  const context = rulesReader('lyon', { section, measured, boundary: L });
  let report = await read(context);
  await act(context, 'add-distance', addTarget(report, 'add-distance'), {
    kind: 'rear_setback',
    statement: 'limit',
    value: 4,
    source: 'Règlement'
  });
  report = await read(context);
  const roles = Object.fromEntries(report.edges.map((e) => [e.edge, e.role]));
  const envelope = report.features.find((f) => f.id === 'envelope');
  assert.ok(envelope, 'an envelope on the concave boundary');
  assert.equal(report.assumptions.some((a) => a.id === 'envelope-not-convex'), false);
  const ring = envelope.rings[0];
  // Both legs kept: the lower one still reaches x = 20, the upper one y > 10.
  assert.ok(Math.max(...ring.map((q) => q.easting)) > 19.99, 'the lower leg is kept');
  assert.ok(Math.max(...ring.map((q) => q.northing)) > 20, 'the upper leg is kept');
  // Every rear edge's 4 m is respected at every vertex; no point outside the L.
  const rear = [1, 2, 3, 4, 5, 6].filter((edge) => roles[edge] === 'rear');
  assert.ok(rear.length > 0);
  for (const edge of rear) {
    const a = L[edge - 1];
    const b = L[edge % L.length];
    for (const q of ring) assert.ok(segmentGap(q, a, b) >= 4 - 0.006, `edge ${edge}`);
  }
  assert.ok(report.assumptions.some((a) => a.id === 'envelope-approximate'));
});

function segmentGap(q, a, b) {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const t = Math.max(0, Math.min(1, ((q.easting - a.easting) * dx + (q.northing - a.northing) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a.easting + t * dx - q.easting, a.northing + t * dy - q.northing);
}

test('S6: a decision no longer in the plan shows the value it stored, with its unit', async () => {
  const section = store(
    confirmationFor('psc:39:02:00000000000000', {
      idurba: '200046977_PLUI_20260326',
      datvalid: '20260326'
    })
  );
  const blocks = view(await read(rulesReader('lyon', { section })), 'rules').blocks;
  const at = blocks.findIndex(
    (b) => b.kind === 'heading' && b.text.key === 'fr-urban-rules.heading.noLongerInPlan'
  );
  assert.deepEqual(
    blocks[at + 1].columns.map((c) => c.key),
    [
      'fr-urban-rules.column.rule',
      'fr-urban-rules.column.decision',
      'fr-urban-rules.column.value',
      'fr-urban-rules.column.date'
    ]
  );
  assert.deepEqual(blocks[at + 1].rows[0][2], { value: 22, unit: 'm' });
});

test('S7 and NITs: percent fields stop at 100; page must be whole; edited only when the value differs; Edit shows four fields', async () => {
  const section = store(undefined);
  const context = rulesReader('lyon', { section });
  let report = await read(context);
  const ratio = ruleActions(report).find((a) => a.id === 'add-ratio');
  assert.equal(ratio.fields.find((f) => f.key === 'value').max, 100);
  assert.deepEqual(
    await act(context, 'add-ratio', ratio.target, {
      kind: 'footprint_ratio',
      statement: 'limit',
      value: 120,
      source: 'x'
    }),
    { status: 'refused', message: { key: 'fr-urban-rules.entered.percentMax' } }
  );
  assert.deepEqual(
    await act(context, 'add-distance', addTarget(report, 'add-distance'), {
      kind: 'rear_setback',
      statement: 'limit',
      value: 4,
      source: 'x',
      page: 12.5
    }),
    { status: 'refused', message: { key: 'fr-urban-rules.entered.pageInteger' } }
  );
  assert.equal(section.writes.length, 0);
  const id = heightRule(report).id;
  await act(context, 'edit-value', actionOn(report, 'edit-value', id).target, { value: 22 });
  assert.equal(section.held().confirmations[0].edited, false);
  await act(context, 'add-distance', addTarget(report, 'add-distance'), {
    kind: 'rear_setback',
    statement: 'limit',
    value: 4,
    source: 'x'
  });
  report = await read(context);
  const entered = report.rules.find((r) => r.provenance === 'entered');
  assert.deepEqual(
    actionOn(report, 'edit-entered', entered.id).fields.map((f) => f.key),
    ['statement', 'value', 'source', 'page']
  );
});

test('NIT: a subject escapes its fields — a `|` in a version cannot split it', async () => {
  const section = store(undefined);
  const context = rulesReader('lyon', { section });
  const report = await read(context);
  const target = actionOn(report, 'confirm', heightRule(report).id).target;
  const forged = {
    ...target,
    subjectId: target.subjectId.replace('i=200046977', 'i=200046977%7Cd%3DX')
  };
  await act(context, 'confirm', forged);
  assert.equal(section.held().confirmations[0].idurba, '200046977|D=X_PLUI_20260326');
  assert.equal(section.held().confirmations[0].datvalid, '20260326');
});
