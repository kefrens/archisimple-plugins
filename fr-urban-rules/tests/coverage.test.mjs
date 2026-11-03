/**
 * The coverage script (Sprint 002.10 DEC-6, criterion 10): its sampling,
 * classification and arithmetic, and the whole of `askCommune` / `measure` on
 * a **recorded** ten-commune sample — the five reference communes and five
 * drawn ones, answered by the public services on 2026-11-03 (trimmed: no
 * geometry, no document content). The real run is by hand; no test goes to the
 * network.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COMMUNES_URL,
  MAX_PER_SECOND,
  REFERENCE_COMMUNES,
  SMALL_RUN,
  STATES,
  USER_AGENT,
  allocate,
  askCommune,
  bandOf,
  classify,
  createCaller,
  createPacer,
  documentAges,
  eligibleCommunes,
  endpointStats,
  estimates,
  isoDay,
  main,
  measure,
  percentile,
  seededRandom,
  stratifiedSample,
  toCsv,
  toReport,
  wilson
} from '../../tools/measure-coverage.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const recorded = JSON.parse(
  readFileSync(new URL('../../test-fixtures/fr-urban-rules/coverage/sample-10.json', import.meta.url), 'utf8')
);

/** A `fetch` serving the recording by exact URL; every URL asked is kept. */
function recordedFetch() {
  const asked = [];
  const fetch = async (url, init) => {
    asked.push({ url, headers: init?.headers });
    const answer = recorded.answers[url];
    const status = answer?.status ?? 404;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (answer === undefined) throw new Error('not recorded');
        return answer.body;
      }
    };
  };
  return { fetch, asked };
}

/** A clock that only moves when the pacer sleeps (and a little per call, for a latency). */
function fakeTime() {
  let at = 1_000_000;
  return { clock: () => at, sleep: async (ms) => (at += ms), tick: (ms) => (at += ms) };
}

// ── The recorded sample ─────────────────────────────────────────────────────────────

const EXPECTED = {
  69123: 'plu', // Lyon — a PLUi
  84050: 'plu', // Gordes — a PLU
  56196: 'not-on-gpu', // Rochefort-en-Terre — in neither the national rules nor the GPU
  55083: 'rnu', // Brouennes
  55364: 'cc', // Mouzay — a carte communale
  '02155': 'rnu',
  '08417': 'not-on-gpu',
  10112: 'rnu',
  11302: 'plu', // a PLUi
  21232: 'rnu'
};

test('the recorded sample: ten communes, each classified as the public services answered', async () => {
  const { fetch, asked } = recordedFetch();
  const time = fakeTime();
  const call = createCaller({ fetchImpl: fetch, pace: createPacer({ ...time }), clock: time.clock });
  const rows = await measure({ drawn: recorded.communes, call });
  assert.equal(rows.length, 10);
  for (const row of rows) assert.equal(row.state, EXPECTED[row.code], row.code);
  // The five reference communes are the five this repository's project fixtures know.
  assert.deepEqual(
    rows.filter((r) => r.reference).map((r) => r.code),
    [...REFERENCE_COMMUNES]
  );
  // The GPU is asked only for a commune with a document, by partition and with the production filter.
  const gpu = asked.filter((a) => a.url.startsWith('https://www.geoportail-urbanisme.gouv.fr/'));
  assert.equal(gpu.length, rows.filter((r) => r.partition !== undefined).length);
  assert.equal(gpu.length, 4, 'Lyon, Gordes, Mouzay and the PLUi of 11302');
  for (const a of gpu) assert.match(a.url, /\?partition=DU_[0-9A-Z]+&status=document\.production$/u);
  // Dates read from the GPU's own spelling.
  assert.equal(rows.find((r) => r.code === '69123').published, '2026-04-23');
  assert.equal(rows.find((r) => r.code === '84050').published, '2025-03-27');
  // The commune that is not on the GPU has no document and no GPU question.
  const rochefort = rows.find((r) => r.code === '56196');
  assert.equal(rochefort.calls.gpu, undefined);
  assert.equal(rochefort.partition, undefined);
});

