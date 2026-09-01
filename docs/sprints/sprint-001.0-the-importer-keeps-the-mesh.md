# Sprint 001.0 — The importer keeps the mesh

> **Status:** **Implemented** (2026-09-01)
>
> **Version:** 1.4 — reviewed four times. v1.3 added what 055.3 and 055.4 made possible; **v1.4 catches a way the height could silently remove assets from a library that imports fine today.** See **Review findings**
>
> **Repository:** `archisimple-plugins` · package `sh3f-importer`
>
> **Prerequisites:** **ArchiSimple Sprints 055.2, 055.3, 055.4 and 055.1 have all
> landed** (2026-09-01). Nothing else blocks this; it is the last piece.
>
> **Related:** ArchiSimple ADR-0058 (asset meshes and the loader seam),
> ADR-0038 Rule 21 rev 2.2 (the 3D entry is a resource graph; retention is
> opt-in), ADR-0037 (importer extension API)

> **First sprint recorded in this repository.** Numbering is this repo's own,
> independent of ArchiSimple's, exactly as `architectural-intelligence` keeps its
> own (ArchiSimple ADR-0030). `docs/sprints/` is new; this is its first entry.

---

# Review findings

Reviewed against `src/index.js` and against ArchiSimple 055.2, which **landed
after this sprint was written** and changed the contract it targets.

## AD — A zero height would **remove** assets from a library that imports today

The most dangerous finding in this sprint, and it is one line.

`numberAt` returns `undefined` for a missing or unparseable value — but it
returns **`0`** for `"0"`. And ArchiSimple's validation of the new field is
`isPositive`, which `0` fails. A definition that fails validation is **skipped
with a warning**, not reported and kept:

```ts
if (!adaptation.ok) { warnings.push(…); continue; }
```

So a catalogue entry declaring `height=0` — a rug, a mat, a floor decal, a
malformed row — imports fine today and would **stop importing** the moment this
sprint sets the field. The asset disappears from the user's library and the only
trace is a warning.

**So the height is set only when it is greater than zero**, not merely when it is
defined. A zero is treated exactly as a missing one: no height, no geometry, no
complaint. That is also the honest reading — nothing is 0 m tall, so a zero is a
source saying nothing rather than a source saying "flat".

This is the difference between an additive change and a silently subtractive one,
and no test in either repository would have caught it: `import.test.mjs` asserts
`realisation.kind` and never a height, because there has never been one to
assert.

## X — Without `canRetainModels`, none of this runs

**The blocking one.** ArchiSimple 055.3 landed after v1.2 was written, and it does
not ask every importer whether to retain models — it asks only an importer that
declares it can:

```js
if (registered.importer.canRetainModels !== true) { /* never asked, gets false */ }
```

That guard exists because asking universally charged friction to every import for
a feature few libraries use — thirty-nine existing tests said so by stopping at a
question none of their importers could act on.

So `sh3fImporter` must declare **`canRetainModels: true`** in the object the host
registers. Without it the user is never asked, `context.retainModels` is always
`false`, and every line of Epic 1 is dead code that ships and does nothing. It is
one property and it is the difference between this sprint working and appearing
to.

## Y — 055.4 landed. Record the height in the same pass

The reason ArchiSimple 055.4 was sequenced *before* this sprint was so both
changes to the same function happen together: **stop throwing away what you
already read**, once, in one release of this package.

v1.2 does not mention the height. It should, because the field now exists:

```js
const heightCm = numberAt(values, 'height', index);   // line 782 — read for EVERY entry
…
: { kind: 'standalone' };                             // line 896 — and dropped here
```

`ImportedRealisation`'s standalone variant carries `height?: number` in metres
since 055.4, and `heightCm` is already in scope at the exact line that discards
it. This is a smaller change than retention and unblocks more: it is what lets
furniture be drawn at all.

**Omitted when the source states none.** `numberAt` returns `undefined` for an
entry with no height, and nothing invents one — ArchiSimple §8.4 refuses to guess
a dimension, and 055.4 deliberately added no default. An absent height stays
absent.

## Z — The plumbing is already where it needs to be

Checked rather than assumed. `readEntry` destructures **both** `payloads` and
`context` from its options, and calls `resolveModelGraph` from inside itself. So
the byte source, the payload sink and the retention flag are all in scope in one
function, and `resolveModelGraph` already destructures `context` too.

Retention is a local change to code that already reads the bytes — not a
re-plumbing. And the manifest's `sdkVersion: "1.1"` needs no bump: ArchiSimple
kept `SDK_VERSION` at 1.1 for exactly these additive members.

---

