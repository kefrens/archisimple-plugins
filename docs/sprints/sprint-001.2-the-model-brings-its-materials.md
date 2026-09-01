# Sprint 001.2 — The model brings its materials

> **Status:** **Implemented** (2026-09-01)
>
> **Version:** 1.0
>
> **Repository:** `archisimple-plugins` · package `sh3f-importer` → **1.3.0**
>
> **Prerequisites:** ArchiSimple Sprints 056.3 and 056.4

---

# What this is

The last piece of the texture chain. ArchiSimple 056.3 taught the platform to
carry and draw materials; 056.4 gave `ImportMesh` somewhere to put them. This
parses them.

`objGeometry` is `objTriangles` plus what a texture needs: `vt` records emitted
**per corner**, because an `.obj` pairs a position with a coordinate at the face
and not at the vertex — which is how a cube's faces get separate patches of one
image. `usemtl` opens a run over the triangle stream. `mtlMaterials` reads
`newmtl`, `Kd` and `map_Kd`, and nothing else.

`objTriangles` remains, delegating: the derived plan symbol wants positions and
nothing more, and making a sixty-four-model library pay for what it does not use
would be the cost its own comment already refuses.

---

# Outcome

`node --test` — **99 pass, 0 fail** (93 before). Package at 1.3.0.

## Decisions worth recording

**A texture is named, never resolved.** A mesh is prepared during the import,
before the host has stored anything, so a material names `wood.png` the way the
model did. The host matches it against the dependency of that name — the same
name that field already carries, for the reason it already states.

**Only the materials the geometry uses are sent.** An `.mtl` commonly declares
more than a model needs, and the host refuses a group naming a material it was
not given — correctly, since the alternative is a mesh drawn in a colour nobody
chose.

**A model with no `vt` sends nothing rather than zeroes.** An all-zero
coordinate array is worse than none: it looks like data.

**A material with no `Kd` is white**, which is what the format means by omitting
it — the map unmodulated, or the renderer's default. Not a guess: the format's
own default.

## What the tests found

The first fixture declared `mtllib stool.mtl` while its file map held
`chair.mtl`. Three tests failed and the parser was correct throughout — an
`mtllib` naming a file the archive lacks resolves to nothing, which the importer
already warns about and which was not the case under test.

The uv path was **proven load-bearing by reverting** it: one test fails,
ninety-eight pass.

---

# Closing checklist

- [x] `node --test` passes — 99, up from 93
- [x] A model with no materials produces what 1.2.0 produced
- [x] Still parses no geometry and decodes no image
- [x] `package.json` at 1.3.0; `README.md` documents it
- [x] ArchiSimple's captured fixture regenerated, and `capture:check` clean
