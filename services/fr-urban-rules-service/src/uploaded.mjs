/**
 * Reading a document the person uploaded — a lotissement, a hameau, a ZAC (Sprint 002.30).
 *
 *     POST v1/uploads/estimate       { mode, pages, characters? }                     → { estimate }   (no model call)
 *     POST v1/uploads/transcriptions { page, image: { mediaType, data }, ai? }        → 202 { jobId }   (Addendum A: a page is a job)
 *     GET  v1/uploads/transcriptions/{id}                                             → { jobId, state, progress, result?, error? }
 *     POST v1/uploads/readings       { documentId, pages: [{ page, text, … }], ai? }  → 202 { jobId }
 *     GET  v1/uploads/readings/{id}                                                   → { jobId, state, progress, result?, error? }
 *     POST …/{id}/cancel · DELETE …/{id}                                              (both kinds of job)
 *
 * The route is document-agnostic: it is given PAGE TEXT (a text PDF's, or the transcripts of a scan) and answers the same
 * candidates the PLU reading does, by the same chain (`prepareChapter` → `extractChapter`) and the same verification.
 * What differs is privacy and cost:
 *
 * - **Private.** Nothing is read from, or written to, the shared result cache or the chunk memo (both are keyed by
 *   text and shared by every user of the deployment). A reading is held in memory, bound to the user who started it,
 *   and gone 30 minutes after it ends or at `DELETE`. Page text and images are never written to disk and never logged
 *   (a log line carries counts and codes). A page image is forwarded to ai-service and forgotten.
 * - **Pages read, not file size.** The limit counts the pages sent for reading.
 * - **Metered to the account** like every AI call (ADR-0136): the account's opaque subject rides on every call; a budget
 *   stop keeps what was read (`result.stopped`), as the PLU reading's does (002.27).
 * - **Two routes (Addendum A, the owner's decision O1, hybrid).** `ai` absent or Sonnet 5.5: the CLOUD route, the recommended one,
 *   metered. `lmstudio` or `ollama` (the AI panel's own selection, a name and never an address): the LOCAL route, for the
 *   TRANSCRIPTION only: free and never gated by the AI budget. **The extraction always runs on Sonnet 5.5, whatever the route**
 *   (measured: a local extraction took 685 s for one page and read no rule). Any other provider is `route_not_offered`.
 * - **A page is a job.** A local page can take minutes and a loop to its cap longer: no request waits for it. It is private like
 *   a reading (memory, the user's own, 30 minutes), has a per-page timeout, can be cancelled, and reports its elapsed time.
 *
 * A transcription error would be « verified » against its own transcript: every rule carries `source: { documentId, page }`
 * and `fromTranscript`, so the extension can put the page picture beside the passage.
 */

import { randomUUID } from 'node:crypto';
import { AiError, BUDGET_EXHAUSTED, TRANSCRIBE_PURPOSE } from './ai-client.mjs';
import { ServiceError } from './errors.mjs';
import {
  GUIDANCE_IN_PROMPT,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  SECTORS_IN_CODE,
  extractChapter,
  stopOf
} from './extract.mjs';
import { createLanes } from './lanes.mjs';
import { judgeTranscript } from './loop-guard.mjs';
import { prepareChapter } from './text.mjs';

/** The model the owner approved for transcribing and extracting an uploaded document. */
export const UPLOAD_MODEL = Object.freeze({ providerId: 'anthropic', model: 'claude-sonnet-5-5' });
/** Addendum A: the local providers the AI panel can select (platform `PROVIDER_CATALOGUE`, kind `local`): a name, never an address. */
export const LOCAL_PROVIDERS = Object.freeze(['lmstudio', 'ollama']);
/**
 * Measured 2026-11-21 on pages 59 to 75 of one scanned règlement, for the estimate's time line: Sonnet 5.5 took 224 s for 17 pages
 * (13 s a page); `qwen/qwen3-vl-8b` took 13.0 minutes on a laptop with a GPU (46 s a page) and 3 h 39 on a CPU-only host
 * (773 s, about 13 minutes a page): the time of a local model depends on the machine, and is not known in advance.
 */
