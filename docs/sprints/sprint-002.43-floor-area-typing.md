# Sprint 002.43 — A Cap On The Total Floor Area Is Not An Extension Cap

> **Status:** Part A (accepted extras in the scorer) built and kept. **Part B (the prompt line) measured and not shipped: the pre-registered rule is not met.** Uncommitted. The owner asked to address the open items (2026-11-20).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service/src/extract.mjs` (`GUIDANCE`, `PROMPT_VERSION` 5 → 6), `tools/evaluate-reading/score.mjs`.
>
> **Found by:** [002.41](sprint-002.41-held-out-zones.md): in one UE run the model typed « dans la limite de 200 m2 de surface de plancher totale par unité foncière » as `extension_max` for eight sectors (8 extras). The sentence caps the **total floor area of the plot**, not the extension: `floor_area_max`.

## Two things

### A. What the truth left out is not an extra (built, test first)

The truth's `crossCheck.notAdopted` records what the cross-check weighed and left out (alternative rules with no figure, siting distances, the Gordes pool basin of 80 m²…), and the truths' scope notes say these are « never counted as an extra », but the scorer only exempted whole kinds. A read rule on the same **page** as a not-adopted item, whose passage and the recorded quote share their first 40 characters, is now **accepted**: counted apart (`counts.accepted`, `details.accepted`), no longer an extra. The Gordes pool cap is therefore **not a truth gap**: it was considered and left out on purpose, in 002.32. 2 tests; the service suite 323.
**Effect on the saved answers (replayed, same code):** extras 3.0 → 1.7 a run on the tuned zones, 4.7 → 3.3 on the held-out zones; found, wrong values and sector errors unchanged (the definition of an extra changed, so the earlier reports' extras are as then defined).

### B. One guidance line (the prompt revision)

`GUIDANCE` gains: **floor area — a cap on the total floor area of a plot or a building (« dans la limite de 200 m2 de surface de plancher totale par unité foncière », « 300 m2, existant, extension et constructions annexes cumulés ») is `floor_area_max`, never `extension_max`; `extension_max` is the limit on the extension itself (its share of the existing floor area, or its own area).** `PROMPT_VERSION` 6. The release 0.7.0 is unreleased and already forces a one-time re-read, so the bump costs a deployment nothing more.

## The acceptance rule (fixed now)

Both sides **three runs of Sonnet 5.5** on the tuned zones (87 rules) and on the held-out zones (69 rules), on the revised truths and with the accepted-extras scorer. **Baseline = the current reading** (prompt 5), its saved answers replayed through today's code ($0), so only the new prompt costs money (about $2). Ships if:

- found does not fall by more than **1 rule** (mean of three runs) in either set;
- wrong values and sector errors do not rise;
- extras (as now defined) do not rise;
- **the effect it is for:** no `extension_max` rule in m² of 100 m² or more is read on a sentence about the total floor area (counted in the UE and UF runs), against the baseline's;
- cost per run rises by no more than **10 %**.

Otherwise the line is dropped and the sprint closes as a measured negative; the truths are not changed to fit the result.

## Not done / not decided

Whether the line moves other typings is what the measurement shows. The remaining held-out misses (five « described » strip heights missing in some runs, and the duplicated UEc green row) are run-to-run noise and get no line.

## Outcome (2026-11-20)

**A. Kept.** `isAccepted` in the scorer, 2 tests; the suites pass. The Gordes pool cap is not a truth gap: it was weighed in 002.32 and left out on purpose.

**B. Measured, not shipped.** Three live runs of each set with prompt version 6 (the floor-area line), $1.82 in all (held-out $0.245, $0.217, $0.220; tuned $0.340, $0.395, $0.403), against the current reading's saved answers replayed (prompt 5), both scored on the revised truths with the accepted-extras scorer.

| set                | found per run (mean)    | wrong | sector errors | extras per run | extension cap of 100 m² or more read | cost per run |
| ------------------ | ----------------------- | ----- | ------------- | -------------- | ------------------------------------ | ------------ |
| tuned, prompt 5    | 84, 85, 78 (82.3 of 87) | 0.7   | 0.0           | 1.7            | 0, 3, 3                              | $0.416       |
| tuned, prompt 6    | 74, 83, 83 (80.0)       | 0.3   | 0.3           | 3.7            | 0, 0, 0                              | $0.379       |
| held-out, prompt 5 | 64, 68, 69 (67.0 of 69) | 0.0   | 1.0           | 3.3            | 0, 0, 8                              | $0.227       |
| held-out, prompt 6 | 64, 62, 64 (63.3)       | 0.0   | 2.0           | 0.7            | 0, 0, 0                              | $0.227       |

| condition                                       | result                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| found down by no more than 1 rule in either set | **not met** (−2.3 tuned, −3.7 held-out)                                     |
| wrong values not up                             | met                                                                         |
| sector errors not up                            | **not met** (0.0 → 0.3 tuned, 1.0 → 2.0 held-out)                           |
| extras not up                                   | **not met** on the tuned zones (1.7 → 3.7); met on the held-out (3.3 → 0.7) |
| no floor-cap extension rule read (the purpose)  | **met** (2.33 → 0 a run)                                                    |
| cost no more than +10%                          | met (−5.7%)                                                                 |

**By the rule it does not ship, and the line and prompt version 6 were reverted** (test first; `PROMPT_VERSION` back to 5, a test now pins that the guidance holds no floor-area line).

**Why (from the triage, not a second try):** the line removed its target and made the model **reluctant on every extension-related rule**: in the held-out UE the five « described » strip heights of an extension (e13 to e17) went missing in every run, and on the tuned zones the extension caps of Gordes (g14, g15) and UD (d38, d39, d16, d17, d23) went missing more often. Telling the model « never extension_max » next to a rule about extensions moved its whole reading of extensions. **A second wording is not tried here:** it would have to be a new sprint with its own rule, and the floor-area extra it fixes appeared in one run of three; the cost of an extra (a rule in the list that the user can dismiss) is smaller than the cost of a missed rule.

**Left open (small):** a total floor-area cap typed `extension_max` stays an occasional extra. If it matters, the place to fix it is the **extension** (it can tell a floor-area cap from an extension cap by its figure and words), not the prompt.
