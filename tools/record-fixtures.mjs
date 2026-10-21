/**
 * Records — or checks — the planning answers of one 002.4 acceptance plot
 * (Sprint 002.4, DEC-4; criterion 5).
 *
 *     node tools/record-fixtures.mjs <plot> [--check | --trim]
 *     node tools/record-fixtures.mjs <plot> --extraction [--check]
 *
 * It runs the package's **own** reader (`createReader` from
 * `fr-urban-rules/src/index.js`) in node, over the plot's captured Site,
 * context and section (`test-fixtures/fr-urban-rules/acceptance/<plot>/`,
 * replayed as the end-to-end tests replay them), with the **real** global
 * `fetch`, every answer recorded. So the URLs are the package's, and the
 * WGS84 rings are the platform's recorded `toGeographicRing` answers: node
 * has no projection of its own, and needs none.
 *
 * - Without `--check`: writes `answers.json` and `answers.meta.json`
 *   (`recorded-at`).
 * - With `--check`: writes nothing, and prints how a fresh recording differs
 *   from the stored one, request by request — status, feature counts,
 *   `idurba` / `datvalid` values — for the owner to decide whether the GPU
 *   changed (DEC-4, the Risks). Exits 0 either way.
 * - With `--snapshot` (Sprint 002.11 step 0): the plot is one of
 *   `test-fixtures/fr-urban-rules/snapshot/` (`manualchemin`), captured the
 *   same way, recorded and trimmed the same way; the planning answers only.
 *
 * - With `--trim` (the owner's Q7, 2026-10-20): **no network**. Reads the plot
 *   twice offline, as the tests do (with the walk's section and without it),
 *   through the replays, and keeps only what those reads were answered from:
 *   the `site`, `roads`, `map-features` and `document` pairs used (the first
 *   of a repeated input — the replay never serves another), the answers
 *   served; rounds the platform's `fromGeographicRing` results to 1 mm (the
 *   tests compare to 0.01, and nothing asks the Site again with them) and
 *   writes those pairs compact (`expandSiteCalls` in the helpers reads them
 *   back); writes every capture minified and removes `report.json` (the host's report, read
 *   by no test). The answers' texts and every recorded input stay as captured,
 *   so a later `--check`, whose live requests carry the GPU's own
 *   coordinates, still matches them. Run it after the capture command's
 *   downloads have been copied in and after a re-recording.
 *
 * - With `--extraction` (Sprint 002.5b DEC-11, Q40): runs the companion
 *   service (`services/fr-urban-rules-service`) **in-process**, against the
 *   live GPU and the ai-service at `ARCHISIMPLE_AI_SERVICE_URL` (default
 *   `http://127.0.0.1:4321`) with that deployment's configured provider, for
 *   the plot's zone (`apicarto-zone-urba.json`), and writes
 *   `<plot>/extraction/`: `calls.json` (each 096.7 request's metadata —
 *   chunk, attempt, base offset, text length; never a key, never the text)
 *   with each 096.7 response verbatim, and `result.json`. With `--check` it
 *   prints how a fresh extraction's rules differ from the stored ones and
 *   writes nothing. The service's own variables apply
 *   (`FR_URBAN_RULES_EXTRACT_CHUNK_CHARS` for a slow local model).
 *
 * - With `--extraction --acceptance` (Sprint 002.9 DEC-3): writes
 *   `acceptance/<plot>/extraction/` instead, each call's metadata adding DEC-2's
 *   `textSha256` and `promptVersion`, `calls.json` naming the sha256 of the
 *   expected values it was made against; refuses a plot the expected values
 *   (`acceptance/expected-002.9.json`, committed first — DEC-7) do not offer an
 *   extraction for, and prints DEC-4's judgement. **Made with the owner's
 *   production model** (002.9 DEC-7), never the development one.
 * - With `--check --extraction --no-model` (002.9 DEC-3, criterion 7): **no
 *   model call** — fetches the document through the service's own fetcher (the
 *   host allow-list exercised), finds the chapter, and prints how the PDF's
 *   sha256 and the chapter's pages differ from `<plot>/regulation/meta.json`,
 *   the stored result (the acceptance one with `--acceptance`) and the expected
 *   values. Writes nothing.
 *
 * Run by hand, with the network. **Never imported by a test** (Design
 * Contract: no live call in any test).
 */

