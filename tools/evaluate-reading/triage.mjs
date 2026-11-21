/**
 * Explaining the misses of a reading (Sprint 002.34, Epic 1).
 *
 * The scorer says a truth rule was missed; this says what the reading did with its passage, so the next change is
 * aimed where the misses are. Pure: it reads a truth, the chapter's pages, a run's result and, when the run kept
 * them, the model's raw answers. Calls nothing.
 *
 * ## The causes
 *
 * | cause | what it means | needs the raw answers |
 * | --- | --- | --- |
 * | `quote-not-in-text` | the truth's quote is not in the chapter text as parsed (a parse or truth problem) | no |
 * | `read-as-other-kind` | the passage is in the result, as another kind of rule | no |
 * | `other-sector-read` | the passage is in the result for another sector, not this one | no |
 * | `read-as-other-values` | the passage is in the result with the same kind and sector, but not matched | no |
 * | `no-rule-on-passage` | nothing in the result is on the passage (the raw answers would say why) | no |
 * | `not-returned` | the model offered nothing on the passage | yes |
 * | `sector-left-out` | the model offered the passage but did not name this sector | yes |
 * | `refused-by-code` | the model offered it for this sector and no rule came out (placement, verification or de-duplication) | yes |
 *
 * **"On the passage" is a heuristic**: a read rule or a raw item is on a truth rule's passage when it is on the same
 * page and shares at least 60 % of its words with the quote (Dice). A sentence repeated for two rules on one page
 * can be mistaken for the other; the table says which, so a reader can check. `tabular` is a heuristic too: short
 * lines around the quote, typical of a table whose cells the text layer has put on lines of their own.
 */

import { sectorOf } from '../../services/fr-urban-rules-service/src/extract.mjs';
import { scoreReading } from './score.mjs';

const squash = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();

const words = (s) =>
  new Set(
    squash(s)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 2)
  );

/** Dice similarity of the word sets of two texts, 0 to 1. */
function dice(a, b) {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return (2 * shared) / (x.size + y.size);
}

const OVERLAP = 0.6;
const sectorKey = (s) => {
  const v = sectorOf(s);
  return v === null || v === undefined
    ? ''
    : String(v)
        .replace(/[\s_-]+/gu, '')
        .toUpperCase();
};

/** The lines of the page that hold the quote, as `[first, last]` indexes, or undefined. */
function linesOf(pageText, quote) {
  const lines = String(pageText).normalize('NFKC').split('\n');
  const flat = squash(quote);
  for (let first = 0; first < lines.length; first += 1) {
    let joined = '';
    for (let last = first; last < lines.length && last < first + 12; last += 1) {
      joined = squash(`${joined} ${lines[last]}`);
      if (joined.includes(flat)) return [first, last];
    }
  }
  return undefined;
}

const SHORT = 25;

/** Short lines around the quote, several of them with a figure or a code: the shape of a table in a text layer. */
function looksTabular(pageText, quote) {
  const lines = String(pageText)
    .normalize('NFKC')
    .split('\n')
    .map((l) => l.trim());
  const at = linesOf(pageText, quote);
  if (at === undefined) return false;
  const window = lines.slice(Math.max(0, at[0] - 3), at[1] + 4).filter((l) => l !== '');
  const short = window.filter((l) => l.length <= SHORT).length;
  return window.length >= 5 && short / window.length >= 0.6;
}

/** Whether a raw item, as the model gave it, covers a truth rule's sector once the code has expanded it. */
function covers(item, sector, zone) {
  const value = item.value ?? {};
  const wanted = sectorKey(sector);
  if (value.appliesTo !== undefined) {
    if (value.appliesTo === 'all') return true;
    if (value.appliesTo === 'zone') return wanted === '' || wanted === sectorKey(zone);
    const listed = Array.isArray(value.appliesTo) ? value.appliesTo.map(sectorKey) : [];
    return wanted === '' || wanted === sectorKey(zone)
      ? listed.includes(sectorKey(zone)) || listed.includes('')
      : listed.includes(wanted);
  }
  const own = sectorKey(value.sector);
  return own === wanted || (wanted === '' && own === sectorKey(zone));
}

/** What a read rule says, in a few words: its statement and its figure. */
function says(r) {
  const l = r.limit;
  if (l === null || l === undefined) return r.statement ?? 'not_regulated';
  if (l.kind === 'value') return `${l.comparison} ${l.value} ${l.unit}`;
  if (l.kind === 'ratio') return `${l.comparison} ${l.percent}% of ${l.base}`;
  return l.kind;
}

