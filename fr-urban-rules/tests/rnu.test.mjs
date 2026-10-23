/**
 * The RNU rules, the Site boundary's edges and the R.111-17 checks (Sprint
 * 002.1a). No network: the planning answers are 002.0's recordings, the roads
 * carte-gouv-fr's own answers recorded by `scripts/capture-roads.mjs`, the
 * measures the platform's own `getBuildingDistances` recorded by
 * `scripts/capture-measures.mjs`, and the law the record of step 1.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, createReader } from '../src/index.js';
import {
  FIXTURES,
  PLOTS,
  loadAcceptance,
  loadPlot,
  recordedFetch,
  recordedSiteService,
  replayFetch,
  replayService,
  requestFor
} from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const json = async (path) => JSON.parse(await readFile(new URL(path, FIXTURES), 'utf8'));
const plots = {};
let law;
let roads;
const measures = {};
before(async () => {
  for (const plot of ['brouennes', 'mouzay']) plots[plot] = await loadPlot(plot);
  law = await json('legi-articles.json');
  roads = {
    brouennes: await json('brouennes/roads.json'),
    mouzay: await json('mouzay/roads.json')
  };
  for (const name of ['pitched', 'pitched-overhangs', 'no-terrain', 'datum-derived']) {
    measures[name] = await json(`measures/${name}.json`);
  }
});

const signal = () => new AbortController().signal;
const p = (easting, northing) => ({ easting, northing });
/** A counter-clockwise rectangle: edge 1 south, 2 east, 3 north, 4 west. */
const rectangle = (x0, y0, x1, y1) => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
const road = (line, extra = {}) => ({
  id: `r${line[0].easting}`,
  line,
  kind: 'road',
  level: 'ground',
  widthMetres: 6,
  name: 'Rue du Test',
  attribution: '© IGN — BD TOPO',
  ...extra
});

/**
 * The platform's recorded `measures.distances` answer, replayed for the asked
 * targets by edge number (the recording asked edges 1–4): its targets and each
 * façade run's targets picked in the asked order. `edit` may change the answer
 * for one case.
 */
function replay(recorded, { edit, refuse } = {}) {
  const asked = [];
  const others = [];
  return {
    asked,
    others,
    projection: () => recorded.projection,
    distances: (input) => {
      // 002.1a's tests read the R.111-17 asks; 002.1b's line and building asks are kept apart.
      if (input.targets.every((t) => t.kind === 'boundary-edge')) asked.push(input);
      else others.push(input);
      if (refuse?.[input.outline] !== undefined)
        return { available: false, reason: refuse[input.outline] };
      const answer = structuredClone(recorded.answer);
      if (!answer.available) return answer;
      const index = (edge) => recorded.query.targets.findIndex((t) => t.edge === edge);
      const picked = {
        ...answer,
        targets: input.targets.map((t) =>
          t.kind === 'boundary-edge'
            ? answer.targets[index(t.edge)]
            : { target: t, unavailable: 'no-outline' }
        ),
        facades: answer.facades.map((run) => ({
          ...run,
          targets: input.targets.map((t) =>
            t.kind === 'boundary-edge' ? run.targets[index(t.edge)] : undefined
          )
        }))
      };
      return edit === undefined ? picked : edit(picked, input);
    }
  };
}

/**
 * A reader over Brouennes' recorded planning answers (an `rnu` report), with
 * a Site boundary, roads, measures and a package-data section of the test's.
 */
function rnuReader({
  boundary,
  roadAnswer = [],
  measured,
  section,
  write,
  buildings = [],
  plot = 'brouennes',
  features = {},
  siteExtra = {},
  overrides = {},
  scaled = false
} = {}) {
  const { site: recordedSite, conversions, answers } = plots[plot];
  const site = {
    ...(boundary === undefined ? recordedSite : { ...recordedSite, boundary: { ring: boundary } }),
    ...siteExtra
  };
  const recorded = recordedSiteService(
    site,
    conversions,
    measured === undefined ? {} : { measures: measured }
  );
  // `scaled`: a plain scale for synthetic geometry only (an EL7 line drawn by the test).
  const service = scaled
    ? {
        ...recorded,
        toGeographicRing: (ring) =>
          ring.map((q) => ({ longitude: q.easting / 1e5, latitude: q.northing / 1e5 })),
        fromGeographicRing: (ring) =>
          ring.map((q) => ({ easting: q.longitude * 1e5, northing: q.latitude * 1e5 }))
      }
    : recorded;
  const writes = [];
  let held = section;
  const data = {
    read: () => (held === undefined ? undefined : structuredClone(held)),
    write: (next, label, expected) => {
      writes.push({ next, label, expected });
      if (write !== undefined) return write(next, label, expected);
      held = structuredClone(next);
      return true;
    }
  };
  const queried = [];
  const featureQueries = [];
  const reader = createReader({
    fetch: recordedFetch(answers, overrides).fetch,
    mapFeatures: () => ({
      queryFeatures: async (kind, query) => {
        featureQueries.push({ kind, query });
        const answer = features[kind] ?? [];
        if (answer instanceof Error) throw answer;
        return answer;
      }
    }),
    site: () => service,
    roads: () => ({
      queryRoads: async (query) => {
        queried.push(query);
        if (roadAnswer instanceof Error) throw roadAnswer;
        return roadAnswer;
      }
    }),
    packageData: () => data,
    document: () => ({ find: (type) => (type === 'Building' ? buildings : []) }),
    translate: (key) =>
      key === 'fr-urban-rules.undo.edgeRole' ? 'Set Site boundary edge role' : undefined
  });
  return { reader, site, writes, queried, featureQueries, data, held: () => held };
}

const read = (context, reason = 'site') =>
  context.reader.read(requestFor(context.site, reason), { signal: signal() });
const roleBy = (report) => Object.fromEntries(report.edges.map((e) => [e.edge, e.role]));
const view = (report, id) => report.views.find((v) => v.id === id);
/** The R.111-17 check governed by `edge` (002.4 Q5: one per building, the worst edge governs). */
const check = (report, edge) =>
  report.checks.find((c) => c.ruleId === 'rnu:R.111-17' && c.subject.id === String(edge));
/** A building's one R.111-17 check, whichever edge governs it (002.4 Q5). */
const r17Of = (report, building = 'building-main') =>
  report.checks.find((c) => c.id === `r111-17:${building}`);
