# Sprint 002.5b — Extraction Jobs

> **Status:** **Implemented (2026-10-20), uncommitted.**
> `fr-urban-rules-service` 0.2.0: the three extraction routes, jobs, the
> result cache, the limits; one live Lyon UCe1 extraction recorded
> (`qwen/qwen3-vl-8b` through a local ai-service). **Not done:** the walk
> through the image behind 096.8a's override (no Docker here). See the
> Outcome at the end. Split from the 002.5 draft of 2026-10-19 by the Phase 2
> review (below).
>
> **Version:** 1.1
>
> **Repository:** `archisimple-plugins`, `services/fr-urban-rules-service`:
> 0.1.0 (002.5a) → **0.2.0**. `tools/record-fixtures.mjs` gains an
> `--extraction` mode. The package `fr-urban-rules` does not change here;
> 002.6b is its consumer.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 5.2 item 2, § 7.3 option C, § 8, § 11.2. Platform:
> [Site Regulations](../../../archisimple/docs/milestones/site-regulations/README.md)
> Phase 2.
>
> **Prerequisites:**
>
> - **002.5a**: the gateway, the document text, the chapter, the page-offset
>   index, the article and sector headings.
> - **096.7**: ai-service wire contract 1.2.0, `POST /api/ai/extract`, the
>   capability `structured-output`, `structuredOutput.maxTextLength` on
>   health.
> - **096.8a**: `ARCHISIMPLE_AI_SERVICE_URL`, `X-Authenticated-User`.
>
> **Sizes:** the extraction pipeline, jobs, the result cache, limits, one
> recorded live answer. No platform change. Medium.

---

# Sprint Design Contract

- [x] **No model key.** Model calls go through `ai-service`; the code reads
      no key (ADR-0114 Rule 7).
- [x] **Output never becomes a Request.** The service answers candidates.
      It has no Automation API and writes no project. 002.6b shows every
      candidate `to_confirm`, and only a person's action writes (proposal
      § 5.2, ADR-0114 Rule 9).
- [x] **Regulation text is data.** It reaches the model only through
      096.7's fenced text, with no tools. Every value carries a passage that
      096.7 checked verbatim. Conditions and exceptions are checked verbatim
      here, within a window before the passage (DEC-5, DEC-7).
- [x] **Bounded.**
  - Chunks are at most 40 000 characters and never longer than the route's
    `maxTextLength`.
  - One extraction runs at a time, with a queue of at most 10.
  - Limits are per user (DEC-8).
- [x] **A model call starts only from `POST extractions`.** A cached read
      never starts work (`cachedOnly=1`).
- [x] **A failure is named.** Every outcome is a state or a code from
      DEC-10.

---

# Current state

- **002.5a** (draft) answers `GET chapter`. It caches each document's text
  by `upper(idurba)/nomfic`, and prepares a chapter with a page-offset
  index, article headings and sector headings.
- **096.7** (draft) answers `POST /api/ai/extract`:
  - It takes `{ instructions, text, itemSchema, maxItems }`.
  - It returns items `{ value, passage: { text, start, end, occurrences } }`
    with offsets into `text`, plus `rejected`, `providerId`, `model` and
    `constraint`.
  - It normalises passages with NFKC, quote and dash folding, soft-hyphen
    removal and white-space runs (its DEC-3).
- **096.7's terms**, as its review left them:
  - `constraint` says what was **requested and not refused** (`schema`,
    `json` or `prompt`), not what the provider enforced.
  - Each extract call has **one deadline** (120 s).
  - Its limits bound the text and the items, **not model spend**. Spend is
    bounded here (DEC-8).
- **ai-service health** gives `defaultProviderId`, `capabilities` and, from
  096.7, `structuredOutput`. **It gives no model name** (`contract.ts:243`).

## What the UCe1 text says (002.5's probe): the shape the schema must hold

- **Lexicon terms** are marked with `*` (« hauteur* », « retrait* ») and
  defined in Part I.
- **Sector values inside the zone chapter:** « 17 mètres dans le secteur
  UCe1a – 30 mètres dans le secteur UCe1b », and « b. Dans le secteur
  UCe1b — Les constructions sont implantées en retrait* des limites
  séparatives*. Le retrait* est au moins égal à 4 mètres. ».
  - The same sentence may appear under several sectors.
- **A rule that is a statement:** « L'emprise au sol* des constructions
  n'est pas réglementée ».
- **"See the graphic document":** « Dès lors que figure aux documents
  graphiques du règlement un coefficient d'emprise au sol*, sa valeur se
  substitue … » and « La hauteur de façade* maximale des constructions
  figure aux documents graphiques ».
- **Relative forms** against the **façade height**, one with an
  **offset**: « R ≥ Hf − 4 m, avec un minimum de 2 mètres » (UCe1a) and
  « D ≥ Hf/2 ».

---

# Goal

For a plot's document and zone, the service extracts the zone chapter's
rules through 096.7, chunk by chunk, when a person asks. It verifies what it
can, chooses each passage's occurrence by its sector, and answers candidates
with page, article, passage, conditions, exceptions and confidence.
Answers come from a cache keyed by document and chapter. Each extraction is
a job polled in short requests, limited per user and logged without
content. One live Lyon answer is recorded for 002.6b and 002.9.

# Out of scope

- Fetching, chapter finding, text preparation (002.5a).
- Showing or confirming anything (002.6b).
- Part I as extraction input (Question 2).
- Watching for new versions (002.10).

---

# Decisions

## DEC-1 — Routes (added to 002.5a's `v1`)

