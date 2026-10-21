# Règles d'urbanisme (PLU) — `fr-urban-rules`

**Status:** Proposal v2.2 — **Phase 1 implemented and walked, uncommitted (2026-10-20)**: 002.0–002.3 implemented (`fr-urban-rules` 0.4.0), 002.4 walked jointly with the platform's 096.6 and awaiting the owner's look; 002.5a, 002.5b, 002.6a (`fr-urban-rules` 0.5.0, the zone page link) and 002.6b (0.6.0, written rules to confirm) implemented and **walked in the editor with the platform's 096.7–096.8b** (Phase 2 integration pass, 2026-10-20; §12), uncommitted, awaiting the owner's look; 002.7 (`fr-urban-rules` 0.7.0, SDK 1.30: the theoretical envelope's outline on concave plots and its 3D volume, the Envelope view and the regulation sheet's content) **implemented and walked on the five reference projects with the platform's 096.9 and 096.10 (2026-10-21), independently reviewed the same day (the inset rewritten, re-walked), uncommitted**; 002.8 (`fr-urban-rules` 0.8.0, SDK 1.32: the assistant's four questions on one headroom function, the _Confirm_ offer, `checkVariation` for parked variations, the manifest's `network.hosts`) **implemented, walked and independently reviewed with the platform's 096.11 and 096.12 (2026-10-21), uncommitted**; 002.9 (`fr-urban-rules` 0.8.1 — three defects the expected values found —, service 0.2.1) **locally walked jointly with the platform's 096.14 (2026-10-21), uncommitted; owner steps pending**: the hand check of `test-fixtures/fr-urban-rules/acceptance/expected-002.9.json`, the production model and its key, the two acceptance recordings, the Docker and NAS walks; 002.10 draft (002.5 and 002.6 each split in two by the Phase 2 review, 2026-10-20). Sprints drafted and reconciled (§12). _(Read "nothing implemented" until 002.0.)_
**Date:** 2026-10-19. v2.2: corrections from drafting the sprints (§15).
- v1: the initial proposal, commit `4e3acd7`.
- v2: the live probe folded in.
- v2.1: the independent review of v2 against archisimple `1e6cac25` folded in
  (§14).

**Package:** `com.archisimple.fr-urban-rules` (archisimple-plugins), replacing
`com.archisimple.urban-rules` (§7.2)
**Platform prerequisite:** the *Site Regulations* milestone in archisimple,
`docs/milestones/site-regulations/README.md` (Phase 0, §12)
**Primary data sources:** Géoportail de l'Urbanisme (GPU), API Carto IGN, Géorisques, Géoplateforme
**Target:** France
**Mockups:** https://claude.ai/artifact/DadqcLNM1DkT7BNjAsFe4T

§4–§6 are what was found, in the live sources and in the platform's code. The
rest is the proposal.

---

## 0. Decisions

| # | Question | Decision |
| --- | --- | --- |
| D1 | Where does it live? | **Outside core.** An extension, plus country-neutral platform seams it plugs into (§7) |
| D2 | Where is it in the UI? | **One row under Site**: *Règles d'urbanisme (PLU)*. Everything it shows is in **Properties** when that row or one of its children is selected. **Nothing goes in the Inspector**, which stays the developer-facing object panel |
| D3 | Separate PLU perspective (ADR-0024 sketch)? | **No.** The row stays under Site in the existing tree |
| D4 | Name | **"Règles d'urbanisme (PLU)"** for France. The row's name comes from the country's planning source, not from the platform |
| D5 | Enabled automatically by a Docker deployment? | **Yes, in principle**, under §11.1. Needs ADR-0059 revised. A late sprint (096.13) |
| D6 | Where does written-rule extraction run? | **Decided 2026-10-20: option C** — a plugin-side service, with model calls through `ai-service` (§7.3). Phase 2. The owner confirms it before 096.7 starts (platform README §3) |
| D7 | What is a setback measured to? | **The Site boundary** (ADR-0089, Sprint 083.12), which starts as the plot's outline and can be edited. Never a "property boundary" (ADR-0080 Rule 7). The Site Design milestone's 083.12 and 083.13 are pulled forward as prerequisites |
| D8 | Distributed from archisimple-plugins, or bundled in `archisimple/extensions/` like carte-gouv-fr? | **Distributed** (answered 2026-10-19). Bundling was considered and set aside: it would remove D5's trust question, but put France in the platform repository |

---

## 1. Vision

Connect French planning regulations to the geometry of the project being
drawn. The user opens a located project, and its parcels' rules appear under
Site. They confirm the values that matter. The editor then draws the
theoretical envelope and measures the design against it while they work.

The aim is not to display zoning maps. It is to measure the rules that can be
measured, and to say plainly which cannot.

## 2. Objectives and non-goals

**Objectives**

1. Identify the regime (PLU, PLUi, carte communale, RNU) and the document
   version that applies to the project's parcels.
2. Show the zone, prescriptions, easements and risks on the plan.
3. Present the zone's rules with their source, and let the user confirm them.
4. Compute a theoretical envelope from the confirmed rules.
5. Measure the design against the confirmed rules as it changes, including
   emprise au sol and surface de plancher.
6. Answer questions about the plot, with citations.
7. Produce a summary sheet.

**Non-goals**

- Guaranteeing that a project will receive a building permit.
- Automating the interpretation of every French PLU.
- Replacing an architect, surveyor, planning authority or legal professional.
- Treating cadastral boundaries as a boundary survey. The editor measures to
  the **Site boundary**, the user's line (D7).
- Any rule that changes the permit procedure rather than the geometry. ABF
  opinion, PPR zones and protected sites are **flagged**, not computed.

## 3. User stories

### US-01 — Read the plot's rules

As a user with a located project, I want its parcels' planning regime, zone
and document to appear under Site, so that I know what applies before I
design.

- The row appears only when the Site's country profile names a planning
  source. That is ADR-0084 Rule 9's slot, gated as the Trees and Roads rows are
  (Sprints 095.13 DEC-6, 095.16b DEC-3). It also needs at least one parcel.
- It shows the regime, the document, its version and its date, and the zone.
- The written regulation opens in a new browser tab. In phase 1 it opens at its first page; opening at the zone's page needs the PDF read and is phase 2. An in-app PDF pane is out of scope.
  - _Since 002.6a (`fr-urban-rules` 0.5.0, implemented 2026-10-20):_ it opens at the zone's page **only where the deployment runs the companion service** (002.5a, platform 096.8a). Without it, it opens at its first page, as in phase 1, and the overview says reading the written regulation is not available on this deployment.
- "Plan not on the GPU" and "source not answering" are shown as such (§4.4). Neither is ever shown as an absence of rules. The last good read is kept **for the session** only: a saved cache would make every read an undo entry.

### US-02 — See the constraints on the plan

- The zone, prescriptions, easement perimeters, setback bands and envelope are
  plan layers, each with an entry in a **plan legend**. There is no plan legend
  today (G13).
- Each layer can be switched off.
- Selecting a child row (a prescription, a flag) shows its source in Properties.
- Official geometry is drawn differently from derived geometry (envelope,
  bands).

### US-03 — Confirm the rules

