# Sprint 002.11 — Planning Snapshot

> **Status:** **Draft (2026-10-21)**. Nothing is implemented. Owner-approved
> feature (conversation of 2026-10-21). The open choices are taken as
> recommendations **on the owner's behalf (2026-10-21), reversible**.
>
> **Repository:** `archisimple-plugins`, the `fr-urban-rules` extension only.
> The companion service is unchanged.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> §12, a row after Phase 3. Platform README §3 row 096.17 / 002.11.
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
>   **0.10.0**, and its `sdkVersion` becomes "1.33", inherited from here.
> - This sprint lands first: it is approved now, and 002.10 is Phase 4.
> - 002.10's "Version needs" and the milestone ledger are updated in the same
>   pass.
>
> **Sizes:**
>
> - the snapshot writer, with its degradation;
> - the reader at open;
> - the diff and its wording (en and fr);
> - written rules restored;
> - tests and fixtures.
>
> Medium.

---

# Sprint Design Contract

- [ ] **A reading is never a decision.**
  - Snapshots go to `writeCache` (ADR-0115), never to `write`.
  - Decisions stay in the section, one Request each, as since 002.1a.
  - No confirmation, edge role or entered value is written from a read, and
    none is changed by restoring a snapshot.
- [ ] **A snapshot is never presented as current.**
  - Every view drawn from it says "read on <date>" until a fresh read
    confirms it, or offline says why.
  - The sheet (002.7) prints the date read, as it does today.
- [ ] **No verdict is stored.** Checks, counts, the envelope and capacity are
      recomputed from the restored readings, the section and fresh measures
      (ADR-0111 Rule 4 as revised).
- [ ] **A confirmation means the same thing after a restore.** A rule rebuilt
      from a snapshot has the key a fresh read would give it (DEC-5).
- [ ] **The snapshot carries its attributions**, and they are shown wherever
      it is shown (Licence Ouverte 2.0, ADR-0115 Rule 3).
- [ ] **Written only when the reading changed.** Opening an unchanged project
      leaves it clean (ADR-0115 Rule 5).
- [ ] **No new host is contacted, and nothing new is sent.** The network list
      in the package card is unchanged.

---

# Current state (read 2026-10-21, `fr-urban-rules` 0.8.1)

- **Memory cache (DEC-9).** `createReader` keeps
  `cache: Map(plotKey → { report, good, expiresAt })`, holding at most
  `CACHE_PLOTS` (20) plots.
  - `good[sourceId]` is `{ features, parsed, retrievedAt }`. `parsed` is
    already in the Site's CRS, through `parseLayer` and `convertGeometry`.
  - A source that fails is shown from its last good answer: `usable`,
    `resolveRegime`, `sourceStatuses` with `status.shownAsRead`.
  - **Nothing outlives the session.**
- **Written rules.**
  - `extractions: Map(id → record)` holds `{ key, query, zone, state, result, current, revision }`.
  - The companion is asked with `cachedOnly` on read (`askCached`), and asked
    to extract only on the user's Extract.
  - A confirmed written rule with no current extraction "stands on the section
    alone" (002.6b DEC-6). `confirmations[].citation` holds page, article and
    passage.
- **The section** (`schema: 1`): `confirmations` (each with `ruleKey`, `plot`,
  `idurba`, `datvalid`, `decision`, …), `edgeRoles`, `entered` and the
  Surfaces answers.
  - Reopening on a new document version is derived at read time from the
    stored `idurba` / `datvalid` (proposal §8).
  - **Since 096.4's post-acceptance fix, a project holding a section is read
    at open.**
- **Drawn rule keys** (`drawnKey`):
  `psc:<type>:<subtype>:cyrb53(libelle|txt|roundedCentroid(geometry))`.
  `roundedCentroid` prefers `geometry.centroid`, then the box centre of the
  rings and lines. **Clipping a prescription's geometry would move that
  centroid and orphan its confirmation**, a pitfall found while drafting
  (DEC-5).
- **Attribution.** `SOURCES[id].attribution` is `apicarto`, `gpu` or
  `georisques`. The report carries the credit line (096.5).

## Measured sizes

Method: Platform Sprint 096.17 § "Measured". The inputs are
`test-fixtures/fr-urban-rules/acceptance/*/answers.json`, a live read for
ManualChemin on 2026-10-21, and the Lyon extraction fixture. Sizes are in
characters, serialized.

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

- The service-side watch (002.10). This sprint checks at each open; 002.10
  tells the user sooner during a session and reuses this sprint's diff and
  wording.
