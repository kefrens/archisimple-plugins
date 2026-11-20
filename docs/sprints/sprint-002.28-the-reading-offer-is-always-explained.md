# Sprint 002.28 — The Reading Offer Is Always Explained

> **Status:** Implemented in part (2026-11-20), uncommitted — **Epic 3 (the already-read notice) and the button order (D3) are built and tested; Epics 1 and 2's other parts (service unreachable, next-step sentences) are deliberately not built.** Not yet seen by the owner in the editor or on the NUC. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.23.0** (proposed), `sdkVersion` **"1.41"** unchanged. **No platform change, no service change.**
>
> **Milestone:** the PLU-extraction work, after 002.27. The owner reported (2026-11-20) that the « read with AI » button is **not always there** and is **easy to miss**; they traced the first to a zone that **was already read** (shared cache), which the panel does not say.
>
> **Previous Sprint:** [002.27 The Reading Is Inside The AI Budget](sprint-002.27-ai-budget.md).
>
> **Next Sprints:** the platform's [121.0 A Quiet Offer Card](../../../archisimple/docs/sprints/sprint-121.0-quiet-offer-cards.md), then [002.29 The Reading Offer In The AI Panel](sprint-002.29-the-reading-offer-in-the-ai-panel.md). This sprint ships alone and does not wait for them.

## Goal

Whatever state a zone is in, the written-rules section of the Rules view **says what it is and what the person can do**. The « Extract written rules » button is the first thing under the zone's heading when it is offered, and when it is not offered the section says why — never a blank.

> **Mockups:** [002.28–002.29 reading offer](../../../archisimple/docs/sprints/mockups/002.28-002.29-reading-offer.html) (boards A–C).

## Out of scope

