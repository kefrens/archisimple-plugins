/**
 * Sprint 002.16 — the PLU reading uses the model the user chose in the editor's AI panel, and the
 * account's entitlement travels with it (ADR-0114 Rule 14): allowed, refused, absent; the body's
 * and the query's selection checked; the client's header; no `Authorization`, no endpoint.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createAiClient, entitlementHeaders, FEATURES_HEADER } from '../src/ai-client.mjs';
import { createService } from '../src/service.mjs';
import { fakeAi, rule } from './ai-fake.mjs';
import { capturingLog, loadRegulation } from './helpers.mjs';

const gordes = loadRegulation('gordes');
const PASSAGE = 'Les occupations et utilisations du sol non mentionnées à l’article A 2 sont interdites.';
const parse = async () => ({ pageCount: gordes.meta.pages, outline: [], pages: gordes.pages });

function fetcherIn(dir) {
  let downloads = 0;
  return {
    async listDocuments(partition) {
      return [{ id: `doc${Number(partition.slice(3))}`, originalName: `IDU_${Number(partition.slice(3))}` }];
    },
    async listFiles() {
      return [{ name: 'reglement.pdf' }];
    },
    async downloadPdf() {
      downloads += 1;
      const path = join(dir, `dl-${downloads}.pdf`);
      writeFileSync(path, '%PDF-1.7 fake');
      return { path, bytes: 13, sha256: 'a'.repeat(64), etag: '"e"' };
    }
  };
}

async function setup(aiOptions = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-entitlement-'));
  const ai = fakeAi({
    plan: () => [{ value: rule({ kind: 'other', statement: 'described' }), passage: PASSAGE }],
    granted: ['openai'],
    known: ['lmstudio', 'openai'],
    ...aiOptions
  });
  const capture = capturingLog();
  const s = await createService({
    env: { FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000' },
    log: capture.log,
    dataDir,
    fetcher: fetcherIn(dataDir),
    parse,
    ai
  });
  return { s, ai, capture };
}

const inputs = (n = 1) => ({ partition: `DU_${String(n).padStart(5, '0')}`, idurba: `IDU_${n}`, nomfic: 'reglement.pdf', zone: 'A' });

function request(method, segments, { body, query = {}, features } = {}) {
  return {
    method,
    segments: ['v1', ...segments],
    query: new URLSearchParams(query),
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    limitKey: 'user:alice',
    userHash: 'hash123456ab',
    userSource: 'header',
    ...(features === undefined ? {} : { features })
  };
}

const post = (s, body, features, query) => s.handle(request('POST', ['extractions'], { body, features, query }));
const jobOf = async (s, answer) => {
  assert.equal(answer.status, 202);
  await s.idle();
  return (await s.handle(request('GET', ['extractions', answer.body.jobId]))).body;
};

test('allowed: the chosen provider and model reach ai-service with the account\'s features, and serve the job', async () => {
  const { s, ai } = await setup();
  const job = await jobOf(s, await post(s, { ...inputs(1), ai: { providerId: 'openai', model: 'gpt-5' } }, ['ai-openai', 'plu']));
  assert.equal(job.state, 'done');
  assert.deepEqual(ai.routes[0], { providerId: 'openai', model: 'gpt-5', features: ['ai-openai', 'plu'] });
  assert.equal(job.result.model.providerId, 'openai', 'the result says which provider read it');
  assert.equal(job.result.model.model, 'gpt-5');
});

test('refused: an account without the feature gets ai-service\'s refusal, as the job\'s error, at no cost', async () => {
  const { s, ai } = await setup();
  const first = await jobOf(s, await post(s, { ...inputs(1), ai: { providerId: 'openai' } }, ['plu']));
  assert.equal(first.state, 'failed');
  assert.deepEqual(first.error, { providerId: 'openai', code: 'provider_not_permitted' });
  assert.equal(ai.calls.length, 1, 'the first chunk ends the job: the rest would be refused the same way');
  // The charge is given back (no model answered), so six more starts in the hour are still allowed.
  for (let n = 2; n <= 7; n += 1) {
    const job = await jobOf(s, await post(s, { ...inputs(n), ai: { providerId: 'openai' } }, ['plu']));
    assert.equal(job.error.code, 'provider_not_permitted');
  }
});

test('absent: no features header means no features — a granted provider is refused, the default still works', async () => {
  const { s, ai } = await setup();
  const refused = await jobOf(s, await post(s, { ...inputs(1), ai: { providerId: 'openai' } }));
  assert.equal(refused.error.code, 'provider_not_permitted');
  assert.equal('features' in ai.routes[0], false, 'nothing was claimed on the user\'s behalf');
  // Before 002.16 and in local mode: no selection and no features is exactly the old call.
  const plain = await jobOf(s, await post(s, inputs(2)));
  assert.equal(plain.state, 'done');
  assert.deepEqual(ai.routes.at(-1), {});
  assert.equal(plain.result.model.providerId, 'lmstudio');
});

test('a provider ai-service does not know is its own unknown_provider, not a substitute', async () => {
  const { s, ai } = await setup();
  const job = await jobOf(s, await post(s, { ...inputs(1), ai: { providerId: 'nope' } }, ['ai-openai']));
  assert.equal(job.error.code, 'unknown_provider');
  assert.equal(ai.calls.length, 1);
});

test('a result already cached is served to anyone — it costs no model call — and "again" is refused like any call', async () => {
  const { s, ai } = await setup();
  const done = await jobOf(s, await post(s, { ...inputs(1), ai: { providerId: 'openai' } }, ['ai-openai']));
  assert.equal(done.state, 'done');
  const calls = ai.calls.length;
  const free = await post(s, { ...inputs(1), ai: { providerId: 'openai' } }, ['plu']);
  assert.equal(free.status, 200);
  assert.equal(free.body.state, 'done');
  assert.equal(ai.calls.length, calls, 'no model call');
  const again = await jobOf(s, await post(s, { ...inputs(1), ai: { providerId: 'openai' } }, ['plu'], { refresh: '1' }));
  assert.equal(again.error.code, 'provider_not_permitted');
});

test('cachedOnly names the requested provider as current, so another provider\'s result offers "again"', async () => {
  const { s, ai } = await setup();
  await jobOf(s, await post(s, inputs(1)));
  const read = async (query) =>
    (await s.handle(request('GET', ['extractions'], { query: { ...inputs(1), cachedOnly: '1', ...query } }))).body;
  assert.equal((await read({})).current.providerId, 'lmstudio', 'no selection: ai-service\'s default');
  assert.equal((await read({ provider: 'openai', model: 'gpt-5' })).current.providerId, 'openai');
  assert.equal(ai.calls.length, 1, 'a read never calls a model');
  const features = await s.handle(request('GET', ['extractions'], { query: { ...inputs(1), cachedOnly: '1' }, features: ['ai-openai'] }));
  assert.deepEqual(ai.healths.at(-1), { features: ['ai-openai'] }, 'the default is the caller\'s own');
  assert.equal(features.status, 200);
});

test('the selection is an id and a model name, nothing else: bad shapes are invalid_request', async () => {
  const { s, ai } = await setup();
  const bad = [
    { providerId: 'OpenAI' },
    { providerId: 'a'.repeat(41) },
    { providerId: '../x' },
    { providerId: 'https://evil.example' },
    { providerId: 'openai', model: 'https://evil.example/v1' },
    { providerId: 'openai', model: 'x\u0000y' },
    { providerId: 'openai', model: 'm'.repeat(121) },
    { providerId: 'openai', model: '' },
    { providerId: 'openai', model: 5 },
    { providerId: 'openai', endpoint: 'http://192.168.1.147:1234' },
    { providerId: 'openai', apiKey: 'sk-x' },
    { model: 'gpt-5' },
    'openai',
    null,
    ['openai']
  ];
  for (const ai_ of bad) {
    const answer = await post(s, { ...inputs(1), ai: ai_ });
    assert.equal(answer.status, 400, JSON.stringify(ai_));
    assert.equal(answer.body.error, 'invalid_request');
  }
  assert.equal((await post(s, { ...inputs(1), providerId: 'openai' })).status, 400, 'not at the top level');
  assert.equal(ai.calls.length, 0);
  // Names that really occur are fine: a path, a tag.
  for (const model of ['qwen/qwen3-vl-8b', 'llama3:8b', 'gpt-5.1-mini']) {
    // 202 for the first (a job), 200 once the chapter is cached: either way, accepted.
    assert.ok([200, 202].includes((await post(s, { ...inputs(1), ai: { providerId: 'lmstudio', model } })).status), model);
    await s.idle();
  }
  // The query form is held to the same patterns.
  const query = (extra) => s.handle(request('GET', ['extractions'], { query: { ...inputs(1), cachedOnly: '1', ...extra } }));
  assert.equal((await query({ provider: 'Bad Id' })).status, 400);
  assert.equal((await query({ provider: 'openai', model: 'http://x' })).status, 400);
  assert.equal((await query({ model: 'gpt-5' })).status, 400, 'a model needs its provider');
});

test('logs name the requested provider and never the account\'s features', async () => {
  const { s, capture } = await setup();
  await jobOf(s, await post(s, { ...inputs(1), ai: { providerId: 'openai', model: 'gpt-5' } }, ['ai-openai', 'plu']));
  const text = JSON.stringify(capture.lines ?? capture.records ?? capture);
  assert.ok(text.includes('requestedProvider'), 'the requested provider is logged');
  assert.ok(!text.includes('ai-openai') && !text.includes('"plu"'), 'no entitlement in a log line');
});

// ── The client ────────────────────────────────────────────────────────────────────────────────

test('the client sends the features header and the chosen provider, and never an Authorization', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        req.url.endsWith('/health')
          ? JSON.stringify({ capabilities: ['structured-output'], structuredOutput: { maxTextLength: 200000, maxItems: 200 }, defaultProviderId: 'lmstudio' })
          : JSON.stringify({ providerId: 'openai', model: 'm', items: [], rejected: [], constraint: 'schema' })
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => {
    server.closeAllConnections();
    server.close();
  });
  const client = createAiClient({ baseUrl: `http://127.0.0.1:${server.address().port}` });
  const request_ = { instructions: 'i', text: 't', itemSchema: {}, maxItems: 1 };

  await client.extract(request_, { providerId: 'openai', model: 'gpt-5', features: ['ai-openai', 'plu', 'Bad Feature', 'x'.repeat(41)] });
  assert.equal(seen[0].headers[FEATURES_HEADER], 'ai-openai,plu', 'malformed ids are dropped, the rest sent');
  assert.deepEqual(JSON.parse(seen[0].body), { providerId: 'openai', model: 'gpt-5', ...request_ });
  assert.equal(seen[0].headers.authorization, undefined);

  await client.extract(request_);
  assert.equal(seen[1].headers[FEATURES_HEADER], undefined, 'no features: no header');
  assert.deepEqual(JSON.parse(seen[1].body), request_, 'no selection: the body is the one 096.7 always had');

  await client.extract(request_, { model: 'orphan-model', features: [] });
  assert.equal(seen[2].headers[FEATURES_HEADER], undefined);
  assert.equal('model' in JSON.parse(seen[2].body), false, 'a model without its provider is not sent');

  await client.health({ features: ['ai-openai'] });
  assert.equal(seen[3].headers[FEATURES_HEADER], 'ai-openai');
  await client.health();
  assert.equal(seen[4].headers[FEATURES_HEADER], undefined);
});

test('entitlementHeaders: only well-formed feature ids, deduplicated, capped', () => {
  assert.deepEqual(entitlementHeaders(undefined), {});
  assert.deepEqual(entitlementHeaders([]), {});
  assert.deepEqual(entitlementHeaders(['ai-openai', 'ai-openai']), { [FEATURES_HEADER]: 'ai-openai' });
  assert.deepEqual(entitlementHeaders(['AI-OPENAI', 'a,b', ' x', 7, null]), {});
  const many = Array.from({ length: 50 }, (_, i) => `f${i}`);
  assert.equal(entitlementHeaders(many)[FEATURES_HEADER].split(',').length, 32);
});