export const TIMING = Object.freeze({ cloudSecondsPerPage: 13, localMeasuredSecondsPerPage: Object.freeze({ fast: 46, slow: 773 }) });

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The route the person chose, from `readSelection`'s `{ providerId, model? }` (or `undefined`): Sonnet by default, a local
 * provider by name, nothing else. `{ kind: 'cloud'|'local', providerId, model? }`.
 */
const CLOUD_ROUTE = Object.freeze({ kind: 'cloud', ...UPLOAD_MODEL });

export function routeOf(selection) {
  if (selection === undefined) return CLOUD_ROUTE;
  if (selection.providerId === UPLOAD_MODEL.providerId) {
    if (selection.model === undefined || selection.model === UPLOAD_MODEL.model) return CLOUD_ROUTE;
    throw new ServiceError('route_not_offered', { providerId: selection.providerId });
  }
  if (LOCAL_PROVIDERS.includes(selection.providerId)) {
    return { kind: 'local', providerId: selection.providerId, ...(selection.model === undefined ? {} : { model: selection.model }) };
  }
  throw new ServiceError('route_not_offered', { providerId: selection.providerId });
}

/**
 * A DATED COPY of the platform's price table for this model (`apps/ai-service/src/price-table.ts`, version 2026-11-19,
 * list price, micro-dollars per million tokens). The table is not served over HTTP; a drift is possible and the estimate
 * says « about » and carries this date.
 */
export const PRICE = Object.freeze({
  version: '2026-11-19',
  inputMicroPerMTok: 2_000_000,
  outputMicroPerMTok: 10_000_000
});

/**
 * Measured 2026-11-20 on pages 59 to 75 of a scanned lotissement règlement (Sonnet 5.5, a 1,568 px JPEG): 2,385 input tokens
 * and 1,425 output tokens a page (thinking included), $0.019 a page. The extraction's figures follow the zone UD chunk (about
 * 15,500 tokens in, 5,500 out for 40,000 characters): the fixed part is the instructions and the schema.
 */
export const TOKENS = Object.freeze({
  transcription: Object.freeze({ input: 2_385, output: 1_425 }),
  extraction: Object.freeze({ fixedInput: 3_000, charsPerToken: 3.3, outputPerInput: 0.44 })
});
/** What a page holds when the caller does not say: 2,400 characters a transcribed page (measured), 2,800 a text page. */
export const CHARS_PER_PAGE = Object.freeze({ image: 2_400, text: 2_800 });
const CHUNK_CHARS = 40_000;

const microOf = (input, output) =>
  Math.round((input * PRICE.inputMicroPerMTok + output * PRICE.outputMicroPerMTok) / 1_000_000);

/**
 * What a reading will cost before anything is sent (DEC-3). Pure: pages and characters in, an about-cost out.
 * `low` and `high` frame the output tokens' variance (thinking, a table); they are a range, never a promise.
 */