## T — `reference` does **not** become the key. 055.2 made it a separate field

Version 1.1 said the retained model's _"`reference` becomes that payload's key
rather than an archive path"_. That was the contract as documented when this was
written, and **ArchiSimple 055.2 changed it during review of that sprint**,
because the overload could not work: handed one string, a host cannot tell a
dangling key from an intentional archive path.

The shipped shape follows `symbol` and `preview`, which have always had an
explicit key:

```js
representation3d: {
  format: 'obj',
  reference: 'scopia/door/door.obj',   // stays — the record of where it came from
  payloadKey: 'scopia-door--model',    // added when the bytes are retained
  dependencies: [
    { name: 'door.mtl', reference: '…/door.mtl', payloadKey: '…', format: 'mtl' }
  ]
}
```

So this sprint **adds** `payloadKey` and leaves `reference` alone. That is
strictly better for this package: the archive path stays as the provenance record
it always was, and retention is additive rather than a rewrite.

## U — Textures are never read, so "reuses those reads" is two-thirds true

Version 1.1 claimed retention _"reuses those reads; it does not add a second
pass"_. Checked line by line:

| File | Read today? |
| ---- | ----------- |
| `.obj` | **Yes** — `archive.read(modelEntry.path)`, as text, to find `mtllib` lines |
| `.mtl` | **Yes** — same, to find `map_Kd` textures |
| Textures | **No.** Only *located* (`findEntry`) and named. Never read |

So the claim holds for the mesh and its materials and is **false for every
texture**, which is most of the bytes. Retention genuinely adds reads there, and
the sprint should say so rather than imply retention is nearly free.

A second, smaller thing: both existing reads are consumed inline —
`context.capabilities.text(await archive.read(path), 'utf-8')` — so the bytes are
never bound to a variable. Reusing them needs that expression split, which is
trivial but is not nothing.

---

# Current State

`sh3f-importer` reads a `.sh3f` archive and produces asset drafts. For a model it
resolves the **graph** — the `.obj`, the `.mtl` files it declares, the textures
those declare — and records their paths, reading each file as *text* to find out
what it names. Its own comment states the boundary:

> _"**Nothing is loaded.** The bytes of the `.obj` and the `.mtl` are read as
> text, to find out what they reference; no geometry is parsed, no image is
> decoded, and the result is a list of names (ADR-0038 Rule 21)."_

That is right, and this sprint does not change it. **Reading bytes to store them
is not loading them.**

## What is missing

`payloads.push(...)` appears in exactly **two** places in `src/index.js`: the
plan icon, and the preview. There is no retention of a mesh, no `.mtl`, no
texture — and no option to ask for one.

So an imported library records a graph of paths into an archive the application
does not keep. Open the resulting project on another machine and every model
reference names a file nobody has. In a real project — `RDC-BBA.archiproject`,
three imported doors — that is **fourteen** references and zero bytes.

---

# Order

**Two ArchiSimple sprints land first, and this one must not start before both.**

**055.2 — the address resolves.** 

The SDK says a 3D reference may be _"a path inside the source archive, or a
payload key"_. Until 055.2, the host implements only the first: it passes a 3D
reference through **verbatim**, resolving only the sprite symbol and the preview.

So an importer that emits payload keys today writes keys that resolve to
nothing, into definitions that are **persisted**. The damage would outlive the
mistake, which is the same reason ArchiSimple ADR-0030 Rule 8 makes the platform
release before its consumer.

**055.3 — the contract carries the choice.** `ImportContext` has no seam for a
per-import option and the flow's only user step runs after the read
(ArchiSimple **I-79**). Until that sprint there is nothing for this package to
honour, and retention would have to be a default — which ADR-0058 Rule 6
forbids, because meshes are large and the user has to be the one deciding.

---

# Goal

**An imported library can bring its models with it**, at the user's choice, with
the cost of that choice stated before it is made.

---

# Objectives

1. Retain mesh, material and texture bytes as payloads, and reference them by key.
2. Declare that this importer can, so the host asks.
3. Stop discarding the height it already reads for every entry.
4. Change nothing about what is parsed. Still no geometry, still no decoding.
5. Keep every existing behaviour when retention is off — byte-identical drafts,
   apart from the height, which is new information rather than changed behaviour.

---

# Out of Scope

- **Parsing or decoding anything.** ADR-0038 Rule 21 stands; this sprint reads
  bytes and stores them. A loader is ArchiSimple's, later, and is an extension's
  only under ADR-0058 Rule 2.
