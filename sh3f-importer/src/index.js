/**
 * Sweet Home 3D furniture libraries (`.sh3f`) — every byte of format knowledge.
 *
 * The application contains none of it (ADR-0037 Rule 1), and a compliance test
 * over there asserts as much. What the host supplies is a seam: detection, a
 * progress and cancellation contract, an adoption pipeline, and three
 * capabilities — `readArchive`, `decodeImage` and `text` (Rule 9). Everything
 * below is the format, and nothing below could be reused for a second one.
 *
 * ## What an `.sh3f` is
 *
 * A ZIP archive containing:
 *
 * ```text
 * PluginFurnitureCatalog.properties      the catalogue: one numbered block per item
 * PluginFurnitureCatalog_<lang>.properties   the same, translated — twenty of them
 * <name>.obj / <name>.mtl / textures     3D models and what they need
 * <name>.png                             icons — a 3/4 render per item
 * <name>Plan.png                         plan icons — the top view, where present
 * ```
 *
 * ## The three things that would otherwise ship as bugs
 *
 * **Centimetres.** Sweet Home 3D stores every dimension in centimetres;
 * ArchiSimple's working unit is the metre at resolution 0.001. A 45 cm chair
 * imported unconverted becomes a 45 m chair — bigger than the building,
 * catastrophic on first placement, and invisible to any test that only checks a
 * value is positive and finite. {@link toMetres} is the single conversion, and
 * the tests assert *specific metre values* rather than "greater than zero".
 *
 * **ISO-8859-1, with `\uXXXX` escapes.** Java `.properties` is Latin-1, and the
 * free Sweet Home 3D libraries are largely French and heavily accented. Read as
 * UTF-8, *Chaise pliante en métal* becomes mojibake — which no test asserting "a
 * name is a non-empty string" notices, and which a user finds months later in a
 * name they cannot search for. `context.capabilities.text(bytes, 'iso-8859-1')`
 * is why the host made the encoding an explicit argument.
 *
 * **Identity is never the index.** `id#i` where the author supplied one, a
 * documented normalisation of `name#i` otherwise, and never `i` — inserting one
 * item into a library would otherwise re-point every instance already placed
 * from it (ADR-0037 Rule 13).
 *
 * ## Plain ES module JavaScript, on purpose
 *
 * Read as text and evaluated from a `data:` URL — no bundler, no TypeScript, no
 * `node_modules`. So no bare-specifier import, and the service token below is
 * written out by hand: tokens resolve by their `name`, so `{ name: 'importer' }`
 * is exactly what importing `ImporterExtensionServiceToken` would give.
 */

const ImporterExtensionServiceToken = { name: 'importer' };

/** The catalogue every `.sh3f` carries, at the archive root. */
const CATALOGUE_ENTRY = 'PluginFurnitureCatalog.properties';

/** Java `.properties` is Latin-1 by specification, escapes and all. */
const PROPERTIES_ENCODING = 'iso-8859-1';

/**
 * Below this elevation an item that says it is a door-or-window is a **door**.
 *
 * Centimetres, because it is compared against the raw source value before
 * conversion — the one place a centimetre appears outside {@link toMetres}, and
 * it is a threshold rather than a dimension.
 */
const DOOR_ELEVATION_THRESHOLD_CM = 10;

/** Within this much of the threshold, the decision is reported as a guess. */
const NEAR_THRESHOLD_CM = 5;

/**
 * The keys a localized catalogue actually carries (Sprint 041.6 §8.5).
 *
 * A `PluginFurnitureCatalog_fr.properties` translates the **display strings**
 * and nothing else — there is no French centimetre and no French file path — so
 * these are the only keys a localized catalogue may override. Everything
 * structural comes from the base catalogue, which is the only place it exists.
 */
const LOCALISED_KEYS = ['name', 'category', 'tags', 'description'];

/** `tags#i` is a comma-separated list, in the library's own language. */
const TAG_SEPARATOR = /\s*,\s*/;

/* -------------------------------------------------------------------------- */
/* Units                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Centimetres to metres. **The only place a dimension changes unit.**
 *
 * One function, applied to every dimension as it leaves the parser. The same
 * remedy the room tool's explicit `unit` parameter exists for: make the unit
 * explicit at exactly one boundary and convert there.
 */
export function toMetres(centimetres) {
  return centimetres / 100;
}

/* -------------------------------------------------------------------------- */
/* The properties file                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Unescapes a Java `.properties` value: `\uXXXX`, and the usual escapes.
 *
 * `\uXXXX` is how a `.properties` file written in Latin-1 carries a character
 * that is not — which is most of what a non-French library's names are made of.
 */
