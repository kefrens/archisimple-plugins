/**
 * The package: manifest, contract, translations and mapping tables (Sprint
 * 002.0, criteria 1, 2 and 7's URL half). Runs with `node --test` from the
 * repository root — no install, no build: the entry point is the plain ESM the
 * Development Repository evaluates.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, activate, deactivate } from '../src/index.js';

const read = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('../package.json'));
const source = await read('../src/index.js');
const en = JSON.parse(await read('../resources/i18n/fr-urban-rules/en.json'));
const fr = JSON.parse(await read('../resources/i18n/fr-urban-rules/fr.json'));

/** The SDK's closed category list (`REGULATION_FEATURE_CATEGORIES`, SDK 1.25). */
const SDK_CATEGORIES = [
  'zone',
  'prescription',
  'easement',
  'risk',
  'setback-band',
  'envelope',
  'alignment',
  'information'
];

test('criterion 1: the manifest declares an SDK 1.38 extension (002.15: the `stat`, `choice` and `section` blocks; 002.14: a flag’s icon, group, title, code and level; 002.13: the plot view, the edge list, the height section, an assumption’s figure) needing `regulations` and, since 002.1a, `document`', () => {
  assert.equal(manifest.id, 'com.archisimple.fr-urban-rules');
  assert.equal(manifest.type, 'extension');
  assert.equal(manifest.version, '0.13.0');
  // 1.38 since 002.15: the `stat`, `choice` and `section` blocks (platform 096.27).
  // 1.37 since 002.14: a flag's `icon`, `group`, `title`, `code` and `level` (platform 096.25).
  // 1.36 since 002.13: `plot-plan` in a view, the `edges` and `height-section` blocks and an
  // assumption's `figure` (platform 096.22). 1.35 since 002.12: a view's `icon`, `group` and `summary`, the report's `locality` (platform
  // 096.19, SDK 1.34) and an assumption's `detail` (096.21, SDK 1.35; `allowed` is the host's too,
  // sent by no rule shape here). 1.33 since 002.11: `readCache` / `writeCache` / `onDidChangeCache` (096.17,
  // ADR-0115). 1.32 since 002.8 (DEC-10): `checkVariation` (1.31, 096.11) and
  // `questions` (1.32, 096.12). 1.30 since 002.7: an envelope's `volume` (1.29)
  // and the report's `sheet` (1.30). 1.28 since 002.6a: `plugin-service` and `locate()`.
  assert.equal(manifest.sdkVersion, '1.38');
  assert.equal(manifest.entryPoint, 'src/index.js');
  // `document` since 002.1a: `SitePackageDataService.write` requires it (096.4 DEC-7),
  // and an answer's offer too (096.12 DEC-12). `ai` since 002.3: the programme stage,
  // and since 002.8 the questions (without it the host offers none). `commands` since
  // 002.4: the developer capture command (DEC-2).
  assert.deepEqual(manifest.capabilities, ['regulations', 'document', 'ai', 'commands']);
  assert.deepEqual(manifest.resources, ['i18n']);
  assert.deepEqual(manifest.dependencies, []);
});

test('002.8 DEC-9 / criterion 1: `network.hosts` is FETCHED_HOSTS, and every other https:// literal of the source is a link host (RD-4)', () => {
  const { FETCHED_HOSTS, LINK_HOSTS } = __testing;
  assert.deepEqual(manifest.network, { hosts: FETCHED_HOSTS });
  // The fetch bases are on the list the code reads (fetchJson refuses any other).
  const literals = [...source.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)].map((m) => m[1]);
  assert.ok(literals.length > 0);
  for (const host of literals) {
    assert.ok(
      FETCHED_HOSTS.includes(host) || LINK_HOSTS.includes(host),
      `${host} is on neither FETCHED_HOSTS nor LINK_HOSTS`
    );
  }
  for (const host of FETCHED_HOSTS) assert.ok(literals.includes(host), `${host} is fetched`);
  // A link is never a contact: legifrance stays off the card.
  for (const host of LINK_HOSTS) assert.equal(FETCHED_HOSTS.includes(host), false);
  // The companion service's hosts are its own (002.5a), never the package's.
  assert.equal(manifest.network.hosts.includes('data.geopf.fr'), false);
});

