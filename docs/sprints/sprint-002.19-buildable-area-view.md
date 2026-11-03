# Sprint 002.19 — Buildable Area View

> **Status:** Landed in the working tree (2026-11-03), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.16.0**, `sdkVersion` **"1.40"** unchanged.
>
> **Milestone:** [Site Buildable Area](../../../archisimple/docs/milestones/site-buildable-area/README.md), Phase B. Mockups:
> https://claude.ai/artifact/XnQp1edRKQ6eiK9Xh5rFyC (§ 4, the panels).
>
> **Platform half:** 103.2 names the host's own strings (the layer, the legend row, the Display switch) and writes ADR-0111 Rule 23.

## Goal

The Envelope view becomes the **theoretical buildable area**: what is left, what narrowed it, what waits for the user, said
theoretically and cited.

## Decisions

- **DEC-1 — The name** (owner, 2026-11-03: the milestone's recommendation): English « Theoretical buildable area », French
  « Aire d'implantation théorique »; the 3D volume keeps « Enveloppe théorique ». « Zone constructible » and « emprise constructible » are
  never used. « Buildable » only behind « theoretical ». The keys of the view say nothing of a right (the recorded acceptance guard).
- **DEC-2 — The headline.** Three `stat` blocks: the Site boundary's area, the area left (« théorique, d'après les règles
  confirmées ») and its share. The boundary's area is the **Site boundary's**, not the plot's.
- **DEC-3 — What narrows it.** A table: cut, source, area taken alone. A setback by edge role (the governing rule's label), an exclusion
  (its words verbatim, « Prescription 01 du plan »), a band (« plafond, sans surface retirée »). When the cuts overlap, a notice.
- **DEC-4 — What is left to confirm.** The `07` proposals with the area each would take and « Retirer de l'aire », the `02` kept and the
  subtracted proposals with their way back, a notice when a choice was reopened by a new document version.
- **DEC-5 — Not clipped.** The area is not cut at the plot. When the Site boundary is larger than the plot by more than 1 % (and 1 m²), an
  assumption says so; it is not said when they match (the recorded baselines are byte for byte).
- **DEC-6 — No boundary, several pieces.** A Site with no boundary says so and how to get one (« Choisissez un terrain, ou tracez la limite
  du site »); a boundary of pieces and holes reaches the sheet's plot plan and the host's counts unchanged.
- **DEC-7 — The caution.** The view ends with « Théorique, d'après les règles confirmées : vérifiez le règlement et le cadastre avant de
  vous y fier. » — in a notice, since the sheet prints assumptions, not notices.

## Acceptance criteria

All in `fr-urban-rules/tests/buildable-area.test.mjs`; the recorded suites still pass.

1. The names, in both locales; no legal word; the area's own strings say nothing of a right.
2. A cited, theoretical view: the caution last, no verdict word in its blocks, a source on every row, the headline before the lists.
3. Overlapping cuts are said; cuts that do not overlap are not.
4. The boundary past the plot is an assumption and never a clip; a boundary that matches says nothing.
5. No boundary: the notice and nothing drawn; pieces and a hole: the plot plan names the layer.
6. A read again is the same view.

## Outcome

- **Built.** Extension tests 505 (2 skipped); the earlier sprints' pins changed where behaviour changed on purpose (a split plot is pieces,
  the Envelope view's first table is the list of cuts, the band form, 61 assumptions with their details, the wording guard's « theoretical
  buildable area »).
- **Deviations.** (1) The feature's label stays « Enveloppe théorique » (see 002.17). (2) The `README`'s « Never "buildable" » line is
  rewritten, not removed: « buildable » is allowed behind « theoretical ». (3) The capacity's area test of the milestone's list was not
  written: the reader of the capacity tests needs the surfaces reader and measures; the code path reads the net area of the rings.
- **Unverified.** The view in the editor; the regulation sheet's content for the area (it prints assumptions and the plot plan, not the
  view); the assistant's « what is left to build » answer (it reads `envelopeArea`, changed to the net area).
