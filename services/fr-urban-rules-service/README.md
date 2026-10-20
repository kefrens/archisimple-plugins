# fr-urban-rules-service

The companion service of the package `com.archisimple.fr-urban-rules`
(Sprint 002.5a; ADR-0114 in the platform). It reads a plot's **règlement** —
the written rules of a PLU or PLUi — from the Géoportail de l'Urbanisme, keeps
its text by document version, and finds the zone's chapter in it.

It is **not a package**: it is never zipped, installed or loaded into the
editor. The deployment runs it in the `plugin-services` container, behind the
gateway (`../gateway`), at `/plugins-api/com.archisimple.fr-urban-rules/`. The
extension reaches it over HTTP only (002.6a is its first consumer).

**Node ≥ 22.13** (`pdfjs-dist` 6's `engines`); the image is `node:22-alpine`.

> **The parse child's memory watchdog** reads `/proc/<pid>/statm` on Linux
> (the image) and falls back to `ps -o rss= -p <pid>` elsewhere (macOS while
> developing); where neither answers it does nothing, and the heap limit, the
> 60 s timer and the container's `mem_limit` remain. It exists because
> `--max-old-space-size` does not count the ArrayBuffers a Flate bomb grows.
> The child also runs under Node's **permission model**: it may read only its
> own folder, pdf.js and the PDF's folder, and receives no environment but
> `NODE_ENV`.

## Wire contract `v1`

```text
GET v1/chapter?partition=DU_200046977&idurba=200046977_PLUi_20260326
              &nomfic=200046977_reglement_20260326.pdf&zone=UCe1b
→ 200 { "pages": [121, 144], "found": "outline", "match": "prefix",
        "title": "Zone UCe1", "documentPages": 803 }
```

- `pages` are **PDF page indices** (what `#page=` opens), inclusive.
- `found`: `outline`, `contents` or `heading` — which method held.
- `match`: `exact`, or `prefix` when the chapter is a parent's (`UCe1` for
  `UCe1b`). A prefix may be the wrong chapter; show its `title`.
- **One zone per request.** A plot that straddles zones asks once per zone.
- Inputs are identifiers, checked by pattern; **never a URL**:

  | Input | Pattern |
  | --- | --- |
  | `partition` | `^DU_[0-9A-Z]{5,9}$` |
  | `idurba` | `^[0-9A-Za-z_-]{1,64}$` |
  | `nomfic` | `^[0-9A-Za-z_.-]{1,160}\.pdf$` |
  | `zone` | 1–40 printable characters (never sent upstream) |

Errors answer `{ "error": "<code>", …details }`:

| Code | Status | Meaning |
| --- | --- | --- |
| `invalid_request` | 400 | an input fails its pattern (`field` names it), or a path segment is unsafe (gateway) |
| `not_found` | 404 | no document in production for the partition, or `nomfic` is not among its files |
| `version_changed` | 409 | the document in force is another `idurba` (`inForce` lists it) |
| `rate_limited` | 429 | over a limit; `Retry-After` says when |
| `source_unavailable` | 502 | the GPU answered 5xx, timed out or sent something unreadable |
| `source_refused` | 502 | a 4xx, a refused address, or a redirect off the allow-list |
| `document_too_large` | 422 | over 32 MiB, over 2 000 pages, or over 64 Mi characters of text |
| `not_a_pdf` | 422 | the body does not start `%PDF-` |
| `document_unreadable` | 422 | the parse child failed, died, or ran out of time or memory |
| `no_text_layer` | 422 | under 200 characters per page: a scan (no OCR) |
| `zone_chapter_not_found` | 422 | `outlineCodes` and `contentsCodes` list what was seen. A parent code counts only when the zone adds a lower-case sector letter (`UCe1` for `UCe1b`, never `A` for `AU`) |
| `chapter_too_large` | 422 | the chapter found spans over 80 pages |
| `not_cached` | 404 | `cachedOnly`: no result (or no cached text) for this chapter |
| `busy` | 503 | the extraction queue is full; `Retry-After` |
| `extraction_unavailable` | 503 | ai-service lacks `structured-output`, or has no provider |
| `extraction_failed` | 502 | every chunk failed; `codes` lists 096.7's |
| `internal_error` | 500 | an unexpected exception; only its name is logged |

