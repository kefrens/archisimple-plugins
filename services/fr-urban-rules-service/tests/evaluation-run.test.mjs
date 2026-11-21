/**
 * Sprint 002.32, Epic 3: the runner of a reading evaluation. No model and no network but loopback: a scripted
 * AI client answers, a stub ledger stands in for the account service that records the platform meter's usage.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { scoreReading } from '../../../tools/evaluate-reading/score.mjs';
import {
  createLedgerStub,
  createReplayCache,
  estimateRun,
  formatPlan,
  loadZone,
  parseModel,
  runFileName,
  runPair,
  runPlan
} from '../../../tools/evaluate-reading/run.mjs';
import { AiError } from '../src/ai-client.mjs';
import { fakeAi } from './ai-fake.mjs';
import { FIXTURES } from './helpers.mjs';

const EVAL = join(FIXTURES, 'evaluation');

test('a model is named provider:model, with an optional @effort', () => {
  assert.deepEqual(parseModel('anthropic:claude-sonnet-5-5'), {
    providerId: 'anthropic',
    model: 'claude-sonnet-5-5',
    effort: undefined,
    label: 'anthropic:claude-sonnet-5-5'
  });
  assert.equal(parseModel('anthropic:claude-haiku-5-5@low').effort, 'low');
  assert.equal(
    parseModel('anthropic:claude-haiku-5-5@low').label,
    'anthropic:claude-haiku-5-5@low'
  );
  assert.throws(() => parseModel('claude'), /provider:model/);
});

test('a zone loads from its folder: the truth, its chapter pages (from the file the truth names) and the chapter text', () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  assert.equal(zone.id, 'pays-d-aix-uc');
  assert.equal(zone.truth.zone, 'UC');
  assert.deepEqual(
    zone.pages.map((p) => p.page),
    [153, 154, 155, 156, 157, 158, 159, 160]
  );
  assert.ok(zone.chapterText.includes('recul minimum de 4 mètres'));
  // A zone whose text file holds more pages than the chapter is cut to the chapter (Lyon's 121 to 145).
  const lyon = loadZone(join(EVAL, 'lyon-uce1'));
  assert.deepEqual([lyon.pages[0].page, lyon.pages.at(-1).page], [121, 144]);
});

test('the dry run counts the chunks and estimates the cost per model, from the measured ratios, and says so', () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const models = ['anthropic:claude-sonnet-5-5', 'anthropic:claude-haiku-5-5'].map(parseModel);
  const plan = estimateRun({ zones: [zone], models });
  assert.equal(plan.pairs.length, 2);
  for (const pair of plan.pairs) {
    assert.ok(pair.chunks >= 1);
    assert.ok(pair.inputTokens > 2000 && pair.outputTokens > 0);
    assert.ok(pair.costMicrousd > 0);
  }
  const [sonnet, haiku] = plan.pairs;
  assert.ok(
    sonnet.costMicrousd > haiku.costMicrousd * 5,
    'Sonnet is several times dearer than Haiku'
  );
  assert.equal(plan.totalMicrousd, sonnet.costMicrousd + haiku.costMicrousd);
  const text = formatPlan(plan);
  assert.match(text, /estimate/i);
  assert.match(text, /pays-d-aix-uc/);
  assert.match(text, /--confirm/);
  assert.match(text, /\$0\.\d\d/);
});

test("a model with no price in the runner's table is refused in the plan, not guessed", () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  assert.throws(
    () => estimateRun({ zones: [zone], models: [parseModel('anthropic:claude-unknown')] }),
    /price/i
  );
});

test("the stub ledger records the platform meter's settlements, behind its bearer token, and answers as the account service does", async () => {
  const ledger = createLedgerStub({ token: 'secret' });
  const port = await ledger.listen(0);
  const url = `http://127.0.0.1:${port}/internal/ai/step`;
  const entry = {
    callSeq: 1,
    kind: 'extract',
    providerId: 'anthropic',
    model: 'claude-sonnet-5-5',
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicrousd: 4000,
    listed: true,
    estimated: false
  };
  const refused = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
    body: JSON.stringify({ runId: 'r', settle: entry })
  });
  assert.equal(refused.status, 401);
  const ok = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ runId: 'r', settle: entry })
  });
  assert.equal(ok.status, 200);
  const answer = await ok.json();
  assert.equal(answer.ok, true);
  assert.equal(answer.limited, false);
  // A hold or a probe with nothing to settle is answered and records nothing.
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ runId: 'r', next: { callId: '2', microusd: 100, ttlSeconds: 60 } })
  });
  assert.equal(ledger.entries().length, 1);
  assert.equal(ledger.entries()[0].model, 'claude-sonnet-5-5');
  await ledger.close();
});

/** A scripted « model » that answers each chunk with the truth's rules whose quote is in it. */
function answeringTruth(zone, ledger, cost = 5000) {
  const squash = (t) => t.replace(/\s+/g, ' ');
  const plan = (text) =>
    zone.truth.rules
      .filter((r) => squash(text).includes(squash(r.quote)))
      .map((r) => ({
        value: {
          kind: r.kind,
          sector: r.sector,
          statement: r.statement,
          limit: r.limit,
          strip: null,
          conditions: [],
          exceptions: [],
          confidence: 'high'
        },
        passage: r.quote
      }));
  const ai = fakeAi({ plan, providerId: 'anthropic', model: 'scripted' });
  const extract = ai.extract.bind(ai);
  ai.extract = async (request, route) => {
    const answer = await extract(request, route);
    ledger.record({
      callSeq: ai.calls.length,
      kind: 'extract',
      providerId: 'anthropic',
      model: 'scripted',
      inputTokens: 3000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costMicrousd: cost,
      listed: true,
      estimated: false
    });
    return answer;
  };
  return ai;
}

