# Sprint 002.10 — Regulation Watch

> **Status:** **Draft (2026-10-19)** — nothing implemented. Written from the
> proposal v2.2 (§4 probe, §4.3 pitfalls, §8, §10, §12 Phase 4) and a
> read-only live probe made while drafting (§"Probe, 2026-10-19"). Phase 4
> of the proposal; the platform's milestone closes without it (096.14
> question 3).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service` (002.5a–b)
> and `fr-urban-rules`.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> §12 Phase 4 "Scale": national cache, change detection, Géorisques v2 token.
> Platform README §3 row 002.10.
>
> **Prerequisites:** 002.9 closed (the service runs in a deployment, caches by
> document, extracts through 096.7). Platform: 096.8a (ADR-0114: how a
> package's service is configured and reached; and SDK 1.28's
> `RegulationSource.onDidChange`, already declared since 002.6b). No platform
> change is needed (DEC-3).
>
> **Sizes:** a watcher and a store in the service, a Géorisques proxy, a
> measurement script and its report, one extension change. Medium.

---

# Sprint Design Contract

- [ ] **The GPU is the authority for "a new version exists".** Never a
      heuristic on dates in a file name.
- [ ] **No confirmation is rewritten by the watch.** Reopening is derived at
      read time from the stored `idurba` / `datvalid` (proposal §8); the watch
      never writes the project, and the extension writes it only through a
      user's Request (ADR-0112).
- [ ] **The Géorisques token lives in the service's environment only.** It
      never reaches the browser, an `.aspkg`, `index.json`, a log line or a
      response body. A test greps the built archive and the service's
      responses for it.
- [ ] **The service stores no project data.** It watches documents
      (partitions), never parcels, addresses or geometry.
- [ ] **Polite to public services.** Every outbound call is rate-limited
      and identified (`User-Agent` naming the deployment's contact, if the
      owner gives one).
- [ ] **No live call in any test.** The watcher, the proxy and the
      measurement script are tested on recorded answers.
- [ ] **A measurement is a report with its method**, reproducible from a
      seed and a date, not a number in a sentence.

---

# Probe, 2026-10-19 (read-only, recorded)

Made with `curl` from the drafting machine, 19:32–19:34 UTC. The answers are
summarised; the full bodies are not committed.

| # | Request | Answer |
| --- | --- | --- |
| 1 | `GET geoportail-urbanisme.gouv.fr/api/document?partition=DU_200046977` | 200, 0.17–0.30 s. **20 items, all `status: document.deleted`, `effectiveStatus: ARCHIVE`**, oldest first (2022-07 → 2025-09). The current version is **not** in the default page |
| 2 | same `&limit=100` | 25 items: 23 archived, one `document.lost` (`200046977_PLUi_20260326`, 2026-04-07) and the current one last |
| 3 | same `&offset=20` | the same first 20: `offset` appears ignored |
| 4 | same `&status=document.production` | **1 item**: id `4f3ddc27a9611b4bc94fa161443b8e86`, `originalName` `200046977_PLUi_20260326`, `legalStatus` `APPROVED`, `effectiveStatus` `EN_VIGUEUR`, `publicationDate` 23/04/2026 13:44:58 |
| 5 | `…?partition=DU_84050&status=document.production` (Gordes) | 1 item: `84050_PLU_20241017`, id `703e6c2a…318c2e`, published 27/03/2025 |
| 6 | `…?partition=DU_56196` (Rochefort) | `[]` |
| 7 | `…?status=document.production&limit=3` (no partition) | 200 in 1.8 s; returns SUP documents (A7, PM1) by département, not a "recently changed" list |
| 8 | `apicarto.ign.fr/api/gpu/document?geom=<Lyon point>` | 200, 0.21 s; `{id, gpu_doc_id, name: 200046977_PLUi_20260326, partition: DU_200046977, gpu_status: production, gpu_timestamp: 2026-04-23T09:35:17Z, du_type}` |
| 9 | `apicarto.ign.fr/api/gpu/zone-urba?geom=<Lyon point>` | `UCe1b`, `idurba` **`200046977_PLUI_20260326`** (upper-case `PLUI`), `datvalid` 20260326, `partition`, `gpu_doc_id`, `gpu_timestamp` |
| 10 | `apicarto.ign.fr/api/gpu/municipality?insee=56196` / `55083` / `69123` | 0.10–0.11 s; `is_rnu` false / true / false. **`insee=` works without a geometry** |
| 11 | `www.georisques.gouv.fr/api/v2/gaspar/risques?code_insee=69123` | **401**, `www-authenticate: Inscription gratuite obligatoire…`; CORS `*`, `Authorization` allowed |
| 12 | `georisques.gouv.fr/api/v1/gaspar/risques?code_insee=69123` | 200, 0.17 s: v1 still answers |
| 13 | `geo.api.gouv.fr/communes?fields=code,population,codeDepartement` | 200, 0.47 s, 2.7 MB: every commune, overseas collectivities (`98x`) included |

**What this settles:**

- **Which endpoint reveals a new version:** the GPU document API filtered by
  partition **and** `status=document.production` (row 4). A new version is a
  different `id` (and `originalName`). Without the status filter the current
  version can fall outside the default 20-item page (row 1), so a watcher that
  reads the unfiltered list misses it.
- **What the watch can know cheaply:** the document's identity and
  publication date. **Not the zone's `datvalid`**: that lives on `zone-urba`
  features, which need a geometry (row 9). Gordes shows they differ (proposal
  §4.3).
- **The partition comes free:** API Carto's `document` and `zone-urba` both
  carry `partition` and `gpu_doc_id` (rows 8–9), so the extension can hand
  the service the partition with no extra lookup.
- **Case:** `zone-urba.idurba` is upper-cased; the document API's
  `originalName` is not. Comparisons are case-insensitive.
- **Lyon changes often:** 25 versions in under four years.
- **Géorisques v2 is gated by a free registration token** sent in
  `Authorization` (row 11), and v2 answers a browser (CORS `*`): technically
  easy to call from the extension, which is exactly what DEC-5 forbids.

---

# Current state

- 002.5a's service fetches the règlement only from `geoportail-urbanisme.gouv.fr`
  and `data.geopf.fr`, caches the PDF, outline and extraction **by document**,
  with size and rate limits; nothing invalidates an entry but its size cap.
- The extension reads the GPU and Géorisques **v1** from the browser (002.0),
  so a new version is already seen at the **next read**: the confirmations'
  stored `idurba` / `datvalid` no longer match and the rules reopen (proposal
  §8, 002.0–002.2). What nothing does is (a) tell a user with the project open
  that the GPU has moved, (b) keep the service's extraction cache from serving
  an old version's rules, (c) say what changed.
- The extension keeps the last good read for the session only (002.0 DEC-9).
- Nothing measures coverage: five plots are known.

---

# Goal

1. The service knows, within a day, when a document it has cached is
   superseded on the GPU, evicts or re-keys what it cached, and answers the
   extension's "is this still current?" in one cheap call.
2. The extension tells the user sooner when the plot's document changed —
   within the session, through `RegulationSource.onDidChange` — and shows
   what changed for the confirmed rules. Confirmations still reopen at read
   time by the rule §8 sets (DEC-4); the watch itself reopens nothing.
3. Géorisques is read through v2 with the deployment's token, held by the
   service; v1 remains the fallback while it answers.
4. National coverage is measured once, with a method that can be re-run:
   latency per endpoint, the regime mix, the "not on the GPU" rate.

# Out of scope

- An offline national batch of extractions (proposal option D). The watch
  re-extracts nothing unasked (DEC-2).
- Push to the browser (WebSocket, SSE). DEC-3.
- Any platform change: no SDK, contract, file or ai-service contract version.
- Watching SUP documents (easements) for change. Recorded as a follow-up.

---

# Decisions

## DEC-1 — What is watched, and how

- **Unit:** a GPU **partition** (`DU_<insee or siren>`) the service has cached
  a document for. Never a parcel.
- **Call:** `GET /api/document?partition=<p>&status=document.production`.
  Exactly one item expected; zero means withdrawn (a commune falling back to
  RNU or "not on the GPU"); more than one is logged as an anomaly and treated
  as changed.
- **Change:** the item's `id` differs from the cached `gpu_doc_id`, or
  `originalName` differs case-insensitively.
- **Store:** per partition `{gpuDocId, originalName, publicationDate,
  checkedAt, previous: [{gpuDocId, originalName, supersededAt}]}` in the
  service's volume (a JSON file per partition or SQLite, as 002.5a chose for
  its cache).
- **Schedule:** daily, jittered over the day; at most 1 request/s to the GPU;
  exponential back-off on 5xx; a partition that fails three days running is
  reported, not dropped.
- **Seeding:** a partition enters the watch the first time the extension
  asks the service about it (DEC-3) or an extraction is cached for it.

## DEC-2 — Cache eviction

| Entry | Key | Evicted when |
| --- | --- | --- |
| PDF bytes | `gpuDocId` + `nomfic` | superseded, at once; or size cap (LRU) |
| Outline and chapter text | `gpuDocId` + zone | superseded + 90 days |
| Extraction answers | `gpuDocId` + zone + schema version | superseded + 90 days (a project confirmed on the old version can still show what it confirmed); or schema version change |
| Watch record | partition | not read by any client for 180 days |
| Géorisques answers | endpoint + `code_insee` (or point) | 24 h TTL |

- **Re-extraction is on demand.** A superseded version is not re-extracted
  automatically: it costs model calls, and most cached partitions belong to
  projects nobody has open. Owner question 2.
- Size caps are 002.5a's; this sprint adds the superseded rule and the TTLs.

## DEC-3 — How the extension learns: from the service, then `onDidChange`

- On **Read** and on **project open** (the moments 002.0 already reads), the
  extension asks the service
  `GET /plugins-api/com.archisimple.fr-urban-rules/v1/documents/<partition>`
  (002.5a DEC-3's `v1` prefix) → `{current: {gpuDocId, originalName,
  publicationDate}, checkedAt, previous[]}`, in addition to its own GPU
  reads. The call is **not awaited by the read** (096.2's 30 s read budget
  stays the GPU's): the read answers from what the extension holds.
- **While the row is wanted**, the extension asks the same route again once
  an hour (a cheap call answered from the service's store), and on the
  answer of the un-awaited call above.
- **When an answer names a newer `originalName`** than the report the host
  holds, the source fires **`RegulationSource.onDidChange`** (096.8b,
  ADR-0111 Rule 15): the host reads again (`reason: 'source'`, coalesced,
  only while wanted) and the new read compares the stored confirmations with
  the new version as §8 says. This is how the user hears of a new version
  within the session rather than at the next open.
- If the stored confirmations name an earlier `originalName`, the overview
  shows "**New document version** published on <date>; n confirmations to
  review", in Properties and as the row's badge (the existing to-confirm
  badge, 096.3a).
- **No push from the server.** The service does not reach a running editor:
  ADR-0114 (096.8a) defines request/response routes, and a once-a-day signal
  does not justify a channel. The extension polls cheaply and uses the SDK's
  one way to ask the host for a re-read.
- Every timer is in `context.subscriptions`, as 002.6b's polling is.
- **Without the service** (a deployment that does not run it, or the
  Development Repository with no service), the extension falls back to its
  own GPU read (row 4 of the probe, which answers a browser) and loses
  `checkedAt`, `previous` and the in-session signal.

## DEC-4 — What reopens

Proposal §8: "A confirmation whose `idurba` / `datvalid` no longer matches
reopens its rule." The probe shows Lyon's zone `datvalid` equals its
document date, so **every** Lyon modification would reopen **every**
confirmation, about every two months.

Kept as the default, because it is the safe reading of §8. With one
refinement offered to the owner (question 1): for a `written` rule whose
**passage text** (normalised) and extracted limit are unchanged in the new
version's extraction, the rule shows "**Unchanged in the new version** —
confirm again" with a one-click confirm, rather than a cold review. It stays
`to_confirm` until the user acts: nothing is carried over silently.

Comparison of `idurba` is **case-insensitive** (probe rows 8–9).

## DEC-5 — Géorisques v2 and its token

- **Where the token lives:** the deployment's `.env` →
  `FR_URBAN_RULES_GEORISQUES_TOKEN` → the companion service's environment only
  (the compose service 096.8a defines). Not in `web`, not in `plugins`, not in
  the `.aspkg`, not in preferences.
- **How the extension reaches v2:** through the service,
  `GET /plugins-api/com.archisimple.fr-urban-rules/v1/georisques/<allow-listed path>?<allow-listed params>`.
  The service adds `Authorization`, forwards to `www.georisques.gouv.fr/api/v2/…`,
  caches 24 h, and strips any header from the answer but content type.
- **Allow-list:** the v2 equivalents of what 002.0 reads in v1 (`gaspar/risques`,
  `rga`, `zonage_sismique`, `radon`, `gaspar/pprn`), each with its parameters
  checked against proposal §4.3's pitfalls (`code_insee` is the commune, not
  the arrondissement; `pprn` takes `longitude`/`latitude`; a radius for
  `zonage_sismique`). The v2 paths are confirmed against Géorisques' v2
  documentation in step 1 — **the probe confirmed only that v2 exists and
  wants a token**.
- **Fallback:** no token configured, or the service absent → the extension
  keeps v1 from the browser while v1 answers (probe row 12), and the sources
  list says "Géorisques v1". v1 failing and no token → "Géorisques: not
  available", named, never "no risk".
- **A token never sent from the browser** — even though v2's CORS would allow
  it (probe row 11). The provider test greps for it (Contract).

## DEC-6 — National coverage: the method

`tools/measure-coverage.mjs` (by hand, never a test):

1. **Population:** `geo.api.gouv.fr/communes` (probe row 13), excluding
   overseas collectivities (`98x`) and keeping the date of the list.
2. **Sample:** stratified by département and population band (< 500, 500–2
   000, 2 000–10 000, > 10 000), **1 000 communes**, seeded (seed recorded),
   plus the five reference communes. A full pass is owner question 3.
3. **Per commune**, at ≤ 2 requests/s overall:
   - `apicarto …/gpu/municipality?insee=` → `is_rnu`;
   - `apicarto …/gpu/document?geom=<commune centre>` → document present, type
     (PLU, PLUi, CC, PSMV), `partition`;
   - if a partition: GPU `document?partition=&status=document.production`
     → current id, `publicationDate`;
   - Géorisques v1 `gaspar/risques?code_insee=`, and v2 if a token is set;
   - each with status and latency.
4. **Classified** into proposal §4.4's five states: PLU/PLUi, CC, RNU, **not
   on the GPU** (`is_rnu` false, no document), **unknown** (a call failed).
   A commune centre can fall outside a PLUi's coverage only in edge cases;
   those are listed, not hidden.
5. **Report:** `docs/measurements/coverage-<date>.md` and the raw CSV: counts
   and rates per state with a 95 % interval, weighted back to the national
   population of communes; p50/p95/max latency per endpoint; error rates;
   the age of current documents (from `publicationDate`); and the rate of
   documents published in the last 90 days (what the watch's load will be).
6. **Re-runnable:** same seed and list date → same sample.

The "not on the GPU" rate is the figure the owner asked for; it decides how
often a user meets Rochefort's state. No prior value is assumed here.

---

# Steps

1. **Probe again**, read-only: Géorisques v2's documentation and paths
   (DEC-5); the GPU document API's paging (`limit` cap, whether any `offset`
   or date filter exists). Record as above.
2. **Watcher** in the service (DEC-1), its store and schedule; tests on
   recorded document listings, including the 20-item trap and a `document.lost`
   item.
3. **Eviction** (DEC-2).
4. **`documents/<partition>` route** (DEC-3) and the extension's overview line
   and badge; the fallback to its own GPU read.
5. **Reopen rule** (DEC-4) per the owner's answer to question 1;
   case-insensitive comparison.
6. **Géorisques v2 proxy** (DEC-5); compose `.env` documented by 096.8a's
   pattern; the token grep test.
7. **Coverage** (DEC-6): run, commit the report.
8. **Walk** on the owner's deployment: Lyon's partition seeded; its record's
   `gpuDocId` edited to an older id in the service volume to simulate a new
   version; open the project → the line, the badge, the reopened rules.

# Acceptance criteria

1. On a recorded listing where the current version is item 25, the watcher
   finds it (it uses `status=document.production`) (test).
2. A changed `id` marks the partition superseded, records `previous`, evicts
   the PDF at once and keeps the extraction 90 days (test with a fake clock).
3. Zero items marks the document withdrawn; the extension then shows the
   state its own read gives (RNU or "not on the GPU"), never "no rules"
   (test).
4. The watcher never sends more than 1 request/s to the GPU, and backs off on
   5xx (test with a fake clock).
5. The service stores no parcel id, address or geometry: a test writes the
   volume after a full read of P1–P5 and greps it for the five `idu`.
6. `documents/<partition>` answers from the store; the extension shows "New
   document version published on <date>; n confirmations to review" when the
   stored confirmations name an older `originalName` (test, P1 fixtures).
6a. With the row wanted, an hourly answer naming a newer `originalName`
   fires `onDidChange` once and the host's re-read (`reason: 'source'`)
   shows the line; an unchanged answer fires nothing; the read never waits
   on the call (test with a fake clock and a stub host).
7. Reopening follows DEC-4 as the owner answers it; `PLUi`/`PLUI` casing alone
   reopens nothing (test).
8. Géorisques v2 is called only by the service, with the token from its
   environment; the built `.aspkg`, `index.json`, the service's responses and
   logs contain no token (test greps a known fake token).
9. No token, or no service → v1 from the browser, labelled; v1 failing →
   "Géorisques: not available" (test).
10. The coverage report exists with its seed, list date, sample size, the
    five-state rates with intervals, latencies and error rates; re-running
    with the seed reproduces the sample.
11. `node --test` for both folders passes with the throwing `fetch`.
12. The walk (step 8) recorded.

# Testing strategy

- Recorded GPU listings (rows 1, 2, 4, 6 of the probe kept as fixtures, with
  their dates), recorded v1 and v2 Géorisques answers (v2 with a fake token).
- Fake clock for schedule, back-off and eviction.
- The coverage script tested on a 10-commune recorded sample for its
  classification and arithmetic; the real run is by hand.

# Risks

- **The GPU API is undocumented as a contract.** Its paging and filters were
  found by probing (`offset` ignored; default 20 items, oldest first). A change
  there breaks the watch silently; the watcher logs when the filtered call
  returns other than one item, and the coverage report rechecks paging.
- **Géorisques v1 retirement.** If v1 stops before a deployment sets a token,
  risks disappear for that deployment. The overview names the source as not
  available, never as "no risk".
- **Token handling.** A token in `.env` is as safe as the NAS. It is free and
  revocable; the deployment guide says how to rotate it.
- **Noise.** Lyon's cadence means reopened confirmations every two months
  under the default reading of §8; question 1 exists for that.
- **Load on public services.** 1 000 communes × ~4 calls once; the daily watch
  is one call per cached partition. Both are well under the published
  geocoding limit (50 req/s per IP, proposal §4.2); the GPU publishes none,
  so this sprint stays at 1 req/s.

# Questions for the owner

1. **Reopening.** Keep §8 as written (any new `idurba` reopens every
   confirmation), or offer "unchanged in the new version — confirm again" for
   written rules whose passage and limit did not change (DEC-4)?
   Recommended: the latter, still requiring a click.
2. **Re-extraction.** On a new version, extract automatically for partitions
   a project read in the last 30 days, or only when a user asks?
   Recommended: only when asked (model cost).
3. **Coverage depth.** A 1 000-commune stratified sample, or the full list
   (~35 000 communes, about a day at 2 req/s)? Recommended: the sample now,
   the full pass once before any public claim.
4. **Contact in `User-Agent`.** May the service identify itself with an
   address of yours to the GPU and Géorisques?

# Definition of Done

The watch runs daily in the owner's deployment; eviction and the extension's
"new version" line are tested; the token lives in the service only and the
grep proves it; the coverage report is committed with its method; the walk
recorded.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| 002.5a–b | The service, its caches keyed by document (002.5a) and by document and chapter (002.5b), its fetch allow-list and volume |
| 002.6b | Written rules and their stored citations (for DEC-2 and DEC-4's passage comparison); extractions are keyed by document and chapter, not zone (002.5b DEC-3, Phase 2 review) |
| 002.9 | Closed; the P1–P5 fixtures reused |
| 096.8a | ADR-0114: the service's environment from `.env` under the `plugin-services` compose profile, the `/plugins-api/com.archisimple.fr-urban-rules/` route behind the deployment's auth |
| 096.8b | `RegulationSource.onDidChange`; `source` reads keeping `previous`, coalesced to ≤ 1 per 2 s (SDK 1.28) |
| 096.14 | The deployment walked; the guide naming where the token lives |

**Version needs:**

- **Package `fr-urban-rules`:** **0.10.0** (renumbered 2026-10-21 from 0.9.0: 002.11 Planning Snapshot lands first and takes 0.9.0; earlier restated 2026-10-20 from 1.4.0 / 1.3.0): the
  overview line, the in-session signal, the reopen refinement, Géorisques
  through the service. `sdkVersion` **"1.33"**, inherited from 002.11 (which needs
  096.17's cache); this sprint needs nothing newer — `onDidChange` is 1.28's.
  The in-session line reuses 002.11's « what changed » wording (DEC-6 there).
- **`fr-urban-rules-service`:** a minor: the watcher, `documents/<partition>`,
  the Géorisques proxy, the eviction rules. Its environment gains
  `FR_URBAN_RULES_GEORISQUES_TOKEN` (optional).
- **Platform:** none: no SDK, contract, file or ai-service contract version.
  The compose file gains one optional variable under the service 096.8a
  defines; that is a deployment edit in archisimple, made by this sprint's
  step 6 or by the owner, and recorded.

---

# Corrections to the README / proposal

1. **Proposal §4.2's GPU API row** names `document?partition=` as giving the
   "legal status". It also needs `status=document.production`: without it,
   the default page is 20 items oldest first and Lyon's current version is
   not on it (probe rows 1–4). 002.0's reader should be checked for the same
   trap.
2. **Proposal §4.3 "Store `idurba` and `datvalid`"** should add: compare
   `idurba` case-insensitively (`PLUi` in the document API and API Carto's
   `document`, `PLUI` in `zone-urba`).
3. **Proposal §8's reopen rule** is noisy on documents modified often (Lyon:
   25 versions since 2022; zone `datvalid` equal to the document date). See
   DEC-4 and question 1.
4. **Proposal §4.2 "None needs a key"** stays true for Phase 1 (v1), but
   Géorisques v2 needs a free registration token (probe row 11), and its CORS
   would let a browser send it. §11.2 should add: the token is the service's.
5. **Proposal §12 Phase 4 "National cache"** is not built here: the cache is
   on demand per deployment, with eviction; a national batch (option D) stays
   a later decision.
6. **Platform README §3 row 002.10, "reopens confirmations".** The watch does
   not reopen them; reopening is derived at read time (proposal §8, already
   so since 002.0). The watch tells the user sooner and keeps the service's
   cache current. Applied to the README at the reconciliation.

# Reconciliation (2026-10-19, phases 2–4)

- Prerequisites, DEC-3, Goal 2, criterion 6a, Dependencies: the extension
  uses 096.8b's `RegulationSource.onDidChange` — an un-awaited and an hourly
  `documents/<partition>` call while the row is wanted; a newer
  `originalName` fires it and the host re-reads (`reason: 'source'`). "No
  push" now means no server-to-browser channel, not "seen only at the next
  open".
- Goal 2 and correction 6: the watch tells the user sooner and keeps the
  cache current; confirmations stay derived at read time.
- DEC-3, DEC-5, Dependencies: routes name the package id and 002.5a's `v1`
  prefix (`/plugins-api/com.archisimple.fr-urban-rules/v1/…`).
- Version needs: package **0.9.0**, `sdkVersion` **"1.32"** unchanged.
  _(Renumbered 2026-10-21: **0.10.0** and **"1.33"**, after 002.11 Planning Snapshot.)_

# Review (2026-10-19)

- References only: Sprint 096.3 was split into 096.3a (Regulations Tree and
  Panel: the row, badges, views, blocks and `phraseText` / `limitText`) and
  096.3b (Regulation Actions: `runAction`, fields, the FR requests), which
  share SDK 1.26. Mentions now name the half they mean, or 096.3a–b. Old
  DEC numbers are mapped: 1–7 stay as 096.3a DEC-1–7; 8 is 096.3b DEC-1;
  9–12 are 096.3a DEC-8–11; 13 is 096.3b DEC-3.
