/**
 * Fetching (Sprint 002.5a DEC-4): two hosts, and nothing a client names.
 *
 * Every URL is built here from a template and an identifier already checked
 * by pattern; no URL ever comes from a request. A request goes over `https:`
 * with `node:https` and a `lookup` that refuses loopback, private, link-local,
 * CGNAT, multicast and reserved addresses — every address a name resolves to,
 * in both of the forms Node calls a lookup with. Redirects are followed by
 * hand, at most three, each checked before it is followed. The deployment does
 * not filter egress (ADR-0114 Rule 8): this file is the allow-list.
 */

import { createHash, randomUUID } from 'node:crypto';
import dns from 'node:dns';
import { open, unlink } from 'node:fs/promises';
import https from 'node:https';
import net from 'node:net';
import { join } from 'node:path';
import { ServiceError } from './errors.mjs';

export const API_HOST = 'www.geoportail-urbanisme.gouv.fr';
export const FILES_HOST = 'data.geopf.fr';
const ALLOWED_HOSTS = new Set([API_HOST, FILES_HOST]);

export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
export const API_TIMEOUT_MS = 10_000;
export const PDF_TIMEOUT_MS = 120_000;
export const DOWNLOADS_AT_ONCE = 2;

// Addresses ------------------------------------------------------------------

// Two lists, not one: a BlockList matches an IPv4 address against an IPv6
// subnet as its mapped form, so `::ffff:0:0/96` in a shared list would refuse
// every IPv4 address.
const refusedV4 = new net.BlockList();
const refusedV6 = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved, and the broadcast address
]) {
  refusedV4.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::', 96], // IPv4-compatible (deprecated)
  ['::ffff:0:0', 96], // IPv4-mapped: refused whole rather than unwrapped
  ['64:ff9b:1::', 48], // local-use NAT64
  ['2001::', 32], // Teredo: tunnels to an IPv4 address
  ['2002::', 16], // 6to4: likewise
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8] // multicast
]) {
  refusedV6.addSubnet(network, prefix, 'ipv6');
}

/** Expands an IPv6 address to its sixteen bytes, or `undefined`. */
function ipv6Bytes(address) {
  let text = address.split('%')[0];
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/u.exec(text);
  if (v4 !== null) {
    const [a, b, c, d] = v4[1].split('.').map(Number);
    text = text.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.includes('::') ? text.split('::') : [text, undefined];
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const fill = tail === undefined ? 0 : 8 - left.length - right.length;
  const groups = [...left, ...Array(fill).fill('0'), ...right];
  if (groups.length !== 8) return undefined;
  return groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [(n >> 8) & 0xff, n & 0xff];
  });
}

/** True for an address this service must never connect to. */
export function isRefusedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return refusedV4.check(address, 'ipv4');
  if (family !== 6) return true;
  if (refusedV6.check(address, 'ipv6')) return true;
  // NAT64 (64:ff9b::/96) carries an IPv4 address: judge that one.
  const bytes = ipv6Bytes(address);
  if (bytes === undefined) return true;
  const nat64 = [0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0];
  if (nat64.every((b, i) => bytes[i] === b)) {
    return refusedV4.check(bytes.slice(12).join('.'), 'ipv4');
  }
  return false;
}

/**
 * A `lookup` for `node:https` that refuses a name when **any** of its
 * addresses is refused.
 *
 * Node calls a lookup two ways: `(host, { all: true }, cb)`, which expects an
 * array — what Node 22 does by default, through `autoSelectFamily` — and
 * `(host, opts, cb)`, which expects one `(address, family)`. Both are answered
 * here, and both from the same full resolution, so neither form can be handed
 * an address the other would have refused.
 */
