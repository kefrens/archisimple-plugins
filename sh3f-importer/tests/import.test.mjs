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

import {
  directoryOf,
  findEntry,
  objTriangles,
  localisedCatalogueFor,
  mtlTextures,
  objMaterialLibraries,
  parseModelRotation,
  readSh3f,
  sh3fImporter
} from '../src/index.js';

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
  const outlined = [];
  const meshed = [];
  const controller = new AbortController();

  const context = {
    signal: controller.signal,
    // The fifth member, since ADR-0037 revision 2.1. Absent here unless a test
    // sets one, which is the state an importer must also handle.
    ...(options.locale === undefined ? {} : { locale: options.locale }),
    // The sixth, since ArchiSimple Sprint 055.3. Absent unless a test asks for
    // retention — which is also what an older host looks like, and must read as
    // a "no".
    ...(options.retainModels === undefined ? {} : { retainModels: options.retainModels }),
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
      text: (bytes, encoding) => new TextDecoder(encoding).decode(bytes),
      // The sixth (ArchiSimple Sprint 056.1). Doubled the same way and for the
      // same reason: what this importer must get right is *what it sends* — the
      // triangles, the up-axis, the catalogue's real size — not the bytes that
      // come back, which are the host's own encoding.
      mesh:
        options.mesh ??
        ((mesh) => {
          meshed.push(mesh);
          return { ok: true, bytes: new Uint8Array([1, 2, 3, 4]), triangleCount: 1 };
        }),
      // The fourth capability (Sprint 041.7). The host runs a Skill behind it;
      // the double below records what it was handed, because what this importer
      // must get right is *what it sends*, not what geometry comes back.
      outline: options.outline ?? ((mesh) => {
        outlined.push(mesh);
        return {
          ok: true,
          paths: [
            {
              points: [
                { x: -0.5, y: -0.5 },
                { x: 0.5, y: -0.5 },
                { x: 0, y: 0.5 }
              ],
              closed: true
            }
          ],
          derivedFrom: { representation: '3d', skill: 'mesh.groundOutline' }
        };
      })
    }
  };

  return { context, warnings, progress, outlined, meshed, controller };
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
  // `footprint-only` since Sprint 042.1, and emitted **once per asset** rather
  // than once per cause. The old `missing-plan-icon` fired before the derivation
  // had its turn, so a library that ended up perfectly well drawn still produced
  // a line per asset.
  const warning = warnings.find(
    (entry) => entry.code === 'footprint-only' && entry.subject === 'Plan de travail'
  );
  assert.ok(warning);
  assert.equal(warnings.filter((entry) => entry.subject === 'Plan de travail').length, 1);
});

test('a plan icon the archive does not contain warns rather than failing', async () => {
  const { context, warnings } = hostContext({
    [CATALOGUE]: latin1(
      ['name=L', 'name#1=A', 'width#1=10', 'depth#1=10', 'planIcon#1=absent.png'].join('\n')
    )
  });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].representation2d.symbol, undefined);
  const warning = warnings.find((entry) => entry.code === 'footprint-only');
  assert.ok(warning);
  // The cause is still named: a plan icon the archive does not yield is either a
  // malformed library or a path convention this importer does not handle, and
  // the message has to say which entry and which file.
  assert.match(warning.message, /absent\.png/);
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

/* -------------------------------------------------------------------------- */
/* Sprint 041.6 — the fields the first importer discarded                      */
/* -------------------------------------------------------------------------- */

const WITH_EXTRAS = [
  'id=eTeks#contributions',
  'name=Contributions',
  'license=CC-BY-4.0',
  'id#1=eTeks#chair',
  'name#1=Chaise pliante',
  'category#1=Si\\u00e8ges',
  'tags#1=chaise, si\\u00e8ge , pliante',
  'width#1=45',
  'depth#1=50',
  'height#1=90',
  'creator#1=eTeks',
  'license#1=Free Art License 1.3',
  'creationDate#1=2009-05-01',
  'multiPartModel#1=false',
  'shelfElevations#1=30 60 90',
  'modelRotation#1=1 0 0 0 0 -1 0 1 0',
  'model#1=chair/chair.obj',
  'icon#1=chair.png'
].join('\n');

