# Sprint 002.22 — Candidate Rules Decided Automatically

> **Status:** Landed in the working tree (2026-11-03), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.18.0**, `sdkVersion` **"1.40"** unchanged; the service is untouched.
>
> **Milestone:** [Site Buildable Area](../../../archisimple/docs/milestones/site-buildable-area/README.md), Phase B — the owner's
> request after reading Marseille zone UD (2026-11-03): « more than 90 rules to validate … some of them could be confirmed or ruled
> out automatically », answered « ruled out, visible, reversible ».
>
> **Platform half:** none. The Rules view uses the `section` and `rules` blocks of SDK 1.38 and the host's own move of an action into
> its rule's card.

## Goal

A zone chapter read by a model gives candidates for every sector, commune and cross-reference of the règlement. The plugin knows the
plot's zone and its commune; for a candidate that is about something else, deciding that **with certainty** needs no one. The decision
is shown, reasoned, and reversible — and **it is never a confirmation**: only a person's confirmation makes a rule confirmed.

## Out of scope (later sprints)

- The extraction's progress in the AI panel; the project-nature questions (industry, restaurant, floor area under 500 m²); rules decided
  by project facts.
- Ruling out a sector rule for a plot labelled with the zone alone (`UD`): its sectors could be anyone's (see Outcome).

## Decisions

- **DEC-1 — What is decided, and how.** A candidate still `to_confirm`, with no decision of the user's on this plot, is decided when:
  (a) **sector** — its sector and the plot's zone are both codes (two to four capitals, a letter or digit or two: `UDa1`) and **neither
  begins the other** (`UDa2`, `UDb` against `UDa1`; `UDa`, `UD` against `UDa1` overlap and are kept; a word the model put in the sector
  decides nothing) → **ruled out** (`not_applicable`); (b) **commune** — a condition states « pour les communes de : A, B et C » or « pour
  la commune de X » and the plot's commune is **in none of the lists the candidate states and is named nowhere in its passage** (a list
  cut by a length limit decides nothing) → **ruled out**; (c) **cross-reference** — a described `other` of 600 characters or less whose
  words are « se reporter à l'article », « voir l'article » and that writes no number with a unit → **for information**; (d)
  **not regulated** → **for information**. When in doubt the candidate stays `to_confirm`.
- **DEC-2 — Never confirmed.** The two statuses are `not_applicable` and `information`. Neither feeds a check, a setback or a ceiling, and
  the buildable area does not list them among « the rules it did not apply » (they are in the Rules view). A decision the user took (a
  stored confirmation, « Does not apply ») **stands over** the automatic one.
