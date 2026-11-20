/**
 * Sprint 002.27 — the reading is inside the account's AI budget (platform Sprint 120.2, ADR-0136).
 *
 * A real `createAiClient` talks over loopback to a stub of ai-service, so what is asserted is what
 * ai-service would receive: the opaque subject on every `extract` call of a job (the one of the user
 * who STARTED it, even after the request is gone), nothing else about the user, a `402` that ends the
 * reading and keeps the chunks read, a `503` that is retried, and a body that is not the documented
 * one degrading to the generic error.
 *
 * Not tested, on purpose: a forged `X-Authenticated-AI-Subject`. This process believes any header it
 * is sent, as it believes the features header; its trust is the network (Compose network, the chart's
 * NetworkPolicy), not code here.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { AI_SUBJECT_HEADER, AiError, budgetOf, cleanAiSubject, createAiClient, entitlementHeaders, FEATURES_HEADER } from '../src/ai-client.mjs';
import { createService } from '../src/service.mjs';
import { fakeAi, rule } from './ai-fake.mjs';
import { capturingLog, loadRegulation } from './helpers.mjs';

const gordes = loadRegulation('gordes');
const PASSAGE = 'Les occupations et utilisations du sol non mentionnées à l’article A 2 sont interdites.';
const parse = async () => ({ pageCount: gordes.meta.pages, outline: [], pages: gordes.pages });

const ALICE = '3f2b8c1e-9d4a-4e0b-8a57-1c2d3e4f5a6b';
const BOB = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const CAROL = 'c0ffee00-0000-4000-8000-000000000003';

const BODY_402 = {
  error: {
    code: 'ai_budget_exhausted',
    message: 'Your monthly AI budget is used up.',
    details: { remainingMicrousd: 1_234_567, budgetMicrousd: 5_000_000, resetsAt: '2026-12-01T00:00:00.000Z', reason: 'exhausted' }
  }
};

const servers = [];
after(() => {
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
});

/**
 * A stub of ai-service. `respond(n, request, headers)` (n = the extract call's number, from 1) answers
 * `{ status, body }` (`body` a string is sent as it is) or nothing for the ordinary answer.
 */
async function stubAi({ respond = () => undefined, plan } = {}) {
  const fake = fakeAi({ plan: plan ?? (() => [{ value: rule({ kind: 'other', statement: 'described' }), passage: PASSAGE }]) });
  const seen = [];
  let extracts = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const text = Buffer.concat(chunks).toString('utf8');
      seen.push({ method: req.method, url: req.url, headers: req.headers });
      const send = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(typeof body === 'string' ? body : JSON.stringify(body));
      };
      if (req.url === '/api/ai/health') {
        return send(200, { capabilities: ['structured-output'], structuredOutput: { maxTextLength: 200000, maxItems: 200 }, defaultProviderId: 'lmstudio' });
      }
      extracts += 1;
      const request = JSON.parse(text);
      const answered = await respond(extracts, request, req.headers);
      if (answered !== undefined) return send(answered.status, answered.body);
      return send(200, await fake.extract(request, {}));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    seen,
    extractCalls: () => seen.filter((s) => s.url === '/api/ai/extract'),
    extractCount: () => extracts
  };
}

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

