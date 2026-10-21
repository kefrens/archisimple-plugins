/**
 * `GET v1/chapter` end to end inside the service (DEC-3, DEC-5, DEC-8, DEC-9),
 * with a fake fetcher and a fake parser over the recorded Gordes text.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cacheKey, openDocumentCache } from '../src/cache.mjs';
import { ServiceError } from '../src/errors.mjs';
import { createWindowLimiter } from '../src/limits.mjs';
import { createService } from '../src/service.mjs';
import { capturingLog, loadRegulation, REPO } from './helpers.mjs';

const gordes = loadRegulation('gordes');
const SECRET_TEXT = 'DISTINCTIVE-PAGE-TEXT-7f3a';
const SECRET_USER = 'Zéphyrine Distinctname';

/** A fetcher for documents `IDU_<n>` in partitions `DU_<n, five digits>`. */
function fakeFetcher(dir, { hold } = {}) {
  const calls = { documents: 0, files: 0, downloads: 0 };
  const fetcher = {
    async listDocuments(partition) {
      calls.documents += 1;
      const n = Number(partition.slice(3));
      return [{ id: `doc${n}`, originalName: `IDU_${n}`, status: 'document.production' }];
    },
    async listFiles() {
      calls.files += 1;
      return [{ name: 'reglement.pdf' }];
    },
    async downloadPdf() {
      calls.downloads += 1;
      if (hold !== undefined) await hold;
      const path = join(dir, `dl-${calls.downloads}.pdf`);
      writeFileSync(path, '%PDF-1.7 fake');
      return { path, bytes: 13, sha256: 'f'.repeat(64), etag: '"x"' };
    }
  };
  return { fetcher, calls };
}

const parse = async () => ({
  pageCount: gordes.meta.pages,
  outline: [],
  pages: gordes.pages.map((text, i) => (i === 44 ? `${text}\n${SECRET_TEXT}` : text))
});

async function service(options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-service-'));
  const capture = capturingLog();
  let now = Date.parse('2026-10-20T10:00:00Z');
  const fake = fakeFetcher(dataDir, options);
  const s = await createService({
    env: options.env ?? {},
    log: capture.log,
    dataDir,
    fetcher: fake.fetcher,
    parse,
    clock: () => now,
    now: () => new Date(now)
  });
  return { s, capture, calls: fake.calls, dataDir, advance: (ms) => (now += ms) };
}

function chapterRequest(n, { user = 'alice', zone = 'A', source = 'header' } = {}) {
  const query = new URLSearchParams({
    partition: `DU_${String(n).padStart(5, '0')}`,
    idurba: `IDU_${n}`,
    nomfic: 'reglement.pdf',
    zone
  });
  return {
    method: 'GET',
    segments: ['v1', 'chapter'],
    query,
    limitKey: `${source === 'header' ? 'user' : 'address'}:${user}`,
    userHash: 'hash-of-user',
    userSource: source
  };
}

test('GET v1/chapter answers the chapter; the second read is a cache hit, and the PDF is gone', async () => {
  const { s, capture, calls, dataDir } = await service();
  const first = await s.handle(chapterRequest(1));
  assert.deepEqual(first, {
    status: 200,
    body: {
      pages: [44, 51],
      found: 'contents',
      match: 'exact',
      title: 'CHAPITRE I : REGLES APPLICABLES A LA ZONE A',
      documentPages: 60
    }
  });
  const second = await s.handle(chapterRequest(1, { zone: 'Ast' }));
  assert.equal(second.body.match, 'prefix');
  assert.equal(calls.downloads, 1);
  assert.deepEqual(
    capture.records.filter((r) => r.event === 'chapter').map((r) => r.cache),
    ['miss', 'hit']
  );
  assert.equal(readdirSync(dataDir).filter((f) => f.endsWith('.pdf')).length, 0, 'the PDF is deleted once read');
  const entry = join(dataDir, 'com.archisimple.fr-urban-rules', 'documents', cacheKey('IDU_1', 'reglement.pdf'));
  assert.deepEqual(readdirSync(entry).sort(), ['meta.json', 'outline.json', 'pages.jsonl']);
  const meta = JSON.parse(readFileSync(join(entry, 'meta.json'), 'utf8'));
  assert.equal(meta.idurba, 'IDU_1');
  assert.equal(meta.etag, '"x"');
});

