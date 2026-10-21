/**
 * Sprint 002.9 (Design-Time Acceptance FR), the service's side:
 *
 * - DEC-2: each recorded call's metadata carries `textSha256` and
 *   `promptVersion` (from `extractChapter`'s `onCall`), never the text;
 * - criterion 6: a replayed call whose text length, text hash or
 *   instructions' version differs from the recording fails, naming the
 *   command to record again (`tools/acceptance.mjs`'s `replayAi`);
 * - DEC-4: the judgement against `acceptance/expected-002.9.json`, on a
 *   result built from the expected rows, on altered ones, and on 002.5b's
 *   engineering recording (which it must not pass: no written height rule);
 * - criterion 3–4 (service half): the **acceptance** recordings of Lyon and
 *   Gordes, replayed through the pipeline and judged — skipped, said, until
 *   the owner has recorded them with the production model (DEC-7);
 * - DEC-3: the recording tool's options; criterion 7's comparison.
 *
 * No network (the guard), no model.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { AiError } from '../src/ai-client.mjs';
import { PROMPT_VERSION, extractChapter, splitChunks } from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import {
  EXPECTED_URL,
  callMetadata,
  documentDifferences,
  judgeExtraction,
  normalisePhrase,
  recordCommand,
  recorderOptions,
  replayAi,
  sha256
} from '../../../tools/acceptance.mjs';
import { FIXTURES, loadRegulation } from './helpers.mjs';

const expectedText = readFileSync(EXPECTED_URL, 'utf8');
const expected = JSON.parse(expectedText);
const hash = (text) => createHash('sha256').update(text).digest('hex');

function chapterOf(plot) {
  const regulation = loadRegulation(plot);
  const [from, to] = expected.plots[plot].chapter.pages;
  const pages = [];
  for (let page = from; page <= to; page += 1) pages.push({ page, text: regulation.pages[page - 1] });
  return prepareChapter(pages);
}

/** A service rule built from an expected row, as a perfect extraction would return it. */
function ruleFromRow(row) {
  const limit = row.limitAnyOf?.[0];
  return {
    kind: row.kind ?? row.kindAnyOf[0],
    sector: row.sector ?? null,
    statement: row.statement,
    limit:
      limit === undefined
        ? null
        : limit.kind === 'value'
          ? { kind: 'value', comparison: limit.comparison, value: limit.value, unit: limit.unit }
          : { kind: 'ratio', comparison: limit.comparison, percent: limit.percent, base: limit.base },
    page: row.pages[0],
    passage: `${row.phrases[0]}.`,
    conditions: [...(row.expectedConditions ?? [])],
    exceptions: [],
    confidence: 'high'
  };
}
const perfectResult = (plot) => ({ rules: expected.plots[plot].extraction.required.map(ruleFromRow) });

// ── The expected values themselves ──────────────────────────────────────────────

test('the expected values name every plot, offer extraction only where a règlement exists, and await the hand check', () => {
  assert.deepEqual(Object.keys(expected.plots), ['lyon', 'gordes', 'mouzay', 'brouennes', 'rochefort']);
  for (const plot of ['lyon', 'gordes']) {
    const p = expected.plots[plot];
    assert.equal(p.extraction.offered, true);
    assert.ok(p.extraction.required.length >= 5, plot);
    const meta = loadRegulation(plot).meta;
    // The expectations name the very document the committed chapter text came from.
    assert.equal(p.document.sha256, meta.sha256);
    assert.equal(p.document.nomfic, meta.nomfic);
    for (const row of p.extraction.required) {
      assert.ok(row.id && row.phrases?.length > 0 && row.pages?.length === 2, row.id);
      assert.ok(row.pages[0] >= p.chapter.pages[0] && row.pages[1] <= p.chapter.pages[1], `${row.id} in the chapter`);
      assert.equal(row.handChecked, false, `${row.id}: hand-checked by a person, then set (step 1)`);
      // Each key phrase is the regulation's own text, on the row's pages.
      const pages = loadRegulation(plot).pages.slice(row.pages[0] - 1, row.pages[1]).join('\n');
      assert.ok(
        row.phrases.some((phrase) => normalisePhrase(pages).includes(normalisePhrase(phrase))),
        `${row.id}: the phrase is on PDF pp. ${row.pages.join('–')}`
      );
    }
  }
  for (const plot of ['mouzay', 'brouennes', 'rochefort']) {
    assert.equal(expected.plots[plot].extraction.offered, false);
    assert.equal(expected.plots[plot].extraction.companionRequests, 0);
  }
  assert.equal(expected.handCheck.state, 'pending');
});

