/**
 * The extraction pipeline (Sprint 002.5b DEC-4 to DEC-7) against a fake of
 * 096.7's route, on Lyon's recorded UCe1 chapter and on small synthetic ones.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AiError, createAiClient } from '../src/ai-client.mjs';
import {
  INSTRUCTIONS,
  ITEM_SCHEMA,
  MAX_CHUNK_CHARS,
  coherent,
  comparisonAgrees,
  extractChapter,
  splitChunks
} from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import { failing, fakeAi, rule } from './ai-fake.mjs';
import { FIXTURES, loadRegulation } from './helpers.mjs';

function lyonChapter() {
  const lyon = loadRegulation('lyon');
  const pages = [];
  for (let page = 121; page <= 144; page += 1) pages.push({ page, text: lyon.pages[page - 1] });
  return prepareChapter(pages);
}

const PAD = 'Les dispositions du présent article s’appliquent aux constructions nouvelles et aux extensions.';

/** Two pages: the same sentence under « a. Dans le secteur UCe1a » (p. 10) and « b. Dans le secteur UCe1b » (p. 11). */
function twoSectors() {
  return prepareChapter([
    {
      page: 10,
      text: [
        '2.2 - Implantation par rapport aux limites séparatives',
        PAD,
        PAD,
        'a. Dans le secteur UCe1a',
        'Le retrait* est au moins égal à 4 mètres.',
        PAD
      ].join('\n')
    },
    {
      page: 11,
      text: [
        '2.3 - Implantation des constructions les unes par rapport aux autres',
        PAD,
        PAD,
        'b. Dans le secteur UCe1b',
        'Le retrait* est au moins égal à 4 mètres.',
        PAD
      ].join('\n')
    }
  ]);
}

const setback = (sector, fields = {}) =>
  rule({
    kind: 'boundary_setback',
    sector,
    statement: 'limit',
    limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' },
    ...fields
  });

// Chunks -------------------------------------------------------------------------

test('Lyon UCe1 is sent as two chunks of at most 40 000 characters, cut at article headings', async () => {
  const prepared = lyonChapter();
  const chunks = splitChunks(prepared);
  assert.equal(chunks.length, 2);
  for (const c of chunks) assert.ok(c.text.length <= MAX_CHUNK_CHARS);
  assert.equal(chunks[0].text + chunks[1].text, prepared.text, 'nothing lost, nothing repeated');
  assert.ok(prepared.articles.some((a) => a.offset === chunks[1].base), 'the second starts at a heading');

  const quote = 'Le retrait* est au moins égal à 4 mètres';
  const ai = fakeAi({
    plan: (text) => (text.includes(quote) ? [{ value: setback('UCe1b'), passage: `${quote}.` }] : [])
  });
  const out = await extractChapter({ prepared, ai, maxTextLength: 200_000 });
  assert.equal(ai.calls.length, 2, 'one call per chunk');
  assert.deepEqual(ai.calls.map((c) => c.text.length), chunks.map((c) => c.text.length));
  assert.equal(out.rules.length, 1);
  const [r] = out.rules;
  assert.equal(r.page, 126, '096.7 offsets mapped back to the chapter, then to a page');
  assert.equal(r.article, '2.2.1.2');
  assert.equal(prepared.text.slice(r.offset.start, r.offset.end), `${quote}.`);
  assert.deepEqual(out.chunks, { of: 2, failed: 0 });
});

test('chunks never exceed the route\'s advertised maxTextLength', () => {
  const prepared = lyonChapter();
  const chunks = splitChunks(prepared, 15_000);
  assert.ok(chunks.length >= 4);
  for (const c of chunks) assert.ok(c.text.length <= 15_000);
});

test('each request carries only 096.7\'s fields, and the schema and instructions of this version', async () => {
  const ai = fakeAi();
  await extractChapter({ prepared: twoSectors(), ai });
  assert.deepEqual(Object.keys(ai.calls[0]).sort(), ['instructions', 'itemSchema', 'maxItems', 'text']);
  assert.equal(ai.calls[0].instructions, INSTRUCTIONS);
  assert.deepEqual(ai.calls[0].itemSchema, ITEM_SCHEMA);
});

