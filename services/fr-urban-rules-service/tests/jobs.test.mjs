/**
 * Extraction jobs through the service (Sprint 002.5b DEC-1, DEC-3, DEC-8,
 * DEC-9): joins, the result cache, `cachedOnly`, limits, unavailability,
 * logs. A fake fetcher over Gordes' recorded text (zone A, PDF pp. 44–51,
 * sector Ast in the same chapter) and a fake 096.7.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createService } from '../src/service.mjs';
import { fakeAi, rule } from './ai-fake.mjs';
import { capturingLog, loadRegulation } from './helpers.mjs';

const gordes = loadRegulation('gordes');
const PASSAGE = 'Les occupations et utilisations du sol non mentionnées à l’article A 2 sont interdites.';
const SECRET_USER = 'Zéphyrine Distinctname';

function fakeFetcher(dir, versions = {}) {
  const calls = { documents: 0, downloads: 0 };
  return {
    calls,
    fetcher: {
      async listDocuments(partition) {
        calls.documents += 1;
        const n = Number(partition.slice(3));
        return [{ id: `doc${n}`, originalName: versions[n] ?? `IDU_${n}` }];
      },
      async listFiles() {
        return [{ name: 'reglement.pdf' }];
      },
      async downloadPdf() {
        calls.downloads += 1;
        const path = join(dir, `dl-${calls.downloads}.pdf`);
        writeFileSync(path, '%PDF-1.7 fake');
        return { path, bytes: 13, sha256: 'a'.repeat(64), etag: '"e"' };
      }
    }
  };
}

const parse = async () => ({ pageCount: gordes.meta.pages, outline: [], pages: gordes.pages });

async function service(options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-jobs-'));
  const capture = capturingLog();
  let now = Date.parse('2026-10-20T10:00:00Z');
  const fake = fakeFetcher(dataDir, options.versions);
  const ai =
    options.ai ??
    fakeAi({
      plan: () => [
        {
          value: rule({ kind: 'other', statement: 'described', conditions: ['ARTICLE A 1'] }),
          passage: PASSAGE
        }
      ],
      ...options.aiOptions
    });
  const s = await createService({
    env: { FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000', ...options.env },
    log: capture.log,
    dataDir,
    fetcher: fake.fetcher,
    parse,
    ai,
    clock: () => now,
    now: () => new Date(now)
  });
  return { s, ai, capture, fetcher: fake.calls, advance: (ms) => (now += ms) };
}

function inputs(n = 1, zone = 'A') {
  return { partition: `DU_${String(n).padStart(5, '0')}`, idurba: `IDU_${n}`, nomfic: 'reglement.pdf', zone };
}

function request(method, segments, { body, query = {}, user = 'alice', source = 'header', hash = 'hash123456ab' } = {}) {
  return {
    method,
    segments: ['v1', ...segments],
    query: new URLSearchParams(query),
    body: body === undefined ? undefined : JSON.stringify(body),
    limitKey: `${source === 'header' ? 'user' : 'address'}:${user}`,
    userHash: hash,
    userSource: source
  };
}

const post = (s, n, opts = {}) => s.handle(request('POST', ['extractions'], { body: inputs(n, opts.zone), ...opts }));
const poll = (s, jobId) => s.handle(request('GET', ['extractions', jobId]));
const cancel = (s, jobId, opts = {}) => s.handle(request('POST', ['extractions', jobId, 'cancel'], opts));
const cachedOnly = (s, n, zone = 'A') =>
  s.handle(request('GET', ['extractions'], { query: { ...inputs(n, zone), cachedOnly: '1' } }));

test('POST answers 202 before any fetch; the job walks to done; polls show the result', async () => {
  const { s, fetcher } = await service();
  const first = await post(s, 1);
  assert.equal(first.status, 202);
  assert.equal(first.body.state, 'queued');
  assert.match(first.body.jobId, /^[0-9a-f-]{36}$/u);
  assert.equal(fetcher.downloads, 0, 'no fetch before the answer');
  await s.idle();
  const done = await poll(s, first.body.jobId);
  assert.equal(done.status, 200);
  assert.equal(done.body.state, 'done');
  const { result } = done.body;
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.promptVersion, 3);
  assert.deepEqual(result.chapter.pages, [44, 51]);
  assert.equal(result.document.idurba, 'IDU_1');
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0].page, 44);
  assert.equal(result.rules[0].article, 'A 1');
  assert.deepEqual(result.rules[0].conditions, ['ARTICLE A 1']);
  assert.deepEqual(result.model, { providerId: 'lmstudio', model: 'fake-model', constraint: 'schema' });
  assert.equal((await poll(s, 'no-such-job')).status, 404);
});

test('joins and the cache: one model call for a repeated POST, a later POST and another zone of the chapter', async () => {
  let release;
  const hold = new Promise((resolve) => (release = resolve));
  const { s, ai } = await service({ aiOptions: { hold } });
  const a = await post(s, 1);
  const b = await post(s, 1);
  assert.equal(b.status, 202);
  assert.equal(b.body.jobId, a.body.jobId, 'the second POST joins the first');
  release();
  await s.idle();
  assert.equal(ai.calls.length, 1);
  const later = await post(s, 1);
  assert.equal(later.status, 200);
  assert.equal(later.body.state, 'done');
  const sector = await post(s, 1, { zone: 'Ast' });
  assert.equal(sector.status, 200, 'Ast shares zone A\'s chapter, and its result');
  assert.equal(ai.calls.length, 1);
  const refreshed = await s.handle(request('POST', ['extractions'], { body: inputs(1), query: { refresh: '1' } }));
  assert.equal(refreshed.status, 202, 'refresh=1 ignores the cache');
  await s.idle();
  assert.equal(ai.calls.length, 2);
});

test('cachedOnly never fetches: not_cached without the text, the result with current once cached', async () => {
  const { s, fetcher } = await service({
    aiOptions: { providerId: 'openai', health: { available: true, defaultProviderId: 'ollama', maxTextLength: 200000, maxItems: 200 } }
  });
  const none = await cachedOnly(s, 1);
  assert.equal(none.status, 404);
  assert.equal(none.body.error, 'not_cached');
  assert.deepEqual(none.body.current, { providerId: 'ollama', schemaVersion: 1, promptVersion: 3 });
  assert.equal(fetcher.documents + fetcher.downloads, 0, 'nothing fetched');

  await post(s, 1);
  await s.idle();
  const hit = await cachedOnly(s, 1, 'Ast');
  assert.equal(hit.status, 200);
  assert.equal(hit.body.result.model.providerId, 'openai');
  assert.equal(hit.body.current.providerId, 'ollama', 'a result from another provider, read with the current default');
  assert.equal(fetcher.downloads, 1);
  const missing = await s.handle(request('GET', ['extractions'], { query: inputs(1) }));
  assert.equal(missing.status, 400, 'a GET without cachedOnly=1 starts nothing');
});

test('the seventh extraction start in an hour is 429 with Retry-After; hits, joins and other users are free', async () => {
  const { s, advance } = await service();
  for (let n = 1; n <= 6; n += 1) {
    assert.equal((await post(s, n)).status, 202, `start ${n}`);
    await s.idle();
  }
  assert.equal((await post(s, 3)).status, 200, 'a cache hit');
  const refused = await post(s, 7);
  assert.equal(refused.status, 429);
  assert.equal(refused.body.error, 'rate_limited');
  assert.ok(Number(refused.headers['Retry-After']) > 0);
  assert.equal((await post(s, 7, { user: 'bob' })).status, 202, 'another user');
  await s.idle();
  advance(3_600_001);
  assert.equal((await post(s, 8)).status, 202, 'an hour later');
});

test('a job that never calls a model gives its charge back', async () => {
  const { s } = await service({ env: { FR_URBAN_RULES_LIMIT_EXTRACT_HOUR: '1' }, versions: { 1: 'OTHER_1' } });
  const first = await post(s, 1);
  await s.idle();
  const failed = await poll(s, first.body.jobId);
  assert.equal(failed.body.state, 'failed');
  assert.equal(failed.body.error.code, 'version_changed', 'a fetch code is the job\'s error, not the POST\'s');
  assert.equal((await post(s, 2)).status, 202, 'the failed job cost nothing');
});

test('refresh=1 is limited to two a day', async () => {
  const { s } = await service({ env: { FR_URBAN_RULES_LIMIT_EXTRACT_HOUR: '100', FR_URBAN_RULES_LIMIT_EXTRACT_DAY: '100' } });
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await s.handle(request('POST', ['extractions'], { body: inputs(1), query: { refresh: '1' } }))).status, 202);
    await s.idle();
  }
  assert.equal((await s.handle(request('POST', ['extractions'], { body: inputs(1), query: { refresh: '1' } }))).status, 429);
});

test('without structured-output, the POST is 202 and the job fails extraction_unavailable before any fetch', async () => {
  const { s, fetcher } = await service({ aiOptions: { health: { available: false, defaultProviderId: 'lmstudio' } } });
  const answer = await post(s, 1);
  assert.equal(answer.status, 202);
  await s.idle();
  const job = await poll(s, answer.body.jobId);
  assert.equal(job.body.state, 'failed');
  assert.equal(job.body.error.code, 'extraction_unavailable');
  assert.equal(fetcher.documents + fetcher.downloads, 0);
});

test('every chunk failing is extraction_failed, naming 096.7\'s codes', async () => {
  const { s } = await service({
    aiOptions: {
      plan: () => {
        throw Object.assign(new (class extends Error {})('x'), {});
      }
    }
  });
  const answer = await post(s, 1);
  await s.idle();
  const job = await poll(s, answer.body.jobId);
  assert.equal(job.body.error.code, 'extraction_failed');
  assert.deepEqual(job.body.error.codes, ['provider_error']);
});

test('a full queue is 503 busy with Retry-After', async () => {
  let release;
  const hold = new Promise((resolve) => (release = resolve));
  const { s } = await service({ aiOptions: { hold }, env: { FR_URBAN_RULES_LIMIT_EXTRACT_HOUR: '100', FR_URBAN_RULES_LIMIT_EXTRACT_DAY: '100', FR_URBAN_RULES_LIMIT_FETCH_HOUR: '100' } });
  for (let n = 1; n <= 11; n += 1) assert.equal((await post(s, n)).status, 202, `job ${n}`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const busy = await post(s, 12);
  assert.equal(busy.status, 503);
  assert.equal(busy.body.error, 'busy');
  assert.ok(Number(busy.headers['Retry-After']) > 0);
  release();
  await s.idle();
});

test('a bad body is invalid_request: unknown fields, non-strings, not JSON', async () => {
  const { s, ai } = await service();
  for (const body of ['{"partition":"DU_00001","idurba":"IDU_1","nomfic":"reglement.pdf","zone":"A","url":"http://x"}', '{"partition":1}', 'nope', '[]']) {
    const answer = await s.handle({ ...request('POST', ['extractions']), body });
    assert.equal(answer.status, 400, body);
    assert.equal(answer.body.error, 'invalid_request');
  }
  assert.equal(ai.calls.length, 0);
});

test('no log line holds a passage, a condition, a chunk\'s text or a raw user name', async () => {
  const { s, capture } = await service();
  const first = await post(s, 1, { user: SECRET_USER });
  await s.idle();
  await poll(s, first.body.jobId);
  await cachedOnly(s, 1);
  const text = capture.text();
  assert.ok(capture.records.some((r) => r.event === 'extraction' && r.outcome === 'ok' && r.rules === 1));
  assert.ok(!text.includes('occupations et utilisations'), 'no passage or chunk text');
  assert.ok(!text.includes('ARTICLE A 1'), 'no condition');
  assert.ok(!text.includes(SECRET_USER) && !text.includes('Zéphyrine'));
  assert.ok(text.includes('hash123456ab'));
});

// Review fixes (2026-10-20) ------------------------------------------------------------------

import { AiError } from '../src/ai-client.mjs';
import { createWindowLimiter } from '../src/limits.mjs';

test('S5: a partial result is answered to its job and never cached', async () => {
  let n = 0;
  const { s, ai } = await service({
    env: { FR_URBAN_RULES_EXTRACT_CHUNK_CHARS: '12000' },
    aiOptions: {
      plan: () => {
        n += 1;
        if (n >= 2) throw new AiError("output_invalid", 502);
        return [];
      }
    }
  });
  const first = await post(s, 1);
  await s.idle();
  const job = await poll(s, first.body.jobId);
  assert.equal(job.body.state, 'done');
  assert.equal(job.body.result.chunks.failed, 1);
  assert.equal((await cachedOnly(s, 1)).status, 404, 'not shared');
  assert.equal((await post(s, 1)).status, 202, 'a later POST tries again');
  await s.idle();
  assert.ok(ai.calls.length >= 4);
});

test('S7: a job stopped by no_provider_configured gives its charge back', async () => {
  const { s } = await service({
    env: { FR_URBAN_RULES_LIMIT_EXTRACT_HOUR: '1' },
    aiOptions: { plan: () => { throw new AiError('no_provider_configured', 503); } }
  });
  const first = await post(s, 1);
  await s.idle();
  const job = await poll(s, first.body.jobId);
  assert.equal(job.body.error.code, 'extraction_unavailable');
  assert.equal((await post(s, 2)).status, 202, 'the charge came back');
});

test('S6: an unexpected exception is internal_error, logged by name only', async () => {
  const { s, capture } = await service({
    ai: {
      health: async () => ({ available: true, defaultProviderId: 'p', maxTextLength: 200000, maxItems: 200 }),
      extract: async () => ({ providerId: 'p', model: 'm', items: [{ value: null, passage: { text: 'secret passage text', start: 0, end: 1, occurrences: 1 } }], rejected: [], constraint: 'schema' })
    }
  });
  const first = await post(s, 1);
  await s.idle();
  const job = await poll(s, first.body.jobId);
  assert.equal(job.body.error.code, 'internal_error');
  const logged = capture.records.find((r) => r.event === 'extraction_internal_error');
  assert.equal(logged.errorName, 'TypeError');
  assert.ok(!capture.text().includes('secret passage text'));
});

test('a refund gives back the job\'s own take, not the latest one', () => {
  let t = 0;
  const limiter = createWindowLimiter({ limit: 10, windowMs: 1000, now: () => t });
  const mine = limiter.take('u');
  t = 5;
  limiter.take('u');
  limiter.refund('u', mine.at);
  t = 1001;
  assert.equal(limiter.take('u').ok, true);
  // At 1001 the take at 0 would have expired anyway; the one at 5 is still counted.
  const limited = createWindowLimiter({ limit: 1, windowMs: 1000, now: () => t });
  const a = limited.take('v');
  limited.refund('v', a.at + 1); // not a take: nothing given back
  assert.equal(limited.take('v').ok, false);
});

// ── Sprint 002.23: progress by part, a stopped reading, a part read again ──────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
  for (let i = 0; i < 400; i += 1) {
    const value = await check();
    if (value) return value;
    await sleep(5);
  }
  assert.fail(`never: ${what}`);
}
/** A model that never answers until the job's signal stops it, as ai-service's call is cut. */
const stuckAi = () => ({
  calls: [],
  health: async () => ({ available: true, defaultProviderId: 'lmstudio', maxTextLength: 200_000, maxItems: 200 }),
  extract(request, route = {}) {
    this.calls.push(request);
    return new Promise((_, reject) => route.signal.addEventListener('abort', () => reject(new AiError('unreachable', 0))));
  }
});
const LIMITS = { FR_URBAN_RULES_LIMIT_EXTRACT_HOUR: '1', FR_URBAN_RULES_LIMIT_EXTRACT_DAY: '1' };

