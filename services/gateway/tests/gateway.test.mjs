/**
 * The gateway (Sprint 002.5a DEC-10; ADR-0114 Rules 3, 4 and 10): mounting,
 * health, unknown ids, path safety, the user header and its keyed hash, and a
 * parse child dying without taking the gateway with it.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createGateway, createUserHasher, mountServices, parseTarget } from '../src/gateway.mjs';
import { createParser } from '../../fr-urban-rules-service/src/document.mjs';
import { createService } from '../../fr-urban-rules-service/src/service.mjs';
import { buildPdf, capturingLog } from '../../fr-urban-rules-service/tests/helpers.mjs';

const servers = [];
after(() => Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve)))));

async function listen(server) {
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

/** A raw GET: the path is sent exactly as written, never normalised. */
function get(port, path, headers = {}, method = 'GET', payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, body: text === '' ? undefined : JSON.parse(text) });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

/** A services folder with a good service, one that throws at start, and two non-services. */
function servicesFolder() {
  const root = mkdtempSync(join(tmpdir(), 'plugin-services-'));
  const write = (path, text) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write('ok/package.json', JSON.stringify({ name: 'ok', version: '1.2.3', archisimple: { packageId: 'org.example.ok' } }));
  write(
    'ok/src/service.mjs',
    `export const calls = [];
     export async function createService({ dataDir }) {
       return { version: '1.2.3', dataDir, handle: async (request) => { calls.push(request); return { status: 200, body: { segments: request.segments, limitKey: request.limitKey, userHash: request.userHash, userSource: request.userSource, method: request.method, body: request.body } }; } };
     }`
  );
  write('broken/package.json', JSON.stringify({ name: 'broken', version: '0.0.1', archisimple: { packageId: 'org.example.broken' } }));
  write('broken/src/service.mjs', `export async function createService() { throw new Error('cannot start'); }`);
  write('gateway-like/package.json', JSON.stringify({ name: 'gateway-like', private: true }));
  mkdirSync(join(root, 'empty'));
  return root;
}

const okCalls = async (root) => (await import(join(root, 'ok/src/service.mjs'))).calls;

async function stubGateway(env = { PLUGIN_SERVICES_LOG_KEY: 'test-key' }) {
  const root = servicesFolder();
  const capture = capturingLog();
  const mounted = await mountServices({ servicesDir: root, env, log: capture.log, dataDir: root });
  const port = await listen(createGateway({ mounted, env, log: capture.log }));
  return { port, capture, root, calls: await okCalls(root) };
}

test('mounting: services by packageId; one that throws at start is logged and left out', async () => {
  const { port, capture } = await stubGateway();
  const health = await get(port, '/plugins-api/health');
  assert.deepEqual(health.body, { status: 'ok', services: ['org.example.ok'] });
  const failed = capture.records.find((r) => r.event === 'service_not_mounted');
  assert.equal(failed.packageId, 'org.example.broken');
  assert.equal((await get(port, '/plugins-api/org.example.broken/health')).status, 404);
});

test('health: ADR-0114 Rule 4 for a mounted id, 404 JSON for any other', async () => {
  const { port } = await stubGateway();
  const ok = await get(port, '/plugins-api/org.example.ok/health');
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /^application\/json/u);
  assert.deepEqual(ok.body, { status: 'ok', packageId: 'org.example.ok', contract: 1, version: '1.2.3' });
  const other = await get(port, '/plugins-api/org.example.other/health');
  assert.equal(other.status, 404);
  assert.match(other.headers['content-type'], /^application\/json/u);
  assert.deepEqual(other.body, { error: 'not_found' });
  assert.equal((await get(port, '/elsewhere')).status, 404);
});

test('the real services folder mounts com.archisimple.fr-urban-rules, and its health is Rule 4', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'plugin-services-data-'));
  const capture = capturingLog();
  const mounted = await mountServices({ env: {}, log: capture.log, dataDir });
  assert.deepEqual([...mounted.keys()], ['com.archisimple.fr-urban-rules']);
  const port = await listen(createGateway({ mounted, env: {}, log: capture.log }));
  const health = await get(port, '/plugins-api/com.archisimple.fr-urban-rules/health');
  assert.deepEqual(health.body, { status: 'ok', packageId: 'com.archisimple.fr-urban-rules', contract: 1, version: '0.2.0' });
  assert.equal((await get(port, '/plugins-api/org.example.other/health')).status, 404);
  assert.ok(capture.records.some((r) => r.event === 'log_key_random'), 'an unset log key is said');
});

test('path safety: . and .., encoded or not, and an encoded / or \\ answer 400; no handler is called', async () => {
  const { port, calls } = await stubGateway();
  for (const path of [
    '/plugins-api/org.example.ok/v1/%2E%2E/x',
    '/plugins-api/org.example.ok/v1/../x',
    '/plugins-api/org.example.ok/v1/./x',
    '/plugins-api/org.example.ok/v1/%2e/x',
    '/plugins-api/org.example.ok/v1/a%2Fb',
    '/plugins-api/org.example.ok/v1/a%2fb',
    '/plugins-api/org.example.ok/v1/a%5Cb',
    '/plugins-api/org.example.ok/v1/a\\b',
    '/plugins-api/%2E%2E/api/share/x',
    '/plugins-api/org.example.ok/v1/%E0%A4%A'
  ]) {
    const answer = await get(port, path);
    assert.equal(answer.status, 400, path);
    assert.deepEqual(answer.body, { error: 'invalid_request' }, path);
  }
  assert.equal(calls.length, 0);
  assert.equal(parseTarget('/plugins-api/a/b%20c').segments[1], 'b c', 'segments are decoded');
});

