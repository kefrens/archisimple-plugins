/**
 * Sprint 002.30, Addendum A — both routes: Sonnet and a local model (the local one TRANSCRIBES, Sonnet always EXTRACTS: the owner's hybrid decision); a page is an asynchronous job; the loop guard at the route.
 *
 * Scripted AI clients, no model and no network but loopback. The looping reply is the measured pattern (pages 67 and 69 of a scanned
 * règlement, 2026-11-21), written synthetically: no page text of that document is here.
 */

import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AiError } from '../src/ai-client.mjs';
import { createService } from '../src/service.mjs';
import {
  LOCAL_PAGE_TIMEOUT_MS,
  LOCAL_TRANSCRIPTION_MAX_TOKENS,
  TRANSCRIPTION_MAX_TOKENS,
  TRANSCRIPTION_TIMEOUT_MS,
  UPLOAD_MODEL
} from '../src/uploaded.mjs';
import { fakeAi, rule } from './ai-fake.mjs';
import { capturingLog, loadRegulation } from './helpers.mjs';

const gordes = loadRegulation('gordes');
const PASSAGE =
  'Les occupations et utilisations du sol non mentionnées à l’article A 2 sont interdites.';
const ALICE = { user: 'alice', hash: 'hash00000001', subject: '3f2b8c1e-9d4a-4e0b-8a57-1c2d3e4f5a6b' };
const BOB = { user: 'bob', hash: 'hash00000002', subject: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' };
const IMAGE = { mediaType: 'image/jpeg', data: Buffer.from('never decoded').toString('base64') };
const LOCAL = { providerId: 'lmstudio', model: 'qwen/qwen3-vl-8b' };
const textPages = (from = 44, to = 50) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ page: from + i, text: gordes.pages[from + i - 1] }));
/** The measured loop: a few good lines, then « [illisible] » to the cap. */
const LOOP = [
  ...Array.from({ length: 12 }, (_, i) => `ligne ${i} du tampon`),
  ...Array(985).fill('[illisible]')
].join('\n');
const PROSE = gordes.pages[44];

function scripted({ chat, plan } = {}) {
  const fake = fakeAi({
    plan: plan ?? (() => [{ value: rule({ kind: 'other', statement: 'described' }), passage: PASSAGE }])
  });
  const chats = [];
  return {
    fake,
    chats,
    health: fake.health,
    extract: (request, route) => fake.extract(request, route),
    chat: async (request, route) => {
      chats.push({ request, route });
      return (
        (await chat?.(request, route, chats.length)) ?? {
          providerId: route.providerId,
          model: route.model ?? 'default-model',
          content: PROSE,
          finishReason: 'stop'
        }
      );
    }
  };
}

async function setup({ ai = scripted(), env = {} } = {}) {
  const capture = capturingLog();
  const s = await createService({
    env: { FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000', FR_URBAN_RULES_EXTRACT_CHUNK_CHARS: '4000', ...env },
    log: capture.log,
    dataDir: mkdtempSync(join(tmpdir(), 'fr-urban-rules-routes-')),
    ai,
    fetcher: {},
    parse: async () => ({ pageCount: 0, outline: [], pages: [] }),
    watch: false
  });
  return { s, ai, capture };
}
function request(method, segments, { body, who = ALICE } = {}) {
  return {
    method,
    segments: ['v1', 'uploads', ...segments],
    query: new URLSearchParams(),
    body: body === undefined ? undefined : JSON.stringify(body),
    limitKey: `user:${who.user}`,
    userHash: who.hash,
    userSource: 'header',
    aiSubject: who.subject
  };
}
const start = (s, body, who) => s.handle(request('POST', ['transcriptions'], { body: { page: 1, image: IMAGE, ...body }, who }));
const pollPage = (s, id, who) => s.handle(request('GET', ['transcriptions', id], { who }));
async function transcribe(s, body, who) {
  const started = await start(s, body, who);
  assert.equal(started.status, 202, JSON.stringify(started.body));
  await s.idle();
  return (await pollPage(s, started.body.jobId, who)).body;
}
async function read(s, body, who) {
  const started = await s.handle(request('POST', ['readings'], { body, who }));
  assert.equal(started.status, 202, JSON.stringify(started.body));
  await s.idle();
  return (await s.handle(request('GET', ['readings', started.body.jobId], { who }))).body;
}
const tick = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition) {
  for (let i = 0; i < 200 && !condition(); i += 1) await tick(5);
  assert.ok(condition(), 'condition reached');
}