export function estimateReading({ mode, pages, characters, scanPages, route = { kind: 'cloud', ...UPLOAD_MODEL } }) {
  if (mode !== 'text' && mode !== 'image')
    throw new ServiceError('invalid_request', { field: 'mode' });
  if (!Number.isInteger(pages) || pages < 1)
    throw new ServiceError('invalid_request', { field: 'pages' });
  // A range can mix pages with a text layer and scans: only the scans are transcribed. Absent, `image` means all of them.
  const scans = mode === 'text' ? 0 : scanPages === undefined ? pages : scanPages;
  if (!Number.isInteger(scans) || scans < 0 || scans > pages)
    throw new ServiceError('invalid_request', { field: 'scanPages' });
  const chars =
    Number.isFinite(characters) && characters > 0
      ? Math.round(characters)
      : Math.round(scans * CHARS_PER_PAGE.image + (pages - scans) * CHARS_PER_PAGE.text);
  const chunks = Math.max(1, Math.ceil(chars / CHUNK_CHARS));
  const text = TOKENS.extraction;
  const extractionInput = chunks * text.fixedInput + chars / text.charsPerToken;
  const extractionOutput = (chars / text.charsPerToken) * text.outputPerInput;
  const transcription =
    scans === 0
      ? 0
      : microOf(scans * TOKENS.transcription.input, scans * TOKENS.transcription.output);
  const extraction = microOf(extractionInput, extractionOutput);
  const microusd = transcription + extraction;
  const cloud = {
    mode,
    pages,
    scanPages: scans,
    characters: chars,
    chunks,
    route: 'cloud',
    model: { ...UPLOAD_MODEL },
    microusd,
    // The about-cost, rounded UP to the cent, and the range the output's variance allows.
    aboutUsd: Math.max(0.01, Math.ceil(microusd / 10_000) / 100),
    lowUsd: Math.max(0.01, Math.floor((microusd * 0.6) / 10_000) / 100),
    highUsd: Math.max(0.01, Math.ceil((microusd * 1.6) / 10_000) / 100),
    breakdown: { transcriptionMicrousd: transcription, extractionMicrousd: extraction },
    perPageUsd: Math.round(microusd / pages / 100) / 10_000,
    priceTable: { version: PRICE.version },
    // Said to the person: what the number rests on.
    basis: scans > 0 ? 'measured-scan' : 'measured-text',
    timing: { cloudSecondsPerPage: TIMING.cloudSecondsPerPage }
  };
  if (route.kind !== 'local') return cloud;
  // HYBRID (the owner's decision of 2026-11-21): a local model TRANSCRIBES, for nothing, and no AI budget is ever reached by it (the
  // platform never gates a free provider); the EXTRACTION always runs on Sonnet, so its cost is the whole about-cost. What an
  // all-Sonnet reading would cost stays beside it for comparison; the local TRANSCRIPTION's time is not known in advance.
  const range = (factorLow, factorHigh) => ({
    lowUsd: Math.max(0.01, Math.floor((extraction * factorLow) / 10_000) / 100),
    highUsd: Math.max(0.01, Math.ceil((extraction * factorHigh) / 10_000) / 100)
  });
  return {
    ...cloud,
    route: 'local',
    model: { providerId: route.providerId, ...(route.model === undefined ? {} : { model: route.model }) },
    extractionModel: { ...UPLOAD_MODEL },
    microusd: extraction,
    aboutUsd: Math.max(0.01, Math.ceil(extraction / 10_000) / 100),
    ...range(0.6, 1.6),
    perPageUsd: Math.round(extraction / pages / 100) / 10_000,
    breakdown: { transcriptionMicrousd: 0, extractionMicrousd: extraction },
    compare: { model: { ...UPLOAD_MODEL }, aboutUsd: cloud.aboutUsd, lowUsd: cloud.lowUsd, highUsd: cloud.highUsd, perPageUsd: cloud.perPageUsd },
    timing: {
      cloudSecondsPerPage: TIMING.cloudSecondsPerPage,
      local: { known: false, measuredSecondsPerPage: { ...TIMING.localMeasuredSecondsPerPage } }
    }
  };
}

/** The measured transcription instruction (`peynier-tools/transcribe.py`, 2026-11-20). */
export const TRANSCRIPTION_PROMPT =
  'This is one scanned page of a French lotissement regulation (règlement). Transcribe its text exactly as written, in French, ' +
  'keeping article numbers and numbering (e.g. 09-03), headings and lists in reading order. If the page is rotated, read it as a person would. ' +
  'Write [illisible] for anything you cannot read and [tampon] for a stamp. Do not summarise, translate or correct. ' +
  'Answer with the transcription only.';

/** The reply's room: the Haiku run was cut off at 4,096 tokens on a table of 91 lots. */
export const TRANSCRIPTION_MAX_TOKENS = 8_192;
/**
 * A local model's reply is capped at the measured 4,096 tokens: its longest honest page (a table of 91 lots) used 2,470, and a loop
 * runs to the cap, so this bounds what a loop can cost (140 s on a laptop with a GPU, 35 minutes on a CPU-only host).
 */
export const LOCAL_TRANSCRIPTION_MAX_TOKENS = 4_096;
/**
 * One cloud page's time. A page is a job now, no request waits for it through a proxy: 180 s leaves room for the measured table of
 * 91 lots (88.6 s) and a slow day. A local page's is {@link LOCAL_PAGE_TIMEOUT_MS}, the deployment's to raise.
 */
