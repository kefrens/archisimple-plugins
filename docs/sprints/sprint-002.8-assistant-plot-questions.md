# Sprint 002.8 — Assistant Plot Questions

> **Status:** **Implemented and reviewed (2026-10-21, uncommitted).**
> `fr-urban-rules` **0.8.0**, `sdkVersion` **"1.32"**, on the
> platform's 096.11 (SDK 1.31) and 096.12 (SDK 1.32) as implemented and
> reviewed; walked in the editor with the live services and a scripted AI
> Service on Lyon and Brouennes. See § Outcome (2026-10-21) at the end, and
> its § Review (2026-10-21). _(Read "Implemented — awaiting independent
> review" until the review, and "Draft (2026-10-19), reviewed against the code
> 2026-10-20 — nothing implemented" before that; the draft below is kept as
> reviewed.)_
>
> **Version:** 1.0
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules`
> (`com.archisimple.fr-urban-rules`) → **0.8.0**, restated by the review of
> 2026-10-20: the package is at **0.6.1** today (0.4.0 at 002.4, 0.5.0 at
> 002.6a, 0.6.0 at 002.6b, 0.6.1 the PLUi-in-sectors fix), 002.7 takes the
> next minor, **0.7.0**, and this sprint the one after. 1.0.0 stays the first
> published version (README §3's ledger). 002.5a–b version the service, not
> the package.
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
> 002.3 (surfaces, capacity, procedure flags, the `programme` enricher, `ai`),
> all landed. Platform: **096.11** (SDK 1.31, `RegulationSource.checkVariation`
> with the parked variation's `buildings`), **096.12** (SDK 1.32,
> `RegulationSource.questions`, answers and offers), both drafts;
> 096.0a–096.8b landed. 002.5a–002.7 are not needed by this sprint's code;
> its questions read written rules once 002.6b confirms them, with no change
> here (002.6b landed: written rules arrive `to_confirm`, through a
> `source` read).
>
> **Sizes:** four questions, one shared headroom function, `checkVariation`
> on the existing checks pipeline, a manifest field and its test. The
> manifest's `sdkVersion` moves to **"1.32"** (096.12's, from 002.7's
> 1.30; it reads `"1.28"` today). No new capability. Medium-large: the
> checks step must be separated out of `augment` (DEC-7).

---

# Sprint Design Contract

- [x] **The assistant never reads a number out of the regulation.** Every
      limit in an answer is a rule of the report (coded, drawn, written once
      confirmed, or entered); every measured figure is a host measure. No
      answer reads a passage, a PDF or a source response to find a number
      (US-07).
- [x] **Every claim on a rule names the rule.** `basis: 'rule'` with its
      `ruleId`, so the host cites it from the report (096.12 DEC-2); nothing
      here writes a citation into a claim.
- [x] **Beyond the text is labelled.** Any sentence that is not the rule's
      content or a measure is an `interpretation` phrase from a closed,
      reviewed list (DEC-6), never composed from parts.
- [x] **No verdict says compliant.** The strongest answer is "no issue among
      the rules checked" (proposal §5.3); a capacity is "an estimate, not a
      right to build" (002.3).
- [ ] **One computation, three readers.** _(Held for the three readers
      criterion 7 names — the enricher, `can_add_storey`, `max_height`; **not**
      for "the Surfaces view", whose capacity keeps 002.3 DEC-5's `storeysOf`
      as DEC-8 says. Recorded as broken, § Outcome.)_ The `programme` enricher (002.3
      DEC-7), the `can_add_storey` question and the Surfaces view use one
      headroom function; a test holds them equal.
- [x] **A parked variation is checked by the read's own pipeline.**
      `checkVariation` and the report's checks call one function; a test
      holds them equal on the open variation.
- [x] **An offer is a decision the user could have made by hand.** It is the
      exact section change 002.2's Confirm action makes; nothing an action
      cannot do is offered.
- [x] **The card tells the truth.** Every host the code contacts is in the
      manifest's network list and nothing else is (a test scans the source).

---

# Current state

- **The package** (002.0 DEC-1) is one file, `src/index.js`, plain ESM
  evaluated from a `data:` URL (repository `CLAUDE.md`, "The one constraint"):
  no relative imports, so every shared function lives in that file.
  `activate` (`:10863`) builds one `reader = createReader({...})` (`:1458`;
  the national-rules engine is `createRnu`, `:4456`) and registers the
  source with `read`, `runAction` and `onDidChange`, then the programme
  stage. Manifest today: `version: "0.6.1"`, `sdkVersion: "1.28"`,
  `capabilities: ["regulations", "document", "ai", "commands"]` (`commands`
  for the developer capture, 002.4 DEC-2); after 002.7, `"1.30"` and
  0.7.0.
- **Checks** (002.1a DEC-6, 002.2 DEC-7) are computed for the open Document
  from 096.1's measures, **inside `augment(report, request, roads,
  reportFacts, { checks, written })`** (`:4919`), which also builds the
  rules, views, features and assumptions: R.111-17 per building
  (`evaluateBuilding`, `:4665`), R.111-16 (`r11116Checks`, `:6320`),
  R.111-15 (`r11115Checks`, `:6455`), drawn/entered (`plannedChecks`,
  `:7657`), written (`writtenChecks`, `:7881`) and the surfaces' checks
  (`surfacesFor`, `:8314`). Every measure is asked on `siteOf().measures`
  without a `variationId`, for the main building and the open Document's
  named buildings (`namedBuildings()`, `:4647`, through the `document`
  service — which reads the open Document only). 002.1a DEC-6's "for each
  variation … in `checks[]`" was corrected (002.1a `:654`).
- **Confirmations** (002.2 DEC-3, DEC-5): one section (`SECTION_SCHEMA = 1`),
  `confirmations[]` keyed by `ruleKey`, `plot`, `idurba`, `datvalid`, with
  `decision`, `value`, `edited` and `at` (now). The **Confirm** action's
  builder is `nextSection(section, request, plot)` (`:9975`; a `written:`
  rule goes through `nextWritten`, `:9923`, which looks the rule up in the
  session's extraction result); the request's target is the one the Rules
  view's action carries, `{ ruleId, subjectId: subjectFor(version, value,
  unit, kind) }` (`actionsFor`, `:7476`). One
  `SitePackageDataService.write(next, label, before ?? null)` (`:6046`).
- **Surfaces and capacity** (002.3 DEC-1–DEC-6): emprise au sol under a
  named definition, budget (used / allowed / remaining), surface de plancher
  with deductions, the theoretical capacity as a range labelled estimate,
  procedure flags with their verification state.
- **The programme warning** (002.3 DEC-7): a `programme` planning-stage
  enricher (`createProgrammeStage`, `:10499`), reading `reader.programme(view)`
  (`:3387`, the reader's own last report through `programmeFacts`, `:9862`),
  comparing `programme.totalArea` with the capacity's upper bound and
  `programme.storeys` with `storeysOf(confirmedLimits(planned).heights,
  floorToFloor())` (`:8276`, `:8301`) — absolute height limits only;
  synchronous, under 50 ms. "Assistant tools come with 096.12."
- **Storey height** (002.3 DEC-5): `floorToFloor()` (`:8246`) reads each
  `Level`'s `height` property through the `document` service; **the SDK's
  `Level` view holds no `height`**, so on every host today it answers the
  default `{ value: 3, assumed: true }` (`DEFAULT_FLOOR_TO_FLOOR`, `:4349`),
  and the Surfaces view says the 3 m is assumed. Step 1's question ("is a
  storey's height readable?") is answered: no.
- **What the platform gives** (as drafted):
  - 096.12: `RegulationSource.questions`, each `answer(input)` synchronous
    within **250 ms** on frozen `{ args, report, site, variationId,
    sectionData }`; answers of claims (`basis: 'measured' | 'rule' |
    'report'`), up to three `interpretation` phrases, and one optional
    `offer` (the package's next section). The host cites, formats, escapes
    and proposes; the model receives a summary of the report and never its
    passages. The offer's package id is stamped by the host (the manifest
    id, `com.archisimple.fr-urban-rules`), its `expected` is `sectionData`
    (`null` when there was none), and a stale one is reported as refused
    (096.12 RD-1).
  - 096.11: `checkVariation({ site, country, variationId, report,
    buildings }, { signal })` → `{ checks }`, called for parked variations
    only, cached by the host against the parked list and a rules key (the
    whole Site key, so the section digest too; the document version; the
    rules' ids, statuses and limits; the edges' roles); figures counted by
    the host's `regulationCounts`.
  - 096.0a–c / 096.1: `site.measures.projection` (with `height.top`, `eaves`,
    `topAboveGround`), `distances` (the `worst` pair minimising `d − k·Δz`),
    `floorAreas`, `plotCoverage`, each with `variationId`.
- **The package card** (`archisimple/apps/web/src/workbench/preferencesEntries.tsx:1036`,
  `PluginRow`) shows name, version, kind, state, diagnostics and actions. The
  manifest has **no network field**; its parser
  (`parsePackageManifest`, `archisimple/packages/package-manager/src/package-manifest.ts:185`)
  reads the keys it knows by name and refuses no other (confirmed
  2026-10-20; no "unknown key" check in `package-manager` or
  `package-builder`), so a new key is ignored by an older host. The mockup (screen 8) shows "Sends your parcel's location to:
  apicarto.ign.fr · geoportail-urbanisme.gouv.fr · data.geopf.fr ·
  georisques.gouv.fr" and "Adds: Site → Règles d'urbanisme (PLU) · Plan
  layers · Assistant tools · Print sheet".
- **Hosts the browser code contacts**: the three `fetch` bases,
  `APICARTO_GPU`, `GPU_DOCUMENT_API` and `GEORISQUES` (`src/index.js:58-60`):
  `apicarto.ign.fr`, `www.geoportail-urbanisme.gouv.fr`,
  `georisques.gouv.fr`; and the companion service at the base URL
  `PluginService.locate()` answers (same origin, `/plugins-api/<id>/`).
  **Links the user opens are not contacts**: `www.legifrance.gouv.fr`
  (`:10474`, an article link) and the GPU file links (`gpuFileHref`,
  `:1302`) appear as `https://` literals but are never fetched.
  `data.geopf.fr` is the **companion service's** (002.5a, proposal §11.2),
  not the browser's.

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

