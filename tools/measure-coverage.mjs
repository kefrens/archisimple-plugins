#!/usr/bin/env node
/**
 * National coverage, measured (Sprint 002.10 DEC-6). By hand, never a test.
 *
 * How often does a French plot meet each state the extension has to name —
 * a PLU(i), a carte communale, the national rules, « not on the GPU », or
 * « not known »? A seeded, stratified sample of communes is asked of the
 * public services the extension itself reads, and what comes back is
 * **classified and counted**. The report says how it was made and can be made
 * again.
 *
 *     node tools/measure-coverage.mjs --size 1000 --seed 20261103 \
 *         --confirm-terms-read [--list communes.json] [--save-list communes.json] \
 *         [--out docs/measurements] [--label national] [--max N]
 *
 * ## What it records — and what it never does
 *
 * - **Only** status codes, latencies and a classification per commune, plus the
 *   document's type, its public GPU partition and its publication date. Never a
 *   document, a règlement, a zone's text or a response body: nothing is kept
 *   but the CSV's columns, and the report's counts.
 * - It is **not a mirror** of anything. It asks each commune a handful of
 *   questions the extension asks anyway, once, and writes down the answers'
 *   shape.
 * - **Polite.** One request at a time and never more than two a second overall;
 *   it names itself (`ArchiSimple-fr-urban-rules-coverage/<version>`) and no one
 *   else — no contact address. A failed call is data, not retried.
 * - **Run it yourself.** A sample over {@link SMALL_RUN} communes needs
 *   `--confirm-terms-read`: the data is published under the Licence Ouverte v2.0
 *   (attribution required), but the exact usage terms of the Géoportail de
 *   l'urbanisme and of API Carto have **not** been verified by whoever wrote
 *   this. Read them before a large pass and before any public claim.
 *
 * ## Method (the report repeats it)
 *
 * 1. **Population:** `geo.api.gouv.fr/communes` (every commune, with its
 *    population and centre), overseas collectivities (`98x`) excluded. The
 *    list's SHA-256 and date are recorded; `--list` re-runs on a saved list.
 * 2. **Sample:** strata = département × population band (< 500, 500–2 000,
 *    2 000–10 000, > 10 000); every non-empty stratum gets a commune when the
 *    size allows, the rest proportionally (largest remainder); inside a
 *    stratum a seeded shuffle of the communes in code order. The five reference
 *    communes are added on top and **left out of the estimates**.
 * 3. **Per commune,** in order: API Carto `municipality?insee=` (`is_rnu`);
 *    API Carto `document?geom=<centre>` (type, partition, name); when a
 *    partition: the GPU's `document?partition=&status=document.production`
 *    (current id, publication date); Géorisques v1 `gaspar/risques`; and, only
 *    with `FR_URBAN_RULES_GEORISQUES_TOKEN` set, Géorisques v2 (status and
 *    latency only; the header form is unverified, see the service's README).
 * 4. **State:** `rnu` when `is_rnu`; else `cc` for a carte communale, `plu` for
 *    any other document (its type is tabulated); else `not-on-gpu`; `unknown`
 *    if the commune's own questions failed. A commune with both `is_rnu` and a
 *    document at its centre is `rnu` and listed as a conflict, not hidden.
 * 5. **Estimates:** each sampled commune weighs its stratum's size over the
 *    stratum's sample; a rate is the weighted share, with a Wilson 95 %
 *    interval at the weights' effective size. Strata with no draw are not
 *    represented (said in the report when so).
 *
 * Exports are for the tests: sampling, classification, statistics and the
 * report are pure; only {@link measure} and the command line touch a network.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION = '0.1.0';
export const USER_AGENT = `ArchiSimple-fr-urban-rules-coverage/${VERSION}`;
/** No more than this many requests a second, overall. */
export const MAX_PER_SECOND = 2;
export const REQUEST_TIMEOUT_MS = 20_000;
/** A run over this many communes needs `--confirm-terms-read`. */
export const SMALL_RUN = 100;

