/**
 * Sprint 002.24 / 002.25: the nature of the project — what the rules depend on (the uses, an
 * extension, floor-area thresholds), the questions asked once after a reading, the answers kept per
 * project, and the candidates they decide: positively excluded, folded with their reason, never
 * confirmed, brought back in one click. The counts are made on the real Marseille zone UD result
 * (`test-fixtures/fr-urban-rules/marseille-ud`). No network.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  __testing,
  createReader,
  createProjectCards,
  natureFromAnswers,
  projectQuestionCardOf,
  projectSummaryCardOf,
  readingCardOf
} from '../src/index.js';
import { FIXTURES, loadPlot, recordedFetch, recordedSiteService, requestFor } from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const {
  triageOf,
  foldedSectors,
  checkedResult,
  scopeOf,
  noDrawingOf,
  checkedReadingOf,
  usesOfCandidate,
  sdpOf,
  sdpHolds,
  projectCheck,
  projectQuestionsOf,
  projectDecidedBy,
  areaBucketsOf,
  natureFromValues,
  projectNatureOf,
  withProjectNature,
  withProjectAsked,
  isProjectNature,
  sectionOf
} = __testing;
const BASE = 'https://editor.example/plugins-api/com.archisimple.fr-urban-rules/';
const CURRENT = { providerId: 'lmstudio', schemaVersion: 1, promptVersion: 3 };
const p = (easting, northing) => ({ easting, northing });
const BOX = [p(0, 0), p(20, 0), p(20, 30), p(0, 30)];
const SOUTH_ROAD = [
  {
    id: 'r',
    line: [p(-20, -6), p(40, -6)],
    kind: 'road',
    level: 'ground',
    widthMetres: 6,
    name: 'Rue',
    attribution: '© IGN'
  }
];
const signal = () => new AbortController().signal;
const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  text: async () => JSON.stringify(body)
});

let lyon;
let recorded;
let marseille;
before(async () => {
  lyon = await loadPlot('lyon');
  recorded = JSON.parse(await readFile(new URL('lyon/extraction/result.json', FIXTURES), 'utf8'));
  marseille = JSON.parse(await readFile(new URL('marseille-ud/result-ud.json', FIXTURES), 'utf8'));
});

const candidate = (fields) => ({
  kind: 'other',
  sector: null,
  statement: 'described',
  limit: undefined,
  passage: 'Un texte.',
  conditions: [],
  exceptions: [],
  ...fields
});

// ── what a candidate is about ────────────────────────────────────────────────────

test('002.24 (uses): a use is read from a candidate’s own subject — a quoted sous-destination, a parking row, a one-line uses row — never from free text', () => {
  const quoted = candidate({
    passage:
      '[b] les constructions de la sous-destination « restauration » à condition qu’elles ne génèrent pas de nuisances.',
    conditions: [
      'les constructions de la sous-destination « restauration »',
      'qu’elles ne génèrent pas de\nnuisances incompatibles avec le voisinage résidentiel'
    ]
  });
  assert.deepEqual(usesOfCandidate(quoted), ['restauration']);
  // « sousdestination », as the règlement's own text runs it together.
  assert.deepEqual(
    usesOfCandidate(
      candidate({
        conditions: ['constructions de la sousdestination « exploitation agricole » existantes']
      })
    ),
    ['agricole']
  );
  // A destination names its sub-destinations; a destination and one of its own named together are the finer one.
  assert.deepEqual(
    usesOfCandidate(
      candidate({
        conditions: ['constructions à destination de « commerce et activités de services »']
      })
    ).sort(),
    ['artisanat-commerce', 'cinema', 'commerce-gros', 'hotel', 'restauration', 'services-clientele']
  );
  assert.deepEqual(
    usesOfCandidate(candidate({ passage: 'x', conditions: ['Habitation', 'Logement'] })),
    ['logement']
  );
  assert.deepEqual(
    usesOfCandidate(candidate({ passage: 'x', conditions: ['Habitation', 'Hébergement'] })),
    ['hebergement']
  );
  assert.deepEqual(
    usesOfCandidate(
      candidate({
        passage: 'x',
        conditions: [
          'Artisanat et commerces\nde détail',
          'Services avec\naccueil de clients',
          'Restauration'
        ]
      })
    ),
    ['artisanat-commerce', 'restauration', 'services-clientele']
  );
  assert.deepEqual(usesOfCandidate(candidate({ passage: 'Commerce de gros Interdit' })), [
    'commerce-gros'
  ]);
  assert.deepEqual(usesOfCandidate(candidate({ passage: 'Exploitation forestière Interdit' })), [
    'forestier'
  ]);
  // A use the table does not know makes the candidate unreadable: it is not scoped on a guess.
  assert.equal(
    usesOfCandidate(
      candidate({ conditions: ['constructions de la sous-destination « chenil » existantes'] })
    ),
    undefined
  );
  // Free text that merely mentions a use scopes nothing.
  assert.equal(
    usesOfCandidate(
      candidate({
        passage: 'Les constructions à usage de logement doivent respecter la hauteur.',
        conditions: ['Dans le secteur UDa']
      })
    ),
    undefined
  );
  assert.equal(
    usesOfCandidate(candidate({ passage: 'Industrie' })),
    undefined,
    'a bare word is no uses row'
  );
});

test('002.24 (floor area): the thresholds a condition states are read for the plot’s own sector — or not at all', () => {
  const sdp = (text) => candidate({ conditions: [text] });
  assert.deepEqual(
    sdpOf(sdp('constructions d’une\nsurface de plancher* inférieure à 500\nm2'), 'UDa1'),
    [{ cmp: 'lt', threshold: 500 }]
  );
  assert.deepEqual(
    sdpOf(
      sdp(
        'Pour les constructions dont\nla surface de plancher* est\négale ou supérieure à 250\nm2'
      ),
      'UDb'
    ),
    [{ cmp: 'ge', threshold: 250 }]
  );
  const perSector =
    'Pour les constructions d’une\nsurface de plancher* inférieure à 500\nm2 dans les secteurs UDa et UDa1, ou\n250 m2 dans le secteur UDa2';
  assert.deepEqual(sdpOf(sdp(perSector), 'UDa1'), [{ cmp: 'lt', threshold: 500 }]);
  assert.deepEqual(sdpOf(sdp(perSector), 'UDa'), [{ cmp: 'lt', threshold: 500 }]);
  assert.deepEqual(sdpOf(sdp(perSector), 'UDa2'), [{ cmp: 'lt', threshold: 250 }]);
  // A sector the condition does not name, or a zone with no sector: no threshold, the candidate is left alone.
  assert.deepEqual(sdpOf(sdp(perSector), 'UDb'), []);
  assert.deepEqual(sdpOf(sdp(perSector), 'UD'), []);
  assert.deepEqual(sdpOf(sdp('constructions de grande taille'), 'UDa1'), []);
});

test('002.24 (works): an extension is what a candidate is about only when its subject says so — « les nouvelles constructions et les extensions » is about both', () => {
  assert.equal(
    scopeOf({ item: candidate({ conditions: ['une seule extension'] }), zone: 'UD' })?.works,
    'extension'
  );
  assert.equal(
    scopeOf({
      item: candidate({
        passage: 'Les extensions* de constructions existantes peuvent être implantées plus près.'
      }),
      zone: 'UD'
    })?.works,
    'extension'
  );
  assert.equal(
    scopeOf({
      item: candidate({ passage: 'Est admise l’extension* des constructions existantes.' }),
      zone: 'UD'
    })?.works,
    'extension'
  );
  assert.equal(
    scopeOf({
      item: candidate({
        conditions: ['Les nouvelles constructions et les extensions de constructions existantes']
      }),
      zone: 'UD'
    }),
    undefined
  );
  assert.equal(
    scopeOf({ item: candidate({ passage: 'Le retrait est de 4 mètres.' }), zone: 'UD' }),
    undefined
  );
});

// ── what the answers say ──────────────────────────────────────────────────────────

test('002.24: a floor-area answer decides a threshold only where it settles it — an exact area always, a bucket never across its edge', () => {
  const exact = (n) => ({ from: n, to: n, exact: true });
  assert.equal(sdpHolds('lt', 500, exact(320)), true);
  assert.equal(sdpHolds('ge', 500, exact(320)), false);
  assert.equal(sdpHolds('ge', 250, exact(250)), true);
  assert.equal(sdpHolds('lt', 250, exact(250)), false);
  const [under, middle, over] = areaBucketsOf([250, 500]);
  assert.deepEqual(
    [under.to, middle.from, middle.to, over.from, over.to],
    [250, 250, 500, 500, null]
  );
  assert.equal(sdpHolds('lt', 500, middle), true);
  assert.equal(sdpHolds('ge', 500, middle), false);
  assert.equal(sdpHolds('ge', 250, middle), true);
  assert.equal(sdpHolds('lt', 250, middle), false);
  assert.equal(sdpHolds('ge', 500, over), true);
  assert.equal(sdpHolds('lt', 500, over), false);
  // Across the edge: open. « under 250 » against « inférieure ou égale à 250 » is true; « at most 300 » against it is not known.
  assert.equal(sdpHolds('le', 250, under), true);
  assert.equal(sdpHolds('le', 300, middle), undefined);
  assert.equal(sdpHolds('gt', 100, under), undefined);
});

test('002.24: an answer excludes a candidate only positively — « not decided », « other » and a missing answer never do', () => {
  const industry = { uses: ['industrie'] };
  assert.equal(projectCheck(industry, {}).excluded, undefined);
  assert.equal(projectCheck(industry, {}).needs[0].facet, 'use');
  assert.equal(projectCheck(industry, { use: 'other' }).excluded, undefined);
  assert.equal(projectCheck(industry, { use: 'logement' }).excluded.facet, 'use');
  assert.equal(projectCheck(industry, { use: 'industrie' }).excluded, undefined);
  assert.equal(projectCheck(industry, { use: 'industrie' }).applies[0].facet, 'use');
  const extension = { works: 'extension' };
  assert.equal(projectCheck(extension, { works: 'new' }).excluded.facet, 'works');
  assert.equal(projectCheck(extension, { works: 'annex' }).excluded.facet, 'works');
  assert.equal(projectCheck(extension, { works: 'extension' }).excluded, undefined);
  assert.equal(projectCheck(extension, {}).excluded, undefined);
  const small = { sdp: [{ cmp: 'lt', threshold: 500 }] };
  assert.equal(projectCheck(small, { area: { from: 500, to: null } }).excluded.facet, 'sdp');
  assert.equal(projectCheck(small, { area: { from: 250, to: 750 } }).excluded, undefined);
  assert.equal(projectCheck(small, { area: { from: 250, to: 750 } }).needs[0].facet, 'sdp');
  assert.equal(projectCheck(undefined, { use: 'logement' }).excluded, undefined);
  assert.equal(projectCheck({ icpe: true }, { icpe: 'no' }).excluded.facet, 'icpe');
  assert.equal(projectCheck({ icpe: true }, { icpe: 'yes' }).applies[0].facet, 'icpe');
});

// ── the real règlement: Marseille UD ──────────────────────────────────────────────

function counts(zone, nature) {
  const result = checkedResult({ ...marseille });
  const keys = result.rules.map((_, i) => `k${i}`);
  const folded = foldedSectors(
    result.rules,
    keys,
    zone,
    new Set(),
    (index) => triageOf({ item: result.rules[index], zone, commune: 'Marseille' }) === undefined
  );
  let listed = 0;
  let context = 0;
  let sameRule = 0;
  const entries = [];
  result.rules.forEach((item, index) => {
    if (folded.get(index)?.drop === true) return;
    listed += 1;
    if (triageOf({ item, zone, commune: 'Marseille' }) !== undefined) {
      context += 1;
      return;
    }
    // Sprint 002.26: the same rule read twice, a bullet of another, one implied by a stricter: decided like the rest.
    if (folded.get(index)?.fold !== undefined) {
      sameRule += 1;
      return;
    }
    entries.push({ scope: scopeOf({ item, zone }), item });
  });
  const project = projectDecidedBy(entries, nature);
  // What the answers leave open is listed in two groups (still for a person to confirm) and the rest.
  const open = entries.filter((entry) => projectCheck(entry.scope, nature).excluded === undefined);
  const applies = open.filter((entry) => noDrawingOf(entry.item)).length;
  const checked = open.filter(
    (entry) =>
      !noDrawingOf(entry.item) &&
      checkedReadingOf({ item: entry.item, zone }) &&
      projectCheck(entry.scope, nature).needs.length === 0
  ).length;
  return {
    listed,
    context,
    sameRule,
    project,
    applies,
    checked,
    left: listed - context - sameRule - project - applies - checked,
    questions: projectQuestionsOf(entries)
  };
}

test('002.24 on Marseille UD: housing, a restaurant extension and a workshop each narrow what is left (002.26: after the folds and the two groups apart)', () => {
  // 002.25 had 56, 53 and 66 left with nothing answered; 002.26 decides seven (UDa1), two (UDb) and one (UD) as the
  // same rule read twice, and lists apart 15 that apply without shaping the area and 1 reading that can be checked.
  const none = counts('UDa1', {});
  assert.deepEqual(
    [none.listed, none.context, none.sameRule, none.project, none.applies, none.checked, none.left],
    [82, 26, 7, 0, 15, 1, 33]
  );
  assert.equal(none.listed - none.context - none.project, 56, '002.25’s number is still the sum');
  const udb = counts('UDb', {});
  assert.deepEqual([udb.sameRule, udb.applies, udb.checked, udb.left], [2, 15, 1, 35]);
  assert.equal(udb.listed - udb.context, 53);
  const ud = counts('UD', {});
  assert.deepEqual([ud.sameRule, ud.applies, ud.checked, ud.left], [1, 15, 1, 49]);
  assert.equal(ud.listed - ud.context, 66);
  const housing = counts('UDa1', {
    works: 'new',
    use: 'logement',
    area: { from: 320, to: 320, exact: true }
  });
  // 19 → 17: two of the rules housing excludes are first the same rule read twice (restaurant, pool).
  assert.deepEqual([housing.project, housing.applies, housing.left], [17, 11, 20]);
  const restaurant = counts('UDa1', { works: 'extension', use: 'restauration' });
  assert.deepEqual([restaurant.project, restaurant.applies, restaurant.left], [13, 10, 25]);
  const workshop = counts('UDb', { use: 'industrie' });
  assert.deepEqual([workshop.project, workshop.applies, workshop.left], [14, 9, 27]);
  // The questions are what the candidates depend on: the thresholds are the ones the rules state.
  assert.deepEqual(
    none.questions.map((q) => [q.id, q.n]),
    [
      ['works', 4],
      ['use', 15],
      ['area', 6],
      ['icpe', 1]
    ]
  );
  assert.deepEqual(none.questions.find((q) => q.id === 'area').thresholds, [250, 500]);
  assert.deepEqual(counts('UDa2', {}).questions.find((q) => q.id === 'area').thresholds, [250]);
});

test('002.24: a question is asked only if some candidate depends on it; a reading that depends on nothing asks nothing', () => {
  assert.deepEqual(projectQuestionsOf([]), []);
  assert.deepEqual(projectQuestionsOf([{ scope: undefined }, { scope: undefined }]), []);
  assert.deepEqual(
    projectQuestionsOf([{ scope: { uses: ['industrie'] } }, { scope: { uses: ['bureau'] } }]).map(
      (q) => [q.id, q.n]
    ),
    [['use', 2]]
  );
});

// ── the stored answers ────────────────────────────────────────────────────────────

test('002.24: the answers are one record of the section, per project; a shape not recognised makes the section read-only', () => {
  assert.equal(
    isProjectNature({
      works: 'new',
      use: 'logement',
      area: { from: 0, to: 250 },
      icpe: 'no',
      askedFor: ['A']
    }),
    true
  );
  assert.equal(isProjectNature({ works: 'demolition' }), false);
  assert.equal(isProjectNature({ use: 'chenil' }), false);
  assert.equal(isProjectNature({ area: { from: 500, to: 250 } }), false);
  assert.equal(isProjectNature({ area: { from: 10, to: 10, exact: true } }), true);
  assert.equal(isProjectNature([]), false);
  assert.equal(sectionOf({ schema: 1, projectNature: { works: 'demolition' } }).readOnly, true);
  assert.equal(sectionOf({ schema: 1, projectNature: { works: 'new' } }).readOnly, false);
  assert.deepEqual(projectNatureOf({ projectNature: { works: 'demolition' } }), {});
  const next = withProjectNature(
    { schema: 1, confirmations: [] },
    { use: 'logement' },
    'idurba-a',
    '2026-11-04T10:00:00Z'
  );
  assert.deepEqual(next.projectNature, {
    use: 'logement',
    askedFor: ['idurba-a'],
    at: '2026-11-04T10:00:00Z'
  });
  assert.deepEqual(next.confirmations, [], 'the rest of the section is kept');
  const again = withProjectNature(next, { works: 'new' }, 'idurba-b', '2026-11-05T10:00:00Z');
  assert.deepEqual(
    again.projectNature.askedFor,
    ['idurba-a', 'idurba-b'],
    'every document asked is kept'
  );
  const later = withProjectAsked(again, 'idurba-c', '2026-11-06T10:00:00Z');
  assert.deepEqual(projectNatureOf(later), { works: 'new' }, '« not now » keeps the answers');
  assert.equal(later.projectNature.askedFor.at(-1), 'idurba-c');
});

test('002.25: the panel’s form says answers — « not decided » and an empty area are none, a bucket from the card stays unless a number is typed', () => {
  assert.deepEqual(
    natureFromValues({ works: 'new', use: 'undecided', area: 320, icpe: 'undecided' }, {}),
    {
      works: 'new',
      area: { from: 320, to: 320, exact: true }
    }
  );
  assert.deepEqual(natureFromValues({ works: 'undecided', use: 'restauration', icpe: 'no' }, {}), {
    use: 'restauration',
    icpe: 'no'
  });
  const bucket = { from: 250, to: 500 };
  assert.deepEqual(natureFromValues({ use: 'logement' }, { area: bucket }), {
    use: 'logement',
    area: bucket
  });
  assert.deepEqual(natureFromValues({ use: 'logement', area: 100 }, { area: bucket }).area, {
    from: 100,
    to: 100,
    exact: true
  });
  assert.deepEqual(
    natureFromValues({ use: 'logement' }, { area: { from: 100, to: 100, exact: true } }),
    { use: 'logement' },
    'an exact area is cleared by clearing it'
  );
  assert.deepEqual(natureFromValues({ area: -4 }, {}), {});
});

// ── the card ──────────────────────────────────────────────────────────────────────

const offerOf = (zone, nature = {}) => {
  const result = checkedResult({ ...marseille });
  const keys = result.rules.map((_, i) => `k${i}`);
  const folded = foldedSectors(result.rules, keys, zone, new Set());
  const entries = [];
  result.rules.forEach((item, index) => {
    if (
      folded.get(index)?.drop === true ||
      triageOf({ item, zone, commune: 'Marseille' }) !== undefined
    )
      return;
    entries.push({ scope: scopeOf({ item, zone }) });
  });
  const questions = projectQuestionsOf(entries).map((q) => ({ ...q, answered: false }));
  return {
    questions,
    entries,
    nature,
    decided: 0,
    base: 56,
    unanswered: questions.length,
    known: false,
    documentKey: 'DOC-A',
    asked: false,
    zone
  };
};

test('002.24: the question card asks what the rules depend on, with the thresholds as chips and a live line of how many it would decide', () => {
  const offer = offerOf('UDa1');
  const card = projectQuestionCardOf(offer, {}, 0);
  assert.equal(card.kind, 'questions');
  assert.deepEqual(
    card.questions.map((q) => q.id),
    ['works', 'use', 'area', 'icpe']
  );
  const area = card.questions.find((q) => q.id === 'area');
  assert.deepEqual(
    area.choices.map((c) => c.id),
    ['b0', 'b1', 'b2', 'undecided']
  );
  assert.deepEqual(area.choices[1].label, {
    key: 'fr-urban-rules.project.area.range',
    params: { from: 250, to: 500 }
  });
  assert.equal(area.choices.at(-1).quiet, true);
  assert.equal(card.questions.find((q) => q.id === 'works').hint.params.n, 5);
  assert.deepEqual(
    card.actions.map((a) => a.id),
    ['later', 'apply']
  );
  assert.deepEqual(card.summary.params, { n: 0, m: 56 });
  // The line follows the answers; an exact area typed in the panel selects the bucket holding it.
  const housing = natureFromAnswers({ works: 'new', use: 'logement', area: 'b1' }, offer, {});
  assert.deepEqual(housing, { works: 'new', use: 'logement', area: { from: 250, to: 500 } });
  const typed = { from: 320, to: 320, exact: true };
  assert.equal(
    projectQuestionCardOf(offer, { area: typed }, 0).questions.find((q) => q.id === 'area')
      .selected,
    'b1'
  );
  assert.deepEqual(
    natureFromAnswers({ area: 'b1' }, offer, { area: typed }).area,
    typed,
    'the exact area stays while its bucket is chosen'
  );
  assert.deepEqual(natureFromAnswers({ area: 'b2' }, offer, { area: typed }).area, {
    from: 500,
    to: null
  });
  // « Not decided » and a cleared chip are no answer; a question the card did not ask keeps its stored answer.
  assert.deepEqual(natureFromAnswers({ works: 'undecided' }, offer, {}), {});
  const noIcpe = { ...offer, questions: offer.questions.filter((q) => q.id !== 'icpe') };
  assert.equal(natureFromAnswers({}, noIcpe, { icpe: 'yes' }).icpe, 'yes');
  const summary = projectSummaryCardOf(offer, housing, 19);
  assert.equal(summary.kind, 'summary');
  assert.deepEqual(summary.notes[0].text.params, { n: 19, m: 37 });
  assert.deepEqual(
    summary.actions.map((a) => a.id),
    ['open', 'change']
  );
  assert.equal(summary.actions[0].reveal, true);
});

function fakeAi() {
  const posted = [];
  const ai = {
    cards: {
      post(card, handlers) {
        const entry = { card, handlers, updates: [], disposed: false };
        posted.push(entry);
        return {
          update: (next) => entry.updates.push(next),
          dispose: () => (entry.disposed = true)
        };
      }
    }
  };
  return { ai, posted };
}

test('002.24: the question card is posted once after a reading, answered with Apply into the summary, or put off with « Not now » — and never without the cards service', () => {
  const stored = [];
  const dismissed = [];
  let offer = offerOf('UDa1');
  const { ai, posted } = fakeAi();
  const cards = createProjectCards({
    ai: () => ai,
    offer: () => offer,
    save: (nature, o) => (stored.push([nature, o.documentKey]), true),
    dismiss: (o) => dismissed.push(o.documentKey)
  });
  cards.afterReading();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].card.kind, 'questions');
  // A choice updates the line beneath the chips.
  posted[0].handlers.onAnswer({
    cardId: 'project-nature',
    answers: { works: 'new', use: 'logement' }
  });
  assert.deepEqual(posted[0].updates.at(-1).summary.params.m, 56);
  assert.ok(posted[0].updates.at(-1).summary.params.n > 0, 'the answers would decide some rules');
  // Apply stores the answers against the document and posts the summary in its place.
  posted[0].handlers.onAction({
    cardId: 'project-nature',
    actionId: 'apply',
    answers: { works: 'new', use: 'logement', area: 'b1' }
  });
  assert.deepEqual(stored, [
    [{ works: 'new', use: 'logement', area: { from: 250, to: 500 } }, 'DOC-A']
  ]);
  assert.equal(posted[0].disposed, true);
  assert.equal(posted[1].card.kind, 'summary');
  // « Change my answers » asks again.
  posted[1].handlers.onAction({
    cardId: 'project-nature-summary',
    actionId: 'change',
    answers: {}
  });
  assert.equal(posted[2].card.kind, 'questions');
  // « Not now » records the document and takes the card down.
  posted[2].handlers.onAction({ cardId: 'project-nature', actionId: 'later', answers: {} });
  assert.deepEqual(dismissed, ['DOC-A']);
  assert.equal(posted[2].disposed, true);
  // Asked already, answered already, or nothing to ask: nothing is posted after a reading.
  const count = posted.length;
  offer = { ...offerOf('UDa1'), asked: true };
  cards.afterReading();
  offer = { ...offerOf('UDa1'), unanswered: 0 };
  cards.afterReading();
  offer = { ...offerOf('UDa1'), questions: [], unanswered: 0 };
  cards.afterReading();
  assert.equal(cards.ask(), false);
  assert.equal(posted.length, count);
  // A host without `ai.cards` finds nothing, and throws nothing.
  const bare = createProjectCards({
    ai: () => ({}),
    offer: () => offerOf('UDa1'),
    save: () => true,
    dismiss: () => {}
  });
  bare.afterReading();
  assert.equal(bare.ask(), false);
  // A save that fails keeps the question card up.
  const failing = fakeAi();
  const refused = createProjectCards({
    ai: () => failing.ai,
    offer: () => offerOf('UDa1'),
    save: () => false,
    dismiss: () => {}
  });
  refused.ask();
  failing.posted[0].handlers.onAction({
    cardId: 'project-nature',
    actionId: 'apply',
    answers: { use: 'logement' }
  });
  assert.equal(failing.posted.length, 1);
  assert.equal(failing.posted[0].disposed, false);
});

test('002.24: the reading card offers « Narrow them with your project » while questions are unanswered, and says how many the project decided', () => {
  const done = (counts) =>
    readingCardOf({
      id: 'z',
      zone: 'UDa1',
      state: 'done',
      result: { rules: new Array(98), chunks: { failed: 0 } },
      counts
    });
  const asked = done({ read: 98, auto: 26, left: 56, project: 0, ask: 4 });
  assert.deepEqual(
    asked.actions.map((a) => a.id),
    ['narrow', 'open']
  );
  assert.equal(asked.actions[0].emphasis, 'primary');
  assert.equal(asked.actions[1].emphasis, undefined);
  assert.equal(
    asked.stats.some((s) => s.label.key === 'fr-urban-rules.card.stat.project'),
    false
  );
  const answered = done({ read: 98, auto: 45, left: 37, project: 19, ask: 0 });
  assert.deepEqual(
    answered.actions.map((a) => a.id),
    ['open']
  );
  assert.equal(answered.actions[0].emphasis, 'primary');
  assert.deepEqual(
    answered.stats.find((s) => s.label.key === 'fr-urban-rules.card.stat.project').value,
    19
  );
});

// ── the reader ────────────────────────────────────────────────────────────────────

const serviceRule = (fields) => ({
  kind: 'other',
  sector: null,
  statement: 'described',
  limit: null,
  page: 126,
  article: '2.2.1.2',
  passage: 'Une règle de test.',
  offset: { start: 1, end: 10 },
  occurrence: { of: 1, chosenBy: 'only' },
  conditions: [],
  exceptions: [],
  sectorUnplaced: false,
  confidence: 'high',
  ...fields
});
const metres = (comparison, value) => ({ kind: 'value', comparison, value, unit: 'm' });
const SETBACK = serviceRule({
  kind: 'boundary_setback',
  statement: 'limit',
  limit: metres('min', 4),
  passage: 'Le retrait est d’au moins 4 mètres.'
});
const RESTAURANT = serviceRule({
  passage:
    'Les constructions de la sous-destination « restauration » à condition qu’elles ne génèrent pas de nuisances.',
  conditions: ['les constructions de la sous-destination « restauration »']
});
const INDUSTRY = serviceRule({ passage: 'Industrie Interdit' });
const EXTENSION = serviceRule({
  kind: 'extension_max',
  passage: 'Une seule extension du bâtiment principal est admise.',
  conditions: ['une seule extension du bâtiment principal']
});
const BIG = serviceRule({
  kind: 'boundary_setback',
  statement: 'limit',
  limit: metres('min', 6),
  passage: 'Le retrait est d’au moins 6 mètres.',
  conditions: ['constructions d’une surface de plancher supérieure ou égale à 500 m2']
});
const SMALL = serviceRule({
  kind: 'boundary_setback',
  statement: 'limit',
  limit: metres('min', 3),
  passage: 'Le retrait est d’au moins 3 mètres.',
  conditions: ['constructions d’une surface de plancher inférieure à 500 m2']
});

function store(initial) {
  let held = initial;
  return {
    held: () => held,
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next, label) => {
        held = structuredClone(next);
        store.labels.push(label);
        return true;
      }
    }
  };
}
store.labels = [];
function context({ rules, section } = {}) {
  const cached = { ...structuredClone(recorded), promptVersion: 3, rules };
  const planning = recordedFetch(lyon.answers, {});
  const fetch = async (url) => {
    if (!String(url).startsWith(BASE)) return planning.fetch(url, {});
    const path = new URL(String(url)).pathname.replace(
      '/plugins-api/com.archisimple.fr-urban-rules/',
      ''
    );
    if (path === 'v1/chapter')
      return json(200, {
        pages: [121, 144],
        found: 'outline',
        match: 'prefix',
        title: 'Zone UCe1',
        documentPages: 803
      });
    if (path === 'v1/extractions') return json(200, { result: cached, current: CURRENT });
    return json(404, { error: 'not_found' });
  };
  const site = { ...lyon.site, boundary: { ring: BOX } };
  const data = store(section);
  const reader = createReader({
    fetch,
    site: () => recordedSiteService(site, lyon.conversions, {}),
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    pluginService: () => ({ locate: async () => ({ baseUrl: BASE }) }),
    packageData: () => data.service,
    document: () => ({ find: () => [] }),
    translate: (key) => key
  });
  return { reader, site, data };
}
const read = (c) => c.reader.read(requestFor(c.site), { signal: signal() });
const act = (c, actionId, target, values) =>
  c.reader.runAction({ actionId, target, values, site: c.site }, { signal: signal() });
const view = (report, id) => report.views.find((v) => v.id === id);
const written = (report) => report.rules.filter((r) => r.provenance === 'written');
const byPassage = (report, start) =>
  written(report).find((r) => r.citation.passage.text.startsWith(start));
const sections = (report) => view(report, 'rules').blocks.filter((b) => b.kind === 'section');
const VERSION = { idurba: '200046977_PLUI_20260326', datvalid: '20260326' };

test('002.25: without answers the rules are what they were — each scoped one says what it needs; with them the others are folded under « Your project », never confirmed', async () => {
  const bare = await read(
    context({ rules: [SETBACK, RESTAURANT, INDUSTRY, EXTENSION, BIG, SMALL] })
  );
  assert.ok(
    written(bare).every((r) => r.status === 'to_confirm'),
    'nothing is decided by nothing'
  );
  assert.deepEqual(
    byPassage(bare, 'Les constructions de la sous-destination')
      .conditions.filter((c) => c.key?.startsWith('fr-urban-rules.project.'))
      .map((c) => c.key),
    ['fr-urban-rules.project.needs.use']
  );
  assert.deepEqual(
    byPassage(bare, 'Le retrait est d’au moins 6').conditions.at(-1).key,
    'fr-urban-rules.project.needs.sdp'
  );
  assert.equal(
    byPassage(bare, 'Le retrait est d’au moins 4').conditions.some((c) =>
      c.key?.startsWith('fr-urban-rules.project.')
    ),
    false
  );
  const section = {
    schema: 1,
    projectNature: { works: 'new', use: 'logement', area: { from: 320, to: 320, exact: true } }
  };
  const report = await read(
    context({ rules: [SETBACK, RESTAURANT, INDUSTRY, EXTENSION, BIG, SMALL], section })
  );
  for (const start of [
    'Les constructions de la sous-destination',
    'Industrie',
    'Une seule extension',
    'Le retrait est d’au moins 6'
  ]) {
    const rule = byPassage(report, start);
    assert.equal(rule.status, 'not_applicable', start);
    assert.ok(rule.conditions.at(-1).key.startsWith('fr-urban-rules.project.excluded.'), start);
  }
  assert.equal(byPassage(report, 'Le retrait est d’au moins 4').status, 'to_confirm');
  const small = byPassage(report, 'Le retrait est d’au moins 3');
  assert.equal(small.status, 'to_confirm');
  assert.equal(small.conditions.at(-1).key, 'fr-urban-rules.project.applies.sdp');
  assert.deepEqual(small.conditions.at(-1).params, {
    cmp: 'fr-urban-rules.project.cmp.lt',
    threshold: 500,
    area: '320 m²'
  });
  assert.ok(
    !written(report).some((r) => r.status === 'confirmed'),
    'nothing is confirmed on the user’s behalf'
  );
  const decided = sections(report).find((s) => s.id === 'decided-automatically');
  assert.deepEqual(decided.title, { key: 'fr-urban-rules.triage.heading', params: { count: 4 } });
  assert.equal(decided.summary.value.key, 'fr-urban-rules.triage.summaryProject');
  assert.deepEqual(decided.summary.value.params.project, 4);
  const note = view(report, 'rules').blocks.find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.triage.noticeProject'
  );
  assert.equal(note.text.params.project, 4);
  // One « Bring back » per decided rule, as for the others.
  const actions = decided.blocks.find((b) => b.kind === 'actions').actions;
  assert.deepEqual(
    actions.map((a) => a.id),
    ['bring-back', 'bring-back', 'bring-back', 'bring-back']
  );
});

test('002.25: « Bring back » keeps a rule despite the answers; a decision the user took stands; a new document version asks again', async () => {
  const section = { schema: 1, projectNature: { use: 'logement' } };
  const c = context({ rules: [RESTAURANT, SETBACK], section });
  let report = await read(c);
  const rule = byPassage(report, 'Les constructions de la sous-destination');
  assert.equal(rule.status, 'not_applicable');
  const decided = sections(report).find((s) => s.id === 'decided-automatically');
  const bring = decided.blocks.find((b) => b.kind === 'actions').actions[0];
  assert.equal((await act(c, 'bring-back', bring.target)).status, 'done');
  report = await read(c);
  assert.equal(byPassage(report, 'Les constructions de la sous-destination').status, 'to_confirm');
  assert.equal(c.data.held().projectNature.use, 'logement', 'the answers are kept');
  // Brought back against another version of the document: the project decides again.
  const older = structuredClone(c.data.held());
  older.broughtBack[0].datvalid = '20200101';
  const after = await read(context({ rules: [RESTAURANT, SETBACK], section: older }));
  assert.equal(
    byPassage(after, 'Les constructions de la sous-destination').status,
    'not_applicable'
  );
  // A stored confirmation stands over the project's answer.
  const confirmed = {
    schema: 1,
    projectNature: { use: 'logement' },
    confirmations: [
      {
        ruleKey: rule.id,
        decision: 'confirmed',
        kind: 'other',
        statement: 'described',
        ...VERSION,
        edited: false,
        at: '2026-11-03T10:00:00.000Z',
        provenance: 'written',
        zone: 'UCe1b'
      }
    ]
  };
  const kept = await read(context({ rules: [RESTAURANT, SETBACK], section: confirmed }));
  assert.equal(byPassage(kept, 'Les constructions de la sous-destination').status, 'confirmed');
});

test('002.25: answers persist across a document update — recomputed on the new reading’s candidates, whatever they are', async () => {
  const section = { schema: 1, projectNature: { use: 'industrie', askedFor: ['OLD-DOC'] } };
  const first = await read(context({ rules: [RESTAURANT, INDUSTRY, SETBACK], section }));
  assert.equal(
    byPassage(first, 'Les constructions de la sous-destination').status,
    'not_applicable'
  );
  assert.equal(byPassage(first, 'Industrie').status, 'to_confirm');
  // The next version of the document reads other candidates: the same answers decide them.
  const GROS = serviceRule({ passage: 'Commerce de gros Interdit' });
  const next = await read(context({ rules: [GROS, INDUSTRY, SETBACK], section }));
  assert.equal(byPassage(next, 'Commerce de gros').status, 'not_applicable');
  assert.equal(byPassage(next, 'Industrie').status, 'to_confirm');
  assert.equal(
    next.rules.some((r) => r.status === 'confirmed'),
    false
  );
});

test('002.25: the « Project nature » section shows the answers and what they decide, with one form that writes them undoably', async () => {
  const c = context({ rules: [RESTAURANT, INDUSTRY, SETBACK, BIG] });
  let report = await read(c);
  let section = sections(report).find((s) => s.id === 'project-nature');
  assert.ok(section, 'there is something to ask, so the section is there');
  assert.deepEqual(
    section.blocks.find((b) => b.kind === 'fields').rows.map((r) => r.value.key),
    [
      'fr-urban-rules.project.notDecided',
      'fr-urban-rules.project.notDecided',
      'fr-urban-rules.project.notDecided'
    ]
  );
  const change = section.blocks.find((b) => b.kind === 'actions').actions[0];
  assert.equal(change.id, 'set-project-nature');
  assert.deepEqual(
    change.fields.map((f) => f.key),
    ['works', 'use', 'area']
  );
  assert.equal(
    change.fields.find((f) => f.key === 'use').options.length,
    17,
    'not decided, and the sixteen uses'
  );
  store.labels.length = 0;
  assert.equal(
    (await act(c, 'set-project-nature', undefined, { use: 'logement', area: 320 })).status,
    'done'
  );
  assert.deepEqual(store.labels, ['fr-urban-rules.undo.projectNature']);
  assert.deepEqual(projectNatureOf(c.data.held()), {
    use: 'logement',
    area: { from: 320, to: 320, exact: true }
  });
  report = await read(c);
  section = sections(report).find((s) => s.id === 'project-nature');
  assert.deepEqual(section.summary.value, { key: 'fr-urban-rules.project.use.logement' });
  assert.equal(byPassage(report, 'Industrie').status, 'not_applicable');
  assert.equal(byPassage(report, 'Le retrait est d’au moins 6').status, 'not_applicable');
  assert.equal(
    section.blocks.find((b) => b.kind === 'notice').text.params.count,
    3,
    'restaurant, industry and the 500 m² setback are decided by the answers'
  );
  // A section of a shape not recognised is read-only: the form refuses and the view offers none.
  const odd = context({
    rules: [INDUSTRY],
    section: { schema: 1, projectNature: { use: 'chenil' } }
  });
  const oddReport = await read(odd);
  assert.equal(
    (await act(odd, 'set-project-nature', undefined, { use: 'logement' })).status,
    'refused'
  );
  assert.equal(
    sections(oddReport)
      .find((s) => s.id === 'project-nature')
      ?.blocks.some((b) => b.kind === 'actions') ?? false,
    false
  );
});

test('002.25: with no candidate depending on the project and no answer there is no section and no question', async () => {
  const report = await read(
    context({
      rules: [
        SETBACK,
        serviceRule({ passage: 'Toute construction doit être raccordée au réseau.' })
      ]
    })
  );
  assert.equal(
    sections(report).some((s) => s.id === 'project-nature'),
    false
  );
});
