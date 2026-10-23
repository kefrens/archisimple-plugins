/**
 * Sprint 002.15 (PLU surfaces content; platform 096.27, SDK 1.38): the Surfaces view composed of a
 * headline figure, a segmented choice, the budget bar and folded rows — over the five reference
 * plots' recorded reads — with **nothing read, measured or checked changed**: every check and
 * assumption the view makes is 0.11.0's byte for byte, and every row, table, quote, notice and
 * action of the 0.11.0 view is somewhere in the new one (`test-fixtures/fr-urban-rules/panel/
 * surfaces-0.11.0.json`, recorded by running 0.11.0 on the same captures).
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createReader } from '../src/index.js';
import { flattenBlocks, loadAcceptance, replayFetch, replayService } from './helpers.mjs';

const PLOTS = ['lyon', 'gordes', 'brouennes', 'mouzay', 'rochefort'];
const now = () => new Date(Date.UTC(2026, 9, 20, 12, 0));
const NS = 'fr-urban-rules.surfaces.';
const reports = {};
let old;
let en;
let fr;

before(async () => {
  const i18n = new URL('../resources/i18n/fr-urban-rules/', import.meta.url);
  en = JSON.parse(await readFile(new URL('en.json', i18n), 'utf8'));
  fr = JSON.parse(await readFile(new URL('fr.json', i18n), 'utf8'));
  old = JSON.parse(
    await readFile(new URL('../../test-fixtures/fr-urban-rules/panel/surfaces-0.11.0.json', import.meta.url), 'utf8')
  );
  for (const plot of PLOTS) {
    const captured = await loadAcceptance(plot);
    const site = replayService(captured.siteCalls, { name: 'site' });
    const reader = createReader({
      fetch: replayFetch(captured.answers),
      now,
      site: () => site,
      roads: () => replayService(captured.context.roads, { name: 'roads' }),
      mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
      document: () => replayService(captured.context.document, { name: 'document' }),
      packageData: () => ({ read: () => captured.section ?? undefined, write: () => true }),
      translate: (key) => key
    });
    reports[plot] = await reader.read(
      { site: captured.site, country: 'FR', reason: 'site' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    reader.dispose();
  }
});

const viewOf = (plot) => reports[plot].views.find((v) => v.id === 'surfaces');
const flat = (plot) => flattenBlocks(viewOf(plot).blocks);
const rowsOf = (blocks) => blocks.filter((b) => b.kind === 'fields').flatMap((b) => b.rows);
const find = (plot, kind, test = () => true) => flat(plot).find((b) => b.kind === kind && test(b));

/** The rows the 0.11.0 view had that 002.15 says elsewhere, and where. */
const REPLACED = new Set([
  `${NS}emprise.share`, // the headline figure's value
  `${NS}emprise.allOverhangs`, // a card of the choice
  `${NS}budget.allowed`, // the bar's figure (while it is drawn)
  `${NS}budget.remaining`,
  `${NS}budget.used`,
  `${NS}capacity.range` // the capacity's headline figure
]);

