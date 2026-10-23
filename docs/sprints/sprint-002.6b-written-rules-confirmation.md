# Sprint 002.6b — Written Rules Confirmation

> **Status:** **Closed (2026-10-22)** — committed, deployed to the NAS and
> closed by the owner with
> [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md) Phases
> 0–3 and the platform's Site Regulations milestone ("you can close phase3. it works for the moment and has been deployed to the NAS").
> As it read before the close: **Implemented (2026-10-20), uncommitted** — `fr-urban-rules`
> 0.6.0, SDK 1.28; see the Outcome at the end. **Not done:** the walk of step 5
> in the editor behind 096.8a's local override (no Docker here); a live run
> through the local gateway and ai-service stands in for its service half.
> _(Read "Draft (2026-10-20). Nothing is implemented" until then.)_ Split from
> the 002.6 draft of 2026-10-19 by the Phase 2 review (below).
>
> **Version:** 1.1
>
> **Repository:** `archisimple-plugins`, package `fr-urban-rules`: 0.5.0
> (002.6a) → **0.6.0**. Versions are restated from 0.4.0; 1.0.0 stays the
> first published version.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 5.2 item 2 (written), § 5.3, § 8, US-03. Platform:
> [Site Regulations](../../../archisimple/docs/milestones/site-regulations/README.md)
> Phase 2.
>
> **Prerequisites:**
>
> - **002.0–002.4**, and **002.6a**: the locator, the per-zone chapter, the
>   forward-compatible reader.
> - **002.5b**: the extraction routes, the result, `current`.
> - Platform **096.8b**: `RegulationSource.onDidChange` and the `source`
>   read reason. A `source` read keeps `previous` and is coalesced to at
>   most one per 2 s. Its SDK minor is **1.28** in the ledger, shared with
>   096.8a.
> - Platform 096.2: `statement`, and `height_relative`'s `reference` and
>   `offset`.
> - Platform 096.3a–b: actions, `quote`, `notice`, `sources`.
> - Platform 096.4: `SitePackageDataService`.
>
> The package declares 096.8b's minor.
>
> **Sizes:** a job client, polling, states, a mapping, a merge, a
> confirmation extension and strings, all in one entry file. No platform
> change. Medium.

---

# Sprint Design Contract

