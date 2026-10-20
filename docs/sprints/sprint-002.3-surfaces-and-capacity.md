# Sprint 002.3 — Surfaces and Capacity

> **Status:** **Implemented, uncommitted (2026-10-20)** — `fr-urban-rules` 0.4.0,
> `urban-rules` removed; 201 tests green (review fixes included). The two walks (step 10) go to the
> 096.6 / 002.4 joint walk.
>
> **Version:** 1.0
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules` → **0.4.0**;
> package `urban-rules` **retired** (removed from the repository and the
> published index).
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 5.4 (emprise au sol and floor area), US-06, § 7.2 (the programme warning
> moves here; `urban-rules` is replaced).
>
> **Prerequisites:** 002.1a–b (checks, edge roles), 002.2 (confirmed rules,
> the section). Platform: 096.0a–c (nested projection levels, floor area by
> clear-height band, unbuilt area, plot area; no voids, use or balconies),
> 096.1 (those on the SDK, per variation). The package declares SDK 1.27.
>
> **Sizes:** composition of two legal figures, a budget, caps on the
> existing building, a capacity estimate, procedure flags, the programme
> enricher, a package removed. Medium.

---

# Sprint Design Contract

Verified against `fr-urban-rules/src/index.js` on 2026-10-20.

- [x] **The host measures primitives; the extension applies the French
      definition** (proposal § 5.4). No primitive is recomputed here; no
      French definition goes to the host.
      _Held: the emprise is `plotCoverage().levels.<level>.covered` (or
      `coveredWithoutLightweight`) plus entered balconies; the surface de
      plancher is `floorAreas({ heightBands: [1.8005] })`'s areas; nothing is
      clipped or unioned here. The arithmetic on the host's figures (a sum of
      deductions, the annex areas subtracted from the extension, a share) is the
      French composition. The only area the extension measures itself is its own
      envelope ring's, for the capacity (002.2 DEC-7's derived feature)._
- [x] **Every figure names its definition.** "Emprise au sol (R.420-1)" or
      "Emprise au sol (lexique du PLU, p. n)". Until a figure is composed
      under a named definition, it says "estimate" (ADR-0088 Rule 5).
      _Held: `surfaces.emprise.r420` / `.lexiconPage` / `.allOverhangs`, the
      surface de plancher "Surface de plancher (R.111-22)" or "— estimate, n
      answers missing"; R.420-1 and R.111-22 quoted from the verified text._
- [x] **Budgets, not places.** A footprint ratio is shown as used / allowed
      / remaining and never shapes the envelope.
      _Held: a meter and a `fields` block; `envelopeFeature` reads setbacks
      only. The capacity takes the smaller of the envelope's ground area and
      the allowance — a figure, never a shape._
- [x] **A legal threshold is cited with its verification state.** Every
      procedure threshold carries its article and the date it was verified
      on Légifrance; one not yet verified is shown as "to verify", never as
      fact (DEC-6).
      _Held: `PROCEDURE_ARTICLES` (LEGIARTI, version date, read date) and
      `PROCEDURE_THRESHOLDS`; each procedure row cites "<article>, read on
      Légifrance on 2026-10-20"; the one reading step 1 could not settle (an
      architect for 150 m² of emprise alone on works) is "To verify" with no
      flag._
- [x] **Nothing is promised.** The capacity is "an estimate, not a right to
      build"; the procedure flags are "indicative".
- [x] **The retirement loses nothing a user decided.** `urban-rules`' three
      preferences are dropped by decision (proposal § 7.2), and the
      migration note says so.
      _Held: `fr-urban-rules/README.md` § Migration and `CHANGELOG.md`._

---

# Outcome (2026-10-20)

> **Walked in acceptance** (2026-10-20) by Sprint 002.4 jointly with the platform's 096.6, on five reference plots in the editor — see 002.4's Outcome; the owner has not looked yet. **Acceptance fix:** Surfaces' "Governed by:" row showed a translation key; `phraseText` now translates a phrase given by key (`tests/surfaces.test.mjs` asserted the raw key and now asserts the translation).

`fr-urban-rules` **0.4.0** and `urban-rules` removed, uncommitted. New in
`src/index.js`: the Surfaces view (`surfacesFor`, `floorArea`,
`procedureFlags`, `surfaceActions`, `nextSurfaceSection`), the
variation-keyed answers (`variationKeyOf`, `answersOf`, `withAnswers`),
`PROCEDURE_ARTICLES` / `PROCEDURE_THRESHOLDS`, R.420-1 and R.111-22 in
`ARTICLES`, the programme enricher (`createProgrammeStage`, the reader's
`programme(view)`, `programmeFacts`) and the "Replaced" detection; `ai` in the
manifest. `tests/surfaces.test.mjs` (29 tests); `fr-urban-rules/CHANGELOG.md`;
the step-1 record under `sprint002_3` in
`test-fixtures/fr-urban-rules/legi-articles.json`. The review fixes of 002.2
landed in the same tree (002.2 § Review fixes).

**Step 1, the law.** The eleven articles were read in DILA's LEGI export
(2025-07-13, the in-force `LEGIARTI` of each) and on live Légifrance on
2026-10-20 (`article_lc/<LEGIARTI>`: number, "version en vigueur depuis",
opening words):

| Article | LEGIARTI in force | In force since | Note |
| --- | --- | --- | --- |
| R.420-1 | LEGIARTI000028678466 | 2014-04-01 | as DEC-1 quotes it |
| R.111-22 | LEGIARTI000031721274 | 2016-01-01 | eight deductions, as DEC-3 |
| R.421-1 | LEGIARTI000051190132 | 2025-02-19 | permit, except R.421-2 to -8-2 and -9 to -12 |
| R.421-2 | LEGIARTI000050497056 | 2024-11-16 | a): ≤ 12 m, ≤ 5 m² emprise, ≤ 5 m² SdP; not in protected areas |
| R.421-9 | LEGIARTI000050497051 | 2024-11-16 | a): emprise **or** SdP > 5 m², and ≤ 12 m, ≤ 20, ≤ 20 |
| R.421-11 | LEGIARTI000050497040 | 2024-11-16 | I a): ≤ 20 / ≤ 20 / ≤ 12 m in protected areas |
| R.421-14 | LEGIARTI000031764577 | 2016-01-01 | a) > 20 m²; b) > 40 m² in a U zone of a PLU, or 20–40 m² past an R.431-2 ceiling |
| R.421-17 | **LEGIARTI000053561259** | **2026-02-22** | newer than the export (décret 2026-117); f) compared live, unchanged |
| L.431-1 | LEGIARTI000006815974 | 2007-10-01 | architect for a permit |
| L.431-3 | LEGIARTI000037667650 | 2018-11-25 | the decree's ceiling ≤ 150 m² for natural persons |
| R.431-2 | LEGIARTI000038682379 | 2019-06-23 | a): **SdP ≤ 150 m² only**; "both" in b) and c) |

What it changed: **correction 1 was wrong.** R.431-2 a) exempts a natural
person building a non-agricultural construction for themselves when its
**surface de plancher** is ≤ 150 m²; the "both SdP and emprise" wording is in
b) (agricultural, 800 m²) and c) (greenhouses), and was there in décret
2016-1738's version too. For works on an existing building, the last
paragraph's "soit la surface de plancher, soit l'emprise au sol de l'ensemble
… l'un des plafonds" is ambiguous for emprise alone (a)'s only ceiling is one
of SdP): shown "To verify", no flag. Correction 2 held (emprise **or** SdP;
the 40 m² U-zone case reverts to a permit past R.431-2).

**Gates.** `node --test fr-urban-rules/tests/*.test.mjs` — **193 pass, 0
fail**; `sh3f-importer` 99; `archisimple package validate ./fr-urban-rules`
(0.4.0, passed); `tools/build-index.mjs` (2 packages, no
`com.archisimple.urban-rules`) and `tools/check-index.mjs` (2 of 2 accepted)
into the scratchpad; `.aspkg` 0.66 MB. Out of the suite, the platform's built
`checkedReport` (`packages/extension-host/dist`) accepted the reports of the
five recorded plots (Lyon plui, Gordes plu, Rochefort not published,
Brouennes rnu, Mouzay cc) with stubbed coverage and floor areas, a section
holding every 002.3 member, nine entered rules and the retired stage listed:
**0 dropped, 0 refused**, every progress included; 002.2's checks
(edges, alignments, 200-action stress) likewise.

## Deviations

1. **Criterion 7's second branch inverted by step 1**: 145 m² of SdP with
   155 m² of emprise flags **no** architect for a new house (R.431-2 a)); for
   works on an existing building it reads "To verify". Tested both ways.
2. **Floor-to-floor** (DEC-5): the SDK's `Level` view carries no `height`
   (the platform's `Level.height` is a class field, not a property the
   `document` service shows). The code reads `property('height')` when a host
   gives it and otherwise takes the editor's default, 3 m, said in an
   assumption. Platform change needed to do better.
3. **The answers are choice-led forms** — one action per kind of answer with a
   room, storey or building choice (≤ 50 options, a notice past it) — rather
   than a tick per room (096.3b DEC-3's shape). Seven actions in all, whatever
   the house's size, so the list never nears 200. Each is still one Request.
4. **The procedure flags are rows of the Surfaces view**, not report `flags`:
   they are indicative readings of the figures beside them, and the report's
   flags are the heritage and risk perimeters that change them.
5. **No annex distance rule** (DEC-4's "within 20 m of the house"): phase 1's
   entry forms have no rule kind for it and no prescription type carries it.
   Not implemented; 002.6b (written rules) is where it would arrive.
6. **The extension measured** is the covered area at the PLU's chosen level
   less the existing building's, less the per-building areas of buildings
   marked annexes (said in the row's detail).
7. **SdP created by works** is the SdP of the buildings marked extension;
   unmarked, the procedure row asks for the marking. The existing house's
   SdP is what the model holds (the main building, when it is modelled).
8. **8°** applies 10 % to what remains of a building marked "served by
   internal common parts" — all of it taken as residential, since room use is
   not modelled.
9. **The capacity and the programme read absolute heights only**: under the
   RNU, with no confirmed absolute height, the capacity says "no confirmed
   height" (the relative limits are 002.8's `heightHeadroom`).
10. **"No confirmed planning rule"** (DEC-7) means no confirmed footprint or
    height rule: R.111-16/17 are `confirmed` coded rules but limit no floor
    area.
11. **The lexicon's lightweight toggle** reads `coveredWithoutLightweight`
    when off; R.420-1 and "all overhangs" always count light structures.
12. **`fr-urban-rules/CHANGELOG.md` was created**: the package had none, and
    DEC-8 names it.
13. The repository's own `dist/` (untracked, local) still holds the old
    `urban-rules` archive and index from an earlier build; the gate's index
    was built into the scratchpad as asked, and lists none.

## Acceptance criteria, walked

1. ✅ `surfaces.test.mjs` "criterion 1": R.420-1 150 m² with
   `balconies-not-modelled` and `overhangs-unsupported`, all overhangs 159 m²;
   156.4 / 165.4 m² with 6.4 m² entered.
2. ✅ "criterion 2": lexicon, balconies off, p. 12 → 150 m²,
   `emprise.lexiconPage {page: 12}`; one write with `expected`.
3. ✅ "criterion 3": 152.0 + 21.0 listed, 179.4 m², 15.2 % of 1 178 m²,
   1 185 m² cadastral; 173.0 m² and "balconies not modelled" without.
4. ✅ "criterion 4 and 12": allowed 471.2, remaining 291.8, the meter, the
   check `no_issue`.
5. ✅ "criterion 5": "answer needed" on 2° and 4°, "estimate, 6 answers
   missing"; after six answers (six writes) 375.6 m², "Surface de plancher
   (R.111-22)".
6. ✅ "criterion 6": ratio check 42 against 36 → potential issue; value
   check 50 → no issue; allowed 36 m² governed by the ratio rule.
7. ✅ "criterion 7" (with deviation 1).
8. ✅ "criterion 8": Lyon (U zone, PLUi) → declaration, R.421-17; Mouzay
   (carte communale) → permit, R.421-14.
9. ✅ "criterion 9" ×2: the warnings with their source, "no confirmed
   rule", unchanged without a Site / outside France / for a brief, frozen
   input untouched, synchronous and under 50 ms. Ported from
   `urban-rules/tests/package.test.mjs` (the Skill's tests were not: the
   Skill is not carried over).
10. ✅ "criterion 10" (`urban-rules/` absent) and the gates above:
    build-index lists no `com.archisimple.urban-rules`; check-index passes.
11. ✅ "criterion 11": 75.4 m² (the union), not 84; a replaced building adds
    nothing, said.
12. ✅ in "criterion 4 and 12": `SiteView.plotArea` 1 178 m² with a boundary
    of 1 160 m² shown as information.
13. ✅ "criterion 13": `roof-refused` → "not computed" with the reason;
    R.420-1 150 m².
14. ✅ "criterion 14": 3.2 m² less; a refused headroom → estimate with its
    reason; a sampled one says ± 0.4 m².
15. ✅ "criterion 15": A's parking not applied in B; no write.
16. ✅ "criterion 16": "Footprint not regulated" with the figures, no meter;
    a drawn 38 set aside → "No confirmed footprint rule".
17. ✅ "criterion 17" ×3: "Planning rules not read yet" with no warning; the
    reader's figures absent before a read and from the cache after it; the
    overview's "Replaced" while `urban-rules.programme` is listed.

Step 10's walks (Gordes AC0323, Lyon AB0105) are manual and **not done**: to
the 096.6 / 002.4 joint walk.

## Post-sprint list

- [x] `fr-urban-rules/README.md` (0.4.0 section, migration note, platform
      needs), `CHANGELOG.md`, the manifest description and version.
- [x] Repository `README.md` and `CLAUDE.md`: `urban-rules` removed from the
      tree diagrams and the package table, "the working reference" moved to
      `fr-urban-rules`, the retirement said.
- [x] Milestone § 5.4: the architect sentence corrected (step 1).
- [ ] Step 10: the walks on Gordes AC0323 and Lyon AB0105 — to the joint walk.
- [ ] Platform: the storeys' floor-to-floor height on the SDK (deviation 2).
- [ ] Commit (the owner's).

## Review fixes (2026-10-20)

An independent review of the implementation found nothing blocking and
re-verified the law live. Fixed in the tree (tests: `surfaces.test.mjs`
"review S1"–"S6", "review NITs"):

- **S1** — a room ticked under two deductions is deducted once, under the
  first kind (parking, attics, technical, cellars).
- **S2** — balcony entries count only for `main` and buildings drawn now; an
  entry for a vanished building is ignored, never pruned.
- **S3** — unnamed buildings read "Building n" (the Document's order) in the
  choices and tables; a building's name replaces it as soon as the
  `document` service shows it (`property('name')`, being exposed by the host
  adapter — no SDK change, nothing here to change).
- **S4** — a surface de plancher past 150 m² that is incomplete or estimated
  makes the architect row "To verify (estimate)", never "Required".
- **S5** — works with no storey of the existing building modelled say so in
  a row: the totals after works count only the floors drawn.
- **S6** — under the PLU's lexicon with light structures left out, the
  existing emprise (the extension caps' base and the extension measured) is
  `existing.area − existing.lightweightArea`.
- **Nits.**
  - A new construction above 12 m with at most 5 m² of emprise and of floor
    is a declaration (R.421-9 c)), outside protected areas.
  - Works under 5 m² cite **R.421-13**, added to `PROCEDURE_ARTICLES` after
    the same check as the others: DILA's export holds LEGIARTI000045938774
    (2022-06-19); live Légifrance (2026-10-20) shows a newer version,
    LEGIARTI000053561283 in force 2026-02-22 (décret 2026-117), whose opening
    paragraph and a) b) — what is cited — are unchanged word for word.
    Recorded in `legi-articles.json` (`sprint002_3`).
  - `open` answers move only into the variation open at write time, and only
    when it had none of its own; otherwise `open` is kept (no silent drop).
  - A storey under no ceiling (`covered: false`) leaves the base whole, and
    the total stays an estimate.
  - The per-building table holds at most 200 rows, the existing building's
    two included.
  - The AC2 flag reads "Site (classé or inscrit — check which)".
  - Thresholds compare at the working resolution: exactly 20 m² is "at most
    20", a declaration, not "plus de 20" (R.421-14).
- **Floor-to-floor.** The host adapter is being given `Level`'s `height`,
  `elevation` and `buildingId` as properties; the code already reads
  `property('height')` and keeps the 3 m default and its assumption when it
  is absent (deviation 2 stands until then).

**Owner's decisions** (2026-10-20, through the coordinator): keep "To verify"
for 150 m² of emprise alone on works; no envelope on a concave boundary until
002.7; the choice-led answer forms are accepted; the repository's untracked
local `dist/` is left alone (CI builds fresh).

Gates after the fixes: 201 tests pass (`sh3f-importer` 99); `package
validate` passed; build-index (2 packages) and check-index (2 of 2) into the
scratchpad; the five recorded plots' reports pass the platform's
`checkedReport` with 0 dropped and 0 refused, progress included.

---

# Current state

- `urban-rules` (`urban-rules/src/index.js`) computes "maximum buildable
  floor area" as `plotArea × coverage × min(storeys, maxStoreys)` from three
  preferences, and a `programme` planning-stage enricher warns when the
  programme exceeds it. Its Skill `urban-rules.maxBuildableArea` is pure.
  Nothing in the platform depends on the package; the platform's tests use
  the string `urban-rules` only as an example id
  (`apps/web/src/ai/__tests__/aiExtensionBridge.test.ts`,
  `packages/extension-host/src/extension-manager.ts` comments,
  `architectural-intelligence/src/__tests__/programme.test.ts`).
- `dist/` holds `com.archisimple.urban-rules-1.0.0.aspkg` and an `index.json`
  listing it; `tools/build-index.mjs` builds every folder with a manifest.
- `getBuildingFootprint().projected` is "an estimate of the emprise au sol"
  (ADR-0088 Rule 5).
- 096.0a–c will give (contract 3.19.0, on the SDK through 096.1), per
  building, three nested outlines: `ground`, `storeys` (upper storeys
  beyond the ground) and `withRoofOverhangs`, each roof's overhang with
  `support: 'not-modelled'`; per room, floor area from the inside face by
  **clear-height band**, and per storey the area inside the external walls;
  the plot's area, the area covered at each level and the unbuilt area (and
  the Site boundary's, when one exists). Kept parts of `Site.existingBuilding`
  count for **coverage only** (their heights are not on the Site); annexes
  are buildings.
- **What the model does not have** (096.0a–c's `notModelled`): **balconies,
  terraces, posts, canopies, stairs, shafts and floor openings (voids), room
  use, and parking**. A balcony drawn as a room is a room. Every figure below
  that depends on one of them needs the user's answer, or says it is
  missing.

---

# Goal

A **Surfaces** row under the PLU shows the emprise au sol per building and
in total against the allowance, the surface de plancher with its
deductions, extension and annex caps against the existing building, a
theoretical capacity labelled an estimate, and the procedure the project
would likely need — each with its definition and source. The programme
warning reads these, and `urban-rules` is retired.

# Out of scope

- The taxe d'aménagement's *surface taxable* (a different definition,
  proposal § 5.4).
- Pools and terraces as objects (the model has none; § 5.4).
- Written CES / caps extracted from the regulation (phase 2). In phase 1 a
  CES or cap exists only as a drawn (38) or entered rule, confirmed.
- The variation comparison's figures (096.11).
- Deciding the procedure: the flags are indicative; ABF, PPR and protected
  areas change it and are flags already (002.0).

---

# Decisions

## DEC-1 — Emprise au sol: two definitions, named

**R.420-1** (Livre IV, permits) — verified on Légifrance in step 1 like
002.1a's articles: "la projection verticale du volume de la construction,
tous débords et surplombs inclus", except "les ornements tels que les
éléments de modénature et les marquises" and "les débords de toiture
lorsqu'ils ne sont pas soutenus par des poteaux ou des encorbellements".

Composition from 096.0a–c's primitives:

| Primitive | R.420-1 | Note |
| --- | --- | --- |
| `ground` + upper storeys beyond it (`storeys`) | counted | — |
| roof overhangs (`increments.roofOverhangs`; absent when a roof is refused) | **not** counted | every overhang reads `support: 'not-modelled'` (the model has no posts), so all are taken as unsupported, with that assumption said; a user who knows an overhang is on posts adds it by hand |
| balconies | counted by the article | **`notModelled`**: not measured; the figure says "balconies not modelled", and the user may enter their area (persisted, `emprise.balconies`) |
| ornaments, canopies (marquises) | not counted | the model has none to measure; said |

**The PLU's own definition** applies to the PLU's own rules (CES, caps).
A PLU lexicon may exclude balconies, or include terraces above 0.60 m. In
phase 1 the user picks it: the Surfaces row has a **Definition** action.

- Its six fields: the choice "R.420-1" (default) / "the PLU's lexicon" /
  "projection, all overhangs", four two-option toggles (one per primitive)
  and a page field.
- The form's fields are static (096.3b), so the toggles and page are always
  shown. They are read only with "the PLU's lexicon".
- The choice is persisted in the section (`emprise: { definition, counts,
  page }`, one Request). When the PLU's
lexicon is chosen, the figure reads "Emprise au sol (lexique du PLU,
p. 12)".

Case law: when the PLU is silent, the projection with all overhangs
applies (§ 5.4). That is R.420-1 without the eaves exclusion — offered as
the third choice, "projection, all overhangs", rather than assumed.

**The total is the plot coverage's union**, never a sum.

- **Total** = `plotCoverage().levels.<level>.covered`, plus any entered
  balcony area.
  - The level is `storeys`, or `withRoofOverhangs` for "projection, all
    overhangs".
  - That figure is already **one union** of every building of the variation
    and the kept or `extended` existing parts. Overlap is counted once, and
    a `replaced` existing building is not counted (096.0a criterion 5).
  - Summing per-building projections and then adding `existing.area` would
    count twice what an extension shares with the existing house.
- **Per building**, for the breakdown only, the figure is
  `levels.<level>.buildings[]` (or `projection().storeys.area`). These rows
  are listed, never summed into the total.
- **Lightweight parts.** R.420-1 counts every construction, a veranda or a
  shed included, so the figure is `covered`, **not**
  `coveredWithoutLightweight`. The lightweight existing area
  (`existing.lightweightArea`) is shown beside it as information.
- **Overhangs.** The eaves are `projection().increments.roofOverhangs`.
- **A refused roof.** `withRoofOverhangs` (and the coverage's level) is
  `{ refused: 'roof-refused' }` and the increment is absent. Then "projection,
  all overhangs" is **not computed**, and says why; R.420-1 on `storeys` is
  unaffected.
- The extension does not clip polygons for areas the host computes.

**Every building on the plot** counts: new buildings of the Document, the
kept existing building, annexes. The existing building's `relation` is the
whole building's (`kept` | `extended` | `replaced`), not a part's. With
`replaced` it is excluded, and said.

## DEC-2 — The budget

`allowed = CES × plot area`, `remaining = allowed − used`, shown as a meter
(Screen 3b). Inputs:

- **CES** from a confirmed rule of kind `footprint_ratio` (drawn 38 or
  entered), with a `limit`.
  - **"Footprint not regulated"** when a confirmed footprint rule carries
    `statement: 'not_regulated'`. Phase 1 gets this from the "Add a ratio"
    form with Statement "not regulated" (002.2 DEC-6); phase 2 from the
    written rule (002.6b).
  - A rule set aside with "Does not apply" (`not_applicable`) is **not**
    "not regulated". It reads as no confirmed rule.
  - Otherwise "No confirmed footprint rule".
  - In every case the figures are still shown (US-06: "'Not regulated' is
    shown as such, and still shows the figures").
  - With no positive allowance there is no meter (the SDK's `allowed` must
    be > 0). The figures are shown as a `fields` block.
- **Plot area** is `SiteView.plotArea`, the same figure as
  `PlotCoverage.plotArea`: `plotOf` over the **parcels** (096.0a deviation
  9).
  - It is **not** the Site boundary's area. That one is
    `PlotCoverage.boundaryArea`, shown as information when a boundary
    exists, never used as the CES base.
  - Beside it, the cadastral `contenance` is a value **the extension** puts
    in the report (`properties.contenance` summed over the plot's parcels),
    labelled "cadastral, for reference". Proposal § 5.4: the host never
    reads `contenance`.
- **Pleine terre** (`green_ratio`) is shown with the emprise because it caps
  it in effect.
  - The figure is `levels.ground.unbuilt` (096.0a) against
    `green_ratio × plot area`.
  - **The level is `ground`**: an upper storey or eaves over open ground
    leaves it open ground.
  - The assumption is said:
  with the assumption "unbuilt area counted as pleine terre; paved or built
  underground areas are not distinguished" — the model does not know a
  pavement from a lawn.

## DEC-3 — Surface de plancher (R.111-22)

Verified on Légifrance in step 1. The article's deductions, against what
096.0c gives:

| R.111-22 | Deduction | Computable from primitives? |
| --- | --- | --- |
| base | closed and covered floors, from the inside face of façades | yes: the storey's area inside the external walls (096.0c) |
| 1° | wall thickness around door and window embrasures on the outside | **no** primitive; shown "not deducted (small)", an assumption |
| 2° | stair and lift voids | **no**: stairs, shafts and floor openings are `notModelled` (096.0c); the user enters the void area per storey, persisted |
| 3° | clear height ≤ 1.80 m | yes: the ≤ 1.80 m band (096.0c, `heightBands: [1.8]`) |
| 4° | parking, ramps, manoeuvring | **no**: room use and parking are `notModelled`; the user ticks the rooms that are parking, persisted |
| 5° | attics not convertible | **no**: a judgment on structure and access; the user ticks it per room, persisted |
| 6° | technical rooms of a collective building | **no**: room use is `notModelled`; the user ticks technical rooms, and answers collective vs house |
| 7° | cellars of dwellings served only by common parts | **no**: the user ticks it |
| 8° | 10 % of residential floor area when served by internal common parts | **no**: the user answers "served by internal common parts" once per building |

**Reading 096.0c's answer** (`floorAreas({ buildingId, variationId,
heightBands: [1.8005] })`, per storey `insideExternalWalls`):

- **The band edge.** Bands are `[from, to)`, so `[1.8]` would put a ceiling
  of exactly 1.80 m outside 3° ("≤ 1,80 m"). Asking at 1.8005 (half the
  working resolution above) puts it in.
- **`uncoveredArea`** (floor no ceiling covers) is not "closed and covered".
  It is subtracted from the base and shown as a line.
- **A `refused` headroom** (`roof-refused`, `storey-above-refused`), or
  `covered: false`, makes 3° unknown for that storey. The total becomes an
  estimate, with the reason given.
- **A `sampled` headroom** shows its `error` (± m²) on the 3° line.
- **No double deduction.** A ticked room's area (2° void, 4° parking, 5°,
  7°) is deducted once. Its part in the ≤ 1.80 band is taken out of the 3°
  line first.
- **The bases differ.** A room's `netArea` is measured inside its own
  walls, while the base is inside the external walls; partitions make the
  difference, said as an assumption.

Every deduction appears as a line with its article number and amount
(Screen 3b). A deduction that needs an answer the user has not given is a
line "not applied — answer needed" with the action that sets it.

**The answers are keyed by variation**, since the section is one per
project and shared by every variation:

```text
sdp: { <variationId>: { voids: [{ storeyId, area }], parking: [roomId],
       technical: [roomId], attics: [roomId], cellars: [roomId],
       collective: [buildingId] } }
```

- `variationId` is `SiteVariation.id` (the Document id, which survives save
  and load), from `site.variations()`.
- Room and building ids are the model's, within that variation.
- An id that no longer exists is **ignored**, never pruned by a write. The
  extension never writes from a read (002.2 DEC-5), and a pruning write
  could erase another variation's answers.
- `site.variations()` answers `[]` before the editor has a project session.
  The open variation's answers are then keyed `"open"`, and the next action
  writes them under its id.

The total reads "Surface de plancher (R.111-22)" only when every
deduction line is either computed or answered; otherwise "Surface de
plancher (R.111-22) — estimate, n answers missing".

## DEC-4 — Extension and annex caps

Rules of kind `extension_max`, `annex_max`, `floor_area_max` (drawn or
entered, confirmed), with a `base`:

- `existing_emprise`: the emprise (DEC-1's definition) of the kept parts of
  `Site.existingBuilding` **as they stood at the PLU's approval date** is
  what the regulation means; the model holds them as they stand now. The
  check uses the kept parts and says "existing building as modelled; the
  PLU's reference date is <datappro>".
- **A cap "≤ 30 % of the existing emprise and ≤ 50 m²" is two rules.**
  `RegulationRule` has one `limit`, and `RegulationCheck` one `ruleId`.
  - The first is `extension_max` with
    `{ kind: 'ratio', comparison: 'max', percent: 30, base: <"existing
    emprise"> }`.
  - The second is `extension_max` with
    `{ kind: 'value', comparison: 'max', quantity: { 50, 'm2' } }`.
  - Each is entered (002.2's "Add a ratio" and "Add an area cap") and
    confirmed on its own, and each gets its own check: the ratio's check has
    `limit` 30 % × the existing emprise in m².
  - The Surfaces view shows the allowed figure as the smaller of the
    confirmed ones, naming the rule that governs (Screen 3b).
  - A ratio of a phase-2 written rule arrives the same way, as two rules.
- **What is "the extension"**: the new buildings attached to the existing
  building, and what the Document adds to it. The extension asks the user
  to mark which Document buildings are extensions and which are annexes,
  once each, persisted (`roles: { <variationId>: { extension: [buildingId],
  annex: [buildingId] } }`, keyed by variation as `sdp` is; likewise
  `emprise.balconies: { <variationId>: { <buildingId | "main">: area } }`);
  unmarked buildings are listed "not classified". The editor cannot infer
  contiguity as intent.
- The extended part is measured from the coverage union, not by summing.
  It is the variation's covered area at the chosen level, less the existing
  building's `existing.area`, with the union counting their overlap once.
  A per-building row for each building marked an extension is shown beside
  it.
- An annex distance rule ("within 20 m of the house") is measured with
  096.0b's building target (`{ kind: 'building'; buildingId }`, through 096.1
  DEC-10): each building marked an annex against the main building.

## DEC-5 — The theoretical capacity

Proposal § 5.4's formula:

```text
ground  = min(envelope ground area (002.2 DEC-7), emprise allowance (DEC-2))
storeys = floor(confirmed height / floor-to-floor)   — a range when
          façade and total heights differ
capacity ≈ ground × storeys
```

- Floor-to-floor: the project's — the typical storey height of the main
  building, read from the `document` service's `Level` entities (the open
  variation only; for a parked variation the open one's is used, and said).
  It is not one of 096.0a–c's measures.
- Shown as a **range** and an **estimate**, with "Not applied:" listing every
  rule not in the formula (parking, appearance, distance between buildings,
  R.111-16/17's height dependence under the RNU) — Screen 3b.
- Not computed without a confirmed height **and** (an envelope or an
  emprise allowance); the row says which is missing.
- Under the RNU, the envelope depends on the height (002.1b DEC-5; the envelope outline is 002.7); the
  estimate uses the envelope at the confirmed design's height and says so.

## DEC-6 — Procedure flags, and their verification

Indicative flags beside the figures. **Every threshold is verified on
Légifrance in step 1**, its article, version date and read date recorded in
a table in `index.js`; a threshold not verified is shown "to verify" and
the flag is not raised.

| Flag | Rule as understood today | Article to verify | What to check |
| --- | --- | --- | --- |
| New construction: declaration vs permit | Prior declaration above 5 m² and up to 20 m² of emprise **or** surface de plancher; permit above 20 m² | R.421-1, R.421-2, R.421-9 | Both measures (emprise **or** SdP), the 12 m height condition on the small cases, the protected-area variants (R.421-11) |
| Works on an existing building | Permit above 20 m² created; **40 m²** in a U zone of a PLU or a document in its place; but a permit again when the total passes the architect's threshold | R.421-14 b), R.421-17 f) | "40 m²" applies only in U zones of a PLU (not RNU, not CC); the "or emprise" wording |
| Architect required | A natural person building for themselves is exempt only when **both** the surface de plancher **and** the emprise au sol of the floor-area-generating part are ≤ 150 m² | L.431-1, L.431-3, R.431-2 | The "both" wording (décret 2016-1738); agricultural thresholds differ (800 m²) and are out of scope; the total after works, for an extension |

Inputs: the composed SdP (DEC-3) and emprise (DEC-1, **R.420-1** always —
Livre IV uses R.420-1, never a PLU's lexicon), the regime and zone type
(002.0), the "works on existing" case from DEC-4's roles. Each flag reads
"Indicative: <article>; the procedure also depends on protected areas, see
flags" and is never a verdict. Missing SdP answers make the flags
"indicative, surface de plancher incomplete".

## DEC-7 — The programme warning moves here

`fr-urban-rules` registers a `programme` planning-stage enricher
(`ai` capability added to the manifest), id `fr-urban-rules.programme`:

- It reads, from the extension's current report (closure state, as
  `urban-rules` reads preferences): the confirmed emprise allowance, the
  confirmed heights, the capacity range (DEC-5), the plot area.
- It compares `programme.totalArea` with the capacity's upper bound and
  `programme.storeys` with the confirmed height's storeys; warns when
  exceeded, with the source of each limit. **The storey count moves in
  002.8** onto its `heightHeadroom` function (shared with the
  `can_add_storey` and `max_height` questions), which also covers the
  relative limits; this sprint's count, from the absolute height limits
  only, is the first form.
- With no confirmed rule, it adds one assumption ("No confirmed planning
  rule for this plot") and no warning; with no Site, or a Site outside
  France, it returns the input unchanged.
- **The host reads the report only once the row is wanted**
  (`useRegulationReport`: "never at open"). A session where the user never
  opened Site › Règles d'urbanisme has no report.
  - The enricher then adds the assumption "Planning rules not read yet:
    open Site › Règles d'urbanisme" and no warning. It never fetches, which
    would be I/O in a synchronous enricher.
  - When the report was read, it uses the plot cache (002.2 DEC-5) and the
    section.
  - Measures it needs that the report did not hold are read from
    `site.measures`, which is synchronous.
- Strings through `i18n.translate` (`fr-urban-rules.programme.*`), not
  literal English as `urban-rules` had them.
- Synchronous, under 50 ms (it reads a precomputed figure), returns a new
  object, never mutates — the host's rules, tests carried over from
  `urban-rules/tests/package.test.mjs`.

The Skill `urban-rules.maxBuildableArea` is **not** carried over: its
inputs were typed numbers, and a capacity that ignores the plot's rules is
the thing this milestone replaces. Assistant tools come with 096.12.

## DEC-8 — Retiring `urban-rules`

- Delete `urban-rules/`; remove its row from this repository's `README.md`
  and every mention in `CLAUDE.md` ("[urban-rules/] is the working reference
  for both seams" → `fr-urban-rules`).
- `node tools/build-index.mjs` no longer builds it; the next published
  `index.json` does not list it.
- **Migration note** in `fr-urban-rules/README.md` and the CHANGELOG:
  - an installed `com.archisimple.urban-rules` stays installed until the
    user uninstalls it; nothing uninstalls it remotely;
  - its preferences `com.archisimple.urban-rules.plotAreaSquareMetres`,
    `.siteCoverageRatio`, `.maxStoreys` are **dropped, not migrated**: the
    plot area comes from the Site, coverage and storeys from confirmed
    rules (proposal § 7.2). They stay in the preference store, read by
    nothing. Migrating them was never possible anyway: preferences are
    namespaced per extension, and one cannot read another's;
  - both enrichers would run if both packages are active.
    - The `package` service has `installed()` / `isInstalled()` only, with no
      "enabled" flag.
    - So `fr-urban-rules` asks `ai.listPlanningStages()` (ambient) whether
      `urban-rules.programme` is registered. It is registered only while that
      extension runs.
    - The check runs **at each read**, not at activation, since activation
      order is not promised.
    - When it is registered, the PLU overview shows "Urban Rules (generic)
      is replaced by this package; disable it" (Screen 8's "Replaced").

---

# Steps

1. **Légifrance**: R.420-1, R.111-22, R.421-1, R.421-2, R.421-9, R.421-11,
   R.421-14, R.421-17, L.431-1, L.431-3, R.431-2 — text, `LEGIARTI`, version
   and read dates, as 002.1a DEC-1. A threshold not verified stays "to
   verify" (DEC-6).
2. **Emprise** composition (DEC-1) and the definition choice.
3. **Budget** (DEC-2), the contenance beside the plot area, pleine terre.
4. **Surface de plancher** (DEC-3) with the answers.
5. **Caps** (DEC-4) with the building roles.
6. **Capacity** (DEC-5).
7. **Procedure flags** (DEC-6).
8. **The enricher** (DEC-7), its tests ported from `urban-rules`.
9. **Retirement** (DEC-8); `build-index` and `check-index` run.
10. **Tests**, then the walk on Gordes AC0323 (zone A: extension caps) and
    Lyon AB0105 (CES not regulated).

# Acceptance criteria

1. With 096.0a's primitives stubbed for a building of 150 m² at `storeys`
   and 159 m² at `withRoofOverhangs` (9 m² of eaves, `support:
   'not-modelled'`), R.420-1 gives 150 m² with "balconies not modelled" and
   "overhangs taken as unsupported", and "projection, all overhangs"
   159 m²; with 6.4 m² of balconies entered by the user, 156.4 m² and
   165.4 m² (test).
2. The PLU-lexicon choice with balconies off gives 150 m² and reads
   "Emprise au sol (lexique du PLU, p. 12)"; the choice is one Request
   (test).
3. Lyon's mockup figures reproduce with the balconies entered: buildings
   152.0 + 21.0 m², balconies 6.4 m² (entered, the model has none), total
   179.4 m², "15 % of the plot" on 1 178 m² measured, 1 185 m² cadastral
   beside it; without the entry, 173.0 m² and "balconies not modelled"
   (test with the mockup's primitives).
4. A confirmed CES 40 % on 1 178 m² gives allowed 471.2 m², remaining
   291.8 m² for 179.4 m² used (Screen 3b) (test).
5. With the 2° void (9.6 m²) and the 4° parking rooms (18.9 m², none of it
   under 1.80 m) answered by the user, SdP 418.5 − 9.6 (2°) − 18.9 (4°) −
   14.4 (3°) = 375.6 m²;
   without those answers 2° and 4° read "not applied — answer needed"; the
   total reads "estimate, n answers missing" until 2°, 4°, 5°, 6°, 7°, 8°
   are answered or marked not applicable (test).
6. Zone A, existing emprise 120 m², two confirmed `extension_max` rules,
   "≤ 30 % of the existing emprise" and "≤ 50 m²": planned 42 m².
   - The ratio rule's check: limit 36 m² → **potential issue**, 6 m² over.
   - The value rule's check: limit 50 m² → **no issue**.
   - Surfaces shows allowed 36 m², governed by the ratio rule (Screen 3b)
     (test).
7. A 160 m² SdP individual house flags "architect required (R.431-2)";
   145 m² SdP with 155 m² emprise of its floor-area part flags it too —
   **only** if step 1 confirmed the "both" wording; otherwise "to verify"
   (test on both branches).
8. A 35 m² extension of a 90 m² house (total 125 m², under R.431-2's
   150 m²) in a U zone of a PLU flags declaration; the same in a carte
   communale flags permit (test, subject to step 1).
9. The enricher warns when the programme exceeds the capacity's upper bound,
   says "No confirmed planning rule" with none, returns the input unchanged
   with no report, never mutates, and is synchronous (tests).
10. `urban-rules/` is gone; `node tools/build-index.mjs` lists no
    `com.archisimple.urban-rules`; `node tools/check-index.mjs` passes
    (CI + review).
11. An `extended` existing building of 24 m² of which 8.6 m² lies under a
    new 60 m² building: R.420-1 total = the coverage's `covered`
    (75.4 m²), not 84 m². A `replaced` existing building adds nothing
    (test with stubbed coverage).
12. The plot area is `SiteView.plotArea` even when a Site boundary with a
    different `boundaryArea` exists; the boundary's area is shown as
    information only (test).
13. A refused roof: "projection, all overhangs" reads "not computed" with
    the reason; R.420-1 on `storeys` is still given (test).
14. A headroom band answer with 3.2 m² of `uncoveredArea` lowers the base by
    3.2 m²; a `refused` storey headroom makes the total an estimate (test).
15. Parking ticks in variation A are not applied in variation B, and
    switching variations writes nothing (test).
16. A confirmed footprint rule with `statement: 'not_regulated'` reads
    "Footprint not regulated" with the figures; one marked `not_applicable`
    reads "No confirmed footprint rule" (test).
17. The enricher with no report read yet adds "Planning rules not read
    yet" and no warning; with `urban-rules.programme` listed, the overview
    shows "Replaced" (tests).

# Testing strategy

- **Unit:** composition tables with stubbed primitives; the budget; SdP
  lines; caps; capacity ranges; each procedure branch (verified and
  "to verify"); the enricher (ported tests).
- **Manual:** the two walks of step 10.

# Risks

- **Primitives too coarse.** 096.0a does not split overhangs by support
  (`support: 'not-modelled'`) and has no balconies: R.420-1 is composed
  with both assumptions said, and the user's entries fill what the model
  lacks.
- **Room use** is not modelled at all (096.0c): parking, technical, cellar
  and attic are user answers, and an SdP without them stays "estimate".
- **Procedure law is detailed** (protected areas, agricultural, public
  works). The flags cover the individual-house cases and say they are
  indicative.
- **Two enrichers** while `urban-rules` stays installed somewhere: detected
  and said (DEC-8).

# Questions for the owner

> **Answered 2026-10-19:** the owner accepted the recommendation given for each question below (site-regulations README §5). Where a question had no recommendation, the README records the decision.

1. Is the user picking the emprise definition (DEC-1) acceptable in phase
   1, or should "R.420-1" be fixed until extraction reads the lexicon?
2. Retirement: delete the folder (recommended; history keeps it), or keep
   it unpublished in an `archive/` folder without a manifest?

# Definition of Done

Step 1's record; the criteria walked; the Design Contract boxes checked;
`node --test fr-urban-rules/tests/` green; `build-index` and `check-index`
green; both walks recorded.

---

# Dependencies on platform sprints

| Sprint | What this sprint needs |
| --- | --- |
| **096.0a–c** | The nested outlines (`ground`, `storeys`, `withRoofOverhangs`) and their areas per building, roof overhangs with `support: 'not-modelled'`; floor area by clear-height band (≤ 1.80 m) and inside the external walls; unbuilt area at each level; `plotArea` = `plotOf` over the parcels (the boundary's area separately as `boundaryArea`); the coverage union counting kept and `extended` existing parts once, `replaced` not at all, lightweight parts included (`coveredWithoutLightweight` beside); `roof-refused` on `withRoofOverhangs`; headroom `uncoveredArea`, `refused`, `sampled` with `error`. **Not provided** (`notModelled`): balconies, posts, voids (stairs, shafts, floor openings), room use, parking — each a user answer here. Provides building-to-building distance through its `{ kind: 'building' }` target (DEC-4 there), for the annex rule |
| **096.1** | Those on the SDK, for the open Document and each variation, the building target included (DEC-10 there); room and building ids stable enough to key answers |
| **096.2** | Rule kinds `extension_max`, `annex_max`, `floor_area_max`, `green_ratio`, `footprint_ratio`; one `limit` per rule (a two-limit cap is two rules), a ratio's `base` a phrase; `statement: 'not_regulated'`; the Surfaces view as a `RegulationView` (`fields`, `table`, `meter` with `used` / `allowed` > 0) |
| **096.3a–b** | A meter (Screen 3b; 096.3a). A choice + toggles + page field (DEC-1), per-room and per-building ticks (DEC-3, DEC-4): 096.3b DEC-3, toggles as two-option `choice` fields, ticks as actions with `target.subjectId` (a room or building id) |
| **096.4** | The section grows `emprise`, `sdp`, `roles`, one Request each |

# Corrections to the proposal

1. **§ 5.4 "an architect is required above 150 m² for an individual"** is
   incomplete: the exemption needs **both** the surface de plancher and the
   emprise au sol of the floor-area-generating part ≤ 150 m² (R.431-2 as
   amended by décret 2016-1738), so either above 150 m² requires one. To
   verify in step 1.
2. **§ 5.4 "the 20 m² threshold (40 m² for an extension in a PLU's U
   zone)"** speaks of surface de plancher only; R.421-9 and R.421-14 count
   emprise au sol **or** surface de plancher, and the 40 m² case reverts to a
   permit when the total passes R.431-2's threshold. To verify in step 1.
3. **§ 5.4 lists four of R.111-22's deductions and "the other cases"**; the article has eight,
   four of which (1°, 5°, 7°, 8°) the model cannot compute and need the
   user's answer or an assumption (DEC-3).
4. **§ 5.4 "the PLU's lexicon may define it differently"** has no phase-1
   mechanism: without extraction, the user chooses the definition (DEC-1).
5. **Procedure thresholds use R.420-1's emprise**, never a PLU's lexicon;
   the proposal shows one emprise figure for both uses.
6. **§ 5.4 "extension cap measured against the existing building"**: the
   regulation's reference is the building at the PLU's approval date; the
   model holds it as it stands (DEC-4).
7. **§ 7.2 "the programme warning ... reads confirmed rules"**: `urban-rules`'
   Skill is not carried over; the proposal does not say so.

# Reconciliation (2026-10-19)

- Current state: 096.0a–c's actual primitives (nested outlines, overhangs with
  `support: 'not-modelled'`, bands, inside-walls area, coverage) and its
  `notModelled` list (balconies, terraces, posts, canopies, voids, room use,
  parking) replace the assumed split by support, balconies, voids and use.
- DEC-1: overhangs taken as unsupported (no posts); balconies are not
  measured and may be entered by the user; the figure is 096.0a–c's nested
  area, no union by the extension; `replaced` existing parts excluded.
- DEC-3: R.111-22's 2° (voids), 4° (parking) and 6° (technical) need the
  user's answer, persisted in `sdp`, since the model has no stairs, shafts,
  room use or parking.
- DEC-4: the annex distance rule is `not_checked` (no building-to-building
  measure in 096.0a–c).
- Prerequisites: 096.0a–c's provision restated (no voids, use or balconies);
  SDK 1.27 named.
- Criteria 1, 3 and 5: figures restated with balconies, voids and parking as
  user entries.
- Risks and the 096.0a–c dependency row rewritten against what 096.0a–c provides.
- DEC-4 and the 096.0a–c / 096.1 dependency rows: the annex distance rule is
  measured with 096.0b's building target (via 096.1 DEC-10), no longer
  `not_checked`.

# Reconciliation (2026-10-19, phases 2–4)

- DEC-7: the enricher's storey count moves onto 002.8's `heightHeadroom`
  (which also covers relative limits, and which the assistant's questions
  share); this sprint's absolute-limit count is the first form (002.8
  correction 6).

# Review (2026-10-19)

- References only: Sprint 096.3 was split into 096.3a (Regulations Tree and
  Panel: the row, badges, views, blocks and `phraseText` / `limitText`) and
  096.3b (Regulation Actions: `runAction`, fields, the FR requests), which
  share SDK 1.26. Mentions now name the half they mean, or 096.3a–b. Old
  DEC numbers are mapped: 1–7 stay as 096.3a DEC-1–7; 8 is 096.3b DEC-1;
  9–12 are 096.3a DEC-8–11; 13 is 096.3b DEC-3.

# Review (2026-10-20)

An independent review checked this draft against the **implemented** SDK
1.27 and the Outcomes of 096.0a–096.4. Changed:

- **DEC-4 — a two-limit cap is two rules (was BLOCKING).**
  - `RegulationRule` has one `limit` and a check one `ruleId`.
  - "≤ 30 % of the existing emprise and ≤ 50 m²" is two `extension_max`
    rules (a ratio and a value), each confirmed and checked on its own; the
    smaller allowed figure governs, and is named.
  - Criterion 6 is restated as two checks.
- **DEC-2 — the plot area is `SiteView.plotArea` (was BLOCKING).** That is
  `plotOf` over the parcels (096.0a deviation 9). The boundary's area is
  `PlotCoverage.boundaryArea`, shown as information only.
- **DEC-1 — the total is the coverage union.**
  - The total is `levels.<level>.covered` (+ entered balconies), never a sum
    of per-building figures plus `existing.area`. That sum double-counted
    the overlap of an extension and the existing building.
  - Lightweight parts are counted (`covered`, not
    `coveredWithoutLightweight`).
  - `relation` is the whole existing building's.
  - Overhangs are `increments.roofOverhangs`; `roof-refused` makes "all
    overhangs" not computed.
  - The Definition form's fields are static.
- **DEC-2 — not regulated, pleine terre, meter:**
  - "Not regulated" is read from a confirmed footprint rule with
    `statement: 'not_regulated'` (002.2 DEC-6's Statement field), never from
    "Does not apply";
  - pleine terre uses `levels.ground.unbuilt`;
  - there is no meter without a positive allowance.
- **DEC-3 — the floor-area answer:**
  - `heightBands: [1.8005]`, since bands are `[from, to)` and 3° says
    "≤ 1,80 m";
  - `uncoveredArea` is subtracted; a `refused` headroom gives an estimate,
    and a `sampled` one shows `error`;
  - no double deduction; the partition assumption is said;
  - **answers are keyed by variation id** (the section is per project), and
    a vanished id is ignored, never pruned.
- **DEC-4 and DEC-5:**
  - `roles` and balconies are keyed by variation;
  - the extended part is measured from the union;
  - floor-to-floor comes from the `document` service's `Level` entities
    (open variation only), not from a measure.
- **DEC-7 — the enricher and the unread report.** The host reads the report
  only once the row is wanted. An unread report gives the assumption
  "Planning rules not read yet", never silence, and never a fetch.
- **DEC-8 — "Replaced" detection.** It uses `ai.listPlanningStages()`
  containing `urban-rules.programme`, checked at each read; the `package`
  service has no "enabled". The note now says preferences could not be
  migrated anyway (namespaced per extension).
- **Criteria:**
  - criterion 5 is made unambiguous (parking not under 1.80 m);
  - criterion 8 fixes the house size so R.431-2's 150 m² is not crossed;
  - criteria 11–17 are added (union, plot area, refused roof,
    `uncoveredArea` and refused headroom, variation-keyed answers, not
    regulated vs not applicable, the unread report and "Replaced").
- Dependency rows for 096.0a–c and 096.2 are restated against the
  implementation.
