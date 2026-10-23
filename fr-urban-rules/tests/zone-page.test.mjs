/**
 * The zone's page (Sprint 002.6a): the companion service found through
 * `plugin-service`'s `locate()`, one `GET chapter` per zone, the 2 s wait, the
 * link at the zone's page built at each read, the not-available notice, and
 * the forward-compatible section reader. No network: 002.0's recordings, a
 * stubbed `plugin-service`, and a fake service answering from 002.5a's
 * recorded document (`test-fixtures/fr-urban-rules/<plot>/regulation/`).
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, activate, createReader, deactivate } from '../src/index.js';
import {
  docBlocks,
  FIXTURES,
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

const plots = {};
const documents = {};
before(async () => {
  for (const plot of ['lyon', 'gordes', 'brouennes']) plots[plot] = await loadPlot(plot);
  for (const plot of ['lyon', 'gordes']) {
    const folder = new URL(`${plot}/regulation/`, FIXTURES);
    documents[plot] = {
      meta: JSON.parse(await readFile(new URL('meta.json', folder), 'utf8')),
      outline: JSON.parse(await readFile(new URL('outline.json', folder), 'utf8'))
    };
  }
});

const signal = () => new AbortController().signal;

/** A clock that moves a minute per call (as reading.test.mjs's), or held where a test sets it. */
function clock(start = Date.UTC(2026, 9, 20, 8, 0)) {
  let at = start;
  const now = () => {
    at += 60_000;
    return new Date(at);
  };
  now.jump = (ms) => (at += ms);
  return now;
}

/**
 * The chapters 002.5a's live run answered (its Outcome, "Gates, again"), checked
 * against the recorded document: Lyon UCe1b → the outline's « Zone UCe1 », to
 * the page before the next zone (UCe2, p. 145), `prefix`; Gordes A → printed
 * 43–50, PDF 44–51, from the contents page.
 */
function recordedChapters() {
  const lyon = documents.lyon;
  const at = lyon.outline.findIndex((entry) => /^Zone UCe1$/i.test(entry.title.trim()));
  assert.ok(at !== -1, 'the outline names « Zone UCe1 »');
  const from = lyon.outline[at].page;
  const to =
    lyon.outline.slice(at + 1).find((entry) => entry.depth <= lyon.outline[at].depth).page - 1;
  assert.deepEqual([from, to], [121, 144]);
  return {
    lyon: {
      meta: lyon.meta,
      zones: {
        UCe1b: {
          pages: [from, to],
          found: 'outline',
          match: 'prefix',
          title: lyon.outline[at].title
        },
        UCe1: {
          pages: [from, to],
          found: 'outline',
          match: 'exact',
          title: lyon.outline[at].title
        },
        UCe2: { pages: [145, 160], found: 'outline', match: 'exact', title: 'Zone UCe2' }
      }
    },
    gordes: {
      meta: documents.gordes.meta,
      zones: { A: { pages: [44, 51], found: 'contents', match: 'exact', title: 'ZONE A' } }
    }
  };
}

const json = (status, body, type = 'application/json') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
});

/**
 * The fake service: `GET v1/chapter` answered from the recorded document, as
 * 002.5a's route answers — `version_changed` for another `idurba` or `nomfic`,
 * `zone_chapter_not_found` for a zone it has no chapter for. `hold(zone)`
 * keeps that zone's answer until `release(zone)`; `answer(zone, response)`
 * replaces one. Every request is in `requests`.
 */
function fakeService(plot, { onRequest } = {}) {
  const { meta, zones } = recordedChapters()[plot];
  const requests = [];
  const held = new Map();
  const replaced = new Map();
  // Sprint 002.6b: the extraction routes are counted apart; by default nothing is cached.
  const extractionRequests = [];
  const handle = async (url, init) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/v1/extractions')) {
      extractionRequests.push({ url, method: init.method ?? 'GET' });
      return json(404, {
        current: { providerId: 'lmstudio', schemaVersion: 1, promptVersion: 2 },
        error: 'not_cached'
      });
    }
    requests.push({
      url,
      method: init.method ?? 'GET',
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams)
    });
    onRequest?.(parsed);
    const zone = parsed.searchParams.get('zone');
    if (held.has(zone)) await held.get(zone).promise;
    if (replaced.has(zone)) return replaced.get(zone)(url, init);
    if (parsed.pathname !== new URL('v1/chapter', BASE).pathname)
      return json(404, { error: 'not_found' });
    if (
      parsed.searchParams.get('idurba').toUpperCase() !== meta.idurba.toUpperCase() ||
      parsed.searchParams.get('nomfic') !== meta.nomfic ||
      parsed.searchParams.get('partition') !== meta.partition
    ) {
      return json(409, { inForce: [meta.idurba], error: 'version_changed' });
    }
    const chapter = zones[zone];
    if (chapter === undefined)
      return json(422, { codes: Object.keys(zones), error: 'zone_chapter_not_found' });
    return json(200, { ...chapter, documentPages: meta.pages });
  };
  return {
    requests,
    extractionRequests,
    handle,
    hold: (zone) => {
      let release;
      const promise = new Promise((resolve) => (release = resolve));
      held.set(zone, { promise, release });
    },
    release: (zone) => {
      held.get(zone)?.release();
      held.delete(zone);
    },
    answer: (zone, respond) => replaced.set(zone, respond)
  };
}

