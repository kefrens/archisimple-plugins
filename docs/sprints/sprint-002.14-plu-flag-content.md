# Sprint 002.14 — PLU Flag Content

> **Status:** **Implemented (2026-10-22, uncommitted).** `fr-urban-rules` **0.12.0**, `sdkVersion`
> **1.37**, with the platform's 096.25. Written from the
> owner's round-2 look (the Risks view) and his answer to Q1 (SDK addition for
> flags: yes), and a reading of `fr-urban-rules/src/index.js` at the 0.11.0
> tree.
>
> **Repository:** `archisimple-plugins`, the `fr-urban-rules` extension only.
>
> **Milestone:** [fr-urban-rules](../milestones/fr-urban-rules/fr-urban-rules.md)
> § 12, Phase 5 (PLU panel UX), round 2. Platform README § 12.4.
>
> **Prerequisites:**
>
> - **Platform:** Sprint 096.25 (SDK 1.37: a flag's `icon`, `group`, `title`,
>   `code`, `level`). The package declares `sdkVersion` **"1.37"**; a web image
>   without 096.25 refuses it. A lockstep release.
> - **Plugins:** 002.13 closed (0.11.0).
>
> **Version:** `fr-urban-rules` **0.11.0 → 0.12.0**. 002.10 (Regulation Watch,
> on hold) moves up again, to **0.14.0** (see its header): this sprint takes
> 0.12.0 and 002.15 takes 0.13.0.
>
> **Sizes:** presentation fields on every flag the package sends, the keys for
> them in two locales, a test over the five recorded reads. Small.

---

# Sprint Design Contract

- [x] **The package sends vocabulary and facts, never presentation.** An icon,
      a group and a level are the SDK's closed words and numbers.
- [x] **Nothing read changes.** Each flag's `id`, `kind`, `label`, `detail` and
      `citation` are byte-identical to 0.11.0's on the five recorded reads
      (002.12's digest test, now excluding exactly the five new fields).
- [x] **No fact is invented.** A code is the source's own `suptype`; a title is
      a shortening of the existing label by the easement's category, where the
      SUP nomenclature names it; a level is the Géorisques value the flag
      already states; a qualifier is the official word for that value.
- [x] **The host is never asked to know a flag.** The package maps its kinds to
      the SDK's words; the host reads the words.
- [x] **Both locales have every new key**; the key audit (`package.test.mjs`)
      passes.

**Verified (2026-10-22).** _Vocabulary and facts:_ `FLAG_PRESENTATION`, `FLAG_TITLE_KEYS`, `FLAG_LEVELS`
send closed words, keys and numbers only. **Honoured.** _Nothing read changes:_ `panel.test.mjs`'s
digest test now compares the flags **without** `icon`, `group`, `title`, `code`, `level` to 0.9.0's
digests, on the five reads, and passes. **Honoured.** _No fact is invented:_ a code is the `suptype`
read (`flags.test.mjs` cross-checks each code with the flag's kind); the level's value equals the
number the label states; the qualifiers are the official words of the grades. **Honoured.** _The host
is never asked to know a flag:_ nothing in the package names the host's files. **Honoured.** _Both
locales:_ `flags.test.mjs` "criterion 5" and `package.test.mjs`' key audit. **Honoured.**

---

# Current state

_Read 2026-10-22 at the 0.11.0 tree._

- **`easementFlags`** (`index.js`): one flag per category (`abf`, `site`, `ppr`)
  from the SUP easements (`SUPTYPES`: AC1, AC4 → `abf`; AC2 → `site`;
  PM1, PM3 → `ppr`), its label « N périmètres patrimoniaux (Architecte des
  Bâtiments de France) », its detail the easements' names joined by « · ».
- **`georisquesFlags`**: `seismic` (zone 1–5), `radon` (class 1–3), `clay`
  (exposure 1–3, with a detail), one `ppr-<id>` per PPRN, one `risk-<code>`
  per risk listed for the commune (detail « Recensé pour toute la commune par
  Géorisques. Information, pas une règle. »), and `cc-restricted`
  (`report.flags` in `reportOf`, a citation of L.161-4).
- **Today's rendering**: a flat list of long bold sentences (096.25's Current
  state).

---

# Goal

Each flag says what kind of thing it is, which group it belongs to and — for
the three graded risks — how strong it is, so the host can draw the boards'
Risks view.

# Out of scope

- The wording of existing labels and details (unchanged).
- New flags (no new source is read).
- The Risks section's summary (002.12's).