| Route | Body / query | Answer |
| --- | --- | --- |
| `POST extractions` | `{ partition, idurba, nomfic, zone }` | `200 { state: 'done', result }` when cached; else `202 { jobId, state: 'queued' }` **before any fetch**. `?refresh=1` ignores the result cache (limited, DEC-8) |
| `GET extractions/{jobId}` | — | `{ state, progress: { step, chunk, of }, result?, error? }` |
| `GET extractions?partition&idurba&nomfic&zone&cachedOnly=1` | — | `{ result, current }`, or `404 not_cached` with `current`. **Never starts work, never fetches** |

- **States:** `queued` → `fetching` → `reading` → `extracting` → `done` or
  `failed`. A job lives 30 minutes after it ends; its result lives in the
  cache (DEC-3).
- **`version_changed` and every fetch or chapter code** of 002.5a DEC-11 are
  a **job's** `error`, not the `POST`'s answer, because they are found while
  fetching.
- **`cachedOnly`** needs the document's text in 002.5a's cache to find the
  chapter's pages. Without it the answer is `not_cached`, never a fetch.
- **`current`** is
  `{ providerId: <health's defaultProviderId>, schemaVersion, promptVersion }`.
  002.6b compares it with a result to decide whether to offer "Extract
  again" (DEC-3).

## DEC-2 — The result

```json
{ "schemaVersion": 1, "promptVersion": 1,
  "document": { "documentId": "4f3d…", "partition": "DU_200046977",
                "idurba": "200046977_PLUi_20260326", "nomfic": "200046977_reglement_20260326.pdf",
                "sha256": "…", "pages": 803, "retrievedAt": "2026-10-19T19:36:07Z" },
  "chapter": { "pages": [121, 144], "found": "outline", "match": "prefix", "title": "Zone UCe1" },
  "rules": [ { "kind": "boundary_setback", "sector": "UCe1b", "statement": "limit",
               "limit": { "kind": "value", "comparison": "min", "value": 4, "unit": "m" },
               "page": 126, "article": "2.2.1",
               "passage": "Le retrait* est au moins égal à 4 mètres.",
               "occurrence": { "of": 2, "chosenBy": "sector-heading" },
               "conditions": ["Dans le secteur UCe1b"], "exceptions": [],
               "sectorUnplaced": false, "confidence": "high" } ],
  "dropped": { "passageNotFound": 1, "schemaInvalid": 0, "conditionNotVerbatim": 2, "incoherent": 0 },
  "chunks": { "of": 2, "failed": 0 },
  "model": { "providerId": "openai", "model": "…", "constraint": "schema" },
  "extractedAt": "2026-10-19T19:38:40Z" }
```

- **`page`** is the PDF page index, from 002.5a's page-offset index at the
  passage's chosen offset.
- **`article`** is the nearest heading before that offset. Both come from
  the text, never from the model.
- **The result is per chapter, not per zone.** Every sector's rules are
  returned, and 002.6b keeps the zone's own (its DEC-3).

## DEC-3 — The result cache: by document and chapter

The cache lives under `…/com.archisimple.fr-urban-rules/extractions/`.

- **The key** is
  `sha1(documentKey, chapter.from, chapter.to, schemaVersion, promptVersion)`.
  `documentKey` is 002.5a DEC-5's.
- **The zone is not in the key.** UCe1a and UCe1b share one chapter and one
  extraction, so one model call serves both.
- **The provider and the model are not in the key.** They are stored in the
  result (`model`).
  - Health gives no model name, so a key holding the model could not be
    formed for `cachedOnly`.
  - A result from another provider is still served. 002.6b offers "Extract
    again" when `result.model.providerId` differs from
    `current.providerId`, or when either version is older than `current`.
    The model itself is compared only if health starts carrying it.
- `POST ?refresh=1` replaces the entry.
- **Eviction:** LRU, sharing 002.5a's byte cap. Writes are atomic.
- **One job in flight per key.** A second `POST` for the key joins the
  running job, and costs nothing against the limits.

## DEC-4 — Chunks

- **Splitting:** the chapter is split **at article headings** (002.5a
  DEC-7) into chunks of at most 40 000 characters, and never longer than
  the route's advertised `structuredOutput.maxTextLength`.
  - A local model with a 32 k-token window holds 40 000 characters of French
    (≈ 10–12 k tokens) plus the schema and the answer.
  - Lyon's UCe1 (59 894 characters) is two chunks.
- **Offsets:** each chunk keeps its base offset into the chapter, so 096.7's
  offsets map back to the chapter and from there to a page.
- **One call per chunk:** each chunk is one 096.7 call under its single
  deadline, and the results are merged. A chunk's `constraint` is recorded;
  the result's `model.constraint` is the weakest across chunks.
- **Duplicates:** two rules with the same kind, sector, limit and normalised
  passage are one.
- **Failures:** a chunk that fails (`output_truncated`, `output_invalid`,
  `provider_error`) is retried once. A second failure marks the chunk failed
  and the result partial (`chunks.failed`).

## DEC-5 — Choosing a passage's occurrence (multi-occurrence)

096.7 returns the first occurrence and a count. When `occurrences > 1`:

1. Find every occurrence in the chunk under 096.7's normalisation.
2. Keep the occurrence whose **nearest sector heading before it** (002.5a
   DEC-7) names the rule's `sector` by the normalised comparison. Record
   `chosenBy: 'sector-heading'`.
3. With no `sector`, or if no occurrence or several match, keep the first.
   Set `confidence: 'low'` and `chosenBy: 'first'`.

`page` and `article` follow the chosen occurrence.

