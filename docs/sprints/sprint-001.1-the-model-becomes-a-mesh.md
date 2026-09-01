# Sprint 001.1 — The model becomes a mesh

> **Status:** **Implemented** (2026-09-01)
>
> **Version:** 1.0
>
> **Repository:** `archisimple-plugins` · package `sh3f-importer` → **1.2.0**
>
> **Prerequisites:** ArchiSimple Sprints 056.0 and 056.1

---

# What this is

The last piece. ArchiSimple 056.0 taught the viewer to draw a mesh and 056.1 gave
importers a capability that turns triangles into one. This calls it.

When the user chooses **Import with models**, each OBJ model is handed to
`context.capabilities.mesh` and the result is attached as a payload named by
`meshPayloadKey`. Furniture then draws its real shape instead of a box.

# What did not change

**This importer still computes no geometry.** It parses its own format into
triangles — `objTriangles`, which it has had since 1.0 for the derived plan
symbol — and the host normalises: up-axis, the catalogue's real size, the
source-declared rotation. The encoding is the host's and this package never
learns it, which is ADR-0039 Rule 1 holding exactly as it did.

---

# Outcome

`node --test` — **93 pass, 0 fail** (86 before). Package at 1.2.0.

## What landed

- A mesh is prepared when — and only when — retention is on. **One choice, one
  meaning**: a user who said "import with models" wants to see them, and one who
  declined wants neither the bytes nor anything derived from them.
- `fitTo` carries the catalogue's width, depth **and height**, so a model comes
  back at the size the catalogue states rather than the author's units.
- A model that cannot be prepared is **reported** (`mesh-not-produced`) and the
  asset keeps its reference and its placeholder.
- A host too old to offer the capability imports exactly as before.

## The parse is shared, not repeated

`objTriangles` walks the whole file, and both the outline and the mesh want its
result — a sixty-four-model library would pay that walk sixty-four times twice
over. A memoised `trianglesOf()` gives both the same array, and the test asserts
**identity**, which is what one parse looks like from outside.

## What the tests found

The fixture every earlier test used has an OBJ of `v 0 0 0` — **one vertex and no
faces**. Enough for everything before this, and it yields no triangles, so the
first four tests failed while the code was correct: the capability was never
reached because there was nothing to send it.

That is worth recording rather than quietly fixing. A fixture that satisfied
every previous test was inadequate for the first one that needed the model to be
a model, and the failure looked exactly like a bug in the code.

The mesh-key line was **proven load-bearing by reverting** it: one test fails,
ninety-two pass.

---

# Closing checklist

- [x] `node --test` passes — 93, up from 86
- [x] Declining models produces drafts identical to 1.1.0
- [x] Still parses no geometry and decodes no image
- [x] `package.json` at 1.2.0; `README.md` documents it
- [x] ArchiSimple 056.0 and 056.1 landed before this