**Storey height**: the `storeyHeight` argument; absent, `floorToFloor()`
(002.3 DEC-5, `:8246`) — the same figure the Surfaces view's capacity uses,
which on every host today is the assumed 3 m (the SDK's `Level` view holds
no `height`). An assumed height is said as a claim (`basis: 'report'`,
`fr-urban-rules.question.storeyHeightAssumed`, "a 3.00 m storey is assumed;
say the floor-to-floor height to change it"), and the description tells the
model to pass `storeyHeight` when the user names one. **RD-2** (Question
2): assume and say, rather than `cannot-answer` — one computation with the
capacity and the programme warning, which already assume it.

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
  builds — `nextSection(sectionData, { actionId: 'confirm', target },
  plot)` (`:9975`; `nextWritten` for a `written:` rule), the one function
  both call — with the `target` the Rules view's action carries for that
  rule (`actionsFor`, `:7476`: `{ ruleId, subjectId: subjectFor(version,
  value, unit, kind) }`). The target is built from the reader's own
  planned-rule metadata (`meta`, the version read), which the host's report
  does not carry, so the question looks the rule up in the reader's last
  read for this Site and offers nothing when that read is not the report it
  was given (a different `document.version` or a missing rule id).
- `nextSection` stamps `at: now()`: the offer's section carries the answer's
  time, not the approval's. Criterion 6's equality runs on a fixed clock.
- A `{ refused }` from the builder (a newer version's rule,
  `fr-urban-rules.edges.changed`) means no offer.
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

- **The checks step is separated out of `augment`** (`:4919`), which today
  interleaves it with the rules, views and features: `evaluateChecks(inputs,
  target)` where `inputs` are the last read's own inputs for this Site — the
  planned rules and their metadata, the edges and their roles, the roads,
  the alignments and corridors (`contextFor`, cached per Site), the written
  session, the section — and `target` is `{ measures, buildings,
  variationKey }`: `site.measures` with every call given `variationId` (a
  small wrapper over `SiteMeasures`), the buildings to measure, and the key
  the per-variation answers are read under (`answersOf(map, key)`, 002.3
  DEC-3). `augment` calls it with the open Document (no `variationId`,
  `projectBuildings(service)`, `variationKeyOf(service)`).
- `checkVariation({ site, report, variationId, buildings }, { signal })`
  calls it with the parked variation's id, the request's `buildings` (096.11
  RD-1: the parked projection's, since the `document` service reads only
  the open Document) and `variationKey = variationId`, and returns `{
  checks }`. It reads no network and starts no read: it uses the last read's
  cached inputs for the request's Site, and **throws** when it holds none or
  when they are not the report it was given (`document.version` or the rule
  ids differ) — the host shows _Could not be measured_ (096.11 DEC-2's
  `source-unavailable`), and the next figure after a read succeeds.
  Neighbours (R.111-28) are `information` and not counted (096.11 Risks).
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
  rule label keys (`fr-urban-rules.rule.*`, there is no
  `fr-urban-rules.limit.*` namespace) and cite the same rule ids; limits
  travel as quantities and the host formats them.

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
- **The test** (`tests/package.test.mjs`): the hosts of the `fetch` base
  constants in `src/index.js` (today `APICARTO_GPU`, `GPU_DOCUMENT_API`,
  `GEORISQUES`, `:58-60`, gathered under one `FETCHED_HOSTS` list the code
  and the test both read) equal `network.hosts`; and every other `https://`
  literal in the file is on a short, named `LINK_HOSTS` list (today
  `www.legifrance.gouv.fr`; the GPU file links share
  `www.geoportail-urbanisme.gouv.fr`). A new host in the code, fetched or
  linked, fails until it is put on one list. **RD-4**: a link the user opens
  is not "contacted" and is not on the card.
- **Rendering is the platform's** (Dependencies): an older host ignores the
  key; the card shows it once 096.13 reads it.
- The README's "hosts contacted" line is generated from the same list in the
  same commit (no second list to drift).

## DEC-10 — The manifest

| Field | Before | After | Why |
| --- | --- | --- | --- |
| `sdkVersion` | `"1.30"` (002.7's; `"1.28"` today) | **`"1.32"`** (096.12's) | `questions` (096.12, 1.32) and `checkVariation` (096.11, 1.31) are read by those minors; declaring the later one refuses the package on any build lacking either, with a reason |
| `capabilities` | `regulations`, `document`, `ai`, `commands` | unchanged | questions need `ai` and `regulations`, offers `document` (096.12 DEC-12); `commands` stays for the developer capture |
| `network` | — | DEC-9 | the card |
| `version` | 0.7.0 (002.7's; 0.6.1 today) | **0.8.0** | new behaviour |

**Lockstep.** The web image must carry 096.11 and 096.12 before the plugins
image ships this version; an older image refuses the manifest whole.

---

# Steps

1. **Read first**: the landed 096.11 and 096.12 (names, budget, shapes,
   whether `buildings` survived 096.11 RD-1). The storey-height and
   manifest-parser questions were answered by the review of 2026-10-20
   (Current state).
2. **Refactor**: `evaluateChecks(inputs, target)` out of `augment` (DEC-7),
   with the existing suites (`rnu.test.mjs`, `rules.test.mjs`,
   `written.test.mjs`, `surfaces.test.mjs`, `acceptance.test.mjs`) green
   before anything is added; `nextSection` reused for the offer;
   `heightHeadroom`; the enricher moved onto it.
3. **`checkVariation`** and its test.
4. **The four questions**, their descriptions, parameters and phrases; the
   interpretation list reviewed with the owner.
5. **Offers** on `can_add_storey` and `max_height`.
6. **Manifest**: `sdkVersion`, `network`, `version`; the network test; the
   README and CHANGELOG (the questions, the card, the SDK bump).
7. **Tests** against the recorded fixtures (002.4's plots under
   `test-fixtures/fr-urban-rules/acceptance/`; Brouennes re-captured with
   its second variation), timed against the 250 ms budget.
8. **Joint run** with the platform's stub tests green; 002.9 walks it live.

# Acceptance criteria

1. The manifest declares `version` `"0.8.0"`, `sdkVersion` `"1.32"`, the
   four capabilities unchanged and `network.hosts` equal to `FETCHED_HOSTS`,
   with every other `https://` literal on `LINK_HOSTS` (DEC-9;
   `tests/package.test.mjs`; `archisimple package validate ./fr-urban-rules`
   passes).
2. The source registers four questions with ids, descriptions ≤ 500
   characters and parameters as DEC-1 (`tests/package.test.mjs`).
3. On every fixture, each question returns within 250 ms (measured over 20
   runs on the slowest fixture, the median under 100 ms), never returns a
   promise, and never mutates its input (`tests/questions.test.mjs`, new,
   on deep-frozen input).
4. Every claim with a limit names a `ruleId` present in the report and has
   `basis: 'rule'`; no claim carries a passage, condition or exception
   phrase (`tests/questions.test.mjs` walks every answer of every fixture).
5. On Lyon (drawn `Hauteur Max-22`, a written façade limit to confirm),
   `can_add_storey` with 3 m says the total height is within 22 m, that the
   street façade would exceed the limit to confirm by the computed margin,
   that the rear setback issue stays, offers **Confirm** for the façade
   rule, and carries `interp.attic` (`tests/questions.test.mjs` against
   002.9's expected values).
6. The offer's `data` equals what 002.2's Confirm action writes for the same
   rule from the same section, on a fixed clock (`tests/questions.test.mjs`
   calling `runAction` and the question on one reader).
7. `heightHeadroom` gives the same storey limit to the enricher,
   `can_add_storey` and `max_height` on every fixture
   (`tests/questions.test.mjs`); with no `storeyHeight`, the answer carries
   the assumed-height claim (RD-2).
8. `road_distance` on Brouennes names the street edge's assumption and the
   R.111-16 check's result; with no street edge it answers `cannot-answer`
   with the sentence of DEC-3 (`tests/questions.test.mjs`).
9. `remaining_area` uses the Surfaces view's figures and says "estimate" for
   the capacity; no answer of any question contains "conforme" or
   "compliant" in either locale (`tests/questions.test.mjs`, string walk of
   `resources/i18n/fr-urban-rules/{en,fr}.json` keys under
   `fr-urban-rules.question.`).
10. `evaluateChecks` on the open variation equals the report's checks on
    every fixture (the refactor holds), and `checkVariation` on a second
    variation of the Brouennes fixture answers 1 potential issue for one and
    0 for the other (096.14 criterion 10) (`tests/rnu.test.mjs` extended;
    the Brouennes acceptance fixture, `test-fixtures/fr-urban-rules/acceptance/brouennes/`,
    is re-captured with the developer capture (002.4 DEC-2) once 096.14
    DEC-1 has added the second variation, so `site-calls.json` holds the
    measures asked with its `variationId`).
11. `checkVariation` stops between buildings when its signal is aborted, and
    throws when it holds no read for the request's Site or a read of another
    document version (`tests/rnu.test.mjs`).
12. Every interpretation phrase is one of DEC-6's keys, in both locales
    (`tests/questions.test.mjs`).
13. No answer is produced when the report is the host's `reading` or empty
    state: the host blocks before calling (covered by 096.12's tests; here, a
    question called with an empty report answers `cannot-answer` rather than
    throwing, `tests/questions.test.mjs`).

# Testing strategy

- `node --test` from the repository root, no install, as every package here:
  `tests/package.test.mjs` (manifest, network list, ids), a new
  `tests/questions.test.mjs` (answers on recorded fixtures, budget, frozen
  input), `tests/rnu.test.mjs` extended (`evaluateChecks` and
  `checkVariation`; there is no `checks.test.mjs`). Run as
  `node --test fr-urban-rules/tests/*.test.mjs` from the repository root
  (Volta, repository `CLAUDE.md`).
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
- **Storey height unreadable.** It is, today: the SDK's `Level` view has no
  `height`, so the answer assumes 3 m and says so (RD-2); the description
  tells the model to pass `storeyHeight`. A later SDK that exposes it makes
  `floorToFloor()` answer it with no change here.
- **The `augment` refactor** touches the code every Phase 1 check runs
  through. Mitigation: step 2 lands it alone with the existing suites green
  before any question is written; criterion 10's equality holds it.
- **A building added only in a parked variation** is measured only if 096.11
  keeps `buildings` on the request (its RD-1); otherwise `checkVariation`
  measures the open Document's buildings by id, and says so in an
  assumption.
- **Interpretations age.** Each is a sentence about French practice; the
  closed list is reviewed with the owner and dated in the CHANGELOG.
- **The card before 096.13.** Until the platform renders `network`, the list
  lives only in the manifest and the README.

# Questions for the owner

Answered on the owner's behalf by the review of 2026-10-20 (the owner's
authorisation); each is a numbered decision below, reversible.

1. ~~The interpretation sentences of DEC-6~~ — RD-1.
2. ~~Default storey height when the model gives none~~ — RD-2.
3. ~~`data.geopf.fr` on the card~~ — RD-3.
4. ~~Offers: only *Confirm*?~~ — RD-5.

## Decisions taken on the owner's behalf (2026-10-20), reversible

- **RD-1 — Ship DEC-6's three interpretation sentences as drafted**, dated
  in the CHANGELOG as "to be reviewed by the owner"; any one can be dropped
  by deleting its key and its condition, with no other change.
- **RD-2 — Assume the storey height and say so**: `storeyHeight` when given,
  else `floorToFloor()` (the assumed 3 m on every host today, as the
  Surfaces view and the programme warning already do), with a claim saying
  it was assumed — not `cannot-answer` (DEC-2). Reverse by answering
  `cannot-answer` when `floorToFloor().assumed`.
- **RD-3 — The card lists the browser's three fetched hosts**; the companion
  is "this deployment's service" (096.13 DEC-7), never its hosts.
- **RD-4 — Links are not contacts**: `www.legifrance.gouv.fr` (and any other
  host only linked to) stays off `network.hosts`, on a named `LINK_HOSTS`
  list the test reads (DEC-9).
- **RD-5 — Offers are *Confirm* only**, for the governing rule; *Does not
  apply* and *Edit value* need the user's judgement in the Rules view.
- **RD-6 — `checkVariation` reuses the last read's own inputs**, never the
  host's report alone and never a network call; without a matching read it
  throws and the host says _Could not be measured_ (DEC-7). Reconstructing
  the inputs from the host's report would lose the roads, alignments and
  the written session the checks need.

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
| **096.11** (SDK 1.31) | `RegulationSource.checkVariation`, called for parked variations only, with the current report and the parked variation's `buildings` (its RD-1) |
| **096.12** (SDK 1.32) | `RegulationSource.questions`; the answer, claim and offer shapes; the 250 ms budget; host-side citations, *(rule to confirm)*, escaping, the *Interpretation* heading; offers as `setSitePackageData` with `expected` (096.4's, contract 3.20.0) |
| **096.13** | The manifest's `network.hosts` field (its DEC-8) and the card that renders it, "Adds: … Assistant tools", and "this deployment's service" (its DEC-7) |
| **096.8a** | The locator that tells the card a companion service exists |
| **096.0a–c / 096.1** | `projection.height`, `distances` with `worst`, `floorAreas`, all with `variationId` |
| **002.1a–b, 002.2, 002.3** | The checks pipeline (inside `augment`), `nextSection`, the capacity, `floorToFloor()` and the enricher |
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

# Review (2026-10-20)

Reviewed against `fr-urban-rules` 0.6.1 and the platform after Phases 0–2
(contract 3.20.0, SDK 1.28, file version 25), with 096.11 and 096.12 as
reviewed the same day. What changed in this draft:

- **Version**: **0.8.0** (0.6.1 today; 002.7 → 0.7.0), replacing "1.3.0" in
  the Repository line and DEC-10; README §3's 002.8 row restated. The
  Reconciliation section's "1.3.0" below is history.
- **Manifest today**: `sdkVersion "1.28"`, and four capabilities —
  `commands` too (the developer capture), kept.
- **DEC-5**: the Confirm builder is `nextSection(section, request, plot)`
  (`nextWritten` for written rules), with the Rules view's target; there is
  no `nextSectionConfirm`. The target needs the reader's own metadata, so an
  offer requires the reader's last read to match the report it was given.
- **DEC-7**: the checks live inside `augment`; the refactor is named, its
  inputs listed, and `checkVariation` reuses the last read's inputs (RD-6)
  with the request's `buildings` (096.11 RD-1).
- **DEC-2**: storey height answered (not readable; `floorToFloor()` assumes
  3 m) — RD-2.
- **DEC-8**: `fr-urban-rules.limit.*` does not exist; rule label keys
  `fr-urban-rules.rule.*`.
- **DEC-9**: the network test as drafted would have failed on
  `www.legifrance.gouv.fr` (a link, `:10474`); it now reads the fetch bases
  and a named link list (RD-4).
- **Criteria and testing**: test files named (`tests/questions.test.mjs`
  new, `tests/rnu.test.mjs` extended; there is no `checks.test.mjs`); the
  Brouennes acceptance fixture is re-captured with its second variation.
- **Questions** answered on the owner's behalf (RD-1–RD-5).
- Unchanged and still right: `sdkVersion` **"1.32"**, four questions, one
  headroom function, *Confirm* offers only, the network list's three hosts.

# Outcome (2026-10-21)

**Implemented, walked and reviewed, uncommitted** (§ Review (2026-10-21) below).
`fr-urban-rules` **0.8.0**, `sdkVersion` **"1.32"**, capabilities unchanged
(`regulations`, `document`, `ai`, `commands`), `network.hosts` added. Built on
the platform's 096.11 and 096.12 as implemented and reviewed (their Outcomes
define the shapes used: `RegulationVariationRequest` with `buildings`,
`RegulationAnswer.values`, cannot-answer assembled by the host, the 250 ms
budget measured not enforced). **No platform defect was found** in 096.11 or
096.12; nothing under `archisimple/packages` or `apps/` was changed — only
`tools/e2e` (the walk's spec, its project in `playwright.regulations.config.ts`,
and an `auto` mode in `src/scriptedAiService.mjs`).

## What landed

- **`evaluateChecks(inputs, target, …)`** (DEC-7), separated out of `augment`:
  R.111-17/16/15, the drawn, entered and written checks, 002.4 Q5's fold and
  the surfaces' checks, with a `beforeSurfaces` hook where `augment` draws the
  bands and the envelope, so every assumption keeps its order (the suites passed
  unchanged after the refactor, before anything was added: 325 / 325).
  `namedBuildings(service)` reads a parked variation's buildings from
  `variationView(service, variationId, buildings)`, which also scopes every
  measure to the `variationId` and names the variation open (so 002.3 DEC-3's
  per-variation answers are read under its id). A read's answer (never a
  progress report) keeps its own inputs, report and the measures its checks
  were computed from (`recordedMeasures`) in `lastReads`, per Site.
- **`checkVariation`** (RD-6): the read's pipeline over the parked view and the
  last read's inputs; throws with no read matching the report (`lastReadFor`:
  same `document.version`, every report rule among the read's), and on an
  aborted signal between buildings and steps; keeps a check's assumption ids
  only where the report holds them.
- **`heightHeadroom` / `storeyLimit` / `measuredBuildings`** (DEC-2): absolute
  limits from their checks (limit − measured, so a drawn limit counts only
  where drawn), R.111-17 and R.111-16 from the worst pair's margin over the
  factor taken from the read's own `distances` answers (an adjoining edge
  skipped), a PLU façade-relative setback from its check; tightest confirmed
  and tightest to confirm. **The programme enricher moved onto it**
  (`programmeHeadroom`; phrases `programme.storeysRelative` /
  `overStoreysRelative` when a distance rule governs).
