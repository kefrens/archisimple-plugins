/**
 * Shared by the tests and by `scripts/capture.mjs`: how a request URL names its
 * recorded answer, and the two stand-ins a read needs — a `fetch` serving the
 * recordings and a Site service answering only from the platform's recorded
 * conversions.
 *
 * Not a test file (`node --test` picks `*.test.mjs` only).
 */

import { readFile, readdir } from 'node:fs/promises';

/** Outside the package on purpose: the package builder has no exclude list (review 2026-10-20). */
export const FIXTURES = new URL('../../test-fixtures/fr-urban-rules/', import.meta.url);
export const PLOTS = ['lyon', 'gordes', 'brouennes', 'mouzay', 'rochefort'];

/**
 * The fixture a URL is recorded under. One name per endpoint, plus the code
 * for the Géorisques reads that take one (radon may be asked twice).
 */
export function fixtureName(url) {
  const parsed = new URL(url);
  if (parsed.hostname === 'apicarto.ign.fr') {
    const category = parsed.searchParams.get('categorie');
    return `apicarto-${parsed.pathname.split('/').pop()}${category === null ? '' : `-${category}`}`;
  }
  if (parsed.hostname === 'www.geoportail-urbanisme.gouv.fr') {
    if (/\/files$/.test(parsed.pathname)) return 'gpu-files';
    if (/\/files\//.test(parsed.pathname)) return 'gpu-file';
    return parsed.searchParams.get('status') === 'document.production'
      ? 'gpu-document'
      : 'gpu-document-unfiltered';
  }
  if (parsed.hostname === 'georisques.gouv.fr') {
    const path = parsed.pathname.replace('/api/v1/', '').replace(/\//g, '-');
    const code = parsed.searchParams.get('code_insee');
    return `georisques-${path}${code === null ? '' : `-${code}`}`;
  }
  return `other-${parsed.hostname}`;
}

/** A plot's recordings: the Site view, the conversion table and every answer with its meta. */
export async function loadPlot(plot) {
  const folder = new URL(`${plot}/`, FIXTURES);
  const read = async (name) => JSON.parse(await readFile(new URL(name, folder), 'utf8'));
  const answers = new Map();
  for (const file of await readdir(folder)) {
    if (!file.endsWith('.meta.json')) continue;
    const name = file.slice(0, -'.meta.json'.length);
    answers.set(name, { meta: await read(file), body: await read(`${name}.json`) });
  }
  return { site: await read('site.json'), conversions: await read('conversions.json'), answers };
}

const pointKey = (a, b) => `${a},${b}`;

/**
 * The Site service, answering **only** what the platform's own conversion
 * answered when the fixtures were captured (criterion 9). A point not in the
 * table throws: a test never converts by a formula of its own.
 */
export function recordedSiteService(site, conversions, options = {}) {
  const toGeo = new Map(
    conversions.toGeographic.map(([e, n, lat, lon]) => [
      pointKey(e, n),
      { latitude: lat, longitude: lon }
    ])
  );
  const fromGeo = new Map(
    conversions.fromGeographic.map(([lon, lat, e, n]) => [
      pointKey(lon, lat),
      { easting: e, northing: n }
    ])
  );
  const calls = { toGeographicRing: 0, fromGeographicRing: 0 };
  const lookup = (table, key) => {
    const found = table.get(key);
    if (found === undefined)
      throw new Error(`point ${key} is not in the recorded conversion table`);
    return found;
  };
  return {
    calls,
    ...(options.measures === undefined ? {} : { measures: options.measures }),
    current: () => options.current ?? site,
    toGeographic: (p) => lookup(toGeo, pointKey(p.easting, p.northing)),
    fromGeographic: (p) => lookup(fromGeo, pointKey(p.longitude, p.latitude)),
    toGeographicRing: (ring) => {
      calls.toGeographicRing += 1;
      if (options.unprojected) return undefined;
      return ring.map((p) => lookup(toGeo, pointKey(p.easting, p.northing)));
    },
    fromGeographicRing: (ring) => {
      calls.fromGeographicRing += 1;
      if (options.unprojected) return undefined;
      return ring.map((p) => lookup(fromGeo, pointKey(p.longitude, p.latitude)));
    }
  };
}

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (body === null || body === undefined ? '' : JSON.stringify(body))
});

/**
 * A `fetch` serving a plot's recordings by {@link fixtureName}. `overrides`
 * maps a fixture name to `(url, init) => Promise<response>` to fail or delay
 * one source. Every URL asked is in `requests`. An unrecorded URL is a 404
 * plus an entry in `unrecorded`, so a test can assert there is none.
 */
