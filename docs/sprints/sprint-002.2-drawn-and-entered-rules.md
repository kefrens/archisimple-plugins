# Sprint 002.2 — Drawn and Entered Rules

> **Status:** **Implemented, uncommitted (2026-10-20)** — `fr-urban-rules` 0.3.0;
> 153 tests green; the editor walk (step 8, criterion 9) goes to the 096.6 /
> 002.4 joint walk.
>
> **Version:** 1.0
>
> **Repository:** `archisimple-plugins` · package `fr-urban-rules` → **0.3.0**
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 5.2 items 1 and 3 (drawn, entered), § 5.3, § 8 (persisted), US-03.
>
> **Prerequisites:** 002.0 (prescriptions read), 002.1a (the coded rules,
> the checks' machinery, edge roles, the `document` capability). Platform:
> 096.3b (SDK 1.26: actions with a value input, the six-field form, DEC-13
> there), 096.4 (contract 3.20.0, SDK 1.27: package data on the Site,
> Requests, undo, `onDidChange`). The package declares SDK 1.27.
>
> **Sizes:** a parser, a confirmation model, three actions and a form.
> Medium.

---

# Sprint Design Contract

Verified against `fr-urban-rules/src/index.js` on 2026-10-20.

- [x] **Nothing parsed becomes a constraint until a person confirms it.**
      _Held: a drawn rule enters `to_confirm` (or `not_evaluable`); its check
      carries its real result and the host's count (`isPotentialIssue`,
      confirmed rules only) leaves it out — criterion 2's test mirrors it._
- [x] **Every decision is a Request, one undo step.** _Held: every action is
      one `write(next, label, expected)`; criterion 3's tests count exactly one
      write per action and an `expected` on each._
- [x] **The project holds decisions, never readings.** _Held: the section
      holds `confirmations`, `entered` and 002.1a's `edgeRoles` only; GPU
      answers stay in the session cache, checks are recomputed._
- [x] **A version change reopens, never migrates.** _Held: a confirmation or
      an entered rule whose `idurba` / `datvalid` differ is `to_confirm` with
      its old value and date; nothing rewrites the entry (criteria 5, 6)._
- [x] **The section survives without the extension.** _Held on this side:
      nothing here depends on the host reading the section; unknown members
      are kept on every write; a section of an unknown schema, or with an owned
      member in an unrecognised shape, is read-only and never rewritten. The
      host side is 096.4's test; the manual round trip (criterion 9) is not
      done._
- [x] **No absence of a parse reads as an absence of a limit.** _Held: an
      unread number is `not_evaluable`, `described`, its `libelle` and `txt`
      quoted._

---

# Outcome (2026-10-20)

> **Walked in acceptance** (2026-10-20) by Sprint 002.4 jointly with the platform's 096.6, on five reference plots in the editor — see 002.4's Outcome; the owner has not looked yet.

`fr-urban-rules` **0.3.0**, uncommitted. New in the tree: the parser
(`parsePrescriptionValue`), the keys (`drawnKey`, cyrb53), `plannedRules`,
`plannedChecks`, `envelopeFeature`, `nextSection` and the rules view in
`src/index.js`; `tests/rules.test.mjs` (24 tests);
`test-fixtures/fr-urban-rules/prescription-corpus.json` (step 1).

**Step 1, the corpus.** API Carto `prescription-surf` and `-lin` over a
≈ 400 × 300 m box around a dense central point of Paris, Marseille, Toulouse,
Nantes, Bordeaux, Strasbourg, Grenoble, Rennes, Lille and Montpellier
(2026-10-20), plus Lyon's recording (Gordes holds no prescription): **51
pairs** of `typepsc` 38, 39, 42, 44, 15, each with its parse reviewed by hand.
What it taught the parser: Strasbourg writes « 10mET » / « 25mHT » (eaves /
overall), Bordeaux a bare « 5.00 » under « hauteur de façade », Marseille « mini
18.0m et max 26.0m », Nantes « R+1+C », Lille « NR/22 » (kept an expected
not-evaluable), Grenoble the number alone in `libelle` (« 23m »).

**Gates.** `node --test fr-urban-rules/tests/*.test.mjs` — **153 pass, 0
fail**; `urban-rules` 10, `sh3f-importer` 99; `package validate` (0.3.0);
build-index (3) and check-index (3 of 3) into the scratchpad; `.aspkg` 0.48 MB.
Out of the suite, Lyon, Gordes, Rochefort and Brouennes reports with drawn,
entered and coded rules, their actions, an unapplied foreign confirmation and a
reopened entered rule passed the platform's `checkedReport` **with actions**:
0 dropped, 0 refused, progress included; 002.0's five plots, 002.1b's full
reports and the 20,000-edge boundary likewise.

## Deviations

1. **DEC-3's example omits `plot` on `edgeRoles`**: the shared schema's origin
   is 002.1a DEC-8, whose entries carry `plot`; kept as 002.1a wrote it.
2. **What an action needs travels in its `subjectId`** (the version read
   against and the parsed value, `i=…|d=…|v=…|u=…`), opaque to the host, so
   `runAction` builds the next section from the section and the request alone
   — no copy of the report in the extension's memory.
3. **One check per rule** (DEC-8): a drawn and an entered rule on the same
   matter each have their own check, both shown; no merged "stricter" check.
4. **No check for parking, other, footprint, green space, floor area or an
   entered building distance**: the rules are listed (parking `not_evaluable`);
   002.3 measures the surfaces; R.111-15's machinery is not reused for an
   entered distance between buildings.