**The heuristic's limits** (stated at the 002.5b review): a sector heading is
a line that opens on « (a.) Dans le secteur X », « En secteur X », or a list
item naming one (002.5a's text, `sectors[].heading`). A sector named only
mid-sentence, a heading in a table, or a list item that ends long before the
passage are not seen, or are seen too long: the nearest such line before the
passage is taken, however far. When it misleads, the occurrence is `first`
and the confidence `low`, or the condition window is too wide — never a
silent change of sector.

## DEC-6 — The rule schema (`schemaVersion: 1`)

The item schema sent to 096.7 is strict-shaped (its DEC-2):

```json
{ "type": "object", "additionalProperties": false,
  "required": ["kind", "sector", "statement", "limit", "conditions", "exceptions", "confidence"],
  "properties": {
    "kind": { "enum": ["road_setback", "boundary_setback", "building_distance",
      "footprint_ratio", "floor_area_max", "extension_max", "annex_max",
      "height_total", "height_facade", "green_ratio", "parking", "other"] },
    "sector": { "type": ["string", "null"], "maxLength": 40 },
    "statement": { "enum": ["limit", "not_regulated", "see_graphic", "described"] },
    "limit": { "anyOf": [
      { "type": "null" },
      { "type": "object", "additionalProperties": false,
        "required": ["kind", "comparison", "value", "unit"],
        "properties": { "kind": { "const": "value" }, "comparison": { "enum": ["min", "max"] },
          "value": { "type": "number", "minimum": 0 }, "unit": { "enum": ["m", "m2", "percent"] } } },
      { "type": "object", "additionalProperties": false,
        "required": ["kind", "comparison", "percent", "base"],
        "properties": { "kind": { "const": "ratio" }, "comparison": { "enum": ["min", "max"] },
          "percent": { "type": "number", "minimum": 0, "maximum": 100 },
          "base": { "enum": ["plot_area", "emprise", "surface_de_plancher", "existing_emprise", "other"] } } },
      { "type": "object", "additionalProperties": false,
        "required": ["kind", "reference", "factor", "offsetMetres", "minimumMetres"],
        "properties": { "kind": { "const": "height_relative" },
          "reference": { "enum": ["altitude_difference", "facade_height"] },
          "factor": { "type": "number", "minimum": 0 },
          "offsetMetres": { "type": ["number", "null"] },
          "minimumMetres": { "type": ["number", "null"], "minimum": 0 } } } ] },
    "conditions": { "type": "array", "maxItems": 6, "items": { "type": "string", "maxLength": 400 } },
    "exceptions": { "type": "array", "maxItems": 6, "items": { "type": "string", "maxLength": 400 } },
    "confidence": { "enum": ["high", "medium", "low"] } } }
```

- **`kind`** is the proposal § 8 list, unchanged, which is the SDK's
  `REGULATION_RULE_KINDS`.
- **`statement`** takes the SDK's four words (`REGULATION_STATEMENTS`, since
  096.2's reconciliation). `height_relative`'s `reference` and offset map
  to the SDK's `reference` and `offset` (002.6b DEC-4).
- **Post-validation (coherence),** after 096.7 answers. Each failure drops
  the item and counts it under `dropped.incoherent`:
  - `statement: 'limit'` requires a non-null `limit`.
  - `not_regulated` and `see_graphic` require `limit: null`.
  - `described` requires `limit: null` (002.6b builds the `described` limit
    from the passage).
  - Units must fit the kind:
    - `height_*`, `*_setback` and `building_distance` take `m` or
      `height_relative`;
    - `floor_area_max` and `annex_max` take `m2`, or a ratio;
    - `footprint_ratio` and `green_ratio` take `percent` or a ratio;
    - `extension_max` takes `m2`, `percent` or a ratio.
- **Comparison against `MINIMUM_KINDS`** (the package's set: the setbacks,
  `building_distance`, `green_ratio` are floors; the rest are caps). A
  `value` or `ratio` whose `comparison` disagrees is kept, with
  `confidence: 'low'`. A reversed comparison is what a person must see.
- **Conditions and exceptions must be verbatim within a window.** Each is
  checked, under 096.7's normalisation (copied, its DEC-3), against the text
  from the **chosen occurrence's sector heading** (or 1 500 characters
  before the passage, whichever is nearer) to the passage's end. One that is
  not found there is dropped and counted under `conditionNotVerbatim`.
  - A condition found anywhere in the chunk would let « Dans le secteur
    UCe1b » pass for any sector.
- **`sector`:** an item whose `sector` names neither a sector heading of the
  chapter nor null is kept, with `sectorUnplaced: true`.
- **`confidence`** is the model's, lowered by DEC-5 and by the comparison
  check. It is shown and never used to confirm.

## DEC-7 — The instructions (`promptVersion: 1`)

A fixed, French-aware text in `src/extract.mjs`, versioned and recorded in
the result. It:

- defines each `kind` in a line and says what `statement` means;
- asks for one item per rule per sector, with the sector's name as the text
  writes it;
- asks for "not regulated" statements to be returned, never omitted;
- asks for the unit as written (never converted) and for no computation;
- asks for one contiguous quotation as `passage`.

A change of wording raises `promptVersion`, which changes the cache key and
is recorded in the fixtures.

## DEC-8 — Limits (Q44, accepted 2026-10-20)

