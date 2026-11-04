# Sprint 002.25 — Rules Decided By The Project

> **Status:** Landed in the working tree (2026-11-04), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules` **0.20.0** (with 002.24); SDK 1.41 and the service 0.6.0 unchanged.
>
> **Milestone:** the PLU-extraction work — owner decisions Q3–Q5 of 2026-11-04: an answer decides like the other automatic
> decisions (002.22), only a person's confirmation confirms, answers survive a document update.
>
> **Previous Sprint:** [002.24 The Nature Of The Project](sprint-002.24-project-nature-questions.md).

## Goal

The answers about the project narrow the rules: a rule that cannot concern the project is folded with its reason, a rule they settle
says so, a rule they cannot settle says what is missing — and the answers can be changed without the AI panel.

## Out of scope

- A free-text answer; reading a use from the model's own classification.
- Anything platform: the Rules view's vocabulary (sections, headings, rules, actions with fields) carries it.

## Decisions

1. **Positively excluded, or left alone** (`projectCheck`). A candidate is `excluded` only when an answer says it is about something
   else: a use the project is not (`other` excludes nothing), an extension when the project is new or an annex, a floor-area threshold
   the answer settles (an exact area always; a bucket never across its edge, `sdpHolds`), a classified installation when it is not
   one. It is `applies` when the answers settle that it concerns the project, `needs` when an answer that would settle it is missing,
   and none of these for a candidate with no scope. A condition the parser cannot read gives no scope, so no exclusion.
2. **Like the 002.22 decisions.** An excluded candidate is `not_applicable` with its reason in its conditions, listed in the
   « Décidées automatiquement » section under « Votre projet (n) » (the others under « Autre secteur », « Autres communes », « À titre
   d'information »), with « Rétablir » on each card. **Never confirmed**: only a person's confirmation does that, and a stored
   confirmation stands over the answer. A decision by another cause (sector, commune, reference, not regulated) comes first.
3. **Bring back** keeps a rule despite the answers: the same `broughtBack` entry, against the document's version; a new version asks
   again, and the answers stay.
4. **Answers survive a document update** (Q5). They are recomputed on each reading's candidates; nothing about a document is stored with
   them except the `askedFor` list, so the next version's candidates are decided by the same answers and the brought-back entries
   expire with the version.
5. **The card's lines.** An open rule the answers settle carries « Applies: … » (the use, the extension, « the rule is for floors under
   500 m², and your project is 320 m² »); one they cannot settle carries « … Give your floor area in « Project nature » ». The strings
   name the comparison in words (`project.cmp.*`) so they stay in the print font's WinAnsi.
6. **The Rules view's « Nature du projet » section** shows the answers, « Your answers decide n of the m open rules » and one action,
   « Change project nature », whose form holds works, use, floor area (m²) and, where a rule needs it, the classified installation.
   It writes the same member, undoable (`set-project-nature`, « Planning rules: project nature »). « Not decided » and an empty area
   are no answer; a bucket chosen on the card stays unless a number is typed.
7. **The counts** are the view's own: « Decided automatically » includes the project's, the notice and the summary name them, and the
   reading card's Done state shows « Decided by your project » when there are any.

## Acceptance criteria

1. With nothing answered the rules are what they were (Marseille UDa1: 56 left, UDb: 53, UD: 66) and each scoped one says what it needs.
2. With answers, the candidates they positively exclude are folded under « Your project », none confirmed; a settled one says it applies.
3. Bring back keeps a rule; a stored confirmation stands; a new version reopens a bring-back and the answers decide again.
4. The form writes the answers undoably; a section of a shape not recognised refuses it.

## Outcome

- **On Marseille's zone UD** (the real result, 98 rules read, 82 listed after folding, 26 decided automatically before):

| Scenario                            | Decided by the project | Left to decide |
| ----------------------------------- | ---------------------: | -------------: |
| UDa1, nothing answered              |                      0 |             56 |
| UDa1, housing, new building, 320 m² |                     19 |             37 |
| UDa1, a restaurant, an extension    |                     13 |             43 |
| UDb, a workshop (industry)          |                     15 |   38 (from 53) |
| UDb, nothing answered               |                      0 |             53 |

Housing on UDa1 excludes the industry, wholesale and forestry rows, the restaurant, shop and warehouse rules, the extension rules,
the « ≥ 500 m² » setback and the parking rows of hotels, offices and accommodation, and says « Applies » on the « < 500 m² » setback and
the housing parking rows.

- **Browser pass** (Lyon UCe1b, the real package): « Project nature » shows « New building », « Your answers decide 2 of the 112 open
  rules », « Decided automatically (6) » opens on « For information (4) » and « Your project (2) » — the two « extension d'une construction
  existante » rules, « Does not apply » — each with « Bring back »; the form opens with the works, use and floor-area fields and Apply/Cancel.

### Deviations

- **The panel's form is a form, not inline controls.** The mockup (C1) showed a segmented control and a select in the section itself;
  the Rules view's vocabulary has rows and actions with fields, so the section lists the answers and « Change project nature » opens the form.
- **« Give your floor area » is words, not a link.** A condition line has no inline button; it names the section.
- **Annex and pool rules are never excluded by works** (decision 5 of 002.24), so the « Annex or swimming pool » answer excludes extension
  rules only.

### Not verified

- A Marseille plot in the owner's editor: the browser pass ran on Lyon, whose candidates name few uses; Marseille is in tests on its real result.
- The dark theme in a browser; a document update on a live service (covered by a test that changes the candidates).

## Post-sprint documentation

- [x] Plugin CHANGELOG, README; the milestone row.
