/**
 * Written rules (Sprint 002.6b): the extraction client against a fake service
 * that answers from 002.5b's recorded Lyon result
 * (`test-fixtures/fr-urban-rules/lyon/extraction/result.json`), a stub
 * `plugin-service`, manual timers for polling, a recording section store,
 * measures stubbed per façade. No network.
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

const BASE = 'https://editor.example/plugins-api/com.archisimple.fr-urban-rules/';
const GPU_FILE =
  'https://www.geoportail-urbanisme.gouv.fr/api/document/4f3ddc27a9611b4bc94fa161443b8e86/files/200046977_reglement_20260326.pdf';
const CURRENT = { providerId: 'lmstudio', schemaVersion: 1, promptVersion: 1 };

let lyon;
let recorded;
let en;
let fr;
before(async () => {
  lyon = await loadPlot('lyon');
  recorded = JSON.parse(await readFile(new URL('lyon/extraction/result.json', FIXTURES), 'utf8'));
  const i18n = new URL('../resources/i18n/fr-urban-rules/', import.meta.url);
  en = JSON.parse(await readFile(new URL('en.json', i18n), 'utf8'));
  fr = JSON.parse(await readFile(new URL('fr.json', i18n), 'utf8'));
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
// A few timer turns: a deferred signal (S5) and the answers' promise chains both settle.
const settle = async () => {
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  await new Promise((resolve) => setImmediate(resolve));
};

const json = (status, body, type = 'application/json') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
});

/** A result built from the recording, with rules added or replaced. */
function resultWith({ rules, add = [], ...rest } = {}) {
  const result = structuredClone(recorded);
  if (rules !== undefined) result.rules = rules;
  result.rules.push(...add);
  return { ...result, ...rest };
}

