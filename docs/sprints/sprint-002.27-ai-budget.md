# Sprint 002.27 — The Reading Is Inside The AI Budget

> **Status:** Landed in the working tree (2026-11-19), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.22.0**, `sdkVersion` **"1.41"** unchanged; `fr-urban-rules-service` **0.7.0**; the gateway
> unchanged in version (0.1.0). The platform needs nothing new: this is the plugins half of the platform's
> [Sprint 120.2](../../../archisimple/docs/sprints/sprint-120.2-ai-budget-urban-rules.md) (ADR-0136, Rules 1, 7, 10 and 11).
>
> **Milestone:** the PLU-extraction work, after 002.26: a reading is an AI feature like any other, so its cost belongs to the account that asked.
>
> **Previous Sprint:** [002.26 What Is Left To Decide, Grouped](sprint-002.26-left-to-decide-grouped.md).

## Goal

The platform's AI service now meters every call by an opaque per-user subject and, when the account has a monthly budget, refuses an `extract` it cannot
pay for (`402 ai_budget_exhausted`, or a transient `503 ai_budget_unavailable`). Make the urban-rules reading **carry the subject** to it, **stop
cleanly** when it is refused, **answer the parts already read**, and let the panel **say so in the person's language** — never as a connection
failure.

## Out of scope

- **Resuming a reading.** There is no resume: the chunk memory the service keeps (in memory, 30 minutes) is not a promise and the panel does not make
  one. A durable chapter cache is another piece of work.
- **Charging a joiner.** A reading already running for the same chapter is joined; it runs as, and is charged to, the user who started it (unchanged).
- **A cap specific to urban-rules reading**, any price or ledger logic here (ai-service owns both), and the platform repository.
- **A test that a forged subject header is refused**: this process believes any header it is sent, like the features and the user headers; its trust
  is the network. Said in the service README instead.

## Baseline (verified against the source, 2026-11-19)

All of the platform sprint's Baseline claims held, with two nuances:

- `ai-client.mjs` forwarded only the features; `call()` threw `AiError(code, status)` and dropped the body. **True.**
- The gateway reads `x-authenticated-user` and hands the service a hash, a source and a limit key; features ride the request to the job at `post()`
  (`route`) and outlive the request. **True.**
- `RETRIED` / `REFUSED` named the codes; `ai_budget_exhausted` and `ai_budget_unavailable` were in neither; `REFUSED` throws out of `extractChapter`
  and discards the `rules` local to it. **True** (the platform text said a refused chunk "would fail and the next would be tried": it would, one
  by one, ending `extraction_failed`).
- There is no `partial` job state, only `done` with `chunks.failed`; a partial result is answered to its job and never cached; the memo lives in
  memory for 30 minutes. **True — with a nuance:** because that memo holds the chunks read for 30 minutes, a plain POST made again inside that time
  reuses them and asks the model only for the rest. That is incidental, not a resume, and nothing here relies on it or promises it.
- `RETRIED` has **no backoff**: a retried code is tried again at once (two attempts per part). The platform text speaks of "its backoff"; there is none
  for any code, and `ai_budget_unavailable` joins `RETRIED` with the same semantics.
- The panel is the extension `fr-urban-rules` (own `resources/i18n`, sdk 1.41). **True.**

## Decisions

1. **The subject travels like the features, one step further than the features go.** The gateway reads `x-authenticated-ai-subject` (one printable-ASCII
   token ≤ 128 characters; missing, repeated, over-long or malformed is none — never repaired) and hands it to `service.handle` as `aiSubject`;
   `extractions.post` keeps it **in the job's `route`**, taken at the POST that **started** the job, so a job outlives its request and still reads as its
   starter; the AI client sends it as `x-authenticated-ai-subject` on **`extract` only**, to `ARCHISIMPLE_AI_SERVICE_URL` only. Not on `health` (not a
   metered call), never an `Authorization`, never the user id (`x-authenticated-user` is not forwarded), never logged. A call with no subject is sent as
   before and ai-service records it as unattributed.
2. **The error body is read.** `call()` keeps `AiError.budget` — `{ message?, remainingMicrousd?, budgetMicrousd?, resetsAt?, reason? }` — for
   `ai_budget_exhausted` and `ai_budget_unavailable` only, each field only when well-formed (integer micro-dollars, `null` for no budget, a parseable
   date, a listed reason). Any other body — not JSON, no error code, another code — is the generic error exactly as before (`malformed`,
   `provider_error`, the code it carries).
