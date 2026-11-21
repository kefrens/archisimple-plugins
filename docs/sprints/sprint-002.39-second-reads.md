# Sprint 002.39 — Second Reads: Merge, Agreement, And Cheap Executors (Draft)

> **Status:** Epics 1 to 3 built and measured (2026-11-20), uncommitted. **No architecture tested meets the acceptance rule; nothing ships.** Epic 4 (Haiku executors) not built. The owner gave the go for the Haiku runs ($0.085).
>
> **Repository:** `archisimple-plugins` — `tools/evaluate-reading/` first (a pure merge, tested on saved runs), the service only if the measurement says to ship.
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md). Follows [002.38](sprint-002.38-statement-after-passage.md).

## Goal

After 002.38 the shipped reading finds about **94.6%** of the truth rules (82.3 of 87, Sonnet 5.5, three saved runs). Of the 11 rules not found every time, **10 are found by some run**; only d05 is never found. The gap is mostly **run-to-run variance**, so the lever is a second read, not a better first one. Question: can a second read (another Sonnet read, or cheap Haiku executors) close it without adding wrong rules, duplicates or much cost?

## What the free checks already showed (saved runs, no model)

| reading                      | found of 87 | wrong values | sector errors | extras | duplicates |
| ---------------------------- | ----------- | ------------ | ------------- | ------ | ---------- |
| one run (mean of 3)          | 82.3        | 0.7          | 0             | 3.0    | 8.3        |
| union of 2 (mean of 3 pairs) | 86.3        | 0.0          | 0.7           | 6.0    | 29.7       |
| union of 3                   | 87.0        | 0.0          | 1.0           | 8.0    | 44.0       |

The union finds the rules, **and doubles the extras and multiplies the duplicates** (the same rule quoted with a different cut is a different key), so a naive merge is not shippable. A vote by exact passage ("in at least 2 of 3": 80.0) is an artefact for the same reason. A model-free **planner from uncovered figures does not help**: only 1 of 12 missed-rule occurrences carries a figure no rule covers (the missed ones involve figures other rules already hold, or none).

## The architecture, answered

**"Plan with Sonnet, execute with several Haiku" — what it can mean here, and what it should.** There is little to plan: the chapter is one document and Sonnet already reads all of it. The useful split is:

1. **Reader (Sonnet 5.5, as today):** the full read.
2. **Planner (code, not a model):** from the first read, builds the **gaps**: a kind found for some sectors of the zone but not all (UD d28, d40–d42 are such), and the agreement signal between reads. Cheap, deterministic, testable.
3. **Executors (Haiku 5.5, several, small):** each answers one narrow question with the sentence and its context, never the whole chapter (« does this passage set a rule of kind K for sector S? »), at about a thousandth of a dollar each; or one whole-chapter Haiku read as a second opinion. **Every answer goes through the existing placement and verification**, so an executor cannot invent a rule: its passage must be in the text, its figure in the passage.

**Different models or the same one?** Errors of two reads of the same model are correlated through the prompt but not through sampling (that is the variance we see); errors of a different model are less correlated, at the price of a weaker reader (Haiku found 55% in 002.32, before the sectors and the guidance, and put rules under the wrong sector). So both are measured: Sonnet + Sonnet (free, saved runs) and Sonnet + Haiku (needs Haiku runs with today's prompt).

## Epics

### Epic 1 — A real merge (free, test first)

A pure function that merges the rules of several reads: group by kind, sector, statement, limit and strip; **a passage that overlaps another's is the same rule** (keep the longer; both offsets known); keep the **agreement count** (how many reads gave it). Tests on synthetic reads and on the saved runs. **Acceptance:** the merge of a run with itself changes nothing; merging two saved Sonnet runs leaves no duplicate the scorer counts.

### Epic 2 — The free measurement

Merge the saved guidance runs (2, 3), score the result, and **look at agreement as a filter**: of the extras and wrong values of the union, how many were given by only one read? If most are, a rule given by one read only can be shown as « to confirm » and the precision cost vanishes. **Acceptance:** the table above again, with the merge, and the agreement split of the extras.

### Epic 3 — The second model (about $0.15, on the owner's go)

Three Haiku 5.5 runs of the four zones with today's prompt (about $0.02 a run, Haiku's price for the whole plan in 002.32 was $0.02), scored alone and merged with Sonnet's saved runs. **Acceptance:** Haiku's own recall, wrong sectors and extras reported; the merged Sonnet + Haiku against Sonnet alone.

### Epic 4 — The executors, only if Epic 2 or 3 shows a gain worth their cost

The planner's gap list in code and the narrow Haiku question, as a harness variant first, measured by the rule below. Not built before then.

## The acceptance rule (fixed now)

An architecture ships only if, against the shipped single Sonnet read (same truths, same zones, three runs per side where it spends money):

- found rises by **at least 3 points** overall;
- **duplicates after the merge do not rise by more than 2** per run; wrong values and sector errors do not rise; extras rise by **no more than 3**, or the extra rules are shown as « to confirm »;
- **cost per chapter rises by no more than 25%** (this one the owner may change: it failed once at 15% and the owner shipped anyway).

## Not decided

Whether a rule given by one read only should be shown at lower confidence (the extension already has `to_confirm`); whether Haiku with the guidance stays honest on sectors; whether to prefer a second whole read over targeted executors once the numbers are in.

## Outcome (Epics 1 to 3, 2026-11-20)

- **Epic 1, built test-first:** `tools/evaluate-reading/merge.mjs` (`mergeReads`: overlap-based merge, the longer passage, the best confidence, every condition once, an agreement count and the readers), 9 tests. The service suite: 312 tests.
- **Epic 2, free:** `tools/measure-merge.mjs` on the three saved Sonnet runs. The real merge has about a third of the naive union's duplicates (10.3 against 29.7 for two reads). Merge of 2: 85.7 found (from 82.3), extras 5.0 (from 3.0); **keeping rules given by 2 of 3 reads: 85.0 found with the extras and duplicates of a single read, at three times the cost.**
- **Epic 3, $0.085:** three Haiku 5.5 runs of the four zones with today's reading. **Haiku alone finds 69.5 of 87 (79.9%, runs 1 and 2; run 3's Gordes call failed and is left out)** with 9.5 extras a run; merged with a Sonnet read it adds **half a rule for about 8 extras**.
- **Verdict by the rule:** Sonnet + Sonnet meets the found condition (+3.4) and fails duplicates (+2.6) and cost (+100%); Sonnet + Haiku fails found (+0.5 rule), duplicates and extras. Full tables: [second-reads-2026-11-20.md](../measurements/second-reads-2026-11-20.md).
- **What this says:** a whole-chapter second read is a poor trade at today's prices: the variance it removes (about 3 to 4 rules) costs as much as the first read. The flaky rules are concentrated in a few patterns (sector enumerations on the four-sector zone, the two-limits and table cases of Gordes), so a **targeted** second read of those is the only form left worth trying (Epic 4), and **a held-out zone** comes before it.