export function unescapeProperties(value) {
  let output = '';
  for (let at = 0; at < value.length; at += 1) {
    const character = value[at];
    if (character !== '\\') {
      output += character;
      continue;
    }
    const next = value[at + 1];
    if (next === 'u') {
      const hex = value.slice(at + 2, at + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        output += String.fromCharCode(parseInt(hex, 16));
        at += 5;
        continue;
      }
    }
    at += 1;
    if (next === 'n') output += '\n';
    else if (next === 't') output += '\t';
    else if (next === 'r') output += '\r';
    else if (next === undefined) output += '\\';
    // Every other escape is the character itself: `\:`, `\=`, `\\`, `\ `.
    else output += next;
  }
  return output;
}

/**
 * Parses a Java `.properties` document into a plain object.
 *
 * Handles what the format actually contains and nothing more: `#` and `!`
 * comments, `=` and `:` separators, leading whitespace, and line continuations
 * (a line ending in an odd number of backslashes continues onto the next).
 */
export function parseProperties(text) {
  const values = Object.create(null);
  const lines = text.split(/\r\n|\r|\n/);

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index].replace(/^\s+/, '');
    if (line.length === 0 || line.startsWith('#') || line.startsWith('!')) {
      continue;
    }

    // A line continues while it ends in an odd number of backslashes.
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && index + 1 < lines.length) {
      line = line.slice(0, -1) + lines[index + 1].replace(/^\s+/, '');
      index += 1;
    }

    // The first unescaped `=` or `:` separates key from value.
    let separator = -1;
    for (let at = 0; at < line.length; at += 1) {
      if (line[at] === '\\') {
        at += 1;
        continue;
      }
      if (line[at] === '=' || line[at] === ':') {
        separator = at;
        break;
      }
    }
    if (separator === -1) {
      // A bare key with no value is a key set to the empty string.
      values[unescapeProperties(line).trim()] = '';
      continue;
    }

    const key = unescapeProperties(line.slice(0, separator)).trim();
    const value = unescapeProperties(line.slice(separator + 1).replace(/^\s+/, ''));
    // Later wins, which is what every `.properties` reader does.
    values[key] = value;
  }

  return values;
}

/** `name#3` → the value, or `undefined`. */
function at(values, key, index) {
  const value = values[`${key}#${index}`];
  return value === undefined || value === '' ? undefined : value;
}