As a user, I want to see each rule with its source passage, and confirm or
correct its value, so that nothing limits my design that I have not agreed to.

- Every rule shows its provenance (§5.3), page and quoted passage.
- Confirm, Edit value (which keeps the citation), and Does not apply. Each is a
  **Request**, one undo step on the shared stack (ADR-0022).
- Confirmed values are saved in the project against the document version. A
  new version marks them *to confirm* again.

### US-04 — Theoretical envelope

- Built from confirmed rules only. Properties lists the rules **applied**, the
  rules **not applied**, and the **assumptions**, e.g. "the street side is the
  Site boundary edge facing the road".
- Drawn on the plan (phase 1) and as a translucent volume in 3D (phase 3).
- Labelled as a theoretical envelope, never as "buildable".

### US-05 — Checks while designing

As a user, I want to see, under the PLU row, how each building measures
against the confirmed rules, so that I catch a problem while I can still fix
it.

- Shown in Properties when the *Checks* row is selected, per building, as
  *measured / limit*.
- Selecting a check outlines the offending element on the plan with a
  dimension (G13).
- The tree badge, and a status-bar item (G12), keep the count of potential
  issues in view.
- A check on an unconfirmed rule says so. Rules that cannot be measured are
  listed as *not checked*.
- No verdict says "compliant". The strongest is "no issue among the rules
  checked".

### US-06 — Surfaces

As a user, I want to see my emprise au sol and surface de plancher against
what the PLU allows, and what remains, so that I know how much I can still
build.

- A *Surfaces* row under the PLU. Properties shows:
  - the emprise au sol per building, its total, the allowance (CES × plot
    area) and what remains;
  - the surface de plancher with its deductions;
  - the procedure flags (permit or declaration, architect above 150 m²);
  - the theoretical capacity, labelled an estimate (§5.4).
- An extension or annex cap in m² or % is measured against the existing
  building.
- "Not regulated" is shown as such, and still shows the figures.

### US-07 — Ask questions about the plot

- Answers use the same report the panels show, and the editor's measurements.
- Each claim cites its source. Anything beyond the text is labelled
  *Interpretation*.
- The assistant never reads a number out of the regulation by itself.

### US-08 — Compare variations

- The variation comparison shows, per variation, the number of potential
  issues and how many rules were checked.
- Variations that are parked are measured too. That is why the measures are
  pure functions on a model (§7.1).

### US-09 — Summary sheet

- A PLU summary sheet in Print & PDF. It contains:
  - the plot, document and version, and the flags;
  - a rules table (limit, measured, result, source);
  - the plot plan with the layers;
  - the assumptions, the sources, and the limits of the analysis.
- **This needs a new sheet kind.** Print & PDF produces only plan sheets
  (variation × storey) today. It is an ADR-0077 revision (G6), not a format
  exporter: `SheetExporter` only writes finished pages to a file format.

## 4. What the data gives (probed live, 2026-10-19)

### 4.1 Test plots

| Case | Commune | Parcel / point | What the GPU returns |
| --- | --- | --- | --- |
| City PLUi | Lyon 2e (INSEE 69123, arr. 69382) | `69382000AB0105`, 1185 m² | PLUi Grand Lyon, zone **UCe1b** |
| Small PLU | Gordes (84050) | `84050000AC0323`, 5010 m² | PLU, zone **A**, AC2 site inscrit |
| Carte communale | Mouzay (55364) | commune point | CC, sector `C / Ci`, PPRi Meuse |
| RNU | Brouennes (55083) | `55083000AB0280` | `is_rnu: true`, no document |
| Not on the GPU | Rochefort-en-Terre (56196) | — | `is_rnu: false` **and no document**. Only the AC4 SPR easement comes back |

### 4.2 Sources

None needs a key. All but one route answer a browser (CORS).

| Source | Endpoint | Latency | Gives |
| --- | --- | --- | --- |
| API Carto, GPU | `apicarto.ign.fr/api/gpu/{municipality,document,zone-urba,secteur-cc,prescription-*,info-*,assiette-sup-*,generateur-sup-*}?geom=` | 0.1–0.3 s; 1–2.7 s for `prescription-surf`, `assiette-sup-s` | Regime, document, zone, prescriptions, information, easements |
| API Carto, cadastre | `apicarto.ign.fr/api/cadastre/parcelle?code_insee&code_arr&section&numero` or `?geom=` | 0.2 s | Parcel geometry (EPSG:4326), `idu`, `contenance` |
| GPU API | `geoportail-urbanisme.gouv.fr/api/document?partition=`, `/document/{id}/files`, `/document/{id}/files/{nomfic}` | 0.2 s | Legal status, file list, the regulation PDF (302 → `data.geopf.fr/annexes/gpu/…`) |
| Géoplateforme WFS | `data.geopf.fr/wfs/ows` — `wfs_du:*`, `wfs_sup:*`, `BDTOPO_V3:*` | 0.1–0.3 s | GPU layers by bbox; neighbouring buildings with heights; roads. **Two layers per request at most** (IGN, since 2026-06-15) |
| Geocoding | `data.geopf.fr/geocodage/search`, `reverse?index=parcel` | 0.1–0.6 s | Address → parcel. 50 req/s per IP |
| Géorisques v1 | `georisques.gouv.fr/api/v1/{gaspar/risques,rga,zonage_sismique,radon,gaspar/pprn}` | 0.1–0.5 s | Risks, clay, seismic, radon, PPR zone |
| RNB | `rnb-api.beta.gouv.fr/api/alpha/buildings/plot/{idu}/` | — | Buildings on the plot |

Samples (trimmed):

```json
// zone-urba — Lyon AB0105
{"libelle":"UCe1b","libelong":"Tissu urbain dense a caractere patrimonial…","typezone":"U",
 "nomfic":"200046977_reglement_20260326.pdf","urlfic":"",
 "datvalid":"20260326","idurba":"200046977_PLUI_20260326"}
// prescription-surf — Lyon, one of 13
{"libelle":"Hauteur Max-22","txt":"22","typepsc":"39","stypepsc":"02"}
// assiette-sup-s — Lyon, one of 23
{"suptype":"ac1","typeass":"Périmètre des abords","modegeoass":"Zone tampon",
 "paramcalc":500,"nomass":"AC1_Eglise-Saint-Nizier-ICH6TC_abor"}
// municipality — Brouennes
{"insee":"55083","name":"BROUENNES","is_rnu":true}
```

### 4.3 Pitfalls

- `zone-urba.urlfic` is **empty**. Resolve the regulation as follows:
  `document?partition=…&status=document.production` → `id` →
  `/document/{id}/files/{nomfic}`. Unfiltered, the list is paged at 20,
  oldest first, `offset` is ignored, and Lyon's first page holds only
  deleted versions; match `originalName` with `idurba` case-insensitively
  (`PLUi` vs `PLUI`). (Corrected 2026-10-20 from 002.0 DEC-7.)
