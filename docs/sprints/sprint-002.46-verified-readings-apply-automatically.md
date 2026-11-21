# Sprint 002.46 — Verified Readings Apply Automatically

> **Status:** **Epic 1 and Epic 4's first half built** (2026-11-21), uncommitted, not walked in the editor. Epics 2 and 3 and Epic 4's sector half are next. The first draft's gate was **corrected by measurement** (see Baseline and Outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.25.0** (planned), `sdkVersion` unchanged (no new status: an automatic application is a `confirmed` rule with a visible reason). The service is touched only in Epic 4.
>
> **Found by:** the owner's PLU reading on the NUC (PLU2.archiproject, 2026-11-21): « I would like for the rules to be detected and applied automatically », and a look at « confiance faible ».
>
> **Revises:** [Sprint 002.22](sprint-002.22-decided-automatically.md) DEC-2 « Never confirmed » for one class only: readings that can be checked against their own text. Ruled-out and informational decisions are unchanged.

## Goal

A written rule that **checks out against its own text** is applied without a click, visibly and reversibly. What cannot be checked stays for a person. The user can override any automatic application with one click, and the override stands over it, as for the decisions of 002.22.

## Baseline (measured 2026-11-21, free: the saved readings of the tuned, held-out and other-document zones, three runs each, 1,031 rules)

| What happens to a reading today               | rules   | share |
| --------------------------------------------- | ------- | ----- |
| ruled out or for information (002.22, 002.26) | 85      | 8%    |
| applies without shaping the area (batch)      | 67      | 6%    |
| **verified reading (batch, one click)**       | **118** | 11%   |
| left to a person, one by one                  | **761** | 74%   |

Why the 761 stay open (first blocker; the sum is the 761): sector not placed 204 (27%); a « see the graphic » statement 123 (16%); a condition the panel cannot read 110 (14%); low or medium confidence with the sector placed 187 (25%); an exception 60 (8%); a statement in words 55 (7%); other 22.

**The confidence label does not predict correctness** (9 runs, scored against the truths, duplicates and out-of-scope rules apart): rules read **high** are right 94% of the time, **low** 93%, **medium** 73% (the worst: 2 wrong values, 3 wrong sectors). « Low » means a placement doubt (the sentence repeats across sectors, the sector code is not in the chapter) or a hedge, not a wrong figure.

**The label-free gate of the first draft was wrong, and the service's new `doubts` show why.** Ignoring the label but keeping the text checks applied 154 instead of 118; the 36 gained are **all** readings that **lost a quoted condition** (`condition-not-found`, which can make a rule read wider than it is) or that **the model itself hedged** (`model-medium`, where every wrong value and every wrong sector of the nine runs sits: 2 and 3). The label hid the difference; the causes show it. By cause (9 runs, replayed at $0): no doubt 596 readings, 24 extras, no wrong value; `model-medium` 178, **5 wrong**; `sentence-repeated` 93, none wrong; `condition-not-found` 49, none wrong but unsafe.

**What can be applied safely, and the ceiling of each lever** (zero doubts, text checks kept; 0 wrong values and 0 wrong sectors at every step; extras in brackets):

| Lever                                                                                                 | applied  | of 1,031 |
| ----------------------------------------------------------------------------------------------------- | -------- | -------- |
| today's verified batch                                                                                | 118 (6)  | 11%      |
| + a condition the panel does not read yet (**ceiling of Epic 2**: an upper bound, conditions ignored) | 228 (7)  | 22%      |
| + the sector not placed (Epic 4, second half)                                                         | 324 (9)  | 31%      |
| + an exception                                                                                        | 383 (10) | 37%      |

The first step is therefore small and honest: **the verified batch (118) and the « applies without shaping the area » batch (67) apply with no click**, 18% of the readings. The rest comes from teaching the panel to read what blocks, **never from loosening the gate**.

## Decisions