// ── A1: the route is chosen, never invented ─────────────────────────────────────────────────

test('A1: the route is Sonnet by default, a local provider by name, and nothing else; no address, no extra field', async () => {
  const { s } = await setup();
  const estimate = (ai) => s.handle(request('POST', ['estimate'], { body: { mode: 'image', pages: 3, ai } }));
  assert.equal((await estimate(undefined)).body.estimate.route, 'cloud');
  assert.equal((await estimate({ providerId: 'anthropic' })).body.estimate.route, 'cloud');
  assert.equal((await estimate({ providerId: 'anthropic', model: 'claude-sonnet-5-5' })).body.estimate.route, 'cloud');
  assert.equal((await estimate(LOCAL)).body.estimate.route, 'local');
  assert.equal((await estimate({ providerId: 'ollama' })).body.estimate.route, 'local');
  for (const ai of [{ providerId: 'openai', model: 'gpt-x' }, { providerId: 'anthropic', model: 'claude-haiku-5-5' }, { providerId: 'demo' }]) {
    const refused = await estimate(ai);
    assert.equal(refused.status, 422, JSON.stringify(ai));
    assert.equal(refused.body.error, 'route_not_offered');
  }
  for (const ai of [{ providerId: 'lmstudio', endpoint: 'http://x' }, { providerId: 'lmstudio', model: 'http://evil/v1' }, 'lmstudio', { model: 'm' }, { providerId: 'LM Studio' }]) {
    assert.equal((await estimate(ai)).status, 400, JSON.stringify(ai));
  }
  // The transcription and the reading take it too.
  assert.equal((await start(s, { ai: { providerId: 'openai' } })).status, 422);
  const refusedReading = await s.handle(request('POST', ['readings'], { body: { documentId: 'd', pages: textPages(44, 45), ai: { providerId: 'openai' } } }));
  assert.equal(refusedReading.status, 422);
});

// ── A2: the estimate ────────────────────────────────────────────────────────────────────────

test('A2: a local estimate is a free transcription plus the extraction on Sonnet, with what all-Sonnet would cost and that the transcription time is unknown; a cloud one still shows Sonnet', async () => {
  const { s } = await setup();
  const ask = async (ai) => (await s.handle(request('POST', ['estimate'], { body: { mode: 'image', pages: 17, ai } }))).body.estimate;
  const cloud = await ask(undefined);
  const local = await ask(LOCAL);
  assert.equal(local.route, 'local');
  assert.deepEqual(local.breakdown, { transcriptionMicrousd: 0, extractionMicrousd: cloud.breakdown.extractionMicrousd }, 'the transcription is free, the extraction is the same Sonnet one');
  assert.equal(local.microusd, cloud.breakdown.extractionMicrousd);
  assert.ok(local.aboutUsd > 0 && local.aboutUsd < cloud.aboutUsd / 3, `about $${local.aboutUsd} against Sonnet's $${cloud.aboutUsd}`);
  assert.ok(local.aboutUsd >= 0.05 && local.aboutUsd <= 0.15, 'about $0.08 for 17 pages: the measured extraction');
  assert.ok(local.lowUsd <= local.aboutUsd && local.aboutUsd <= local.highUsd);
  assert.deepEqual(local.model, LOCAL, 'the transcription model');
  assert.deepEqual(local.extractionModel, UPLOAD_MODEL, 'the extraction model, always Sonnet');
  assert.equal(local.compare.aboutUsd, cloud.aboutUsd, 'what an all-Sonnet reading would cost');
  assert.ok(local.compare.perPageUsd > local.perPageUsd);
  assert.deepEqual(local.compare.model, UPLOAD_MODEL);
  assert.equal(local.timing.cloudSecondsPerPage, 13, "Sonnet's measured 224 s for 17 pages");
  assert.equal(local.timing.local.known, false, 'the time of a local transcription is not known in advance');
  assert.deepEqual(local.timing.local.measuredSecondsPerPage, { fast: 46, slow: 773 });
  assert.equal(cloud.route, 'cloud');
  assert.equal(cloud.timing.cloudSecondsPerPage, 13);
  assert.equal(cloud.compare, undefined);
  assert.ok(cloud.aboutUsd > 0.3);
  // A range with no scan has nothing to transcribe locally: its cost is the extraction's, as the cloud one's.
  const text = (await s.handle(request('POST', ['estimate'], { body: { mode: 'text', pages: 10, ai: LOCAL } }))).body.estimate;
  const textCloud = (await s.handle(request('POST', ['estimate'], { body: { mode: 'text', pages: 10 } }))).body.estimate;
  assert.equal(text.microusd, textCloud.microusd);
});

