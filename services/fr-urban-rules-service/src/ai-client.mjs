/**
 * The client of ai-service's extract route (Sprint 002.5b; platform 096.7,
 * contract 1.2.0). The service's only model access: no key, no provider, one
 * address the deployment gives (`ARCHISIMPLE_AI_SERVICE_URL`, ADR-0114
 * Rule 7).
 *
 * The request carries only the fields 096.7 allows — `instructions`, `text`,
 * `itemSchema`, `maxItems`, and `providerId` and `model` when the user chose
 * them in the editor's AI panel (Sprint 002.16; `maxTokens` is unused here);
 * its review refuses any other.
 *
 * **Who is asking travels with the call** (002.16; ADR-0114 Rule 14): the
 * account's features, as the gateway took them from the deployment's proxy, go
 * to ai-service in `X-Authenticated-Features` — the one header it believes from
 * a trusted proxy — so a provider the account was not granted is refused there
 * with ai-service's own code, `provider_not_permitted`. Nothing else about the
 * user is sent, and never an `Authorization`.
 */

export const STRUCTURED_OUTPUT = 'structured-output';

/** The header ai-service reads, behind a proxy that overwrites it (ADR-0026 revision 4). */
export const FEATURES_HEADER = 'x-authenticated-features';
/** A feature id as `account-service` defines them (`ai-openai`, `plu`, …); anything else is dropped. */
const FEATURE_TOKEN = /^[a-z0-9][a-z0-9-]{0,39}$/u;
const MAX_FEATURES = 32;

/** The entitlement header for a call: the features as given, cleaned; none when there are none. */
export function entitlementHeaders(features) {
  if (!Array.isArray(features)) return {};
  const clean = [...new Set(features.filter((f) => typeof f === 'string' && FEATURE_TOKEN.test(f)))].slice(0, MAX_FEATURES);
  return clean.length === 0 ? {} : { [FEATURES_HEADER]: clean.join(',') };
}
const HEALTH_TIMEOUT_MS = 5_000;
/**
 * How long one extract call may take, from here (`FR_URBAN_RULES_EXTRACT_TIMEOUT_MS`).
 * 30 minutes by default; never below 096.7's default deadline (120 s), and it
 * should be at least ai-service's own `AI_SERVICE_REQUEST_TIMEOUT_MS`, the one
 * deadline of a call there — a slow local model can use all of it.
 */
export const EXTRACT_TIMEOUT_MS = 30 * 60_000;
export const MIN_EXTRACT_TIMEOUT_MS = 120_000;

/** The client timeout from the environment, clamped to {@link MIN_EXTRACT_TIMEOUT_MS}. */
export function extractTimeoutFromEnv(env) {
  const n = Number(env.FR_URBAN_RULES_EXTRACT_TIMEOUT_MS);
  return Number.isInteger(n) && n > 0 ? Math.max(MIN_EXTRACT_TIMEOUT_MS, n) : EXTRACT_TIMEOUT_MS;
}

/*
 * Follow-up (2026-10-20): long extract calls.
 *
 * Node's `fetch` is undici, whose default dispatcher gives up on a response
 * whose headers have not arrived within 300 s (`UND_ERR_HEADERS_TIMEOUT`), and
 * on a body silent for 300 s. ai-service answers an extract call only when the
 * model has finished, which a local model can take longer than that. So the
 * extract call goes through an undici `Agent` with both limits off, and the
 * timeout above is its one bound. As the platform's `provider-fetch.ts` does:
 * the `Agent` class is Node's own, reached through the key undici registers
 * its global dispatcher under; anything else there (a proxy agent, another
 * runtime) leaves the platform fetch unchanged, and that is said once.
 */
const GLOBAL_DISPATCHER = Symbol.for('undici.globalDispatcher.1');
const UNBOUNDED = { headersTimeout: 0, bodyTimeout: 0 };
let unbounded;

