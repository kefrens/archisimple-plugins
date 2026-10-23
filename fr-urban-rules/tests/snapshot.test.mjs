/**
 * The planning snapshot (Sprint 002.11, SDK 1.33, platform ADR-0115): the
 * reading kept in the project's Site cache, restored at open — offline, or
 * shown first and checked again — with « what changed », the keys a
 * confirmation names kept, the budget and its degradation, and the cache
 * written only when the reading changed.
 *
 * Replays only, as `acceptance.test.mjs`: the five reference plots' captures
 * (`acceptance/<plot>/`) and ManualChemin's (`snapshot/manualchemin/`, step 0);
 * a synthetic plot for the budget. The global `fetch` throws for the whole
 * file; offline is a `fetch` that refuses every request.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, createReader } from '../src/index.js';
import {
  docBlocks,
  loadAcceptance,
  PLOTS,
  replayFetch,
  replayService,
  SNAPSHOT_FIXTURES,
  stableJson
} from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in the snapshot tests');
};

const i18n = new URL('../resources/i18n/fr-urban-rules/', import.meta.url);
const en = JSON.parse(await readFile(new URL('en.json', i18n), 'utf8'));
const fr = JSON.parse(await readFile(new URL('fr.json', i18n), 'utf8'));
const phrase = (table, text) =>
  table[text.key].replace(/\{(\w+)\}/g, (all, name) =>
    text.params !== undefined && name in text.params ? String(text.params[name]) : all
  );

/** The capture's day, then a later one: a snapshot is reopened another day. */
const CAPTURED = () => new Date(Date.UTC(2026, 9, 20, 12, 0));
const LATER = () => new Date(Date.UTC(2026, 10, 3, 9, 0));

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * The `site-package-data` service with 096.17's cache: the section read-only
 * (a read never decides: `write` is counted and refused), the cache kept as
 * the host keeps it — a copy in, a copy out — every `writeCache` recorded.
 */
function packageData({ section, cache, refuse = false } = {}) {
  let stored = clone(cache);
  let credited;
  const calls = { write: 0, writeCache: [], readCache: 0 };
  const listeners = new Set();
  return {
    calls,
    refuse: (value) => (refuse = value),
    stored: () => clone(stored),
    attributions: () => credited,
    service: {
      read: () => clone(section) ?? undefined,
      write: () => {
        calls.write += 1;
        throw new Error('a read never writes the section');
      },
      onDidChange: () => ({ dispose: () => {} }),
      readCache: () => {
        calls.readCache += 1;
        return clone(stored);
      },
      writeCache: (data, attributions) => {
        calls.writeCache.push({ data: clone(data), attributions: clone(attributions) });
        if (refuse)
          throw new Error('site package data: the cache is over 1048576 characters in all');
        stored = clone(data);
        credited = clone(attributions);
        for (const listener of listeners) listener();
      },
      onDidChangeCache: (listener) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      }
    }
  };
}

const offline = () => {
  const requests = [];
  const fetch = async (url) => {
    requests.push(String(url));
    throw new TypeError('Failed to fetch');
  };
  fetch.requests = requests;
  return fetch;
};

/** The six plots: 002.4's five and ManualChemin (step 0); `undefined` while a capture is absent. */
const SIX = [...PLOTS, 'manualchemin'];
const captureOf = (plot) =>
  plot === 'manualchemin' ? loadAcceptance(plot, SNAPSHOT_FIXTURES) : loadAcceptance(plot);

/** A reader over a plot's replays, with the given cache store and fetch. */
function readerOver(captured, { data, fetch, now = CAPTURED, logs = [], ...options }) {
  const site = replayService(captured.siteCalls, { name: 'site' });
  const reader = createReader({
    fetch,
    now,
    site: () => site,
    roads: () => replayService(captured.context.roads, { name: 'roads' }),
    mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
    document: () => replayService(captured.context.document, { name: 'document' }),
    packageData: () => data.service,
    log: (message) => logs.push(message),
    translate: (key) => en[key],
    ...options
  });
  return { reader, site, logs };
}

async function readOnce(captured, options, { progress = () => {}, reason = 'site' } = {}) {
  const context = readerOver(captured, options);
  try {
    const report = await context.reader.read(
      { site: captured.site, country: 'FR', reason },
      { signal: new AbortController().signal, progress }
    );
    return { report, ...context };
  } finally {
    context.reader.dispose();
  }
}

/** A plot read online from its recordings: the report, and the snapshot written. */
async function recorded(captured, options = {}) {
  const data = packageData({ section: captured.section });
  const { report } = await readOnce(captured, {
    data,
    fetch: replayFetch(captured.answers),
    ...options
  });
  return { report, data, snapshot: data.stored(), attributions: data.attributions() };
}