test('every request names the script and no one else — no contact address, no key', async () => {
  const { fetch, asked } = recordedFetch();
  const time = fakeTime();
  const call = createCaller({ fetchImpl: fetch, pace: createPacer({ ...time }), clock: time.clock });
  await measure({ drawn: recorded.communes.slice(0, 2), call });
  assert.ok(asked.length > 0);
  for (const a of asked) {
    assert.equal(a.headers['User-Agent'], USER_AGENT);
    assert.match(USER_AGENT, /^ArchiSimple-fr-urban-rules-coverage\/\d+\.\d+\.\d+$/u);
    assert.deepEqual(Object.keys(a.headers).sort(), ['Accept', 'User-Agent']);
  }
});

test('never more than two requests a second, overall', async () => {
  const { fetch } = recordedFetch();
  const time = fakeTime();
  const stamps = [];
  const counting = async (url, init) => {
    stamps.push(time.clock());
    return fetch(url, init);
  };
  const call = createCaller({ fetchImpl: counting, pace: createPacer({ ...time }), clock: time.clock });
  await measure({ drawn: recorded.communes, call });
  assert.ok(stamps.length >= 30);
  assert.equal(MAX_PER_SECOND, 2);
  for (let i = 1; i < stamps.length; i += 1) assert.ok(stamps[i] - stamps[i - 1] >= 500, `gap ${i}`);
  // And in any second window, at most two.
  for (let i = 2; i < stamps.length; i += 1) assert.ok(stamps[i] - stamps[i - 2] >= 1000, `window ${i}`);
});

test('what is kept is a status, a latency and a classification — never a body', async () => {
  const { fetch } = recordedFetch();
  const time = fakeTime();
  const call = createCaller({ fetchImpl: fetch, pace: createPacer({ ...time }), clock: time.clock });
  const rows = await measure({ drawn: recorded.communes, call });
  const csv = toCsv(rows);
  const header = csv.split('\n')[0].split(',');
  assert.deepEqual(header.slice(0, 12), [
    'insee',
    'department',
    'band',
    'population',
    'reference',
    'weight',
    'state',
    'is_rnu',
    'doc_type',
    'partition',
    'published',
    'conflict'
  ]);
  assert.equal(csv.trim().split('\n').length, 11);
  // No commune name, no GPU document id, no text of any answer reaches the file.
  for (const secret of ['LYON', 'GORDES', '4f3ddc27a9611b4bc94fa161443b8e86', 'Inondation', 'FeatureCollection', 'originalName']) {
    assert.ok(!csv.includes(secret), secret);
  }
  for (const r of rows) {
    for (const c of Object.values(r.calls)) {
      assert.deepEqual(Object.keys(c).filter((k) => !['status', 'ms', 'ok', 'isRnu', 'found', 'type', 'partition', 'count', 'published'].includes(k)), []);
    }
  }
});

test('a failed call is data: a 500 on the commune’s own question makes it unknown, a slow or missing Géorisques does not', async () => {
  const { fetch } = recordedFetch();
  const time = fakeTime();
  const failing = (url, init) =>
    url.includes('/municipality?insee=02155') ? { ok: false, status: 500, json: async () => ({}) } : fetch(url, init);
  const call = createCaller({ fetchImpl: failing, pace: createPacer({ ...time }), clock: time.clock });
  const rows = await measure({ drawn: recorded.communes.filter((c) => c.code === '02155'), call });
  assert.equal(rows[0].state, 'unknown');
  assert.equal(rows[0].calls.municipality.status, 500);
  const throwing = async (url, init) => {
    if (url.includes('georisques.gouv.fr')) throw new Error('network down');
    return fetch(url, init);
  };
  const call2 = createCaller({ fetchImpl: throwing, pace: createPacer({ ...time }), clock: time.clock });
  const again = await measure({ drawn: recorded.communes.filter((c) => c.code === '02155'), call: call2 });
  assert.equal(again[0].state, 'rnu');
  assert.equal(again[0].calls['georisques-v1'].status, 0);
  const stats = endpointStats(again);
  assert.equal(stats['georisques-v1'].errors, 1);
  assert.equal(stats['georisques-v1'].errorRate, 1);
});

