# fr-urban-rules-service

The companion service of the package `com.archisimple.fr-urban-rules`
(Sprint 002.5a; ADR-0114 in the platform). It reads a plot's **règlement** —
the written rules of a PLU or PLUi — from the Géoportail de l'Urbanisme, keeps
its text by document version, and finds the zone's chapter in it.

Since 0.3.0 (Sprint 002.10) it also **watches** the documents it holds — which
document is in force on the GPU, and whether that changed — and **proxies
Géorisques v2** with the deployment's token, so the token never reaches a
browser.

It is **not a package**: it is never zipped, installed or loaded into the
editor. The deployment runs it in the `plugin-services` container, behind the
gateway (`../gateway`), at `/plugins-api/com.archisimple.fr-urban-rules/`. The
extension reaches it over HTTP only (002.6a is its first consumer).

**Node ≥ 22.13** (`pdfjs-dist` 6's `engines`); the image is `node:24.22.1-alpine`.

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

  | Input       | Pattern                                         |
  | ----------- | ----------------------------------------------- |
  | `partition` | `^DU_[0-9A-Z]{5,9}$`                            |
  | `idurba`    | `^[0-9A-Za-z_-]{1,64}$`                         |
  | `nomfic`    | `^[0-9A-Za-z_.-]{1,160}\.pdf$`                  |
  | `zone`      | 1–40 printable characters (never sent upstream) |

Errors answer `{ "error": "<code>", …details }`:

| Code                     | Status | Meaning                                                                                                                                                                 |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_request`        | 400    | an input fails its pattern (`field` names it), or a path segment is unsafe (gateway)                                                                                    |
| `not_found`              | 404    | no document in production for the partition, or `nomfic` is not among its files                                                                                         |
| `version_changed`        | 409    | the document in force is another `idurba` (`inForce` lists it)                                                                                                          |
| `rate_limited`           | 429    | over a limit; `Retry-After` says when                                                                                                                                   |
| `source_unavailable`     | 502    | the GPU answered 5xx, timed out or sent something unreadable                                                                                                            |
| `source_refused`         | 502    | a 4xx, a refused address, or a redirect off the allow-list                                                                                                              |
| `document_too_large`     | 422    | over 32 MiB, over 2 000 pages, or over 64 Mi characters of text                                                                                                         |
| `not_a_pdf`              | 422    | the body does not start `%PDF-`                                                                                                                                         |
| `document_unreadable`    | 422    | the parse child failed, died, or ran out of time or memory                                                                                                              |
| `no_text_layer`          | 422    | under 200 characters per page: a scan (no OCR)                                                                                                                          |
| `zone_chapter_not_found` | 422    | `outlineCodes` and `contentsCodes` list what was seen. A parent code counts only when the zone adds a lower-case sector letter (`UCe1` for `UCe1b`, never `A` for `AU`) |
| `chapter_too_large`      | 422    | the chapter found spans over 80 pages                                                                                                                                   |
| `not_cached`             | 404    | `cachedOnly`: no result (or no cached text) for this chapter                                                                                                            |
| `busy`                   | 503    | the extraction queue is full; `Retry-After`                                                                                                                             |
| `extraction_unavailable` | 503    | ai-service lacks `structured-output`, or has no provider                                                                                                                |
| `extraction_failed`      | 502    | every chunk failed; `codes` lists 096.7's                                                                                                                               |
| `not_configured`         | 503    | `v1/georisques` with no `FR_URBAN_RULES_GEORISQUES_TOKEN` (002.10)                                                                                                      |
| `internal_error`         | 500    | an unexpected exception; only its name is logged                                                                                                                        |

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
chosenBy }`, `conditions`, `exceptions`, `sectorUnplaced`, `confidence`, and
(0.5.0, prompt version 3) `strip` — present only on a height held to a strip
along the plot's limits: `{ depthMetres, edges: all | street | side | rear |
side_rear, permits }`; a result without it reads as no strip.
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
  is null. A `strip` is kept only on a `height_total` or `height_facade` that
  is a `limit` in metres, with a depth of 0.1 to 50 m that the passage writes;
  else the item is a statement in words (`described`, no limit, `low`), counted
  under `stripNotInPassage`. Also: a repeated passage takes the occurrence under
  its sector's heading, else the first at `low` confidence; conditions and
  exceptions must be verbatim between the sector heading (or 1 500 characters)
  before the passage and 600 characters after its end (a règlement writes its
  alternative rules after the rule); statement, limit and unit must agree, and a comparison against
  the package's floors lowers the confidence. What fails is counted in
  `dropped`; a chunk that fails twice is counted in `chunks.failed`.
- **Chunks** are cut at article headings, at most 40 000 characters (or
  `FR_URBAN_RULES_EXTRACT_CHUNK_CHARS`, or ai-service's `maxTextLength`,
  whichever is smaller); each is one call, retried once on
  `output_truncated`, `output_invalid` or `provider_error`.

## The document watch (Sprint 002.10)

```text
GET v1/documents/DU_200046977
→ 200 { "partition": "DU_200046977",
        "current": { "gpuDocId": "4f3d…", "originalName": "200046977_PLUi_20260326",
                     "publicationDate": "2026-04-23" },
        "withdrawn": false, "checkedAt": "2026-11-03T08:00:00.000Z",
        "previous": [ { "gpuDocId": "…", "originalName": "…", "supersededAt": "…" } ],
        "failing": { "code": "source_unavailable", "days": 3 } }      ← only when it is
