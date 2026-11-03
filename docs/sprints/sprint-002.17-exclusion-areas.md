# Sprint 002.17 — Exclusion Areas

> **Status:** Landed in the working tree (2026-11-03), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.16.0** (shared with 002.18 and 002.19), `sdkVersion` **"1.40"**
> unchanged. The service is untouched.
>
> **Milestone:** [Site Buildable Area](../../../archisimple/docs/milestones/site-buildable-area/README.md) (platform), Phase B.
> Owner decisions of 2026-11-03: two concepts; the sure exclusions cut by default; the others on the user's word.
>
> **Platform half:** none required. The buildable area is the ground of the existing `envelope` feature, whose rings the host
> already reads as pieces and holes (`featurePolygons`, `volumeInputs`). The default Site boundary (103.0) and the one-outline plot
> (103.1) are the platform's own sprints.

## Goal

Take out of the theoretical buildable area what the plan itself rules out: the espace boisé classé, the emplacement réservé and the
areas of limited constructibility, each with its source — and let the user decide on the others.

## Out of scope

- A buffer round an exclusion area. They are used as published (an assumption says so).
- Any verdict. A design outside the area is not flagged (milestone Q11).
- Reading an exclusion from the règlement's text.

## Decisions

- **DEC-1 — Which prescriptions cut.** CNIG `01` and `05` with a surface cut the area without being asked. _(`02` was cut too, with
  « Garder dans l'aire », until [Sprint 002.20](sprint-002.20-proposed-limits-red-cut-areas.md): it limits and does not forbid, and one
  covering a whole plot took all its ground. It is proposed now, like `07`.)_ `07`, `02` and any type the package
  does not name, with a surface, are **proposed**: shown, cutting nothing until the user says. Types that are a number or a statement
  (`15 17 18 22 23 38 39 42 44`) are never offered. A line or a point of a cutting type removes no area and is listed with its reason.
  At most **24** areas are cut at once (each is one more overlay); the rest are listed, and an assumption says the area is wider.
- **DEC-2 — Where the choices live.** The section gains `exclusionChoices`: `{ key, plot, choice: 'subtract' | 'keep', idurba,
  datvalid, at }`, keyed by `drawnKey` (type, subtype and a digest of the words and the place), one entry per area and plot. The
  member is validated like the others (a malformed one makes the section read-only and nothing overwrites it). Two Requests,
  `set-exclusion` and `forget-exclusion`, one undo entry each. A choice made against another document version (`idurba` compared
  case-insensitively, `datvalid` as read) **reopens**: it decides nothing, the default stands, and a notice says so.
- **DEC-3 — Where they are asked.** `07` in the area's own view, under « À confirmer », with the area it would take. Every other
  proposed type in the **Prescriptions** view, one action each (milestone Q8). A subtracted proposal and a kept `02` are undone from
  the area's view.
- **DEC-4 — Pieces and holes.** `insetByRole(ring, distances, lines, exclusions)` answers `rings`: every piece counter-clockwise,
  every hole clockwise. A setback that splits the plot gives its pieces; only « no ground left » is refused, and when the
  setbacks leave ground and an exclusion takes all of it, the notice says so (`collapsedByExclusions`). `ring` stays when the answer is
  one piece with no hole. The overlay (`regionLess`) takes any polygon as a cut, as a group of rings read even–odd; the setbacks'
  strips are still convex.
- **DEC-5 — An exclusion along a boundary edge** lies on the same line as an edge of the boundary and makes the overlay degenerate. It
  is moved by a tenth of a millimetre — each area by its own multiple — in each of four directions, and the answer with the fewest
  loops is kept (a notch, not a hole a hair inside the boundary).
- **DEC-6 — What narrowed it.** For each cut the view lists the area it takes **on its own**: the boundary's area less the area with
  that cut alone (a setback by edge role, an exclusion over the setbacks). Cuts overlap, so the figures need not add up; when
  their sum is more than the area removed in all, a notice says so. Nothing is invented.

- **DEC-7 — The host's point budget.** The host refuses a whole report past 100,000 points. The area's rings carry at most 20,000; past
  that the area is not drawn and the notice says so (`shape`), never a report lost for one detailed exclusion. Not exercised by a test.

## Steps

1. Generalise `regionLess` to cut groups of rings, even–odd; keep the setbacks' behaviour byte for byte.
2. `insetByRole`: exclusions, several pieces, holes, the shift; update its consumers (`envelopeOf`, the capacity, the programme).
3. `exclusionItemsOf`, the section member, the two builders, the two actions and their undo label.
4. `envelopeOf`: the cut, the list of cuts and proposals, the `collapsedByExclusions` notice, the assumptions.
5. The Prescriptions view's actions for the other proposed types.
6. Strings, README, CHANGELOG; tests.

## Acceptance criteria

All in `fr-urban-rules/tests/buildable-area.test.mjs`, from recorded answers and a prescription layer of the test's.

1. An espace boisé classé is cut with no confirmed rule: a hole, its row (label, source, area), the assumption, no action.
2. `05` and `02` are cut; the headline figures are the boundary, the area and its share; only the `02` offers « Garder dans l'aire ».
3. « Garder » puts a `02` back, writes one entry, says why it is not applied; « Retirer à nouveau » undoes it.
4. A `07` is proposed with the area it would take; « Retirer de l'aire » cuts it, « Ne pas retirer » forgets it.
5. Another type is offered in the Prescriptions view only; the numeric types never.
6. A line is listed with its reason; thirty areas give twenty-four cuts and six reasons.
7. A choice for another document version decides nothing and is said; `PLUi` against `PLUI` reopens nothing.
8. An exclusion that splits the plot gives two pieces; one that takes it all gives the notice and the way out.
9. A malformed section is read-only and is never overwritten; a choice request that names nothing is refused.
10. Geometry: a hole, a concave exclusion along the boundary, a group with its own hole, setbacks and overlapping exclusions, either
    winding, pieces.
11. A live read on a plot with a `01` agrees with an independent sample of the area.

## Outcome

- **Built** as above. Extension tests: 505 (2 skipped), 25 of them new in `buildable-area.test.mjs` (shared with 002.18 and 002.19).
- **Deviations.**
  1. **Lyon's reference plot has an empty area by default.** Its `02` « Risque d'inondation par ruissellement » covers the whole plot,
     so the area is empty until the overlay is kept, and the notice says it is the exclusion. The owner's decision stands; the
     consequence is real and worth looking at on the NAS. The reference captures are read with that one choice added in
     `tests/helpers.mjs` (`LYON_FLOOD_KEY`), and the recorded `expected-002.9.json` is untouched.
  2. **`07` is asked in the area's view; the other types in the Prescriptions view**, so a plot full of informational overlays (Lyon
     has three of a type the package does not name) does not fill the area's view with proposals.
  3. **The feature's label stays « Enveloppe théorique »** (the plan's legend row and the 3D key read it from the one feature; the
     recorded acceptance and `sheet.test.mjs` pin it). The view and the section carry the new name; naming the plan's row is the
     platform's 103.2.
- **Unverified.** The capacity and the programme's area read the net area of every ring (`envelopeArea`): the code path is changed
  and no test reads it. The editor-side walk (the panel, the hole on the plan and in 3D) needs the platform build and the
  Development Repository. A refusal of `set-exclusion` by the host's own validation of the action's `target` is not exercised.