/** Edge → distance as a folded check shows it: its own figure, and its label's other edges. */
function edgeDistances(folded) {
  const out = new Map([[Number(folded.subject.id), folded.measured?.value]]);
  for (const [, edge, value] of String(folded.subject.label.params?.others ?? '').matchAll(
    /(\d+) \(([\d.]+|—)/g
  )) {
    out.set(Number(edge), value === '—' ? undefined : Number(value));
  }
  return out;
}

// ── Criterion 1: the law, verified, in each rule ────────────────────────────────

test('criterion 1: each coded rule cites the verified LEGIARTI version, its date and its text', async () => {
  const report = await read(rnuReader());
  const byArticle = Object.fromEntries(report.rules.map((r) => [r.citation.article, r]));
  for (const article of ['R.111-15', 'R.111-16', 'R.111-17', 'R.111-28', 'L.111-3']) {
    const recorded = law.articles[article];
    const rule = byArticle[article];
    assert.ok(rule, article);
    assert.equal(
      rule.citation.href,
      `https://www.legifrance.gouv.fr/codes/article_lc/${recorded.legiarti}`
    );
    assert.equal(rule.citation.passage.text, recorded.text, `${article}: the text verbatim`);
    assert.equal(recorded.etat, 'VIGUEUR');
    assert.equal(__testing.ARTICLES[article].versionFrom, recorded.versionFrom);
    const [year, month, day] = recorded.versionFrom.split('-').map(Number);
    assert.match(
      rule.citation.document.text,
      new RegExp(`${day === 1 ? '1er' : day} \\S+ ${year}$`)
    );
    assert.match(
      rule.citation.document.text,
      /^Code de l’urbanisme, version en vigueur depuis le /
    );
    void month;
  }
  // R.111-18/19 and L.111-4 travel as exceptions, verbatim.
  for (const article of ['R.111-18', 'R.111-19', 'L.111-4', 'L.161-4', 'R.111-1']) {
    assert.equal(__testing.ARTICLES[article].text, law.articles[article].text, article);
    assert.equal(__testing.ARTICLES[article].legiarti, law.articles[article].legiarti, article);
  }
});

test('step 1 confirms the readings DEC-1 asked about', () => {
  const t = (a) => law.articles[a].text;
  assert.match(t('R.111-16'), /alignement opposé/);
  assert.match(t('R.111-16'), /différence d'altitude entre ces deux points/);
  assert.match(t('R.111-16'), /la limite de ce retrait se substitue à l'alignement/);
  assert.match(t('R.111-16'), /voies privées/);
  assert.match(
    t('R.111-17'),
    /A moins que le bâtiment à construire ne jouxte la limite parcellaire/
  );
  assert.match(t('R.111-17'), /moitié de la différence d'altitude/);
  assert.match(t('R.111-17'), /sans pouvoir être inférieure à trois mètres/);
  assert.match(t('R.111-15'), /peut être imposée/);
  assert.match(
    t('R.111-1'),
    /R\. 111-5 à R\. 111-19 et R\. 111-28 à R\. 111-30 ne sont pas applicables dans les territoires dotés d'un plan local d'urbanisme/
  );
  assert.match(
    t('L.111-3'),
    /de plan local d'urbanisme, de tout document d'urbanisme en tenant lieu ou de carte communale/
  );
  assert.match(t('R.111-28'), /hauteur moyenne des constructions avoisinantes/);
});

// ── Criterion 2: the coded rules ────────────────────────────────────────────────

const RULE_KINDS = [
  'road_setback',
  'boundary_setback',
  'building_distance',
  'footprint_ratio',
  'floor_area_max',
  'extension_max',
  'annex_max',
  'height_total',
  'height_facade',
  'green_ratio',
  'parking',
  'other'
];
const STATUSES = ['confirmed', 'to_confirm', 'not_applicable', 'not_evaluable', 'information'];

/** A mirror of the host's rule check (platform `regulation-source-registry.ts`, `rule`). */
function hostKeepsRule(rule) {
  const phrase = (v, cap = 2000) =>
    v !== null &&
    typeof v === 'object' &&
    ((typeof v.key === 'string' && v.key !== '' && v.key.length <= 2000) ||
      (typeof v.text === 'string' && v.text.length <= cap));
  if (typeof rule.id !== 'string' || rule.id === '' || !RULE_KINDS.includes(rule.kind))
    return 'id/kind';
  if (!phrase(rule.label) || rule.provenance !== 'coded' || !STATUSES.includes(rule.status))
    return 'label/provenance/status';
  const statement = rule.statement;
  if (
    statement !== undefined &&
    !['limit', 'not_regulated', 'see_graphic', 'described'].includes(statement)
  )
    return 'statement';
  if ((statement === 'not_regulated' || statement === 'see_graphic') && rule.limit !== undefined)
    return 'limit with no-number statement';
  if (statement === 'described' && rule.limit?.kind !== 'described')
    return 'described without described limit';
  const limit = rule.limit;
  if (limit !== undefined) {
    const q = (x) =>
      x !== undefined && Number.isFinite(x.value) && ['m', 'm2', 'percent'].includes(x.unit);
    if (limit.kind === 'value' && !(['min', 'max'].includes(limit.comparison) && q(limit.quantity)))
      return 'value limit';
    if (
      limit.kind === 'height_relative' &&
      (!Number.isFinite(limit.factor) || (limit.minimum !== undefined && !q(limit.minimum)))
    )
      return 'height_relative';
    if (limit.kind === 'described' && !phrase(limit.text, 10_000)) return 'described limit';
  }
  if (rule.definition !== undefined && !phrase(rule.definition, 10_000)) return 'definition';
  for (const list of [rule.conditions, rule.exceptions]) {
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > 50 || !list.every((x) => phrase(x, 10_000)))
      return 'qualifiers';
  }
  const c = rule.citation;
  if (c !== undefined) {
    if (c.document !== undefined && !phrase(c.document)) return 'citation.document';
    if (c.passage !== undefined && !phrase(c.passage, 10_000)) return 'citation.passage';
    if (c.href !== undefined && !/^https:\/\//.test(c.href)) return 'citation.href';
    if (c.article !== undefined && (typeof c.article !== 'string' || c.article.length > 2000))
      return 'citation.article';
  }
  return true;
}

test('criterion 2: an rnu report holds exactly the six rules, with R.111-18/19 only as exceptions', async () => {
  const report = await read(rnuReader());
  assert.equal(report.regime.code, 'rnu');
  const summary = Object.fromEntries(
    report.rules.map((r) => [r.id, [r.status, r.statement ?? 'limit']])
  );
  assert.deepEqual(summary, {
    'rnu:R.111-15': ['to_confirm', 'limit'],
    'rnu:R.111-16': ['confirmed', 'limit'],
    'rnu:R.111-17': ['confirmed', 'limit'],
    'rnu:R.111-28': ['information', 'described'],
    'rnu:L.111-3': ['not_evaluable', 'described'],
    'rnu:other': ['not_evaluable', 'described']
  });
  const r17 = report.rules.find((r) => r.id === 'rnu:R.111-17');
  assert.deepEqual(r17.limit, {
    kind: 'height_relative',
    factor: 0.5,
    minimum: { value: 3, unit: 'm' }
  });
  assert.deepEqual(report.rules.find((r) => r.id === 'rnu:R.111-15').limit, {
    kind: 'value',
    comparison: 'min',
    quantity: { value: 3, unit: 'm' }
  });
  assert.equal(
    report.rules.some((r) => /R\.111-1[89]/.test(r.id)),
    false
  );
  assert.match(r17.exceptions[0].text, /^R\.111-18 — /);
  assert.match(r17.exceptions[1].text, /^R\.111-19 — /);
  assert.match(
    report.rules.find((r) => r.id === 'rnu:L.111-3').exceptions[0].text,
    /^L\.111-4 — Peuvent toutefois/
  );
  for (const rule of report.rules) assert.equal(hostKeepsRule(rule), true, rule.id);
});

test('criterion 2: a carte communale in a constructible sector holds the same rules minus L.111-3', async () => {
  const report = await read(rnuReader({ plot: 'mouzay' }));
  assert.equal(report.regime.code, 'cc');
  assert.deepEqual(
    report.rules.map((r) => r.id),
    ['rnu:R.111-15', 'rnu:R.111-16', 'rnu:R.111-17', 'rnu:R.111-28', 'rnu:other']
  );
  assert.equal(
    report.flags.some((f) => f.kind === 'cc-restricted'),
    false
  );
});

test('DEC-2: a non-constructible carte communale sector keeps the rules and flags L.161-4', async () => {
  const { site, conversions, answers } = plots.mouzay;
  const sectors = structuredClone(answers.get('apicarto-secteur-cc').body);
  sectors.features[0].properties.typesect = '03';
  const fetched = recordedFetch(answers, {
    'apicarto-secteur-cc': async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(sectors)
    })
  });
  const reader = createReader({
    fetch: fetched.fetch,
    site: () => recordedSiteService(site, conversions)
  });
  const report = await reader.read(requestFor(site), { signal: signal() });
  const flag = report.flags.find((f) => f.kind === 'cc-restricted');
  assert.ok(flag);
  assert.equal(flag.citation.article, 'L.161-4');
  assert.equal(flag.citation.passage.text, law.articles['L.161-4'].text);
  assert.equal(report.rules.length, 5);
});

test('a PLU or not-published report gets no coded rule', async () => {
  for (const plot of ['lyon', 'rochefort']) {
    const { site, conversions, answers } = await loadPlot(plot);
    const reader = createReader({
      fetch: recordedFetch(answers).fetch,
      site: () => recordedSiteService(site, conversions)
    });
    const report = await reader.read(requestFor(site), { signal: signal() });
    assert.equal(
      report.rules.some((r) => r.provenance === 'coded'),
      false,
      plot
    );
    // 002.2: the rules view (and its entry forms) exists wherever a regime is known.
    assert.ok(
      report.views.some((v) => v.id === 'rules'),
      plot
    );
  }
});

// ── Criterion 3: naming the edges ───────────────────────────────────────────────

const BOX = rectangle(0, 0, 20, 30);

test('criterion 3: a road along the south names south street, north rear, east and west side', async () => {
  const south = road([p(-20, -6), p(40, -6)]);
  const report = await read(rnuReader({ boundary: BOX, roadAnswer: [south] }));
  assert.deepEqual(roleBy(report), { 1: 'street', 2: 'side', 3: 'rear', 4: 'side' });
  const streetId = report.edges[0].assumptionId;
  assert.match(streetId, /^street-/);
  const assumption = report.assumptions.find((a) => a.id === streetId);
  assert.deepEqual(assumption.text, {
    key: 'fr-urban-rules.assumption.streetEdge',
    params: { road: 'Rue du Test' }
  });
  assert.equal(report.edges[1].assumptionId, 'edges-derived');
});

test('criterion 3: a corner plot gets two street edges, and no rear touching one', async () => {
  const south = road([p(-20, -6), p(40, -6)]);
  const west = road([p(-6, -20), p(-6, 50)], { name: 'Rue de l’Ouest' });
  const report = await read(rnuReader({ boundary: BOX, roadAnswer: [south, west] }));
  assert.deepEqual(roleBy(report), { 1: 'street', 2: 'side', 3: 'side', 4: 'street' });
});

test('DEC-3: paths, tracks, steps and tunnels do not make a street; a road too far does not either', async () => {
  const report = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: [
        road([p(-20, -3), p(40, -3)], { kind: 'path' }),
        road([p(-20, -4), p(40, -4)], { kind: 'track' }),
        road([p(-20, -5), p(40, -5)], { level: 'tunnel' }),
        road([p(-20, -40), p(40, -40)])
      ]
    })
  );
  assert.deepEqual(roleBy(report), { 1: 'side', 2: 'side', 3: 'side', 4: 'side' });
  assert.ok(report.assumptions.some((a) => a.id === 'no-street-edge'));
});

test('DEC-3: a road without a width is taken 3 m wide, and said', async () => {
  const report = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: [road([p(-20, -10), p(40, -10)], { widthMetres: undefined })]
    })
  );
  assert.equal(roleBy(report)[1], 'street');
  assert.deepEqual(report.assumptions.find((a) => a.id === 'road-width-assumed').text.params, {
    width: 3
  });
});

test('criterion 3: no road gives four side edges; a refusal gives four side edges and an unavailable source', async () => {
  const none = await read(rnuReader({ boundary: BOX, roadAnswer: [] }));
  assert.deepEqual(roleBy(none), { 1: 'side', 2: 'side', 3: 'side', 4: 'side' });
  assert.ok(none.assumptions.some((a) => a.id === 'no-road'));
  assert.equal(none.sources.find((s) => s.id === 'roads').state, 'ready');

  const refused = await read(
    rnuReader({ boundary: BOX, roadAnswer: { refused: 'source-unavailable', detail: 'HTTP 400' } })
  );
  assert.deepEqual(roleBy(refused), { 1: 'side', 2: 'side', 3: 'side', 4: 'side' });
  assert.equal(refused.sources.find((s) => s.id === 'roads').state, 'unavailable');
  assert.ok(refused.assumptions.some((a) => a.id === 'roads-unavailable'));
});

test('criterion 3: no Site boundary gives no edges and R.111-17 not_checked "no Site boundary drawn"', async () => {
  const context = rnuReader({ measured: replay(measures.pitched) });
  const report = await read(context);
  assert.deepEqual(report.edges, []);
  assert.equal(context.queried.length, 0);
  assert.equal(report.checks.filter((c) => c.ruleId === 'rnu:R.111-17').length, 1);
  // 002.1b review: R.111-16 says no-boundary too.
  assert.equal(report.checks.find((c) => c.ruleId === 'rnu:R.111-16').result, 'not_checked');
  assert.equal(report.checks.find((c) => c.ruleId === 'rnu:R.111-17').result, 'not_checked');
  assert.ok(
    report.checks
      .find((c) => c.ruleId === 'rnu:R.111-17')
      .assumptionIds.includes('not-checked-no-boundary')
  );
  assert.deepEqual(report.assumptions.find((a) => a.id === 'not-checked-no-boundary').text, {
    key: 'fr-urban-rules.reason.no-boundary'
  });
  assert.equal(view(report, 'edges').blocks[0].text.key, 'fr-urban-rules.notice.noBoundary');
});

test('DEC-4: the roads are asked once per Site boundary per session, over its box grown by 30 m; refresh asks again', async () => {
  const context = rnuReader({ boundary: BOX, roadAnswer: [] });
  await read(context);
  await read(context, 'design');
  assert.equal(context.queried.length, 1);
  assert.deepEqual(context.queried[0], {
    crs: 'EPSG:2154',
    minEasting: -30,
    minNorthing: -30,
    maxEasting: 50,
    maxNorthing: 60,
    limit: 500
  });
  await read(context, 'refresh');
  assert.equal(context.queried.length, 2);
});

test('carte-gouv-fr’s recorded roads: Mouzay’s plot faces a street; Brouennes AB0280 is a back plot', async () => {
  const mouzay = await read(
    rnuReader({
      plot: 'mouzay',
      boundary: roads.mouzay.boundary.ring,
      roadAnswer: roads.mouzay.answer
    })
  );
  assert.ok(Object.values(roleBy(mouzay)).includes('street'), JSON.stringify(roleBy(mouzay)));
  assert.match(mouzay.attribution, /BD TOPO|IGN/);
  // Every recorded road is 37 m or more from each edge's midpoint, past DEC-3's
  // half width + 20 m: no edge faces a road, said, and every edge is side.
  const brouennes = await read(
    rnuReader({ boundary: roads.brouennes.boundary.ring, roadAnswer: roads.brouennes.answer })
  );
  assert.ok(Array.isArray(roads.brouennes.answer) && roads.brouennes.answer.length > 0);
  assert.deepEqual(roleBy(brouennes), { 1: 'side', 2: 'side', 3: 'side' });
  assert.ok(brouennes.assumptions.some((a) => a.id === 'no-street-edge'));
});

