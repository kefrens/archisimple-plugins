/**
 * Sprint 002.30 — reading a document the person added to the project (SDK 1.44, `project-documents`).
 *
 * No network, no model: the project's documents and the companion service are scripted. What is asserted is the order
 * (the estimate and the cost heads-up BEFORE anything is sent), what is sent (one page picture a request), what comes
 * back (rules to confirm, each with its source, never applied automatically), and what survives (the reading is kept in
 * the project, a budget stop keeps what was read).
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, createReader, readingCardOf } from '../src/index.js';
import { FIXTURES, loadPlot, recordedFetch, recordedSiteService, requestFor } from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const { createDocumentReadings, pageRangeOf, documentRulesOf, autoApplyAllowed } = __testing;

const BASE = 'https://editor.example/plugins-api/com.archisimple.fr-urban-rules/';
const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  text: async () => JSON.stringify(body)
});
const signal = () => new AbortController().signal;

const SCAN = {
  id: 'doc-scan',
  name: 'Règlement Les Michels',
  kind: 'lotissement',
  pageCount: 112,
  bytes: 30_000_000,
  hash: 'a'.repeat(64),
  carried: true
};
const TEXT = {
  id: 'doc-text',
  name: 'Cahier des charges',
  kind: 'cahier-des-charges',
  pageCount: 12,
  bytes: 400_000,
  hash: 'b'.repeat(64),
  carried: true
};

const LONG =
  'Article 09-03. La hauteur maximale des constructions est limitée à sept mètres. '.repeat(6);
const RULE = {
  kind: 'height_total',
  sector: null,
  statement: 'limit',
  limit: { kind: 'value', comparison: 'max', value: 7, unit: 'm' },
  page: 61,
  article: '09-03',
  passage: 'La hauteur maximale des constructions est limitée à 7 m.',
  offset: { start: 1, end: 10 },
  occurrence: { of: 1, chosenBy: 'only' },
  conditions: [],
  exceptions: [],
  sectorUnplaced: false,
  confidence: 'high',
  doubts: [],
  source: { documentId: 'doc-scan', page: 61 },
  fromTranscript: true
};

/** The project's documents service, scripted: what was asked of it is recorded. */
function scriptedDocuments({ docs = [SCAN], texts = {}, failRender = false } = {}) {
  const calls = [];
  return {
    calls,
    list: () => docs,
    get: (id) => docs.find((d) => d.id === id),
    requestAdd: async (options) => {
      calls.push(['requestAdd', options]);
      return undefined;
    },
    readText: async (id, options) => {
      calls.push(['readText', id, options?.pages]);
      const { first, last } = options.pages;
      const pages = [];
      for (let page = first; page <= last; page += 1) {
        const text = texts[id]?.(page) ?? '';
        pages.push({ page, text, hasText: text.trim() !== '', truncated: false });
      }
      return { ok: true, documentId: id, pages, hasText: pages.some((p) => p.hasText) };
    },
    renderPages: async (id, pages) => {
      calls.push(['renderPages', id, pages]);
      if (failRender) return { ok: false, reason: 'unreadable', message: 'x' };
      return {
        ok: true,
        documentId: id,
        images: pages.map((page) => ({
          page,
          bytes: new Uint8Array([255, 216, page]),
          mimeType: 'image/jpeg',
          pixelWidth: 1000,
          pixelHeight: 1400
        }))
      };
    },
    open: (target) => {
      calls.push(['open', target]);
      return true;
    },
    onDidChange: () => ({ dispose() {} })
  };
}

/** The companion service, scripted by path; every call is recorded in order. */
function scriptedService({ transcribe, result, estimate } = {}) {
  const calls = [];
  const pages = new Map();
  const fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname.replace(
      '/plugins-api/com.archisimple.fr-urban-rules/',
      ''
    );
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    calls.push({ method, path, body, headers: init.headers });
    if (path === 'v1/uploads/estimate' && body.ai !== undefined)
      return json(
        200,
        estimate?.(body) ?? {
          estimate: {
            mode: body.mode,
            pages: body.pages,
            scanPages: body.scanPages ?? 0,
            route: 'local',
            model: body.ai,
            // The hybrid: a free transcription, the extraction on Sonnet.
            extractionModel: { providerId: 'anthropic', model: 'claude-sonnet-5-5' },
            microusd: 80_000,
            aboutUsd: 0.08,
            lowUsd: 0.05,
            highUsd: 0.13,
            breakdown: { transcriptionMicrousd: 0, extractionMicrousd: 80_000 },
            compare: { model: { providerId: 'anthropic', model: 'claude-sonnet-5-5' }, aboutUsd: 0.4, lowUsd: 0.24, highUsd: 0.64, perPageUsd: 0.024 },
            timing: { cloudSecondsPerPage: 13, local: { known: false, measuredSecondsPerPage: { fast: 46, slow: 773 } } },
            priceTable: { version: '2026-11-19' }
          },
          limits: { pagesPerReading: 80 }
        }
      );
    if (path === 'v1/uploads/estimate')
      return json(
        200,
        estimate?.(body) ?? {
          estimate: {
            mode: body.mode,
            pages: body.pages,
            scanPages: body.scanPages ?? 0,
            model: { providerId: 'anthropic', model: 'claude-sonnet-5-5' },
            microusd: 400_000,
            aboutUsd: 0.4,
            lowUsd: 0.24,
            highUsd: 0.64,
            breakdown: {},
            priceTable: { version: '2026-11-19' }
          },
          limits: { pagesPerReading: 80 }
        }
      );
    if (path === 'v1/uploads/transcriptions' && method === 'POST') {
      // Addendum A: a page is a job (202, then a poll). `transcribe(body, n)` says what the page's job ends with.
      const n = calls.filter((c) => c.path === path).length;
      const id = `page-${n}`;
      pages.set(id, { body, answer: transcribe?.(body, n), polls: 0 });
      return json(202, { jobId: id, state: 'queued', route: body.ai === undefined ? 'cloud' : 'local' });
    }
    const pageJob = /^v1\/uploads\/transcriptions\/(page-\d+)(\/cancel)?$/u.exec(path);
    if (pageJob !== null) {
      const held = pages.get(pageJob[1]);
      if (method !== 'GET') return json(200, { removed: true });
      held.polls += 1;
      const { answer, body: asked } = held;
      if (answer?.running !== undefined && held.polls <= answer.running)
        return json(200, { jobId: pageJob[1], state: 'running', progress: { step: 'transcribing', elapsedMs: 65_000 * held.polls, timeoutMs: 900_000 } });
      if (answer?.error)
        return json(200, { jobId: pageJob[1], state: 'failed', error: { code: answer.error, ...(answer.details ?? {}) } });
      const { running: _running, ...extra } = answer ?? {};
      return json(200, {
        jobId: pageJob[1],
        state: 'done',
        progress: { step: 'done' },
        result: { page: asked.page, text: `${LONG}`, truncated: false, illegible: false, route: asked.ai === undefined ? 'cloud' : 'local', ...extra }
      });
    }
    if (path === 'v1/uploads/readings' && method === 'POST')
      return json(202, { jobId: 'job-1', state: 'queued' });
    if (path === 'v1/uploads/readings/job-1' && method === 'GET')
      return json(200, {
        jobId: 'job-1',
        state: 'done',
        progress: { step: 'done' },
        result:
          result?.(calls) ??
          readingResult(
            // The service says which route read: the reading POSTed with `ai` is the local one.
            calls.findLast((c) => c.path === 'v1/uploads/readings' && c.method === 'POST')?.body.ai === undefined
              ? {}
              : { reading: { mode: 'image', route: 'local', pages: [60, 61, 62], transcribedPages: [60, 61, 62], truncatedPages: [], unreadablePages: [] } }
          )
      });
    if (path === 'v1/uploads/readings/job-1' && method === 'DELETE')
      return json(200, { removed: true });
    return json(404, { error: 'not_found' });
  };
  return { fetch, calls };
}