/** A `plugin-service` stub: `locate()` answers `location` (default the base URL) and counts its calls. */
function pluginServiceStub(...given) {
  // An explicit `undefined` is "no companion here", not the default.
  const location = given.length === 0 ? { baseUrl: BASE } : given[0];
  const stub = { calls: 0, locate: async () => ((stub.calls += 1), location) };
  return stub;
}

/** A wait that never elapses on its own: the 2 s pass only when a test calls `elapse()`. */
function manualWait() {
  const pending = new Set();
  const wait = (ms, abort) =>
    new Promise((resolve) => {
      const entry = { ms, resolve };
      pending.add(entry);
      abort.addEventListener('abort', () => (pending.delete(entry), resolve()), { once: true });
    });
  wait.elapse = () => {
    for (const entry of pending) entry.resolve();
    pending.clear();
  };
  wait.pending = pending;
  return wait;
}

/**
 * A reader for a plot: the recorded answers for the planning sources, the fake
 * service behind the base URL, and `pluginService` as given (a getter's
 * answer: `undefined` is a host without the token).
 */
function readerFor(plot, { pluginService, service, overrides = {}, wait, now, section } = {}) {
  const { site, conversions, answers } = plots[plot];
  const siteService = recordedSiteService(site, conversions);
  const recorded = recordedFetch(answers, overrides);
  const fake = service ?? (documents[plot] !== undefined ? fakeService(plot) : undefined);
  const fetch = (url, init = {}) =>
    String(url).startsWith(BASE) ? fake.handle(String(url), init) : recorded.fetch(url, init);
  const logs = [];
  const reader = createReader({
    fetch,
    site: () => siteService,
    now: now ?? clock(),
    log: (m) => logs.push(m),
    pluginService: () => pluginService,
    ...(wait === undefined ? { wait: manualWait() } : { wait }),
    ...(section === undefined ? {} : { packageData: () => section.service })
  });
  return { reader, site, recorded, fake, logs };
}

const read = (context, reason = 'site') =>
  context.reader.read(requestFor(context.site, reason), { signal: signal() });
const links = (report) => docBlocks(report).filter((b) => b.kind === 'link');
const notices = (report) =>
  docBlocks(report).filter((b) => b.kind === 'notice').map((b) => b.text.key);
const NOT_AVAILABLE = 'fr-urban-rules.notice.writtenRulesUnavailable';
// Since 002.6b a signal is deferred past the read (S5): a timer turn, then the I/O turn.
// A few timer turns: a deferred signal (S5) and the answers' promise chains both settle.
const settle = async () => {
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  await new Promise((resolve) => setImmediate(resolve));
};

/** Everything a read answers but the overview and the document's link: phase 1's rules, checks, views. */
const phaseOne = (report) => {
  const { overview, document, views, ...others } = report;
  // The Document view is the overview's old fields and link: left out with them (002.12).
  const rest = { ...others, views: views.filter((v) => v.id !== 'document') };
  const { href, ...doc } = document ?? {};
  // Since 002.6b the served report also carries the written rules' state (DEC-2).
  const written = (b) =>
    b.text?.key?.startsWith('fr-urban-rules.written.') ||
    (b.kind === 'actions' && b.actions.every((a) => a.id.startsWith('written-')));
  return {
    ...rest,
    sources: rest.sources.filter((s) => !s.id.startsWith('written-rules')),
    views: rest.views.map((v) => ({ ...v, blocks: v.blocks.filter((b) => !written(b)) })),
    document: doc
  };
};

// ── Criterion 1: no service, no change ────────────────────────────────────────

test('criterion 1: without the token (getOptional undefined) Lyon shows the notice, a link with no fragment, and phase 1 unchanged', async () => {
  const none = readerFor('lyon', { pluginService: undefined });
  const report = await read(none);
  assert.ok(notices(report).includes(NOT_AVAILABLE));
  const notice = docBlocks(report).find((b) => b.text?.key === NOT_AVAILABLE);
  assert.equal(notice.tone, 'info');
  assert.equal(report.document.href, GPU_FILE);
  assert.equal(links(report).length, 1);
  assert.equal(links(report)[0].href, GPU_FILE);
  assert.equal(links(report)[0].label.key, 'fr-urban-rules.link.regulation');
  assert.equal(links(report)[0].detail.key, 'fr-urban-rules.link.detail');
  assert.equal(none.fake.requests.length, 0);

  // `locate()` answering `undefined`: the same report.
  const absent = pluginServiceStub(undefined);
  const located = readerFor('lyon', { pluginService: absent });
  assert.deepEqual(await read(located), report);
  assert.equal(absent.calls, 1);
  assert.equal(located.fake.requests.length, 0);

  // Every rule, check, view and action is the one a served read answers.
  const served = await read(readerFor('lyon', { pluginService: pluginServiceStub() }));
  assert.deepEqual(phaseOne(report), phaseOne(served));
  assert.ok(served.document.href.endsWith('#page=121'));
  // The notice is the only block the overview gains; the link is the served one's minus its page.
  assert.deepEqual(
    docBlocks(report).filter((b) => b !== notice && b.kind !== 'link'),
    docBlocks(served).filter((b) => b.kind !== 'link')
  );
});

