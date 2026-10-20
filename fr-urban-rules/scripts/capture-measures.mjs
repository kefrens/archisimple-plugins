/**
 * Records the platform's own `measures.distances` answers the R.111-17 tests
 * read (Sprint 002.1a, step 6; criteria 6 and 8). A script run by hand, never a
 * test.
 *
 *     node fr-urban-rules/scripts/capture-measures.mjs --platform ../archisimple
 *
 * It builds, through a built archisimple checkout's Automation API and its
 * test harness (`packages/automation-api/dist/__tests__/support/`), the house
 * of 096.0b's criterion 4 — a 10 × 8 m outline, a gable with its eaves at
 * 6.00 m on the long walls and its ridge 4.00 m in at 8.40 m — on a located
 * Site with flat terrain and the Site boundary 4.00 m south of it, and runs
 * `automation.getBuildingDistances` exactly as the SDK's `measures.distances`
 * does (`apps/web/src/extensions/siteServiceAdapter.ts` passes the Query's
 * answer through). Each answer is saved under
 * `test-fixtures/fr-urban-rules/measures/<case>.json`, with the Query it
 * answered beside it. Nothing here computes a distance.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at = process.argv.indexOf('--platform');
const platform = resolve(ROOT, at === -1 ? '../archisimple' : process.argv[at + 1]);
const load = (path) => import(pathToFileURL(resolve(platform, path)).href);

const api = await load('packages/automation-api/dist/index.js');
const { createTestApplication } = await load(
  'packages/automation-api/dist/__tests__/support/harness.js'
);
const { SiteRecordToken } = await load(
  'packages/automation-api/dist/context/automation-services.js'
);
const geometry = await load('packages/geometry/dist/index.js');

const OUT = resolve(ROOT, 'test-fixtures/fr-urban-rules/measures');
const ANCHOR = { latitude: 49.5159, longitude: 5.258 }; // Brouennes
const GEOREFERENCE = { anchor: ANCHOR, northDegrees: 0, crs: 'EPSG:2154' };
const TRANSFORM = geometry.createGeoreferenceTransform(GEOREFERENCE);
const O = geometry.geodeticToLambert93(ANCHOR);
const rect = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 }
];
/** Edge 1 along y = −4 (south, 4.00 m from the house's outer face), counter-clockwise. */
const BOUNDARY = rect(-20, -4, 30, 30);

function flatGrid(elevation) {
  const width = 201;
  return {
    originEasting: O.easting - 100,
    originNorthing: O.northing - 100,
    resolution: 1,
    width,
    height: width,
    values: new Float32Array(width * width).fill(elevation)
  };
}

/** A second, named building: 0.3 m walls with their outer faces on `x0..x1 × y0..y1`. */
function annex(app, x0, y0, x1, y1) {
  const id = app.api.commands.execute(api.createBuildingRequest({ name: 'Garage' })).id;
  const storey = app.api.queries
    .execute(api.getProjectStructureQuery())
    .levels.find((level) => level.buildingId === id).id;
  const corners = rect(x0 + 0.15, y0 + 0.15, x1 - 0.15, y1 - 0.15);
  corners.forEach((start, index) =>
    app.api.commands.execute(
      api.createWallRequest({
        levelId: storey,
        start,
        end: corners[(index + 1) % 4],
        wallType: 'loadBearing'
      })
    )
  );
  return id;
}

function project({ terrain = true, datum = true, eave = 0 } = {}) {
  const app = createTestApplication();
  const site = {
    ...GEOREFERENCE,
    boundary: { ring: BOUNDARY.map((p) => TRANSFORM.planToProjected(p)) },
    ...(terrain ? { terrain: { verticalDatum: 'NGF-IGN69' } } : {}),
    ...(datum ? { datum: { elevation: 200, verticalDatum: 'NGF-IGN69' } } : {})
  };
  app.services.register(SiteRecordToken, {
    read: () => site,
    write: () => undefined,
    readPackageData: () => undefined,
    writePackageData: () => undefined,
    packageDataIds: () => [],
    readTerrainHeights: () => undefined,
    writeTerrainHeights: () => undefined,
    readTerrainGrid: () => (terrain ? flatGrid(200) : undefined)
  });
  const level = app.api.commands.execute(
    api.createLevelRequest({ name: 'Ground', elevation: 0 })
  ).id;
  // Centrelines 0.15 m in: the request's 0.3 m walls put the outer faces on 0..10 × 0..8.
  const corners = rect(0.15, 0.15, 9.85, 7.85);
  corners.forEach((start, index) =>
    app.api.commands.execute(
      api.createWallRequest({
        levelId: level,
        start,
        end: corners[(index + 1) % 4],
        wallType: 'loadBearing'
      })
    )
  );
  const pitch = (Math.atan(0.6) * 180) / Math.PI; // 2.40 m over 4.00 m
  app.api.commands.execute(
    api.createRoofRequest({
      levelId: level,
      coverage: { kind: 'polygon', ring: rect(0, 0, 10, 8) },
      definition: {
        kind: 'gable',
        eaveHeight: 6,
        buildUp: { type: 'uniform', thickness: 0 },
        overhang: { eave, rake: 0 },
        axis: 'long',
        pitchDegrees: { left: pitch, right: pitch }
      }
    })
  );
  return app;
}