test('002.23: a poll while extracting names the part being read, the chapter, and each part\'s pages and rule count', async () => {
  let release;
  const hold = new Promise((resolve) => (release = resolve));
  const { s } = await service({
    env: { FR_URBAN_RULES_EXTRACT_CHUNK_CHARS: '12000' },
    aiOptions: { hold }
  });
  const first = await post(s, 1);
  const during = await until(async () => {
    const polled = await poll(s, first.body.jobId);
    return polled.body.progress.parts?.[0]?.state === 'running' ? polled.body : undefined;
  }, 'the first part is read');
  assert.equal(during.progress.step, 'extracting');
  assert.deepEqual(during.progress.chapter.pages, [44, 51]);
  assert.ok(during.progress.of >= 2);
  assert.equal(during.progress.parts.length, during.progress.of, 'every part is listed, the unread ones as waiting');
  assert.equal(during.progress.parts[1].state, 'waiting');
  assert.deepEqual(Object.keys(during.progress.parts[0]).sort(), ['n', 'pages', 'state'], 'never a passage');
  release();
  await s.idle();
  const done = (await poll(s, first.body.jobId)).body;
  assert.equal(done.state, 'done');
  assert.equal(done.progress.step, 'done');
  assert.equal(done.progress.parts.length, done.progress.of);
  assert.ok(done.progress.parts.every((part) => part.state === 'done' && Array.isArray(part.pages)));
  assert.equal(
    done.progress.parts.reduce((sum, part) => sum + part.rules, 0),
    done.result.rules.length,
    'the parts\' counts add up to the rules'
  );
  assert.equal(done.progress.rules, done.result.rules.length);
});

