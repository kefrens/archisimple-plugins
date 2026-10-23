/**
 * Sprint 002.12 (PLU panel content; platform 096.19–096.21): the report as the redesigned panel
 * reads it, over the five reference plots' recorded reads (002.4's captures).
 *
 * Presentation only: the views in the boards' order with an icon and a group, a Document view,
 * the commune as `locality`, summaries where the host derives none, the overview reduced to its
 * notices, the flags in Risks, an assumption's detail. **Nothing read, measured or checked
 * changes** — the digests of 0.9.0's rules, checks, features, edges, flags, zones, document and
 * sources are the fixture's (`test-fixtures/fr-urban-rules/panel/overview-0.9.0.json`, recorded
 * by running 0.9.0 on the same captures).
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { createReader } from '../src/index.js';
import { loadAcceptance, replayFetch, replayService } from './helpers.mjs';

const PLOTS = ['lyon', 'gordes', 'brouennes', 'mouzay', 'rochefort'];
const COMMUNES = {
  lyon: 'Lyon',
  gordes: 'Gordes',
  brouennes: 'Brouennes',
  mouzay: 'Mouzay',
  rochefort: 'Rochefort-en-Terre'
};
const ORDER = [
  'document',
  'zone',
  'sector',
  'prescriptions',
  'information',
  'easements',
  'risks',
  'checks',
  'rules',
  'edges',
  'envelope',
  'surfaces'
];
const SHAPE = {
  document: ['document', 'site'],
  zone: ['zone', 'site'],
  sector: ['zone', 'site'],
  prescriptions: ['prescription', 'site'],
  information: ['information', 'site'],
  easements: ['easement', 'site'],
  risks: ['risk', 'site'],
  checks: ['checks', 'project'],
  rules: ['rules', 'project'],
  edges: ['boundary', 'project'],
  envelope: ['envelope', 'project'],
  surfaces: ['area', 'project']
};
/** The host's closed vocabularies (SDK 1.34). */
const ICONS = new Set([
  'document',
  'zone',
  'prescription',
  'information',
  'easement',
  'risk',
  'checks',
  'rules',
  'boundary',
  'envelope',
  'area',
  'other'
]);

const now = () => new Date(Date.UTC(2026, 9, 20, 12, 0));
const captures = {};
const reports = {};
let before090;
let en;
let fr;
const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(value ?? null))
    .digest('hex');

before(async () => {
  const i18n = new URL('../resources/i18n/fr-urban-rules/', import.meta.url);
  en = JSON.parse(await readFile(new URL('en.json', i18n), 'utf8'));
  fr = JSON.parse(await readFile(new URL('fr.json', i18n), 'utf8'));
  before090 = JSON.parse(
    await readFile(
      new URL('../../test-fixtures/fr-urban-rules/panel/overview-0.9.0.json', import.meta.url),
      'utf8'
    )
  );
  for (const plot of PLOTS) {
    const captured = await loadAcceptance(plot);
    captures[plot] = captured;
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
    const progress = [];
    reports[plot] = {
      report: await reader.read(
        { site: captured.site, country: 'FR', reason: 'site' },
        { signal: new AbortController().signal, progress: (r) => progress.push(r) }
      ),
      progress
    };
    reader.dispose();
  }
});

/** A flag as 0.9.0 sent it: 002.14's five presentation fields taken off. */
const withoutPresentation = (flag) => {
  const { icon, group, title, code, level, ...rest } = flag;
  return rest;
};

const view = (report, id) => report.views.find((v) => v.id === id);

test('criterion 1: the five reports’ views come in the boards’ order with their icons and groups', () => {
  for (const plot of PLOTS) {
    const { report } = reports[plot];
    const ids = report.views.map((v) => v.id);
    assert.equal(ids[0], 'document', plot);
    // A subsequence of the boards' order, in it: a view the regime lacks is absent, nothing re-sorted.
    assert.deepEqual(
      ids,
      ORDER.filter((id) => ids.includes(id)),
      plot
    );
    for (const v of report.views) {
      assert.deepEqual([v.icon, v.group], SHAPE[v.id], `${plot} ${v.id}`);
      assert.ok(ICONS.has(v.icon), `${plot} ${v.id}: ${v.icon} is not the host's word`);
    }
    // Two groups, the site's views first.
    const groups = report.views.map((v) => v.group);
    assert.deepEqual(groups, [...groups].sort((a, b) => (a === b ? 0 : a === 'site' ? -1 : 1)), plot);
  }
  // The regime decides which views exist: a PLU has them all, the RNU none of the plan's.
  assert.deepEqual(
    reports.lyon.report.views.map((v) => v.id),
    [...ORDER.filter((id) => id !== 'sector')]
  );
  assert.ok(view(reports.mouzay.report, 'sector') !== undefined);
  assert.equal(view(reports.brouennes.report, 'zone'), undefined);
});