test('Géorisques v2 is asked only with a token, with no body kept and the token never in a report or the CSV', async () => {
  const token = 'fake-coverage-token-0123456789abcdef';
  const { fetch, asked } = recordedFetch();
  const time = fakeTime();
  const v2 = (url, init) =>
    url.startsWith('https://www.georisques.gouv.fr/api/v2/')
      ? { ok: true, status: 200, json: async () => ({ content: [] }) }
      : fetch(url, init);
  const call = createCaller({ fetchImpl: v2, pace: createPacer({ ...time }), clock: time.clock });
  const none = await measure({ drawn: recorded.communes.slice(0, 1), call });
  assert.equal(none[0].calls['georisques-v2'], undefined);
  const withToken = await measure({ drawn: recorded.communes.slice(0, 1), call, v2Token: token });
  assert.equal(withToken[0].calls['georisques-v2'].status, 200);
  const sample = { strata: [{ key: '69|gte10000', size: 1, drawn: 1 }] };
  const output =
    toCsv(withToken) +
    toReport({ label: 't', date: '2026-11-03', seed: 1, size: 1, listSha256: 'x', listDate: '2026-11-03', eligible: 1, sample, rows: withToken, v2: true });
  assert.ok(!output.includes(token));
  void asked;
});

// ── Sampling ──────────────────────────────────────────────────────────────────────

const population = (n = 400) =>
  Array.from({ length: n }, (_, i) => ({
    code: String(10000 + i * 7).padStart(5, '0'),
    nom: `Commune ${i}`,
    population: [120, 800, 4000, 25000][i % 4] + i,
    codeDepartement: String(10 + (i % 9)),
    centre: { type: 'Point', coordinates: [2 + (i % 5) / 10, 46 + (i % 7) / 10] }
  }));

test('the population: overseas collectivities (98x) and malformed entries are left out; a Corsican code stays', () => {
  const list = [
    ...population(8),
    { code: '98714', nom: 'Bora-Bora', population: 10000, codeDepartement: '987', centre: { type: 'Point', coordinates: [1, 1] } },
    { code: '2A004', nom: 'Ajaccio', population: 70000, codeDepartement: '2A', centre: { type: 'Point', coordinates: [8.7, 41.9] } },
    { code: 'abc', nom: 'x', population: 1, centre: { type: 'Point', coordinates: [1, 1] } },
    { code: '12345', nom: 'no centre', population: 1 },
    { code: '12346', nom: 'no population', centre: { type: 'Point', coordinates: [1, 1] } }
  ];
  const kept = eligibleCommunes(list).map((c) => c.code);
  assert.ok(kept.includes('2A004'));
  assert.ok(!kept.includes('98714'));
  assert.ok(!kept.includes('abc') && !kept.includes('12345') && !kept.includes('12346'));
  assert.equal(kept.length, 9);
  assert.deepEqual(kept, [...kept].sort());
});

test('the bands: < 500, 500–2 000, 2 000–10 000, ≥ 10 000 — edges belong to the upper band', () => {
  assert.deepEqual([0, 499, 500, 1999, 2000, 9999, 10000, 600000].map(bandOf), ['lt500', 'lt500', '500-2000', '500-2000', '2000-10000', '2000-10000', 'gte10000', 'gte10000']);
});

