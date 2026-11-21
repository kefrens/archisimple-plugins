# PLU reading — three held-out zones (Sprint 002.41), 2026-11-20

Evidence for a decision, not a decision. **Bouc-Bel-Air** (INSEE 13015), the commune the owner chose: three zones of the Pays d'Aix regulation (part B, the document the reading was tuned on) that **no prompt line, check or fixture was written for**: **UG** (pages 181–188, 11 truth rules), **UF** (189–196, 17), **UE** (197–209, 41; sectors UEm, UEa, UEa1, UEa2, UEb, UEc, UEp, UEp1). **69 truth rules.** Drafted from the text before any model read the zones, cross-checked blind by a second model (Fable 5.2: 11 of 11, 12 of 13 and 41 of 41 of the draft found exactly; four UFa rules added after it; see each truth's `crossCheck`), the figures of the chapters checked for completeness. **Not validated by the owner.** Read three times with the shipped reading (Sonnet 5.5, with the guidance; the replay cache off; folders `reading-runs-2026-11-20-heldout-r1..3`); **$0.226, $0.220, $0.236** a run for the three zones. No truth and no part of the reading was changed after the first read.

## Result

| zone          | rules  | found, three runs | recall    | wrong values | extras (three runs) |
| ------------- | ------ | ----------------- | --------- | ------------ | ------------------- |
| UG            | 11     | 11, 11, 11        | 100%      | 0            | 0, 0, 0             |
| UF            | 17     | 17, 17, 17        | 100%      | 0            | 0, 4, 2             |
| UE            | 41     | 34, 33, 34        | 82–83%    | 0            | 3, 10, 27           |
| **all three** | **69** | **62, 61, 62**    | **89.4%** | **0**        | **3, 14, 29**       |

The tuned four zones: 94.6% (82.3 of 87), 0.7 wrong values and 3.0 extras a run. No sector error on the held-out zones (UF reads one rule under another sector in two runs, which the scorer counts as found with a sector error).

## Against the reading fixed beforehand (Sprint 002.41)

| outcome                                                                          | held-out result                |
| -------------------------------------------------------------------------------- | ------------------------------ |
| found within 10 points of 94.6% (84.6% or more) and wrong values at most 1 a run | **met**: 89.4%, 0 wrong values |

**By the rule the gains generalise**: five points below the tuned zones, inside the band. Three things qualify it.

## What qualifies it

1. **UG and UF are short and plain; UE is the real test, and it scores 82–83%.** Two of three held-out zones at 100% flatter the average.
2. **The misses are one pattern, in every run: 7 of the 7 UE misses (e11 to e17).** The alternative rule of articles 4.2.1 and 4.2.2: « la hauteur totale de l'extension soit inférieure ou égale à 4 mètres » in a strip « inférieure au retrait défini par la règle générale ». The model returns the 4 m with a strip, the strip's depth is written in no verified passage or condition (the strip is the setback, a figure given elsewhere), and the 002.21 safety rule turns it into a statement in words, `described`. **That is the product's rule working as designed, and the same as UD d05, which no run ever found.** The truth lists these as plain limits (a convention taken from UD d05), so **eight truth rules (UD d05 and UE e11–e17) are the truth's convention against the product's rule, not the model's failure.** Read as `described` they would be found: UE would be 41 of 41 and the held-out recall 98 to 100%. Not changed here.
3. **Precision is weaker on UE than on the tuned zones: extras 3, 14, 29 against 3.0.** What the extras are (run 3, 27 on UE): the same `described` alternative rule given for every sector of the zone (the sectors-in-code expansion of « all » turns one sentence into nine near-identical rules: 10 `described` road-setback rules, 9 `described` height rules — the 4 m strip height read as « described » for seven sectors, plus UEp's technical-need exception for UEp and UEp1), and the 200 m² ceiling on the total floor area of a dwelling plot, typed `extension_max` instead of the floor-area kind and expanded to eight sectors. **None is a wrong figure** (wrong values 0). They are rules that exist in the text but that the truth leaves out by convention; the blind reader had listed the same items. A user would see a long list of identical « described » rules per sector.

## What this does not say

- **Same document and layout as the tuned UC and UD:** it tests the rules, the sectors and the guidance on new text, not a new regulation format. The « another metropolitan PLUi » and « older small-commune PLU » axes are open.
- The truths were cross-checked by a model, not validated by the owner; the drafter's conventions (alternative rules with no figure left out; a plain 4 m for the strip rule) shaped the misses and the extras alike.
- Three runs of three zones: UE's extras vary from 3 to 27 between runs.

## Decisions this opens (the owner's)

1. **The extension alternative height rule (8 truth rules):** keep the truth as plain 4 m limits (then the product's `described` is a recurring miss and the strip rule should find the depth in the setback), or list them as `described` (the product is right, recall about 98–100%).
2. **A described alternative rule given for every sector:** collapse an « all » expansion of a `described` rule into one zone-level rule? (A product change: nine identical statements in words are noise.)
3. **« Dans la limite de 200 m² de surface de plancher totale » typed extension_max:** a guidance line to type a total floor-area cap as `floor_area_max`.

## After Sprint 002.42 (the owner's decisions, applied; replayed at $0)

On the owner's go: the eight « 4 m in a strip of unstated depth » truth rules (UD d05, UF f03, UE e11 to e17) are `described`; a depth equal to the height's own figure must be written twice; a `described` rule for « all » is one rule of the zone. **The same saved answers, scored on the revised truths: 96.7% before the code change, 97.1% after** (63, 68, 69 then 64, 68, 69 of 69), wrong values 0, extras 7.3 to 4.7 a run, rules read 197.7 to 156.0. **Most of the rise from 89.4% is the truth revision, not the model or the code**; the code adds one rule and removes noise. The tuned zones do not move (94.6%, 9 fewer rules read). Sprint [002.42](../sprints/sprint-002.42-strip-depth-and-described-all.md).

## After Sprint 002.43 (the extras defined as the truth defines them)

The scorer now reports a read rule on a sentence the truth recorded as « not adopted » as **accepted**, apart from the extras (the Gordes pool cap, the alternative rules with no figure, the siting distances). On the same saved answers the held-out extras are 3.3 a run (from 4.7) and the tuned zones' 1.7 (from 3.0); the earlier tables' extras are as defined then. A prompt line for the floor-area typing was tried (version 6) and **not shipped**: it fixed its target and lost recall on extension-related rules (held-out 67.0 → 63.3 of 69, tuned 82.3 → 80.0 of 87). Sprint [002.43](../sprints/sprint-002.43-floor-area-typing.md).
