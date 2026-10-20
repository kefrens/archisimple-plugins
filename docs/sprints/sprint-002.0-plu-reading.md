# Sprint 002.0 — PLU Reading

> **Status:** **Implemented, uncommitted (2026-10-20)** — `fr-urban-rules` 0.1.0
> landed; 48 tests green on recorded fixtures; the editor walk (step 9,
> criterion 13) is **not done**. See [Outcome](#outcome-2026-10-20).
>
> **Version:** 1.1 (review 2026-10-20)
>
> **Repository:** `archisimple-plugins` · new package `fr-urban-rules`
> (`com.archisimple.fr-urban-rules`) → **0.1.0**
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> (the proposal, v2.1) § 12 Phase 1, the first of six sprints (002.0, 002.1a, 002.1b, 002.2–002.4).
> US-01 and US-02's data; nothing measured yet.
>
> **Prerequisites (platform, archisimple):** 096.1 (SDK 1.24: Site view,
> site-changed event, Site CRS ↔ WGS84 conversion), 096.2 (SDK 1.25: the
> `regulations` capability, `RegulationSource`, `RegulationReport`,
> `CountryProfile.planningSourceIds`), 096.3a–b (SDK 1.26: the host's tree row
> and declarative Properties renderer (096.3a), with actions (096.3b)). The platform README's
> dependency line says the same: "the FR extension's 002.0 needs 096.3a's views" (and 096.3b's Refresh). The
> package declares SDK **1.27** (096.4's `SitePackageDataService`) from its
> first version, so it is walked against a build carrying 096.4.
>
> **Related:** platform ADR-0111 (Site Regulations), ADR-0084 Rule 9 (the
> planning slot), ADR-0083 Rule 7 (a refusal is a value, never a truncation),
> ADR-0080 Rule 7 (a cadastral parcel is not a legal limit).
>
> **Sizes:** a new package (manifest, one entry file, two locales, tests with
> recorded fixtures). No platform change. Large: six sources, four regimes.

> **Second series in this repository.** 001.x was `sh3f-importer`; 002.x is
> `fr-urban-rules`. Numbering stays this repository's own (platform ADR-0030).

---

# Sprint Design Contract

Verified against `fr-urban-rules/src/index.js` on 2026-10-20.

- [x] **The extension knows France; the host does not.** Every endpoint,
      field name (`idurba`, `datvalid`, `typezone`, `nomfic`, `typepsc`,
      `suptype`…) and code table lives in `fr-urban-rules/src/index.js`. What
      crosses into the host is the SDK's `RegulationReport`, typed by
      semantic category.
      _Held: the report carries only SDK categories (`zone`, `prescription`,
      `information`, `easement`, `risk`, `alignment`), translation keys and
      verbatim `{ text, lang: 'fr' }` phrases; every recorded report passes the
      platform's own `checkedReport` with 0 dropped (scratch check, below)._
- [x] **No absence of data reads as an absence of rules.** "Plan not on the
      GPU" and "source not answering" are states of their own (proposal § 4.4,
      US-01), never an empty rules list.
      _Held: `resolveRegime` gives `not_published` only for a commune that
      answered `is_rnu: false` with no document; a failed `municipality` — or a
      failed `document` with no earlier answer — is `unknown` with its error
      notice; an empty view says "none on the plot" and a failed one "the source
      did not answer" (`stateNotice`)._
- [x] **A refusal is a value.** A failing source is named in `sources[]` with
      its status; the others still fill. Nothing is truncated: a paged answer
      that says it holds more than it returned is a failed read.
      _Held: `fetchJson` never throws for a source's own failure;
      `featureCollection` fails a total past the features; `gaspar/pprn` and
      `gaspar/risques` check their own paging. The one throw is an aborted read._
- [x] **Nothing is written to the project.** This sprint persists nothing:
      no package data, no Request, no history entry. Reads only.
      _Held: no `document` capability, no `site-package-data` token, no
      `transact`/`write` in the source (test "nothing is written")._
- [x] **One file, no import.** `src/index.js` is evaluated from a `data:` URL
      (`apps/web/src/resources/sourceModuleLoader.ts`): no bare specifier and
      no relative import either, since a `data:` URL has no base to resolve
      one against.
      _Held: test "one file, no import" (no `import`, `import(`, `require(`)._
- [x] **No second projection.** Lambert-93 ↔ WGS84 is the host's
      (`packages/geometry/src/crs/lambert-93.ts`), reached through the Site
      view. No copy of the formula in this package (DEC-3).
      _Held: every conversion is `toGeographicRing` / `fromGeographicRing` on
      the `site` service; the test Site service answers only from the
      platform's recorded conversions and throws otherwise (criterion 9); a test
      asserts no Lambert constant is in the source._

---

# Outcome (2026-10-20)

> **Walked in acceptance** (2026-10-20) by Sprint 002.4 jointly with the platform's 096.6, on five reference plots in the editor — see 002.4's Outcome; the owner has not looked yet.

`fr-urban-rules` 0.1.0 is in the tree, **uncommitted**:

```text
fr-urban-rules/
  package.json                    SDK 1.27, capabilities ["regulations"], resources ["i18n"]
  src/index.js                    the whole extension (createReader + activate)
  resources/i18n/fr-urban-rules/{en,fr}.json   137 keys each
  scripts/capture.mjs             records the fixtures and the platform's conversions (by hand)
  tests/helpers.mjs               fixture naming, recorded fetch, recorded Site service
  tests/package.test.mjs          manifest, contract, translations, tables, URL builders
  tests/reading.test.mjs          the readers on the five plots
  ../test-fixtures/fr-urban-rules/<plot>/   recorded 2026-10-20, each answer beside its .meta.json
                                  (moved out of the package by the review, below)
  README.md
```

**Gates.** `node --test fr-urban-rules/tests/*.test.mjs` — **48 pass, 0 fail**;
`urban-rules` 10 pass, `sh3f-importer` 99 pass, unchanged.
`archisimple package validate ./fr-urban-rules` exits 0 against the local
platform build (SDK 1.27). `node tools/build-index.mjs --cli
../archisimple/tools/cli/dist/archisimple.js --out <scratch>` builds three
packages, and `node tools/check-index.mjs --platform ../archisimple --index
<scratch>/index.json` accepts 3 of 3. As a further check, outside the suite, each
plot's final report and every progress report were passed through the
platform's built `checkedReport` (`packages/extension-host/dist`): **0 dropped,
0 refused**, for all five plots.

**The five plots, as read:**

| Plot | Regime | Features | Points sent (raw) |
| --- | --- | --- | --- |
| Lyon 2e AB0105 | `plui`, `200046977_PLUI_20260326`, zone UCe1b | 43 | 13,231 (28,448) |
| Gordes AC0323 | `plu`, `84050_PLU_20241017`, zone A, AC2 | 634 | 8,217 (11,847) |
| Brouennes AB0280 | `rnu` | 0 | 0 |
| Mouzay AB0346 | `cc`, sector « C / Ci » (`typesect` 01) | 1 | 183 |
| Rochefort-en-Terre AB0235 | `not_published`, AC4 | 1 | 405 |

DEC-14's simplification at 0.2 m halves Lyon; no recorded plot comes near the
5,000-point feature or 80,000-point report thresholds.

## What step 2's probe found (2026-10-20)

- **API Carto `document`** answers `id` / `gpu_doc_id`, `partition`, `name`
  (the GPU's spelling: `200046977_PLUi_20260326`), `du_type`, `grid_title`,
  `gpu_status` — **no `typedoc`, `datappro`, `etat` or `idurba`**. So
  `document.validFrom` is the date in the `idurba` (CNIG: `<code>_<TYPE>_<date
  of approval>`), or the sector's `datappro` for a carte communale, whose
  `secteur-cc.idurba` is `null` (Mouzay); `document.version` is the zone's
  `idurba`, else the document's `name`.
- **`municipality`** answers a PLM plot twice — the commune (69123) and the
  arrondissement (69382). The commune is the one read.
- **Paging totals**: `totalFeatures` and `numberMatched`, both present.
- **POST** with a JSON body `{ "geom": … }` is accepted, CORS preflight
  included: past 6,000 encoded characters the reader POSTs, and the query-side
  Douglas–Peucker fallback of DEC-4 was not needed and not written.
- **Parcellaire Express gives the commune**: Lyon AB0105's `code_insee` is
  `69123`, its `idu` `69382000AB0105`. DEC-4's "the arrondissement in both" is
  half wrong; the PLM table is applied either way.
- **Géorisques and the arrondissement**: `gaspar/risques` and
  `zonage_sismique` answer the commune only (69382 is empty) — DEC-4 holds.
  **`radon` is the reverse**: 69123 is empty, 69382 answers class 1. See
  deviation 2.
- **`rga`** takes `latlon=<lon>,<lat>`; where nothing is mapped it answers
  **an empty 200 body** (Rochefort), read as "nothing mapped".
- **`gaspar/pprn`** answers `{ totalElements, pageSize: 10, content }`.
- **`/files`** answers `[{ name, title, path }]`, with CORS. The filtered
  document list answered the single entry in force; the unfiltered first page
  (recorded) holds none matching.
- **Lyon's prescriptions**: **14** surface prescriptions on 2026-10-20 (13 in
  the milestone's probe of 10-19); criterion 3's test asserts the recorded 14.

## Deviations from the text (the SDK or the data won)

1. **`node --test fr-urban-rules/tests/`** fails on Node 24: positional
   arguments are globs, and a directory is "module not found". The gate is
   `node --test fr-urban-rules/tests/*.test.mjs` (README and this repository's
   docs say so).
2. **Radon asks the arrondissement when the commune is empty.** DEC-4 says the
   commune code "applies either way"; applied blindly it reads Lyon as "no
   radon class" — an absence read as an absence. The commune is asked first;
   only an empty answer for a PLM plot asks the arrondissement. Owner question 1.
3. **Document title** is the GPU's `grid_title` ("PLUI GRAND LYON LA
   METROPOLE"), prefixed by the type when it lacks it ("CC MOUZAY"), rather than
   `typedoc` + commune name: there is no `typedoc`, and for a PLUi the commune
   name is the wrong territory.
4. **A failed `document` read is `unknown`** (DEC-8's table names only
   `municipality`): with no document answer, `plu` and `not_published` cannot be
   told apart.
5. **Holes are dropped**: a feature's `rings` have no hole semantics in the SDK,
   so only outer rings are sent (carte-gouv-fr's choice for parcels).
6. **A multi-part line is one feature per part** (`<id>:<n>`): the SDK's
   `RegulationFeature.line` is one line. Gordes' drinking-water network
   (`info-lin`, 631 parts) becomes 631 features; under the 1,900 cap.
7. **Points carry no geometry**: the SDK has no point feature, so
   `prescription-pct` / `info-pct` items are features without `rings` or
   `line`, listed in their view.
8. **An `information` view** beside DEC-12's four (`info-*` items need a list),
   and an `assumptions` block in the overview when the report holds any.
9. **A Site whose CRS moved** makes `read` reject with an `AbortError` (DEC-3's
   "no report"): the host reads a throw after its own abort as cancelled.
10. **No progress before the regime is known**; the first progress names every
    source the regime will read as `loading`.
11. **CNIG code names were not read from the CNIG PDFs** (step 2). `typepsc`
    names are given only where a live `libelle` confirms them (01, 02, 05, 07,
    15, 17, 18, 22, 23, 38, 39, 42, 44 — 15/38/42 and 01/07 from the
    milestone's § 4.5 and the DEC-11 table); any other code shows "type NN"
    beside its verbatim label and is logged. `typesect` 01 is confirmed by
    Mouzay; 02, 03, 99 are the CNIG carte communale standard's as remembered,
    unverified. The category mapping does not depend on either.
12. **Licences** were not checked (step 2's last item): the attribution strings
    name each source; the README cites no licence.

## Acceptance criteria, walked

1. ✅ Manifest — `package.test.mjs` "criterion 1"; `archisimple package
   validate ./fr-urban-rules` exit 0 (run 2026-10-20).
2. ✅ Locales — "criterion 2": same 137 keys in both, every
   `'fr-urban-rules.…'` literal in the source present in both, none shipped
   unused (the source id is assembled, not a literal, so it is not a key).
3. ✅ Lyon — "criterion 3": `plui`, version `200046977_PLUI_20260326`,
   `validFrom` `2026-03-26`, zone UCe1b with `typezone` U and its `datvalid`
   in the `zone` view, **14** surface prescriptions (deviation: 13 → 14, the
   data), the AC1 Saint-Nizier perimeter as an `easement` and an `abf` flag.
4. ✅ Brouennes `rnu`; Rochefort `not_published` with the AC4 easement, an
   `abf` flag and no rule; Mouzay `cc` with sector « C / Ci » — three
   "criterion 4" tests.
5. ✅ "criterion 5" ×2: a 503 `municipality` gives `unknown`; a hanging
   `prescription-surf` times out (50 ms in the test) and only that source is
   `unavailable`, zone and easements filled.
6. ✅ "criterion 6" ×3: the exact link, through `&status=document.production`
   and a case-insensitive match (the recorded list says `PLUi`, the zone
   `PLUI`); the unfiltered page is never asked and, served instead, links
   nothing; a missing file or a 404 leaves no link and the "not found" notice.
7. ✅ "criterion 7": over every URL the five reads ask, none contains
   `acte-sup`, `/details` or `/download`; `gaspar/pprn` carries `longitude` and
   `latitude`, never `latlon`; Lyon asks `gaspar/risques?code_insee=69123`.
8. ✅ "criterion 8": a zone answer claiming 5 with 1 returned is `unavailable`
   "incomplete"; 6,585 PPRs is `suspect`, not shown.
9. ✅ "criterion 9" ×2: `conversions.json` is the platform's
   (`scripts/capture.mjs` against `../archisimple/packages/geometry/dist`);
   Lyon's zone vertex lands within 1 m of its recorded Lambert-93 value (it is
   the value: the first vertex survives simplification); a perturbed vertex
   rejects the read with "not in the recorded conversion table".
10. ✅ "criterion 10": the first read rejects `AbortError` and sends no
    progress after the second begins; the host's own signal aborts as well.
11. ✅ "criterion 11" ×2: `site` and `design` reads of a cached plot send no
    request and answer the same report; `refresh` sends every request again; a
    refresh whose zone fails shows the cached zone, `unavailable`, its earlier
    `retrievedAt` and "shown as read at HH:MM".
12. ✅ `CLAUDE.md` and `README.md` name SDK 1.27 (and where to read it), the
    fourteen live capabilities from `capabilities.ts` and the token list from
    `services.ts`, each table saying which file it was read from (review).
13. ❌ **Not done.** The editor walk on Lyon AB0105 and Brouennes AB0280
    through the Development Repository needs a browser; this session had none.
    Unverified with it: the row and views on screen, the link opening the PDF in
    a new tab, and the package's `resources/i18n` strings loading from a
    Development Repository (no package here has shipped translations before).
14. ✅ "criterion 14" ×2: Lyon's overview is `fields, link, flags, sources`,
    views `zone, prescriptions, information, easements, risks`, ids stable
    across reads; `rnu` and `not_published` carry no `zone` view and
    `not_published` its warning notice. Plus "DEC-12: an empty view is still
    listed".
15. ✅ "criterion 15" ×2: Lyon and every progress stay ≤ 100,000 points and
    ≤ 2,000 features, simplified below raw; a 200,000-point zigzag zone is sent
    without rings, with `outline-too-detailed`. Plus "DEC-14: past 1,900".
16. ✅ "criterion 16" ×2: a checker mirroring the host's limits finds nothing
    in any recorded report or progress; a 3,000-character `libelle` and a
    12,000-character `libelong` are cut with "[…]" to 2,000 and 10,000, kept.

## Platform observations (no change made; none blocks this sprint)

- The SDK has **no point geometry** on a `RegulationFeature`, and **one line**
  per feature: 096.5 may want both for prescription points and network lines.
- The package builder **has no exclude list**, so recorded fixtures inside the
  package would ship: 3.3 MB, Lyon's conversion table alone 1.2 MB. The review
  moved them to `test-fixtures/fr-urban-rules/`; the archive is 0.16 MB.

## Questions for the owner (new)

1. Radon: keep the arrondissement fallback (deviation 2)?
2. Fixtures in the archive (3.3 MB): acceptable, or should the builder learn
   an ignore list (a platform change)?
3. Gordes' water network as 631 line features: acceptable, or send a
   multi-part line as one undrawn, listed feature?

## Review fixes (2026-10-20)

An independent review found no blocking defect. The coordinator's decisions on
the owner's behalf: **Q1** keep the radon fallback; **Q2** move the fixtures
out of the package; **Q3** 631 features for Gordes accepted for now, revisited
at 096.6's pictures; **Q4** the editor walk (criterion 13) is 096.6 / 002.4's
joint walk.

Fixed, each with a test (`reading.test.mjs` / `package.test.mjs` "review N"):

1. **A malformed element never rejects `read()`.** `featureCollection` drops a
   `null` or bare value among the features; each layer is parsed (and
   converted) inside its own task, so a throw there is that source's
   `malformed`, logged by `run`; a position that is not two finite numbers is
   unconverted, the item listed without geometry. The criterion 9 test for an
   unrecorded point now asserts `zone-urba` `unavailable`/`malformed`, a log
   line, and the other sources filled.
2. **Seismic**: only the commune's own entry; no match is empty, never another
   commune's zone.
3. **Cache**: an `unknown` report is never answered from memory; a report with
   an unavailable source is, for five minutes (`DEGRADED_TTL_MS`). The last good
   answers stay either way.
4. **Drift is `unknown`**: `municipality` features with no usable commune, or
   an `is_rnu` that is not a boolean, and `document` features of which none is
   usable (no partition or name, or an unknown type) give `unknown` and a log
   line; only an empty `document` answer is `not_published`.
5. **`centroidOf`** weights each ring by its own |area|.
6. **Disposal**: `activate` adds the reader's `dispose` to
   `context.subscriptions` and `deactivate` calls it — the read in flight is
   aborted and the cache cleared. The cache keeps the 20 most recent plots.
7. **Packaging**: fixtures moved to `test-fixtures/fr-urban-rules/` (no
   manifest; `CLAUDE.md` says why), `tests/helpers.mjs` points there; the
   `.aspkg` is **0.16 MB** (was 3.3 MB).
8. **Nits**: a POST end-to-end test past 6,000 characters; a plot across two
   communes reads the commune holding most of its area (`preferredCommune`,
   from the parcels' own fields) and the overview lists every commune, with a
   `several-communes` assumption; the zone view shows one block per zone label;
   code tables are read through `Object.hasOwn`; a document in force must carry
   a string `id`; the `abf` / `site` / `ppr` counts deduplicate a perimeter served
   as area, line and point; the choice that a `design` read aborts a Refresh
   (and answers from the cache) is commented in `read`; **one rule for
   Géorisques' empty 200 body** — "nothing published", `ready` and empty, for
   every read (radon still asks the arrondissement after it); API Carto and the
   GPU never answer so, and there an empty body is malformed. The sprint's own
   test command and prescription count are corrected in place.

**Gates after the fixes**: `node --test fr-urban-rules/tests/*.test.mjs` — **58
pass, 0 fail**; `urban-rules` 10 and `sh3f-importer` 99 pass; build-index (3
packages) and check-index (3 of 3) into the scratchpad succeed; the five
recorded reports still pass the platform's `checkedReport` with 0 dropped.

## Post-sprint list

- [x] `CLAUDE.md` and `README.md` corrected (step 1); the README's package
      table lists `fr-urban-rules`.
- [x] Package `README.md` (hosts, the carte-gouv-fr field contract, fixtures).
- [ ] Step 9 / criterion 13: the editor walk — moved to 096.6 / 002.4's joint
      walk (coordinator, 2026-10-20).
- [ ] Commit (the owner's).

---

# Current state (what reading the source found, 2026-10-19)

- **`urban-rules`** is the only planning package. It reads three typed
  preferences (`plotAreaSquareMetres`, `siteCoverageRatio`, `maxStoreys`) and
  contributes a Skill and a `programme` planning-stage enricher. It knows no
  plot, no zone, no source. 002.3 retires it.
- **The platform** has the Site (`SiteDto`,
  `packages/automation-api/src/contracts/dto/index.ts`): `anchor`
  (WGS84), `crs` (`EPSG:2154` for France), `country`, `parcels[]` whose
  `rings` are **in the Site's CRS** and whose `properties` are the source's
  fields verbatim. For a plot picked through carte-gouv-fr those properties
  are Parcellaire Express's: `idu`, `section`, `numero`, `nom_com`,
  `code_insee`, `contenance` (`extensions/carte-gouv-fr/src/index.ts`,
  `ParcelleProperties`, `parcelProperties`).
- **SDK 1.23** (`packages/extension-sdk/src/sdk-version.ts`) has no Site
  member, no site event, no `regulations` capability. Those are 096.1 and
  096.2, drafted in parallel.
- **The precedent for a French data source** is carte-gouv-fr: keyless
  `fetch`, `fetchLayer(url, signal)` that returns `{ failed }` instead of
  throwing, `HTTP n` → `source-refused`, a throw → `source-unavailable`,
  `COUNT=limit+1` so "more" is told from "exactly", an attribution constant
  per dataset (`GEOPLATEFORME_ATTRIBUTION`, `BUILDING_ATTRIBUTION`, …), and
  the source's CRS checked by name before any request.
- **This repository's `CLAUDE.md` is stale** (proposal § 14, last line): it
  says SDK `1.1`; its capability table lacks `map-features`, `terrain`,
  `country-profile`, `vegetation`, and calls `export` reserved while
  `README.md` says it grants `registerExporter`; its token table lacks
  `map-features`, `terrain`, `vegetation`, `roads`, `country-profile`,
  `exporter`, `sheet-exporter`. `README.md`'s token list is stale the same way.

---

# Goal

A located French project shows **Règles d'urbanisme (PLU)** under Site, and
its Properties say which regime applies, which document and version, which
zone, which prescriptions, easements, information and risks lie on the plot,
where each came from and when — or plainly that a source failed or the plan
is not published. The regulation opens in a new tab.

# Out of scope

- Any rule, check or measurement: coded RNU rules are 002.1a–b, drawn and
  entered rules 002.2, surfaces 002.3.
- Writing anything to the project (confirmations are 002.2, over 096.4).
- Plan layers drawn by the host: this sprint puts geometry in the report's
  `features[]`; drawing them by category is 096.5.
- Written-rule extraction and the zone chapter's page from the PDF outline
  (phase 2, DEC-7).
- `generateur-sup-*` (the generating object of an easement): the perimeter
  (`assiette-sup-*`) is what lies on the plot. Read in phase 2 if a flag
  needs it.
- Géorisques v2 (needs a token, phase 4).

---

# Decisions

## DEC-1 — The package

```text
fr-urban-rules/
  package.json
  src/index.js                 the whole extension, one file
  resources/i18n/fr-urban-rules/fr.json
  resources/i18n/fr-urban-rules/en.json
  tests/package.test.mjs       manifest, contract, mapping tables
  tests/reading.test.mjs       the readers, against recorded fixtures
  tests/fixtures/<plot>/…json  recorded answers (002.4 completes them)
  README.md
```

Manifest:

| Field | Value | Why |
| --- | --- | --- |
| `id` | `com.archisimple.fr-urban-rules` | Proposal § 7.2 |
| `type` | `extension` | It carries code |
| `sdkVersion` | `"1.27"` | Phase 0's last minor (096.4's `SitePackageDataService`, which 002.1a writes through). Every Phase 1 version (002.0–002.4) declares it, so a build lacking any seam the package uses refuses it with a reason instead of a runtime `undefined`; Phases 2–3 raise it (002.6a–b "1.28", 002.7 "1.30", 002.8 "1.32") |
| `capabilities` | `["regulations"]` | `regulations` registers the source. No `events`: `DocumentOpened` is declared and never emitted (096.1's finding), and the host re-reads on a Site or design change itself (096.2 DEC-6). 002.1a adds `document`, 002.3 adds `ai` |
| `resources` | `["i18n"]` | `resources/i18n/fr-urban-rules/<lang>.json` |
| `dependencies` | `[]` | carte-gouv-fr is **not** a dependency (DEC-4) |

`map-features` is **not** declared: this package queries other sources
(ambient) and registers none. `document` is not declared: it writes nothing.

**Lockstep** (proposal § 7.1): an older web image refuses the manifest whole
(`unknown-capability`). The README says so, and `check-index.mjs` runs
against a platform checkout that knows `regulations` (002.4).

## DEC-2 — The source registers once, reads on every Site change

`activate` resolves `{ name: 'regulations' }` (the token name 096.2 fixes)
and registers one `RegulationSource`:

- `id: 'fr-urban-rules.gpu'`, `labelKey: 'fr-urban-rules.source.label'`
  (fr: « Règles d'urbanisme (PLU) »; en: the same French words — DEC-10);
- `country: 'FR'` is not on the source: the country profile names it
  (`CountryProfile.planningSourceIds`, ADR-0084 Rule 9 revised in 096.2).
  carte-gouv-fr's profile is the one that must name `fr-urban-rules.gpu` —
  see Dependencies.
- `read(request, { signal, progress })` (096.2 DEC-2) returns the report
  for `request.site`, the Site view it is given. The host calls it on a Site
  change, a design change and Refresh (`request.reason`); the extension does
  not subscribe to the Site itself for reading, and subscribes to no
  document event: the cache (DEC-9) is keyed by plan and parcels, so a
  different project simply misses it.

**Progressive fill.** Proposal § 7.2 wants each section to fill as its
source answers. The extension produces a report **after each source
settles** (commune/document first, then zone, then the rest) and hands each
to `context.progress(report)`; the promise resolves with the last one. 096.2
provides `progress()` for this (its DEC-11).

**Cancellation.** A newer Site supersedes an older read: one
`AbortController` per read, aborted when the next `read` begins or when the
host's `signal` aborts; every `fetch` takes the signal, as carte-gouv-fr's
`fetchLayer(url, signal)` does. An aborted read produces no report.

**Timeout.** 10 s per request (the mockups' "did not answer within 10 s"),
an `AbortSignal.any([readSignal, AbortSignal.timeout(10_000)])`. A timeout is
`unavailable` for that source only.

## DEC-3 — Who reprojects: the host, through the Site view

API Carto takes and returns **EPSG:4326**; the Site's parcels are in
**EPSG:2154**. Three options were weighed:

| Option | Verdict |
| --- | --- |
| Copy the IGN inverse Lambert conformal conic (≈ 40 lines) into `index.js` | **No.** A second implementation of a host capability, the shape of platform Finding I-82. It would drift from `lambert93ToGeodetic` silently |
| Send only the anchor (already WGS84) as a point | **Fallback only.** A plot across a zone limit would report one zone |
| The host converts | **Chosen.** The host owns every CRS it can project through (ADR-0084: a profile's CRS must be projectable by the build) |

So 096.1's Site service offers, as pure functions, **Site CRS → WGS84 and
WGS84 → Site CRS** for points and rings (`toGeographic`, `fromGeographic`
and their ring forms; 096.1 DEC-9, requested here). Every GPU geometry is
converted to the Site's CRS before it enters `features[]`; the report's
geometry is always in the Site's CRS.

Should a Site's CRS be one the build does not project (the service answers
`undefined`), the reader falls back to the anchor-point read, every zone
marked with the assumption "read at the plot's anchor only". Never a copied
formula.

**How the service is reached and what its rings are** (review 2026-10-20,
`packages/extension-sdk/src/site.ts:533-573`):

- `context.services.getOptional({ name: 'site' })`: a host with no project
  registers none, and the reader then answers `unknown` with "no Site".
- `toGeographic*` / `fromGeographic*` convert through the **current** Site's
  CRS, not `request.site`'s. The reader checks `site.current()?.crs ===
  request.site.crs` before converting and, if they differ (the Site moved
  during the read), produces no report — a newer read is coming.
- The service's rings **do not repeat their first point**; GeoJSON's do. The
  query builder appends the closing point; every GPU ring has its closing
  point removed before `fromGeographicRing`. A report feature's ring is sent
  without it.

## DEC-4 — The plot geometry and its identifiers

- **Query geometry:** a GeoJSON `MultiPolygon` of every parcel's rings
  (`site.parcels[*].rings`, several outer rings being ordinary —
  `SiteParcelDto`'s comment), converted to WGS84, coordinates rounded to
  7 decimals (≈ 1 cm). Not the Site boundary (083.12): regulations attach to
  the land, not to the user's working line.
- **Size.** API Carto takes `geom` in the query string. A plot of ten
  parcels can exceed a safe URL length. Step 2 measures it on Lyon AB0105's
  real rings; if the encoded `geom` exceeds 6,000 characters, the reader
  sends the request as `POST` with a JSON body **if** API Carto accepts it
  (checked in step 2), otherwise simplifies the rings (Douglas–Peucker at
  0.2 m, a dozen lines, in Lambert-93 before conversion) and records
  "plot outline simplified for the query" as an assumption.
- **INSEE code.** From `properties.code_insee` when present, else the first
  five characters of `properties.idu`, else `municipality?geom=`'s `insee`.
  Reading carte-gouv-fr's verbatim fields is a contract **between two
  French extensions**; the host is not in it. A parcel from another source
  without them falls back to the `municipality` answer.
- **PLM arrondissements.** Géorisques' `gaspar/risques` needs the commune
  (69123), not the arrondissement (69382) (§ 4.3). A table maps Paris
  75101–75120 → 75056, Lyon 69381–69389 → 69123, Marseille 13201–13216 →
  13055. Used for **every** Géorisques request that takes `code_insee`
  (`gaspar/risques`, `zonage_sismique`, `radon`): Parcellaire Express gives
  the arrondissement in both `code_insee` and `idu` for a Lyon, Paris or
  Marseille parcel (carte-gouv-fr `ParcelleProperties`). Step 2 records
  whether `zonage_sismique` and `radon` answer an arrondissement code at all;
  the mapping applies either way. The GPU answers by geometry.

## DEC-5 — The reads, in order

All `https://apicarto.ign.fr/api/gpu/…?geom=<plot>` unless stated.

| # | Read | Fields used | Feeds |
| --- | --- | --- | --- |
| 1 | `municipality` | `insee`, `name`, `is_rnu` | regime |
| 1 | `document` | `idurba`, `typedoc` (`PLU`, `PLUi`, `CC`, `POS`, `PSMV`), `partition`, `datappro`, `etat` (names checked in step 2) | document |
| 2 | `zone-urba` | `libelle`, `libelong`, `typezone`, `datvalid`, `idurba`, `nomfic`, `urlfic` (empty — § 4.3) | zones |
| 2 | `secteur-cc` | `libelle`, `libelong`, `typesect`, `datvalid`, `idurba` | zones (CC) |
| 3 | `prescription-surf`, `-lin`, `-pct` | `libelle`, `txt`, `typepsc`, `stypepsc`, `datvalid` | features (002.2 parses numbers) |
| 3 | `info-surf`, `-lin`, `-pct` | `libelle`, `txt`, `typeinf`, `stypeinf` | features, information |
| 3 | `assiette-sup-s`, `-l`, `-p` | `suptype`, `typeass`, `nomass`, `modegeoass`, `paramcalc` | features, flags |
| 3 | GPU `api/document?partition=<partition>&status=document.production` then `api/document/{id}/files` | `id`, `originalName`, `legalStatus`, file `name` | the regulation link (DEC-7) |
| 3 | Géorisques v1 (DEC-6) | — | flags, information |

Wave 1 runs first (two requests); wave 2 when the regime is known (a CC
reads `secteur-cc`, a PLU/PLUi reads `zone-urba`, RNU and "not on the GPU"
read neither); wave 3 runs in parallel, each settling on its own.

**Never called:** `acte-sup` (ignores `geom`, returns a national page),
`/document/{id}/details` (no CORS header), `/document/{id}/download` (the
whole package: 3.1 GB for Lyon). A test asserts no URL the reader builds
contains any of the three.

**Paging.** Every API Carto answer is a GeoJSON FeatureCollection. When it
carries a total (`totalFeatures` / `numberMatched`, checked in step 2)
greater than `features.length`, the read is `failed` with "incomplete
answer", never shown as complete (ADR-0083 Rule 7's discipline).

## DEC-6 — Géorisques, with its pitfalls

`https://georisques.gouv.fr/api/v1/…`, each a separate source in
`sources[]`:

| Endpoint | Parameter | Pitfall handled |
| --- | --- | --- |
| `gaspar/risques` | `code_insee=<commune>` | the commune code, never the arrondissement (DEC-4) |
| `gaspar/pprn` | `longitude=&latitude=` of the plot's centroid | given `latlon`, it silently returns all 6,585 PPRs: the parameter names are asserted by a test, and an answer with more than 50 entries is treated as that failure (`suspect`, not shown) |
| `zonage_sismique` | `code_insee=<commune>` | the default radius returns neighbouring communes: never a point query; the commune, never the arrondissement (DEC-4) |
| `rga` | `latlon=<lon>,<lat>` (checked in step 2) | — |
| `radon` | `code_insee=<commune>` | the commune, never the arrondissement (DEC-4) |

Results become **flags** (the report has no `information` member,
`regulations.ts:339-381`): `kind` `seismic` (zone 1–5), `radon` (class 1–3),
`clay` (exposure), `risk` (one per GASPAR risk), each with a key label and
its value in the label's params; and, for a PPR whose perimeter holds the
plot, a flag `ppr`. The `risks` view (DEC-12) repeats them as a `fields`
block. Géorisques' risk list is information only; it is never a rule.

## DEC-7 — The regulation link: the document, not yet the zone's page

`zone-urba.urlfic` is empty (§ 4.3). The link is resolved:
`api/document?partition=<partition>&status=document.production` → the one
document in force, whose `originalName` must equal the read's `idurba`
**compared case-insensitively** → its `id` → `api/document/{id}/files` → the
entry whose name equals `zone-urba.nomfic` → the link
`https://www.geoportail-urbanisme.gouv.fr/api/document/{id}/files/{nomfic}`.
The browser follows the 302 to `data.geopf.fr/annexes/gpu/…` itself; the
extension never downloads the PDF.

- **Why the status filter** (002.5's — now 002.5a's — and 002.10's probes, 2026-10-19): the
  unfiltered `api/document?partition=` is paged at 20 entries, oldest first,
  and for Lyon (`DU_200046977`) all 20 on the first page are deleted versions;
  the one in force is not on it, and `offset` is ignored. Filtered, it is
  the single entry.
- **Why case-insensitive**: API Carto's `zone-urba` gives
  `200046977_PLUI_20260326`, the GPU document API `200046977_PLUi_20260326`
  (PLUi vs PLUI). A case-sensitive match finds no document for Lyon.
- An in-force `originalName` that differs otherwise (a new version since
  the zone was read) leaves the link out and says "a newer document is in
  force; Refresh", never links a version the zone was not read from.

**The zone's page is phase 2.** Finding it means reading the PDF's outline:
11 MB and 803 pages for Lyon, with no PDF reader available to a plain-ESM
extension (the host's `pdfjs-dist` is not on the SDK). The written-rule
service (proposal § 7.3 option C) finds the zone's chapter anyway; the page
comes with it. In phase 1 the link opens the document's **first page**, and
any rule that carries a page (an entered rule, 002.2) links with `#page=n`.
This narrows proposal § 13's "the regulation opens at the zone's page" —
see Corrections.

A 404 on `/files`, or no file named `nomfic`, leaves the link out and says
"regulation file not found on the GPU", with the document still shown.

The link is the report's `document.href` and the overview's `link` block
(DEC-12); the host opens `https:` links in a new tab and drops any other.

## DEC-8 — Four regimes, plus "unknown"

| `is_rnu` | `document` | Report `regime.code` | Shown |
| --- | --- | --- | --- |
| `false` | `PLU` (also `POS`, `PSMV`, labelled "other local plan") | `plu` | zones, prescriptions, information, easements, flags |
| `false` | `PLUi` | `plui` | as `plu` |
| `false` | `CC` | `cc` | sector, constructible or not (`typesect`, table from the CNIG CC standard, step 2); 002.1a adds the coded rules |
| `true` | — | `rnu` | 002.1a's coded rules; easements and flags still read |
| `false` | **none** | `not_published` | "Plan not on the GPU": easements still shown, no rule invented, hand entry offered (002.2) |
| — | `municipality` failed | `unknown` | "The planning source did not answer", with the last good read if the session holds one |

096.2 DEC-11 carries these six: `not_published` and `unknown` are its
`REGULATION_REGIME_STATES`, which the host names; `plu`, `plui`, `cc` and
`rnu` are this extension's codes, opaque to the host and shown through
`regime.label`. `not_published` and `unknown` are two different things and
the test of DEC-9 says so.

## DEC-9 — Source status and the last good read: memory, per session

- Each read in DEC-5/DEC-6 is one entry in `sources[]`, in the SDK's
  `RegulationSourceStatus` `{ id, name, state, retrievedAt?, detail? }`
  (`name` and `detail` are phrases; `state` is `loading`, `ready` or
  `unavailable` — there is no `failed` state): this extension's own status
  `ok` or `empty` is `state: 'ready'` (`empty`, a successful answer with no
  features, said in `detail` and never `failed`); `failed` and `suspect` are
  `state: 'unavailable'` with the reason in `detail`; `skipped` (a wave the
  regime does not need) is not listed. The attributions are joined into the
  report's `attribution`.
- **Cache key: the plot**, never the document (review 2026-10-20): the
  sorted parcel ids (`idu`, else `sourceId:featureId`) **and** a digest of
  their rings rounded to the centimetre. `idurba` is an answer, not a key —
  it is not known before the first request. Value: every raw answer and its
  `retrievedAt`, the `idurba` among them.
- **When the cache answers.** The host re-reads on every change of its Site
  key, and since 096.4 that key includes this package's section on the Site
  (`apps/web/src/regulations/regulationSiteKey.ts`): a write of the section
  (002.1a's edge roles, 002.2's confirmations), its undo and its redo arrive
  as a read with `reason: 'site'`. Such a read finds the same plot key and
  is answered **from the cache**, no request sent; only a different plot
  misses. A `design` read is answered from the cache too.
  **`reason: 'refresh'` skips the cache**: it drops the plot's entry and
  reads every source again.
- **Where:** **memory, for the session**, in the extension's closure. Not
  package data on the Site: proposal § 8 persists "only what the user
  decided", a cache is not a decision, and a write through 096.4 is a
  Request — an undo entry the user never made, on every read.
- **Last good read:** when a source fails on a re-read (Refresh, or a Site
  change back to a plot read earlier this session), the report shows the
  cached answer for that source with status `failed` and its earlier
  `retrievedAt` ("shown as read at 10:42"). Across sessions there is none in
  this sprint; 002.2's confirmations, which are persisted, carry the
  `idurba`/`datvalid` and date they were confirmed against, which is what
  the user needs on a cold start with a failing source. See Corrections:
  the mockup's "shown as read on 12 Oct" implies a cross-session cache that
  needs a non-history store the platform does not plan.
- **Refresh is the host's**, not this extension's (096.3b Outcome:
  `SiteRegulationsPropertyEditor` shows Refresh on the row and reads with
  `reason: 'refresh'`). 002.0 has no `runAction`, and the host drops every
  action of a source without one (`regulations.ts:590-594`), so the report
  carries no action of its own.

## DEC-10 — Names and strings

- Every visible string is a key under `fr-urban-rules.` in both locales.
  Verbatim GPU text (`libelle`, `libelong`, `nomass`, `txt`) is data and
  shown as such, never translated.
- The row's label is the French legal name in **both** locales: « Règles
  d'urbanisme (PLU) » (proposal D4: the name comes from the country's
  source). Its `en.json` entry carries the same words; the children and
  every sentence are translated.

## DEC-11 — Categories: CNIG codes and easement types to semantic categories

The report's features are typed by the **semantic category** 096.2 defines
(the host draws by category with theme tokens, 096.5, and never reads a
CNIG code). The mapping is a table in `index.js`, onto 096.2's closed list
(`zone`, `prescription`, `easement`, `risk`, `setback-band`, `envelope`,
`alignment`, `information`; ADR-0111 Rule 4). The finer French distinction
travels in the feature's label and in the flags, never as a new category:

| Source value | Category | Flag |
| --- | --- | --- |
| zone `typezone` `U`, `AUc`, `AUs`, `A`, `N` | `zone` (urban / to-urbanise / agricultural / natural in its label) | — |
| `secteur-cc` | `zone` | — |
| `typepsc` 39 (height), 38 (footprint), 42 (biotope / green), 44 (parking) | `prescription` | — |
| `typepsc` 15 (setback lines) | `prescription` (a line) | — |
| `typepsc` 01 (espace boisé classé), 07 (heritage / landscape to protect) | `prescription` | — |
| `typepsc` 05 (emplacement réservé) | `prescription` | — |
| other `typepsc` | `prescription` | — |
| `info-*` | `information` | — |
| `suptype` `ac1` (abords MH), `ac4` (SPR) | `easement` | `abf` |
| `suptype` `ac2` (sites inscrits / classés) | `easement` | `site` |
| `suptype` `pm1` (PPRN), `pm3` (PPRT) | `risk` | `ppr` |
| `suptype` `el7` (alignement) | `alignment` (002.1b reads it) | — |
| any other `suptype` | `easement` | — |
| Géorisques PPRN zone on the plot | `risk` | `ppr` |

**The code meanings are read from the CNIG standards in step 2** (PLU
prescriptions and information, CNIG 2017d / 2022; SUP nomenclature), and the
table's comment cites the document and its date. The codes above come from
the live probe (§ 4.2, § 4.5) and are not to be trusted further than that
until step 2. An unknown code is `prescription` / `easement`, shown and
logged, never dropped.

## DEC-12 — What Properties shows: `overview` and `views`

The host renders a report's `overview` blocks and `views`, and adds only the
`flags` and `sources` blocks of its own when the overview lacks them
(`regulations.ts:368-380`, 096.3a Outcome). Zones, the document and the
link are **not** drawn from the report's collections. So the report always
carries:

- **`overview`** (the row's Properties), in order: a `notice` for
  `not_published` ("Plan not on the GPU", tone `warning`) or `unknown` ("The
  planning source did not answer", tone `error`); a `fields` block — regime,
  document (`title`), version, approved (`validFrom`), zone(s); a `link`
  block "Open the regulation" (DEC-7) when resolved, or a `notice` saying why
  not; then `flags` and `sources`.
- **`views`** (one tree row each, ids `[a-z0-9-]`, at most 64 characters,
  stable across reads):
  - `zone` — a `fields` block per zone (label, long label verbatim,
    `typezone`, the zone's own `datvalid`), absent under `rnu` and
    `not_published`; `sector` under `cc`;
  - `prescriptions` — a `table` (type, label verbatim, value `txt`, geometry
    kind), at most six columns and 200 rows; past 200, a `notice` says how
    many are not listed and the source's state stays `ready` (the features
    are all in `features[]`);
  - `easements` — a `table` of `suptype`, `nomass`, `typeass`;
  - `risks` — a `fields` block of the Géorisques flags (DEC-6).
- An empty view (no prescriptions) is still listed, with a `notice` "none on
  the plot", so its absence is never read as a failed read.

## DEC-13 — The report's own shape

Mapped onto the SDK as implemented (`regulations.ts:339-381`):

- `regime`: `{ code, label }` (DEC-8).
- `document`: `{ id: partition (`DU_200046977`, stable across versions),
  version: idurba, validFrom: the
  document's approval date as ISO `YYYY-MM-DD` (the GPU's `20260326` becomes
  `2026-03-26`; an unreadable date is dropped by the host), title: { text:
  typedoc + commune name, lang: 'fr' }, status: { key }, href: the DEC-7
  link }`. Absent under `rnu` and `not_published`.
- `zones`: `{ id, label: { text: libelle, lang: 'fr' }, description?: { text:
  libelong, lang: 'fr' } }`; the zone's own `datvalid` is in the `zone` view
  (proposal § 4.3: it can differ from the document's).
- `features`, `flags`, `sources` as DEC-5, DEC-6, DEC-9, DEC-11; `rules`,
  `checks`, `edges`, `assumptions` empty; `attribution` the joined strings.
- **String lengths.** The host drops a string over 2,000 characters, and an
  item whose required `label` is dropped goes with it; a passage or a
  `detail` holds 10,000 (`regulations.ts:736-739`). A label is always the
  short field (`libelle`, `nomass`); long verbatim text (`txt`, `libelong`)
  goes in a `detail` or a `quote` block's `passage`, cut at 10,000 with
  "[…]" and the cut said in the item's detail — a display limit, never a
  silent truncation.

## DEC-14 — The point budget

A report past 100,000 points or 2,000 features is **refused whole**, and so
is each `progress()` report (`regulations.ts:672-677`, `:740-742`). A PLUi
zone polygon is the whole zone, and an AC1 perimeter a 500 m buffer, so
Lyon is at risk. The budget:

- every ring is simplified (Douglas–Peucker, DEC-4's routine, 0.2 m in the
  Site's CRS) before it enters the report;
- a feature still over 5,000 points, or a report still over 80,000, sends
  the largest features **without** `rings` (legal: `rings` is optional),
  with the assumption "outline too detailed to draw; shown in the list
  only";
- features never exceed 1,900; the rest are listed in their view and counted
  in a notice.

Step 2 records Lyon's raw and simplified point counts.

---

# Steps

1. **Correct this repository's `CLAUDE.md` and `README.md`.** SDK: "read
   `SDK_VERSION` in `packages/extension-sdk/src/sdk-version.ts`" rather than a
   number (1.23 today); the capability table from `capabilities.ts`
   (`map-features`, `terrain`, `country-profile`, `vegetation` added; `export`
   moved out of "reserved", as `README.md` already has it); the token table
   from `services.ts`' `defineServiceToken` list (`map-features`, `terrain`,
   `vegetation`, `roads`, `country-profile`, `exporter`, `sheet-exporter`);
   a line that 096.1/096.2 add the Site view and `regulations`. Name the
   file each table was read from, so the next drift is one diff away.
2. **Probe once, record.** Against the five plots of § 4.1: the exact field
   names of `document` (partition, type, status) and of the paging total;
   whether API Carto accepts `POST` for `geom`; the `/files` answer's shape;
   `rga`'s parameter; the CNIG and SUP code tables (DEC-11) and the CC
   `typesect` values (DEC-8). Each answer is saved to
   `test-fixtures/fr-urban-rules/<plot>/<endpoint>.json` (originally
  `tests/fixtures/`; moved by the review) with the request URL and date in
   a sibling `.meta.json`. Read-only, small requests, no `download`.
3. **Scaffold** `fr-urban-rules/` (DEC-1): manifest, `activate` /
   `deactivate`, the two locale files, the README (hosts contacted:
   `apicarto.ign.fr`, `www.geoportail-urbanisme.gouv.fr`, `georisques.gouv.fr`;
   the browser alone reaches `data.geopf.fr` for the PDF).
4. **The fetch layer:** `fetchJson(url, signal)` returning `{ json }` or
   `{ failed, detail }` (carte-gouv-fr's `fetchLayer` shape), the timeout,
   the paging guard, an injected `fetch` for tests (`createReader({ fetch,
   now })`, exported through `__testing`). A refusal is told by
   `!Array.isArray(answer)` (the SDK's `isMapFeatureRefusal` cannot be
   imported); `AbortSignal.any` needs Node ≥ 20.3 for the tests.
5. **The readers** (DEC-5, DEC-6), the regime (DEC-8), the link (DEC-7).
6. **The mapping** (DEC-11) and the report assembly (DEC-13): regime,
   `document`, `zones[]`, `features[]` in the Site's CRS within the budget
   (DEC-14), `flags[]` (Géorisques included), `sources[]`, empty `rules[]`,
   `checks[]`, `edges[]`, `assumptions[]`; the `overview` and `views`
   (DEC-12).
7. **The cache** (DEC-9): keyed by plot, answering `site` and `design`
   reads from memory, skipped on `refresh`.
8. **Tests** (below); `node --test fr-urban-rules/tests/*.test.mjs` (Node 24
   reads the arguments as globs; the directory form fails — Outcome, deviation 1).
9. **Walk it** in the editor on Lyon AB0105 and Brouennes AB0280 through
   the Development Repository, against a platform build carrying 096.4
   (SDK 1.27, which the manifest declares). The walk confirms the package's
   own `resources/i18n` strings load from the Development Repository (no
   package of this repository has shipped translations before) — a raw key
   on screen fails it.

# Acceptance criteria

1. `package.json` declares `type: "extension"`, `sdkVersion` `"1.27"`,
   `capabilities` exactly `["regulations"]`, `resources: ["i18n"]`; `archisimple package validate
   ./fr-urban-rules` exits 0 (test + CLI).
2. Both locale files hold the same key set, and every key `index.js` names
   exists in both (test reading the source for `fr-urban-rules.` keys).
3. With a stubbed `fetch` serving Lyon's recorded answers, the report has
   regime `plui`, `document.version` `200046977_PLUI_20260326`, `document.validFrom`
   an ISO date, zone `UCe1b` (`typezone` `U` in the `zone` view, the zone's
   `datvalid` `20260326` shown there), 13 surface prescriptions (14 in the
   fixture recorded 2026-10-20: the data changed; the test asserts 14), the AC1
   perimeter as an `easement` with an `abf` flag (test).
4. Brouennes' answers give `rnu`; Rochefort-en-Terre's give
   `not_published` with the AC4 easement and an `abf` flag and **no** rule;
   Mouzay's give `cc` with its sector (test).
5. A `municipality` that fails gives `unknown`, never `not_published`;
   a `prescription-surf` that times out leaves zone and easements filled and
   that one source `failed` (test).
6. The regulation link for Lyon is
   `…/api/document/4f3ddc27a9611b4bc94fa161443b8e86/files/200046977_reglement_20260326.pdf`,
   resolved through `&status=document.production` and a case-insensitive
   match of `200046977_PLUI_20260326` with `200046977_PLUi_20260326`; a
   recorded unfiltered first page (20 deleted versions) is never used; a
   missing file leaves no link and a message (test).
7. No URL built by the reader contains `acte-sup`, `/details` or
   `/download`; `gaspar/pprn` carries `longitude` and `latitude` and never
   `latlon`; `gaspar/risques` for a Lyon parcel carries `code_insee=69123`
   (test on the URLs).
8. An API Carto answer whose total exceeds its features is `failed`
   "incomplete", and an answer of more than 50 PPRs is `suspect` (test).
9. Every feature's coordinates came through the Site service's
   `fromGeographicRing`: the test's Site service is a **recorded table** of
   the platform's own conversions of the fixture's points (captured once by
   a script against an archisimple checkout, the `import-capture`
   precedent), and a Lyon zone vertex lands within 1 m of its recorded
   Lambert-93 value; a point not in the table fails the test rather than
   being converted by a formula here (test).
10. A second `read` aborts the first; the first produces no report (test
    with a deferred stub).
11. A re-read of a cached plot whose source fails shows the cached answer
    with its earlier `retrievedAt` and `state: 'unavailable'` (test). A
    `site` read of the same plot (a section write) sends no request; a
    `refresh` read sends every request again (test, counting `fetch` calls).
14. The report carries an `overview` (fields, link, flags, sources) and the
    views `zone`, `prescriptions`, `easements`, `risks`, ids matching
    `[a-z0-9-]{1,64}`; `rnu` and `not_published` reports carry the notice
    and no `zone` view (test).
15. Lyon's report stays under 100,000 points and 2,000 features after DEC-14
    (test on the fixture); a synthetic 200,000-point zone is sent without
    rings and with the assumption (test).
16. No string in the report exceeds 2,000 characters except passages and
    details (≤ 10,000); every label is present after a check that mirrors
    the host's limits (test).
12. `CLAUDE.md` and `README.md` name SDK version, capabilities and tokens as
    the platform source has them, and say where each was read (review).
13. In the editor, Lyon AB0105 shows the row, the zone, the version, the
    flags and the link opening the PDF in a new tab (manual, recorded in the
    outcome).

# Testing strategy

- **Unit, no network:** every reader against recorded fixtures through an
  injected `fetch`; the mapping tables; the regime table; the URL builders;
  the cache. `node --test`, no install, as `urban-rules` does.
- **No live call in any test.** Step 2's probe is a script run by hand, not
  a test.
- **Fixtures live outside the package** (review 2026-10-20, superseding "fixtures
  ship in the archive"): the package builder excludes only `node_modules`,
  `.git` and OS files (`packages/package-builder/src/package-project.ts:58-63`),
  so they are kept in `test-fixtures/fr-urban-rules/` at the repository root,
  which carries no manifest. Only the commune's and the document's outlines
  are trimmed; the README says so.
- **Manual:** the walk of step 9; 002.4 does the five plots.

# Risks

- **API Carto field names drift.** The probe is one day old; step 2 records
  the fields with the date, and an unexpected shape fails a read rather than
  showing nothing.
- **URL length** for a large plot (DEC-4).
- **The `#page=` fragment across a 302.** Browsers carry a fragment over a
  redirect with none; checked in step 9, and irrelevant until a rule has a
  page.
- **Two French extensions coupled by field names** (`idu`, `code_insee`):
  recorded in both READMEs; the fallback is the `municipality` answer.
- **Licence.** Etalab 2.0 is confirmed for the geocoder only (§ 4.3). The
  attribution strings say what each source is; the summary sheet (096.10)
  must not cite a licence this sprint did not check. Step 2 records each
  source's stated licence.

# Questions for the owner

> **Answered 2026-10-19:** the owner accepted the recommendation given for each question below (site-regulations README §5). Where a question had no recommendation, the README records the decision.

1. The row label in English: keep the French « Règles d'urbanisme (PLU) »
   (DEC-10), or "Planning rules (PLU)"?
2. The zone's page in phase 1 (DEC-7): is "opens the document" acceptable
   until the extraction service, or should a cheap heuristic (a hand table
   for the five reference documents) fill the gap?

# Definition of Done

The acceptance criteria walked against the code; the Design Contract boxes
checked against the source; `node --test fr-urban-rules/tests/*.test.mjs` green;
`archisimple package validate ./fr-urban-rules` green against a platform
build with 096.4 (SDK 1.27); the README table of this repository lists the package.

---

# Dependencies on platform sprints

| Sprint | What this sprint needs from it |
| --- | --- |
| **096.1** (SDK 1.24) | The Site view: `parcels[]` with `rings` and verbatim `properties`, `crs`, `anchor`, `country`; the site-changed event; **point and ring conversion Site CRS ↔ WGS84** (DEC-3) — provided by 096.1 DEC-9, criterion 14 |
| **096.2** (ADR-0111, SDK 1.25) | The `regulations` capability; `RegulationSource` with `read(request, { signal, progress })`; `RegulationReport` carrying the regime (six codes, DEC-8: 096.2 DEC-11's `REGULATION_REGIME_STATES` plus this extension's opaque codes), document, zones, features by 096.2's semantic categories (DEC-11), flags, `sources[]` with state and date; **progressive reports** through `progress()` (096.2 DEC-2, DEC-11); `planningSourceIds` on the profile |
| **096.3a–b** (SDK 1.26) | The row under Site gated by `planningSourceIds`; the Properties renderer of the report's `overview` and `views` (DEC-12) with fields, tables, notices, links opening a new tab; the host's own Refresh, which reads with `reason: 'refresh'` (no extension action) |
| **096.4** (SDK 1.27) | Not used by this sprint's code; the manifest declares 1.27 so every 002.x version targets one platform minor |
| **096.5** | Drawing `features[]` (not needed for this sprint's acceptance, needed for US-02) |
| carte-gouv-fr (platform `extensions/`) | Its France profile names `fr-urban-rules.gpu` in `planningSourceIds`, as it names `carte-gouv.troncon-de-route` in `roadSourceIds`: 096.2 step 7 and criterion 13. A profile naming an id nothing registered is ordinary: no row |

# Corrections to the proposal

1. **§ 13 "The regulation opens at the zone's page"** cannot hold in phase
   1: the page comes from the PDF outline, which needs the PDF (11 MB) and a
   reader the extension does not have. Phase 1 opens the document; the
   zone's page is phase 2 with the extraction service (DEC-7). US-01's
   "opens at the zone's page" is narrowed the same way.
2. **§ 7.2 "responses are cached per `idurba` and parcel set"** does not
   say where. A persisted cache would be a Request per read (an undo entry
   nobody made) and contradicts § 8 "only what the user decided is
   persisted". Memory, per session (DEC-9). The mockup's "Shown as read on
   12 Oct 2026" (Screen 5) therefore holds within a session only.
3. **§ 4.4 lists four regimes**; a fifth state, "the planning source did not
   answer" (`municipality` failed), must not be confused with "not on the
   GPU". The table should carry it.
4. **§ 10 "EPSG:4326 from API Carto, Lambert-93 in the Site"** names the
   CRS mismatch but not who converts; the platform's milestone did not ask
   096.1 for a conversion. It is the host's (DEC-3), now 096.1 DEC-9.
5. **§ 7.2 "Expect about 3 s in total"** is optimistic for Lyon:
   `prescription-surf` and `assiette-sup-s` alone take up to 2.7 s each
   (§ 4.2), in parallel ≈ 3 s **after** wave 1 and wave 2 (≈ 0.5 s). About
   3.5 s, with the 10 s timeout as the bound.
6. **§ 14's stale-`CLAUDE.md` note** misses that `CLAUDE.md` and `README.md`
   disagree on `export` (reserved vs granted), and that the token tables lack
   `roads`, `exporter` and `sheet-exporter` too.

# Reconciliation (2026-10-19)

- Prerequisites: each platform sprint's SDK minor named (1.24, 1.25, 1.26);
  the package declares 1.27 (096.4) from its first version.
- DEC-1: `sdkVersion` `"1.27"`; capabilities `["regulations"]` only —
  `events` dropped, since `DocumentOpened` is never emitted (096.1) and the
  host re-reads on Site and design changes (096.2 DEC-6).
- DEC-2: `read(request, { signal, progress })` per 096.2; progressive fill
  through `progress()`, the single-promise fallback removed; no document
  subscription (the cache key separates projects).
- DEC-3: the CRS conversion is 096.1 DEC-9's (points and rings); only the
  anchor-point fallback for an unprojected CRS is kept.
- DEC-8: regime codes `plu`, `plui`, `cc`, `rnu`, `not_published`, `unknown`
  (096.2 DEC-11), replacing `local_plan`, `municipal_map`, `national_rules`.
- DEC-9: `sources[]` entries mapped onto 096.2's `{ id, name, state }` shape.
- DEC-11: categories mapped onto 096.2's closed list (`regulated_area`,
  `setback_line`, `protected_area`, `reserved_land` → `prescription`;
  `heritage_perimeter` → `easement`; `risk_area` → `risk`).
- Step 9, criteria 1, 3 and 4, Definition of Done: SDK 1.27, the new
  capability list, the new regime codes and categories.
- Dependencies: 096.1 / 096.2 / 096.3a–b / 096.4 rows point at what each
  provides (096.1 DEC-9, 096.2 DEC-11 and step 7); correction 4 updated.

# Reconciliation (2026-10-19, phases 2–4)

- DEC-7, DEC-5's row 3, criterion 6: the document is resolved with
  `api/document?partition=…&status=document.production` (the unfiltered
  list's first page holds only deleted versions for Lyon, and `offset` is
  ignored — 002.5 and 002.10's probes), and `originalName` is compared with
  `idurba` case-insensitively (`PLUi` vs `PLUI`). Requested by 002.5 (now 002.5a)
  (correction 3) and 002.9 (correction 2).
- DEC-1: "every 002.x version declares 1.27" narrowed to Phase 1; Phases 2–3
  declare 1.28 (002.6a–b), 1.30 (002.7) and 1.32 (002.8).

# Review (2026-10-19)

- References only: Sprint 096.3 was split into 096.3a (Regulations Tree and
  Panel: the row, badges, views, blocks and `phraseText` / `limitText`) and
  096.3b (Regulation Actions: `runAction`, fields, the FR requests), which
  share SDK 1.26. Mentions now name the half they mean, or 096.3a–b. Old
  DEC numbers are mapped: 1–7 stay as 096.3a DEC-1–7; 8 is 096.3b DEC-1;
  9–12 are 096.3a DEC-8–11; 13 is 096.3b DEC-3.

# Review (2026-10-20)

An adversarial review against the **implemented** SDK 1.27
(`packages/extension-sdk/src/{site,regulations,services,site-package-data}.ts`)
and the 096.x Outcomes. Decisions are the coordinator's, on the owner's
behalf.

- **Blocking — views.** The host draws only `overview` and `views` plus its
  own `flags` / `sources`; nothing showed the zone, the document or the link.
  New DEC-12 and criterion 14.
- **Blocking — report shape.** Step 6's `document {idurba, datvalid, type,
  files}` and `information` were not the SDK's. New DEC-13: `document {id,
  version, validFrom (ISO), title, status, href}` (`id` the partition,
  `version` the `idurba`); Géorisques results are
  flags (DEC-6). Criterion 3 restated.
- **Blocking — point budget.** 100,000 points / 2,000 features refuse a
  report whole, progress included. New DEC-14, criterion 15.
- DEC-9: no `failed` state (`unavailable`); the cache is keyed by plot
  (parcel ids + ring digest), answers `site` reads caused by a section write
  and `design` reads from memory, and is skipped on `refresh`; the
  "Refresh action" is removed — Refresh is the host's, and a source without
  `runAction` has its actions dropped. Criterion 11 extended.
- DEC-13: the 2,000 / 10,000 string limits; labels short, long text in
  details or passages. Criterion 16.
- DEC-4 / DEC-6: the commune code for every Géorisques `code_insee`
  request, not only `gaspar/risques`.
- DEC-3: `getOptional`, the current Site's CRS, rings without the closing
  point.
- Criterion 9: a recorded table of the platform's conversions, not a stub
  that would test itself.
- Step 4: `Array.isArray` for refusals, Node ≥ 20.3. Step 9: the i18n
  resources are walked. Testing strategy: fixtures ship in the `.aspkg`.
- References: 002.1 is split into **002.1a (RNU Rules)** and **002.1b
  (Alignment and Neighbours)**; mentions here name the half they mean.