function numberAt(values, key, index) {
  const raw = at(values, key, index);
  if (raw === undefined) return undefined;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

function booleanAt(values, key, index) {
  const raw = at(values, key, index);
  return raw === undefined ? undefined : raw.trim().toLowerCase() === 'true';
}

/**
 * Every index the catalogue declares, in order.
 *
 * Read from the keys rather than counted, because a real library's indices have
 * gaps — an author deleting an entry leaves one — and counting would stop at the
 * first hole.
 */
export function catalogueIndices(values) {
  const indices = new Set();
  for (const key of Object.keys(values)) {
    const hash = key.lastIndexOf('#');
    if (hash === -1) continue;
    const index = Number(key.slice(hash + 1));
    if (Number.isInteger(index) && index > 0) {
      indices.add(index);
    }
  }
  return [...indices].sort((left, right) => left - right);
}

/* -------------------------------------------------------------------------- */
/* Localized catalogues                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The catalogue that matches the language the user is working in.
 *
 * `context.locale` is a BCP 47 tag (ADR-0037 revision 2.1); a `.properties`
 * bundle is suffixed the Java way. `fr-FR` therefore tries `_fr_FR` and then
 * `_fr`, in that order, and answers `undefined` when the library ships neither —
 * which is not a failure, it is a library that was never translated.
 *
 * Deliberately no "close enough" matching. `pt` is not `pt-BR` and Sweet Home
 * 3D's own libraries ship both; picking one for the other would put a language
 * in front of a user that they did not ask for and cannot switch off.
 */
export function localisedCatalogueFor(entries, baseDirectory, locale) {
  if (typeof locale !== 'string' || locale.length === 0) {
    return undefined;
  }
  const parts = locale.replace(/-/g, '_').split('_');
  const suffixes = parts.length > 1 ? [`${parts[0]}_${parts[1]}`, parts[0]] : [parts[0]];

  for (const suffix of suffixes) {
    const name = `PluginFurnitureCatalog_${suffix}.properties`;
    const candidate = baseDirectory.length === 0 ? name : `${baseDirectory}/${name}`;
    const found = entries.find((entry) => entry.path === candidate);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * Overlays a localized catalogue's display strings onto the base one.
 *
 * **Only** {@link LOCALISED_KEYS}, and only where the translation actually says
 * something. Two things follow, and both are deliberate:
 *
 * - a dimension, a file reference or a flag is **never** taken from a localized
 *   catalogue, because it is not there;
 * - an entry the translation skipped keeps the base catalogue's name rather than
 *   losing one. That is Java's own `ResourceBundle` behaviour and Sweet Home
 *   3D's, and the alternative — refusing the whole translation because it is
 *   incomplete — would leave a French user with an English library over one
 *   missing chair.
 *
 * A partial translation is **reported** rather than silently absorbed, so
 * "half my furniture is in English" is a fact the user is told rather than one
 * they discover.
 */
export function overlayLocalisedValues(base, localised) {
  const merged = { ...base };
  let translated = 0;
  let missing = 0;

  for (const key of Object.keys(base)) {
    const hash = key.lastIndexOf('#');
    if (hash === -1 || !LOCALISED_KEYS.includes(key.slice(0, hash))) {
      continue;
    }
    const value = localised[key];
    if (value === undefined || value === '') {
      if (key.startsWith('name#')) missing += 1;
      continue;
    }
    merged[key] = value;
    if (key.startsWith('name#')) translated += 1;
  }

  return { values: merged, translated, missing };
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The documented normalisation, for an entry whose author supplied no `id#i`.
 *
 * Trimmed, case-folded, diacritics folded, non-alphanumerics collapsed to `-`.
 * It is documented precisely because it must be **reproducible**: the same name
 * in the same library must normalise to the same key next year, or a re-import
 * orphans every instance placed from it.
 */
export function normaliseSourceKey(name) {
  const folded = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return folded.length === 0 ? '' : folded;
}

/* -------------------------------------------------------------------------- */
/* Door or window                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `doorOrWindow#i` says **that** an item is one, not **which**.
 *
 * ArchiSimple's `OpeningKind` is `door`, `window` or `passage`. The only signal
 * the format gives is elevation: a door reaches the floor and a window does not.
 *
 * `passage` is **never** emitted. ADR-0033 Rule 6 says a cased opening is never
 * mapped onto a door, and the converse holds — nothing in SH3F says "no leaf",
 * so inventing a passage would be a claim the source does not make.
 */
export function openingKindFor(elevationCm) {
  return (elevationCm ?? 0) < DOOR_ELEVATION_THRESHOLD_CM ? 'door' : 'window';
}

/** Whether the elevation is close enough to the threshold to be worth warning about. */
export function isNearThreshold(elevationCm) {
  return Math.abs((elevationCm ?? 0) - DOOR_ELEVATION_THRESHOLD_CM) <= NEAR_THRESHOLD_CM;
}

/* -------------------------------------------------------------------------- */
/* Reading one entry                                                           */
/* -------------------------------------------------------------------------- */

/** A rectangle centred on the origin, counter-clockwise, in metres. */
function centredRectangle(width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth }
  ];
}

/**
 * Format-specific keys carried verbatim, namespaced away from every core field.
 *
 * Sprint 041.6 added the last four. None has an ArchiSimple equivalent and none
 * is *invented* one: `dropOnTopElevation` and `shelfElevations` describe Sweet
 * Home 3D's placement semantics, which is a constraint system rather than an
 * import, and reproducing them here would be modelling a behaviour this
 * application has not decided to have (ADR-0037 Rule 8).
 */
const CARRIED_METADATA_KEYS = [
  'doorOrWindow',
  'elevation',
  'staircaseCutOutShape',
  'movable',
  'currency',
  'price',
  'dropOnTopElevation',
  'creationDate',
  'multiPartModel',
  'shelfElevations',
  'description'
];

/* -------------------------------------------------------------------------- */
/* The model, and what it needs to be openable                                 */
/* -------------------------------------------------------------------------- */

/**
 * A `modelRotation#i`, as a row-major 3×3.
 *
 * Sweet Home 3D writes nine numbers separated by spaces. Anything else is
 * ignored rather than half-read: a partial rotation matrix is not a rotation,
 * and recording one would be worse than recording none.
 */
export function parseModelRotation(raw) {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const numbers = raw
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));
  return numbers.length === 9 && numbers.every((value) => Number.isFinite(value))
    ? numbers
    : undefined;
}

/** The `mtllib` files an `.obj` declares, in the order it declares them. */
export function objMaterialLibraries(text) {
  const names = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = /^\s*mtllib\s+(.+?)\s*$/i.exec(line);
    if (match !== null) {
      // One `mtllib` line may name several files, space-separated.
      names.push(...match[1].split(/\s+/).filter((name) => name.length > 0));
    }
  }
  return [...new Set(names)];
}