- Storing check results, counts or the envelope (Contract).
- Several plots per project. One snapshot is kept, for the plot on view.

---

# Decisions

## DEC-1 — What goes in (schema 1)

```jsonc
{
  "schema": 1,
  "plotKey": "…",               // the reader's plotKey(view): parcels + ring digest
  "crs": "EPSG:2154",
  "readAt": "2026-10-21T…Z",    // when this content was first read
  "regime": { "code": "plui" },
  "document": { "idurba": "…", "datvalid": "…", "partition": "DU_…", "gpuDocId": "…",
                "type": "PLUi", "legalStatus": "APPROVED", "publicationDate": "…",
                "reglement": { "name": "…_reglement_….pdf", "title": "…" } },
  "sources": {                  // per source id of SOURCES
    "zone-urba": { "retrievedAt": "…", "parsed": [ /* pick*() + clipped geometry */ ] },
    "georisques-risques": { "retrievedAt": "…", "risks": [ … ] },
    "…": "…"
  },
  "written": [                  // one per extraction record shown
    { "key": "…", "query": { … }, "zone": "UCe1b",
      "document": { "idurba": "…", "gpuDocId": "…", "nomfic": "…", "sha256": "…" },
      "chapter": { "pages": [121, 144], "title": "Zone UCe1" },
      "rules": [ /* kind, sector, statement, limit, page, article, passage, conditions, exceptions, confidence */ ],
      "provider": "lm-studio", "model": "qwen/qwen3-vl-8b",
      "schemaVersion": 1, "promptVersion": 1, "extractedAt": "…" }
  ],
  "attributions": [ "© IGN — Géoportail de l'Urbanisme (API Carto), Licence Ouverte 2.0", "Géorisques (BRGM / MTE), Licence Ouverte 2.0" ],
  "simplified": [ ]             // DEC-2's steps taken, if any
}
```

- **Kept:** the facts the report is assembled from, in `parse*`'s shape, and
  the règlement entry of the GPU file list only.
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
- **Attributions are checked before release.** They are the
  `SOURCES[].attribution` texts. The open Licence Ouverte check (proposal
  §4.3) gates them: question 2.

## DEC-2 — The budget and the degradation

**Target:** 200 000 characters. That is under ADR-0115's 262 144, leaving
room for the next schema. Steps, in order, until the snapshot fits:

1. **Clip geometry to the plot's box grown by 100 m.** Lambert coordinates
   are rounded to 0.01 m. This is always done, and it is not reported:
   nothing the package computes looks further.
2. **Clip to 30 m.** The road margin, `ROAD_MARGIN`, is 30 m.
3. **Simplify** each ring and line (Douglas–Peucker, 0.5 m), never the
   plot's own edges.
4. **Drop geometry** of `information`, then `easement`, then `prescription`.
   Facts and key centroids are kept.
5. **Drop written rules' passages beyond 500 characters,** keeping page and
   article. The confirmed ones keep theirs in the section anyway.

**Saying what was dropped.** Steps 2–5 are each recorded in `simplified`,
and the overview says
« Simplifié pour tenir dans le fichier du projet » /
« Simplified to fit the project file », with what was dropped. A snapshot
that does not fit after step 5 is not written. That is logged and shown
(« Not saved in the project: too large »), and the previous snapshot stays.

**Measured:** no reference plot passes step 1, since the largest is about
69 KB.

## DEC-3 — When it is written

Only when the stored content differs from the new one, compared with `readAt`
and every `retrievedAt` left out (a key-order-free equality). The cases:

- **A read completes for the plot on view** with at least one source ready.
- **An extraction result is taken.** That means a completed Extract, or a
  `cachedOnly` answer for a zone the snapshot lacks.
- **The plot changes.** The new plot's snapshot replaces the old one at its
  first completed read. Until then the stored one is ignored, because its
  `plotKey` does not match.

`readAt` is set when the content changes. An unchanged re-read writes
nothing, and the session shows « checked today ». Never written:

- on a timer;
- on a `design` read (nothing new is fetched);
- from a read that was aborted.

## DEC-4 — At open: snapshot first, then a background re-read

The host reads at open, because the project holds a section or a cache entry
(096.17 DEC-7). **The first answer comes from the snapshot when its
`plotKey` matches:**

- `entry.good` is seeded from `sources`, so `assemble` builds the report it
  always builds;
- sources are listed `loading`, with `retrievedAt` set to the snapshot's;
- the overview's first line reads
  « Lu le {date} — vérification en cours… » /
  « Read on {date} — checking for changes… ».

