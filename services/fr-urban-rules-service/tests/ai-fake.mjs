/**
 * A fake of ai-service's extract route (platform 096.7), built from its wire
 * example's shape (`apps/ai-service/src/__tests__/fixtures/extract-wire.json`):
 * items `{ value, passage: { text, start, end, occurrences } }` with offsets
 * into the text sent, `rejected`, `providerId`, `model`, `constraint`.
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
  health = { available: true, defaultProviderId: 'lmstudio', maxTextLength: 200_000, maxItems: 200 },
  providerId = 'lmstudio',
  model = 'fake-model',
  constraint = 'schema',
  hold
} = {}) {
  const calls = [];
  return {
    calls,
    health: async () => (typeof health === 'function' ? health() : health),
    async extract(request) {
      calls.push(request);
      if (hold !== undefined) await hold;
      const planned = await plan(request.text, calls.length, request);
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
          passage: { text: p.passage, start: found[0].start, end: found[0].end, occurrences: found.length }
        });
      });
      return {
        providerId,
        model,
        items,
        rejected,
        finishReason: 'stop',
        attempts: 1,
        constraint: typeof constraint === 'function' ? constraint(calls.length) : constraint
      };
    }
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
