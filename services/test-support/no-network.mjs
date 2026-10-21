/**
 * No network in the services' tests (Sprint 002.9, Design Contract 2 and
 * criterion 2), as the package's suites have had since 002.4: imported first
 * by every test file under `services/<service>/tests/` (`no-network.test.mjs` holds them to
 * it). `globalThis.fetch` and `node:https`'s `request` / `get` — the
 * ai-client's and the fetcher's defaults — throw for any host but `127.0.0.1`,
 * because `ai-client-timeout.test.mjs` and the gateway's tests talk to loopback
 * servers of their own, and the fetcher's tests pass `http.request` with a
 * `lookup` onto one. `blocked` lists what was refused.
 */

import https from 'node:https';

const LOOPBACK = '127.0.0.1';
export const blocked = [];

function hostOf(input) {
  if (typeof input === 'string' || input instanceof URL) return new URL(input).hostname;
  if (input !== null && typeof input === 'object') {
    if (typeof input.url === 'string') return new URL(input.url).hostname;
    return String(input.hostname ?? input.host ?? '').replace(/:\d+$/, '');
  }
  return '';
}

function refuse(where, host) {
  blocked.push(`${where} ${host}`);
  throw new Error(`no network in the services' tests: ${where} to ${host || 'an unnamed host'} refused`);
}

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const host = hostOf(input);
  // `data:` (the ai-client's dispatcher probe) reaches no host.
  if (!(typeof input === 'string' && input.startsWith('data:')) && host !== LOOPBACK) refuse('fetch', host);
  return realFetch(input, init);
};

for (const name of ['request', 'get']) {
  const real = https[name];
  https[name] = (...args) => {
    const host = hostOf(args[0]);
    if (host !== LOOPBACK) refuse(`https.${name}`, host);
    return real(...args);
  };
}