/** A service rule in 002.5b's shape. */
const serviceRule = (fields) => ({
  kind: 'boundary_setback',
  sector: null,
  statement: 'limit',
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

/**
 * The fake service: `GET chapter` answers Lyon's chapter; `cachedOnly` answers
 * `cached` (or `404 not_cached`), `POST` starts a job whose polls walk
 * `steps`; every request is recorded by kind. `hold(name)` holds one kind of
 * answer until `release(name)`.
 */
function fakeService({ cached, current = CURRENT, steps = [], post } = {}) {
  const calls = { chapter: [], cachedOnly: [], post: [], poll: [] };
  const held = new Map();
  const state = { cached, current, steps: [...steps] };
  const wait = async (name) => {
    if (held.has(name)) await held.get(name).promise;
  };
  const handle = async (url, init = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace('/plugins-api/com.archisimple.fr-urban-rules/', '');
    if (path === 'v1/chapter') {
      calls.chapter.push(url);
      await wait('chapter');
      return json(200, {
        pages: [121, 144],
        found: 'outline',
        match: 'prefix',
        title: 'Zone UCe1',
        documentPages: 803
      });
    }
    if (path === 'v1/extractions' && init.method === 'POST') {
      calls.post.push({ url, body: JSON.parse(init.body) });
      await wait('post');
      if (post !== undefined) return post(parsed);
      return json(202, { jobId: '7f9a1c2b-0000-4000-8000-000000000001', state: 'queued' });
    }
    if (path === 'v1/extractions') {
      calls.cachedOnly.push({ url, query: Object.fromEntries(parsed.searchParams) });
      await wait('cachedOnly');
      if (typeof state.cached === 'function') return state.cached(parsed);
      return state.cached === undefined
        ? json(404, { current: state.current, error: 'not_cached' })
        : json(200, { result: state.cached, current: state.current });
    }
    if (path.startsWith('v1/extractions/')) {
      calls.poll.push(url);
      const step = state.steps.shift();
      if (step === undefined) return json(404, { reason: 'no_such_job', error: 'not_found' });
      return typeof step === 'function' ? step() : json(200, step);
    }
    return json(404, { error: 'not_found' });
  };
  return {
    calls,
    state,
    handle,
    hold: (name) => {
      let release;
      const promise = new Promise((resolve) => (release = resolve));
      held.set(name, { promise, release });
    },
    release: (name) => {
      held.get(name)?.release();
      held.delete(name);
    }
  };
}

/** Manual timers: `schedule` keeps each callback; `tick()` runs those due. */
function manualTimers() {
  const pending = [];
  const schedule = (fn, ms) => {
    const entry = { fn, ms, cancelled: false };
    pending.push(entry);
    return () => (entry.cancelled = true);
  };
  schedule.pending = pending;
  schedule.tick = async () => {
    const due = pending.splice(0, pending.length).filter((e) => !e.cancelled);
    for (const entry of due) await entry.fn();
    await settle();
    return due.map((e) => e.ms);
  };
  return schedule;
}

/** A wait that never elapses on its own. */
function manualWait() {
  const pending = new Set();
  const wait = (ms, abort) =>
    new Promise((resolve) => {
      const entry = { resolve };
      pending.add(entry);
      abort.addEventListener('abort', () => (pending.delete(entry), resolve()), { once: true });
    });
  wait.elapse = () => {
    for (const entry of pending) entry.resolve();
    pending.clear();
  };
  return wait;
}

/** A recording section store (096.4's `write(next, label, expected)`). */
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

/** Measures answering per façade (`byFacade`), for the façade-relative check. */
function facadeMeasures(facades) {
  const calls = [];
  return {
    calls,
    projection: () => ({
      available: true,
      buildingId: 'building-main',
      storeys: { polygons: [] },
      height: {
        frame: 'datum',
        groundAtFoot: { min: 0, max: 0 },
        top: 9,
        topAboveGround: { fromLowest: 9, fromHighest: 9 },
        notModelled: []
      }
    }),
    distances: (input) => {
      calls.push(input);
      const targets = input.targets.map((t) => ({
        target: t,
        nearest: { building: p(5, 5), target: p(5, 0), distance: 10 }
      }));
      if (!input.byFacade) return { available: true, buildingId: 'building-main', targets };
      return {
        available: true,
        buildingId: 'building-main',
        outline: input.outline,
        step: 0.5,
        targets,
        notModelled: [],
        facades: facades.map((f, run) => ({
          facade: f.facade,
          run,
          line: [p(5, 5), p(15, 5)],
          height:
            f.height === undefined
              ? { unavailable: 'no-wall' }
              : {
                  max: f.height,
                  samples: [{ s: 0, point: p(5, 5), top: f.height, foot: 0, aboveFoot: f.height }]
                },
          targets: input.targets.map(() => ({
            nearest: {
              facade: p(5, 5),
              target: p(5, 0),
              distance: f.distance,
              aboveFootThere: f.height
            },
            samples: [{ s: 0, distance: f.distance }]
          }))
        }))
      };
    }
  };
}

function readerFor({
  service = fakeService(),
  pluginService = { locate: async () => ({ baseUrl: BASE }) },
  section,
  measures,
  boundary,
  wait = manualWait(),
  schedule = manualTimers(),
  overrides = {},
  module,
  now,
  siteExtra = {},
  snapshotMinimumStep
} = {}) {
  const site = {
    ...(boundary === undefined ? lyon.site : { ...lyon.site, boundary: { ring: boundary } }),
    ...siteExtra
  };
  const siteService = recordedSiteService(
    site,
    lyon.conversions,
    measures === undefined ? {} : { measures }
  );
  const planning = recordedFetch(lyon.answers, overrides);
  const fetch = (url, init = {}) =>
    String(url).startsWith(BASE) ? service.handle(String(url), init) : planning.fetch(url, init);
  const make = module ?? createReader;
  const reader = make({
    fetch,
    site: () => siteService,
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    pluginService: () => pluginService,
    wait,
    schedule,
    ...(now === undefined ? {} : { now }),
    ...(section === undefined ? {} : { packageData: () => section.service }),
    document: () => ({ find: () => [] }),
    translate: (key) => `label:${key}`,
    ...(snapshotMinimumStep === undefined ? {} : { snapshotMinimumStep })
  });
  return { reader, site, service, section, schedule, wait, planning };
}

const read = (context, reason = 'site') =>
  context.reader.read(requestFor(context.site, reason), { signal: signal() });
const act = (context, actionId, target, values) =>
  context.reader.runAction(
    { actionId, target, ...(values === undefined ? {} : { values }), site: context.site },
    { signal: signal() }
  );
const rulesView = (report) => report.views.find((v) => v.id === 'rules');
const actions = (report) =>
  rulesView(report)
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions);
const writtenRules = (report) => report.rules.filter((r) => r.provenance === 'written');
const noticeKeys = (report) =>
  rulesView(report)
    .blocks.filter((b) => b.kind === 'notice')
    .map((b) => b.text.key);
const source = (report) => report.sources.find((s) => s.id === 'written-rules');

// ── Criterion 1: no model call from a read ─────────────────────────────────────

test('criterion 1: a read asks cachedOnly once and never POST; the zone shows "not read yet" with Extract', async () => {
  const context = readerFor();
  const report = await read(context);
  assert.equal(context.service.calls.cachedOnly.length, 1);
  assert.equal(context.service.calls.post.length, 0);
  assert.deepEqual(context.service.calls.cachedOnly[0].query, {
    partition: 'DU_200046977',
    idurba: '200046977_PLUI_20260326',
    nomfic: '200046977_reglement_20260326.pdf',
    zone: 'UCe1b',
    cachedOnly: '1'
  });
  assert.equal(source(report).state, 'ready');
  assert.equal(source(report).detail.key, 'fr-urban-rules.written.status.notRead');
  assert.ok(noticeKeys(report).includes('fr-urban-rules.written.state.notStarted'));
  assert.ok(actions(report).some((a) => a.id === 'written-extract'));
  await read(context, 'design');
  await read(context, 'source');
  assert.equal(context.service.calls.cachedOnly.length, 1, 'once per session');
  assert.equal(context.service.calls.post.length, 0);
});

test('criterion 1: a late cachedOnly answer is kept and fires onDidChange once, after the read returned; the source read shows it with no request', async () => {
  const service = fakeService({ cached: recorded });
  service.hold('cachedOnly');
  const wait = manualWait();
  const context = readerFor({ service, wait });
  let returned = false;
  const fires = [];
  context.reader.onDidChange(() => fires.push({ returned }));
  const first = read(context);
  while (service.calls.cachedOnly.length === 0) await settle();
  wait.elapse();
  const late = await first;
  returned = true;
  assert.equal(source(late).state, 'loading', 'still checking');
  assert.ok(noticeKeys(late).includes('fr-urban-rules.written.state.checking'));
  assert.equal(writtenRules(late).length, 0);
  assert.deepEqual(fires, []);
  service.release('cachedOnly');
  await settle();
  assert.deepEqual(fires, [{ returned: true }], 'one fire');
  const after = await read(context, 'source');
  assert.ok(writtenRules(after).length > 0);
  assert.equal(service.calls.cachedOnly.length, 1);
  assert.equal(service.calls.post.length, 0);
  await settle();
  assert.equal(fires.length, 1, 'the answer a read showed fires nothing more');
});

test('S5: a change while a read is in flight fires only once that read has returned', async () => {
  const schedule = manualTimers();
  const service = fakeService({
    steps: [{ jobId: 'j', state: 'extracting', progress: { chunk: 1, of: 2 } }]
  });
  // The next Refresh hangs on the commune until the test lets it go.
  let gate;
  const municipality = lyon.answers.get('apicarto-municipality');
  const context = readerFor({
    service,
    schedule,
    overrides: {
      'apicarto-municipality': async () => {
        if (gate !== undefined) await gate.promise;
        return json(municipality.meta.status, municipality.body);
      }
    }
  });
  const report = await read(context);
  await act(
    context,
    'written-extract',
    actions(report).find((a) => a.id === 'written-extract').target
  );
  let inFlight = false;
  const fires = [];
  context.reader.onDidChange(() => fires.push({ inFlight }));
  let release;
  gate = { promise: new Promise((resolve) => (release = resolve)) };
  inFlight = true;
  const refreshing = read(context, 'refresh').then((r) => {
    inFlight = false;
    return r;
  });
  await schedule.tick(); // the job moves while the Refresh waits on the commune
  assert.deepEqual(fires, [], 'nothing during the read');
  gate = undefined;
  release();
  await refreshing;
  await settle();
  assert.deepEqual(fires, [{ inFlight: false }]);
});

// ── Criterion 2: Extract, and the job's states ─────────────────────────────────

test('criterion 2: Extract sends one POST, returns done at once, and the report walks queued → extracting → done, each after a fire', async () => {
  const schedule = manualTimers();
  const service = fakeService({
    steps: [
      { jobId: 'j', state: 'fetching', progress: { step: 'fetching' } },
      { jobId: 'j', state: 'extracting', progress: { step: 'extracting', chunk: 1, of: 9 } },
      { jobId: 'j', state: 'done', progress: { step: 'done' }, result: recorded }
    ]
  });
  const context = readerFor({ service, schedule });
  let fires = 0;
  context.reader.onDidChange(() => (fires += 1));
  let report = await read(context);
  const extract = actions(report).find((a) => a.id === 'written-extract');
  assert.deepEqual(await act(context, 'written-extract', extract.target), { status: 'done' });
  assert.equal(service.calls.post.length, 1);
  assert.deepEqual(service.calls.post[0].body, {
    partition: 'DU_200046977',
    idurba: '200046977_PLUI_20260326',
    nomfic: '200046977_reglement_20260326.pdf',
    zone: 'UCe1b'
  });
  assert.ok(!service.calls.post[0].url.includes('refresh'));
  report = await read(context, 'action');
  assert.equal(source(report).state, 'loading');
  assert.ok(noticeKeys(report).includes('fr-urban-rules.written.state.queued'));
  // A second click while it runs: no second POST (one Extract per zone).
  assert.deepEqual(await act(context, 'written-extract', extract.target), { status: 'done' });
  assert.equal(service.calls.post.length, 1);

  const before = fires;
  assert.deepEqual(await schedule.tick(), [3000], 'polled after 3 s');
  assert.equal(fires, before + 1);
  report = await read(context, 'source');
  assert.ok(noticeKeys(report).includes('fr-urban-rules.written.state.fetching'));
  await schedule.tick();
  assert.equal(fires, before + 2);
  report = await read(context, 'source');
  const progress = rulesView(report).blocks.find(
    (b) => b.text?.key === 'fr-urban-rules.written.state.extractingChunk'
  );
  assert.deepEqual(progress.text.params, { chunk: 1, of: 9 });
  await schedule.tick();
  assert.equal(fires, before + 3);
  assert.equal(schedule.pending.length, 0, 'polling stops on a terminal state');
  report = await read(context, 'source');
  assert.equal(source(report).state, 'ready');
  assert.ok(writtenRules(report).length > 0);
  assert.equal(service.calls.cachedOnly.length, 1);
});

test('criterion 2: polling slows to 10 s after a minute, stops on dispose, and a lost job reads the cache again', async () => {
  let clock = Date.UTC(2026, 9, 20, 8, 0);
  const schedule = manualTimers();
  const service = fakeService({
    steps: [
      { jobId: 'j', state: 'extracting', progress: { chunk: 1, of: 2 } },
      { jobId: 'j', state: 'extracting', progress: { chunk: 2, of: 2 } }
    ]
  });
  const siteContext = readerFor({ service, schedule });
  // A reader with a held clock, to cross the minute.
  const context = { ...siteContext };
  const reader = createReader({
    fetch: (url, init = {}) =>
      String(url).startsWith(BASE)
        ? service.handle(String(url), init)
        : siteContext.planning.fetch(url, init),
    site: () => recordedSiteService(lyon.site, lyon.conversions),
    pluginService: () => ({ locate: async () => ({ baseUrl: BASE }) }),
    wait: manualWait(),
    schedule,
    now: () => new Date(clock)
  });
  context.reader = reader;
  const report = await read(context);
  await act(
    context,
    'written-extract',
    actions(report).find((a) => a.id === 'written-extract').target
  );
  assert.deepEqual(await schedule.tick(), [3000]);
  clock += 61_000;
  assert.deepEqual(await schedule.tick(), [3000]);
  assert.deepEqual(
    schedule.pending.map((e) => e.ms),
    [10_000],
    'after a minute, every 10 s'
  );
  // The job is gone from the service: polling stops and the next read asks the cache.
  await schedule.tick();
  assert.equal(schedule.pending.length, 0);
  await read(context, 'source');
  assert.equal(service.calls.cachedOnly.length, 2);
  reader.dispose();
});

test('criterion 2: dispose cancels a running poll', async () => {
  const schedule = manualTimers();
  const context = readerFor({ schedule });
  const report = await read(context);
  await act(
    context,
    'written-extract',
    actions(report).find((a) => a.id === 'written-extract').target
  );
  assert.equal(schedule.pending.filter((e) => !e.cancelled).length, 1);
  context.reader.dispose();
  assert.equal(schedule.pending.filter((e) => !e.cancelled).length, 0);
});

// ── Criterion 3: codes ─────────────────────────────────────────────────────────

test('criterion 3: every code of 002.5a and 002.5b has its state and its phrase in both locales', async () => {
  const codes = [
    'invalid_request',
    'not_found',
    'version_changed',
    'rate_limited',
    'source_unavailable',
    'source_refused',
    'document_too_large',
    'not_a_pdf',
    'document_unreadable',
    'no_text_layer',
    'zone_chapter_not_found',
    'chapter_too_large',
    'busy',
    'extraction_unavailable',
    'extraction_failed',
    'internal_error'
  ];
  for (const code of codes) {
    const key = `fr-urban-rules.written.code.${code}`;
    assert.ok(key in en && key in fr, `${code}: phrase in both locales`);
    const service = fakeService({
      steps: [{ jobId: 'j', state: 'failed', error: { code, codes: ['UA', 'UCe1'] } }]
    });
    const schedule = manualTimers();
    const context = readerFor({ service, schedule });
    let report = await read(context);
    await act(
      context,
      'written-extract',
      actions(report).find((a) => a.id === 'written-extract').target
    );
    await schedule.tick();
    report = await read(context, 'source');
    assert.equal(source(report).state, 'unavailable', code);
    assert.equal(source(report).detail.key, key, code);
    assert.ok(noticeKeys(report).includes(key), code);
    const retry = actions(report).some((a) => a.id === 'written-try-again');
    const lasting = [
      'version_changed',
      'document_too_large',
      'not_a_pdf',
      'no_text_layer',
      'zone_chapter_not_found',
      'chapter_too_large'
    ];
    assert.equal(retry, !lasting.includes(code), `${code}: Try again`);
  }
  // `not_cached` is "not read yet", never a failure.
  assert.ok('fr-urban-rules.written.code.not_cached' in en);
  // A code the service answers to a cachedOnly read: the state and its retry time.
  const busy = fakeService({ cached: () => json(503, { retryAfterSeconds: 120, error: 'busy' }) });
  const report = await read(readerFor({ service: busy }));
  assert.equal(source(report).detail.key, 'fr-urban-rules.written.status.retryAfter');
  assert.ok(noticeKeys(report).includes('fr-urban-rules.written.code.busy'));
  // A code no one knows reads as "unavailable", never as a key of its own.
  const odd = fakeService({ cached: () => json(500, { error: 'constructor' }) });
  const oddReport = await read(readerFor({ service: odd }));
  assert.equal(source(oddReport).detail.key, 'fr-urban-rules.written.code.unavailable');
});

test('criterion 3: zone_chapter_not_found lists the codes the service saw, as text', async () => {
  const service = fakeService({
    steps: [
      {
        jobId: 'j',
        state: 'failed',
        error: { code: 'zone_chapter_not_found', codes: ['UA', 'UCe1'] }
      }
    ]
  });
  const schedule = manualTimers();
  const context = readerFor({ service, schedule });
  let report = await read(context);
  await act(
    context,
    'written-extract',
    actions(report).find((a) => a.id === 'written-extract').target
  );
  await schedule.tick();
  report = await read(context, 'source');
  const notice = rulesView(report).blocks.find(
    (b) => b.text?.key === 'fr-urban-rules.written.code.zone_chapter_not_found'
  );
  assert.deepEqual(notice.text.params, { zone: 'UCe1b' });
  const fields = rulesView(report).blocks.find(
    (b) => b.kind === 'fields' && b.rows[0].label.key === 'fr-urban-rules.written.field.codesSeen'
  );
  assert.deepEqual(fields.rows[0].value, { text: 'UA, UCe1' });
});

// ── Criterion 4: Lyon, from the recorded result ────────────────────────────────

test('criterion 4: Lyon UCe1b — the 4 m boundary setback to confirm with page, article and passage; footprint not regulated; no UCe1a rule, counted', async () => {
  const context = readerFor({ service: fakeService({ cached: recorded }) });
  const report = await read(context);
  const written = writtenRules(report);
  const setback = written.find((r) => r.kind === 'boundary_setback' && r.limit?.kind === 'value');
  assert.deepEqual(setback.limit, {
    kind: 'value',
    comparison: 'min',
    quantity: { value: 4, unit: 'm' }
  });
  assert.equal(setback.status, 'to_confirm');
  assert.equal(setback.provenance, 'written');
  assert.equal(setback.citation.page, 126);
  assert.equal(setback.citation.article, '2.2.1.2');
  assert.deepEqual(setback.citation.passage, {
    text: 'Le retrait* est au moins égal à 4 mètres.',
    lang: 'fr'
  });
  assert.equal(setback.citation.href, `${GPU_FILE}#page=126`);
  assert.ok(setback.id.startsWith('written:UCe1b:'));
  const footprint = written.find(
    (r) => r.kind === 'footprint_ratio' && r.statement === 'not_regulated'
  );
  assert.ok(footprint, 'footprint_ratio not regulated');
  assert.equal(footprint.limit, undefined);
  // No UCe1a rule: the UCe1a Hf − 4 m rule is counted, not shown. (The UCe1a « band »,
  // a road setback « at most 17 m », is left out as contradictory since the review, S5.)
  assert.ok(!written.some((r) => r.id.startsWith('written:UCe1a:')));
  const fields = rulesView(report).blocks.find(
    (b) => b.kind === 'fields' && b.rows[0].label.key === 'fr-urban-rules.written.field.read'
  );
  const others = fields.rows.find(
    (r) => r.label.key === 'fr-urban-rules.written.field.otherSectors'
  );
  assert.deepEqual(others.value, {
    key: 'fr-urban-rules.written.otherSectors',
    params: { count: 1 }
  });
  assert.deepEqual(fields.rows[0].value.params, { count: 30, from: 121, to: 144 });
  assert.equal(written.length, 30);
  // An unplaced sector (the parking sectors Aa…E) is kept, said, and low.
  const unplaced = written.find(
    (r) =>
      r.kind === 'parking' &&
      r.citation.passage.text.startsWith('dans les secteurs de stationnement')
  );
  assert.equal(unplaced.confidence, 'low');
  assert.ok(unplaced.conditions.some((c) => c.key === 'fr-urban-rules.written.sectorUnplaced'));
  // Low confidence is flagged in words, not only in the field.
  assert.ok(unplaced.conditions.some((c) => c.key === 'fr-urban-rules.written.lowConfidence'));
  assert.equal(source(report).retrievedAt, '2026-10-20T14:57:57.138Z');
});

test('criterion 4: a confirmed written setback is checked as a drawn one is — one check per building', async () => {
  const section = store(undefined);
  const measures = facadeMeasures([]);
  const context = readerFor({
    service: fakeService({ cached: recorded }),
    section,
    measures,
    boundary: BOX
  });
  const report = await read(context);
  const setback = writtenRules(report).find(
    (r) => r.kind === 'boundary_setback' && r.limit?.kind === 'value'
  );
  const checks = report.checks.filter((c) => c.ruleId === setback.id);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, `chk:${setback.id}:building-main`);
  assert.equal(checks[0].result, 'no_issue');
});