test('criterion 1: under the RNU nothing is located, asked or said', async () => {
  const stub = pluginServiceStub();
  const context = readerFor('brouennes', { pluginService: stub });
  const report = await read(context);
  assert.equal(report.regime.code, 'rnu');
  assert.equal(stub.calls, 0);
  assert.ok(!notices(report).includes(NOT_AVAILABLE));
  const without = await read(readerFor('brouennes', { pluginService: undefined }));
  assert.deepEqual(without, report);
});

// ── Criterion 2: Lyon, served in time ──────────────────────────────────────────

test('criterion 2: Lyon asks GET chapter once, never POST; the link ends #page=121; a design read sends nothing', async () => {
  const context = readerFor('lyon', { pluginService: pluginServiceStub() });
  const report = await read(context);
  assert.equal(context.fake.requests.length, 1);
  const [asked] = context.fake.requests;
  assert.equal(asked.method, 'GET');
  assert.equal(asked.path, '/plugins-api/com.archisimple.fr-urban-rules/v1/chapter');
  assert.deepEqual(asked.query, {
    partition: 'DU_200046977',
    idurba: '200046977_PLUI_20260326',
    nomfic: '200046977_reglement_20260326.pdf',
    zone: 'UCe1b'
  });
  assert.equal(report.document.href, `${GPU_FILE}#page=121`);
  assert.ok(!notices(report).includes(NOT_AVAILABLE));
  const [link] = links(report);
  assert.equal(link.href, `${GPU_FILE}#page=121`);
  // A prefix match names the chapter it opens (DEC-3).
  assert.deepEqual(link.label, {
    key: 'fr-urban-rules.link.regulationZoneChapter',
    params: { zone: 'UCe1b', chapter: 'Zone UCe1', page: 121 }
  });
  assert.deepEqual(link.detail, { key: 'fr-urban-rules.link.detailPage', params: { page: 121 } });

  const before = context.recorded.requests.length;
  const design = await read(context, 'design');
  assert.equal(context.fake.requests.length, 1);
  assert.equal(context.recorded.requests.length, before, 'a design read sends no request');
  assert.equal(design.document.href, `${GPU_FILE}#page=121`);
});

test('criterion 2: the cached report never holds the page — the href is built at each read', async () => {
  const stub = pluginServiceStub();
  const context = readerFor('lyon', { pluginService: stub });
  await read(context);
  // The same session, the service gone: the cached report answers, at its first page.
  stub.locate = async () => undefined;
  const design = await read(context, 'design');
  assert.equal(design.document.href, GPU_FILE);
  assert.ok(notices(design).includes(NOT_AVAILABLE));
});

test('Gordes A opens at p. 44, an exact match labelled with its page only', async () => {
  const context = readerFor('gordes', { pluginService: pluginServiceStub() });
  const report = await read(context);
  assert.equal(context.fake.requests.length, 1);
  assert.equal(context.fake.requests[0].query.zone, 'A');
  assert.ok(report.document.href.endsWith('#page=44'));
  assert.deepEqual(links(report)[0].label, {
    key: 'fr-urban-rules.link.regulationZonePage',
    params: { zone: 'A', page: 44 }
  });
});

// ── Criterion 3: Lyon, served late ─────────────────────────────────────────────

test('criterion 3: an answer after 2 s leaves the first page; the next read, any reason, opens at p. 121 with no request', async () => {
  const wait = manualWait();
  const service = fakeService('lyon', {
    // The 2 s pass while the service is still fetching the règlement.
    onRequest: () => setImmediate(() => wait.elapse())
  });
  service.hold('UCe1b');
  const context = readerFor('lyon', { pluginService: pluginServiceStub(), service, wait });
  const late = await read(context);
  assert.equal(late.document.href, GPU_FILE);
  assert.equal(links(late)[0].label.key, 'fr-urban-rules.link.regulation');
  assert.ok(!notices(late).includes(NOT_AVAILABLE), 'a slow service is not an absent one');
  assert.equal(service.requests.length, 1);

  service.release('UCe1b');
  await settle();
  for (const reason of ['source', 'design', 'site', 'action']) {
    const next = await read(context, reason);
    assert.equal(next.document.href, `${GPU_FILE}#page=121`, reason);
  }
  assert.equal(service.requests.length, 1);
});

test('criterion 3: a read superseded while it waits leaves the lookup running for the next one', async () => {
  const service = fakeService('lyon');
  service.hold('UCe1b');
  const context = readerFor('lyon', { pluginService: pluginServiceStub(), service });
  const first = read(context);
  while (service.requests.length === 0) await settle();
  const second = read(context, 'design');
  await assert.rejects(first);
  service.release('UCe1b');
  const report = await second;
  assert.equal(report.document.href, `${GPU_FILE}#page=121`);
  assert.equal(service.requests.length, 1, 'the second read joined the first lookup');
});

// ── Criterion 4: two zones, two lookups ────────────────────────────────────────