import { readFile, rm, writeFile } from 'node:fs/promises';

import { __testing, createReader } from '../fr-urban-rules/src/index.js';
import {
  ACCEPTANCE_URL,
  EXPECTED_URL,
  callMetadata,
  documentDifferences,
  judgeExtraction,
  recorderOptions,
  sha256
} from './acceptance.mjs';
import {
  ACCEPTANCE,
  SNAPSHOT_FIXTURES,
  loadAcceptance,
  replayFetch,
  replayService
} from '../fr-urban-rules/tests/helpers.mjs';

let options;
try {
  options = recorderOptions(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const { plot, check, trim } = options;
// Sprint 002.11 step 0: a snapshot plot's captures live apart from 002.9's expected values.
const BASE = options.snapshot ? SNAPSHOT_FIXTURES : ACCEPTANCE;

if (options.extraction) {
  if (options.noModel) await checkDocument(plot, options.acceptance);
  else await recordExtraction(plot, check, options.acceptance);
  process.exit(0);
}

const captured = await loadAcceptance(plot, BASE);
if (captured === undefined) {
  console.error(`no captures for ${plot}: ${new URL(`${plot}/`, BASE).pathname} is absent`);
  process.exit(2);
}

if (trim) {
  await trimCaptures(plot, captured);
  process.exit(0);
}

const answers = [];
const site = replayService(captured.siteCalls, { name: 'site' });
const services = {
  roads: replayService(captured.context.roads, { name: 'roads' }),
  mapFeatures: replayService(captured.context['map-features'], { name: 'map-features' }),
  document: replayService(captured.context.document, { name: 'document' })
};
const logs = [];
const reader = createReader({
  fetch: __testing.recordingFetch((url, init) => globalThis.fetch(url, init), answers),
  site: () => site,
  log: (message) => logs.push(message),
  roads: () => services.roads,
  mapFeatures: () => services.mapFeatures,
  packageData: () => ({ read: () => captured.section ?? undefined }),
  document: () => services.document
});
const report = await reader.read(
  { site: captured.site, country: captured.site.country ?? 'FR', reason: 'site' },
  { signal: new AbortController().signal, progress: () => {} }
);
reader.dispose();

console.log(`${plot}: ${answers.length} requests, regime ${report.regime?.code}`);
for (const source of report.sources ?? []) {
  if (source.state !== 'ok') console.log(`  source ${source.id}: ${source.state}`);
}
// A different answer can make the reader ask the Site something the capture did not.
const unrecorded = [site, ...Object.values(services)].flatMap((s) => s?.unrecorded ?? []);
for (const call of unrecorded) {
  console.log(`  unrecorded service call: ${call.path} ${JSON.stringify(call.args)}`);
}
for (const message of logs) console.log(`  log: ${message}`);

const folder = new URL(`${plot}/`, BASE);
if (!check) {
  // Minified, as `--trim` leaves the captures (Q7); run `--trim` after a re-recording.
  await writeFile(new URL('answers.json', folder), `${JSON.stringify(answers)}\n`);
  await writeFile(
    new URL('answers.meta.json', folder),
    `${JSON.stringify({ 'recorded-at': new Date().toISOString(), requests: answers.length }, null, 2)}\n`
  );
  console.log(`wrote ${new URL('answers.json', folder).pathname}`);
  process.exit(0);
}

// ── --check: the fresh answers against the stored ones ──────────────────────────

const stored = JSON.parse(await readFile(new URL('answers.json', folder), 'utf8'));
let meta;
try {
  meta = JSON.parse(await readFile(new URL('answers.meta.json', folder), 'utf8'));
} catch {
  meta = undefined;
}
const keyOf = (a) => `${a.method ?? 'GET'} ${a.url}${a.body ? ` ${a.body}` : ''}`;
const byKey = (list) => new Map(list.map((a) => [keyOf(a), a]));
const before = byKey(stored);
const after = byKey(answers);

const parse = (text) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return undefined;
  }
};
const featureCount = (json) =>
  Array.isArray(json?.features) ? json.features.length : Array.isArray(json) ? json.length : undefined;
