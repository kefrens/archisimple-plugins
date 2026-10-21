# Sprint 002.11 — Planning Snapshot

> **Status:** **Implemented and reviewed (2026-10-21, uncommitted).** Walked
> in the editor the same day (§ Outcome), independently reviewed and walked
> again after the review's fixes (§ Outcome, "Review (2026-10-21)"). Drafted
> and reviewed against the code 2026-10-21.
>
> - **Source.** Reviewed at `5808887`, with platform `6bdf3586`.
> - **Owner.** The owner approved the feature (conversation of 2026-10-21)
>   and answered its questions "as recommended" (§ "Owner's answers").
> - **Other choices** are **taken on the owner's behalf (2026-10-21),
>   reversible**, and marked where they are made.
>
> **Repository:** `archisimple-plugins`, the `fr-urban-rules` extension only.
> The companion service is unchanged.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> §12, a row after Phase 3. Platform README §3, row 096.17 / 002.11.
>
> **Prerequisites:**
>
> - **Platform:** Sprint 096.17 Site Package Cache (ADR-0115, contract 3.21.0,
>   SDK 1.33). The package declares `sdkVersion` **"1.33"**, and a web image
>   without 096.17 refuses it. This is a lockstep release.
> - **Plugins:** 002.9 closed, so the five reference fixtures are reused.
>
> **Version:** `fr-urban-rules` **0.8.1 → 0.9.0**.
>
> - 002.10 (Regulation Watch, drafted as 0.9.0, not started) is renumbered
>   **0.10.0**, and its `sdkVersion` becomes "1.33", inherited from here. Its
>   "Version needs" and the milestone ledger already say so (checked
>   2026-10-21).
> - This sprint lands first: it is approved now, and 002.10 is Phase 4.
>
> **Sizes:**
>
> - the snapshot writer, with its degradation;
> - the restore at open;
> - the diff and its wording (en and fr);
> - written rules restored, and the newer-reading offer;
> - tests and fixtures.
>
> Medium.

---

# Owner's answers (2026-10-21, "as recommended")

1. **Surroundings: 100 m.** The snapshot keeps the plot's box grown by 100 m,
   not the plan's furthest zoom-out (DEC-2).
2. **Licence check.** Ship 0.9.0 with the attributions as drafted. The
   Licence Ouverte check (proposal §4.3, platform README Q50) proceeds in
   parallel and stays on the owner's list.
3. **A newer extraction on the companion for the same document version is
   offered.** It is an action the user accepts. It never silently replaces
   the project's (DEC-7).

Platform-side answers that bind this sprint (096.17):

- file version 25;
- "unsaved" once after the first storage;
- `ATTRIBUTIONS.md` lists the cache's attributions;
- SDK 1.33.

---

# Sprint Design Contract

_Verified against the source 2026-10-21 (§ Outcome)._

- [x] **A reading is never a decision.**
  - Snapshots go to `writeCache` (ADR-0115), never to `write`.
  - Decisions stay in the section, one Request each, as since 002.1a.
  - No confirmation, edge role or entered value is written from a read, and
    none is changed by restoring a snapshot or taking a newer reading.
  - _Held._ `snapshotStep` is the only caller of `writeCache`; no new `write`
    call. Every `snapshot.test.mjs` store throws and counts on `write` (0
    each); `written.test.mjs` "002.11 criterion 8" asserts « Use it » writes
    the cache once and the section never. Walked: ManualChemin saved offline,
    its section equal to the original's.
- [x] **A snapshot is never presented as current.**
  - Every view drawn from it says "read on <date>" until a fresh read
    confirms it, or offline says why.
  - The sheet (002.7) prints the date read, as it does today.
  - _Held._ « Read on {date} — checking for changes… » while a restored
    source waits; « Offline — shown as read on {date} » and each source
    `status.shownAsReadOn` with its date; restored written rules « as read on
    {date} ({model}) ». The sheet: a restored source carries its snapshot
    `retrievedAt`, and an unavailable one keeps the sheet's
    `sheet.notice.sourceFailed`; **the print itself was not walked**.
- [x] **No verdict is stored.** Checks, counts, the envelope and capacity are
      recomputed from the restored readings, the section and fresh measures
      (ADR-0111 Rule 4 as revised). _Held: "criterion 4: fits the budget…"
      asserts no `features`, `checks`, `envelope`, `capacity` in the
      snapshot; the walk shows ManualChemin's « 2 potential issues » computed
      offline._
- [x] **A confirmation means the same thing after a restore.** A rule rebuilt
      from a snapshot has the key a fresh read would give it (DEC-5). _Held:
      "criterion 3" on six plots, with and without steps 2–5; statuses equal
      without them. Walked: « 5 Confirmed » on ManualChemin offline._
