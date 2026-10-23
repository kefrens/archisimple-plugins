# Règles d'urbanisme (PLU) — `fr-urban-rules`

`com.archisimple.fr-urban-rules` · extension · SDK **1.35** · capabilities `regulations`, `document`, `ai`, `commands`

Reads the planning rules that apply to a French plot and hands ArchiSimple a
country-neutral `RegulationReport` (platform ADR-0111): which regime applies
(PLU, PLUi, carte communale, RNU, "plan not on the GPU", or "not known"), the
document in force and its version, the zone, the prescriptions, information
items and public-utility easements on the plot, the risks Géorisques lists, and
a link to the regulation. Decisions never from a read; readings to the cache:
what it writes to the project's section is only what the user decided —
confirmations, entered rules, edge roles and the Surfaces answers — one Request
each; since 0.9.0, what it **read** is kept beside it in the package's Site
cache (platform ADR-0115), off the history, written only when the reading
changed.

Phase 1 of the [fr-urban-rules milestone](../docs/milestones/fr-urban-rules/fr-urban-rules.md):
0.1.0 is Sprint [002.0 PLU Reading](../docs/sprints/sprint-002.0-plu-reading.md);
**0.2.0** is Sprint [002.1a RNU Rules](../docs/sprints/sprint-002.1a-rnu-rules.md);
**0.2.1** is Sprint [002.1b Alignment and Neighbours](../docs/sprints/sprint-002.1b-alignment-and-neighbours.md);
**0.3.0** is Sprint [002.2 Drawn and Entered Rules](../docs/sprints/sprint-002.2-drawn-and-entered-rules.md);
**0.4.0** is Sprint [002.3 Surfaces and Capacity](../docs/sprints/sprint-002.3-surfaces-and-capacity.md).
Phase 2: **0.5.0** is Sprint [002.6a Zone Page Link](../docs/sprints/sprint-002.6a-zone-page-link.md);
**0.6.0** is Sprint [002.6b Written Rules Confirmation](../docs/sprints/sprint-002.6b-written-rules-confirmation.md).
Phase 3: **0.7.0** is Sprint [002.7 Envelope and Sheet Content](../docs/sprints/sprint-002.7-envelope-and-sheet-content.md);
**0.8.0** is Sprint [002.8 Assistant Plot Questions](../docs/sprints/sprint-002.8-assistant-plot-questions.md);
**0.8.1** is Sprint [002.9 Design-Time Acceptance FR](../docs/sprints/sprint-002.9-design-time-acceptance-fr.md)'s
three defects: a written pleine terre ratio of the plot area is checked like a
percentage, a written extension share of the floor area is never measured
against the existing emprise (« not checked », the base named), and the Rules
view of a carte communale or the RNU says why no written regulation is read.
After Phase 3: **0.9.0** is Sprint [002.11 Planning Snapshot](../docs/sprints/sprint-002.11-planning-snapshot.md)
(SDK 1.33, platform 096.17); **0.10.0** is Sprint [002.12 PLU Panel Content](../docs/sprints/sprint-002.12-plu-panel-content.md)
(SDK 1.35, platform 096.19–096.21); **0.11.0** is Sprint [002.13 PLU Panel Diagrams](../docs/sprints/sprint-002.13-plu-panel-diagrams.md)
(SDK 1.36, platform 096.22); **0.12.0** is Sprint [002.14 PLU Flag Content](../docs/sprints/sprint-002.14-plu-flag-content.md)
(SDK 1.37, platform 096.25); **0.13.0** is Sprint [002.15 PLU Surfaces Content](../docs/sprints/sprint-002.15-plu-surfaces-content.md)
(SDK 1.38, platform 096.27).

## The Surfaces view (0.13.0)

A headline figure (the emprise au sol as a share of the plot, with its limit and result), the
definition as a choice of three cards that runs the same `emprise-definition` action as the form,
the budget as a used / remaining / allowed bar, and folded rows — détail, base de calcul, pleine terre,
surface de plancher, extensions et annexes, capacité théorique, procédure — each with a one-line
summary. Nothing read, measured or checked changes.

## The Risks view (0.12.0)

