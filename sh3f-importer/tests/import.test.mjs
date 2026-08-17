/**
 * Reading a whole `.sh3f`, against a fixture built in the test.
 *
 * The archive, the image decoder and the text decoder are the **host's**
 * capabilities (ADR-0037 Rule 9); the doubles below stand in for them and are
 * the only thing this test fakes. Everything the importer does with what they
 * return is real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { directoryOf, findEntry, readSh3f, sh3fImporter } from '../src/index.js';

const CATALOGUE = 'PluginFurnitureCatalog.properties';

/** Latin-1 bytes, because that is what a real `.properties` file is. */
function latin1(text) {
  const bytes = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at += 1) {
    bytes[at] = text.charCodeAt(at) & 0xff;
  }
  return bytes;
}

/** A host context, with the three capabilities and nothing else (Rule 9). */
function hostContext(files, options = {}) {
  const warnings = [];
  const progress = [];
  const controller = new AbortController();

  const context = {
    signal: controller.signal,
    report: (value) => {
      progress.push(value);
      options.onProgress?.(value, controller);
    },
    warn: (warning) => warnings.push(warning),
    capabilities: {
      readArchive: async () => ({
        entries: () =>
          Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length })),
        read: async (path) => {
          const bytes = files[path];
          if (bytes === undefined) throw new Error(`no entry ${path}`);
          return bytes;
        }
      }),
      decodeImage: async () => ({ width: options.imageWidth ?? 64, height: 64 }),
      // The real host uses `TextDecoder`, which Node has natively.
      text: (bytes, encoding) => new TextDecoder(encoding).decode(bytes)
    }
  };

  return { context, warnings, progress, controller };
}

function source(name = 'Contributions.sh3f') {
  return { name, signature: new Uint8Array(), bytes: async () => new Uint8Array() };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** One catalogue, written the way Sweet Home 3D writes one. */
const CATALOGUE_TEXT = [
  'id=eTeks#contributions',
  'name=Contributions',
  'license=CC-BY-4.0',
  'contributor=eTeks',
  '# furniture follows',
  'id#1=eTeks#chair',
  'name#1=Chaise pliante en m\\u00e9tal',
  'category#1=Si\\u00e8ges',
  'width#1=45',
  'depth#1=50',
  'height#1=90',
  'creator#1=eTeks',
  'planIcon#1=chairPlan.png',
  'icon#1=chair.png',
  'model#1=chair.obj',
  'movable#1=true',
  '',
  'name#2=Porte simple',
  'category#2=Portes',
  'width#2=83',
  'depth#2=10',
  'height#2=204',
  'elevation#2=0',
  'doorOrWindow#2=true',
  '',
  'name#3=Fen\\u00eatre',
  'category#3=Fen\\u00eatres',
  'width#3=120',
  'depth#3=10',
  'height#3=100',
  'elevation#3=90',
  'doorOrWindow#3=true',
  '',
  'name#4=Plan de travail',
  'category#4=Cuisine',
  'width#4=200',
  'depth#4=60',
  'movable#4=false'
].join('\n');

function library(overrides = {}) {
  return {
    [CATALOGUE]: latin1(overrides.catalogue ?? CATALOGUE_TEXT),
    'chairPlan.png': PNG,
    'chair.png': PNG,
    ...overrides.files
  };
}

/* -------------------------------------------------------------------------- */

test('the importer claims .sh3f by extension and declares no ZIP signature', () => {
  // A `PK\x03\x04` signature would claim every .aspkg, .docx and .jar a user
  // ever drops, and the host treats a signature as the strongest evidence there
  // is.
  assert.deepEqual(sh3fImporter.extensions, ['.sh3f']);
  assert.equal(sh3fImporter.signatures, undefined);
  assert.equal(sh3fImporter.id, 'sh3f');
});

test('reads the library and every item', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.equal(result.library.id, 'eTeks#contributions');
  assert.equal(result.library.name, 'Contributions');
  assert.equal(result.library.licence, 'CC-BY-4.0');
  assert.equal(result.library.contributor, 'eTeks');
  assert.equal(result.assets.length, 4);
});

test('names keep their accents, asserted exactly', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].name, 'Chaise pliante en métal');
  assert.deepEqual(result.assets[0].categoryPath, ['Sièges']);
  assert.equal(result.assets[2].name, 'Fenêtre');
});

test('dimensions are metres, asserted as specific values', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  // 45 cm × 50 cm, centred on the origin.
  const footprint = result.assets[0].representation2d.footprint;
  assert.deepEqual(footprint[0], { x: -0.225, y: -0.25 });
  assert.deepEqual(footprint[2], { x: 0.225, y: 0.25 });
});

test('a door is wall-hosted with metre dimensions and no sill', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);
  const door = result.assets[1];

  assert.deepEqual(door.realisation, {
    kind: 'wall-hosted',
    openingKind: 'door',
    width: 0.83,
    height: 2.04,
    sill: 0
  });
});

test('a window is wall-hosted, and its elevation becomes the sill', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);
  const window = result.assets[2];

  assert.deepEqual(window.realisation, {
    kind: 'wall-hosted',
    openingKind: 'window',
    width: 1.2,
    height: 1,
    sill: 0.9
  });
});