// ── Criterion 4: correcting a role ──────────────────────────────────────────────

const SOUTH = [road([p(-20, -6), p(40, -6)])];
// 002.13: the button names the edge by the host's letter (1 → A), not its number.
const subjectOf = (report, edge) =>
  view(report, 'edges')
    .blocks.find((b) => b.kind === 'actions')
    .actions.find((a) => a.label.params?.edge === String.fromCharCode(64 + edge)).target.subjectId;

test('criterion 4: set-edge-role writes one section with expected, keeps what it does not own, and wins', async () => {
  // Members of later sprints (002.3's ticks, say), opaque to this one.
  const owned = { schema: 1, ticks: [{ variationId: 'v1' }], rooms: { a: 1 } };
  const context = rnuReader({ boundary: BOX, roadAnswer: SOUTH, section: owned });
  const before = await read(context);
  assert.equal(roleBy(before)[2], 'side');
  const result = await context.reader.runAction(
    {
      actionId: 'set-edge-role',
      target: { subjectId: subjectOf(before, 2) },
      values: { role: 'street' },
      site: context.site
    },
    { signal: signal() }
  );
  assert.deepEqual(result, { status: 'done' });
  assert.equal(context.writes.length, 1);
  const { next, label, expected } = context.writes[0];
  assert.deepEqual(expected, owned);
  assert.equal(label, 'Set Site boundary edge role');
  assert.deepEqual(next.ticks, owned.ticks);
  assert.deepEqual(next.rooms, owned.rooms);
  assert.equal(next.schema, 1);
  assert.deepEqual(
    next.edgeRoles.map((e) => [e.plot, e.ends, e.role]),
    [
      [
        ['55083000AB0280'],
        [
          [20, 0],
          [20, 30]
        ],
        'street'
      ]
    ]
  );
  // The host re-reads with `site`; the read answers from the cache, the section and the measures.
  const after = await read(context);
  assert.equal(roleBy(after)[2], 'street');
  assert.equal(after.edges[1].assumptionId, 'edge-set-by-you');
});

test('criterion 4: a correction is keyed by its ends and plot: it survives renumbering, and is never pruned on read', async () => {
  const context = rnuReader({ boundary: BOX, roadAnswer: SOUTH });
  const first = await read(context);
  await context.reader.runAction(
    {
      actionId: 'set-edge-role',
      target: { subjectId: subjectOf(first, 3) },
      values: { role: 'side' },
      site: context.site
    },
    { signal: signal() }
  );
  // The same boundary drawn from another first vertex: edge 3 is now edge 2.
  const renumbered = [BOX[1], BOX[2], BOX[3], BOX[0]];
  const moved = rnuReader({ boundary: renumbered, roadAnswer: SOUTH, section: context.held() });
  const report = await read(moved);
  assert.deepEqual(roleBy(report), { 1: 'side', 2: 'side', 3: 'side', 4: 'street' });
  assert.equal(report.edges[1].assumptionId, 'edge-set-by-you');

  // The boundary redrawn there: listed "no longer matching", with Forget; nothing written.
  const redrawn = rnuReader({
    boundary: rectangle(0, 0, 20, 31),
    roadAnswer: SOUTH,
    section: context.held()
  });
  const stale = await read(redrawn);
  const blocks = view(stale, 'edges').blocks;
  assert.ok(
    blocks.some(
      (b) => b.kind === 'heading' && b.text.key === 'fr-urban-rules.edges.noLongerMatching'
    )
  );
  const forget = blocks.filter((b) => b.kind === 'actions').at(-1).actions[0];
  assert.equal(forget.id, 'forget-edge-role');
  assert.equal(redrawn.writes.length, 0);
  assert.equal(redrawn.held().edgeRoles.length, 1);

  // Forget is the only way out.
  const forgot = await redrawn.reader.runAction(
    { actionId: 'forget-edge-role', target: forget.target, site: redrawn.site },
    { signal: signal() }
  );
  assert.deepEqual(forgot, { status: 'done' });
  assert.deepEqual(redrawn.held().edgeRoles, []);
});

test('criterion 4: a correction made on another plot is listed "from another plot", not applied', async () => {
  const section = {
    schema: 1,
    edgeRoles: [
      {
        plot: ['99999000ZZ0001'],
        ends: [
          [20, 0],
          [20, 30]
        ],
        role: 'street',
        at: '2026-10-20T10:00:00Z'
      }
    ]
  };
  const report = await read(rnuReader({ boundary: BOX, roadAnswer: SOUTH, section }));
  assert.equal(roleBy(report)[2], 'side');
  assert.ok(
    view(report, 'edges').blocks.some(
      (b) => b.kind === 'heading' && b.text.key === 'fr-urban-rules.edges.otherPlot'
    )
  );
});

test('criterion 4: a stale write is refused, a throwing write is refused, a changed edge is refused', async () => {
  const stale = rnuReader({ boundary: BOX, roadAnswer: SOUTH, write: () => false });
  const report = await read(stale);
  const ask = (context, subjectId) =>
    context.reader.runAction(
      {
        actionId: 'set-edge-role',
        target: { subjectId },
        values: { role: 'rear' },
        site: context.site
      },
      { signal: signal() }
    );
  assert.deepEqual(await ask(stale, subjectOf(report, 2)), {
    status: 'refused',
    message: { key: 'fr-urban-rules.edges.stale' }
  });
  const throwing = rnuReader({
    boundary: BOX,
    roadAnswer: SOUTH,
    write: () => {
      throw new Error('Site package data is over its limit');
    }
  });
  const refused = await ask(throwing, subjectOf(report, 2));
  assert.equal(refused.status, 'refused');
  assert.deepEqual(refused.message, {
    key: 'fr-urban-rules.edges.writeFailed',
    params: { reason: 'Site package data is over its limit' }
  });
  const changed = rnuReader({ boundary: BOX, roadAnswer: SOUTH });
  assert.deepEqual(await ask(changed, '1.00,1.00;2.00,2.00'), {
    status: 'refused',
    message: { key: 'fr-urban-rules.edges.changed' }
  });
  assert.equal(changed.writes.length, 0);
});

