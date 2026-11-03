/**
 * The Géorisques v2 proxy (Sprint 002.10 DEC-5).
 *
 * Géorisques' v2 API wants a free registration token in `Authorization`
 * (probe 2026-10-19, row 11), and its CORS would let a browser send one — which
 * is exactly what this route exists to prevent. The token is the deployment's
 * (`FR_URBAN_RULES_GEORISQUES_TOKEN`, in this service's environment only): it
 * is added here, on the way out, and appears in no response, log line, error
 * detail or package.
 *
 *     GET v1/georisques                       → { configured, api: 'v2' }
 *     GET v1/georisques/<allow-listed path>?<allow-listed params>
 *       → the v2 answer, as JSON, and nothing of its headers
 *
 * - **An allow-list**, from Géorisques' public OpenAPI description
 *   (`/api/v3/api-docs/georisques-api-v2`, read 2026-11-03, no token needed):
 *   the five paths 002.0 reads in v1 — `gaspar/risques`, `gaspar/pprn`,
 *   `zonage_sismique`, `rga`, `radon` — with `codesInsee`, `longitude`,
 *   `latitude`, `rayon`, `pageSize` and `pageNumber`. Not `geometry` and not
 *   `codesParcelle`: nothing here carries a parcel.
 * - **One host**, `www.georisques.gouv.fr`, over `https:`, through the same
 *   guarded name resolution as the GPU fetcher; a redirect is refused.
 * - **24 hours** in memory per path and parameters; a hit costs the user
 *   nothing. A miss is charged to the user's hourly Géorisques budget.
 * - **Not configured** (no token): `503 not_configured`, and the extension
 *   keeps v1 from the browser.
 *
 * Unverified, because no token exists yet: the exact `Authorization` value the
 * host expects (the OpenAPI names the scheme "Bearer token" and types it as an
 * API key in the header, so the raw token is sent;
 * `FR_URBAN_RULES_GEORISQUES_AUTH_SCHEME=Bearer` sends `Bearer <token>` instead),
 * and the shape of a real answer. See the sprint's Outcome.
 */

import https from 'node:https';
import { ServiceError } from './errors.mjs';
import { guardedLookup } from './fetcher.mjs';

export const GEORISQUES_HOST = 'www.georisques.gouv.fr';
export const GEORISQUES_PREFIX = '/api/v2/';
export const MAX_ANSWER_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
export const CACHE_TTL_MS = 24 * 3_600_000;
export const CACHE_ENTRIES = 500;

const INSEE = '(?:[0-9]{5}|2[AB][0-9]{3})';
const NUMBER = '-?[0-9]{1,3}(?:\\.[0-9]{1,8})?';
/** Parameter → the pattern its one value must match. */
const PARAMS = Object.freeze({
  codesInsee: new RegExp(`^${INSEE}(?:,${INSEE}){0,4}$`, 'u'),
  longitude: new RegExp(`^${NUMBER}$`, 'u'),
  latitude: new RegExp(`^${NUMBER}$`, 'u'),
  rayon: /^[0-9]{1,5}$/u,
  pageSize: /^(?:[1-9][0-9]{0,2}|1000)$/u,
  pageNumber: /^[0-9]{1,4}$/u
});

/** The paths 002.0 reads in v1, in v2 (OpenAPI, 2026-11-03). */
export const ALLOWED_PATHS = Object.freeze(['gaspar/risques', 'gaspar/pprn', 'zonage_sismique', 'rga', 'radon']);

/** A token as a header value: printable ASCII with no space, so nothing can split the header. */
const TOKEN = /^[\x21-\x7e]{8,512}$/u;
const SCHEME = /^[A-Za-z]{1,16}$/u;

/**
 * @param {{
 *   env: Record<string, string | undefined>,
 *   version: string,
 *   logger: (level: string, record: object) => void,
 *   lookup?: Function, request?: Function, port?: number,   tests only, as the fetcher's
 *   timeoutMs?: number, ttlMs?: number, clock?: () => number
 * }} options
 */