test('passage is never emitted', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  for (const asset of result.assets) {
    assert.notEqual(asset.realisation.openingKind, 'passage');
  }
});

test('the raw doorOrWindow and elevation are carried as source metadata', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[2].metadata.doorOrWindow, 'true');
  assert.equal(result.assets[2].metadata.elevation, '90');
});

test('an item near the door/window threshold warns, naming itself', async () => {
  const { context, warnings } = hostContext(
    library({
      catalogue: [
        'name=L',
        'name#1=Porte basse',
        'width#1=80',
        'depth#1=10',
        'elevation#1=12',
        'doorOrWindow#1=true'
      ].join('\n')
    })
  );

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].realisation.openingKind, 'window');
  const warning = warnings.find((entry) => entry.code === 'ambiguous-opening');
  assert.ok(warning);
  assert.match(warning.message, /Porte basse/);
});

test('everything else is standalone', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].realisation.kind, 'standalone');
  assert.equal(result.assets[3].realisation.kind, 'standalone');
});

test('movable=false drops the movable capability and nothing else', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.ok(result.assets[0].capabilities.includes('movable'));
  assert.ok(!result.assets[3].capabilities.includes('movable'));
  assert.ok(result.assets[3].capabilities.includes('rotatable'));
});

/* -------------------------------------------------------------------------- */

test('the plan icon becomes the sprite, scaled from the decoded image', async () => {
  const { context } = hostContext(library(), { imageWidth: 90 });

  const result = await readSh3f(source(), context);

  // 90 px over 0.45 m is 200 px per metre.
  assert.deepEqual(result.assets[0].representation2d.symbol, {
    kind: 'sprite',
    payloadKey: 'eTeks#chair',
    pixelsPerMetre: 200
  });
  assert.ok(result.payloads.some((payload) => payload.key === 'eTeks#chair'));
});

test('the perspective icon becomes a preview payload and never a plan symbol', async () => {
  // A 3/4 render drawn into a floor plan is simply wrong. Footprint-only is
  // worse looking and correct.
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.ok(result.payloads.some((payload) => payload.key === 'eTeks#chair--preview'));
  assert.equal(result.assets[0].representation2d.symbol.payloadKey, 'eTeks#chair');
});

test('no plan icon means footprint-only, with one warning and no fallback', async () => {
  const { context, warnings } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[3].representation2d.symbol, undefined);
  const warning = warnings.find(
    (entry) => entry.code === 'missing-plan-icon' && entry.subject === 'Plan de travail'
  );
  assert.ok(warning);
});

test('a plan icon the archive does not contain warns rather than failing', async () => {
  const { context, warnings } = hostContext({
    [CATALOGUE]: latin1(
      ['name=L', 'name#1=A', 'width#1=10', 'depth#1=10', 'planIcon#1=absent.png'].join('\n')
    )
  });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].representation2d.symbol, undefined);
  assert.ok(warnings.some((entry) => entry.code === 'missing-plan-icon'));
});

test('the 3D model is recorded as a reference and never read', async () => {
  const files = library();
  const { context } = hostContext(files);

  const result = await readSh3f(source(), context);

  assert.deepEqual(result.assets[0].representation3d, {
    format: 'obj',
    reference: 'chair.obj'
  });
  // And no payload carries it: extracting megabytes nobody can display would
  // multiply storage for no capability (ADR-0038 Rule 21).
  assert.ok(!result.payloads.some((payload) => payload.bytes === files['chair.obj']));
});

/* -------------------------------------------------------------------------- */

test('identity comes from id#i where the author supplied one', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].sourceKey, 'eTeks#chair');
});

test('identity falls back to a normalised name, never the index', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[1].sourceKey, 'porte-simple');
  assert.equal(result.assets[3].sourceKey, 'plan-de-travail');
});

test('a normalisation collision fails the whole import', async () => {
  // Not suffixed: a suffix assigned by position is the index problem wearing a
  // disguise, and it breaks re-import for good.
  const { context } = hostContext(
    library({
      catalogue: [
        'name=L',
        'name#1=\\u00c9tag\\u00e8re',
        'width#1=10',
        'depth#1=10',
        'name#2=etagere',
        'width#2=10',
        'depth#2=10'
      ].join('\n')
    })
  );

  await assert.rejects(readSh3f(source(), context), /normalise to the identifier/);
});

/* -------------------------------------------------------------------------- */

test('an item missing a required field is skipped, with a warning, and its siblings import', async () => {
  const { context, warnings } = hostContext(
    library({
      catalogue: [
        'name=L',
        'name#1=Good',
        'width#1=45',
        'depth#1=50',
        'name#2=No width',
        'depth#2=50',
        'name#3=Also good',
        'width#3=45',
        'depth#3=50'
      ].join('\n')
    })
  );

  const result = await readSh3f(source(), context);

  assert.deepEqual(
    result.assets.map((asset) => asset.name),
    ['Good', 'Also good']
  );
  assert.ok(warnings.some((entry) => entry.code === 'missing-field' && entry.subject === '2'));
});

