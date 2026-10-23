# Changelog — `fr-urban-rules`

## 0.13.0 — Sprint 002.15, PLU Surfaces Content

- **SDK 1.38** (from 1.37): the `stat`, `choice` and `section` blocks (platform 096.27). Lockstep:
  ship this version only with a web image carrying 096.27; an older host refuses the manifest.
  Nothing read, measured or checked changes: every `srf:` check and assumption equals 0.11.0's on
  the five recorded reads (`tests/surfaces-composition.test.mjs`).
- **Surfaces** is composed. A **headline figure** for the emprise au sol (the share of the plot, « 480 m² sur
  1 500 m² de parcelle », a gauge with the footprint limit's marker, the result as a chip); the
  **definition as a choice of three cards** — R.420-1, Lexique (p. N), Toutes saillies — each with its
  area, the selected one outlined, a tap running the same `emprise-definition` action as the form's
  button (the form stays for the four counts and the page); the **budget** as the host's used /
  remaining / allowed bar; then folded rows with their own summaries: **détail et définition
  légale**, **base de calcul**, **pleine terre** (the shortfall « manque 4 % (60 m²) », the rule with
  « Confirmer 15 % » and « Voir le passage »), **surface de plancher**, **extensions et annexes**,
  **capacité théorique** (a range bar, « une estimation, pas un droit à construire ») and **procédure**.

## 0.12.0 — Sprint 002.14, PLU Flag Content

- **SDK 1.37** (from 1.36): a flag's `icon`, `group`, `title`, `code` and `level` (platform 096.25).
  Lockstep: ship this version only with a web image carrying 096.25; an older host refuses the
  manifest. Capabilities and `network.hosts` unchanged. Nothing read, measured or checked changes:
  each flag's `id`, `kind`, `label`, `detail` and `citation` equal 0.11.0's on the five recorded
  reads (`tests/flags.test.mjs`).
- **Servitudes et périmètres**: an easement flag has a short title by its SUP category (AC1 «
  Monuments historiques · périmètre ABF », AC4 « Site patrimonial remarquable · ABF », a mixed set
  « Périmètre patrimonial · ABF », AC2 « Site classé ou inscrit », PM1/PM3 « Servitude de plan de
  prévention des risques ») and the source's own code beneath (« AC1 », « AC1 · AC4 »).
- **Risques naturels et sol**: the seismic zone (of 5), the radon class and the clay exposure (of 3)
  carry the number Géorisques gave as a `level`, with « Zone 3 », « Classe 2 », « Niveau 3 » and the
  official word of the grade; a PPRN is a row.
- **Risques recensés dans la commune**: the risks Géorisques lists for the commune are the
  `listed` group, each titled by its own name.
- **Relevés des services**: the Risks view's rows that listed the same readings in one line each
  (« Sismicité · Zone 3 », the risks joined by « · ») are **folded beneath the flags**, in a section
  that opens itself and says so in its summary when a service is still loading or did not answer.
  Found by the walk: above the tiles they said everything twice, in a line past the panel's width.

## 0.11.0 — Sprint 002.13, PLU Panel Diagrams

- **SDK 1.36** (from 1.35): `plot-plan` valid in a view, the `edges` and `height-section` blocks and
  an assumption's `figure` (platform 096.22). Lockstep: ship this version only with a web image
  carrying 096.22; an older host refuses the manifest. Capabilities and `network.hosts`
  unchanged. Nothing read, measured or checked changes: 002.9's expected values and 002.12's
  digests hold.
- **Limites et reculs** shows the host's **plot top view** — the parcel, the boundary with its edges
  lettered, the buildable zone, the design, the measured distances in their tones, the failing
  stretch in red — then its **edge list** (« A · Voie · 3,20 m · min. 4,00 m », the role's
  assumption as an amber chip), then the **Set role** actions as before. The edge table is gone:
  its role and « why » are the edge list's, and its **length column is dropped** (the letter on the
  plot view identifies an edge). Without a Site boundary the view keeps its notice and no diagram.
- **Enveloppe** shows « Enveloppe en coupe » — a schematic section of the plot's measured height
  checks (the main building's total and façade heights, a prescription's) — after the view's notices.
