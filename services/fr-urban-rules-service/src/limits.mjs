/**
 * Limits (Sprint 002.5a DEC-8).
 *
 * Counts live in memory and are forgotten on restart, like the share
 * service's write limiter. They are keyed by `X-Authenticated-User`, which
 * Caddy sets from the signed-in account (ADR-0114 Rule 10); without it, by the
 * client address — behind `web` that is nginx's, so every user then shares
 * one budget, and the log says so.
 */

export const DEFAULT_FETCHES_PER_HOUR = 30;
export const DEFAULT_READS_PER_MINUTE = 60;
/** Sprint 002.5b DEC-8 (Q44): model-backed extractions, and `refresh=1`. */
export const DEFAULT_EXTRACTS_PER_HOUR = 6;
export const DEFAULT_EXTRACTS_PER_DAY = 20;
export const DEFAULT_REFRESHES_PER_DAY = 2;

function positiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** The limits a deployment may change, by their named variables. */
export function limitsFromEnv(env) {
  return {
    extractsPerHour: positiveInteger(env.FR_URBAN_RULES_LIMIT_EXTRACT_HOUR, DEFAULT_EXTRACTS_PER_HOUR),
    extractsPerDay: positiveInteger(env.FR_URBAN_RULES_LIMIT_EXTRACT_DAY, DEFAULT_EXTRACTS_PER_DAY),
    refreshesPerDay: positiveInteger(env.FR_URBAN_RULES_LIMIT_REFRESH_DAY, DEFAULT_REFRESHES_PER_DAY),
    // Smaller chunks and fewer items per call for a slow local model; never
    // above DEC-4's 40 000 characters or 096.7's ceilings.
    chunkChars: Math.min(40_000, positiveInteger(env.FR_URBAN_RULES_EXTRACT_CHUNK_CHARS, 40_000)),
    maxItemsPerChunk: Math.min(200, positiveInteger(env.FR_URBAN_RULES_EXTRACT_MAX_ITEMS, 120)),
    fetchesPerHour: positiveInteger(env.FR_URBAN_RULES_LIMIT_FETCH_HOUR, DEFAULT_FETCHES_PER_HOUR),
    readsPerMinute: positiveInteger(env.FR_URBAN_RULES_LIMIT_READ_MINUTE, DEFAULT_READS_PER_MINUTE)
  };
}

/**
 * A sliding window: at most `limit` takes per `windowMs` for one key.
 *
 * @param {{ limit: number, windowMs: number, now?: () => number }} options
 */
export function createWindowLimiter({ limit, windowMs, now = () => Date.now() }) {
  /** key → timestamps, oldest first */
  const takes = new Map();
  let sweptAt = now();

  /** Forgets every key whose window has emptied, once per window: the map does not grow with every user ever seen. */
  function sweep() {
    if (now() - sweptAt < windowMs) return;
    sweptAt = now();
    const cutoff = sweptAt - windowMs;
    for (const [key, list] of takes) {
      if (list.at(-1) <= cutoff) takes.delete(key);
    }
  }

  function recent(key) {
    const cutoff = now() - windowMs;
    const list = (takes.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length === 0) takes.delete(key);
    else takes.set(key, list);
    return list;
  }

  return {
    /** `{ ok: true }`, counted; or `{ ok: false, retryAfterSeconds }`, not counted. */
    take(key) {
      sweep();
      const list = recent(key);
      if (list.length >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((list[0] + windowMs - now()) / 1000));
        return { ok: false, retryAfterSeconds };
      }
      const at = now();
      list.push(at);
      takes.set(key, list);
      return { ok: true, at };
    },
    /** Gives back one take — `at`, the one `take` answered, else the latest. */
    refund(key, at) {
      const list = takes.get(key);
      if (list === undefined) return;
      const index = at === undefined ? list.length - 1 : list.lastIndexOf(at);
      if (index >= 0) list.splice(index, 1);
      if (list.length === 0) takes.delete(key);
    },
    size: () => takes.size
  };
}
