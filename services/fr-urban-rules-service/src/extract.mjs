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

import { AiError, BUDGET_EXHAUSTED } from './ai-client.mjs';
import { ServiceError } from './errors.mjs';
import { allOccurrences, normalisePassage, normaliseText } from './normalise.mjs';
import { articleAt, pageAt } from './text.mjs';

/**
 * Sprint 002.33 raises both: 2 and 4. The result's shape is unchanged (one rule per sector) but the answer the model
 * is asked for is not (`appliesTo`, not `sector`), so every reading made by the earlier prompt is read again once:
 * the schema bump empties the cache at the service's start, the prompt bump changes every result's key.
 */
export const SCHEMA_VERSION = 2;
export const PROMPT_VERSION = 4;
/** What the service reads with since 002.33: the sectors expanded by the code. `extractChapter`'s own default stays the earlier reading, which the recorded fixtures replay. */
export const SECTORS_IN_CODE = true;
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
/**
 * 096.7's codes worth one retry (at once, as for every code here: there is no backoff); any other
 * ends the chunk at once. Sprint 002.27: `ai_budget_unavailable` (HTTP 503) is ai-service saying its
 * ledger could not be reached — transient, so retried like `provider_error`.
 */
const RETRIED = new Set([
  'output_truncated',
  'output_invalid',
  'provider_error',
  'unreachable',
  'malformed',
  'ai_budget_unavailable'
]);

/**
 * Sprint 002.27: what a budget stop says, as the job answers it — `{ reason: 'ai-budget',
 * detailReason?, remainingMicrousd?, budgetMicrousd?, resetsAt? }`, each number only when ai-service
 * sent it well-formed. `detailReason` is ai-service's own (`exhausted`, `held`, `run-ceiling`,
 * `floor`, `unavailable`). Never ai-service's message: the panel words the stop in its own language.
 */
export function stopOf(error) {
  const b = error?.budget ?? {};
  return {
    reason: 'ai-budget',
    ...(b.reason === undefined ? {} : { detailReason: b.reason }),
    ...(b.remainingMicrousd === undefined ? {} : { remainingMicrousd: b.remainingMicrousd }),
    ...(b.budgetMicrousd === undefined ? {} : { budgetMicrousd: b.budgetMicrousd }),
    ...(b.resetsAt === undefined ? {} : { resetsAt: b.resetsAt })
  };
}

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
export const MINIMUM_KINDS = new Set([
  'road_setback',
  'boundary_setback',
  'building_distance',
  'green_ratio'
]);

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
  required: [
    'kind',
    'sector',
    'statement',
    'limit',
    'strip',
    'conditions',
    'exceptions',
    'confidence'
  ],
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
            base: {
              enum: ['plot_area', 'emprise', 'surface_de_plancher', 'existing_emprise', 'other']
            }
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
  "statement — limit: the text sets a value (fill limit); not_regulated: the text says the matter is not regulated (« n'est pas réglementé »), return these, never omit them; see_graphic: the value is given on the graphic documents (« figure aux documents graphiques »); described: a rule in words with no value. For not_regulated, see_graphic and described, limit is null.",
  'limit — value: a number with its unit as written (m, m2 or percent), never converted, never computed; comparison is min for « au moins », « minimum », and max for « au plus », « maximum », « ne peut excéder ». ratio: a percentage of a base. height_relative: a distance against a height, as « R ≥ Hf - 4 m, avec un minimum de 2 mètres » (reference facade_height, factor 1, offsetMetres -4, minimumMetres 2) or « D ≥ Hf/2 » (factor 0.5).',
  "strip — null, except for a height limit (height_total or height_facade) that holds only within a strip along the plot limits, as « dans une bande de 0 à 4 mètres à compter de la limite séparative » or « sur une profondeur de 5 mètres ». Then { depthMetres: the strip's width from the limit as the text writes it (4 for « de 0 à 4 mètres »), edges: all, street (alignment, voies), side (limites latérales), rear (limite de fond de parcelle) or side_rear (limites séparatives), permits: true when the text lets a construction stand in the strip on condition of that height — a derogation from a setback — and false when it only limits the height there }. A sentence that sets a setback and lets lower constructions stand within it is two items: the setback, and the height limit with its strip (permits true). A height limit that holds only in a strip never comes without its strip.",
  'sector — the sector the rule applies to, spelled as the text spells it (« UCe1b »), or JSON null (not the word "null") when it applies to the whole zone. When the same sentence applies to several sectors, return one item per sector.',
  'passage — one contiguous quotation from the text, copied exactly, that states the rule: the sentence, not a paraphrase.',
  'conditions and exceptions — short phrases copied exactly from the text just before or in the passage (« Dans le secteur UCe1b »), never reworded; empty when there are none.',
  'confidence — high when the passage states the rule plainly, medium or low otherwise.'
].join('\n');