test('a query over 4 KiB, or a request body, is refused before the service', async () => {
  const { port, calls } = await stubGateway();
  assert.equal((await get(port, `/plugins-api/org.example.ok/v1/x?zone=${'a'.repeat(4100)}`)).status, 400);
  assert.equal((await get(port, '/plugins-api/org.example.ok/v1/x', { 'Content-Length': '5000' })).status, 400);
  assert.equal(calls.length, 0);
});

test('the user: X-Authenticated-User keys the limits and is handed on only as a keyed hash', async () => {
  const { port } = await stubGateway();
  const named = await get(port, '/plugins-api/org.example.ok/v1/chapter?zone=A', { 'X-Authenticated-User': 'alice' });
  assert.deepEqual(named.body.segments, ['v1', 'chapter']);
  assert.equal(named.body.limitKey, 'user:alice');
  assert.equal(named.body.userSource, 'header');
  assert.equal(named.body.userHash, createUserHasher({ PLUGIN_SERVICES_LOG_KEY: 'test-key' }).hash('alice'), 'the name is what is hashed');
  const anonymous = await get(port, '/plugins-api/org.example.ok/v1/chapter');
  assert.equal(anonymous.body.userSource, 'address');
  assert.match(anonymous.body.limitKey, /^address:/u);
});

test('a POST body up to 4 KiB reaches the service as text (002.5b); a larger one, chunked or not, is 400', async () => {
  const { port, calls } = await stubGateway();
  const body = JSON.stringify({ zone: 'A' });
  const ok = await get(port, '/plugins-api/org.example.ok/v1/extractions', { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, 'POST', body);
  assert.equal(ok.body.method, 'POST');
  assert.equal(ok.body.body, body);
  const big = 'x'.repeat(5000);
  assert.equal((await get(port, '/plugins-api/org.example.ok/v1/extractions', { 'Transfer-Encoding': 'chunked' }, 'POST', big)).status, 400);
  assert.equal(calls.length, 1);
});

test('S8: an X-Authenticated-User over 128 characters is refused', async () => {
  const { port, calls } = await stubGateway();
  assert.equal((await get(port, '/plugins-api/org.example.ok/v1/x', { 'X-Authenticated-User': 'a'.repeat(129) })).status, 400);
  assert.equal((await get(port, '/plugins-api/org.example.ok/v1/x', { 'X-Authenticated-User': 'a'.repeat(128) })).status, 200);
  assert.equal(calls.length, 1);
});

test('the keyed hash: stable across restarts with PLUGIN_SERVICES_LOG_KEY, never sha256(name)', () => {
  const name = 'user:alice';
  const one = createUserHasher({ PLUGIN_SERVICES_LOG_KEY: 'deployment-secret' });
  const two = createUserHasher({ PLUGIN_SERVICES_LOG_KEY: 'deployment-secret' });
  assert.equal(one.keyed, true);
  assert.match(one.hash(name), /^[0-9a-f]{12}$/u);
  assert.equal(one.hash(name), two.hash(name), 'the same across restarts');
  assert.notEqual(one.hash(name), createHash('sha256').update(name).digest('hex').slice(0, 12));
  assert.notEqual(one.hash(name), createHash('sha256').update('alice').digest('hex').slice(0, 12));
  assert.notEqual(createUserHasher({ PLUGIN_SERVICES_LOG_KEY: 'other' }).hash(name), one.hash(name));
  const random = createUserHasher({});
  assert.equal(random.keyed, false);
  assert.notEqual(random.hash(name), createUserHasher({}).hash(name), 'random per start without the key');
});

test('a parse child that dies is document_unreadable, and the gateway keeps answering health', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'plugin-services-bomb-'));
  const bomb = buildPdf({
    pages: [{ stream: `BT /F1 10 Tf ${'1 0 0 1 50 400 Tm (ab) Tj 1 0 0 1 50 300 Tm (cd) Tj\n'.repeat(250_000)} ET` }],
    compress: true
  });
  const fetcher = {
    listDocuments: async () => [{ id: 'doc1', originalName: 'IDU_1' }],
    listFiles: async () => [{ name: 'r.pdf' }],
    downloadPdf: async () => {
      const path = join(dataDir, 'bomb.pdf');
      writeFileSync(path, bomb);
      return { path, bytes: bomb.length, sha256: '0'.repeat(64) };
    }
  };
  const capture = capturingLog();
  const service = await createService({
    env: {},
    log: capture.log,
    dataDir,
    fetcher,
    parse: createParser({ maxOldSpaceMb: 32 })
  });
  const mounted = new Map([[service.packageId, { service, version: service.version }]]);
  const port = await listen(createGateway({ mounted, env: {}, log: capture.log }));
  const answer = await get(
    port,
    '/plugins-api/com.archisimple.fr-urban-rules/v1/chapter?partition=DU_00001&idurba=IDU_1&nomfic=r.pdf&zone=A'
  );
  assert.equal(answer.status, 422);
  assert.equal(answer.body.error, 'document_unreadable');
  const health = await get(port, '/plugins-api/com.archisimple.fr-urban-rules/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
});
