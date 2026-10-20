/**
 * Records a règlement's text fixture (Sprint 002.5a DEC-12) from a PDF already
 * on disk, for the chapter and text tests. It contacts nothing: download the
 * PDF yourself, read-only, from the link `GET chapter` would follow, and never
 * commit it (size, licence).
 *
 *     node services/fr-urban-rules-service/scripts/record-fixture.mjs \
 *       --pdf /tmp/x.pdf --plot lyon --partition DU_200046977 \
 *       --document-id 4f3d… --idurba 200046977_PLUi_20260326 \
 *       --nomfic 200046977_reglement_20260326.pdf --etag '"…"' --pages 121-144
 *
 * Writes `test-fixtures/fr-urban-rules/<plot>/regulation/`: `meta.json`,
 * `outline.json` (whole) and `pages.jsonl` (only the `--pages` ranges, comma
 * separated, so the committed text stays a chapter rather than a document).
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePdf } from '../src/parse-child.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) throw new Error(`--${name} is required`);
  return process.argv[at + 1];
};

const pdf = arg('pdf');
const bytes = readFileSync(pdf);
const parsed = await parsePdf(pdf, 2000);
if (!parsed.ok) throw new Error(parsed.code);

const wanted = new Set();
for (const range of arg('pages').split(',')) {
  const [from, to = from] = range.split('-').map(Number);
  for (let p = from; p <= to; p += 1) wanted.add(p);
}

const out = join(ROOT, 'test-fixtures/fr-urban-rules', arg('plot'), 'regulation');
mkdirSync(out, { recursive: true });
const meta = {
  documentId: arg('document-id'),
  partition: arg('partition'),
  idurba: arg('idurba'),
  nomfic: arg('nomfic'),
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  pdfVersion: bytes.subarray(0, 8).toString('latin1').trim(),
  pages: parsed.pageCount,
  etag: arg('etag'),
  retrievedAt: new Date().toISOString(),
  recordedPages: [...wanted].sort((a, b) => a - b),
  note: 'Recorded by scripts/record-fixture.mjs (Sprint 002.5a DEC-12). The PDF is not committed.'
};
writeFileSync(join(out, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync(join(out, 'outline.json'), `${JSON.stringify(parsed.outline, null, 2)}\n`);
const lines = meta.recordedPages.map((page) => JSON.stringify({ page, text: parsed.pages[page - 1] }));
writeFileSync(join(out, 'pages.jsonl'), `${lines.join('\n')}\n`);
console.log(`${out}: ${parsed.pageCount} pages, ${parsed.outline.length} outline entries, ${lines.length} recorded`);