const OBJ = ['# a chair', 'mtllib chair.mtl', 'v 0 0 0'].join('\n');
const MTL = ['newmtl wood', 'map_Kd wood.png', 'map_Bump -bm 0.2 bump.png'].join('\n');

function withExtras(overrides = {}) {
  return {
    [CATALOGUE]: latin1(WITH_EXTRAS),
    'chair.png': PNG,
    'chair/chair.obj': latin1(OBJ),
    'chair/chair.mtl': latin1(MTL),
    'chair/wood.png': PNG,
    'chair/bump.png': PNG,
    ...overrides
  };
}

test('reads the source’s own tags, split and trimmed and otherwise untouched', async () => {
  const { context } = hostContext(withExtras());

  const result = await readSh3f(source(), context);

  // Accents kept, case kept, order kept. Normalising is where a vocabulary
  // starts, and ADR-0038 Rule 13 revision 2.2 adds tags without one.
  assert.deepEqual(result.assets[0].tags, ['chaise', 'siège', 'pliante']);
});

test('reads a per-entry licence, which the analysed library states on all 64', async () => {
  const { context } = hostContext(withExtras());

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].licence, 'Free Art License 1.3');
  // The library's own is still declared, and the host decides which wins.
  assert.equal(result.library.licence, 'CC-BY-4.0');
});

test('carries the fields with no ArchiSimple equivalent as source metadata', async () => {
  const { context } = hostContext(withExtras());

  const result = await readSh3f(source(), context);
  const metadata = result.assets[0].metadata;

  // Carried, not reproduced: "on top of" and "on a shelf" are a constraint
  // system, and an import is not the place to invent one (ADR-0037 Rule 8).
  assert.equal(metadata.creationDate, '2009-05-01');
  assert.equal(metadata.multiPartModel, 'false');
  assert.equal(metadata.shelfElevations, '30 60 90');
});

test('records the model with its materials and its textures', async () => {
  const { context } = hostContext(withExtras());

  const result = await readSh3f(source(), context);
  const model = result.assets[0].representation3d;

  assert.equal(model.reference, 'chair/chair.obj');
  assert.deepEqual(
    model.dependencies.map((dependency) => dependency.name),
    ['chair.mtl', 'wood.png', 'bump.png']
  );
  // Resolved to real archive paths, so a viewer has something to open rather
  // than a name relative to a folder it would have to infer.
  assert.equal(model.dependencies[1].reference, 'chair/wood.png');
});

test('records a source-declared rotation, and applies it to nothing', async () => {
  const { context } = hostContext(withExtras());

  const result = await readSh3f(source(), context);

  assert.deepEqual(result.assets[0].representation3d.transform.rotation, [1, 0, 0, 0, 0, -1, 0, 1, 0]);
  // The footprint is still the catalogue's width × depth: nothing rotated,
  // because nothing renders (ADR-0038 Rule 21).
  assert.equal(result.assets[0].representation2d.footprint[1].x, 0.225);
});

test('warns by name for a dependency the archive does not contain', async () => {
  const files = withExtras();
  delete files['chair/wood.png'];
  const { context, warnings } = hostContext(files);

  const result = await readSh3f(source(), context);

  const warning = warnings.find((entry) => entry.code === 'missing-model-dependency');
  assert.ok(warning, 'a missing texture must be reported, not silently omitted');
  assert.match(warning.message, /wood\.png/);
  // And the model is still recorded, with what does exist.
  assert.deepEqual(
    result.assets[0].representation3d.dependencies.map((dependency) => dependency.name),
    ['chair.mtl', 'bump.png']
  );
});

test('records a model whose format declares no dependencies, and reads nothing', async () => {
  // A multi-part model is a nested archive. Unpacking one to enumerate it would
  // be loading it, which is exactly what Rule 21 abstains from.
  const { context } = hostContext({
    [CATALOGUE]: latin1(
      ['name=Lib', 'name#1=Chair', 'width#1=45', 'depth#1=50', 'model#1=chair.zip'].join('\n')
    ),
    'chair.zip': PNG
  });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].representation3d.format, 'zip');
  assert.equal(result.assets[0].representation3d.dependencies, undefined);
});