- **« Hauteur depuis le terrain le plus bas »** carries a figure: a building on sloping ground,
  the height measured from the lowest point of the ground at its foot.
- **Set role** names an edge by the host's letter (« Fixer le rôle de la limite A »), as the plot view and the edge list letter it; the view is labelled « Limites et reculs » (it read « Côtés de la limite du site »).
- The edge table's keys (`edges.column.edge`, `.length`, `.why`, `edges.why.*`) are removed from both
  catalogues; `fr-urban-rules.envelope.section` is new.

## 0.10.0 — Sprint 002.12, PLU Panel Content

- **SDK 1.35** (from 1.33): a view's `icon`, `group` and `summary` and the report's `locality`
  (platform 096.19, SDK 1.34); an assumption's `detail` (096.21, SDK 1.35). Lockstep: ship this
  version only with a web image carrying 096.19–096.21; an older host refuses the manifest.
  Capabilities and `network.hosts` unchanged. Nothing read, measured or checked changes: the
  rules, checks, features, edges, flags, zones, document and sources of the five reference reads
  are byte-identical to 0.9.0's.
- **The views in the boards' order, with an icon and a group**: Document, Zone (Secteur under a
  carte communale), Prescriptions, Informations, Servitudes, Risques — *le terrain et ses règles* —
  then Vérifications, Règles, Limites, Enveloppe, Surfaces — *le projet face aux règles*. A view
  the regime lacks is absent; the order of the rest holds.
- **A Document view**: the overview's fields (regime, commune, document, version, approval date,
  zone), the link to the regulation and the notices about it. The overview keeps its **notices
  only** (the host draws them under its status line); its `assumptions` (now on the checks that
  name them) and `sources` (the host's own section) leave it; **the flags move into Risques**,
  after its fields.
- **Summaries** where the host derives none: the document's date, the zones (« UF »), the counts
  of prescriptions, informations and servitudes, the strongest risk read (clay, else seismic,
  else radon — « Argiles · moyen »), « 4 limites », the lowest height ceiling of the envelope
  (a quantity) and « Emprise 32 % ». Vérifications and Règles carry none: the host counts them.
- **The commune as the report's `locality`** (« Lyon », not the service's « LYON »).
- **57 assumptions as a short title and one line of detail**, in English and French (the ids and
  keys are unchanged; the detail is the title's key plus `.detail`). The table of old and new is
  in Sprint 002.12's Outcome.
- **« Confirmer 15 % »** on a written rule to confirm with a value or ratio limit (a number
  parameter, written in the reader's locale, as the assistant's offer is); a described limit keeps
  « Confirmer ».
- **`allowed` is not sent**: every rule shape here — coded, drawn, written, entered — states one
  comparison and one value, so none bounds a measure on both sides (the SDK field stays for the
  next country).

## 0.9.0 — Sprint 002.11, Planning Snapshot

- **SDK 1.33** (from 1.32): `SitePackageDataService.readCache` / `writeCache` /
  `onDidChangeCache` (platform 096.17, ADR-0115). Lockstep: ship this version
  only with a web image carrying 096.17; an older host refuses the manifest.
  Capabilities and `network.hosts` unchanged.
- **The reading kept in the project.** After a completed read of the plot on
  view, its facts (schema 1: the commune and the document parsed, each layer's
  items with their outlines, Géorisques' answers, the règlement's link) and the
  written readings shown go to the package's Site cache, with the sources'
  credit lines as the envelope's attributions — never to the section, never a
  verdict. Outlines within 100 m of the plot, to the centimetre, each centroid
  as read; past 200,000 characters, DEC-2's steps (30 m, simplified at 0.5 m,
  outlines dropped by category, passages shortened), each said; a snapshot that
  still does not fit, or a refused write, is « Not saved in the project » and
  the previous one stays. Written only when the reading changed.
- **At open**: the snapshot shown at once through the read's progress (« Read
  on {date} — checking for changes… »), then the fresh answer — « Unchanged
  since {date} — checked today » or « What changed since {date} », en and fr
  (« Unchanged since {date} among the sources that answered today » when some
  did not); offline, each source restored is **`saved`** (SDK 1.33) with its
  date and « shown as read on {date} » (`status.shownAsReadOn`), and the host
  says once « Offline — N sources shown as read on {date} ». A source that does
  not answer in a session while its earlier answer is shown is `saved` too.
