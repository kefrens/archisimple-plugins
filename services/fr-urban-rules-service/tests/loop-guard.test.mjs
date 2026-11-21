/**
 * Sprint 002.30, Addendum A (DEC-A5) — the loop guard of a local transcription.
 *
 * Synthetic text only. The pattern is the one measured on 2026-11-21 on pages 67 and 69 of a scanned règlement: a local vision model
 * answered a run of « [illisible] » lines until its 4,096-token cap (985 of 1,000 lines). No page text of that document is here.
 */

import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeTranscript, repetitionRatio } from '../src/loop-guard.mjs';
import { loadRegulation } from './helpers.mjs';

const gordes = loadRegulation('gordes');
const words = (n, from = 0) => Array.from({ length: n }, (_, i) => `mot${from + i}`);

test('the measured pattern: 985 of 1,000 lines « [illisible] » at the output cap is degenerate and never handed on', () => {
  const text = [...words(15).map((w) => `${w} texte`), ...Array(985).fill('[illisible]')].join('\n');
  assert.ok(repetitionRatio(text) > 0.9, `ratio ${repetitionRatio(text)}`);
  const verdict = judgeTranscript(text, 'length');
  assert.equal(verdict.degenerate, true);
  assert.equal(verdict.reason, 'repetition');
  assert.equal(verdict.truncated, true);
});

test('a loop that starts after a good half page is caught, at the cap and when the model ended by itself', () => {
  const text = [...words(300), ...Array(700).fill('[illisible]')].join(' ');
  assert.equal(judgeTranscript(text, 'length').degenerate, true);
  assert.equal(judgeTranscript(text, 'stop').degenerate, true, 'a ratio of 0.7 is degenerate whatever ended the reply');
});

test('a loop that fills a quarter of a reply is degenerate only when the reply was cut off by the cap', () => {
  const text = [...words(750), ...Array(250).fill('[illisible]')].join(' ');
  const ratio = repetitionRatio(text);
  assert.ok(ratio > 0.2 && ratio < 0.5, `ratio ${ratio}`);
  assert.equal(judgeTranscript(text, 'length').degenerate, true);
  assert.equal(judgeTranscript(text, 'stop').degenerate, false);
});

test('a loop of numbers (a period of two or three words) is a loop too', () => {
  const two = Array.from({ length: 400 }, () => '12 15').join(' ');
  const three = [...words(40), ...Array.from({ length: 300 }, () => '5 m ;')].join(' ');
  assert.ok(repetitionRatio(two) > 0.9);
  assert.equal(judgeTranscript(three, 'length').degenerate, true);
});

test('a table of 91 lots with its figures, even with four identical lines, is not a loop', () => {
  const rows = Array.from({ length: 91 }, (_, i) => `Lot ${i + 1} | ${700 + ((i * 37) % 900)} m² | ${(i % 7) + 1} m | parcelle ${100 + i}`);
  const table = [...rows.slice(0, 40), ...Array(4).fill('Lot 41 | 750 m² | 5 m | parcelle 141'), ...rows.slice(41)].join('\n');
  assert.equal(repetitionRatio(table), 0, 'the same four lines in a row do not reach six repeats of a run');
  assert.equal(judgeTranscript(table, 'stop').degenerate, false);
  // The same table cut off by the cap, without a loop in it, is truncated and kept (it is not unreadable).
  const cut = judgeTranscript(table, 'length');
  assert.equal(cut.degenerate, false);
  assert.equal(cut.truncated, true);
});

test('ordinary prose of the recorded règlement and dotted leaders are not a loop', () => {
  for (const page of [44, 45, 46, 47, 48]) {
    const verdict = judgeTranscript(gordes.pages[page - 1], 'stop');
    assert.equal(verdict.degenerate, false, `page ${page}`);
    assert.equal(verdict.ratio < 0.05, true, `page ${page}: ${verdict.ratio}`);
  }
  const leaders = Array.from({ length: 30 }, (_, i) => `Article ${i + 1} ........ ${i + 3}`).join('\n');
  assert.equal(judgeTranscript(leaders, 'stop').degenerate, false);
});

test('a short answer is never judged: a page that holds a few « [illisible] » is the illegible flag, not a loop', () => {
  assert.equal(repetitionRatio('[illisible] [illisible] [illisible] merci [illisible]'), 0);
  assert.equal(judgeTranscript('[illisible] '.repeat(10), 'stop').degenerate, false);
  assert.equal(judgeTranscript('', 'stop').empty, true);
  assert.equal(judgeTranscript('   \n ', 'stop').empty, true);
});

test('the ratio counts the redundant words, so it is the share of the output that says nothing new', () => {
  // 100 distinct words then one word 101 times: 100 of 201 words are redundant.
  const text = [...words(100), ...Array(101).fill('x')].join(' ');
  assert.ok(Math.abs(repetitionRatio(text) - 100 / 201) < 0.01);
});

test('a very long reply is judged in a time that does not depend on its size more than linearly', () => {
  const text = words(20_000).join(' ');
  const started = performance.now();
  assert.equal(repetitionRatio(text), 0);
  assert.ok(performance.now() - started < 1_000, 'a reply of 20,000 words is judged in under a second');
});
