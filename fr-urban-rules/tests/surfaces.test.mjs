/**
 * Surfaces and capacity (Sprint 002.3): the emprise au sol composed under a
 * named definition, the footprint budget, pleine terre, the surface de
 * plancher with its deductions, the extension caps, the capacity estimate, the
 * procedure flags, the answers keyed by variation, the programme enricher and
 * `urban-rules`' retirement. No network: 002.0's recordings, a section store
 * that records every write, and the host's measures stubbed — the shapes of
 * SDK 1.27's `plotCoverage`, `floorAreas` and `projection`.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { __testing, createReader } from '../src/index.js';
import {
  FIXTURES,
  answering,
  loadPlot,
  recordedFetch,
  recordedSiteService,
  requestFor
} from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const plots = {};
before(async () => {
  for (const plot of ['lyon', 'gordes', 'mouzay']) plots[plot] = await loadPlot(plot);
});

const signal = () => new AbortController().signal;

/** A coverage level: the union's figures and the per-building rows. */
const level = (covered, buildings = [], extra = {}) => ({
  buildings,
  covered,
  coveredWithoutLightweight: extra.withoutLightweight ?? covered,
  unbuilt: extra.unbuilt ?? 1000 - covered
});

/**
 * Measures: `coverage` is `plotCoverage()`'s answer; `floors` maps a building
 * id (`main` for the main one) to its storeys; `buildings` the projections
 * (`main` first), each `{ top }`.
 */
function measures({ coverage, floors = {}, projections = { 'building-main': { top: 6 } } }) {
  const ids = Object.keys(projections);
  const calls = { floorAreas: [] };
  return {
    calls,
    plotCoverage: () => ({ available: true, ...coverage }),
    projection: (input = {}) => {
      const id = input.buildingId ?? ids[0];
      const b = projections[id];
      if (b === undefined) return { available: false, reason: 'unknown-building' };
      return {
        available: true,
        buildingId: id,
        ground: { polygons: [], area: 1 },
        storeys: { polygons: [], area: 1 },
        withRoofOverhangs: { polygons: [], area: 1 },
        increments: {},
        roofs: [],
        notModelled: ['balcony', 'terrace', 'post', 'canopy'],
        height: {
          frame: 'datum',
          groundAtFoot: { min: 0, max: 0 },
          top: b.top,
          topAboveGround: { fromLowest: b.top, fromHighest: b.top },
          notModelled: []
        }
      };
    },
    floorAreas: (input = {}) => {
      calls.floorAreas.push(input);
      const id = input.buildingId ?? 'main';
      const storeys = floors[id];
      if (storeys === undefined) return { available: false, reason: 'no-rooms' };
      return {
        available: true,
        buildingId: input.buildingId ?? ids[0],
        heightBands: input.heightBands,
        storeys,
        notModelled: ['stair', 'shaft', 'floor-opening', 'room-use', 'parking']
      };
    },
    distances: (input) => ({
      available: true,
      buildingId: input.buildingId ?? ids[0],
      targets: input.targets.map((t) => ({
        target: t,
        nearest: {
          building: { easting: 0, northing: 0 },
          target: { easting: 0, northing: 1 },
          distance: 10
        }
      }))
    })
  };
}

/** One storey: `area` inside the external walls, `low` m² under 1.80 m, rooms `{ id, area, low }`. */
function storey(levelId, area, { low = 0, uncovered, rooms = [], headroom } = {}) {
  const bands = (lowArea, total) => [
    { from: 0, to: 1.8005, area: lowArea },
    { from: 1.8005, area: total - lowArea }
  ];
  return {
    levelId,
    rooms: rooms.map((r) => ({
      roomId: r.id,
      levelId,
      name: r.name,
      netArea: r.area,
      headroom: {
        covered: true,
        clearHeight: { min: 2.5, max: 2.5 },
        method: 'exact',
        bands: bands(r.low ?? 0, r.area)
      }
    })),
    insideExternalWalls: {
      area,
      enclosures: 1,
      headroom: headroom ?? {
        covered: true,
        clearHeight: { min: 1.2, max: 2.5 },
        method: 'exact',
        bands: bands(low, area),
        ...(uncovered === undefined ? {} : { uncoveredArea: uncovered })
      }
    }
  };
}

function store(initial, { write } = {}) {
  let held = initial;
  const writes = [];
  return {
    writes,
    held: () => held,
    set: (value) => (held = value),
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next, label, expected) => {
        writes.push({ next: structuredClone(next), label, expected });
        if (write !== undefined) return write(next);
        held = structuredClone(next);
        return true;
      }
    }
  };
}

function surfacesReader(
  plot,
  {
    measured,
    section,
    site: siteOverride = {},
    buildings = [],
    variations = [],
    ai,
    overrides = {}
  } = {}
) {
  const { site: recorded, conversions, answers } = plots[plot];
  const site = { ...recorded, ...siteOverride };
  const service = {
    ...recordedSiteService(site, conversions, measured === undefined ? {} : { measures: measured }),
    variations: () => variations
  };
  const data = section ?? store(undefined);
  const reader = createReader({
    fetch: recordedFetch(answers, overrides).fetch,
    site: () => service,
    roads: () => ({ queryRoads: async () => [] }),
    packageData: () => data.service,
    document: () => ({ find: (type) => (type === 'Building' ? buildings : []) }),
    ai: () => ai,
    translate: (key) => `label:${key}`
  });
  return { reader, site, data, service };
}

const read = (context) => context.reader.read(requestFor(context.site), { signal: signal() });
const act = (context, actionId, values, target) =>
  context.reader.runAction(
    { actionId, ...(target === undefined ? {} : { target }), values, site: context.site },
    { signal: signal() }
  );
/**
 * 002.15: the Surfaces view is composed of folds, so its blocks are read **flattened** — a
 * `section`'s blocks come in place of the section — and every assertion below about what the view
 * says keeps asking the same question of the same blocks, wherever they now sit.
 */
const flatten = (blocks) => blocks.flatMap((b) => (b.kind === 'section' ? flatten(b.blocks) : [b]));
const surfaces = (report) => {
  const view = report.views.find((v) => v.id === 'surfaces');
  return { ...view, blocks: flatten(view.blocks), top: view.blocks };
};
const rowsOf = (report) =>
  surfaces(report)
    .blocks.filter((b) => b.kind === 'fields')
    .flatMap((b) => b.rows);
const row = (report, key) => rowsOf(report).find((r) => r.label.key === key);
/** 002.15: the definition's cards (r420-1, lexicon, all-overhangs) and the headline figure. */
const cardOf = (report, value) =>
  surfaces(report)
    .blocks.find((b) => b.kind === 'choice')
    .options.find((o) => o.value === value);
const headline = (report) => surfaces(report).blocks.find((b) => b.kind === 'stat');
const sdpTable = (report) =>
  surfaces(report).blocks.find(
    (b) => b.kind === 'table' && b.rows.some((r) => r[0].key === 'fr-urban-rules.surfaces.sdp.base')
  );
