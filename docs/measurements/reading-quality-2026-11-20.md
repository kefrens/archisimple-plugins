# PLU reading quality — first measurement, 2026-11-20

Sprint 002.32 (Epic 4). **Evidence for decisions, not a decision.** Nothing in the product was changed to make this measurement: prompt version 3, schema version 1, the extraction exactly as it ships. The per-pair results are in `reading-runs-2026-11-20/` and the figures below are generated from them (`reading-quality-2026-11-20.csv` has every column).

## What was measured

Four zones, each read once by three model settings through the real extraction (`extractChapter`), then scored against the zone's truth: the rules of the kinds the buildable area uses (setbacks, distances between buildings, footprint, extension and annex limits, heights, green ratio), with page and quote.

| Zone          | Truth    | Validation                                                           | What it is                                                             |
| ------------- | -------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Lyon UCe1     | 15 rules | **the owner** ("ok for now")                                         | PLU-H of the Métropole de Lyon, two sectors                            |
| Pays d'Aix UC | 8 rules  | independent cross-check by a second model, reconciled by Claude Code | no sectors                                                             |
| Pays d'Aix UD | 45 rules | the same                                                             | four sectors (UDa, UDa1, UDa2, UDb); one sentence often covers several |
| Gordes A      | 19 rules | the same                                                             | an older fourteen-article PLU, with a risk table                       |

**The three cross-checked truths are not validated by the owner.** They were drafted from the text, re-derived blind by a second model that never saw them, and reconciled (Sprint 002.32's Outcome). Two models agreeing is not a human reading. They count here because the owner chose this route.

Models: Claude Sonnet 5.5, Claude Haiku 5.5, and Claude Haiku 5.5 with the provider's effort set to `low` (accepted: its output was half of the default Haiku's, 12,400 tokens against 26,519). Tokens and cost are the AI service's own meter, at list prices. **Spent: $0.335** (estimated $0.34; ceiling $3). One call per chunk, no retries recorded.

## Overall (87 truth rules)

| model                          | found   | recall | wrong value | sector error | extra | output tokens | cost   |
| ------------------------------ | ------- | ------ | ----------- | ------------ | ----- | ------------- | ------ |
| anthropic:claude-haiku-5-5     | 48 / 87 | 55%    | 1           | 10           | 3     | 26519         | $0.020 |
| anthropic:claude-haiku-5-5@low | 39 / 87 | 45%    | 1           | 4            | 9     | 12400         | $0.013 |
| anthropic:claude-sonnet-5-5    | 56 / 87 | 64%    | 1           | 0            | 3     | 16085         | $0.301 |

## By zone

| zone          | model                          | found   | wrong value | sector error | missed | extra | duplicates | out of scope | verified | cost   | time   |
| ------------- | ------------------------------ | ------- | ----------- | ------------ | ------ | ----- | ---------- | ------------ | -------- | ------ | ------ |
| gordes-a      | anthropic:claude-haiku-5-5     | 11 / 19 | 1           | 0            | 7      | 1     | 1          | 5            | 100%     | $0.003 | 11.6 s |
| gordes-a      | anthropic:claude-haiku-5-5@low | 9 / 19  | 0           | 0            | 10     | 1     | 0          | 2            | 100%     | $0.002 | 7.9 s  |
| gordes-a      | anthropic:claude-sonnet-5-5    | 12 / 19 | 1           | 0            | 6      | 0     | 1          | 1            | 100%     | $0.051 | 15 s   |
| lyon-uce1     | anthropic:claude-haiku-5-5     | 8 / 15  | 0           | 0            | 7      | 1     | 2          | 16           | 100%     | $0.007 | 29.4 s |
| lyon-uce1     | anthropic:claude-haiku-5-5@low | 10 / 15 | 1           | 0            | 4      | 3     | 1          | 13           | 100%     | $0.005 | 16.4 s |
| lyon-uce1     | anthropic:claude-sonnet-5-5    | 13 / 15 | 0           | 0            | 2      | 2     | 0          | 20           | 100%     | $0.135 | 41.8 s |
| pays-d-aix-uc | anthropic:claude-haiku-5-5     | 8 / 8   | 0           | 0            | 0      | 1     | 0          | 10           | 100%     | $0.004 | 24.6 s |
| pays-d-aix-uc | anthropic:claude-haiku-5-5@low | 7 / 8   | 0           | 0            | 1      | 3     | 0          | 1            | 100%     | $0.002 | 6.3 s  |
| pays-d-aix-uc | anthropic:claude-sonnet-5-5    | 8 / 8   | 0           | 0            | 0      | 0     | 0          | 1            | 100%     | $0.038 | 8.7 s  |
| pays-d-aix-ud | anthropic:claude-haiku-5-5     | 21 / 45 | 0           | 10           | 24     | 0     | 0          | 4            | 100%     | $0.006 | 29.7 s |
| pays-d-aix-ud | anthropic:claude-haiku-5-5@low | 13 / 45 | 0           | 4            | 32     | 2     | 0          | 3            | 100%     | $0.004 | 12.9 s |
| pays-d-aix-ud | anthropic:claude-sonnet-5-5    | 23 / 45 | 0           | 0            | 22     | 1     | 0          | 3            | 100%     | $0.077 | 23.5 s |

