# Changelog — `fr-urban-rules`

## 0.6.1 — PLUi in sectors

- **A PLUi in sectors links its regulation again.** API Carto names such a
  document's partition `DU_<siren>_<sector>` (`DU_200054807_B`), which the GPU
  document API refuses as `partition` with an HTTP 400: the « Regulation
  file » source read « Refused the request (HTTP 400) » on every read. The
  list is now asked by the EPCI's `grid` (`?grid=200054807&status=document.production`)
  and only the partition's own entries are its documents; the companion
  service (`fetcher.mjs`, `document.mjs`) does the same and accepts the
  suffix in its input pattern. Found by the owner on « Chemin de
  Saint-Hilaire » (2026-10-20).

## 0.6.0 — Sprint 002.6b, Written Rules Confirmation

- **Phase 2 integration walk (2026-10-20):** a written ratio's base is a
  noun phrase (« the plot area », « la surface du terrain »), since the host
  writes the « of » / « de » itself (`regulations.limit.ratioOf`): the editor
  read « ≥ 15 % of of the plot area » before.
- **Written rules, on request.** Where the deployment runs the companion
  service, each PLU(i) zone shows the state of its written regulation's
  reading. A read only asks the service's cache (`cachedOnly=1`), never a
  model; **Lire les règles écrites** starts one extraction per zone (`POST`),
  answers at once, and the job is polled (3 s, then 10 s after a minute). Each
  change of the job fires `onDidChange` after the current read has returned;
  the host reads again with `source`. **Relire** is offered for a partial
  result, another provider or an older schema or prompt version; **Réessayer**
  after a failure that may pass. Every service code has its phrase.
- **Each rule of the zone's sector** becomes a `written` rule **to confirm**:
  its limit (value, ratio, height relative to the façade height with offset
  and minimum, or a statement), page, article, quoted passage, conditions,
  exceptions and confidence (a low one said in words). Rules of other sectors
  are counted, not shown. Keys: `written:<sector|*>:<cyrb53(normalised
  passage)>`, `~2` on a collision — a new model or chunking that quotes another
  span gives a new key, and the old confirmation shows as no longer read.
- **Merging:** a written « voir le document graphique » defers to a drawn rule
  of its kind (shown as information) or is not evaluable without one; a written
  façade height « voir le document graphique » relabels a drawn total height
  as a façade height (Q46), and a drawn confirmation of another kind — or of
  none, before 0.6.0 — reopens.
- **Confirming:** Confirm, Does not apply, Edit value (on value and ratio
  limits only) and Reopen. A written decision stores, within section schema 1,
  the kind, the full limit, `provenance` and the citation (passage cut at
  1,000 characters), so a confirmed written rule is shown, cited and checked
  without the service. An action on a written rule the session no longer
  holds is refused « Relire le règlement avant de confirmer ». Drawn
  confirmations now store their kind.
- **Checks:** a written value setback or height is checked as a drawn one; a
  setback relative to the façade height is one check per building, the worst
  sample of the worst façade governing (`byFacade`); a distance between
  buildings and a described rule are not checked, and say so.
- **Version change:** another version's extraction is never shown; a written
  confirmation of an older version reopens with its old limit and citation.