test("a run through the real extraction with a scripted model gives a result that scores against the truth, with the ledger's usage", async () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const ledger = createLedgerStub({ token: 't' });
  const ai = answeringTruth(zone, ledger);
  const run = await runPair({ zone, model: parseModel('anthropic:scripted'), ai, ledger });
  assert.equal(run.zoneId, 'pays-d-aix-uc');
  assert.ok(
    run.result.rules.length > 0,
    "the scripted answers were taken through the extraction's checks"
  );
  assert.equal(run.usage.calls, ai.calls.length);
  assert.equal(run.usage.inputTokens, 3000 * ai.calls.length);
  assert.equal(run.usage.costMicrousd, 5000 * ai.calls.length);
  const score = scoreReading({
    truth: zone.truth,
    result: run.result,
    chapterText: zone.chapterText
  });
  assert.ok(
    score.recall > 0.5,
    `the scripted model found most of the truth (recall ${score.recall})`
  );
  assert.equal(ai.routes[0].providerId, 'anthropic');
  assert.equal(ai.routes[0].model, 'scripted');
});

test('a plan stops at the spend ceiling with what it has, and a finished pair is not run again', async () => {
  const zones = ['pays-d-aix-uc', 'gordes-a'].map((id) => loadZone(join(EVAL, id)));
  const ledger = createLedgerStub({ token: 't' });
  const done = new Map();
  const seen = [];
  const plan = estimateRun({
    zones,
    models: [parseModel('anthropic:scripted-a'), parseModel('anthropic:scripted-b')].map((m) => ({
      ...m
    })),
    prices: {
      'anthropic:scripted-a': { inMicroPerMTok: 1e6, outMicroPerMTok: 1e6, outRatio: 0.3 },
      'anthropic:scripted-b': { inMicroPerMTok: 1e6, outMicroPerMTok: 1e6, outRatio: 0.3 }
    }
  });
  assert.equal(plan.pairs.length, 4);
  const outcome = await runPlan({
    plan,
    aiFor: (zone) => answeringTruth(zone, ledger, 6_000_000),
    ledger,
    maxSpendMicrousd: 10_000_000,
    finished: done,
    onPair: (pair, run) => {
      seen.push(`${pair.zoneId}|${pair.model.label}`);
      done.set(`${pair.zoneId}|${pair.model.label}`, run);
    }
  });
  // Each pair costs 6 USD per call; the ceiling is 10: the first pair runs, the second runs (6 < 10 before it), the third is refused.
  assert.ok(outcome.stopped, 'it stopped at the ceiling');
  assert.match(outcome.stopped.reason, /spend/i);
  assert.ok(seen.length >= 1 && seen.length < 4);
  // Resumed with the finished pairs: they are skipped.
  const again = await runPlan({
    plan,
    aiFor: (zone) => answeringTruth(zone, ledger, 1),
    ledger,
    maxSpendMicrousd: 1e12,
    finished: done,
    onPair: (pair) => seen.push(`again:${pair.zoneId}|${pair.model.label}`)
  });
  assert.equal(again.skipped, seen.filter((s) => !s.startsWith('again:')).length);
});

