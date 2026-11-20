/**
 * Scoring a reading against a zone's validated truth (Sprint 002.32, Epic 1).
 *
 * Pure: no model, no network, no file. The runner (`tools/evaluate-reading.mjs`, Epic 3) calls the real
 * extraction and hands its result here; the tests hand it small synthetic ones.
 *
 * ## What a rule is, for a reader
 *
 * A rule is its **kind**, **sector** (null for the whole zone), **statement** and **limit** (a value with
 * its unit and comparison, a ratio with its base, or a height-relative one). The model's wording and quote
 * are not compared. A reading is matched to the truth in four passes, so an error is named for what it is
 * and not counted twice:
 *
 * 1. **exact** — kind, sector, statement and limit all agree (a sector's spelling does not matter);
 * 2. **wrong value** — same kind, sector and statement, another value or unit (a near miss, not a miss plus an extra);
 * 3. **sector error** — the right rule under another sector, or under none;
 * 4. **duplicates** — a further read rule that says what a matched one says (another sector, or the same).
 *
 * What is left on the truth side is **missed**, what is left on the reading's is **extra**.
 *
 * ## What the scores do not claim
 *
 * Recall is of the **validated** truth only: the headline leaves out a zone the owner has not validated, and
 * says so. The figure coverage needs no truth and is a proxy: it catches a model skipping a paragraph, not a
 * model writing a wrong value.
 */

import {
  RULE_KINDS,
  sectorOf,
  statementInPassage,
  valueInPassage
} from '../../services/fr-urban-rules-service/src/extract.mjs';

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/gu, ' ')
    .trim();

const STATEMENTS = new Set(['limit', 'not_regulated', 'see_graphic', 'described']);

// ── The truth file ─────────────────────────────────────────────────────────────

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * `{ ok, errors, validated }`. `ok` is whether the file is well formed; `validated` is whether the owner has
 * validated it (both `validatedBy` and `validatedAt` set, and the file well formed).
 */
export function validateTruth(truth) {
  const errors = [];
  if (truth === null || typeof truth !== 'object' || Array.isArray(truth)) {
    return { ok: false, errors: ['the truth is not an object'], validated: false };
  }
  if (truth.format !== 'archisimple-reading-truth')
    errors.push('format must be "archisimple-reading-truth"');
  if (truth.version !== 1) errors.push('version must be 1');
  if (!isText(truth.zone)) errors.push('zone is required');
  if (!isText(truth.document?.idurba) || !isText(truth.document?.nomfic))
    errors.push('document.idurba and document.nomfic are required');
  const pages = truth.chapter?.pages;
  const pagesOk =
    Array.isArray(pages) &&
    pages.length === 2 &&
    pages.every(Number.isSafeInteger) &&
    pages[0] <= pages[1];
  if (!pagesOk) errors.push('chapter.pages must be [from, to]');
  if (!isText(truth.draftedBy) || !isText(truth.draftedAt))
    errors.push('draftedBy and draftedAt are required');
  const by = truth.validatedBy ?? null;
  const at = truth.validatedAt ?? null;
  if ((by === null) !== (at === null))
    errors.push('validatedBy and validatedAt are both set or both null');
  if (by !== null && !isText(by)) errors.push('validatedBy must be text');
  if (at !== null && !isText(at)) errors.push('validatedAt must be text');
  const scope = truth.scopeKinds;
  if (
    scope !== undefined &&
    (!Array.isArray(scope) || scope.length === 0 || !scope.every((k) => RULE_KINDS.includes(k)))
  ) {
    errors.push('scopeKinds must be a non-empty list of rule kinds');
  }
  if (!Array.isArray(truth.rules) || truth.rules.length === 0)
    errors.push('rules must be a non-empty list');
  const ids = new Set();
  for (const [i, r] of (Array.isArray(truth.rules) ? truth.rules : []).entries()) {
    const at = `rule ${r?.id ?? i + 1}`;
    if (!isText(r?.id)) errors.push(`${at}: id is required`);
    else if (ids.has(r.id)) errors.push(`${at}: duplicate id`);
    else ids.add(r.id);
    if (!RULE_KINDS.includes(r?.kind))
      errors.push(`${at}: unknown kind ${JSON.stringify(r?.kind)}`);
    else if (Array.isArray(scope) && !scope.includes(r.kind))
      errors.push(`${at}: kind ${r.kind} is outside scopeKinds`);
    if (r?.sector !== null && typeof r?.sector !== 'string')
      errors.push(`${at}: sector must be text or null`);
    if (!STATEMENTS.has(r?.statement))
      errors.push(`${at}: unknown statement ${JSON.stringify(r?.statement)}`);
    if (r?.statement === 'limit' && (r.limit === null || typeof r.limit !== 'object'))
      errors.push(`${at}: a limit statement needs a limit`);
    if (r?.statement !== 'limit' && r?.limit !== null && r?.limit !== undefined)
      errors.push(`${at}: only a limit statement has a limit`);
    if (!Number.isSafeInteger(r?.page) || (pagesOk && (r.page < pages[0] || r.page > pages[1])))
      errors.push(`${at}: page must be inside the chapter's pages`);
    if (!isText(r?.quote)) errors.push(`${at}: quote is required`);
  }
  const ok = errors.length === 0;
  return { ok, errors, validated: ok && by !== null && at !== null };
}

