/**
 * A règlement, from identifiers to cached text (Sprint 002.5a DEC-2, DEC-4,
 * DEC-5): resolve the document in force, download its PDF, read it in a
 * child process, keep the text, delete the PDF.
 */

import { execFile, execFileSync, fork } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheKey } from './cache.mjs';
import { ServiceError } from './errors.mjs';
import { semaphore } from './fetcher.mjs';

export const MAX_DOCUMENT_PAGES = 2000;
export const PARSE_TIMEOUT_MS = 60_000;
export const PARSE_MAX_OLD_SPACE_MB = 512;
/** The watchdog's ceiling: `--max-old-space-size` does not count ArrayBuffers. */
export const PARSE_MAX_RSS_MB = 1024;
export const PARSES_AT_ONCE = 2;
/** A document's whole text, in UTF-16 code units: 64 Mi characters (Lyon's is about 1.8 M). */
export const MAX_TEXT_CHARS = 64 * 1024 * 1024;

const CHILD = fileURLToPath(new URL('./parse-child.mjs', import.meta.url));
/** `…/node_modules/pdfjs-dist/`: the only code the child reads besides its own. */
const PDFJS_DIR = (() => {
  const entry = fileURLToPath(import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
  return entry.slice(0, entry.lastIndexOf(`${sep}pdfjs-dist${sep}`) + `${sep}pdfjs-dist${sep}`.length);
})();

/**
 * `--allow-fs-read` for a folder, by its real path. The child is handed real
 * paths only: resolving a symbolic link (macOS's tmpdir, into /private) would
 * need to read the link's own parent, which it may not.
 */
function readable(folder) {
  return `--allow-fs-read=${realpathSync(folder)}${sep}`;
}

let pageSize;
/** The kernel's page size, for `/proc/<pid>/statm`; 4096 if `getconf` cannot say. */
function kernelPageSize() {
  if (pageSize === undefined) {
    try {
      pageSize = Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }).trim()) || 4096;
    } catch {
      pageSize = 4096;
    }
  }
  return pageSize;
}

/**
 * The document in force, as 002.0 resolves it: the one entry of
 * `api/document?partition=…&status=document.production` whose `originalName`
 * equals `idurba` case-insensitively, and whose files list `nomfic`.
 *
 * A different `originalName` is `version_changed` — the document changed since
 * the extension read it — never a silent substitute.
 */
export async function resolveDocument(fetcher, { partition, idurba, nomfic }) {
  const documents = await fetcher.listDocuments(partition);
  if (!Array.isArray(documents)) throw new ServiceError('source_unavailable', { reason: 'malformed' });
  const named = documents.filter(
    (d) =>
      typeof d?.originalName === 'string' &&
      typeof d?.id === 'string' &&
      /^[0-9A-Za-z_-]{1,64}$/u.test(d.id) &&
      // A sector's grid lists every sector: only the partition's own are its documents.
      (typeof d.name !== 'string' || d.name.toUpperCase() === partition.toUpperCase())
  );
  const inForce = named.find((d) => d.originalName.toUpperCase() === idurba.toUpperCase());
  if (inForce === undefined) {
    if (named.length > 0) {
      // Answered and logged: only names shaped like an idurba, and a few.
      const inForce = named
        .map((d) => d.originalName)
        .filter((name) => /^[0-9A-Za-z_-]{1,64}$/u.test(name))
        .slice(0, 5);
      throw new ServiceError('version_changed', { inForce });
    }
    throw new ServiceError('not_found', { reason: 'no_document_in_force' });
  }
  const files = await fetcher.listFiles(inForce.id);
  if (!Array.isArray(files)) throw new ServiceError('source_unavailable', { reason: 'malformed' });
  if (!files.some((f) => f?.name === nomfic)) {
    throw new ServiceError('not_found', { reason: 'file_not_listed' });
  }
  return { documentId: inForce.id, idurba: inForce.originalName };
}

/**
 * Resident bytes of a process: `/proc/<pid>/statm` on Linux (the image), else
 * `ps -o rss= -p <pid>` (KiB; macOS while developing). `undefined` when
 * neither can say — the watchdog then does nothing, and the heap limit, the
 * timer and the container's `mem_limit` remain.
 */
export async function residentBytes(pid) {
  try {
    const statm = await readFile(`/proc/${pid}/statm`, 'utf8');
    return Number(statm.split(' ')[1]) * kernelPageSize();
  } catch {
    // Not Linux, or the process is gone.
  }
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 2000 }, (error, stdout) => {
      const kib = Number(String(stdout ?? '').trim());
      resolve(error || !Number.isFinite(kib) || kib <= 0 ? undefined : kib * 1024);
    });
  });
}

