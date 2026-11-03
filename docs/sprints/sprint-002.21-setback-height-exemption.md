# Sprint 002.21 — A Height Held To A Strip Reads From The Règlement

> **Status:** Landed in the working tree (2026-11-03), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.18.0**, `fr-urban-rules-service` **0.5.0** (`PROMPT_VERSION` 3,
> `SCHEMA_VERSION` 1 unchanged), `sdkVersion` **"1.40"** unchanged.
>
> **Milestone:** [Site Buildable Area](../../../archisimple/docs/milestones/site-buildable-area/README.md), Phase B — and the
> owner's request after importing Marseille zone UD (2026-11-03): « a construction under 2 meters is allowed within 5 meters of the
> property boundary; this is not well taken ».
>
> **Platform half:** none. A `height` ceiling with `within` rings is SDK 1.29; the band is 002.18's.

## Goal

A règlement that sets a setback and lets lower constructions stand within it (« retrait de 5 m, sauf pour les constructions de moins de
2 m de haut ») was read as an unconditional setback: the buildable area treated the whole strip as forbidden, and a height limit that
holds only in that strip, once confirmed, would have capped the whole building. The fix is the strip as a **structured, verified field
of the extraction**, drawn by the 002.18 band path that already existed for hand-entered rules.

## Out of scope

- A strip that does not start at the limit (« entre 4 et 8 mètres »): the model returns no strip for it and the height stays a statement
  in words.
- A check of a building against a strip. A band is not a verdict, and no check reads it (002.18).
- Conditions on the project (« surface de plancher inférieure à 500 m² ») — the project-nature questions, a later sprint.

## What the real text showed

Marseille PLUi, zone UD, article UD4.2 (pages 174–175; `test-fixtures/fr-urban-rules/marseille-ud`):

- **The 4 m setback** (« retrait minimum de 4 mètres des limites séparatives », UDa, UDa1, UDa2) and, in the next paragraph, **the
  alternative rule**: « Les nouvelles constructions … peuvent s'implanter, en tout ou partie, dans une bande de 0 à 4 mètres à compter de
  la limite séparative, à condition que leur hauteur totale n'excède pas 4 mètres, et leur hauteur de façade n'excède pas 3,5 mètres ».
  Two sentences, so two candidates: the strip is not an attribute of the setback but of the **height** the second sentence states.