Each flag says what kind of thing it is, so the host draws the boards' Risks view: servitudes and
perimeters as rows (a short title by the SUP category, the source's own code beneath), the seismic
zone, the radon class and the clay exposure as tiles with a segmented level bar, a PPRN as a row, and
the risks listed for the commune folded to one line of chips. Nothing read changes: the labels, details
and citations are 0.11.0's.

The report places three blocks and one figure word; the host draws them. **Limites et reculs** shows
the host's plot top view (the parcel, the boundary with its edges lettered A, B…, the envelope, the
design, each measured distance in the tone of its result, the failing stretch in red) and its edge
list (« A · Voie · 3,20 m · min. 4,00 m », the role's assumption as a chip), then the **Set role**
actions; the edge table and its length column are gone. **Enveloppe** shows « Enveloppe en coupe », a
schematic section of the measured height checks, and « Hauteur depuis le terrain le plus bas » carries
a figure. Nothing read, measured or checked changes.

## The panel's report (0.10.0)

The host's Properties panel is one panel whose sections are the report's views, so the
report is shaped for it, and only shaped: the views come in the boards' order with an `icon` and
a `group` (the site and its rules, then the project against them), a **Document** view holds the
overview's fields, the link and its notices, the overview keeps its notices alone, the flags are in
**Risques**, each view without a count of the host's has a `summary`, the commune is the report's
`locality`, and each of the 57 assumptions is a short title with a `.detail` line. A written rule
to confirm offers « Confirmer 15 % ». Nothing read, measured or checked changes.

## The planning snapshot (0.9.0)

- **What is kept.** After a completed read of the plot on view, the facts the
  report is built from — the commune and the document parsed, each layer's
  items with their outlines in the Site's CRS, Géorisques' answers, the
  règlement's link — and the written readings shown, each rule with the key it
  had: `writeCache(data, attributions)` (SDK 1.33), schema 1, the credit lines
  of the sources present in the envelope. Never the raw answers, never a check,
  a count, the envelope or a capacity: those are computed again.
- **Fitted to the file.** Outlines kept within 100 m of the plot, to the
  centimetre, each feature's centroid kept as read (a drawn rule's key reads
  it). Past 200,000 characters: within 30 m, then simplified at 0.5 m, then
  the outlines of information, easements and prescriptions dropped, then the
  written passages shortened to 500 characters — each step said in the
  overview (« Simplified to fit the project file »). A snapshot that does not
  fit, or a write the host refuses, is not saved, said (« Not saved in the
  project: too large »), and the previous one stays. The six reference plots
  take 1.6–29 KB with no step.
- **Written only when the reading changed** (its dates aside): opening an
  unchanged project leaves it clean.
- **At open.** The editor reads a project holding a snapshot (096.17). The
  snapshot of the plot on view is shown at once — « Read on {date} — checking
  for changes… », its sources loading with their date — and the online read
  continues in the same read: its answer says « Unchanged since {date} —
  checked today » or « What changed since {date} » (a new version of the
  document with the confirmations to review, the regime, the zones, a
  prescription, an easement or a risk new or no longer listed — information,
  never a decision). Offline, each source is `saved` (SDK 1.33) — « shown as
  read on » its date — and the editor says once « Offline — N sources shown as
  read on {date} »; the règlement's link opens the file it named then; the
  checks are computed from it.
- **Confirmations hold.** A rule rebuilt from a snapshot has the key a fresh
  read gives it, so every confirmation still names it.
- **Written rules without the companion.** The written readings the snapshot
  holds are listed — « Written rules as read on {date} ({model}) » — beside the
  « not available on this deployment » notice; Extract again is not offered.
  With the companion, the project's reading stands; a different reading of the
  same document version is **offered** (« A newer reading of the written rules
  exists — Use it »), never taken silently, and accepting it changes no
  confirmation.

## The assistant's questions and the parked variations (0.8.0)

- **Four questions** the editor offers a language-model assistant as tools
  (`regulations_<id>`, SDK 1.32, platform 096.12) while the package declares
  `ai`: `can_add_storey` (`storeyHeight?` in metres, 2–6; `building?`),
  `road_distance` (`building?`), `max_height` (`building?`) and
  `remaining_area`. Each answers synchronously from the reader's last read of
  the Site — never a fetch — and only when that read is the report the host
  hands it (the same document version, every rule its own); otherwise it says
  to read again. A question about several buildings answers per building, up to
  four.