// Sectors in code (Sprint 002.33) ---------------------------------------------------------------

/**
 * Sprint 002.33. The model says **where** a rule applies and the code gives one item per sector, instead of the
 * model repeating each item for each sector (which it does badly: on a four-sector zone about a third of the
 * rules were never read). Behind `extractChapter`'s `sectorsInCode` option; the reading as it ships is unchanged.
 */
export const INSTRUCTIONS_SECTORS_IN_CODE = INSTRUCTIONS.replace(
  'one item per rule and per sector.',
  'one item per rule.'
).replace(
  /^sector — .*$/mu,
  'applies — where the rule applies: "zone" when it is the zone\'s own rule and the text names no sector; "all" when the text states it for the zone and every one of its sectors; otherwise an array of the sector codes it names, spelled as the text spells them (« UDa », « UCe1b »), the zone\'s own code standing for the zone itself. One item per rule: never repeat an item for each sector, list the sectors in appliesTo.'
);

/** The item schema with `appliesTo` in place of `sector`. */
export const ITEM_SCHEMA_SECTORS_IN_CODE = Object.freeze({
  ...ITEM_SCHEMA,
  required: ITEM_SCHEMA.required.map((name) => (name === 'sector' ? 'appliesTo' : name)),
  properties: Object.fromEntries(
    Object.entries(ITEM_SCHEMA.properties).flatMap(([name, schema]) =>
      name === 'sector'
        ? [
            [
              'appliesTo',
              {
                anyOf: [
                  { const: 'zone' },
                  { const: 'all' },
                  {
                    type: 'array',
                    minItems: 1,
                    maxItems: 12,
                    items: { type: 'string', maxLength: 40 }
                  }
                ]
              }
            ]
          ]
        : [[name, schema]]
    )
  )
});

const squashCode = (code) => String(code).toLowerCase().replace(/\s+/gu, '');

/**
 * The chapter's zone code and its sector codes, from its own text. The sectors are the codes the chapter writes
 * (« UDa », « UDa1 ») that start with the zone's code and are longer: a heading is not needed (the zone UD of the
 * Pays d'Aix has four sectors and no heading names one). The zone's code is the longest common prefix of the
 * codes that share their first two characters; failing that, the first « Zone XX » near the top of the text.
 */
export function sectorsOfChapter(prepared) {
  const mentions = [...new Set(prepared.sectors.map((s) => s.code))];
  const groups = new Map();
  for (const code of mentions)
    groups.set(code.slice(0, 2), [...(groups.get(code.slice(0, 2)) ?? []), code]);
  const cluster = [...groups.values()]
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  let zone;
  if (cluster !== undefined) {
    zone = cluster.reduce((prefix, code) => {
      let i = 0;
      while (i < prefix.length && i < code.length && prefix[i] === code[i]) i += 1;
      return prefix.slice(0, i);
    });
  } else {
    for (const m of prepared.text
      .slice(0, 1500)
      .matchAll(/\bzone[ \t]+([A-Za-z][A-Za-z0-9]{0,7})(?![A-Za-z0-9])/giu)) {
      if (/^[A-Z]/u.test(m[1])) {
        zone = m[1];
        break;
      }
    }
  }
  if (zone === undefined || zone === '') return { zone: undefined, sectors: [] };
  const sectors = mentions.filter(
    (code) => code.length > zone.length && code.toLowerCase().startsWith(zone.toLowerCase())
  );
  return { zone, sectors };
}

/**
 * What an item's `appliesTo` stands for: `{ sectors, unknown? }`, sectors being codes as the chapter spells them
 * and `null` for the zone itself. A code that is not a sector of the chapter is returned in `unknown`, never repaired.
 */
export function expandAppliesTo(appliesTo, { zone, sectors }) {
  if (appliesTo === 'zone') return { sectors: [null] };
  if (appliesTo === 'all') return { sectors: [null, ...sectors] };
  if (!Array.isArray(appliesTo) || appliesTo.length === 0) return { sectors: [], unknown: [] };
  const out = [];
  const unknown = [];
  for (const code of appliesTo) {
    if (typeof code !== 'string' || code.trim() === '') continue;
    const spelled =
      zone !== undefined && squashCode(code) === squashCode(zone)
        ? null
        : sectors.find((s) => squashCode(s) === squashCode(code));
    if (spelled === undefined) unknown.push(code.trim());
    else if (!out.includes(spelled)) out.push(spelled);
  }
  return unknown.length === 0 ? { sectors: out } : { sectors: out, unknown };
}