test('objMaterialLibraries and mtlTextures read what the formats declare', () => {
  assert.deepEqual(objMaterialLibraries('mtllib a.mtl b.mtl\nmtllib a.mtl'), ['a.mtl', 'b.mtl']);
  // Map options come first and the file name last, which is why the last token
  // is the one taken.
  assert.deepEqual(mtlTextures('map_Kd -s 1 1 1 wood.png\nmap_Ka wood.png'), ['wood.png']);
});

test('parseModelRotation refuses anything that is not a 3×3', () => {
  assert.deepEqual(parseModelRotation('1 0 0 0 1 0 0 0 1'), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  // A partial matrix is not a rotation, and recording one is worse than none.
  assert.equal(parseModelRotation('1 0 0'), undefined);
  assert.equal(parseModelRotation(undefined), undefined);
});

/* -------------------------------------------------------------------------- */
/* Localized catalogues (§8.5)                                                 */
/* -------------------------------------------------------------------------- */

const FRENCH = ['name#1=Chaise pliante en m\\u00e9tal', 'category#1=Si\\u00e8ges'].join('\n');
const BASE_EN = [
  'name=Contributions',
  'license=CC-BY-4.0',
  'name#1=Folding chair',
  'category#1=Seating',
  'width#1=45',
  'depth#1=50',
  'name#2=Table',
  'category#2=Tables',
  'width#2=120',
  'depth#2=80'
].join('\n');

function bilingual() {
  return {
    [CATALOGUE]: latin1(BASE_EN),
    'PluginFurnitureCatalog_fr.properties': latin1(FRENCH)
  };
}

test('reads the catalogue matching the language the user is working in', async () => {
  const { context } = hostContext(bilingual(), { locale: 'fr' });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].name, 'Chaise pliante en métal');
  assert.deepEqual(result.assets[0].categoryPath, ['Sièges']);
});

test('takes a dimension from the base catalogue, because that is where it lives', async () => {
  const { context } = hostContext(bilingual(), { locale: 'fr' });

  const result = await readSh3f(source(), context);

  // There is no French centimetre. A localized catalogue translates display
  // strings and nothing else (§8.5).
  assert.equal(result.assets[0].representation2d.footprint[1].x, 0.225);
});

test('falls back to the base catalogue for a language the library does not ship', async () => {
  const { context, warnings } = hostContext(bilingual(), { locale: 'de' });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].name, 'Folding chair');
  // Not a warning: an untranslated library is a library, not a defect.
  assert.equal(warnings.filter((entry) => entry.code === 'partial-translation').length, 0);
});

test('records which catalogue the names came from', async () => {
  const { context } = hostContext(bilingual(), { locale: 'fr' });

  const result = await readSh3f(source(), context);

  // So a user who switches language later can tell why their furniture is
  // still in the language it is in (§8.5).
  assert.equal(result.assets[0].metadata.catalogue, 'PluginFurnitureCatalog_fr.properties');
});

test('reports a half-translated library rather than absorbing it silently', async () => {
  const { context, warnings } = hostContext(bilingual(), { locale: 'fr' });

  const result = await readSh3f(source(), context);

  // Entry 2 has no French name: it keeps the base one, which is Java's own
  // ResourceBundle behaviour and Sweet Home 3D's — and the user is told.
  assert.equal(result.assets[1].name, 'Table');
  const warning = warnings.find((entry) => entry.code === 'partial-translation');
  assert.ok(warning);
  assert.match(warning.message, /1 of 2/);
});

test('localisedCatalogueFor prefers the region and then the language, and guesses neither', () => {
  const entries = [
    { path: 'PluginFurnitureCatalog_pt.properties', size: 1 },
    { path: 'PluginFurnitureCatalog_pt_BR.properties', size: 1 }
  ];

  assert.equal(
    localisedCatalogueFor(entries, '', 'pt-BR').path,
    'PluginFurnitureCatalog_pt_BR.properties'
  );
  assert.equal(localisedCatalogueFor(entries, '', 'pt').path, 'PluginFurnitureCatalog_pt.properties');
  // `de` is not "close enough" to anything, and picking one for it would put a
  // language in front of a user that they did not ask for.
  assert.equal(localisedCatalogueFor(entries, '', 'de'), undefined);
  assert.equal(localisedCatalogueFor(entries, '', undefined), undefined);
});

/* -------------------------------------------------------------------------- */
/* Sprint 041.7 — plan symbols derived from the model                          */
/* -------------------------------------------------------------------------- */