- **Claims, never text.** A limit is a claim on its rule (`basis: 'rule'`), which
  the host cites from the report; a figure is the editor's measure
  (`basis: 'measured'`); nothing is read out of a passage. Rule labels are the
  report's own words. Beyond the text, at most three *Interpretation* phrases
  from a closed list (the attic note, the relative-limit estimate, « these
  figures do not prejudge the decision »). No answer says « compliant ».
- **One headroom.** `heightHeadroom` gives the height a building may still gain
  under each height rule — absolute limits from their checks, R.111-17 and
  R.111-16 from the worst pair's margin over the factor (conservative: the top
  raised everywhere), a PLU's façade-relative setback from its check — and the
  same function now gives the programme warning its storey count (002.3 DEC-7
  moved). The storey height is the one named, else the design's own
  (`Level.height`), else the editor's 3 m, and the answer says which.
- **Confirm, offered.** When the tightest height limit is a rule to confirm
  with a value, `can_add_storey` and `max_height` offer **Confirm {value}**:
  the very section the Rules view's Confirm action writes, which the host
  proposes as one change (one undo entry), refused if the section changed.
- **Parked variations** (`checkVariation`, SDK 1.31, platform 096.11): the
  editor's variation figures — the Variations cards, « Compared with master »,
  the Checks view's « Across variations » — are measured by the read's own
  checks over the parked design (`site.measures` with its `variationId`, the
  host's list of its buildings) and the last read's rules, roads, alignments
  and section; no network, no read. Without a read of the Site matching the
  report it throws, and the host says *Could not be measured*.
- **The network list.** The manifest's `network.hosts` names the three hosts the
  browser code fetches (`FETCHED_HOSTS`; `fetchJson` refuses any other), for the
  package card once the platform renders it (096.13). Links the user opens
  (Légifrance) are not contacts.

## The theoretical envelope and the sheet (0.7.0)

- **From confirmed rules only.** Each Site boundary edge is set back by the
  largest confirmed minimum of its role (street, side, rear): a value setback,
  or a height-relative setback's minimum (R.111-17's 3 m). `insetByRole` works
  on a concave boundary: the boundary less each edge's strip, cut by overlay —
  a street edge's strip running on along its line past a convex corner (the
  half-plane cut, as 0.6.1 drew on a convex plot), a side or rear limit's ends
  and every re-entrant corner rounded, by tangents just inside the rounded
  line; setbacks that leave no ground or split the plot, or a result that fails
  its own check, are refused and said.
- **The volume** (SDK 1.29) hangs off the same `envelope` feature: slopes for
  the height-relative rules (R.111-17 from the side and rear chains, R.111-16
  from the opposite alignments, façade-relative setbacks with their start),
  heights for the total-height limits (within a drawn prescription), merged and
  checked against the host's limits before it is sent. The host draws it in 3D.
- **The « Enveloppe théorique » view** lists the ground area, the confirmed
  heights, the rules applied and not applied with their reasons, and the
  assumptions. Never "buildable": the checks, not the volume, say whether a
  design is within the rules.
- **The regulation sheet** (SDK 1.30): the report declares its blocks — plot,
  flags, checks with the rules not checked, the rules meter, the plot plan,
  assumptions — and its scope sentence; the host prints them with its own header
  and footer. Every string is in the print font's WinAnsi (`sheet.test.mjs`).

## Written rules (0.6.0)

- **Read on request, never by a read.** Where the deployment runs the
  companion service, the Rules view shows each PLU(i) zone's written
  regulation: « non lu » with **Lire les règles écrites**, the job's steps
  (« extraction, morceau 3 sur 9 »), then the rules read, the pages, the
  provider and the rules of other sectors not shown. A read asks only the
  service's cache (`GET extractions?…&cachedOnly=1`); the action starts one
  extraction (`POST`, a model call unless cached) and answers at once; the job
  is polled every 3 s, every 10 s after a minute, and stops when it ends, when
  another plot is on view, or on deactivation. Each change fires
  `onDidChange` once the current read has returned. **Relire** is offered for
  a partial result or a result from another provider or an older schema or
  prompt version.
