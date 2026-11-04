# Sprint 002.23 — The Reading's Progress In The AI Panel

> **Status:** Landed in the working tree (2026-11-03), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.19.0**, `sdkVersion` **"1.41"**; `fr-urban-rules-service` **0.6.0**.
>
> **Milestone:** [Site Buildable Area](../../../archisimple/docs/milestones/site-buildable-area/README.md) and the PLU-extraction work —
> the owner's request of 2026-11-03: "when we extract such data using AI we should see the progress in the AI panel (as we do with
> plan import)", approved on the mockups (section A) and recommendations Q1–Q5.
>
> **Platform half:** [102.12](../../../archisimple/docs/sprints/sprint-102.12-cards-in-the-ai-conversation.md) — SDK 1.41, `AiExtensionService.cards`
> (ADR-0028 Rule 12). Needed to see the card; the extension runs without it.
>
> **Next Sprint:** the project-nature questions (mockup section B) and the rules they decide (section C), through the same
> seam — no further SDK change planned.

## Goal

A reading of the written règlement is no longer a silent wait in the PLU panel. It is a card in the AI conversation, with the
service's own steps, each part and the rules it gave, a progress bar and a real Cancel — and when it ends, the figures the rules view
shows.

## Out of scope

- The project-nature questions and the rules they decide (the next sprint; the SDK already carries a question card).
- Per-part page ranges on a part that has not been reached (they appear when it is).
- Reattaching to a reading after a page reload: the job runs on the service, but the plugin's record of its id is session memory; the
  user presses Extract again and the service **joins** the running job (002.5b), which posts the card again.

## Decisions

1. **The card is data, drawn by the host.** `readingCardOf(view)` is pure: a record's state, the job's progress, its result or error in; an
   `activity` card out. Counts, pages and states only — **a passage never reaches a card**, and a test pins it.
2. **One card per zone's reading,** `reading:<record id>`, posted when the service accepts the job and replaced in place at each poll's
   change; `createReadingCards` holds the handles and disposes them with the reader (and with the extension's subscriptions).
3. **The service reports what a card needs, minimally (0.6.0):** `progress.parts` (state, pages, rules, cached), `rules`, `chapter`,
   `document`. Per-part rule counts are what the part gave after the chapter's own de-duplication.
4. **Cancel is real.** `POST v1/extractions/{jobId}/cancel` (a POST, so every proxy passes it): a queued job never runs; a running one has
   its call to ai-service cut by the job's `AbortSignal` and ends `failed` / `cancelled`; a job another user joined keeps running for them
   (watchers). A job stopped before a model answered gives its charge back. The plugin stops polling at once, whatever the answer.
5. **A part read again is a plain read.** The service keeps a chunk's answer in memory for 30 minutes (document, text, prompt version,
   provider and model). A POST of a partly-read chapter asks the model for the parts that failed; "Extract again" never reuses them.
   Not on disk, not shared across documents; only a complete reading is cached, as before.
6. **The figures are the view's own.** « Rules read » is what the service returned; « Decided automatically » and « Left to decide » are
   the Rules view's numbers (002.22), handed to the card when the view is built, so the card and the panel cannot disagree.
7. **No dead button.** « Narrow them with your project » belongs to the next sprint and is not offered now.

## Acceptance criteria

1. A reading posts a card (title, zone, pages, model), updates it as each part is read, and ends it done with the three figures.
2. Cancel stops the polling, calls the cancel route, ends the card cancelled and lets the zone be read again.
3. A part the model did not answer ends the card partly read, with « Read part n again » (a plain read) and « Use what was read ».
4. A failed reading says why, and offers Try again only where it can help; a host with no `ai.cards` changes nothing.
5. The service: parts, chapter, rules in `progress`; cancel for a running, a queued and a shared job; a charge given back; a part read
   again costs only the failed parts; "Extract again" costs them all.

## Outcome

- **Built:** `readingCardOf`, `createReadingCards`, the card actions (`cardAction`), `cancelled` as a written code, 24 strings in en and fr;
  the service's `progress`, cancel route, chunk memo, `signal` through `ai-client`.
- **Tests:** six in `written.test.mjs`; seven in the service's `jobs.test.mjs` (progress by part, a part read again, "Extract again"
  reusing nothing, cancel in flight with the charge given back, cancel of a queued job, a shared job, idempotence and the method).
- **Deviations:** none from the mockups except the figures' « Rules read » (the service's count, not the view's after folding).
- **Browser pass** (see the platform sprint 102.12): a real OpenAI reading of Lyon UCe1b through a scratch gateway 0.6.0, five parts, ended
  with 125 read · 4 decided automatically · 112 left (the Rules view's own numbers); Cancel, and a part that failed, walked against a scripted
  service. The figures' « Rules read » is the service's count.
- **Not verified here:** the same on Marseille UD in the owner's editor (the pass used Lyon); a
  reading on the NUC.
