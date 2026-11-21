#!/usr/bin/env node
/**
 * What a second read would add (Sprint 002.39, Epics 1–3). Free: it reads saved runs and calls no model.
 *
 *     node tools/measure-merge.mjs --reads <folder>=<model>[,<folder>=<model>…]
 *
 * Each `<folder>=<model>` is one read of the four zones: a run folder written by `evaluate-reading.mjs` and the
 * model label whose files to read (e.g. `anthropic:claude-sonnet-5-5`). The reads are merged by `mergeReads`
 * (a rule is the same rule when its passages overlap), scored against the truths, and the table says, for every
 * subset of two reads and for all of them: what was found, and what the merge added that was wrong, split by how
 * many reads agreed. A rule given by one read alone could be shown as « to confirm »: the last rows score the merge
 * without those.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeReads } from './evaluate-reading/merge.mjs';
import { loadZone } from './evaluate-reading/run.mjs';
import { matchRules, scoreReading } from './evaluate-reading/score.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVAL = join(ROOT, 'test-fixtures/fr-urban-rules/evaluation');

const arg = process.argv.indexOf('--reads');
if (arg === -1 || process.argv[arg + 1] === undefined) {
  console.error('usage: node tools/measure-merge.mjs --reads <folder>=<model>[,<folder>=<model>…]');
  process.exit(2);
}
const reads = process.argv[arg + 1].split(',').map((entry) => {
  const [folder, model] = entry.split('=');
  return { folder: resolve(folder), model, name: `${folder.split('/').pop()}` };
});

const zones = readdirSync(EVAL, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(EVAL, d.name, 'truth.json')))
  .map((d) => loadZone(join(EVAL, d.name)));
const fileOf = (model, zoneId) => `${zoneId}__${model.replace(/[^a-z0-9._-]/gi, '_')}.json`;
const rulesOf = (read, zoneId) => {
  const file = join(read.folder, fileOf(read.model, zoneId));
  const run = JSON.parse(readFileSync(file, 'utf8'));
  // A pair whose chunk failed holds 0 rules: it is not a reading, and merging it would count a miss that is not one.
  if (run.incomplete === true || run.result.chunks?.failed > 0)
    throw new Error(
      `${file} is not a reading (a chunk failed): run it again, or leave that read out`
    );
  return run.result.rules;
};

/** Score one merged (or single) reading of every zone; sums over the zones. */
function scoreAll(pick, { minAgreement = 1 } = {}) {
  const total = { truth: 0, found: 0, wrong: 0, sector: 0, extra: 0, duplicates: 0 };
  const foundBy = {};
  const extraBy = {};
  for (const zone of zones) {
    const merged = mergeReads(pick.map((read) => rulesOf(read, zone.id))).filter(
      (r) => r.agreement >= minAgreement
    );
    const score = scoreReading({
      truth: zone.truth,
      result: { rules: merged, dropped: 0 },
      chapterText: zone.chapterText
    });
    const c = score.counts;
    total.truth += c.truth;
    total.found += c.found;
    total.wrong += c.wrongValue;
    total.sector += c.sectorError;
    total.extra += c.extra;
    total.duplicates += c.duplicates;
    const scope = new Set(zone.truth.scopeKinds);
    const m = matchRules(
      zone.truth.rules,
      merged.filter((r) => scope.has(r.kind)),
      { zone: zone.truth.zone }
    );
    for (const { read } of [...m.found, ...m.sectorError])
      foundBy[read.agreement] = (foundBy[read.agreement] ?? 0) + 1;
    for (const r of m.extra) extraBy[r.agreement] = (extraBy[r.agreement] ?? 0) + 1;
  }
  return { ...total, foundBy, extraBy };
}

const subsets = (n, size) => {
  const out = [];
  const go = (start, chosen) => {
    if (chosen.length === size) return out.push(chosen);
    for (let i = start; i < n; i += 1) go(i + 1, [...chosen, i]);
  };
  go(0, []);
  return out;
};
const mean = (rows, key) => (rows.reduce((s, r) => s + r[key], 0) / rows.length).toFixed(1);
const split = (rows, key) => {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r[key])))].sort();
  return (
    keys
      .map(
        (k) =>
          `${k} read${k === '1' ? '' : 's'}: ${(rows.reduce((s, r) => s + (r[key][k] ?? 0), 0) / rows.length).toFixed(1)}`
      )
      .join(', ') || '—'
  );
};

const lines = [
  `Reads: ${reads.map((r, i) => `#${i} ${r.name} (${r.model})`).join('; ')}`,
  '',
  '| reading | found of truth | wrong values | sector errors | extras | duplicates | extras by agreement |',
  '| --- | --- | --- | --- | --- | --- | --- |'
];
const row = (label, rows) =>
  lines.push(
    `| ${label} | ${mean(rows, 'found')} of ${rows[0].truth} | ${mean(rows, 'wrong')} | ${mean(rows, 'sector')} | ${mean(rows, 'extra')} | ${mean(rows, 'duplicates')} | ${split(rows, 'extraBy')} |`
  );
for (let size = 1; size <= reads.length; size += 1) {
  const groups = subsets(reads.length, size);
  const rows = groups.map((g) => scoreAll(g.map((i) => reads[i])));
  row(size === 1 ? 'one read (mean)' : `merge of ${size} (mean of ${groups.length})`, rows);
}
if (reads.length >= 2) {
  const all = reads;
  const full = scoreAll(all);
  lines.push(
    '',
    `Of the rules found by the merge of all ${reads.length}, by how many reads gave them: ${split([full], 'foundBy')}.`
  );
  for (let k = 2; k <= reads.length; k += 1)
    row(`merge of ${reads.length}, only rules given by ${k} or more`, [
      scoreAll(all, { minAgreement: k })
    ]);
}
console.log(lines.join('\n'));