// ── Criterion 5: rule ids ──────────────────────────────────────────────────────

test('criterion 5: a rule read as another kind keeps its id; the same sector and passage twice get ~2', async () => {
  const one = serviceRule({
    kind: 'boundary_setback',
    limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' },
    passage: 'Le retrait* est au moins égal à 4 mètres.'
  });
  const idsOf = async (rules) => {
    const context = readerFor({ service: fakeService({ cached: resultWith({ rules }) }) });
    return writtenRules(await read(context)).map((r) => r.id);
  };
  const first = await idsOf([one]);
  const relabelled = await idsOf([{ ...one, kind: 'road_setback' }]);
  assert.deepEqual(first, relabelled);
  // The same passage with other spacing and quotes is the same key (096.7's normalisation).
  const spaced = await idsOf([{ ...one, passage: 'Le  retrait*\nest au moins égal à 4 mètres.' }]);
  assert.deepEqual(spaced, first);
  const twice = await idsOf([one, { ...one, kind: 'road_setback' }]);
  assert.deepEqual(twice, [first[0], `${first[0]}~2`]);
  assert.match(first[0], /^written:\*:[0-9a-f]{14}$/);
});

// ── Criterion 6: the relabel (Q46) ─────────────────────────────────────────────

const facadeSeeGraphic = serviceRule({
  kind: 'height_facade',
  statement: 'see_graphic',
  page: 130,
  article: '2.5.1',
  passage: 'La hauteur de façade est fixée par le document graphique.'
});

test('criterion 6: a written façade height « see graphic » relabels the drawn Max-22; the drawn one is confirmed, the written one informs', async () => {
  const section = store(undefined);
  const context = readerFor({
    service: fakeService({ cached: resultWith({ add: [facadeSeeGraphic] }) }),
    section
  });
  let report = await read(context);
  const drawn = report.rules.find((r) => r.label.text === 'Hauteur Max-22');
  assert.equal(drawn.kind, 'height_facade');
  assert.equal(drawn.status, 'to_confirm');
  assert.deepEqual(drawn.limit, {
    kind: 'value',
    comparison: 'max',
    quantity: { value: 22, unit: 'm' }
  });
  assert.ok(drawn.conditions.some((c) => c.key === 'fr-urban-rules.written.relabelled'));
  const written = writtenRules(report).find((r) => r.kind === 'height_facade');
  assert.equal(written.status, 'information');
  const deferring = written.conditions.find((c) => c.key === 'fr-urban-rules.written.seeDrawn');
  assert.deepEqual(deferring.params, { rule: 'Hauteur Max-22' });
  assert.ok(!report.checks.some((c) => c.ruleId === written.id), 'it enters no check');

  // Confirmed: it stays confirmed across reads, and its confirmation holds the kind.
  const confirm = actions(report).find((a) => a.id === 'confirm' && a.target.ruleId === drawn.id);
  assert.deepEqual(await act(context, 'confirm', confirm.target), { status: 'done' });
  const entry = section.held().confirmations.find((c) => c.ruleKey === drawn.id);
  assert.equal(entry.kind, 'height_facade');
  for (const reason of ['action', 'design', 'source']) {
    report = await read(context, reason);
    assert.equal(report.rules.find((r) => r.id === drawn.id).status, 'confirmed', reason);
  }
});

test('criterion 6: an earlier drawn confirmation with no kind reopens with the relabel phrase', async () => {
  // Confirmed before 0.6.0: no `kind`.
  const plain = readerFor({ service: fakeService(), section: store(undefined) });
  const first = await read(plain);
  const drawn = first.rules.find((r) => r.label.text === 'Hauteur Max-22');
  await act(
    plain,
    'confirm',
    actions(first).find((a) => a.id === 'confirm' && a.target.ruleId === drawn.id).target
  );
  const old = structuredClone(plain.section.held());
  old.confirmations = old.confirmations.map(({ kind, ...rest }) => rest);
  // Without a written façade height, it stays confirmed as a total height.
  const unchanged = await read(readerFor({ service: fakeService(), section: store(old) }));
  assert.equal(unchanged.rules.find((r) => r.id === drawn.id).status, 'confirmed');
  assert.equal(unchanged.rules.find((r) => r.id === drawn.id).kind, 'height_total');
  // With one, it reopens.
  const context = readerFor({
    service: fakeService({ cached: resultWith({ add: [facadeSeeGraphic] }) }),
    section: store(old)
  });
  const report = await read(context);
  const rule = report.rules.find((r) => r.id === drawn.id);
  assert.equal(rule.status, 'to_confirm');
  assert.ok(rule.conditions.some((c) => c.key === 'fr-urban-rules.written.kindCorrected'));
  // A confirmation stored as a total height reopens the same way.
  const typed = structuredClone(old);
  typed.confirmations[0].kind = 'height_total';
  const again = await read(
    readerFor({
      service: fakeService({ cached: resultWith({ add: [facadeSeeGraphic] }) }),
      section: store(typed)
    })
  );
  assert.equal(again.rules.find((r) => r.id === drawn.id).status, 'to_confirm');
});

// ── Criterion 7: see_graphic alone ─────────────────────────────────────────────

test('criterion 7: a written « see graphic » with no drawn rule of its kind is not evaluable, with the forms to add one', async () => {
  const context = readerFor({ service: fakeService({ cached: recorded }) });
  const report = await read(context);
  const graphic = writtenRules(report).find(
    (r) => r.kind === 'footprint_ratio' && r.statement === 'see_graphic'
  );
  assert.equal(graphic.status, 'not_evaluable');
  assert.ok(graphic.conditions.some((c) => c.key === 'fr-urban-rules.written.seeGraphicNone'));
  assert.ok(
    actions(report).some((a) => a.id === 'add-ratio'),
    'Add a rule'
  );
  assert.ok(!actions(report).some((a) => a.id === 'confirm' && a.target.ruleId === graphic.id));
});

// ── Criterion 8: the façade-relative check ─────────────────────────────────────

const facadeRule = serviceRule({
  kind: 'boundary_setback',
  limit: {
    kind: 'height_relative',
    reference: 'facade_height',
    factor: 1,
    offsetMetres: -4,
    minimumMetres: 2
  },
  passage:
    'En cas de retrait*, ce dernier est au moins égal à la hauteur de façade moins 4 mètres, avec un minimum de 2 mètres.'
});

async function facadeCheck(facades, { confirm = true } = {}) {
  const section = store(undefined);
  const measures = facadeMeasures(facades);
  const context = readerFor({
    service: fakeService({ cached: resultWith({ rules: [facadeRule] }) }),
    section,
    measures,
    boundary: BOX
  });
  let report = await read(context);
  const rule = writtenRules(report)[0];
  if (confirm) {
    await act(
      context,
      'confirm',
      actions(report).find((a) => a.id === 'confirm' && a.target.ruleId === rule.id).target
    );
    report = await read(context, 'action');
  }
  return { report, rule: report.rules.find((r) => r.id === rule.id), section, measures, context };
}