// ── A3: the route is what every call names ──────────────────────────────────────────────────

test("A3: a local route's every transcription names the local provider and the person's model; its extraction names Sonnet, with the account's subject, and none of it names the local server", async () => {
  const { s, ai } = await setup();
  const page = await transcribe(s, { ai: LOCAL });
  assert.equal(page.state, 'done');
  assert.equal(page.result.route, 'local');
  const pages = textPages().map((p) => ({ ...p, transcribed: true }));
  const job = await read(s, { documentId: 'doc-1', pages, ai: LOCAL });
  assert.equal(job.state, 'done');
  assert.equal(job.result.reading.route, 'local', 'the pages were transcribed locally: the figures notice is for them');
  for (const { route } of ai.chats) {
    assert.equal(route.providerId, 'lmstudio');
    assert.equal(route.model, 'qwen/qwen3-vl-8b');
    assert.equal(route.aiSubject, ALICE.subject);
  }
  assert.ok(ai.fake.routes.length >= 2, 'read in parts');
  for (const route of ai.fake.routes) {
    assert.equal(route.providerId, UPLOAD_MODEL.providerId, 'the extraction is Sonnet, whatever the route');
    assert.equal(route.model, UPLOAD_MODEL.model);
    assert.equal(route.aiSubject, ALICE.subject, 'metered to the account: the budget gate applies to it');
  }
  assert.ok(!JSON.stringify(ai.fake.routes).includes('lmstudio'));
  const { request: sent, route } = ai.chats[0];
  assert.equal(sent.maxTokens, LOCAL_TRANSCRIPTION_MAX_TOKENS);
  assert.equal(LOCAL_TRANSCRIPTION_MAX_TOKENS, 4096, 'the measured cap: a loop costs at most this');
  assert.equal(sent.purpose, 'transcribe');
  assert.equal(route.timeoutMs, LOCAL_PAGE_TIMEOUT_MS);
});

test("A3: a budget stop in the extraction of a local reading keeps the parts read like any reading's; the local transcription never reached the budget", async () => {
  const stop = new AiError('ai_budget_exhausted', 402, { remainingMicrousd: 10, budgetMicrousd: 5_000_000, resetsAt: '2026-12-01T00:00:00.000Z', reason: 'exhausted' });
  const ai = scripted();
  const real = ai.extract;
  let extracts = 0;
  ai.extract = async (request, route) => {
    extracts += 1;
    if (extracts >= 2) throw stop;
    return real(request, route);
  };
  const { s } = await setup({ ai });
  await transcribe(s, { ai: LOCAL });
  const job = await read(s, { documentId: 'd', pages: textPages().map((p) => ({ ...p, transcribed: true })), ai: LOCAL });
  assert.equal(job.state, 'done');
  assert.equal(job.result.stopped.reason, 'ai-budget');
  assert.ok(job.result.rules.length >= 1);
  assert.ok(ai.chats.every(({ route }) => route.providerId === 'lmstudio'), 'only the extraction can be stopped by the budget');
});

