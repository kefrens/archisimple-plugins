/**
 * Sprint 002.30 — reading a document the person uploaded: the estimate, the vision transcription, the private reading.
 *
 * No model and no network but loopback. The pages are the recorded Gordes règlement's text (public); the scripted AI
 * is `fakeAi`'s extract plus a `chat` that answers like ai-service's plain chat route does.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { AI_SUBJECT_HEADER, AiError, createAiClient, USAGE_PURPOSE_HEADER } from '../src/ai-client.mjs';
import { ERROR_STATUS } from '../src/errors.mjs';
import { createService, UPLOAD_BODY_BYTES } from '../src/service.mjs';
import {
  estimateReading,
  TRANSCRIPTION_MAX_TOKENS,
  TRANSCRIPTION_PROMPT,
  UPLOAD_MODEL
} from '../src/uploaded.mjs';
import { fakeAi, rule } from './ai-fake.mjs';
import { capturingLog, loadRegulation } from './helpers.mjs';

const gordes = loadRegulation('gordes');
const PASSAGE =
  'Les occupations et utilisations du sol non mentionnées à l’article A 2 sont interdites.';
const ALICE = {
  user: 'alice',
  hash: 'hash00000001',
  subject: '3f2b8c1e-9d4a-4e0b-8a57-1c2d3e4f5a6b'
};
const BOB = { user: 'bob', hash: 'hash00000002', subject: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' };
const IMAGE = {
  mediaType: 'image/jpeg',
  data: Buffer.from('not really a jpeg, never decoded').toString('base64')
};
const textPages = (from = 44, to = 50) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    page: from + i,
    text: gordes.pages[from + i - 1]
  }));

/** The scripted AI: the PLU reading's own fake for extract, and a chat that records what it was asked. */
function scripted({
  chat = async () => ({
    providerId: 'anthropic',
    model: 'claude-sonnet-5-5',
    content: 'Article 09-03 La hauteur est limitée à 7 m.',
    finishReason: 'stop'
  }),
  plan
} = {}) {
  const fake = fakeAi({
    plan:
      plan ?? (() => [{ value: rule({ kind: 'other', statement: 'described' }), passage: PASSAGE }])
  });
  const chats = [];
  return {
    fake,
    chats,
    health: fake.health,
    extract: (request, route) => fake.extract(request, route),
    chat: async (request, route) => {
      chats.push({ request, route });
      return chat(request, route, chats.length);
    }
  };
}

async function setup({ ai = scripted(), env = {} } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-uploads-'));
  const capture = capturingLog();
  const s = await createService({
    env: {
      FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000',
      FR_URBAN_RULES_EXTRACT_CHUNK_CHARS: '4000',
      ...env
    },
    log: capture.log,
    dataDir,
    ai,
    fetcher: {},
    parse: async () => ({ pageCount: 0, outline: [], pages: [] }),
    watch: false
  });
  return { s, ai, capture, dataDir };
}

function request(method, segments, { body, who = ALICE, features } = {}) {
  return {
    method,
    segments: ['v1', 'uploads', ...segments],
    query: new URLSearchParams(),
    body: body === undefined ? undefined : JSON.stringify(body),
    limitKey: `user:${who.user}`,
    userHash: who.hash,
    userSource: 'header',
    aiSubject: who.subject,
    ...(features === undefined ? {} : { features })
  };
}
const startReading = (s, pages = textPages(), who = ALICE, documentId = 'doc-1') =>
  s.handle(request('POST', ['readings'], { body: { documentId, pages }, who }));
const poll = (s, jobId, who = ALICE) => s.handle(request('GET', ['readings', jobId], { who }));
/**
 * Sprint 002.30, Addendum A: a page is a job (`202 { jobId }`, then a poll). Most of these tests assert what a page's transcription
 * IS, not how it is fetched, so this settles the job into the `{ status, body }` a synchronous call used to give: a done job is its
 * result (200), a failed one its error with the status of its code. A refusal before any job (a bad body, a limit) is answered as is.
 */