test('criterion 4: a plot on two zones asks two lookups, in parallel, and the overview carries two links', async () => {
  const zoneUrba = plots.lyon.answers.get('apicarto-zone-urba').body;
  const second = structuredClone(zoneUrba.features[0]);
  second.id = 'zone_urba.second';
  second.properties.libelle = 'UCe2';
  const twoZones = { ...zoneUrba, features: [...zoneUrba.features, second] };
  const service = fakeService('lyon');
  service.hold('UCe1b');
  service.hold('UCe2');
  const context = readerFor('lyon', {
    pluginService: pluginServiceStub(),
    service,
    overrides: { 'apicarto-zone-urba': async () => json(200, twoZones) }
  });
  const reading = read(context);
  // Both asked before either answers: in parallel.
  while (service.requests.length < 2) await settle();
  service.release('UCe2');
  service.release('UCe1b');
  const report = await reading;
  assert.deepEqual(
    service.requests.map((r) => r.query.zone),
    ['UCe1b', 'UCe2']
  );
  const shown = links(report);
  assert.equal(shown.length, 2);
  assert.deepEqual(
    shown.map((l) => [l.label.params.zone, l.href.split('#')[1]]),
    [
      ['UCe1b', 'page=121'],
      ['UCe2', 'page=145']
    ]
  );
  assert.equal(report.document.href, shown[0].href, "report.document.href is the first zone's");
});

test('criterion 4: one zone with a page and one without — each zone keeps its own answer', async () => {
  const zoneUrba = plots.lyon.answers.get('apicarto-zone-urba').body;
  const second = structuredClone(zoneUrba.features[0]);
  second.id = 'zone_urba.second';
  second.properties.libelle = 'ZZ';
  const context = readerFor('lyon', {
    pluginService: pluginServiceStub(),
    overrides: {
      'apicarto-zone-urba': async () =>
        json(200, { ...zoneUrba, features: [...zoneUrba.features, second] })
    }
  });
  const report = await read(context);
  const shown = links(report);
  assert.deepEqual(
    shown.map((l) => [l.label.key, l.href]),
    [
      ['fr-urban-rules.link.regulationZoneChapter', `${GPU_FILE}#page=121`],
      ['fr-urban-rules.link.regulationZone', GPU_FILE]
    ]
  );
});

// ── Criterion 5: forward-compatible reader ────────────────────────────────────

/** A recording section store, as rules.test.mjs's. */
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

test('criterion 5 (002.6a): a confirmation of an unknown prefix is read writable, listed from a newer version with no Forget, and kept whole by a Confirm', async () => {
  const written = {
    ruleKey: 'future:UCe1b:height_total:2.2.1.2',
    decision: 'confirmed_with_note',
    value: { kind: 'value', value: 22, unit: 'm' },
    passage: { start: 120, end: 180 },
    at: '2026-11-02T10:00:00.000Z'
  };
  const section = store({ schema: 1, confirmations: [written] });
  const context = readerFor('lyon', { pluginService: undefined, section });
  const report = await read(context);
  const rules = report.views.find((v) => v.id === 'rules');
  assert.ok(
    !rules.blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.newerSection'
    ),
    'writable'
  );
  const headings = rules.blocks.filter((b) => b.kind === 'heading').map((b) => b.text.key);
  assert.ok(headings.includes('fr-urban-rules.heading.newerVersionRules'));
  assert.ok(
    !headings.includes('fr-urban-rules.heading.noLongerInPlan'),
    'never "no longer in the plan"'
  );
  const at = rules.blocks.findIndex(
    (b) => b.kind === 'heading' && b.text.key === 'fr-urban-rules.heading.newerVersionRules'
  );
  const table = rules.blocks.slice(at).find((b) => b.kind === 'table');
  assert.equal(table.rows[0][0].text, written.ruleKey);
  const actions = rules.blocks.filter((b) => b.kind === 'actions').flatMap((b) => b.actions);
  assert.ok(!actions.some((a) => a.id === 'forget-entry'), 'no Forget');

  // A Confirm on another rule writes it back unchanged.
  const height = report.rules.find((r) => r.label.text === 'Hauteur Max-22');
  const confirm = actions.find((a) => a.id === 'confirm' && a.target?.ruleId === height.id);
  await context.reader.runAction(
    { actionId: 'confirm', target: confirm.target, site: context.site },
    { signal: signal() }
  );
  assert.equal(section.writes.length, 1);
  const next = section.writes[0].next;
  assert.deepEqual(next.confirmations[0], written);
  assert.equal(next.confirmations.length, 2);
  assert.equal(next.confirmations[1].ruleKey, height.id);
});

