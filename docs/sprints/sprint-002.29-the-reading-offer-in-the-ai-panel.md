# Sprint 002.29 — The Reading Offer In The AI Panel

> **Status:** Implemented 2026-11-20, uncommitted — built and unit tested against the platform's 121.0 (also uncommitted); **walked in a real browser, with the real extension on a live plot (2026-11-20); the NUC is not walked.** The extension needs a host with SDK 1.43: release the platform first. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.24.0** (proposed), `sdkVersion` raised to the version 121.0 lands (proposed **"1.43"**). No service change.
>
> **Milestone:** the PLU-extraction work, after 002.28. The owner (2026-11-20): « what if we show this in the AI panel? »
>
> **Previous Sprint:** [002.28 The Reading Offer Is Always Explained](sprint-002.28-the-reading-offer-is-always-explained.md).

## Goal

When the person is looking at a plot whose written rules have not been read, the **AI panel offers the reading** — a card with the zone, the model it will use and one button — beside the plan import and the assistant, and pressing it starts **the same reading** the Rules view's button starts.

> **Mockups:** [002.28–002.29 reading offer](../../../archisimple/docs/sprints/mockups/002.28-002.29-reading-offer.html) (boards D–E).

## Out of scope

- A price estimate on the card (the extension cannot price; the AI service owns the price table). Open Question O1.
- Showing a card for a zone already read (the Rules view says so, 002.28 D5 — the owner's missing button was exactly that case), or for a plot outside a PLU(i). Open Question O4 asks whether the AI panel should say « already read » too.
- A badge on the panel's dock tab (121.0 O1).
- Reattaching a running reading after a reload (002.23, unchanged).

## Baseline (verified, 2026-11-20)

- An extension reaches the AI panel **only** through `AiCardService.post` (`packages/extension-sdk/src/ai-cards.ts`, ADR-0028 Rule 12). `fr-urban-rules` already posts a reading card per zone (`reading:<record id>`, `readingCardOf` / `createReadingCards`, 002.23) and questions and summaries (002.24, 002.25).
- Every post today brings the panel into view; there is no `ready` status. **Both are 121.0's.**
- The reading's one start path is `runWrittenAction`, handling `written-extract`, `written-extract-again` and `written-try-again` (`index.js` ~4906). The model is whatever the AI panel has chosen (`chosenModelOf(aiOf())`); the Rules view's « Will read with » row shows it (`willReadRow`).
- A zone's state is derived from its record (`not_started`, `unknown`, running states, `done`, failure). Nothing about an offer needs a second copy of it.
- The 12-cards-per-extension cap applies; a plot has at most five zones in the sectors seen so far (UC, UC1, UC1s, UC2, UC3 on one chapter).

## Decisions

1. **One offer per zone, derived.** For each zone of the plot on view in `not_started`, post `offer:<record id>`: a `ready` activity card, `quiet: true`, title « Read the written rules — zone UDA1 », subtitle the document and, when known, the pages. When the zone leaves `not_started` (it starts, it was read, the plot changed) the handle is disposed and, if it started, the existing reading card takes over. A function of the record, no stored flag. _Recommended._
2. **One start path.** The offer's button id maps to `written-extract` and calls `runWrittenAction`; the Rules view button and the card cannot diverge, and a reading started from one shows in the other.
3. **The model is shown, not chosen, on the card.** A note « Will read with <provider · model> » follows the AI panel's chosen model; changing it in the panel updates the note. The card has no picker (the panel's own is the one).
4. **It says the reading is shared.** A note: « The result is kept for this zone until the regulation is replaced, so reading it again uses no AI budget. » (true: the service's result cache is shared and a cached zone costs nothing).
5. **It never claims a price or a budget it cannot know.** The budget strip at the panel's foot (120.1) carries the allowance; the card says nothing about money in this sprint.
6. **Disabled with a reason, never absent.** With no model usable (`ai` not granted, none chosen and no deployment default) the button is `disabled` with a note naming why. A budget refusal still arrives as the existing refusal (002.27), not here.
7. **Quiet, and only for the plot on view.** Posts are `quiet: true`. Offers for another plot are disposed, so the cap is not reached by plots the person left. If the cap is reached anyway, the card for the zone on view wins (the extension disposes others first).
8. **A host without `ai.cards` or without the new SDK changes nothing:** the Rules view button (002.28) remains the one entry.
9. **No new strings outside the extension's namespace;** en and fr.

## Epics

### Epic 1 — The offer card

`offerCardOf(record, model)` pure (record state, model in; `ready` card out), like `readingCardOf`; `createOfferCards` holds the handles and disposes them with the reader and the extension's subscriptions. A passage never reaches the card (the 002.23 test is extended).
**Acceptance:** a PLU plot with an unread zone shows one quiet offer card per unread zone; reading one removes its offer; changing plot removes the old plot's offers; a plot with no unread zone shows none.

### Epic 2 — The button starts the reading

Map the card's action to `runWrittenAction('written-extract')`; the reading card (002.23) appears as today.
**Acceptance:** pressing the button starts exactly one job (a second press, or the Rules view button pressed meanwhile, joins it); the offer is replaced by the reading card; Cancel and the budget refusal behave as in 002.23 and 002.27.

### Epic 3 — The model note and the disabled state

**Acceptance:** the note follows the panel's chosen model without a reload; with no usable model the button is disabled and says why.

## Testing

`written.test.mjs`: `offerCardOf` for each state (only `not_started` offers), disposal on every exit, the one start path with a fake `runWrittenAction`, the cap with six unread zones, no passage on the card. Browser (follow the platform's `tools/e2e/README.md`): panel closed with an unread zone: no panel pop-up; open the panel: the offer is there; press it: the reading card appears and the Rules view updates; a cached zone: no offer. Extension tests and the i18n parity test.

## Wording (en / fr)

| Key                       | English                                                                                                   | Français                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `offer.title`             | Read the written rules — zone {zone}                                                                      | Lire les règles écrites — zone {zone}                                                                                      |
| `offer.subtitle`          | {document}                                                                                                | {document}                                                                                                                 |
| `offer.note.model`        | Will read with {model}.                                                                                   | Lecture avec {model}.                                                                                                      |
| `offer.note.defaultModel` | Will read with the deployment’s default model.                                                            | Lecture avec le modèle par défaut du déploiement.                                                                          |
| `offer.note.shared`       | The result is kept for this zone until the regulation is replaced, so reading it again uses no AI budget. | Le résultat est conservé pour cette zone tant que le règlement n’est pas remplacé : le relire ne consomme aucun budget IA. |
| `offer.action`            | Read the written rules                                                                                    | Lire les règles écrites                                                                                                    |
| `offer.note.noModel` (D6) | No AI model is available to read with. Choose one in this panel.                                          | Aucun modèle d’IA n’est disponible pour la lecture. Choisissez-en un dans ce panneau.                                      |

## Open Questions

- **O1. A price on the offer** («about $0.09 on this model»). The extension has no price table; the AI service has. Options: (a) none _(recommended now)_; (b) a small AI-service endpoint returning an estimate from the model and the chapter's size, used by the card; (c) the card shows the chapter's page count only. The 2026-11-20 measurements: about $0.09 for a Sonnet 5.5 chunk of the zone UD chapter, about $0.008 for a Haiku 5.5 chunk of the zone UC chapter, per chapter once (the result is shared).
- **O2.** Should the offer also be shown for a zone whose reading is `partial` (a budget stop or a failed part)? _Recommended: no;_ the Rules view has « Read again », and 002.23 already posts its own card for a partial reading.
- **O3.** The French wording (table above): the owner reads it.
- **O4. Say « already read » in the AI panel too.** The owner looked for the button and found none because the zone was already read. A quiet `done` card (« Zone UDA1 was read on 20 Nov — shared, free ») would answer the same question there. _Recommended: no, until 002.28's notice has been used_ — it adds a card per read zone against the 12-card cap.

## Outcome

- **Built (`fr-urban-rules` 0.24.0, `sdkVersion` 1.43):** `offerCardOf` (pure: a quiet `ready` activity `offer:<record id>` with the zone title, the document as a verbatim subtitle when known, a note for the model (the one chosen in the AI panel, else the deployment's default) and the shared-result note, and one primary `read` button) and `createOfferCards({ ai, act })` (`sync(wanted)` posts, updates or disposes by the whole list; `dispose()`), wired in `createReader`: after the pages settle, `written.available` and each zone with `record.state === 'not_started'` is wanted, nothing otherwise. The button calls `runWrittenAction('written-extract')` — the Rules view's own path — then syncs the reading card and signals the host. Disposed with the reader. Strings en and fr as in the wording table.
- **Tests (eight, written before the code):** `offerCardOf` shape and its no-model variant; `createOfferCards` posts one per zone, does not repost an unchanged card, updates on a model change and disposes a zone no longer wanted; a host without `ai.cards` or whose post throws; an unread zone gets one quiet offer, starts nothing, its button starts one POST and the reading card appears and the offer goes on the next read; a zone found already read gets none; the offer follows the chosen model; no passage reaches the card; the strings exist (the French button reads « Lire les règles écrites »). The 002.23 disposal test now counts the offer too. The extension's suite: 586 tests, 584 pass, 2 skipped, none fail.
- **Deviation (D6):** the **disabled « no model » offer was not built.** The extension cannot tell « no model usable » from « no choice made, the service's own default will read » (the same state the Rules view's « Will read with the deployment's default model » row already shows), so a disabled card would be wrong more often than right. A failure arrives as the existing refusal (002.27). `offer.note.noModel` is not in the strings.
- **Release order:** this version needs a host at SDK 1.43; an older host does not activate it. Release the platform's 121.0 first, then the extension 0.24.0 (and plugin-services 0.7.0 with the older 0.22.0 pending, per the budget milestone).
- **Real-extension browser walk (2026-11-20, Chromium, `tools/e2e/specs/readingOfferFr.spec.ts`, project `reading-offer-fr`):** the real `fr-urban-rules` 0.24.0 (built by the plugins checkout's own `build-index`, pinned by the build) on **Lyon, zone UCe1b**, live (Géoplateforme, GPU, API Carto), with the plugins' companion gateway (0.7.0, an empty cache) and an AI Service behind the editor. Verified: the zone's written reading is « not read yet »; the Rules view shows the button **above** the « Read with (AI panel) » row (002.28); a **quiet « Ready » offer** « Read the written rules — zone UCe1b » is in the AI conversation and **the AI tab was not selected for it**; it shows the document, « Will read with anthropic. », the shared-result note and a blue primary button in view in a short dock; the offer starts nothing (no POST); pressing the button sends **one** `POST …/v1/extractions` (the Rules view's path), the offer goes and the 002.23 reading card takes over; Cancel sends the service's cancel route. **No model was called** (the reading was cancelled while fetching the document), so nothing was spent. No page error.
- **One defect the walk found, fixed with the test first:** after Cancel the zone returned to « not read yet » and the offer came back **beside the cancelled reading card**, which already offers « Read again » — two cards for one action. A zone whose reading the person cancelled is no longer offered (`record.cancelledByUser`); « Read again » and the Rules view's button remain.
- **Also seen:** on this build the AI tab is the one selected at start (the plugin build with an AI Service behind it), unlike the stub walk's build where Tips was; the spec switches away first. The full reading to the end (rules in the Rules view, the figures) was not run here, and the offer for a zone found already read (no offer) is covered by unit tests only in this walk.
- **Open questions:** O1 (price) as recommended, none; O2 (partial readings) none; O4 (an « already read » card) no. **Not verified:** a reading let to run to its end from the offer, the offer for a zone found already read in a browser, and the NUC; the French wording in context; the 12-card cap with a plot of many zones.
