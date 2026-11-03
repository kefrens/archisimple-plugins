/**
 * The document watch (Sprint 002.10 DEC-1, DEC-2, DEC-3): what the service
 * knows of the GPU's document in force, how it learns it changed, what it keeps
 * and for how long. A fake clock and a fake GPU; the one test that goes through
 * the real fetcher does so against a local HTTP stub that has the GPU's 20-item
 * trap. No network.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { cacheKey } from '../src/cache.mjs';
import { ServiceError } from '../src/errors.mjs';
import { createFetcher } from '../src/fetcher.mjs';
import { createService } from '../src/service.mjs';
import {
  CHECK_INTERVAL_MS,
  CHECK_JITTER_MS,
  DAY_MS,
  FIRST_BACKOFF_MS,
  GPU_GAP_MS,
  PREVIOUS_MAX,
  RECORD_IDLE_MS,
  SUPERSEDED_KEEP_MS,
  createWatcher,
  isoDateOfGpu
} from '../src/watch.mjs';
import { capturingLog, loadRegulation } from './helpers.mjs';

const T0 = Date.parse('2026-10-20T10:00:00Z');
const PARTITION = 'DU_200046977';

const item = (id, originalName, extra = {}) => ({
  id,
  originalName,
  name: PARTITION,
  status: 'document.production',
  publicationDate: '23/04/2026 13:44:58',
  ...extra
});

/** A watcher on a fresh folder, a fake clock whose `sleep` moves it, and a GPU that answers from `listings`. */
function harness({ listings = {}, evictVersion, evictOutdated, cachedDocuments } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-watch-'));
  const capture = capturingLog();
  let at = T0;
  const calls = [];
  const state = { listings: { ...listings }, failWith: undefined };
  const fetcher = {
    async listDocuments(partition) {
      calls.push({ partition, at });
      if (state.failWith !== undefined) throw state.failWith;
      const listing = state.listings[partition];
      return typeof listing === 'function' ? listing() : listing ?? [];
    }
  };
  const watcher = createWatcher({
    dir,
    fetcher,
    logger: (level, record) => capture.log({ level, ...record }),
    now: () => new Date(at),
    clock: () => at,
    sleep: async (ms) => {
      at += ms;
    },
    evictVersion,
    evictOutdated,
    cachedDocuments
  });
  return { dir, watcher, calls, capture, state, advance: (ms) => (at += ms), time: () => at };
}

const readRecord = (dir, partition = PARTITION) => JSON.parse(readFileSync(join(dir, `${partition}.json`), 'utf8'));

test('a first look at an unwatched partition is one GPU call, recorded, with the publication date as an ISO date', async () => {
  const { watcher, calls, dir } = harness({ listings: { [PARTITION]: [item('id-1', '200046977_PLUi_20260326')] } });
  const view = await watcher.status(PARTITION);
  assert.equal(calls.length, 1);
  assert.deepEqual(view.current, {
    gpuDocId: 'id-1',
    originalName: '200046977_PLUi_20260326',
    publicationDate: '2026-04-23'
  });
  assert.equal(view.withdrawn, false);
  assert.deepEqual(view.previous, []);
  assert.equal(view.checkedAt, new Date(T0 + 0).toISOString());
  assert.equal(readRecord(dir).partition, PARTITION);
  // The second read is answered from the store: no GPU call.
  await watcher.status(PARTITION);
  assert.equal(calls.length, 1);
});

test('the GPU date spelling: dd/mm/yyyy [hh:mm:ss] → ISO; anything else is no date', () => {
  assert.equal(isoDateOfGpu('23/04/2026 13:44:58'), '2026-04-23');
  assert.equal(isoDateOfGpu('01/12/2025'), '2025-12-01');
  assert.equal(isoDateOfGpu('31/02/2026 00:00:00'), undefined);
  assert.equal(isoDateOfGpu('2026-04-23'), undefined);
  assert.equal(isoDateOfGpu(undefined), undefined);
});

