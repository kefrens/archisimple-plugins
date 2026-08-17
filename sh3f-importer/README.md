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
| `model#i`                             | recorded as a 3D reference and **never loaded**                 |
| `creator#i`, library licence          | provenance on every imported definition                         |
| `staircaseCutOutShape#i`              | carried as source metadata; nothing reads it                    |

Deliberately absent:

- **`passage` openings.** Nothing in SH3F says "no leaf", so emitting one would
  be a claim the source does not make (ADR-0033 Rule 6).
- **Any fallback from `planIcon` to `icon`.** A ¾ perspective render drawn into
  a floor plan is wrong; a footprint is worse looking and correct.
- **3D geometry.** The `.obj` is referenced, not extracted. Megabytes of mesh
  nobody can display would multiply storage for no capability.
- **Sweet Home 3D *project* files (`.sh3d`) and texture libraries (`.sh3l`).**
  Different formats; a different importer.
- **Translated names.** `name#i_xx` variants are carried in source metadata and
  not resolved: an imported name is its author's string, in its author's
  language.

## Licence obligations this records, and does not discharge

The free libraries ship under CC-BY, GPL and Free Art, all of which bind whoever
redistributes. Every imported definition records the library's declared licence,
its contributor and the entry's creator, and the import report shows them.

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