export const TRANSCRIPTION_TIMEOUT_MS = 180_000;
export const LOCAL_PAGE_TIMEOUT_MS = 15 * 60_000;
/** A page's failure that took longer than this is not tried again: a second try would be paid for (cloud) or wait as long again (local). */
export const RETRY_ONLY_WITHIN_MS = 30_000;
/** Page jobs: unfinished ones a person may hold, and in all. */
export const PAGE_JOBS_PER_USER = 4;
export const PAGE_QUEUE_MAX = 40;
/** Lanes: how many run at once. A local model runs one; the cloud route a few. */
export const LANE_LIMITS = Object.freeze({ cloud: 3, local: 1 });
/** Readings are the extraction, always on Sonnet: one at a time whatever the route (the transcription is the page lanes'). */
export const READING_LANE_LIMITS = Object.freeze({ cloud: 1 });
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const MAX_IMAGE_BASE64 = 700 * 1024;
const MAX_PAGE_TEXT = 100_000;
const MAX_PAGE_NUMBER = 100_000;
export const JOB_TTL_MS = 30 * 60_000;
export const QUEUE_MAX = 10;
const DOCUMENT_ID = /^[0-9A-Za-z_.:-]{1,64}$/u;
const RETRIED = new Set(['unreachable', 'malformed', 'provider_error', 'ai_budget_unavailable']);
const isObject = isPlainObject;

/** A transcript's own marks: how much of a page the model could not read. */
export function illegibleShare(text) {
  const words = text.split(/\s+/u).filter(Boolean).length;
  if (words === 0) return 1;
  const marks = (text.match(/\[illisible\]/giu) ?? []).length;
  return marks / words;
}

/** The AI call's route for a person and the route they chose: the model it names (a local route with none names the provider's default). */
function aiRouteOf(who, route) {
  return {
    providerId: route.providerId,
    ...(route.model === undefined ? {} : { model: route.model }),
    ...(who.features === undefined ? {} : { features: who.features }),
    ...(who.aiSubject === undefined ? {} : { aiSubject: who.aiSubject })
  };
}

/** ai-service's refusals, as this service says them: a budget stop keeps its numbers, a provider refusal its code. */
function mapAiError(error, fallback, providerId = UPLOAD_MODEL.providerId) {
  if (error instanceof ServiceError) return error;
  if (error instanceof AiError) {
    if (error.code === BUDGET_EXHAUSTED) {
      const { reason: _reason, ...numbers } = stopOf(error);
      return new ServiceError('ai_budget_exhausted', numbers);
    }
    if (
      error.code === 'provider_not_permitted' ||
      error.code === 'unknown_provider' ||
      error.code === 'no_provider_configured'
    ) {
      return new ServiceError(
        error.code === 'no_provider_configured' ? 'extraction_unavailable' : error.code,
        {
          providerId,
          ...(error.code === 'no_provider_configured' ? { reason: 'no_provider_configured' } : {})
        }
      );
    }
  }
  return new ServiceError(fallback, {
    code: error instanceof AiError ? error.code : 'provider_error'
  });
}

/**
 * @param {{
 *   ai: { health, extract, chat },
 *   limiters: { transcribedHour, readingsHour },
 *   logger: (level, record) => void,
 *   readSelection?: (value) => { providerId, model? } | undefined   the service's own check of the AI panel's selection
 *   clock?: () => number, now?: () => Date,
 *   maxPages?: number, localPageTimeoutMs?: number, chunkChars?: number, maxItems?: number
 * }} options
 */
