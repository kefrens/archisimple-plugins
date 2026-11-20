/**
 * Running a reading evaluation (Sprint 002.32, Epic 3): load a zone, plan a run and say what it would cost,
 * run each zone × model through the **real** extraction, and score it with `score.mjs`.
 *
 * Nothing here calls a model on its own: `runPair` is handed an AI client, and the CLI
 * (`tools/evaluate-reading.mjs`) is the one that starts an AI service, and only behind `--confirm`.
 *
 * ## Where the tokens come from
 *
 * The AI service's extract answer carries no usage. The platform's own meter does: it posts each call's
 * settlement (tokens, cost, price version) to `ACCOUNT_USAGE_URL`. {@link createLedgerStub} is a small local
 * stand-in for that endpoint, so a run is measured by the same meter and the same price table as the product,
 * not estimated here.
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractChapter,
  MAX_CHUNK_CHARS,
  splitChunks,
  SECTORS_IN_CODE
} from '../../services/fr-urban-rules-service/src/extract.mjs';
import { prepareChapter } from '../../services/fr-urban-rules-service/src/text.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ── Models and prices ──────────────────────────────────────────────────────────

/** `provider:model` or `provider:model@effort`. */
export function parseModel(text) {
  const match = /^([a-z0-9_-]+):([^@\s]+)(?:@([a-z]+))?$/u.exec(String(text));
  if (match === null)
    throw new TypeError(
      `a model is named provider:model (optionally @effort), not ${JSON.stringify(text)}`
    );
  return { providerId: match[1], model: match[2], effort: match[3], label: String(text) };
}

/**
 * What the dry run prices a model at: micro-dollars per million tokens, and the output tokens a reading gave per
 * input token on the two chunks measured on 2026-11-20 (Sonnet 5.5: 5,480 out for 15,491 in; Haiku 5.5: 12,641
 * out for 13,541 in, thinking suspected). **An estimate**: the run itself is priced by the AI service's meter.
 * The prices are the platform's table as of 2026-11-19 (list prices, no cache, no batch).
 */
export const DEFAULT_PRICES = Object.freeze({
  'anthropic:claude-sonnet-5-5': {
    inMicroPerMTok: 2_000_000,
    outMicroPerMTok: 10_000_000,
    outRatio: 0.35
  },
  'anthropic:claude-haiku-5-5': {
    inMicroPerMTok: 100_000,
    outMicroPerMTok: 500_000,
    outRatio: 0.93
  }
});

/** The reading's fixed prompt, in tokens (the system message and the schema, about 6,300 characters). */
const INSTRUCTION_TOKENS = 2_300;
/** French règlement text, characters per token (about 3 on the chunks measured). */
const CHARS_PER_TOKEN = 3;

// ── Zones ──────────────────────────────────────────────────────────────────────

/** A zone folder: its `truth.json`, and the chapter's pages from the file the truth names. */
export function loadZone(dir) {
  const truth = JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8'));
  const textPath = truth.provenance?.text;
  if (typeof textPath !== 'string')
    throw new Error(`${dir}: the truth names no provenance.text file`);
  const file = isAbsolute(textPath) ? textPath : join(REPO, textPath);
  const raw = readFileSync(file, 'utf8');
  const all = file.endsWith('.jsonl')
    ? raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : JSON.parse(raw);
  const [from, to] = truth.chapter.pages;
  const pages = all.filter((p) => p.page >= from && p.page <= to);
  return { id: basename(dir), dir, truth, pages, chapterText: pages.map((p) => p.text).join('\n') };
}

const chunksOf = (zone) => splitChunks(prepareChapter(zone.pages), MAX_CHUNK_CHARS);

// ── The plan, and its estimate ─────────────────────────────────────────────────

export function estimateRun({ zones, models, prices = DEFAULT_PRICES }) {
  const pairs = [];
  for (const zone of zones) {
    const chunks = chunksOf(zone);
    const chars = chunks.reduce((sum, c) => sum + c.text.length, 0);
    for (const model of models) {
      const price = prices[`${model.providerId}:${model.model}`];
      if (price === undefined)
        throw new Error(
          `no price for ${model.providerId}:${model.model} in the runner's table: add it or pass prices`
        );
      const inputTokens = chunks.reduce(
        (sum, c) => sum + INSTRUCTION_TOKENS + Math.ceil(c.text.length / CHARS_PER_TOKEN),
        0
      );
      const outputTokens = Math.round(inputTokens * price.outRatio);
      const costMicrousd = Math.round(
        (inputTokens * price.inMicroPerMTok + outputTokens * price.outMicroPerMTok) / 1_000_000
      );
      pairs.push({
        zoneId: zone.id,
        zone,
        model,
        chunks: chunks.length,
        chars,
        inputTokens,
        outputTokens,
        costMicrousd
      });
    }
  }
  return { pairs, totalMicrousd: pairs.reduce((sum, p) => sum + p.costMicrousd, 0) };
}

const dollars = (micro) => `$${(micro / 1_000_000).toFixed(2)}`;