- **Every state is named** — not read, queued, fetching, reading, extracting,
  partial, failed by code (chapter not found with the zones the service saw, an
  image with no text, a new version, busy or rate limited with the time to
  retry…). An empty list is never "no written rules".
- **A written rule enters to confirm**, `provenance: written`, with its page,
  article, quoted passage (verbatim, `lang: fr`), conditions, exceptions and
  confidence, and a link to the regulation at its page. Nothing extracted
  reaches a translation key, a parameter or a link but an integer page.
- **The relabel** (owner's Q46): a written « hauteur de façade … voir le
  document graphique » makes the drawn total height a façade height, said on
  the rule; a drawn confirmation taken on another kind, or before 0.6.0 (no
  kind stored), reopens.
- **Decisions are kept, readings are not.** A written confirmation stores the
  kind, the full limit, the citation and `provenance` in the Site section
  (still `schema: 1`), so it stands without the service, on another
  deployment, after the cache is gone. Confirming needs the rule read in this
  session; otherwise « Relire le règlement avant de confirmer ».
- **Checks:** written values as drawn ones; « R ≥ Hf − 4 m, min 2 m » per
  building against the façades' heights, the worst façade governing.
- **Surfaces:** a confirmed written « emprise au sol au plus de n % de la
  surface du terrain » is the footprint coefficient of the budget, as a
  percentage entered or drawn is.

## The zone's page (0.5.0)

- **Where the deployment runs the companion service**
  ([fr-urban-rules-service](../services/fr-urban-rules-service/README.md)),
  the regulation link opens at the zone's chapter: « Ouvrir le règlement, zone
  UCe1b, chapitre Zone UCe1, p. 121 » (a prefix match names the chapter it
  opens), « Ouvrir le règlement, zone A, p. 44 ». A plot on several zones gets
  one link per zone; `report.document.href` is the first zone that has a
  page.
- **Finding it:** `getOptional({ name: 'plugin-service' })?.locate()` on each
  PLU(i) read (SDK 1.28, ambient). The host caches the probe and probes a
  failure again after 60 s, so a service started later is found. Nothing is
  configured: the address is the editor's own origin.
- **One `GET v1/chapter` per zone** with a `nomfic`, in parallel, once per
  (`upper(idurba)`, `nomfic`, zone) per session; Refresh asks again, and keeps
  the page shown until the new answer lands. A failure that may pass is asked
  again, backing off — 5 min after `source_*`, 1 min after `busy`,
  `internal_error` or the network, `rate_limited` after its `Retry-After` —
  since each failed fetch costs the user's hourly budget on the service; one
  that describes the document (`zone_chapter_not_found`, `version_changed`…)
  is kept until Refresh.
- **The read waits up to 2 s** for the chapters, overlapping the other
  sources, then answers with what it has. A late answer is kept, and the
  source fires `onDidChange` (SDK 1.28) so the host reads again (`source`) and
  finds it with no new request. The page is never stored in the cached report:
  it is added at each read.
- **Without the service, or on an error,** the link opens at the first page,
  as in 0.4.0. Without the service the overview says « La lecture du
  règlement écrit n'est pas disponible sur ce déploiement »; an error is not a
  source failure, only "the page is not known", which the link's detail says.
- **Nothing from the service becomes a URL** but an integer page, appended as
  `#page=<n>` to the GPU link the extension resolved itself.
- **Decisions from a newer version.** A confirmation whose `ruleKey` has a
  prefix this version does not know (`written:` before 0.6.0) is kept as it
  is, listed under « D'une version plus récente » read-only, never offered for
  Forget and never "no longer in the plan"; every write keeps it whole. The
  section stays `schema: 1`.

## Surfaces and capacity (0.4.0)

- A **Surfaces** view under the row. The **emprise au sol** is composed from
  the host's plot coverage (the union of every building, the kept or extended
  existing building counted once, a replaced one not at all) under a named
  definition: R.420-1 by default (overhangs taken as unsupported, said), the
  PLU's lexicon (four toggles and a page), or the projection with all
  overhangs. Balconies are not modelled; the user enters their area.