test('criterion 10: the same seed on the same list draws the same communes; another seed another', () => {
  const communes = eligibleCommunes(population(400));
  const a = stratifiedSample(communes, { size: 40, seed: 20261103, reference: [] });
  const b = stratifiedSample(communes, { size: 40, seed: 20261103, reference: [] });
  const c = stratifiedSample(communes, { size: 40, seed: 7, reference: [] });
  assert.deepEqual(a.drawn.map((x) => x.code), b.drawn.map((x) => x.code));
  assert.notDeepEqual(a.drawn.map((x) => x.code), c.drawn.map((x) => x.code));
  assert.equal(a.drawn.length, 40);
  assert.equal(new Set(a.drawn.map((x) => x.code)).size, 40);
  const r1 = seededRandom(5);
  const r2 = seededRandom(5);
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
});

test('the allocation: one per stratum when the size allows, the rest proportionally and capped, never more than asked or than exist', () => {
  const sizes = new Map([['a', 100], ['b', 10], ['c', 1], ['d', 50]]);
  const out = allocate(sizes, 20);
  assert.equal([...out.values()].reduce((n, v) => n + v, 0), 20);
  for (const [k, v] of out) assert.ok(v >= 1 && v <= sizes.get(k), k);
  assert.ok(out.get('a') > out.get('d') && out.get('d') > out.get('b'));
  assert.equal(out.get('c'), 1);
  // Fewer draws than strata: the largest strata.
  const few = allocate(sizes, 2);
  assert.deepEqual([...few].filter(([, v]) => v > 0).map(([k]) => k).sort(), ['a', 'd']);
  // More than exist: all of them.
  assert.equal([...allocate(sizes, 500).values()].reduce((n, v) => n + v, 0), 161);
});

test('the estimates: weights are stratum size over draws, the references are not in them, and the strata sum back to the population', () => {
  const communes = eligibleCommunes(population(400));
  const sample = stratifiedSample(communes, { size: 60, seed: 3, reference: [communes[0].code, communes[5].code] });
  const refs = sample.drawn.filter((c) => c.reference);
  assert.equal(refs.length, 2);
  assert.deepEqual(sample.drawn.slice(0, 2).map((c) => c.code), [communes[0].code, communes[5].code], 'references first');
  const estimated = sample.drawn.filter((c) => !c.reference);
  const represented = estimated.reduce((n, c) => n + c.weight, 0);
  const inDrawnStrata = sample.strata.filter((s) => s.drawn > 0).reduce((n, s) => n + s.size, 0);
  assert.ok(Math.abs(represented - inDrawnStrata) < 1e-6);
  // A synthetic outcome: every commune is `rnu` but the references, which say `plu`: the estimate ignores them.
  const rows = sample.drawn.map((c) => ({ ...c, state: c.reference ? 'plu' : 'rnu', calls: {} }));
  const est = estimates(rows);
  assert.equal(est.states.rnu.share, 1);
  assert.equal(est.states.plu.share, 0);
  assert.equal(est.states.plu.count, 0);
  assert.equal(est.drawn, estimated.length);
});

test('Wilson’s interval, the percentile and the effective size behave', () => {
  const w = wilson(0.5, 100);
  assert.ok(Math.abs(w.low - 0.4038) < 0.001 && Math.abs(w.high - 0.5962) < 0.001);
  assert.deepEqual(wilson(0, 0), { low: undefined, high: undefined });
  assert.ok(wilson(0, 30).low === 0 && wilson(0, 30).high > 0.05);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([1, 2, 3, 4], 95), 4);
  assert.equal(percentile([], 50), undefined);
  // Unequal weights shrink the effective size.
  const rows = [
    { state: 'rnu', weight: 10, calls: {} },
    { state: 'plu', weight: 1, calls: {} },
    { state: 'plu', weight: 1, calls: {} }
  ];
  const est = estimates(rows);
  assert.ok(est.effective < 3 && est.effective > 1);
  assert.equal(Math.round(est.states.rnu.share * 1000) / 1000, 0.833);
});

// ── Classification ────────────────────────────────────────────────────────────────