/** The texture files a `.mtl` maps, whatever the map slot. */
export function mtlTextures(text) {
  const names = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = /^\s*map_[A-Za-z_]+\s+(.+?)\s*$/i.exec(line);
    if (match === null) {
      continue;
    }
    // `map_Kd -s 1 1 1 wood.png` — options come first, the file name last.
    const parts = match[1].split(/\s+/).filter((part) => part.length > 0);
    const name = parts[parts.length - 1];
    if (name !== undefined && !name.startsWith('-')) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

/**
 * The triangles of an OBJ, as the flat list the host's `outline` expects.
 *
 * `v` records are vertices and `f` records are faces. Two things a naive reader
 * gets wrong and a real library will punish:
 *
 * - **indices are one-based, and may be negative** — `-1` is the *last* vertex
 *   seen so far, which is how a generator writes a streamable file;
 * - **a face may have more than three vertices.** Quads are the common case and
 *   n-gons occur; both are fanned from the first vertex, which is correct for
 *   the convex faces every mesh exporter emits.
 *
 * `v/vt/vn` is split on the first `/`: texture and normal indices are irrelevant
 * to a silhouette.
 *
 * Nine numbers per triangle, flat, because a hundred-thousand-triangle mesh as
 * point objects is three hundred thousand allocations (Sprint 041.7 §8.1).
 */
export function objTriangles(text) {
  const vertices = [];
  const positions = [];

  for (const line of text.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.slice(2).trim().split(/\s+/);
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const z = Number(parts[2]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        vertices.push([x, y, z]);
      }
      continue;
    }
    if (!trimmed.startsWith('f ')) {
      continue;
    }

    const corners = [];
    for (const token of trimmed.slice(2).trim().split(/\s+/)) {
      const raw = Number(token.split('/')[0]);
      if (!Number.isInteger(raw) || raw === 0) {
        continue;
      }
      // Negative indices count back from the vertices seen so far.
      const index = raw > 0 ? raw - 1 : vertices.length + raw;
      const vertex = vertices[index];
      if (vertex !== undefined) {
        corners.push(vertex);
      }
    }

    // A fan from the first corner: three vertices for a triangle, two triangles
    // for a quad, and so on.
    for (let at = 1; at + 1 < corners.length; at += 1) {
      positions.push(...corners[0], ...corners[at], ...corners[at + 1]);
    }
  }

  return positions;
}

/**
 * Resolves a model into the graph a future viewer would need (§8.4).
 *
 * The mesh, the materials it names, and the textures those name — read from the
 * archive rather than guessed from a naming convention, because a convention
 * that held for one library is exactly the kind of thing that fails silently on
 * the next.
 *
 * **Nothing is loaded.** The bytes of the `.obj` and the `.mtl` are read as
 * *text*, to find out what they reference; no geometry is parsed, no image is
 * decoded, and the result is a list of names (ADR-0038 Rule 21).
 *
 * A declared dependency the archive does not contain is a **warning naming it**,
 * never a fatal error and never a silent omission: the model is still worth
 * recording, and the user is told what is missing from it.
 */
async function resolveModelGraph(options) {
  const { model, archive, entries, catalogueDirectory, context, name } = options;

  const modelEntry = findEntry(entries, model, catalogueDirectory);
  if (modelEntry === undefined) {
    context.warn({
      code: 'missing-model',
      subject: name,
      message: `"${name}" names the model "${model}", which the archive does not contain; its 3D reference is recorded and nothing else.`
    });
    return { format: formatOf(model), reference: model };
  }

  // Only OBJ declares its dependencies in a form worth reading. A multi-part
  // model is a nested archive, and unpacking one to enumerate it would be
  // loading it — which is exactly what Rule 21 abstains from.
  if (formatOf(model) !== 'obj') {
    return { format: formatOf(model), reference: modelEntry.path };
  }

  const directory = directoryOf(modelEntry.path);
  const dependencies = [];
  const resolve = (reference) => {
    const found = findEntry(entries, reference, directory);
    if (found === undefined) {
      context.warn({
        code: 'missing-model-dependency',
        subject: name,
        message: `"${name}" needs "${reference}", which the archive does not contain; its model is recorded without it.`
      });
      return undefined;
    }
    return found;
  };

  const objText = context.capabilities.text(await archive.read(modelEntry.path), 'utf-8');
  // Handed back so the outline is derived from bytes that were already read.
  // Reading the same model twice for two answers is a cost a sixty-four-model
  // library pays sixty-four times.
  options.onObjText?.(objText);
  for (const materialName of objMaterialLibraries(objText)) {
    const materialEntry = resolve(materialName);
    if (materialEntry === undefined) {
      continue;
    }
    dependencies.push({
      name: materialName,
      reference: materialEntry.path,
      format: formatOf(materialName)
    });

    const mtlText = context.capabilities.text(await archive.read(materialEntry.path), 'utf-8');
    for (const textureName of mtlTextures(mtlText)) {
      const textureEntry = resolve(textureName);
      if (textureEntry !== undefined) {
        dependencies.push({
          name: textureName,
          reference: textureEntry.path,
          format: formatOf(textureName)
        });
      }
    }
  }

  return {
    format: 'obj',
    reference: modelEntry.path,
    ...(dependencies.length === 0 ? {} : { dependencies })
  };
}