async function setup({ ai, env = {} } = {}) {
  const stub = await stubAi(ai);
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-budget-'));
  const capture = capturingLog();
  const s = await createService({
    // Smaller chunks: the Gordes chapter is read in several parts, so a stop can fall between them.
    env: { FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000', FR_URBAN_RULES_EXTRACT_CHUNK_CHARS: '4000', ...env },
    log: capture.log,
    dataDir,
    fetcher: fetcherIn(dataDir),
    parse,
    aiServiceUrl: stub.url
  });
  return { s, stub, capture };
}

/** Holds the first extract call until `gate` opens, then answers it as usual. */
const heldFirst = (gate) => async (n) => {
  if (n === 1) await gate;
  return undefined;
};

const inputs = (n = 1) => ({ partition: `DU_${String(n).padStart(5, '0')}`, idurba: `IDU_${n}`, nomfic: 'reglement.pdf', zone: 'A' });

/** A request as the gateway hands it over: `who` is `{ user, hash, subject? }`. */
function request(method, segments, { body, query = {}, who = ALICE_WHO } = {}) {
  return {
    method,
    segments: ['v1', ...segments],
    query: new URLSearchParams(query),
    body: body === undefined ? undefined : JSON.stringify(body),
    limitKey: `user:${who.user}`,
    userHash: who.hash,
    userSource: 'header',
    ...(who.subject === undefined ? {} : { aiSubject: who.subject })
  };
}
const ALICE_WHO = { user: 'alice', hash: 'hash00000001', subject: ALICE };
const BOB_WHO = { user: 'bob', hash: 'hash00000002', subject: BOB };
const CAROL_WHO = { user: 'carol', hash: 'hash00000003', subject: CAROL };

const post = (s, n, who, extra = {}) => s.handle(request('POST', ['extractions'], { body: inputs(n), who, ...extra }));
const poll = (s, jobId, who) => s.handle(request('GET', ['extractions', jobId], { who }));
const cachedOnly = (s, n) => s.handle(request('GET', ['extractions'], { query: { ...inputs(n), cachedOnly: '1' } }));
const finish = async (s, answer, who = ALICE_WHO) => {
  assert.equal(answer.status, 202);
  await s.idle();
  return (await poll(s, answer.body.jobId, who)).body;
};

/** How many parts the chapter is cut into at 4 000 characters, read from an ordinary job. */
async function partsOfChapter() {
  const { s, stub } = await setup();
  const job = await finish(s, await post(s, 1, ALICE_WHO));
  assert.equal(job.state, 'done');
  assert.equal(stub.extractCount(), job.result.chunks.of);
  return job.result.chunks.of;
}

// ── The subject travels with the job ──────────────────────────────────────────────────────────────

test('every extract call of a job carries its starter\'s subject, even after the request that started it, and nothing else about the user', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { s, stub, capture } = await setup({ ai: { respond: heldFirst(gate) } });

  const started = await post(s, 1, ALICE_WHO);
  assert.equal(started.status, 202);
  // The first call is in flight and the request that started the job is long answered: other people
  // ask, with their own stamps (or none). None of it changes whose job it is.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const joined = await post(s, 1, BOB_WHO);
  assert.equal(joined.body.jobId, started.body.jobId, 'bob joins alice\'s running reading');
  await poll(s, started.body.jobId, CAROL_WHO);
  await poll(s, started.body.jobId, { user: 'dave', hash: 'hash00000004' });
  release();
  const job = await finish(s, started);
  assert.equal(job.state, 'done');

  const calls = stub.extractCalls();
  assert.ok(calls.length >= 2, 'a chapter read in several parts');
  assert.equal(calls.length, job.result.chunks.of);
  for (const call of calls) {
    assert.equal(call.headers[AI_SUBJECT_HEADER], ALICE, 'the starter\'s, not the joiner\'s nor a poller\'s');
    const names = Object.keys(call.headers);
    for (const name of names) {
      assert.ok(!/^(authorization|cookie|x-authenticated-user|x-user.*|x-forwarded-.*|from)$/iu.test(name), `no header about the user: ${name}`);
    }
    assert.deepEqual(
      names.filter((n) => n.startsWith('x-')).sort(),
      [AI_SUBJECT_HEADER],
      'the subject is the only x- header (no features were stamped here)'
    );
  }
  assert.ok(stub.seen.some((r) => r.url === '/api/ai/health'));
  for (const r of stub.seen.filter((r) => r.url === '/api/ai/health')) {
    assert.equal(r.headers[AI_SUBJECT_HEADER], undefined, 'health is not a metered call: no subject');
  }
  // Never logged: not by this service, whatever the level.
  const text = capture.text();
  for (const subject of [ALICE, BOB, CAROL]) assert.ok(!text.includes(subject), 'a subject is in no log line');
  assert.ok(!/alice|bob|carol|dave/u.test(text), `nor a user name: ${text.match(/.{40}(alice|bob|carol|dave).{20}/u)?.[0]}`);
});