export function guardedLookup(baseLookup = dns.lookup) {
  return function lookup(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (typeof options === 'number') {
      options = { family: options };
    }
    const wantsAll = options?.all === true;
    baseLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error);
      const list = (Array.isArray(addresses) ? addresses : [{ address: addresses }]).map((a) =>
        typeof a === 'string' ? { address: a, family: net.isIP(a) } : { address: a.address, family: a.family ?? net.isIP(a.address) }
      );
      if (list.length === 0) {
        const none = new Error(`no address for ${hostname}`);
        none.code = 'ENOTFOUND';
        return callback(none);
      }
      if (list.some((a) => isRefusedAddress(a.address))) {
        const blocked = new Error(`refused address for ${hostname}`);
        blocked.code = 'EADDRREFUSED';
        return callback(blocked);
      }
      if (wantsAll) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

// URLs -----------------------------------------------------------------------

/**
 * An EPCI's PLUi in sectors, `DU_<siren>_<sector>`: the document API refuses it
 * as a `partition` (HTTP 400, probed 2026-10-20 on DU_200054807_B) and lists it
 * under the EPCI's `grid`, beside the other sectors — `resolveDocument` keeps
 * the partition's own entries.
 */
const SECTOR_PARTITION = /^DU_([0-9]{9})_([0-9A-Z]{1,4})$/u;

export function documentsUrl(partition) {
  const sector = SECTOR_PARTITION.exec(partition);
  return sector === null
    ? `https://${API_HOST}/api/document?partition=${encodeURIComponent(partition)}&status=document.production`
    : `https://${API_HOST}/api/document?grid=${sector[1]}&status=document.production`;
}
export function filesUrl(documentId) {
  return `https://${API_HOST}/api/document/${encodeURIComponent(documentId)}/files`;
}
export function fileUrl(documentId, nomfic) {
  return `${filesUrl(documentId)}/${encodeURIComponent(nomfic)}`;
}
function pdfPrefix(partition, documentId) {
  return `/annexes/gpu/documents/${encodeURIComponent(partition)}/${encodeURIComponent(documentId)}/`;
}

/**
 * Whether a redirect's target may be followed: `https:`, no explicit port, on
 * one of the two hosts; for the PDF, under its own partition and document.
 */
export function redirectAllowed(target, kind) {
  if (target.protocol !== 'https:' || target.port !== '' || target.username !== '' || target.password !== '') {
    return false;
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) return false;
  if (kind.type === 'pdf') {
    return target.hostname === FILES_HOST && target.pathname.startsWith(pdfPrefix(kind.partition, kind.documentId));
  }
  return true;
}

// Requests -------------------------------------------------------------------

/** At most `size` tasks at once; a finishing task hands its slot to the next directly. */
export function semaphore(size) {
  let running = 0;
  const waiting = [];
  return async function run(task) {
    if (running >= size) await new Promise((resolve) => waiting.push(resolve));
    else running += 1;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next !== undefined) next();
      else running -= 1;
    }
  };
}

function failureOf(error) {
  if (error instanceof ServiceError) return error;
  if (error?.code === 'EADDRREFUSED') return new ServiceError('source_refused', { reason: 'address_refused' });
  if (error?.code === 'ETIMEOUT') return new ServiceError('source_unavailable', { reason: 'timeout' });
  return new ServiceError('source_unavailable', { reason: 'network' });
}

/**
 * @param {{
 *   version: string,
 *   lookup?: Function,       the guarded lookup by default; tests pass a stub resolver through `guardedLookup`
 *   request?: Function,      `https.request` by default; tests pass `http.request` against a local stub
 *   port?: number,           tests only: every host is reached on this port
 *   tmpDir: string,          where a download is written while it streams
 *   maxBytes?: number, apiTimeoutMs?: number, pdfTimeoutMs?: number
 * }} options
 */
