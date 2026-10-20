/**
 * The document cache, by version (Sprint 002.5a DEC-5), and since 002.5b the
 * extraction results beside it, under one byte budget (002.5b DEC-3).
 *
 * One entry per règlement version, under
 * `${PLUGIN_SERVICES_DATA_DIR}/com.archisimple.fr-urban-rules/documents/<key>/`:
 *
 * - `meta.json` — `documentId`, `partition`, `idurba` as the GPU spells it,
 *   `nomfic`, `sha256`, `pages`, `retrievedAt`, `etag`;
 * - `outline.json`;
 * - `pages.jsonl` — one line per page, `{ page, text }`.
 *
 * The PDF itself is never kept: its text is what is reused, about a tenth of
 * the bytes. A GPU version is a new `idurba`, so an entry never goes stale.
 * The cache holds public documents only — never a user's name, a project or
 * a decision.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_CACHE_MAX_BYTES = 2 * 1024 ** 3;

/**
 * `sha1(upper(idurba) + '/' + nomfic)`. Upper-cased because the resolver
 * matches `idurba` case-insensitively: `PLUi` and `PLUI` are one document.
 */
export function cacheKey(idurba, nomfic) {
  return createHash('sha1').update(`${idurba.toUpperCase()}/${nomfic}`).digest('hex');
}

async function sizeOf(dir) {
  let total = 0;
  for (const name of await readdir(dir)) total += (await stat(join(dir, name))).size;
  return total;
}

/**
 * The service's caches, one byte budget (002.5a DEC-5, 002.5b DEC-3): each
 * namespace is a folder of entries, each entry a folder whose `meta.json`'s
 * time is its last access; past `maxBytes` the least recently read entry of
 * **any** namespace goes. Writes are staged, then renamed into place.
 *
 * @param {{ dirs: Record<string, string>, maxBytes?: number, now?: () => Date }} options
 * @returns {Promise<Record<string, Namespace>>}
 */
export async function openCaches({ dirs, maxBytes = DEFAULT_CACHE_MAX_BYTES, now = () => new Date() }) {
  /** `${namespace}/${key}` → { dir, key, bytes, lastAccess } */
  const index = new Map();
  for (const [namespace, dir] of Object.entries(dirs)) {
    await mkdir(dir, { recursive: true });
    for (const name of await readdir(dir)) {
      const entry = join(dir, name);
      if (name.startsWith('.')) {
        // A write that never finished renaming: never an entry.
        await rm(entry, { recursive: true, force: true });
        continue;
      }
      try {
        const meta = await stat(join(entry, 'meta.json'));
        index.set(`${namespace}/${name}`, { dir, key: name, bytes: await sizeOf(entry), lastAccess: meta.mtimeMs });
      } catch {
        await rm(entry, { recursive: true, force: true });
      }
    }
  }

  async function evict() {
    let total = [...index.values()].reduce((sum, r) => sum + r.bytes, 0);
    const oldest = [...index.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (const [id, record] of oldest) {
      if (total <= maxBytes) break;
      index.delete(id);
      total -= record.bytes;
      await rm(join(record.dir, record.key), { recursive: true, force: true });
    }
  }

  function namespace(name, dir) {
    const id = (key) => `${name}/${key}`;
    async function touch(key) {
      const at = now();
      const record = index.get(id(key));
      if (record !== undefined) record.lastAccess = at.getTime();
      await utimes(join(dir, key, 'meta.json'), at, at).catch(() => {});
    }
    return {
      has: (key) => index.has(id(key)),
      /** `{ <file>: text }` for an entry, `undefined` on a miss; a damaged entry is a miss and goes. */
      async readFiles(key, files) {
        if (!index.has(id(key))) return undefined;
        // Twice: a read that meets a write's swap (below) finds the folder
        // missing for an instant; only a second failure is damage.
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const out = {};
            for (const file of files) out[file] = await readFile(join(dir, key, file), 'utf8');
            await touch(key);
            return out;
          } catch {
            if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
        index.delete(id(key));
        await rm(join(dir, key), { recursive: true, force: true });
        return undefined;
      },
      /** `files` is `{ <name>: text }` and must hold `meta.json`. */
      async writeFiles(key, files) {
        const staging = join(dir, `.staging-${randomUUID()}`);
        await mkdir(staging);
        for (const [file, text] of Object.entries(files)) await writeFile(join(staging, file), text);
        const bytes = await sizeOf(staging);
        const target = join(dir, key);
        // Swap: the old entry is renamed aside (a dot name, so a restart
        // removes it), the new one renamed in, the old one removed.
        const aside = join(dir, `.old-${randomUUID()}`);
        await rename(target, aside).catch(() => {});
        await rename(staging, target);
        await rm(aside, { recursive: true, force: true });
        index.set(id(key), { dir, key, bytes, lastAccess: now().getTime() });
        await evict();
      },
      keys: () => [...index.values()].filter((r) => r.dir === dir).map((r) => r.key)
    };
  }

  const out = {};
  for (const [name, dir] of Object.entries(dirs)) out[name] = namespace(name, dir);
  out.totalBytes = () => [...index.values()].reduce((sum, r) => sum + r.bytes, 0);
  return out;
}

/** The document namespace's reader and writer: `{ meta, outline, pages }`. */
export function documentCache(store, totalBytes = () => 0) {
  return {
    has: store.has,
    keys: store.keys,
    totalBytes,
    /** `pages[i]` being PDF page `i + 1`; `undefined` on a miss. */
    async read(key) {
      const files = await store.readFiles(key, ['meta.json', 'outline.json', 'pages.jsonl']);
      if (files === undefined) return undefined;
      const meta = JSON.parse(files['meta.json']);
      const pages = Array(meta.pages).fill('');
      for (const line of files['pages.jsonl'].split('\n')) {
        if (line === '') continue;
        const { page, text } = JSON.parse(line);
        pages[page - 1] = text;
      }
      return { meta, outline: JSON.parse(files['outline.json']), pages };
    },
    write(key, { meta, outline, pages }) {
      return store.writeFiles(key, {
        'meta.json': JSON.stringify(meta),
        'outline.json': JSON.stringify(outline),
        'pages.jsonl': pages.map((text, i) => JSON.stringify({ page: i + 1, text })).join('\n')
      });
    }
  };
}

/** The extraction namespace: one `meta.json`, the result itself. */
export function resultCache(store) {
  return {
    has: store.has,
    async read(key) {
      const files = await store.readFiles(key, ['meta.json']);
      return files === undefined ? undefined : JSON.parse(files['meta.json']);
    },
    write: (key, result) => store.writeFiles(key, { 'meta.json': JSON.stringify(result) })
  };
}

/** One document cache alone (002.5a's tests). */
export async function openDocumentCache({ dir, maxBytes = DEFAULT_CACHE_MAX_BYTES, now = () => new Date() }) {
  const caches = await openCaches({ dirs: { documents: dir }, maxBytes, now });
  return documentCache(caches.documents, caches.totalBytes);
}
