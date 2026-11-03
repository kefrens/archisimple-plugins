/**
 * The Géorisques v2 proxy (Sprint 002.10 DEC-5, criteria 8–9): the token lives
 * in the service's environment and nowhere else; the route is an allow-list;
 * an answer is cached a day. A local HTTP stub plays Géorisques and a **fake**
 * token is used throughout — there is no real one yet. No network.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ServiceError } from '../src/errors.mjs';
import { ALLOWED_PATHS, CACHE_ENTRIES, MAX_ANSWER_BYTES, createGeorisques } from '../src/georisques.mjs';
import { createService } from '../src/service.mjs';
import { capturingLog } from './helpers.mjs';

/** Not a real token: long, distinctive, and used nowhere else. */
const FAKE_TOKEN = 'fake-georisques-token-9f3c2a71b8d4e605';

// The stub ------------------------------------------------------------------------

let route = () => ({ status: 200, body: {} });
const seen = [];
const server = http.createServer((req, res) => {
  seen.push({ url: req.url, headers: { ...req.headers } });
  const answer = route(req);
  if (answer.stream !== undefined) return answer.stream(res);
  res.writeHead(answer.status, answer.headers ?? { 'content-type': 'application/json;charset=UTF-8' });
  res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {}));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
after(() => server.close());