test('the states: RNU wins and a document at its centre is a conflict; no document is “not on the GPU” only when not RNU; a failure is unknown', () => {
  const ok = (extra) => ({ ok: true, status: 200, ms: 1, ...extra });
  assert.equal(classify({ municipality: ok({ isRnu: true }), document: ok({ found: false }) }).state, 'rnu');
  assert.deepEqual(classify({ municipality: ok({ isRnu: true }), document: ok({ found: true, type: 'PLU', partition: 'DU_1' }) }), {
    state: 'rnu',
    isRnu: true,
    conflict: true,
    type: 'PLU',
    partition: 'DU_1'
  });
  assert.equal(classify({ municipality: ok({ isRnu: false }), document: ok({ found: false }) }).state, 'not-on-gpu');
  assert.equal(classify({ municipality: ok({ isRnu: false }), document: ok({ found: true, type: 'CC', partition: 'DU_1' }) }).state, 'cc');
  assert.equal(classify({ municipality: ok({ isRnu: false }), document: ok({ found: true, type: 'PSMV', partition: 'DU_1' }) }).state, 'plu');
  assert.equal(classify({ municipality: ok({ isRnu: false }), document: ok({ found: true, type: 'PLUi' }) }).state, 'plu');
  assert.equal(classify({ municipality: { ok: false, status: 500 }, document: ok({ found: false }) }).state, 'unknown');
  assert.equal(classify({ municipality: ok({ isRnu: false }), document: undefined }).state, 'unknown');
  assert.equal(classify({ municipality: ok({}), document: ok({ found: false }) }).state, 'unknown');
  assert.deepEqual([...STATES], ['plu', 'cc', 'rnu', 'not-on-gpu', 'unknown']);
});

test('the GPU’s date spelling, and the age of the documents in force (distinct partitions, last 90 days)', () => {
  assert.equal(isoDay('23/04/2026 13:44:58'), '2026-04-23');
  assert.equal(isoDay('2026-04-23T09:35:17Z'), '2026-04-23');
  assert.equal(isoDay('31/02/2026'), undefined);
  assert.equal(isoDay(undefined), undefined);
  const ages = documentAges(
    [
      { partition: 'DU_1', published: '2026-10-01' },
      { partition: 'DU_1', published: '2026-10-01' }, // a PLUi met by two communes counts once
      { partition: 'DU_2', published: '2025-01-01' },
      { partition: 'DU_3', published: undefined },
      { partition: undefined, published: '2026-10-01' }
    ],
    '2026-11-03'
  );
  assert.equal(ages.documents, 2);
  assert.equal(ages.last90, 1);
  assert.equal(ages.last90Rate, 0.5);
});

// ── The report ────────────────────────────────────────────────────────────────────

test('the report says its method, its seed, its list and its caveats; a smoke run says it is not the national figure', async () => {
  const { fetch } = recordedFetch();
  const time = fakeTime();
  const call = createCaller({ fetchImpl: fetch, pace: createPacer({ ...time }), clock: time.clock });
  const rows = await measure({ drawn: recorded.communes, call });
  const sample = { strata: [{ key: '02|lt500', size: 100, drawn: 1 }, { key: '08|lt500', size: 100, drawn: 0 }] };
  const base = { label: 'test', date: '2026-11-03', seed: 20261103, size: 5, listSha256: 'abc123', listDate: '2026-11-03', eligible: 34879, sample, rows, v2: false };
  const report = toReport({ ...base, smoke: true });
  for (const text of ['seed `20261103`', 'SHA-256 `abc123`', '34879 eligible', 'Licence Ouverte v2.0', '**not verified**', 'A smoke run, not the national figure', 'not-on-gpu', 'Wilson', USER_AGENT, '1 of 2 strata have no draw']) {
    assert.ok(report.includes(text), text);
  }
  assert.ok(!toReport({ ...base, smoke: false }).includes('smoke run'));
  assert.match(report, /\| 55364 \| `cc` \| CC \|/u);
  assert.match(report, /\| 56196 \| `not-on-gpu` \| — \|/u);
  // No contact address, no personal name.
  assert.ok(!/@[a-z0-9-]+\./iu.test(report));
});

