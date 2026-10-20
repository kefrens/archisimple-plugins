/**
 * Records the fixtures the tests read (Sprint 002.0, step 2; criterion 9), into
 * `test-fixtures/fr-urban-rules/` at the repository root — outside the package.
 * A script run by hand, never a test: it calls the live services.
 *
 *     node fr-urban-rules/scripts/capture.mjs --platform ../archisimple
 *
 * For each reference plot it:
 *
 * 1. fetches the parcel from Parcellaire Express in EPSG:2154, as carte-gouv-fr
 *    does, and builds the Site view the host would hand a read;
 * 2. runs **this package's own reader** against the live services, through a
 *    `fetch` that saves every answer as `<fixture>.json` beside a
 *    `<fixture>.meta.json` (URL, method, status, date) — so the fixtures are
 *    exactly what the reader asks for;
 * 3. answers the reader's conversions with **the platform's own projection**
 *    (`geodeticToProjected` / `projectedToGeodetic` from a built archisimple
 *    checkout's `packages/geometry`, the functions the host's Site service
 *    calls) and records every one in `conversions.json`. The tests' Site
 *    service answers only from that table (the `import-capture` precedent).
 *
 * Answers are trimmed: the commune's and the document's geometry (never read)
 * are dropped. Read-only, small requests; `download` is never asked.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createReader } from '../src/index.js';
import { FIXTURES, fixtureName } from '../tests/helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at = process.argv.indexOf('--platform');
const platform = resolve(ROOT, at === -1 ? '../archisimple' : process.argv[at + 1]);
const geometry = await import(
  pathToFileURL(resolve(platform, 'packages/geometry/dist/index.js')).href
);
const CRS = 'EPSG:2154';

const REFERENCE_PLOTS = {
  lyon: '69382000AB0105',
  gordes: '84050000AC0323',
  brouennes: '55083000AB0280',
  mouzay: '55364000AB0346',
  rochefort: '56196000AB0235'
};

const PARCELLE_WFS = (idu) =>
  'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
  '&TYPENAMES=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&SRSNAME=EPSG:2154' +
  `&CQL_FILTER=${encodeURIComponent(`idu='${idu}'`)}&OUTPUTFORMAT=application/json`;

const today = new Date().toISOString();

async function save(folder, name, url, method, status, body) {
  await writeFile(new URL(`${name}.json`, folder), `${JSON.stringify(body)}\n`);
  await writeFile(
    new URL(`${name}.meta.json`, folder),
    `${JSON.stringify({ url, method, status, date: today }, undefined, 2)}\n`
  );
}

/** The commune's and the document's outlines are whole territories, and never read. */
function trim(name, body) {
  if (
    (name === 'apicarto-municipality' || name === 'apicarto-document') &&
    Array.isArray(body?.features)
  ) {
    return { ...body, features: body.features.map((f) => ({ ...f, geometry: null })) };
  }
  return body;
}

for (const [plot, idu] of Object.entries(REFERENCE_PLOTS)) {
  const folder = new URL(`${plot}/`, FIXTURES);
  await mkdir(folder, { recursive: true });

  const parcelUrl = PARCELLE_WFS(idu);
  const parcelAnswer = await (await fetch(parcelUrl)).json();
  await save(folder, 'parcel', parcelUrl, 'GET', 200, parcelAnswer);
  const feature = parcelAnswer.features[0];
  const polygons =
    feature.geometry.type === 'MultiPolygon'
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];
  // carte-gouv-fr's `outerRings`: outer rings, points as the WFS wrote them.
  const rings = polygons.map((polygon) =>
    polygon[0].map(([easting, northing]) => ({ easting, northing }))
  );
  const properties = Object.fromEntries(
    Object.entries(feature.properties).filter(
      ([, v]) => typeof v === 'string' || typeof v === 'number'
    )
  );
  const all = rings.flat();
  const centre = {
    easting: all.reduce((s, p) => s + p.easting, 0) / all.length,
    northing: all.reduce((s, p) => s + p.northing, 0) / all.length
  };
  const anchor = geometry.projectedToGeodetic(CRS, centre);
  const site = {
    anchor: { latitude: anchor.latitude, longitude: anchor.longitude },
    crs: CRS,
    country: 'FR',
    parcels: [
      {
        sourceId: 'carte-gouv.parcelle',
        featureId: idu,
        label: `Section ${properties.section} n° ${properties.numero}`,
        rings,
        properties,
        attribution: '© IGN — Géoplateforme (data.geopf.fr)'
      }
    ],
    plotArea: properties.contenance
  };
  await writeFile(new URL('site.json', folder), `${JSON.stringify(site, undefined, 2)}\n`);

  const toGeographic = new Map();
  const fromGeographic = new Map();
  const service = {
    current: () => site,
    toGeographicRing: (ring) =>
      ring.map((p) => {
        const g = geometry.projectedToGeodetic(CRS, p);
        toGeographic.set(`${p.easting},${p.northing}`, [
          p.easting,
          p.northing,
          g.latitude,
          g.longitude
        ]);
        return { latitude: g.latitude, longitude: g.longitude };
      }),
    fromGeographicRing: (ring) =>
      ring.map((p) => {
        const s = geometry.geodeticToProjected(CRS, p);
        fromGeographic.set(`${p.longitude},${p.latitude}`, [
          p.longitude,
          p.latitude,
          s.easting,
          s.northing
        ]);
        return { easting: s.easting, northing: s.northing };
      })
  };

  const recordingFetch = async (url, init = {}) => {
    const response = await fetch(url, init);
    const raw = await response.text();
    const name = fixtureName(url);
    const body = raw.trim() === '' ? null : JSON.parse(raw);
    await save(folder, name, url, init.method ?? 'GET', response.status, trim(name, body));
    return { ok: response.ok, status: response.status, text: async () => raw };
  };

  const reader = createReader({
    fetch: recordingFetch,
    site: () => service,
    timeoutMs: 30_000,
    log: console.log
  });
  const report = await reader.read(
    { site, country: 'FR', reason: 'site' },
    { signal: new AbortController().signal }
  );

  if (plot === 'lyon') {
    // The unfiltered list (DEC-7): recorded so a test proves it is never used.
    const url = 'https://www.geoportail-urbanisme.gouv.fr/api/document?partition=DU_200046977';
    const response = await fetch(url);
    await save(
      folder,
      'gpu-document-unfiltered',
      url,
      'GET',
      response.status,
      await response.json()
    );
  }

  await writeFile(
    new URL('conversions.json', folder),
    `${JSON.stringify({ toGeographic: [...toGeographic.values()], fromGeographic: [...fromGeographic.values()] })}\n`
  );
  console.log(
    `${plot}: ${report.regime.code}, ${report.features.length} features, ` +
      `${report.sources.map((s) => `${s.id}=${s.state}`).join(' ')}`
  );
}
