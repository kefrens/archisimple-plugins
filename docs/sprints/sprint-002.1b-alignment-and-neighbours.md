# Sprint 002.1b — Alignment and Neighbours

> **Status:** **Closed (2026-10-22)** — committed, deployed to the NAS and
> closed by the owner with
> [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md) Phases
> 0–3 and the platform's Site Regulations milestone ("you can close phase3. it works for the moment and has been deployed to the NAS").
> As it read before the close: **Implemented, uncommitted (2026-10-20)** — `fr-urban-rules` 0.2.1;
> 113 tests green; the editor walk (criterion 6) goes to the 096.6 / 002.4
> joint walk, as 002.1a's criterion 10 did.
>
> **Version:** 1.1 (split from 002.1 v1.0 at its review, 2026-10-20)
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules` →
> **0.2.1** (0.3.0 stays 002.2's)
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 5.1, US-04 and US-05 for plots with no local plan. The second half of the
> former 002.1; the first is [002.1a — RNU Rules](sprint-002.1a-rnu-rules.md).
>
> **Prerequisites:** 002.1a (the coded rules, the edge roles, the section,
> the R.111-17 evaluation and its `not_checked` reasons). Platform: 096.0b
> (`line` and `building` targets), 096.1 (`measures.distances`), 096.5
> (derived features drawn apart; not needed for acceptance).
>
> **Sizes:** the opposite alignment (three paths), the R.111-16, R.111-15
> and R.111-28 evaluations, the setback bands as lines. No platform change.
> Medium.

---

# Sprint Design Contract

Verified against `fr-urban-rules/src/index.js` on 2026-10-20.

- [x] **The host measures; the extension applies the rule.** _Held: every
      distance, rise and worst pair comes from `measures.distances` (`line`
      and `building` targets); the extension derives only the opposite
      alignment, the neighbours' filter and average (a point-to-segment
      distance between foreign outlines the host does not offer), and the
      offset band lines._
- [x] **Assumptions are said, every time.** _Held: each alignment path has
      its assumption (said whenever one is drawn, checked or not), the 3 m
      width fallback its own, the radius in the neighbours' row and the
      R.111-28 condition; alignments and bands are `official: false`._
- [x] **Never "compliant".** _Held: `no_issue`, `potential_issue`,
      `not_checked`._
- [x] **Context data is fetched, not stored.** _Held: parcels and buildings
      live in the reader's closure per Site per session; nothing is written._
- [x] **A check carries its real result**, whatever its rule's status.
      _Held: R.111-15's check is `potential_issue` at 2.5 m while the rule is
      `to_confirm` (criterion 3's test)._

---

# Outcome (2026-10-20)

> **Walked in acceptance** (2026-10-20) by Sprint 002.4 jointly with the platform's 096.6, on five reference plots in the editor — see 002.4's Outcome; the owner has not looked yet.

`fr-urban-rules` **0.2.1**, uncommitted (0.3.0 stays 002.2's). No new
capability: `map-features` querying is ambient. New in the tree: the
alignment, R.111-16, R.111-15, R.111-28 and band code in `createRnu`;
`scripts/capture-features.mjs`; `test-fixtures/fr-urban-rules/{brouennes,mouzay}/
{parcels,buildings}.json` (carte-gouv-fr's own parcel and building sources,
`MapFeature[]`); `measures/{alignment-line,alignment-outside,annex-2.5,
annex-3.5,annex-touching}.json` (the platform's `getBuildingDistances` on a
`line` 10 m off, one 150 m off past the terrain grid, and a named building
2.5 m, 3.5 m and 0 m away); 13 tests in `rnu.test.mjs`.

**Gates.** `node --test fr-urban-rules/tests/*.test.mjs` — **113 pass, 0
fail**; `urban-rules` 10, `sh3f-importer` 99. `package validate` passes
(0.2.1); build-index (3 packages) and check-index (3 of 3) into the
scratchpad; `.aspkg` 0.35 MB. Out of the suite, a full `rnu` report
(Brouennes) and `cc` report (Mouzay) with carte-gouv-fr's recorded roads,
parcels and buildings, a kept existing building and a named annex — R.111-15,
-16 and -17 checks, alignments and bands — passed the platform's built
`checkedReport` with actions: **0 dropped, 0 refused**, progress included; the
20,000-edge boundary still answers within the host's counts (features capped
at 1,900, the derived ones last).

**Owner decision recorded** (002.1a review Q2): R.111-16's second paragraph
("Toutefois une implantation … peut être imposée"), quoted from the verified
text, is the rule's first `exceptions` phrase.

## Deviations

1. **One facing-parcel query, not one per street edge**: over the street
   edges' box grown by 40 m, limit 200 — a bounded request whatever the
   number of street edges; a refusal (`too-many-features` included) falls to
   the carriageway path, its source `unavailable`. Asked again when the street
   edges change (a correction).
2. **Facing segments are clipped to the edge's span** (EL7 lines too), so a
   parcel or an easement longer than the edge contributes the part across from
   it; DEC-1 did not say.
3. **A required setback line (`typepsc` 15) on a CC plot is not read**: 002.0
   reads prescriptions under PLU / PLUi only. Recorded for 002.2.
4. **R.111-16 bands** sit at `limit` from the alignment's **mean** outward
   distance (a parallel approximation); a band that would fall outside the
   Site boundary is not sent.
5. **No street edge** (no road, or the roads refused): R.111-16 is one
   `not_checked` per building, "no road found within 30 m" / "the roads could
   not be read" (002.1a DEC-3 item 5), rather than nothing.
6. **R.111-15 learns the main building's id from `projection()`** when there
   is a named building or an existing one to pair with (a `building` target
   needs the id); R.111-16 asks the main building without an id, as R.111-17.
7. **Without a `map-features` service** the neighbours read as none returned
   (an empty answer), not as unavailable.
8. **Fixtures**: Mouzay is AB0346 (002.4 has not chosen its parcel); the
   measures come from the platform's Automation API and its built test
   harness, not an editor-drawn building.

## Acceptance criteria, walked

1. ✅ "002.1b criterion 1" ×3: facing parcels 12 m across a 6 m carriageway →
   the alignment `[(0,−12), (20,−12)]`, `alignment` / `official: false`,
   "assumed from the cadastral parcels"; none → the carriageway edge at
   −9 m, "stricter"; an EL7 line → the EL7 line.
2. ✅ "002.1b criterion 2" ×2: the platform's recorded worst pair (ratio 1)
   → `no_issue`, a negative margin → `potential_issue`; an alignment outside
   `site.terrain.extent` → `not_checked` with the extent reason and no line
   asked; the host's own past-the-grid answer → `outside-terrain`.
3. ✅ "002.1b criterion 3" ×2: 2.5 m → `potential_issue` with the rule
   `to_confirm`; 3.5 m → `no_issue`; touching → no check (all three the
   platform's recorded answers); a kept existing building → a closed-ring
   `line` target; a replaced one → none.
4. ✅ "002.1b criterion 4" ×2: average 7.5 m of three neighbours, one
   without a height, the far one and the plot's own excluded; in the `checks`
   view's fields and R.111-28's `conditions`; no R.111-28 check; a refusal is
   an `unavailable` source and a notice.
5. ✅ "002.1b criterion 5": `setback-band` `line` features, `official:
   false`, unique per edge and limit, every point inside the boundary; the 3 m
   lines at x = 17 and y = 27 on a 20 × 30 m plot.
6. ❌ **Not done**: the editor walk on Brouennes (manual) — to the 096.6 /
   002.4 joint walk.

## Review fixes (2026-10-20)

An independent review found two blocking defects; both fixed, each with tests
("002.1b review …" in `rnu.test.mjs`).

- **B1 — EL7 was never fetched across the road.** API Carto answers the
  features a geometry intersects, and 002.0 asks with the plot, so a far-side
  EL7 line never arrived. The extension now asks `assiette-sup-l` and `-s` with
  `categorie=el7` (a filter probed live on 2026-10-20: AC1 301 → 301, EL7 0
  where none lies) over **corridors across the street edges** — each edge
  carried outward past the road's centreline by 40 m — through the planning
  reads' own `fetch`, timeout and paging guard (an `el7` source in
  `sources[]`). Only lines beyond the centreline count (3 m without one), and
  the nearest of those, read per station; near-side only falls through to the
  parcels. Tests: near-only, near + far + farther (the far, nearest one),
  far-only, and the corridor URL itself (from the edge to 46 m out). The
  reference plots' EL7 answers were not recorded: in tests an unrecorded EL7
  read answers empty, as API Carto does where none lies.
- **B2 — bands left the plot on non-rectangular boundaries.** Each shifted
  edge is now clipped to the Site boundary polygon (a band may split in
  pieces, `band:<edge>:<limit>:<k>`), and the assumption `bands-approximate`
  says they are parallels clipped to the boundary, R.111-16's placed from the
  alignment's mean distance. Tests on a right triangle and an L-shape: every
  band point and middle on or inside the boundary.

Should-fix, all done:

1. **The carriageway's true far edge**: at each station the outward ray meets
   the centreline, and the far edge lies `(width / 2) / |cos θ|` beyond it
   along the ray — square to the road. Tests at 5° and 15°: every point 3.000 m
   from the centreline, on the far side. The "stricter" claim holds.
2. **Facing parcels by the nearest row**, per station; under 60 % of the 21
   stations covered → the carriageway. Tests: a second row behind the first,
   a parcel covering a quarter of the edge.
3. **Own keys** for the facing-parcels, neighbours and EL7 refusals; the
   carriageway assumption tells "no parcel faces the edge" from "the parcels
   could not be read" (`alignment-carriageway-unread`).
4. **The main building checked and shown once** when it is also a `Building`
   entity (R.111-16 and the R.111-28 rows); test.
5. **A superseded read leaves no context behind**: the context is built on a
   copy and kept only when the read was not aborted; test with a hanging
   first parcel query.
6. **R.111-15 contiguity at 5 cm** (002.1a's adjoining tolerance), an attached
   existing part included; the tolerance said (`contiguous-tolerance`).
7. **Both caches bounded** (20 plots) and cleared by `clear()`, which the
   reader's `dispose` now calls.
8. **The missing tests**: parcel refusal → carriageway, re-query when the
   street edges change, corner plot, two roads, oblique roads, the
   non-rectangular bands; the Mouzay test asserts its roles, its alignments'
   paths (three from parcels, one carriageway) and the neighbours (8.533 m, 46
   buildings, 1 without a height, 6 light structures).

Nits, done: the neighbours' filter memoized per answer and boundary and
box-prefiltered; the 100,000-point budget counts derived lines (dropped first);
an assumption past 200 street edges for R.111-16; try/catch around the
alignments, the neighbours and the bands; "no source serves buildings" told by
`listFeatureSources` and said; R.111-15's existing-building check ids use the
part's `featureId`; hole rings are never targets; light structures left out of
the R.111-28 average and counted; the package description; R.111-16 with no
boundary is `not_checked` "no Site boundary drawn" as R.111-17 is. The band
generation stops at the feature budget, and the clipping box-prefilters the
boundary's edges: the 20,000-edge case runs in 0.9 s.

**Gates after the fixes**: `fr-urban-rules` **129 pass, 0 fail**;
`urban-rules` 10, `sh3f-importer` 99; `package validate`; build-index (3) and
check-index (3 of 3) into the scratchpad; the full Brouennes and Mouzay
reports, the 20,000-edge boundary and 002.0's five plots pass the platform's
`checkedReport`, 0 dropped.

## Post-sprint list

- [x] Package `README.md` (0.2.1 bullets, `capture-features.mjs`).
- [ ] Criterion 6: the editor walk — to the joint walk.
- [x] Commit (the owner's). _(Done at the close, 2026-10-22: `1cedc63`, `5808887`, `05db2a6`.)_

---

# Current state

- After 002.1a: the coded rules (R.111-15 `to_confirm`, R.111-16
  `confirmed`, R.111-28 `information`), the edges named and correctable,
  R.111-17 checked; R.111-16 and R.111-15 have no checks, R.111-28 no
  figure.
- **The platform gives:** `measures.distances` with `{ kind: 'line',
  points }` (at least two points, in the Site's CRS) and `{ kind:
  'building', buildingId }` targets (`site.ts:288-291`); `MapFeatureService
  .queryFeatures(kind, query)` on `map-features`, ambient: `'parcel'` is
  carte-gouv's Parcellaire Express source and `'building'` its BD TOPO + PCI
  source, each `MapFeature` with `rings` in the asked CRS, `properties`, and
  for buildings `height.eavesMetres` / `roofMetres` (above ground) and
  `ground`.

---

# Goal

R.111-16 is measured from every building to the opposite alignment of each
street edge; R.111-15 shows the distance between the plot's buildings with
its real result; R.111-28 shows the neighbours' average height beside each
building; and the plan carries the setback bands as derived lines.

# Out of scope

- The coded rules, edges, the section and R.111-17 (002.1a).
- **The RNU envelope outline** (the boundary inset per edge at a stated
  height): moved to 002.7, which builds it as slopes; and the 3D volume
  (096.9).
- Confirming R.111-15 (002.2's actions).

---

# Decisions

## DEC-1 — The opposite alignment, approximated

R.111-16 measures to the **opposite alignment**: the limit between the road
and the land across it. Nothing official gives it (proposal § 4.5: "Road
alignment: **No.**"). For each street edge (002.1a DEC-3), in order of
preference:

1. **A plan d'alignement** (`assiette-sup-*` with `suptype` `el7`, read in
   002.0) on the far side of the road: its line is the alignment.
   Assumption: "from the alignment easement EL7".
2. **The parcels across the road.** `queryFeatures('parcel', box)` over the
   street edge grown by 40 m, in the Site's CRS, `limit` 200. The French
   cadastre does not parcel the public road, so the gap between the plot
   and the facing parcels is the road's land. The facing parcel edges are
   those whose outward normal faces the street edge within 45° and that lie
   beyond the road centreline; the plot's own parcels (by `featureId`) are
   excluded. Their chain is the opposite alignment, sent as a `features[]`
   entry of category `alignment`, `official: false`, labelled "Opposite
   alignment (assumed from the cadastral parcels across the road)", and
   measured as a `line` target.
3. **The carriageway's far edge** (centreline offset by `widthMetres / 2`,
   width absent: 3 m, said), when no parcel faces the edge: labelled
   "carriageway edge — the alignment is further, so the limit read is
   stricter than the rule". That direction of error is the safe one, and it
   is said.

A required setback line (`typepsc` 15) does not exist under the RNU; if the
GPU returns one on a CC plot, it replaces the alignment as R.111-16 says,
and the assumption names it.

These are **cadastral** parcels, not anyone's Site boundary (002.1a
correction 1). A parcel query refusal (`!Array.isArray`) is a source entry
`unavailable` and falls through to path 3.

## DEC-2 — The R.111-16 checks

One call per building (enumerated as 002.1a DEC-6):

```js
measures.distances({ buildingId, outline: 'withRoofOverhangs',
  targets: alignments.map((points) => ({ kind: 'line', points })), ratios: [1] })
```

- The check is `worst.margin ≥ 0` (`d ≥ 1 × Δz` at every point; no minimum).
  `measured` is the worst pair's `distance`, `limit` its `rise` in `m`,
  `figure.dimension` the pair. `subject` is `{ kind: 'building', id,
  label }`; one check per building and street edge, the edge named in the
  label.
- `withRoofOverhangs` refused → `storeys`, with 002.1a DEC-6's assumption.
- Every `not_checked` reason of 002.1a DEC-7 applies, plus "no road found"
  and "the roads could not be read" (002.1a DEC-4).
- **Terrain extent.** The alignment lies 10–40 m beyond the boundary and may
  fall outside the project's terrain; with the all-or-nothing rise, the
  whole ratio would answer `outside-terrain`. Before asking, the extension
  compares the line with `site.terrain.extent`; a line outside it is
  `not_checked` with « le terrain du site ne s'étend pas jusqu'à
  l'alignement opposé — étendez le terrain », not a bare `outside-terrain`.
- The alignment's assumption is in every check's `assumptionIds`.

## DEC-3 — The R.111-15 checks: the real result

The horizontal distance between each pair of non-contiguous buildings on
the plot, `≥ 3 m`:

- between the project's buildings: a `{ kind: 'building', buildingId }`
  target (096.0b DEC-4, criterion 5 there), each unordered pair once;
- between a project building and the **existing building** when its
  relation is `kept` or `extended` (it is not an entity): a `line` target
  per part ring of `site.existingBuilding.parts[]` (closed by repeating the
  first point), the part named in the label. A `replaced` building is not
  measured.
- A distance of 0 is contiguous, and the pair is not checked.

The rule is `to_confirm` until the user confirms it (002.2's actions). The
check **carries its real result** — `no_issue` or `potential_issue` — from
the first read: the host counts a potential issue only on a `confirmed`
rule (`regulations.ts:60`), so an unconfirmed rule's issue is shown and not
counted, with no special wording from the extension.

## DEC-4 — R.111-28: the neighbours' average height

`queryFeatures('building', box)` over the Site boundary's box (else the
plot's) grown by 50 m, `limit` 500:

- kept when a ring point lies within 50 m of the Site boundary (the
  extension's own point-to-segment distance, a few lines: the host offers
  no distance between two foreign outlines);
- the plot's own existing building excluded, by `featureId` against
  `site.existingBuilding.parts[].featureId`;
- the average of `height.roofMetres` (else `eavesMetres`), neighbours
  without a height counted and named ("3 of 11 without a height").

Shown as a `fields` block in the `checks` view beside each building's
`projection().height.topAboveGround.fromLowest`, and in R.111-28's rule
`conditions`. Never a check, never a result: "partly built sector with a
unity of appearance" is the authority's judgment. The radius is said. A
refusal is a source entry `unavailable`, and the block says why.

## DEC-5 — Bands, as per-edge offset lines

R.111-16 and R.111-17 depend on the height of each point, so there is no
single setback line. The report sends, per edge, `features[]` entries of
category `setback-band`, `official: false`, each a **`line`** — the edge
offset inward by a distance, clipped to the edge's own length (no polygon
inset: a concave boundary's inset is real geometry the host does not
offer, and 002.7 owns the envelope):

- side and rear edges: the 3 m minimum of R.111-17;
- every edge with a check: the line at the check's current `limit`
  (R.111-17's `max(3, 0.5·rise)`, R.111-16's `rise` measured from the
  alignment), labelled with that distance and "at the design's current
  height".

The theoretical envelope outline under the RNU is 002.7's.

---

# Steps

1. **The opposite alignment** (DEC-1): the EL7 path, the parcel path, the
   carriageway fallback; the alignment as a derived feature.
2. **R.111-16** (DEC-2), with the terrain-extent pre-check.
3. **R.111-15** (DEC-3), project pairs and the existing building.
4. **R.111-28** (DEC-4).
5. **Bands** (DEC-5).
6. **Fixtures:** Brouennes AB0280 and the Mouzay parcel of 002.1a: facing
   parcels and neighbouring buildings as normalised `MapFeature[]`, and
   recorded measures answers.
7. **Tests**, then the walk on Brouennes.

# Acceptance criteria

1. With facing parcels stubbed 12 m across a 6 m carriageway, the opposite
   alignment is their edge, labelled as assumed from the cadastre; without
   them, the carriageway edge, labelled stricter; with an EL7 line, the EL7
   line (test).
2. R.111-16 on a building whose worst pair has margin ≥ 0 is `no_issue`,
   < 0 `potential_issue`; an alignment outside `site.terrain.extent` is
   `not_checked` with the extent reason (test, measures stubbed).
3. Two buildings 2.5 m apart give R.111-15 `potential_issue` while the rule
   is `to_confirm`; 3.5 m gives `no_issue`; contiguous (0 m) gives no
   check; a kept existing building is measured through `line` targets, a
   replaced one is not (test).
4. R.111-28 shows the neighbours' average height and the count without a
   height, excludes the plot's own building, and is never a check (test).
5. Bands are `setback-band` `line` features, `official: false`, one per
   edge and limit, inside the boundary (test).
6. In the editor, Brouennes AB0280 with a drawn building shows R.111-16
   and R.111-15 checks updating within a second of moving a wall (manual).

# Testing strategy

- **Unit:** the alignment on synthetic parcels and roads, the evaluations
  with stubbed measures, the neighbours' filter and average, the offset
  lines.
- **Fixtures** of SDK answers, never WFS. **No live call.**

# Risks

- **Dense urban CC plots** where the facing parcels are the road's own
  parcels (some communes parcel their roads): the facing edge is then a
  parcel across a parcelled road; the 40 m search and the normal test catch
  most; the assumption says what was taken.
- **Terrain too small** for the alignment (DEC-2): said, with the remedy.
- **R.111-28's radius** (50 m) is the extension's choice; the article does
  not say (owner question 2 of 002.1, answered with the recommendation).

# Definition of Done

The criteria walked against the code; the Design Contract boxes checked;
`node --test fr-urban-rules/tests/*.test.mjs` green; the walk on Brouennes recorded.

---

# Dependencies on platform sprints

| Sprint     | What this sprint needs |
| ---------- | ---------------------- |
| **096.0b** | Distance to a `line` (the opposite alignment) and to a `building` (R.111-15) with the per-point `worst` pair (DEC-4 there, criteria 4 and 5) |
| **096.1**  | Those measures on the SDK: 096.1 DEC-10, criteria 15 and 16 |
| **096.2**  | `official: false` features of category `alignment` and `setback-band`, `line` geometry, `figure` on a check |
| **096.5**  | Derived features drawn apart from official ones (not needed for acceptance) |

# Review (2026-10-20)

Created by splitting 002.1 at its adversarial review against the
implemented SDK 1.27 (decision of the coordinator, on the owner's behalf).

- Takes the former DEC-5 (opposite alignment → DEC-1), DEC-6's R.111-16,
  R.111-15 and R.111-28 parts (→ DEC-2, DEC-3, DEC-4) and DEC-8 (→ DEC-5).
- **Bands are per-edge offset lines**, not a polygon inset; **the RNU
  envelope outline moves to 002.7**.
- **R.111-15's check carries its real result** while the rule is
  `to_confirm`; the host does not count it (it read "rule to confirm,
  outside the issue count").
- R.111-15 also measures to a kept or extended existing building through
  `line` targets.
- R.111-16 pre-checks the terrain's extent against the alignment.
- Check shapes are the SDK's (`ruleId`, `subject`, `measured`, `limit`,
  `figure`), refusals told by `Array.isArray`.