3. **`ai_budget_exhausted` is terminal for the job.** `extractChapter` stops starting parts at the refusal (it is neither retried nor counted in
   `chunks.failed`), returns the rules of the parts read, `chunks.unread` (the refused part and those after it) and `stopped`. `ai_budget_unavailable` is
   added to `RETRIED`.
4. **The shape of the stop** — the smallest honest one, consistent with how a partial reading is already reported:
   - **Some part read:** the job ends `done` and its `result` is the ordinary result plus
     `stopped: { reason: 'ai-budget', detailReason?, remainingMicrousd?, budgetMicrousd?, resetsAt? }` and `chunks: { of, failed, unread }`
     (`unread` present only on a stop). It is **not cached** (the same "partial is answered to its job" rule, now `failed === 0 && stopped === undefined`).
     No `complete: false` field: `chunks.unread`/`stopped` already say it, and a stored derived flag would be a second source of truth.
   - **No part read:** there is no result to answer, so the job ends `failed` with `error: { code: 'ai_budget_exhausted', detailReason?, … }` (a new
     `ERROR_STATUS` entry, 402) and its rate-limit charge is given back.
   - `detailReason` is ai-service's `reason`; ai-service's `message` is never passed on (the panel words the stop, in its own language).
5. **Shared jobs are unchanged and said.** The joiner is not charged; the starter's stop ends the joiner's reading with the same answer. Documented in
   the service README and the `jobs.mjs` header.
6. **The panel words it in its own strings.** A stopped result is **partial** everywhere the panel already treats a partial reading (not "no longer
   read", not complete), with its own notice — « Lecture interrompue : votre budget IA mensuel est épuisé après N parties sur M. Ce qui a été lu est
   conservé. Il reste environ X. Il se renouvelle le D. Une nouvelle lecture repart de la première partie. » — the remainder rounded **down** to the cent
   and formatted by the host in the reader's locale (`{amount, number, ::currency/USD}`), the date by `{date, date, medium}`, a missing figure left out by an
   ICU `select`. The offer is a plain read (« Relire le chapitre »), not « Extract again ». The card ends `partial` with « Read again ». The stop is kept in
   the project's snapshot with the rules. No resume is promised.

## Acceptance

Met by tests (see the Outcome): every `extract` call of a job carries the starter's subject, also after its request, and nothing else about the user;
a `402` ends the reading with the parts read answered, the typed reason and the numbers, and nothing cached; a `503` is retried; a joiner is not charged
and sees the starter's stop; a malformed `402` body is the generic error; the panel's message in en and fr.

## Outcome

- **Service 0.7.0** (`ai-client.mjs`, `extract.mjs`, `jobs.mjs`, `service.mjs`, `errors.mjs`) and **gateway** (`gateway.mjs`: `parseAiSubject`, `aiSubject`
  on the request; version unchanged). **Extension 0.22.0** (`src/index.js`, both i18n files).
- **Tests:** `services/fr-urban-rules-service/tests/ai-budget.test.mjs` (11, a real client against a loopback stub of ai-service: the header set, the
  job that outlives its request, the joiner, the 402 mid-chapter and at the first part, the 503 retried and persistent, bodies that are not the documented
  one); two in `services/gateway/tests/gateway.test.mjs` plus an end-to-end one (the stamp read over HTTP is what the stub receives, the user is not,
  neither is logged); five in `fr-urban-rules/tests/written.test.mjs`.
- **Not measured:** the cost of a real reading against a real budget (the platform sprint's acceptance of a small budget on a test user); that needs the
  platform's AI service with a ledger and a test account, and is the platform's walk.

### Deviations

- **No `complete: false`** and no `partial` job state (decision 4).
- **No backoff for the 503**: none exists for any retried code; it is retried once at once.
- **The forged-header test of the platform sprint is not written** (it cannot be: this process believes any header).

### Not verified

- A reading against the platform's real ledger and a real stop in the editor, in either language, on screen; the host's rendering of
  `{amount, number, ::currency/USD}` was checked here with `Intl` only (the strings are ICU, as the other plural and date strings are).

## Post-sprint documentation

- [x] Plugin CHANGELOG, README, the service README (« The AI budget »), the milestone row.