| What | Limit | Variable | Keyed by |
| --- | --- | --- | --- |
| Starting an extraction (a model call; a cache hit or a join is free) | 6 per hour, 20 per day | `FR_URBAN_RULES_LIMIT_EXTRACT_HOUR`, `…_EXTRACT_DAY` | `X-Authenticated-User` (096.8a), else the address, logged |
| `refresh=1` | 2 per day | `FR_URBAN_RULES_LIMIT_REFRESH_DAY` | same |
| Status polls, cached reads | 002.5a's 60 per minute | `FR_URBAN_RULES_LIMIT_READ_MINUTE` | same |
| Extractions running | **1**; queue ≤ 10; beyond → `503 busy` with `Retry-After` | — | the service |

- **Over a limit:** `429 rate_limited`, with `Retry-After`.
- **Storage:** the counts live in memory.
- **The document fetch** a job triggers counts against 002.5a's fetch
  limit, unless the text is cached.
- **These are the only bound on model spend.** 096.7's limits cap a call's
  size, not how many calls are made. A job makes at most `chunks × 2` calls
  (one retry each), and the chunk count is capped by 002.5a's 80-page
  chapter.

## DEC-9 — Containment, logging

- **Prompt-injection containment, in layers:**
  1. 096.7 fences the text with a nonce, uses no tools and no context,
     validates values against the schema and checks passages verbatim.
  2. Here:
     - conditions and exceptions are checked verbatim within a window;
     - coherence is checked (DEC-6);
     - `page` and `article` come from offsets;
     - the occurrence is chosen by sector (DEC-5);
     - the chapter is chosen by 002.5a, never by the model;
     - an unplaced sector is flagged.
  3. 002.6b shows every rule `to_confirm`, with passages as `{ text, lang:
     'fr' }`, never as HTML.
  4. The person confirms or does not.
- **What these layers do not stop:** a passage that exists but does not
  support the value. That is why layer 4 exists, and why the result never
  says "verified".
- **Logging**, as 002.5a DEC-9, plus:
  - logged: chunk counts, item and drop counts, 096.7's codes, provider and
    model;
  - never logged: a passage, a value, a condition or a chunk's text.

## DEC-10 — Codes (this sprint's, beside 002.5a DEC-11)

| Code | Status | Meaning |
| --- | --- | --- |
| `not_cached` | 404 | no result in the cache |
| `busy` | 503 | the queue is full |
| `extraction_unavailable` | 503 | ai-service lacks `structured-output`, or answers `no_provider_configured`; checked before any fetch |
| `extraction_failed` | 502 | every chunk failed; 096.7's codes are listed in the message |

A job's `error` carries any code of either sprint.

## DEC-11 — Recording one live answer (Q40, accepted 2026-10-20)

- **`tools/record-fixtures.mjs <plot> --extraction`:**
  - It runs the service in-process against the live hosts and the
    deployment's configured provider (Q40).
  - It writes `test-fixtures/fr-urban-rules/<plot>/extraction/`:
    - each 096.7 request's metadata (no key);
    - each 096.7 response, verbatim;
    - `result.json`.
  - `--check` reports the differences without writing.
- **This sprint records Lyon once,** so that its own criterion 7 and
  002.6b's fixtures do not wait for 002.9. 002.9 adds Gordes and more
  plots.

---

# Steps

1. **Extraction pipeline:** chunks (DEC-4), occurrence choice (DEC-5),
   schema and post-validation (DEC-6), instructions (DEC-7). Tested against
   a fake 096.7 built from 096.7 DEC-12's wire example.
2. **Jobs and result cache** (DEC-1, DEC-3), joining, `cachedOnly`.
3. **Limits and logs** (DEC-8, DEC-9).
4. **`record-fixtures.mjs --extraction`** (DEC-11), then one live Lyon run,
   recorded.
5. **README:** the new routes, limits and variables.

# Acceptance criteria

1. **Lyon is sent as two chunks** of at most 40 000 characters, split at
   article headings. 096.7's offsets map back to chapter pages (test with a
   recording fake).
2. **Conditions:**
   - A condition the fake model paraphrases is dropped and counted under
     `conditionNotVerbatim`.
   - A verbatim condition is kept.
   - A verbatim « Dans le secteur UCe1a » attached to a passage under the
     UCe1b heading is dropped (outside the window).

   (tests)
3. **Occurrence choice.** A passage occurring under both UCe1a and UCe1b
   headings, with `sector: 'UCe1b'`, gets the page and article of the UCe1b
   occurrence and `chosenBy: 'sector-heading'`. With `sector: null` it is
   the first occurrence, with `confidence: 'low'` (test).
4. **Coherence.** `statement: 'limit'` with `limit: null`, `not_regulated`
   with a limit, and `height_total` in `m2` are each dropped and counted
   under `incoherent`. A `boundary_setback` with `comparison: 'max'` is
   kept, with `low` confidence (tests).
5. **Joins and cache.**
   - A second `POST` for the same key while the first runs joins it (one
     fake call).
   - A `POST` after it ends answers `200` from the cache with no fake call.
   - A `POST` for UCe1a after one for UCe1b uses the same entry (one call).

   (tests)
6. **`cachedOnly`.**
   - It answers `not_cached` without fetching when the document's text is
     not cached.
   - It answers `{ result, current }` when it is.
   - A result made with provider `openai` read while health's default is
     `ollama` carries `current.providerId: 'ollama'`.

   (tests)
7. **The recorded Lyon answer** yields `boundary_setback` UCe1b `min 4 m`,
   `footprint_ratio` `not_regulated` and `height_facade` `see_graphic`,
   each with page and passage (fixture test, values from step 4's
   recording).
8. **Extraction limits.** The seventh extraction start within an hour for
   one user answers `429` with `Retry-After`. A cache hit and a join do not
   count, and another user is not affected (tests).
