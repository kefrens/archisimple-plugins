/**
 * The document watch (Sprint 002.10 DEC-1, DEC-2).
 *
 * The Géoportail de l'Urbanisme is the authority for "a new version exists":
 * a GPU **partition** (`DU_<insee or siren>`) has exactly one document in
 * production, and a new version is a different `id`. The watch records, per
 * partition the service has a document for, which one that is, asks again
 * about once a day, and answers the extension's « is this still current? »
 * in one cheap read (`GET v1/documents/<partition>`).
 *
 * - **Never a parcel.** The unit is a partition; the store holds document
 *   identifiers and dates, nothing a user or a plot could be recognised by.
 * - **The watch writes no project and reopens nothing** (Design Contract 2):
 *   it records what the GPU says. Confirmations reopen at read time, from the
 *   stored `idurba` (proposal §8, 002.0–002.2).
 * - **Polite.** Every GPU call the watch makes — the daily checks and the
 *   first look at an unknown partition — goes through one gate: at most one a
 *   second, whoever asked. A failure backs off (5 minutes, doubling, to 6
 *   hours); a partition failing for three days running is logged as failing
 *   and said in its answer, never dropped.
 * - **The listing is asked with `status=document.production`** (the fetcher's
 *   URL): without it the default page is 20 archived items, oldest first, and
 *   a document in force can fall outside it (probe 2026-10-19, rows 1–4).
 *
 * One JSON file per partition under `<data>/<package id>/watch/`, off the
 * cache's byte budget: a record is a few hundred bytes, and losing the folder
 * costs a re-seed from the caches and the extension's next question.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ownDocuments } from './document.mjs';
import { ServiceError } from './errors.mjs';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** DEC-1: daily, spread over a further window so a deployment does not ask every partition at once. */
export const CHECK_INTERVAL_MS = DAY_MS;
export const CHECK_JITTER_MS = 4 * HOUR_MS;
/** DEC-1: at most one request a second to the GPU. */
export const GPU_GAP_MS = 1000;
/** DEC-1: exponential back-off on a failure. */
export const FIRST_BACKOFF_MS = 5 * 60_000;
export const MAX_BACKOFF_MS = 6 * HOUR_MS;
/** DEC-1: a partition failing this many days running is reported. */
export const FAILING_AFTER_DAYS = 3;
/** DEC-2: a superseded version's text and extractions are kept this long. */
export const SUPERSEDED_KEEP_MS = 90 * DAY_MS;
/** DEC-2: a record no client has read for this long is forgotten. */
export const RECORD_IDLE_MS = 180 * DAY_MS;
export const PREVIOUS_MAX = 20;
/** The most partitions watched: a first look at an unknown one is refused beyond it. */
export const MAX_RECORDS = 5000;
export const TICK_MS = 15 * 60_000;
export const FIRST_TICK_MS = 60_000;

const PARTITION = /^DU_[0-9A-Z]{5,9}(?:_[0-9A-Z]{1,4})?$/u;

/** `23/04/2026 13:44:58` (the GPU's spelling) → `2026-04-23`; `undefined` for anything else. */
export function isoDateOfGpu(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/u.exec(String(value ?? ''));
  if (m === null) return undefined;
  const [, day, month, year] = m;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day)) return undefined;
  return `${year}-${month}-${day}`;
}

/** A stable offset in `[0, CHECK_JITTER_MS)` for a partition: its checks stay at the same time of day. */
function jitterOf(partition) {
  return createHash('sha1').update(partition).digest().readUInt32BE(0) % CHECK_JITTER_MS;
}

/** At most one task per `gapMs`, in the order asked; a failing task does not stop the line. */
export function createGate({ gapMs = GPU_GAP_MS, clock = () => Date.now(), sleep }) {
  let last = -Infinity;
  let line = Promise.resolve();
  return function through(task) {
    const run = line.then(async () => {
      const wait = last + gapMs - clock();
      if (wait > 0) await sleep(wait);
      last = clock();
      return task();
    });
    line = run.catch(() => {});
    return run;
  };
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{
 *   dir: string,                         the watch folder
 *   fetcher: { listDocuments: (partition: string) => Promise<unknown> },
 *   logger: (level: string, record: object) => void,
 *   now?: () => Date, clock?: () => number,
 *   sleep?: (ms: number) => Promise<void>,   the gate's wait (tests move a fake clock)
 *   evictVersion?: (partition: string, idurba: string) => Promise<number>,
 *   evictOutdated?: () => Promise<number>,   extraction results of an older schema
 *   cachedDocuments?: () => Promise<{ partition, documentId, idurba, retrievedAt }[]>
 * }} options
 */
