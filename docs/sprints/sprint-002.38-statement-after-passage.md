# Sprint 002.38 — A Statement's Words May Sit Just After The Quoted Passage

> **Status:** Implemented in the working tree (2026-11-20), uncommitted. Built test-first and measured by **replaying the saved guidance runs: $0, no model call**. No schema or prompt change, so no version bump; it rides in the unreleased 0.7.0.
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service/src/extract.mjs` (`placeItem`). **No new tool was needed** (see below).
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md). Follows [002.37](sprint-002.37-reading-guidance.md), which left it open.

## Goal

002.37's measurement showed the code refusing `see_graphic` rules the model had found (6 per run on the four-sector zone, `incoherent`). The product requires the statement's words in the passage (`statementInPassage`: « graphique » for `see_graphic`, « réglementé » for `not_regulated`) so a statement is never invented.

## Cause (read from the saved answers, not guessed)

Every refused item was a sentence like « La hauteur des constructions* ne pourra excéder les hauteurs indiquées au règlement **graphique** lorsqu'elle existe », and the model had **cut its quotation just before the word** (« … indiquées au règlement »). The word is in the very next token of the same sentence. The rule was right, the check was too literal. (The same item in the first run, quoted whole, was kept.)

## What was built

`restOfSentence(text, end)`: the text from the passage's end to the next full stop or semicolon, at most 200 characters. `placeItem` looks for the statement's words in the passage **plus the rest of its own sentence**, never further. The rule's `passage` stays exactly as the model quoted it (the word is not copied in). Applies to `not_regulated` too, which has the same check. 4 tests (`statement-after-passage.test.mjs`): the word ends the sentence (kept), the word in the next sentence or nowhere (still refused), `not_regulated`, a passage that holds the word itself.

## Measured (replayed, $0)

The three guidance runs of 002.37 (`…-guid37-r1..3`, Sonnet 5.5, four zones), their saved answers through the new check (`…-guid37-replay-002-38-r1..3`):

|                                       | before           | after            |
| ------------------------------------- | ---------------- | ---------------- |
| UD found, three runs                  | 44, 39, 33 of 45 | **44, 44, 38**   |
| `incoherent` drops on UD              | 0, 6, 6          | **0, 0, 0**      |
| the other three zones                 | unchanged        | unchanged        |
| all four, mean found of 87            | 79.0 (90.8%)     | **82.3 (94.6%)** |
| wrong values / sector errors / extras | 0.7 / 0 / 3.0    | 0.7 / 0 / 3.0    |

No quality figure fell; the cost is unchanged (it is the same answers). Still missed on UD: d05, and in some runs d28, d40–d42.

## Did it need a tool?

No. The harness already kept the model's raw answers (002.34), so listing the `see_graphic` items and testing the word on each took ten lines in a scratch script. What a tool would add is **the reason each item was refused**: today `dropped` is a set of counters, and the triage says "refused by the code" without saying which check. Candidate for a later sprint (an `onDrop` hook in `placeItem` and a column in the triage); not built now because this case did not need it.

## Not verified

The replay uses three saved answers per zone; a fresh reading may vary. Not walked in the editor. The word is looked for in the rest of the **sentence** (to a full stop or semicolon): a sentence broken by an abbreviation's full stop would miss it (the item is then refused, as before).