test('DEC-8: a section of an unknown schema is read-only: no action, never rewritten', async () => {
  const context = rnuReader({
    boundary: BOX,
    roadAnswer: SOUTH,
    section: { schema: 2, edgeRoles: [] }
  });
  const report = await read(context);
  const blocks = view(report, 'edges').blocks;
  assert.equal(
    blocks.some((b) => b.kind === 'actions'),
    false
  );
  assert.ok(
    blocks.some((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.newerSection')
  );
  const result = await context.reader.runAction(
    {
      actionId: 'set-edge-role',
      target: { subjectId: '0.00,0.00;20.00,0.00' },
      values: { role: 'rear' },
      site: context.site
    },
    { signal: signal() }
  );
  assert.equal(result.status, 'refused');
  assert.equal(context.writes.length, 0);
});

// ── Criterion 5: the views ──────────────────────────────────────────────────────

test('criterion 5: the edges view holds the plot view, the edge list and one three-option set-edge-role per edge; rules and checks views exist', async () => {
  const report = await read(
    rnuReader({ boundary: BOX, roadAnswer: SOUTH, measured: replay(measures.pitched) })
  );
  const edges = view(report, 'edges');
  // 002.13: the table (number, role, length, why) is the host's plot view and edge list now; the
  // length column went with it (the letter identifies an edge, the owner's answer to Q1).
  assert.deepEqual(edges.blocks.slice(0, 2), [
    { kind: 'plot-plan', categories: ['envelope'] },
    { kind: 'edges' }
  ]);
  assert.equal(edges.blocks.some((b) => b.kind === 'table'), false);
  assert.equal(report.edges.length, 4);
  const actions = edges.blocks.find((b) => b.kind === 'actions').actions;
  assert.equal(actions.length, 4);
  for (const action of actions) {
    assert.equal(action.id, 'set-edge-role');
    assert.match(action.target.subjectId, /^-?\d+\.\d{2},-?\d+\.\d{2};-?\d+\.\d{2},-?\d+\.\d{2}$/);
    assert.equal(action.fields.length, 1);
    assert.equal(action.fields[0].kind, 'choice');
    assert.deepEqual(
      action.fields[0].options.map((o) => o.value),
      ['street', 'side', 'rear']
    );
  }
  assert.deepEqual(view(report, 'rules').blocks.slice(0, 2), [
    { kind: 'meter', rules: true },
    { kind: 'rules' }
  ]);
  assert.deepEqual(
    [view(report, 'checks').blocks[0].kind, view(report, 'checks').blocks.at(-1).kind],
    ['checks', 'assumptions']
  );
  for (const v of report.views) assert.match(v.id, /^[a-z0-9-]{1,64}$/);
});

// ── Criteria 6–8: the R.111-17 checks ───────────────────────────────────────────

/** The recorded measures' own boundary (edge 1 south, 4.00 m from the house) and a road along its west edge. */
const westRoad = (recorded) => {
  const ring = recorded.boundary.ring;
  const x = ring[0].easting - 6;
  return [road([p(x, ring[0].northing - 20), p(x, ring[2].northing + 20)])];
};

async function checksFor(name, options = {}) {
  const recorded = measures[name];
  const measured = replay(recorded, options);
  const context = rnuReader({
    boundary: recorded.boundary.ring,
    roadAnswer: westRoad(recorded),
    measured
  });
  const report = await read(context);
  return { report, measured };
}

test('criterion 6: the per-point case is no_issue, from the platform’s worst pair at the eaves', async () => {
  const { report, measured } = await checksFor('pitched');
  assert.deepEqual(roleBy(report), { 1: 'side', 2: 'rear', 3: 'side', 4: 'street' });
  assert.deepEqual(
    measured.asked[0].targets.map((t) => t.edge),
    [1, 2, 3]
  );
  assert.equal(measured.asked[0].outline, 'withRoofOverhangs');
  assert.deepEqual(measured.asked[0].ratios, [0.5]);
  assert.equal(measured.asked[0].byFacade, true);
  const south = check(report, 1);
  assert.equal(south.ruleId, 'rnu:R.111-17');
  assert.equal(south.result, 'no_issue');
  // 0.5 × 6.00 = 3.00 ≤ the 3 m floor: the floor governs, measured on the nearest pair, 4.00.
  assert.deepEqual(south.measured, { value: 4, unit: 'm' });
  assert.deepEqual(south.limit, { value: 3, unit: 'm' });
  assert.ok(south.figure.dimension.from && south.figure.dimension.to);
  for (const id of ['site-boundary-parcel', 'balconies-not-modelled', 'edges-derived']) {
    assert.ok(south.assumptionIds.includes(id), id);
  }
  // 002.4 Q5: one check for the building, governed by edge 1 (the smallest margin);
  // edges 2 and 3 listed, with R.111-17's limit where it differs from the governing one.
  assert.equal(south.id, 'r111-17:building-main');
  const r17 = report.checks.filter((c) => c.ruleId === 'rnu:R.111-17');
  assert.equal(r17.length, 1);
  assert.deepEqual(south.subject.label, {
    key: 'fr-urban-rules.check.subject.mainEdges',
    params: { edge: 1, others: '2 (20 m / 4.2 m), 3 (22 m)' }
  });
});

test('R.111-17: a worst pair past the margin is a potential issue, measured on that pair', async () => {
  const { report } = await checksFor('pitched', {
    edit: (answer) => {
      const w = answer.targets[0].worst[0];
      Object.assign(w, { distance: 3.5, rise: 9, margin: 3.5 - 4.5 });
      return answer;
    }
  });
  const south = check(report, 1);
  assert.equal(south.result, 'potential_issue');
  assert.deepEqual(south.measured, { value: 3.5, unit: 'm' });
  assert.deepEqual(south.limit, { value: 4.5, unit: 'm' });
});

test('R.111-17: closer than 3 m is a potential issue even with a positive margin', async () => {
  const { report } = await checksFor('pitched', {
    edit: (answer) => {
      answer.targets[0].nearest.distance = 2.5;
      Object.assign(answer.targets[0].worst[0], { distance: 2.5, rise: 2, margin: 1.5 });
      return answer;
    }
  });
  const south = check(report, 1);
  assert.equal(south.result, 'potential_issue');
  assert.deepEqual(south.measured, { value: 2.5, unit: 'm' });
  assert.deepEqual(south.limit, { value: 3, unit: 'm' });
});

const adjoining = (count) => (answer) => {
  const samples = answer.facades.find((run) => run.facade === 'south').targets[0].samples;
  samples.forEach((s, i) => (s.distance = i >= 10 && i < 10 + count ? 0.04 : 4));
  answer.targets[0].nearest.distance = 0.04;
  Object.assign(answer.targets[0].worst[0], { distance: 0.04, rise: 6, margin: 0.04 - 3 });
  return answer;
};

test('criterion 7: five consecutive samples within 0.05 m adjoin the Site boundary: no_issue there; four do not', async () => {
  // 002.4 Q5: adjoining, edge 1 no longer governs; it is listed, and `adjoins` says why.
  const five = r17Of((await checksFor('pitched', { edit: adjoining(5) })).report);
  assert.equal(five.result, 'no_issue');
  assert.notEqual(five.subject.id, '1');
  assert.equal(edgeDistances(five).get(1), 0.04);
  assert.ok(five.assumptionIds.includes('adjoins'));
  const four = check((await checksFor('pitched', { edit: adjoining(4) })).report, 1);
  assert.equal(four.result, 'potential_issue');
  assert.equal(four.assumptionIds.includes('adjoins'), false);
});

test('criterion 8: no terrain (the platform’s own answer) is not_checked, with its reason', async () => {
  const { report } = await checksFor('no-terrain');
  const south = check(report, 1);
  assert.equal(south.result, 'not_checked');
  assert.ok(south.assumptionIds.includes('not-checked-no-terrain'));
  assert.equal(south.measured, undefined);
  assert.deepEqual(report.assumptions.find((a) => a.id === 'not-checked-no-terrain').text, {
    key: 'fr-urban-rules.reason.no-terrain'
  });
});

test('criterion 8: each rise the host cannot give, a target it cannot measure and a refused answer are not_checked with their reason', async () => {
  for (const reason of ['outside-terrain', 'unmeasured', 'other-system', 'no-datum', 'no-solids']) {
    const { report } = await checksFor('pitched', {
      edit: (answer) => {
        answer.targets[0].worst = [{ ratio: 0.5, rise: { unavailable: reason } }];
        return answer;
      }
    });
    const south = check(report, 1);
    assert.equal(south.result, 'not_checked', reason);
    assert.ok(south.assumptionIds.includes(`not-checked-${reason}`), reason);
  }
  const target = check(
    (
      await checksFor('pitched', {
        edit: (answer) => {
          answer.targets[0] = { target: answer.targets[0].target, unavailable: 'outline-refused' };
          return answer;
        }
      })
    ).report,
    1
  );
  assert.equal(target.result, 'not_checked');
  assert.ok(target.assumptionIds.includes('not-checked-outline-refused'));
  const { report } = await checksFor('pitched', {
    edit: () => ({ available: false, reason: 'not-located' })
  });
  assert.ok(
    report.checks.every(
      (c) => c.result === 'not_checked' && c.assumptionIds.includes('not-checked-not-located')
    )
  );
});

test('criterion 8: a datumDerived pair (the platform’s own answer) runs the check with the datum-derived assumption', async () => {
  const { report } = await checksFor('datum-derived');
  const south = check(report, 1);
  assert.equal(south.result, 'no_issue');
  assert.ok(south.assumptionIds.includes('datum-derived'));
  assert.match(
    JSON.stringify(report.assumptions.find((a) => a.id === 'datum-derived').text),
    /fr-urban-rules\.assumption\.datumDerived/
  );
});

test('criterion 8: a refused withRoofOverhangs falls back to storeys, said', async () => {
  const { report, measured } = await checksFor('pitched', {
    refuse: { withRoofOverhangs: 'outline-refused' }
  });
  assert.deepEqual(
    measured.asked.map((a) => a.outline),
    ['withRoofOverhangs', 'storeys']
  );
  const south = check(report, 1);
  assert.equal(south.result, 'no_issue');
  assert.ok(south.assumptionIds.includes('roof-overhangs-unread'));
  assert.ok(report.assumptions.some((a) => a.id === 'roof-overhangs-unread'));
});

test('DEC-6: with overhangs (the platform’s withRoofOverhangs answer) the eave counts: 3.60 m, still no issue', async () => {
  const { report } = await checksFor('pitched-overhangs');
  const south = check(report, 1);
  assert.equal(south.result, 'no_issue');
  assert.deepEqual(south.measured, { value: 3.6, unit: 'm' });
});

test('DEC-6: every building of the open Document is checked, named in the subject', async () => {
  const recorded = measures.pitched;
  const measured = replay(recorded);
  const annex = {
    id: 'b-annex',
    type: 'Building',
    property: (k) => (k === 'name' ? { kind: 'string', value: 'Garage' } : undefined)
  };
  const context = rnuReader({
    boundary: recorded.boundary.ring,
    roadAnswer: westRoad(recorded),
    measured,
    buildings: [annex]
  });
  const report = await read(context);
  assert.deepEqual(
    measured.asked.map((a) => a.buildingId),
    [undefined, 'b-annex'] // the main building asked without an id (review 2026-10-20)
  );
  const garage = r17Of(report, 'b-annex');
  assert.deepEqual(garage.subject.label, {
    key: 'fr-urban-rules.check.subject.namedEdges',
    params: { building: 'Garage', edge: 1, others: '2 (20 m / 4.2 m), 3 (22 m)' }
  });
});

test('DEC-6: the checks follow the design: a design read re-measures, with no request', async () => {
  const recorded = measures.pitched;
  let near = 4;
  const measured = replay(recorded, {
    edit: (answer) => {
      answer.targets[0].nearest.distance = near;
      return answer;
    }
  });
  const context = rnuReader({
    boundary: recorded.boundary.ring,
    roadAnswer: westRoad(recorded),
    measured
  });
  assert.equal(check(await read(context), 1).result, 'no_issue');
  near = 2;
  assert.equal(check(await read(context, 'design'), 1).result, 'potential_issue');
});

// ── Criterion 9: never "property" ───────────────────────────────────────────────

test('criterion 9: nothing calls the Site boundary a property line, in either language', async () => {
  const source = (await readFile(new URL('../src/index.js', import.meta.url), 'utf8'))
    // The SDK's `EntityView.property(key)` is a method, not a word shown.
    .replace(/\.property\(/g, '.(');
  const en = await readFile(
    new URL('../resources/i18n/fr-urban-rules/en.json', import.meta.url),
    'utf8'
  );
  const fr = await readFile(
    new URL('../resources/i18n/fr-urban-rules/fr.json', import.meta.url),
    'utf8'
  );
  for (const [name, text] of [
    ['index.js', source],
    ['en.json', en],
    ['fr.json', fr]
  ]) {
    assert.doesNotMatch(text, /property/i, name);
    assert.doesNotMatch(text, /propriété/i, name);
    assert.doesNotMatch(text, /limite de propriété/i, name);
  }
});

test('DEC-8 builders are pure: the section read is never mutated', () => {
  const section = Object.freeze({
    schema: 1,
    edgeRoles: Object.freeze([]),
    other: Object.freeze({ a: 1 })
  });
  const next = __testing.withEdgeRole(
    section,
    ['X'],
    [
      [0, 0],
      [1, 1]
    ],
    'rear',
    '2026-10-20T00:00:00Z'
  );
  assert.equal(next.other, section.other);
  assert.equal(next.edgeRoles.length, 1);
  assert.equal(
    __testing.withoutEdgeRole(next, __testing.entrySubject(next.edgeRoles[0])).edgeRoles.length,
    0
  );
});

// ── Review fixes (2026-10-20) ───────────────────────────────────────────────────

const editFirst = (fn) => ({
  edit: (answer) => {
    fn(answer.targets[0]);
    return answer;
  }
});

test('review 1: the probe — nearest 2.5 m at rise 0, worst 4 m at rise 7 — fails the floor, shown on the nearest pair', async () => {
  const { report } = await checksFor(
    'pitched',
    editFirst((t) => {
      t.nearest.distance = 2.5;
      Object.assign(t.worst[0], { distance: 4, rise: 7, margin: 4 - 3.5 });
    })
  );
  const south = check(report, 1);
  assert.equal(south.result, 'potential_issue');
  assert.deepEqual(south.measured, { value: 2.5, unit: 'm' });
  assert.deepEqual(south.limit, { value: 3, unit: 'm' });
  assert.equal(south.assumptionIds.includes('governed-by-rise'), false);
});

test('review 1: both limits missed — the larger shortfall is shown, and said', async () => {
  const rise = check(
    (
      await checksFor(
        'pitched',
        editFirst((t) => {
          t.nearest.distance = 2.9;
          Object.assign(t.worst[0], { distance: 3.2, rise: 10, margin: 3.2 - 5 });
        })
      )
    ).report,
    1
  );
  assert.deepEqual([rise.measured.value, rise.limit.value], [3.2, 5]);
  assert.ok(rise.assumptionIds.includes('governed-by-rise'));
  const floor = check(
    (
      await checksFor(
        'pitched',
        editFirst((t) => {
          t.nearest.distance = 1;
          Object.assign(t.worst[0], { distance: 3.2, rise: 6.6, margin: 3.2 - 3.3 });
        })
      )
    ).report,
    1
  );
  assert.deepEqual([floor.measured.value, floor.limit.value], [1, 3]);
  assert.ok(floor.assumptionIds.includes('governed-by-floor'));
});

test('review 2: 2.9999999 m is 3.000 m at the model’s resolution; −0.0004 m of margin is none', async () => {
  const { report } = await checksFor(
    'pitched',
    editFirst((t) => {
      t.nearest.distance = 2.9999999;
      Object.assign(t.worst[0], { distance: 2.9999999, rise: 6.0008, margin: -0.0004 });
    })
  );
  const south = check(report, 1);
  assert.equal(south.result, 'no_issue');
  assert.deepEqual(south.measured, { value: 3, unit: 'm' });
  const short = check(
    (
      await checksFor(
        'pitched',
        editFirst((t) => (t.nearest.distance = 2.999))
      )
    ).report,
    1
  );
  assert.equal(short.result, 'potential_issue');
});

test('review 5: no terrain and closer than 3 m is a definite issue on the floor, the rise said not checked', async () => {
  const { report } = await checksFor(
    'no-terrain',
    editFirst((t) => (t.nearest.distance = 2))
  );
  const south = check(report, 1);
  assert.equal(south.result, 'potential_issue');
  assert.deepEqual([south.measured.value, south.limit.value], [2, 3]);
  assert.ok(south.assumptionIds.includes('not-checked-no-terrain'));
  assert.ok(south.assumptionIds.includes('governed-by-floor'));
});

test('review 5: adjoining needs the nearest pair within 5 cm; a partial run is said "partially"', async () => {
  const southSamples = (answer) =>
    answer.facades.find((run) => run.facade === 'south').targets[0].samples;
  const partial = r17Of(
    (
      await checksFor('pitched', {
        edit: (answer) => {
          southSamples(answer).forEach((sample, i) => (sample.distance = i < 6 ? 0.02 : 1.5));
          answer.targets[0].nearest.distance = 0.02;
          Object.assign(answer.targets[0].worst[0], { distance: 0.02, rise: 6, margin: -2.98 });
          return answer;
        }
      })
    ).report
  );
  assert.equal(partial.result, 'no_issue');
  assert.ok(partial.assumptionIds.includes('adjoins-partially'));
  const away = check(
    (
      await checksFor('pitched', {
        edit: (answer) => {
          southSamples(answer).forEach((sample, i) => (sample.distance = i < 6 ? 0.02 : 4));
          answer.targets[0].nearest.distance = 0.5;
          Object.assign(answer.targets[0].worst[0], { distance: 0.5, rise: 6, margin: -2.5 });
          return answer;
        }
      })
    ).report,
    1
  );
  assert.equal(away.result, 'potential_issue');
});

/** The host's counts (platform `REGULATION_REPORT_LIMITS`), mirrored. */
function withinHostCounts(report) {
  return (
    report.edges.length <= 500 &&
    report.checks.length <= 1000 &&
    report.assumptions.length <= 500 &&
    report.flags.length <= 500 &&
    report.rules.length <= 1000 &&
    report.views.length <= 100 &&
    report.views.every((v) => v.blocks.length <= 200) &&
    report.checks.every((c) =>
      (c.assumptionIds ?? []).every((id) => report.assumptions.some((a) => a.id === id))
    )
  );
}

test('review 3: a 20,000-edge Site boundary stays within the host’s counts; rules and views kept, the caps said', async () => {
  const ring = [];
  for (let i = 0; i < 20_000; i += 1) {
    const angle = (2 * Math.PI * i) / 20_000;
    ring.push(p(1000 * Math.cos(angle), 1000 * Math.sin(angle)));
  }
  const streets = Array.from({ length: 50 }, (_, k) =>
    road([p(-2000, 1010 + k * 0.01), p(2000, 1010 + k * 0.01)], { name: `Rue ${k}` })
  );
  const context = rnuReader({
    boundary: ring,
    roadAnswer: streets,
    measured: replay(measures.pitched)
  });
  const report = await read(context);
  assert.ok(
    withinHostCounts(report),
    JSON.stringify({
      e: report.edges.length,
      c: report.checks.length,
      a: report.assumptions.length
    })
  );
  assert.equal(report.edges.length, 500);
  assert.equal(report.rules.length, 6);
  assert.ok(report.assumptions.some((a) => a.id === 'edges-capped'));
  assert.ok(
    view(report, 'edges').blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.capped'
    )
  );
  assert.ok(view(report, 'edges').blocks.find((b) => b.kind === 'actions').actions.length <= 200);
  // 002.7 review (2026-10-21): past 1,000 edges no envelope is drawn — said, never a stall.
  assert.equal(report.features.some((f) => f.id === 'envelope'), false);
  assert.ok(
    view(report, 'envelope').blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.envelope.notice.shape'
    )
  );
});

test('review 4: runAction never throws: a section that cannot be read is a refusal', async () => {
  const context = rnuReader({ boundary: BOX, roadAnswer: SOUTH });
  context.data.read = () => {
    throw new Error('the section store is gone');
  };
  const result = await context.reader.runAction(
    {
      actionId: 'set-edge-role',
      target: { subjectId: '0.00,0.00;20.00,0.00' },
      values: { role: 'rear' },
      site: context.site
    },
    { signal: signal() }
  );
  assert.equal(result.status, 'refused');
  assert.match(result.message.params.reason, /the section store is gone/);
});

test('review 5: an owned member of an unrecognised shape makes the section read-only, never overwritten', async () => {
  for (const edgeRoles of ['nope', [{ ends: 'bad', role: 'street' }]]) {
    const context = rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH,
      section: { schema: 1, edgeRoles }
    });
    const report = await read(context);
    assert.equal(
      view(report, 'edges').blocks.some((b) => b.kind === 'actions'),
      false
    );
    const result = await context.reader.runAction(
      {
        actionId: 'set-edge-role',
        target: { subjectId: '0.00,0.00;20.00,0.00' },
        values: { role: 'rear' },
        site: context.site
      },
      { signal: signal() }
    );
    assert.equal(result.status, 'refused');
    assert.equal(context.writes.length, 0);
  }
});

