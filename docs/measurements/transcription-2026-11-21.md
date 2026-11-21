# Free local transcription against Sonnet, and the first live reading of an uploaded document (Sprint 002.30)

**Date:** 2026-11-21. **Tool:** `tools/measure-transcription.mjs` (scorer `tools/measure-transcription/score.mjs`, 16 unit tests). **Live tool:** `tools/measure-uploaded-reading.mjs`. Raw live output: `uploaded-reading-2026-11-21.json` (the rules and their passages, no transcript, no image). Reference corrections: `transcription-reference-corrections-2026-11-21.json`.

**Material.** Pages 59 to 75 (17 pages) of the Peynier lotissement règlement, a scan with no text layer, rendered at 1,568 px. Only the règlement's own pages were used; no page of residents' letters left the machine, and no page image, no transcript and no page text is committed (only counts, the corrections' notes, and the rules the live run read, which are the règlement's own words).

## The decision rule, registered before any candidate was scored

A local route is offered as a choice beside Sonnet only if, on the 17 pages, all hold: **G1** figures with a unit recovered at least **95 %** (X); **G2** article numbers recovered at least **95 %** (Y); **G3** wrong figures at most **2 %** of the candidate's figures; **G4** words recovered at least **90 %**; **G5** no page that holds a figure is empty or cut off. Recall is the sum found over the sum to find (not an average of pages). Stamps, rotation, handwriting, time and cost are reported, never gates. Why these numbers: the sprint, Epic 1.

## Result