function readingResult(extra = {}) {
  return {
    schemaVersion: 2,
    promptVersion: 5,
    upload: true,
    document: { documentId: 'doc-scan', pages: 3 },
    reading: {
      mode: 'image',
      pages: [60, 61, 62],
      transcribedPages: [60, 61, 62],
      truncatedPages: []
    },
    rules: [RULE],
    dropped: {},
    chunks: { of: 1, failed: 0 },
    model: { providerId: 'anthropic', model: 'claude-sonnet-5-5', constraint: 'schema' },
    extractedAt: '2026-11-21T10:00:00.000Z',
    ...extra
  };
}

function store(initial) {
  let held = initial;
  return {
    held: () => held,
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next) => {
        held = structuredClone(next);
        return true;
      }
    }
  };
}

const LM_STUDIO = { providerId: 'lmstudio', model: 'qwen/qwen3-vl-8b' };
/** The host's `ai` service as an extension is given it: the AI panel's choice as a name (SDK 1.40). */
const panelChoice = (selected) => () => ({ selectedModel: () => selected });
function setup({
  documents = scriptedDocuments(),
  service = scriptedService(),
  section,
  writable = true,
  ai,
  wait = async () => {}
} = {}) {
  const data = store(section);
  let signals = 0;
  const readings = createDocumentReadings({
    documents: () => documents,
    pluginService: () => ({ locate: async () => ({ baseUrl: BASE }) }),
    fetch: service.fetch,
    ...(ai === undefined ? {} : { ai }),
    now: () => new Date('2026-11-21T10:00:00.000Z'),
    wait,
    requestSignal: () => {
      signals += 1;
    },
    packageData: () => (writable ? data.service : { read: data.service.read }),
    translate: (key) => key,
    log: () => {}
  });
  return { readings, documents, service, data, signals: () => signals };
}
const subject = (id, extra = '') => ({ subjectId: `doc=${encodeURIComponent(id)}${extra}` });
const plan = (c, id, from, to, route) =>
  c.readings.runAction({
    actionId: 'doc-plan',
    target: subject(id),
    values: { from, to, ...(route === undefined ? {} : { route }) }
  });
const readIt = (c, id = 'doc-scan', values = { confirm: 'yes' }) =>
  c.readings.runAction({ actionId: 'doc-read', target: subject(id), values });
const blocksOf = (c) => c.readings.stateOf().blocks;
const flat = (blocks) => blocks.flatMap((b) => (b.kind === 'section' ? flat(b.blocks) : [b]));
const actionsOf = (c) =>
  flat(blocksOf(c))
    .filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions);
const settle = async (c) => {
  for (let i = 0; i < 40; i += 1) await new Promise((r) => setImmediate(r));
  return c;
};

// ── The page range ──────────────────────────────────────────────────────────────────────────

test('the pages to read: a range inside the document, whole numbers, at most the limit', () => {
  assert.deepEqual(pageRangeOf({ from: 59, to: 75 }, 112), {
    ok: true,
    from: 59,
    to: 75,
    pages: 17
  });
  assert.deepEqual(pageRangeOf({ from: 5, to: 5 }, 112), { ok: true, from: 5, to: 5, pages: 1 });
  assert.deepEqual(
    pageRangeOf({ from: '59', to: '75' }, 112).pages,
    17,
    'a typed number is accepted'
  );
  assert.equal(pageRangeOf({ from: 75, to: 59 }, 112).reason, 'order');
  assert.equal(pageRangeOf({ from: 0, to: 3 }, 112).reason, 'range');
  assert.equal(pageRangeOf({ from: 100, to: 113 }, 112).reason, 'range');
  assert.equal(pageRangeOf({ from: 1.5, to: 3 }, 112).reason, 'range');
  assert.equal(pageRangeOf({ from: 1, to: 112 }, 112).reason, 'too-many');
  assert.equal(pageRangeOf({ from: 1, to: 112 }, 112).max, 80);
  assert.equal(
    pageRangeOf({ from: 1, to: 112 }, 112, 120).ok,
    true,
    "the service's own limit decides"
  );
  assert.equal(pageRangeOf({}, 112).reason, 'range');
});

// ── The offer ───────────────────────────────────────────────────────────────────────────────