/** A unit cube as an OBJ, with a quad face and a negative index, on purpose. */
const CUBE_OBJ = [
  '# a cube',
  'v -1 0 -1',
  'v 1 0 -1',
  'v 1 0 1',
  'v -1 0 1',
  'v -1 2 -1',
  'v 1 2 -1',
  'v 1 2 1',
  'v -1 2 1',
  '# a quad, which must be triangulated',
  'f 1/1/1 2/2/1 3/3/1 4/4/1',
  '# the same face again, addressed from the end',
  'f -8 -7 -6',
  'f 5 6 7',
  'f 5 7 8'
].join('\n');

const MESH_CATALOGUE = [
  'id=eTeks#meshes',
  'name=Meshes',
  'license=CC-BY-4.0',
  'name#1=Bookcase',
  'width#1=90',
  'depth#1=40',
  'height#1=200',
  'model#1=bookcase.obj',
  'modelRotation#1=1 0 0 0 0 -1 0 1 0'
].join('\n');

function meshLibrary(overrides = {}) {
  return {
    [CATALOGUE]: latin1(overrides.catalogue ?? MESH_CATALOGUE),
    'bookcase.obj': latin1(overrides.obj ?? CUBE_OBJ),
    ...overrides.files
  };
}

test('objTriangles reads vertices, quads and negative indices', () => {
  const positions = objTriangles(CUBE_OBJ);

  // A quad fans into two triangles, so four faces become five.
  assert.equal(positions.length % 9, 0);
  assert.equal(positions.length / 9, 5);
  // The first triangle is the first three corners of the quad.
  assert.deepEqual(positions.slice(0, 9), [-1, 0, -1, 1, 0, -1, 1, 0, 1]);
});