- **The four questions** (DEC-1, DEC-3–DEC-6) with their descriptions (284–466
  characters) and parameters; `confirmOffer` (DEC-5) building the offer with
  `nextSection` and the Rules view's own `actionsFor` target.
- **Network list** (DEC-9): `FETCHED_HOSTS` and `LINK_HOSTS` in `src/index.js`;
  `fetchJson` refuses any other host; the manifest's `network.hosts`; the
  README's table held equal by a test.
- **The developer capture** records the host's last parked-variation requests
  and writes `variations.json`; `tools/record-fixtures.mjs --trim` keeps those
  measures.
- **Strings**: 68 keys added in each locale (66 `fr-urban-rules.question.*`, 2
  `programme.*`), 743 each.
- **Tests**: `node --test 'fr-urban-rules/tests/*.test.mjs'` **347 pass** (325
  before): `questions.test.mjs` (14, new), `rnu.test.mjs` +4, `package.test.mjs`
  +4 (and the manifest pin), `sheet.test.mjs`'s WinAnsi walk leaves
  `question.*` out (answers go to the dock, never a sheet). Services untouched:
  127 pass. `archisimple package validate ./fr-urban-rules` passes;
  `tools/build-index.mjs` rebuilt `dist/` (0.8.0); `tools/check-index.mjs
  --platform ../archisimple`: 2 of 2 accepted (the parser keeps ignoring the
  unknown `network` key until 096.13).
