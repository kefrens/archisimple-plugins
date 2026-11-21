# Sprint 002.41 — Held-Out Zones (Draft)

> **Status:** Built and measured (2026-11-20), uncommitted. The owner chose Bouc-Bel-Air and left the zones and the cross-check to the recommendation; UG, UF and UE read three times: **89.4% found (62, 61, 62 of 69), 0 wrong values, by the pre-registered reading the gains generalise**, with three qualifications in the report. $0.68 of readings.
>
> **Repository:** `archisimple-plugins` — `test-fixtures/fr-urban-rules/evaluation/`, `tools/evaluate-reading*`, a small fetch script.
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md), reading-quality track. Follows [002.40](sprint-002.40-failed-pairs-are-not-readings.md).

## Goal

Know whether the reading's **94.6%** (82.3 of 87 rules, Sonnet 5.5, shipped reading with the guidance) holds on zones it was **not tuned on**. The sectors-in-code expansion, the guidance block and the placement fixes were all aimed at the misses of the four zones of the evaluation set (Lyon UCe1, Pays d'Aix UC and UD, Gordes A). A new zone is the only honest test; this sprint measures it **once, blind, and reports whatever comes out**.

## What a held-out zone is here

A zone **no prompt line, check or fixture was written for**: its truth is drafted and cross-checked **before** its first reading, and **the reading is not changed to fit it** (a miss is reported, not fixed in this sprint; a fix would make it a tuning zone and a new held-out zone is then needed).

## Candidates (to confirm with the owner)

The repo holds regulation text only for Lyon and Gordes (both already in the set), so the documents come from the **Géoportail de l'urbanisme** (open data, Licence Ouverte v2.0, as in 002.32; the fetch is a public download, nothing about a user or project is sent). Chosen to differ from the four on the axes that moved the numbers:

