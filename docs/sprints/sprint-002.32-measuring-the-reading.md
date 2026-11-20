# Sprint 002.32 — Measuring The Reading

> **Status:** Implemented in the working tree (2026-11-20), uncommitted — **Epics 1 to 4 done, Epic 5 (records) in this pass**. The scorer, the runner, four truths (Lyon UCe1 validated by the owner; the other three cross-checked by a second model, not validated by the owner) and **the first live measurement** ($0.335, 12 pairs: 4 zones × Sonnet 5.5, Haiku 5.5, Haiku 5.5 at low effort). The report is `docs/measurements/reading-quality-2026-11-20.md`. Nothing in the product changed. Decisions for 002.33 and 002.34 are the owner's, from the report.
>
> **Repository:** `archisimple-plugins` — **no change to `fr-urban-rules`, the service's prompt, schema or models, and no SDK change.** A tool, fixtures and a report. `SCHEMA_VERSION` stays 1 and `PROMPT_VERSION` stays 3 (every cached reading on every deployment stays valid).
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md), section 3. It can start now, in parallel with the platform's 122.0, because it touches only the existing PLU reading.
>
> **Previous Sprint:** [002.29 The Reading Offer In The AI Panel](sprint-002.29-the-reading-offer-in-the-ai-panel.md). 002.30 and 002.31 are outlined in the milestone and not yet written.
>
> **Next Sprints:** 002.33 Sector Lists and 002.34 Definitions and Reconciliation, **both decided from this sprint's report**, not before.

## Goal

Say how good the PLU reading is. Today only its **cost** is known (about $0.086 for a Sonnet 5.5 chunk of the zone UD, about $0.008 for a Haiku 5.5 chunk of the zone UC). Give the owner a number for what it **finds**, what it gets **wrong** and what it **misses**, per model, on a set of zones whose correct rules were written out by hand and validated by them, so that a prompt, a schema or a model change is a measured decision.

## Out of scope

- **Any change to the reading** — prompt, schema, chunking, model, verification, thinking or effort setting. This sprint measures; 002.33 and 002.34 change.
- Reading uploaded documents or scans (002.30), and any platform work.
- A test in `npm test` that calls a model. The tool is run by hand, like `tools/measure-coverage.mjs`; only the **scorer's own logic** is unit-tested, on small synthetic truths.
- A public claim about accuracy. The report is the owner's evidence for decisions.
- Grading rules the harness cannot check (legal effect, which document wins).

## Baseline (verified against the source and the fixtures, 2026-11-20)