- **Fixture**: Brouennes' acceptance capture gained a second, parked variation
  (the house moved 3.5 m away from side edge 2): `variations.json` and its six
  `site-calls` pairs (see decision 9).

## The walk (2026-10-21)

`fr-urban-rules` 0.8.0 from the local index (port 47501), the scripted AI
Service in `auto` mode (47502), an editor of its own (5189); live GPU, API
Carto, Géorisques and roads; `tools/e2e` project **`fr-assistant-questions`**
(`specs/assistantPlotQuestions.spec.ts`), **2 passed**, no page error. Pictures
and texts in `archisimple/tools/e2e/test-results/regulations/phase3-002.8/`:

- **Lyon** (`lyon-1…4-*.png/.txt`): « Hauteur Max-22 » reopened first;
  `can_add_storey` — *Height leaves room for a storey of 3000 mm*, 12 087 mm
  measured, the limit claim cited by the host with *(rule to confirm)*, the SdP
  after the storey, the design's own 3 m storey said; `road_distance` — four
  street edges measured live (nearest 22 971 mm) and the edge-role assumptions;
  `max_height` — 22 000 mm; `remaining_area` — emprise 150 m² under R.420-1, SdP
  ~406 m², no capacity (the committed project confirms nothing). The model's own
  sentence never shown. `lyon-5…7`: the **Confirm 22 m** card approved, the rule
  *Confirmed* after the re-read, one Undo back to *To confirm*, Redo; `lyon-8`:
  `max_height`'s card, built on the same section, refused as stale.
  `lyon-context-fragment.json`: the four tools offered, no passage.
