/**
 * Extraction jobs and their result cache (Sprint 002.5b DEC-1, DEC-3, DEC-8).
 *
 *     POST extractions            → 200 { state: 'done', result } from the cache,
 *                                   else 202 { jobId, state } before any fetch
 *     GET  extractions/{jobId}    → { state, progress, result?, error? }
 *     GET  extractions?…&cachedOnly=1 → { result, current } or 404 not_cached;
 *                                   never starts work, never fetches
 *
 * One job runs at a time, ten wait. A job walks `queued → fetching → reading
 * → extracting → done | failed`; fetch and chapter codes are its `error`, not
 * the POST's answer, because they are found while it runs. It lives 30
 * minutes after it ends; its result lives in the cache, keyed by document,
 * chapter pages and the two versions — not by zone (UCe1a and UCe1b share a
 * chapter) and not by provider or model (health names no model, so such a
 * key could not be formed for `cachedOnly`; both are stored in the result).
 *
 * A model call starts only from a POST. A POST answered from the cache, or
 * joining a job already queued or running for the same thing, costs nothing;
 * a job that ends without calling a model gives its charge back.
 */

import { createHash, randomUUID } from 'node:crypto';
import { cacheKey } from './cache.mjs';
import { findChapter } from './chapter.mjs';
import { ServiceError } from './errors.mjs';
import { AiError } from './ai-client.mjs';
import { PROMPT_VERSION, SCHEMA_VERSION, extractChapter } from './extract.mjs';
import { prepareChapter } from './text.mjs';

export const QUEUE_MAX = 10;
export const JOB_TTL_MS = 30 * 60_000;
const BUSY_RETRY_SECONDS = 60;

/** `sha1(documentKey, from, to, schemaVersion, promptVersion)` (DEC-3). */
export function resultKey(documentKey, [from, to], schemaVersion = SCHEMA_VERSION, promptVersion = PROMPT_VERSION) {
  return createHash('sha1').update(JSON.stringify([documentKey, from, to, schemaVersion, promptVersion])).digest('hex');
}

function chapterPages(document, [from, to]) {
  const pages = [];
  for (let page = from; page <= to; page += 1) pages.push({ page, text: document.pages[page - 1] });
  return pages;
}

/**
 * @param {{
 *   store: { get: Function },            002.5a's document store (fetch on a miss, joins)
 *   documents: { has, read },            002.5a's document cache
 *   results: { has, read, write },       this sprint's result cache
 *   ai: { health, extract },
 *   limiters: { extractHour, extractDay, refreshDay, fetchHour },
 *   logger: (level, record) => void,
 *   clock?: () => number, now?: () => Date, onCall?: Function
 * }} options
 */