const looked = [];
const toStub = (hostname, options, callback) => {
  if (typeof options === 'function') callback = options;
  looked.push(hostname);
  if (options?.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
  else callback(null, '127.0.0.1', 4);
};

function reset(handler = () => ({ status: 200, body: { content: [] } })) {
  seen.length = 0;
  looked.length = 0;
  route = handler;
}

function proxy(env = { FR_URBAN_RULES_GEORISQUES_TOKEN: FAKE_TOKEN }, extra = {}) {
  const records = [];
  let at = Date.parse('2026-11-03T10:00:00Z');
  const g = createGeorisques({
    env,
    version: '0.3.0',
    logger: (level, record) => records.push({ level, ...record }),
    request: http.request,
    port,
    lookup: toStub,
    clock: () => at,
    ...extra
  });
  return { g, records, advance: (ms) => (at += ms) };
}

const q = (params) => new URLSearchParams(params);
const isCode = (code) => (e) => e instanceof ServiceError && e.code === code;

// Configuration ---------------------------------------------------------------------

test('without a token the proxy is off: status says so, a read is 503 not_configured, and nothing is sent', async () => {
  reset();
  const { g } = proxy({});
  assert.deepEqual(g.status(), { configured: false, api: 'v2' });
  await assert.rejects(() => g.get(['rga'], q({ longitude: '4.83', latitude: '45.76' })), isCode('not_configured'));
  assert.equal(seen.length, 0);
});

test('a token that is not a plain header value turns the proxy off, and the log does not say it', () => {
  for (const bad of ['has a space in it', 'line\nbreak-token-123456', 'short', 'tokén-with-accent-12345']) {
    reset();
    const { g, records } = proxy({ FR_URBAN_RULES_GEORISQUES_TOKEN: bad });
    assert.equal(g.configured(), false, bad);
    assert.ok(records.some((r) => r.event === 'georisques_token_unusable'));
    assert.ok(!JSON.stringify(records).includes(bad.trim()));
  }
});

test('the token goes out in Authorization, raw by default and with a scheme when the deployment says so', async () => {
  reset();
  await proxy().g.get(['rga'], q({ longitude: '4.83', latitude: '45.76' }));
  assert.equal(seen[0].headers.authorization, FAKE_TOKEN);
  assert.equal(seen[0].headers.accept, 'application/json');
  assert.match(seen[0].headers['user-agent'], /^ArchiSimple-fr-urban-rules-service\/0\.3\.0$/u);
  reset();
  await proxy({ FR_URBAN_RULES_GEORISQUES_TOKEN: FAKE_TOKEN, FR_URBAN_RULES_GEORISQUES_AUTH_SCHEME: 'Bearer' }).g.get(
    ['rga'],
    q({ longitude: '4.83', latitude: '45.76' })
  );
  assert.equal(seen[0].headers.authorization, `Bearer ${FAKE_TOKEN}`);
});

// The allow-list ---------------------------------------------------------------------

test('the five v2 paths 002.0 reads in v1 are allowed, at the v2 prefix, with the v2 parameter names', async () => {
  assert.deepEqual([...ALLOWED_PATHS], ['gaspar/risques', 'gaspar/pprn', 'zonage_sismique', 'rga', 'radon']);
  reset();
  const { g } = proxy();
  for (const path of ALLOWED_PATHS) await g.get(path.split('/'), q({ codesInsee: '69123', pageSize: '50', pageNumber: '0' }));
  assert.deepEqual(
    seen.map((s) => s.url),
    ALLOWED_PATHS.map((p) => `/api/v2/${p}?codesInsee=69123&pageNumber=0&pageSize=50`)
  );
  assert.deepEqual([...new Set(looked)], ['www.georisques.gouv.fr']);
});

test('anything else is refused before a request is made: other paths, other hosts’ shapes, unknown or repeated or malformed parameters', async () => {
  reset();
  const { g } = proxy();
  const ok = { codesInsee: '69123' };
  for (const path of [['v1', 'rga'], ['gaspar'], ['gaspar', 'pprn', '1234'], ['..', 'rga'], ['rga', '..'], ['gaspar', 'risques', 'x'], ['%2e%2e'], ['']]) {
    await assert.rejects(() => g.get(path, q(ok)), isCode('not_found'), path.join('/'));
  }
  const bad = [
    { codesInsee: '6912' },
    { codesInsee: '69123,abcde' },
    { codesInsee: '69123,69124,69125,69126,69127,69128' },
    { codesInsee: '../69123' },
    { longitude: '4.83' },
    { longitude: '4.83', latitude: 'north' },
    { longitude: '4.83', latitude: '45.76', geometry: 'POINT(4.83 45.76)' },
    { codesInsee: '69123', codesParcelle: '01002-000-AH-0456' },
    { codesInsee: '69123', pageSize: '5000' },
    { codesInsee: '69123', pageSize: '0' },
    { codesInsee: '69123', rayon: '1e3' },
    { codesInsee: '69123', Authorization: 'x' },
    {}
  ];
  for (const params of bad) await assert.rejects(() => g.get(['rga'], q(params)), isCode('invalid_request'), JSON.stringify(params));
  const twice = new URLSearchParams([['codesInsee', '69123'], ['codesInsee', '69124']]);
  await assert.rejects(() => g.get(['rga'], twice), isCode('invalid_request'));
  assert.equal(seen.length, 0);
});

test('a Corsican commune, a list of communes and a point with a radius pass', async () => {
  reset();
  const { g } = proxy();
  await g.get(['radon'], q({ codesInsee: '2A004,2B033,69123' }));
  await g.get(['gaspar/pprn'].flatMap((p) => p.split('/')), q({ longitude: '-1.5536', latitude: '47.2184', rayon: '500' }));
  assert.equal(seen.length, 2);
});

// The upstream ---------------------------------------------------------------------

test('an answer is passed on as JSON and nothing of its headers; the second read is the cache’s, a day later it asks again', async () => {
  reset(() => ({
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': 'session=abc', 'x-secret-header': 'leak', 'access-control-allow-origin': '*' },
    body: { totalElements: 1, content: [{ codeExposition: '2', exposition: 'Exposition moyenne' }] }
  }));
  const { g, advance } = proxy();
  const params = q({ longitude: '4.83', latitude: '45.76' });
  const first = await g.get(['rga'], params);
  assert.deepEqual(Object.keys(first).sort(), ['body', 'cache']);
  assert.equal(first.cache, 'miss');
  assert.equal(first.body.content[0].codeExposition, '2');
  assert.equal((await g.get(['rga'], params)).cache, 'hit');
  assert.equal(seen.length, 1);
  // The same question in another order is the same key.
  assert.equal((await g.get(['rga'], q({ latitude: '45.76', longitude: '4.83' }))).cache, 'hit');
  advance(24 * 3_600_000 + 1);
  assert.equal((await g.get(['rga'], params)).cache, 'miss');
  assert.equal(seen.length, 2);
});

test('two readers of one answer make one call', async () => {
  reset((req) => ({ stream: (res) => setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"content":[]}'); }, 30) }));
  const { g } = proxy();
  const params = q({ codesInsee: '69123' });
  const [a, b] = await Promise.all([g.get(['radon'], params), g.get(['radon'], params)]);
  assert.deepEqual([a.cache, b.cache].sort(), ['joined', 'miss']);
  assert.equal(seen.length, 1);
});

test('the cache is bounded', async () => {
  reset();
  const { g } = proxy();
  for (let n = 0; n < CACHE_ENTRIES + 3; n += 1) {
    await g.get(['radon'], q({ longitude: String(n % 100), latitude: `45.${String(n).padStart(4, '0')}` }));
  }
  assert.equal(g.size(), CACHE_ENTRIES);
});

test('401 and 403 are a rejected token — a named code, no upstream text, the log says so once in ten minutes and never the token', async () => {
  reset(() => ({
    status: 401,
    body: { code: '401', message: `Jeton non valide ${FAKE_TOKEN}. Veuillez renseigner un jeton valide.` }
  }));
  const { g, records, advance } = proxy();
  for (let n = 0; n < 3; n += 1) {
    await assert.rejects(
      () => g.get(['rga'], q({ codesInsee: `6912${n}` })),
      (e) => e instanceof ServiceError && e.code === 'source_refused' && e.details.reason === 'token_rejected' && !JSON.stringify(e.details).includes(FAKE_TOKEN)
    );
  }
  assert.equal(records.filter((r) => r.event === 'georisques_token_rejected').length, 1);
  advance(11 * 60_000);
  await assert.rejects(() => g.get(['rga'], q({ codesInsee: '69130' })), isCode('source_refused'));
  assert.equal(records.filter((r) => r.event === 'georisques_token_rejected').length, 2);
  assert.ok(!JSON.stringify(records).includes(FAKE_TOKEN));
  // A failure is not cached.
  reset();
  assert.equal((await g.get(['rga'], q({ codesInsee: '69130' }))).cache, 'miss');
});

test('the other statuses: 400 is the caller’s query, 404 a refused path, 429 and 5xx the source being unavailable, a redirect refused', async () => {
  const cases = [
    [400, 'invalid_request'],
    [404, 'source_refused'],
    [429, 'source_unavailable'],
    [500, 'source_unavailable'],
    [503, 'source_unavailable'],
    [302, 'source_refused'],
    [418, 'source_refused']
  ];
  for (const [status, code] of cases) {
    reset(() => ({ status, headers: { location: 'https://evil.example/', 'content-type': 'application/json' }, body: { message: 'secret upstream words' } }));
    const { g } = proxy();
    await assert.rejects(
      () => g.get(['rga'], q({ codesInsee: '69123' })),
      (e) => e instanceof ServiceError && e.code === code && !JSON.stringify(e.details).includes('secret'),
      String(status)
    );
    assert.equal(seen.length, 1, `${status}: asked once`);
  }
});

test('an answer that is not JSON, is not JSON-typed or is over 2 MiB is “unavailable”, not passed on', async () => {
  reset(() => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>' }));
  await assert.rejects(() => proxy().g.get(['rga'], q({ codesInsee: '69123' })), isCode('source_unavailable'));
  reset(() => ({ status: 200, body: '{not json' }));
  await assert.rejects(() => proxy().g.get(['rga'], q({ codesInsee: '69123' })), isCode('source_unavailable'));
  reset(() => ({ status: 200, body: JSON.stringify({ pad: 'x'.repeat(MAX_ANSWER_BYTES) }) }));
  await assert.rejects(() => proxy().g.get(['rga'], q({ codesInsee: '69123' })), isCode('source_unavailable'));
});

test('a call that does not answer is cut after the timeout', async () => {
  reset(() => ({ stream: () => {} }));
  const { g } = proxy(undefined, { timeoutMs: 80 });
  await assert.rejects(
    () => g.get(['rga'], q({ codesInsee: '69123' })),
    (e) => e instanceof ServiceError && e.code === 'source_unavailable' && e.details.reason === 'timeout'
  );
});

test('the name resolves through the guarded lookup: a refused address is a refusal', async () => {
  const { g } = proxy(undefined, {
    lookup: (host, options, callback) => {
      const error = new Error('refused');
      error.code = 'EADDRREFUSED';
      (typeof options === 'function' ? options : callback)(error);
    }
  });
  await assert.rejects(() => g.get(['rga'], q({ codesInsee: '69123' })), isCode('source_refused'));
});

// Through the service (criterion 8) --------------------------------------------------

async function service(env, log) {
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-service-geo-'));
  const s = await createService({
    env,
    log: log.log,
    dataDir,
    fetcher: { listDocuments: async () => [] },
    parse: async () => assert.fail('no parse'),
    watch: false,
    georisques: { request: http.request, port, lookup: toStub }
  });
  return { s, dataDir };
}

const get = (segments, query = {}, user = 'alice') => ({
  method: 'GET',
  segments,
  query: new URLSearchParams(query),
  limitKey: `user:${user}`,
  userHash: 'hash-of-user',
  userSource: 'header'
});

test('criterion 8: the token is in no response, no log line, no error and no file of the volume — on success, on a rejected token and on every refusal', async () => {
  const log = capturingLog();
  const { s, dataDir } = await service({ FR_URBAN_RULES_GEORISQUES_TOKEN: FAKE_TOKEN }, log);
  const responses = [];
  reset(() => ({ status: 200, body: { content: [{ classePotentiel: '2', codeInsee: '69123' }] } }));
  responses.push(await s.handle(get(['v1', 'georisques'])));
  responses.push(await s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: '69123' })));
  responses.push(await s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: '69123' })));
  responses.push(await s.handle(get(['v1', 'georisques', 'nothing'], { codesInsee: '69123' })));
  responses.push(await s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: 'bad' })));
  reset(() => ({ status: 401, body: { message: `Jeton non valide ${FAKE_TOKEN}` } }));
  responses.push(await s.handle(get(['v1', 'georisques', 'rga'], { codesInsee: '69123' })));
  assert.deepEqual(responses.map((r) => r.status), [200, 200, 200, 404, 400, 502]);
  assert.deepEqual(responses[0].body, { configured: true, api: 'v2' });
  assert.equal(responses[5].body.error, 'source_refused');
  const everything = JSON.stringify(responses) + JSON.stringify(log.records) + log.text();
  assert.ok(!everything.includes(FAKE_TOKEN), 'no response or log line holds the token');
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(dataDir);
  for (const file of files) assert.ok(!readFileSync(file, 'utf8').includes(FAKE_TOKEN), `${file} holds the token`);
});

