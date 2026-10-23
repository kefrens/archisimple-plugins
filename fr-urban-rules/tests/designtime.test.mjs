/**
 * Sprint 002.9 (Design-Time Acceptance FR), step 3: one end-to-end test per
 * plot — the recorded GPU answers and captures (002.4), a fake companion
 * service (`written.test.mjs`'s pattern) answering the **acceptance**
 * extraction where one is recorded, the package's reader, the report —
 * asserted against `test-fixtures/fr-urban-rules/acceptance/expected-002.9.json`.
 * Every assertion names its row.
 *
 * - P1 Lyon and P2 Gordes: the written rows on the acceptance recording
 *   (DEC-4 judged service-side by `services/…/tests/acceptance.test.mjs`) are
 *   asserted on the report — skipped, said, until the owner has recorded them
 *   (DEC-7); the design-time rows (envelope, checks, the two 15 %, the
 *   assistant, the extension check, the sheet) hold now.
 * - P3–P5: no request at all reaches the companion, and each says why.
 *
 * No network: the global `fetch` throws for the whole file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { createReader } from '../src/index.js';
import { ACCEPTANCE, FIXTURES, flattenBlocks, loadAcceptance, replayFetch, replayService } from './helpers.mjs';

let globalFetchCalls = 0;
globalThis.fetch = () => {
  globalFetchCalls += 1;
  throw new Error('no network in the design-time acceptance tests');
};

const expected = JSON.parse(readFileSync(new URL('expected-002.9.json', ACCEPTANCE), 'utf8'));
const en = JSON.parse(await readFile(new URL('../resources/i18n/fr-urban-rules/en.json', import.meta.url), 'utf8'));
const translate = (key, params = {}) =>
  Object.hasOwn(en, key) ? en[key].replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all)) : key;
const now = () => new Date(Date.UTC(2026, 9, 21, 9, 0));
const BASE = 'https://editor.example/plugins-api/com.archisimple.fr-urban-rules/';
const CURRENT = { providerId: 'production', schemaVersion: 1, promptVersion: 2 };

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  text: async () => JSON.stringify(body)
});

/** The companion as a deployment serves it: the chapter, and a cached extraction (or none). */
function fakeCompanion(plot, result) {
  const calls = [];
  const chapter = expected.plots[plot].chapter;
  return {
    calls,
    handle: async (url, init = {}) => {
      calls.push(`${init.method ?? 'GET'} ${url}`);
      const path = new URL(url).pathname.replace('/plugins-api/com.archisimple.fr-urban-rules/', '');
      if (path === 'v1/chapter') {
        return json(200, { pages: chapter?.pages, found: chapter?.found, match: 'prefix', title: chapter?.title ?? 'Zone', documentPages: expected.plots[plot].document?.pages });
      }
      if (path === 'v1/extractions' && init.method !== 'POST') {
        return result === undefined ? json(404, { current: CURRENT, error: 'not_cached' }) : json(200, { result, current: CURRENT });
      }
      return json(404, { error: 'not_found' });
    }
  };
}

/** A plot read through replays, with the companion behind `/plugins-api`, and the reader kept for questions. */
async function readPlot(plot, { section, result } = {}) {
  const captured = await loadAcceptance(plot);
  const held = section === undefined ? captured.section : section;
  const site = replayService(captured.siteCalls, { name: 'site' });
  const planning = replayFetch(captured.answers);
  const companion = fakeCompanion(plot, result);
  const reader = createReader({
    fetch: (url, init) => (String(url).startsWith(BASE) ? companion.handle(String(url), init) : planning(url, init)),
    now,
    site: () => site,
    roads: () => replayService(captured.context.roads, { name: 'roads' }),
    mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
    document: () => replayService(captured.context.document, { name: 'document' }),
    packageData: () => ({ read: () => held ?? undefined, write: () => true }),
    pluginService: () => ({ locate: async () => ({ baseUrl: BASE }) }),
    translate
  });
  const report = await reader.read({ site: captured.site, country: 'FR', reason: 'site' }, { signal: new AbortController().signal, progress: () => {} });
  // The cached extraction is asked after the read returns; it fires a source read (002.6b).
  let current = report;
  if (result !== undefined) {
    for (let turn = 0; turn < 20 && !current.rules.some((r) => r.provenance === 'written'); turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      current = await reader.read({ site: captured.site, country: 'FR', reason: 'source' }, { signal: new AbortController().signal, progress: () => {} });
    }
  }
  return { captured, reader, report: current, companion, section: held ?? undefined, planning };
}

