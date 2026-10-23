# Sprint 002.9 — Design-Time Acceptance FR

> **Status:** **Closed (2026-10-22)** — committed (`5808887`), deployed to
> the NAS, and closed by the owner with the
> [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md) Phases 2–3
> and the platform's Site Regulations milestone: _"you can close phase3. it
> works for the moment and has been deployed to the NAS. Choosing another
> model is another piece of work that will be done later on on the AI revamp
> milestone"_. The production model, its key and the two acceptance
> recordings (criteria 3 and 4's recorded half) are **deferred to the AI
> revamp milestone**, not done; the hand check against the PDFs and DEC-5's
> local Docker lines are **not recorded as done**. See
> [Closure (2026-10-22)](#closure-2026-10-22) at the end. _(Read "Locally
> walked (2026-10-21, uncommitted); owner steps pending — the hand check
> against the PDFs, the production model and its key, the two acceptance
> recordings, the Docker lines of DEC-5 and the NAS walk" until the close, and
> "Draft (2026-10-19), reviewed against the code 2026-10-20 — nothing
> implemented" until 2026-10-21.)_
>
> **Draft (2026-10-19), reviewed against the code 2026-10-20.** Written from the proposal v2.2, the platform's
> milestone README (§3 "Phases 2–4") and 002.4's acceptance draft, which this
> sprint extends rather than repeats. Reviewed against this repository at
> `1cedc63` and the platform at `78443b9e`, which carry Phases 0–2 (002.5a–
> 002.6b and 096.7–096.8b implemented and walked in the editor). 002.7–002.8
> and the platform's 096.9–096.13 are still drafts; this sprint names them by
> number and is rewritten against what they built when they close. The
> review's changes are listed at the end.
>
> **Repository:** `archisimple-plugins` — package `fr-urban-rules` and the
> companion service `fr-urban-rules-service`.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> §12 Phases 2–3; the platform README's row 002.9: "the joint walk with
> 096.14, on recorded fixtures". Closes Phases 2 and 3 for France.
>
> **Prerequisites:** 002.4 walked (Phase 1: the five plots pinned, their GPU
> answers recorded, the reference designs captured; awaiting the owner's
> look). 002.5a, 002.5b, 002.6a and 002.6b implemented (`fr-urban-rules`
> 0.6.1 — 0.6.0 plus the PLUi-in-sectors fix — and `fr-urban-rules-service`
> 0.2.0); 002.7 and 002.8 implemented. Platform: 096.7–096.8b implemented,
> 096.9–096.13 implemented; **096.14** is walked jointly with this sprint.
> **The owner's production model, and a key for it**, before step 2 (DEC-7).
>
> **Sizes:** fixtures (extraction answers, chapter text), expected values, an
> extension of 002.4's recording script, the walk. No new feature. Medium.

---

# Sprint Design Contract

- [x] **Expected values are written before anything is run.** _Held for
      the acceptance recordings, which do not exist yet:
      `acceptance/expected-002.9.json` was written on 2026-10-21 before any of
      them, and `--acceptance` refuses a plot it does not offer and stamps each
      recording with its sha256. Written by the agent from the committed text
      layer, not by a person: the hand check (step 1) is still the owner's._ §"Expected
      values" is completed and committed by the owner **before** the first
      **acceptance** recording of an extraction answer (DEC-2) and before the
      walk. A value changed after a run is recorded as changed, with the
      reason (002.4's rule). _Review, 2026-10-20:_ a Lyon extraction was
      already recorded by 002.5b (`lyon/extraction/`, `qwen/qwen3-vl-8b`)
      and is in git. It is that sprint's engineering fixture, not this
      sprint's evidence: the acceptance recordings are new ones, made after
      the expectations are committed, in their own folder, and the person
      filling P1 reads the PDF, not 002.5b's `result.json` (said in the
      outcome, since git cannot show it).
- [x] **No live call in any test, model included.** _Held: the services'
      suites now import `services/test-support/no-network.mjs` first (fetch
      and `https.request` refused off 127.0.0.1; `no-network.test.mjs` holds
      every file to it); the package's suites already threw._ Every test reads a
      recorded GPU answer (002.4) **and a recorded 096.7 answer**: the
      service's tests through an injected `ai` client replaying `calls.json`
      (`recorded.test.mjs`'s pattern), the package's through a fake
      companion answering from `result.json` (`written.test.mjs`'s pattern).
      A test replaces `globalThis.fetch` with a function that throws, as
      002.4 criterion 2 does — the package's suites do; **the service's
      suite does not yet**, and this sprint adds it (step 4), throwing for
      every host but `127.0.0.1`, because `ai-client-timeout.test.mjs` talks
      to a loopback server of its own.
- [ ] **Hand-checked means by a person**, against the regulation PDF read at
      the page, not against this package's extraction. _Not yet: every row
      reads `handChecked: false`; the owner's step 1. Still so at the close
      (2026-10-22): committed in `5808887` with `handCheck.state: "pending"`;
      not recorded as done._
- [x] **Nothing extracted is a constraint until confirmed** (proposal §5.2). _Held: the
      walk confirmed the 15 % by its button; no fixture ships a confirmed
      `written` rule._
      The walk confirms explicitly; no fixture ships a confirmed `written`
      rule except `section.json` after the walk.
- [x] **Recorded fixtures carry no personal data** _(only the expected
      values were added; the recordings' metadata holds a hash, never text or a key)_: parcel ids are public
      cadastral identifiers already in 002.4; the service's request log is
      not recorded.

---

# Current state

(Rewritten at review, 2026-10-20, against `1cedc63`.)

- **002.4** committed, per plot, under `test-fixtures/fr-urban-rules/`:
  the GPU and API Carto answers in `<plot>/*.json` (with their `.meta.json`),
  and the captured design in `acceptance/<plot>/` (`site.json`,
  `context.json`, `section.json`, `site-calls.json`, `answers.json`,
  `answers.meta.json`); `tools/record-fixtures.mjs <plot> [--check | --trim]`.
  The plots are 096.6's: Lyon AB0105, Gordes AC0323, Mouzay **AB0415**,
  Brouennes **AB0291**, Rochefort-en-Terre **AB0149** (three changed by
  096.6, with reasons).
- **The règlement text** (002.5a DEC-12): `lyon/regulation/` and
  `gordes/regulation/` — `meta.json` (GPU id, partition, `idurba`, `nomfic`,
  **sha256 of the PDF**, bytes, pages, ETag, retrieval date, recorded
  pages), `outline.json`, `pages.jsonl` (the chapter's pages, one line per
  PDF page, no markers). Made by
  `services/fr-urban-rules-service/scripts/record-fixture.mjs` from a PDF on
  disk; **the PDFs are not committed; the chapter text is**, and is pushed
  (the licence question is DEC-8's).
  - Lyon: `200046977_reglement_20260326.pdf`, 803 pages, 11 059 057 bytes;
    UCe1 at PDF pp. 121–144 by the outline (« Zone UCe1 »).
  - Gordes: `84050_reglement_20220411.pdf` (a 2022 file under the 2024
    `idurba` `84050_PLU_20241017`), 60 pages, **no outline**; zone A at PDF
    pp. 44–51 by the contents page (« ZONE A … 43 », so printed = PDF − 1;
    `chapter.test.mjs`).
- **One extraction is recorded** (002.5b DEC-11): `lyon/extraction/`
  (`calls.json` — each 096.7 call's chunk, attempt, base offset and text
  length, never the text or a key, with the response verbatim — and
  `result.json`), by `node tools/record-fixtures.mjs lyon --extraction`,
  live, on 2026-10-20, against a local ai-service on LM Studio
  `qwen/qwen3-vl-8b` (chunks of 8 000 characters), then replayed through
  promptVersion 2's post-validation. It holds 32 rules: pleine terre ≥ 15 %
  (p. 133), footprint not regulated (p. 128) and see graphic (p. 128), the
  UCe1b 4 m side and rear setback (p. 126), thirteen low-confidence
  « Parking » rules, and **no written height rule** — so on it the drawn
  22 m stays `height_total` (`src/index.js:7142`: the relabel needs a
  `height_facade` `see_graphic` rule). Gordes has no extraction recorded.
- **How a recording is replayed:** `recorded.test.mjs` feeds `calls.json`'s
  responses to `extractChapter` in order, asserting each chunk's **text
  length** equals the recorded one, and compares the rules with
  `result.json`; `written.test.mjs` serves `result.json` from a fake
  companion. There is no request hash: a changed instruction text of the
  same length, or a changed schema, is not detected by the replay.
- **`--check --extraction`** re-runs the extraction live (a model call) and
  prints the rules added and removed; nothing checks the PDF's hash or the
  chapter's pages without a model call.
- **The tool talks to an ai-service URL directly**
  (`ARCHISIMPLE_AI_SERVICE_URL`, default `http://127.0.0.1:4321`): it runs
  the service in-process and has no basic-auth support, so it cannot record
  through a deployment's Caddy. It records against a local ai-service.
- **The extension's wording** (`resources/i18n/fr-urban-rules/`): the button
  is « Read the written rules » / « Lire les règles écrites », and without
  the service « Reading the written regulation is not available on this
  deployment: the regulation opens at its first page. »
- **Phase 2 walked in the editor** (platform README §9,
  `tools/e2e/specs/regulationsPhase2.spec.ts`): Lyon's link at p. 121, the
  extraction's progress, the 4 m setback confirmed, saved, reloaded, and the
  gateway stopped.
- Live (2026-10-19, read-only, recorded in 002.10's probe):
  - Lyon's current document is `200046977_PLUi_20260326`, GPU id
    `4f3ddc27a9611b4bc94fa161443b8e86`, partition `DU_200046977`; API Carto's
    `zone-urba` gives `idurba` `200046977_PLUI_20260326` (**case differs**:
    `PLUi` vs `PLUI`; the service matches case-insensitively,
    `fetcher.test.mjs`).
  - Gordes' current document is `84050_PLU_20241017` (GPU id
    `703e6c2a3130ed9396d8100fde318c2e`).
  - Rochefort-en-Terre: `is_rnu: false`, no document, partition
    `DU_56196` empty.

---

# Goal

The two plots with a règlement on the GPU (Lyon, Gordes) give, from the
document's own bytes through the companion service and a **recorded**
extraction, the values a person read in the PDF; the three without one
(Mouzay, Brouennes, Rochefort) give no extraction and say why; and the
design-time surfaces (envelope, sheet, variation figures, assistant) carry
those values. The joint walk with 096.14 closes Phases 2–3.

# Out of scope

- Any new rule kind, source or surface. A defect of 002.5a–002.8 is fixed
  here; anything new is its own sprint.
- Phase 4 (002.10): watching for new versions, Géorisques v2, national
  coverage.
- The platform's own walk of the deployment (096.14 DEC-4–DEC-6). This
  sprint walks the package's side of it: the service's routes, its
  allow-list, its cache.
- Model quality beyond the five plots. Two documents are an acceptance set,
  not an evaluation.

---

# Decisions

## DEC-1 — The five plots, with their Phase 2–3 role

As 002.4 DEC-1, pinned there. What each proves here:

| # | Plot | Extraction | Design-time |
| --- | --- | --- | --- |
| P1 | Lyon 2e `69382000AB0105`, UCe1b | **Yes**: the UCe chapter of a city PLUi | envelope (drawn 22 m), sheet, assistant, the PDF at the zone's page |
| P2 | Gordes `84050000AC0323`, A | **Yes**: zone A of a small PLU (no outline: the contents page); extension and annex caps | sheet with the AC2 flag; surfaces against the existing building |
| P3 | Mouzay `AB0415` | **No**: carte communale, no règlement | envelope from coded rules |
| P4 | Brouennes `55083000AB0291` | **No**: RNU | variation figures (1 / 0 issues) |
| P5 | Rochefort-en-Terre `AB0149` | **No**: not on the GPU | sheet says so; the assistant declines to cite a rule |

## DEC-2 — What is recorded for extraction

Per plot with a règlement (Lyon, Gordes), in two places that already exist
(review, 2026-10-20 — the draft's `document.meta.json`,
`extraction.request.json` and `extraction.response.json` were never built):

- **`test-fixtures/fr-urban-rules/<plot>/regulation/`** (002.5a DEC-12),
  already committed for both: `meta.json` (GPU id, `idurba`, `nomfic`,
  **sha256 of the PDF**, pages, ETag, retrieval date), `outline.json`,
  `pages.jsonl`. The PDF itself is **not** committed. This sprint re-records
  it only if step 1's hand check finds the PDF changed.
- **`test-fixtures/fr-urban-rules/acceptance/<plot>/extraction/`** — new,
  this sprint's: `calls.json` and `result.json` in 002.5b's format, made
  **after** the expectations are committed, with the production model
  (DEC-7). 002.5b's `lyon/extraction/` stays as it is, that sprint's
  engineering fixture, and its tests keep asserting on it.

**Two fields are added to each call's request metadata** (taken on the
owner's behalf, 2026-10-20, reversible): `textSha256` (of the chunk's text —
a hash, never the text) and `promptVersion`. The acceptance replay asserts
both beside `textLength`, so a change of chunking, of the text layer or of
the instructions fails the test loudly, with the recording command to run,
until the owner re-records. 002.5b's recording, which lacks them, is
replayed as today (text length only).

The replay is the existing one, not a new fake: the service side feeds
`calls.json`'s responses to `extractChapter` (`recorded.test.mjs`'s pattern)
and compares with `result.json`; the package side serves `result.json` from
a fake companion (`written.test.mjs`'s pattern) and asserts the report.

## DEC-3 — Recording, by hand

`tools/record-fixtures.mjs` (002.4 DEC-4; `--extraction` since 002.5b
DEC-11) gains two options (taken on the owner's behalf, 2026-10-20,
reversible):

- **`--acceptance`**, with `--extraction`: writes to
  `acceptance/<plot>/extraction/` instead of `<plot>/extraction/`, and adds
  DEC-2's two fields. The rest is 002.5b's: the companion service runs
  **in-process**, fetching the PDF through its own fetcher (so the host
  allow-list is exercised), against the live GPU and the ai-service at
  `ARCHISIMPLE_AI_SERVICE_URL`.
- **`--no-model`**, with `--check --extraction`: fetches the document
  through the service's fetcher, finds the chapter, and compares the PDF's
  sha256 and the chapter's pages with the stored `result.json` (and
  `regulation/meta.json`), **without calling a model**. Criterion 7 uses it.
  `--check --extraction` without it keeps 002.5b's behaviour (a live
  extraction, rules added and removed printed, nothing written).

**Where the model is:** the tool calls an ai-service URL directly and has no
basic-auth support (Node's `fetch` refuses credentials in a URL), so it
cannot record through the NAS's Caddy. It records against a **local**
`apps/ai-service` configured with the production provider (DEC-7), its key
in the local environment, never in a file in this repository. Never imported
by a test.

## DEC-4 — How an extraction is judged

Per extracted rule, against §"Expected values":

- **kind** and **limit** must match exactly (value, unit, base);
- **page** within the expected range;
- **passage**: the expected passage's key phrase occurs in the quoted
  passage (normalised whitespace and ligatures), not an exact match;
- **conditions / exceptions**: each expected one present; extras listed,
  not failed;
- a rule the expected table says **not regulated** must come back as a rule
  stating so, with its passage — never as an absent rule.

A recorded response that fails these is not "fixed" by editing the response:
either the expectation was wrong (recorded as changed, with the reason) or
002.5a–b / 002.6a–b has a defect.

## DEC-5 — The joint walk with 096.14

One session, the owner and both checklists, on the owner's deployment (096.14
DEC-4 run 2, **[owner]**), after the agent's local walk in the editor
(Chromium, `pnpm dev:web` with a local gateway and ai-service, as the
platform README §9 walk ran, **[agent]**):

1. **Pinned package** (096.14 DEC-6): the card reads "From this deployment",
   lists the hosts the package's browser code contacts (002.8's
   `network.hosts`) and names the companion as "this deployment's service",
   without its hosts (096.13 DEC-7).
2. **P1 Lyon:** Read; « Read the written rules » (« Lire les règles
   écrites »), its progress; the `written` rules appear to confirm with page,
   passage, conditions; the PDF opens at the zone's page (p. 121); confirm
   pleine terre 15 % and the drawn 22 m; the envelope in 3D; the sheet
   printed; the assistant asked "can I add a storey?" and "what green space
   must I keep?".
3. **P2 Gordes:** extraction; the extension cap measured against the
   existing building; the AC2 flag on the sheet.
4. **P3–P5:** extraction not offered, with the reason; P4's variation
   comparison; P5's sheet.
5. **The service down** (`docker compose stop plugin-services`): the zone
   reads « Reading the written regulation is not available on this
   deployment: the regulation opens at its first page. »; confirmed written
   rules stay checked from their stored citation; Phase 1 reading continues.
6. **Isolation probe** (096.8a DEC-4a, the guide's commands): from inside
   the `plugin-services` container, `wget -qO- http://web/api/share/v1/…`
   answers **403**, and `share-service` does not resolve; recorded with the
   commands used.

Each line is written in this outcome and in 096.14's with the same words.
Steps 1, 5 and 6 need Docker and are the owner's (no Docker on the
development machine on 2026-10-20); 2–4 are walked by the agent locally
first, then by the owner on the NAS (096.14 DEC-9 Q4: Lyon and Rochefort
live, the rest from the agent's pictures).

## DEC-6 — Who does what (review, 2026-10-20)

Taken on the owner's behalf (2026-10-20), reversible.

- **[owner]** step 1's hand check (a person, against the PDF — the
  contract); the production model and its key (DEC-7); the NAS walk; the
  Docker-only lines of DEC-5.
- **[agent]** everything else: the recording tool's two options (DEC-3),
  the acceptance recordings once the key is given (run locally), the tests,
  the local walk, the index, the documents.

## DEC-7 — The model that records (review, 2026-10-20)

Taken on the owner's behalf (2026-10-20), reversible. The acceptance
recordings are made with **the model the NAS will use in production**, so
the walk's live run and the recording can agree. Recommended: a hosted
capable model through ai-service's `openai` provider (the platform has no
other hosted provider; `openai-compatible` reaches another host). The 8 B
local model (`qwen/qwen3-vl-8b`) stays the development model: on Lyon it
found no written height rule and listed thirteen low-confidence parking
limits. **Until the owner names the model and supplies a key, step 2 is
blocked**; steps 1, 3's scaffolding and 4–5 can proceed.

## DEC-8 — The committed chapter text (review, 2026-10-20)

Taken on the owner's behalf (2026-10-20), reversible. 002.5a committed and
pushed `pages.jsonl` for Lyon and Gordes (quoted regulation text), leaving
the licence to this sprint. It stays committed: the repository is private,
the text is a public planning document published on the GPU (Etalab Licence
Ouverte 2.0 assumed, proposal §4.3), and the tests need it. Checked again
before any public release of this repository; if the licence does not hold
then, the text leaves the repository and only the hashes stay.

# Expected values

**Completed 2026-10-21, before any acceptance recording**, in
`test-fixtures/fr-urban-rules/acceptance/expected-002.9.json` — the file the
tests and `--acceptance` read (per row: kind, statement, sector, the exact
limit forms, the PDF page range, the key phrase, the expected conditions, and
`handChecked`). The `☐` below are filled from the règlements' committed text
layer (`<plot>/regulation/pages.jsonl`, the PDF's own text) by the agent,
**not by a person**: each awaits the owner's hand check against the PDF
(step 1). Values changed from the draft say so, with the reason.

## P1 — Lyon 2e, UCe1b (`200046977_PLUi_20260326`)

| Item | Expected | Source of the expectation |
| --- | --- | --- |
| Document | GPU id `4f3ddc27a9611b4bc94fa161443b8e86`; file `200046977_reglement_20260326.pdf` via `/document/{id}/files/{nomfic}` | probe 2026-10-19; proposal §4.3 |
| Zone chapter (outline) | **UCe1, PDF pp. 121–144** (outline entries « Zone UCe1 » p. 121, « Zone UCe2 » p. 145); printed page = PDF page − 2 | 002.5a's probe (`lyon/regulation/outline.json`, `chapter.test.mjs`); proposal §15 |
| Rule articles | within PDF pp. 121–144: implantation 2.1–2.3 pp. 124–128, emprise 2.4 p. 128, hauteur 2.5 pp. 129–131, pleine terre 3.2 p. 133, stationnement 5.2 pp. 142–143 (the brief's "pp. 131–140" is not borne out) — _hand check_ | pages.jsonl |
| `green_ratio` | **pleine terre ≥ 15 %**, base `plot_area` (a value in percent accepted too), `written`, `to_confirm`; **p. 133, §3.2.1**, « Le coefficient de pleine terre* est au minimum de 15% »; the public-facilities carve-out as an exception — _hand check_ | pages.jsonl |
| `footprint_ratio` | **not regulated**: a `written` rule with `statement: 'not_regulated'` (096.2), with its passage; Surfaces shows "not regulated" and still the figures (US-06) | brief; 002.3 step 10 ("CES not regulated") |
| `height_facade` | a written `height_facade` `see_graphic` rule (art. 2.5.1.1 a, **p. 129**, « La hauteur de façade* maximale des constructions figure aux documents graphiques »), and so the drawn 22 m (« Hauteur Max-22 », 002.4 P1) relabelled from `height_total` (002.6b DEC-5, `src/index.js:7142`); the written rule defers to the drawn one, never overrides it. _002.5b's 8 B recording has no such rule (Current state): if the acceptance recording has none either, this row fails and DEC-4 decides whether the expectation or the extraction is wrong_ | proposal §5.2; 002.6b |
| `road_setback`, `boundary_setback`, `building_distance` | road: **described**, no value (« implantées en limite de référence* ou en limite de la marge de recul* », p. 124 §2.1.1); boundary UCe1b: **≥ 4 m** in the secondary band (p. 126 §2.2.1.2 b), on both side boundaries in the main band (p. 125, described); building distance UCe1b **≥ 4 m** (p. 127 §2.3.1); UCe1a's rows are another sector — _hand check_ | pages.jsonl |
| `parking` | **no number in this chapter** (5.2.1 refers to Part I); 5.2.2.1 says where places go (underground in sectors Aa…C); a numeric parking limit from this chapter fails (`forbidden`) — _hand check_ | pages.jsonl |
| Not on the sheet as "compliant" | — | proposal §5.3 |
| The two "15 %" | emprise used 15 % of the plot (measured, 002.3 criterion 3) is shown apart from pleine terre ≥ 15 % (limit); tests assert on kind and role | 096.14 DEC-2 |
| Envelope (3D) | from confirmed rules only: the drawn 22 m and, if confirmed in the walk, the setbacks; applied / not applied / assumptions listed | US-04 |
| Assistant, "can I add a storey?" | _changed (002.8 decision 1)_: room for a storey; cites « Hauteur Max-22 » (`height_total` without a written see-graphic façade rule) and the measured **12.087 m**; the storey height is **the design's own 3 m**, said as taken, not an assumption; to confirm only: « No confirmed height limit applies here; the tightest rule to confirm gives 22000 mm » and **Confirm 22 m** | 002.8 |
| Assistant, "what green space must I keep?" | _changed_: no question tool covers green space (002.8's four); the live model answers from the context fragment (kind, limit, page; no passage) — walked live by the owner, not tested | 002.8 DEC-1 |
| The two "15 %" (re-derived) | emprise **150.0 m²** measured = **12.7 %** of 1 183.3 m² (no longer 002.3's 179.4 m², 15 %); pleine terre ≥ 15 % → **177.5 m²** required once confirmed, open ground **1 033.3 m²** measured | 002.4, 002.7 |

## P2 — Gordes, zone A (`84050_PLU_20241017`)

| Item | Expected | Source |
| --- | --- | --- |
| Document | GPU id `703e6c2a3130ed9396d8100fde318c2e`; file `84050_reglement_20220411.pdf`; zone `datvalid` 2022 under the 2024 `idurba` (both stored) | probe; `gordes/regulation/meta.json`; proposal §4.3 |
| Zone chapter | **zone A, PDF pp. 44–51** by the contents page (no outline; « ZONE A … 43 », printed = PDF − 1); A 2 pp. 44–45, A 6 p. 47, A 7–A 10 p. 48 — _hand check_ | 002.5a; pages.jsonl |
| `extension_max` | **≤ 30 % of the existing dwelling's surface de plancher** (ratio, base `surface_de_plancher`), **within 250 m² in all** (p. 45, A 2 3-), outside the PPRIF red zone (inside it, the table: 30 % within 140 m² / +20 m² / +10 % within 250 m²); not the proposal's example caps — _hand check, and whether AC0323 is in the red zone_ | pages.jsonl |
| `annex_max` | **≤ 30 m² per annex** (floor area, A 2; emprise, A 9 p. 48), three at most, within 20 m; annexes **4.50 m** at the ridge — _hand check_ | pages.jsonl |
| `height_total` | **8.50 m at the ridge** and **7 m at the eaves** (`height_facade`) for dwellings, 10 m for other buildings (p. 48, A 10); also side setback **≥ 4 m** (A 7), roads 75 / 25 / 15 / 10 m from the axis (A 6), building distance **not regulated** (A 8), dwelling emprise **≤ 250 m²** (A 9) — _hand check_ | pages.jsonl |
| Extension check | _changed_: the extension measures **30.0 m²** (002.4 P2; the draft's « 6 × 7 m » is not the committed design) against an existing emprise of 144.04 m²; the written cap is a share of the **floor area**, which the reference design (no roof: 0 m² of surface de plancher) cannot measure → **not checked, the base named** (« the floor area »); a share of the existing emprise would read 43.2 m², no issue | 002.4; 0.8.1 |
| Sheet | AC2 site inscrit flag; the extension cap's line | US-09 |

## P3–P5

| Plot | Expected |
| --- | --- |
| P3 Mouzay | No extraction offered and **no request to the companion**; the Rules view says « No written regulation to read: a carte communale has no règlement, so the national rules (RNU) listed here apply. » (_changed_: 0.8.1 adds it — the draft named no sentence, and the package showed only the regime); envelope from R.111-16/17, **550.9 m²** of ground |
| P4 Brouennes | No extraction offered, no request; « No written regulation to read: no local plan applies here, so the national rules (RNU) listed here apply. »; envelope **1 264.2 m²**; master **1** potential issue (R.111-17 edge 2, **2.500 m / ≥ 4.469 m**), the parked variation (house moved 3.5 m) **0** (**5.814 m / ≥ 4.543 m**), both **2 of 5** rules checked |
| P5 Rochefort | No extraction offered, no request; « Plan not on the GPU… » and « This plan is not on the GPU: ask the town hall for the règlement… »; the sheet's one notice « Plan not available on the Géoportail de l’Urbanisme: no local rule is presented. »; flags **AC4 (abf)** and Géorisques' national ones (_changed_: seismic, radon, the commune's risks are on every plot); the entered 10 m checked 7.93 m, no issue; the assistant cites nothing before a rule is entered (`question.notPublished`) and, once the walk's 10 m is entered, answers from it (_changed_) |

---

# Steps

1. **[owner] Hand check** (a person): open each règlement at the zone's
   chapter (Lyon PDF pp. 121–144, Gordes pp. 44–51); fill the `☐` with
   value, page and the key phrase of the passage, without reading 002.5b's
   `result.json`; compare the PDF's sha256 with `<plot>/regulation/meta.json`
   and record the date. **Commit the expectations.**
2. **[agent, once the owner has named the model and given a key] Record**
   with `node tools/record-fixtures.mjs <lyon|gordes> --extraction
   --acceptance` (DEC-3) against a local ai-service on the production
   provider (DEC-7). Commit the fixtures, after the expectations (git order).
3. **[agent] End-to-end tests**, one per plot, from recorded GPU answers +
   the acceptance extraction → the report → asserted against the tables,
   using DEC-4's judgement; the service-side replay asserting
   `textLength`, `textSha256` and `promptVersion` per call (DEC-2). Mouzay,
   Brouennes, Rochefort assert that no extraction request is made at all.
4. **[agent] Service tests**: a throwing `globalThis.fetch` (loopback
   excepted) installed for `services/*/tests` (the contract). The rest
   exists and is named, not rewritten: the allow-list and its redirects
   (`fetcher.test.mjs`), `idurba` matched case-insensitively and the sector
   partition asked by `grid` (`fetcher.test.mjs`, 0.6.1), the limits
   (`service.test.mjs`, `jobs.test.mjs`), the document cache keyed by
   `upper(idurba)/nomfic` (002.5a DEC-5) and the extraction cache by
   document and chapter pages (002.5b DEC-3).
5. **[agent] Index**: `build-index.mjs` and `check-index.mjs --platform
   ../archisimple` against a platform with 096.12 (SDK 1.32, which the
   package declares since 002.8).
6. **The joint walk** (DEC-5): the agent's local walk, then the owner's.
7. **[agent] Close**: outcome, the proposal's status line (the owner's edit),
   the README and `CLAUDE.md` (the capability table's SDK line to 1.32; the
   companion service is already described), and 096.14's outcome in the same
   words.

# Acceptance criteria

1. The expected-value tables are complete and committed before the first
   acceptance recording (git history shows the order; the outcome says
   002.5b's recording was not read by the hand checker).
2. `node --test 'fr-urban-rules/tests/*.test.mjs'` and
   `node --test 'services/*/tests/*.test.mjs'` pass with no network: the
   throwing `fetch` is installed for both (loopback excepted in the
   services').
3. P1: every row of its table holds on the acceptance recording, by DEC-4;
   pleine terre 15 % and "footprint not regulated" are `written` rules with
   their passage and page.
4. P2: every row holds; the extension cap is measured against the existing
   building, with its base named.
5. P3–P5: no extraction request reaches the fake companion (asserted), and
   each states its reason.
6. A replayed call whose `textLength`, `textSha256` or `promptVersion`
   differs from the recording fails the test with the recording command to
   run (DEC-2).
7. `record-fixtures.mjs <plot> --check --extraction --no-model` on the walk's
   day reports the PDF hash and the chapter's pages unchanged, or each
   difference explained (a new GPU version, 002.10's territory).
8. The walk's six lines (DEC-5) recorded, in the same words as 096.14;
   those not walked (the Docker ones, if the owner has not run them) said so.
9. `dist/index.json` lists `com.archisimple.fr-urban-rules` at 002.8's
   version with `sdkVersion` 1.32; `check-index.mjs` reports no issue.

# Testing strategy

- **End-to-end on recorded inputs**, one per plot, both suites.
- **Recorded model answers only**; the live model only in
  `record-fixtures.mjs --extraction` (recording, or `--check` without
  `--no-model`) and the walk.
- **Manual:** the joint walk — the agent locally, the owner on the NAS.

# Risks

- **A new document version** between step 1 and the walk (Lyon published 25
  versions since 2022). The PDF's sha256 changes; expectations are re-read
  for the changed pages only, with the reason.
- **Prompt or schema change after recording** breaks the replay's
  `textSha256` / `promptVersion` match by design (DEC-2); the owner
  re-records, which costs model calls.
- **Licence of the PDF text.** `pages.jsonl` quotes the règlement and is
  already pushed (002.5a). DEC-8 keeps it, private, rechecked before any
  public release.
- **No production model yet.** Step 2 waits for it (DEC-7).
- **Model variation across providers.** The recording is from one provider;
  a deployment using another may differ. The walk's live run shows it.

# Questions for the owner

All three **taken on the owner's behalf (2026-10-20), reversible**; what
stays his is naming the production model and supplying its key.

1. **Which model records the fixtures** — the provider the NAS will use in
   production, recorded through a local ai-service (DEC-7). Recommended: a
   hosted capable model.
2. **May `pages.jsonl` be committed** — it already is (002.5a); kept (DEC-8).
3. **Gordes' caps** — step 1 reads zone A cold (PDF pp. 44–51), unless the
   owner knows the text.

# Definition of Done

Expectations committed before recordings; the criteria walked; the two
extractions judged by DEC-4; the joint walk recorded here and in 096.14; the
index green.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| 002.4 | The pinned plots, GPU fixtures, captures, `record-fixtures.mjs` |
| 002.5a | The companion service: gateway, fetcher, allow-list, chapter lookup, document cache |
| 002.5b | Extraction jobs, result cache by document and chapter, `record-fixtures.mjs --extraction` |
| 002.6a | The zone page link |
| 002.6b | `written` rules in the report with page, passage, conditions |
| 002.7 | Envelope volume and sheet content |
| 002.8 | Assistant tools, per-variation checks, the network list on the card |
| 096.7 | The structured-output route (ai-service contract **1.2.0**) |
| 096.8a | Landed: `/plugins-api/com.archisimple.fr-urban-rules/` behind the deployment's auth (ADR-0114), the `plugin-services` compose profile, the container's isolation (subnet deny on `/api/share/`) |
| 096.8b | `RegulationSource.onDidChange` (002.6b's progress) |
| 096.9–096.13 | The platform surfaces; SDK **1.32** (096.14 Current state) |
| 096.14 | The joint walk and its deployment |

**Version needs:**

- **Package `fr-urban-rules`:** none of its own; it ships at the version
  002.8 leaves — **0.6.1** today (002.6b's 0.6.0 plus the PLUi-in-sectors
  fix), then the next two minors, **0.7.0** (002.7) and **0.8.0** (002.8),
  as those sprints' reviews state them — declaring `sdkVersion` **"1.32"**.
  A defect fixed here is a patch (0.8.x). (Restated at review, 2026-10-20;
  the draft's 1.1.0–1.3.0 line is withdrawn: 1.0.0 stays the first
  published version.)
- **`fr-urban-rules-service`:** the version 002.5b leaves (**0.2.0**,
  unchanged by 0.6.1's fetcher fix); a patch for a defect, or for DEC-3's
  recording fields if they touch the service's `onCall`.
- **Platform:** none (096.14 records the final values).

---

# Corrections to the README / proposal

1. **Proposal §4.5 gives UCe as pp. 118–158; the brief gives the rules at
   pp. 131–140.** 002.5's (now 002.5a's) probe of the outline settles the chapter: UCe1 is
   PDF pp. 121–144 (printed = PDF − 2). Step 1 confirms each article's page
   within it. Recorded in the proposal's §15 at the reconciliation.
2. **`idurba` case.** The GPU document API and API Carto's `document` give
   `200046977_PLUi_20260326`; API Carto's `zone-urba` gives
   `200046977_PLUI_20260326`. Proposal §8's "a confirmation whose `idurba` no
   longer matches reopens its rule" must compare case-insensitively, or every
   Lyon confirmation reopens on a casing difference.
3. **The proposal's §5.4 example caps** ("≤ 30 % … ≤ 50 m²") read like
   Gordes' values in 002.4's P2 table. They are examples; Gordes' are read in
   step 1.
4. **Proposal §12 Phase 2–3 "not drafted"** is stale.
5. **"15 %" twice on Lyon** (096.14 DEC-2): measured emprise vs pleine terre
   limit; the mockup and US-06 should name the role beside the figure.

# Reconciliation (2026-10-19, phases 2–4)

- Status and Prerequisites: "096.9–096.8" (a renumbering artefact) reads
  096.7–096.13.
- DEC-2, criterion 2: the service's fixtures live under
  `test-fixtures/fr-urban-rules/<plot>/{regulation,extraction}/` (002.5a
  DEC-12, 002.5b DEC-11, Phase 2 review 2026-10-20; this replaced
  `services/fr-urban-rules-service/tests/fixtures/`); pages are PDF page
  indexes, with no markers in the text.
- DEC-5 step 1: the card lists the browser's hosts and names the companion
  as "this deployment's service" (096.13 DEC-7, 002.8 DEC-9), not as a host.
- P1 table: Lyon's chapter is UCe1, PDF pp. 121–144 (printed = PDF − 2), from
  002.5a's outline probe; `footprint_ratio` is a `not_regulated` statement;
  the drawn 22 m is `height_facade` after 002.6b's relabel.
- Step 5, Dependencies, Version needs: SDK **1.32**; package **1.3.0**;
  service **0.1.0**; the route names the package id.
- Correction 1 resolved; correction 4 (proposal §12) applied.

# Review (2026-10-20, Phase 2) — references only

- 002.5 is split into 002.5a (Service Gateway and Document Text) and 002.5b
  (Extraction Jobs). 002.6 is split into 002.6a (Zone Page Link) and 002.6b
  (Written Rules Confirmation). 096.8 is split into 096.8a (Plugin Service
  Deployment) and 096.8b (Regulation Source Signal). References are updated
  to name the half they mean.
- **DEC-2's fixtures** move to
  `test-fixtures/fr-urban-rules/<plot>/{regulation,extraction}/`. There are
  no `[p. N]` markers. 002.5b records Lyon itself, so this sprint records
  Gordes and any further plot.
- **DEC-5 gains the isolation probe** (096.8a): 403 on `/api/share/` from
  the container.
- **Versions** are restated from 0.4.0: 002.6a is 0.5.0, 002.6b is 0.6.0,
  and the service is 0.2.0 after 002.5b. This sprint's package line awaits
  its own restatement.

# Review (2026-10-20, against the code)

Reviewed against this repository at `1cedc63` and the platform at
`78443b9e` (Phases 0–2 pushed). What changed in this draft:

- **Status, Prerequisites:** 002.5a–002.6b implemented, `fr-urban-rules`
  0.6.1, service 0.2.0; the production model is a prerequisite of step 2.
- **Contract:** the first box admits that 002.5b already recorded Lyon
  before any expectation, and separates that engineering fixture from this
  sprint's acceptance recordings; the second names the real replay (an
  injected `ai` client, a fake companion), and the service suite's missing
  throwing `fetch` (loopback excepted).
- **Current state rewritten:** the real fixture layout
  (`<plot>/regulation/`, `<plot>/extraction/`, `acceptance/<plot>/`); what
  the 002.5b recording holds — no written height rule, so the drawn 22 m
  stays `height_total` on it; Gordes has no outline (contents page, PDF
  pp. 44–51); the replay matches by text length only; the tool cannot
  record through Caddy; the extension's real wording.
- **DEC-1:** the three parcels 096.6 changed.
- **DEC-2, DEC-3:** the draft's file names were never built; the acceptance
  recordings go to `acceptance/<plot>/extraction/` in 002.5b's format, with
  `textSha256` and `promptVersion` added; `record-fixtures.mjs` gains
  `--acceptance` and `--no-model`; it records against a local ai-service.
- **DEC-5:** the real button and notice; `docker compose stop
  plugin-services`; the isolation probe's commands; who walks what.
- **DEC-6–DEC-8 (new):** who does what; the recording model; the committed
  chapter text.
- **Expected values:** 002.5a's probe named; the height row's dependency on
  the recording; Gordes' document file and chapter; Brouennes' limit is
  4 469 mm, not 3.00 m.
- **Steps, criteria:** agent / owner; the real test globs; criterion 6 on
  the replay's fields; criterion 7 without a model call; six walk lines.
- **Questions:** all three taken; the model and its key stay the owner's.
- **Versions:** 0.6.1 → 0.7.0 (002.7) → 0.8.0 (002.8), kept here.

**Blocks implementation:** 002.7 and 002.8 (and the platform's 096.9–096.13)
must be implemented first; step 2 needs the owner's production model and
key; step 1 is a person's. The plugins repository's uncommitted
`service.test.mjs` fix (npm 10's empty `@napi-rs` folder) should be
committed before this sprint's gates, or `publish-index.yml` fails again.

# Outcome (2026-10-21)

**Locally walked, uncommitted; owner steps pending.** `fr-urban-rules`
**0.8.1** (a patch: three defects, below), `sdkVersion` **"1.32"**,
capabilities unchanged; `fr-urban-rules-service` **0.2.1** (a patch: DEC-2's
two recording fields in `extractChapter`'s `onCall`). Built against the
platform's uncommitted 096.9–096.13 (SDK 1.32, contract 3.20.0, file 25,
ai-service contract 1.2.0) and walked jointly with its 096.14, whose Outcome
says the same in the same words.

## What landed

- **Expected values** — `test-fixtures/fr-urban-rules/acceptance/expected-002.9.json`
  (and the tables above): per plot the document, the chapter, the extraction's
  `required` rows (kind, statement, sector, exact limit forms, PDF page range,
  key phrase, expected conditions), `alsoAccepted` and `forbidden` rows, and the
  design-time rows re-derived after 002.7 and 002.8. **Written by the agent
  from the committed text layer** (`<plot>/regulation/pages.jsonl`), not by a
  person, before any acceptance recording; every row reads `handChecked:
  false` and `handCheck.state: "pending"` — step 1 is the owner's. The agent
  had read 002.5b's `recorded.test.mjs` (which quotes the 4 m setback and
  « not regulated » on pp. 126 and 128) before writing them; it did not read
  `result.json` for them. Said here because git cannot show it.
- **Recording tool** (`tools/record-fixtures.mjs`, DEC-3): `--extraction
  --acceptance` writes `acceptance/<plot>/extraction/`, each call's metadata
  adding `textSha256` and `promptVersion`, `calls.json` stamped
  `acceptance: true` and the `expectedSha256` of the expectations it was made
  against; it refuses a plot the expected values offer no extraction for, and
  prints DEC-4's judgement after recording. `--check --extraction --no-model`
  fetches the document through the service's own fetcher, finds the chapter
  and compares the PDF's sha256 and the chapter's pages with
  `regulation/meta.json`, the stored result and the expected values — no model
  (`ai` stubbed to throw). Arguments parsed by `recorderOptions`, which refuses
  `--acceptance` without `--extraction` and `--no-model` without `--check
  --extraction`.
- **`tools/acceptance.mjs`** (new, pure): `recorderOptions`, `callMetadata`,
  `replayAi` (text length always; hash and prompt version for an acceptance
  recording or one that carries them; a mismatch is a `ReplayMismatch` naming
  the chunk, the field and `node tools/record-fixtures.mjs <plot> --extraction
  --acceptance`), `judgeExtraction` (DEC-4; both forms of « au minimum de 15 % »
  listed as exact forms; extras listed, never failed; `forbidden` rows),
  `documentDifferences` (idurba compared case-insensitively).
- **Service** (0.2.1): `extractChapter`'s `onCall` record carries the chunk's
  `textSha256` and `promptVersion` (computed only when `onCall` is given).
- **No network in the services' suites**: `services/test-support/no-network.mjs`,
  imported first by every `services/<service>/tests/*.test.mjs` — `fetch` and
  `node:https`' `request` / `get` throw for any host but `127.0.0.1`
  (`ai-client-timeout` and the gateway tests use loopback servers; the
  fetcher's tests pass `http.request` with a lookup onto one, untouched).
- **Tests**: services `acceptance.test.mjs` (16: the expected values against
  the committed text, DEC-2's fields, criterion 6 ×4, DEC-4 ×5 including
  002.5b's engineering recording, which it rightly fails on the façade row,
  DEC-3's options, criterion 7's comparison, and the two acceptance replays —
  **skipped, said, until the owner records**) and `no-network.test.mjs` (2);
  package `designtime.test.mjs` (12: P1 written rows on the acceptance
  recording — **skipped** —, P1 on 002.5b's recording, P1 design time, P2
  written rows — **skipped** —, P2 extension check, P2 sheet, P3–P5 no request
  and the reason, P3 envelope, P4 variations, P5 sheet and assistant).

## Defects found by the expected values, fixed (0.8.1)

1. **A written pleine terre share of the plot area was never checked.**
   « Le coefficient de pleine terre* est au minimum de 15% » comes back as a
   `ratio` of `plot_area` (002.5b's recording does); `surfacesFor` checked only a
   value in percent, so the Surfaces view had no « required » row and the Checks
   no line for it. `greenPercentOf` reads both forms, as `footprintPercentOf`
   already did for the footprint. Walked: confirmed in the editor, Surfaces
   shows « Pleine terre required », the check 1 033.3 m² against 177.5 m².
   Test: `designtime.test.mjs` "P1 Lyon, on 002.5b's engineering recording".
2. **A written extension share of the floor area was dropped from the checks.**
   The cap rules took `value` limits only, so Gordes' « 30 % de la surface de
   plancher … existante » (a `ratio`, base `surface_de_plancher`) was neither
   checked nor listed as not checked, and a value in percent would have been
   read against the existing emprise. `extensionShareOf`: a share of the
   existing emprise or the emprise is checked as an entered one; another base
   is « not checked », « The base of this ratio is not measured ». Test:
   `designtime.test.mjs` "P2 Gordes: the extension cap…".
3. **Nothing said why a carte communale or the RNU offers no extraction**
   (criterion 6, 096.14 criterion 6). The Rules view now carries
   `fr-urban-rules.written.notOffered.cc` / `.rnu` (en and fr). Walked on Mouzay
   and Brouennes; test: `designtime.test.mjs` P3–P5.

## The walk (DEC-5), agent's half — Chromium, 2026-10-21

Editor on its own port (5195) with `ARCHISIMPLE_PLUGIN_SERVICES_ORIGIN`
naming a local gateway (47611, this checkout's `services/gateway`, its own data
folder) that called the owner's running ai-service (LM Studio
`qwen/qwen3-vl-8b`, the development model — used for the walk's live reading,
never for a recording), the package from a local index (47610, `dist/`), a
scripted AI Service (47612) for the assistant. Everything in
`archisimple/tools/e2e/test-results/regulations/acceptance-phase3/`.

1. **Pinned package** — the Docker line: **not walked** (owner). The pinned
   configuration ran on its fixture packages (`playwright.pinned.config.ts`,
   4 passed; `pinned/`).
2. **P1 Lyon** — read; « Read the written rules » → 9 parts → 31 rules read,
   pp. 121–144; the zone link at p. 121 (`phase2/`, re-run: passed); the
   **pleine terre ≥ 15 % of the plot area, p. 133 §3.2.1**, confirmed — one
   undo entry —, saved (a `written` confirmation, `kind: green_ratio`, citation
   p. 133), reloaded confirmed, opened and saved by an editor **without** the
   extension (its section byte-identical), read back confirmed
   (`acceptance/lyon-c4-*.png`, `lyon-criterion4.txt`); the envelope in 3D and
   the sheet (`phase3/`, both themes; PDF 6 pages, PDFKit: no `?`); the
   assistant (`assistant-without-written/`: room for a 3 000 mm storey,
   12 087 mm measured, « Hauteur Max-22 » cited (rule to confirm), **Confirm
   22 m** approved as one undo entry, the stale second offer refused). With the
   8 B reading cached, the assistant offered **Confirm 1 m**: the model read a
   « Total height ≤ 1 000 mm » on p. 135 (`assistant/lyon-1…3`) — the offer
   follows the tightest rule of any status (002.8 DEC-5), so a bad reading
   reaches the offer; model quality, the reason DEC-7 asks for the production
   model. « What green space must I keep? »: no question covers it (above).
3. **P2 Gordes** — read; « Read the written rules » offered; not extracted live
   (no acceptance recording, and the 8 B model's reading would be evidence of
   nothing the owner asked for); the sheet with the AC2 flag and the zone's own
   date (`phase3/gordes-sheet.pdf`).
4. **P3–P5** — no « Read the written rules », and why: Mouzay « No written
   regulation to read: a carte communale has no règlement… », Brouennes « … no
   local plan applies here… », Rochefort « This plan is not on the GPU: ask the
   town hall for the règlement… » (`acceptance/<plot>-why-{dark,light}.png`);
   P4's comparison: master **1 potential issue · 2 of 5 rules checked**, the
   parked variation **No issue among the rules checked · 2 of 5**, and with the
   parked variation open, Checks and the status bar say « no issue among the
   rules checked » (`acceptance/brouennes-across-*-open-dark.png`); P5's sheet:
   « Plan not available on the Géoportail de l'Urbanisme: no local rule is
   presented. », the entered 10 m checked (`phase3/rochefort-sheet.pdf`).
5. **The service down** — `phase2/` half `down`: the notice « Reading the
   written regulation is not available on this deployment », the confirmed
   setback checked from its stored citation: passed. The Docker form
   (`docker compose stop plugin-services`): **not walked** (owner).
6. **Isolation probe** — **not walked** (owner; needs Docker).

**Criterion 7, live, 2026-10-21** — `node tools/record-fixtures.mjs lyon
--check --extraction --no-model` and the same for Gordes (with and without
`--acceptance`): Lyon `200046977_reglement_20260326.pdf`, 803 pages, sha256
`2aee20bf…5920`, chapter « Zone UCe1 » pp. 121–144 (outline); Gordes
`84050_reglement_20220411.pdf`, 60 pages, sha256 `7daad1fb…1eae`, pp. 44–51
(contents) — **no difference** from `regulation/meta.json`, the stored result
or the expected values; no model called.

**A mistake made and undone during the work**: before the tool's new options
were in place, a run of `record-fixtures.mjs lyon --no-model` fell through to
the old argument handling and re-recorded Lyon's planning answers live into
`acceptance/lyon/answers.json`; restored at once from git (`git checkout` of
those two files, which were unmodified before), and the suites re-run green.

## Criteria, walked

1. Expected values complete before the first acceptance recording —
   `expected-002.9.json` exists, no recording does; the order in git is the
   owner's commit. **Met for the order; the hand check is the owner's.**
2. Both suites with no network — `node --test 'fr-urban-rules/tests/*.test.mjs'`
   361 tests, 359 pass, 2 skipped (the acceptance recordings);
   `node --test 'services/*/tests/*.test.mjs'` 146 tests, 144 pass, 2 skipped;
   the guard and its meta-test (`no-network.test.mjs`). **Met.**
3. P1 on the acceptance recording — **owner step** (no recording); the tests
   that judge it exist and skip, said; on 002.5b's 8 B recording DEC-4 fails
   the façade row, as the draft foresaw.
4. P2 — **owner step** for the recording; the extension cap with its base named
   holds now (defect 2). **Partly met.**
5. P3–P5 — no request reaches the fake companion, each states its reason —
   `designtime.test.mjs`. **Met.**
6. A changed `textLength`, `textSha256` or `promptVersion` fails with the
   command — `acceptance.test.mjs` "criterion 6" ×4. **Met.**
7. `--check --extraction --no-model` on the walk's day — above. **Met.**
8. The walk's six lines — above, in the same words as 096.14; lines 1, 5 (Docker
   form) and 6 **not walked (owner)**.
9. `dist/index.json` — `com.archisimple.fr-urban-rules` **0.8.1** (a patch of
   002.8's 0.8.0, from this sprint's defects), `sdkVersion` 1.32;
   `tools/check-index.mjs --platform ../archisimple`: 2 of 2 accepted. **Met**,
   at 0.8.1.

## Owner steps (exact)

1. **Hand check** (step 1): open
   `https://www.geoportail-urbanisme.gouv.fr/api/document/4f3ddc27a9611b4bc94fa161443b8e86/files/200046977_reglement_20260326.pdf`
   at PDF pp. 124–143 and
   `https://www.geoportail-urbanisme.gouv.fr/api/document/703e6c2a3130ed9396d8100fde318c2e/files/84050_reglement_20220411.pdf`
   at pp. 44–48; check each `required` row of `expected-002.9.json` (value, page,
   phrase), say whether Gordes AC0323 lies in the PPRIF red zone and which road
   borders it; set `handChecked: true` per row and `handCheck.by/date`;
   `shasum -a 256` each PDF against `<plot>/regulation/meta.json`. **Commit the
   expected values** (alone, first).
2. **Name the production model and supply its key**, in a local
   `archisimple/.env` or the shell, never a repository: e.g.
   `AI_PROVIDER_OPENAI_API_KEY=… AI_PROVIDER_OPENAI_MODEL=<model> pnpm --filter
   @archisimple/ai-service start` (variables in `apps/ai-service/README.md`).
3. **Record** (after step 1's commit), from `archisimple-plugins/`:
   `ARCHISIMPLE_AI_SERVICE_URL=http://127.0.0.1:4321 node tools/record-fixtures.mjs lyon --extraction --acceptance`
   then the same for `gordes`; read the printed DEC-4 verdict; run both suites
   (the four skipped tests now run); commit the recordings after the
   expectations.
4. **Docker lines** of DEC-5 (1, 5's Docker form, 6) and the NAS walk — with
   096.14's owner steps.

## Open

- The 8 B development model's live reading of Lyon lists spurious to-confirm
  rules (« Total height ≤ 1 000 mm », « Parking ≥ 1.0 m² », seven « Parking not
  regulated »), which print on the sheet as rules to confirm and reach the
  assistant's offer. Code holds (nothing counts until confirmed); the
  production model decides how many there are.
- No question tool answers « what green space must I keep? ».

## Closure (2026-10-22)

The owner closed Phases 2–3 with the platform's 096.14: _"you can close
phase3. it works for the moment and has been deployed to the NAS. Choosing
another model is another piece of work that will be done later on on the AI
revamp milestone"_. Phase 4 (002.10) stays a draft. The owner steps above,
one by one:

1. **Hand check, and the expected values committed alone, first** — **the
   hand check is not recorded as done.** `expected-002.9.json` was committed
   in `5808887`, with other files rather than alone, and every one of its 15
   rows still reads `handChecked: false` (`handCheck.state: "pending"`). The
   Gordes PPRIF and road questions stay unanswered. Criterion 1 is met for
   the order only, as before.
2. **Name the production model and supply its key** — **deferred to the AI
   revamp milestone.**
3. **Record** the Lyon and Gordes acceptance extractions — **deferred with
   it.** No acceptance recording exists; the four tests that judge them
   still skip. Criteria 3 and 4's recorded half stay open, now the AI
   revamp's.
4. **DEC-5's Docker lines and the NAS walk** — **the NAS deployment is
   done**, on the owner's word (images built, `plugin-services` running
   there, the extension in use). DEC-5's lines 1, 5 (Docker form) and 6 as
   written — the local run from clean and the probe — are **not recorded as
   done**; the owner closed on the NAS deployment working.

**Residual, known.** The 8 B development model's spurious to-confirm rules
(§ Open above; the platform README §10 "Seen") remain. Nothing counts until
confirmed; the remedy is the AI revamp's choice of model.

_Noted at the close (2026-10-22): this sprint carries no post-sprint list; what it changed in the documents is recorded in its Outcome. Not invented after the fact._