| #            | what                                                                                                                         | why it differs                                                                                 | rough size               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| 1            | **Another zone of the Pays d'Aix document** (a dense urban zone with sectors, e.g. UB or UA)                                 | same layout, new rules and a different sector structure: tests the sector expansion beyond UD  | 1 chunk, cached document |
| 2            | **A zone of another metropolitan PLUi** (graphic coefficients, sector tables, a different outline)                           | tests `see_graphic`, tables and the outline detection on a document the code never saw         | 1 to 3 chunks            |
| 3            | **A zone of an older 14-article PLU of a small commune** (like Gordes' format) with a table (risk, extensions by floor area) | tests tables and the extension caps in permitted-use lists, the biggest guidance win           | 1 chunk                  |
| 4 (optional) | **The Peynier lotissement document** (Sprint 122.0's first real case; the owner has the PDF)                                 | tests footprint areas and rules written per lot; a scan, so needs the transcription step first | needs 122.0              |

## Method (the same as 002.32's, so the numbers compare)

1. **Fetch** the three documents and save only each zone's chapter (`pages.json`, `source.json` with document id, sha256, date, licence).
2. **Draft the truth** from the text before any model reads it (`draftedBy`, kinds in `scopeKinds`), a verbatim quote per rule checked against the pages (`checkQuotes`), a `review.md`.
3. **Blind cross-check:** a different, stronger model given only the chapter text and the product's rule definitions; each difference decided from the text and recorded in `crossCheck` (adopted / not adopted, with the reason). Judgement calls go to the owner; the owner may validate or not.
4. **Read each zone three times** with the shipped reading (Sonnet 5.5, about $0.05 to $0.15 a run per zone), the replay cache **off** for repeats, raw answers kept; triage the misses.
5. **Report** found / wrong value / sector error / extras / duplicates per zone **next to** the four tuned zones' figures.

## Pre-registered reading of the result

| outcome (mean of three runs, three held-out zones)                                | what it says                         | what follows                                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| found within **10 points** of 94.6% (84.6% or more), wrong values at most 1 a run | the gains generalise                 | ship status confirmed; the targeted second read (002.39 Epic 4) becomes the next lever                              |
| found **between 70% and 84.6%**                                                   | the reading is good but partly tuned | the triage of the held-out misses decides: new patterns, or noise; a second guidance round on **tuning** zones only |
| found **below 70%**, or wrong values above 2 a run                                | the gains do not generalise          | say so in the milestone; stop adding prompt lines; review the sectors-in-code and guidance assumptions              |

Nothing is shipped or changed by this sprint: it measures.

## Cost

Reading: three zones × three runs × about $0.1 ≈ **$1**. The cross-check readers (a stronger model, three chapters) are the larger line: the 002.32 cross-check of three zones was a few dollars; to be stated by the dry run before it starts. The truth drafting is time, not money; **the owner's validation of a truth is optional but the report says plainly which ones the owner did not validate.**

## The owner's choice (2026-11-20): Bouc-Bel-Air

The owner chose the commune of **Bouc-Bel-Air** (INSEE 13015), and a PLUi is acceptable. Looked up on the public IGN API (the commune's outline only; nothing else sent): its zones are all in the **Pays d'Aix regulation, partie B, the document already cached** (`DU_200054807_B`, 448 pages; plus two small zones in part A). Zones present: UA/UAh, UBc, UC, UD (UDa1, UDb), UE (UEa, UEb, UEc), UF, UG, UP, US, 1AU, 2AU, A, N. **UC and UD are in the tuned set, so they cannot be held out.** Held-out candidates, with their chapter in the cached document and their weight in the commune:

| zone   | chapter pages | polygons in the commune | why                                                                        |
| ------ | ------------- | ----------------------- | -------------------------------------------------------------------------- |
| **UG** | 181–188 (8)   | 12                      | the second most common urban zone after UDa1; not read before              |
| **UF** | 189–196 (8)   | 9                       | a different urban form; not read before                                    |
| **UE** | 197–209 (13)  | 14 (UE, UEa, UEb, UEc)  | sectors a, b, c: tests the sector expansion on text it was not written for |

Others available later: UA 118–140, UBc 141–152, UP 210–224, 1AU 225–228.

**What this test is and is not.** These are new **zones** with new rules and sector structures, but **the same document and layout** as the UC and UD the reading was tuned on: it tests the rules, the sectors and the guidance, not a new document format (outline, headings, tables of another PLUi). The "another document" axis stays open: a second round on a PLUi of another metropolis, and a small commune's older PLU, later if this one is good. Plots the owner knows in these zones can be validated by them.

## The cross-check, suggested

Same-family models share blind spots, so the suggestion mixes a stronger reader with checks that need no model:

1. **A blind reader on the strongest model available** (Fable 5.2, as in 002.32), one pass per zone, given only the chapter text and the product's rule definitions (never the draft, never a reading). Its answers are compared with the draft rule by rule (kind, sector, value, page).
2. **A mechanical completeness check, no model:** every figure with a unit in the chapter (`figuresIn`) must be either in a truth rule or declared out of scope with a reason (parking, fences, floor-area thresholds…), so an omission shared by both readers is still caught.
3. **Every quote verified against the page** (`checkQuotes`), as for the other truths.
4. **The owner's eye only where it counts:** the judgement calls (the "not adopted" list, e.g. whether a sentence is the zone's or each sector's) and a sample of about ten rules per zone on the review sheet. The report says which truths the owner validated and which not.
5. A second blind model is **not** suggested unless the first pass differs from the draft on more than about one rule in ten, in which case a third opinion is cheap and decides.

## Open questions for the owner

1. Are **UG, UF and UE** the right three? (Or UA, which is dense and in the centre of the commune.)
2. Is the cross-check above acceptable, in particular a single blind reader plus the mechanical checks, with your eye on the judgement calls only?
3. The owner may want to name one plot in each zone to validate against.

## Outcome (2026-11-20)

Done as drafted, on the owner's "do as per your recommendation and best guess": the zones **UG, UF and UE** of Bouc-Bel-Air (the same cached document); truths drafted before any reading (11, 13 and 41 rules); **blind cross-check by Fable 5.2** (11 of 11, 12 of 13 and 41 of 41 found exactly; the sector UFa copies of four rules adopted, 4 more rules: UF 17); the completeness check of figures (nothing in scope uncovered); review sheets written; three live readings of the shipped reading. Fixtures: `test-fixtures/fr-urban-rules/evaluation/bouc-bel-air-{ug,uf,ue}/`. Report: [held-out-zones-2026-11-20.md](../measurements/held-out-zones-2026-11-20.md).

**Result: 89.4% (62, 61, 62 of 69), wrong values 0; UG and UF 100%, UE 82–83%.** The tuned zones: 94.6%. **The pre-registered reading is met** (84.6% or more, wrong values at most 1): the gains generalise to zones the reading was not tuned on, five points lower.

**What qualifies it:** all 7 UE misses are one pattern in every run, the alternative height rule for an extension in a strip with no stated depth, which the product's strip rule (002.21) deliberately turns into a statement in words: **8 truth rules (this and UD d05) are the truth's convention against the product's rule**; extras are 3, 14 and 29 on UE (the same `described` alternative rule repeated for every sector, and a 200 m² floor-area cap typed `extension_max`), none a wrong figure. Decisions for the owner are in the report. **Nothing was changed to fit the result.**

**Still open:** the "another document" axis (another PLUi, an older small-commune PLU), which this same-document test could not test.
