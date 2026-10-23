# Sprint 002.15 — PLU Surfaces Content

> **Status:** **Implemented (2026-10-22, uncommitted).** `fr-urban-rules` **0.13.0**, `sdkVersion`
> **1.38**, with the platform's 096.27. Written from the
> owner's round-2 look and mockup (the Surfaces view) and his answer to Q2
> (a segmented choice for the three definitions: yes), and a reading of
> `fr-urban-rules/src/index.js` at the 0.11.0 tree.
>
> **Repository:** `archisimple-plugins`, the `fr-urban-rules` extension only.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 12, Phase 5, round 2. Platform README § 12.4.
>
> **Prerequisites:**
>
> - **Platform:** Sprint 096.27 (SDK 1.38: the `stat`, `choice` and `section`
>   blocks; the budget meter). The package declares `sdkVersion` **"1.38"**.
>   A lockstep release.
> - **Plugins:** 002.14 (0.12.0).
>
> **Version:** `fr-urban-rules` **0.12.0 → 0.13.0**. 002.10 becomes **0.14.0**.
>
> **Sizes:** the Surfaces view recomposed (about six groups), its strings in
> two locales, the tests that read its blocks. Medium.

---

# Sprint Design Contract

- [x] **The readings do not change.** The emprise, the budget, the
      pleine-terre, floor-area, ceiling and capacity figures, and every check
      the view makes, are byte-identical to 0.11.0's on the five recorded
      reads (002.9's expected values; a digest of the checks and the
      figures).
- [x] **Nothing the view said is lost.** Every row, quote, table and notice
      of the 0.11.0 view is reachable in the new one — some behind a fold — and
      a test lists them.
- [x] **The definition setting is the existing action.** The three cards run
      `emprise-definition` with its fields' values: the same Request, the same
      one undo entry, the same package-data write (096.4). The form stays for
      the four toggles and the page.
- [x] **The package composes; the host draws.** No colour, no markup; icons are
      the SDK's closed words.
- [x] **No count the host derives is sent** (Rule 10): "2 hypothèses" is not a
      phrase of ours; the assumptions block says it.
- [x] **Both locales have every new key.**