// ── The report's tables, from saved runs ────────────────────────────────────────────────────────────

test('the report tables are built from saved runs: per zone and model, overall per model, and a CSV', async () => {
  const { csvOf, overallTable, perZoneTable } =
    await import('../../../tools/evaluate-reading/report.mjs');
  const run = (zoneId, model, truth, found, wrong, extra, cost) => ({
    zoneId,
    model,
    validated: true,
    validatedBy: 'owner',
    usage: { calls: 1, inputTokens: 1000, outputTokens: 500, costMicrousd: cost },
    seconds: 10,
    score: {
      counts: {
        truth,
        found,
        exact: found,
        sectorError: 0,
        wrongValue: wrong,
        missed: truth - found - wrong,
        extra,
        duplicates: 0,
        outOfScope: 0
      },
      recall: found / truth,
      verified: 1,
      figureCoverage: { covered: 1, total: 2, uncovered: [] },
      repeats: { acrossSectors: 0, exact: 0 }
    }
  });
  const runs = [
    run('a', 'anthropic:m1', 10, 8, 1, 2, 50_000),
    run('b', 'anthropic:m1', 20, 10, 0, 1, 70_000),
    run('a', 'anthropic:m2', 10, 5, 0, 0, 2_000)
  ];
  const zone = perZoneTable(runs);
  assert.match(zone, /\| a \| anthropic:m1 \| 8 \/ 10 \|/);
  assert.match(zone, /\$0\.050/);
  const overall = overallTable(runs);
  // m1: 18 of 30 found over two zones, $0.120; m2: 5 of 10, $0.002.
  assert.match(overall, /\| anthropic:m1 \| 18 \/ 30 \| 60% \|/);
  assert.match(overall, /\$0\.120/);
  assert.match(overall, /\| anthropic:m2 \| 5 \/ 10 \| 50% \|/);
  const csv = csvOf(runs);
  assert.equal(
    csv.split('\n')[0],
    'zone,model,validatedBy,truth,found,exact,sectorError,wrongValue,missed,extra,duplicates,outOfScope,recall,verified,figureCovered,figureTotal,repeatsAcrossSectors,calls,inputTokens,outputTokens,costUsd,seconds'
  );
  assert.equal(csv.split('\n').length, 4);
});

test('a run sends the reading the service ships (sectors expanded by the code); the previous variant sends the earlier instructions', async () => {
  const { INSTRUCTIONS, INSTRUCTIONS_SECTORS_IN_CODE } = await import('../src/extract.mjs');
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const ledger = createLedgerStub({ token: 't' });
  const shipped = fakeAi({ plan: () => [] });
  const first = await runPair({
    zone,
    model: parseModel('anthropic:scripted'),
    ai: shipped,
    ledger,
    waitMs: 0
  });
  assert.ok(shipped.calls[0].instructions.startsWith(INSTRUCTIONS_SECTORS_IN_CODE));
  assert.equal(first.variant, 'shipped');
  const previous = fakeAi({ plan: () => [] });
  const second = await runPair({
    zone,
    model: parseModel('anthropic:scripted'),
    ai: previous,
    ledger,
    waitMs: 0,
    variant: 'previous'
  });
  assert.equal(previous.calls[0].instructions, INSTRUCTIONS);
  assert.equal(second.variant, 'previous');
});

test('the variation table shows each repetition, the mean and the range of the rules found, per zone and model', async () => {
  const { variationTable } = await import('../../../tools/evaluate-reading/report.mjs');
  const run = (repeat, found) => ({
    zoneId: 'z',
    model: 'anthropic:m',
    repeat,
    score: {
      counts: { truth: 10, found, wrongValue: 0, sectorError: found === 6 ? 2 : 0, extra: 1 }
    }
  });
  const table = variationTable([run('r2', 6), run('r1', 8), run('r3', 7)]);
  // Repetitions in order r1, r2, r3: 8, 6, 7 of 10; mean 7.0 (70%); range 2; the sector errors of r2 show.
  assert.match(
    table,
    /\| z \| anthropic:m \| 8, 6, 7 \/ 10 \| 7\.0 \(70%\) \| 2 \| 0, 0, 0 \| 0, 2, 0 \| 1, 1, 1 \|/
  );
});

// ── Sprint 002.34, Epic 2: what the model said is kept, and can be replayed ───────────────────

