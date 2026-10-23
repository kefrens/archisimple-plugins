# Sprint 002.5a — Service Gateway and Document Text

> **Status:** **Closed (2026-10-22)** — committed, deployed to the NAS and
> closed by the owner with
> [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md) Phases
> 0–3 and the platform's Site Regulations milestone ("you can close phase3. it works for the moment and has been deployed to the NAS").
> As it read before the close: **Implemented (2026-10-20), uncommitted.** Gateway 0.1.0 and
> `fr-urban-rules-service` 0.1.0 in `services/`; `GET v1/chapter` answers Lyon
> UCe1 (PDF pp. 121–144) and Gordes A (pp. 44–51) live. **Not done:** the
> image was not built or walked behind 096.8a's override (no Docker on this
> machine). See the Outcome at the end. Split from the 002.5 draft of
> 2026-10-19 by the Phase 2 review (below).
>
> **Version:** 1.1
>
> **Repository:** `archisimple-plugins`. A new folder, `services/`, holds the
> gateway (`services/gateway`, ADR-0114 Rule 3) and the first companion
> service, `services/fr-urban-rules-service`. Both start at **0.1.0**. The
> package `fr-urban-rules` does not change here; 002.6a is its first consumer.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 5.2 item 2 (written rules), § 7.3 option C, § 11.2. Platform:
> [Site Regulations](../../../archisimple/docs/milestones/site-regulations/README.md)
> Phase 2.
>
> **Prerequisites (platform, archisimple):** **096.8a** (ADR-0114: the
> `plugin-services` container slot, the `/plugins-api/<package id>/` route,
> `X-Authenticated-User`, `ARCHISIMPLE_AI_SERVICE_URL`, the health shape, the
> dev proxy, the local TLS override). **No 096.7**: nothing in this sprint
> calls a model; 002.5b does. D6 was confirmed on 2026-10-20 (option C).
>
> **Sizes:** two Node programs, one runtime dependency (`pdfjs-dist`), a
> Dockerfile, recorded fixtures. No platform change. Medium.

> **This is the first server-side code in this repository.** Until now every
> folder has been a package evaluated in the browser. A service is not a
> package: it is never zipped, never installed and never loaded into the
> editor (ADR-0114 Rule 1). DEC-1 says where a service lives, so that neither
> the Development Repository nor `tools/build-index.mjs` mistakes it for a
> package.

---

# Sprint Design Contract

- [x] **Two hosts, nothing else.** The service fetches only
      `https://www.geoportail-urbanisme.gouv.fr/api/document…` and
      `https://data.geopf.fr/annexes/gpu/documents/…`. No URL comes from a
      client. Every redirect hop and every resolved address is checked
      (DEC-4).
- [x] **No model key, no model call.** The container's environment has no
      `AI_PROVIDER_*`, and the code reads no key (ADR-0114 Rule 7). Nothing
      in this sprint calls `ai-service`.
- [x] **Bounded.**
  - A download is at most 32 MiB, counted while streaming (the PDF host
    sends no `Content-Length`).
  - A document is at most 2 000 pages; a chapter at most 80 pages.
  - The cache is at most 2 GiB.
  - Parsing runs in a child process with its own memory cap (DEC-2).
  - Document fetches are limited per user (DEC-8).
- [x] **A failure is named.** Every outcome is a state or a code from
      DEC-11. "No chapter found" is never "no rules".
- [x] **France stays here.** Nothing French is added to archisimple. The
      platform sees a route prefix and a health shape.

---

# Current state

## What exists

- **002.0** (implemented, 0.1.0 → 0.4.0 uncommitted) resolves the regulation
  link:
  - It reads `zone-urba.nomfic`.
  - It lists documents with
    `api/document?partition=<p>&status=document.production`, matching
    `originalName` to `idurba` case-insensitively (`index.js:619`,
    `resolveLink`).
  - It then checks `/document/{id}/files` for `nomfic`.

  It opens the link at the PDF's first page (002.0 DEC-7) and never
  downloads the PDF.
- **No server code** exists in this repository. `tools/` holds
  `build-index.mjs`, `check-index.mjs` and `record-fixtures.mjs`.
