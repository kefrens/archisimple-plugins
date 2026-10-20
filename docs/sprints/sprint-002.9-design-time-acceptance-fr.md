# Sprint 002.9 — Design-Time Acceptance FR

> **Status:** **Draft (2026-10-19)** — nothing implemented. Written from the
> proposal v2.2, the platform's milestone README (§3 "Phases 2–4") and
> 002.4's acceptance draft, which this sprint extends rather than repeats.
> Sprints 002.5a–002.8 and the platform's 096.7–096.13 are drafted in
> parallel; this sprint names them by number and is rewritten against what
> they built when they close.
>
> **Repository:** `archisimple-plugins` — package `fr-urban-rules` and the
> companion service `fr-urban-rules-service`.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> §12 Phases 2–3; the platform README's row 002.9: "the joint walk with
> 096.14, on recorded fixtures". Closes Phases 2 and 3 for France.
>
> **Prerequisites:** 002.4 closed (Phase 1: the five plots pinned, their GPU
> answers recorded, the reference designs captured). 002.5a, 002.5b, 002.6a, 002.6b, 002.7 and
> 002.8 implemented. Platform: 096.7–096.13 implemented; **096.14** is walked
> jointly with this sprint.
>
> **Sizes:** fixtures (extraction answers, chapter text), expected values, an
> extension of 002.4's recording script, the walk. No new feature. Medium.

---

# Sprint Design Contract