test('the cache key upper-cases idurba: PLUi and PLUI are one document', () => {
  assert.equal(cacheKey('200046977_PLUi_20260326', 'r.pdf'), cacheKey('200046977_PLUI_20260326', 'r.pdf'));
  assert.notEqual(cacheKey('A', 'r.pdf'), cacheKey('A', 's.pdf'));
});

test('a second request for a document being fetched joins the first: one fetch, one count', async () => {
  let release;
  const hold = new Promise((resolve) => (release = resolve));
  const { s, calls, capture } = await service({ hold, env: { FR_URBAN_RULES_LIMIT_FETCH_HOUR: '1' } });
  const a = s.handle(chapterRequest(2));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const b = s.handle(chapterRequest(2, { zone: 'Ast' }));
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.status, 200);
  assert.deepEqual(rb.body, { ...ra.body, match: 'prefix' });
  assert.equal(calls.downloads, 1);
  assert.deepEqual(
    capture.records.filter((r) => r.event === 'chapter').map((r) => r.cache).sort(),
    ['joined', 'miss']
  );
});

test('the 31st document fetch in an hour answers 429 with Retry-After; hits and other users are not affected', async () => {
  const { s, advance } = await service();
  for (let n = 1; n <= 30; n += 1) {
    assert.equal((await s.handle(chapterRequest(n))).status, 200, `fetch ${n}`);
  }
  const refused = await s.handle(chapterRequest(31));
  assert.equal(refused.status, 429);
  assert.equal(refused.body.error, 'rate_limited');
  assert.ok(Number(refused.headers['Retry-After']) > 0);
  assert.equal((await s.handle(chapterRequest(5))).status, 200, 'a cache hit does not count');
  assert.equal((await s.handle(chapterRequest(31, { user: 'bob' }))).status, 200, 'another user has a budget');
  advance(3_600_001);
  assert.equal((await s.handle(chapterRequest(32))).status, 200, 'an hour later');
});

test('the 61st read in a minute answers 429 with Retry-After, hits included', async () => {
  const { s, advance } = await service();
  for (let n = 1; n <= 60; n += 1) assert.equal((await s.handle(chapterRequest(1))).status, 200, `read ${n}`);
  const refused = await s.handle(chapterRequest(1));
  assert.equal(refused.status, 429);
  assert.equal(refused.body.error, 'rate_limited');
  assert.ok(Number(refused.headers['Retry-After']) >= 1);
  assert.equal((await s.handle(chapterRequest(1, { user: 'bob' }))).status, 200, 'another user reads');
  advance(60_001);
  assert.equal((await s.handle(chapterRequest(1))).status, 200, 'a minute later');
});

test('after document_unreadable, the download is deleted: tmp/ is empty', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-unreadable-'));
  const tmp = join(dataDir, 'com.archisimple.fr-urban-rules', 'tmp');
  const s = await createService({
    env: {},
    log: () => {},
    dataDir,
    fetcher: {
      listDocuments: async () => [{ id: 'doc1', originalName: 'IDU_1' }],
      listFiles: async () => [{ name: 'reglement.pdf' }],
      downloadPdf: async () => {
        const path = join(tmp, 'download-x.pdf');
        writeFileSync(path, '%PDF-1.7 broken');
        return { path, bytes: 15, sha256: '0'.repeat(64) };
      }
    },
    parse: async () => {
      throw new ServiceError('document_unreadable');
    }
  });
  const answer = await s.handle(chapterRequest(1));
  assert.equal(answer.body.error, 'document_unreadable');
  assert.deepEqual(readdirSync(tmp), []);
});

