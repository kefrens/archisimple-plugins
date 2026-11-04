/**
 * Extracting a zone chapter's rules (Sprint 002.5b DEC-4 to DEC-7).
 *
 * The chapter, prepared by 002.5a (no page markers, a page-offset index,
 * article and sector headings), is cut at article headings into chunks; each
 * chunk is one 096.7 call; what comes back is checked here before it is a
 * candidate:
 *
 * - each passage's occurrence is chosen by its sector heading (DEC-5);
 * - `page` and `article` come from the chosen offset, never from the model;
 * - statement, limit and unit must agree (DEC-6), and a comparison against
 *   the package's floors lowers the confidence;
 * - conditions and exceptions must occur verbatim in a window around the
 *   passage (before it, and — since Sprint 002.21 — a little after).
 *
 * Nothing here makes a candidate a rule: 002.6b shows every one `to_confirm`.
 */

import { createHash } from 'node:crypto';

import { AiError } from './ai-client.mjs';
import { ServiceError } from './errors.mjs';
import { allOccurrences, normalisePassage, normaliseText } from './normalise.mjs';
import { articleAt, pageAt } from './text.mjs';

export const SCHEMA_VERSION = 1;
export const PROMPT_VERSION = 3;
export const MAX_CHUNK_CHARS = 40_000;
export const MAX_ITEMS_PER_CHUNK = 120;
export const CONDITION_WINDOW = 1_500;
/**
 * Sprint 002.21: a règlement writes its alternative rules and exceptions *after* the rule they
 * qualify (« Règle alternative à l'article… », « les extensions … peuvent être implantées à une
 * distance inférieure »). The window the quoted phrase is looked for in runs this far past the
 * passage too; with the window before it only, every such exception was dropped and the rule read
 * as wider than it is (the 2026-11-03 Marseille UD run lost 24 of them).
 */
export const CONDITION_WINDOW_AFTER = 600;
/** What ends a job at its first chunk: no provider at all, one the account may not use, or none by that id. */
const REFUSED = new Set(['no_provider_configured', 'provider_not_permitted', 'unknown_provider']);
/** 096.7's codes worth one retry; any other ends the chunk at once. */
const RETRIED = new Set(['output_truncated', 'output_invalid', 'provider_error', 'unreachable', 'malformed']);

export const RULE_KINDS = [
  'road_setback',
  'boundary_setback',
  'building_distance',
  'footprint_ratio',
  'floor_area_max',
  'extension_max',
  'annex_max',
  'height_total',
  'height_facade',
  'green_ratio',
  'parking',
  'other'
];
/** The package's floors (`fr-urban-rules/src/index.js`, `MINIMUM_KINDS`); the rest are caps. */
export const MINIMUM_KINDS = new Set(['road_setback', 'boundary_setback', 'building_distance', 'green_ratio']);

/**
 * Sprint 002.21: the limits a height-limited strip runs along, by the words the model returns
 * (the extension's band choices, with `_` for `-`).
 */
export const STRIP_EDGES = ['all', 'street', 'side', 'rear', 'side_rear'];
/** The kinds a strip may qualify: a height, in metres. */
const STRIP_KINDS = new Set(['height_total', 'height_facade']);

/** DEC-6, `schemaVersion: 1` (Sprint 002.21 adds the optional `strip`; a result without it reads as no strip). */
export const ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'sector', 'statement', 'limit', 'strip', 'conditions', 'exceptions', 'confidence'],
  properties: {
    kind: { enum: RULE_KINDS },
    sector: { type: ['string', 'null'], maxLength: 40 },
    statement: { enum: ['limit', 'not_regulated', 'see_graphic', 'described'] },
    limit: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'comparison', 'value', 'unit'],
          properties: {
            kind: { const: 'value' },
            comparison: { enum: ['min', 'max'] },
            value: { type: 'number', minimum: 0 },
            unit: { enum: ['m', 'm2', 'percent'] }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'comparison', 'percent', 'base'],
          properties: {
            kind: { const: 'ratio' },
            comparison: { enum: ['min', 'max'] },
            percent: { type: 'number', minimum: 0, maximum: 100 },
            base: { enum: ['plot_area', 'emprise', 'surface_de_plancher', 'existing_emprise', 'other'] }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'reference', 'factor', 'offsetMetres', 'minimumMetres'],
          properties: {
            kind: { const: 'height_relative' },
            reference: { enum: ['altitude_difference', 'facade_height'] },
            factor: { type: 'number', minimum: 0 },
            offsetMetres: { type: ['number', 'null'] },
            minimumMetres: { type: ['number', 'null'], minimum: 0 }
          }
        }
      ]
    },
    strip: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['depthMetres', 'edges', 'permits'],
          properties: {
            depthMetres: { type: 'number', minimum: 0.1, maximum: 50 },
            edges: { enum: STRIP_EDGES },
            permits: { type: 'boolean' }
          }
        }
      ]
    },
    conditions: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 400 } },
    exceptions: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 400 } },
    confidence: { enum: ['high', 'medium', 'low'] }
  }
});