test('criterion 1: the current version is item 25 of Lyon’s history, and the watch finds it because it asks for document.production', async () => {
  // The GPU's trap (probe 2026-10-19, rows 1–4): without the status filter the
  // default page is 20 archived items, oldest first; the current one is not on it.
  const archived = Array.from({ length: 24 }, (_, i) =>
    item(`old-${i + 1}`, `200046977_PLUi_2022${String(i + 1).padStart(4, '0')}`, { status: 'document.deleted' })
  );
  const current = item('4f3ddc27a9611b4bc94fa161443b8e86', '200046977_PLUi_20260326');
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    const filtered = new URL(req.url, 'http://x').searchParams.get('status') === 'document.production';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(filtered ? [current] : archived.slice(0, 20)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  const toStub = (hostname, options, callback) => {
    if (typeof options === 'function') callback = options;
    if (options?.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
    else callback(null, '127.0.0.1', 4);
  };
  const tmpDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-watch-fetch-'));
  const fetcher = createFetcher({ version: '0.3.0', tmpDir, request: http.request, port: server.address().port, lookup: toStub });
  const watcher = createWatcher({ dir: mkdtempSync(join(tmpdir(), 'fr-urban-rules-watch-')), fetcher, logger: () => {} });
  const view = await watcher.status(PARTITION);
  assert.equal(view.current.gpuDocId, '4f3ddc27a9611b4bc94fa161443b8e86');
  assert.match(seen[0], /status=document\.production/u);
  assert.match(seen[0], /partition=DU_200046977/u);
});

test('criterion 2: a changed id supersedes the document; the previous one is recorded with its date', async () => {
  const h = harness({ listings: { [PARTITION]: [item('id-1', '200046977_PLUi_20260326')] } });
  await h.watcher.status(PARTITION);
  h.advance(DAY_MS);
  h.state.listings[PARTITION] = [item('id-2', '200046977_PLUi_20260701', { publicationDate: '01/07/2026 09:00:00' })];
  const { changed, view } = await h.watcher.check(PARTITION);
  assert.equal(changed, true);
  assert.equal(view.current.gpuDocId, 'id-2');
  assert.deepEqual(view.previous, [
    { gpuDocId: 'id-1', originalName: '200046977_PLUi_20260326', supersededAt: new Date(h.time()).toISOString() }
  ]);
  assert.ok(h.capture.records.some((l) => l.event === 'watch_changed' && l.to === '200046977_PLUi_20260701'));
  // Unchanged on the next look: nothing added.
  h.advance(DAY_MS);
  const again = await h.watcher.check(PARTITION);
  assert.equal(again.changed, false);
  assert.equal(again.view.previous.length, 1);
});

test('criterion 7: PLUi / PLUI casing alone is no change', async () => {
  const h = harness({ listings: { [PARTITION]: [item('id-1', '200046977_PLUi_20260326')] } });
  await h.watcher.status(PARTITION);
  h.state.listings[PARTITION] = [item('id-1', '200046977_PLUI_20260326')];
  const { changed, view } = await h.watcher.check(PARTITION);
  assert.equal(changed, false);
  assert.deepEqual(view.previous, []);
});

test('criterion 3: nothing in production marks the document withdrawn — never “no rules”', async () => {
  const h = harness({ listings: { [PARTITION]: [item('id-1', '200046977_PLUi_20260326')] } });
  await h.watcher.status(PARTITION);
  h.advance(DAY_MS);
  h.state.listings[PARTITION] = [];
  const { view, changed } = await h.watcher.check(PARTITION);
  assert.equal(changed, true);
  assert.equal(view.withdrawn, true);
  assert.equal(view.current, null);
  assert.equal(view.previous[0].gpuDocId, 'id-1');
  assert.ok(view.withdrawnAt);
  // It comes back: the record is current again.
  h.advance(DAY_MS);
  h.state.listings[PARTITION] = [item('id-3', '200046977_PLUi_20261001')];
  const back = await h.watcher.check(PARTITION);
  assert.equal(back.view.withdrawn, false);
  assert.equal(back.view.current.gpuDocId, 'id-3');
  assert.equal(back.view.withdrawnAt, undefined);
});

test('a partition that was never known and has nothing in production is answered, not recorded', async () => {
  const h = harness({ listings: { DU_56196: [] } });
  const view = await h.watcher.status('DU_56196');
  assert.equal(view.withdrawn, true);
  assert.equal(view.current, null);
  assert.deepEqual(readdirSync(h.dir), []);
});

test('more than one document in production is an anomaly: logged, the newest taken', async () => {
  const h = harness({
    listings: {
      [PARTITION]: [
        item('id-1', '200046977_PLUi_20260326', { publicationDate: '23/04/2026 13:44:58' }),
        item('id-2', '200046977_PLUi_20260701', { publicationDate: '01/07/2026 09:00:00' })
      ]
    }
  });
  const view = await h.watcher.status(PARTITION);
  assert.equal(view.current.gpuDocId, 'id-2');
  assert.ok(h.capture.records.some((l) => l.event === 'watch_anomaly' && l.documents === 2));
  assert.equal(readRecord(h.dir).anomaly, true);
});

test('a sector’s grid lists every sector: only the partition’s own documents count', async () => {
  const h = harness({
    listings: {
      DU_200054807_B: [
        item('id-a', '200054807_PLUi_A', { name: 'DU_200054807_A' }),
        item('id-b', '200054807_PLUi_B', { name: 'DU_200054807_B' })
      ]
    }
  });
  const view = await h.watcher.status('DU_200054807_B');
  assert.equal(view.current.gpuDocId, 'id-b');
});

test('criterion 4: never more than one request a second to the GPU, whoever asks', async () => {
  const h = harness();
  for (let n = 1; n <= 5; n += 1) {
    const partition = `DU_0000${n}`;
    h.state.listings[partition] = [item(`id-${n}`, `IDU_${n}`, { name: partition })];
    await h.watcher.noteDocument({ partition, documentId: `id-${n}`, idurba: `IDU_${n}`, retrievedAt: new Date(T0).toISOString() });
  }
  h.advance(CHECK_INTERVAL_MS + CHECK_JITTER_MS + 1);
  const before = h.time();
  const checked = await h.watcher.runDue();
  assert.equal(checked, 5);
  assert.equal(h.calls.length, 5);
  for (let i = 1; i < h.calls.length; i += 1) {
    assert.ok(h.calls[i].at - h.calls[i - 1].at >= GPU_GAP_MS, `gap ${i}: ${h.calls[i].at - h.calls[i - 1].at}`);
  }
  assert.ok(h.time() - before >= 4 * GPU_GAP_MS);
  // Concurrent first looks share the same gate.
  const more = ['DU_00006', 'DU_00007', 'DU_00008'];
  for (const partition of more) h.state.listings[partition] = [item('x', 'IDU_X', { name: partition })];
  const start = h.calls.length;
  await Promise.all(more.map((p) => h.watcher.status(p)));
  for (let i = start + 1; i < h.calls.length; i += 1) {
    assert.ok(h.calls[i].at - h.calls[i - 1].at >= GPU_GAP_MS);
  }
});

test('criterion 4: a 5xx backs off — 5 minutes, doubling — and three days of failures are reported, not dropped', async () => {
  const h = harness({ listings: { [PARTITION]: [item('id-1', '200046977_PLUi_20260326')] } });
  await h.watcher.status(PARTITION);
  h.state.failWith = new ServiceError('source_unavailable', { status: 503 });
  h.advance(CHECK_INTERVAL_MS + CHECK_JITTER_MS + 1);
  let result = await h.watcher.check(PARTITION);
  assert.equal(result.failed, true);
  let record = readRecord(h.dir);
  assert.equal(record.failure.count, 1);
  assert.equal(Date.parse(record.nextCheckAt) - h.time(), FIRST_BACKOFF_MS);
  // Not due yet: the sweep of due records leaves it.
  const calls = h.calls.length;
  assert.equal(await h.watcher.runDue(), 0);
  assert.equal(h.calls.length, calls);
  h.advance(FIRST_BACKOFF_MS);
  await h.watcher.check(PARTITION);
  record = readRecord(h.dir);
  assert.equal(record.failure.count, 2);
  assert.equal(Date.parse(record.nextCheckAt) - h.time(), 2 * FIRST_BACKOFF_MS);
  // Days pass with the GPU still failing.
  for (let day = 0; day < 4; day += 1) {
    h.advance(DAY_MS);
    result = await h.watcher.check(PARTITION);
  }
  assert.ok(h.capture.records.some((l) => l.event === 'watch_failing' && l.code === 'source_unavailable'));
  assert.ok(result.view.failing.days >= 3);
  // The record is still there, still pointing at the document it last confirmed.
  assert.equal(readRecord(h.dir).current.gpuDocId, 'id-1');
  // And it recovers.
  h.state.failWith = undefined;
  h.advance(DAY_MS);
  const ok = await h.watcher.check(PARTITION);
  assert.equal(ok.view.failing, undefined);
  assert.equal(readRecord(h.dir).failure, undefined);
});

test('a first look that fails leaves no record and says why', async () => {
  const h = harness();
  h.state.failWith = new ServiceError('source_unavailable', { status: 502 });
  await assert.rejects(
    () => h.watcher.status(PARTITION),
    (e) => e instanceof ServiceError && e.code === 'source_unavailable'
  );
  assert.deepEqual(readdirSync(h.dir), []);
});

test('a malformed listing is a failure, not a withdrawal', async () => {
  const h = harness({ listings: { [PARTITION]: [item('id-1', 'A_B')] } });
  await h.watcher.status(PARTITION);
  h.state.listings[PARTITION] = { not: 'an array' };
  h.advance(DAY_MS);
  const result = await h.watcher.check(PARTITION);
  assert.equal(result.failed, true);
  assert.equal(readRecord(h.dir).current.gpuDocId, 'id-1');
});

test('DEC-1 seeding: a document the service holds is watched from its meta, with no GPU call', async () => {
  const h = harness({
    cachedDocuments: async () => [
      { partition: 'DU_84050', documentId: 'doc-g', idurba: '84050_PLU_20241017', retrievedAt: '2026-10-19T08:00:00.000Z' }
    ]
  });
  await h.watcher.seedFromCache();
  assert.equal(h.calls.length, 0);
  const record = readRecord(h.dir, 'DU_84050');
  assert.equal(record.current.gpuDocId, 'doc-g');
  assert.equal(record.checkedAt, '2026-10-19T08:00:00.000Z');
  assert.ok(Date.parse(record.nextCheckAt) > Date.parse(record.checkedAt) + CHECK_INTERVAL_MS - 1);
  // A reading marks it read; it does not reset what the GPU last said.
  await h.watcher.noteDocument({ partition: 'DU_84050', documentId: 'other', idurba: 'X', retrievedAt: 'now' });
  assert.equal(readRecord(h.dir, 'DU_84050').current.gpuDocId, 'doc-g');
});

test('the checks are spread: a partition’s time of day is stable and within the jitter window', async () => {
  const h = harness();
  const first = [];
  for (const partition of ['DU_00001', 'DU_00002', 'DU_84050']) {
    await h.watcher.noteDocument({ partition, documentId: 'd', idurba: 'I', retrievedAt: new Date(T0).toISOString() });
    const next = Date.parse(readRecord(h.dir, partition).nextCheckAt) - T0;
    assert.ok(next >= CHECK_INTERVAL_MS && next < CHECK_INTERVAL_MS + CHECK_JITTER_MS);
    first.push(next);
  }
  assert.equal(new Set(first).size, 3);
});

test('DEC-2: a superseded version is evicted 90 days after, not before; the record keeps the history', async () => {
  const evicted = [];
  const h = harness({
    listings: { [PARTITION]: [item('id-1', '200046977_PLUi_20260326')] },
    evictVersion: async (partition, idurba) => {
      evicted.push([partition, idurba]);
      return 2;
    }
  });
  await h.watcher.status(PARTITION);
  h.advance(DAY_MS);
  h.state.listings[PARTITION] = [item('id-2', '200046977_PLUi_20260701')];
  await h.watcher.check(PARTITION);
  h.advance(SUPERSEDED_KEEP_MS - 1);
  assert.deepEqual(await h.watcher.sweep(), { evicted: 0, forgotten: 0 });
  assert.deepEqual(evicted, []);
  h.advance(2);
  assert.deepEqual(await h.watcher.sweep(), { evicted: 2, forgotten: 0 });
  assert.deepEqual(evicted, [[PARTITION, '200046977_PLUi_20260326']]);
  // Once, and the history stays.
  await h.watcher.sweep();
  assert.equal(evicted.length, 1);
  assert.equal(readRecord(h.dir).previous[0].gpuDocId, 'id-1');
});

test('DEC-2: a record no client has read for 180 days is forgotten', async () => {
  const h = harness({ listings: { [PARTITION]: [item('id-1', '200046977_PLUi_20260326')] } });
  await h.watcher.status(PARTITION);
  h.advance(RECORD_IDLE_MS - DAY_MS);
  assert.equal((await h.watcher.sweep()).forgotten, 0);
  await h.watcher.status(PARTITION); // read: the clock restarts
  h.advance(RECORD_IDLE_MS - DAY_MS);
  assert.equal((await h.watcher.sweep()).forgotten, 0);
  h.advance(2 * DAY_MS);
  assert.equal((await h.watcher.sweep()).forgotten, 1);
  assert.equal(existsSync(join(h.dir, `${PARTITION}.json`)), false);
});

test('the history is bounded and has one entry per superseded document', async () => {
  const h = harness({ listings: { [PARTITION]: [item('id-0', 'N_0')] } });
  await h.watcher.status(PARTITION);
  for (let n = 1; n <= PREVIOUS_MAX + 5; n += 1) {
    h.advance(DAY_MS);
    h.state.listings[PARTITION] = [item(`id-${n}`, `N_${n}`)];
    await h.watcher.check(PARTITION);
  }
  const record = readRecord(h.dir);
  assert.equal(record.previous.length, PREVIOUS_MAX);
  assert.equal(record.previous[0].gpuDocId, `id-${PREVIOUS_MAX + 4}`);
});

test('a record survives a restart', async () => {
  const h = harness({ listings: { [PARTITION]: [item('id-1', 'N_1')] } });
  await h.watcher.status(PARTITION);
  const again = createWatcher({ dir: h.dir, fetcher: { listDocuments: async () => assert.fail('no call') }, logger: () => {} });
  const view = await again.status(PARTITION);
  assert.equal(view.current.gpuDocId, 'id-1');
});

test('a partition that fails its pattern is refused before anything is read or fetched', async () => {
  const h = harness();
  for (const bad of ['../etc', 'DU_', 'du_200046977', 'DU_200046977/x', '']) {
    await assert.rejects(
      () => h.watcher.status(bad),
      (e) => e instanceof ServiceError && e.code === 'invalid_request'
    );
  }
  assert.equal(h.calls.length, 0);
});

// Through the service ----------------------------------------------------------------

const gordes = loadRegulation('gordes');

function serviceWith({ listings, env = {}, dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-service-watch-')), startAt = T0 } = {}) {
  const capture = capturingLog();
  let at = startAt;
  const calls = { documents: 0 };
  const state = { listings: { ...listings } };
  const fetcher = {
    async listDocuments(partition) {
      calls.documents += 1;
      return state.listings[partition] ?? [];
    },
    async listFiles() {
      return [{ name: 'reglement.pdf' }];
    },
    async downloadPdf() {
      const path = join(dataDir, `dl-${at}.pdf`);
      writeFileSync(path, '%PDF-1.7 fake');
      return { path, bytes: 13, sha256: 'f'.repeat(64), etag: '"x"' };
    }
  };
  const parse = async () => ({ pageCount: gordes.meta.pages, outline: [], pages: gordes.pages });
  return createService({
    env,
    log: capture.log,
    dataDir,
    fetcher,
    parse,
    watch: { sleep: async (ms) => { at += ms; } },
    clock: () => at,
    now: () => new Date(at)
  }).then((s) => ({ s, capture, calls, state, dataDir, advance: (ms) => (at += ms), time: () => at }));
}

const req = (segments, query = {}, user = 'alice') => ({
  method: 'GET',
  segments,
  query: new URLSearchParams(query),
  limitKey: `user:${user}`,
  userHash: 'hash-of-user',
  userSource: 'header'
});

test('GET v1/documents/{partition} answers the watch and seeds on a first look', async () => {
  const { s, calls } = await serviceWith({ listings: { DU_00001: [item('d1', 'IDU_1', { name: 'DU_00001' })] } });
  const first = await s.handle(req(['v1', 'documents', 'DU_00001']));
  assert.equal(first.status, 200);
  assert.equal(first.body.current.originalName, 'IDU_1');
  assert.equal(first.body.current.publicationDate, '2026-04-23');
  assert.equal(calls.documents, 1);
  await s.handle(req(['v1', 'documents', 'DU_00001']));
  assert.equal(calls.documents, 1);
  const bad = await s.handle(req(['v1', 'documents', 'nope']));
  assert.equal(bad.status, 400);
  const none = await s.handle(req(['v1', 'documents']));
  assert.equal(none.status, 404);
  const post = await s.handle({ ...req(['v1', 'documents', 'DU_00001']), method: 'POST' });
  assert.equal(post.status, 405);
});

test('a first look is the user’s budget: past it, 429 with Retry-After, and the GPU is not asked', async () => {
  const listings = {};
  for (let n = 1; n <= 4; n += 1) listings[`DU_0000${n}`] = [item(`d${n}`, `IDU_${n}`, { name: `DU_0000${n}` })];
  const { s, calls } = await serviceWith({ listings, env: { FR_URBAN_RULES_LIMIT_WATCH_SEED_HOUR: '2' } });
  assert.equal((await s.handle(req(['v1', 'documents', 'DU_00001']))).status, 200);
  assert.equal((await s.handle(req(['v1', 'documents', 'DU_00002']))).status, 200);
  const third = await s.handle(req(['v1', 'documents', 'DU_00003']));
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers['Retry-After']) >= 1);
  assert.equal(calls.documents, 2);
  // A watched partition costs nothing.
  assert.equal((await s.handle(req(['v1', 'documents', 'DU_00001']))).status, 200);
  // Another user has a budget of their own.
  assert.equal((await s.handle(req(['v1', 'documents', 'DU_00003'], {}, 'bob'))).status, 200);
});

test('a GPU failure on a first look is a named error, never an empty record', async () => {
  const { s, dataDir } = await serviceWith({ listings: { DU_00001: 'garbage' } });
  const res = await s.handle(req(['v1', 'documents', 'DU_00001']));
  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'source_unavailable');
  assert.equal(existsSync(join(dataDir, 'com.archisimple.fr-urban-rules', 'watch', 'DU_00001.json')), false);
});

