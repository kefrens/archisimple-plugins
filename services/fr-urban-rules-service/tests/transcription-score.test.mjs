/**
 * Sprint 002.30, Epic 1: the scorer that judges a transcription (a local model's, an OCR's) against the reference
 * transcript, and the decision rule fixed before anything was run. Pure, no model, no network.
 */

import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DECISION_RULE,
  articleNumbersOf,
  decide,
  figuresOf,
  scoreTranscription,
  wordsOf
} from '../../../tools/measure-transcription/score.mjs';

test('the decision rule is the one registered in the sprint before the run', () => {
  assert.deepEqual(DECISION_RULE, {
    figureRecall: 0.95,
    articleRecall: 0.95,
    wrongFigureRate: 0.02,
    wordRecall: 0.9
  });
});

test('a figure is a number with its unit, however the unit is written', () => {
  const found = figuresOf(
    'Hauteur 7,5 mètres ; emprise 1 500 m² ; 20 % ; recul de 4 m ; 3 m2 ; 12 pour cent'
  ).map((f) => `${f.value} ${f.unit}`);
  assert.deepEqual(found, ['7.5 m', '1500 m2', '20 %', '4 m', '3 m2', '12 %']);
});

test('a number without a unit, a date and a word that starts with m are not figures', () => {
  assert.deepEqual(figuresOf('Le 9 mai 2009, 138 lots, article 15-03, 2 mois'), []);
});

test('article numbers are read as written, a leading zero does not make another number', () => {
  assert.deepEqual(
    articleNumbersOf('Article 09-03 et Modification de l’article 15-03. Article 7'),
    ['9-3', '15-3', '7']
  );
  assert.deepEqual(articleNumbersOf('9-03'), articleNumbersOf('09-03'));
});

test('words are four letters or more, accents folded, each once', () => {
  assert.deepEqual([...wordsOf('Hauteur: HAUTEUR des façades, art. 1 et été')].sort(), [
    'facades',
    'hauteur'
  ]);
});

test('a candidate that holds every figure and article scores 1 and a missing figure is named', () => {
  const reference = 'Article 09-03. La hauteur est limitée à 7,5 m. L’emprise ne dépasse pas 20 %.';
  const whole = scoreTranscription({
    reference,
    candidate: 'ARTICLE 09-03 La hauteur limitée à 7.5 mètres, emprise 20 %'
  });
  assert.equal(whole.figures.recall, 1);
  assert.equal(whole.articles.recall, 1);
  assert.equal(whole.wrong.count, 0);
  const holes = scoreTranscription({ reference, candidate: 'Article 09-03 hauteur limitée 7,5 m' });
  assert.equal(holes.figures.recall, 0.5);
  assert.deepEqual(holes.figures.missing, ['20 %']);
});

test('a changed digit is a missing figure AND a wrong figure: the failure that would be verified against itself', () => {
  const reference = 'Modification de l’article 15-03. Hauteur 6 m.';
  const score = scoreTranscription({
    reference,
    candidate: 'Modification de l’article 16-03. Hauteur 8 m.'
  });
  assert.equal(score.articles.recall, 0);
  assert.deepEqual(score.articles.missing, ['15-3']);
  assert.equal(score.figures.recall, 0);
  assert.deepEqual(score.wrong.figures, ['8 m']);
  assert.equal(score.wrong.rate, 1);
});

test('a figure is counted once per occurrence in the reference', () => {
  const reference = 'Recul de 4 m. Hauteur de 4 m.';
  assert.equal(scoreTranscription({ reference, candidate: 'recul de 4 m' }).figures.recall, 0.5);
});

test('a page with nothing to find has no recall to average away, and is not a loss', () => {
  const score = scoreTranscription({ reference: 'Plan de masse sans chiffre', candidate: 'plan' });
  assert.equal(score.figures.total, 0);
  assert.equal(score.figures.recall, undefined);
});

function page(overrides) {
  return {
    page: 60,
    reference: 'Hauteur 7 m. Article 09-03.',
    candidate: 'Hauteur 7 m. Article 09-03.',
    truncated: false,
    ...overrides
  };
}

