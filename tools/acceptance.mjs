/**
 * Sprint 002.9 (Design-Time Acceptance FR): what the recording tool and both
 * suites share about the acceptance extractions — pure functions, no network,
 * no file written.
 *
 * - `recorderOptions` — `tools/record-fixtures.mjs`'s arguments, with DEC-3's
 *   `--acceptance` and `--no-model`, refused when they make no sense.
 * - `callMetadata` — a recorded 096.7 call's request metadata: 002.5b's five
 *   fields, and with `--acceptance` DEC-2's `textSha256` and `promptVersion`
 *   (a hash of the chunk's text, never the text; never a key).
 * - `replayAi` — an `ai` client that answers a recording's calls in order and
 *   fails, naming the command to record again, when a call's text length — and
 *   for an acceptance recording its text hash or instructions' version — is not
 *   the recorded one (criterion 6).
 * - `judgeExtraction` — DEC-4's judgement of an extraction result against
 *   `test-fixtures/fr-urban-rules/acceptance/expected-002.9.json`.
 * - `documentDifferences` — `--check --extraction --no-model`'s comparison of
 *   the document fetched now with the recorded one (criterion 7).
 */

import { createHash } from 'node:crypto';

export const EXPECTED_URL = new URL(
  '../test-fixtures/fr-urban-rules/acceptance/expected-002.9.json',
  import.meta.url
);
export const ACCEPTANCE_URL = new URL('../test-fixtures/fr-urban-rules/acceptance/', import.meta.url);
export const PLOTS = ['lyon', 'gordes', 'mouzay', 'brouennes', 'rochefort'];

/** The command that records a plot's acceptance extraction again (DEC-3). */
export const recordCommand = (plot) => `node tools/record-fixtures.mjs ${plot} --extraction --acceptance`;

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const USAGE =
  'usage: node tools/record-fixtures.mjs <plot> [--check | --trim]\n' +
  '       node tools/record-fixtures.mjs <plot> --extraction [--acceptance] [--check [--no-model]]';

/**
 * The recording tool's options. `--acceptance` and `--no-model` need
 * `--extraction`; `--no-model` also needs `--check` (it writes nothing).
 * @param {string[]} argv the arguments after the script's name
 */
export function recorderOptions(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const known = new Set(['--check', '--trim', '--extraction', '--acceptance', '--no-model']);
  const unknown = [...flags].filter((f) => !known.has(f));
  const plots = argv.filter((a) => !a.startsWith('--'));
  const fail = (why) => {
    throw new Error(`${why}\n${USAGE}`);
  };
  if (unknown.length > 0) fail(`unknown option ${unknown.join(', ')}`);
  if (plots.length !== 1 || !PLOTS.includes(plots[0])) fail(`name one plot of ${PLOTS.join(', ')}`);
  const options = {
    plot: plots[0],
    check: flags.has('--check'),
    trim: flags.has('--trim'),
    extraction: flags.has('--extraction'),
    acceptance: flags.has('--acceptance'),
    noModel: flags.has('--no-model')
  };
  if (options.check && options.trim) fail('--check and --trim do not go together');
  if (options.extraction && options.trim) fail('--trim is for the planning answers, not an extraction');
  if (options.acceptance && !options.extraction) fail('--acceptance goes with --extraction');
  if (options.noModel && !(options.extraction && options.check)) fail('--no-model goes with --check --extraction');
  return options;
}

/**
 * A recorded call's request metadata (002.5b DEC-11; 002.9 DEC-2 with
 * `acceptance`). Never the text, never a key.
 */
export function callMetadata(record, { acceptance = false, aiServiceUrl }) {
  return {
    chunk: record.chunk,
    attempt: record.attempt,
    base: record.base,
    textLength: record.length,
    ...(acceptance ? { textSha256: record.textSha256, promptVersion: record.promptVersion } : {}),
    aiServiceUrl
  };
}

/**
 * An `ai` client replaying a recording's calls in order (`recorded.test.mjs`'s
 * pattern). Each request's text must have the recorded length; with
 * `acceptance` (or when the recording carries them) its sha256 and the current
 * `promptVersion` must equal the recorded ones. A mismatch throws a
 * `ReplayMismatch` naming the chunk, the field and the command to record again.
 *
 * @param {{ calls: { request: object, response?: object, error?: string }[] }} recording
 * @param {{ plot: string, promptVersion: number, acceptance?: boolean, errorFor?: (code: string) => Error }} options
 */