/** What criterion 1 compares: zones, features by category and label, flags, rule keys. */
const facts = (report) => ({
  regime: report.regime.code,
  zones: report.zones,
  features: [...new Set(report.features.map((f) => `${f.category}|${f.label.text}`))].sort(),
  flags: report.flags,
  document: report.document?.version
});
const ruleKeys = (report) => report.rules.map((r) => r.id).sort();
const overviewKeys = (report) =>
  docBlocks(report).filter((b) => b.kind === 'notice' || b.kind === 'heading').map((b) => b.text.key);

function sixPlots(name, body) {
  for (const plot of SIX) {
    test(`${name} — ${plot}`, async (t) => {
      const captured = await captureOf(plot);
      if (captured === undefined) {
        t.skip(`no capture for ${plot} yet`);
        return;
      }
      await body(captured, plot);
    });
  }
}

// ── Criterion 1: restored at open, offline ──────────────────────────────────────

sixPlots('criterion 1: restores the reading offline', async (captured) => {
  const online = await recorded(captured);
  assert.ok(online.snapshot !== undefined, 'the completed read wrote a snapshot');
  const data = packageData({ section: captured.section, cache: online.snapshot });
  const fetch = offline();
  const { report, logs } = await readOnce(captured, { data, fetch, now: LATER });
  assert.ok(fetch.requests.length > 0, 'the network was asked, and refused');
  assert.deepEqual(facts(report), facts(online.report));
  assert.deepEqual(ruleKeys(report), ruleKeys(online.report));
  // Sprint 002.11's review: the package says nothing of its own about being
  // offline — every restored source is `saved` (SDK 1.33) with the snapshot's
  // date, and the host says « Offline — N sources shown as read on {date} » once.
  // Never `unavailable`, which the host counts as « did not answer ».
  assert.equal(overviewKeys(report).some((k) => /snapshot\.offline/.test(k)), false);
  const planning = report.sources.filter((s) => Object.hasOwn(__testing.SOURCES, s.id));
  assert.ok(planning.length > 0);
  for (const source of planning) {
    // A source the recorded read never had is not in the snapshot: it says why it failed.
    if (!Object.hasOwn(online.snapshot.sources, source.id)) {
      assert.equal(source.state, 'unavailable', source.id);
      continue;
    }
    assert.equal(source.state, 'saved', source.id);
    assert.equal(source.retrievedAt, online.snapshot.sources[source.id].retrievedAt, source.id);
    assert.equal(source.detail.key, 'fr-urban-rules.status.shownAsReadOn', source.id);
    assert.equal(phrase(en, source.detail), 'Did not answer; shown as read on 2026-10-20.');
    assert.equal(phrase(fr, source.detail), 'N’a pas répondu ; affiché tel que lu le 2026-10-20.');
  }
  // Criterion 9: nothing decided; nothing written from an unchanged reading.
  assert.equal(data.calls.write, 0);
  assert.equal(data.calls.writeCache.length, 0);
  assert.equal(logs.filter((l) => /snapshot/.test(l)).length, 0, logs.join('\n'));
});

// ── Criterion 2: snapshot first, then fresh, in one read ────────────────────────