/**
 * Reads a PDF in a child process (DEC-2): `--max-old-space-size`, a wall
 * clock with `SIGKILL` at expiry, and a resident-memory watchdog, since a
 * Flate bomb grows memory the heap limit does not count. Whatever kills the
 * child, the answer is `document_unreadable`.
 *
 * The child runs under Node's permission model: it may read only its own
 * folder, pdf.js and the PDF's folder — no write, no child process, no
 * worker, no addon — and it gets no environment but `NODE_ENV`, so nothing of
 * the gateway's (the log key, the AI service's address) reaches pdf.js.
 */
export function createParser({
  timeoutMs = PARSE_TIMEOUT_MS,
  maxOldSpaceMb = PARSE_MAX_OLD_SPACE_MB,
  maxRssMb = PARSE_MAX_RSS_MB,
  maxPages = MAX_DOCUMENT_PAGES,
  maxTextChars = MAX_TEXT_CHARS,
  childPath = CHILD,
  onSpawn
} = {}) {
  const parses = semaphore(PARSES_AT_ONCE);
  return function parse(path) {
    return parses(
      () =>
        new Promise((resolve, reject) => {
          const script = realpathSync(childPath);
          const pdf = realpathSync(path);
          const child = fork(script, [], {
            execArgv: [
              `--max-old-space-size=${maxOldSpaceMb}`,
              '--permission',
              // Each folder once: Node 22.13 aborts on a repeated `--allow-fs-read`.
              ...new Set([dirname(script), PDFJS_DIR, dirname(pdf)].map(readable))
            ],
            env: { NODE_ENV: 'production' },
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            serialization: 'advanced'
          });
          onSpawn?.(child);
          let settled = false;
          const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearInterval(watchdog);
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            fn(value);
          };
          const unreadable = () => finish(reject, new ServiceError('document_unreadable'));
          const timer = setTimeout(unreadable, timeoutMs);
          const watchdog = setInterval(async () => {
            const bytes = await residentBytes(child.pid);
            if (bytes !== undefined && bytes > maxRssMb * 1024 * 1024) unreadable();
          }, 250);
          child.once('message', (answer) => {
            if (answer?.ok === true) finish(resolve, answer);
            else if (answer?.code === 'document_too_large') {
              finish(reject, new ServiceError('document_too_large', { limitPages: maxPages, limitTextChars: maxTextChars }));
            } else unreadable();
          });
          child.once('error', unreadable);
          child.once('exit', unreadable);
          child.send({ path: pdf, maxPages, maxTextChars });
        })
    );
  };
}

/**
 * The cached text of a règlement, fetching it on a miss. One fetch in flight
 * per key: a second request joins it and costs nothing against the limits.
 *
 * @param {{ fetcher, parse: (path: string) => Promise<{ pageCount, outline, pages }>, cache, now?: () => Date }} options
 */
export function createDocumentStore({ fetcher, parse, cache, now = () => new Date() }) {
  const inFlight = new Map();

  async function fetchAndRead(key, request) {
    const resolved = await resolveDocument(fetcher, request);
    const download = await fetcher.downloadPdf({
      partition: request.partition,
      documentId: resolved.documentId,
      nomfic: request.nomfic
    });
    let parsed;
    try {
      parsed = await parse(download.path);
    } finally {
      // The PDF is deleted once read; the text is what is kept.
      await unlink(download.path).catch(() => {});
    }
    const meta = {
      documentId: resolved.documentId,
      partition: request.partition,
      idurba: resolved.idurba,
      nomfic: request.nomfic,
      sha256: download.sha256,
      bytes: download.bytes,
      pages: parsed.pageCount,
      retrievedAt: now().toISOString(),
      etag: download.etag
    };
    await cache.write(key, { meta, outline: parsed.outline, pages: parsed.pages });
    return { document: { meta, outline: parsed.outline, pages: parsed.pages }, bytes: download.bytes };
  }

  return {
    /**
     * @param {{ partition: string, idurba: string, nomfic: string }} request
     * @param {{ beforeFetch?: () => void }} hooks `beforeFetch` runs only when
     *   this request starts a fetch — never on a hit or a join — and may throw
     *   (`rate_limited`) to refuse it.
     * @returns {Promise<{ document, cache: 'hit' | 'miss' | 'joined', bytes: number }>}
     */
    async get(request, hooks = {}) {
      const key = cacheKey(request.idurba, request.nomfic);
      const cached = await cache.read(key);
      if (cached !== undefined) return { document: cached, cache: 'hit', bytes: 0 };
      const running = inFlight.get(key);
      if (running !== undefined) {
        const { document } = await running;
        return { document, cache: 'joined', bytes: 0 };
      }
      hooks.beforeFetch?.();
      const started = fetchAndRead(key, request);
      inFlight.set(key, started);
      try {
        const { document, bytes } = await started;
        return { document, cache: 'miss', bytes };
      } finally {
        inFlight.delete(key);
      }
    }
  };
}
