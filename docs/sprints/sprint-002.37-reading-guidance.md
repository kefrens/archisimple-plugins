# Sprint 002.37 — Reading Guidance (A Prompt Variant, Measured)

> **Status:** Built, measured and **switched on at the owner's go** (2026-11-20), uncommitted. Five of the six conditions of the acceptance rule were met; the cost condition was not (+48% against 15%) and **the owner shipped it anyway** (their option 1): `PROMPT_VERSION` 5, `GUIDANCE_IN_PROMPT = true`. Not yet released or seen on the NUC.
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service/src/extract.mjs` (an option), `tools/evaluate-reading*`.
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md), reading-quality track. Follows [002.35](sprint-002.35-two-honest-fixes.md) and [002.36](sprint-002.36-footprint-area.md).

## Goal

Recover, with a few lines of guidance, the misses that are the model's, which 002.34's triage and a read of the pages sorted into patterns. Of the 15 rules still missed after 002.36 (run of 2026-11-20, Sonnet 5.5, one run):

| pattern                                           | misses                                                                                                                                                                  | what the text does                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **A cap inside a list of permitted uses**         | Gordes g19 (50 m² for a farm shop's extension), UD d38, d39 (« une seule extension … dans la limite de 15 % de la surface de plancher existante », under `Article UD1`) | the model reads the list as uses, not as limits                             |
| **Sectors left out of an enumeration**            | UD d04, d08, d11, d22                                                                                                                                                   | « Dans la zone UD et les secteurs UDa, UDa1 et UDa2 »: the model names some |
| **Two limits in one sentence**                    | Gordes g15, g17 (« 30 % … dans la limite de 250 m² »)                                                                                                                   | one item given where two are stated                                         |
| **Table rows**                                    | Gordes g14, g18 (the PPRIF red-zone table: initial floor area → extension allowed)                                                                                      | a cell is a rule, its row label its condition                               |
| **A graphic value that replaces the written one** | Lyon r15 (« sa valeur se substitue »)                                                                                                                                   | not offered as a `see_graphic` item                                         |
| **A strip's depth outside the quoted passage**    | Lyon r13                                                                                                                                                                | the clause that gives the depth is not in the passage                       |
| **An alternative rule for an extension**          | UD d05                                                                                                                                                                  | one conditional height among many                                           |

## Out of scope

Page images, a look-back, an agent loop; the model choice; any change to the schema.

## The variant

`extractChapter({ guidance: true })` (and the harness's `--variant guidance`) appends one block to the shipped instructions, built from the table above: **limits** (two limits are two items), **permitted uses** (a cap on an extension or annex written inside a list is an item), **tables** (a row is a rule, its label its condition), **strip** (quote the clause that gives the depth with the height), **graphic** (add a `see_graphic` item when a graphic value replaces the written one), **sectors** (list every sector the sentence names). **It is one bundle**: the gain cannot be attributed to a line; if it ships, an ablation can follow.

## The acceptance rule (fixed before any run)

Both sides are **three runs each of Sonnet 5.5** on the four zones, with the same truths, the same code (002.35 and 002.36) and the same models; the baseline is the shipped prompt. A fresh baseline is needed: the earlier runs predate the placement fixes.

- **Ships if**, averaged over the three runs: overall recall rises by **at least 4 points**; no zone's recall falls by more than **3 points**; wrong values and sector errors do not rise; extras do not rise by more than **3**; cost per chapter rises by no more than **15 %**.
- **Does not ship** otherwise, and the sprint closes as a measured negative. Haiku is not measured.
- The truths are not changed to fit the result. A truth gap found on the way is fixed for both sides.

## Epics

1. **The option and the variant** (test first): the instructions with and without the block, the memo kept apart, the harness variant recorded in each run.
2. **The measurement** (about $1.5, ceiling $2): three baseline runs (one is already cached from 002.34) and three variant runs, the triage of both, the acceptance rule applied in the report.
3. **If it ships:** `PROMPT_VERSION` 5, the release note (every cached reading re-read once, at the measured cost), the owner's go.

## Not decided

Whether Haiku follows the block as well as Sonnet (not gated). Whether a table-aware step (page images) is still worth its contract change once the guidance has been measured.

## Outcome (2026-11-20)

Built test-first: `GUIDANCE`, `instructionsFor`, `extractChapter({ guidance })` (memo kept apart), the harness variant `guidance` (recorded in each run, cached apart). Measured: three runs per side, **$1.82**, report [reading-guidance-2026-11-20.md](../measurements/reading-guidance-2026-11-20.md).

**Overall 78.9% → 90.8% (+11.9 points)**; Gordes 12.3 → 18.3 of 19; UD 35.3 → 38.7 of 45; Lyon and UC up a little; wrong values 1.3 → 0.7; no sector error; extras flat. **Cost +48% per run ($0.281 → $0.416), nearly all output tokens**, so the sixth condition fails.

**Decision for the owner** (the rule was set before the absolute cost was known: the extra is about $0.03 a chapter, paid once per zone and shared):

1. **Ship it as is** (`PROMPT_VERSION` 5, a one-time re-read, in the same unreleased 0.7.0), which means accepting the cost condition's failure on purpose. Recommended by me, because the gain is large, no condition on quality fails and the money is small; but the rule is yours to relax, not mine.
2. **Cut the cost first:** an ablation (each line off, or two half-blocks) to find what makes the output double; about $1 to $2 more.
3. **Measure Haiku with the block** (about $0.15 for three runs): Haiku costs a tenth of Sonnet and the block may lift it enough to change the default model question.
4. Leave it as a measured negative.

Either way, two small follow-ups from the runs: the `see_graphic` passage that lacks « graphique » (a prompt line), and Gordes' pool cap as a candidate truth rule.

## Switched on (the owner's decision, 2026-11-20)

The owner chose option 1 (ship as is) "for the moment". Done, test-first: `PROMPT_VERSION` 4 → 5 (the schema stays 2), `GUIDANCE_IN_PROMPT = true` passed by `jobs.mjs` (`guidance: GUIDANCE_IN_PROMPT`), a jobs test that the job sends the block, the pinned versions moved (jobs, strip), the harness's default is now the shipped reading with the guidance, `--variant unguided` the prompt-4 reading, `--variant previous` the one before 002.33; the earlier `--variant guidance` is gone (the run folders `…-guid37-r*` record `guidance`, which is today's default). The release note is the service README's « Reading guidance » section, and states that **the cost condition was not met and the owner decided otherwise**. The service stays 0.7.0 (unreleased). The service suite: 299 tests, 297 pass, 2 skipped.

**For later:** an ablation or Haiku with the block (options 2 and 3) remain open; "for the moment" means the owner may revisit the cost.