export function recordedFetch(answers, overrides = {}) {
  const requests = [];
  const unrecorded = [];
  const fetch = async (url, init = {}) => {
    requests.push({ url, method: init.method ?? 'GET', body: init.body });
    if (init.signal?.aborted) throw init.signal.reason;
    const name = fixtureName(url);
    if (overrides[name] !== undefined) return overrides[name](url, init);
    const recorded = answers.get(name);
    // 002.1b's EL7 reads across the road were not recorded for the reference
    // plots: answered empty, as API Carto answers where no EL7 lies.
    if (recorded === undefined && name.endsWith('-el7')) {
      return respond(200, { type: 'FeatureCollection', features: [], totalFeatures: 0 });
    }
    if (recorded === undefined) {
      unrecorded.push(url);
      return respond(404, null);
    }
    return respond(recorded.meta.status, recorded.body);
  };
  return { fetch, requests, unrecorded };
}

/** An override that never answers until its signal aborts: a timeout, or a superseded read. */
export const hanging = () => (url, init) =>
  new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });

export const answering = (status, body) => async () => respond(status, body);

/** The request a read gets, for a plot. */
export const requestFor = (site, reason = 'site') => ({ site, country: 'FR', reason });

// ── Sprint 002.4: the acceptance replays (DEC-2, criteria 2 and 6) ──────────────

/** The acceptance captures, one folder per plot (002.4 DEC-1's five plots). */
export const ACCEPTANCE = new URL('acceptance/', FIXTURES);
/**
 * Sprint 002.11 step 0: plots recorded for the planning snapshot only, in the
 * acceptance captures' shape (`loadAcceptance(plot, SNAPSHOT_FIXTURES)`) —
 * apart from `acceptance/`, which holds 002.9's expected values.
 */
export const SNAPSHOT_FIXTURES = new URL('snapshot/', FIXTURES);

const jsonClone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Key-sorted JSON: deep equality that ignores key order, as the recorder's own path names do. */
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** `.name`, `[3]` or `["odd key"]` steps, as `recordingService` writes them; `undefined` if not a chain. */
function pathSteps(text) {
  const steps = [];
  const step = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/y;
  while (step.lastIndex < text.length) {
    const at = step.lastIndex;
    const match = step.exec(text);
    if (match === null || step.lastIndex === at) return undefined;
    steps.push(match[1] ?? (match[2] !== undefined ? Number(match[2]) : JSON.parse(match[3])));
  }
  return steps;
}

/**
 * A service answering only what the capture recorded (002.4 DEC-2): each
 * `{ path, args, result }` pair, matched on `path` and on `args` by deep
 * equality (key order ignored). Any other input — a `measures.floorAreas` with
 * different `heightBands` included — throws `unrecorded <name> call: <path>
 * <args>` and is kept in the non-enumerable `unrecorded` list, because the
 * reader catches some failures (criterion 6: a test asserts the list empty).
 * A method never recorded is absent, as the reader's `typeof` tests expect.
 * A recorded result's own methods (`find(["Building"])[0].name`) answer the
 * same way.
 */
export function replayService(pairs, { name = 'service' } = {}) {
  if (pairs === null || pairs === undefined) return undefined;
  const unrecorded = [];
  const used = new Set();
  const answers = new Map();
  for (const pair of pairs) {
    const key = `${pair.path} ${stableJson(pair.args ?? [])}`;
    if (!answers.has(key)) answers.set(key, pair);
  }
  const paths = [...new Set(pairs.map((pair) => pair.path))];
  const replay = (path) => (...args) => {
    const input = jsonClone(args);
    const pair = answers.get(`${path} ${stableJson(input)}`);
    if (pair === undefined) {
      unrecorded.push({ path, args: input });
      throw new Error(`unrecorded ${name} call: ${path} ${JSON.stringify(input)}`);
    }
    used.add(pair);
    if (pair.error !== undefined) {
      const failure = new Error(pair.error);
      if (pair.async) return Promise.reject(failure);
      throw failure;
    }
    const value = rebuild(jsonClone(pair.result), `${path}(${stableJson(input)})`);
    return pair.async ? Promise.resolve(value) : value;
  };
  // Every recorded method whose path is `base` followed by plain steps, attached where it was.
  const attach = (target, base) => {
    for (const path of paths) {
      if (!path.startsWith(base)) continue;
      const steps = pathSteps(base === '' ? `.${path}` : path.slice(base.length));
      if (steps === undefined || steps.length === 0) continue;
      let node = target;
      for (const key of steps.slice(0, -1)) {
        if (node[key] === undefined && base === '') node[key] = {};
        node = node[key];
        if (node === null || typeof node !== 'object') break;
      }
      if (node !== null && typeof node === 'object') node[steps.at(-1)] = replay(path);
    }
    return target;
  };
  const rebuild = (value, base) =>
    value === null || typeof value !== 'object' ? value : attach(value, base);
  const service = attach({}, '');
  Object.defineProperty(service, 'unrecorded', { value: unrecorded, enumerable: false });
  // The pairs answered, for `record-fixtures.mjs --trim` (002.4 Q7).
  Object.defineProperty(service, 'used', { value: used, enumerable: false });
  return service;
}