test('criterion 2: progress first, answer fresh — one read, onDidChange not fired', async () => {
  const captured = await loadAcceptance('lyon');
  const online = await recorded(captured);
  const data = packageData({ section: captured.section, cache: online.snapshot });
  const context = readerOver(captured, { data, fetch: replayFetch(captured.answers), now: LATER });
  let fired = 0;
  context.reader.onDidChange(() => (fired += 1));
  const progress = [];
  const report = await context.reader.read(
    { site: captured.site, country: 'FR', reason: 'site' },
    { signal: new AbortController().signal, progress: (r) => progress.push(r) }
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  context.reader.dispose();
  assert.ok(progress.length > 0);
  const first = progress[0];
  assert.equal(first.overview[0].text.key, 'fr-urban-rules.snapshot.checking');
  assert.equal(phrase(en, first.overview[0].text), 'Read on 2026-10-20 — checking for changes…');
  assert.equal(phrase(fr, first.overview[0].text), 'Lu le 2026-10-20 — vérification en cours…');
  // The snapshot's facts are there at once; its sources are loading, with their date.
  assert.deepEqual(first.zones, online.report.zones);
  assert.deepEqual(ruleKeys(first), ruleKeys(online.report));
  const planning = first.sources.filter((s) => Object.hasOwn(__testing.SOURCES, s.id));
  assert.ok(planning.length > 0);
  for (const source of planning) {
    assert.equal(source.state, 'loading', source.id);
    assert.equal(typeof source.retrievedAt, 'string', source.id);
  }
  // The answer is the fresh report: no « checking », « unchanged since », ready sources.
  assert.equal(overviewKeys(report).includes('fr-urban-rules.snapshot.checking'), false);
  assert.equal(report.overview[0].text.key, 'fr-urban-rules.snapshot.unchanged');
  assert.equal(phrase(en, report.overview[0].text), 'Unchanged since 2026-10-20 — checked today.');
  assert.equal(
    phrase(fr, report.overview[0].text),
    'Inchangé depuis le 2026-10-20 — vérifié aujourd’hui.'
  );
  assert.ok(
    report.sources
      .filter((s) => Object.hasOwn(__testing.SOURCES, s.id))
      .every((s) => s.state === 'ready')
  );
  assert.equal(fired, 0, 'no onDidChange: the answer is the fresh report');
  assert.equal(data.calls.writeCache.length, 0, 'unchanged: nothing written');
  assert.equal(data.calls.write, 0);
});

// ── Criterion 3: keys survive ─────────────────────────────────────────────────

sixPlots(
  'criterion 3: rule keys equal after a restore, with and without DEC-2 steps 2–5',
  async (captured) => {
    for (const minimumStep of [0, 6]) {
      const online = await recorded(captured, { snapshotMinimumStep: minimumStep });
      if (minimumStep === 6) {
        assert.deepEqual(online.snapshot.simplified, [
          'clip-30',
          'simplify',
          'drop-information',
          'drop-easement',
          'drop-prescription',
          'shorten-passages'
        ]);
      }
      const data = packageData({ section: captured.section, cache: online.snapshot });
      const { report } = await readOnce(captured, { data, fetch: offline(), now: LATER });
      assert.deepEqual(ruleKeys(report), ruleKeys(online.report), `steps from ${minimumStep}`);
      // Every confirmation of the walk still names a rule of the restored report.
      const keys = new Set(ruleKeys(report));
      for (const entry of captured.section?.confirmations ?? []) {
        if (ruleKeys(online.report).includes(entry.ruleKey))
          assert.ok(keys.has(entry.ruleKey), entry.ruleKey);
      }
      if (minimumStep === 0) {
        // The decisions apply as they did: each rule's status is the fresh read's.
        const statuses = (r) => r.rules.map((rule) => `${rule.id}=${rule.status}`).sort();
        assert.deepEqual(statuses(report), statuses(online.report));
      }
    }
  }
);

// ── Criterion 4: size ─────────────────────────────────────────────────────────

sixPlots('criterion 4: fits the budget with no step past the first', async (captured, plot) => {
  const online = await recorded(captured);
  const size = JSON.stringify({ data: online.snapshot, attributions: online.attributions }).length;
  assert.ok(size < 200_000, `${plot}: ${size} characters`);
  assert.deepEqual(online.snapshot.simplified, []);
  // DEC-1: never the raw answers, never a verdict.
  const text = JSON.stringify(online.snapshot);
  assert.doesNotMatch(text, /"features"|"checks"|"envelope"|"capacity"|"gpu_timestamp"/);
  assert.equal(online.snapshot.schema, 1);
});

// The synthetic plot: a 20 m square, one PLU zone whose outline is a 2 MB zigzag.
const E0 = 651_000;
const N0 = 6_862_000;
const pt = (easting, northing) => ({ easting, northing });
const toGeo = (p) => ({ longitude: p.easting / 1e5, latitude: p.northing / 1e5 });
const fromGeo = (g) => ({
  easting: Math.round(g.longitude * 1e5 * 1e6) / 1e6,
  northing: Math.round(g.latitude * 1e5 * 1e6) / 1e6
});
const syntheticSite = {
  crs: 'EPSG:2154',
  country: 'FR',
  anchor: toGeo(pt(E0 + 10, N0 + 10)),
  parcels: [
    {
      sourceId: 'cadastre',
      featureId: 'p1',
      properties: { idu: '99999000AA0001', code_insee: '99999' },
      rings: [[pt(E0, N0), pt(E0 + 20, N0), pt(E0 + 20, N0 + 20), pt(E0, N0 + 20)]]
    }
  ]
};
const syntheticService = {
  current: () => syntheticSite,
  toGeographicRing: (ring) => ring.map(toGeo),
  fromGeographicRing: (ring) => ring.map(fromGeo),
  toGeographic: toGeo,
  fromGeographic: fromGeo
};
/** A zone 160 m square around the plot, each edge a 0.35 m zigzag every 7 mm. */
function zigzagZone() {
  const ring = [];
  const corners = [
    pt(E0 - 10, N0 - 10),
    pt(E0 + 150, N0 - 10),
    pt(E0 + 150, N0 + 150),
    pt(E0 - 10, N0 + 150)
  ];
  for (let side = 0; side < 4; side += 1) {
    const a = corners[side];
    const b = corners[(side + 1) % 4];
    const length = Math.hypot(b.easting - a.easting, b.northing - a.northing);
    const ux = (b.easting - a.easting) / length;
    const uy = (b.northing - a.northing) / length;
    for (let i = 0; i * 0.007 < length; i += 1) {
      const s = i * 0.007;
      const off = i % 2 === 0 ? 0 : 0.35;
      ring.push([(a.easting + ux * s - uy * off) / 1e5, (a.northing + uy * s + ux * off) / 1e5]);
    }
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}
const collection = (features) => ({
  type: 'FeatureCollection',
  features,
  totalFeatures: features.length
});
function syntheticFetch({ zone = 'UA', idurba = '99999_PLU_20200101', extra = {} } = {}) {
  const big = zigzagZone();
  const answers = {
    municipality: collection([
      { properties: { insee: '99999', name: 'Testville', is_rnu: false } }
    ]),
    document: collection([
      {
        properties: {
          partition: 'DU_99999',
          name: idurba,
          du_type: 'PLU',
          gpu_doc_id: 'abc',
          grid_title: 'TESTVILLE',
          gpu_status: 'production'
        }
      }
    ]),
    'zone-urba': collection([
      {
        id: 'zone-urba.1',
        properties: {
          libelle: zone,
          typezone: 'U',
          idurba,
          datvalid: '20200101',
          nomfic: '99999_reglement_20200101.pdf'
        },
        geometry: big
      }
    ]),
    ...extra
  };
  const body = (url) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'apicarto.ign.fr') {
      const layer = parsed.pathname.split('/').pop();
      return answers[layer] ?? collection([]);
    }
    if (parsed.hostname === 'www.geoportail-urbanisme.gouv.fr') return [];
    if (parsed.pathname.includes('pprn')) return { content: [], totalElements: 0 };
    if (parsed.pathname.includes('rga')) return { codeExposition: '' };
    return { data: [], total_pages: 1 };
  };
  const requests = [];
  const fetch = async (url) => {
    requests.push(String(url));
    const text = JSON.stringify(body(String(url)));
    return { ok: true, status: 200, text: async () => text };
  };
  fetch.requests = requests;
  fetch.size = JSON.stringify(big).length;
  return fetch;
}
async function readSynthetic({ data, fetch, now = CAPTURED, logs = [], ...options }) {
  const reader = createReader({
    fetch,
    now,
    site: () => syntheticService,
    packageData: () => data.service,
    log: (message) => logs.push(message),
    translate: (key) => en[key],
    ...options
  });
  try {
    return await reader.read(
      { site: syntheticSite, country: 'FR', reason: 'site' },
      { signal: new AbortController().signal, progress: () => {} }
    );
  } finally {
    reader.dispose();
  }
}

