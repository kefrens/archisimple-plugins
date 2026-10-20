/**
 * Chapter finding (DEC-6) and text preparation (DEC-7) on the recorded
 * règlements of Lyon (PLU-H, outline) and Gordes (PLU, contents page).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestCandidate, codesInTitle, contentsLines, findChapter, isParentCode, normaliseCode } from '../src/chapter.mjs';
import { ServiceError } from '../src/errors.mjs';
import { articleAt, pageAt, prepareChapter } from '../src/text.mjs';
import { loadRegulation } from './helpers.mjs';

const lyon = loadRegulation('lyon');
const gordes = loadRegulation('gordes');

function chapterPages(doc, [from, to]) {
  const pages = [];
  for (let page = from; page <= to; page += 1) pages.push({ page, text: doc.pages[page - 1] });
  return pages;
}

test('codes: « Zone A 1 » is A1, the outline pattern finds zone anywhere in a title', () => {
  assert.deepEqual(codesInTitle('Zone UCe1 '), ['UCe1']);
  assert.deepEqual(codesInTitle('Zone A 1 '), ['A1']);
  assert.deepEqual(codesInTitle('Chapitre 2 – Zone UA'), ['UA']);
  assert.deepEqual(codesInTitle('DISPOSITIONS APPLICABLES A LA ZONE UA :'), ['UA']);
  assert.deepEqual(codesInTitle('2.5 LES ZONES A URBANISER'), [], '« zones » is not « zone »');
  assert.deepEqual(codesInTitle('Zone U a'), ['U'], 'a letter after a space is not part of the code');
  assert.equal(normaliseCode('Zone A 1'.slice(5)), 'a1');
});

test('exact beats prefix, and the longest prefix wins', () => {
  const c = (code) => ({ code });
  assert.deepEqual(bestCandidate([c('UCe1'), c('UCe10')], 'UCe10'), { candidate: c('UCe10'), match: 'exact' });
  assert.deepEqual(bestCandidate([c('UC'), c('UCe1')], 'UCe1b'), { candidate: c('UCe1'), match: 'prefix' });
  assert.deepEqual(bestCandidate([c('UCe1'), c('UCe10')], 'UCe10b').candidate, c('UCe10'));
  assert.equal(bestCandidate([c('UB')], 'UA'), undefined);
});

test('a prefix is a parent only when the zone adds a lower-case sector letter', () => {
  const c = (code) => ({ code });
  assert.equal(isParentCode('UCe1', 'UCe1b'), true);
  assert.equal(isParentCode('UA', 'UAa'), true);
  assert.equal(isParentCode('N', 'Nl'), true);
  assert.equal(isParentCode('A', 'AU'), false, 'AU is another zone');
  assert.equal(isParentCode('U1', 'U12'), false, 'U12 is another zone');
  assert.equal(isParentCode('A', "A'h"), false);
  assert.equal(bestCandidate([c('A'), c('N')], 'AU'), undefined);
  assert.equal(bestCandidate([c('U1')], 'U12'), undefined);
  assert.deepEqual(bestCandidate([c('UC'), c('UCe1')], 'UCe1b'), { candidate: c('UCe1'), match: 'prefix' });
});

test('AU is not found in « Zone A », U12 not in « Zone U1 »: zone_chapter_not_found, with the codes', () => {
  const doc = {
    outline: [
      { title: 'Zone A', page: 1, depth: 1 },
      { title: 'Zone U1', page: 2, depth: 1 }
    ],
    pages: ['', '', '']
  };
  for (const zone of ['AU', 'U12']) {
    assert.throws(
      () => findChapter(doc, zone),
      (e) => e.code === 'zone_chapter_not_found' && e.details.outlineCodes.join() === 'A,U1'
    );
  }
});

test('an exact contents-page match beats the outline\'s parent chapter', () => {
  const doc = {
    outline: [{ title: 'Zone UA', page: 3, depth: 1 }, { title: 'Zone N', page: 6, depth: 1 }],
    pages: [
      'SOMMAIRE\nZONE UA ........ 2\nZONE UAa ........ 4\nZONE N ........ 5',
      '',
      'CHAPITRE I : ZONE UA',
      '',
      'CHAPITRE II : ZONE UAa',
      'CHAPITRE III : ZONE N'
    ]
  };
  const chapter = findChapter(doc, 'UAa');
  assert.equal(chapter.found, 'contents');
  assert.equal(chapter.match, 'exact');
  assert.deepEqual(chapter.pages, [5, 5]);
});

test('a contents line over 300 characters is not a contents line', () => {
  const long = `ZONE UA ${'x'.repeat(300)} ...... 3`;
  assert.deepEqual(contentsLines([long, 'ZONE N ...... 4']).map((l) => l.printed), [4]);
});

test('the heading scan ends at a heading of the chapter\'s rank, not at a line naming another zone', () => {
  const body = 'texte '.repeat(80);
  const doc = {
    outline: [],
    pages: [
      `PLU – REGLEMENT – ZONE UA\n${body}`,
      `PLU – REGLEMENT – ZONE UA\nLIMITE AVEC LA ZONE UB\n${body}`,
      `PLU – REGLEMENT – ZONE UB\n${body}`
    ]
  };
  assert.deepEqual(findChapter(doc, 'UA').pages, [1, 2]);
});

test('Lyon: the outline gives UCe1b → PDF pages 121–144, found by outline, a prefix match', () => {
  assert.equal(lyon.meta.pages, 803);
  assert.deepEqual(findChapter(lyon, 'UCe1b'), {
    pages: [121, 144],
    found: 'outline',
    match: 'prefix',
    title: 'Zone UCe1'
  });
  assert.deepEqual(findChapter(lyon, 'UCe1').match, 'exact');
  assert.deepEqual(findChapter(lyon, 'A1').pages, [751, 758], '« Zone A 1 » in the outline');
  assert.deepEqual(findChapter(lyon, 'UPr1').pages, [401, 420], 'UPr1 exact, not the UPr prefix');
});

test('Lyon without its outline: the heading scan finds the same chapter', () => {
  assert.deepEqual(findChapter({ ...lyon, outline: [] }, 'UCe1b').pages, [121, 144]);
  assert.equal(findChapter({ ...lyon, outline: [] }, 'UCe1b').found, 'heading');
});

test('Gordes: the contents page, with its U+2026 leaders, gives A → PDF pages 44–51', () => {
  assert.deepEqual(gordes.outline, [], 'Gordes has no outline');
  assert.match(gordes.pages[1], /ZONE A \.{3,} 43$/mu, 'NFKC turned the leaders into dots');
  assert.deepEqual(findChapter(gordes, 'A'), {
    pages: [44, 51],
    found: 'contents',
    match: 'exact',
    title: 'CHAPITRE I : REGLES APPLICABLES A LA ZONE A'
  });
  assert.deepEqual(findChapter(gordes, 'Ast').match, 'prefix');
  const lines = contentsLines(gordes.pages);
  assert.ok(lines.some((l) => /URBANISER$/u.test(l.label) && l.printed === 35), 'a two-dot leader is a contents line');
});

test('no chapter: zone_chapter_not_found lists the codes it saw', () => {
  for (const [doc, field, code] of [
    [lyon, 'outlineCodes', 'UCe1'],
    [gordes, 'contentsCodes', 'A']
  ]) {
    assert.throws(
      () => findChapter(doc, 'ZZ9'),
      (e) => e instanceof ServiceError && e.code === 'zone_chapter_not_found' && e.details[field].includes(code)
    );
  }
});

test('a chapter over 80 pages is chapter_too_large, not guessed at', () => {
  const doc = {
    outline: [
      { title: 'Zone UA', page: 1, depth: 1 },
      { title: 'Zone UB', page: 90, depth: 1 }
    ],
    pages: Array(100).fill('')
  };
  assert.throws(() => findChapter(doc, 'UA'), (e) => e.code === 'chapter_too_large');
});

test('the prepared Lyon chapter: no running line, no page marker, offsets to pages and articles', () => {
  const prepared = prepareChapter(chapterPages(lyon, [121, 144]));
  assert.ok(lyon.pages[121].includes('METROPOLE DE LYON – PLU-H'), 'the raw text has the running header');
  assert.ok(!prepared.text.includes('METROPOLE DE LYON – PLU-H'));
  assert.ok(!prepared.text.includes('APPROBATION 2024'));
  assert.ok(!/\[p\.\s*\d+\]/u.test(prepared.text), 'no page marker');
  assert.ok(!/^\d+$/mu.test(prepared.text), 'no line holding only a number');

  const quote = 'Le retrait* est au moins égal à 4 mètres';
  const offset = prepared.text.indexOf(quote);
  assert.ok(offset > 0);
  assert.equal(pageAt(prepared, offset), 126);
  assert.equal(pageAt(prepared, offset + quote.length - 1), 126);
  const article = articleAt(prepared, offset);
  assert.equal(article.number, '2.2.1.2', 'the nearest heading');
  assert.ok(article.ancestors.includes('2.2.1'), 'under article 2.2.1');

  const sectors = new Set(prepared.sectors.map((s) => s.code));
  assert.ok(sectors.has('UCe1a') && sectors.has('UCe1b'));
  for (const s of prepared.sectors) assert.equal(prepared.text.slice(s.offset, s.offset + s.code.length), s.code);

  // The index covers the text without gaps, page after page.
  assert.equal(prepared.pageIndex.length, 24);
  assert.equal(prepared.pageIndex[0].start, 0);
  assert.equal(prepared.pageIndex.at(-1).end, prepared.text.length);
});

test('the prepared Gordes chapter: « ARTICLE A 7 – » headings, the running header gone', () => {
  const prepared = prepareChapter(chapterPages(gordes, [44, 51]));
  assert.ok(!prepared.text.includes('Commune de Gordes - Elaboration du PLU'));
  assert.ok(!/^Règlement \d+$/mu.test(prepared.text));
  assert.deepEqual(
    prepared.articles.map((a) => a.number),
    ['A 1', 'A 2', 'A 3', 'A 4', 'A 5', 'A 6', 'A 7', 'A 8', 'A 9', 'A 10', 'A 11', 'A 12', 'A 13', 'A 14']
  );
  assert.ok(prepared.sectors.some((s) => s.code === 'Ast'));
});

test('de-hyphenation joins a word split at a line end, within and across pages', () => {
  const body = 'x'.repeat(250);
  const prepared = prepareChapter([
    { page: 1, text: `${body}\nles construc-\ntions sont admises\nfin de page inter-` },
    { page: 2, text: `dite ici\n${body}` }
  ]);
  assert.ok(prepared.text.includes('les constructions sont admises'));
  assert.ok(prepared.text.includes('inter' + 'dite ici'));
  assert.equal(pageAt(prepared, prepared.text.indexOf('dite ici')), 2);
});