9. **Logs.** No log line contains a passage, a chunk's text or a raw user
   name (test).
10. **Unavailable extraction.** With `structured-output` absent from
    `/api/ai/health`, a `POST` answers `202`, and the job fails with
    `extraction_unavailable` before any fetch (test).

# Testing strategy

- **Unit:** fakes of 096.7 and of 002.5a's document cache. No network.
- **Fixtures:** 002.5a's recorded text, and this sprint's recorded Lyon
  extraction.
- **Manual:** one live Lyon extraction through the image behind 096.8a's
  local override.

# Risks

- **Model quality on local providers.** A small model returns fewer items
  and more rejections. `partial`, the counts and the low confidences say
  so; nothing is invented.
- **Part I carries the definitions.** A zone chapter read alone misses
  « hauteur* » as Part I defines it. Conditions keep the `*` words
  verbatim, and the user reads the lexicon (Question 2).
- **Repeated sentences.** DEC-5 handles a sentence repeated across sectors;
  an occurrence it cannot place is `low`.
- **A model change changes passages,** and with them 002.6b's rule keys.
  The provider is recorded, and 002.6b says when a confirmation no longer
  matches.

# Questions for the owner

1. ~~Limits: six model-backed extractions per user per hour, 20 per day?~~
   **Answered 2026-10-20: accepted**, each a variable (Q44).
2. **Part I (common provisions):** also extract Part I's chapter 2 as a
   second pass? Recommended: not here. Record it as a 002.9 finding if
   Lyon's expectations need it (Q43).

# Definition of Done

- The criteria are walked against the code.
- The Design Contract boxes are checked.
- `node --test 'services/*/tests/*.test.mjs'` is green.
- One live Lyon extraction is recorded.
- The README lists the routes, the limits and the variables.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| **002.5a** | The gateway, the document cache and key, the chapter and its page-offset index, the article and sector headings, the fetch limit, the codes |
| **096.7** | `POST /api/ai/extract`; `structured-output` and `structuredOutput.maxTextLength` on health; the error codes; the wire example; the normalisation to copy |
| **096.8a** | `ARCHISIMPLE_AI_SERVICE_URL`, `X-Authenticated-User` |

**Version needs:**

- `fr-urban-rules-service` **0.2.0**, wire contract `v1`, `schemaVersion`
  1, `promptVersion` 1.
- ai-service contract **≥ 1.2.0** with `structured-output`.
- No SDK or file version.

# Corrections to the README / proposal

1. **Proposal § 8, `PlanningRule.limit`:** `height_relative {factor,
   minimum?}` cannot hold « R ≥ Hf − 4 m, min 2 m » or « D ≥ Hf/2 ». The
   schema carries `reference` and `offsetMetres`, and the SDK's
   `RegulationLimit` carries `reference` and `offset` (096.2's
   reconciliation).
2. **Proposal § 8** has no way to say "not regulated" or "see the graphic
   document" as a rule. The schema's `statement`, the SDK's
   `RegulationRule.statement`, does.
3. **002.9 DEC-2:** the extraction recording is this sprint's
   (`record-fixtures.mjs --extraction`, DEC-11). 002.9 extends it.

# Review (2026-10-20, Phase 2)

An independent pre-implementation review of the 002.5 draft. The
coordinator's decisions were taken on the owner's behalf and applied here.

- **Split:** extraction is this half; 002.5a holds the gateway and the
  document text.
- **B2: the result key** is (document key, chapter pages, schemaVersion,
  promptVersion). Provider and model are stored inside the result, because
  health carries no model name and a key holding it could not be formed for
  `cachedOnly`. `current` lets 002.6b offer "Extract again" when the
  provider or a version differs (DEC-1, DEC-3).
- **S6: occurrences.** A passage occurring more than once takes the
  occurrence under the matching sector heading, else `low` confidence.
  Conditions are checked within a window before the passage (DEC-5,
  DEC-6).
- **S9: coherence.** Post-validation checks statement, limit and unit, and
  compares `comparison` with `MINIMUM_KINDS` (DEC-6).
- **S10: zone removed** from the extraction key (DEC-3).
- **S14:** this sprint records one live Lyon answer itself, through a new
  `record-fixtures.mjs --extraction` mode (Q40), under
  `test-fixtures/fr-urban-rules/` (DEC-11). The circular dependency on
  002.9 is gone.
- **096.8 → 096.8a.**
- **096.7's review mirrored:** `constraint` means requested and not refused
  (the weakest across chunks is recorded); there is one deadline per call;
  and spend is bounded by this sprint's limits, not 096.7's (DEC-4, DEC-8).
- **NITs:** a joined or cached request costs nothing; limits are named
  variables; fetch and chapter codes are a job's error, not the `POST`'s.

# Outcome (2026-10-20)

## What landed

`services/fr-urban-rules-service` **0.1.0 → 0.2.0** (package and lockfile):

- `src/ai-client.mjs`: health (`structured-output`, `defaultProviderId`,
  `structuredOutput.maxTextLength` / `maxItems`) and `POST /api/ai/extract`
  with only the fields 096.7 allows (`instructions`, `text`, `itemSchema`,
  `maxItems`); an error answer's `error.code` becomes an `AiError`.
- `src/normalise.mjs`: 096.7's DEC-3 normalisation, copied (with the review's
  zero-width characters), and every-occurrence search.