5. **The envelope** is the boundary cut by each edge's inward half-plane at
   its confirmed setback (stricter than an inset on a concave boundary, said);
   its label carries the lowest confirmed total height.
6. **A drawn setback line (15)** with a distance is a `road_setback` on the
   street edges; its use as an implantation line is phase 2 (correction 5).
7. **Entered rules reopen too** when the read's version differs from the one
   they were entered against (DEC-4 named confirmations only).
8. **Coded confirmations** key to `idurba: "CU"` and the article's ISO
   `versionFrom` (`2016-01-01` for R.111-15).
9. **Editing an entered rule** shows four fields (statement, value, source, page): its kind is fixed and its note kept. _(Read "five" until the review fixes of 2026-10-20.)_
10. **The corpus** is a box per commune around a central point, not "one
    parcel in a dense zone each"; it gathers more pairs for the same requests.

## Acceptance criteria, walked

1. ✅ `rules.test.mjs` "criterion 1" ×2: « Hauteur Max-22 » / « 22 » →
   `height_total` 22 m, `high`; all 51 corpus pairs → their reviewed parse.
   Plus a test of the special cases.
2. ✅ "criterion 2": `to_confirm`, its check `potential_issue` (25 m against
   22 m), not counted by a mirror of the host's `isPotentialIssue`.
3. ✅ "criterion 3" ×3: Confirm, Edit value, Does not apply, Reopen, the three
   Add actions, Edit and Remove each write once with `expected`, and the report
   rebuilt shows it; Forget in criterion 15; `false` → `refused`, nothing
   written; a throw → `refused` with its reason.
