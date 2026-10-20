/**
 * Finding a zone's chapter in a règlement (Sprint 002.5a DEC-6).
 *
 * Three methods, tried in order, and the one that held is recorded:
 *
 * 1. the **outline** — Lyon's PLU-H, 53 entries, « Zone UCe1 » at p. 121;
 * 2. the **contents page** — Gordes has no outline, but its p. 2 lists
 *    « CHAPITRE I : REGLES APPLICABLES A LA ZONE A ……… 43 », with U+2026
 *    leaders that NFKC turns into `...`;
 * 3. a **heading scan** of every page's first 400 characters.
 *
 * A code matches **exactly**, or as the **longest prefix** of the zone's
 * `libelle` (`UCe1` for `UCe1b`). A prefix is a parent chapter and may be the
 * wrong one, so `match` says which it was and 002.6a shows the title.
 *
 * Pages are PDF page indices, 1-based: the numbers `#page=` opens.
 */

import { ServiceError } from './errors.mjs';

export const MAX_CHAPTER_PAGES = 80;
const CONTENTS_PAGES = 12;
const HEADING_WINDOW = 400;

/** NFKC, spaces removed, case folded: « Zone A 1 » and `A1` compare equal. */
export function normaliseCode(code) {
  return String(code).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/**
 * The code(s) a title names after `zone`, anywhere in it: « Zone UCe1 »,
 * « Chapitre 1 – Zone UA », « DISPOSITIONS APPLICABLES A LA ZONE UA ».
 *
 * « Zone A 1 » names `A1`: a following token of one or two digits is part of
 * the code (Lyon writes « Zone A 1 », « Zone N 1 »). A letter separated by a
 * space is not (« Zone U a » is `U`): a sector letter is written attached.
 */
export function codesInTitle(title) {
  const text = String(title).normalize('NFKC');
  const codes = [];
  for (const match of text.matchAll(/\bzone\s+(\S+)(?:\s+(\S+))?/giu)) {
    const first = stripPunctuation(match[1]);
    if (first === '') continue;
    const second = match[2] === undefined ? '' : stripPunctuation(match[2]);
    codes.push(/^[0-9]{1,2}$/u.test(second) ? first + second : first);
  }
  return codes;
}

function stripPunctuation(token) {
  return token.replace(/^[«"'(\[]+/u, '').replace(/[»"'):;,.\]–-]+$/u, '');
}

/**
 * True when `code` is a parent of `zone`: a prefix, and what the zone adds
 * starts with a lower-case letter — a sector (`UCe1` → `UCe1b`, `UA` → `UAa`,
 * `N` → `Nl`). `A` is not `AU`'s parent, nor `U1` `U12`'s: those are other
 * zones, and a chapter for another zone is worse than none.
 */
export function isParentCode(code, zone) {
  const wanted = String(zone).normalize('NFKC').replace(/\s+/gu, '');
  const parent = normaliseCode(code);
  if (parent === '' || !wanted.toLowerCase().startsWith(parent)) return false;
  return /^\p{Ll}/u.test(wanted.slice(parent.length));
}

/**
 * The best of several candidates for `zone`: an exact code, else the longest
 * code that is its parent ({@link isParentCode}). `undefined` when none fits.
 *
 * @template {{ code: string }} T
 * @param {readonly T[]} candidates in document order; the first wins a tie
 * @param {string} zone
 * @returns {{ candidate: T, match: 'exact' | 'prefix' } | undefined}
 */
export function bestCandidate(candidates, zone) {
  const wanted = normaliseCode(zone);
  const exact = candidates.find((c) => normaliseCode(c.code) === wanted);
  if (exact !== undefined) return { candidate: exact, match: 'exact' };
  let best;
  for (const c of candidates) {
    if (!isParentCode(c.code, zone)) continue;
    if (best === undefined || normaliseCode(c.code).length > normaliseCode(best.code).length) best = c;
  }
  return best === undefined ? undefined : { candidate: best, match: 'prefix' };
}

/** Lines, as pdf.js's `hasEOL` gave them, NFKC and trimmed, empty ones dropped. */
function linesOf(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

// 1. Outline -----------------------------------------------------------------

function fromOutline(outline, pageCount, zone) {
  const candidates = [];
  outline.forEach((entry, position) => {
    if (!Number.isInteger(entry.page)) return;
    for (const code of codesInTitle(entry.title)) candidates.push({ code, entry, position });
  });
  const best = bestCandidate(candidates, zone);
  if (best === undefined) return { codes: candidates.map((c) => c.code) };
  const { entry, position } = best.candidate;
  let to = pageCount;
  for (const next of outline.slice(position + 1)) {
    if (!Number.isInteger(next.page) || next.depth > entry.depth) continue;
    to = Math.max(entry.page, next.page - 1);
    break;
  }
  return {
    chapter: {
      pages: [entry.page, to],
      found: 'outline',
      match: best.match,
      title: entry.title.trim()
    },
    codes: candidates.map((c) => c.code)
  };
}

// 2. Contents page -------------------------------------------------------------

// Leaders of two dots or more: Gordes writes « … A URBANISER .. 35 » once among
// its U+2026 leaders, and a line it missed would stretch the chapter before it.
const CONTENTS_LINE = /^(.*?)\s*\.{2,}\s*(\d{1,4})\s*$/u;
/** A contents line is short; a longer one is body text, and the lazy pattern above would crawl it. */
const MAX_CONTENTS_LINE = 300;

/** Every contents line of the first pages: `{ label, printed, contentsPage }`. */
export function contentsLines(pages) {
  const lines = [];
  const last = Math.min(pages.length, CONTENTS_PAGES);
  for (let index = 0; index < last; index += 1) {
    const raw = linesOf(pages[index]);
    for (let i = 0; i < raw.length; i += 1) {
      let line = raw[i];
      // pdf.js may end a line on the leaders and put the number on the next.
      if (/\.{2,}\s*$/u.test(line) && /^\d{1,4}$/u.test(raw[i + 1] ?? '')) {
        line = `${line} ${raw[i + 1]}`;
        i += 1;
      }
      if (line.length > MAX_CONTENTS_LINE) continue;
      const match = CONTENTS_LINE.exec(line);
      if (match !== null) {
        lines.push({ label: match[1], printed: Number(match[2]), contentsPage: index + 1 });
      }
    }
  }
  return lines;
}

function zonePattern(code) {
  const chars = [...normaliseCode(code)].map((c) => c.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  return new RegExp(`\\bzone\\s+${chars.join('\\s*')}(?![\\p{L}\\p{N}])`, 'iu');
}

function fromContents(pages, zone) {
  const lines = contentsLines(pages);
  const candidates = [];
  lines.forEach((line, position) => {
    for (const code of codesInTitle(line.label)) candidates.push({ code, line, position });
  });
  const best = bestCandidate(candidates, zone);
  if (best === undefined) return { codes: candidates.map((c) => c.code) };
  const { line, position } = best.candidate;
  const next = lines.slice(position + 1).find((l) => l.printed > line.printed);
  const contentsEnd = Math.max(...lines.map((l) => l.contentsPage));
  // The printed-to-PDF offset: the heading's text, on PDF pages n − 3 … n + 5,
  // past the contents itself, nearest to n first.
  const pattern = zonePattern(best.candidate.code);
  const n = line.printed;
  const order = [0, 1, -1, 2, -2, 3, -3, 4, 5];
  const at = order
    .map((d) => n + d)
    .find(
      (p) =>
        p > contentsEnd &&
        p <= pages.length &&
        headingLines(pages[p - 1]).some((h) => pattern.test(h))
    );
  if (at === undefined) return { codes: candidates.map((c) => c.code) };
  const offset = at - n;
  const to = next === undefined ? pages.length : Math.max(at, next.printed - 1 + offset);
  return {
    chapter: {
      pages: [at, Math.min(to, pages.length)],
      found: 'contents',
      match: best.match,
      title: line.label.trim()
    },
    codes: candidates.map((c) => c.code)
  };
}

// 3. Heading scan --------------------------------------------------------------

const STRUCTURAL = /^(CHAPITRE|TITRE|DISPOSITIONS APPLICABLES)\b/iu;

function mostlyUpperCase(line) {
  const letters = [...line].filter((c) => /\p{L}/u.test(c));
  if (letters.length < 4) return false;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase());
  return upper.length / letters.length >= 0.6;
}

/** The lines in a page's first 400 characters that read as headings. */
function headingLines(text) {
  return linesOf(String(text ?? '').normalize('NFKC').slice(0, HEADING_WINDOW)).filter(
    (line) => !/\.{2,}\s*\d+\s*$/u.test(line) && (mostlyUpperCase(line) || STRUCTURAL.test(line))
  );
}

function fromHeadings(pages, zone) {
  const perPage = pages.map((text) =>
    headingLines(text).map((line) => ({ line, codes: codesInTitle(line) }))
  );
  const candidates = [];
  perPage.forEach((headings, index) => {
    for (const h of headings) for (const code of h.codes) candidates.push({ code, page: index + 1, line: h.line });
  });
  const best = bestCandidate(candidates, zone);
  if (best === undefined) return {};
  const code = normaliseCode(best.candidate.code);
  const from = best.candidate.page;
  // The chapter ends at a heading of the same rank for another zone — the
  // starting heading's line with its code masked (Lyon's running header
  // « … PARTIE II Zone UCe2 », Gordes' « … A LA ZONE N ») — or at a
  // structural one (CHAPITRE, TITRE, DISPOSITIONS APPLICABLES). An upper-case
  // line inside the chapter that merely names another zone does not end it.
  const rank = template(best.candidate.line);
  let to = pages.length;
  for (let page = from + 1; page <= pages.length; page += 1) {
    const headings = perPage[page - 1];
    const ours = headings.some((h) => h.codes.some((c) => normaliseCode(c) === code));
    const another = headings.some(
      (h) =>
        (STRUCTURAL.test(h.line) && !h.codes.some((c) => normaliseCode(c) === code)) ||
        (template(h.line) === rank && h.codes.some((c) => normaliseCode(c) !== code))
    );
    if (another && !ours) {
      to = page - 1;
      break;
    }
  }
  return {
    chapter: { pages: [from, to], found: 'heading', match: best.match, title: best.candidate.line }
  };
}

/**
 * A heading line with its zone code, digits and spacing masked: its rank.
 * Spacing goes because Lyon's header is « REGLEMENT – » on one page and
 * « REGLEMENT– » on the next.
 */
function template(line) {
  return line
    .replace(/\bzone\s+\S+(?:\s+[0-9]{1,2}\b)?/giu, 'zone#')
    .replace(/\d/gu, '#')
    .replace(/\s+/gu, '')
    .toLowerCase();
}

// The three, in order ------------------------------------------------------------

/**
 * @param {{ outline: readonly { title: string, page?: number, depth: number }[], pages: readonly string[] }} document
 *   `pages[i]` is PDF page `i + 1`'s text
 * @param {string} zone the zone's `libelle`
 * @returns {{ pages: [number, number], found: 'outline' | 'contents' | 'heading', match: 'exact' | 'prefix', title: string }}
 */
export function findChapter(document, zone) {
  const pageCount = document.pages.length;
  const outline = fromOutline(document.outline ?? [], pageCount, zone);
  const contents = outline.chapter?.match === 'exact' ? undefined : fromContents(document.pages, zone);
  // An exact contents-page match beats an outline's parent chapter.
  const chapter =
    (contents?.chapter?.match === 'exact' ? contents.chapter : undefined) ??
    outline.chapter ??
    contents?.chapter ??
    fromHeadings(document.pages, zone).chapter;
  if (chapter === undefined) {
    throw new ServiceError('zone_chapter_not_found', {
      outlineCodes: unique(outline.codes),
      contentsCodes: unique(contents?.codes ?? [])
    });
  }
  const length = chapter.pages[1] - chapter.pages[0] + 1;
  if (length > MAX_CHAPTER_PAGES) {
    throw new ServiceError('chapter_too_large', { pages: chapter.pages, found: chapter.found });
  }
  return chapter;
}

function unique(codes) {
  return [...new Set(codes)];
}