test('the features and the subject travel together; no subject at all sends no header (an older gateway)', async () => {
  const { s, stub } = await setup();
  const withBoth = await post(s, 1, ALICE_WHO);
  await s.idle();
  assert.equal(withBoth.status, 202);
  const anonymous = await post(s, 2, { user: 'erin', hash: 'hash00000005' });
  await s.idle();
  assert.equal(anonymous.status, 202);
  const calls = stub.extractCalls();
  assert.equal(calls[0].headers[AI_SUBJECT_HEADER], ALICE);
  assert.equal(calls.at(-1).headers[AI_SUBJECT_HEADER], undefined, 'a call with no subject is sent as before');
  assert.equal(calls.at(-1).headers[FEATURES_HEADER], undefined);
  // And the pure function: both, cleaned.
  assert.deepEqual(entitlementHeaders(['plu', 'ai-openai'], ALICE), { [FEATURES_HEADER]: 'plu,ai-openai', [AI_SUBJECT_HEADER]: ALICE });
  assert.deepEqual(entitlementHeaders(undefined, ALICE), { [AI_SUBJECT_HEADER]: ALICE });
  assert.deepEqual(entitlementHeaders(['plu'], undefined), { [FEATURES_HEADER]: 'plu' });
  assert.deepEqual(entitlementHeaders(undefined, undefined), {});
  for (const bad of ['', ' ', 'a b', 'é', 'x'.repeat(129), 'line\nbreak', 7, null, {}]) {
    assert.equal(cleanAiSubject(bad), undefined, JSON.stringify(bad));
    assert.deepEqual(entitlementHeaders(undefined, bad), {}, 'malformed: dropped, never repaired');
  }
  assert.equal(cleanAiSubject('x'.repeat(128)), 'x'.repeat(128));
});

test('a second user joining a running reading is not charged; the starter is', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { s } = await setup({
    env: { FR_URBAN_RULES_LIMIT_EXTRACT_HOUR: '1' },
    ai: { respond: heldFirst(gate) }
  });
  const started = await post(s, 1, ALICE_WHO);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const joined = await post(s, 1, BOB_WHO);
  assert.equal(joined.body.jobId, started.body.jobId);
  release();
  await s.idle();
  // Bob took nothing from his hour: his own reading of another chapter starts.
  assert.equal((await post(s, 2, BOB_WHO)).status, 202);
  await s.idle();
  // Alice took her one: she is refused (the existing limiter, unchanged).
  assert.equal((await post(s, 3, ALICE_WHO)).status, 429);
});

// ── A 402 ends the reading ────────────────────────────────────────────────────────────────────────

test('a 402 ends the reading: no further part is asked, the parts read are answered with the typed reason and the numbers, nothing is cached as complete', async () => {
  const parts = await partsOfChapter();
  assert.ok(parts >= 4, `the stop must fall inside the chapter (${parts} parts)`);
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { s, stub, capture } = await setup({
    ai: {
      respond: async (n) => {
        if (n === 1) await gate;
        return n === 3 ? { status: 402, body: BODY_402 } : undefined;
      }
    }
  });
  const started = await post(s, 1, ALICE_WHO);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const joined = await post(s, 1, BOB_WHO);
  assert.equal(joined.body.jobId, started.body.jobId);
  release();
  await s.idle();

  assert.equal(stub.extractCount(), 3, 'two parts read, the third refused, and no fourth is started');
  const job = (await poll(s, started.body.jobId, ALICE_WHO)).body;
  assert.equal(job.state, 'done', 'what was read is answered, not thrown away');
  assert.deepEqual(job.result.chunks, { of: parts, failed: 0, unread: parts - 2 });
  assert.deepEqual(job.result.stopped, {
    reason: 'ai-budget',
    detailReason: 'exhausted',
    remainingMicrousd: 1_234_567,
    budgetMicrousd: 5_000_000,
    resetsAt: '2026-12-01T00:00:00.000Z'
  });
  assert.ok(job.result.rules.length >= 1, 'the rules of the parts read are in the answer');
  assert.ok(!JSON.stringify(job).includes('Your monthly AI budget'), 'ai-service\'s own sentence is not passed on: the panel words the stop');
  assert.deepEqual(
    job.progress.parts.map((p) => p.state),
    ['done', 'done', ...Array(parts - 2).fill('waiting')],
    'the refused part and the rest were not read'
  );
  // The joiner reads the same answer: the starter's stop ends the joiner's reading, and says why.
  const asJoiner = (await poll(s, joined.body.jobId, BOB_WHO)).body;
  assert.deepEqual(asJoiner.result.stopped, job.result.stopped);
  // Never cached as complete: nobody is served the gaps, and the next POST asks again.
  assert.equal((await cachedOnly(s, 1)).status, 404);
  assert.equal((await post(s, 1, CAROL_WHO)).status, 202);
  await s.idle();
  const logged = capture.records.find((r) => r.event === 'extraction' && r.jobId === started.body.jobId);
  assert.equal(logged.stopped, 'ai-budget');
  assert.equal(logged.chunksUnread, parts - 2);
});