| Candidate                                       | G1 figures                                              | G2 articles | G3 wrong figures                     | G4 words | Time per page                                                                            | Cost                                                           | Rule                                           |
| ----------------------------------------------- | ------------------------------------------------------- | ----------- | ------------------------------------ | -------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| **qwen/qwen3-vl-8b** (LM Studio, 192.168.1.172) | 98.1 % (**85.7 % without the one table page**)          | 99.5 %      | 1.0 % (5.3 % without the table page) | 95.2 %   | mean 12.9 min, from 3.7 to 35 min; **3 h 39 min for the 17 pages**                       | $0                                                       | **passes all five: offered**                   |
| **qwen/qwen3-vl-8b** (LM Studio on the owner's Mac, M5 Pro 24 GB; added the same day, see the addendum) | 98.6 % (**85.7 % without the table page**) | 99.5 % | 0.5 % (5.3 % without the table page) | 95.0 % | mean 46 s, from 9 to 141 s; **13.0 min for the 17 pages** | $0 | **passes all five: offered** |
| mlx-community/paddleocr-vl-1.6 (an OCR model, LM Studio on the Mac; prompt « OCR: ») | 30.5 % (90.5 % without the table page, which it reads at 45 of 189) | 99.0 % | 12.3 % | 89.3 % | 60 s for the 17 pages | $0 | **fails G1, G3, G4, G5** (page 68 cut off): not offered |
| tesseract.js 6 (French data), in process        | 7.6 % (75.2 % with « m° » read as « m² »)               | 92.2 %      | 91.1 %                               | 89.8 %   | 0.3 to 1.8 s, except 595 s on the rotated plan                                           | $0                                                       | fails G1, G2, G3, G4                           |
| Haiku 5.5 (the 2026-11-20 run, for scale)       | 91.0 % (100 % without the table page, which it cut off) | 98.5 %      | 0.0 %                                | 95.2 %   | 3.7 to 14.7 s                                                                            | $0.022 for the 17 pages                                        | fails G1, G5 (page 74 cut off at 4,096 tokens) |
| Sonnet 5.5 (the reference)                      | —                                                       | —           | —                                    | —        | 3.9 to 13.5 s, and 88.6 s for the table page; 224 s for the 17 pages through the service | **$0.322 for the 17 pages** (measured by the platform's meter) | —                                              |

**By the pre-registered rule, a local route is offered as a choice (qwen3-vl-8b).** Read the rest before relying on that. **The owner decided on 2026-11-21 to offer BOTH routes, Sonnet and a local model (the sprint's O1 is resolved): see the addendum at the end.**

### What the pass is made of, and what it hides

- **One page carries the figures.** The table of 91 lots (page 74) holds 189 of the 210 figures with a unit. The local model read 188 of them (one wrong). On the other 16 pages it found 18 of 21 figures (85.7 %): the 3 missed are two plan labels (page 68) and one figure it misread (« 750 » as « 760 »). The rule is on all 17 pages, as registered, and it passes; the figures outside the table are few and the sample is one document.
- **Three real digit errors, found by looking at the page images** (the reference is not ground truth): « 750 m² » read « 760 m² » (page 65, article 16-03, a figure of a rule), « 308 m² » read « 200 m² » (page 74, lot 137), and the article number « 15-03 » read « 16-03 » on the stamped, annotated page 67 — **the very failure Haiku made on 2026-11-20**. The page footer confirms 15-03. None was flagged by the model: a figure like these is « verified » against the transcript that holds it. The 99.5 % of article numbers is over 200 numbers, which is why one miss does not show.
- **Two pages degenerated.** Pages 67 (stamps, handwriting, a plan) and 69 (a rotated plan) came back as a long run of « [illisible] » until the 4,096-token cap, **35 minutes each**, flagged cut off. They hold no figure, so G5 does not apply to them; the transcript of page 69 holds 11 % of the reference's words. The same model also missed the labels « 16 m » and « 8 m » on the plan of page 68.
- **Time.** 3 h 39 min for 17 pages, one at a time, against 224 s for Sonnet. The web proxy in front of the companion service waits two minutes, so **a local route cannot be a synchronous request per page**: it needs an asynchronous job the extension polls. This is the main cost of building the choice and it is why it was not built in this sprint.
- **Tesseract** reads the digits of ordinary text (the article numbers of pages 60, 63 and 64 are nearly all there) but writes « m² » as « m° », « m? » or « mê », so no surface survives the strict rule (G1 75 % with the unit forgiven, which is informational only: the reading checks a figure with its unit), and it reads the table page as 153 wrong figures. It is not a candidate.

### Corrections made to the reference after looking at the page images

1. Page 68, the label « 16 m » beside the road is on the image and missing from the Sonnet transcript: added to the reference (it was found by comparing with Haiku).
2. Page 74, lot 181 is printed « 2.031 m² » with a dot as the thousands separator: normalised to « 2 031 m² » (a formatting difference, not a misreading).

Sonnet's own errors against the page images, on the differences found: one omitted plan label (« 16 m »). Every other difference from the local model, from tesseract and from Haiku that was checked on the image was the candidate's error, except the formatting above.

### Per page

### lmstudio

| page | figures | articles | wrong | words   | seconds          |
| ---- | ------- | -------- | ----- | ------- | ---------------- |
| 59   | 0/0     | 1/1      | 0/0   | 96.4 %  | 332.8            |
| 60   | 0/0     | 31/31    | 0/0   | 100.0 % | 219.8            |
| 61   | 1/1     | 10/10    | 0/1   | 98.7 %  | 611              |
| 62   | 0/0     | 20/20    | 0/0   | 98.1 %  | 636.3            |
| 63   | 5/5     | 23/23    | 0/5   | 98.7 %  | 416.9            |
| 64   | 5/5     | 23/23    | 0/5   | 96.8 %  | 733.9            |
| 65   | 4/5     | 13/13    | 1/5   | 99.2 %  | 701.7            |
| 66   | 0/0     | 11/11    | 0/0   | 94.5 %  | 556.9            |
| 67   | 0/0     | 0/1      | 0/0   | 66.7 %  | 2107 (cut off)   |
| 68   | 0/2     | 1/1      | 0/0   | 85.2 %  | 312.2            |
| 69   | 0/0     | 0/0      | 0/0   | 10.7 %  | 2097.9 (cut off) |
| 70   | 0/0     | 1/1      | 0/0   | 96.2 %  | 324.7            |
| 71   | 0/0     | 13/13    | 0/0   | 98.7 %  | 573.4            |
| 72   | 0/0     | 23/23    | 0/0   | 100.0 % | 597.5            |
| 73   | 0/0     | 15/15    | 0/0   | 100.0 % | 654.4            |
| 74   | 188/189 | 2/2      | 1/189 | 100.0 % | 1643.8           |
| 75   | 3/3     | 18/18    | 0/3   | 100.0 % | 606.6            |

- G1 figures with a unit recovered: **98.1 %** (at least 95.0 %) → pass
- G2 article numbers recovered: **99.5 %** (at least 95.0 %) → pass
- G3 wrong figures among the candidate's: **1.0 %** (at most 2.0 %) → pass
- G4 words recovered: **95.2 %** (at least 90.0 %) → pass
- G5 no page with a figure empty or cut off: **0** (must be 0) → pass
- **Offered as a choice: yes** (the pre-registered, strict rule)
- info, units forgiven (m° read as m²): G1 98.1 %, G2 99.5 %, G3 1.0 %, G4 95.2 %
- info, without page 74 (the table of 91 lots, 189 of the figures): G1 85.7 %, G2 99.5 %, G3 5.3 %, G4 95.2 %
- info, without page 74, units forgiven: G1 85.7 %, G2 99.5 %, G3 5.3 %, G4 95.2 %

### tesseract

| page | figures | articles | wrong   | words  | seconds |
| ---- | ------- | -------- | ------- | ------ | ------- |
| 59   | 0/0     | 1/1      | 0/0     | 75.0 % | 0.3     |
| 60   | 0/0     | 30/31    | 0/0     | 94.9 % | 0.5     |
| 61   | 1/1     | 9/10     | 0/1     | 94.0 % | 0.8     |
| 62   | 0/0     | 19/20    | 0/0     | 93.8 % | 0.9     |
| 63   | 4/5     | 22/23    | 0/4     | 90.7 % | 0.9     |
| 64   | 5/5     | 20/23    | 0/5     | 91.9 % | 1.1     |
| 65   | 4/5     | 11/13    | 3/7     | 96.9 % | 0.9     |
| 66   | 0/0     | 10/11    | 0/0     | 91.5 % | 0.7     |
| 67   | 0/0     | 0/1      | 2/2     | 28.2 % | 1.2     |
| 68   | 0/2     | 1/1      | 1/1     | 51.9 % | 1.8     |
| 69   | 0/0     | 0/0      | 2/2     | 1.8 %  | 595.3   |
| 70   | 0/0     | 1/1      | 1/1     | 53.8 % | 1.7     |
| 71   | 0/0     | 12/13    | 0/0     | 96.9 % | 0.8     |
| 72   | 0/0     | 19/23    | 0/0     | 97.3 % | 0.8     |
| 73   | 0/0     | 15/15    | 0/0     | 98.8 % | 0.9     |
| 74   | 0/189   | 2/2      | 153/153 | 96.2 % | 0.9     |
| 75   | 2/3     | 18/18    | 1/3     | 99.5 % | 0.9     |

- G1 figures with a unit recovered: **7.6 %** (at least 95.0 %) → FAIL
- G2 article numbers recovered: **92.2 %** (at least 95.0 %) → FAIL
- G3 wrong figures among the candidate's: **91.1 %** (at most 2.0 %) → FAIL
- G4 words recovered: **89.8 %** (at least 90.0 %) → FAIL
- G5 no page with a figure empty or cut off: **0** (must be 0) → pass
- **Offered as a choice: no** (the pre-registered, strict rule)
- info, units forgiven (m° read as m²): G1 75.2 %, G2 92.2 %, G3 20.6 %, G4 89.8 %
- info, without page 74 (the table of 91 lots, 189 of the figures): G1 76.2 %, G2 92.2 %, G3 38.5 %, G4 89.8 %
- info, without page 74, units forgiven: G1 85.7 %, G2 92.2 %, G3 33.3 %, G4 89.8 %

### claude-haiku-5-5

| page | figures | articles | wrong | words   | seconds        |
| ---- | ------- | -------- | ----- | ------- | -------------- |
| 59   | 0/0     | 1/1      | 0/0   | 64.3 %  | 11.3           |
| 60   | 0/0     | 31/31    | 0/0   | 100.0 % | 3.7            |
| 61   | 1/1     | 10/10    | 0/1   | 95.4 %  | 9.2            |
| 62   | 0/0     | 20/20    | 0/0   | 97.1 %  | 10.7           |
| 63   | 5/5     | 23/23    | 0/5   | 99.3 %  | 5.7            |
| 64   | 5/5     | 23/23    | 0/5   | 98.8 %  | 11.7           |
| 65   | 5/5     | 13/13    | 0/5   | 99.2 %  | 14.7           |
| 66   | 0/0     | 11/11    | 0/0   | 93.3 %  | 8.2            |
| 67   | 0/0     | 0/1      | 0/0   | 76.9 %  | 6.1            |
| 68   | 2/2     | 1/1      | 0/2   | 100.0 % | 5.8            |
| 69   | 0/0     | 0/0      | 0/0   | 50.0 %  | 6.5            |
| 70   | 0/0     | 1/1      | 0/0   | 96.2 %  | 6              |
| 71   | 0/0     | 13/13    | 0/0   | 98.7 %  | 9.8            |
| 72   | 0/0     | 23/23    | 0/0   | 100.0 % | 8.7            |
| 73   | 0/0     | 15/15    | 0/0   | 100.0 % | 9.5            |
| 74   | 170/189 | 0/2      | 0/170 | 30.8 %  | 12.9 (cut off) |
| 75   | 3/3     | 18/18    | 0/3   | 100.0 % | 5              |

- G1 figures with a unit recovered: **91.0 %** (at least 95.0 %) → FAIL
- G2 article numbers recovered: **98.5 %** (at least 95.0 %) → pass
- G3 wrong figures among the candidate's: **0.0 %** (at most 2.0 %) → pass
- G4 words recovered: **95.2 %** (at least 90.0 %) → pass
- G5 no page with a figure empty or cut off: **1** (must be 0) → FAIL pages 74
- **Offered as a choice: no** (the pre-registered, strict rule)
- info, units forgiven (m° read as m²): G1 91.0 %, G2 98.5 %, G3 0.0 %, G4 95.2 %
- info, without page 74 (the table of 91 lots, 189 of the figures): G1 100.0 %, G2 99.5 %, G3 0.0 %, G4 96.1 %
- info, without page 74, units forgiven: G1 100.0 %, G2 99.5 %, G3 0.0 %, G4 96.1 %

## The first live reading through the service's own routes (Epic 4)

Sonnet 5.5 on pages 59 to 75 through `POST v1/uploads/transcriptions` (one request a page) then `POST v1/uploads/readings`, against the platform's AI service with the platform's meter (price table 2026-11-19). **Spend: $0.406 in all** against an estimate of $0.42 (range $0.24 to $0.67).

| Step                                   | Calls | Input tokens | Output tokens | Cost          | Time                    |
| -------------------------------------- | ----- | ------------ | ------------- | ------------- | ----------------------- |
| Transcription (usage kind `assistant`) | 17    | 40,545       | 24,068        | $0.322 | 224 s (page 74: 88.6 s) |
| Extraction (kind `extract`), 2 parts   | 2     | 27,559       | 2,899         | $0.084 | 14.9 s                  |

- **The transcription's cost reproduces the 2026-11-20 measure** (40,545 input tokens, 24,068 against 24,233 output tokens, $0.322 against $0.323) through the new path, which sends a plain chat call with room for 8,192 tokens: no page was cut off.
- **Fidelity of the new transcripts against the earlier Sonnet ones** (same scorer): figures 100 %, article numbers 100 %, wrong figures 0 %, words 98.8 %, no page lost. The route is stable on this document.
- **The extraction read 14 rules** from 17 pages: 5 m minimum setbacks from the boundaries and the road (4 items, pages 63 and 75), a 20 m² cap on annexes, a 21,021 m² SHON total (low: a condition was not found), a 30 m length limit, a setback relative to a height, and 6 statements in words. 4 are `high`, none has a value missing from its passage, and the checks counted 1 schema-invalid item, 1 incoherent, 2 conditions not found verbatim and 2 unknown sectors. **Recall is not measured**: no truth was drafted for this document, so « 14 of how many » is unknown; no height limit was read from these pages. The prompt still says « zone chapter of a PLU ».
- **One document, one run**: nothing is claimed for other layouts, other scans or other days.

## What is not measured

Recall of the extraction on a lotissement (no truth); other documents; a second run (variance); the local model with a smaller output cap or another prompt (the loops might not occur); another local model; handwriting beyond the one page; the browser OCR of another engine.

## Addendum A: the same models on the owner's Mac, and the guard's check (2026-11-21)

**Machine and software.** The owner's Mac (M5 Pro, 24 GB), LM Studio at `http://localhost:1234/v1`, the same 17 pages (59 to 75) rendered at 1,568 px, the same transcription instruction, one page per request, a 4,096-token output cap, scored by the same scorer against the same corrected reference. Raw runs and scores are in the session's scratchpad (`local-mac-qwen3vl8b`, `local-mac-paddle-all`), **not committed**: they hold the transcribed text of private règlement pages, and only numbers are used here.

### qwen/qwen3-vl-8b on the Mac passes the pre-registered rule

| Condition                         | Slow host (192.168.1.172, no GPU) | The Mac | Threshold |
| --------------------------------- | --------------------------------- | ------- | --------- |
| G1 figures with a unit            | 98.1 %                            | 98.6 %  | 95 %      |
| G2 article numbers                | 99.5 %                            | 99.5 %  | 95 %      |
| G3 wrong figures                  | 1.0 %                             | 0.5 %   | 2 %       |
| G4 words recovered                | 95.2 %                            | 95.0 %  | 90 %      |
| G5 page with a figure cut off     | 0                                 | 0       | 0         |
| Time, 17 pages                    | **3 h 39 min**                    | **13.0 min** (mean 46 s a page, 9 s to 141 s) | not a gate |
| Pages that looped to the cap      | 67 and 69, 35 min each            | 67 and 69, **140 s** each | |

- **The model's fidelity is the same on both machines; the time is not.** The same model took 3 h 39 min on the slow host and 13 min here: **speed depends on the machine, by a factor of about seventeen**. A local route's duration is therefore **not known in advance**; the estimate says so, and shows Sonnet's measured 13 s a page for comparison (and the two measured local figures: 46 s a page here, about 13 minutes a page on the CPU-only host).
- **One digit error is still unflagged:** « 750 » read « 760 » on page 65. Without the table page (74, which holds 189 of the 210 figures) G1 is **85.7 %**, as on the slow host: the pass is thin and rests on one page. The two other errors found on the slow host's run (308 read 200 on page 74; the article number 15-03 read 16-03 on page 67) did not recur here: page 74 read 189 of 189 figures with none wrong, and page 67 was one of the two loops (no article number to misread). One run each: nothing is claimed about the variance.
- **The loops are the same pages** (67: stamps, handwriting, a plan; 69: a rotated plan): a run of « [illisible] » lines to the 4,096-token cap (985 of 1,000 lines on 67), **no figure on either**, so G5 holds. Honest pages use 164 to 2,470 output tokens (the table, 2,470); a loop uses the cap.

### mlx-community/paddleocr-vl-1.6 (an OCR model): fails the rule, not offered

Prompt « OCR: » (the `paddlepaddle/` variant of the model does not load in LM Studio). **60 s for the 17 pages** (the fastest candidate), article numbers **99.0 %**, but figures with units **30.5 %** (90.5 % without the table page, which it reads at 45 of 189), wrong figures **12.3 %**, words **89.3 %**, and page 68 cut off. **Fails G1, G3, G4 and G5**: it reads text well and tables badly, and a figure that is wrong is « verified » against itself. Not offered.

### What the owner decided from these numbers (2026-11-21)

**Hybrid.** A local model is offered for the **transcription only** (qwen3-vl-8b passes the rule; paddleocr-vl does not and is not offered); **the extraction of the rules always runs on Sonnet 5.5**. A live check of the local extraction (one 3,400-character page of the same document, through a real AI service: 685 s, no rule read, where Sonnet read 14 rules from the 17 pages in 15 s) is why. A local reading therefore costs the extraction (about $0.08 for 17 pages) and never touches the AI budget for its transcription; the time of the transcription depends on the machine (13.0 min here, 3 h 39 on the slow host).

### The loop guard, checked against the real replies (numbers only)

`judgeTranscript` (`services/fr-urban-rules-service/src/loop-guard.mjs`, Sprint 002.30 Addendum A) run over the 17 qwen replies of the Mac and the 17 paddle replies, **after** it was written and tested on synthetic text:

| Run    | Pages judged degenerate (repetition ratio)                      | Honest pages judged degenerate |
| ------ | --------------------------------------------------------------- | ------------------------------ |
| qwen   | **67 (0.93) and 69 (0.99)**, both at the cap: exactly the loops | **0 of 15** (every ratio 0.00) |
| paddle | **68 (0.93, cut off)** and **69 (0.21, at the cap)**            | **0 of 15**                    |

The guard judges a **finished** reply: the AI service's plain `chat` route is not streamed, so a page cannot be stopped while it loops. What the guard buys is that a looping reply is **never handed to the extraction as a transcript**; what bounds the time lost is the output cap (4,096 tokens: 140 s here) and the page timeout. Stopping at the first repeated lines would need a platform change (a streamed `chat`, or a stop sequence): proposed in the sprint's addendum report.