test('without the project-documents service the extension offers nothing, and with no document it offers to add one', async () => {
  const none = createDocumentReadings({
    documents: () => undefined,
    pluginService: () => undefined,
    fetch: async () => json(404, {}),
    now: () => new Date(),
    wait: async () => {},
    requestSignal() {},
    packageData: () => undefined,
    translate: (k) => k,
    log() {}
  });
  assert.deepEqual(none.stateOf(), { sources: [], blocks: [] });
  assert.equal(none.available(), false);
  const empty = setup({ documents: scriptedDocuments({ docs: [] }) });
  assert.equal(empty.readings.available(), true);
  const blocks = blocksOf(empty);
  assert.ok(
    blocks.some((b) => b.kind === 'heading' && b.text.key === 'fr-urban-rules.documents.heading')
  );
  assert.ok(
    blocks.some((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.none')
  );
  assert.deepEqual(
    actionsOf(empty).map((a) => a.id),
    ['doc-add']
  );
});

test("« Add a document » opens the host's own dialog, with the kind the reading card or the view hints at", async () => {
  const c = setup();
  assert.equal(
    (await c.readings.runAction({ actionId: 'doc-add', target: {}, values: {} })).status,
    'done'
  );
  assert.deepEqual(c.documents.calls.at(-1), ['requestAdd', undefined]);
  await c.readings.requestAdd({ kind: 'lotissement' });
  assert.deepEqual(c.documents.calls.at(-1), ['requestAdd', { kind: 'lotissement' }]);
});

test('the reading card offers « add a document » in its end states only, and only when the host has the service', () => {
  const result = {
    rules: [],
    chunks: { failed: 0, of: 1 },
    model: { providerId: 'x', model: 'y' },
    document: { pages: 3 }
  };
  const view = (state, extra = {}) => ({
    id: 1,
    zone: 'UC',
    state,
    result: state === 'done' ? result : undefined,
    error: state === 'failed' ? { code: 'no_text_layer' } : undefined,
    progress: {},
    ...extra
  });
  const idsOf = (v) => readingCardOf(v).actions.map((a) => a.id);
  assert.ok(idsOf(view('done', { canAddDocument: true })).includes('add-document'));
  assert.ok(idsOf(view('failed', { canAddDocument: true })).includes('add-document'));
  assert.ok(!idsOf(view('done', {})).includes('add-document'));
  assert.ok(
    !idsOf(view('reading', { canAddDocument: true })).includes('add-document'),
    'not while it is reading'
  );
});

// ── The estimate and the heads-up, before anything is sent ───────────────────────────────────

test('choosing pages asks for the estimate only: no page, no picture, no model call; and the heads-up names the cost', async () => {
  const c = setup();
  const answer = await plan(c, 'doc-scan', 59, 75);
  assert.equal(answer.status, 'done');
  const sent = c.service.calls.map((x) => x.path);
  assert.deepEqual(sent, ['v1/uploads/estimate'], 'only the estimate left the editor');
  assert.deepEqual(c.service.calls[0].body, {
    mode: 'image',
    pages: 17,
    scanPages: 17,
    characters: 0
  });
  assert.ok(!c.documents.calls.some(([name]) => name === 'renderPages'), 'no picture was drawn');
  const blocks = flat(blocksOf(c));
  const heads = blocks.find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.estimate.headsUp'
  );
  assert.ok(heads, 'the heads-up about the AI budget');
  assert.equal(heads.tone, 'warning');
  assert.equal(heads.text.params.pages, 17);
  assert.equal(heads.text.params.scans, 17);
  assert.match(heads.text.params.cost, /0[,.]40/);
  assert.equal(heads.text.params.model, 'claude-sonnet-5-5');
  const read = actionsOf(c).find((a) => a.id === 'doc-read');
  assert.ok(read, 'reading is offered after the estimate');
  const confirm = read.fields.find((f) => f.key === 'confirm');
  assert.equal(confirm.required, true);
  assert.equal(confirm.kind, 'choice');
  assert.match(
    JSON.stringify(confirm.options[0].label.params),
    /0[,.]40/,
    'the confirmation names the cost'
  );
});

test('a range over the limit or outside the document is refused before the estimate', async () => {
  const c = setup();
  for (const [from, to] of [
    [1, 112],
    [100, 113],
    [20, 10]
  ]) {
    const refused = await plan(c, 'doc-scan', from, to);
    assert.equal(refused.status, 'refused', `${from}-${to}`);
  }
  assert.equal(c.service.calls.length, 0);
});

test('a range of text pages is estimated as text (no scan), a mixed one counts its scans', async () => {
  const text = setup({
    documents: scriptedDocuments({ docs: [TEXT], texts: { 'doc-text': () => LONG } })
  });
  await plan(text, 'doc-text', 1, 4);
  assert.deepEqual(
    { ...text.service.calls[0].body, characters: undefined },
    { mode: 'text', pages: 4, scanPages: 0, characters: undefined }
  );
  assert.equal(text.service.calls[0].body.characters, LONG.length * 4);
  const mixed = setup({
    documents: scriptedDocuments({
      docs: [TEXT],
      texts: { 'doc-text': (page) => (page <= 2 ? LONG : '') }
    })
  });
  await plan(mixed, 'doc-text', 1, 4);
  assert.equal(mixed.service.calls[0].body.mode, 'image');
  assert.equal(mixed.service.calls[0].body.scanPages, 2);
});

test('reading without the confirmation is refused and sends nothing; so is reading with no estimate', async () => {
  const c = setup();
  assert.equal((await readIt(c, 'doc-scan')).status, 'refused', 'no estimate yet');
  await plan(c, 'doc-scan', 59, 61);
  const before = c.service.calls.length;
  assert.equal((await readIt(c, 'doc-scan', {})).status, 'refused', 'no confirmation');
  assert.equal(c.service.calls.length, before);
  assert.ok(!c.documents.calls.some(([name]) => name === 'renderPages'));
});

// ── The reading ─────────────────────────────────────────────────────────────────────────────

test('a scan is transcribed one page picture at a time, then read in parts; the rules come back to confirm with their source', async () => {
  const c = setup();
  await plan(c, 'doc-scan', 60, 62);
  await readIt(c);
  await settle(c);
  const paths = c.service.calls.map((x) => `${x.method} ${x.path}`);
  assert.deepEqual(paths, [
    'POST v1/uploads/estimate',
    'POST v1/uploads/transcriptions',
    'GET v1/uploads/transcriptions/page-1',
    'DELETE v1/uploads/transcriptions/page-1',
    'POST v1/uploads/transcriptions',
    'GET v1/uploads/transcriptions/page-2',
    'DELETE v1/uploads/transcriptions/page-2',
    'POST v1/uploads/transcriptions',
    'GET v1/uploads/transcriptions/page-3',
    'DELETE v1/uploads/transcriptions/page-3',
    'POST v1/uploads/readings',
    'GET v1/uploads/readings/job-1',
    'DELETE v1/uploads/readings/job-1'
  ]);
  const renders = c.documents.calls.filter(([name]) => name === 'renderPages');
  assert.deepEqual(
    renders.map((r) => r[2]),
    [[60], [61], [62]],
    'one picture a request (the proxy takes 1 MiB)'
  );
  const transcription = c.service.calls.filter((x) => x.path === 'v1/uploads/transcriptions')[0];
  assert.equal(transcription.body.page, 60);
  assert.equal(transcription.body.image.mediaType, 'image/jpeg');
  assert.equal(transcription.body.image.data, Buffer.from([255, 216, 60]).toString('base64'));
  const reading = c.service.calls.find(
    (x) => x.path === 'v1/uploads/readings' && x.method === 'POST'
  ).body;
  assert.equal(reading.documentId, 'doc-scan');
  assert.deepEqual(
    reading.pages.map((p) => [p.page, p.transcribed]),
    [
      [60, true],
      [61, true],
      [62, true]
    ]
  );
  assert.ok(reading.pages.every((p) => p.text.includes('Article 09-03')));

  const blocks = flat(blocksOf(c));
  const table = blocks.find((b) => b.kind === 'table');
  assert.equal(table.rows.length, 1);
  const source = JSON.stringify(table.rows[0]);
  assert.match(source, /Règlement Les Michels/, "the source document's name");
  assert.match(source, /fr-urban-rules\.documents\.kind\.lotissement/, 'its kind');
  assert.match(source, /61/, 'its page');
  assert.ok(
    JSON.stringify(table.rows[0]).includes('fr-urban-rules.documents.table.toConfirm'),
    'to confirm'
  );
  const quote = blocks.find((b) => b.kind === 'quote');
  assert.equal(quote.citation.page, 61);
  assert.equal(quote.passage.text, RULE.passage);
  assert.ok(
    blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.result.transcribed'
    ),
    'a transcription may carry an error: check the page'
  );
  assert.ok(
    actionsOf(c).some((a) => a.id === 'doc-open' && a.target.subjectId.includes('p=61')),
    '« See page 61 »'
  );
});