**Verified (2026-10-22).** _The readings do not change:_ `tests/surfaces-composition.test.mjs` "criterion 7"
compares every `srf:` check of the five reads with 0.11.0's (`test-fixtures/fr-urban-rules/panel/surfaces-0.11.0.json`,
recorded by running the unchanged surfaces code on the same captures) and each assumption id; 002.9's expected
values and `surfaces.test.mjs` (37 tests, their assertions kept and only re-pointed at the blocks' new places)
pass. **Honoured.** _Nothing the view said is lost:_ "criterion 6" finds every row, table, quote, notice, action
and heading of the 0.11.0 view in the new one, or the row's replacement. **Honoured.** _The setting is the existing
action:_ the choice's `action` equals, object for object, the one the actions block offers (`emprise-definition`),
and every card's values validate against its fields ("criterion 3"). **Honoured.** _The package composes; the host
draws:_ words, numbers and the SDK's icon words only. **Honoured.** _No count the host derives is sent:_ the
choice's note is « Aucun balcon modélisé », not « 2 hypothèses »; the assumptions block says its count.
**Honoured.** _Both locales:_ "criterion 8" and the key audit (one key, `surfaces.heading.budget`, became unused
and was removed). **Honoured.**

---

# Current state

_Read 2026-10-22 at the 0.11.0 tree; `surfacesOf`, `index.js:11255-11990`._

- **Emprise au sol**: a heading, the R.420-1 quote, a `fields` block (the chosen
  definition's value with a detail on balconies, its share of the plot, the
  other two definitions' values, the entered balconies), a per-building
  `table` and a « not summed » notice.
- **Budget**: a heading, a `meter` (used / allowed) and a `fields` block of
  seven rows (the rule, the plot area and its basis, the contenance, the
  boundary area, allowed, remaining, used); the footprint checks.
- **Pleine terre**: a `fields` block (unbuilt, required) and its checks.
- **Surface de plancher**: a heading, the R.111-22 quote, `sdp.blocks`.
- **Plafonds** (caps): a heading and a `fields` block of the existing,
  extended and per-building areas and the allowed.
- **Capacité estimée**: a heading with « estimate » detail, a `fields` block
  (the range, the ground, the storeys) or a notice, a « not applied » notice.
- **Procedure**: a heading, a `fields` block of the procedural flags.
- Then `surfaceActions` and the `assumptions` block.
- **The emprise definition** is `empriseChoice(section)`; the action
  `emprise-definition` has the `definition` choice, four yes/no toggles
  (`upperStoreys`, `roofOverhangs`, `balconies`, `lightweight`) and `page`.

---

# Goal

The boards' Surfaces: a hero card for the emprise au sol, the definition as a
segmented choice of three cards each with its area, the budget as a used /
remaining / allowed bar, and the other groups as folded rows with an icon and
a one-line summary.

# Out of scope

- Any change to how an area, a ratio or a capacity is computed.
- The Checks, Rules and Envelope views.

---

# Decisions

## DEC-1 — The composition

1. A **`stat`** for the emprise au sol: label « Emprise au sol », the value
   the **share of the plot** (percent), the detail « 480 m² sur 1 500 m² de
   parcelle », a gauge (`value` the share, `limit` the governing footprint
   rule's percent, `max` 100 %), and a **verdict** chip: the result of the
   confirmed footprint rule's check, none while the rule is still to confirm
   or absent. The tone is the host's, from the verdict.
2. A **`choice`** — « Définition de l'emprise » — three options: **R.420-1**,
   **Lexique** (with « p. N » when a page is set), **Toutes saillies**, each
   with its area as `figure` (the other two readings are the existing figures),
   `selected` on the setting's definition, `values` the definition plus the
   current toggles and page; its `action` the `emprise-definition` action; its
   `note` « Aucun balcon modélisé » or the entered balconies' area. The
   action's button stays in the actions block (« Modifier les comptages »):
   it opens the form for the toggles and the page.
3. A **`section`** « Définition légale » (R.420-1's quote), folded; a
   **`section`** « Détail par bâtiment » (the per-building table and the
   « not summed » notice), folded.
4. The **budget**: a `meter` (used / allowed, now the stacked bar), a
   `section` « Base de calcul » (the rule, the plot area and its basis, the
   contenance, the boundary area; allowed, remaining and used are the bar's
   figures when it is drawn and rows when it is not), folded.
5. **Pleine terre**: a `section` (icon `area`), summary « manque 4 % (60 m²) »
   in the warning tone, or « 320 m² libres » when nothing is required; it
   holds a `stat` (the unbuilt share against the required, a gauge), the
   two fields, and the green rule with its actions when the rule is to confirm
   (« Confirmer 15 % », « Voir le passage » through the rules list).
6. **Surface de plancher**: a `section` (icon `document`), summary the total;
   it holds the R.111-22 quote and `sdp.blocks`.
7. **Plafonds**: a `section` (icon `rules`), summary the governing allowance
   when there is one; it holds the caps fields.
8. **Capacité estimée**: a `section` (icon `envelope`), summary the range; it
   holds a `stat` whose gauge is a **range** (`from` the low, `value` the
   high), the existing detail « Ordre de grandeur… ce n'est pas un droit à
   construire » (the `notARight` text, kept), the ground and storeys rows
   and the « not applied » notice.
9. **Procédure indicative**: a `section` (icon `information`), summary absent.
10. The actions, the notices (coverage unavailable, newer section) and the
    `assumptions` block stay at the top level, as before.

Which sections are open by default: none (the boards fold them); the hero,
the choice and the budget are always visible.

## DEC-2 — The icons and summaries are words and phrases

Icons are `REGULATION_VIEW_ICONS` words; a summary is a phrase with
parameters (areas and percentages the view already computes), never a string
built in the package from translated pieces.

## DEC-3 — What the digest checks

002.12's digest test and 002.9's expected values stay; a new test lists the
0.11.0 view's rows, quotes and tables (by key) and asserts each is somewhere in
the new view's blocks (nested ones included), over the five reads.

---

# Steps

1. `surfacesOf` recomposed as above; `surfaceActions` exports the definition
   action for the choice.
2. `en.json` / `fr.json`; the key audit.
3. `package.json` 0.13.0 / "1.38"; README and CHANGELOG.
4. Tests: `surfaces.test.mjs` updated for the new block structure (each change
   commented), a new composition test, the digest.
5. `tools/build-index.mjs` and `check-index.mjs`.

# Acceptance criteria

1. The view's top level is: notices (as before), the hero `stat`, the
   definition `choice`, the budget `meter`, the folded `section`s, the
   actions and the assumptions.
2. The hero's share, gauge limit and verdict agree with the footprint check on
   the same read (a test).
3. The choice's three figures equal the 0.11.0 view's three definition values;
   `selected` is the setting's; every option's `values` validate against the
   action's fields.
4. The budget meter's used / allowed equal 0.11.0's; the remaining equals
   allowed − used.
5. Every section's summary agrees with its content (pleine terre's shortfall
   equals required − unbuilt; the capacity's range equals the range row's).
6. Every row, quote, table and notice of the 0.11.0 view is present
   (DEC-3's test).
7. The checks and figures are unchanged (002.9's expected values; the digest).
8. Both locales have every new key; the suite, `build-index` and `check-index`
   pass.

# Testing strategy

The existing surfaces tests re-read; a composition test; the digest; the
platform's 096.28 walk shows it on screen.

# Risks

- **A gauge that disagrees with the check.** One source: the check's own
  numbers (criterion 2).
- **The sections hide the figures the user came for.** The hero, the choice and
  the budget are not folded.

# Questions (recommended answers applied)

1. **Is the pleine-terre section's Confirm button in the Surfaces view?** Yes,
   through the rules list inside the section, using the rule's confirm
   actions as the Rules view does. Taken on the owner's behalf.

# Definition of Done

Every criterion walked; the Outcome; README and CHANGELOG.

# Post-sprint

- [x] README, CHANGELOG, the milestone row, 002.10's header. **Done.**

---

# Dependencies

| Sprint / item | What this sprint needs from it |
| --- | --- |
| **Platform 096.27** | SDK 1.38 |
| **002.14** | 0.12.0, SDK 1.37 |
| **Versions** | `fr-urban-rules` **0.13.0**, `sdkVersion` **1.38** |

---

# Outcome

_Implemented 2026-10-22, uncommitted. `fr-urban-rules` 0.13.0, `sdkVersion` 1.38 (lockstep with the platform's 096.27)._

**The owner's answer.** Q2, a segmented choice: yes. Taken on his behalf (reversible): the pleine-terre fold holds the
rule's confirm button through the host's rules list (the Rules view's own actions, `planned.actionsFor`); the
choice's note is the short « Aucun balcon modélisé » (or « Dont N m² de balcons saisis par vous ») rather than the
long sentence the fields row kept in the detail fold; the section titles reuse the existing headings
(« Extensions et annexes » for the boards' « plafonds »); a headline figure only when the plot area is measured.

**What landed.** `surfacesOf` recomposed (`fr-urban-rules/src/index.js`): `stat` (headline), `choice` (cards),
the `meter` bar, and the folds `emprise-detail`, `budget-basis`, `green`, `floor-area`, `caps`, `capacity`,
`procedure`; `definitionActionOf` shared by the choice and the actions block; fourteen new keys in each locale,
one removed. Tests: `surfaces-composition.test.mjs` (8, new), `surfaces.test.mjs` (a `flatten` and `cardOf` / `headline`
helpers; five assertions re-pointed, each commented), `acceptance`, `designtime`, `questions` and `written` read the
Surfaces rows through `flattenBlocks` (a helper in `helpers.mjs`), `package.test.mjs`. The host's own registry
(`checkedReport` of the built SDK 1.38) keeps every part of the five recorded reports' reports: 0 dropped.

**Gates.** The plugin suite: 438 tests, 436 passed, 2 skipped (the repository's own). `tools/build-index.mjs` and
`tools/check-index.mjs` accept 0.13.0.

**Acceptance walked.** 1. `surfaces-composition.test.mjs` criterion 1. 2. criterion 2. 3. criterion 3. 4. criterion 4.
5. criterion 5. 6. criterion 6. 7. criterion 7. 8. criterion 8 and `package.test.mjs`. On screen: 096.28's walk.

**Deviations.** None.