const sdpLine = (report, n) =>
  sdpTable(report).rows.find((r) => r[0].key === `fr-urban-rules.surfaces.sdp.line${n}`)[2];
const sdpTotal = (report) => sdpTable(report).rows.at(-1);
const ruleActions = (report) =>
  report.views
    .find((v) => v.id === 'rules')
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions);
const addTarget = (report, id) => ruleActions(report).find((a) => a.id === id).target;

/** 096.0a's criterion: 150 m² at `storeys`, 159 m² with the eaves. */
const HOUSE = {
  plotArea: 1000,
  levels: {
    ground: level(140, [{ buildingId: 'building-main', area: 140 }]),
    storeys: level(150, [{ buildingId: 'building-main', area: 150 }]),
    withRoofOverhangs: level(159, [{ buildingId: 'building-main', area: 159 }])
  },
  existing: { area: 0, lightweightArea: 0 },
  notModelled: ['terrace', 'pool', 'paving']
};

const balconies = (area, key = 'open') => ({
  schema: 1,
  emprise: { balconies: { [key]: { main: area } } }
});

// ── DEC-1: the emprise au sol ──────────────────────────────────────────────────

test('criterion 1: R.420-1 is 150 m² (balconies not modelled, overhangs unsupported), all overhangs 159 m²; with 6.4 m² of balconies 156.4 and 165.4', async () => {
  const plain = await read(surfacesReader('lyon', { measured: measures({ coverage: HOUSE }) }));
  assert.deepEqual(row(plain, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 150,
    unit: 'm2'
  });
  assert.deepEqual(cardOf(plain, 'r420-1').figure, { value: 150, unit: 'm2' });
  assert.deepEqual(cardOf(plain, 'all-overhangs').figure, { value: 159, unit: 'm2' });
  const said = surfaces(plain).blocks.find((b) => b.kind === 'assumptions').ids;
  assert.ok(said.includes('balconies-not-modelled'));
  assert.ok(said.includes('overhangs-unsupported'));
  assert.ok(plain.assumptions.some((a) => a.id === 'overhangs-unsupported'));

  const entered = await read(
    surfacesReader('lyon', {
      measured: measures({ coverage: HOUSE }),
      section: store(balconies(6.4))
    })
  );
  assert.deepEqual(row(entered, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 156.4,
    unit: 'm2'
  });
  assert.deepEqual(cardOf(entered, 'r420-1').figure, { value: 156.4, unit: 'm2' });
  assert.deepEqual(cardOf(entered, 'all-overhangs').figure, { value: 165.4, unit: 'm2' });
  assert.ok(
    surfaces(entered)
      .blocks.find((b) => b.kind === 'assumptions')
      .ids.includes('balconies-entered')
  );
});

test('criterion 2: the PLU’s lexicon with balconies off gives 150 m², reads « lexique du PLU, p. 12 », and the choice is one Request', async () => {
  const section = store(balconies(6.4));
  const context = surfacesReader('lyon', { measured: measures({ coverage: HOUSE }), section });
  await read(context);
  const done = await act(context, 'emprise-definition', {
    definition: 'lexicon',
    upperStoreys: 'yes',
    roofOverhangs: 'no',
    balconies: 'no',
    lightweight: 'yes',
    page: 12
  });
  assert.deepEqual(done, { status: 'done' });
  assert.equal(section.writes.length, 1);
  assert.equal(section.writes[0].label, 'label:fr-urban-rules.undo.surfaces');
  assert.deepEqual(section.writes[0].expected, balconies(6.4));
  assert.equal(section.held().emprise.balconies.open.main, 6.4, 'the balconies entered are kept');
  const report = await read(context);
  const figure = row(report, 'fr-urban-rules.surfaces.emprise.lexiconPage');
  assert.deepEqual(figure.label.params, { page: 12 });
  assert.deepEqual(figure.value, { value: 150, unit: 'm2' });
});

/** Lyon's mockup (Screen 3b): two buildings of 152.0 and 21.0 m², 1 178 m² measured. */
const LYON = {
  plotArea: 1178,
  boundaryArea: 1160,
  levels: {
    ground: level(173, [], { unbuilt: 1005 }),
    storeys: level(
      173,
      [
        { buildingId: 'building-main', area: 152 },
        { buildingId: 'b-annex', area: 21 }
      ],
      { unbuilt: 1005 }
    ),
    withRoofOverhangs: level(181, [], { unbuilt: 997 })
  },
  existing: { area: 0, lightweightArea: 0 },
  notModelled: ['terrace', 'pool', 'paving']
};
const annexEntity = {
  id: 'b-annex',
  type: 'Building',
  property: () => ({ kind: 'string', value: 'Annexe' })
};

test('criterion 3: Lyon’s figures — 152.0 + 21.0 m² listed, 6.4 m² of balconies, 179.4 m², 15 % of 1 178 m², 1 185 m² cadastral beside it', async () => {
  const options = {
    measured: measures({
      coverage: LYON,
      projections: { 'building-main': { top: 9 }, 'b-annex': { top: 3 } }
    }),
    site: { plotArea: 1178 },
    buildings: [annexEntity]
  };
  const without = await read(surfacesReader('lyon', options));
  assert.deepEqual(row(without, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 173,
    unit: 'm2'
  });
  assert.equal(
    row(without, 'fr-urban-rules.surfaces.emprise.r420').detail.key,
    'fr-urban-rules.surfaces.emprise.detailNoBalconies'
  );
  const report = await read(surfacesReader('lyon', { ...options, section: store(balconies(6.4)) }));
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 179.4,
    unit: 'm2'
  });
  // 002.15: the share of the plot is the headline figure, its detail the two areas.
  assert.deepEqual(headline(report).value, { value: 15.2, unit: 'percent' });
  assert.deepEqual(headline(report).detail, {
    key: 'fr-urban-rules.surfaces.stat.of',
    params: { area: 179.4, plot: 1178 }
  });
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.budget.plotArea').value, {
    value: 1178,
    unit: 'm2'
  });
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.budget.contenance').value, {
    value: 1185,
    unit: 'm2'
  });
  const table = surfaces(report).blocks.find(
    (b) => b.kind === 'table' && b.columns[0].key === 'fr-urban-rules.surfaces.column.building'
  );
  assert.deepEqual(
    table.rows.map((r) => [r[0].key ?? r[0].text, r[1].value]),
    [
      ['fr-urban-rules.check.subject.mainBuilding', 152],
      ['Annexe', 21]
    ]
  );
});