The online read then runs as today. When it completes, the package:

- compares facts (DEC-6);
- writes the cache if anything changed (DEC-3);
- fires `onDidChange`, so the host reads again with `reason: 'source'`;
- answers the fresh report, carrying the « what changed » block or
  « Inchangé depuis le {date} » / « Unchanged since {date} ».

**Offline**, every source fails:

- the report stays the snapshot's, sources `unavailable` with
  `status.shownAsRead` (the existing key, with a date rather than a time
  when the day differs);
- the overview says
  « Hors ligne — affiché tel que lu le {date} » /
  « Offline — shown as read on {date} ».

**Partly failed:** each failed source shows its snapshot value as read then,
as the session cache already does.

## DEC-5 — Confirmations match: keys survive clipping

`drawnKey` reads `roundedCentroid(geometry)`. The snapshot stores
`geometry.centroid`, which `convertGeometry` already supports and
`roundedCentroid` prefers. It is computed on the **unclipped** geometry
before clipping, so a restored prescription has the key a fresh read gives:

- `rnu:` keys depend on the regime and the zone, and survive unchanged;
- `written:` keys are digests of zone and passage, so they survive as long as
  the passage is kept. Step 5 of DEC-2 keeps the first 500 characters and
  stores the key itself beside the rule;
- `entered:` keys live in the section.

A test compares every key of a fresh read with every key of a restored one,
on the six plots.

## DEC-6 — What changed: compared facts and their wording

The comparison is made on facts, never on geometry, between the snapshot and
the fresh read:

| Fact                                             | Line (en)                                                                                     | Ligne (fr)                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Document `idurba` (case-insensitive) or `datvalid` | New version of the {type}: {old} → {new}, in force from {date}. {n} confirmations to review. | Nouvelle version du {type} : {old} → {new}, applicable depuis le {date}. {n} confirmations à revoir. |
| Regime                                           | The plot is now under {regime} (was {old}).                                                   | La parcelle relève désormais de : {regime} (auparavant {old}).                                     |
| Zone set                                         | Zone changed: {old} → {new}.                                                                  | Zone modifiée : {old} → {new}.                                                                     |
| Prescription (type + subtype + label) added / removed | New prescription: {label}. / Prescription no longer listed: {label}.                     | Nouvelle prescription : {label}. / Prescription qui n'apparaît plus : {label}.                     |
| Easement (`suptype` + name) added / removed       | New easement: {label}. / Easement no longer listed: {label}.                                  | Nouvelle servitude : {label}. / Servitude qui n'apparaît plus : {label}.                           |
| Risk (Géorisques) added / removed                | New risk listed: {label}. / Risk no longer listed: {label}.                                   | Nouveau risque recensé : {label}. / Risque qui n'est plus recensé : {label}.                       |
| Nothing                                          | Unchanged since {date}.                                                                       | Inchangé depuis le {date}.                                                                         |

- **The heading** is « Ce qui a changé depuis le {date} » /
  « What changed since {date} ».
- **{n} is counted by the existing reopen rule.** It counts confirmations
  whose `idurba` / `datvalid` differ. It is never a new rule.
- **The lines are information.** They are not checks, and they reopen nothing
  by themselves.
- **How long the block shows.** It shows for the session. It is not stored,
  because the next snapshot is the new state.
- **Wording to check.** "No longer listed", not "removed": an API answer that
  omits a feature is not proof that it was revoked (proposal §10).

## DEC-7 — Written rules restored without the companion

On a restored snapshot, each `written[]` entry seeds an extraction record:
`state: 'done'`, `result` from the entry, `restored: true`. The rules list
as `written` with their passages. The Rules view says
« Règles écrites telles que lues le {date} ({model}) » /
« Written rules as read on {date} ({model}) ».

- **With the companion present**, `cachedOnly` is still asked:
  - for the snapshot's document version, the project's extraction stands,
    because the user confirmed against it;
  - a companion result replaces it only on the user's **Extract again**;
  - for a newer document version, the companion's result, or « Extract », is
    offered as today.
- **Without the companion**, the restored rules stand. The « not available on
  this deployment » notice (002.6a) is replaced by the restored line.
  Extract again is disabled with the notice's reason.

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

1. **Manifest:** `sdkVersion` "1.33"; version 0.9.0; CHANGELOG.
2. **Snapshot writer:** `snapshotOf(state, extractions)`, the clip, simplify
   and degrade steps (DEC-2), the content equality, and `writeCache` (DEC-3).