export function replayAi(recording, { plot, promptVersion, acceptance = false, errorFor }) {
  const calls = recording.calls ?? [];
  let next = 0;
  const mismatches = [];
  const mismatch = (call, field, recorded, now) => {
    const error = new Error(
      `${plot}: chunk ${call.request.chunk} (attempt ${call.request.attempt}) — ${field} differs from the recording ` +
        `(recorded ${JSON.stringify(recorded)}, now ${JSON.stringify(now)}). The text, its chunking or the ` +
        `instructions changed since it was recorded: record it again with \`${recordCommand(plot)}\` ` +
        `(the production model, 002.9 DEC-7).`
    );
    error.name = 'ReplayMismatch';
    error.field = field;
    mismatches.push(error);
    return error;
  };
  return {
    ai: {
      async extract(request) {
        const call = calls[next];
        next += 1;
        if (call === undefined) {
          throw mismatch({ request: { chunk: '?', attempt: '?' } }, 'call count', calls.length, next);
        }
        const meta = call.request;
        if (request.text.length !== meta.textLength) {
          throw mismatch(call, 'textLength', meta.textLength, request.text.length);
        }
        const hashed = meta.textSha256 !== undefined || meta.promptVersion !== undefined;
        if (acceptance || hashed) {
          const now = sha256(request.text);
          if (meta.textSha256 !== now) throw mismatch(call, 'textSha256', meta.textSha256 ?? null, now);
          if (meta.promptVersion !== promptVersion) {
            throw mismatch(call, 'promptVersion', meta.promptVersion ?? null, promptVersion);
          }
        }
        if (call.error !== undefined) {
          throw errorFor === undefined ? Object.assign(new Error(call.error), { code: call.error }) : errorFor(call.error);
        }
        return call.response;
      }
    },
    /** Calls the recording holds that the replay never asked for. */
    remaining: () => calls.length - next,
    mismatches
  };
}

// ── DEC-4: the judgement ─────────────────────────────────────────────────────

