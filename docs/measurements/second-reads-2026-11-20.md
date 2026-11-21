# PLU reading — what a second read adds (Sprint 002.39), 2026-11-20

Evidence for a decision, not a decision. Saved runs only, merged by `tools/evaluate-reading/merge.mjs` (a rule is the same rule when its kind, sector, statement, limit and strip are equal and its passages overlap in the chapter's text; the longer passage is kept; an agreement count says how many reads gave it) and scored by `tools/measure-merge.mjs`. **Sonnet 5.5**: the three guidance runs of 002.37, replayed through the placement fixes of 002.35, 002.36 and 002.38 (`…-guid37-replay-002-38-r1..3`, mean found 82.3 of 87, **$0.416 per run of the four zones**). **Haiku 5.5**: three live runs with the same shipped reading (`…-haiku39-r1..3`, **$0.085 for the three, one of them with a failed Gordes call**). 87 truth rules.

## Haiku alone

**Run 3 is not a reading:** its Gordes call never answered (a provider failure after 1,594 s, `chunks.failed` 1, no rules), and the harness recorded the pair as finished with 0 rules found. It is left out below; the three-run mean the CLI shows (64.0 of 87) is wrong because of it. **Runs 1 and 2:** 69 and 70 of 87 found (**mean 69.5, 79.9%**) against Sonnet's 82.3 (94.6%); wrong values 1.5 (Sonnet 0.7), sector errors 0, **extras 9.5 (Sonnet 3.0)**, duplicates 3.0. Cost $0.029 and $0.031 a run (Sonnet $0.416): a fifteenth. Not a replacement for Sonnet.

## Sonnet + Sonnet (saved runs)

| reading                              | found | wrong values | extras | duplicates | cost |
| ------------------------------------ | ----- | ------------ | ------ | ---------- | ---- |
| one read                             | 82.3  | 0.7          | 3.0    | 7.7        | 1×   |
| merge of 2 (mean of 3 pairs)         | 85.7  | 0.0          | 5.0    | 10.3       | 2×   |
| merge of 3                           | 86.0  | 0.0          | 6.0    | 12.0       | 3×   |
| merge of 3, rules given by ≥ 2 reads | 85.0  | 0.0          | 3.0    | 7.0        | 3×   |

The naive union (no overlap matching) had 29.7 and 44.0 duplicates: the merge removes most of them. Extras given by 2 or 3 reads are probably truth gaps (the Gordes pool cap), not noise.

## Sonnet + Haiku (a Sonnet read and the Haiku read of the same repetition; runs 1 and 2)

| pair     | Sonnet alone | merged          | extras                | duplicates            |
| -------- | ------------ | --------------- | --------------------- | --------------------- |
| run 1    | 84           | 85.0            | 13                    | 20                    |
| run 2    | 85           | 85.0            | 10                    | 10                    |
| **mean** | **84.5**     | **85.0 (+0.5)** | **11.5 (Sonnet 3.0)** | **15.0 (Sonnet 7.7)** |

Keeping only rules **both** models gave: 58 and 67 found, 1 extra at most. A Haiku second opinion adds half a rule at the price of about eight and a half extras.

## Against the acceptance rule of Sprint 002.39

| condition                                             | Sonnet + Sonnet (2 reads)          | Sonnet + Haiku          |
| ----------------------------------------------------- | ---------------------------------- | ----------------------- |
| found up by at least 3 points overall                 | **met** (+3.4 rules = +3.9 points) | **not met** (+0.5 rule) |
| duplicates up by no more than 2 per run               | **not met** (+2.6)                 | **not met** (about +7)  |
| wrong values, sector errors not up                    | met                                | met                     |
| extras up by no more than 3 (or shown « to confirm ») | met (+2.0)                         | **not met** (+8.5)      |
| cost up by no more than 25%                           | **not met** (+100%)                | met (+7%)               |

**No architecture tested ships under the rule.** The closest, a second Sonnet read, buys +3.4 rules for double the cost; a rule given by 2 of 3 Sonnet reads is as precise as one read and finds +2.7, for triple the cost.

## Not measured

The narrow Haiku executors (Epic 4): they read a sentence and its context for a gap the code found, so they would not add Haiku's whole-chapter noise, but they have not been built, and whole-chapter Haiku finds fewer rules than Sonnet. A held-out zone (the four zones were used to tune the prompt).

## A flaw in the harness this showed

A pair whose chunk failed (`chunks.failed` > 0, no answer) is written as a finished pair with 0 rules and is skipped on resume. The runner should mark it, keep it out of the tables and re-run it. Candidate for a small fix; not made here.
