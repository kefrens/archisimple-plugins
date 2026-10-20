/**
 * The pdf.js path on synthetic PDFs (Sprint 002.5a DEC-2, DEC-12): the child
 * process, the outline, `getTextContent`, and what happens when the child dies.
 * Never on the real règlements, which are not committed.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { findChapter } from '../src/chapter.mjs';
import { createParser } from '../src/document.mjs';
import { ServiceError } from '../src/errors.mjs';
import { prepareChapter } from '../src/text.mjs';
import { bodyLines, buildPdf } from './helpers.mjs';

const dir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-parse-'));
function file(name, buffer) {
  const path = join(dir, name);
  writeFileSync(path, buffer);
  return path;
}

const parse = createParser();

test('a PDF with an outline: « Chapitre 2 – Zone UA » is found by its outline', async () => {
  const path = file(
    'outline.pdf',
    buildPdf({
      pages: [
        { lines: ['SOMMAIRE', ...bodyLines('Sommaire')] },
        { lines: ['CHAPITRE 1 – ZONE UB', ...bodyLines('UB')] },
        { lines: ['CHAPITRE 2 – ZONE UA', ...bodyLines('UA')] },
        { lines: bodyLines('UA suite') },
        { lines: ['CHAPITRE 3 – ZONE N', ...bodyLines('N')] }
      ],
      outline: [
        {
          title: 'Règlement des zones',
          page: 1,
          children: [
            { title: 'Chapitre 1 – Zone UB', page: 2 },
            { title: 'Chapitre 2 – Zone UA', page: 3 },
            { title: 'Chapitre 3 – Zone N', page: 5 }
          ]
        }
      ]
    })
  );
  const parsed = await parse(path);
  assert.equal(parsed.pageCount, 5);
  assert.deepEqual(
    parsed.outline.map((e) => [e.title, e.page, e.depth]),
    [
      ['Règlement des zones', 1, 1],
      ['Chapitre 1 – Zone UB', 2, 2],
      ['Chapitre 2 – Zone UA', 3, 2],
      ['Chapitre 3 – Zone N', 5, 2]
    ]
  );
  assert.match(parsed.pages[2], /^CHAPITRE 2 – ZONE UA\n/u, 'lines rebuilt from hasEOL');
  const chapter = findChapter(parsed, 'UA');
  assert.deepEqual(chapter, { pages: [3, 4], found: 'outline', match: 'exact', title: 'Chapitre 2 – Zone UA' });
});

test('no outline, a contents page with U+2026 leaders: found by the contents page, offset applied', async () => {
  const path = file(
    'contents.pdf',
    buildPdf({
      pages: [
        { lines: ['Commune de Test', 'Plan Local d’Urbanisme'] },
        {
          lines: [
            'Règlement 1',
            'SOMMAIRE',
            'TITRE I : DISPOSITIONS GENERALES …………………… 2',
            'CHAPITRE I : REGLES APPLICABLES A LA ZONE UA …………………… 3',
            'CHAPITRE II : REGLES APPLICABLES A LA ZONE A …………………… 5',
            'TITRE V – ZONES NATURELLES …………………… 7'
          ]
        },
        { lines: ['Règlement 2', 'TITRE I : DISPOSITIONS GENERALES', ...bodyLines('Général')] },
        { lines: ['Règlement 3', 'CHAPITRE I : REGLES APPLICABLES A LA ZONE UA', ...bodyLines('UA')] },
        { lines: ['Règlement 4', ...bodyLines('UA suite')] },
        { lines: ['Règlement 5', 'CHAPITRE II : REGLES APPLICABLES A LA ZONE A', ...bodyLines('A')] },
        { lines: ['Règlement 6', ...bodyLines('A suite')] },
        { lines: ['Règlement 7', 'TITRE V – ZONES NATURELLES'] }
      ]
    })
  );
  const parsed = await parse(path);
  assert.deepEqual(parsed.outline, []);
  assert.match(parsed.pages[1], /ZONE A \.{3,} 5/u, 'NFKC turned U+2026 into dots');
  assert.deepEqual(findChapter(parsed, 'A'), {
    pages: [6, 7],
    found: 'contents',
    match: 'exact',
    title: 'CHAPITRE II : REGLES APPLICABLES A LA ZONE A'
  });
  assert.deepEqual(findChapter(parsed, 'UAa').pages, [4, 5]);
  assert.equal(findChapter(parsed, 'UAa').match, 'prefix');
});

test('neither outline nor contents: found by the heading scan', async () => {
  const path = file(
    'headings.pdf',
    buildPdf({
      pages: [
        { lines: ['DISPOSITIONS GENERALES', ...bodyLines('Général')] },
        { lines: ['DISPOSITIONS APPLICABLES A LA ZONE UC', ...bodyLines('UC')] },
        { lines: bodyLines('UC suite') },
        { lines: ['DISPOSITIONS APPLICABLES A LA ZONE N', ...bodyLines('N')] }
      ]
    })
  );
  const parsed = await parse(path);
  assert.deepEqual(findChapter(parsed, 'UC'), {
    pages: [2, 3],
    found: 'heading',
    match: 'exact',
    title: 'DISPOSITIONS APPLICABLES A LA ZONE UC'
  });
});

test('no text layer: the chapter is refused as no_text_layer', async () => {
  const path = file(
    'scan.pdf',
    buildPdf({
      pages: [{ lines: ['DISPOSITIONS APPLICABLES A LA ZONE UA'] }, { drawing: true }, { drawing: true }],
      outline: [{ title: 'Zone UA', page: 1 }]
    })
  );
  const parsed = await parse(path);
  const chapter = findChapter(parsed, 'UA');
  assert.deepEqual(chapter.pages, [1, 3]);
  assert.throws(
    () => prepareChapter([1, 2, 3].map((page) => ({ page, text: parsed.pages[page - 1] }))),
    (e) => e instanceof ServiceError && e.code === 'no_text_layer'
  );
});

test('a file that is not a readable PDF is document_unreadable', async () => {
  const path = file('broken.pdf', Buffer.from('%PDF-1.7\nthis is not a PDF body at all\n'));
  await assert.rejects(parse(path), (e) => e instanceof ServiceError && e.code === 'document_unreadable');
});

test('more pages than the limit is document_too_large, before any text is read', async () => {
  const path = file('long.pdf', buildPdf({ pages: [{ lines: ['a'] }, { lines: ['b'] }, { lines: ['c'] }] }));
  const small = createParser({ maxPages: 2 });
  await assert.rejects(small(path), (e) => e instanceof ServiceError && e.code === 'document_too_large');
});

/**
 * A page of half a million text operators, alternating between two lines so
 * pdf.js builds a text item for each (text moved off the page is dropped, and
 * text on one line is merged): more than a 32 MB heap holds. Deflated, the
 * file is small.
 */