export const COMMUNES_URL = 'https://geo.api.gouv.fr/communes?fields=code,nom,population,codeDepartement,centre';
const APICARTO = 'https://apicarto.ign.fr/api/gpu/';
const GPU_DOCUMENT_API = 'https://www.geoportail-urbanisme.gouv.fr/api/document';
const GEORISQUES_V1 = 'https://georisques.gouv.fr/api/v1/';
const GEORISQUES_V2 = 'https://www.georisques.gouv.fr/api/v2/';

/** The five reference communes (Lyon, Gordes, Rochefort, Brouennes, Mouzay): added to every sample, never estimated from. */
export const REFERENCE_COMMUNES = Object.freeze(['69123', '84050', '56196', '55083', '55364']);

export const BANDS = Object.freeze([
  { id: 'lt500', label: '< 500', max: 500 },
  { id: '500-2000', label: '500–2 000', max: 2000 },
  { id: '2000-10000', label: '2 000–10 000', max: 10000 },
  { id: 'gte10000', label: '≥ 10 000', max: Infinity }
]);
export const STATES = Object.freeze(['plu', 'cc', 'rnu', 'not-on-gpu', 'unknown']);
export const ENDPOINTS = Object.freeze(['municipality', 'document', 'gpu', 'georisques-v1', 'georisques-v2']);

// Sampling ---------------------------------------------------------------------------

export const bandOf = (population) => BANDS.find((b) => population < b.max).id;

