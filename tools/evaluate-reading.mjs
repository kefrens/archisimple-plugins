#!/usr/bin/env node
/**
 * Evaluating the PLU reading (Sprint 002.32, Epic 3). By hand, never a test, **and never without `--confirm`**.
 *
 *     node tools/evaluate-reading.mjs [--zones lyon-uce1,pays-d-aix-uc] \
 *         [--models anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5@low] \
 *         [--variant previous|unguided] [--cache <folder>] [--max-spend 3] [--platform ../archisimple] [--out docs/measurements/reading-runs] [--confirm] [--again]
 *
 * Without `--confirm` it prints the plan (the chunks, the tokens, the estimated cost) and calls nothing. With it,
 * the tool starts a stand-in for the account service's usage endpoint, starts the platform's AI service
 * (`<platform>/apps/ai-service`, with the keys of its own `.env`) pointed at it, runs each zone x model through
 * the real extraction, scores each result against the zone's truth and writes `<out>/<zone>__<model>.json`. A pair
 * already written is skipped, so an interrupted run resumes (`--again` runs it anew). It stops before a pair once
 * the **measured** spend has reached `--max-spend` (dollars, default 3).
 *
 * `--cache <folder>` keeps each chunk's answer and replays it when the same model is asked the same thing (the same
 * text, instructions and schema): for re-measuring a change that does not alter what the model is asked. **Never
 * with the repeat runs that measure noise**: a replay measures nothing. A replayed pair costs nothing and says so.
 *
 * What is sent to a model is the public text of a PLU chapter and the product's own instructions; no user,
 * account, project or parcel is named, and no AI subject is sent.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAiClient } from '../services/fr-urban-rules-service/src/ai-client.mjs';
import {
  createLedgerStub,
  createReplayCache,
  estimateRun,
  formatPlan,
  loadZone,
  parseModel,
  runFileName,
  runPlan
} from './evaluate-reading/run.mjs';
import { scoreReading, validateTruth } from './evaluate-reading/score.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVAL = join(ROOT, 'test-fixtures/fr-urban-rules/evaluation');
const DEFAULT_MODELS = 'anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5';
const FLAGS = new Set(['confirm', 'again']);

function parseArgs(argv) {
  const found = {};
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i].startsWith('--') ? argv[i].slice(2) : undefined;
    if (name === undefined) continue;
    if (FLAGS.has(name)) found[name] = true;
    else {
      found[name] = argv[i + 1];
      i += 1;
    }
  }
  return found;
}

const options = parseArgs(process.argv.slice(2));
const wanted = options.zones === undefined ? undefined : new Set(options.zones.split(','));
const zones = readdirSync(EVAL, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      existsSync(join(EVAL, d.name, 'truth.json')) &&
      (wanted === undefined || wanted.has(d.name))
  )
  .map((d) => loadZone(join(EVAL, d.name)));
if (zones.length === 0)
  throw new Error('no zone found: check --zones and test-fixtures/fr-urban-rules/evaluation');
for (const z of zones) {
  const v = validateTruth(z.truth);
  if (!v.ok) throw new Error(`${z.id}: the truth is not well formed:\n  ${v.errors.join('\n  ')}`);
}
const models = (options.models ?? DEFAULT_MODELS).split(',').map(parseModel);
const variant = options.variant;
if (variant !== undefined && variant !== 'previous' && variant !== 'unguided')
  throw new Error(
    `unknown --variant ${variant}: the shipped reading (no flag), unguided or previous`
  );
const maxSpendMicrousd = Math.round(Number(options['max-spend'] ?? 3) * 1_000_000);
const plan = estimateRun({ zones, models });

if (options.confirm !== true) {
  console.log(formatPlan(plan, { maxSpendMicrousd }));
  const status = (z) =>
    `${z.id} ${validateTruth(z.truth).validated ? `(validated by: ${z.truth.validatedBy})` : '(NOT validated: its scores stay out of the headline)'}`;
  console.log('\nTruths: ' + zones.map(status).join('; '));
  process.exit(0);
}

const platform = resolve(ROOT, options.platform ?? '../archisimple');
const out = resolve(ROOT, options.out ?? 'docs/measurements/reading-runs');
mkdirSync(out, { recursive: true });
const token = randomBytes(16).toString('hex');
const ledger = createLedgerStub({ token });
const ledgerPort = await ledger.listen(0);

/** One AI service per effort setting: the effort is a service setting, not a request's. */
const services = new Map();
async function serviceFor(effort) {
  const key = effort ?? '';
  if (services.has(key)) return services.get(key);
  const port = 4600 + services.size;
  const env = {
    ...process.env,
    AI_SERVICE_PORT: String(port),
    AI_SERVICE_DEFAULT_PROVIDER: 'anthropic',
    AI_SERVICE_REQUEST_TIMEOUT_MS: '600000',
    ACCOUNT_USAGE_URL: `http://127.0.0.1:${ledgerPort}`,
    ACCOUNT_USAGE_TOKEN: token,
    // The service refuses a usage endpoint without this. Safe here: the service listens on loopback for this run only and the tool sends no account headers.
    AI_SERVICE_TRUST_ACCOUNT_FEATURES: 'true',
    ...(effort === undefined ? {} : { AI_PROVIDER_ANTHROPIC_EFFORT: effort })
  };
  const child = spawn(
    'node',
    ['--env-file-if-exists=../../.env', '--import', 'tsx', 'src/main.ts'],
    {
      cwd: join(platform, 'apps/ai-service'),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  let stderr = '';
  child.stderr.on('data', (data) => {
    stderr = (stderr + String(data)).slice(-1500);
  });
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('the AI service did not start in 30 s')), 30_000);
    child.stdout.on('data', (data) => {
      if (/listening on/.test(String(data))) {
        clearTimeout(timer);
        ok();
      }
    });
    child.on('exit', (code) =>
      fail(
        new Error(
          `the AI service exited (${code}): ${stderr.trim().split('\n').slice(-3).join(' | ')}`
        )
      )
    );
  });
  const entry = {
    client: createAiClient({ baseUrl: `http://127.0.0.1:${port}`, extractTimeoutMs: 600_000 }),
    child
  };
  services.set(key, entry);
  return entry;
}