/**
 * The drafter's own check: every rule's quote must occur in its page's text, whatever the line breaks.
 * `pages` is `[{ page, text }]` as the service holds them. Returns `[{ id, problem }]`, empty when all hold.
 */
export function checkQuotes(truth, pages) {
  const byPage = new Map(pages.map((p) => [p.page, squash(p.text)]));
  const problems = [];
  for (const r of truth.rules) {
    const text = byPage.get(r.page);
    if (text === undefined)
      problems.push({ id: r.id, problem: `page ${r.page} is not among the pages given` });
    else if (!text.includes(squash(r.quote)))
      problems.push({ id: r.id, problem: `the quote is not in page ${r.page}` });
  }
  return problems;
}

// ── Keys ───────────────────────────────────────────────────────────────────────

const unitKey = (unit) =>
  unit === 'm²' || unit === 'm2'
    ? 'm2'
    : unit === '%' || unit === 'percent'
      ? 'percent'
      : String(unit);

function limitKey(limit) {
  if (limit === null || limit === undefined || typeof limit !== 'object') return 'none';
  if (limit.kind === 'value')
    return `value|${limit.comparison}|${limit.value}|${unitKey(limit.unit)}`;
  if (limit.kind === 'ratio') return `ratio|${limit.comparison}|${limit.percent}|${limit.base}`;
  if (limit.kind === 'height_relative') {
    return `hr|${limit.reference}|${limit.factor}|${limit.offsetMetres ?? ''}|${limit.minimumMetres ?? ''}`;
  }
  return 'other';
}

/** A sector as a reader compares it: case, spaces, hyphens and underscores do not matter; « none » words are null. */
function sectorKey(sector) {
  const s = sectorOf(sector);
  return s === null ? '' : s.replace(/[\s_-]+/gu, '').toUpperCase();
}

const statementOf = (r) =>
  r.statement ?? (r.limit === null || r.limit === undefined ? 'not_regulated' : 'limit');
const fullKey = (r) => `${r.kind}|${sectorKey(r.sector)}|${statementOf(r)}|${limitKey(r.limit)}`;
const sectorFreeKey = (r) => `${r.kind}|${statementOf(r)}|${limitKey(r.limit)}`;
const familyKey = (r) =>
  `${r.kind}|${sectorKey(r.sector)}|${statementOf(r)}|${r.limit?.kind ?? ''}`;

/** How far two limits of one family are: a unit or comparison change is far, a number is its difference. */
function distance(a, b) {
  const x = a.limit;
  const y = b.limit;
  if (x === null || y === null || x === undefined || y === undefined) return 0;
  if (x.kind === 'value')
    return (
      (unitKey(x.unit) === unitKey(y.unit) ? 0 : 1000) +
      (x.comparison === y.comparison ? 0 : 500) +
      Math.abs(x.value - y.value)
    );
  if (x.kind === 'ratio')
    return (
      (x.comparison === y.comparison ? 0 : 500) +
      (x.base === y.base ? 0 : 100) +
      Math.abs(x.percent - y.percent)
    );
  if (x.kind === 'height_relative') {
    return (
      (x.reference === y.reference ? 0 : 100) +
      Math.abs(x.factor - y.factor) +
      Math.abs((x.minimumMetres ?? 0) - (y.minimumMetres ?? 0)) +
      Math.abs((x.offsetMetres ?? 0) - (y.offsetMetres ?? 0))
    );
  }
  return 0;
}

// ── Matching ───────────────────────────────────────────────────────────────────

