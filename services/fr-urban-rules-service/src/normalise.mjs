/**
 * The verbatim check's normalisation, copied from ai-service's
 * `src/structured/quotation.ts` (platform Sprint 096.7 DEC-3 and its review).
 * Copied, not imported: a service imports nothing of the platform (ADR-0114
 * Rule 1). Keep the two in step when 096.7's changes.
 *
 * 1. Unicode NFKC, per base character and its combining marks;
 * 2. every quotation mark → `'` or `"` by its family, every dash → `-`;
 * 3. soft hyphens and zero-width characters (U+200B–U+200D, U+2060) removed;
 * 4. every run of white space → one space; trimmed.
 *
 * Case and accents are kept. Offsets map back to the original text (UTF-16).
 */

const DOUBLE_QUOTES = new Set(['"', '«', '»', '“', '”', '„', '‟', '⹂', '〝', '〞', '〟']);
const QUOTE_LIKE = /^[\p{Pi}\p{Pf}'ʼ‚]$/u;
const DASH = /^[‐-―−]$/u;
const SOFT_HYPHEN = '­';
const ZERO_WIDTH = /^[​-‍⁠]$/u;
const WHITE_SPACE = /^\s$/u;
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gsu;

function foldCharacter(character) {
  if (character === SOFT_HYPHEN || ZERO_WIDTH.test(character)) return '';
  if (DOUBLE_QUOTES.has(character)) return '"';
  if (QUOTE_LIKE.test(character)) return "'";
  if (DASH.test(character)) return '-';
  return character;
}

/** `{ normalised, starts, ends }`: each normalised unit's span in the original. */
export function normaliseText(text) {
  let normalised = '';
  const starts = [];
  const ends = [];
  let pendingSpace;
  for (const match of String(text).matchAll(CLUSTER)) {
    const clusterStart = match.index;
    const clusterEnd = clusterStart + match[0].length;
    for (const character of match[0].normalize('NFKC')) {
      const folded = foldCharacter(character);
      if (folded === '') continue;
      if (WHITE_SPACE.test(folded)) {
        pendingSpace =
          pendingSpace === undefined
            ? { start: clusterStart, end: clusterEnd }
            : { start: pendingSpace.start, end: clusterEnd };
        continue;
      }
      if (pendingSpace !== undefined) {
        if (normalised.length > 0) {
          normalised += ' ';
          starts.push(pendingSpace.start);
          ends.push(pendingSpace.end);
        }
        pendingSpace = undefined;
      }
      normalised += folded;
      for (let unit = 0; unit < folded.length; unit += 1) {
        starts.push(clusterStart);
        ends.push(clusterEnd);
      }
    }
  }
  return { normalised, starts, ends };
}

export function normalisePassage(passage) {
  return normaliseText(passage).normalised;
}

/** Every occurrence of `passage` in a normalised text, as original `{ start, end }` offsets. */
export function allOccurrences(normalisedText, passage) {
  const needle = normalisePassage(passage);
  const found = [];
  if (needle === '') return found;
  for (let at = normalisedText.normalised.indexOf(needle); at >= 0; at = normalisedText.normalised.indexOf(needle, at + 1)) {
    found.push({ start: normalisedText.starts[at], end: normalisedText.ends[at + needle.length - 1] });
  }
  return found;
}
