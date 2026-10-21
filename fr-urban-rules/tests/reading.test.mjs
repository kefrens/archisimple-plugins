/**
 * The readers against recorded answers (Sprint 002.0, criteria 3–11 and
 * 14–16). No network: every `fetch` is {@link recordedFetch}, and the global
 * one throws. Every conversion is the platform's own, recorded by
 * `scripts/capture.mjs` (criterion 9).
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import { createReader } from '../src/index.js';
import {
  PLOTS,
  answering,
  hanging,
  loadPlot,
  recordedFetch,
  recordedSiteService,
  requestFor
} from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const plots = {};
before(async () => {
  for (const plot of PLOTS) plots[plot] = await loadPlot(plot);
});

/** A clock that moves a minute per call, so two reads' dates differ. */
function clock(start = Date.UTC(2026, 9, 20, 8, 0)) {
  let at = start;
  return () => {
    at += 60_000;
    return new Date(at);
  };
}

function readerFor(plot, { overrides = {}, timeoutMs, service, now, site: siteOverride } = {}) {
  const { conversions, answers } = plots[plot];
  const site = siteOverride ?? plots[plot].site;
  const siteService = service ?? recordedSiteService(site, conversions);
  const fetched = recordedFetch(answers, overrides);
  const logs = [];
  const reader = createReader({
    fetch: fetched.fetch,
    site: () => siteService,
    now: now ?? clock(),
    timeoutMs,
    log: (m) => logs.push(m)
  });
  return { reader, fetched, site, siteService, logs };
}

async function readOnce(plot, options = {}) {
  const context = readerFor(plot, options);
  const progress = [];
  const report = await context.reader.read(requestFor(context.site), {
    signal: new AbortController().signal,
    progress: (r) => progress.push(r)
  });
  return { ...context, report, progress };
}

const view = (report, id) => report.views.find((v) => v.id === id);
const rowsOf = (v) => v.blocks.filter((b) => b.kind === 'fields').flatMap((b) => b.rows);
const rowValue = (rows, key) => rows.find((r) => r.label.key === key)?.value;
const source = (report, id) => report.sources.find((s) => s.id === id);

// ── Criterion 3: Lyon ───────────────────────────────────────────────────────────