test('decide: every condition holds, the candidate is offered', () => {
  const verdict = decide([page({}), page({ page: 61 })]);
  assert.equal(verdict.offered, true);
  assert.deepEqual(
    verdict.conditions.map((c) => [c.id, c.pass]),
    [
      ['G1', true],
      ['G2', true],
      ['G3', true],
      ['G4', true],
      ['G5', true]
    ]
  );
});

test('decide: recall is over all pages, not an average of page averages', () => {
  const big = page({
    reference: Array.from({ length: 19 }, (_, i) => `${i + 1} m`).join(' ; '),
    candidate: Array.from({ length: 19 }, (_, i) => `${i + 1} m`).join(' ; ')
  });
  const small = page({ page: 62, reference: 'Hauteur 7 m.', candidate: 'rien' });
  const verdict = decide([big, small]);
  assert.equal(verdict.conditions.find((c) => c.id === 'G1').value, 19 / 20);
});

test('decide: 94 % of figures is not offered, 95 % is', () => {
  const ref = Array.from({ length: 100 }, (_, i) => `${i + 1} m`).join(' ; ');
  const cand = (n) => Array.from({ length: n }, (_, i) => `${i + 1} m`).join(' ; ');
  const at = (n) =>
    decide([page({ reference: ref, candidate: cand(n) })]).conditions.find((c) => c.id === 'G1');
  assert.equal(at(94).pass, false);
  assert.equal(at(95).pass, true);
});

test('decide: a page that holds a figure and is truncated or empty fails G5 whatever the averages say', () => {
  const ok = Array.from({ length: 5 }, (_, i) => page({ page: 70 + i }));
  const cut = decide([...ok, page({ page: 80, truncated: true })]);
  assert.equal(cut.conditions.find((c) => c.id === 'G5').pass, false);
  assert.equal(cut.offered, false);
  const empty = decide([...ok, page({ page: 81, candidate: '' })]);
  assert.equal(empty.conditions.find((c) => c.id === 'G5').pass, false);
});

test('decide: wrong figures above 2 % of the candidate fail G3 even when recall is whole', () => {
  const ref = Array.from({ length: 50 }, (_, i) => `${i + 1} m`).join(' ; ');
  const candidate = `${ref} ; 999 m ; 998 m`;
  const verdict = decide([page({ reference: ref, candidate })]);
  const g3 = verdict.conditions.find((c) => c.id === 'G3');
  assert.equal(g3.pass, false);
  assert.equal(verdict.conditions.find((c) => c.id === 'G1').pass, true);
});

test('decide: a candidate that recovers the figures but not the prose fails G4', () => {
  const reference = 'Hauteur maximale autorisée pour les constructions principales 7 m';
  const verdict = decide([page({ reference, candidate: '7 m' })]);
  assert.equal(verdict.conditions.find((c) => c.id === 'G4').pass, false);
  assert.equal(verdict.offered, false);
});

test("lenient units (informational only) read an OCR's « m° » as a surface, the strict reading does not", () => {
  const ocr = 'lot 5 2062 m° et 200 m?';
  // Strictly it is a length, the wrong unit: a missing surface AND a wrong figure, the conservative reading.
  assert.deepEqual(
    figuresOf(ocr).map((f) => `${f.value} ${f.unit}`),
    ['2062 m', '200 m']
  );
  assert.deepEqual(
    figuresOf(ocr, { lenientUnits: true }).map((f) => `${f.value} ${f.unit}`),
    ['2062 m2', '200 m2']
  );
  const reference = 'lot 5 2 062 m² et 200 m²';
  assert.equal(scoreTranscription({ reference, candidate: ocr }).figures.recall, 0);
  assert.equal(scoreTranscription({ reference, candidate: ocr }).wrong.count, 2);
  assert.equal(
    scoreTranscription({ reference, candidate: ocr }, { lenientUnits: true }).figures.recall,
    1
  );
});
