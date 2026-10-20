/**
 * The plugin-services gateway (Sprint 002.5a DEC-10; ADR-0114 Rules 3–4, 10).
 *
 * One process in the deployment's `plugin-services` container. It reads
 * `services/<folder>/package.json` for `"archisimple": { "packageId" }`,
 * imports that folder's `src/service.mjs`, and mounts the service at
 * `/plugins-api/<packageId>/`. What the platform reads of it is ADR-0114
 * Rule 4 and nothing more:
 *
 *     GET /plugins-api/<id>/health → 200 { status: 'ok', packageId, contract: 1, version }
 *     an unknown id                → 404 JSON
 *     GET /plugins-api/health      → the mounted ids (the image's HEALTHCHECK)
 *
 * nginx forwards `$request_uri` raw, so the path is the gateway's to judge: it
 * routes on **decoded** segments, and a segment equal to `.` or `..`, or
 * holding an encoded `/` or `\`, is refused with 400 before any service sees
 * it. A service that throws at start is logged and left unmounted; the others
 * run.
 *
 * **Only the deployment's proxy may reach the gateway.** It trusts
 * `X-Authenticated-User` (capped at 128 characters) because Caddy sets it and
 * `web` forwards it, and nothing else can connect: the compose service
 * publishes no port, and the gateway binds where the deployment says
 * (`PLUGIN_SERVICES_HOST`, `0.0.0.0` inside the container's own network). Run
 * outside that arrangement, anyone could claim any name. No shared secret
 * between `web` and the gateway for now (owner decision, 2026-10-20).
 *
 * No dependency: `node:http` only.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PREFIX = '/plugins-api/';
export const HEALTH_CONTRACT = 1;
export const MAX_TARGET_BYTES = 4096;
export const MAX_BODY_BYTES = 4096;
export const MAX_USER_LENGTH = 128;
export const DEFAULT_PORT = 4500;
export const GATEWAY_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

const SERVICES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** One JSON line per event on stdout (DEC-9). */
export function jsonLineLogger(write = (line) => process.stdout.write(line)) {
  return (record) => write(`${JSON.stringify({ time: new Date().toISOString(), ...record })}\n`);
}

/**
 * The user, as a keyed hash: `HMAC-SHA256(PLUGIN_SERVICES_LOG_KEY, name)`,
 * twelve hex characters (ADR-0114 Rule 10). Never a plain hash, which a
 * handful of known account names would reverse. Without the variable the key
 * is random per start, so the hashes of two runs do not correlate.
 */
export function createUserHasher(env) {
  const configured = typeof env.PLUGIN_SERVICES_LOG_KEY === 'string' && env.PLUGIN_SERVICES_LOG_KEY !== '';
  const key = configured ? env.PLUGIN_SERVICES_LOG_KEY : randomBytes(32);
  const hash = (name) => createHmac('sha256', key).update(String(name)).digest('hex').slice(0, 12);
  return { hash, keyed: configured };
}

/** `undefined` when a raw segment must be refused; else its decoded text. */
function decodeSegment(raw) {
  if (/%2f|%5c|\\/iu.test(raw)) return undefined;
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) return undefined;
  return decoded;
}

/**
 * Splits a raw request target into decoded segments after the prefix.
 *
 * @returns {{ ok: true, segments: string[], query: URLSearchParams } | { ok: false, status: number, error: string }}
 */
export function parseTarget(target) {
  if (Buffer.byteLength(target) > MAX_TARGET_BYTES) return { ok: false, status: 400, error: 'invalid_request' };
  const at = target.indexOf('?');
  const path = at === -1 ? target : target.slice(0, at);
  const search = at === -1 ? '' : target.slice(at + 1);
  if (!path.startsWith(PREFIX)) return { ok: false, status: 404, error: 'not_found' };
  const segments = [];
  for (const raw of path.slice(PREFIX.length).split('/')) {
    const decoded = decodeSegment(raw);
    if (decoded === undefined) return { ok: false, status: 400, error: 'invalid_request' };
    segments.push(decoded);
  }
  return { ok: true, segments, query: new URLSearchParams(search) };
}

/**
 * Mounts every service under `servicesDir`. A folder is a service when its
 * `package.json` declares `archisimple.packageId`; the gateway's own does not.
 */
