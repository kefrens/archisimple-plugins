/**
 * The loop guard of a transcription (Sprint 002.30, Addendum A, DEC-A5).
 *
 * A local vision model sometimes degenerates on a page it cannot read (stamps, handwriting, a rotated plan): it answers a run of
 * « [illisible] » until its output cap. Measured 2026-11-21 on a scanned règlement: two pages out of 17 came back as 985 of 1,000
 * lines of « [illisible] », 140 s each on a laptop with a GPU and 35 minutes each on a CPU-only host. Such a reply is not a
 * transcript: handed on, it would dilute the extraction's text and look like a reading.
 *
 * **What this can and cannot do.** It judges a FINISHED reply. The AI service's plain `chat` route is not streamed, so nothing here
 * can stop a page while it is being generated: the cost of a loop is bounded by the output cap and the page's timeout, and it is
 * the platform that would have to stream (or accept a stop sequence) for an earlier stop. `repetitionRatio` takes any prefix of a
 * reply, so a streaming client could call it as the text grows.
 *
 * Pure, no clock, no model, no I/O.
 */

/** A run is an n-gram of 1 to this many words repeated back to back. */
const MAX_PERIOD = 8;
/** Repeats in a row before a run counts: 12 for one word, 6 for a longer n-gram (a table's identical rows are shorter than that). */
const MIN_REPEATS_ONE_WORD = 12;
const MIN_REPEATS = 6;
/** A reply shorter than this is never judged (the « illegible » flag handles a page that is mostly unreadable). */
const MIN_WORDS = 24;

/** The reply is degenerate from this share of redundant words; from the lower one when it hit the output cap. */
export const DEGENERATE_RATIO = 0.5;
export const DEGENERATE_RATIO_AT_CAP = 0.2;

const wordsOf = (text) => text.split(/\s+/u).filter(Boolean);

/**
 * The share of a reply's words that repeat a run before them: 0 for prose and tables, near 1 for a loop. A run of `reps`
 * repetitions of an n-gram of `p` words counts `(reps - 1) * p` redundant words (the first occurrence says something).
 */
export function repetitionRatio(text) {
  const tokens = wordsOf(text);
  const n = tokens.length;
  if (n < MIN_WORDS) return 0;
  let redundant = 0;
  let i = 0;
  while (i < n) {
    let best;
    for (let p = 1; p <= MAX_PERIOD && i + p <= n; p += 1) {
      let reps = 1;
      while (i + (reps + 1) * p <= n && sameRun(tokens, i, i + reps * p, p)) reps += 1;
      if (reps >= (p === 1 ? MIN_REPEATS_ONE_WORD : MIN_REPEATS) && (best === undefined || reps * p > best.length)) {
        best = { period: p, length: reps * p };
      }
    }
    if (best === undefined) {
      i += 1;
    } else {
      redundant += best.length - best.period;
      i += best.length;
    }
  }
  return redundant / n;
}

function sameRun(tokens, a, b, length) {
  for (let k = 0; k < length; k += 1) if (tokens[a + k] !== tokens[b + k]) return false;
  return true;
}

/**
 * What a finished reply is: `{ empty, truncated, degenerate, ratio, reason? }`. `finishReason: 'length'` is a reply cut off by its
 * output cap. A reply cut off WITHOUT repetition is a long page, kept and flagged `truncated`; one that is a loop is `repetition`.
 */
export function judgeTranscript(text, finishReason) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  const truncated = finishReason === 'length';
  if (trimmed === '') return { empty: true, truncated, degenerate: false, ratio: 0, reason: 'empty' };
  const ratio = repetitionRatio(trimmed);
  const degenerate = ratio >= DEGENERATE_RATIO || (truncated && ratio >= DEGENERATE_RATIO_AT_CAP);
  return { empty: false, truncated, degenerate, ratio, ...(degenerate ? { reason: 'repetition' } : {}) };
}