function heapBomb() {
  const stream = `BT /F1 10 Tf ${'1 0 0 1 50 400 Tm (ab) Tj 1 0 0 1 50 300 Tm (cd) Tj\n'.repeat(250_000)} ET`;
  return buildPdf({ pages: [{ stream }], compress: true });
}

test('a child that exceeds its memory is document_unreadable, and the parent lives on', async () => {
  const path = file('bomb.pdf', heapBomb());
  const capped = createParser({ maxOldSpaceMb: 32 });
  await assert.rejects(capped(path), (e) => e instanceof ServiceError && e.code === 'document_unreadable');
  // The parent process is untouched: another parse still works.
  const fine = file('fine.pdf', buildPdf({ pages: [{ lines: ['ok'] }] }));
  assert.equal((await parse(fine)).pageCount, 1);
});

/** A child that never answers: only the timer can end it. */
const SILENT_CHILD = file('silent-child.mjs', Buffer.from('process.on("message", () => {}); setInterval(() => {}, 1000);\n'));

function gone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

test('a child that never answers is killed at its timer: document_unreadable, and the process is gone', async () => {
  let child;
  const hurried = createParser({ timeoutMs: 300, childPath: SILENT_CHILD, onSpawn: (c) => (child = c) });
  const started = Date.now();
  await assert.rejects(hurried(file('any.pdf', buildPdf({ pages: [{ lines: ['x'] }] }))), (e) => e.code === 'document_unreadable');
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 280 && elapsed < 3_000, `answered at the timer (${elapsed} ms)`);
  await new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve)));
  assert.equal(child.signalCode, 'SIGKILL');
  assert.ok(gone(child.pid), 'no process left behind');
});

test('a real parse that outlives its timer is killed too', async () => {
  let child;
  const hurried = createParser({ timeoutMs: 100, onSpawn: (c) => (child = c) });
  await assert.rejects(hurried(file('slow.pdf', heapBomb())), (e) => e.code === 'document_unreadable');
  await new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve)));
  assert.ok(gone(child.pid));
});

test('more text than the cap is document_too_large', async () => {
  const path = file('wordy.pdf', buildPdf({ pages: [{ lines: bodyLines('a') }, { lines: bodyLines('b') }] }));
  const capped = createParser({ maxTextChars: 1000 });
  await assert.rejects(capped(path), (e) => e.code === 'document_too_large' && e.details.limitTextChars === 1000);
});

test('the child sees only NODE_ENV, and may read only its folder, pdf.js and the PDF\'s folder', async () => {
  const probe = file(
    'probe-child.mjs',
    Buffer.from(
      `import { readFileSync } from 'node:fs';
       process.on('message', ({ path }) => {
         let outside = 'read';
         try { readFileSync('/etc/hosts'); } catch (e) { outside = e.code; }
         let own = 'refused';
         try { readFileSync(path); own = 'read'; } catch {}
         process.send({ ok: true, pageCount: 0, outline: [], pages: [], env: Object.keys(process.env), outside, own });
       });\n`
    )
  );
  process.env.PLUGIN_SERVICES_LOG_KEY_PROBE = 'secret';
  try {
    const answer = await createParser({ childPath: probe })(file('p.pdf', buildPdf({ pages: [{ lines: ['x'] }] })));
    assert.deepEqual(answer.env.filter((k) => k !== '__CF_USER_TEXT_ENCODING'), ['NODE_ENV']);
    assert.equal(answer.outside, 'ERR_ACCESS_DENIED');
    assert.equal(answer.own, 'read');
  } finally {
    delete process.env.PLUGIN_SERVICES_LOG_KEY_PROBE;
  }
});