test('criterion 8: « R ≥ Hf − 4 m, min 2 m » is height_relative to the façade height, factor 1, offset −4 m, minimum 2 m', async () => {
  const { rule } = await facadeCheck([{ facade: 'north', height: 9, distance: 5.5 }], {
    confirm: false
  });
  assert.deepEqual(rule.limit, {
    kind: 'height_relative',
    reference: 'facade_height',
    factor: 1,
    offset: { value: -4, unit: 'm' },
    minimum: { value: 2, unit: 'm' }
  });
  // Edit value is not offered on it (DEC-4).
});

test('criterion 8: a 9 m façade at 4.5 m is a potential issue, at 5.5 m no issue — one check, the façade named', async () => {
  const short = await facadeCheck([{ facade: 'north', height: 9, distance: 4.5 }]);
  assert.equal(short.rule.status, 'confirmed');
  let checks = short.report.checks.filter((c) => c.ruleId === short.rule.id);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, `chk:${short.rule.id}:building-main`);
  assert.equal(checks[0].result, 'potential_issue');
  assert.deepEqual(checks[0].measured, { value: 4.5, unit: 'm' });
  assert.deepEqual(checks[0].limit, { value: 5, unit: 'm' });
  assert.ok(short.measures.calls.some((c) => c.byFacade === true));
  const enough = await facadeCheck([{ facade: 'north', height: 9, distance: 5.5 }]);
  checks = enough.report.checks.filter((c) => c.ruleId === enough.rule.id);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].result, 'no_issue');
});

test('002.7 DEC-2: a confirmed « R ≥ Hf − 4 m, min 2 m » insets the side and rear edges 2 m and is a slope rising 1 for 1 from 4 m, said stricter over a roof', async () => {
  const { report, rule } = await facadeCheck([{ facade: 'north', height: 9, distance: 5.5 }]);
  const envelope = report.features.find((f) => f.id === 'envelope');
  // BOX with the road to the south: edge 1 street, 2–4 side and rear — one chain of four points.
  assert.deepEqual(envelope.volume.ceilings, [
    { kind: 'slope', from: [p(20, 0), p(20, 30), p(0, 30), p(0, 0)], rise: 1, start: 4, ruleIds: [rule.id] }
  ]);
  const ring = envelope.rings[0];
  // Within a millimetre: the inset grows each strip by a hair (review 2026-10-21), stricter.
  const extent = [Math.min(...ring.map((q) => q.easting)), Math.max(...ring.map((q) => q.easting)), Math.min(...ring.map((q) => q.northing)), Math.max(...ring.map((q) => q.northing))];
  [2, 18, 0, 28].forEach((expected, i) => assert.ok(Math.abs(extent[i] - expected) < 1e-3, `${extent[i]} vs ${expected}`));
  const view = report.views.find((v) => v.id === 'envelope');
  const applied = view.blocks.find((b) => b.kind === 'table');
  assert.ok(
    applied.rows.some(
      (row) =>
        row[1].key === 'fr-urban-rules.envelope.effect.slopeBoundaryFrom' &&
        row[1].params.start === '4' &&
        row[2].params.rise === '1'
    )
  );
  assert.ok(view.blocks.find((b) => b.kind === 'assumptions').ids.includes('envelope-facade-ceiling'));
});

test('002.7 DEC-2 / criterion 5: a façade-relative setback with a positive offset is not applied, said why, and still checked', async () => {
  const plus = serviceRule({
    kind: 'boundary_setback',
    limit: { kind: 'height_relative', reference: 'facade_height', factor: 0.5, offsetMetres: 1, minimumMetres: 3 },
    passage: 'Le retrait est au moins égal à la moitié de la hauteur de façade plus 1 mètre, avec un minimum de 3 mètres.'
  });
  const section = store(undefined);
  const context = readerFor({
    service: fakeService({ cached: resultWith({ rules: [plus] }) }),
    section,
    measures: facadeMeasures([{ facade: 'north', height: 9, distance: 6 }]),
    boundary: BOX
  });
  let report = await read(context);
  const id = writtenRules(report)[0].id;
  await act(context, 'confirm', actions(report).find((a) => a.id === 'confirm' && a.target.ruleId === id).target);
  report = await read(context, 'action');
  const view = report.views.find((v) => v.id === 'envelope');
  const notApplied = view.blocks.filter((b) => b.kind === 'table').find((t) => t.columns[1].key === 'fr-urban-rules.envelope.column.reason');
  assert.ok(notApplied.rows.some((row) => row[1].key === 'fr-urban-rules.envelope.reason.facadeOffset'));
  // Its 3 m minimum still insets the outline (DEC-1); no slope is drawn for it.
  const envelope = report.features.find((f) => f.id === 'envelope');
  assert.equal(envelope.volume, undefined);
  assert.ok(Math.abs(Math.max(...envelope.rings[0].map((q) => q.northing)) - 27) < 1e-3);
  assert.equal(report.checks.filter((c) => c.ruleId === id).length, 1, 'still checked');
});

test('criterion 8: an L-shaped building — 9 m at 6 m and 6 m at 3 m — is one passing check naming the governing façade', async () => {
  const { report, rule } = await facadeCheck([
    { facade: 'north', height: 9, distance: 6 },
    { facade: 'east', height: 6, distance: 3 }
  ]);
  const checks = report.checks.filter((c) => c.ruleId === rule.id);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].result, 'no_issue');
  assert.equal(checks[0].subject.label.key, 'fr-urban-rules.check.subject.facadeMain');
  assert.equal(checks[0].subject.label.params.facade, 'N');
  assert.match(checks[0].subject.label.params.others, /^E 3 m \/ 2 m$/);
  // The 6 m façade's need is the minimum, 2 m (6 − 4 = 2); the 9 m one's 5 m.
  assert.deepEqual(checks[0].limit, { value: 5, unit: 'm' });
});

test('criterion 8: a façade whose height is unknown makes the check not checked when no other façade fails', async () => {
  const unknown = await facadeCheck([
    { facade: 'north', height: 9, distance: 6 },
    { facade: 'east', height: undefined, distance: 3 }
  ]);
  const checks = unknown.report.checks.filter((c) => c.ruleId === unknown.rule.id);
  assert.equal(checks[0].result, 'not_checked');
  const failing = await facadeCheck([
    { facade: 'north', height: 9, distance: 4 },
    { facade: 'east', height: undefined, distance: 3 }
  ]);
  assert.equal(
    failing.report.checks.find((c) => c.ruleId === failing.rule.id).result,
    'potential_issue'
  );
});

// ── Criterion 9: Confirm writes the full rule ──────────────────────────────────

test('criterion 9: Confirm writes one Request with plot, kind, limit, provenance and citation; without the service the rule stands and is checked', async () => {
  const { section, rule } = await facadeCheck([{ facade: 'north', height: 9, distance: 4.5 }]);
  assert.equal(section.writes.length, 1);
  const entry = section.writes[0].next.confirmations[0];
  assert.equal(section.writes[0].next.schema, 1);
  assert.deepEqual(entry.plot, ['69382000AB0105'].length ? entry.plot : []);
  assert.ok(Array.isArray(entry.plot) && entry.plot.length > 0);
  assert.equal(entry.ruleKey, rule.id);
  assert.equal(entry.kind, 'boundary_setback');
  assert.equal(entry.provenance, 'written');
  assert.equal(entry.decision, 'confirmed');
  assert.deepEqual(entry.limit, rule.limit);
  assert.deepEqual(entry.citation, {
    page: 126,
    article: '2.2.1.2',
    passage: facadeRule.passage
  });
  assert.equal(entry.zone, 'UCe1b');
  assert.equal(entry.idurba, '200046977_PLUI_20260326');

  // Another deployment, no service: shown from the section, confirmed, and checked.
  const alone = readerFor({
    pluginService: undefined,
    section: store(section.held()),
    measures: facadeMeasures([{ facade: 'north', height: 9, distance: 4.5 }]),
    boundary: BOX
  });
  const report = await read(alone);
  const shown = report.rules.find((r) => r.id === rule.id);
  assert.equal(shown.status, 'confirmed');
  assert.equal(shown.provenance, 'written');
  assert.deepEqual(shown.limit, rule.limit);
  assert.deepEqual(shown.citation.passage, { text: facadeRule.passage, lang: 'fr' });
  assert.ok(shown.conditions.some((c) => c.key === 'fr-urban-rules.written.fromSection'));
  const check = report.checks.find((c) => c.ruleId === rule.id);
  assert.equal(check.result, 'potential_issue');
  // Standing on the section alone it is only reopened, never confirmed again from memory.
  const offered = actions(report)
    .filter((a) => a.target?.ruleId === rule.id)
    .map((a) => a.id);
  assert.deepEqual(offered, ['reopen']);
});

test('criterion 9: Edit value on a written value writes the number in `value` and `limit`', async () => {
  const section = store(undefined);
  const context = readerFor({ service: fakeService({ cached: recorded }), section });
  const report = await read(context);
  const setback = writtenRules(report).find(
    (r) => r.kind === 'boundary_setback' && r.limit?.kind === 'value'
  );
  const edit = actions(report).find((a) => a.id === 'edit-value' && a.target.ruleId === setback.id);
  assert.deepEqual(await act(context, 'edit-value', edit.target, { value: 5 }), { status: 'done' });
  const entry = section.held().confirmations[0];
  assert.deepEqual(entry.value, { kind: 'value', value: 5, unit: 'm' });
  assert.deepEqual(entry.limit.quantity, { value: 5, unit: 'm' });
  assert.equal(entry.edited, true);
  const after = await read(context, 'action');
  assert.deepEqual(after.rules.find((r) => r.id === setback.id).limit.quantity, {
    value: 5,
    unit: 'm'
  });
});

// ── Criterion 10: actions need the session ─────────────────────────────────────

test('criterion 10: Confirm on a written rule after the session lost it is refused, and writes nothing', async () => {
  const first = readerFor({
    service: fakeService({ cached: recorded }),
    section: store(undefined)
  });
  const report = await read(first);
  const setback = writtenRules(report).find(
    (r) => r.kind === 'boundary_setback' && r.limit?.kind === 'value'
  );
  const confirm = actions(report).find((a) => a.id === 'confirm' && a.target.ruleId === setback.id);
  // A new session that has not read the rule.
  const section = store(undefined);
  const fresh = readerFor({ service: fakeService(), section });
  await read(fresh);
  assert.deepEqual(await act(fresh, 'confirm', confirm.target), {
    status: 'refused',
    message: { key: 'fr-urban-rules.written.readAgain' }
  });
  assert.equal(section.writes.length, 0);
  // The same session after dispose has forgotten it too.
  first.reader.dispose();
  assert.equal((await act(first, 'confirm', confirm.target)).status, 'refused');
});