test('002.8 DEC-9: the README’s « Hosts contacted » table names exactly FETCHED_HOSTS, besides the editor’s own origin', async () => {
  const readme = await read('../README.md');
  const section = readme.split('## Hosts contacted')[1].split('\n## ')[0];
  const hosts = [...section.matchAll(/^\| `([a-z0-9.-]+\.[a-z]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual(hosts, __testing.FETCHED_HOSTS);
});

test('002.8 DEC-9: fetchJson refuses a host that is not on FETCHED_HOSTS, without fetching', async () => {
  let asked = 0;
  const answer = await __testing.fetchJson(
    async () => {
      asked += 1;
      return { ok: true, status: 200, text: async () => '{}' };
    },
    'https://example.org/api',
    new AbortController().signal,
    1000
  );
  assert.equal(asked, 0);
  assert.equal(answer.failed, 'network');
});

test('exports the extension contract', () => {
  assert.equal(typeof activate, 'function');
  assert.equal(typeof deactivate, 'function');
});

test('one file, no import: the entry point names no module', () => {
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
});

test('no second projection: no Lambert constant or formula in the entry point', () => {
  // The IGN Lambert-93 constants (n, C, Xs, Ys) and the false easting.
  for (const constant of ['0.7256077650', '11754255.426', '700000', '12655612.05', 'atanh']) {
    assert.equal(source.includes(constant), false, `${constant} is the host's`);
  }
});

test('criterion 2: both locales hold the same keys, and every key the source names exists in both', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  const named = new Set(
    source.match(/'fr-urban-rules\.[A-Za-z0-9._-]+'/g).map((key) => key.slice(1, -1))
  );
  for (const key of named) {
    assert.ok(key in en, `${key} missing from en.json`);
    assert.ok(key in fr, `${key} missing from fr.json`);
  }
  // Sprint 002.12: an assumption's `.detail` is named by convention — the title's key plus
  // `.detail`, added when the report is shaped for the panel — never written out.
  for (const key of Object.keys(en)) {
    const detailOf = key.endsWith('.detail') ? key.slice(0, -'.detail'.length) : undefined;
    assert.ok(
      named.has(key) || (detailOf !== undefined && named.has(detailOf)),
      `${key} is shipped but never named`
    );
  }
});

test('002.12 criterion 5: every assumption has a short title and a detail, in en and fr', () => {
  const titles = Object.keys(en).filter(
    (key) => key.startsWith('fr-urban-rules.assumption.') && !key.endsWith('.detail')
  );
  assert.equal(titles.length, 57);
  for (const [language, strings] of [
    ['en', en],
    ['fr', fr]
  ]) {
    for (const key of titles) {
      assert.ok(strings[key].length <= 80, `${language} ${key}: the title is ${strings[key].length} characters`);
      assert.equal(typeof strings[`${key}.detail`], 'string', `${language} ${key} has no detail`);
      assert.ok(strings[`${key}.detail`].length > 0, `${language} ${key}: an empty detail`);
      // Placeholders are preserved: whatever the old sentence named, title and detail say.
      assert.doesNotMatch(strings[key], /\.$/, `${language} ${key}: a title is not a sentence`);
    }
  }
});

test('DEC-10: the row keeps its French legal name in both locales', () => {
  assert.equal(en['fr-urban-rules.source.label'], 'Règles d’urbanisme (PLU)');
  assert.equal(fr['fr-urban-rules.source.label'], 'Règles d’urbanisme (PLU)');
});

test('activate registers one regulation source, by token name, into subscriptions', () => {
  const registered = [];
  const subscriptions = [];
  activate({
    services: {
      get: (token) => {
        assert.equal(token.name, 'regulations');
        return { registerRegulationSource: (s) => (registered.push(s), { dispose() {} }) };
      },
      getOptional: () => undefined
    },
    logger: { debug() {} },
    subscriptions: { add: (d) => subscriptions.push(d) }
  });
  assert.equal(registered.length, 1);
  assert.equal(registered[0].id, 'fr-urban-rules.gpu');
  assert.equal(registered[0].labelKey, 'fr-urban-rules.source.label');
  assert.equal(typeof registered[0].read, 'function');
  // 002.0 had none (Refresh is the host's); 002.1a's edge-role actions run here.
  assert.equal(typeof registered[0].runAction, 'function');
  // 002.8: the parked variations' checks (SDK 1.31) and the four questions (SDK 1.32).
  assert.equal(typeof registered[0].checkVariation, 'function');
  assert.deepEqual(
    registered[0].questions.map((q) => q.id),
    ['can_add_storey', 'road_distance', 'max_height', 'remaining_area']
  );
  assert.equal(subscriptions.length, 2, 'the source, and the reader’s own disposal');
  assert.equal(typeof subscriptions[1].dispose, 'function');
  subscriptions[1].dispose();
  deactivate();
});