test('objTriangles ignores what a silhouette does not need', () => {
  const positions = objTriangles(
    ['vt 0 0', 'vn 0 1 0', 'v 0 0 0', 'v 1 0 0', 'v 0 0 1', 'f 1/1/1 2/1/1 3/1/1'].join('\n')
  );

  assert.deepEqual(positions, [0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

test('hands the host triangles and puts the ring it gets back on the draft', () => {
  const { context, outlined } = hostContext(meshLibrary());

  return readSh3f(source(), context).then((result) => {
    // The importer computes no geometry: it parses its format and the host
    // projects (ADR-0039 Rule 2).
    assert.equal(outlined.length, 1);
    assert.equal(outlined[0].positions.length / 9, 5);
    assert.equal(outlined[0].upAxis, 'y');

    const derived = result.assets[0].representation2d.derivedSymbol;
    assert.equal(derived.kind, 'vector');
    assert.equal(derived.paths[0].points.length, 3);
    assert.deepEqual(derived.derivedFrom, {
      representation: '3d',
      skill: 'mesh.groundOutline'
    });
  });
});

test('passes modelRotation as the transform, so a model on its side is not a profile', async () => {
  const { context, outlined } = hostContext(meshLibrary());

  await readSh3f(source(), context);

  assert.deepEqual(outlined[0].transform, [1, 0, 0, 0, 0, -1, 0, 1, 0]);
});

test('passes the catalogue’s own width and depth, because a mesh is in its author’s units', async () => {
  const { context, outlined } = hostContext(meshLibrary());

  await readSh3f(source(), context);

  assert.deepEqual(outlined[0].fitTo, { width: 0.9, depth: 0.4 });
});

test('derives nothing when the library drew its own plan icon', async () => {
  // The author's drawing always wins (ADR-0039 Rule 5). Not deriving is an
  // economy here; the host enforces the rule regardless.
  const { context, outlined } = hostContext(
    meshLibrary({
      catalogue: `${MESH_CATALOGUE}\nplanIcon#1=bookcasePlan.png`,
      files: { 'bookcasePlan.png': PNG }
    })
  );

  const result = await readSh3f(source(), context);

  assert.equal(outlined.length, 0);
  assert.equal(result.assets[0].representation2d.symbol.kind, 'sprite');
  assert.equal(result.assets[0].representation2d.derivedSymbol, undefined);
});

test('warns by name and falls back to the footprint when a mesh cannot be outlined', async () => {
  const { context, warnings } = hostContext(meshLibrary(), {
    outline: () => ({ ok: false, reason: 'the projection encloses no area' })
  });

  const result = await readSh3f(source(), context);

  const warning = warnings.find((entry) => entry.code === 'footprint-only');
  assert.ok(warning);
  assert.match(warning.message, /Bookcase/);
  // Why it is a rectangle, in one line rather than two: the plan icon is absent
  // *and* the derivation failed, and a user needs both halves to act.
  assert.match(warning.message, /could not be outlined/);
  assert.equal(result.assets[0].representation2d.derivedSymbol, undefined);
  // Still a real drawing: the footprint the catalogue's dimensions give.
  assert.equal(result.assets[0].representation2d.footprint.length, 4);
});

test('derives nothing from a model that declares no faces, and says so', async () => {
  const { context, warnings, outlined } = hostContext(
    meshLibrary({ obj: ['v 0 0 0', 'v 1 0 0'].join('\n') })
  );

  await readSh3f(source(), context);

  // Never handed to the host at all: an empty mesh is this importer's own
  // answer, not a question worth asking.
  assert.equal(outlined.length, 0);
  assert.ok(warnings.some((entry) => entry.code === 'footprint-only'));
});

test('keeps working on a host with no outline capability', async () => {
  // `SDK_VERSION` did not move for this, so an older host is a real
  // possibility — and the honest behaviour is to derive nothing rather than to
  // throw (Sprint 041.6's migration note).
  const { context } = hostContext(meshLibrary());
  delete context.capabilities.outline;

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].representation2d.derivedSymbol, undefined);
  assert.equal(result.assets[0].representation3d.reference, 'bookcase.obj');
});

/* -------------------------------------------------------------------------- */
/* Sprint 042.1 — one warning per asset, and only when it is a rectangle       */
/* -------------------------------------------------------------------------- */

test('says nothing at all when a missing plan icon was made good by a derivation', async () => {
  // The noise this replaced: before 042.1 a library with no plan icons produced
  // `missing-plan-icon` for every asset — including every asset that then gained
  // a perfectly good derived outline. On a five-hundred-model library that is a
  // thousand notifications about nothing.
  const { context, warnings } = hostContext(meshLibrary());

  const result = await readSh3f(source(), context);

  assert.ok(result.assets[0].representation2d.derivedSymbol);
  assert.equal(warnings.filter((entry) => entry.code === 'footprint-only').length, 0);
  assert.equal(warnings.filter((entry) => entry.code === 'missing-plan-icon').length, 0);
});

test('reports a rectangle once, however many reasons it had to be one', async () => {
  // No plan icon **and** an unusable model is one outcome, not two, and a user
  // reads one line to learn both halves.
  const { context, warnings } = hostContext(meshLibrary(), {
    outline: () => ({ ok: false, reason: 'the projection encloses no area' })
  });

  await readSh3f(source(), context);

  const own = warnings.filter((entry) => entry.subject === 'Bookcase');
  assert.equal(own.length, 1);
  assert.equal(own[0].code, 'footprint-only');
});

test('carries the host’s reason code into the warning, so a report can group by it', async () => {
  // A hundred rectangles are not one fact. "Your models are finely tessellated"
  // and "this shape overlaps itself" are two problems with two answers, and a
  // report that grouped them together hid the distinction (Sprint 042.2b).
  const { context, warnings } = hostContext(meshLibrary(), {
    outline: () => ({ ok: false, code: 'self-overlapping', reason: 'it overlaps itself' })
  });

  await readSh3f(source(), context);

  assert.equal(warnings[0].code, 'footprint-only-self-overlapping');
});

test('falls back to the bare code when the host offers none', async () => {
  // An older host, or one whose refusal has no code: the warning is still
  // emitted and still says what happened.
  const { context, warnings } = hostContext(meshLibrary(), {
    outline: () => ({ ok: false, reason: 'no reason code here' })
  });

  await readSh3f(source(), context);

  assert.equal(warnings[0].code, 'footprint-only');
});

test('records why an outline was refused, so the host can tell it from never trying', async () => {
  // Sprint 042.4 §8.6: "has a 3D model and no symbol" cannot distinguish a
  // library imported before derivation existed from one whose models were
  // refused, and only the first is fixed by importing again.
  const { context } = hostContext(meshLibrary(), {
    outline: () => ({ ok: false, code: 'too-detailed', reason: 'too many triangles' })
  });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].representation2d.symbolRefusal, 'too-detailed');
});