test('criterion 4 and 12: a confirmed CES of 40 % on 1 178 m² allows 471.2 m², 291.8 m² remaining for 179.4 m²; the plot area is the parcels’, never the boundary’s', async () => {
  const section = store(balconies(6.4));
  const context = surfacesReader('lyon', {
    measured: measures({ coverage: LYON }),
    site: { plotArea: 1178 },
    section,
    buildings: [annexEntity]
  });
  const first = await read(context);
  await act(
    context,
    'add-ratio',
    { kind: 'footprint_ratio', statement: 'limit', value: 40, source: 'Règlement' },
    addTarget(first, 'add-ratio')
  );
  const report = await read(context);
  // 002.15: the budget is the host's used / remaining / allowed bar; its figures are the meter's
  // (the remaining is allowed − used), and the rows that said them are not repeated beside it.
  const meter = surfaces(report).blocks.find((b) => b.kind === 'meter');
  assert.deepEqual(
    [meter.used, meter.allowed],
    [
      { value: 179.4, unit: 'm2' },
      { value: 471.2, unit: 'm2' }
    ]
  );
  assert.equal(Math.round((meter.allowed.value - meter.used.value) * 10) / 10, 291.8);
  assert.equal(row(report, 'fr-urban-rules.surfaces.budget.allowed'), undefined);
  // The headline's limit is the same rule's: 40 % of the plot, the verdict « no issue ».
  assert.deepEqual(headline(report).gauge.limit, { value: 40, unit: 'percent' });
  assert.deepEqual(headline(report).verdict, { result: 'no_issue' });
  // Criterion 12: the boundary's 1 160 m² is information only.
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.budget.boundaryArea').value, {
    value: 1160,
    unit: 'm2'
  });
  const rule = report.rules.find((r) => r.kind === 'footprint_ratio' && r.provenance === 'entered');
  const check = report.checks.find((c) => c.ruleId === rule.id);
  assert.deepEqual(
    [check.result, check.measured.value, check.limit.value],
    ['no_issue', 179.4, 471.2]
  );
  assert.equal(check.subject.kind, 'plot');
});

test('criterion 13: a refused roof — « projection, all overhangs » is not computed, with the reason; R.420-1 on storeys still given', async () => {
  const coverage = {
    ...HOUSE,
    levels: { ...HOUSE.levels, withRoofOverhangs: { refused: 'roof-refused' } }
  };
  const report = await read(surfacesReader('lyon', { measured: measures({ coverage }) }));
  // 002.15: the card says « not computed » and its detail says why.
  assert.deepEqual(cardOf(report, 'all-overhangs').figure, {
    key: 'fr-urban-rules.surfaces.card.notComputed'
  });
  assert.deepEqual(cardOf(report, 'all-overhangs').detail, {
    key: 'fr-urban-rules.surfaces.emprise.roofRefused'
  });
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 150,
    unit: 'm2'
  });
});

test('criterion 11: an extended existing building of 24 m², 8.6 m² of it under a new 60 m² building — the total is the union’s 75.4 m², not 84 m²; a replaced one adds nothing', async () => {
  const union = {
    plotArea: 600,
    levels: {
      ground: level(75.4, [{ buildingId: 'building-main', area: 60 }]),
      storeys: level(75.4, [{ buildingId: 'building-main', area: 60 }]),
      withRoofOverhangs: level(75.4, [{ buildingId: 'building-main', area: 60 }])
    },
    existing: { area: 24, lightweightArea: 0 },
    notModelled: []
  };
  const part = {
    sourceId: 's',
    featureId: 'x',
    label: 'Maison',
    rings: [],
    properties: {},
    attribution: '©'
  };
  const extended = await read(
    surfacesReader('lyon', {
      measured: measures({ coverage: union }),
      site: { existingBuilding: { relation: 'extended', parts: [part] } }
    })
  );
  assert.deepEqual(row(extended, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 75.4,
    unit: 'm2'
  });
  const replacedCoverage = {
    ...union,
    levels: { ground: level(60), storeys: level(60), withRoofOverhangs: level(60) }
  };
  const replaced = await read(
    surfacesReader('lyon', {
      measured: measures({ coverage: replacedCoverage }),
      site: { existingBuilding: { relation: 'replaced', parts: [part] } }
    })
  );
  assert.deepEqual(row(replaced, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 60,
    unit: 'm2'
  });
  assert.ok(replaced.assumptions.some((a) => a.id === 'existing-replaced'));
  assert.deepEqual(row(replaced, 'fr-urban-rules.surfaces.caps.existing').value, {
    key: 'fr-urban-rules.value.none'
  });
});

test('criterion 16: a footprint rule « not regulated » reads so, with the figures; one set aside (Does not apply) reads « no confirmed footprint rule »', async () => {
  const section = store(undefined);
  const context = surfacesReader('lyon', { measured: measures({ coverage: HOUSE }), section });
  const first = await read(context);
  await act(
    context,
    'add-ratio',
    { kind: 'footprint_ratio', statement: 'not_regulated', source: 'Règlement' },
    addTarget(first, 'add-ratio')
  );
  const report = await read(context);
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.budget.rule').value, {
    key: 'fr-urban-rules.surfaces.budget.notRegulated'
  });
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 150,
    unit: 'm2'
  });
  assert.equal(
    surfaces(report).blocks.some((b) => b.kind === 'meter'),
    false,
    'no allowance, no meter'
  );

  // A drawn 38 « 40 % » set aside with Does not apply.
  const drawn = {
    type: 'FeatureCollection',
    totalFeatures: 1,
    features: [
      {
        type: 'Feature',
        id: 'prescription_surf.ces',
        geometry: null,
        properties: {
          libelle: 'Emprise au sol maximale',
          txt: '40 %',
          typepsc: '38',
          stypepsc: '00',
          datvalid: '20260326'
        }
      }
    ]
  };
  const asideSection = store(undefined);
  const aside = surfacesReader('lyon', {
    measured: measures({ coverage: HOUSE }),
    section: asideSection,
    overrides: { 'apicarto-prescription-surf': answering(200, drawn) }
  });
  const before = await read(aside);
  const rule = before.rules.find((r) => r.kind === 'footprint_ratio');
  const notApplicable = ruleActions(before).find(
    (a) => a.id === 'not-applicable' && a.target.ruleId === rule.id
  );
  await act(aside, 'not-applicable', undefined, notApplicable.target);
  const after = await read(aside);
  assert.equal(after.rules.find((r) => r.id === rule.id).status, 'not_applicable');
  assert.deepEqual(row(after, 'fr-urban-rules.surfaces.budget.rule').value, {
    key: 'fr-urban-rules.surfaces.budget.noRule'
  });
});

test('DEC-2: pleine terre is the ground level’s unbuilt area against the confirmed green ratio, with its assumption', async () => {
  const section = store(undefined);
  const coverage = {
    ...LYON,
    levels: { ...LYON.levels, ground: level(173, [], { unbuilt: 300 }) }
  };
  const context = surfacesReader('lyon', {
    measured: measures({ coverage }),
    site: { plotArea: 1178 },
    section
  });
  const first = await read(context);
  await act(
    context,
    'add-ratio',
    { kind: 'green_ratio', statement: 'limit', value: 30, source: 'Règlement' },
    addTarget(first, 'add-ratio')
  );
  const report = await read(context);
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.green.unbuilt').value, {
    value: 300,
    unit: 'm2'
  });
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.green.required').value, {
    value: 353.4,
    unit: 'm2'
  });
  const rule = report.rules.find((r) => r.kind === 'green_ratio');
  const check = report.checks.find((c) => c.ruleId === rule.id);
  assert.equal(check.result, 'potential_issue');
  assert.ok(check.assumptionIds.includes('pleine-terre-unbuilt'));
});

