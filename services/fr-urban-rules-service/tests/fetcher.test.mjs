/**
 * Fetching (DEC-4) and resolving (DEC-4, 002.0's resolution), against a local
 * HTTP stub and stubbed name resolution. No network.
 *
 * The stub speaks plain HTTP: the fetcher is handed `http.request` and a port,
 * so what is tested is everything above TLS — the templates, the address
 * check, the redirects, the streamed cap. `https:` is what production passes
 * (`https.request` by default, and every redirect must be `https:`).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { resolveDocument } from '../src/document.mjs';
import { ServiceError } from '../src/errors.mjs';
import {
  API_HOST,
  FILES_HOST,
  createFetcher,
  documentsUrl,
  guardedLookup,
  isRefusedAddress
} from '../src/fetcher.mjs';
import { loadGpu } from './helpers.mjs';

// The stub ------------------------------------------------------------------------

let route = () => ({ status: 404 });
const seen = [];
const server = http.createServer((req, res) => {
  seen.push({ host: req.headers.host, url: req.url, agent: req.headers['user-agent'] });
  const answer = route(req);
  if (answer.stream !== undefined) return answer.stream(res);
  res.writeHead(answer.status, answer.headers ?? {});
  res.end(answer.body ?? '');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
after(() => server.close());

/** Unguarded on purpose: the stub lives on loopback, which the guard refuses. */
const toStub = (hostname, options, callback) => {
  if (typeof options === 'function') callback = options;
  lookedUp.push(hostname);
  if (options?.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
  else callback(null, '127.0.0.1', 4);
};
const lookedUp = [];

function fetcher(extra = {}) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'fr-urban-rules-fetch-'));
  return {
    tmpDir,
    fetcher: createFetcher({ version: '0.1.0', tmpDir, request: http.request, port, lookup: toStub, ...extra })
  };
}

function reset(handler) {
  seen.length = 0;
  lookedUp.length = 0;
  route = handler;
}

const pdfPath = '/annexes/gpu/documents/DU_84050/doc1/84050_reglement.pdf';
const request = { partition: 'DU_84050', documentId: 'doc1', nomfic: '84050_reglement.pdf' };
const isCode = (code) => (e) => e instanceof ServiceError && e.code === code;

// Addresses ------------------------------------------------------------------------