/**
 * @returns {{ found, sectorError, wrongValue, missed, extra, duplicates }} `found`, `sectorError` and
 * `wrongValue` hold `{ truth, read }` pairs; the others hold rules.
 */
export function matchRules(truthRules, readRules, { zone } = {}) {
  // A sector that is the zone's own name is the whole zone (a table row labelled « UC » in zone UC).
  const wholeZone = (r) =>
    zone !== undefined && sectorKey(r.sector) === sectorKey(zone) ? { ...r, sector: null } : r;
  const tn = truthRules.map(wholeZone);
  const rn = readRules.map(wholeZone);
  const freeT = new Set(truthRules.keys());
  const freeR = new Set(readRules.keys());
  const found = [];
  const wrongValue = [];
  const sectorError = [];
  const duplicates = [];

  // 1. Exact.
  for (const ti of [...freeT]) {
    const key = fullKey(tn[ti]);
    const ri = [...freeR].find((i) => fullKey(rn[i]) === key);
    if (ri !== undefined) {
      found.push({ truth: truthRules[ti], read: readRules[ri] });
      freeT.delete(ti);
      freeR.delete(ri);
    }
  }

  // 2. Wrong value: the nearest pairs of one family first.
  const pairs = [];
  for (const ti of freeT) {
    if (statementOf(tn[ti]) !== 'limit') continue;
    for (const ri of freeR) {
      if (familyKey(tn[ti]) === familyKey(rn[ri])) pairs.push([ti, ri, distance(tn[ti], rn[ri])]);
    }
  }
  for (const [ti, ri] of pairs.sort((a, b) => a[2] - b[2])) {
    if (!freeT.has(ti) || !freeR.has(ri)) continue;
    wrongValue.push({ truth: truthRules[ti], read: readRules[ri] });
    freeT.delete(ti);
    freeR.delete(ri);
  }

  // 3. Sector error: the same rule under another sector.
  for (const ti of [...freeT]) {
    const key = sectorFreeKey(tn[ti]);
    const ri = [...freeR].find((i) => sectorFreeKey(rn[i]) === key);
    if (ri !== undefined) {
      sectorError.push({ truth: truthRules[ti], read: readRules[ri] });
      freeT.delete(ti);
      freeR.delete(ri);
    }
  }

  // 4. Duplicates: a further read rule saying what a matched one says, whatever its sector.
  const said = new Set(
    [...found, ...sectorError].map(({ read }) => sectorFreeKey(wholeZone(read)))
  );
  for (const ri of [...freeR]) {
    if (said.has(sectorFreeKey(rn[ri]))) {
      duplicates.push(readRules[ri]);
      freeR.delete(ri);
    }
  }

  return {
    found,
    sectorError,
    wrongValue,
    missed: [...freeT].map((i) => truthRules[i]),
    extra: [...freeR].map((i) => readRules[i]),
    duplicates
  };
}

// ── Figures ────────────────────────────────────────────────────────────────────

const FIGURE =
  /(?<![\p{L}\d.,])(\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)[   ]?(m2|mètres?|metres?|m(?![\p{L}\d])|%|pour cent)/giu;

/** Every number a text writes with a length, an area or a percent unit: `{ key: '1500|m2', text }`. */
export function figuresIn(text) {
  const normal = String(text ?? '').normalize('NFKC');
  return [...normal.matchAll(FIGURE)].map((m) => {
    const unit = m[2].toLowerCase();
    const u = unit === 'm2' ? 'm2' : unit === '%' || unit === 'pour cent' ? 'percent' : 'm';
    const value = Number(m[1].replace(/[   ]/gu, '').replace(',', '.'));
    return { key: `${value}|${u}`, text: m[0] };
  });
}

// ── Scoring a reading ──────────────────────────────────────────────────────────

function droppedOf(dropped) {
  if (typeof dropped === 'number') return dropped;
  if (dropped !== null && typeof dropped === 'object')
    return Object.values(dropped).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  return 0;
}

/**
 * @param {{ truth: object, result: { rules: object[], dropped?: number|object }, chapterText?: string }} input
 */