// ── DEC-3: the surface de plancher ─────────────────────────────────────────────

/** 418.5 m² inside the walls, 14.4 m² under 1.80 m, an 18.9 m² garage with none of it low. */
const FLOORS = {
  main: [
    storey('level-0', 250, {
      rooms: [
        { id: 'garage', name: 'Garage', area: 18.9 },
        { id: 'living', name: 'Séjour', area: 120 }
      ]
    }),
    storey('level-1', 168.5, {
      low: 14.4,
      rooms: [{ id: 'attic', name: 'Combles', area: 30, low: 14.4 }]
    })
  ]
};

test('criterion 5: 418.5 − 9.6 (2°) − 18.9 (4°) − 14.4 (3°) = 375.6 m² once 2°, 4°–8° are answered; until then « answer needed » and an estimate', async () => {
  const measured = measures({ coverage: HOUSE, floors: FLOORS });
  const open = await read(surfacesReader('lyon', { measured }));
  assert.deepEqual(sdpLine(open, 2), { key: 'fr-urban-rules.surfaces.sdp.answerNeeded' });
  assert.deepEqual(sdpLine(open, 4), { key: 'fr-urban-rules.surfaces.sdp.answerNeeded' });
  assert.deepEqual(sdpLine(open, 3), { value: 14.4, unit: 'm2' });
  assert.deepEqual(sdpLine(open, 1), { key: 'fr-urban-rules.surfaces.sdp.notDeducted' });
  assert.deepEqual(sdpTotal(open)[0], {
    key: 'fr-urban-rules.surfaces.sdp.totalEstimate',
    params: { count: 6 }
  });
  assert.deepEqual(measured.calls.floorAreas[0].heightBands, [1.8005]);

  const section = store(undefined);
  const context = surfacesReader('lyon', { measured, section });
  await read(context);
  await act(context, 'sdp-void', { storey: 'level-1', area: 9.6 });
  await act(context, 'sdp-room', { deduction: 'parking', room: 'garage', answer: 'yes' });
  for (const n of ['5', '6', '7', '8'])
    await act(context, 'sdp-none', { deduction: n, answer: 'yes' });
  assert.equal(section.writes.length, 6, 'one Request per answer');
  const report = await read(context);
  assert.deepEqual(sdpLine(report, 2), { value: 9.6, unit: 'm2' });
  assert.deepEqual(sdpLine(report, 4), { value: 18.9, unit: 'm2' });
  assert.deepEqual(sdpTotal(report)[0], { key: 'fr-urban-rules.surfaces.sdp.total' });
  assert.deepEqual(sdpTotal(report)[2], { value: 375.6, unit: 'm2' });
});

test('DEC-3: a ticked room is deducted once — its part under 1.80 m leaves the 3° line first', async () => {
  const section = store({
    schema: 1,
    sdp: { open: { attics: ['attic'], none: ['2', '4', '6', '7', '8'] } }
  });
  const report = await read(
    surfacesReader('lyon', { measured: measures({ coverage: HOUSE, floors: FLOORS }), section })
  );
  assert.deepEqual(sdpLine(report, 5), { value: 30, unit: 'm2' });
  assert.deepEqual(sdpLine(report, 3), { value: 0, unit: 'm2' });
  assert.deepEqual(sdpTotal(report)[2], { value: 388.5, unit: 'm2' });
});

test('criterion 14: 3.2 m² of uncovered floor lowers the base by 3.2 m²; a refused headroom makes the total an estimate', async () => {
  const none = store({ schema: 1, sdp: { open: { none: ['2', '4', '5', '6', '7', '8'] } } });
  const plain = await read(
    surfacesReader('lyon', {
      measured: measures({ coverage: HOUSE, floors: { main: [storey('l0', 100)] } }),
      section: none
    })
  );
  const uncovered = await read(
    surfacesReader('lyon', {
      measured: measures({
        coverage: HOUSE,
        floors: { main: [storey('l0', 100, { uncovered: 3.2 })] }
      }),
      section: store(structuredClone(none.held()))
    })
  );
  assert.equal(
    Math.round((sdpTotal(plain)[2].value - sdpTotal(uncovered)[2].value) * 100) / 100,
    3.2
  );
  const refused = await read(
    surfacesReader('lyon', {
      measured: measures({
        coverage: HOUSE,
        floors: { main: [storey('l0', 100, { headroom: { refused: 'roof-refused' } })] }
      }),
      section: store(structuredClone(none.held()))
    })
  );
  assert.deepEqual(sdpTotal(refused)[0], {
    key: 'fr-urban-rules.surfaces.sdp.totalEstimate',
    params: { count: 0 }
  });
  assert.ok(
    surfaces(refused).blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.surfaces.sdp.estimateReason'
    )
  );
  // Sampled: the ± error is said.
  const sampled = await read(
    surfacesReader('lyon', {
      measured: measures({
        coverage: HOUSE,
        floors: {
          main: [
            storey('l0', 100, {
              headroom: {
                covered: true,
                clearHeight: { min: 1, max: 3 },
                method: 'sampled',
                step: 0.25,
                error: 0.4,
                bands: [
                  { from: 0, to: 1.8005, area: 12 },
                  { from: 1.8005, area: 88 }
                ]
              }
            })
          ]
        }
      }),
      section: store(structuredClone(none.held()))
    })
  );
  assert.ok(
    surfaces(sampled).blocks.some(
      (b) =>
        b.kind === 'notice' &&
        b.text.key === 'fr-urban-rules.surfaces.sdp.sampled' &&
        b.text.params.error === 0.4
    )
  );
});

test('criterion 15: parking ticked in variation A is not applied in B, and switching variations writes nothing', async () => {
  const section = store({ schema: 1, sdp: { 'doc-a': { parking: ['garage'] } } });
  const measured = measures({ coverage: HOUSE, floors: FLOORS });
  const a = await read(
    surfacesReader('lyon', {
      measured,
      section,
      variations: [
        { id: 'doc-a', name: 'A', master: true, open: true },
        { id: 'doc-b', name: 'B', master: false, open: false }
      ]
    })
  );
  assert.deepEqual(sdpLine(a, 4), { value: 18.9, unit: 'm2' });
  const b = await read(
    surfacesReader('lyon', {
      measured,
      section,
      variations: [
        { id: 'doc-a', name: 'A', master: true, open: false },
        { id: 'doc-b', name: 'B', master: false, open: true }
      ]
    })
  );
  assert.deepEqual(sdpLine(b, 4), { key: 'fr-urban-rules.surfaces.sdp.answerNeeded' });
  assert.equal(section.writes.length, 0);
});

