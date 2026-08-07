/**
 * Starter test. Runs with `node --test` — no install, no build step, because the
 * entry point is plain ES module JavaScript the runtime can import directly.
 *
 * That is the same property the application relies on when it hot-reloads this
 * package from a Development Repository, so a test that needed a build step
 * would be testing something other than what ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, activate, deactivate } from '../src/index.js';

const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);

test('the manifest declares an extension that needs the ai capability', () => {
  assert.equal(manifest.type, 'extension');
  assert.equal(manifest.entryPoint, 'src/index.js');
  assert.deepEqual(manifest.capabilities, ['ai']);
  assert.equal(manifest.sdkVersion, '1.0');
});

test('exports the extension contract', () => {
  assert.equal(typeof activate, 'function');
  assert.equal(typeof deactivate, 'function');
});

test('maximum buildable area is footprint times permitted storeys', () => {
  const result = __testing.computeMaxBuildableArea(
    { plotAreaSquareMetres: 500, siteCoverageRatio: 0.4, maxStoreys: 2 },
    2
  );
  assert.deepEqual(result, {
    footprintSquareMetres: 200,
    storeys: 2,
    maxFloorAreaSquareMetres: 400
  });
});

test('a storey count above the local plan is capped, not granted', () => {
  const result = __testing.computeMaxBuildableArea(
    { plotAreaSquareMetres: 500, siteCoverageRatio: 0.4, maxStoreys: 2 },
    5
  );
  assert.equal(result.storeys, 2);
  assert.equal(result.maxFloorAreaSquareMetres, 400);
});

test('the skill is synchronous and rejects a plot area that is not a number', () => {
  const outcome = __testing.maxBuildableAreaSkill.execute({ plotAreaSquareMetres: 'big' }, {});
  assert.equal(typeof outcome.then, 'undefined', 'a skill must not return a promise');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.code, 'invalid_input');
});

test('the skill answers a well-formed request', () => {
  const outcome = __testing.maxBuildableAreaSkill.execute(
    { plotAreaSquareMetres: 1000, siteCoverageRatio: 0.5, maxStoreys: 3, storeys: 3 },
    {}
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.value.maxFloorAreaSquareMetres, 1500);
});

test('the stage provider warns when the programme exceeds the local plan', () => {
  const provider = __testing.createProgrammeRules(undefined, undefined);
  assert.equal(provider.stage, 'programme');

  const programme = Object.freeze({
    kind: 'space-programme',
    storeys: 2,
    totalArea: 600,
    spaces: Object.freeze([]),
    assumptions: Object.freeze([]),
    warnings: Object.freeze([])
  });

  const enriched = provider.enrich(programme);

  // 500 m² plot × 40% × 2 storeys = 400 m² permitted, 600 m² requested.
  assert.equal(enriched.warnings.length, 1);
  assert.match(enriched.warnings[0], /exceeds the 400 m²/);
  assert.equal(enriched.assumptions.length, 2);
});

test('the stage provider never mutates the artefact it is given', () => {
  const provider = __testing.createProgrammeRules(undefined, undefined);
  const warnings = Object.freeze([]);
  const programme = Object.freeze({
    storeys: 1,
    totalArea: 50,
    spaces: Object.freeze([]),
    assumptions: Object.freeze([]),
    warnings
  });

  const enriched = provider.enrich(programme);

  assert.notEqual(enriched, programme, 'must return a new object');
  assert.equal(programme.warnings, warnings, 'the input must be untouched');
  assert.equal(programme.assumptions.length, 0);
});

test('a programme within the limits gets the rules recorded and no warning', () => {
  const provider = __testing.createProgrammeRules(undefined, undefined);
  const enriched = provider.enrich({
    storeys: 2,
    totalArea: 300,
    spaces: [],
    assumptions: [],
    warnings: []
  });

  assert.equal(enriched.warnings.length, 0);
  assert.match(enriched.assumptions[1], /Maximum buildable floor area is 400 m²/);
});

test('an artefact that is not a programme is returned untouched', () => {
  const provider = __testing.createProgrammeRules(undefined, undefined);
  const notAProgramme = { kind: 'architectural-brief' };
  assert.equal(provider.enrich(notAProgramme), notAProgramme);
});