/** The unbounded dispatcher, made once per process; `undefined` when none can be made. */
export function unboundedDispatcher(warn = (message) => console.warn(`[fr-urban-rules-service] ${message}`)) {
  unbounded ??= (async () => {
    if (globalThis[GLOBAL_DISPATCHER] === undefined) await globalThis.fetch('data:,');
    const current = globalThis[GLOBAL_DISPATCHER];
    const Agent = current !== null && typeof current === 'object' ? current.constructor : undefined;
    if (typeof Agent !== 'function' || Agent.name !== 'Agent') {
      warn('extract calls keep the runtime fetch’s own 300 s header timeout: no undici Agent was found to lift it.');
      return undefined;
    }
    return new Agent(UNBOUNDED);
  })().catch((error) => {
    warn(`extract calls keep the runtime fetch’s own timeouts: ${error?.name ?? 'error'}`);
    return undefined;
  });
  return unbounded;
}
const MAX_ANSWER_BYTES = 8 * 1024 * 1024;
const MIN_TEXT_LENGTH = 1_000;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class AiError extends Error {
  /** @param {string} code 096.7's code, or `unreachable` / `malformed` */
  constructor(code, status) {
    super(code);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {{
 *   baseUrl: string, fetch?: typeof fetch, extractTimeoutMs?: number,
 *   dispatcher?: () => Promise<object | undefined>   the extract call's undici dispatcher (tests pass a bounded one)
 * }} options
 */
export function createAiClient({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  extractTimeoutMs = EXTRACT_TIMEOUT_MS,
  dispatcher = unboundedDispatcher
}) {
  const root = String(baseUrl).replace(/\/+$/u, '');

  async function call(path, init, timeoutMs, longCall = false) {
    let response;
    try {
      // `dispatcher` is undici's extension to the fetch options; a fetch that
      // knows nothing of it (a test's fake) ignores it.
      const agent = longCall ? await dispatcher() : undefined;
      response = await fetchImpl(`${root}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        ...(agent === undefined ? {} : { dispatcher: agent })
      });
    } catch {
      throw new AiError('unreachable', 0);
    }
    const text = await response.text();
    if (text.length > MAX_ANSWER_BYTES) throw new AiError('malformed', response.status);
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError('malformed', response.status);
    }
    if (!response.ok) {
      const code = typeof json?.error?.code === 'string' ? json.error.code : 'provider_error';
      throw new AiError(code, response.status);
    }
    return json;
  }

  return {
    /**
     * `{ available, defaultProviderId, maxTextLength, maxItems }`; never throws.
     * `features` makes the default the caller's own (ai-service names the first provider they may use).
     */
    async health({ features } = {}) {
      try {
        const h = await call('/api/ai/health', { method: 'GET', headers: entitlementHeaders(features) }, HEALTH_TIMEOUT_MS);
        // A limit that is not a whole number of at least 1 000 characters
        // could not be chunked to; such a service is read as unavailable.
        const available =
          Array.isArray(h.capabilities) &&
          h.capabilities.includes(STRUCTURED_OUTPUT) &&
          Number.isInteger(h.structuredOutput?.maxTextLength) &&
          h.structuredOutput.maxTextLength >= MIN_TEXT_LENGTH &&
          typeof h.defaultProviderId === 'string';
        return {
          available,
          defaultProviderId: typeof h.defaultProviderId === 'string' ? h.defaultProviderId : null,
          maxTextLength: h.structuredOutput?.maxTextLength,
          maxItems: h.structuredOutput?.maxItems
        };
      } catch {
        return { available: false, defaultProviderId: null };
      }
    },

    /**
     * One `POST /api/ai/extract`; the response DTO, or an {@link AiError}.
     * `route` is who is asking and what they chose: `{ providerId?, model?, features? }`. No
     * `providerId` means ai-service's default for that caller (before 002.16, always).
     */
    async extract({ instructions, text, itemSchema, maxItems }, route = {}) {
      const named = typeof route.providerId === 'string' && route.providerId !== '';
      const answer = await call(
        '/api/ai/extract',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...entitlementHeaders(route.features) },
          body: JSON.stringify({
            ...(named ? { providerId: route.providerId } : {}),
            ...(named && typeof route.model === 'string' && route.model !== '' ? { model: route.model } : {}),
            instructions,
            text,
            itemSchema,
            maxItems
          })
        },
        extractTimeoutMs,
        true
      );
      if (!Array.isArray(answer?.items)) throw new AiError('malformed', 200);
      for (const item of answer.items) {
        const p = item?.passage;
        if (
          !isObject(item?.value) ||
          !isObject(p) ||
          typeof p.text !== 'string' ||
          !Number.isInteger(p.start) ||
          !Number.isInteger(p.end) ||
          !Number.isInteger(p.occurrences)
        ) {
          throw new AiError('malformed', 200);
        }
      }
      return answer;
    }
  };
}
