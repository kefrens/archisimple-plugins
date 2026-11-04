# Sprint 002.26 — What Is Left To Decide, Grouped

> **Status:** Landed in the working tree (2026-11-04), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.21.0**; SDK 1.41, the companion service 0.6.0 and the platform unchanged.
>
> **Milestone:** the PLU-extraction work — the owner's question after 002.25 (« on the left to decide, is there any quick wins? … exclude some;
> auto approve some? »). Decisions of 2026-11-04: fold what is mechanically the same rule; list apart what a person confirms together; **no
> automatic confirmation** (002.22's rule stands: only a person's click confirms).
>
> **Previous Sprint:** [002.25 Rules Decided By The Project](sprint-002.25-rules-decided-by-the-project.md).

## Goal

The 56 rules left on a Marseille UDa1 plot are not 56 decisions: some are one sentence read twice, some are a bullet of another rule, some
apply without shaping the area, and a few can be checked against their own text. Fold the first three kinds the way 002.22 folds the others,
list the last two apart with one click that confirms them together, and say honestly what is left for a person to read.

## Out of scope

- **Confirming anything on the user's behalf.** A group has a button; nothing is stored before it is pressed.
- **Deciding the rules that depend on the graphic règlement** (footprint, graphic height, the height along a gabarit line): see decision 7.
- **Near-duplicates** (two readings that differ by a word): only the same sentence folds.
- Anything platform: the Rules view's vocabulary (sections, notices, rules, actions) carries the groups.

## Decisions

1. **The same rule read twice** (`foldedSectors`, second pass). 002.22's fold needs the same page, kind, limit, passage _and conditions_, so it
   missed three real cases on UDa1: the passage carried a list marker (« [a] » against « [b] »), a PDF punctuated the same list with « ; » on one
   page and « , » on the next, and one reading held a heading condition (« Dans la zone UD ») the other did not. `sentenceOf` compares the passage
   without its marker, accents, case and punctuation (a decimal comma stays), and only the conditions the passage itself contains count; a heading
   decides nothing. The floor-area and use scope must be equal. A sentence folds across sectors only where **both cover the plot's zone** (no
   sector, or one the zone begins with): for a plot labelled « UD » alone, « UDa » and « UDa2 » stay two rules.
2. **A bullet of another rule.** A passage beginning « et » or « ou » with at most one condition is the rest of a sentence. It folds into the
   nearest candidate before it that is not a bullet and introduces a list (« à condition »), on the same page or the page before — else it stays.
   This matters beyond tidiness: « et que la hauteur totale de l'extension soit inférieure ou égale à 4 mètres » was read as a 4 m height limit,
   which, confirmed, would have capped the whole building.
3. **Implied by a stricter rule.** An unconditional, exception-free `limit` of the same kind, page, comparison and measure as another whose
   sector contains its own and contains the plot's zone, with a smaller maximum or a larger minimum (the UD « at least 20 % » green ratio under
   the UDa/UDa1/UDb « at least 30 % »). A table row writes its sector first (« UDa, UDa1 et UDb Au moins 30 % »), which places it. The relaxing
   direction (a larger maximum in the more specific sector) folds nothing.
4. **How they are shown.** A fold is a decision like 002.22's: `not_applicable` with its reason in the card's conditions (« The same sentence as a
   rule listed from page n », « A bullet of the exception on page n », « Implied by a stricter rule on the same measure »), listed in « Décidées
   automatiquement » under « Même texte lu deux fois, ou partie d'une autre règle (n) », with « Rétablir »; **never confirmed**. Another cause
   (sector, commune, reference, not regulated, the project) comes first, a decision the user took stands and its sentence is the one that stands.
5. **« S'applique au projet, sans effet sur l'aire »** (`noDrawingOf`). Every `parking` candidate, and the `other` ones whose passage speaks of a
   connection, the networks, rainwater, retention, a leak rate or sealed surfaces and of no distance, height or footprint. Unsure is not grouped.
   Parking and the green ratio remain budgets checked against a drawn design, so these are rules to **confirm**, not rules ruled out: the group
   only lists them apart (collapsed) and offers « Confirmer ces n règles ». The green ratio stays in the main list.
6. **« Lectures vérifiées »** (`checkedReadingOf`). A `limit` with a figure (a value or a percentage) the passage writes in that unit, read with
   high confidence, its sector placed, no exception, no strip, and **every condition one this reads**: a heading naming the plot's zone, the scale
   of the plot (« à l'échelle du terrain d'assiette »), a quoted use, an extension, a floor-area threshold the zone is concerned by. A subject that
   narrows the rule (« Le bassin de piscine non couvert »), « lorsqu'elle existe », « le long des linéaires de gabarit », a case (« configuration
   en drapeau ») is not read, so the rule stays for a person — confirmed as a general setback, a pool's 2 m would be wrong. A rule the project's
   answers still need (a threshold, a use) is not listed until they say it applies.