test('review 5: a carte communale only partly non-constructible flags "some sectors"; a refusal says Refresh', async () => {
  const { site, conversions, answers } = plots.mouzay;
  const sectors = structuredClone(answers.get('apicarto-secteur-cc').body);
  const second = structuredClone(sectors.features[0]);
  second.id = 'secteur_cc.2';
  second.properties.libelle = 'N';
  second.properties.typesect = '03';
  sectors.features.push(second);
  sectors.totalFeatures = 2;
  sectors.numberMatched = 2;
  const fetched = recordedFetch(answers, {
    'apicarto-secteur-cc': async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(sectors)
    })
  });
  const reader = createReader({
    fetch: fetched.fetch,
    site: () => recordedSiteService(site, conversions)
  });
  const report = await reader.read(requestFor(site), { signal: signal() });
  assert.equal(
    report.flags.find((f) => f.kind === 'cc-restricted').label.key,
    'fr-urban-rules.flag.ccRestrictedSome'
  );
  const en = JSON.parse(
    await readFile(new URL('../resources/i18n/fr-urban-rules/en.json', import.meta.url), 'utf8')
  );
  assert.match(en['fr-urban-rules.status.roadsRefused'], /Refresh/);
});

// ── Sprint 002.1b: alignment, R.111-16, R.111-15, R.111-28, bands ────────────────

before(async () => {
  for (const name of [
    'alignment-line',
    'alignment-outside',
    'annex-2.5',
    'annex-3.5',
    'annex-touching'
  ]) {
    measures[name] = await json(`measures/${name}.json`);
  }
});

/**
 * The platform's recorded answers by target kind: boundary edges from the
 * pitched house, a `line` with a ratio (an opposite alignment) from
 * `alignment-line`, a `line` without (an existing building) from the same,
 * a `building` from an annex case. Each asked target gets the recorded one.
 */
function mixed({ line = 'alignment-line', building = 'annex-2.5', editLine } = {}) {
  const edges = replay(measures.pitched);
  const calls = [];
  return {
    calls,
    projection: () => measures.pitched.projection,
    distances: (input) => {
      calls.push(input);
      const kinds = new Set(input.targets.map((t) => t.kind));
      if (kinds.has('boundary-edge')) return edges.distances(input);
      const source = measures[kinds.has('line') ? line : building];
      const picked = {
        ...structuredClone(source.answer),
        targets: input.targets.map((t) => ({
          ...structuredClone(source.answer.targets[0]),
          target: t
        }))
      };
      return kinds.has('line') && input.ratios !== undefined && editLine !== undefined
        ? editLine(picked)
        : picked;
    }
  };
}

const rect = (x0, y0, x1, y1) => [[p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)]];
const parcel = (id, x0, y0, x1, y1) => ({
  id,
  kind: 'parcel',
  label: id,
  rings: rect(x0, y0, x1, y1),
  properties: {},
  attribution: '© IGN'
});
const SOUTH_ROAD = [road([p(-20, -6), p(40, -6)], { widthMetres: 6 })];
const alignment = (report) => report.features.find((f) => f.id === 'alignment:1');

test('002.1b criterion 1: facing parcels 12 m across a 6 m carriageway give the alignment, assumed from the cadastre', async () => {
  const context = rnuReader({
    boundary: BOX,
    roadAnswer: SOUTH_ROAD,
    features: {
      parcel: [parcel('55083000ZZ0001', -10, -40, 30, -12), parcel('55083000AB0280', 0, 0, 20, 30)]
    }
  });
  const report = await read(context);
  const a = alignment(report);
  assert.equal(a.category, 'alignment');
  assert.equal(a.official, false);
  assert.equal(a.label.key, 'fr-urban-rules.alignment.parcels');
  // Read at 21 stations along the edge (review 2026-10-20): every point on the facing edge.
  assert.equal(a.line.length, 21);
  assert.ok(a.line.every((q) => Math.abs(q.northing + 12) < 1e-9));
  assert.deepEqual([a.line[0].easting, a.line.at(-1).easting], [0, 20]);
  assert.ok(report.assumptions.some((x) => x.id === 'alignment-parcels'));
  // One parcel query over the street edges grown by 40 m, limit 200.
  const parcels = context.featureQueries.filter((q) => q.kind === 'parcel');
  assert.equal(parcels.length, 1);
  assert.deepEqual(parcels[0].query, {
    crs: 'EPSG:2154',
    minEasting: -40,
    minNorthing: -40,
    maxEasting: 60,
    maxNorthing: 40,
    limit: 200
  });
});

test('002.1b criterion 1: without facing parcels, the carriageway’s far edge, labelled stricter', async () => {
  const report = await read(rnuReader({ boundary: BOX, roadAnswer: SOUTH_ROAD }));
  const a = alignment(report);
  assert.equal(a.label.key, 'fr-urban-rules.alignment.carriageway');
  assert.ok(a.line.length >= 2);
  assert.ok(a.line.every((q) => Math.abs(q.northing + 9) < 1e-9));
  assert.ok(report.assumptions.some((x) => x.id === 'alignment-carriageway'));
});

