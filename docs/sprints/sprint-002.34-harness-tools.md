# Sprint 002.34 — Harness Tools: Explaining The Misses, Replaying The Answers

> **Status:** Implemented in the working tree (2026-11-20), uncommitted. Epics 1 and 2 built test-first and used once on a live run ($0.277). Epics 3 and 4 not started.
>
> **Repository:** `archisimple-plugins` — `tools/` only. No change to the service, the schema or the prompt, so no version bump.
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md), reading-quality track. Follows [002.33 Sectors In Code](sprint-002.33-sectors-in-code.md).

## Goal

Know **why** a rule is missed before deciding how to fix it, and stop paying twice for the same model answer. After 002.33 the reading finds about 79% of the truth; the next change (tables, a look-back with page images, guidance, a code fix) should be aimed by evidence, and re-measuring a change that does not alter what the model is asked should cost nothing.

## Out of scope

Any change to the reading itself; page images or an agent loop (they are experiments to aim with this sprint's output); changing a truth or the scorer's equivalences (reported below as decisions for the owner).

## Epics

### Epic 1 — Miss triage (built)

`tools/evaluate-reading/triage.mjs` (pure) and `tools/triage-reading.mjs` (reads recorded runs, calls nothing). For each missed truth rule: its **cause**, whether it is sector-specific, its statement, and whether the passage looks tabular; over several runs, the rules missed in every run and in some.

| cause                  | meaning                                                                        | needs raw answers |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------- |
| `quote-not-in-text`    | the truth's quote is not in the chapter text                                   | no                |
| `read-as-other-kind`   | the passage is in the result as another kind                                   | no                |
| `other-sector-read`    | the passage is in the result for another sector                                | no                |
| `read-as-other-values` | placed, same kind and sector, other statement or figure (the table says which) | no                |
| `no-rule-on-passage`   | nothing in the result is there (raw answers would say why)                     | no                |
| `not-returned`         | the model offered nothing on the passage                                       | yes               |
| `sector-left-out`      | the model offered it but not for this sector                                   | yes               |
| `refused-by-code`      | the model offered it for this sector and no rule came out                      | yes               |

"On the passage" is a heuristic (same page, at least 60% of the quote's words in common); `tabular` is a heuristic too (short lines around the quote). **Acceptance:** met — 9 unit tests on a synthetic zone (each cause, the older one-sector item shape, `all` versus a list, a placed-but-different rule not called "refused", stable misses over runs, the table), and the tool runs on the recorded runs of 002.32 and 002.33 with no model.

### Epic 2 — The model's raw answers are kept, and can be replayed (built)

- Each run now records `raw`: per answered chunk, each item as the model gave it (`value`, the passage's text) and what the service rejected.
- `--cache <folder>` (`createReplayCache`) keeps each chunk's answer and replays it when the same model is asked the same thing. The key is the extraction's own (chunk text, prompt version, variant) **plus a hash of the model label, the instructions and the schema**, so an edited prompt never meets a stale answer. A replayed pair costs nothing and says so (`usage.replayedChunks`). The folder is ignored by git (`.cache/`).
- **Never with the repeat runs that measure noise**: a replay measures nothing. The CLI header says so.

**Acceptance:** met — 4 new tests (raw kept; a second run asks the model nothing and returns the same rules and raw; another model, effort or variant is asked again; a cache in a folder survives the process).

### Epic 3 — The blind cross-check as a tool (not started)

The comparison script of 2026-11-20 was scratch. Move it into `tools/` (compare a blind answer to a truth by kind, sector, value and page) and test it.

### Epic 4 — A free regression gate (not started)

Score the replayed answers of a recorded cache against a stored baseline inside `npm test`, so a change to expansion, placement or scoring that loses rules fails with no money spent. Needs a small committed answer set (public text only) and the owner's call on its size.

## Outcome (Epics 1 and 2)

One live run of the shipped reading, Sonnet 5.5, four zones, **$0.277** (estimate $0.28), recorded in `docs/measurements/reading-runs-2026-11-20-triage-r1` with the raw answers. Recall: Gordes 58%, Lyon 80%, Pays d'Aix UC 100%, UD 78%. **19 truth rules missed**, by cause:

| cause                  | n   | which                                                                                                                               |
| ---------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `not-returned`         | 7   | Gordes g14, g18, g19 (extensions, pages 44–45); Lyon r15; UD d05, d38, d39                                                          |
| `sector-left-out`      | 4   | UD d04, d08, d11, d22                                                                                                               |
| `read-as-other-values` | 7   | UD d18–d20 and Lyon r13 (**the strip check**, below); Lyon r14 (percent versus ratio); Gordes g15, g17 (a sentence with two limits) |
| `refused-by-code`      | 1   | Gordes g07 (footprint 250 m²)                                                                                                       |

**What this changes in the plan.** Only **7 of 19** misses are the model never offering the passage, which is all that page images, a look-back or better tables could recover. **4** are the model naming too few sectors (guidance or a check). **8 are decided by code or by the truths, not by the model**:

1. **The strip check demotes a correct reading (4 misses: UD d18–d20, Lyon r13).** The model returns `height_facade ≤ 3.5 m` with a strip (4 m, or 5 m); the strip's depth sits in the clause before the passage the model quoted, so `verifiedStrip` fails and `placeItem` turns the limit into `described` (Sprint 002.21's deliberate safety rule). The cheapest fix is to ask the model to quote the clause that gives the strip, or to look for the depth in the condition window; either is a measurable change.
2. **Gordes g07: a 250 m² cap on the footprint is "incoherent" by the product's kinds** (`footprint_ratio` takes a percent or a ratio, not an area), so the code refuses a reading the truth expects. Either the truth's kind is wrong (`other`, or an `annex_max`-like area) or the product lacks a kind. The owner's call.
3. **Lyon r14: « au minimum de 15% » read as `value 15 percent`, the truth says `ratio 15 plot_area`.** The product accepts both for `green_ratio`, the scorer does not call them equal. A scorer equivalence or a prompt rule; either way it changes baseline and new runs alike.
4. **Gordes g15, g17: one sentence holds two limits** (30% of the existing area and 250 m²); the reading gives one. A schema question (two items from one passage).

`tabular` found nothing on any miss: the heuristic is weak (it needs short lines in the text layer) and is **not evidence that tables are fine**; Gordes' extension figures (page 45) are the likely table cases and need a look at the page.

## Not verified

One run, not three: causes can shift between runs (UD's misses changed from run to run in 002.33). The triage of a single run is a map, not a rate. The `not-returned` rules were not checked against the page images.
