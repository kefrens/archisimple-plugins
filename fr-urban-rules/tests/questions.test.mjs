/**
 * The assistant's questions (Sprint 002.8, DEC-1 to DEC-6, criteria 3–9, 12,
 * 13) and the one headroom computation they share with the programme warning
 * (DEC-2): on the five reference plots' acceptance captures (002.4 DEC-2),
 * replayed — the read first, then each question on a deep-frozen copy of the
 * report, as the host hands it (096.12 DEC-4) — and on Lyon's planning
 * recordings with a written façade limit from a fake companion service
 * (criteria 5 and 6). No network.
 *
 * `road_distance` measures the street edges itself, a call no capture
 * recorded: on the replays it answers « not measured », and the test says so
 * rather than recording a measure here.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, createReader } from '../src/index.js';
import {
  FIXTURES,
  PLOTS,
  loadAcceptance,
  loadPlot,
  recordedFetch,
  recordedSiteService,
  replayFetch,
  replayService,
  requestFor
} from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in the questions tests');
};

const i18n = new URL('../resources/i18n/fr-urban-rules/', import.meta.url);
const en = JSON.parse(await readFile(new URL('en.json', i18n), 'utf8'));
const fr = JSON.parse(await readFile(new URL('fr.json', i18n), 'utf8'));
const translate = (key, params = {}) =>
  Object.hasOwn(en, key)
    ? en[key].replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all))
    : key;
/** A fixed clock (criterion 6): the offer's section carries the answer's time. */
const now = () => new Date(Date.UTC(2026, 9, 21, 9, 0));

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/** A plot's acceptance read, through replays only, with its reader kept open for the questions. */
async function acceptanceRead(plot, { section } = {}) {
  const captured = await loadAcceptance(plot);
  const site = replayService(captured.siteCalls, { name: 'site' });
  const held = section === undefined ? captured.section : section;
  const reader = createReader({
    fetch: replayFetch(captured.answers),
    now,
    site: () => site,
    roads: () => replayService(captured.context.roads, { name: 'roads' }),
    mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
    document: () => replayService(captured.context.document, { name: 'document' }),
    packageData: () => ({ read: () => held ?? undefined, write: () => true }),
    translate
  });
  const report = await reader.read(
    { site: captured.site, country: 'FR', reason: 'site' },
    { signal: new AbortController().signal, progress: () => {} }
  );
  return { captured, site, reader, report, section: held ?? undefined };
}

/** A question's input as the host builds it: frozen copies (096.11 D-7, 096.12 DEC-4). */
const inputOf = (context, args = {}) =>
  deepFreeze(
    structuredClone({
      args,
      report: context.report,
      site: context.captured?.site ?? context.site,
      variationId: 'open',
      sectionData: context.section
    })
  );

const question = (reader, id) => reader.questions.find((q) => q.id === id);
const ask = (context, id, args) => question(context.reader, id).answer(inputOf(context, args));
const claimKeys = (answer) => answer.claims.map((c) => c.text.key ?? 'text');

let readings;
before(async () => {
  readings = {};
  for (const plot of PLOTS) readings[plot] = await acceptanceRead(plot);
});

// ── Criterion 3: the budget, no promise, frozen input ──────────────────────────

test('criterion 3: on every plot each question answers synchronously within 250 ms, on deep-frozen input; the slowest plot’s median of 20 under 100 ms', () => {
  let slowest = { plot: undefined, total: -1 };
  for (const plot of PLOTS) {
    const context = readings[plot];
    let total = 0;
    for (const q of context.reader.questions) {
      const input = inputOf(context);
      const started = performance.now();
      const answer = q.answer(input);
      const spent = performance.now() - started;
      total += spent;
      assert.ok(spent < 250, `${plot} ${q.id}: ${spent} ms`);
      assert.equal(typeof answer?.then, 'undefined', `${plot} ${q.id} returned a promise`);
      assert.ok(['answered', 'cannot-answer'].includes(answer.status), `${plot} ${q.id}`);
      assert.ok(Object.isFrozen(input.report.rules), 'the input stayed frozen');
    }
    if (total > slowest.total) slowest = { plot, total };
  }
  const context = readings[slowest.plot];
  for (const q of context.reader.questions) {
    const runs = [];
    for (let run = 0; run < 20; run += 1) {
      const input = inputOf(context);
      const started = performance.now();
      q.answer(input);
      runs.push(performance.now() - started);
    }
    runs.sort((a, b) => a - b);
    assert.ok(runs[10] < 100, `${slowest.plot} ${q.id}: median ${runs[10]} ms`);
  }
});