export async function mountServices({ servicesDir = SERVICES_DIR, env, log, dataDir, aiServiceUrl }) {
  const mounted = new Map();
  for (const folder of readdirSync(servicesDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(servicesDir, folder.name, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const packageId = manifest?.archisimple?.packageId;
    if (typeof packageId !== 'string') continue;
    try {
      if (mounted.has(packageId)) throw new Error(`duplicate package id ${packageId}`);
      const module = await import(pathToFileURL(join(servicesDir, folder.name, 'src', 'service.mjs')).href);
      const service = await module.createService({ env, log, dataDir, aiServiceUrl });
      mounted.set(packageId, { service, version: service.version ?? manifest.version });
      log({ level: 'info', event: 'service_mounted', packageId, version: service.version ?? manifest.version });
    } catch (error) {
      log({ level: 'error', event: 'service_not_mounted', packageId, folder: folder.name, errorName: error?.name, message: String(error?.message ?? error).slice(0, 300) });
    }
  }
  return mounted;
}

/** The request body as text, or `undefined` past {@link MAX_BODY_BYTES}. */
function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let over = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) {
        chunks.push(chunk);
        return;
      }
      if (!over) {
        // Stop reading at once: the 400 goes out with `Connection: close`,
        // and the socket is destroyed after it rather than drained.
        over = true;
        request.pause();
        resolve(undefined);
      }
    });
    request.on('end', () => resolve(over ? undefined : Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => resolve(undefined));
  });
}

function answer(response, status, body, headers = {}) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(text);
}

/**
 * @param {{ mounted: Map<string, { service, version }>, env: object, log: Function }} options
 * @returns {import('node:http').Server}
 */
export function createGateway({ mounted, env, log }) {
  const users = createUserHasher(env);
  if (!users.keyed) {
    log({ level: 'warn', event: 'log_key_random', message: 'PLUGIN_SERVICES_LOG_KEY is not set: user hashes use a key random to this start' });
  }

  return createServer(async (request, response) => {
    try {
      const declared = Number(request.headers['content-length'] ?? 0);
      if (!(declared <= MAX_BODY_BYTES)) {
        request.resume();
        return answer(response, 400, { error: 'invalid_request' }, { Connection: 'close' });
      }
      // A body is read whole, up to 4 KiB (002.5b's POST is ~200 bytes); beyond, 400.
      const body = await readBody(request);
      if (body === undefined) {
        response.once('finish', () => request.destroy());
        return answer(response, 400, { error: 'invalid_request' }, { Connection: 'close' });
      }
      const parsed = parseTarget(request.url ?? '/');
      if (!parsed.ok) return answer(response, parsed.status, { error: parsed.error });
      const [id, ...rest] = parsed.segments;
      const method = request.method ?? 'GET';

      if (id === 'health' && rest.length === 0) {
        if (method !== 'GET' && method !== 'HEAD') return answer(response, 405, { error: 'invalid_request' }, { Allow: 'GET' });
        return answer(response, 200, { status: 'ok', services: [...mounted.keys()] });
      }
      const entry = mounted.get(id);
      if (entry === undefined) return answer(response, 404, { error: 'not_found' });
      if (rest.length === 1 && rest[0] === 'health') {
        if (method !== 'GET' && method !== 'HEAD') return answer(response, 405, { error: 'invalid_request' }, { Allow: 'GET' });
        return answer(response, 200, { status: 'ok', packageId: id, contract: HEALTH_CONTRACT, version: entry.version });
      }

      const header = request.headers['x-authenticated-user'];
      const user = (Array.isArray(header) ? header[0] : header)?.trim();
      // The proxy sets it from an account name; anything longer is not one (S8).
      if (user !== undefined && user.length > MAX_USER_LENGTH) return answer(response, 400, { error: 'invalid_request' });
      const fromHeader = user !== undefined && user !== '';
      const address = request.socket.remoteAddress ?? 'unknown';
      const limitKey = fromHeader ? `user:${user}` : `address:${address}`;
      const result = await entry.service.handle({
        method,
        segments: rest,
        query: parsed.query,
        body: body === '' ? undefined : body,
        limitKey,
        // The name itself is what ADR-0114 Rule 10 hashes (the address when there is none).
        userHash: users.hash(fromHeader ? user : address),
        userSource: fromHeader ? 'header' : 'address'
      });
      return answer(response, result.status, result.body, result.headers);
    } catch (error) {
      log({ level: 'error', event: 'gateway_error', errorName: error?.name });
      if (!response.headersSent) answer(response, 500, { error: 'internal' });
      else response.destroy();
    }
  });
}

/** `node gateway/src/gateway.mjs`: the container's command. */
export async function main(env = process.env) {
  const log = jsonLineLogger();
  const dataDir = resolve(env.PLUGIN_SERVICES_DATA_DIR ?? './.data');
  const aiServiceUrl = env.ARCHISIMPLE_AI_SERVICE_URL ?? 'http://127.0.0.1:4321';
  const port = Number(env.PLUGIN_SERVICES_PORT ?? DEFAULT_PORT);
  const mounted = await mountServices({ env, log, dataDir, aiServiceUrl });
  const server = createGateway({ mounted, env, log });
  server.listen(port, env.PLUGIN_SERVICES_HOST ?? '0.0.0.0', () => {
    log({ level: 'info', event: 'gateway_listening', port, version: GATEWAY_VERSION, services: [...mounted.keys()] });
  });
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return server;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
