# Sprint 002.4 — FR Urban Rules Acceptance

> **Status:** **Walked (2026-10-20), uncommitted — awaiting the owner's look.**
> Expected values written before the walk; the five plots captured from the
> editor and replayed by `tests/acceptance.test.mjs` (5 pass, and the Gordes
> procedure test, a todo blocked by the platform's 096.6c until its acceptance
> fix the same day, passing); the index builds and checks; the joint walk with
> the platform's 096.6 recorded in the Outcome; the owner's three questions
> decided on his behalf (one check per building, the captures trimmed — all
> five plots, 4.6 MB — and the capture command behind a preference; see
> "Acceptance follow-ups"). `fr-urban-rules` stays
> **0.4.0** (not 1.0.0: the owner has not looked and nothing is published).
> _(Read "Draft (2026-10-19) — nothing implemented" until the walk.)_
>
> **Version:** 1.0
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules` → **1.0.0**
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 13 (first milestone, definition of done), § 4.1 (the five reference
> plots). Closes Phase 1.
>
> **Prerequisites:** 002.0–002.3 implemented. Platform: 083.12–096.5
> implemented; **096.6** (Site Regulations Acceptance) is walked **jointly**
> with this sprint.
>
> **Sizes:** fixtures, expected values, a recording script, the index, the
> walk. No new feature. Medium.

---

# Sprint Design Contract

- [x] **Expected values are written before anything is run.** § "Expected
      values" below is completed and committed (by the owner) **before** the
      first test against the recorded fixtures and before the walk. A value
      changed after a run is recorded as changed, with the reason.
- [x] **No live call in any test.** Every test reads a recorded answer
      through an injected `fetch` (or stubbed SDK services). Recording is a
      script run by hand, never by `node --test`.
- [x] **`verified` is a reference-plot status, never a user's** (proposal
      § 5.3). It appears in the fixtures' expectations, never in the
      package's report.
- [ ] **Hand-checked means by a person**, against the GPU's own viewer
      (geoportail-urbanisme.gouv.fr), the regulation PDF and Géorisques'
      site — not against this package's output.
- [x] **A § 13 box is ticked only with the evidence named** (a test, a
      screenshot, a line of the walk), or recorded as not met.

---

# Current state

- 002.0–002.3 each recorded fixtures for what they built (Lyon, Brouennes,
  Mouzay, Gordes partly, Rochefort partly) and tested against them
  separately. No single test walks a plot end to end.
- `tools/build-index.mjs` builds every folder with a manifest into
  `dist/*.aspkg` + `dist/index.json` with the platform CLI;
  `tools/check-index.mjs` reads the index with the platform's
  `parsePackageIndex` and fails on any issue.
  `.github/workflows/publish-index.yml` runs both on push to `main`.
- The platform's 096.6 walks "the stub country and the FR extension's
  002.0–002.3 … on the five reference plots" (platform README § 3).

---

# Goal

The five reference plots of § 4.1 give, in the editor and in the tests, the
values a person found by hand; the package builds into the published index
the platform accepts; and the joint walk with 096.6 closes Phase 0 and
Phase 1 together.

# Out of scope

- Any new rule, source or surface. A defect found here is fixed here only if
  it is a defect of 002.0–002.3; anything new is a sprint of its own.
- Phase 2–3 items (extraction, 3D envelope, sheet, variation figures,
  assistant tools, deployment trust).
- National coverage: five plots are an acceptance set, not a survey.

---

# Decisions

## DEC-1 — The five plots, pinned

| # | Case | Commune (INSEE) | Parcel | Pinned in step 1 |
| --- | --- | --- | --- | --- |
| P1 | City PLUi | Lyon 2e (69123, arr. 69382) | `69382000AB0105`, 1 185 m² | — |
| P2 | Small PLU | Gordes (84050) | `84050000AC0323`, 5 010 m² | — |
| P3 | Carte communale | Mouzay (55364) | **a parcel in sector C**, chosen in step 1 | its `idu` and contenance |
| P4 | RNU | Brouennes (55083) | `55083000AB0280` | its contenance |
| P5 | Not on the GPU | Rochefort-en-Terre (56196) | **a parcel inside the AC4 SPR**, chosen in step 1 | its `idu` and contenance |

§ 4.1 gives Mouzay and Rochefort-en-Terre without a parcel (a commune point
and "—"). A plot needs parcels; step 1 picks one each, through the editor's
own parcel picker (carte-gouv-fr), and records it here.

## DEC-2 — One test project per plot

Not a project file: this repository cannot open one without the platform.
The tests run on **recorded inputs**:

- `tests/fixtures/<plot>/gpu/*.json` — every API Carto, GPU and Géorisques
  answer (002.0 DEC-5/DEC-6), each with `.meta.json` (URL, date, status);
- `tests/fixtures/<plot>/site.json` — the Site view as 096.1 gives it
  (parcels, boundary, CRS, anchor), captured from the editor;
- `tests/fixtures/<plot>/context.json` — `queryRoads` and
  `queryFeatures('parcel' | 'building')` answers, normalised SDK shapes;
- `tests/fixtures/<plot>/site-calls.json` — every **call** the package made
  on the `site` service during a real read of the plot's **reference
  design** (DEC-3), as input → answer pairs:
  - `measures.projection`, `measures.floorAreas` (with its `heightBands`),
    `measures.distances` (with its targets, ratios and `byFacade`) and
    `measures.plotCoverage`;
  - `elevationAt`, `toGeographic`, `toGeographicRing`, `variations`.

  Measure answers depend on their inputs, and conversions and elevations are
  calls, not data, so a single "measures" snapshot cannot replay a read
  (see "How captures are made" below);
- `tests/fixtures/<plot>/section.json` — the package section after the
  walk's confirmations.

The editor-side projects (the reference designs) live in the platform's
`content/Projects/` only if the owner wants them there for 096.6; this
repository holds their captures, not the files.

**How captures are made** (decided, the review's recommendation): a
**recording `site` service**.

- **The command.** `fr-urban-rules` registers a development command,
  `fr-urban-rules.dev.captureFixtures`, titled "Capture test fixtures
  (developer)".
  - The SDK offers no way to tell a Development-Repository install from a
    published one, so the command ships in both.
  - It is harmless in both: it reads, downloads files, and writes nothing to
    the project.
  - It needs the `commands` capability.
- **What it records.** It wraps the real `SiteService` in a recorder,
  runs one read of the current plot through it, and downloads `site.json`,
  `context.json` and `site-calls.json`.
- **The replay.** The tests replay them through a stub `site` service that
  answers each recorded input and **throws on an input it has not
  recorded**. So a change in what the package asks fails loudly instead of
  answering wrongly.
- **Not MCP.** The Automation API's DTOs are in the plan frame, while the SDK
  restates them in the Site's CRS, so an MCP capture is not what the package
  reads.

## DEC-3 — A reference design per plot

So that checks and surfaces have something to measure, each plot gets a
simple design, drawn in the editor in step 2 and captured:

| Plot | Design | Why |
| --- | --- | --- |
| P1 Lyon | a 10 × 15 m block, 4 storeys at 3.00 m (12 m eaves, flat roof), 2.60 m from the rear edge | the rear-setback potential issue of the mockups; a height under 22 m |
| P2 Gordes | the existing house (the Site's existing building, relation `extended`) + a 5 × 6 m extension (30 m²) | zone A extension cap; a size between 20 and 40 m², so the procedure flag tells zone A (permit) from a U zone (declaration) |
| P3 Mouzay | a 10 × 8 m house, eaves 6.00 m, ridge 8.40 m, 4 m from a side edge, 8 m from the street edge | R.111-16 and the per-point R.111-17 case (002.1b criterion 2 for R.111-16, 002.1a criterion 6) |
| P4 Brouennes | the same house, 2.50 m from a side edge | an R.111-17 potential issue (2.50 < 3) |
| P5 Rochefort | a 9 × 7 m house | nothing measured: no rules; the entered-rule path |

**Every design** has the following, drawn in step 2:

- **An authored Site boundary.** It is never assumed (ADR-0080 Rule 7), and
  setback and R.111 checks are `not_checked` without one.
- **Edge roles** where a check names them.
- **The terrain fetched.** Height checks need the ground at the foot.

The project datum is left unset. So every height and rise figure is
`datumDerived` (096.0b review B1), and each height check carries 002.1a
DEC-7's `datum-derived` assumption. The expected values below say so.

## DEC-4 — Recording, by hand

`tools/record-fixtures.mjs` (this repository's `tools/`, beside
`build-index.mjs`): given a plot id and its WGS84 plot geometry (from the
captured `site-calls.json`'s `toGeographicRing` answers — `site.json`'s
rings are in the Site's CRS, and node has no projection of its own), it
replays the
reader's request list (imported from `fr-urban-rules/src/index.js`'s
`__testing.requestPlan(site)`, so the URLs are the package's own) with
the real `fetch`, and writes the answers. Run by hand; never imported by a
test; a `--check` mode compares a fresh recording with the stored one and
prints differences (for the owner to decide whether the GPU changed).

## DEC-5 — The index

- `fr-urban-rules` is built by `build-index.mjs` like any folder; its
  `sdkVersion` (`"1.27"`, 096.4's minor) must be accepted by the platform checkout
  `check-index.mjs` loads. **`check-index.mjs` must run against a platform
  that knows `regulations`**, or `parsePackageIndex` may refuse the entry
  (`unknown-capability` is a manifest refusal). The workflow's platform
  checkout follows `main`; it lands after 096.4 (SDK 1.27) merges there,
  not before.
- **Lockstep: `fr-urban-rules` must not reach this repository's `main`
  before the platform's `main` carries 096.x** (096.0a–096.5).
  - `publish-index.yml` runs on every push to `main` and builds **every**
    folder.
  - A manifest declaring `regulations` and SDK 1.27, checked against a
    platform `main` without them, fails `check-index`, and that fails the
    whole Pages publish. `sh3f-importer` would then not be published either.
  - Until then the package lives on a branch.
  - The platform side has its own condition: 096.4's file-version fold
    holds only if 083.12 and 096.4 are committed together before any push
    or Docker build (096.4 Outcome, DEC-6).
- **The deployment walked must carry 096.4 and 096.5.**
  - A web image without 096.4 provides SDK ≤ 1.26 and refuses the package
    ("needs SDK 1.27").
  - An image with 096.4 but without 096.5 loads the package and draws no
    plan layers.
  - So the image installed from the published index (DEC-6 step 2) is built
    from a platform commit holding both. 096.6 step 6 builds `web`,
    `share-service` and `plugins` from one commit.
- `urban-rules` is absent (002.3).
- The version is **1.0.0**: the first published version of the package.

## DEC-6 — The joint walk with 096.6

One session, the owner and the two sprints' checklists side by side:

1. The **stub country** first (096.6's): proves the host renders a report
   with no French knowledge.
2. Then each plot P1–P5 in the editor, from a new project located on the
   pinned parcel, with this package from the Development Repository
   **and** from the published index (a deployment's path).
3. For each: the row, the overview, the regime, the link, flags, rules,
   checks, surfaces, plan layers and legend, the status-bar count, against
   § "Expected values".
4. **Confirmations on P1.** Confirm, undo, redo, save, reload. Then open
   the project in the **editor with `fr-urban-rules` uninstalled**, and
   again with it installed but disabled (096.4 criterion 2's two cases).
   Make an unrelated edit (move the anchor), save, reinstall or enable, and
   reopen: the section is intact (§ 13).
   - **Not the share-service viewer.** It is read-only, so it cannot save,
     and a publication drops `site.packages` (096.4: `SITE.packages:
     'drop'`). It would prove nothing about silent loss.
5. **A failing source.** Block API Carto in the browser's devtools on
   Rochefort-en-Terre, where 096.6 criterion 13 walks it (and on P1 if time
   allows).
   - Expected: "source unavailable", named, with the last good read and its
     date; the rest is shown.
   - After unblocking, press **Try again**. While a source is unavailable
     the host shows Try again only, not Refresh (096.3b review Q3).
6. **A new document version.** There is no UI to edit a package's section,
   so:
   - save P1;
   - in the saved project file, edit
     `site.packages["com.archisimple.fr-urban-rules"].confirmations[*].datvalid`
     to an older date;
   - reopen. The rules reopen, with the old value and date, and the overview
     counts them.

Each step's outcome is a line in this sprint's outcome and in 096.6's,
with the same wording.

---

# Expected values

**Completed 2026-10-20, before the walk and before any end-to-end test**
(DEC-1 contract). The design-independent rows come from step 1's probe of
the **raw** services (API Carto `municipality`, `document`, `zone-urba`,
`secteur-cc`, `prescription-surf`, `assiette-sup-s`, the cadastre, and
Géorisques' `gaspar/pprn`, `gaspar/risques`, `zonage_sismique`, `radon`,
`rga`), queried by hand with `curl` and read without this package; the
design rows come from the reference designs' own measures
(`getBuildingDistances`, `getBuildingProjection`, printed by the platform's
`apps/web/src/test/regulationPlotFixtures.ts` when it built them, step 2).
**Who:** the acceptance agent, not a person — the "hand-checked by a person
against the GPU's viewer" box stays open for the owner (Outcome). The
exploratory reads of the five **bare** sites made before this table was
written (to learn the edge numbering a design needs) are recorded in the
Outcome.

**P3, P4 and P5 moved parcel** (step 1, DEC-1's "chosen in step 1" — P4's
was pinned and is changed, with its reason):

- **P3 Mouzay → `55364000AB0415`** (755 m², sector « C / Ci »). 002.0's
  `AB0346` (the commune point) is not inside the PPRi Meuse perimeter:
  `assiette-sup-s` answers no PM1 on it and `gaspar/pprn` at its centroid
  answers none, so it could not show § 4.1's PPRi. `AB0415` intersects the
  PM1 « périmètre règlementaire PPRI Meuse Stenay », and `gaspar/pprn` at
  its point answers « PPRI Meuse Secteur Stenay ». A first choice,
  `AB0217`, was dropped: 14 m wide, the 10 × 8 m house cannot keep 4 m from
  a side and 8 m from the street.
- **P4 Brouennes → `55083000AB0291`** (1 642 m²). `AB0280` is a triangle
  of 423 m², 15 m at its widest: the 10 × 8 m house 2.50 m from one limit
  is under 3 m from another wherever it stands, so it raises two or three
  potential issues where 096.6 criterion 11 asks for exactly one.
- **P5 Rochefort-en-Terre → `56196000AB0149`** (659 m², wholly inside the
  AC4 SPR). 002.0's `AB0235` (132 m², 7 m wide on most of its length)
  cannot hold the 9 × 7 m house.

The earlier plots' recorded fixtures (`test-fixtures/fr-urban-rules/{mouzay,
brouennes,rochefort}/`, 002.0–002.3) are kept: their tests read them, and
they still prove what they proved.

## P1 — Lyon 2e, `69382000AB0105`

| Item | Expected | Source of the expectation |
| --- | --- | --- |
| Regime | `plui` | `municipality.is_rnu` false + `document` `du_type` PLUi |
| Document | `idurba` `200046977_PLUI_20260326`, in force | probe 2026-10-20 (`zone-urba.idurba`; the document's `name` spells it `200046977_PLUi_20260326`) |
| Zone | `UCe1b`, `typezone` `U`, `datvalid` `20260326` | probe |
| Regulation | file `200046977_reglement_20260326.pdf` via `/files` | probe (`zone-urba.nomfic`) |
| Prescriptions (surf.) | **14** (13 in the 10-19 probe); « Hauteur Max-22 » → `height_total` 22 m, `to_confirm` | probe 2026-10-20 |
| Easements (surf.) | 23; AC1 « Eglise Saint-Nizier » (abords) → `abf`; AC2 « Centre historique de Lyon » → `site`; PM1 « PPRNi Grand Lyon secteur Lyon Villeurbanne » | probe |
| PPR flag | « PPRI du Grand Lyon - secteur Lyon-Villeurbanne »; **no zone**: `gaspar/pprn` answers the plan at a point, not its zone, and the GPU's PM1 names the perimeter only | probe |
| Géorisques `code_insee` | 69123 (radon from 69382) | § 4.3; 002.0 deviation 2 |
| Seismic zone, radon class | 2 (faible) / 1; RGA exposure 2 (medium) | probe |
| Plot area | 1 183.3 m² (`plotArea`, the parcel's ring), 1 185 m² cadastral beside it | the Site's parcel ring |
| Edge roles (walk) | the source names 1–8 Street (Rue Grenette, Rue de la République, Rue Henri Germain), 9 and 14 Side, 10–13 Rear; **the walk sets 9 Rear** — the west limit, between the parcel and its neighbour | bare read; DEC-3 "edge roles where a check names them" |
| Rear setback (entered 4 m via « Add a distance or height », confirmed) | measured **2.60 m** to edge 9 (`storeys` outline; edges 10–13: 3.31, 3.73, 3.73, 5.48 m) → **potential issue** — **one** check for the building, edge 9 governing, edges 10–13 listed in its subject (changed after the run, 2026-10-20: the owner's Q5, decided on the owner's behalf; the walk found one check per rear edge, 4 issues) | DEC-3 design, measured |
| Height check (22 m confirmed) | **12.00 m** top (flat); `topAboveGround.fromLowest` **12.09 m** → no issue, with the `datum-derived` assumption | design, measured |
| Emprise (R.420-1) | **150.0 m²** (`storeys`), no existing part | design, measured |
| CES | none confirmed → "No confirmed footprint rule", figures shown; never "not regulated", never an absent rule | — |
| CES recorded as not regulated (walk) | « Add a ratio », kind footprint, Statement « not regulated », with its source → a footprint rule with `statement: 'not_regulated'`, no limit; Surfaces reads « Non réglementé » / "Not regulated" **and still shows the figures**; no badge counts it | 002.2 DEC-6; 002.3 DEC-2; 096.2 DEC-2 |
| Status bar | "Règles d'urbanisme (PLU): 1 potential issue" (fr: « … : 1 problème potentiel ») after confirming 22 m and entering 4 m; before confirming 22 m the height check is not counted | 096.5 DEC-7 |

## P2 — Gordes, `84050000AC0323`

| Item | Expected | Source |
| --- | --- | --- |
| Regime | `plu` | probe |
| Zone | `A` | probe |
| Version key | `idurba` `84050_PLU_20241017` with the zone's `datvalid` `20220411`, both stored | probe |
| Easement | AC2 « Site Inscrit - L'ensemble formé par le plan de Gordes » → `site` flag | probe |
| Seismic / radon / RGA | 3 (modérée) / 1 / 3 (strong) | probe |
| Existing emprise | **144.0 m²** (the imported house's outline; the Site's existing building, relation `extended`) | step 2, measured |
| Extension | **30.0 m²** (5 × 6), total 174.0 m²; two entered `extension_max` rules: 30 % of the existing emprise → limit **43.2 m²** → no issue; 50 m² → no issue | step 2, measured |
| Procedure | zone **A**, 30 m² > 20 m² → **permit** flag (a U zone would give a declaration below 40 m²); R.431-2 total 174.0 m² > 150 m² → **architect** flag | 002.3 DEC-6 |

## P3 — Mouzay, `55364000AB0415` (sector C / Ci)

| Item | Expected | Source |
| --- | --- | --- |
| Regime | `cc`; « CC MOUZAY », version `55364_CC_20191107`, approved 2019-11-07 | probe |
| Sector | « C / Ci », `typesect` 01 (constructible) | probe |
| Rules | R.111-15 to confirm; R.111-16, R.111-17 confirmed; R.111-28 information; no L.111-3 | 002.1a DEC-2 |
| PPR | PM1 « périmètre règlementaire PPRI Meuse Stenay » drawn (easement/risk) with its legend row; `gaspar/pprn` « PPRI Meuse Secteur Stenay » | probe |
| Edge roles | as the source derives them: 5 Street (Place du Champ de Foire), 6–8 Street (Rue Chandenis), 4 and 9 Side, 1–3 and 10 Rear | bare read |
| R.111-17 | side edge 4 at **4.00 m**: eaves 4.00 ≥ 3.00, ridge 8.00 ≥ 4.20; rear edge 3 at **3.63 m**; the step (edges 1, 2) **4.65 / 4.50 m** from the gable end (≥ 4.20) → **no issue** (the ground under the house varies 0.5 m) | design, measured |
| R.111-16 | to the opposite alignment across Place du Champ de Foire (the house 5.11 m from edge 5): measured in the walk, ☐ recorded | step 2 (the facing parcels are the walk's) |

## P4 — Brouennes, `55083000AB0291`

| Item | Expected | Source |
| --- | --- | --- |
| Regime | `rnu` | `is_rnu: true` |
| Rules | as P3, **plus** L.111-3 `not_evaluable` | 002.1a DEC-2 |
| Edge roles | 3 and 5 Street, 2, 4 and 6 Side, 1 Rear (as derived) | bare read |
| R.111-17 (side edge 2, 2.50 m) | 2.50 < 3.00 minimum → **one potential issue**, and only one (edges 1: 21.72, 4–5: 15.08, 6: 35.00 m; edge 3 is the street, 8.00 m) | design, measured |
| Show on plan | outlines the east façade with "2.50 m" (or 2500 mm in the plan's unit) | 096.5 |
| R.111-28 | neighbours' average ☐ m, n without a height ☐ — read in the walk | the building source, live |

## P5 — Rochefort-en-Terre, `56196000AB0149` (in the SPR)

| Item | Expected | Source |
| --- | --- | --- |
| Regime | `not_published` | `is_rnu: false`, no document (probe) |
| Easement | AC4 « Site patrimonial remarquable de ROCHEFORT-EN-TERRE » → `abf` flag, drawn alone | probe |
| Rules | **none**; "Plan not on the GPU", hand entry offered; never "no rules" | § 4.4 |
| After entering a 10 m height | one `entered` rule, confirmed; the house (top **6.00 m**) checked: `topAboveGround.fromLowest` **7.93 m** ≤ 10 → no issue, with the `datum-derived` assumption | 002.2 DEC-6, DEC-7; design, measured |

---

# Steps

1. **Hand check** (a person, not the package): for each plot, the GPU
   viewer's regime, zone, prescriptions and easements; the regulation's
   first page and date; Géorisques' risks; pick and record P3's and P5's
   parcels. Fill the `☐` that this step fills. **Commit the expectations.**
2. **Reference designs** (DEC-3) in the editor, each with its Site
   boundary, edge roles and terrain; capture `site.json`, `context.json`
   and `site-calls.json` with `fr-urban-rules.dev.captureFixtures` (DEC-2);
   fill the remaining `☐`. **Commit.**
3. **Record** the GPU answers with `tools/record-fixtures.mjs` (DEC-4).
4. **End-to-end tests**, one per plot: Site + fixtures + section → the
   report → asserted against the tables above, including statuses and
   assumptions.
5. **Index**: `node tools/build-index.mjs --cli …`, `node
   tools/check-index.mjs --platform …` against a platform with 096.4+
   (SDK 1.27). Push `fr-urban-rules` to this repository's `main` only once
   the platform's `main` carries 096.x (DEC-5's lockstep).
6. **The joint walk** (DEC-6).
7. **Close**: the outcome, § 13's boxes each with evidence, this
   repository's README and CLAUDE.md, the proposal's status line (the
   owner's edit), and the platform's 096.6 outcome in the same words.

# Acceptance criteria

1. The "Expected values" tables are complete and committed before the
   first end-to-end test run (git history shows the order).
2. `node --test fr-urban-rules/tests/` passes the five end-to-end tests with
   no network (a test asserts `globalThis.fetch` is never called during the
   suite, by replacing it with a function that throws).
3. Each § 13 box maps to evidence:
   - the row and Properties only → walk step 3;
   - regime, document, version, zone, attribution, link (the PDF's first
     page; the zone's page is phase 2) → P1 test + walk;
   - four regimes and "not on the GPU" → P1, P3, P4, P5 tests;
   - R.111-16/17 against the Site boundary, Légifrance first → P3, P4
     tests + 002.1a's outcome;
   - drawn heights to confirm, hand entry → P1, P5 tests;
   - Surfaces with definition named, and "not regulated" carried as a
     `not_regulated` statement (never an absent rule) → P1, P2 tests;
   - plan layers with a legend → walk (096.5);
   - failed source named, last good read with its date, Try again → walk
     step 5 (within the session, 002.0 DEC-9);
   - confirmations as Requests, survive reload and the editor without the
     extension (uninstalled, and disabled), reopen on a version → walk
     steps 4 and 6;
   - second-country stub → 096.6;
   - five plots hand-checked → step 1;
   - `depcruise` and the provider-knowledge test → 096.6's gates.
4. `dist/index.json` lists `com.archisimple.fr-urban-rules` 1.0.0 and not
   `com.archisimple.urban-rules`; `check-index.mjs` reports no issue.
5. `tools/record-fixtures.mjs --check` on the day of the walk reports the
   differences from the recorded fixtures, and each is explained in the
   outcome (a GPU update, or a reader defect fixed).
6. The replaying `site` stub throws on an input absent from
   `site-calls.json`; a test proves it (a changed `heightBands` fails the
   suite rather than answering).
7. Each height check in the five end-to-end tests carries the
   `datum-derived` assumption, and the P1 status-bar expectation reads the
   source's label, not "PLU".

# Testing strategy

- **End-to-end on recorded inputs**, one per plot; the per-sprint unit
  tests stay.
- **Manual:** the joint walk, both install paths.
- **Network:** only the recording script and the walk.

# Risks

- **The GPU changes under us.** A revised PLUi between recording and the
  walk changes `idurba`; `--check` shows it; the expectations are updated
  with the reason, not silently.
- **Captures depend on the platform's shapes** (096.1's Site view, 096.0a–c's
  measures). A platform change after capture breaks the fixtures loudly,
  which is the point.
- **The joint walk needs both repositories on `main`** and a published
  index on Pages built against a platform knowing `regulations`. Pushing
  `fr-urban-rules` first would fail `publish-index.yml` for every package
  (DEC-5); the deployment walked must carry 096.4 and 096.5.

# Questions for the owner

> **Answered 2026-10-19:** the owner accepted the recommendation given for each question below (site-regulations README §5). Where a question had no recommendation, the README records the decision.

1. Should the reference designs live in the platform's
   `content/Projects/` (so 096.6 and `pnpm e2e shoot` can open them), or
   only as captures here?
2. P3 and P5's parcels: any preference (a parcel you know), or the first
   one in sector C and in the SPR?

# Definition of Done

Expectations committed before the runs; the criteria walked; § 13's boxes
each with evidence or recorded as not met; the published index green; the
joint walk recorded here and in 096.6; the proposal's status line updated
by the owner.

---

# Dependencies on platform sprints

| Sprint | What this sprint needs |
| --- | --- |
| **083.12–096.5** | Implemented and on `main` |
| **096.6** | The joint walk: its stub-country step, its gates (`pnpm depcruise`, the provider-knowledge test extended to `apicarto`, `georisques`, `rnb-api`, `idurba`, `datvalid`, `typezone`, `nomfic`), its own outcome |
| **096.4** | The silent-loss test on the host side, and a way to open a project in a build without the extension (the walk's step 4); SDK 1.27, which the package declares |
| carte-gouv-fr | France's profile naming `fr-urban-rules.gpu` in `planningSourceIds` (002.0's dependency, 096.2 step 7), shipped in the platform build walked |

# Corrections to the proposal

1. **§ 4.1 gives no parcel for Mouzay and Rochefort-en-Terre** (a commune
   point, "—"), yet § 13 says the five are "hand-checked" as plots. A plot
   needs a parcel; this sprint pins one each (DEC-1).
2. **§ 13 "A failed source is named, and the last good read is kept with
   its date"** holds within a session only (002.0 DEC-9); the box should say
   so, or the platform must offer a non-history store.
3. **§ 13 "The regulation opens at the zone's page"** is phase 2 (002.0
   DEC-7); the box is recorded as narrowed, not met as written.
4. **§ 5.3 `verified`** "for the hand-checked reference plots" is a test
   expectation, not a report status; the proposal lists it beside the
   statuses, which invites it into the vocabulary 096.2 defines.
5. **§ 12 "002.0–002.4 deliver US-01–US-06"**: US-04's 3D envelope and
   US-02's per-layer switch-off depend on 096.5/096.9; Phase 1 delivers
   US-04 on the plan only.

# Reconciliation (2026-10-19)

- DEC-5 and step 5: the package declares SDK `"1.27"`; the index is checked
  against a platform carrying 096.4, not "096.2+" or "≥ 1.25".
- Expected values: regime codes `plui`, `plu`, `cc`, `rnu` (096.2 DEC-11)
  replace `local_plan`, `municipal_map`, `national_rules`.
- Criterion 3: the link opens the PDF's first page in phase 1.
- Dependencies: 096.4's SDK 1.27 and 096.2 step 7 (the profile) named.

# Reconciliation (2026-10-19, phases 2–4)

- P1 expected values and criterion 3: 096.2's rule `statement` accounted
  for. With no confirmed CES Lyon reads "No confirmed footprint rule", never
  "not regulated" and never an absent rule; a footprint the user records as
  not regulated is a `statement: 'not_regulated'` rule, shown « Non
  réglementé » with the figures. The written « n'est pas réglementée » (and
  `see_graphic` rules) arrive with 002.6b.

# Review (2026-10-20)

An independent review checked this draft against the **implemented** SDK
1.27, the Outcomes of 096.0a–096.4 and the 096.5 and 096.6 specs. Changed:

- **DEC-6 step 4 — the editor without the package (was BLOCKING).** The
  share-service viewer is read-only, and a publication drops `site.packages`
  (096.4), so it could not show silent loss. The walk now uses the editor
  with the package uninstalled, then disabled.
- **DEC-6 steps 5 and 6:**
  - "Refresh" → **Try again**; the host hides Refresh while a source is
    unavailable (096.3b Q3);
  - the failed source is walked on Rochefort, as in 096.6 criterion 13;
  - the version change is made by editing the saved file's section, since
    no UI edits a package's section.
- **DEC-2 — captures by a recording `site` service** (the review's
  recommendation).
  - `fr-urban-rules.dev.captureFixtures` records input → answer pairs into
    `site-calls.json`, replacing `measures.json`: measure answers depend on
    their inputs, and conversions and elevations are calls.
  - The replaying stub throws on an unrecorded input.
  - Not MCP: its DTOs are in the plan frame.
  - DEC-4 takes the WGS84 rings from the recorded `toGeographicRing`
    answers.
- **DEC-5 — lockstep:**
  - `fr-urban-rules` must not reach this repository's `main` before the
    platform's `main` carries 096.x. Otherwise `check-index` fails
    `publish-index.yml` for every package, `sh3f-importer` included.
  - The deployment walked must carry 096.4 (SDK 1.27, otherwise the package
    is refused) and 096.5 (layers).
  - 096.4's fold condition is restated.
- **DEC-3 — the designs:**
  - every design has an authored Site boundary, edge roles and terrain, with
    the datum unset, so height checks carry the `datum-derived` assumption;
  - **P2's extension is now 5 × 6 m (30 m²)**, between 20 and 40 m², so the
    procedure flag distinguishes zone A from a U zone (42 m² flagged a
    permit in both). The existing building's relation is `extended`.
    096.6's design table (line 165, "6 × 7 m") follows 002.4 by its own
    rule; the coordinator should update it.
- **Expected values:**
  - P1's plot area is `SiteView.plotArea` (the parcels), not the boundary;
  - the setback is on the `storeys` outline;
  - the height check carries `datum-derived`;
  - "not regulated" is entered with Statement « not regulated » (002.2
    DEC-6), not "Does not apply";
  - the status bar reads the source's label (« Règles d'urbanisme (PLU) »),
    not "PLU:";
  - P2 has two `extension_max` checks (002.3 DEC-4) and its procedure row
    names the R.431-2 total;
  - P5's height check carries `datum-derived`.
- Criteria 6 (the stub throws on an unrecorded input) and 7 (the
  `datum-derived` assumption and the status-bar label) are added; criterion
  3 and the Risks are updated.

# Outcome (2026-10-20)

**Walked, uncommitted, awaiting the owner's look**, jointly with the
platform's Sprint 096.6 (whose Outcome holds the full walk; the lines below
use its wording). `fr-urban-rules` stays **0.4.0**: DEC-5's 1.0.0 is the first
*published* version, and nothing is published until the owner has looked and
both repositories' `main` carry the work (DEC-5's lockstep).

## What landed here

- **Expected values** (§ above), written at 11:04 on 2026-10-20 before the
  walk and before any end-to-end test (a copy of the document at that time is
  kept in the acceptance agent's scratchpad; git cannot show the order since
  nothing is committed — the owner commits). **Before** they were written,
  five exploratory reads of the **bare** sites (no design) were made in the
  editor to learn the edge numbering a design needs; no expected value was
  taken from them. Three plots changed parcel, with their reasons (§ Expected
  values).
- **The capture command** `fr-urban-rules.dev.captureFixtures` ("Capture test
  fixtures (developer)", DEC-2), the **`commands` capability** it needs, a
  recording `site`/`roads`/`map-features`/`document` service and a read-only
  `site-package-data`, six downloads (`site`, `site-calls`, `context`,
  `section`, `answers`, `report`). Deviation: `site.current()` has no
  `plotArea`, so `site.json` is the Site view of the last request the host
  passed to `read` (the host's `plotAreaOf()`), and the command must run after
  a read.
- **Replay helpers** (`tests/helpers.mjs`: `replayService`, `replayFetch`,
  `loadAcceptance`), throwing on any unrecorded input;
  `tests/acceptance-infra.test.mjs` (6) and **`tests/acceptance.test.mjs`**
  (one per plot, plus a todo).
- **`tools/record-fixtures.mjs <plot> [--check]`** (DEC-4): the package's own
  reader in node over the replayed site and the live `fetch`. Deviation: it
  runs the reader rather than replaying `__testing.requestPlan` (which does
  not exist). Its `--check` ignores API Carto's per-answer `timeStamp`, which
  the first check reported as a change on every request.
- **The captures**: `test-fixtures/fr-urban-rules/acceptance/<plot>/`, taken
  in the editor after the walk's decisions (Lyon: edge 9 Rear, a 4 m rear
  setback, « Hauteur Max-22 » confirmed, the footprint entered as not
  regulated; Gordes: the 30 % and 50 m² extension caps; Brouennes: R.111-15
  confirmed; Rochefort: a 10 m height), by the platform's
  `tools/e2e/specs/regulationsWalk.spec.ts` capture case. **≈ 14 MB** (Lyon
  6.4 MB: 14 prescriptions and 23 easement perimeters) — the owner may prefer
  to trim the answers before committing.
- **Acceptance fix (002.3's defect):** Surfaces' "Governed by:" showed a
  translation key ("fr-urban-rules.entered.kind.extension_ratio"). `phraseText`
  now translates a phrase given by key (`src/index.js`), and
  `tests/surfaces.test.mjs`, which asserted the raw key, asserts the
  translation. Walked again: "Governed by: Extension, % of the existing
  footprint".

## Acceptance criteria, walked

1. **Expectations before the runs** — written and copied at 11:04, the first
   end-to-end run at ≈ 12:45; **git cannot show the order** (uncommitted). ✓
   with that caveat, and the exploratory bare reads recorded above.
2. **`node --test fr-urban-rules/tests/*.test.mjs`**: 213 tests, 212 pass, 0
   fail, 1 todo; `acceptance.test.mjs` replaces `globalThis.fetch` with a
   throwing function for the whole file and asserts no call. ✓ (the directory
   form fails on Node 24, 002.0 deviation 1)
3. **§ 13's boxes** — each ticked in the proposal with its evidence, or left
   open (proposal § 13).
4. **The index** — `node tools/build-index.mjs --cli
   ../archisimple/tools/cli/dist/archisimple.js`: fr-urban-rules 0.4.0 and
   sh3f-importer 1.3.0, no `urban-rules`; `node tools/check-index.mjs
   --platform ../archisimple --index dist/index.json`: "2 of 2 package(s)
   accepted". ✓ at 0.4.0, not 1.0.0 (above)
5. **`record-fixtures.mjs --check` on the day** — all five plots: "no
   difference" (once the timestamps are ignored). ✓
6. **The replaying stub throws on an unrecorded input** —
   `acceptance-infra.test.mjs` (a `measures.floorAreas` with changed
   `heightBands` fails). ✓
7. **`datum-derived` and the label** — every measured height check in the five
   tests carries the assumption (asserted); the status-bar text is the host's
   (`Règles d'urbanisme (PLU): …`, read on the walk). ✓

**Values changed after the run, with their reasons** (the contract's rule):
P2's existing emprise and total are 144.04 and 174.04 m² (the table wrote the
display, 144.0 / 174.0); P3's step and P4's R.111-17 distances are the
governing pairs the checks show (4.653; 21.802, 15.088, 35.123 m), where the
table wrote the storeys outline's nearest distances printed when the designs
were built (4.50; 21.72, 15.08, 35.00 m); P4's R.111-15 reads confirmed
because the walk confirmed it before the capture. **Not met:** P2's procedure
flags — "not computed", the platform's floor areas refused for the imported
house (096.6c) — kept as a `todo` test _(met after the platform's Acceptance
fix 096.6c, below: permit; the architect row "to verify", not a flag)_; and P1's status bar reads **4**
potential issues, not 1 (the rear setback is checked per rear edge, and the
notch's derived rear edges 10–12 are under 4 m too).

## The joint walk (DEC-6), in 096.6's words

1. The stub first: `stubCountryEndToEnd.test.tsx`, every seam, no host change.
2. Each plot in the editor from its committed project, the package installed
   **from a published-style index** (a remote repository served locally). The
   **Development Repository** route was not walked: Add local folder needs a
   folder picker no automation drives.
3. Row, overview, regime, link, flags, rules, checks, surfaces, layers and
   legend, status bar — as § Expected values, except as recorded above.
4. Confirmations: on **Lyon**, confirm, undo, redo, save, reload; on
   **Brouennes**, the confirmed R.111-15 opened with the package
   **uninstalled**, then **disabled**, an unrelated Site edit (the datum),
   saved, reinstalled or enabled: the section intact, the rule confirmed.
5. A failing source on **Rochefort** (API Carto refused): "5 sources did not
   answer; everything else is current", each with its last good read and
   time; **Try again** only; it reads again after unblocking.
6. A new document version on **Lyon** (the saved section's `datvalid` made
   2019-01-01): "A new version is in force: 3 rules need to be confirmed
   again", each reopened with its old value and date.

## Questions for the owner

1. The captures weigh ≈ 14 MB: commit them whole, or trim the answers the
   tests do not read?
2. Keep the developer capture command (and the `commands` capability) in the
   published package, as DEC-2 decided, now that it exists?
3. Lyon's rear setback: per rear edge (4 issues here) is the extension's
   reading. Keep it, or count one issue per rule?

## Acceptance follow-ups (2026-10-20)

The three questions above were **decided on the owner's behalf** by the
agent running the follow-ups, as delegated; the owner may overturn any of
them. Nothing was committed.

1. **Q3 (Q5 in the joint list, the code's « Q5 ») — Lyon's rear setback: one check per rule per building** (taken on
   the owner's behalf). Each edge is still measured and evaluated, and still
   draws its own band; the report then folds a building's per-edge checks of
   R.111-17 and of a drawn or entered setback into one
   (`oneCheckPerBuilding`, `src/index.js`): the **worst edge governs** — the
   largest shortfall among the potential issues, else an edge not checked,
   else the smallest margin — and gives the check its result, `measured`,
   `limit` and `figure` (Show on plan draws the governing pair). The other
   edges are listed in the subject's label, the only place the SDK's
   `RegulationCheck` allows (`check.subject.mainEdges` / `namedEdges`: "Main
   building — Site boundary edge 9 (other edges: 10 (3.308 m), …)", with an
   edge's own R.111-17 limit when it differs from the governing one). Ids
   lose their edge: `r111-17:<building>`, `chk:<rule>:<building>`.
   `governed-by-*` stays the governing edge's; the others' assumptions
   (`adjoins` among them) are kept. R.111-16 (002.1b) is not folded — its
   subject is a building already, one per opposite alignment; a follow-up if
   the owner wants it folded too. **P1's expected value is now met:**
   1 potential issue (asserted: one rear check, edge 9 at 2.60 m, edges 10–13
   read from its label, and one potential issue among the confirmed rules'
   checks). 002.1a DEC-6 and 002.2 DEC-7 are revised in place and in their
   Outcomes; tests: `rnu.test.mjs` (criterion 6, criterion 7, DEC-6, review
   5), `rules.test.mjs` "002.4 Q5", `acceptance.test.mjs` P1, P3, P4.
2. **Q1 (Q7 in the joint list) — the captures, trimmed** (taken on the owner's behalf).
   `node tools/record-fixtures.mjs <plot> --trim` (new mode, no network)
   reads the plot offline twice, as the tests do (with the walk's section and
   without), and keeps only the `site`, `roads`, `map-features` and
   `document` pairs and the answers those reads were served from; rounds the
   platform's `fromGeographicRing` results to 1 mm and writes those pairs
   compact (`[[lat, lon]…]` → `[[e, n]…]`, read back by `expandSiteCalls` in
   the helpers); writes every file minified; and removes `report.json`, which
   no test read. The answers' texts and every recorded input are kept as
   captured, so `--check` still matches the live services: run on Lyon,
   Mouzay, Brouennes and Rochefort after the trim, "no difference" and no
   unrecorded call on each. **14.8 MB → 7.3 MB** (Lyon 6.7 → 2.0, Mouzay
   4.0 → 1.5, Brouennes 0.48 → 0.12, Rochefort 0.33 → 0.08 MB). **Gordes
   (3.6 MB) is not trimmed**: its captures were being re-taken for 096.6c at
   the same time by another agent, and were left untouched; run `node
   tools/record-fixtures.mjs gordes --trim` once that capture lands (about
   1 MB expected, from the other plots' ratio). _(Done at the final
   integration pass, after Acceptance fix 096.6c below: Gordes 3.6 → 0.94 MB
   — site calls 642 → 641, answers 19, document pairs 4 → 3, `report.json`
   removed; the five plots' captures **7.3 → 4.6 MB** in all.)_ What remains is mostly
   inputs that must match live requests byte for byte: the GPU's own WGS84
   rings as `fromGeographicRing` arguments and the answers' texts.
3. **Q2 (Q8 in the joint list) — the capture command, behind a preference** (taken on the owner's
   behalf). `fr-urban-rules.dev.captureFixtures` is registered only when the
   preference `fr-urban-rules.devCapture` is exactly `true` (default off;
   read once at activation — the preferences service has no change event —
   so it takes effect on the next activation; the host keeps it in
   `localStorage` as `archisimple.ext.shared.fr-urban-rules.devCapture`).
   The `commands` capability is kept, declared for this command alone, and
   so documented (CHANGELOG, package README). Tests:
   `acceptance-infra.test.mjs` "Q8" (off with no service, no value, `false`,
   `"true"`, a throwing service) and the two command tests, now with the
   preference on.

**Gates** (2026-10-20, after the follow-ups): `node --test
fr-urban-rules/tests/*.test.mjs` 215 tests, 215 pass, 0 fail, 0 todo (the
Gordes todo had been turned into a passing test by the concurrent 096.6c
work); `sh3f-importer` 99 pass; `archisimple package validate
./fr-urban-rules` passed; build-index (fr-urban-rules 0.4.0, sh3f-importer
1.3.0) and check-index ("2 of 2 package(s) accepted") into the scratchpad.

## Acceptance fix 096.6c (2026-10-20)

The platform's defect 096.6c is fixed there (`archisimple`
`docs/sprints/sprint-096.6-site-regulations-acceptance.md`, § Acceptance fix
096.6c): the room ring of walls stored on their outer face was squared at a
re-entrant corner by a rounding residue (`squaresTheJoin` against
`MITER_LIMIT × 0`), and crossed itself; it now uses the wall join's own
`exceedsMiterLimit`. Gordes' house measures 128.58 m², the extension 25.08 m²,
154.98 m² inside the façades.

**Here** (test and capture files only):

- `test-fixtures/fr-urban-rules/acceptance/gordes/site-calls.json`: the
  `measures.floorAreas` entry re-recorded through the documented route — the
  platform's `regulationsWalk.spec.ts` capture case (`CAPTURE_TO`), on the fixed
  platform. Every other `site` call of the new capture was identical to the
  committed one (compared by input), so only that entry was replaced;
  `section.json` and `answers.json` were kept (they differ only by the entered
  rules' generated keys and dates, and the answers' order).
- `tests/acceptance.test.mjs`: the P2 test no longer asserts "not computed",
  and the todo is a passing test. **P2 Procedure: permit** (works on the
  existing building, 30.0 m² of emprise created, zone A → R.421-14), with the
  figures 30.00 and 174.04 m² — as expected. **P2 Architect: "to verify"**
  (`architectEmpriseToVerify`, 150 m²), **not** the table's flag. *Value
  changed after the run, with its reason:* the table's "174.0 m² > 150 m²" is
  the emprise total, and this package's DEC-6 step 1 reads R.431-2 a)'s
  ceiling as surface de plancher only (`architectEmpriseVerified: false`, an
  emprise past 150 m² is shown "to verify", no flag); the surface de plancher
  here is 0 m², since the reference design has no roof and every room answers
  `covered: false`. Whether Gordes' reference design should carry a roof (so
  its surface de plancher is measured) is a question for the owner.

`node --test fr-urban-rules/tests/*.test.mjs`: 215 pass, 0 fail, 0 todo.

**Final integration pass (2026-10-20).** `node tools/record-fixtures.mjs
gordes --trim` run offline on the 096.6c capture: `answers.json` 335 → 335 KB,
`site-calls.json` 2.10 → 0.59 MB, `context.json` 10 → 5 KB, `report.json`
(1.1 MB) removed — Gordes 0.94 MB. Acceptance captures now: Lyon 1.97 MB,
Mouzay 1.51, Gordes 0.94, Brouennes 0.12, Rochefort 0.08 — **4.63 MB**. Then
`node --test fr-urban-rules/tests/*.test.mjs` 215 pass, 0 fail, 0 todo;
`sh3f-importer` 99 pass; `archisimple package validate` passed for both
packages; build-index (fr-urban-rules 0.4.0, sh3f-importer 1.3.0) and
check-index ("2 of 2 package(s) accepted") into the scratchpad.