test('criterion 4: a 2 MB polygon is reduced, says so, and is still under the limit; its key-bearing centroid is kept', async () => {
  const fetch = syntheticFetch();
  assert.ok(fetch.size > 2_000_000, `the answer's polygon is ${fetch.size} characters`);
  const data = packageData();
  const report = await readSynthetic({ data, fetch });
  assert.equal(data.calls.writeCache.length, 1);
  const { data: snapshot, attributions } = data.calls.writeCache[0];
  const size = JSON.stringify({ data: snapshot, attributions }).length;
  assert.ok(size <= 200_000, `${size} characters`);
  assert.deepEqual(snapshot.simplified, ['clip-30', 'simplify']);
  const zone = snapshot.sources['zone-urba'].parsed[0];
  assert.ok(zone.geometry.rings.length > 0, 'the outline near the plot is kept');
  assert.ok(Number.isFinite(zone.geometry.centroid.easting));
  // Every kept point is within 30 m of the plot (DEC-2 step 2).
  for (const p of zone.geometry.rings.flat()) {
    assert.ok(
      p.easting >= E0 - 30 && p.easting <= E0 + 50 && p.northing >= N0 - 30 && p.northing <= N0 + 50
    );
  }
  // The overview says so, in both languages, naming what was given up.
  const notice = report.overview.find((b) => b.text?.key === 'fr-urban-rules.snapshot.simplified');
  assert.ok(notice !== undefined);
  assert.equal(
    phrase(en, notice.text),
    'Simplified to fit the project file: outlines kept within 30 m of the plot · outlines simplified to 0.5 m.'
  );
  assert.match(
    fr['fr-urban-rules.snapshot.simplified'],
    /^Simplifié pour tenir dans le fichier du projet/
  );
});

test('criterion 4: a snapshot that fits after no step is not written, and says « Not saved in the project »', async () => {
  const data = packageData();
  const logs = [];
  const report = await readSynthetic({ data, fetch: syntheticFetch(), snapshotBudget: 500, logs });
  assert.equal(data.calls.writeCache.length, 0);
  const notice = report.overview.find((b) => b.text?.key === 'fr-urban-rules.snapshot.notSaved');
  assert.equal(phrase(en, notice.text), 'Not saved in the project: too large.');
  assert.equal(phrase(fr, notice.text), 'Non enregistré dans le projet : trop volumineux.');
  assert.ok(logs.some((l) => /does not fit/.test(l)));
});