export function scoreReading({ truth, result, chapterText = '' }) {
  const allRead = result.rules ?? [];
  // A truth may cover only some kinds; what the reading gives of the others is reported apart, never as extra.
  const scope = Array.isArray(truth.scopeKinds) ? new Set(truth.scopeKinds) : undefined;
  const read = scope === undefined ? allRead : allRead.filter((r) => scope.has(r.kind));
  const outOfScope = scope === undefined ? [] : allRead.filter((r) => !scope.has(r.kind));
  const m = matchRules(truth.rules, read, { zone: truth.zone });
  const counts = {
    truth: truth.rules.length,
    read: read.length,
    exact: m.found.length,
    sectorError: m.sectorError.length,
    found: m.found.length + m.sectorError.length,
    wrongValue: m.wrongValue.length,
    missed: m.missed.length,
    extra: m.extra.length,
    duplicates: m.duplicates.length,
    outOfScope: outOfScope.length
  };

  const verifiedCount = read.filter(
    (r) =>
      valueInPassage(r.limit ?? null, r.passage ?? '') &&
      statementInPassage(statementOf(r), r.passage ?? '')
  ).length;

  const inChapter = new Set(figuresIn(chapterText).map((f) => f.key));
  const inPassages = new Set(allRead.flatMap((r) => figuresIn(r.passage ?? '').map((f) => f.key)));
  const uncovered = [...inChapter].filter((k) => !inPassages.has(k)).sort();
  const figureCoverage = {
    covered: inChapter.size - uncovered.length,
    total: inChapter.size,
    uncovered
  };

  // Repeats: the same sentence's rule given for several sectors, and the same rule given twice.
  const groups = new Map();
  for (const r of read) {
    const key = `${sectorFreeKey(r)}|${squash(r.passage)}`;
    const bySector = groups.get(key) ?? new Map();
    bySector.set(sectorKey(r.sector), (bySector.get(sectorKey(r.sector)) ?? 0) + 1);
    groups.set(key, bySector);
  }
  let acrossSectors = 0;
  let exact = 0;
  for (const bySector of groups.values()) {
    if (bySector.size >= 2) acrossSectors += bySector.size - 1;
    for (const n of bySector.values()) exact += n - 1;
  }

  return {
    counts,
    recall: counts.truth === 0 ? null : counts.found / counts.truth,
    wrongValueRate: counts.truth === 0 ? null : counts.wrongValue / counts.truth,
    sectorAttribution: counts.found === 0 ? null : counts.exact / counts.found,
    verified: read.length === 0 ? null : verifiedCount / read.length,
    verifiedCount,
    droppedTotal: droppedOf(result.dropped),
    figureCoverage,
    repeats: { acrossSectors, exact },
    details: {
      missed: m.missed,
      wrongValue: m.wrongValue,
      sectorError: m.sectorError,
      extra: m.extra,
      duplicates: m.duplicates,
      outOfScope
    }
  };
}

// ── The headline ───────────────────────────────────────────────────────────────

const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);
const share = (n, d) => (d === 0 ? null : n / d);

function aggregate(items) {
  const s = (pick) => sum(items, (i) => pick(i.score));
  const truthRules = s((x) => x.counts.truth);
  const found = s((x) => x.counts.found);
  const read = s((x) => x.counts.read);
  const coverageTotal = s((x) => x.figureCoverage.total);
  return {
    zones: items.map((i) => i.zone),
    validators: Object.fromEntries(items.map((i) => [i.zone, i.validatedBy ?? null])),
    truthRules,
    found,
    recall: share(found, truthRules),
    wrongValueRate: share(
      s((x) => x.counts.wrongValue),
      truthRules
    ),
    missed: s((x) => x.counts.missed),
    extra: s((x) => x.counts.extra),
    extraRate: share(
      s((x) => x.counts.extra),
      read
    ),
    sectorAttribution: share(
      s((x) => x.counts.exact),
      found
    ),
    verified: share(
      s((x) => x.verifiedCount),
      read
    ),
    figureCoverage: share(
      s((x) => x.figureCoverage.covered),
      coverageTotal
    ),
    repeats: s((x) => x.repeats.acrossSectors + x.repeats.exact),
    readRules: read
  };
}

/**
 * Items are `{ zone, model, validated, score }`. **The headline counts only validated truths**; the others are
 * returned apart so a report can show them under a « not validated » heading. `byModel` splits the headline.
 */
export function summarise(items) {
  const validated = items.filter((i) => i.validated);
  const models = [...new Set(validated.map((i) => i.model))];
  return {
    headline: aggregate(validated),
    byModel: Object.fromEntries(
      models.map((model) => [model, aggregate(validated.filter((i) => i.model === model))])
    ),
    notValidated: {
      zones: items.filter((i) => !i.validated).map((i) => i.zone),
      items: items.filter((i) => !i.validated)
    }
  };
}