// ── Criterion 4: every limit cited by its rule, no passage ─────────────────────

test('criterion 4: every claim with a limit names a rule of the report with basis `rule`; no claim carries a passage, condition or exception', () => {
  for (const plot of PLOTS) {
    const context = readings[plot];
    const rules = new Map(context.report.rules.map((r) => [r.id, r]));
    const forbidden = new Set();
    for (const rule of context.report.rules) {
      for (const phrase of [
        rule.citation?.passage,
        ...(rule.conditions ?? []),
        ...(rule.exceptions ?? [])
      ]) {
        if (phrase !== undefined) forbidden.add(JSON.stringify(phrase));
      }
    }
    for (const q of context.reader.questions) {
      const answer = q.answer(inputOf(context));
      assert.ok(answer.claims.length <= 12, `${plot} ${q.id}: at most twelve claims`);
      for (const claim of answer.claims) {
        assert.ok(['measured', 'rule', 'report'].includes(claim.basis));
        if (claim.values?.limit !== undefined) {
          assert.equal(claim.basis, 'rule', `${plot} ${q.id}: a limit is a rule's`);
        }
        if (claim.basis === 'rule') {
          assert.ok(rules.has(claim.ruleId), `${plot} ${q.id}: ${claim.ruleId} is in the report`);
        }
        assert.equal(forbidden.has(JSON.stringify(claim.text)), false, `${plot} ${q.id}`);
        if ('text' in claim.text) {
          // A `{ text }` claim is only a definition label of the report, never a passage.
          assert.ok(claim.text.text.length <= 200);
        }
        assert.equal(claim.citation, undefined, 'no citation is written into a claim');
      }
      assert.ok((answer.interpretation ?? []).length <= 3);
    }
  }
});

// ── Lyon, as captured (002.9 P1 row « can I add a storey? ») ────────────────────

test('criterion 5 (as captured): Lyon — the design’s 12.09 m within the drawn 22 m, the rear setback issue stays, the project’s 3 m storey said; no offer for a confirmed rule', () => {
  const context = readings.lyon;
  const answer = ask(context, 'can_add_storey', { storeyHeight: 3 });
  assert.equal(answer.status, 'answered');
  assert.equal(answer.summary.key, 'fr-urban-rules.question.can_add_storey.room');
  const current = answer.claims.find((c) => c.text.key === 'fr-urban-rules.question.height.current');
  assert.ok(Math.abs(current.values.current.value - 12.087) < 0.01);
  const drawn = context.report.rules.find((r) => r.label?.text === 'Hauteur Max-22');
  assert.equal(drawn.status, 'confirmed');
  const limit = answer.claims.find((c) => c.ruleId === drawn.id);
  assert.equal(limit.text.key, 'fr-urban-rules.question.limit.fits');
  assert.equal(limit.values.limit.value, 22);
  assert.ok(Math.abs(limit.values.headroom.value - 9.913) < 0.01);
  const rear = context.report.rules.find((r) => r.id === context.captured.section.entered[0].key);
  const stays = answer.claims.find((c) => c.ruleId === rear.id);
  assert.equal(stays.text.key, 'fr-urban-rules.question.issueStays');
  assert.deepEqual(stays.values.limit, { value: 4, unit: 'm' });
  assert.equal(answer.offer, undefined, 'the governing rule is confirmed');
  // The storey height named by the user is not said again; unnamed, the design's own 3 m is.
  assert.ok(!claimKeys(answer).some((k) => k.startsWith('fr-urban-rules.question.storeyHeight')));
  const unnamed = ask(context, 'can_add_storey');
  const said = unnamed.claims.find((c) =>
    c.text.key?.startsWith('fr-urban-rules.question.storeyHeight')
  );
  assert.equal(said.text.key, 'fr-urban-rules.question.storeyHeightProject');
  assert.deepEqual(said.values.height, { value: 3, unit: 'm' });
  assert.deepEqual(
    answer.interpretation.map((p) => p.key),
    ['fr-urban-rules.question.interp.notADecision'],
    'no façade rule in play: no attic note'
  );
});