- `/document/{id}/details` sends **no CORS header**. Use `/files`.
- `acte-sup` **ignores `geom`** and returns a national page.
- `/document/{id}/download` is the whole package: **3.1 GB for Lyon**.
- Géorisques:
  - `gaspar/risques?code_insee=` needs the **commune** code (69123), not the
    arrondissement (69382).
  - `gaspar/pprn` takes `longitude`/`latitude`. Given `latlon`, it silently
    returns all 6585 PPRs.
  - `zonage_sismique`'s default radius returns neighbouring communes.
  - v2 needs a free token.
- Store `idurba` **and** `datvalid`. Gordes' zone carries `datvalid` 2022 under
  a 2024 `idurba`.
- Licence: Etalab Licence Ouverte 2.0 is confirmed on the geocoding page. It is
  assumed for the others: **check before the summary sheet cites it**.

### 4.4 Regimes the extension must tell apart

| `is_rnu` | Document | State shown |
| --- | --- | --- |
| false | PLU / PLUi | Zone + rules (drawn and written) |
| false | CC | Sector (constructible or not) + coded RNU rules (§5.1) |
| true | — | Coded RNU rules (§5.1), plus L.111-3 |
| false | **none** | **Plan not on the GPU**: easements still shown, no rule invented, hand entry offered |
| ? | ? | **Unknown**: the commune call failed. Named as a failed source, never as RNU |

### 4.5 What is structured and what is prose

| Fact | Structured? |
| --- | --- |
| Parcel, regime, zone, prescription geometry, easements (AC1/AC2/AC4, PM1), risks, neighbouring heights | **Yes** |
| Numbers drawn on the plan: heights (CNIG 39), footprint (38), biotope (42), parking (44) | **Partly.** The value is free text in `libelle` / `txt`, and often empty |
| Setback **lines** (CNIG 15) | Geometry yes, distance usually **no** (`txt: null`) |
| Road alignment | **No.** BD TOPO gives the centreline and carriageway width only |
| Setbacks, footprint ratio, general height, green-space ratio, parking, appearance | **No. Prose in the regulation PDF** |

The CNIG structured regulation standard will not change this soon:

- Level 1 (JSON, March 2026) only splits the text into blocks per zone.
- Level 2 (rules as parameters) is a provisional v0.1.
- The GT DDU minutes of December 2025 say it will be optional, will not replace
  the PDF, and target early 2027.

The PDFs are large (Lyon: 11 MB, 803 pages; zone UCe is pp. 118–158). They have
a text layer and an outline, which is how a zone's chapter is found.

## 5. Rules

### 5.1 RNU and carte communale: coded rules

Code de l'urbanisme, numbering since décret 2015-1783 (in force 2016-01-01).
R.111-15 to R.111-19 and R.111-28 apply where there is no PLU or document
standing in for one, so they also apply under a carte communale (R.111-1).
L.111-3 applies only where there is neither a PLU nor a carte communale.

| Article | Rule | Status | How it is checked |
| --- | --- | --- | --- |
| R.111-15 | A distance of at least 3 m **may be imposed** between non-contiguous buildings on land of the same owner | `to_confirm` (optional for the authority) | Measured when confirmed |
| **R.111-16** | Along a public road: horizontal distance from any point of the building to the nearest point of the **opposite alignment** ≥ the **difference in altitude** between the two points. A required setback line replaces the alignment. Private roads are treated alike | `confirmed` | Measured. The opposite alignment is, in order: an EL7 alignment easement; the cadastral outline of the parcels across the road; the carriageway edge (stricter than the rule). The extension supplies it as a line, and it is always shown as an assumption. Altitudes come from the Site terrain |
| **R.111-17** | Unless the building adjoins the limit: horizontal distance from any point to the nearest point of the limit ≥ **half the difference in altitude**, and **never less than 3 m** | `confirmed` | Measured to every **Site boundary** edge that does not face a road (D7). The RNU makes no side/rear distinction. Projections such as balconies count (CE 1969, *SCI Les Thamaries*) |
| R.111-18 | Limited cases where a permit may be granted despite R.111-17 (e.g. extending an existing building without changing its implantation) | — | Shown as an exception note |
| R.111-19 | Derogations to R.111-15 to R.111-18 by reasoned decision | — | Shown as an exception note |
| R.111-28 | A project may be refused if it is higher than the **average height of neighbouring buildings** in a partly built sector with a unity of appearance | `information` | The extension queries the neighbouring buildings itself and shows their average beside the building's height. Never a verdict |
| L.111-3 | Without a PLU or carte communale, building only in the **built-up parts** of the commune | `not_evaluable` | Its exceptions (L.111-4) are listed, so it never reads as a ban |

**How "measured" works for R.111-16 and R.111-17.** The check takes the minimum, over the building's points, of *distance − k × altitude difference* (k = 1 or ½). Comparing the nearest distance with the highest point gives false issues on a pitched roof. An eaves at 6 m and a ridge at 8.40 m, 4 m from a side edge, raise no issue under R.111-17. The platform's measure returns that minimum (Sprint 096.0b).

**Verification state.** The texts of R.111-16 and R.111-17 are quoted as current
in Assemblée nationale question 16-6653 (asked 2023-03-21, answered
2023-10-31). The numbering and scope of R.111-15 to R.111-19 and R.111-28 are
those of the Cerema RNU sheet (June 2022). Légifrance's consolidated pages were
not reachable by the probe (404). **Sprint 002.1a reads the consolidated text on
Légifrance before encoding**, and records the version date in each coded rule.

### 5.2 PLU and PLUi: drawn and written rules

1. **Drawn.** Numeric prescriptions on the plan (39 height, 38 footprint,
   42 biotope) are parsed from `txt` / `libelle`. The result is `to_confirm`,
   since the parse is a heuristic.
2. **Written** (phase 2). A fixed schema is extracted from the zone's chapter:
   - road setback, boundary setbacks, distance between buildings;
   - footprint ratio;
   - height (façade and total);
   - green-space ratio;
   - parking;
   - extension and annex caps.

   Each value carries its page, the quoted passage, its conditions and
   exceptions, and a confidence. A drawn value overrides a written "see the
   graphic document".
3. **Entered** (phase 1). Any rule can be entered by hand, with its source
   typed in.

**Nothing extracted becomes a constraint until the user confirms it.**

### 5.3 Provenance, status, result

Three separate questions, one vocabulary, used by the document, the report
and the mockups:

- **Provenance:** `coded` (national, written once) | `drawn` (plan
  prescription) | `written` (regulation text) | `entered` (by hand).
- **Status:**
  - `confirmed`: by the user, or by construction for a mandatory coded rule;
  - `to_confirm`;
  - `not_applicable`;
  - `not_evaluable`;
  - `information`: shown beside a measurement, never checked.

  "Verified" is not a status: the hand-checked reference plots (§13) are test expectations.
- **Result of a check:** `no_issue` | `potential_issue` | `not_checked`. The
  proposal never states `compliant`.

### 5.4 Emprise au sol and floor area

These are the figures a PLU user asks for first. They are **budgets, not
places**. A footprint ratio says how much of the plot may be covered, never
where. So they appear as *used / allowed / remaining*, and they do not shape
the envelope.

**The host measures primitives; the extension applies the French definition.**
Surface de plancher and emprise au sol are French law. The provider-knowledge
rule keeps country knowledge out of `apps/` and `packages/`, so the platform
does not compute them. It measures country-neutral quantities on a model
(§7.1):

