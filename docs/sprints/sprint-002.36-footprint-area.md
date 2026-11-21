# Sprint 002.36 — Footprint Areas (Draft)

> **Status:** Implemented in the working tree (2026-11-20), uncommitted — **Option A, at the owner's go**. Epics 1, 2 and 4 built test-first; Epic 3 measured by replay ($0). The prompt is unchanged (the model already returned g07 as an area), so no version bump.
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service` and the `fr-urban-rules` extension (0.24.0, unreleased). **No SDK change.**
>
> **Milestone:** [Extra Documents for a Plot](../../../archisimple/docs/milestones/extra-documents/README.md). Follows 002.35. Motivated by Gordes g07 and by the owner's observation that **lotissement and hameau rules often cap the footprint in square metres**, sometimes **beside** a percentage (both apply; the stricter binds).

## Goal

Read, keep and check a footprint cap written as an area (« L'emprise au sol … est limitée à 250 m² »), alone or together with a percentage.

## Baseline (verified in source, 2026-11-20)

- The service refuses it: `coherent()` allows `footprint_ratio` only with `value … percent` or a `ratio`; a `value m2` is counted as `incoherent` and dropped. **True** (`extract.mjs`; Gordes g07 in the 002.34 triage).
- The extension ignores an area footprint: `footprintPercentOf` returns undefined for anything but a percent or a ratio of the plot, and the surface checks and the budget are built from percent rules only. **True** (`index.js`).
- The extension checks **each footprint rule on its own** (`for (const rule of footprintRules)`), so two rules, a percentage and an area, are both checked and the stricter one binds without extra work in the checks. **True.** The **budget bar and the "allowed" figure** use one percentage (`limits.ces`) and would have to take the smaller of the percentage's area and the area cap.
- The rule kinds are an SDK contract (`REGULATION_RULE_KINDS`, `packages/extension-sdk/src/regulations.ts`); a limit can already be `value` in `m2`, and the written kind's label is « Emprise au sol (règlement écrit) », not a ratio. **True.**
- The service keeps two rules of one kind and sector when their limits differ (`ruleKey` holds the limit). **True.**

## Decisions for the owner

1. **Option A (recommended): widen `footprint_ratio` to accept `value m2`.** No SDK change, no new kind, no new i18n label. The name says "ratio" but the label says "emprise au sol". Cost: the kind's name misleads a reader of the code.
   **Option B: a new kind `footprint_area_max`**, beside `annex_max` and `floor_area_max`. Cleaner, but an SDK contract change (a deliberate version decision, ADR-governed) across the platform, SDK, service, extension and i18n.
2. **Both at once.** A zone may state « 30 % de l'emprise, et au plus 250 m² ». One item per limit (see 002.35's item 4 in the milestone: a prompt line, measured as a variant); the extension checks both.
3. **The truth of g07 stays** `footprint_ratio`, limit 250 m² (Option A), so its miss is the product's refusal, not the truth's.

## Epics (Option A)

1. **The service accepts a footprint area.** `coherent()` allows `value m2` for `footprint_ratio`; tests: kept, still `incoherent` for other units, comparison `max`; the prompt's kind definition says « footprint_ratio: emprise au sol, as a percentage or as an area » (**a prompt change: `PROMPT_VERSION` 5**, measured as a variant on Gordes and on the four zones).
2. **The extension checks it.** An area footprint rule is checked against the plot's footprint area (the same measurement the percentage uses) with its own check row; with several footprint rules the **budget's allowed area is the smallest** of them, and the basis rows say which rule binds.
3. **The harness measures it.** g07 must be found; nothing else may move (the acceptance rule is fixed before the build, as in 002.33).
4. **Written and entered rules.** An area footprint rule can be entered by hand (the entered kinds list) and is shown in the written regulation panel.

## Not decided

Whether a lotissement document's rules (Sprint 122.0) arrive through the same kinds (they are read by the same extraction), and whether an area footprint belongs to a plot or to a building (a lotissement may cap it per lot: the plot).

## Outcome (built 2026-11-20)

- **Service:** `coherent()` accepts a footprint limit in m² (a length, or an area on the green ratio, is still refused); the comparison must be a maximum. **Prompt unchanged**: on the saved answers of 002.34 the model had already returned g07 as `footprint_ratio ≤ 250 m²`, the code refused it. 4 tests (`footprint-area.test.mjs`), including a percentage and an area from one sentence, both kept.
- **Extension (0.24.0):** `footprintAreaOf`, `footprintAllowance` (the stricter of the share and the area cap; the area needs no plot area), `confirmedLimits().cap`. **One allowance feeds** the budget bar, the headline's gauge (the cap shown as a share of the plot) and verdict, each rule's own check (a cap of its own, `not_checked` never for a missing plot area), the « how much is left » question (a claim « Autorisée : 250 m², le plafond d'emprise du règlement », with its rule) and the programme's line. The budget basis shows « Plafond d'emprise (surface) » beside the share's row when both exist. **Entered:** a new kind « Emprise au sol, plafond de surface » in the add-area form. Strings en/fr. 8 tests (surfaces: alone, exceeded, share + area both ways, no plot area, the question's claim, the programme's line; written: a service result of 250 m² confirmed becomes the budget, alone and beside a share, a minimum never).
- **Measured, replayed, $0:** the 002.34 run's answers through the new service: **Gordes g07 found** (12 of 19, 63%); the four zones now **71 of 87 (82%)**, from 66 (76%) before 002.35. No wrong value or sector error appeared.
- Suites: services 295 tests, extension 597, all pass.

## Not done, not verified

- The reading's prompt still describes the kind as « emprise au sol » only; the model finds the area on its own, but a fresh reading may vary (a wording change would be a prompt version and a measured variant).
- Not walked in the editor (no browser run); the budget bar and gauge with a cap are tested on the report's blocks, not looked at.
- **A lot-level reading** (a lotissement cap per lot, not per plot) is Sprint 122.0's.
- The entered-rule edit form for a rule whose kind has two entry units (`footprint_ratio` percent and `footprint_area`) was not exercised beyond adding.
