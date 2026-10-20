# Sprint 002.7 — Envelope and Sheet Content

> **Status:** **Draft (2026-10-19)** — nothing implemented.
>
> **Version:** 1.0
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules` →
> **1.2.0** (after 002.6's 1.1.0; 002.4 closed Phase 1 at 1.0.0) — _the Phase 2 review (2026-10-20) restated 002.6a–b as 0.5.0 and 0.6.0 from 0.4.0; this number is restated when this sprint is reviewed_.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> Phase 3. US-04 ("drawn on the plan (phase 1) and as a translucent volume in
> 3D (phase 3)"; "built from confirmed rules only"; "labelled as a
> theoretical envelope, never as 'buildable'"), US-09 (the summary sheet),
> § 10 (the scope sentence on the sheet). The mockups' Screens 4 and 7. The
> platform README's § 3 row: "the FR report's envelope volume and its sheet
> content".
>
> **Prerequisites:** 002.1a–b (coded rules, edge roles, the opposite
> alignment, the checks), 002.2 (confirmed rules, the plan envelope, its
> Properties), 002.3 (the capacity reads the envelope's ground area), 002.4
> (the reference plots and their fixtures), 002.6b (written rules confirmed,
> which feed the envelope like any other). Platform: **096.9** (SDK 1.29:
> `RegulationFeature.volume`, its ceilings) and **096.10** (SDK 1.30:
> `RegulationReport.sheet`, the `plot-plan` block, `checks.unchecked`).
>
> **Sizes:** the volume composed from confirmed rules, the sheet's blocks,
> two locales' strings, tests. No platform change. Medium.

---

# Sprint Design Contract

- [ ] **Confirmed rules only** (US-04). A rule `to_confirm`, `not_evaluable`
      or `information` never shapes the volume; it is listed as not applied,
      with its reason.
- [ ] **The extension states geometry; the host draws it.** The volume is
      an outline and ceilings in the Site's CRS (096.9 DEC-1). No height is
      computed against a terrain here: the host evaluates the ceilings over
      the ground it draws.
- [ ] **Reuse, don't recompute.** The outline is 002.2's plan envelope (the
      Site boundary inset per edge role); the edge roles are 002.1a's; the
      opposite alignment is 002.1b's; the checks on the sheet are the report's
      own. Nothing measured twice.
- [ ] **Assumptions said, every time.** The height reference, the alignment,
      the edge roles, the approximations of the volume and what it cannot
      draw are assumptions in the report, listed in the Envelope view and on
      the sheet.
- [ ] **Never "conforme", never "constructible" for the envelope.** No
      string calls the envelope buildable or a design compliant; the result
      vocabulary stops at `no_issue` (proposal § 5.3). The carte communale's
      own "secteur constructible" is quoted as the document's term, not
      ours.
- [ ] **Every sheet string prints.** Every string the sheet can carry is in
      the sheet writer's encoding (WinAnsi; 096.10 DEC-7): no `≥`, `≤`, `Δ`.
- [ ] **Plain ESM, tokens by name** (the repository's rule): no import of the
      SDK, no bundler.

---

# Current state

After 002.0–002.4 (drafts, not implemented) and 002.5a–002.6b (Phase 2,
drafted in parallel):

- **The plan envelope** exists as a feature of category `envelope`,
  `official: false`:
  - under a PLU (002.2 DEC-7): "the Site boundary inset by each confirmed
    setback on its edges, at the confirmed height as a label";
  - under the RNU (002.1b DEC-5): two bands per edge (the 3 m minimum and the
    band at the design's current height), and an envelope "at a stated
    height H (the tallest building's current height)", because R.111-16 and
    R.111-17 depend on the height of each point.
- **The Envelope view** (002.2 DEC-7) lists the rules applied, the rules not
  applied (to confirm, not evaluable, not geometric) and the assumptions
  (edge roles, the alignment).
- **The edge roles** street / side / rear, derived from the roads and
  correctable by the user (002.1a DEC-3), and **the opposite alignment** as a
  derived `alignment` feature, from an EL7 easement, the cadastral parcels
  across the road, or the carriageway's far edge (002.1b DEC-1).
- **The checks** per building of the open design (002.1a DEC-6, 002.2
  DEC-7, 002.3), with `figure` for 096.5's Show on plan.
- **The capacity** (002.3 DEC-5) uses the envelope's ground area.
- **No sheet.** The report declares no `sheet`; 096.10 offers none without
  one.
- **Strings** are in `resources/i18n/fr-urban-rules/{fr,en}.json`; the
  report's `attribution` joins the sources' (002.0, "the attributions are
  joined into the report's `attribution`").
- **Platform** (drafts): 096.9 adds `volume` with `height` and `slope`
  ceilings, each optionally `within` rings (≤ 8 ceilings, `rise` ≤ 20,
  heights ≤ 500 m, ≤ 16 volumes; its DEC-2); 096.10 adds `sheet { title,
  blocks, scope? }`, a `plot-plan` block, `checks.unchecked`, and prints a
  header (read time, document, version) and a footer (sources, attribution,
  the host's scope sentence) of its own (its DEC-4).

---

# Goal

From the confirmed rules, the report's envelope carries a volume the editor
draws in 3D — slopes for the height-relative rules, a height for the
height limits, inside the inset outline — with its applied rules, rules not
applied and assumptions in the Envelope view; and the report declares the
regulation sheet's content: the plot, the document and the zone's version,
the flags, the rules table with limit, measured, result and source, the plot
plan with the layers, the assumptions, the scope sentence and the licence.

# Out of scope

- **New rules or measures.** The envelope composes what 002.1a–b, 002.2 and
  002.6b already confirm.
- **Painting what pokes out** of the envelope (096.9 DEC-9).
- **A maximum volume in m³** (Screen 4's "Max. volume"): it needs the ground
  under every point (correction 3).
- **A sheet per variation**: the platform prints the open design's (096.10
  DEC-9); per-variation checks are 002.8's, for 096.11.
- **The assistant** (002.8), **regulation watch** (002.10).
- **Roof profiles and appearance** (pente, gabarit de toiture written in
  prose): `not_evaluable`, listed.

---

# Decisions

## DEC-1 — The outline: 002.2's inset, one rule per edge

The volume hangs off the existing `envelope` feature (096.9 DEC-1), so the
plan's dotted outline and the 3D solid are one item. Its `rings` are
computed by 002.2's inset function, extended to take, **per edge role, the
largest confirmed minimum distance**:

| Edge role | Inset by |
| --- | --- |
| street | a confirmed `road_setback` with a `value` limit; a `height_relative` road setback's `minimum`; else 0 |
| side, rear | a confirmed `boundary_setback` with a `value` limit for that role; a `height_relative` one's `minimum` (R.111-17: **3 m**); else 0 |

- **Under the RNU** (side and rear are one rule, 002.1a DEC-3) every
  non-street edge is inset 3 m, the street edge 0. This **replaces** the former 002.1
  DEC-8's (since split: bands 002.1b DEC-5, envelope outline here) "envelope at a stated height H": the height dependence moves into
  the ceilings (DEC-2), where it belongs. 002.1b's bands per edge stay as
  they are.
- **Two confirmed values on one edge** (drawn and entered, or written and
  drawn): the larger, both named in the applied rules (002.2 DEC-8's
  "the stricter, naming both").
- **A collapsed inset** (the setbacks leave no ground, or the offset ring
  self-intersects on an irregular boundary): **no volume and no outline**;
  the Envelope view shows a `notice`: "Les reculs confirmés ne laissent pas
  de surface au sol" or "La forme de la limite du site ne permet pas de
  tracer l'enveloppe", never a silent absence.

## DEC-2 — The ceilings, rule by rule

| Confirmed rule | Ceiling | Assumption added |
| --- | --- | --- |
| R.111-17, or any `boundary_setback` with `height_relative` `factor` k | `slope`, `from` the **non-street chain(s)** of the Site boundary (contiguous runs of side and rear edges, as polylines), `rise` = 1/k, `start` 0 | "Measured from the ground at the nearest point of the Site boundary, as the limit." |
| R.111-16, or any `road_setback` with `height_relative` factor k | `slope`, `from` the **opposite alignment** line of each street edge (002.1b DEC-1), `rise` = 1/k | The alignment's own assumption (EL7, cadastral parcels across the road, or the carriageway's far edge, "stricter than the rule") |
| A required setback line (CNIG 15) that replaces the alignment (R.111-16) | `slope` from that line instead | "The required setback line replaces the alignment." |
| A `road_setback` or `boundary_setback` with `height_relative`, `reference: 'facade_height'` (002.6b: « R ≥ Hf − 4 m, min 2 m », « D ≥ Hf/2 ») | `slope` from the edges of its role (chains as above, or the alignment), `rise` = 1/factor, `start` = −offset/factor (« R ≥ Hf − 4 m » → rise 1, start 4); its `minimum` insets the outline on those edges (DEC-1). **Applied only when 096.9 can express it**: `offset` ≤ 0 (so `start` is in [0, 500]) and `rise` ≤ 20; otherwise **not applied**, "a façade-relative limit with a positive offset (or a factor under 0.05) cannot be drawn as a ceiling", and still checked (002.6) | "The rule limits the façade height; the volume draws it as a ceiling over the whole building, which is stricter than the rule for a roof rising behind the façade." |
| `height_total` with a `value` limit, over the whole plot | `height`, `metres` = the limit | "Height measured from the ground at each point (the terrain drawn), not from a façade's foot." |
| `height_total` from a drawn prescription (CNIG 39) | `height` `within` the prescription's rings | "Applies where the prescription is drawn." (002.2 DEC-7) |
| `height_facade` | **not applied**: "limits the eaves, which a volume over the roof cannot draw" | — |
| `building_distance` (R.111-15), `footprint_ratio`, `green_ratio`, `floor_area_max`, `extension_max`, `annex_max`, `parking` | **not applied**: "a budget or a distance between buildings, not a place" (proposal § 5.4) | — |
| R.111-28 (`information`), L.111-3 (`not_evaluable`), appearance, roofs | **not applied**, with their status | — |

- **Why a chain and not each edge**: R.111-17 measures to "the nearest point
  of the limit". A polyline's nearest point is the limit's; one slope per
  edge would take the lowest of several, which is stricter than the rule.
  A corner plot has two street edges and may leave two non-street chains:
  one slope each.
- **The adjoining alternative** (R.111-17: "unless the building adjoins the
  limit"; 002.1a DEC-6) is not drawn: the volume shows the case of a building
  set back. Said as an assumption: "A building on the limit is exempt from
  this rule on that edge; the envelope does not draw that case."
- **R.111-18 and R.111-19** stay exception notes on their rules, listed with
  them, never applied.
- **No confirmed rule that shapes a ceiling**: no volume; the plan outline
  stays (if any inset applies) and the view says "Aucune règle de hauteur
  confirmée : pas de volume".
- **The limits are 096.9's**, mirrored as constants in the package with a
  comment naming 096.9 DEC-2: ≤ 8 ceilings (the extension merges `height`
  ceilings by keeping the lowest over the same area), `rise` ≤ 20 (a factor
  of 0.05), heights ≤ 500 m. A volume the extension would build past them is
  not built and is said.

## DEC-3 — Per regime

| Regime (002.0 DEC-8) | Envelope |
| --- | --- |
| `rnu` | DEC-1's 3 m inset; R.111-16 and R.111-17 slopes; L.111-3's "built-up parts" not evaluated, listed |
| `cc`, constructible sector | as `rnu`, without L.111-3 |
| `cc`, non-constructible sector | **none**: the flag "construction restricted in this sector" (002.1a DEC-2) stands; the view says why |
| `plu`, `plui` | the confirmed drawn, written and entered rules of DEC-1 and DEC-2 |
| `not_published` | **none**: no rule is invented; the view says "plan not on the GPU" |
| `unknown` | **none**: the source did not answer; never read as RNU |

## DEC-4 — The Envelope view

002.2's view gains, in its existing blocks:

- **Applied**: each rule that shaped the outline or a ceiling, with what it
  did ("Recul arrière 4,00 m — limite du site", "Hauteur 22 m — dans le
  périmètre de la prescription", "R.111-17 — pente 2 pour 1 depuis les
  limites latérales et de fond").
- **Not applied**: DEC-2's rows, each with its reason, and every rule still
  `to_confirm` ("à confirmer").
- **Assumptions**: DEC-2's, plus the volume's own: "The 3D volume is
  sampled every metre: its top is never above the confirmed rules, and its
  steps are drawn as slopes about a metre wide" (096.9 DEC-3), and "The
  checks, not the volume, say whether the design is within the rules."
- **Figures** (`fields`): the envelope's ground area (the outline's area,
  shoelace, holes removed), the confirmed heights. No volume in m³.
- **Shown in 3D** is the host's (096.9 DEC-8); the view adds nothing for it.

## DEC-5 — The sheet's content

`report.sheet`, built by a pure `sheetOf(report, context)`:

- **`title`**: `{ key: 'fr-urban-rules.sheet.title' }` — "Règles
  d'urbanisme (PLU)" / "Planning rules (PLU)".
- **`blocks`**, in Screen 7's order:
  1. `fields` **Parcelle**: the commune (text), the parcels' identifiers
     (text, verbatim), the plot area (the Site view's `plotArea`, a
     quantity), the zone (the source's label). The host's header already
     prints the document, its version and date (096.10 DEC-4); this block adds
     **the zone's own date** when it differs (Gordes, 002.2 DEC-4: a zone's
     `datvalid` is not its document's).
  2. `flags` — ABF, PPR, World Heritage, and the CC sector flag.
  3. `notice` when the regime is `not_published` ("Plan non disponible sur le
     Géoportail de l'Urbanisme : aucune règle locale n'est présentée") or a
     source failed ("Source indisponible : … ; les règles qu'elle porte ne
     sont pas présentées").
  4. `checks` with `unchecked: true` over every rule of the zone: the
     table Rule · Limit · Measured · Result · Source, a "(non confirmée)"
     mark from the host for a rule not confirmed, and every rule without a
     check as "Non vérifiée".
  5. `notice` with the count of rules not checked automatically ("2 règles
     n'ont pas pu être vérifiées automatiquement"), when any.
  6. `plot-plan`, categories `zone`, `prescription`, `easement`, `risk`,
     `alignment`, `setback-band`, `envelope`; caption "Plan de la parcelle :
     zone, prescriptions, servitudes, bandes de recul et enveloppe
     théorique (contour)".
  7. `assumptions` — every assumption of the report (edge roles, the
     alignment, the height reference, the site boundary as the parcel limit,
     the envelope's approximations).
- **`scope`**: "Aide à la conception, et non décision administrative. Ce
  document ne remplace pas l'instruction d'une demande par l'autorité
  compétente." / "An aid to design, not an administrative decision. It does
  not replace the competent authority's review of an application." The host
  prints its own sentence beside it (096.10 DEC-4); both stay.
- **No `sources` block**: the host's footer prints the report's `sources`
  and `attribution` (096.10 DEC-4); a second list would repeat it.
- **The attribution** is 002.0's joined string, unchanged: "Géoportail de
  l'Urbanisme, API Carto (IGN), Géorisques, BD TOPO — Licence Ouverte 2.0"
  (the sources actually read, as 002.0 joins them).
- **No sheet** when the regime is `unknown` and nothing was read: the host
  then offers none (096.10 DEC-2), which is right — there is nothing to
  print but a failure the row already shows.

## DEC-6 — Printable words

- Every string reachable from `sheetOf` is a key under
  `fr-urban-rules.sheet.*` or `fr-urban-rules.envelope.*`, or a source's
  text. A test reads `fr.json` and `en.json` and asserts every
  `fr-urban-rules.sheet.*` value is WinAnsi (the platform's
  `unicodeToWinAnsi` table, copied as a set of code points with a comment
  naming `packages/sheet-writer/src/winAnsi.ts`; this repository imports
  nothing from the other).
- **Limits in the extension's own words** avoid `≥`, `≤` and `Δ` on the
  sheet: a `described` limit's phrase says "au moins 4 m", never "≥ 4 m".
  Numeric limits are the host's to print (096.10 DEC-7).
- **A source's text** (a quoted passage, a zone label) with a character
  outside WinAnsi prints `?` and is reported by the host's writer; the walk
  (step 6) records any found on the reference plots.

## DEC-7 — The open design, said

The sheet's checks are the report's, for the open design (096.10 DEC-9).
`sheetOf` adds nothing about variations; the host's header names the
design. 002.8 adds per-variation checks (`checkVariation`) for 096.11's
figures; a sheet per variation built on them is a later platform decision
(096.10 DEC-9), which would need no change here.

## DEC-8 — The manifest

- `sdkVersion` **`"1.30"`** (from 002.6b's 1.28): the volume (1.29) and the
  sheet (1.30). An image without 096.9 and 096.10 refuses the package with a
  reason rather than dropping its fields (the repository's rule for
  `sdkVersion`).
- Capabilities unchanged (`regulations`, `document`, `ai`): the volume and
  the sheet are report content.
- **Lockstep**: the plugins image ships this version only with a web image
  carrying 096.9 and 096.10. `check-index.mjs` runs against a platform
  checkout that has them (002.4's job).

---

# Steps

1. **The inset per role** (DEC-1): 002.2's function takes a distance per
   edge; collapse and self-intersection detected and said; tests on the
   reference plots' boundaries and on a concave L-shaped boundary.
2. **The ceilings** (DEC-2): `ceilingsOf(confirmedRules, boundary, edges,
   alignments, prescriptions)`, the chains, the merge under 096.9's limits;
   table tests, one row per rule kind.
3. **Per regime** (DEC-3) and **the Envelope view** (DEC-4).
4. **The sheet** (DEC-5): `sheetOf`, its blocks per regime; snapshot tests
   per reference plot.
5. **Strings** (DEC-6): both locales; the WinAnsi test; the "never
   conforme" test.
6. **The walk**, recorded: Lyon AB0105 (drawn 22 m within its prescription,
   a 4 m rear setback entered — Screen 4), Brouennes AB0280 and Mouzay (RNU
   and CC: slopes, 3 m inset), Rochefort (not on the GPU: no envelope, the
   sheet's notice); 3D in both themes with `shoot`; one sheet printed and
   downloaded per plot, the PDF opened in two readers.
7. **Manifest and index** (DEC-8); README and CHANGELOG.

# Acceptance criteria

1. On Brouennes (RNU), the envelope's outline is the Site boundary inset 3 m
   on side and rear edges and 0 on the street edge, and its volume holds one
   `slope` of `rise` 2 from the non-street chain and one of `rise` 1 from the
   opposite alignment (test on the recorded fixture).
2. On Lyon, with « Hauteur Max-22 » confirmed and a 4 m rear setback entered,
   the volume holds a `height` of 22 `within` the prescription's rings and the
   outline is inset 4 m on the rear edge (test).
3. A rule `to_confirm` shapes nothing and is listed "à confirmer" under Not
   applied; confirming it adds its ceiling or inset on the next read; undo
   removes it again (test with 096.4's section, by `applySection`).
4. `height_facade`, the budgets, R.111-15, R.111-28 and L.111-3 are listed
   under Not applied, each with DEC-2's reason (test).
5. Setbacks that consume the plot, and a boundary whose inset
   self-intersects, give no outline and no volume and a notice (tests).
6. `not_published`, `unknown` and a non-constructible CC sector give no
   envelope, and the view says why (tests).
7. Every volume respects 096.9's limits: ≤ 8 ceilings, `rise` in (0, 20],
   heights in (0, 500], `from` ≥ 2 points; a merge keeps the lowest of two
   `height` ceilings over the same area (test).
8. The Envelope view shows the ground area, the confirmed heights, the
   applied and not applied rules and DEC-4's assumptions, and no volume in
   m³ (snapshot).
9. `report.sheet` on Lyon holds, in order: the plot fields with the zone's
   own date, the flags, the checks with `unchecked`, the not-checked
   notice, the plot plan with DEC-5's categories and caption, the
   assumptions; and the scope phrase (snapshot).
10. On Rochefort the sheet holds the "plan non disponible" notice and no
    rule is invented; on `unknown` with nothing read, no sheet (tests).
11. Every `fr-urban-rules.sheet.*` and `fr-urban-rules.envelope.*` value in
    both locales is WinAnsi, and none contains « conforme », « autorisé » or
    "compliant", nor calls the envelope « constructible » (tests).
12. The manifest declares `sdkVersion` `"1.30"`;
    `node --test fr-urban-rules/tests/` passes; the walk of step 6 is
    recorded with its pictures and PDFs.

# Testing strategy

- **Pure functions** (`insetByRole`, `ceilingsOf`, `envelopeOf`, `sheetOf`)
  over 002.4's recorded fixtures, under `node --test`, no install.
- **Strings**: the locales read as JSON; the WinAnsi set and the forbidden
  words.
- **In the editor**: the walk of step 6, recorded by hand (002.4's method);
  no automated browser test in this repository.

# Risks

- **The volume reads as a right.** Mitigation: "théorique" in the label,
  the scope sentence on the sheet, the "checks, not the volume" assumption,
  and the host's refusal to paint "outside" (096.9 DEC-9).
- **An irregular boundary breaks the inset.** Detected and said (DEC-1);
  the reference plots are the test, plus a concave case.
- **Height references differ by PLU** (natural ground at the façade's foot,
  the road's level). The assumption says which one the volume uses; a PLU
  that defines another is read by the user, as for the checks (002.2 DEC-7).
- **The shapes of 096.9 and 096.10 are drafts.** This sprint is their first
  consumer; its review is where they change, before 1.29 and 1.30 ship.

# Questions for the owner

1. **The RNU envelope as slopes.** Recommended: the volume shows the true
   R.111-16 / R.111-17 shape (heights grow with the distance to the limits)
   rather than the former 002.1b DEC-5's single "height H". The plan keeps the 3 m
   outline. Agreed?
2. **The adjoining case** (R.111-17's "unless it adjoins the limit"):
   recommended **not drawn**, said as an assumption. Draw a second volume for
   it?
3. **The scope sentence's wording**, in French: "Aide à la conception, et
   non décision administrative. Ce document ne remplace pas l'instruction
   d'une demande par l'autorité compétente." Yours to change.

# Definition of Done

The criteria walked against the code; the Design Contract boxes checked;
`node --test fr-urban-rules/tests/` green; the walk of step 6 recorded with
its pictures and PDFs; README and CHANGELOG updated.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| **096.9** (SDK 1.29) | `RegulationFeature.volume`, `height` and `slope` ceilings with `within`, `start`; the registry's limits (its DEC-2); the host's evaluation over the drawn ground; **Shown in 3D** |
| **096.10** (SDK 1.30) | `RegulationReport.sheet { title, blocks, scope? }`; the `plot-plan` block; `checks.unchecked`; the host's header and footer (read time, document, sources, attribution, its own scope sentence); WinAnsi paper words for numeric limits |
| **096.5** | The `envelope`, `setback-band` and `alignment` roles drawn derived; the categories the plot plan reuses |
| **096.4** | Confirmations and entered rules in the section, so a confirmation reshapes the envelope with undo |
| **096.1 / 083.12** | The Site boundary ring in the Site view, and `plotArea` |
| **002.1a–b, 002.2, 002.6b** | Edge roles, the opposite alignment, the inset, confirmed rules of every provenance |
| **002.8 / 096.11** | Per-variation checks for the variation figures; a sheet per variation is a later platform decision (096.10 DEC-9) |
| **Lockstep** | The plugins image ships this version with a web image carrying 096.9 and 096.10 |

# Corrections to the README / proposal

Not applied to the platform README or the proposal (the owner's).

1. **Proposal § 8, `PlanningRule.limit` "`height_relative` … expresses
   R.111-16 (factor 1) and R.111-17 (factor 0.5, minimum 3 m)"**: right for
   the checks, but the **envelope** needs the same rules as geometry — a
   slope rising from a line — which the report now carries as a ceiling
   (096.9 DEC-1). The rule and its ceiling are two forms of one confirmed
   value, both the extension's.
2. **archisimple-plugins 002.1b DEC-5**, "the theoretical envelope under the
   RNU … at a stated height H": superseded in 3D by slopes (DEC-1, DEC-2);
   the plan outline becomes the 3 m inset, and the "stated height" label is
   dropped. 002.1b's bands per edge stand.
3. **Mockups, Screen 4, "Max. volume 20 400 m³"**: not computed; the
   extension reads the ground one point at a time (096.1 DEC-5) and the host
   computes no regulatory figure. The ground area is shown.
4. **Mockups, Screen 4, "The street side is the Site boundary edge facing
   Rue de la République"** is the right wording (002.1a correction 5); Screen
   7's "The Site boundary starts as the cadastral outline, which is not a
   survey" is kept as an assumption on the sheet.
5. **Mockups, Screen 7, "Variations: Main, Recul 4 m"**: the sheet reports
   the open design only; 096.11 and 002.8 give per-variation checks, and a
   sheet per variation is a later decision (096.10 DEC-9).
6. **Proposal § 10, "The summary sheet carries this sentence"**: it carries
   two — the extension's French sentence and the host's own, which the host
   prints for every country (096.10 DEC-4).
7. **Platform README § 3, 002.7 row ("the FR report's envelope volume and its
   sheet content")** omits that the package's `sdkVersion` moves from 002.6b's
   1.28 to **1.30**, and that this is a lockstep release with the web image.
   Applied at the reconciliation.

# Reconciliation (2026-10-19, phases 2–4)

- Repository line: package **1.2.0** firm (002.6 took 1.1.0; the Phase 2 review restated 002.6a–b as 0.5.0 / 0.6.0, to be carried here when reviewed).
- Prerequisites, DEC-8, criterion 12, Risks, Dependencies, correction 7:
  096.9 is SDK **1.29** and 096.10 **1.30** (096.8a–b took 1.28 ahead of them);
  the manifest declares `sdkVersion` **"1.30"**, from 002.6b's 1.28.
- DEC-7, Dependencies, correction 5: 096.11 and 002.8 give per-variation
  checks, not a sheet per variation; that stays a later platform decision
  (096.10 DEC-9 as reconciled).
- DEC-2 (follow-up): façade-relative setbacks (096.2's `reference:
  'facade_height'` with `offset`, read by 002.6b) are applied as slopes
  (rise 1/factor, start −offset/factor, the minimum as an inset) where
  096.9's ceilings can express them (offset ≤ 0, rise ≤ 20), with the
  "stricter than the rule over a roof" assumption; otherwise listed as not
  applied with the reason, and still checked.