- per building, the projected outline split by **what projects**:
  - walls on the ground;
  - supported overhangs;
  - unsupported overhangs;
  - balconies;
- per room, floor area measured from the inside face of the walls, split by
  **clear-height band**, with its voids (stairs, shafts) and its use;
- the plot's unbuilt area.

The extension composes the legal figures from these. **The model has no balconies, posts, stairs, shafts, floor openings, room use or parking** (Sprint 096.0a–c). These primitives come back as `notModelled`, and the R.111-22 deductions that depend on them ask the user.

**Emprise au sol**

- **Definition.** R.420-1 is the national definition of the emprise au sol
  (ADR-0088 Rule 5): the vertical projection of the volume, all overhangs
  included, except ornaments, canopies and eaves not supported by posts. It
  governs permit procedures (Livre IV).
- **For a PLU's own rules,** the PLU's lexicon may define it differently. When
  it is silent, case law applies the projection with all overhangs.
- **In the report,** the rule names the definition it uses, and the extension
  chooses which primitives count.
- **Terraces and pools** are where definitions differ most. The model does not
  have pools today.
- **Measured value:** every building on the plot. That means the new ones, the
  kept parts of `Site.existingBuilding`, and annexes.
- **Plot area:** computed by the host from the plot's geometry. The cadastral
  `contenance` is shown beside it only as a value **the extension puts in the
  report**. The host never reads it from the parcel's properties, because the
  provider-knowledge test forbids that field.
- **Wording:** `getBuildingFootprint().projected` stays "an estimate of the
  emprise au sol" (ADR-0088 Rule 5). Until the extension composes a figure
  under a named definition, Properties says "estimate".
- **Pleine terre** caps the emprise in effect. The two are shown together.

**Surface de plancher (R.111-22)**

- **Definition:** closed and covered floor areas, measured from the inside face
  of the façades.
- **Deducted:**
  - areas with a ceiling height ≤ 1.80 m;
  - stair and lift voids;
  - parking;
  - attics that cannot be converted;
  - the other cases the article lists.
- **What it drives:**
  - PLU caps where they exist;
  - the procedure: permit or prior declaration, with the 20 m² threshold
    (40 m² for an extension in a PLU's U zone);
    - an architect is required for an individual building a non-agricultural construction for themselves when its **surface de plancher** exceeds 150 m² (R.431-2 a)); the "both surface de plancher and emprise" wording is R.431-2 b) and c)'s, for agricultural buildings and greenhouses (verified on Légifrance in 002.3, step 1; this line read "unless both … are ≤ 150 m²" until then).

  **Every threshold is verified on Légifrance in 002.3.** Until it is, it shows "to verify" and raises no flag.

  These are procedural flags, shown beside the figure.
- The taxe d'aménagement's *surface taxable* is a different definition, and
  out of scope.

**"m² constructible"**

The loi ALUR (24 March 2014) abolished the COS, so a PLU no longer states a
buildable floor area for the plot. Two things remain:

1. **Explicit caps written in m² or %.** These are common in zones A and N:
   - extensions of existing dwellings, e.g. "≤ 30 % of the existing emprise,
     and ≤ 50 m²";
   - annexes, e.g. "≤ 40 m²".

   L.151-12 requires the PLU to fix their height, emprise and density. STECAL
   sectors also set them. They are rules (`extension_max`, `annex_max`,
   `floor_area_max`), measured on the base the rule names, relative to the
   existing building.