export function createGeorisques({
  env,
  version,
  logger,
  lookup = guardedLookup(),
  request = https.request,
  port,
  timeoutMs = TIMEOUT_MS,
  ttlMs = CACHE_TTL_MS,
  clock = () => Date.now()
}) {
  const raw = String(env.FR_URBAN_RULES_GEORISQUES_TOKEN ?? '').trim();
  const scheme = String(env.FR_URBAN_RULES_GEORISQUES_AUTH_SCHEME ?? '').trim();
  const usable = raw !== '' && TOKEN.test(raw) && (scheme === '' || SCHEME.test(scheme));
  if (raw !== '' && !usable) {
    // Said without the value.
    logger('warn', { event: 'georisques_token_unusable', message: 'the token or its scheme is not a plain header value; the proxy is off' });
  }
  const header = usable ? (scheme === '' ? raw : `${scheme} ${raw}`) : undefined;
  const userAgent = `ArchiSimple-fr-urban-rules-service/${version}`;
  /** key → { at, body } */
  const cache = new Map();
  /** key → the call in flight, so two readers of one answer make one call */
  const inFlight = new Map();
  let rejectedLoggedAt = -Infinity;

  /** The path and the query, checked: `{ path, search }` (sorted, so one answer has one key), or `invalid_request`. */
  function checked(segments, query) {
    const path = segments.join('/');
    if (!ALLOWED_PATHS.includes(path)) throw new ServiceError('not_found', { reason: 'path_not_allowed' });
    const pairs = [];
    for (const name of new Set(query.keys())) {
      const values = query.getAll(name);
      const pattern = Object.hasOwn(PARAMS, name) ? PARAMS[name] : undefined;
      if (pattern === undefined || values.length !== 1 || !pattern.test(values[0])) {
        throw new ServiceError('invalid_request', { field: Object.hasOwn(PARAMS, name) ? name : 'query' });
      }
      pairs.push([name, values[0]]);
    }
    const names = new Set(pairs.map(([name]) => name));
    if (!names.has('codesInsee') && !(names.has('longitude') && names.has('latitude'))) {
      throw new ServiceError('invalid_request', { field: 'locator' });
    }
    pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const search = new URLSearchParams(pairs).toString();
    return { path, search };
  }

  function hop(path, search) {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const req = request(
        {
          protocol: request === https.request ? 'https:' : undefined,
          hostname: GEORISQUES_HOST,
          servername: GEORISQUES_HOST,
          port: port ?? 443,
          path: `${GEORISQUES_PREFIX}${path}?${search}`,
          method: 'GET',
          headers: { 'User-Agent': userAgent, Accept: 'application/json', Authorization: header },
          lookup,
          agent: false,
          signal: controller.signal
        },
        async (response) => {
          try {
            resolve(await readAnswer(response));
          } catch (error) {
            reject(error);
          } finally {
            clearTimeout(timer);
          }
        }
      );
      req.on('error', (error) => {
        clearTimeout(timer);
        if (controller.signal.aborted) reject(new ServiceError('source_unavailable', { reason: 'timeout' }));
        else if (error?.code === 'EADDRREFUSED') reject(new ServiceError('source_refused', { reason: 'address_refused' }));
        else reject(new ServiceError('source_unavailable', { reason: 'network' }));
      });
      req.end();
    });
  }

  /** The status mapped to the service's codes; the upstream's body is read only for a 200, never echoed. */
  async function readAnswer(response) {
    const status = response.statusCode ?? 0;
    if (status !== 200) {
      response.destroy();
      if (status === 401 || status === 403) {
        const at = clock();
        // Once in ten minutes: a rejected token fails every read until someone changes it.
        if (at - rejectedLoggedAt > 600_000) {
          rejectedLoggedAt = at;
          logger('warn', { event: 'georisques_token_rejected', status });
        }
        throw new ServiceError('source_refused', { reason: 'token_rejected', status });
      }
      if (status === 400) throw new ServiceError('invalid_request', { field: 'query', upstream: 400 });
      if (status >= 300 && status < 400) throw new ServiceError('source_refused', { reason: 'redirect_refused' });
      if (status === 404) throw new ServiceError('source_refused', { status });
      if (status >= 500 || status === 429) throw new ServiceError('source_unavailable', { status });
      throw new ServiceError('source_refused', { status });
    }
    if (!/\bjson\b/iu.test(String(response.headers['content-type'] ?? ''))) {
      response.destroy();
      throw new ServiceError('source_unavailable', { reason: 'malformed' });
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response) {
      size += chunk.length;
      if (size > MAX_ANSWER_BYTES) {
        response.destroy();
        throw new ServiceError('source_unavailable', { reason: 'answer_too_large' });
      }
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ServiceError('source_unavailable', { reason: 'malformed' });
    }
  }

  return {
    configured: () => header !== undefined,

    /** `GET v1/georisques` */
    status: () => ({ configured: header !== undefined, api: 'v2' }),

    /**
     * `GET v1/georisques/<path>`: `{ body, cache: 'hit' | 'miss' | 'joined' }`.
     * `beforeCall` runs only for a miss and may throw (`rate_limited`).
     */
    async get(segments, query, { beforeCall } = {}) {
      const { path, search } = checked(segments, query);
      if (header === undefined) throw new ServiceError('not_configured', { reason: 'no_georisques_token' });
      const key = `${path}?${search}`;
      const at = clock();
      const held = cache.get(key);
      if (held !== undefined && at - held.at < ttlMs) return { body: held.body, cache: 'hit' };
      const running = inFlight.get(key);
      if (running !== undefined) return { body: await running, cache: 'joined' };
      beforeCall?.();
      const call = hop(path, search);
      inFlight.set(key, call);
      try {
        const body = await call;
        cache.delete(key);
        cache.set(key, { at: clock(), body });
        while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        return { body, cache: 'miss' };
      } finally {
        inFlight.delete(key);
      }
    },

    /** Entries held (tests). */
    size: () => cache.size
  };
}