test("a text PDF sends its pages' text and draws no picture, no transcription", async () => {
  const c = setup({
    documents: scriptedDocuments({ docs: [TEXT], texts: { 'doc-text': () => LONG } }),
    service: scriptedService({
      result: () =>
        readingResult({
          document: { documentId: 'doc-text', pages: 2 },
          reading: { mode: 'text', pages: [1, 2], transcribedPages: [], truncatedPages: [] },
          rules: [
            {
              ...RULE,
              source: { documentId: 'doc-text', page: 1 },
              page: 1,
              fromTranscript: undefined
            }
          ]
        })
    })
  });
  await plan(c, 'doc-text', 1, 2);
  await readIt(c, 'doc-text');
  await settle(c);
  assert.ok(!c.service.calls.some((x) => x.path === 'v1/uploads/transcriptions'));
  assert.ok(!c.documents.calls.some(([name]) => name === 'renderPages'));
  const reading = c.service.calls.find(
    (x) => x.path === 'v1/uploads/readings' && x.method === 'POST'
  ).body;
  assert.deepEqual(
    reading.pages.map((p) => [p.page, p.transcribed, p.text === LONG]),
    [
      [1, false, true],
      [2, false, true]
    ]
  );
  assert.ok(
    !flat(blocksOf(c)).some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.result.transcribed'
    )
  );
});

test('a transcription cut off by its limit is said, with its page', async () => {
  const c = setup({
    service: scriptedService({
      transcribe: (body) => (body.page === 61 ? { truncated: true } : undefined),
      result: () =>
        readingResult({
          reading: {
            mode: 'image',
            pages: [60, 61, 62],
            transcribedPages: [60, 61, 62],
            truncatedPages: [61]
          }
        })
    })
  });
  await plan(c, 'doc-scan', 60, 62);
  await readIt(c);
  await settle(c);
  const sent = c.service.calls.find(
    (x) => x.path === 'v1/uploads/readings' && x.method === 'POST'
  ).body;
  assert.deepEqual(
    sent.pages.filter((p) => p.truncated).map((p) => p.page),
    [61]
  );
  const notice = flat(blocksOf(c)).find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.result.truncated'
  );
  assert.deepEqual(notice.text.params, { pages: '61' });
});

test('the AI budget stopping the transcription keeps the pages transcribed, and reading again does not pay for them twice', async () => {
  let budget = true;
  const c = setup({
    service: scriptedService({
      transcribe: (_body, n) =>
        budget && n === 3
          ? {
              error: 'ai_budget_exhausted',
              status: 402,
              details: {
                remainingMicrousd: 800,
                budgetMicrousd: 5_000_000,
                resetsAt: '2026-12-01T00:00:00.000Z'
              }
            }
          : undefined
    })
  });
  await plan(c, 'doc-scan', 60, 64);
  await readIt(c);
  await settle(c);
  assert.ok(
    !c.service.calls.some((x) => x.path === 'v1/uploads/readings'),
    'no extraction was started on a refused budget'
  );
  const stop = flat(blocksOf(c)).find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.result.stopped'
  );
  assert.equal(stop.text.params.read, 2);
  assert.equal(stop.text.params.total, 5);
  // The budget comes back (or the person tops it up): the same range again asks for pages 62 to 64 only.
  budget = false;
  const rendersBefore = c.documents.calls.filter(([n]) => n === 'renderPages').length;
  await plan(c, 'doc-scan', 60, 64);
  await readIt(c);
  await settle(c);
  const renders = c.documents.calls
    .filter(([n]) => n === 'renderPages')
    .slice(rendersBefore)
    .map((r) => r[2][0]);
  assert.deepEqual(
    renders,
    [62, 63, 64],
    'the two transcribed pages are not drawn nor paid for again'
  );
  assert.ok(c.service.calls.some((x) => x.path === 'v1/uploads/readings' && x.method === 'POST'));
});

test('a budget stop in the extraction keeps the parts read, which are listed as to confirm like any', async () => {
  const stopped = readingResult({
    stopped: { reason: 'ai-budget', remainingMicrousd: 5 },
    chunks: { of: 3, failed: 0, unread: 2 }
  });
  const c = setup({ service: scriptedService({ result: () => stopped }) });
  await plan(c, 'doc-scan', 60, 62);
  await readIt(c);
  await settle(c);
  const blocks = flat(blocksOf(c));
  assert.equal(blocks.find((b) => b.kind === 'table').rows.length, 1);
  const stop = blocks.find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.result.stopped'
  );
  assert.equal(stop.text.params.read, 1);
  assert.equal(stop.text.params.total, 3);
});