test('A3: a local route with no model named asks the provider for its own default; a cloud route is Sonnet on every call', async () => {
  const { s, ai } = await setup();
  await transcribe(s, { ai: { providerId: 'lmstudio' } });
  assert.equal(ai.chats[0].route.providerId, 'lmstudio');
  assert.equal(ai.chats[0].route.model, undefined);
  const { s: s2, ai: ai2 } = await setup();
  await transcribe(s2, {});
  await read(s2, { documentId: 'd', pages: textPages(44, 46) });
  for (const route of [...ai2.chats.map((c) => c.route), ...ai2.fake.routes]) {
    assert.equal(route.providerId, UPLOAD_MODEL.providerId);
    assert.equal(route.model, UPLOAD_MODEL.model);
  }
  assert.equal(ai2.chats[0].request.maxTokens, TRANSCRIPTION_MAX_TOKENS);
  assert.equal(ai2.chats[0].request.purpose, 'transcribe');
  assert.equal(ai2.chats[0].route.timeoutMs, TRANSCRIPTION_TIMEOUT_MS);
});

test("a deployment may change the local page's timeout, never below 30 s", async () => {
  const slow = await setup({ env: { FR_URBAN_RULES_LOCAL_PAGE_TIMEOUT_MS: '2400000' } });
  await transcribe(slow.s, { ai: LOCAL });
  assert.equal(slow.ai.chats[0].route.timeoutMs, 2_400_000);
  const low = await setup({ env: { FR_URBAN_RULES_LOCAL_PAGE_TIMEOUT_MS: '5' } });
  await transcribe(low.s, { ai: LOCAL });
  assert.equal(low.ai.chats[0].route.timeoutMs, 30_000);
});

// ── A4: a page is a private job ─────────────────────────────────────────────────────────────

test('A4: a transcription is a 202 and a job with progress; the reply is held until the page ends', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { s } = await setup({ ai: scripted({ chat: async () => (await gate, undefined) }) });
  const started = await start(s, { page: 7, ai: LOCAL });
  assert.equal(started.status, 202);
  assert.equal(started.body.state, 'queued');
  assert.equal(started.body.route, 'local');
  await tick();
  const running = (await pollPage(s, started.body.jobId)).body;
  assert.equal(running.state, 'running');
  assert.equal(running.progress.step, 'transcribing');
  assert.equal(running.progress.timeoutMs, LOCAL_PAGE_TIMEOUT_MS);
  assert.equal(typeof running.progress.elapsedMs, 'number');
  assert.equal(running.result, undefined);
  release();
  await s.idle();
  const done = (await pollPage(s, started.body.jobId)).body;
  assert.equal(done.state, 'done');
  assert.equal(done.result.page, 7);
  assert.equal(done.result.truncated, false);
  assert.equal(typeof done.result.text, 'string');
  assert.equal(done.result.unreadable, undefined);
});

test('A4: cancel stops the call in flight and the job ends cancelled; a queued job cancels without a call', async () => {
  let signalSeen;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { s, ai } = await setup({
    ai: scripted({
      chat: async (_r, route) => {
        signalSeen = route.signal;
        await gate;
        if (route.signal.aborted) throw new AiError('unreachable', 0);
      }
    })
  });
  const first = await start(s, { page: 1, ai: LOCAL });
  const second = await start(s, { page: 2, ai: LOCAL });
  await tick();
  assert.equal((await s.handle(request('POST', ['transcriptions', second.body.jobId, 'cancel']))).status, 200);
  assert.equal((await pollPage(s, second.body.jobId)).body.error.code, 'cancelled');
  assert.equal((await s.handle(request('POST', ['transcriptions', first.body.jobId, 'cancel']))).status, 200);
  assert.equal(signalSeen.aborted, true, 'the call in flight is aborted');
  release();
  await s.idle();
  const after = (await pollPage(s, first.body.jobId)).body;
  assert.equal(after.state, 'failed');
  assert.equal(after.error.code, 'cancelled');
  assert.equal(ai.chats.length, 1, 'the queued page never reached a model');
});

