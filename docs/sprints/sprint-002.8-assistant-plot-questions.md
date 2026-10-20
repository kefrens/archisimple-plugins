# Sprint 002.8 — Assistant Plot Questions

> **Status:** **Draft (2026-10-19)** — nothing implemented.
>
> **Version:** 1.0
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules` →
> **1.3.0** (after 002.7's 1.2.0; 002.4 closed Phase 1 at 1.0.0, and 002.5a–b
> version the service, not the package; the Phase 2 review restated 002.6a–b as 0.5.0 / 0.6.0, so this number awaits restatement).
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> US-07 (ask questions about the plot), US-08 (compare variations), §9
> (Preferences → Plugins: "The package card lists the hosts it contacts and
> the surfaces it adds"), §11.2 (data leaving the browser; regulation text
> as quoted data). Platform milestone README §3, "Phases 2–4", row 002.8:
> "FR tools for the assistant ('can I add a storey?'), per-variation checks
> for 096.11, and the package card's network list". Mockups: screen 6 (the
> assistant), screen 3 ("Across variations"), screen 8 (the package card).
>
> **Prerequisites:** 002.1a (the checks pipeline, edge roles, `document`),
> 002.2 (confirmations, the section, the Confirm action's section change),
> 002.3 (surfaces, capacity, procedure flags, the `programme` enricher, `ai`).
> Platform: **096.11** (SDK 1.31, `RegulationSource.checkVariation`),
> **096.12** (SDK 1.32, `RegulationSource.questions`, answers and offers),
> 096.0a–096.4 as before. 002.5a–002.7 are not needed by this sprint's code;
> its questions read written rules once 002.6b confirms them, with no change
> here.
>
> **Sizes:** four questions, one shared headroom function, `checkVariation`
> on the existing checks pipeline, a manifest field and its test. The
> manifest's `sdkVersion` moves to **"1.32"** (096.12's, from 002.7's
> 1.30). No new capability. Medium.

---

# Sprint Design Contract

- [ ] **The assistant never reads a number out of the regulation.** Every
      limit in an answer is a rule of the report (coded, drawn, written once
      confirmed, or entered); every measured figure is a host measure. No
      answer reads a passage, a PDF or a source response to find a number
      (US-07).
- [ ] **Every claim on a rule names the rule.** `basis: 'rule'` with its
      `ruleId`, so the host cites it from the report (096.12 DEC-2); nothing
      here writes a citation into a claim.
- [ ] **Beyond the text is labelled.** Any sentence that is not the rule's
      content or a measure is an `interpretation` phrase from a closed,
      reviewed list (DEC-6), never composed from parts.
- [ ] **No verdict says compliant.** The strongest answer is "no issue among
      the rules checked" (proposal §5.3); a capacity is "an estimate, not a
      right to build" (002.3).
- [ ] **One computation, three readers.** The `programme` enricher (002.3
      DEC-7), the `can_add_storey` question and the Surfaces view use one
      headroom function; a test holds them equal.
- [ ] **A parked variation is checked by the read's own pipeline.**
      `checkVariation` and the report's checks call one function; a test
      holds them equal on the open variation.
- [ ] **An offer is a decision the user could have made by hand.** It is the
      exact section change 002.2's Confirm action makes; nothing an action
      cannot do is offered.
- [ ] **The card tells the truth.** Every host the code contacts is in the
      manifest's network list and nothing else is (a test scans the source).

---

# Current state

- **The package** (002.0 DEC-1) is one file, `src/index.js`, plain ESM
  evaluated from a `data:` URL (repository `CLAUDE.md`, "The one constraint"):
  no relative imports, so every shared function lives in that file.
  Manifest after 002.7: `sdkVersion: "1.30"` (1.27 through Phase 1, 1.28 at
  002.6a–b), `capabilities: ["regulations", "document", "ai"]`.
- **Checks** (002.1a DEC-6, 002.2 DEC-7) are computed for the open Document
  from 096.1's measures; 002.1a DEC-6 also says "and for each variation when
  096.1 gives the measures for it, and puts them in `checks[]`" — corrected
  by 096.11 (a report's checks are the open Document's; other variations
  answer `checkVariation`).
- **Confirmations** (002.2 DEC-3, DEC-5): one section, `confirmations[]`
  keyed by `ruleKey`, `idurba`, `datvalid`; the **Confirm** action builds
  the next section and sends one `SitePackageDataService.write`.
- **Surfaces and capacity** (002.3 DEC-1–DEC-6): emprise au sol under a
  named definition, budget (used / allowed / remaining), surface de plancher
  with deductions, the theoretical capacity as a range labelled estimate,
  procedure flags with their verification state.
- **The programme warning** (002.3 DEC-7): a `programme` planning-stage
  enricher, `fr-urban-rules.programme`, reading the extension's own current
  report, comparing `programme.totalArea` with the capacity's upper bound
  and `programme.storeys` with "the confirmed height's storeys";
  synchronous, under 50 ms. "Assistant tools come with 096.12."
- **What the platform gives** (as drafted):
  - 096.12: `RegulationSource.questions`, each `answer(input)` synchronous
    within **250 ms** on frozen `{ args, report, site, variationId,
    sectionData }`; answers of claims (`basis: 'measured' | 'rule' |
    'report'`), up to three `interpretation` phrases, and one optional
    `offer` (the package's next section). The host cites, formats, escapes
    and proposes; the model receives a summary of the report and never its
    passages.
  - 096.11: `checkVariation({ site, country, variationId, report }, {
    signal })` → `{ checks }`, called for parked variations only, cached by
    the host; figures counted by the host.
  - 096.0a–c / 096.1: `site.measures.projection` (with `height.top`, `eaves`,
    `topAboveGround`), `distances` (the `worst` pair minimising `d − k·Δz`),
    `floorAreas`, `plotCoverage`, each with `variationId`.
- **The package card** (`archisimple/apps/web/src/workbench/preferencesEntries.tsx:1036`,
  `PluginRow`) shows name, version, kind, state, diagnostics and actions. The
  manifest (`archisimple/packages/package-manager/src/package-manifest.ts:131-178`)
  has **no network field**; its parser reads the fields it knows and refuses
  no other key (to be confirmed in step 1), so a new key is ignored by an
  older host. The mockup (screen 8) shows "Sends your parcel's location to:
  apicarto.ign.fr · geoportail-urbanisme.gouv.fr · data.geopf.fr ·
  georisques.gouv.fr" and "Adds: Site → Règles d'urbanisme (PLU) · Plan
  layers · Assistant tools · Print sheet".
- **Hosts the browser code contacts** (002.0 step 3's README):
  `apicarto.ign.fr`, `www.geoportail-urbanisme.gouv.fr`,
  `georisques.gouv.fr`. `data.geopf.fr` is the **companion service's**
  (002.5a, proposal §11.2), not the browser's.

---

# Goal

In a located French project, a user asks the assistant "can I add a
storey?", "how far am I from the road?", "what is the maximum height?" or
"how much more can I build?", and gets an answer computed from the same
rules the panels show and the editor's measures, each claim on a rule cited,
anything beyond the text labelled *Interpretation*, and — where a rule the
answer depends on is still to confirm — a proposal to confirm it; every
variation, parked or not, is checked for the variation figures; and the
package card says which hosts the package contacts.

# Out of scope

- The platform's seams (096.11, 096.12, 096.13's card).
- Questions about written rules not yet confirmed (they are `to_confirm` and
  answered as such, never read from their passage).
- A "show on plan" button in an answer (096.12 Question 4).
- Hypothetical geometry: no question builds a candidate storey in a model;
  "with one more storey" is arithmetic on measures, labelled estimate.
- The companion service's own network policy (002.5a).
- English or other-language interpretations beyond the two shipped locales.

---

# Decisions

## DEC-1 — Four questions

| Id | Asked as | Parameters | Answers from |
| --- | --- | --- | --- |
| `can_add_storey` | "Can I add a storey?" | `storeyHeight?` (number, m, 2–6), `building?` (text, a building's name) | DEC-2 headroom; emprise; surface de plancher and the procedure flags |
| `road_distance` | "How far is the building from the road?" | `building?` | the report's street edges and alignment; `distances` to them; the road-setback checks |
| `max_height` | "What is the maximum height here?" | `building?` | every height limit of the report, the tightest stated with its rule; the relative limits at the building's position |
| `remaining_area` | "How much more can I build?" | — | the Surfaces view's figures (002.3): emprise remaining, surface de plancher, capacity estimate |

- **Descriptions** are written for the model, in English, ≤ 500 characters,
  and say what the question does **not** answer ("does not decide whether a
  permit will be granted").
- **`building`** is matched on the open Document's building names; absent, a
  project with one building uses it, and a project with several answers per
  building (≤ 4, then "and n more").
- **No `variation` parameter.** A question answers the open variation (the
  input's `variationId`); "what about Recul 4 m?" is answered by switching,
  or by the variation figures (096.11).

## DEC-2 — Headroom: one function, three readers

`heightHeadroom(report, measuresOfBuilding, storeyHeight)` in `src/index.js`:

- **Current height**: `projection.height.topAboveGround` and
  `eavesAboveGround`, from the lowest or the highest ground at the foot as
  each rule's measuring point says (002.2 records it on the rule; R.111-16
  and R.111-17 measure from the ground at the point, so they use the
  `worst` pair instead).
- **Absolute limits** (`height_total`, `height_facade`, drawn `Hauteur Max-n`):
  `limit − current`, per rule, with the rule's status.
- **Relative limits** (`height_relative`, R.111-16 factor 1, R.111-17 factor
  0.5 minimum 3 m, and a PLU's own): from the `worst` pair's margin `m = d −
  k·Δz`, the headroom is `m / k`. Adding `h` at the top reduces the margin
  by `k·h` at most, so `h ≤ m / k` is **conservative** and is said as an
  estimate ("the top is raised by h everywhere").
- **The answer**: the tightest headroom among **confirmed** rules, and
  separately the tightest among rules **to confirm**, each with its rule id.
- **Readers**: `can_add_storey` (compares with `storeyHeight`), `max_height`
  (states `current + headroom`), and the `programme` enricher (002.3 DEC-7:
  "the confirmed height's storeys" becomes `floor(headroom / storeyHeight) +
  current storeys`). **The storey count moves here**: 002.3 DEC-7 computes
  it from the absolute height limits only; this sprint moves the enricher
  onto `heightHeadroom`, which also covers the relative limits (002.3 DEC-7
  points here since the reconciliation). A test runs the three on every
  fixture and asserts they agree.

**Storey height**: the `storeyHeight` argument; absent, the open Document's
top storey's height, read through `DocumentReader` (ambient) if storeys are
readable as entities — **step 1 checks** what `find(...)` returns for a
storey; if they are not, the question answers `cannot-answer` with "Say the
floor-to-floor height, for example 'can I add a 3 m storey?'".

## DEC-3 — What each answer says

**`can_add_storey`** (the mockup's screen 6):

- summary: one of three keyed sentences — *Height leaves room* / *Height
  leaves room, but {rule} may not* / *A storey of {h} exceeds {rule}*;
- claims:
  - measured: the current height, and the height with one more storey
    (`basis: 'measured'`, values `current`, `next`);
  - per height rule in play: its limit and the margin (`basis: 'rule'`,
    `ruleId`); the host adds *(rule to confirm)* where it applies;
  - emprise unchanged (`basis: 'report'`), the existing potential issues
    that stay "whatever the height" (`basis: 'rule'`, from the checks);
  - surface de plancher after the storey: current + the top storey's floor
    area (`floorAreas`, `basis: 'measured'`), against the architect and
    procedure thresholds **only as 002.3 DEC-6 states them**, verification
    state included (`basis: 'report'`, flag);
- interpretation (DEC-6): the attic note when a `height_facade` rule is in
  play;
- offer: DEC-5.

**`road_distance`**: per street edge (002.1a DEC-3's roles) and per alignment
(`official: false`), the measured horizontal distance (`distances`,
`worst` and nearest), the road-setback rule and its check's result; the
edge-role assumption as a claim (`basis: 'report'`). No street edge →
`cannot-answer`, "No Site boundary edge is named as the street; set it under
Site → Règles d'urbanisme (PLU) → Rules".

**`max_height`**: every height limit, tightest first, each `basis: 'rule'`;
the relative limits as heights at the building's governing point; the
current height. Rules not evaluable (a written height not yet extracted,
`not_evaluable`) are listed as not checked. Never "you may build to".

**`remaining_area`**: emprise used / allowed / remaining under its named
definition (002.3 DEC-1–DEC-2), surface de plancher with deductions and its
completeness, the capacity range **labelled estimate**, "not regulated"
where it is. The same keys as the Surfaces view.

## DEC-4 — Strings

- Summaries and claims are phrases in the package's namespace
  (`fr-urban-rules.question.<id>.*`), both locales, with numbers as
  `values` (quantities) so the host formats them in the project's units.
- Rule labels are the report's own phrases, reused by key.
- No passage, condition or exception text is put in a claim. A zone name
  or a prescription's label (`{ text }`) may be, and the host quotes it.

## DEC-5 — The offer: confirm what the answer depends on

- When the tightest limit in an answer is a rule **to confirm** with a value
  (a drawn height, an extracted written rule), the answer offers **Confirm
  {value}**: `data` is exactly the section 002.2 DEC-5's Confirm action
  builds (`nextSectionConfirm(section, rule)`, the one function both call),
  from the input's `sectionData`.
- One offer per answer, for the governing rule only; no offer for "Does not
  apply" or "Edit value" (those need the user's judgement, which the Rules
  view asks for in place).
- Approval goes through the host (096.12 DEC-7): one undo entry, the report
  re-read, the confirmation keyed to the current `idurba` / `datvalid`
  (002.2 DEC-4). A stale section is refused by the host.

## DEC-6 — Interpretations: a closed list

Each is a phrase key with a fixed text, reviewed with the owner before it
ships, offered only on its condition:

| Key | Condition | Text (fr) |
| --- | --- | --- |
| `interp.attic` | a `height_facade` rule is in play | "Un étage en attique, en retrait de la façade, échappe souvent à une limite de hauteur de façade. Le règlement ne le dit pas ici : à vérifier auprès de la mairie." |
| `interp.relativeEstimate` | a relative limit governs | "La marge est estimée en relevant tout le bâtiment de la même hauteur ; un étage en retrait laisse davantage de marge." |
| `interp.notADecision` | always, last | "Ces chiffres aident à concevoir ; ils ne préjugent pas de la décision de l'autorité compétente." |

The English texts say the same. No interpretation is assembled from a
template with a rule's words in it.

## DEC-7 — `checkVariation`: the read's own checks

- The read's checks step (002.1a DEC-6, 002.2 DEC-7) becomes
  `evaluateChecks(report, measures)` where `measures` is
  `site.measures` bound to a `variationId` (or none for the open one).
- `checkVariation({ site, report, variationId }, { signal })` calls it with
  the parked variation's id and returns `{ checks }`. It reads no network:
  the rules, edges and alignment are the report's; neighbours (R.111-28)
  are `information` and not counted (096.11 Risks).
- Between buildings it checks `signal.aborted` and stops.
- **The report's `checks` stay the open Document's** (096.11's correction to
  002.1a DEC-6).
- Test: on every fixture, `evaluateChecks(report, measures-of-open)` equals
  the report's checks, and `checkVariation` with a second fixture variation
  answers that variation's measures (096.14 criterion 10: Brouennes 1 / 0).

## DEC-8 — The programme warning and the questions

- **Same numbers**: the enricher and `can_add_storey` call DEC-2's function;
  the capacity in `remaining_area`, the Surfaces view and the enricher is
  002.3 DEC-5's one function.
- **Same report, nearly**: the enricher reads the extension's own last
  report (it receives no report from the host); questions receive the host's
  sanitised copy. They differ only if the host dropped an item; 002.9 checks
  that the host reports `dropped: 0` on every reference plot.
- **Different moments, no duplicate**: the enricher runs when the planning
  pipeline builds a Space Programme (the Architectural Assistant, or a
  model calling the planning tools); questions run when a model calls them.
  A question never edits an artefact or adds a warning to one (ADR-0027.1
  Rule 13: only optimisation revises an artefact), so a programme proposal
  pending in the dock is not changed by a question asked after it.
- **One vocabulary**: the enricher's warnings and the answers use the same
  limit keys (`fr-urban-rules.limit.*`) and cite the same rule ids.

## DEC-9 — The network list

The manifest gains:

```json
"network": {
  "hosts": ["apicarto.ign.fr", "www.geoportail-urbanisme.gouv.fr", "georisques.gouv.fr"]
}
```

- **The field is 096.13's** (its DEC-8, which owns the manifest field and
  the card); this sprint fills it. The card's sentence ("Contacts: …") is the
  host's own key; 096.13 reads only `hosts`, so no package wording is sent
  (the draft's `purposeKey` is dropped).
- **Only what the browser contacts.** The companion service's hosts
  (`data.geopf.fr`, and `www.geoportail-urbanisme.gouv.fr` for the PDF) are
  the service's (002.5a); the card names the service as "this deployment's
  service" when 096.8a's locator finds it (096.13 DEC-7), not as a host here.
- **The test** (`tests/package.test.mjs`): every `https://<host>` literal in
  `src/index.js` is in `network.hosts`, and every listed host appears in the
  source. A host added to the code without the card fails.