- [x] **The snapshot carries its attributions** in the cache envelope
      (`writeCache`'s second argument), and they are shown wherever it is
      shown (ADR-0115 Rules 2, 3 and 14). _Held: "criterion 10"; the walk's
      `lyon-ATTRIBUTIONS.md` lists them under Site data._
- [x] **Written only when the reading changed.** Opening an unchanged project
      leaves it clean (ADR-0115 Rule 5). _Held: "criterion 5"; walked —
      `lyon-3-online-unchanged.png` shows no « Unsaved changes », and
      `lyon-4-what-changed.png` (a changed reading) does._
- [x] **No new host is contacted, and nothing new is sent.** The manifest's
      `network.hosts` is unchanged. _Held: the existing `package.test.mjs`
      host tests pass unchanged._

---

# Current state (read 2026-10-21, `fr-urban-rules` 0.8.1, `sdkVersion` 1.32)

All line numbers are in `fr-urban-rules/src/index.js`.

- **Memory cache (DEC-9).** `createReader` (`:1524`) keeps
  `cache: Map(plotKey → { report, good, expiresAt })` (`:1550`), holding at
  most `CACHE_PLOTS` (20, `:86`) plots.
  - The key is `plotKey(site)` (`:1279`): the CRS, the sorted parcel ids, and
    a digest of their rings at 0.01 m.
  - `readPlot` (`:1687`) answers from memory while `entry.report` is set and
    unexpired (`:1698–1706`).
  - `good[sourceId]` is `{ features, parsed, retrievedAt }`. `parsed` is
    already in the Site's CRS, through `parseLayer` and `convertGeometry`.
    A surface or line geometry is `{ kind, rings | lines, centroid }`, with
    the centroid computed on the **unsimplified** geometry (`:1156`, `:1169`).
  - A source that fails is shown from its last good answer: `usable`
    (`:2726`), `resolveRegime`, `sourceStatuses` with
    `fr-urban-rules.status.shownAsRead` (`:3048`).
  - **Not every fact is read through `parsed`.** `assemble` also reads raw
    `answer.features`:
    - the municipality: `parseMunicipality(municipality.features, …)`,
      `:2518`;
    - the documents: `parseDocuments(answer.features)`, `:2549–2562`;
    - an emptiness test, `:3058`.
  - **Nothing outlives the session.**
- **The read already reports progress.** `read` (`:1610`) passes partial
  reports to `context.progress` (SDK `RegulationReadContext.progress`,
  ADR-0111 Rule 3). That is the channel a snapshot-first answer uses (DEC-4).
- **Written rules.**
  - `extractions: Map(id → record)` (`:1567`) holds records created by
    `extractionFor(location, …)` (`:2148`), so a record exists only when the
    companion was located. A record holds
    `{ id, key, query, zone, state, waiters, asked, revision, result? }`.
  - The companion is asked with `cachedOnly` on read (`askCached`), and asked
    to extract only on the user's Extract.
  - A confirmed written rule with no current extraction "stands on the section
    alone" (002.6b DEC-6). `confirmations[].citation` holds page, article and
    passage.
  - Without the companion, `fr-urban-rules.notice.writtenRulesUnavailable`
    says that reading is unavailable **and** that the regulation opens at its
    first page.
- **The section** (`schema: 1`): `confirmations` (each with `ruleKey`, `plot`,
  `idurba`, `datvalid`, `decision`, …), `edgeRoles`, `entered` and the
  Surfaces answers.
  - Reopening on a new document version is derived at read time from the
    stored `idurba` / `datvalid` (proposal §8).
  - **Since 096.4's post-acceptance fix, a project holding a section is read
    at open.** From 096.17, a project holding a cache entry is too.
- **Rule keys.**
  - **Drawn:** `drawnKey` (`:4198`) is
    `psc:<type>:<subtype>:cyrb53(libelle|txt|roundedCentroid(geometry))`.
    `roundedCentroid` (`:4185`) prefers `geometry.centroid`, then the box
    centre of the rings and lines. A point or an unconverted geometry gives
    `-`, and a suffix in `plannedRules` then tells such keys apart in order.
    **Recomputing a clipped geometry's centroid would move it and orphan its
    confirmation** (DEC-5).
  - **Written:** `writtenRulesOf` (`:7405`) builds
    `written:${sector ?? '*'}:${cyrb53(normalisedPassage(passage))}`, with
    `~2`, `~3` … for a duplicate in the result's order (`:7434`). Truncating
    a passage would change the key.
- **Attribution.** `SOURCES[id].attribution` is `apicarto`, `gpu` or
  `georisques`. The report carries the credit line (096.5).
- **Fixtures.**
  - `test-fixtures/fr-urban-rules/acceptance/{brouennes,gordes,lyon,mouzay,rochefort}/`
    hold `answers.json`, `site.json`, `section.json`, and so on;
  - the Lyon extraction is in `test-fixtures/fr-urban-rules/lyon/extraction/result.json`;
  - there is no ManualChemin fixture;
  - the developer command `fr-urban-rules.dev.captureFixtures` records one.

## Measured sizes

Method: Platform Sprint 096.17 § "Measured". The inputs are the five
`acceptance/*/answers.json`, a live read for ManualChemin on 2026-10-21, and
the Lyon extraction fixture. Sizes are in characters, serialized.

| Plot         | Raw answers | Facts only | ≤ 30 m geometry | ≤ 100 m geometry | Unclipped compact | Section today |
| ------------ | ----------: | ---------: | --------------: | ---------------: | ----------------: | ------------: |
| Brouennes    |       6 361 |      1 465 |           1 465 |            1 465 |             1 465 |           238 |
| Gordes       |     317 394 |      3 765 |           5 099 |            6 893 |           276 016 |           661 |
| Lyon         |     876 820 |     12 933 |          21 420 |           36 807 |           661 878 |         1 075 |
| Mouzay       |     586 528 |      2 748 |           3 461 |            7 762 |           508 380 |             5 |
| Rochefort    |      24 788 |      1 612 |           1 704 |            3 935 |            19 092 |           318 |
| ManualChemin |   1 833 532 |      3 795 |           5 911 |           10 856 |         1 659 473 |         5 801 |

- **Written rules:** Lyon UCe1 holds 32 rules in 16 268 characters with
  passages, about 0.5 KB per rule.
- **Worst reference case:** Lyon at 100 m plus two zones' rules, about
  **69 KB**. A typical project needs **2–40 KB**.
- **Unclipped, three plots exceed one cache entry's 262 144-character limit.**
  The cause is commune-wide polygons: Mouzay's `assiette-sup-s` (550 KB) and
  ManualChemin's `info-surf` (1.69 MB).

---

# Goal

A project opened on another laptop, another deployment, or offline, shows
its planning rules at once:

- marked "read on <date>";
- re-read in the background when the network allows;
- saying what changed.

Its written rules come back without the companion service and without
another Extract.

# Out of scope

- The service-side watch (002.10). This sprint checks at each open. 002.10
  tells the user sooner during a session and reuses this sprint's diff and
  wording.
- Storing check results, counts or the envelope (Contract).
- Several plots per project. One snapshot is kept, for the plot on view.
- A "forget the saved reading" action inside the package. ADR-0115 Rule 9
  leaves it to the package. It is the milestone's backlog, not this sprint.

---

# Decisions

## DEC-1 — What goes in (schema 1)

`writeCache(data, attributions)`. `data` is the snapshot below. The
attributions are the envelope's lines, outside `data`, so the host can list
them in `ATTRIBUTIONS.md` (ADR-0115 Rules 2 and 14).

```jsonc
{
  "schema": 1,
  "plotKey": "…",               // plotKey(request.site): CRS, parcel ids, ring digest
  "crs": "EPSG:2154",
  "readAt": "2026-10-21T…Z",    // when this content was first read
  "regime": { "code": "plui" },
  "municipality": { "insee": "…", "name": "…" },   // parsed, no geometry
  "document": { "idurba": "…", "datvalid": "…", "partition": "DU_…", "gpuDocId": "…",
                "type": "PLUi", "legalStatus": "APPROVED", "publicationDate": "…",
                "reglement": { "name": "…_reglement_….pdf", "title": "…" } },
  "sources": {                  // per source id of SOURCES
    "zone-urba": { "retrievedAt": "…", "parsed": [ /* pick*() + clipped geometry, centroid kept */ ] },
    "georisques-risques": { "retrievedAt": "…", "risks": [ … ] },
    "…": "…"
  },
  "written": [                  // one per extraction record shown
    { "key": "…", "query": { … }, "zone": "UCe1b",
      "document": { "idurba": "…", "gpuDocId": "…", "nomfic": "…", "sha256": "…" },
      "chapter": { "pages": [121, 144], "title": "Zone UCe1" },
      "rules": [ /* ruleKey, kind, sector, statement, limit, page, article, passage, conditions, exceptions, confidence */ ],
      "provider": "lm-studio", "model": "qwen/qwen3-vl-8b",
      "schemaVersion": 1, "promptVersion": 1, "extractedAt": "…" }
  ],
  "simplified": [ ]             // DEC-2's steps taken, if any
}
// attributions (envelope): [ "© IGN — Géoportail de l'Urbanisme (API Carto), Licence Ouverte 2.0",
//                            "Géorisques (BRGM / MTE), Licence Ouverte 2.0" ]
```

- **Kept:**
  - the facts the report is assembled from, in `parse*`'s shape;
  - the municipality and the document **parsed**, because `assemble` reads
    their raw answers today (DEC-4);
  - the règlement entry of the GPU file list only;
  - each written rule's computed `ruleKey` (DEC-5).
- **Dropped:**
  - raw API answers;
  - the municipality's geometry;
  - the files other than the règlement;
  - `gid` and `gpu_timestamp`;
  - the extraction's chunks, `dropped` list and replay notes.
- **Never stored:** checks, counts, the envelope, capacity, questions,
  variation figures.
- **Failed sources.** A source that failed in the latest read keeps its
  previous snapshot entry, with its own `retrievedAt`.
- **Attributions.** They are the `SOURCES[].attribution` texts of the
  sources present, at most 16 lines. The owner chose to ship them as drafted,
  with the Licence Ouverte check in parallel (answer 2).

## DEC-2 — The budget and the degradation

**Target:** 200 000 characters for `data` plus the attributions. That is under
ADR-0115's 262 144 per entry, leaving room for the next schema. Steps, in
order, until the snapshot fits:

1. **Clip geometry to the plot's box grown by 100 m** (owner answer 1).
   - Lambert coordinates are rounded to 0.01 m.
   - **A feature is never dropped by clipping.** One wholly outside the box
     keeps its facts and its `centroid`, with no rings.
   - This step is always done and is not reported: nothing the package
     computes looks further.
2. **Clip to 30 m.** The road margin, `ROAD_MARGIN`, is 30 m (`:3561`).
3. **Simplify** each ring and line (Douglas–Peucker, 0.5 m), never the
   plot's own edges.
4. **Drop geometry** of `information`, then `easement`, then `prescription`.
   Facts and `centroid` are kept, so keys hold (DEC-5). The plan then draws
   no outline for them.
5. **Drop written rules' passages beyond 500 characters,** keeping page,
   article and the stored `ruleKey`. The confirmed rules keep their full
   passage in the section anyway.

**Saying what was dropped.**

- Steps 2–5 are each recorded in `simplified`, and the overview says
  « Simplifié pour tenir dans le fichier du projet » /
  « Simplified to fit the project file », with what was dropped.
- A snapshot that does not fit after step 5 is not written.
- A write the host refuses is treated the same way: for example, the 1 MB
  total across packages, which another package may have filled.
- In both cases the refusal is logged and shown
  (« Non enregistré dans le projet : trop volumineux » /
  « Not saved in the project: too large »), and the previous snapshot stays.

**Measured:** no reference plot needs more than step 1, since the largest is
about 69 KB.

## DEC-3 — When it is written

A snapshot is written only when its content differs from the stored one. The
comparison is a key-order-free equality, made with `readAt` and every
`retrievedAt` left out, on `data` and the attributions. The cases:

- **A read completes for the plot on view** with at least one source ready.
- **An extraction result is taken.** That means one of:
  - a completed Extract;
  - a `cachedOnly` answer for a zone the snapshot lacks;
  - the user's acceptance of a newer reading (DEC-7).
- **The plot changes.** The new plot's snapshot replaces the old one at its
  first completed read. Until then the stored one is ignored, because its
  `plotKey` does not match.

`readAt` is set when the content changes. An unchanged re-read writes
nothing, and the session shows « vérifié aujourd'hui » / « checked today ».
Never written:

- on a timer;
- on a `design` read (nothing new is fetched);
- from a read that was aborted.

## DEC-4 — At open: snapshot first, then the online read, in one read

The host reads at open, because the project holds a section or a cache entry
(096.17 DEC-7). When `readPlot` finds no memory entry for the plot, it calls
`readCache()`. **If the snapshot's `plotKey` matches** (`schema` 1, well
formed):

