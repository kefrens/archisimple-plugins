# Sprint 002.35 — Two Honest Fixes: The Scorer Reads A Share As The Extension Does, The Strip May Name Its Depth In A Condition

> **Status:** Implemented in the working tree (2026-11-20), uncommitted. Both fixes built test-first and measured by **replaying** the saved model answers of Sprint 002.34's run: **$0, no model call**.
>
> **Repository:** `archisimple-plugins` — `tools/evaluate-reading/score.mjs` and `services/fr-urban-rules-service/src/extract.mjs` (`placeItem`). No schema or prompt change, so no version bump; the placement change reaches users with the one-time re-read already announced for the sectors-in-code reading (002.33) in the same, unreleased, 0.7.0.
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md), reading-quality track. Follows [002.34 Harness Tools](sprint-002.34-harness-tools.md), whose triage found both.

## Goal

Two of 002.34's eight "decided by code or by the truths" misses were not the model's:

1. **Lyon r14** — « au minimum de 15% » read as `value 15 percent`; the truth says `ratio 15 plot_area`. The extension already treats them as one limit (`greenPercentOf`, `footprintPercentOf`); the scorer did not, so the harness reported a miss the product does not have.
2. **UD d18–d20 and Lyon r13** — the model returned `height_facade ≤ 3.5 m` with a strip of 4 m (5 m), but the depth sits in the clause before the sentence it quoted (« Dans une bande de 0 à 4 mètres … »). `verifiedStrip` only looked in the passage, so a correct reading was turned into "described" (the safety rule of 002.21).

## Epics

### Epic 1 — The scorer reads a share of the plot as the extension does (built)

For `footprint_ratio` (a maximum) and `green_ratio` (a minimum) only, `value … percent` and `ratio … of plot_area` are one limit in `matchRules`; also in the duplicate check. Any other base, any other direction and any other kind keeps its own spelling (a share of the existing footprint is not a share of the plot; an extension cap is not interchanged). The numbers still count (15% is not 20% in either spelling). **Truths are unchanged.** Baseline and new runs are scored by the same rule: recorded runs can be re-scored for nothing.
**Acceptance:** met — 2 tests (the equivalence, and where it stops).

### Epic 2 — The strip's depth may be written in a verified condition (built)

In `placeItem` the strip is now checked **after** the conditions are verified, against the passage plus the verified conditions. A condition is checked verbatim against the chapter text, so the strip is as grounded as when the depth sits in the passage; a condition the text does not hold gives no depth; a depth written nowhere is refused as before; a depth in the passage needs no condition. The condition that gave the depth stays on the rule.
**Acceptance:** met — 4 tests (`strip-depth-in-condition.test.mjs`); the 002.21 strip tests and the Marseille recording pass unchanged; the service suite 291 tests, 289 pass, 2 skipped.

## Outcome (measured, replayed, $0)

The 002.34 run's four Sonnet answers, replayed through the new placement and scored with the new scorer (`reading-runs-2026-11-20-replay-002-35`, 0 calls):

| zone          | found before      | found now         | extras before | extras now |
| ------------- | ----------------- | ----------------- | ------------- | ---------- |
| Gordes A      | 11 / 19           | 11 / 19           | 0             | 0          |
| Lyon UCe1     | 12 / 15           | 13 / 15           | 2             | 1          |
| Pays d'Aix UC | 8 / 8             | 8 / 8             | 0             | 0          |
| Pays d'Aix UD | 35 / 45           | 38 / 45           | 3             | 0          |
| **all four**  | **66 / 87 (76%)** | **70 / 87 (80%)** | 5             | 1          |

UD d18–d20 are found (the strip depth read from the condition); Lyon r14 is found (the scorer). Nothing was lost, no wrong value or sector error appeared, and the three UD extras (the same rules read as "described") are gone. **Lyon r13 stays missed on purpose:** its strip depth (5 m) is written in neither the passage nor a verified condition, so the code still refuses to call it a limit; the remedy is the prompt (ask the model to quote the clause that gives the depth), a later experiment.

## Not verified

One run, replayed: it shows what the code does with those answers, not how a fresh reading would vary (UD varied by six rules between runs in 002.33). The depth-from-condition rule accepts any number a verified condition writes that equals the depth: the same looseness as the passage test. No editor reading was made. The 15 remaining misses are in 002.34's table; **g07 and the footprint area are Sprint 002.36's.**