test('refused addresses: loopback, private, link-local, CGNAT, multicast, IPv6 local', () => {
  for (const a of ['127.0.0.1', '127.8.9.10', '10.0.0.1', '172.16.5.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '224.0.0.1', '0.0.0.0', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '::7f00:1', '::a00:1', '2002:7f00:1::1', '2002:808:808::1', '2001:0:4136:e378::1', '64:ff9b:1::a00:1']) {
    assert.equal(isRefusedAddress(a), true, a);
  }
  for (const a of ['145.239.193.231', '8.8.8.8', '2a01:4f8::1', '64:ff9b::808:808']) {
    assert.equal(isRefusedAddress(a), false, a);
  }
});

function fakeResolver(addresses) {
  const calls = [];
  const base = (hostname, options, callback) => {
    calls.push(options);
    callback(null, addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
  };
  return { base, calls };
}

for (const bad of ['127.0.0.1', '10.0.0.1', '169.254.0.1', '::1', 'fc00::1']) {
  test(`the lookup refuses ${bad}, in the single-address form and the {all: true} form`, async () => {
    const { base } = fakeResolver([bad]);
    const lookup = guardedLookup(base);
    const single = await new Promise((resolve) => lookup(API_HOST, {}, (error, address) => resolve({ error, address })));
    assert.equal(single.error?.code, 'EADDRREFUSED');
    assert.equal(single.address, undefined);
    const all = await new Promise((resolve) => lookup(API_HOST, { all: true }, (error, list) => resolve({ error, list })));
    assert.equal(all.error?.code, 'EADDRREFUSED');
    assert.equal(all.list, undefined);
  });
}

test('one refused address among good ones refuses the name, in both forms', async () => {
  const { base, calls } = fakeResolver(['145.239.193.231', '10.0.0.7', '2a01:4f8::1']);
  const lookup = guardedLookup(base);
  for (const options of [{}, { all: true }, 4]) {
    const error = await new Promise((resolve) => lookup(API_HOST, options, (e) => resolve(e)));
    assert.equal(error?.code, 'EADDRREFUSED', JSON.stringify(options));
  }
  assert.ok(calls.every((c) => c.all === true), 'always resolved in full');
});

test('good addresses are answered in the form asked for', async () => {
  const { base } = fakeResolver(['145.239.193.231', '2a01:4f8::1']);
  const lookup = guardedLookup(base);
  const single = await new Promise((resolve) => lookup(API_HOST, {}, (e, address, family) => resolve({ e, address, family })));
  assert.deepEqual(single, { e: null, address: '145.239.193.231', family: 4 });
  const all = await new Promise((resolve) => lookup(API_HOST, { all: true }, (e, list) => resolve(list)));
  assert.deepEqual(all, [
    { address: '145.239.193.231', family: 4 },
    { address: '2a01:4f8::1', family: 6 }
  ]);
});

test('through the fetcher, a refused address is source_refused and no byte is sent', async () => {
  reset(() => ({ status: 200, body: '[]' }));
  for (const addresses of [['127.0.0.1'], ['145.239.193.231', '10.1.1.1']]) {
    const { base } = fakeResolver(addresses);
    const { fetcher: f } = fetcher({ lookup: guardedLookup(base) });
    await assert.rejects(f.listDocuments('DU_84050'), isCode('source_refused'));
  }
  assert.equal(seen.length, 0, 'the stub was never reached');
});

// Templates and resolution ------------------------------------------------------------

test('the resolver asks for the documents in production and matches idurba case-insensitively', async () => {
  const gpu = loadGpu('lyon');
  reset((req) => {
    if (req.url === '/api/document?partition=DU_200046977&status=document.production') {
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gpu.documents) };
    }
    if (req.url === '/api/document/4f3ddc27a9611b4bc94fa161443b8e86/files') {
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gpu.files) };
    }
    return { status: 404 };
  });
  const { fetcher: f } = fetcher();
  const resolved = await resolveDocument(f, {
    partition: 'DU_200046977',
    idurba: '200046977_PLUI_20260326',
    nomfic: '200046977_reglement_20260326.pdf'
  });
  assert.deepEqual(resolved, { documentId: '4f3ddc27a9611b4bc94fa161443b8e86', idurba: '200046977_PLUi_20260326' });
  assert.equal(
    documentsUrl('DU_200046977'),
    'https://www.geoportail-urbanisme.gouv.fr/api/document?partition=DU_200046977&status=document.production'
  );
  assert.deepEqual(lookedUp, [API_HOST, API_HOST]);
  assert.match(seen[0].agent, /^ArchiSimple-fr-urban-rules-service\/0\.1\.0$/u);

  await assert.rejects(
    resolveDocument(f, { partition: 'DU_200046977', idurba: '200046977_PLUi_20250101', nomfic: '200046977_reglement_20260326.pdf' }),
    (e) => isCode('version_changed')(e) && e.status === 409 && e.details.inForce[0] === '200046977_PLUi_20260326'
  );
  await assert.rejects(
    resolveDocument(f, { partition: 'DU_200046977', idurba: '200046977_PLUi_20260326', nomfic: 'absent.pdf' }),
    isCode('not_found')
  );
});