test('002.3 DEC-7: with the `ai` service, activate also registers the programme stage, into subscriptions', () => {
  const stages = [];
  const subscriptions = [];
  activate({
    services: {
      get: () => ({ registerRegulationSource: () => ({ dispose() {} }) }),
      getOptional: (token) =>
        token.name === 'ai'
          ? { registerPlanningStage: (s) => (stages.push(s), { dispose() {} }) }
          : undefined
    },
    logger: { debug() {} },
    subscriptions: { add: (d) => subscriptions.push(d) }
  });
  assert.equal(stages.length, 1);
  assert.equal(stages[0].id, 'fr-urban-rules.programme');
  assert.equal(stages[0].stage, 'programme');
  assert.equal(typeof stages[0].enrich, 'function');
  assert.equal(subscriptions.length, 3, 'the source, the stage, and the reader’s own disposal');
  // No Site: the programme comes back as it was.
  const programme = { spaces: [], assumptions: [], warnings: [] };
  assert.equal(stages[0].enrich(programme), programme);
  subscriptions[2].dispose();
  deactivate();
});

test('review 5: the centroid weights each ring by its |area|, whatever its winding', () => {
  const square = (x, size, clockwise) => {
    const ring = [
      [x, 0],
      [x + size, 0],
      [x + size, size],
      [x, size]
    ];
    return clockwise ? ring.reverse() : ring;
  };
  // A unit square at 0 and a 3×3 square at 10, wound oppositely: (1·0.5 + 9·11.5) / 10.
  const c = __testing.centroidOf([square(0, 1, false), square(10, 3, true)]);
  assert.ok(Math.abs(c.longitude - 10.4) < 1e-9);
  assert.ok(Math.abs(c.latitude - (1 * 0.5 + 9 * 1.5) / 10) < 1e-9);
});

test('review 8: a plot across two communes reads the one holding most of it', () => {
  const parcel = (code, size) => ({
    sourceId: 's',
    featureId: code,
    properties: { code_insee: code, idu: `${code}000AB0001` },
    rings: [
      [
        { easting: 0, northing: 0 },
        { easting: size, northing: 0 },
        { easting: size, northing: size },
        { easting: 0, northing: size }
      ]
    ]
  });
  assert.equal(
    __testing.preferredCommune({ parcels: [parcel('55083', 10), parcel('55364', 30)] }),
    '55364'
  );
  assert.equal(__testing.preferredCommune({ parcels: [parcel('69382', 10)] }), '69123');
});

test('DEC-4: PLM arrondissements map to their commune; others are kept', () => {
  const { communeOf } = __testing;
  assert.equal(communeOf('69382'), '69123');
  assert.equal(communeOf('69381'), '69123');
  assert.equal(communeOf('75108'), '75056');
  assert.equal(communeOf('13216'), '13055');
  assert.equal(communeOf('69123'), '69123');
  assert.equal(communeOf('84050'), '84050');
  assert.equal(communeOf('2A004'), '2A004');
});

test('DEC-11: every easement type maps onto the SDK’s closed categories', () => {
  for (const [code, mapping] of Object.entries(__testing.SUPTYPES)) {
    assert.ok(SDK_CATEGORIES.includes(mapping.category), `${code} → ${mapping.category}`);
  }
  assert.equal(__testing.SUPTYPES.ac1.flag, 'abf');
  assert.equal(__testing.SUPTYPES.ac4.flag, 'abf');
  assert.equal(__testing.SUPTYPES.ac2.flag, 'site');
  assert.equal(__testing.SUPTYPES.pm1.category, 'risk');
  assert.equal(__testing.SUPTYPES.el7.category, 'alignment');
});

test('DEC-13: GPU dates become ISO days; an unreadable one is dropped', () => {
  assert.equal(__testing.isoDate('20260326'), '2026-03-26');
  assert.equal(__testing.isoDate('20260231'), undefined);
  assert.equal(__testing.isoDate('2026'), undefined);
  assert.equal(__testing.idurbaDate('200046977_PLUI_20260326'), '2026-03-26');
});

test('DEC-3: rings lose their closing point; Douglas–Peucker keeps corners and drops collinear points', () => {
  const ring = [
    { easting: 0, northing: 0 },
    { easting: 5, northing: 0.05 },
    { easting: 10, northing: 0 },
    { easting: 10, northing: 10 },
    { easting: 0, northing: 10 },
    { easting: 0, northing: 0 }
  ];
  const open = __testing.openRing(ring);
  assert.equal(open.length, 5);
  assert.deepEqual(__testing.simplifyRing(open, 0.2), [
    { easting: 0, northing: 0 },
    { easting: 10, northing: 0 },
    { easting: 10, northing: 10 },
    { easting: 0, northing: 10 }
  ]);
});