## Extractions (Sprint 002.5b)

The zone chapter's rules, read by a model through ai-service's
`POST /api/ai/extract` (platform 096.7, contract ≥ 1.2.0, capability
`structured-output`), checked here, and answered as **candidates** — never
rules: the service writes no project, and 002.6b shows each one to confirm.

```text
POST v1/extractions  { partition, idurba, nomfic, zone }   [?refresh=1]
  → 200 { state: 'done', result }       from the cache, free
  → 202 { jobId, state: 'queued' }      before any fetch
GET  v1/extractions/{jobId}
  → { jobId, state, progress: { step, chunk, of }, result?, error? }
GET  v1/extractions?partition&idurba&nomfic&zone&cachedOnly=1
  → { result, current } | 404 { error: 'not_cached', current }   never fetches, never starts work
```

- **States:** `queued → fetching → reading → extracting → done | failed`. A
  fetch or chapter code (`version_changed`, `zone_chapter_not_found`, …) is the
  **job's** `error`, never the POST's. A job is kept 30 minutes after it ends.
- **One job runs at a time; ten wait.** Beyond, `503 busy`.
- **The result is per chapter, not per zone**, cached under
  `sha1(documentKey, from, to, schemaVersion, promptVersion)` in
  `…/extractions/`, sharing the documents' 2 GiB budget. Provider and model are
  stored **in** the result (`model`); `current` is `{ providerId: health's
  default, schemaVersion, promptVersion }`, for 002.6b to offer "Extract again".
- **A rule:** `kind`, `sector`, `statement` (`limit`, `not_regulated`,
  `see_graphic`, `described`), `limit`, `page` and `article` (from the passage's
  offset, never from the model), `passage`, `offset`, `occurrence { of,
  chosenBy }`, `conditions`, `exceptions`, `sectorUnplaced`, `confidence`.
- **A result is shared by every user of the deployment.** `refresh=1`
  replaces it **for everyone**. A **partial** result (`chunks.failed > 0`) is
  answered to its job and never cached, so the next POST tries again.
- **Checked here:** every number a limit claims (a value, a ratio's percent,
  a height-relative minimum and offset) must be written in the passage
  (« 1 500 » and « 1,5 » read as one number each), else the rule is `low`
  and counted under `valueNotInPassage`; `not_regulated` needs « réglementé »
  (or « règlementé », « sans objet ») in the passage and `see_graphic`
  « graphique », else the rule is dropped (`incoherent`); a rule that lost a
  condition or exception is `low` (`droppedConditions`); kept conditions are
  the source's own spelling; a sector written "null", "none", "aucun", "n/a"
  is null. Also: a repeated passage takes the occurrence under its sector's
  heading, else the first at `low` confidence; conditions and exceptions must be
  verbatim between the sector heading (or 1 500 characters) before the passage
  and its end; statement, limit and unit must agree, and a comparison against
  the package's floors lowers the confidence. What fails is counted in
  `dropped`; a chunk that fails twice is counted in `chunks.failed`.
- **Chunks** are cut at article headings, at most 40 000 characters (or
  `FR_URBAN_RULES_EXTRACT_CHUNK_CHARS`, or ai-service's `maxTextLength`,
  whichever is smaller); each is one call, retried once on
  `output_truncated`, `output_invalid` or `provider_error`.

## Hosts contacted

Exactly two, over `https:` only, from URL templates — no URL comes from a
client:

| Host | Path | Why |
| --- | --- | --- |
| `www.geoportail-urbanisme.gouv.fr` | `/api/document?partition=<p>&status=document.production` | the document in force |
| | `/api/document/<id>/files` | its file list |
| | `/api/document/<id>/files/<nomfic>` | the règlement (answers `302`) |
| `data.geopf.fr` | `/annexes/gpu/documents/<partition>/<id>/…` | the PDF, after that redirect |