test('criterion 4: a refused write keeps the previous one and shows « Not saved in the project »', async () => {
  const data = packageData();
  await readSynthetic({ data, fetch: syntheticFetch() });
  const previous = data.stored();
  assert.ok(previous !== undefined);
  data.refuse(true);
  const logs = [];
  const report = await readSynthetic({ data, fetch: syntheticFetch({ zone: 'UB' }), logs });
  assert.equal(data.calls.writeCache.length, 2, 'the changed reading was offered to the host');
  assert.deepEqual(data.stored(), previous, 'the previous snapshot stays');
  assert.ok(overviewKeys(report).includes('fr-urban-rules.snapshot.notSaved'));
  assert.ok(logs.some((l) => /writeCache refused/.test(l)));
});

// ── Criterion 5: written only on change ────────────────────────────────────────

test('criterion 5: writes only when the reading changed', async () => {
  const captured = await loadAcceptance('rochefort');
  const first = await recorded(captured);
  // A second read of the same answers, in a new session: nothing written.
  const data = packageData({ section: captured.section, cache: first.snapshot });
  await readOnce(captured, { data, fetch: replayFetch(captured.answers), now: LATER });
  assert.equal(data.calls.writeCache.length, 0);
  // A Refresh in the same session: nothing written either.
  const context = readerOver(captured, { data, fetch: replayFetch(captured.answers), now: LATER });
  for (const reason of ['site', 'refresh', 'design']) {
    await context.reader.read(
      { site: captured.site, country: 'FR', reason },
      { signal: new AbortController().signal, progress: () => {} }
    );
  }
  context.reader.dispose();
  assert.equal(data.calls.writeCache.length, 0);
  // A changed answer writes once, dated now.
  const changed = synthesizedChange(captured.answers, 'georisques-gaspar-risques', (json) => {
    json.data[0].risques_detail.push({ num_risque: '999', libelle_risque_long: 'Risque de test' });
  });
  await readOnce(captured, { data, fetch: replayFetch(changed), now: LATER });
  assert.equal(data.calls.writeCache.length, 1);
  assert.equal(data.stored().readAt, LATER().toISOString());
  assert.equal(data.calls.write, 0);
});

test('002.11 review: the same features listed in another order are the same reading — nothing written', async () => {
  const captured = await loadAcceptance('lyon');
  const first = await recorded(captured);
  // Every API Carto layer answering its features reversed, as a service with no ORDER BY may.
  const reordered = clone(captured.answers).map((answer) => {
    if (!answer.url.includes('apicarto.ign.fr') || typeof answer.text !== 'string') return answer;
    const json = JSON.parse(answer.text);
    if (Array.isArray(json?.features) && json.features.length > 1) json.features.reverse();
    return { ...answer, text: JSON.stringify(json) };
  });
  assert.ok(
    reordered.some((answer, i) => answer.text !== captured.answers[i].text),
    'some layer has two features or more'
  );
  const data = packageData({ section: captured.section, cache: first.snapshot });
  const { report } = await readOnce(captured, { data, fetch: replayFetch(reordered), now: LATER });
  assert.equal(data.calls.writeCache.length, 0, 'an unchanged reading leaves the project clean');
  assert.equal(report.overview[0].text.key, 'fr-urban-rules.snapshot.unchanged');
});

/** The recorded answers with one answer's JSON changed by `change`. */
function synthesizedChange(answers, path, change) {
  const out = clone(answers);
  const answer = out.find((a) =>
    a.url.includes(path.replace(/^georisques-/, '').replace(/-/g, '/'))
  );
  assert.ok(answer !== undefined, `no recorded answer for ${path}`);
  const json = JSON.parse(answer.text);
  change(json);
  answer.text = JSON.stringify(json);
  return out;
}

// ── Criterion 6: what changed ─────────────────────────────────────────────────