test('records no refusal when a symbol was derived', async () => {
  const { context } = hostContext(meshLibrary());

  const result = await readSh3f(source(), context);

  assert.ok(result.assets[0].representation2d.derivedSymbol);
  assert.equal(result.assets[0].representation2d.symbolRefusal, undefined);
});

/* -------------------------------------------------------------------------- */
/* Sprint 001.0 — the importer keeps the mesh, and the height                  */
/* -------------------------------------------------------------------------- */

test('declares that it can retain models, or the host never asks', async () => {
  // ArchiSimple Sprint 055.3 asks only an importer that says it can, and passes
  // `retainModels` to that one alone. Without this the user is never asked, the
  // flag is always false, and every line of retention below is unreachable.
  assert.equal(sh3fImporter.canRetainModels, true);
});

test('records the height it has always read for a standalone entry', async () => {
  const { context } = hostContext(withExtras());

  const result = await readSh3f(source(), context);

  // 90 cm in the catalogue, metres in the contract — converted at this
  // boundary, as every other length here is.
  assert.equal(result.assets[0].realisation.kind, 'standalone');
  assert.equal(result.assets[0].realisation.height, 0.9);
});

test('treats a zero height as no height, rather than removing the asset', async () => {
  // The dangerous case. `numberAt` gives `0` for "0", the host validates the
  // field as positive, and a definition that fails validation is **skipped** —
  // so passing a zero through would take an entry that imports today out of the
  // user's library with nothing but a warning.
  const { context } = hostContext(
    withExtras({ [CATALOGUE]: latin1(WITH_EXTRAS.replace('height#1=90', 'height#1=0')) })
  );

  const result = await readSh3f(source(), context);

  assert.equal(result.assets.length, 1, 'the asset is still imported');
  assert.equal(result.assets[0].realisation.height, undefined);
});

test('retains nothing unless the host asked, and says nothing about it', async () => {
  // The regression guard. An older host, or a user who declined: byte-identical
  // to what this importer produced before retention existed.
  const { context } = hostContext(withExtras());

  const result = await readSh3f(source(), context);
  const model = result.assets[0].representation3d;

  assert.equal(model.payloadKey, undefined);
  assert.deepEqual(
    model.dependencies.map((one) => one.payloadKey),
    [undefined, undefined, undefined]
  );
  // Only the plan icon and the preview, exactly as before.
  assert.ok(result.payloads.every((payload) => !payload.key.includes('--model')));
});

test('retains the mesh, its materials and its textures when asked', async () => {
  const { context } = hostContext(withExtras(), { retainModels: true });

  const result = await readSh3f(source(), context);
  const model = result.assets[0].representation3d;

  // Whole or not at all: a mesh whose `.mtl` arrived and whose textures did not
  // "looks complete and is not" (ADR-0038 revision 2.2).
  assert.ok(model.payloadKey, 'the mesh has a key');
  for (const dependency of model.dependencies) {
    assert.ok(dependency.payloadKey, `${dependency.name} has a key`);
  }

  // Four files: the .obj, the .mtl, and the two textures it names.
  const kept = result.payloads.filter((payload) => payload.key.startsWith('eTeks#chair--'));
  assert.equal(kept.filter((payload) => payload.key.includes('model')).length, 1);
  assert.equal(kept.filter((payload) => payload.key.includes('mtl')).length, 1);
  assert.equal(kept.filter((payload) => payload.key.includes('tex')).length, 2);
});

test('keeps the archive path as well as the key, because they say different things', async () => {
  // ArchiSimple Sprint 055.2: the key is what the host resolves, the reference
  // is the record of where the model came from. Overloading one string means a
  // host cannot tell a dangling key from an intentional path.
  const { context } = hostContext(withExtras(), { retainModels: true });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].representation3d.reference, 'chair/chair.obj');
});

