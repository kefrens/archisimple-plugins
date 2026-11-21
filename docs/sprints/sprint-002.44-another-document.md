# Sprint 002.44 — Another Document And Layout

> **Status:** Built and measured (2026-11-21), uncommitted. The owner had no commune in mind and asked me to choose. **96.4% found (36, 37, 34 of 37), 0 wrong values: by the bands of 002.41 the gains generalise to another document and layout.** $0.54 of readings.
>
> **Repository:** `archisimple-plugins` — `test-fixtures/fr-urban-rules/evaluation/{la-tour-d-aigues-uc,la-tour-d-aigues-ud,flaujac-poujols-ub}/`.
>
> **Follows:** [002.41](sprint-002.41-held-out-zones.md), whose same-document limit this closes.

## What was done

1. **Choosing documents.** Candidate small communes were listed on the public IGN and Géoportail de l'urbanisme APIs (only the communes' outlines and document identifiers were sent); four older PLUs were downloaded to a scratch folder (1.2 to 7.8 MB), parsed with the service's own parser; one was a scan with no text layer (unusable), three had clean text. **Two documents, three zones kept**: La Tour-d'Aigues UC and UD (156 pages, 2018), Flaujac-Poujols UB (52 pages, 2013).
2. **A more independent truth than before:** the drafts were written by **Opus 5.5** from a written conventions file (`truth-conventions.txt`, kept in the scratch folder, derived from the earlier truths), the blind readers were **Fable 5.2**; neither saw the other's work, and I only reconciled. Every draft rule was found by the blind reader (16/16, 12/12, 6/6); three maximum distances were adopted at Flaujac-Poujols; the rest of what the blind readers added is recorded as not adopted with its reason.
3. **Three live readings** with the shipped reading, nothing changed after the first read. Report: [other-document-2026-11-21.md](../measurements/other-document-2026-11-21.md).

## Outcome

**96.4% found, 0 wrong values, 2 to 5 extras a run** (extras defined as the scorer now defines them). The tuned zones 94.6%, Bouc-Bel-Air 97.1%. **The one defect:** in 1 run of 3 the model read « L = H − 4 m, at least 4 m » as a plain « at least 4 m » (the formula dropped, 3 rules at UC); runs 1 and 2 read it right. Candidate fix, not made here: a check in the service that a `value` setback of 4 m whose passage writes a difference of level (« différence de niveau (H) ») is refused, or a guidance line (a prompt change, which the 002.43 experience says to measure).

**What is now measured on the reading's quality:** the four tuned zones (94.6%), three zones of the same document (97.1%), three zones of two other documents (96.4%); recall near 95% to 97% everywhere, wrong values at most 0.7 a run. **Untested:** a metropolis PLUi with graphic references and tables of another layout, a scan.