/**
 * DEC-7. A change of wording raises PROMPT_VERSION: 2 since the 002.5b
 * review (JSON null for no sector, `other` for a rule that fits no kind, the
 * band of constructibility is not a setback), 3 since Sprint 002.21 (the strip of a height limit).
 */
export const INSTRUCTIONS = [
  'The text is one zone chapter of a French local planning regulation (règlement de PLU). List every rule it sets on building, one item per rule and per sector.',
  'kind — road_setback: distance from the road or public space (voies et emprises publiques); boundary_setback: distance from the side or rear plot boundaries (limites séparatives); building_distance: distance between buildings on one plot; footprint_ratio: emprise au sol; floor_area_max: maximum floor area (surface de plancher); extension_max: limit on extending an existing building; annex_max: limit on annexes; height_total: maximum total height (hauteur maximale, au faîtage); height_facade: maximum façade height (hauteur de façade); green_ratio: minimum planted or open-ground share (pleine terre, espaces verts); parking: parking requirements; other: any other rule. If a rule fits no kind, use other. The depth of a band of constructibility (bande de constructibilité) is not a setback: it is other.',
  'statement — limit: the text sets a value (fill limit); not_regulated: the text says the matter is not regulated (« n\'est pas réglementé »), return these, never omit them; see_graphic: the value is given on the graphic documents (« figure aux documents graphiques »); described: a rule in words with no value. For not_regulated, see_graphic and described, limit is null.',
  'limit — value: a number with its unit as written (m, m2 or percent), never converted, never computed; comparison is min for « au moins », « minimum », and max for « au plus », « maximum », « ne peut excéder ». ratio: a percentage of a base. height_relative: a distance against a height, as « R ≥ Hf - 4 m, avec un minimum de 2 mètres » (reference facade_height, factor 1, offsetMetres -4, minimumMetres 2) or « D ≥ Hf/2 » (factor 0.5).',
  'strip — null, except for a height limit (height_total or height_facade) that holds only within a strip along the plot limits, as « dans une bande de 0 à 4 mètres à compter de la limite séparative » or « sur une profondeur de 5 mètres ». Then { depthMetres: the strip\'s width from the limit as the text writes it (4 for « de 0 à 4 mètres »), edges: all, street (alignment, voies), side (limites latérales), rear (limite de fond de parcelle) or side_rear (limites séparatives), permits: true when the text lets a construction stand in the strip on condition of that height — a derogation from a setback — and false when it only limits the height there }. A sentence that sets a setback and lets lower constructions stand within it is two items: the setback, and the height limit with its strip (permits true). A height limit that holds only in a strip never comes without its strip.',
  'sector — the sector the rule applies to, spelled as the text spells it (« UCe1b »), or JSON null (not the word "null") when it applies to the whole zone. When the same sentence applies to several sectors, return one item per sector.',
  'passage — one contiguous quotation from the text, copied exactly, that states the rule: the sentence, not a paraphrase.',
  'conditions and exceptions — short phrases copied exactly from the text just before or in the passage (« Dans le secteur UCe1b »), never reworded; empty when there are none.',
  'confidence — high when the passage states the rule plainly, medium or low otherwise.'
].join('\n');

// Chunks --------------------------------------------------------------------------

/**
 * The chapter cut at article headings into chunks of at most `max`
 * characters: `[{ base, text }]`. A stretch with no heading inside the limit
 * is cut at a line end, and only failing that mid-line.
 */