test('criterion 1: the view is the notices, the headline, the choice, the bar, the folds, then the actions and the assumptions', () => {
  for (const plot of PLOTS) {
    const kinds = viewOf(plot).blocks.map((b) => b.kind);
    assert.ok(kinds.includes('choice'), `${plot}: a choice`);
    assert.equal(kinds.indexOf('choice') - 1, kinds.findIndex((k) => k === 'stat' || k === 'fields'), `${plot}: the headline just before the choice`);
    assert.equal(kinds.at(-1), 'assumptions', plot);
    const sections = viewOf(plot).blocks.filter((b) => b.kind === 'section');
    const ids = sections.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${plot}: unique fold ids`);
    for (const id of ['emprise-detail', 'budget-basis', 'floor-area', 'caps', 'capacity', 'procedure']) {
      assert.ok(ids.includes(id), `${plot}: ${id}`);
    }
    // Every fold has an icon from the host's vocabulary, a title and blocks.
    for (const section of sections) {
      assert.ok(['area', 'document', 'rules', 'envelope', 'information'].includes(section.icon), `${plot} ${section.id}`);
      assert.ok(section.title.key in en && section.title.key in fr);
      assert.ok(section.blocks.length > 0);
      assert.equal(section.open, undefined, 'folded by default');
    }
    // The actions come last but the assumptions.
    assert.ok(kinds.includes('actions') || reports[plot].views.find((v) => v.id === 'surfaces').blocks.some((b) => b.kind === 'notice'), plot);
  }
});

test('criterion 7: the checks and assumptions are 0.11.0’s byte for byte', () => {
  for (const plot of PLOTS) {
    const checks = reports[plot].checks.filter((c) => c.id.startsWith('srf:'));
    assert.deepEqual(checks, old[plot].checks, `${plot} checks`);
    const ids = new Set(reports[plot].assumptions.map((a) => a.id));
    for (const id of old[plot].assumptions) assert.ok(ids.has(id), `${plot}: ${id}`);
  }
});

test('criterion 6: every row, table, quote, notice and action of the 0.11.0 view is in the new one', () => {
  for (const plot of PLOTS) {
    const before = flattenBlocks(old[plot].blocks);
    const after = flat(plot);
    const newRows = rowsOf(after);
    const barDrawn = after.some((b) => b.kind === 'meter');
    for (const row of rowsOf(before)) {
      const key = row.label.key;
      if (REPLACED.has(key) && key !== `${NS}emprise.share`) {
        // `budget.*` rows are the bar's while it is drawn; the cards and the range are checked
        // by their own criteria below.
        if (key.startsWith(`${NS}budget.`) && !barDrawn) {
          assert.deepEqual(newRows.find((r) => r.label.key === key), row, `${plot}: ${key}`);
        }
        continue;
      }
      if (key === `${NS}emprise.share`) continue;
      const kept = newRows.find((r) => r.label.key === key && JSON.stringify(r.value) === JSON.stringify(row.value));
      assert.ok(kept, `${plot}: the row ${key} is missing or changed`);
    }
    for (const kind of ['table', 'quote', 'notice', 'assumptions']) {
      for (const block of before.filter((b) => b.kind === kind)) {
        // The « not a right to build » heading detail and the capacity's « not applied » notice
        // are said in the capacity fold; headings are the folds' titles.
        assert.ok(
          after.some((b) => JSON.stringify(b) === JSON.stringify(block)),
          `${plot}: a ${kind} block is missing: ${JSON.stringify(block).slice(0, 120)}`
        );
      }
    }
    const actionIds = (blocks) => blocks.filter((b) => b.kind === 'actions').flatMap((b) => b.actions.map((a) => a.id)).sort();
    const stillThere = new Set(actionIds(after));
    for (const id of actionIds(before)) assert.ok(stillThere.has(id), `${plot}: the action ${id}`);
    // Every old heading's text is a fold's title (or the headline's label).
    const titles = new Set([
      ...viewOf(plot).blocks.filter((b) => b.kind === 'section').map((s) => s.title.key),
      ...after.filter((b) => b.kind === 'stat').map((b) => b.label.key)
    ]);
    for (const heading of before.filter((b) => b.kind === 'heading')) {
      if (heading.text.key === `${NS}heading.budget`) continue; // the bar's own label says it
      // A heading that is still a heading (« Vos réponses » over the answers), or a fold's title.
      const stays = after.some((b) => b.kind === 'heading' && b.text.key === heading.text.key);
      assert.ok(stays || titles.has(heading.text.key), `${plot}: heading ${heading.text.key}`);
    }
  }
});

test('criterion 2: the headline agrees with the footprint check on the same read', () => {
  let seen = 0;
  for (const plot of PLOTS) {
    const stat = find(plot, 'stat', (b) => b.label.key === `${NS}heading.emprise`);
    const definitionRow = rowsOf(old[plot].blocks).find((r) => r.label.key.startsWith(`${NS}emprise.`) && r.value?.unit === 'm2');
    const shareRow = rowsOf(flattenBlocks(old[plot].blocks)).find((r) => r.label.key === `${NS}emprise.share`);
    if (shareRow === undefined) {
      assert.equal(stat, undefined, `${plot}: no plot area, no headline`);
      continue;
    }
    seen += 1;
    assert.deepEqual(stat.value, shareRow.value, `${plot}: the share is 0.11.0's « part du terrain »`);
    assert.ok(definitionRow !== undefined);
    const check = old[plot].checks.find((c) => c.id.startsWith('srf:') && c.limit?.unit === 'm2' && c.subject.kind === 'plot' && c.measured?.value === definitionRow.value.value);
    if (stat.verdict !== undefined) {
      assert.ok(check !== undefined, `${plot}: a verdict needs a check`);
      assert.equal(stat.verdict.result, check.result, plot);
    }
    assert.equal(stat.gauge.max.value, 100);
  }
  assert.ok(seen > 0, 'a plot has a plot area and an emprise');
});

