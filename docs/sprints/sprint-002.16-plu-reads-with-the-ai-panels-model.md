# Sprint 002.16 — The PLU Reads With The AI Panel's Model

> **Status:** Landed in the working tree (2026-11-03), uncommitted. See the [Outcome](#outcome).
>
> **Repository:** `archisimple-plugins` — `fr-urban-rules-service` 0.4.0, `services/gateway`, `fr-urban-rules` **0.15.0**,
> `sdkVersion` **"1.40"**.
>
> **Platform half:** Sprint 102.11 (SDK 1.40, ADR-0028 Rule 11, ADR-0114 Rule 14). Lockstep: ship 0.15.0 only with a web image
> carrying 102.11; an older host refuses the manifest.

## Goal

The written rules are read by the provider and model the user chose in the AI panel, under the signed-in account's entitlement.

## Decisions

- **The extension sends the choice**, read at the moment of use (`ai.selectedModel()`), as `ai: { providerId, model? }` in
  `POST v1/extractions` and as `provider` and `model` on `GET …&cachedOnly=1`. Omitted when there is none or the host is older
  than 1.40: the service's `ai-service` default reads, as in 0.14.0.
- **The service checks it** (id `^[a-z0-9][a-z0-9_-]{0,39}$`, model ≤ 120 printable characters, no `://`, no other field,
  no endpoint) and forwards `providerId` and `model` to `POST /api/ai/extract`.
- **The entitlement travels with the call** (ADR-0114 Rule 14). The gateway reads `X-Authenticated-Features` — believed for the
  reason `X-Authenticated-User` is — keeps well-formed feature ids only, and hands them to the service as `features`. The service
  stores them with the job and sends `X-Authenticated-Features` on `extract` and `health`. It decides nothing.
- **A refusal is the job's error**, with ai-service's code (`provider_not_permitted`, `unknown_provider`), at the first chunk,
  free of charge. The panel says « Votre compte n’inclut pas le modèle choisi dans le panneau IA… » and offers Try again.
- **`current`** on a cached read names the requested provider, and the panel's offer of « Extract again » follows the live choice.
- **A cached result is shared** and a refusal does not hide it: it costs no model call.

## Outcome

- **Tests:** service and gateway 203 (2 skipped); extension 480 (2 skipped). New: `entitlement.test.mjs` (allowed, refused,
  absent, unknown, shared cache, pattern checks, the client's header and body, no `Authorization`), the gateway's `parseFeatures`,
  and seven reader tests in `written.test.mjs`.
- **Unverified:** a refusal on a real deployment with the account gateway in front; the panel in a browser.