- **DEC-3 — Visible, with the reason.** The rule keeps its card with one more condition line saying why (« Secteur UDb — votre parcelle est
  en UDa1 », « Énoncée pour d'autres communes — votre parcelle est à MARSEILLE », « Renvoie à un autre article du règlement : rien à confirmer
  ici », « Le règlement indique que cette matière n'est pas réglementée »). In the Rules view the cards are **folded** in a
  `section` « Décidées automatiquement (31) » with a summary (« 24 concernent autre chose · 2 pour information »), an explanation, the
  cards and, on each, **« Rétablir »**; a notice above says how many were decided and how many are left. A view with nothing decided is
  what it was.
- **DEC-4 — Bring back.** `bring-back` writes one entry per rule and plot in the section's `broughtBack` (`{ ruleKey, plot, idurba,
datvalid, at }`, one undo entry, validated like the section's other members: a malformed one makes the section read-only). The rule is
  then `to_confirm` as if nothing had been decided. The decision is **derived**, not stored: a new version of the document asks every
  question again — an entry made against another version no longer brings anything back — so it follows the document like every other
  choice.
- **DEC-5 — The same text for several sectors is one card.** Candidates of one occurrence of the text (same page, passage, limit, strip,
  conditions, exceptions) read for several sectors are folded into one card that says « Le même texte est lu pour les secteurs : UDa1, UDa2 »;
  those of another sector fold together into one ruled-out card. The result is unchanged (the data keeps every item). A candidate with a
  decision stored stands for the others of its text, in whatever order they come. Two occurrences of one sentence on two pages stay two
  rules (`~2`).
- **DEC-6 — What is left comes in an order.** When something is folded, the rules still to decide are listed with what shapes the area
  first — entered rules, then strips, setbacks, distances and heights, then ratios and areas, then everything else.

## Acceptance criteria

`fr-urban-rules/tests/triage.test.mjs`; the recorded suites still pass.

1. The sector rule on a table of codes; the commune rule on lists (accents, hyphens, a name broken over a line, singular, cut lists, no
   commune known); a reference with a number is not a reference; « not regulated » is for information.
2. On the real Marseille UD result, the counts for UDa1, UDb and a zone with no sector (Outcome).
3. In the reader: ruled out is `not_applicable`, a reference `information`, none confirmed, each with its reason as the last condition.
4. The Rules view: the open list in order, the folded section with its title, summary and « Bring back » on each card, the top-level
   actions free of the folded ones; with nothing decided, one `rules` block as before.
5. « Bring back » writes one entry and one undo label, validated, to_confirm afterwards; an entry of another version brings nothing back.
6. A stored confirmation stands over the automatic decision.
7. The same text for several sectors is one card and one ruled-out card; the card decided before stands for the group.
8. The buildable area's list of rules not applied does not hold them.

## Outcome

- **Built.** Extension tests 11 new in `triage.test.mjs`; the Lyon test that counted 30 written rules now counts 14 (the parking text read
  for 5, 4 and 10 sectors is one card each, 32 read).
- **Counts on the real règlement** (Marseille PLUi zone UD, 98 rules read by `gpt-6.1-terra`, commune Marseille):

  | Plot                    | Read | Listed (same text folded) |                            Decided automatically | **Left to decide** |
  | ----------------------- | ---: | ------------------------: | -----------------------------------------------: | -----------------: |
  | zone **UDa1**           |   98 |                        82 | 26 (24 other sector or commune, 2 not regulated) |             **56** |
  | zone **UDb**            |   98 |                        81 |                                               28 |             **53** |
  | zone **UD** (no sector) |   98 |                        71 |                                                5 |             **66** |

  The owner's 94 (prompt 2, 105 read the next day) were all listed: every sector-tagged candidate carries `sectorUnplaced` (the chapter
  has no sector headings the model's codes match), which the earlier filter kept whatever its sector.

- **Deviations / limits.** (1) A plot labelled `UD` alone keeps the sector rules (UDa, UDb…): its sectors could be anyone's, and « when in
  doubt, leave it ». If a plot's GPU zone is the bare `UD` while the règlement's sectors are drawn as their own zones, more of them could be
  ruled out; that needs the owner's word, not a guess. (2) The fence-height rules of other communes are ruled out only when the commune
  is known (the planning read has it). (3) Cross-references are rare in the extraction of prompt 3 (4 in the earlier run, 0 now).
- **Browser pass** (the real 0.18.0 package built from this checkout, installed in the editor from a scratch index; a scratch gateway 0.5.0
  with its own data dir, `gpt-6.1-terra` reading Lyon's UCe1 chapter at prompt 3: 168 rules, 9 chunks, none failed). On « Regulations – Lyon »
  (zone UCe1b, commune LYON): **« Décidées automatiquement (8) »** folded under the rules still to decide, opened to its explanation and cards
  (« Non réglementé · Information » with « Rétablir »); « Rétablir » moved one rule back (8 → 7, 147 → 148 to confirm); the list opens
  with the setback and the strip (what shapes the area first). Two synthetic candidates (5 m setback; 2 m strip within 5 m, `permits`) added
  to that cache: the strip card reads « Hauteur limitée à une bande de 5 m le long des limites latérales et de fond » and « le recul y est
  levé », « Confirmer 5 m » then « Confirmer 2 m » leave **1183.3 m², 100 % of the Site boundary**, with the 2 m height limit listed. No page
  error. On Lyon the real counts are small: 170 read, 163 listed, 12 decided (4 other sector, 4 not regulated, 4 reference).
- **Unverified.** The folded view in the owner's editor on Marseille (the browser pass used Lyon, where little is folded); the host's rendering of a `section`
  that holds a `rules` block and its actions on a very long list (the section keeps 200 actions at most).