test('a 402 at the first part, with nothing read, fails the job with ai_budget_exhausted and its numbers, and gives the charge back', async () => {
  const { s, stub } = await setup({
    env: { FR_URBAN_RULES_LIMIT_EXTRACT_HOUR: '1' },
    ai: { respond: (n) => (n === 1 ? { status: 402, body: BODY_402 } : undefined) }
  });
  const job = await finish(s, await post(s, 1, ALICE_WHO));
  assert.equal(stub.extractCount(), 1, 'the first refusal ends the job');
  assert.equal(job.state, 'failed');
  assert.deepEqual(job.error, {
    detailReason: 'exhausted',
    remainingMicrousd: 1_234_567,
    budgetMicrousd: 5_000_000,
    resetsAt: '2026-12-01T00:00:00.000Z',
    code: 'ai_budget_exhausted'
  });
  assert.equal((await post(s, 2, ALICE_WHO)).status, 202, 'no model answered: the hour\'s one reading is still hers');
  await s.idle();
});

test('other errors keep their behaviour: a part that fails is counted and the next is still asked', async () => {
  const parts = await partsOfChapter();
  const { s, stub } = await setup({ ai: { respond: (n) => (n === 2 ? { status: 502, body: { error: { code: 'provider_error' } } } : undefined) } });
  const job = await finish(s, await post(s, 1, ALICE_WHO));
  assert.equal(job.state, 'done');
  assert.equal(job.result.stopped, undefined);
  assert.equal(job.result.chunks.unread, undefined);
  assert.equal(job.result.chunks.failed, 0, 'the retry answered');
  assert.equal(stub.extractCount(), parts + 1);
});

// ── A 503 is a transient failure ──────────────────────────────────────────────────────────────────

test('a 503 ai_budget_unavailable is retried like the other transient failures, and the reading goes on', async () => {
  const parts = await partsOfChapter();
  const unavailable = { status: 503, body: { error: { code: 'ai_budget_unavailable', message: 'x', details: { remainingMicrousd: 0, budgetMicrousd: 5_000_000, resetsAt: '2026-12-01T00:00:00.000Z', reason: 'unavailable' } } } };
  const { s, stub } = await setup({ ai: { respond: (n) => (n === 2 ? unavailable : undefined) } });
  const job = await finish(s, await post(s, 1, ALICE_WHO));
  assert.equal(job.state, 'done');
  assert.equal(job.result.chunks.failed, 0, 'the second attempt of that part was answered');
  assert.equal(job.result.stopped, undefined, 'a 503 never stops the job');
  assert.equal(stub.extractCount(), parts + 1, 'one extra call: the retry');
  assert.equal((await cachedOnly(s, 1)).status, 200, 'complete, so cached');
});

test('a 503 on every attempt fails each part after its retry, and the job ends extraction_failed naming the code', async () => {
  const unavailable = { status: 503, body: { error: { code: 'ai_budget_unavailable' } } };
  const { s, stub } = await setup({ ai: { respond: () => unavailable } });
  const job = await finish(s, await post(s, 1, ALICE_WHO));
  assert.equal(job.state, 'failed');
  assert.equal(job.error.code, 'extraction_failed');
  assert.deepEqual(job.error.codes, ['ai_budget_unavailable']);
  assert.equal(stub.extractCount() % 2, 0, 'two attempts per part, as for every retried code');
});

// ── A body that is not the documented one degrades to the generic error ───────────────────────────