const ALL_EDGES = [1, 2, 3, 4].map((edge) => ({ kind: 'boundary-edge', edge }));

const CASES = {
  // 096.0b criterion 4 / 002.1a criterion 6: flat terrain, the project's datum.
  pitched: {
    site: {},
    query: { outline: 'storeys', targets: ALL_EDGES, ratios: [0.5], byFacade: true }
  },
  'pitched-overhangs': {
    site: { eave: 0.4 },
    query: { outline: 'withRoofOverhangs', targets: ALL_EDGES, ratios: [0.5], byFacade: true }
  },
  // No terrain: every rise unavailable (`no-terrain`).
  'no-terrain': {
    site: { terrain: false },
    query: { outline: 'withRoofOverhangs', targets: ALL_EDGES, ratios: [0.5], byFacade: true }
  },
  // Terrain and no project datum: figures marked `datumDerived` (096.0b review B1).
  'datum-derived': {
    site: { datum: false },
    query: { outline: 'withRoofOverhangs', targets: ALL_EDGES, ratios: [0.5], byFacade: true }
  },
  // 002.1b: a line 10 m south of the house (an opposite alignment), ratio 1, on flat ground.
  'alignment-line': {
    site: {},
    query: {
      outline: 'withRoofOverhangs',
      targets: [
        {
          kind: 'line',
          points: [
            { x: -20, y: -10 },
            { x: 30, y: -10 }
          ].map((p) => TRANSFORM.planToProjected(p))
        }
      ],
      ratios: [1]
    }
  },
  // 002.1b: the same line 150 m off, past the 200 m terrain grid: `outside-terrain`.
  'alignment-outside': {
    site: {},
    query: {
      outline: 'withRoofOverhangs',
      targets: [
        {
          kind: 'line',
          points: [
            { x: -20, y: -150 },
            { x: 30, y: -150 }
          ].map((p) => TRANSFORM.planToProjected(p))
        }
      ],
      ratios: [1]
    }
  },
  // 002.1b R.111-15: a named building 2.50 m, 3.50 m and 0 m east of the house.
  'annex-2.5': { site: {}, annex: [12.5, 0, 18.5, 5] },
  'annex-3.5': { site: {}, annex: [13.5, 0, 19.5, 5] },
  'annex-touching': { site: {}, annex: [10, 0, 16, 5] }
};

await mkdir(OUT, { recursive: true });
for (const [name, spec] of Object.entries(CASES)) {
  const { site } = spec;
  const app = project(site);
  let query = spec.query;
  if (spec.annex !== undefined) {
    const id = annex(app, ...spec.annex);
    query = { outline: 'withRoofOverhangs', targets: [{ kind: 'building', buildingId: id }] };
  }
  const answer = app.api.queries.execute(api.getBuildingDistancesQuery(query));
  const projection = app.api.queries.execute(api.getBuildingProjectionQuery());
  await writeFile(
    resolve(OUT, `${name}.json`),
    `${JSON.stringify({ query, date: new Date().toISOString(), boundary: { ring: BOUNDARY.map((point) => TRANSFORM.planToProjected(point)) }, projection: { available: projection.available, buildingId: projection.buildingId, height: projection.height }, answer }, undefined, 2)}\n`
  );
  const first = answer.available ? answer.targets[0] : answer;
  console.log(name, JSON.stringify(first.nearest ?? first), JSON.stringify(first.worst ?? ''));
}