test('the limiter forgets users whose window has emptied', () => {
  let t = 0;
  const limiter = createWindowLimiter({ limit: 5, windowMs: 1000, now: () => t });
  for (let n = 0; n < 100; n += 1) limiter.take(`user-${n}`);
  assert.equal(limiter.size(), 100);
  t = 5000;
  limiter.take('late');
  assert.equal(limiter.size(), 1);
});

test('the limits are named variables', async () => {
  const { s } = await service({ env: { FR_URBAN_RULES_LIMIT_FETCH_HOUR: '2', FR_URBAN_RULES_LIMIT_READ_MINUTE: '3' } });
  assert.equal((await s.handle(chapterRequest(1))).status, 200);
  assert.equal((await s.handle(chapterRequest(2))).status, 200);
  assert.equal((await s.handle(chapterRequest(3))).status, 429, 'third fetch');
  assert.equal((await s.handle(chapterRequest(1))).status, 429, 'fourth read in the minute');
});

test('without the user header the address is the key, and the log says so once', async () => {
  const { s, capture } = await service();
  await s.handle(chapterRequest(1, { source: 'address', user: '10.0.0.9' }));
  await s.handle(chapterRequest(1, { source: 'address', user: '10.0.0.9' }));
  const warnings = capture.records.filter((r) => r.event === 'limit_key_fallback');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].level, 'warn');
  assert.ok(capture.records.filter((r) => r.event === 'chapter').every((r) => r.userSource === 'address'));
});

test('a bad input is invalid_request, named by field, and nothing is fetched', async () => {
  const { s, calls } = await service();
  for (const [field, value] of [
    ['partition', 'https://evil.example/'],
    ['partition', 'DU_1'],
    ['partition', 'DU_200054807_B/x'],
    ['partition', 'DU_200054807_ABCDE'],
    ['idurba', '../../etc'],
    ['nomfic', 'reglement.exe'],
    ['nomfic', 'a/b.pdf'],
    ['zone', ''],
    ['zone', 'A\u0000'],
    ['zone', 'x'.repeat(41)]
  ]) {
    const request = chapterRequest(1);
    request.query.set(field, value);
    const answer = await s.handle(request);
    assert.equal(answer.status, 400, `${field}=${JSON.stringify(value)}`);
    assert.deepEqual(answer.body, { error: 'invalid_request', field });
  }
  const twice = chapterRequest(1);
  twice.query.append('zone', 'B');
  assert.equal((await s.handle(twice)).status, 400, 'one zone per request');
  assert.equal(calls.documents, 0);
  const zone = chapterRequest(1, { zone: "A'h+1" });
  const answer = await s.handle(zone);
  assert.equal(answer.status, 422, 'apostrophes and + are zone characters: read, then not found');
  assert.equal(answer.body.error, 'zone_chapter_not_found');
});

test('the failure codes reach the answer with their status', async () => {
  const { s } = await service();
  const missing = await s.handle(chapterRequest(1, { zone: 'ZZ' }));
  assert.equal(missing.status, 422);
  assert.equal(missing.body.error, 'zone_chapter_not_found');
  assert.deepEqual(missing.body.contentsCodes, ['UA', 'UC', '1AU', 'A', 'N']);
  assert.equal((await s.handle({ ...chapterRequest(1), segments: ['v1', 'nope'] })).status, 404);
  assert.equal((await s.handle({ ...chapterRequest(1), method: 'POST' })).status, 405);
});

test('no log line holds page text or a raw user name', async () => {
  const { s, capture } = await service();
  const request = chapterRequest(1, { user: SECRET_USER });
  request.userHash = 'a1b2c3d4e5f6';
  await s.handle(request);
  await s.handle({ ...request, query: new URLSearchParams({ ...Object.fromEntries(request.query), zone: 'ZZ' }) });
  const text = capture.text();
  assert.ok(capture.records.length >= 2);
  assert.ok(!text.includes(SECRET_TEXT), 'no page text');
  assert.ok(!text.includes('REGLES APPLICABLES'), 'not even a title');
  assert.ok(!text.includes(SECRET_USER) && !text.includes('Zéphyrine'), 'no raw name');
  assert.ok(text.includes('a1b2c3d4e5f6'), 'the keyed hash is what is logged');
});

