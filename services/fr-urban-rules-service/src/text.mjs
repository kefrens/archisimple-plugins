/**
 * Preparing a chapter's text (Sprint 002.5a DEC-7).
 *
 * The prepared chapter is one string with **no page markers** and a
 * page-offset index beside it. A marker would cost tokens and split any
 * passage that crosses a page break, so a quote would either carry it or stop
 * being verbatim; an offset maps to its page through the index instead, which
 * is all 002.5b needs (096.7 already answers offsets).
 *
 * Offsets are UTF-16 code units, JavaScript's string indices.
 */

import { ServiceError } from './errors.mjs';

/** Below this many characters per page on average, the chapter is a scan. */
export const MIN_CHARS_PER_PAGE = 200;
const RUNNING_SHARE = 0.6;
const RUNNING_WINDOW = 3;

/**
 * Numbered headings, Lyon's form: « 1.1 - Les destinations… »,
 * « 2.2.1.2 - Dans la bande… », « 5.2.2.1 Modalités… ».
 *
 * Narrower than the draft's `^\d+(\.\d+){0,4}\.?\s*[-–.]?\s+\S`, checked on the
 * recorded text (step 1): that one also took « 1 500 m2, il est exigé… »,
 * « 3.1.6.1 de la Partie 1 » and Gordes' list items « 1- A condition… ». A
 * heading here has at least one dotted level and starts its words with a
 * capital.
 */
const NUMBERED_HEADING = /^(\d+(?:\.\d+){1,4})\.?(?:\s*[-–.])?\s+\p{Lu}/u;
/** « ARTICLE A 7 – », « Article UA 6 : »: Gordes' form. */
const ARTICLE_HEADING = /^(?:ARTICLE|Article)\s+(?:([A-Z0-9]+)\s+)?(\d+[A-Z]?)\b/u;
/** « secteur UCe1a », « secteurs Ast ». A code carries a digit or a capital. */
const SECTOR = /\bsecteurs?\s+([0-9A-Za-z]+)/gu;
const SECTOR_HEADING_MAX = 120;
/**
 * A line that opens on its sector (« b. Dans le secteur UCe1b », « En secteur
 * UCe1a : »), or a list item naming one (« - 17 mètres dans le secteur UCe1a »).
 */
const SECTOR_HEADING = /^(?:[-–•]\s|(?:[a-z0-9]{1,3}\s*[.)–-]\s*)?(?:dans\s+(?:le|les)\s+|en\s+|pour\s+(?:le|les)\s+)?secteurs?\s)/iu;

function maskDigits(line) {
  return line.trim().replace(/\d/gu, '#');
}

/** Lines that repeat at the top or bottom of at least 60 % of the pages. */
function runningLines(pageLines) {
  if (pageLines.length < 3) return new Set();
  const counts = new Map();
  for (const lines of pageLines) {
    const edges = new Set(
      [...lines.slice(0, RUNNING_WINDOW), ...lines.slice(-RUNNING_WINDOW)].map(maskDigits)
    );
    for (const line of edges) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const running = new Set();
  for (const [line, count] of counts) {
    if (line !== '' && count >= 2 && count / pageLines.length >= RUNNING_SHARE) running.add(line);
  }
  return running;
}

/**
 * @param {readonly { page: number, text: string }[]} pages the chapter's pages, in order
 * @returns {{
 *   text: string,
 *   pageIndex: { page: number, start: number, end: number }[],
 *   articles: { number: string, line: string, offset: number }[],
 *   sectors: { code: string, offset: number, lineStart: number, heading: boolean }[]
 * }}
 */
export function prepareChapter(pages) {
  const rawChars = pages.reduce((sum, p) => sum + String(p.text ?? '').replace(/\s/gu, '').length, 0);
  if (pages.length === 0 || rawChars / pages.length < MIN_CHARS_PER_PAGE) {
    throw new ServiceError('no_text_layer', { pages: pages.length });
  }

  const pageLines = pages.map((p) =>
    String(p.text ?? '')
      .normalize('NFKC')
      .split('\n')
      .map((l) => l.replace(/\s+$/u, ''))
      .filter((l) => l.trim() !== '')
  );
  const running = runningLines(pageLines);

  let text = '';
  const pageIndex = [];
  pageLines.forEach((lines, i) => {
    const kept = lines.filter((line, at) => {
      if (/^\s*\d+\s*$/u.test(line)) return false;
      const edge = at < RUNNING_WINDOW || at >= lines.length - RUNNING_WINDOW;
      return !(edge && running.has(maskDigits(line)));
    });
    // De-hyphenation, inside the page: « construc-\ntions » → « constructions ».
    const body = kept.join('\n').replace(/-\n(?=\p{Ll})/gu, '');
    let start = text.length;
    if (text !== '') {
      if (/-$/u.test(text) && /^\p{Ll}/u.test(body)) {
        // …and across a page break: the hyphen goes, and so does the break.
        text = text.slice(0, -1);
        start = text.length;
        pageIndex[pageIndex.length - 1].end = start;
      } else {
        text += '\n';
        start = text.length;
      }
    }
    text += body;
    pageIndex.push({ page: pages[i].page, start, end: text.length });
  });

  const articles = [];
  const sectors = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const numbered = NUMBERED_HEADING.exec(trimmed);
    const article = numbered === null ? ARTICLE_HEADING.exec(trimmed) : null;
    if (numbered !== null) {
      articles.push({ number: numbered[1], line: trimmed.slice(0, 200), offset });
    } else if (article !== null) {
      const number = article[1] === undefined ? article[2] : `${article[1]} ${article[2]}`;
      articles.push({ number, line: trimmed.slice(0, 200), offset });
    }
    for (const match of line.matchAll(SECTOR)) {
      if (/[0-9A-Z]/u.test(match[1])) {
        sectors.push({
          code: match[1],
          offset: offset + match.index + match[0].length - match[1].length,
          lineStart: offset,
          // A sentence that mentions a sector mid-line is not its heading
          // (« … moins profonde en secteur UCe1a qu'en secteur »).
          heading: SECTOR_HEADING.test(trimmed) && trimmed.length <= SECTOR_HEADING_MAX
        });
      }
    }
    offset += line.length + 1;
  }

  return { text, pageIndex, articles, sectors };
}

/** The PDF page holding `offset`, by the page-offset index. */
export function pageAt(prepared, offset) {
  return prepared.pageIndex.find((p) => offset >= p.start && offset < p.end)?.page;
}

/**
 * The nearest heading at or before `offset`, and the numbered headings it sits
 * under (`2.2.1.2` sits under `2.2.1`, `2.2` and `2`, those that exist).
 */
export function articleAt(prepared, offset) {
  let nearest;
  for (const a of prepared.articles) {
    if (a.offset > offset) break;
    nearest = a;
  }
  if (nearest === undefined) return undefined;
  const parts = nearest.number.split('.');
  const ancestors = [];
  for (let n = parts.length - 1; n >= 1; n -= 1) {
    const number = parts.slice(0, n).join('.');
    if (prepared.articles.some((a) => a.number === number && a.offset <= nearest.offset)) {
      ancestors.push(number);
    }
  }
  return { number: nearest.number, line: nearest.line, ancestors };
}
