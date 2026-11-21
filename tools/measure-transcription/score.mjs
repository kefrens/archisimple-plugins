/**
 * Sprint 002.30, Epic 1: judging a transcription (a local vision model's, an OCR's) against a reference
 * transcript. Pure, no model, no network.
 *
 * What matters downstream is the **figures** (a number with its unit) and the **article numbers**: the reading
 * verifies every figure against its quoted passage, so a digit the transcription changed is « verified »
 * against the very text that holds it. Hence a candidate is judged on what it recovers (G1, G2), on what it
 * invents or changes (G3), on the prose around the figures (G4) and on pages lost whole (G5).
 *
 * `DECISION_RULE` is the rule pre-registered in Sprint 002.30 before any candidate was scored.
 */

/** The thresholds of the sprint's decision rule: X and Y, the wrong-figure ceiling, and the words floor. */
export const DECISION_RULE = Object.freeze({
  figureRecall: 0.95,
  articleRecall: 0.95,
  wrongFigureRate: 0.02,
  wordRecall: 0.9
});

const UNIT = '(?:%|pour\\s*cent|m\\s*[²2](?![\\d])|m(?:[èeé]tres?)?(?![\\p{L}\\d])|cm|mm|km|ha|kg)';
const NUMBER = '(\\d{1,3}(?:[\\s\\u00a0\\u202f]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)';
const FIGURE = new RegExp(`(?<![\\d.,\\-])${NUMBER}\\s*(${UNIT})`, 'giu');
/**
 * Informational only (the pre-registered rule is strict): an OCR often reads « m² » as « m° », « m? » or « mê ». With
 * `lenientUnits` any one non-letter glyph (or ê/é) after an m is read as m². It shows whether the digits survived when
 * the unit did not; it never changes the verdict, because the reading verifies a figure with its unit.
 */
const LENIENT_UNIT =
  "(?:%|pour\\s*cent|m\\s*[²2°?*’'`ˆ^êéë](?![\\d])|m(?:[èeé]tres?)?(?![\\p{L}\\d])|cm|mm|km|ha|kg)";
const FIGURE_LENIENT = new RegExp(`(?<![\\d.,\\-])${NUMBER}\\s*(${LENIENT_UNIT})`, 'giu');