test('criterion 5 (as captured): Lyon without the walk’s confirmation — the drawn 22 m to confirm governs and is offered as « Confirm 22 m »', async () => {
  const captured = await loadAcceptance('lyon');
  const section = {
    ...captured.section,
    confirmations: captured.section.confirmations.filter((c) => !c.ruleKey.startsWith('psc:'))
  };
  const context = await acceptanceRead('lyon', { section });
  try {
    const answer = ask(context, 'can_add_storey', { storeyHeight: 3 });
    const drawn = context.report.rules.find((r) => r.label?.text === 'Hauteur Max-22');
    assert.equal(drawn.status, 'to_confirm');
    assert.equal(answer.summary.key, 'fr-urban-rules.question.can_add_storey.room');
    assert.deepEqual(answer.offer.label, {
      key: 'fr-urban-rules.question.offer.confirm',
      params: { value: 22, unit: 'm' }
    });
    assert.equal(translate(answer.offer.label.key, answer.offer.label.params), 'Confirm 22 m');
    const entry = answer.offer.data.confirmations.find((c) => c.ruleKey === drawn.id);
    assert.equal(entry.decision, 'confirmed');
    assert.deepEqual(entry.value, { kind: 'value', value: 22, unit: 'm' });
    assert.equal(entry.at, now().toISOString());
    // max_height offers the same; its summary carries no rule, so it never states
    // the limit to confirm as the tightest one (review 2026-10-21).
    const max = ask(context, 'max_height');
    assert.deepEqual(max.offer, answer.offer);
    assert.equal(max.summary.key, 'fr-urban-rules.question.max_height.toConfirmOnly');
    assert.deepEqual(max.values, { height: { value: 22, unit: 'm' } });
  } finally {
    context.reader.dispose();
  }
});

// ── Lyon with a written façade limit (criteria 5 and 6) ────────────────────────

const BASE = 'https://editor.example/plugins-api/com.archisimple.fr-urban-rules/';
const CURRENT = { providerId: 'lmstudio', schemaVersion: 1, promptVersion: 1 };
const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  text: async () => JSON.stringify(body)
});
const p = (easting, northing) => ({ easting, northing });

let lyon;
let recorded;
before(async () => {
  lyon = await loadPlot('lyon');
  recorded = JSON.parse(await readFile(new URL('lyon/extraction/result.json', FIXTURES), 'utf8'));
});

/** A written rule in 002.5b's shape: the street façade at most 11 m, to confirm. */
const facadeLimit = {
  kind: 'height_facade',
  sector: null,
  statement: 'limit',
  limit: { kind: 'value', comparison: 'max', value: 11, unit: 'm' },
  page: 130,
  article: '2.5.1.1',
  passage: 'La hauteur de façade ne peut excéder 11 mètres.',
  offset: { start: 1, end: 10 },
  occurrence: { of: 1, chosenBy: 'only' },
  conditions: [],
  exceptions: [],
  sectorUnplaced: false,
  confidence: 'high'
};

/**
 * Measures: a 12 m top, 9 m eaves, every distance 2.6 m (the rear setback's);
 * the storeys' outline is set to the drawn prescription's ring once a read has
 * shown it, so « Hauteur Max-22 » applies to the building.
 */
let outline = [];
const measures = {
  projection: () => ({
    available: true,
    buildingId: 'building-main',
    storeys: { polygons: outline },
    height: {
      frame: 'datum',
      groundAtFoot: { min: 0, max: 0 },
      top: 12,
      eaves: 9,
      topAboveGround: { fromLowest: 12, fromHighest: 12 },
      eavesAboveGround: { fromLowest: 9, fromHighest: 9 },
      notModelled: []
    }
  }),
  distances: (input) => ({
    available: true,
    buildingId: 'building-main',
    targets: input.targets.map((t) => ({
      target: t,
      nearest: { building: p(5, 5), target: p(5, 2.4), distance: 2.6 }
    }))
  })
};

function store(initial) {
  let held = initial;
  const writes = [];
  return {
    writes,
    held: () => held,
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next, label, expected) => {
        writes.push({ next: structuredClone(next), label, expected });
        held = structuredClone(next);
        return true;
      }
    }
  };
}