- **The reading is a chain the harness can call as it stands:** `prepareChapter(pages)` (`text.mjs`) → `extractChapter({ prepared, ai, … })` (`extract.mjs`), whose `ai` client takes `route = { providerId?, model?, features?, aiSubject?, signal? }` and sends `providerId` and `model` to ai-service (`ai-client.mjs`). **True.** _Not verified:_ that a model chosen this way reaches the provider with the same settings the product uses (the product passes the panel's choice; Epic 3 reads it).
- **The extraction returns candidates the code already checks:** the passage's occurrence, page and article come from the text, statement/limit/unit must agree, a figure must occur in its passage, conditions and exceptions must occur verbatim; the `dropped` counts say what failed each check. **True** (`extract.mjs`).
- **Recorded readings exist as fixtures:** `test-fixtures/fr-urban-rules/lyon/extraction/{calls.json,result.json}` (32 rules, Lyon UCe1b, pages 121 to 144), `marseille-ud/{pages.json,result-ud.json}` (the chapter's pages and a 98-rule result by `gpt-6.1-terra`), `gordes/regulation/`. **True** (listed); the Gordes folder's content was not opened.
- **There is no measure of correctness.** No file lists the rules a zone _should_ have. **True** (searched `test-fixtures/` and `docs/`).
- **Two real readings were seen on 2026-11-20** (the NUC's trace store): zone UD (Pays d'Aix, Sonnet 5.5): 32 items, 15,491 tokens in, 5,480 out, 20 of 32 items carrying a sector and about 8 repeating the same rule; zone UC (Haiku 5.5): 40 items, 13,541 in, **12,641 out for 14,188 characters of JSON** (thinking tokens suspected), **22 of 40 items identical to another except for the sector**, shorter quoted passages (57 characters on average against 134), and an `extension_max` with no limit. **True** (from the traces); the two zones were different documents, so the models were **not compared**.
- **By-hand tools live in `tools/`** (`measure-coverage.mjs`, `record-fixtures.mjs`, `acceptance.mjs`) and write reports to `docs/measurements/` (CSV and Markdown, with the method). **True.**
- **The public documents' usage terms are unverified:** the coverage tool says the Géoportail's exact terms "have **not** been verified". **True.**

## Decisions

1. **The unit of truth is a rule, described by what a reader can check:** `kind`, `sector` (or null for the whole zone), `statement` (`limit`, `not_regulated`, `see_graphic`, `described`), the limit (comparison, value, unit, or a ratio's base, or the height-relative factor), and **the page**. Not the model's wording and not its quote.
2. **Match rules by a key, then by judgement for the rest.** A read rule matches a truth rule when kind, sector, statement and the limit's value and unit agree. A read rule that differs only in the sector spelling or its confidence still matches; a near miss (same kind and sector, another value) is reported as **wrong value**, not as a miss plus an extra.
3. **Seven scores per zone and model**, in this order:
   1. **Recall** — truth rules found / truth rules.
   2. **Wrong value** — matched on kind and sector but not on the value or unit.
   3. **Extra** — read rules with no truth rule. Each is classified by the owner as _valid, missing from the truth_ or _wrong_; the first is added to the truth, so the truth improves from the runs.
   4. **Sector attribution** — among matches, those with the right sector.
   5. **Verified** — the share of read rules whose figure occurs in their passage and whose condition phrases are verbatim (the service's own checks), and the `dropped` counts.
   6. **Figure coverage (a proxy that needs no truth)** — of the figures with a unit (`m`, `m²`, `%`) in the chapter's text, the share that appear in the passage of some read rule. It is **not** correctness; it is the cheapest way to see a model skipping a paragraph.
   7. **Repeats** — read rules identical to another except for the sector, and the **cost**: tokens in and out, priced by the AI service's table, and the time.
4. **The truth is drafted by Claude Code from the chapter text and validated by the owner.** A truth file records who wrote it and who validated it and when; **the harness prints the unvalidated truths' scores under a "not validated" heading and leaves them out of the headline.** Because the drafter is also a model, the owner validates **every number and every sector** (the two things a model would get wrong the same way), not the wording. Figure coverage (score 6) is the check on the drafter.
5. **The zones, chosen to differ:** Lyon UCe1b (recorded, one clear page layout), Marseille UD (recorded, 98 rules, the largest), Gordes zone A (a small commune's PLU), Pays d'Aix UD and Pays d'Aix UC (the two traced on the NUC, many sectors, repeated rules). The chapters' text for the ones not in the fixtures is fetched once with the service's own fetcher and saved as a fixture with its source identifiers (public documents, the same posture as the existing fixtures; **the terms are verified before anything is added** — Open question O3).
6. **The models:** Claude Sonnet 5.5 and Claude Haiku 5.5 as the product would call them, plus Haiku with **the provider's effort lowered** if the provider accepts it (`AI_PROVIDER_ANTHROPIC_EFFORT`; the run records what was accepted). OpenAI's current default is added only if the owner wants it compared.
7. **A spend ceiling and a dry run.** The tool prints the chunks, the tokens and the estimated cost of a run before it starts, refuses to start without `--confirm`, and stops at `--max-spend` (default **$3**). The estimate for the plan: about 5 zones × (one Sonnet reading at roughly $0.09 to $0.40, one Haiku at roughly $0.01 to $0.05, one low-effort Haiku) — **to be confirmed by the dry run, not assumed**.
8. **Nothing private is sent.** The text is public PLU text; no user, account, project or parcel is named in a call (the harness uses no AI subject).
9. **The report is a file, not a dashboard:** `docs/measurements/reading-quality-<date>.md` and `.csv`, with the method, the models and settings, the date, the prompt and schema versions, per-zone and overall tables, every extra and wrong value listed with its passage, and a section "what this suggests for 002.33 and 002.34" that states the evidence and **does not decide**.

## Epics

### Epic 1 — The truth format and the scorer

A truth file per zone (`test-fixtures/fr-urban-rules/evaluation/<zone>/truth.json`: the document identifiers, the chapter's pages, the rules of Decision 1, `draftedBy`, `validatedBy`, `validatedAt`), and the pure functions that score a result against it (Decisions 2 and 3), with no I/O and no model.
**Acceptance:** synthetic truths and results show a match, a wrong value, an extra, a miss, a sector error, a repeat and a figure the text holds that no rule covers; the scorer is deterministic; an unvalidated truth is flagged and never enters a headline; a result in the service's own shape (the recorded `result.json`) scores without conversion.

### Epic 2 — The fixtures and the drafted truths

Capture the chapters not yet in `test-fixtures` (after O3), draft each zone's truth from the text, and give the owner a short review sheet per zone: the rules grouped by sector with their page and quote, so a number is checked against the passage in seconds.
**Acceptance:** five zones with a chapter fixture and a drafted truth; every truth rule has its page and a quote the owner can find; the review sheet lists each zone's figures with units that **no truth rule covers** (the drafter's likely misses); the owner's validation is recorded in the files, zone by zone, as they give it.

### Epic 3 — The runner

`tools/evaluate-reading.mjs`: for each zone and model, prepare the chapter, run the real `extractChapter` through a local AI service, record the result, the `dropped` counts, the tokens and the time, then score. A dry run, `--confirm`, `--max-spend`, `--zones`, `--models`, resumable (a finished zone-model pair is not run again unless asked), and **it records exactly what the provider was asked** (model, effort accepted or refused).
**Acceptance:** a dry run prints the plan and the estimate and calls nothing; a confirmed run stops at the ceiling with what it has; an interrupted run resumes; every call's tokens are recorded; a run against the recorded fixtures with a **scripted** AI client reproduces the recorded result's score (no model needed), so the runner is tested.

### Epic 4 — The first comparison and the report

Run the plan after the owner has validated at least three zones; write the report (Decision 9); list what each model missed and got wrong with the passages; say what the evidence supports for 002.33 (sector lists) and 002.34 (definitions, reconciliation), and whether Haiku, or Haiku at lower effort, is defensible for any case.
**Acceptance:** the report exists with its method and the settings used; the headline table covers only validated zones; Sonnet and Haiku are compared **on the same zones**; the thinking question is answered or marked unanswered (does lowering effort reduce output tokens without losing rules); the spend is stated; nothing in the product changed.

### Epic 5 — Records

The tool's header and `tools/README` entry, the milestone README (section 3 updated with the measured table), a memory note, and this sprint's Outcome.

## Testing

- **Unit** (in `npm test`): the scorer on synthetic data (Epic 1), the truth file's validation (a missing field, an unvalidated zone), the spend ceiling and resume logic with a scripted client (Epic 3), the report writer's tables on a small fixed input.
- **By hand, never in `npm test`:** the live runs, behind `--confirm`.
- **No change to any existing test**; the extension's suite and the service's stay green and untouched.

## Open Questions

- **O1. Who validates, and how much.** The recommendation is the owner, every number and sector, one zone at a time starting with Lyon UCe1b (the smallest). If that is too heavy, validate only the rules of the kinds the buildable area uses (`road_setback`, `boundary_setback`, `building_distance`, `height_*`, `footprint_ratio`, `green_ratio`) and leave the rest unvalidated.
- **O2. How wrong is wrong enough.** A setback read as 3 m instead of 4 m is a wrong rule; a missing `parking` rule matters less to the envelope. The report lists both but the headline counts them equally unless the owner wants a weight by kind.
- **O3. The Géoportail's terms — decided by the owner, 2026-11-20: the Licence Ouverte v2.0 applies** (the data are open data on data.gouv.fr; the site's CGU also say the use of urbanism data follows the Licence Ouverte). What I found when reading the pages, for the record: the CGU (modified 28 March 2019) point to the Licence Ouverte; the GPU's older legal notices (modified 29 October 2019) are stricter about commercial reuse and the aggregate dataset on data.gouv.fr shows "licence not specified" — the owner's decision stands over that ambiguity. **Practice:** a chapter fixture carries a provenance note (source, document identifier, retrieval date, licence, as `truth.json`'s `provenance` does), the source and date are named, and only the zone's chapter is saved, never a whole document.
- **O4. The Peynier case.** The lotissement règlement of the owner's example is the first extra-document case, **after** 002.30 can read it: its truth, from the transcript of 2026-11-20 (pages 59 to 75, Sonnet), would join the set then. The PDF is not committed (the other pages hold private people's details).

### Independent cross-check of three truths (2026-11-20, at the owner's request)

The owner asked whether the three truths could be validated without them, possibly with a stronger model. **What was done:** for each of UC, UD and Gordes A, a **second model (Fable 5.2, the strongest available) re-derived the rules blind**: it was given only the chapter text and the product's own rule definitions (the extraction prompt's text), told not to open any truth, review sheet or recorded reading, and asked for the rules in the truth's format with verbatim quotes. Its answer was compared with the draft by the evaluation's own matcher, and its quotes were checked against the pages (all found).

- **Agreement on every rule the drafter wrote.** The blind reader found **all** of them exactly: UC 8 of 8, UD 39 of 39, Gordes 15 of 15, with **no wrong value and no sector error** between the two readers. Every difference is an addition by the blind reader.
- **Adopted (clear by the product's definitions):** UD **+6** (the see_graphic height rules of article 4.5.1, stated « Dans la zone UD et les secteurs UDa, UDa1 et UDa2 », are one item per sector: the drafter had put them on the zone only; the same convention the drafter applied elsewhere in the same chapter); Gordes **+4** (the 250 m² and 140 m² totals « existant + extension » and the 50 m² farm-reception extension are limits on extending, `extension_max`; the 60 m² pool basin sits in the sentence about annexes, `annex_max`). UC: none. Final truths: **UC 8, UD 45, Gordes 19 rules**.
- **Not adopted (judgment calls the two readers differ on; the owner may decide):** the **no-figure « described » sentences** (UC's alternative rule for extensions and for plots already under the ratio; UD's rule of implanting on the gabarit line and its green-ratio alternative; Gordes' « harmony » condition on extensions): the blind reader itself hesitated over their kind, so counting them would reward luck; a model that reads them is reported as an extra to classify. In Gordes also the **80 m² pool basin of article A 9**, the **20 m radius** of annexes (an `annex_max`, or a `building_distance`?) and the **count of three annexes**. Each is recorded, with its quote and the blind reader's own note, in the truth's `crossCheck.notAdopted`.
- **How the truths are labelled.** `validatedBy` says "independent cross-check (a second model, Fable 5.2, that did not see this truth) reconciled by Claude Code; not validated by the owner", and the runner, the review sheets and the headline's `validators` show it per zone, so an owner's validation and a model's cross-check are never confused. **They enter the headline because the owner asked for this route; the report will say so beside the figures.**
- **What this does not establish.** Two models agreeing is not a human reading: a misreading both share (an ambiguous kind they resolve the same way, a figure in a badly extracted table) passes. The cross-check removes the drafter's solo bias and the typing errors; it does not remove a shared model bias. Lyon, the one zone the owner validated, is the reference point, and the owner can still review any disagreement from `review.md` and `crossCheck`.

### The first live measurement and the report (Epic 3 run, Epic 4)

- **Run (2026-11-20, `node tools/evaluate-reading.mjs --confirm`, ceiling $3):** 4 zones × 3 model settings = 12 pairs, one call per chunk, **$0.335 spent** (estimated $0.34), about 4 minutes. The AI service refused to start with a usage endpoint and no `AI_SERVICE_TRUST_ACCOUNT_FEATURES`; the tool now sets it (safe: loopback, this run only, no account headers sent) and shows the service's own error if it exits. **The meter recorded every call although none carried an account subject** (the open question), so tokens and cost are the platform's own figures. Haiku's `@low` effort was accepted (its output tokens halved).
- **Headline** (87 truth rules): Sonnet 5.5 found 56 (64 %), Haiku 5.5 48 (55 %), Haiku at low effort 39 (45 %); wrong values 1, 1, 1; sector errors 0, 10, 4; cost $0.301, $0.020, $0.013. **Sonnet fails by omission, not error**: 8 of 8 on the zone without sectors (UC), 13 of 15 on Lyon, but 23 of 45 on UD, where the missing rules are all sector-specific. Haiku puts 10 UD rules under the wrong sector. Tables (Gordes' risk table) are the second gap. **Low effort is not a free saving.** Full tables, the three "wrong values" explained (two are a truth gap, one a real misreading), what this suggests for 002.33 and 002.34 and the measurement's limits (three runs per pair; four zones) are in the report.
- **Built (Epic 4):** `tools/evaluate-reading/report.mjs` (the per-zone and overall tables and the CSV, from the saved runs, so no figure is typed by hand) and its test; the saved runs (`docs/measurements/reading-runs-2026-11-20/`, 12 files, 376 KB, with every rule read) and `reading-quality-2026-11-20.csv`.
- **Tests:** 260 in the service suite (258 pass, 2 skipped), 35 of them for this sprint.
- **Not done / open:** the owner's classification of the extras (valid and missing from the truth, or wrong); the owner's validation of the three cross-checked truths; **repeat runs** (each pair three times) before trusting a difference of one or two rules; the decision on how strict "the same rule" is (a percent value against a ratio; a `described` rule against one with a limit), which moves Sonnet's Lyon from 13 to 15 of 15 on its own; 002.33 and 002.34.

### The three runs (the same day, at the owner's "as per your recommendation")

The plan was run twice more: **36 runs, $0.98 in all**. Sonnet's overall recall was 64 %, 61 % and 67 %; Haiku's 55, 54 and 53 %; Haiku at low effort 45, 40 and 36 %. **Sonnet is stable except on the zone with sectors** (UD: 23, 21, 27 of 45); **17 of the 45 UD rules were missed in all three runs**, which makes the sector gap systematic. Haiku's wrong-sector errors on UD vary (10, 0, 7); low effort is worse and noisier (wrong values 1, 4, 4; extras 9, 10, 12). `report.mjs` gained `variationTable` (with its test); the report has a "Three runs of every pair" section and `reading-quality-2026-11-20-three-runs.csv` holds the 36 rows. Sprint 002.33's acceptance rule now rests on this measured noise.

## Outcome (partial: Epics 1 and 3 built, Epic 2 drafted)

- **The zones.** The set is **four zones, not five**: the repository's `marseille-ud` fixture turned out to be the **same PLUi du Pays d'Aix (partition B), same zone UD, same chapter (pages 170 to 180)** as the zone UD read on the NUC; its README's "Marseille" is a label slip. The chapters not already in the repository (Pays d'Aix UD pages 170 to 180 and UC pages 153 to 160) were fetched once through the service's own fetcher and saved with a provenance note (`evaluation/pays-d-aix-*/source.json`: source, licence, document identifier, retrieval date, SHA-256); only the zone's chapter, never the document (448 pages).
- **Built (Epic 1):** `tools/evaluate-reading/score.mjs`: the truth validator, the four-pass matcher, `figuresIn`, `scoreReading`, `summarise` (validated truths only in the headline), `checkQuotes`, a truth's **`scopeKinds`**, and the rule that **a sector equal to the zone's own name is the whole zone** (a table row « UC » in zone UC).
- **Built (Epic 2, in part):** `tools/evaluate-reading/review.mjs` and four truths with review sheets, each quote verified to be in its page: **Lyon UCe1** (15 rules; **validated by the owner, "ok for now"**), **Pays d'Aix UC** (8), **Pays d'Aix UD** (39: the text states several rules once for four sectors, so they are one truth rule per sector, as the prompt asks) and **Gordes A** (15; no model's reading is recorded for it). All were drafted from the chapter text before any model's reading was looked at. Lyon's scope was narrowed to the kinds its truth uses (`floor_area_max` removed).
- **Built (Epic 3):** `tools/evaluate-reading/run.mjs` (`loadZone`, `estimateRun` and `formatPlan` for the dry run, `createLedgerStub`, `runPair`, `runPlan` with the spend ceiling and resume) and the command `tools/evaluate-reading.mjs`. It runs each zone × model through the **real** `extractChapter` and scores it. **Tokens and cost come from the platform's own meter**: the AI service's extract answer carries no usage, so the tool stands in for the account service's usage endpoint (`POST /internal/ai/step`) and records each call's settlement, priced by the AI service's table. Without `--confirm` it prints the plan and calls nothing.
- **Tests (27, written first):** `evaluation-score.test.mjs` (20) and `evaluation-run.test.mjs` (7: model naming; a zone loading; the dry run's estimate; a model without a price refused; the ledger stub behind its bearer token; a **scripted** model run through the real extraction scoring above 0.5 with the ledger's usage; the spend ceiling and resume). The service suite: 258 tests, 256 pass, 2 skipped, none fail.
- **The dry run** (`node tools/evaluate-reading.mjs`, nothing called): **$0.31 estimated** for Sonnet 5.5 and Haiku 5.5 on the four zones (Sonnet $0.04 to $0.13 a zone, Haiku about a cent), 5 chunks per model. A Haiku at low effort adds about $0.03. The ceiling defaults to $3.
- **A baseline already in the repository, scored for information:** the hosted reading of the Pays d'Aix UD of 2026-11-03 (OpenAI gpt-6.1-terra, prompt version 3, 98 rules) finds **37 of the 39 drafted rules exactly** (misses two UDb rules: the 2 m pool and the extension's 4 m strip), with 6 extras (all `described` alternative-rule sentences; whether they belong in the truth is for the owner) and 12 duplicates (the same rule per sector). That two independent readings agree on 37 of 39 is evidence for the draft, not proof: both are models. The Lyon reading in the repository is an old local-model, prompt-version-1 run, **not** the product's.
- **Not done:** the owner's validation of UC, UD and Gordes; **the first live run** (needs `--confirm`; unverified that the meter records a call that carries no account subject, which the first run will show); Epic 4's report and comparison; Epic 5's records. Not verified: that Haiku at `@low` effort is accepted by the provider (the run records what happened).