```

- **The GPU is the authority** for « a new version exists »: the document API
  asked for the partition **with `status=document.production`**. Without the
  filter the default page is 20 archived items, oldest first, and a document in
  force can fall outside it (probe 2026-10-19). A new version is a different
  `id`; `originalName` is compared case-insensitively (`PLUi` / `PLUI`).
- **Zero in production** is `withdrawn: true`, `current: null` — a commune back
  under the national rules or not on the GPU — never « no rules ». More than one
  is logged as an anomaly and the newest taken.
- **What is watched:** every partition the service holds a document for (seeded
  from the document cache at start and from every chapter or extraction read,
  with no GPU call), and any partition a client asks about (**one** GPU call, the
  asking user's `FR_URBAN_RULES_LIMIT_WATCH_SEED_HOUR`, default 60 an hour). A
  partition with nothing in production that was never known is answered, not
  recorded.
- **Schedule:** about daily — 24 h plus a per-partition offset under 4 h, so a
  deployment does not ask every partition at once — through one gate: **at most
  one GPU request a second**, whoever asked. A failure backs off (5 minutes,
  doubling, to 6 hours); three days of failures are logged as `watch_failing` and
  said in the answer (`failing`), and the record is kept. `FR_URBAN_RULES_WATCH=off`
  stops the schedule (the route still answers).
- **A record** is one JSON file per partition under `<data>/<package id>/watch/`
  — identifiers and dates, no parcel, address, geometry or user — outside the
  cache's byte budget. One no client has read for 180 days is forgotten.
- **Eviction (DEC-2).** The PDF is deleted once read, so there is nothing to
  evict at once; a superseded version's **text and extractions** go 90 days after
  it was superseded (a project confirmed on the old version can still show what it
  confirmed), and an extraction under another `schemaVersion` goes at the next
  sweep. Re-extraction is the user's to ask (owner decision, 2026-11-03).
- **Never the project.** The watch writes nothing but its records and reopens
  nothing: confirmations reopen at read time from the stored `idurba`.

## Géorisques v2, through the service (Sprint 002.10)

```text
GET v1/georisques                         → { "configured": true, "api": "v2" }
GET v1/georisques/rga?longitude=4.83&latitude=45.76
GET v1/georisques/radon?codesInsee=69123
→ the v2 answer as JSON — and nothing of its headers
```

- **The token** is `FR_URBAN_RULES_GEORISQUES_TOKEN`, read from this service's
  environment only. It is added to `Authorization` on the way out and appears in
  no response, log line, error detail or file (the tests grep for a fake one); a
  value that is not a plain header value turns the proxy off, said without it.
  Géorisques' registration is free; there is no token in this repository.
- **An allow-list**, from Géorisques' public OpenAPI description
  (`/api/v3/api-docs/georisques-api-v2`, read 2026-11-03): `gaspar/risques`,
  `gaspar/pprn`, `zonage_sismique`, `rga` and `radon`, with `codesInsee`,
  `longitude`, `latitude`, `rayon`, `pageSize` and `pageNumber` — each value
  checked by pattern, none repeated. No `geometry`, no `codesParcelle`. Anything
  else is `404`/`400` before a request is made.
- **Cached 24 hours** in memory per path and parameters (500 entries); a hit
  costs the user nothing, a miss counts against `FR_URBAN_RULES_LIMIT_GEORISQUES_HOUR`
  (240 an hour per user). A failed call is not cached.
- **No token → `503 not_configured`**, and the extension keeps v1 from the browser.
  A rejected token (`401`/`403`) is `source_refused` with `reason: token_rejected`
  and a log line once in ten minutes; the upstream's words are never passed on.
- **Unverified (no token yet):** the exact `Authorization` value Géorisques
  expects — the OpenAPI names the scheme « Bearer token » but types it as an API key
  in the header, so the raw token is sent;
  `FR_URBAN_RULES_GEORISQUES_AUTH_SCHEME=Bearer` sends `Bearer <token>` — and the
  shape of a real answer. **v2 is not v1 with another prefix:** `gaspar/risques`
  lists GASPAR _procedures_ (with their communes and aleas), not a commune's
  `risques_detail`; `zonage_sismique` answers `{ typeZone, zoneSismicite }` with no
  commune or zone code; `gaspar/pprn`, `rga` and `radon` are close to v1's. The
  extension therefore still reads v1; mapping v2 needs real payloads.

## The model and the entitlement (Sprint 002.16)

The extraction is read by **the provider the user chose in the editor's AI panel**, and the call to ai-service is made **as
that user** (platform ADR-0114 Rule 14; ADR-0028 Rule 11).

```text
POST v1/extractions { partition, idurba, nomfic, zone, ai?: { providerId, model? } }   [?refresh=1]
GET  v1/extractions?partition&idurba&nomfic&zone[&provider[&model]]&cachedOnly=1
```

- **`ai`** is optional and strict: `providerId` `^[a-z0-9][a-z0-9_-]{0,39}$`, `model` 1–120 printable characters holding no
  `://`, nothing else (**no endpoint, no key**). Anything else is `400 invalid_request`, `field: "ai"`. Without it, ai-service's
  default provider for that caller reads, as before. It is forwarded as `providerId` and `model` in `POST /api/ai/extract`.