/** Library-level keys, which have no `#i` suffix. */
function readLibrary(values, fallbackId) {
  const id =
    values['id'] ??
    values['LIBRARY_ID'] ??
    values['libraryId'] ??
    fallbackId;
  const name =
    values['name'] ??
    values['LIBRARY_NAME'] ??
    values['libraryName'] ??
    fallbackId;
  // Never defaulted to a real licence and never guessed: a library that declares
  // none records `unknown`, and the host shows that in the report
  // (ADR-0038 Rule 22).
  const licence =
    values['license'] ?? values['licence'] ?? values['LIBRARY_LICENSE'] ?? 'unknown';
  const contributor =
    values['contributor'] ?? values['LIBRARY_CONTRIBUTOR'] ?? values['provider'];

  return {
    id: String(id),
    name: String(name),
    licence: String(licence),
    ...(contributor === undefined ? {} : { contributor: String(contributor) })
  };
}

/* -------------------------------------------------------------------------- */
/* The importer                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reads one `.sh3f`.
 *
 * Exported so `node --test` can drive it against a fixture without a host — the
 * same property the application relies on when it hot-reloads this file.
 */
export async function readSh3f(source, context) {
  const archive = await context.capabilities.readArchive(await source.bytes());

  const entries = archive.entries();
  const catalogueEntry = entries.find(
    (entry) => entry.path === CATALOGUE_ENTRY || entry.path.endsWith(`/${CATALOGUE_ENTRY}`)
  );
  if (catalogueEntry === undefined) {
    // Fatal, with a readable reason: this is not an SH3F, whatever its name says.
    throw new Error(
      `"${source.name}" contains no ${CATALOGUE_ENTRY}; it is not a Sweet Home 3D furniture library.`
    );
  }

  const catalogueDirectory = directoryOf(catalogueEntry.path);
  const base = parseProperties(
    context.capabilities.text(await archive.read(catalogueEntry.path), PROPERTIES_ENCODING)
  );

  // The user's own language, where the library has one (§8.5, ADR-0037
  // revision 2.1). An importer that ignored `locale` would be correct; reading
  // it is what makes a French library arrive in French.
  const localisedEntry = localisedCatalogueFor(entries, catalogueDirectory, context.locale);
  let values = base;
  let catalogueRead = catalogueEntry.path;
  if (localisedEntry !== undefined) {
    const localised = parseProperties(
      context.capabilities.text(await archive.read(localisedEntry.path), PROPERTIES_ENCODING)
    );
    const overlay = overlayLocalisedValues(base, localised);
    values = overlay.values;
    catalogueRead = localisedEntry.path;
    if (overlay.missing > 0) {
      // A half-translated library is a fact the user is told rather than one
      // they discover in a name they cannot search for.
      context.warn({
        code: 'partial-translation',
        subject: localisedEntry.path,
        message: `${overlay.translated} of ${overlay.translated + overlay.missing} names are translated in "${localisedEntry.path}"; the rest keep the library's own language.`
      });
    }
  }

  const library = readLibrary(values, source.name.replace(/\.[^.]*$/, ''));

  if (library.licence === 'unknown') {
    // One prominent warning. A user importing an unlicensed library is told so
    // and decides for themselves; nothing here invents a licence.
    context.warn({
      code: 'no-licence',
      subject: library.name,
      message: `"${library.name}" declares no licence. Every entry is recorded as "unknown"; check the library's own terms before redistributing anything from it.`
    });
  }

  const indices = catalogueIndices(values);
  const assets = [];
  const payloads = [];
  /** Guards the one thing that must fail the whole import (ADR-0037 Rule 13). */
  const keys = new Map();

  for (const [position, index] of indices.entries()) {
    // Checked **between** items, not inside one: an item is small and a
    // half-parsed one is worthless.
    if (context.signal.aborted) {
      break;
    }

    const name = at(values, 'name', index);
    const width = numberAt(values, 'width', index);
    const depth = numberAt(values, 'depth', index);

    if (name === undefined || width === undefined || depth === undefined) {
      context.warn({
        code: 'missing-field',
        subject: String(index),
        message: `Entry ${index} is missing ${
          name === undefined ? 'name' : width === undefined ? 'width' : 'depth'
        } and was skipped.`
      });
      context.report({ completed: position + 1, total: indices.length });
      continue;
    }

    const declaredId = at(values, 'id', index);
    const sourceKey = declaredId ?? normaliseSourceKey(name);
    if (sourceKey.length === 0) {
      context.warn({
        code: 'no-identity',
        subject: name,
        message: `"${name}" yields no usable identifier and was skipped.`
      });
      context.report({ completed: position + 1, total: indices.length });
      continue;
    }
    if (keys.has(sourceKey)) {
      // Fatal, and deliberately not suffixed: a suffix assigned by position is
      // the index problem wearing a disguise, and it breaks re-import for good.
      throw new Error(
        `"${name}" and "${keys.get(sourceKey)}" both normalise to the identifier "${sourceKey}". ` +
          `The library cannot be imported without stable identities.`
      );
    }
    keys.set(sourceKey, name);

    const draft = await readEntry({
      values,
      index,
      name,
      sourceKey,
      widthCm: width,
      depthCm: depth,
      archive,
      entries,
      // A catalogue may sit in a subdirectory, and its icon references are
      // relative to *it* rather than to the archive root.
      catalogueDirectory,
      // Which catalogue the names came from, recorded so a user who switches
      // language later can tell why their furniture is still in English (§8.5).
      catalogueRead,
      context,
      payloads
    });
    assets.push(draft);

    context.report({ completed: position + 1, total: indices.length, label: name });
    // Hand the browser a turn (Sprint 041.9 §8.4). `await`ing an archive read
    // only queues a microtask, and a microtask does not let a page paint — so a
    // sixty-four-model import reported progress that nobody ever saw, and the
    // browser called the tab unresponsive.
    //
    // A macrotask per **asset**, not per operation: sixty-four of these cost
    // nothing, and an asset is the unit progress is reported in anyway.
    await new Promise((resume) => setTimeout(resume, 0));
  }

  return { library, assets, payloads };
}