function causeOf({ missed, truth, pageText, result, raw }) {
  if (pageText === undefined || !squash(pageText).includes(squash(missed.quote))) {
    return { cause: 'quote-not-in-text' };
  }
  const sectorWise = (r) => sectorKey(r.sector) === sectorKey(missed.sector);
  const nearbyRead = (result.rules ?? []).filter(
    (r) => r.page === missed.page && dice(missed.quote, r.passage ?? '') >= OVERLAP
  );
  if (raw !== undefined) {
    const items = raw
      .flatMap((answer) => answer.items ?? [])
      .filter(
        (item) =>
          squash(pageText).includes(squash(item.passage)) &&
          dice(missed.quote, item.passage ?? '') >= OVERLAP
      );
    if (items.length === 0) return { cause: 'not-returned' };
    const sameKind = items.filter((item) => item.value?.kind === missed.kind);
    if (sameKind.length === 0) {
      return {
        cause: 'read-as-other-kind',
        detail: [...new Set(items.map((i) => i.value?.kind))].join(', ')
      };
    }
    if (!sameKind.some((item) => covers(item, missed.sector, truth.zone))) {
      return { cause: 'sector-left-out' };
    }
    // The model gave it for this sector: either a rule came out with other values, or none came out at all.
    const placed = nearbyRead.filter((r) => r.kind === missed.kind && sectorWise(r));
    return placed.length > 0
      ? { cause: 'read-as-other-values', detail: [...new Set(placed.map(says))].join(' / ') }
      : { cause: 'refused-by-code' };
  }
  if (nearbyRead.length === 0) return { cause: 'no-rule-on-passage' };
  const sameKind = nearbyRead.filter((r) => r.kind === missed.kind);
  if (sameKind.length === 0) {
    return {
      cause: 'read-as-other-kind',
      detail: [...new Set(nearbyRead.map((r) => r.kind))].join(', ')
    };
  }
  const sameSector = sameKind.filter(sectorWise);
  return sameSector.length > 0
    ? { cause: 'read-as-other-values', detail: [...new Set(sameSector.map(says))].join(' / ') }
    : { cause: 'other-sector-read' };
}

/**
 * @param {{ truth: object, pages: { page: number, text: string }[], result: { rules: object[] }, raw?: { items: { value: object, passage: string }[] }[] }} input
 * @returns {{ zone, truth: number, missed: object[], byCause: object, bySector: { zone: number, sector: number }, byStatement: object, tabular: number }}
 */
export function triageMisses({ truth, pages, result, raw }) {
  const chapterText = pages.map((p) => p.text).join('\n');
  const score = scoreReading({ truth, result, chapterText });
  const byPage = new Map(pages.map((p) => [p.page, p.text]));
  const missed = score.details.missed.map((m) => {
    const full = truth.rules.find((r) => r.id === m.id) ?? m;
    const pageText = byPage.get(full.page);
    const { cause, detail } = causeOf({ missed: full, truth, pageText, result, raw });
    const sector = sectorOf(full.sector);
    return {
      id: full.id,
      kind: full.kind,
      sector: sector ?? null,
      statement: full.statement,
      page: full.page,
      cause,
      ...(detail === undefined ? {} : { detail }),
      sectorSpecific: sector !== null && sectorKey(sector) !== sectorKey(truth.zone),
      tabular: pageText === undefined ? false : looksTabular(pageText, full.quote)
    };
  });
  const count = (key) => {
    const found = {};
    for (const m of missed) found[m[key]] = (found[m[key]] ?? 0) + 1;
    return found;
  };
  return {
    zone: truth.zone,
    truth: truth.rules.length,
    missed,
    byCause: count('cause'),
    bySector: {
      zone: missed.filter((m) => !m.sectorSpecific).length,
      sector: missed.filter((m) => m.sectorSpecific).length
    },
    byStatement: count('statement'),
    tabular: missed.filter((m) => m.tabular).length
  };
}

/** Over several runs of one zone: the truth rules missed in every run, and in some of them. */
export function stableMisses(triages) {
  const times = new Map();
  for (const t of triages) for (const m of t.missed) times.set(m.id, (times.get(m.id) ?? 0) + 1);
  const ids = [...times.keys()].sort();
  return {
    runs: triages.length,
    always: ids.filter((id) => times.get(id) === triages.length),
    sometimes: ids.filter((id) => times.get(id) < triages.length)
  };
}

/** A markdown summary: the causes in a line, then one row per miss. */
export function formatTriage(t) {
  const causes = Object.entries(t.byCause)
    .sort((a, b) => b[1] - a[1])
    .map(([cause, n]) => `${cause} ${n}`)
    .join(' · ');
  const lines = [
    `${t.zone}: ${t.missed.length} of ${t.truth} truth rules missed.`,
    '',
    `Causes: ${causes === '' ? 'none' : causes}. Sector-specific ${t.bySector.sector}, zone-level ${t.bySector.zone}; looking tabular ${t.tabular}.`,
    '',
    '| id | kind | sector | statement | page | cause | tabular |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const m of t.missed) {
    lines.push(
      `| ${m.id} | ${m.kind} | ${m.sector ?? '—'} | ${m.statement} | ${m.page} | ${m.cause}${m.detail === undefined ? '' : ` (${m.detail})`} | ${m.tabular ? 'yes' : ''} |`
    );
  }
  return lines.join('\n');
}