const near = (actual, value, tolerance, what) =>
  assert.ok(typeof actual === 'number' && Math.abs(actual - value) <= tolerance + 1e-9, `${what}: ${actual} is not ${value} ± ${tolerance}`);
const area = (ring) => Math.abs(ring.reduce((sum, p, i) => sum + p.easting * ring[(i + 1) % ring.length].northing - ring[(i + 1) % ring.length].easting * p.northing, 0)) / 2;
const envelopeOf = (report) => report.features.find((f) => f.id === 'envelope');
const view = (report, id) => report.views?.find((v) => v.id === id);
const surfaceRow = (report, key) =>
  flattenBlocks(view(report, 'surfaces')?.blocks).filter((b) => b.kind === 'fields').flatMap((b) => b.rows).find((r) => r.label.key === key);
const rulesNotices = (report) => (view(report, 'rules')?.blocks ?? []).filter((b) => b.kind === 'notice').map((b) => b.text.key);
const confirmedIssues = (report) =>
  report.checks.filter((c) => c.result === 'potential_issue' && report.rules.find((r) => r.id === c.ruleId)?.status === 'confirmed');
const question = (context, id, args = {}) =>
  context.reader.questions.find((q) => q.id === id).answer(structuredClone({ args, report: context.report, site: context.captured.site, variationId: 'open', sectionData: context.section }));