test('a page that cannot be drawn, and a service that refuses, are said by their cause and nothing else is sent', async () => {
  const drawn = setup({ documents: scriptedDocuments({ failRender: true }) });
  await plan(drawn, 'doc-scan', 60, 61);
  await readIt(drawn);
  await settle(drawn);
  assert.ok(!drawn.service.calls.some((x) => x.path === 'v1/uploads/transcriptions'));
  assert.ok(
    flat(blocksOf(drawn)).some(
      (b) =>
        b.kind === 'notice' &&
        b.tone === 'warning' &&
        b.text.key === 'fr-urban-rules.documents.error.unreadable'
    )
  );
  const refused = setup({
    service: scriptedService({
      transcribe: () => ({ error: 'provider_not_permitted', status: 403 })
    })
  });
  await plan(refused, 'doc-scan', 60, 61);
  await readIt(refused);
  await settle(refused);
  assert.ok(
    flat(blocksOf(refused)).some(
      (b) =>
        b.kind === 'notice' &&
        b.text.key === 'fr-urban-rules.documents.error.provider_not_permitted'
    )
  );
});

test('« Cancel » stops the reading and tells the service; the pages already read stay', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const service = scriptedService();
  const base = service.fetch;
  service.fetch = async (url, init) => {
    if (
      String(url).endsWith('v1/uploads/transcriptions') &&
      service.calls.filter((c) => c.path.endsWith('transcriptions')).length === 1
    )
      await gate;
    return base(url, init);
  };
  const c = setup({ service });
  await plan(c, 'doc-scan', 60, 63);
  await readIt(c);
  await new Promise((r) => setImmediate(r));
  assert.ok(actionsOf(c).some((a) => a.id === 'doc-cancel'));
  await c.readings.runAction({ actionId: 'doc-cancel', target: subject('doc-scan') });
  release();
  await settle(c);
  assert.ok(
    !service.calls.some((x) => x.path === 'v1/uploads/readings' && x.method === 'POST'),
    'no extraction after a cancel'
  );
  assert.ok(!actionsOf(c).some((a) => a.id === 'doc-cancel'));
});

// ── Kept in the project, never applied ────────────────────────────────────────────────────

test("the reading is kept in the project's section for this document's file, restored with it, and not for another file", async () => {
  const c = setup();
  await plan(c, 'doc-scan', 60, 62);
  await readIt(c);
  await settle(c);
  const section = c.data.held();
  assert.equal(section.schema, 1);
  assert.equal(section.documentReadings.length, 1);
  const kept = section.documentReadings[0];
  assert.equal(kept.documentId, 'doc-scan');
  assert.equal(kept.hash, SCAN.hash);
  assert.deepEqual(kept.pages, [60, 62]);
  assert.equal(kept.result.rules.length, 1);
  assert.ok(
    !JSON.stringify(kept).includes(
      'Article 09-03. La hauteur maximale des constructions est limitée à sept mètres. Article'
    ),
    'the transcripts are not stored'
  );
  // A fresh session (the project opened again) shows it without a call to the service.
  const again = setup({ section });
  assert.equal(flat(blocksOf(again)).find((b) => b.kind === 'table').rows.length, 1);
  assert.equal(again.service.calls.length, 0);
  // Another file under the same id (the document was replaced): not shown as a reading of it.
  const other = setup({
    section,
    documents: scriptedDocuments({ docs: [{ ...SCAN, hash: 'c'.repeat(64) }] })
  });
  assert.ok(!flat(blocksOf(other)).some((b) => b.kind === 'table'));
  assert.ok(
    flat(blocksOf(other)).some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.changed'
    )
  );
  // The reading can be forgotten: one write.
  await again.readings.runAction({ actionId: 'doc-forget', target: subject('doc-scan') });
  assert.equal(again.data.held().documentReadings.length, 0);
});

test('no writable section: the reading is shown for the session and the extension says it is not kept', async () => {
  const c = setup({ writable: false });
  await plan(c, 'doc-scan', 60, 62);
  await readIt(c);
  await settle(c);
  assert.equal(c.data.held(), undefined);
  assert.ok(
    flat(blocksOf(c)).some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.notKept'
    )
  );
});

test('rules read from a document are to confirm, carry their source, and are never auto-applied', () => {
  const info = { id: 'doc-scan', name: 'Règlement Les Michels', kind: 'lotissement' };
  const items = documentRulesOf(readingResult(), info);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'to_confirm');
  assert.equal(items[0].autoApply, false);
  assert.deepEqual(items[0].source, {
    documentId: 'doc-scan',
    name: 'Règlement Les Michels',
    kind: 'lotissement',
    page: 61
  });
  assert.equal(items[0].fromTranscript, true);
  // The 002.46 gate: a reading that would pass every check is still refused when it comes from a document.
  const verified = { confidence: 'high', doubts: [] };
  assert.equal(
    autoApplyAllowed(verified),
    true,
    'a PLU reading with no doubt is applied (unchanged)'
  );
  assert.equal(
    autoApplyAllowed({ ...verified, source: { documentId: 'doc-scan', page: 61 } }),
    false
  );
  assert.equal(autoApplyAllowed({ ...RULE }), false, "the service's own rule from a document");
});

test("« See the page » opens the host's viewer at the page of the passage", async () => {
  const c = setup();
  await plan(c, 'doc-scan', 60, 62);
  await readIt(c);
  await settle(c);
  const open = actionsOf(c).find((a) => a.id === 'doc-open');
  const done = await c.readings.runAction({ actionId: 'doc-open', target: open.target });
  assert.equal(done.status, 'done');
  assert.deepEqual(c.documents.calls.at(-1), ['open', { documentId: 'doc-scan', page: 61 }]);
});

test("an action of another document, or a stranger's id, is refused", async () => {
  const c = setup();
  assert.equal((await plan(c, 'no-such', 1, 2)).status, 'refused');
  assert.equal(
    (await c.readings.runAction({ actionId: 'doc-unknown', target: subject('doc-scan') })).status,
    'refused'
  );
  assert.equal(c.service.calls.length, 0);
});