- **`current`** in a cached read is `{ providerId, schemaVersion, promptVersion }` with the requested provider (else ai-service's
  default for the caller), so a result read by another provider offers « Extract again ».
- **Who is asking.** The gateway hands the service `features`, from `X-Authenticated-Features` — the account's features, which
  the deployment's account gateway overwrites on every request and `web` passes on to `/plugins-api/`. Only well-formed ids are
  kept (`^[a-z0-9][a-z0-9-]{0,39}$`, at most 32, header at most 1 024 characters, else none). The service stores them with the
  job and sends `X-Authenticated-Features` on `extract` and `health` to ai-service — nothing else about the user, never an
  `Authorization`. **ai-service decides**: a granted provider needs `ai-<id>`.
- **Refusals** are the job's `error`, with ai-service's own code, at the first chunk and free of charge (the charge is given
  back): `provider_not_permitted` (the account was not granted it), `unknown_provider`. `{ code, providerId }`.
- **A cached result, or a job already running for the chapter, is served to whoever asks**: it costs no model call.
  « Extract again » is a new call and is refused like any other.
- **Without the header** (`pnpm dev`, a deployment without accounts) no features are sent and ai-service, which believes the
  header only when `AI_SERVICE_TRUST_ACCOUNT_FEATURES` is on, treats the call as anonymous.
- Logs name `requestedProvider`; never the features.

## Hosts contacted

Three, over `https:` only, from URL templates — no URL comes from a
client (the third only when the deployment sets a Géorisques token):

| Host                               | Path                                                     | Why                                                            |
| ---------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `www.geoportail-urbanisme.gouv.fr` | `/api/document?partition=<p>&status=document.production` | the document in force                                          |
|                                    | `/api/document/<id>/files`                               | its file list                                                  |
|                                    | `/api/document/<id>/files/<nomfic>`                      | the règlement (answers `302`)                                  |
| `data.geopf.fr`                    | `/annexes/gpu/documents/<partition>/<id>/…`              | the PDF, after that redirect                                   |
| `www.georisques.gouv.fr`           | `/api/v2/<allow-listed path>?<allow-listed parameters>`  | the Géorisques v2 proxy, with the token; a redirect is refused |

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