test('002.23: reading a partly-read chapter again asks the model for the failed parts only', async () => {
  let failing = true;
  let firstText;
  const { s, ai } = await service({
    env: { FR_URBAN_RULES_EXTRACT_CHUNK_CHARS: '12000' },
    aiOptions: {
      plan: (text) => {
        firstText ??= text;
        if (failing && text !== firstText) throw new AiError('output_invalid', 502);
        return [{ value: rule({ kind: 'other', statement: 'described' }), passage: PASSAGE }].filter(() => text === firstText);
      }
    }
  });
  const first = await post(s, 1);
  await s.idle();
  const partial = (await poll(s, first.body.jobId)).body;
  assert.ok(partial.result.chunks.failed >= 1);
  const failedParts = partial.progress.parts.filter((part) => part.state === 'failed');
  assert.equal(failedParts.length, partial.result.chunks.failed);
  assert.equal(partial.progress.parts[0].state, 'done');
  const callsAfterFirst = ai.calls.length;

  failing = false;
  const again = await post(s, 1);
  await s.idle();
  const complete = (await poll(s, again.body.jobId)).body;
  assert.equal(complete.result.chunks.failed, 0);
  assert.equal(complete.progress.parts[0].cached, true, 'the part that was read is not read again');
  assert.equal(
    ai.calls.length - callsAfterFirst,
    failedParts.length,
    'one call per failed part, none for the part that was read'
  );
  assert.equal((await cachedOnly(s, 1)).status, 200, 'a complete reading is cached as before');
});

