/**
 * The acceptance tooling (Sprint 002.4, DEC-2 and criteria 2 and 6), tested
 * without the captured fixtures: the recorder the capture command wraps the
 * services in, the replays the end-to-end tests read through, and the command
 * itself. No network: the global `fetch` throws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { __testing, activate, deactivate } from '../src/index.js';
import { replayFetch, replayService } from './helpers.mjs';

const { recordingService, recordingFetch, CAPTURE_COMMAND_ID, DEV_CAPTURE_PREFERENCE } = __testing;

/** The host's preferences service holding the given values (002.4 Q8). */
const preferences = (values) => ({ get: (key) => values[key], set() {}, delete() {} });
const devCaptureOn = () => preferences({ 'fr-urban-rules.devCapture': true });

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

/** A Site service shaped like the SDK's, with measures that depend on their inputs. */
function fakeSite() {
  return Object.freeze({
    current: () => ({ anchor: { latitude: 45, longitude: 4 }, crs: 'EPSG:2154', parcels: [] }),
    elevationAt: (p) => ({ available: true, elevation: p.easting / 1000, verticalDatum: 'NGF' }),
    toGeographicRing: (ring) => ring.map((p) => ({ latitude: p.northing, longitude: p.easting })),
    variations: () => [{ id: 'v', name: 'A', master: true, open: true }],
    measures: Object.freeze({
      floorAreas: ({ buildingId, heightBands }) => ({
        available: true,
        buildingId,
        total: 100 * (heightBands?.length ?? 1)
      }),
      distances: (input) => ({ available: true, targets: input.targets.map(() => ({})) })
    })
  });
}

class Entity {
  constructor(id, name) {
    this.id = id;
    this.held = name;
  }
  property(key) {
    return key === 'name' ? { kind: 'string', value: this.held } : undefined;
  }
}

test('DEC-2: the recorder keeps every call, `measures.*` included, as JSON-cloned { path, args, result }', () => {
  const pairs = [];
  const site = recordingService(fakeSite(), pairs);
  site.current();
  site.measures.floorAreas({ buildingId: 'b', heightBands: [1.8] });
  site.elevationAt({ easting: 1000, northing: 2 });
  assert.deepEqual(
    pairs.map((p) => p.path),
    ['current', 'measures.floorAreas', 'elevationAt']
  );
  assert.deepEqual(pairs[1].args, [{ buildingId: 'b', heightBands: [1.8] }]);
  assert.deepEqual(pairs[1].result, { available: true, buildingId: 'b', total: 100 });
  // Absent members stay absent: the reader's `typeof` tests answer as on the real service.
  assert.equal(site.onDidChange, undefined);
  assert.equal(typeof site.measures.distances, 'function');
});

test('DEC-2: a returned entity’s methods are recorded by their call, and replay the same', () => {
  const pairs = [];
  const document = recordingService(
    { find: (type) => (type === 'Building' ? [new Entity('b1', 'Maison')] : []), transact() {} },
    pairs,
    ['transact']
  );
  const [entity] = document.find('Building');
  assert.equal(entity.id, 'b1');
  assert.deepEqual(entity.property('name'), { kind: 'string', value: 'Maison' });
  assert.equal(pairs[1].path, 'find(["Building"])[0].property');
  // The capture writes nothing (DEC-2).
  assert.throws(() => document.transact('x', () => {}), /refused while capturing/);

  const replayed = replayService(pairs, { name: 'document' });
  const [again] = replayed.find('Building');
  assert.equal(again.id, 'b1');
  assert.deepEqual(again.property('name'), { kind: 'string', value: 'Maison' });
  assert.throws(() => again.property('height'), /unrecorded document call/);
});

test('criterion 6: the replayed `site` answers a recorded input whatever its key order, and throws on a changed `heightBands`', () => {
  const pairs = [];
  const site = recordingService(fakeSite(), pairs);
  site.measures.floorAreas({ buildingId: 'b', heightBands: [1.8] });
  site.toGeographicRing([{ easting: 1, northing: 2 }]);
  const replay = replayService(pairs, { name: 'site' });
  assert.deepEqual(replay.measures.floorAreas({ heightBands: [1.8], buildingId: 'b' }), {
    available: true,
    buildingId: 'b',
    total: 100
  });
  assert.deepEqual(replay.toGeographicRing([{ northing: 2, easting: 1 }]), [
    { latitude: 2, longitude: 1 }
  ]);
  assert.deepEqual(replay.unrecorded, []);
  assert.throws(
    () => replay.measures.floorAreas({ buildingId: 'b', heightBands: [1.8, 2.2] }),
    (error) =>
      error.message ===
      'unrecorded site call: measures.floorAreas [{"buildingId":"b","heightBands":[1.8,2.2]}]'
  );
  assert.throws(() => replay.toGeographicRing([{ easting: 1, northing: 3 }]), /unrecorded site/);
  assert.equal(replay.unrecorded.length, 2, 'kept, for when the reader catches the throw');
  // Never recorded at all: absent, not answered.
  assert.equal(replay.elevationAt, undefined);
});