test('criterion 6: what changed — a new idurba, a zone relabelled, a prescription added, an easement removed', async () => {
  const captured = await loadAcceptance('lyon');
  const online = await recorded(captured);
  const before = online.snapshot;
  const zone = before.sources['zone-urba'].parsed[0];
  const altered = clone(captured.answers);
  const edit = (layer, change) => {
    const answer = altered.find((a) => new URL(a.url).pathname.endsWith(`/${layer}`));
    assert.ok(answer !== undefined, layer);
    const json = JSON.parse(answer.text);
    change(json);
    answer.text = JSON.stringify(json);
  };
  const newIdurba = '200046977_PLUi_20270101';
  edit('zone-urba', (json) => {
    for (const f of json.features) {
      f.properties.idurba = newIdurba;
      f.properties.datvalid = '20270101';
      if (f.properties.libelle === zone.libelle) f.properties.libelle = `${zone.libelle}x`;
    }
  });
  let addedLabel;
  edit('prescription-surf', (json) => {
    const copy = clone(json.features[0]);
    copy.id = 'prescription-surf.added';
    copy.properties.libelle = 'Prescription de test';
    addedLabel = copy.properties.libelle;
    json.features.push(copy);
  });
  let removedLabel;
  for (const layer of ['assiette-sup-s', 'assiette-sup-l', 'assiette-sup-p']) {
    if (removedLabel !== undefined) break;
    edit(layer, (json) => {
      if (json.features.length === 0) return;
      const gone = json.features.pop();
      removedLabel = gone.properties.nomass ?? gone.properties.suptype.toUpperCase();
      if (typeof json.totalFeatures === 'number') json.totalFeatures -= 1;
    });
  }
  assert.ok(removedLabel !== undefined, 'Lyon has an easement to remove');
  const data = packageData({ section: captured.section, cache: before });
  const { report } = await readOnce(captured, { data, fetch: replayFetch(altered), now: LATER });
  const heading = report.overview[0];
  assert.equal(heading.kind, 'heading');
  assert.equal(phrase(en, heading.text), 'What changed since 2026-10-20');
  assert.equal(phrase(fr, heading.text), 'Ce qui a changé depuis le 2026-10-20');
  const lines = report.overview
    .slice(1)
    .filter((b) => b.text?.key?.startsWith('fr-urban-rules.snapshot.change.'));
  const keys = lines.map((b) => b.text.key);
  assert.ok(keys.includes('fr-urban-rules.snapshot.change.version'));
  assert.ok(keys.includes('fr-urban-rules.snapshot.change.zone'));
  assert.ok(keys.includes('fr-urban-rules.snapshot.change.prescriptionAdded'));
  assert.ok(keys.includes('fr-urban-rules.snapshot.change.easementRemoved'));
  // {n} is the existing reopen rule's count: the rules it reopened on this report.
  const reopened = report.rules.filter((r) =>
    (r.conditions ?? []).some((c) => c.key === 'fr-urban-rules.rule.reopened')
  ).length;
  assert.ok(reopened > 0, 'the walk’s confirmations of the old version reopen');
  const version = lines.find((b) => b.text.key === 'fr-urban-rules.snapshot.change.version');
  assert.equal(version.text.params.count, reopened);
  assert.equal(
    phrase(en, version.text),
    `New version of the PLUi, from ${before.document.idurba} to ${newIdurba}, in force from 2027-01-01. ${reopened} confirmations to review.`
  );
  assert.equal(
    phrase(fr, version.text),
    `Nouvelle version du PLUi, de ${before.document.idurba} à ${newIdurba}, applicable depuis le 2027-01-01. ${reopened} confirmations à revoir.`
  );
  const zoneLine = lines.find((b) => b.text.key === 'fr-urban-rules.snapshot.change.zone');
  assert.match(
    phrase(en, zoneLine.text),
    new RegExp(`^Zone changed from .*${zone.libelle}.* to .*${zone.libelle}x`)
  );
  assert.match(phrase(fr, zoneLine.text), /^Zone modifiée : de /);
  const added = lines.find(
    (b) => b.text.key === 'fr-urban-rules.snapshot.change.prescriptionAdded'
  );
  assert.equal(phrase(en, added.text), `New prescription: ${addedLabel}.`);
  assert.equal(phrase(fr, added.text), `Nouvelle prescription : ${addedLabel}.`);
  const removed = lines.find(
    (b) => b.text.key === 'fr-urban-rules.snapshot.change.easementRemoved'
  );
  assert.equal(phrase(en, removed.text), `Easement no longer listed: ${removedLabel}.`);
  assert.equal(phrase(fr, removed.text), `Servitude qui n’apparaît plus : ${removedLabel}.`);
  // The lines are information: nothing decided, and the new state is kept.
  assert.equal(data.calls.write, 0);
  assert.equal(data.calls.writeCache.length, 1);
  assert.equal(data.stored().document.idurba, newIdurba);
});

test('criterion 6: a new version with no confirmation to review says the version alone', async () => {
  const captured = await loadAcceptance('lyon');
  const online = await recorded({ ...captured, section: null });
  const altered = clone(captured.answers);
  const answer = altered.find((a) => new URL(a.url).pathname.endsWith('/zone-urba'));
  const json = JSON.parse(answer.text);
  for (const f of json.features) {
    f.properties.idurba = '200046977_PLUi_20270101';
    f.properties.datvalid = '20270101';
  }
  answer.text = JSON.stringify(json);
  const data = packageData({ cache: online.snapshot });
  const { report } = await readOnce(
    { ...captured, section: null },
    { data, fetch: replayFetch(altered), now: LATER }
  );
  const line = report.overview.find((b) =>
    b.text?.key?.startsWith('fr-urban-rules.snapshot.change.version')
  );
  assert.equal(line.text.key, 'fr-urban-rules.snapshot.change.versionNothingToReview');
  assert.match(
    phrase(en, line.text),
    /^New version of the PLUi, from .* to 200046977_PLUi_20270101, in force from 2027-01-01\.$/
  );
  assert.match(
    phrase(fr, line.text),
    /^Nouvelle version du PLUi, de .* à 200046977_PLUi_20270101, applicable depuis le 2027-01-01\.$/
  );
});