- The **footprint budget**: used / allowed / remaining against a confirmed
  footprint ratio on the plot's area (the parcels', never the Site boundary's;
  the cadastral contenance beside it for reference); "not regulated" and "no
  confirmed footprint rule" told apart. **Pleine terre** from the unbuilt ground.
- The **surface de plancher** (R.111-22) from the host's floor areas, with
  each of the article's eight deductions as a line: 3° computed (clear height
  ≤ 1.80 m), 1° assumed, 2° and 4°–8° answered by the user per variation
  (voids, parking, attics, technical rooms, cellars, collective, common parts).
  Until every answer is given the total reads "estimate, n answers missing".
- **Extension and annex caps** against the existing building as modelled, the
  smaller confirmed limit governing; buildings marked extension or annex.
- A **theoretical capacity** range — an estimate, not a right to build.
- **Procedure flags** — no formality, prior declaration or permit, and the
  architect — indicative, each threshold cited with its article and the date it
  was read on Légifrance (2026-10-20).
- The **programme warning** (`fr-urban-rules.programme`, `ai` capability): the
  Space Programme is compared with the capacity and the storeys the confirmed
  heights allow; "Planning rules not read yet" when the row was never opened.

### Migration from Urban Rules (generic)

`com.archisimple.urban-rules` is **retired** (removed from this repository and
from the published index):

- An installed copy stays installed until its user uninstalls it; nothing
  uninstalls it remotely.
- Its preferences `com.archisimple.urban-rules.plotAreaSquareMetres`,
  `.siteCoverageRatio` and `.maxStoreys` are **dropped, not migrated**: the
  plot area comes from the Site, coverage and storeys from confirmed rules.
  They stay in the preference store, read by nothing. Migrating them was never
  possible: preferences are namespaced per extension.
- While both run, both enrich the programme. The PLU overview then says
  "Urban Rules (generic) is replaced by this package; disable it" — detected
  from `ai.listPlanningStages()` at each read.
- Its Skill `urban-rules.maxBuildableArea` is not carried over.

## Drawn and entered rules (0.3.0)

- A drawn prescription with a number (heights, footprint, green space, setback
  lines; parking listed) becomes a rule **to confirm**, its words quoted, its
  confidence said; one it cannot read is not evaluable, never dropped. The
  parser is tested against 51 real pairs from 12 communes
  (`../test-fixtures/fr-urban-rules/prescription-corpus.json`).
- **Confirm, Edit value, Does not apply, Reopen** on a rule; **Add a distance
  or height / a ratio / an area cap** (kind, limit or not regulated, value,
  source, page, note), **Edit**, **Remove**; **Forget** for a decision whose
  rule left the plan or that was made on another plot. Each is one
  `SitePackageDataService.write` with `expected`: one undo step.
- The section is one object, `{ schema: 1, edgeRoles, confirmations, entered }`,
  every entry with the `plot` it was made on. A confirmation is keyed to the
  document's `idurba` (compared case-insensitively) and the feature's
  `datvalid`: a new version reopens it, showing the old value and date.
- Heights are checked per building (lowest ground at the foot, said; a drawn
  height only where it is drawn), setbacks from the `storeys` outline to the
  edges of their roles; a check on a rule to confirm carries its real result.
  The confirmed setbacks draw a plan **envelope**.

## Under the RNU and a carte communale (0.2.0)

- **Coded rules** for R.111-15, R.111-16, R.111-17, R.111-28, L.111-3 (RNU
  only) and "other national rules", with R.111-18/19 and L.111-4 as
  exceptions. Each cites the Code de l'urbanisme article's `LEGIARTI` version
  in force, its start date and its text, verbatim — read on 2026-10-20 (the
  table `ARTICLES` in `src/index.js`, the record
  `../test-fixtures/fr-urban-rules/legi-articles.json`). A new version of an
  article is a new `LEGIARTI` id: read it again, never edit the text alone.