| What                                                                                                                    | Limit                                                             | Variable                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Document fetches (download + parse, a cache miss)                                                                       | 30 per hour per user                                              | `FR_URBAN_RULES_LIMIT_FETCH_HOUR`                                       |
| Every request — `GET chapter`, every extraction POST, poll and cached read (a flood guard)                              | 60 per minute per user                                            | `FR_URBAN_RULES_LIMIT_READ_MINUTE`                                      |
| Starting an extraction (a job that calls a model; a cache hit, a join, or a job that ends without a model call is free) | 6 per hour, 20 per day, per user                                  | `FR_URBAN_RULES_LIMIT_EXTRACT_HOUR`, `FR_URBAN_RULES_LIMIT_EXTRACT_DAY` |
| `refresh=1`                                                                                                             | 2 per day per user                                                | `FR_URBAN_RULES_LIMIT_REFRESH_DAY`                                      |
| A first look at a partition not yet watched (one GPU call)                                                              | 60 per hour per user                                              | `FR_URBAN_RULES_LIMIT_WATCH_SEED_HOUR`                                  |
| Géorisques v2 calls the cache did not answer                                                                            | 240 per hour per user                                             | `FR_URBAN_RULES_LIMIT_GEORISQUES_HOUR`                                  |
| The watch's own GPU requests (daily checks and first looks together)                                                    | 1 per second                                                      | —                                                                       |
| Extractions running / waiting                                                                                           | 1 / 10                                                            | —                                                                       |
| Download size, counted while streaming                                                                                  | 32 MiB                                                            | —                                                                       |
| Document pages / chapter pages                                                                                          | 2 000 / 80                                                        | —                                                                       |
| A document's whole text                                                                                                 | 64 Mi characters                                                  | —                                                                       |
| Downloads / parse children at once                                                                                      | 2 / 2                                                             | —                                                                       |
| API call / PDF timeout                                                                                                  | 10 s / 120 s                                                      | —                                                                       |
| Parse child                                                                                                             | 60 s, `--max-old-space-size=512`, 1 GiB resident (Linux watchdog) | —                                                                       |
| Cache                                                                                                                   | 2 GiB, least recently read evicted                                | `FR_URBAN_RULES_CACHE_MAX_BYTES`                                        |
| Query string, request body                                                                                              | 4 KiB each (gateway)                                              | —                                                                       |

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

| Variable                                | Default                           | Set by                                                                                          |
| --------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PLUGIN_SERVICES_DATA_DIR`              | `./.data` (`/data` in the image)  | compose                                                                                         |
| `PLUGIN_SERVICES_LOG_KEY`               | random per start                  | `.env`                                                                                          |
| `ARCHISIMPLE_AI_SERVICE_URL`            | `http://127.0.0.1:4321`           | compose; the extract route's ai-service                                                         |
| `FR_URBAN_RULES_LIMIT_FETCH_HOUR`       | `30`                              | optional                                                                                        |
| `FR_URBAN_RULES_LIMIT_READ_MINUTE`      | `60`                              | optional                                                                                        |
| `FR_URBAN_RULES_CACHE_MAX_BYTES`        | `2147483648`                      | optional                                                                                        |
| `FR_URBAN_RULES_LOG_LEVEL`              | `info`                            | optional                                                                                        |
| `FR_URBAN_RULES_LIMIT_EXTRACT_HOUR`     | `6`                               | optional                                                                                        |
| `FR_URBAN_RULES_LIMIT_EXTRACT_DAY`      | `20`                              | optional                                                                                        |
| `FR_URBAN_RULES_LIMIT_REFRESH_DAY`      | `2`                               | optional                                                                                        |
| `FR_URBAN_RULES_EXTRACT_CHUNK_CHARS`    | `40000` (the ceiling)             | optional: smaller chunks for a slow local model                                                 |
| `FR_URBAN_RULES_EXTRACT_MAX_ITEMS`      | `120` (ceiling 200)               | optional: items asked per chunk                                                                 |
| `FR_URBAN_RULES_EXTRACT_TIMEOUT_MS`     | `1800000` (30 min; floor 120 000) | optional: one extract call's limit here; keep it ≥ ai-service's `AI_SERVICE_REQUEST_TIMEOUT_MS` |
| `FR_URBAN_RULES_GEORISQUES_TOKEN`       | unset (proxy off)                 | `.env`: the deployment's free Géorisques v2 token; this service only                            |
| `FR_URBAN_RULES_GEORISQUES_AUTH_SCHEME` | unset (raw token)                 | optional: `Bearer` sends `Bearer <token>`                                                       |
| `FR_URBAN_RULES_WATCH`                  | on                                | `off` stops the daily schedule                                                                  |
| `FR_URBAN_RULES_LIMIT_WATCH_SEED_HOUR`  | `60`                              | optional                                                                                        |
| `FR_URBAN_RULES_LIMIT_GEORISQUES_HOUR`  | `240`                             | optional                                                                                        |

No model key, and none is ever read here (ADR-0114 Rule 7). The Géorisques token is another kind of credential — a public service's free registration, not a model's — and is this service's alone.

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
