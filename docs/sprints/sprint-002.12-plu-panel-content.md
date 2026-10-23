# Sprint 002.12 — PLU Panel Content

> **Status:** **Implemented (2026-10-22, uncommitted).** Written from the
> owner's decisions of 2026-10-22 on the "PLU Panel Redesign" boards
> (https://claude.ai/artifact/QWS3g8UeehfCvWo1J2JEQb) and a reading of
> `fr-urban-rules/src/index.js` at the 0.9.0 tree; landed as `fr-urban-rules`
> **0.10.0**, `sdkVersion` **1.35**, with the platform's 096.19–096.21. See **Outcome**.
>
> **Repository:** `archisimple-plugins`, the `fr-urban-rules` extension only.
> The companion service is unchanged.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 12, Phase 5 (PLU panel UX). Platform README § 12, Phase 5.
>
> **Prerequisites:**
>
> - **Platform:** Sprints 096.19 (SDK 1.34: a view's `icon`, `group`,
>   `summary`; the report's `locality`) and 096.21 (SDK 1.35: an assumption's
>   `detail`; a check's `allowed`). 096.20 needs nothing from here but shows
>   the icons this sprint sends. The package declares `sdkVersion` **"1.35"**;
>   a web image without 096.21 refuses it. A lockstep release.
> - **Plugins:** 002.11 closed (0.9.0).
>
> **Version:** `fr-urban-rules` **0.9.0 → 0.10.0**.
>
> - 002.10 (Regulation Watch, drafted as 0.10.0 since 2026-10-21, on hold) is
>   renumbered **0.12.0**, after this sprint and 002.13 (0.11.0); its
>   `sdkVersion` becomes "1.36", inherited from 002.13. Recorded in 002.10's
>   header and "Version needs" (2026-10-22).
> - Phase 5 lands first: the owner approved it on 2026-10-22, and Phase 4 is
>   on hold.
>
> **Sizes:** the views reordered and described, a Document view, the
> overview reduced to its notices, 57 assumptions rewritten as a title and a
> detail in two locales, the confirm label with its value. Medium.

---

# Sprint Design Contract

- [x] **The package sends vocabulary, never presentation.** Icons and groups
      are the SDK's closed words; no colour, no markup, no layout.
- [x] **No count the host derives is sent** (ADR-0111 Rule 10). The checks
      and rules views carry no `summary`; a count of the package's own
      items (prescriptions, easements, edges) may be a summary, as it is a
      badge today.
- [x] **Nothing the panel showed is lost.** Every block of the 0.9.0
      overview reappears in a view (DEC-2), checked by a test over the five
      recorded reports.
- [x] **The assumptions keep their meaning.** Each rewritten title and
      detail says what the 0.9.0 sentence said; the table of old and new is
      in the Outcome for the owner's review (question 1).
- [x] **Both locales**, every new key in `en.json` and `fr.json`
      (`package.test.mjs`).
- [x] **No change to what is read, measured or checked.** The checks, rules
      and features of the five recorded reports are byte-identical before
      and after, apart from `allowed` (DEC-6).

---

# Current state

_Read 2026-10-22 at the 0.9.0 tree._

**The views** (`fr-urban-rules/src/index.js`): `views()` (`:4544`) gives
`zone` (or `sector` under a carte communale), `prescriptions` (badge: a
count, `:4608-4612`), `information`, `easements` (badge, `:4660-4662`),
`risks` (`:4684`); the report then appends `rules`, `surfaces`, `edges`,
`checks` and `envelope` (`:7297-7324`). No view has an icon, a group or a
summary.

**The overview** (`overview()`, `:4431`): a `not_published` or `unknown`
notice; a `fields` block (regime, commune, document, version, approval date,
zone); the regulation link or its notices (link unavailable, newer document,
file not found, `:4479-4520`); `assumptions`; `flags`; `sources`.
`overviewWith` (`:7899`) adds the new-version notice with **Review**
(`opensView: 'rules'`).

**The commune** is a `fields` row only (`:4445-4455`); the report has no
place for it.

**The assumptions**: 57 keys `fr-urban-rules.assumption.*` in
`resources/i18n/fr-urban-rules/{en,fr}.json`, each one sentence —
« Hauteur mesurée depuis le terrain le plus bas au pied du bâtiment —
vérifiez la référence du règlement. » — registered by `assume(id, text)`
(`:6901`) and named on checks in `assumptionIds` (e.g. `:9896-9909`).

**Confirm** is « Confirmer » (`fr-urban-rules.action.confirm`, `:8964-8969`,
`:9638`), the value in the rule's line beside it.

---

# Goal

The FR report fills the redesigned panel: every view with its icon, group
and summary, in the boards' order; a Document view; the commune as the
report's `locality`; the overview reduced to its notices; short assumptions
with one line of detail; « Confirmer 15 % » on a written rule to confirm.

# Out of scope

- The diagram blocks and the assumption's figure: **002.13** (SDK 1.36).
- Any change to reading, extraction, measuring or checking.
- The regulation sheet's content (002.7) beyond what the host prints of an
  assumption's detail.

---

# Decisions

## DEC-1 — Order, icons, groups

| Order | View id                | Icon           | Group     | Summary (DEC-3)                       |
| ----- | ---------------------- | -------------- | --------- | ------------------------------------- |
| 1     | `document` (new)       | `document`     | `site`    | the document's version date           |
| 2     | `zone` / `sector`      | `zone`         | `site`    | the zone labels (« UF »)               |
| 3     | `prescriptions`        | `prescription` | `site`    | their count (« 2 »)                    |
| 4     | `information`          | `information`  | `site`    | their count                           |
| 5     | `easements`            | `easement`     | `site`    | their count                           |
| 6     | `risks`                | `risk`         | `site`    | the notable risk (« Argiles · moyen ») |
| 7     | `checks`               | `checks`       | `project` | — (the host's)                         |
| 8     | `rules`                | `rules`        | `project` | — (the host's)                         |
| 9     | `edges`                | `boundary`     | `project` | « 4 limites »                          |
| 10    | `envelope`             | `envelope`     | `project` | the lowest height ceiling, « · 3D » with a volume (« 8 m · 3D ») |
| 11    | `surfaces`             | `area`         | `project` | the footprint ratio (« Emprise 32 % ») |

The order is the boards'. A view the regime does not have (no prescriptions
under RNU) is absent, as today; the order of the rest holds.

## DEC-2 — The Document view, and the overview's notices

`document` holds the overview's `fields` block and the link with its notices,
as they are. Under RNU, `not_published` and `unknown`, where there is no
document, it holds the regime row and the notice that says why.

The overview keeps its **notices only** — `notPublished`, `unknown`, the
new-version notice with **Review** — which the host draws under the status
line (096.19 DEC-6). `assumptions` and `sources` leave it (the host shows
sources in its own section; assumptions go to the cards, 096.21). `flags`
moves to the `risks` view, after its `fields` block.

## DEC-3 — Summaries and the locality

Summaries are phrases or quantities, never a count the host derives:
`fr-urban-rules.summary.*` keys. The risks view's summary names the
strongest of the risks read (clay shrink-swell level, else seismic zone,
else radon class), in that order — the one a designer acts on first; none
when no risk is read. The envelope's summary is a quantity (the lowest
`height` ceiling's metres) followed by « · 3D » when a volume is sent.

`locality`: the municipality's names joined (`state.municipality.names`,
as the `fields` row does today), verbatim.

## DEC-4 — Short assumptions

Each of the 57 keys becomes a **title** — at most 80 characters, a noun
phrase: « Hauteur depuis le terrain le plus bas » — and a `.detail` key with
one sentence: « Mesurée au point le plus bas du terrain au pied du bâtiment ;
vérifiez la référence du règlement. » The ids do not change, so the checks'
`assumptionIds`, the sheet and 002.11's snapshot keep working. Where the old
sentence holds two facts, the second goes to the detail. `package.test.mjs`
asserts every title's length in both locales and that every title has a
detail key.

## DEC-5 — « Confirmer 15 % »

A written rule to confirm with a `value` or `ratio` limit is offered
`fr-urban-rules.action.confirmValue` (« Confirmer {value} »), the value
formatted by the package in metres or percent — 002.8's offer precedent
(« Confirm 16 m », SDK 1.32's `RegulationOffer.label`). A `described` limit
keeps « Confirmer ». The host shows it on the check card (096.21 DEC-5) and
in the Règles section alike.

## DEC-6 — `allowed`, where a rule states both ends

Where a confirmed written or entered rule states both a minimum and a
maximum for the same measure (« implantation en retrait compris entre 0 et
5 m »), its check carries `allowed`. The sprint inventories which of the
package's rule shapes can do so (the extraction schema's `min` / `max`, the
entered rule's form); if none can today, nothing is sent and the Outcome says
so (096.21 question 1).

---

# Steps

1. `views()` and the report assembly: DEC-1's order, icons, groups.
2. The Document view and the overview's reduction (DEC-2); `flags` into
   `risks`.
3. Summaries and `locality` (DEC-3).
4. The 57 assumptions (DEC-4), both locales; the old-and-new table.
5. The confirm label (DEC-5).
6. The `allowed` inventory (DEC-6).
7. `sdkVersion` "1.35", `version` 0.10.0, CHANGELOG.
8. Tests over the five recorded reports.
9. A walk in the editor on Lyon and Gordes with the platform's 096.19–096.21.

# Acceptance criteria

1. The five recorded reports' views come in DEC-1's order with its icons and
   groups (`reading.test.mjs`, one assertion per regime).
    **Walked:** `tests/panel.test.mjs` ("criterion 1"): over the five recorded reads the views are a subsequence of DEC-1's order, each with the table's icon and group, a closed-vocabulary word; a PLU has all eleven; a partial report has the same shape.
2. Every block of the 0.9.0 overview appears in the 0.10.0 report — in the
   overview's notices, the Document view or the risks view — except
   `sources` and `assumptions` (a test diffing the two over the fixtures).
    **Walked:** `tests/panel.test.mjs` ("criterion 2"): the 0.9.0 overviews of the five reads, recorded by running 0.9.0 on the same captures (`test-fixtures/fr-urban-rules/panel/overview-0.9.0.json`), are diffed block by block against the new overview, Document view and Risks view; only `sources` and `assumptions` leave.
3. No view showing `checks` or `rules` carries a `summary`
   (`reading.test.mjs`).
    **Walked:** `tests/panel.test.mjs` ("criterion 3"): no view showing `checks` or `rules` has a `summary`; the others' summaries are the badge's own, a date, the zones, the strongest risk, the edges, the envelope's lowest height as a quantity, the footprint.
4. The report's `locality` is the commune's name on Lyon (« Lyon »), Gordes,
   Mouzay, Brouennes and Rochefort-en-Terre (same file).
    **Walked:** `tests/panel.test.mjs` ("criterion 4"): `locality` is « Lyon », « Gordes », « Brouennes », « Mouzay » and « Rochefort-en-Terre » (the services answer in capitals; see Outcome).
5. Every assumption title is at most 80 characters and has a detail, in
   `en` and `fr` (`package.test.mjs`).
    **Walked:** `tests/package.test.mjs` ("002.12 criterion 5"): 57 titles of at most 80 characters, none a sentence, each with a non-empty detail, in `en` and `fr`; the key audit accepts `.detail` keys by convention.
6. The checks, rules, features and edges of the five reports are unchanged
   apart from `allowed` (`acceptance.test.mjs`' expected values hold).
    **Walked:** `tests/panel.test.mjs` ("criterion 6"): the SHA-256 of the rules, checks, features, edges, flags, zones, document and sources of the five reads are 0.9.0's; the assumptions keep their ids and keys. No check carries `allowed`.
7. A written rule to confirm with a 15 % limit offers « Confirmer 15 % »
   (`written.test.mjs`).
    **Walked:** `tests/written.test.mjs` ("criterion 10", extended): a ratio of 15 % offers `confirmValue` with `{ value: 15, unit: '%' }`, a value rule the same in its own unit, a height-relative limit keeps `confirm`.
8. `package.json` declares 0.10.0 and `sdkVersion` "1.35"; the archive builds
   and its index entry carries both (`package.test.mjs`).
    **Walked:** `tests/package.test.mjs` ("criterion 1"): 0.10.0, `sdkVersion` 1.35; `tools/build-index.mjs` builds the archive (`com.archisimple.fr-urban-rules-0.10.0.aspkg`) and `tools/check-index.mjs` accepts the index (2 of 2).
9. In the editor with the platform at SDK 1.35, the panel on Lyon shows the
   eleven sections in order with their icons and summaries, no Aperçu
   section, and the identity card's three chips.
    **Walked:** Walked live in the editor on Lyon and Gordes (`tools/e2e` `regulationsPanelFr.spec.ts`, platform repository): Lyon shows the eleven sections in order under the two headings with their icons and summaries, no Overview section and the card's three chips (« PLUi » regime, « UCe1b », « Lyon »); pictures in `tools/e2e/test-results/regulations/phase5-stage1/fr-package/{dark-fr,light-en}/`.

# Testing strategy

The package's `node --test` suites over the recorded fixtures; the walk in
the editor through `regulations-walk`, with pictures.

# Risks

- **A shortened assumption loses a nuance** a user relied on. The detail
  keeps the rest; the owner reviews the table (question 1).
- **Lockstep.** 0.10.0 needs an image with 096.21; the NAS must be rebuilt
  with both (096.13's pins).

# Questions for the owner

1. **Review the 57 rewritten assumptions?** **Recommendation:** yes, in the
   Outcome's table (old sentence, new title, new detail), before the release
   — they are legal phrasing in French.
2. **The risks summary's order** (clay, then seismic, then radon).
   **Recommendation:** as drafted — clay changes foundations; the others
   rarely change a design.

# Definition of Done

The acceptance criteria walked; the CHANGELOG and the milestone row updated;
the assumptions table in the Outcome; the package built.

# Dependencies

| Item                   | Need                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| **Platform 096.19**    | SDK 1.34: `icon`, `group`, `summary`, `locality`                                   |
| **Platform 096.21**    | SDK 1.35: `detail`, `allowed`; the card that shows the confirm action             |
| **Version needs**      | package **0.10.0**, `sdkVersion` **"1.35"**                                        |
| **002.13**             | Builds on this sprint's views; takes 0.11.0                                        |
| **002.10**             | Renumbered 0.12.0                                                                  |

---

# Outcome

_Implemented 2026-10-22, uncommitted. `fr-urban-rules` 0.9.0 → **0.10.0**, `sdkVersion` 1.33 → **1.35**, a lockstep release with the platform's 096.19–096.21 (a web image without 096.21 refuses the manifest)._

**The owner's answers, 2026-10-22, "as recommended" — decisions taken on the owner's behalf, reversible.** Q1: the 57 rewritten assumptions are reviewed by the owner after this sprint, in the tables below, before the release (they are legal phrasing in French). Q2: the risks summary names the clay's exposure first, then the seismic zone, then the radon class.

**What landed.** A final shaping step, `panelShaped`, applied to every report the reader hands the host (a progress and the answer; what the report was assembled from, `facts`, stays with it): the views in the boards' order with an `icon` and a `group`; a **Document** view holding the overview's fields, the link and its notices; the overview reduced to its notices; the flags in **Risques**, after its first block; summaries (the document's date as a timestamp the host formats, « UF », the three counts, « Argiles · moyen », « 4 limites », the envelope's lowest height, « Emprise 32 % »); the commune as `locality`; each of the 57 assumptions a short title and a `.detail`; « Confirmer 15 % ». The views' own builders are untouched (the Risks and the count summaries are set where their data is). Nothing read, measured or checked changes: the SHA-256 of the five reads' rules, checks, features, edges, flags, zones, document and sources equal 0.9.0's.

**Decisions and deviations.**

- **The envelope's summary is the quantity alone** (the lowest `height` ceiling's metres, written by the host in the project's unit); the sprint's « · 3D » cannot be part of a summary, which the SDK makes a phrase **or** a quantity. The host's Display section says « · 3D » while the envelope is drawn there.
- **`locality` is cased** (« Lyon »), not verbatim: Géoplateforme and API Carto answer « LYON » and « ROCHEFORT-EN-TERRE »; a name in capitals is cased word by word, a name with lower-case letters is left as it is. The `fields` row in the Document view keeps the service's words.
- **A summary's count is the badge's own value**, not a number counted afresh; the information view, which had no badge, gets its summary from its table's items.
- **`allowed` is never sent (DEC-6's inventory).** Every rule shape here states one comparison and one value: the extraction service's `limit` is `min` or `max` of one number or one percent (`extract.mjs`, `checkedResult`), an entered rule is a kind with one value (`ENTERED_KINDS`), a drawn prescription one height, a coded one a single limit. None bounds a measure on both sides, so no check carries the band; the SDK field and the host's gauge stay for the next country, exercised by the platform's stub.
- **« Confirmer 15 % » is for a written rule only** (`writtenActions`), as DEC-5 says; the confirm of a drawn or coded rule and of an entered one reopened keeps « Confirmer ».
- **The reasons a check was not made** (`fr-urban-rules.reason.*`, which are assumptions too: « Aucune limite du site dessinée ») are short sentences already and have no detail; the 57 are the package's `assumption.*` namespace, as the sprint counted.
- **The Vérifications view keeps its name**; the boards say « Contrôles », a wording the sprint did not list. Reversible in one key (`fr-urban-rules.view.checks`).
- Tests changed with comments: 26 that looked for the link and its notices in the overview now read `docBlocks(report)` (the overview and the Document view), `criterion 14` states the new shape, `envelope` asserts the envelope comes after the checks (its place changed), `sheet` reads the lattice sentence's `.detail`, and `phaseOne` leaves the Document view out with the overview.

**Gates.** `node --test fr-urban-rules/tests/*.test.mjs`: 414 passed (401 before, 2 skipped then and now), 0 failed; `tools/build-index.mjs` builds the 0.10.0 archive and `tools/check-index.mjs` accepts the index (2 of 2). A live walk on Lyon and Gordes with the platform's 096.19–096.21 (above): no page error.

**Not verified.** The French wording of the 57 assumptions against the règlements (the owner's review); the panel on Mouzay, Brouennes and Rochefort (the five reads are covered by the shape tests, not by pictures); a deployed NAS.

## The 57 rewritten assumptions, for the owner's review

_French first (the language of the law), then English. A title is a noun phrase of at most 80 characters; the detail is one line. Where a sentence held two facts the second went to the detail; a parameter (`{distance}`, `{count}`…) is named wherever the old sentence named it._

### Français

| # | Key (`fr-urban-rules.assumption.…`) | Before (0.9.0) | Title (≤ 80) | Detail |
| -- | -- | -- | -- | -- |
| 1 | `adjoins` | Jouxte la limite du site : à moins de {distance} m sur au moins {length} m. R.111-17 ne s’applique pas le long de ce côté. | Bâtiment jouxtant la limite du site | À moins de {distance} m de la limite sur au moins {length} m : R.111-17 ne s’applique pas le long de ce côté. |
| 2 | `adjoinsPartially` | Jouxte la limite du site sur une partie de ce côté seulement ; ailleurs le bâtiment est à moins de 3 m. | Bâtiment jouxtant la limite en partie | Il jouxte la limite sur une partie du côté seulement ; ailleurs il est à moins de 3 m. |
| 3 | `alignment.carriageway` | Aucune parcelle ne fait face au côté : l’alignement opposé est pris au bord de chaussée opposé, plus strict que la règle. | Alignement opposé pris au bord de chaussée | Aucune parcelle ne fait face au côté : l’alignement opposé est pris au bord de chaussée opposé, ce qui est plus strict que la règle. |
| 4 | `alignment.carriagewayUnread` | Les parcelles de l’autre côté de la voie n’ont pas pu être lues : l’alignement opposé est pris au bord de chaussée opposé, plus strict que la règle. | Alignement opposé pris au bord de chaussée (parcelles non lues) | Les parcelles de l’autre côté de la voie n’ont pas pu être lues : l’alignement opposé est pris au bord de chaussée opposé, plus strict que la règle. |
| 5 | `alignment.el7` | L’alignement opposé est la servitude d’alignement EL7. | Alignement opposé : servitude EL7 | L’alignement opposé est la servitude d’alignement EL7. |
| 6 | `alignment.parcels` | L’alignement opposé est supposé d’après les parcelles cadastrales de l’autre côté de la voie. | Alignement opposé déduit du cadastre | L’alignement opposé est supposé d’après les parcelles cadastrales de l’autre côté de la voie. |
| 7 | `anchorOnly` | La parcelle n’a pas pu être convertie pour les services d’urbanisme : lecture à l’emplacement du projet seulement. Une parcelle à cheval sur deux zones peut n’en montrer qu’une. | Lecture à l’emplacement du projet seulement | La parcelle n’a pas pu être convertie pour les services d’urbanisme ; une parcelle à cheval sur deux zones peut n’en montrer qu’une. |
| 8 | `appliesWhereDrawn` | Une prescription graphique s’applique là où elle est dessinée : aux seuls bâtiments dont le contour la touche. | Prescription graphique : là où elle est dessinée | Elle ne s’applique qu’aux bâtiments dont le contour la touche. |
| 9 | `balconies` | Les balcons ne sont pas modélisés et ne sont pas mesurés. | Balcons non modélisés | Les balcons ne sont pas modélisés et ne sont pas mesurés. |
| 10 | `balconiesEntered` | Les balcons ne sont pas modélisés ; les surfaces saisies sont ajoutées. | Balcons non modélisés, surfaces saisies ajoutées | Les balcons ne sont pas modélisés ; les surfaces que vous avez saisies sont ajoutées. |
| 11 | `bandsApproximate` | Les bandes sont la parallèle de chaque côté, coupée à la limite du site ; celle de R.111-16 est placée à la distance moyenne de l’alignement opposé — une approximation. | Bandes de recul approchées | Chaque bande est la parallèle du côté, coupée à la limite du site ; celle de R.111-16 est placée à la distance moyenne de l’alignement opposé : une approximation. |
| 12 | `checksCapped` | Seules les {count} premières vérifications sont listées : la limite du site a trop de côtés. | Liste des vérifications tronquée | Seules les {count} premières vérifications sont listées : la limite du site a trop de côtés. |
| 13 | `contiguousTolerance` | Des bâtiments à moins de {distance} m l’un de l’autre sont pris comme contigus : R.111-15 ne s’applique pas entre eux. | Bâtiments proches pris comme contigus | Des bâtiments à moins de {distance} m l’un de l’autre sont pris comme contigus : R.111-15 ne s’applique pas entre eux. |
| 14 | `datumDerived` | Rez-de-chaussée supposé au niveau du terrain à l’origine du projet — renseignez le niveau de référence du projet pour confirmer. | Rez-de-chaussée supposé au niveau du terrain | Pris au niveau du terrain à l’origine du projet ; renseignez le niveau de référence du projet pour confirmer. |
| 15 | `edgeSetByYou` | Rôle du côté fixé par vous. | Rôle du côté fixé par vous | Vous avez choisi le rôle de ce côté (sur rue, latéral ou de fond) ; il remplace celui qui était déduit. |
| 16 | `edgesCapped` | Seuls les {count} premiers côtés de la limite du site sont nommés : elle en a trop. | Côtés de la limite du site tronqués | Seuls les {count} premiers côtés de la limite du site sont nommés : elle en a trop. |
| 17 | `edgesDerived` | Les côtés latéraux et de fond sont nommés à partir des côtés sur rue. | Côtés latéraux et de fond déduits | Ils sont nommés à partir des côtés sur rue. |
| 18 | `envelopeAdjoining` | Un bâtiment implanté sur la limite est dispensé de R.111-17 le long de ce côté ; l’enveloppe ne dessine pas ce cas. | Bâtiment sur la limite non dessiné dans l’enveloppe | Un bâtiment implanté sur la limite est dispensé de R.111-17 le long de ce côté ; l’enveloppe ne dessine pas ce cas. |
| 19 | `envelopeAlignmentMissing` | Là où aucun alignement opposé n’a été trouvé pour un côté sur rue, la pente de R.111-16 part de ce côté lui-même : plus strict que la règle. | Alignement opposé introuvable : pente plus stricte | Là où aucun alignement opposé n’a été trouvé pour un côté sur rue, la pente de R.111-16 part du côté lui-même : plus strict que la règle. |
| 20 | `envelopeApproximate` | Le contour de l’enveloppe est la limite du site reculée, côté par côté, du plus grand recul confirmé pour le rôle du côté (sur rue, latéral ou de fond) ; un recul sur rue est mesuré depuis la ligne du côté sur rue, prolongée au-delà des angles du terrain. | Contour de l’enveloppe approché | C’est la limite du site reculée, côté par côté, du plus grand recul confirmé pour le rôle du côté (sur rue, latéral ou de fond) ; un recul sur rue est mesuré depuis la ligne du côté sur rue, prolongée au-delà des angles du terrain. |
| 21 | `envelopeBoundarySlope` | Une hauteur qui dépend de la distance à la limite du site est mesurée depuis le sol au point le plus proche de la limite, la limite du site valant limite séparative. | Hauteur selon la distance à la limite du site | Une hauteur qui dépend de la distance à la limite est mesurée depuis le sol au point le plus proche de la limite, la limite du site valant limite séparative. |
| 22 | `envelopeChecks` | Ce sont les contrôles, et non le volume, qui disent si le projet respecte les règles. | Les contrôles font foi, pas le volume | Ce sont les contrôles, et non le volume, qui disent si le projet respecte les règles. |
| 23 | `envelopeFacadeCeiling` | La règle limite la hauteur de façade ; le volume la dessine comme un plafond sur tout le bâtiment, plus strict que la règle pour un toit qui s’élève derrière la façade. | Hauteur de façade dessinée comme un plafond | La règle limite la hauteur de façade ; le volume la dessine comme un plafond sur tout le bâtiment, plus strict pour un toit qui s’élève derrière la façade. |
| 24 | `envelopeHeightGround` | Dans le volume, une hauteur est mesurée depuis le sol en chaque point (le terrain dessiné), et non depuis le pied d’une façade. | Hauteur mesurée depuis le sol, point par point | Dans le volume, la hauteur est mesurée depuis le sol en chaque point (le terrain dessiné), et non depuis le pied d’une façade. |
| 25 | `envelopeHeightWithin` | Dans le volume, une hauteur dessinée au plan ne s’applique qu’à l’intérieur du périmètre de la prescription (là où le contour et la prescription se recouvrent). | Hauteur dessinée valable dans le périmètre de la prescription | Dans le volume, une hauteur dessinée au plan ne s’applique qu’à l’intérieur du périmètre de la prescription, là où le contour et la prescription se recouvrent. |
| 26 | `envelopeLattice` | Le volume 3D est calculé environ tous les mètres : exact en chaque point de calcul ; entre deux points, près des extrémités ou des angles rentrants d’une limite dont la hauteur dépend de la distance, il peut dépasser la règle d’au plus la moitié de la pente par mètre. | Volume 3D calculé environ tous les mètres | Exact en chaque point de calcul ; entre deux points, près des extrémités ou des angles rentrants d’une limite dont la hauteur dépend de la distance, il peut dépasser la règle d’au plus la moitié de la pente par mètre. |
| 27 | `envelopeNotApplied` | L’enveloppe ne dessine que les règles listées comme appliquées dans sa vue ; une règle confirmée qu’elle ne sait pas dessiner (hauteur de façade, recul maximal, ratio, distance entre bâtiments) limite toujours le projet. | Règles que l’enveloppe ne dessine pas | L’enveloppe ne dessine que les règles listées comme appliquées dans sa vue ; une règle confirmée qu’elle ne sait pas dessiner (hauteur de façade, recul maximal, ratio, distance entre bâtiments) limite toujours le projet. |
| 28 | `envelopeReentrantCorners` | À un angle rentrant de la limite du site, et là où une limite latérale ou de fond se termine à un angle ouvert, le contour suit la ligne arrondie au recul, tracée par segments juste à l’intérieur : plus strict que la règle. | Angles rentrants arrondis dans l’enveloppe | À un angle rentrant de la limite, et là où une limite latérale ou de fond se termine à un angle ouvert, le contour suit la ligne arrondie au recul, tracée par segments juste à l’intérieur : plus strict que la règle. |
| 29 | `envelopeSetbackLine` | La ligne de recul imposée dessinée au plan remplace l’alignement opposé. | Ligne de recul dessinée au plan | La ligne de recul imposée dessinée au plan remplace l’alignement opposé. |
| 30 | `existingAsModelled` | Bâtiment existant tel que modélisé ; le règlement le prend tel qu’il était à l’approbation du plan ({date}). | Bâtiment existant tel que modélisé | Le règlement le prend tel qu’il était à l’approbation du plan ({date}). |
| 31 | `existingReplaced` | Le bâtiment existant est remplacé : il n’est pas compté. | Bâtiment existant remplacé, non compté | Le bâtiment existant est remplacé : il n’est pas compté. |
| 32 | `facadeHeightFoot` | La hauteur de façade est mesurée du pied du mur à son sommet, échantillon par échantillon ; un lexique qui la mesure autrement est à lire. | Hauteur de façade du pied du mur à son sommet | Mesurée échantillon par échantillon ; un lexique qui la mesure autrement est à lire. |
| 33 | `featuresCapped` | Seuls {count} éléments sont dessinés : les bandes déduites au-delà sont omises. | Éléments dessinés tronqués | Seuls {count} éléments sont dessinés : les bandes déduites au-delà sont omises. |
| 34 | `floorToFloorDefault` | Hauteur d’étage prise à {height} m, la valeur par défaut de l’éditeur : la hauteur des niveaux n’est pas accessible à cette extension. | Hauteur d’étage par défaut | Prise à {height} m, la valeur par défaut de l’éditeur : la hauteur des niveaux n’est pas accessible à cette extension. |
| 35 | `governedByFloor` | Les deux limites sont manquées ; le plus grand écart est le minimum de 3 m, affiché ici. | Deux limites manquées : le minimum de 3 m l’emporte | Le plus grand écart est le minimum de 3 m, affiché ici. |
| 36 | `governedByRise` | Les deux limites sont manquées ; le plus grand écart est la moitié de la différence d’altitude, affichée ici. | Deux limites manquées : la différence d’altitude l’emporte | Le plus grand écart est la moitié de la différence d’altitude, affichée ici. |
| 37 | `heightLowestGround` | Hauteur mesurée depuis le terrain le plus bas au pied du bâtiment — vérifiez la référence du règlement. | Hauteur depuis le terrain le plus bas | Mesurée au point le plus bas du terrain au pied du bâtiment ; vérifiez la référence du règlement. |
| 38 | `lineTargetsCapped` | Seuls les {count} premiers côtés sur rue sont mesurés pour R.111-16. | Côtés sur rue mesurés tronqués | Seuls les {count} premiers côtés sur rue sont mesurés pour R.111-16. |
| 39 | `noOrnaments` | Les ornements et marquises, exclus par l’article R.420-1, ne sont pas modélisés. | Ornements et marquises non modélisés | L’article R.420-1 les exclut ; ils ne sont pas modélisés. |
| 40 | `noPlot` | Aucune parcelle n’est choisie : lecture à l’emplacement du projet seulement. | Aucune parcelle choisie | Lecture à l’emplacement du projet seulement. |
| 41 | `noRoad` | Aucune voie trouvée à moins de 30 m de la limite du site : chaque côté est pris comme latéral. | Aucune voie à moins de 30 m | Aucune voie trouvée à moins de 30 m de la limite du site : chaque côté est pris comme latéral. |
| 42 | `noStreetEdge` | Aucun côté de la limite du site ne fait face à une voie : chaque côté est pris comme latéral. | Aucun côté ne fait face à une voie | Aucun côté de la limite du site ne fait face à une voie : chaque côté est pris comme latéral. |
| 43 | `outlineTooDetailed` | Certains contours sont trop détaillés pour être dessinés ; ils figurent dans les listes seulement. | Contours trop détaillés pour être dessinés | Ils figurent dans les listes seulement. |
| 44 | `overhangsUnsupported` | Les débords de toiture sont pris comme non soutenus par des poteaux (le modèle n’en a pas), donc non comptés ; ajoutez un débord sur poteaux comme surface de balcon. | Débords de toiture non soutenus, non comptés | Ils sont pris comme non soutenus par des poteaux (le modèle n’en a pas) ; ajoutez un débord sur poteaux comme surface de balcon. |
| 45 | `pleineTerre` | Le terrain non bâti est compté en pleine terre ; les surfaces imperméabilisées ou bâties en sous-sol ne sont pas distinguées. | Terrain non bâti compté en pleine terre | Les surfaces imperméabilisées ou bâties en sous-sol ne sont pas distinguées. |
| 46 | `roadWidth` | Une voie sans largeur renseignée est prise large de {width} m. | Largeur de voie par défaut | Une voie sans largeur renseignée est prise large de {width} m. |
| 47 | `roadsUnavailable` | Les voies n’ont pas pu être lues : chaque côté est pris comme latéral. | Voies non lues | Les voies n’ont pas pu être lues : chaque côté est pris comme latéral. |
| 48 | `roofOverhangsUnread` | Les débords de toiture n’ont pas pu être lus et ne sont pas comptés. | Débords de toiture non lus | Ils n’ont pas pu être lus et ne sont pas comptés. |
| 49 | `sdpEstimate` | La surface de plancher est une estimation : certaines déductions attendent votre réponse. | Surface de plancher estimée | Certaines déductions attendent votre réponse. |
| 50 | `sdpPartitions` | Une pièce est mesurée à l’intérieur de ses murs, la surface de plancher au nu intérieur des façades : les cloisons font la différence. | Pièce mesurée dans ses murs, surface de plancher aux façades | Une pièce est mesurée à l’intérieur de ses propres murs, la surface de plancher au nu intérieur des façades : les cloisons font la différence. |
| 51 | `setbackStoreys` | Les reculs sont mesurés depuis les murs et les étages, débords de toit exclus. | Reculs mesurés depuis les murs et les étages | Les débords de toit sont exclus. |
| 52 | `severalCommunes` | La parcelle s’étend sur {count} communes ; elle est lue comme celle de {name}, qui en porte la plus grande part. | Parcelle à cheval sur plusieurs communes | Elle s’étend sur {count} communes ; elle est lue comme celle de {name}, qui en porte la plus grande part. |
| 53 | `severalDocuments` | {count} documents d’urbanisme couvrent la parcelle ; le {type} est affiché. | Plusieurs documents d’urbanisme sur la parcelle | {count} documents d’urbanisme couvrent la parcelle ; le {type} est affiché. |
| 54 | `siteBoundaryParcel` | La limite du site tient lieu de limite parcellaire. | Limite du site = limite parcellaire | La limite du site tient lieu de limite parcellaire. |
| 55 | `streetEdge` | Le côté sur rue est le côté de la limite du site face à {road}. | Côté sur rue déduit de la voie | Le côté sur rue est le côté de la limite du site face à {road}. |
| 56 | `streetEdgeUnnamed` | Le côté sur rue est le côté de la limite du site face à la voie. | Côté sur rue déduit de la voie | Le côté sur rue est le côté de la limite du site face à la voie. |
| 57 | `unconverted` | Certains contours n’ont pas pu être convertis dans le système de coordonnées du projet ; ils figurent dans les listes seulement. | Contours non convertis dans le système du projet | Ils n’ont pas pu être convertis dans le système de coordonnées du projet ; ils figurent dans les listes seulement. |

### English

| # | Key | Before (0.9.0) | Title | Detail |
| -- | -- | -- | -- | -- |
| 1 | `adjoins` | Adjoins the Site boundary: within {distance} m of it over at least {length} m. R.111-17 does not apply along that edge. | Building adjoining the Site boundary | Within {distance} m of the boundary over at least {length} m: R.111-17 does not apply along that edge. |
| 2 | `adjoinsPartially` | Adjoins the Site boundary along part of this edge only; elsewhere the building stands within 3 m of it. | Building adjoining the boundary in part | It adjoins the boundary along part of the edge only; elsewhere it stands within 3 m of it. |
| 3 | `alignment.carriageway` | No parcel faces the edge: the opposite alignment is taken at the carriageway’s far edge, which is stricter than the rule. | Opposite alignment taken at the carriageway | No parcel faces the edge: the opposite alignment is taken at the carriageway’s far edge, which is stricter than the rule. |
| 4 | `alignment.carriagewayUnread` | The parcels across the road could not be read: the opposite alignment is taken at the carriageway’s far edge, which is stricter than the rule. | Opposite alignment at the carriageway (parcels unread) | The parcels across the road could not be read: the opposite alignment is taken at the carriageway’s far edge, which is stricter than the rule. |
| 5 | `alignment.el7` | The opposite alignment is the alignment easement EL7. | Opposite alignment: easement EL7 | The opposite alignment is the alignment easement EL7. |
| 6 | `alignment.parcels` | The opposite alignment is assumed from the cadastral parcels across the road. | Opposite alignment taken from the cadastre | The opposite alignment is assumed from the cadastral parcels across the road. |
| 7 | `anchorOnly` | The plot could not be converted for the planning services: read at the project’s location only. A plot across a zone limit may show one zone. | Read at the project’s location only | The plot could not be converted for the planning services; a plot across a zone limit may show one zone. |
| 8 | `appliesWhereDrawn` | A drawn prescription applies where it is drawn: only to the buildings whose outline meets it. | Drawn prescription: where it is drawn | It applies only to the buildings whose outline meets it. |
| 9 | `balconies` | Balconies are not modelled and not measured. | Balconies not modelled | Balconies are not modelled and not measured. |
| 10 | `balconiesEntered` | Balconies are not modelled; the areas you entered are added. | Balconies not modelled; the areas you entered are added | Balconies are not modelled; the areas you entered are added. |
| 11 | `bandsApproximate` | Bands are each edge’s parallel, clipped to the Site boundary; R.111-16’s is placed from the opposite alignment’s mean distance — an approximation. | Setback bands are approximate | Each band is the edge’s parallel, clipped to the Site boundary; R.111-16’s is placed from the opposite alignment’s mean distance — an approximation. |
| 12 | `checksCapped` | Only the first {count} checks are listed: the Site boundary has too many edges. | List of checks cut short | Only the first {count} checks are listed: the Site boundary has too many edges. |
| 13 | `contiguousTolerance` | Buildings within {distance} m of each other are taken as contiguous: R.111-15 does not apply between them. | Nearby buildings taken as contiguous | Buildings within {distance} m of each other are taken as contiguous: R.111-15 does not apply between them. |
| 14 | `datumDerived` | Ground floor assumed at the terrain’s level at the project origin — set the project’s reference level to confirm. | Ground floor assumed at the terrain’s level | Taken at the terrain’s level at the project origin; set the project’s reference level to confirm. |
| 15 | `edgeSetByYou` | Edge role set by you. | Edge role set by you | You chose this edge’s role (street, side or rear); it replaces the one that was derived. |
| 16 | `edgesCapped` | Only the first {count} Site boundary edges are named: the boundary has too many. | Site boundary edges cut short | Only the first {count} Site boundary edges are named: the boundary has too many. |
| 17 | `edgesDerived` | Side and rear edges are named from the street edges. | Side and rear edges derived | They are named from the street edges. |
| 18 | `envelopeAdjoining` | A building on the limit is exempt from R.111-17 on that edge; the envelope does not draw that case. | Building on the limit not drawn in the envelope | A building on the limit is exempt from R.111-17 on that edge; the envelope does not draw that case. |
| 19 | `envelopeAlignmentMissing` | Where no opposite alignment was found for a street edge, R.111-16’s slope rises from that edge itself: stricter than the rule. | No opposite alignment found: stricter slope | Where no opposite alignment was found for a street edge, R.111-16’s slope rises from that edge itself: stricter than the rule. |
| 20 | `envelopeApproximate` | The envelope’s outline is the Site boundary set back, edge by edge, by the largest confirmed setback of the edge’s role (street, side or rear); a street setback is measured from the street edge’s line, which runs on past the plot’s corners. | Envelope outline is approximate | It is the Site boundary set back, edge by edge, by the largest confirmed setback of the edge’s role (street, side or rear); a street setback is measured from the street edge’s line, which runs on past the plot’s corners. |
| 21 | `envelopeBoundarySlope` | A height that depends on the distance to the Site boundary is measured from the ground at the boundary’s nearest point, the boundary standing for the limit. | Height by distance to the Site boundary | A height that depends on the distance to the boundary is measured from the ground at the boundary’s nearest point, the Site boundary standing for the limit. |
| 22 | `envelopeChecks` | The checks, not the volume, say whether the design is within the rules. | The checks decide, not the volume | The checks, not the volume, say whether the design is within the rules. |
| 23 | `envelopeFacadeCeiling` | The rule limits the façade height; the volume draws it as a ceiling over the whole building, which is stricter than the rule for a roof rising behind the façade. | Façade height drawn as a ceiling | The rule limits the façade height; the volume draws it as a ceiling over the whole building, which is stricter for a roof rising behind the façade. |
| 24 | `envelopeHeightGround` | In the volume, a height is measured from the ground at each point (the terrain drawn), not from a façade’s foot. | Height measured from the ground, point by point | In the volume, a height is measured from the ground at each point (the terrain drawn), not from a façade’s foot. |
| 25 | `envelopeHeightWithin` | In the volume, a height drawn on the plan applies only inside the prescription’s outline (where the outline and the prescription overlap). | Drawn height applies inside the prescription’s outline | In the volume, a height drawn on the plan applies only inside the prescription’s outline, where the outline and the prescription overlap. |
| 26 | `envelopeLattice` | The 3D volume is computed about every metre: exact at each computed point; between two points, near the ends or re-entrant corners of a limit whose height depends on the distance, it may stand above the rule by at most half the slope per metre. | 3D volume computed about every metre | Exact at each computed point; between two points, near the ends or re-entrant corners of a limit whose height depends on the distance, it may stand above the rule by at most half the slope per metre. |
| 27 | `envelopeNotApplied` | The envelope draws only the rules listed as applied in its view; a confirmed rule it cannot draw (a façade height, a maximum setback, a ratio, a distance between buildings) still limits the design. | Rules the envelope does not draw | The envelope draws only the rules listed as applied in its view; a confirmed rule it cannot draw (a façade height, a maximum setback, a ratio, a distance between buildings) still limits the design. |
| 28 | `envelopeReentrantCorners` | At a re-entrant corner of the Site boundary, and where a side or rear limit ends at an open corner, the outline follows the rounded line at the setback, drawn as straight pieces just inside it: stricter than the rule. | Re-entrant corners rounded in the envelope | At a re-entrant corner of the Site boundary, and where a side or rear limit ends at an open corner, the outline follows the rounded line at the setback, drawn as straight pieces just inside it: stricter than the rule. |
| 29 | `envelopeSetbackLine` | The required setback line drawn on the plan replaces the opposite alignment. | Setback line drawn on the plan | The required setback line drawn on the plan replaces the opposite alignment. |
| 30 | `existingAsModelled` | Existing building as modelled; the regulation means it as it stood when the plan was approved ({date}). | Existing building as modelled | The regulation means it as it stood when the plan was approved ({date}). |
| 31 | `existingReplaced` | The existing building is to be replaced: it is not counted. | Existing building replaced, not counted | The existing building is to be replaced: it is not counted. |
| 32 | `facadeHeightFoot` | The façade height is measured from the wall’s foot to its top, sample by sample; a lexicon that measures it otherwise is to be read. | Façade height from the wall’s foot to its top | Measured sample by sample; a lexicon that measures it otherwise is to be read. |
| 33 | `featuresCapped` | Only {count} features are drawn: the derived bands past them are left out. | Drawn features cut short | Only {count} features are drawn: the derived bands past them are left out. |
| 34 | `floorToFloorDefault` | Floor-to-floor taken as {height} m, the editor’s default storey height: the storeys’ own height is not available to this extension. | Default floor-to-floor height | Taken as {height} m, the editor’s default storey height: the storeys’ own height is not available to this extension. |
| 35 | `governedByFloor` | Both limits are missed; the larger shortfall is the 3 m minimum, shown here. | Both limits missed: the 3 m minimum governs | The larger shortfall is the 3 m minimum, shown here. |
| 36 | `governedByRise` | Both limits are missed; the larger shortfall is half the altitude difference, shown here. | Both limits missed: the altitude difference governs | The larger shortfall is half the altitude difference, shown here. |
| 37 | `heightLowestGround` | Height measured from the lowest ground at the building’s foot — check which reference the regulation uses. | Height from the lowest ground | Measured at the lowest point of the ground at the building’s foot; check which reference the regulation uses. |
| 38 | `lineTargetsCapped` | Only the first {count} street edges are measured for R.111-16. | Street edges measured cut short | Only the first {count} street edges are measured for R.111-16. |
| 39 | `noOrnaments` | Ornaments and canopies (marquises), which R.420-1 leaves out, are not modelled. | Ornaments and canopies not modelled | R.420-1 leaves them out; they are not modelled. |
| 40 | `noPlot` | No plot is picked: read at the project’s location only. | No plot picked | Read at the project’s location only. |
| 41 | `noRoad` | No road found within 30 m of the Site boundary: every edge is taken as a side edge. | No road within 30 m | No road found within 30 m of the Site boundary: every edge is taken as a side edge. |
| 42 | `noStreetEdge` | No Site boundary edge faces a road: every edge is taken as a side edge. | No edge faces a road | No Site boundary edge faces a road: every edge is taken as a side edge. |
| 43 | `outlineTooDetailed` | Some outlines are too detailed to draw; they are shown in the lists only. | Outlines too detailed to draw | They are shown in the lists only. |
| 44 | `overhangsUnsupported` | Roof overhangs are taken as not supported by posts (the model has no posts), so not counted; add one on posts as a balcony area. | Roof overhangs unsupported, not counted | They are taken as not supported by posts (the model has no posts); add one on posts as a balcony area. |
| 45 | `pleineTerre` | Unbuilt ground counted as pleine terre; paved or built-underground areas are not distinguished. | Unbuilt ground counted as pleine terre | Paved or built-underground areas are not distinguished. |
| 46 | `roadWidth` | A road without a recorded width is taken as {width} m wide. | Default road width | A road without a recorded width is taken as {width} m wide. |
| 47 | `roadsUnavailable` | The roads could not be read: every edge is taken as a side edge. | Roads not read | The roads could not be read: every edge is taken as a side edge. |
| 48 | `roofOverhangsUnread` | Roof overhangs could not be read and are not counted. | Roof overhangs not read | They could not be read and are not counted. |
| 49 | `sdpEstimate` | The surface de plancher is an estimate: some deductions need your answer. | Floor area is an estimate | Some deductions need your answer. |
| 50 | `sdpPartitions` | A room is measured inside its own walls, the surface de plancher inside the external walls: partitions make the difference. | Room measured inside its walls, floor area at the façades | A room is measured inside its own walls, the surface de plancher inside the external walls: partitions make the difference. |
| 51 | `setbackStoreys` | Setbacks are measured from the walls and upper storeys, roof overhangs left out. | Setbacks measured from the walls and storeys | Roof overhangs are left out. |
| 52 | `severalCommunes` | The plot spans {count} communes; it is read as {name}’s, the commune holding most of it. | Plot spans several communes | It spans {count} communes; it is read as {name}’s, the commune holding most of it. |
| 53 | `severalDocuments` | {count} planning documents cover the plot; the {type} is shown. | Several planning documents cover the plot | {count} planning documents cover the plot; the {type} is shown. |
| 54 | `siteBoundaryParcel` | The Site boundary stands for the parcel limit. | Site boundary stands for the parcel limit | The Site boundary stands for the parcel limit. |
| 55 | `streetEdge` | The street side is the Site boundary edge facing {road}. | Street edge taken from the road | The street side is the Site boundary edge facing {road}. |
| 56 | `streetEdgeUnnamed` | The street side is the Site boundary edge facing the road. | Street edge taken from the road | The street side is the Site boundary edge facing the road. |
| 57 | `unconverted` | Some outlines could not be converted to the project’s coordinate system; they are shown in the lists only. | Outlines not converted to the project’s system | They could not be converted to the project’s coordinate system; they are shown in the lists only. |