function writtenReader(section) {
  const result = structuredClone(recorded);
  result.rules.push(facadeLimit);
  // A boundary of four edges (the façade-relative tests' box), the south one on the road.
  const site = { ...lyon.site, boundary: { ring: [p(0, 0), p(20, 0), p(20, 30), p(0, 30)] } };
  const siteService = recordedSiteService(site, lyon.conversions, { measures });
  const planning = recordedFetch(lyon.answers);
  const handle = async (url) => {
    const path = new URL(url).pathname.replace('/plugins-api/com.archisimple.fr-urban-rules/', '');
    if (path === 'v1/chapter') {
      return json(200, { pages: [121, 144], found: 'outline', match: 'prefix', title: 'Zone UCe1', documentPages: 803 });
    }
    if (path === 'v1/extractions') return json(200, { result, current: CURRENT });
    return json(404, { error: 'not_found' });
  };
  const reader = createReader({
    fetch: (url, init = {}) =>
      String(url).startsWith(BASE) ? handle(String(url), init) : planning.fetch(url, init),
    site: () => siteService,
    roads: () => ({
      queryRoads: async () => [
        { id: 'r', line: [p(-20, -6), p(40, -6)], kind: 'road', level: 'ground', widthMetres: 6, name: 'Rue', attribution: '© IGN' }
      ]
    }),
    pluginService: () => ({ locate: async () => ({ baseUrl: BASE }) }),
    wait: () => new Promise(() => {}),
    schedule: () => () => {},
    defer: () => {},
    now,
    packageData: () => section.service,
    document: () => ({ find: () => [] }),
    translate
  });
  return { reader, site };
}

const readWritten = (context) =>
  context.reader.read(requestFor(context.site, 'site'), { signal: new AbortController().signal });

test('criterion 5: Lyon, a written façade limit of 11 m to confirm — the drawn 22 m confirmed leaves room, the façade would pass the limit to confirm by 1 m, the rear setback stays, « Confirm 11 m » and the attic note', async () => {
  const section = store(undefined);
  const context = writtenReader(section);
  let report = await readWritten(context);
  // The drawn « Hauteur Max-22 » confirmed first, through the Rules view's own action.
  const drawn = report.rules.find((r) => r.label?.text === 'Hauteur Max-22');
  const ring = report.features.find(
    (f) => f.category === 'prescription' && JSON.stringify(f.label).includes('Hauteur Max-22')
  ).rings[0];
  outline = [{ outer: ring, holes: [] }];
  const confirm = report.views
    .find((v) => v.id === 'rules')
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions)
    .find((a) => a.id === 'confirm' && a.target.ruleId === drawn.id);
  assert.deepEqual(
    await context.reader.runAction(
      { actionId: 'confirm', target: confirm.target, site: context.site },
      { signal: new AbortController().signal }
    ),
    { status: 'done' }
  );
  report = await readWritten(context);
  const facade = report.rules.find((r) => r.kind === 'height_facade' && r.provenance === 'written');
  assert.equal(facade.status, 'to_confirm');
  assert.equal(report.rules.find((r) => r.id === drawn.id).status, 'confirmed');
  const sectionSeen = structuredClone(section.held());
  const answer = question(context.reader, 'can_add_storey').answer(
    deepFreeze(
      structuredClone({
        args: { storeyHeight: 3 },
        report,
        site: context.site,
        variationId: 'open',
        sectionData: section.held()
      })
    )
  );
  assert.equal(answer.summary.key, 'fr-urban-rules.question.can_add_storey.roomButToConfirm');
  const total = answer.claims.find((c) => c.ruleId === drawn.id);
  assert.equal(total.text.key, 'fr-urban-rules.question.limit.fits');
  const over = answer.claims.find((c) => c.ruleId === facade.id);
  assert.equal(over.text.key, 'fr-urban-rules.question.limit.exceeds');
  assert.deepEqual(over.values.headroom, { value: 2, unit: 'm' }, '11 m − 9 m eaves');
  assert.deepEqual(over.values.excess, { value: 1, unit: 'm' });
  const rear = report.checks.find((c) => c.result === 'potential_issue');
  assert.ok(rear !== undefined, 'a setback issue in the report');
  assert.ok(answer.claims.some((c) => c.text.key === 'fr-urban-rules.question.issueStays'));
  assert.deepEqual(answer.offer.label, {
    key: 'fr-urban-rules.question.offer.confirm',
    params: { value: 11, unit: 'm' }
  });
  // max_height: the confirmed 22 m is the summary's limit, the façade's to confirm the lower one.
  const max = question(context.reader, 'max_height').answer(
    deepFreeze(
      structuredClone({ args: {}, report, site: context.site, variationId: 'open', sectionData: section.held() })
    )
  );
  assert.equal(max.summary.key, 'fr-urban-rules.question.max_height.absoluteButToConfirm');
  assert.deepEqual(max.values, { height: { value: 22, unit: 'm' }, lower: { value: 11, unit: 'm' } });
  assert.deepEqual(max.offer, answer.offer);
  assert.deepEqual(
    answer.interpretation.map((i) => i.key),
    ['fr-urban-rules.question.interp.attic', 'fr-urban-rules.question.interp.notADecision']
  );

  // Criterion 6: the offer's section is what the Confirm action writes, on the same clock.
  const target = report.views
    .find((v) => v.id === 'rules')
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions)
    .find((a) => a.id === 'confirm' && a.target.ruleId === facade.id).target;
  const before = section.writes.length;
  assert.deepEqual(
    await context.reader.runAction(
      { actionId: 'confirm', target, site: context.site },
      { signal: new AbortController().signal }
    ),
    { status: 'done' }
  );
  assert.equal(section.writes.length, before + 1);
  assert.deepEqual(answer.offer.data, section.writes.at(-1).next);
  // The guard: Confirm writes over the section it read, the very one the answer
  // saw (the host guards the offer with the input's `sectionData`).
  assert.deepEqual(section.writes.at(-1).expected, sectionSeen);
  context.reader.dispose();
});

