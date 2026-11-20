# Sprint 002.33 — Sectors In Code, Not In The Model

> **Status:** Implemented in the working tree (2026-11-20), uncommitted — built, measured (acceptance rule met) and **switched on at the owner's go**. The service reads with the sectors expanded by the code; `SCHEMA_VERSION` 2, `PROMPT_VERSION` 4; the release note is in the service README. Not yet released or seen on the NUC.
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service` (the extraction's schema and prompt; `SCHEMA_VERSION` 1 → 2 and `PROMPT_VERSION` 3 → 4 if it ships). No SDK change, no platform change, no extension change: the service's result keeps its shape.
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md), the reading-quality track. Follows [002.32 Measuring The Reading](sprint-002.32-measuring-the-reading.md).
>
> **Previous Sprint:** 002.32. **Next:** 002.34 (tables and a look-back), decided after this one's measurement.

## Goal

Make a sentence that applies to several sectors give **every one of its sectors**, without asking the model to repeat itself. Today the prompt says "one item per sector"; on the zone UD of the Pays d'Aix (four sectors) Sonnet found **23 of 45** truth rules, and **all 22 misses are sector-specific**; Haiku finds as many but puts 10 of them under the wrong sector. The model is doing a mechanical expansion badly. Code does it exactly.

## Out of scope

- Tables, a look-back with page images, an agent loop (002.34 and later; see the milestone's ledger).
- Changing what the extension shows: the service's result still holds one rule per sector.
- Any change to the verification (the quote, the figure, the conditions), to the kinds, or to the chunking.
- A different default model (the report suggests keeping Sonnet).

## Baseline (verified, 2026-11-20)

- **The item has one `sector`** (`ITEM_SCHEMA`, `extract.mjs`): a string or null. The prompt (`INSTRUCTIONS`, prompt version 3) tells the model: "When the same sentence applies to several sectors, return one item per sector." **True.**
- **The verification works per item:** the passage's occurrence is chosen by the item's sector heading (DEC-5), `page` and `article` come from the chosen offset, conditions and exceptions must be verbatim around the passage. **True** (`extract.mjs` header).
- **The chapter's sector codes are known to the code:** `prepared.sectors` lists each sector code found in the text with its offset and whether it is a heading. **True** (`prepareChapter`'s return type).
- **A schema bump removes the old results at the service's start** (`evictOutdated` compares `meta.schemaVersion`), and a prompt bump changes the result key and leaves the old entries to eviction. **True** (read 2026-11-20).
- **Measured** (the first live run, one run per pair): UD, Sonnet 5.5: 23 of 45 found, 22 missed, all sector-specific, 0 sector errors; Haiku 5.5: 21 found, 10 under the wrong sector; zone UC (no sectors): 8 of 8 for both. **True** (report). **Run-to-run variation, measured** (three runs of every pair, $0.98, in the report): Sonnet on UD found **23, 21 and 27 of 45** (mean 23.7, a range of six rules), on the other three zones within one rule; **17 of the 45 UD rules were missed in all three runs**, 8 in some, 20 found in all three; Haiku's wrong-sector count on UD was 10, 0 and 7.

## Decisions (recommended; for the owner to confirm)

1. **The item says where it applies, in one field:** `appliesTo`, either `"zone"` (the rule is the zone's own, sector null), `"all_sectors"` (the sentence says « la zone et ses secteurs », « dans tous les secteurs »), or a list of sector codes copied from the chapter. It replaces `sector` in the model's answer. **Recommended.**
2. **The code expands it.** `all_sectors` becomes the zone's sector list from `prepared.sectors` (headings only), plus the zone itself where the text names the zone; a list becomes one item per code; each expanded item carries the same limit, quote, conditions and exceptions, and **goes through the existing verification as its own item** (the occurrence is chosen by its sector heading, so the page and article stay right). The service's result is unchanged: one rule per sector.
3. **The model is told the sector list.** The prompt gains one line built by the code: « Sectors of this zone: UDa, UDa1, UDa2, UDb » (from `prepared.sectors`), so it copies codes and does not discover them. A chapter with no sector heading gets no line and `appliesTo` is `zone`. **Recommended.**
4. **What the code refuses.** A code in `appliesTo` that is not a sector of the chapter is rejected with a reason (`unknown_sector`), counted in `dropped`, never repaired (the existing posture: « Refused, never repaired »). `all_sectors` on a chapter with no sectors is `zone`.
5. **Versions.** `SCHEMA_VERSION` 2 and `PROMPT_VERSION` 4. Consequence: **every cached reading on every deployment is dropped or ignored once**, and re-read when next asked. At the 2026-11-20 measured cost that is about $0.04 to $0.14 per chapter on Sonnet, paid by whoever opens each zone first and shared afterwards. Said in the release note; **the owner decides when it ships** (the platform and the NUC are separate decisions).
6. **The acceptance rule, fixed before the build** (so the change is not judged by what it produces):
   - **The baseline is the three runs already made** (mean recall on UD 53 %, on Lyon 82 %, on Gordes 61 %, on UC 100 %, overall 64 %); a change is judged on three runs of its own, same truths, same models. The noise on UD is about 2.5 rules (a standard deviation of the three runs), so a gain smaller than four to five rules (about 10 points) cannot be told from chance.

- **Ships if**, averaged over the three runs per pair on the four zones with the same truths: Sonnet's recall on UD rises by **at least 10 points**; its recall on the other three zones falls by **no more than 3 points**; sector errors do not rise; wrong values do not rise; cost per chapter rises by no more than **15 %**.
  - **Does not ship** (and the sprint closes as a measured negative) otherwise. Haiku is measured and reported, not gated.
  - The truths are not changed to fit the result; a truth gap found on the way is recorded and fixed for **both** the baseline and the new run.

## Epics

### Epic 1 — The schema, the prompt line and the expansion, behind a flag

`appliesTo` in the item schema (version 2), the expansion function (pure), the prompt line, and the existing verification reused per expanded item; the old behaviour stays available (`SCHEMA_VERSION` 1 path) so the harness can run both.
**Acceptance:** unit tests on synthetic chapters: a sentence for four sectors gives four items with the right pages; `all_sectors` expands to the chapter's headings only; an unknown code is refused with its reason; a chapter with no sectors is unchanged; the recorded Lyon and Marseille fixtures still score as before.

### Epic 2 — The harness runs both

`--variant` on `tools/evaluate-reading.mjs` (the current reading and the new one), the same truths, three runs per pair.
**Acceptance:** the same command measures both on the four zones; the dry run states the estimate for both.

### Epic 3 — The measurement and the decision

Run the baseline and the new reading three times each (about $2), apply the acceptance rule, write the result into the report.
**Acceptance:** the report states whether the rule was met, with the three runs' figures; the sprint's Outcome says whether it ships.

### Epic 4 — Only if it ships: the release

The version bumps, the release note about the one-time re-read, the extension's tests against the new result (it should be unchanged), the plugins repository's changelog.

## Testing

Unit tests for the expansion and the refusals (in `npm test`); the live measurement by hand behind `--confirm` and a spend ceiling, as in 002.32. No existing test changes except those that pin the schema or prompt version, which move with the bump.

## Open questions

- **O1. Should `appliesTo` also let the model say « all sectors except UDb »?** A sentence like « Dans la zone UD et les secteurs UDa, UDa1 et UDa2 » names its sectors; an « except » is rarer. Recommended: not in this sprint; a list of codes covers it.
- **O2. The zone itself.** Whether a sentence « dans la zone UD » (the zone's own, not its sectors) and « dans les secteurs … » are told apart by the model reliably is part of what the measurement shows; the truths already separate them (the zone's own is sector null).
- **O3. Local models.** The local models (LM Studio) may follow a list field worse than a single field; the harness can measure one if the owner wants it.

## Outcome

- **Built (Epics 1 and 2):** in `extract.mjs`, `INSTRUCTIONS_SECTORS_IN_CODE` and `ITEM_SCHEMA_SECTORS_IN_CODE` (`appliesTo` in place of `sector`), `sectorsOfChapter` (the zone's code and its sector codes from the chapter's own text: the sectors are the codes the chapter writes that start with the zone's code, since **the zone UD of the Pays d'Aix has four sectors and no heading names one**, so the plan's "headings only" would have found none), `expandAppliesTo` (`zone`, `all` = the zone and every sector, or a list; the zone's own code is the zone; an unknown code is refused and counted in `dropped.unknownSector`, never repaired), and `extractChapter`'s `sectorsInCode` option (the new instructions plus a line « Zone: UD. Sectors of this zone: UDa, UDa1, UDa2, UDb. », one item per sector going through the existing placement and verification, the memo keyed apart so a chunk read by one variant is not served to the other). **Built off by default, switched on afterwards (Epic 4).** In the harness the measurement used `--variant sectors-in-code`; the files under `reading-runs-2026-11-20-sic-r*` carry that variant, and the earlier runs (no variant recorded) are the earlier reading. Since the switch the harness default is the shipped reading and `--variant previous` is the earlier one.
- **Tests (13 new, written first):** `sectors-in-code.test.mjs` (10: the zone and sectors found on all four real chapters, the expansion cases, the schema and prompt, a four-sector answer giving four verified rules, `all`, an unknown code refused, the shipped path unchanged, the memo kept apart) and one in `evaluation-run.test.mjs`. The service suite: 272 tests, 270 pass, 2 skipped.
- **Measured (Epic 3, $0.948, 24 runs):** against the three baseline runs, Sonnet's recall on UD **53 % → 81 %** (runs 36, 38, 35 of 45 against 23, 21, 27), overall **64 % → 79 %**; no other zone lost anything; sector errors 0 → 0; wrong values not up; **cost per chapter unchanged** ($0.291 → $0.290). Haiku on UD 45 % → 75 % with its wrong-sector errors (10, 0, 7) gone, at +21 % cost. Details and the two caveats (Sonnet's 10 duplicates in two runs, from rules given for every sector that the truth holds at the zone level, one of them an over-application to UDb) are in the report.
- **Acceptance (D6), condition by condition:** UD +28 points against ≥ 10: met. Other zones down by no more than 3: met (up by 2, 0, 2). Sector errors not up: met (0). Wrong values not up: met (the same Gordes truth gap). Cost per chapter up by no more than 15 %: met (0 %). **Met, so it ships.**
- **Epic 4 done (the owner's go, 2026-11-20):** `SECTORS_IN_CODE = true` is passed by `jobs.mjs`; `SCHEMA_VERSION` 1 → 2 and `PROMPT_VERSION` 3 → 4 (tests pinned to the old numbers moved with them, and the watch test's cached-result fixture now takes the current version); the test fake answers in whichever shape is asked, so the suite's existing scenarios still run; a jobs test pins that the service asks `appliesTo` and not `sector`; the harness runs the shipped reading by default and the earlier one with `--variant previous`; **the release note is the service README's « Sectors in code » section** (what changes, what does not, why with the measured figures, and what an operator must expect: every cached reading removed at start and re-read once at about $0.04 to $0.14 a chapter on Sonnet). The service's package version stays **0.7.0**: it carries the AI-budget work of Sprint 002.27 and has not been released, so both ship in it. **Not done:** release and the NUC; a walk of the whole path in the editor with a real reading after the switch (the measurement used the same extraction through the real AI service, and a job-level test pins the new request, but no editor reading was made).
- **A slip to know about:** running Prettier over `extract.mjs`, `tests/jobs.test.mjs`, `tests/watch.test.mjs` and `tests/ai-fake.mjs` reformatted whole files that were not in that style, so their diffs are much larger than the changes; the behaviour and the tests are unaffected. The semantic changes are the hunks listed above.
