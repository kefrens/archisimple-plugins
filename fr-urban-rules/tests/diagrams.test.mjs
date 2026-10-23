/**
 * Sprint 002.13 (PLU panel diagrams; platform 096.22, SDK 1.36): the plot view and the edge list
 * in Limites et reculs, the height section in Enveloppe, the figure on the lowest-ground
 * assumption — over the five reference plots' recorded reads (002.4's captures).
 *
 * The package places blocks and names one figure; the host draws. Nothing read, measured or
 * checked changes: 002.9's expected values and 002.12's digest test stay green beside these.
 * Criterion 4 is the FR half of the platform's 096.23 criteria 6 and 7.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createReader } from '../src/index.js';
import { loadAcceptance, replayFetch, replayService } from './helpers.mjs';

const PLOTS = ['lyon', 'gordes', 'brouennes', 'mouzay', 'rochefort'];
const now = () => new Date(Date.UTC(2026, 9, 20, 12, 0));
const reports = {};
let en;
let fr;

before(async () => {
  const i18n = new URL('../resources/i18n/fr-urban-rules/', import.meta.url);
  en = JSON.parse(await readFile(new URL('en.json', i18n), 'utf8'));
  fr = JSON.parse(await readFile(new URL('fr.json', i18n), 'utf8'));
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
      packageData: () => ({
        read: () => captured.section ?? undefined,
        write: () => {
          throw new Error('a read never writes');
        }
      }),
      translate: (key) => key
    });
    reports[plot] = await reader.read(
      { site: captured.site, country: 'FR', reason: 'site' },
      { signal: new AbortController().signal, progress: () => undefined }
    );
    reader.dispose();
  }
});

const view = (report, id) => report.views.find((v) => v.id === id);
const withBoundary = (plot) => (reports[plot].edges ?? []).length > 0;

test('criterion 1: on every recorded plot with a Site boundary the Edges view holds a plot-plan, an edges block and the Set role actions, and no table', () => {
  let seen = 0;
  for (const plot of PLOTS) {
    if (!withBoundary(plot)) continue;
    seen += 1;
    const blocks = view(reports[plot], 'edges').blocks;
    assert.deepEqual(blocks[0], { kind: 'plot-plan', categories: ['envelope'] }, plot);
    assert.deepEqual(blocks[1], { kind: 'edges' }, plot);
    assert.equal(blocks.some((b) => b.kind === 'table'), false, plot);
    const actions = blocks.find((b) => b.kind === 'actions');
    assert.ok(actions.actions.length > 0 && actions.actions.every((a) => a.id === 'set-edge-role'), plot);
  }
  assert.ok(seen >= 3, 'at least three of the five recorded plots have a Site boundary');
});

test('002.13 walk: Set role names the edge by the host’s letter, A for 1 and AA for 27', () => {
  const edges = view(reports.gordes, 'edges').blocks.find((b) => b.kind === 'actions');
  const labels = edges.actions.map((a) => a.label.params.edge);
  assert.deepEqual(labels.slice(0, 3), ['A', 'B', 'C']);
  assert.equal(labels[26], 'AA');
});

test('criterion 1: without a boundary the Edges view keeps its notice and draws no diagram', async () => {
  const captured = await loadAcceptance('lyon');
  const site = replayService(captured.siteCalls, { name: 'site' });
  const reader = createReader({
    fetch: replayFetch(captured.answers),
    now,
    site: () => site,
    roads: () => replayService(captured.context.roads, { name: 'roads' }),
    mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
    document: () => replayService(captured.context.document, { name: 'document' }),
    packageData: () => ({ read: () => undefined, write: () => undefined }),
    translate: (key) => key
  });
  const noBoundary = { ...captured.site, boundary: undefined };
  const report = await reader.read(
    { site: noBoundary, country: 'FR', reason: 'site' },
    { signal: new AbortController().signal, progress: () => undefined }
  );
  reader.dispose();
  const edges = view(report, 'edges');
  if (edges !== undefined) {
    assert.equal(edges.blocks.some((b) => b.kind === 'plot-plan' || b.kind === 'edges'), false);
  }
});

test('criterion 2: the Envelope view holds a height-section naming exactly the measured height checks of a building, after its notices', () => {
  let seen = 0;
  for (const plot of PLOTS) {
    const report = reports[plot];
    const envelope = view(report, 'envelope');
    const heightRules = new Set(
      report.rules.filter((r) => r.kind === 'height_total' || r.kind === 'height_facade').map((r) => r.id)
    );
    const heightChecks = report.checks
      .filter((c) => heightRules.has(c.ruleId) && c.subject.kind === 'building' && c.measured !== undefined)
      .map((c) => c.id);
    const sections = (envelope?.blocks ?? []).filter((b) => b.kind === 'height-section');
    if (heightChecks.length === 0) {
      assert.equal(sections.length, 0, plot);
      continue;
    }
    seen += 1;
    assert.equal(sections.length, 1, plot);
    assert.deepEqual(sections[0].checkIds, heightChecks, plot);
    assert.deepEqual(sections[0].caption, { key: 'fr-urban-rules.envelope.section' }, plot);
    // After the leading notices, before anything else.
    const at = envelope.blocks.indexOf(sections[0]);
    assert.ok(envelope.blocks.slice(0, at).every((b) => b.kind === 'notice'), plot);
  }
  assert.ok(seen >= 1, 'at least one recorded plot measures a height');
});

test('criterion 3: height-lowest-ground carries the figure, and no other assumption has one', () => {
  let seen = 0;
  for (const plot of PLOTS) {
    for (const assumption of reports[plot].assumptions) {
      if (assumption.id === 'height-lowest-ground') {
        seen += 1;
        assert.equal(assumption.figure, 'height-from-lowest-ground', plot);
      } else {
        assert.equal(assumption.figure, undefined, `${plot} ${assumption.id}`);
      }
    }
  }
  assert.ok(seen >= 1);
});

test('criterion 4 / DEC-4: every assumption has a title of at most 80 characters and a detail (002.12), in both locales', () => {
  for (const plot of PLOTS) {
    for (const assumption of reports[plot].assumptions) {
      const key = assumption.text?.key;
      if (typeof key !== 'string' || !key.startsWith('fr-urban-rules.assumption.')) continue;
      for (const [name, catalogue] of [['en', en], ['fr', fr]]) {
        assert.ok(catalogue[key]?.length <= 80, `${plot} ${name} ${key}`);
        assert.equal(typeof catalogue[`${key}.detail`], 'string', `${plot} ${name} ${key}.detail`);
      }
    }
  }
});

test('criterion 4 / DEC-4: every boundary-edge check with a measure has the dimension the plot view draws, between two finite points', () => {
  let seen = 0;
  for (const plot of PLOTS) {
    for (const check of reports[plot].checks) {
      if (check.subject.kind !== 'boundary-edge' || check.measured === undefined) continue;
      seen += 1;
      const dimension = check.figure?.dimension;
      assert.ok(dimension !== undefined, `${plot} ${check.id}`);
      for (const point of [dimension.from, dimension.to]) {
        assert.ok(Number.isFinite(point.easting) && Number.isFinite(point.northing), `${plot} ${check.id}`);
      }
      assert.match(check.subject.id, /^[1-9]\d*$/, `${plot} ${check.id}`);
    }
  }
  assert.ok(seen >= 1, 'at least one recorded plot measures an edge');
});

test('criterion 4 / DEC-4: each view’s icon and group are 002.12’s, and every edge number a check names is an edge of the report', () => {
  for (const plot of PLOTS) {
    const report = reports[plot];
    const edgeNumbers = new Set(report.edges.map((e) => e.edge));
    for (const check of report.checks) {
      if (check.subject.kind === 'boundary-edge') {
        assert.ok(edgeNumbers.has(Number(check.subject.id)), `${plot} ${check.id}`);
      }
    }
    const edges = view(report, 'edges');
    if (edges !== undefined) assert.deepEqual([edges.icon, edges.group], ['boundary', 'project'], plot);
    const envelope = view(report, 'envelope');
    if (envelope !== undefined) assert.deepEqual([envelope.icon, envelope.group], ['envelope', 'project'], plot);
  }
});

test('the words the new blocks use are in both catalogues', () => {
  assert.equal(en['fr-urban-rules.envelope.section'], 'Envelope in section');
  assert.equal(fr['fr-urban-rules.envelope.section'], 'Enveloppe en coupe');
  // The table's columns and the "why" keys went with the table: the host's edge list says it.
  for (const catalogue of [en, fr]) {
    assert.equal(Object.keys(catalogue).some((k) => k.startsWith('fr-urban-rules.edges.why.')), false);
    assert.equal(catalogue['fr-urban-rules.edges.column.length'], undefined);
  }
});