test('002.23: "Extract again" never reuses what was read', async () => {
  const { s, ai } = await service({ env: { FR_URBAN_RULES_EXTRACT_CHUNK_CHARS: '12000' } });
  await post(s, 1);
  await s.idle();
  const calls = ai.calls.length;
  const refreshed = await s.handle(request('POST', ['extractions'], { body: inputs(1, 'A'), query: { refresh: '1' } }));
  assert.equal(refreshed.status, 202);
  await s.idle();
  assert.equal(ai.calls.length, calls * 2, 'every part is read again');
});

test('002.23: cancelling stops the call in flight, ends the job as `cancelled`, and gives the charge back', async () => {
  const ai = stuckAi();
  const { s } = await service({ ai, env: LIMITS });
  const first = await post(s, 1);
  await until(async () => (await poll(s, first.body.jobId)).body.state === 'extracting', 'extracting');
  await until(() => ai.calls.length === 1, 'a call is in flight');
  const answer = await cancel(s, first.body.jobId);
  assert.equal(answer.status, 200);
  await s.idle();
  const ended = (await poll(s, first.body.jobId)).body;
  assert.equal(ended.state, 'failed');
  assert.equal(ended.error.code, 'cancelled');
  assert.equal(ai.calls.length, 1, 'no second attempt after the stop');
  // The hourly budget is one: the stopped reading cost nothing, so another starts.
  const next = await post(s, 2);
  assert.equal(next.status, 202);
  await until(() => ai.calls.length === 2, 'the next reading starts');
  await cancel(s, next.body.jobId);
  await s.idle();
});