export function splitChunks(prepared, max = MAX_CHUNK_CHARS) {
  if (!Number.isInteger(max) || max < 1) throw new RangeError(`chunk size must be a positive integer, not ${max}`);
  const cuts = prepared.articles.map((a) => a.offset).filter((o) => o > 0);
  const chunks = [];
  let start = 0;
  const length = prepared.text.length;
  while (start < length) {
    if (length - start <= max) {
      chunks.push({ base: start, text: prepared.text.slice(start) });
      break;
    }
    const limit = start + max;
    let end = cuts.filter((c) => c > start && c <= limit).at(-1);
    if (end === undefined) {
      // A newline before the limit, so the chunk ends on it and stays ≤ max.
      const newline = prepared.text.lastIndexOf('\n', limit - 1);
      end = newline > start ? newline + 1 : limit;
      // Never between the two halves of a surrogate pair.
      const code = prepared.text.charCodeAt(end - 1);
      if (end === limit && code >= 0xd800 && code <= 0xdbff && end - 1 > start) end -= 1;
    }
    chunks.push({ base: start, text: prepared.text.slice(start, end) });
    start = end;
  }
  return chunks;
}

// Post-validation -------------------------------------------------------------------

const METRE_KINDS = new Set(['road_setback', 'boundary_setback', 'building_distance', 'height_total', 'height_facade']);

/** DEC-6's coherence: true when statement, limit and unit agree for the kind. */
export function coherent(value) {
  const { kind, statement, limit } = value;
  if (statement === 'limit') {
    if (limit === null || typeof limit !== 'object') return false;
  } else {
    return limit === null;
  }
  if (METRE_KINDS.has(kind)) {
    return (limit.kind === 'value' && limit.unit === 'm') || limit.kind === 'height_relative';
  }
  if (limit.kind === 'height_relative') return kind === 'other';
  switch (kind) {
    case 'floor_area_max':
    case 'annex_max':
      return (limit.kind === 'value' && limit.unit === 'm2') || limit.kind === 'ratio';
    case 'footprint_ratio':
    case 'green_ratio':
      return (limit.kind === 'value' && limit.unit === 'percent') || limit.kind === 'ratio';
    case 'extension_max':
      return (limit.kind === 'value' && (limit.unit === 'm2' || limit.unit === 'percent')) || limit.kind === 'ratio';
    default:
      return true; // parking, other
  }
}

/** False when a value or ratio's comparison disagrees with the package's floors and caps. */
export function comparisonAgrees(value) {
  const { kind, limit } = value;
  // `other` has no direction, and `parking` is as often a minimum (places) as a cap.
  if (kind === 'other' || kind === 'parking' || limit === null || (limit.kind !== 'value' && limit.kind !== 'ratio')) return true;
  return limit.comparison === (MINIMUM_KINDS.has(kind) ? 'min' : 'max');
}

/**
 * Every number the passage writes: « 1 500 » and « 1,5 » are one number each.
 */