- The AI panel entry (002.29, behind 121.0).
- Any change to when the service reads, what it caches or what it costs.
- Re-reading a cached zone with another model (« Extract again » keeps its current rule, `extractAgainOffered`).
- A price estimate before the click (needs the AI service's price table; see 002.29 Open Questions).

## Baseline (verified against `fr-urban-rules/src/index.js`, 2026-11-20)

- The button `written-extract` is built **only** in `writtenStateOf`, in the `not_started` branch (`index.js` ~12396), after the zone heading, a notice and the « Will read with » row.
- `writtenStateOf` returns **nothing** when `written === undefined` or `!written.available && written.zones.length === 0`. `writtenInput` makes that happen when: the plot is not under a PLU(i) (`!view.applies`, correct and silent by design — the regime has no written rules here); `locate()` found no companion (`view.location === undefined`) and no reading is held; or the pages were not asked yet.
- With no companion located the only trace is a one-line overview notice (`withZonePages`, `fr-urban-rules.notice.writtenRulesUnavailable`), placed in the report's overview, not in the Rules view's written section.
- Per the code comment on `beginPages`, the host caches the `locate()` probe and **probes a failure again after 60 s**. _Not verified in the host here._
- A zone in `unknown` shows « checking » and no button until its cache lookup (`cachedOnly`, never a model call) answers.
- A `done` zone has no « Extract » button; it has « Extract again » only when `extractAgainOffered`. The panel shows « Read by » and the page range but **does not say the reading came from the shared cache** or when it was made beyond the dated snapshot notice.
- Failures with `retry: false` in `WRITTEN_CODES` (`version_changed`, `document_too_large`, `not_a_pdf`, `no_text_layer`, `zone_chapter_not_found`, `chapter_too_large`) show a notice and **no action and no next step**.
- Readings are cached on the service by document, chapter pages, schema version and prompt version, **shared across accounts** (`jobs.mjs` `resultKey`); a zone whose chapter was already read (by anyone) arrives `done` with no model call. Observed 2026-11-20: UDA1 on parcel 13015 000 AD 0137 was served from the zone UD reading made minutes before.
- **Established (owner, 2026-11-20):** the button was missing because the zone **was already read**, so it arrived `done` from the shared cache and `done` offers no « Extract ». That is the intended state; the panel just does not say it came from a shared reading, so it looks like a button that has vanished. The other states below are **not** reported by the owner and are hardening, not a reproduced bug.

## Decisions

1. **A section never goes silent for a PLU(i) plot.** The `available === false` / not located case with no held reading becomes a written-rules block in the Rules view: a notice « The reading service can't be reached right now » (tone info), the next check time when known, and a « Check again » action. _Recommended._
2. **« Check again » re-asks `locate()`.** If the host's 60-second probe cache can be bypassed from an extension, the action does so; if it cannot, the action only re-reads and the notice states the time of the next automatic probe. Epic 0 settles which. No platform change in this sprint either way.
3. **The button leads.** In the `not_started` block the order becomes: heading, notice, **action**, then the « Will read with » row. It keeps `emphasis: 'primary'`.
4. **A permanent failure names its next step.** Each no-retry code gets one sentence of what the person can do (`zone_chapter_not_found`: the règlement's own link at the top of the section; `no_text_layer`: the document is a scan and cannot be read; and so on). Strings only.
5. **A reading that was already there says so, in a notice, first.** When a zone's first lookup found it `done`, the block opens with a notice (« already read on <date> — shared, nothing used from your AI allowance ») rather than only a field. This is the **reported problem's fix** (see Baseline). The extension derives it from the record (found at first lookup versus run in this session); nothing new is stored.
6. **`unknown` cannot stick.** A lookup that errors ends in an explicit state (the `else` branch already names codes); a test pins that no path leaves a zone in `unknown` after its lookup settles.
7. **Strings in en and fr**, in the extension's own namespace; no new SDK use.

## Epics

### Epic 0 — What the owner hit (answered)

The owner's missing button was the **already-read** case (see Baseline). **Epic 3 is therefore the fix for the reported problem and goes first**; Epics 1 and 2 are hardening for states nobody has reported, to be built only if the owner wants them (_recommended: build Epic 3 and the button order of Epic 2, defer the rest until it is seen_). A failing test for the already-read line comes before its code.

### Epic 1 — Every state has a line (D1, D2, D6) — hardening, optional

`writtenStateOf` and `writtenInput`: the not-located-and-nothing-held case returns a block; « Check again » action and its handler; `unknown` settles.
**Acceptance:** a PLU plot with the companion unreachable shows the notice and « Check again »; pressing it re-asks `locate()` and, when the service is back, the zone appears as `not_started` with its button; a plot outside a PLU(i) is unchanged and still silent.

### Epic 2 — The button leads and permanent failures help (D3, D4)

**Acceptance:** in `not_started` the action precedes the « Will read with » row; each of the six no-retry codes renders its own next-step sentence in en and fr; no failure code renders without either an action or a next step.

### Epic 3 — A reading found ready says so (D5) — the reported problem, first

The `done` block opens with a notice, above the fields, in plain words: « This zone was already read on <date> (shared reading). Nothing was used from your AI allowance. » It replaces the guess « where is the button? ». « Extract again » keeps its current rule and, when offered, sits under the notice with its reason.
**Acceptance:** a zone found `done` at first lookup shows the notice with the date and the model; a zone read in this session does not (its card and figures say it was just read); a snapshot-restored reading keeps its existing dated notice; en and fr.

## Testing

`written.test.mjs`: one test per state in `writtenStateOf` asserting its blocks (no state returns an empty block list for a PLU(i) plot), the action order, the six no-retry codes, the shared-reading line, and the not-located path with a fake `locate()` that fails then succeeds. Strings: the en and fr namespaces stay in step (the existing i18n test).

## Wording (en / fr)

Keys in the extension's own namespace. The French follows the extension's existing register (« vous », typographic apostrophes) and the app's term « budget IA ».

| Key                                             | English                                                                                                          | Français                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `written.state.alreadyRead` (Epic 3, D5)        | This zone was already read on {date} with {model}. It is a shared reading: nothing was used from your AI budget. | Cette zone a déjà été lue le {date} avec {model}. C’est une lecture partagée : rien n’a été décompté de votre budget IA. |
| `written.state.serviceUnreachable` (D1)         | The reading service can’t be reached right now. Written rules already read stay available.                       | Le service de lecture est injoignable pour le moment. Les règles écrites déjà lues restent disponibles.                  |
| `written.state.nextCheck` (D2)                  | Next automatic check at {time}.                                                                                  | Prochaine vérification automatique à {time}.                                                                             |
| `written.checkAgain` (D1)                       | Check again                                                                                                      | Vérifier à nouveau                                                                                                       |
| `written.code.zone_chapter_not_found.next` (D4) | Open the regulation with the link at the top of this section and find the zone’s chapter yourself.               | Ouvrez le règlement avec le lien en haut de cette section et cherchez vous-même le chapitre de la zone.                  |
| `written.code.no_text_layer.next` (D4)          | A scanned regulation can’t be read by AI. Use the link at the top to read it yourself.                           | Un règlement numérisé ne peut pas être lu par l’IA. Utilisez le lien en haut pour le lire vous-même.                     |
| `written.code.document_too_large.next` (D4)     | This regulation is too large to be read here. Use the link at the top to read it yourself.                       | Ce règlement est trop volumineux pour être lu ici. Utilisez le lien en haut pour le lire vous-même.                      |
| `written.code.chapter_too_large.next` (D4)      | This zone’s chapter is too long to be read. Use the link at the top to read it yourself.                         | Le chapitre de cette zone est trop long pour être lu. Utilisez le lien en haut pour le lire vous-même.                   |
| `written.code.not_a_pdf.next` (D4)              | The file isn’t a PDF, so it can’t be read. Open it with the link at the top.                                     | Le fichier n’est pas un PDF et ne peut donc pas être lu. Ouvrez-le avec le lien en haut.                                 |
| `written.code.version_changed.next` (D4)        | Refresh the plot’s rules to read the current version.                                                            | Actualisez les règles de la parcelle pour lire la version en vigueur.                                                    |

## Open Questions

- **O1.** Can an extension bypass the host's 60-second `locate()` probe cache? If not, is a platform option wanted (a small SDK addition, another sprint) or is a stated retry time enough? _Recommended: stated time._
- **O2.** The wording of D1 and D5 in French: the owner reads them.

## Outcome

- **Built (`fr-urban-rules` 0.23.0, SDK 1.41, nothing else changed):** `takeResult(record, json, found)` records `record.foundReady` when an answer comes from the cache lookup (`askCached`) and clears it for every other path (a reading this session ran, a joined job, a POST answered done); the `done` block of `writtenStateOf` opens with the notice `written.state.alreadyRead` (date, model) when `foundReady` is set and the reading is not the snapshot's; in `not_started` the `written-extract` action now precedes the « Will read with » row. Strings in en and fr (D5's wording, as accepted).
- **Tests (five in `written.test.mjs`, written before the code):** the notice appears for a zone found cached with its date and model, before the fields, with no « Extract » and no model call; a zone read in this session does not carry it; a zone read again after being found ready loses it; the action precedes the model row; the strings exist in en and fr. The extension's suite: 578 tests, 576 pass, 2 skipped, none fail.
- **Deliberately not built:** Epic 1 (the section for a reading service that cannot be reached, « Check again », the next-check time) and Epic 2's D4 (next-step sentences for the six permanent errors). The owner reported neither, and the sprint's own recommendation was to build Epic 3 and the button order first. They stay in this document as the next piece if the states are ever seen. O1 (bypassing the host's 60-second probe cache) is therefore still unanswered.
- **Behaviour to know:** the notice says « shared » and « nothing was used from your AI budget » for any reading found by the lookup, including one the same person made on an earlier day (the sentence is true for that view).
- **Not verified:** the editor and the NUC in a browser (no reading walked after the change); the French wording as the owner reads it in context; the repository's formatting (`index.js`, the changelog and the README were already not in the repo's Prettier style before this change and were left as they were).

### Follow-up (2026-11-20, plugins 0.24.0): validity, and who may replace a shared reading

Asked by the owner after the first NUC deploy (« is it free for the same users? account? the whole server? », then « what is its validity? »).

- **Facts established (source, 2026-11-20):** a reading is kept **server-wide**, keyed by the document (identifier and file), the chapter's page range and the schema and prompt versions — **no user, account, workspace or model in the key**. There is no time limit: a new règlement version has a new identifier, so its key is new; a schema bump removes the old results at the service's start (`evictOutdated`); a prompt bump changes the key and leaves the old entries to the least-recently-used eviction under the 2 GiB shared budget; a partial or budget-stopped reading is never kept. **A cached reading is found only while the document's text is cached too** (`fromCachedText` returns nothing without it): if the text is evicted first, the lookup says « not read » and the offer appears; reading then costs a fetch and no model call, because the result is still found when the job starts.
- **Built:** the offer's note now says « kept … until the regulation is replaced … uses no AI budget » (no « for everyone »); the already-read notice names **the regulation version** (the day at the end of the document's `idurba`; a date that is not a real date, or no date, gives the notice without it, never a guess); and **« Read the written rules again » of a whole reading is a form that must be confirmed** — a notice says whose reading goes (« Reading again replaces the shared reading of {date} ({model}) for everyone on this server »), the button opens a required « Replace the shared reading » choice, and `runWrittenAction` refuses a press with no `replace = yes` (so a caller that skips the form is refused too). A partial or stopped reading has no form: nothing shared is replaced.
- **Tests:** five more in `written.test.mjs` plus two existing ones updated to confirm; the extension's suite 591 tests, 589 pass, 2 skipped.
- **Browser (Chromium, `readingSharedFr.spec.ts`, project `reading-shared-fr`, Lyon UCe1b live, a gateway cache seeded with one complete reading):** the Rules view shows the notice with the date, the model, the version and « nothing was used from your AI budget », offers no « Read the written rules » button, shows « Reading again replaces the shared reading of … for everyone on this server » and a form (« Replace the shared reading », a select, Apply, Cancel); Apply with nothing chosen is refused by the host (« This value is required. ») and sends nothing; with « Yes, replace it » it sends one `POST …/v1/extractions?refresh=1`; the AI panel offers no card for the already-read zone; Cancel sends the cancel route and the shared reading still stands.
- **Spend, said honestly:** in that walk the replace was confirmed and cancelled **after the service had started extracting**, and **one model call (Anthropic claude-sonnet-5-5, one chunk of 7,731 characters, 4 items) did go out and finish** (about two cents at list price, estimated, not measured on the account). Cancel aborts the service's call but a provider call already in flight is still billed; the earlier walk of the unread zone was cancelled while fetching the document and made none.
- **Not done:** the `alreadyReadNoVersion` notice in a browser (a result whose document is undated cannot be made to match its query; the helper and the strings are tested), and the NUC.