- **The Site boundary's edges** named street, side or rear from the roads
  (the ambient `roads` service, asked once per boundary per session), always
  with the assumption they rest on; the user corrects a role with the
  `set-edge-role` action.
- **R.111-17 checked** for every building of the open design, from the host's
  `measures.distances` (worst pair at ratio 0.5, the 3 m floor, "jouxte" from
  the façade samples). Never "compliant": `no_issue`, `potential_issue` or
  `not_checked` with its reason. One check per building (002.4): every
  non-street edge is evaluated, the worst governs, and the others are listed
  with their distances in the check's subject; the drawn and entered setbacks
  are folded the same way.
- **R.111-16** (0.2.1) measured to each street edge's **opposite alignment**,
  approximated and always said: an EL7 alignment easement, else the cadastral
  parcels across the road (one `map-features` parcel query), else the
  carriageway's far edge (stricter than the rule). **R.111-15** between the
  project's buildings and to a kept or extended existing building, with its
  real result while the rule is to confirm. **R.111-28**: the neighbours'
  average height within 50 m (one `map-features` building query), never a
  check. **Bands**: derived `setback-band` lines per edge (3 m, and each
  check's current limit).
- **Writes only on an action.** The edge-role correction is the only write: one
  `SitePackageDataService.write` with `expected`, one undo entry. The section is
  `{ schema: 1, edgeRoles: [...] }`, shared with later sprints; members this
  version does not own are kept, nothing is pruned on read, and a section of an
  unknown schema is shown read-only.

## What it needs from the platform

- **SDK 1.33** (since 0.9.0: the Site cache, 096.17; 1.32 since 0.8.0:
  `checkVariation`, 096.11's 1.31, and the questions, 096.12's 1.32; 1.30 since
  0.7.0 for the volume and the sheet; 1.28 since 0.5.0 for `plugin-service`)
  and the `regulations` capability; `ai` for the programme enricher and the questions, `document` for
  every section write and an answer's offer. An older web image refuses the manifest whole
  (`unknown-capability` / SDK too old): the two move in lockstep.
- Optionally, the deployment's **companion service** (platform ADR-0114, the
  `plugin-services` compose profile). Without it everything works as in 0.4.0
  and the regulation opens at its first page.
- **carte-gouv-fr**'s France profile, which names `fr-urban-rules.gpu` in
  `planningSourceIds`. Without it there is no row under Site. It is not a
  package dependency: the profile names the source, the source names nothing.
- The host's **Site service** (`site`, SDK 1.24) for the plot and for every
  Lambert-93 ↔ WGS84 conversion. This package carries no projection formula.
- Since 0.4.0, the host's **measures** (`site.measures.plotCoverage`,
  `floorAreas`, `projection`; 096.0a–c through 096.1), the `ai` capability for
  the programme enricher, and `site.variations()` to key the Surfaces answers.
  The storeys' floor-to-floor height is read from each `Level`'s `height`
  property through the `document` service (the captures show it answered,
  3 m); where none is shown the capacity takes the editor's default, 3 m, and
  says so.

## The contract with carte-gouv-fr

The commune code for Géorisques comes from the parcel's `code_insee`, else the
first five characters of its `idu` — Parcellaire Express's own field names, as
carte-gouv-fr carries them verbatim on the Site. A contract between two French
extensions; the host is not in it. A parcel from another source falls back to
API Carto's `municipality` answer.

## Hosts contacted

The first three rows are `FETCHED_HOSTS` in `src/index.js` and the manifest's
`network.hosts`; `tests/package.test.mjs` holds the three lists equal.

| Host | What |
| --- | --- |
| `apicarto.ign.fr` | GPU layers by the plot's geometry (`municipality`, `document`, `zone-urba`, `secteur-cc`, `prescription-*`, `info-*`, `assiette-sup-*`) |
| `www.geoportail-urbanisme.gouv.fr` | The document in force (`api/document?partition=…&status=document.production`) and its file list |
| `georisques.gouv.fr` | `gaspar/risques`, `gaspar/pprn`, `zonage_sismique`, `rga`, `radon` (v1, keyless) |
| the editor's own origin | Since 0.5.0, `/plugins-api/com.archisimple.fr-urban-rules/v1/chapter`, and since 0.6.0 `v1/extractions` (cached reads, a `POST` on request, job polls) — the companion service, where the deployment runs it (`locate()`) |

