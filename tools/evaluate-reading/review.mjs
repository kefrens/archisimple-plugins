/**
 * The review sheet a truth is validated with (Sprint 002.32, Epic 2). Pure: a truth, the chapter's pages and,
 * optionally, a reading in; Markdown out. It exists so the owner can check a number against its passage in
 * seconds: the rules by sector with their page and quote, the figures the text writes that **no truth quote
 * covers** (the drafter's likely misses), and, when a reading is given, where it and the truth disagree.
 */

import { figuresIn, scoreReading } from './score.mjs';

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/gu, ' ')
    .trim();

const limitText = (r) => {
  const l = r.limit;
  if (r.statement !== 'limit' || l === null || l === undefined)
    return r.statement.replace('_', ' ');
  if (l.kind === 'value')
    return `${l.comparison === 'min' ? '≥' : '≤'} ${l.value} ${l.unit === 'percent' ? '%' : l.unit}`;
  if (l.kind === 'ratio') return `${l.comparison === 'min' ? '≥' : '≤'} ${l.percent} % (${l.base})`;
  if (l.kind === 'height_relative') {
    const offset =
      l.offsetMetres === null
        ? ''
        : ` ${l.offsetMetres < 0 ? '−' : '+'} ${Math.abs(l.offsetMetres)} m`;
    return `${l.factor} × ${l.reference}${offset}${l.minimumMetres === null ? '' : `, min ${l.minimumMetres} m`}`;
  }
  return 'other limit';
};

const line = (r) =>
  `- **${r.kind}** · ${limitText(r)} · page ${r.page}${r.id === undefined ? '' : ` · ${r.id}`}${r.passage === undefined ? '' : ` — “${squash(r.passage).slice(0, 160)}”`}`;

/** The sentence around a figure, for the owner to judge it. */
function around(text, figure) {
  const flat = squash(text);
  const at = flat.indexOf(figure.text.trim());
  if (at === -1) return figure.text;
  const from = Math.max(0, flat.lastIndexOf('. ', at) + 2);
  const dot = flat.indexOf('. ', at);
  return flat.slice(from, dot === -1 ? undefined : dot + 1).slice(0, 220);
}

export function reviewSheet({ truth, pages, result, readingLabel = 'the reading' }) {
  const out = [];
  const validated = truth.validatedBy !== null && truth.validatedBy !== undefined;
  out.push(`# Review sheet — zone ${truth.zone}`);
  out.push('');
  out.push(
    `${truth.document.idurba} · chapter pages ${truth.chapter.pages[0]}–${truth.chapter.pages[1]} · ${truth.rules.length} rules drafted by ${truth.draftedBy} on ${truth.draftedAt}.`
  );
  out.push(
    validated
      ? `Validated by ${truth.validatedBy} on ${truth.validatedAt}.`
      : '**Status: not validated.** Its scores are shown apart and stay out of any headline until you validate it.'
  );
  if (truth.scopeNote !== undefined) out.push('', `Scope: ${truth.scopeNote}`);
  out.push(
    '',
    'Check each **number, sector and page** against its quote. Wording does not matter.',
    ''
  );

  out.push('## The rules, by sector', '');
  const bySector = new Map();
  for (const r of truth.rules)
    bySector.set(r.sector ?? '(whole zone)', [
      ...(bySector.get(r.sector ?? '(whole zone)') ?? []),
      r
    ]);
  for (const [sector, rules] of bySector) {
    out.push(`### ${sector}`, '');
    for (const r of rules)
      out.push(
        `${line(r)}`,
        `  > ${squash(r.quote)}`,
        ...(r.note === undefined ? [] : [`  > _note: ${r.note}_`])
      );
    out.push('');
  }

  const covered = new Set(truth.rules.flatMap((r) => figuresIn(r.quote).map((f) => f.key)));
  const uncovered = [];
  const seen = new Set();
  for (const p of pages) {
    for (const f of figuresIn(p.text)) {
      if (covered.has(f.key) || seen.has(`${p.page}|${f.key}`)) continue;
      seen.add(`${p.page}|${f.key}`);
      uncovered.push({ page: p.page, figure: f, context: around(p.text, f) });
    }
  }
  out.push('## Figures the text writes that no truth quote covers', '');
  out.push(
    uncovered.length === 0
      ? 'None.'
      : "The drafter's likely misses: if a rule of the scope's kinds is among them, say so and it is added. Most are outside the scope (fences, thresholds, parking).",
    ''
  );
  for (const u of uncovered)
    out.push(`- page ${u.page} · **${u.figure.text.trim()}** — ${u.context}`);
  out.push('');

  if (result !== undefined) {
    const s = scoreReading({ truth, result, chapterText: pages.map((p) => p.text).join('\n') });
    out.push(
      `## Against ${readingLabel} (informational; the truth is not validated until you say so)`,
      ''
    );
    const c = s.counts;
    out.push(
      `Rules read: ${c.read} in scope${c.outOfScope ? ` (+${c.outOfScope} outside the scope)` : ''}. Found ${c.found} of ${c.truth} (${c.exact} exact, ${c.sectorError} under another sector), wrong value ${c.wrongValue}, missed ${c.missed}, extra ${c.extra}, duplicates ${c.duplicates}.`,
      ''
    );
    const section = (title, items, show) => {
      out.push(`### ${title} (${items.length})`, '');
      for (const item of items) out.push(show(item));
      out.push('');
    };
    section(
      'Wrong value — the truth or the reading is wrong, you decide',
      s.details.wrongValue,
      (p) =>
        `- truth ${p.truth.id}: ${p.truth.kind} ${p.truth.sector ?? '(zone)'} ${limitText(p.truth)} · read: ${limitText(p.read)} (page ${p.read.page}, “${squash(p.read.passage).slice(0, 120)}”)`
    );
    section(
      'Sector error',
      s.details.sectorError,
      (p) =>
        `- truth ${p.truth.id}: ${p.truth.kind} ${limitText(p.truth)} is ${p.truth.sector ?? '(zone)'} · read under ${p.read.sector ?? '(zone)'}`
    );
    section(
      'Missed — in the truth, not read',
      s.details.missed,
      (r) => `- ${r.id}: ${r.kind} ${r.sector ?? '(zone)'} ${limitText(r)} (page ${r.page})`
    );
    section(
      'Extra — read, not in the truth: valid and missing from the truth, or wrong?',
      s.details.extra,
      (r) => line(r).replace(/^- /, `- ${r.sector ?? '(zone)'} · `)
    );
  }
  return out.join('\n');
}
