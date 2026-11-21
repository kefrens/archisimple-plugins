# Sprint 002.42 — A Depth Is Not The Height, And A Rule With No Figure Is One Rule

> **Status:** Implemented in the working tree (2026-11-20), uncommitted. Two code changes built test-first and measured by **replaying the saved answers** (the held-out and the tuned runs): **$0, no model call**. The owner approved them and the truth revision ("ok as per your recommendation"). No schema or prompt change, so no version bump; it rides in the unreleased 0.7.0.
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service/src/extract.mjs` (`verifiedStrip`, `expandedItems`), eight truth rules.
>
> **Found by:** [002.41](sprint-002.41-held-out-zones.md), the held-out zones of Bouc-Bel-Air.

## Goal

The held-out UE chapter showed three things: a plain 4 m limit in the truth where the text gives no strip depth; an invented strip depth that the check let through; and nine copies of one sentence with no figure.

## What was built (test first)

1. **A depth that is the height's own figure is not a depth** (`verifiedStrip`). In UF run 1 the model returned « inférieure ou égale à 4 mètres » as a 4 m limit with a strip of depth **4 m**: the depth « verified » because « 4 mètres » is in the passage, being the height. A depth equal to the limit's figure must now be written **twice** (« de 0 à 4 mètres … inférieure ou égale à 4 mètres » still passes; the second occurrence may sit in a verified condition). A depth that differs from the height needs its figure once, as before. The 002.42 test replaces an older one (`strip-depth-in-condition`) that pinned the old behaviour, a 3.5 depth « verified » by a 3.5 height.
2. **A `described` rule for « all » is one rule of the zone** (`expandedItems`): a sentence with no figure says the same in every sector. A list of sectors the text names, and every other statement (a limit, `not_regulated`, `see_graphic`), still expands to one rule per sector.
3. **Eight truth rules revised, on the owner's decision:** UD d05, UF f03 and UE e11 to e17 (the 4 m height of an extension in a strip of unstated depth) are `described`, not 4 m limits; each truth carries a `revisions` entry with the reason. The draft's plain 4 m was a convention taken from UD d05 and contradicts the 002.21 rule.

Tests: 7 new (`described-all-and-strip-depth.test.mjs`), 1 corrected. The service suite: 321 tests.

## Measured (replayed, $0; the old results are re-scored on the revised truths, so both sides use the same truths)

|                                 | found, three runs | mean             | wrong values | extras per run | rules read per run |
| ------------------------------- | ----------------- | ---------------- | ------------ | -------------- | ------------------ |
| **held-out (69 rules), before** | 63, 68, 69        | 66.7 (**96.7%**) | 0            | 1, 3, 18 (7.3) | 197.7              |
| **held-out, after**             | 64, 68, 69        | 67.0 (**97.1%**) | 0            | 1, 3, 10 (4.7) | **156.0**          |
| **tuned zones (87), before**    | 84, 85, 78        | 82.3 (94.6%)     | 0.7          | 3, 3, 3        | 140.3              |
| **tuned zones, after**          | 84, 85, 78        | 82.3 (94.6%)     | 0.7          | 3, 3, 3        | 131.0              |

**Where the held-out figure comes from:** 89.4% (002.41) to 96.7% is the **truth revision**, not the code: the same answers, scored on truths that now call the 4 m rule « described ». The code adds **one rule** (UF run 1, whose invented depth is now refused and the rule read as `described`, as the truth says), **cuts the extras by a third** (7.3 to 4.7 a run; the worst run, 18 extras, falls to 10) and the **rules read by a fifth** (197.7 to 156.0), with **nothing lost on the tuned zones** (the same found, the same wrong values, 9 fewer rules per run).

## What is left on the held-out zones

UE run 1 finds 36 of 41 (runs 2 and 3: 40 and 41); the extras of run 3 that remain (10) are mostly the 200 m² floor-area ceiling typed `extension_max` (item 3 of the held-out report, left for the next prompt revision). The same-document limit of the held-out test stands.

## Not done

Not walked in the editor. The extension's own `mentionsStrip` safeguard (a height limit written with a strip's words but read without one) was not changed. The older `reading-runs-2026-11-20-heldout-r*` files keep the scores they were written with (the 89.4%); the table above is the re-score.