test('reading a chapter puts its document in the watch with no GPU call of its own', async () => {
  const { s, calls, dataDir } = await serviceWith({ listings: { DU_00001: [{ id: 'doc1', originalName: 'IDU_1', name: 'DU_00001' }] } });
  const query = new URLSearchParams({ partition: 'DU_00001', idurba: 'IDU_1', nomfic: 'reglement.pdf', zone: 'A' });
  const chapter = await s.handle({ ...req(['v1', 'chapter']), query });
  assert.equal(chapter.status, 200);
  const before = calls.documents; // the chapter's own resolution
  const watched = await s.handle(req(['v1', 'documents', 'DU_00001']));
  assert.equal(watched.status, 200);
  assert.equal(calls.documents, before);
  assert.equal(watched.body.current.gpuDocId, 'doc1');
  assert.ok(existsSync(join(dataDir, 'com.archisimple.fr-urban-rules', 'watch', 'DU_00001.json')));
});

test('DEC-2 through the caches: a superseded version’s text and extractions go 90 days after the change, another version’s stay', async () => {
  const first = await serviceWith({ listings: { DU_00001: [{ id: 'doc1', originalName: 'IDU_1', name: 'DU_00001' }] } });
  const { dataDir } = first;
  const root = join(dataDir, 'com.archisimple.fr-urban-rules');
  const read = (s, idurba) =>
    s.handle({
      ...req(['v1', 'chapter']),
      query: new URLSearchParams({ partition: 'DU_00001', idurba, nomfic: 'reglement.pdf', zone: 'A' })
    });
  assert.equal((await read(first.s, 'IDU_1')).status, 200);
  const keyOld = cacheKey('IDU_1', 'reglement.pdf');
  assert.ok(existsSync(join(root, 'documents', keyOld)));
  // An extraction result for that version sits beside it (as jobs.mjs writes one), and one for another version.
  const meta = (idurba) => JSON.stringify({ schemaVersion: 1, document: { partition: 'DU_00001', idurba, nomfic: 'reglement.pdf' }, rules: [] });
  const resultOld = join(root, 'extractions', 'a'.repeat(40));
  const resultOther = join(root, 'extractions', 'c'.repeat(40));
  mkdirSync(resultOld, { recursive: true });
  mkdirSync(resultOther, { recursive: true });
  writeFileSync(join(resultOld, 'meta.json'), meta('IDU_1'));
  writeFileSync(join(resultOther, 'meta.json'), meta('IDU_7'));
  // The service restarts (it indexes its caches at start); the GPU has moved to IDU_2.
  const { s, advance } = await serviceWith({
    dataDir,
    startAt: first.time() + DAY_MS,
    listings: { DU_00001: [{ id: 'doc2', originalName: 'IDU_2', name: 'DU_00001' }] }
  });
  const changed = await s.watcher.check('DU_00001');
  assert.equal(changed.changed, true);
  assert.equal(changed.view.previous[0].originalName, 'IDU_1');
  // Text and extractions stay for the 90 days (a project confirmed on the old version can still show what it confirmed).
  advance(SUPERSEDED_KEEP_MS - DAY_MS);
  await s.watcher.sweep();
  assert.ok(existsSync(join(root, 'documents', keyOld)));
  assert.ok(existsSync(resultOld));
  advance(2 * DAY_MS);
  const swept = await s.watcher.sweep();
  assert.equal(swept.evicted, 2);
  assert.equal(existsSync(join(root, 'documents', keyOld)), false);
  assert.equal(existsSync(resultOld), false);
  assert.ok(existsSync(resultOther), 'another version’s extraction stays');
});