async function transcribe(s, options) {
  const started = await s.handle(request('POST', ['transcriptions'], options));
  if (started.status !== 202) return started;
  await s.idle();
  const view = (await s.handle(request('GET', ['transcriptions', started.body.jobId], { who: options.who }))).body;
  if (view.state === 'done') return { status: 200, body: view.result };
  return { status: ERROR_STATUS[view.error.code] ?? 500, body: { ...view.error, error: view.error.code } };
}
async function read(s, pages, who, documentId) {
  const started = await startReading(s, pages, who, documentId);
  assert.equal(started.status, 202, JSON.stringify(started.body));
  await s.idle();
  return (await poll(s, started.body.jobId, who)).body;
}

// ── The estimate ────────────────────────────────────────────────────────────────────────────

test('the estimate of the measured example: 17 scanned pages cost about what the 2026-11-20 run measured', () => {
  const estimate = estimateReading({ mode: 'image', pages: 17 });
  // Measured: $0.323 to transcribe 17 pages on Sonnet 5.5, and about $0.086 for an extraction of that size: about $0.40.
  assert.ok(estimate.aboutUsd >= 0.35 && estimate.aboutUsd <= 0.5, `about $${estimate.aboutUsd}`);
  assert.deepEqual(estimate.model, UPLOAD_MODEL);
  assert.equal(estimate.pages, 17);
  assert.ok(estimate.lowUsd < estimate.aboutUsd && estimate.aboutUsd < estimate.highUsd);
  assert.equal(estimate.priceTable.version, '2026-11-19');
  assert.equal(
    estimate.breakdown.transcriptionMicrousd + estimate.breakdown.extractionMicrousd,
    estimate.microusd
  );
  assert.ok(
    Math.abs(estimate.breakdown.transcriptionMicrousd - 323_000) < 15_000,
    'transcription within 5% of the measured $0.323'
  );
});

test('a text page needs no transcription: the same pages cost much less, and a longer reading costs more', () => {
  const text = estimateReading({ mode: 'text', pages: 17 });
  const scan = estimateReading({ mode: 'image', pages: 17 });
  assert.equal(text.breakdown.transcriptionMicrousd, 0);
  assert.ok(text.microusd < scan.microusd / 3);
  assert.ok(estimateReading({ mode: 'text', pages: 60 }).microusd > text.microusd);
  assert.ok(
    estimateReading({ mode: 'text', pages: 5, characters: 400_000 }).chunks >= 10,
    'the characters given decide the parts'
  );
});

test('a range that mixes text pages and scans is transcribed only where it is a scan', () => {
  const mixed = estimateReading({ mode: 'image', pages: 10, scanPages: 4 });
  const scans = estimateReading({ mode: 'image', pages: 10 });
  assert.equal(mixed.scanPages, 4);
  assert.ok(
    Math.abs(
      mixed.breakdown.transcriptionMicrousd - (scans.breakdown.transcriptionMicrousd * 4) / 10
    ) < 2000
  );
  assert.equal(
    estimateReading({ mode: 'text', pages: 10, scanPages: 4 }).scanPages,
    0,
    'text mode never transcribes'
  );
  assert.throws(() => estimateReading({ mode: 'image', pages: 3, scanPages: 4 }), {
    code: 'invalid_request'
  });
});

test('the estimate route sends nothing to a model, counts pages and refuses what is not a count', async () => {
  const { s, ai } = await setup();
  const answer = await s.handle(
    request('POST', ['estimate'], { body: { mode: 'image', pages: 12 } })
  );
  assert.equal(answer.status, 200);
  assert.equal(answer.body.estimate.pages, 12);
  assert.equal(answer.body.limits.pagesPerReading, 80);
  assert.deepEqual([ai.chats.length, ai.fake.calls.length], [0, 0]);
  for (const body of [
    { mode: 'scan', pages: 3 },
    { mode: 'text', pages: 0 },
    { mode: 'text', pages: 2.5 },
    { mode: 'text' },
    { mode: 'text', pages: 3, characters: -1 }
  ]) {
    const refused = await s.handle(request('POST', ['estimate'], { body }));
    assert.equal(refused.status, 400, JSON.stringify(body));
  }
  const over = await s.handle(
    request('POST', ['estimate'], { body: { mode: 'image', pages: 81 } })
  );
  assert.equal(over.status, 422);
  assert.equal(over.body.error, 'too_many_pages');
  assert.equal(over.body.max, 80);
});