export function createFetcher(options) {
  const lookup = options.lookup ?? guardedLookup();
  const request = options.request ?? https.request;
  const maxBytes = options.maxBytes ?? MAX_DOCUMENT_BYTES;
  const apiTimeoutMs = options.apiTimeoutMs ?? API_TIMEOUT_MS;
  const pdfTimeoutMs = options.pdfTimeoutMs ?? PDF_TIMEOUT_MS;
  const userAgent = `ArchiSimple-fr-urban-rules-service/${options.version}`;
  const downloads = semaphore(DOWNLOADS_AT_ONCE);

  /** One hop: resolves with the response, headers read and body untouched. */
  function hop(url, accept, signal) {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          protocol: options.request === undefined ? 'https:' : undefined,
          hostname: url.hostname,
          servername: url.hostname,
          port: options.port ?? 443,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers: { 'User-Agent': userAgent, Accept: accept },
          lookup,
          // A fresh connection per request: every one passes the lookup, and
          // none rides a pooled socket opened for another.
          agent: false,
          signal
        },
        resolve
      );
      req.on('error', reject);
      req.end();
    });
  }

  /** Follows up to three redirects, each checked; answers a 2xx response. */
  async function send(start, kind, accept, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const stop = () => clearTimeout(timer);
    let url = new URL(start);
    try {
      for (let redirects = 0; ; redirects += 1) {
        let response;
        try {
          response = await hop(url, accept, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
          throw error;
        }
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.destroy();
          if (redirects >= MAX_REDIRECTS) {
            throw new ServiceError('source_refused', { reason: 'too_many_redirects' });
          }
          let target;
          try {
            target = new URL(String(response.headers.location ?? ''), url);
          } catch {
            throw new ServiceError('source_refused', { reason: 'redirect_refused' });
          }
          if (!redirectAllowed(target, kind)) {
            throw new ServiceError('source_refused', { reason: 'redirect_refused', host: target.hostname });
          }
          url = target;
          continue;
        }
        if (status >= 500) {
          response.destroy();
          throw new ServiceError('source_unavailable', { status });
        }
        if (status < 200 || status >= 300) {
          response.destroy();
          throw new ServiceError('source_refused', { status });
        }
        return { response, controller, stop };
      }
    } catch (error) {
      stop();
      throw failureOf(error);
    }
  }

  async function getJson(url) {
    const { response, controller, stop } = await send(url, { type: 'api' }, 'application/json', apiTimeoutMs);
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of response) {
        size += chunk.length;
        if (size > MAX_JSON_BYTES) {
          response.destroy();
          throw new ServiceError('source_unavailable', { reason: 'answer_too_large' });
        }
        chunks.push(chunk);
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new ServiceError('source_unavailable', { reason: 'malformed' });
      }
    } catch (error) {
      if (controller.signal.aborted) throw new ServiceError('source_unavailable', { reason: 'timeout' });
      throw failureOf(error);
    } finally {
      stop();
    }
  }

  /**
   * Streams the règlement to a temporary file: counted byte by byte and cut
   * at 32 MiB (the host sends no `Content-Length`), its first five bytes
   * `%PDF-`, its SHA-256 computed on the way.
   */
  function downloadPdf({ partition, documentId, nomfic }) {
    return downloads(async () => {
      const kind = { type: 'pdf', partition, documentId };
      const { response, controller, stop } = await send(
        fileUrl(documentId, nomfic),
        kind,
        'application/pdf',
        pdfTimeoutMs
      );
      const path = join(options.tmpDir, `download-${randomUUID()}.pdf`);
      const hash = createHash('sha256');
      let bytes = 0;
      let head = Buffer.alloc(0);
      let file;
      try {
        file = await open(path, 'wx');
        for await (const chunk of response) {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            response.destroy();
            throw new ServiceError('document_too_large', { limitBytes: maxBytes });
          }
          if (head.length < 5) {
            head = Buffer.concat([head, chunk]).subarray(0, 5);
            if (head.length === 5 && head.toString('latin1') !== '%PDF-') {
              response.destroy();
              throw new ServiceError('not_a_pdf');
            }
          }
          hash.update(chunk);
          await file.write(chunk);
        }
        if (head.toString('latin1') !== '%PDF-') throw new ServiceError('not_a_pdf');
        await file.close();
        const etag = response.headers.etag;
        return { path, bytes, sha256: hash.digest('hex'), etag: typeof etag === 'string' ? etag : undefined };
      } catch (error) {
        response.destroy();
        if (file !== undefined) {
          await file.close().catch(() => {});
          await unlink(path).catch(() => {});
        }
        if (controller.signal.aborted && !(error instanceof ServiceError)) {
          throw new ServiceError('source_unavailable', { reason: 'timeout' });
        }
        throw failureOf(error);
      } finally {
        stop();
      }
    });
  }

  return {
    listDocuments: (partition) => getJson(documentsUrl(partition)),
    listFiles: (documentId) => getJson(filesUrl(documentId)),
    downloadPdf
  };
}
