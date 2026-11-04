# Sprint 002.24 — The Nature Of The Project

> **Status:** Landed in the working tree (2026-11-04), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.20.0**, `sdkVersion` **"1.41"** unchanged; `fr-urban-rules-service` **0.6.0** unchanged.
>
> **Milestone:** the PLU-extraction work — the owner's request of 2026-11-03: "some rules are for industries, restaurant, etc: agent could
> ask a few questions on what is the nature of the project", approved on the mockups (sections B and C) and recommendations Q1–Q5.
>
> **Platform half:** none. The question card is the seam [102.12](../../../archisimple/docs/sprints/sprint-102.12-cards-in-the-ai-conversation.md)
> already carries (`ai.cards`, kinds `questions` and `summary`, ADR-0028 Rule 12).
>
> **Next Sprint:** [002.25 Rules Decided By The Project](sprint-002.25-rules-decided-by-the-project.md) — what the answers decide, in the same release.

## Goal

After a reading, one card in the AI conversation asks what the project is — what is planned, what it is used for, how big — with only
the questions the rules actually depend on, and keeps the answers in the project.

## Out of scope

- A model call to ask or to read the answers: the card is fixed (Q2). Typing « a restaurant with a flat above » is a later option.
- A question about fences or the commune: those are the plot's, decided by the 002.22 triage.
- What the answers decide — [002.25](sprint-002.25-rules-decided-by-the-project.md).

## Decisions

1. **The answers** (`projectNature` in the plugin's section, one record **per project**, shared by its plots; validated like every member
   this version owns — a shape not recognised makes the section read-only): `works` (`new`, `extension`, `annex`), `use` (the sixteen
   uses: the Code de l'urbanisme's sub-destinations R.151-28 kept as the règlement quotes them, `equipements` for the destination, and
   `other` = mixed or not listed, which settles nothing), `area` (an exact number, or a bucket `[from, to)` from the card), `icpe` (`yes`,
   `no`), and `askedFor` (the documents the card was posted for). Every answer is optional; « Not decided » is no answer, never a guess.
   No section schema change (`schema` stays 1).
2. **What a candidate is about is read from its own subject, never from free text** (`scopeOf`): a use from a condition that is a use's
   name (a parking table's row), one that quotes « sous-destination … » or « à destination de … », or a one-line uses row (« Industrie
   Interdit »), the finer of a destination and its sub-destination when both are named; an extension from a passage or condition that
   begins with « extension(s) » or says extensions are admitted (« les nouvelles constructions et les extensions » is about both and is
   not scoped); a floor-area threshold from a condition on « surface de plancher » with its comparison, read **for the plot's own sector**
   (« 500 m2 dans les secteurs UDa et UDa1, ou 250 m2 dans le secteur UDa2 »); a classified installation from the passage's subject. A use
   the table does not know, or a threshold for sectors that do not include the zone, makes the candidate unscoped: it is left alone.
3. **The questions are the candidates'** (`projectQuestionsOf`): a question is asked only if at least one open candidate depends on it,
   with the number it could settle (`n`, counted, not guessed), at most five (works, use, floor area, classified installation). The
   floor-area chips are the thresholds the rules state, sorted: `[0, 250)`, `[250, 500)`, `[500, ∞)` on UDa1. No question, no card.
4. **A fixed card, posted once** (`createProjectCards`, `projectQuestionCardOf`): after a reading comes to its figures in this session
   (the reading card's first counts) and while a question is unanswered and the document is not already in `askedFor`. A choice updates
   the line « These answers would decide n of the m rules » (computed over the very candidates). **Apply** stores the answers and the
   document as asked and posts the summary (tags, « Applied: n more rules decided. m are left to decide », « Open the m rules » which
   also brings the rules into view, « Change my answers »); **Not now** records the document as asked and takes the card down. The
   reading card's Done state offers « Narrow them with your project » while a question is unanswered (omitted in 002.23).
5. **Works decides asymmetrically.** Only a candidate that is about extensions and nothing else is excluded by « new building » or
   « annex » (its answer positively excludes it); annex- and pool-only rules are never excluded by works, because a project can add a
   pool whatever else it is.
6. **An exact area is kept** while its bucket is the one chosen: typing 320 m² in the panel and reapplying the card does not replace it
   by « 250 to 500 m² ».

## Acceptance criteria

1. A candidate's uses, extension, floor-area thresholds (per sector) and classified installation are read from its subject; anything
   else is unscoped.
2. The questions are the ones some candidate depends on, with a computed count; the floor-area chips are the thresholds stated.
3. The card is posted once after a reading, answers update its line, Apply stores them per project and posts the summary, Not now and
   Change my answers work; a host without `ai.cards` changes nothing.
4. The answers are one validated record of the section; a shape not recognised makes the section read-only.

## Outcome

- **Built:** `foldText`, `usesOfCandidate`, `extensionOnly`, `sdpOf`, `scopeOf`, `projectQuestionsOf`, `areaBucketsOf`, the stored
  record (`isProjectNature`, `projectNatureOf`, `withProjectNature`, `withProjectAsked`), `projectQuestionCardOf`, `natureFromAnswers`,
  `projectSummaryCardOf`, `createProjectCards`, the reading card's « narrow » button and `onDone` hook, `writeSectionWith`; strings in en and fr.
- **On Marseille's zone UD** (the real result, 98 rules): the questions on UDa1 are works (5 candidates), use (16), floor area (6, thresholds
  250 and 500 m²) and classified installation (1); on UDa2 the area threshold is 250 only.
- **Browser pass** (the real 0.20.0 package, a scratch gateway, the Lyon reference plot, UCe1b, 114 rules read by OpenAI): the reading card
  ended with « Narrow them with your project » and the question card appeared, with « New building » chosen the line said « These answers
  would decide 2 of the 112 rules », Apply posted « Applied: 2 more rules decided. 110 are left to decide. » and the Rules view's
  « Project nature » section showed it. No page error.

### Deviations

- **Lyon asks one question.** Its UCe1b candidates name no use or threshold, so the card asks « What are you planning? » only; the use
  and floor-area questions are verified on Marseille's result in tests, not in the browser.
- **A reading restored from the project's snapshot does not post the card** (no reading ran this session): the panel's form is the way in.
- **The dock is short** (about 190 px of the AI panel at a 1,000 px window): the card is read by scrolling the conversation, as the reading card is.

### Not verified

- The card on a Marseille plot in the owner's editor, and a reading on the NUC.
- The dark theme in a browser.
- A free-text answer in the conversation (out of scope).

## Post-sprint documentation

- [x] Plugin CHANGELOG, README; the milestone row.