"Found" counts a rule read exactly or under another sector. "Out of scope" are rules the model read of kinds the truth does not cover (parking, fences, thresholds…): not scored. "Verified" is the share of read rules whose figure is in their quote and whose statement words hold: **100% everywhere**, so the product's own checks keep a model from giving an unquoted figure.

## What the numbers show

1. **Where Sonnet fails is omission, not error.** Across 87 rules it gave 1 wrong value, 0 sector errors and 3 extras; it did not find 31 (30 missing, plus the one wrong value). On a zone with no sectors (UC) it found 8 of 8; on Lyon 13 of 15.
2. **The big gap is sectors (UD).** All 22 of Sonnet's UD misses are sector-specific rules of the same sentences: the zone-level rule is read, but the items for UDa, UDa1, UDa2 and UDb are not (the prompt asks for one item per sector). Haiku finds about as many (21 of 45), but only 11 under the right sector: **10 are put under the wrong sector**; Haiku at low effort finds fewer (13 of 45, 4 of them under the wrong sector). On a zone with many sectors the reading is incomplete, not wrong.
3. **Tables are the second gap (Gordes).** Sonnet misses the risk table's rows and the totals (five `extension_max` rules) and the 250 m² dwelling footprint, but reads the main 30 % rule and the heights.
4. **Some "misses" are the same rule written another way.** Two of Sonnet's Lyon misses are rules it read in substance: the 3.50 m gabarit height as a `described` rule with no limit, and the 15 % pleine terre as a percent value instead of a ratio with a base. The scorer counts them as a miss plus an extra. Treating those representations as equivalent would put Sonnet at 15 of 15 on Lyon. Whether they are equivalent for the buildable area is a product question, not a scorer one.
5. **The three "wrong values" are not three errors.** Gordes, Sonnet and Haiku: the truth holds the 60 m² pool basin (article A 2) and not the 80 m² of article A 9, a judgment call the cross-check left open; both models read the 80 m² and the matcher paired it with the 60 m². That is a truth gap, not a model error. Lyon, Haiku at low effort: it read the ground floor's **minimum** height of 3.50 m as a façade height limit: a real error (the wrong rule).
6. **Cost against recall.** Sonnet cost $0.301 for the four zones, Haiku $0.020 (15 times less); Haiku found 9 points fewer overall (55 % against 64 %) and put 10 rules under the wrong sector. The gap is large on Lyon (87 % against 53 %), small on Gordes and UD, none on UC. **Low effort is not a free saving**: it halves the output tokens and the cost (from $0.020 to $0.013) but loses ten more points of recall and adds extras (9 against 3).
7. **Haiku's output is dominated by something other than the answer.** 26,519 output tokens for the same visible work that Sonnet does in 16,085, and about half of it disappears at low effort: consistent with the thinking tokens suspected on 2026-11-20. This run did not measure them directly.
8. **The figure-coverage proxy did not help.** It is low (4 of 16 on the UC chapter for a perfectly read zone) because most figures in a chapter belong to kinds outside the truth's scope. It is in the CSV and out of the argument.