export function createWatcher({
  dir,
  fetcher,
  logger,
  now = () => new Date(),
  clock = () => Date.now(),
  sleep = sleepFor,
  evictVersion = async () => 0,
  evictOutdated = async () => 0,
  cachedDocuments = async () => []
}) {
  const gate = createGate({ clock, sleep });
  /** partition → the line of work on it, so a check and a read never write one file at once */
  const locks = new Map();
  let timer;
  let first;
  let ticking = false;

  const fileOf = (partition) => join(dir, `${partition}.json`);

  function lock(partition, task) {
    const previous = locks.get(partition) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => {});
    locks.set(partition, tail);
    // The map does not grow with every partition ever seen.
    void tail.then(() => {
      if (locks.get(partition) === tail) locks.delete(partition);
    });
    return run;
  }

  async function load(partition) {
    try {
      const record = JSON.parse(await readFile(fileOf(partition), 'utf8'));
      return record !== null && typeof record === 'object' && record.partition === partition ? record : undefined;
    } catch {
      return undefined;
    }
  }

  async function save(record) {
    await mkdir(dir, { recursive: true });
    const target = fileOf(record.partition);
    const staging = `${target}.${randomUUID()}.tmp`;
    await writeFile(staging, JSON.stringify(record));
    await rename(staging, target);
  }

  async function list() {
    let names;
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const out = [];
    for (const name of names) {
      if (!name.endsWith('.json')) {
        // A write that never finished renaming is not a record.
        if (name.endsWith('.tmp')) await rm(join(dir, name), { force: true });
        continue;
      }
      const partition = name.slice(0, -'.json'.length);
      if (!PARTITION.test(partition)) continue;
      const record = await load(partition);
      if (record !== undefined) out.push(record);
    }
    return out;
  }

  const nextCheckFrom = (partition, at) => new Date(at.getTime() + CHECK_INTERVAL_MS + jitterOf(partition)).toISOString();

  /** What the route answers (DEC-3): the document in force, when it was last confirmed, and what it replaced. */
  function view(record) {
    const out = {
      partition: record.partition,
      current: record.current ?? null,
      withdrawn: record.current === null || record.current === undefined,
      checkedAt: record.checkedAt ?? null,
      previous: (record.previous ?? []).map(({ gpuDocId, originalName, supersededAt }) => ({
        gpuDocId,
        originalName,
        supersededAt
      }))
    };
    if (record.withdrawnAt !== undefined) out.withdrawnAt = record.withdrawnAt;
    if (record.failure !== undefined) {
      const days = Math.max(0, Math.floor((now().getTime() - Date.parse(record.failure.since)) / DAY_MS));
      out.failing = { code: record.failure.code, days };
    }
    return out;
  }

  /** The record after a GPU listing, or throws a `ServiceError` for a listing that is not one. */
  function judge(record, listing, at) {
    if (!Array.isArray(listing)) throw new ServiceError('source_unavailable', { reason: 'malformed' });
    const own = ownDocuments(listing, record.partition);
    const stamp = at.toISOString();
    const next = { ...record, previous: [...(record.previous ?? [])], checkedAt: stamp };
    delete next.failure;
    let changed = false;
    if (own.length === 0) {
      // Zero in production: withdrawn (a commune back to national rules, or not on the GPU).
      if (next.current) {
        next.previous.unshift({ ...pick(next.current), supersededAt: stamp });
        next.current = null;
        changed = true;
      }
      next.withdrawnAt ??= stamp;
      delete next.anomaly;
    } else {
      // More than one is an anomaly: logged, and the newest taken.
      const chosen = own.length === 1 ? own[0] : newest(own);
      if (own.length > 1) {
        next.anomaly = true;
        logger('warn', { event: 'watch_anomaly', partition: record.partition, documents: own.length });
      } else delete next.anomaly;
      const known = next.current;
      if (known && (known.gpuDocId !== chosen.id || known.originalName.toUpperCase() !== chosen.originalName.toUpperCase())) {
        next.previous.unshift({ ...pick(known), supersededAt: stamp });
        changed = true;
      }
      next.current = {
        gpuDocId: chosen.id,
        originalName: chosen.originalName,
        ...(isoDateOfGpu(chosen.publicationDate) === undefined ? {} : { publicationDate: isoDateOfGpu(chosen.publicationDate) })
      };
      delete next.withdrawnAt;
    }
    // One entry per superseded document, the newest first, bounded.
    const seen = new Set();
    next.previous = next.previous
      .filter((p) => !seen.has(p.gpuDocId) && seen.add(p.gpuDocId))
      .slice(0, PREVIOUS_MAX);
    next.nextCheckAt = nextCheckFrom(record.partition, at);
    return { next, changed };
  }

  const pick = ({ gpuDocId, originalName, publicationDate }) => ({
    gpuDocId,
    originalName,
    ...(publicationDate === undefined ? {} : { publicationDate })
  });

  function newest(documents) {
    return [...documents].sort((a, b) =>
      (isoDateOfGpu(b.publicationDate) ?? '').localeCompare(isoDateOfGpu(a.publicationDate) ?? '')
    )[0];
  }

  /** A failed look: kept on the record, backed off; `undefined` when there is no record to keep it on. */
  function failedRecord(record, error, at) {
    const code = error instanceof ServiceError ? error.code : 'internal_error';
    const count = (record.failure?.count ?? 0) + 1;
    const delay = Math.min(MAX_BACKOFF_MS, FIRST_BACKOFF_MS * 2 ** Math.min(count - 1, 12));
    return {
      ...record,
      failure: { since: record.failure?.since ?? at.toISOString(), count, code },
      nextCheckAt: new Date(at.getTime() + delay).toISOString()
    };
  }

  /**
   * One GPU look at a partition, through the gate. `seed`: the partition has no
   * record — a failure then leaves none, and a partition with nothing in
   * production is answered, not recorded (nobody has anything cached for it).
   */
  async function check(partition, { seed = false } = {}) {
    if (!PARTITION.test(partition)) throw new ServiceError('invalid_request', { field: 'partition' });
    return lock(partition, async () => {
      const existing = await load(partition);
      if (existing === undefined && !seed) return undefined;
      const record = existing ?? { version: 1, partition, previous: [], lastReadAt: now().toISOString() };
      let listing;
      try {
        listing = await gate(() => fetcher.listDocuments(partition));
      } catch (error) {
        return failure(existing, record, error);
      }
      let judged;
      try {
        judged = judge(record, listing, now());
      } catch (error) {
        return failure(existing, record, error);
      }
      const { next, changed } = judged;
      if (existing === undefined && !next.current) {
        // Never known and nothing in production: answered, not recorded.
        return { view: view(next), changed: false, recorded: false };
      }
      await save(next);
      if (changed) {
        logger('info', {
          event: 'watch_changed',
          partition,
          from: next.previous[0]?.originalName,
          to: next.current?.originalName ?? null
        });
      } else logger('debug', { event: 'watch_checked', partition });
      return { view: view(next), changed, recorded: true };
    });
  }

  async function failure(existing, record, error) {
    const at = now();
    if (existing === undefined) throw error instanceof ServiceError ? error : new ServiceError('source_unavailable', { reason: 'network' });
    const next = failedRecord(record, error, at);
    await save(next);
    const days = (at.getTime() - Date.parse(next.failure.since)) / DAY_MS;
    logger(days >= FAILING_AFTER_DAYS ? 'warn' : 'info', {
      event: days >= FAILING_AFTER_DAYS ? 'watch_failing' : 'watch_check_failed',
      partition: record.partition,
      code: next.failure.code,
      failures: next.failure.count,
      days: Math.floor(days)
    });
    return { view: view(next), changed: false, recorded: true, failed: true };
  }

  return {
    PARTITION,

    /**
     * DEC-3's route: the record, with a first look (one GPU call, through the
     * gate) when the partition is not watched yet. Reading it marks it read.
     * `beforeSeed` may throw (`rate_limited`, `busy`) to refuse that first look.
     */
    async status(partition, { beforeSeed } = {}) {
      if (!PARTITION.test(partition)) throw new ServiceError('invalid_request', { field: 'partition' });
      const known = await load(partition);
      if (known !== undefined) {
        return lock(partition, async () => {
          const record = (await load(partition)) ?? known;
          record.lastReadAt = now().toISOString();
          await save(record);
          return view(record);
        });
      }
      beforeSeed?.();
      if ((await list()).length >= MAX_RECORDS) throw new ServiceError('busy', { retryAfterSeconds: 3600 });
      const done = await check(partition, { seed: true });
      return done.view;
    },

    /**
     * An entry the document cache holds or has just read: the partition is
     * watched from it, with no GPU call (the identifiers are the GPU's own, from
     * the listing the fetch read). A partition already watched is marked read.
     */
    async noteDocument({ partition, documentId, idurba, retrievedAt }) {
      if (!PARTITION.test(partition) || typeof documentId !== 'string' || typeof idurba !== 'string') return;
      await lock(partition, async () => {
        const record = await load(partition);
        if (record !== undefined) {
          record.lastReadAt = now().toISOString();
          await save(record);
          return;
        }
        const at = new Date(Number.isFinite(Date.parse(retrievedAt)) ? Date.parse(retrievedAt) : now().getTime());
        await save({
          version: 1,
          partition,
          current: { gpuDocId: documentId, originalName: idurba },
          previous: [],
          checkedAt: at.toISOString(),
          nextCheckAt: nextCheckFrom(partition, at),
          lastReadAt: now().toISOString(),
          seededFrom: 'cache'
        });
      });
    },

    /** Every cached document is watched (DEC-1 seeding); run at start. */
    async seedFromCache() {
      for (const meta of await cachedDocuments()) await this.noteDocument(meta);
    },

    check,

    /** The records whose time has come, checked one after another through the gate. */
    async runDue() {
      let checked = 0;
      for (const record of await list()) {
        if (record.nextCheckAt !== undefined && Date.parse(record.nextCheckAt) > now().getTime()) continue;
        await check(record.partition);
        checked += 1;
      }
      return checked;
    },

    /** DEC-2: a superseded version's text and extractions go 90 days after; idle records go after 180. */
    async sweep() {
      const at = now().getTime();
      let evicted = 0;
      let forgotten = 0;
      for (const record of await list()) {
        const lastRead = Date.parse(record.lastReadAt ?? record.checkedAt ?? '');
        if (Number.isFinite(lastRead) && at - lastRead > RECORD_IDLE_MS) {
          await lock(record.partition, () => rm(fileOf(record.partition), { force: true }));
          forgotten += 1;
          continue;
        }
        let touched = false;
        for (const entry of record.previous ?? []) {
          if (entry.evictedAt !== undefined || at - Date.parse(entry.supersededAt) < SUPERSEDED_KEEP_MS) continue;
          evicted += await evictVersion(record.partition, entry.originalName);
          entry.evictedAt = new Date(at).toISOString();
          touched = true;
        }
        if (touched) {
          await lock(record.partition, async () => {
            const fresh = (await load(record.partition)) ?? record;
            fresh.previous = record.previous;
            await save(fresh);
          });
        }
      }
      evicted += await evictOutdated();
      if (evicted > 0 || forgotten > 0) logger('info', { event: 'watch_swept', evicted, forgotten });
      return { evicted, forgotten };
    },

    async tick() {
      if (ticking) return;
      ticking = true;
      try {
        await this.runDue();
        await this.sweep();
      } catch (error) {
        // Never the message: it may quote an upstream body.
        logger('error', { event: 'watch_tick_failed', errorName: error?.name });
      } finally {
        ticking = false;
      }
    },

    /** Starts the daily schedule; timers are unref'd so they never keep the process alive. */
    start() {
      if (timer !== undefined) return;
      first = setTimeout(() => {
        void this.seedFromCache()
          .catch(() => {})
          .then(() => this.tick());
      }, FIRST_TICK_MS);
      first.unref?.();
      timer = setInterval(() => void this.tick(), TICK_MS);
      timer.unref?.();
    },
    stop() {
      clearTimeout(first);
      clearInterval(timer);
      first = undefined;
      timer = undefined;
    },

    list,
    view
  };
}