- **The règlement's link survives**: offline it opens the file it named, « as
  listed on {date} »; when the GPU's file list never answered, a written
  reading of the same version names it (its GPU document id, now kept).
- **A re-read listing the same features in another order is the same
  reading**: nothing written, the project stays clean.
- **Keys hold**: drawn keys read the centroid kept as read; written rules carry
  their computed key (`writtenKeysOf`, one computation), so a shortened passage
  never moves one.
- **Written rules without the companion**, from the snapshot, dated, beside the
  « not available » notice. With it, a different reading of the same version is
  offered (« Use it », `written-use-newer`), never taken silently.
- A snapshot of a higher schema, malformed, or of another plot is ignored (and
  logged); every member restored is re-read as an answer is (a link only to the
  GPU's files).

## 0.8.1 — Sprint 002.9, Design-Time Acceptance FR

Three defects of 002.6b found by the acceptance's expected values (SDK 1.32,
capabilities unchanged):

- **A written pleine terre share of the plot area is checked.** « Le
  coefficient de pleine terre est au minimum de 15 % » may come back as a
  `ratio` of `plot_area`; it was listed and never checked (only a value in
  percent was). Both forms now give the Surfaces view's « required » row and
  the check (`greenPercentOf`, as `footprintPercentOf` does for the footprint).
- **A written extension share of the floor area is never measured against the
  emprise.** A ratio of the surface de plancher (Gordes' « 30 % de la surface
  de plancher … existante ») was dropped from the checks; a ratio of the
  existing emprise or the emprise is now checked as an entered one, any other
  base is « not checked » with « the base of this ratio is not measured »
  (`extensionShareOf`).
- **The Rules view says why nothing is read** under a carte communale or the
  RNU (`written.notOffered.cc` / `.rnu`, en and fr): no règlement exists, the
  national rules listed apply.

## 0.8.0 — Sprint 002.8, Assistant Plot Questions

- **SDK 1.32** (from 1.30): `RegulationSource.checkVariation` (1.31, platform
  096.11) and `RegulationSource.questions` (1.32, 096.12). Lockstep: ship this
  version only with a web image carrying 096.11 and 096.12; an older host
  refuses the manifest. Capabilities unchanged (`ai` offers the questions,
  `document` the offers).
- **The assistant's four questions**: `can_add_storey`, `road_distance`,
  `max_height`, `remaining_area` — answered from the last read of the Site when
  it is the report the host gives (otherwise « read again »), each limit a claim
  on its rule (the host cites it), each figure the editor's measure, no passage
  read. `can_add_storey` and `max_height` offer **Confirm {value}** when the
  tightest height limit is a rule to confirm with a value: the section the Rules
  view's Confirm writes, proposed by the host as one change.
- **One headroom function** (`heightHeadroom`) for the questions and the
  programme warning, which now counts storeys under the tightest confirmed
  limit, relative to a distance or absolute (002.3 DEC-7 counted absolute
  heights only, and the highest of them). The storey height named, else the
  design's own, else the editor's 3 m — said.
- **Parked variations measured**: `checkVariation` runs the read's own checks
  (separated out of `augment` as `evaluateChecks`) on a parked design, so the
  editor's variation figures read the FR rules instead of « Not measured by
  Règles d'urbanisme (PLU) ». No network, no read; throws without a matching read.
- **`network.hosts`** in the manifest — `apicarto.ign.fr`,
  `www.geoportail-urbanisme.gouv.fr`, `georisques.gouv.fr`, the browser's only
  fetches (`FETCHED_HOSTS`; `fetchJson` refuses any other) — for the package card
  once the platform renders it (096.13). Légifrance is a link, not a contact.
- **The developer capture** also records a parked variation's checks
  (`variations.json`), with the host's own buildings; Brouennes' acceptance
  capture now holds a second variation (the house moved 3.5 m from its side
  boundary): 1 potential issue open, 0 parked.