// ── DEC-2: what each recorded call carries ──────────────────────────────────────

test('DEC-2: onCall carries each chunk’s sha256 and the prompt version, never the text', async () => {
  const prepared = chapterOf('lyon');
  const chunks = splitChunks(prepared, 8000);
  const records = [];
  await extractChapter({ prepared, ai: { extract: async () => ({ items: [], rejected: [] }) }, chunkChars: 8000, onCall: (r) => records.push(r) });
  assert.equal(records.length, chunks.length);
  records.forEach((record, index) => {
    assert.equal(record.textSha256, hash(chunks[index].text));
    assert.equal(record.promptVersion, PROMPT_VERSION);
    assert.equal(record.length, chunks[index].text.length);
    assert.equal(record.text, undefined);
  });
  const acceptance = callMetadata({ ...records[0], attempt: 1 }, { acceptance: true, aiServiceUrl: 'http://127.0.0.1:4321' });
  assert.deepEqual(Object.keys(acceptance).sort(), ['aiServiceUrl', 'attempt', 'base', 'chunk', 'promptVersion', 'textLength', 'textSha256']);
  const engineering = callMetadata({ ...records[0], attempt: 1 }, { aiServiceUrl: 'http://127.0.0.1:4321' });
  assert.deepEqual(Object.keys(engineering).sort(), ['aiServiceUrl', 'attempt', 'base', 'chunk', 'textLength']);
  assert.ok(!JSON.stringify(acceptance).includes(chunks[0].text.slice(0, 40)));
});

// ── Criterion 6: the replay refuses a changed call ──────────────────────────────

/** A recording of Lyon's chunks with empty answers, in the acceptance format. */
function syntheticRecording() {
  const chunks = splitChunks(chapterOf('lyon'), 8000);
  return {
    acceptance: true,
    calls: chunks.map((chunk, index) => ({
      request: { chunk: index + 1, attempt: 1, base: chunk.base, textLength: chunk.text.length, textSha256: sha256(chunk.text), promptVersion: PROMPT_VERSION, aiServiceUrl: 'http://127.0.0.1:4321' },
      response: { items: [], rejected: [], providerId: 'test', model: 'm', constraint: 'schema' }
    }))
  };
}

test('criterion 6: an unchanged acceptance recording replays; every call is used', async () => {
  const replay = replayAi(syntheticRecording(), { plot: 'lyon', promptVersion: PROMPT_VERSION, acceptance: true });
  await extractChapter({ prepared: chapterOf('lyon'), ai: replay.ai, chunkChars: 8000 });
  assert.equal(replay.remaining(), 0);
  assert.deepEqual(replay.mismatches, []);
});

for (const [field, alter] of [
  ['textSha256', (call) => (call.request.textSha256 = 'f'.repeat(64))],
  ['promptVersion', (call) => (call.request.promptVersion = PROMPT_VERSION - 1)],
  ['textLength', (call) => (call.request.textLength += 1)]
]) {
  test(`criterion 6: a replayed call whose ${field} differs fails with the recording command`, async () => {
    const recording = syntheticRecording();
    alter(recording.calls[2]);
    const replay = replayAi(recording, { plot: 'lyon', promptVersion: PROMPT_VERSION, acceptance: true });
    const extracted = await extractChapter({ prepared: chapterOf('lyon'), ai: replay.ai, chunkChars: 8000 });
    // The pipeline counts a thrown chunk as failed; the replay keeps why.
    assert.ok(extracted.chunks.failed >= 1);
    assert.equal(replay.mismatches.length >= 1, true);
    const [first] = replay.mismatches;
    assert.equal(first.field, field);
    assert.match(first.message, /chunk 3/);
    assert.ok(first.message.includes(recordCommand('lyon')), first.message);
  });
}

test('criterion 6: an acceptance replay refuses a recording without the two fields (002.5b’s), which still replays as before', async () => {
  const recording = JSON.parse(readFileSync(join(FIXTURES, 'lyon/extraction/calls.json'), 'utf8'));
  const strict = replayAi(recording, { plot: 'lyon', promptVersion: PROMPT_VERSION, acceptance: true, errorFor: (code) => new AiError(code) });
  await extractChapter({ prepared: chapterOf('lyon'), ai: strict.ai, chunkChars: 8000, maxItems: 30 });
  assert.ok(strict.mismatches.length > 0);
  assert.equal(strict.mismatches[0].field, 'textSha256');
  const lenient = replayAi(recording, { plot: 'lyon', promptVersion: PROMPT_VERSION });
  const out = await extractChapter({ prepared: chapterOf('lyon'), ai: lenient.ai, chunkChars: 8000, maxItems: 30 });
  assert.deepEqual(lenient.mismatches, []);
  assert.equal(lenient.remaining(), 0);
  assert.deepEqual(out.rules, JSON.parse(readFileSync(join(FIXTURES, 'lyon/extraction/result.json'), 'utf8')).rules);
});