- **The window.** Before this sprint the exceptions and conditions the model quotes were looked for before the passage only; a règlement
  writes its alternative rules **after** the rule (« Règle alternative à l'article UD4.2 [a] »). The run of 2026-11-03 lost **24**
  conditions this way (the 4 m setback read as unconditional); with the window past the passage **6** remain, all legitimately dropped
  (the « surface de plancher ≥ 500 m² » condition attributed by the model to a swimming-pool rule of another paragraph).

## Decisions

- **DEC-1 — The strip is a field of a height item.** `ITEM_SCHEMA` gains `strip: null | { depthMetres, edges, permits }`, required
  (the schema is the strict-structured-output shape), `null` for every rule that is not a height held to a strip. `depthMetres` is the
  strip's width from the limit as the text writes it (4 for « de 0 à 4 mètres »), `edges` is `all | street | side | rear | side_rear`
  (the 002.18 band choices), `permits` says whether the text lets a construction stand in the strip on condition of that height — a
  derogation from a setback — or only limits the height there. A sentence that sets a setback and lets lower constructions stand within
  it is **two items**, as « hauteur totale » and « hauteur de façade » in one sentence already were: the setback, and the height with
  its strip.
- **DEC-2 — Verified like a limit's value.** A strip is kept only on a `height_total` or `height_facade` that is a `limit` with a `value`
  in metres, with a depth of 0.1 to 50 m **that the passage writes** (the numbers test of 002.5b), a known `edges` and a boolean
  `permits`. Anything else leaves the item a **statement in words** (`described`, no limit, `low`), counted in
  `dropped.stripNotInPassage` — never a plain height. A rule without a strip carries no `strip` key, so every result read before reads
  as before.
- **DEC-3 — The versions.** `PROMPT_VERSION` 2 → 3: the cache key changes, so a chapter is read again with the new instructions (the
  results of prompt 2 stay readable and « Extract again » is offered, as for any older prompt — `extractAgainOffered`). `SCHEMA_VERSION`
  stays 1: the field is optional for every reader, so the 2 GiB of cached results are **not** emptied (milestone Q10's cost did not
  apply: the cost is the re-reading, not a loss). Service **0.5.0**.
- **DEC-4 — The window past the passage.** `CONDITION_WINDOW_AFTER` = 600 characters: a condition or exception is verbatim in the
  chapter between the sector heading (or 1 500 characters) before the passage and 600 after it. Lyon's recorded result is unchanged.
- **DEC-5 — A strip is a band, and confirming it is the existing path.** The extension reads the service's strip as `{ depth, edges (a
band choice), permits }`. The candidate is an **`other`** rule (as an entered band's is: the checks, the capacity and the headroom read
  `height_total` and would take 2 m for the building's maximum), labelled « Hauteur totale dans une bande le long des limites » /
  « Hauteur de façade dans une bande… », and says in its conditions « Hauteur limitée à une bande de 5 m le long des limites latérales
  et de fond » (the entered band's sentence) and, when `permits`, « Une construction peut s'implanter dans la bande si elle respecte
  cette hauteur : le recul y est levé ». It is confirmed with its value (« Confirmer 2 m »). The confirmation stores `strip` (`{ depth,
edges, permits, of }`), so a confirmed strip stands on the section alone like any confirmed written rule; a stored strip that differs
  from the one read now reopens the rule.
- **DEC-6 — Drawn.** A confirmed `height_total` strip is a `height` ceiling `within` the strip along the edges of its roles (002.18
  DEC-2): the volume steps — height-limited in the strip, nothing over the rest. A confirmed **façade** strip draws nothing (a façade
  height is no ceiling, 002.7) and says why.
- **DEC-7 — The strip that permits lifts the setback it covers.** After the rules are read, a confirmed strip with `permits` removes from
  the setbacks (`contributions`) every confirmed setback whose roles the strip runs along and whose distance it covers
  (distance ≤ depth): the strip is a height-limited place, not a forbidden one, so the area keeps it and the ceiling lowers it. The
  lifted setback is listed with its reason (« remplacé par la bande le long des limites : 2 m de haut sur 5 m ») and an assumption says
  so. A setback **deeper** than the strip, on edges the strip does not run along, or a strip that does not permit, lifts nothing.
- **DEC-8 — Never silently plain.** (a) A height whose passage or conditions say « dans une bande de N mètres » (« sur une profondeur
  de », « dans les N premiers mètres », « à moins de N m des limites ») but that was **read without a strip** — a result of prompt 2, a
  model that missed it — is shown as a statement in words (« described ») with « Cette hauteur ne vaut que dans une bande… relisez le
  règlement », and a height confirmed for the whole building against that text is **asked again** (`stripReopened`). (b) A confirmed
  setback that carries an exception the plan cannot draw (an `exceptions` text, as the extensions of existing buildings in UD) is cut in
  full and the area **says it is stricter than the règlement** (`envelope-setback-exceptions`).

## Acceptance criteria

`services/fr-urban-rules-service/tests/strip.test.mjs` and `fr-urban-rules/tests/written-strip.test.mjs` (real Marseille UD text and
answers in `test-fixtures/fr-urban-rules/marseille-ud`).

1. The schema requires `strip`, with the five edges; `PROMPT_VERSION` is 3 and `SCHEMA_VERSION` 1.
2. The owner's sentence — a 5 m setback and 2 m constructions allowed within it, written as a règlement would — is a setback and a
   height with a strip of 5 m, `side_rear`, `permits`.
3. A strip whose depth the passage does not write, with an unknown edges word, on a setback or a ratio, or under 10 cm leaves a statement
   in words, counted.
4. An exception written after the rule is kept (600 characters), one far past it is not.
5. On Marseille UD (the model's own answers): the 0–4 m strip is a 4 m total and a 3.5 m façade height with a 4 m `side_rear` strip that
   permits; the 4 m setback carries the alternative rule as its exception.
6. In the reader: the candidate is an `other` rule in words, confirmed with its value; confirming the 5 m setback and the 2 m strip
   leaves the area at 600 m² (the whole plot) with a 2 m ceiling within the strip, the setback listed as replaced; without `permits`, or
   with an 8 m setback, the setback is cut as before.
7. The confirmation stores the strip and the pair stands on the section alone.
8. A height written « dans une bande de 0 à 4 mètres » read without a strip stays in words; a plain confirmation of it is asked again; a
   setback with an exception no number states is cut in full and said stricter.

## Outcome

- **Built.** Service 195 tests (6 new; 2 skipped), extension 530 (9 new in `written-strip.test.mjs`, 11 in 002.22; 2 skipped). The Lyon recording and its replay are unchanged by the window
  and the new field.
- **Real model.** One extraction of Marseille UD with `gpt-6.1-terra` (OpenAI) before and after: the strip came back as
  `{ 4, side_rear, permits }` on the 4 m total and the 3.5 m façade heights of UDa, UDa1, UDa2 and on the extension rule of the
  general case (`depthMetres` written in each passage; 0 rejected), 4 → 1 dropped conditions per run (24 → 6 → 1), and the 4 m setback
  of UDa, UDa1 and UDa2 now carries the alternative rule (the strip) as an exception, UDb's the extensions' one.
- **The owner's sentence is not in the cached chapters.** « Under 2 m within 5 m » is **not** in the cached zone UD or UF chapters (UD
  has the 4 m / 4 m form above). The 2 m / 5 m case is tested on a synthetic sentence written as a règlement writes it; the owner's real
  zone and article are not known.
- **Deviations.** (1) The strip qualifies the height item, not the setback item: the règlement says it in a second sentence, and one
  model call per rule is the convention (« one item per rule and per sector »). (2) 002.18's « reading a band from the règlement waits
  for the AI revamp » (milestone Q10) is done here at the owner's request; the cost it feared (every cached extraction lost) does not
  apply because `SCHEMA_VERSION` did not move.
- **Unverified.** The strip's volume and plan in the owner's editor on a real UD plot; a plot whose strip does not start at the limit;
  the model's reading of strips on other PLUs (one chapter read).