---

# Decisions

## DEC-1 — The mapping

| Flag | `icon` | `group` | `title` | `code` | `level` |
| --- | --- | --- | --- | --- | --- |
| `sup-abf` | `heritage` | `constraint` | AC1 only « Monuments historiques · périmètre ABF »; AC4 only « Site patrimonial remarquable · ABF »; both « Périmètre patrimonial · ABF » | the `suptype`s, « AC1 », « AC4 », « AC1 · AC4 » | — |
| `sup-site` | `heritage` | `constraint` | « Site classé ou inscrit » | « AC2 » | — |
| `sup-ppr` | `easement` | `constraint` | « Servitude de plan de prévention des risques » | « PM1 », « PM3 » or both | — |
| `cc-restricted` | `ground` | `constraint` | « Construction restreinte (carte communale) » | « L.161-4 » | — |
| `seismic` | `seismic` | `hazard` | « Sismicité » | — | `zone` of 5; display « Zone 3 »; qualifier the official word (très faible, faible, modérée, moyenne, forte) |
| `radon` | `radon` | `hazard` | « Radon » | — | `class` of 3; display « Classe 2 »; qualifier « Faible », « Facteurs géologiques », « Significatif » |
| `clay` | `clay` | `hazard` | « Argiles » | — | `exposure` of 3; display « Niveau 2 »; qualifier « Faible », « Moyenne », « Forte » |
| `ppr-<id>` | `hazard` | `hazard` | the PPRN's name (the source's words) | — | — |
| `risk-<code>` | `hazard` | `listed` | the risk's name (the source's words) | — | — |

The titles are the owner's example (« Monuments historiques · périmètre ABF »)
generalised by the easement categories the SUP nomenclature names (AC1:
protection of monuments historiques; AC4: the heritage protection zones, now
site patrimonial remarquable). A mixed or unknown set reads as the generic
heritage title, never as a guess.

## DEC-2 — Levels are the values already read

A level is sent only when Géorisques gave the number (the flags are only made
then); `value` is that number, `max` the scale's top (5 for the seismic zone,
3 for the radon class and the clay exposure). The tone is the host's
(096.25 DEC-3).

## DEC-3 — Keys

`fr-urban-rules.flag.title.*`, `.flag.display.*`, `.flag.qualifier.*` in both
locales; the source's own names (PPRN, risk) are verbatim text, not keys.

---

# Steps

1. `easementFlags` carries the `suptype`s; the mapping above.
2. `georisquesFlags` adds title/icon/group/level; `cc-restricted` likewise.
3. `en.json` / `fr.json`; the key audit; the README and CHANGELOG; `package.json`
   to 0.12.0 / "1.37".
4. Tests: `flags.test.mjs` over the five recorded reads; `panel.test.mjs`'s
   digest test excludes the five fields and nothing else.
5. `tools/build-index.mjs` and `check-index.mjs` accept 0.12.0.

# Acceptance criteria

1. Every flag the package sends on the five reads carries an `icon` and a
   `group` of the SDK's vocabularies.
2. Graded flags carry a `level` whose `value` is the flag's own number and
   within `max`.
3. The 0.11.0 digests of each flag's `id`, `kind`, `label`, `detail` and
   `citation` hold on the five reads.
4. An easement flag's `code` equals the `suptype`s read, and its `title` is
   the category's by DEC-1.
5. All new keys exist in both locales.
6. The package suite passes; `build-index` / `check-index` accept 0.12.0.

# Testing strategy

