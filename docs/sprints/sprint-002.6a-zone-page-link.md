# Sprint 002.6a — Zone Page Link

> **Status:** **Implemented (2026-10-20), uncommitted** — `fr-urban-rules`
> 0.5.0, SDK 1.28; see the Outcome at the end. **Not done:** the walk behind
> 096.8a's local override (no Docker here) and the Firefox half of the
> fragment check (no Firefox here); Chromium was checked. _(Read "Draft
> (2026-10-20). Nothing is implemented" until then.)_ Split from the 002.6
> draft of 2026-10-19 by the Phase 2 review (below).
>
> **Version:** 1.1
>
> **Repository:** `archisimple-plugins`, package `fr-urban-rules`: 0.4.0 →
> **0.5.0**. 1.0.0 stays the first *published* version (002.4 DEC-5), and it
> is not yet cut. Later sprints' numbers are restated when they are reviewed.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 5.2, US-01 (the regulation opens at the zone's page). Platform:
> [Site Regulations](../../../archisimple/docs/milestones/site-regulations/README.md)
> Phase 2.
>
> **Prerequisites:**
>
> - **002.0–002.4** (the report, the link, the section).
> - **002.5a**: `GET chapter`.
> - Platform **096.8a**: the SDK minor carrying `PluginServiceToken` and
>   `locate()`, **1.28** in the ledger.
>
> **Not needed:** 096.7, 002.5b and 096.8b. This sprint never needs the
> source to ask to be read again (DEC-3).
>
> The package declares `sdkVersion` **"1.28"**.
>
> **Sizes:** a locator, one route's client, the link, a notice, the
> forward-compatible reader. No platform change. Small.

---

# Sprint Design Contract

- [x] **The host learns nothing French.** The service's address comes from
      `locate()`, never from the package. Everything crosses as 096.2's
      shapes. _(Held: `beginPages` takes `baseUrl` from `locate()` only, and
      `checkedLocation` refuses anything but an absolute `http(s)` base ending
      in `/`; no address is written in the package. The new blocks are 096.2's
      `link` and `notice`, and the platform's built `checkedReport` keeps
      every report of this sprint whole — 137 reports, 0 dropped, 0 refused.)_