// ── DEC-4: the judgement ────────────────────────────────────────────────────────

for (const plot of ['lyon', 'gordes']) {
  test(`DEC-4 (${plot}): a result holding every expected row passes; extras are listed, not failed`, () => {
    const result = perfectResult(plot);
    result.rules.push({ kind: 'other', sector: null, statement: 'described', limit: null, page: expected.plots[plot].chapter.pages[0], passage: 'x', conditions: [], exceptions: [] });
    const verdict = judgeExtraction(expected.plots[plot], result);
    assert.deepEqual(verdict.failures, []);
    assert.equal(Object.keys(verdict.matched).length, expected.plots[plot].extraction.required.length);
    assert.equal(verdict.extras.length, 1);
  });
}

test('DEC-4: a wrong value, page, passage, statement or missing condition fails the row it breaks, naming why', () => {
  const lyon = expected.plots.lyon;
  const cases = [
    ['lyon-green-ratio', (r) => (r.limit.percent = 20), /limit/],
    ['lyon-boundary-setback-uce1b', (r) => (r.page = 140), /page 140/],
    ['lyon-footprint-not-regulated', (r) => (r.passage = 'Une autre phrase.'), /passage/],
    ['lyon-facade-height-see-graphic', (r) => (r.statement = 'described'), /statement described/],
    ['lyon-green-ratio', (r) => (r.conditions = []), /condition/]
  ];
  for (const [id, alter, why] of cases) {
    const result = perfectResult('lyon');
    alter(result.rules[lyon.extraction.required.findIndex((row) => row.id === id)]);
    const verdict = judgeExtraction(lyon, result);
    assert.deepEqual(verdict.failures.map((f) => f.id), [id], id);
    assert.match(verdict.failures[0].why, why);
  }
  // Both forms of « au minimum de 15 % » are the expected limit; a « not regulated » rule is never an absent one.
  const valueForm = perfectResult('lyon');
  valueForm.rules[0].limit = { kind: 'value', comparison: 'min', value: 15, unit: 'percent' };
  assert.equal(judgeExtraction(lyon, valueForm).passed, true);
  const absent = perfectResult('lyon');
  absent.rules.splice(1, 1);
  assert.match(judgeExtraction(lyon, absent).failures[0].why, /no footprint_ratio rule extracted|nearest/);
});

test('DEC-4: a forbidden row fails — a numeric footprint on Lyon, an unconditional numeric height, Gordes’ example cap', () => {
  const lyon = perfectResult('lyon');
  lyon.rules.push({ kind: 'footprint_ratio', sector: null, statement: 'limit', limit: { kind: 'value', comparison: 'max', value: 60, unit: 'percent' }, page: 128, passage: 'x', conditions: [], exceptions: [] });
  lyon.rules.push({ kind: 'height_facade', sector: null, statement: 'limit', limit: { kind: 'value', comparison: 'max', value: 16, unit: 'm' }, page: 129, passage: 'x', conditions: [], exceptions: [] });
  // A conditional 3.50 m (the gabarit near URi zones) is not forbidden.
  lyon.rules.push({ kind: 'height_facade', sector: null, statement: 'limit', limit: { kind: 'value', comparison: 'max', value: 3.5, unit: 'm' }, page: 129, passage: 'y', conditions: ['dans la bande de constructibilité secondaire'], exceptions: [] });
  const verdict = judgeExtraction(expected.plots.lyon, lyon);
  assert.deepEqual(verdict.failures.map((f) => f.id).sort(), ['lyon-no-numeric-footprint', 'lyon-no-unconditional-height']);
  const gordes = perfectResult('gordes');
  gordes.rules.push({ kind: 'extension_max', sector: null, statement: 'limit', limit: { kind: 'value', comparison: 'max', value: 50, unit: 'm2' }, page: 45, passage: 'x', conditions: [], exceptions: [] });
  assert.deepEqual(judgeExtraction(expected.plots.gordes, gordes).failures.map((f) => f.id), ['gordes-no-example-caps']);
});