- **Brouennes** with the parked variation: the Checks view's **Across
  variations** — *Master · Open · 1 potential issue · 2 of 5 rules checked*;
  *Moved from the side boundary · No issue among the rules checked · 2 of 5*
  (`brouennes-1-…png`), the Variations cards the same
  (`brouennes-2-variations-cards.png`) — no « Not measured by Règles
  d'urbanisme (PLU) » anywhere; the four answers (`brouennes-1…4-*`):
  R.111-17 already exceeded by about 3 937 mm, R.111-16 partly measured, the
  relative-estimate interpretation; the capture run, its seven files downloaded.

**Defects found by looking, and fixed** (this repository): (1) an
already-exceeded limit read « about −3937 mm of height left » — now
`limit.over` / `relative.over` / `max.relativeOver`; (2) R.111-16 measured to
one alignment of two (edge 3's off the terrain) was stated as if whole — now
`limit.partlyChecked`; (3) the `storeyHeight` description carried « in metres »
twice once the host appended the unit; (4) a single-quoted description with an
apostrophe broke the module (caught by the suite).

## Decisions taken on the owner's behalf (2026-10-21), reversible

1. **The storey height is readable** (see « What the draft claimed »): with no
   `storeyHeight`, the design's own floor-to-floor height is taken and said
   (`question.storeyHeightProject`); RD-2's assumed-3 m claim
   (`storeyHeightAssumed`) only when no `Level` height is shown.
2. **`storeyLimit` without measured storeys** (no floor answered): the height
   the rules allow (top + headroom; the limit itself for an absolute one) over
   the storey height — 002.3 DEC-5's count — instead of "0 + headroom".
3. **The programme counts storeys under the tightest confirmed limit**, not
   the highest absolute one (002.3 DEC-7's `storeysOf(...).high`): a façade 7 m
   and a total 10 m give 2 storeys at 3 m, not 3.
4. **Claims name their rule** by a `{rule}` parameter — the label in the
   extension's words, or a drawn prescription's label in guillemets, cut at 80:
   the host cites a rule but does not name it, and a claim is one phrase.
5. **`road_distance` measures the street edges live** (`distances`, outline
   `storeys`, as the setback checks): the read measures no street edge, so no
   capture holds the call; on the replays the claim reads « not measured », and
   the test says so.
6. **An exceeded limit is said as exceeded**, and a relative rule measured only
   in part says so (walk defects 1–2).
7. **`checkVariation` drops assumption ids the report lacks** rather than let
   the host drop and count them.
8. **A read matches the report** on its document version and on every report
   rule being among the read's (a subset, so a host-dropped rule does not
   refuse every answer).
9. **Brouennes' fixture was merged, not re-captured whole**: the new capture's
   open-design measures were identical to 002.4's (only `variations()` differed,
   by the added variation), so the six parked-variation pairs and
   `variations.json` were added and 002.4's files kept; `--trim` re-run.
