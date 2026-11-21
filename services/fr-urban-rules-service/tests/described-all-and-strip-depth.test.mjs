/**
 * Sprint 002.42, from the held-out zones of 002.41:
 *  1. A strip's depth that equals the limit's own figure is not grounded by that figure: « inférieure ou égale à
 *     4 mètres » in a strip of unstated depth would otherwise « verify » a depth of 4 m from the height itself.
 *  2. A `described` rule that applies to « all » (the zone and every sector) is one rule of the zone: a sentence
 *     with no figure says the same in every sector. A list of sectors the text names, and every other statement,
 *     still gives one rule per sector.
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
const SECTORS = [
  'En secteur UEa, les règles du présent article s’appliquent.',
  'En secteur UEa1, les règles du présent article s’appliquent.',
  'En secteur UEb, les règles du présent article s’appliquent.'
];

const chapter = (...lines) =>
  prepareChapter([
    { page: 20, text: ['4.2 - Implantation', ...SECTORS, PAD, PAD, ...lines, PAD].join('\n') }
  ]);

const limit4 = { kind: 'value', comparison: 'max', value: 4, unit: 'm' };
const height = (strip, conditions = []) =>
  rule({ kind: 'height_total', statement: 'limit', limit: limit4, strip, conditions });
const STRIP = (depthMetres) => ({ depthMetres, edges: 'side_rear', permits: true });

const NO_DEPTH =
  'et que dans une bande à compter de la limite séparative, inférieure au retrait défini par la règle générale, la hauteur totale de l’extension soit inférieure ou égale à 4 mètres ;';
const WITH_DEPTH =
  'dans une bande de 0 à 4 mètres à compter de la limite séparative, la hauteur totale de l’extension soit inférieure ou égale à 4 mètres ;';

const read = async (value, passage, lines) => {
  const ai = fakeAi({ plan: () => [{ value, passage }] });
  return extractChapter({ prepared: chapter(...lines), ai });
};

test('a depth equal to the height, written once, is the height and not a depth: the limit stays a statement in words', async () => {
  const out = await read(height(STRIP(4)), NO_DEPTH, [NO_DEPTH]);
  const [r] = out.rules;
  assert.equal(r.statement, 'described');
  assert.equal(r.limit, null);
  assert.equal('strip' in r, false);
  assert.equal(out.dropped.stripNotInPassage, 1);
});

test('the same figure written twice (« de 0 à 4 mètres … inférieure ou égale à 4 mètres ») is a depth and a height: kept', async () => {
  const out = await read(height(STRIP(4)), WITH_DEPTH, [WITH_DEPTH]);
  const [r] = out.rules;
  assert.equal(r.statement, 'limit');
  assert.deepEqual(r.strip, { depthMetres: 4, edges: 'side_rear', permits: true });
  assert.equal(out.dropped.stripNotInPassage, undefined);
});

test('the second occurrence may sit in a verified condition, as for any depth', async () => {
  const sentence = 'la hauteur totale de l’extension soit inférieure ou égale à 4 mètres ;';
  const clause = 'dans une bande de 0 à 4 mètres à compter de la limite séparative';
  const out = await read(height(STRIP(4), [clause]), sentence, [`${clause}, ${sentence}`]);
  assert.equal(out.rules[0].statement, 'limit');
  assert.equal(out.rules[0].strip.depthMetres, 4);
});

test('a depth that is not the height figure needs its figure once, as before', async () => {
  const out = await read(height(STRIP(5)), WITH_DEPTH.replace('0 à 4', '0 à 5'), [
    WITH_DEPTH.replace('0 à 4', '0 à 5')
  ]);
  assert.equal(out.rules[0].statement, 'limit');
  assert.equal(out.rules[0].strip.depthMetres, 5);
});

// ── « all » of a described rule ───────────────────────────────────────────────────────────────

const described = (appliesTo) =>
  rule({ kind: 'road_setback', statement: 'described', limit: null, appliesTo });
const ALT =
  'Les extensions* de constructions existantes régulièrement édifiées mais non conformes aux règles peuvent être implantées à une distance inférieure de la règle générale, à condition :';

const readAll = async (value, passage = ALT) => {
  const ai = fakeAi({ plan: () => [{ value, passage }] });
  return extractChapter({ prepared: chapter(passage), ai, sectorsInCode: true });
};

test('a described rule for « all » is one rule of the zone, not one per sector', async () => {
  const out = await readAll(described('all'));
  assert.deepEqual(
    out.rules.map((r) => r.sector),
    [null]
  );
});

test('a described rule for a list of sectors the text names still gives one rule each', async () => {
  const out = await readAll(described(['UE', 'UEa', 'UEb']));
  assert.deepEqual(
    out.rules.map((r) => r.sector).sort((a, b) => String(a).localeCompare(String(b))),
    [null, 'UEa', 'UEb']
  );
});

test('« all » of a rule with a figure, « non réglementé » or a graphic value still expands to every sector', async () => {
  const NR = 'L’emprise au sol des constructions n’est pas réglementée.';
  const notRegulated = await readAll(
    rule({ kind: 'footprint_ratio', statement: 'not_regulated', limit: null, appliesTo: 'all' }),
    NR
  );
  assert.equal(notRegulated.rules.length, 4, 'the zone and UEa, UEa1, UEb');
  const graphic = await readAll(
    rule({ kind: 'height_total', statement: 'see_graphic', limit: null, appliesTo: 'all' }),
    'La hauteur des constructions* ne pourra excéder la hauteur indiquée au règlement graphique lorsqu’elle existe.'
  );
  assert.equal(graphic.rules.length, 4);
});