test('a sector partition is asked by its grid, and only its own entries are its documents', async () => {
  // The answer of api/document?grid=200054807&status=document.production on
  // 2026-10-20, trimmed: `partition=DU_200054807_B` is refused with a 400.
  const grid = [
    { id: '246ea52e6724dbf5bb5b106c74e2934f', name: 'DU_200054807_D', originalName: '200054807_PLUi_20251215_D' },
    { id: '3d0841039550457a0a87bb57879cdab4', name: 'DU_200054807_A', originalName: '200054807_PLUi_20260803_A' },
    { id: 'e8f6b5b1a8c6ca2e5caec8cd5334d2f3', name: 'DU_200054807_B', originalName: '200054807_PLUi_20260306_B' }
  ];
  reset((req) => {
    if (req.url === '/api/document?grid=200054807&status=document.production') {
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(grid) };
    }
    if (req.url === '/api/document/e8f6b5b1a8c6ca2e5caec8cd5334d2f3/files') {
      const files = [{ name: '200054807_reglement_20260306_B.pdf', title: 'Règlement écrit' }];
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(files) };
    }
    return { status: 400 };
  });
  assert.equal(
    documentsUrl('DU_200054807_B'),
    'https://www.geoportail-urbanisme.gouv.fr/api/document?grid=200054807&status=document.production'
  );
  const { fetcher: f } = fetcher();
  const resolved = await resolveDocument(f, {
    partition: 'DU_200054807_B',
    idurba: '200054807_PLUi_20260306_B',
    nomfic: '200054807_reglement_20260306_B.pdf'
  });
  assert.deepEqual(resolved, { documentId: 'e8f6b5b1a8c6ca2e5caec8cd5334d2f3', idurba: '200054807_PLUi_20260306_B' });
  // Another sector's document is never this one's "in force".
  await assert.rejects(
    resolveDocument(f, { partition: 'DU_200054807_B', idurba: '200054807_PLUi_20260803_A', nomfic: 'x.pdf' }),
    (e) => isCode('version_changed')(e) && e.details.inForce.length === 1 && e.details.inForce[0] === '200054807_PLUi_20260306_B'
  );
});

test('upstream status: 5xx is source_unavailable, 4xx source_refused, bad JSON source_unavailable', async () => {
  const { fetcher: f } = fetcher();
  reset(() => ({ status: 503 }));
  await assert.rejects(f.listDocuments('DU_84050'), isCode('source_unavailable'));
  reset(() => ({ status: 403 }));
  await assert.rejects(f.listDocuments('DU_84050'), isCode('source_refused'));
  reset(() => ({ status: 200, body: '<html>' }));
  await assert.rejects(f.listDocuments('DU_84050'), isCode('source_unavailable'));
});

test('an API call past its timeout is source_unavailable', async () => {
  const { fetcher: f } = fetcher({ apiTimeoutMs: 100 });
  reset(() => ({ stream: () => {} }));
  await assert.rejects(f.listDocuments('DU_84050'), isCode('source_unavailable'));
});

// Redirects -------------------------------------------------------------------------------

const redirect = (location) => ({ status: 302, headers: { Location: location } });