10. **The offer's label** names its value in the rule's own unit (« Confirm 22 m »):
    an offer label is a phrase with no `values`, so it does not follow the
    project's unit as the answer's values do. _(Review R7: the value is now a
    number parameter, so the host writes it in the reader's locale.)_
11. **`can_add_storey`'s SdP after the storey** is today's SdP plus the top
    storey's floor inside its external walls; the architect threshold (150 m²,
    R.431-2 a) is a claim only when that sum crosses it.
12. **`remaining_area`** states the Surfaces view's figures under its own
    sentence keys (the view's labels are not sentences).
13. **`network.hosts` ships before 096.13** (the platform's parser ignores it;
    `check-index --platform` accepts the manifest), and `fetchJson` enforces the
    list.
14. **The walk's spec is committed** in archisimple (regulations configuration
    only), with the scripted service's `auto` mode.

## What the draft claimed that was false

- **"The SDK's `Level` view holds no `height`, so on every host today it
  answers the default 3 m"** (Current state, DEC-2, RD-2, Risks): the
  `document` service answers `Level.property('height')` — Lyon's and
  Brouennes' captures record `{ kind: 'length', value: 3 }` — so `floorToFloor()`
  is not assumed there. The README said the same and is corrected.
- **Criterion 5, "Lyon (… a written façade limit to confirm)"**: the acceptance
  capture holds no written rule (no extraction recorded, as 002.9 notes). The
  façade case is tested on Lyon's planning recordings with a written 11 m
  façade rule from a fake companion service; the captured case is tested as it
  is (22 m confirmed) and without the walk's confirmation (22 m to confirm,
  offered).
- **The contract box "the Surfaces view use one headroom function"**: DEC-8 and
  criterion 7 keep the Surfaces capacity on 002.3 DEC-5's `storeysOf`; the box
  is left unticked. The enricher's `capacity` keeps that function too, so its
  storeys and its capacity can now rest on different limits (a relative rule
  gives storeys and no capacity).
- **DEC-4, "Rule labels are the report's own phrases, reused by key"**: a claim
  is one phrase; the label travels as a parameter (decision 4).

## Design Contract, against the source

1. **No number out of the regulation** — limits come from `report.rules` and
   `report.checks`, figures from the read's recorded measures or a live
   measure; no passage is read (`heightHeadroom`, `answer*`). Held.
2. **Every claim on a rule names the rule** — `basis: 'rule'` with `ruleId`, no
   citation field (`questions.test.mjs` criterion 4). Held.
3. **Beyond the text labelled** — interpretations only from `INTERPRETATIONS`
   (criterion 12). Held; the estimates DEC-3 lists as claims (`sdpAfter`,
   `empriseUnchanged`, the architect threshold) are `measured` / `report` claims
   as DEC-3 says.
4. **Never compliant** — criterion 9's string walk. Held.
5. **One computation, three readers** — held for the enricher, `can_add_storey`
   and `max_height` (criterion 7's test); **not** for the Surfaces view (above).
6. **The read's own pipeline for a parked variation** — `checkVariation` calls
   `evaluateChecks`; criterion 10's test holds the two equal on every plot.
   Held.
7. **An offer is the Confirm action** — criterion 6's test (`deepEqual` with
   what `runAction` writes, one clock). Held.
