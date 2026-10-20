/**
 * `fr-urban-rules-service`: the companion service of
 * `com.archisimple.fr-urban-rules` (Sprint 002.5a; ADR-0114).
 *
 * Mounted by the gateway at `/plugins-api/com.archisimple.fr-urban-rules/`.
 * Its wire contract is `v1`, by path:
 *
 *     GET v1/chapter?partition=&idurba=&nomfic=&zone=
 *       → { pages: [from, to], found, match, title, documentPages }
 *     POST v1/extractions { partition, idurba, nomfic, zone } [?refresh=1]   (002.5b)
 *       → 200 { state: 'done', result } | 202 { jobId, state }
 *     GET v1/extractions/{jobId} → { jobId, state, progress, result?, error? }
 *     GET v1/extractions?partition&idurba&nomfic&zone&cachedOnly=1
 *       → { result, current } | 404 { error: 'not_cached', current }
 *
 * `pages` are PDF page indices — what `#page=` opens. One zone per request:
 * a plot that straddles zones asks once per zone. The request may download
 * and read the règlement, so a cache miss counts against the document-fetch
 * limit; a hit or a joined fetch does not.
 *
 * Model calls go through ai-service at `aiServiceUrl`
 * (`ARCHISIMPLE_AI_SERVICE_URL`), and only from `POST v1/extractions`;
 * nothing here reads a model key (ADR-0114 Rule 7). The service answers
 * candidates and writes no project (Rule 9).
 */

import { readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createAiClient, extractTimeoutFromEnv } from './ai-client.mjs';
import { DEFAULT_CACHE_MAX_BYTES, documentCache, openCaches, resultCache } from './cache.mjs';
import { findChapter } from './chapter.mjs';
import { createDocumentStore, createParser } from './document.mjs';
import { ServiceError } from './errors.mjs';
import { createFetcher } from './fetcher.mjs';
import { createExtractions } from './jobs.mjs';
import { createWindowLimiter, limitsFromEnv } from './limits.mjs';
import { prepareChapter } from './text.mjs';

export const PACKAGE_ID = 'com.archisimple.fr-urban-rules';
export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

/** DEC-4's input patterns. The zone is never sent upstream, so its own is broad. */
export const INPUT_PATTERNS = Object.freeze({
  partition: /^DU_[0-9A-Z]{5,9}(?:_[0-9A-Z]{1,4})?$/u,
  idurba: /^[0-9A-Za-z_-]{1,64}$/u,
  nomfic: /^[0-9A-Za-z_.-]{1,160}\.pdf$/u,
  zone: /^(?=.*\S)[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]{1,40}$/u
});

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function leveled(log, level) {
  const floor = LEVELS[String(level ?? '').toLowerCase()] ?? LEVELS.info;
  return (severity, record) => {
    if (LEVELS[severity] >= floor) log({ level: severity, service: PACKAGE_ID, ...record });
  };
}

function readInputs(query) {
  const inputs = {};
  for (const [name, pattern] of Object.entries(INPUT_PATTERNS)) {
    const values = query.getAll(name);
    if (values.length !== 1 || !pattern.test(values[0])) {
      throw new ServiceError('invalid_request', { field: name });
    }
    inputs[name] = values[0];
  }
  inputs.zone = inputs.zone.trim();
  return inputs;
}

/**
 * @param {{
 *   env: Record<string, string | undefined>,
 *   log: (record: object) => void,
 *   aiServiceUrl?: string,
 *   dataDir: string,
 *   fetcher?: object, parse?: Function, ai?: object, onCall?: Function,
 *   now?: () => Date, clock?: () => number
 * }} options from `fetcher` on, for tests and the recording tool
 */