3. **Reader at open:** `readCache()`, the `plotKey` match, seeding
   `entry.good` and the extraction records, the « checking » line, and
   `onDidChange` after the background read (DEC-4, DEC-7).
4. **Key centroids** (DEC-5).
5. **Diff and wording:** en and fr keys under `fr-urban-rules.snapshot.*`
   (DEC-6).
6. **Header and README prose:**
   - "never from a read" becomes "decisions never from a read; readings to
     the cache";
   - the package card's description gains one clause.
7. **Docs:**
   - 002.10's version lines move to 0.10.0 / "1.33";
   - the milestone's §12 and §15.1 ledger;
   - the platform README's ledger sentence.

# Acceptance criteria

1. **Restored at open, offline.** For each of the six plots, a project whose
   cache holds the snapshot is opened with the network refused. The report
   shows the same zones, prescriptions, easements, risks and flags as the
   recorded read, and the « Offline — shown as read on » line.
   _Test: `tests/snapshot.test.mjs` "restores the reading offline" (fixtures:
   `acceptance/*/answers.json`, plus a recorded ManualChemin set under
   `test-fixtures/fr-urban-rules/acceptance/manualchemin/`, captured by
   `captureFixtures` in step 3)._
2. **Keys survive.** The set of rule keys from a restored snapshot equals the
   set from a fresh read, on the six plots. Every confirmation in
   `section.json` still matches.
   _Test: `snapshot.test.mjs` "rule keys equal after a restore"._
3. **Size.** The snapshot of each reference plot is under 200 000 characters
   with no `simplified` step. A synthetic answer with a 2 MB polygon is
   reduced, says so, and is still under the limit.
   _Test: `snapshot.test.mjs` "fits the budget" / "degrades and says so"._
4. **Written only on change.** A second read of the same answers writes
   nothing (`writeCache` not called). A changed answer writes once.
   _Test: `snapshot.test.mjs` "writes only when the reading changed"._
5. **What changed.** A recorded read altered with a new `idurba`, a zone
   relabelled, one prescription added and one easement removed gives the four
   lines in en and fr, and {n} equals the reopen rule's count. An identical
   read gives « Unchanged since ».
   _Test: `snapshot.test.mjs` "what changed"._
6. **Written rules without the service.** With `PluginServiceToken.locate()`
   answering nothing, Lyon's restored extraction lists its 32 rules with
   passages and the « as read on » line, and Extract again is disabled.
   _Test: `written.test.mjs` "restored extraction stands without the service"._
7. **No decision from a read.** Across criteria 1–6, `write` (the section) is
   never called.
   _Test: `snapshot.test.mjs` (a spy on `write`)._
8. **Attribution.** The snapshot's attributions appear in the report's credit
   line on a restored report.
   _Test: `snapshot.test.mjs` "credits a restored reading"._
9. **Unknown schema.** A snapshot with `schema: 2` is ignored and logged.
   _Test: `snapshot.test.mjs`._
10. **Walked in the editor:**
    - Lyon is opened, read, saved and closed;
    - it is reopened with the network blocked: the snapshot is shown;
    - it is reopened online: « Unchanged since »;
    - with the gateway stopped, the written rules are shown.
    _`tools/e2e` project `regulations-phase3`, a new case `snapshot`; pictures
    in `test-results/regulations/snapshot/`._
11. **Gates:** `npm test` in `fr-urban-rules`, the package build (`.aspkg`),
    and the platform's `extensions:validate` against the built package.

# Risks

- **A read that answers a feature intermittently** (API Carto paging, a
  timeout on one layer) shows "new / no longer listed" noise. Mitigation:
  failed sources keep their snapshot entry and are not diffed. Only `ready`
  sources are compared.
- **The licence check is still open.** Shipping stored IGN, GPU and
  Géorisques data in user files waits on it (question 2).
- **Project files grow** by 2–69 KB.

# Questions for the owner

1. **The 100 m surroundings.** Enough, or should the snapshot hold what the
   plan draws at its furthest zoom-out (096.16's −120 … 120 m case)?
2. **The licence check** (proposal §4.3, README Q50). Ship 0.9.0 only after
   it, or ship with the attributions as drafted and check in parallel?
3. **Project extraction versus a newer one on the companion** for the same
   document version. DEC-7 keeps the project's; should the companion's be
   offered as « a newer reading exists »?

# Post-sprint list

- [ ] Status, Outcome, Design Contract, acceptance criteria walked.
- [ ] CHANGELOG 0.9.0; README.
- [ ] Milestone doc §12 row and §15.1 ledger; 002.10's version needs.
- [ ] Platform README §3 row and ledger.