- **Formats other than OBJ.** `resolveModelGraph` already declines to enumerate a
  non-OBJ model, because a multi-part model is a nested archive and unpacking one
  to list it *would* be loading it. A non-OBJ model retains its primary file
  only, or nothing — decided in Story 001.0.2.
- **Changing the graph resolution.** Which files a model needs is already
  answered, correctly, and this sprint only adds bytes beside the answer.
- **Deduplication across libraries.** The host content-addresses payloads; an
  importer that tried to be clever about it would be solving someone else's
  problem twice.

---

# Epics

## Epic 1 — Retention

### User Story 001.0.1

**As** an imported model,
**I want** my bytes to travel with my definition,
**So that** a viewer on another machine has something to open.

#### Acceptance Criteria

- When retention is on, each model's primary file **and every resolved
  dependency** is pushed as a payload, and gains a **`payloadKey`** beside its
  existing `reference` (finding **T**). The `reference` is left as the archive
  path it always was — the record of where the model came from, which the host
  now falls back to when a key does not resolve.
- **All or none, per model.** A mesh retained without its materials is the
  "looks complete and is not" failure ADR-0038 rev 2.2 names; if a dependency
  cannot be read, the model is recorded the way it is today — by path — and the
  existing `missing-model-dependency` warning already says why.
- Payload keys follow the convention already in this file (`sourceKey`,
  `${sourceKey}--preview`), so a reader can tell which asset a payload belongs to.
- **`sh3fImporter` declares `canRetainModels: true`** (finding **X**). Without it
  the host never asks, `context.retainModels` is always `false`, and none of this
  ever runs.
- **The `.obj` and each `.mtl` are read once, not twice.** `resolveModelGraph`
  already reads both, and already hands the text back so the outline is derived
  from bytes already read — _"reading the same model twice for two answers is a
  cost a sixty-four-model library pays sixty-four times"_. Retention reuses those
  reads. Splitting the inline `text(await archive.read(…))` to hold the bytes is
  part of the story.
- **Textures are a genuinely new read**, and most of the bytes (finding **U**).
  They are located and named today, never read. Retention is not close to free,
  and the sprint says so rather than implying otherwise.

### User Story 001.0.1b

**As** a piece of furniture,
**I want** the height this importer already reads to survive,
**So that** something can draw me in three dimensions.

#### Acceptance Criteria

- A standalone entry's realisation carries `height` in **metres**, converted at
  this boundary as every other length here is.
- **Set only when it is greater than zero** (finding **AD**). `numberAt` returns
  `undefined` for a missing value and **`0`** for `"0"`, and ArchiSimple validates
  the field as positive — so passing a zero through would make a currently
  importable entry fail validation and be **skipped**, removing it from the user's
  library with only a warning. A zero is treated as no height at all.
- Nothing invents a height where the source states none: ArchiSimple §8.4 refuses
  to guess a dimension and 055.4 added no default (finding **Y**).
- An opening's `height` is untouched: it already had one and it means the same
  thing.
- This lands **with** retention, in one edit and one release, which is why
  ArchiSimple 055.4 was sequenced before this sprint.

---

### User Story 001.0.2

**As** a non-OBJ model,
**I want** to be handled deliberately,
**So that** my library does not half-import.

#### Acceptance Criteria

- The decision is stated in the outcome, one of: retain the primary file alone
  (its dependencies are unknowable without unpacking), or retain nothing and keep
  the path.
- Whichever is chosen, a user is not told a model travelled when only part of it
  did.

---

## Epic 2 — Honour the choice the host makes

> **Rewritten.** Version 1.0 asked this sprint to present the choice and state
> its cost. **It cannot**, and the check that established that is ArchiSimple
> finding **I-79**: `ImportContext` carries `signal`, `locale`, `report`, `warn`
> and `capabilities` and has no seam for a per-import option, and the import
> flow's only user step — category mapping — happens **after** the read, which is
> too late for a decision about what to read.
>
> Presenting the choice is therefore ArchiSimple's Sprint 055.3. This sprint
> honours it.

### User Story 001.0.3

**As** an importer,
**I want** to be told whether models should be retained,
**So that** the user's answer decides, not this package.

#### Acceptance Criteria

- Retention follows what the host supplies through `ImportContext`, and is
  **off** when the host says nothing — an older host, or one that never asks.
- **Off produces byte-identical drafts to the previous version.** The regression
  guard, and the first test written.
- This package presents nothing and stores no preference of its own. It is not
  where the decision lives.
- Bytes for a model are read **only when retention is on**. The point of taking
  the choice from the host is that an unwanted mesh is never read at all —
  reading everything and discarding it is the workaround I-79 rejects, and it
  would land the cost here.

---

# Testing Strategy