test('DEC-3: answers kept under « open » before the variations are listed move under the id on the next write; a vanished room is ignored, never pruned', async () => {
  const section = store({
    schema: 1,
    sdp: { open: { parking: ['garage', 'gone'] }, 'doc-z': { parking: ['x'] } }
  });
  const context = surfacesReader('lyon', {
    measured: measures({ coverage: HOUSE, floors: FLOORS }),
    section,
    variations: [{ id: 'doc-a', name: 'A', master: true, open: true }]
  });
  const report = await read(context);
  assert.deepEqual(
    sdpLine(report, 4),
    { value: 18.9, unit: 'm2' },
    'read from « open », the vanished room ignored'
  );
  await act(context, 'sdp-none', { deduction: '5', answer: 'yes' });
  const held = section.held().sdp;
  assert.equal(held.open, undefined);
  assert.deepEqual(held['doc-a'].parking, ['garage', 'gone']);
  assert.deepEqual(held['doc-z'], { parking: ['x'] }, 'another variation’s answers are kept');
});

// ── DEC-4: extension caps ──────────────────────────────────────────────────────

test('criterion 6: zone A, existing 120 m², « ≤ 30 % » and « ≤ 50 m² » — planned 42 m²: the ratio’s check over by 6 m², the value’s no issue, 36 m² allowed by the ratio', async () => {
  const coverage = {
    plotArea: 5010,
    levels: {
      ground: level(162, [{ buildingId: 'building-main', area: 162 }]),
      storeys: level(162, [{ buildingId: 'building-main', area: 162 }]),
      withRoofOverhangs: level(170, [])
    },
    existing: { area: 120, lightweightArea: 0 },
    notModelled: []
  };
  const part = {
    sourceId: 's',
    featureId: 'x',
    label: 'Mas',
    rings: [],
    properties: {},
    attribution: '©'
  };
  const section = store(undefined);
  const context = surfacesReader('gordes', {
    measured: measures({ coverage }),
    section,
    site: { existingBuilding: { relation: 'extended', parts: [part] } }
  });
  const first = await read(context);
  await act(
    context,
    'add-ratio',
    { kind: 'extension_ratio', statement: 'limit', value: 30, source: 'Règlement PLU' },
    addTarget(first, 'add-ratio')
  );
  await act(
    context,
    'add-area',
    { kind: 'extension_area', statement: 'limit', value: 50, source: 'Règlement PLU' },
    addTarget(first, 'add-area')
  );
  const report = await read(context);
  const ratio = report.rules.find(
    (r) => r.label.key === 'fr-urban-rules.entered.kind.extension_ratio'
  );
  const value = report.rules.find(
    (r) => r.label.key === 'fr-urban-rules.entered.kind.extension_area'
  );
  assert.equal(ratio.kind, 'extension_max');
  assert.equal(value.kind, 'extension_max');
  const ratioCheck = report.checks.find((c) => c.ruleId === ratio.id);
  const valueCheck = report.checks.find((c) => c.ruleId === value.id);
  assert.deepEqual(
    [ratioCheck.result, ratioCheck.measured.value, ratioCheck.limit.value],
    ['potential_issue', 42, 36]
  );
  assert.deepEqual([valueCheck.result, valueCheck.limit.value], ['no_issue', 50]);
  const allowed = row(report, 'fr-urban-rules.surfaces.caps.allowed');
  assert.deepEqual(allowed.value, { value: 36, unit: 'm2' });
  // 002.4 acceptance fix: the governing rule's name is translated, not its key
  // (the walk read the raw key on Gordes). The stub's translate answers `label:<key>`.
  assert.deepEqual(allowed.detail.params, {
    rule: 'label:fr-urban-rules.entered.kind.extension_ratio'
  });
  assert.ok(ratioCheck.assumptionIds.includes('existing-as-modelled'));
});

test('DEC-4: a building marked an annex is checked against an annex cap; marking is one Request keyed by variation', async () => {
  const section = store(undefined);
  const context = surfacesReader('lyon', {
    measured: measures({
      coverage: LYON,
      projections: { 'building-main': { top: 9 }, 'b-annex': { top: 3 } }
    }),
    site: { plotArea: 1178 },
    section,
    buildings: [annexEntity],
    variations: [{ id: 'doc-a', name: 'A', master: true, open: true }]
  });
  const first = await read(context);
  await act(
    context,
    'add-area',
    { kind: 'annex_max', statement: 'limit', value: 20, source: 'Règlement' },
    addTarget(first, 'add-area')
  );
  const unmarked = await read(context);
  const rule = unmarked.rules.find((r) => r.kind === 'annex_max');
  assert.equal(unmarked.checks.find((c) => c.ruleId === rule.id).result, 'not_checked');
  await act(context, 'building-role', { building: 'b-annex', role: 'annex' });
  assert.deepEqual(section.held().roles, { 'doc-a': { extension: [], annex: ['b-annex'] } });
  const report = await read(context);
  const check = report.checks.find((c) => c.ruleId === rule.id);
  assert.deepEqual(
    [check.subject.id, check.result, check.measured.value],
    ['b-annex', 'potential_issue', 21]
  );
});

// ── DEC-5: the capacity ────────────────────────────────────────────────────────

test('DEC-5: the capacity is a range — the smaller of envelope and allowance times the storeys the façade and total heights allow — and says what is missing', async () => {
  const section = store(undefined);
  const context = surfacesReader('lyon', {
    measured: measures({ coverage: HOUSE }),
    site: { plotArea: 1000 },
    section
  });
  const first = await read(context);
  assert.equal(
    surfaces(first).blocks.find(
      (b) =>
        b.kind === 'notice' && b.text.key.startsWith('fr-urban-rules.surfaces.capacity.missing')
    ).text.key,
    'fr-urban-rules.surfaces.capacity.missingBoth'
  );
  await act(
    context,
    'add-ratio',
    { kind: 'footprint_ratio', statement: 'limit', value: 30, source: 'R' },
    addTarget(first, 'add-ratio')
  );
  await act(
    context,
    'add-distance',
    { kind: 'height_facade', statement: 'limit', value: 7, source: 'R' },
    addTarget(first, 'add-distance')
  );
  await act(
    context,
    'add-distance',
    { kind: 'height_total', statement: 'limit', value: 10, source: 'R' },
    addTarget(first, 'add-distance')
  );
  const report = await read(context);
  // 002.15: the range is a headline figure with a range gauge; « not a right to build » is its detail.
  const range = surfaces(report).blocks.find(
    (b) => b.kind === 'stat' && b.label.key === 'fr-urban-rules.surfaces.capacity.range'
  );
  // 300 m² allowed × 2 to 3 storeys at the default 3 m.
  assert.deepEqual(range.value.params, { low: 600, high: 900 });
  assert.deepEqual(range.gauge, { value: { value: 900, unit: 'm2' }, from: { value: 600, unit: 'm2' } });
  assert.equal(range.detail.key, 'fr-urban-rules.surfaces.capacity.notARight');
  assert.ok(report.assumptions.some((a) => a.id === 'floor-to-floor-default'));
});