test('criterion 1 (progress): a partial report has the same shape', () => {
  for (const plot of PLOTS) {
    for (const partial of reports[plot].progress) {
      assert.equal(partial.views[0]?.id, 'document', plot);
      assert.ok(partial.views.every((v) => ICONS.has(v.icon)), plot);
    }
  }
});

test('criterion 2: every block of 0.9.0’s overview is in the report — the notices, the Document view, Risks — except sources and assumptions', () => {
  for (const plot of PLOTS) {
    const { report } = reports[plot];
    const was = before090[plot].overview;
    const now = [
      ...report.overview,
      ...view(report, 'document').blocks,
      ...(view(report, 'risks')?.blocks ?? [])
    ];
    for (const block of was) {
      if (block.kind === 'sources' || block.kind === 'assumptions') continue;
      assert.ok(
        now.some((candidate) => JSON.stringify(candidate) === JSON.stringify(block)),
        `${plot}: a ${block.kind} block of the 0.9.0 overview is lost`
      );
    }
    // And the overview is notices only; sources and assumptions are not in it.
    assert.ok(report.overview.every((b) => b.kind === 'notice'), plot);
    assert.ok(!report.overview.some((b) => b.kind === 'sources' || b.kind === 'assumptions'), plot);
  }
});

test('criterion 2: the flags are in Risks, once — first, with the readings that listed them folded beneath (002.14)', () => {
  for (const plot of PLOTS) {
    const { report } = reports[plot];
    const risks = view(report, 'risks');
    const at = risks.blocks.map((b) => b.kind);
    assert.equal(at.filter((kind) => kind === 'flags').length, report.flags.length > 0 ? 1 : 0, plot);
    if (report.flags.length > 0) {
      // 0.11.0 put the flags after the first block (the readings' rows); 0.12.0 puts them first and
      // folds those rows into « Relevés des services », so the tiles lead and nothing is dropped.
      assert.equal(at[0], 'flags', plot);
      const readings = risks.blocks.find((b) => b.kind === 'section');
      assert.equal(readings.id, 'risk-readings', plot);
      assert.deepEqual(readings.blocks.map((b) => b.kind), ['fields'], plot);
      assert.ok(readings.title.key in en && readings.title.key in fr);
    }
  }
});

test('criterion 2: the Document view holds the fields, the link and its notices', () => {
  const lyon = view(reports.lyon.report, 'document');
  assert.deepEqual(lyon.blocks.map((b) => b.kind), ['fields', 'link', 'notice']);
  // Under the RNU (no document at all) it holds the regime row.
  const rnu = view(reports.brouennes.report, 'document');
  assert.deepEqual(rnu.blocks.map((b) => b.kind), ['fields']);
  assert.equal(rnu.blocks[0].rows[0].label.key, 'fr-urban-rules.field.regime');
  // The overview keeps the notices the host draws under its status line.
  assert.ok(
    reports.rochefort.report.overview.length > 0 &&
      reports.rochefort.report.overview.every((b) => b.kind === 'notice')
  );
});

test('criterion 3: no view showing checks or rules carries a summary', () => {
  for (const plot of PLOTS) {
    for (const v of reports[plot].report.views) {
      if (v.blocks.some((b) => b.kind === 'checks' || b.kind === 'rules')) {
        assert.equal(v.summary, undefined, `${plot} ${v.id}`);
      }
    }
  }
});