test('criterion 3: Lyon AB0105 reads as PLUi, its version and zone UCe1b, its prescriptions and AC1 perimeter', async () => {
  const { report, fetched } = await readOnce('lyon');
  assert.deepEqual(fetched.unrecorded, []);
  assert.equal(report.regime.code, 'plui');
  assert.equal(report.document.id, 'DU_200046977');
  assert.equal(report.document.version, '200046977_PLUI_20260326');
  assert.match(report.document.validFrom, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(report.document.validFrom, '2026-03-26');
  assert.deepEqual(
    report.zones.map((z) => z.label.text),
    ['UCe1b']
  );

  const zoneRows = rowsOf(view(report, 'zone'));
  assert.equal(rowValue(zoneRows, 'fr-urban-rules.field.zone').text, 'UCe1b');
  assert.deepEqual(rowValue(zoneRows, 'fr-urban-rules.field.typezone'), {
    key: 'fr-urban-rules.typezone.U',
    params: { code: 'U' }
  });
  assert.equal(rowValue(zoneRows, 'fr-urban-rules.field.zoneValidFrom').text, '2026-03-26');

  // Recorded 2026-10-20: fourteen surface prescriptions (the milestone's probe of 10-19 had 13).
  const surfaces = report.features.filter((f) => f.category === 'prescription');
  assert.equal(surfaces.length, 14);
  assert.equal(view(report, 'prescriptions').blocks[0].rows.length, 14);

  const ac1 = report.features.find((f) => f.label.text === 'AC1_Eglise-Saint-Nizier-ICH6TC_abor');
  assert.equal(ac1.category, 'easement');
  assert.ok(ac1.rings.length > 0);
  const abf = report.flags.find((f) => f.kind === 'abf');
  assert.ok(abf, 'an abf flag');
  assert.match(abf.detail.text, /AC1_Eglise-Saint-Nizier-ICH6TC_abor/);
  assert.equal(report.features.find((f) => f.label.text === 'PM1_GlLynVlBn_ass').category, 'risk');
  assert.ok(report.flags.some((f) => f.kind === 'ppr'));
  assert.ok(report.flags.some((f) => f.kind === 'site'));
  // 002.2: the drawn prescriptions with a number are rules — none coded, none confirmed.
  assert.ok(report.rules.every((r) => r.provenance === 'drawn'));
  assert.equal(report.rules.find((r) => r.label.text === 'Hauteur Max-22').status, 'to_confirm');
  assert.deepEqual(report.checks, []);
  assert.deepEqual(report.edges, []);
});

test('DEC-6: Lyon’s Géorisques reads become flags and the risks view', async () => {
  const { report } = await readOnce('lyon');
  assert.deepEqual(report.flags.find((f) => f.kind === 'seismic').label.params, { zone: '2' });
  assert.deepEqual(report.flags.find((f) => f.kind === 'radon').label.params, { class: '1' });
  assert.deepEqual(report.flags.find((f) => f.kind === 'clay').label.params, { exposure: '2' });
  assert.ok(report.flags.find((f) => f.id === 'ppr-69DDT20080006'));
  assert.ok(report.flags.filter((f) => f.kind === 'risk').length > 5);
  const rows = rowsOf(view(report, 'risks'));
  assert.deepEqual(rowValue(rows, 'fr-urban-rules.risk.seismic'), {
    key: 'fr-urban-rules.value.seismic',
    params: { zone: '2' }
  });
  assert.ok(report.sources.every((s) => s.state === 'ready'));
  assert.match(report.attribution, /API Carto/);
  assert.match(report.attribution, /Géorisques/);
});

// ── Criterion 4: the other regimes ──────────────────────────────────────────────

test('criterion 4: Brouennes reads as RNU, with no document and no zone view', async () => {
  const { report } = await readOnce('brouennes');
  assert.equal(report.regime.code, 'rnu');
  assert.equal(report.document, undefined);
  assert.equal(view(report, 'zone'), undefined);
  // 002.1a: the national rules are coded under the RNU (rnu.test.mjs).
  assert.ok(report.rules.length > 0);
  assert.ok(view(report, 'easements'));
});

test('criterion 4: Rochefort-en-Terre is not on the GPU, with its AC4 easement, an abf flag and no rule', async () => {
  const { report } = await readOnce('rochefort');
  assert.equal(report.regime.code, 'not_published');
  assert.equal(report.document, undefined);
  // No rule is invented: not on the GPU, only an entered one could exist (002.2).
  assert.deepEqual(report.rules, []);
  const ac4 = report.features.find((f) => /^AC4_/.test(f.label.text));
  assert.equal(ac4.category, 'easement');
  assert.ok(report.flags.some((f) => f.kind === 'abf'));
  assert.equal(report.overview[0].kind, 'notice');
  assert.equal(report.overview[0].text.key, 'fr-urban-rules.notice.notPublished');
  // rga's empty answer there is "nothing mapped", never a failure.
  assert.equal(source(report, 'georisques-rga').state, 'ready');
});

test('criterion 4: Mouzay reads as a carte communale with its sector', async () => {
  const { report } = await readOnce('mouzay');
  assert.equal(report.regime.code, 'cc');
  const rows = rowsOf(view(report, 'sector'));
  assert.equal(rowValue(rows, 'fr-urban-rules.field.sector').text, 'C / Ci');
  assert.deepEqual(rowValue(rows, 'fr-urban-rules.field.typesect'), {
    key: 'fr-urban-rules.typesect.01'
  });
  assert.equal(view(report, 'zone'), undefined);
  assert.equal(view(report, 'prescriptions'), undefined);
  // A carte communale's sector carries no idurba; the document's name and datappro stand in.
  assert.equal(report.document.version, '55364_CC_20191107');
  assert.equal(report.document.validFrom, '2019-11-07');
});

test('Gordes: a PLU, zone A, its AC2 site, and a zone datvalid older than its document (§ 4.3)', async () => {
  const { report } = await readOnce('gordes');
  assert.equal(report.regime.code, 'plu');
  assert.equal(report.document.version, '84050_PLU_20241017');
  assert.equal(
    rowValue(rowsOf(view(report, 'zone')), 'fr-urban-rules.field.zoneValidFrom').text,
    '2022-04-11'
  );
  assert.ok(report.flags.some((f) => f.kind === 'site'));
  assert.ok(report.overview.some((b) => b.kind === 'link'));
});

// ── Criterion 5: failures stay apart ────────────────────────────────────────────

test('criterion 5: a failing municipality gives `unknown`, never `not_published`', async () => {
  const { report } = await readOnce('lyon', {
    overrides: { 'apicarto-municipality': answering(503, null) }
  });
  assert.equal(report.regime.code, 'unknown');
  assert.notEqual(report.regime.code, 'not_published');
  assert.equal(source(report, 'municipality').state, 'unavailable');
  assert.deepEqual(source(report, 'municipality').detail, {
    key: 'fr-urban-rules.status.http',
    params: { status: 503 }
  });
  assert.equal(report.overview[0].text.key, 'fr-urban-rules.notice.unknown');
  assert.equal(view(report, 'zone'), undefined);
  // Easements and risks are still read: they need no regime.
  assert.ok(report.features.some((f) => f.category === 'easement'));
});

test('criterion 5: a timed-out prescription read leaves zone and easements filled, that one source failed', async () => {
  const { report } = await readOnce('lyon', {
    overrides: { 'apicarto-prescription-surf': hanging() },
    timeoutMs: 50
  });
  assert.equal(report.regime.code, 'plui');
  assert.ok(report.features.some((f) => f.category === 'zone'));
  assert.ok(report.features.some((f) => f.category === 'easement'));
  assert.equal(report.features.filter((f) => f.category === 'prescription').length, 0);
  const failed = source(report, 'prescription-surf');
  assert.equal(failed.state, 'unavailable');
  assert.equal(failed.detail.key, 'fr-urban-rules.status.timeout');
  assert.equal(report.sources.filter((s) => s.state === 'unavailable').length, 1);
  const blocks = view(report, 'prescriptions').blocks;
  assert.equal(blocks[0].kind, 'notice');
  assert.equal(blocks[0].text.key, 'fr-urban-rules.notice.sourceFailed');
});

test('DEC-2: progress fills section by section; each partial names its pending sources `loading`', async () => {
  const { report, progress } = await readOnce('lyon');
  assert.ok(progress.length >= 3);
  assert.ok(progress[0].sources.some((s) => s.state === 'loading'));
  assert.equal(progress[0].regime.code, 'plui', 'no progress before the regime is known');
  assert.ok(report.sources.every((s) => s.state !== 'loading'));
});

// ── Criterion 6: the regulation link ────────────────────────────────────────────

test('criterion 6: Lyon’s link is resolved through the filtered list and a case-insensitive match', async () => {
  const { report, fetched } = await readOnce('lyon');
  const href =
    'https://www.geoportail-urbanisme.gouv.fr/api/document/4f3ddc27a9611b4bc94fa161443b8e86/files/200046977_reglement_20260326.pdf';
  assert.equal(report.document.href, href);
  assert.equal(report.overview.find((b) => b.kind === 'link').href, href);
  const urls = fetched.requests.map((r) => r.url);
  assert.ok(
    urls.some((u) => u.endsWith('/api/document?partition=DU_200046977&status=document.production'))
  );
  assert.equal(
    urls.some((u) => /partition=DU_200046977$/.test(u)),
    false,
    'the unfiltered page is never asked'
  );
  // The recorded list names the PLUi, the zone the PLUI: the match ignores case.
  const listed = plots.lyon.answers.get('gpu-document').body[0].originalName;
  assert.equal(listed, '200046977_PLUi_20260326');
  assert.notEqual(listed, report.document.version);
});

test('criterion 6: the unfiltered first page (deleted versions only) would find nothing to link', async () => {
  const unfiltered = plots.lyon.answers.get('gpu-document-unfiltered').body;
  assert.ok(Array.isArray(unfiltered) && unfiltered.length > 0);
  assert.equal(
    unfiltered.some((d) => d.originalName.toUpperCase() === '200046977_PLUI_20260326'),
    false
  );
  // Served in place of the filtered list, it reads as "a newer document", never a wrong link.
  const { report } = await readOnce('lyon', {
    overrides: { 'gpu-document': answering(200, unfiltered) }
  });
  assert.equal(report.document.href, undefined);
  assert.ok(
    report.overview.some(
      (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.newerDocument'
    )
  );
});

test('criterion 6: a grid lists other sectors; another partition’s document is never linked', async () => {
  // A PLUi in sectors is listed by its EPCI's grid, every sector together.
  const listed = plots.lyon.answers.get('gpu-document').body;
  assert.equal(listed[0].name, 'DU_200046977');
  const elsewhere = listed.map((d) => ({ ...d, name: 'DU_200046977_B' }));
  const { report } = await readOnce('lyon', {
    overrides: { 'gpu-document': answering(200, elsewhere) }
  });
  assert.equal(report.document.href, undefined);
});

test('criterion 6: a missing file leaves no link and a message; the document is still shown', async () => {
  for (const override of [answering(200, [{ name: 'other.pdf' }]), answering(404, null)]) {
    const { report } = await readOnce('lyon', { overrides: { 'gpu-files': override } });
    assert.equal(report.document.version, '200046977_PLUI_20260326');
    assert.equal(report.document.href, undefined);
    assert.equal(
      report.overview.some((b) => b.kind === 'link'),
      false
    );
    assert.ok(
      report.overview.some(
        (b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.fileNotFound'
      )
    );
  }
});

// ── Criterion 7: the URLs actually asked ────────────────────────────────────────

test('criterion 7: no URL asked reaches acte-sup, /details or /download; pprn by longitude/latitude; Lyon’s risks by 69123', async () => {
  for (const plot of PLOTS) {
    const { fetched } = await readOnce(plot);
    for (const { url } of fetched.requests) {
      assert.doesNotMatch(url, /acte-sup|\/details|\/download/);
    }
    const pprn = fetched.requests.find((r) => r.url.includes('gaspar/pprn')).url;
    assert.match(pprn, /longitude=/);
    assert.match(pprn, /latitude=/);
    assert.doesNotMatch(pprn, /latlon/);
  }
  const { fetched } = await readOnce('lyon');
  const urls = fetched.requests.map((r) => r.url);
  assert.ok(urls.includes('https://georisques.gouv.fr/api/v1/gaspar/risques?code_insee=69123'));
  assert.ok(urls.includes('https://georisques.gouv.fr/api/v1/zonage_sismique?code_insee=69123'));
  assert.ok(urls.includes('https://georisques.gouv.fr/api/v1/radon?code_insee=69123'));
  assert.equal(
    urls.some((u) => /gaspar\/risques\?code_insee=69382|zonage_sismique\?code_insee=69382/.test(u)),
    false
  );
});

test('radon: an empty commune answer is asked again with the arrondissement (probe 2026-10-20)', async () => {
  const { report, fetched } = await readOnce('lyon');
  const urls = fetched.requests.map((r) => r.url);
  assert.ok(urls.includes('https://georisques.gouv.fr/api/v1/radon?code_insee=69382'));
  assert.equal(report.flags.find((f) => f.kind === 'radon').label.params.class, '1');
});

// ── Criterion 8: incomplete and suspect answers ─────────────────────────────────

test('criterion 8: a total past the features returned is `incomplete`; more than 50 PPRs is `suspect`', async () => {
  const zones = plots.lyon.answers.get('apicarto-zone-urba').body;
  const incomplete = { ...zones, totalFeatures: 5, numberMatched: 5 };
  const pprs = {
    totalElements: 6585,
    totalPages: 659,
    pageNumber: 0,
    pageSize: 10,
    content: [{ idGaspar: 'X', libPpr: 'Y' }]
  };
  const { report } = await readOnce('lyon', {
    overrides: {
      'apicarto-zone-urba': answering(200, incomplete),
      'georisques-gaspar-pprn': answering(200, pprs)
    }
  });
  assert.equal(source(report, 'zone-urba').state, 'unavailable');
  assert.equal(source(report, 'zone-urba').detail.key, 'fr-urban-rules.status.incomplete');
  assert.equal(
    report.features.some((f) => f.category === 'zone'),
    false
  );
  assert.equal(source(report, 'georisques-pprn').state, 'unavailable');
  assert.deepEqual(source(report, 'georisques-pprn').detail, {
    key: 'fr-urban-rules.status.suspect',
    params: { count: 6585 }
  });
  assert.equal(
    report.flags.some((f) => f.id === 'ppr-X'),
    false
  );
});

// ── Criterion 9: conversions are the platform's ────────────────────────────────

test('criterion 9: every feature came through fromGeographicRing; a Lyon zone vertex lands on its recorded Lambert-93 value', async () => {
  const { report, siteService } = await readOnce('lyon');
  assert.ok(siteService.calls.fromGeographicRing > 0);
  assert.ok(siteService.calls.toGeographicRing > 0);
  const raw =
    plots.lyon.answers.get('apicarto-zone-urba').body.features[0].geometry.coordinates[0][0][0];
  const recorded = plots.lyon.conversions.fromGeographic.find(
    ([lon, lat]) => lon === raw[0] && lat === raw[1]
  );
  assert.ok(recorded, 'the zone’s first vertex was converted by the platform');
  const zone = report.features.find((f) => f.category === 'zone');
  const first = zone.rings[0][0];
  assert.ok(Math.hypot(first.easting - recorded[2], first.northing - recorded[3]) < 1);
  // And it is in Lambert-93, near the parcel.
  const parcel = plots.lyon.site.parcels[0].rings[0][0];
  assert.ok(Math.hypot(first.easting - parcel.easting, first.northing - parcel.northing) < 5000);
  // Rings are sent without their closing point (DEC-3).
  for (const feature of report.features) {
    for (const ring of feature.rings ?? []) {
      const a = ring[0];
      const b = ring[ring.length - 1];
      assert.ok(a.easting !== b.easting || a.northing !== b.northing);
    }
  }
});

test('criterion 9: a point the platform never converted fails that source, logged, rather than being converted here', async () => {
  const zones = structuredClone(plots.lyon.answers.get('apicarto-zone-urba').body);
  zones.features[0].geometry.coordinates[0][0][1][0] += 1e-6;
  const { report, logs } = await readOnce('lyon', {
    overrides: { 'apicarto-zone-urba': answering(200, zones) }
  });
  assert.equal(source(report, 'zone-urba').state, 'unavailable');
  assert.deepEqual(source(report, 'zone-urba').detail, { key: 'fr-urban-rules.status.malformed' });
  assert.ok(
    logs.some((m) => /zone-urba could not be read: .*not in the recorded conversion table/.test(m))
  );
  assert.equal(
    report.features.some((f) => f.category === 'zone'),
    false
  );
  assert.ok(
    report.features.some((f) => f.category === 'easement'),
    'the other sources still fill'
  );
});

test('review 1: malformed elements never reject the read', async () => {
  // A null among the zones is dropped; the rest is read.
  const zones = structuredClone(plots.lyon.answers.get('apicarto-zone-urba').body);
  zones.features.push(null, 7, 'x');
  const withNulls = await readOnce('lyon', {
    overrides: { 'apicarto-zone-urba': answering(200, zones) }
  });
  assert.equal(source(withNulls.report, 'zone-urba').state, 'ready');
  assert.deepEqual(
    withNulls.report.zones.map((z) => z.label.text),
    ['UCe1b']
  );

  // Only nulls: an empty zone answer, not a failure and not a throw.
  const onlyNull = await readOnce('lyon', {
    overrides: {
      'apicarto-zone-urba': answering(200, { type: 'FeatureCollection', features: [null] })
    }
  });
  assert.equal(onlyNull.report.regime.code, 'plui');
  assert.equal(source(onlyNull.report, 'zone-urba').state, 'ready');

  // A municipality of nulls has no commune: `unknown`, never `not_published`.
  const municipality = await readOnce('lyon', {
    overrides: {
      'apicarto-municipality': answering(200, { type: 'FeatureCollection', features: [null] })
    }
  });
  assert.equal(municipality.report.regime.code, 'unknown');

  // Null coordinates: the item is listed without geometry, said as an assumption.
  const prescriptions = structuredClone(plots.lyon.answers.get('apicarto-prescription-surf').body);
  prescriptions.features[0].geometry.coordinates[0][0][2] = [null, null];
  prescriptions.features[1].geometry = { type: 'MultiPolygon', coordinates: [[null]] };
  const nulls = await readOnce('lyon', {
    overrides: { 'apicarto-prescription-surf': answering(200, prescriptions) }
  });
  assert.equal(source(nulls.report, 'prescription-surf').state, 'ready');
  const first = nulls.report.features.find((f) => f.id === prescriptions.features[0].id);
  assert.equal(first.rings, undefined);
  assert.ok(nulls.report.assumptions.some((a) => a.id === 'unconverted'));
  assert.equal(view(nulls.report, 'prescriptions').blocks[0].rows.length, 14);
});

test('review 4: an answer that drifted is `unknown`, never `not_published`', async () => {
  const municipality = structuredClone(plots.lyon.answers.get('apicarto-municipality').body);
  for (const f of municipality.features) f.properties.is_rnu = 'false';
  const rnu = await readOnce('lyon', {
    overrides: { 'apicarto-municipality': answering(200, municipality) }
  });
  assert.equal(rnu.report.regime.code, 'unknown');
  assert.ok(rnu.logs.some((m) => /is_rnu=false/.test(m)));

  const documents = structuredClone(plots.lyon.answers.get('apicarto-document').body);
  for (const f of documents.features) delete f.properties.partition;
  const doc = await readOnce('lyon', {
    overrides: { 'apicarto-document': answering(200, documents) }
  });
  assert.equal(doc.report.regime.code, 'unknown');
  assert.ok(doc.logs.some((m) => /none usable/.test(m)));

  const unknownType = structuredClone(plots.lyon.answers.get('apicarto-document').body);
  for (const f of unknownType.features) f.properties.du_type = 'XYZ';
  const typed = await readOnce('lyon', {
    overrides: { 'apicarto-document': answering(200, unknownType) }
  });
  assert.equal(typed.report.regime.code, 'unknown');
});

test('review 2: a seismic answer for another commune only is empty, never borrowed', async () => {
  const other = {
    results: 1,
    page: 1,
    total_pages: 1,
    data: [{ code_insee: '69266', code_zone: '3', zone_sismicite: '3 - MODEREE' }]
  };
  const { report } = await readOnce('lyon', {
    overrides: { 'georisques-zonage_sismique-69123': answering(200, other) }
  });
  assert.equal(
    report.flags.some((f) => f.kind === 'seismic'),
    false
  );
  assert.equal(source(report, 'georisques-sismique').state, 'ready');
  assert.deepEqual(source(report, 'georisques-sismique').detail, {
    key: 'fr-urban-rules.status.empty'
  });
});

test('review 8: an empty 200 body is "nothing published" for every Géorisques read', async () => {
  const empty = answering(200, null);
  const { report } = await readOnce('lyon', {
    overrides: {
      'georisques-gaspar-risques-69123': empty,
      'georisques-gaspar-pprn': empty,
      'georisques-zonage_sismique-69123': empty,
      'georisques-rga': empty,
      'georisques-radon-69123': empty,
      'georisques-radon-69382': empty
    }
  });
  for (const id of [
    'georisques-risques',
    'georisques-pprn',
    'georisques-sismique',
    'georisques-rga',
    'georisques-radon'
  ]) {
    assert.equal(source(report, id).state, 'ready', id);
    assert.deepEqual(source(report, id).detail, { key: 'fr-urban-rules.status.empty' }, id);
  }
});

test('DEC-3: the query is a MultiPolygon of the parcel, closed and rounded to 7 decimals', async () => {
  const { fetched } = await readOnce('lyon');
  const url = new URL(fetched.requests.find((r) => r.url.includes('/gpu/zone-urba')).url);
  const geom = JSON.parse(url.searchParams.get('geom'));
  assert.equal(geom.type, 'MultiPolygon');
  const ring = geom.coordinates[0][0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  for (const [lon, lat] of ring) {
    assert.equal(Math.round(lon * 1e7) / 1e7, lon);
    assert.equal(Math.round(lat * 1e7) / 1e7, lat);
  }
});

test('DEC-3: a CRS the build does not project falls back to the anchor point, said as an assumption', async () => {
  const { site, conversions } = plots.brouennes;
  const service = recordedSiteService(site, conversions, { unprojected: true });
  const { report, fetched } = await readOnce('brouennes', { service });
  assert.equal(report.regime.code, 'rnu');
  assert.ok(report.assumptions.some((a) => a.id === 'anchor-only'));
  const geom = JSON.parse(new URL(fetched.requests[0].url).searchParams.get('geom'));
  assert.equal(geom.type, 'Point');
});

test('DEC-3: a Site whose CRS moved during the read produces no report', async () => {
  const { site, conversions } = plots.lyon;
  const service = recordedSiteService(site, conversions, {
    current: { ...site, crs: 'EPSG:3857' }
  });
  const context = readerFor('lyon', { service });
  await assert.rejects(
    context.reader.read(requestFor(site), { signal: new AbortController().signal }),
    { name: 'AbortError' }
  );
  assert.equal(context.fetched.requests.length, 0);
});

test('no Site service: an `unknown` report saying so, and no request', async () => {
  const { answers } = plots.lyon;
  const fetched = recordedFetch(answers);
  const reader = createReader({ fetch: fetched.fetch, site: () => undefined });
  const report = await reader.read(requestFor(plots.lyon.site), {
    signal: new AbortController().signal
  });
  assert.equal(report.regime.code, 'unknown');
  assert.equal(report.overview[0].text.key, 'fr-urban-rules.notice.noSite');
  assert.equal(fetched.requests.length, 0);
});

// ── Criterion 10: a newer read supersedes ───────────────────────────────────────

test('criterion 10: a second read aborts the first, which produces no report', async () => {
  let release = true;
  const { answers } = plots.lyon;
  const fetched = recordedFetch(answers, {
    'apicarto-zone-urba': (url, init) => {
      if (release) {
        release = false;
        return hanging()(url, init);
      }
      return answering(200, answers.get('apicarto-zone-urba').body)();
    }
  });
  const service = recordedSiteService(plots.lyon.site, plots.lyon.conversions);
  const reader = createReader({ fetch: fetched.fetch, site: () => service, now: clock() });
  const firstProgress = [];
  const first = reader.read(requestFor(plots.lyon.site), {
    signal: new AbortController().signal,
    progress: (r) => firstProgress.push(r)
  });
  // Let the first read reach its hanging zone request.
  while (!fetched.requests.some((r) => r.url.includes('/gpu/zone-urba')))
    await new Promise((r) => setTimeout(r, 1));
  const seen = firstProgress.length;
  const second = reader.read(requestFor(plots.lyon.site), { signal: new AbortController().signal });
  await assert.rejects(first, { name: 'AbortError' });
  const report = await second;
  assert.equal(report.regime.code, 'plui');
  assert.equal(firstProgress.length, seen, 'no progress from the superseded read');
});

test('the host’s signal aborts a read too', async () => {
  const controller = new AbortController();
  const context = readerFor('lyon', { overrides: { 'apicarto-zone-urba': hanging() } });
  const pending = context.reader.read(requestFor(context.site), { signal: controller.signal });
  while (!context.fetched.requests.some((r) => r.url.includes('/gpu/zone-urba')))
    await new Promise((r) => setTimeout(r, 1));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

// ── Criterion 11: the cache and the last good read ──────────────────────────────

test('criterion 11: a `site` or `design` read of a cached plot sends no request; `refresh` sends every one again', async () => {
  const context = readerFor('lyon');
  const signal = new AbortController().signal;
  const first = await context.reader.read(requestFor(context.site, 'site'), { signal });
  const count = context.fetched.requests.length;
  assert.ok(count > 15);
  const again = await context.reader.read(requestFor(context.site, 'site'), { signal });
  const design = await context.reader.read(requestFor(context.site, 'design'), { signal });
  assert.equal(context.fetched.requests.length, count);
  assert.deepEqual(again, first);
  assert.deepEqual(design, first);
  await context.reader.read(requestFor(context.site, 'refresh'), { signal });
  assert.equal(context.fetched.requests.length, count * 2);
});

test('criterion 11: a refresh whose source fails shows the cached answer, its earlier date and `saved`', async () => {
  let failing = false;
  const zone = plots.lyon.answers.get('apicarto-zone-urba').body;
  const context = readerFor('lyon', {
    overrides: {
      'apicarto-zone-urba': (url, init) =>
        failing ? answering(503, null)() : answering(200, zone)()
    }
  });
  const signal = new AbortController().signal;
  const first = await context.reader.read(requestFor(context.site), { signal });
  failing = true;
  const refreshed = await context.reader.read(requestFor(context.site, 'refresh'), { signal });
  const before = source(first, 'zone-urba');
  const after = source(refreshed, 'zone-urba');
  // Sprint 002.11's review (SDK 1.33): an earlier reading shown is `saved`, never `unavailable`.
  assert.equal(after.state, 'saved');
  assert.equal(after.retrievedAt, before.retrievedAt);
  assert.equal(after.detail.key, 'fr-urban-rules.status.shownAsRead');
  assert.ok(new Date(source(refreshed, 'document').retrievedAt) > new Date(before.retrievedAt));
  assert.deepEqual(refreshed.zones, first.zones);
  assert.ok(refreshed.features.some((f) => f.category === 'zone'));
});

test('DEC-9: a plot whose ring moved by more than a centimetre has another key, and misses the cache', async () => {
  const { __testing } = await import('../src/index.js');
  const context = readerFor('lyon');
  const moved = structuredClone(context.site);
  moved.parcels[0].rings[0][1].easting += 0.5;
  assert.notEqual(__testing.plotKey(moved), __testing.plotKey(context.site));
  const jitter = structuredClone(context.site);
  jitter.parcels[0].rings[0][1].easting += 0.001;
  assert.equal(__testing.plotKey(jitter), __testing.plotKey(context.site));
  const signal = new AbortController().signal;
  await context.reader.read(requestFor(context.site), { signal });
  const count = context.fetched.requests.length;
  // Not answered from the cache: the reader converts the moved ring, whose
  // vertex the platform never converted, so the read fails before any request.
  await assert.rejects(context.reader.read(requestFor(moved), { signal }), /not in the recorded/);
  assert.equal(context.fetched.requests.length, count);
});

test('review 3: an `unknown` report is never answered from memory', async () => {
  let fail = true;
  const municipality = plots.lyon.answers.get('apicarto-municipality').body;
  const context = readerFor('lyon', {
    overrides: {
      'apicarto-municipality': () =>
        fail ? answering(503, null)() : answering(200, municipality)()
    }
  });
  const signal = new AbortController().signal;
  const first = await context.reader.read(requestFor(context.site), { signal });
  assert.equal(first.regime.code, 'unknown');
  const count = context.fetched.requests.length;
  fail = false;
  const second = await context.reader.read(requestFor(context.site, 'site'), { signal });
  assert.ok(context.fetched.requests.length > count, 'asked again');
  assert.equal(second.regime.code, 'plui');
});

test('review 3: a report with an unavailable source is answered from memory for five minutes only', async () => {
  let at = Date.UTC(2026, 9, 20, 8, 0);
  const now = () => new Date(at);
  const context = readerFor('lyon', { overrides: { 'georisques-rga': answering(503, null) }, now });
  const signal = new AbortController().signal;
  await context.reader.read(requestFor(context.site), { signal });
  const count = context.fetched.requests.length;
  at += 4 * 60_000;
  await context.reader.read(requestFor(context.site, 'design'), { signal });
  assert.equal(context.fetched.requests.length, count, 'within five minutes: memory');
  at += 2 * 60_000;
  await context.reader.read(requestFor(context.site, 'design'), { signal });
  assert.equal(context.fetched.requests.length, count * 2, 'past five minutes: read again');
});

test('review 6: the cache keeps the last 20 plots; dispose aborts the read in flight and forgets', async () => {
  const context = readerFor('lyon', { overrides: { 'apicarto-zone-urba': hanging() } });
  const pending = context.reader.read(requestFor(context.site), {
    signal: new AbortController().signal
  });
  while (!context.fetched.requests.some((r) => r.url.includes('/gpu/zone-urba')))
    await new Promise((r) => setTimeout(r, 1));
  context.reader.dispose();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(context.reader.cache.size, 0);

  const filled = readerFor('lyon');
  for (let i = 0; i < 25; i += 1) filled.reader.cache.set(`k${i}`, { good: {} });
  await filled.reader.read(requestFor(filled.site), { signal: new AbortController().signal });
  assert.equal(filled.reader.cache.size, 20);
  assert.equal(filled.reader.cache.has('k0'), false);
});

test('review 8: a plot past 6,000 encoded characters is read by POST, end to end', async () => {
  const { site } = plots.lyon;
  const big = structuredClone(site);
  const ring = [];
  for (let i = 0; i < 400; i += 1) {
    const angle = (2 * Math.PI * i) / 400;
    ring.push({
      easting: 842640 + 20 * Math.cos(angle) + (i % 3) * 0.01,
      northing: 6519880 + 20 * Math.sin(angle)
    });
  }
  big.parcels[0].rings = [ring];
  const { report, fetched } = await readOnce('lyon', { site: big, service: scaledService(big) });
  const posts = fetched.requests.filter((r) => r.method === 'POST');
  assert.ok(posts.length >= 10);
  for (const post of posts) {
    assert.match(post.url, /^https:\/\/apicarto\.ign\.fr\/api\/gpu\/[a-z-]+$/);
    assert.equal(JSON.parse(post.body).geom.type, 'MultiPolygon');
  }
  assert.equal(report.regime.code, 'plui');
});

// ── Criterion 14: overview and views ────────────────────────────────────────────

test('criterion 14: the overview carries fields, link, flags and sources; the four views have stable ids', async () => {
  const { report } = await readOnce('lyon');
  const kinds = report.overview.map((b) => b.kind);
  // 002.6a: no plugin service here, so the not-available notice follows the link.
  assert.deepEqual(kinds, ['fields', 'link', 'notice', 'flags', 'sources']);
  assert.equal(report.overview[2].text.key, 'fr-urban-rules.notice.writtenRulesUnavailable');
  const ids = report.views.map((v) => v.id);
  for (const id of ['zone', 'prescriptions', 'easements', 'risks']) assert.ok(ids.includes(id), id);
  for (const id of ids) assert.match(id, /^[a-z0-9-]{1,64}$/);
  const second = await readOnce('lyon');
  assert.deepEqual(
    second.report.views.map((v) => v.id),
    ids
  );
});

test('criterion 14: `rnu` and `not_published` reports carry no zone view; not_published carries its notice', async () => {
  const rnu = (await readOnce('brouennes')).report;
  const unpublished = (await readOnce('rochefort')).report;
  assert.equal(view(rnu, 'zone'), undefined);
  assert.equal(view(unpublished, 'zone'), undefined);
  assert.equal(unpublished.overview[0].text.key, 'fr-urban-rules.notice.notPublished');
  assert.equal(unpublished.overview[0].tone, 'warning');
  for (const report of [rnu, unpublished]) {
    for (const id of report.views.map((v) => v.id)) assert.match(id, /^[a-z0-9-]{1,64}$/);
  }
});

test('DEC-12: an empty view is still listed, with a notice saying there is none', async () => {
  const { report } = await readOnce('brouennes');
  const easements = view(report, 'easements');
  assert.equal(easements.blocks[0].kind, 'notice');
  assert.equal(easements.blocks[0].text.key, 'fr-urban-rules.notice.noEasement');
});

// ── Criteria 15 and 16: the host's limits ───────────────────────────────────────

const pointsOf = (report) =>
  report.features.reduce(
    (sum, f) => sum + (f.rings ?? []).reduce((a, r) => a + r.length, 0) + (f.line?.length ?? 0),
    0
  );

test('criterion 15: Lyon’s report stays under 100,000 points and 2,000 features', async () => {
  const { report, progress } = await readOnce('lyon');
  for (const r of [report, ...progress]) {
    assert.ok(pointsOf(r) <= 100_000);
    assert.ok(r.features.length <= 2000);
  }
  const raw = ['zone-urba', 'prescription-surf', 'info-surf', 'assiette-sup-s']
    .map((name) => JSON.stringify(plots.lyon.answers.get(`apicarto-${name}`).body))
    .reduce((sum, json) => sum + (json.match(/\[-?\d+(\.\d+)?,-?\d+(\.\d+)?\]/g) ?? []).length, 0);
  assert.ok(pointsOf(report) < raw, `simplified ${pointsOf(report)} < raw ${raw}`);
});

/** A Site service converting by a plain scale: only for synthetic geometry, never for recorded points. */
function scaledService(site) {
  const scale = 1e5;
  return {
    current: () => site,
    toGeographicRing: (ring) =>
      ring.map((p) => ({ longitude: p.easting / scale, latitude: p.northing / scale })),
    fromGeographicRing: (ring) =>
      ring.map((p) => ({ easting: p.longitude * scale, northing: p.latitude * scale }))
  };
}

test('criterion 15: a 200,000-point zone is sent without rings, with the assumption', async () => {
  const { site } = plots.lyon;
  const ring = [];
  for (let i = 0; i < 200_000; i += 1) {
    const angle = (2 * Math.PI * i) / 200_000;
    const radius = 1000 + (i % 2 === 0 ? 0 : 1); // a zigzag no simplification removes
    ring.push([
      (842640 + radius * Math.cos(angle)) / 1e5,
      (6519880 + radius * Math.sin(angle)) / 1e5
    ]);
  }
  ring.push(ring[0]);
  const zones = structuredClone(plots.lyon.answers.get('apicarto-zone-urba').body);
  zones.features[0].geometry = { type: 'MultiPolygon', coordinates: [[ring]] };
  const { report } = await readOnce('lyon', {
    service: scaledService(site),
    overrides: { 'apicarto-zone-urba': answering(200, zones) }
  });
  const zone = report.features.find((f) => f.category === 'zone');
  assert.equal(zone.rings, undefined);
  assert.ok(report.assumptions.some((a) => a.id === 'outline-too-detailed'));
  assert.ok(pointsOf(report) <= 100_000);
  assert.ok(report.overview.some((b) => b.kind === 'assumptions'));
});

test('DEC-14: past 1,900 features the rest are listed and counted, never sent', async () => {
  const { site } = plots.lyon;
  const many = {
    type: 'FeatureCollection',
    totalFeatures: 2100,
    features: Array.from({ length: 2100 }, (_, i) => ({
      type: 'Feature',
      id: `info_pct.${i}`,
      geometry: { type: 'Point', coordinates: [8.4264, 65.1988] },
      properties: { libelle: `Point ${i}`, typeinf: '99' }
    }))
  };
  const { report } = await readOnce('lyon', {
    service: scaledService(site),
    overrides: { 'apicarto-info-pct': answering(200, many) }
  });
  assert.ok(report.features.length <= 1900);
  const blocks = view(report, 'information').blocks;
  assert.ok(
    blocks.some((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.notDrawn')
  );
  assert.ok(
    blocks.some((b) => b.kind === 'notice' && b.text.key === 'fr-urban-rules.notice.notListed')
  );
  assert.equal(blocks[0].rows.length, 200);
});

/**
 * The host's string limits (platform `regulation-source-registry.ts`): a key,
 * a text or a parameter within 2,000 characters, except a passage, a zone's
 * description, a flag's, a source's, a fields row's or a heading's detail and
 * a notice's text, within 10,000.
 */
function checkStrings(report) {
  const problems = [];
  const phrase = (value, cap, where) => {
    if (value === undefined) return problems.push(`${where}: missing`);
    if (typeof value.key === 'string') {
      if (value.key.length === 0 || value.key.length > 2000) problems.push(`${where}: key`);
      for (const [name, param] of Object.entries(value.params ?? {})) {
        if (typeof param === 'string' ? param.length > 2000 : !Number.isFinite(param))
          problems.push(`${where}.${name}`);
      }
    } else if (typeof value.text !== 'string' || value.text.length > cap) {
      problems.push(`${where}: text of ${value.text?.length}`);
    }
  };
  const optional = (value, cap, where) => value !== undefined && phrase(value, cap, where);
  phrase(report.regime.label, 2000, 'regime');
  if (report.document) {
    phrase(report.document.title, 2000, 'document.title');
    optional(report.document.status, 2000, 'document.status');
  }
  for (const z of report.zones) {
    phrase(z.label, 2000, `zone ${z.id}`);
    optional(z.description, 10_000, `zone ${z.id} description`);
  }
  for (const f of report.features) phrase(f.label, 2000, `feature ${f.id}`);
  for (const f of report.flags) {
    phrase(f.label, 2000, `flag ${f.id}`);
    optional(f.detail, 10_000, `flag ${f.id} detail`);
  }
  for (const s of report.sources) {
    phrase(s.name, 2000, `source ${s.id}`);
    optional(s.detail, 10_000, `source ${s.id} detail`);
  }
  for (const a of report.assumptions) phrase(a.text, 10_000, `assumption ${a.id}`);
  if (report.attribution.length > 2000) problems.push('attribution');
  const blocks = (list, where) => {
    for (const b of list) {
      if (b.kind === 'fields') {
        if (b.rows.length > 200) problems.push(`${where}: rows`);
        for (const r of b.rows) {
          phrase(r.label, 2000, `${where} row`);
          phrase(r.value, 2000, `${where} value`);
          optional(r.detail, 10_000, `${where} detail`);
        }
      } else if (b.kind === 'table') {
        if (b.columns.length > 6 || b.rows.length > 200) problems.push(`${where}: table size`);
        b.columns.forEach((c) => phrase(c, 2000, `${where} column`));
        for (const row of b.rows) {
          if (row.length !== b.columns.length) problems.push(`${where}: row length`);
          row.forEach((cell) => phrase(cell, 2000, `${where} cell`));
        }
      } else if (b.kind === 'notice') {
        phrase(b.text, 10_000, `${where} notice`);
      } else if (b.kind === 'link') {
        phrase(b.label, 2000, `${where} link`);
        if (!/^https:\/\//.test(b.href)) problems.push(`${where}: href`);
      }
    }
  };
  blocks(report.overview, 'overview');
  for (const v of report.views) {
    phrase(v.label, 2000, `view ${v.id}`);
    blocks(v.blocks, `view ${v.id}`);
  }
  return problems;
}

test('criterion 16: every recorded report keeps within the host’s string limits, every label present', async () => {
  for (const plot of PLOTS) {
    const { report, progress } = await readOnce(plot);
    for (const r of [report, ...progress]) assert.deepEqual(checkStrings(r), [], plot);
  }
});

test('criterion 16: an overlong label and description are cut and said, never dropped', async () => {
  const zones = structuredClone(plots.lyon.answers.get('apicarto-zone-urba').body);
  zones.features[0].properties.libelle = 'U'.repeat(3000);
  zones.features[0].properties.libelong = 'L'.repeat(12_000);
  const { report } = await readOnce('lyon', {
    overrides: { 'apicarto-zone-urba': answering(200, zones) }
  });
  assert.deepEqual(checkStrings(report), []);
  const zone = report.zones[0];
  assert.equal(zone.label.text.length, 2000);
  assert.ok(zone.label.text.endsWith('[…]'));
  assert.equal(zone.description.text.length, 10_000);
  assert.ok(report.features.some((f) => f.category === 'zone'));
});

test('a read writes nothing: no package-data write, whatever the regime (002.1a writes only from an action)', async () => {
  for (const plot of PLOTS) {
    let writes = 0;
    const { site, conversions, answers } = plots[plot];
    const reader = createReader({
      fetch: recordedFetch(answers).fetch,
      site: () => recordedSiteService(site, conversions),
      packageData: () => ({ read: () => undefined, write: () => ((writes += 1), true) })
    });
    await reader.read(requestFor(site), { signal: new AbortController().signal });
    assert.equal(writes, 0, plot);
  }
});