- [x] **No model call.** This sprint asks only `GET chapter`. _(Held:
      `fetchChapter` builds `new URL('v1/chapter', baseUrl)` and nothing else;
      criterion 2's test asserts the path and `GET`.)_
- [x] **Phase 1 is unchanged without the service.** With `locate()`
      answering `undefined`, every rule, check and action is as in 0.4.0.
      _(Held, with the one addition DEC-1 asks for: the `info` notice. Test
      "criterion 1": the report without the token equals the one with
      `locate()` → `undefined`, and both equal a served report outside the
      overview's links and `document.href`.)_
- [x] **Nothing from the service becomes a URL** except an integer page,
      appended by the extension to 002.0's own link. _(Held:
      `checkedChapter` admits only two `Number.isInteger` pages in order,
      within `documentPages`; the href is `resolveLink`'s GPU URL +
      `#page=${from}`. The chapter's title reaches only a phrase parameter,
      cut to 80 characters.)_

---

# Current state

- **002.0** builds `report.document.href` from `resolveLink`
  (`status=document.production`, matched case-insensitively; already
  implemented, `index.js:619`) and opens it at the first page (002.0
  DEC-7).
- **The report is cached per plot** (`readPlot`, `cache` by plot key). A
  `design` or `action` read answers from that cache, and the rules, edges
  and checks are recomputed in `rnu.augment` on every read. A new read
  aborts the active one (`read`, line 832).
- **The section reader** (`sectionOf`, `SECTION_SCHEMA = 1`) lists a
  confirmation whose `ruleKey` names no current rule as "no longer in the
  plan", with **Forget** (`index.js:5365`).
- **SDK 1.27** has no `plugin-service` token. 096.8a adds it.

---

# Goal

On a PLU(i) plot whose deployment runs the companion service, the
regulation link opens at the zone's page, and the overview says which zone
and page. Without the service, nothing changes. The section reader becomes
forward-compatible, so that 002.6b's written confirmations are never
offered for Forget by a build that does not know them.

# Out of scope

- Extraction, written rules, states of a job (002.6b).
- Carte communale, RNU, a plan not on the GPU: no règlement, no lookup.

---

# Decisions

## DEC-1 — Finding the service

```js
const PluginServiceToken = { name: 'plugin-service' };
const location = await context.services.getOptional(PluginServiceToken)?.locate({ signal });
// { baseUrl: 'https://<site>/plugins-api/com.archisimple.fr-urban-rules/' } | undefined
```

- **`getOptional`**, not `get`: a host without the token answers
  `undefined`, never a throw.
- **`locate()` is asked on each PLU(i) read.** The host caches the probe
  and probes again after 60 s on a failure (096.8a DEC-6). Asking once per
  session would never find a container that started later.
- **When `locate()` answers `undefined`**, the overview carries a `notice`
  (`info`): « La lecture du règlement écrit n'est pas disponible sur ce
  déploiement ». The link stays, at its first page.
- **The client** builds only 002.5a's `v1` paths from the base URL, and
  checks every answer's shape. A non-JSON answer is `unavailable`. `fetch`
  is the editor's, and credentials ride on the page's own `basic_auth`
  session (same origin).

## DEC-2 — One chapter lookup per zone

- **One lookup per zone.** A plot straddling zones asks `GET chapter` once
  per zone with a `nomfic`, in parallel, and each zone keeps its own
  answer.
- **Asked once per (`upper(idurba)`, `nomfic`, zone) per session.** The
  answer is kept in a session map beside the plot cache, never inside the
  cached report. A `refresh` read asks again.
- **The read waits up to 2 s** for the chapter, then goes on with what it
  has. A late answer is kept for the next read (a `design`, `action` or
  `refresh` read, or the next Site read). ~~This sprint does **not** signal
  the host: that needs 096.8b's `onDidChange`, which 002.6b brings.~~
  **Revised at review (2026-10-20, owner decision Q1):** a late answer that
  changes the link fires the source's `onDidChange` (SDK 1.28), and the
  host's `source` read finds it in the session map with no request. An answer
  a waiting read will apply fires nothing.
  - Waiting inside the read avoids a second read that would abort the
    first (S5).
- **Review fixes (2026-10-20):**
  - **Refresh keeps a known page** until the new answer lands, and does not
    wait 2 s for a zone whose page is held; a passing failure on Refresh keeps
    the old page, and only an answer about the document replaces it (S4).
  - **A passing failure is asked again, backing off** (owner decision Q3):
    `source_unavailable` / `source_refused` after 5 min; `busy`,
    `internal_error`, the network, a timeout or an answer that is not the
    route's after 60 s; `rate_limited` after its `Retry-After` (1 min to 1 h).
    Every failed fetch costs the user's 30-an-hour document budget. Answers
    about the document are kept for the session; Refresh always asks.

## DEC-3 — The regulation opens at the zone's page

- **The href is set in `augment`, not in the cached report.** It becomes
  the regulation link + `#page=<chapter.from>` for the plot's main zone,
  from the session map. A late answer therefore applies at the next read
  without re-fetching anything.
- **Several zones:** the overview lists one link per zone (« Ouvrir le
  règlement, zone UCe1b, p. 121 ↗ »). `report.document.href` is the first
  zone's — **revised at review (owner decision Q2): the first zone that has a
  page**, else the first link.
- **The link label** says which page it opens: « Ouvrir le règlement, zone
  UCe1, p. 121 ↗ » or « Ouvrir le règlement ↗ ». When `match` is `prefix`,
  it names the chapter's title (« chapitre Zone UCe1 »).
- **Without the service, or on an error,** the link opens at the first page
  (002.0 DEC-7). An error is not shown as a source failure: it means "the
  page is not known", which is what the label says.
- **The 302 and the fragment** (002.0's risk): the GPU link redirects to
  `data.geopf.fr`, and a browser carries a fragment across a redirect that
  has none. This is checked in the walk, in Chrome and Firefox, and
  recorded.

## DEC-4 — The reader becomes forward-compatible (no schema bump)

- **The section stays `schema: 1`.** 002.6b adds fields within it, as 002.3
  added members.
- **Known rule-key prefixes** are `rnu:`, `psc:` and `entered:`. A
  confirmation whose `ruleKey` has **another prefix** is "from a newer
  version of the extension":
  - It is kept as it is and listed, read-only, with no Forget.
  - Any write keeps it untouched, as `withoutRule` already keeps other
    entries whole.
  - From 002.6b on, `written:` is known.
- **No released build lacks this rule.** 0.4.0 was never published, so the
  first published version (1.0.0) carries it.

## DEC-5 — Strings

`resources/i18n/fr-urban-rules/{fr,en}.json` gain:

- the not-available notice;
- the two link labels, plus the prefix-match label;
- the "from a newer version" line.

Both locales hold the same keys (002.0's test).

---

# Steps

1. **Locator and client** (DEC-1), with shape checks, against a fake built
   from 002.5a's fixtures.
2. **Per-zone lookup** with the 2 s wait and the session map (DEC-2).
3. **Link in `augment`** and the labels (DEC-3, DEC-5).
4. **Forward-compatible reader** (DEC-4).
5. **Walk** on Lyon AB0105 behind 096.8a's local override:
   - the link opens at p. 121 (fragment across the 302, in Chrome and
     Firefox);
   - in a deployment without the service, the link opens at the first page
     and the notice shows.

# Acceptance criteria

1. **No service, no change.** With `getOptional` answering `undefined`, or
   `locate()` answering `undefined`:
   - a PLU(i) plot shows the not-available notice;
   - `report.document.href` has no fragment;
   - every phase-1 rule, check and action is unchanged.

   (test with a stub registry)
2. **Lyon, served in time.**
   - A read asks `GET chapter` once and never `POST`.
   - `report.document.href` ends `#page=121` when the answer comes within
     2 s.
   - A `design` read after that sends no request.

   (test counting requests)
3. **Lyon, served late.** When `GET chapter` answers after 2 s, the read
   returns the first-page link, and the next read (any reason) returns
   `#page=121` with no new request (fake clock).
4. **Two zones, two lookups.** A plot on two zones asks two lookups, and
   the overview carries two links (test).
5. **Forward-compatible reader.** A section with a confirmation keyed
   `written:UCe1b:…` is read writable. The entry is listed as from a newer
   version, with no Forget. A Confirm on another rule writes it back
   unchanged (test).
6. **Locate per read.** `locate()` is called on each PLU(i) read, not once
   per session (test).
7. **Manifest.** The manifest declares 096.8a's SDK minor, and
   `archisimple package validate ./fr-urban-rules` passes against a
   platform build carrying 096.8a.

# Testing strategy

- **Unit:** a stub `plugin-service`, and a fake service from 002.5a's
  fixtures. Tests run with `node --test fr-urban-rules/tests/*.test.mjs`.
- **Manual:** the walk of step 5.

# Risks

- **A prefix match opens a parent chapter.** The label names the chapter.
- **The read waits 2 s on a slow service.** The other sources are already
  in flight, and the wait overlaps them.

# Definition of Done

- The criteria are walked against the code.
- The Design Contract boxes are checked.
- `node --test fr-urban-rules/tests/*.test.mjs` is green.
- The walk of step 5 is recorded.
- `archisimple package validate` is green against a platform build with
  096.8a.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| **002.5a** | `GET chapter`, its answer (`pages`, `found`, `match`, `title`) and its codes |
| **096.8a** | `PluginServiceToken`, `locate()`, the SDK minor (1.28) |
| **002.0** | The link and its resolution |

**Version needs:**

- package `fr-urban-rules` **0.5.0**;
- `sdkVersion` **"1.28"** (096.8a's minor);
- the section stays `schema: 1`;
- no new capability (`plugin-service` is ambient).

# Corrections to the README / proposal

1. **Proposal § 13 / US-01**, "the regulation opens at the zone's page":
   this holds only where the deployment runs the companion service.
   Without it, the link opens at the first page, as in phase 1.
2. **The README's Phase 2 row for 002.6:** the work is now 002.6a (0.5.0,
   096.8a's minor) and 002.6b (0.6.0, 096.8b's minor). Package versions are
   restated from 0.4.0.

# Review (2026-10-20, Phase 2)

An independent pre-implementation review of the 002.6 draft. The
coordinator's decisions were taken on the owner's behalf and applied here.

- **Split.** The zone page link needs only 002.5a and 096.8a, so it lands
  first. Written rules are 002.6b.
- **S1: no schema bump.** The reader treats an unknown `ruleKey` prefix as
  "from a newer version", never stale and never offered for Forget. This
  lands here, so that every published build carries it (DEC-4).
- **S5: no second read.** The read waits up to 2 s for the chapter instead
  of firing a re-read that would abort it. The signal comes with 002.6b on
  096.8b (DEC-2).
- **S15: one chapter lookup per zone** (DEC-2).
- **Versions** are restated from 0.4.0. 002.0's resolution fix was already
  implemented (`index.js:619`); the draft's "fixed here" was stale.
- **096.8 → 096.8a.**
- **NITs:** `getOptional`; `locate()` per read, so that 096.8a's 60 s
  re-probe can work; the href is built in `augment`, not in the cached
  report.

# Outcome (2026-10-20)

**Landed, uncommitted.** Steps 1–4, and step 5 in part (below). All gates
green.

## What landed

- **`fr-urban-rules` 0.5.0**, `sdkVersion` **1.28**, no new capability
  (`plugin-service` is ambient). The manifest's description says where the
  zone's page comes from.
- **Locator** (DEC-1): `PluginServiceToken = { name: 'plugin-service' }`;
  `activate` hands the reader `() => context.services.getOptional(token)`, and
  `beginPages` calls `locate({ signal })` on **each** PLU(i) read — never under
  the RNU, a carte communale, `not_published` or `unknown`. A throwing
  `locate()` is logged and read as no service; `checkedLocation` checks the
  answer.
- **Client** (DEC-1): `fetchChapter` — `GET <baseUrl>v1/chapter?partition=
  &idurba=&nomfic=&zone=`, `accept: application/json`, `credentials:
  'same-origin'`, the editor's `fetch`; a `Content-Type` that is not JSON or a
  body that does not parse is `unavailable`; a `200` must pass
  `checkedChapter`, else `malformed`; any other status answers the body's
  `error` code (`version_changed`, `zone_chapter_not_found`, `rate_limited`…).
  Never throws.
- **Per-zone lookup** (DEC-2): `chapterLookups` — one per zone with a `nomfic`,
  keyed `upper(idurba)/nomfic/zone`, inputs checked against 002.5a DEC-4's
  patterns; started as soon as wave 2 has the zones (or at once from the
  cache), so the wait overlaps wave 3; all zones in parallel. A session map
  beside the plot cache (at most 200 entries, LRU) holds each lookup's promise
  and answer; a later read joins a pending one. Lookups run on a session
  signal, not the read's: a superseded read's lookup is the next read's;
  `dispose` aborts them and clears the map. `settled()` races the lookups
  against a 2 s timer started with them, and the read's abort.
- **The link** (DEC-3): `withZonePages`, applied to every report a read
  answers (progress included) after `rnu.augment`, from the session map as it
  stands — never stored in the cached report. One link per zone: « Ouvrir le
  règlement, zone UCe1b, chapitre Zone UCe1, p. 121 » (prefix),
  « Ouvrir le règlement, zone A, p. 44 » (exact), « Ouvrir le règlement,
  zone X » for a zone with no page beside one with a page; no zone with a page
  leaves 0.4.0's single link, its detail saying why when the service said
  (`detailZoneNotFound`, `detailVersionChanged`, else `detailPageUnknown`).
  `report.document.href` is the first zone's link.
- **Notice** (DEC-1): `fr-urban-rules.notice.writtenRulesUnavailable`, `info`,
  after the link, when `locate()` answered `undefined`.
- **Forward-compatible reader** (DEC-4): `KNOWN_RULE_PREFIXES` (`rnu:`, `psc:`,
  `entered:`) and `isNewerRuleKey`; `isConfirmation` accepts a newer entry
  whatever its `decision`; `plannedRules` puts newer entries (any plot) in
  `newer`, never `stale` or `foreign`; the rules view lists them under « D'une
  version plus récente » with a notice and a three-column table, no actions;
  `forget-entry` refuses a newer entry even when its subject is forged. Every
  write already spreads the section and filters by exact `ruleKey`, so a
  newer entry is written back whole.
- **Strings** (DEC-5), both locales, same keys: the notice; the labels
  `link.regulationZonePage`, `link.regulationZoneChapter`,
  `link.regulationZone`; the details `link.detailPage`,
  `link.detailPageUnknown`, `link.detailZoneNotFound`,
  `link.detailVersionChanged`; `heading.newerVersionRules` and
  `notice.newerVersionRules`.
- **Tests**: `fr-urban-rules/tests/zone-page.test.mjs` (20 tests): a stub
  `plugin-service`, and a fake service answering from 002.5a's recorded
  document — Lyon's chapter is derived from `lyon/regulation/outline.json`
  (« Zone UCe1 », 121, to the page before « Zone UCe2 », 145), `version_changed`
  for another `idurba`/`nomfic`, `zone_chapter_not_found` for an unknown zone.
  `reading.test.mjs` criterion 14 now expects the notice after the link (no
  service in those tests); `package.test.mjs` criterion 1 pins 0.5.0 and 1.28.
- **Docs**: the package README (« The zone's page (0.5.0) », SDK 1.28, the
  editor's origin in "Hosts contacted"), CHANGELOG 0.5.0, the repository's
  README and CLAUDE.md (`plugin-service` in the token tables, SDK 1.28), the
  milestone's status line and US-01 (the correction below).

## Gates

- `node --test fr-urban-rules/tests/*.test.mjs`: **235/235** (215 + 20) on
  Node 24.18.0.
- `node --test 'services/*/tests/*.test.mjs'`: **126/126**;
  `node --test sh3f-importer/tests/*.test.mjs`: 99/99.
- `node ../archisimple/tools/cli/dist/archisimple.js package validate
  ./fr-urban-rules`: **passed** (`com.archisimple.fr-urban-rules@0.5.0`, SDK
  1.28; the CLI's dist embeds `SDK_VERSION = "1.28"`).
- `node tools/build-index.mjs --cli ../archisimple/tools/cli/dist/archisimple.js
  --out <scratchpad>/index-out`: 2 packages (fr-urban-rules **0.5.0**,
  sh3f-importer 1.3.0); `node tools/check-index.mjs --platform ../archisimple
  --index <scratchpad>/index-out/index.json`: **2 of 2 accepted**.
- **The platform's built `checkedReport`** (`packages/extension-host/dist`,
  with actions; a scratch script): Lyon served, Lyon without the service, Lyon
  late (both reads), Lyon on two zones, Lyon `409`, Gordes served, Lyon with a
  `written:` confirmation, Brouennes (RNU) — **137 reports** (answers and every
  progress report), **0 dropped, 0 refused**.
- `prettier --check` on the files this sprint wrote or changed: clean.
  (`acceptance.test.mjs`, `acceptance-infra.test.mjs` and `helpers.mjs` were
  already not, and were left alone.)
- **Live, local gateway** (`services/gateway` on port 4599, data in the
  scratchpad, real HTTPS to the GPU; planning answers from 002.0's recordings;
  `locate()` probing `health` as 096.8a's host does):
  - **Lyon, cold service cache:** the `site` read waited **2 030 ms** and
    answered the first page (the service was downloading the 11 MB règlement:
    `miss`, 3 609 ms); the `design` read after it answered
    **`#page=121`**, « zone UCe1b, chapitre Zone UCe1, p. 121 », with **no
    new request** — criterion 3, live.
  - **Gordes A, cold:** answered within the wait (1 588 ms; service `miss`,
    1 513 ms): **`#page=44`**, `exact`.
  - **Lyon, a new reader, warm service:** 120 ms, `#page=121` on the first
    read (service `hit`, 7 ms). One `GET chapter` per reader, no `POST`.
  - Every report: `checkedReport` 0 dropped. The service's `tmp/` was empty
    afterwards.

## Acceptance criteria, walked

1. **Met.** `zone-page.test.mjs` "criterion 1: without the token…": the notice
   (`info`), `document.href` and the link with no fragment, the 0.4.0 label
   and detail, no request; `locate()` → `undefined` gives the identical
   report; both equal a served report in every rule, check, view, action and
   source (`phaseOne`), the overview differing only by the notice and the
   link. "criterion 1: under the RNU…": no `locate()`, no notice, the report
   identical with and without the token.
2. **Met.** "criterion 2: Lyon asks GET chapter once…": one request, `GET`,
   path `…/v1/chapter`, the query `DU_200046977`, `200046977_PLUI_20260326`,
   `200046977_reglement_20260326.pdf`, `UCe1b`; `document.href` ends
   `#page=121`; the `design` read sends no request at all (the recorded fetch
   and the fake service both unchanged). Live: the warm Lyon read.
3. **Met.** "criterion 3: an answer after 2 s…": the 2 s elapse (an injected
   wait, no real timer) while the fake holds the answer; the read answers the
   first page with no notice; once released, `source`, `design`, `site` and
   `action` reads all answer `#page=121`, with one request in total. Also
   "a read superseded while it waits…" (the next read joins the lookup).
   Live: the cold Lyon read.
4. **Met.** "criterion 4: a plot on two zones…": Lyon's `zone-urba` answer
   with a second zone, `UCe2`; both requests are in flight before either
   answers; two links (p. 121 and p. 145); `document.href` is the first's.
   "criterion 4: one zone with a page and one without…".
5. **Met.** "criterion 5: a `written:` confirmation…": `{ schema: 1,
   confirmations: [written:UCe1b:…, decision 'confirmed_with_note'] }` reads
   writable (no `newerSection` notice), is listed under
   `heading.newerVersionRules`, never `noLongerInPlan`, with no
   `forget-entry` anywhere; a Confirm on « Hauteur Max-22 » writes once, the
   `written:` entry deep-equal and first; a forged Forget writes nothing.
6. **Met.** "criterion 6: locate() is asked on each PLU(i) read…": three reads
   (`site`, `design`, `source`), three `locate()` calls, one lookup. Also
   "the service found after a read without it…".
7. **Met.** `package.test.mjs` criterion 1 (`'1.28'`); `package validate`
   passes against the CLI built with 096.8a's `SDK_VERSION = "1.28"`.

## Step 5, the walk

- **Done in part.** The fragment across the GPU's `302`: `curl -I` shows
  `Location: https://data.geopf.fr/annexes/gpu/documents/DU_200046977/…/200046977_reglement_20260326.pdf`
  — no fragment of its own, so RFC 7231 § 7.1.2 has the browser keep
  `#page=121` — and **Chromium** (Playwright's, headed) navigated
  `…/files/200046977_reglement_20260326.pdf#page=121` to
  `https://data.geopf.fr/…/200046977_reglement_20260326.pdf#page=121`, its PDF
  viewer showing **121 / 803**, « Zone UCe1 — Centre ancien imbriqué »
  (screenshot in the session's scratchpad). Gordes' file redirects the same way.
- **Not done:** **Firefox** (not installed here) and the walk in the editor
  behind 096.8a's local override, with and without the service (no Docker
  here). The local gateway run above stands in for the "with" half; the
  "without" half is criterion 1's test.

## Deviations

1. **Applied after `rnu.augment`, not inside it** (DEC-3 "set in `augment`").
   `plannedRules` builds an entered rule's citation as
   `report.document.href + '#page=<its page>'`: a zone page set before it
   would give `…#page=121#page=5`. `withZonePages` runs on `augment`'s result
   in `read()`, on every answer and progress report — the property DEC-3 is
   after (built at each read, never cached) holds.
2. **A passing failure is asked again** (DEC-2 said "once per session"),
   backing off since review (Q3: 5 min after `source_*`, 1 min after `busy`,
   `internal_error` and the rest, `rate_limited` its `Retry-After`); until
   review it read: after 60 s. `rate_limited`, a `5xx` without a code, the network, a timeout,
   an answer that is not JSON or not of the shape: kept 60 s (as `locate()`
   re-probes), then asked again. 002.5a DEC-11's codes that describe the
   document or the request (`zone_chapter_not_found`, `version_changed`,
   `chapter_too_large`, `no_text_layer`, `not_found`…) are kept for the
   session; Refresh asks again either way. Otherwise one `429` would cost the
   page for the session.
3. **More strings than DEC-5's list**: a zone-only label (a zone without a
   page beside one with), the page detail (0.4.0's says "at its first page"),
   three "why not" details (DEC-3's "which is what the label says" — 002.5a
   DEC-11 said 002.6a maps the codes to phrases; only two codes get their own,
   the rest one phrase), and a heading plus a notice for the newer entries.
   The notice's key is `notice.writtenRulesUnavailable`; its French adds
   « : le règlement s'ouvre à sa première page ».
4. **A `locate()` still pending at 2 s shows no notice** — slow is not absent;
   the link stays at its first page.
5. **`isConfirmation` accepts a newer entry whatever its `decision`.**
   Without it, a newer version's new decision value would make `sectionOf`
   read the whole section read-only, against criterion 5's "read writable".
   A newer entry on another plot is listed as newer, not "from another plot".
6. **Several zones, none with a page:** 0.4.0's single link, not one per zone
   (they would all open the first page). With at least one page, one link per
   zone. `document.href` is the first zone **with a page** (owner decision Q2,
   applied at review; read "the first zone's, literally" until then).
9. **The source fires `onDidChange`** (owner decision Q1, applied at review),
   which DEC-2 had left to 002.6b.
7. **A zone whose inputs fail 002.5a's patterns is not asked** (it could only
   be `400`); its page is unknown.
8. **Chapter timeout 150 s**, above the service's 120 s PDF timeout; nothing
   waits on it past 2 s.

## Corrections to the README / proposal, applied

1. The milestone's US-01 bullet now says the zone's page holds only where the
   deployment runs the companion service, and its status line names 002.6a as
   implemented. (Phase 2's row already read 002.6a/002.6b.)
2. Package versions as restated: 0.5.0 here.

## Questions for the owner

_All four answered on 2026-10-20 by the coordinator on the owner's behalf;
see "Review fixes" below._

1. **The first read on a cold service misses the page.** Live, Lyon's first
   read answered the first page (the service took 3.6 s to fetch the 11 MB
   règlement); the page arrives at the next read, and nothing prompts one
   until 002.6b fires `onDidChange` (096.8b). Accept until 002.6b, or should
   002.6a already fire the signal — it is in SDK 1.28 — once a late chapter
   lands? It was left out because DEC-2 says "this sprint does not signal the
   host".
2. With several zones, `document.href` is the first zone's link even when
   only a later zone has a page (deviation 6). Prefer the first zone **with**
   a page?
3. Keep the 60 s retry of passing failures (deviation 2)?
4. Firefox and the editor walk behind the local override (step 5) remain
   yours.

# Review fixes (2026-10-20)

An independent review found no blocking issue. The coordinator took the
owner's decisions; they supersede the Outcome above where the two differ
(deviations 2 and 6, the questions).

## Owner decisions

1. **Q1 — fire `onDidChange` when a late chapter lands.** The source carries
   `onDidChange(listener) → Disposable` (SDK 1.28, 096.8b). A lookup's answer
   fires the listeners only when no read is still waiting for it (that read
   will apply it) and only when the link it gives differs from the one a read
   last showed for that zone (a page now, or another "why not" detail).
   `dispose` clears the listeners. DEC-2 revised in place.
2. **Q2 — `document.href` is the first zone that has a page**, else the first
   link. DEC-3 revised in place.
3. **Q3 — keep the retry, backing off**: `source_*` (502) 5 min; `busy`,
   `internal_error` 60 s (also the network, a timeout, a non-JSON or
   misshapen answer); `rate_limited` its `Retry-After`, clamped to 1 min–1 h
   (`fetchChapter` keeps the body's `retryAfterSeconds`). DEC-2 revised.
4. Firefox and the editor walk stay the owner's.

## Fixes

- **S1.** `nextSection` refuses `confirm`, `not-applicable`, `edit-value` and
  `reopen` on a newer entry's key before any branch (`edges.changed`, no
  write). The vacuous forged-Forget test is replaced: a real stale entry
  (`rnu:gone`) is offered Forget; its own subject with the newer key swapped
  in is refused, as are forged Confirm, Does not apply, Edit value and
  Reopen — 0 writes; the real Forget then writes once and keeps the newer
  entry whole.
- **S2.** `CHAPTER_DETAIL_KEYS` is a `Map`; a service code `constructor` or
  `__proto__` reads as "page unknown" (test).
- **S3.** `checkedChapter` requires `documentPages`: a safe integer, with
  `to ≤ documentPages ≤ 2000` (tests: missing, 2001, 2⁵³, a string).
- **S4.** An entry is kept across a new ask and shows its page until the new
  answer lands; a zone whose page is held is not waited for (Refresh no
  longer holds the read 2 s); a passing failure after a page keeps the page,
  an answer about the document replaces it (test).
- **NITs.** `isNewerRuleKey` is "has a `:` and no known prefix";
  `checkedLocation` requires the page's own origin when `globalThis.location`
  exists; past 200 rows the newer-entries table says how many it does not
  list (`notice.notListed`); a `200` without `Content-Type` is
  `unavailable`. New tests: `locate()` throwing, answering a base without
  `/`, a string, or a service with no `locate` → the notice; an entered rule's
  `#page=130` is not doubled by the zone's `#page=121`; the map holds at most
  200 lookups (201 zones); `activate` asks `getOptional({ name:
  'plugin-service' })` on each read and registers `onDidChange` on the source.

## Gates, again

- `node --test fr-urban-rules/tests/*.test.mjs`: **247/247**
  (`zone-page.test.mjs`: 32).
- `node --test 'services/*/tests/*.test.mjs'`: 126/126.
- `package validate ./fr-urban-rules`: passed (0.5.0, SDK 1.28).
- build-index into the scratchpad: 2 packages; check-index (`--platform
  ../archisimple`): 2 of 2 accepted.
- The platform's built `checkedReport` (with actions) on Lyon served, without
  the service, late (both reads), two zones, an unpaged zone first, `409`,
  a `written:` section, plus Gordes and Brouennes: **155 reports, 0 dropped,
  0 refused**; the unpaged-first case answers `#page=121`.
- `prettier --check` on the changed files: clean.