test('criterion 9 (service side): no token → status says not configured and a read is 503; a user’s budget of misses is enforced, hits are free', async () => {
  const log = capturingLog();
  const none = await service({}, log);
  assert.deepEqual((await none.s.handle(get(['v1', 'georisques']))).body, { configured: false, api: 'v2' });
  const off = await none.s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: '69123' }));
  assert.equal(off.status, 503);
  assert.equal(off.body.error, 'not_configured');

  reset();
  const { s } = await service({ FR_URBAN_RULES_GEORISQUES_TOKEN: FAKE_TOKEN, FR_URBAN_RULES_LIMIT_GEORISQUES_HOUR: '2' }, log);
  assert.equal((await s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: '69001' }))).status, 200);
  assert.equal((await s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: '69002' }))).status, 200);
  const third = await s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: '69003' }));
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers['Retry-After']) >= 1);
  // A cached answer is free; another user has a budget of their own.
  assert.equal((await s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: '69001' }))).status, 200);
  assert.equal((await s.handle(get(['v1', 'georisques', 'radon'], { codesInsee: '69003' }, 'bob'))).status, 200);
  assert.equal(seen.length, 3);
  // Only GET.
  assert.equal((await s.handle({ ...get(['v1', 'georisques', 'radon'], { codesInsee: '69003' }), method: 'POST' })).status, 405);
});

test('nothing under the services reads the model-key variables for this: the token has its own name, in the service only', () => {
  const service = readFileSync(new URL('../src/georisques.mjs', import.meta.url), 'utf8');
  assert.match(service, /FR_URBAN_RULES_GEORISQUES_TOKEN/u);
  assert.ok(!/AI_PROVIDER_|API_KEY/u.test(service));
});
