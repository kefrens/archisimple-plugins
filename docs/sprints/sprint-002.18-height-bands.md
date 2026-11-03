# Sprint 002.18 — Height Bands

> **Status:** Landed in the working tree (2026-11-03), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.16.0**, `sdkVersion` **"1.40"** unchanged; the service is untouched.
>
> **Milestone:** [Site Buildable Area](../../../archisimple/docs/milestones/site-buildable-area/README.md), Phase B. Owner (2026-11-03):
> « if we are limited to 2 meters high in the first 2 meters of a parcel boundary then we should take this into account ».
>
> **Platform half:** none. A `height` ceiling with `within` rings is SDK 1.29.

## Goal

« N m high within M m of the limits », entered by hand, drawn as a strip on the plan and as a ceiling in the volume — without
taking any area from the buildable area.

## Out of scope

- Reading a band from the règlement: the extraction schema has no such field, and adding one raises `PROMPT_VERSION` and
  `SCHEMA_VERSION`, which discards every cached extraction (milestone Q10). It waits for the AI revamp's model choice.
  **Done by [Sprint 002.21](sprint-002.21-setback-height-exemption.md) (2026-11-03), at the owner's request:** a band is read from the
  règlement as the `strip` of a height item and confirmed through the path below; `SCHEMA_VERSION` did not move (the field is optional),
  so no cached extraction was lost.
- A check of a building against a band. A band is not a verdict, and no check reads it.

## Decisions

- **DEC-1 — An entered rule with a band.** « Ajouter une hauteur limitée à une bande » (`add-height-band`): a height, a width (0.1 to
  50 m) and the edges it runs along (all, street, side, rear, side and rear). It is an **entered** `height_total` that carries
  `band: { depth, roles }`; a band of another kind, or a malformed one, makes the section read-only like any entry not recognised.
  In the report its kind is **`other`**: the checks, the headroom and the capacity read `height_total` and would take 2 m for the
  building's maximum. Its sentence says what it is (« Hauteur limitée à une bande de 3 m le long des limites latérales »).
- **DEC-2 — The strip.** The band's ring set is the boundary and, as holes, the boundary inset by the depth on the edges of the
  band's roles — which a ceiling's `within` reads even–odd as the strip between them. A depth that leaves no ground is the whole
  boundary; no edge with the roles is « not applied » with its reason. The strip's ends are rounded as a setback's are (an assumption
  says so).
- **DEC-3 — Drawn on the plan.** Each band is a derived `setback-band` feature (`envelope-band:n`, no volume) with the strip's rings
  and the words « 2 m de haut sur 3 m le long des limites ». It is not an `envelope` feature: that category is the area itself, which
  the plan and the sheet draw as such, and a strip along the boundary drawn as the area would read as the area. The legend row is the
  category's (« Bande de recul, dérivée »: the host has one row per role); a row of its own would be a new category, an SDK minor,
  not planned. The setback bands' « approximate » assumption is added with it.
- **DEC-4 — It lowers the ceiling, not the area.** The list of what narrows the area says « plafond, sans surface retirée ». A band
  beside a height over the whole plot keeps both when it is lower, and is dropped when it is not.
- **DEC-5 — Editing.** An entered band's edit form shows its height, width and edges; the refusals have their own words.

## Acceptance criteria

All in `fr-urban-rules/tests/buildable-area.test.mjs`.

1. The form's fields; the entry (`height_total`, the limit, the band); the report's rule is `other` with its sentence and no check.
2. The ceiling's `within` is the strip along the roles' edges (even–odd, probed point by point); the area is unchanged; the strip is
   a feature; the list says « ceiling »; the assumption.
3. Beside a height over the whole plot, both ceilings stay; a band that is not lower adds nothing.
4. A depth past the plot is the whole plot; a bad depth, an unknown edge choice or a missing value is refused and writes nothing; edit
   shows and writes the band.
5. A malformed band makes the section read-only.

## Outcome

- **Built** as above (25 tests of `buildable-area.test.mjs` across the three sprints; extension 505, 2 skipped).
- **Deviations.** The report's rule is `other`, not `height_total` (DEC-1) — the only way the checks and the capacity leave it alone
  without touching them.
- **Unverified.** The strip on the plan and the stepped ceiling in 3D in the editor; the legend's wording for the strip.