/** An EL7 answer served on the corridor read across the road (the real fetch path), coordinates scaled. */
const el7Answer = (...lines) => ({
  type: 'FeatureCollection',
  totalFeatures: lines.length,
  features: lines.map((line, k) => ({
    type: 'Feature',
    id: `assiette_sup_l.el7.${k}`,
    geometry: { type: 'LineString', coordinates: line.map(([x, y]) => [x / 1e5, y / 1e5]) },
    properties: { suptype: 'el7', nomass: `EL7_${k}`, typeass: 'Alignement' }
  }))
});
const servedEl7 = (answer) => ({
  'apicarto-assiette-sup-l-el7': async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(answer)
  })
});
const el7Read = async (answer) => {
  const context = rnuReader({
    boundary: BOX,
    roadAnswer: SOUTH_ROAD,
    scaled: true,
    overrides: servedEl7(answer),
    features: { parcel: [parcel('X', -10, -40, 30, -14)] }
  });
  return { report: await read(context), context };
};

test('002.1b review B1: an EL7 line across the road, fetched over a corridor with categorie=el7, is the alignment', async () => {
  const { report, context } = await el7Read(
    el7Answer([
      [-10, -11],
      [30, -11]
    ])
  );
  const a = alignment(report);
  assert.equal(a.label.key, 'fr-urban-rules.alignment.el7');
  assert.ok(a.line.every((q) => Math.abs(q.northing + 11) < 1e-6));
  assert.equal(report.sources.find((x) => x.id === 'el7').state, 'ready');
  void context;
});

test('002.1b review B1: an EL7 line on the near side only falls through to the parcels', async () => {
  const { report } = await el7Read(
    el7Answer([
      [-10, -3],
      [30, -3]
    ])
  );
  assert.equal(alignment(report).label.key, 'fr-urban-rules.alignment.parcels');
});

test('002.1b review B1: near and far EL7 lines — the far one, beyond the centreline, nearest of those', async () => {
  const { report } = await el7Read(
    el7Answer(
      [
        [-10, -3],
        [30, -3]
      ],
      [
        [-10, -11],
        [30, -11]
      ],
      [
        [-10, -25],
        [30, -25]
      ]
    )
  );
  const a = alignment(report);
  assert.equal(a.label.key, 'fr-urban-rules.alignment.el7');
  assert.ok(a.line.every((q) => Math.abs(q.northing + 11) < 1e-6));
});

test('002.1b review B1: the corridor read goes through the planning fetch with categorie=el7, across the road', async () => {
  const urls = [];
  const { site, conversions, answers } = plots.brouennes;
  const fetched = recordedFetch(
    answers,
    servedEl7(
      el7Answer([
        [-10, -11],
        [30, -11]
      ])
    )
  );
  const reader = createReader({
    fetch: async (url, init) => (urls.push(url), fetched.fetch(url, init)),
    site: () => ({
      ...recordedSiteService({ ...site, boundary: { ring: BOX } }, conversions),
      toGeographicRing: (ring) =>
        ring.map((q) => ({ longitude: q.easting / 1e5, latitude: q.northing / 1e5 })),
      fromGeographicRing: (ring) =>
        ring.map((q) => ({ easting: q.longitude * 1e5, northing: q.latitude * 1e5 }))
    }),
    roads: () => ({ queryRoads: async () => SOUTH_ROAD })
  });
  await reader.read(requestFor({ ...site, boundary: { ring: BOX } }), { signal: signal() });
  const corridor = urls.find((u) => u.includes('assiette-sup-l') && u.includes('categorie=el7'));
  assert.ok(corridor);
  const geom = JSON.parse(new URL(corridor).searchParams.get('geom'));
  const ys = geom.coordinates[0][0].map(([, y]) => Math.round(y * 1e5 * 1000) / 1000);
  // From the edge (y = 0) out past the centreline (6 m) by 40 m: to y = −46.
  assert.deepEqual([Math.max(...ys), Math.min(...ys)], [0, -46]);
});

test('002.1b criterion 2: R.111-16 is no_issue on the platform’s recorded worst pair, potential when its margin is negative', async () => {
  const fine = await read(rnuReader({ boundary: BOX, roadAnswer: SOUTH_ROAD, measured: mixed() }));
  const r16 = fine.checks.filter((c) => c.ruleId === 'rnu:R.111-16');
  assert.equal(r16.length, 1);
  assert.equal(r16[0].result, 'no_issue');
  assert.equal(r16[0].subject.kind, 'building');
  assert.equal(r16[0].subject.id, 'building-main');
  assert.ok(r16[0].assumptionIds.includes('alignment-carriageway'));
  const worst = measures['alignment-line'].answer.targets[0].worst[0];
  assert.deepEqual(r16[0].measured, { value: Math.round(worst.distance * 1000) / 1000, unit: 'm' });
  assert.deepEqual(r16[0].limit, { value: Math.round(worst.rise * 1000) / 1000, unit: 'm' });
  const short = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      measured: mixed({
        editLine: (answer) => {
          for (const t of answer.targets)
            Object.assign(t.worst[0], { distance: 5, rise: 6, margin: -1 });
          return answer;
        }
      })
    })
  );
  assert.equal(short.checks.find((c) => c.ruleId === 'rnu:R.111-16').result, 'potential_issue');
});

test('002.1b criterion 2: an alignment outside the terrain’s extent is not_checked with the extent reason, never asked', async () => {
  const measured = mixed();
  const report = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      measured,
      siteExtra: {
        terrain: {
          extent: { minEasting: -50, minNorthing: -5, maxEasting: 50, maxNorthing: 50 },
          resolution: 1,
          verticalDatum: 'NGF-IGN69',
          dataset: 'test',
          attribution: 'test',
          acquiredAt: 0,
          noDataCount: 0
        }
      }
    })
  );
  const r16 = report.checks.find((c) => c.ruleId === 'rnu:R.111-16');
  assert.equal(r16.result, 'not_checked');
  assert.ok(r16.assumptionIds.includes('not-checked-alignment-outside-terrain'));
  assert.equal(
    measured.calls.some((c) => c.ratios?.[0] === 1),
    false
  );
  // The host's own answer past its grid (recorded): `outside-terrain`.
  const host = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      measured: mixed({ line: 'alignment-outside' })
    })
  );
  assert.ok(
    host.checks
      .find((c) => c.ruleId === 'rnu:R.111-16')
      .assumptionIds.includes('not-checked-outside-terrain')
  );
});

test('002.1b: no road gives no alignment, and R.111-16 not_checked "no road found" per building (002.1a DEC-3 item 5)', async () => {
  const report = await read(rnuReader({ boundary: BOX, roadAnswer: [], measured: mixed() }));
  assert.equal(
    report.features.some((f) => f.category === 'alignment'),
    false
  );
  const r16 = report.checks.filter((c) => c.ruleId === 'rnu:R.111-16');
  assert.equal(r16.length, 1);
  assert.equal(r16[0].result, 'not_checked');
  assert.ok(r16[0].assumptionIds.includes('not-checked-no-road'));
  const refused = await read(
    rnuReader({ boundary: BOX, roadAnswer: { refused: 'source-unavailable' }, measured: mixed() })
  );
  assert.ok(
    refused.checks
      .find((c) => c.ruleId === 'rnu:R.111-16')
      .assumptionIds.includes('not-checked-roads-unavailable')
  );
});

const annexEntity = {
  id: 'b-annex',
  type: 'Building',
  property: (k) => (k === 'name' ? { kind: 'string', value: 'Garage' } : undefined)
};

test('002.1b criterion 3: two buildings 2.5 m apart are a potential issue while R.111-15 is to_confirm; 3.5 m no issue; contiguous none', async () => {
  const at = async (building) =>
    read(
      rnuReader({
        boundary: BOX,
        roadAnswer: SOUTH_ROAD,
        measured: mixed({ building }),
        buildings: [annexEntity]
      })
    );
  const close = await at('annex-2.5');
  assert.equal(close.rules.find((r) => r.id === 'rnu:R.111-15').status, 'to_confirm');
  const r15 = close.checks.filter((c) => c.ruleId === 'rnu:R.111-15');
  assert.equal(r15.length, 1);
  assert.equal(r15[0].result, 'potential_issue');
  assert.deepEqual([r15[0].measured.value, r15[0].limit.value], [2.5, 3]);
  assert.deepEqual(r15[0].subject.label, {
    key: 'fr-urban-rules.check.subject.r11115Main',
    params: { other: 'Garage' }
  });
  assert.equal(r15[0].id, 'r111-15:building-main:b-annex');
  assert.equal(
    (await at('annex-3.5')).checks.find((c) => c.ruleId === 'rnu:R.111-15').result,
    'no_issue'
  );
  assert.equal(
    (await at('annex-touching')).checks.some((c) => c.ruleId === 'rnu:R.111-15'),
    false
  );
});

test('002.1b criterion 3: a kept existing building is measured through line targets; a replaced one is not', async () => {
  const part = {
    sourceId: 's',
    featureId: 'BATIMENT1',
    label: 'Maison',
    rings: rect(-8, 2, -4, 6),
    properties: {},
    attribution: '©'
  };
  const ask = async (relation) => {
    const measured = mixed();
    const report = await read(
      rnuReader({
        boundary: BOX,
        roadAnswer: SOUTH_ROAD,
        measured,
        siteExtra: { existingBuilding: { parts: [part], relation } }
      })
    );
    return {
      report,
      lines: measured.calls.filter(
        (c) => c.ratios === undefined && c.targets.some((t) => t.kind === 'line')
      )
    };
  };
  const kept = await ask('kept');
  assert.equal(kept.lines.length, 1);
  const points = kept.lines[0].targets[0].points;
  assert.deepEqual(points[0], points.at(-1), 'the ring closed');
  assert.ok(kept.report.checks.some((c) => c.id === 'r111-15:building-main:existing:BATIMENT1.0'));
  const replaced = await ask('replaced');
  assert.equal(replaced.lines.length, 0);
});

test('002.1b criterion 4: R.111-28 shows the neighbours’ average and those without a height, excludes the plot’s own, never a check', async () => {
  const building = (id, x, height) => ({
    id,
    kind: 'building',
    label: id,
    rings: rect(x, 40, x + 5, 45),
    properties: {},
    attribution: '©',
    ...(height === undefined ? {} : { height })
  });
  const part = {
    sourceId: 's',
    featureId: 'OWN',
    label: 'Maison',
    rings: rect(2, 2, 6, 6),
    properties: {},
    attribution: '©'
  };
  const report = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      measured: mixed(),
      siteExtra: { existingBuilding: { parts: [part], relation: 'kept' } },
      features: {
        building: [
          building('A', 0, { roofMetres: 9, eavesMetres: 7, basis: 'measured' }),
          building('B', 8, { eavesMetres: 6, basis: 'measured' }),
          building('C', 14),
          {
            ...building('FAR', 0, { roofMetres: 30, basis: 'measured' }),
            rings: rect(300, 300, 305, 305)
          },
          { ...building('OWN', 0, { roofMetres: 50, basis: 'measured' }), rings: rect(2, 2, 6, 6) }
        ]
      }
    })
  );
  assert.equal(
    report.checks.some((c) => c.ruleId === 'rnu:R.111-28'),
    false
  );
  const rows = view(report, 'checks').blocks.find((b) => b.kind === 'fields').rows;
  const average = rows.find((r) => r.label.key === 'fr-urban-rules.field.neighboursAverage');
  assert.deepEqual(average.value, { value: 7.5, unit: 'm' });
  assert.deepEqual(average.detail.params, { count: 3, missing: 1, lightweight: 0, radius: 50 });
  assert.ok(rows.some((r) => r.label.key === 'fr-urban-rules.field.mainBuildingHeight'));
  const rule = report.rules.find((r) => r.id === 'rnu:R.111-28');
  assert.deepEqual(rule.conditions[0].params, { average: 7.5, count: 3, missing: 1, radius: 50 });
  assert.equal(hostKeepsRule(rule), true);
});