// ── In the reader ──────────────────────────────────────────────────────────────────────────

let lyon;
before(async () => {
  lyon = await loadPlot('lyon');
  void (await readFile(new URL('lyon/extraction/result.json', FIXTURES), 'utf8'));
});

test('the reader shows the documents in the Rules view, routes the document actions, and a PLU reading is untouched', async () => {
  const documents = scriptedDocuments({ docs: [SCAN] });
  const planning = recordedFetch(lyon.answers, {});
  const data = store(undefined);
  const reader = createReader({
    fetch: (url, init) => planning.fetch(url, init),
    site: () => recordedSiteService(lyon.site, lyon.conversions, {}),
    pluginService: () => ({ locate: async () => undefined }),
    packageData: () => data.service,
    document: () => ({ find: () => [] }),
    projectDocuments: () => documents,
    translate: (key) => key
  });
  const report = await reader.read(requestFor(lyon.site), { signal: signal() });
  const rules = report.views.find((v) => v.id === 'rules');
  const heading = rules.blocks.find(
    (b) => b.kind === 'heading' && b.text.key === 'fr-urban-rules.documents.heading'
  );
  assert.ok(heading, 'the Rules view holds the Documents block');
  assert.ok(report.sources.some((s) => s.id === 'project-documents'));
  const answer = await reader.runAction(
    { actionId: 'doc-add', target: {}, site: lyon.site },
    { signal: signal() }
  );
  assert.equal(answer.status, 'done');
  assert.equal(documents.calls.at(-1)[0], 'requestAdd');
});

// ── Addendum A: both routes, Sonnet and a local model ───────────────────────────────────────

const routeField = (c) =>
  actionsOf(c)
    .find((a) => a.id === 'doc-plan')
    ?.fields.find((f) => f.key === 'route');
const noticeKeys = (c) => flat(blocksOf(c)).filter((b) => b.kind === 'notice').map((b) => b.text.key);
const bodiesOf = (c, path, method = 'POST') => c.service.calls.filter((x) => x.path === path && x.method === method).map((x) => x.body);

test('A8: the local route is offered only when the AI panel selected a local provider, by name, and Sonnet is the preselected one', async () => {
  const none = setup();
  assert.equal(routeField(none), undefined, 'no selectedModel, no local route');
  const cloud = setup({ ai: panelChoice({ providerId: 'openai', model: 'gpt-x' }) });
  assert.equal(routeField(cloud), undefined, 'a cloud selection other than Sonnet offers no local route');
  const old = setup({ ai: () => ({}) });
  assert.equal(routeField(old), undefined, 'a host older than SDK 1.40 has no selectedModel');
  const local = setup({ ai: panelChoice(LM_STUDIO) });
  const field = routeField(local);
  assert.equal(field.kind, 'choice');
  assert.equal(field.initial, 'cloud', 'Sonnet, the recommended one, is preselected');
  assert.deepEqual(field.options.map((o) => o.value), ['cloud', 'local']);
  assert.match(JSON.stringify(field.options[1].label), /qwen\/qwen3-vl-8b/, 'the local model is named');
  // A forged route is refused: the panel no longer selects a local model.
  const forged = await plan(cloud, 'doc-scan', 60, 62, 'local');
  assert.equal(forged.status, 'refused');
  assert.deepEqual(cloud.service.calls, [], 'nothing was sent');
});

test('A8: with no route chosen, or Sonnet, nothing about the AI panel is sent; choosing the local route sends the panel\'s name and no address', async () => {
  const cloud = setup({ ai: panelChoice(LM_STUDIO) });
  await plan(cloud, 'doc-scan', 60, 62);
  assert.equal(JSON.stringify(cloud.service.calls[0].body).includes('lmstudio'), false);
  await plan(cloud, 'doc-scan', 60, 62, 'cloud');
  assert.equal(cloud.service.calls[1].body.ai, undefined);
  const local = setup({ ai: panelChoice(LM_STUDIO) });
  await plan(local, 'doc-scan', 60, 62, 'local');
  assert.deepEqual(local.service.calls[0].body.ai, LM_STUDIO);
  assert.ok(!JSON.stringify(local.service.calls[0].body).includes('://'));
});

