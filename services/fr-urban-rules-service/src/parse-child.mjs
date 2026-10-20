/**
 * The parse child (Sprint 002.5a DEC-2): reads one PDF with pdf.js and sends
 * back its outline and the text of every page, then exits.
 *
 * It runs in its own process (`child_process.fork`), never in the gateway's,
 * because a hostile PDF is the one input here that can exhaust memory: a
 * Flate bomb grows ArrayBuffers that a `worker_threads` `resourceLimits` does
 * not count. Here the child dies — of its `--max-old-space-size`, of the
 * parent's 60 s timer, or of the parent's resident-memory watchdog — and the
 * gateway answers `document_unreadable`.
 *
 * Protocol: the parent sends `{ path, maxPages, maxTextChars }` once; the child answers
 * `{ ok: true, pageCount, outline, pages }` or `{ ok: false, code }`.
 * `pages[i]` is PDF page `i + 1`'s text: items joined by their `hasEOL`, then
 * NFKC (DEC-7). `outline` is flat, `{ title, page, depth }`, page 1-based and
 * depth 1 at the top, in document order.
 */

import { readFile } from 'node:fs/promises';

/**
 * Placeholders for the two canvas classes pdf.js constructs at module load.
 *
 * pdf.js 6's Node build takes `DOMMatrix` and `Path2D` from `@napi-rs/canvas`,
 * an optional native dependency the image does not install
 * (`npm ci --omit=optional`, DEC-2). Without them the module throws at load
 * (`new DOMMatrix()` at top level), although text extraction never draws. These
 * stand in only so the module loads; anything that really rendered through
 * them would draw nothing, and nothing here renders.
 */
function installCanvasPlaceholders() {
  if (globalThis.DOMMatrix === undefined) {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        const [a, b, c, d, e, f] = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
        Object.assign(this, { a, b, c, d, e, f });
      }
      multiplySelf() { return this; }
      preMultiplySelf() { return this; }
      invertSelf() { return this; }
      translate() { return this; }
      scale() { return this; }
    };
  }
  if (globalThis.Path2D === undefined) {
    globalThis.Path2D = class Path2D {
      addPath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      rect() {}
      closePath() {}
    };
  }
}

/** pdf.js is loaded on demand, so a parent that only imports this file for its exports pays nothing. */
async function loadPdfjs() {
  installCanvasPlaceholders();
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

/** The text of one page: items joined by `hasEOL`, then NFKC. */
export function joinItems(items) {
  let text = '';
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return text.normalize('NFKC');
}

async function destinationPage(document, dest) {
  let explicit = dest;
  if (typeof dest === 'string') explicit = await document.getDestination(dest);
  if (!Array.isArray(explicit) || explicit.length === 0) return undefined;
  const ref = explicit[0];
  if (typeof ref === 'number') return ref + 1;
  if (ref !== null && typeof ref === 'object') return (await document.getPageIndex(ref)) + 1;
  return undefined;
}

async function flattenOutline(document, items, depth, out) {
  for (const item of items ?? []) {
    let page;
    try {
      page = await destinationPage(document, item.dest);
    } catch {
      page = undefined;
    }
    out.push({ title: String(item.title ?? '').normalize('NFKC'), page, depth });
    await flattenOutline(document, item.items, depth + 1, out);
  }
  return out;
}

export async function parsePdf(path, maxPages, maxTextChars = Infinity) {
  const { getDocument } = await loadPdfjs();
  const data = new Uint8Array(await readFile(path));
  const task = getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0
  });
  const document = await task.promise;
  try {
    if (document.numPages > maxPages) return { ok: false, code: 'document_too_large' };
    const outline = await flattenOutline(document, await document.getOutline(), 1, []);
    const pages = [];
    let total = 0;
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const text = joinItems(content.items);
      total += text.length;
      // Bounded before it is sent: the whole text crosses the IPC channel.
      if (total > maxTextChars) return { ok: false, code: 'document_too_large' };
      pages.push(text);
      page.cleanup();
    }
    return { ok: true, pageCount: document.numPages, outline, pages };
  } finally {
    await task.destroy();
  }
}

if (process.send !== undefined) {
  // The parent gone, nothing is waiting for the answer.
  process.once('disconnect', () => process.exit(0));
  process.once('message', async (message) => {
    let answer;
    try {
      answer = await parsePdf(message.path, message.maxPages, message.maxTextChars);
    } catch {
      // A malformed or hostile file. The reason stays here: pdf.js messages
      // can quote the document, and nothing of a document is logged.
      answer = { ok: false, code: 'document_unreadable' };
    }
    // The parent kills this process once it has the answer: exiting here
    // could reach the parent before the message does.
    process.send(answer);
  });
}