test("the pages limit is the deployment's to change and counts pages read, never the file", async () => {
  const { s } = await setup({ env: { FR_URBAN_RULES_LIMIT_UPLOAD_PAGES: '3' } });
  const over = await startReading(s, textPages(44, 47));
  assert.equal(over.status, 422);
  assert.equal(over.body.error, 'too_many_pages');
  // Three pages out of a 112-page file are fine: the file's own size is not a field of the request at all.
  assert.equal((await startReading(s, textPages(44, 46))).status, 202);
  await s.idle();
});

// ── The vision step ─────────────────────────────────────────────────────────────────────────

test("a page image is transcribed by Sonnet through the plain chat call, with the measured instruction and the account's subject", async () => {
  const { s, ai } = await setup();
  const answer = await transcribe(s, {
      body: { page: 67, image: IMAGE },
      features: ['ai-anthropic']
    });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.page, 67);
  assert.match(answer.body.text, /Article 09-03/);
  assert.equal(answer.body.truncated, false);
  const [{ request: sent, route }] = ai.chats;
  assert.equal(sent.userMessage, TRANSCRIPTION_PROMPT);
  assert.match(sent.userMessage, /\[illisible\]/);
  assert.match(sent.userMessage, /\[tampon\]/);
  assert.deepEqual(sent.images, [IMAGE]);
  assert.equal(sent.maxTokens, TRANSCRIPTION_MAX_TOKENS);
  assert.ok(sent.maxTokens > 4096, 'room for a table of 91 lots (Haiku was cut at 4,096)');
  assert.equal(route.providerId, 'anthropic');
  assert.equal(route.model, 'claude-sonnet-5-5');
  assert.equal(route.aiSubject, ALICE.subject, "metered to the account's subject");
  assert.deepEqual(route.features, ['ai-anthropic']);
});

test('a transcription cut off by its output limit says so, and an empty one is unreadable', async () => {
  const { s } = await setup({
    ai: scripted({
      chat: async (_r, _o, n) => ({
        providerId: 'anthropic',
        model: 'claude-sonnet-5-5',
        content: n === 1 ? 'Lotissement… tableau des lots 1 5 2 062 m²' : '   ',
        finishReason: n === 1 ? 'length' : 'stop'
      })
    })
  });
  const cut = await transcribe(s, { body: { page: 74, image: IMAGE } });
  assert.equal(cut.status, 200);
  assert.equal(cut.body.truncated, true);
  const empty = await transcribe(s, { body: { page: 75, image: IMAGE } });
  // Addendum A: an empty reply is a page that is UNREADABLE (a result the reading goes on past), no longer an error that ends it.
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.unreadable, { reason: 'empty' });
  assert.equal(empty.body.text, '', 'nothing is handed on');
});

test('a page that is mostly « [illisible] » (handwriting) is flagged', async () => {
  const { s } = await setup({
    ai: scripted({
      chat: async () => ({
        providerId: 'anthropic',
        model: 'm',
        content: '[illisible] [illisible] [illisible] merci [illisible]',
        finishReason: 'stop'
      })
    })
  });
  const answer = await transcribe(s, { body: { page: 112, image: IMAGE } });
  assert.equal(answer.body.illegible, true);
});

test("an account's budget stop on a transcription is the 402 with its numbers, and a provider it may not use is the AI service's own code", async () => {
  const stop = new AiError('ai_budget_exhausted', 402, {
    remainingMicrousd: 1200,
    budgetMicrousd: 5_000_000,
    resetsAt: '2026-12-01T00:00:00.000Z',
    reason: 'exhausted'
  });
  const budget = await setup({
    ai: scripted({
      chat: async () => {
        throw stop;
      }
    })
  });
  const refused = await transcribe(budget.s, { body: { page: 1, image: IMAGE } });
  assert.equal(refused.status, 402);
  assert.equal(refused.body.error, 'ai_budget_exhausted');
  assert.equal(refused.body.remainingMicrousd, 1200);
  assert.equal(refused.body.resetsAt, '2026-12-01T00:00:00.000Z');
  const forbidden = await setup({
    ai: scripted({
      chat: async () => {
        throw new AiError('provider_not_permitted', 403);
      }
    })
  });
  const no = await transcribe(forbidden.s, { body: { page: 1, image: IMAGE } });
  assert.equal(no.status, 403);
  assert.equal(no.body.error, 'provider_not_permitted');
  assert.equal(no.body.providerId, 'anthropic');
});