/** A small seeded generator (mulberry32): the same seed, the same sample. */
export function seededRandom(seed) {
  let a = Number(seed) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The communes a sample may draw: valid, not an overseas collectivity (`98x`), with a population and a centre. */
export function eligibleCommunes(list) {
  return list
    .filter(
      (c) =>
        typeof c?.code === 'string' &&
        /^(?:[0-9]{5}|2[AB][0-9]{3})$/u.test(c.code) &&
        !c.code.startsWith('98') &&
        Number.isFinite(c.population) &&
        c.population >= 0 &&
        Array.isArray(c.centre?.coordinates) &&
        c.centre.coordinates.length === 2
    )
    .map((c) => ({
      code: c.code,
      name: String(c.nom ?? ''),
      population: c.population,
      department: String(c.codeDepartement ?? c.code.slice(0, 2)),
      centre: c.centre.coordinates,
      band: bandOf(c.population)
    }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/** How many to draw from each stratum: one each when the size allows, the rest by largest remainder. Deterministic. */
export function allocate(sizes, total) {
  const keys = [...sizes.keys()].sort();
  const out = new Map(keys.map((k) => [k, 0]));
  const grand = keys.reduce((n, k) => n + sizes.get(k), 0);
  const want = Math.min(total, grand);
  if (want <= 0) return out;
  if (want < keys.length) {
    // Fewer draws than strata: the largest strata, ties by key.
    for (const k of [...keys].sort((a, b) => sizes.get(b) - sizes.get(a) || (a < b ? -1 : 1)).slice(0, want)) out.set(k, 1);
    return out;
  }
  for (const k of keys) out.set(k, 1);
  let remaining = want - keys.length;
  while (remaining > 0) {
    const room = keys.filter((k) => out.get(k) < sizes.get(k));
    if (room.length === 0) break;
    const capacity = room.reduce((n, k) => n + (sizes.get(k) - out.get(k)), 0);
    const shares = room.map((k) => {
      const exact = (remaining * (sizes.get(k) - out.get(k))) / capacity;
      return { k, whole: Math.min(Math.floor(exact), sizes.get(k) - out.get(k)), frac: exact - Math.floor(exact) };
    });
    let given = 0;
    for (const s of shares) {
      out.set(s.k, out.get(s.k) + s.whole);
      given += s.whole;
    }
    let left = remaining - given;
    for (const s of [...shares].sort((a, b) => b.frac - a.frac || (a.k < b.k ? -1 : 1))) {
      if (left <= 0) break;
      if (out.get(s.k) < sizes.get(s.k)) {
        out.set(s.k, out.get(s.k) + 1);
        left -= 1;
      }
    }
    remaining = left;
  }
  return out;
}

/**
 * The sample: `{ drawn, strata }`. `drawn` carries each commune's stratum, its
 * weight (the stratum's size over its draws) and `reference` for the five added
 * on top; `strata` lists every stratum with its size and draws.
 */
export function stratifiedSample(communes, { size, seed, reference = REFERENCE_COMMUNES }) {
  const byStratum = new Map();
  for (const c of communes) {
    const key = `${c.department}|${c.band}`;
    if (!byStratum.has(key)) byStratum.set(key, []);
    byStratum.get(key).push(c);
  }
  const sizes = new Map([...byStratum].map(([k, v]) => [k, v.length]));
  const counts = allocate(sizes, size);
  const random = seededRandom(seed);
  const drawn = [];
  const strata = [];
  // The reference communes come first: they are the ones a reader checks by eye.
  const referenceRows = [];
  for (const code of reference) {
    const c = communes.find((x) => x.code === code);
    if (c !== undefined) referenceRows.push({ ...c, stratum: `${c.department}|${c.band}`, weight: 0, reference: true });
  }
  for (const key of [...byStratum.keys()].sort()) {
    const members = byStratum.get(key);
    const n = counts.get(key);
    // A seeded Fisher–Yates over the stratum in code order.
    const shuffled = [...members];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    strata.push({ key, size: members.length, drawn: n });
    for (const c of shuffled.slice(0, n)) drawn.push({ ...c, stratum: key, weight: members.length / n, reference: false });
  }
  // A reference commune the draw also made is asked once, as a reference, and its draw is not counted in the estimates.
  const references = new Set(referenceRows.map((r) => r.code));
  const kept = drawn.filter((c) => !references.has(c.code));
  // Weights follow the rows that are kept: a stratum's size over the draws of it that are estimated from.
  const keptPer = new Map();
  for (const c of kept) keptPer.set(c.stratum, (keptPer.get(c.stratum) ?? 0) + 1);
  const sized = new Map(strata.map((s) => [s.key, s.size]));
  for (const c of kept) c.weight = sized.get(c.stratum) / keptPer.get(c.stratum);
  return { drawn: [...referenceRows, ...kept], strata };
}

// Classification -------------------------------------------------------------------

/** A call's outcome is a failure when it did not answer 200 with a body this script can read. */
const failed = (call) => call === undefined || call.ok !== true;

/**
 * One commune's state from what its questions returned (DEC-6 step 4). Pure.
 *
 * @param {{ municipality?: Call, document?: Call }} calls
 * @returns {{ state: string, type?: string, partition?: string, conflict?: boolean, isRnu?: boolean }}
 */
export function classify({ municipality, document }) {
  if (failed(municipality) || failed(document)) return { state: 'unknown' };
  const isRnu = municipality.isRnu;
  if (typeof isRnu !== 'boolean') return { state: 'unknown' };
  const found = document.found === true;
  if (isRnu) return { state: 'rnu', isRnu, ...(found ? { conflict: true, type: document.type, partition: document.partition } : {}) };
  if (!found) return { state: 'not-on-gpu', isRnu };
  const type = String(document.type ?? '').toUpperCase();
  return { state: type === 'CC' ? 'cc' : 'plu', type: document.type, partition: document.partition, isRnu };
}

// Statistics -----------------------------------------------------------------------

/** The nearest-rank percentile of a list of numbers; `undefined` for an empty list. */
export function percentile(values, p) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** A Wilson 95 % interval for a proportion at an (effective) sample size. */
export function wilson(p, n, z = 1.959964) {
  if (!(n > 0)) return { low: undefined, high: undefined };
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

/** Weighted shares per state with Wilson intervals at the weights' effective size (Kish). */
export function estimates(rows) {
  const drawn = rows.filter((r) => !r.reference && r.weight > 0);
  const total = drawn.reduce((n, r) => n + r.weight, 0);
  const squares = drawn.reduce((n, r) => n + r.weight * r.weight, 0);
  const effective = squares > 0 ? (total * total) / squares : 0;
  const out = {};
  for (const state of STATES) {
    const share = total > 0 ? drawn.filter((r) => r.state === state).reduce((n, r) => n + r.weight, 0) / total : 0;
    out[state] = {
      count: drawn.filter((r) => r.state === state).length,
      share,
      ...wilson(share, effective)
    };
  }
  return { drawn: drawn.length, effective, represented: total, states: out };
}

/** Latency and error rate per endpoint over every call made. */
export function endpointStats(rows) {
  const out = {};
  for (const name of ENDPOINTS) {
    const calls = rows.map((r) => r.calls[name]).filter((c) => c !== undefined);
    if (calls.length === 0) continue;
    const times = calls.map((c) => c.ms);
    const errors = calls.filter((c) => c.status === 0 || c.status >= 400).length;
    out[name] = {
      calls: calls.length,
      errors,
      errorRate: errors / calls.length,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      max: Math.max(...times),
      statuses: calls.reduce((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {})
    };
  }
  return out;
}

const DAY_MS = 86_400_000;

/** `23/04/2026 13:44:58` or `2026-04-23…` → `2026-04-23`; `undefined` for anything else. */
export function isoDay(value) {
  const gpu = /^(\d{2})\/(\d{2})\/(\d{4})/u.exec(String(value ?? ''));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(String(value ?? ''));
  const [y, m, d] = gpu ? [gpu[3], gpu[2], gpu[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
  if (y === undefined) return undefined;
  const date = new Date(Date.UTC(+y, +m - 1, +d));
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== +d ? undefined : `${y}-${m}-${d}`;
}

/** The age of the documents in force (distinct partitions) and the share published in the last 90 days. */
export function documentAges(rows, today) {
  const byPartition = new Map();
  for (const r of rows) {
    if (r.partition !== undefined && r.published !== undefined) byPartition.set(r.partition, r.published);
  }
  const ages = [...byPartition.values()].map((day) => Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS));
  return {
    documents: ages.length,
    median: percentile(ages, 50),
    p95: percentile(ages, 95),
    last90: ages.filter((a) => a >= 0 && a <= 90).length,
    last90Rate: ages.length === 0 ? undefined : ages.filter((a) => a >= 0 && a <= 90).length / ages.length
  };
}

// The pacer, the calls -------------------------------------------------------------

/** Never more than `perSecond` requests a second overall; the wait is the injected `sleep`'s. */
export function createPacer({ perSecond = MAX_PER_SECOND, clock = () => Date.now(), sleep }) {
  const gap = 1000 / perSecond;
  let last = -Infinity;
  return async function pace() {
    const wait = last + gap - clock();
    if (wait > 0) await sleep(wait);
    last = clock();
  };
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A fetch that names itself, is paced, times out, and keeps nothing of the body
 * but what `read` extracts. Never throws: `{ status: 0 }` is a call that did not answer.
 */
export function createCaller({ fetchImpl = globalThis.fetch, pace, clock = () => Date.now(), timeoutMs = REQUEST_TIMEOUT_MS, headers = {} }) {
  return async function call(url, { read, extraHeaders = {} } = {}) {
    await pace();
    const started = clock();
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal,
        redirect: 'error',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers, ...extraHeaders }
      });
      let json;
      try {
        json = await response.json();
      } catch {
        json = undefined;
      }
      const ms = clock() - started;
      const status = response.status;
      let extracted;
      try {
        extracted = response.ok && read !== undefined ? read(json) : undefined;
      } catch {
        extracted = undefined;
      }
      // `ok` only when the answer was read: a 200 that is not the shape asked for is a failure.
      return { status, ms, ok: response.ok && (read === undefined || extracted !== undefined), ...(extracted ?? {}) };
    } catch {
      return { status: 0, ms: clock() - started, ok: false };
    }
  };
}

const geomParam = (centre) => encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: centre }));

/** One commune's questions (DEC-6 step 3). Returns the row: calls with status, latency and classification inputs only. */
export async function askCommune(call, commune, { v2Token } = {}) {
  const calls = {};
  calls.municipality = await call(`${APICARTO}municipality?insee=${commune.code}`, {
    read: (json) => {
      const features = json?.features;
      if (!Array.isArray(features)) return undefined;
      const isRnu = features[0]?.properties?.is_rnu;
      // A commune API Carto does not know, or a flag that is not a boolean, is not an answer.
      return typeof isRnu === 'boolean' ? { isRnu } : undefined;
    }
  });
  calls.document = await call(`${APICARTO}document?geom=${geomParam(commune.centre)}`, {
    read: (json) => {
      const features = json?.features;
      if (!Array.isArray(features)) return undefined;
      const p = features[0]?.properties;
      return features.length === 0
        ? { found: false }
        : { found: true, type: typeof p?.du_type === 'string' ? p.du_type : undefined, partition: typeof p?.partition === 'string' ? p.partition : undefined };
    }
  });
  let published;
  if (calls.document.found === true && /^DU_[0-9A-Z]{5,9}(?:_[0-9A-Z]{1,4})?$/u.test(calls.document.partition ?? '')) {
    calls.gpu = await call(`${GPU_DOCUMENT_API}?partition=${calls.document.partition}&status=document.production`, {
      read: (json) => {
        if (!Array.isArray(json)) return undefined;
        const own = json.filter((d) => typeof d?.id === 'string');
        return { count: own.length, published: isoDay(own[0]?.publicationDate) };
      }
    });
    published = calls.gpu.published;
  }
  calls['georisques-v1'] = await call(`${GEORISQUES_V1}gaspar/risques?code_insee=${commune.code}`, {
    read: (json) => (json === null || typeof json === 'object' ? {} : undefined)
  });
  if (v2Token) {
    calls['georisques-v2'] = await call(`${GEORISQUES_V2}gaspar/risques?codesInsee=${commune.code}&pageSize=1`, {
      extraHeaders: { Authorization: v2Token },
      read: (json) => (json !== null && typeof json === 'object' ? {} : undefined)
    });
  }
  const verdict = classify({ municipality: calls.municipality, document: calls.document });
  return {
    code: commune.code,
    department: commune.department,
    band: commune.band,
    population: commune.population,
    stratum: commune.stratum,
    weight: commune.weight,
    reference: commune.reference,
    state: verdict.state,
    type: verdict.type,
    partition: verdict.partition,
    conflict: verdict.conflict === true,
    isRnu: verdict.isRnu,
    published,
    calls
  };
}

// The sample, run -------------------------------------------------------------------

/** Every sampled commune asked in turn, paced. `onRow` sees each as it lands. */
export async function measure({ drawn, call, v2Token, onRow, onStart }) {
  const rows = [];
  for (const commune of drawn) {
    onStart?.(commune, rows.length);
    const row = await askCommune(call, commune, { v2Token });
    rows.push(row);
    onRow?.(row, rows.length, drawn.length);
  }
  return rows;
}

// Recording (for the tests' fixture) ------------------------------------------------

/** A body cut to what this script reads: geometries and long arrays dropped, nothing a reader could mistake for content. */
export function trimmedBody(url, body) {
  if (body === null || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map((d) => (d !== null && typeof d === 'object' ? { id: d.id, status: d.status, name: d.name, originalName: d.originalName, publicationDate: d.publicationDate, type: d.type } : d));
  if (Array.isArray(body.features)) {
    return {
      type: 'FeatureCollection',
      features: body.features.slice(0, 1).map((f) => ({
        type: 'Feature',
        geometry: null,
        properties: Object.fromEntries(Object.entries(f.properties ?? {}).filter(([k]) => ['is_rnu', 'du_type', 'partition', 'name', 'gpu_status'].includes(k)))
      }))
    };
  }
  return { results: body.results, total_pages: body.total_pages, data: [] };
}

/** A `fetch` that passes through and notes the trimmed answer of every request made while a commune in the first `limit` is asked. */
export function createRecorder({ fetchImpl, limit }) {
  const answers = {};
  const communes = [];
  let recording = false;
  const fetch = async (url, init) => {
    const response = await fetchImpl(url, init);
    if (recording && url !== COMMUNES_URL) {
      const copy = response.clone();
      let body;
      try {
        body = await copy.json();
      } catch {
        body = undefined;
      }
      answers[url] = { status: response.status, body: trimmedBody(url, body) };
    }
    return response;
  };
  return {
    fetch,
    start(commune, index) {
      recording = index < limit;
      if (recording) communes.push({ code: commune.code, name: commune.name, population: commune.population, department: commune.department, centre: commune.centre, band: commune.band, stratum: commune.stratum, weight: commune.weight, reference: commune.reference });
    },
    result: () => ({ recordedAt: new Date().toISOString(), note: 'Trimmed answers (no geometry, no document content) of a live smoke run; see tools/measure-coverage.mjs.', communes, answers })
  };
}

// The files ------------------------------------------------------------------------

const csvCell = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** The raw rows, one line per commune: status, latency and classification only. */
export function toCsv(rows) {
  const columns = ['insee', 'department', 'band', 'population', 'reference', 'weight', 'state', 'is_rnu', 'doc_type', 'partition', 'published', 'conflict'];
  for (const name of ENDPOINTS) columns.push(`${name}_status`, `${name}_ms`);
  const lines = [columns.join(',')];
  for (const r of rows) {
    const cells = [r.code, r.department, r.band, r.population, r.reference, Number.isFinite(r.weight) ? r.weight.toFixed(4) : '', r.state, r.isRnu, r.type, r.partition, r.published, r.conflict];
    for (const name of ENDPOINTS) cells.push(r.calls[name]?.status, r.calls[name]?.ms);
    lines.push(cells.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

const pct = (x, digits = 1) => (x === undefined ? '—' : `${(x * 100).toFixed(digits)} %`);
const ms = (x) => (x === undefined ? '—' : `${Math.round(x)} ms`);

/** The report: the method, the numbers, and what the numbers cannot say. Pure. */
export function toReport({ label, date, seed, size, listSha256, listDate, eligible, sample, rows, v2, smoke }) {
  const est = estimates(rows);
  const stats = endpointStats(rows);
  const ages = documentAges(rows, date);
  const types = new Map();
  for (const r of rows.filter((x) => !x.reference && x.type !== undefined)) types.set(r.type, (types.get(r.type) ?? 0) + 1);
  const conflicts = rows.filter((r) => r.conflict);
  const unsampled = sample.strata.filter((s) => s.drawn === 0);
  const references = rows.filter((r) => r.reference);
  const lines = [];
  lines.push(`# Coverage — ${label} (${date})`);
  lines.push('');
  if (smoke) {
    lines.push(
      `> **A smoke run, not the national figure.** ${rows.filter((r) => !r.reference).length} communes drawn, to check the method end to end. The strata are mostly unrepresented and the intervals below are wide: do not quote any rate in this file.`
    );
    lines.push('');
  }
  lines.push('Sprint 002.10 DEC-6, made by `tools/measure-coverage.mjs`. Only statuses, latencies and a classification were kept (see the CSV beside this file); no document, règlement or response body.');
  lines.push('');
  lines.push('> Data: the services read here publish under the Licence Ouverte v2.0 (attribution required). The exact usage terms of the Géoportail de l’urbanisme and API Carto were **not verified** when this script was written: read them before a large pass and before any public claim.');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push(`- **Population:** \`geo.api.gouv.fr/communes\`, list of ${listDate}, SHA-256 \`${listSha256}\`; ${eligible} eligible communes (overseas collectivities \`98x\` excluded).`);
  lines.push(`- **Sample:** seed \`${seed}\`, ${size} requested, ${est.drawn} drawn in ${sample.strata.filter((s) => s.drawn > 0).length} of ${sample.strata.length} strata (département × population band), plus ${references.length} reference communes left out of the estimates. The same seed on the same list draws the same communes.`);
  lines.push('- **Per commune:** API Carto `municipality?insee=` (`is_rnu`), API Carto `document?geom=<centre>` (type, partition), the GPU `document?partition=&status=document.production` (publication date), Géorisques v1 `gaspar/risques`' + (v2 ? ', Géorisques v2 (token set; header form unverified)' : '') + '.');
  lines.push('- **State:** `rnu` when `is_rnu`; else `cc` for a carte communale document, `plu` for any other document; else `not-on-gpu`; `unknown` when the commune’s own questions failed. A document at the centre of an `is_rnu` commune is listed under Conflicts, not counted twice.');
  lines.push(`- **Estimates:** weighted by stratum size over draws; Wilson 95 % interval at the weights’ effective size (${est.effective.toFixed(1)}).`);
  lines.push(`- **Pace:** one request at a time, at most ${MAX_PER_SECOND} a second; \`User-Agent: ${USER_AGENT}\`.`);
  lines.push('');
  lines.push('## States');
  lines.push('');
  lines.push('| State | Drawn | Weighted share | 95 % interval |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const state of STATES) {
    const s = est.states[state];
    lines.push(`| \`${state}\` | ${s.count} | ${pct(s.share)} | ${pct(s.low)} – ${pct(s.high)} |`);
  }
  lines.push('');
  lines.push('The `not-on-gpu` row is the rate at which a user meets Rochefort’s state: a commune under neither the national rules nor a document the GPU holds.');
  lines.push('');
  if (types.size > 0) {
    lines.push('Document types (drawn communes, unweighted): ' + [...types].sort().map(([t, n]) => `${t} ${n}`).join(' · ') + '.');
    lines.push('');
  }
  lines.push('## Latency and errors');
  lines.push('');
  lines.push('| Endpoint | Calls | Errors | p50 | p95 | Max | Statuses |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const [name, s] of Object.entries(stats)) {
    lines.push(`| ${name} | ${s.calls} | ${s.errors} (${pct(s.errorRate)}) | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.max)} | ${Object.entries(s.statuses).map(([k, n]) => `${k}×${n}`).join(' ')} |`);
  }
  lines.push('');
  lines.push('## Documents in force');
  lines.push('');
  lines.push(
    ages.documents === 0
      ? 'No document with a publication date was met.'
      : `${ages.documents} distinct documents (partitions) with a publication date: median age ${ages.median} days, 95th percentile ${ages.p95} days; **${ages.last90} published in the last 90 days (${pct(ages.last90Rate)})** — what the daily watch’s load looks like. Counted over the documents met, not weighted: a PLUi met by several communes counts once.`
  );
  lines.push('');
  lines.push('## Conflicts and gaps');
  lines.push('');
  lines.push(conflicts.length === 0 ? 'No commune had both `is_rnu` and a document at its centre.' : `${conflicts.length} commune(s) had both \`is_rnu\` and a document at the centre: ${conflicts.map((c) => c.code).join(', ')}.`);
  lines.push('');
  lines.push(unsampled.length === 0 ? 'Every stratum has a draw.' : `${unsampled.length} of ${sample.strata.length} strata have no draw and are not represented in the estimates (${sample.strata.filter((s) => s.drawn === 0).reduce((n, s) => n + s.size, 0)} communes).`);
  lines.push('');
  lines.push('## Reference communes');
  lines.push('');
  lines.push('| INSEE | State | Type |');
  lines.push('| --- | --- | --- |');
  for (const r of references) lines.push(`| ${r.code} | \`${r.state}\` | ${r.type ?? '—'} |`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

// The command line -----------------------------------------------------------------

function parseArguments(argv) {
  const out = { size: 1000, seed: undefined, out: 'docs/measurements', label: 'national' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--size') out.size = Number(argv[++i]);
    else if (a === '--seed') out.seed = Number(argv[++i]);
    else if (a === '--list') out.list = argv[++i];
    else if (a === '--save-list') out.saveList = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--label') out.label = argv[++i];
    else if (a === '--smoke') out.smoke = true;
    else if (a === '--confirm-terms-read') out.confirmed = true;
    else if (a === '--record') out.record = argv[++i];
    else if (a === '--record-limit') out.recordLimit = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

export async function main(argv, { fetchImpl = globalThis.fetch, sleep = sleepFor, clock = () => Date.now(), write = (line) => process.stdout.write(`${line}\n`), env = process.env } = {}) {
  const args = parseArguments(argv);
  if (!Number.isInteger(args.size) || args.size < 1) throw new Error('--size must be a positive whole number');
  if (!Number.isInteger(args.seed)) throw new Error('--seed is required, a whole number (it is recorded in the report; the same seed re-draws the same sample)');
  if (args.size + REFERENCE_COMMUNES.length > SMALL_RUN && args.confirmed !== true) {
    throw new Error(
      `a sample of more than ${SMALL_RUN} communes needs --confirm-terms-read: the data is under the Licence Ouverte v2.0, but the Géoportail de l'urbanisme's usage terms have not been verified by this script's author. Read them first.`
    );
  }
  const today = new Date(clock()).toISOString().slice(0, 10);
  const pace = createPacer({ clock, sleep });
  const recorder = args.record === undefined ? undefined : createRecorder({ fetchImpl, limit: args.recordLimit ?? 10 });
  const call = createCaller({ fetchImpl: recorder?.fetch ?? fetchImpl, pace, clock });

  let raw;
  let listDate = today;
  if (args.list !== undefined) {
    const saved = JSON.parse(await readFile(args.list, 'utf8'));
    raw = saved.communes;
    listDate = saved.date;
  } else {
    await pace();
    const response = await fetchImpl(COMMUNES_URL, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`the commune list answered ${response.status}`);
    raw = await response.json();
  }
  if (args.saveList !== undefined) {
    await mkdir(dirname(resolve(args.saveList)), { recursive: true });
    await writeFile(args.saveList, JSON.stringify({ date: listDate, communes: raw }));
  }
  const communes = eligibleCommunes(raw);
  const listSha256 = createHash('sha256').update(communes.map((c) => c.code).join(',')).digest('hex');
  const sample = stratifiedSample(communes, { size: args.size, seed: args.seed });
  const v2Token = String(env.FR_URBAN_RULES_GEORISQUES_TOKEN ?? '').trim() || undefined;
  write(`${sample.drawn.length} communes (${sample.drawn.filter((c) => c.reference).length} reference) from ${communes.length} eligible; at most ${MAX_PER_SECOND} requests a second.`);
  const rows = await measure({
    drawn: sample.drawn,
    call,
    v2Token,
    onStart: recorder?.start,
    onRow: (row, n, of) => {
      if (n % 25 === 0 || n === of) write(`${n}/${of}`);
    }
  });
  const slug = `${args.label}-${today}`.replace(/[^A-Za-z0-9._-]/gu, '-');
  const report = toReport({
    label: args.label,
    date: today,
    seed: args.seed,
    size: args.size,
    listSha256,
    listDate,
    eligible: communes.length,
    sample,
    rows,
    v2: v2Token !== undefined,
    smoke: args.smoke === true
  });
  await mkdir(resolve(args.out), { recursive: true });
  await writeFile(join(resolve(args.out), `coverage-${slug}.md`), report);
  await writeFile(join(resolve(args.out), `coverage-${slug}.csv`), toCsv(rows));
  write(`wrote coverage-${slug}.md and .csv in ${args.out}`);
  if (recorder !== undefined) {
    await mkdir(dirname(resolve(args.record)), { recursive: true });
    await writeFile(args.record, `${JSON.stringify(recorder.result(), null, 1)}\n`);
    write(`recorded the first ${args.recordLimit ?? 10} communes' trimmed answers in ${args.record}`);
  }
  return { rows, report, sample, listSha256 };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