4. ✅ "criterion 4": the section put back (the host's undo) → `to_confirm`.
5. ✅ "criterion 5": 20260326 read against 20261002 → `to_confirm`, the old
   value, date and version shown, the overview counting 1 with Review.
6. ✅ "criterion 6": Gordes, 2024 `idurba` with the zone's 2022 `datvalid`
   stays confirmed; either changed reopens.
7. ✅ "criterion 7": `href` `…#page=132`.
8. ✅ "criterion 8": schema 2 → no action, the notice, a refused action, no
   write.
9. ❌ **Not done** (manual): saved, reloaded, opened without the extension and
   back — to the joint walk; 096.4's test proves the host side.
10. ✅ "criterion 10": a height prescription over the west half checks the
    west building only, said "applies where drawn".
11. ✅ "criterion 11": not regulated → no limit, `statement: 'not_regulated'`;
    a limit without a value refused.
12. ✅ "criterion 12": `PLUi` stored, `PLUI` read → confirmed.
13. ✅ "criterion 13": the key ignores the kind; a move over a metre changes it.
14. ✅ "criterion 14": the `site` read after a Confirm sends no request; a
    refresh does.
15. ✅ "criterion 15": another plot's confirmation and entry not applied,
    listed with two Forget actions, one of which removes its entry.
16. ✅ "criterion 16": the forms declare `m`, `percent`, `m2`; the metres the
    host hands over are stored as given.

## Post-sprint list

- [x] Package `README.md` (0.3.0 section) and the manifest description.
- [ ] Step 8 / criterion 9: the editor walk on Lyon AB0105 — to the joint walk.
- [ ] Commit (the owner's).

## Revision by Sprint 002.4 (2026-10-20)

The owner's Q5 in 002.4, decided on the owner's behalf: a drawn or entered
setback is **one check per rule per building** (id
`chk:<ruleId>:<buildingId>`), not one per edge of its roles. The worst edge
governs (the largest shortfall, else an edge not checked, else the smallest
margin) and gives the check its result, figures and `figure`; the other edges
are listed with their distances in the subject's label
(`check.subject.mainEdges` / `namedEdges`). Lyon's rear setback now counts
**1** potential issue (edge 9, 2.60 m), not 4. The envelope is unchanged.
(`oneCheckPerBuilding` in `src/index.js`; `tests/rules.test.mjs` "002.4
Q5".)

## Review fixes (2026-10-20)

An independent review of the implementation raised one blocking finding (B1),
seven should-fix (S1–S7) and five nits. All were fixed in the tree on
2026-10-20, alongside Sprint 002.3 (the package went to 0.4.0 there; 0.3.0 was
never released). Tests: `tests/rules.test.mjs` "B1", "S1"–"S7", "NIT".

- **B1 — a reopened entered rule could not be confirmed again.** Its actions
  carried the version it was entered against, so Edit wrote the old version
  back and it stayed reopened. Now an entered rule's action subject is the
  version read now (`planned.current`); a reopened one offers **Confirm**
  (`confirm-entered`, re-stamps `idurba` / `datvalid` and keeps the rest), Edit
  stamps the current version too, and reopened entered rules are counted in
  `planned.reopened`, so the overview's "n rules need to be confirmed again"
  includes them.
- **S1 — actions.** The entered rules, then the rules with a value, come first;
  a rule's actions are kept together; the rules left without theirs past the
  host's 200 are counted in a notice (`notice.actionsCut`). No "Does not
  apply" on a `not_evaluable` rule.
- **S2 — rules capped at the host's 1,000.** The coded and entered rules are
  kept; the drawn ones past the room left are counted in a notice
  (`notice.rulesCapped`), and a confirmation of a capped rule is not listed as
  "no longer in the plan".
- **S3 — the parser.** No value (the rule stays `not_evaluable`, its words
  quoted) from a minimum where a cap is meant (« mini », « minimum », « au
  moins », with no « max »), a count of levels (« niveaux », « étages »,
  « niv. »), an altitude (« NGF », « altitude »), a thousands separator, a
  zero, a number after a decimal point (« .5 ») or a lone sign (« -3 m »), and
  two figures no keyword tells apart (in `txt` or `libelle`). A bare number is
  `low` whatever the label (DEC-1): Bordeaux's seven corpus pairs were
  re-reviewed from `medium`. Marseille's « mini … max » still reads the max,
  the minimum quoted as a condition. A table of the new cases is in the tests;
  the recorded corpus is unchanged otherwise.
- **S4 — the key's centroid** is the area-weighted centroid of the outer rings
  **before** simplification (a line's box centre), computed at conversion.
  Two prescriptions with the same words and no place (a point, an unconverted
  geometry) get `~2`, `~3` in their order; two with the same words at the same
  place are one prescription served twice, counted. Both are said in a notice
  (`notice.drawnDuplicates`) — no collision is dropped silently. **Drawn keys
  changed** from the first 0.3.0 tree; nothing was released with them.
- **S5 — the envelope** is drawn on a convex Site boundary only (a vertex
  turning inward by more than 0.5° makes it concave). On a concave boundary an
  edge's half-plane cut across the other wing — an L-shaped plot lost a leg —
  so none is drawn and the assumption `envelope-not-convex` says why; the
  checks still use every confirmed setback. The strip inset is 002.7's.
- **S6** — the "no longer in the plan" and "from another plot" tables show the
  stored value with its unit (a fourth column).
- **S7** — percentage fields have `max: 100`; a percentage above 100 is
  refused with a phrase.
- **Nits.** Subject fields are escaped (`encodeURIComponent`, each cut to 200
  characters), so a `|` in a version cannot split a subject; a drawn rule whose
  place cannot be tested on a building (projection unavailable) gives that
  building no not-checked line; `edited` is set only when the value differs
  from the one read; a page that is not a whole number ≥ 1 is refused
  (`entered.pageInteger`), never dropped; deviation 9 corrected — editing an
  entered rule shows **four** fields (statement, value, source, page), not
  five.

Gates after the fixes (with 002.3): 193 tests pass; `package validate`;
build-index and check-index (2 of 2) into the scratchpad; the platform's
`checkedReport` accepts the five recorded plots' reports, progress included,
with 0 dropped and 0 refused.

---

# Current state

- 002.0 reads `prescription-surf/-lin/-pct` with `libelle`, `txt`,
  `typepsc`, `stypepsc`, and maps them to categories; it puts no rule in the
  report.
- 002.1a–b encodes the RNU rules and evaluates `height_relative` checks;
  R.111-15 stays `to_confirm` because nothing could confirm it yet.
- The live probe (§ 4.2, § 4.5):
  - Lyon AB0105 has 13 surface prescriptions, one being
    `{"libelle":"Hauteur Max-22","txt":"22","typepsc":"39","stypepsc":"02"}`;
  - the value is "free text in `libelle` / `txt`, and often empty";
  - CNIG 15 setback **lines** have geometry and usually `txt: null`.
- The platform will give a per-package Site section (096.4, ADR-0112),
  opaque to the host, changed by Requests; and a Properties renderer with
  actions that call back into the extension (096.3b, G14).

---

# Goal

The plot's drawn prescriptions with a number become rules to confirm, with
their source shown; any rule can be entered by hand with its source typed;
the user confirms, edits or sets aside each rule in Properties, each step
undoable, saved in the project against the document version, and reopened
when the version changes.

# Out of scope

- Written rules extracted from the regulation (phase 2, 096.7 / 002.5a–b).
- Approval flags as rules: ABF, PPR and sites stay flags.
- Recording **who** confirmed: the application has no user (proposal § 7.1,
  "Confirmations carry the time, not a user").
- The envelope in 3D (096.9). The plan outline from confirmed rules is in
  scope (DEC-7).

---

# Decisions

## DEC-1 — What is parsed, and how

Only prescriptions whose `typepsc` the 002.0 table maps to a numeric kind:

| `typepsc` | Rule kind                                                                                                                                                                                                                                         | Unit expected                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 39        | `height_total` by default (`height_facade` when `libelle` says « façade », « égout », « acrotère »); relabelled `height_facade` in phase 2 when the written rule says drawn heights are façade heights (Lyon, art. 2.5.1.1) — 002.6b DEC-5 does it, reopening a confirmation whose stored `kind` differs | m                                                               |
| 38        | `footprint_ratio` (a `%`) or `floor_area_max` (an `m²`)                                                                                                                                                                                           | % or m²                                                         |
| 42        | `green_ratio` (« biotope », « pleine terre », « espaces verts »)                                                                                                                                                                                  | % or a coefficient (a coefficient ≤ 1 is converted to a percentage; the SDK has no coefficient unit) |
| 44        | `parking`                                                                                                                                                                                                                                         | — (`not_evaluable` in phase 1: parking counts are not measured) |
| 15        | `road_setback` / `boundary_setback` when `txt` or `libelle` holds a distance; otherwise a line with no distance                                                                                                                                   | m                                                               |

The parser, a pure function `parsePrescriptionValue({ libelle, txt })`:

1. `txt` first, then `libelle`.
2. Normalise: lower case, non-breaking spaces to spaces, `,` as a decimal
   separator when followed by digits.
3. One pattern per kind, anchored on a unit or a keyword:
   - `(\d+(?:[.,]\d+)?)\s*(m|mètres?)\b` for a length;
   - `(\d+(?:[.,]\d+)?)\s*%` for a ratio;
   - `max(?:imum)?[\s-]*(\d+(?:[.,]\d+)?)` for « Hauteur Max-22 », where the
     unit is implied by the kind;
   - a bare number in `txt` (« 22 ») when `txt` holds nothing else.
4. Several numbers (« R+3 / 12 m », « 9 m à l'égout, 12 m au faîtage »):
   the parse takes the one matching its keyword (« égout » → façade,
   « faîtage » → total) and lists the others in the rule's `conditions` as
   verbatim text. `R+n` is recorded as a condition ("n storeys above
   ground"), never converted to metres.
5. Nothing parsed: the rule is `not_evaluable`, with `libelle` and `txt`
   quoted.

**Confidence.** `high` when the number came from `txt` alone and the kind's
unit matches; `medium` from `libelle` with a keyword; `low` for a bare
number or several numbers. Shown with the rule; never used to auto-confirm.

**The test corpus** is the probe's: the 13 Lyon prescriptions recorded in
002.0, plus every `libelle` / `txt` pair of `typepsc` 38, 39, 42 found on
the five reference plots and on ten more PLU(i)s probed in step 1 (Paris,
Marseille, Toulouse, Nantes, Bordeaux, Strasbourg, Grenoble, Rennes, Lille,
Montpellier — one parcel in a dense zone each). Each pair with its expected
parse is a table in the test. A pair the parser gets wrong is either fixed
or kept as an expected `not_evaluable`, never removed from the table.

## DEC-2 — A rule's stable key

Confirmations must find their rule again on the next read. API Carto's
feature `id` is not promised stable across reloads of its database, so a
drawn rule's key is built from its content:

```text
psc:<typepsc>:<stypepsc>:<digest of libelle|txt|centroid rounded to 1 m in the Site's CRS>
```

- **The parsed kind is not in the key.** 002.6b DEC-5 relabels a drawn
  `height_total` as `height_facade`, and a better parser may change a kind.
  With the kind in the key, either change would orphan every confirmation.
  The kind is a property of the rule, not part of its identity.
- **The Site's CRS**, `SiteView.crs`, not "Lambert-93": overseas
  departments use other CRSs.
- **A synchronous digest** (cyrb53, the one `regulationSiteKey.ts` uses
  host-side), so the key builders stay pure and synchronous.
  `crypto.subtle.digest` is async.

Coded rules keep 002.1a's keys (`rnu:R.111-17`). Entered rules get
`entered:<random 12 hex>` at creation. A drawn rule whose geometry moves
by more than a metre in a new version gets a new key, which is right: it is
a different prescription.

## DEC-3 — The persisted section

The package's Site section (096.4), one JSON object, versioned by the
extension:

```json
{
  "schema": 1,
  "confirmations": [
    { "ruleKey": "psc:39:02:5f1c…", "plot": ["69382000AB0105"],
      "idurba": "200046977_PLUI_20260326", "datvalid": "20260326",
      "decision": "confirmed", "value": { "kind": "value", "value": 22, "unit": "m" },
      "edited": false, "at": "2026-10-19T10:42:00Z" }
  ],
  "entered": [
    { "key": "entered:9a0b…", "plot": ["69382000AB0105"], "zone": "UCe1b",
      "kind": "boundary_setback", "statement": "limit",
      "limit": { "kind": "value", "value": 4, "unit": "m" },
      "edgeRoles": ["rear"],
      "source": { "document": "Règlement PLUi", "page": 132, "article": "2.1.3",
                  "passage": "Ce retrait est au moins égal à 4 mètres…" },
      "idurba": "200046977_PLUI_20260326", "datvalid": "20260326",
      "at": "2026-10-19T10:50:00Z" }
  ],
  "edgeRoles": [ { "ends": [[…], […]], "role": "street", "at": "…" } ]
}
```

- `decision`: `confirmed` | `not_applicable`. `to_confirm` is the absence
  of an entry.
- `edited: true` when the value differs from the parsed one; the citation is
  kept (US-03 "Edit value, which keeps the citation").
- `edgeRoles` is 002.1a's, keyed by the edge's end points (ADR-0089 Rule 7
  forbids persisting an edge number).
- **Coded rules** confirm against the coded text's version
  (`idurba: "CU"`, `datvalid: <Légifrance version date>`): R.111-15's
  confirmation reopens if the extension ships a newer text.
- A section with an unknown `schema` is shown as "saved by a newer version
  of this extension", read-only, never rewritten.
- **`plot`** holds the parcel ids (`SiteParcelView.featureId`, the `idu`)
  of the plot the entry was made on.
  - The section is one per project, shared by every variation, and the host
    never clears it: not on a new plot, a relocation or a change of country
    (ADR-0112 Rule 9).
  - An entry whose `plot` is not the current plot's is not applied. It is
    listed under "from another plot", with a **Forget** action (DEC-4).
  - A version-0 entry without `plot` reads as the current plot's.
- **`statement`** on an entered rule: `limit`, or `not_regulated` (DEC-6).
  A `not_regulated` entry carries no `limit`.
- **The private value shapes are mapped to the SDK on the way out.** The
  report sends `{ kind: 'value', comparison, quantity: { value, unit } }`,
  with units `m` / `m2` / `percent`, never `m²` or `%`. The comparison is
  fixed by the kind: `max` for heights, ratios and caps; `min` for setbacks
  and `green_ratio`.
- **Limits** (096.4; `write` throws past one): 262 144 characters
  serialized, depth 32. A hand-typed note is cut at 2 000 characters by the
  host (096.3b), so the section stays far below the limit. A write that
  throws anyway is answered `refused` (DEC-5).

## DEC-4 — Which version a confirmation is keyed to

§ 4.3: "Store `idurba` **and** `datvalid`. Gordes' zone carries
`datvalid` 2022 under a 2024 `idurba`." So:

- `idurba` is the **document's** (the `document` read of 002.0);
- `datvalid` is the **feature's own** — the prescription's when it has
  one, else the zone's (`zone-urba.datvalid`). For an entered rule, the
  zone's.

A confirmation matches when both equal the current read, **`idurba`
compared case-insensitively**. 002.0 found `PLUi` in the document API and
`PLUI` in `zone-urba`, so the value is stored upper-cased and compared
upper-cased. If either differs:
the rule is `to_confirm`, the previous value and date are shown ("confirmed
22 m on 19 Oct 2026 against version 20260326"), and the report's overview
says "A new version is in force. <n> confirmed rules need to be confirmed
again" with a Review action (Screen 5).

A confirmation whose rule no longer appears (a prescription removed) is
listed under "no longer in the plan" with its value, and a "Forget" action
removes it — the user's decision is never discarded silently.

- **Where these are shown.** They appear in a `table` block, with an
  `actions` block whose Forget carries `target.subjectId = ruleKey`. They
  are never shown as rules, which the host would count.
- **Entries from another plot** (DEC-3's `plot`) are listed the same way,
  under their own heading, with one Forget each.

## DEC-5 — The actions

Each action is a 096.3b Properties action calling back into the extension
(the choice actions and the value input are 096.3b DEC-3's shapes), which
builds the next section and sends **one** 096.4 Request
(`SitePackageDataService.write`):

| Action                | On                                 | Effect                                                                                   |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| **Confirm**           | a `to_confirm` rule                | adds a `confirmed` entry with the parsed value (the label is "Confirm"; the rule row shows the limit, host-formatted in the project's units — a phrase parameter cannot carry a quantity) |
| **Edit value**        | any rule with a limit              | one `number` field whose `unit` is fixed by the kind (`m`, `m2` or `percent`; the host converts `m`/`m2` to and from the project's units); adds or replaces with `edited: true` |
| **Does not apply**    | any rule                           | adds `not_applicable`                                                                    |
| **Reopen**            | a confirmed or not-applicable rule | removes its entry                                                                        |
| **Add a … rule**      | the Rules view                     | the three forms of DEC-6; appends to `entered`                                           |
| **Edit** / **Remove** | an entered rule                    | replaces / removes it, and any confirmation on it                                        |
| **Forget**            | a rule no longer in the plan, or an entry from another plot | removes its entry (`target.subjectId` = the key)                    |

**The write.** Each action builds the next section from the one it read
and calls `write(next, label, expected)`. The signature is
`write(data, label?, expected?) → boolean` (SDK 1.27):

- `label` is translated by the extension and is at most 80 characters.
- `expected` is the section the action built from, or `null` if there was
  none.
- `false` means the section changed since (an undo, for instance). The
  action answers `{ status: 'refused', message }` ("The rules changed;
  try again"), and writes nothing.
- **A throw** (over a limit, or `document` not declared) is caught and
  answered `refused` with the host's reason.
- After a successful write the action answers `{ status: 'done' }`
  **without** a report. The write changes the report's Site key, so the
  host reads again anyway (096.4 deviation 5).

**The read after a write is a `site` read.** The section's digest is in
the host's Site key, so a write starts a read with `reason: 'site'`, not
`'action'` (`useRegulationReport.ts`). So:

- The extension caches every GPU, API Carto and Géorisques answer by
  **plot**: the parcel ids and a digest of their rings.
- A read whose plot is unchanged rebuilds the report from that cache plus
  the section and the measures, with no request.
- Only a new plot, or `reason: 'refresh'`, fetches.
- Without this, every Confirm and every tick would refetch every source.
  096.4 owner question 3 (whether the source decides) is still open; this
  design holds either way.

The extension never writes from a timer or a read. Undo is the host's: after
undo the section changes, `SitePackageDataService.onDidChange` fires (096.4
DEC-7, requested for this) and the host re-reads (the section is part of its
Site key, 096.4 deviation 5), and the report is rebuilt from the section. The
extension holds no copy of the section that could disagree with it.

An entered rule is `confirmed` from its creation (the user typed it).

## DEC-6 — Entering a rule by hand

**Three actions, one per unit**, each at most six fields (096.3b's
ceiling):

- **Add a distance or height** — `unit: 'm'`.
- **Add a ratio** — `unit: 'percent'`.
- **Add an area cap** — `unit: 'm2'`.

Each has the same fields:

- **Kind** (choice) — the § 8 kinds that use the action's unit.
  - A setback kind names its edge role ("street setback", "side setback",
    "rear setback").
  - A ratio kind names its base ("footprint, % of the plot", "extension,
    % of the existing emprise").
  - So neither needs a field of its own.
- **Statement** (choice, required, initial `limit`) — "a limit" or "not
  regulated". With "not regulated", the value is ignored and the entry is
  `statement: 'not_regulated'` with no limit. The report carries it as a
  rule with `statement: 'not_regulated'` (096.2), which the host words
  « Non réglementé ».
- **Value** (number, in the action's unit; required unless "not
  regulated"). The extension refuses a missing value on a limit with a
  phrase.
- **Source** (text, required) — the document's name.
- **Page** (number, optional, `min: 1`).
- **Note** (text, optional) — the article and the passage. The host cuts it
  at 2 000 characters.

**Why three actions rather than a Unit choice** (decided, the review's
recommendation): `RegulationField.unit` is fixed per field.

- With a separate Unit choice, the number field would carry no unit, and
  the host could not convert it from a project set to feet (096.3b
  review Q1).
- One action per unit lets the host convert, and frees the field that
  Statement takes.
- "Not regulated" is a statement about a matter. It is **not** "Does not
  apply", which sets `not_applicable` on a rule that exists (Lyon has no
  footprint rule to set aside).

The zone is not a field: it is the read's zone, or none on a "Plan not on
the GPU" plot, where the rule applies to the plot.

A page makes the regulation link `#page=n` (002.0 DEC-7). On a
`not_published` plot, the form is the only way to have rules, and the
overview says so ("Ask the town hall for the règlement", Screen 5).

## DEC-7 — Confirmed rules feed the checks and the envelope

- `height_total`, `height_facade`: per building, 096.0b's projection
  `height` (096.0b DEC-5a, through 096.1's `measures.projection`):
  `topAboveGround` for total height, `eavesAboveGround` for façade height
  (absent without a roof: then the façade height is the top). Each comes
  from the lowest and from the highest ground at the foot; **which
  reference the PLU uses is a condition the user reads in the regulation**,
  so the check takes the lowest ground by default (the stricter) and names
  the reference and 096.0b's `frame`: "measured from the lowest ground at the
  building's foot". A `height` that is `unavailable` (no terrain) makes the
  check `not_checked` with its reason. So does one with `relativeUnavailable`
  (a datum on another system): `top` and the `*AboveGround` figures are
  **optional** on `BuildingHeightDto`. A `height` with `datumDerived: true`
  (terrain, no project datum, 096.0b review B1) runs the check with 002.1a
  DEC-7's `datum-derived` assumption in `assumptionIds`, never as a clean
  pass. `eaves` is the lowest covered run's; for a main volume beside a low
  annex, read the per-run façade samples (`byFacade`) instead.
- `road_setback`, `boundary_setback` with a `value` limit: distance from the
  projected outline to the edges of the named roles (096.0b), the same
  machinery as 002.1a without `Δz`. *(Revised by 002.4, 2026-10-20: one
  check per rule per building, the worst edge governing, the others listed in
  its label — the Outcome's « Revision by Sprint 002.4 ».)*
  - The level is **`storeys`** (walls and upper storeys; eaves excluded, as
    R.111-17 and most PLUs measure). The level is named in the check.
  - A PLU whose rule counts overhangs is a phase-2 condition.
  - Without a Site boundary (authored, never assumed) the check is
    `not_checked`, with its reason; likewise when the outline is refused.
- **A check on a rule still `to_confirm` carries its real result**
  (`no_issue` / `potential_issue`, measured and limit), not `not_checked`.
  The host counts only checks on `confirmed` rules (096.3a DEC-5). Its
  status bar's "n checks on rules to confirm" (096.5 DEC-7) needs the real
  result.
- `footprint_ratio`, `floor_area_max`, `green_ratio`: 002.3 (surfaces).
- `parking`, `other`: listed, `not_checked`.
- **The plan envelope** (US-04, plan only): the Site boundary inset by each
  confirmed setback on its edges, at the confirmed height as a label; drawn
  as a `derived` feature (096.5). Its Properties list rules applied, rules
  not applied (to confirm, not evaluable, not geometric) and assumptions
  (edge roles, the alignment).

A drawn prescription applies **where it is drawn**: a `typepsc` 39 polygon
covering half the plot limits the buildings whose projected outline
intersects it. That intersection is computed by the extension in the Site's
CRS (polygon–polygon test on small rings, plain JS) and said ("applies to
the part of the plot covered by the prescription").

## DEC-8 — Drawn overrides written, entered overrides nothing silently

§ 5.2: "A drawn value overrides a written 'see the graphic document'." In
phase 1 there are no written rules, so the case is drawn vs entered: both
are shown; neither hides the other; a check uses each confirmed one and
reports the stricter as its result, naming both. The user resolves a
contradiction with "Does not apply" on one.

---

# Steps

1. **The corpus** (DEC-1): record the prescriptions of ten more PLU(i)s,
   one dense-zone parcel each, as fixtures (read-only probe, by hand).
2. **The parser** and its table test.
3. **Keys** (DEC-2) and the section schema (DEC-3), with a pure
   `applySection(report, section)` that sets statuses and values.
4. **Version matching** (DEC-4), the "new version" overview and the "no
   longer in the plan" list.
5. **The actions** (DEC-5) through 096.3b and 096.4.
6. **The three entry actions** (DEC-6).
7. **Checks and the plan envelope** (DEC-7, DEC-8).
8. **Tests**, then the walk on Lyon AB0105: confirm « Hauteur Max-22 »,
   enter a 4 m rear setback, undo, redo, save, reload, reopen in a build
   without the extension and back.

# Acceptance criteria

1. « Hauteur Max-22 » / `txt` « 22 » parses to `height_total` 22 m,
   confidence `high`; every pair in the corpus table parses to its expected
   value or `not_evaluable` (table test).
2. A drawn rule enters `to_confirm`; a check on it carries its real result
   with the measured value and "rule to confirm"; the host's
   `isPotentialIssue` (or the stubbed equivalent) does not count it (test).
3. Confirm, Edit value, Does not apply, Reopen, each of the three Add
   actions, Edit, Remove and Forget each send **exactly one** `write`. Each
   passes `expected`. The report rebuilt from the resulting section shows the
   change (test with a stubbed 096.4 service recording writes).
   - A stub answering `false` makes the action `refused` with nothing
     written.
   - A stub that throws makes it `refused` with the reason (test).
4. Undo of a Confirm restores `to_confirm` with no extension state left
   behind (test: section in, report out, no closure state consulted).
5. A section confirmed against `datvalid` 20260326 read against 20261002
   reopens the rule with the old value and date shown, and the overview
   counts it (test).
6. Gordes: a rule confirmed under the 2024 `idurba` with the zone's 2022
   `datvalid` stays confirmed on re-read, and reopens if either changes
   (test).
7. An entered rule with page 132 links to the regulation with `#page=132`
   (test).
8. A section with `schema: 2` is shown read-only and never rewritten (test).
9. Saved, reloaded, opened in a build without the extension, saved, opened
   with it: the confirmations are intact (manual, 096.4's test proves the
   host side).
10. A prescription polygon covering half the plot limits only the building
    that intersects it (test).
11. "Add a ratio" with kind footprint and Statement "not regulated" writes
    an entered rule with `statement: 'not_regulated'` and no limit. The
    report carries a footprint rule with `statement: 'not_regulated'` and no
    `limit` (test).
12. `idurba` `200046977_PLUi_20260326` read against a confirmation stored as
    `…_PLUI_…` stays confirmed (test).
13. The same prescription parsed as `height_total`, then relabelled
    `height_facade`, keeps its key and its confirmation (test).
14. A read with `reason: 'site'` after a write, on an unchanged plot, makes
    no request (the injected `fetch` is not called); a new plot fetches
    (test).
15. A section holding entries of another plot applies none of them and
    lists them under "from another plot" with Forget (test).
16. "Add a distance or height" in a project set to feet: the stubbed host
    hands the action metres (the extension never converts) (test of the
    action builder's declared `unit: 'm'`).

# Testing strategy

- **Unit:** the parser against the corpus; keys; `applySection`; version
  matching; the actions' section builders (pure: section + action → next
  section). The Request is the only impure step, stubbed.
- **Manual:** the walk of step 8; 002.4's five plots.

# Risks

- **Prescription text is heterogeneous** across communes. The corpus is the
  guard; a low confidence and `not_evaluable` are the honest outcomes.
- **Height references** (ground, façade foot, natural ground before works)
  differ by PLU; the check names its reference instead of choosing one
  silently (DEC-7).
- **Keys that move** when IGN re-digitises a prescription: the rule
  reopens with its old value shown, the safe failure.
- **A form in a declarative renderer** pulls 096.3a–b toward a UI framework
  (the platform README's risk). Six fields is the ceiling asked here.

# Questions for the owner

> **Answered 2026-10-19:** the owner accepted the recommendation given for each question below (site-regulations README §5). Where a question had no recommendation, the README records the decision.

1. Should "Confirm" on a drawn rule require the user to open the
   regulation first (a two-step confirm), or is one click with the
   verbatim `libelle` shown enough? The proposal says one click.

# Definition of Done

The criteria walked against the code; the Design Contract boxes checked;
`node --test fr-urban-rules/tests/*.test.mjs` green; the walk of step 8 recorded.

---

# Dependencies on platform sprints

| Sprint             | What this sprint needs                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **096.2**          | Rule statuses `to_confirm`, `confirmed`, `not_applicable`, `not_evaluable`, `information`; provenance `coded` / `drawn` / `entered`; `confidence`, `conditions`, `exceptions`, `citation { document, page, article, passage }`; `statement: 'not_regulated'`. A check on a rule `to_confirm` carries its real result; the host never counts it (096.3a DEC-5, 096.5 DEC-7) |
| **096.3b**         | Actions on a rule row (Confirm, Edit value with a number field in `m` / `m2` / `percent`, converted by the host, Does not apply, Reopen, Forget with `target.subjectId`); three entry actions of six fields (kind, statement, value, source, page, note); a badge "n to confirm"; `opensView` for Review                                                                                                                  |
| **096.4**          | `SitePackageDataService.read()` / `write(data, label?, expected?) → boolean` (one Request, one undo step each; `false` only when stale; throws without `document` or past 256 Ki characters / depth 32); `onDidChange` (undo, redo, load); the section kept untouched without the extension; the section in the report's Site key (a write re-reads with `reason: 'site'`); file version 25 (096.4 DEC-6, folded) |
| **096.0b / 096.1** | Distances from the projected outline to named edges without `Δz` (`distances` with no ratio). The building's height: the projection answer's `height` (top and eaves above the lowest and the highest ground at the foot, the frame named; 096.0b DEC-5a, criterion 17), on the SDK through `measures.projection` (096.1 DEC-10, criterion 16)                                                                   |
| **096.5**          | The envelope and the prescription polygons drawn; the legend                                                                                                                                                                                                                                                                                                                                                     |

# Corrections to the proposal

1. **§ 8 `confirmations[] {ruleKey, idurba, datvalid, value, at, edited}`**
   lacks a decision field: "Does not apply" is a decision that must persist
   too (US-03). Added `decision` (DEC-3).
2. **§ 8 says which version to key to but not whose `datvalid`.** § 4.3's
   Gordes pitfall shows the document's and the zone's differ; the key is
   the document's `idurba` and the **feature's** `datvalid` (DEC-4).
3. **§ 5.3 "`confirmed` by construction for a mandatory coded rule"** leaves
   the optional coded rule (R.111-15) and a change of the coded text
   unaddressed: coded confirmations key to the Légifrance version date
   (DEC-3).
4. **§ 5.2 "a drawn value overrides a written 'see the graphic
   document'"** says nothing of drawn vs **entered**, the only case in phase
   1. Both are kept and the stricter governs, named (DEC-8).
5. **§ 4.5 "Setback lines (CNIG 15): geometry yes, distance usually no"**:
   such a line is not a numeric rule at all under R.111-16 ("a required
   setback line replaces the alignment"); under a PLU it is the line itself
   that limits. Phase 1 draws it and lists it `not_evaluable` unless a
   distance is parsed; its use as an implantation line is phase 2.
6. **A prescription applies where it is drawn**; § 5.2 reads as if a drawn
   number applied to the whole zone (DEC-7).

# Reconciliation (2026-10-19)

- Prerequisites: 096.3b (SDK 1.26, DEC-3 there) and 096.4 (3.20.0, SDK 1.27,
  `onDidChange`) named; the package declares 1.27.
- DEC-3: `edgeRoles` keyed by end points, not an edge id (ADR-0089 Rule 7).
- DEC-5: the actions are 096.3b DEC-3's shapes and write through
  `SitePackageDataService`; undo is heard through its `onDidChange`.
- DEC-6: the hand-entry form is six fields (kind, value, unit, source, page,
  note); edge role and ratio base fold into the kind, the zone is the
  read's.
- Dependencies: 096.2's `citation` and the `not_checked` mapping for a check
  on a rule to confirm; 096.3b DEC-3; 096.4's service, event and the file
  version (25 or 26, not "24 or 25"); 096.0b gives no building-height
  measure as such.
- DEC-7 and the 096.0b / 096.1 dependency row: `height_total` and
  `height_facade` read 096.0b's new per-building `height` (`topAboveGround`,
  `eavesAboveGround`, lowest ground by default, frame named) instead of
  composing it from a distance pair and `elevationAt`.

# Reconciliation (2026-10-19, phases 2–4)

- DEC-1: a drawn height (`typepsc` 39) is `height_total` by default; when the
  written rule says the drawn heights are façade heights (Lyon, article
  2.5.1.1), 002.6b DEC-5 relabels it `height_facade` and says so in the rule's
  conditions. Phase 1 has no written rule and keeps the default.

- DEC-7 (2026-10-20, 096.0b's review): `height.top` and `*AboveGround` are
  optional, and their absence is `not_checked`. A `datumDerived` height carries
  002.1a DEC-7's `datum-derived` assumption. `eaves` is the lowest covered
  run's.

# Review (2026-10-19)

- References only: Sprint 096.3 was split into 096.3a (Regulations Tree and
  Panel: the row, badges, views, blocks and `phraseText` / `limitText`) and
  096.3b (Regulation Actions: `runAction`, fields, the FR requests), which
  share SDK 1.26. Mentions now name the half they mean, or 096.3a–b. Old
  DEC numbers are mapped: 1–7 stay as 096.3a DEC-1–7; 8 is 096.3b DEC-1;
  9–12 are 096.3a DEC-8–11; 13 is 096.3b DEC-3.

# Review (2026-10-20)

An independent review checked this draft against the **implemented** SDK
1.27 (`regulations.ts`, `site.ts`, `site-package-data.ts`) and the Outcomes
of 096.0a–096.4. Changed:

- **DEC-6 — three entry actions with a Statement field (was BLOCKING).**
  - The forms: "Add a distance or height" (`m`), "Add a ratio" (`percent`)
    and "Add an area cap" (`m2`). Each has kind, statement (limit | not
    regulated), value, source, page and note.
  - **Why it was blocking:** nothing let a user record "not regulated",
    which 002.3 DEC-2, 002.4 P1 and 096.6 criterion 14 expect. "Does not
    apply" is `not_applicable` on an existing rule.
  - **Why three actions:** a number field's `unit` is fixed, so the old Unit
    choice would have blocked the host's feet ↔ metres conversion.
  - The review's recommendation was taken.
- **DEC-2 — the key drops the parsed kind.** It also uses the Site's CRS and
  a synchronous digest. Otherwise 002.6b's `height_total` → `height_facade`
  relabelling would orphan confirmations.
- **DEC-3 — the section's entries:**
  - each entry carries `plot` (parcel ids); entries from another plot are
    not applied, and are listed with Forget (the section is per project and
    never cleared, ADR-0112 Rule 9);
  - entered rules carry `statement`;
  - private shapes are mapped to the SDK's `comparison` / `quantity` and its
    `m2` / `percent` units;
  - 096.4's limits are stated.
- **DEC-4 — `idurba` is compared case-insensitively** (`PLUi` / `PLUI`, 002.0).
  Forget targets `subjectId` from a `table`, never a rule.
- **DEC-5 — the write, and the read after it:**
  - `write(data, label, expected)`, `false` → `refused`, a throw → `refused`,
    `done` without a report;
  - **the read after a write is `reason: 'site'`** (the section is in the
    host's Site key), so GPU answers are cached by plot and a section-only
    change makes no request;
  - the "Confirm" label no longer embeds the value.
- **DEC-7 — checks:**
  - setbacks measure the `storeys` outline;
  - without a boundary, or with a refused outline, the check is
    `not_checked`;
  - **checks on `to_confirm` rules carry their real result** (the host
    excludes them from counts, 096.3a DEC-5, and 096.5's "checks on rules to
    confirm" needs it). The Design Contract box and the 096.2 dependency row
    were corrected to match.
- DEC-1: a `green_ratio` coefficient becomes a percentage.
- Criteria 2 and 3 restated; criteria 11–16 added (not regulated,
  case-insensitive `idurba`, key stable across a relabel, no fetch on a
  `site` read with the same plot, another plot's entries, units).