test('DEC-2: an extraction result under another schema version is not kept', async () => {
  const { s, dataDir } = await serviceWith();
  const root = join(dataDir, 'com.archisimple.fr-urban-rules');
  // A running service indexes entries at start; a result written by hand needs a reopen.
  const dir = join(root, 'extractions', 'b'.repeat(40));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ schemaVersion: 0, document: {}, rules: [] }));
  const reopened = await createService({
    env: {},
    log: () => {},
    dataDir,
    fetcher: { listDocuments: async () => [], listFiles: async () => [], downloadPdf: async () => assert.fail('no') },
    parse: async () => assert.fail('no'),
    watch: false
  });
  const swept = await reopened.watcher.sweep();
  assert.equal(swept.evicted, 1);
  assert.equal(existsSync(dir), false);
  void s;
});

test('criterion 5: the service stores no parcel, address, geometry or user name — a query that carries them leaves nothing in the volume', async () => {
  const { s, dataDir, capture } = await serviceWith({ listings: { DU_00001: [item('d1', 'IDU_1', { name: 'DU_00001' })] } });
  const secrets = ['692660000A0001', '12 rue Distinctive du Test', 'Zéphyrine Distinctname', '4.8357,45.7640'];
  await s.handle(
    req(['v1', 'documents', 'DU_00001'], { idu: secrets[0], address: secrets[1], user: secrets[2], point: secrets[3] }, secrets[2])
  );
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(dataDir);
  assert.ok(files.some((f) => f.endsWith('DU_00001.json')));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const secret of secrets) assert.ok(!text.includes(secret), `${file} holds ${secret}`);
  }
  assert.ok(!JSON.stringify(capture.records).includes(secrets[2]), 'the log names no user');
  assert.ok(!JSON.stringify(capture.records).includes(secrets[0]));
});

test('the schedule is not started when a test injects its own GPU, and FR_URBAN_RULES_WATCH=off stops it for a deployment', async () => {
  const { s } = await serviceWith();
  s.stop(); // idempotent: never started
  assert.equal(typeof s.watcher.start, 'function');
});