test('criterion 7 (builders): the document list is filtered; no builder reaches acte-sup, /details or /download', () => {
  const { gpuDocumentUrl, gpuFilesUrl, gpuFileHref, georisquesUrls, apiCartoRequest } = __testing;
  assert.equal(
    gpuDocumentUrl('DU_200046977'),
    'https://www.geoportail-urbanisme.gouv.fr/api/document?partition=DU_200046977&status=document.production'
  );
  // A PLUi in sectors: the document API refuses `partition=DU_<siren>_<sector>` (400).
  assert.equal(
    gpuDocumentUrl('DU_200054807_B'),
    'https://www.geoportail-urbanisme.gouv.fr/api/document?grid=200054807&status=document.production'
  );
  const point = { longitude: 4.83543, latitude: 45.76363 };
  const urls = [
    gpuDocumentUrl('DU_1'),
    gpuFilesUrl('abc'),
    gpuFileHref('abc', 'x.pdf'),
    apiCartoRequest('zone-urba', { type: 'Point', coordinates: [4.8, 45.7] }).url,
    ...Object.values(georisquesUrls).map((build) =>
      build({ commune: '69123', code: '69123', point })
    )
  ];
  for (const url of urls) assert.doesNotMatch(url, /acte-sup|\/details|\/download/);
  const pprn = georisquesUrls['georisques-pprn']({ point });
  assert.match(pprn, /[?&]longitude=4\.83543/);
  assert.match(pprn, /[?&]latitude=45\.76363/);
  assert.doesNotMatch(pprn, /latlon/);
});

test('DEC-4: a geometry past 6,000 encoded characters travels in a POST body', () => {
  const ring = Array.from({ length: 400 }, (_, i) => [4.8 + i * 1e-5, 45.7 + (i % 7) * 1e-5]);
  ring.push(ring[0]);
  const big = __testing.apiCartoRequest('zone-urba', {
    type: 'MultiPolygon',
    coordinates: [[ring]]
  });
  assert.equal(big.url, 'https://apicarto.ign.fr/api/gpu/zone-urba');
  assert.equal(big.body.geom.type, 'MultiPolygon');
  const small = __testing.apiCartoRequest('zone-urba', { type: 'Point', coordinates: [4.8, 45.7] });
  assert.equal(small.body, undefined);
  assert.match(small.url, /\?geom=%7B/);
});

test('002.8 criterion 2: four questions, ids and parameters as DEC-1, descriptions in English within 500 characters saying what they do not answer', () => {
  const { createReader } = __testing;
  const reader = createReader({ fetch: async () => undefined, site: () => undefined });
  const byId = Object.fromEntries(reader.questions.map((q) => [q.id, q]));
  assert.deepEqual(Object.keys(byId), ['can_add_storey', 'road_distance', 'max_height', 'remaining_area']);
  for (const question of reader.questions) {
    assert.match(question.id, /^[a-z0-9_]{1,40}$/);
    // 096.12: the tool name `regulations_<id>` within a provider's ^[a-zA-Z0-9_-]{1,64}$.
    assert.match(`regulations_${question.id}`, /^[a-zA-Z0-9_-]{1,64}$/);
    assert.ok(question.description.length >= 1 && question.description.length <= 500, question.id);
    assert.match(question.description, /does not decide whether a permit will be granted/i);
    assert.ok(Object.keys(question.parameters ?? {}).length <= 6);
    for (const key of Object.keys(question.parameters ?? {})) assert.match(key, /^[A-Za-z0-9_]{1,40}$/);
    assert.equal(typeof question.answer, 'function');
  }
  assert.deepEqual(byId.can_add_storey.parameters.storeyHeight, {
    kind: 'number',
    description: byId.can_add_storey.parameters.storeyHeight.description,
    unit: 'm',
    min: 2,
    max: 6
  });
  for (const id of ['can_add_storey', 'road_distance', 'max_height']) {
    assert.equal(byId[id].parameters.building.kind, 'text');
    assert.equal(byId[id].parameters.building.required, undefined, 'optional');
  }
  assert.deepEqual(Object.keys(byId.road_distance.parameters), ['building']);
  assert.deepEqual(Object.keys(byId.max_height.parameters), ['building']);
  assert.equal(byId.remaining_area.parameters, undefined);
  reader.dispose();
});