async function readEntry(options) {
  const {
    values,
    index,
    name,
    sourceKey,
    widthCm,
    depthCm,
    archive,
    entries,
    catalogueDirectory,
    catalogueRead,
    context,
    payloads
  } = options;

  const width = toMetres(widthCm);
  const depth = toMetres(depthCm);
  const heightCm = numberAt(values, 'height', index);
  const elevationCm = numberAt(values, 'elevation', index);
  const isOpening = booleanAt(values, 'doorOrWindow', index) === true;
  const movable = booleanAt(values, 'movable', index);

  const category = at(values, 'category', index);
  const creator = at(values, 'creator', index);

  const metadata = { catalogue: catalogueRead };
  for (const key of CARRIED_METADATA_KEYS) {
    const value = at(values, key, index);
    if (value !== undefined) {
      metadata[key] = value;
    }
  }

  // The source's own search words, in its own language. Split and trimmed, and
  // otherwise untouched: normalising them is where a vocabulary starts, and
  // ADR-0038 Rule 13 revision 2.2 adds tags precisely without one.
  const tags = (at(values, 'tags', index) ?? '')
    .split(TAG_SEPARATOR)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  // Per-entry, where the source states one. The analysed library declares
  // `license#i` on all 64 of its entries, and folding them into one
  // library-wide value would flatten a distinction its author drew.
  const licence = at(values, 'license', index) ?? at(values, 'licence', index);

  // The plan icon, and **only** the plan icon (§8.5). Falling back to the 3/4
  // render would put a perspective drawing into a technical one, which is worse
  // than a footprint.
  //
  // **Nothing is reported here.** Until Sprint 041.7 a missing plan icon meant a
  // rectangle, so it was worth a warning; since 041.7 it usually means a symbol
  // derived from the model, which is a success. Warning at this point produced
  // one line per asset for a library that ended up perfectly well drawn — on a
  // five-hundred-model library, a thousand notifications about nothing.
  //
  // So the *reason* is recorded and the decision is made below, once the
  // derivation has had its turn.
  const planIcon = at(values, 'planIcon', index);
  let symbol;
  let planIconProblem;
  if (planIcon === undefined) {
    planIconProblem = 'declares no plan icon';
  } else {
    const entry = findEntry(entries, planIcon, catalogueDirectory);
    if (entry === undefined) {
      planIconProblem = `names the plan icon "${planIcon}", which the archive does not contain`;
    } else {
      const bytes = await archive.read(entry.path);
      const image = await context.capabilities.decodeImage(bytes);
      payloads.push({ key: sourceKey, format: formatOf(planIcon), bytes });
      symbol = {
        kind: 'sprite',
        payloadKey: sourceKey,
        // From the decoded image and the converted width, so no renderer has to
        // guess a scale from pixel dimensions.
        pixelsPerMetre: image.width / width
      };
    }
  }

  // The 3/4 render becomes the preview payload, and since Sprint 042.0 it is
  // **declared** rather than left for a host to find by guessing a key.
  //
  // The key's shape is this importer's business; a host that recomposed it would
  // be encoding one format's convention, and a second format spelling it
  // differently would silently show nothing (ADR-0037 Rule 1).
  //
  // It is a catalogue picture and never a plan symbol: a ¾ perspective render
  // drawn into a floor plan is worse than a footprint, which is why nothing here
  // falls back from `planIcon` to `icon`.
  const icon = at(values, 'icon', index);
  let preview;
  if (icon !== undefined) {
    const entry = findEntry(entries, icon, catalogueDirectory);
    if (entry === undefined) {
      // Reported rather than skipped in silence. A named icon the archive does
      // not yield is either a malformed library or a path convention this
      // importer does not yet handle, and a user seeing every preview missing
      // deserves to know which entry it failed on.
      context.warn({
        code: 'missing-icon',
        subject: name,
        message: `"${name}" names the icon "${icon}", which could not be resolved to an archive entry; it has no preview.`
      });
    } else {
      const previewKey = `${sourceKey}--preview`;
      payloads.push({
        key: previewKey,
        format: formatOf(icon),
        bytes: await archive.read(entry.path)
      });
      preview = { payloadKey: previewKey };
    }
  }

  const capabilities = ['rotatable', 'scalable', 'duplicable', 'deletable'];
  // `movable#i=false` is the source saying this is fixed. Absent means movable.
  if (movable !== false) {
    capabilities.unshift('movable');
  }

  const realisation = isOpening
    ? {
        kind: 'wall-hosted',
        openingKind: openingKindFor(elevationCm),
        width,
        height: toMetres(heightCm ?? 204),
        // The same field doing honest work rather than a second guess.
        sill: toMetres(elevationCm ?? 0)
      }
    : { kind: 'standalone' };

  if (isOpening && isNearThreshold(elevationCm)) {
    context.warn({
      code: 'ambiguous-opening',
      subject: name,
      message: `"${name}" sits ${elevationCm} cm above the floor, close to the ${DOOR_ELEVATION_THRESHOLD_CM} cm door/window threshold; it was imported as a ${openingKindFor(elevationCm)}.`
    });
  }

  // The 3D model is **recorded and never read** (ADR-0038 Rule 21). Since
  // Sprint 041.6 what is recorded is the whole graph — the mesh, its materials
  // and their textures — because a reference whose `.mtl` was dropped records
  // something no future viewer can open, which is worse than recording nothing
  // because it looks complete (§8.4).
  const model = at(values, 'model', index);
  const rotation = parseModelRotation(at(values, 'modelRotation', index));
  let representation3d;
  let objText;
  if (model !== undefined) {
    const graph = await resolveModelGraph({
      model,
      archive,
      entries,
      catalogueDirectory,
      context,
      name,
      onObjText: (text) => {
        objText = text;
      }
    });
    representation3d = rotation === undefined ? graph : { ...graph, transform: { rotation } };
  }

  // The plan symbol, derived (Sprint 041.7, ADR-0039). Only when the library
  // supplied none of its own — the author's drawing always wins, and the host
  // enforces that too (Rule 5), so this is an economy rather than the rule.
  //
  // This importer computes **no geometry**: it parses its own format into
  // triangles and the host projects, unions and simplifies them. That is the
  // whole of ADR-0039 Rule 2, and it is why GLTF or IFC would need nothing new
  // over there either.
  let derivedSymbol;
  let derivationProblem;
  let derivationCause;
  if (symbol === undefined && objText !== undefined && typeof context.capabilities.outline === 'function') {
    const positions = objTriangles(objText);
    const outlined =
      positions.length === 0
        ? { ok: false, reason: 'the model declares no faces' }
        : context.capabilities.outline({
            positions,
            // Sweet Home 3D's models are Y-up, as Java3D's are.
            upAxis: 'y',
            // A model is in whatever units its author worked in; the catalogue
            // states the real size, so the host scales the outline onto it.
            fitTo: { width, depth: isOpening ? 0.1 : depth },
            ...(rotation === undefined ? {} : { transform: rotation })
          });
    if (outlined.ok) {
      derivedSymbol = {
        kind: 'vector',
        paths: outlined.paths,
        derivedFrom: outlined.derivedFrom
      };
    } else {
      derivationProblem = outlined.reason;
      // The host's stable code, carried into the warning so a report can group
      // "too detailed" apart from "overlaps itself" (Sprint 042.2b). Prose is
      // for the person; the code is for the count.
      derivationCause = outlined.code;
    }
  }

  // **One warning per asset, and only when it ended up as a rectangle.**
  //
  // Per-asset and never fatal: sixty-three outlines and one rectangle is a good
  // import (ADR-0039 Rule 9). What changed in Sprint 042.1 is *when* it is worth
  // saying anything — an asset that has no plan icon and gained a derived one is
  // drawn correctly, and reporting that was noise proportional to the library.
  if (symbol === undefined && derivedSymbol === undefined) {
    const because =
      derivationProblem === undefined
        ? planIconProblem === undefined
          ? 'has no plan icon and no model to derive one from'
          : `${planIconProblem}, and has no model to derive one from`
        : `${planIconProblem ?? 'declares no plan icon'}, and its model could not be outlined (${derivationProblem})`;
    context.warn({
      // Suffixed by cause, so a hundred rectangles group into the two or three
      // reasons they actually have rather than into one undifferentiated pile.
      code: derivationCause === undefined ? 'footprint-only' : `footprint-only-${derivationCause}`,
      subject: name,
      message: `"${name}" ${because}; it is drawn as its footprint.`
    });
  }

  return {
    sourceKey,
    version: '1.0.0',
    name,
    categoryPath: category === undefined ? [] : [category],
    realisation,
    representation2d: {
      // An opening's footprint is the leaf swept flat: it is what a preview
      // draws, and never what positions the opening on its host.
      footprint: isOpening ? centredRectangle(width, 0.1) : centredRectangle(width, depth),
      ...(symbol === undefined ? {} : { symbol }),
      ...(derivedSymbol === undefined ? {} : { derivedSymbol }),
      ...(preview === undefined ? {} : { preview }),
      // Recorded when an outline was attempted and refused (Sprint 042.4).
      // Absent means never tried — which is what an entry with no model is, and
      // what every library imported before 041.7 is. The host uses the
      // difference to stop telling a user that re-importing would help when it
      // would not.
      ...(derivationCause === undefined ? {} : { symbolRefusal: derivationCause })
    },
    ...(representation3d === undefined ? {} : { representation3d }),
    capabilities,
    ...(tags.length === 0 ? {} : { tags }),
    ...(creator === undefined ? {} : { creator }),
    ...(licence === undefined ? {} : { licence }),
    ...(Object.keys(metadata).length === 0 ? {} : { metadata })
  };
}