test('reads each retained file once, not twice', async () => {
  // The `.obj` and the `.mtl` are already read for the references they declare,
  // and retention reuses those reads. A sixty-four-model library pays this cost
  // sixty-four times if it is paid twice.
  //
  // Counted at `archive.read`, not on the fixture object: `entries()` walks the
  // same map with `Object.entries`, which is a property access and not a read.
  const { context } = hostContext(withExtras(), { retainModels: true });
  const reads = [];
  const realReadArchive = context.capabilities.readArchive;
  const counting = {
    ...context,
    capabilities: {
      ...context.capabilities,
      readArchive: async (bytes) => {
        const archive = await realReadArchive(bytes);
        return {
          ...archive,
          read: async (path) => {
            reads.push(path);
            return archive.read(path);
          }
        };
      }
    }
  };

  await readSh3f(source(), counting);

  const objReads = reads.filter((path) => path === 'chair/chair.obj').length;
  assert.equal(objReads, 1, `the .obj was read ${objReads} times`);
});

/* -------------------------------------------------------------------------- */
/* Sprint 001.1 — the model becomes something the 3D view can draw             */
/* -------------------------------------------------------------------------- */

/**
 * `withExtras`' OBJ is `v 0 0 0` — one vertex and no faces, which was enough for
 * every test before this one and yields **no triangles**. A mesh needs a model
 * that is actually a model.
 */
const withModel = (overrides = {}) =>
  withExtras({ 'chair/chair.obj': latin1(CUBE_OBJ), ...overrides });

test('prepares a drawable mesh when the user asked for models', async () => {
  const { context, meshed } = hostContext(withModel(), { retainModels: true });

  const result = await readSh3f(source(), context);

  assert.equal(meshed.length, 1, 'the host was asked once');
  assert.equal(result.assets[0].representation3d.meshPayloadKey, 'eTeks#chair--mesh');
  assert.ok(
    result.payloads.some((payload) => payload.key === 'eTeks#chair--mesh'),
    'the mesh travels as a payload'
  );
});

test('sends the triangles, the up-axis and the catalogue’s real size', async () => {
  // What this importer must get right is *what it sends*. The host normalises,
  // and its encoding is none of this package's business.
  const { context, meshed } = hostContext(withModel(), { retainModels: true });

  await readSh3f(source(), context);

  const sent = meshed[0];
  assert.ok(sent.positions.length > 0, 'triangles were parsed');
  // Sweet Home 3D is Y-up, as Java3D is.
  assert.equal(sent.upAxis, 'y');
  // 45 x 50 x 90 cm in the catalogue, metres at this boundary.
  assert.equal(sent.fitTo.width, 0.45);
  assert.equal(sent.fitTo.depth, 0.5);
  assert.equal(sent.fitTo.height, 0.9);
});

test('sends the source-declared rotation, which the host applies', async () => {
  const { context, meshed } = hostContext(withModel(), { retainModels: true });

  await readSh3f(source(), context);

  assert.deepEqual(meshed[0].transform, [1, 0, 0, 0, 0, -1, 0, 1, 0]);
});

test('prepares none when the user declined, so a plain import is unchanged', async () => {
  const { context, meshed } = hostContext(withModel());

  const result = await readSh3f(source(), context);

  assert.equal(meshed.length, 0);
  assert.equal(result.assets[0].representation3d.meshPayloadKey, undefined);
});

test('parses the model once, however many things want its triangles', async () => {
  // The outline and the mesh both want them, and `objTriangles` walks the whole
  // file — a sixty-four-model library pays that walk sixty-four times.
  //
  // Asserted through the two capabilities receiving the **same array**, which is
  // what one parse looks like from outside.
  const { context, meshed, outlined } = hostContext(
    // No plan icon, so an outline is derived too.
    withModel({ [CATALOGUE]: latin1(WITH_EXTRAS.replace('icon#1=chair.png', '')) }),
    { retainModels: true }
  );

  await readSh3f(source(), context);

  assert.equal(meshed.length, 1);
  assert.equal(outlined.length, 1);
  assert.equal(meshed[0].positions, outlined[0].positions, 'one parse, shared');
});

test('reports a mesh it could not prepare, and keeps the asset', async () => {
  const { context, warnings } = hostContext(withModel(), {
    retainModels: true,
    mesh: () => ({ ok: false, reason: 'the projection encloses no area' })
  });

  const result = await readSh3f(source(), context);

  assert.equal(result.assets.length, 1, 'the asset still imports');
  assert.equal(result.assets[0].representation3d.meshPayloadKey, undefined);
  assert.ok(warnings.some((warning) => warning.code === 'mesh-not-produced'));
});