test('criterion 10: Edit value is offered on a value and a ratio written rule, never on a height_relative one', async () => {
  const context = readerFor({
    service: fakeService({ cached: resultWith({ add: [facadeRule] }) })
  });
  const report = await read(context);
  const editable = (rule) =>
    actions(report).some((a) => a.id === 'edit-value' && a.target.ruleId === rule.id);
  const value = writtenRules(report).find((r) => r.limit?.kind === 'value');
  const ratio = writtenRules(report).find((r) => r.limit?.kind === 'ratio');
  const relative = writtenRules(report).find((r) => r.limit?.kind === 'height_relative');
  assert.equal(editable(value), true);
  assert.equal(editable(ratio), true);
  assert.equal(editable(relative), false);
  const field = actions(report).find((a) => a.id === 'edit-value' && a.target.ruleId === ratio.id)
    .fields[0];
  assert.deepEqual([field.unit, field.max, field.initial], ['percent', 100, 15]);
  // Confirm, Does not apply on the relative one.
  const offered = actions(report)
    .filter((a) => a.target?.ruleId === relative.id)
    .map((a) => a.id);
  assert.deepEqual(offered, ['confirm', 'not-applicable']);
  // A written rule's subject carries its version alone (DEC-4): no passage, no value.
  const subject = actions(report).find((a) => a.target?.ruleId === value.id).target.subjectId;
  assert.deepEqual(Object.keys(__testing.subjectFieldsOf(subject)), ['i', 'd']);
});

// ── Criterion 11: the section stays schema 1 ───────────────────────────────────

test('criterion 11: the 0.5.0 reader reads a 0.6.0 section writable, lists the written confirmations as newer, and rewrites them unchanged', async () => {
  const { section } = await facadeCheck([{ facade: 'north', height: 9, distance: 6 }]);
  const saved = structuredClone(section.held());
  const written = saved.confirmations[0];
  const old = await import('../../test-fixtures/fr-urban-rules/releases/0.5.0/index.mjs');
  const oldSection = store(structuredClone(saved));
  const context = readerFor({
    module: old.createReader,
    service: fakeService(),
    section: oldSection,
    pluginService: undefined
  });
  const report = await read(context);
  const view = rulesView(report);
  assert.ok(
    !view.blocks.some((b) => b.text?.key === 'fr-urban-rules.notice.newerSection'),
    'writable'
  );
  assert.ok(view.blocks.some((b) => b.text?.key === 'fr-urban-rules.heading.newerVersionRules'));
  assert.ok(!actions(report).some((a) => a.id === 'forget-entry'));
  const height = report.rules.find((r) => r.label.text === 'Hauteur Max-22');
  const confirm = actions(report).find((a) => a.id === 'confirm' && a.target.ruleId === height.id);
  await act(context, 'confirm', confirm.target);
  assert.equal(oldSection.writes.length, 1);
  assert.deepEqual(oldSection.writes[0].next.confirmations[0], written);
  assert.equal(oldSection.writes[0].next.schema, 1);
});

// ── Criterion 12: version change ───────────────────────────────────────────────

test('criterion 12: a result for another version is not shown; a confirmed written rule of the old version reopens with its old limit and citation', async () => {
  const otherVersion = resultWith({
    document: { ...recorded.document, idurba: '200046977_PLUi_20261002' }
  });
  const shownNothing = await read(readerFor({ service: fakeService({ cached: otherVersion }) }));
  assert.equal(writtenRules(shownNothing).length, 0);
  assert.equal(source(shownNothing).detail.key, 'fr-urban-rules.written.status.notRead');

  // A confirmation made under an older version of the document.
  const { section, rule } = await facadeCheck([{ facade: 'north', height: 9, distance: 6 }]);
  const old = structuredClone(section.held());
  old.confirmations[0].idurba = '200046977_PLUI_20250101';
  const report = await read(
    readerFor({ service: fakeService({ cached: otherVersion }), section: store(old) })
  );
  const reopened = report.rules.find((r) => r.id === rule.id);
  assert.equal(reopened.status, 'to_confirm');
  assert.deepEqual(reopened.limit, rule.limit);
  assert.deepEqual(reopened.citation.passage, { text: facadeRule.passage, lang: 'fr' });
  assert.ok(reopened.conditions.some((c) => c.key === 'fr-urban-rules.rule.reopened'));
  assert.ok(
    report.overview.some(
      (b) => b.text?.key === 'fr-urban-rules.notice.rulesReopened' && b.text.params.count >= 1
    )
  );
});

test('DEC-7: a confirmed key the current extraction no longer reads is listed with its passage and Forget', async () => {
  const { section } = await facadeCheck([{ facade: 'north', height: 9, distance: 6 }]);
  // Read again, the extraction now quotes another span.
  const context = readerFor({
    service: fakeService({
      cached: resultWith({ rules: [{ ...facadeRule, passage: 'Un autre passage.' }] })
    }),
    section: store(section.held())
  });
  const report = await read(context);
  const view = rulesView(report);
  const at = view.blocks.findIndex(
    (b) => b.text?.key === 'fr-urban-rules.heading.writtenNoLongerRead'
  );
  assert.ok(at > 0);
  const table = view.blocks.slice(at).find((b) => b.kind === 'table');
  assert.equal(table.rows[0][0].text, facadeRule.passage);
  const forget = view.blocks.slice(at).find((b) => b.kind === 'actions').actions[0];
  assert.equal(forget.id, 'forget-entry');
});

// ── Criterion 13: Extract again ────────────────────────────────────────────────

test('criterion 13: Extract again is offered for another provider, an older prompt, a partial result — and not when they match', async () => {
  const offered = async (cached, current) => {
    const report = await read(readerFor({ service: fakeService({ cached, current }) }));
    return actions(report).some((a) => a.id === 'written-extract-again');
  };
  assert.equal(await offered(recorded, CURRENT), false);
  assert.equal(await offered(recorded, { ...CURRENT, providerId: 'openai' }), true);
  assert.equal(await offered(recorded, { ...CURRENT, promptVersion: 2 }), true);
  assert.equal(await offered(resultWith({ chunks: { of: 9, failed: 1 } }), CURRENT), true);
  // Extract again POSTs with refresh=1.
  const service = fakeService({ cached: recorded, current: { ...CURRENT, providerId: 'openai' } });
  const context = readerFor({ service });
  const report = await read(context);
  const again = actions(report).find((a) => a.id === 'written-extract-again');
  await act(context, 'written-extract-again', again.target);
  assert.ok(service.calls.post[0].url.endsWith('?refresh=1'));
  // A partial result says what it lacks.
  const partial = await read(
    readerFor({ service: fakeService({ cached: resultWith({ chunks: { of: 9, failed: 2 } }) }) })
  );
  const notice = rulesView(partial).blocks.find(
    (b) => b.text?.key === 'fr-urban-rules.written.state.partial'
  );
  assert.deepEqual(notice.text.params, { failed: 2, of: 9, dropped: 46 });
  assert.equal(source(partial).detail.key, 'fr-urban-rules.written.status.partial');
});

// ── Criterion 14: containment ──────────────────────────────────────────────────

test('criterion 14: no extracted string reaches a phrase key, a params value or an href', async () => {
  const section = store(undefined);
  const context = readerFor({
    service: fakeService({ cached: resultWith({ add: [facadeSeeGraphic, facadeRule] }) }),
    section,
    measures: facadeMeasures([{ facade: 'north', height: 9, distance: 4.5 }]),
    boundary: BOX
  });
  let report = await read(context);
  // Confirm everything that can be, so the confirmed shapes are scanned too.
  for (const a of actions(report).filter(
    (x) => x.id === 'confirm' && x.target.ruleId?.startsWith('written:')
  )) {
    await act(context, 'confirm', a.target);
  }
  report = await read(context, 'action');
  const extracted = [];
  for (const rule of [...recorded.rules, facadeSeeGraphic, facadeRule]) {
    extracted.push(rule.passage, ...rule.conditions, ...rule.exceptions);
    if (rule.article) extracted.push(rule.article);
  }
  const needles = [...new Set(extracted.filter((x) => x.length >= 5))];
  const scanned = [];
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    if (typeof value.key === 'string') scanned.push(value.key);
    if (value.params !== undefined)
      for (const v of Object.values(value.params)) scanned.push(String(v));
    if (typeof value.href === 'string') scanned.push(value.href);
    for (const v of Object.values(value)) walk(v);
  };
  walk(report);
  assert.ok(scanned.length > 100);
  for (const needle of needles) {
    for (const text of scanned) assert.ok(!text.includes(needle), `${needle} in ${text}`);
  }
  // Every written href is the GPU link and an integer page.
  for (const rule of writtenRules(report)) assert.match(rule.citation.href, /\.pdf#page=\d+$/);
});