7. **The graphic rules stay manual.** The plugin reads the drawn prescriptions of the plot (types 38 footprint and 39 height among them), but
   the GPU's silence is not the règlement's: it has no type for a « linéaire de gabarit », and the rule itself tells the user to enter a value
   when none is found (`written.seeGraphicNone`). Deciding « it does not apply » from absence would invent a data source.
8. **One click confirms a group, exactly as listed.** `confirm-batch`: the subject carries the group's name, the document version and a digest of
   the rule keys the view listed; the session remembers which rules each group held, and the click confirms those, with the entry a single
   « Confirm » writes (`writtenEntryOf`, shared). A list that changed since is « read again », another version is refused, an unknown group is
   refused; nothing is written. **One write, one undo step** (« Planning rules: confirm several rules »); each rule can still be reopened.
9. **The counts.** « Left to decide » is what the main list holds that no one has decided (a rule the user confirmed or set aside is not left —
   it was counted before, and a group's confirmation made the figure jump). The groups have their own notice and the reading card a stat,
   « À confirmer ensemble ».

## Acceptance criteria

1. On Marseille's zone UD: UDa1 folds 7 (3 the same sentence, 3 bullets, 1 implied), UDb 2, UD 1 (and none across UDa and UDa2); 15 rules are
   grouped as applying without shaping the area, 1 reading is checked.
2. A fold is ruled out with its reason and « Rétablir », never confirmed; a stored decision stands and its sentence is the one that stands.
3. A group's click writes one undoable entry per rule, identical to a single confirmation; a stale or foreign click writes nothing.
4. A rule with a condition this does not read is never in « Lectures vérifiées ».
5. With nothing to fold or group the view is what it was.

## Outcome

- **On Marseille's zone UD** (the real result, 98 rules read), what is left for a person to read, nothing answered and then with answers
  (« applies » and « checked » are listed apart, still to confirm by one click):

| Scenario                   | 002.25 left | Folded | Project | Applies (apart) | Checked (apart) | **Left** |
| -------------------------- | ----------: | -----: | ------: | --------------: | --------------: | -------: |
| UDa1, nothing answered     |          56 |      7 |       0 |              15 |               1 |   **33** |
| UDb, nothing answered      |          53 |      2 |       0 |              15 |               1 |   **35** |
| UD, nothing answered       |          66 |      1 |       0 |              15 |               1 |   **49** |
| UDa1, housing, new, 320 m² |          37 |      7 |      17 |              11 |               1 |   **20** |
| UDa1, restaurant extension |          43 |      7 |      13 |              10 |               1 |   **25** |
| UDb, a workshop            |          38 |      2 |      14 |               9 |               1 |   **27** |

Housing's « decided by the project » is 17 (was 19): two of the rules it excludes (the restaurant sentence and the pool distance) are now folded
first as the same sentence read twice. The 15 are seven parking rows and eight rules about connections and rainwater.

- **Lyon UCe1b in the browser** (the real 0.21.0 package from a local index, a scratch gateway on the real cached reading of 125 rules, five
  clearly synthetic rules added to the scratch copy of the cache for the folds and the checked group): « Applies to the project, no effect on
  the area (11) » is collapsed with « 11 to confirm together »; opened, it lists the 11 (rainwater, parking) and « Confirm these 11 rules »;
  pressing it took « 94 to confirm » to 83 in one step; « Readings I checked (1) » holds the synthetic 4 m setback and « Confirm the reading I
  checked »; « Same text read twice, or part of another rule (2) » holds the `[b]` sentence and the bullet, « Does not apply », with « Bring back »;
  one Ctrl+Z undid the last batch as one step. No page error.

### Deviations

- **The group is named « no effect on the area »**, not « no drawing effect »: parking and the connections do not shape the buildable area, but
  parking is a budget checked against a drawn design, so « drawing » would say more than is true.
- **« Lectures vérifiées » is small on a real règlement** (one rule on Marseille, none on Lyon): the readings that survive « every condition is
  read » are few, because most limits carry a subject or a case. It grows as the answers settle the conditions.
- **Near-duplicates are not folded** (« à l'échelle du terrain » against « à l'échelle terrain »: two readings of one rule, one word apart);
  a one-word difference can be a negation.
- **The synthetic rules** of the browser pass live in the scratch copy of the gateway's cache only, never in the owner's.

### Not verified

- A Marseille plot in the owner's editor; the browser pass ran on Lyon, whose reading has no fold and no checked group of its own.
- The dark theme in a browser; French wording on screen (the keys are tested for parity, the plural forms are ICU as elsewhere).
- Whether the host collapses a nested section by default on every client: it did in the browser pass.
- « Open rules » in the project-nature section's line (`decides n of the m open rules`) still counts a confirmed rule among the open ones, as in 002.25.

## Post-sprint documentation

- [x] Plugin CHANGELOG, README; the milestone row.
