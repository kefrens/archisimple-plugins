/**
 * Sprint 002.33: the sectors of a sentence are expanded in code, not by the model. The model says where a rule
 * applies (`appliesTo`: the zone, all of it, or a list of sector codes); the code gives one item per sector and
 * each goes through the existing verification. Behind an option: the reading as it ships is unchanged.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadZone } from '../../../tools/evaluate-reading/run.mjs';
import {
  INSTRUCTIONS,
  INSTRUCTIONS_SECTORS_IN_CODE,
  ITEM_SCHEMA,
  ITEM_SCHEMA_SECTORS_IN_CODE,
  expandAppliesTo,
  extractChapter,
  sectorsOfChapter
} from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import { fakeAi } from './ai-fake.mjs';
import { FIXTURES } from './helpers.mjs';

const EVAL = join(FIXTURES, 'evaluation');
const prepared = (id) => prepareChapter(loadZone(join(EVAL, id)).pages);

// ── What the code knows of the chapter's sectors ───────────────────────────────────────────────

test('the zone and its sectors are read from the chapter: UD has four sectors that no heading names', () => {
  assert.deepEqual(sectorsOfChapter(prepared('pays-d-aix-ud')), {
    zone: 'UD',
    sectors: ['UDa', 'UDa1', 'UDa2', 'UDb']
  });
});

test('a chapter with no sector has none; a stray capitalised word is not a sector', () => {
  assert.deepEqual(sectorsOfChapter(prepared('pays-d-aix-uc')), { zone: 'UC', sectors: [] });
});

test("Lyon's two sectors, and Gordes' station sector", () => {
  const lyon = sectorsOfChapter(prepared('lyon-uce1'));
  assert.deepEqual(lyon.sectors, ['UCe1a', 'UCe1b']);
  assert.equal(lyon.zone, 'UCe1');
  assert.deepEqual(sectorsOfChapter(prepared('gordes-a')), { zone: 'A', sectors: ['Ast'] });
});

// ── Expanding what the model said ──────────────────────────────────────────────────────────────

const info = { zone: 'UD', sectors: ['UDa', 'UDa1', 'UDa2', 'UDb'] };

test('"zone" is the zone\'s own rule; "all" is the zone and every sector; a list is its codes, the zone\'s own code being the zone', () => {
  assert.deepEqual(expandAppliesTo('zone', info), { sectors: [null] });
  assert.deepEqual(expandAppliesTo('all', info), { sectors: [null, 'UDa', 'UDa1', 'UDa2', 'UDb'] });
  assert.deepEqual(expandAppliesTo(['UDa', 'UDa2'], info), { sectors: ['UDa', 'UDa2'] });
  assert.deepEqual(
    expandAppliesTo(['UD', 'UDa1'], info),
    { sectors: [null, 'UDa1'] },
    "the zone's own code is the whole zone"
  );
  assert.deepEqual(
    expandAppliesTo(['uda', 'UDA1'], info),
    { sectors: ['UDa', 'UDa1'] },
    'the code as the chapter spells it'
  );
});

test('a list is deduplicated, an unknown code is refused with its reason, and "all" on a chapter with no sector is the zone', () => {
  assert.deepEqual(expandAppliesTo(['UDa', 'UDa'], info), { sectors: ['UDa'] });
  assert.deepEqual(expandAppliesTo(['UDa', 'UDz'], info), { sectors: ['UDa'], unknown: ['UDz'] });
  assert.deepEqual(expandAppliesTo('all', { zone: 'UC', sectors: [] }), { sectors: [null] });
  assert.deepEqual(expandAppliesTo(['UCx'], { zone: 'UC', sectors: [] }), {
    sectors: [],
    unknown: ['UCx']
  });
  assert.deepEqual(
    expandAppliesTo(undefined, info),
    { sectors: [], unknown: [] },
    'an item that says nothing is refused, not guessed'
  );
  assert.deepEqual(expandAppliesTo([], info), { sectors: [], unknown: [] });
});

// ── The prompt and the schema ──────────────────────────────────────────────────────────────────

test('the new schema asks where a rule applies and no longer asks for a sector; the shipped one is untouched', () => {
  assert.ok('sector' in ITEM_SCHEMA.properties && ITEM_SCHEMA.required.includes('sector'));
  assert.ok(!('sector' in ITEM_SCHEMA_SECTORS_IN_CODE.properties));
  assert.ok(
    'appliesTo' in ITEM_SCHEMA_SECTORS_IN_CODE.properties &&
      ITEM_SCHEMA_SECTORS_IN_CODE.required.includes('appliesTo')
  );
  assert.match(INSTRUCTIONS_SECTORS_IN_CODE, /never repeat an item for each sector/i);
  assert.ok(!/one item per rule and per sector/.test(INSTRUCTIONS_SECTORS_IN_CODE));
  assert.match(INSTRUCTIONS, /one item per rule and per sector/);
});

// ── The reading ────────────────────────────────────────────────────────────────────────────────

const udPrepared = () => prepared('pays-d-aix-ud');
const item = (appliesTo, extra = {}) => ({
  kind: 'building_distance',
  appliesTo,
  statement: 'not_regulated',
  limit: null,
  strip: null,
  conditions: [],
  exceptions: [],
  confidence: 'high',
  ...extra
});

test('with the option, one answer item for four sectors gives four rules, each placed and verified on the same passage', async () => {
  const ai = fakeAi({
    plan: () => [{ value: item(['UD', 'UDa', 'UDa1', 'UDa2']), passage: 'Non réglementée.' }]
  });
  const result = await extractChapter({ prepared: udPrepared(), ai, sectorsInCode: true });
  const mine = result.rules.filter((r) => r.kind === 'building_distance');
  assert.deepEqual(
    mine.map((r) => r.sector).sort((a, b) => String(a).localeCompare(String(b))),
    [null, 'UDa', 'UDa1', 'UDa2']
  );
  assert.ok(
    mine.every(
      (r) => r.statement === 'not_regulated' && r.page === 176 && r.passage === 'Non réglementée.'
    )
  );
  assert.ok(
    ai.calls[0].instructions.startsWith(INSTRUCTIONS_SECTORS_IN_CODE),
    'the new instructions were sent'
  );
  assert.match(ai.calls[0].instructions, /Zone: UD\. Sectors of this zone: UDa, UDa1, UDa2, UDb\./);
  assert.deepEqual(ai.calls[0].itemSchema, ITEM_SCHEMA_SECTORS_IN_CODE);
});

test('"all" gives the zone and every sector; an unknown code is counted and never repaired', async () => {
  const ai = fakeAi({
    plan: () => [
      { value: item('all'), passage: 'Non réglementée.' },
      {
        value: item(['UDz'], { kind: 'footprint_ratio', statement: 'see_graphic' }),
        passage: 'L’emprise au sol* des constructions ne pourra excéder'
      }
    ]
  });
  const result = await extractChapter({ prepared: udPrepared(), ai, sectorsInCode: true });
  assert.equal(result.rules.filter((r) => r.kind === 'building_distance').length, 5);
  assert.equal(result.rules.filter((r) => r.kind === 'footprint_ratio').length, 0);
  assert.equal(result.dropped.unknownSector, 1);
});

test('without the option the reading is as it was: the shipped instructions and schema, a single sector per item', async () => {
  const ai = fakeAi({
    plan: () => [
      {
        value: { ...item('zone'), appliesTo: undefined, sector: 'UDa' },
        passage: 'Non réglementée.'
      }
    ]
  });
  const result = await extractChapter({ prepared: udPrepared(), ai });
  assert.equal(ai.calls[0].instructions, INSTRUCTIONS);
  assert.deepEqual(ai.calls[0].itemSchema, ITEM_SCHEMA);
  assert.deepEqual(
    result.rules.filter((r) => r.kind === 'building_distance').map((r) => r.sector),
    ['UDa']
  );
});

test('a chunk memoised under one variant is not served to the other', async () => {
  const stored = new Map();
  const memo = { get: (k) => stored.get(k), set: (k, v) => stored.set(k, v) };
  const ai = fakeAi({ plan: () => [] });
  await extractChapter({ prepared: udPrepared(), ai, memo });
  await extractChapter({ prepared: udPrepared(), ai, memo, sectorsInCode: true });
  assert.equal(ai.calls.length, 2, 'the second variant asked the model again');
});