const acceptanceResult = (plot) => {
  const file = new URL(`${plot}/extraction/result.json`, ACCEPTANCE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
};
const ownerStep = (plot) => `owner step: no acceptance recording yet — node tools/record-fixtures.mjs ${plot} --extraction --acceptance (002.9 DEC-7)`;

// ── P1 — Lyon ───────────────────────────────────────────────────────────────────

test('002.9 P1 Lyon: the written rows on the acceptance recording, as the report carries them', async (t) => {
  const result = acceptanceResult('lyon');
  if (result === undefined) {
    t.skip(ownerStep('lyon'));
    return;
  }
  const { report } = await readPlot('lyon', { result });
  const written = report.rules.filter((r) => r.provenance === 'written');
  // P1 green_ratio: pleine terre ≥ 15 %, written, to confirm, with page and passage.
  const green = written.find((r) => r.kind === 'green_ratio' && (r.limit?.percent === 15 || r.limit?.quantity?.value === 15));
  assert.ok(green && green.status === 'to_confirm' && green.citation.page === 133 && green.citation.passage?.text);
  // P1 footprint_ratio: « not regulated », a written rule with its passage — never an absent rule.
  const footprint = written.find((r) => r.kind === 'footprint_ratio' && r.statement === 'not_regulated');
  assert.ok(footprint && footprint.citation.page === 128 && footprint.citation.passage?.text);
  // P1 height_facade: with the written see-graphic façade rule, the drawn 22 m is relabelled, never overridden.
  const drawn = report.rules.find((r) => r.label.text === 'Hauteur Max-22');
  assert.equal(drawn.kind, 'height_facade');
  assert.deepEqual(drawn.limit, { kind: 'value', comparison: 'max', quantity: { value: 22, unit: 'm' } });
  // P1 boundary_setback: UCe1b ≥ 4 m, p. 126.
  assert.ok(written.some((r) => r.kind === 'boundary_setback' && r.limit?.quantity?.value === 4 && r.citation.page === 126));
  assert.equal(globalFetchCalls, 0);
});

test('002.9 P1 Lyon, on 002.5b’s engineering recording: no written façade rule, so the drawn 22 m stays height_total — never overridden', async () => {
  const engineering = JSON.parse(readFileSync(new URL('lyon/extraction/result.json', FIXTURES), 'utf8'));
  const { report, companion } = await readPlot('lyon', { result: engineering });
  const drawn = report.rules.find((r) => r.label.text === 'Hauteur Max-22');
  assert.equal(drawn.kind, expected.plots.lyon.designTime.drawnHeight.kindWithoutWrittenSeeGraphic);
  assert.equal(drawn.limit.quantity.value, 22);
  assert.ok(!companion.calls.some((c) => c.startsWith('POST')), 'a read never starts an extraction');
  // The defect 002.9 found (0.8.1): a written ratio of the plot area is checked like a percentage.
  const ratio = report.rules.find((r) => r.kind === 'green_ratio' && r.limit?.kind === 'ratio' && r.limit.percent === 15);
  assert.ok(ratio, 'the recording’s « 15 % of the plot area »');
  const check = report.checks.find((c) => c.ruleId === ratio.id);
  assert.ok(check, 'the written pleine terre ratio is checked');
  const { twoFifteens } = expected.plots.lyon.designTime;
  near(check.limit.value, twoFifteens.pleineTerreLimit.requiredWhenConfirmed.value, twoFifteens.pleineTerreLimit.requiredWhenConfirmed.tolerance, 'P1 pleine terre required');
  near(check.measured.value, twoFifteens.openGroundMeasured.value, twoFifteens.openGroundMeasured.tolerance, 'P1 open ground');
  assert.equal(check.result, 'no_issue');
});

test('002.9 P1 Lyon: the design-time rows — envelope, checks, the two 15 %, the assistant', async () => {
  const p1 = expected.plots.lyon.designTime;
  const context = await readPlot('lyon');
  const { report, captured } = context;
  near(captured.site.plotArea, p1.plotArea.value, p1.plotArea.tolerance, 'P1 plot area');
  // P1 Envelope: from confirmed rules only; 4 m off rear edges 9–13; a height of 22 within « Hauteur Max-22 ».
  const envelope = envelopeOf(report);
  near(area(envelope.rings[0]), p1.envelope.withWalkSection.groundArea.value, p1.envelope.withWalkSection.groundArea.tolerance, 'P1 envelope ground');
  assert.deepEqual(envelope.volume.ceilings.map((c) => [c.kind, c.metres]), [['height', 22]]);
  assert.equal(translate(envelope.label.key), p1.envelope.label);
  assert.doesNotMatch(JSON.stringify(report.views.find((v) => v.id === 'envelope')), new RegExp(p1.envelope.never.join('|'), 'i'));
  // P1 Checks (walk): rear edge 9 at 2.60 m → potential issue; height 12.09 m → no issue.
  const issues = confirmedIssues(report);
  assert.equal(issues.length, 1);
  near(issues[0].measured.value, p1.checksWithWalkSection.rearSetbackEdge9.measured, 0.01, 'P1 rear edge 9');
  const height = report.checks.find((c) => c.ruleId === report.rules.find((r) => r.label.text === 'Hauteur Max-22').id);
  near(height.measured.value, p1.checksWithWalkSection.height.measured, 0.01, 'P1 height');
  assert.equal(height.result, 'no_issue');
  // P1 The two 15 %: the emprise measured (12.7 % of the plot), apart from the pleine terre limit.
  const emprise = surfaceRow(report, 'fr-urban-rules.surfaces.emprise.r420').value.value;
  near(emprise, p1.twoFifteens.empriseMeasured.value, p1.twoFifteens.empriseMeasured.tolerance, 'P1 emprise');
  near((emprise / captured.site.plotArea) * 100, p1.twoFifteens.empriseMeasured.shareOfPlot, 0.05, 'P1 emprise share');
  near(surfaceRow(report, 'fr-urban-rules.surfaces.green.unbuilt').value.value, p1.twoFifteens.openGroundMeasured.value, 0.05, 'P1 open ground');
  // P1 Assistant: « can I add a storey? » — room, a 3 m storey taken from the design, 12.087 m measured.
  const storey = question(context, 'can_add_storey');
  assert.equal(storey.summary.key, p1.assistant.can_add_storey.withWalkSection.summaryKey);
  assert.ok(storey.claims.some((c) => c.text.key === 'fr-urban-rules.question.storeyHeightProject'), 'the design’s own storey height, said');
  const current = storey.claims.find((c) => c.text.key === 'fr-urban-rules.question.height.current');
  near(current?.values?.current?.value, p1.assistant.can_add_storey.withWalkSection.measuredHeight, 0.001, 'P1 measured height');
  // « How high can I build? » — the tightest confirmed limit, 22 m.
  const max = question(context, 'max_height');
  assert.equal(max.summary.key, p1.assistant.max_height.withWalkSection.summaryKey);
  // Before the walk's confirmation: a rule to confirm only, and the offer « Confirm 22 m ».
  const bare = await readPlot('lyon', { section: null });
  const toConfirm = question(bare, 'max_height');
  assert.equal(toConfirm.summary.key, p1.assistant.max_height.toConfirm.summaryKey);
  assert.equal(translate(toConfirm.offer.label.key, toConfirm.offer.label.params), p1.assistant.max_height.toConfirm.offer);
  assert.equal(globalFetchCalls, 0);
});

// ── P2 — Gordes ──────────────────────────────────────────────────────────────────

/** A Gordes extraction result holding the expected rows (a perfect reading), for the checks the rows feed. */
function gordesResult(rows) {
  const doc = expected.plots.gordes.document;
  return {
    schemaVersion: 1,
    promptVersion: 2,
    document: { documentId: doc.documentId, partition: 'DU_84050', idurba: doc.idurba, nomfic: doc.nomfic, sha256: doc.sha256, pages: doc.pages, retrievedAt: '2026-10-21T00:00:00Z' },
    chapter: { pages: [44, 51], found: 'contents', match: 'exact', title: 'CHAPITRE I : REGLES APPLICABLES A LA ZONE A' },
    rules: rows.map((row, index) => ({
      kind: row.kind ?? row.kindAnyOf[0],
      sector: null,
      statement: row.statement,
      limit:
        row.limitAnyOf === undefined
          ? null
          : row.limitAnyOf[0].kind === 'value'
            ? { kind: 'value', comparison: row.limitAnyOf[0].comparison, value: row.limitAnyOf[0].value, unit: row.limitAnyOf[0].unit }
            : { kind: 'ratio', comparison: row.limitAnyOf[0].comparison, percent: row.limitAnyOf[0].percent, base: row.limitAnyOf[0].base },
      page: row.pages[0],
      article: row.article,
      passage: row.phrases[0],
      offset: { start: index * 10, end: index * 10 + 5 },
      occurrence: { of: 1, chosenBy: 'only' },
      conditions: [],
      exceptions: [],
      sectorUnplaced: false,
      confidence: 'high'
    })),
    dropped: {},
    chunks: { of: 1, failed: 0 },
    model: { providerId: 'production', model: 'test', constraint: 'schema' },
    extractedAt: '2026-10-21T00:00:00Z'
  };
}

test('002.9 P2 Gordes: the written rows on the acceptance recording, as the report carries them', async (t) => {
  const result = acceptanceResult('gordes');
  if (result === undefined) {
    t.skip(ownerStep('gordes'));
    return;
  }
  const { report } = await readPlot('gordes', { result });
  const written = report.rules.filter((r) => r.provenance === 'written');
  const extension = written.find((r) => r.kind === 'extension_max' && r.limit?.kind === 'ratio');
  assert.ok(extension && extension.limit.percent === 30 && extension.citation.page === 45);
  assert.ok(written.some((r) => r.kind === 'height_total' && r.limit?.quantity?.value === 8.5 && r.citation.page === 48));
  assert.ok(written.some((r) => r.kind === 'boundary_setback' && r.limit?.quantity?.value === 4 && r.citation.page === 48));
});

test('002.9 P2 Gordes: the extension cap is measured against the existing building with its base named — a share of the floor area is « not checked », never read against the emprise', async () => {
  const p2 = expected.plots.gordes;
  const extensionRow = p2.extraction.required.find((row) => row.id === 'gordes-extension-ratio');
  const { report, companion } = await readPlot('gordes', { result: gordesResult([extensionRow]) });
  assert.ok(companion.calls.some((c) => c.includes('v1/chapter')), 'a règlement exists: the companion is asked');
  near(surfaceRow(report, 'fr-urban-rules.surfaces.caps.existing').value.value, p2.designTime.existingEmprise.value, 0.01, 'P2 existing emprise');
  near(surfaceRow(report, 'fr-urban-rules.surfaces.caps.extended').value.value, p2.designTime.extensionMeasured.value, 0.01, 'P2 extension');
  const rule = report.rules.find((r) => r.provenance === 'written' && r.kind === 'extension_max');
  assert.equal(rule.limit.base.key, 'fr-urban-rules.written.base.surface_de_plancher', 'the base named: the floor area');
  const check = report.checks.find((c) => c.ruleId === rule.id);
  assert.equal(check.result, 'not_checked');
  assert.equal(check.measured, undefined, 'never 30 % of the existing emprise');
  // A written share of the existing emprise is measured against it, as an entered one is.
  const ofEmprise = { ...extensionRow, limitAnyOf: [{ kind: 'ratio', comparison: 'max', percent: 30, base: 'existing_emprise' }] };
  const second = await readPlot('gordes', { result: gordesResult([ofEmprise]) });
  const rule2 = second.report.rules.find((r) => r.provenance === 'written' && r.kind === 'extension_max');
  const check2 = second.report.checks.find((c) => c.ruleId === rule2.id);
  near(check2.limit.value, 0.3 * p2.designTime.existingEmprise.value, 0.01, 'P2 30 % of the existing emprise');
  near(check2.measured.value, p2.designTime.extensionMeasured.value, 0.01, 'P2 extension measured');
  assert.equal(check2.result, 'no_issue');
});

test('002.9 P2 Gordes: the sheet carries the AC2 site flag and the zone’s own date', async () => {
  const { report } = await readPlot('gordes');
  assert.ok(report.flags.some((f) => f.kind === 'site'), 'P2 AC2 → site flag');
  assert.ok(report.sheet.blocks.some((b) => b.kind === 'flags'), 'the sheet prints the flags');
  const rows = report.sheet.blocks.find((b) => b.kind === 'fields').rows;
  assert.deepEqual(rows.at(-1).value, { text: expected.plots.gordes.designTime.sheet.zoneValidFrom });
});

// ── P3–P5: no règlement, no request, a reason ────────────────────────────────────

for (const plot of ['mouzay', 'brouennes', 'rochefort']) {
  test(`002.9 ${expected.plots[plot].label}: no request reaches the companion, and the plot says why`, async () => {
    const p = expected.plots[plot];
    const { report, companion } = await readPlot(plot);
    assert.equal(report.regime.code, p.regime);
    assert.deepEqual(companion.calls, [], 'no chapter, no extraction request');
    assert.equal(report.sources.some((s) => s.id === 'written-rules'), false);
    if (p.extraction.reasonKey !== undefined) {
      assert.ok(rulesNotices(report).includes(p.extraction.reasonKey), `the Rules view says ${p.extraction.reasonKey}`);
      assert.equal(translate(p.extraction.reasonKey), p.extraction.reason);
    } else {
      const notices = report.overview.filter((b) => b.kind === 'notice').map((b) => b.text.key);
      for (const key of p.extraction.reasonKeys) assert.ok(notices.includes(key), key);
    }
    assert.equal(globalFetchCalls, 0);
  });
}

test('002.9 P3 Mouzay: the envelope from R.111-16 and R.111-17', async () => {
  const { report } = await readPlot('mouzay');
  const envelope = envelopeOf(report);
  near(area(envelope.rings[0]), expected.plots.mouzay.designTime.envelope.groundArea.value, expected.plots.mouzay.designTime.envelope.groundArea.tolerance, 'P3 envelope ground');
  for (const article of expected.plots.mouzay.designTime.envelope.rules) {
    const rule = report.rules.find((r) => r.citation?.article === article);
    assert.ok(envelope.volume.ceilings.some((c) => c.ruleIds.includes(rule.id)), `${article} shapes the volume`);
  }
});

test('002.9 P4 Brouennes: the open variation 1 potential issue, the parked one 0, the same rules checked', async () => {
  const p4 = expected.plots.brouennes.designTime;
  const context = await readPlot('brouennes');
  const { report, reader, captured } = context;
  near(area(envelopeOf(report).rings[0]), p4.envelope.groundArea.value, p4.envelope.groundArea.tolerance, 'P4 envelope ground');
  const countable = report.rules.filter((r) => r.status !== 'information');
  const checked = (checks) => new Set(checks.filter((c) => c.measured !== undefined).map((c) => c.ruleId));
  const r111_17 = (checks) => checks.find((c) => c.ruleId === 'rnu:R.111-17' && c.subject.id === String(p4.variations.open.r111_17.edge));
  // Open.
  assert.equal(confirmedIssues(report).length, p4.variations.open.potentialIssues);
  assert.equal(checked(report.checks).size, p4.variations.open.rulesChecked);
  assert.equal(countable.length, p4.variations.open.countable);
  near(r111_17(report.checks).measured.value, p4.variations.open.r111_17.measured, 0.001, 'P4 open edge 2');
  near(r111_17(report.checks).limit.value, p4.variations.open.r111_17.limit, 0.001, 'P4 open limit');
  // Parked (the house moved 3.5 m from side edge 2), measured by checkVariation.
  const parked = captured.variations.find((v) => v.variationId === p4.variations.parked.id);
  const out = await reader.checkVariation({ site: captured.site, country: 'FR', variationId: parked.variationId, report, buildings: parked.buildings }, { signal: new AbortController().signal });
  const issues = out.checks.filter((c) => c.result === 'potential_issue' && report.rules.find((r) => r.id === c.ruleId)?.status === 'confirmed');
  assert.equal(issues.length, p4.variations.parked.potentialIssues);
  assert.equal(checked(out.checks).size, p4.variations.parked.rulesChecked);
  near(r111_17(out.checks).measured.value, p4.variations.parked.r111_17.measured, 0.001, 'P4 parked edge 2');
  near(r111_17(out.checks).limit.value, p4.variations.parked.r111_17.limit, 0.001, 'P4 parked limit');
});

test('002.9 P5 Rochefort: the sheet names the state, only the AC4 flag and the entered height; the assistant cites nothing', async () => {
  const p5 = expected.plots.rochefort.designTime;
  const context = await readPlot('rochefort');
  const { report } = context;
  assert.deepEqual([...new Set(report.flags.map((f) => f.kind))], p5.flags);
  const notices = report.sheet.blocks.filter((b) => b.kind === 'notice').map((b) => b.text.key);
  assert.deepEqual(notices, [p5.sheetNoticeKey]);
  assert.equal(translate(p5.sheetNoticeKey), p5.sheetNotice);
  const [rule] = report.rules;
  assert.equal(rule.provenance, 'entered');
  const check = report.checks.find((c) => c.ruleId === rule.id);
  near(check.measured.value, p5.enteredHeight.measured, 0.01, 'P5 height');
  assert.equal(check.result, p5.enteredHeight.result);
  // With the walk's entered height, the questions answer from it, citing the entered rule only.
  const storey = question(context, 'can_add_storey');
  assert.equal(storey.summary.key, p5.assistant.withWalkEnteredHeight.can_add_storey);
  assert.ok(storey.claims.filter((c) => c.basis === 'rule').every((c) => c.ruleId === rule.id));
  // Before any rule is entered: no regulation is published, hand entry offered, nothing cited.
  const bare = await readPlot('rochefort', { section: null });
  for (const id of ['can_add_storey', 'max_height', 'remaining_area']) {
    const answer = question(bare, id);
    assert.equal(answer.summary.key, p5.assistant.withoutEnteredRule.summaryKey, id);
    assert.equal((answer.claims ?? []).filter((c) => c.basis === 'rule').length, p5.assistant.withoutEnteredRule.cites, `${id} cites no rule`);
  }
});