- Every address a name resolves to is checked, in both forms Node asks for
  (`{ all: true }` and single): loopback, private, link-local, CGNAT,
  multicast, reserved and IPv4-mapped addresses refuse the request.
- Redirects are followed by hand, at most three, each to one of the two hosts,
  `https:`, no explicit port; the PDF's only under its own partition and
  document.
- Each request opens its own connection, so none skips the address check.
- The deployment does **not** filter egress (ADR-0114 Rule 8): this list,
  enforced in `src/fetcher.mjs`, is the boundary.
- `User-Agent: ArchiSimple-fr-urban-rules-service/<version>`.

## Limits

| What | Limit | Variable |
| --- | --- | --- |
| Document fetches (download + parse, a cache miss) | 30 per hour per user | `FR_URBAN_RULES_LIMIT_FETCH_HOUR` |
| Every request — `GET chapter`, every extraction POST, poll and cached read (a flood guard) | 60 per minute per user | `FR_URBAN_RULES_LIMIT_READ_MINUTE` |
| Starting an extraction (a job that calls a model; a cache hit, a join, or a job that ends without a model call is free) | 6 per hour, 20 per day, per user | `FR_URBAN_RULES_LIMIT_EXTRACT_HOUR`, `FR_URBAN_RULES_LIMIT_EXTRACT_DAY` |
| `refresh=1` | 2 per day per user | `FR_URBAN_RULES_LIMIT_REFRESH_DAY` |
| Extractions running / waiting | 1 / 10 | — |
| Download size, counted while streaming | 32 MiB | — |
| Document pages / chapter pages | 2 000 / 80 | — |
| A document's whole text | 64 Mi characters | — |
| Downloads / parse children at once | 2 / 2 | — |
| API call / PDF timeout | 10 s / 120 s | — |
| Parse child | 60 s, `--max-old-space-size=512`, 1 GiB resident (Linux watchdog) | — |
| Cache | 2 GiB, least recently read evicted | `FR_URBAN_RULES_CACHE_MAX_BYTES` |
| Query string, request body | 4 KiB each (gateway) | — |

"Per user" is `X-Authenticated-User`, which Caddy sets from the signed-in
account. Without it (`pnpm dev`, no Caddy) the client address is the key —
behind `web` that is nginx's, so everyone shares one budget — and the log says
so once.

**The extraction limits are the only bound on model spend** from this
service (096.7's limits cap one call's size, not how many calls are made): a
job makes at most two calls per chunk, and the chunk count is capped by the
80-page chapter. The extraction start is charged at the POST and given back
if the job ends without a model call (a cache hit found after fetching, a
failed fetch, `extraction_unavailable`).

**What counts.** The read limit counts **every** `GET v1/chapter` request — a
cache hit, a joined fetch, a refused input and a failure alike. The fetch
limit counts **every network attempt** this request starts: a cache miss that
is not joining one in flight, **including attempts that then fail**
(`version_changed`, `not_found`, `source_*`, `document_*`); it **never**
counts a cache hit or a joined fetch.
Counts are in memory and forgotten on restart.

### Follow-up (2026-10-20): long extract calls

Node's `fetch` (undici) gives up on a response whose headers have not come
within **300 s**, and ai-service answers an extract call only once the model
has finished — longer than that with a slow local model. The extract call
therefore goes through an undici `Agent` with its header and body timeouts
off (Node's own `Agent`, reached through the key undici registers its global
dispatcher under, as the platform's `provider-fetch.ts` does; failing that,
the plain `fetch` is used and a warning says so once). Its one bound is
`FR_URBAN_RULES_EXTRACT_TIMEOUT_MS` (30 minutes by default), which should be at
least ai-service's own deadline.

## The cache

`${PLUGIN_SERVICES_DATA_DIR}/com.archisimple.fr-urban-rules/documents/<sha1(upper(idurba)/nomfic)>/`
holds `meta.json`, `outline.json` and `pages.jsonl` (one `{ page, text }` per
page). **The PDF is deleted once read.** A GPU version is a new `idurba`, so an
entry never goes stale; the ETag is recorded, not revalidated. Public
documents only — never a user's name, a project or a decision. Losing the
volume costs re-downloads, nothing else.

