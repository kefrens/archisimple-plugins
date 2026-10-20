/**
 * Records the facing parcels and the neighbouring buildings the 002.1b tests
 * read (Sprint 002.1b, step 6): the answers of **carte-gouv-fr's own parcel
 * and building sources** (a built archisimple checkout's
 * `extensions/carte-gouv-fr/dist`), i.e. the SDK's normalised `MapFeature[]`
 * that `MapFeatureService.queryFeatures` hands an extension — never the WFS.
 * A script run by hand, never a test.
 *
 *     node fr-urban-rules/scripts/capture-features.mjs --platform ../archisimple
 *
 * For each plot with recorded roads (`capture-roads.mjs`), the queries are
 * DEC-1's (the boundary's box grown by 40 m, limit 200) and DEC-4's (grown by
 * 50 m, limit 500). Saved as `test-fixtures/fr-urban-rules/<plot>/
 * {parcels,buildings}.json`, each with its query.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at = process.argv.indexOf('--platform');
const platform = resolve(ROOT, at === -1 ? '../archisimple' : process.argv[at + 1]);
const { createParcelSource, createBuildingSource } = await import(
  pathToFileURL(resolve(platform, 'extensions/carte-gouv-fr/dist/index.js')).href
);
const sources = { parcel: createParcelSource(), building: createBuildingSource() };

function box(ring, margin, limit) {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (const p of ring) {
    minE = Math.min(minE, p.easting);
    minN = Math.min(minN, p.northing);
    maxE = Math.max(maxE, p.easting);
    maxN = Math.max(maxN, p.northing);
  }
  return {
    crs: 'EPSG:2154',
    minEasting: minE - margin,
    minNorthing: minN - margin,
    maxEasting: maxE + margin,
    maxNorthing: maxN + margin,
    limit
  };
}

for (const plot of ['brouennes', 'mouzay']) {
  const folder = resolve(ROOT, 'test-fixtures/fr-urban-rules', plot);
  const { boundary } = JSON.parse(await readFile(resolve(folder, 'roads.json'), 'utf8'));
  for (const [name, kind, margin, limit] of [
    ['parcels', 'parcel', 40, 200],
    ['buildings', 'building', 50, 500]
  ]) {
    const query = box(boundary.ring, margin, limit);
    const answer = await sources[kind].query(query);
    await writeFile(
      resolve(folder, `${name}.json`),
      `${JSON.stringify({ date: new Date().toISOString(), kind, query, answer }, undefined, 2)}\n`
    );
    console.log(
      plot,
      name,
      Array.isArray(answer) ? `${answer.length} features` : JSON.stringify(answer)
    );
  }
}