2. **A theoretical capacity, derived.** The formula is:

   > (the smaller of the envelope's ground area and the emprise allowance)
   > × (the storeys the confirmed height allows at the project's
   > floor-to-floor height)

   It is shown as an **estimate** with its assumptions, never as a right. It
   replaces what `urban-rules` computes today from three typed numbers.

## 6. What the platform offers today (verified 2026-10-19)

**Exists**

- **Extensions** (`.aspkg`), evaluated as `data:` URL ES modules in the
  editor's realm (`sourceModuleLoader.ts`). ADR-0059: "not a sandbox".
- **Network:** unrestricted `fetch` (the editor sends no CSP).
- **Translations:** a package can ship them (`resources/i18n/<ns>/<lang>.json`).
  They reach the translator when the package is present at start-up.
- **SDK 1.23:** commands, the `ai` capability (synchronous Skills,
  planning-stage enrichers), `MapFeatureSource`, terrain, vegetation and road
  sources, the `CountryProfile`.
- **ADR-0084 Rule 9:** a reserved *planning rules* slot. `CountryProfile` has
  no member for it yet.
- **The Site** (`SiteDto`): `anchor`, `crs` (EPSG:2154 for France), `country`,
  `parcels[]` with their verbatim properties (`idu`), `terrain`,
  `existingBuilding`.
  - It is project-level, shared by every variation.
  - Context buildings and roads are **not** on the Site. They are fetched per
    session, and roads only when wanted (ADR-0110 Rule 4).
- **Queries:**
  - `getSite`;
  - `getBuildingFootprint` (ground / projected / belowGround; projected is "an
    estimate of the emprise au sol", ADR-0088 Rule 5);
  - `getGroundUnderBuilding`, `getBuildingSections` (a building against the
    ground at its façades' foot), `getBuildingSite`;
  - `getSiteContextBuildings`, `getSiteContextRoads`, `getTerrainElevation`.
- **Seams to extend, not duplicate:**
  - `NavigationManager` aggregates children across providers and has
    `getBadges`.
  - `SiteParcelDetailDto {labelKey, value}` rows are written by an extension and
    rendered by the host.
  - `PropertyGroupContribution` (inspector).
- **Measuring to a boundary is planned elsewhere.** The Site Design milestone
  (paused 2026-09-30) plans **083.12 Site Boundary** (ADR-0089: a second,
  authored polygon on the Site, started from the plot) and **083.13 Setback
  Distances** (projected outline to each boundary edge, as a readout). Its OD-5
  keeps named edges, and so regulation, out of the platform. This proposal is
  where they come in.

**Missing.** An extension cannot:

| # | Gap | For |
| --- | --- | --- |
| G1 | Read the Site: no Site member in the SDK's `services.ts`, no Site event in `events.ts`. (Inside the platform, a token exists, ADR-0080 Rule 3) | Everything. Today `urban-rules` has the plot area typed into Preferences |
| G2 | Add rows to the tree. `useNavigation.ts` registers a fixed provider list; the manager itself would aggregate them | D2 |
| G3 | Supply Properties content for a non-entity row (`SiteNodePropertyEditor.tsx` switches by hand; an extension cannot ship React) | D2 |
| G4 | Contribute a plan layer, or anything in 3D. The plan draws vector roads and trees (095.16b, 095.19), but only the host's own | US-02, US-04 |
| G5 | Give the assistant tools or context. The Tool Broker takes tools only from architectural-intelligence and the host | US-07 |
| G6 | Add a sheet. Print & PDF has plan sheets only; `SheetExporter` is a file-format seam | US-09 |
| G7 | Store data in the project. The project's sections are `ProjectSnapshotMetadata {information, site, share}`. There is no per-package section, no rule for keeping one when its package is absent, and no Request an extension can send for the Site (not an entity, ADR-0080 Rule 3) | US-03 |
| G8 | Add figures to the variation comparison (`ChangeCounts` only) | US-08 |
| G9 | Measure: boundary distances with altitude difference, projection by kind, floor area by clear-height band, unbuilt area. Also **on a parked variation**, which has no Automation API (ADR-0104 Rule 9) | US-04–06, US-08 |
| G10 | Be enabled by the deployment. `/plugins/` is served but never discovered; `/materials/` is | D5 |
| G11 | Get its translations when installed **mid-session** (`InternationalizationService.refresh()` has no caller). To prove with a test first | US-01 |
| G12 | Add a status-bar item (its items are fixed) | US-05 |
| G13 | List a contributed layer in the plan legend (`TerrainLegend`, 081.12, lists the host's), and outline an element with a dimension on request | US-02, US-05 |
| G14 | Have the host call back into the extension from a Properties action (Refresh, Confirm…) | US-01, US-03 |

## 7. Architecture

### 7.1 Platform: the Site Regulations milestone (archisimple)

Country-neutral throughout. Its README in archisimple carries the sprints; the
shape:

- **Boundary first.** 083.12 Site Boundary (ADR-0089) and 083.13 Setback
  Distances, pulled forward from the Site Design milestone with its answers
  OD-4 and OD-5.
  - They give a user-authored line to measure to, and the readout.
  - ADR-0080 Rule 7's wording is revised in place, so a regulation can be
    measured to the Site boundary without the UI calling it a property line.
- **Measures on a model** (ADR-0113). These are pure functions below the
  boundary that take a building model and the Site, so they also work on a parked variation's projection (`printDataOf`, the note under
  ADR-0104 Rule 9).
  - They are exposed as Queries for the open Document (contract minor).
  - They combine heights with terrain, so they go in a package shaped like
    `solar-analysis` (core, geometry, building-form, terrain). They cannot go
    in `building-form`, which may depend only on core, geometry and shared.
  - Existing Queries are reused where they already answer: the footprint and
    the building sections.
- **A Site view for extensions.** SDK 1.24 adds a read-only Site member and a
  site-changed event (G1). It also gives the measures for the open Document
  and for each variation.
- **The `regulations` capability** (ADR-0111):
  - **The extension:** registers a `RegulationSource`, named by
    `CountryProfile.planningSourceIds` (ADR-0084 Rule 9, revised). Given the
    Site view, it returns a declarative `RegulationReport`.
  - **The report:**
    - regime, document and version;
    - zones;
    - features typed by **semantic category**;
    - named boundary edges;
    - rules (§5.3), checks, flags and assumptions;
    - source status.
  - **The host renders it:**
    - through a host `NavigationProvider` adapter, i.e. one more provider on the
      existing manager, with badges (G2);
    - through a declarative Properties renderer modelled on
      `SiteParcelDetailDto` and `PropertyGroupContribution` (G3);
    - with actions that call back into the extension (G14).
  - **Why a new capability** rather than the reserved `properties`: a per-seam
    capability is the terrain and vegetation precedent, and `properties` names
    a surface, not a source.
  - **Acceptance test first, as ADR-0082 Rule 9 did:** a second-country stub
    (one coded rule, no French knowledge) renders with no host change.
  - The provider-knowledge test is extended in the same sprint: `apicarto`,
    `georisques`, `rnb-api`, and the GPU field names (`idurba`, `datvalid`,
    `typezone`, `nomfic`).
- **Package data on the Site** (ADR-0112). An opaque per-package section,
  changed only by Requests (one undo each).
  - **The silent-loss case:** the same build opened **without the
    extension**. The section is kept and saved again untouched. A test proves
    it.
  - **File version:** the section folds into 24 if 24 is still unreleased
    when the sprint lands, and otherwise goes to 25. Either way it moves in
    lockstep with the share-service viewer image.
  - **Confirmations** carry the time, not a user: the app has no user.
- **Plan layers and legend** (G4, G13): features drawn by category with theme
  tokens. There is a plan legend, and a check selected in Properties outlines
  its element with a dimension.
- **The status-bar count** (G12).
- **Later sprints**, each with its own ADR revision:
  - 3D envelope;
  - the PLU sheet (ADR-0077: a non-plan sheet kind);
  - variation figures (ADR-0104);
  - assistant tools (G5);
  - deployment-pinned plugins (ADR-0059, D5);
  - a structured-output route on `ai-service` (D6).
- **The Client Viewer** (ADR-0105) shows none of this in this milestone.
  Whether a publication carries the PLU sheet is decided with the sheet.

**Lockstep.** Once the package declares `regulations`, an older web image
refuses the whole manifest (`unknown-capability`). The package declares
`sdkVersion` 1.27 through Phase 1 (002.0–002.4), then 1.28 (002.6a–b), 1.30
(002.7), 1.32 (002.8, kept by 002.9) and 1.33 (002.11, kept by 002.10) — §15.1's ledger — and
the plugins image and the web image ship together at each step.

### 7.2 Extension: `fr-urban-rules` (archisimple-plugins)

- **Id:** `com.archisimple.fr-urban-rules`, in the repository's reverse-DNS
  convention.
- **Replaces `com.archisimple.urban-rules`.** That package's three
  preferences (`plotAreaSquareMetres`, `siteCoverageRatio`, `maxStoreys`) are
  dropped, not migrated: the plot area now comes from the Site, and the other
  two from confirmed rules.
- **Plain ESM, as the repository requires:** no bundler, tokens by name,
  translations under `resources/i18n/`.
- **On Site change:**
  - Call the commune, document, zone and sector endpoints, then prescriptions,
    easements, information and Géorisques in parallel.
  - Each section fills as its source answers; a slow source never blocks the
    others. Expect about 3 s in total.
- **What it computes:**
  - maps CNIG codes and easement types to semantic categories;
  - names the Site boundary's edges as street, side or rear (from the roads);
  - encodes §5.1;
  - parses drawn prescriptions;
  - composes emprise au sol and surface de plancher from the host's primitives
    (§5.4).
- **The programme warning** moves here from `urban-rules`, and reads
  confirmed rules.
- **Caching:** responses are cached per `idurba` and parcel set.

### 7.3 Written-rule extraction: where it runs (D6, phase 2)

| Option | For | Against |
| --- | --- | --- |
| **A. In the browser** (the host already ships `pdfjs-dist` for PDF underlays, so a host "document text" service could expose it) | No new server | Downloads 11 MB and reads 800 pages per plot, per user. No shared cache. The slowest option |
| **B. A new `ai-service` route** ("extract this schema from this document") | Keys and model routing stay where ADR-0026 puts them. No new container | `ai-service` would fetch, slice and cache French PDFs, which is country knowledge in a platform deployable |
| **C. `fr-urban-rules-service` in the plugins image**: fetches, caches by `idurba`, finds the zone's chapter, and asks `ai-service` for a schema-constrained extraction | France stays in the plugins repository. One extraction per document version serves every user of the deployment | One more deployable to run and secure. It needs a generic structured-output route on `ai-service` (country-neutral) |
| **D. Offline batch** per commune, served as data | Instant | National scale. That is phase 4 |

**Recommendation: C**, with a small generic structured-output route on
`ai-service`.

## 8. Data model

Aligned to the report the host reads. Only what the user decided is persisted.

- **`RegulationReport`** (derived; never persisted). Contains:
  - `regime`;
  - `document {id, idurba, datvalid, type, status, files}`;
  - `zones[]`;
  - `features[] {category, geometry, label, source}`;
  - `edges[] {boundaryEdgeId, role: street|side|rear, source}`;
  - `rules[]`, `checks[]`, `flags[]`, `assumptions[]`;
  - `sources[] {name, status, retrievedAt}`.
- **`PlanningRule`:**
  - `id`, `zone`;
  - `kind`: one of `road_setback`, `boundary_setback`, `building_distance`,
    `footprint_ratio`, `floor_area_max`, `extension_max`, `annex_max`,
    `height_total`, `height_facade`, `green_ratio`, `parking`, `other`;
  - `limit`, one of:
    - `{kind: 'value', value, unit}`;
    - `{kind: 'ratio', value, base}`;
    - `{kind: 'height_relative', factor, minimum?}`. This form expresses
      R.111-16 (`factor 1`) and R.111-17 (`factor 0.5, minimum 3 m`);
  - `base` where it applies (`emprise` | `surface_de_plancher` |
    `existing_emprise` | `plot_area`), and the `definition` the PLU's lexicon
    imposes;
  - `provenance`, `status` (§5.3);
  - `source {document, page, article, passage}`;
  - `conditions`, `exceptions`, `confidence`.
- **`ApprovalFlag`:** `kind` (`abf`, `ppr`, `site`, `world_heritage`, …),
  `label`, `source`.
- **Persisted** (the package's Site section, ADR-0112):
  - `confirmations[] {ruleKey, decision: confirmed | not_applicable, idurba, datvalid, value, at, edited}`, where `datvalid` is the **zone's or prescription's own**, not the document's (Gordes);
  - entered rules.

  A confirmation whose `idurba` / `datvalid` no longer matches reopens its
  rule.
- **`ComplianceCheck`** (derived, per Document; never persisted): `rule`,
  `object`, `measured`, `limit`, `result`, `assumptions`.

## 9. UI

All in the existing editor. No new screen, and **no use of the Inspector**
(D2). The mockups show each screen.

- **Tree.** Site → *Règles d'urbanisme (PLU)*, beside Terrain, the plot,
  Buildings, Trees, Roads, Sun, Existing building and Light structures. Its
  children:
  - the zone;
  - Rules (badge: *n to confirm*);
  - Checks (badge: *n potential issues*);
  - Surfaces;
  - Prescriptions;
  - Easements and risks;
  - Envelope.
- **Properties.** Every selection above, and nothing else:
  - the overview (zone, version, completeness meter, flags, sources);
  - rule review (quote, Confirm / Edit / Does not apply);
  - checks per building;
  - surfaces;
  - the envelope's applied rules, rules not applied, and assumptions.
- **Plan.** The layers with a legend. A selected check outlines its element
  with a dimension.
- **Status bar.** The count of potential issues.
- **Later** (phase 3):
  - the 3D envelope;
  - the AI dock, answering with citations;
  - the variation comparison, with counts;
  - the PLU sheet.
- **Preferences → Plugins → Installed plugins.** The package card lists the
  hosts it contacts and the surfaces it adds.

## 10. Quality and legal

- **Freshness:** record retrieval and document dates. Never mix document
  versions. A new version reopens confirmations.
- **Explainability:** every result names its rule, source, measured element and
  assumptions, and says whether it is conclusive.
- **Reliability:** validate geometry and the CRS. API Carto speaks EPSG:4326 and the Site Lambert-93; **the host converts** (096.1), the extension never carries the formula. A failed source is named. A missing rule is never
  read as permission.
- **Precision:** emprise au sol, surface de plancher and capacity keep the
  "estimate" language until composed under a named definition (ADR-0088
  Rule 5).
- **Scope:** an aid to design, not an administrative decision. The summary
  sheet carries this sentence.

## 11. Security

### 11.1 A deployment that trusts its own plugins (D5, Sprint 096.13)

An extension runs as an ES module **in the editor's realm** (ADR-0059: "not a
sandbox"). It can:

- read browser storage, autosave included;
- call any same-origin route, including `ai-service`, on the user's
  credentials. The shipped deployment puts it behind Caddy `basic_auth`, so the
  model-cost exposure is per authenticated user;
- reach `share-service`, whose managing routes also need the `X-Share-Key`
  carried in the project file;
- write entities through `document.transact`, if it declares `document`.

Trusting a plugin automatically moves the risk from "a user clicked Allow" to
"**whoever can change what `/plugins/` serves**". That is the plugins
repository, its CI tokens, the image registry and the `PLUGINS_UPSTREAM` proxy
target.

**Conditions:**

1. **Pin, don't discover.** The web image is built with an allow-list of
   package id + version + **sha256**, and auto-enables only a match.
   - The hashes in `index.json` do not protect anything on their own, because
     they come from the same server.
   - `Dockerfile.web` copies only `archisimple` and `architectural-intelligence`
     today. The allow-list comes in as a build argument or a copied file.
   - `.aspkg` bytes are deterministic, so the hashes are stable.
   - `discoveredRepository.ts` argues that same origin is enough for
     `/materials/`. Materials carry no code; the ADR-0059 revision says why
     code differs.
2. **Same origin only.** Never a third-party URL.
3. **Updates are deployments.** `docker.yml` already rebuilds on a
   `plugins-updated` dispatch.
4. **Visible and reversible.** The package card says "From this deployment",
   lists what it contacts and adds, and can be switched off.
5. **Supply chain.** Branch protection on archisimple-plugins, a scoped
   read-only token for the image build, and images pinned by digest.
6. **The editor's first network policy, later.**
   - The manifest declares its hosts. A CSP `connect-src` could be built from
     them; the share-service viewer already sends `connect-src 'self'`.
   - An editor CSP must still allow `script-src data:` for extensions, which
     weakens it. It is its own decision.

Fixed in place when D5 lands: `docker-compose.yml`'s "Not discovered
automatically" comment, and ADR-0059 Rules 2–4.

### 11.2 This package's own risks

- **Data leaving the browser:** the parcel geometry and the commune code go to
  IGN, the GPU and Géorisques, which are public bodies. The package card says
  so.
- **Prompt injection through the regulation text** (phase 2).
  - Extraction output is schema-constrained.
  - A value never becomes a Request without a person's confirmation.
  - The assistant treats regulation text as quoted data, never as
    instructions.
- **The extraction service** (option C):
  - fetches only from `geoportail-urbanisme.gouv.fr` and `data.geopf.fr`, which
    prevents SSRF;
  - caps document and cache size;
  - rate-limits per client;
  - holds no model key, since its calls go through `ai-service`.

## 12. Roadmap and sprints

| Phase | Where | Sprints | Delivers |
| --- | --- | --- | --- |
| **0 — Platform** | archisimple, `docs/milestones/site-regulations/` | 083.12, 083.13, 096.0a–096.6 (all implemented; 096.6 walked 2026-10-20, awaiting the owner's look) | Boundary and setbacks, measures, Site view, `regulations` seam, tree and Properties, package data, plan layers, status bar, acceptance with a second-country stub |
| **1 — Read the plot** | archisimple-plugins, `docs/sprints/` | 002.0–002.4 (all implemented; 002.4 walked 2026-10-20 with 096.6, awaiting the owner's look) | US-01–US-03, US-05, US-06 for RNU, CC, drawn and entered rules, surfaces; US-04 on the plan only. `urban-rules` retired |
| **2 — Written rules** | both + service | 096.7 Structured Output Route, 096.8a Plugin Service Deployment, 096.8b Regulation Source Signal; 002.5a Service Gateway and Document Text, 002.5b Extraction Jobs, 002.6a Zone Page Link, 002.6b Written Rules Confirmation (drafted, reconciled, reviewed and split 2026-10-20) | US-01's zone page (002.6a, on 002.5a + 096.8a alone), US-03 extraction (D6, option C; 002.5b + 002.6b). **All implemented and walked 2026-10-20, awaiting the owner's look** (below) |
| **3 — Design-time** | both | 096.9 Envelope in 3D, 096.10 Regulation Sheet, 096.11 Variation Figures, 096.12 Assistant Regulation Tools, 096.13 Deployment-Pinned Plugins, 096.14 Design-Time Acceptance; 002.7 Envelope and Sheet Content (**implemented, walked and independently reviewed 2026-10-21 with 096.9 and 096.10, uncommitted**), 002.8 Assistant Plot Questions (**implemented, walked and reviewed 2026-10-21 with 096.11 and 096.12, uncommitted**), 002.9 Design-Time Acceptance FR (**locally walked 2026-10-21 with 096.14, uncommitted; owner steps pending** — expected values written, recorder `--acceptance` / `--no-model`, replay checks, 0.8.1) | 3D envelope, PLU sheet, variation figures, assistant tools, deployment trust |
| **After 3 — Snapshot** | both | 096.17 Site Package Cache (platform, ADR-0115) and 002.11 Planning Snapshot (**drafted 2026-10-21**, owner-approved) | The reading and the written rules saved in the project: shown at open « read on <date> », re-read in the background, what changed said; offline, the snapshot stands. `fr-urban-rules` 0.9.0, SDK 1.33 |
| **4 — Scale** | service | 002.10 Regulation Watch (drafted and reconciled) | Change detection, Géorisques v2 token, national coverage measured (a national cache stays a later decision) |

**Phase 2 status (2026-10-20, uncommitted, awaiting the owner's look).**
Implemented: 002.5a–002.5b (`services/gateway`, `fr-urban-rules-service`
0.2.0), 002.6a–002.6b (`fr-urban-rules` 0.6.0), with the platform's 096.7,
096.8a and 096.8b. Walked in the editor by the Phase 2 integration pass (the
platform's `tools/e2e` project `regulations-phase2`; pictures in its
`test-results/regulations/phase2/`): on Lyon AB0105 the zone link opens the
règlement at p. 121; « Read the written rules » shows queued → part 1…9 of 9
(live, LM Studio `qwen/qwen3-vl-8b`, ≈ 3 min) → 17 rules of UCe1b to confirm
with their passages; the 4 m side-and-rear setback (p. 126) confirmed is
checked and counted, undone, redone, saved and reloaded; with the gateway
stopped the confirmation stands and is checked from its stored citation, and
the « not available on this deployment » notice shows. Fixed on the way: a
written ratio's base read « of of the plot area » (CHANGELOG 0.6.0). Open:
the OpenAI live keyword check, the production model choice (the 8 B model
lists many low-value parking candidates), Firefox and Docker walks. The
platform's milestone README §9 has the detail.

## 13. First milestone (phases 0–1): definition of done

_Walked 2026-10-20 by 002.4 jointly with the platform's 096.6, by the
acceptance agent; **the owner has not looked**. Evidence in brackets: the
tests, and the walk's files under the platform's
`tools/e2e/test-results/regulations/walk/`._

- [x] A located French project shows *Règles d'urbanisme (PLU)* under Site.
      All its content is in Properties. [walk: `<plot>-<theme>.txt` "## tree",
      the Inspector text asserted empty of it; 096.6 criterion 1]
- [x] Regime, document, version and zone are shown with attribution. The regulation opens in a new tab.
      [`acceptance.test.mjs` P1; walk: Lyon overview, the link to
      `200046977_reglement_20260326.pdf` — its first page; the zone's page is phase 2]
- [x] The four regimes of §4.4 are told apart, including "not on the GPU".
      [`acceptance.test.mjs` P1 `plui`, P2 `plu`, P3 `cc`, P4 `rnu`, P5 `not_published`]
- [x] RNU R.111-16 and R.111-17 are checked against the Site boundary, with
      their assumptions. The text was verified on Légifrance first.
      [P3, P4 tests; walk: Brouennes "Distance to the Site boundary (R.111-17)
      2 500 mm / ≥ 4 469 mm"; 002.1a's outcome for Légifrance]
- [x] Drawn height prescriptions become *to confirm* rules. Rules can be
      entered by hand. [P1 test (« Hauteur Max-22 » to confirm, then confirmed),
      P5 test (a 10 m height entered); walk Lyon, Rochefort]
- [ ] The *Surfaces* row shows emprise au sol (used / allowed / remaining) and
      surface de plancher with deductions and procedure flags. The definition
      used is named. [Emprise, definition, budget, surface de plancher and
      flags shown on Lyon, Mouzay, Brouennes, Rochefort (walk); **not met on
      Gordes**: the floor areas are refused for the imported house (platform
      096.6c), so its surface de plancher and procedure flags are "not
      computed" — a `todo` test]
- [x] Zone, prescriptions, easement perimeters, setback bands and envelope are
      plan layers with a legend. [walk pictures, both themes; envelope not
      drawn on these concave boundaries, said as an assumption; the readability
      defect on Lyon is the platform's 096.6a]
- [x] A failed source is named, and the session's last good read is kept with its date.
      [walk: Rochefort, API Carto refused — "5 sources did not answer", each
      with "Retrieved … shown as read at 11:37", Try again]
- [x] Confirmations are Requests with undo. They survive save and reload, and
      survive opening in a build without the extension. They reopen on a new
      document version. [walk: Lyon undo/redo, save and reload, the edited
      `datvalid` reopening three rules; Brouennes uninstalled and disabled,
      the section byte-identical; history labels in the saved files]
- [x] A second-country stub renders with no host change. [platform
      `stubCountryEndToEnd.test.tsx`, its grep]
- [ ] Hand-checked against Lyon AB0105, Gordes AC0323, Brouennes AB0280, and a parcel picked in Mouzay and in Rochefort-en-Terre (002.4 step 1).
      [**Not met as written**: checked by the agent against the raw services,
      not by a person against the GPU's viewer; and Brouennes moved to
      AB0291, Mouzay is AB0415, Rochefort AB0149 — 002.4's Expected values say
      why]
- [x] `pnpm depcruise` passes, and the provider-knowledge test, extended to
      the GPU, API Carto and Géorisques names, passes. [096.6 gates: both
      `depcruise` green; the provider-knowledge test fails only on the known
      `sheet-writer` `'BT'`/`'ET'` pair]

## 14. Review of v2 (2026-10-19)

An independent review read v2 against archisimple `1e6cac25`. Corrections
folded into v2.1:

- **G7 was wrong.** `ProjectContainerExtras` holds publication extras. The
  silent-loss case is a build without the extension; Requests are needed for
  the writes; there is no user to record.
- **Setbacks collided** with ADR-0080 Rule 7 and with the paused 083.12 and
  083.13. That became D7.
- **Parked variations have no Automation API.** The measures became functions
  on a model.
- **G11 narrowed.** Packages already ship translations.
- **G2 and G3 have seams** to extend.
- **Context buildings and roads are not on the Site.**
- **Missing gaps added:** G12 status bar, G13 legend and outline, G14 actions.
  An in-app PDF pane was dropped.
- **Status vocabulary unified.** The mockups' "To review" became `to_confirm`,
  and `information` was added. R.111-16 and R.111-17 need a `height_relative`
  limit.
- **Print** needs a non-plan sheet kind.
- **Security corrected:**
  - the share-service already sends a CSP;
  - `ai-service` sits behind `basic_auth`;
  - `Dockerfile.web` has no plugins checkout.
- **Provider-knowledge test:** it must be extended, and `contenance` is
  forbidden to the host.
- **Lockstep** of the web and plugins images.
- **Package id:** reverse-DNS.
- **R.420-1 wording** reconciled with ADR-0088.
- **Bundling** recorded as D8.
- **US ids** renumbered.
- **Next numbers:** ADR-0111 and sprint 096.0 (since split into 096.0a–c). ADR-0089 and ADR-0090 are
  reserved.

The plugins repository's `CLAUDE.md` capability table is stale: SDK 1.1, and
`map-features`, `terrain`, `country-profile` and `vegetation` missing. Sprint
002.0 corrects it.

## 15. What drafting the sprints found (v2.2)

Folded in above:

- **Phase 1:** the regulation opens at its first page.
- **Cache:** the last good read is kept for the session only.
- **Regimes:** a fifth state, *unknown*.
- **CRS:** the host converts coordinates.
- **R.111-16:** the opposite alignment's three fallbacks.
- **R.111-17:** no side/rear distinction under the RNU.
- **Measuring:** the minimum, over the building's points, of *d − k·Δz*.
- **L.111-3:** its exceptions are listed.
- **R.111-28:** the extension reads the neighbouring buildings itself.
- **Confirmations:** they carry a decision and the zone's own `datvalid`.
- **Architect rule:** both surfaces must be ≤ 150 m², and every threshold is
  verified first.
- **Model gaps:** the primitives the model lacks.
- **Statuses:** "verified" is a test expectation, not a status.
- **Reference plots:** Mouzay and Rochefort need parcels picked.
- **G4 and G13:** reworded.

The platform's ledger:

| | Contract | SDK | File version |
| --- | --- | --- | --- |
| 083.12 | 3.17.0 | — | **25**, since 24 has shipped |
| 083.13 | 3.18.0 | — | — |
| 096.0a–c | 3.19.0 | — | — |
| 096.1 | — | 1.24 | — |
| 096.2 | — | 1.25 | — |
| 096.3a–b | — | 1.26 | — |
| 096.4 | 3.20.0 | 1.27 | 25, or 26 if `main` was pushed after 083.12 |

So the package declares `sdkVersion` 1.27 through Phase 1.

### 15.1 What drafting phases 2–4 found (2026-10-19)

Recorded here rather than rewritten in §4–§11:

- **Lyon's zone chapter (§4.5).** The PDF's outline gives **UCe1 at PDF
  pp. 121–144** (« Zone UCe1 » p. 121, « Zone UCe2 » p. 145); UCe1b is a
  sector inside it. Printed page numbers are the PDF's **minus 2** (printed
  120 on PDF 122). "Zone UCe is pp. 118–158" and the brief's "articles at
  pp. 131–140" are not borne out (002.5's probe, now in 002.5a).
- **Gordes has no PDF outline (§4.5).** Its chapter is found from the
  contents page (PDF p. 2: zone A printed 43–50, PDF 44–51; offset 1). "They
  have … an outline" holds for Lyon only.
- **The document in force (§4.2, §4.3).** `api/document?partition=` is paged
  at 20 entries, oldest first, and ignores `offset`; for Lyon all 20 are
  deleted versions. Add `&status=document.production`. `idurba` is compared
  case-insensitively (`PLUi` in the document API, `PLUI` in `zone-urba`).
- **The PDF host sends no `Content-Length`** (a size cap is counted while
  streaming).
- **Option C (§7.3)** runs in a `plugin-services` container of its own,
  built from this repository's `services/`, beside the plugins image, not in
  it (ADR-0114); it is reached at `/plugins-api/com.archisimple.fr-urban-rules/`.
  The extraction is schema-**validated** and each value's passage checked
  verbatim (096.7).
- **Façade-relative rules and statements (§8).** `height_relative` gains a
  `reference` (`facade_height`) and an `offset`, and a rule a `statement`
  (`not_regulated`, `see_graphic`, `described`), in 096.2.
- **The package card (§9, §11.1 condition 4)** lists the hosts the browser
  contacts (`network.hosts`, 096.13); the companion is "this deployment's
  service", so `data.geopf.fr` is not among the package's hosts.
- **The regulation watch (§12 Phase 4)** tells the user sooner and keeps
  the service's cache current; confirmations still reopen at read time (§8).

The platform's ledger, phases 2–3:

| | ai-service contract | SDK | Automation contract | File version |
| --- | --- | --- | --- | --- |
| 096.7 | 1.2.0 (`structured-output`) | — | — | — |
| 096.8a–b | — | 1.28 | — | — |
| 096.9 | — | 1.29 | — | — |
| 096.10 | — | 1.30 | — | — |
| 096.11 | — | 1.31 | — | — |
| 096.12 | — | 1.32 | — (the `expected` precondition is in 096.4's 3.20.0) | — |
| 096.13 | — | — | — | — |

So the package declares `sdkVersion` 1.28 at 002.6a–b (0.5.0 and 0.6.0, restated from 0.4.0 by the Phase 2 review, 2026-10-20; the later numbers below await the same restatement), 1.30 at 002.7
(0.7.0, after 0.6.1; restated at its review, 2026-10-20) and 1.32 at 002.8 (0.8.0, restated 2026-10-20 from 1.3.0); 002.9 is 0.8.1 (a patch for three defects, 2026-10-21) 002.11 (0.9.0, drafted 2026-10-21) declares 1.33 with the platform's 096.17, and 002.10 (0.10.0, renumbered 2026-10-21 from 0.9.0, itself restated from 1.4.0) keeps 1.33. The
companion service starts at 0.1.0 (002.5a) and is 0.2.0 after 002.5b. §7.1's lockstep paragraph says
the same (it read "1.24 or later" until this reconciliation).