## Logs

One JSON line per event on stdout: time, route, outcome, duration, `idurba`,
`nomfic`, zone, pages, `found`, `match`, bytes, cache `hit` / `miss` /
`joined`, and the user as `HMAC-SHA256(PLUGIN_SERVICES_LOG_KEY, …)[:12]`
(computed by the gateway). **Never** a page's text, a title, a password or a
raw name. Level: `FR_URBAN_RULES_LOG_LEVEL` (`debug`, `info` (default),
`warn`, `error`).

## Variables

| Variable | Default | Set by |
| --- | --- | --- |
| `PLUGIN_SERVICES_DATA_DIR` | `./.data` (`/data` in the image) | compose |
| `PLUGIN_SERVICES_LOG_KEY` | random per start | `.env` |
| `ARCHISIMPLE_AI_SERVICE_URL` | `http://127.0.0.1:4321` | compose; the extract route's ai-service |
| `FR_URBAN_RULES_LIMIT_FETCH_HOUR` | `30` | optional |
| `FR_URBAN_RULES_LIMIT_READ_MINUTE` | `60` | optional |
| `FR_URBAN_RULES_CACHE_MAX_BYTES` | `2147483648` | optional |
| `FR_URBAN_RULES_LOG_LEVEL` | `info` | optional |
| `FR_URBAN_RULES_LIMIT_EXTRACT_HOUR` | `6` | optional |
| `FR_URBAN_RULES_LIMIT_EXTRACT_DAY` | `20` | optional |
| `FR_URBAN_RULES_LIMIT_REFRESH_DAY` | `2` | optional |
| `FR_URBAN_RULES_EXTRACT_CHUNK_CHARS` | `40000` (the ceiling) | optional: smaller chunks for a slow local model |
| `FR_URBAN_RULES_EXTRACT_MAX_ITEMS` | `120` (ceiling 200) | optional: items asked per chunk |
| `FR_URBAN_RULES_EXTRACT_TIMEOUT_MS` | `1800000` (30 min; floor 120 000) | optional: one extract call's limit here; keep it ≥ ai-service's `AI_SERVICE_REQUEST_TIMEOUT_MS` |

No model key, and none is ever read here (ADR-0114 Rule 7).

## The dependency: `pdfjs-dist`, pinned

`pdfjs-dist` is pinned to **exactly `6.2.108`**, the editor's version on
2026-10-20 (`apps/web` declares `^6.2.108`). Nothing keeps the two in step:
when the platform moves, raise this pin by hand, `npm install`, and commit the
lockfile.

Install as the image does, **without optional dependencies**:

```bash
cd services/fr-urban-rules-service && npm ci --omit=dev --omit=optional --ignore-scripts
```

`publish-index.yml` installs the same way on Node 22, runs `npm audit
--omit=dev --audit-level=high` here and the services' tests on every push to
`main`.

`@napi-rs/canvas` (optional, native) is not needed to read text. pdf.js 6
constructs `DOMMatrix` and `Path2D` at module load and takes them from that
package; `src/parse-child.mjs` supplies inert stand-ins so the module loads
without it. Nothing here renders.

## Developing

```bash
# from the repository root: the tests (no network, no PDF)
node --test 'services/*/tests/*.test.mjs'

# the gateway, with this service, on :4500, data in services/gateway/.data
cd services/gateway && npm run dev

# the editor, in ../archisimple, proxying /plugins-api to it
ARCHISIMPLE_PLUGIN_SERVICES_ORIGIN=http://127.0.0.1:4500 pnpm dev
```

**What is tested on what.** The pdf.js path — the child process, the outline,
`getTextContent`, a child running out of memory or time — runs on small
synthetic PDFs built in `tests/helpers.mjs`. Chapter finding and text
preparation run on text recorded from Lyon's and Gordes' règlements in
`../../test-fixtures/fr-urban-rules/<plot>/regulation/`. **The pdf.js path is
never tested on the real files**, which are not committed (size, licence).
`scripts/record-fixture.mjs` re-records a fixture from a PDF you downloaded
yourself.