/** Whitespace, ligatures (NFKC), apostrophes, the definition asterisk and case normalised. */
export function normalisePhrase(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const sameNumber = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9;

/** An expected limit against a result's: kind, comparison, and value + unit or percent + base, exactly. */
export function sameLimit(expected, actual) {
  if (actual === null || actual === undefined || actual.kind !== expected.kind) return false;
  if (expected.comparison !== undefined && actual.comparison !== expected.comparison) return false;
  if (expected.kind === 'value') return sameNumber(actual.value, expected.value) && actual.unit === expected.unit;
  if (expected.kind === 'ratio') return sameNumber(actual.percent, expected.percent) && actual.base === expected.base;
  return Object.entries(expected).every(([key, value]) =>
    typeof value === 'number' ? sameNumber(actual[key], value) : actual[key] === value
  );
}

const kindsOf = (row) => row.kindAnyOf ?? (row.kind === undefined ? [] : [row.kind]);
const sameSector = (expected, actual) =>
  expected === undefined ||
  (expected === null ? actual === null || actual === undefined : String(actual ?? '').toLowerCase() === expected.toLowerCase());
const numeric = (rule) => rule.limit !== null && rule.limit !== undefined && (rule.limit.kind === 'value' || rule.limit.kind === 'ratio');

/** What makes `rule` miss `row`, field by field; empty when it matches. */
export function rowMisses(row, rule) {
  const misses = [];
  if (!kindsOf(row).includes(rule.kind)) misses.push(`kind ${rule.kind}`);
  if (row.statement !== undefined && rule.statement !== row.statement) misses.push(`statement ${rule.statement}`);
  if (!sameSector(row.sector, rule.sector)) misses.push(`sector ${rule.sector}`);
  if (row.limitAnyOf !== undefined) {
    if (!row.limitAnyOf.some((limit) => sameLimit(limit, rule.limit))) misses.push(`limit ${JSON.stringify(rule.limit)}`);
  } else if (row.statement !== undefined && row.statement !== 'limit' && numeric(rule)) {
    misses.push(`a limit on a ${row.statement} rule`);
  }
  if (row.pages !== undefined && !(rule.page >= row.pages[0] && rule.page <= row.pages[1])) misses.push(`page ${rule.page}`);
  const passage = normalisePhrase(rule.passage);
  if (row.phrases !== undefined && !row.phrases.some((phrase) => passage.includes(normalisePhrase(phrase)))) {
    misses.push('passage');
  }
  const around = normalisePhrase([...(rule.conditions ?? []), ...(rule.exceptions ?? [])].join(' | '));
  for (const phrase of row.expectedConditions ?? []) {
    if (!around.includes(normalisePhrase(phrase))) misses.push(`condition « ${phrase} »`);
  }
  return misses;
}

function forbiddenHit(row, rule) {
  if (!kindsOf(row).includes(rule.kind)) return false;
  if (row.numericLimit && !numeric(rule)) return false;
  if (row.unconditional && (rule.conditions ?? []).length > 0) return false;
  if (row.limitEquals !== undefined && !sameLimit(row.limitEquals, rule.limit)) return false;
  return true;
}

/**
 * DEC-4 on one plot: every required row matched by a rule, no forbidden row
 * hit; extras listed (those `alsoAccepted` names marked), never failed.
 *
 * @returns {{ passed: boolean, failures: { id: string, why: string }[], matched: Record<string, number>, extras: { index: number, rule: string, accepted: boolean }[] }}
 */
export function judgeExtraction(expectedPlot, result) {
  const rules = result?.rules ?? [];
  const extraction = expectedPlot.extraction ?? {};
  const failures = [];
  const matched = {};
  const used = new Set();
  for (const row of extraction.required ?? []) {
    const index = rules.findIndex((rule, i) => !used.has(i) && rowMisses(row, rule).length === 0);
    if (index >= 0) {
      used.add(index);
      matched[row.id] = index;
      continue;
    }
    // The nearest candidate (same kind, fewest misses) says what differs.
    let best;
    for (const rule of rules) {
      if (!kindsOf(row).includes(rule.kind)) continue;
      const misses = rowMisses(row, rule);
      if (best === undefined || misses.length < best.length) best = misses;
    }
    failures.push({
      id: row.id,
      why: best === undefined ? `no ${kindsOf(row).join(' or ')} rule extracted` : `nearest ${kindsOf(row).join('/')} rule misses: ${best.join(', ')}`
    });
  }
  for (const row of extraction.forbidden ?? []) {
    const hit = rules.findIndex((rule) => forbiddenHit(row, rule));
    if (hit >= 0) {
      failures.push({ id: row.id, why: `forbidden: ${describe(rules[hit])} (${row.why})` });
    }
  }
  const extras = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ index }) => !used.has(index))
    .map(({ rule, index }) => ({
      index,
      rule: describe(rule),
      accepted: (extraction.alsoAccepted ?? []).some(
        (row) =>
          kindsOf(row).includes(rule.kind) &&
          (row.pages === undefined || (rule.page >= row.pages[0] && rule.page <= row.pages[1]))
      )
    }));
  return { passed: failures.length === 0, failures, matched, extras };
}

function describe(rule) {
  return `${rule.kind} ${rule.sector ?? '*'} ${rule.statement} ${JSON.stringify(rule.limit)} p.${rule.page}`;
}

// ── Criterion 7: the document now against the recorded one ──────────────────

/**
 * @param {{ fresh: { sha256: string, pages: number, idurba: string, nomfic: string, chapterPages: [number, number] },
 *           meta: object, stored?: object, expected?: object }} input
 * @returns {{ what: string, recorded: unknown, now: unknown }[]}
 */
export function documentDifferences({ fresh, meta, stored, expected }) {
  const out = [];
  const compare = (what, recorded, now) => {
    if (recorded === undefined) return;
    const a = typeof recorded === 'string' && what.startsWith('idurba') ? recorded.toUpperCase() : recorded;
    const b = typeof now === 'string' && what.startsWith('idurba') ? now.toUpperCase() : now;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ what, recorded, now });
  };
  compare('sha256 (regulation/meta.json)', meta?.sha256, fresh.sha256);
  compare('pages (regulation/meta.json)', meta?.pages, fresh.pages);
  compare('idurba (regulation/meta.json)', meta?.idurba, fresh.idurba);
  compare('nomfic (regulation/meta.json)', meta?.nomfic, fresh.nomfic);
  compare('sha256 (extraction/result.json)', stored?.document?.sha256, fresh.sha256);
  compare('chapter pages (extraction/result.json)', stored?.chapter?.pages, fresh.chapterPages);
  compare('sha256 (expected-002.9.json)', expected?.document?.sha256, fresh.sha256);
  compare('chapter pages (expected-002.9.json)', expected?.chapter?.pages, fresh.chapterPages);
  return out;
}
