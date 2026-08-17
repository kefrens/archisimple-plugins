# Sweet Home 3D Furniture Import

Imports a Sweet Home 3D furniture library (`.sh3f`) into the ArchiSimple Library.

Every byte of SH3F knowledge is in [`src/index.js`](src/index.js). The
application contains none of it, and a compliance test over there asserts as
much — which is the whole point of the importer seam (ADR-0037 Rule 1).

## Installing

Add `archisimple-plugins/` **once** as a local repository — Preferences →
Repositories → Add local folder — and this package is discovered, installed and
hot-reloaded like any other. It needs a host on SDK **1.1** or later: the
`importer` token arrived in Sprint 041.1, and an older host refuses this package
with a reason rather than failing at activation.

## Using it

**File → Import assets…**, or drop a `.sh3f` anywhere on the application window.
Progress reports per item and can be cancelled; a cancelled import adds nothing.

Imported furniture lands under **Imported → _library name_ → _the library's own
categories_**, in the library's own language. Nothing is translated and nothing
is re-filed into ArchiSimple's built-in tree: a cross-library, cross-locale
mapping table is unmaintainable, and one wrong guess buries a chair under
*Openings*.

## Where to obtain libraries

Sweet Home 3D publishes free furniture libraries at
<https://www.sweethome3d.com/importFurniture.jsp>, and the community
**Contributions** and **Scopia** libraries are the largest. ArchiSimple ships
none of them and redistributes none of them: you import a file you obtained.

## What maps, and what does not

| Sweet Home 3D                         | ArchiSimple                                                     |
| ------------------------------------- | --------------------------------------------------------------- |
| `name#i`                              | the asset's display name, verbatim and untranslated             |
| `category#i`                          | a category under `Imported → <library>`                         |
| `width` `depth` `height` (**cm**)     | metres — converted once, at one boundary                        |
| `id#i`, else a normalised `name#i`    | the stable identity a placed instance references                |
| `doorOrWindow#i=true` + `elevation#i` | a wall-hosted **door** (below 10 cm) or **window** (10 cm and up) |
| `elevation#i`                         | the window's sill, in metres                                    |
| `movable#i=false`                     | the `movable` capability is withheld                            |
| `planIcon#i`                          | the plan symbol, scaled by the decoded image's pixel width      |
| `icon#i`                              | a preview payload — **never** the plan symbol                   |
| `tags#i`                              | free-form search words, split on commas and otherwise verbatim  |
| `model#i`                             | a **resource graph** — mesh, materials, textures — never loaded |
| `modelRotation#i`                     | recorded as a 3×3 transform; applied by nothing                 |
| `license#i`, else the library's       | the licence recorded on that definition                         |
| `creator#i`                           | provenance on every imported definition                         |
| `creationDate#i`, `multiPartModel#i`  | carried as source metadata; nothing reads them                  |
| `dropOnTopElevation#i`                | carried as source metadata; **not** reproduced as a constraint  |
| `shelfElevations#i`                   | the same                                                        |
| `staircaseCutOutShape#i`              | carried as source metadata; nothing reads it                    |

### The localized catalogue

An `.sh3f` ships `PluginFurnitureCatalog_<lang>.properties` beside the base
catalogue — the analysed library has twenty of them. The importer selects the one
matching the language the host says the user is working in (`context.locale`,
ADR-0037 revision 2.1), trying `_fr_FR` before `_fr`, and falling back to the
base catalogue when the library ships neither. An untranslated library is a
library, not a defect, and produces no warning.

A localized catalogue translates **display strings only** — `name`, `category`,
`tags`, `description`. There is no French centimetre and no French file path, so
every dimension, reference and flag comes from the base catalogue, which is the
only place it exists.

An entry the translation skipped keeps the base catalogue's name, which is Java's
own `ResourceBundle` behaviour and Sweet Home 3D's. That is **reported**: a
partially translated library produces one warning saying how many names were
translated, so "half my furniture is in English" is something you are told rather
than something you discover.

Which catalogue was read is recorded in each definition's source metadata, so a
user who switches language later can tell why their furniture is in the language
it is in.

### The model graph

`model#i` names an `.obj`; the `.obj` names its `.mtl` with `mtllib`; the `.mtl`
names its textures with `map_*`. The importer reads those declarations — as
**text**, to find out what is referenced — and records the whole graph. No
geometry is parsed and no image is decoded.

A dependency the archive does not contain is a warning naming it. The model is
still recorded, without it.

A model in a format that declares no dependencies (a multi-part `.zip`) is
recorded as a bare reference: unpacking one to enumerate it would be loading it.

Deliberately absent:

- **`passage` openings.** Nothing in SH3F says "no leaf", so emitting one would
  be a claim the source does not make (ADR-0033 Rule 6).
- **Any fallback from `planIcon` to `icon`.** A ¾ perspective render drawn into
  a floor plan is wrong; a footprint is worse looking and correct.
- **3D geometry.** The graph is *referenced*, not parsed. Nothing loads a mesh,
  decodes a texture or renders anything (ADR-0038 Rule 21). Whether the bytes are
  also **retained** is the host's question, asked per import.
- **Sweet Home 3D *project* files (`.sh3d`) and texture libraries (`.sh3l`).**
  Different formats; a different importer.
- **A merged translation.** Names come from **one** catalogue. A half-French,
  half-English library would be worse than a consistently English one, which is
  why a partial translation is reported rather than quietly patched over.
- **Sweet Home 3D placement semantics.** `dropOnTopElevation` and
  `shelfElevations` are carried, not reproduced. Modelling "on top of" is a
  constraint system, and an import is not the place to invent one.

## Licence obligations this records, and does not discharge

The free libraries ship under CC-BY, GPL and Free Art, all of which bind whoever
redistributes. Every imported definition records the library's declared licence,
its contributor and the entry's creator, and the import report shows them.

Where the source states a licence **per entry** — the analysed library does, on
all 64 — that licence is recorded on that definition rather than the library's:
folding them into one value would flatten a distinction its author drew.

A library declaring **no** licence produces one prominent warning and records
`unknown` on every entry — not "unlicensed", not a guess, and not a silent
omission. Nothing here invents a licence, and no default is applied. What you may
then do with the content is between you and its author.

## Two things worth knowing about the format

**Centimetres.** Sweet Home 3D stores every dimension in centimetres and
ArchiSimple works in metres. A 45 cm chair imported unconverted becomes a 45 m
chair — plausible enough to pass any test that checks a number is positive, and
catastrophic on first placement. The conversion happens in one function, and the
tests assert *specific metre values*.

**ISO-8859-1.** Java `.properties` is Latin-1 with `\uXXXX` escapes, and these
libraries are largely French. Read as UTF-8, *Chaise pliante en métal* becomes
mojibake nobody notices until a user cannot search for their own furniture.

## Tests

No install, no build:

```bash
# From the repository root, not from inside this folder.
node --test sh3f-importer/tests/*.mjs
```