/** Every `idurba` and `datvalid` value anywhere in an answer. */
function versions(json, found = { idurba: new Set(), datvalid: new Set() }) {
  if (Array.isArray(json)) for (const item of json) versions(item, found);
  else if (json !== null && typeof json === 'object') {
    for (const [key, value] of Object.entries(json)) {
      if ((key === 'idurba' || key === 'datvalid') && typeof value !== 'object') {
        found[key].add(String(value));
      } else versions(value, found);
    }
  }
  return found;
}
const list = (set) => [...set].sort().join(', ') || '—';
const short = (key) => (key.length > 160 ? `${key.slice(0, 157)}…` : key);

console.log(`\nchecking against the recording of ${meta?.['recorded-at'] ?? 'an unknown date'}`);
let differences = 0;
for (const key of new Set([...before.keys(), ...after.keys()])) {
  const old = before.get(key);
  const fresh = after.get(key);
  const lines = [];
  if (old === undefined) lines.push('new request (not in the stored recording)');
  else if (fresh === undefined) lines.push('no longer requested');
  else {
    if ((old.error ?? old.status) !== (fresh.error ?? fresh.status)) {
      lines.push(`status ${old.error ?? old.status} → ${fresh.error ?? fresh.status}`);
    }
    // API Carto stamps every answer with the time it answered (`timeStamp`), and
    // a Géorisques page with its own: those differ on every recording and say
    // nothing about the data (found by the 002.4 walk's first --check).
    const unstamped = (text) =>
      String(text ?? '').replace(/"timeStamp":"[^"]*"/g, '"timeStamp":""');
    if (unstamped(old.text) !== unstamped(fresh.text)) {
      const a = parse(old.text);
      const b = parse(fresh.text);
      const [ca, cb] = [featureCount(a), featureCount(b)];
      if (ca !== cb) lines.push(`features ${ca ?? '?'} → ${cb ?? '?'}`);
      const [va, vb] = [versions(a), versions(b)];
      for (const field of ['idurba', 'datvalid']) {
        if (list(va[field]) !== list(vb[field])) {
          lines.push(`${field} ${list(va[field])} → ${list(vb[field])}`);
        }
      }
      if (lines.length === 0) {
        lines.push(`content changed (${old.text?.length ?? 0} → ${fresh.text?.length ?? 0} chars)`);
      }
    }
  }
  if (lines.length > 0) {
    differences += 1;
    console.log(`\n${short(key)}`);
    for (const line of lines) console.log(`  ${line}`);
  }
}
console.log(
  differences === 0
    ? '\nno difference'
    : `\n${differences} request(s) differ — for the owner to explain (002.4 criterion 5)`
);
process.exit(0);

// ── --trim: only what the tests read (002.4, the owner's Q7) ────────────────────

/** Rounds every `easting` / `northing` in a `fromGeographicRing` result to 1 mm. */
function toMillimetre(value) {
  if (Array.isArray(value)) return value.map(toMillimetre);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      (key === 'easting' || key === 'northing') && typeof item === 'number'
        ? Math.round(item * 1000) / 1000
        : toMillimetre(item)
    ])
  );
}