- **Rendering is the platform's** (Dependencies): an older host ignores the
  key; the card shows it once 096.13 reads it.
- The README's "hosts contacted" line is generated from the same list in the
  same commit (no second list to drift).

## DEC-10 — The manifest

| Field | Before | After | Why |
| --- | --- | --- | --- |
| `sdkVersion` | `"1.30"` (002.7's) | **`"1.32"`** (096.12's) | `questions` (096.12, 1.32) and `checkVariation` (096.11, 1.31) are read by those minors; declaring the later one refuses the package on any build lacking either, with a reason |
| `capabilities` | `regulations`, `document`, `ai` | unchanged | questions need `ai` and `regulations`, offers `document` (096.12 DEC-12) |
| `network` | — | DEC-9 | the card |
| `version` | 1.2.0 (002.7's) | **1.3.0** | new behaviour |

**Lockstep.** The web image must carry 096.11 and 096.12 before the plugins
image ships this version; an older image refuses the manifest whole.

---

# Steps

1. **Read first**: the landed 096.11 and 096.12 (names, budget, shapes);
   whether a storey is readable through `DocumentReader`; whether the
   manifest parser keeps or refuses an unknown key. Correct this draft.
2. **Refactor**: `evaluateChecks(report, measures)`; `nextSectionConfirm`
   shared with 002.2's action; `heightHeadroom`; the enricher moved onto it.
3. **`checkVariation`** and its test.
4. **The four questions**, their descriptions, parameters and phrases; the
   interpretation list reviewed with the owner.
5. **Offers** on `can_add_storey` and `max_height`.
6. **Manifest**: `sdkVersion`, `network`, `version`; the network test; the
   README and CHANGELOG (the questions, the card, the SDK bump).
7. **Tests** against the recorded fixtures (002.4's plots), timed against
   the 250 ms budget.
8. **Joint run** with the platform's stub tests green; 002.9 walks it live.

# Acceptance criteria

1. The manifest declares `sdkVersion` `"1.32"`, the three capabilities and
   `network.hosts` with exactly the hosts `src/index.js` contacts (network
   test; `archisimple package validate` passes).
2. The source registers four questions with ids, descriptions ≤ 500
   characters and parameters as DEC-1 (package test).
3. On every fixture, each question returns within 250 ms (measured over 20
   runs on the slowest fixture, the median under 100 ms), never returns a
   promise, and never mutates its input (frozen-input test).
4. Every claim with a limit names a `ruleId` present in the report and has
   `basis: 'rule'`; no claim carries a passage, condition or exception
   phrase (a test walks every answer of every fixture).
5. On Lyon (drawn `Hauteur Max-22`, a written façade limit to confirm),
   `can_add_storey` with 3 m says the total height is within 22 m, that the
   street façade would exceed the limit to confirm by the computed margin,
   that the rear setback issue stays, offers **Confirm** for the façade
   rule, and carries `interp.attic` (fixture test against 002.9's expected
   values).
6. The offer's `data` equals what 002.2's Confirm action writes for the same
   rule from the same section (test).
7. `heightHeadroom` gives the same storey limit to the enricher,
   `can_add_storey` and `max_height` on every fixture (test).
8. `road_distance` on Brouennes names the street edge's assumption and the
   R.111-16 check's result; with no street edge it answers `cannot-answer`
   with the sentence of DEC-3 (fixture tests).
9. `remaining_area` uses the Surfaces view's figures and says "estimate" for
   the capacity; no answer of any question contains "conforme" or
   "compliant" in either locale (string test).
10. `evaluateChecks` on the open variation equals the report's checks, and
    `checkVariation` on a second variation of the Brouennes fixture answers 1
    potential issue for one and 0 for the other (096.14 criterion 10).
11. `checkVariation` stops between buildings when its signal is aborted
    (test).
12. Every interpretation phrase is one of DEC-6's keys, in both locales.
13. No answer is produced when the report is the host's `reading` or empty
    state: the host blocks before calling (covered by 096.12's tests; here, a
    question called with an empty report answers `cannot-answer` rather than
    throwing).

# Testing strategy

- `node --test` from the repository root, no install, as every package here:
  `tests/package.test.mjs` (manifest, network list, ids), a new
  `tests/questions.test.mjs` (answers on recorded fixtures, budget, frozen
  input), `tests/checks.test.mjs` extended (`checkVariation`).
- Expected values are 002.9's, committed before the run.
- The live walk (a real model through `ai-service`) is 002.9's with 096.14;
  its answers are compared, not asserted.

# Risks

- **The model answers without calling a question.** The host's fragment
  holds the report's numbers but no text (096.12 DEC-8), so a guess is at
  least bounded; descriptions say what each question is for. It cannot be
  prevented with one round trip.
- **Conservative relative headroom.** Raising the whole building by `h`
  overstates the effect of a set-back storey; the answer says so
  (`interp.relativeEstimate`), and never states the result as a permission.
- **Storey height unreadable.** If storeys are not entities the extension can
  read, `can_add_storey` needs the user to say the height; the description
  tells the model to pass it.
- **Interpretations age.** Each is a sentence about French practice; the
  closed list is reviewed with the owner and dated in the CHANGELOG.
- **The card before 096.13.** Until the platform renders `network`, the list
  lives only in the manifest and the README.

# Questions for the owner

1. **The interpretation sentences** of DEC-6: approve, change or drop each.
   Recommended: ship all three, reviewed.
2. **Default storey height** when the model gives none and the Document's is
   not readable: ask, or assume 3.00 m and say so? Recommended: ask.
3. **`data.geopf.fr` on the card**: the mockup lists it, but it is the
   companion service's host, not the browser's. Recommended: the browser's
   three hosts, and the service named as "this deployment's service".
4. **Offers**: only *Confirm*, as DEC-5? Recommended: yes; *Does not apply*
   needs the user's judgement in the Rules view.

# Definition of Done

The acceptance criteria walked against the code; the Design Contract boxes
verified; `node --test` green from the repository root; `archisimple package
validate` and `build` pass; the README, CHANGELOG and this repository's
`CLAUDE.md` (SDK version, the `regulations` capability's questions) updated;
the proposal's §12 row for phase 3 noted.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| **096.11** (SDK 1.31) | `RegulationSource.checkVariation`, called for parked variations only, with the current report |
| **096.12** (SDK 1.32) | `RegulationSource.questions`; the answer, claim and offer shapes; the 250 ms budget; host-side citations, *(rule to confirm)*, escaping, the *Interpretation* heading; offers as `setSitePackageData` with `expected` (096.4's, contract 3.20.0) |
| **096.13** | The manifest's `network.hosts` field (its DEC-8) and the card that renders it, "Adds: … Assistant tools", and "this deployment's service" (its DEC-7) |
| **096.8a** | The locator that tells the card a companion service exists |
| **096.0a–c / 096.1** | `projection.height`, `distances` with `worst`, `floorAreas`, all with `variationId` |
| **002.1a–b, 002.2, 002.3** | The checks pipeline, `nextSectionConfirm`, the capacity and the enricher |
| **002.9 / 096.14** | The expected values and the live walk |

# Corrections to the README / proposal

Not applied (the README and proposal are the owner's); recorded here.

1. **README §3, row 002.8, "per-variation checks for 096.11"**: they are a
   source method, `checkVariation`, not checks in the report (096.11 DEC-1);
   **002.1a DEC-6** must drop "and for each variation … puts them in
   `checks[]`".
2. **README §3, row 096.13 and proposal §11.1 (4) / §9**: the package card's
   network list needs a platform half — a manifest key the parser keeps and
   a card that renders it — which no platform row names. Either 096.13 takes
   it (recommended: it already changes the card for "From this deployment"),
   or a platform sprint is added. 002.8 only declares the list. **Settled at
   the reconciliation: 096.13 owns it (DEC-7, DEC-8 there).**
3. **Mockup screen 8** lists `data.geopf.fr` among the hosts the package
   contacts; that host is the companion service's (002.5a, proposal §11.2),
   not the browser's.
4. **Proposal US-07, "Each claim cites its source"**: the citation is the
   host's, taken from the report's rule, so an answer cannot cite something
   the report does not hold (096.12 DEC-2). The extension names the rule.
5. **Proposal §11.2, "The assistant treats regulation text as quoted data"**:
   the model receives no regulation text at all (096.12 DEC-8); only short
   labels cross, quoted.
6. **002.3 DEC-7, "`programme.storeys` with the confirmed height's
   storeys"**: the storey count comes from DEC-2's headroom, which also
   covers relative limits; the enricher moves onto that function here.
7. **README §3 ledger**: the FR package's `sdkVersion` after this sprint is
   096.12's **1.32**, not 1.27; the lockstep note ("the package declares SDK
   1.27") holds only for phases 0–1. Applied at the reconciliation.

# Reconciliation (2026-10-19, phases 2–4)

- Repository line, DEC-10: package **1.3.0** (002.6 1.1.0 — restated 0.5.0 / 0.6.0 for 002.6a–b by the Phase 2 review — 002.7 1.2.0), not
  "0.8.0": 002.4 closed Phase 1 at 1.0.0.
- Prerequisites, Sizes, Current state, DEC-10, criterion 1, Dependencies,
  correction 7: 096.11 is SDK **1.31** and 096.12 **1.32**; the manifest
  moves from 002.7's `"1.30"` to **`"1.32"`**.
- DEC-9, Dependencies, correction 2: `network.hosts` is 096.13's field and
  card (DEC-7, DEC-8 there), filled here with the browser's three hosts; the
  companion is "this deployment's service", never its hosts; the draft's
  `purposeKey` is dropped (096.13 reads only `hosts`).
- Dependencies (096.12): `expected` is 096.4's, in 3.20.0; no 3.21.0.
- DEC-2: the programme enricher's storey count moves onto `heightHeadroom`
  here, as 002.3 DEC-7 now says.
