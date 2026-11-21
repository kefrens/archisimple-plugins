/**
 * Sprint 002.38: a statement's words may sit just after the quoted passage. « … indiquées au règlement graphique
 * lorsqu'elle existe » cut by the model before « graphique » is still the sentence that says « see the graphic
 * documents »: the check looks at the passage and the rest of its own sentence, never further.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractChapter } from '../src/extract.mjs';
import { prepareChapter } from '../src/text.mjs';
import { fakeAi, rule } from './ai-fake.mjs';

const PAD =
  'Les dispositions du présent article s’appliquent aux constructions nouvelles et aux extensions.';
const SENTENCE =
  'La hauteur des constructions* ne pourra excéder les hauteurs indiquées au règlement graphique lorsqu’elle existe.';
const CUT = 'La hauteur des constructions* ne pourra excéder les hauteurs indiquées au règlement';

const chapter = (...lines) =>
  prepareChapter([{ page: 12, text: ['4.5 - Hauteur', PAD, PAD, ...lines, PAD].join('\n') }]);
const height = (statement) => rule({ kind: 'height_total', statement, limit: null, sector: null });

const read = async (value, lines) => {
  const ai = fakeAi({ plan: () => [{ value, passage: CUT }] });
  return extractChapter({ prepared: chapter(...lines), ai });
};

test('a see_graphic passage cut before « graphique » is kept when the word ends its sentence', async () => {
  const out = await read(height('see_graphic'), [SENTENCE]);
  assert.equal(out.dropped.incoherent, 0);
  assert.equal(out.rules.length, 1);
  assert.equal(out.rules[0].statement, 'see_graphic');
  assert.equal(out.rules[0].passage, CUT, 'the passage stays as the model quoted it');
});

test('the word in the next sentence, or nowhere, is not enough', async () => {
  const next = await read(height('see_graphic'), [
    `${CUT} en vigueur.`,
    'Voir le règlement graphique pour les cotes.'
  ]);
  assert.equal(next.rules.length, 0);
  assert.equal(next.dropped.incoherent, 1);
  const none = await read(height('see_graphic'), [`${CUT} en vigueur.`]);
  assert.equal(none.rules.length, 0);
  assert.equal(none.dropped.incoherent, 1);
});

test('the same for « not regulated »: « réglementé » just after the passage, in its sentence', async () => {
  const ai = fakeAi({
    plan: () => [
      {
        value: rule({ kind: 'footprint_ratio', statement: 'not_regulated', limit: null }),
        passage: 'L’emprise au sol des constructions n’est pas'
      }
    ]
  });
  const out = await extractChapter({
    prepared: chapter('L’emprise au sol des constructions n’est pas réglementée.'),
    ai
  });
  assert.equal(out.dropped.incoherent, 0);
  assert.equal(out.rules[0].statement, 'not_regulated');
});

test('a passage that holds the word itself needs nothing after it', async () => {
  const ai = fakeAi({ plan: () => [{ value: height('see_graphic'), passage: SENTENCE }] });
  const out = await extractChapter({ prepared: chapter(SENTENCE), ai });
  assert.equal(out.rules.length, 1);
});