export function numbersIn(passage) {
  const text = String(passage).normalize('NFKC');
  // Not a digit inside a word: « m2 », « UCe1b » write no number.
  return [...text.matchAll(/(?<![\p{L}\d])(?:\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/gu)].map((m) =>
    Number(m[0].replace(/[ \u00A0\u202F]/gu, '').replace(',', '.'))
  );
}

/** The numbers a limit claims, which the passage must write (S1 of the 002.5b review). */
function claimedNumbers(limit) {
  if (limit === null || typeof limit !== 'object') return [];
  if (limit.kind === 'value') return [limit.value];
  if (limit.kind === 'ratio') return [limit.percent];
  if (limit.kind === 'height_relative') {
    return [limit.minimumMetres, limit.offsetMetres === null ? null : Math.abs(limit.offsetMetres)].filter(
      (n) => typeof n === 'number'
    );
  }
  return [];
}

/** True when every number the limit claims occurs in the passage. */
export function valueInPassage(limit, passage) {
  const written = numbersIn(passage);
  return claimedNumbers(limit).every((n) => written.some((w) => Math.abs(w - n) < 1e-9));
}

// « réglementé », and its other spelling « règlementé » (Lyon writes both).
const NOT_REGULATED = /r[éeè]glement|sans objet/iu;
const SEE_GRAPHIC = /graphique/iu;

/** Words the passage must hold for its statement: « réglementé(e) » / « graphique ». */
export function statementInPassage(statement, passage) {
  if (statement === 'not_regulated') return NOT_REGULATED.test(passage);
  if (statement === 'see_graphic') return SEE_GRAPHIC.test(passage);
  return true;
}

const NO_SECTOR = new Set(['', 'null', 'none', 'aucun', 'aucune', 'n/a', 'na', '-']);

/** A sector the model wrote as a word for "none" is null (S3). */
export function sectorOf(sector) {
  if (typeof sector !== 'string') return null;
  return NO_SECTOR.has(sector.trim().toLowerCase()) ? null : sector;
}

const MIN_CONDITION_LENGTH = 4;

const sameCode = (a, b) => normalisePassage(a).replace(/\s+/gu, '').toLowerCase() === normalisePassage(b).replace(/\s+/gu, '').toLowerCase();

/** The nearest sector heading at or before a chapter offset. */
function sectorHeadingBefore(prepared, offset) {
  let found;
  for (const s of prepared.sectors) {
    if (!s.heading) continue;
    if (s.lineStart > offset) break;
    found = s;
  }
  return found;
}

const WEAKEST = ['prompt', 'json', 'schema'];

/**
 * Sprint 002.21: the strip a model claimed, if the item can carry one — a height in metres, said as
 * a limit — and the text writes its depth (the same test as a limit's value). `null` otherwise.
 */
export function verifiedStrip(value, passage) {
  const strip = value.strip;
  if (
    strip === null ||
    typeof strip !== 'object' ||
    !STRIP_KINDS.has(value.kind) ||
    value.statement !== 'limit' ||
    value.limit?.kind !== 'value' ||
    value.limit.unit !== 'm' ||
    !(typeof strip.depthMetres === 'number' && strip.depthMetres >= 0.1 && strip.depthMetres <= 50) ||
    !STRIP_EDGES.includes(strip.edges) ||
    typeof strip.permits !== 'boolean'
  )
    return null;
  const written = numbersIn(passage);
  if (!written.some((w) => Math.abs(w - strip.depthMetres) < 1e-9)) return null;
  return { depthMetres: strip.depthMetres, edges: strip.edges, permits: strip.permits };
}

/**
 * One 096.7 item, checked and placed. `{ rule }` or `{ drop: <counter> }`.
 *
 * @param {{ prepared, chunk: { base, text }, normalisedChunk, item, sectors: Set<string>, dropped }} context
 */
export function placeItem({ prepared, chunk, normalisedChunk, item, sectorCodes, dropped }) {
  const value = { ...item.value, sector: sectorOf(item.value.sector) };
  if (!coherent(value) || !statementInPassage(value.statement, item.passage.text)) {
    dropped.incoherent += 1;
    return undefined;
  }
  let confidence = ['high', 'medium', 'low'].includes(value.confidence) ? value.confidence : 'low';
  // Sprint 002.21: a strip is a claim about the text, checked like a limit's value.
  let strip = null;
  if (value.strip !== undefined && value.strip !== null) {
    strip = verifiedStrip(value, item.passage.text);
    if (strip === null) {
      // A height the text holds to a strip, read without it, would be a limit on the whole
      // building: it stays a statement in words, never a number the plot is measured by.
      dropped.stripNotInPassage = (dropped.stripNotInPassage ?? 0) + 1;
      value.statement = 'described';
      value.limit = null;
      confidence = 'low';
    }
  }

  // DEC-5: the occurrence.
  let occurrences = [{ start: item.passage.start, end: item.passage.end }];
  if (item.passage.occurrences > 1) {
    const found = allOccurrences(normalisedChunk, item.passage.text);
    if (found.length > 0) occurrences = found;
  }
  let chosen = occurrences[0];
  let chosenBy = occurrences.length === 1 ? 'only' : 'first';
  if (occurrences.length > 1) {
    const matching =
      value.sector === null
        ? []
        : occurrences.filter((o) => {
            const heading = sectorHeadingBefore(prepared, chunk.base + o.start);
            return heading !== undefined && sameCode(heading.code, value.sector);
          });
    if (matching.length === 1) {
      chosen = matching[0];
      chosenBy = 'sector-heading';
    } else {
      confidence = 'low';
    }
  }
  const start = chunk.base + chosen.start;
  const end = chunk.base + chosen.end;

  // DEC-6: conditions and exceptions, verbatim within the window.
  const heading = sectorHeadingBefore(prepared, start);
  const windowStart = Math.max(heading?.lineStart ?? 0, start - CONDITION_WINDOW, 0);
  const window = normaliseText(prepared.text.slice(windowStart, Math.min(prepared.text.length, end + CONDITION_WINDOW_AFTER)));
  /** The phrase as the text writes it (a slice of the source), or `undefined`. */
  const verbatim = (phrase) => {
    const needle = normalisePassage(phrase);
    const at = needle.length >= MIN_CONDITION_LENGTH ? window.normalised.indexOf(needle) : -1;
    if (at < 0) {
      dropped.conditionNotVerbatim += 1;
      return undefined;
    }
    return prepared.text.slice(windowStart + window.starts[at], windowStart + window.ends[at + needle.length - 1]);
  };
  const askedConditions = value.conditions ?? [];
  const askedExceptions = value.exceptions ?? [];
  const conditions = askedConditions.map(verbatim).filter((c) => c !== undefined);
  const exceptions = askedExceptions.map(verbatim).filter((c) => c !== undefined);
  if (conditions.length < askedConditions.length || exceptions.length < askedExceptions.length) {
    // A rule that lost a condition may now read wider than it is (S4).
    dropped.droppedConditions += 1;
    confidence = 'low';
  }

  if (!valueInPassage(value.limit, prepared.text.slice(start, end))) {
    dropped.valueNotInPassage += 1;
    confidence = 'low';
  }
  if (!comparisonAgrees(value)) confidence = 'low';
  const sectorUnplaced = value.sector !== null && ![...sectorCodes].some((code) => sameCode(code, value.sector));
  const article = articleAt(prepared, start);

  return {
    kind: value.kind,
    sector: value.sector,
    statement: value.statement,
    limit: value.limit,
    // Absent unless the text holds the height to a strip: a result of the earlier prompt reads the same.
    ...(strip === null ? {} : { strip }),
    page: pageAt(prepared, start),
    article: article?.number ?? null,
    passage: prepared.text.slice(start, end),
    offset: { start, end },
    occurrence: { of: occurrences.length, chosenBy },
    conditions,
    exceptions,
    sectorUnplaced,
    confidence
  };
}

function ruleKey(rule) {
  return JSON.stringify([rule.kind, rule.sector, rule.limit, rule.strip, normalisePassage(rule.passage)]);
}

/**
 * The whole chapter, chunk by chunk.
 *
 * @param {{
 *   prepared, ai: { extract: Function }, maxTextLength?: number, maxItems?: number,
 *   chunkChars?: number,    a deployment's smaller chunk (a slow local model); never above 40 000
 *   onChunk?: (index: number, of: number, pages: [number, number]) => void,
 *   onPart?: (part: { n, of, pages, state: 'done' | 'failed', cached: boolean, rules: number, total: number }) => void,
 *   signal?: AbortSignal,   002.23: a reading the user stopped ends with `cancelled`, between chunks and inside a call
 *   memo?: { get(key), set(key, answer) }, memoSalt?: string   002.23: a chunk answered once is not asked again
 *   onCall?: (record: object) => void,
 *   onAnswer?: () => void   the first model answer, for the job's refund (S7)
 * }} options `onCall` sees each 096.7 request's metadata — chunk, attempt, base, length, and
 *   since 002.9 the text's `textSha256` and `promptVersion` — and its answer (the recording mode)
 * @returns {Promise<{ rules, dropped, chunks: { of, failed }, codes: string[], model }>}
 */
export async function extractChapter({ prepared, ai, maxTextLength, maxItems, chunkChars, onChunk, onPart, onCall, onAnswer, signal, memo, memoSalt = '' }) {
  const chunks = splitChunks(
    prepared,
    Math.min(MAX_CHUNK_CHARS, chunkChars ?? MAX_CHUNK_CHARS, maxTextLength ?? MAX_CHUNK_CHARS)
  );
  const sectorCodes = new Set(prepared.sectors.filter((s) => s.heading).map((s) => s.code));
  // `valueNotInPassage` and `droppedConditions` count rules kept at low confidence.
  const dropped = {
    passageNotFound: 0,
    schemaInvalid: 0,
    overLimit: 0,
    conditionNotVerbatim: 0,
    incoherent: 0,
    valueNotInPassage: 0,
    droppedConditions: 0
  };
  const rules = new Map();
  const codes = [];
  let failed = 0;
  let model;
  let weakest;

  for (const [index, chunk] of chunks.entries()) {
    if (signal?.aborted) throw new ServiceError('cancelled');
    const pages = [
      pageAt(prepared, chunk.base),
      pageAt(prepared, chunk.base + Math.max(0, chunk.text.length - 1))
    ];
    onChunk?.(index + 1, chunks.length, pages);
    // 002.23: the same text, by the same prompt and model, has the same answer: a part that failed
    // is read again and the parts that were read are not. Never for "Extract again".
    const memoKey =
      memo === undefined
        ? undefined
        : createHash('sha1').update(`${memoSalt}\0${PROMPT_VERSION}\0${chunk.text}`).digest('hex');
    let answer = memoKey === undefined ? undefined : memo.get(memoKey);
    const cached = answer !== undefined;
    const request = {
      instructions: INSTRUCTIONS,
      text: chunk.text,
      itemSchema: ITEM_SCHEMA,
      maxItems: Math.min(MAX_ITEMS_PER_CHUNK, maxItems ?? MAX_ITEMS_PER_CHUNK)
    };
    // 002.9 DEC-2: what a recording's replay checks beside the length — a hash of
    // the chunk's text (never the text) and the instructions' version.
    const sent =
      onCall === undefined
        ? undefined
        : {
            chunk: index + 1,
            base: chunk.base,
            length: chunk.text.length,
            textSha256: createHash('sha256').update(chunk.text).digest('hex'),
            promptVersion: PROMPT_VERSION
          };
    for (let attempt = 1; attempt <= 2 && answer === undefined; attempt += 1) {
      if (signal?.aborted) throw new ServiceError('cancelled');
      try {
        answer = await ai.extract(request);
        onAnswer?.();
        onCall?.({ ...sent, attempt, answer });
      } catch (error) {
        const code = error instanceof AiError ? error.code : 'provider_error';
        // The call was cut because the user stopped the reading: not a provider error.
        if (signal?.aborted) throw new ServiceError('cancelled');
        onCall?.({ ...sent, attempt, error: code });
        codes.push(code);
        if (!RETRIED.has(code)) {
          // 002.16: a refusal of the chosen provider is the whole job's, not a chunk's: the next
          // chunk would be refused the same way, so the first one ends it.
          if (REFUSED.has(code)) throw error;
          break;
        }
      }
    }
    if (answer === undefined) {
      failed += 1;
      onPart?.({ n: index + 1, of: chunks.length, pages, state: 'failed', cached: false, rules: 0, total: rules.size });
      continue;
    }
    if (!cached) memo?.set(memoKey, answer);
    model ??= { providerId: answer.providerId, model: answer.model };
    weakest =
      weakest === undefined || WEAKEST.indexOf(answer.constraint) < WEAKEST.indexOf(weakest) ? answer.constraint : weakest;
    for (const rejection of answer.rejected ?? []) {
      if (String(rejection.reason).startsWith('passage-')) dropped.passageNotFound += 1;
      else if (rejection.reason === 'over-limit') dropped.overLimit += 1;
      else dropped.schemaInvalid += 1;
    }
    const normalisedChunk = normaliseText(chunk.text);
    const before = rules.size;
    for (const item of answer.items) {
      const rule = placeItem({ prepared, chunk, normalisedChunk, item, sectorCodes, dropped });
      if (rule !== undefined && !rules.has(ruleKey(rule))) rules.set(ruleKey(rule), rule);
    }
    onPart?.({ n: index + 1, of: chunks.length, pages, state: 'done', cached, rules: rules.size - before, total: rules.size });
  }

  return {
    rules: [...rules.values()].sort((a, b) => a.offset.start - b.offset.start),
    dropped,
    chunks: { of: chunks.length, failed },
    codes,
    model: model === undefined ? undefined : { ...model, constraint: weakest }
  };
}