// ── The command line ───────────────────────────────────────────────────────────────

test('a run over 100 communes is refused without --confirm-terms-read, before any request', async () => {
  let asked = 0;
  const fetchImpl = async () => {
    asked += 1;
    throw new Error('nothing should be asked');
  };
  await assert.rejects(() => main(['--size', '1000', '--seed', '1'], { fetchImpl, write: () => {} }), /confirm-terms-read/u);
  await assert.rejects(() => main(['--size', '96', '--seed', '1'], { fetchImpl, write: () => {} }), /confirm-terms-read/u);
  await assert.rejects(() => main(['--size', '10'], { fetchImpl, write: () => {} }), /--seed is required/u);
  await assert.rejects(() => main(['--size', '0', '--seed', '1'], { fetchImpl, write: () => {} }), /positive whole number/u);
  await assert.rejects(() => main(['--bogus'], { fetchImpl, write: () => {} }), /unknown argument/u);
  assert.equal(asked, 0);
  assert.equal(SMALL_RUN, 100);
});

test('main end to end on a saved list: a seeded sample, the CSV and the report written, nothing else asked of the network', async () => {
  const out = mkdtempSync(join(tmpdir(), 'coverage-'));
  const list = population(60);
  // The recording answers any commune in the same way the services answered Brouennes (RNU) — a stub for the plumbing only.
  const rnu = recorded.answers['https://apicarto.ign.fr/api/gpu/municipality?insee=55083'];
  const none = recorded.answers[Object.keys(recorded.answers).find((u) => u.includes('geom=') && u.includes('55083') === false && recorded.answers[u].body.features.length === 0)];
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    const body = url.includes('/municipality?') ? rnu.body : url.includes('/document?geom=') ? none.body : { results: 1, total_pages: 1, data: [] };
    return { ok: true, status: 200, json: async () => body };
  };
  const time = fakeTime();
  const lines = [];
  const listPath = join(out, 'list.json');
  writeFileSync(listPath, JSON.stringify({ date: '2026-11-03', communes: list }));
  const result = await main(['--size', '12', '--seed', '42', '--smoke', '--label', 'plumbing', '--list', listPath, '--out', out], {
    fetchImpl,
    sleep: time.sleep,
    clock: time.clock,
    write: (l) => lines.push(l),
    env: {}
  });
  assert.equal(result.rows.length, 12, 'the reference communes are not in this list, so only the draw');
  assert.ok(result.rows.every((r) => r.state === 'rnu'));
  assert.ok(asked.every((u) => u.startsWith('https://apicarto.ign.fr/') || u.startsWith('https://georisques.gouv.fr/')), 'nothing but the three kinds of question');
  assert.ok(!asked.includes(COMMUNES_URL), 'a saved list is not fetched again');
  assert.deepEqual((await readdir(out)).sort(), ['coverage-plumbing-1970-01-01.csv', 'coverage-plumbing-1970-01-01.md', 'list.json']);
  const csv = readFileSync(join(out, 'coverage-plumbing-1970-01-01.csv'), 'utf8');
  assert.equal(csv.trim().split('\n').length, 13);
  assert.match(lines.at(-1), /wrote coverage-plumbing-/u);
  // Same seed, same list: the same sample (criterion 10).
  const again = await main(['--size', '12', '--seed', '42', '--smoke', '--label', 'plumbing', '--list', listPath, '--out', out], {
    fetchImpl,
    sleep: time.sleep,
    clock: time.clock,
    write: () => {},
    env: {}
  });
  assert.deepEqual(again.rows.map((r) => r.code), result.rows.map((r) => r.code));
  assert.equal(again.listSha256, result.listSha256);
});