A test over the recorded reads (`flags.test.mjs`), the digest test, the key
audit, the existing acceptance (002.9's expected values) unchanged.

# Risks

- **A title the SUP category does not support** (an easement the nomenclature
  names differently): the generic title is the fallback (DEC-1).
- **A new Géorisques value outside the scale** (a seismic zone 6): the level
  is dropped by the host's check and counted; the flag stays.

# Questions (recommended answers applied)

1. **The owner's example title** is applied to AC1 and generalised; the
   alternative (one title for the whole heritage category) loses the AC1/AC4
   distinction the code line already makes. Taken on his behalf, reversible.

# Definition of Done

Every criterion walked; the Outcome; the README and CHANGELOG.

# Post-sprint

- [x] `fr-urban-rules` README, CHANGELOG. **Done.**
- [x] 002.10's header (0.14.0). **Done at drafting.**
- [x] The milestone row. **Done at drafting; its status at 096.28.**

---

# Dependencies

| Sprint / item | What this sprint needs from it |
| --- | --- |
| **Platform 096.25** | SDK 1.37 |
| **Versions** | `fr-urban-rules` **0.12.0**, `sdkVersion` **1.37** |

---

# Outcome

_Implemented 2026-10-22, uncommitted. `fr-urban-rules` 0.12.0, `sdkVersion` 1.37 (lockstep with the
platform's 096.25)._

**The owner's answer.** Q1 (the SDK addition for flags): yes. Taken on his behalf (reversible): the
owner's example title is applied to AC1 and generalised by category (AC4 « Site patrimonial remarquable
· ABF », a mixed set « Périmètre patrimonial · ABF »); a PPRN and each listed risk are titled by the
source's own name; the radon grade 2 qualifier is « Facteurs géologiques » (the official « faible mais
avec facteurs géologiques » does not fit a tile).

**What landed.** `fr-urban-rules/src/index.js`: `FLAG_PRESENTATION`, `FLAG_TITLE_KEYS`, `FLAG_LEVELS`,
`flagLevel()`, `easementFlags` carrying the `suptype`s, `georisquesFlags` and the carte communale's flag
with their presentation; 23 keys in `en.json` and `fr.json`; `package.json` 0.12.0 / "1.37"; README and
CHANGELOG. Tests: `tests/flags.test.mjs` (new), `panel.test.mjs` (the digest without the five fields),
`package.test.mjs`. On the five recorded reads (Lyon, Gordes, Brouennes, Mouzay, Rochefort-en-Terre) every
flag has an icon, a group and a title; each plot's seismic, radon and clay levels are the Géorisques numbers
(Lyon 2/5, 1/3, 2/3; Gordes 3/5, 1/3, 3/3; …); Lyon has three constraint rows (AC1, AC2, PM1), Gordes AC2,
Mouzay PM1, Rochefort-en-Terre AC4; a PPRN row on Lyon and Mouzay.

**Gates.** The plugin suite: 430 tests, 428 passed, 2 skipped (the repository's own). `tools/build-index.mjs`
(with the rebuilt CLI) and `tools/check-index.mjs` accept 0.12.0.

**Acceptance walked.** 1, 2: `flags.test.mjs` criteria 1 and 2. 3: `panel.test.mjs` criterion 6.
4: `flags.test.mjs` criterion 4. 5: `flags.test.mjs` criterion 5, `package.test.mjs`. 6: above. On screen:
096.28's walk (the real package, five plots).

**Found by the walk (096.28, the real package on Gordes):** the Risks view still opened with the 002.12 `fields`
block — « Sismicité · Zone 3 », « Risques recensés · Inondation · Par une crue … · Mouvement de terrain … » in
one line each, past the panel's width — then the tiles said the same again. The block is now **folded beneath
the flags** as `risk-readings` (« Relevés des services »), open and said so in its summary when a service is
loading or did not answer, so its states are never hidden. `panel.test.mjs` criterion 2 and `reading.test.mjs`
(DEC-6) read it there.

**Deviations.** The Risks view's 0.11.0 first block moved into a fold (above): a change to where the readings
sit, not to what is said; no reading, check or flag changed.