test('review S1: a forged Forget, Confirm, Does not apply, Edit value or Reopen on a newer entry writes nothing', async () => {
  const written = {
    ruleKey: 'future:UCe1b:height_total:2.2.1.2',
    decision: 'confirmed',
    at: '2026-11-02T10:00:00.000Z'
  };
  // A real stale entry of this version, on the same (unrecorded) plot: its Forget is offered.
  const stale = { ruleKey: 'rnu:gone', decision: 'confirmed', at: '2026-10-01T10:00:00.000Z' };
  const section = store({ schema: 1, confirmations: [written, stale] });
  const context = readerFor('lyon', { pluginService: undefined, section });
  const report = await read(context);
  const actions = report.views
    .find((v) => v.id === 'rules')
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions);
  const forgets = actions.filter((a) => a.id === 'forget-entry');
  assert.equal(forgets.length, 1, 'Forget is offered for the stale entry only');
  const realSubject = forgets[0].target.subjectId;
  assert.ok(realSubject.startsWith('c:rnu:gone@'));
  const act = (actionId, target, values) =>
    context.reader.runAction(
      { actionId, target, ...(values === undefined ? {} : { values }), site: context.site },
      { signal: signal() }
    );
  // The stale entry's real subject with the newer key in it: what a forged request would send.
  await act('forget-entry', { subjectId: realSubject.replace('rnu:gone', written.ruleKey) });
  const height = report.rules.find((r) => r.label.text === 'Hauteur Max-22');
  const confirm = actions.find((a) => a.id === 'confirm' && a.target?.ruleId === height.id);
  for (const actionId of ['confirm', 'not-applicable', 'reopen'])
    await act(actionId, { ...confirm.target, ruleId: written.ruleKey });
  await act('edit-value', { ...confirm.target, ruleId: written.ruleKey }, { value: 9 });
  assert.equal(section.writes.length, 0, 'nothing written');
  // The real Forget still works, and keeps the newer entry whole.
  await act('forget-entry', { subjectId: realSubject });
  assert.equal(section.writes.length, 1);
  assert.deepEqual(section.writes[0].next.confirmations, [written]);
});

test('criterion 5: the prefixes — rnu:, psc:, entered: are this version’s; any other prefix is a newer one; no prefix is not', () => {
  const { isNewerRuleKey } = __testing;
  for (const key of ['rnu:R.111-15', 'psc:39:00:abc', 'entered:0123456789ab'])
    assert.equal(isNewerRuleKey(key), false, key);
  // Since 002.6b `written:` is this version's own.
  for (const key of ['written:UCe1b:x']) assert.equal(isNewerRuleKey(key), false, key);
  for (const key of ['future:UCe1b:x', 'later-kind:1'])
    assert.equal(isNewerRuleKey(key), true, key);
  for (const key of ['no-prefix', '', 'R.111-15']) assert.equal(isNewerRuleKey(key), false, key);
  assert.equal(
    __testing.sectionOf({
      schema: 1,
      confirmations: [{ ruleKey: 'future:a', decision: 'anything' }]
    }).readOnly,
    false
  );
  assert.equal(
    __testing.sectionOf({ schema: 1, confirmations: [{ ruleKey: 'rnu:x', decision: 'anything' }] })
      .readOnly,
    true
  );
});

// ── Criterion 6: locate per read ───────────────────────────────────────────────

test('criterion 6: locate() is asked on each PLU(i) read, not once per session', async () => {
  const stub = pluginServiceStub();
  let resolved = 0;
  const context = readerFor('lyon', {
    pluginService: { locate: async (options) => ((resolved += 1), stub.locate(options)) }
  });
  await read(context);
  await read(context, 'design');
  await read(context, 'source');
  assert.equal(resolved, 3);
  assert.equal(context.fake.requests.length, 1);
});

test('criterion 6: the service found after a read without it — a container that started later is found', async () => {
  let location;
  const context = readerFor('lyon', { pluginService: { locate: async () => location } });
  const first = await read(context);
  assert.ok(notices(first).includes(NOT_AVAILABLE));
  location = { baseUrl: BASE };
  const second = await read(context, 'design');
  assert.equal(second.document.href, `${GPU_FILE}#page=121`);
});

// ── Errors, retries, shapes ────────────────────────────────────────────────────

test('an error is not a source failure: zone_chapter_not_found and version_changed open the first page and say why', async () => {
  for (const [code, status, detail] of [
    ['zone_chapter_not_found', 422, 'fr-urban-rules.link.detailZoneNotFound'],
    ['version_changed', 409, 'fr-urban-rules.link.detailVersionChanged'],
    ['chapter_too_large', 422, 'fr-urban-rules.link.detailPageUnknown'],
    ['rate_limited', 429, 'fr-urban-rules.link.detailPageUnknown'],
    // Review S2: a code naming an Object.prototype member is no detail key.
    ['constructor', 422, 'fr-urban-rules.link.detailPageUnknown'],
    ['__proto__', 422, 'fr-urban-rules.link.detailPageUnknown']
  ]) {
    const service = fakeService('lyon');
    service.answer('UCe1b', async () => json(status, { error: code }));
    const report = await read(readerFor('lyon', { pluginService: pluginServiceStub(), service }));
    assert.equal(report.document.href, GPU_FILE, code);
    const [link] = links(report);
    assert.equal(link.label.key, 'fr-urban-rules.link.regulation', code);
    assert.equal(link.detail.key, detail, code);
    assert.ok(
      report.sources.every((s) => s.state !== 'unavailable'),
      `${code}: no source failure`
    );
  }
});

