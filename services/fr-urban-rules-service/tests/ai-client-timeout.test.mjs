/**
 * Follow-up (2026-10-20): long extract calls. undici's default dispatcher
 * gives up after 300 s without response headers; the extract call goes
 * through an `Agent` with that limit off. Proved here with the global
 * dispatcher's header limit lowered to 300 ms and a server that answers
 * after 1.5 s: a plain `fetch` fails, the client's extract call completes.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import { createAiClient, extractTimeoutFromEnv, unboundedDispatcher } from '../src/ai-client.mjs';

const KEY = Symbol.for('undici.globalDispatcher.1');

const server = http.createServer((req, res) => {
  req.resume();
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ providerId: 'p', model: 'm', items: [], rejected: [], constraint: 'schema' }));
  }, 1_500);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => {
  server.closeAllConnections();
  server.close();
});

test('an extract call outlives the runtime fetch\'s header timeout', async () => {
  assert.ok((await unboundedDispatcher()) !== undefined, 'an unbounded Agent is made on this runtime');
  const original = globalThis[KEY];
  const Agent = original.constructor;
  globalThis[KEY] = new Agent({ headersTimeout: 300, bodyTimeout: 300 });
  try {
    await assert.rejects(fetch(`${base}/api/ai/extract`, { method: 'POST', body: '{}' }), 'the lowered limit is in force');
    const client = createAiClient({ baseUrl: base });
    const answer = await client.extract({ instructions: 'i', text: 't', itemSchema: {}, maxItems: 1 });
    assert.deepEqual(answer.items, []);
  } finally {
    globalThis[KEY] = original;
  }
});

test('with a bounded dispatcher the same call fails: the dispatcher is what lifts the limit', async () => {
  const Agent = globalThis[KEY].constructor;
  const bounded = new Agent({ headersTimeout: 300, bodyTimeout: 300 });
  const client = createAiClient({ baseUrl: base, dispatcher: async () => bounded });
  await assert.rejects(client.extract({ instructions: 'i', text: 't', itemSchema: {}, maxItems: 1 }), (e) => e.code === 'unreachable');
});

test('the client timeout is a named variable: 30 minutes by default, never under 120 s', () => {
  assert.equal(extractTimeoutFromEnv({}), 30 * 60_000);
  assert.equal(extractTimeoutFromEnv({ FR_URBAN_RULES_EXTRACT_TIMEOUT_MS: '600000' }), 600_000);
  assert.equal(extractTimeoutFromEnv({ FR_URBAN_RULES_EXTRACT_TIMEOUT_MS: '1000' }), 120_000);
  assert.equal(extractTimeoutFromEnv({ FR_URBAN_RULES_EXTRACT_TIMEOUT_MS: 'x' }), 30 * 60_000);
});
