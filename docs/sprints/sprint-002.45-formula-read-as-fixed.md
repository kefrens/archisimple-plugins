# Sprint 002.45 — A Formula's Floor Is Not The Distance

> **Status:** Implemented in the working tree (2026-11-21), uncommitted. One placement check built test-first and measured by **replaying the saved answers**: **$0, no model call**. The owner asked for it ("yes service check"). No schema or prompt change, so no version bump; it rides in the unreleased 0.7.0.
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service/src/extract.mjs` (`placeItem`), `tests/formula-read-as-fixed.test.mjs`.
>
> **Found by:** [002.44](sprint-002.44-another-document.md), La Tour-d'Aigues UC, run 3.

## Goal

« Un recul (L) au moins égal à la différence de niveau (H) …, diminuée de 4 mètres, avec un minimum de 4 mètres, soit L = H-4 ≥ 4m » is a formula whose 4 m is a floor. In one run of three the model typed it as a plain `value min 4 m` (3 rules). A fixed distance is a number the plot is measured by: wrong, and written with `high`-looking authority.

## What was built (test first)

A `value` limit on `road_setback`, `boundary_setback` or `building_distance` whose passage (plus the rest of its sentence) says the distance is **« égal(e) à la différence de niveau / d'altitude »** or **« L = H »** is kept as a statement in words: `statement: described`, `limit: null`, confidence `low`, counted in `dropped.formulaReadAsFixed`. The same shape as the strip check (002.21). The model's right reading, `height_relative`, is not touched; neither is a plain fixed setback, nor a height that only mentions a difference of level.

Tests: 5 new (`formula-read-as-fixed.test.mjs`); the service suite is **311 tests, 309 pass, 2 skipped**. (The 324 I recorded after 002.44 does not reconcile with a fresh count of the same command; I did not find where the difference came from, and no test file is missing from the tree.)

## Measured (replayed, $0)

|                                                                                                                | before             | after                                          |
| -------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| three other-document runs, rules changed                                                                       |                    | **3 of 170** (all UC run 3, the defect itself) |
| found, wrong values, extras per run                                                                            | 36/37/34, 0, 2/3/5 | **identical**                                  |
| every saved reading in the repo (185 run files, 5,825 rules): fixed-metre distance rules the check would catch |                    | **3, the same three; no other**                |

**The scorer cannot see this defect:** a fixed 4 m where the truth is a formula is scored as a missing rule plus an extra, not as a wrong value, so the counts do not move. The benefit is the output, not the score: the plot is no longer measured by a 4 m the text does not give. The rule stays in the Log as words, flagged low.

## Not done

The recall of those three rules is **not recovered** (a statement in words cannot be the truth's formula); only the wrong number is removed. The same defect with « égal à la hauteur » (a distance equal to a height, read as a fixed figure) was not seen and not covered. Not walked in the editor.