export function formatPlan(plan, { maxSpendMicrousd } = {}) {
  const lines = ['Reading evaluation — dry run (nothing has been called)', ''];
  lines.push(
    'zone'.padEnd(22) +
      'model'.padEnd(36) +
      'chunks'.padStart(7) +
      'in tokens'.padStart(11) +
      'out tokens'.padStart(12) +
      'estimate'.padStart(10)
  );
  for (const p of plan.pairs) {
    lines.push(
      p.zoneId.padEnd(22) +
        p.model.label.padEnd(36) +
        String(p.chunks).padStart(7) +
        String(p.inputTokens).padStart(11) +
        String(p.outputTokens).padStart(12) +
        dollars(p.costMicrousd).padStart(10)
    );
  }
  lines.push('', `Total estimate: ${dollars(plan.totalMicrousd)} (list prices).`);
  lines.push(
    "This is an estimate: input is the chapter plus a fixed 2,300-token prompt at about 3 characters per token; output uses the ratios measured on two real chunks on 2026-11-20 (Sonnet 0.35, Haiku 0.93 output tokens per input token). The real run is priced by the AI service's own meter."
  );
  if (maxSpendMicrousd !== undefined)
    lines.push(`The run stops at the spend ceiling of ${dollars(maxSpendMicrousd)}.`);
  lines.push('', 'Run it for real with --confirm.');
  return lines.join('\n');
}

// ── The stand-in for the account service's usage endpoint ──────────────────────

export function createLedgerStub({ token }) {
  const entries = [];
  const server = createServer((request, response) => {
    const send = (status, body) =>
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (request.method !== 'POST' || !String(request.url).endsWith('/internal/ai/step'))
      return send(404, { error: 'not_found' });
    if (request.headers.authorization !== `Bearer ${token}`)
      return send(401, { error: 'unauthorized' });
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      try {
        const step = JSON.parse(body);
        if (step.settle !== undefined && step.settle !== null) entries.push(step.settle);
        // Always allowed: this is a meter, not a budget.
        send(200, {
          ok: true,
          limited: false,
          remainingMicrousd: null,
          budgetMicrousd: null,
          resetsAt: null
        });
      } catch {
        send(400, { error: 'bad_request' });
      }
    });
  });
  return {
    entries: () => entries,
    /** For a scripted client: records one settlement as the meter would. */
    record: (entry) => void entries.push(entry),
    listen: (port = 0) =>
      new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server.address().port))),
    close: () => new Promise((ok) => server.close(() => ok()))
  };
}

// ── Running ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** One zone with one model, through the real extraction. `ai` is an AI client (`health`, `extract`). */
export async function runPair({ zone, model, ai, ledger, waitMs = 8_000, variant }) {
  const prepared = prepareChapter(zone.pages);
  const before = ledger.entries().length;
  const started = Date.now();
  const health = await ai.health({});
  const route = { providerId: model.providerId, model: model.model };
  let answered = 0;
  const extracted = await extractChapter({
    prepared,
    ai: { ...ai, extract: (request) => ai.extract(request, route) },
    maxTextLength: health.maxTextLength,
    maxItems: health.maxItems,
    // Sprint 002.33: by default the reading the service ships (the code expands the sectors);
    // `variant: 'previous'` is the reading before it (the model repeats each item for each sector).
    sectorsInCode: variant === 'previous' ? false : SECTORS_IN_CODE,
    onCall: (record) => {
      if (record.answer !== undefined) answered += 1;
    }
  });
  // The meter delivers in the background: wait for the settlements of the calls that answered.
  const deadline = Date.now() + waitMs;
  while (ledger.entries().length < before + answered && Date.now() < deadline) await sleep(100);
  const entries = ledger.entries().slice(before);
  const sum = (key) => entries.reduce((total, e) => total + (e[key] ?? 0), 0);
  return {
    zoneId: zone.id,
    model: model.label,
    variant: variant === 'previous' ? 'previous' : 'shipped',
    result: {
      rules: extracted.rules,
      dropped: extracted.dropped,
      chunks: extracted.chunks,
      model: extracted.model,
      ...(extracted.stopped === undefined ? {} : { stopped: extracted.stopped })
    },
    usage: {
      calls: answered,
      settled: entries.length,
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      cacheReadTokens: sum('cacheReadTokens'),
      costMicrousd: sum('costMicrousd'),
      estimated: entries.some((e) => e.estimated === true),
      unlisted: entries.some((e) => e.listed === false)
    },
    seconds: Math.round((Date.now() - started) / 100) / 10,
    finishedAt: new Date().toISOString()
  };
}

/**
 * Every pair of a plan, one after the other, stopping before a pair once the **measured** spend has reached the
 * ceiling. `finished` holds the pairs already run (`zoneId|label` → run) and they are skipped, so an interrupted
 * run resumes. `aiFor(zone, model)` gives the client for a pair; `onPair(pair, run)` is told of each.
 */
export async function runPlan({
  plan,
  aiFor,
  ledger,
  maxSpendMicrousd,
  finished = new Map(),
  onPair = () => {},
  waitMs,
  variant
}) {
  const runs = [];
  let spent = 0;
  let skipped = 0;
  for (const pair of plan.pairs) {
    const key = `${pair.zoneId}|${pair.model.label}`;
    if (finished.has(key)) {
      skipped += 1;
      continue;
    }
    if (spent >= maxSpendMicrousd) {
      return {
        runs,
        skipped,
        spentMicrousd: spent,
        stopped: {
          reason: `spend ceiling reached (${dollars(spent)} of ${dollars(maxSpendMicrousd)})`,
          next: key
        }
      };
    }
    const run = await runPair({
      zone: pair.zone,
      model: pair.model,
      ai: aiFor(pair.zone, pair.model),
      ledger,
      waitMs,
      variant
    });
    spent += run.usage.costMicrousd;
    runs.push(run);
    onPair(pair, run);
  }
  return { runs, skipped, spentMicrousd: spent, stopped: undefined };
}