// Occurrence (DEC-5) ----------------------------------------------------------------------

test('a passage under both sector headings takes the occurrence of its sector', async () => {
  const prepared = twoSectors();
  const ai = fakeAi({ plan: () => [{ value: setback('UCe1b'), passage: 'Le retrait* est au moins égal à 4 mètres.' }] });
  const [r] = (await extractChapter({ prepared, ai })).rules;
  assert.equal(r.page, 11);
  assert.equal(r.article, '2.3');
  assert.deepEqual(r.occurrence, { of: 2, chosenBy: 'sector-heading' });
  assert.equal(r.confidence, 'high');
});

test('with no sector, the first occurrence, at low confidence', async () => {
  const ai = fakeAi({ plan: () => [{ value: setback(null), passage: 'Le retrait* est au moins égal à 4 mètres.' }] });
  const [r] = (await extractChapter({ prepared: twoSectors(), ai })).rules;
  assert.equal(r.page, 10);
  assert.deepEqual(r.occurrence, { of: 2, chosenBy: 'first' });
  assert.equal(r.confidence, 'low');
});

// Conditions (DEC-6) -----------------------------------------------------------------------

test('conditions: verbatim kept, paraphrased dropped, another sector\'s heading outside the window dropped', async () => {
  const ai = fakeAi({
    plan: () => [
      {
        value: setback('UCe1b', {
          conditions: ['Dans le secteur UCe1b', 'Dans le sous-secteur B', 'Dans le secteur UCe1a'],
          exceptions: ['sauf les annexes']
        }),
        passage: 'Le retrait* est au moins égal à 4 mètres.'
      }
    ]
  });
  const out = await extractChapter({ prepared: twoSectors(), ai });
  const [r] = out.rules;
  assert.deepEqual(r.conditions, ['Dans le secteur UCe1b']);
  assert.deepEqual(r.exceptions, []);
  assert.equal(out.dropped.conditionNotVerbatim, 3);
});

// Coherence (DEC-6) -------------------------------------------------------------------------

test('coherence: a limit statement without a limit, not_regulated with one, a height in m2 are dropped', async () => {
  const passage = 'Le retrait* est au moins égal à 4 mètres.';
  const ai = fakeAi({
    plan: () => [
      { value: setback('UCe1b', { statement: 'limit', limit: null }), passage },
      { value: setback('UCe1b', { statement: 'not_regulated' }), passage },
      {
        value: rule({ kind: 'height_total', statement: 'limit', limit: { kind: 'value', comparison: 'max', value: 4, unit: 'm2' } }),
        passage
      },
      { value: setback('UCe1b', { limit: { kind: 'value', comparison: 'max', value: 4, unit: 'm' } }), passage }
    ]
  });
  const out = await extractChapter({ prepared: twoSectors(), ai });
  assert.equal(out.dropped.incoherent, 3);
  assert.equal(out.rules.length, 1);
  assert.equal(out.rules[0].limit.comparison, 'max');
  assert.equal(out.rules[0].confidence, 'low', 'a setback is a floor: max is kept, and lowered');
});

test('coherence table', () => {
  const v = (kind, limit, statement = 'limit') => ({ kind, statement, limit });
  assert.equal(coherent(v('height_facade', { kind: 'height_relative', reference: 'facade_height', factor: 1, offsetMetres: -4, minimumMetres: 2 })), true);
  assert.equal(coherent(v('footprint_ratio', null, 'not_regulated')), true);
  assert.equal(coherent(v('height_facade', null, 'see_graphic')), true);
  assert.equal(coherent(v('footprint_ratio', { kind: 'value', comparison: 'max', value: 40, unit: 'percent' })), true);
  assert.equal(coherent(v('footprint_ratio', { kind: 'value', comparison: 'max', value: 40, unit: 'm' })), false);
  assert.equal(coherent(v('floor_area_max', { kind: 'ratio', comparison: 'max', percent: 30, base: 'plot_area' })), true);
  assert.equal(coherent(v('extension_max', { kind: 'value', comparison: 'max', value: 30, unit: 'percent' })), true);
  assert.equal(coherent(v('annex_max', { kind: 'value', comparison: 'max', value: 30, unit: 'percent' })), false);
  assert.equal(coherent(v('green_ratio', { kind: 'height_relative', reference: 'facade_height', factor: 1, offsetMetres: null, minimumMetres: null })), false);
  assert.equal(comparisonAgrees(v('green_ratio', { kind: 'ratio', comparison: 'min', percent: 20, base: 'plot_area' })), true);
  assert.equal(comparisonAgrees(v('height_total', { kind: 'value', comparison: 'min', value: 9, unit: 'm' })), false);
});