test('A8: a local estimate says the transcription is free, the time unknown, the extraction about $0.08 on Sonnet, what all-Sonnet would cost, and to check every figure; the confirmation names the cost and the figures check', async () => {
  const c = setup({ ai: panelChoice(LM_STUDIO) });
  await plan(c, 'doc-scan', 59, 75, 'local');
  const blocks = flat(blocksOf(c));
  const fields = blocks.filter((b) => b.kind === 'fields').flatMap((b) => b.rows);
  assert.match(JSON.stringify(fields), /qwen\/qwen3-vl-8b/, 'the transcription model is named');
  const cost = fields.find((r) => r.label.key === 'fr-urban-rules.documents.field.cost');
  assert.match(JSON.stringify(cost), /0[,.]08/, 'the extraction, on the AI budget');
  const time = fields.find((r) => r.label.key === 'fr-urban-rules.documents.field.time');
  assert.equal(time.value.key, 'fr-urban-rules.documents.estimate.timeLocal');
  assert.deepEqual([time.value.params.cloud, time.value.params.fast, time.value.params.slow], [13, 46, 13], 'Sonnet 13 s a page; 46 s a page; about 13 minutes a page');
  const heads = blocks.find((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.estimate.headsUpLocal');
  assert.equal(heads.tone, 'warning');
  assert.match(heads.text.params.cost, /0[,.]08/, 'the extraction costs this much of the budget');
  assert.match(heads.text.params.low + heads.text.params.high, /0[,.]05.*0[,.]13/);
  assert.match(heads.text.params.compare, /0[,.]40/, 'what an all-Sonnet reading would cost');
  assert.ok(!noticeKeys(c).includes('fr-urban-rules.documents.estimate.headsUp'), 'the local wording says which step is free and which is not');
  const read = actionsOf(c).find((a) => a.id === 'doc-read');
  const confirm = read.fields.find((f) => f.key === 'confirm');
  assert.equal(confirm.options[0].label.key, 'fr-urban-rules.documents.confirm.optionLocal');
  assert.match(JSON.stringify(confirm.options[0].label.params), /0[,.]08/, 'the confirmation names the extraction cost, and its text the figures check');
  assert.equal(read.label.key, 'fr-urban-rules.documents.readLocal');
  assert.match(JSON.stringify(read.label.params), /0[,.]08/);
});

test('A9: a local page is a job the extension polls; progress shows the page and the time it has taken; every page job is dropped', async () => {
  const seen = [];
  const holder = {};
  const c = setup({
    ai: panelChoice(LM_STUDIO),
    service: scriptedService({ transcribe: (_b, n) => (n === 2 ? { running: 2 } : undefined) }),
    // Each wait between two polls is a moment the person could look at the panel.
    wait: async () => {
      const notice = flat(blocksOf(holder.c)).find((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.progress.transcribingPage');
      if (notice !== undefined) seen.push(notice.text.params);
    }
  });
  holder.c = c;
  await plan(c, 'doc-scan', 60, 62, 'local');
  await readIt(c);
  await settle(c);
  assert.ok(seen.some((p) => p.page === 61 && p.elapsed === '1:05'), `elapsed time shown for page 61: ${JSON.stringify(seen)}`);
  assert.ok(seen.some((p) => p.page === 61 && p.elapsed === '2:10'));
  assert.ok(seen.every((p) => p.where === 'fr-urban-rules.documents.where.local' && p.of === 3));
  const posts = bodiesOf(c, 'v1/uploads/transcriptions');
  assert.equal(posts.length, 3);
  assert.ok(posts.every((b) => JSON.stringify(b.ai) === JSON.stringify(LM_STUDIO)), "every page names the panel's local model");
  const reading = bodiesOf(c, 'v1/uploads/readings')[0];
  assert.deepEqual(reading.ai, LM_STUDIO, 'the reading records where its pages were transcribed; its extraction is Sonnet\'s whatever it says');
  assert.equal(c.service.calls.filter((x) => x.method === 'DELETE' && x.path.includes('transcriptions/page-')).length, 3);
  assert.ok(noticeKeys(c).includes('fr-urban-rules.documents.result.checkFigures'), 'check every figure, on the result too');
});

test('A9: a page the local model could not read is left out, the reading goes on, and the page is listed', async () => {
  const c = setup({
    ai: panelChoice(LM_STUDIO),
    service: scriptedService({
      transcribe: (b) => (b.page === 61 ? { text: '', truncated: true, unreadable: { reason: 'repetition', ratio: 0.93 } } : undefined),
      result: () => readingResult({ reading: { mode: 'image', route: 'local', pages: [60, 61, 62], transcribedPages: [60, 62], truncatedPages: [], unreadablePages: [61] } })
    })
  });
  await plan(c, 'doc-scan', 60, 62, 'local');
  await readIt(c);
  await settle(c);
  const reading = bodiesOf(c, 'v1/uploads/readings')[0];
  assert.deepEqual(reading.pages.map((p) => [p.page, p.unreadable === true, p.text === '']), [[60, false, false], [61, true, true], [62, false, false]]);
  const warn = flat(blocksOf(c)).find((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.documents.result.unreadable');
  assert.equal(warn.text.params.pages, '61');
  assert.equal(warn.tone, 'warning');
});

test('A9: one local page that fails is left out; two in a row stop the reading with the cause, a server that is down is not waited for 17 times', async () => {
  const one = setup({ ai: panelChoice(LM_STUDIO), service: scriptedService({ transcribe: (_b, n) => (n === 2 ? { error: 'transcription_failed' } : undefined) }) });
  await plan(one, 'doc-scan', 60, 63, 'local');
  await readIt(one);
  await settle(one);
  assert.equal(bodiesOf(one, 'v1/uploads/transcriptions').length, 4, 'the reading went on past the failed page');
  const sent = bodiesOf(one, 'v1/uploads/readings')[0].pages;
  assert.equal(sent.find((p) => p.page === 61).unreadable, true);
  const two = setup({ ai: panelChoice(LM_STUDIO), service: scriptedService({ transcribe: (_b, n) => (n >= 1 ? { error: 'transcription_failed' } : undefined) }) });
  await plan(two, 'doc-scan', 60, 72, 'local');
  await readIt(two);
  await settle(two);
  assert.equal(bodiesOf(two, 'v1/uploads/transcriptions').length, 2, 'stopped after two failed pages in a row');
  assert.equal(bodiesOf(two, 'v1/uploads/readings').length, 0);
  assert.ok(noticeKeys(two).includes('fr-urban-rules.documents.error.transcription_failed'));
});

test('A9: a provider the deployment lacks stops a local reading at the first page, by the AI service\'s own code', async () => {
  const c = setup({ ai: panelChoice(LM_STUDIO), service: scriptedService({ transcribe: () => ({ error: 'unknown_provider', details: { providerId: 'lmstudio' } }) }) });
  await plan(c, 'doc-scan', 60, 64, 'local');
  await readIt(c);
  await settle(c);
  assert.equal(bodiesOf(c, 'v1/uploads/transcriptions').length, 1);
  assert.ok(noticeKeys(c).includes('fr-urban-rules.documents.error.unknown_provider'));
});

test('A9: « Cancel » during a page job cancels the job on the service', async () => {
  // A page that never ends: the wait between polls yields to the host's event loop, as a timer does.
  const c = setup({ ai: panelChoice(LM_STUDIO), service: scriptedService({ transcribe: () => ({ running: 1_000_000 }) }), wait: () => new Promise((resolve) => setImmediate(resolve)) });
  await plan(c, 'doc-scan', 60, 62, 'local');
  await readIt(c);
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
  assert.ok(actionsOf(c).some((a) => a.id === 'doc-cancel'));
  await c.readings.runAction({ actionId: 'doc-cancel', target: subject('doc-scan') });
  await settle(c);
  assert.ok(c.service.calls.some((x) => x.method === 'POST' && x.path === 'v1/uploads/transcriptions/page-1/cancel'));
  assert.equal(bodiesOf(c, 'v1/uploads/readings').length, 0);
  assert.ok(!actionsOf(c).some((a) => a.id === 'doc-cancel'));
});

const localResultWithUnreadable = () =>
  readingResult({ reading: { mode: 'image', route: 'local', pages: [60, 61, 62], transcribedPages: [60, 62], truncatedPages: [], unreadablePages: [61] } });

async function localReadWithUnreadablePage(extra = {}) {
  let readings = 0;
  const c = setup({
    ai: panelChoice(LM_STUDIO),
    service: scriptedService({
      transcribe: (b) => (b.ai !== undefined && b.page === 61 ? { text: '', unreadable: { reason: 'repetition', ratio: 0.93 } } : extra.retryAnswer?.(b)),
      result: () => {
        readings += 1;
        return readings === 1 ? localResultWithUnreadable() : readingResult({ reading: { mode: 'image', route: 'cloud', pages: [61], transcribedPages: [61], truncatedPages: [] }, rules: [{ ...RULE, page: 61, passage: 'Les constructions sont implantées à 5 m minimum.', limit: { kind: 'value', comparison: 'min', value: 5, unit: 'm' }, kind: 'setback_boundary', article: '08-03' }] });
      }
    })
  });
  await plan(c, 'doc-scan', 60, 62, 'local');
  await readIt(c);
  await settle(c);
  return c;
}

test('A10: Sonnet is a one-click retry for a page the local model could not read, and the confirmation names its cost', async () => {
  const c = await localReadWithUnreadablePage();
  const retry = actionsOf(c).find((a) => a.id === 'doc-retry-cloud');
  assert.ok(retry, 'offered on the result');
  assert.match(retry.target.subjectId, /p=61/);
  const confirm = retry.fields.find((f) => f.key === 'confirm');
  assert.equal(confirm.required, true);
  assert.match(JSON.stringify(confirm.options[0].label.params), /0[,.]03/, 'the about-cost of one page, named');
  const before = c.service.calls.length;
  const refused = await c.readings.runAction({ actionId: 'doc-retry-cloud', target: { subjectId: `${subject('doc-scan').subjectId}|p=61` }, values: {} });
  assert.equal(refused.status, 'refused');
  assert.equal(c.service.calls.length, before, 'no confirmation, nothing sent');
});

test('A10: the retry transcribes that page on the cloud route, reads it there, merges its rules and keeps the project\'s reading in step', async () => {
  const c = await localReadWithUnreadablePage();
  const target = { subjectId: `${subject('doc-scan').subjectId}|p=61` };
  const answer = await c.readings.runAction({ actionId: 'doc-retry-cloud', target, values: { confirm: 'yes' } });
  assert.equal(answer.status, 'done');
  await settle(c);
  const posts = bodiesOf(c, 'v1/uploads/transcriptions');
  const retried = posts.at(-1);
  assert.equal(retried.page, 61);
  assert.equal(retried.ai, undefined, 'the cloud route: Sonnet, the default');
  const readings = bodiesOf(c, 'v1/uploads/readings');
  assert.equal(readings.length, 2);
  assert.equal(readings[1].ai, undefined);
  assert.deepEqual(readings[1].pages.map((p) => p.page), [61]);
  const table = flat(blocksOf(c)).find((b) => b.kind === 'table');
  assert.equal(table.rows.length, 2, 'the page\'s rule joined the first reading\'s');
  assert.ok(!actionsOf(c).some((a) => a.id === 'doc-retry-cloud'), 'the page is no longer unreadable');
  assert.ok(noticeKeys(c).includes('fr-urban-rules.documents.result.retried'));
  assert.ok(noticeKeys(c).includes('fr-urban-rules.documents.result.checkFigures'), 'the other pages are still the local model\'s');
  const kept = c.data.held().documentReadings[0].result;
  assert.equal(kept.rules.length, 2);
  assert.deepEqual(kept.reading.unreadablePages, []);
});

test('A10: a retry that Sonnet cannot read either keeps the page listed and says so', async () => {
  const c = await localReadWithUnreadablePage({ retryAnswer: (b) => (b.page === 61 ? { text: '', unreadable: { reason: 'empty' } } : undefined) });
  await c.readings.runAction({ actionId: 'doc-retry-cloud', target: { subjectId: `${subject('doc-scan').subjectId}|p=61` }, values: { confirm: 'yes' } });
  await settle(c);
  assert.ok(actionsOf(c).some((a) => a.id === 'doc-retry-cloud'), 'still offered');
  assert.ok(noticeKeys(c).includes('fr-urban-rules.documents.error.retry'));
  assert.equal(flat(blocksOf(c)).find((b) => b.kind === 'table').rows.length, 1);
});

test('A10: a budget stop on the retry is said by its cause and keeps the reading as it was', async () => {
  const c = await localReadWithUnreadablePage({ retryAnswer: (b) => (b.page === 61 ? { error: 'ai_budget_exhausted', details: { remainingMicrousd: 5, budgetMicrousd: 5_000_000 } } : undefined) });
  await c.readings.runAction({ actionId: 'doc-retry-cloud', target: { subjectId: `${subject('doc-scan').subjectId}|p=61` }, values: { confirm: 'yes' } });
  await settle(c);
  assert.ok(noticeKeys(c).includes('fr-urban-rules.documents.error.ai_budget_exhausted'));
  assert.equal(flat(blocksOf(c)).find((b) => b.kind === 'table').rows.length, 1);
});

test('A8: no page transcribed by a local model, no figures notice: the rules of a text PDF read by Sonnet are not a local model\'s digits', async () => {
  const c = setup({
    documents: scriptedDocuments({ docs: [TEXT], texts: { 'doc-text': () => LONG } }),
    ai: panelChoice(LM_STUDIO),
    service: scriptedService({ result: () => readingResult({ document: { documentId: 'doc-text', pages: 2 }, reading: { mode: 'text', route: 'local', pages: [1, 2], transcribedPages: [], truncatedPages: [], unreadablePages: [] } }) })
  });
  await plan(c, 'doc-text', 1, 2, 'local');
  await readIt(c, 'doc-text');
  await settle(c);
  assert.equal(bodiesOf(c, 'v1/uploads/transcriptions').length, 0);
  assert.ok(!noticeKeys(c).includes('fr-urban-rules.documents.result.checkFigures'));
});

test('A9: a Sonnet reading is unchanged: no panel name is sent, no figures notice, and no retry is offered', async () => {
  const c = setup({ ai: panelChoice(LM_STUDIO) });
  await plan(c, 'doc-scan', 60, 62);
  await readIt(c);
  await settle(c);
  for (const call of c.service.calls) assert.equal(JSON.stringify(call.body ?? {}).includes('lmstudio'), false);
  assert.ok(!noticeKeys(c).includes('fr-urban-rules.documents.result.checkFigures'));
  assert.ok(!actionsOf(c).some((a) => a.id === 'doc-retry-cloud'));
});
