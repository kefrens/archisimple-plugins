# Marseille PLUi (200054807_PLUi_20260306_B), zone UD, pages 174-176

`pages.json`: the three pages of the public règlement text that hold article UD4.2 (implantation par rapport aux limites séparatives), as the service read them.
`strip-answers.json`: the setback and height items the real model (OpenAI `gpt-6.1-terra`, prompt version 3) returned for them on 2026-11-03, as `{ value, passage }` — what `fakeAi({ plan })` replays. Used by `services/fr-urban-rules-service/tests/strip.test.mjs` and `fr-urban-rules/tests/written-strip.test.mjs`.

`result-ud.json`: the whole zone UD chapter's result (pages 170-180; 98 rules; the service's shape without the offsets), as the real model returned it with prompt version 3 — what Sprint 002.22's counts are made on (`fr-urban-rules/tests/triage.test.mjs`).