// ── Criterion 7: one headroom, three readers; the assumed height ───────────────

test('criterion 7: the programme warning, can_add_storey and max_height read one storey limit from heightHeadroom on every plot', () => {
  for (const plot of PLOTS) {
    const context = readings[plot];
    const reader = context.reader;
    const entry = reader.lastReadFor(context.report, context.captured.site);
    assert.ok(entry !== undefined, `${plot}: the read is the report`);
    const programme = reader.programme(context.captured.site);
    const floor = programme.floorToFloor.value;
    const main = reader.measuredBuildings(entry.open).find((b) => b.main);
    const headroom = reader.heightHeadroom(context.report, main, floor);
    const limit = reader.storeyLimit(headroom, floor, main?.storeys);
    assert.equal(programme.storeysAllowed, limit, `${plot}: the enricher`);
    if (main === undefined || headroom.current.top === undefined) continue;
    // can_add_storey: a storey fits under the confirmed rules exactly when the limit passes today's storeys.
    const storey = ask(context, 'can_add_storey', { storeyHeight: floor });
    const exceeds = storey.summary.key === 'fr-urban-rules.question.can_add_storey.exceeds';
    if (headroom.confirmed !== undefined && Number.isInteger(main.storeys)) {
      assert.equal(exceeds, limit <= main.storeys, `${plot}: can_add_storey`);
    }
    // max_height: the tightest height it states is today's top plus the same headroom.
    const max = ask(context, 'max_height');
    // The summary's limit is the tightest confirmed one, or the tightest to confirm when none is.
    const tightest = headroom.confirmed ?? headroom.limits[0];
    if (tightest !== undefined) {
      const stated = max.values.height.value;
      const expected = tightest.kind === 'absolute' ? tightest.limit : headroom.current.top + tightest.headroom;
      assert.ok(Math.abs(stated - expected) < 0.002, `${plot}: max_height ${stated} / ${expected}`);
    }
  }
});

test('criterion 7 / RD-2: with no storey height named and none readable, the answer assumes 3 m and says so', async () => {
  const captured = await loadAcceptance('brouennes');
  const levels = captured.context.document.filter((pair) => !pair.path.startsWith('find(["Level"])'));
  const documentService = replayService(
    levels.map((pair) =>
      pair.path === 'find' && JSON.stringify(pair.args) === '["Level"]' ? { ...pair, result: [] } : pair
    ),
    { name: 'document' }
  );
  const site = replayService(captured.siteCalls, { name: 'site' });
  const reader = createReader({
    fetch: replayFetch(captured.answers),
    now,
    site: () => site,
    roads: () => replayService(captured.context.roads, { name: 'roads' }),
    mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
    document: () => documentService,
    packageData: () => ({ read: () => captured.section ?? undefined }),
    translate
  });
  const report = await reader.read(
    { site: captured.site, country: 'FR', reason: 'site' },
    { signal: new AbortController().signal, progress: () => {} }
  );
  const answer = question(reader, 'can_add_storey').answer(
    inputOf({ captured, report, section: captured.section ?? undefined })
  );
  const said = answer.claims.find((c) => c.text.key === 'fr-urban-rules.question.storeyHeightAssumed');
  assert.ok(said !== undefined, 'the assumed height is a claim');
  assert.deepEqual(said.values.height, { value: 3, unit: 'm' });
  assert.equal(said.basis, 'report');
  reader.dispose();
});