test('an archive with no catalogue is a fatal error naming the file', async () => {
  const { context } = hostContext({ 'readme.txt': new Uint8Array() });

  await assert.rejects(
    readSh3f(source('not-a-library.sh3f'), context),
    /not-a-library\.sh3f.*not a Sweet Home 3D furniture library/s
  );
});

/* -------------------------------------------------------------------------- */

test('a library with no licence records unknown and warns prominently', async () => {
  const { context, warnings } = hostContext(
    library({
      catalogue: ['name=Unlicensed', 'name#1=A', 'width#1=10', 'depth#1=10'].join('\n')
    })
  );

  const result = await readSh3f(source(), context);

  assert.equal(result.library.licence, 'unknown');
  const warning = warnings.find((entry) => entry.code === 'no-licence');
  assert.ok(warning);
  assert.match(warning.message, /before redistributing/);
});

test('per-item creator is recorded', async () => {
  const { context } = hostContext(library());

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].creator, 'eTeks');
  assert.equal(result.assets[1].creator, undefined);
});

/* -------------------------------------------------------------------------- */

test('progress is reported per item, so a large library never trips the stall budget', async () => {
  const { context, progress } = hostContext(library());

  await readSh3f(source(), context);

  assert.equal(progress.length, 4);
  assert.deepEqual(progress[3], { completed: 4, total: 4, label: 'Plan de travail' });
});

test('cancellation is honoured between items', async () => {
  // Checked between items rather than inside one: an item is small and a
  // half-parsed one is worthless.
  const { context, progress } = hostContext(library(), {
    onProgress: (value, controller) => {
      if (value.completed === 2) controller.abort();
    }
  });

  const result = await readSh3f(source(), context);

  assert.equal(progress.length, 2);
  assert.equal(result.assets.length, 2);
});

/* -------------------------------------------------------------------------- */

test('directoryOf answers the folder an entry sits in', () => {
  assert.equal(directoryOf('PluginFurnitureCatalog.properties'), '');
  assert.equal(directoryOf('eTeks/PluginFurnitureCatalog.properties'), 'eTeks');
  assert.equal(directoryOf('a/b/c.png'), 'a/b');
});

test('findEntry matches an exact path first', () => {
  const entries = [{ path: 'chair.png' }, { path: 'nested/chair.png' }];
  assert.equal(findEntry(entries, 'nested/chair.png', '').path, 'nested/chair.png');
});

test('findEntry tolerates a rooted or dot-relative reference', () => {
  // Real libraries write all three forms; an exact match found none of them,
  // so every preview was silently missing.
  const entries = [{ path: 'resources/chair.png' }];
  assert.equal(findEntry(entries, '/resources/chair.png', '').path, 'resources/chair.png');
  assert.equal(findEntry(entries, './resources/chair.png', '').path, 'resources/chair.png');
});

test('findEntry resolves against the catalogue’s own directory', () => {
  const entries = [{ path: 'eTeks/chair.png' }];
  assert.equal(findEntry(entries, 'chair.png', 'eTeks').path, 'eTeks/chair.png');
});

test('findEntry falls back to a unique file name', () => {
  const entries = [{ path: 'deep/inside/here/chair.png' }];
  assert.equal(findEntry(entries, 'somewhere/else/chair.png', '').path, 'deep/inside/here/chair.png');
});

test('findEntry refuses an ambiguous file name rather than guessing', () => {
  // Two `chair.png` in different folders is exactly the case where attaching
  // the wrong picture to the wrong item would go unnoticed.
  const entries = [{ path: 'a/chair.png' }, { path: 'b/chair.png' }];
  assert.equal(findEntry(entries, 'c/chair.png', ''), undefined);
});

test('an icon that cannot be resolved warns instead of failing silently', async () => {
  const { context, warnings } = hostContext({
    [CATALOGUE]: latin1(
      ['name=L', 'name#1=A', 'width#1=10', 'depth#1=10', 'icon#1=nowhere/a.png'].join('\n')
    )
  });

  const result = await readSh3f(source(), context);

  assert.equal(result.payloads.length, 0);
  const warning = warnings.find((entry) => entry.code === 'missing-icon');
  assert.ok(warning);
  assert.match(warning.message, /nowhere\/a\.png/);
});

test('icons resolve when the catalogue sits in a subdirectory', async () => {
  // The whole failure, end to end: a nested catalogue whose icon references are
  // relative to it. Before `findEntry` this produced no payloads at all.
  const { context } = hostContext({
    'eTeks/PluginFurnitureCatalog.properties': latin1(
      [
        'name=Nested',
        'name#1=Chair',
        'width#1=45',
        'depth#1=50',
        'icon#1=chair.png',
        'planIcon#1=chairPlan.png'
      ].join('\n')
    ),
    'eTeks/chair.png': PNG,
    'eTeks/chairPlan.png': PNG
  });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].representation2d.symbol.kind, 'sprite');
  assert.deepEqual(
    result.payloads.map((payload) => payload.key).sort(),
    ['chair', 'chair--preview']
  );
});