8. **The card tells the truth** — the source scan and `fetchJson`'s guard
   (`package.test.mjs`). Held.

## Acceptance criteria, walked

1. Manifest 0.8.0, "1.32", capabilities, `network.hosts` = `FETCHED_HOSTS`,
   other literals on `LINK_HOSTS` — `package.test.mjs` "criterion 1" and "002.8
   DEC-9 / criterion 1"; `archisimple package validate` passed. **Met.**
2. Four questions, ids, ≤ 500-character descriptions, DEC-1's parameters —
   `package.test.mjs` "002.8 criterion 2". **Met.**
3. Within 250 ms, median < 100 ms on the slowest plot, no promise, frozen input
   — `questions.test.mjs` "criterion 3" (each answer about a millisecond here). **Met.**
4. Limits on rules of the report, no passage/condition/exception —
   "criterion 4". **Met.**
5. Lyon — "criterion 5 (as captured)" ×2 and "criterion 5: Lyon, a written
   façade limit of 11 m": the total within 22 m, the façade over the limit to
   confirm by 1 m, the setback issue that stays, **Confirm 11 m**,
   `interp.attic`. **Met**, on a fake written rule (above).
6. Offer = Confirm's section on a fixed clock — inside the 11 m test. **Met.**
7. Three readers agree on every plot; the assumed-height claim —
   "criterion 7" ×2. **Met** (the assumed claim when no `Level` height).
8. `road_distance` on Brouennes: the edge-role assumption and R.111-16's result;
   no street edge → DEC-3's sentence — "criterion 8" ×2. **Met.**
9. `remaining_area` = the Surfaces figures, "estimate"; never compliant —
   "criterion 9" ×2. **Met.**
10. `evaluateChecks` on the open variation = the report's checks on every plot;
    Brouennes' parked variation 0 against the open 1 — `rnu.test.mjs` "002.8
    criterion 10" ×2 (the replayed checks also equal the editor's own answer
    during the capture). **Met**, with the fixture merged (decision 9).
11. Stops on an aborted signal; throws with no read or another version/rule —
    `rnu.test.mjs` "002.8 criterion 11" ×2. **Met.**
12. Interpretations from DEC-6's keys, both locales — "criterion 12". **Met.**
13. Empty report → `cannot-answer`, never a throw — "criterion 13" (also an
    unread report and an unknown building). **Met.**

## 002.9's expected values: what changes

- **P1 Lyon, "can I add a storey?"**: the answer cites « Hauteur Max-22 » and
  the measured 12.09 m (as expected) but does **not** call the floor-to-floor
  height an assumption: it says the design's own 3 m is taken (decision 1). The
  drawn 22 m is `height_facade` only with a written « see graphic » façade rule
  (002.6b DEC-5); with no extraction it stays `height_total`.
- **P4 Brouennes**: the capture now holds the second variation 002.9 expects
  (« variation B 0 »), measured by the FR source: 5.814 m against 4.543 m on
  edge 2. 002.9's `variationFigures` step reads it, no « Not measured by ».