// ── Criterion 8: road_distance ─────────────────────────────────────────────────

test('criterion 8: road_distance on Brouennes names the street edge’s assumption and the R.111-16 check’s result', () => {
  const context = readings.brouennes;
  const answer = ask(context, 'road_distance');
  assert.equal(answer.status, 'answered');
  const assumption = context.report.assumptions.find((a) => a.id.startsWith('street-'));
  assert.ok(
    answer.claims.some((c) => c.basis === 'report' && c.text.key === assumption.text.key),
    'the edge-role assumption, in the report’s words'
  );
  const r11116 = context.report.checks.find(
    (c) => c.ruleId === 'rnu:R.111-16' && c.result === 'no_issue'
  );
  const claim = answer.claims.find((c) => c.checkId === r11116.id);
  assert.equal(claim.text.key, 'fr-urban-rules.question.road.alignmentNoIssue');
  assert.equal(claim.basis, 'rule');
  assert.deepEqual(claim.values, { measured: r11116.measured, limit: r11116.limit });
  // The street edges' own distance is measured live; the capture holds no such call.
  assert.ok(answer.claims.some((c) => c.text.key === 'fr-urban-rules.question.road.edgeUnmeasured'));
});

test('criterion 8: with no street edge road_distance cannot answer, and says where to set one', () => {
  const context = readings.brouennes;
  const input = inputOf(context);
  const report = structuredClone(context.report);
  report.edges = report.edges.map((e) => ({ ...e, role: e.role === 'street' ? 'side' : e.role }));
  const answer = question(context.reader, 'road_distance').answer(
    deepFreeze({ ...structuredClone(input), report })
  );
  assert.equal(answer.status, 'cannot-answer');
  assert.deepEqual(answer.summary, { key: 'fr-urban-rules.question.road_distance.noStreet' });
  assert.equal(
    en['fr-urban-rules.question.road_distance.noStreet'],
    'No Site boundary edge is named as the street; set it under Site › Règles d’urbanisme (PLU) › Rules.'
  );
});

// ── Criterion 9: remaining_area; never « compliant » ────────────────────────────

test('criterion 9: remaining_area states the Surfaces view’s figures, the capacity labelled an estimate', () => {
  for (const plot of PLOTS) {
    const context = readings[plot];
    const answer = ask(context, 'remaining_area');
    if (answer.status !== 'answered') continue;
    const surfaces = context.report.views.find((v) => v.id === 'surfaces');
    const rows = surfaces.blocks.filter((b) => b.kind === 'fields').flatMap((b) => b.rows);
    const used = rows.find((r) => r.label.key === 'fr-urban-rules.surfaces.budget.used');
    const claim = answer.claims.find((c) => c.text.key === 'fr-urban-rules.question.area.empriseUsed');
    if (used !== undefined) assert.deepEqual(claim.values.used, used.value, `${plot}: emprise used`);
    const capacity = answer.claims.find((c) => c.text.key === 'fr-urban-rules.question.area.capacity');
    if (capacity !== undefined) {
      const range = rows.find((r) => r.label.key === 'fr-urban-rules.surfaces.capacity.range');
      assert.deepEqual(
        [capacity.values.low.value, capacity.values.high.value],
        [range.value.params.low, range.value.params.high],
        `${plot}: the Surfaces view's range`
      );
    }
  }
  assert.match(en['fr-urban-rules.question.area.capacity'], /an estimate, not a right to build/);
  assert.match(fr['fr-urban-rules.question.area.capacity'], /une estimation, pas un droit à construire/);
  const lyon = ask(readings.lyon, 'remaining_area');
  assert.equal(lyon.summary.key, 'fr-urban-rules.question.remaining_area.notRegulated');
});

test('criterion 9: no question phrase says « conforme » or "compliant", in either locale', () => {
  for (const [locale, strings] of Object.entries({ en, fr })) {
    const keys = Object.keys(strings).filter((k) => k.startsWith('fr-urban-rules.question.'));
    assert.ok(keys.length >= 60, `${locale}: ${keys.length}`);
    for (const key of keys) {
      assert.doesNotMatch(strings[key], /conforme|compliant|autoris[ée] à construire|constructible/i, `${locale} ${key}`);
    }
  }
});