export function createUploads({
  ai,
  limiters,
  logger,
  readSelection = (value) => value,
  clock = () => Date.now(),
  now = () => new Date(),
  maxPages = 80,
  localPageTimeoutMs = LOCAL_PAGE_TIMEOUT_MS,
  chunkChars,
  maxItems
}) {
  /** jobId → job, for the readings and for the pages. Memory only. */
  const jobs = new Map();
  const pageJobs = new Map();
  const readingLanes = createLanes(READING_LANE_LIMITS, (job) => run(job));
  const pageLanes = createLanes(LANE_LIMITS, (job) => runPage(job));

  const sweep = () => {
    const cutoff = clock() - JOB_TTL_MS;
    for (const map of [jobs, pageJobs])
      for (const [id, job] of map) if (job.endedAt !== undefined && job.endedAt < cutoff) map.delete(id);
  };
  /** Another user's job is a job that does not exist (the result is private). */
  const ownIn = (map) => (jobId, who) => {
    sweep();
    const job = map.get(jobId);
    if (job === undefined || job.ownerKey !== who.limitKey)
      throw new ServiceError('not_found', { reason: 'no_such_job' });
    return job;
  };
  const own = ownIn(jobs);
  const ownPage = ownIn(pageJobs);
  const view = (job) => ({
    jobId: job.id,
    state: job.state,
    progress: job.progress,
    ...(job.result === undefined ? {} : { result: job.result }),
    ...(job.error === undefined ? {} : { error: job.error })
  });
  const pageView = (job) => ({
    jobId: job.id,
    state: job.state,
    route: job.route.kind,
    progress:
      job.state === 'running'
        ? { step: 'transcribing', elapsedMs: clock() - job.runStartedAt, timeoutMs: job.timeoutMs }
        : { step: job.state === 'queued' ? 'queued' : job.state === 'done' ? 'done' : 'ended', elapsedMs: job.ranMs ?? 0, timeoutMs: job.timeoutMs },
    ...(job.result === undefined ? {} : { result: job.result }),
    ...(job.error === undefined ? {} : { error: job.error })
  });

  /** The route the person chose, from the body's `ai`. */
  const routeFrom = (body) => routeOf(readSelection(body.ai));

  /** The body's pages, checked: ascending page numbers, strings, within the pages-read limit. */
  function readPages(value) {
    if (!Array.isArray(value) || value.length === 0)
      throw new ServiceError('invalid_request', { field: 'pages' });
    if (value.length > maxPages)
      throw new ServiceError('too_many_pages', { pages: value.length, max: maxPages });
    let last = 0;
    return value.map((p) => {
      if (
        !isObject(p) ||
        !Number.isInteger(p.page) ||
        p.page <= last ||
        p.page > MAX_PAGE_NUMBER ||
        typeof p.text !== 'string' ||
        p.text.length > MAX_PAGE_TEXT
      ) {
        throw new ServiceError('invalid_request', { field: 'pages' });
      }
      last = p.page;
      return {
        page: p.page,
        text: p.text,
        transcribed: p.transcribed === true,
        truncated: p.truncated === true,
        // Addendum A: a page the model could not read; it is listed in the result and left out of the extraction.
        unreadable: p.unreadable === true
      };
    });
  }

  function end(job, fields) {
    Object.assign(job, fields, { endedAt: clock() });
    // The pages are not needed once the reading is over: only the result stays, until it is dropped.
    job.pages = undefined;
    logger(job.state === 'done' ? 'info' : 'warn', {
      event: 'upload_reading',
      jobId: job.id,
      outcome:
        job.state === 'done'
          ? job.result?.stopped === undefined
            ? 'ok'
            : 'stopped'
          : job.error.code,
      route: job.route.kind,
      durationMs: clock() - job.startedAt,
      pages: job.pageCount,
      user: job.userHash,
      userSource: job.userSource,
      ...(job.summary ?? {})
    });
  }

  async function run(job) {
    try {
      const health = await ai.health({ features: job.aiRoute.features });
      if (!health.available)
        throw new ServiceError('extraction_unavailable', { reason: 'no_structured_output' });
      const readable = job.pages.filter((p) => !p.unreadable);
      const prepared = prepareChapter(readable.map(({ page, text }) => ({ page, text })));
      job.state = 'extracting';
      job.parts = [];
      const progress = (chunk, of) => {
        job.progress = {
          step: 'extracting',
          chunk,
          of,
          rules: job.parts.reduce((n, part) => n + (part.rules ?? 0), 0),
          parts: job.parts.map((part) => ({ ...part }))
        };
      };
      progress(0, 0);
      let extracted;
      try {
        extracted = await extractChapter({
          prepared,
          sectorsInCode: SECTORS_IN_CODE,
          guidance: GUIDANCE_IN_PROMPT,
          ai: {
            ...ai,
            extract: (request) =>
              ai.extract(request, { ...job.aiRoute, signal: job.controller.signal })
          },
          maxTextLength: health.maxTextLength,
          maxItems: Math.min(maxItems ?? Infinity, health.maxItems ?? Infinity),
          chunkChars,
          onChunk: (chunk, of, pages) => {
            while (job.parts.length < of)
              job.parts.push({ n: job.parts.length + 1, state: 'waiting' });
            job.parts[chunk - 1] = {
              n: chunk,
              state: 'running',
              ...(pages?.[0] === undefined ? {} : { pages })
            };
            progress(chunk, of);
          },
          onPart: (part) => {
            job.parts[part.n - 1] = {
              n: part.n,
              state: part.state,
              ...(part.pages?.[0] === undefined ? {} : { pages: part.pages }),
              rules: part.rules
            };
            progress(part.n, part.of);
          },
          signal: job.controller.signal
          // No `memo`: the chunk memo is shared by every user of the process, and this text is one person's.
        });
      } catch (error) {
        throw mapAiError(error, 'extraction_failed', job.aiRoute.providerId);
      }
      const read = extracted.chunks.of - extracted.chunks.failed - (extracted.chunks.unread ?? 0);
      job.summary = {
        chunks: extracted.chunks.of,
        chunksFailed: extracted.chunks.failed,
        ...(extracted.stopped === undefined
          ? {}
          : { stopped: extracted.stopped.reason, chunksUnread: extracted.chunks.unread }),
        rules: extracted.rules.length
      };
      if (extracted.stopped !== undefined && read === 0) {
        const { reason: _reason, ...numbers } = extracted.stopped;
        throw new ServiceError('ai_budget_exhausted', numbers);
      }
      if (extracted.chunks.failed === extracted.chunks.of) {
        throw new ServiceError('extraction_failed', { codes: [...new Set(extracted.codes)] });
      }
      const transcribed = new Set(job.pages.filter((p) => p.transcribed && !p.unreadable).map((p) => p.page));
      const result = {
        schemaVersion: SCHEMA_VERSION,
        promptVersion: PROMPT_VERSION,
        upload: true,
        document: { documentId: job.documentId, pages: job.pageCount },
        reading: {
          mode: transcribed.size > 0 ? 'image' : 'text',
          route: job.route.kind,
          pages: job.pages.map((p) => p.page),
          transcribedPages: [...transcribed],
          truncatedPages: job.pages.filter((p) => p.truncated && !p.unreadable).map((p) => p.page),
          unreadablePages: job.pages.filter((p) => p.unreadable).map((p) => p.page)
        },
        rules: extracted.rules.map((rule) => ({
          ...rule,
          source: { documentId: job.documentId, page: rule.page },
          ...(transcribed.has(rule.page) ? { fromTranscript: true } : {})
        })),
        dropped: extracted.dropped,
        chunks: extracted.chunks,
        model: extracted.model,
        ...(extracted.stopped === undefined ? {} : { stopped: extracted.stopped }),
        extractedAt: now().toISOString()
      };
      end(job, { state: 'done', progress: { ...job.progress, step: 'done' }, result });
    } catch (error) {
      const failure =
        error instanceof ServiceError ? error : error?.name === 'ServiceError' ? error : undefined;
      if (failure === undefined)
        logger('error', {
          event: 'upload_reading_internal_error',
          jobId: job.id,
          errorName: error?.name
        });
      end(job, {
        state: 'failed',
        error:
          failure === undefined
            ? { code: 'internal_error' }
            : { ...failure.details, code: failure.code }
      });
    }
  }

  /** One page's job: the chat call (retried once after a quick failure), then the loop guard. The picture is dropped with the job. */
  async function runPage(job) {
    if (job.state !== 'queued') return;
    job.state = 'running';
    job.runStartedAt = clock();
    const finish = (fields) => {
      job.ranMs = clock() - job.runStartedAt;
      job.image = undefined;
      Object.assign(job, fields, { endedAt: clock() });
      logger(job.state === 'done' ? 'info' : 'warn', {
        event: 'upload_transcription',
        jobId: job.id,
        page: job.page,
        route: job.route.kind,
        outcome:
          job.state === 'done'
            ? job.result.unreadable !== undefined
              ? `unreadable_${job.result.unreadable.reason}`
              : job.result.truncated
                ? 'truncated'
                : 'ok'
            : job.error.code,
        chars: job.result?.text?.length,
        durationMs: job.ranMs,
        user: job.userHash
      });
    };
    let calledModel = false;
    try {
      let answer;
      for (let attempt = 1; attempt <= 2 && answer === undefined; attempt += 1) {
        const began = clock();
        try {
          answer = await ai.chat(
            {
              userMessage: TRANSCRIPTION_PROMPT,
              images: [{ mediaType: job.image.mediaType, data: job.image.data }],
              maxTokens: job.route.kind === 'local' ? LOCAL_TRANSCRIPTION_MAX_TOKENS : TRANSCRIPTION_MAX_TOKENS,
              purpose: TRANSCRIBE_PURPOSE
            },
            { ...job.aiRoute, timeoutMs: job.timeoutMs, signal: job.controller.signal }
          );
          calledModel = true;
        } catch (error) {
          if (job.controller.signal.aborted) throw new ServiceError('cancelled');
          const code = error instanceof AiError ? error.code : 'provider_error';
          if (attempt === 2 || !RETRIED.has(code) || clock() - began > RETRY_ONLY_WITHIN_MS) throw error;
        }
      }
      const text = answer.content.trim();
      const verdict = judgeTranscript(text, answer.finishReason);
      const base = { page: job.page, route: job.route.kind, model: { providerId: answer.providerId, model: answer.model } };
      let result;
      if (verdict.empty) {
        result = { ...base, text: '', truncated: false, illegible: false, unreadable: { reason: 'empty' } };
      } else if (verdict.degenerate) {
        // A loop is not a transcript: it is never handed on, and the page is said to be unreadable by this model.
        result = { ...base, text: '', truncated: verdict.truncated, illegible: false, unreadable: { reason: verdict.reason, ratio: Math.round(verdict.ratio * 100) / 100 } };
      } else {
        // « Mostly [illisible] » (handwriting, a bad scan) is flagged for the person, as before.
        result = { ...base, text, truncated: verdict.truncated, illegible: illegibleShare(text) >= 0.2 };
      }
      finish({ state: 'done', result });
    } catch (error) {
      // A page that never reached a model costs nothing: its place in the hour is given back.
      if (!calledModel) limiters.transcribedHour.refund(job.ownerKey, job.takenAt);
      const failure = mapAiError(error, 'transcription_failed', job.route.providerId);
      finish({ state: 'failed', error: { ...failure.details, code: failure.code } });
    }
  }

  return {
    estimate(body) {
      if (!isObject(body)) throw new ServiceError('invalid_request', { field: 'body' });
      const route = routeFrom(body);
      if (Number.isInteger(body.pages) && body.pages > maxPages)
        throw new ServiceError('too_many_pages', { pages: body.pages, max: maxPages });
      const characters = body.characters === undefined ? undefined : body.characters;
      if (
        characters !== undefined &&
        !(Number.isFinite(characters) && characters >= 0 && characters <= maxPages * MAX_PAGE_TEXT)
      ) {
        throw new ServiceError('invalid_request', { field: 'characters' });
      }
      return {
        status: 200,
        body: {
          estimate: estimateReading({
            mode: body.mode,
            pages: body.pages,
            characters,
            scanPages: body.scanPages,
            route
          }),
          limits: { pagesPerReading: maxPages }
        }
      };
    },

    /** One page image in: a job (202) that transcribes it and forgets the picture. */
    async transcribe(body, who) {
      sweep();
      if (
        !isObject(body) ||
        !Number.isInteger(body.page) ||
        body.page < 1 ||
        body.page > MAX_PAGE_NUMBER ||
        !isObject(body.image) ||
        !IMAGE_TYPES.has(body.image.mediaType) ||
        typeof body.image.data !== 'string' ||
        body.image.data.length === 0 ||
        body.image.data.length > MAX_IMAGE_BASE64 ||
        !/^[A-Za-z0-9+/]+={0,2}$/u.test(body.image.data)
      ) {
        throw new ServiceError('invalid_request', { field: 'image' });
      }
      const route = routeFrom(body);
      const unfinished = [...pageJobs.values()].filter((j) => j.endedAt === undefined);
      if (
        pageLanes.queued() >= PAGE_QUEUE_MAX ||
        unfinished.filter((j) => j.ownerKey === who.limitKey).length >= PAGE_JOBS_PER_USER
      ) {
        throw new ServiceError('busy', { retryAfterSeconds: 30 });
      }
      const taken = limiters.transcribedHour.take(who.limitKey);
      if (!taken.ok)
        throw new ServiceError('rate_limited', { retryAfterSeconds: taken.retryAfterSeconds });
      const job = {
        id: randomUUID(),
        state: 'queued',
        page: body.page,
        image: { mediaType: body.image.mediaType, data: body.image.data },
        route,
        aiRoute: aiRouteOf(who, route),
        timeoutMs: route.kind === 'local' ? localPageTimeoutMs : TRANSCRIPTION_TIMEOUT_MS,
        ownerKey: who.limitKey,
        userHash: who.userHash,
        takenAt: taken.at,
        controller: new AbortController(),
        startedAt: clock()
      };
      pageJobs.set(job.id, job);
      pageLanes.push(job, route.kind);
      return { status: 202, body: { jobId: job.id, state: 'queued', route: route.kind } };
    },

    pageStatus(jobId, who) {
      return { status: 200, body: pageView(ownPage(jobId, who)) };
    },

    pageCancel(jobId, who) {
      const job = ownPage(jobId, who);
      if (job.endedAt === undefined) {
        if (pageLanes.remove(job)) {
          limiters.transcribedHour.refund(job.ownerKey, job.takenAt);
          job.image = undefined;
          Object.assign(job, { state: 'failed', error: { code: 'cancelled' }, endedAt: clock() });
        } else job.controller.abort();
      }
      return { status: 200, body: pageView(job) };
    },

    pageRemove(jobId, who) {
      const job = ownPage(jobId, who);
      if (job.endedAt === undefined) {
        job.controller.abort();
        pageLanes.remove(job);
        job.image = undefined;
      }
      pageJobs.delete(jobId);
      return { status: 200, body: { removed: true } };
    },

    /** Starts a private reading of page text. 202 { jobId }. */
    async post(body, who) {
      sweep();
      if (
        !isObject(body) ||
        typeof body.documentId !== 'string' ||
        !DOCUMENT_ID.test(body.documentId)
      ) {
        throw new ServiceError('invalid_request', { field: 'documentId' });
      }
      const pages = readPages(body.pages);
      const route = routeFrom(body);
      if (pages.every((p) => p.unreadable)) throw new ServiceError('upload_unreadable', { reason: 'no_readable_page' });
      if (readingLanes.queued() >= QUEUE_MAX) throw new ServiceError('busy', { retryAfterSeconds: 60 });
      const taken = limiters.readingsHour.take(who.limitKey);
      if (!taken.ok)
        throw new ServiceError('rate_limited', { retryAfterSeconds: taken.retryAfterSeconds });
      const job = {
        id: randomUUID(),
        state: 'queued',
        progress: { step: 'queued' },
        documentId: body.documentId,
        pages,
        pageCount: pages.length,
        ownerKey: who.limitKey,
        userHash: who.userHash,
        userSource: who.userSource,
        // `route` records where the pages were TRANSCRIBED (the figures notice is for them); the extraction is always Sonnet's.
        route,
        aiRoute: aiRouteOf(who, CLOUD_ROUTE),
        controller: new AbortController(),
        startedAt: clock()
      };
      jobs.set(job.id, job);
      readingLanes.push(job, 'cloud');
      return { status: 202, body: { jobId: job.id, state: 'queued', route: route.kind } };
    },

    status(jobId, who) {
      return { status: 200, body: view(own(jobId, who)) };
    },

    cancel(jobId, who) {
      const job = own(jobId, who);
      if (job.endedAt === undefined) {
        if (readingLanes.remove(job)) {
          end(job, {
            state: 'failed',
            error: { code: 'cancelled' },
            progress: { step: 'cancelled' }
          });
        } else job.controller.abort();
      }
      return { status: 200, body: view(job) };
    },

    /** The reading is dropped now, result included (the extension holds it in the project). */
    remove(jobId, who) {
      const job = own(jobId, who);
      if (job.endedAt === undefined) {
        job.controller.abort();
        readingLanes.remove(job);
      }
      jobs.delete(jobId);
      return { status: 200, body: { removed: true } };
    },

    /** Jobs held (tests). */
    held: () => jobs.size + pageJobs.size,
    async idle() {
      while (readingLanes.busy() || pageLanes.busy())
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
}