- **Review fixes (2026-10-21)**: `max_height`'s first line states the tightest
  *confirmed* limit (a summary carries no rule, so the host cannot mark one to
  confirm there) and says when a rule to confirm gives a lower one; a façade
  limit counts the storeys under the eaves, not the roof, when no storey is
  measured; a limit is read at the rule's current value against its check's
  measure; R.111-17's 3 m floor is said as an issue that stays whatever the
  height; « Confirm {value} » formats its number in the reader's locale.
- **To be reviewed by the owner (RD-1, 2026-10-20; shipped as drafted)** — the
  three *Interpretation* sentences, each droppable by deleting its key and its
  condition:
  - `fr-urban-rules.question.interp.attic` (a façade height rule in play):
    « Un étage en attique, en retrait de la façade, échappe souvent à une limite
    de hauteur de façade. Le règlement ne le dit pas ici : à vérifier auprès de
    la mairie. »
  - `fr-urban-rules.question.interp.relativeEstimate` (a limit relative to a
    distance governs): « La marge est estimée en relevant tout le bâtiment de la
    même hauteur ; un étage en retrait laisse davantage de marge. »
  - `fr-urban-rules.question.interp.notADecision` (always, last): « Ces chiffres
    aident à concevoir ; ils ne préjugent pas de la décision de l'autorité
    compétente. »

## 0.7.0 — Sprint 002.7, Envelope and Sheet Content

- **SDK 1.30** (from 1.28): the envelope's volume (1.29, platform 096.9) and the
  report's regulation sheet (1.30, 096.10). Lockstep: ship this version only with
  a web image carrying 096.9 and 096.10; an older host refuses the manifest.
- **The theoretical envelope on a concave plot.** `insetByRole` replaces the
  convex-only half-plane cut: the Site boundary less each edge's strip — every
  point within the largest confirmed minimum of the edge's role (a `value`
  setback, or a height-relative setback's `minimum` — R.111-17's 3 m under the
  RNU and a carte communale) — cut by overlay. A strip's rounded end is drawn
  by tangents every 15°, just outside the circle; a street edge's strip runs on
  along its line past a convex corner (the alignment continues), which is
  002.2's half-plane cut on a convex boundary; a side or rear limit's ends
  round. Validated (one simple ring inside the boundary, no point closer to an
  edge than its distance); refused, and said, only where the setbacks leave no
  ground or split the plot. The five reference plots, all concave, now get one.
  `envelope-not-convex` is gone. _(Independent review, 2026-10-21: the
  mitred offset with edge collapse first written here refused or misread about
  one plausible plot in ten — « no ground » with hundreds of m² left — and was
  replaced before release.)_
- **The volume** (`RegulationFeature.volume`): R.111-17 and boundary setbacks
  relative to a height as slopes from the non-street chains, R.111-16 from the
  opposite alignments (or a drawn required setback line), street setbacks
  relative to a height from the street edges, façade-relative setbacks with a
  start (`R ≥ Hf − 4 m` → rise 1 from 4 m) where 096.9 can express them, total
  height limits as heights (within a drawn prescription's rings), merged; checked
  against 096.9's limits before sending — past them no volume, the outline kept.
  Confirmed rules only; regimes without one (not on the GPU, a carte communale
  sector closed to construction, unknown) say why. A street edge with no
  opposite alignment found gets R.111-16's slope from the edge itself (stricter,
  said). A confirmed rule the envelope cannot draw (a façade height, a maximum
  setback, a budget) is said as an assumption, `envelope-not-applied`, and a
  carte communale only partly closed to construction as `envelope-cc-partly` —
  so the sheet, which prints assumptions, carries both.
- **The « Enveloppe théorique » view**, after Checks: the ground area, the
  confirmed heights, the rules applied and not applied (each with its reason),
  notices, and the assumptions. The feature is labelled « Enveloppe théorique ».
- **The regulation sheet** (`report.sheet`): the plot (commune, parcels, plot
  area, zone, the zone's own date when it differs), the flags, a notice when the
  plan is not on the GPU or a source failed, the checks with every rule not
  checked, the host-counted rules meter, the plot plan and the assumptions; the
  scope sentence. Every string a report carries is in the print font's WinAnsi.
- **The capacity on concave plots** now reads the envelope's ground area where a
  confirmed setback insets it (it read none there before); under the RNU and a
  carte communale R.111-17's 3 m now insets it too. 002.9's expected values are
  written after this.

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