test('002.1b criterion 4: a neighbours refusal is an unavailable source and a notice', async () => {
  const report = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      features: { building: { refused: 'too-many-features' } }
    })
  );
  assert.equal(report.sources.find((x) => x.id === 'neighbours').state, 'unavailable');
  assert.ok(
    view(report, 'checks').blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.neighboursUnavailable'
    )
  );
});

test('002.1b criterion 5: bands are setback-band lines, official false, one per edge and limit, inside the boundary', async () => {
  const report = await read(
    rnuReader({ boundary: BOX, roadAnswer: SOUTH_ROAD, measured: mixed() })
  );
  const bands = report.features.filter((f) => f.category === 'setback-band');
  assert.ok(bands.length >= 3);
  const keys = new Set();
  for (const band of bands) {
    assert.equal(band.official, false);
    assert.equal(band.line.length, 2);
    assert.equal(band.rings, undefined);
    for (const q of band.line) {
      assert.ok(
        q.easting >= -1e-9 &&
          q.easting <= 20 + 1e-9 &&
          q.northing >= -1e-9 &&
          q.northing <= 30 + 1e-9,
        JSON.stringify(q)
      );
    }
    assert.ok(!keys.has(band.id));
    keys.add(band.id);
  }
  // The 3 m minimum on the side and rear edges: east x = 17, north y = 27, west x = 3.
  assert.deepEqual(report.features.find((f) => f.id === 'band:2:3').line, [p(17, 0), p(17, 30)]);
  assert.deepEqual(report.features.find((f) => f.id === 'band:3:3').line, [p(20, 27), p(0, 27)]);
});

test('002.1b: R.111-16 carries its second paragraph as an exception (002.1a review Q2)', async () => {
  const report = await read(rnuReader());
  const rule = report.rules.find((r) => r.id === 'rnu:R.111-16');
  assert.equal(
    rule.exceptions[0].text,
    `R.111-16, alinéa 2 — ${law.articles['R.111-16'].text.split('\n')[1]}`
  );
  assert.match(
    rule.exceptions[0].text,
    /Toutefois une implantation de la construction à l'alignement/
  );
  assert.equal(hostKeepsRule(rule), true);
});

test('002.1b: Mouzay with its recorded roads, facing parcels and neighbours (carte-gouv-fr’s own answers)', async () => {
  const recordedFeatures = async (name) => (await json(`mouzay/${name}.json`)).answer;
  const report = await read(
    rnuReader({
      plot: 'mouzay',
      boundary: roads.mouzay.boundary.ring,
      roadAnswer: roads.mouzay.answer,
      measured: mixed(),
      features: {
        parcel: await recordedFeatures('parcels'),
        building: await recordedFeatures('buildings')
      }
    })
  );
  assert.deepEqual(roleBy(report), {
    1: 'street',
    2: 'street',
    3: 'street',
    4: 'side',
    5: 'rear',
    6: 'rear',
    7: 'rear',
    8: 'rear',
    9: 'side',
    10: 'street'
  });
  const paths = Object.fromEntries(
    report.features
      .filter((f) => f.category === 'alignment')
      .map((f) => [f.id, f.label.key.split('.').pop()])
  );
  assert.deepEqual(paths, {
    'alignment:1': 'parcels',
    'alignment:2': 'parcels',
    'alignment:3': 'parcels',
    'alignment:10': 'carriageway'
  });
  const average = view(report, 'checks').blocks.find((b) => b.kind === 'fields').rows[0];
  assert.deepEqual(average.value, { value: 8.533, unit: 'm' });
  assert.deepEqual(average.detail.params, { count: 46, missing: 1, lightweight: 6, radius: 50 });
  assert.ok(withinHostCounts(report));
});

// ── 002.1b review fixes ─────────────────────────────────────────────────────────

test('002.1b review: second-row parcels are never taken; poor coverage falls to the carriageway', async () => {
  const two = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      features: { parcel: [parcel('ROW2', -10, -60, 30, -30), parcel('ROW1', -10, -29, 30, -12)] }
    })
  );
  assert.ok(alignment(two).line.every((q) => Math.abs(q.northing + 12) < 1e-9));
  const partial = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      features: { parcel: [parcel('PART', 0, -40, 5, -12)] }
    })
  );
  assert.equal(alignment(partial).label.key, 'fr-urban-rules.alignment.carriageway');
  assert.ok(partial.assumptions.some((x) => x.id === 'alignment-carriageway'));
});

test('002.1b review: a parcel-query refusal falls to the carriageway, said as "parcels unreadable"', async () => {
  const report = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      features: { parcel: { refused: 'too-many-features' } }
    })
  );
  assert.equal(alignment(report).label.key, 'fr-urban-rules.alignment.carriageway');
  assert.ok(report.assumptions.some((x) => x.id === 'alignment-carriageway-unread'));
  const source = report.sources.find((x) => x.id === 'facing-parcels');
  assert.equal(source.state, 'unavailable');
  assert.equal(source.detail.key, 'fr-urban-rules.status.facingParcelsRefused');
});

test('002.1b review: the parcels are asked again when the street edges change (a correction)', async () => {
  const context = rnuReader({ boundary: BOX, roadAnswer: SOUTH_ROAD, features: { parcel: [] } });
  const first = await read(context);
  const parcelQueries = () => context.featureQueries.filter((q) => q.kind === 'parcel').length;
  assert.equal(parcelQueries(), 1);
  await read(context, 'design');
  assert.equal(parcelQueries(), 1);
  await context.reader.runAction(
    {
      actionId: 'set-edge-role',
      target: { subjectId: subjectOf(first, 2) },
      values: { role: 'street' },
      site: context.site
    },
    { signal: signal() }
  );
  await read(context);
  assert.equal(parcelQueries(), 2);
});

test('002.1b review: a corner plot and two roads give each street edge its own alignment', async () => {
  const west = road([p(-6, -20), p(-6, 50)], { name: 'Rue de l’Ouest', widthMetres: 4 });
  const report = await read(rnuReader({ boundary: BOX, roadAnswer: [...SOUTH_ROAD, west] }));
  const south = report.features.find((f) => f.id === 'alignment:1');
  const westAlignment = report.features.find((f) => f.id === 'alignment:4');
  assert.ok(south.line.every((q) => Math.abs(q.northing + 9) < 1e-9));
  assert.ok(westAlignment.line.every((q) => Math.abs(q.easting + 8) < 1e-9));
});

for (const degrees of [5, 15]) {
  test(`002.1b review: an oblique road (${degrees}°) — the alignment is the carriageway's true far edge`, async () => {
    const theta = (degrees * Math.PI) / 180;
    const r0 = p(10 - 40 * Math.cos(theta), -8 - 40 * Math.sin(theta));
    const r1 = p(10 + 40 * Math.cos(theta), -8 + 40 * Math.sin(theta));
    const report = await read(
      rnuReader({ boundary: BOX, roadAnswer: [road([r0, r1], { widthMetres: 6 })] })
    );
    const a = alignment(report);
    assert.equal(a.label.key, 'fr-urban-rules.alignment.carriageway');
    // Away from the plot, square to the road: (sin θ, −cos θ).
    const away = { x: Math.sin(theta), y: -Math.cos(theta) };
    for (const q of a.line) {
      const offset = (q.easting - r0.easting) * away.x + (q.northing - r0.northing) * away.y;
      assert.ok(Math.abs(offset - 3) < 1e-6, `${offset}`);
    }
  });
}

/** Inside or on a ring, within a millimetre. */
function onOrInside(q, ring) {
  const near = ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((q.easting - a.easting) * dx + (q.northing - a.northing) * dy) / (dx * dx + dy * dy)
      )
    );
    return Math.hypot(a.easting + t * dx - q.easting, a.northing + t * dy - q.northing) < 0.001;
  });
  if (near) return true;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.northing > q.northing !== b.northing > q.northing &&
      q.easting <
        ((b.easting - a.easting) * (q.northing - a.northing)) / (b.northing - a.northing) +
          a.easting
    )
      inside = !inside;
  }
  return inside;
}

for (const [name, ring] of [
  ['a right triangle', [p(0, 0), p(30, 0), p(0, 20)]],
  ['an L-shape', [p(0, 0), p(20, 0), p(20, 10), p(10, 10), p(10, 20), p(0, 20)]]
]) {
  test(`002.1b review B2: on ${name}, every band is clipped to the Site boundary`, async () => {
    const report = await read(rnuReader({ boundary: ring, roadAnswer: [] }));
    const bands = report.features.filter((f) => f.category === 'setback-band');
    assert.ok(bands.length >= ring.length);
    for (const band of bands) {
      for (const q of band.line) assert.ok(onOrInside(q, ring), `${band.id} ${JSON.stringify(q)}`);
      const mid = p(
        (band.line[0].easting + band.line[1].easting) / 2,
        (band.line[0].northing + band.line[1].northing) / 2
      );
      assert.ok(onOrInside(mid, ring), `${band.id} middle`);
    }
    assert.ok(report.assumptions.some((x) => x.id === 'bands-approximate'));
  });
}

test('002.1b review: a superseded read never leaves its context behind', async () => {
  let release;
  let calls = 0;
  const { site, conversions, answers } = plots.brouennes;
  const boundarySite = { ...site, boundary: { ring: BOX } };
  const service = recordedSiteService(boundarySite, conversions);
  const reader = createReader({
    fetch: recordedFetch(answers).fetch,
    site: () => service,
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    mapFeatures: () => ({
      queryFeatures: (kind) => {
        if (kind !== 'parcel') return Promise.resolve([]);
        calls += 1;
        return calls === 1
          ? new Promise((resolve) => (release = () => resolve([parcel('OLD', -10, -40, 30, -20)])))
          : Promise.resolve([parcel('NEW', -10, -40, 30, -12)]);
      }
    })
  });
  const first = reader.read(requestFor(boundarySite), { signal: signal() });
  while (release === undefined) await new Promise((r) => setTimeout(r, 1));
  const second = await reader.read(requestFor(boundarySite), { signal: signal() });
  release();
  await assert.rejects(first, { name: 'AbortError' });
  assert.ok(alignment(second).line.every((q) => Math.abs(q.northing + 12) < 1e-9));
  const third = await reader.read(requestFor(boundarySite, 'design'), { signal: signal() });
  assert.ok(
    alignment(third).line.every((q) => Math.abs(q.northing + 12) < 1e-9),
    'the old answer did not overwrite'
  );
});