test('an unknown sector is kept, flagged unplaced; duplicates are one', async () => {
  const passage = 'Le retrait* est au moins égal à 4 mètres.';
  const ai = fakeAi({ plan: () => [{ value: setback('UZ9'), passage }, { value: setback('UZ9'), passage }] });
  const out = await extractChapter({ prepared: twoSectors(), ai });
  assert.equal(out.rules.length, 1);
  assert.equal(out.rules[0].sectorUnplaced, true);
});

test('096.7\'s rejections are counted by kind', async () => {
  const ai = fakeAi({
    plan: () => [
      { value: setback('UCe1b'), passage: 'Le recul est de quatre mètres au moins.' },
      { reject: 'schema-invalid' },
      { reject: 'over-limit' }
    ]
  });
  const out = await extractChapter({ prepared: twoSectors(), ai });
  assert.equal(out.dropped.passageNotFound, 1);
  assert.equal(out.dropped.schemaInvalid, 1);
  assert.equal(out.dropped.overLimit, 1);
});

// Failures, retries, constraint (DEC-4) ------------------------------------------------------

test('a failed chunk is retried once; a second failure makes the result partial', async () => {
  const prepared = lyonChapter();
  let n = 0;
  const flaky = fakeAi({
    plan: () => {
      n += 1;
      if (n === 1) throw new AiError('output_invalid', 502);
      if (n >= 3) throw new AiError('output_truncated', 502);
      return [];
    }
  });
  const out = await extractChapter({ prepared, ai: flaky });
  assert.equal(flaky.calls.length, 4, 'chunk 1: fail, retry ok; chunk 2: fail, retry fail');
  assert.deepEqual(out.chunks, { of: 2, failed: 1 });
  assert.deepEqual(out.codes, ['output_invalid', 'output_truncated', 'output_truncated']);
});

test('a code not worth retrying is not retried', async () => {
  const ai = fakeAi({ plan: failing('too_large') });
  const out = await extractChapter({ prepared: twoSectors(), ai });
  assert.equal(ai.calls.length, 1);
  assert.deepEqual(out.chunks, { of: 1, failed: 1 });
});

test('the recorded constraint is the weakest across chunks', async () => {
  const ai = fakeAi({ constraint: (n) => (n === 1 ? 'schema' : 'json') });
  const out = await extractChapter({ prepared: lyonChapter(), ai });
  assert.deepEqual(out.model, { providerId: 'lmstudio', model: 'fake-model', constraint: 'json' });
});

// The client against 096.7's wire example ----------------------------------------------------------

test('the client sends only the allowed fields and reads 096.7\'s wire example', async () => {
  const wire = JSON.parse(readFileSync(join(FIXTURES, 'ai-service/extract-wire.json'), 'utf8'));
  const sent = [];
  const client = createAiClient({
    baseUrl: 'http://ai-service:4321/',
    fetch: async (url, init) => {
      sent.push({ url, body: init.body === undefined ? undefined : JSON.parse(init.body) });
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok', defaultProviderId: 'lmstudio', contractVersion: '1.2.0', capabilities: ['images', 'structured-output'], structuredOutput: { maxTextLength: 200000, maxItems: 200 } }));
      }
      return new Response(JSON.stringify(wire.response));
    }
  });
  assert.deepEqual(await client.health(), { available: true, defaultProviderId: 'lmstudio', maxTextLength: 200000, maxItems: 200 });
  const { instructions, text, itemSchema, maxItems } = wire.request;
  const answer = await client.extract({ instructions, text, itemSchema, maxItems });
  assert.equal(sent[1].url, 'http://ai-service:4321/api/ai/extract');
  assert.deepEqual(Object.keys(sent[1].body).sort(), ['instructions', 'itemSchema', 'maxItems', 'text']);
  assert.equal(answer.items.length, 3);
  assert.equal(text.slice(answer.items[0].passage.start, answer.items[0].passage.end), answer.items[0].passage.text);
});