test('criterion 2: the replayed `fetch` answers a recorded request and throws on any other', async () => {
  const answers = [];
  const real = async (url) => new Response(JSON.stringify({ features: [], url }), { status: 200 });
  const recorded = recordingFetch(real, answers);
  const response = await recorded('https://apicarto.ign.fr/api/gpu/municipality?x=1', {});
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await response.text()).features, []);
  assert.deepEqual(
    answers.map((a) => [a.url, a.method, a.body, a.status]),
    [['https://apicarto.ign.fr/api/gpu/municipality?x=1', 'GET', null, 200]]
  );

  const fetch = replayFetch(answers);
  const again = await fetch('https://apicarto.ign.fr/api/gpu/municipality?x=1', {});
  assert.equal(again.ok, true);
  assert.equal(await again.text(), answers[0].text);
  await assert.rejects(
    fetch('https://apicarto.ign.fr/api/gpu/municipality?x=2', {}),
    /unrecorded fetch: GET https:\/\/apicarto.ign.fr\/api\/gpu\/municipality\?x=2/
  );
  await assert.rejects(
    fetch('https://apicarto.ign.fr/api/gpu/municipality?x=1', { method: 'POST', body: '{}' }),
    /unrecorded fetch: POST/
  );
  assert.deepEqual(fetch.unrecorded, [
    'https://apicarto.ign.fr/api/gpu/municipality?x=2',
    'https://apicarto.ign.fr/api/gpu/municipality?x=1'
  ]);
});

/** A context with `commands`, as the host hands an extension declaring the capability. */
function contextWithCommands(services = {}) {
  const commands = [];
  const subscriptions = [];
  const logs = [];
  const context = {
    services: {
      get: () => ({ registerRegulationSource: () => ({ dispose() {} }) }),
      getOptional: (token) => services[token.name]
    },
    commands: { register: (c) => (commands.push(c), { dispose() {} }) },
    logger: {
      debug() {},
      info: (m) => logs.push(['info', m]),
      warn: (m) => logs.push(['warn', m]),
      error: (m) => logs.push(['error', m])
    },
    subscriptions: { add: (d) => subscriptions.push(d) }
  };
  return { context, commands, subscriptions, logs };
}

test('Q8: the capture command is off by default — no preferences service, no preference, or not exactly true', () => {
  assert.equal(DEV_CAPTURE_PREFERENCE, 'fr-urban-rules.devCapture');
  for (const services of [
    {},
    { preferences: preferences({}) },
    { preferences: preferences({ 'fr-urban-rules.devCapture': false }) },
    { preferences: preferences({ 'fr-urban-rules.devCapture': 'true' }) },
    {
      preferences: {
        get: () => {
          throw new Error('storage unavailable');
        }
      }
    }
  ]) {
    const { context, commands, subscriptions } = contextWithCommands(services);
    activate(context);
    assert.equal(commands.length, 0, JSON.stringify(Object.keys(services)));
    assert.equal(subscriptions.length, 2, 'the source and the reader’s disposal');
    subscriptions.at(-1).dispose();
    deactivate();
  }
});

test('DEC-2 / Q8: with the preference on, activate registers the developer capture command, titled through i18n', () => {
  const { context, commands, subscriptions } = contextWithCommands({ preferences: devCaptureOn() });
  activate(context);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].id, 'fr-urban-rules.dev.captureFixtures');
  assert.equal(commands[0].id, CAPTURE_COMMAND_ID);
  assert.equal(commands[0].titleKey, 'fr-urban-rules.dev.captureFixtures.title');
  assert.equal(commands[0].categoryKey, 'fr-urban-rules.source.label');
  assert.equal(typeof commands[0].run, 'function');
  assert.equal(subscriptions.length, 3, 'the source, the command, and the reader’s disposal');
  subscriptions.at(-1).dispose();
  deactivate();
});

test('DEC-2: running the command reads once and downloads the six captures, writing nothing', async (t) => {
  const downloads = [];
  const blobs = new Map();
  t.mock.method(URL, 'createObjectURL', (blob) => {
    const href = `blob:${blobs.size}`;
    blobs.set(href, blob);
    return href;
  });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const link = { click: () => downloads.push({ name: link.download, href: link.href }) };
      link.remove = () => {};
      return link;
    },
    body: { appendChild() {} }
  };
  t.after(() => {
    globalThis.document = previous;
  });
  const writes = [];
  const section = { schema: 1, edgeRoles: [] };
  const { context, commands, subscriptions, logs } = contextWithCommands({
    preferences: devCaptureOn(),
    site: fakeSite(),
    'site-package-data': { read: () => section, write: (v) => writes.push(v) },
    document: { find: () => [], transact: () => writes.push('transact') }
  });
  activate(context);
  commands[0].run();
  // The read fails on every source (the global fetch throws) and still answers.
  for (let i = 0; i < 100 && downloads.length < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual(
    downloads.map((d) => d.name),
    [
      'fr-capture-site.json',
      'fr-capture-site-calls.json',
      'fr-capture-context.json',
      'fr-capture-section.json',
      'fr-capture-answers.json',
      'fr-capture-report.json'
    ]
  );
  const text = async (name) =>
    JSON.parse(await blobs.get(downloads.find((d) => d.name === name).href).text());
  assert.equal((await text('fr-capture-site.json')).crs, 'EPSG:2154');
  assert.ok((await text('fr-capture-site-calls.json')).some((p) => p.path === 'current'));
  assert.deepEqual(Object.keys(await text('fr-capture-context.json')), [
    'roads',
    'map-features',
    'document'
  ]);
  assert.deepEqual(await text('fr-capture-section.json'), section);
  assert.ok(Array.isArray(await text('fr-capture-answers.json')));
  assert.ok((await text('fr-capture-report.json')).regime);
  assert.deepEqual(writes, [], 'nothing written to the project');
  assert.ok(logs.some(([level]) => level === 'warn'), 'no host read yet: said');
  subscriptions.at(-1).dispose();
  deactivate();
});