test("a run keeps the model's raw answers (each item and its passage text), so a miss can be explained", async () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const ledger = createLedgerStub({ token: 't' });
  const ai = answeringTruth(zone, ledger);
  const run = await runPair({ zone, model: parseModel('anthropic:scripted'), ai, ledger });
  assert.equal(run.raw.length, ai.calls.length, 'one entry per answered chunk');
  const items = run.raw.flatMap((answer) => answer.items);
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => typeof i.passage === 'string' && i.value.kind !== undefined));
  assert.ok(
    items.every((i) => i.value.appliesTo !== undefined),
    'the items as the shipped reading asks them'
  );
  assert.ok(Array.isArray(run.raw[0].rejected));
});

test('with a replay cache the second run asks the model nothing, gives the same rules, and says it was replayed', async () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const ledger = createLedgerStub({ token: 't' });
  const cache = createReplayCache();
  const first = await runPair({
    zone,
    model: parseModel('anthropic:scripted'),
    ai: answeringTruth(zone, ledger),
    ledger,
    waitMs: 0,
    cache
  });
  assert.equal(first.usage.replayedChunks, 0);
  const again = answeringTruth(zone, ledger);
  const second = await runPair({
    zone,
    model: parseModel('anthropic:scripted'),
    ai: again,
    ledger,
    waitMs: 0,
    cache
  });
  assert.equal(again.calls.length, 0, 'every chunk came from the cache');
  assert.deepEqual(second.result.rules, first.result.rules);
  assert.equal(second.usage.replayedChunks, first.usage.calls);
  assert.equal(second.usage.costMicrousd, 0, 'a replay costs nothing and says so');
  assert.deepEqual(second.raw, first.raw, 'the replay keeps the raw answers too');
});

test('the cache is keyed by the model, the variant and the instructions: another one is asked again', async () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const ledger = createLedgerStub({ token: 't' });
  const cache = createReplayCache();
  const run = (model, variant) => {
    const ai = fakeAi({ plan: () => [] });
    return runPair({ zone, model: parseModel(model), ai, ledger, waitMs: 0, cache, variant }).then(
      () => ai.calls.length
    );
  };
  assert.ok((await run('anthropic:a')) > 0);
  assert.equal(await run('anthropic:a'), 0, 'the same model and variant is replayed');
  assert.ok((await run('anthropic:b')) > 0, 'another model is asked');
  assert.ok((await run('anthropic:a', 'previous')) > 0, 'the earlier reading is asked');
  assert.ok((await run('anthropic:a@low')) > 0, 'another effort is asked');
});

test('a cache in a folder survives the process: a second cache over the same folder replays', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'replay-'));
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const ledger = createLedgerStub({ token: 't' });
  await runPair({
    zone,
    model: parseModel('anthropic:a'),
    ai: fakeAi({ plan: () => [] }),
    ledger,
    waitMs: 0,
    cache: createReplayCache(dir)
  });
  const ai = fakeAi({ plan: () => [] });
  await runPair({
    zone,
    model: parseModel('anthropic:a'),
    ai,
    ledger,
    waitMs: 0,
    cache: createReplayCache(dir)
  });
  assert.equal(ai.calls.length, 0);
});

// ── Sprint 002.40: a pair whose chunk failed is not a reading ───────────────────────────────────

test('a pair whose call failed is incomplete: it says so and is filed apart, never as a finished reading', async () => {
  const zone = loadZone(join(EVAL, 'pays-d-aix-uc'));
  const ledger = createLedgerStub({ token: 't' });
  const failing = fakeAi({
    plan: () => {
      throw new AiError('provider_error', 502);
    }
  });
  const run = await runPair({
    zone,
    model: parseModel('anthropic:scripted'),
    ai: failing,
    ledger,
    waitMs: 0
  });
  assert.equal(run.incomplete, true);
  assert.ok(run.result.chunks.failed > 0);
  assert.equal(run.result.rules.length, 0);
  const pair = { zoneId: zone.id, model: parseModel('anthropic:scripted') };
  assert.equal(runFileName(pair, run), 'pays-d-aix-uc__anthropic_scripted.incomplete.json');

  const fine = await runPair({
    zone,
    model: parseModel('anthropic:scripted'),
    ai: answeringTruth(zone, ledger),
    ledger,
    waitMs: 0
  });
  assert.equal(fine.incomplete, false);
  assert.equal(runFileName(pair, fine), 'pays-d-aix-uc__anthropic_scripted.json');
});