test('DEC-8: a result of another shape is malformed, and a rule of another shape is left out and counted', async () => {
  const broken = await read(readerFor({ service: fakeService({ cached: { rules: 'x' } }) }));
  assert.equal(source(broken).detail.key, 'fr-urban-rules.written.code.malformed');
  const odd = resultWith({
    rules: [
      serviceRule({ limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' }, page: 9999 }),
      serviceRule({ statement: 'limit', limit: null }),
      serviceRule({ limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' } })
    ]
  });
  const report = await read(readerFor({ service: fakeService({ cached: odd }) }));
  assert.equal(writtenRules(report).length, 1);
});

test('DEC-1: a written state never blocks a report — every report this sprint builds passes the host limits', async () => {
  const context = readerFor({ service: fakeService({ cached: recorded }) });
  const report = await read(context);
  assert.ok(report.rules.length <= 1000);
  assert.ok(report.sources.some((s) => s.id === 'written-rules'));
});

test('live-run fix: the Extract action fires nothing (the host reads with `action`), and a poll that changes nothing fires nothing', async () => {
  const schedule = manualTimers();
  const step = {
    jobId: 'j',
    state: 'extracting',
    progress: { step: 'extracting', chunk: 1, of: 9 }
  };
  const service = fakeService({ steps: [step, step, step] });
  const context = readerFor({ service, schedule });
  let fires = 0;
  context.reader.onDidChange(() => (fires += 1));
  const report = await read(context);
  await act(
    context,
    'written-extract',
    actions(report).find((a) => a.id === 'written-extract').target
  );
  await settle();
  assert.equal(fires, 0, 'no fire for the action');
  await read(context, 'action');
  await schedule.tick();
  assert.equal(fires, 1, 'queued → extracting 1/9');
  await read(context, 'source');
  await schedule.tick();
  await schedule.tick();
  assert.equal(fires, 1, 'the same step twice: nothing');
  assert.equal(service.calls.poll.length, 3);
});

// ── Review fixes (2026-10-20) ──────────────────────────────────────────────────

import { createHash } from 'node:crypto';

/** The 0.5.0 build's entry file, as extracted from its `.aspkg` (002.6b criterion 11). */
const RELEASE_050_SHA256 = 'eaa7ca168cb16af3ea309c84286cac0ea496bcc0f6c89d59cfc5c26cb87c3fec';

/** A clock that stays where a test puts it. */
function heldClock(start = Date.UTC(2026, 9, 20, 8, 0)) {
  let at = start;
  const now = () => new Date(at);
  now.advance = (ms) => (at += ms);
  return now;
}
const confirmAll = async (context, report, predicate) => {
  for (const a of actions(report).filter(
    (x) => x.id === 'confirm' && predicate(report.rules.find((r) => r.id === x.target.ruleId))
  ))
    await act(context, 'confirm', a.target);
};

test('decision Q3: a confirmed written « ≤ 40 % of the plot area » feeds the budget: allowed = 40 % × plot area', async () => {
  const ratio = (base, comparison = 'max') =>
    serviceRule({
      kind: 'footprint_ratio',
      limit: { kind: 'ratio', comparison, percent: 40, base },
      page: 128,
      passage: `L'emprise au sol est au plus de 40 % (${base}).`
    });
  const budget = async (rule) => {
    const section = store(undefined);
    const context = readerFor({
      service: fakeService({ cached: resultWith({ rules: [rule] }) }),
      section,
      measures: {
        ...facadeMeasures([]),
        plotCoverage: () => ({ available: false, reason: 'no-rooms' })
      },
      siteExtra: { plotArea: 1178 }
    });
    let report = await read(context);
    await confirmAll(context, report, (r) => r?.kind === 'footprint_ratio');
    report = await read(context, 'action');
    const rows = report.views
      .find((v) => v.id === 'surfaces')
      .blocks.filter((b) => b.kind === 'fields')
      .flatMap((b) => b.rows);
    return rows.find((r) => r.label.key === 'fr-urban-rules.surfaces.budget.allowed')?.value;
  };
  assert.deepEqual(await budget(ratio('plot_area')), { value: 471.2, unit: 'm2' });
  // An emprise or floor-area base never feeds it; nor would a minimum (S5 drops it).
  assert.equal(await budget(ratio('emprise')), undefined);
  assert.equal(await budget(ratio('surface_de_plancher')), undefined);
  assert.equal(await budget(ratio('plot_area', 'min')), undefined);
});

test('review S1: polls that keep failing honour Retry-After and fail the zone after five; 40 × 429 never polls at 3 s', async () => {
  const schedule = manualTimers();
  const busy = () => json(429, { retryAfterSeconds: 30, error: 'rate_limited' });
  const service = fakeService({ steps: Array.from({ length: 40 }, () => busy) });
  const context = readerFor({ service, schedule, now: heldClock() });
  const report = await read(context);
  await act(
    context,
    'written-extract',
    actions(report).find((a) => a.id === 'written-extract').target
  );
  const delays = [];
  for (let i = 0; i < 10 && schedule.pending.some((e) => !e.cancelled); i += 1) {
    delays.push(...(await schedule.tick()));
  }
  assert.deepEqual(delays, [3000, 30_000, 30_000, 30_000, 30_000], 'Retry-After honoured');
  assert.equal(service.calls.poll.length, 5, 'stopped after five failures');
  const after = await read(context, 'source');
  assert.equal(source(after).state, 'unavailable');
  assert.equal(source(after).detail.key, 'fr-urban-rules.written.code.unavailable');
});

test('review S1: a job stuck in one state past 35 minutes fails as a timeout', async () => {
  const now = heldClock();
  const schedule = manualTimers();
  const same = { jobId: 'j', state: 'extracting', progress: { chunk: 2, of: 9 } };
  const service = fakeService({ steps: [same, same, same] });
  const context = readerFor({ service, schedule, now });
  const report = await read(context);
  await act(
    context,
    'written-extract',
    actions(report).find((a) => a.id === 'written-extract').target
  );
  await schedule.tick();
  now.advance(36 * 60_000);
  await schedule.tick();
  const after = await read(context, 'source');
  assert.equal(source(after).detail.key, 'fr-urban-rules.written.code.timeout');
  assert.equal(schedule.pending.filter((e) => !e.cancelled).length, 0);
});

test('review S2: a read of a plot with no written rules (no service) pauses polling, and a poll on its way does nothing', async () => {
  const schedule = manualTimers();
  const service = fakeService({ steps: [{ jobId: 'j', state: 'extracting', progress: {} }] });
  let located = true;
  const context = readerFor({
    service,
    schedule,
    pluginService: { locate: async () => (located ? { baseUrl: BASE } : undefined) }
  });
  const report = await read(context);
  await act(
    context,
    'written-extract',
    actions(report).find((a) => a.id === 'written-extract').target
  );
  const onItsWay = schedule.pending.find((e) => !e.cancelled);
  located = false;
  await read(context, 'design');
  assert.equal(schedule.pending.filter((e) => !e.cancelled).length, 0, 'cancelled');
  await onItsWay.fn(); // a timer that fires anyway
  assert.equal(service.calls.poll.length, 0, 'a paused record is not polled');
  // Back on view: polling resumes.
  located = true;
  await read(context, 'design');
  assert.equal(schedule.pending.filter((e) => !e.cancelled).length, 1);
});

test('review S3: the retry time is the one the service gave, kept; Try again is hidden until then; cachedOnly waits for it', async () => {
  const now = heldClock(Date.UTC(2026, 9, 20, 8, 0));
  let busy = true;
  const service = fakeService({
    cached: () =>
      busy
        ? json(503, { retryAfterSeconds: 600, error: 'busy' })
        : json(200, { result: recorded, current: CURRENT })
  });
  const context = readerFor({ service, now });
  const first = await read(context);
  const retry = rulesView(first).blocks.find(
    (b) => b.text?.key === 'fr-urban-rules.written.status.retryAfter'
  );
  const time = retry.text.params.time;
  assert.ok(!actions(first).some((a) => a.id === 'written-try-again'), 'hidden until then');
  now.advance(5 * 60_000);
  const later = await read(context, 'design');
  assert.equal(
    rulesView(later).blocks.find((b) => b.text?.key === 'fr-urban-rules.written.status.retryAfter')
      .text.params.time,
    time,
    'not pushed back'
  );
  await read(context, 'design');
  assert.equal(service.calls.cachedOnly.length, 1, 'not asked before the time');
  busy = false;
  now.advance(5 * 60_000 + 1000);
  await read(context, 'design');
  assert.equal(service.calls.cachedOnly.length, 2);
  const after = await read(context, 'design');
  assert.ok(writtenRules(after).length > 0);
});

test('review S4: a written rule confirmed as one kind and read now as another reopens', async () => {
  const one = serviceRule({
    kind: 'boundary_setback',
    limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' },
    passage: 'Le retrait* est au moins égal à 4 mètres.'
  });
  const section = store(undefined);
  const first = readerFor({
    service: fakeService({ cached: resultWith({ rules: [one] }) }),
    section
  });
  let report = await read(first);
  await confirmAll(first, report, (r) => r?.provenance === 'written');
  const saved = section.held();
  const again = readerFor({
    service: fakeService({ cached: resultWith({ rules: [{ ...one, kind: 'road_setback' }] }) }),
    section: store(saved)
  });
  report = await read(again);
  const rule = writtenRules(report)[0];
  assert.equal(rule.id, saved.confirmations[0].ruleKey);
  assert.equal(rule.status, 'to_confirm');
  assert.ok(rule.conditions.some((c) => c.key === 'fr-urban-rules.written.kindCorrected'));
});

test('review S5: a value whose comparison contradicts its kind is left out and counted; parking and other are kept', async () => {
  const rules = [
    serviceRule({
      kind: 'boundary_setback',
      limit: { kind: 'value', comparison: 'max', value: 4, unit: 'm' },
      passage: 'Un retrait au plus de 4 m.'
    }),
    serviceRule({
      kind: 'height_total',
      limit: { kind: 'value', comparison: 'min', value: 9, unit: 'm' },
      passage: 'Une hauteur au moins de 9 m.'
    }),
    serviceRule({
      kind: 'green_ratio',
      limit: { kind: 'ratio', comparison: 'max', percent: 15, base: 'plot_area' },
      passage: 'Pleine terre au plus 15 %.'
    }),
    serviceRule({
      kind: 'parking',
      limit: { kind: 'value', comparison: 'min', value: 1, unit: 'm2' },
      passage: 'Une place au moins.'
    }),
    serviceRule({
      kind: 'other',
      limit: { kind: 'value', comparison: 'max', value: 3, unit: 'm' },
      passage: 'Une autre règle de 3 m.'
    }),
    serviceRule({
      kind: 'boundary_setback',
      limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' },
      passage: 'Le retrait* est au moins égal à 4 mètres.'
    })
  ];
  const result = __testing.checkedResult(resultWith({ rules, dropped: {} }));
  assert.deepEqual(
    result.rules.map((r) => r.kind),
    ['parking', 'other', 'boundary_setback']
  );
  assert.equal(result.dropped, 3);
  // Caps (NIT): over 10 km or a factor over 100 is no rule.
  const capped = __testing.checkedResult(
    resultWith({
      rules: [
        serviceRule({ limit: { kind: 'value', comparison: 'min', value: 10_001, unit: 'm' } }),
        serviceRule({
          limit: {
            kind: 'height_relative',
            reference: 'facade_height',
            factor: 101,
            offsetMetres: null,
            minimumMetres: null
          }
        }),
        serviceRule({
          limit: {
            kind: 'height_relative',
            reference: 'facade_height',
            factor: 1,
            offsetMetres: -10_001,
            minimumMetres: null
          }
        })
      ],
      dropped: {}
    })
  );
  assert.equal(capped.rules.length, 0);
});

test('review S5: a check uses the limit’s own comparison — a stored setback « at most » passes at less, fails at more', async () => {
  const run = async (distance) => {
    const measures = facadeMeasures([]);
    measures.distances = (input) => ({
      available: true,
      buildingId: 'building-main',
      targets: input.targets.map((t) => ({
        target: t,
        nearest: { building: p(5, 5), target: p(5, 0), distance }
      }))
    });
    // A confirmation standing on the section (no service), its limit « at most 4 m ».
    const section = store({
      schema: 1,
      confirmations: [
        {
          ruleKey: 'written:*:00000000000001',
          plot: undefined,
          idurba: '200046977_PLUI_20260326',
          datvalid: '20260326',
          decision: 'confirmed',
          kind: 'boundary_setback',
          limit: { kind: 'value', comparison: 'max', quantity: { value: 4, unit: 'm' } },
          provenance: 'written',
          citation: { page: 126, passage: 'Un retrait au plus de 4 m.' },
          at: '2026-10-20T08:00:00Z'
        }
      ]
    });
    const report = await read(
      readerFor({ pluginService: undefined, section, measures, boundary: BOX })
    );
    const rule = report.rules.find((r) => r.id === 'written:*:00000000000001');
    return { rule, checks: report.checks.filter((c) => c.ruleId === rule.id) };
  };
  const near = await run(3);
  assert.equal(near.rule.status, 'confirmed');
  assert.equal(near.checks[0].result, 'no_issue');
  const far = await run(5);
  assert.equal(far.checks[0].result, 'potential_issue');
});

test('review S6: a drawn confirmation stored as a façade height keeps its kind with no service, and while cachedOnly is slow', async () => {
  // Confirmed as a façade height with the written rule read.
  const section = store(undefined);
  const first = readerFor({
    service: fakeService({ cached: resultWith({ add: [facadeSeeGraphic] }) }),
    section
  });
  let report = await read(first);
  const drawn = report.rules.find((r) => r.label.text === 'Hauteur Max-22');
  await act(
    first,
    'confirm',
    actions(report).find((a) => a.id === 'confirm' && a.target.ruleId === drawn.id).target
  );
  const saved = section.held();
  assert.equal(saved.confirmations[0].kind, 'height_facade');
  // No service.
  report = await read(readerFor({ pluginService: undefined, section: store(saved) }));
  let rule = report.rules.find((r) => r.id === drawn.id);
  assert.deepEqual([rule.status, rule.kind], ['confirmed', 'height_facade']);
  // cachedOnly still to come.
  const slow = fakeService({ cached: resultWith({ add: [facadeSeeGraphic] }) });
  slow.hold('cachedOnly');
  const wait = manualWait();
  const context = readerFor({ service: slow, section: store(saved), wait });
  const reading = read(context);
  while (slow.calls.cachedOnly.length === 0) await settle();
  wait.elapse();
  report = await reading;
  rule = report.rules.find((r) => r.id === drawn.id);
  assert.deepEqual([rule.status, rule.kind], ['confirmed', 'height_facade']);
  slow.release('cachedOnly');
  // A written result that reads a total height: now it reopens.
  const total = serviceRule({
    kind: 'height_total',
    limit: { kind: 'value', comparison: 'max', value: 22, unit: 'm' },
    passage: 'La hauteur totale est au plus de 22 mètres.'
  });
  report = await read(
    readerFor({
      service: fakeService({ cached: resultWith({ add: [total] }) }),
      section: store(saved)
    })
  );
  rule = report.rules.find((r) => r.id === drawn.id);
  assert.equal(rule.status, 'to_confirm');
  assert.ok(rule.conditions.some((c) => c.key === 'fr-urban-rules.written.kindCorrected'));
});

test('review S7: Confirm on a written rule during a Refresh is not refused by the Refresh’s progress reports', async () => {
  // The Refresh's `locate()` is held: its progress reports know no written state yet.
  let gate;
  const pluginService = {
    locate: async () => {
      if (gate !== undefined) await gate.promise;
      return { baseUrl: BASE };
    }
  };
  const section = store(undefined);
  const context = readerFor({ service: fakeService({ cached: recorded }), section, pluginService });
  const report = await read(context);
  const setback = writtenRules(report).find(
    (r) => r.kind === 'boundary_setback' && r.limit?.kind === 'value'
  );
  const confirm = actions(report).find((a) => a.id === 'confirm' && a.target.ruleId === setback.id);
  let release;
  gate = { promise: new Promise((resolve) => (release = resolve)) };
  let progressed = 0;
  const refreshing = context.reader.read(requestFor(context.site, 'refresh'), {
    signal: signal(),
    progress: () => (progressed += 1)
  });
  while (progressed < 3) await settle();
  assert.deepEqual(await act(context, 'confirm', confirm.target), { status: 'done' });
  assert.equal(section.writes.length, 1);
  gate = undefined;
  release();
  await refreshing;
});

test('review S8: a written building distance that is not regulated is no check', async () => {
  const rules = [
    serviceRule({
      kind: 'building_distance',
      statement: 'not_regulated',
      passage: "La distance entre constructions n'est pas réglementée."
    }),
    serviceRule({
      kind: 'building_distance',
      limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' },
      passage: 'Les constructions sont distantes d’au moins 4 mètres.'
    })
  ];
  const report = await read(
    readerFor({
      service: fakeService({ cached: resultWith({ rules }) }),
      measures: facadeMeasures([]),
      boundary: BOX
    })
  );
  const [free, limited] = writtenRules(report);
  assert.equal(report.checks.filter((c) => c.ruleId === free.id).length, 0);
  const checks = report.checks.filter((c) => c.ruleId === limited.id);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].result, 'not_checked');
});

test('review NITs: two zones of one chapter list each rule once, whatever the zone order; a partial result lists no "no longer read"', async () => {
  const idsFor = async (before) => {
    const zoneUrba = lyon.answers.get('apicarto-zone-urba').body;
    const other = structuredClone(zoneUrba.features[0]);
    other.id = 'zone_urba.other';
    other.properties.libelle = 'UCe1a';
    const features = before ? [other, ...zoneUrba.features] : [...zoneUrba.features, other];
    const report = await read(
      readerFor({
        service: fakeService({ cached: recorded }),
        overrides: { 'apicarto-zone-urba': async () => json(200, { ...zoneUrba, features }) }
      })
    );
    return writtenRules(report)
      .map((r) => r.id)
      .sort();
  };
  const a = await idsFor(false);
  const b = await idsFor(true);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length, 'no duplicate');
  // Partial: a confirmed key it does not read is shown from the section, never "no longer read".
  const { section } = await facadeCheck([{ facade: 'north', height: 9, distance: 6 }]);
  const partial = resultWith({ rules: [], chunks: { of: 9, failed: 3 } });
  const report = await read(
    readerFor({ service: fakeService({ cached: partial }), section: store(section.held()) })
  );
  assert.ok(
    !rulesView(report).blocks.some(
      (x) => x.text?.key === 'fr-urban-rules.heading.writtenNoLongerRead'
    )
  );
  assert.equal(writtenRules(report).length, 1);
});

test('review NITs: written rules past the host’s 1,000 are counted and said; an over-large answer is unavailable', async () => {
  const many = Array.from({ length: 1000 }, (_, i) =>
    serviceRule({
      kind: 'other',
      limit: null,
      statement: 'described',
      passage: `Règle numéro ${i}.`
    })
  );
  const entered = Array.from({ length: 3 }, (_, i) => ({
    key: `entered:00000000000${i}`,
    kind: 'height_total',
    statement: 'limit',
    limit: { kind: 'value', value: 9, unit: 'm' },
    source: { document: 'Règlement' },
    at: '2026-10-20T08:00:00Z'
  }));
  const report = await read(
    readerFor({
      service: fakeService({ cached: resultWith({ rules: many }) }),
      section: store({ schema: 1, entered })
    })
  );
  assert.ok(report.rules.length <= 1000);
  const notice = rulesView(report).blocks.find(
    (b) => b.text?.key === 'fr-urban-rules.notice.writtenCapped'
  );
  assert.equal(notice.text.params.count, 3);
  const huge = await read(
    readerFor({
      service: fakeService({ cached: () => json(200, 'x'.repeat(4 * 1024 * 1024 + 1)) })
    })
  );
  assert.equal(source(huge).detail.key, 'fr-urban-rules.written.code.unavailable');
});

test('review NITs: a double click while the POST is on its way sends one POST; a repeated cachedOnly answer fires nothing', async () => {
  const service = fakeService();
  service.hold('post');
  const context = readerFor({ service });
  const report = await read(context);
  const target = actions(report).find((a) => a.id === 'written-extract').target;
  const one = act(context, 'written-extract', target);
  const two = act(context, 'written-extract', target);
  service.release('post');
  await Promise.all([one, two]);
  assert.equal(service.calls.post.length, 1);
  // A Refresh that asks the cache again and hears the same: no fire.
  const quiet = readerFor({ service: fakeService() });
  await read(quiet);
  let fires = 0;
  quiet.reader.onDidChange(() => (fires += 1));
  await read(quiet, 'refresh');
  await settle();
  assert.equal(fires, 0);
});

test('review NIT: criterion 11 runs against the 0.5.0 build exactly as it shipped (sha256)', async () => {
  const bytes = await readFile(
    new URL('../../test-fixtures/fr-urban-rules/releases/0.5.0/index.mjs', import.meta.url)
  );
  assert.equal(createHash('sha256').update(bytes).digest('hex'), RELEASE_050_SHA256);
});

// ── Sprint 002.11: the written readings kept in the project's snapshot ──────────

/** 096.4's section store with 096.17's cache beside it: `writeCache` recorded, `write` too. */
function cacheStore(section, cache) {
  const base = store(section);
  let held = cache;
  const cacheWrites = [];
  base.service.readCache = () => (held === undefined ? undefined : structuredClone(held));
  base.service.writeCache = (data, attributions) => {
    cacheWrites.push({ data: structuredClone(data), attributions });
    held = structuredClone(data);
  };
  base.service.onDidChangeCache = () => ({ dispose: () => {} });
  return { ...base, cacheWrites, cache: () => held };
}

/** Lyon read with the companion answering the recorded extraction: the report and the snapshot. */
async function lyonWithSnapshot() {
  const section = cacheStore(undefined);
  const context = readerFor({ service: fakeService({ cached: recorded }), section });
  const report = await read(context);
  context.reader.dispose();
  return { report, snapshot: section.cache(), section };
}

test('002.11 criterion 7: restored extraction stands without the service', async () => {
  const online = await lyonWithSnapshot();
  assert.equal(online.section.cacheWrites.length, 1);
  const [written] = online.snapshot.written;
  // The whole result is kept — its rules with their passages and computed keys (DEC-5).
  // 32 rules served; the one 002.6b's review S5 leaves out is never stored.
  assert.equal(recorded.rules.length, 32);
  assert.equal(written.result.rules.length, __testing.checkedResult(recorded).rules.length);
  assert.ok(written.result.rules.every((r) => typeof r.passage === 'string' && r.passage !== ''));
  assert.ok(written.result.rules.some((r) => r.ruleKey?.startsWith('written:')));
  const fresh = writtenRules(online.report);
  assert.ok(fresh.length > 0);

  const section = cacheStore(undefined, online.snapshot);
  const context = readerFor({ pluginService: { locate: async () => undefined }, section });
  const report = await read(context);
  context.reader.dispose();
  // The same rules, the same keys and passages, from the project alone.
  assert.deepEqual(
    writtenRules(report).map((r) => [r.id, r.citation.passage.text]),
    fresh.map((r) => [r.id, r.citation.passage.text])
  );
  // « Written rules as read on {date} ({model}) », and the « not available » notice kept (DEC-7).
  const asRead = rulesView(report).blocks.find(
    (b) => b.text?.key === 'fr-urban-rules.snapshot.writtenAsRead'
  );
  assert.ok(asRead !== undefined);
  assert.equal(
    en['fr-urban-rules.snapshot.writtenAsRead'].replace('{date}', asRead.text.params.date).replace('{model}', asRead.text.params.model),
    `Written rules as read on ${asRead.text.params.date} (${recorded.model.model}).`
  );
  assert.match(fr['fr-urban-rules.snapshot.writtenAsRead'], /^Règles écrites telles que lues le \{date\}/);
  assert.ok(
    report.overview.some((b) => b.text?.key === 'fr-urban-rules.notice.writtenRulesUnavailable')
  );
  // Extract again is not offered: the notice says why.
  const ids = actions(report).map((a) => a.id);
  assert.equal(ids.includes('written-extract-again'), false);
  assert.equal(ids.includes('written-extract'), false);
  assert.equal(section.writes.length, 0, 'no decision from a read');
  assert.equal(section.cacheWrites.length, 0, 'an unchanged reading is not written again');
});

test('002.11 review: the règlement’s link comes back from a written reading when the GPU never answered', async () => {
  const online = await lyonWithSnapshot();
  const [written] = online.snapshot.written;
  // The written reading keeps the GPU document it was read from (fixed per version).
  const { documentId, nomfic } = written.result.document;
  assert.match(documentId, /^[0-9a-f]{32}$/);
  // As ManualChemin's walk: the GPU's file list never answered, so the snapshot holds none.
  const cache = structuredClone(online.snapshot);
  delete cache.sources['gpu-files'];
  const section = cacheStore(undefined, cache);
  const context = readerFor({
    pluginService: { locate: async () => undefined },
    section,
    overrides: { 'gpu-document': answering(503, null), 'gpu-files': answering(503, null) }
  });
  const report = await read(context);
  context.reader.dispose();
  const href = `https://www.geoportail-urbanisme.gouv.fr/api/document/${documentId}/files/${encodeURIComponent(nomfic)}`;
  const link = report.overview.find((b) => b.kind === 'link');
  assert.equal(link?.href, href);
  assert.equal(link.detail.key, 'fr-urban-rules.link.detailAsRead');
  assert.equal(link.detail.params.date, written.result.extractedAt.slice(0, 10));
  assert.match(en['fr-urban-rules.link.detailAsRead'], /^The file as listed on \{date\}/);
  assert.match(fr['fr-urban-rules.link.detailAsRead'], /^Le fichier tel que listé le \{date\}/);
  assert.equal(report.document.href, href);
  assert.equal(
    report.overview.some((b) => b.text?.key === 'fr-urban-rules.notice.linkUnavailable'),
    false,
    'never « could not be resolved » while the file is known'
  );
  assert.equal(section.writes.length, 0);
});

test('002.11 review: written keys survive DEC-2 step 5 — passages shortened, keys as read (criterion 3)', async () => {
  const section = cacheStore(undefined);
  // Lyon's passages are all under 500 characters: one long rule added, and its twin
  // (the same passage), so the order suffix `~2` is kept through the shortening too.
  const long = 'Les constructions doivent s’implanter en retrait de la limite. '.repeat(12);
  const cached = resultWith({
    add: [
      serviceRule({ statement: 'described', passage: long }),
      serviceRule({ statement: 'described', passage: long, page: 127 })
    ]
  });
  const online = readerFor({
    service: fakeService({ cached }),
    section,
    snapshotMinimumStep: 6
  });
  const fresh = await read(online);
  online.reader.dispose();
  const snapshot = section.cache();
  assert.ok(snapshot.simplified.includes('shorten-passages'));
  const shortened = snapshot.written[0].result.rules.filter((r) => r.passage.endsWith('…'));
  assert.ok(shortened.length > 0, 'some passage was over 500 characters');
  const context = readerFor({
    pluginService: { locate: async () => undefined },
    section: cacheStore(undefined, snapshot)
  });
  const restored = await read(context);
  context.reader.dispose();
  assert.deepEqual(
    writtenRules(restored).map((r) => r.id).sort(),
    writtenRules(fresh).map((r) => r.id).sort()
  );
  assert.ok(writtenRules(restored).some((r) => /~2$/.test(r.id)));
});

test('002.11 review: a stored written key whose sector holds a space is kept, not recomputed', () => {
  const key = 'written:UA et UB:1a2b3c4d5e6f7';
  const result = __testing.checkedResult(
    resultWith({ rules: [serviceRule({ statement: 'described', sector: 'UA et UB', ruleKey: key })] })
  );
  assert.equal(result.rules[0].ruleKey, key);
  // A control character is still refused.
  const refused = __testing.checkedResult(
    resultWith({ rules: [serviceRule({ statement: 'described', sector: 'UA', ruleKey: 'written:UA\n:1' })] })
  );
  assert.equal(refused.rules[0].ruleKey, undefined);
});

test('002.11 review: at the zone’s page, a link read earlier still says when', async () => {
  const online = await lyonWithSnapshot();
  const cache = structuredClone(online.snapshot);
  delete cache.sources['gpu-files'];
  const context = readerFor({
    service: fakeService({ cached: recorded }),
    section: cacheStore(undefined, cache),
    overrides: { 'gpu-document': answering(503, null), 'gpu-files': answering(503, null) }
  });
  await read(context);
  await settle();
  const report = await read(context, 'source');
  context.reader.dispose();
  const link = report.overview.find((b) => b.kind === 'link' && b.href.includes('#page='));
  assert.ok(link !== undefined, 'the zone’s page is known');
  assert.equal(link.detail.key, 'fr-urban-rules.link.detailPageAsRead');
  assert.equal(link.detail.params.date, recorded.extractedAt.slice(0, 10));
  assert.match(en['fr-urban-rules.link.detailPageAsRead'], /^The file as listed on \{date\}, opened at page \{page\}/);
  assert.match(fr['fr-urban-rules.link.detailPageAsRead'], /^Le fichier tel que listé le \{date\}, ouvert à la page \{page\}/);
});

test('002.11 review: a written reading of another version names no link', async () => {
  const online = await lyonWithSnapshot();
  const cache = structuredClone(online.snapshot);
  delete cache.sources['gpu-files'];
  for (const entry of cache.written) {
    entry.query.idurba = '200046977_PLUi_20990101';
    entry.result.document.idurba = '200046977_PLUi_20990101';
  }
  const context = readerFor({
    pluginService: { locate: async () => undefined },
    section: cacheStore(undefined, cache),
    overrides: { 'gpu-document': answering(503, null), 'gpu-files': answering(503, null) }
  });
  const report = await read(context);
  context.reader.dispose();
  assert.equal(report.overview.some((b) => b.kind === 'link'), false);
  assert.ok(report.overview.some((b) => b.text?.key === 'fr-urban-rules.notice.linkUnavailable'));
});

test('002.11 criterion 8: a newer reading is offered, never applied; « Use it » writes the cache once', async () => {
  const online = await lyonWithSnapshot();
  const newer = resultWith({
    add: [
      serviceRule({ statement: 'described', passage: 'Une règle lue par une lecture plus récente.' })
    ],
    extractedAt: '2026-10-21T08:00:00.000Z'
  });
  const service = fakeService({ cached: newer });
  const section = cacheStore(undefined, online.snapshot);
  const context = readerFor({ service, section });
  await read(context);
  await settle();
  const report = await read(context, 'source');
  assert.ok(service.calls.cachedOnly.length >= 1);
  // The project's reading stands: the same rules as before.
  assert.deepEqual(
    writtenRules(report).map((r) => r.id),
    writtenRules(online.report).map((r) => r.id)
  );
  const offer = rulesView(report).blocks.find(
    (b) => b.text?.key === 'fr-urban-rules.snapshot.newerReading'
  );
  assert.ok(offer !== undefined, 'the newer reading is offered');
  assert.equal(offer.text.params.date, '2026-10-21');
  assert.equal(offer.actions[0].id, 'written-use-newer');
  assert.equal(en['fr-urban-rules.snapshot.useNewer'], 'Use it');
  assert.equal(fr['fr-urban-rules.snapshot.useNewer'], 'Utiliser');
  assert.equal(section.cacheWrites.length, 0, 'an offer writes nothing');

  const answer = await act(context, 'written-use-newer', offer.actions[0].target);
  assert.deepEqual(answer, { status: 'done' });
  assert.equal(section.cacheWrites.length, 1, 'accepting writes the cache once');
  assert.equal(section.writes.length, 0, 'and the section never');
  const after = await read(context, 'action');
  context.reader.dispose();
  assert.equal(section.cacheWrites.length, 1);
  assert.equal(writtenRules(after).length, writtenRules(online.report).length + 1);
  assert.equal(
    rulesView(after).blocks.some((b) => b.text?.key === 'fr-urban-rules.snapshot.newerReading'),
    false
  );
  assert.equal(
    section.cache().written[0].result.rules.length,
    __testing.checkedResult(recorded).rules.length + 1
  );
});