- **DEC-1 — An automatic application is `confirmed`, with its reason.** The rule keeps its card and gains one condition line (« Appliquée automatiquement : le chiffre est écrit dans le texte, sans condition ni exception à vérifier »). No SDK change: the host already reads `confirmed`. A potential issue and the buildable area use it at once.
- **DEC-2 — The gate is the text and the doubts, not the label.** A reading applies automatically when: its statement is a limit with a value or a ratio; the figure is written, in its own unit, in the quoted passage; its sector is placed in the chapter; it has no strip and no exception; every condition is one the panel reads (002.26's `conditionReadable`, widened by Epic 2); and **the service lists no doubt of the reading** (`doubts` empty, or only `sentence-repeated`, a placement doubt with no wrong value in 93 readings). `model-*`, `condition-not-found`, `figure-not-in-text`, `comparison-disagrees`, `strip-not-in-text` and `formula-read-as-fixed` keep a reading for a person. A result read before `doubts` existed has none: it is gated by `confidence: high`, as today, until it is read again.
- **DEC-3 — Visible and reversible.** The applied rules are folded in a section « Appliquées automatiquement (n) » with a summary, an explanation, the cards, and on each **« Rétablir »** (one rule back to « to confirm ») and **« Rétablir tout »**. A notice says how many were applied and how many are left.
- **DEC-4 — The user's decision stands over.** A stored confirmation or « Does not apply » decides; a rule the user brought back is looked at one by one and is not applied again (the `broughtBack` entries of 002.22). A new version of the document asks again, as everywhere.
- **DEC-5 — Only written rules**; entered rules, drawn rules and rules with an exception, a strip or a statement in words are never applied automatically.
- **DEC-6 — The reading card and the AI panel count them** (« 154 lues, 85 écartées, 154 appliquées, 40 à décider »), from the same numbers the view shows.

## Epics (test first)

1. **The gate and the application.** `autoAppliedOf` (pure, exported to the tests) and its use where 002.22's automatic decisions are made; the section, the notice, `Rétablir` and `Rétablir tout`; the counts. Tests on the recorded Marseille and Lyon results and on the saved evaluation readings.
2. **Widen what the panel reads.** The conditions that block most (measured): « en l'absence de linéaires de gabarit » (23), « dans l'ensemble de la zone UC » (9), the agricultural-use condition (9), « une seule construction à usage d'annexe » (6), the pool-basin subject (10, a subject that narrows the rule: only when the passage itself is for pools). Each is added only with a test that shows what it decides and what it leaves.
3. **Why a reading is doubtful.** Replace the single « Lecture peu sûre » with its reason (sentence repeated across sectors / sector not in the chapter / figure not found in the text / condition not found / formula not read). The extension already knows two of them; the others need Epic 4.
4. **The service says why** (optional field `doubts`, no schema or prompt bump, so no re-read) and the **sector placement** (204 readings blocked by « sector not placed ») is looked at on the saved answers before any change.

## Pre-registered acceptance (before any build; replayed on the 1,031 saved readings, $0)

Epic 1 is accepted only if **all** hold; otherwise the gate is narrowed, never the rule:

1. **0 wrong values and 0 wrong sectors** among the applied readings, in all three sets (tuned, held-out, other document), scored against the truths.
2. **Extras among the applied at most 6%** of them (today's verified batch: 5%).
3. **Epic 1 applies exactly the readings the two batches hold today** (118 and 67 on the saved readings, no more: it removes a click, it widens nothing). **Epic 2 is accepted only if** each condition it learns to read adds applied readings with the same 0 and the extras at most 6%, and the rules whose condition it still cannot read stay with a person.
4. A stored decision of the user is never overwritten; a brought-back rule is not applied again; read-only sections list the applied rules with no action.
5. The service suite and the extension suite pass; the extension version and `CHANGELOG.md` say what changed and that **the automatic application is new behaviour**.

## Not in this sprint

The « see the graphic » statements (123, 16%): they carry no figure to apply, and need a way to read the graphic (the plan, not the text). Rules with an exception (60). Using agreement between two reads as the signal (costs a second read). Making the platform's AI budget visible (config: `usage.enabled` on the NUC, a sealed `ACCOUNT_USAGE_TOKEN` in both secrets).

## Risks to say plainly

- A wrongly applied rule shapes the buildable area until someone reopens it. The mitigations are the visible section, the reason on each card and the one-click `Rétablir tout`; the evidence is **0 wrong in 154** on saved readings whose truths were drafted by models and not validated by the owner. A sample the owner validates is the missing evidence.
- « Extras » (5%) are rules the truth does not list: some are real rules the truth omits, some are readings that should not exist (a pool cap read as a limit). They would be applied; the section is where they would be seen.

## Outcome (2026-11-21)

**Built, test first.** Service: `doubts` on every placed rule (8 tests; the Lyon recorded fixture replayed with the field, only that field differs). Extension **0.25.0**: `autoApplyAllowed`; the two batches applied without a click (`confirmed`, reason on the card, computed on every read, nothing stored); the « Appliquées automatiquement » section with a notice, « Rétablir » on each and « Tout rétablir » (one write, digest-checked); a per-project switch (`autoApply: false`) with « Ne plus appliquer automatiquement » and its way back; nothing applied when there is no writable section (the user could not bring a rule back); the reading card's « Appliquées automatiquement ». Suites: service 319 (317 pass, 2 skipped), extension 607 (605 pass, 2 skipped), gateway 18.

**Pre-registered rule, replayed on the 1,031 saved readings ($0):**

| Criterion                                                                                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 0 wrong values, 0 wrong sectors among the applied                                                                        | **met**: 129 applied, 0 and 0 (scored on the 118 verified readings: 81 right, 20 duplicates of a rule already read, 6 extras, 11 in no truth's scope)                                                                                                                                                                                                                                                                       |
| 2. extras at most 6% of the applied                                                                                         | **met**: 6 of 129 = 4.7%                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3. Epic 1 applies exactly what the two batches hold today (118 + 67)                                                        | **not met as written, deliberately**: 129, not 185. The 118 verified readings all apply; of the 67 « apply without shaping the area » rules, **only 11** do: the other 56 were hedged by the model (`model-medium` or `model-low`) and wait for a person, because every wrong value and wrong sector of the nine runs sits under `model-medium`. The deviation is in the safe direction; the rule's words were not changed. |
| 4. a stored decision is never overwritten; a rule brought back is not applied again; read-only sections list with no action | **met** (tests; the read-only case is covered by the stored-shape test, not by a view walk)                                                                                                                                                                                                                                                                                                                                 |
| 5. suites pass; version and changelog say it is new behaviour                                                               | **met**                                                                                                                                                                                                                                                                                                                                                                                                                     |

**What the measurement cannot say.** The 67 « apply without shaping the area » rules (parking, connections) are in **no truth's scope**: their correctness against the text was not scored, so « 0 wrong » is evidence for the 118 verified readings only. The truths were drafted by models and cross-checked, not validated by the owner.

**Existing tests revised on purpose.** 002.22 DEC-2 and 002.26 assert that nothing is confirmed on the user's behalf and that the two batch sections exist; they are about deciding by hand. Their section stores (`written`, `written-strip`, `project`, `grouping`, `questions` tests) now read an empty project as `{ schema: 1, autoApply: false }` (the manual flow they test), and the 002.25 tests set `autoApply: false`. The batch sections, the batch click and the « never confirmed » statements are unchanged and still tested, in manual mode; the new behaviour has its own file (`auto-apply.test.mjs`, 9 tests).

**Not done.** Epic 2 (the conditions that block most, measured ceiling 22%), Epic 3 (the reason on the card instead of « Lecture peu sûre »), Epic 4's second half (sector not placed: 204 readings), exceptions (60), « see the graphic » (123). A **walk in the real editor** (the section, the buttons, the switch, the reading card) and on the NUC; the sample of truths the owner validates. Enabling the AI budget meter on the NUC (`usage.enabled`, a sealed `ACCOUNT_USAGE_TOKEN`) is configuration, not this sprint.