test('a passing failure is asked again after 60 s, never before; a lasting one only on Refresh', async () => {
  const now = clock();
  const service = fakeService('lyon');
  service.answer('UCe1b', async () => json(429, { retryAfterSeconds: 30, error: 'rate_limited' }));
  const context = readerFor('lyon', { pluginService: pluginServiceStub(), service, now });
  await read(context);
  assert.equal(service.requests.length, 1);
  // The minute-per-call clock: the next read's few calls stay inside the 60 s window.
  now.jump(-10 * 60_000);
  await read(context, 'design');
  assert.equal(service.requests.length, 1, 'not before 60 s');
  now.jump(20 * 60_000);
  service.answer('UCe1b', async () =>
    json(422, { codes: ['UCe1'], error: 'zone_chapter_not_found' })
  );
  await read(context, 'design');
  assert.equal(service.requests.length, 2, 'asked again once due');
  now.jump(60 * 60_000);
  await read(context, 'design');
  assert.equal(service.requests.length, 2, 'a lasting answer is kept');
  await read(context, 'refresh');
  assert.equal(service.requests.length, 3, 'Refresh asks again');
});

test('an answer that is not JSON, a 200 of another shape and a network failure are "the page is not known"', async () => {
  for (const respond of [
    async () => json(200, '<!doctype html><title>index</title>', 'text/html'),
    // Review NIT: a 200 with the right body but no Content-Type is not the route's.
    async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({ pages: [121, 144], found: 'outline', match: 'exact', documentPages: 803 })
    }),
    async () => json(502, '<html>Bad Gateway</html>', 'text/html'),
    async () => json(200, { pages: [121, 144], found: 'outline', match: 'fuzzy' }),
    async () => {
      throw new TypeError('Failed to fetch');
    }
  ]) {
    const service = fakeService('lyon');
    service.answer('UCe1b', respond);
    const report = await read(readerFor('lyon', { pluginService: pluginServiceStub(), service }));
    assert.equal(report.document.href, GPU_FILE);
    assert.equal(links(report)[0].detail.key, 'fr-urban-rules.link.detailPageUnknown');
  }
});

test('checkedChapter: only two integer pages in order, within the document, and the known found/match', () => {
  const { checkedChapter } = __testing;
  const good = {
    pages: [121, 144],
    found: 'outline',
    match: 'prefix',
    title: 'Zone UCe1',
    documentPages: 803
  };
  assert.deepEqual(checkedChapter(good), {
    pages: [121, 144],
    found: 'outline',
    match: 'prefix',
    title: 'Zone UCe1'
  });
  for (const bad of [
    { ...good, pages: ['121', 144] },
    { ...good, pages: [121.5, 144] },
    { ...good, pages: [0, 144] },
    { ...good, pages: [144, 121] },
    { ...good, pages: [121] },
    { ...good, documentPages: 100 },
    // Review S3: the page count is required, a safe integer, at most 2,000.
    { ...good, documentPages: undefined },
    { ...good, documentPages: 2001 },
    { ...good, documentPages: 2 ** 53 },
    { ...good, documentPages: '803' },
    { ...good, found: 'guess' },
    { ...good, match: 'fuzzy' },
    { ...good, title: 12 },
    [121, 144],
    null
  ]) {
    assert.equal(checkedChapter(bad), undefined, JSON.stringify(bad));
  }
  assert.equal(checkedChapter({ ...good, title: 'x'.repeat(500) }).title.length <= 80, true);
});

test('checkedLocation: an absolute http(s) base ending in `/`, nothing else', () => {
  const { checkedLocation } = __testing;
  assert.deepEqual(checkedLocation({ baseUrl: BASE }), { baseUrl: BASE });
  for (const bad of [
    undefined,
    {},
    { baseUrl: BASE.slice(0, -1) },
    { baseUrl: 'javascript:alert(1)/' },
    { baseUrl: '/plugins-api/x/' },
    { baseUrl: 42 }
  ]) {
    assert.equal(checkedLocation(bad), undefined, JSON.stringify(bad));
  }
  // Review NIT: in a page, the base must be the page's own origin.
  assert.deepEqual(checkedLocation({ baseUrl: BASE }, { origin: 'https://editor.example' }), {
    baseUrl: BASE
  });
  assert.equal(checkedLocation({ baseUrl: BASE }, { origin: 'https://other.example' }), undefined);
});

test('chapterLookups: one per zone with a nomfic, keyed by upper(idurba), inputs checked by 002.5a’s patterns', () => {
  const { chapterLookups } = __testing;
  const zone = { libelle: 'UCe1b', idurba: '200046977_PLUI_20260326', nomfic: 'r.pdf' };
  const lookups = chapterLookups('DU_200046977', [
    zone,
    { ...zone, idurba: '200046977_PLUi_20260326' },
    { ...zone, libelle: 'UCe2' },
    { ...zone, libelle: 'X', nomfic: undefined },
    { ...zone, libelle: 'Y', nomfic: '../etc/passwd' }
  ]);
  assert.deepEqual(
    lookups.map((l) => l.key),
    ['200046977_PLUI_20260326/r.pdf/UCe1b', '200046977_PLUI_20260326/r.pdf/UCe2']
  );
  assert.deepEqual(chapterLookups('not-a-partition', [zone]), []);
});

