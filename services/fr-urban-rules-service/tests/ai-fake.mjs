/**
 * A fake of ai-service's extract route (platform 096.7), built from its wire
 * example's shape (`apps/ai-service/src/__tests__/fixtures/extract-wire.json`):
 * items `{ value, passage: { text, start, end, occurrences } }` with offsets
 * into the text sent, `rejected`, `providerId`, `model`, `constraint`.
 *
 * Sprint 002.16: it records the second argument of `extract` (`routes`: who is asking and
 * what they chose) and behaves as ai-service does with it. `granted` lists the providers that
 * need the feature `ai-<id>` (`openai` on the NUC); `known` lists every provider id there is.
 * A named provider that is not known is `unknown_provider`, and a granted one without its feature
 * is `provider_not_permitted` — ai-service's own codes. With no `granted`/`known` it accepts all.
 *
 * `plan(text, call)` says what the "model" answers for one chunk:
 * `[{ value, passage }]`, or a thrown `AiError`. The fake does what 096.7
 * does with it: an absent passage is `passage-not-found`, a present one gets
 * its first occurrence's offsets and the count.
 */

import { AiError } from '../src/ai-client.mjs';
import { allOccurrences, normaliseText } from '../src/normalise.mjs';

export function fakeAi({
  plan = () => [],
  health = {
    available: true,
    defaultProviderId: 'lmstudio',
    maxTextLength: 200_000,
    maxItems: 200
  },
  providerId = 'lmstudio',
  model = 'fake-model',
  constraint = 'schema',
  hold,
  granted = [],
  known
} = {}) {
  const calls = [];
  const routes = [];
  const healths = [];
  return {
    calls,
    routes,
    healths,
    health: async (route) => {
      healths.push(route);
      return typeof health === 'function' ? health() : health;
    },
    async extract(request, route = {}) {
      calls.push(request);
      // 002.23: the job's own signal rides along; what the tests compare is who asked and what they chose.
      const { signal: _signal, ...asked } = route;
      routes.push(asked);
      if (route.providerId !== undefined) {
        if (known !== undefined && !known.includes(route.providerId))
          throw new AiError('unknown_provider', 422);
        if (
          granted.includes(route.providerId) &&
          !(route.features ?? []).includes(`ai-${route.providerId}`)
        ) {
          throw new AiError('provider_not_permitted', 403);
        }
      }
      if (hold !== undefined) await hold;
      const planned = (await plan(request.text, calls.length, request)).map((p) =>
        asAsked(p, request)
      );
      const normalised = normaliseText(request.text);
      const items = [];
      const rejected = [];
      planned.forEach((p, index) => {
        if (p.reject !== undefined) {
          rejected.push({ index, reason: p.reject, detail: 'fake' });
          return;
        }
        const found = allOccurrences(normalised, p.passage);
        if (found.length === 0) {
          rejected.push({ index, reason: 'passage-not-found', detail: 'fake' });
          return;
        }
        items.push({
          value: p.value,
          passage: {
            text: p.passage,
            start: found[0].start,
            end: found[0].end,
            occurrences: found.length
          }
        });
      });
      return {
        providerId: route.providerId ?? providerId,
        model: route.model ?? model,
        items,
        rejected,
        finishReason: 'stop',
        attempts: 1,
        constraint: typeof constraint === 'function' ? constraint(calls.length) : constraint
      };
    }
  };
}

/**
 * Sprint 002.33: when the request asks for `appliesTo` and the plan wrote the earlier `sector`, answer as a model would:
 * no sector is the zone, a sector is a one-item list. A plan that already says `appliesTo` is left as it is.
 */
function asAsked(planned, request) {
  const asksAppliesTo = request.itemSchema?.properties?.appliesTo !== undefined;
  if (
    !asksAppliesTo ||
    planned.value === undefined ||
    planned.value.appliesTo !== undefined ||
    !('sector' in planned.value)
  )
    return planned;
  const { sector, ...rest } = planned.value;
  return {
    ...planned,
    value: { ...rest, appliesTo: sector === null || sector === undefined ? 'zone' : [sector] }
  };
}

export function failing(code) {
  return () => {
    throw new AiError(code, 502);
  };
}

/** A rule value with the schema's every field. */
export function rule(fields) {
  return {
    kind: 'other',
    sector: null,
    statement: 'described',
    limit: null,
    conditions: [],
    exceptions: [],
    confidence: 'high',
    ...fields
  };
}