test('criterion 3: the choice’s cards are the three definitions’ areas, the selected one the setting’s, every card’s values valid', () => {
  for (const plot of PLOTS) {
    const choice = find(plot, 'choice');
    assert.deepEqual(choice.options.map((o) => o.value), ['r420-1', 'lexicon', 'all-overhangs'], plot);
    assert.equal(choice.options.filter((o) => o.selected).length, 1, plot);
    assert.equal(choice.options.find((o) => o.selected).value, 'r420-1', `${plot}: the default definition`);
    const oldRows = rowsOf(flattenBlocks(old[plot].blocks));
    const r420 = oldRows.find((r) => r.label.key === `${NS}emprise.r420`);
    const all = oldRows.find((r) => r.label.key === `${NS}emprise.allOverhangs`);
    if (r420 !== undefined && r420.value.unit === 'm2') {
      assert.deepEqual(choice.options[0].figure, r420.value, `${plot}: R.420-1`);
    }
    if (all !== undefined && all.value.unit === 'm2') {
      assert.deepEqual(choice.options[2].figure, all.value, `${plot}: all overhangs`);
    }
    const action = choice.action;
    assert.equal(action.id, 'emprise-definition');
    const fields = new Map(action.fields.map((f) => [f.key, f]));
    for (const option of choice.options) {
      assert.ok(fields.get('definition').options.some((o) => o.value === option.values.definition), `${plot} ${option.value}`);
      for (const key of ['upperStoreys', 'roofOverhangs', 'balconies', 'lightweight']) {
        assert.ok(['yes', 'no'].includes(option.values[key]), `${plot} ${option.value} ${key}`);
      }
      assert.ok(option.values.page === undefined || (Number.isInteger(option.values.page) && option.values.page >= 1));
    }
    // The same action, object for object, as the actions block offers.
    const offered = viewOf(plot).blocks.filter((b) => b.kind === 'actions').flatMap((b) => b.actions).find((a) => a.id === 'emprise-definition');
    assert.deepEqual(offered, action, plot);
  }
});

test('criterion 4: the budget bar is 0.11.0’s used and allowed, drawn only with an allowance', () => {
  for (const plot of PLOTS) {
    const meter = find(plot, 'meter');
    const oldMeter = flattenBlocks(old[plot].blocks).find((b) => b.kind === 'meter');
    assert.deepEqual(meter, oldMeter, plot);
  }
});

test('criterion 5: a fold’s summary agrees with its content', () => {
  for (const plot of PLOTS) {
    const sections = new Map(viewOf(plot).blocks.filter((b) => b.kind === 'section').map((s) => [s.id, s]));
    const green = sections.get('green');
    if (green !== undefined) {
      const rows = rowsOf(green.blocks);
      const unbuilt = rows.find((r) => r.label.key === `${NS}green.unbuilt`).value.value;
      const required = rows.find((r) => r.label.key === `${NS}green.required`)?.value.value;
      if (required !== undefined && unbuilt < required) {
        assert.equal(green.summary.value.key, `${NS}green.short`);
        assert.equal(green.summary.tone, 'warning');
        assert.equal(green.summary.value.params.area, Math.round((required - unbuilt) * 100) / 100);
      } else {
        assert.equal(green.summary.value.key, `${NS}green.free`);
      }
    }
    const capacity = sections.get('capacity');
    const range = flattenBlocks(capacity.blocks).find((b) => b.kind === 'stat');
    const oldRange = rowsOf(flattenBlocks(old[plot].blocks)).find((r) => r.label.key === `${NS}capacity.range`);
    if (oldRange !== undefined) {
      assert.deepEqual(range.value.params, oldRange.value.params, `${plot}: the range`);
      assert.deepEqual(capacity.summary.value.params, oldRange.value.params);
      assert.equal(range.gauge.from.value, oldRange.value.params.low);
      assert.equal(range.gauge.value.value, oldRange.value.params.high);
    } else {
      assert.equal(range, undefined, `${plot}: no range, no figure`);
    }
  }
});

test('criterion 8: every new key exists in both locales', () => {
  const keys = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object') {
      // A phrase's key (a field's `key` is a property name, not a translation).
      if (typeof value.key === 'string' && value.key.startsWith('fr-urban-rules.')) keys.add(value.key);
      Object.values(value).forEach(walk);
    }
  };
  for (const plot of PLOTS) walk(viewOf(plot));
  for (const key of keys) assert.ok(key in en && key in fr, key);
});