// Chunks --------------------------------------------------------------------------

/**
 * The chapter cut at article headings into chunks of at most `max`
 * characters: `[{ base, text }]`. A stretch with no heading inside the limit
 * is cut at a line end, and only failing that mid-line.
 */
export function splitChunks(prepared, max = MAX_CHUNK_CHARS) {
  if (!Number.isInteger(max) || max < 1)
    throw new RangeError(`chunk size must be a positive integer, not ${max}`);
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

const METRE_KINDS = new Set([
  'road_setback',
  'boundary_setback',
  'building_distance',
  'height_total',
  'height_facade'
]);

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
      return (
        (limit.kind === 'value' && (limit.unit === 'm2' || limit.unit === 'percent')) ||
        limit.kind === 'ratio'
      );
    default:
      return true; // parking, other
  }
}

/** False when a value or ratio's comparison disagrees with the package's floors and caps. */
export function comparisonAgrees(value) {
  const { kind, limit } = value;
  // `other` has no direction, and `parking` is as often a minimum (places) as a cap.
  if (
    kind === 'other' ||
    kind === 'parking' ||
    limit === null ||
    (limit.kind !== 'value' && limit.kind !== 'ratio')
  )
    return true;
  return limit.comparison === (MINIMUM_KINDS.has(kind) ? 'min' : 'max');
}

/**
 * Every number the passage writes: « 1 500 » and « 1,5 » are one number each.
 */
