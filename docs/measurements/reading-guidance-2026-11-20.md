# PLU reading — the guidance variant (Sprint 002.37), 2026-11-20

Evidence for a decision, not a decision. Sonnet 5.5, four zones, 87 truth rules, **three runs per side**, the same code (Sprints 002.35 and 002.36) and the same truths. Baseline: the shipped prompt (run 1 is the 002.34 run's saved answers replayed through the current code; runs 2 and 3 are fresh). Variant: `--variant guidance`, the shipped instructions plus the block in `GUIDANCE` (`extract.mjs`). Spend: $0.28 + $0.29 (baseline 2 and 3) and $0.46 + $0.40 + $0.39 (guidance) = **$1.82**. Run folders: `reading-runs-2026-11-20-{replay-002-36,base37-r2,base37-r3,guid37-r1,guid37-r2,guid37-r3}`.

## Result

| zone          | truth  | baseline found (3 runs) | mean             | guidance found (3 runs) | mean             | Δ points  |
| ------------- | ------ | ----------------------- | ---------------- | ----------------------- | ---------------- | --------- |
| Gordes A      | 19     | 12, 13, 12              | 12.3             | 17, 19, 19              | 18.3             | **+31.6** |
| Lyon UCe1     | 15     | 13, 13, 14              | 13.3             | 15, 14, 13              | 14.0             | +4.4      |
| Pays d'Aix UC | 8      | 8, 7, 8                 | 7.7              | 8, 8, 8                 | 8.0              | +4.2      |
| Pays d'Aix UD | 45     | 38, 35, 33              | 35.3             | 44, 39, 33              | 38.7             | +7.4      |
| **all four**  | **87** |                         | **68.7 (78.9%)** |                         | **79.0 (90.8%)** | **+11.9** |

Wrong values per run 1.3 → 0.7; sector errors 0 → 0; extras 3.3 → 3.0. **Cost per run (four zones, live runs only): $0.281 → $0.416 (+48%)**, almost all of it output tokens (13,834 → 26,995; input 71,219 → 73,167). Rules read 118 → 136.

## The acceptance rule (fixed before any run, Sprint 002.37)

| condition                               | result              |
| --------------------------------------- | ------------------- |
| overall recall up by at least 4 points  | **met** (+11.9)     |
| no zone down by more than 3 points      | **met** (none down) |
| wrong values not up                     | **met** (1.3 → 0.7) |
| sector errors not up                    | **met** (0 → 0)     |
| extras up by no more than 3             | **met** (−0.3)      |
| cost per chapter up by no more than 15% | **NOT MET** (+48%)  |

**By the rule it does not ship.** The rule is the owner's to keep or to change; it was set before the absolute figures were known. In dollars the extra is about **$0.03 per chapter** (a Lyon-size zone $0.06, a UD-size zone $0.08), paid once per zone and shared server-wide afterwards.

## What the runs show besides

- **Where it helps:** Gordes (a cap in a list of permitted uses, two limits in one sentence, the PPRIF table rows) goes from 12 to 18 of 19; UD +3.4 rules. What is still missed on Gordes, in some runs only: g17 (two limits), g18 (the table).
- **What it costs:** the model reads more carefully and writes about twice the output. Which of the six lines causes the output is not known (one bundle); an ablation would say.
- **UD still varies a lot** (44, 39, 33 of 45 under guidance; 38, 35, 33 baseline): its mean gain is within about one run's noise on that zone alone, the overall gain is not.
- **A new kind of refusal appears on UD under guidance** (10 over three runs, `refused-by-code`): the model offers `see_graphic` height rules for each sector with a passage that does not hold the word « graphique », and `statementInPassage` refuses them. A one-line prompt or check question, not a model failure.
- **Gordes extras (2.3 per run under guidance) look like truth gaps, not errors:** the pool cap « limitées à 80 m2 de surface de bassin » (pages 45 and 48) as `annex_max`, and « trois annexes ». The Gordes truth does not hold them. Not changed here: a truth gap is fixed for both sides after a cross-check (Sprint 002.32).

## Not measured

Haiku (not gated; the guidance may lift it more, at a tenth of the price); the effect of each line; a fresh run on a zone outside the four.

## After the decision

The owner chose to ship it despite the cost condition (2026-11-20). In the harness the runs recorded `variant: guidance` are today's shipped reading; the earlier prompt is `--variant unguided`.