- `src/extract.mjs`: `SCHEMA_VERSION` 1, `PROMPT_VERSION` 1, DEC-6's
  `ITEM_SCHEMA` verbatim, DEC-7's instructions, chunking at article headings,
  one retry per failed chunk, occurrence choice (DEC-5), the condition window,
  coherence and the comparison check (DEC-6), unplaced sectors, duplicates,
  the weakest `constraint`.
- `src/jobs.mjs`: the job queue (1 running, 10 waiting, `503 busy`), states
  and progress, joins (by request before the chapter is known, by result key
  after), the result cache key (DEC-3), `cachedOnly`, the charge and its
  refund, the job log line.
- `src/cache.mjs`: one byte budget across `documents/` and `extractions/`
  (`openCaches`); 002.5a's `openDocumentCache` kept as a wrapper.
- `src/service.mjs`: the three routes; every request takes the read limit.
- `src/limits.mjs`: the extract hour/day and refresh-day limits, `refund`,
  and two tuning variables (deviation 3).
- `src/text.mjs`: sector **headings** told from sector mentions (deviation 4).
- The gateway now hands a POST body (≤ 4 KiB, chunked or not) to the service
  as text; larger is 400.
- `tools/record-fixtures.mjs <plot> --extraction [--check]` (DEC-11).
- Fixtures: `test-fixtures/fr-urban-rules/lyon/extraction/{calls.json,result.json}`
  (the live recording); `test-fixtures/fr-urban-rules/ai-service/extract-wire.json`
  (096.7's wire example, copied).
- README: the routes, the codes, the limits and the variables.

## Gates

- `node --test 'services/*/tests/*.test.mjs'`: **108/108** on Node 24.18.0 and
  on Node 22.13.0.
- `fr-urban-rules`: 215/215; `sh3f-importer`: 99/99.
- `build-index` (scratch folder): 2 packages; `check-index`: 2 of 2 accepted;
  nothing under `services/`.
- **Live recording** (`tools/record-fixtures.mjs lyon --extraction`): the
  local ai-service (platform `apps/ai-service`, `dist/`, unchanged) on
  LM Studio, model `qwen/qwen3-vl-8b`, `constraint: schema`;
  `FR_URBAN_RULES_EXTRACT_CHUNK_CHARS=8000`, `…_MAX_ITEMS=30`. Lyon UCe1
  (zone UCe1b, chapter 121–144, `prefix`): 9 chunks, none failed, 234 s,
  34 rules, dropped `passageNotFound: 3`, `incoherent: 1`.
- **Live walk through the gateway** (a fresh data folder, real GPU, the same
  ai-service): `cachedOnly` before → `404 not_cached` with `current
  { providerId: 'lmstudio', 1, 1 }`; `POST` (alice) → `202 queued`; a second
  `POST` (bob) → the same `jobId` (joined); polls every 20 s walked
  `fetching → extracting 1/9 … 9/9 → done` in 187 s, 18 rules, 9 chunks, none
  failed; `POST` for **UCe1a** → `200 done` from the cache; `cachedOnly` for
  UCe1a → `{ result, current }`. The gateway's log held no regulation text
  (`grep` for « retrait » and « réglement »: 0).
- Not run: the walk through the image behind 096.8a's override (no Docker).

## Acceptance criteria, walked

1. **Met.** `extract.test.mjs` "Lyon UCe1 is sent as two chunks…": two
   chunks ≤ 40 000, the second starting at an article heading, concatenating
   to the chapter; the fake's offsets map back to page 126, article
   `2.2.1.2`.
2. **Met.** "conditions: verbatim kept, paraphrased dropped, another
   sector's heading outside the window dropped": « Dans le secteur UCe1b »
   kept; a paraphrase, « Dans le secteur UCe1a » and an absent exception
   counted (`conditionNotVerbatim: 3`).
3. **Met.** "a passage under both sector headings takes the occurrence of
   its sector" (p. 11, article 2.3, `chosenBy: 'sector-heading'`) and "with
   no sector, the first occurrence, at low confidence".
4. **Met.** "coherence: …": `limit` without a limit, `not_regulated` with
   one, `height_total` in `m2` → `incoherent: 3`; a `boundary_setback` `max`
   kept at `low`.
5. **Met.** `jobs.test.mjs` "joins and the cache…": a second POST joins
   (same `jobId`, one call); a later POST is `200` with no call; `Ast`
   (zone A's chapter, as UCe1a is UCe1b's) is `200` from the same entry;
   `refresh=1` calls again. Also live (above).
6. **Met.** "cachedOnly never fetches…": `not_cached` with no fetch; then
   `{ result, current }`; a result from `openai` read under `ollama` carries
   `current.providerId: 'ollama'`.
7. **Partly met — the recording decides.** `recorded.test.mjs`: the recorded
   answer holds `boundary_setback` UCe1b `min 4 m` (p. 126, « Le retrait* est
   au moins égal à 4 mètres. ») and `footprint_ratio` `not_regulated`
   (p. 128). **It holds no `height_facade` `see_graphic`**: the model
   returned the `see_graphic` statement for the footprint's « coefficient
   d'emprise au sol … figure aux documents graphiques » (also p. 128, and a
   right reading) and missed the façade height's. The test asserts what was
   recorded and says so. A replay test feeds the recorded 096.7 answers back
   through the pipeline and gets the recorded result exactly.
8. **Met.** "the seventh extraction start in an hour is 429 with
   Retry-After; hits, joins and other users are free", plus "a job that never
   calls a model gives its charge back" and "refresh=1 is limited to two a
   day".
9. **Met.** "no log line holds a passage, a condition, a chunk's text or a
   raw user name"; live, the gateway's log held none.
