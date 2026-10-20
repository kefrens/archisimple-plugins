/**
 * Test helpers: the recorded règlements (DEC-12) and small synthetic PDFs.
 *
 * The real PDFs are never committed and never read by a test. The pdf.js path
 * — the child process, the outline, `getTextContent` — runs on the synthetic
 * files built here; chapter finding and text preparation run on the recorded
 * outline and pages.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const FIXTURES = join(REPO, 'test-fixtures/fr-urban-rules');

/** `{ meta, outline, pages }`, `pages[i]` PDF page `i + 1`'s text, `''` where not recorded. */
export function loadRegulation(plot) {
  const dir = join(FIXTURES, plot, 'regulation');
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const outline = JSON.parse(readFileSync(join(dir, 'outline.json'), 'utf8'));
  const pages = Array(meta.pages).fill('');
  for (const line of readFileSync(join(dir, 'pages.jsonl'), 'utf8').split('\n')) {
    if (line === '') continue;
    const { page, text } = JSON.parse(line);
    pages[page - 1] = text;
  }
  return { meta, outline, pages };
}

/** The GPU's recorded answers, one level up (recorded by 002.4, not duplicated). */
export function loadGpu(plot) {
  const read = (name) => JSON.parse(readFileSync(join(FIXTURES, plot, name), 'utf8'));
  return { documents: read('gpu-document.json'), files: read('gpu-files.json') };
}

// Synthetic PDFs ----------------------------------------------------------------

const WIN_ANSI = new Map([
  ['…', 0x85],
  ['–', 0x96],
  ['—', 0x97],
  ['’', 0x92],
  ['«', 0xab],
  ['»', 0xbb]
]);

/** A PDF literal string in WinAnsiEncoding. */
function literal(text) {
  const bytes = [];
  for (const char of text) {
    const code = WIN_ANSI.get(char) ?? char.codePointAt(0);
    if (code > 0xff) throw new Error(`not in WinAnsi: ${char}`);
    if (char === '(' || char === ')' || char === '\\') bytes.push(0x5c);
    bytes.push(code);
  }
  return `(${Buffer.from(bytes).toString('latin1')})`;
}

/** A PDF text string in UTF-16BE, for outline titles. */
function utf16(text) {
  const units = [0xfeff, ...[...text].flatMap((c) => {
    const s = c;
    return Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
  })];
  return `<${units.map((u) => u.toString(16).padStart(4, '0')).join('')}>`;
}

/**
 * @param {{
 *   pages: ({ lines: string[] } | { drawing: true } | { stream: string })[],
 *   outline?: { title: string, page: number, children?: object[] }[],
 *   compress?: boolean
 * }} spec pages 1-based in the outline
 * @returns {Buffer}
 */
export function buildPdf({ pages, outline = [], compress = false }) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add(null);
  const pagesId = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  for (const page of pages) {
    let content;
    if (page.stream !== undefined) content = page.stream;
    else if (page.drawing) content = '0.5 w 50 50 m 500 700 l S 100 100 300 300 re S';
    else {
      content = `BT /F1 10 Tf 14 TL 50 790 Td ${page.lines.map((l, i) => `${i === 0 ? '' : 'T* '}${literal(l)} Tj`).join('\n')} ET`;
    }
    const raw = Buffer.from(content, 'latin1');
    const data = compress ? deflateSync(raw) : raw;
    const stream = add({ dict: `<< /Length ${data.length}${compress ? ' /Filter /FlateDecode' : ''} >>`, data });
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let outlinesRef = '';
  if (outline.length > 0) {
    const root = add(null);
    const build = (items, parent) => {
      const ids = items.map(() => add(null));
      items.forEach((item, i) => {
        const children = item.children ?? [];
        const kids = children.length > 0 ? build(children, ids[i]) : [];
        objects[ids[i] - 1] =
          `<< /Title ${utf16(item.title)} /Parent ${parent} 0 R /Dest [${pageIds[item.page - 1]} 0 R /Fit]` +
          (i > 0 ? ` /Prev ${ids[i - 1]} 0 R` : '') +
          (i < ids.length - 1 ? ` /Next ${ids[i + 1]} 0 R` : '') +
          (kids.length > 0 ? ` /First ${kids[0]} 0 R /Last ${kids[kids.length - 1]} 0 R /Count ${kids.length}` : '') +
          ' >>';
      });
      return ids;
    };
    const top = build(outline, root);
    objects[root - 1] = `<< /Type /Outlines /First ${top[0]} 0 R /Last ${top[top.length - 1]} 0 R /Count ${top.length} >>`;
    outlinesRef = ` /Outlines ${root} 0 R`;
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R${outlinesRef} >>`;

  const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let length = chunks[0].length;
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    const parts =
      typeof body === 'string'
        ? [Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1')]
        : [
            Buffer.from(`${i + 1} 0 obj\n${body.dict}\nstream\n`, 'latin1'),
            body.data,
            Buffer.from('\nendstream\nendobj\n', 'latin1')
          ];
    for (const part of parts) {
      chunks.push(part);
      length += part.length;
    }
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

/** A page of body text long enough to clear the no-text-layer floor. */
export function bodyLines(label, count = 12) {
  return Array.from(
    { length: count },
    (_, i) => `${label} ligne ${i + 1} : les constructions respectent les règles de la zone.`
  );
}

/** Captures JSON log records. */
export function capturingLog() {
  const records = [];
  const log = (record) => records.push(record);
  return { log, records, text: () => records.map((r) => JSON.stringify(r)).join('\n') };
}