test('the log level is FR_URBAN_RULES_LOG_LEVEL', async () => {
  const { s, capture } = await service({ env: { FR_URBAN_RULES_LOG_LEVEL: 'warn' } });
  await s.handle(chapterRequest(1));
  assert.equal(capture.records.filter((r) => r.event === 'chapter').length, 0, 'info is below warn');
});

test('the cache evicts the least recently read entry past its cap, and writes atomically', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-cache-'));
  let t = 0;
  const cache = await openDocumentCache({ dir, maxBytes: 2500, now: () => new Date((t += 1000)) });
  const entry = (n) => ({ meta: { pages: 1, n }, outline: [], pages: ['x'.repeat(1000)] });
  await cache.write('a', entry(1));
  await cache.write('b', entry(2));
  await cache.read('a');
  await cache.write('c', entry(3));
  assert.deepEqual(cache.keys().sort(), ['a', 'c'], 'b was the least recently read');
  assert.ok(cache.totalBytes() <= 2500);
  assert.ok(!readdirSync(dir).some((name) => name.startsWith('.')), 'no staging folder left');
  // A restart rebuilds the index from disk.
  const again = await openDocumentCache({ dir, maxBytes: 2500 });
  assert.equal((await again.read('c')).pages[0].length, 1000);
});

test('no model key: nothing under the services reads AI_PROVIDER_ or an API key, and the image sets none', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'tests' || entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(mjs|js|json)$/u.test(entry.name) || entry.name === 'Dockerfile') files.push(path);
    }
  };
  walk(join(REPO, 'services'));
  assert.ok(files.some((f) => f.endsWith('Dockerfile')));
  assert.ok(files.some((f) => f.endsWith('service.mjs')));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/AI_PROVIDER_|API_KEY/u.test(text), `${file} names a model key`);
  }
});

test('the image installs without optional dependencies: no @napi-rs/canvas', () => {
  const dockerfile = readFileSync(join(REPO, 'services/Dockerfile'), 'utf8');
  assert.match(dockerfile, /npm ci --omit=dev --omit=optional/u);
  const pkg = JSON.parse(readFileSync(join(REPO, 'services/fr-urban-rules-service/package.json'), 'utf8'));
  assert.equal(pkg.dependencies['pdfjs-dist'], '6.2.108', 'pinned exactly');
  // npm 10 (Node 22, CI) leaves the omitted packages' scope folder behind,
  // empty; npm 11 does not. A package inside it is what must not be there.
  const scope = join(REPO, 'services/fr-urban-rules-service/node_modules/@napi-rs');
  const installed = existsSync(scope) ? readdirSync(scope) : [];
  assert.deepEqual(
    installed,
    [],
    'install with `npm ci --omit=optional`, as the image does: the tests must run without the canvas'
  );
});

test('the image’s base is pinned by digest (archisimple Sprint 096.13, Q6)', () => {
  const dockerfile = readFileSync(join(REPO, 'services/Dockerfile'), 'utf8');
  const from = dockerfile.split('\n').filter((line) => line.startsWith('FROM '));
  assert.ok(from.length > 0);
  for (const line of from) assert.match(line, /@sha256:[0-9a-f]{64}/u, line);
});

test('the cache swaps an entry atomically: a rewrite keeps it readable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-swap-'));
  const cache = await openDocumentCache({ dir });
  const entry = (n) => ({ meta: { pages: 1, n }, outline: [], pages: [`text ${n}`] });
  await cache.write('k', entry(1));
  const reads = [];
  for (let n = 2; n <= 6; n += 1) {
    reads.push(cache.read('k'));
    await cache.write('k', entry(n));
  }
  for (const r of await Promise.all(reads)) assert.ok(r !== undefined && r.pages[0].startsWith('text '));
  assert.equal((await cache.read('k')).meta.n, 6);
  assert.ok(!readdirSync(dir).some((name) => name.startsWith('.')), 'nothing left aside');
});