10. **Met.** "without structured-output, the POST is 202 and the job fails
    extraction_unavailable before any fetch" (no fetcher call).

## Deviations

1. **A slow local model does not fit 40 000-character chunks.** The first
   live run sent a 38 839-character chunk to `qwen/qwen3-vl-4b`; ai-service
   aborted it at **301 s** (`provider_error`, "This operation was aborted":
   the provider call's own 5-minute limit, below `AI_SERVICE_REQUEST_TIMEOUT_MS`
   — a platform observation, not changed here). The 4 B model also returned
   **no items** on 4 000 and 8 000-character chunks; the 8 B model returned
   items but repeated one 60 times on 8 000 characters (170 s). So:
2. **Two tuning variables**, not in DEC-8: `FR_URBAN_RULES_EXTRACT_CHUNK_CHARS`
   (default and ceiling 40 000) and `FR_URBAN_RULES_EXTRACT_MAX_ITEMS`
   (default 120, ceiling 200). Neither raises a bound; the recording used
   8 000 and 30.
3. **Results vary run to run** with this model: the recording has 34 rules,
   the walk 18; the walk labelled the 4 m setback `road_setback`. Nothing here
   corrects a label (the person confirms, 002.6b); the confidence and counts
   say what they can.
4. **Sector headings** (DEC-5's "nearest sector heading"): 002.5a recorded
   every « secteur X » mention, including mid-sentence ones (« moins profonde
   en secteur UCe1a qu'en secteur »). A heading is now a line that opens on
   the sector (« b. Dans le secteur UCe1b ») or a list item naming one
   (« - 17 mètres dans le secteur UCe1a »), at most 120 characters
   (`sectors[].heading`, `lineStart`).
5. **`article` is the nearest heading** (`2.2.1.2` in the recording, where
   DEC-2's example says `2.2.1`), as 002.5a's Outcome deviation 5 found.
6. **`dropped` has a fifth counter, `overLimit`** (096.7's `over-limit`
   rejection), beside the four of DEC-2; 096.7's `passage-too-short` and
   `passage-too-long` count as `passageNotFound`.
7. **A rule carries `offset { start, end }`** in the chapter text, beside
   `page` and `article`, and `occurrence.chosenBy` is `only` for a single
   occurrence.
8. **The comparison check skips `other`** (its direction is unknown); for
   `parking` it applies the package's "cap", so a minimum number of places is
   `low` — as the recording shows. Coherence accepts any limit for `parking`
   and `other`, so « 4 m » under `parking` passes (seen live).
9. **The model writes `"null"` as a sector** (a string) once; it is kept and
   flagged `sectorUnplaced`, never repaired.
10. **The extraction charge** is taken at the POST and refunded when the job
    ends without a model call (a result found after fetching, a failed fetch,
    `extraction_unavailable`), so criterion 8's 429 is the POST's answer.
11. **`extraction_failed` lists `codes`**; a failed chunk's codes are also
    logged. `no_provider_configured` from 096.7 is the job's
    `extraction_unavailable`.
12. **The gateway accepts a request body** now (≤ 4 KiB), which 002.5a
    refused; a chunked one is read under the same cap.
13. **The extraction cache is a second namespace of 002.5a's cache** with one
    shared byte budget, `extractions/<key>/meta.json` holding the result.
14. **Not done:** the image walk (no Docker).

## Questions for the owner

1. **The local model.** `qwen/qwen3-vl-8b` gives usable but unstable
   candidates in about 3–4 minutes for Lyon UCe1 with 8 000-character chunks;
   the 4 B model gives none. Which model, and which chunk size, should the
   owner's deployment use? (`FR_URBAN_RULES_EXTRACT_CHUNK_CHARS` and the
   provider's model are the knobs.)
2. **ai-service's 5-minute provider cut-off** (observed at 301 s whatever
   `AI_SERVICE_REQUEST_TIMEOUT_MS` says) — a platform finding for 096.7's
   owner; not changed here.
3. Part I (Question 2 above) stays open.

# Review fixes (2026-10-20)

An independent review; fixed the same day, uncommitted. Decisions taken by
the coordinator on the owner's behalf are marked **(OD)**. They supersede the
Outcome above where the two differ.

- **B1.** `health()` reports `available` only for an integer
  `structuredOutput.maxTextLength` of at least 1 000; `splitChunks` throws a
  `RangeError` on a size that is not a positive integer. Tests.
- **B2.** A cut at a line end looks before the limit (`lastIndexOf('\n',
  limit - 1)`), so a chunk never exceeds it, and a hard cut never splits a
  surrogate pair. Tests (100 « a », a newline, 150 « b », size 100; an emoji
  at the limit).
- **S1 — deterministic checks in `placeItem`.** Every number a limit claims
  (a value, a ratio's percent, `minimumMetres`, `|offsetMetres|`) must be
  written in the chosen passage — « 1 500 » and « 1,5 » read as one number,
  and a digit inside a word (« m2 », « UCe1b ») as none — else `low`
  confidence and `dropped.valueNotInPassage`. `not_regulated` needs
  « réglementé », « règlementé » or « sans objet » in the passage, and
  `see_graphic` « graphique », else the rule is dropped under `incoherent`.
  (The review's pattern `r[ée]glement` missed Lyon's « règlementées »: it
  would have dropped ten `parking` `not_regulated` rules; `è` is accepted.)
- **S2.** No comparison check for `parking` (as for `other`).
- **S3.** A sector written « null », « none », « aucun », « n/a » or empty
  (trimmed, any case) is `null` before placement; the instructions say "JSON
  null".
- **S4.** A rule that lost a condition or an exception is `low`, counted
  under `dropped.droppedConditions`.
- **S5 (OD).** A result with `chunks.failed > 0` is answered to its job and
  **never cached**: partial results are not shared. A `refresh=1` replaces the
  shared result **for everyone** (README).
- **S6.** An unexpected exception is `internal_error` (500), its name alone
  logged; the client refuses an answer whose item lacks a `value` object or a
  `passage` object with text, integer offsets and count (`malformed`).
- **S7.** A job is charged only once a model has **answered** (`onAnswer`);
  one stopped by `no_provider_configured` gives its charge back. Test.
- **S8 (OD).** `X-Authenticated-User` over 128 characters is `400`. The
  gateway's header comment says only the deployment's proxy may reach it (no
  published port; it binds where the deployment says); **no shared secret**
  for now.
- **NITs.** An oversized body (chunked or not) is no longer drained: reading
  pauses, the 400 goes out with `Connection: close`, and the socket is
  destroyed after it. An unknown or non-string body field is
  `{ field: 'body' }`. Kept conditions and exceptions are **slices of the
  source** (the text's spelling, not the model's); under 4 normalised
  characters is not a condition. DEC-5 states the sector-heading heuristic's
  limits. The instructions add "if a rule fits no kind, use other" and "the
  band of constructibility is not a setback": **`PROMPT_VERSION` 2**. A refund
  gives back the job's **own** take (`take` answers its timestamp). The cache
  swaps an entry (old aside, new in, old removed) and a read retries once
  before calling an entry damaged. `test-fixtures/fr-urban-rules/ai-service/normalise-vectors.json`
  — twelve inputs normalised by the platform's own `normaliseText` (from its
  build) — is asserted here against the copy.

## The recorded Lyon answer, replayed

Not re-recorded live. The 9 recorded 096.7 answers (`calls.json`, sent with
`promptVersion` 1) were replayed through the new post-validation and
`result.json` rewritten (`replayedAt`, `replayNote`; its `promptVersion`
stays 1, the instructions that were sent). **34 rules → 32**:

- **2 removed** (`incoherent`): `green_ratio` `not_regulated` for the
  « équipements d'intérêt collectif » sentence, which says « ne leur est pas
  applicable », not « réglementé »; and `height_total` `not_regulated` on the
  « UNESCO » OAP sentence, which says neither.
- **9 changed**: 4 rules whose sector was the string « null » are now `null`
  and no longer `sectorUnplaced` (`annex_max`, `other`, two
  `footprint_ratio`); 1 `green_ratio` (« Une végétalisation intensive est à
  privilégier », claimed `min 1 percent`) went `high → low`
  (`valueNotInPassage`); 4 `parking` rules (Da, Dab, Db, Dc) keep their
  exception, now as the source's slice (line breaks kept) rather than the
  model's re-spacing.
- **23 unchanged.** `dropped`: `incoherent` 1 → 28 (every repeated copy of
  a rejected item counts), `valueNotInPassage` 14 — the `green_ratio`
  above and 13 `parking` rules claiming `1 m2` or `0 m2` that their passages
  never write; those 13 were `low` before by the comparison check S2 removed,
  and stay `low` by this one,
  `droppedConditions` 0.
- Criterion 7's facts hold: `boundary_setback` UCe1b `min 4 m` p. 126,
  `footprint_ratio` `not_regulated` p. 128, `footprint_ratio` `see_graphic`
  p. 128.

## Gates, again

- `node --test 'services/*/tests/*.test.mjs'`: **123/123** on Node 24.18.0
  and on Node 22.13.0.
- `fr-urban-rules`: 215/215; `sh3f-importer`: 99/99.
- `build-index` (scratch folder): 2 packages; `check-index`: 2 of 2 accepted.
- No gateway or ai-service process started by this sprint is running (the
  ai-service on :4391 and the gateway on :4599 were stopped after the walk;
  the ai-service on :4998 found running belongs to another session and was
  left alone).

# Follow-up (2026-10-20): long extract calls

The 301 s cut of the first live run (Outcome, deviation 1) was undici's: Node's
`fetch` gives up when no response headers have come within 300 s
(`UND_ERR_HEADERS_TIMEOUT`), whatever the caller's own timeout. The platform
fixed its provider side the same day (`apps/ai-service/src/providers/provider-fetch.ts`);
this service's side is fixed the same way, in `src/ai-client.mjs`:

- The **extract call** goes through an undici `Agent` with `headersTimeout: 0`
  and `bodyTimeout: 0`, made once per process from the constructor of the
  global dispatcher (`Symbol.for('undici.globalDispatcher.1')`); if that is
  not a plain `Agent`, the runtime `fetch` is used and a warning is logged
  once. Health calls keep the default (5 s).
- Its one bound is **`FR_URBAN_RULES_EXTRACT_TIMEOUT_MS`**, default **30
  minutes**, never below 120 s (096.7's default deadline); the README says to
  keep it at least ai-service's `AI_SERVICE_REQUEST_TIMEOUT_MS`.
- **Test** (`tests/ai-client-timeout.test.mjs`): with the global dispatcher's
  header limit lowered to 300 ms and a server answering after 1.5 s, a plain
  `fetch` fails and the client's extract call completes; with a bounded
  dispatcher passed in, the same call fails `unreachable`; the variable's
  default, value and floor.
- Gates: `node --test 'services/*/tests/*.test.mjs'` **126/126** on Node
  24.18.0 and on Node 22.13.0. Question 2 of the Outcome (the 5-minute
  cut-off) is answered by the two fixes.