test('criterion 6: an identical read gives « Unchanged since »; only sources ready in both are compared', async () => {
  const captured = await loadAcceptance('gordes');
  const online = await recorded(captured);
  const data = packageData({ section: captured.section, cache: online.snapshot });
  const { report } = await readOnce(captured, {
    data,
    fetch: replayFetch(captured.answers),
    now: LATER
  });
  assert.equal(report.overview[0].text.key, 'fr-urban-rules.snapshot.unchanged');
  // A source that fails is shown from the snapshot and never reads as « no longer listed ».
  const failing = replayFetch(captured.answers);
  const partly = async (url, init) => {
    if (String(url).includes('/prescription-')) throw new TypeError('Failed to fetch');
    return failing(url, init);
  };
  const again = await readOnce(captured, { data, fetch: partly, now: LATER });
  assert.equal(
    overviewKeys(again.report).some((k) => /Removed$/.test(k)),
    false
  );
  assert.deepEqual(facts(again.report).features, facts(online.report).features);
  // Sprint 002.11's review: « checked today » speaks only for the sources that
  // answered, and those that did not are `saved` with their date, never current.
  assert.equal(again.report.overview[0].text.key, 'fr-urban-rules.snapshot.unchangedPartly');
  assert.equal(
    phrase(en, again.report.overview[0].text),
    'Unchanged since 2026-10-20 among the sources that answered today.'
  );
  assert.equal(
    phrase(fr, again.report.overview[0].text),
    'Inchangé depuis le 2026-10-20 pour les sources qui ont répondu aujourd’hui.'
  );
  const prescriptions = again.report.sources.filter((s) => /^prescription-/.test(s.id));
  assert.ok(prescriptions.length > 0);
  for (const source of prescriptions) {
    assert.equal(source.state, Object.hasOwn(online.snapshot.sources, source.id) ? 'saved' : 'unavailable');
  }
});

// ── Criterion 10: attribution ─────────────────────────────────────────────────

test('criterion 10: credits a restored reading — the envelope carries the lines, the report its credit', async () => {
  const captured = await loadAcceptance('brouennes');
  const online = await recorded(captured);
  assert.equal('attributions' in online.snapshot, false, 'never inside data');
  assert.deepEqual(online.attributions, [
    'IGN — API Carto, Géoportail de l’Urbanisme',
    'Géorisques — BRGM, ministère de la Transition écologique (georisques.gouv.fr)'
  ]);
  for (const line of online.attributions) assert.ok(line.length <= 300);
  const data = packageData({ section: captured.section, cache: online.snapshot });
  const { report } = await readOnce(captured, { data, fetch: offline(), now: LATER });
  for (const line of online.attributions) assert.ok(report.attribution.includes(line), line);
});

// ── Criterion 11 and DEC-8: unknown schema, malformed, another plot ─────────────

test('criterion 11: a snapshot with schema 2 is ignored and logged, then replaced by a completed read', async () => {
  const captured = await loadAcceptance('rochefort');
  const online = await recorded(captured);
  const data = packageData({ section: captured.section, cache: { ...online.snapshot, schema: 2 } });
  const logs = [];
  const progress = [];
  await readOnce(
    captured,
    { data, fetch: offline(), now: LATER, logs },
    { progress: (r) => progress.push(r) }
  );
  assert.ok(
    logs.some((l) => /schema 2/.test(l)),
    logs.join('\n')
  );
  assert.equal(
    progress.some((r) => overviewKeys(r).includes('fr-urban-rules.snapshot.checking')),
    false
  );
  assert.equal(data.calls.writeCache.length, 0, 'an offline read has nothing to replace it with');
  await readOnce(captured, { data, fetch: replayFetch(captured.answers), now: LATER, logs });
  assert.equal(data.stored().schema, 1);
});

test('DEC-8: a malformed snapshot or another plot’s is not restored', async () => {
  const captured = await loadAcceptance('rochefort');
  const online = await recorded(captured);
  for (const cache of [
    { ...online.snapshot, sources: 'nope' },
    { ...online.snapshot, plotKey: 'EPSG:2154#other#00000000' },
    {
      ...online.snapshot,
      sources: {
        ...online.snapshot.sources,
        'not-a-source': { retrievedAt: online.snapshot.readAt }
      }
    }
  ]) {
    const data = packageData({ section: captured.section, cache });
    const { report } = await readOnce(captured, { data, fetch: offline(), now: LATER });
    assert.equal(report.regime.code, 'unknown');
    // Nothing restored: no source is shown as read earlier.
    assert.equal(report.sources.some((source) => source.state === 'saved'), false);
  }
});