export function numbersIn(passage) {
  const text = String(passage).normalize('NFKC');
  // Not a digit inside a word: « m2 », « UCe1b » write no number.
  return [
    ...text.matchAll(
      /(?<![\p{L}\d])(?:\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/gu
    )
  ].map((m) => Number(m[0].replace(/[ \u00A0\u202F]/gu, '').replace(',', '.')));
}

/** The numbers a limit claims, which the passage must write (S1 of the 002.5b review). */
function claimedNumbers(limit) {
  if (limit === null || typeof limit !== 'object') return [];
  if (limit.kind === 'value') return [limit.value];
  if (limit.kind === 'ratio') return [limit.percent];
  if (limit.kind === 'height_relative') {
    return [
      limit.minimumMetres,
      limit.offsetMetres === null ? null : Math.abs(limit.offsetMetres)
    ].filter((n) => typeof n === 'number');
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

const sameCode = (a, b) =>
  normalisePassage(a).replace(/\s+/gu, '').toLowerCase() ===
  normalisePassage(b).replace(/\s+/gu, '').toLowerCase();

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
    !(
      typeof strip.depthMetres === 'number' &&
      strip.depthMetres >= 0.1 &&
      strip.depthMetres <= 50
    ) ||
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
  const window = normaliseText(
    prepared.text.slice(windowStart, Math.min(prepared.text.length, end + CONDITION_WINDOW_AFTER))
  );
  /** The phrase as the text writes it (a slice of the source), or `undefined`. */
  const verbatim = (phrase) => {
    const needle = normalisePassage(phrase);
    const at = needle.length >= MIN_CONDITION_LENGTH ? window.normalised.indexOf(needle) : -1;
    if (at < 0) {
      dropped.conditionNotVerbatim += 1;
      return undefined;
    }
    return prepared.text.slice(
      windowStart + window.starts[at],
      windowStart + window.ends[at + needle.length - 1]
    );
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
  const sectorUnplaced =
    value.sector !== null && ![...sectorCodes].some((code) => sameCode(code, value.sector));
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

/** One answer item as one item per sector, each then checked and placed like any other; none if it names no usable sector. */
function expandedItems(item, sectorInfo, dropped) {
  const { sectors, unknown = [] } = expandAppliesTo(item.value.appliesTo, sectorInfo);
  if (unknown.length > 0) dropped.unknownSector = (dropped.unknownSector ?? 0) + 1;
  else if (sectors.length === 0) dropped.schemaInvalid += 1;
  const { appliesTo: _appliesTo, ...value } = item.value;
  return sectors.map((sector) => ({ ...item, value: { ...value, sector } }));
}

function ruleKey(rule) {
  return JSON.stringify([
    rule.kind,
    rule.sector,
    rule.limit,
    rule.strip,
    normalisePassage(rule.passage)
  ]);
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
 * @returns {Promise<{ rules, dropped, chunks: { of, failed, unread? }, codes: string[], model, stopped? }>}
 *   Sprint 002.27: `stopped` (see {@link stopOf}) and `chunks.unread` — the chunks neither read nor failed,
 *   because the account's AI budget ran out at one (it and every chunk after it) — are present only then;
 *   the rules of the chunks read before it are returned like any partial result's.
 */
export async function extractChapter({
  prepared,
  ai,
  maxTextLength,
  maxItems,
  chunkChars,
  onChunk,
  onPart,
  onCall,
  onAnswer,
  signal,
  memo,
  memoSalt = '',
  sectorsInCode = false
}) {
  const chunks = splitChunks(
    prepared,
    Math.min(MAX_CHUNK_CHARS, chunkChars ?? MAX_CHUNK_CHARS, maxTextLength ?? MAX_CHUNK_CHARS)
  );
  const sectorCodes = new Set(prepared.sectors.filter((s) => s.heading).map((s) => s.code));
  // Sprint 002.33: the sectors expanded by the code. The model is told the zone and its sectors, as found in the text.
  const sectorInfo = sectorsInCode ? sectorsOfChapter(prepared) : undefined;
  const instructions =
    sectorInfo === undefined
      ? INSTRUCTIONS
      : sectorInfo.zone === undefined
        ? INSTRUCTIONS_SECTORS_IN_CODE
        : `${INSTRUCTIONS_SECTORS_IN_CODE}\nZone: ${sectorInfo.zone}. ${sectorInfo.sectors.length === 0 ? 'This zone has no sector.' : `Sectors of this zone: ${sectorInfo.sectors.join(', ')}.`}`;
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
  let stopped;
  let unread = 0;

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
        : createHash('sha1')
            .update(
              `${memoSalt}\0${PROMPT_VERSION}${sectorsInCode ? '\0sectors-in-code' : ''}\0${chunk.text}`
            )
            .digest('hex');
    let answer = memoKey === undefined ? undefined : memo.get(memoKey);
    const cached = answer !== undefined;
    const request = {
      instructions,
      text: chunk.text,
      itemSchema: sectorsInCode ? ITEM_SCHEMA_SECTORS_IN_CODE : ITEM_SCHEMA,
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
        if (code === BUDGET_EXHAUSTED) {
          // 002.27: the account cannot pay for another call, so no chunk after this one can be
          // asked: the job ends here with what it read, and says why. Not retried, not counted as failed.
          stopped = stopOf(error);
          break;
        }
        if (!RETRIED.has(code)) {
          // 002.16: a refusal of the chosen provider is the whole job's, not a chunk's: the next
          // chunk would be refused the same way, so the first one ends it.
          if (REFUSED.has(code)) throw error;
          break;
        }
      }
    }
    if (stopped !== undefined) {
      unread = chunks.length - index;
      // The refused part was announced as running: it was not read.
      onPart?.({
        n: index + 1,
        of: chunks.length,
        pages,
        state: 'waiting',
        cached: false,
        rules: 0,
        total: rules.size
      });
      break;
    }
    if (answer === undefined) {
      failed += 1;
      onPart?.({
        n: index + 1,
        of: chunks.length,
        pages,
        state: 'failed',
        cached: false,
        rules: 0,
        total: rules.size
      });
      continue;
    }
    if (!cached) memo?.set(memoKey, answer);
    model ??= { providerId: answer.providerId, model: answer.model };
    weakest =
      weakest === undefined || WEAKEST.indexOf(answer.constraint) < WEAKEST.indexOf(weakest)
        ? answer.constraint
        : weakest;
    for (const rejection of answer.rejected ?? []) {
      if (String(rejection.reason).startsWith('passage-')) dropped.passageNotFound += 1;
      else if (rejection.reason === 'over-limit') dropped.overLimit += 1;
      else dropped.schemaInvalid += 1;
    }
    const normalisedChunk = normaliseText(chunk.text);
    const before = rules.size;
    for (const item of answer.items) {
      for (const placed of sectorsInCode ? expandedItems(item, sectorInfo, dropped) : [item]) {
        const rule = placeItem({
          prepared,
          chunk,
          normalisedChunk,
          item: placed,
          sectorCodes,
          dropped
        });
        if (rule !== undefined && !rules.has(ruleKey(rule))) rules.set(ruleKey(rule), rule);
      }
    }
    onPart?.({
      n: index + 1,
      of: chunks.length,
      pages,
      state: 'done',
      cached,
      rules: rules.size - before,
      total: rules.size
    });
  }

  return {
    rules: [...rules.values()].sort((a, b) => a.offset.start - b.offset.start),
    dropped,
    chunks: { of: chunks.length, failed, ...(stopped === undefined ? {} : { unread }) },
    codes,
    model: model === undefined ? undefined : { ...model, constraint: weakest },
    ...(stopped === undefined ? {} : { stopped })
  };
}