async function trimCaptures(name, captured) {
  const folder = new URL(`${name}/`, BASE);
  const used = { site: new Set(), roads: new Set(), 'map-features': new Set(), document: new Set() };
  const served = new Set();
  // As acceptance.test.mjs reads: with the walk's section, and without it (« to confirm »).
  for (const section of [captured.section, null]) {
    const replays = {
      site: replayService(captured.siteCalls, { name: 'site' }),
      roads: replayService(captured.context.roads, { name: 'roads' }),
      'map-features': replayService(captured.context['map-features'], { name: 'map-features' }),
      document: replayService(captured.context.document, { name: 'document' })
    };
    const fetch = replayFetch(captured.answers);
    const reader = createReader({
      fetch,
      now: () => new Date(Date.UTC(2026, 9, 20, 12, 0)),
      site: () => replays.site,
      roads: () => replays.roads,
      mapFeatures: () => replays['map-features'],
      document: () => replays.document,
      packageData: () => ({ read: () => section ?? undefined }),
      log: () => {}
    });
    const report = await reader.read(
      { site: captured.site, country: captured.site.country ?? 'FR', reason: 'site' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    // Sprint 002.8: the parked variations the capture checked keep their own measures.
    for (const { variationId, buildings } of captured.variations ?? []) {
      await reader.checkVariation(
        { site: captured.site, country: 'FR', variationId, report, buildings },
        { signal: new AbortController().signal }
      );
    }
    reader.dispose();
    const unrecorded = [
      ...fetch.unrecorded,
      ...Object.values(replays).flatMap((r) => (r?.unrecorded ?? []).map((c) => c.path))
    ];
    if (unrecorded.length > 0) {
      console.error(`${name}: the captures do not answer this read (${unrecorded.join(', ')}); nothing trimmed`);
      process.exit(1);
    }
    for (const [key, replay] of Object.entries(replays)) {
      for (const pair of replay?.used ?? []) used[key].add(pair);
    }
    for (const answer of fetch.used) served.add(answer);
  }
  const keep = (pairs, key) => (pairs === null || pairs === undefined ? pairs : pairs.filter((p) => used[key].has(p)));
  // `fromGeographicRing` written compact (`expandSiteCalls` reads it back): its
  // rings are most of the bytes, and the keys repeated on every point most of those.
  const compact = (pair) => {
    const ring = pair.args?.[0];
    const plain = (point, keys) =>
      point !== null &&
      typeof point === 'object' &&
      Object.keys(point).length === 2 &&
      keys.every((k) => typeof point[k] === 'number');
    if (
      pair.path !== 'fromGeographicRing' ||
      pair.args.length !== 1 ||
      !Array.isArray(ring) ||
      !ring.every((q) => plain(q, ['latitude', 'longitude'])) ||
      pair.error !== undefined ||
      pair.async !== undefined ||
      !(pair.result === undefined || (Array.isArray(pair.result) && pair.result.every((q) => plain(q, ['easting', 'northing']))))
    ) {
      return pair;
    }
    return {
      path: pair.path,
      ring: ring.map((q) => [q.latitude, q.longitude]),
      ...(pair.result === undefined
        ? {}
        : { projected: toMillimetre(pair.result).map((q) => [q.easting, q.northing]) })
    };
  };
  const siteCalls = keep(captured.siteCalls, 'site').map((pair) =>
    pair.path === 'fromGeographicRing' ? compact({ ...pair, result: toMillimetre(pair.result) }) : pair
  );
  const context = Object.fromEntries(
    Object.entries(captured.context).map(([key, pairs]) => [key, keep(pairs, key)])
  );
  const answers = captured.answers.filter((a) => served.has(a));
  const files = {
    'site.json': captured.site,
    'site-calls.json': siteCalls,
    'context.json': context,
    'section.json': captured.section,
    'answers.json': answers
  };
  let bytes = 0;
  for (const [file, value] of Object.entries(files)) {
    const text = `${JSON.stringify(value)}\n`;
    bytes += Buffer.byteLength(text);
    await writeFile(new URL(file, folder), text);
  }
  await rm(new URL('report.json', folder), { force: true });
  console.log(
    `${name}: site calls ${captured.siteCalls.length} → ${siteCalls.length}, answers ${captured.answers.length} → ${answers.length}, ` +
      `context ${Object.entries(captured.context).map(([k, v]) => `${k} ${v?.length ?? 0} → ${context[k]?.length ?? 0}`).join(', ')}; ` +
      `${(bytes / 1e6).toFixed(2)} MB written, report.json removed`
  );
}

// ── --extraction: one live extraction, recorded (002.5b DEC-11) ───────────────────

async function recordExtraction(name, checkOnly, acceptance) {
  const { mkdir, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createService } = await import('../services/fr-urban-rules-service/src/service.mjs');
  const fixtures = new URL(`../test-fixtures/fr-urban-rules/${name}/`, import.meta.url);
  // 002.9 DEC-7: the expected values come first; a plot they offer no extraction for is refused.
  const expectedText = acceptance ? await readFile(EXPECTED_URL, 'utf8') : undefined;
  const expected = expectedText === undefined ? undefined : JSON.parse(expectedText).plots?.[name];
  if (acceptance && expected?.extraction?.offered !== true) {
    console.error(`${name}: ${EXPECTED_URL.pathname} offers no extraction for this plot; nothing recorded`);
    process.exit(2);
  }
  const folder = acceptance ? new URL(`${name}/extraction/`, ACCEPTANCE_URL) : new URL('extraction/', fixtures);
  const zoneUrba = JSON.parse(await readFile(new URL('apicarto-zone-urba.json', fixtures), 'utf8'));
  const zone = zoneUrba.features?.[0]?.properties;
  if (zone === undefined) throw new Error(`${name}: no zone in apicarto-zone-urba.json`);
  const body = { partition: zone.partition, idurba: zone.idurba, nomfic: zone.nomfic, zone: zone.libelle };
  const aiServiceUrl = process.env.ARCHISIMPLE_AI_SERVICE_URL ?? 'http://127.0.0.1:4321';

  const calls = [];
  const service = await createService({
    env: process.env,
    log: (record) => process.stderr.write(`${JSON.stringify(record)}\n`),
    dataDir: await mkdtemp(join(tmpdir(), 'fr-urban-rules-record-')),
    aiServiceUrl,
    onCall: (record) =>
      calls.push({
        request: callMetadata(record, { acceptance, aiServiceUrl }),
        response: record.answer,
        error: record.error
      })
  });
  const started = Date.now();
  const posted = await service.handle({
    method: 'POST',
    segments: ['v1', 'extractions'],
    query: new URLSearchParams(),
    body: JSON.stringify(body),
    limitKey: 'recorder',
    userHash: 'recorder',
    userSource: 'header'
  });
  if (posted.status !== 202) throw new Error(`POST answered ${posted.status} ${JSON.stringify(posted.body)}`);
  await service.idle();
  const job = await service.handle({
    method: 'GET',
    segments: ['v1', 'extractions', posted.body.jobId],
    query: new URLSearchParams(),
    limitKey: 'recorder',
    userHash: 'recorder',
    userSource: 'header'
  });
  if (job.body.state !== 'done') throw new Error(`the job ended ${job.body.state}: ${JSON.stringify(job.body.error)}`);
  const { result } = job.body;
  const seconds = Math.round((Date.now() - started) / 1000);
  const line = (r) => `${r.kind} ${r.sector ?? '-'} ${r.statement} ${JSON.stringify(r.limit)} p.${r.page}`;

  if (checkOnly) {
    const stored = JSON.parse(await readFile(new URL('result.json', folder), 'utf8'));
    const before = new Set(stored.rules.map(line));
    const after = new Set(result.rules.map(line));
    console.log(`${name}: ${result.rules.length} rules now, ${stored.rules.length} recorded (${seconds} s)`);
    for (const l of after) if (!before.has(l)) console.log(`  + ${l}`);
    for (const l of before) if (!after.has(l)) console.log(`  - ${l}`);
    return;
  }
  const out = folder;
  await mkdir(out, { recursive: true });
  const recording = {
    recordedAt: new Date().toISOString(),
    body,
    seconds,
    ...(acceptance ? { acceptance: true, expectedSha256: sha256(expectedText) } : {}),
    calls
  };
  await writeFile(new URL('calls.json', out), `${JSON.stringify(recording, null, 1)}\n`);
  await writeFile(new URL('result.json', out), `${JSON.stringify(result, null, 1)}\n`);
  console.log(`${name}: ${result.rules.length} rules, ${result.chunks.of} chunks (${result.chunks.failed} failed), dropped ${JSON.stringify(result.dropped)}, ${seconds} s`);
  for (const r of result.rules) console.log(`  ${line(r)}`);
  if (acceptance) printJudgement(name, expected, result);
}

/** DEC-4's verdict, printed after an acceptance recording (the tests assert the same). */
function printJudgement(name, expected, result) {
  const verdict = judgeExtraction(expected, result);
  console.log(`\n${name}: DEC-4 ${verdict.passed ? 'holds' : 'does not hold'} (${Object.keys(verdict.matched).length} required rows matched)`);
  for (const failure of verdict.failures) console.log(`  ✗ ${failure.id}: ${failure.why}`);
  for (const extra of verdict.extras) console.log(`  ${extra.accepted ? '·' : '+'} ${extra.rule}`);
}

// ── --check --extraction --no-model: the document, without a model (002.9 criterion 7) ──

async function checkDocument(name, acceptance) {
  const { mkdtemp, rm: remove } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createService } = await import('../services/fr-urban-rules-service/src/service.mjs');
  const { cacheKey } = await import('../services/fr-urban-rules-service/src/cache.mjs');
  const fixtures = new URL(`../test-fixtures/fr-urban-rules/${name}/`, import.meta.url);
  const readJson = async (url) => {
    try {
      return JSON.parse(await readFile(url, 'utf8'));
    } catch {
      return undefined;
    }
  };
  const zone = (await readJson(new URL('apicarto-zone-urba.json', fixtures)))?.features?.[0]?.properties;
  if (zone === undefined) {
    console.error(`${name}: no zone in apicarto-zone-urba.json — no written regulation to check`);
    process.exit(2);
  }
  const meta = await readJson(new URL('regulation/meta.json', fixtures));
  const stored = await readJson(
    acceptance ? new URL(`${name}/extraction/result.json`, ACCEPTANCE_URL) : new URL('extraction/result.json', fixtures)
  );
  const expected = (await readJson(EXPECTED_URL))?.plots?.[name];
  const dataDir = await mkdtemp(join(tmpdir(), 'fr-urban-rules-check-'));
  // The chapter route never calls a model; an `ai` that throws makes sure of it.
  const refuse = () => {
    throw new Error('--no-model: no model call');
  };
  const service = await createService({
    env: process.env,
    log: (record) => process.stderr.write(`${JSON.stringify(record)}\n`),
    dataDir,
    ai: { extract: refuse, health: refuse }
  });
  const query = new URLSearchParams({
    partition: zone.partition,
    idurba: zone.idurba,
    nomfic: zone.nomfic,
    zone: zone.libelle
  });
  const answer = await service.handle({
    method: 'GET',
    segments: ['v1', 'chapter'],
    query,
    limitKey: 'recorder',
    userHash: 'recorder',
    userSource: 'header'
  });
  if (answer.status !== 200) {
    console.error(`${name}: the chapter route answered ${answer.status} ${JSON.stringify(answer.body)}`);
    await remove(dataDir, { recursive: true, force: true });
    process.exit(1);
  }
  const cached = JSON.parse(
    await readFile(
      join(dataDir, service.packageId, 'documents', cacheKey(zone.idurba, zone.nomfic), 'meta.json'),
      'utf8'
    )
  );
  await remove(dataDir, { recursive: true, force: true });
  const fresh = {
    sha256: cached.sha256,
    pages: answer.body.documentPages,
    idurba: cached.idurba,
    nomfic: cached.nomfic,
    chapterPages: answer.body.pages
  };
  console.log(
    `${name}: ${fresh.nomfic} (${fresh.idurba}), ${fresh.pages} pages, sha256 ${fresh.sha256}; ` +
      `chapter « ${answer.body.title} » pages ${fresh.chapterPages.join('–')} (${answer.body.found}, ${answer.body.match}); no model called`
  );
  const differences = documentDifferences({ fresh, meta, stored, expected });
  for (const d of differences) console.log(`  ${d.what}: ${JSON.stringify(d.recorded)} → ${JSON.stringify(d.now)}`);
  console.log(
    differences.length === 0
      ? '  no difference: the PDF and the chapter are the recorded ones'
      : `  ${differences.length} difference(s) — a new GPU version is 002.10's territory; explain each in the outcome`
  );
}