// ── DEC-6: procedure flags ─────────────────────────────────────────────────────

const procedureRow = (report, key) => row(report, `fr-urban-rules.surfaces.procedure.${key}`);
const answeredAll = () => ({ schema: 1, sdp: { open: { none: ['2', '4', '5', '6', '7', '8'] } } });

test('step 1: R.420-1 and R.111-22 are quoted verbatim from the recorded version, and every LEGIARTI matches the record', async () => {
  const law = JSON.parse(
    await readFile(new URL('legi-articles.json', FIXTURES), 'utf8')
  ).sprint002_3;
  for (const article of ['R.420-1', 'R.111-22']) {
    assert.equal(__testing.ARTICLES[article].text, law.articles[article].text, article);
    assert.equal(__testing.ARTICLES[article].legiarti, law.articles[article].legiarti, article);
  }
  for (const [article, entry] of Object.entries(__testing.PROCEDURE_ARTICLES)) {
    assert.equal(entry.legiarti, law.articles[article].legiarti, article);
    assert.equal(entry.versionFrom, law.articles[article].versionFrom, article);
  }
  const report = await read(surfacesReader('lyon', { measured: measures({ coverage: HOUSE }) }));
  const quotes = surfaces(report).blocks.filter((b) => b.kind === 'quote');
  assert.deepEqual(
    quotes.map((q) => q.citation.article),
    ['R.420-1', 'R.111-22']
  );
  assert.equal(quotes[0].passage.text, law.articles['R.420-1'].text);
});

test('step 1: every procedure threshold carries its article, its LEGIARTI in force and the date it was read', () => {
  for (const [article, entry] of Object.entries(__testing.PROCEDURE_ARTICLES)) {
    assert.match(entry.legiarti, /^LEGIARTI\d{12}$/, article);
    assert.match(entry.versionFrom, /^\d{4}-\d{2}-\d{2}$/, article);
    assert.equal(entry.readOn, '2026-10-20', article);
  }
  assert.deepEqual(
    { ...__testing.PROCEDURE_THRESHOLDS },
    { tiny: 5, small: 20, height: 12, uZone: 40, architect: 150, architectEmpriseVerified: false }
  );
});

test('criterion 7: a 160 m² house needs an architect (R.431-2); 145 m² with 155 m² of emprise does not (a) counts the surface de plancher only); for works on an existing building it is « to verify »', async () => {
  const house = (sdp, emprise) => ({
    coverage: {
      ...HOUSE,
      levels: { ground: level(emprise), storeys: level(emprise), withRoofOverhangs: level(emprise) }
    },
    floors: { main: [storey('l0', sdp)] }
  });
  const big = await read(
    surfacesReader('lyon', { measured: measures(house(160, 120)), section: store(answeredAll()) })
  );
  assert.deepEqual(procedureRow(big, 'likely').value, {
    key: 'fr-urban-rules.surfaces.procedure.permit'
  });
  assert.deepEqual(procedureRow(big, 'architect').value, {
    key: 'fr-urban-rules.surfaces.procedure.architectRequired'
  });
  assert.equal(procedureRow(big, 'architect').detail.params.article, 'R.431-2');
  const wide = await read(
    surfacesReader('lyon', { measured: measures(house(145, 155)), section: store(answeredAll()) })
  );
  assert.deepEqual(procedureRow(wide, 'architect').value, {
    key: 'fr-urban-rules.surfaces.procedure.architectNotRequired'
  });
  const part = {
    sourceId: 's',
    featureId: 'x',
    label: 'Maison',
    rings: [],
    properties: {},
    attribution: '©'
  };
  const works = house(145, 155);
  works.coverage.existing = { area: 100, lightweightArea: 0 };
  const extended = await read(
    surfacesReader('lyon', {
      measured: measures(works),
      section: store(answeredAll()),
      site: { existingBuilding: { relation: 'extended', parts: [part] } }
    })
  );
  assert.deepEqual(procedureRow(extended, 'architect').value, {
    key: 'fr-urban-rules.surfaces.procedure.toVerify'
  });
});

test('criterion 8: a 35 m² extension of a 90 m² house (125 m² in all) flags a declaration in a PLU’s U zone, a permit under a carte communale', async () => {
  const part = {
    sourceId: 's',
    featureId: 'x',
    label: 'Maison',
    rings: [],
    properties: {},
    attribution: '©'
  };
  const ext = {
    id: 'b-ext',
    type: 'Building',
    property: () => ({ kind: 'string', value: 'Extension' })
  };
  const setup = (plot) => {
    const section = store({
      ...answeredAll(),
      roles: { open: { extension: ['b-ext'], annex: [] } }
    });
    return surfacesReader(plot, {
      measured: measures({
        coverage: {
          ...HOUSE,
          levels: {
            ground: level(125),
            storeys: level(125, [
              { buildingId: 'building-main', area: 90 },
              { buildingId: 'b-ext', area: 35 }
            ]),
            withRoofOverhangs: level(130)
          },
          existing: { area: 90, lightweightArea: 0 }
        },
        floors: { main: [storey('l0', 90)], 'b-ext': [storey('e0', 35)] },
        projections: { 'building-main': { top: 6 }, 'b-ext': { top: 3.5 } }
      }),
      section,
      buildings: [ext],
      site: { existingBuilding: { relation: 'extended', parts: [part] } }
    });
  };
  const lyon = await read(setup('lyon'));
  assert.deepEqual(procedureRow(lyon, 'likely').value, {
    key: 'fr-urban-rules.surfaces.procedure.declaration'
  });
  assert.equal(procedureRow(lyon, 'likely').detail.params.article, 'R.421-17');
  const mouzay = await read(setup('mouzay'));
  assert.equal(mouzay.regime.code, 'cc');
  assert.deepEqual(procedureRow(mouzay, 'likely').value, {
    key: 'fr-urban-rules.surfaces.procedure.permit'
  });
  assert.equal(procedureRow(mouzay, 'likely').detail.params.article, 'R.421-14');
});

test('DEC-6: missing surface de plancher answers make the flags « indicative, surface de plancher incomplete »', async () => {
  const report = await read(
    surfacesReader('lyon', {
      measured: measures({ coverage: HOUSE, floors: { main: [storey('l0', 160)] } })
    })
  );
  assert.equal(
    procedureRow(report, 'likely').detail.key,
    'fr-urban-rules.surfaces.procedure.incomplete'
  );
});

// ── DEC-7: the programme enricher ──────────────────────────────────────────────

const frenchSite = (overrides = {}) => ({
  current: () => ({
    country: 'FR',
    parcels: [],
    anchor: { latitude: 45, longitude: 4 },
    ...overrides
  })
});
const programme = (fields = {}) =>
  Object.freeze({
    kind: 'space-programme',
    storeys: 2,
    totalArea: 600,
    spaces: Object.freeze([]),
    assumptions: Object.freeze([]),
    warnings: Object.freeze([]),
    ...fields
  });