// ── Criterion 12: the closed interpretation list ───────────────────────────────

test('criterion 12: every interpretation phrase is one of DEC-6’s three keys, in both locales, notADecision last', () => {
  const closed = [
    'fr-urban-rules.question.interp.attic',
    'fr-urban-rules.question.interp.relativeEstimate',
    'fr-urban-rules.question.interp.notADecision'
  ];
  for (const key of closed) {
    assert.ok(key in en && key in fr, key);
  }
  assert.equal(
    fr['fr-urban-rules.question.interp.attic'],
    'Un étage en attique, en retrait de la façade, échappe souvent à une limite de hauteur de façade. Le règlement ne le dit pas ici : à vérifier auprès de la mairie.'
  );
  for (const plot of PLOTS) {
    for (const q of readings[plot].reader.questions) {
      const answer = q.answer(inputOf(readings[plot]));
      const keys = (answer.interpretation ?? []).map((i) => i.key);
      for (const key of keys) assert.ok(closed.includes(key), `${plot} ${q.id}: ${key}`);
      for (const phrase of answer.interpretation ?? []) assert.equal(phrase.params, undefined);
      if (answer.status === 'answered') assert.equal(keys.at(-1), closed[2]);
    }
  }
  // Brouennes: R.111-17 governs, a relative limit — the estimate is said.
  const brouennes = ask(readings.brouennes, 'can_add_storey');
  assert.deepEqual(
    brouennes.interpretation.map((i) => i.key),
    ['fr-urban-rules.question.interp.relativeEstimate', 'fr-urban-rules.question.interp.notADecision']
  );
  assert.equal(brouennes.summary.key, 'fr-urban-rules.question.can_add_storey.exceeds');
  // Already past R.111-17 today (the 2.5 m / 4.469 m issue): said as over, never a negative room.
  const over = brouennes.claims.find((c) => c.ruleId === 'rnu:R.111-17');
  assert.equal(over.text.key, 'fr-urban-rules.question.relative.over');
  assert.ok(Math.abs(over.values.excess.value - 3.937) < 0.002);
  // R.111-16 measured to edge 5's alignment only (edge 3's lies off the terrain): said.
  assert.ok(
    brouennes.claims.some(
      (c) => c.ruleId === 'rnu:R.111-16' && c.text.key === 'fr-urban-rules.question.limit.partlyChecked'
    )
  );
  const max = ask(readings.brouennes, 'max_height');
  const relative = max.claims.find((c) => c.ruleId === 'rnu:R.111-17');
  assert.equal(relative.text.key, 'fr-urban-rules.question.max.relativeOver');
  assert.ok(relative.values.excess.value > 0);
});

// ── Criterion 13: an empty report, an unread one, an unknown building ──────────

test('criterion 13: an empty report, a report another read answered, or an unknown building is `cannot-answer`, never a throw', () => {
  const context = readings.lyon;
  for (const q of context.reader.questions) {
    const empty = q.answer(
      deepFreeze({ args: {}, report: { rules: [], checks: [] }, site: context.captured.site, variationId: 'open', sectionData: undefined })
    );
    assert.equal(empty.status, 'cannot-answer', q.id);
    assert.equal(empty.summary.key, 'fr-urban-rules.question.notRead');
    const other = structuredClone(context.report);
    other.rules = [...other.rules, { ...other.rules[0], id: 'written:not-read-here' }];
    const stale = q.answer(deepFreeze({ ...structuredClone(inputOf(context)), report: other }));
    assert.equal(stale.status, 'cannot-answer', q.id);
    assert.equal(stale.summary.key, 'fr-urban-rules.question.readAgain');
  }
  const unknown = ask(context, 'max_height', { building: 'Garage' });
  assert.equal(unknown.status, 'cannot-answer');
  assert.deepEqual(unknown.summary, {
    key: 'fr-urban-rules.question.buildingUnknown',
    params: { building: 'Garage' }
  });
  // Rochefort: no planning document published, no rule — said, never invented.
  const rochefort = readings.rochefort;
  if (rochefort.report.rules.length === 0) {
    assert.equal(ask(rochefort, 'max_height').summary.key, 'fr-urban-rules.question.notPublished');
  }
});