test('002.1b review: the main building also listed as a Building entity is checked and shown once', async () => {
  const mainEntity = { id: 'building-main', type: 'Building', property: () => undefined };
  const report = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      measured: mixed(),
      buildings: [mainEntity],
      features: {
        building: [
          {
            id: 'N',
            kind: 'building',
            label: 'N',
            rings: rect(0, 40, 5, 45),
            properties: {},
            attribution: '©',
            height: { roofMetres: 6, basis: 'measured' }
          }
        ]
      }
    })
  );
  const r16 = report.checks.filter((c) => c.ruleId === 'rnu:R.111-16');
  assert.equal(new Set(r16.map((c) => c.id)).size, r16.length);
  assert.equal(r16.length, 1);
  const rows = view(report, 'checks').blocks.find((b) => b.kind === 'fields').rows;
  assert.equal(
    rows.filter(
      (r) =>
        r.label.key === 'fr-urban-rules.field.mainBuildingHeight' ||
        r.label.key === 'fr-urban-rules.field.buildingHeight'
    ).length,
    1
  );
});

test('002.1b review: within 5 cm two buildings are contiguous (no R.111-15 check), the tolerance said', async () => {
  const measured = mixed({ building: 'annex-2.5' });
  const distances = measured.distances;
  measured.distances = (input) => {
    const answer = distances(input);
    if (input.targets.some((t) => t.kind === 'building'))
      for (const t of answer.targets) t.nearest.distance = 0.04;
    return answer;
  };
  const report = await read(
    rnuReader({ boundary: BOX, roadAnswer: SOUTH_ROAD, measured, buildings: [annexEntity] })
  );
  assert.equal(
    report.checks.some((c) => c.ruleId === 'rnu:R.111-15'),
    false
  );
  const far = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      measured: mixed({ building: 'annex-3.5' }),
      buildings: [annexEntity]
    })
  );
  assert.ok(
    far.checks
      .find((c) => c.ruleId === 'rnu:R.111-15')
      .assumptionIds.includes('contiguous-tolerance')
  );
  assert.ok(far.assumptions.some((x) => x.id === 'contiguous-tolerance'));
});

test('002.1b review: light structures are left out of the neighbours’ average, and counted', async () => {
  const b = (id, height, extra = {}) => ({
    id,
    kind: 'building',
    label: id,
    rings: rect(0, 35, 5, 40),
    properties: {},
    attribution: '©',
    height: { roofMetres: height, basis: 'measured' },
    ...extra
  });
  const report = await read(
    rnuReader({
      boundary: BOX,
      roadAnswer: SOUTH_ROAD,
      features: { building: [b('A', 8), b('SHED', 2, { lightweight: true })] }
    })
  );
  const average = view(report, 'checks').blocks.find((x) => x.kind === 'fields').rows[0];
  assert.deepEqual(average.value, { value: 8, unit: 'm' });
  assert.equal(average.detail.params.lightweight, 1);
});

test('002.1b review: no source serving buildings is said, not read as none', async () => {
  const { site, conversions, answers } = plots.brouennes;
  const boundarySite = { ...site, boundary: { ring: BOX } };
  const reader = createReader({
    fetch: recordedFetch(answers).fetch,
    site: () => recordedSiteService(boundarySite, conversions),
    roads: () => ({ queryRoads: async () => [] }),
    mapFeatures: () => ({ listFeatureSources: () => [], queryFeatures: async () => [] })
  });
  const report = await reader.read(requestFor(boundarySite), { signal: signal() });
  assert.ok(
    view(report, 'checks').blocks.some(
      (x) => x.kind === 'notice' && x.text.key === 'fr-urban-rules.notice.neighboursNoSource'
    )
  );
});

// ── Sprint 002.8 DEC-7: the parked variations' checks, by the read's own pipeline ──

/**
 * An acceptance read (002.4 DEC-2), replays only, its reader kept open. The
 * Site service is the replay, except that a measure asked with `variationId`
 * equal to `alias` is answered as the open variation's (asked without one) —
 * so the variation path can be compared with the read's own on one design.
 */
async function acceptanceReader(plot, { alias, spy } = {}) {
  const captured = await loadAcceptance(plot);
  const replayed = replayService(captured.siteCalls, { name: 'site' });
  const strip = (input = {}) => {
    if (alias === undefined || input.variationId !== alias) return input;
    const { variationId, ...rest } = input;
    return rest;
  };
  const measures = {};
  for (const name of Object.keys(replayed.measures ?? {})) {
    measures[name] = (...args) => {
      spy?.(name, args[0]);
      if (args.length === 0) return replayed.measures[name]();
      const input = strip(args[0]);
      // `projection({ variationId })` stripped is `{}`; the read asked `projection()`.
      if (Object.keys(input).length === 0 && args[0]?.variationId !== undefined) {
        try {
          return replayed.measures[name](input);
        } catch {
          return replayed.measures[name]();
        }
      }
      return replayed.measures[name](input);
    };
  }
  const site = new Proxy(replayed, {
    get: (target, key) => (key === 'measures' ? measures : Reflect.get(target, key))
  });
  const documentService = replayService(captured.context.document, { name: 'document' });
  const reader = createReader({
    fetch: replayFetch(captured.answers),
    now: () => new Date(Date.UTC(2026, 9, 21, 9, 0)),
    site: () => site,
    roads: () => replayService(captured.context.roads, { name: 'roads' }),
    mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
    document: () => documentService,
    packageData: () => ({ read: () => captured.section ?? undefined })
  });
  const report = await reader.read(
    { site: captured.site, country: 'FR', reason: 'site' },
    { signal: signal(), progress: () => {} }
  );
  // The open Document's id and its `Building` entities, as the host lists them (096.11 RD-1).
  const variations = captured.siteCalls.find((c) => c.path === 'variations')?.result ?? [];
  const openId = variations.find((v) => v.open)?.id;
  const buildings = (captured.context.document ?? [])
    .filter((c) => c.path === 'find' && JSON.stringify(c.args) === '["Building"]')
    .flatMap((c) => c.result ?? [])
    .map((entity, index) => {
      const name = (captured.context.document ?? []).find(
        (c) => c.path === `find(["Building"])[${index}].property` && JSON.stringify(c.args) === '["name"]'
      )?.result;
      return { id: entity.id, ...(name?.kind === 'string' ? { name: name.value } : {}) };
    });
  return { captured, reader, report, openId, buildings };
}

test('002.8 criterion 10: on every plot, the variation path over the open design gives the report’s own checks (the refactor holds)', async () => {
  let compared = 0;
  for (const plot of PLOTS) {
    const probe = await acceptanceReader(plot);
    const alias = probe.openId ?? 'open-variation';
    probe.reader.dispose();
    const context = await acceptanceReader(plot, { alias });
    const { checks } = await context.reader.checkVariation(
      {
        site: context.captured.site,
        country: 'FR',
        variationId: alias,
        report: context.report,
        buildings: context.buildings
      },
      { signal: signal() }
    );
    assert.deepEqual(checks, context.report.checks, `${plot}: ${context.report.checks.length} checks`);
    compared += checks.length;
    context.reader.dispose();
  }
  // Lyon 2, Gordes 2, Brouennes 3, Mouzay 5: the comparison is not of empty lists.
  assert.ok(compared >= 12, `${compared} checks compared`);
});

test('002.8 criterion 10: Brouennes, a second variation parked — the open design 1 potential issue (R.111-17), the parked one 0, with the same rules checked', async (t) => {
  const context = await acceptanceReader('brouennes');
  const parked = context.captured.variations;
  if (parked === undefined || parked.length === 0) {
    t.skip('Brouennes’ capture holds no parked variation yet (variations.json)');
    context.reader.dispose();
    return;
  }
  const issues = (checks) => checks.filter((c) => c.result === 'potential_issue');
  assert.equal(issues(context.report.checks).length, 1, 'the open design');
  assert.equal(issues(context.report.checks)[0].ruleId, 'rnu:R.111-17');
  for (const recorded of parked) {
    assert.equal(recorded.error, undefined, recorded.error);
    const { checks } = await context.reader.checkVariation(
      {
        site: context.captured.site,
        country: 'FR',
        variationId: recorded.variationId,
        report: context.report,
        buildings: recorded.buildings
      },
      { signal: signal() }
    );
    assert.deepEqual(checks, recorded.checks, 'as the editor answered it during the capture');
    assert.equal(issues(checks).length, 0, 'the parked variation');
    // The same rules are checked: every check names a rule of the report, and the
    // rules checked in one are checked in the other.
    const rulesOf = (list) => [...new Set(list.map((c) => c.ruleId))].sort();
    assert.deepEqual(rulesOf(checks), rulesOf(context.report.checks));
    for (const check of checks) {
      for (const id of check.assumptionIds ?? []) {
        assert.ok(context.report.assumptions.some((a) => a.id === id), `${id} is the report’s`);
      }
    }
  }
  context.reader.dispose();
});

test('002.8 criterion 11: checkVariation throws with no read of the Site, for another document version or a rule it did not read, and on an aborted signal', async () => {
  const context = await acceptanceReader('lyon', { alias: 'parked' });
  const request = {
    site: context.captured.site,
    country: 'FR',
    variationId: 'parked',
    report: context.report,
    buildings: []
  };
  const fresh = createReader({ fetch: async () => undefined, site: () => undefined });
  await assert.rejects(() => fresh.checkVariation(request, { signal: signal() }), /no read of this Site/);
  fresh.dispose();
  const otherVersion = structuredClone(context.report);
  otherVersion.document.version = '200046977_PLUI_20990101';
  await assert.rejects(
    () => context.reader.checkVariation({ ...request, report: otherVersion }, { signal: signal() }),
    /no read of this Site/
  );
  const otherRule = structuredClone(context.report);
  otherRule.rules.push({ ...otherRule.rules[0], id: 'entered:never-read' });
  await assert.rejects(
    () => context.reader.checkVariation({ ...request, report: otherRule }, { signal: signal() }),
    /no read of this Site/
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(() => context.reader.checkVariation(request, { signal: aborted.signal }));
  context.reader.dispose();
  // Read no more: it reads no network and starts no read of its own.
  assert.equal(context.report.checks.length > 0, true);
});

test('002.8 criterion 11: aborted while measuring, checkVariation stops at the next building or step', async () => {
  const controller = new AbortController();
  let measured = 0;
  let afterAbort = 0;
  const context = await acceptanceReader('brouennes', {
    alias: 'parked',
    spy: (name, input) => {
      if (input?.variationId !== 'parked') return;
      measured += 1;
      if (controller.signal.aborted) afterAbort += 1;
      // The first measure of the variation aborts the call.
      controller.abort();
    }
  });
  await assert.rejects(() =>
    context.reader.checkVariation(
      {
        site: context.captured.site,
        country: 'FR',
        variationId: 'parked',
        report: context.report,
        buildings: []
      },
      { signal: controller.signal }
    )
  );
  assert.ok(measured >= 1);
  // Only the step under way when the signal came (one building's own measures) finishes.
  assert.ok(afterAbort <= 2, `${afterAbort} measures after the abort`);
  context.reader.dispose();
});