test('the PDF: the 302 to data.geopf.fr is followed and the file streamed with its SHA-256', async () => {
  const body = Buffer.from('%PDF-1.7\nhello\n');
  reset((req) =>
    req.url.startsWith('/api/')
      ? redirect(`https://${FILES_HOST}${pdfPath}`)
      : { status: 200, headers: { 'Content-Type': 'application/pdf', ETag: '"e1"' }, body }
  );
  const { fetcher: f } = fetcher();
  const got = await f.downloadPdf(request);
  assert.equal(got.bytes, body.length);
  assert.equal(got.etag, '"e1"');
  assert.deepEqual(readFileSync(got.path), body);
  assert.match(got.sha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(lookedUp, [API_HOST, FILES_HOST]);
  assert.deepEqual(seen.map((s) => s.url), ['/api/document/doc1/files/84050_reglement.pdf', pdfPath]);
});

for (const [name, location] of [
  ['another host', 'https://evil.example/annexes/gpu/documents/DU_84050/doc1/x.pdf'],
  ['plain http', `http://${FILES_HOST}${pdfPath}`],
  ['an explicit port', `https://${FILES_HOST}:8443${pdfPath}`],
  ['another partition', `https://${FILES_HOST}/annexes/gpu/documents/DU_99999/doc1/x.pdf`],
  ['another document', `https://${FILES_HOST}/annexes/gpu/documents/DU_84050/doc2/x.pdf`],
  ['outside the annexes', `https://${FILES_HOST}/other/DU_84050/doc1/x.pdf`],
  ['a dot-dot escape', `https://${FILES_HOST}/annexes/gpu/documents/DU_84050/doc1/../../../../x`]
]) {
  test(`a PDF redirect to ${name} is refused before it is followed`, async () => {
    reset(() => redirect(location));
    const { fetcher: f, tmpDir } = fetcher();
    await assert.rejects(f.downloadPdf(request), isCode('source_refused'));
    assert.equal(seen.length, 1, 'only the first hop was requested');
    assert.deepEqual(lookedUp, [API_HOST]);
    assert.deepEqual(readdirSync(tmpDir), []);
  });
}

test('an API redirect off the two hosts is refused', async () => {
  reset(() => redirect('https://metadata.internal/latest'));
  const { fetcher: f } = fetcher();
  await assert.rejects(f.listDocuments('DU_84050'), isCode('source_refused'));
  assert.equal(seen.length, 1);
});

test('three redirects are followed; a fourth is refused and not requested', async () => {
  reset(() => redirect(`https://${API_HOST}/api/document?partition=DU_84050&status=document.production`));
  const { fetcher: f } = fetcher();
  await assert.rejects(f.listDocuments('DU_84050'), (e) => isCode('source_refused')(e) && e.details.reason === 'too_many_redirects');
  assert.equal(seen.length, 4, 'the first request and three redirects');
});

// The download's checks ---------------------------------------------------------------------

test('a PDF of 32 MiB + 1 byte, with no Content-Length, is cut: document_too_large', async () => {
  const limit = 32 * 1024 * 1024;
  let sent = 0;
  reset(() => ({
    stream: (res) => {
      res.writeHead(200, { 'Content-Type': 'application/pdf' }); // chunked: no Content-Length
      const chunk = Buffer.alloc(1024 * 1024, 0x20);
      chunk.write('%PDF-', 0, 'latin1');
      const more = () => {
        while (sent <= limit) {
          const piece = sent + chunk.length > limit + 1 ? chunk.subarray(0, limit + 1 - sent) : chunk;
          sent += piece.length;
          if (piece.length === 0 || !res.write(piece)) break;
          if (sent === limit + 1) break;
        }
        if (sent >= limit + 1) res.end();
        else res.once('drain', more);
      };
      more();
    }
  }));
  const { fetcher: f, tmpDir } = fetcher();
  await assert.rejects(f.downloadPdf(request), (e) => isCode('document_too_large')(e) && e.status === 422);
  assert.deepEqual(readdirSync(tmpDir), [], 'the partial file is deleted');
});

test('a temporary file that cannot be opened fails cleanly: the response is closed and nothing is left', async () => {
  let closed = false;
  reset(() => ({
    stream: (res) => {
      res.on('close', () => (closed = true));
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.write('%PDF-1.7\n');
    }
  }));
  const f = createFetcher({
    version: '0.1.0',
    tmpDir: join(tmpdir(), `absent-${Date.now()}`, 'nested'),
    request: http.request,
    port,
    lookup: toStub
  });
  await assert.rejects(f.downloadPdf(request), (e) => e instanceof ServiceError);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(closed, true, 'the upstream response was destroyed, not left streaming');
});

test('a body not starting %PDF- is not_a_pdf', async () => {
  reset(() => ({ status: 200, headers: { 'Content-Type': 'text/html' }, body: '<!doctype html><p>maintenance' }));
  const { fetcher: f, tmpDir } = fetcher();
  await assert.rejects(f.downloadPdf(request), isCode('not_a_pdf'));
  reset(() => ({ status: 200, body: '%PD' }));
  await assert.rejects(f.downloadPdf(request), isCode('not_a_pdf'));
  assert.deepEqual(readdirSync(tmpDir), []);
});