test('a provider error is retried once, a page that never reached a model gives its place back', async () => {
  let calls = 0;
  const flaky = await setup({
    ai: scripted({
      chat: async () => {
        calls += 1;
        if (calls === 1) throw new AiError('provider_error', 502);
        return { providerId: 'anthropic', model: 'm', content: 'texte', finishReason: 'stop' };
      }
    })
  });
  assert.equal(
    (await transcribe(flaky.s, { body: { page: 1, image: IMAGE } }))
      .status,
    200
  );
  assert.equal(calls, 2);
  const down = await setup({
    ai: scripted({
      chat: async () => {
        throw new AiError('unreachable', 0);
      }
    }),
    env: { FR_URBAN_RULES_LIMIT_UPLOAD_TRANSCRIBED_HOUR: '1' }
  });
  const first = await transcribe(down.s, { body: { page: 1, image: IMAGE } });
  assert.equal(first.status, 502);
  assert.equal(first.body.error, 'transcription_failed');
  const second = await transcribe(down.s, { body: { page: 1, image: IMAGE } });
  assert.equal(second.status, 502, "the failed page did not use the hour's only place");
});

test('a page that failed after a long wait is not tried again: the second try would outlast the proxy while being paid for', async () => {
  let now = 1_000_000;
  let calls = 0;
  const ai = scripted({
    chat: async () => {
      calls += 1;
      now += 95_000;
      throw new AiError('unreachable', 0);
    }
  });
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-uploads-'));
  const s = await createService({
    env: { FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000' },
    log: () => {},
    dataDir,
    ai,
    fetcher: {},
    parse: async () => ({}),
    clock: () => now,
    watch: false
  });
  const answer = await transcribe(s, { body: { page: 74, image: IMAGE } });
  assert.equal(answer.status, 502);
  assert.equal(calls, 1);
});

test('transcribed pages are limited an hour per user, and a body that is not an image is refused', async () => {
  const { s } = await setup({ env: { FR_URBAN_RULES_LIMIT_UPLOAD_TRANSCRIBED_HOUR: '2' } });
  const ask = (who = ALICE) =>
    transcribe(s, { body: { page: 1, image: IMAGE }, who });
  assert.equal((await ask()).status, 200);
  assert.equal((await ask()).status, 200);
  const third = await ask();
  assert.equal(third.status, 429);
  assert.equal((await ask(BOB)).status, 200, 'another user has their own hour');
  for (const body of [
    { page: 1 },
    { page: 0, image: IMAGE },
    { page: 1, image: { mediaType: 'application/pdf', data: 'QQ==' } },
    { page: 1, image: { mediaType: 'image/png', data: 'not base64!' } },
    { page: 1, image: { mediaType: 'image/png', data: 'A'.repeat(800 * 1024) } }
  ]) {
    assert.equal(
      (
        await transcribe(s, { body, who: { user: 'carol', hash: 'h3' } })
      ).status,
      400,
      JSON.stringify(body).slice(0, 80)
    );
  }
});

// ── The reading ────────────────────────────────────────────────────────────────────────────

test("a reading of page text gives the PLU reading's candidates, each with its source, in the same shape", async () => {
  const { s } = await setup();
  const job = await read(s, textPages(), ALICE, 'doc-lots');
  assert.equal(job.state, 'done');
  const result = job.result;
  assert.equal(result.upload, true);
  assert.deepEqual(result.document, { documentId: 'doc-lots', pages: 7 });
  assert.equal(result.reading.mode, 'text');
  assert.deepEqual(result.reading.pages, [44, 45, 46, 47, 48, 49, 50]);
  assert.deepEqual(result.reading.transcribedPages, []);
  assert.ok(result.rules.length >= 1);
  for (const r of result.rules) {
    assert.deepEqual(r.source, { documentId: 'doc-lots', page: r.page });
    assert.equal(r.fromTranscript, undefined);
    assert.equal(typeof r.passage, 'string');
    assert.ok(Array.isArray(r.doubts), 'the same verification as the PLU reading');
  }
  assert.equal(result.rules[0].page, 44);
  assert.equal(result.model.providerId, 'anthropic', 'the reading asked for the approved model');
  assert.equal(result.model.model, 'claude-sonnet-5-5');
  assert.ok(result.chunks.of >= 2, 'read in parts');
});

test('rules read from a transcript say so, and the pages a transcription cut off are listed', async () => {
  const { s } = await setup();
  const pages = textPages().map((p) => ({ ...p, transcribed: true, truncated: p.page === 48 }));
  const job = await read(s, pages);
  assert.equal(job.result.reading.mode, 'image');
  assert.deepEqual(job.result.reading.truncatedPages, [48]);
  assert.deepEqual(job.result.reading.transcribedPages, [44, 45, 46, 47, 48, 49, 50]);
  assert.ok(job.result.rules.every((r) => r.fromTranscript === true));
});

test("the verification is the PLU reading's: a figure not in its passage lowers the confidence", async () => {
  const ai = scripted({
    plan: () => [
      {
        value: rule({
          kind: 'height_total',
          statement: 'limit',
          limit: { kind: 'value', comparison: 'max', value: 9.5, unit: 'm' }
        }),
        passage: PASSAGE
      }
    ]
  });
  const { s } = await setup({ ai });
  const job = await read(s, textPages(44, 44));
  const [first] = job.result.rules;
  assert.equal(first.confidence, 'low');
  assert.ok(first.doubts.includes('figure-not-in-text'));
});

test("a reading is private: nothing on disk, no memo shared with another account, no other user's poll, and DELETE drops it", async () => {
  const { s, ai, dataDir } = await setup();
  const mine = await read(s, textPages(), ALICE, 'doc-a');
  const callsAfterAlice = ai.fake.calls.length;
  assert.ok(callsAfterAlice >= 2);
  // The same text again, by someone else: every chunk is asked again and charged to them (no memo, no cache).
  const theirs = await read(s, textPages(), BOB, 'doc-b');
  assert.equal(ai.fake.calls.length, callsAfterAlice * 2, 'the second reading used no shared memo');
  assert.deepEqual(ai.fake.routes.at(-1).aiSubject, BOB.subject);
  assert.deepEqual(ai.fake.routes[0].aiSubject, ALICE.subject);
  // Not on disk: the result cache holds no entry, and the data directory holds no file of this reading.
  const files = (dir) => readdirSync(dir, { recursive: true }).map(String);
  assert.deepEqual(
    files(dataDir).filter((f) => /extractions\/.+/u.test(f)),
    []
  );
  assert.ok(!files(dataDir).some((f) => f.includes(mine.jobId) || f.includes(theirs.jobId)));
  // Another user's poll, cancel and delete of alice's job: it does not exist for them.
  for (const [method, segments] of [
    ['GET', ['readings', mine.jobId]],
    ['POST', ['readings', mine.jobId, 'cancel']],
    ['DELETE', ['readings', mine.jobId]]
  ]) {
    const refused = await s.handle(request(method, segments, { who: BOB }));
    assert.equal(refused.status, 404, `${method} by another user`);
  }
  assert.equal((await poll(s, mine.jobId)).status, 200);
  assert.equal(s.uploadsHeld(), 2);
  assert.equal((await s.handle(request('DELETE', ['readings', mine.jobId]))).status, 200);
  assert.equal((await poll(s, mine.jobId)).status, 404);
  assert.equal(s.uploadsHeld(), 1);
});

test('a finished reading is forgotten after half an hour', async () => {
  let now = 1_000_000;
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-uploads-'));
  const s = await createService({
    env: { FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000' },
    log: () => {},
    dataDir,
    ai: scripted(),
    fetcher: {},
    parse: async () => ({}),
    clock: () => now,
    watch: false
  });
  const job = await read(s, textPages(44, 44));
  assert.equal((await poll(s, job.jobId)).status, 200);
  now += 31 * 60_000;
  assert.equal((await poll(s, job.jobId)).status, 404);
  assert.equal(s.uploadsHeld(), 0);
});

test("a budget stop between parts keeps the parts read, never caches, and a stop before any part is the job's error", async () => {
  const stop = new AiError('ai_budget_exhausted', 402, {
    remainingMicrousd: 10,
    budgetMicrousd: 5_000_000,
    resetsAt: '2026-12-01T00:00:00.000Z',
    reason: 'exhausted'
  });
  let extracts = 0;
  const ai = scripted();
  const real = ai.extract;
  ai.extract = async (request, route) => {
    extracts += 1;
    if (extracts >= 2) throw stop;
    return real(request, route);
  };
  const { s } = await setup({ ai });
  const job = await read(s, textPages());
  assert.equal(job.state, 'done');
  assert.equal(job.result.stopped.reason, 'ai-budget');
  assert.equal(job.result.stopped.remainingMicrousd, 10);
  assert.equal(job.result.chunks.unread, job.result.chunks.of - 1);
  assert.ok(job.result.rules.length >= 1, 'the part read before the stop is kept');
  const none = scripted();
  none.extract = async () => {
    throw stop;
  };
  const refused = await read((await setup({ ai: none })).s, textPages());
  assert.equal(refused.state, 'failed');
  assert.equal(refused.error.code, 'ai_budget_exhausted');
  assert.equal(refused.error.budgetMicrousd, 5_000_000);
});

test('a scan with nothing readable is no_text_layer, and a reading can be cancelled while it waits for the model', async () => {
  const { s } = await setup();
  const blank = await read(s, [{ page: 1, text: '[illisible]' }]);
  assert.equal(blank.state, 'failed');
  assert.equal(blank.error.code, 'no_text_layer');
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const ai = scripted();
  const real = ai.extract;
  ai.extract = async (request, route) => {
    await gate;
    if (route.signal.aborted) throw new Error('aborted');
    return real(request, route);
  };
  const held = await setup({ ai });
  const started = await startReading(held.s);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const cancelled = await held.s.handle(
    request('POST', ['readings', started.body.jobId, 'cancel'])
  );
  assert.equal(cancelled.status, 200);
  release();
  await held.s.idle();
  const after = (await poll(held.s, started.body.jobId)).body;
  assert.equal(after.state, 'failed');
  assert.equal(after.error.code, 'cancelled');
});

test('bodies and methods: pages must be ascending and within the limit, readings are limited an hour, only the uploads take a large body', async () => {
  const { s } = await setup({ env: { FR_URBAN_RULES_LIMIT_UPLOAD_READINGS_HOUR: '2' } });
  const bad = (body) => s.handle(request('POST', ['readings'], { body }));
  assert.equal((await bad({ pages: textPages() })).status, 400, 'a document id is required');
  assert.equal((await bad({ documentId: 'a b', pages: textPages() })).status, 400);
  assert.equal((await bad({ documentId: 'd', pages: [] })).status, 400);
  assert.equal(
    (
      await bad({
        documentId: 'd',
        pages: [
          { page: 5, text: 'x'.repeat(300) },
          { page: 4, text: 'y' }
        ]
      })
    ).status,
    400,
    'ascending'
  );
  assert.equal((await bad({ documentId: 'd', pages: [{ page: 1, text: 3 }] })).status, 400);
  assert.equal((await s.handle(request('PUT', ['readings']))).status, 400);
  assert.equal((await s.handle(request('GET', ['nowhere']))).status, 404);
  assert.equal((await startReading(s)).status, 202);
  assert.equal((await startReading(s)).status, 202);
  assert.equal((await startReading(s)).status, 429);
  await s.idle();
  assert.equal(
    s.maxBodyBytes({ method: 'POST', segments: ['v1', 'uploads', 'transcriptions'] }),
    UPLOAD_BODY_BYTES
  );
  assert.ok(UPLOAD_BODY_BYTES < 1024 * 1024, "under the web proxy's 1 MiB");
  assert.equal(s.maxBodyBytes({ method: 'POST', segments: ['v1', 'extractions'] }), undefined);
  assert.equal(
    s.maxBodyBytes({ method: 'GET', segments: ['v1', 'uploads', 'readings', 'x'] }),
    undefined
  );
});

test('no log line holds a page, a transcript, a passage or a rule', async () => {
  const { s, capture } = await setup();
  await transcribe(s, { body: { page: 3, image: IMAGE } });
  const job = await read(s, textPages());
  await poll(s, job.jobId);
  const logged = capture.text();
  assert.ok(logged.includes('upload_reading'), 'it logs, with counts');
  assert.ok(!logged.includes('occupations et utilisations du sol'), 'no passage');
  assert.ok(!logged.includes('Article 09-03'), 'no transcript');
  assert.ok(!logged.includes(IMAGE.data), 'no image');
  assert.ok(!logged.includes(ALICE.subject), 'no subject');
});

// ── The client of the chat route ───────────────────────────────────────────────────────────

test("the AI client's chat sends only what a plain call needs and the account's headers, and reads the finish reason", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({
        url: req.url,
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          providerId: 'anthropic',
          model: 'claude-sonnet-5-5',
          content: 'texte',
          finishReason: 'length'
        })
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => {
    server.closeAllConnections();
    server.close();
  });
  const client = createAiClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    dispatcher: async () => undefined
  });
  const answer = await client.chat(
    { userMessage: 'transcribe', images: [IMAGE], maxTokens: 8192 },
    {
      providerId: 'anthropic',
      model: 'claude-sonnet-5-5',
      features: ['ai-anthropic'],
      aiSubject: ALICE.subject
    }
  );
  assert.deepEqual(answer, {
    providerId: 'anthropic',
    model: 'claude-sonnet-5-5',
    content: 'texte',
    finishReason: 'length'
  });
  const [call] = seen;
  assert.equal(call.url, '/api/ai/chat');
  assert.deepEqual(call.body, {
    providerId: 'anthropic',
    model: 'claude-sonnet-5-5',
    systemPrompt: '',
    history: [],
    userMessage: 'transcribe',
    images: [IMAGE],
    maxTokens: 8192
  });
  assert.equal(call.headers[AI_SUBJECT_HEADER], ALICE.subject);
  assert.equal(call.headers['x-authenticated-features'], 'ai-anthropic');
  assert.equal(call.headers.authorization, undefined);
  assert.equal(call.headers[USAGE_PURPOSE_HEADER], undefined, 'a chat call that does not say it transcribes names no purpose');
});

