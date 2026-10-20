/**
 * Records the roads the edge-naming tests read (Sprint 002.1a, step 6): the
 * answer of **carte-gouv-fr's own road source** (a built archisimple
 * checkout's `extensions/carte-gouv-fr/dist`), i.e. the SDK's normalised
 * `RoadSegment[]` that `RoadService.queryRoads` hands an extension — never the
 * raw WFS. A script run by hand, never a test.
 *
 *     node fr-urban-rules/scripts/capture-roads.mjs --platform ../archisimple
 *
 * For each plot whose 002.0 fixtures hold a parcel, the Site boundary is the
 * parcel's outer ring made counter-clockwise (what a user tracing the plot
 * would draw, 083.12), and the query is DEC-4's: the boundary's box grown by
 * 30 m, EPSG:2154, limit 500. Saved as `test-fixtures/fr-urban-rules/<plot>/
 * roads.json` with the boundary and the query beside the answer.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at = process.argv.indexOf('--platform');
const platform = resolve(ROOT, at === -1 ? '../archisimple' : process.argv[at + 1]);
const { createRoadSource } = await import(
  pathToFileURL(resolve(platform, 'extensions/carte-gouv-fr/dist/index.js')).href
);
const source = createRoadSource();

const signedArea = (ring) =>
  ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + p.easting * q.northing - q.easting * p.northing;
  }, 0) / 2;

for (const plot of ['brouennes', 'mouzay']) {
  const folder = resolve(ROOT, 'test-fixtures/fr-urban-rules', plot);
  const site = JSON.parse(await readFile(resolve(folder, 'site.json'), 'utf8'));
  let ring = site.parcels[0].rings[0];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.easting === last.easting && first.northing === last.northing) ring = ring.slice(0, -1);
  if (signedArea(ring) < 0) ring = [...ring].reverse();
  const xs = ring.map((p) => p.easting);
  const ys = ring.map((p) => p.northing);
  const query = {
    crs: 'EPSG:2154',
    minEasting: Math.min(...xs) - 30,
    minNorthing: Math.min(...ys) - 30,
    maxEasting: Math.max(...xs) + 30,
    maxNorthing: Math.max(...ys) + 30,
    limit: 500
  };
  const answer = await source.query(query);
  await writeFile(
    resolve(folder, 'roads.json'),
    `${JSON.stringify({ date: new Date().toISOString(), boundary: { ring }, query, answer }, undefined, 2)}\n`
  );
  console.log(
    plot,
    Array.isArray(answer)
      ? `${answer.length} segments: ${answer.map((s) => `${s.kind}/${s.level}/${s.name ?? '-'}/${s.widthMetres ?? '-'}`).join(', ')}`
      : JSON.stringify(answer)
  );
}