## What this suggests, without deciding

- **Keep Sonnet as the reading model.** Haiku is not defensible on a zone with several sectors (sector errors, omissions); its saving is cents per chapter, and a chapter is read once and shared.
- **Sectors are the first thing to improve (Sprint 002.33).** The 2026-11-20 NUC trace showed the opposite symptom (the same rule repeated for each sector); here the model under-expands. Either way a **sector list per item, expanded in code**, would take the expansion off the model, and this harness can measure whether it helps. It is a hypothesis to test, not a result.
- **Tables are the second candidate (Sprint 002.34's reconciliation pass).** Worth building only if a repeat of this measurement still shows it.
- **Decide how strict "the same rule" is** (the representation differences of point 4) before comparing a change: it moves recall by several points on its own.

## Three runs of every pair (added the same day)

The plan was run twice more (36 runs in all, **$0.98** in total: $0.335, $0.320, $0.325). Every figure above is the first run; this is how much a pair moves. Per-run rows are in `reading-quality-2026-11-20-three-runs.csv`.

| zone          | model                          | found per run   | mean       | range | wrong value per run | sector error per run | extra per run |
| ------------- | ------------------------------ | --------------- | ---------- | ----- | ------------------- | -------------------- | ------------- |
| gordes-a      | anthropic:claude-haiku-5-5     | 11, 9, 10 / 19  | 10.0 (53%) | 2     | 1, 0, 0             | 0, 0, 0              | 1, 1, 0       |
| gordes-a      | anthropic:claude-haiku-5-5@low | 9, 9, 9 / 19    | 9.0 (47%)  | 0     | 0, 0, 0             | 0, 0, 0              | 1, 0, 1       |
| gordes-a      | anthropic:claude-sonnet-5-5    | 12, 12, 11 / 19 | 11.7 (61%) | 1     | 1, 1, 2             | 0, 0, 0              | 0, 0, 0       |
| lyon-uce1     | anthropic:claude-haiku-5-5     | 8, 10, 11 / 15  | 9.7 (64%)  | 3     | 0, 0, 0             | 0, 0, 0              | 1, 2, 3       |
| lyon-uce1     | anthropic:claude-haiku-5-5@low | 10, 11, 7 / 15  | 9.3 (62%)  | 4     | 1, 0, 0             | 0, 0, 0              | 3, 4, 7       |
| lyon-uce1     | anthropic:claude-sonnet-5-5    | 13, 12, 12 / 15 | 12.3 (82%) | 1     | 0, 0, 0             | 0, 0, 0              | 2, 2, 2       |
| pays-d-aix-uc | anthropic:claude-haiku-5-5     | 8, 6, 7 / 8     | 7.0 (88%)  | 2     | 0, 1, 0             | 0, 0, 0              | 1, 3, 3       |
| pays-d-aix-uc | anthropic:claude-haiku-5-5@low | 7, 7, 7 / 8     | 7.0 (88%)  | 0     | 0, 0, 0             | 0, 0, 0              | 3, 3, 2       |
| pays-d-aix-uc | anthropic:claude-sonnet-5-5    | 8, 8, 8 / 8     | 8.0 (100%) | 0     | 0, 0, 0             | 0, 0, 0              | 0, 0, 0       |
| pays-d-aix-ud | anthropic:claude-haiku-5-5     | 21, 22, 18 / 45 | 20.3 (45%) | 4     | 0, 0, 0             | 10, 0, 7             | 0, 1, 0       |
| pays-d-aix-ud | anthropic:claude-haiku-5-5@low | 13, 8, 8 / 45   | 9.7 (21%)  | 5     | 0, 4, 4             | 4, 2, 2              | 2, 3, 2       |
| pays-d-aix-ud | anthropic:claude-sonnet-5-5    | 23, 21, 27 / 45 | 23.7 (53%) | 6     | 0, 0, 0             | 0, 0, 0              | 1, 1, 3       |

**Overall recall per run** (87 truth rules): Sonnet **64 %, 61 %, 67 %** (mean 64 %); Haiku 55 %, 54 %, 53 % (mean 54 %); Haiku at low effort 45 %, 40 %, 36 % (mean 40 %). Cost per run: Sonnet $0.279 to $0.301, Haiku $0.020 to $0.024, Haiku at low effort $0.013 to $0.017.

What the three runs change or confirm:

- **Sonnet is stable except where there are sectors.** Zone UC: 8 of 8 three times. Lyon and Gordes: a range of one rule. **UD: 23, 21, 27** (a range of six rules, 13 points). The conclusions about Sonnet stand; a difference of one rule on a zone other than UD is noise.
- **The misses on UD are mostly systematic.** Of the 45 UD rules, **17 were missed in all three runs**, 8 in some, and 20 found in all three. So a bit over a third of UD is out of reach as the reading stands, not a matter of luck. That supports taking the sector expansion out of the model.
- **Haiku's wrong-sector errors are unstable: 10, 0 and 7 on UD.** Not a steady fault but a frequent one, which is worse to rely on. Its recall is steady (55, 54, 53 %).
- **Low effort is worse and noisier**, confirmed: recall 45, 40, 36 %; wrong values 1, 4, 4; extras 9, 10, 12. On UD it found 13, 8, 8 of 45. Its saving (about a third of Haiku's cost) is not worth it.
- **The Gordes "wrong value" for Sonnet is steady** (1, 1, 2): it is the 80 m² pool basin of article A 9 against the 60 m² in the truth, as explained above, not a drifting error.
- **What a gain would have to be to count.** The mean of three Sonnet runs on UD is 23.7 of 45 with a standard deviation of about 2.5 rules. A change judged on three runs per side can detect a difference of roughly four to five rules (about 10 points) on UD; anything smaller is inside the noise. Sprint 002.33's acceptance rule is set on that scale.

## Sectors in code (Sprint 002.33): the first change, measured against the baseline

The model now says **where** a rule applies (`appliesTo`: the zone, all of it, or a list of sector codes) and the code gives one item per sector, each then going through the existing verification. Behind an option (`sectorsInCode`); the shipped reading is unchanged. Three runs of the new reading with Sonnet 5.5 and Haiku 5.5 (24 runs, **$0.948**) against the three baseline runs above, same truths. The acceptance rule was fixed before the build.

| zone          | model                       | found per run   | mean       | range | wrong value per run | sector error per run | extra per run |
| ------------- | --------------------------- | --------------- | ---------- | ----- | ------------------- | -------------------- | ------------- |
| gordes-a      | anthropic:claude-haiku-5-5  | 12, 11, 10 / 19 | 11.0 (58%) | 2     | 1, 1, 2             | 0, 0, 0              | 2, 0, 0       |
| gordes-a      | anthropic:claude-sonnet-5-5 | 11, 13, 12 / 19 | 12.0 (63%) | 2     | 2, 1, 1             | 0, 0, 0              | 0, 0, 0       |
| lyon-uce1     | anthropic:claude-haiku-5-5  | 11, 10, 10 / 15 | 10.3 (69%) | 1     | 0, 1, 0             | 0, 0, 1              | 2, 4, 3       |
| lyon-uce1     | anthropic:claude-sonnet-5-5 | 13, 13, 12 / 15 | 12.7 (84%) | 1     | 0, 0, 0             | 0, 0, 0              | 2, 2, 2       |
| pays-d-aix-uc | anthropic:claude-haiku-5-5  | 8, 8, 8 / 8     | 8.0 (100%) | 0     | 0, 0, 0             | 0, 0, 0              | 2, 3, 2       |
| pays-d-aix-uc | anthropic:claude-sonnet-5-5 | 8, 8, 8 / 8     | 8.0 (100%) | 0     | 0, 0, 0             | 0, 0, 0              | 0, 0, 0       |
| pays-d-aix-ud | anthropic:claude-haiku-5-5  | 36, 32, 33 / 45 | 33.7 (75%) | 4     | 0, 0, 0             | 0, 0, 0              | 2, 4, 0       |
| pays-d-aix-ud | anthropic:claude-sonnet-5-5 | 36, 38, 35 / 45 | 36.3 (81%) | 3     | 0, 0, 0             | 0, 0, 0              | 3, 3, 0       |

|                                               | baseline (3 runs, mean)                  | sectors in code (3 runs, mean)            |
| --------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| **Sonnet, UD** (45 rules)                     | 23.7 found (53 %)                        | **36.3 (81 %)**: runs 36, 38, 35          |
| Sonnet, Lyon / UC / Gordes                    | 82 % / 100 % / 61 %                      | 84 % / 100 % / 63 %                       |
| **Sonnet, overall** (87)                      | 55.7 (64 %)                              | **69.0 (79 %)**                           |
| Sonnet, sector errors / wrong values (3 runs) | 0 / 1, 1, 2                              | 0 / 2, 1, 1                               |
| Sonnet, cost per run (4 zones)                | $0.291                                   | $0.290 (no change)                        |
| Haiku, UD                                     | 20.3 found (45 %), wrong sector 10, 0, 7 | **33.7 (75 %)**, wrong sector **0, 0, 0** |
| Haiku, overall                                | 47.0 (54 %)                              | 63.0 (72 %); cost +21 %                   |

**Against the acceptance rule: all five conditions are met.** UD recall rose by 28 points (the rule asked for 10, and the noise on UD was 2.5 rules: this is five times that); no other zone lost anything (Lyon +2, UC 0, Gordes +2 points); sector errors stayed at 0; wrong values did not rise (they are the Gordes 60/80 m² truth gap, unchanged); cost per chapter did not rise. **By the rule fixed beforehand, it ships.** Haiku, not gated, gains as much (+30 points on UD) and its wrong-sector errors vanish; its cost rises about a fifth because it writes more.

Two things the numbers do not say:

- **Duplicates on UD for Sonnet: 10, 10, 0.** In two runs the model said "all" for rules the truth holds at the zone level (the 4 m road setback, the footprint deferral to the graphic plan) and the code expanded them to each of the four sectors; for the heights of article 4.5.1, which the text states for UD, UDa, UDa1 and UDa2, it also applied them to UDb. The scorer does not penalise these (they are not extras), but the last one is a small over-application. Whether a zone-wide rule should be given once or once per sector is a convention the extension already tolerates (it treats a sector-less rule as the zone's).
- **No unknown sector was ever returned** (`dropped.unknownSector` is 0 in all 24 runs): given the list, the models copied codes correctly.

## Sonnet's extras, classified (the owner accepted this reading)

Across the three runs Sonnet gave 11 extras (3, 3 and 5). **Every one is a truth rule restated in another form; none is a new rule and none is wrong.** Three forms recur: Lyon's 3.50 m gabarit height read as a `described` façade rule with no limit (truth r13), Lyon's 15 % pleine terre read as a percent value instead of a ratio on the plot (truth r14), and UD's 3.50 m façade height in the strip read as `described` for UDa (and, in one run, UDa1 and UDa2; truth d18 to d20). So Sonnet's "extra" count is a count of representation differences, and the same rules also appear as "missed" in the same runs. Whether the buildable area needs the figure as a limit rather than in words is a product question; it argues for making the reading give the figure whenever the text states one.

## Limits of this measurement

- **Three runs per pair, four zones.** A model's answer varies from run to run (above); three runs bound that variation without removing it. The four zones are one commune style each; UC is easy, UD is hard, and the overall figures weigh UD (45 of 87 rules) heavily.
- **The truths were fixed before the run** and were not changed after it. Three of the four are cross-checked by a second model, not validated by the owner; Lyon is the owner's.
- **Extras are not classified.** Sonnet's three are listed in the run files; whether each is valid and missing from the truth, or wrong, is for the owner.
- **A model's cost here is list price from the AI service's meter**, one chunk per call, no cache.


## Note on variant names (after the switch-on)

The runs in `reading-runs-2026-11-20`, `-r2` and `-r3` were made before the sectors-in-code reading shipped and record no variant: they are the **earlier reading** (what `--variant previous` now runs). The `-sic-r1..3` runs record `sectors-in-code`: that is the reading the service now ships (a run made today without `--variant` records `shipped`).
