#!/usr/bin/env node
/**
 * Explaining the misses of recorded runs (Sprint 002.34, Epic 1). Free: it reads files and calls nothing.
 *
 *     node tools/triage-reading.mjs --runs docs/measurements/reading-runs-2026-11-20-sic-r1[,…-r2,…-r3] \
 *         [--model anthropic:claude-sonnet-5-5] [--zones pays-d-aix-ud]
 *
 * For each zone, each run's misses with their cause, and with several runs the truth rules missed in every one.
 * Causes that need the model's raw answers (`not-returned`, `sector-left-out`, `refused-by-code`) appear only for
 * runs that kept them (made since Sprint 002.34, Epic 2).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadZone } from './evaluate-reading/run.mjs';
import { formatTriage, stableMisses, triageMisses } from './evaluate-reading/triage.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVAL = join(ROOT, 'test-fixtures/fr-urban-rules/evaluation');

const options = {};
for (let i = 2; i < process.argv.length; i += 2)
  options[process.argv[i].replace(/^--/u, '')] = process.argv[i + 1];
if (options.runs === undefined) {
  console.error(
    'usage: node tools/triage-reading.mjs --runs <folder>[,<folder>…] [--model <label>] [--zones a,b]'
  );
  process.exit(2);
}
const folders = options.runs.split(',').map((f) => resolve(f));
const wanted = options.zones === undefined ? undefined : new Set(options.zones.split(','));

const runsByZone = new Map();
for (const folder of folders) {
  for (const file of readdirSync(folder).filter(
    (f) => f.endsWith('.json') && !f.endsWith('.incomplete.json')
  )) {
    const run = JSON.parse(readFileSync(join(folder, file), 'utf8'));
    // A run saved before Sprint 002.40 whose chunk failed is not a reading either.
    if (run.incomplete === true || run.result?.chunks?.failed > 0) continue;
    if (options.model !== undefined && run.model !== options.model) continue;
    if (wanted !== undefined && !wanted.has(run.zoneId)) continue;
    const key = `${run.zoneId}|${run.model}`;
    runsByZone.set(key, [...(runsByZone.get(key) ?? []), { folder, run }]);
  }
}
if (runsByZone.size === 0) {
  console.error('no run found: check --runs, --model and --zones');
  process.exit(2);
}

for (const [key, runs] of [...runsByZone].sort()) {
  const [zoneId, model] = key.split('|');
  const dir = join(EVAL, zoneId);
  if (!existsSync(join(dir, 'truth.json'))) continue;
  const zone = loadZone(dir);
  const triages = runs.map(({ run }) =>
    triageMisses({ truth: zone.truth, pages: zone.pages, result: run.result, raw: run.raw })
  );
  console.log(`\n## ${zoneId} · ${model} · ${runs.length} run${runs.length === 1 ? '' : 's'}\n`);
  console.log(formatTriage(triages[0]));
  if (triages.length > 1) {
    const s = stableMisses(triages);
    console.log(
      `\nOver ${s.runs} runs: missed in every run ${s.always.length} (${s.always.join(', ')}); in some ${s.sometimes.length} (${s.sometimes.join(', ')}).`
    );
    const total = triages.reduce((acc, t) => {
      for (const [c, n] of Object.entries(t.byCause)) acc[c] = (acc[c] ?? 0) + n;
      return acc;
    }, {});
    console.log(
      `Causes summed over the runs: ${Object.entries(total)
        .map(([c, n]) => `${c} ${n}`)
        .join(' · ')}.`
    );
  }
}
