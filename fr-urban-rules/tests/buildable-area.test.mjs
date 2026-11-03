/**
 * The theoretical buildable area (Sprints 002.17 Exclusion Areas, 002.18 Height Bands and 002.19 Buildable
 * Area View): the Site boundary less the confirmed setbacks and the exclusion areas, in one piece or
 * several, with holes; the sure exclusions (CNIG 01, 05, 02) cut by default, the others proposed;
 * a height held to a band; the view that lists what narrowed it. No network: `insetByRole` is pure, and
 * the reads are 002.0's Lyon recording with a boundary, a section and a prescription layer of the test's.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { __testing, createReader } from '../src/index.js';
import { answering, loadPlot, recordedFetch, recordedSiteService, requestFor } from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const { insetByRole, sectionOf } = __testing;
const en = JSON.parse(
  readFileSync(new URL('../resources/i18n/fr-urban-rules/en.json', import.meta.url), 'utf8')
);
const fr = JSON.parse(
  readFileSync(new URL('../resources/i18n/fr-urban-rules/fr.json', import.meta.url), 'utf8')
);
const p = (easting, northing) => ({ easting, northing });
const signal = () => new AbortController().signal;

// ── The test's own geometry (never the package's) ───────────────────────────────

const area = (ring) =>
  ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a.easting * b.northing - b.easting * a.northing;
  }, 0) / 2;
const net = (rings) => rings.reduce((sum, ring) => sum + area(ring), 0);
function inside(q, ring) {
  let within = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.northing > q.northing !== b.northing > q.northing &&
      q.easting <
        ((b.easting - a.easting) * (q.northing - a.northing)) / (b.northing - a.northing) +
          a.easting
    )
      within = !within;
  }
  return within;
}
/** Even–odd over a ring set, as the host reads a feature's rings and a ceiling's `within`. */
const insideSet = (q, rings) =>
  rings.reduce((n, ring) => n + (inside(q, ring) ? 1 : 0), 0) % 2 === 1;
