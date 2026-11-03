# Coverage — smoke (2026-11-03)

> **A smoke run, not the national figure.** 25 communes drawn, to check the method end to end. The strata are mostly unrepresented and the intervals below are wide: do not quote any rate in this file.

Sprint 002.10 DEC-6, made by `tools/measure-coverage.mjs`. Only statuses, latencies and a classification were kept (see the CSV beside this file); no document, règlement or response body.

> Data: the services read here publish under the Licence Ouverte v2.0 (attribution required). The exact usage terms of the Géoportail de l’urbanisme and API Carto were **not verified** when this script was written: read them before a large pass and before any public claim.

## Method

- **Population:** `geo.api.gouv.fr/communes`, list of 2026-11-03, SHA-256 `5e9db78b1449e7d062bad87e621b01440ad50eb6d8b42ab619ee389e8a13c06f`; 34879 eligible communes (overseas collectivities `98x` excluded).
- **Sample:** seed `20261103`, 25 requested, 25 drawn in 25 of 395 strata (département × population band), plus 5 reference communes left out of the estimates. The same seed on the same list draws the same communes.
- **Per commune:** API Carto `municipality?insee=` (`is_rnu`), API Carto `document?geom=<centre>` (type, partition), the GPU `document?partition=&status=document.production` (publication date), Géorisques v1 `gaspar/risques`.
- **State:** `rnu` when `is_rnu`; else `cc` for a carte communale document, `plu` for any other document; else `not-on-gpu`; `unknown` when the commune’s own questions failed. A document at the centre of an `is_rnu` commune is listed under Conflicts, not counted twice.
- **Estimates:** weighted by stratum size over draws; Wilson 95 % interval at the weights’ effective size (24.1).
- **Pace:** one request at a time, at most 2 a second; `User-Agent: ArchiSimple-fr-urban-rules-coverage/0.1.0`.

## States

| State | Drawn | Weighted share | 95 % interval |
| --- | ---: | ---: | --- |
| `plu` | 9 | 34.7 % | 19.0 % – 54.6 % |
| `cc` | 4 | 15.6 % | 6.1 % – 34.6 % |
| `rnu` | 9 | 38.9 % | 22.3 % – 58.6 % |
| `not-on-gpu` | 3 | 10.8 % | 3.5 % – 28.9 % |
| `unknown` | 0 | 0.0 % | 0.0 % – 13.7 % |

The `not-on-gpu` row is the rate at which a user meets Rochefort’s state: a commune under neither the national rules nor a document the GPU holds.

Document types (drawn communes, unweighted): CC 4 · PLUi 9.

## Latency and errors

| Endpoint | Calls | Errors | p50 | p95 | Max | Statuses |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| municipality | 30 | 0 (0.0 %) | 101 ms | 397 ms | 477 ms | 200×30 |
| document | 30 | 0 (0.0 %) | 84 ms | 325 ms | 389 ms | 200×30 |
| gpu | 16 | 0 (0.0 %) | 195 ms | 1346 ms | 1346 ms | 200×16 |
| georisques-v1 | 30 | 0 (0.0 %) | 57 ms | 108 ms | 594 ms | 200×30 |

## Documents in force

16 distinct documents (partitions) with a publication date: median age 293 days, 95th percentile 3667 days; **3 published in the last 90 days (18.8 %)** — what the daily watch’s load looks like. Counted over the documents met, not weighted: a PLUi met by several communes counts once.

## Conflicts and gaps

No commune had both `is_rnu` and a document at its centre.

370 of 395 strata have no draw and are not represented in the estimates (25145 communes).

## Reference communes

| INSEE | State | Type |
| --- | --- | --- |
| 69123 | `plu` | PLUi |
| 84050 | `plu` | PLU |
| 56196 | `not-on-gpu` | — |
| 55083 | `rnu` | — |
| 55364 | `cc` | CC |

