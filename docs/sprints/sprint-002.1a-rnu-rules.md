# Sprint 002.1a — RNU Rules

> **Status:** **Implemented, uncommitted (2026-10-20)** — `fr-urban-rules` 0.2.0;
> step 1 verified (Légifrance live + DILA's LEGI export, see the Outcome); 91
> tests green; the editor walk (criterion 10) is **not done**.
>
> **Version:** 1.1 (split from 002.1 v1.0 at its review, 2026-10-20)
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules` → **0.2.0**
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 5.1 (RNU and carte communale: coded rules), US-04 and US-05 for plots
> with no local plan. The first half of the former 002.1; the second is
> [002.1b — Alignment and Neighbours](sprint-002.1b-alignment-and-neighbours.md).
>
> **Prerequisites:** 002.0 (the reading, the regimes, the views, the plot
> cache). Platform: 083.12 (the Site boundary, ADR-0089, edges numbered and
> never persisted by number), 096.0a–b (Site measures, ADR-0113, contract
> 3.19.0), 096.1 (the measures on the SDK, 1.24), 096.3a–b (views, actions,
> `runAction`, SDK 1.26), 096.4 (package data, contract 3.20.0, SDK 1.27, for
> the edge-role correction). The platform README: "002.1a–b need 096.0a–b,
> 096.1 and 096.4". The manifest gains the `document` capability, which
> `SitePackageDataService.write` requires (096.4 DEC-7).
>
> **Sizes:** the verified law, the coded-rule table, the edge naming and its
> correction, the R.111-17 checks. No platform change. Medium.

---

# Sprint Design Contract

Verified against `fr-urban-rules/src/index.js` on 2026-10-20.

- [x] **Step 1 is the law, read first.** No rule is encoded before its
      consolidated text has been read on Légifrance and its version date
      recorded in the rule's citation. If Légifrance cannot be read, the
      sprint stops at step 1 and says so.
      _Held, with a channel deviation recorded below: every article's
      `LEGIARTI` id, start date and opening were read on live Légifrance; the
      full text from DILA's official LEGI export of that same id. `ARTICLES`
      was generated from that record, not typed._
- [x] **Measured to the Site boundary, never the "property line"**. Every
      string says "Site boundary"; every check on R.111-17 carries the
      assumption that the Site boundary stands for the parcel limit.
      _Held: criterion 9's test scans the source and both locales; every
      check carries `site-boundary-parcel`._
- [x] **The host measures; the extension applies the rule.**
      _Held: distances, rises, worst pairs and façade samples come from
      `measures.distances`; the extension compares them with 0.5 and 3 m and
      reads the samples. Edge naming is the extension's (the host offers none)._
- [x] **Assumptions are said, every time.** _Held: every edge carries an
      `assumptionId`; derived, corrected, no-road and refused cases each have
      their own; checks name theirs._
- [x] **Never "compliant".** _Held: results are `no_issue`,
      `potential_issue` or `not_checked`._
- [x] **Context data is fetched, not stored.** _Held: roads live in the
      reader's closure (per Site boundary, per session); only `edgeRoles`
      is written, from an action._
- [x] **One section, one schema.** _Held: `{ schema: 1, edgeRoles }`; the
      builders keep every other member (criterion 4's test keeps
      `confirmations` and `entered`); an unknown schema is read-only._

---

# Outcome (2026-10-20)

> **Walked in acceptance** (2026-10-20) by Sprint 002.4 jointly with the platform's 096.6, on five reference plots in the editor — see 002.4's Outcome; the owner has not looked yet.

`fr-urban-rules` **0.2.0**, uncommitted. Manifest: `capabilities`
`["regulations", "document"]`. New in the tree:

```text
fr-urban-rules/src/index.js            ARTICLES (generated from the record), createRnu: rules, edges, section, checks, runAction
fr-urban-rules/tests/rnu.test.mjs      33 tests (criteria 1–9)
fr-urban-rules/scripts/capture-roads.mjs     carte-gouv-fr's road source → <plot>/roads.json
fr-urban-rules/scripts/capture-measures.mjs  the platform's getBuildingDistances → measures/<case>.json
test-fixtures/fr-urban-rules/legi-articles.json   step 1's record
test-fixtures/fr-urban-rules/{brouennes,mouzay}/roads.json
test-fixtures/fr-urban-rules/measures/{pitched,pitched-overhangs,no-terrain,datum-derived}.json
```

**Gates.** `node --test fr-urban-rules/tests/*.test.mjs` — **91 pass, 0 fail**
(58 before); `urban-rules` 10 and `sh3f-importer` 99 pass. `archisimple package
validate ./fr-urban-rules` passes (0.2.0). build-index (3 packages) and
check-index (3 of 3) into the scratchpad succeed; the `.aspkg` is 0.27 MB. Out
of the suite, an `rnu` report (Brouennes, a boundary, a road, the recorded
measures, an unapplied correction) and a `cc` one (Mouzay's real roads) passed
the platform's built `checkedReport` **with actions allowed**: 0 dropped, 0
refused, progress included; 002.0's five plots still 0 dropped.

## Step 1 — the law (DEC-1)

**Channels.** Légifrance's pages answer `curl` with a Cloudflare challenge
(HTTP 403, "Just a moment…"). They are readable through a fetching tool, which
gives each article's number, "Version en vigueur depuis le" date, neighbouring
`LEGIARTI` ids and opening words — but whose summariser will not return a full
article verbatim. So, for each article:

- **in force today**: live Légifrance, `codes/article_lc/<LEGIARTI>`, read
  2026-10-20: the number, the start date, no later version, the opening words
  matching;
- **the full text**: DILA's official **LEGI** open-data export — the Légifrance
  database itself (`echanges.dila.gouv.fr/OPENDATA/LEGI/`,
  `Freemium_legi_global_20250713-140000.tar.gz`, the Code de l'urbanisme's
  article XML), the `<CONTENU>` of that same `LEGIARTI` version (an id names
  one version's text), markup removed, paragraphs kept. Each is `ETAT
  VIGUEUR` with the same start date.

DEC-1 names three channels (the article page, the Code's PDF export, PISTE);
this is a fourth, the export of the same database. Recorded as a deviation
and owner question 1. PISTE was not used (no account here).

**What step 1 confirms** (each asserted by a test on the record):
R.111-16 — the opposite alignment, the difference in altitude between the two
points, the required setback line substituting for the alignment, private
roads alike; **and one more sentence**: "Toutefois une implantation de la
construction à l'alignement ou dans le prolongement des constructions
existantes peut être imposée." R.111-17 — "A moins que le bâtiment à
construire ne jouxte la limite parcellaire", half the difference in altitude,
never under three metres. R.111-15 — "peut être imposée", and only between two
non-contiguous buildings on land of the same owner (now the rule's
`conditions`). R.111-1 — R.111-3, R.111-5 to R.111-19 and R.111-28 to R.111-30
do not apply where a PLU or a document standing for one exists: they **do**
under a carte communale. L.111-3 — neither PLU, nor a document standing for
one, nor a carte communale. R.111-28 — "hauteur moyenne des constructions
avoisinantes". L.111-4 — the exception list, carried as L.111-3's exception.

### R.111-1 — `LEGIARTI000034355056`

Version en vigueur depuis le 1er avril 2017 (`2017-04-01`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000034355056>

> Le règlement national d'urbanisme est applicable aux constructions et aménagements faisant l'objet d'un permis de construire, d'un permis d'aménager ou d'une déclaration préalable ainsi qu'aux autres utilisations du sol régies par le présent code.
> Toutefois les dispositions des articles R. 111-3, R. 111-5 à R. 111-19 et R. 111-28 à R. 111-30 ne sont pas applicables dans les territoires dotés d'un plan local d'urbanisme ou d'un document d'urbanisme en tenant lieu.
> Les termes utilisés par le règlement national d'urbanisme peuvent être définis par un lexique national d'urbanisme, pris par arrêté du ministre chargé de l'urbanisme.

### R.111-15 — `LEGIARTI000031721290`

Version en vigueur depuis le 1er janvier 2016 (`2016-01-01`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031721290>

> Une distance d'au moins trois mètres peut être imposée entre deux bâtiments non contigus situés sur un terrain appartenant au même propriétaire.

### R.111-16 — `LEGIARTI000031721288`

Version en vigueur depuis le 1er janvier 2016 (`2016-01-01`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031721288>

> Lorsque le bâtiment est édifié en bordure d'une voie publique, la distance comptée horizontalement de tout point de l'immeuble au point le plus proche de l'alignement opposé doit être au moins égale à la différence d'altitude entre ces deux points. Lorsqu'il existe une obligation de construire au retrait de l'alignement, la limite de ce retrait se substitue à l'alignement. Il en sera de même pour les constructions élevées en bordure des voies privées, la largeur effective de la voie privée étant assimilée à la largeur réglementaire des voies publiques.
> Toutefois une implantation de la construction à l'alignement ou dans le prolongement des constructions existantes peut être imposée.

### R.111-17 — `LEGIARTI000031721286`

Version en vigueur depuis le 1er janvier 2016 (`2016-01-01`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031721286>

> A moins que le bâtiment à construire ne jouxte la limite parcellaire, la distance comptée horizontalement de tout point de ce bâtiment au point de la limite parcellaire qui en est le plus rapproché doit être au moins égale à la moitié de la différence d'altitude entre ces deux points, sans pouvoir être inférieure à trois mètres.

### R.111-18 — `LEGIARTI000031721284`

Version en vigueur depuis le 1er janvier 2016 (`2016-01-01`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031721284>

> Lorsque, par son gabarit ou son implantation, un immeuble bâti existant n'est pas conforme aux prescriptions de l'article R. 111-17, le permis de construire ne peut être accordé que pour des travaux qui ont pour objet d'améliorer la conformité de l'implantation ou du gabarit de cet immeuble avec ces prescriptions, ou pour des travaux qui sont sans effet sur l'implantation ou le gabarit de l'immeuble.

### R.111-19 — `LEGIARTI000031721282`

Version en vigueur depuis le 1er janvier 2016 (`2016-01-01`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031721282>

> Des dérogations aux règles édictées aux articles R. 111-15 à R. 111-18 peuvent être accordées par décision motivée de l'autorité compétente mentionnée aux articles L. 422-1 à L. 422-3, après avis du maire de la commune lorsque celui-ci n'est pas l'autorité compétente.
> En outre, le préfet peut, après avis du maire, apporter des aménagements aux règles prescrites aux articles R. 111-15 à R. 111-18, sur les territoires où l'établissement de plans locaux d'urbanisme a été prescrit, mais où ces plans n'ont pas encore été approuvés.

### R.111-28 — `LEGIARTI000031721256`

Version en vigueur depuis le 1er janvier 2016 (`2016-01-01`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031721256>

> Dans les secteurs déjà partiellement bâtis, présentant une unité d'aspect et non compris dans des programmes de rénovation, l'autorisation de construire à une hauteur supérieure à la hauteur moyenne des constructions avoisinantes peut être refusée ou subordonnée à des prescriptions particulières.

### L.111-3 — `LEGIARTI000031210179`

Version en vigueur depuis le 1er janvier 2016 (`2016-01-01`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031210179>

> En l'absence de plan local d'urbanisme, de tout document d'urbanisme en tenant lieu ou de carte communale, les constructions ne peuvent être autorisées que dans les parties urbanisées de la commune.

### L.111-4 — `LEGIARTI000047303702`

Version en vigueur depuis le 12 mars 2023 (`2023-03-12`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047303702>

> Peuvent toutefois être autorisés en dehors des parties urbanisées de la commune :
> 1° L'adaptation, le changement de destination, la réfection, l'extension des constructions existantes ou la construction de bâtiments nouveaux à usage d'habitation à l'intérieur du périmètre regroupant les bâtiments d'une ancienne exploitation agricole, dans le respect des traditions architecturales locales ;
> 2° Les constructions et installations nécessaires à l'exploitation agricole, à des équipements collectifs dès lors qu'elles ne sont pas incompatibles avec l'exercice d'une activité agricole, pastorale ou forestière sur le terrain sur lequel elles sont implantées, à la réalisation d'aires d'accueil ou de terrains de passage des gens du voyage, à la mise en valeur des ressources naturelles et à la réalisation d'opérations d'intérêt national ;
> 2° bis Les constructions et installations nécessaires à la transformation, au conditionnement et à la commercialisation des produits agricoles, lorsque ces activités constituent le prolongement de l'acte de production et dès lors qu'elles ne sont pas incompatibles avec l'exercice d'une activité agricole, pastorale ou forestière sur le terrain sur lequel elles sont implantées. Ces constructions et installations ne peuvent pas être autorisées dans les zones naturelles, ni porter atteinte à la sauvegarde des espaces naturels et des paysages. L'autorisation d'urbanisme est soumise pour avis à la commission départementale de la préservation des espaces naturels, agricoles et forestiers ;
> 3° Les constructions et installations incompatibles avec le voisinage des zones habitées et l'extension mesurée des constructions et installations existantes ;
> 4° Les constructions ou installations, sur délibération motivée du conseil municipal, si celui-ci considère que l'intérêt de la commune, en particulier pour éviter une diminution de la population communale, le justifie, dès lors qu'elles ne portent pas atteinte à la sauvegarde des espaces naturels et des paysages, à la salubrité et à la sécurité publiques, qu'elles n'entraînent pas un surcroît important de dépenses publiques et que le projet n'est pas contraire aux objectifs visés à l'article L. 101-2 et aux dispositions des chapitres I et II du titre II du livre Ier ou aux directives territoriales d'aménagement précisant leurs modalités d'application.
> Pour l'application du présent article, les installations de production et, le cas échéant, de commercialisation, par un ou plusieurs exploitants agricoles, de biogaz, d'électricité et de chaleur par la méthanisation qui respectent les conditions fixées à l'article L. 311-1 du code rural et de la pêche maritime sont considérées comme des constructions ou des installations nécessaires à l'exploitation agricole mentionnées au 2° du présent article.

### L.161-4 — `LEGIARTI000047303314`

Version en vigueur depuis le 12 mars 2023 (`2023-03-12`); read 2026-10-20; <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047303314>

> I.-La carte communale délimite les secteurs où les constructions sont autorisées et les secteurs où les constructions ne sont pas admises, à l'exception :
> 1° De l'adaptation, du changement de destination, de la réfection ou de l'extension des constructions existantes ainsi que de l'édification d'annexes à proximité d'un bâtiment existant ;
> 2° Des constructions et installations nécessaires :
> a) A des équipements collectifs ;
> b) A l'exploitation agricole ou forestière, à la transformation, au conditionnement et à la commercialisation des produits agricoles lorsque ces activités constituent le prolongement de l'acte de production ;
> c) A la mise en valeur des ressources naturelles ;
> d) Au stockage et à l'entretien du matériel des coopératives d'utilisation de matériel agricole.
> Les constructions et installations mentionnées au 2° ne peuvent être autorisées que lorsqu'elles ne sont pas incompatibles avec l'exercice d'une activité agricole, pastorale ou forestière sur le terrain sur lequel elles sont implantées et qu'elles ne portent pas atteinte à la sauvegarde des espaces naturels ou des paysages.
> Les constructions et installations mentionnées aux b et d du même 2° sont soumises à l'avis de la commission départementale de la préservation des espaces naturels, agricoles et forestiers.
> Pour l'application du présent article, les installations de méthanisation mentionnées à l'article L. 111-4 sont considérées comme des constructions ou des installations nécessaires à l'exploitation agricole au sens du b du 2° du présent article.
> Dans les communes non couvertes par un schéma de cohérence territoriale, la carte communale peut délimiter les zones d'accélération pour l'implantation d'installations terrestres de production d'énergies renouvelables arrêtées en application de l'article L. 141-5-3 du code de l'énergie.
> II.-La carte communale peut délimiter des secteurs dans lesquels est soumise à conditions l'implantation d'installations de production d'énergies renouvelables, dès lors qu'elles sont incompatibles avec le voisinage habité ou avec l'usage des terrains situés à proximité ou qu'elles portent atteinte à la sauvegarde des espaces naturels et des paysages, à la qualité architecturale, urbaine et paysagère, à la mise en valeur du patrimoine et à l'insertion des installations dans le milieu environnant.
> Dans les communes des départements pour lesquels a préalablement été arrêtée une cartographie des zones d'accélération pour l'implantation d'installations terrestres de production d'énergies renouvelables en application de l'article L. 141-5-3 du code de l'énergie et lorsque l'avis du comité régional de l'énergie a estimé, dans les conditions prévues au même article L. 141-5-3, que les zones d'accélération identifiées par ladite cartographie sont suffisantes pour l'atteinte des objectifs régionaux établis en application de l'article L. 141-5-1 du même code, la carte communale peut également délimiter des secteurs où est exclue l'implantation d'installations de production d'énergies renouvelables, dès lors qu'elles sont incompatibles avec le voisinage habité ou avec l'usage des terrains situés à proximité ou qu'elles portent atteinte à la sauvegarde des espaces naturels et des paysages, à la qualité architecturale, urbaine et paysagère, à la mise en valeur du patrimoine et à l'insertion des installations dans le milieu environnant. Les secteurs délimités en application du présent alinéa sont applicables uniquement aux projets dont la demande d'autorisation auprès de l'autorité compétente est déposée après l'approbation de la carte communale délimitant de tels secteurs. Les secteurs délimités en application du présent alinéa ne sont pas applicables aux procédés de production d'énergies renouvelables en toiture ou aux procédés de chaleur à usage individuel.

## What landed, by decision

- **DEC-2.** Six rules under `rnu`, five under `cc` (no L.111-3); R.111-18/19
  and L.111-4 only as `exceptions`, verbatim and prefixed by their number;
  citation `document` "Code de l'urbanisme, version en vigueur depuis le
  1er janvier 2016" (the article's own date), `article`, `passage` (the text),
  `href` (the `LEGIARTI` page). A non-constructible sector (every sector
  `typesect` 03) adds the flag `cc-restricted` quoting L.161-4.
- **DEC-3 / DEC-4.** Edges from `site.boundary.ring`, roads from
  `queryRoads` over the box grown by 30 m (limit 500), once per ring digest per
  session, again on `refresh`; `road`/`roundabout` at `ground`/`bridge` only;
  street within half width + 20 m of the midpoint, outward, within 45°; rear
  opposite a street edge and touching none; side otherwise.
- **DEC-5 / DEC-8.** The `rules`, `edges` and `checks` views; one
  `set-edge-role` per edge (ends in `subjectId`), `forget-edge-role` for the
  corrections not applied, grouped "no longer matching an edge" and "from
  another plot"; `runAction` writes once with `expected`, answers `done`
  without a report, `refused` on `false`, on a throw, on a changed edge and on
  a read-only section.
- **DEC-6 / DEC-7.** One `measures.distances` per building of the open
  Document (`withRoofOverhangs`, ratio 0.5, `byFacade`), `storeys` on an
  `outline-refused`; `no_issue` iff `worst.margin ≥ 0` and `nearest ≥ 3 m`;
  measured and limit on the governing pair; "adjoins" on five consecutive
  samples ≤ 0.05 m; every unavailable rise, target or answer `not_checked`.

## Deviations (the SDK, the data or the channel won)

1. **Step 1's channel** (above): live Légifrance for "in force since", DILA's
   LEGI export for the verbatim text. Owner question 1.
2. **A `not_checked` reason travels as an assumption**: `RegulationCheck` has
   no detail member, so each reason is an assumption `not-checked-<reason>`
   ("Terrain du site non renseigné"…) named in the check's `assumptionIds`.
3. **Progress reports carry the rules and the edges, not the checks**: the
   checks ask the host's measures, and are computed once, on the answer.
4. **No Site boundary**: one `not_checked` check per building, its subject the
   building (there is no edge to name), with `not-checked-no-boundary`.
5. **"No edge faces a road" is its own assumption** (`no-street-edge`), apart
   from "no road found within 30 m" (`no-road`): Brouennes AB0280's recorded
   roads all lie 37 m or more from every edge's midpoint — a back plot, every
   edge `side`, said. DEC-3 named only the second.
6. **A carte communale sector is non-constructible only when every sector is
   `03`**; `01`, `02`, `99` or none list the rules with no flag.
7. **Fixtures.** Mouzay is AB0346 (002.0's), not "the parcel 002.4 chose" (not
   chosen yet). The measures were recorded through the platform's Automation
   API and its built test harness (`automation-api/dist/__tests__/support`),
   not from a building drawn in the editor; the house reproduces 096.0b's
   criterion 4 exactly (0.3 m walls, centrelines 0.15 m in). Criterion 7's
   adjoining case edits the recorded samples; no adjoining building was
   recorded.
8. **`rnu:other`** cites "R.111-2 à R.111-14, R.111-20 à R.111-27" with no
   `LEGIARTI` link (a range); criterion 1 covers the five articles a rule rests on.
9. **Edge actions** list at most 200; a boundary past that says so.

## Acceptance criteria, walked

1. ✅ The articles quoted above with `LEGIARTI`, start and read dates;
   `rnu.test.mjs` "criterion 1" checks each rule's `href`, `document.text`
   date, verbatim `passage` and `versionFrom` against the record, and
   "step 1 confirms the readings".
2. ✅ "criterion 2" ×2 (exact ids, statuses, statements; exceptions; a mirror
   of the host's `rule` check), plus the non-constructible flag and "a PLU or
   not-published report gets no coded rule".
3. ✅ "criterion 3" ×4 with a stubbed `queryRoads`: south road → S street, N
   rear, E/W side; corner → two streets; none → four side; refusal → four side
   and `roads` unavailable; no boundary → no edges and `not_checked` "no Site
   boundary drawn". Plus DEC-3/4 tests (non-streets, width assumed, asked once).
4. ✅ "criterion 4" ×4: one write with `expected`, unowned members kept, the
   role wins; survives renumbering; "no longer matching" and "from another
   plot" listed, never pruned, removed only by Forget; `false` and a throw
   refused; plus the read-only schema.
5. ✅ "criterion 5": the table, four three-option `choice` actions, `rules` and
   `checks` views, ids `[a-z0-9-]{1,64}`.
6. ✅ "criterion 6" on the platform's recorded answer: `no_issue`, measured
   4.00 m, limit 3 m (0.5 × 6.00 = 3.00, the floor governs); the asked
   targets are the three non-street edges, `withRoofOverhangs`, ratio 0.5,
   `byFacade`.
7. ✅ "criterion 7": five samples ≤ 0.05 m → `no_issue` with `adjoins`; four →
   `potential_issue`.
8. ✅ "criterion 8" ×4: `no-terrain` (recorded), `outside-terrain`,
   `unmeasured`, `other-system`, `no-datum`, `no-solids`, a target's
   `outline-refused`, an answer's `not-located`; `datumDerived` (recorded) runs
   with `datum-derived`; a refused `withRoofOverhangs` falls back to `storeys`,
   said.
9. ✅ "criterion 9": no "property" / « propriété » in the source (the SDK's
   `entity.property()` method excepted) or either locale.
10. ❌ **Not done**: the editor walk on Brouennes (checks updating within a
    second of a wall move, an edge-role correction reverted by one Undo) needs
    a browser. Proposed for 096.6 / 002.4's joint walk, as 002.0's was.

## Questions for the owner (new)

1. Accept DILA's LEGI export (the Légifrance database) as the verbatim-text
   channel beside the live Légifrance check, or require PISTE under your
   account?
2. The R.111-16 sentence step 1 found ("Toutefois une implantation … à
   l'alignement … peut être imposée"): an `exceptions` phrase on R.111-16 in
   002.1b?

## Review fixes (2026-10-20)

An independent review found no blocking defect, re-verified five articles
live and found `ARTICLES` byte-identical to the record. The coordinator's
decisions, on the owner's behalf: **Q1** DILA's LEGI export plus the live
Légifrance check is accepted as step 1's channel; **Q2** the extra R.111-16
sentence becomes an exception on R.111-16 in 002.1b; **Q3** criterion 10 goes
to the 096.6 / 002.4 joint walk.

Fixed, each with a test (`rnu.test.mjs`, "review N"):

1. **Decided and shown on one pair.** `failsMinimum` (nearest < 3 m) and
   `failsRise` (worst margin < 0) are decided apart: the floor alone shows the
   nearest pair against 3 m; the rise alone the worst pair against max(3 m,
   ½·rise); both, the larger shortfall, said by `governed-by-floor` or
   `governed-by-rise`. The probe (nearest 2.5 m at rise 0, worst 4 m at rise 7)
   now reads 2.5 m against 3 m — it read 4 m against 3.5 m, a "potential
   issue" its own figures contradicted.
2. **The model's resolution**: margin ≥ −0.0005 and distance ≥ 3 − 0.0005;
   figures shown to the millimetre. 2.9999999 m is 3.000 m, no issue.
3. **Never past the host's counts**: edges ≤ 500, checks ≤ 1,000 (the targets
   asked per building capped first), assumptions ≤ 500 (one per road, not per
   street edge; the named ones kept first); past a cap the rules and views
   stay and an assumption and a notice say so. A 20,000-edge boundary answers
   500 edges and 1,000 checks in 0.35 s and **the platform's built
   `checkedReport` accepts it, 0 dropped** (scratch run). The rear test is now
   a set lookup: it took 43 s on that boundary.
4. **`runAction` never throws**: its whole body is inside the refusal.
5. Nits: "adjoins" also needs the nearest pair within 5 cm, and a run with
   other samples of that edge between 5 cm and 3 m is `adjoins-partially`
   (still no issue, the reading said); no terrain and closer than 3 m is a
   definite issue on the floor, the rise said not checked; the dead ternary
   and the `void` parameters removed; an `edgeRoles` of a shape not recognised
   makes the section read-only, never overwritten (the "keep unknown entries"
   path removed); the roads refusal says "press Refresh"; no `Math.min(...)`
   spread over a boundary; the main building is asked without an id and named
   from the `distances` answer (`projection` only when there is no boundary to
   ask with); a carte communale partly non-constructible flags "some sectors".

**Gates after the fixes**: `fr-urban-rules` **100 pass, 0 fail**;
`urban-rules` 10, `sh3f-importer` 99; build-index (3) and check-index (3 of 3)
into the scratchpad; the augmented `rnu` and `cc` reports still pass
`checkedReport` with actions, 0 dropped.

## Revision by Sprint 002.4 (2026-10-20)

The owner's Q5 in 002.4, decided on the owner's behalf: **one R.111-17 check
per building**, not one per building and non-street edge. Each edge is still
measured and evaluated as DEC-6 says (and draws its own band, DEC-5); the
report then folds a building's edges into one check, id
`r111-17:<buildingId>`: the **worst edge governs** — the largest shortfall
among the potential issues, else an edge not checked, else the smallest
margin — and its result, `measured`, `limit` and `figure` are the check's;
the other edges are listed in the subject's label
(`check.subject.mainEdges` / `namedEdges`: "… edge 9 (other edges: 10
(3.31 m), …)", with the edge's own limit where it differs). `governed-by-*`
stays the governing edge's; the others' assumptions are kept. The SDK's
`RegulationCheck` has no detail field, hence the label.
(`oneCheckPerBuilding` in `src/index.js`; `tests/rnu.test.mjs` criterion 6,
criterion 7, DEC-6, review 5.) R.111-16 (002.1b) is not folded.

## Post-sprint list

- [x] Package `README.md` (0.2.0 section, the capture scripts) and the
      repository `README.md` row.
- [ ] Criterion 10: the editor walk — to 096.6 / 002.4's joint walk.
- [ ] Commit (the owner's).

---

# Current state

- After 002.0 the report carries the regime: `rnu` and `cc` (carte
  communale) have **no rules at all**. Brouennes and Mouzay show a regime
  and flags, and nothing measured.
- **The platform gives** (implemented, uncommitted, 2026-10-20):
  - 083.12: the Site boundary on the Site view (`SiteView.boundary`,
    optional — `site.ts:148`), one counter-clockwise ring, edge *i* from
    point *i* to *i + 1*, renumbered by every edit;
  - 096.0b / 096.1: `measures.distances({ buildingId?, variationId?,
    outline, targets, ratios?, byFacade? })` (`site.ts:519-527`), targets
    `boundary-edge` (1-based `edge`), `line`, `building`; per target the
    `nearest` pair and, per ratio, the `worst` pair minimising
    `distance − ratio × rise`, with `margin`, `frame` and `datumDerived`;
    per façade run, distance samples every 0.25 m;
  - 096.2–096.3b: the report's `edges[] { edge, role, assumptionId? }`,
    rules, checks, views and blocks, actions with fields and
    `RegulationSource.runAction`;
  - 096.4: `SitePackageDataService` on `site-package-data`: `read()`,
    `write(data, label?, expected?)`, `onDidChange`.
- **Roads** (SDK 1.23, `packages/extension-sdk/src/roads.ts`): a
  `RoadService` on the `roads` token, **ambient**
  (`extension-manager.ts`, `AMBIENT_SERVICE_TOKENS`), whose
  `queryRoads(query)` asks **every registered road source** (not the
  profile's) and takes the map features' box query (`crs`, min/max
  easting/northing, `limit`). France's source is
  `carte-gouv.troncon-de-route` (BD TOPO centrelines, `widthMetres`,
  `kind`, `level`, `name`). A refusal is `{ refused, detail? }`.

---

# Goal

On a plot under the RNU or a carte communale, the national rules appear as
coded rules with their article and the version of the text read; the Site
boundary's edges are named street, side or rear, and the user can correct a
role; and R.111-17 is measured against every building of the open design as
it changes, with its assumptions shown.

# Out of scope

- **002.1b:** R.111-16's opposite alignment and its check, R.111-15's
  check, R.111-28's neighbours, the setback bands. The **rules** of all
  three are in this sprint's table (DEC-2); their checks are not.
- PLU rules of any provenance (002.2).
- The theoretical envelope's outline and volume (002.7, 096.9).
- L.111-3's "built-up parts" (`not_evaluable` by design: a judgment on the
  commune's urban fabric, made by the authority).
- R.111-2 to R.111-14, R.111-20 to R.111-27 (safety, health, landscape,
  appearance): not geometric, or not measurable from what the editor holds.
  Listed as `not_evaluable` under one "Other national rules" entry, so their
  absence is not read as permission.
- Editing the Site boundary (083.12 is its editor).

---

# Decisions

## DEC-1 — Step 1: the consolidated text, verified on Légifrance

For each article — R.111-1 (scope), R.111-15, R.111-16, R.111-17, R.111-18,
R.111-19, R.111-28, L.111-3, **L.111-4** (L.111-3's exceptions, proposal
§ 5.1) and **L.161-4** (what a carte communale allows in a non-constructible
sector, DEC-2) — read the **consolidated** version on Légifrance
(`legifrance.gouv.fr/codes/article_lc/LEGIARTI…`, the Code de l'urbanisme),
and record in the sprint's outcome **and** in the rule's citation (DEC-2):

- the article number and its `LEGIARTI` identifier;
- the version's start date ("Version en vigueur depuis le …");
- the full text, quoted;
- the date it was read.

What step 1 must confirm or correct, from proposal § 5.1:

- R.111-16: the opposite **alignment**, the **difference in altitude**
  between the two points, the substitution by a required setback line, and
  private roads treated alike. Whether the article holds any further
  sentence is recorded either way.
- R.111-17: "à moins que le bâtiment ne jouxte la limite parcellaire", half
  the difference in altitude, **never less than 3 m**.
- R.111-15: "may be imposed" (optional for the authority).
- R.111-1: that R.111-15 to R.111-19 and R.111-28 do not apply where a PLU
  or a document standing in for one exists, and therefore **do** apply
  under a carte communale; and L.111-3's scope (neither PLU nor CC).
- R.111-28: the wording "hauteur moyenne des constructions avoisinantes".
- L.111-4: the exception list shown with L.111-3, so it never reads as a ban.

**If Légifrance is unreachable** (the probe of § 5.1 got a 404 on its
consolidated pages): try the article's `LEGIARTI` URL, then the Code's PDF
export, then the API Légifrance (PISTE) under an account in the owner's name
(owner question 1, answered 2026-10-19 per the site-regulations README §5;
the account is the owner's to create). If none answers, the sprint records
"not verified", **stops**, and asks the owner. The Assemblée nationale answer
(2023) and the Cerema sheet (2022) are not a substitute: the proposal
already used them and named them as such. "Verified" means the text was read
from one of those three Légifrance channels, with its version date.

## DEC-2 — Coded rules

A table in `index.js`, one entry per article, each a `RegulationRule`
(`regulations.ts:251-271`) with `provenance: 'coded'`:

| Rule `id`      | `kind`              | `statement` / `limit`                                                         | `status`                                  | Applies under |
| -------------- | ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- | ------------- |
| `rnu:R.111-15` | `building_distance` | `{ kind: 'value', comparison: 'min', quantity: { value: 3, unit: 'm' } }`     | `to_confirm` (optional for the authority) | RNU, CC       |
| `rnu:R.111-16` | `road_setback`      | `{ kind: 'height_relative', factor: 1 }`                                      | `confirmed` (mandatory, by construction)  | RNU, CC       |
| `rnu:R.111-17` | `boundary_setback`  | `{ kind: 'height_relative', factor: 0.5, minimum: { value: 3, unit: 'm' } }`  | `confirmed`                               | RNU, CC       |
| `rnu:R.111-28` | `height_total`      | `statement: 'described'`, `limit: { kind: 'described', text: { key } }`       | `information`                             | RNU, CC       |
| `rnu:L.111-3`  | `other`             | `statement: 'described'`, `limit: { kind: 'described', text: { key } }`       | `not_evaluable`                           | RNU only      |
| `rnu:other`    | `other`             | `statement: 'described'`, `limit: { kind: 'described', text: { key } }`       | `not_evaluable`                           | RNU, CC       |

- **R.111-18 and R.111-19 are not rules.** They are `exceptions` phrases on
  the rules they relax (R.111-18 on R.111-17; R.111-19 on R.111-15 to
  R.111-17), shown with them, never evaluated. A rule needs a `kind` and a
  `status` (`regulation-source-registry.ts:432-435`), and a malformed
  exception drops its rule whole — so each phrase is checked well-formed by
  a test.
- A rule with no number says so with `statement: 'described'`: an absent
  `statement` means `limit` (`regulations.ts:257-261`).
- L.111-3 carries L.111-4's exceptions as `exceptions`.
- **Citation, with the version date in it** (coordinator's decision,
  2026-10-20, on the owner's behalf — no SDK change). `RegulationRule` has
  no `source` field and `RegulationCitation` no version
  (`regulations.ts:242-248`); the report's `document` is the regime's
  document (the carte communale under `cc`, none under `rnu`, 002.0 DEC-8)
  and cannot hold seven articles' versions. So each rule carries:

  ```js
  citation: {
    document: { text: "Code de l'urbanisme, version en vigueur au <DEC-1 date>", lang: 'fr' },
    article: 'R.111-17',
    passage: { text: '<DEC-1 text, verbatim>', lang: 'fr' },
    href: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI…'
  }
  ```

  The date in `document.text` is DEC-1's version start date, written in
  French as Légifrance writes it; the table also keeps it as an ISO
  constant per article (`versionFrom`), which is what 002.2's coded-rule
  confirmations key to and what criterion 1 tests.

**Carte communale.** The sector (002.0, DEC-8) decides what is shown:

- a constructible sector: the rules above, minus L.111-3;
- a non-constructible sector: a flag "construction restricted in this
  sector" quoting L.161-4 (verified in DEC-1), and the rules still listed
  (they apply to what is allowed there).

## DEC-3 — Naming the Site boundary's edges

Every edge of the Site boundary (083.12, numbered in the current ring,
ADR-0089 Rule 7) gets a role `street`, `side` or `rear`, in `edges[]` as
`{ edge, role, assumptionId }` — `edge` the 1-based **number**, the same as
`DistanceTarget.edge` (`regulations.ts:310-316`):

1. **Roads** (DEC-4) over the boundary's box grown by 30 m. Only `kind`
   `road` and `roundabout` at `level` `ground` or `bridge`; paths, steps and
   tracks do not make a street.
2. **Street.** An edge is `street` when a road centreline lies within
   `widthMetres / 2 + 20 m` of the edge's midpoint (width absent: 3 m
   assumed and said), on the edge's outward side, and the edge's outward
   normal is within 45° of the direction to the road. A corner plot has two.
3. **Rear.** An edge is `rear` when its outward normal is within 45° of the
   opposite of a street edge's, and it touches no street edge.
4. **Side.** Every other edge.
5. **No road found:** every edge `side`, and R.111-16's checks (002.1b)
   `not_checked` with "no road found within 30 m of the Site boundary".
6. **No Site boundary** (`site.boundary` absent): no `edges[]`; every
   R.111-17 check `not_checked` with "no Site boundary drawn" — the
   boundary is authored, never assumed (ADR-0089) — and a `notice` in the
   `edges` view offers nothing but the explanation.

Each derived role names its assumption: "the street side is the Site
boundary edge facing <road name or 'the road'>" (proposal US-04's wording);
"side" and "rear" edges share one assumption, "named from the street edges".

**Under the RNU, side and rear are the same rule** (R.111-17 makes no
distinction). The names matter for PLU rules (002.2) and for the user's
reading; the checks treat every non-street edge alike.

**The user can correct a role** (DEC-5's view and action). The correction
is stored in the section (DEC-8) as `edgeRoles[] { plot, ends, role, at }`:
**keyed by the edge's two end points** in the Site's CRS, rounded to the
centimetre, never by its number (ADR-0089 Rule 7 renumbers edges on every
edit), and by the plot it was made on. A correction applies when its `plot`
is the current plot's and its ends match an edge (either direction); it
then wins over the derived role and its assumption is "set by you". A
correction whose ends no longer match an edge (the boundary was redrawn
there), or made on another plot, is **not applied and never pruned on
read**: it is listed in the `edges` view under "no longer matching an edge"
or "from another plot", with **Forget**.

## DEC-4 — How the extension gets the roads

The host fetches roads for its Roads row "when wanted" (ADR-0110 Rule 4);
that want is the host's state, not an SDK member. The extension **queries
the road service directly** (`context.services.getOptional({ name: 'roads'
})`, ambient), once per Site boundary per session (keyed by the ring's
digest), in the Site's CRS, `limit` 500, and keeps the answer in its
closure. Two consequences, accepted:

- the same BD TOPO request may go out twice in a session (host and
  extension); it is a 0.1–0.3 s WFS call;
- the host's Roads row is not switched on by the reading.

A refusal (`{ refused: 'source-unavailable' | 'too-many-features' | … }`,
told by `!Array.isArray(answer)`) is a source entry in `sources[]` with
`state: 'unavailable'`; every edge is then `side` with the assumption "the
roads could not be read", and R.111-16's checks (002.1b) are `not_checked`
with that reason. An empty list when no road source is registered is "no
road found".

## DEC-5 — The views and the edge-role action

No block kind renders `edges[]` (`regulations.ts:432-447`) and an action's
`target` has no edge member (`:606-617`), so the extension draws the edges
itself:

- **`rules` view** — a `meter` (`rules: true`), then a `rules` block (all
  rules; the host shows conditions, exceptions and the citation with its
  link).
- **`edges` view** ("Site boundary edges") — a `table` with columns edge
  n°, role (a key phrase), length (a quantity in `m`), why (the assumption
  phrase); then one `actions` block holding one action per edge:

  ```js
  { id: 'set-edge-role',
    label: { key: 'fr-urban-rules.edges.setRole', params: { edge: 3 } },
    target: { subjectId: '<e1>,<n1>;<e2>,<n2>' },   // the ends, centimetres
    fields: [{ key: 'role', label: { key: 'fr-urban-rules.edges.role' },
               kind: 'choice', required: true, initial: 'side',
               options: [{ value: 'street', … }, { value: 'side', … }, { value: 'rear', … }] }] }
  ```

  then, when any, a heading and a `table` of the corrections not applied
  (DEC-3) with an `actions` block of `forget-edge-role` actions
  (`subjectId` the entry's ends plus its plot digest). At most 200 actions
  in one list (the host's limit); a boundary of more than 200 edges lists
  the first 200 and says so.
- **`checks` view** — a `checks` block (all checks, grouped by subject),
  then an `assumptions` block.

The action is keyed by the **ends**, never the number: the user may edit
the boundary between the read and the click, and a stale number would set
the wrong edge. `runAction` re-reads the Site (`request.site`), finds the
edge by its ends, and refuses ("This edge has changed; the list is being
updated") when none matches.

**`runAction`** (`regulations.ts:745-756`), for `set-edge-role` and
`forget-edge-role`:

1. `const before = packageData.read()`; build the next section from it
   (DEC-8: unknown members kept, `schema` checked).
2. `packageData.write(next, label, before ?? null)` with `label`
   `i18n.translate('fr-urban-rules.undo.edgeRole')`, at most 80 characters.
3. `true` → `{ status: 'done' }` **without** a report: the write changes
   the host's Site key, so the host reads again (`reason: 'site'`), and the
   read is answered from 002.0's plot cache plus the section and the
   measures, with no request.
4. `false` (the section changed since — an undo) → `{ status: 'refused',
   message: { key: 'fr-urban-rules.edges.stale' } }`, nothing written.
5. A throw (over a limit, `document` not declared) → caught, `refused` with
   the host's message.

The extension never writes from a read or a timer.

## DEC-6 — The R.111-17 checks, through 096.0b's measures

The extension evaluates checks for each building of the **open Document**
and puts them in `checks[]`, each `{ id, ruleId: 'rnu:R.111-17', subject:
{ kind: 'boundary-edge', id: String(edge), label }, measured, limit, result,
assumptionIds, figure }` (`regulations.ts:274-293`) — one per building and
non-street edge, the building named in the label and the check id
(`r111-17:<buildingId>:<edge>`). *(Revised by 002.4, 2026-10-20: the
per-edge checks are folded into one per building, the worst edge governing
and the others listed — see the Outcome's « Revision by Sprint 002.4 ».)* A report's checks are the open Document's
only; parked variations are checked through 096.11's
`RegulationSource.checkVariation` (not yet in the SDK), which 002.8
implements on this same evaluation (its `evaluateChecks`), never in
`checks[]`.

**Which buildings.** The main building's id is learned from an answer
(`measures.projection().buildingId`, `'building-main'`); named buildings
are the open Document's `Building` entities (`document.find('Building')`,
`site.ts:503-505`). An existing building is not an entity and is not
checked (it is not the project).

**The measure.** One call per building:

```js
measures.distances({ buildingId, outline: 'withRoofOverhangs',
  targets: nonStreetEdges.map((edge) => ({ kind: 'boundary-edge', edge })),
  ratios: [0.5], byFacade: true })
```

- **`withRoofOverhangs`**: projections count (CE 1969, *SCI Les
  Thamaries*). It is `{ refused }` when a roof cannot be resolved; the
  check then falls back to `storeys` with the assumption "roof overhangs
  could not be read and are not counted".
- **The rule** needs, for every point P of the building and its nearest
  point Q on the edge, `d(P, Q) ≥ 0.5 × (z(P) − z(Q))` and `d ≥ 3 m`. The
  governing point is neither the nearest nor the highest: 096.0b's `worst`
  pair (criterion 4 there) is the point minimising `d − 0.5·Δz`. The check
  is `worst.margin ≥ 0` **and** `nearest.distance ≥ 3`.
- **`measured`** is the worst pair's `distance`; **`limit`** is
  `max(3, 0.5 × worst.rise)` in `m` — the distance that pair needed — and
  when the 3 m minimum governs instead, `measured` is `nearest.distance`
  and `limit` 3 m. The `figure.dimension` is the governing pair (P, Q).
- **Balconies** are not modelled (`notModelled`): every check carries the
  assumption "balconies are not modelled and not measured".
- **The Site boundary for the parcel limit**: every check carries that
  assumption (Design Contract).

**"Jouxte la limite"**, from the host's samples, not a geometry of ours:
the façade runs' `targets[i].samples` (`{ s, distance }` every 0.25 m,
`site.ts:363-373`) for that edge. Five or more consecutive samples at
≤ 0.05 m — at least 1 m along the edge — make the building **adjoin** that
edge: R.111-17 does not apply there, and the check is `no_issue` with
"adjoins the Site boundary (within 0.05 m over at least 1 m)", whatever
its near-zero worst pair says. The tolerance is said in the check.

**Re-evaluation is the host's.** The host reads again 400 ms after a design
change (`reason: 'design'`) and on a Site change (`reason: 'site'`, which
includes a write of the section); the extension answers from 002.0's plot
cache and recomputes the checks from fresh measures (synchronous). No
`events` capability is needed (`DocumentChanged` is never emitted, 096.1).

## DEC-7 — Altitudes and why a check is not run

`z(P)` and `z(Q)` come from 096.0b: the Site terrain at Q, and the top of the
building's solids over P. The extension does not read the terrain itself.

- **A rise the host cannot give** — the `worst` entry is `{ ratio, rise: {
  unavailable } }` with `no-terrain`, `outside-terrain`, `unmeasured`,
  `other-system`, `no-datum` (only where no terrain can derive a datum) or
  `no-solids` (`site.ts:301-321`) — makes the check **`not_checked`**, with
  that reason in words (« terrain du site non renseigné » for `no-terrain`).
  Any target point without terrain makes the whole ratio unavailable
  (096.0b, all or nothing).
- **A target the host cannot measure** (`{ target, unavailable: 'no-rooms' |
  'no-outline' | 'outline-refused' }`) or a whole answer `{ available: false,
  reason }` (`not-located`, `no-boundary`, `unknown-building`, …):
  `not_checked` with that reason.
- **Terrain, no project datum.** 096.0b measures on the datum the 3D view
  draws from and marks the figures `datumDerived: true` (096.0b review B1,
  ADR-0113 Rule 8). The check **runs**, and carries the assumption
  **`datum-derived`**, defined here once for the extension, in the report's
  `assumptions[]`: « Rez-de-chaussée supposé au niveau du terrain à
  l'origine du projet — renseignez le niveau de référence du projet pour
  confirmer ». The host shows the assumption beside the result (096.3a).
- `BuildingHeight.top` and the `*AboveGround` figures are optional; they are
  absent in the `lowest-ground` frame, with `relativeUnavailable`. Where a
  check would read them it is `not_checked` with that reason.

## DEC-8 — The package's Site section: one schema

The section (096.4, ADR-0112) is **one versioned object per project**,
shared by every variation, never cleared by the host — not on a new plot, a
relocation or a change of country (ADR-0112 Rule 9). This sprint is its
first writer; 002.2 DEC-3 adds `confirmations` and `entered` to the **same**
`schema: 1`:

```json
{
  "schema": 1,
  "edgeRoles": [
    { "plot": ["55083000AB0280"], "ends": [[791234.12, 6912345.67], [791250.40, 6912360.02]],
      "role": "street", "at": "2026-10-20T10:42:00Z" }
  ]
}
```

- **`plot`** holds the sorted parcel ids (`SiteParcelView.featureId`, the
  `idu`) the entry was made on. Entries of another plot are not applied and
  are listed "from another plot" with Forget (DEC-3, DEC-5).
- **Every write keeps what it does not own**: the next section is the read
  one with only `edgeRoles` changed; members of a later sprint
  (`confirmations`, `entered`, 002.3's room and building ticks keyed by
  `variationId`) pass through untouched.
- **Nothing is pruned on read**, and no write removes an entry the user did
  not Forget.
- A section with an unknown `schema` is shown "saved by a newer version of
  this extension", read-only, never rewritten; no action is offered.
- **Limits** (`site-package-data.ts`): 262,144 characters serialized, depth
  32; `write` throws past one, and returns `false` only when `expected` is
  stale.

---

# Steps

1. **Légifrance** (DEC-1). Stop here if unreadable.
2. **The coded-rule table** (DEC-2), with the texts and version dates from
   step 1, and the CC sector behaviour.
3. **Roads and edges** (DEC-3, DEC-4).
4. **The section and the action** (DEC-8, DEC-5): the pure builders
   (section + action → next section), `runAction`, the `edges` view;
   `document` added to the manifest's capabilities.
5. **The R.111-17 checks** (DEC-6, DEC-7) against 096.0b's `worst` pair and
   façade samples, through `measures.distances`; the `rules` and `checks`
   views.
6. **Fixtures:** Brouennes AB0280 and a Mouzay parcel in sector C (chosen in
   step 1 of 002.4, written down there): roads, recorded as answers of the
   SDK services (normalised `RoadSegment[]`, not raw WFS), and measures
   answers recorded from the platform (`measures.distances` on a drawn
   building).
7. **Tests**, then the walk on Brouennes in the editor.

# Acceptance criteria

1. The sprint's outcome quotes each article of DEC-1 with its `LEGIARTI`
   id, version date and read date; each coded rule's `citation.href` is
   that `LEGIARTI` URL, its `citation.document.text` names that version
   date, and its `versionFrom` constant equals it (review + test reading
   the table).
2. On an `rnu` report the rules are exactly `rnu:R.111-15` (to confirm),
   `rnu:R.111-16` and `rnu:R.111-17` (confirmed), `rnu:R.111-28`
   (information, `described`), `rnu:L.111-3` and `rnu:other` (not
   evaluable, `described`); R.111-18/19 appear only as `exceptions`; on a
   `cc` report with a constructible sector, the same minus L.111-3; every
   rule passes a mirror of the host's rule check (test).
3. A rectangular boundary with a road along its south edge names south
   `street`, north `rear`, east and west `side`; a corner plot gets two
   street edges; no road gives four `side` edges; a road refusal gives four
   `side` edges and an `unavailable` source; no boundary gives no edges and
   R.111-17 `not_checked` "no Site boundary drawn" (tests with a stubbed
   `queryRoads`).
4. `set-edge-role` writes one section through a stubbed package-data
   service with `expected` the section read, keeps every member it does not
   own, and the role wins over the derived one; it is stored by the edge's
   end points and plot, survives an edit that renumbers the edges, is listed
   "no longer matching an edge" when its ends no longer match, "from
   another plot" on another plot, and is never removed but by Forget;
   `write` answering `false` gives `refused`; a throw gives `refused`
   (test).
5. The `edges` view holds the table and one `set-edge-role` action per edge
   with a three-option `choice`; the `rules` and `checks` views are present;
   view ids match `[a-z0-9-]{1,64}` (test).
6. **The per-point case:** a 10 × 8 m building 4 m from a side edge, eaves
   6.00 m, ridge 8.40 m at 4 m further in, flat terrain: R.111-17 is
   `no_issue` (eaves 4 ≥ max(3, 3.0); ridge 8 ≥ 4.2), from 096.0b's `worst`
   pair (the eaves, margin 1.00; 096.0b criterion 4) (test on the
   extension's evaluation, measures stubbed with the platform's recorded
   answer).
7. A building whose façade samples to an edge are ≤ 0.05 m over five
   consecutive samples "adjoins the Site boundary" on that edge and is
   `no_issue` there; four samples do not (test).
8. Each of `no-terrain`, `outside-terrain`, `unmeasured`, `other-system`,
   `no-datum`, `no-solids`, a target's `unavailable` and an answer's
   `available: false` gives `not_checked` with its reason; a
   `datumDerived` pair runs the check with the `datum-derived` assumption;
   a refused `withRoofOverhangs` falls back to `storeys` with its assumption
   (test).
9. No string in `index.js` or the locales says "property" (in either
   language: "propriété", "limite de propriété") for the Site boundary
   (test scanning the source and the locale files).
10. In the editor, Brouennes AB0280 with a drawn building shows the R.111-17
    checks updating within a second of moving a wall, and an edge-role
    correction that one Undo reverts (manual).

# Testing strategy

- **Unit:** the coded table (mirrored host rule check), the edge naming on
  synthetic boundaries, the section builders (pure), `runAction` with a
  stubbed package-data service, the evaluation of `height_relative` with
  stubbed measures (096.0b's `worst` pair and façade samples).
- **Fixtures** of SDK answers, not of WFS (the extension only ever sees the
  SDK's normalised shapes); measures answers recorded from the platform.
- **No live call.** Légifrance is read by a person in step 1, not by a test.

# Risks

- **Légifrance unreachable** blocks the sprint (DEC-1). That is the point.
- **Edge naming on irregular plots** (flag lots, triangles, a plot reached
  by a private lane): the heuristic will be wrong sometimes; the correction
  (DEC-3, DEC-5) is the answer, and the assumption is always shown.
- **A refused roof** removes overhangs from the measure; said by the
  fallback's assumption (DEC-6).
- **Private roads.** BD TOPO does not say public or private reliably;
  R.111-16 treats them alike, so the extension does not need to.

# Questions for the owner

> **Answered 2026-10-19:** the owner accepted the recommendation given for
> each question below (site-regulations README §5). Where a question had no
> recommendation, the README records the decision.

1. If Légifrance is not readable by a person here, may the API Légifrance
   (PISTE) be used with an account in the owner's name? — DEC-1 takes it as
   the third channel, under the owner's account.

# Definition of Done

Step 1's record in the outcome; the criteria walked against the code; the
Design Contract boxes checked; `node --test fr-urban-rules/tests/*.test.mjs` green;
the walk on Brouennes recorded.

---

# Dependencies on platform sprints

| Sprint     | What this sprint needs |
| ---------- | ---------------------- |
| **083.12** | The Site boundary on the Site view, edges numbered from its first vertex (ADR-0089 Rule 7); not stable across edits, so DEC-3 keys corrections by end points |
| **096.0b** | Distance to a boundary edge with the altitude difference; **the per-point minimum of `d − k·Δz`** with its realising points (DEC-4 there, criterion 4 for this sprint's case); façade samples for the adjoining test; `datumDerived`. **Not provided:** balconies (`notModelled`) |
| **096.1**  | Those measures on the SDK (`measures.distances`), synchronous |
| **096.2**  | `edges[] { edge, role, assumptionId? }`, `height_relative` with `factor` and `minimum`, `statement: 'described'`, `exceptions` on a rule, `information` status, `figure` on a check |
| **096.3a–b** | Views and blocks (`table`, `actions`, `rules`, `checks`, `meter`); an action with a three-option `choice` field and `target.subjectId`; `runAction` (096.3b DEC-3) |
| **096.4**  | The package's Site section, written by one Request with one undo step, `expected` for staleness; the section in the host's Site key, so a write, an undo and a redo re-read the report; SDK 1.27, `document` capability |
| **096.5**  | A check's `figure` (P–Q) with its dimension on selection (not needed for acceptance) |

# Corrections to the proposal (for 002.1a–b)

1. **§ 5.1 R.111-16 "approximated by the Site boundary of the parcels
   across the road"**: the Site boundary is this project's own authored line
   (ADR-0089); the parcels across the road have only **cadastral** outlines,
   read from the parcel source (002.1b DEC-1). "The cadastral outline of the
   parcels across the road".
2. **§ 5.1 R.111-17 "Site boundary edges the extension names as side and
   rear"**: under the RNU side and rear are one rule; naming matters for PLU
   rules and for reading. The table reads as if R.111-17 needed the
   distinction.
3. **§ 5.1 "measured"** for R.111-16/17 hides a geometric requirement: the
   check is a per-point minimum of `d − k·Δz`, not min distance against max
   height (DEC-6). The platform README's "distance … with the altitude
   difference between the two points" should say which points.
4. **§ 5.1 L.111-3** needs L.111-4's exception list (adaptation of existing
   buildings, collective equipment, agriculture…); `not_evaluable` holds,
   but the text shown must not read as a ban. Verified in step 1.
5. **US-04's assumption wording** "the street side is the Site boundary edge
   facing the road" is right; Screen 4's "The street alignment is taken as
   the parcel boundary facing Rue de la République" is the old wording
   (parcel boundary) and contradicts D7.
6. **R.111-28 "the session's context buildings"** (§ 5.1): the extension
   cannot read the host's context buildings session (that is the host's
   store); it queries the building source itself (002.1b DEC-4). Same data,
   its own request.
7. **§ 5.1's verification state** ("records the version date in each coded
   rule"): the SDK has no version field on a rule; the date is in the
   citation's document text and the `LEGIARTI` link (DEC-2).

# History (carried from 002.1)

- **Reconciliation (2026-10-19):** contract and SDK numbers named; regime
  codes `rnu` / `cc`; edge corrections keyed by end points; derived roles
  carry an `assumptionId`; 096.0b's `worst` pair is the measure, the
  conservative fallback removed; balconies `notModelled`; re-evaluation is
  the host's re-read plus 096.4's `onDidChange`, no `events`.
- **Reconciliation (2026-10-19, phases 2–4):** per-variation checks dropped
  from `checks[]` — a report's checks are the open Document's; other
  variations answer 096.11's `checkVariation`, implemented by 002.8.
- **Reconciliation (2026-10-20, 096.0b's review):** no terrain is
  `not_checked`, not "flat at 0 m"; a `datumDerived` figure runs the check
  with the `datum-derived` assumption.
- **Reconciliation (2026-10-20, 096.2 as implemented):** final limit shapes
  (`comparison`, `RegulationQuantity`), `RegulationCitation` phrases,
  `edges[] { edge: number }`, the host's drops.
- **Review (2026-10-19):** 096.3 split into 096.3a / 096.3b; the edge-role
  choice is 096.3b DEC-3 (it read "DEC-13").

# Review (2026-10-20)

An adversarial review against the **implemented** SDK 1.27 and the 096.x
Outcomes. Decisions are the coordinator's, on the owner's behalf.

- **Split.** 002.1 was too large for one sprint. This half keeps the law,
  the coded table, the edges and their correction, and the R.111-17 checks;
  [002.1b](sprint-002.1b-alignment-and-neighbours.md) takes R.111-16's
  opposite alignment and check, R.111-15's check, R.111-28 and the bands;
  the RNU envelope outline goes to 002.7. 002.1 is deleted; references
  across both repositories name the half they mean.
- **Blocking — version date.** No `source` on a rule; the Code's version
  is not the report's `document`. Decision: the date in each rule's
  `citation.document` text, with the `LEGIARTI` href; no SDK change
  (DEC-2, criterion 1, correction 7).
- **Blocking — edge rows and the action.** No block renders `edges[]` and
  no target names an edge. New DEC-5: an `edges` view with a table and one
  `set-edge-role` action per edge keyed by its ends in `subjectId`;
  `runAction` implemented; "096.3b DEC-13" corrected to DEC-3.
- **The write** (DEC-5, DEC-8): `write(data, label?, expected?)` — `false`
  only when stale, a throw on an invalid write, a limit or no `document`;
  the label translated, ≤ 80 characters; `done` without a report, since the
  write changes the host's Site key and the re-read (`site`) is answered
  from 002.0's plot cache.
- **One section schema** (DEC-8) shared with 002.2: `schema: 1`, entries
  carry `plot`, foreign ones grouped "from another plot" with Forget,
  unknown members kept, nothing pruned on read.
- **Rules:** R.111-18/19 are exceptions only (a rule without `kind` /
  `status` is dropped); rules with no number are `statement: 'described'`.
- **Checks:** the SDK's shape (`ruleId`, `subject`, `measured`, `limit`
  defined, `assumptionIds`, `figure`); `withRoofOverhangs` named, with the
  `storeys` fallback; "jouxte" from the host's façade samples; how buildings
  are enumerated; the no-boundary case; the full list of `not_checked`
  reasons (`no-datum`, `no-solids`, target and answer refusals).
- DEC-1 also verifies L.111-4 and L.161-4; owner question 1's decision is
  recorded in place.
- `queryRoads` asks every registered road source; a refusal is told by
  `Array.isArray`.
