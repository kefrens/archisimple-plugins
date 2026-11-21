/**
 * Sprint 002.37: a block of reading guidance appended to the instructions, behind an option and a harness variant.
 * The reading as it ships is unchanged.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createLedgerStub,
  createReplayCache,
  loadZone,
  parseModel,
  runPair
} from '../../../tools/evaluate-reading/run.mjs';
import {
  GUIDANCE,
  INSTRUCTIONS,
  INSTRUCTIONS_SECTORS_IN_CODE,
  extractChapter,
  instructionsFor
} from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import { fakeAi } from './ai-fake.mjs';
import { FIXTURES } from './helpers.mjs';

const EVAL = join(FIXTURES, 'evaluation');

test('the guidance names the cases it is for, in its own block, and the shipped instructions do not hold it', () => {
  for (const word of ['limits', 'permitted uses', 'tables', 'strip', 'graphic', 'sectors'])
    assert.match(GUIDANCE, new RegExp(`^${word} — `, 'mu'), word);
  assert.ok(!INSTRUCTIONS.includes(GUIDANCE));
  assert.ok(!INSTRUCTIONS_SECTORS_IN_CODE.includes(GUIDANCE));
});

test('Sprint 002.43: the guidance holds no line about floor-area typing (tried as prompt 6, measured negative)', () => {
  assert.ok(!/floor_area_max/.test(GUIDANCE));
});

test('instructionsFor: the instructions of each reading, the guidance after them when asked', () => {
  assert.equal(instructionsFor({ sectorsInCode: false }), INSTRUCTIONS);
  assert.equal(instructionsFor({ sectorsInCode: true }), INSTRUCTIONS_SECTORS_IN_CODE);
  assert.equal(
    instructionsFor({ sectorsInCode: true, guidance: true }),
    `${INSTRUCTIONS_SECTORS_IN_CODE}\n${GUIDANCE}`
  );
  assert.equal(
    instructionsFor({ sectorsInCode: false, guidance: true }),
    `${INSTRUCTIONS}\n${GUIDANCE}`
  );
});

const chapter = () => prepareChapter(loadZone(join(EVAL, 'pays-d-aix-uc')).pages);

test('extractChapter sends the guidance only when asked, and a chunk read one way is not served to the other', async () => {
  const stored = new Map();
  const memo = { get: (k) => stored.get(k), set: (k, v) => stored.set(k, v) };
  const plain = fakeAi({ plan: () => [] });
  await extractChapter({ prepared: chapter(), ai: plain, sectorsInCode: true, memo });
  assert.ok(!plain.calls[0].instructions.includes(GUIDANCE));
  const guided = fakeAi({ plan: () => [] });
  await extractChapter({
    prepared: chapter(),
    ai: guided,
    sectorsInCode: true,
    guidance: true,
    memo
  });
  assert.equal(guided.calls.length, plain.calls.length, 'the guided reading asked the model again');
  assert.ok(guided.calls[0].instructions.endsWith(GUIDANCE));
  assert.deepEqual(guided.calls[0].itemSchema, plain.calls[0].itemSchema, 'the schema is the same');
});

test('the harness runs the shipped reading (with the guidance) by default, and « unguided » is the prompt-4 reading; each is recorded and cached apart', async () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const ledger = createLedgerStub({ token: 't' });
  const cache = createReplayCache();
  const run = (variant) => {
    const ai = fakeAi({ plan: () => [] });
    return runPair({
      zone,
      model: parseModel('anthropic:scripted'),
      ai,
      ledger,
      waitMs: 0,
      cache,
      variant
    }).then((result) => ({ result, ai }));
  };
  const shipped = await run(undefined);
  assert.equal(shipped.result.variant, 'shipped');
  assert.ok(
    shipped.ai.calls[0].instructions.endsWith(GUIDANCE),
    'the shipped reading carries the guidance'
  );
  const unguided = await run('unguided');
  assert.equal(unguided.result.variant, 'unguided');
  assert.ok(unguided.ai.calls.length > 0, 'not served from the shipped reading’s answers');
  assert.ok(!unguided.ai.calls[0].instructions.includes(GUIDANCE));
  assert.ok(unguided.ai.calls[0].instructions.startsWith(INSTRUCTIONS_SECTORS_IN_CODE));
  const previous = await run('previous');
  assert.equal(previous.result.variant, 'previous');
  assert.ok(!previous.ai.calls[0].instructions.includes(GUIDANCE));
  assert.ok(previous.ai.calls[0].instructions.startsWith(INSTRUCTIONS));
  assert.equal((await run(undefined)).ai.calls.length, 0, 'the shipped reading replays too');
});