test('a page transcription carries the usage purpose header « transcribe » to the AI service, and an extract call never does', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          req.url === '/api/ai/chat'
            ? { providerId: 'anthropic', model: 'm', content: 'texte', finishReason: 'stop' }
            : { items: [], rejected: [], providerId: 'anthropic', model: 'm' }
        )
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => {
    server.closeAllConnections();
    server.close();
  });
  const client = createAiClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    dispatcher: async () => undefined
  });
  const route = { providerId: 'anthropic', features: ['ai-anthropic'], aiSubject: ALICE.subject };
  // The service's own transcription call.
  const { s } = await setup({ ai: { ...client, health: scripted().health } });
  const answer = await transcribe(s, { body: { page: 1, image: IMAGE } });
  assert.equal(answer.status, 200);
  await client.extract({ instructions: 'i', text: 't', itemSchema: {}, maxItems: 1 }, route);
  const chat = seen.find((c) => c.url === '/api/ai/chat');
  const extract = seen.find((c) => c.url === '/api/ai/extract');
  assert.equal(chat.headers[USAGE_PURPOSE_HEADER], 'transcribe');
  assert.equal(chat.headers['x-ai-usage-purpose'], 'transcribe', 'the header, lowercase, with this value exactly');
  assert.equal(extract.headers[USAGE_PURPOSE_HEADER], undefined, 'extraction and every other call send none');
});