test('002.23: a queued job that is cancelled never runs', async () => {
  const ai = stuckAi();
  const { s } = await service({ ai, env: { FR_URBAN_RULES_LIMIT_EXTRACT_HOUR: '100', FR_URBAN_RULES_LIMIT_EXTRACT_DAY: '100' } });
  const first = await post(s, 1);
  const second = await post(s, 2);
  await until(() => ai.calls.length === 1, 'the first job is reading');
  assert.equal((await poll(s, second.body.jobId)).body.state, 'queued');
  assert.equal((await cancel(s, second.body.jobId)).body.error.code, 'cancelled');
  await cancel(s, first.body.jobId);
  await s.idle();
  assert.equal(ai.calls.length, 1, 'the second job never called a model');
});

test('002.23: a job another user joined keeps running for them; the last one to stop it stops it', async () => {
  const ai = stuckAi();
  const { s } = await service({ ai });
  const alice = await post(s, 1, { hash: 'alice-hash-1' });
  const bob = await post(s, 1, { user: 'bob', hash: 'bob-hash-001' });
  assert.equal(bob.body.jobId, alice.body.jobId, 'joined');
  await until(() => ai.calls.length === 1, 'reading');
  const aliceCancel = await cancel(s, alice.body.jobId, { hash: 'alice-hash-1' });
  assert.equal(aliceCancel.body.state, 'extracting', 'bob is still waiting for it');
  await sleep(20);
  assert.equal((await poll(s, alice.body.jobId)).body.state, 'extracting');
  await cancel(s, alice.body.jobId, { user: 'bob', hash: 'bob-hash-001' });
  await s.idle();
  assert.equal((await poll(s, alice.body.jobId)).body.error.code, 'cancelled');
});

test('002.23: cancel is idempotent, 404 for an unknown job, and POST only', async () => {
  const { s } = await service();
  const first = await post(s, 1);
  await s.idle();
  const done = await cancel(s, first.body.jobId);
  assert.equal(done.status, 200);
  assert.equal(done.body.state, 'done', 'a finished job is answered as it stands');
  assert.equal((await cancel(s, 'no-such-job')).status, 404);
  const wrong = await s.handle(request('GET', ['extractions', first.body.jobId, 'cancel']));
  assert.equal(wrong.status, 400);
});