test('A4: a page that the model never answered in its time is transcription_failed, and nothing is retried after a long wait', async () => {
  let calls = 0;
  const { s } = await setup({
    ai: scripted({
      chat: async () => {
        calls += 1;
        throw new AiError('unreachable', 0);
      }
    })
  });
  const failed = await transcribe(s, { ai: LOCAL });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.error.code, 'transcription_failed');
  assert.equal(calls, 2, 'a quick failure is tried once more');
});

test("A4: a page job is private: another user's poll, cancel and delete are 404; DELETE drops it; it is forgotten after half an hour", async () => {
  let now = 5_000_000;
  const s = await createService({
    env: { FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000' },
    log: () => {},
    dataDir: mkdtempSync(join(tmpdir(), 'fr-urban-rules-routes-')),
    ai: scripted(),
    fetcher: {},
    parse: async () => ({}),
    clock: () => now,
    watch: false
  });
  const done = await transcribe(s, {}, ALICE);
  for (const [method, segments] of [['GET', ['transcriptions', done.jobId]], ['POST', ['transcriptions', done.jobId, 'cancel']], ['DELETE', ['transcriptions', done.jobId]]]) {
    assert.equal((await s.handle(request(method, segments, { who: BOB }))).status, 404, `${method} by another user`);
  }
  assert.equal((await pollPage(s, done.jobId, ALICE)).status, 200);
  assert.equal((await s.handle(request('DELETE', ['transcriptions', done.jobId]))).status, 200);
  assert.equal((await pollPage(s, done.jobId, ALICE)).status, 404);
  const again = await transcribe(s, {}, ALICE);
  now += 31 * 60_000;
  assert.equal((await pollPage(s, again.jobId, ALICE)).status, 404);
  assert.equal(s.uploadsHeld(), 0);
});

test('A4: no log line holds a page picture, a transcript or the subject', async () => {
  const { s, capture } = await setup();
  await transcribe(s, { ai: LOCAL });
  const logged = capture.text();
  assert.ok(logged.includes('upload_transcription'), 'it logs, with counts');
  assert.ok(!logged.includes(IMAGE.data));
  assert.ok(!logged.includes(PROSE.slice(0, 40)));
  assert.ok(!logged.includes(ALICE.subject));
});

// ── A5: lanes ───────────────────────────────────────────────────────────────────────────────

test('A5: local pages run one at a time; cloud pages may overlap; a long local reading does not hold a cloud one', async () => {
  let active = 0;
  let peak = 0;
  const gates = [];
  const { s, ai } = await setup({
    ai: scripted({
      chat: async (_r, route) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => gates.push(resolve));
        active -= 1;
        return { providerId: route.providerId, model: 'm', content: PROSE, finishReason: 'stop' };
      }
    })
  });
  const local = [await start(s, { page: 1, ai: LOCAL }), await start(s, { page: 2, ai: LOCAL }), await start(s, { page: 3, ai: LOCAL })];
  await tick();
  assert.equal(ai.chats.length, 1, 'one local page at a time');
  for (let n = 1; n <= 3; n += 1) {
    await until(() => gates.length > 0);
    gates.shift()();
    await tick(5);
  }
  await s.idle();
  assert.equal(peak, 1);
  assert.equal(ai.chats.length, 3);
  assert.ok(local.every((l) => l.status === 202));
  peak = 0;
  await Promise.all([start(s, { page: 1 }), start(s, { page: 2 })]);
  await until(() => gates.length === 2);
  assert.equal(peak, 2, 'two cloud pages overlap');
  while (gates.length > 0) gates.shift()();
  await s.idle();

});

// ── A6 at the route: the loop guard ─────────────────────────────────────────────────────────