test('dispose aborts a lookup in flight and forgets the session map', async () => {
  const service = fakeService('lyon');
  // Never answers; ends only when its signal aborts, as a browser's fetch does.
  let aborted = false;
  service.answer(
    'UCe1b',
    (url, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(init.signal.reason);
        })
      )
  );
  const wait = manualWait();
  const context = readerFor('lyon', { pluginService: pluginServiceStub(), service, wait });
  const reading = read(context);
  while (service.requests.length === 0) await settle();
  context.reader.dispose();
  await assert.rejects(reading);
  await settle();
  assert.equal(aborted, true, 'the lookup was aborted');
  // Forgotten: the next read asks again.
  service.answer('UCe1b', async () =>
    json(200, { pages: [121, 144], found: 'outline', match: 'exact', documentPages: 803 })
  );
  const report = await read(context);
  assert.equal(service.requests.length, 2);
  assert.equal(report.document.href, `${GPU_FILE}#page=121`);
});

// ── Review fixes and decisions (2026-10-20) ─────────────────────────────────────

/** A clock that stays where a test puts it. */
function heldClock(start = Date.UTC(2026, 9, 20, 8, 0)) {
  let at = start;
  const now = () => new Date(at);
  now.advance = (ms) => (at += ms);
  return now;
}

/** Lyon's zone layer with more zones after (or before) UCe1b. */
function lyonZones(libelles, { before = false } = {}) {
  const zoneUrba = plots.lyon.answers.get('apicarto-zone-urba').body;
  const extra = libelles.map((libelle, i) => {
    const feature = structuredClone(zoneUrba.features[0]);
    feature.id = `zone_urba.extra${i}`;
    feature.properties.libelle = libelle;
    return feature;
  });
  const features = before ? [...extra, ...zoneUrba.features] : [...zoneUrba.features, ...extra];
  return { 'apicarto-zone-urba': async () => json(200, { ...zoneUrba, features }) };
}

test('decision Q1: a late chapter fires onDidChange once; the source read finds the page with no request', async () => {
  const wait = manualWait();
  const service = fakeService('lyon', { onRequest: () => setImmediate(() => wait.elapse()) });
  service.hold('UCe1b');
  const context = readerFor('lyon', { pluginService: pluginServiceStub(), service, wait });
  let fired = 0;
  const subscription = context.reader.onDidChange(() => (fired += 1));
  const late = await read(context);
  assert.equal(late.document.href, GPU_FILE);
  assert.equal(fired, 0, 'nothing has landed yet');
  service.release('UCe1b');
  await settle();
  assert.equal(fired, 1, 'the late answer fires once');
  const source = await read(context, 'source');
  assert.equal(source.document.href, `${GPU_FILE}#page=121`);
  assert.equal(service.requests.length, 1);
  await read(context, 'design');
  await settle();
  assert.equal(fired, 1, 'an answer a read applied never fires again');
  subscription.dispose();
});

test('decision Q1: an answer within the wait fires nothing', async () => {
  const context = readerFor('lyon', { pluginService: pluginServiceStub() });
  let fired = 0;
  context.reader.onDidChange(() => (fired += 1));
  const report = await read(context);
  await settle();
  assert.equal(report.document.href, `${GPU_FILE}#page=121`);
  assert.equal(fired, 0);
});

test('decision Q1: after dispose, a lookup that still answers fires no listener', async () => {
  const wait = manualWait();
  // Ignores its signal: answers after dispose anyway.
  const service = fakeService('lyon', { onRequest: () => setImmediate(() => wait.elapse()) });
  service.hold('UCe1b');
  const context = readerFor('lyon', { pluginService: pluginServiceStub(), service, wait });
  let fired = 0;
  context.reader.onDidChange(() => (fired += 1));
  await read(context);
  context.reader.dispose();
  service.release('UCe1b');
  await settle();
  assert.equal(fired, 0);
});

test('decision Q2: document.href is the first zone with a page, even when an unpaged zone comes first', async () => {
  const context = readerFor('lyon', {
    pluginService: pluginServiceStub(),
    overrides: lyonZones(['ZZ'], { before: true })
  });
  const report = await read(context);
  assert.deepEqual(
    links(report).map((l) => [l.label.params?.zone, l.href]),
    [
      ['ZZ', GPU_FILE],
      ['UCe1b', `${GPU_FILE}#page=121`]
    ]
  );
  assert.equal(report.document.href, `${GPU_FILE}#page=121`);
});

test('review S4: Refresh keeps the page until a new answer lands, without the 2 s wait; a passing failure keeps it', async () => {
  const now = heldClock();
  const service = fakeService('lyon');
  // The wait never elapses: a read that waited would hang.
  const context = readerFor('lyon', { pluginService: pluginServiceStub(), service, now });
  assert.equal((await read(context)).document.href, `${GPU_FILE}#page=121`);
  service.hold('UCe1b');
  const refreshed = await read(context, 'refresh');
  assert.equal(service.requests.length, 2, 'Refresh asks again');
  assert.equal(refreshed.document.href, `${GPU_FILE}#page=121`, 'the held page, at once');
  service.answer('UCe1b', async () => json(502, { error: 'source_unavailable' }));
  service.release('UCe1b');
  await settle();
  const after = await read(context, 'design');
  assert.equal(after.document.href, `${GPU_FILE}#page=121`, 'a passing failure keeps the page');
  assert.equal(links(after)[0].detail.key, 'fr-urban-rules.link.detailPage');
  // An answer about the document replaces it.
  service.answer('UCe1b', async () => json(422, { error: 'zone_chapter_not_found' }));
  await read(context, 'refresh');
  await settle();
  const gone = await read(context, 'design');
  assert.equal(gone.document.href, GPU_FILE);
  assert.equal(links(gone)[0].detail.key, 'fr-urban-rules.link.detailZoneNotFound');
});