test('asks nothing of a host too old to have the capability', async () => {
  // An extension runs against whatever host installed it. One without `mesh`
  // imports exactly as it did before, with no mesh and no complaint.
  const { context } = hostContext(withModel(), { retainModels: true });
  delete context.capabilities.mesh;

  const result = await readSh3f(source(), context);

  assert.equal(result.assets[0].representation3d.meshPayloadKey, undefined);
});

/* -------------------------------------------------------------------------- */
/* Sprint 001.2 — what the model is made of                                    */
/* -------------------------------------------------------------------------- */

/** A cube with two materials and texture coordinates. */
const TEXTURED_OBJ = [
  // The name the file map uses — an `mtllib` naming a file the archive does not
  // contain is resolved to nothing, which is a case the importer already warns
  // about and not the one under test here.
  'mtllib chair.mtl',
  'v -1 0 -1',
  'v 1 0 -1',
  'v 1 0 1',
  'v -1 0 1',
  'v -1 2 -1',
  'v 1 2 -1',
  'vt 0 0',
  'vt 1 0',
  'vt 1 1',
  'usemtl wood',
  'f 1/1 2/2 3/3',
  'usemtl steel',
  'f 4/1 5/2 6/3'
].join('\n');

const TEXTURED_MTL = [
  'newmtl wood',
  'Kd 0.6 0.4 0.2',
  'map_Kd grain.png',
  'newmtl steel',
  'Kd 0.7 0.7 0.75',
  'newmtl unused',
  'Kd 1 0 0'
].join('\n');

const withMaterials = () =>
  withExtras({
    'chair/chair.obj': latin1(TEXTURED_OBJ),
    'chair/chair.mtl': latin1(TEXTURED_MTL),
    'chair/grain.png': PNG
  });

test('sends a uv per vertex, in positions order', async () => {
  const { context, meshed } = hostContext(withMaterials(), { retainModels: true });

  await readSh3f(source(), context);

  const sent = meshed[0];
  // Two numbers per vertex. The alignment is the whole correctness of a texture.
  assert.equal(sent.uv.length, (sent.positions.length / 3) * 2);
});

test('sends a group per usemtl run, over the triangle stream', async () => {
  const { context, meshed } = hostContext(withMaterials(), { retainModels: true });

  await readSh3f(source(), context);

  const { groups } = meshed[0];
  assert.deepEqual(
    groups.map((group) => group.material),
    ['wood', 'steel']
  );
  // Three vertices each — one triangle apiece, and contiguous.
  assert.equal(groups[0].start, 0);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[1].start, 3);
});

test('sends each material’s colour and its map, by name', async () => {
  const { context, meshed } = hostContext(withMaterials(), { retainModels: true });

  await readSh3f(source(), context);

  const wood = meshed[0].materials.find((material) => material.name === 'wood');
  assert.deepEqual(wood.colour, { r: 0.6, g: 0.4, b: 0.2 });
  // A name, not a resource id: a mesh is encoded during the import and resolves
  // no payload key. The host matches it against the dependency of that name.
  assert.equal(wood.texture, 'grain.png');
});

test('sends only the materials the geometry uses', async () => {
  // An `.mtl` commonly declares more than one model needs, and the host refuses
  // a group naming a material that was not sent — so sending the unused one
  // would be harmless, and sending a group for it would not.
  const { context, meshed } = hostContext(withMaterials(), { retainModels: true });

  await readSh3f(source(), context);

  assert.ok(!meshed[0].materials.some((material) => material.name === 'unused'));
});

test('sends no uv for a model that declares none, rather than zeroes', async () => {
  // An all-zero uv array is worse than none: it looks like data.
  const { context, meshed } = hostContext(withModel(), { retainModels: true });

  await readSh3f(source(), context);

  assert.equal(meshed[0].uv, undefined);
  assert.equal(meshed[0].materials, undefined);
});

test('parses the model once, still, now that two things want more of it', async () => {
  const { context, meshed, outlined } = hostContext(
    withMaterials({ [CATALOGUE]: latin1(WITH_EXTRAS.replace('icon#1=chair.png', '')) }),
    { retainModels: true }
  );

  await readSh3f(source(), context);

  assert.equal(meshed[0].positions, outlined[0].positions, 'one parse, shared');
});
