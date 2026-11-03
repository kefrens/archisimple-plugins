/**
 * `fr-urban-rules-service`: the companion service of
 * `com.archisimple.fr-urban-rules` (Sprint 002.5a; ADR-0114).
 *
 * Mounted by the gateway at `/plugins-api/com.archisimple.fr-urban-rules/`.
 * Its wire contract is `v1`, by path:
 *
 *     GET v1/chapter?partition=&idurba=&nomfic=&zone=
 *       → { pages: [from, to], found, match, title, documentPages }
 *     POST v1/extractions { partition, idurba, nomfic, zone, ai?: { providerId, model? } } [?refresh=1]   (002.5b, 002.16)
 *       → 200 { state: 'done', result } | 202 { jobId, state }
 *     GET v1/extractions/{jobId} → { jobId, state, progress, result?, error? }
 *     GET v1/extractions?partition&idurba&nomfic&zone[&provider[&model]]&cachedOnly=1
 *       → { result, current } | 404 { error: 'not_cached', current }
 *
 *     GET v1/documents/{partition}                                              (002.10)
 *       → { partition, current, withdrawn, checkedAt, previous[], failing? }
 *     GET v1/georisques[/<allow-listed v2 path>?…]                              (002.10)
 *       → { configured, api } | the Géorisques v2 answer, the token added here
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
import { createGeorisques } from './georisques.mjs';
import { createExtractions } from './jobs.mjs';
import { SCHEMA_VERSION } from './extract.mjs';
import { createWindowLimiter, limitsFromEnv } from './limits.mjs';
import { prepareChapter } from './text.mjs';
import { createWatcher } from './watch.mjs';

export const PACKAGE_ID = 'com.archisimple.fr-urban-rules';

/**
 * Sprint 002.16: what the editor may name of the AI panel's choice. An id as ai-service's providers
 * have them (`lmstudio`, `openai`), and a model name — which may hold `/` and `:` (`qwen/qwen3-vl-8b`,
 * `llama3:8b`) but never an address (`://`) or a control character. No endpoint field exists.
 */