test('DEC-8: a restored link is only ever the GPU’s own file', async () => {
  const captured = await loadAcceptance('lyon');
  const online = await recorded(captured);
  const cache = clone(online.snapshot);
  cache.sources['gpu-files'].href = 'https://evil.example/x.pdf';
  const data = packageData({ section: captured.section, cache });
  const { report } = await readOnce(captured, { data, fetch: offline(), now: LATER });
  assert.doesNotMatch(JSON.stringify(report), /evil\.example/);
});

test('002.11 review: offline, the restored link opens the file it named, dated — never « could not be resolved »', async () => {
  const captured = await loadAcceptance('lyon');
  const online = await recorded(captured);
  const kept = online.snapshot.sources['gpu-files'];
  assert.equal(kept.link, 'found');
  const data = packageData({ section: captured.section, cache: online.snapshot });
  const { report } = await readOnce(captured, { data, fetch: offline(), now: LATER });
  const link = docBlocks(report).find((b) => b.kind === 'link');
  assert.equal(link?.href, kept.href);
  assert.equal(report.document.href, kept.href);
  assert.deepEqual(link.detail, {
    key: 'fr-urban-rules.link.detailAsRead',
    params: { date: '2026-10-20' }
  });
  assert.equal(
    phrase(en, link.detail),
    'The file as listed on 2026-10-20: the Géoportail de l’Urbanisme has not answered since. Opens at its first page.'
  );
  assert.equal(overviewKeys(report).includes('fr-urban-rules.notice.linkUnavailable'), false);
  // Online, the fresh link says nothing of a date.
  const fresh = docBlocks(online.report).find((b) => b.kind === 'link');
  assert.equal(fresh.detail.key, 'fr-urban-rules.link.detail');
});

// ── DEC-4: a cache change outside a read ────────────────────────────────────────

test('DEC-4: onDidChangeCache outside a read asks the host to read again; the package’s own write does not', async () => {
  const data = packageData();
  const reader = createReader({
    fetch: syntheticFetch(),
    now: CAPTURED,
    site: () => syntheticService,
    packageData: () => data.service,
    defer: (fn) => fn()
  });
  let fired = 0;
  reader.onDidChange(() => (fired += 1));
  data.service.onDidChangeCache(() => reader.cacheChanged());
  await reader.read(
    { site: syntheticSite, country: 'FR', reason: 'site' },
    { signal: new AbortController().signal, progress: () => {} }
  );
  assert.equal(data.calls.writeCache.length, 1);
  assert.equal(fired, 0, 'its own write signals nothing');
  // An entry this reader did not write (a load) asks the host to read again.
  data.service.writeCache({ schema: 1, plotKey: 'loaded', readAt: '2026-10-20T00:00:00.000Z', sources: {} }, []);
  assert.equal(fired, 1);
  reader.dispose();
});

test('002.11 review: the host’s change signal after the package’s own write, a microtask later, asks no second read', async () => {
  const data = packageData();
  // As the host does it (`sitePackageDataAdapter.watch`): once per microtask after the write.
  const writeCache = data.service.writeCache;
  const late = new Set();
  data.service.onDidChangeCache = (listener) => {
    late.add(listener);
    return { dispose: () => late.delete(listener) };
  };
  data.service.writeCache = (...args) => {
    writeCache(...args);
    queueMicrotask(() => {
      for (const listener of late) listener();
    });
  };
  const reader = createReader({
    fetch: syntheticFetch(),
    now: CAPTURED,
    site: () => syntheticService,
    packageData: () => data.service,
    defer: (fn) => fn()
  });
  let fired = 0;
  reader.onDidChange(() => (fired += 1));
  data.service.onDidChangeCache(() => reader.cacheChanged());
  await reader.read(
    { site: syntheticSite, country: 'FR', reason: 'site' },
    { signal: new AbortController().signal, progress: () => {} }
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(data.calls.writeCache.length, 1);
  assert.equal(fired, 0, 'its own write, signalled late, asks nothing');
  // Another entry arriving (a load) does.
  writeCache({ schema: 1, plotKey: 'other', readAt: '2026-10-20T00:00:00.000Z', sources: {} }, []);
  reader.cacheChanged();
  assert.equal(fired, 1);
  reader.dispose();
});

// ── Criterion 9: no decision from a read (asserted in each test above) ──────────

test('criterion 9: across a restore, a fresh read and a change, `write` is never called', async () => {
  const captured = await loadAcceptance('mouzay');
  const online = await recorded(captured);
  assert.equal(online.data.calls.write, 0);
  const data = packageData({ section: captured.section, cache: online.snapshot });
  await readOnce(captured, { data, fetch: offline(), now: LATER });
  await readOnce(captured, { data, fetch: replayFetch(captured.answers), now: LATER });
  assert.equal(data.calls.write, 0);
  assert.equal(stableJson(data.stored()), stableJson(online.snapshot));
});