The browser alone follows the regulation link to `data.geopf.fr` for the PDF;
the extension never downloads it. Never called: `acte-sup` (ignores the
geometry), `/document/{id}/details` (no CORS header), `/document/{id}/download`
(the whole package, 3.1 GB for Lyon).

## Caching

Memory, for the session, keyed by the plot (parcel ids and their rings to the
centimetre, with the CRS). A `site` or `design` read of a plot already read is
answered from memory with no request; the host's Refresh (`reason: 'refresh'`)
reads every source again, and a source failing then is shown as last read,
marked unavailable. Since 0.9.0 the project also keeps one snapshot, for the plot
on view (« The planning snapshot » above): with no memory of the plot, it seeds
the last good answers, so a source that fails is shown as the project read it.

## Tests

```bash
# From the repository root (Volta cannot parse an ArchiSimple manifest).
node --test fr-urban-rules/tests/*.test.mjs
```

No network: every answer comes from `../test-fixtures/fr-urban-rules/<plot>/`
(outside the package, so the `.aspkg` stays ≈ 0.16 MB), recorded on
2026-10-20 for five reference plots (Lyon 2e AB0105, Gordes AC0323, Brouennes
AB0280, Mouzay AB0346, Rochefort-en-Terre AB0235), each beside a `.meta.json`
naming its URL, method, status and date. Answers are kept whole except the
commune's and the document's outlines, which are never read. The tests need
this repository checked out whole: the package alone carries no fixture.

Every conversion in the tests is **the platform's**: `conversions.json` records
what `geodeticToProjected` / `projectedToGeodetic` (a built archisimple
checkout's `packages/geometry`, the functions the host's Site service calls)
answered for every point, and the tests' Site service answers only from it. To
record again:

```bash
node fr-urban-rules/scripts/capture.mjs --platform ../archisimple
```

It runs this package's own reader against the live services and saves exactly
what it asked. Read-only, small requests. Two more, for 0.2.0:

```bash
# The roads as carte-gouv-fr's own road source answers them (RoadSegment[]).
node fr-urban-rules/scripts/capture-roads.mjs --platform ../archisimple
# The platform's own getBuildingDistances on 096.0b's pitched-roof house
# (edges, an alignment line, an annex building).
node fr-urban-rules/scripts/capture-measures.mjs --platform ../archisimple
# carte-gouv-fr's own parcel and building sources (MapFeature[]), for 0.2.1.
node fr-urban-rules/scripts/capture-features.mjs --platform ../archisimple
```

## Acceptance captures (Sprint 002.4)

`test-fixtures/fr-urban-rules/acceptance/<plot>/` holds what
`tests/acceptance.test.mjs` replays. They come from the developer command
*Capture test fixtures (developer)*, which is registered only when the
preference `fr-urban-rules.devCapture` is `true` — set
`localStorage['archisimple.ext.shared.fr-urban-rules.devCapture'] = 'true'` in
the editor's console, then disable and enable the package (or reload). It is
the only use of the `commands` capability. After copying a capture in (without
its `fr-capture-` prefix) or re-recording its answers:

```bash
node tools/record-fixtures.mjs <plot> --trim    # offline: keep what the tests read, minify
node tools/record-fixtures.mjs <plot> --check   # live: has the GPU changed?
```

Since 0.8.0 a capture taken after the editor measured a parked variation also
writes `variations.json` (`{ variationId, buildings, checks }`), and its
`site-calls` hold that variation's measures; `--trim` keeps them.

`--trim` keeps the pairs and answers the tests' two reads use, rounds the
platform's `fromGeographicRing` results to 1 mm, writes those pairs compact
and every file minified, and removes `report.json`.

## Licences

The attribution strings say what each source is. API Carto and the GPU are
IGN / Géoportail de l'Urbanisme data; Géorisques is BRGM and the ministry's.
Etalab Licence Ouverte 2.0 was confirmed for the geocoder only (milestone § 4.3):
nothing here cites a licence that was not checked.