test('the client: an error answer is its code; no capability is unavailable; unreachable never throws on health', async () => {
  const client = createAiClient({
    baseUrl: 'http://x',
    fetch: async (url) =>
      url.endsWith('/health')
        ? new Response(JSON.stringify({ status: 'ok', defaultProviderId: 'lmstudio', capabilities: ['images'] }))
        : new Response(JSON.stringify({ error: { code: 'no_provider_configured', message: 'm' } }), { status: 503 })
  });
  assert.equal((await client.health()).available, false);
  await assert.rejects(client.extract({}), (e) => e instanceof AiError && e.code === 'no_provider_configured');
  const down = createAiClient({ baseUrl: 'http://x', fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual(await down.health(), { available: false, defaultProviderId: null });
});

// Review fixes (2026-10-20) --------------------------------------------------------------

import { normaliseText as normaliseHere } from '../src/normalise.mjs';
import { numbersIn, sectorOf, statementInPassage, valueInPassage } from '../src/extract.mjs';

test('B1: a chunk size that is not a positive integer is refused', () => {
  const prepared = twoSectors();
  for (const bad of [0, -1, NaN, 1.5, undefined]) {
    if (bad === undefined) continue;
    assert.throws(() => splitChunks(prepared, bad), RangeError);
  }
});

test('B2: a cut at a line end stays within the limit, and never splits a surrogate pair', () => {
  const text = `${'a'.repeat(100)}\n${'b'.repeat(150)}`;
  const chunks = splitChunks({ text, articles: [] }, 100);
  for (const c of chunks) assert.ok(c.text.length <= 100, `${c.text.length}`);
  assert.equal(chunks.map((c) => c.text).join(''), text);
  const emoji = `${'x'.repeat(99)}😀${'y'.repeat(50)}`;
  const parts = splitChunks({ text: emoji, articles: [] }, 100);
  assert.equal(parts.map((c) => c.text).join(''), emoji);
  for (const c of parts) assert.ok(!/[\uD800-\uDBFF]$/u.test(c.text) && !/^[\uDC00-\uDFFF]/u.test(c.text));
});

test('S1: numbers are read as the text writes them', () => {
  assert.deepEqual(numbersIn('au plus 1 500 m2, soit 1,5 fois et 4 mètres'), [1500, 1.5, 4]);
  assert.deepEqual(numbersIn('1 500'), [1500]);
  assert.equal(valueInPassage({ kind: 'value', comparison: 'min', value: 4, unit: 'm' }, 'au moins égal à 4 mètres'), true);
  assert.equal(valueInPassage({ kind: 'value', comparison: 'min', value: 5, unit: 'm' }, 'au moins égal à 4 mètres'), false);
  assert.equal(valueInPassage({ kind: 'ratio', comparison: 'min', percent: 15, base: 'plot_area' }, 'au minimum de 15%'), true);
  assert.equal(
    valueInPassage(
      { kind: 'height_relative', reference: 'facade_height', factor: 1, offsetMetres: -4, minimumMetres: 2 },
      'R ≥ Hf - 4 m, avec un minimum de 2 mètres'
    ),
    true
  );
  assert.equal(valueInPassage(null, 'anything'), true);
  assert.equal(statementInPassage('not_regulated', "n'est pas réglementée"), true);
  assert.equal(statementInPassage('not_regulated', 'ne sont pas règlementées'), true);
  assert.equal(statementInPassage('not_regulated', 'doivent être compatibles avec les orientations'), false);
  assert.equal(statementInPassage('see_graphic', 'figure aux documents graphiques'), true);
  assert.equal(statementInPassage('see_graphic', 'figure au plan'), false);
});

test('S1: a value the passage does not write is kept at low confidence and counted; a statement it does not support is dropped', async () => {
  const passage = 'Le retrait* est au moins égal à 4 mètres.';
  const ai = fakeAi({
    plan: () => [
      { value: setback('UCe1b', { limit: { kind: 'value', comparison: 'min', value: 6, unit: 'm' } }), passage },
      { value: rule({ kind: 'footprint_ratio', sector: 'UCe1b', statement: 'not_regulated' }), passage },
      { value: rule({ kind: 'height_facade', sector: 'UCe1b', statement: 'see_graphic' }), passage }
    ]
  });
  const out = await extractChapter({ prepared: twoSectors(), ai });
  assert.equal(out.rules.length, 1);
  assert.equal(out.rules[0].confidence, 'low');
  assert.equal(out.dropped.valueNotInPassage, 1);
  assert.equal(out.dropped.incoherent, 2);
});

test('S2: no comparison check for parking', () => {
  assert.equal(comparisonAgrees({ kind: 'parking', limit: { kind: 'value', comparison: 'min', value: 1, unit: 'm2' } }), true);
});

test('S3: a sector written as a word for "none" is null', async () => {
  for (const word of ['null', ' None ', 'aucun', 'N/A', '']) assert.equal(sectorOf(word), null, JSON.stringify(word));
  assert.equal(sectorOf('UCe1b'), 'UCe1b');
  const ai = fakeAi({ plan: () => [{ value: setback('null'), passage: 'Le retrait* est au moins égal à 4 mètres.' }] });
  const [r] = (await extractChapter({ prepared: twoSectors(), ai })).rules;
  assert.equal(r.sector, null);
  assert.equal(r.sectorUnplaced, false);
});

test('S4 and NITs: a rule that lost a condition is low; kept ones are the source\'s own spelling; under 4 characters is not a condition', async () => {
  const ai = fakeAi({
    plan: () => [
      {
        value: setback('UCe1b', { conditions: ['Dans  le secteur   UCe1b', 'Da'] }),
        passage: 'Le retrait* est au moins égal à 4 mètres.'
      }
    ]
  });
  const out = await extractChapter({ prepared: twoSectors(), ai });
  const [r] = out.rules;
  assert.deepEqual(r.conditions, ['Dans le secteur UCe1b'], 'the slice of the source, not the model\'s spacing');
  assert.equal(r.confidence, 'low');
  assert.equal(out.dropped.droppedConditions, 1);
  assert.equal(out.dropped.conditionNotVerbatim, 1, '« Da » is too short');
});

test('the copied normalisation answers the platform\'s vectors', () => {
  const { vectors } = JSON.parse(readFileSync(join(FIXTURES, 'ai-service/normalise-vectors.json'), 'utf8'));
  assert.ok(vectors.length >= 10);
  for (const v of vectors) {
    const here = normaliseHere(v.input);
    assert.deepEqual({ normalised: here.normalised, starts: here.starts, ends: here.ends }, { normalised: v.normalised, starts: v.starts, ends: v.ends }, JSON.stringify(v.input));
  }
});

test('B1, S6: health needs a whole maxTextLength of at least 1 000; an item without value or passage objects is malformed', async () => {
  const health = (limits) =>
    createAiClient({
      baseUrl: 'http://x',
      fetch: async () => new Response(JSON.stringify({ status: 'ok', defaultProviderId: 'p', capabilities: ['structured-output'], structuredOutput: limits }))
    }).health();
  assert.equal((await health({ maxTextLength: 999, maxItems: 10 })).available, false);
  assert.equal((await health({ maxTextLength: 1500.5, maxItems: 10 })).available, false);
  assert.equal((await health({ maxTextLength: '200000', maxItems: 10 })).available, false);
  assert.equal((await health({ maxTextLength: 1000, maxItems: 10 })).available, true);
  for (const items of [[{ value: 1, passage: {} }], [{ value: {}, passage: 'x' }], [{ value: {}, passage: { text: 'x', start: 0, end: 1 } }]]) {
    const client = createAiClient({ baseUrl: 'http://x', fetch: async () => new Response(JSON.stringify({ items })) });
    await assert.rejects(client.extract({}), (e) => e instanceof AiError && e.code === 'malformed');
  }
});
