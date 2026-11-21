/**
 * Sprint 002.39, Epic 1: merging several reads of one chapter. The same rule quoted with another cut (the passages
 * overlap in the chapter's text) is one rule, kept with the longer passage and an agreement count; a rule one read
 * alone gave is kept, with agreement 1. Pure, no model.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeReads } from '../../../tools/evaluate-reading/merge.mjs';

const limit = (value, comparison = 'max', unit = 'm') => ({
  kind: 'value',
  comparison,
  value,
  unit
});
const rule = (start, end, fields = {}) => ({
  kind: 'building_distance',
  sector: null,
  statement: 'limit',
  limit: limit(6, 'min'),
  page: 3,
  article: '4.2',
  passage: `passage ${start}-${end}`,
  offset: { start, end },
  occurrence: { of: 1, chosenBy: 'only' },
  conditions: [],
  exceptions: [],
  sectorUnplaced: false,
  confidence: 'high',
  ...fields
});

test('a single read is returned as it is, each rule with agreement 1', () => {
  const read = [rule(100, 180), rule(300, 360, { kind: 'height_total', limit: limit(9) })];
  const merged = mergeReads([read]);
  assert.equal(merged.length, 2);
  assert.ok(merged.every((r) => r.agreement === 1));
  assert.deepEqual(
    merged.map(({ agreement: _a, readers: _r, ...rest }) => rest),
    read
  );
});

test('the same rule quoted with another cut is one rule: the longer passage, agreement 2', () => {
  const merged = mergeReads([[rule(100, 160)], [rule(100, 200)]]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].offset, { start: 100, end: 200 });
  assert.equal(merged[0].passage, 'passage 100-200');
  assert.equal(merged[0].agreement, 2);
  assert.deepEqual(merged[0].readers, [0, 1]);
});

test('the same rule in two different places of the chapter stays two rules', () => {
  const merged = mergeReads([[rule(100, 160)], [rule(900, 960)]]);
  assert.equal(merged.length, 2);
  assert.ok(merged.every((r) => r.agreement === 1));
});

test('overlapping passages of another kind, sector, statement, limit or strip are other rules', () => {
  const base = rule(100, 200);
  for (const other of [
    rule(110, 190, { kind: 'height_total' }),
    rule(110, 190, { sector: 'UDa' }),
    rule(110, 190, { statement: 'described', limit: null }),
    rule(110, 190, { limit: limit(8, 'min') }),
    rule(110, 190, { strip: { depthMetres: 4, edges: 'side_rear', permits: true } })
  ]) {
    assert.equal(mergeReads([[base], [other]]).length, 2, JSON.stringify(other).slice(0, 80));
  }
});

test('a rule one read alone gave is kept; the others keep their agreement', () => {
  const merged = mergeReads([
    [rule(100, 160), rule(500, 560, { kind: 'green_ratio', limit: limit(15, 'min', 'percent') })],
    [rule(100, 180)],
    [rule(100, 170)]
  ]);
  assert.equal(merged.length, 2);
  const [first, second] = merged;
  assert.equal(first.agreement, 3);
  assert.equal(second.agreement, 1);
  assert.deepEqual(second.readers, [0]);
});

test('two rules of one read inside one group count that read once', () => {
  const merged = mergeReads([[rule(100, 140), rule(130, 200)], [rule(120, 190)]]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].agreement, 2);
});

test('the merge keeps the best confidence and every condition and exception, once', () => {
  const merged = mergeReads([
    [rule(100, 160, { confidence: 'low', conditions: ['Dans le secteur UDa'], exceptions: [] })],
    [
      rule(100, 200, {
        confidence: 'high',
        conditions: ['Dans le secteur UDa', 'hors piscine'],
        exceptions: ['sauf annexes']
      })
    ]
  ]);
  assert.equal(merged[0].confidence, 'high');
  assert.deepEqual(merged[0].conditions, ['Dans le secteur UDa', 'hors piscine']);
  assert.deepEqual(merged[0].exceptions, ['sauf annexes']);
});

test('the result is in the chapter’s order, whatever the order of the reads', () => {
  const a = rule(500, 560, { kind: 'green_ratio', limit: limit(15, 'min', 'percent') });
  const b = rule(100, 160);
  assert.deepEqual(
    mergeReads([[a], [b]]).map((r) => r.offset.start),
    [100, 500]
  );
});

test('no read, or a read with no rule, merges to nothing', () => {
  assert.deepEqual(mergeReads([]), []);
  assert.deepEqual(mergeReads([[], []]), []);
});