const facts = (overrides = {}) => ({
  plotArea: 1000,
  allowed: 300,
  ces: 30,
  notRegulated: false,
  heights: [{ value: 10, rule: { kind: 'height_total' } }],
  storeysAllowed: 3,
  floorToFloor: { value: 3, assumed: true },
  capacity: { low: 600, high: 900 },
  anyConfirmed: true,
  ...overrides
});
const stage = (read, site = frenchSite()) =>
  __testing.createProgrammeStage({
    facts: () => read,
    site: () => site,
    translate: (key, params) => `${key}:${JSON.stringify(params ?? {})}`
  });

test('criterion 9: the enricher warns past the capacity’s upper bound, with its source; says « no confirmed rule » with none; never mutates; is synchronous', () => {
  const provider = stage(facts());
  assert.equal(provider.id, 'fr-urban-rules.programme');
  assert.equal(provider.stage, 'programme');
  const input = programme({ totalArea: 950, storeys: 4 });
  const started = performance.now();
  const enriched = provider.enrich(input);
  assert.ok(performance.now() - started < 50);
  assert.equal(typeof enriched.then, 'undefined');
  assert.notEqual(enriched, input);
  assert.equal(input.warnings.length, 0, 'the input is untouched');
  assert.equal(enriched.warnings.length, 2);
  assert.match(enriched.warnings[0], /^fr-urban-rules\.programme\.overCapacity:.*"high":900/);
  assert.match(enriched.warnings[1], /^fr-urban-rules\.programme\.overStoreys:.*"allowed":3/);
  assert.ok(enriched.assumptions.some((a) => a.startsWith('fr-urban-rules.programme.capacity')));
  const within = stage(facts()).enrich(programme({ totalArea: 500, storeys: 2 }));
  assert.equal(within.warnings.length, 0);
  const none = stage(facts({ anyConfirmed: false })).enrich(programme());
  assert.deepEqual([...none.assumptions], ['fr-urban-rules.programme.noRule:{}']);
  assert.equal(none.warnings.length, 0);
});

test('criterion 9: no Site, a Site outside France, or an artefact that is not a programme — the input returned as it is', () => {
  const input = programme();
  assert.equal(stage(facts(), { current: () => undefined }).enrich(input), input);
  assert.equal(stage(facts(), frenchSite({ country: 'BE' })).enrich(input), input);
  const brief = { kind: 'architectural-brief' };
  assert.equal(stage(facts()).enrich(brief), brief);
});

test('criterion 17: with no report read for the plot the enricher says « Planning rules not read yet » and warns nothing', () => {
  const enriched = stage(undefined).enrich(programme({ totalArea: 5000 }));
  assert.deepEqual([...enriched.assumptions], ['fr-urban-rules.programme.notRead:{}']);
  assert.equal(enriched.warnings.length, 0);
});

test('criterion 17 and DEC-7: the reader’s figures come from the cached report — none before a read, the confirmed limits after it, synchronously', async () => {
  const section = store(undefined);
  const context = surfacesReader('lyon', {
    measured: measures({ coverage: HOUSE }),
    site: { plotArea: 1000 },
    section
  });
  assert.equal(context.reader.programme(context.site), undefined);
  const first = await read(context);
  assert.equal(context.reader.programme(context.site).anyConfirmed, false);
  await act(
    context,
    'add-ratio',
    { kind: 'footprint_ratio', statement: 'limit', value: 30, source: 'R' },
    addTarget(first, 'add-ratio')
  );
  await act(
    context,
    'add-distance',
    { kind: 'height_total', statement: 'limit', value: 9, source: 'R' },
    addTarget(first, 'add-distance')
  );
  const started = performance.now();
  const read2 = context.reader.programme(context.site);
  assert.ok(performance.now() - started < 50);
  assert.deepEqual(
    [read2.ces, read2.allowed, read2.storeysAllowed, read2.capacity.low, read2.capacity.high],
    [30, 300, 3, 900, 900]
  );
});

test('criterion 17 and DEC-8: while `urban-rules.programme` is registered the overview says it is replaced', async () => {
  const ai = { listPlanningStages: () => [{ id: 'urban-rules.programme', stage: 'programme' }] };
  const report = await read(
    surfacesReader('lyon', { measured: measures({ coverage: HOUSE }), ai })
  );
  assert.ok(
    report.overview.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.replacesUrbanRules'
    )
  );
  const alone = await read(
    surfacesReader('lyon', {
      measured: measures({ coverage: HOUSE }),
      ai: { listPlanningStages: () => [] }
    })
  );
  assert.equal(
    alone.overview.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.replacesUrbanRules'
    ),
    false
  );
});

// ── DEC-8: the retirement ──────────────────────────────────────────────────────

test('criterion 10: `urban-rules/` is gone from the repository', () => {
  assert.equal(existsSync(new URL('../../urban-rules/', import.meta.url)), false);
});

// ── The section stays readable without the extension, and within the host's limits ──

test('a Surfaces member in a shape not recognised makes the section read-only, never rewritten', async () => {
  const section = store({ schema: 1, sdp: ['not', 'an', 'object'] });
  const context = surfacesReader('lyon', { measured: measures({ coverage: HOUSE }), section });
  const report = await read(context);
  assert.ok(
    surfaces(report).blocks.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.newerSection'
    )
  );
  const result = await act(context, 'sdp-none', { deduction: '2', answer: 'yes' });
  assert.equal(result.status, 'refused');
  assert.equal(section.writes.length, 0);
});

test('the Surfaces actions stay within the host’s limits: six fields, fifty options, one list', async () => {
  const report = await read(
    surfacesReader('lyon', { measured: measures({ coverage: HOUSE, floors: FLOORS }) })
  );
  const actions = surfaces(report)
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions);
  assert.ok(actions.length > 0 && actions.length <= 200);
  for (const action of actions) {
    assert.ok(action.fields.length <= 6, action.id);
    for (const field of action.fields)
      if (field.kind === 'choice')
        assert.ok(field.options.length >= 1 && field.options.length <= 50);
  }
  assert.deepEqual(
    actions.find((a) => a.id === 'emprise-definition').fields.map((f) => f.key),
    ['definition', 'upperStoreys', 'roofOverhangs', 'balconies', 'lightweight', 'page']
  );
});

// ── Review fixes (2026-10-20) ────────────────────────────────────────────────────

const existingPart = {
  sourceId: 's',
  featureId: 'x',
  label: 'Maison',
  rings: [],
  properties: {},
  attribution: '©'
};

test('review S1: a room ticked parking and attic is deducted once, as parking (the first kind)', async () => {
  const section = store({
    schema: 1,
    sdp: { open: { parking: ['garage'], attics: ['garage'], none: ['2', '6', '7', '8'] } }
  });
  const report = await read(
    surfacesReader('lyon', { measured: measures({ coverage: HOUSE, floors: FLOORS }), section })
  );
  assert.deepEqual(sdpLine(report, 4), { value: 18.9, unit: 'm2' });
  assert.deepEqual(sdpLine(report, 5), { value: 0, unit: 'm2' });
});