- **Restore the state.** `state.answers[id]` and `entry.good[id]` are seeded
  from `sources`, marked `restored: true`, with no `features`. The
  municipality and document readers (`:2518`, `:2549–2562`) and the emptiness
  test (`:3058`) read the restored parsed form when `features` is absent, so
  `assemble` builds the report it always builds. _(The draft said the seeding
  alone sufficed. It does not: these three read raw features.)_
- **Show it at once.** The restored report goes to `context.progress` at
  once. Its sources are listed `loading`, with `retrievedAt` set to the
  snapshot's. The overview's first line reads
  « Lu le {date} — vérification en cours… » /
  « Read on {date} — checking for changes… ».
- **Never answer from memory.** The seeded memory entry carries **no
  `report`**, so `readPlot` (`:1698`) does not return it without fetching.

The online read then continues **in the same read**, as today. When it
completes, the package:

- compares facts (DEC-6);
- writes the cache if anything changed (DEC-3);
- **answers** the fresh report. It carries the « what changed » block, or
  « Inchangé depuis le {date} » / « Unchanged since {date} ».

No `onDidChange` is needed for this path, because the answer is the fresh
report. _(The draft fired `onDidChange` here, which would have cost a second
read.)_ `onDidChange` fires only when `onDidChangeCache` reports an entry
arriving while no read is in flight, as on a load in a session where the
source was already registered.

**Offline**, every source fails:

- the answer stays the snapshot's, with sources `unavailable` and
  `status.shownAsRead` (the existing key, with a date rather than a time
  when the day differs);
- the overview says
  « Hors ligne — affiché tel que lu le {date} » /
  « Offline — shown as read on {date} ».

**Partly failed:** each failed source shows its snapshot value as read then,
through `usable` and `good`, as the session cache already does.

## DEC-5 — Confirmations match: keys survive the snapshot

- **`psc:` keys.** `drawnKey` reads `roundedCentroid(geometry)`, which
  prefers `geometry.centroid`. `convertGeometry` already computes it on the
  unsimplified geometry. The snapshot **keeps that field as computed** and
  never recomputes it after clipping, simplifying or dropping (DEC-2 steps
  1–4). So a restored prescription has the key a fresh read gives.
- **Points and unconverted geometries** (`-` plus a suffix in order). They
  keep their key because the snapshot keeps every feature, in order (DEC-2
  step 1).
- **`written:` keys** are
  `written:${sector ?? '*'}:${cyrb53(normalisedPassage(passage))}` with an
  order suffix. The snapshot stores each rule's computed `ruleKey`, and
  `writtenRulesOf` takes a stored `ruleKey` when present instead of
  recomputing it. So step 5's truncation never moves a key. _(The draft said
  "digests of zone and passage", but the key uses the sector.)_
- **`rnu:` keys** depend on the regime and the zone, and survive unchanged.
- **`entered:` keys** live in the section.

A test compares every key of a fresh read with every key of a restored one,
on the six plots, with and without DEC-2's steps 2–5 forced.

## DEC-6 — What changed: compared facts and their wording

The comparison is made on facts, never on geometry, between the snapshot and
the fresh read. Only sources `ready` in both are compared.

