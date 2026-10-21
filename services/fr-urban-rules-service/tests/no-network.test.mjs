/**
 * Sprint 002.9, criterion 2: the services' suites run with no network but
 * loopback — every test file imports `services/test-support/no-network.mjs`
 * first, and the guard refuses `fetch` and `https.request` off 127.0.0.1.
 */

// 002.9 criterion 2: no network but loopback, before anything else is loaded.
import '../../test-support/no-network.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { test } from 'node:test';

import { blocked } from '../../test-support/no-network.mjs';

const SERVICES = new URL('../../', import.meta.url);

test('every services test file imports the no-network guard before anything else', () => {
  const files = [];
  for (const service of readdirSync(SERVICES, { withFileTypes: true })) {
    if (!service.isDirectory() || service.name === 'test-support' || service.name === 'node_modules') continue;
    let names;
    try {
      names = readdirSync(new URL(`${service.name}/tests/`, SERVICES));
    } catch {
      continue;
    }
    for (const name of names.filter((n) => n.endsWith('.test.mjs'))) files.push(`${service.name}/tests/${name}`);
  }
  assert.ok(files.length >= 11, `found ${files.length} test files`);
  for (const file of files) {
    const text = readFileSync(new URL(file, SERVICES), 'utf8');
    const first = text.match(/^import .*$/m)?.[0];
    assert.equal(first, "import '../../test-support/no-network.mjs';", `${file} imports the guard first`);
  }
});

test('the guard refuses fetch and https off loopback, and lets loopback through', async () => {
  const before = blocked.length;
  assert.throws(() => globalThis.fetch('https://data.geopf.fr/annexes/x.pdf'), /no network in the services' tests/);
  assert.throws(() => globalThis.fetch(new URL('https://www.geoportail-urbanisme.gouv.fr/api/document')), /refused/);
  assert.throws(() => https.request('https://www.geoportail-urbanisme.gouv.fr/'), /https\.request/);
  assert.throws(() => https.get({ hostname: 'example.org', path: '/' }), /https\.get/);
  assert.throws(() => globalThis.fetch('http://localhost:9/'), /refused/, 'only 127.0.0.1 is loopback here');
  assert.equal(blocked.length, before + 5);

  const server = http.createServer((request, response) => response.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const answer = await globalThis.fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await answer.text(), 'ok');
  } finally {
    server.close();
  }
});