- `written:` is now a known prefix (002.6a's reader lists it as newer).
- Review fixes (2026-10-20): a confirmed written footprint ratio of the plot
  area (« au plus ») feeds the footprint budget; failing polls back off and
  fail the zone after five, or a job stuck 35 minutes; polling pauses on any
  plot without written rules; the service's retry time is kept and honoured;
  a value whose comparison contradicts its kind is left out; a drawn
  confirmation's kind stands until a written result says otherwise; written
  rules past 1,000 are counted and said.

## 0.5.0 — Sprint 002.6a, Zone Page Link

- **SDK 1.28.** The companion service is found through the ambient
  `plugin-service` token (`getOptional`, `locate()` on each PLU(i) read).
- The regulation link opens at the zone's page where the deployment runs the
  service: one `GET v1/chapter` per zone, in parallel, kept for the session
  (Refresh asks again; a passing failure after 60 s); the read waits up to
  2 s, and a late answer applies at the next read with no request. One link
  per zone, labelled with its zone and page (and the chapter's title on a
  prefix match); `report.document.href` is the first zone's, with
  `#page=<n>`. The page is added at each read, never stored in the cached
  report.
- Without the service, the link opens at the first page as before and the
  overview carries an `info` notice that reading the written regulation is
  not available on this deployment. A service error says only that the page
  is not known (the link's detail), never a source failure.
- **Forward-compatible section reader:** a confirmation whose `ruleKey`
  prefix is not `rnu:`, `psc:` or `entered:` is from a newer version — kept
  whole, listed read-only with no Forget, never "no longer in the plan". The
  section stays `schema: 1`.
- Review fixes (2026-10-20): the source fires `onDidChange` when a late
  chapter changes the link, so the host reads again and shows the page;
  `document.href` is the first zone **with** a page; Refresh keeps the page
  shown (and does not wait) until a new answer lands, and a passing failure
  keeps it; a failed lookup is asked again after 5 min (`source_*`), 1 min
  (`busy`, `internal_error`, network) or its `Retry-After`; Confirm, Does not
  apply, Edit value and Reopen refuse a newer entry; a chapter answer needs
  its page count (≤ 2,000) and a JSON `Content-Type`.

## 0.4.0 — Sprint 002.3, Surfaces and Capacity

- Surfaces view: emprise au sol under a named definition (R.420-1, the PLU's
  lexicon, projection with all overhangs), the footprint budget, pleine terre,
  the surface de plancher (R.111-22) with its deductions, extension and annex
  caps, a capacity estimate and indicative procedure flags (thresholds read on
  Légifrance on 2026-10-20).
- The programme warning `fr-urban-rules.programme` (`ai` capability).
- **Migration:** `com.archisimple.urban-rules` is retired. An installed copy
  stays installed until its user removes it; its three preferences
  (`plotAreaSquareMetres`, `siteCoverageRatio`, `maxStoreys`) are dropped, not
  migrated — the plot area comes from the Site, coverage and storeys from
  confirmed rules. While both run, the overview asks to disable it.
- Review fixes of 0.3.0 (Sprint 002.2, 2026-10-20): reopened entered rules can
  be confirmed again; actions ordered and cut with a notice; rules capped at
  1,000; the parser reads no value from minimums, levels, altitudes and
  thousands; keys from the unsimplified centroid; no envelope on a concave
  boundary; percentages at most 100. **Drawn rules' keys changed** (0.3.0 was
  never released).
- 002.4 acceptance tooling: the developer command « Capture test fixtures
  (developer) » (`fr-urban-rules.dev.captureFixtures`, new `commands`
  capability) reads the current plot once through recording services and
  downloads the inputs the end-to-end tests replay; it writes nothing to the
  project. Ships in every install, but is registered **only when the
  preference `fr-urban-rules.devCapture` is `true`** (default off; read at
  activation; the host keeps it in `localStorage` under
  `archisimple.ext.shared.fr-urban-rules.devCapture`). The `commands`
  capability is declared for this command alone.
- 002.4 acceptance follow-ups (2026-10-20): R.111-17 and the drawn and entered
  setbacks give **one check per rule per building** — the worst edge governs
  (its result, figures and figure), the other edges are listed with their
  distances in the check's subject. Lyon's rear setback counts 1 potential
  issue, not 4. The per-edge bands are unchanged.

## 0.3.0 — Sprint 002.2, Drawn and Entered Rules

- Drawn prescriptions with a number, hand-entered rules, confirmations; see the README.

## 0.2.1 — Sprint 002.1b, Alignment and Neighbours

- R.111-16 to the opposite alignment, R.111-15, R.111-28's neighbours, setback bands.

## 0.2.0 — Sprint 002.1a, RNU Rules

- The coded national rules, the Site boundary's edges and R.111-17's checks.

## 0.1.0 — Sprint 002.0, PLU Reading

- The regime, the document in force, zones, prescriptions, easements, risks and the regulation link.