- [ ] **Expected values are written before anything is run.** §"Expected
      values" is completed and committed by the owner **before** the first
      recording of an extraction answer and before the walk. A value changed
      after a run is recorded as changed, with the reason (002.4's rule).
- [ ] **No live call in any test, model included.** Every test reads a
      recorded GPU answer (002.4) **and a recorded 096.7 answer** through an
      injected `fetch`. A test replaces `globalThis.fetch` with a function
      that throws, as 002.4 criterion 2 does, for the service's suite too.
- [ ] **Hand-checked means by a person**, against the regulation PDF read at
      the page, not against this package's extraction.
- [ ] **Nothing extracted is a constraint until confirmed** (proposal §5.2).
      The walk confirms explicitly; no fixture ships a confirmed `written`
      rule except `section.json` after the walk.
- [ ] **Recorded fixtures carry no personal data**: parcel ids are public
      cadastral identifiers already in 002.4; the service's request log is
      not recorded.

---

# Current state

- 002.4 committed, per plot P1–P5: `tests/fixtures/<plot>/gpu/*.json`,
  `site.json`, `context.json`, `measures.json`, `section.json`, and
  `tools/record-fixtures.mjs` with `--check`.
- Nothing was recorded for extraction until 002.5b, which records one live Lyon answer itself (`record-fixtures.mjs --extraction`, its DEC-11); 002.5a–002.6b test their own pieces
  (outline lookup, schema mapping, the extension's rendering of `written`
  rules) separately. No test runs a plot from the règlement's bytes to a
  `written` rule.
- The PDFs are large (Lyon: 11 MB, 803 pages, proposal §4.5). They are not
  committed anywhere today.
- Live (2026-10-19, read-only, recorded in 002.10's probe):
  - Lyon's current document is `200046977_PLUi_20260326`, GPU id
    `4f3ddc27a9611b4bc94fa161443b8e86`, partition `DU_200046977`; API Carto's
    `zone-urba` gives `idurba` `200046977_PLUI_20260326` (**case differs**:
    `PLUi` vs `PLUI`).
  - Gordes' current document is `84050_PLU_20241017` (GPU id
    `703e6c2a3130ed9396d8100fde318c2e`).
  - Rochefort-en-Terre: `is_rnu: false`, no document, partition
    `DU_56196` empty.

---

# Goal

The two plots with a règlement on the GPU (Lyon, Gordes) give, from the
document's own bytes through the companion service and a **recorded**
extraction, the values a person read in the PDF; the three without one
(Mouzay, Brouennes, Rochefort) give no extraction and say why; and the
design-time surfaces (envelope, sheet, variation figures, assistant) carry
those values. The joint walk with 096.14 closes Phases 2–3.

# Out of scope

- Any new rule kind, source or surface. A defect of 002.5a–002.8 is fixed
  here; anything new is its own sprint.
- Phase 4 (002.10): watching for new versions, Géorisques v2, national
  coverage.
- The platform's own walk of the deployment (096.14 DEC-4–DEC-6). This
  sprint walks the package's side of it: the service's routes, its
  allow-list, its cache.
- Model quality beyond the five plots. Two documents are an acceptance set,
  not an evaluation.

---

# Decisions

## DEC-1 — The five plots, with their Phase 2–3 role

As 002.4 DEC-1, pinned there. What each proves here:

| # | Plot | Extraction | Design-time |
| --- | --- | --- | --- |
| P1 | Lyon 2e `69382000AB0105`, UCe1b | **Yes**: the UCe chapter of a city PLUi | envelope (drawn 22 m), sheet, assistant, the PDF at the zone's page |
| P2 | Gordes `84050000AC0323`, A | **Yes**: zone A of a small PLU; extension and annex caps | sheet with the AC2 flag; surfaces against the existing building |
| P3 | Mouzay (002.4's parcel) | **No**: carte communale, no règlement | envelope from coded rules |
| P4 | Brouennes `55083000AB0280` | **No**: RNU | variation figures (1 / 0 issues) |
| P5 | Rochefort-en-Terre (002.4's parcel) | **No**: not on the GPU | sheet says so; the assistant declines to cite a rule |

## DEC-2 — What is recorded for extraction

Per plot with a règlement, under `test-fixtures/fr-urban-rules/<plot>/`:
`regulation/` (002.5a DEC-12) and `extraction/` (002.5b DEC-11, which records
Lyon; this sprint adds Gordes and any further plot):

- `document.meta.json` — GPU id, `originalName`, `partition`, the file name
  (`nomfic`), size, **sha256 of the PDF**, retrieval date. The PDF itself is
  **not** committed (11 MB for Lyon; licence to be checked, proposal §4.3).
- `outline.json` — the PDF's outline as 002.5a reads it, and the zone
  chapter's page range it chose.
- `pages.jsonl` — the text layer of the chosen pages, one line per PDF page
  index, with no page markers in the text (002.5a DEC-7 keeps a page-offset
  index instead). Small, and what the extraction actually reads.
- `extraction.request.json` — the body sent to the 096.7 route (text +
  schema id + schema), with a sha256 of its canonical form.
- `extraction.response.json` — the route's answer, keyed by that sha256.

A test-only `ai-service` fake answers the route from
`extraction.response.json` when the request's sha256 matches, and **fails the
test** otherwise. A schema or prompt change therefore breaks the test loudly
until the owner re-records.

## DEC-3 — Recording, by hand

`tools/record-fixtures.mjs` (002.4 DEC-4) gains `--extraction`:

1. fetches the PDF through the companion service's own fetcher (so the host
   allow-list is exercised);
2. writes `document.meta.json`, `outline.json`, `chapter.txt`;
3. calls a **live** 096.7 route on a deployment the owner names
   (`--ai-service <url>`, with basic-auth credentials from the environment,
   never from a file in the repository);
4. writes the request and response.

`--check --extraction` re-runs 1–2 and compares the PDF's sha256 and the
chosen page range; it re-runs 3 only with `--live-model`, and then prints a
field-by-field difference (kind, limit, page, passage) for the owner to
judge. Never imported by a test.

## DEC-4 — How an extraction is judged

Per extracted rule, against §"Expected values":

- **kind** and **limit** must match exactly (value, unit, base);
- **page** within the expected range;
- **passage**: the expected passage's key phrase occurs in the quoted
  passage (normalised whitespace and ligatures), not an exact match;
- **conditions / exceptions**: each expected one present; extras listed,
  not failed;
- a rule the expected table says **not regulated** must come back as a rule
  stating so, with its passage — never as an absent rule.

A recorded response that fails these is not "fixed" by editing the response:
either the expectation was wrong (recorded as changed, with the reason) or
002.5a–b / 002.6a–b has a defect.

## DEC-5 — The joint walk with 096.14

One session, the owner and both checklists, on the owner's deployment (096.14
DEC-4 run 2) and locally:

1. **Pinned package** (096.14 DEC-6): the card lists the hosts the
   package's browser code contacts (002.8's `network.hosts`) and names the
   companion as "this deployment's service", without its hosts (096.13
   DEC-7).
2. **P1 Lyon:** Read; Extract written rules; the `written` rules appear
   `to_confirm` with page, passage, conditions; the PDF opens at the zone's
   page; confirm pleine terre 15 % and the drawn 22 m; the envelope in 3D;
   the sheet printed; the assistant asked "can I add a storey?" and "what
   green space must I keep?".
3. **P2 Gordes:** extraction; the extension cap measured against the
   existing building; the AC2 flag on the sheet.