/**
 * A `fetch` answering only the captured `{ url, method, body, status, text }`
 * list (002.4 DEC-2): matched on URL, method and body, answered in order when
 * one request was made more than once. Anything else throws — and, because
 * the reader turns a throwing `fetch` into a "network" source, is also kept in
 * `fetch.unrecorded` for a test to assert empty.
 */
export function replayFetch(answers) {
  const queues = new Map();
  const keyOf = (url, method, body) => `${method ?? 'GET'} ${url} ${body ?? ''}`;
  for (const answer of answers) {
    const key = keyOf(answer.url, answer.method, answer.body);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(answer);
  }
  const served = new Map();
  const used = new Set();
  const unrecorded = [];
  const requests = [];
  const fetch = async (url, init = {}) => {
    const key = keyOf(String(url), init.method, init.body);
    requests.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    if (init.signal?.aborted) throw init.signal.reason;
    const queue = queues.get(key);
    if (queue === undefined) {
      unrecorded.push(String(url));
      throw new Error(`unrecorded fetch: ${init.method ?? 'GET'} ${url}`);
    }
    const index = Math.min(served.get(key) ?? 0, queue.length - 1);
    served.set(key, index + 1);
    const answer = queue[index];
    used.add(answer);
    if (answer.error !== undefined) throw new TypeError(`recorded failure: ${answer.error}`);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => answer.text ?? '',
      json: async () => JSON.parse(answer.text)
    };
  };
  fetch.unrecorded = unrecorded;
  fetch.requests = requests;
  fetch.used = used;
  return fetch;
}

/**
 * The compact `fromGeographicRing` pair `record-fixtures.mjs --trim` writes
 * (002.4 Q7) — `{ path, ring: [[latitude, longitude]…], projected: [[easting,
 * northing]…] }` — back to the recorder's `{ path, args, result }`. The
 * capture command's own downloads pass through unchanged.
 */
export function expandSiteCalls(pairs) {
  return pairs.map((pair) =>
    Array.isArray(pair.ring)
      ? {
          path: pair.path,
          args: [pair.ring.map(([latitude, longitude]) => ({ latitude, longitude }))],
          ...(pair.projected === undefined
            ? {}
            : { result: pair.projected.map(([easting, northing]) => ({ easting, northing })) })
        }
      : pair
  );
}

/**
 * A plot's acceptance captures (002.4 DEC-2), or `undefined` while its folder
 * does not exist. The command's downloads lose their `fr-capture-` prefix:
 * `site.json` (the host's Site view), `site-calls.json`, `context.json`
 * (`roads`, `map-features`, `document` pairs), `section.json` and
 * `answers.json` (re-recorded by `tools/record-fixtures.mjs`); since 002.8,
 * `variations.json` where the capture checked a parked variation.
 */
export async function loadAcceptance(plot, base = ACCEPTANCE) {
  const folder = new URL(`${plot}/`, base);
  try {
    await readdir(folder);
  } catch (cause) {
    if (cause?.code === 'ENOENT') return undefined;
    throw cause;
  }
  const read = async (name) => JSON.parse(await readFile(new URL(name, folder), 'utf8'));
  // Sprint 002.8: the parked variations the capture checked, where the walk had one.
  const optional = async (name) => {
    try {
      return await read(name);
    } catch (cause) {
      if (cause?.code === 'ENOENT') return undefined;
      throw cause;
    }
  };
  return {
    site: await read('site.json'),
    siteCalls: expandSiteCalls(await read('site-calls.json')),
    context: await read('context.json'),
    section: await read('section.json'),
    answers: await read('answers.json'),
    variations: await optional('variations.json')
  };
}