test('DEC-4 on 002.5b’s engineering recording (the 8 B development model): it does not pass — no written façade height', () => {
  const engineering = JSON.parse(readFileSync(join(FIXTURES, 'lyon/extraction/result.json'), 'utf8'));
  const verdict = judgeExtraction(expected.plots.lyon, engineering);
  const failed = new Set(verdict.failures.map((f) => f.id));
  assert.equal(verdict.passed, false);
  assert.ok(failed.has('lyon-facade-height-see-graphic'), JSON.stringify(verdict.failures));
  // What it did read is matched: the 4 m setback and « not regulated ».
  assert.ok('lyon-boundary-setback-uce1b' in verdict.matched);
  assert.ok('lyon-footprint-not-regulated' in verdict.matched);
});

// ── Criteria 3–4 (service half): the acceptance recordings ──────────────────────

for (const plot of ['lyon', 'gordes']) {
  test(`criteria 3–4 (${plot}): the acceptance recording replays through the pipeline and holds DEC-4`, async (t) => {
    const dir = join(FIXTURES, 'acceptance', plot, 'extraction');
    if (!existsSync(join(dir, 'calls.json'))) {
      t.skip(`owner step: no acceptance recording yet — ${recordCommand(plot)} with the production model (002.9 DEC-7)`);
      return;
    }
    const recording = JSON.parse(readFileSync(join(dir, 'calls.json'), 'utf8'));
    const result = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
    assert.equal(recording.acceptance, true);
    assert.match(recording.expectedSha256 ?? '', /^[0-9a-f]{64}$/, 'made against committed expected values');
    assert.deepEqual(result.chapter.pages, expected.plots[plot].chapter.pages);
    assert.equal(result.document.sha256, expected.plots[plot].document.sha256);
    const replay = replayAi(recording, { plot, promptVersion: PROMPT_VERSION, acceptance: true, errorFor: (code) => new AiError(code) });
    const chunkChars = recording.calls.reduce((most, call) => Math.max(most, call.request.textLength), 0);
    const out = await extractChapter({ prepared: chapterOf(plot), ai: replay.ai, chunkChars: Math.max(chunkChars, 1), maxItems: 120 });
    assert.deepEqual(replay.mismatches.map((m) => m.message), []);
    assert.equal(replay.remaining(), 0);
    assert.deepEqual(out.rules, result.rules);
    const verdict = judgeExtraction(expected.plots[plot], result);
    assert.deepEqual(verdict.failures, [], 'DEC-4');
  });
}

// ── DEC-3 and criterion 7 ────────────────────────────────────────────────────────

test('DEC-3: the recording tool’s options — --acceptance with --extraction, --no-model with --check --extraction', () => {
  assert.deepEqual(recorderOptions(['lyon', '--extraction', '--acceptance']), { plot: 'lyon', check: false, trim: false, extraction: true, acceptance: true, noModel: false });
  assert.equal(recorderOptions(['gordes', '--extraction', '--check', '--no-model']).noModel, true);
  assert.equal(recorderOptions(['brouennes', '--trim']).trim, true);
  for (const bad of [
    ['lyon', '--acceptance'],
    ['lyon', '--no-model'],
    ['lyon', '--extraction', '--no-model'],
    ['lyon', '--check', '--trim'],
    ['paris', '--extraction'],
    ['lyon', '--extraction', '--live']
  ]) {
    assert.throws(() => recorderOptions(bad), /usage/, bad.join(' '));
  }
});

test('criterion 7: the document check reports nothing when unchanged, and each changed field when not', () => {
  const meta = loadRegulation('lyon').meta;
  const stored = JSON.parse(readFileSync(join(FIXTURES, 'lyon/extraction/result.json'), 'utf8'));
  const fresh = { sha256: meta.sha256, pages: meta.pages, idurba: '200046977_PLUI_20260326', nomfic: meta.nomfic, chapterPages: [121, 144] };
  assert.deepEqual(documentDifferences({ fresh, meta, stored, expected: expected.plots.lyon }), [], 'idurba compared case-insensitively');
  const changed = documentDifferences({ fresh: { ...fresh, sha256: '0'.repeat(64), chapterPages: [121, 146] }, meta, stored, expected: expected.plots.lyon });
  assert.deepEqual(changed.map((d) => d.what), [
    'sha256 (regulation/meta.json)',
    'sha256 (extraction/result.json)',
    'chapter pages (extraction/result.json)',
    'sha256 (expected-002.9.json)',
    'chapter pages (expected-002.9.json)'
  ]);
});
