# PLU reading — another document and layout (Sprint 002.44), 2026-11-21

Evidence for a decision, not a decision. **Two older article-by-article PLUs**, unlike the Pays d'Aix part B the reading was tuned and held out on: **La Tour-d'Aigues** (Vaucluse, 2018; zones **UC** with its sub-sector UCa, pages 45–56, and **UD**, 57–65) and **Flaujac-Poujols** (Lot, 2013; zone **UB**, 12–16). **37 truth rules** (16, 12 and 9). The owner had no commune in mind; I chose them (small communes, a text layer, one regulation PDF of a few MB; a third candidate, a scan with no text layer, was left out).

**Truths:** drafted by **Opus 5.5** (a subagent that saw only the chapter, a written conventions file and the product's definitions: never another truth, never a reading), **cross-checked blind by Fable 5.2** (16 of 16, 12 of 12 and 6 of 6 rules of the draft found exactly; three real maximum distances at Flaujac-Poujols added: the same sentences set a minimum and a maximum), the figures of each chapter checked for completeness (nothing in scope uncovered). **Not validated by the owner.** Read three times with the shipped reading (Sonnet 5.5, prompt version 5, the replay cache off); folders `reading-runs-2026-11-20-otherdoc-r1..3`; **$0.172, $0.199, $0.173** a run for the three zones. No truth and no part of the reading was changed after the first read.

## Result

| zone                | rules  | found, three runs | wrong values | extras (three runs) |
| ------------------- | ------ | ----------------- | ------------ | ------------------- |
| La Tour-d'Aigues UC | 16     | 16, 16, 13        | 0            | 0, 1, 3             |
| La Tour-d'Aigues UD | 12     | 12, 12, 12        | 0            | 1, 1, 1             |
| Flaujac-Poujols UB  | 9      | 8, 9, 9           | 0            | 1, 1, 1             |
| **all three**       | **37** | **36, 37, 34**    | **0**        | **2, 3, 5**         |

**Mean 35.7 of 37 = 96.4%**, wrong values 0, no sector error. For comparison: the tuned four zones 94.6%, the Bouc-Bel-Air zones 97.1% (after Sprint 002.42).

## Against the reading fixed beforehand (Sprint 002.41)

| outcome                                           | result                         |
| ------------------------------------------------- | ------------------------------ |
| found 84.6% or more, wrong values at most 1 a run | **met**: 96.4%, 0 wrong values |

**The gains hold on another document and another layout.**

## The one defect it showed

The three misses of run 3 at UC (and its 3 extras) are **one pattern**: the setback « L au moins égal à la différence de niveau (H) moins 4 mètres, sans être inférieure à 4 mètres » (UCa on a side boundary, UCa detached, and the rest of the zone). The truth and the blind reader both type it `height_relative` (factor 1, offset −4, minimum 4); **in one run of three the model gave a plain « at least 4 m »**, dropping the formula, which is the **floor of the rule read as the whole rule** (it understates the setback for a tall building). Runs 1 and 2 got the formula right. A second, smaller one: Flaujac-Poujols' « 7 m à l'égout du toit » typed as another kind in run 1 (`height_total` for `height_facade`).

## What this does not say

- **Small:** three zones, 37 rules, from two small communes; each rule is 2.7 points. The zones are plain (UD has 12 rules).
- Truths drafted and cross-checked by models, not validated by the owner; the conventions I wrote shaped the drafter's choices (alternative rules with no figure not listed, river-bank setbacks left out).
- Two documents of two small communes; not a metropolis PLUi, not a table-heavy zone, not a PLU with a graphic regulation.