`node --test`, no install, no build — the two suites already in `tests/`.

- Retention off: drafts are byte-identical to today's **apart from the height**,
  which is new information rather than changed behaviour. The regression guard,
  and the one that must exist before anything else is written.
- **An entry declaring `height=0` still imports**, with no height and no
  geometry — finding **AD**, and the case that would otherwise remove an asset
  from a library that works today. Written against a fixture that has one.
- Retention on: a model with an `.mtl` and two textures yields four payloads and
  four keyed references.
- A dependency the archive lacks: no payloads for that model, the path recorded,
  the existing warning raised.
- A non-OBJ model: whatever Story 001.0.2 decides, asserted.
- Bytes are read once per file, not twice.

---

# Definition of Done

- [ ] `node --test` passes in `sh3f-importer/tests`
- [ ] Retention off produces byte-identical drafts to the previous version
- [ ] The importer still parses no geometry and decodes no image
- [ ] `package.json` version bumped; `README.md` says what retention does
- [ ] ArchiSimple Sprints 055.2 **and** 055.3 confirmed landed before this merges

---

# Expected Outcome

A user importing a SweetHome3D library can choose to bring its models. Nothing
draws them yet — that needs ADR-0058 accepted and a loader — but the bytes are
there, they travel with the project, and the fourteen `deferred` omissions in a
project like `RDC-BBA` become zero for anyone who opts in.

---

# Closing the sprint (MANDATORY)

- [ ] **Status** line set with the date
- [ ] **Outcome** written — including Story 001.0.2's decision about non-OBJ
      models
- [ ] `README.md` and `package.json` version updated
- [ ] Anything else the import contract cannot express reported to ArchiSimple as
      a finding, rather than worked around here — as I-79 was


---

# Outcome

**Implemented 2026-09-01.** `node --test sh3f-importer/tests/*.mjs` — **86 pass,
0 fail** (79 before). Package at **1.1.0**; README documents both new behaviours.

## What landed

- **`canRetainModels: true`** on the registered importer. Without it the host
  never asks and every line below is unreachable (finding **X**).
- **The height**, for every standalone entry, converted at this boundary as every
  other length is — **only when greater than zero** (finding **AD**).
- **Retention**, opt-in: the `.obj`, each `.mtl` and each texture become payloads
  with a `payloadKey`, beside the archive `reference` rather than replacing it
  (finding **T**, ArchiSimple 055.2).
- **Nothing is loaded.** Bytes are read and handed over unopened. Rule 21's
  abstention is about rendering, and this reads a file the way the plan icon and
  the preview already are.

## Story 001.0.2 — the non-OBJ decision

**Nothing is retained for a non-OBJ model.** Its dependencies are unknowable
without unpacking it, and unpacking would be loading it — so keeping the primary
file alone would produce exactly the "looks complete and is not" record ADR-0038
revision 2.2 reshaped this entry to prevent. A viewer would find a model it
cannot resolve, rather than a reference it knows it must go and find.

Whole or not at all, and for that format the honest answer is not at all.

## The review found the thing that mattered

Finding **AD** was the dangerous one and no test in either repository would have
caught it. `numberAt` returns `0` for `"0"`, the host validates the field as
positive, and a definition that fails validation is **skipped with a warning** —
so a catalogue entry declaring `height=0` would have gone from importing fine to
disappearing from the user's library. The change would have been silently
subtractive rather than additive.

`import.test.mjs` asserted `realisation.kind` and never a height, because until
ArchiSimple 055.4 there was no height to assert.

Both that and the `canRetainModels` declaration were **proven load-bearing by
reverting** them: two tests fail, eighty-four pass.

## One test measured the wrong thing first

"Reads each retained file once" counted property accesses on the fixture object,
and `entries()` walks the same map with `Object.entries` — which is a property
access, not a read. It reported two reads where there was one. Now counted at
`archive.read`, which is the thing the claim is actually about.

## Not verified here

That an imported library **draws** in ArchiSimple's 3D view. This repository's
tests end at the draft; the host's begin at adoption. The end-to-end check is
manual and is the next thing worth doing: import a `.sh3f` with models, place a
piece of furniture, open the 3D view.

---

# Closing checklist

- [x] `node --test` passes — 86, up from 79
- [x] Retention off produces drafts byte-identical to the previous version, apart
      from the height, which is new information
- [x] Still parses no geometry and decodes no image
- [x] `package.json` at 1.1.0; `README.md` documents retention and heights
- [x] ArchiSimple 055.2, 055.3, 055.4 and 055.1 all landed before this
- [x] Story 001.0.2's decision recorded above