export function createExtractions({ store, documents, results, ai, limiters, logger, clock = () => Date.now(), now = () => new Date(), onCall, chunkChars, maxItems }) {
  /** jobId → job */
  const jobs = new Map();
  /** what a job is for, while it is active: `doc:<documentKey>:<zone>:<refresh>` and, once known, `key:<resultKey>` */
  const active = new Map();
  const queue = [];
  let running;

  function sweep() {
    const cutoff = clock() - JOB_TTL_MS;
    for (const [id, job] of jobs) if (job.endedAt !== undefined && job.endedAt < cutoff) jobs.delete(id);
  }

  async function current() {
    const health = await ai.health();
    return { providerId: health.defaultProviderId, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION };
  }

  /** The chapter and its result key from cached text; `undefined` when the text is not cached. Throws chapter codes. */
  async function fromCachedText(inputs) {
    const documentKey = cacheKey(inputs.idurba, inputs.nomfic);
    if (!documents.has(documentKey)) return undefined;
    const document = await documents.read(documentKey);
    if (document === undefined) return undefined;
    const chapter = findChapter(document, inputs.zone);
    return { document, chapter, key: resultKey(documentKey, chapter.pages) };
  }

  function view(job) {
    const out = { jobId: job.id, state: job.state, progress: job.progress };
    if (job.result !== undefined) out.result = job.result;
    if (job.error !== undefined) out.error = job.error;
    return out;
  }

  function charge(limitKey, refresh) {
    const taken = [];
    // Each refund gives back this job's own take, not whoever took last.
    const giveBack = () => {
      for (const { limiter, at } of taken) limiter.refund(limitKey, at);
    };
    const take = (limiter) => {
      const r = limiter.take(limitKey);
      if (!r.ok) {
        giveBack();
        throw new ServiceError('rate_limited', { retryAfterSeconds: r.retryAfterSeconds });
      }
      taken.push({ limiter, at: r.at });
    };
    if (refresh) take(limiters.refreshDay);
    take(limiters.extractHour);
    take(limiters.extractDay);
    return giveBack;
  }

  function end(job, fields) {
    Object.assign(job, fields, { endedAt: clock() });
    for (const tag of job.tags) if (active.get(tag) === job) active.delete(tag);
    if (job.refund !== undefined && !job.calledModel) job.refund();
    logger(job.state === 'done' ? 'info' : 'warn', {
      event: 'extraction',
      jobId: job.id,
      outcome: job.state === 'done' ? 'ok' : job.error.code,
      durationMs: clock() - job.startedAt,
      idurba: job.inputs.idurba,
      nomfic: job.inputs.nomfic,
      zone: job.inputs.zone,
      cache: job.fromCache ? 'hit' : 'miss',
      user: job.userHash,
      userSource: job.userSource,
      ...(job.summary ?? {})
    });
  }

  async function run(job) {
    const fail = (error) => {
      if (!(error instanceof ServiceError)) {
        // Never the message: it may quote a document.
        logger('error', { event: 'extraction_internal_error', jobId: job.id, errorName: error?.name });
      }
      end(job, {
        state: 'failed',
        error: error instanceof ServiceError ? { ...error.details, code: error.code } : { code: 'internal_error' }
      });
    };
    try {
      job.state = 'fetching';
      job.progress = { step: 'fetching' };
      const health = await ai.health();
      if (!health.available) throw new ServiceError('extraction_unavailable', { reason: 'no_structured_output' });

      const got = await store.get(job.inputs, {
        beforeFetch: () => {
          const r = limiters.fetchHour.take(job.limitKey);
          if (!r.ok) throw new ServiceError('rate_limited', { retryAfterSeconds: r.retryAfterSeconds });
        }
      });
      job.state = 'reading';
      job.progress = { step: 'reading' };
      const chapter = findChapter(got.document, job.inputs.zone);
      const key = resultKey(cacheKey(job.inputs.idurba, job.inputs.nomfic), chapter.pages);
      job.tags.push(`key:${key}`);
      active.set(`key:${key}`, job);
      if (!job.refresh) {
        const cached = await results.read(key);
        if (cached !== undefined) {
          job.fromCache = true;
          return end(job, { state: 'done', progress: { step: 'done' }, result: cached });
        }
      }
      const prepared = prepareChapter(chapterPages(got.document, chapter.pages));

      job.state = 'extracting';
      job.progress = { step: 'extracting', chunk: 0, of: 0 };
      let extracted;
      try {
        extracted = await extractChapter({
          prepared,
          ai,
          maxTextLength: health.maxTextLength,
          maxItems: Math.min(maxItems ?? Infinity, health.maxItems ?? Infinity),
          chunkChars,
          // Charged only once a model has answered (S7): a job stopped by
          // `no_provider_configured` or an unreachable service costs nothing.
          onAnswer: () => (job.calledModel = true),
          onChunk: (chunk, of) => (job.progress = { step: 'extracting', chunk, of }),
          onCall
        });
      } catch (error) {
        if (error instanceof AiError && error.code === 'no_provider_configured') {
          throw new ServiceError('extraction_unavailable', { reason: 'no_provider_configured' });
        }
        throw error;
      }
      job.summary = {
        chunks: extracted.chunks.of,
        chunksFailed: extracted.chunks.failed,
        rules: extracted.rules.length,
        dropped: extracted.dropped,
        codes: extracted.codes,
        providerId: extracted.model?.providerId,
        model: extracted.model?.model,
        constraint: extracted.model?.constraint
      };
      if (extracted.chunks.failed === extracted.chunks.of) {
        throw new ServiceError('extraction_failed', { codes: [...new Set(extracted.codes)] });
      }
      const meta = got.document.meta;
      const result = {
        schemaVersion: SCHEMA_VERSION,
        promptVersion: PROMPT_VERSION,
        document: {
          documentId: meta.documentId,
          partition: meta.partition,
          idurba: meta.idurba,
          nomfic: meta.nomfic,
          sha256: meta.sha256,
          pages: meta.pages,
          retrievedAt: meta.retrievedAt
        },
        chapter,
        rules: extracted.rules,
        dropped: extracted.dropped,
        chunks: extracted.chunks,
        model: extracted.model,
        extractedAt: now().toISOString()
      };
      // A partial result is answered to its job and never cached: a later
      // POST tries again rather than serving every user the gaps (S5).
      if (extracted.chunks.failed === 0) await results.write(key, result);
      end(job, { state: 'done', progress: { step: 'done' }, result });
    } catch (error) {
      fail(error);
    }
  }

  async function pump() {
    if (running !== undefined) return;
    while (queue.length > 0) {
      running = queue.shift();
      await run(running);
      running = undefined;
    }
  }

  return {
    /**
     * @param {{ partition, idurba, nomfic, zone }} inputs checked by the caller
     * @param {{ refresh: boolean, limitKey: string, userHash: string, userSource: string }} who
     */
    async post(inputs, who) {
      sweep();
      let located;
      try {
        located = await fromCachedText(inputs);
      } catch {
        located = undefined; // a chapter code: the job finds it again and fails with it
      }
      if (located !== undefined) {
        if (!who.refresh) {
          const cached = await results.read(located.key);
          if (cached !== undefined) return { status: 200, body: { state: 'done', result: cached }, cache: 'hit' };
        }
        const joined = active.get(`key:${located.key}`);
        if (joined !== undefined) return { status: 202, body: view(joined), cache: 'joined' };
      }
      const tag = `doc:${cacheKey(inputs.idurba, inputs.nomfic)}:${inputs.zone}:${who.refresh ? 1 : 0}`;
      const pending = active.get(tag);
      if (pending !== undefined) return { status: 202, body: view(pending), cache: 'joined' };

      if (queue.length >= QUEUE_MAX) {
        throw new ServiceError('busy', { retryAfterSeconds: BUSY_RETRY_SECONDS });
      }
      const refund = charge(who.limitKey, who.refresh);
      const job = {
        id: randomUUID(),
        state: 'queued',
        progress: { step: 'queued' },
        inputs,
        refresh: who.refresh,
        limitKey: who.limitKey,
        userHash: who.userHash,
        userSource: who.userSource,
        tags: [tag],
        refund,
        calledModel: false,
        startedAt: clock()
      };
      if (located !== undefined) job.tags.push(`key:${located.key}`);
      for (const t of job.tags) active.set(t, job);
      jobs.set(job.id, job);
      queue.push(job);
      void pump();
      return { status: 202, body: { jobId: job.id, state: 'queued' }, cache: 'miss' };
    },

    status(jobId) {
      sweep();
      const job = jobs.get(jobId);
      if (job === undefined) throw new ServiceError('not_found', { reason: 'no_such_job' });
      return { status: 200, body: view(job) };
    },

    /** `cachedOnly=1`: reads, never starts work, never fetches. */
    async cached(inputs) {
      const located = await fromCachedText(inputs);
      const currentVersions = await current();
      const result = located === undefined ? undefined : await results.read(located.key);
      if (result === undefined) {
        return { status: 404, body: { current: currentVersions, error: 'not_cached' } };
      }
      return { status: 200, body: { result, current: currentVersions } };
    },

    /** Resolves when the queue is empty (tests and the recording tool). */
    async idle() {
      while (running !== undefined || queue.length > 0) await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
}