test('decision Q3: source_* waits five minutes, busy and internal_error one, before asking again', async () => {
  for (const [code, status, ms] of [
    ['source_unavailable', 502, 5 * 60_000],
    ['source_refused', 502, 5 * 60_000],
    ['busy', 503, 60_000],
    ['internal_error', 500, 60_000]
  ]) {
    const now = heldClock();
    const service = fakeService('lyon');
    service.answer('UCe1b', async () => json(status, { error: code }));
    const context = readerFor('lyon', { pluginService: pluginServiceStub(), service, now });
    await read(context);
    now.advance(ms - 1);
    await read(context, 'design');
    assert.equal(service.requests.length, 1, `${code}: not before ${ms} ms`);
    now.advance(1);
    await read(context, 'design');
    assert.equal(service.requests.length, 2, `${code}: asked again at ${ms} ms`);
  }
});

test('decision Q3: rate_limited waits its Retry-After, at least a minute', async () => {
  const now = heldClock();
  const service = fakeService('lyon');
  service.answer('UCe1b', async () => json(429, { retryAfterSeconds: 600, error: 'rate_limited' }));
  const context = readerFor('lyon', { pluginService: pluginServiceStub(), service, now });
  await read(context);
  now.advance(599_000);
  await read(context, 'design');
  assert.equal(service.requests.length, 1);
  now.advance(1000);
  await read(context, 'design');
  assert.equal(service.requests.length, 2);
});

test('review NIT: a locate() that throws or answers a malformed base reads as no service', async () => {
  for (const pluginService of [
    {
      locate: async () => {
        throw new Error('boom');
      }
    },
    { locate: async () => ({ baseUrl: 'https://editor.example/plugins-api/x' }) },
    { locate: async () => 'https://editor.example/' },
    {}
  ]) {
    const context = readerFor('lyon', { pluginService });
    const report = await read(context);
    assert.ok(notices(report).includes(NOT_AVAILABLE));
    assert.equal(report.document.href, GPU_FILE);
    assert.equal(context.fake.requests.length, 0);
  }
});

test('review NIT: an entered rule’s page is not doubled by the zone’s page', async () => {
  const section = store({
    schema: 1,
    entered: [
      {
        key: 'entered:cccccccccccc',
        kind: 'height_total',
        statement: 'limit',
        limit: { kind: 'value', value: 12, unit: 'm' },
        source: { document: 'Règlement PLUi', page: 130 },
        at: '2026-10-19T10:00:00Z'
      }
    ]
  });
  const report = await read(readerFor('lyon', { pluginService: pluginServiceStub(), section }));
  assert.equal(report.document.href, `${GPU_FILE}#page=121`);
  const rule = report.rules.find((r) => r.id === 'entered:cccccccccccc');
  assert.equal(rule.citation.href, `${GPU_FILE}#page=130`);
});

test('review NIT: the session map keeps at most 200 lookups', async () => {
  const zones = Array.from({ length: 200 }, (_, i) => `Z${i}`);
  const context = readerFor('lyon', {
    pluginService: pluginServiceStub(),
    overrides: lyonZones(zones)
  });
  await read(context);
  assert.equal(context.fake.requests.length, 201);
  assert.equal(context.reader.chapterCount(), 200);
});

test('review NIT: activate wires getOptional(plugin-service) on each read and onDidChange on the source', async () => {
  const { site, conversions, answers } = plots.lyon;
  const siteService = recordedSiteService(site, conversions);
  const service = fakeService('lyon');
  const recorded = recordedFetch(answers);
  const asked = [];
  let source;
  const context = {
    services: {
      get: (token) => {
        assert.equal(token.name, 'regulations');
        return {
          registerRegulationSource: (registered) => {
            source = registered;
            return { dispose: () => {} };
          }
        };
      },
      getOptional: (token) => {
        asked.push(token.name);
        if (token.name === 'site') return siteService;
        if (token.name === 'plugin-service') return pluginServiceStub();
        return undefined;
      }
    },
    logger: { debug: () => {}, info: () => {}, error: () => {} },
    subscriptions: { add: () => {} }
  };
  const previous = globalThis.fetch;
  globalThis.fetch = (url, init = {}) =>
    String(url).startsWith(BASE) ? service.handle(String(url), init) : recorded.fetch(url, init);
  try {
    activate(context);
    assert.equal(typeof source.onDidChange, 'function');
    const subscription = source.onDidChange(() => {});
    assert.equal(typeof subscription.dispose, 'function');
    subscription.dispose();
    const before = asked.filter((n) => n === 'plugin-service').length;
    const report = await source.read(requestFor(site), { signal: signal() });
    await source.read(requestFor(site, 'design'), { signal: signal() });
    assert.equal(asked.filter((n) => n === 'plugin-service').length - before, 2);
    assert.equal(report.document.href, `${GPU_FILE}#page=121`);
  } finally {
    deactivate();
    globalThis.fetch = previous;
  }
});