test('A6: a page that loops to the cap is unreadable by this model, its text is never handed on, and the cap is the local one', async () => {
  const { s } = await setup({
    ai: scripted({ chat: async (_r, route) => ({ providerId: route.providerId, model: 'm', content: LOOP, finishReason: 'length' }) })
  });
  const page = await transcribe(s, { page: 67, ai: LOCAL });
  assert.equal(page.state, 'done', 'the page is a result the reading goes on past, not an error');
  assert.equal(page.result.text, '');
  assert.equal(page.result.unreadable.reason, 'repetition');
  assert.ok(page.result.unreadable.ratio > 0.9);
  assert.equal(page.result.truncated, true);
  assert.ok(!JSON.stringify(page).includes('[illisible]'));
});

test('A6: a long page cut off by the cap WITHOUT a loop is kept and flagged truncated, as Sonnet\'s is', async () => {
  const table = Array.from({ length: 200 }, (_, i) => `Lot ${i} | ${700 + i * 3} m² | ${(i % 7) + 1} m`).join('\n');
  const { s } = await setup({ ai: scripted({ chat: async (_r, route) => ({ providerId: route.providerId, model: 'm', content: table, finishReason: 'length' }) }) });
  const page = await transcribe(s, { page: 74, ai: LOCAL });
  assert.equal(page.result.truncated, true);
  assert.equal(page.result.unreadable, undefined);
  assert.equal(page.result.text, table);
});

test('A6: an empty answer is unreadable (empty); the guard also judges Sonnet\'s reply, which is never a loop in practice', async () => {
  const { s } = await setup({ ai: scripted({ chat: async (_r, route) => ({ providerId: route.providerId, model: 'm', content: '  ', finishReason: 'stop' }) }) });
  assert.deepEqual((await transcribe(s, {})).result.unreadable, { reason: 'empty' });
});

// ── A7: unreadable pages in a reading ───────────────────────────────────────────────────────

test('A7: an unreadable page is not in the extraction text, is listed, and a reading with no readable page is refused', async () => {
  const { s, ai } = await setup();
  const pages = [
    { page: 44, text: gordes.pages[43], transcribed: true },
    { page: 45, text: '', transcribed: true, unreadable: true },
    { page: 46, text: gordes.pages[45], transcribed: true, truncated: true }
  ];
  const job = await read(s, { documentId: 'doc-1', pages, ai: LOCAL });
  assert.equal(job.state, 'done');
  assert.deepEqual(job.result.reading.unreadablePages, [45]);
  assert.deepEqual(job.result.reading.transcribedPages, [44, 46]);
  assert.deepEqual(job.result.reading.truncatedPages, [46]);
  assert.deepEqual(job.result.reading.pages, [44, 45, 46]);
  assert.ok(ai.fake.calls.length >= 1 && ai.fake.calls.every((call) => call.text.length > 100));
  assert.ok(job.result.rules.every((r) => r.page !== 45));
  const none = await s.handle(request('POST', ['readings'], { body: { documentId: 'd', pages: [{ page: 3, text: '', unreadable: true }] } }));
  assert.equal(none.status, 422);
  assert.equal(none.body.error, 'upload_unreadable');
});

test('A7: a local provider the deployment does not have is the AI service\'s own refusal, naming the local provider', async () => {
  const { s } = await setup({
    ai: scripted({
      chat: async () => {
        throw new AiError('unknown_provider', 422);
      }
    })
  });
  const failed = await transcribe(s, { ai: LOCAL });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.error.code, 'unknown_provider');
  assert.equal(failed.error.providerId, 'lmstudio');
});

test('limits: a person holds at most four unfinished pages, and the hour counts a page once', async () => {
  const gate = new Promise(() => {});
  const { s } = await setup({ ai: scripted({ chat: async () => gate }), env: { FR_URBAN_RULES_LIMIT_UPLOAD_TRANSCRIBED_HOUR: '10' } });
  for (let n = 1; n <= 4; n += 1) assert.equal((await start(s, { page: n, ai: LOCAL })).status, 202);
  const fifth = await start(s, { page: 5, ai: LOCAL });
  assert.equal(fifth.status, 503);
  assert.equal(fifth.body.error, 'busy');
  assert.equal((await start(s, { page: 5, ai: LOCAL }, BOB)).status, 202, 'another person has their own');
});