- **Programme warning storeys** now follow the tightest confirmed limit,
  absolute or relative; under the RNU a building now gets a storey count from
  R.111-16/17 (002.9's assistant rows comparing the warning should expect it).
- **`road_distance`** measures live; 002.9's live walk sees the street
  distances the replays cannot.

## Not done, and open

- **The package card does not show the hosts yet**: 096.13 owns the field's
  rendering (its DEC-8); until then the list lives in the manifest and the
  README. `0-package-card.png` shows the repository row, not a host list.
- ~~**The platform README's Q49** still reads "Ask" for the storey height~~ —
  corrected by the review (2026-10-21): "The design's own `Level` height, else
  assume 3.00 m, said (002.8 RD-2); _Confirm_ only".
- The questions read the open variation only (DEC-1); a parked variation's
  storey heights are not read (`floorToFloor()` reads the open Document's
  levels; the variation path's capacity uses them too).

## Post-sprint

- [x] Status, Outcome, contract boxes, criteria walked (this section).
- [x] CHANGELOG (0.8.0, the three interpretation sentences marked for the
      owner's review, RD-1) and README (the questions, the card, SDK 1.32,
      the storey height corrected).
- [x] This repository's `CLAUDE.md`: SDK 1.32, the `regulations` row (1.31's
      `checkVariation`, 1.32's questions with `ai`, offers with `document`), the
      `ai` row, the questions seam (left open by 096.11).
- [x] The milestone doc's status line and § 12's Phase 3 row.
- [x] The platform README § 3's 002.8 row (`docs/milestones/site-regulations/README.md`).
- [x] `dist/` rebuilt, `check-index.mjs --platform ../archisimple` accepted.
- [x] The walk (`fr-assistant-questions`), pictures read.
- [x] Independent review (2026-10-21, § Review below).
- [ ] The owner's review of the three interpretation sentences (RD-1).
- [ ] Commit (the owner's).

## Review (2026-10-21)

An independent review of the diff against DEC-1–DEC-10, the platform's 096.11
and 096.12 contracts (`packages/extension-sdk/src/regulations.ts`), the walk's
outputs and the tests. Every finding below was fixed in this repository; **no
platform defect was found** and no platform code changed (the README's Q49 line
was corrected, a documentation fix).

**What held, checked against the source.**

- **The refactor is equivalent.** `evaluateChecks` keeps the old `augment`'s
  order of `assume` calls (the R.111-17/16/15 block, the planned checks, the
  fold, then `beforeSurfaces` drawing the alignments, bands and envelope with
  their assumptions, then the surfaces). The one move — R.111-28's neighbours
  now after the surfaces — calls no `assume`, so no assumption changes place.
  `namedBuildings(service)` over the recording proxy answers what the old
  closure did (the proxy passes everything but `measures` through). The
  existing suites and criterion 10's on-every-plot equality hold it.
- **`checkVariation` measures the parked variation only**: `variationView`
  adds `variationId` to every one of the four `SiteMeasures` calls (the SDK has
  no other), `variations()` names it open so 002.3 DEC-3's answers are read
  under its id, and `namedBuildings` returns the request's `buildings`. The only
  open-design reads left are `floorToFloor()` (already in "Not done") and the
  Site itself, which variations share. Criterion 10's parked test replays
  site-calls keyed on `variationId`, so a call without it would miss the
  recording; it is genuine. Refusals (no read, another version, a rule not
  read, an aborted signal) are as DEC-7 and RD-6 say.
- **The network list**: every `fetchJson` URL is built from the three base
  constants; the companion service is reached by `fetchChapter` / `serviceCall`
  only, on `locate()`'s base checked same-origin by `checkedLocation`
  (ADR-0114 Rule 2), so it is rightly not on `network.hosts`; Légifrance is
  only ever a link (`www.legifrance.gouv.fr/codes/article_lc/…`), never fetched.
- **Budget**, measured on the five reference captures (20 runs each): every
  question's median ≤ 0.03 ms, its worst ≤ 0.5 ms (Lyon); the reads themselves
  2–45 ms. `road_distance`'s live `distances` call is not in the replays; in the
  walk it answered within the host's budget (no overrun reported).
- **Answers**: claims carry quantities in `values`; parameters are rule names,
  edge numbers, a count, a reason code — never a formatted figure. No passage,
  condition or exception reaches a claim or the context fragment
  (`lyon-context-fragment.json`). Interpretations come only from the three keys.
- **The terms left in French inside the English strings** (« emprise au sol »,
  « surface de plancher ») are intended: they are the Code de l'urbanisme's
  defined terms and the plugin's English uses them throughout (nine and
  fourteen non-question strings respectively). Kept.
- **The offer's label in metres on a millimetre project** is kept, as decision
  10 says, and now argued: it names the value as the regulation states it and as
  Confirm records it (`{ value: 22, unit: 'm' }`); an offer label is a phrase
  with no `values` in SDK 1.32, so following the project's unit would need an
  SDK change for a cosmetic gain.
- **The unticked contract box** ("one computation, three readers", not for the
  Surfaces view) is recorded honestly: the Surfaces capacity and the enricher's
  `capacity` stay on 002.3 DEC-5's `storeysOf`.

**Findings, all fixed.**

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| R1 | M | `max_height`'s summary named the tightest limit **of any status** as "the tightest height limit here" — the walk's `lyon-3` said « The tightest height limit here is 22000 mm » for a rule to confirm. A summary carries no `ruleId`, so the host cannot mark it *(rule to confirm)*. | The summary is the tightest **confirmed** limit (`max_height.absolute` / `.relative`, now saying "confirmed"); `…ButToConfirm` adds "a rule to confirm gives a lower one, {lower}"; `max_height.toConfirmOnly` when no confirmed limit applies. The offer still follows the tightest of any status (DEC-5). |
| R2 | M | `storeyLimit` with no storeys measured counted `top + (limit − eaves)` for a façade limit — the roof counted as storeys (a 7 m façade, 6 m eaves, 9 m top gave 3 storeys of 3 m, not 2) — while its comment said "the limit itself for an absolute one". | An absolute limit's allowed height is the limit itself. |
| R3 | L | `heightHeadroom` took the limit from the last read's check (`check.limit`): the programme warning passes the section's current rules, so a value edited since that read was measured against the old one. | `limit` is the rule's value, against the height its check measured. |
| R4 | L | `issuesWhateverTheHeight` dropped every relative-limit issue, including R.111-17 closer than its 3 m floor — an issue no height changes — and gave each building every other building's edge issues. | A relative rule's issue shown on its `minimum` is kept; an edge check is the building's by its id. |
| R5 | L | English "at the nearest distance" for the worst pair (`relative.fits/exceeds/over`); the French already said « la plus contraignante ». | "where the distance is tightest". |
| R6 | L | `question.architect` had an unbalanced parenthesis in both locales (« (R.431-2 a), indicatif) »). | « Indicatif : … (R.431-2, a) » / "Indicative: … (R.431-2, a)". |
| R7 | L | The offer label's value was a preformatted string (« 11.5 m » in French too). | `params: { value: <number>, unit }`, phrase "Confirm {value} {unit}": the host's ICU formatter writes « Confirmer 11,5 m ». The walk still reads « Confirm 22 m ». |
| R8 | L | `max_height` stated a relative limit as `top + headroom` even when no top was measured (`NaN`). | Said as not checked. |
| R9 | L | `checkVariation` returned its checks uncapped; the host refuses more than 1,000 whole. | Capped at `HOST_LIMITS.checks`, as `fitted` caps a read's. |
| R10 | L | `floorToFloor`'s comment still said the SDK's `Level` holds no height. | Corrected. |
| T1 | — | Criterion 6 compared the offer's section with Confirm's but not the guard. | The test asserts Confirm's `expected` is the section the answer saw. |

**Tests**: `node --test 'fr-urban-rules/tests/*.test.mjs'` **349 pass** (347 +
two review tests: R2/R3, R4); criteria 5–7's tests updated for R1 and R7.
Services untouched (127 pass). `tools/build-index.mjs` rebuilt `dist/` (0.8.0),
`tools/check-index.mjs --platform ../archisimple`: 2 of 2 accepted. The walk
(`fr-assistant-questions`) re-run: **2 passed**; `lyon-3-max-height` now reads
« No confirmed height limit applies here; the tightest rule to confirm gives
22000 mm », Brouennes' relative claims « where the distance is tightest », the
**Confirm 22 m** card approved as before (`lyon-5`), pictures read.

**Open, not fixed (recorded).**

- The storey count read from `floorAreas` counts every storey the measure
  answers, a substructure or a split level included — the SDK marks neither. The
  storeys *added* are right; `storeyLimit`'s total, compared with a programme's
  storeys, may count a basement.
- Heights are measured from the lowest ground at the foot for every rule (the
  checks' own `height-lowest-ground` assumption), not "as each rule's measuring
  point says" (DEC-2's wording): consistent with the checks, said by them.
- R.111-17 failing on both its floor and its rise, the check shows the larger
  shortfall; when that is the rise, the floor's share is not said separately
  (the claim says the limit is already exceeded).
- `georisques.gouv.fr` is the listed host; whether the browser follows a
  redirect to `www.georisques.gouv.fr` was not checked.
