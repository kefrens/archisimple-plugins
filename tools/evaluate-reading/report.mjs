/**
 * The tables of a reading-quality report (Sprint 002.32, Epic 4), built from the saved runs so that no figure is
 * typed by hand. Pure: runs in, Markdown or CSV out. The narrative around the tables is the author's.
 */

const dollars = (micro) => `$${(micro / 1_000_000).toFixed(3)}`;
const pct = (n, d) => (d === 0 ? '—' : `${Math.round((100 * n) / d)}%`);
const byZoneThenModel = (a, b) =>
  a.zoneId.localeCompare(b.zoneId) || a.model.localeCompare(b.model);

export function perZoneTable(runs) {
  const lines = [
    '| zone | model | found | wrong value | sector error | missed | extra | duplicates | out of scope | verified | cost | time |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const r of [...runs].sort(byZoneThenModel)) {
    const c = r.score.counts;
    const verified = r.score.verified === null ? '—' : `${Math.round(100 * r.score.verified)}%`;
    lines.push(
      `| ${r.zoneId} | ${r.model} | ${c.found} / ${c.truth} | ${c.wrongValue} | ${c.sectorError} | ${c.missed} | ${c.extra} | ${c.duplicates} | ${c.outOfScope} | ${verified} | ${dollars(r.usage.costMicrousd)} | ${r.seconds} s |`
    );
  }
  return lines.join('\n');
}

export function overallTable(runs) {
  const lines = [
    '| model | found | recall | wrong value | sector error | extra | output tokens | cost |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  const models = [...new Set(runs.map((r) => r.model))].sort();
  for (const model of models) {
    const mine = runs.filter((r) => r.model === model);
    const sum = (pick) => mine.reduce((total, r) => total + pick(r), 0);
    const truth = sum((r) => r.score.counts.truth);
    const found = sum((r) => r.score.counts.found);
    lines.push(
      `| ${model} | ${found} / ${truth} | ${pct(found, truth)} | ${sum((r) => r.score.counts.wrongValue)} | ${sum((r) => r.score.counts.sectorError)} | ${sum((r) => r.score.counts.extra)} | ${sum((r) => r.usage.outputTokens)} | ${dollars(sum((r) => r.usage.costMicrousd))} |`
    );
  }
  return lines.join('\n');
}

/**
 * Run-to-run variation: `runs` are the saved runs of several repetitions of the same plan (each run carries
 * `repeat`, a label such as `r1`). One row per zone and model: the rules found in each repetition, the mean, the
 * range, and the sector errors and wrong values of each.
 */
export function variationTable(runs) {
  const lines = [
    '| zone | model | found per run | mean | range | wrong value per run | sector error per run | extra per run |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  const keys = [...new Set(runs.map((r) => `${r.zoneId}|${r.model}`))].sort();
  for (const key of keys) {
    const mine = runs
      .filter((r) => `${r.zoneId}|${r.model}` === key)
      .sort((a, b) => String(a.repeat).localeCompare(String(b.repeat)));
    const found = mine.map((r) => r.score.counts.found);
    const truth = mine[0].score.counts.truth;
    const mean = found.reduce((a, b) => a + b, 0) / found.length;
    const [zone, model] = key.split('|');
    lines.push(
      `| ${zone} | ${model} | ${found.join(', ')} / ${truth} | ${mean.toFixed(1)} (${pct(mean, truth)}) | ${Math.max(...found) - Math.min(...found)} | ${mine.map((r) => r.score.counts.wrongValue).join(', ')} | ${mine.map((r) => r.score.counts.sectorError).join(', ')} | ${mine.map((r) => r.score.counts.extra).join(', ')} |`
    );
  }
  return lines.join('\n');
}

export function csvOf(runs) {
  const head =
    'zone,model,validatedBy,truth,found,exact,sectorError,wrongValue,missed,extra,duplicates,outOfScope,recall,verified,figureCovered,figureTotal,repeatsAcrossSectors,calls,inputTokens,outputTokens,costUsd,seconds';
  const quote = (s) =>
    `"${String(s ?? '')
      .split('"')
      .join('""')}"`;
  const rows = [...runs].sort(byZoneThenModel).map((r) => {
    const c = r.score.counts;
    return [
      r.zoneId,
      r.model,
      quote(r.validatedBy),
      c.truth,
      c.found,
      c.exact,
      c.sectorError,
      c.wrongValue,
      c.missed,
      c.extra,
      c.duplicates,
      c.outOfScope,
      r.score.recall?.toFixed(3),
      r.score.verified?.toFixed(3),
      r.score.figureCoverage.covered,
      r.score.figureCoverage.total,
      r.score.repeats.acrossSectors,
      r.usage.calls,
      r.usage.inputTokens,
      r.usage.outputTokens,
      (r.usage.costMicrousd / 1e6).toFixed(4),
      r.seconds
    ].join(',');
  });
  return [head, ...rows].join('\n');
}
