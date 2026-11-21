# Sprint 002.40 — A Failed Pair Is Not A Reading

> **Status:** Implemented in the working tree (2026-11-20), uncommitted. Tools only; no model call, no service change.
>
> **Repository:** `archisimple-plugins` — `tools/evaluate-reading*`, `tools/triage-reading.mjs`, `tools/measure-merge.mjs`.
>
> **Found by:** [002.39](sprint-002.39-second-reads.md): the third Haiku run's Gordes call never answered (1,594 s, `chunks.failed` 1), and the runner recorded the pair as finished with 0 rules found, which the tables counted as 0 of 19 and skipped on resume.

## What was built (test first)

- `runPair` returns `incomplete: true` when a chunk failed or the run stopped on the budget.
- `runFileName(pair, run)`: an incomplete pair is written to `<zone>__<model>.incomplete.json`, never to the name a reading has; the CLI says `INCOMPLETE … run it again` and does not print a recall; **a resumed run does not skip it** (the loader ignores `.incomplete.json`).
- `triage-reading.mjs` ignores incomplete files, and runs saved before this sprint with `chunks.failed > 0`.
- `measure-merge.mjs` **refuses** a read whose file is not a reading, with the file's name, instead of merging 0 rules.
- Test: a call that fails gives an incomplete run with the right file name; a complete run does not. The service suite: 313 tests.

## Not done

The `docs/measurements/reading-runs-2026-11-20-haiku39-r3` folder still holds the failed Gordes run under its old name (a historical record; the tools now refuse it). The report `second-reads-2026-11-20.md` already uses runs 1 and 2 only.
