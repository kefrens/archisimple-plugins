# Sprint 002.20 — Limits Are Proposed, Cut Areas Are Red

> **Status:** Landed in the working tree (2026-11-03), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.17.0**, `sdkVersion` **"1.40"** unchanged.
>
> **Milestone:** [Site Buildable Area](../../../archisimple/docs/milestones/site-buildable-area/README.md), Phase B.
>
> **Platform half:** [103.4](../../../archisimple/docs/sprints/sprint-103.4-cut-areas-in-red.md) gives the host a red role for a derived
> `prescription` on the plan and a slab in 3D; ADR-0111 Rule 24.

## Goal

Two things the owner asked after walking Peynier (parcels AP 0163 and AP 0165, 2026-11-03): **a limit is not a ban**, and **what was taken
out should be seen**.

On that plot the theoretical buildable area said « Les zones retirées ne laissent aucun terrain », while an espace boisé classé of
501.2 m² was the only thing that really took ground. The rest was the `02` « Risque feux en RZ et UF », a fire-risk zone that covers both
parcels, cut by default. A `02` constructibilité limitée limits building; it does not forbid it, and when it covers the whole plot cutting
it by default always empties the plot.

## Decisions

- **DEC-1 — `02` is proposed, not cut** (owner, 2026-11-03). Only `01` and `05` are cut without being asked. A `02` with a surface is
  shown in the area's own view (under « À confirmer », with the area it would take) like `07`, and takes nothing until « Retirer de
  l'aire ». The reasons it is in the area's view and not the Prescriptions view: it is the view that says what each area takes of the
  plot, and a `02` is the one that most needs that sentence. « Garder dans l'aire » is gone from the buttons (`overridable` stays in the
  table for a type that needs it; none does).
- **DEC-2 — A stored « keep » is harmless.** 0.16.0 wrote `choice: 'keep'` for a `02`. It is still a valid entry (the section stays
  writable), and the `02` is proposed: the old choice decides nothing. A stored « subtract » for a `02` cuts it, as for `07`.
- **DEC-3 — The cut areas are drawn.** Each area taken out (state `applied`: `01`, `05`, and a `02`/`07`/other the user took out) is
  reported as a **derived `prescription`** feature (`excluded:n`, `official: false`, the prescription's own words as its label), its rings
  **clipped to the Site boundary** — two overlays, the boundary less the area, then the boundary less that, so a forest of a few
  kilometres is its part on the plot and no more. An area on the plot's whole ground is the plot; one that does not touch it is not
  drawn. No new category and no SDK change: the host has a red role for a derived prescription (platform 103.4). A proposed or an
  area not cut is never red.
- **DEC-4 — Hide and show.** A button under what narrows the area, « Masquer les zones retirées » / « Afficher les zones retirées »,
  stored in the section as `exclusionsHidden` (`{ plot, at }` per plot, shown being the default so only a hidden plot is stored; a
  malformed one makes the section read-only like the others). `hide-exclusions` / `show-exclusions`, one undo entry each. It draws
  less; it changes no area. Shown, a line says the areas are drawn in red on the plan and in 3D.
- **DEC-5 — Drawn although no ground is left.** When the exclusions take all of the plot, the area has no outline but the red areas
  are still reported: they are the explanation.

## Acceptance criteria

`fr-urban-rules/tests/buildable-area.test.mjs`; the recorded suites still pass.

1. `02` is proposed with the area it would take; « Retirer de l'aire » cuts it, « Ne pas retirer » puts it back; one undo entry each.
2. A `02` over the whole plot cuts nothing by default; its proposal reports the whole of what is left; taking it out says « no ground »
   apart and offers the way back.
3. A « keep » stored by 0.16.0 is read without harm.
4. Each cut area is a derived prescription feature clipped to the plot; a proposed one, one off the plot and one with nothing cut are none;
   one over the whole plot is the plot.
5. The hide/show button hides and shows them, writes one entry, keeps the other choices, and changes no area.
6. A malformed `exclusionsHidden` makes the section read-only and is never overwritten.

## Outcome

- **Built.** Extension tests 510 (2 skipped; 508 pass): the 002.17 tests that assumed `02` is cut now say it is proposed (criteria 2, 3, 7,
  8, 9 and Lyon's Envelope test); `LYON_FLOOD_KEY` and its `keepingFlood` helper in `tests/helpers.mjs` are removed, since Lyon's recorded
  acceptance no longer needs the overlay kept.
- **Deviations.** (1) The red areas are reported as `prescription` (derived), not a new category: the owner's request needed no new
  SDK vocabulary, and a new category would have been a minor and a lockstep. The cost is the legend's words on the plan, « Prescription
  (dérivé) · <label> ». (2) The paper sheet does not draw them: its plot-plan block asks for the `envelope` category only.
- **Unverified.** The real plugin on the real Peynier plot in the owner's editor (the browser pass used a test package that reports the same
  features); the clipping on a very detailed forest outline (cost is two overlays per area, at most 24).
