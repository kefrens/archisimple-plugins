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
 * PluginFurnitureCatalog.properties   the catalogue: one numbered block per item
 * <name>.obj / <name>.zip             3D models
 * <name>.png                          icons — a 3/4 render per item
 * <name>Plan.png                      plan icons — the top view, where present
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

/** Format-specific keys carried verbatim, namespaced away from every core field. */
const CARRIED_METADATA_KEYS = [
  'doorOrWindow',
  'elevation',
  'staircaseCutOutShape',
  'movable',
  'currency',
  'price',
  'dropOnTopElevation'
];

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

  const values = parseProperties(
    context.capabilities.text(await archive.read(catalogueEntry.path), PROPERTIES_ENCODING)
  );
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
      catalogueDirectory: directoryOf(catalogueEntry.path),
      context,
      payloads
    });
    assets.push(draft);

    context.report({ completed: position + 1, total: indices.length, label: name });
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

  const metadata = {};
  for (const key of CARRIED_METADATA_KEYS) {
    const value = at(values, key, index);
    if (value !== undefined) {
      metadata[key] = value;
    }
  }

  // The plan icon, and **only** the plan icon (§8.5). Falling back to the 3/4
  // render would put a perspective drawing into a technical one, which is worse
  // than a footprint.
  const planIcon = at(values, 'planIcon', index);
  let symbol;
  if (planIcon === undefined) {
    context.warn({
      code: 'missing-plan-icon',
      subject: name,
      message: `"${name}" has no plan icon and is drawn as its footprint.`
    });
  } else {
    const entry = findEntry(entries, planIcon, catalogueDirectory);
    if (entry === undefined) {
      context.warn({
        code: 'missing-plan-icon',
        subject: name,
        message: `"${name}" names the plan icon "${planIcon}", which the archive does not contain; it is drawn as its footprint.`
      });
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

  // The 3/4 render becomes the preview payload. Carried under its own key so a
  // preview surface can find it; nothing points a plan symbol at it.
  const icon = at(values, 'icon', index);
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
      payloads.push({
        key: `${sourceKey}--preview`,
        format: formatOf(icon),
        bytes: await archive.read(entry.path)
      });
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

  // The 3D model is **recorded and never read** (ADR-0038 Rule 21). Extracting
  // megabytes of geometry nobody can display would multiply storage for no
  // capability.
  const model = at(values, 'model', index);

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
      ...(symbol === undefined ? {} : { symbol })
    },
    ...(model === undefined
      ? {}
      : { representation3d: { format: formatOf(model), reference: model } }),
    capabilities,
    ...(creator === undefined ? {} : { creator }),
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
  PROPERTIES_ENCODING,
  readEntry
};