- **Recorded fixtures** live in `test-fixtures/fr-urban-rules/<plot>/`
  (002.0's review moved them out of the package), and `record-fixtures.mjs
  <plot> [--check]` re-records them (002.4 DEC-4).
- **The platform** will route `/plugins-api/<package id>/` to a
  `plugin-services` container (096.8a).

## Two places a service must not live

- **`<repo>/<folder>/package.json`.** The Development Repository treats every
  immediate subfolder that holds a `package.json` as a package
  (`archisimple/apps/web/src/resources/developmentRepository.ts`,
  `findPackageRoots`, "deliberately one level deep"). It would report an npm
  manifest as a broken ArchiSimple one. `tools/build-index.mjs` lists only a
  folder whose `package.json` has an `id`; the editor makes no such check.
- **A root `package.json`.** The same function would then treat the whole
  repository as **one** package.

## Live probe (2026-10-19, read-only)

**From the proposal § 4:**

- The GPU API answers in about 0.2 s.
- `zone-urba.urlfic` is empty. The link is resolved
  `document?partition=` → `id` → `/document/{id}/files/{nomfic}`, which
  answers 302 to `data.geopf.fr/annexes/gpu/…`.
- `/document/{id}/details` sends no CORS header.
- `/document/{id}/download` is the whole package (**3.1 GB for Lyon**) and
  is never used.
- Store `idurba` **and** `datvalid` (Gordes has a 2022 zone under a 2024
  document).

**Probed for the 002.5 draft:**

| Fact | Lyon (PLUi `DU_200046977`) | Gordes (PLU `DU_84050`) |
| --- | --- | --- |
| `api/document?partition=<p>` | **20 entries, all `document.deleted`**; the one in force is **not on the first page** | — |
| `…&status=document.production` | exactly one: `4f3ddc27a9611b4bc94fa161443b8e86`, `200046977_PLUi_20260326` | one: `703e6c2a3130ed9396d8100fde318c2e`, `84050_PLU_20241017` |
| `/document/{id}/files` | **617** entries; `200046977_reglement_20260326.pdf`, « Règlement écrit » | 28 entries; `84050_reglement_20220411.pdf` (a 2022 file in the 2024 document) |
| `/files/{nomfic}` | `302` → `https://data.geopf.fr/annexes/gpu/documents/DU_200046977/<id>/<nomfic>` | same pattern |
| The PDF answer | `200`, `application/pdf`, **no `Content-Length`**, an ETag, `max-age=1814400` | same |
| Size, version | 11 059 057 bytes, PDF 1.7, 803 pages | 7 431 888 bytes, PDF 1.6, 60 pages |
| Outline | **53 entries**; Part I pp. 5–116; zones at depth 2: « Zone UCe1 » p. 121, « Zone UCe2 » p. 145 → **UCe1 = pp. 121–144**; no article entries | **none**; page labels `1, 2, …` |
| Contents page | — | PDF p. 2: « CHAPITRE I : REGLES APPLICABLES A LA ZONE A ……… 43 » (dot leaders are U+2026), « TITRE V … 51 » |
| Printed vs PDF page | printed 120 on PDF 122 (offset 2) | printed 43 on PDF 44 (offset 1) |
| Text layer | UCe1: **59 894 characters** over 24 pages, extracted in 128 ms | 154 030 characters over 60 pages |
| Opening | 45 ms (pdf.js 6.2.108, Node legacy build) | 24 ms |

What the UCe1 text holds is recorded in 002.5b (the shape its schema must
carry). The facts this sprint relies on:

- **An outline is not universal.** Gordes has none.
- **The zone's chapter is in the zone's own pages,** but its definitions are
  in Part I.
- **Running headers and footers** appear on every page.
- **Sector paragraphs** sit inside the zone's chapter.

---

# Goal

The service fetches a plot's règlement for its document from the two
official hosts only, and caches its text by document version. It finds the
zone's chapter by outline, contents page or heading, and prepares the
chapter's text with a page-offset index and article headings. It answers
`GET chapter`, which needs no model call. The gateway mounts it under its
package id, and the image runs behind 096.8a's container slot.

# Out of scope

- Model calls, extraction, jobs, extraction limits (002.5b).
- Showing anything (002.6a, 002.6b).
- OCR of a scanned règlement (`no_text_layer`).
- Part I (common provisions) and the lexicon (002.5b Question 2).
- Watching for new versions (002.10).
- Cartes communales and the RNU, which have no règlement to read.
- Any other country.

---

# Decisions

## DEC-1 — The folders

```text
archisimple-plugins/
  services/                         no package.json here: not discovered
    Dockerfile                      the plugin-services image (DEC-10)
    gateway/                        ADR-0114 Rule 3
      package.json                  npm manifest, "private": true, no "id"
      src/gateway.mjs               mounts every service by package id
      tests/gateway.test.mjs
    fr-urban-rules-service/
      package.json                  npm manifest; dependency: pdfjs-dist (exact)
      package-lock.json
      src/service.mjs               createService({ env, log, aiServiceUrl, dataDir })
      src/fetcher.mjs  src/document.mjs  src/parse-child.mjs
      src/chapter.mjs  src/text.mjs     src/cache.mjs   src/limits.mjs
      tests/*.test.mjs
      README.md                     hosts contacted, limits, logs, variables
test-fixtures/fr-urban-rules/<plot>/regulation/   recorded text (DEC-12)
```

- **Services sit two levels down.** The Development Repository looks one
  level deep, and `build-index.mjs` lists only folders whose `package.json`
  declares an `id`, so neither sees a package. `build-index.mjs` has no skip
  list, so none is added.
- **Plain ESM JavaScript, no build step,** following the repository's rule
  ("Write `.js`, not `.ts`").
  - Tests run with `node --test` and **globs**:
    `node --test 'services/*/tests/*.test.mjs'`. The directory form fails on
    Node 24 (002.0 deviation 1).
- **Node ≥ 22.13**, which is `pdfjs-dist` 6's `engines`. The image is
  `node:22-alpine`. A workflow that runs the services' tests or
  `npm audit` must use Node 22 or later: `publish-index.yml` runs Node 20
  today.
- **Fixtures follow the repository's convention**, under
  `test-fixtures/fr-urban-rules/`, not inside the service folder.

## DEC-2 — One dependency, `pdfjs-dist`; parsing in a child process

- **Why not dependency-free**, as `apps/share-service` is: that service never
  opens what it stores. This one must read text out of PDFs with
  cross-reference streams, object streams, Flate and font encodings. A second
  PDF implementation is the drift that Finding I-82 warns of.
- **`pdfjs-dist` pinned to exactly `6.2.108`** in `package.json` (no range).
  That is the editor's version on 2026-10-20: `apps/web` declares
  `^6.2.108` and its lockfile resolves 6.2.108.
  - There is **no lockstep gate**: when the platform moves, this pin is
    raised by hand, and the service's README says so.
  - Options: Node legacy build, `isEvalSupported: false`,
    `disableFontFace: true`, `verbosity: 0`.
  - `package-lock.json` is committed.
  - The image installs with **`npm ci --omit=dev --omit=optional`**.
    `pdfjs-dist` declares `@napi-rs/canvas` as an optional dependency, a
    native binary that text extraction does not need.
  - `npm audit --omit=dev` runs where the image is built.
- **Parsing runs in a child process** (`child_process.fork` of
  `parse-child.mjs`), not a `worker_threads` Worker.
  - Options: `execArgv: ['--max-old-space-size=512']`, a 60 s wall clock
    (`SIGKILL` at expiry), and one child per document.
  - **Why not a Worker:** `resourceLimits` does not count ArrayBuffers, and
    a Flate bomb exhausts external memory. In a Worker that kills the
    gateway's process. In a child process it kills the child, and the
    gateway answers `document_unreadable`.
  - A compose `mem_limit` on `plugin-services` is still worth having as an
    outer bound. That is a note for 096.8a, not a dependency.

## DEC-3 — The service's own wire contract (`v1`), this sprint's part

The routes live under `/plugins-api/com.archisimple.fr-urban-rules/v1/`.

| Route | Query | Answer |
| --- | --- | --- |
| `GET chapter` | `partition, idurba, nomfic, zone` (DEC-4's formats) | `{ pages: [from, to], found, match, title, documentPages }`, or an error from DEC-11 |
| `GET health` (gateway) | — | ADR-0114 Rule 4 |

- `found` is `outline`, `contents` or `heading`.
- `match` is `exact` or `prefix` (DEC-6).
- `pages` are **PDF page indices**, the numbers `#page=` opens.
- **One zone per request.** A plot that straddles zones asks once per zone
  (002.6a DEC-2).
- `GET chapter` may download and parse the document, so it counts against
  the document-fetch limit unless the text is cached (DEC-8).

002.5b adds the extraction routes under the same prefix.

## DEC-4 — Fetching: two hosts, and nothing a client names

- **Inputs are identifiers, never URLs**, each checked by pattern:

  | Input | Pattern |
  | --- | --- |
  | `partition` | `^DU_[0-9A-Z]{5,9}$` |
  | `idurba` | `^[0-9A-Za-z_-]{1,64}$` |
  | `nomfic` | `^[0-9A-Za-z_.-]{1,160}\.pdf$` |
  | `zone` | any printable text of 1–40 characters, no control characters |

  The zone is never sent upstream; it is only searched for in the text. So
  its pattern is broad: apostrophes and `+` occur in zone names.
- **Resolution, as 002.0 does it:**
  1. `GET https://www.geoportail-urbanisme.gouv.fr/api/document?partition=<p>&status=document.production`,
     then take the one entry whose `originalName` equals `idurba`
     **case-insensitively**, giving `id`.
  2. `/api/document/{id}/files` must list `nomfic`.
  3. Fetch `/api/document/{id}/files/{nomfic}`.

  A different `originalName` (the document changed since the extension read
  it) is `version_changed`, never a silent substitute.
- **Every request** is built from a template, over `https:` only, with
  `node:https` and a custom `lookup`:
  - The lookup **refuses loopback, private, link-local, CGNAT and multicast
    addresses**, IPv4 and IPv6.
  - **It handles both call forms**: `(host, opts, cb)` with
    `opts.all === true`, which expects an array, and the single-address form.
    Node 22 calls the first by default (`autoSelectFamily`). Every address in
    the array is checked, and one refused address refuses the request.
  - **Redirects are followed by hand,** at most 3. Each `Location` must be on
    `www.geoportail-urbanisme.gouv.fr` or `data.geopf.fr`. For the PDF it
    must also be under `/annexes/gpu/documents/<partition>/<id>/`.
- **The PDF** streams to a temporary file:
  - It is counted byte by byte and cut at 32 MiB (`document_too_large`).
  - Its first five bytes must be `%PDF-` (`not_a_pdf`).
  - Its SHA-256 is computed on the way.
- **Timeouts and failures:**
  - 10 s for an API call, 120 s for the PDF.
  - Two downloads at a time across the service.
  - A `5xx` or a timeout is `source_unavailable`; a `4xx` is
    `source_refused`.
- `User-Agent: ArchiSimple-fr-urban-rules-service/<version>`.

## DEC-5 — The document cache, by version

The cache lives under `${PLUGIN_SERVICES_DATA_DIR}/com.archisimple.fr-urban-rules/documents/`.

- **The key** is `sha1(upper(idurba) + '/' + nomfic)`. It is upper-cased
  because the resolver matches `idurba` case-insensitively (`PLUi` and
  `PLUI` are one document).
- **The entry** holds:
  - `meta.json`: `documentId`, `partition`, `idurba` as the GPU spells it,
    `nomfic`, `sha256`, `pages`, `retrievedAt`, the ETag;
  - `outline.json`;
  - `pages.jsonl`: one line per page, its index and text.
- **The PDF itself is deleted once read.** The text is what is reused, and
  it is about a tenth of the bytes (Lyon ≈ 2 MB of text).
- **Staleness:** a GPU version is a new `idurba`, so an entry never goes
  stale. An ETag change for the same key is detected on the next fetch and
  makes a new entry.
- **Eviction:** LRU by last access, capped at
  `FR_URBAN_RULES_CACHE_MAX_BYTES` (default 2 GiB). Writes are atomic
  (temporary file, then rename).
- **One fetch in flight per key.** A second request joins it and costs
  nothing against the limits.
- The cache holds public documents only, never a user's name, a project or a
  decision.

## DEC-6 — Finding the zone's chapter

Text is normalised before matching:

- NFKC (which turns U+2026 `…` into `...` and non-breaking spaces into
  spaces);
- spaces removed from codes;
- case folded.

So « Zone A 1 » matches `A1`.

1. **Outline.** Take entries whose title matches `\bzone\s+(\S+)` anywhere,
   case-insensitively. That covers « Zone UCe1 », « Chapitre 1 – Zone UA »
   and « DISPOSITIONS APPLICABLES A LA ZONE UA ».
   - Choose the entry whose code equals the zone's `libelle` (`match:
     'exact'`). Failing that, choose the **longest code that is a prefix**
     of it (`match: 'prefix'`): `UCe1` for `UCe1b`, and `UCe10` beats `UCe1`
     for `UCe10`.
   - The range ends the page before the next entry at the same or a
     shallower depth. Lyon: UCe1 → 121–144, `prefix`.
2. **Contents page** (no outline).
   - In the first 12 pages, after NFKC, lines matching
     `zone\s+<code>\b.*?\.{3,}\s*(\d+)\s*$` (case-insensitive) give a
     printed page. The next contents line's page gives the end.
   - pdf.js may split dot leaders into separate items; lines are rebuilt
     from `hasEOL` before matching.
   - The printed-to-PDF offset is found by locating the heading's text on
     PDF pages `n − 3 … n + 5`.
   - Gordes: zone A → printed 43–50 → PDF 44–51.
3. **Heading scan.** Pages whose first 400 characters hold
   `\bzone\s+<code>\b` on a line that is mostly upper case, or that starts
   with `CHAPITRE`, `TITRE` or `DISPOSITIONS APPLICABLES`. The range runs to
   the next such heading for another zone.
4. **None found:** `zone_chapter_not_found`. The error lists the outline's
   and the contents page's zone codes, so a person can see why.

`found` and `match` record which method held. A chapter over 80 pages is
refused as `chapter_too_large` rather than guessed at.

## DEC-7 — Preparing the text

- **Per page:** pdf.js `getTextContent`, items joined according to their
  `hasEOL`, then NFKC.
- **Running lines are removed.** A line counts as running when, trimmed and
  with digits masked, it appears among the first or last three lines of at
  least 60 % of the chapter's pages. A line holding only a number is also
  removed.
- **De-hyphenation:** `-\n` followed by a lower-case letter joins the word.
- **No page markers in the text.** The prepared chapter carries a
  **page-offset index**, `[{ page, start, end }]` in UTF-16 offsets. An
  offset maps to the page whose range holds it.
  - Markers would cost tokens.
  - They would split any passage that crosses a page break: the quote would
    either carry the marker or stop being verbatim.
  - 096.7 already returns offsets, which is all 002.5b needs.
- **Article headings,** recorded with their offsets:
  - lines matching `^\d+(\.\d+){0,4}\.?\s*[-–.]?\s+\S` (Lyon's numbered
    form);
  - lines matching `^(ARTICLE|Article)\s+([A-Z0-9]+\s+)?\d+[A-Z]?\b` (« ARTICLE
    A 7 – », « Article UA 6 : »).

  A passage's `article` is the nearest heading before it. Which form Lyon
  and Gordes use is checked in step 1 against the recorded text.
- **Sector headings,** recorded with their offsets for 002.5b's choice of
  occurrence: lines matching `\bsecteurs?\s+([0-9A-Za-z]+)`.
- **No text layer:** fewer than 200 characters per page on average across
  the chapter → `no_text_layer`.

## DEC-8 — Limits

| What | Limit | Variable | Keyed by |
| --- | --- | --- | --- |
| Document fetches (download + parse, cache miss) | 30 per hour | `FR_URBAN_RULES_LIMIT_FETCH_HOUR` | `X-Authenticated-User` (096.8a), else the client address, logged as a fallback |
| `GET chapter`, cached reads | 60 per minute | `FR_URBAN_RULES_LIMIT_READ_MINUTE` | same |
| PDF downloads running | 2 | — | the service |
| Parse children running | 2 | — | the service |
| Query or body size | 4 KiB | — | — |

- **Over a limit:** `429 rate_limited`, with `Retry-After`.
- **Storage:** the counts live in memory and are forgotten on restart, like
  the share service's limiter (`write-limiter.ts`).
- **Free requests:** a cache hit and a joined fetch cost nothing against the
  fetch limit.
- **Without the header,** every user shares nginx's address and so one
  budget. That is said in the log, and in production Caddy always sets the
  header.

## DEC-9 — Logging

- **Format:** one JSON line per event on stdout.
- **Logged:**
  - time, route, outcome code, duration;
  - `idurba`, `nomfic`, zone, chapter pages, `found`, `match`;
  - bytes downloaded, cache hit or miss;
  - the user as `HMAC-SHA256(PLUGIN_SERVICES_LOG_KEY, name)[:12]`, a keyed
    hash (096.8a). Without the variable, the key is random per process
    start and the log says so.
- **Never logged:** the regulation text, a page's text, a password or a raw
  name.
- **Level:** set by `FR_URBAN_RULES_LOG_LEVEL`.

## DEC-10 — The gateway and the image

- **Gateway** (`services/gateway/src/gateway.mjs`, dependency-free,
  `node:http`):
  - It reads `services/*/package.json` for
    `"archisimple": { "packageId": "…" }`, imports each `src/service.mjs`
    and mounts it at `/plugins-api/<packageId>/`.
  - It answers ADR-0114 Rule 4's health: `{ status: 'ok', packageId,
    contract: 1 }`, plus the service's `version`.
  - It answers `404` JSON for any other id, and `GET /plugins-api/health`
    lists the mounted ids.
  - It listens on `PLUGIN_SERVICES_PORT` (4500).
  - **It routes on decoded path segments.** A segment that is `.` or `..`,
    or that holds an encoded `/` (`%2F`) or `\` (`%5C`), is refused with
    `400 invalid_request` before any service sees it (096.8a).
  - A service that throws at start is logged and left unmounted; the others
    run.
- **`services/Dockerfile`:**
  - Base `node:22-alpine`, built from the **parent** context by
    archisimple's compose and `docker.yml` (096.8a). COPY paths therefore
    start at `archisimple-plugins/services/`.
  - The compose service is opt-in: it runs under the `plugin-services`
    profile (`COMPOSE_PROFILES=plugin-services`, 096.8a).
  - `npm ci --omit=dev --omit=optional` in each service folder.
  - `USER node`, with `/data` owned by `node`.
  - `EXPOSE 4500`, and a `HEALTHCHECK` on `/plugins-api/health`.
  - `CMD ["node", "gateway/src/gateway.mjs"]`.
- **Dev:** `npm run dev` in `services/gateway` runs `node --watch` with
  `PLUGIN_SERVICES_DATA_DIR=./.data`. `ARCHISIMPLE_AI_SERVICE_URL` defaults
  to `http://127.0.0.1:4321`. archisimple has no default dev origin, so
  the editor is started with
  `ARCHISIMPLE_PLUGIN_SERVICES_ORIGIN=http://127.0.0.1:4500 pnpm dev` to
  proxy `/plugins-api` to the gateway (096.8a). `.data/` joins
  `.gitignore`.

## DEC-11 — Codes (this sprint's)

| Code | Status |
| --- | --- |
| `invalid_request` | 400 |
| `not_found` | 404 |
| `version_changed` | 409 |
| `rate_limited` | 429 |
| `source_unavailable` | 502 |
| `source_refused` | 502 |
| `document_too_large` | 422 |
| `not_a_pdf` | 422 |
| `document_unreadable` | 422 (the parse child died or timed out) |
| `no_text_layer` | 422 |
| `zone_chapter_not_found` | 422 |
| `chapter_too_large` | 422 |

002.5b adds its own codes. 002.6a maps each code to a phrase.

## DEC-12 — Fixtures, without network and without PDFs

- `test-fixtures/fr-urban-rules/<plot>/regulation/` holds, for Lyon and
  Gordes, recorded by hand once in step 1 (read-only, from the live hosts):
  - `meta.json`;
  - `outline.json`;
  - the API answers (`documents.json`, `files.json`);
  - `pages.jsonl`: the chapter's pages, plus Gordes' contents page and its
    neighbours.
- **The PDFs are not committed** (size, licence). Chapter text is committed,
  as 002.9 DEC-2 already flags.
- **What is tested on what:**
  - The pdf.js path (child process, outline, `getTextContent`) is tested on
    **small synthetic PDFs** generated in the test: with an outline, with no
    outline and a contents page, with neither, and with no text layer.
  - The real documents' chapter finding and text preparation run on the
    recorded outline and pages.
  - The pdf.js path is never tested on the real files; this is said in the
    README.

---

# Steps

1. **Record** Lyon's and Gordes' meta, outline, API answers and pages
   (DEC-12). Check the article and sector heading forms against the text and
   adjust DEC-7's patterns.
2. **Gateway** and its tests: mounting, health, 404, a service that throws.
3. **Fetcher** (DEC-4): templates, the address check in both `lookup`
   forms, redirects by hand, the streamed cap. Tests against a local HTTPS
   stub and a stubbed `lookup`.
4. **Parse child** (DEC-2), **chapter** (DEC-6) and **text** (DEC-7). Tests
   on the fixtures and on synthetic PDFs.
5. **Cache, limits, logs** (DEC-5, DEC-8, DEC-9) and `GET chapter`.
6. **Image** (DEC-10): `docker build` locally, then a walk behind 096.8a's
   local override.
7. **README** of the service. This repository's `CLAUDE.md` gains a
   "Services" section: what a service is, where it lives, that it is not a
   package, and its Node version.

# Acceptance criteria

1. Neither `findPackageRoots` (a test copying its rule) nor
   `tools/build-index.mjs` lists anything under `services/` (test).
2. **The resolver** asks
   `api/document?partition=DU_200046977&status=document.production` and
   matches `200046977_PLUI_20260326` to `200046977_PLUi_20260326`. A
   different in-force `originalName` answers `409 version_changed` (test on
   recorded answers).
3. **The fetcher refuses, before any byte is read:**
   - a redirect to any host but the two;
   - a URL outside `/annexes/gpu/documents/<partition>/<id>/`;
   - an address in `127.0.0.0/8`, `10.0.0.0/8`, `169.254.0.0/16`, `::1` or
     `fc00::/7`, given by the single-address lookup form **and** by the
     `{all: true}` array form (one bad address among good ones refuses);
   - a fourth redirect.

   (fetcher tests)
4. **Download checks.** A PDF stream of 32 MiB + 1 byte with no
   `Content-Length` is cut and answered `document_too_large`. A body not
   starting `%PDF-` is `not_a_pdf` (tests).
5. **Parse failures stay contained.** A synthetic PDF that makes the parse
   child exceed its memory or 60 s is `document_unreadable`, and the gateway
   keeps answering health (test).
6. **Chapter finding on the fixtures.**
   - Lyon's outline gives UCe1b → pages 121–144, `found: "outline"`,
     `match: "prefix"`.
   - Gordes' contents page, with its U+2026 leaders, gives A → PDF pages
     44–51, `found: "contents"`.
   - An outline titled « Chapitre 2 – Zone UA » is found (synthetic).

   (tests)
7. **The prepared Lyon chapter:**
   - has no « METROPOLE DE LYON – PLU-H » line;
   - holds no page marker;
   - its page-offset index maps the offset of « Le retrait* est au moins
     égal à 4 mètres » to page 126 and article `2.2.1`;
   - its sector headings include `UCe1a` and `UCe1b`.

   (fixture test, values checked in step 1)
8. **Joins and limits.**
   - A second `GET chapter` for a document being fetched joins the first
     (one fetch).
   - The 31st document fetch within an hour for one user answers `429` with
     `Retry-After`. A cache hit does not count, another user is not
     affected, and without the header the address is used and the log says
     so.

   (tests)
9. No log line contains page text or a raw user name (test with a capturing
   logger and distinctive strings).
10. **The image** installs with `--omit=optional` (no `@napi-rs/canvas` in
    `node_modules`). Its environment holds no `AI_PROVIDER_*`, and `src/`
    reads none (test greps for `AI_PROVIDER_` and `API_KEY`).
11. **Health.** `GET /plugins-api/com.archisimple.fr-urban-rules/health`
    answers ADR-0114 Rule 4's shape, and
    `/plugins-api/org.example.other/health` answers `404` JSON (gateway
    test).
12. **Path safety.** `/plugins-api/com.archisimple.fr-urban-rules/v1/%2E%2E/x`,
    a `..` segment and a `%2F` inside a segment each answer `400`, and no
    service handler is called (gateway test).
13. **Keyed log hash.** With `PLUGIN_SERVICES_LOG_KEY` set, the same user
    name gives the same 12-character hash across restarts, and the hash is
    not `sha256(name)` (test).

# Testing strategy

- **Isolation (manual, with 096.8a's override):** from inside the container,
  `/api/share/` on `web` is refused (096.8a enforces it). This service never
  tries; the walk records it.
- **Unit:** every module, with fixtures and fakes, via
  `node --test 'services/*/tests/*.test.mjs'`. No network.
- **Containment:** the address checks in both lookup forms, the redirect
  rules, the caps, the parse child.
- **Manual:** the image behind 096.8a's local override, and one live
  `GET chapter` on Lyon and on Gordes.

# Risks

- **Outlines and contents pages vary.** Two documents needed two methods. A
  third shape fails as `zone_chapter_not_found`, naming the codes it saw,
  and 002.6a falls back to the first page. 002.9's corpus grows the cases.
- **Prefix matches.** A parent chapter (« Zone UC » for `UCe1b`) may be the
  wrong chapter. `match: 'prefix'` says so, and 002.6a shows the chapter's
  title.
- **pdf.js on hostile input.** It runs in a child process, with a memory
  cap and a timer.
- **GPU changes.** Resolution failures are named, and the probe facts are
  dated.
- **Licence of the règlement text** (proposal § 4.3). The cache stores
  public documents' text for the deployment's users only, and the fixtures
  commit chapter text.

# Questions for the owner

1. ~~A runtime dependency (`pdfjs-dist`) in this repository's service?~~
   **Answered 2026-10-20: accepted** (platform README Q42).

# Definition of Done

- The criteria are walked against the code.
- The Design Contract boxes are checked.
- `node --test 'services/*/tests/*.test.mjs'` is green.
- The image is built and run behind 096.8a's local override.
- The service's README lists the hosts contacted, the limits and the
  variables.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| **096.8a** | ADR-0114: the container slot (`services/Dockerfile`, port 4500, `/data`) under the `plugin-services` compose profile, the route, `X-Authenticated-User`, `PLUGIN_SERVICES_LOG_KEY`, decoded-segment routing, the isolation from `/api/share/`, the health shape, the dev proxy (`ARCHISIMPLE_PLUGIN_SERVICES_ORIGIN`, no default), the local override, `docker.yml`'s image entry |
| **002.0** | The `partition`, `idurba`, `nomfic` and zone it reads, and its resolution |

**Version needs:**

- `fr-urban-rules-service` **0.1.0**, wire contract `v1` (path).
- The gateway **0.1.0**, ADR-0114's health `contract: 1`.
- No ai-service contract, SDK or file version.

# Corrections to the README / proposal

1. **Proposal § 4.5**, "They have a text layer and an outline, which is how
   a zone's chapter is found": Lyon has an outline, but **Gordes has none**
   and is found by its contents page (DEC-6).
2. **Proposal § 4.5**, "zone UCe is pp. 118–158": the outline gives **UCe1
   at PDF pp. 121–144**, with UCe2 from 145. Printed page numbers are the
   PDF's minus 2.
3. **Proposal § 4.2**: the PDF answer carries **no `Content-Length`** but an
   ETag and a `max-age` of 21 days.
4. **002.9 DEC-2**: the fixtures live under
   `test-fixtures/fr-urban-rules/<plot>/regulation/` (DEC-12), neither in
   the service's folder nor in a root `fr-urban-rules-service/` folder,
   which the Development Repository would discover as a package. Also, the
   prepared text carries no `[p. N]` markers (DEC-7).
5. **This repository's `CLAUDE.md`** says "each folder is a package". With
   `services/` that stops being true, and it gets its own section (step 7).

# Review (2026-10-20, Phase 2)

An independent pre-implementation review of the 002.5 draft. The
coordinator's decisions were taken on the owner's behalf and applied here.

- **Split.** 002.5 was too large for one sprint. This half (gateway, image,
  fetcher, document text, chapter, `GET chapter`) needs no 096.7, so 002.6a
  can land on it alone. Extraction is 002.5b.
- **096.8 → 096.8a.** The platform split 096.8 into 096.8a (Plugin Service
  Deployment) and 096.8b (Regulation Source Signal). This sprint needs
  096.8a only.
- **S7: no page markers.** A page-offset index replaces `[p. N]` markers
  (DEC-7).
- **S8: regex fixes.**
  - The outline pattern is `\bzone\s+` anywhere in the title.
  - NFKC runs before contents-page parsing, for the U+2026 leaders.
  - `ARTICLE` heading forms are added.
  - Exact versus prefix matches are recorded (DEC-6, DEC-7).
- **S10: a document-fetch limit** of 30 per hour per user (DEC-8).
- **S11: a child process,** not a Worker, with its own memory cap
  (DEC-2). A compose `mem_limit` is noted for 096.8a.
- **S12: SSRF guard.** The `lookup` handles `{all: true}` (DEC-4).
- **S13: install.** `npm ci --omit=dev --omit=optional`; `pdfjs-dist`
  pinned to exactly `6.2.108`; Node ≥ 22.13 noted for workflows (DEC-1,
  DEC-2).
- **S14 (this half's part): fixtures.** They live under
  `test-fixtures/fr-urban-rules/`, and the synthetic-PDF limits of the tests
  are said (DEC-12).
- **S15: one zone per request** (DEC-3).
- **Platform corrections mirrored (096.8a review):**
  - the compose profile `plugin-services`;
  - the HMAC user hash with `PLUGIN_SERVICES_LOG_KEY`;
  - decoded-segment routing that refuses `.`, `..` and encoded `/` with
    400;
  - no default dev origin;
  - the isolation from `/api/share/`.
- **NITs.**
  - `build-index.mjs` has no skip list, so none is added.
  - Tests use globs, since the directory form fails on Node 24.
  - Dockerfile COPY paths start from the parent context.
  - The document key upper-cases `idurba`.
  - The zone pattern is broad.
  - Limits are named variables.
  - A joined fetch costs nothing.

# Outcome (2026-10-20)

## What landed

- **`services/gateway`** (0.1.0, `node:http`, no dependency): mounts every
  `services/*/package.json` declaring `archisimple.packageId` at
  `/plugins-api/<id>/`; Rule 4's health; `GET /plugins-api/health` listing the
  mounted ids; 404 JSON for an unknown id; decoded-segment routing refusing
  `.`, `..`, `%2F`, `%5C`, a raw `\` and an undecodable segment with `400
  invalid_request` before any service; a query over 4 KiB and any request
  body over 4 KiB (or chunked) refused; a service that throws at start logged
  (`service_not_mounted`) and left out; the user handed on as
  `HMAC-SHA256(PLUGIN_SERVICES_LOG_KEY, key)[:12]`, random key per start when
  unset (logged as `log_key_random`); `npm run dev` = `node --watch` with
  `./.data`.
- **`services/fr-urban-rules-service`** (0.1.0, `pdfjs-dist` **6.2.108**
  exactly, lockfile committed): `fetcher.mjs` (DEC-4), `document.mjs`
  (resolution, the parse child's runner, the single-flight store),
  `parse-child.mjs`, `chapter.mjs` (DEC-6), `text.mjs` (DEC-7), `cache.mjs`
  (DEC-5), `limits.mjs` (DEC-8), `errors.mjs` (DEC-11), `service.mjs`
  (`GET v1/chapter`, logging per DEC-9), `scripts/record-fixture.mjs`, a
  README (hosts, limits, codes, variables, the pin, what is tested on what).
- **`services/Dockerfile`**: `node:22-alpine`, parent build context, `npm ci
  --omit=dev --omit=optional` then `npm audit --omit=dev --audit-level=high`,
  `/data` owned by `node`, `USER node`, `EXPOSE 4500`, `HEALTHCHECK` on
  `/plugins-api/health`, `CMD ["node", "gateway/src/gateway.mjs"]`.
- **Fixtures** (DEC-12): `test-fixtures/fr-urban-rules/{lyon,gordes}/regulation/`
  — `meta.json` (sha256, bytes, PDF version, ETag, page count),
  `outline.json` (Lyon's 53 entries; Gordes' none), `pages.jsonl` (Lyon
  121–145, Gordes 1–3 and 44–52). Recorded 2026-10-20 from the live PDFs,
  read-only; no PDF is in the tree.
- **Docs**: `CLAUDE.md` gains a "Services" section; `README.md` a short one;
  `.gitignore` gains `.data/`.

## Gates

- `node --test 'services/*/tests/*.test.mjs'`: **65/65** on Node **24.18.0**
  (Volta's) and on Node **22.13.0** (the engines floor, run from a download in
  the session's scratch folder).
- `node --test fr-urban-rules/tests/*.test.mjs`: 215/215;
  `node --test sh3f-importer/tests/*.test.mjs`: 99/99.
- `node tools/build-index.mjs --cli ../archisimple/tools/cli/dist/archisimple.js --out <scratch>`
  builds **two** packages (fr-urban-rules 0.4.0, sh3f-importer 1.3.0);
  `check-index.mjs --index <scratch>/index.json` accepts 2 of 2. Nothing under
  `services/` is listed.
- **Live, local gateway** (port 4599, real HTTPS to the GPU): health answered
  Rule 4's shape; Lyon `zone=UCe1` → `{ pages: [121, 144], found: "outline",
  match: "exact", title: "Zone UCe1", documentPages: 803 }` in 3.5 s on a miss
  (11 059 057 bytes), 6 ms on a hit; `UCe1b` → the same pages, `prefix`; two
  concurrent requests from two users made one fetch (`miss` + `joined`);
  Gordes `zone=A` → `{ pages: [44, 51], found: "contents", match: "exact" }`;
  a stale `idurba` → `409 version_changed`; `zone=ZZ` →
  `422 zone_chapter_not_found` with the outline's 33 codes. The `tmp/` folder
  was empty afterwards (the PDF deleted once read); the Lyon entry is 1.8 MB
  of text.
- **Not run:** `docker build` and the walk behind 096.8a's local override —
  Docker is not installed here. `npm ci --omit=dev --omit=optional` and `npm
  audit --omit=dev` were run on a copy of the manifest and lockfile: only
  `pdfjs-dist` installed, 0 vulnerabilities.

## Acceptance criteria, walked

1. **Met.** `services/gateway/tests/discovery.test.mjs` copies
   `findPackageRoots` and `build-index.mjs`'s rule; neither lists `services`,
   no service manifest has an `id`, no root `package.json`. The real
   `build-index` run listed two packages.
2. **Met.** `fetcher.test.mjs` "the resolver asks…": the stub sees
   `/api/document?partition=DU_200046977&status=document.production`;
   `200046977_PLUI_20260326` resolves to `4f3ddc27…` / `200046977_PLUi_20260326`
   on the recorded `gpu-document.json` and `gpu-files.json`; another `idurba`
   is `409 version_changed`.
3. **Met.** `fetcher.test.mjs`: redirects to another host, plain `http:`, an
   explicit port, another partition, another document, outside the annexes and
   a `..` escape are refused with the stub seeing one request and the second
   host never looked up; `127.0.0.1`, `10.0.0.1`, `169.254.0.1`, `::1`,
   `fc00::1` refused in both lookup forms; one bad address among good ones
   refuses in `{}`, `{ all: true }` and the numeric form; through the fetcher a
   refused address sends no byte; a fourth redirect is refused after four
   requests (the first and three followed).
4. **Met.** `fetcher.test.mjs`: 32 MiB + 1 byte, chunked, no
   `Content-Length` → `422 document_too_large`, partial file deleted;
   `<!doctype…` and a 3-byte `%PD` → `not_a_pdf`.
5. **Met.** `parse.test.mjs` (32 MB heap, and a 100 ms timer) and
   `gateway.test.mjs` "a parse child that dies…": `422 document_unreadable`
   through the gateway, then health 200.
6. **Met.** `chapter.test.mjs`: Lyon UCe1b → 121–144, `outline`, `prefix`;
   Gordes A → 44–51, `contents`, with the U+2026 leaders; `parse.test.mjs`:
   « Chapitre 2 – Zone UA » found in a synthetic outline.
7. **Met, with the value corrected.** `chapter.test.mjs` "the prepared Lyon
   chapter": no « METROPOLE DE LYON – PLU-H » line, no marker, the quote maps to
   page 126; its nearest heading is **`2.2.1.2`** (« Dans la bande de
   constructibilité secondaire »), which sits under `2.2.1`: `articleAt`
   answers the heading and its ancestors, and the test asserts both. Sector
   headings include `UCe1a` and `UCe1b`.
8. **Met.** `service.test.mjs`: a held fetch joined (one download, `miss` +
   `joined`); the 31st fetch is `429` with `Retry-After`, a hit passes,
   another user passes, an hour later passes; without the header the address
   keys the limit and the log says so once (`limit_key_fallback`).
9. **Met.** `service.test.mjs` "no log line…": a distinctive page string, the
   chapter title and an accented raw name are absent; the hash is present.
10. **Met in what can be checked here.** `service.test.mjs`: the Dockerfile
    says `npm ci --omit=dev --omit=optional`, the local `node_modules` has no
    `@napi-rs`, the pin is exact, and no `.mjs`/`.js`/`.json`/Dockerfile under
    `services/` names `AI_PROVIDER_` or `API_KEY`. The built image itself was
    not inspected (no Docker).
11. **Met.** `gateway.test.mjs`: the real `services/` folder mounts
    `com.archisimple.fr-urban-rules`; its health is
    `{ status: 'ok', packageId, contract: 1, version: '0.1.0' }`;
    `org.example.other` is `404` JSON.
12. **Met.** `gateway.test.mjs` "path safety": `…/v1/%2E%2E/x`, `…/v1/../x`
    (sent raw), `%2e`, `%2F`/`%2f`, `%5C`, `\` and an undecodable segment all
    answer `400`; the stub service's handler saw no call.
13. **Met.** `gateway.test.mjs` "the keyed hash": stable across two hashers
    with one key, 12 hex characters, not `sha256(name)[:12]`, different under
    another key, random without one.

## Deviations (the code or the data said otherwise)

1. **pdf.js 6 does not load without `@napi-rs/canvas`.** Its Node build runs
   `new DOMMatrix()` at module load and takes `DOMMatrix` and `Path2D` from
   that optional package; with `--omit=optional` the import throws.
   `parse-child.mjs` installs inert stand-ins before importing; text
   extraction never draws. Recorded in the README; when the pin is raised,
   check this still holds.
2. **`--max-old-space-size` does not bound a Flate bomb** (ArrayBuffers are
   external memory), in a child as in a Worker. The child still contains the
   damage to itself, but to bound it the runner adds a **resident-memory
   watchdog** (1 GiB, `/proc/<pid>/statm` every 250 ms, Linux — the image;
   inactive on macOS). A compose `mem_limit` remains the outer bound (a note
   for 096.8a, as DEC-2 says).
3. **Contents leaders of two dots.** Gordes writes « … A URBANISER .. 35 » once;
   with DEC-6's `\.{3,}` that line was missed and UC's chapter ran a page
   long (29–36). Leaders are `\.{2,}`.
4. **The numbered-heading pattern was narrowed** (step 1): DEC-7's
   `^\d+(\.\d+){0,4}\.?\s*[-–.]?\s+\S` also matched « 1 500 m2, il est
   exigé… », « 3.1.6.1 de la Partie 1 » and Gordes' list items « 1- A
   condition… ». The pattern used needs a dotted number and a capital:
   `^(\d+(?:\.\d+){1,4})\.?(?:\s*[-–.])?\s+\p{Lu}` (64 headings in Lyon's
   chapter, including « 5.2.2.1 Modalités… », which has no dash). Lyon uses
   that form, Gordes « ARTICLE A 7 – » (14 headings, A 1–A 14).
5. **Criterion 7's article.** See the walk: `2.2.1.2`, under `2.2.1`.
6. **Lyon's zone entries are at outline depth 3**, not 2 (Part II → « 2.1 LES
   ZONES MIXTES » → « Zone UCe1 »). The same-or-shallower rule gives 121–144
   unchanged.
7. **« Zone A 1 » is `A1`.** `\bzone\s+(\S+)` captures `A`; a following
   token of one or two digits or a single lower-case letter is joined to the
   code, so Lyon's A1, A2, N1, N2 match exactly (and a zone `A` does not land
   in « Zone A 1 »).
8. **Fixtures.** `documents.json` and `files.json` are not duplicated under
   `regulation/`: the same answers (the `status=document.production` query
   and the 617-entry file list) were recorded on 2026-10-20 by 002.4 as
   `gpu-document.json` and `gpu-files.json` one level up, and the tests read
   those. Lyon's `pages.jsonl` also holds p. 145 (UCe2's first page) so the
   heading scan's end is tested.
9. **A fresh connection per request** (`agent: false`): a keep-alive socket
   would skip the lookup, and with it the address check, for a later request.
10. **IPv4-mapped IPv6 (`::ffff:0:0/96`) is refused whole**; NAT64
    (`64:ff9b::/96`) is judged by its embedded IPv4. `net.BlockList` matches
    an IPv4 address against an IPv6 subnet as its mapped form, so the two
    families are kept in two lists — a single list refused every IPv4 address
    (found on the first live run).
11. **The read limit counts every `GET chapter`**, hit or miss; DEC-8's
    "cached reads" was read as "reads". The fetch limit is charged when a
    fetch **starts**, so a fetch that then fails (`version_changed`,
    `not_found`, `source_*`) still counts.
12. **A contents-page match whose heading cannot be found** on PDF pages
    n − 3 … n + 5 falls through to the heading scan rather than guessing an
    offset of 0.
13. **The ETag is recorded, not revalidated**: a cached entry is never
    refetched, so "an ETag change … detected on the next fetch" happens only
    after eviction, when the new entry replaces the old.
14. **HTTPS is not exercised by the tests**: the stub speaks HTTP and the
    fetcher is handed `http.request` and a port (the protocol checks still
    run). The live run used real HTTPS.
15. **Two files beyond DEC-1's list**: `src/errors.mjs` (DEC-11's table) and
    `scripts/record-fixture.mjs` (re-records a fixture from a PDF on disk; it
    contacts nothing).
16. **Gateway details not in DEC-10**: `HEAD` is accepted on health; a
    non-`GET` route answers `405`; a 500 JSON for an unexpected throw.
17. **Not done:** DEC-10's image build and walk (no Docker); `publish-index.yml`
    still runs Node 20 and does not run the services' tests (DEC-1 only says a
    workflow that does must use Node 22).

## Platform needs (096.8a)

- The compose `mem_limit` on `plugin-services` (DEC-2's outer bound).
- `docker build` needs network for `npm ci` and `npm audit` (the audit fails
  the build on a high advisory).
- The image's `HEALTHCHECK` reads `GET /plugins-api/health`
  (`{ status: 'ok', services: [...] }`), which nginx does not need to route.
- The gateway's 400 body is `{ error: 'invalid_request' }`; the 096.8a stub
  answers `{ error: 'bad_path' }`. The platform reads neither.

## Questions for the owner

_All three answered on 2026-10-20 by the coordinator on the owner's behalf;
see "Review fixes" below._

1. Should `publish-index.yml` (or a second workflow) run the services' tests
   and `npm audit`? It would need Node 22 and `npm ci` in
   `services/fr-urban-rules-service`.
2. The read limit counts every read, and a failed fetch spends a fetch
   (deviation 11). Keep?
3. The committed chapter text (Lyon ≈ 60 k characters, Gordes ≈ 21 k) — the
   licence question 002.9 DEC-2 flags stands.

# Review fixes (2026-10-20)

An independent review found no blocking issue; the security checks held. The
coordinator took the owner's decisions and asked for the fixes below; they
supersede the Outcome above where the two differ (deviations 2, 7, 11 and
17, and "Questions for the owner").

## Owner decisions

1. **Q1 — yes.** `publish-index.yml` moves to **Node 22** and, after setting
   it up, runs `npm ci --omit=dev --omit=optional --ignore-scripts` and
   `npm audit --omit=dev --audit-level=high` in
   `services/fr-urban-rules-service`, then
   `node --test 'services/*/tests/*.test.mjs'`, on every push to `main`.
2. **Q2.** The **60/min read limit counts every request** — a flood guard:
   hits, joins, refused inputs and failures alike. The **30/h fetch limit
   counts every network attempt, failures included, and never a cache hit or
   a joined fetch.** Stated so in the service's README; that is what the code
   did (the fetch is charged when it starts).
3. **Q3.** The licence of the committed chapter text stays with 002.9 DEC-2.

## Fixes

- **S1 — a parent only for a sector.** A prefix code is accepted only when
  what the zone's libelle (original case, spaces removed) adds after it
  starts with a lower-case letter: `UCe1` for `UCe1b`, `UA` for `UAa`, `N`
  for `Nl`; never `A` for `AU` or `U1` for `U12`, which are
  `zone_chapter_not_found` listing the codes (`isParentCode`, tests). Live:
  Lyon `AU` now answers its own chapter, 739–748, `exact`.
- **S2.** `refusedV6` adds `::/96` (IPv4-compatible), `2002::/16` (6to4),
  `2001::/32` (Teredo) and `64:ff9b:1::/48` (local-use NAT64); tests.
- **S3 — the parse child is confined.** Forked with `env: { NODE_ENV:
  'production' }` only, and `--permission` with `--allow-fs-read` for its own
  folder, pdf.js's folder and the PDF's folder — **works on Node 22.13.0 and
  24.18.0**. Two findings: the folders must be **real paths** and the child
  handed real paths (resolving macOS's `/var` symbolic link needs to read
  `/var`); and **Node 22.13 aborts (`SIGABRT`) on a repeated
  `--allow-fs-read`**, so the folders are de-duplicated. A test child reports
  its environment (`NODE_ENV` only) and that reading `/etc/hosts` is
  `ERR_ACCESS_DENIED`. The live Lyon and Gordes parses ran under it.
- **S4.** The watchdog falls back to `ps -o rss= -p <pid>` off Linux; the
  `/proc` page size comes from `getconf PAGESIZE` (4096 if it cannot say).
  The README says so at the top.
- **S6.** `downloadPdf` opens its temporary file inside the `try`; on any
  failure the upstream response is destroyed and the timer stopped (test: an
  unopenable `tmpDir` closes the stub's response).
- **S7.** A document's whole text is capped at **64 Mi characters** in the
  child, before it crosses IPC: `document_too_large` (test).
- **NITs.** Contents lines over 300 characters are skipped. The heading scan
  ends a chapter only at a heading of the starting heading's **rank** (its
  line with code, digits and spacing masked — Lyon's header reads
  « REGLEMENT – » and « REGLEMENT– » on consecutive pages) or at a structural
  one, never at an upper-case line inside it that names another zone (test).
  An exact contents-page match beats an outline's parent chapter (test).
  `codesInTitle` joins only a following 1–2 digit token (« Zone U a » is
  `U`). `error` is last in an error body. `version_changed`'s `inForce` is
  filtered to idurba-shaped names and capped at 5. The gateway hashes the
  **user name** itself (the address when there is none), not the limit key
  (ADR-0114 Rule 10). The semaphore hands a slot to the next waiter
  directly; the two copies are one (`fetcher.mjs`). The parse child exits on
  `disconnect`. The Dockerfile installs with `--ignore-scripts` and says why
  the audit needs the registry. The limiter forgets emptied keys once per
  window (test). New tests: a child that never answers is killed at the
  timer and is gone (`SIGKILL`, `kill(pid, 0)` → `ESRCH`); a real parse past
  its timer is gone too; `tmp/` is empty after `document_unreadable`; the
  61st read in a minute is `429` with `Retry-After`.

## Gates, again

- `node --test 'services/*/tests/*.test.mjs'`: **77/77** on Node 24.18.0 and
  on Node 22.13.0.
- `fr-urban-rules`: 215/215; `sh3f-importer`: 99/99.
- `build-index` into the scratch folder: 2 packages; `check-index`: 2 of 2
  accepted; nothing under `services/`.
- Live gateway: health per Rule 4; Lyon UCe1 → 121–144 `exact` (3.4 s on a
  miss), UCe1b → 121–144 `prefix` (hit), AU → 739–748 `exact`; Gordes A →
  44–51 `contents`; `tmp/` empty afterwards.
- Still not done: the image build and the walk behind 096.8a's override (no
  Docker here).

_Noted at the close (2026-10-22): this sprint carries no post-sprint list; what it changed in the documents is recorded in its Outcome. Not invented after the fact._