test('the questions and checkVariation are wired through the source; the exported variation view scopes every measure', () => {
  const asked = [];
  const view = __testing.variationView(
    {
      current: () => ({}),
      measures: {
        projection: (input) => (asked.push(input), { available: false }),
        distances: (input) => (asked.push(input), { available: false })
      }
    },
    'variation-b',
    [{ id: 'b1', name: 'Annexe' }, { id: 'b2', name: '' }]
  );
  view.measures.projection();
  view.measures.distances({ outline: 'storeys', targets: [] });
  assert.deepEqual(asked, [
    { variationId: 'variation-b' },
    { outline: 'storeys', targets: [], variationId: 'variation-b' }
  ]);
  assert.deepEqual(view.variations(), [{ id: 'variation-b', open: true }]);
});

// ── Review (2026-10-21) ────────────────────────────────────────────────────────

test('review 2026-10-21: a façade limit counts the storeys under the eaves, never the roof; the rule’s own value is read against its check’s measure', () => {
  const reader = readings.lyon.reader;
  const facade = {
    id: 'entered:facade',
    kind: 'height_facade',
    status: 'confirmed',
    limit: { kind: 'value', comparison: 'max', quantity: { value: 7, unit: 'm' } }
  };
  // A 9 m top, 6 m eaves (a 3 m roof), no storeys measured.
  const building = {
    id: 'b',
    main: true,
    projection: { height: { topAboveGround: { fromLowest: 9 }, eavesAboveGround: { fromLowest: 6 } } },
    relative: []
  };
  const headroom = reader.heightHeadroom({ rules: [facade], checks: [] }, building, 3);
  assert.equal(headroom.confirmed.headroom, 1);
  assert.equal(reader.storeyLimit(headroom, 3, undefined), 2, '7 m of façade hold two 3 m storeys, not three');
  // The check was computed under 9 m; the rule now reads 7 m (a value edited since).
  const check = {
    id: 'chk:entered:facade:b',
    ruleId: facade.id,
    subject: { kind: 'building', id: 'b' },
    measured: { value: 6, unit: 'm' },
    limit: { value: 9, unit: 'm' },
    result: 'no_issue'
  };
  assert.equal(reader.heightHeadroom({ rules: [facade], checks: [check] }, building, 3).confirmed.headroom, 1);
});

test('review 2026-10-21: an R.111-17 issue on its 3 m floor stays whatever the height; another building’s edge issue is not this one’s', () => {
  const context = readings.brouennes;
  const report = structuredClone(context.report);
  const main = context.reader.measuredBuildings(context.reader.lastReadFor(context.report, context.captured.site).open).find((b) => b.main);
  report.checks = [
    ...report.checks.filter((c) => c.ruleId !== 'rnu:R.111-17'),
    {
      id: `r111-17:${main.id}`,
      ruleId: 'rnu:R.111-17',
      subject: { kind: 'boundary-edge', id: '2', label: { key: 'fr-urban-rules.check.subject.main', params: { edge: 2 } } },
      measured: { value: 2.5, unit: 'm' },
      limit: { value: 3, unit: 'm' },
      result: 'potential_issue',
      assumptionIds: []
    }
  ];
  // A distance rule by value (R.111-15's), one edge issue for another building, one for this one.
  const setback = report.rules.find((r) => r.id === 'rnu:R.111-15');
  assert.notEqual(setback.limit?.kind, 'height_relative');
  for (const owner of ['another-building', main.id]) {
    report.checks.push({
      id: `chk:${setback.id}:${owner}`,
      ruleId: setback.id,
      subject: { kind: 'boundary-edge', id: '4', label: { key: 'fr-urban-rules.check.subject.main', params: { edge: 4 } } },
      measured: { value: 1, unit: 'm' },
      limit: { value: 4, unit: 'm' },
      result: 'potential_issue',
      assumptionIds: []
    });
  }
  const answer = question(context.reader, 'can_add_storey').answer(
    deepFreeze({ ...structuredClone(inputOf(context, { storeyHeight: 3 })), report })
  );
  const stays = answer.claims.filter((c) => c.text.key === 'fr-urban-rules.question.issueStays');
  assert.ok(stays.some((c) => c.ruleId === 'rnu:R.111-17'), 'the 3 m floor stays');
  assert.ok(!stays.some((c) => c.checkId === `chk:${setback.id}:another-building`));
  assert.ok(stays.some((c) => c.checkId === `chk:${setback.id}:${main.id}`));
});