- [x] **Nothing extracted becomes a constraint until a person confirms
      it.**
  - Every `written` rule enters `to_confirm` — `writtenRulesOf` sets it;
    only a section decision (`plannedRules`' decided map) changes it.
  - `confidence` never confirms — it is copied to the rule and, when `low`,
    said in a condition; no code path reads it to decide a status.
  - A check against an unconfirmed written rule carries its real result, as
    every unconfirmed rule's does (002.2 DEC-7); the host counts a potential
    issue only on a `confirmed` rule, so it stays outside the count.
    _(Revised at review, 2026-10-20, owner decision Q2: until then this line
    read « `not_checked` « rule to confirm » ».)_
- [x] **Extraction runs when a person asks** (Q45). A read asks only
      `cachedOnly=1` (`askCached`); the one `POST` is `startExtraction`,
      reached only from `runWrittenAction` (the three `written-*` actions).
      Criterion 1's test counts no `POST` across `site`, `design` and
      `source` reads.
- [x] **The project holds decisions, never readings.** A read writes
      nothing (002.1a's "a read writes nothing" test still passes); the
      extraction lives in the reader's session map (`extractions`), never the
      section; `nextWritten` writes one confirmation with the full limit and
      the citation (criterion 9), and `writtenFromSection` shows and checks it
      without the service.
- [x] **A drawn value overrides a written "see the graphic document"**, and
      the report says which: the written rule becomes `information` with
      « voir « Hauteur Max-22 » » (`fr-urban-rules.written.seeDrawn`), the
      drawn one stays the rule to confirm (criterion 6).
- [x] **Every state is named** (`writtenStateOf`): checking, not read,
      queued, fetching, reading, extracting (n of m), done, partial, failed by
      code (each of 002.5a's and 002.5b's codes, and the client's own), with
      002.6a's notice when not available. An empty result shows « 0 règles
      lues », never "none".
- [x] **The host learns nothing French.** Everything crosses as 096.2's
      shapes; the platform's built `checkedReport` keeps every report of this
      sprint whole (34 reports, 0 dropped, 0 refused). Criterion 14's test
      scans keys, params and hrefs for every extracted string.

---

# Current state

- **002.6a** (draft) provides:
  - `locate()` on each read;
  - one `GET chapter` per zone, with a 2 s wait inside the read;
  - the zone page link;
  - a reader that keeps unknown `ruleKey` prefixes, read-only and never
    stale.
- **002.2, as implemented:**
  - **Drawn keys:** `psc:<type>:<subtype>:<cyrb53(libelle|txt|centroid)>`,
    with the parsed kind deliberately left out (`drawnKey`).
  - **Confirmations:** `{ ruleKey, plot, idurba, datvalid, decision,
    value?: { kind: 'value', value, unit }, edited, at }`.
  - **Stateless actions:** a subject carries `i|d|v|u` only, each field cut
    to 200 characters (`subjectPart`). `runAction` builds the next section
    from the request alone (002.2 deviation 2).
  - **One check per rule per building**, `chk:<ruleId>:<buildingId>`, with
    the worst edge governing (002.4 Q5). There is no merged "stricter"
    check (002.2 deviation 3).
- **096.6b** (implemented): a write to the source's own section is read
  again with reason `action`, keeping the report on view. Statements
  (`not_regulated`, `see_graphic`) leave the checked counts.
- **SDK 1.27:**
  - `RegulationLimit`: `value { comparison, quantity }`, `ratio {
    comparison, percent, base: phrase }`, `height_relative { reference?,
    factor, offset?, minimum? }`, `described { text }`;
  - `RegulationRule.statement`;
  - `citation { document, article, page, passage, href }`.
- **The per-façade measure** (`measures.distances({ byFacade: true })`,
  `FacadeDistances`) exists in 1.27 and is already used (`index.js:3261`).

---

# Goal

On a plot under a PLU(i), the user asks for the written rules of a zone.
The extension starts an extraction, shows its progress, and then lists each
rule of the zone's sector as a `written` rule **to confirm**: value, page,
article, quoted passage, conditions, exceptions and confidence. Those rules
are merged with the drawn and entered rules. The user confirms, edits or
sets each one aside with 002.2's actions, and a new document version asks
again.

# Out of scope

- The service (002.5a–b), the link (002.6a).
- Carte communale, the RNU, a plan not on the GPU.
- The assistant (002.8), the sheet (002.7), watching (002.10).

---

# Decisions

## DEC-1 — When the service is asked

| Moment | Request | Model call? |
| --- | --- | --- |
| A read on a PLU(i) plot, once per (`upper(idurba)`, `nomfic`, zone) per session, beside 002.6a's `GET chapter` | `GET extractions?…&cachedOnly=1` | no |
| **Extract written rules** (action, **one per zone**) | `POST extractions` | yes, unless cached |
| **Extract again** (offered when the result is `partial`, or `result.model.providerId ≠ current.providerId`, or its `schemaVersion` or `promptVersion` is older than `current`'s) | `POST extractions?refresh=1` | yes |
| A running job | `GET extractions/{jobId}` every 3 s, then every 10 s after a minute | no |

- **The action returns at once.** It answers `{ status: 'done' }` as soon
  as the `POST` is accepted (`202`) or answered (`200`). The host then reads
  again with `action`, and the report shows the job queued. 096.3b's 15 s
  action limit is never near.
- **Signalling, once the first read has settled (S5).** The source fires
  `onDidChange` (096.8b) only **after** the current read has returned:
  - for a change of a job's state or chunk;
  - for a `cachedOnly` answer that arrived late;
  - for a `GET chapter` answer that arrived late.

  A change that happens during a read is noted and fired when the read
  settles. 096.8b coalesces the fires to at most one read per 2 s, and keeps
  `previous`. So a signal never aborts the first `site` read and never
  restarts its API Carto waves.
- **Polling stops** on a terminal state, a Site key change (another plot,
  another version), the project closing, or `deactivate`. Every timer is in
  `context.subscriptions`.

## DEC-2 — States, in the report

The report carries a source entry in `sources[]` (`id:
'written-rules'`, « Règlement écrit — lecture »), and a block in the Rules
view, **per zone**.

| State | `sources[].state` | Properties | Actions |
| --- | --- | --- | --- |
| Not available (002.6a DEC-1) | — | 002.6a's notice | Add a rule |
| Not started | `ready`, « non lu » | `notice` `info`: « Le règlement écrit de la zone n'a pas encore été lu » | **Extract written rules** |
| Queued / reading / extracting | `loading`, the step and « morceau 1 sur 2 » | `notice` `info` | — |
| Done | `ready`, `retrievedAt` = `extractedAt` | the written rules; a `fields` line « n règles lues, pages 121–144 », the provider | Extract again (if offered) |
| Partial | `ready`, « partiel » | as Done, plus `notice` `warning` with the counts of `chunks.failed` and `dropped` | Extract again |
| Failed | `unavailable`, the code's phrase | `notice` `warning` | Try again (re-POST), Add a rule |
| Chapter not found | `unavailable` | « Le chapitre de la zone UCe1b n'a pas été trouvé dans le règlement », with the codes the service saw | Add a rule |
| No text layer | `unavailable` | « Ce règlement est une image : il ne peut pas être lu » | Add a rule |
| Version changed | `unavailable` | « Une nouvelle version du document est en vigueur » | Read (the host's refresh) |
| Rate limited / busy | `unavailable`, « réessayer après HH:MM » | `notice` | Try again, after the time |

Every code of 002.5a DEC-11 and 002.5b DEC-10 has a phrase in both
locales.

## DEC-3 — A service rule becomes a `RegulationRule`

- **Sector, filtered first.**
  - **Kept:** a rule whose `sector` is null, equal to the zone's
    `libelle`, or its code prefix by 002.5a DEC-6's normalisation.
  - **Not shown:** a rule of another sector (« UCe1a »). It is counted in
    the `fields` line (« 3 règles d'autres secteurs non affichées »).
  - **Unplaced:** a rule with `sectorUnplaced` is kept, with the condition
    « secteur : <texte> » and `low` confidence.
  - Everything below, the relabel of DEC-5 included, sees only the kept
    rules.
- **Id (S2):** `written:<sector or *>:<cyrb53(normalised passage)>`, with
  `~2`, `~3` in result order on a collision.
  - The passage is normalised with 096.7's rules.
  - **The kind is not in the key**, as for drawn keys: a model may read
    another kind.
  - **Risk, said:** a different model or chunking may quote a different
    span. That gives a new key, and the confirmation shows as no longer
    read (DEC-7). The provider is shown, and the old citation stays
    visible.
- **Limit:**

  | Service | `RegulationLimit` |
  | --- | --- |
  | `value` | `{ kind: 'value', comparison, quantity: { value, unit } }` |
  | `ratio` | `{ kind: 'ratio', comparison, percent, base }`, with `base` a phrase key per base |
  | `height_relative`, `altitude_difference` | `{ kind: 'height_relative', factor, offset?, minimum? }` |
  | `height_relative`, `facade_height` | `{ kind: 'height_relative', reference: 'facade_height', factor, offset?, minimum? }`. « R ≥ Hf − 4 m, min 2 m » is `factor 1, offset {−4, m}, minimum {2, m}`. « D ≥ Hf/2 » is `factor 0.5` |
  | `statement: not_regulated` | rule `statement: 'not_regulated'`, no limit |
  | `statement: see_graphic` | rule `statement: 'see_graphic'`, no limit; see DEC-5 |
  | `statement: described` | rule `statement: 'described'`, `{ kind: 'described', text: { text: <passage>, lang: 'fr' } }` |

- **Status:** `to_confirm`, or the section's decision when a confirmation
  matches (DEC-6).
- **Provenance:** `written`. **Confidence:** as answered.
- **Citation:**
  - `document`: « Règlement écrit », as a phrase key;
  - `article` and `page` from the service;
  - `passage`: `{ text, lang: 'fr' }`;
  - `href`: 002.0's link + `#page=<page>` (an integer).
- **Conditions and exceptions:** each `{ text, lang: 'fr' }`.
- **Checks: one check per rule per building**, `chk:<ruleId>:<buildingId>`
  (S3, 002.4 Q5).
  - **A `value` setback or height** is checked as 002.2 checks a confirmed
    rule.
  - **A `facade_height`-relative setback** uses `measures.distances({
    byFacade: true, targets: <the role's edges or the alignment> })`.
    - For each façade run, at each sample, it computes `need = max(factor ×
      Hf + offset, minimum)`, where `Hf` is that façade's wall top above
      its foot.
    - **The worst sample of the worst façade governs** the check's result,
      figures and `figure`. The other façades are listed in the subject's
      label.
    - A façade whose height is unavailable gives `not_checked` with its
      reason, when no other façade fails.
    - A `datumDerived` height carries the `datum-derived` assumption.
  - **A `building_distance`** (« D ≥ Hf/2 ») is `not_checked` « distance
    entre bâtiments non mesurée » (002.2 deviation 4).
  - **A `described` rule** is `not_checked` « règle décrite, non mesurée ».
  - **`not_regulated`** has no check, and 002.3's surfaces show « Non
    réglementé ».

## DEC-4 — Actions look the rule up in the session (B1)

- **The subject carries the version and the rule id,** as 002.2's does
  (`i|d`). It carries no value and no passage: a 200-character field cut
  cannot hold a passage of up to 1 000 characters.
- **`runAction` for a `written:` id** finds the rule in the session's job
  record for the zone, by id.
  - If the record is gone (a new session, the plot left, a new version),
    the action answers `refused` « Relire le règlement avant de
    confirmer » and writes nothing.
  - This is the one place the package keeps a reading in memory for an
    action. Drawn, coded and entered rules stay stateless.
- **Edit value** is offered on written **`value` and `ratio`** limits only:
  one number field, with the unit or percent fixed. A written
  `height_relative` or `described` rule offers Confirm, Does not apply and
  Reopen.

## DEC-5 — Merging with drawn and entered rules; the relabel (Q46)

Merging applies to rules of the same kind and the same sector (or none),
on the same plot, after DEC-3's sector filter.

1. **Written `see_graphic` + a drawn rule of that kind on the building.**
   The drawn rule governs and stays the one to confirm. The written rule is
   shown with status `information` and the condition « la valeur figure au
   document graphique : voir <drawn rule> ». It enters no check.
2. **Written `see_graphic`, no drawn rule.** The written rule is
   `not_evaluable`: « la valeur figure au document graphique ; aucune
   prescription graphique n'a été trouvée sur la parcelle », with Add a
   rule.
3. **Written value + drawn value.** Both are shown and both are
   confirmable. **Each has its own check,** one per building (S3); there is
   no merged "stricter" check.
4. **Written + entered:** as 3.
5. **Written « se substitue »:** handled as 1 where a drawn rule exists,
   and as the written rule otherwise.

**The relabel (Lyon, Q46 accepted 2026-10-20).**

- **When it applies:** a kept written `see_graphic` rule of kind
  `height_facade` exists, and no kept written rule of kind `height_total`
  does. Then a drawn rule parsed as `height_total` is relabelled
  `height_facade`.
- **How it is said:** its conditions say « hauteur de façade, d'après
  l'article <article> du règlement écrit ».
- **What the key does:** the drawn key ignores the kind (`drawnKey`), so
  the confirmation still finds its rule.
- **Kind on drawn confirmations (S4):** from this sprint on, a drawn
  confirmation stores the `kind` it was confirmed as.
- **When a confirmed drawn rule is reopened:** its effective kind differs
  from the stored `kind`, or it is relabelled and its confirmation has no
  `kind` (written before 0.6.0). It reopens `to_confirm` with « nature
  corrigée d'après le règlement écrit : à confirmer de nouveau ». A user
  never has a confirmed total height silently become a façade height.
- **The relabel depends on a written result being in session** (or in the
  service's cache). Without one the drawn rule keeps its parsed kind. A
  reopen therefore happens at most once per kind change, and the stored
  `kind` keeps it stable after re-confirmation.

## DEC-6 — Confirming a written rule, and keeping the confirmation (schema 1)

002.2's actions are unchanged in what they send: one Request each, through
`SitePackageDataService.write` with `expected`. **No schema bump (S1):**
the fields below are additive within `schema: 1`, and 002.6a's reader
already keeps unknown prefixes.

```json
{
  "ruleKey": "written:UCe1b:3f9a1c2b7d4e5",
  "plot": ["69382000AB0105"],
  "idurba": "200046977_PLUI_20260326",
  "datvalid": "20260326",
  "decision": "confirmed",
  "kind": "boundary_setback",
  "value": { "kind": "value", "value": 4, "unit": "m" },
  "limit": { "kind": "value", "comparison": "min", "quantity": { "value": 4, "unit": "m" } },
  "edited": false,
  "at": "2026-10-19T10:42:00Z",
  "provenance": "written",
  "citation": { "page": 126, "article": "2.2.1",
                "passage": "Le retrait* est au moins égal à 4 mètres." }
}
```

- **`limit`** is the full SDK-shaped limit (B1). It is what a confirmed
  written rule is measured by when no extraction is in session.
  - `value` is still written for a `value` limit, so that 0.5.0 shows the
    figure.
  - An Edit value writes the edited number in both fields.
  - A façade-relative limit stores `reference`, `factor`, `offset` and
    `minimum`.
- **`kind`** is stored on written and, from now on, drawn confirmations
  (DEC-5).
- **`citation`** is stored, with the passage cut at 1 000 characters. A
  confirmed written rule is then shown, measured and cited from the section
  alone: with no service, on another deployment, or after the cache is
  gone.
- **Size:** about 40 written rules × 1.4 kB ≈ 56 kB, under 096.4's 256 KiB
  per section.
- **`provenance` is inferred from the key prefix** where it is not stored:
  `rnu:` coded, `psc:` drawn, `entered:` entered, `written:` written.
  Existing confirmations need no migration.
- **A confirmed written rule with no current extraction** is shown from the
  section, provenance `written`, with « lu le <date> ; règlement non relu
  dans cette session ».

## DEC-7 — Version change, and a key that is no longer read

- **A new document version means a new extraction.** The job and the
  result key carry the document (002.5b DEC-3). The previous version's
  extracted rules are never shown for the new one.
- **Confirmations reopen** by 002.2 DEC-4's matching (`idurba` and the
  zone's `datvalid`). A confirmed written rule from the old version becomes
  `to_confirm` again, with its old limit and citation shown. The overview's
  « Une nouvelle version est en vigueur » counts it.
- **A key missing from a current extraction:** the confirmation shows « n'est
  plus lu dans le règlement (ou lu autrement) », with its stored citation
  and **Forget**. Without a current extraction, a written confirmation is
  never stale (DEC-6).
- **An older result** (by version or provider; DEC-1) is shown, with
  **Extract again** offered.

## DEC-8 — Containment, on this side

- **Passages, conditions and exceptions** are `{ text, lang: 'fr' }`
  phrases, rendered verbatim by the host (096.3a DEC-4). They never appear
  as a key, in `params`, as HTML or as a link.
- **`href`** is built from 002.0's link and an integer page.
- **Writes:** nothing the service answers reaches the project except
  through a person's action, and then only DEC-6's fields.

## DEC-9 — Strings

`resources/i18n/fr-urban-rules/{fr,en}.json` gain:

- the action labels (`fr-urban-rules.written.extract`, `.extractAgain`,
  `.tryAgain`);
- the state notices of DEC-2;
- one phrase per code of 002.5a and 002.5b;
- the sector count;
- the deferring condition of DEC-5 and the relabel and reopen phrases;
- the "read again before confirming" refusal;
- the building-distance and `described` not-checked reasons.

There is no key for "not regulated" or "see the graphic document": those
are the host's `statement` words. Both locales hold the same keys.

---

# Steps

1. **Job client and polling** (DEC-1), with `onDidChange` after the read
   settles, and teardown.
2. **States** (DEC-2) and strings (DEC-9).
3. **Mapping** (DEC-3) and **merge and relabel** (DEC-5), as pure
   functions: `writtenRules(result, zone, drawnRules, enteredRules,
   section)`.
4. **Actions and confirmations** (DEC-4, DEC-6), and **version change**
   (DEC-7).
5. **Walk** on Lyon AB0105 behind 096.8a's local override, with 096.8b:
   1. Read.
   2. Extract, and watch the states.
   3. Confirm the 4 m rear setback.
   4. See the drawn 22 m reopen as a façade height, and confirm it.
   5. Undo, redo, save, reload.
   6. Open in a deployment without the service: the confirmed rule is
      still shown and checked.

# Acceptance criteria

1. **No model call from a read.** A read asks `GET extractions?…&cachedOnly=1`
   and never `POST`. A late `cachedOnly` answer fires `onDidChange` only
   after the read has returned (tests counting requests and fires).
2. **Extract written rules** sends one `POST`, returns `done` within the
   action call, and the report moves from not started to extracting to
   done as the fake job advances. Each step follows an `onDidChange` fire
   (fake clock).
3. **Codes.** Each code of 002.5a and 002.5b maps to its state and phrase
   in both locales (table test).
4. **Lyon, from 002.5b's recorded result.** The Rules show:
   - `boundary_setback` min 4 m (UCe1b), `written`, `to_confirm`, with page
     126, its article and the passage (`lang: 'fr'`);
   - `footprint_ratio` « Non réglementé »;
   - no UCe1a rule, with the sector count.

   (fixture test)
5. **Rule ids.** Two extractions whose results differ only in a rule's
   `kind` give it the same id. Two rules with the same sector and passage
   get `~2` (test).
6. **The relabel.**
   - A written `height_facade` `see_graphic` rule and the drawn « Hauteur
     Max-22 » give one rule to confirm, the drawn one, as `height_facade`
     22 m with the deferring condition. The written rule is `information`.
   - The drawn rule's earlier confirmation, which has no `kind`, reopens
     with the relabel phrase.
   - Once re-confirmed, it stays confirmed across reads, and its
     confirmation holds `kind: 'height_facade'`.

   (test)
7. **`see_graphic` alone.** A written `see_graphic` rule with no drawn rule
   is `not_evaluable`, with Add a rule (test).
8. **Façade-relative check.** A written « R ≥ Hf − 4 m, min 2 m » rule is
   `height_relative`, `facade_height`, `factor 1`, `offset −4 m`, `minimum
   2 m`. Once confirmed:
   - a 9 m façade at 4.5 m from the edge is `potential_issue`;
   - at 5.5 m it is `no_issue`;
   - on an L-shaped building whose 9 m façade stands 6 m from the edge and
     whose 6 m façade stands 3 m from it, **one** check passes, naming the
     governing façade (`byFacade` stubbed).
9. **Confirm writes the full rule.** Confirm on a written rule sends exactly
   one Request whose entry holds `plot`, `kind`, `limit`, `provenance:
   'written'` and the citation. With the service then absent, the rule is
   shown and checked from the section alone, the façade-relative one
   included (test).
10. **Actions need the session.** Confirm on a written rule after the job
    record is gone answers `refused` and writes nothing. Edit value is
    offered on a `value` and a `ratio` written rule, and not on a
    `height_relative` one (test).
11. **The section stays `schema: 1`.** A 0.5.0 reader (002.6a's) reads a
    0.6.0 section writable, lists the written confirmations as from a newer
    version, and rewrites them unchanged (test).
12. **Version change.** A result for `idurba` 20260326 read against
    20261002 is not shown, and the confirmed written rule reopens with its
    old limit and citation (test).
13. **Extract again.** It is offered when `result.model.providerId`
    differs from `current.providerId`, and not when they match (test).
14. **Containment.** No extracted string reaches a phrase `key`, a `params`
    value or an `href` (test scanning the built report).
15. **Manifest.** The manifest declares 096.8b's SDK minor, and `archisimple
    package validate ./fr-urban-rules` passes against a platform build
    carrying 096.8a–b.

# Testing strategy

- **Unit:** the mapping, the merge and the relabel as pure functions on
  002.5b's result shape; the states; the actions and the section.
- **Fakes:** a fake service built from 002.5a's and 002.5b's fixtures; a
  stub `plugin-service`; a recording `SitePackageDataService`; a stub
  `onDidChange` subscriber with a read-in-flight flag.
- **Manual:** the walk of step 5. 002.9 walks Lyon and Gordes with the
  owner.

# Risks

- **Long jobs and a closed tab.** The job runs on the service. Reopening
  the project finds the result with `cachedOnly=1`, so nothing is lost but
  the progress display. A confirmation after a new session needs a read
  first (DEC-4).
- **Rule keys come from passages.** A re-wording, a new model or a
  different span gives a new key, and the rule is shown as no longer read,
  with its citation. That is the safe failure.
- **Merging by kind** can pair the wrong rules on a plot with several
  drawn prescriptions of one kind. DEC-5 shows both rather than hiding one.
- **Façade height as the PLU defines it.** A lexicon that measures from
  another reference is read by the user, and the check names its
  reference.

# Questions for the owner

1. ~~Should a read start an extraction automatically?~~ **No**: Q45,
   accepted 2026-10-20.
2. ~~Relabel a drawn height from the written rule?~~ **Yes**: Q46, accepted
   2026-10-20. The reopen of DEC-5 was added by the review.

# Definition of Done

- The criteria are walked against the code.
- The Design Contract boxes are checked.
- `node --test fr-urban-rules/tests/*.test.mjs` is green.
- The walk of step 5 is recorded.
- `archisimple package validate` is green against a platform build with
  096.8a–b.

---

# Dependencies

| Sprint | What this sprint needs |
| --- | --- |
| **002.5b** | `POST extractions`, `GET extractions/{id}`, `cachedOnly` with `current`, the result (page, article, passage, occurrence, verbatim conditions, `statement`, `reference` / `offsetMetres`, `sectorUnplaced`), the codes |
| **002.5a** | The chapter, the codes |
| **002.6a** | The locator, the per-zone chapter, the forward-compatible reader |
| **096.8b** | `RegulationSource.onDidChange`; `source` reads keeping `previous`, coalesced to ≤ 1 per 2 s |
| **096.8a** | `PluginServiceToken.locate()` |
| **096.3a–b** | `notice`, `quote`, `sources`, `fields`; actions returning `done` at once; phrases with `lang`; `limitText` for the façade reference |
| **096.4** | `SitePackageDataService.read/write`; 256 KiB per section |
| **096.2** | `provenance: 'written'`, `citation`, `conditions`, `exceptions`, `confidence`, `statement`, `height_relative`'s `reference` / `offset` |
| **096.0b / 096.1** | The per-façade measure (`byFacade`) |
| **002.2** | The actions, version matching, Forget |

**Version needs:**

- package `fr-urban-rules` **0.6.0**;
- `sdkVersion`: 096.8b's minor (**1.28** in the ledger);
- the section stays **`schema: 1`**;
- no new capability.

# Corrections to the README / proposal

1. **Proposal § 8, `height_relative {factor, minimum?}`:** PLU rules are
   often relative to the façade height, with an offset. 096.2 carries
   this, and it is checked here per building, with the worst façade
   governing.
2. **002.2 DEC-1**, `typepsc` 39 → `height_total`: corrected from the
   written rule when one is read. The confirmation now stores `kind`, and
   reopens when it changes (DEC-5).
3. **002.2 DEC-3:** the confirmation gains `kind`, `limit`, `provenance` and
   `citation`, **within `schema: 1`**. The 002.6 draft's `schema: 2` is
   withdrawn.
4. **002.2 DEC-8**, "the stricter governs": one check per rule per building
   (002.4 Q5) also holds for written rules.

# Review (2026-10-20, Phase 2)

An independent pre-implementation review of the 002.6 draft. The
coordinator's decisions were taken on the owner's behalf and applied here.

- **Split:** this half is written rules; 002.6a is the zone page link.
- **B1: written actions use the session.** `runAction` looks a written rule
  up in the session's job record, and refuses « read again » when it is
  gone. The section stores a full SDK-shaped `limit` in a new field. Edit
  value is offered on `value` and `ratio` limits only (DEC-4, DEC-6).
- **B2: Extract again** is offered when the result's provider or versions
  differ from `current` (DEC-1).
- **S1: no schema bump.** The fields are additive within schema 1; the
  reader treats unknown prefixes as newer (002.6a DEC-4); `provenance` is
  inferred from the key prefix; the examples carry `plot` (DEC-6).
- **S2: written key** = `written:<sector|*>:<cyrb53(normalised
  passage)>`, with `~n` on collision. The model-change risk is said
  (DEC-3).
- **S3: one check per rule per building,** with the worst façade governing
  (DEC-3, DEC-5).
- **S4: drawn confirmations store `kind`.** A relabel that changes it
  reopens the rule. The sector filter runs first (DEC-3, DEC-5).
- **S5: signals.** `onDidChange` fires only after the current read settles
  (DEC-1).
- **S15: one Extract per zone** (DEC-1, DEC-2).
- **096.8 → 096.8a (locate) and 096.8b (onDidChange, `source` reads
  keeping `previous`, coalesced).**
- **NITs:**
  - `cyrb53`, not SHA-1;
  - a façade-relative `building_distance` is not checked, and says so;
  - the actions cap (`MAX_ACTIONS` 200) applies with 002.2 S1's notice;
  - versions are restated from 0.4.0.

# Outcome (2026-10-20)

**Landed, uncommitted.** Steps 1–4; step 5's walk in the editor is the
owner's (no Docker here), its service half run live (below). All gates green.

## What landed

`fr-urban-rules` **0.5.0 → 0.6.0**, `sdkVersion` **1.28** (096.8a's and
096.8b's shared minor), no new capability. All in `src/index.js`:

- **The client's pure half:** `checkedResult` (002.5b's result checked field
  by field — the document, the chapter, each rule's kind, statement, limit,
  page within the document, passage; a rule of another shape is left out and
  counted with `dropped`), `checkedCurrent`, `extractAgainOffered` (B2),
  `normalisedPassage` (002.5b's copy of 096.7's normalisation, copied again),
  `sectorIsZones` (002.5a DEC-6's code comparison and `isParentCode`),
  `writtenLimitOf` (DEC-3's table), `storedLimitOf` (a stored limit checked as
  the host would before a check uses it), `WRITTEN_CODES` (every code of
  002.5a DEC-11 and 002.5b DEC-10, plus `unavailable`, `malformed`, `network`,
  `timeout`), literal key maps for kinds, bases, codes and steps.
- **Extraction records** (DEC-1), one per (`upper(idurba)`, `nomfic`, zone)
  in the reader's session map beside 002.6a's chapters: `extractionFor` asks
  `GET v1/extractions?…&cachedOnly=1` once per session (Refresh asks again; a
  passing failure after 002.6a's back-off), in the read's 2 s wait beside
  `GET chapter` and never waited for once known; `startExtraction` (`POST`,
  `?refresh=1` for Extract again) answers `done` once the service answered
  (`202` queued or `200` cached); `poll` every 3 s, every 10 s after a minute,
  stopping on `done` / `failed`, on deactivation, and pausing for a zone not on
  view (resumed when it is); a job the service no longer knows (`404`) reads
  the cache again. A result for another document version is not kept.
- **Signals** (S5): `requestSignal` never fires during a read — a change
  during one is fired once it has returned (`readsInFlight`), once per turn.
  002.6a's late chapter now goes the same way. A record's `revision` /
  `applied` pair signals an answer that landed after a read stopped waiting
  but before it ended (found by this sprint's test; it affected 002.6a's
  chapters too).
- **Mapping and merge** (`writtenRulesOf`, in `plannedRules`): the sector
  filter first (others counted; unplaced kept, said, `low`), the key
  `written:<sector|*>:<cyrb53(normalised passage)>` with `~n`, the limit,
  `to_confirm`, the citation (« Règlement écrit », article, page, passage
  `{ text, lang: 'fr' }`, href = 002.0's link + `#page=<n>`), conditions and
  exceptions as verbatim phrases, a low confidence said in words. `see_graphic`
  defers to a drawn rule of its kind (`information`, « voir « … » ») or is
  `not_evaluable` (with the entry forms). The relabel (Q46) runs before the
  drawn rules are built.
- **Decisions** (DEC-4, DEC-6): `nextWritten` looks the rule up in
  `writtenSession` (rnu-level, replaced at each `augment`, cleared on
  dispose) and refuses « Relire le règlement avant de confirmer » when it is
  gone or read against another version; it writes `kind`, `statement`,
  `value` (value and ratio), the full `limit`, `edited`, `provenance:
  'written'`, `zone` and `citation` (passage ≤ 1,000 characters). Drawn
  confirmations store `kind`, carried in the subject (`k=`); a drawn rule
  whose effective kind differs from it — or is relabelled against a
  confirmation with none — reopens with « nature corrigée ». A confirmed
  written rule is measured by its stored limit.
- **Section-only rules** (DEC-6, `writtenFromSection`): with no current
  extraction for its zone, a written confirmation is shown, cited and checked
  from the section, with « lu le … ; règlement non relu dans cette session »,
  and offers Reopen only. With a current extraction that no longer reads its
  key, it is listed under « N'est plus lu dans le règlement (ou lu
  autrement) » by its passage, with Forget (DEC-7).
- **Checks** (DEC-3): written `value` setbacks and heights go through 002.2's
  `plannedChecks` and 002.4's fold (one per rule per building);
  `writtenChecks` gives a façade-relative setback **one check per building**
  — `need = max(factor × Hf + offset, minimum)` at each façade sample, the
  worst sample of the worst façade governing, its figure the façade's nearest
  pair, the other façades listed (« E 3 m / 2 m »); a façade with no height
  makes it `not_checked` unless another fails; `building_distance`, a
  described rule and a height relative to the altitude difference are
  `not_checked` with their reason.
- **States** (DEC-2, `writtenStateOf`): a `sources[]` line per zone
  (`written-rules`, `written-rules-2`…) and, in the Rules view under the
  rules, a heading per zone with its notice, fields (rules read and pages,
  provider and model, other sectors, the zones the service saw) and actions
  (Lire / Relire / Réessayer).
- **002.6a's reader:** `written:` joins the known prefixes.
- **Strings** (DEC-9): 78 keys in both locales.
- **Tests:** `fr-urban-rules/tests/written.test.mjs` (30 tests) against a
  fake service answering from `lyon/extraction/result.json`, manual timers, a
  recording section store and per-façade measures;
  `test-fixtures/fr-urban-rules/releases/0.5.0/index.mjs` — the 0.5.0 build's
  entry file, extracted from its `.aspkg`, for criterion 11. 002.6a's tests
  adapted: their fake service answers the extraction routes apart, a « newer »
  prefix is now `future:`, and `settle` waits a few timer turns (signals are
  deferred past the read).
- **Docs:** CHANGELOG 0.6.0, the package README (« Written rules (0.6.0) »,
  the extraction routes under "Hosts contacted"), the repository README's row,
  the milestone's status line.

## Gates

- `node --test fr-urban-rules/tests/*.test.mjs`: **277/277** (247 + 30), three
  runs in a row green.
- `node --test 'services/*/tests/*.test.mjs'`: 126/126; `sh3f-importer`:
  99/99.
- `package validate ./fr-urban-rules`: passed (0.6.0, SDK 1.28, against the CLI
  built with 096.8a–b).
- `build-index` into the scratchpad: 2 packages (fr-urban-rules **0.6.0**,
  sh3f-importer 1.3.0); `check-index --platform ../archisimple`: 2 of 2
  accepted.
- **The platform's built `checkedReport`** (with actions; a scratch script):
  Lyon not read (and its progress reports), queued, extracting 3/9, done (the
  recording plus a façade-relative and a façade « voir le document
  graphique » rule), 30 written rules confirmed (section 16 kB), the section
  alone without the service, the section under an older version (reopened),
  a key no longer read, a partial result from another provider, and eight
  failure codes — **34 reports, 0 dropped, 0 refused**.
- `prettier --check` on the files this sprint wrote or changed: clean.

## Live (local gateway and ai-service, 2026-10-20)

`services/gateway` on :4599 (scratch data folder, real HTTPS to the GPU,
`FR_URBAN_RULES_EXTRACT_CHUNK_CHARS=8000`, `…_MAX_ITEMS=30`), the platform's
`apps/ai-service` (`dist/`, unchanged) on :4392 with LM Studio
`qwen/qwen3-vl-8b`, `structured-output: schema`; the extension's reader with
002.0's recorded planning answers, real timers, and an `onDidChange` listener
reading `source` as the host does. Both processes stopped afterwards (the
ai-service on :4998 belongs to another session and was left alone).

- **Lyon UCe1b, cold:** the `site` read asked `GET chapter` and `GET
  extractions?cachedOnly` (« non lu », Lire offered); **Lire** → one `POST`,
  `{ status: 'done' }` in 0.2 s; the job walked queued → extracting 1/9 … 9/9
  → done in **130 s** (the service's log: 9 chunks, 129.8 s), polled every
  3 s for the first minute, then every 10 s (27 polls); **13 written rules**
  for UCe1b, among them `boundary_setback` min 4 m p. 126 « Le retrait* est au
  moins égal à 4 mètres. », `green_ratio` 15 % p. 133; parking rules and two
  `height_total 1 m` readings of terrain movements at `low`. **Confirm** on the
  4 m setback → `done`, the rule `confirmed`, the entry holding `kind`,
  `limit`, `provenance`, `zone`, `citation`; `checkedReport` 0 dropped.
- **This run found deviation 9:** it fired on the action and on all 27 polls
  though most changed nothing; fixed and tested before the second pass.
- **Second pass, fixed code, warm service cache:** a new session for UCe1b
  found the result by `cachedOnly` alone (368 ms, 13 rules, pages 121–144,
  « lmstudio · qwen/qwen3-vl-8b », 2 rules of other sectors, no Relire
  offered, no fire, no `POST`); for **UCe1a** — the same chapter — 14 rules
  from the same cached extraction, 1 of another sector. `checkedReport` 0
  dropped on both. The model's answers differ from the recording (13 vs 30
  for UCe1b): 002.5b deviation 3 holds.

## Acceptance criteria, walked

1. **Met.** `written.test.mjs` "criterion 1: a read asks cachedOnly once and
   never POST…" (the query, once per session across `site`, `design`,
   `source`; no `POST`); "criterion 1: a late cachedOnly answer is kept and
   fires onDidChange once, after the read returned…" (the read returns
   « checking », one fire after it, the `source` read shows the rules with no
   new request); "S5: a change while a read is in flight fires only once that
   read has returned" (a Refresh held on API Carto's commune while a poll
   lands: no fire until it returns).
2. **Met.** "criterion 2: Extract sends one POST, returns done at once…": the
   body, no `refresh`, `{ status: 'done' }`, a second click sends nothing;
   queued → fetching → extracting 1/9 → done, one fire per step, polling
   stopped. "…polling slows to 10 s after a minute…, a lost job reads the
   cache again", "dispose cancels a running poll", "the Extract action fires
   nothing…, a poll that changes nothing fires nothing". Live: below.
3. **Met.** "criterion 3: every code of 002.5a and 002.5b has its state and its
   phrase in both locales" (16 codes through a failed job: `unavailable`, the
   phrase, Try again offered or not; a `cachedOnly` `503 busy` with its retry
   time; an unknown code `constructor` → `unavailable`); "zone_chapter_not_found
   lists the codes the service saw, as text".
4. **Met.** "criterion 4: Lyon UCe1b…": `boundary_setback` min 4 m,
   `written`, `to_confirm`, p. 126, article `2.2.1.2` (002.5b's deviation 5:
   the nearest heading), the passage `lang: 'fr'`, href `…#page=126`, id
   `written:UCe1b:…`; `footprint_ratio` `not_regulated`; no `written:UCe1a:`
   rule, « 2 règles d'autres secteurs non affichées »; 30 rules (32 recorded −
   2 UCe1a). Also "a confirmed written setback is checked as a drawn one is".
5. **Met.** "criterion 5: a rule read as another kind keeps its id; the same
   sector and passage twice get ~2" (also: other spacing is the same key).
6. **Met, on a rule added to the recording.** The recorded Lyon result holds
   **no** written façade height « voir le document graphique » (002.5b
   criterion 7: the model gave that statement to the footprint), so the tests
   add one (`facadeSeeGraphic`, p. 130). "criterion 6: … relabels the drawn
   Max-22…": `height_facade` 22 m `to_confirm` with « Hauteur de façade,
   d'après le règlement écrit », the written rule `information` with « voir
   « Hauteur Max-22 » », no check on it; confirmed, it stays confirmed across
   `action`, `design`, `source` reads with `kind: 'height_facade'` stored.
   "…an earlier drawn confirmation with no kind reopens…" (and one stored as
   `height_total`; without the written rule it stays a confirmed total
   height). **With the recording as it is, Lyon's Max-22 stays a total
   height** — the relabel needs the model to read the façade height's
   statement.
7. **Met.** "criterion 7: a written « see graphic » with no drawn rule…": the
   recorded `footprint_ratio` `see_graphic` (p. 128) is `not_evaluable` with
   « aucune prescription graphique … Saisissez-la », no Confirm, the entry
   forms there.
8. **Met.** "criterion 8: « R ≥ Hf − 4 m, min 2 m » is height_relative…"
   (`factor 1`, `offset −4 m`, `minimum 2 m`, `reference: facade_height`);
   "…9 m façade at 4.5 m is a potential issue, at 5.5 m no issue — one check"
   (`chk:<rule>:building-main`, measured 4.5, limit 5, `byFacade` asked);
   "…an L-shaped building … one passing check naming the governing façade"
   (N governs, « E 3 m / 2 m » listed); "…a façade whose height is unknown…".
9. **Met.** "criterion 9: Confirm writes one Request with plot, kind, limit,
   provenance and citation; without the service the rule stands and is
   checked" (schema 1; `zone`, `idurba`; with no service: confirmed, the stored
   limit and passage, « lu le … », its façade check `potential_issue`, Reopen
   only); "Edit value on a written value writes the number in `value` and
   `limit`".
10. **Met.** "criterion 10: Confirm … after the session lost it is refused"
    (a new session; the same one after dispose; no write); "Edit value is
    offered on a value and a ratio written rule, never on a height_relative
    one" (ratio: percent, max 100, initial 15; the subject's fields are `i`
    and `d` only).
11. **Met.** "criterion 11: the 0.5.0 reader…" — the **real 0.5.0 build**
    (`releases/0.5.0/index.mjs`) reads a section 0.6.0 wrote: writable, the
    written confirmation listed « D'une version plus récente », no Forget; a
    Confirm on « Hauteur Max-22 » writes it back deep-equal, schema 1.
12. **Met.** "criterion 12: a result for another version is not shown; a
    confirmed written rule of the old version reopens with its old limit and
    citation" (the overview's « nouvelle version » notice counts it). Also
    "DEC-7: a confirmed key the current extraction no longer reads is listed
    with its passage and Forget".
13. **Met.** "criterion 13: Extract again is offered for another provider, an
    older prompt, a partial result — and not when they match"; it `POST`s
    `?refresh=1`; the partial notice carries `failed`, `of`, `dropped`.
14. **Met.** "criterion 14: no extracted string reaches a phrase key, a
    params value or an href" — every passage, condition, exception and
    article of the recording and the two added rules, against every key,
    param and href of a report with written rules read and confirmed; every
    written href ends `.pdf#page=<n>`.
15. **Met.** `package.test.mjs` criterion 1 (`0.6.0`, `1.28`); `package
    validate` passes against the CLI built with 096.8a–b.

## Step 5, the walk

- **Not done in the editor** (no Docker for 096.8a's local override, and no
  browser session with the editor here). The live run below covers its
  service half: read, extract, the states, confirm the 4 m rear setback. Its
  sub-steps 4 (the drawn 22 m reopened as a façade height) depends on the
  model reading that statement, which the recorded and live answers did not
  (criterion 6); 5–6 (undo, reload, a deployment without the service) are
  covered by tests (criteria 9, 11) and stay the owner's to see.

## Deviations

1. **A check on a written rule to confirm carries its real result**, as 002.2
   does for drawn and entered rules; outside the count because the host
   counts only confirmed rules. **Decided at review (Q2): kept**; the Contract
   box now says so.
2. **The relabel condition names no article.** DEC-5's « d'après l'article
   <article> » would put an extracted string in a parameter, which DEC-8 and
   criterion 14 forbid. It reads « Hauteur de façade, d'après le règlement
   écrit » (the written rule, with its article, is listed beside it).
3. **An unplaced sector is two conditions**, the phrase « Secteur non
   retrouvé dans le règlement : » and the sector as verbatim text, for the
   same reason (DEC-3 wrote « secteur : <texte> » as one).
4. **More not-checked cases than DEC-3 lists:** a height relative to the
   altitude difference (`relative-not-measured`), and the reasons are per
   building, as 002.2's.
5. **One `sources[]` line per zone**, `written-rules` then `written-rules-2`…
   (DEC-2 names one id); a plot on one zone has exactly DEC-2's.
6. **A written rule standing on the section alone offers Reopen only.**
   Confirm and Does not apply need the rule read (DEC-4); its reopened state
   after a version change says « lu le … » and Extract is offered above it.
7. **A drawn rule's kind rides in its action subject** (`k=`), so the
   stateless 002.2 action can store it (DEC-5 S4).
8. **Signals:** DEC-1's "after the current read" is implemented for every
   change, including 002.6a's chapter (which fired directly in 0.5.0), and an
   answer that lands between a read's deadline and its end is signalled at
   its end (`revision` / `applied`) — a gap the first test of criterion 1
   found.
9. **Two inefficiencies the live run showed, fixed:** the Extract action
   fired `onDidChange` although the host reads with `action` after it; and
   every poll fired, though most change nothing (« morceau 1 sur 9 » five
   times). Now the action fires nothing and a poll fires only on a change
   (test).
10. **A transient failure keeps a result already shown** (as 002.6a S4), and
    a `cachedOnly` failure is asked again after 002.6a's back-off.
11. **A written ratio did not feed 002.3's surfaces** (they read a
    `footprint_ratio` `value` in percent). **Decided at review (Q3): it does
    now** — see the review fixes.
12. **The 0.5.0 build is kept as a test fixture** (366 kB, outside the
    package) for criterion 11 — the only way to test "a 0.5.0 reader" against
    the code that shipped rather than a copy of its rule.
13. **Lyon's recorded result is `promptVersion` 1**, so against a service at
    `PROMPT_VERSION` 2 Extract again is offered (as the live run showed); the
    tests use `current.promptVersion: 1` unless they test that.

## Questions for the owner

_All three answered on 2026-10-20 by the coordinator on the owner's behalf;
see "Review fixes" below._

1. **Unplaced parking sectors.** Lyon's recording carries 20 `parking` rules
   for the « secteurs de stationnement » Aa…E, all `sectorUnplaced` and kept
   per DEC-3 — the Rules view shows them all, low confidence. Keep them, or
   hide unplaced rules behind the « other sectors » count?
2. **Checks on unconfirmed written rules** (deviation 1): keep 002.2's real
   result, or make written rules `not_checked` until confirmed as the
   Contract wrote?
3. **A written ratio in the surfaces** (deviation 11): read a confirmed
   written ratio of the plot area as the footprint coefficient in 002.7, or
   now?

# Review fixes (2026-10-20)

An independent review found no blocking issue. The coordinator took the
owner's decisions; they supersede the Outcome above where the two differ
(deviations 1 and 11, the questions, the first Contract box).

## Owner decisions

1. **Q1 — keep the unplaced parking-sector rules listed** (DEC-3 as written).
2. **Q2 — checks on unconfirmed written rules keep their real result**, per
   002.2 DEC-7; the host counts only confirmed rules. The first Contract box
   is rewritten as that plain statement.
3. **Q3 — a confirmed written footprint ratio feeds 002.3's budget now.**
   `footprintPercentOf` reads a `value` in percent, or a `ratio` of base
   « plot area » and comparison `max`; `confirmedLimits` answers `ces` as
   `{ rule, percent }` and every read of the coefficient uses it (the budget,
   its row, the footprint checks, the programme's figures). An emprise or
   floor-area base, and a minimum, never feed it. Test: « ≤ 40 % of the plot
   area » on 1 178 m² allows 471.2 m²; the three others allow nothing.

## Fixes

- **S1 — polls that fail.** Consecutive failures are counted and the
  service's `Retry-After` honoured; five running, or fifteen minutes of them,
  fail the zone (`unavailable`, or `timeout`); a job that stays in one state
  and chunk past 35 minutes (the service's own call bound is 30) fails as
  `timeout`. Tests: 40 × `429` polls at 3 s, then 30 s four times, and stops
  after five; a stuck job.
- **S2 — pause on every plot change.** A read of a plot with no PLU(i), or
  with no service located, pauses every record; `paused` is honoured by a
  poll already scheduled. Test.
- **S3 — the retry time is kept.** `fail` stores `notBefore`; the view
  renders it (never recomputed from now), hides Try again until then, the
  action refuses before it, and `cachedOnly` is not asked before it. Test with
  a held clock.
- **S4.** A written rule confirmed as one kind and read now as another reopens
  (« nature corrigée »). Test.
- **S5.** `checkedServiceRule` leaves out, and counts, a `value` or `ratio`
  whose comparison contradicts `MINIMUM_KINDS` (except `parking` and
  `other`); the height and setback checks use the limit's own comparison.
  Tests both ways. Lyon's recorded UCe1a « band » (a road setback « at most
  17 m ») is now left out: its other-sector count is 1, not 2.
- **S6.** A drawn confirmation stored as a façade height keeps its kind when
  no written result is read (no service, or `cachedOnly` still to come); it
  reopens only when a written result relabels or reads the parsed kind. Test
  (no service, slow `cachedOnly`, then a written total height).
- **S7.** `writtenSession` is replaced only by a read's answer that knows the
  written state, never by a progress report. Test: a Confirm during a Refresh
  whose `locate()` is held — it failed before the fix.
- **S8.** A written building distance is not checked only when it states a
  limit; « not regulated » is no check. Test.
- **NITs.** Lengths over 10 km and factors over 100 are refused (service and
  section); written rules past the host's 1,000 are counted and said
  (`notice.writtenCapped`, test with 1,000 rules and 3 entered); an answer
  over 4 MiB is `unavailable` (test); a `starting` flag stops a second POST
  while the first is on its way (test); a `cachedOnly` or 404 answer signals
  only a visible change (test); `refresh` dropped from `WRITTEN_CODES`; a
  partial result never lists « no longer read » (test); a done zone whose
  Extract again failed shows its retry time; `Number.isSafeInteger` for pages;
  zones read in a fixed order and a rule two zones of one chapter share listed
  once (test, both orders); the 0.5.0 file's sha256 is asserted.

## Gates, again

- `node --test fr-urban-rules/tests/*.test.mjs`: **292/292**, twice
  (`written.test.mjs`: 45).
- `node --test 'services/*/tests/*.test.mjs'`: 126/126.
- `package validate ./fr-urban-rules`: passed (0.6.0).
- build-index: 2 packages; check-index: 2 of 2 accepted.
- The platform's built `checkedReport` (with actions): the 34 written-rule
  reports and 002.6a's 155, 0 dropped, 0 refused.
- `prettier --check`: clean. No gateway or ai-service process of this sprint
  is running.

_Noted at the close (2026-10-22): this sprint carries no post-sprint list; what it changed in the documents is recorded in its Outcome. Not invented after the fact._
