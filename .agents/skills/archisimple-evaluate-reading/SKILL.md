---
name: archisimple-evaluate-reading
description: >-
  Measure, compare and decide changes to the PLU reading (fr-urban-rules-service
  extraction): add a zone to the evaluation set, build and cross-check its truth,
  run the evaluation harness with a spend ceiling, read the scores and apply a
  pre-registered acceptance rule. Use before changing the extraction prompt,
  schema, chunking, placement, verification, expansion or the default model.
---

# Evaluating the PLU reading

The reading turns a zone's chapter of a French PLU into typed rules (`road_setback`,
`building_distance`, `footprint_ratio`, `height_*`, `green_ratio`, …). Any change to
how it reads is judged by measurement against hand-checked truths, never by a single
good-looking result. The domain terms are French on purpose (recul, emprise au sol,
« non réglementé », zone and sector codes such as UD, UDa1): keep them verbatim in
truths, quotes and notes, and write everything else in English.

## Where things live

| What                                                                | Where                                                                                                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The extraction (prompt, schema, placement, verification, expansion) | `services/fr-urban-rules-service/src/extract.mjs` (`SCHEMA_VERSION`, `PROMPT_VERSION`)                                                                                            |
| The harness CLI                                                     | `tools/evaluate-reading.mjs`; its parts in `tools/evaluate-reading/` (`run.mjs`, `score.mjs`, `review.mjs`, `report.mjs`)                                                         |
| One zone                                                            | `test-fixtures/fr-urban-rules/evaluation/<zone-id>/`: `truth.json`, `review.md`, `pages.json` (the chapter's pages as the service read them), `source.json` (provenance, licence) |
| Reports and raw runs                                                | `docs/measurements/reading-quality-<date>.md`, the `.csv` files and `reading-runs-<date>[-rN]/`                                                                                   |
| Sprint records                                                      | `docs/sprints/sprint-002.32-measuring-the-reading.md` (method), `sprint-002.33-sectors-in-code.md` (a change judged by it)                                                        |

The scorer, the runner (with a scripted AI client) and the report tables are unit
tested in `npm test` (`evaluation-score`, `evaluation-run`). **The live runs are never
in a test.**

## Adding a zone

1. **Choose for coverage, not comfort.** The set has four zones and 87 rules; it
   lacks a table-heavy zone, a PLUi with a different layout, and a lotissement
   document. A zone whose rules sit in a table or span several sectors teaches more
   than another easy one. Public documents only (Géoportail de l'urbanisme, Licence
   Ouverte v2.0), recorded in `source.json` with the document id, `sha256` and date.
2. **Save only the zone's chapter** as `pages.json` (`[{ page, text }]`, the text as
   the service's own parse produced it) so a truth quote can be checked against it.
3. **Draft the truth before looking at any model's reading** of the chapter, so the
   truth never echoes a model. `truth.json` follows `validateTruth` (`format`
   `archisimple-reading-truth`, `version` 1, `zone`, `document`, `chapter.pages`,
   `scopeKinds`, `scopeNote`, `draftedBy`/`draftedAt`, `rules`). Each rule has `id`,
   `kind`, `sector` (null = the zone's own), `statement`, `limit`, `page`, a verbatim
   `quote` and a `note`. A sentence that applies to several sectors is **one rule per
   sector**, as the product's definitions say. Rules of kinds outside `scopeKinds`
   are named in `scopeNote`, so they are never counted as extras.
4. **Check every quote against `pages.json`** (`checkQuotes`) and the file against
   `validateTruth`. Generate `review.md` with `reviewSheet({ truth, pages })` (pass a `result` to add a reading's score beside it) so a person can check
   number, sector and page against the quote.
5. **Validate.** Either the owner reads it (`validatedBy: "owner"`), or run the
   cross-check below and say plainly in the report that the owner did not validate it.
   Unvalidated truths are shown apart and stay out of any headline figure.

### The blind cross-check (when the owner cannot validate)

Give a **different** model, ideally a stronger one, only the chapter text and the
product's rule definitions: never the truth and never another reading. Ask it for
every rule in scope. Compare its answer with the draft by rule (kind, sector, value,
page). Then reconcile each difference by reading the chapter text, and record it in
the truth's `crossCheck` block: who, when, the counts, what was **adopted** (with the
reason) and what was **not adopted** (with the reason). Do not average the two;
decide each difference from the text. A difference that is a judgement call (is a
sentence the zone's rule or each sector's?) is reported to the owner, not buried.
The comparison scripts of 2026-11-20 were scratch files and are not in the repo.

## Running the harness

```bash
node tools/evaluate-reading.mjs                              # dry run: chunks, tokens, estimated cost; calls nothing
node tools/evaluate-reading.mjs --confirm --max-spend 3 \
  --zones pays-d-aix-ud --models anthropic:claude-sonnet-5-5 # a live run
node tools/evaluate-reading.mjs --variant unguided           # prompt 4 (no reading guidance), for a comparison
node tools/evaluate-reading.mjs --variant previous           # before sectors-in-code (002.33)
```

- **Always dry-run first and state the estimate.** `--confirm` is required to spend;
  `--max-spend` (dollars, default 3) stops before a pair once the **measured** spend
  reaches it. A finished zone × model pair is skipped on resume (`--again` re-runs).
- It needs the platform checkout (`--platform ../archisimple`, default) and the keys in
  its `.env`. It starts the platform's AI service and a stand-in for the usage
  endpoint itself. Never print a key. Only the public chapter text and the product's
  own instructions are sent, never a user, account, project or parcel.
- Model syntax is `provider:model[@effort]` (`anthropic:claude-haiku-5-5@low`).
- Output: `<out>/<zone>__<model>.json` per pair, then tables from `report.mjs`
  (`perZoneTable`, `overallTable`, `variationTable`, `csvOf`).
- **Repeat before you believe a difference.** One run is not a measurement: Sonnet on
  the four-sector zone found 23, 21 and 27 of 45 on identical input. Run three per
  pair into `-r1`, `-r2`, `-r3` folders and compare means and ranges.

## Explaining the misses, and not paying twice

- `node tools/triage-reading.mjs --runs <run-folder>[,<folder>…] [--model …] [--zones …]` reads recorded runs, calls
  nothing, and says for each missed truth rule **why**: the model never offered it (`not-returned`), offered it
  without this sector (`sector-left-out`), offered it and the code refused it (`refused-by-code`), or it was
  placed with other values (`read-as-other-values`, the table shows which). **Run it before proposing a fix**: the
  fix depends on the cause. A run made before Sprint 002.34 has no raw answers, so the model-side causes show as
  `no-rule-on-passage`.
- Each run keeps the model's raw answers (`raw`). `--cache <folder>` replays a chunk's answer when the same model
  is asked the same text with the same instructions and schema: use it to re-measure a change to expansion,
  placement, verification or scoring for $0. **Never use it for the repeat runs that measure noise.**
- **Re-measure a code change for $0:** replay the saved answers (`--cache`, same model, same variant) and compare with
  the run they came from. Sprint 002.35 did this for a scorer rule and a placement rule: four zones, 0 calls.
- **The scorer follows the consumer.** A share of the plot is `value … percent` or `ratio … of plot_area` for the
  footprint (a maximum) and the green ratio (a minimum), as the extension reads it; do not "fix" a truth for that.
- **A pair that failed is not a reading.** If a chunk fails (`chunks.failed` > 0) the CLI files the pair as
  `<zone>__<model>.incomplete.json` and says INCOMPLETE; run it again. The triage and `measure-merge.mjs` ignore or
  refuse such a file. Never count its 0 rules as misses.
- **Second reads:** `node tools/measure-merge.mjs --reads <folder>=<model>,…` merges saved runs (a rule is the same
  rule when kind, sector, statement, limit and strip match and the passages overlap) and scores the merge with the
  agreement of the reads; measured in Sprint 002.39: a whole-chapter second read is not worth its cost.
- The triage's "on the passage" and "tabular" are heuristics (same page, 60% of the quote's words; short lines
  around the quote). A zero for `tabular` is not evidence that there are no tables.

## Reading a result

- **Found / missed / wrong value / sector error / extra / duplicates / out of scope**
  are the scorer's classes. A rule found under the wrong sector is a **sector error**,
  not a miss. Sonnet fails by omission, Haiku also by wrong sector.
- **Extras and duplicates are not automatically errors**: they may be a truth gap or a
  zone-level versus per-sector modelling choice. Look at the quote first.
- **Verified** is the share of items whose quote, figure and conditions the code
  confirmed in the text; it must stay at 100%.
- **Cost** is the provider's measured tokens, not an estimate. Compare cost per chapter.
- Report **recall overall and per zone**, not only the headline: a gain on one zone
  can hide a loss on another.

## Judging a change

1. **Write the acceptance rule before the build** (as Sprint 002.33 did): the gain
   required, the losses tolerated per zone, what must not rise (wrong values, sector
   errors, cost) and the number of runs per side. Commit to it in the sprint.
2. **Build the change behind an option or a variant** so both readings can run on the
   same truths and the shipped one stays byte for byte until the decision.
3. **Do not change a truth to fit a result.** If a truth gap shows up, fix it for the
   baseline and the new run alike, and record the fix.
4. **Baseline and change use the same truths, models and run count.**
5. **Report negatives.** A change that fails its rule closes as a measured negative.
6. **A prompt or schema change moves `PROMPT_VERSION` or `SCHEMA_VERSION`**, which
   makes every cached reading read again once. Say so in the release note, with the
   cost per chapter, and let the owner decide when it ships.

## Before you finish

- `node --test 'services/*/tests/*.test.mjs'` from the repo root passes.
- The report states: what was run (zones, models, variant, runs), the spend against the
  estimate, which truths are owner-validated, the acceptance rule and whether it was
  met, and what is **not** measured (zones not in the set, tables, vision).
- Do not run `prettier --write` on existing files in this repo; format only files you
  create.
- The owner commits. Leave the change in the tree and report.