| Fact                                                   | Line (en)                                                                                     | Ligne (fr)                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Document `idurba` (case-insensitive) or `datvalid`     | New version of the {type}: {old} → {new}, in force from {date}. {n} confirmations to review. | Nouvelle version du {type} : {old} → {new}, applicable depuis le {date}. {n} confirmations à revoir. |
| Regime                                                 | The plot is now under {regime} (was {old}).                                                   | La parcelle relève désormais de : {regime} (auparavant {old}).                                       |
| Zone set                                               | Zone changed: {old} → {new}.                                                                  | Zone modifiée : {old} → {new}.                                                                       |
| Prescription (type + subtype + label) added / removed  | New prescription: {label}. / Prescription no longer listed: {label}.                          | Nouvelle prescription : {label}. / Prescription qui n'apparaît plus : {label}.                       |
| Easement (`suptype` + name) added / removed            | New easement: {label}. / Easement no longer listed: {label}.                                  | Nouvelle servitude : {label}. / Servitude qui n'apparaît plus : {label}.                             |
| Risk (Géorisques) added / removed                      | New risk listed: {label}. / Risk no longer listed: {label}.                                   | Nouveau risque recensé : {label}. / Risque qui n'est plus recensé : {label}.                         |
| Nothing                                                | Unchanged since {date}.                                                                       | Inchangé depuis le {date}.                                                                           |

- **The heading** is « Ce qui a changé depuis le {date} » /
  « What changed since {date} ».
- **{n} is counted by the existing reopen rule.** It counts confirmations
  whose `idurba` / `datvalid` differ. It is never a new rule.
- **The lines are information.** They are not checks, and they reopen nothing
  by themselves.
- **How long the block shows.** It shows for the session. It is not stored,
  because the next snapshot is the new state.
- **Wording.** "No longer listed", not "removed": an API answer that omits a
  feature is not proof that it was revoked (proposal §10).

## DEC-7 — Written rules restored without the companion; a newer reading offered

**Restoring.** On a restored snapshot, each `written[]` entry seeds an
extraction record: `state: 'done'`, `result` from the entry, `restored: true`.

- The record is held in `extractions` under the same `id`
  (`cyrb53(key)`). It is consulted **whether or not** the companion was
  located: today's records exist only through `extractionFor(location, …)`.
- The rules list as `written`, with their passages and stored keys.
- The Rules view says
  « Règles écrites telles que lues le {date} ({model}) » /
  « Written rules as read on {date} ({model}) ».

**With the companion present**, `cachedOnly` is still asked:

- **Same document version** (same `idurba` and règlement `sha256`, or
  `nomfic` when no hash), same chapter:
  - the project's extraction stands, because the user confirmed against it;
  - if the companion holds a result whose content differs (other rules or
    passages, or a later `extractedAt` with a newer `promptVersion`), it is
    **offered** (owner answer 3), never applied silently.

  The offer is a notice with one action: « Une lecture plus récente des
  règles écrites existe (extraite le {date}) — Utiliser » / « A newer reading
  of the written rules exists (extracted on {date}) — Use it ». Accepting it:
  - replaces that entry of `written[]` and writes the cache (DEC-3), a read
    like Refresh (ADR-0115 Rule 3);
  - changes no confirmation;
  - leaves a confirmed rule whose key the newer reading lacks standing on the
    section alone (002.6b DEC-6), as today.

  _(The action's form, a regulation action as in SDK 1.26, was taken on the
  owner's behalf (2026-10-21), reversible.)_
- **Newer document version:** the companion's result, or « Extract », is
  offered as today. The « what changed » block already names the new version
  (DEC-6).

**Without the companion**, the restored rules stand.

- The « not available on this deployment » notice (002.6a) **stays**,
  because it also says the regulation opens at its first page. The restored
  line is added beside it. _(The draft replaced the notice, which would have
  lost the page fact.)_
- Extract again is disabled, with the notice's reason.

## DEC-8 — Schema version

- The snapshot's `schema` is 1, separate from the section's.
- A snapshot whose `schema` is higher than this package knows is ignored: it
  is not shown or rewritten until a read replaces it, and a log line says so.
- A snapshot that is malformed is ignored and replaced at the next completed
  read.
- `written[].schemaVersion` and `promptVersion` are the service's (002.5b).
  A rule from an older prompt is shown as read.

---

# Steps

0. **Fixture:** record ManualChemin's answers with
   `fr-urban-rules.dev.captureFixtures` on
   `content/Projects/ManualChemin de Saint-Hilaire.archiproject`, into
   `test-fixtures/fr-urban-rules/snapshot/manualchemin/`. It goes there, not
   under `acceptance/`, which holds 002.9's expected values. _(Taken on the
   owner's behalf (2026-10-21), reversible.)_
1. **Manifest:** `sdkVersion` "1.33"; version 0.9.0; the description gains
   one clause; CHANGELOG.
2. **Snapshot writer:** `snapshotOf(state, extractions)`, the clip, simplify
   and degrade steps (DEC-2), the content equality, and
   `writeCache(data, attributions)` (DEC-3).
3. **Restore:**
   - `readCache()` in `readPlot`, and the `plotKey` match;
   - seeding `state.answers` / `entry.good` without a `report`, and the
     restored parsed form read at `:2518`, `:2549–2562` and `:3058`;
   - the `progress` answer and the « checking » line;
   - `onDidChangeCache` → `onDidChange` outside a read (DEC-4).
4. **Keys:** `centroid` kept through DEC-2, and the stored `ruleKey` honoured
   by `writtenRulesOf` (DEC-5).
5. **Written rules:** restored records, the newer-reading offer and its
   action (DEC-7).
6. **Diff and wording:** en and fr keys under `fr-urban-rules.snapshot.*`
   (DEC-6, DEC-2, DEC-7).
7. **Header and README prose:** "never from a read" becomes "decisions never
   from a read; readings to the cache".
8. **Docs:**
   - the milestone's §12 row and §15.1 ledger;
   - the platform README's ledger sentence;
   - this repository's CLAUDE.md SDK lines (1.32 → 1.33: the services
     paragraph, the `sdkVersion` paragraph and its list of minors).

# Acceptance criteria

Every test named here is new unless it says "existing". The tests run with
`node --test 'fr-urban-rules/tests/*.test.mjs'` from the repository root.

1. **Restored at open, offline.** For each of the six plots, a project whose
   cache holds the snapshot is opened with the network refused. The answer
   shows the same zones, prescriptions, easements, risks and flags as the
   recorded read, and the « Offline — shown as read on » line.
   _Test: `fr-urban-rules/tests/snapshot.test.mjs`, "restores the reading
   offline". Fixtures: `acceptance/*/answers.json` and
   `snapshot/manualchemin/` (step 0)._
2. **Snapshot first, then fresh, in one read.** Online, the first `progress`
   report carries the « Read on … checking » line. The read's answer is the
   fresh report. `onDidChange` is not fired.
   _Test: `snapshot.test.mjs`, "progress first, answer fresh"._
3. **Keys survive.** The set of rule keys from a restored snapshot equals the
   set from a fresh read, on the six plots, also with DEC-2 steps 2–5 forced.
   Every confirmation in each `section.json` still matches.
   _Test: `snapshot.test.mjs`, "rule keys equal after a restore"._
