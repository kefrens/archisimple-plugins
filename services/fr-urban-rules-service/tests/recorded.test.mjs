/**
 * The recorded live Lyon extraction (Sprint 002.5b DEC-11, criterion 7):
 * `test-fixtures/fr-urban-rules/lyon/extraction/`, made by
 * `node tools/record-fixtures.mjs lyon --extraction` on 2026-10-20 against a
 * local ai-service and LM Studio (`qwen/qwen3-vl-8b`), with
 * `FR_URBAN_RULES_EXTRACT_CHUNK_CHARS=8000` and `…_MAX_ITEMS=30`.
 *
 * `result.json`'s rules were **replayed** after the 002.5b review (its
 * `replayNote`): the recorded 096.7 answers, sent with promptVersion 1,
 * through the post-validation of promptVersion 2. Not re-recorded live.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { extractChapter } from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import { FIXTURES, loadRegulation } from './helpers.mjs';

const dir = join(FIXTURES, 'lyon/extraction');
const result = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
const recording = JSON.parse(readFileSync(join(dir, 'calls.json'), 'utf8'));

const find = (predicate) => result.rules.find(predicate);

test('the recorded answer holds UCe1b\'s 4 m boundary setback, and footprint not regulated, each with page and passage', () => {
  assert.deepEqual(result.chapter.pages, [121, 144]);
  assert.equal(result.chapter.match, 'prefix');
  const setback = find(
    (r) => r.kind === 'boundary_setback' && r.sector === 'UCe1b' && r.limit?.comparison === 'min' && r.limit.value === 4 && r.limit.unit === 'm'
  );
  assert.ok(setback);
  assert.equal(setback.page, 126);
  assert.equal(setback.passage, 'Le retrait* est au moins égal à 4 mètres.');

  const footprint = find((r) => r.kind === 'footprint_ratio' && r.statement === 'not_regulated');
  assert.ok(footprint);
  assert.equal(footprint.page, 128);
  assert.match(footprint.passage, /n'est pas réglementée/u);

  // The draft expected `height_facade` `see_graphic`; this model returned the
  // footprint's « figure aux documents graphiques » instead (the Outcome says so).
  const graphic = find((r) => r.statement === 'see_graphic');
  assert.ok(graphic);
  assert.equal(graphic.kind, 'footprint_ratio');
  assert.ok(graphic.page >= 121 && graphic.page <= 144);

  const relative = find((r) => r.limit?.kind === 'height_relative');
  assert.deepEqual(relative.limit, { kind: 'height_relative', reference: 'facade_height', factor: 1, offsetMetres: -4, minimumMetres: 2 });
  assert.equal(relative.sector, 'UCe1a');
});

test('every recorded rule has a page in the chapter and a passage that is the chapter\'s own text', () => {
  const lyon = loadRegulation('lyon');
  const pages = [];
  for (let page = 121; page <= 144; page += 1) pages.push({ page, text: lyon.pages[page - 1] });
  const prepared = prepareChapter(pages);
  for (const r of result.rules) {
    assert.ok(r.page >= 121 && r.page <= 144, r.passage);
    assert.equal(prepared.text.slice(r.offset.start, r.offset.end), r.passage);
  }
});

test('replaying the recorded 096.7 answers through the pipeline gives the recorded result', async () => {
  const lyon = loadRegulation('lyon');
  const pages = [];
  for (let page = 121; page <= 144; page += 1) pages.push({ page, text: lyon.pages[page - 1] });
  const prepared = prepareChapter(pages);
  const answers = recording.calls.filter((c) => c.response !== undefined);
  let n = 0;
  const replay = {
    async extract(request) {
      const call = answers[n];
      n += 1;
      assert.equal(request.text.length, call.request.textLength, `chunk ${call.request.chunk} is the recorded one`);
      return call.response;
    }
  };
  const out = await extractChapter({ prepared, ai: replay, chunkChars: 8000, maxItems: 30 });
  assert.equal(n, answers.length);
  assert.deepEqual(out.rules, result.rules);
  assert.deepEqual(out.dropped, result.dropped);
  assert.deepEqual(out.model, result.model);
});

test('the recording holds no key and no chunk text in its request metadata', () => {
  for (const call of recording.calls) {
    assert.deepEqual(Object.keys(call.request).sort(), ['aiServiceUrl', 'attempt', 'base', 'chunk', 'textLength']);
  }
  assert.ok(!/api[_-]?key|authorization|bearer/iu.test(JSON.stringify(recording)));
});