4. **P3–P5:** extraction not offered, with the reason; P4's variation
   comparison; P5's sheet.
5. **The service down** (`docker compose stop` the companion): Extract says
   the service is unavailable, by name; Phase 1 reading continues.
6. **Isolation probe** (096.8a): from inside the `plugin-services`
   container, a request to `web`'s `/api/share/` answers **403** (refused),
   recorded with the command used.

Each line is written in this outcome and in 096.14's with the same words.

---

# Expected values

**To be completed before running** (contract). Values known from the
proposal and 002.3/002.4 are filled; `☐` marks what step 1 fills by reading
the PDF, with the method.

## P1 — Lyon 2e, UCe1b (`200046977_PLUi_20260326`)

| Item | Expected | Source of the expectation |
| --- | --- | --- |
| Document | GPU id `4f3ddc27a9611b4bc94fa161443b8e86`; file `200046977_reglement_20260326.pdf` via `/document/{id}/files/{nomfic}` | probe 2026-10-19; proposal §4.3 |
| Zone chapter (outline) | **UCe1, PDF pp. 121–144** (outline entries « Zone UCe1 » p. 121, « Zone UCe2 » p. 145); printed page = PDF page − 2 | 002.5's probe; proposal §15 |
| Rule articles | within PDF pp. 121–144 ☐ each page confirmed in step 1 (the brief's "pp. 131–140" is not borne out by the outline) | 002.5's probe; step 1 |
| `green_ratio` | **pleine terre ≥ 15 %**, base `plot_area`, `written`, `to_confirm`; page ☐ (within 121–144), passage ☐ | brief; step 1 reads the passage |
| `footprint_ratio` | **not regulated**: a `written` rule with `statement: 'not_regulated'` (096.2), with its passage; Surfaces shows "not regulated" and still the figures (US-06) | brief; 002.3 step 10 ("CES not regulated") |
| `height_facade` | drawn 22 m (« Hauteur Max-22 », 002.4 P1), relabelled from `height_total` because the written rule (art. 2.5.1.1) says drawn heights are façade heights (002.6b DEC-5); the written `see_graphic` rule defers to it, never overrides | proposal §5.2; 002.6 |
| `road_setback`, `boundary_setback`, `building_distance` | ☐ value, conditions and exceptions as written | step 1 |
| `parking` | ☐ | step 1 |
| Not on the sheet as "compliant" | — | proposal §5.3 |
| The two "15 %" | emprise used 15 % of the plot (measured, 002.3 criterion 3) is shown apart from pleine terre ≥ 15 % (limit); tests assert on kind and role | 096.14 DEC-2 |
| Envelope (3D) | from confirmed rules only: the drawn 22 m and, if confirmed in the walk, the setbacks; applied / not applied / assumptions listed | US-04 |
| Assistant, "can I add a storey?" | answer cites the drawn 22 m (`height_facade` after 002.6b's relabel, the prescription) and the design's measured 12.00 m (002.4 DEC-3); says the floor count depends on the floor-to-floor height (an assumption) | US-07 |
| Assistant, "what green space must I keep?" | cites pleine terre 15 %, page ☐; if unconfirmed, says so | US-07 |

## P2 — Gordes, zone A (`84050_PLU_20241017`)

| Item | Expected | Source |
| --- | --- | --- |
| Document | GPU id `703e6c2a3130ed9396d8100fde318c2e`; zone `datvalid` 2022 under the 2024 `idurba` (both stored) | probe; proposal §4.3 |
| Zone chapter | zone A, pages ☐ | step 1 |
| `extension_max` | ☐ (e.g. "≤ 30 % of the existing emprise and ≤ 50 m²", proposal §5.4 is an example, not Gordes' text) | step 1 |
| `annex_max` | ☐ | step 1 |
| `height_total` | ☐ | step 1 |
| Extension check | the 6 × 7 m extension (002.4 DEC-3) against the confirmed cap → ☐ | computed from 002.4's existing emprise |
| Sheet | AC2 site inscrit flag; the extension cap's line | US-09 |

## P3–P5

| Plot | Expected |
| --- | --- |
| P3 Mouzay | No extraction offered: "carte communale: no written regulation on the GPU"; envelope from R.111-16/17 (as confirmed in 002.4) |
| P4 Brouennes | No extraction offered: "RNU"; the comparison shows variation A **1** potential issue (R.111-17, 2.50 < 3.00) and variation B **0**, with the same count of rules checked; the parked one measured |
| P5 Rochefort | No extraction offered: "plan not on the GPU"; the sheet names that state and lists only the AC4 flag and any entered rule; the assistant asked a rule question says no regulation is published and offers hand entry, citing nothing |

---

# Steps

1. **Hand check** (a person): open each règlement at the zone's chapter;
   fill the `☐` with value, page and the key phrase of the passage; record
   the PDF's sha256 and the date. **Commit the expectations.**
2. **Record** with `record-fixtures.mjs --extraction` (DEC-3) on the owner's
   deployment's 096.7 route. Commit the fixtures.
3. **End-to-end tests**, one per plot, from recorded GPU answers + recorded
   extraction → the report → asserted against the tables, using DEC-4's
   judgement. Mouzay, Brouennes, Rochefort assert that no extraction request
   is made at all.
4. **Service tests**: the host allow-list refuses a third host; size and rate
   limits answer with their errors; the cache key is the GPU document id and
   `originalName`, compared **case-insensitively** with `zone-urba.idurba`
   (Current state). _(Since the Phase 2 review: the document cache is keyed
   by `upper(idurba)/nomfic`, 002.5a DEC-5; the extraction cache by document
   and chapter pages, 002.5b DEC-3.)_
5. **Index**: `build-index.mjs` and `check-index.mjs` against a platform with
   096.12 (SDK 1.32, which the package now declares).
6. **The joint walk** (DEC-5).
7. **Close**: outcome, the proposal's status line (the owner's edit), the
   README and `CLAUDE.md` (the capability table, the companion service), and
   096.14's outcome in the same words.

# Acceptance criteria

1. The expected-value tables are complete and committed before the first
   recording (git history shows the order).
2. `node --test fr-urban-rules/tests/` and
   `node --test services/fr-urban-rules-service/tests/` pass with no network: the
   throwing `fetch` is installed for both suites.
3. P1: every row of its table holds on the recorded extraction, by DEC-4;
   pleine terre 15 % and "footprint not regulated" are `written` rules with
   their passage and page.
4. P2: every row holds; the extension cap is measured against the existing
   building, with its base named.
5. P3–P5: no request reaches the 096.7 fake (asserted), and each states its
   reason.
6. A request whose sha256 is not recorded fails the test with the recording
   command to run (DEC-2).
7. `--check --extraction` on the walk's day reports the PDF hash and page
   range unchanged, or each difference explained (a new GPU version, 002.10's
   territory).
8. The walk's five steps (DEC-5) recorded, in the same words as 096.14.
9. `dist/index.json` lists `com.archisimple.fr-urban-rules` at 002.8's version
   with the SDK it declares; `check-index.mjs` reports no issue.

# Testing strategy

- **End-to-end on recorded inputs**, one per plot, both suites.
- **Recorded model answers only**; the live model only in `--live-model` and
  the walk.
- **Manual:** the joint walk on two deployments.

# Risks

- **A new document version** between step 1 and the walk (Lyon published 25
  versions since 2022). The PDF's sha256 changes; expectations are re-read
  for the changed pages only, with the reason.
- **Prompt or schema change after recording** breaks the sha256 match by
  design; the owner re-records, which costs model calls.
- **Licence of the PDF text.** `chapter.txt` quotes the règlement. Etalab 2.0
  is assumed for the GPU (proposal §4.3); if it is not confirmed, commit only
  the hashes and keep `chapter.txt` out of the repository, recorded locally.
- **Model variation across providers.** The recording is from one provider;
  a deployment using another may differ. The walk's live run shows it.

# Questions for the owner

1. **Which model records the fixtures** — the NAS's configured provider or a
   local one? Recommended: the provider the deployment will use.
2. **May `pages.jsonl` (formerly `chapter.txt`) be committed** (quoted regulation text), or only
   hashes? Recommended: committed, once the licence is checked.
3. **Gordes' caps**: do you know the zone A text, or should step 1 read it
   cold?

# Definition of Done

Expectations committed before recordings; the criteria walked; the two
extractions judged by DEC-4; the joint walk recorded here and in 096.14; the
index green.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| 002.4 | The pinned plots, GPU fixtures, captures, `record-fixtures.mjs` |
| 002.5a | The companion service: gateway, fetcher, allow-list, chapter lookup, document cache |
| 002.5b | Extraction jobs, result cache by document and chapter, `record-fixtures.mjs --extraction` |
| 002.6a | The zone page link |
| 002.6b | `written` rules in the report with page, passage, conditions |
| 002.7 | Envelope volume and sheet content |
| 002.8 | Assistant tools, per-variation checks, the network list on the card |
| 096.7 | The structured-output route (ai-service contract **1.2.0**) |
| 096.8a | `/plugins-api/com.archisimple.fr-urban-rules/` behind the deployment's auth (ADR-0114), the `plugin-services` compose profile, the container's isolation |
| 096.8b | `RegulationSource.onDidChange` (002.6b's progress) |
| 096.9–096.13 | The platform surfaces; SDK **1.32** (096.14 Current state) |
| 096.14 | The joint walk and its deployment |

**Version needs:**

- **Package `fr-urban-rules`:** none of its own; it ships at the version
  002.8 leaves (**1.3.0**: 002.6 → 1.1.0 — restated by the Phase 2 review as 002.6a 0.5.0 and 002.6b 0.6.0, so this line awaits restatement — 002.7 → 1.2.0, 002.8 → 1.3.0),
  declaring `sdkVersion` **"1.32"**. A defect fixed here is a patch.
- **`fr-urban-rules-service`:** the version 002.5b leaves (**0.2.0**); a patch
  for a defect.
- **Platform:** none (096.14 records the final values).

---

# Corrections to the README / proposal

1. **Proposal §4.5 gives UCe as pp. 118–158; the brief gives the rules at
   pp. 131–140.** 002.5's (now 002.5a's) probe of the outline settles the chapter: UCe1 is
   PDF pp. 121–144 (printed = PDF − 2). Step 1 confirms each article's page
   within it. Recorded in the proposal's §15 at the reconciliation.
2. **`idurba` case.** The GPU document API and API Carto's `document` give
   `200046977_PLUi_20260326`; API Carto's `zone-urba` gives
   `200046977_PLUI_20260326`. Proposal §8's "a confirmation whose `idurba` no
   longer matches reopens its rule" must compare case-insensitively, or every
   Lyon confirmation reopens on a casing difference.
3. **The proposal's §5.4 example caps** ("≤ 30 % … ≤ 50 m²") read like
   Gordes' values in 002.4's P2 table. They are examples; Gordes' are read in
   step 1.
4. **Proposal §12 Phase 2–3 "not drafted"** is stale.
5. **"15 %" twice on Lyon** (096.14 DEC-2): measured emprise vs pleine terre
   limit; the mockup and US-06 should name the role beside the figure.

# Reconciliation (2026-10-19, phases 2–4)

- Status and Prerequisites: "096.9–096.8" (a renumbering artefact) reads
  096.7–096.13.
- DEC-2, criterion 2: the service's fixtures live under
  `test-fixtures/fr-urban-rules/<plot>/{regulation,extraction}/` (002.5a
  DEC-12, 002.5b DEC-11, Phase 2 review 2026-10-20; this replaced
  `services/fr-urban-rules-service/tests/fixtures/`); pages are PDF page
  indexes, with no markers in the text.
- DEC-5 step 1: the card lists the browser's hosts and names the companion
  as "this deployment's service" (096.13 DEC-7, 002.8 DEC-9), not as a host.
- P1 table: Lyon's chapter is UCe1, PDF pp. 121–144 (printed = PDF − 2), from
  002.5a's outline probe; `footprint_ratio` is a `not_regulated` statement;
  the drawn 22 m is `height_facade` after 002.6b's relabel.
- Step 5, Dependencies, Version needs: SDK **1.32**; package **1.3.0**;
  service **0.1.0**; the route names the package id.
- Correction 1 resolved; correction 4 (proposal §12) applied.

# Review (2026-10-20, Phase 2) — references only

- 002.5 is split into 002.5a (Service Gateway and Document Text) and 002.5b
  (Extraction Jobs). 002.6 is split into 002.6a (Zone Page Link) and 002.6b
  (Written Rules Confirmation). 096.8 is split into 096.8a (Plugin Service
  Deployment) and 096.8b (Regulation Source Signal). References are updated
  to name the half they mean.
- **DEC-2's fixtures** move to
  `test-fixtures/fr-urban-rules/<plot>/{regulation,extraction}/`. There are
  no `[p. N]` markers. 002.5b records Lyon itself, so this sprint records
  Gordes and any further plot.
- **DEC-5 gains the isolation probe** (096.8a): 403 on `/api/share/` from
  the container.
- **Versions** are restated from 0.4.0: 002.6a is 0.5.0, 002.6b is 0.6.0,
  and the service is 0.2.0 after 002.5b. This sprint's package line awaits
  its own restatement.