test('ai-client: a 402 or 503 body is read field by field; anything else is the generic error as before', async () => {
  const answers = new Map();
  const server = http.createServer((req, res) => {
    const [status, body] = answers.get(req.headers['x-case']) ?? [500, '{}'];
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  // The stub reads which answer to give from a header the client does not set: wrap fetch to add it.
  let current;
  const wrapped = createAiClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    fetch: (url, init) => fetch(url, { ...init, headers: { ...init.headers, 'x-case': current } })
  });
  const ask = async (name, status, body) => {
    answers.set(name, [status, body]);
    current = name;
    try {
      await wrapped.extract({ instructions: 'i', text: 't', itemSchema: {}, maxItems: 1 });
      assert.fail('should throw');
    } catch (error) {
      assert.ok(error instanceof AiError, String(error));
      return error;
    }
  };

  const full = await ask('full', 402, BODY_402);
  assert.equal(full.code, 'ai_budget_exhausted');
  assert.equal(full.status, 402);
  assert.deepEqual(full.budget, {
    message: 'Your monthly AI budget is used up.',
    remainingMicrousd: 1_234_567,
    budgetMicrousd: 5_000_000,
    resetsAt: '2026-12-01T00:00:00.000Z',
    reason: 'exhausted'
  });
  const noBudget = await ask('null-budget', 402, { error: { code: 'ai_budget_exhausted', details: { remainingMicrousd: 0, budgetMicrousd: null, reason: 'floor' } } });
  assert.deepEqual(noBudget.budget, { remainingMicrousd: 0, budgetMicrousd: null, reason: 'floor' });
  const held = await ask('503', 503, { error: { code: 'ai_budget_unavailable', details: { reason: 'unavailable' } } });
  assert.equal(held.code, 'ai_budget_unavailable');
  assert.deepEqual(held.budget, { reason: 'unavailable' });

  // The code with a body that says nothing usable: still the typed error, with no numbers.
  const bare = await ask('bare', 402, { error: { code: 'ai_budget_exhausted' } });
  assert.equal(bare.code, 'ai_budget_exhausted');
  assert.deepEqual(bare.budget, {});
  const junk = await ask('junk', 402, {
    error: { code: 'ai_budget_exhausted', message: 5, details: { remainingMicrousd: '5', budgetMicrousd: -1, resetsAt: 'next tuesday', reason: 'because' } }
  });
  assert.deepEqual(junk.budget, {}, 'a number that is not a whole count, a date that is not one, a reason that is not listed: left out');
  const fractional = await ask('fractional', 402, { error: { code: 'ai_budget_exhausted', details: { remainingMicrousd: 1.5, budgetMicrousd: 1e300 } } });
  assert.deepEqual(fractional.budget, {});

  // No documented code: as today. A 402 that is not JSON is `malformed`, one with no error code `provider_error`.
  const text = await ask('text', 402, 'Payment Required');
  assert.equal(text.code, 'malformed');
  assert.equal(text.budget, undefined);
  assert.equal(text.status, 402);
  const empty = await ask('empty', 402, {});
  assert.equal(empty.code, 'provider_error');
  assert.equal(empty.budget, undefined);
  const oddCode = await ask('odd', 402, { error: { code: 'something_else', details: { remainingMicrousd: 1 } } });
  assert.equal(oddCode.code, 'something_else');
  assert.equal(oddCode.budget, undefined, 'only the two budget codes carry numbers');
  assert.deepEqual(budgetOf(null), {});
  assert.deepEqual(budgetOf({ error: 'ai_budget_exhausted' }), {});
});

test('a 402 whose body is not the documented one is the generic failure, not a budget stop', async () => {
  const { s } = await setup({ ai: { respond: () => ({ status: 402, body: 'Payment Required' }) } });
  const job = await finish(s, await post(s, 1, ALICE_WHO));
  assert.equal(job.state, 'failed');
  assert.equal(job.error.code, 'extraction_failed', 'every part failed as `malformed`, retried, as before');
  assert.deepEqual(job.error.codes, ['malformed']);
});

test('a budget stop with a body of no numbers still stops the job, with the reason alone', async () => {
  const parts = await partsOfChapter();
  const { s, stub } = await setup({ ai: { respond: (n) => (n === 2 ? { status: 402, body: { error: { code: 'ai_budget_exhausted' } } } : undefined) } });
  const job = await finish(s, await post(s, 1, ALICE_WHO));
  assert.equal(stub.extractCount(), 2);
  assert.equal(job.state, 'done');
  assert.deepEqual(job.result.stopped, { reason: 'ai-budget' });
  assert.deepEqual(job.result.chunks, { of: parts, failed: 0, unread: parts - 1 });
});
