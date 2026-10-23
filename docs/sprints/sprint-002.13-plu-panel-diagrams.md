# Sprint 002.13 — PLU Panel Diagrams

> **Status:** **Implemented (2026-10-22, uncommitted).** `fr-urban-rules`
> **0.11.0**, `sdkVersion` **1.36**, with the platform's 096.22; walked on the
> five plots by 096.23. Written from the owner's decisions of 2026-10-22 on the
> "PLU Panel Redesign" boards
> (https://claude.ai/artifact/QWS3g8UeehfCvWo1J2JEQb). See **Outcome**.
>
> **Repository:** `archisimple-plugins`, the `fr-urban-rules` extension only.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 12, Phase 5. Walked jointly with the platform's **096.23** (Regulation
> Panel Acceptance), which closes Phase 5.
>
> **Prerequisites:**
>
> - **Platform:** Sprint 096.22 (SDK 1.36: `plot-plan` in a view, the `edges`
>   and `height-section` blocks, an assumption's `figure`). The package
>   declares `sdkVersion` **"1.36"**. A lockstep release.
> - **Plugins:** 002.12 (0.10.0: the views' order, icons, groups, short
>   assumptions).
>
> **Version:** `fr-urban-rules` **0.10.0 → 0.11.0**. 002.10 is renumbered
> **0.12.0** (002.12's header).
>
> **Sizes:** three blocks placed, one table retired, one figure named, the
> acceptance checks over the five fixtures. Small.

---

# Sprint Design Contract

- [x] **The host draws; the package places.** The package adds block
      references and one figure word; it sends no coordinate it did not
      send before and computes no picture.
- [x] **Nothing the Edges view said is lost.** The edge table's role and
      "why" are in the host's edge list (role, assumption chip); the
      **Set role** actions stay.
- [x] **No change to what is read, measured or checked** (the expected
      values of 002.9 hold).

**Verified against the source (2026-10-22).** _The host draws; the package places:_ the package adds
`{ kind: 'plot-plan', categories: ['envelope'] }`, `{ kind: 'edges' }`, a `height-section` naming
check ids and one figure word, and sends no coordinate it did not send before (the dimensions are
002.1's). **Honoured.** _Nothing the Edges view said is lost:_ the role and the « why » are the
host's edge list (role word, assumption chip), the **Set role** actions stay; the length column is
dropped by the owner's answer to Q1, which the box itself anticipates ("its length column is dropped").
**Honoured.** _No change to what is read, measured or checked:_ `acceptance.test.mjs` (002.9's
expected values) and `panel.test.mjs`' digest test pass unchanged. **Honoured.**

---

# Current state

_Read 2026-10-22 at the 0.9.0 tree; 002.12's changes assumed._

- **The Edges view** (`edgesView`, `fr-urban-rules/src/index.js:7933`): a
  `table` of edge number, role, length and "why" (the role's assumption,
  `whyOf`), then the **Set role** / **Forget** actions (`:7974-8034`).
- **The Envelope view** (`envelopeOf`, `:10544`): notices, what shaped the
  envelope, the assumptions it rests on; the feature with its volume.
- **The height checks** carry `height-lowest-ground` in their
  `assumptionIds` (`:9896-9899`), with `measured` and `limit`.
- **The setback checks** are `boundary-edge` subjects with
  `figure.dimension` (002.1a–002.1b), which **Show on plan** draws.

---

# Goal

The Limites et reculs section shows the plot top view and the edge list;
the Enveloppe section shows the height section; the assumption « Hauteur
depuis le terrain le plus bas » shows its figure.

# Out of scope

- Printing the diagrams (096.22 question 4).
- Anything 002.12 does.

---

# Decisions

## DEC-1 — Limites et reculs

`edges` view: `{ kind: 'plot-plan', categories: ['envelope', 'setback-band'] }`
then `{ kind: 'edges' }`, then the **Set role** actions as today. The table
goes: its role and "why" are the host's edge list (the role word and the
edge's `assumptionId` chip, 096.22 DEC-4); its length column is dropped — the
letter on the plot view identifies the edge, which the length did (question
1). Without a boundary, the view keeps its `noBoundary` notice and no
diagram.

## DEC-2 — Enveloppe

`envelope` view: `{ kind: 'height-section', checkIds: [<the height checks>] }`
after the notices, when at least one height check was measured; its caption
`fr-urban-rules.envelope.section` (« Enveloppe en coupe »).

## DEC-3 — The figure

`assume('height-lowest-ground', …)` gains `figure: 'height-from-lowest-ground'`.
No other assumption has a figure in this sprint.

## DEC-4 — The panel's acceptance, FR half

Over the five recorded reports: every assumption has a title of at most 80
characters and a detail (002.12); every `boundary-edge` check with a
`measured` has a `figure.dimension` (the plot view needs it); each view's
icon and group are DEC-1 of 002.12's. These are the checks 096.23 criterion 6
cites.

---

# Steps

1. `edgesView`: the two blocks; the table retired.
2. `envelopeOf`: the section block.
3. The figure on `height-lowest-ground`.
4. `sdkVersion` "1.36", 0.11.0, CHANGELOG.
5. Tests (DEC-4); the walk with 096.23.

# Acceptance criteria

1. On every recorded plot with a Site boundary, the Edges view holds a `plot-plan` and
   an `edges` block and the Set role actions, and no `table`
   (`reading.test.mjs`).

   **Walked:** `tests/diagrams.test.mjs` ("criterion 1": on every recorded plot with a Site boundary — at least three of the five — the Edges view's first blocks are the `plot-plan` and `edges`, its `actions` are `set-edge-role`, no `table`; without a boundary the view keeps its notice) and `rnu.test.mjs` criterion 5 (changed with a comment).

2. On a plot with a measured height check, the Envelope view holds a
   `height-section` naming exactly the height checks (`envelope.test.mjs`).

   **Walked:** `tests/diagrams.test.mjs` ("criterion 2"): Lyon and Rochefort measure a height; the section names exactly the measured height checks of a building, after the notices; the plots that measure none carry none.

3. `height-lowest-ground` carries the figure (`rules.test.mjs`).

   **Walked:** `tests/diagrams.test.mjs` ("criterion 3"): `height-lowest-ground` carries `height-from-lowest-ground`, no other assumption has a figure.

4. DEC-4's three checks pass over the five fixtures
   (`acceptance.test.mjs`).

   **Walked:** `tests/diagrams.test.mjs` ("criterion 4 / DEC-4", three tests): every assumption's title at most 80 characters and a detail in both locales; every `boundary-edge` check with a `measured` has a finite `figure.dimension` and names an edge of the report; each view's icon and group (002.12's).

5. 002.9's expected values hold (`acceptance.test.mjs`).

   **Walked:** `acceptance.test.mjs` unchanged and green (424 tests, 422 passed, 2 skipped as before).

6. `package.json` declares 0.11.0 and `sdkVersion` "1.36"
   (`package.test.mjs`).

   **Walked:** `tests/package.test.mjs` (0.11.0, `sdkVersion` "1.36").

7. Walked in the editor with 096.23 on the five plots, both locales.

   **Walked:** with the platform's 096.23 (see its Outcome): the five plots in the editor with the real 0.11.0, live, both locales, both themes (`regulationsPanelAcceptance.spec.ts`); the pictures showed the view's label to be the boards' (« Limites et reculs ») rather than « Côtés de la limite du site », and Set role to say a letter, both changed in 0.11.0.


# Testing strategy

The package's suites over the fixtures; the joint walk.

# Risks

- **A plot whose edges carry no dimension** (a not-checked edge) shows an
  edge list with « — » and no distance on the plot view; correct, but the
  walk should look at one (Mouzay).

# Questions for the owner

1. **Drop the edge lengths?** **Recommendation:** yes; the letter on the plot
   view now identifies an edge, and the length was there only to do that.

# Definition of Done

The acceptance criteria walked with 096.23; the CHANGELOG and the milestone
row updated; the package built.

# Dependencies

| Item                | Need                                                                       |
| ------------------- | -------------------------------------------------------------------------- |
| **Platform 096.22** | SDK 1.36: `plot-plan` in a view, `edges`, `height-section`, `figure`       |
| **002.12**          | The views' order, icons, groups; the short assumptions                     |
| **Version needs**   | package **0.11.0**, `sdkVersion` **"1.36"**                                |
| **Platform 096.23** | The joint walk                                                             |

---

# Outcome

_Implemented 2026-10-22, uncommitted. `fr-urban-rules` 0.10.0 → **0.11.0**, `sdkVersion` 1.35 → **1.36**, a lockstep release with the platform's 096.22 (a web image without it refuses the manifest)._

**The owner's answer, 2026-10-22, "as recommended" — a decision taken on the owner's behalf, reversible.** Q1: the edge lengths are dropped from Limites et reculs; the letter on the plot view identifies an edge.

**What landed.** `edgesView` sends `{ kind: 'plot-plan', categories: ['envelope'] }` and `{ kind: 'edges' }` and keeps the **Set role** actions and the unapplied corrections' tables; `panelShaped` (002.12's final shaping step) inserts a `height-section` naming the measured height checks of a building after the Envelope view's notices, with the caption `fr-urban-rules.envelope.section` (« Enveloppe en coupe »), and gives `height-lowest-ground` the figure `height-from-lowest-ground`. `tests/diagrams.test.mjs` (eight tests over the five recorded reads), `package.test.mjs` and `rnu.test.mjs` updated; CHANGELOG; `package.json` 0.11.0 and 1.36; `dist/` rebuilt (`tools/build-index.mjs`, `tools/check-index.mjs --platform ../archisimple`: 2 of 2 packages accepted). The five recorded reports pass the platform's own `checkedReport` with **nothing dropped** (a scratch script over `packages/extension-host/dist`, run 2026-10-22).

**Deviations from the sprint.**

- **`categories: ['envelope']`, not `['envelope', 'setback-band']`**: the host's plot view draws the envelope only (096.22 Outcome), so naming the band would promise a layer that is not drawn.
- **The height section is placed by `panelShaped`, not `envelopeOf`**: the height checks exist only in the final report; `envelopeOf` builds the view before them. The figure is set there too (`assume()` takes a text only).
- **The edge table's keys went with it** (`edges.column.edge`, `.length`, `.why` and `edges.why.*`, both catalogues; `whyOf` and `WHY_KEYS`); `column.role` and `column.ends` stay, for the corrections' tables.
- **Two changes the walk asked for** (096.23): the Edges view is labelled « Limites et reculs » / « Boundaries and setbacks » (`fr-urban-rules.view.edges`; it read « Côtés de la limite du site »), and the **Set role** buttons name an edge by the host's letter (« Fixer le rôle de la limite A ») — the plot view and the edge list letter the edges, so a number would name another. `rnu.test.mjs`' `subjectOf` reads the letter.
- **DEC-4's checks are in `diagrams.test.mjs`**, not `acceptance.test.mjs`, which stays 002.9's expected values untouched; criterion 4 and 5 are both walked there and in the unchanged `acceptance.test.mjs`.
- **What the five recorded plots show**: Lyon, Mouzay and Brouennes each have one edge check with a dimension, Gordes and Rochefort none (the captures hold no building near an edge); Lyon and Rochefort measure a height. The plot view of Gordes is therefore the boundary with 33 letters (the host places what fits) and no distance; this is the data, not a defect.

**Gates.** `node --test fr-urban-rules/tests/*.test.mjs`: 425 tests, 423 passed, 0 failed, 2 skipped (as before); `tools/build-index.mjs` builds 0.11.0, `tools/check-index.mjs` accepts the index (2 of 2).

**Not verified.** A screen reader; the French wording of « Enveloppe en coupe » and of the figure's labels (the host's, `regulations.figure.*`), which the owner reads in 096.23's pictures.