const rect = (x0, y0, x1, y1) => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
const near = (actual, expected, tolerance, message) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} vs ${expected} (±${tolerance})`
  );

// ── geometry: insetByRole with exclusion areas (Sprint 002.17 DEC-1) ────────────

const BOX = rect(0, 0, 20, 30);

test('002.17 geometry: an exclusion in the middle is a hole — two rings, the net area, no `ring`', () => {
  const answer = insetByRole(BOX, [0, 0, 0, 0], [], [[rect(7, 12, 13, 18)]]);
  assert.equal(answer.rings.length, 2);
  assert.equal(answer.ring, undefined);
  assert.ok(area(answer.rings[0]) > 0, 'the piece counter-clockwise');
  assert.ok(area(answer.rings[1]) < 0, 'the hole clockwise');
  near(net(answer.rings), 600 - 36, 1e-6, 'the net area');
});

test('002.17 geometry: a concave exclusion that touches the boundary, a ring in its own hole, and a group of rings', () => {
  // An L cut from the south-west corner (it lies along two boundary edges): 6×12 + 6×6.
  const L = [p(0, 0), p(12, 0), p(12, 6), p(6, 6), p(6, 12), p(0, 12)];
  const answer = insetByRole(BOX, [0, 0, 0, 0], [], [[L]]);
  assert.equal(answer.rings.length, 1);
  assert.ok(answer.ring);
  near(
    area(answer.ring),
    600 - (12 * 6 + 6 * 6),
    0.02,
    'L cut from a corner, along the boundary (a tenth of a millimetre of shift)'
  );
  // A group read even–odd: a 10×10 square with a 4×4 hole is 84 m² of exclusion; the hole stays in the area.
  const ring = insetByRole(BOX, [0, 0, 0, 0], [], [[rect(5, 10, 15, 20), rect(8, 13, 12, 17)]]);
  near(net(ring.rings), 600 - 84, 1e-3, 'an exclusion with a hole of its own');
  assert.equal(
    ring.rings.length,
    3,
    'the piece, the excluded square as its hole, and the island in it'
  );
});

test('002.17 geometry: setbacks and exclusions together; two overlapping exclusions are cut once; one that is the whole plot collapses', () => {
  const answer = insetByRole(BOX, [3, 0, 0, 0], [], [[rect(0, 0, 8, 8)], [rect(4, 4, 12, 12)]]);
  // 3 m off the south edge leaves 540 m²; of the squares [0,8]² and [4,12]² the part above y = 3 is
  // 40 + 64 − 16 (their overlap, cut once) = 88 m².
  assert.ok(answer.rings.length >= 1);
  near(net(answer.rings), 540 - 88, 0.05, 'setback and two overlapping exclusions');
  assert.deepEqual(insetByRole(BOX, [0, 0, 0, 0], [], [[rect(-5, -5, 25, 35)]]), {
    failed: 'collapsed'
  });
});

test('002.17 geometry: an exclusion lying on a boundary edge, whatever the winding, is not a degenerate overlay', () => {
  const along = [p(0, 0), p(20, 0), p(20, 5), p(0, 5)];
  for (const exclusion of [along, [...along].reverse()]) {
    const answer = insetByRole(BOX, [0, 0, 0, 0], [], [[exclusion]]);
    assert.equal(answer.failed, undefined);
    near(net(answer.rings), 500, 1e-3, 'the south 5 m taken out');
  }
});

test('002.17 geometry: pieces — a band across the plot splits it in two, and no setback is needed', () => {
  const answer = insetByRole(BOX, [0, 0, 0, 0], [], [[rect(-1, 12, 21, 16)]]);
  assert.equal(answer.rings.length, 2);
  assert.ok(answer.rings.every((ring) => area(ring) > 0));
  near(net(answer.rings), 600 - 80, 1e-3, 'two pieces');
});

// ── the reader (002.0's Lyon recording, a boundary and a surface layer of the test's) ──

const plots = {};
before(async () => {
  plots.lyon = await loadPlot('lyon');
});
const SOUTH_ROAD = [
  {
    id: 'r',
    line: [p(-20, -6), p(80, -6)],
    kind: 'road',
    level: 'ground',
    widthMetres: 6,
    name: 'Rue',
    attribution: '© IGN'
  }
];
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
/** A prescription surface (`typepsc`, a libelle, polygons in the test's metres; scaled: degrees = metres / 1e5). */
const surfaceFeature = (type, libelle, rings, extra = {}) => ({
  type: 'Feature',
  id: `prescription_surf.${type}.${libelle}`,
  geometry: {
    type: 'Polygon',
    coordinates: rings.map((ring) =>
      [...ring, ring[0]].map((q) => [q.easting / 1e5, q.northing / 1e5])
    )
  },
  properties: {
    libelle,
    txt: extra.txt ?? libelle,
    typepsc: type,
    stypepsc: '00',
    datvalid: '20260326'
  }
});
const surfaces = (...features) => ({
  type: 'FeatureCollection',
  totalFeatures: features.length,
  features
});
function lyonReader({ boundary = BOX, features = [], initial, lines, plotArea } = {}) {
  const { site: recordedSite, conversions, answers } = plots.lyon;
  const site = {
    ...recordedSite,
    ...(plotArea === undefined ? {} : { plotArea }),
    boundary: { ring: boundary }
  };
  const recorded = recordedSiteService(site, conversions);
  const service = {
    ...recorded,
    toGeographicRing: (ring) =>
      ring.map((q) => ({ longitude: q.easting / 1e5, latitude: q.northing / 1e5 })),
    fromGeographicRing: (ring) =>
      ring.map((q) => ({ easting: q.longitude * 1e5, northing: q.latitude * 1e5 }))
  };
  const data = store(initial);
  const overrides = { 'apicarto-prescription-surf': answering(200, surfaces(...features)) };
  if (lines !== undefined) overrides['apicarto-prescription-lin'] = answering(200, lines);
  const reader = createReader({
    fetch: recordedFetch(answers, overrides).fetch,
    site: () => service,
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    packageData: () => data.service,
    document: () => ({ find: () => [] }),
    translate: (key) => key
  });
  return { reader, site, data };
}
const read = (context) => context.reader.read(requestFor(context.site), { signal: signal() });
const act = (context, actionId, target, values) =>
  context.reader.runAction(
    { actionId, target, ...(values === undefined ? {} : { values }), site: context.site },
    { signal: signal() }
  );
const view = (report, id) => report.views.find((v) => v.id === id);
const envelopeOf = (report) => report.features.find((f) => f.id === 'envelope');
const envelopeBlocks = (report, kind) =>
  (view(report, 'envelope')?.blocks ?? []).filter((b) => b.kind === kind);
const noticeKeys = (report) => envelopeBlocks(report, 'notice').map((b) => b.text.key);
const tableWith = (report, firstColumn) =>
  envelopeBlocks(report, 'table').find((t) => t.columns[0].key === firstColumn);
const narrows = (report) => tableWith(report, 'fr-urban-rules.area.column.cut')?.rows ?? [];
const actionsOf = (report, viewId = 'envelope') =>
  (view(report, viewId)?.blocks ?? [])
    .filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions);
const assumptionIds = (report) => envelopeBlocks(report, 'assumptions')[0]?.ids ?? [];
const ruleActions = (report) => actionsOf(report, 'rules');
async function enter(context, kind, value) {
  const report = await read(context);
  const target = ruleActions(report).find((a) => a.id === 'add-distance').target;
  const answer = await act(context, 'add-distance', target, {
    kind,
    statement: 'limit',
    value,
    source: 'Règlement'
  });
  assert.equal(answer.status, 'done', JSON.stringify(answer));
}
const flood = (rings) => surfaceFeature('02', 'Risque inondation', rings);
const ebc = (rings, name = 'Espace boisé classé') => surfaceFeature('01', name, rings);

// ── 002.17: the sure exclusions cut the area by themselves ───────────────────────

test('002.17 criterion 1: an espace boisé classé (01) is cut with no confirmed rule at all — a hole in the area, listed with its source and the area it takes', async () => {
  const context = lyonReader({ features: [ebc([rect(7, 12, 13, 18)])] });
  const report = await read(context);
  const envelope = envelopeOf(report);
  assert.ok(envelope, 'an area although no rule is confirmed: the exclusion is the plan’s own');
  assert.equal(envelope.rings.length, 2);
  near(net(envelope.rings), 564, 0.01, 'the area');
  const [row] = narrows(report);
  assert.deepEqual(row[0], { text: 'Espace boisé classé', lang: 'fr' });
  assert.deepEqual(row[1], {
    key: 'fr-urban-rules.area.source.prescription',
    params: { code: '01' }
  });
  near(row[2].value, 36, 0.01, 'the area it takes on its own');
  assert.equal(row[2].unit, 'm2');
  assert.ok(assumptionIds(report).includes('envelope-exclusions'));
  for (const id of assumptionIds(report))
    assert.ok(
      report.assumptions.some((a) => a.id === id),
      `${id} is in the report`
    );
  // 01 is sure: there is nothing to ask the user.
  assert.equal(actionsOf(report).filter((a) => a.id === 'set-exclusion').length, 0);
});

test('002.17 criterion 2: 05 is cut too and a 02 is proposed — the stat blocks give the boundary, the area and its share, and the 02 shows what it would take', async () => {
  const features = [
    surfaceFeature('05', 'Emplacement réservé n°4', [rect(0, 0, 20, 4)]),
    flood([rect(0, 24, 20, 30)])
  ];
  const context = lyonReader({ features });
  const report = await read(context);
  near(net(envelopeOf(report).rings), 600 - 80, 0.01, 'the area: the 02 cuts nothing');
  const stats = envelopeBlocks(report, 'stat');
  assert.deepEqual(
    stats.map((s) => [s.label.key, s.value.unit]),
    [
      ['fr-urban-rules.area.stat.boundary', 'm2'],
      ['fr-urban-rules.area.stat.area', 'm2'],
      ['fr-urban-rules.area.stat.share', 'percent']
    ]
  );
  near(stats[0].value.value, 600, 0.001, 'the boundary');
  near(stats[1].value.value, 520, 0.05, 'the area');
  assert.equal(stats[2].value.value, 87);
  assert.equal(narrows(report).length, 1, 'only the 05');
  assert.ok(!narrows(report).some((row) => row[0].text === 'Risque inondation'));
  // The 02 is put to the user in the area's own view, with the area it would take.
  const proposed = envelopeBlocks(report, 'table').find(
    (t) => t.columns[2]?.key === 'fr-urban-rules.area.column.concerned'
  );
  assert.equal(proposed.rows[0][0].text, 'Risque inondation');
  assert.deepEqual(proposed.rows[0][1], {
    key: 'fr-urban-rules.area.source.prescription',
    params: { code: '02' }
  });
  near(proposed.rows[0][2].value, 120, 0.5, 'what it would take');
  const asked = actionsOf(report).filter((a) => a.id === 'set-exclusion');
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0].label, {
    key: 'fr-urban-rules.area.action.subtract',
    params: { name: 'Risque inondation' }
  });
  // Nothing is cut by 02, so nothing is red for it, and nothing can be kept.
  assert.equal(
    actionsOf(report).filter((a) => a.label.key === 'fr-urban-rules.area.action.keep').length,
    0
  );
});

test('002.20 criterion 1: « Take out of the area » on a 02 cuts it, « Leave in the area » puts it back — one undo entry each, the section carrying the choice', async () => {
  const context = lyonReader({ features: [flood([rect(0, 24, 20, 30)])] });
  await enter(context, 'rear_setback', 4);
  let report = await read(context);
  near(net(envelopeOf(report).rings), 520, 0.5, 'proposed: the rear 4 m only');
  const subtract = actionsOf(report).find((a) => a.id === 'set-exclusion');
  const writes = [];
  const held = context.data;
  const original = held.service.write;
  held.service.write = (next, label, expected) => {
    writes.push(label);
    return original(next, label, expected);
  };
  assert.equal((await act(context, 'set-exclusion', subtract.target)).status, 'done');
  assert.equal(writes.length, 1);
  assert.equal(held.held().exclusionChoices.length, 1);
  assert.equal(held.held().exclusionChoices[0].choice, 'subtract');
  assert.equal(held.held().exclusionChoices[0].idurba, '200046977_PLUI_20260326');
  assert.deepEqual(sectionOf(held.held()).readOnly, false);
  report = await read(context);
  // The rear 4 m (y 26–30) and the 02 (y 24–30) overlap: 24 m of depth is gone.
  near(net(envelopeOf(report).rings), 600 - 6 * 20, 0.5, 'taken out');
  assert.ok(narrows(report).some((row) => row[0].text === 'Risque inondation'));
  const leave = actionsOf(report).find((a) => a.id === 'forget-exclusion');
  assert.deepEqual(leave.label, {
    key: 'fr-urban-rules.area.action.leave',
    params: { name: 'Risque inondation' }
  });
  assert.equal((await act(context, 'forget-exclusion', leave.target)).status, 'done');
  assert.equal(held.held().exclusionChoices.length, 0);
  report = await read(context);
  near(net(envelopeOf(report).rings), 520, 0.5, 'left in again');
});

test('002.20 criterion 2: a 02 over the whole plot cuts nothing by default; its proposal reports the whole area, and taking it out says « no ground » apart', async () => {
  // The Peynier case (2026-11-03): a fire-risk zone over both parcels, and an espace boisé classé.
  const features = [ebc([rect(0, 0, 20, 5)]), flood([rect(-5, -5, 25, 35)])];
  const context = lyonReader({ features });
  let report = await read(context);
  const kept = envelopeOf(report);
  assert.ok(kept, 'an area: the 02 is proposed, not cut');
  near(net(kept.rings), 600 - 100, 0.01, 'only the 01 is cut');
  assert.ok(!noticeKeys(report).includes('fr-urban-rules.envelope.notice.collapsedByExclusions'));
  const proposed = envelopeBlocks(report, 'table').find(
    (t) => t.columns[2]?.key === 'fr-urban-rules.area.column.concerned'
  );
  near(proposed.rows[0][2].value, 500, 0.5, 'the 02 would take all that is left');
  const subtract = actionsOf(report).find((a) => a.id === 'set-exclusion');
  assert.equal((await act(context, 'set-exclusion', subtract.target)).status, 'done');
  report = await read(context);
  assert.equal(envelopeOf(report), undefined);
  assert.ok(noticeKeys(report).includes('fr-urban-rules.envelope.notice.collapsedByExclusions'));
  // The way back is offered although there is no area to draw.
  assert.equal(actionsOf(report).filter((a) => a.id === 'forget-exclusion').length, 1);
});

test('002.20 criterion 3: a « keep » stored on a 02 by 0.16 is read without harm — the 02 is proposed, the section stays writable', async () => {
  const probe = lyonReader({
    features: [ebc([rect(0, 0, 20, 5)]), flood([rect(0, 24, 20, 30)])]
  });
  const key = actionsOf(await read(probe))
    .find((a) => a.id === 'set-exclusion')
    .target.subjectId.match(/k=([^|]+)/)[1];
  const context = lyonReader({
    features: [ebc([rect(0, 0, 20, 5)]), flood([rect(0, 24, 20, 30)])],
    initial: {
      schema: 1,
      exclusionChoices: [
        {
          key: decodeURIComponent(key),
          plot: ['69382000AB0105'],
          choice: 'keep',
          idurba: '200046977_PLUI_20260326',
          datvalid: '20260326',
          at: '2026-11-03T00:00:00.000Z'
        }
      ]
    }
  });
  const report = await read(context);
  near(net(envelopeOf(report).rings), 600 - 100, 0.01, 'the 02 cuts nothing');
  assert.equal(sectionOf(context.data.held()).readOnly, false);
  assert.equal(
    actionsOf(report).filter((a) => a.id === 'set-exclusion').length,
    1,
    'it can still be taken out'
  );
});

test('002.17 criterion 4: a 07 is proposed — it takes nothing until « Take out of the area », shows the area it would take, and « Do not take out » forgets it', async () => {
  const heritage = surfaceFeature('07', 'Arbre remarquable', [rect(8, 10, 14, 20)]);
  const context = lyonReader({ features: [heritage] });
  await enter(context, 'rear_setback', 4);
  let report = await read(context);
  const before = net(envelopeOf(report).rings);
  near(before, 20 * 26, 0.5, 'the 07 is shown and cuts nothing');
  assert.ok(!narrows(report).some((row) => row[0].text === 'Arbre remarquable'));
  const toConfirm = tableWith(report, 'fr-urban-rules.area.column.cut');
  const proposed = envelopeBlocks(report, 'table').find(
    (t) => t.columns[2]?.key === 'fr-urban-rules.area.column.concerned'
  );
  assert.ok(proposed, 'a To confirm table');
  assert.equal(proposed.rows[0][0].text, 'Arbre remarquable');
  near(proposed.rows[0][2].value, 60, 0.5, 'what it would take');
  assert.ok(toConfirm);
  const subtract = actionsOf(report).find((a) => a.id === 'set-exclusion');
  assert.equal(subtract.label.key, 'fr-urban-rules.area.action.subtract');
  assert.equal((await act(context, 'set-exclusion', subtract.target)).status, 'done');
  report = await read(context);
  near(net(envelopeOf(report).rings), before - 60, 0.5, 'taken out on the user’s word');
  assert.ok(narrows(report).some((row) => row[0].text === 'Arbre remarquable'));
  const leave = actionsOf(report).find((a) => a.id === 'forget-exclusion');
  assert.equal(leave.label.key, 'fr-urban-rules.area.action.leave');
  assert.equal((await act(context, 'forget-exclusion', leave.target)).status, 'done');
  report = await read(context);
  near(net(envelopeOf(report).rings), before, 0.5, 'left in again');
});

test('002.17 criterion 5: a type the package does not name is put in the Prescriptions view, one action each, and cuts nothing until taken', async () => {
  const context = lyonReader({
    features: [surfaceFeature('99', 'Polarité commerciale', [rect(2, 2, 8, 8)])]
  });
  await enter(context, 'rear_setback', 4);
  const report = await read(context);
  near(net(envelopeOf(report).rings), 520, 0.5, 'cut nothing');
  assert.equal(
    actionsOf(report).filter((a) => a.id === 'set-exclusion').length,
    0,
    'not in the area’s own view'
  );
  const there = actionsOf(report, 'prescriptions').filter((a) => a.id === 'set-exclusion');
  assert.equal(there.length, 1);
  assert.equal(there[0].label.params.name, 'Polarité commerciale');
  assert.equal((await act(context, 'set-exclusion', there[0].target)).status, 'done');
  const taken = await read(context);
  near(net(envelopeOf(taken).rings), 520 - 36, 0.5, 'taken out');
  assert.ok(narrows(taken).some((row) => row[0].text === 'Polarité commerciale'));
  // The numeric types are not exclusions at all.
  const numeric = lyonReader({
    features: [
      surfaceFeature('39', 'Hauteur Max-9', [rect(2, 2, 8, 8)]),
      surfaceFeature('17', 'Mixité', [rect(2, 2, 8, 8)])
    ]
  });
  await enter(numeric, 'rear_setback', 4);
  const report2 = await read(numeric);
  assert.equal(
    actionsOf(report2, 'prescriptions').filter((a) => a.id === 'set-exclusion').length,
    0
  );
  assert.equal(narrows(report2).length, 1, 'only the setback');
});

test('002.17 criterion 6: a line or a point of an exclusion type cuts nothing and is listed with its reason; a surface past the cap is said', async () => {
  const line = {
    type: 'FeatureCollection',
    totalFeatures: 1,
    features: [
      {
        type: 'Feature',
        id: 'prescription_lin.1',
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [20 / 1e5, 10 / 1e5]
          ]
        },
        properties: {
          libelle: 'Alignement d’arbres',
          txt: 'Alignement d’arbres',
          typepsc: '01',
          stypepsc: '00',
          datvalid: '20260326'
        }
      }
    ]
  };
  const context = lyonReader({ lines: line });
  await enter(context, 'rear_setback', 4);
  let report = await read(context);
  const reasons = envelopeBlocks(report, 'table').find(
    (t) => t.columns[1].key === 'fr-urban-rules.envelope.column.reason'
  );
  assert.ok(
    reasons.rows.some(
      (row) =>
        row[0].text === 'Alignement d’arbres' &&
        row[1].key === 'fr-urban-rules.area.reason.notSurface'
    )
  );
  assert.ok(assumptionIds(report).includes('envelope-exclusions-missing'));
  // Thirty small EBC: 24 are cut, 6 are said.
  const many = Array.from({ length: 30 }, (_, i) =>
    ebc(
      [
        rect(1 + (i % 6) * 3, 6 + Math.floor(i / 6) * 3, 3 + (i % 6) * 3, 8 + Math.floor(i / 6) * 3)
      ],
      `EBC ${i + 1}`
    )
  );
  const crowded = lyonReader({ features: many });
  report = await read(crowded);
  const said = envelopeBlocks(report, 'table').find(
    (t) => t.columns[1].key === 'fr-urban-rules.envelope.column.reason'
  );
  assert.equal(
    said.rows.filter((row) => row[1].key === 'fr-urban-rules.area.reason.tooMany').length,
    6
  );
  assert.equal(narrows(report).length, 24);
  assert.ok(assumptionIds(report).includes('envelope-exclusions-missing'));
});

test('002.17 criterion 7: a choice made against another version of the document decides nothing, is said, and the default stands', async () => {
  const features = [ebc([rect(0, 0, 20, 5)]), flood([rect(0, 24, 20, 30)])];
  const stale = {
    schema: 1,
    exclusionChoices: [
      {
        key: 'x',
        plot: ['69382000AB0105'],
        choice: 'subtract',
        idurba: '200046977_PLUI_20250101',
        datvalid: '20250101',
        at: '2025-01-01T00:00:00.000Z'
      }
    ]
  };
  const probe = lyonReader({ features, initial: stale });
  const key = actionsOf(await read(probe))
    .find((a) => a.id === 'set-exclusion')
    .target.subjectId.match(/k=([^|]+)/)[1];
  const section = {
    ...stale,
    exclusionChoices: [{ ...stale.exclusionChoices[0], key: decodeURIComponent(key) }]
  };
  const context = lyonReader({ features, initial: section });
  const report = await read(context);
  near(
    net(envelopeOf(report).rings),
    600 - 100,
    0.01,
    'the 02 is proposed again: the old « take out » is for another document'
  );
  assert.ok(noticeKeys(report).includes('fr-urban-rules.area.notice.reopened'));
  // The same version takes it out (the case-insensitive comparison of every confirmation).
  const same = lyonReader({
    features,
    initial: {
      ...section,
      exclusionChoices: [
        { ...section.exclusionChoices[0], idurba: '200046977_pluI_20260326', datvalid: '20260326' }
      ]
    }
  });
  const taken = await read(same);
  near(
    net(envelopeOf(taken).rings),
    600 - 100 - 120,
    0.01,
    '`PLUi` against `PLUI` reopens nothing: the 02 stays taken out'
  );
});

test('002.17 criterion 8: the area is pieces when an exclusion splits it, and « no ground » is said apart when an exclusion takes all of it', async () => {
  const context = lyonReader({ features: [ebc([rect(-1, 12, 21, 16)], 'EBC en travers')] });
  const report = await read(context);
  const envelope = envelopeOf(report);
  assert.equal(envelope.rings.length, 2);
  near(net(envelope.rings), 520, 0.01, 'two pieces');
  assert.ok(!noticeKeys(report).includes('fr-urban-rules.envelope.notice.shape'));
  const all = lyonReader({ features: [ebc([rect(-5, -5, 25, 35)], 'EBC sur tout')] });
  const gone = await read(all);
  assert.equal(envelopeOf(gone), undefined);
  assert.ok(noticeKeys(gone).includes('fr-urban-rules.envelope.notice.collapsedByExclusions'));
});

test('002.17 criterion 9: a malformed `exclusionChoices` makes the section read-only; a choice request for another plot or key is refused, and writes nothing', async () => {
  const bad = { schema: 1, exclusionChoices: [{ key: 7, choice: 'maybe' }] };
  assert.equal(sectionOf(bad).readOnly, true);
  const features = [ebc([rect(0, 0, 20, 5)]), flood([rect(0, 24, 20, 30)])];
  const context = lyonReader({ features, initial: bad });
  const report = await read(context);
  const keep = actionsOf(report).find((a) => a.id === 'set-exclusion');
  const refused = await act(context, 'set-exclusion', keep.target);
  assert.equal(refused.status, 'refused');
  assert.deepEqual(context.data.held(), bad, 'never overwritten');
  const fine = lyonReader({ features: [flood([rect(0, 24, 20, 30)])] });
  const nonsense = await act(fine, 'set-exclusion', { subjectId: 'k=|c=keep|i=A|d=B' });
  assert.equal(nonsense.status, 'refused');
  const wrongChoice = await act(fine, 'set-exclusion', {
    subjectId: 'k=psc%3A02%3A00%3Aaaaaaaa|c=erase|i=A|d=B'
  });
  assert.equal(wrongChoice.status, 'refused');
  assert.equal(fine.data.held(), undefined);
});

// ── 002.20: the areas taken out are drawn red, and can be hidden ───────────────

const excludedOf = (report) => report.features.filter((f) => f.id.startsWith('excluded:'));

test('002.20 criterion 4: each area taken out is a derived prescription feature — clipped to the plot — and a proposed or unconfirmed area is none', async () => {
  // A forest much larger than the plot: only its part on the plot is drawn.
  const context = lyonReader({
    features: [ebc([rect(-10, 10, 30, 20)], 'Bois'), flood([rect(0, 24, 20, 30)])]
  });
  const report = await read(context);
  const drawn = excludedOf(report);
  assert.equal(drawn.length, 1, 'the 01 only: the 02 is proposed');
  assert.equal(drawn[0].category, 'prescription');
  assert.equal(drawn[0].official, false);
  assert.deepEqual(drawn[0].label, { text: 'Bois', lang: 'fr' });
  near(net(drawn[0].rings), 200, 0.01, 'its part on the plot: 20 m × 10 m');
  for (const ring of drawn[0].rings)
    for (const q of ring) {
      assert.ok(q.easting >= -1e-6 && q.easting <= 20 + 1e-6, 'inside the plot (x)');
      assert.ok(q.northing >= -1e-6 && q.northing <= 30 + 1e-6, 'inside the plot (y)');
    }
  // A zone that does not touch the plot draws nothing; one over the whole plot is the plot.
  const away = lyonReader({
    features: [ebc([rect(50, 50, 60, 60)], 'Loin'), ebc([rect(0, 0, 4, 4)])]
  });
  assert.equal(excludedOf(await read(away)).length, 1, 'only the one on the plot');
  const all = lyonReader({ features: [ebc([rect(-5, -5, 25, 35)], 'Tout')] });
  const everything = excludedOf(await read(all));
  assert.equal(everything.length, 1, 'drawn although no ground is left');
  near(net(everything[0].rings), 600, 0.01, 'the whole plot');
  // No confirmed rule and nothing taken out: nothing red.
  assert.equal(
    excludedOf(await read(lyonReader({ features: [flood([rect(0, 24, 20, 30)])] }))).length,
    0
  );
});

test('002.20 criterion 5: a 02 taken out is red, left in again it is not; one button hides or shows the red areas, kept in the section, in one undo entry', async () => {
  const context = lyonReader({
    features: [ebc([rect(0, 0, 20, 5)]), flood([rect(0, 24, 20, 30)])]
  });
  let report = await read(context);
  assert.equal(excludedOf(report).length, 1);
  const subtract = actionsOf(report).find((a) => a.id === 'set-exclusion');
  assert.equal((await act(context, 'set-exclusion', subtract.target)).status, 'done');
  report = await read(context);
  assert.equal(excludedOf(report).length, 2, 'the 02 taken out is red');
  assert.ok(noticeKeys(report).includes('fr-urban-rules.area.notice.drawnRed'));
  const area = net(envelopeOf(report).rings);
  const hide = actionsOf(report).find((a) => a.id === 'hide-exclusions');
  assert.equal(hide.label.key, 'fr-urban-rules.area.action.hideCut');
  const writes = [];
  const held = context.data;
  const original = held.service.write;
  held.service.write = (next, label, expected) => {
    writes.push(label);
    return original(next, label, expected);
  };
  assert.equal((await act(context, 'hide-exclusions', hide.target)).status, 'done');
  assert.equal(writes.length, 1);
  assert.equal(held.held().exclusionsHidden.length, 1);
  assert.equal(held.held().exclusionChoices.length, 1, 'the other choices are kept');
  assert.equal(sectionOf(held.held()).readOnly, false);
  report = await read(context);
  assert.equal(excludedOf(report).length, 0, 'hidden');
  near(net(envelopeOf(report).rings), area, 1e-6, 'hiding draws less, it changes no area');
  assert.ok(!noticeKeys(report).includes('fr-urban-rules.area.notice.drawnRed'));
  const show = actionsOf(report).find((a) => a.id === 'show-exclusions');
  assert.equal(show.label.key, 'fr-urban-rules.area.action.showCut');
  assert.equal((await act(context, 'show-exclusions', show.target)).status, 'done');
  assert.equal(held.held().exclusionsHidden.length, 0);
  assert.equal(excludedOf(await read(context)).length, 2);
  // Nothing taken out, no button.
  const none = lyonReader({ features: [flood([rect(0, 24, 20, 30)])] });
  await enter(none, 'rear_setback', 4);
  const idle = await read(none);
  assert.ok(!actionsOf(idle).some((a) => /exclusions$/.test(a.id) && a.id !== 'set-exclusion'));
});

test('002.20 criterion 6: a malformed `exclusionsHidden` makes the section read-only and is never overwritten', async () => {
  assert.equal(sectionOf({ schema: 1, exclusionsHidden: [{ plot: 3 }] }).readOnly, true);
  assert.equal(sectionOf({ schema: 1, exclusionsHidden: [{ plot: ['a'] }] }).readOnly, false);
  const bad = { schema: 1, exclusionsHidden: 'x' };
  const context = lyonReader({ features: [ebc([rect(0, 0, 20, 5)])], initial: bad });
  const refused = await act(context, 'hide-exclusions', {});
  assert.equal(refused.status, 'refused');
  assert.deepEqual(context.data.held(), bad, 'never overwritten');
});

// ── 002.18: a height held to a band ──────────────────────────────────────────────

async function addBand(
  context,
  { value = 2, depth = 3, edges = 'all', source = 'Règlement art. 10' } = {}
) {
  const report = await read(context);
  const form = ruleActions(report).find((a) => a.id === 'add-height-band');
  const answer = await act(context, 'add-height-band', form.target, {
    value,
    depth,
    edges,
    source
  });
  return { form, answer };
}

test('002.18 criterion 1: the band form — a height, a depth, the edges it runs along — creates an entered rule of the package’s own, never the building’s maximum height', async () => {
  const context = lyonReader({});
  const first = await read(context);
  const form = ruleActions(first).find((a) => a.id === 'add-height-band');
  assert.deepEqual(
    form.fields.map((f) => f.key),
    ['value', 'depth', 'edges', 'source', 'page', 'note']
  );
  assert.equal(form.fields.find((f) => f.key === 'depth').unit, 'm');
  assert.deepEqual(
    form.fields.find((f) => f.key === 'edges').options.map((o) => o.value),
    ['all', 'street', 'side', 'rear', 'side-rear']
  );
  const { answer } = await addBand(context, { value: 2, depth: 3, edges: 'side-rear' });
  assert.equal(answer.status, 'done', JSON.stringify(answer));
  const entry = context.data.held().entered[0];
  assert.equal(entry.kind, 'height_total');
  assert.deepEqual(entry.limit, { kind: 'value', value: 2, unit: 'm' });
  assert.deepEqual(entry.band, { depth: 3, roles: ['side', 'rear'] });
  const report = await read(context);
  const rule = report.rules.find((r) => r.id === entry.key);
  // The checks, the headroom and the capacity read `height_total`: this one is `other`.
  assert.equal(rule.kind, 'other');
  assert.equal(rule.status, 'confirmed');
  assert.deepEqual(rule.conditions[0], {
    key: 'fr-urban-rules.rule.bandCondition.sideRear',
    params: { depth: 3 }
  });
  assert.ok(!report.checks.some((c) => c.ruleId === entry.key), 'no height check on the building');
});

test('002.18 criterion 2: the band is a ceiling `within` the strip along the edges of its roles — even–odd, the area unchanged — and a strip drawn on the plan', async () => {
  const context = lyonReader({});
  await enter(context, 'rear_setback', 4);
  const before = net(envelopeOf(await read(context)).rings);
  const { answer } = await addBand(context, { value: 2, depth: 3, edges: 'side-rear' });
  assert.equal(answer.status, 'done');
  const report = await read(context);
  const envelope = envelopeOf(report);
  near(net(envelope.rings), before, 1e-6, 'a band takes no area');
  const [band] = envelope.volume.ceilings.filter((c) => c.within !== undefined);
  assert.equal(band.kind, 'height');
  assert.equal(band.metres, 2);
  // Edge 1 is the street (south); the sides (x = 0 and 20) and the rear (y = 30) are the band's.
  assert.equal(insideSet(p(1, 15), band.within), true, '1 m from the west side: in the band');
  assert.equal(insideSet(p(19.5, 15), band.within), true, '0.5 m from the east side');
  assert.equal(insideSet(p(10, 29), band.within), true, '1 m from the rear');
  assert.equal(insideSet(p(10, 15), band.within), false, 'the middle');
  assert.equal(
    insideSet(p(10, 1), band.within),
    false,
    'the street edge is not in the band’s roles'
  );
  const strip = report.features.find((f) => f.id === 'envelope-band:1');
  assert.equal(strip.category, 'setback-band');
  assert.equal(strip.official, false);
  assert.equal(insideSet(p(1, 15), strip.rings), true);
  assert.equal(insideSet(p(10, 15), strip.rings), false);
  assert.equal(strip.volume, undefined, 'the strip carries no volume of its own');
  // The list says it: a ceiling, no area removed, from the rule.
  const row = narrows(report).find((r) => r[0].key === 'fr-urban-rules.area.cut.band');
  assert.deepEqual(row[0].params, { metres: 2, depth: 3 });
  assert.equal(row[2].key, 'fr-urban-rules.area.value.ceiling');
  assert.ok(assumptionIds(report).includes('envelope-band'));
});

test('002.18 criterion 3: a band beside a height over the whole plot keeps both (the lower within its strip); one that is not lower is dropped; none of the roles’ edges is said', async () => {
  const context = lyonReader({});
  await enter(context, 'height_total', 9);
  await addBand(context, { value: 2, depth: 3, edges: 'all' });
  let report = await read(context);
  const ceilings = envelopeOf(report).volume.ceilings;
  assert.equal(ceilings.length, 2);
  assert.deepEqual(
    ceilings.map((c) => [c.metres, c.within === undefined ? 'whole' : 'band']).sort(),
    [
      [2, 'band'],
      [9, 'whole']
    ]
  );
  const high = lyonReader({});
  await enter(high, 'height_total', 9);
  await addBand(high, { value: 12, depth: 3, edges: 'all' });
  report = await read(high);
  assert.deepEqual(
    envelopeOf(report).volume.ceilings.map((c) => c.metres),
    [9],
    'a band over the whole plot’s lower height adds nothing'
  );
  // « all » on a street-only boundary with the street role absent: a plot whose edges carry none of the band’s roles.
  const rear = lyonReader({});
  await addBand(rear, { value: 2, depth: 3, edges: 'rear' });
  await enter(rear, 'height_total', 9);
  const ok = await read(rear);
  assert.ok(
    envelopeOf(ok).volume.ceilings.some((c) => c.within !== undefined),
    'the rear edge exists'
  );
});

test('002.18 criterion 4: a depth past the plot is the whole plot; the form refuses a bad depth, an unknown edge choice and a bad kind; edit shows the band’s fields', async () => {
  const context = lyonReader({});
  await addBand(context, { value: 2, depth: 40, edges: 'all' });
  const report = await read(context);
  const [band] = envelopeOf(report).volume.ceilings;
  assert.equal(insideSet(p(10, 15), band.within), true, 'the band is the whole plot');
  const form = ruleActions(report).find((a) => a.id === 'add-height-band');
  for (const values of [
    { value: 2, depth: 0, edges: 'all' },
    { value: 2, depth: 51, edges: 'all' },
    { value: 2, edges: 'all' },
    { value: 2, depth: 3, edges: 'diagonal' },
    { value: 2, depth: 3 },
    { depth: 3, edges: 'all' }
  ]) {
    const refused = await act(lyonReader({}), 'add-height-band', form.target, {
      ...values,
      source: 'x'
    });
    assert.equal(refused.status, 'refused', JSON.stringify(values));
  }
  const entry = context.data.held().entered[0];
  const edit = ruleActions(report).find((a) => a.id === 'edit-entered');
  assert.deepEqual(
    edit.fields.map((f) => f.key),
    ['value', 'depth', 'edges', 'source', 'page']
  );
  assert.equal(edit.fields.find((f) => f.key === 'depth').initial, 40);
  assert.equal(edit.fields.find((f) => f.key === 'edges').initial, 'all');
  const edited = await act(context, 'edit-entered', edit.target, {
    value: 3,
    depth: 2,
    edges: 'street',
    source: 'y'
  });
  assert.equal(edited.status, 'done');
  assert.deepEqual(context.data.held().entered[0].band, { depth: 2, roles: ['street'] });
  assert.equal(context.data.held().entered[0].key, entry.key);
});

test('002.18 criterion 5: a malformed band makes the section read-only, as any entered entry of a shape not recognised does', () => {
  const entry = (band) => ({
    key: 'entered:1',
    kind: 'height_total',
    statement: 'limit',
    limit: { kind: 'value', value: 2, unit: 'm' },
    source: { document: 'x' },
    band
  });
  assert.equal(
    sectionOf({ schema: 1, entered: [entry({ depth: 3, roles: ['side'] })] }).readOnly,
    false
  );
  for (const band of [
    { depth: 0, roles: ['side'] },
    { depth: 3, roles: [] },
    { depth: 3, roles: ['sky'] },
    { depth: 60, roles: ['side'] },
    'wide',
    { depth: 3, roles: ['side', 'rear', 'street', 'street'] }
  ])
    assert.equal(
      sectionOf({ schema: 1, entered: [entry(band)] }).readOnly,
      true,
      JSON.stringify(band)
    );
  // A band on anything but a height is not recognised either.
  assert.equal(
    sectionOf({
      schema: 1,
      entered: [{ ...entry({ depth: 3, roles: ['side'] }), kind: 'rear_setback' }]
    }).readOnly,
    true
  );
});

// ── 002.19: the view ──────────────────────────────────────────────────────────

test('002.19 criterion 1: the area is named « Aire d’implantation théorique » / « Theoretical buildable area », the 3D volume keeps « Enveloppe théorique », and no string says « zone constructible »', () => {
  assert.equal(fr['fr-urban-rules.view.envelope'], 'Aire d’implantation théorique');
  assert.equal(en['fr-urban-rules.view.envelope'], 'Theoretical buildable area');
  assert.equal(fr['fr-urban-rules.area.stat.area'], 'Aire d’implantation théorique');
  assert.equal(en['fr-urban-rules.area.stat.area'], 'Theoretical buildable area');
  assert.equal(fr['fr-urban-rules.envelope.label'], 'Enveloppe théorique');
  for (const [locale, strings] of Object.entries({ fr, en })) {
    for (const [key, value] of Object.entries(strings)) {
      assert.doesNotMatch(
        value,
        /zone constructible|emprise constructible|constructible zone/iu,
        `${locale} ${key}`
      );
      // The area's own words: theoretical, never a right (« buildable » only behind « theoretical »).
      if (key.startsWith('fr-urban-rules.area.') || key.startsWith('fr-urban-rules.band.'))
        assert.doesNotMatch(
          value,
          /(?<!theoretical )buildable|constructible|conforme|autoris|compliant|allowed|permitted/iu,
          `${locale} ${key}`
        );
    }
  }
});

test('002.19 criterion 2: the view is theoretical and cited — a caution, no verdict word in its blocks, every cut with a source', async () => {
  const context = lyonReader({ features: [ebc([rect(7, 12, 13, 18)])] });
  await enter(context, 'rear_setback', 4);
  const report = await read(context);
  const v = view(report, 'envelope');
  assert.deepEqual(v.label, { key: 'fr-urban-rules.view.envelope' });
  assert.ok(
    v.blocks.some((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.area.caution')
  );
  // The recorded acceptance guard, kept: the keys of the view say nothing of a right.
  assert.doesNotMatch(
    JSON.stringify(v),
    /buildable|constructible|compliant|conforme|allowed|autoris/i
  );
  for (const row of narrows(report)) assert.ok(row[1], 'a source on every row');
  // The headline comes before the lists, the lists before the rules, the caution last.
  const kinds = v.blocks.map((b) => b.kind);
  assert.ok(kinds.indexOf('stat') < kinds.indexOf('table'));
  assert.equal(v.blocks.at(-1).text.key, 'fr-urban-rules.area.caution');
  // The setback row names the role, the distance and the rule it comes from.
  const setback = narrows(report).find((r) => r[0].key === 'fr-urban-rules.area.cut.setbackRear');
  assert.deepEqual(setback[0].params, { distance: 4 });
  assert.equal(setback[1].key, 'fr-urban-rules.entered.kind.rear_setback');
  near(setback[2].value, 80, 0.01, 'the 4 m rear strip');
});

test('002.19 criterion 3: overlapping cuts say so — each area is its own, the sum is more than the total removed', async () => {
  const context = lyonReader({
    features: [
      ebc([rect(0, 20, 20, 30)], 'EBC haut'),
      surfaceFeature('05', 'ER fond', [rect(0, 24, 20, 30)])
    ]
  });
  const report = await read(context);
  near(net(envelopeOf(report).rings), 400, 0.01, 'the union of the two');
  const rows = narrows(report);
  near(
    rows.reduce((sum, r) => sum + r[2].value, 0),
    200 + 120,
    0.05,
    'the alone areas add up to more'
  );
  assert.ok(
    envelopeBlocks(report, 'notice').some(
      (n) => n.text.key === 'fr-urban-rules.area.notice.overlap'
    )
  );
  // And not when they do not overlap.
  const apart = lyonReader({
    features: [ebc([rect(0, 0, 5, 5)]), surfaceFeature('05', 'ER', [rect(10, 10, 15, 15)])]
  });
  assert.ok(
    !(await read(apart)).views
      .find((x) => x.id === 'envelope')
      .blocks.some(
        (n) => n.kind === 'notice' && n.text.key === 'fr-urban-rules.area.notice.overlap'
      )
  );
});

test('002.19 criterion 4: the boundary going past the plot is an assumption, never a clip; a boundary that matches says nothing', async () => {
  const past = lyonReader({ features: [ebc([rect(7, 12, 13, 18)])], plotArea: 450 });
  assert.ok(assumptionIds(await read(past)).includes('envelope-boundary-line'));
  const matching = lyonReader({ features: [ebc([rect(7, 12, 13, 18)])], plotArea: 600 });
  assert.ok(!assumptionIds(await read(matching)).includes('envelope-boundary-line'));
  const smaller = lyonReader({ features: [ebc([rect(7, 12, 13, 18)])], plotArea: 900 });
  assert.ok(!assumptionIds(await read(smaller)).includes('envelope-boundary-line'));
  // Not clipped: the area stays what the boundary and the cuts make, whatever the plot.
  near(net(envelopeOf(await read(past)).rings), 564, 0.01, 'unclipped');
});

test('002.19 criterion 5: a Site with no boundary says so and draws nothing; a boundary with several pieces and holes reaches the sheet’s plot plan', async () => {
  const { site: recorded } = plots.lyon;
  const bare = { ...recorded };
  delete bare.boundary;
  const { conversions, answers } = plots.lyon;
  const service = recordedSiteService(bare, conversions);
  const reader = createReader({
    fetch: recordedFetch(answers, {}).fetch,
    site: () => service,
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    packageData: () => store(undefined).service,
    document: () => ({ find: () => [] }),
    translate: (key) => key
  });
  const none = await reader.read(requestFor(bare), { signal: signal() });
  assert.equal(envelopeOf(none), undefined);
  assert.deepEqual(view(none, 'envelope').blocks, [
    { kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.envelope.notice.noBoundary' } }
  ]);
  assert.match(
    en['fr-urban-rules.envelope.notice.noBoundary'],
    /Choose a plot, or draw the Site boundary/
  );
  assert.match(
    fr['fr-urban-rules.envelope.notice.noBoundary'],
    /Choisissez un terrain, ou tracez la limite du site/
  );
  reader.dispose();
  // Pieces with a hole: the sheet's plot plan names the layer, and the report stays within the host's counts.
  const context = lyonReader({
    features: [ebc([rect(-1, 12, 21, 16)], 'EBC'), ebc([rect(5, 2, 8, 6)], 'EBC 2')]
  });
  const report = await read(context);
  assert.ok(envelopeOf(report).rings.length >= 3, 'two pieces and a hole');
  assert.ok(
    report.sheet.blocks.some((b) => b.kind === 'plot-plan' && b.categories.includes('envelope'))
  );
  // Platform 103.6: the areas taken out reach paper by the same block — it asks for `prescription`,
  // and the host draws a derived one in red — so the sheet needs no category of its own for them.
  assert.ok(
    report.sheet.blocks.some((b) => b.kind === 'plot-plan' && b.categories.includes('prescription'))
  );
  assert.ok(report.features.some((f) => f.category === 'prescription' && f.official === false));
  assert.ok(report.features.length <= 1900);
});

test('002.19 criterion 6: a corrected region is idempotent — reading again the same section gives the same area', async () => {
  const context = lyonReader({
    features: [ebc([rect(7, 12, 13, 18)]), flood([rect(0, 24, 20, 30)])]
  });
  const a = await read(context);
  const b = await read(context);
  assert.deepEqual(envelopeOf(a), envelopeOf(b));
  assert.deepEqual(view(a, 'envelope'), view(b, 'envelope'));
});