test('review S2: a balcony entered for a building no longer drawn is ignored, never counted', async () => {
  const section = store({ schema: 1, emprise: { balconies: { open: { main: 6.4, gone: 50 } } } });
  const report = await read(
    surfacesReader('lyon', { measured: measures({ coverage: HOUSE }), section })
  );
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.emprise.r420').value, {
    value: 156.4,
    unit: 'm2'
  });
  assert.deepEqual(section.held().emprise.balconies.open.gone, 50, 'kept, never pruned');
});

test('review S3: unnamed buildings are "Building n" in the choices; a name, once the document shows it, replaces it', async () => {
  const unnamed = { id: 'b2', type: 'Building', property: () => undefined };
  const named = {
    id: 'b3',
    type: 'Building',
    property: (k) => (k === 'name' ? { kind: 'string', value: 'Garage' } : undefined)
  };
  const report = await read(
    surfacesReader('lyon', { measured: measures({ coverage: HOUSE }), buildings: [unnamed, named] })
  );
  const role = surfaces(report)
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions)
    .find((a) => a.id === 'building-role');
  assert.deepEqual(
    role.fields[0].options.map((o) => o.label),
    [{ key: 'fr-urban-rules.surfaces.building.ordinal', params: { index: 1 } }, { text: 'Garage' }]
  );
});

test('review S4: past 150 m² on an estimated surface de plancher, the architect is « To verify (estimate) »', async () => {
  const report = await read(
    surfacesReader('lyon', {
      measured: measures({ coverage: HOUSE, floors: { main: [storey('l0', 160)] } })
    })
  );
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.procedure.architect').value, {
    key: 'fr-urban-rules.surfaces.procedure.toVerifyEstimate'
  });
});

test('review S5: works with no storey of the existing building modelled say so', async () => {
  const ext = { id: 'b-ext', type: 'Building', property: () => undefined };
  const coverage = {
    ...HOUSE,
    levels: { ground: level(125), storeys: level(125), withRoofOverhangs: level(130) },
    existing: { area: 90, lightweightArea: 0 }
  };
  const report = await read(
    surfacesReader('lyon', {
      measured: measures({
        coverage,
        floors: { 'b-ext': [storey('e0', 35)] },
        projections: { 'building-main': { top: 6 }, 'b-ext': { top: 3 } }
      }),
      section: store({ ...answeredAll(), roles: { open: { extension: ['b-ext'], annex: [] } } }),
      buildings: [ext],
      site: { existingBuilding: { relation: 'extended', parts: [existingPart] } }
    })
  );
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.procedure.existingFloorArea').value, {
    key: 'fr-urban-rules.surfaces.procedure.existingNotModelled'
  });
});

test('review S6: under the lexicon without light structures the existing emprise leaves them out too', async () => {
  const coverage = {
    ...HOUSE,
    levels: {
      ground: level(150),
      storeys: level(150, [], { withoutLightweight: 144 }),
      withRoofOverhangs: level(159)
    },
    existing: { area: 120, lightweightArea: 6 }
  };
  const section = store({
    schema: 1,
    emprise: {
      definition: 'lexicon',
      counts: { upperStoreys: true, roofOverhangs: false, balconies: true, lightweight: false }
    }
  });
  const report = await read(
    surfacesReader('gordes', {
      measured: measures({ coverage }),
      section,
      site: { existingBuilding: { relation: 'extended', parts: [existingPart] } }
    })
  );
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.caps.existing').value, {
    value: 114,
    unit: 'm2'
  });
  assert.deepEqual(row(report, 'fr-urban-rules.surfaces.caps.extended').value, {
    value: 30,
    unit: 'm2'
  });
});

test('review NITs: R.421-9 c) above 12 m on ≤ 5 m²; R.421-13 for works under 5 m²; exactly 20 m² is a declaration', async () => {
  const small = (emprise, sdp, top, site = {}) =>
    read(
      surfacesReader('mouzay', {
        measured: measures({
          coverage: {
            ...HOUSE,
            levels: {
              ground: level(emprise),
              storeys: level(emprise),
              withRoofOverhangs: level(emprise)
            },
            existing: { area: site.existing ?? 0, lightweightArea: 0 }
          },
          floors: { main: [storey('l0', sdp)] },
          projections: { 'building-main': { top } }
        }),
        section: store(answeredAll()),
        site:
          site.existing === undefined
            ? {}
            : { existingBuilding: { relation: 'extended', parts: [existingPart] } }
      })
    );
  const mast = await small(4, 4, 15);
  assert.deepEqual(row(mast, 'fr-urban-rules.surfaces.procedure.likely').value, {
    key: 'fr-urban-rules.surfaces.procedure.declaration'
  });
  assert.equal(
    row(mast, 'fr-urban-rules.surfaces.procedure.likely').detail.params.article,
    'R.421-9'
  );
  const exact = await small(20, 20, 4);
  assert.deepEqual(row(exact, 'fr-urban-rules.surfaces.procedure.likely').value, {
    key: 'fr-urban-rules.surfaces.procedure.declaration'
  });
  const works = await small(103, 100, 6, { existing: 100 });
  assert.deepEqual(row(works, 'fr-urban-rules.surfaces.procedure.likely').value, {
    key: 'fr-urban-rules.surfaces.procedure.none'
  });
  assert.equal(
    row(works, 'fr-urban-rules.surfaces.procedure.likely').detail.params.article,
    'R.421-13'
  );
});

test('review NITs: a storey under no ceiling leaves the base and the total stays an estimate; `open` is kept when the open variation has answers of its own', async () => {
  const none = { schema: 1, sdp: { open: { none: ['2', '4', '5', '6', '7', '8'] } } };
  const report = await read(
    surfacesReader('lyon', {
      measured: measures({
        coverage: HOUSE,
        floors: { main: [storey('l0', 100), storey('l1', 30, { headroom: { covered: false } })] }
      }),
      section: store(none)
    })
  );
  assert.deepEqual(sdpTotal(report)[2], { value: 100, unit: 'm2' });
  assert.equal(sdpTotal(report)[0].key, 'fr-urban-rules.surfaces.sdp.totalEstimate');
  const section = store({
    schema: 1,
    sdp: { open: { parking: ['garage'] }, 'doc-a': { none: ['2'] } }
  });
  const context = surfacesReader('lyon', {
    measured: measures({ coverage: HOUSE, floors: FLOORS }),
    section,
    variations: [{ id: 'doc-a', name: 'A', master: true, open: true }]
  });
  await read(context);
  await act(context, 'sdp-none', { deduction: '4', answer: 'yes' });
  assert.deepEqual(section.held().sdp.open, { parking: ['garage'] });
  assert.deepEqual(section.held().sdp['doc-a'].none, ['2', '4']);
});