/**
 * Finds the archive entry a catalogue property names.
 *
 * `icon#i`, `planIcon#i` and `model#i` are **URLs relative to the catalogue
 * file**, which Sweet Home 3D resolves against the properties file's own
 * location. Real libraries write them several ways — bare (`chair.png`),
 * rooted (`/eTeks/chair.png`), or relative to a nested catalogue — and an exact
 * string match against the ZIP entry path silently found none of them, so an
 * import produced definitions with no icons at all and said nothing about why.
 *
 * The ladder is deliberately short and each rung is a **documented
 * normalisation** rather than a guess:
 *
 * 1. exactly the entry path;
 * 2. the same with a leading `/` or `./` removed;
 * 3. resolved against the directory the catalogue itself sits in;
 * 4. the file name alone — and **only when exactly one entry has it**, because
 *    two `chair.png` in different folders is precisely the case where guessing
 *    would attach the wrong picture to the wrong item.
 *
 * Returns `undefined` when none matches; every caller reports that.
 */
export function findEntry(entries, reference, catalogueDirectory) {
  const candidates = [reference, reference.replace(/^\.?\//, '')];
  if (catalogueDirectory.length > 0) {
    candidates.push(`${catalogueDirectory}/${reference.replace(/^\.?\//, '')}`);
  }

  for (const candidate of candidates) {
    const found = entries.find((entry) => entry.path === candidate);
    if (found !== undefined) {
      return found;
    }
  }

  const base = reference.slice(reference.lastIndexOf('/') + 1).toLowerCase();
  if (base.length === 0) {
    return undefined;
  }
  const byName = entries.filter(
    (entry) => entry.path.slice(entry.path.lastIndexOf('/') + 1).toLowerCase() === base
  );
  return byName.length === 1 ? byName[0] : undefined;
}

/** The directory an entry sits in, `''` at the archive root. */
export function directoryOf(path) {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function formatOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? 'bin' : path.slice(dot + 1).toLowerCase();
}

/** The importer as the host registers it. */
export const sh3fImporter = {
  id: 'sh3f',
  label: 'Sweet Home 3D furniture library',
  extensions: ['.sh3f'],
  // Every `.sh3f` is a ZIP, and `PK\x03\x04` is a ZIP. Deliberately **not**
  // declared as a signature: it would claim every `.aspkg`, `.docx` and `.jar` a
  // user ever drops, and the host's policy treats a signature as the strongest
  // evidence there is. The extension is the honest claim here.
  read: readSh3f
};

export function activate(context) {
  const importers = context.services.get(ImporterExtensionServiceToken);
  context.subscriptions.add(importers.registerImporter(sh3fImporter));
  context.logger?.info?.('Sweet Home 3D furniture import is available.');
}

export function deactivate() {}

/** Exposed for `node --test`; not part of the extension contract. */
export const __testing = {
  CATALOGUE_ENTRY,
  DOOR_ELEVATION_THRESHOLD_CM,
  LOCALISED_KEYS,
  PROPERTIES_ENCODING,
  readEntry,
  resolveModelGraph
};
