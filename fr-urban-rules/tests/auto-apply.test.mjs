/**
 * Sprint 002.46, Epic 1: the readings that can be checked against their own text, and the rules that apply without
 * shaping the area, are applied without a click — `confirmed`, with their reason, listed apart, and brought back by
 * one click each or all at once. Revises 002.22 DEC-2 (« never confirmed ») for these two groups only. What the
 * service doubts about a reading (its `doubts`) keeps it for a person. A decision the user took stands over;
 * a rule brought back is looked at one by one and is not applied again. No network.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createReader, readingCardOf } from '../src/index.js';
import { FIXTURES, loadPlot, recordedFetch, recordedSiteService, requestFor } from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

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
before(async () => {
  lyon = await loadPlot('lyon');
  recorded = JSON.parse(await readFile(new URL('lyon/extraction/result.json', FIXTURES), 'utf8'));
});

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
  doubts: [],
  ...fields
});
const CHECKED = serviceRule({
  kind: 'boundary_setback',
  statement: 'limit',
  limit: { kind: 'value', comparison: 'min', value: 4, unit: 'm' },
  conditions: ['Dans la zone UCe'],
  passage: 'Dans la zone UCe, le retrait est d’au moins 4 mètres.'
});
const NETWORK = serviceRule({
  passage: 'Toute construction doit être raccordée au réseau public d’assainissement.'
});
const PARK = serviceRule({ kind: 'parking', passage: 'Une place par logement.' });
const LOOSE = serviceRule({ passage: 'Les façades sont soignées.' });

function store(initial) {
  let held = initial;
  return {
    held: () => held,
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next) => {
        held = structuredClone(next);
        return true;
      }
    }
  };
}
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
const act = (c, actionId, target) =>
  c.reader.runAction({ actionId, target, site: c.site }, { signal: signal() });
const blocksOf = (report) => report.views.find((v) => v.id === 'rules').blocks;
const sectionOf = (report, id) => blocksOf(report).find((b) => b.kind === 'section' && b.id === id);
const written = (report) => report.rules.filter((r) => r.provenance === 'written');
const byPassage = (report, start) =>
  written(report).find((r) => r.citation.passage.text.startsWith(start));
const idsIn = (section) => section.blocks.find((b) => b.kind === 'rules').ids;
const actionsIn = (section) =>
  section.blocks.filter((b) => b.kind === 'actions').flatMap((b) => b.actions);
const lastCondition = (rule) => rule.conditions.at(-1);

const ALL = [CHECKED, NETWORK, PARK, LOOSE];

test('002.46: a verified reading and the rules that apply without shaping the area are confirmed without a click, each with its reason; the others are left', async () => {
  const c = context({ rules: ALL });
  const report = await read(c);
  const checked = byPassage(report, 'Dans la zone UCe');
  assert.equal(checked.status, 'confirmed');
  assert.deepEqual(lastCondition(checked), { key: 'fr-urban-rules.auto.applied.checked' });
  assert.equal(checked.limit.kind, 'value', 'its limit is the one read');
  for (const start of ['Toute construction', 'Une place']) {
    const rule = byPassage(report, start);
    assert.equal(rule.status, 'confirmed', start);
    assert.deepEqual(lastCondition(rule), { key: 'fr-urban-rules.auto.applied.applies' }, start);
  }
  assert.equal(
    byPassage(report, 'Les façades').status,
    'to_confirm',
    'a loose sentence is for a person'
  );
  // Computed, not stored: nothing is written, and a decision of the user would stand over it.
  assert.equal(c.data.held(), undefined);
  // The two batches no longer exist: their rules are applied.
  assert.equal(sectionOf(report, 'checked-readings'), undefined);
  assert.equal(sectionOf(report, 'applies-no-drawing'), undefined);
});

test('002.46: the applied rules are listed apart, with a notice, « Bring back » on each and « Bring all back » for the group', async () => {
  const report = await read(context({ rules: ALL }));
  const applied = sectionOf(report, 'applied-automatically');
  assert.deepEqual(applied.title, {
    key: 'fr-urban-rules.auto.applied.heading',
    params: { count: 3 }
  });
  const idOf = (start) => byPassage(report, start).id;
  assert.deepEqual(
    [...idsIn(applied)].sort(),
    ['Dans la zone UCe', 'Toute construction', 'Une place'].map(idOf).sort()
  );
  const actions = actionsIn(applied);
  assert.equal(actions.filter((a) => a.id === 'bring-back').length, 3);
  assert.equal(actions.filter((a) => a.id === 'bring-back-all').length, 1);
  assert.deepEqual(actions.find((a) => a.id === 'bring-back-all').label, {
    key: 'fr-urban-rules.auto.applied.bringAll',
    params: { count: 3 }
  });
  const notice = blocksOf(report).find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.auto.applied.notice'
  );
  assert.equal(notice.text.params.count, 3);
  assert.ok(
    Number.isInteger(notice.text.params.left) && notice.text.params.left >= 1,
    'it says what is left'
  );
  // The applied rules are not in the list of what is left to look at.
  const open = blocksOf(report).find((b) => b.kind === 'rules');
  for (const id of idsIn(applied)) assert.ok(!open?.ids?.includes(id), id);
});

test('002.46: what the service doubts keeps a rule for a person; a placement doubt alone does not; a result without doubts needs high confidence', async () => {
  const doubtful = (rule, doubts, confidence = 'low') => ({ ...rule, doubts, confidence });
  const status = async (rule) => {
    const r = await read(context({ rules: [rule] }));
    return byPassage(r, rule.passage.slice(0, 12)).status;
  };
  assert.equal(await status(doubtful(NETWORK, ['model-medium'], 'medium')), 'to_confirm');
  assert.equal(await status(doubtful(PARK, ['condition-not-found'])), 'to_confirm');
  assert.equal(await status(doubtful(PARK, ['figure-not-in-text'])), 'to_confirm');
  assert.equal(await status(doubtful(NETWORK, ['sentence-repeated'])), 'confirmed');
  // Read before `doubts` existed: the label is all there is.
  const old = (rule, confidence) => {
    const { doubts: _doubts, ...rest } = rule;
    return { ...rest, confidence };
  };
  assert.equal(await status(old(NETWORK, 'high')), 'confirmed');
  assert.equal(await status(old(NETWORK, 'medium')), 'to_confirm');
  assert.equal(await status(old(NETWORK, 'low')), 'to_confirm');
});

test('002.46: a decision the user took stands over; a rule brought back is looked at one by one and is not applied again', async () => {
  const c = context({ rules: ALL });
  const first = await read(c);
  const network = byPassage(first, 'Toute construction');
  const applied = sectionOf(first, 'applied-automatically');
  const back = actionsIn(applied).find(
    (a) => a.id === 'bring-back' && a.target.ruleId === network.id
  );
  assert.equal((await act(c, 'bring-back', back.target)).status, 'done');
  const after = await read(c);
  assert.equal(byPassage(after, 'Toute construction').status, 'to_confirm');
  assert.equal(byPassage(after, 'Une place').status, 'confirmed', 'only that one came back');
  assert.ok(!idsIn(sectionOf(after, 'applied-automatically')).includes(network.id));
  assert.equal(
    sectionOf(after, 'applies-no-drawing'),
    undefined,
    'looked at one by one, out of any group'
  );

  // A rule the user set aside is not applied.
  const decided = context({ rules: ALL });
  const view = await read(decided);
  const checked = byPassage(view, 'Dans la zone UCe');
  const dismiss = blocksOf(view)
    .filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions)
    .find((a) => a.id === 'not-applicable' && a.target.ruleId === checked.id);
  // An applied rule offers only « Bring back »: to set it aside the user first brings it back, then decides.
  assert.equal(dismiss, undefined);
  const bring = actionsIn(sectionOf(view, 'applied-automatically')).find(
    (a) => a.id === 'bring-back' && a.target.ruleId === checked.id
  );
  assert.equal((await act(decided, 'bring-back', bring.target)).status, 'done');
  const again = await read(decided);
  const na = blocksOf(again)
    .filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions)
    .find((a) => a.id === 'not-applicable' && a.target.ruleId === checked.id);
  assert.equal((await act(decided, 'not-applicable', na.target)).status, 'done');
  const final = await read(decided);
  assert.equal(byPassage(final, 'Dans la zone UCe').status, 'not_applicable');
  assert.ok(!idsIn(sectionOf(final, 'applied-automatically')).includes(checked.id));
});

test('002.46: « Bring all back » returns every applied rule to a person in one write; a list that changed since is « read again »', async () => {
  const c = context({ rules: ALL });
  const report = await read(c);
  const all = actionsIn(sectionOf(report, 'applied-automatically')).find(
    (a) => a.id === 'bring-back-all'
  );
  const writes = [];
  const original = c.data.service.write;
  c.data.service.write = (next, label, expected) => {
    writes.push(label);
    return original(next, label, expected);
  };
  assert.equal((await act(c, 'bring-back-all', all.target)).status, 'done');
  assert.deepEqual(writes, ['fr-urban-rules.undo.bringBackAll'], 'one write, one undo step');
  const after = await read(c);
  for (const start of ['Dans la zone UCe', 'Toute construction', 'Une place'])
    assert.equal(byPassage(after, start).status, 'to_confirm', start);
  assert.equal(sectionOf(after, 'applied-automatically'), undefined);

  // A click on a list that is no longer the one shown writes nothing.
  const stale = context({ rules: ALL });
  const shown = await read(stale);
  const staleAll = actionsIn(sectionOf(shown, 'applied-automatically')).find(
    (a) => a.id === 'bring-back-all'
  );
  const one = actionsIn(sectionOf(shown, 'applied-automatically')).find(
    (a) => a.id === 'bring-back'
  );
  await act(stale, 'bring-back', one.target);
  await read(stale); // the host reads the view again after an act: the old button is now stale
  const result = await act(stale, 'bring-back-all', staleAll.target);
  assert.notEqual(result.status, 'done');
});

test('002.46: a view with nothing to apply is what it was', async () => {
  const report = await read(context({ rules: [LOOSE] }));
  assert.equal(sectionOf(report, 'applied-automatically'), undefined);
  assert.equal(byPassage(report, 'Les façades').status, 'to_confirm');
});

const SCHEMA = 1;

test('002.46: the project can turn the application off and on again; off, the groups wait for a person as before', async () => {
  const c = context({ rules: ALL });
  const on = await read(c);
  const off = actionsIn(sectionOf(on, 'applied-automatically')).find(
    (a) => a.id === 'turn-auto-apply-off'
  );
  assert.ok(off, 'the switch is offered where the rules are listed');
  assert.equal((await act(c, 'turn-auto-apply-off', off.target)).status, 'done');
  assert.equal(c.data.held().autoApply, false);

  const after = await read(c);
  assert.equal(sectionOf(after, 'applied-automatically'), undefined);
  for (const start of ['Dans la zone UCe', 'Toute construction', 'Une place'])
    assert.equal(byPassage(after, start).status, 'to_confirm', start);
  assert.ok(sectionOf(after, 'checked-readings') !== undefined, 'the batches are back');
  assert.ok(sectionOf(after, 'applies-no-drawing') !== undefined);
  const notice = blocksOf(after).find(
    (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.auto.off.notice'
  );
  assert.ok(notice !== undefined, 'it says why nothing is applied');
  const turnOn = blocksOf(after)
    .filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions)
    .find((a) => a.id === 'turn-auto-apply-on');
  assert.ok(turnOn !== undefined);

  assert.equal((await act(c, 'turn-auto-apply-on', turnOn.target)).status, 'done');
  assert.equal('autoApply' in c.data.held(), false, 'on is the absence of the member');
  assert.equal(byPassage(await read(c), 'Toute construction').status, 'confirmed');
});

test('002.46: a switch stored in a shape this does not know makes the section read-only; a section that is off applies nothing', async () => {
  const odd = await read(context({ rules: ALL, section: { schema: SCHEMA, autoApply: 'maybe' } }));
  assert.ok(
    blocksOf(odd).some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.newerSection'
    )
  );
  const stored = await read(context({ rules: ALL, section: { schema: SCHEMA, autoApply: false } }));
  assert.equal(byPassage(stored, 'Toute construction').status, 'to_confirm');
});

test('002.46: the reading card counts the rules applied automatically, so what was read still adds up', () => {
  const card = (counts) =>
    readingCardOf({
      id: 'z',
      zone: 'UDa1',
      state: 'done',
      result: { rules: new Array(98), chunks: { failed: 0 } },
      counts
    });
  const keyOf = (c) => c.stats.map((st) => st.label.key.split('.').pop());
  assert.deepEqual(
    keyOf(card({ read: 98, auto: 26, left: 56, applied: 16, grouped: 0, project: 0, ask: 0 })),
    ['read', 'auto', 'applied', 'left']
  );
  const shown = card({ read: 98, auto: 26, left: 56, applied: 16, grouped: 0, project: 0, ask: 0 });
  assert.equal(shown.stats.find((st) => st.label.key.endsWith('.applied')).value, 16);
  // None applied: the card is what it was.
  assert.deepEqual(
    keyOf(card({ read: 98, auto: 26, left: 72, applied: 0, grouped: 0, project: 0, ask: 0 })),
    ['read', 'auto', 'left']
  );
  assert.deepEqual(keyOf(card({ read: 98, auto: 26, left: 72, grouped: 0, project: 0, ask: 0 })), [
    'read',
    'auto',
    'left'
  ]);
});