const finished = new Map();
if (options.again !== true) {
  for (const file of readdirSync(out).filter(
    (n) => n.endsWith('.json') && !n.endsWith('.incomplete.json')
  )) {
    const run = JSON.parse(readFileSync(join(out, file), 'utf8'));
    finished.set(`${run.zoneId}|${run.model}`, run);
  }
}
const clients = new Map();
for (const m of models) clients.set(m.label, (await serviceFor(m.effort)).client);

console.log(formatPlan(plan, { maxSpendMicrousd }));
console.log('\nRunning...');
let outcome;
try {
  outcome = await runPlan({
    plan,
    aiFor: (_zone, model) => clients.get(model.label),
    ledger,
    maxSpendMicrousd,
    finished,
    variant,
    cache:
      options.cache === undefined ? undefined : createReplayCache(resolve(ROOT, options.cache)),
    onPair: (pair, run) => {
      const score = scoreReading({
        truth: pair.zone.truth,
        result: run.result,
        chapterText: pair.zone.chapterText
      });
      const saved = {
        ...run,
        validated: validateTruth(pair.zone.truth).validated,
        validatedBy: pair.zone.truth.validatedBy ?? null,
        score
      };
      writeFileSync(join(out, runFileName(pair, run)), JSON.stringify(saved, null, 2));
      const cost = (run.usage.costMicrousd / 1e6).toFixed(3);
      if (run.incomplete) {
        const why = run.result.stopped === undefined ? '' : ', stopped on the budget';
        console.log(
          `${pair.zoneId} x ${pair.model.label}: INCOMPLETE (${run.result.chunks.failed} chunk(s) failed${why}), $${cost}, ${run.seconds}s: filed as .incomplete.json, not a reading; run it again`
        );
        return;
      }
      console.log(
        `${pair.zoneId} x ${pair.model.label}: recall ${score.recall?.toFixed(2)}, wrong ${score.counts.wrongValue}, extra ${score.counts.extra}, ${run.usage.calls} calls, $${cost}, ${run.seconds}s`
      );
    }
  });
} finally {
  for (const { child } of services.values()) child.kill();
  await ledger.close();
}
const spent = (outcome.spentMicrousd / 1e6).toFixed(3);
console.log(
  `\nSpent $${spent}${outcome.stopped === undefined ? '' : ` - stopped: ${outcome.stopped.reason}`}. ${outcome.skipped} pair(s) already done were skipped. Results in ${out}`
);