test('criterion 3: the other summaries — the document’s date, the zones, the counts, the strongest risk, the edges, the envelope, the footprint', () => {
  const lyon = reports.lyon.report;
  const text = (v) => v.summary?.value;
  assert.deepEqual(text(view(lyon, 'document')).key, 'fr-urban-rules.summary.date');
  // A day as a timestamp: the host formats it in the reader's locale (`{date, date, medium}`).
  assert.equal(new Date(text(view(lyon, 'document')).params.date).getFullYear(), 2026);
  assert.equal(en['fr-urban-rules.summary.date'], '{date, date, medium}');
  assert.deepEqual(text(view(lyon, 'zone')), { text: 'UCe1b', lang: 'fr' });
  // A count is the badge's own: never a number the host would derive from the report's rules.
  assert.deepEqual(text(view(lyon, 'prescriptions')), view(lyon, 'prescriptions').badge.value);
  assert.deepEqual(text(view(lyon, 'easements')), view(lyon, 'easements').badge.value);
  assert.equal(text(view(lyon, 'information')).key, 'fr-urban-rules.badge.count');
  assert.equal(text(view(lyon, 'edges')).key, 'fr-urban-rules.summary.edges');
  assert.equal(text(view(lyon, 'edges')).params.count, lyon.edges.length);
  // The envelope: the lowest height ceiling, a quantity the host writes in the project's unit.
  const heights = lyon.features
    .filter((f) => f.category === 'envelope')
    .flatMap((f) => f.volume?.ceilings ?? [])
    .filter((c) => c.kind === 'height')
    .map((c) => c.metres);
  if (heights.length > 0) {
    assert.deepEqual(text(view(lyon, 'envelope')), { value: Math.min(...heights), unit: 'm' });
  }
  const surfaces = text(view(lyon, 'surfaces'));
  if (surfaces !== undefined) {
    assert.equal(surfaces.key, 'fr-urban-rules.summary.footprint');
    assert.match(surfaces.params.percent, /^\d+$/);
  }
  // Every summary key is shipped, in both locales.
  for (const plot of PLOTS) {
    for (const v of reports[plot].report.views) {
      const key = v.summary?.value?.key;
      if (key !== undefined) {
        assert.ok(key in en && key in fr, `${plot} ${v.id}: ${key}`);
      }
    }
  }
});

test('criterion 3: the risks summary names the strongest risk read — clay, else seismic, else radon — and none when none is read', () => {
  const summaries = PLOTS.map((plot) => [plot, view(reports[plot].report, 'risks').summary]);
  for (const [plot, summary] of summaries) {
    if (summary === undefined) continue;
    assert.match(
      summary.value.key,
      /^fr-urban-rules\.summary\.(clay\.[123]|seismic|radon)$/,
      plot
    );
    assert.ok(summary.tone === undefined || summary.tone === 'warning', plot);
  }
  assert.ok(summaries.some(([, summary]) => summary !== undefined), 'at least one plot reads a risk');
});

test('criterion 4: the report’s locality is the commune’s name', () => {
  for (const plot of PLOTS) {
    assert.deepEqual(reports[plot].report.locality, { text: COMMUNES[plot], lang: 'fr' }, plot);
  }
});

test('criterion 6: what is read, measured and checked is byte-identical to 0.9.0’s', () => {
  for (const plot of PLOTS) {
    const { report } = reports[plot];
    for (const key of ['rules', 'checks', 'features', 'edges', 'flags', 'zones', 'document', 'sources']) {
      // 002.14 (SDK 1.37) adds presentation to a flag — icon, group, title, code, level — and
      // nothing else: without those five fields a flag is 0.9.0's byte for byte.
      const value = key === 'flags' ? report.flags.map(withoutPresentation) : report[key];
      assert.equal(digest(value), before090[plot].digests[key], `${plot}.${key}`);
    }
    // The assumptions keep their ids and their keys; each gains a detail by the key's own `.detail`.
    assert.deepEqual(report.assumptions.map((a) => a.id), before090[plot].assumptionIds, plot);
    assert.deepEqual(report.assumptions.map((a) => a.text), before090[plot].assumptionTexts, plot);
    for (const assumption of report.assumptions) {
      // The 57 assumptions of the package's own namespace have a title and a detail; the
      // reasons a check was not made (`fr-urban-rules.reason.*`) are short already and stay as they were.
      if (!assumption.text.key?.startsWith(['fr-urban-rules', 'assumption', ''].join('.'))) {
        assert.equal(assumption.detail, undefined, `${plot} ${assumption.id}`);
        continue;
      }
      assert.equal(assumption.detail.key, `${assumption.text.key}.detail`, `${plot} ${assumption.id}`);
      assert.ok(assumption.detail.key in en && assumption.detail.key in fr, assumption.detail.key);
      assert.deepEqual(assumption.detail.params, assumption.text.params);
    }
  }
});

test('criterion 6: shaping is presentation only and idempotent', () => {
  for (const plot of PLOTS) {
    const { report } = reports[plot];
    // The host's views are the same views' blocks as the unshaped read's, whatever the order.
    assert.equal(
      report.views.reduce((sum, v) => sum + v.blocks.length, 0) >= 7,
      true,
      plot
    );
  }
});

test('002.12 DEC-6: no rule shape here bounds a measure on both sides, so no check carries `allowed`', () => {
  for (const plot of PLOTS) {
    for (const check of reports[plot].report.checks) {
      assert.equal(check.allowed, undefined, `${plot} ${check.id}`);
    }
  }
});