const SELECTION_PATTERNS = Object.freeze({
  providerId: /^[a-z0-9][a-z0-9_-]{0,39}$/u,
  model: /^(?!.*:\/\/)[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]{1,120}$/u
});
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
 *   now?: () => Date, clock?: () => number,
 *   georisques?: object,     tests: the Géorisques proxy's own seams (request, port, lookup)
 *   watch?: boolean | object   the daily schedule starts unless an injected GPU or false; an object is the watcher's test seams
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
  clock = () => Date.now(),
  georisques: georisquesSeams = {},
  watch
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
  const gpu = fetcher ?? createFetcher({ version: VERSION, tmpDir });
  const documentStore = createDocumentStore({
    fetcher: gpu,
    parse: parse ?? createParser(),
    cache,
    now
  });
  const limits = limitsFromEnv(env);

  // Sprint 002.10: the watch. A document the service has read — or holds — is
  // watched; the store below tells it so, with no GPU call of its own.
  const watcher = createWatcher({
    dir: join(root, 'watch'),
    fetcher: gpu,
    logger,
    now,
    clock,
    ...(typeof watch === 'object' ? watch : {}),
    evictVersion: (partition, idurba) => evictVersion(partition, idurba),
    evictOutdated: () => evictOutdated(),
    cachedDocuments: () => cachedDocuments()
  });
  const store = {
    async get(request, hooks) {
      const got = await documentStore.get(request, hooks);
      await watcher.noteDocument(got.document.meta).catch(() => {});
      return got;
    }
  };

  /** The metas of one namespace's entries, read without making any of them the most recently used. */
  async function metasOf(namespace) {
    const out = [];
    for (const key of namespace.keys()) {
      const files = await namespace.readFiles(key, ['meta.json'], { touch: false });
      if (files === undefined) continue;
      try {
        out.push({ key, meta: JSON.parse(files['meta.json']) });
      } catch {
        /* a damaged entry is the cache's to drop on its next read */
      }
    }
    return out;
  }
  async function cachedDocuments() {
    return (await metasOf(caches.documents)).map(({ meta }) => meta);
  }
  /** DEC-2: a superseded version's text and extractions, once its 90 days have run. */
  async function evictVersion(partition, idurba) {
    const same = (document) =>
      document?.partition === partition && String(document?.idurba ?? '').toUpperCase() === idurba.toUpperCase();
    let removed = 0;
    for (const { key, meta } of await metasOf(caches.documents)) {
      if (same(meta) && (await caches.documents.remove(key))) removed += 1;
    }
    for (const { key, meta } of await metasOf(caches.extractions)) {
      if (same(meta.document) && (await caches.extractions.remove(key))) removed += 1;
    }
    return removed;
  }
  /** DEC-2: an extraction under another schema version is not served again; it goes. */
  async function evictOutdated() {
    let removed = 0;
    for (const { key, meta } of await metasOf(caches.extractions)) {
      if (meta.schemaVersion !== SCHEMA_VERSION && (await caches.extractions.remove(key))) removed += 1;
    }
    return removed;
  }
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
  const seeds = createWindowLimiter({ limit: limits.watchSeedsPerHour, windowMs: HOUR, now: clock });
  const georisquesCalls = createWindowLimiter({ limit: limits.georisquesPerHour, windowMs: HOUR, now: clock });
  const georisques = createGeorisques({ env, version: VERSION, logger, clock, ...georisquesSeams });
  // The daily schedule runs for a real deployment (no injected GPU) or when asked for (`watch: true`);
  // an object is the watcher's test seams and starts nothing.
  if ((watch === true || (watch === undefined && fetcher === undefined)) && env.FR_URBAN_RULES_WATCH !== 'off') watcher.start();
  let warnedAddress = false;

  function takeRead(limitKey) {
    const read = reads.take(limitKey);
    if (!read.ok) throw new ServiceError('rate_limited', { retryAfterSeconds: read.retryAfterSeconds });
  }

  /**
   * The model the user chose in the editor's AI panel (Sprint 002.16): `{ providerId, model? }` or
   * `undefined`. An id and a name, never an address: anything else is refused, not trimmed.
   */
  function readSelection(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ServiceError('invalid_request', { field: 'ai' });
    }
    for (const name of Object.keys(value)) {
      if (name !== 'providerId' && name !== 'model') throw new ServiceError('invalid_request', { field: 'ai' });
    }
    if (typeof value.providerId !== 'string' || !SELECTION_PATTERNS.providerId.test(value.providerId)) {
      throw new ServiceError('invalid_request', { field: 'ai' });
    }
    if (value.model !== undefined && (typeof value.model !== 'string' || !SELECTION_PATTERNS.model.test(value.model))) {
      throw new ServiceError('invalid_request', { field: 'ai' });
    }
    return { providerId: value.providerId, ...(value.model === undefined || value.model === '' ? {} : { model: value.model }) };
  }

  /** `GET …&cachedOnly=1`'s `provider` and `model` parameters, the same selection. */
  function querySelection(query) {
    const providers = query.getAll('provider');
    const models = query.getAll('model');
    if (providers.length === 0 && models.length === 0) return undefined;
    if (providers.length !== 1 || models.length > 1) throw new ServiceError('invalid_request', { field: 'provider' });
    return readSelection({ providerId: providers[0], ...(models.length === 1 ? { model: models[0] } : {}) });
  }

  /**
   * A POST body, `{ partition, idurba, nomfic, zone }` strings and an optional `ai` selection and
   * nothing else: `{ inputs, selection }`.
   */
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
    const { ai: aiField, ...fields } = parsed;
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) {
      if (!(name in INPUT_PATTERNS) || typeof value !== 'string') {
        throw new ServiceError('invalid_request', { field: 'body' });
      }
      query.append(name, value);
    }
    return { inputs: readInputs(query), selection: readSelection(aiField) };
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
      const { inputs, selection } = bodyInputs(request.body);
      const refresh = request.query.get('refresh') === '1';
      const answer = await extractions.post(inputs, {
        refresh,
        limitKey: request.limitKey,
        userHash: request.userHash,
        userSource: request.userSource,
        selection,
        features: request.features
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
      const answer = await extractions.cached(inputs, { selection: querySelection(request.query), features: request.features });
      return {
        ...answer,
        record: { event: 'extraction_cached', idurba: inputs.idurba, nomfic: inputs.nomfic, zone: inputs.zone, cache: answer.status === 200 ? 'hit' : 'miss' }
      };
    }
    throw new ServiceError('invalid_request', { field: 'method' });
  }

  /** `GET v1/documents/{partition}` (002.10 DEC-3). */
  async function documentsRoute(request, rest) {
    if (rest.length !== 1) throw new ServiceError('not_found');
    takeRead(request.limitKey);
    if (!INPUT_PATTERNS.partition.test(rest[0])) throw new ServiceError('invalid_request', { field: 'partition' });
    const body = await watcher.status(rest[0], {
      // Only a first look at an unwatched partition is a GPU call; it is the user's.
      beforeSeed: () => {
        const taken = seeds.take(request.limitKey);
        if (!taken.ok) throw new ServiceError('rate_limited', { retryAfterSeconds: taken.retryAfterSeconds });
      }
    });
    return { body };
  }

  /** `GET v1/georisques[/<path>]` (002.10 DEC-5). */
  async function georisquesRoute(request, rest) {
    takeRead(request.limitKey);
    if (rest.length === 0) return { body: georisques.status() };
    return georisques.get(rest, request.query, {
      beforeCall: () => {
        const taken = georisquesCalls.take(request.limitKey);
        if (!taken.ok) throw new ServiceError('rate_limited', { retryAfterSeconds: taken.retryAfterSeconds });
      }
    });
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
     *   limitKey: string, userHash: string, userSource: 'header' | 'address',
     *   features?: string[]   the account's, from the proxy's header; absent when it sent none
     * }} request `segments` decoded, after the package id; `body` at most 4 KiB
     * @returns {Promise<{ status: number, headers?: Record<string, string>, body: object }>}
     */
    async handle(request) {
      const started = clock();
      const route = request.segments.join('/');
      const [version, name, ...rest] = request.segments;
      if (
        version !== 'v1' ||
        !['chapter', 'extractions', 'documents', 'georisques'].includes(name) ||
        (name === 'chapter' && rest.length > 0)
      ) {
        return { status: 404, body: { error: 'not_found' } };
      }
      if ((name === 'chapter' || name === 'documents' || name === 'georisques') && request.method !== 'GET') {
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
      if (name === 'documents' || name === 'georisques') {
        const event = name === 'documents' ? 'documents' : 'georisques';
        const routeName = `v1/${name}${rest.length > 0 ? '/{…}' : ''}`;
        try {
          const answer = name === 'documents' ? await documentsRoute(request, rest) : await georisquesRoute(request, rest);
          logger('info', { event, route: routeName, user: request.userHash, userSource: request.userSource, outcome: 'ok', cache: answer.cache, durationMs: clock() - started });
          return { status: 200, body: answer.body };
        } catch (error) {
          return failed(error, { ...record, event, route: routeName }, started, request.query);
        }
      }
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
    idle: () => extractions.idle(),

    /** The document watch (002.10): tests and the walk drive it directly. */
    watcher,
    /** Stops the watch's timers (tests). */
    stop: () => watcher.stop()
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
