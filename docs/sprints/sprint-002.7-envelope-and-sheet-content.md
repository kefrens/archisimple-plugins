# Sprint 002.7 — Envelope and Sheet Content

> **Status:** **Implemented and reviewed (2026-10-21, uncommitted).** Drafted
> 2026-10-19, reviewed against the code 2026-10-20 (**Review against the code
> (2026-10-20)**); what landed, what did not and what the draft claimed that
> was false are in **Outcome (2026-10-21)**, and the independent review's
> findings and fixes in its **Review (2026-10-21)**.
>
> **Version:** 1.1 (reviewed)
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules` →
> **0.7.0** (the next minor after 0.6.1, the PLUi-in-sectors fix that
> followed 002.6b's 0.6.0; restated from the draft's 1.2.0, which assumed
> 002.4 at 1.0.0 — the Phase 2 review kept 1.0.0 for the first published
> version).
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> Phase 3. US-04 ("drawn on the plan (phase 1) and as a translucent volume in
> 3D (phase 3)"; "built from confirmed rules only"; "labelled as a
> theoretical envelope, never as 'buildable'"), US-09 (the summary sheet),
> § 10 (the scope sentence on the sheet). The mockups' Screens 4 and 7. The
> platform README's § 3 row: "the FR report's envelope volume and its sheet
> content".
>
> **Prerequisites** (all implemented, 0.6.1, except the platform's two):
> 002.1a–b (coded rules, edge roles, the opposite alignment, the checks),
> 002.2 (confirmed rules, the plan envelope on a convex boundary), 002.3 (the
> capacity reads the envelope's ground area), 002.4 (the reference plots and
> their fixtures), 002.6b (written rules confirmed, which feed the envelope
> like any other). Platform (reviewed drafts, 2026-10-20): **096.9** (SDK
> 1.29: `RegulationFeature.volume`, its ceilings) and **096.10** (SDK 1.30:
> `RegulationReport.sheet`, the `plot-plan` block, `checks.unchecked`).
>
> **Sizes:** the volume composed from confirmed rules, the sheet's blocks,
> two locales' strings, tests. No platform change. Medium.

---

# Sprint Design Contract

- [x] **Confirmed rules only** (US-04). A rule `to_confirm`, `not_evaluable`
      or `information` never shapes the volume; it is listed as not applied,
      with its reason.
- [x] **The extension states geometry; the host draws it.** The volume is
      an outline and ceilings in the Site's CRS (096.9 DEC-1). No height is
      computed against a terrain here: the host evaluates the ceilings over
      the ground it draws.
- [x] **Reuse, don't recompute.** The outline is 002.2's plan envelope (the
      Site boundary inset per edge role), its inset made to work on a concave
      boundary (DEC-1); the edge roles are 002.1a's; the opposite alignment is
      002.1b's; the checks on the sheet are the report's own. Nothing measured
      twice.
- [x] **Assumptions said, every time.** The height reference, the alignment,
      the edge roles, the approximations of the volume and what it cannot
      draw are assumptions in the report, listed in the Envelope view and on
      the sheet.
- [x] **Never "conforme", never "constructible" for the envelope.** No
      string calls the envelope buildable or a design compliant; the result
      vocabulary stops at `no_issue` (proposal § 5.3). The carte communale's
      own "secteur constructible" is quoted as the document's term, not
      ours.
- [x] **Every sheet string prints.** Every string the sheet can carry is in
      the sheet writer's encoding (WinAnsi; 096.10 DEC-7): no `≥`, `≤`, `Δ`,
      `−` (U+2212), no narrow no-break space (U+202F) — the 606 keys of each
      locale pass that today, and stay so.
- [x] **Plain ESM, tokens by name** (the repository's rule): no import of the
      SDK, no bundler.

---

# Current state

_Re-read 2026-10-20 against `fr-urban-rules` 0.6.1; line numbers are
`fr-urban-rules/src/index.js`'s. The draft's version of this section described
002.0–002.6b's drafts; where they differ, the code is below._

- **The plan envelope** is a feature `{ id: 'envelope', category:
  'envelope', official: false }` built by `envelopeFeature` (`:8062`) from the
  **confirmed `value` setbacks** only (road and boundary, the larger per edge
  role), labelled « Enveloppe des reculs confirmés » or « …, jusqu'à {height}
  m » (the lowest confirmed `height_total`). Its ring is `envelopeRing`
  (`:4266`): the Site boundary cut by each edge's inward **half-plane**
  (Sutherland–Hodgman), exact on a convex boundary only — so since 002.2's
  review fix S5 **it is drawn on a convex boundary only** (`convexRing`,
  `:4298`, a vertex turning inward by more than 0.5°); on a concave one the
  report gets the assumption `envelope-not-convex` and no envelope. The code
  comment says it: "The strip-by-strip inset is 002.7's envelope."
- **All five reference plots' Site boundaries are concave** (counted on
  002.4's `test-fixtures/fr-urban-rules/acceptance/*/site.json`, 2026-10-20:
  Lyon 3 re-entrant vertices of 14, Brouennes 1 of 6, Mouzay 2 of 10, Gordes
  24 of 33, Rochefort 2 of 13). **No envelope is drawn on any of them today**
  — 002.4's walk recorded it ("envelope not drawn on these concave
  boundaries, said as an assumption").
- **Under the RNU and a CC there is no envelope at all.** R.111-16 and
  R.111-17 are coded rules, `confirmed` (`:4570-4600`), but with
  `height_relative` limits, which `envelopeFeature` ignores; R.111-15 is
  `to_confirm`, R.111-28 `information`. 002.1b moved the RNU envelope outline
  to this sprint ("The theoretical envelope outline under the RNU is
  002.7's", 002.1b DEC-5); the draft's "an envelope at a stated height H"
  was never built. What the RNU draws is 002.1b's **bands**: `setback-band`
  lines per edge (`bandsFor`, `:6621`), the 3 m minimum and each check's
  current limit.
- **There is no Envelope view.** The report's views are the overview
  (`:3004`), prescriptions, information, easements, risks (`:3175-3252`),
  rules (`:5637`, `:5792`), checks (`:5482`), the Site boundary edges
  (`:5854`) and the surfaces (002.3, `:8990`), with zone and sector labels.
  002.2 DEC-7's "Properties list rules applied, rules not applied and
  assumptions" for the envelope was not built as a view.
- **The edge roles** street / side / rear, derived from the roads and
  correctable by the user (002.1a DEC-3, the `set-edge-role` action), and
  **the opposite alignment** as derived `alignment` features (002.1b DEC-1:
  an EL7 easement, the cadastral parcels across the road, or the
  carriageway's far edge), each with its assumption.
- **The checks** per building of the open design (002.1a DEC-6, 002.2
  DEC-7, 002.3, 002.6b's façade-relative setbacks), **one per rule per
  building, the worst edge governing** (002.4's follow-up,
  `oneCheckPerBuilding`), with `figure` for 096.5's Show on plan.
- **The capacity** (002.3 DEC-5) uses the envelope's ground area
  (`:8877`, `:9882`) — absent on the five plots today, since no envelope is
  drawn there.
- **No sheet.** The report declares no `sheet`; 096.10 offers none without
  one.
- **Strings** are in `fr-urban-rules/resources/i18n/fr-urban-rules/{fr,en}.json`
  (606 keys each, **all WinAnsi today** — checked 2026-10-20); the report's
  `attribution` joins the sources' (002.0).
- **Manifest** (`fr-urban-rules/package.json`): `version` 0.6.1, `sdkVersion`
  `"1.28"`, capabilities `regulations`, `document`, `ai`, `commands`.
- **Tests** are `fr-urban-rules/tests/*.test.mjs` under `node --test`
  (`rules`, `rnu`, `surfaces`, `written`, `acceptance`, …); the envelope's are
  in `rules.test.mjs` (`:734`, and S5's L-shaped case at `:1106`).
- **Platform** (reviewed drafts): 096.9 adds `volume` with `height` and
  `slope` ceilings, each optionally `within` rings (≤ 8 ceilings, `rise` in
  (0, 20], heights in (0, 500], `start` in [0, 500]; ≤ 16 volumes or the
  report is refused; **a malformed ceiling drops the whole volume**; its
  DEC-2), drawn exact at every vertex of a ~1 m lattice and within rise × half
  a cell between them (its DEC-3); 096.10 adds `sheet { title, blocks,
  scope? }`, a `plot-plan` block (valid in a sheet only), `checks.unchecked`
  (honoured on screen too), prints numbers ungrouped and limits in words, and
  prints a header (read time, document, version) and a footer (sources,
  attribution, the host's scope sentence) of its own (its DEC-4, DEC-7).

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

## DEC-1 — The outline: a per-edge inset that works on a concave boundary

The volume hangs off the existing `envelope` feature (096.9 DEC-1), so the
plan's dotted outline and the 3D solid are one item. Its distance **per edge
role** is the largest confirmed minimum — `envelopeFeature`'s `setbackOf`
already does this for `value` limits, and it is extended to the
`height_relative` minimums:

| Edge role  | Inset by                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| street     | a confirmed `road_setback` with a `value` limit; a `height_relative` road setback's `minimum`; else 0                               |
| side, rear | a confirmed `boundary_setback` with a `value` limit for that role; a `height_relative` one's `minimum` (R.111-17: **3 m**); else 0 |

**The inset itself is new** (decision 1 of the review). `envelopeRing`'s
half-plane cut is exact only on a convex boundary, and every reference plot
is concave (Current state), so the draft's "002.2's inset function,
extended" would still draw nothing on any of them. `insetByRole(ring,
distances)` replaces it:

1. **Each edge's line shifted inward by its distance**, consecutive shifted
   lines intersected (a mitred offset with one distance per edge). On a
   convex boundary this is exactly the half-plane cut, so 002.2's results
   there are unchanged (`rules.test.mjs:734` passes as it is).
2. **An edge that reverses** (a short cadastral edge consumed by its
   neighbours' insets) is removed and its neighbours' lines intersected
   again, until none reverses — the straight skeleton's edge event, without
   the rest of it.
3. **Validated**: the result is one simple ring (no self-intersection),
   counter-clockwise like the boundary, inside it, with at least three
   vertices and an area above 1 m².
4. **At a re-entrant corner** the mitre is **stricter than the rule** —
   the true set "at least d from the limit" is rounded there, the mitre cuts a
   little more — which is the safe direction for a theoretical envelope. Said
   as the assumption `envelope-reentrant-corners`.

- **Under the RNU** (side and rear are one rule, 002.1a DEC-3) every
  non-street edge is inset 3 m, the street edge 0. This builds the RNU
  envelope 002.1b DEC-5 left to this sprint; the height dependence is in the
  ceilings (DEC-2), where it belongs. 002.1b's bands per edge stay as they
  are.
- **Two confirmed values on one edge** (drawn and entered, or written and
  drawn): the larger, both named in the applied rules (002.2 DEC-8's
  "the stricter, naming both").
- **A collapsed or failed inset** (the setbacks leave no ground; the inset
  splits the plot in two, or step 3 fails after step 2): **no volume and no
  outline**; the Envelope view (DEC-4) shows a `notice`: « Les reculs
  confirmés ne laissent pas de surface au sol » or « La forme de la limite
  du site ne permet pas de tracer l'enveloppe », never a silent absence.
- **What retires**: `convexRing`'s gate and the `envelope-not-convex`
  assumption (S5's L-shaped test, `rules.test.mjs:1106`, is rewritten to
  expect an L-shaped envelope); `envelope-approximate`'s text (« dessinée sur
  une limite convexe seulement ») is reworded for the new inset.
- **The label** becomes « Enveloppe théorique » / "Theoretical envelope"
  (US-04: "labelled as a theoretical envelope"; Q55's wording), with the
  confirmed heights in the Envelope view rather than in the label.
- **The capacity follows** (002.3 DEC-5): on a concave plot it now reads the
  envelope's ground area where it read none; said in the CHANGELOG.

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
  ceilings by keeping the lowest over the same area), `rise` in (0, 20] (a
  factor of 0.05), heights in (0, 500], `start` in [0, 500], `from` of at
  least two points, ≤ 16 volumes. The host drops a volume **whole** for any
  malformed part (096.9 DEC-2 as reviewed), so the extension checks its own
  volume against these before sending it: a volume it would build past them
  is not built, and the Envelope view says so (« Le volume dépasse ce que
  l'éditeur sait dessiner »), the plan outline kept.

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

**A new view** (decision 2 of the review): 002.2 DEC-7 described the
envelope's Properties, but no view was built (Current state), and a feature
has no Properties of its own in the host. `{ id: 'envelope', label: { key:
'fr-urban-rules.view.envelope' } }` — « Enveloppe théorique » — after the
`checks` view, present whenever the regime can have one (DEC-3), its blocks:

- **Figures** (`fields`): the envelope's ground area (the outline's area,
  shoelace, holes removed, a quantity in m²), the confirmed heights (each a
  quantity). No volume in m³.
- **Applied** (`table`, columns Rule · Effect): each rule that shaped the
  outline or a ceiling, with what it did (« Recul arrière 4,00 m — limite du
  site », « Hauteur 22 m — dans le périmètre de la prescription »,
  « R.111-17 — pente 2 pour 1 depuis les limites latérales et de fond »).
- **Not applied** (`table`, columns Rule · Reason): DEC-2's rows, each with
  its reason, and every rule still `to_confirm` (« à confirmer »).
- **A `notice`** when there is no outline or no volume (DEC-1's collapse,
  DEC-2's "no confirmed rule that shapes a ceiling", DEC-3's regimes without
  an envelope, a volume past 096.9's limits), saying which.
- **Assumptions** (`assumptions`, by id): DEC-1's and DEC-2's, plus the
  volume's own, **corrected by the review** (096.9 DEC-3 found the draft's
  « its top is never above the confirmed rules » false): « Le volume 3D est
  calculé environ tous les mètres : exact en chaque point de calcul ; entre
  deux points, près des extrémités ou des angles rentrants d'une limite dont
  la hauteur dépend de la distance, il peut dépasser la règle d'au plus la
  moitié de la pente par mètre » / "The 3D volume is computed about every
  metre: exact at each computed point; between two points, near the ends or
  re-entrant corners of a limit whose height depends on the distance, it may
  stand above the rule by at most half the slope per metre", and « Ce sont
  les contrôles, et non le volume, qui disent si le projet respecte les
  règles » / "The checks, not the volume, say whether the design is within
  the rules."
- **Shown in 3D** is the host's (096.9 DEC-8, on the row's Properties); the
  view adds nothing for it.

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
  5. `meter` with `rules: true` — the host counts the rules by status
     (ADR-0111 Rule 10: "a count is never sent beside what it counts"). The
     draft's `notice` "2 règles n'ont pas pu être vérifiées
     automatiquement" carried a count the extension made; the "Not checked"
     rows of block 4 already show which (decision 4 of the review).
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
  `fr-urban-rules.sheet.*` and `fr-urban-rules.envelope.*` value is WinAnsi (the platform's
  `unicodeToWinAnsi` table, copied as a set of code points with a comment
  naming `packages/sheet-writer/src/winAnsi.ts`; this repository imports
  nothing from the other).
- **Limits in the extension's own words** avoid `≥`, `≤` and `Δ` on the
  sheet: a `described` limit's phrase says "au moins 4 m", never "≥ 4 m".
  Numeric limits are the host's to print (096.10 DEC-7).
- **Numbers go as quantities, never as phrase parameters** on anything the
  sheet carries: the host formats a quantity ungrouped on paper (096.10
  DEC-7), but a number inside a phrase's `params` is formatted by the
  host's message formatter, grouped — French grouping writes U+202F, which
  the print font lacks, so « 1 183 m² » would print with a missing glyph. A
  figure the extension must put in a sentence is a quantity in a `fields`
  row or a table cell instead; small counts (< 1,000) may stay parameters.
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
- `version` **0.7.0** (from 0.6.1). Capabilities unchanged (`regulations`,
  `document`, `ai`, `commands`): the volume and the sheet are report
  content.
- **Lockstep**: the plugins image ships this version only with a web image
  carrying 096.9 and 096.10. `tools/check-index.mjs` runs against a platform
  checkout that has them (002.4's job).

---

# Steps

1. **The inset per role** (DEC-1): `insetByRole(ring, distances)` replaces
   `envelopeRing`'s half-plane cut and `convexRing`'s gate; edge collapse,
   validation, failure said; the label and assumptions reworded; tests on
   the five reference plots' boundaries (all concave), a convex boundary
   (unchanged result) and an L-shaped one.
2. **The ceilings** (DEC-2): `ceilingsOf(confirmedRules, boundary, edges,
   alignments, prescriptions)`, the chains, the merge, the self-check
   against 096.9's limits; table tests, one row per rule kind.
3. **Per regime** (DEC-3) and **the Envelope view** (DEC-4), a new view.
4. **The sheet** (DEC-5): `sheetOf`, its blocks per regime; snapshot tests
   per reference plot.
5. **Strings** (DEC-6): both locales; the WinAnsi test over
   `fr-urban-rules.sheet.*` and `fr-urban-rules.envelope.*`; no number
   above 999 as a phrase parameter on the sheet; the "never conforme" test.
6. **The walk**, recorded: Lyon AB0105 (drawn 22 m within its prescription,
   a 4 m rear setback entered — Screen 4), Brouennes AB0291 and Mouzay
   AB0415 (RNU and CC: slopes, 3 m inset), Rochefort-en-Terre AB0149 (not on
   the GPU: no envelope, the sheet's notice); 3D in both themes with
   `shoot`; one sheet printed and downloaded per plot, the PDF opened in two
   readers.
7. **Manifest and index** (DEC-8: 0.7.0, `sdkVersion` 1.30); README and
   CHANGELOG (the capacity on concave plots now reads an envelope).

# Acceptance criteria

1. On Brouennes (RNU), the envelope's outline is the Site boundary inset 3 m
   on side and rear edges and 0 on the street edge — on its concave
   boundary — and its volume holds one `slope` of `rise` 2 from the
   non-street chain and one of `rise` 1 from the opposite alignment (a new
   `fr-urban-rules/tests/envelope.test.mjs`, on
   `test-fixtures/fr-urban-rules/acceptance/brouennes/`).
2. On Lyon, with a section that confirms « Hauteur Max-22 » and enters a 4 m
   rear setback, the volume holds a `height` of 22 `within` the
   prescription's rings and the outline is inset 4 m on the rear edges
   (`envelope.test.mjs`, on `acceptance/lyon/`).
3. On every one of the five reference boundaries `insetByRole` gives one
   simple, counter-clockwise ring inside the boundary; on a convex boundary
   it equals the former half-plane cut (`rules.test.mjs:734` unchanged and
   green); on an L-shaped one it draws an L-shaped envelope
   (`rules.test.mjs:1106` rewritten) (`envelope.test.mjs`).
4. A rule `to_confirm` shapes nothing and is listed « à confirmer » under Not
   applied; the same read with a section confirming it adds its ceiling or
   inset; without that section it is gone again (`envelope.test.mjs`, two
   sections — undo itself is the host's, walked in step 6).
5. `height_facade`, the budgets, R.111-15, R.111-28 and L.111-3 are listed
   under Not applied, each with DEC-2's reason; a façade-relative setback
   with a positive offset is not applied and still checked
   (`envelope.test.mjs`).
6. Setbacks that consume the plot, and an inset that splits the plot, give
   no outline and no volume and a notice (`envelope.test.mjs`).
7. `not_published`, `unknown` and a non-constructible CC sector give no
   envelope, and the view says why (`envelope.test.mjs`).
8. Every volume respects 096.9's limits: ≤ 8 ceilings, `rise` in (0, 20],
   heights in (0, 500], `start` in [0, 500], `from` ≥ 2 points, ≤ 16
   volumes; a merge keeps the lowest of two `height` ceilings over the same
   area; a volume past them is not sent and the view says so
   (`envelope.test.mjs`).
9. The Envelope view shows the ground area, the confirmed heights, the
   applied and not applied rules and DEC-4's assumptions — the corrected
   "exact at each computed point" sentence, never "never above" — and no
   volume in m³ (snapshot in `envelope.test.mjs`).
10. `report.sheet` on Lyon holds, in order: the plot fields with the zone's
    own date, the flags, the checks with `unchecked`, the rules meter, the
    plot plan with DEC-5's categories and caption, the assumptions; and the
    scope phrase (snapshot in a new `fr-urban-rules/tests/sheet.test.mjs`).
11. On Rochefort the sheet holds the « plan non disponible » notice and no
    rule is invented; on `unknown` with nothing read, no sheet
    (`sheet.test.mjs`).
12. Every `fr-urban-rules.sheet.*` and `fr-urban-rules.envelope.*` value in
    both locales is WinAnsi; no phrase parameter the sheet carries is a
    number ≥ 1,000; none contains « conforme », « autorisé » or "compliant",
    nor calls the envelope « constructible » (`sheet.test.mjs`,
    `package.test.mjs`).
13. The manifest declares `version` `"0.7.0"` and `sdkVersion` `"1.30"`;
    `node --test 'fr-urban-rules/tests/*.test.mjs'` passes (the
    `acceptance` suite included); `tools/check-index.mjs` passes against a
    platform checkout carrying 096.9 and 096.10; the walk of step 6 is
    recorded with its pictures and PDFs.

# Testing strategy

- **Pure functions** (`insetByRole`, `ceilingsOf`, `envelopeOf`, `sheetOf`)
  over 002.4's recorded fixtures, under `node --test`, no install.
- **Strings**: the locales read as JSON; the WinAnsi set and the forbidden
  words.
- **In the editor**: the walk of step 6, recorded by hand (002.4's method);
  no automated browser test in this repository.

# Risks

- **The volume reads as a right.** Mitigation: « théorique » in the label,
  the scope sentence on the sheet, the "checks, not the volume" assumption,
  and the host's refusal to paint "outside" (096.9 DEC-9).
- **An irregular boundary breaks the inset.** The mitred offset with edge
  collapse handles cadastral notches; a plot the inset splits is refused
  and said (DEC-1). Gordes (24 re-entrant vertices of 33) is the hard case,
  and is in the tests.
- **The capacity moves on concave plots** (002.3 reads the new envelope
  area where it read none). Said in the CHANGELOG; 002.9's expected values
  are written after this sprint.
- **Height references differ by PLU** (natural ground at the façade's foot,
  the road's level). The assumption says which one the volume uses; a PLU
  that defines another is read by the user, as for the checks (002.2 DEC-7).
- **The shapes of 096.9 and 096.10 are reviewed drafts.** This sprint is
  their first consumer; the 2026-10-20 review found nothing they lack.

# Questions for the owner

_Answered 2026-10-19 (README § 5)._

1. **The RNU envelope as slopes** — **Yes** (Q47).
2. **The adjoining case** — **Not drawn**, said as an assumption (Q47).
3. **The scope sentence's wording** — as drafted (Q55).

# Definition of Done

The criteria walked against the code; the Design Contract boxes checked;
`node --test 'fr-urban-rules/tests/*.test.mjs'` green; the walk of step 6 recorded with
its pictures and PDFs; README and CHANGELOG updated.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| **096.9** (SDK 1.29) | `RegulationFeature.volume`, `height` and `slope` ceilings with `within`, `start`; the registry's limits, a malformed volume dropped whole (its DEC-2); the host's evaluation over the drawn ground, exact at each lattice vertex (its DEC-3); **Shown in 3D** on the row |
| **096.10** (SDK 1.30) | `RegulationReport.sheet { title, blocks, scope? }`; the `plot-plan` block; `checks.unchecked`; the host's header and footer (read time, document, sources, attribution, its own scope sentence); paper words for numeric limits and ungrouped numbers (its DEC-7) |
| **096.5** (implemented) | The `envelope`, `setback-band` and `alignment` roles drawn derived; the categories the plot plan reuses |
| **096.4** (implemented) | Confirmations and entered rules in the section, so a confirmation reshapes the envelope with undo |
| **096.1 / 083.12** | The Site boundary ring in the Site view, and `plotArea` |
| **002.1a–b, 002.2, 002.6b** (0.6.1) | Edge roles, the opposite alignment, `envelopeFeature`'s per-role distances (its convex-only cut replaced here), confirmed rules of every provenance |
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
7. _(2026-10-20: applied — the README's row reads 0.7.0 and SDK 1.30.)_
   **Platform README § 3, 002.7 row ("the FR report's envelope volume and its
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

# Review against the code (2026-10-20)

Read against `fr-urban-rules` 0.6.1 (`src/index.js`, `tests/`,
`test-fixtures/`) and the reviewed 096.9 and 096.10. The split holds — the
extension states an outline and ceilings, the host draws and prints — and the
rule-to-ceiling table (DEC-2) matches the coded rules as they landed
(R.111-16 and R.111-17 `confirmed`, `height_relative` factors 1 and 0.5 with
a 3 m minimum; R.111-15 `to_confirm`; R.111-28 `information`). What was wrong
or stale:

| #   | Sev. | Finding                                                                                                                                                                                                     | Changed                             |
| --- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | H    | The outline was "002.2's inset, extended": that inset draws nothing on a concave boundary (S5), and **all five reference plots are concave** — criteria 1 and 2 (Brouennes, Lyon) could never pass         | DEC-1 (decision 1), criteria 1–3    |
| 2   | H    | The volume assumption « its top is never above the confirmed rules » is false (096.9 review, item 1): it would have been printed on every sheet                                                           | DEC-4, criterion 9                  |
| 3   | H    | No Envelope view exists to "gain" blocks; 002.2's envelope Properties were never built                                                                                                                    | Current state, DEC-4 (decision 2)   |
| 4   | M    | "Under the RNU … an envelope at a stated height H" exists: it does not — RNU draws bands only, and no envelope at all                                                                                    | Current state, DEC-1                |
| 5   | M    | A number in a phrase parameter is grouped by the host's formatter (U+202F in French), which the print font lacks                                                                                          | DEC-6, criterion 12                 |
| 6   | M    | DEC-5's notice "2 règles n'ont pas pu être vérifiées" sends a count beside what it counts, against ADR-0111 Rule 10                                                                                         | DEC-5 (decision 4)                  |
| 7   | M    | The host now drops a volume whole for one malformed part (096.9 DEC-2): the extension must check itself before sending                                                                                    | DEC-2                               |
| 8   | L    | Package 1.2.0 → **0.7.0** (after 0.6.1); capabilities are four (`commands` missing); `tools/check-index.mjs`; the `node --test` glob; Brouennes AB0291, Mouzay AB0415, Rochefort AB0149 (002.4's plots) | Header, DEC-8, steps, criteria      |
| 9   | L    | Criteria said "(test)"; each now names its file. Questions answered on 2026-10-19 (Q47, Q55) were still open                                                                                             | Criteria, Questions                 |

**Decisions taken on the owner's behalf (2026-10-20), reversible:**

1. **A mitred per-edge offset with edge collapse** replaces the convex-only
   half-plane cut (DEC-1): exact on a convex boundary, stricter than the
   rule at re-entrant corners (said), refused where the inset would split
   the plot. Reversible: a full straight skeleton or a polygon difference
   later, for rounded re-entrant corners or split envelopes.
2. **A new `envelope` view**, « Enveloppe théorique », after the checks
   view (DEC-4). Reversible: its blocks could move into the rules view.
3. **The feature's label becomes « Enveloppe théorique »** (US-04, Q55),
   the confirmed heights moving to the view's figures. Reversible.
4. **A host-counted `meter` replaces the "n rules not checked" notice** on
   the sheet (DEC-5). Reversible only with a revision of ADR-0111 Rule 10.

**Nothing blocks implementation** once 096.9 and 096.10 land (SDK 1.29 and
1.30); the inset (decision 1) is this repository's own work and is the
sprint's largest risk.

# Outcome (2026-10-21)

**Implemented and walked, uncommitted; independently reviewed 2026-10-21
(Review, below — the inset was rewritten there, so decisions 1–3 and the stress
figures of this section are superseded by it).**
`fr-urban-rules` **0.7.0**, `sdkVersion` **"1.30"**, capabilities unchanged.
Built on the platform's 096.9 (SDK 1.29) and 096.10 (SDK 1.30) as reviewed;
no platform defect was found in them, so nothing was changed in
`archisimple` but the walk's spec (below).

## What landed

- **`insetByRole(ring, distances)`** (`src/index.js`, pure, exported through
  `__testing`) replaces `envelopeRing` and `convexRing`: each edge's line moved
  in by its distance; the mitre at a convex corner; at a re-entrant corner (and
  a near-straight one between two distances) the tangents to the circle of the
  larger distance every 15°, clamped at the far side of either edge; reversed
  lines removed earliest collapse first (never between two parallel lines, nor
  where it would leave a re-entrant junction); the raw outline split at its
  self-crossings into loops (`simpleLoops`), the loops checked — inside the
  boundary, more than 1 m², no point closer to an edge than its distance (5 mm
  tolerance) — and exactly one kept. `collapsed` when no ground is left (also
  when the only loop's centre is where the rule excludes), `shape` when two
  pieces remain or a loop the rule allows fails the check. `envelope-not-convex`
  and its strings are gone.
- **`envelopeRulesOf` / `mergedCeilings` / `volumeExpressible` / `envelopeOf`**
  (`createRnu`): DEC-1's per-role distances (confirmed `value` minimums in
  metres and height-relative `minimum`s), DEC-2's ceilings rule by rule
  (`chainsOf` for the non-street and street chains, `alignmentLines` joining
  alignments whose ends meet within 1 m, a confirmed drawn `psc:15:` line in
  place of R.111-16's alignment), DEC-2's merge (heights over one area keep the
  lowest; a within-height above a whole-plot one is dropped), DEC-2's
  self-check against `VOLUME_LIMITS` (096.9 DEC-2 mirrored), DEC-3's regimes
  (`envelopeRegime`) and DEC-4's view (`envelope`, « Enveloppe théorique »,
  after Checks). The feature's label is `fr-urban-rules.envelope.label`; its
  `ruleIds` and every ceiling's `ruleIds` name the rules applied.
- **`sheetOf(report, { site, zones })`** (top level, pure): DEC-5's blocks and
  scope; added to every augmented report, and to an `unknown` one when
  something was read.
- **The capacity** (`surfacesFor`, `programmeFacts`) reads the new outline's
  ground area where a confirmed setback insets it, gated by DEC-3's regimes.
- **`fitted`** counts a volume's `from` and `within` points against the
  report's point budget (096.9 DEC-2).
- **Strings**: 69 keys added, 2 removed (`envelopeNotConvex`, `labelHeight`), 4 reworded, en and fr (673 each).
- **Manifest** 0.7.0 / `"1.30"`; README, CHANGELOG; `dist/` rebuilt
  (`com.archisimple.fr-urban-rules-0.7.0.aspkg`), `tools/check-index.mjs
  --platform ../archisimple`: 2 of 2 accepted.
- **Tests**: `node --test 'fr-urban-rules/tests/*.test.mjs'` **323 pass** (293
  before): `envelope.test.mjs` (19, new), `sheet.test.mjs` (9, new), two in
  `written.test.mjs`, S5 rewritten in `rules.test.mjs`, the manifest pin in
  `package.test.mjs`. Services untouched: `node --test
  'services/*/tests/*.test.mjs'` 127 pass.
- **Walk spec** (archisimple): `tools/e2e/specs/regulationsPhase3.spec.ts`,
  project `regulations-phase3` of `playwright.regulations.config.ts` (not in
  `pnpm e2e`, like the other regulations specs); it typechecks and lints clean.

## The walk (step 6), 2026-10-21

The five committed projects, `fr-urban-rules` 0.7.0 installed from the local
index (`packageIndexServer.mjs`, port 47471) on an editor of its own (port
5194), the live GPU, API Carto, Géorisques and roads, in the dark and light
themes; the walk's decisions as 002.4's (Lyon: edge 9 rear, a 4 m rear setback
entered, « Hauteur Max-22 » confirmed; Brouennes: R.111-15 confirmed;
Rochefort: a 10 m height entered). Everything is in
`archisimple/tools/e2e/test-results/regulations/phase3-002.7/`: per plot the
view's text (`<plot>-<theme>.txt`), the view (`-view-`), the plan (`-plan-`),
3D as framed, from above and three-quarter (`-3d-`, `-3d-above-`,
`-3d-oblique-`), the print dialog, the PDF (`<plot>-sheet.pdf`) and its pages
rendered by PDFKit (`ql/<plot>-sheet-pN.png`, plus QuickLook's
`ql/<plot>-sheet.pdf.png`). The PDFs were also read by pdf.js: no `?` (no glyph
lost) in any of the five, both scope sentences present. No page error.

| Plot | Envelope | Sheet |
| --- | --- | --- |
| Lyon AB0105 (PLUi) | Outline inset 4 m on rear edges 9–13 (1,072 m² of 1,183), the re-entrant corner rounded; volume: a height of 22 m within « Hauteur Max-22 »'s ring; seen in 3D as a column in the courtyard among the neighbours | 4 pages: plot, flags (long: 21 heritage perimeters by name and Géorisques' commune risks fill page 1), checks (« Hauteur Max-22 » no issue, rear setback 2.60 m potential issue, « Secteur de stationnement » not checked), meter « 2 Confirmed · 1 Not evaluable », plot plan 1:1000, assumptions, sources, the two scope sentences |
| Gordes AC0323 (PLU) | None: « No confirmed rule shapes an envelope yet »; the extension caps listed as budgets | 2 pages, the zone's own date 2022-04-11 in the plot block |
| Brouennes AB0291 (RNU) | Outline inset 3 m on side and rear, 0 on the two street edges, the notch between them rounded; slopes 2 for 1 from the two non-street chains and 1 for 1 from the two opposite alignments; 6 m at every outline vertex (computed), rising to about 20 m along the street front between two lateral limits — RNU has no height limit | 3 pages; plot plan with the envelope, the setback bands and the notch |
| Mouzay AB0415 (CC) | As Brouennes: 551 m², R.111-17 and R.111-16 slopes | 4 pages |
| Rochefort AB0149 (not on the GPU) | None: « The plan is not on the Géoportail de l'Urbanisme… »; the entered 10 m height invents no envelope | 3 pages, « Plan not available on the Géoportail de l'Urbanisme… » notice; the entered height checked |

**Defects found by looking, and fixed** (in this repository):

1. **Mouzay drew no envelope** (« shape »): one cadastral vertex turning 0.3°
   between a 0 m street edge and a 3 m side edge put the mitre 600 m away, and
   the collapse then left an invalid ring. Near-straight corners between two
   distances are now rounded (decision 2 below).
2. **Unequal distances at a re-entrant corner let the mitre through** (found by
   the random-plot stress test before the walk): 0 m on one side and 4 m on the
   other let the envelope come within 2.2 m of the 4 m edge's end. Rounded
   corners (decision 1).
3. **The sheet printed « Assumptions » twice**: the host titles the list
   itself; the extension's heading is gone.
4. **Mouzay's view listed R.111-16 twice** (two alignments): one Applied row per
   rule and effect.
5. **The envelope's within-height named the checks' assumption** (« only to the
   buildings whose outline meets it »): its own, `envelope-height-within`.

## Decisions taken on the owner's behalf (2026-10-21), reversible

1. **Rounded re-entrant corners, not the mitre** (DEC-1 step 4 and review
   decision 1 said the mitre): the mitre is stricter than the rule only when
   both edges' distances are equal; with 0 m and 4 m it lets the envelope
   within 4 m of the 4 m edge's end. The outline follows the rounded line by
   tangents every 15° (never inside the circle), assumption
   `envelope-reentrant-corners` reworded. Reversible to a mitre with the larger
   distance on both lines.
2. **A convex corner turning less than 20° between two distances is rounded
   too**: its mitre carries the larger setback back along the whole
   neighbouring edge. So "the former half-plane cut" holds on a convex boundary
   whose corners turn by 20° or more (every convex case 002.2 tested, and
   criterion 3's test), not on every convex boundary.
3. **The folded outline is split into loops and checked**, and a line is never
   removed where its neighbours would meet at a re-entrant junction or are
   parallel: on 900 random concave plots the stress run drew 899, none standing
   where the rule excludes and each holding at least 97.6 % of the area the rule
   allows; one was refused (« shape »), safely. `envelope.test.mjs` keeps 60.
4. **The capacity reads the envelope only where a confirmed setback insets it**,
   not the whole boundary when only a height shapes a volume (it would read the
   plot itself as the ground area).
5. **The Applied table has three columns** (Rule · Effect · Value) so figures
   travel as quantities (DEC-6); a rise is a short string (« 2 m up per metre »).
6. **The sheet's title is « Règles d'urbanisme » / "Planning rules"**, without
   "(PLU)": the host's header names the regime, and an RNU or a carte
   communale sheet would read wrong.
7. **Two headings on the sheet** (« Parcelle », « Règles et contrôles »); none
   for the flags and the assumptions, which the host titles.
8. **The source-failed notice names no source** (no phrase in a phrase, no
   count): the host's footer lists each source with its state.
9. **A carte communale only partly in a restricted sector draws the envelope**
   with a warning notice (DEC-3 named only the two whole cases).
10. **A setback with a maximum, or in another unit, insets nothing** and is
    listed (« a maximum setback draws no envelope »).
11. **The WinAnsi test covers every string a report can carry**, not only
    `sheet.*` and `envelope.*`, against the print font's coverage (WinAnsi less
    the 17 characters `NotoSans-Print` lacks, copied from
    `packages/drawing/src/font/metrics.ts`); `programme.*` (the assistant's,
    with `›`) is outside.
12. **The façade-relative cases are in `written.test.mjs`** (its service and
    façade fakes), not `envelope.test.mjs` as criterion 5 named.
13. **The walk's spec is committed** in archisimple (`regulationsPhase3.spec.ts`,
    the regulations configuration only).

## What the draft claimed that was false

- **"At a re-entrant corner the mitre is stricter than the rule"** (DEC-1
  step 4): only with equal distances (decision 1).
- **Criterion 1, "one `slope` of `rise` 2 from the non-street chain and one of
  `rise` 1 from the opposite alignment"**: Brouennes has two street edges (3 and
  5, a 7.9 m side edge between them), so two chains and two alignments — two
  slopes each. The test asserts that.
- **Criterion 10, "the plot fields with the zone's own date" on Lyon**: Lyon's
  zone date is its document's (2026-03-26), so no row; Gordes' differs and is
  the test.
- **DEC-5, the attribution "… — Licence Ouverte 2.0" "unchanged"**: 002.0's
  joined string names no licence (README § Licences: "nothing here cites a
  licence that was not checked"). Kept unchanged, without one.
- **DEC-2's CNIG 15 row** is implemented, but cannot fire on a reference plot:
  R.111-16 applies only without a PLU, and CNIG prescriptions are PLU objects.
- **"The 606 keys of each locale pass [WinAnsi] today"**: they did as WinAnsi;
  against the print font, `programme.notRead`'s `›` does not — it is never on
  a report.

## Design Contract, against the source

1. **Confirmed rules only** — `envelopeRulesOf` skips every status but
   `confirmed`, listing it with its reason (`envelope.test.mjs` criterion 4).
2. **The extension states geometry** — the feature carries rings and
   ceilings in the Site CRS; no terrain is read for it.
3. **Reuse** — the edge roles are `roleOf`, the alignments `alignmentsFor`'s,
   the checks the report's; the outline's function is new by decision 1 of
   the review, as DEC-1 says.
4. **Assumptions said** — the view's `assumptions` block names the edge roles',
   the alignments', DEC-1's and DEC-2's and the volume's; the sheet lists all.
5. **Never conforme / constructible** — `sheet.test.mjs` (every `sheet.*` and
   `envelope.*` value, both locales).
6. **Every sheet string prints** — `sheet.test.mjs`, and pdf.js found no `?`
   in the five PDFs.
7. **Plain ESM** — `package.test.mjs` ("one file, no import").

## Acceptance criteria, walked

1. Brouennes — `envelope.test.mjs` "criterion 1" (with two slopes of each
   rise, above). **Met.**
2. Lyon — `envelope.test.mjs` "criterion 2". **Met.**
3. Five boundaries, convex parity, L — `envelope.test.mjs` (the five plots'
   envelopes through criteria 1, 2, 7 and DEC-3; the five boundaries under
   several distances in the stress harness; "on a convex boundary…", "an
   L-shaped…", "a U-shaped…", "near-straight…", "random concave…"),
   `rules.test.mjs:734` unchanged and green, S5 rewritten. **Met**, with
   decision 2's parity domain.
4. To confirm / confirmed / gone — `envelope.test.mjs` "criterion 4" (undo is
   the host's; the walk confirmed with the button). **Met.**
5. Not applied with reasons; façade positive offset — `envelope.test.mjs`
   "criterion 5", `written.test.mjs` "002.7 DEC-2 / criterion 5"; R.111-15,
   R.111-28, L.111-3 in "criterion 1" and the Brouennes/Mouzay walks. **Met.**
6. Collapse and split — `envelope.test.mjs` "criterion 6" and "criterion 3 /
   DEC-1". **Met.**
7. `not_published`, `unknown`, closed CC sector — `envelope.test.mjs`
   "criterion 7" ×3. **Met.**
8. Limits, merge, past limits — `envelope.test.mjs` "criterion 8" ×2. **Met.**
9. The view — `envelope.test.mjs` "criterion 9". **Met.**
10. Lyon's sheet in order, scope — `sheet.test.mjs` "criterion 10" ×2. **Met**
    (Lyon has no zone date of its own; Gordes does).
11. Rochefort's notice, no invented rule; `unknown` — `sheet.test.mjs`
    "criterion 11" ×3. **Met.**
12. WinAnsi, no grouped number, never conforme — `sheet.test.mjs` "criterion
    12" ×3. **Met.**
13. Manifest, suite, index, walk — `package.test.mjs`; 323 pass;
    `check-index.mjs` accepted; the walk above. **Met.**

## Not done, and open

- ~~**The plot plan draws the design's fill over the envelope's dotted line**
  (Lyon: the 4 m inset runs under the building) — the host's drawing order
  (096.10 DEC-3), not changed here; recorded for the platform.~~ Fixed in the
  platform by the review (096.10 post-review fix 13).
- **Lyon's flags fill the sheet's first page** (21 heritage perimeters by name,
  Géorisques' commune list) and **its last page holds only the scope
  sentences** — 002.0's flags as they are and the host's pagination; a shorter
  flag form for paper is a later choice. _(The scope alone on a page: fixed by
  the review, 096.10 post-review fix 14; the long flags stand.)_
- **The capacity on concave plots moved**: 002.9's expected values are written
  after this sprint.
- **Holes**: the Site boundary is one ring, so the outline has none.

## Review (2026-10-21)

An independent review of the implementation against this document, the
platform's 096.9 and 096.10 as they landed (`regulations.ts`, the registry's
`volume`/`ceiling`/`sheet` checks and `REGULATION_REPORT_LIMITS`), the
package's own legal record (`test-fixtures/fr-urban-rules/legi-articles.json`:
R.111-1, R.111-16, R.111-17 as read on Légifrance) and the walk's pictures,
texts and PDFs.

**What held.** The legal encoding: R.111-17 is `rise` 2 (H ≤ 2L, « la moitié
de la différence d'altitude ») from the non-street chains with the 3 m
minimum as the inset, R.111-16 `rise` 1 (H ≤ L) from the opposite alignment,
both measured from the ground at the line's nearest point — 096.9's slope is
exactly « la différence d'altitude entre ces deux points »; the adjoining
exemption is said, never drawn (stricter); R.111-16 and R.111-17 apply under
the RNU and a carte communale only (R.111-1 al. 2 excludes them under a PLU,
and a CC is not a document « en tenant lieu »), L.111-3 under the RNU only;
`not_published` invents nothing; a façade-relative setback `R ≥ Hf − 4 m` is
`rise` 1 from 4 m (H ≤ (D − offset)/factor), and a positive offset, which would
need a negative start, is not drawn; a height is above the ground at each
point (said), within a drawn prescription's rings where drawn; the merge keeps
the lowest. **Only confirmed rules** shape anything (`envelopeRulesOf` returns
before a status other than `confirmed`; criterion 4's test). **The capacity**
reads the same `envelopeRulesOf` → `insetDistances` → `insetByRole` as the
envelope, gated by the same regimes. **The sheet**: no count of the
extension's, every figure a quantity or verbatim text, ten blocks at most
against the registry's 200, every string of both locales in the print font
(the test reads all 675 keys of each). **Volumes**: one per report; ceilings
≤ 8 checked before sending (`volumeExpressible`) on top of the host's own
whole-volume drop; `ruleIds` name rules of `planned.rules`, which is the
report's list. **i18n**: en and fr have the same 675 keys, none orphaned (every
key appears literally in the source), and the two removed keys
(`envelopeNotConvex`, `envelope.labelHeight`) are referenced only by the
frozen 0.5.0 release fixture and the CHANGELOG.

| #   | Sev. | Finding | Fix |
| --- | ---- | ------- | --- |
| 1   | H    | **`insetByRole` refused or misread about one plausible plot in ten.** A stress run of my own — notched rectangles, cadastral sides cut into pieces turning a few tenths of a degree, stars with 2–60 cm jogs and the five reference boundaries, all in Lambert-93 coordinates, distances in role-like runs — got **no envelope on 26 of 300** plots whose rule leaves **one** piece of 170 to 2,800 m² (grid-sampled), **8 of them said « collapsed »** (« Les reculs confirmés ne laissent pas de surface au sol », false), 3 of them reference boundaries under other distances. With one distance per edge it also answered a 7-vertex sliver holding 1 % of the 1,760 m² the rule allows — which the capacity would have read. Safety held throughout (no side nearer an edge than its setback). The Outcome's "899 of 900 drawn" was measured on star-shaped plots only, and the harness was not committed. | **Rewritten by overlay** (decision 1 below): the boundary less each edge's strip, every outline cut where it crosses another, each piece kept where the region lies on one side of it, chained into loops. Refused only where the rule's own set is empty (`collapsed`) or in pieces (`shape`) — now true statements. On the same runs: 0 safety violations, every refusal a true split or an empty set, 0.93–0.97 of the allowed area held (1 m sampling). `envelope.test.mjs` "review 2026-10-21: adversarial plots in Lambert-93 coordinates…" (120 plots, every side of the outline checked against every edge, refusals checked against the sampled set's pieces) — it fails on the former function. |
| 2   | M    | **R.111-16 partly applied, said as applied.** A street edge with no opposite alignment found (no road near it, or set as a street by the user) had no slope, so the volume stood over that street front unbounded by R.111-16 while the Applied table listed R.111-16; with no alignment at all R.111-16 went to Not applied — looser than a confirmed rule, no assumption saying so. | The slope rises from the bare street edge itself (`chainsOf` with a filter), nearer than any alignment across the road, so stricter; assumption `envelope-alignment-missing`. `envelope.test.mjs` "review 2026-10-21: a street edge with no opposite alignment…". |
| 3   | M    | **A confirmed rule the envelope cannot draw made it looser in silence on paper.** A façade height, a maximum setback, a budget, a façade-relative offset are listed under Not applied in the view — but the sheet prints assumptions, not the view, and its plot plan draws the envelope. | Assumption `envelope-not-applied` whenever a confirmed rule (other than "not regulated" or a minimum height) is not applied: « L’enveloppe ne dessine que les règles listées comme appliquées dans sa vue ; une règle confirmée qu’elle ne sait pas dessiner (…) limite toujours le projet. » Criteria 1 and 5's tests. |
| 4   | M    | **A carte communale partly closed to construction** drew the envelope over the closed part, said only by a view notice. | The notice's sentence is also an assumption, `envelope-cc-partly` (same key). Criterion 7's test. |
| 5   | M    | **Host: the design's grey covered the envelope's dotted line** on the plot plan (open item 1 of the Outcome). | Fixed in archisimple (096.10 post-review fix 13): outline-only regulation rings drawn over the design. |
| 6   | L    | **Host: Lyon's page 4 held only the two scope sentences** (open item 2). | Fixed in archisimple (096.10 post-review fix 14): the scope sentences first under « Sources and scope », then the sources. |
| 7   | L    | **Two counts that can pass 999 travel as phrase numbers into assumptions** the sheet prints: `featuresCapped` (up to 1,900) and `checksCapped` (1,000) — « 1 000 » with U+202F in French, outside the print font (DEC-6). Not reachable on the five plots, so criterion 12's test never saw them. | Passed as strings. No test: reaching them needs a report past 95,000 points. |
| 8   | L    | A confirmed setback in another unit than metres was listed as « un recul maximal ne dessine pas d’enveloppe ». | Its own reason, « ne dessine pas l’enveloppe ». |
| 9   | L    | **Criteria named things their tests did not assert**: criterion 5's R.111-28 and L.111-3 rows (asserted nowhere); criterion 3's "on every one of the five reference boundaries" (Gordes' and Rochefort's never inset in a committed test). | Asserted in "criterion 1"; the five boundaries are in finding 1's adversarial test. |
| 10  | L    | **Left open.** `unknown` has no Envelope view (DEC-3: "none: the source did not answer"; criterion 7: "the view says why") — the overview and sources already say the read failed. | Recorded; criterion 7 is met for `not_published` and a closed CC sector, not literally for `unknown`. |
| 11  | L    | **Left open.** A split is refused whole (DEC-1): a 1.5 m² sliver beside 700 m² of ground gives no envelope at all. 096.9 reads a feature's rings even–odd, so several pieces are expressible. | An owner's decision (draw every piece, or the pieces above a floor); recorded. |
| 12  | L    | The walk's texts for Brouennes and Mouzay still showed R.111-16 and R.111-17 twice under Applied: captured before Outcome defect 4's fix. | Re-walked (below). |

**Decisions taken on the owner's behalf (2026-10-21), reversible**

1. **The outline by overlay, with roles' semantics**, replacing the Outcome's
   decisions 1–3 (rounded re-entrant corners, the 20° near-straight rule, loop
   splitting): a **street** edge's strip runs on along its line past a convex
   corner as far as the plot reaches within the setback — the alignment
   continues past the plot, so this is the half-plane cut, exact on a convex
   boundary; a **side or rear** limit ends at its corner, so its strip ends
   rounded (« au point de la limite … le plus rapproché »), which at an open
   convex corner between two distances is the rule's own line and slightly
   larger than the former mitre; every re-entrant corner rounds. Each strip is
   grown by a tenth of a millimetre (distinct per edge) so no two outlines lie
   on one line — stricter, never looser. `insetByRole(ring, distances, lines)`;
   the callers pass `role === 'street'`. Criterion 3's convex parity is
   asserted with every edge a street (`envelope.test.mjs`), within the growth.
   Reversible: lines for every role is the former mitre everywhere.
2. **Assumption texts reworded** for decision 1: `envelopeReentrantCorners`
   (also where a side or rear limit ends at an open corner) and
   `envelopeApproximate` (a street setback measured from the street edge's
   line, run on past the plot's corners); two new, `envelopeAlignmentMissing`
   and `envelopeNotApplied` (675 keys per locale).
3. **No envelope past 1,000 boundary edges** (`INSET_MAX_EDGES`, said as its
   shape): the overlay grows with the square of the strips' sides — a 1,000-edge
   boundary takes about 0.4 s; rnu's 20,000-edge test now asserts the notice.
   The whole suite now runs in 3 s (265 s in the Outcome's run).

**Tests**: `node --test 'fr-urban-rules/tests/*.test.mjs'` **325 pass** (323
before: two new in `envelope.test.mjs`; assertions added to criteria 1, 5, 7
and rnu's 20,000-edge test; tolerances of a millimetre where four tests read
exact coordinates the growth moves); services 127 pass. **Gates in archisimple** (the two host fixes): `pnpm build`
0; cold `tsc -b --force` for web clean; `pnpm lint` 0 errors; `pnpm
depcruise` clean in both configurations; the six validators pass; the touched
web tests pass (096.10's Outcome). `tools/build-index.mjs` rebuilt `dist/`
(0.7.0), `tools/check-index.mjs --platform ../archisimple`: 2 of 2 accepted.

**Re-walk (2026-10-21)**: `regulations-phase3`, both themes, the five plots,
on an editor of its own (port 5193) and the index served on 47481 — **5 passed
in each theme**, no page error; everything under
`archisimple/tools/e2e/test-results/regulations/phase3-002.7/` replaced, the
PDF pages rendered again by PDFKit (`ql/<plot>-sheet-pN.png`). Ground areas as
before within a tenth of a m² (Lyon 1,072.1, Brouennes 1,264.2, Mouzay 550.9 —
551 before); each Applied rule once (finding 12); Brouennes carries
`envelope-not-applied` (R.111-15 confirmed), on screen and on its sheet; Lyon's
plot plan draws the envelope's dotted line over the house (finding 5); Lyon's
page 3 ends « Sources and scope », the two scope sentences, the sources, and
page 4 holds the last three data credits, not the scope (finding 6). The five
PDFs read by PDFKit: no `?`, both scope sentences in each.

## Post-sprint

- [x] Status, Outcome, contract boxes, criteria walked (this section).
- [x] CHANGELOG and README (0.7.0, SDK 1.30).
- [x] The milestone doc's status line and § 12's Phase 3 row.
- [x] The platform README § 3's 002.7 row (`docs/milestones/site-regulations/README.md`).
- [x] `dist/` rebuilt, `check-index.mjs` against the platform checkout.
- [x] Independent review (Review (2026-10-21), above; two host fixes recorded in
      096.10's Outcome).
- [ ] The owner's look at the pictures and PDFs (re-walked 2026-10-21).
- [ ] Commit (the owner's).