function unitOf(raw) {
  const u = raw.toLowerCase().replace(/\s+/gu, '');
  if (u === '%' || u === 'pourcent') return '%';
  if (/^m[²2°?*’'`ˆ^êéë]$/u.test(u)) return 'm2';
  if (/^m(?:[èeé]tres?)?$/u.test(u)) return 'm';
  return u;
}

/** `[{ value, unit }]`, in reading order: « 1 500 m² » is `1500 m2`, « 7,5 mètres » is `7.5 m`. */
export function figuresOf(text, { lenientUnits = false } = {}) {
  const out = [];
  for (const match of String(text ?? '')
    .normalize('NFKC')
    .matchAll(lenientUnits ? FIGURE_LENIENT : FIGURE)) {
    const value = match[1].replace(/[\s  ]/gu, '').replace(',', '.');
    out.push({ value, unit: unitOf(match[2]) });
  }
  return out;
}

const figureLabel = (f) => `${f.value} ${f.unit}`;

/** Article numbers: `NN-NN` and « Article N », a leading zero not making another number (« 09-03 » is « 9-3 »). */
export function articleNumbersOf(text) {
  const stripped = (s) =>
    s
      .split('-')
      .map((part) => String(Number(part)))
      .join('-');
  const pattern = /(?<![\d-])(\d{1,2}-\d{2})(?![\d-])|\barticle\s+(\d{1,2}(?:-\d{2})?)(?![\d])/giu;
  const out = [];
  // « Article 09-03 » matches as the article and, further on, as the number alone: one position, once.
  const seenAt = new Set();
  for (const match of String(text ?? '')
    .normalize('NFKC')
    .matchAll(pattern)) {
    const at =
      match[1] === undefined ? match.index + match[0].length - match[2].length : match.index;
    if (seenAt.has(at)) continue;
    seenAt.add(at);
    out.push(stripped(match[1] ?? match[2]));
  }
  return out;
}

/** Distinct words of four letters or more, accents folded and lower case. */
export function wordsOf(text) {
  const words = String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/\p{L}{4,}/gu);
  return new Set(words ?? []);
}

/** `{ total, found, missing }` of a reference list against a candidate list, each occurrence matched once. */
function recallOf(reference, candidate, label) {
  const pool = new Map();
  for (const item of candidate) pool.set(label(item), (pool.get(label(item)) ?? 0) + 1);
  const missing = [];
  let found = 0;
  for (const item of reference) {
    const key = label(item);
    if ((pool.get(key) ?? 0) > 0) {
      pool.set(key, pool.get(key) - 1);
      found += 1;
    } else missing.push(key);
  }
  return {
    total: reference.length,
    found,
    recall: reference.length === 0 ? undefined : found / reference.length,
    missing
  };
}

/**
 * One page: the candidate against the reference.
 * @returns {{ figures, articles, wrong: { count, rate, figures }, words }}
 */
export function scoreTranscription({ reference, candidate }, options = {}) {
  const refFigures = figuresOf(reference, options);
  const candFigures = figuresOf(candidate, options);
  const figures = recallOf(refFigures, candFigures, figureLabel);
  const articles = recallOf(
    articleNumbersOf(reference).map((value) => ({ value })),
    articleNumbersOf(candidate).map((value) => ({ value })),
    (a) => a.value
  );
  // A candidate figure with no counterpart in the reference: what the verification could not catch.
  const refPool = new Map();
  for (const f of refFigures) refPool.set(figureLabel(f), (refPool.get(figureLabel(f)) ?? 0) + 1);
  const wrongFigures = [];
  for (const f of candFigures) {
    const key = figureLabel(f);
    if ((refPool.get(key) ?? 0) > 0) refPool.set(key, refPool.get(key) - 1);
    else wrongFigures.push(key);
  }
  const refWords = wordsOf(reference);
  const candWords = wordsOf(candidate);
  let wordsFound = 0;
  for (const w of refWords) if (candWords.has(w)) wordsFound += 1;
  return {
    figures,
    articles: { ...articles, missing: articles.missing },
    wrong: {
      count: wrongFigures.length,
      figures: wrongFigures,
      candidateFigures: candFigures.length,
      rate: candFigures.length === 0 ? 0 : wrongFigures.length / candFigures.length
    },
    words: {
      total: refWords.size,
      found: wordsFound,
      recall: refWords.size === 0 ? undefined : wordsFound / refWords.size
    }
  };
}

/**
 * The pre-registered rule over the pages: recall is the sum of what was found over the sum of what was to find
 * (never an average of page averages), and a page that holds a reference figure and is empty or cut off fails G5
 * whatever the totals say.
 * @param {{ page: number, reference: string, candidate: string, truncated?: boolean }[]} pages
 */
export function decide(pages, rule = DECISION_RULE, options = {}) {
  const scored = pages.map((p) => ({
    page: p.page,
    truncated: p.truncated === true,
    reference: p.reference,
    candidate: p.candidate,
    score: scoreTranscription(p, options)
  }));
  const sum = (pick) => scored.reduce((n, p) => n + pick(p.score), 0);
  const ratio = (a, b) => (b === 0 ? 1 : a / b);
  const g1 = ratio(
    sum((s) => s.figures.found),
    sum((s) => s.figures.total)
  );
  const g2 = ratio(
    sum((s) => s.articles.found),
    sum((s) => s.articles.total)
  );
  const g3 = ratio(
    sum((s) => s.wrong.count),
    sum((s) => s.wrong.candidateFigures)
  );
  const g4 = ratio(
    sum((s) => s.words.found),
    sum((s) => s.words.total)
  );
  const lost = scored
    .filter(
      (p) =>
        p.score.figures.total > 0 && (p.truncated || String(p.candidate ?? '').trim().length < 20)
    )
    .map((p) => p.page);
  const conditions = [
    {
      id: 'G1',
      what: 'figures with a unit recovered',
      value: g1,
      threshold: rule.figureRecall,
      pass: g1 >= rule.figureRecall
    },
    {
      id: 'G2',
      what: 'article numbers recovered',
      value: g2,
      threshold: rule.articleRecall,
      pass: g2 >= rule.articleRecall
    },
    {
      id: 'G3',
      what: "wrong figures among the candidate's",
      value: g3,
      threshold: rule.wrongFigureRate,
      pass: g3 <= rule.wrongFigureRate
    },
    {
      id: 'G4',
      what: 'words recovered',
      value: g4,
      threshold: rule.wordRecall,
      pass: g4 >= rule.wordRecall
    },
    {
      id: 'G5',
      what: 'no page with a figure empty or cut off',
      value: lost.length,
      threshold: 0,
      pass: lost.length === 0,
      pages: lost
    }
  ];
  return { offered: conditions.every((c) => c.pass), conditions, pages: scored };
}