4. **Size.**
   - The snapshot of each reference plot is under 200 000 characters with no
     `simplified` step.
   - A synthetic answer with a 2 MB polygon is reduced, says so, and is
     still under the limit.
   - A `writeCache` that throws (the host's total) leaves the previous
     snapshot and shows « Not saved in the project ».
     _Test: `snapshot.test.mjs`, "fits the budget" / "degrades and says so" /
     "a refused write keeps the previous one"._
5. **Written only on change.** A second read of the same answers writes
   nothing (`writeCache` not called). A changed answer writes once.
   _Test: `snapshot.test.mjs`, "writes only when the reading changed"._
6. **What changed.** A recorded read altered with a new `idurba`, a zone
   relabelled, one prescription added and one easement removed gives the four
   lines in en and fr, and {n} equals the reopen rule's count. An identical
   read gives « Unchanged since ».
   _Test: `snapshot.test.mjs`, "what changed"._
7. **Written rules without the service.** With `PluginServiceToken.locate()`
   answering `undefined`, Lyon's restored extraction lists its 32 rules with
   passages and the « as read on » line. The « not available » notice is
   still shown, and Extract again is disabled.
   _Test: the existing `fr-urban-rules/tests/written.test.mjs`, "restored
   extraction stands without the service"._
8. **A newer reading is offered, never applied.**
   - A `cachedOnly` answer for the same document version with different
     rules shows the offer, and the restored rules are unchanged.
   - Accepting writes the cache once and calls `write` never.
     _Test: `written.test.mjs`, "a newer reading is offered"._
9. **No decision from a read.** Across criteria 1–8, `write` (the section) is
   never called.
   _Test: `snapshot.test.mjs` (a spy on `write`)._
10. **Attribution.**
    - The snapshot's attributions are passed as `writeCache`'s second
      argument, not inside `data`.
    - They appear in the report's credit line on a restored report.
      _Test: `snapshot.test.mjs`, "credits a restored reading"._
11. **Unknown schema.** A snapshot with `schema: 2` is ignored and logged.
    _Test: `snapshot.test.mjs`._
12. **Walked in the editor:**
    - Lyon is opened, read, saved and closed;
    - it is reopened with the network blocked: the snapshot is shown;
    - it is reopened online: « Unchanged since »;
    - with the gateway stopped, the written rules are shown.

    _Platform `tools/e2e`, `playwright.regulations.config.ts`, project
    `regulations-phase3`, a new case `snapshot`; pictures in
    `test-results/regulations/snapshot/`._
13. **Gates:**
    - `node --test 'fr-urban-rules/tests/*.test.mjs'` from the repository
      root;
    - `archisimple package validate ./fr-urban-rules` and
      `archisimple package build ./fr-urban-rules --out dist`;
    - the built package loads in a web image carrying 096.17.

# Risks

- **A read that answers a feature intermittently** (API Carto paging, a
  timeout on one layer) shows "new / no longer listed" noise. Mitigation:
  failed sources keep their snapshot entry and are not diffed. Only `ready`
  sources are compared.
- **The licence check is still open.** The owner chose to ship with the
  attributions as drafted and check in parallel (answer 2). It stays on the
  owner's list.
- **Project files grow** by 2–69 KB.
- **A restore path that misses a raw-features reader** would show a fact
  missing offline. Criterion 1 compares the whole restored report on six
  plots, which is the guard.

# Post-sprint list

- [x] Status, Outcome, Design Contract, acceptance criteria walked.
- [x] CHANGELOG 0.9.0; README; the manifest description.
- [x] Milestone doc: the §12 row and the §15.1 ledger. 002.10's version needs
      already say 0.10.0 / "1.33"; confirmed (§15.1's sentence and 002.10's
      draft).
- [x] Platform README §3: the row and the ledger.
- [x] This repository's CLAUDE.md: the SDK lines (1.33) and the
      `fr-urban-rules` reference version.

---

# Outcome (2026-10-21)

**Implemented and walked, uncommitted; independently reviewed the same day
(below, "Review (2026-10-21)").**
`fr-urban-rules` **0.9.0**, `sdkVersion` **"1.33"**, capabilities and
`network.hosts` unchanged; the companion service untouched. Built against the
platform's uncommitted 096.17 (contract 3.21.0, SDK 1.33, file 25). **No
platform defect found**; 096.17 is not changed by this sprint (its `tools/e2e`
gains this sprint's spec and project, below).

## What landed

- **Snapshot writer** (`src/index.js`, « The planning snapshot »):
  `snapshotEntryOf` (DEC-1: wave 1 parsed, layers' `parsed` items, Géorisques'
  and the file list's small answers; never `features`), `fittedSnapshot`
  (DEC-2: the 100 m box on the centimetre grid, Sutherland–Hodgman /
  Liang–Barsky clipping, `centroid` kept as read; then `clip-30`, `simplify`,
  `drop-information` / `-easement` / `-prescription`, `shorten-passages`, each
  in `simplified`), `snapshotContent` (DEC-3's equality without `readAt` and
  `retrievedAt`), `snapshotAttributions`, `storedResultOf` (a written result in
  002.5b's shape with each rule's `ruleKey`), and in the reader `snapshotStep`
  — written after a completed read for the plot on view, its written readings
  included, only when the content changed; a snapshot over budget or a refused
  `writeCache` is « Not saved in the project: too large », logged, and the
  previous one stays.
- **Restore** (DEC-4): `readPlot` with no memory of the plot calls
  `restoreSnapshot` (`readCache`, `checkedSnapshot`, `restoredAnswerOf` —
  every member re-read as an answer is, a link only to the GPU's files); the
  restored answers seed `entry.good` (no `report`) and are shown at once
  through the read's `progress` with « Read on {date} — checking for
  changes… », each source `loading` with its date; the fresh read continues
  and its answer carries the snapshot blocks. `municipalityOf`,
  `documentsOf`, `featureCountOf` and `isEmpty` read the parsed form where the
  raw features are absent (the three readers the review named).
  `onDidChangeCache` → `cacheChanged` → `onDidChange` only outside a read and
  never for the package's own write.
- **Keys** (DEC-5): drawn keys read the kept `centroid`; `writtenKeysOf` is the
  one computation of written keys, and a stored `ruleKey` is reused
  (`checkedServiceRule` keeps it when it matches `written:`).
- **What changed** (DEC-6): `factsOf` / `factsOfSnapshot` / `changesBetween`
  on sources ready in both; `changeBlock` words them; `{n}` counts the rules
  carrying `rule.reopened` on the answered report — the existing reopen rule.
- **Written rules** (DEC-7): restored records in `extractions` whether or not
  the companion is located (`heldWritten`, `writtenInput` before and without
  `locate()`); `writtenStateOf` shows them without the service, with
  `snapshot.writtenAsRead`, no Extract again; with the service, `askCached` on
  a restored record calls `offerIfNewer`, and `written-use-newer` takes the
  offer and writes the snapshot once.
- **i18n**: 26 keys under `fr-urban-rules.snapshot.*` and
  `status.shownAsReadOn`, en and fr.
- **Fixture (step 0)**: `test-fixtures/fr-urban-rules/snapshot/manualchemin/`,
  captured live on 2026-10-21 by the developer command on a **copy** of the
  owner's project (the walk, below; `content/Projects/` never written) and
  trimmed by `node tools/record-fixtures.mjs manualchemin --snapshot --trim`
  (`--snapshot` is new: `tools/acceptance.mjs`' `SNAPSHOT_PLOTS`,
  `helpers.mjs`' `SNAPSHOT_FIXTURES` and `loadAcceptance(plot, base)`).
- **Tests**: `fr-urban-rules/tests/snapshot.test.mjs` (new, 32) and two in
  `written.test.mjs`; the manifest test at 0.9.0 / 1.33.
  `node --test 'fr-urban-rules/tests/*.test.mjs'`: **393 pass, 0 fail, 2
  skipped** (002.9's owner-step recordings, as before).
- **Platform `tools/e2e`**: `specs/regulationsSnapshot.spec.ts` and the
  project `regulations-snapshot` in `playwright.regulations.config.ts`.

## Measured (characters, `{ data, attributions }` serialized)

| Plot | Raw answers | Snapshot (step 1, 100 m) | All steps forced |
| --- | ---: | ---: | ---: |
| Brouennes | 6 361 | 1 636 | 1 730 |
| Gordes | 317 394 | 5 682 | 4 211 |
| Lyon | 876 820 | 28 583 | 15 117 |
| Mouzay | 586 528 | 8 131 | 3 444 |
| Rochefort | 24 788 | 3 664 | 1 924 |
| ManualChemin | 1 826 801 | 10 793 | 4 388 |

No reference plot needs a step past the first. Live in the walk (the host's
envelope, as saved): Lyon 26 894, ManualChemin 14 695 (Lyon's Géorisques and
GPU file list were down, so absent; ManualChemin's carries one written
reading). The draft's ≈ 69 KB worst case does not occur: the stored outlines
are already simplified at 0.2 m by `convertGeometry`.

## Acceptance criteria, walked against the implementation

1. **Restored at open, offline** — `snapshot.test.mjs` "criterion 1: restores
   the reading offline — <plot>" ×6 (zones, features by category and label,
   flags, version, rule keys; the « Offline — shown as read on » line en/fr;
   every restored source `status.shownAsReadOn`). ✔
2. **Snapshot first, then fresh, in one read** — "criterion 2: progress first,
   answer fresh — one read, onDidChange not fired". ✔
3. **Keys survive** — "criterion 3: rule keys equal after a restore, with and
   without DEC-2 steps 2–5" ×6; every walk confirmation still names a rule. ✔
4. **Size** — "criterion 4: fits the budget…" ×6; "a 2 MB polygon is reduced,
   says so, and is still under the limit" (2.2 MB zigzag: `clip-30` +
   `simplify`, said en/fr); "a refused write keeps the previous one…"; also
   "a snapshot that fits after no step is not written…". ✔
5. **Written only on change** — "criterion 5: writes only when the reading
   changed" (new session, `site` / `refresh` / `design` in one session, then a
   changed risk writes once, dated now). ✔
6. **What changed** — "criterion 6: what changed — a new idurba, a zone
   relabelled, a prescription added, an easement removed" (four lines en and
   fr, `{n}` = the reopen rule's count), "…says the version alone" (n = 0),
   "an identical read gives « Unchanged since »; only sources ready in both are
   compared". ✔
7. **Written rules without the service** — `written.test.mjs` "002.11
   criterion 7: restored extraction stands without the service" (a **new**
   test in the existing file, not an existing one as the draft worded it):
   Lyon's restored result keeps every rule it held — **31**, not 32: 002.6b's
   review S5 leaves one of the 32 served out, so it was never shown —, the
   same written rules, keys and passages, « as read on », the « not
   available » notice, no Extract. ✔ (with the count corrected)
8. **A newer reading is offered, never applied** — "002.11 criterion 8". ✔
9. **No decision from a read** — the `write` spies in every snapshot test and
   "criterion 9: across a restore, a fresh read and a change, `write` is never
   called". ✔
10. **Attribution** — "criterion 10: credits a restored reading". ✔
11. **Unknown schema** — "criterion 11: a snapshot with schema 2 is ignored and
    logged, then replaced by a completed read"; DEC-8's malformed and
    other-plot cases and the GPU-only link in two more tests. ✔
12. **Walked in the editor** — below. Lyon read, saved, reopened offline (the
    snapshot), reopened online (« Unchanged since »), and with the snapshot's
    version altered (« What changed »). « With the gateway stopped, the written
    rules are shown » was walked on **ManualChemin**, with `/plugins-api/`
    refused by the browser: the owner's gateway held no Lyon extraction, and
    is never stopped or asked to extract. ✔ (with that substitution)
13. **Gates** — `node --test 'fr-urban-rules/tests/*.test.mjs'` (above);
    `archisimple package validate ./fr-urban-rules` passed; `archisimple
    package build ./fr-urban-rules --out <scratch>` built
    `com.archisimple.fr-urban-rules-0.9.0.aspkg`; `node tools/build-index.mjs
    --cli …` and `node tools/check-index.mjs --platform ../archisimple`: 2 of 2
    accepted. « Loads in a web image carrying 096.17 »: loaded and walked in
    the **development server** of the uncommitted tree carrying 096.17, not in
    a Docker image. ✔ (dev server, not an image)

## The walk — Chromium, 2026-10-21

Editor on port 5186 (`ARCHISIMPLE_PLUGIN_SERVICES_ORIGIN` → the owner's
running gateway on 4500, only ever asked `cachedOnly` by a read), the package
from a local index on 47521 (`dist/`), `regulationsSnapshot.spec.ts`, 2
passed. Projects copied to a temporary folder first. Everything in
`archisimple/tools/e2e/test-results/regulations/snapshot-002.11/` (picture +
the Properties text for each):

- Lyon: `lyon-1-read-online` (Read), `lyon-ATTRIBUTIONS.md`,
  `lyon-2-offline` + `-2b-offline-checks` (the three public hosts refused:
  « Offline — shown as read on 2026-10-21 », zone UCe1b, 14 prescriptions, 23
  easements, the check computed), `lyon-3-online-unchanged` (« Unchanged
  since 2026-10-21 — checked today », project clean), `lyon-4-what-changed`
  (the saved copy's snapshot set to `…_20250101`: « What changed since
  2026-10-21 — New version of the PLUi, from 200046977_PLUi_20250101 to
  200046977_PLUI_20260326, in force from 2026-03-26. », project unsaved: the
  new reading was written), `lyon-5-without-companion` (« not available »
  kept).
- ManualChemin (a copy): `chemin-1-online` (read at open), the fixture
  captured, `chemin-2-offline` / `-2b-offline-rules` / `-2c-offline-checks`
  (« Offline — shown as read on », « 5 Confirmed », « 2 potential issues »;
  saved offline: section and cache entry equal to the online save's),
  `chemin-3-online-unchanged`, `chemin-4-without-companion` /
  `-4b-without-companion-rules` (« Written rules as read on 2026-10-20
  (qwen/qwen3-vl-8b) », 8 rules read, pp. 170–180, beside « not available on
  this deployment »).

**Live services that day.** Géorisques (`georisques.gouv.fr`, HTTP/2 stream
errors) and the GPU document API (503) were down for the whole walk. So the
online reads showed « 6 sources did not answer », the snapshots hold no
Géorisques answer or file list for either plot, and **ManualChemin's fixture
records those requests as failures**. Re-record when they are back:
`node tools/record-fixtures.mjs manualchemin --snapshot` then `--trim`.

## Decisions beyond the draft — taken on the owner's behalf (2026-10-21), reversible

1. **Written entries are `{ zone, query, result }`**, `result` in 002.5b's
   service shape (each rule with its `ruleKey`, the document's `sha256`), not
   DEC-1's flattened sketch, so a restored one is checked by `checkedResult`
   like any answer. Chunks, `dropped` detail and replay notes are not kept;
   the counts `chunks.of/failed` and `dropped` are (the partial flag reads
   them).
2. **The credit lines are `ATTRIBUTIONS[SOURCES[id].attribution]`** — DEC-1's
   rule — not the sketch's example lines naming « Licence Ouverte 2.0 »,
   which the pending licence check (answer 2) has not confirmed.
3. **No « → » in the wording**: the print font's WinAnsi has none (002.7's
   `sheet.test.mjs` criterion 12 refuses it). « from {old} to {new} » /
   « de {old} à {new} ».
4. **A new version with no confirmation to review** says the version alone
   (`snapshot.change.versionNothingToReview`) rather than « 0 confirmations
   to review ».
5. **« Unchanged since {date} — checked today »** joins DEC-4's « Unchanged
   since » and DEC-3's « checked today » in one line; it shows only when the
   project carried a snapshot at open. Dates are `YYYY-MM-DD`, local, as
   `written.fromSection` gives them.
6. **« What changed » is compared once per fetching read** and kept for the
   session in the memory entry; a later re-read that finds nothing new keeps
   showing it.
7. **The offer** (DEC-7) is any different reading of the same `idurba` and
   `nomfic`: other rules or passages, another `sha256`, or a later extraction
   by a newer prompt. A passage the snapshot shortened is compared on what it
   kept. Never applied without « Use it ».
8. **The clipping box is on the centimetre grid**, outward, so cutting a
   restored snapshot again changes nothing — found by the tests: without it
   an offline open rewrote the snapshot (DEC-3).
9. **A restored source the fresh regime does not ask is not shown**, and
   **an unchanged snapshot step is skipped** on reads answered from memory (a
   design edit re-clipped every outline otherwise).
10. **Step 0's folder and tool**: `--snapshot` on the recorder; the e2e is its
    own project `regulations-snapshot` and spec rather than a case of
    `regulations-phase3`, pictures in
    `test-results/regulations/snapshot-002.11/` (the task's path) rather than
    `…/snapshot/`.

## What did not hold, or is open

- The draft's « 32 rules » for Lyon (criterion 7) is the served count; the
  shown and stored count is 31 (above).
- The Lyon walk's written rules without the companion could not be shown on
  Lyon (no extraction on the owner's gateway, none started); walked on
  ManualChemin instead.
- The sheet with a restored reading was not printed in the walk.
- ~~The host's own summary line, « N sources did not answer; everything else is
  current », sits above « Offline — shown as read on … » on a restored report.
  It is the platform's wording (096.2) and true of the sources it counts; not
  a 096.17 defect, noted for the owner.~~ **Wrong, and fixed by the review**
  (H1 below): it was a defect of both sides — the package reported a restored
  source `unavailable`, and the host had no state for a reading shown as of a
  date.
- No « forget the saved reading » action (out of scope; milestone backlog).

## Review (2026-10-21)

An independent review of the diff against the sprint, platform 096.17 (and
ADR-0111, ADR-0115) and the walk's pictures, with the platform tree
uncommitted. Each finding names its fix; the platform half is recorded as
096.17's "Post-review fix (2026-10-21)".

**Findings**

- **H1 — A restored reading was reported as « did not answer » under
  « everything else is current », and counted as current.** On ManualChemin
  offline (`chemin-2-offline.png`) the host said « 18 sources did not answer;
  everything else is current » above the package's « Offline — shown as read
  on 2026-10-21 »: contradictory, and false (nothing was current). The
  package reported each restored source `unavailable` (the SDK had only
  `loading`, `ready`, `unavailable`), so the host counted them as failures,
  kept the report `current`, and the status bar showed « 2 potential issues »
  in the issue accent, the assistant's fragment said `ready`, the sheet and the
  credit said nothing of the date — ADR-0115 Rule 3 ("never presented as
  current") broken on the host's side. **Fixed:**
  - platform (SDK 1.33, unreleased, same minor): `REGULATION_SOURCE_STATES.Saved`
    (`'saved'`, `retrievedAt` required; the registry reads an undated one as
    `unavailable`); a ready report holding one has the host freshness `saved`,
    never `current`; Properties says it **once** — « Offline — N sources shown
    as read on {date} » when no source answered, else « N sources did not
    answer and are shown as read on {date} », plus « N … have no earlier
    reading to show » for the others; chip « As last read ». Its counts are
    shown as a stale report's (neutral accent, badges `info`), the credit
    « (as last read) », the sheet and dialog stale and dated, the variation
    figures « as of {date} », the assistant's fragment `stale`. ADR-0111 Rules
    3 and 14 and ADR-0115 Rules 3 and 12 revised in place.
  - package: `sourceStatuses` reports a failed source shown from an earlier
    answer — the snapshot's or this session's — as **`saved`** with its date
    (the detail « Did not answer; shown as read on/at … » kept, for the sheet's
    footer); the package's own « Offline — shown as read on {date} » line is
    removed (the host says it; key dropped from en and fr); the five-minute
    degraded memory now counts `saved` as `unavailable` was, so a report with an
    earlier reading is retried.
  - tests: `snapshot.test.mjs` criterion 1 ×6 (every restored source `saved`
    with the snapshot's `retrievedAt`, no package « Offline » line),
    `reading.test.mjs` criterion 11 (`saved` on a refresh that fails);
    platform tests listed in 096.17's fix.
- **M1 — « The regulation link could not be resolved » while the file was
  known.** (a) A failed GPU file list with an earlier answer (`found`) showed
  `linkUnavailable` and dropped `document.href`, so offline the restored link
  was never used. (b) `checkedResult` dropped the extraction's `documentId`,
  so a written reading — which names the GPU document and the règlement file
  of its version — could not give the link when the file list never answered
  (ManualChemin: the GPU document API was down at every read). **Fixed:**
  `regulationLink` (one computation for the overview and `reportDocument`):
  the fresh link; else the earlier one, dated; else a held written reading of
  **the same version** (`idurba`, case-insensitive), dated by its extraction.
  The link's detail reads « The file as listed on {date}: the Géoportail de
  l'Urbanisme has not answered since. Opens at its first page. »
  (`link.detailAsRead`, en and fr), and at the zone's page « The file as
  listed on {date}, opened at page {page}, … » (`link.detailPageAsRead`) —
  the walk found the zone-page link replacing the dated one. `checkedResult`
  keeps a hexadecimal
  `documentId`; a same-file (`sha256`) companion answer adds it to a restored
  reading that lacks it (a fact of the file, not another reading; written once).
  Tests: `snapshot.test.mjs` "offline, the restored link opens the file it
  named, dated", `written.test.mjs` "the règlement's link comes back from a
  written reading when the GPU never answered", "at the zone's page, a link
  read earlier still says when" and "a written reading of another version
  names no link".
- **M2 — Every snapshot write cost a second read.** The host signals
  `onDidChangeCache` a microtask after the write (`sitePackageDataAdapter`'s
  `watch`), when `writingCache` is clear and the read has returned, so the
  package fired `onDidChange` for its own write and the host read again
  (`source`). The DEC-4 test used a synchronous listener and could not see it.
  **Fixed:** the package keeps its last write serialized and ignores a signal
  whose entry equals it. Test: "the host's change signal after the package's
  own write, a microtask later, asks no second read" (fails without the fix);
  the DEC-4 test now changes the entry to stand for a load.
- **M3 — A re-read that lists the same features in another order rewrote the
  snapshot** and marked the project unsaved (DEC-3, ADR-0115 Rule 5): the
  equality was order-sensitive and API Carto promises no order. **Fixed:**
  `snapshotContent` compares each source's items (`parsed`, `risks`, `pprs`,
  `documents`) and the written readings as sets; the stored order is the one
  read. Test: "the same features listed in another order are the same reading
  — nothing written" (Lyon, every layer reversed; fails without the fix).
- **L1 — A stored written key with a space was dropped.**
  `STORED_WRITTEN_KEY` refused whitespace, but a sector may hold one (« UA et
  UB », up to 40 characters): such a rule's key was recomputed from a passage
  DEC-2 step 5 may have shortened, orphaning its confirmation. **Fixed:**
  only control characters are refused. Test: "a stored written key whose
  sector holds a space is kept".
- **L2 — « Unchanged since {date} — checked today » while sources had not
  answered** (the walk's `chemin-3`, six down). **Fixed:** « Unchanged since
  {date} among the sources that answered today » / « Inchangé depuis le {date}
  pour les sources qui ont répondu aujourd'hui » when any source asked did not
  answer. Test: criterion 6's identical-read test, its failing-prescriptions
  half.
- **L3 — Criterion 3 never exercised written keys under DEC-2 step 5:** the
  six replays have no companion, so `shorten-passages` shortened nothing.
  **Added:** `written.test.mjs` "written keys survive DEC-2 step 5" (a
  600-character passage and its twin, shortened; restored keys equal fresh,
  `~2` kept).

**Noted, not changed**

- **DEC-2 step 4 drops prescription outlines** that "a drawn prescription
  applies where it is drawn" reads, so a snapshot that ever needed
  `drop-prescription` would check differently offline. No reference plot needs
  a step past the first (largest 28.6 KB); the owner's call if it matters.
- **DEC-8 as written:** a snapshot of a higher schema is replaced by the next
  completed read (a project reopened in an older package loses the newer
  package's reading).
- **The fixture is not re-recorded:** at 19:3x on 2026-10-21 Géorisques still
  failed (HTTP/2 `INTERNAL_ERROR`, also over HTTP/1.1) and the GPU document API
  (`grid=200054807`) answered 503. Re-record when both answer: `node
  tools/record-fixtures.mjs manualchemin --snapshot`, then `--trim`.

**Verified and held**

- **Determinism:** the 100 m box on the centimetre grid, outward, makes a
  restored snapshot cut again identical — the offline save equals the online
  one (walk, both plots); `readAt` and `retrievedAt` are out of the equality,
  and since M3 the order is too.
- **Keys:** the drawn key reads the centroid `convertGeometry` computed on the
  unsimplified geometry, kept through every step (or the box centre of the
  unclipped simplified parts, as a fresh read's fallback); points and
  unconverted geometries keep their order; written keys are stored and reused
  (with L1).
- **« Use it»** writes the cache once and the section never (criterion 8);
  `snapshotStep` is the one caller of `writeCache`; no new `write`.
- **Stored:** parsed facts only — no `features`, no checks, counts, envelope,
  capacity; written results without chunks' texts or replay notes; nothing
  beyond what the read used (the municipality's geometry and the files other
  than the règlement are not kept). Attributions: the envelope's, at most 16
  lines of at most 300 characters.
- **Input:** a higher schema is ignored and logged; a malformed snapshot or
  one of another plot is ignored; every restored member is re-read field by
  field, a link only to the GPU's own files.
- **Budget:** 200 000 characters with DEC-2's steps, a refused write said and
  the previous snapshot kept (criterion 4).

**Gates (review, 2026-10-21)**

- `node --test 'fr-urban-rules/tests/*.test.mjs'`: **401 pass, 0 fail, 2
  skipped** (002.9's owner-step recordings).
- `archisimple package validate ./fr-urban-rules`: passed; `package build`:
  `com.archisimple.fr-urban-rules-0.9.0.aspkg`; `node tools/build-index.mjs
  --cli … --out dist` and `node tools/check-index.mjs --platform
  ../archisimple`: 2 of 2 accepted.
- Platform: see 096.17's post-review fix (build, cold `tsc`, lint, depcruise,
  validators, `apps/web` with only the known failures).
- **The walk again** (`regulations-snapshot`, port 5186, the index on 47521,
  the owner's gateway on 4500 asked `cachedOnly` only):
  **2 passed**, after the fixes, at ~20:00. Pictures and texts replaced in
  `archisimple/tools/e2e/test-results/regulations/snapshot-002.11/`, with two
  new ones, `lyon-2-offline-light` and `chemin-2-offline-light` (the offline
  state in the light theme; the app's default is dark):
  - **Offline** (`lyon-2-offline`, `chemin-2-offline`, both themes): one
    notice, « 12 sources did not answer and are shown as read on Oct 21, 2026,
    8:0x PM » and « 6 sources did not answer and have no earlier reading to
    show » (Géorisques and the file list, down at every read today), then
    **Try again**; each restored source « As last read », dated. Not «
    Offline — … »: the roads and the companion still answered (only the three
    public hosts were refused), so the host does not claim no source answered.
    The status bar's « 2 potential issues » is in the neutral accent.
    ManualChemin's règlement link comes back from its written reading: « Open
    the regulation, zone UDa1, chapter 7…, p. 170 » with « The file as listed
    on 2026-10-20, opened at page 170 … the Géoportail de l'Urbanisme has not
    answered since ». Lyon's says « could not be resolved » — true: neither the
    file list nor a written reading of Lyon ever named it today. Saved
    offline, ManualChemin's section and cache entry equal the online save's.
  - **Online, unchanged** (`*-3-online-unchanged`): « 6 sources did not
    answer; everything else is current » (no saved source) above « Unchanged
    since 2026-10-21 among the sources that answered today ».
  - **What changed** (`lyon-4-what-changed`): the version line under « What
    changed since 2026-10-21 », project unsaved (the new reading written).
  - **Without the companion** (`chemin-4-without-companion`): « Open the
    regulation » with « The file as listed on 2026-10-20 », beside « not
    available on this deployment »; the written rules as read.
  - Also re-run: `package-cache` (the platform's stub, now `saved` offline),
    1 passed.