export async function createService({
  env,
  log,
  dataDir,
  aiServiceUrl = 'http://127.0.0.1:4321',
  fetcher,
  parse,
  ai,
  onCall,
  now = () => new Date(),
  clock = () => Date.now()
}) {
  const logger = leveled(log, env.FR_URBAN_RULES_LOG_LEVEL);
  const root = join(dataDir, PACKAGE_ID);
  const tmpDir = join(root, 'tmp');
  // A download interrupted by a restart is never resumed.
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });

  const maxBytes = Number(env.FR_URBAN_RULES_CACHE_MAX_BYTES);
  const caches = await openCaches({
    dirs: { documents: join(root, 'documents'), extractions: join(root, 'extractions') },
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_CACHE_MAX_BYTES,
    now
  });
  const cache = documentCache(caches.documents, caches.totalBytes);
  const store = createDocumentStore({
    fetcher: fetcher ?? createFetcher({ version: VERSION, tmpDir }),
    parse: parse ?? createParser(),
    cache,
    now
  });
  const limits = limitsFromEnv(env);
  const fetches = createWindowLimiter({ limit: limits.fetchesPerHour, windowMs: 3_600_000, now: clock });
  const reads = createWindowLimiter({ limit: limits.readsPerMinute, windowMs: 60_000, now: clock });
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const extractions = createExtractions({
    store,
    documents: cache,
    results: resultCache(caches.extractions),
    ai: ai ?? createAiClient({ baseUrl: aiServiceUrl, extractTimeoutMs: extractTimeoutFromEnv(env) }),
    limiters: {
      fetchHour: fetches,
      extractHour: createWindowLimiter({ limit: limits.extractsPerHour, windowMs: HOUR, now: clock }),
      extractDay: createWindowLimiter({ limit: limits.extractsPerDay, windowMs: DAY, now: clock }),
      refreshDay: createWindowLimiter({ limit: limits.refreshesPerDay, windowMs: DAY, now: clock })
    },
    logger,
    clock,
    now,
    onCall,
    chunkChars: limits.chunkChars,
    maxItems: limits.maxItemsPerChunk
  });
  let warnedAddress = false;

  function takeRead(limitKey) {
    const read = reads.take(limitKey);
    if (!read.ok) throw new ServiceError('rate_limited', { retryAfterSeconds: read.retryAfterSeconds });
  }

  /** A POST body, `{ partition, idurba, nomfic, zone }` strings and nothing else, as query parameters. */
  function bodyInputs(body) {
    let parsed;
    try {
      parsed = JSON.parse(body ?? '');
    } catch {
      throw new ServiceError('invalid_request', { field: 'body' });
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ServiceError('invalid_request', { field: 'body' });
    }
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(parsed)) {
      if (!(name in INPUT_PATTERNS) || typeof value !== 'string') {
        throw new ServiceError('invalid_request', { field: 'body' });
      }
      query.append(name, value);
    }
    return readInputs(query);
  }

  /** The extraction routes (002.5b DEC-1): `{ status, headers?, body, record }`. */
  async function extraction(request, rest) {
    takeRead(request.limitKey);
    if (rest.length === 1 && request.method === 'GET') {
      const answer = extractions.status(rest[0]);
      return { ...answer, record: { event: 'extraction_poll', state: answer.body.state } };
    }
    if (rest.length !== 0) throw new ServiceError('not_found');
    if (request.method === 'POST') {
      const inputs = bodyInputs(request.body);
      const refresh = request.query.get('refresh') === '1';
      const answer = await extractions.post(inputs, {
        refresh,
        limitKey: request.limitKey,
        userHash: request.userHash,
        userSource: request.userSource
      });
      return {
        status: answer.status,
        body: answer.body,
        record: { event: 'extraction_post', idurba: inputs.idurba, nomfic: inputs.nomfic, zone: inputs.zone, refresh, cache: answer.cache, state: answer.body.state }
      };
    }
    if (request.method === 'GET') {
      if (request.query.get('cachedOnly') !== '1') throw new ServiceError('invalid_request', { field: 'cachedOnly' });
      const query = new URLSearchParams(request.query);
      query.delete('cachedOnly');
      const inputs = readInputs(query);
      const answer = await extractions.cached(inputs);
      return {
        ...answer,
        record: { event: 'extraction_cached', idurba: inputs.idurba, nomfic: inputs.nomfic, zone: inputs.zone, cache: answer.status === 200 ? 'hit' : 'miss' }
      };
    }
    throw new ServiceError('invalid_request', { field: 'method' });
  }

  async function chapter(request) {
    const inputs = readInputs(request.query);
    takeRead(request.limitKey);
    const got = await store.get(inputs, {
      beforeFetch: () => {
        const fetch = fetches.take(request.limitKey);
        if (!fetch.ok) throw new ServiceError('rate_limited', { retryAfterSeconds: fetch.retryAfterSeconds });
      }
    });
    const found = findChapter(got.document, inputs.zone);
    const [from, to] = found.pages;
    const chapterPages = [];
    for (let page = from; page <= to; page += 1) chapterPages.push({ page, text: got.document.pages[page - 1] });
    // Prepared here for `no_text_layer`; 002.5b reads the rest of it.
    prepareChapter(chapterPages);
    return {
      inputs,
      got,
      body: {
        pages: found.pages,
        found: found.found,
        match: found.match,
        title: found.title,
        documentPages: got.document.meta.pages
      }
    };
  }

  return {
    packageId: PACKAGE_ID,
    version: VERSION,

    /**
     * @param {{
     *   method: string, segments: string[], query: URLSearchParams, body?: string,
     *   limitKey: string, userHash: string, userSource: 'header' | 'address'
     * }} request `segments` decoded, after the package id; `body` at most 4 KiB
     * @returns {Promise<{ status: number, headers?: Record<string, string>, body: object }>}
     */
    async handle(request) {
      const started = clock();
      const route = request.segments.join('/');
      const [version, name, ...rest] = request.segments;
      if (version !== 'v1' || (name !== 'chapter' && name !== 'extractions') || (name === 'chapter' && rest.length > 0)) {
        return { status: 404, body: { error: 'not_found' } };
      }
      if (name === 'chapter' && request.method !== 'GET') {
        return { status: 405, headers: { Allow: 'GET' }, body: { error: 'invalid_request' } };
      }
      if (request.userSource === 'address' && !warnedAddress) {
        warnedAddress = true;
        logger('warn', {
          event: 'limit_key_fallback',
          message: 'no X-Authenticated-User: limiting by client address, which behind web is one budget for everyone'
        });
      }
      const record = { event: 'chapter', route, user: request.userHash, userSource: request.userSource };
      if (name === 'extractions') {
        try {
          const answer = await extraction(request, rest);
          logger('info', { ...answer.record, route: `v1/extractions${rest.length > 0 ? '/{jobId}' : ''}`, user: request.userHash, userSource: request.userSource, outcome: answer.body.error ?? 'ok', durationMs: clock() - started });
          return { status: answer.status, headers: answer.headers, body: answer.body };
        } catch (error) {
          return failed(error, { ...record, event: 'extraction_request', route: 'v1/extractions' }, started, request.query);
        }
      }
      try {
        const { inputs, got, body } = await chapter(request);
        logger('info', {
          ...record,
          outcome: 'ok',
          durationMs: clock() - started,
          idurba: inputs.idurba,
          nomfic: inputs.nomfic,
          zone: inputs.zone,
          pages: body.pages,
          found: body.found,
          match: body.match,
          cache: got.cache,
          bytes: got.bytes
        });
        return { status: 200, body };
      } catch (error) {
        return failed(error, record, started, request.query);
      }
    },

    /** Resolves when no extraction is queued or running (tests, the recording tool). */
    idle: () => extractions.idle()
  };

  function failed(error, record, started, q) {
    const failure = error instanceof ServiceError ? error : new ServiceError('internal_error');
    if (!(error instanceof ServiceError)) {
      // Never the message: it may quote a document.
      logger('error', { ...record, event: `${record.event}_internal_error`, errorName: error?.name });
    }
    logger(failure.status >= 500 ? 'warn' : 'info', {
      ...record,
      outcome: failure.code,
      durationMs: clock() - started,
      idurba: INPUT_PATTERNS.idurba.test(q.get('idurba') ?? '') ? q.get('idurba') : undefined,
      nomfic: INPUT_PATTERNS.nomfic.test(q.get('nomfic') ?? '') ? q.get('nomfic') : undefined,
      zone: INPUT_PATTERNS.zone.test(q.get('zone') ?? '') ? q.get('zone') : undefined,
      details: failure.details
    });
    const headers =
      failure.details?.retryAfterSeconds !== undefined ? { 'Retry-After': String(failure.details.retryAfterSeconds) } : undefined;
    // `error` last: no detail can overwrite the code.
    return { status: failure.status, headers, body: { ...failure.details, error: failure.code } };
  }
}
