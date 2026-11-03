/**
 * Sprint 002.21: a written height held to a strip along the limits, and the setback it lifts. The
 * service is a fake that answers from the recorded Lyon result with the rules of the test; the
 * Marseille UD rules (real model answers) come from `test-fixtures/fr-urban-rules/marseille-ud`.
 * No network.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __testing, createReader } from '../src/index.js';
import { FIXTURES, loadPlot, recordedFetch, recordedSiteService, requestFor } from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const BASE = 'https://editor.example/plugins-api/com.archisimple.fr-urban-rules/';
const CURRENT = { providerId: 'lmstudio', schemaVersion: 1, promptVersion: 3 };
const p = (easting, northing) => ({ easting, northing });
const BOX = [p(0, 0), p(20, 0), p(20, 30), p(0, 30)];
const SOUTH_ROAD = [
  {
    id: 'r',
    line: [p(-20, -6), p(40, -6)],
    kind: 'road',
    level: 'ground',
    widthMetres: 6,
    name: 'Rue',
    attribution: '© IGN'
  }
];
const signal = () => new AbortController().signal;
const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  text: async () => JSON.stringify(body)
});

let lyon;
let recorded;
let marseille;
before(async () => {
  lyon = await loadPlot('lyon');
  recorded = JSON.parse(await readFile(new URL('lyon/extraction/result.json', FIXTURES), 'utf8'));
  marseille = JSON.parse(
    await readFile(new URL('marseille-ud/strip-answers.json', FIXTURES), 'utf8')
  );
});

const serviceRule = (fields) => ({
  kind: 'boundary_setback',
  sector: null,
  statement: 'limit',
  limit: null,
  page: 126,
  article: '2.2.1.2',
  passage: 'Une règle de test.',
  offset: { start: 1, end: 10 },
  occurrence: { of: 1, chosenBy: 'only' },
  conditions: [],
  exceptions: [],
  sectorUnplaced: false,
  confidence: 'high',
  ...fields
});
const metres = (comparison, value) => ({ kind: 'value', comparison, value, unit: 'm' });
const SETBACK = serviceRule({
  kind: 'boundary_setback',
  limit: metres('min', 5),
  passage:
    'Les constructions doivent être implantées en retrait d’au moins 5 mètres des limites séparatives*.'
});
const LOWER = serviceRule({
  kind: 'height_total',
  limit: metres('max', 2),
  strip: { depth: 5, edges: 'side-rear', permits: true },
  passage:
    'Les constructions dont la hauteur totale n’excède pas 2 mètres peuvent s’implanter dans la bande de 5 mètres à compter des limites séparatives*.'
});
/** The reader's own word for the service's `side_rear`, as the service sends it. */
const onTheWire = (rule) =>
  rule.strip === undefined
    ? rule
    : {
        ...rule,
        strip: {
          depthMetres: rule.strip.depth,
          edges: rule.strip.edges.replace('-', '_'),
          permits: rule.strip.permits
        }
      };

const resultOf = (...rules) => ({
  ...structuredClone(recorded),
  promptVersion: 3,
  rules: rules.map(onTheWire)
});

function store(initial) {
  let held = initial;
  return {
    held: () => held,
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next) => {
        held = structuredClone(next);
        return true;
      }
    }
  };
}

function context({ rules = [], section } = {}) {
  const cached = rules.length === 0 ? undefined : resultOf(...rules);
  const planning = recordedFetch(lyon.answers, {});
  const fetch = async (url) => {
    const parsed = new URL(String(url));
    if (!String(url).startsWith(BASE)) return planning.fetch(url, {});
    const path = parsed.pathname.replace('/plugins-api/com.archisimple.fr-urban-rules/', '');
    if (path === 'v1/chapter')
      return json(200, {
        pages: [121, 144],
        found: 'outline',
        match: 'prefix',
        title: 'Zone UCe1',
        documentPages: 803
      });
    if (path === 'v1/extractions')
      return cached === undefined
        ? json(404, { current: CURRENT, error: 'not_cached' })
        : json(200, { result: cached, current: CURRENT });
    return json(404, { error: 'not_found' });
  };
  const site = { ...lyon.site, boundary: { ring: BOX } };
  const data = store(section);
  const reader = createReader({
    fetch,
    site: () => recordedSiteService(site, lyon.conversions, {}),
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    pluginService: () => ({ locate: async () => ({ baseUrl: BASE }) }),
    packageData: () => data.service,
    document: () => ({ find: () => [] }),
    translate: (key) => key
  });
  return { reader, site, data };
}
const read = (c) => c.reader.read(requestFor(c.site), { signal: signal() });
const act = (c, actionId, target) =>
  c.reader.runAction({ actionId, target, site: c.site }, { signal: signal() });
const view = (report, id) => report.views.find((v) => v.id === id);
const writtenRules = (report) => report.rules.filter((r) => r.provenance === 'written');
const byPassage = (report, start) =>
  writtenRules(report).find((r) => r.citation.passage.text.startsWith(start));
const confirmAction = (report, rule) =>
  view(report, 'rules')
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions)
    .find((a) => a.id === 'confirm' && a.target.ruleId === rule.id);
const area = (ring) =>
  ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a.easting * b.northing - b.easting * a.northing;
  }, 0) / 2;
const envelopeArea = (report) => {
  const feature = report.features.find((f) => f.id === 'envelope');
  return feature === undefined
    ? undefined
    : feature.rings.reduce((sum, ring) => sum + area(ring), 0);
};
const assumptionIds = (report) =>
  (view(report, 'envelope')?.blocks ?? []).find((b) => b.kind === 'assumptions')?.ids ?? [];

async function confirm(c, ...starts) {
  for (const start of starts) {
    const report = await read(c);
    const rule = byPassage(report, start);
    assert.ok(rule, `${start} is listed`);
    const action = confirmAction(report, rule);
    assert.ok(action, `${start} can be confirmed`);
    assert.equal((await act(c, 'confirm', action.target)).status, 'done');
  }
  return read(c);
}

test('002.21: a candidate height with a strip is « N m high within M m of the limits » in words — an `other` rule, never the building’s height — to confirm with its value', async () => {
  const c = context({ rules: [SETBACK, LOWER] });
  const report = await read(c);
  const lower = byPassage(report, 'Les constructions dont la hauteur');
  assert.equal(
    lower.kind,
    'other',
    'the checks and the capacity read height_total: a strip’s height is not it'
  );
  assert.deepEqual(lower.label, { key: 'fr-urban-rules.written.kind.heightStrip' });
  assert.deepEqual(lower.limit, {
    kind: 'value',
    comparison: 'max',
    quantity: { value: 2, unit: 'm' }
  });
  assert.equal(lower.status, 'to_confirm');
  const keys = lower.conditions.map((x) => x.key);
  assert.ok(keys.includes('fr-urban-rules.rule.bandCondition.sideRear'));
  assert.ok(keys.includes('fr-urban-rules.written.stripPermits'));
  assert.deepEqual(
    lower.conditions.find((x) => x.key === 'fr-urban-rules.rule.bandCondition.sideRear').params,
    { depth: 5 }
  );
  assert.deepEqual(confirmAction(report, lower).label, {
    key: 'fr-urban-rules.action.confirmValue',
    params: { value: 2, unit: 'm' }
  });
  const setback = byPassage(report, 'Les constructions doivent');
  assert.equal(setback.kind, 'boundary_setback');
});

test('002.21: the owner’s case — 5 m setback, and 2 m constructions allowed within it: confirming both leaves the strip in the area, as a ceiling', async () => {
  const c = context({ rules: [SETBACK, LOWER] });
  let report = await confirm(c, 'Les constructions doivent');
  // The setback alone cuts 5 m off the side and rear limits: 10 × 25.
  assert.ok(Math.abs(envelopeArea(report) - 250) < 0.05, `${envelopeArea(report)}`);
  report = await confirm(c, 'Les constructions dont');
  assert.ok(
    Math.abs(envelopeArea(report) - 600) < 0.05,
    `the strip is a height-limited place: ${envelopeArea(report)}`
  );
  // The volume: a 2 m ceiling within the strip, nothing over the rest.
  const volume = report.features.find((f) => f.id === 'envelope').volume;
  assert.equal(volume.ceilings.length, 1);
  assert.equal(volume.ceilings[0].kind, 'height');
  assert.equal(volume.ceilings[0].metres, 2);
  assert.ok(
    volume.ceilings[0].within.length >= 2,
    'the boundary and the inner outline, read even–odd'
  );
  // The setback is listed as replaced, with the reason; the list of what narrowed the area has no row for it.
  assert.ok(
    JSON.stringify(view(report, 'envelope')).includes(
      'fr-urban-rules.envelope.reason.liftedByStrip'
    )
  );
  assert.ok(assumptionIds(report).includes('envelope-setback-lifted'));
  for (const id of assumptionIds(report))
    assert.ok(
      report.assumptions.some((a) => a.id === id),
      `${id} is in the report`
    );
});

test('002.21: a strip that does not permit building in it caps the height there and lifts nothing; a setback deeper than the strip stays', async () => {
  const caps = { ...LOWER, strip: { depth: 5, edges: 'side-rear', permits: false } };
  let c = context({ rules: [SETBACK, caps] });
  await confirm(c, 'Les constructions doivent');
  let report = await confirm(c, 'Les constructions dont');
  assert.ok(Math.abs(envelopeArea(report) - 250) < 0.05, 'the setback is cut as it was');
  assert.ok(!assumptionIds(report).includes('envelope-setback-lifted'));
  const deeper = {
    ...SETBACK,
    limit: metres('min', 8),
    passage: SETBACK.passage.replace('5 mètres', '8 mètres')
  };
  c = context({ rules: [deeper, LOWER] });
  await confirm(c, 'Les constructions doivent');
  report = await confirm(c, 'Les constructions dont');
  assert.ok(
    Math.abs(envelopeArea(report) - (20 - 16) * (30 - 8)) < 0.05,
    'a 5 m strip does not cover an 8 m setback'
  );
  assert.ok(!assumptionIds(report).includes('envelope-setback-lifted'));
});

test('002.21: the confirmation stores the strip, and the confirmed pair stands on the section alone — no extraction read now', async () => {
  const c = context({ rules: [SETBACK, LOWER] });
  await confirm(c, 'Les constructions doivent', 'Les constructions dont');
  const section = c.data.held();
  const entry = section.confirmations.find((e) => e.strip !== undefined);
  assert.deepEqual(entry.strip, {
    depth: 5,
    edges: 'side-rear',
    permits: true,
    of: 'height_total'
  });
  assert.equal(entry.kind, 'other');
  const alone = context({ section });
  const report = await read(alone);
  assert.ok(Math.abs(envelopeArea(report) - 600) < 0.05, `${envelopeArea(report)}`);
  assert.equal(report.features.find((f) => f.id === 'envelope').volume.ceilings[0].metres, 2);
});

test('002.21: a façade height held to a strip draws no ceiling, and says so', async () => {
  const facade = { ...LOWER, kind: 'height_facade' };
  const c = context({ rules: [facade] });
  const report = await confirm(c, 'Les constructions dont');
  const rule = byPassage(report, 'Les constructions dont');
  assert.equal(rule.kind, 'other');
  assert.deepEqual(rule.label, { key: 'fr-urban-rules.written.kind.facadeStrip' });
  assert.ok(
    JSON.stringify(view(report, 'envelope')).includes('fr-urban-rules.envelope.reason.heightFacade')
  );
});

test('002.21: a height whose text says « dans une bande de 0 à 4 mètres » read with no strip (the earlier prompt) stays in words — never a limit on the whole building', async () => {
  const old = serviceRule({
    kind: 'height_total',
    limit: metres('max', 4),
    passage:
      'Les nouvelles constructions peuvent s’implanter dans une bande de 0 à 4 mètres à compter de la limite séparative, à condition que leur hauteur totale n’excède pas 4 mètres.'
  });
  const c = context({ rules: [old] });
  const report = await read(c);
  const rule = byPassage(report, 'Les nouvelles constructions');
  assert.equal(rule.statement, 'described');
  assert.equal(rule.limit.kind, 'described');
  assert.ok(rule.conditions.some((x) => x.key === 'fr-urban-rules.written.stripUnstructured'));
  assert.deepEqual(
    confirmAction(report, rule).label,
    { key: 'fr-urban-rules.action.confirm' },
    'no value to confirm'
  );
  // A plain height of the same passage confirmed before strips were read is asked again, not kept.
  const keyed = rule.id;
  const section = {
    schema: 1,
    confirmations: [
      {
        ruleKey: keyed,
        decision: 'confirmed',
        kind: 'height_total',
        value: { kind: 'value', value: 4, unit: 'm' },
        limit: { kind: 'value', comparison: 'max', quantity: { value: 4, unit: 'm' } },
        idurba: '200046977_PLUI_20260326',
        datvalid: '20260326',
        edited: false,
        at: '2026-11-03T10:00:00.000Z',
        provenance: 'written',
        zone: 'UCe1b'
      }
    ]
  };
  const again = await read(context({ rules: [old], section }));
  const reopened = byPassage(again, 'Les nouvelles constructions');
  assert.equal(reopened.status, 'to_confirm');
  assert.ok(reopened.conditions.some((x) => x.key === 'fr-urban-rules.written.stripReopened'));
});

test('002.21: a confirmed setback that has an exception no number states is cut in full, and the area says it is stricter', async () => {
  const withException = {
    ...SETBACK,
    exceptions: ['sauf les extensions de constructions existantes']
  };
  const c = context({ rules: [withException] });
  const report = await confirm(c, 'Les constructions doivent');
  assert.ok(Math.abs(envelopeArea(report) - 250) < 0.05);
  assert.ok(assumptionIds(report).includes('envelope-setback-exceptions'));
  const plain = context({ rules: [SETBACK] });
  assert.ok(
    !assumptionIds(await confirm(plain, 'Les constructions doivent')).includes(
      'envelope-setback-exceptions'
    )
  );
});

test('002.21: Marseille UD — the model’s own answers: the 0–4 m strip is read as a 4 m total height and a 3.5 m façade height with their strip, the 4 m setback as a setback', async () => {
  const pick = (kind, sector) =>
    marseille.find((i) => i.value.kind === kind && i.value.sector === sector && i.value.strip);
  const wire = (item) => ({
    ...serviceRule({
      kind: item.value.kind,
      sector: null,
      limit: item.value.limit,
      confidence: item.value.confidence
    }),
    strip: item.value.strip,
    passage: item.passage
  });
  const total = wire(pick('height_total', 'UDa1'));
  const facade = wire(pick('height_facade', 'UDa1'));
  const setback = wire(
    marseille.find(
      (i) =>
        i.value.kind === 'boundary_setback' &&
        i.value.sector === 'UDa1' &&
        i.value.limit?.value === 4
    )
  );
  setback.exceptions = [];
  const cached = {
    ...structuredClone(recorded),
    promptVersion: 3,
    rules: [setback, total, facade]
  };
  const c = context({});
  // The fake service answers this result for the Lyon zone: the test is about the rules' reading.
  const reader = createReader({
    fetch: async (url) =>
      String(url).startsWith(BASE)
        ? String(url).includes('v1/extractions')
          ? json(200, { result: cached, current: CURRENT })
          : json(200, {
              pages: [121, 144],
              found: 'outline',
              match: 'prefix',
              title: 'Zone UCe1',
              documentPages: 803
            })
        : recordedFetch(lyon.answers, {}).fetch(url, {}),
    site: () =>
      recordedSiteService({ ...lyon.site, boundary: { ring: BOX } }, lyon.conversions, {}),
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    pluginService: () => ({ locate: async () => ({ baseUrl: BASE }) }),
    packageData: () => c.data.service,
    document: () => ({ find: () => [] }),
    translate: (key) => key
  });
  const report = await reader.read(requestFor(c.site), { signal: signal() });
  const strips = writtenRules(report).filter((r) => r.kind === 'other');
  assert.equal(strips.length, 2);
  assert.deepEqual(strips.map((r) => r.limit.quantity.value).sort(), [3.5, 4]);
  for (const r of strips)
    assert.ok(
      r.conditions.some(
        (x) => x.key === 'fr-urban-rules.rule.bandCondition.sideRear' && x.params.depth === 4
      )
    );
});

test('002.21: a strip survives the planning snapshot — stored as the service sent it, read back as the reader holds it', () => {
  const { checkedResult, storedResultOf } = __testing;
  const wire = resultOf(SETBACK, LOWER, {
    ...LOWER,
    kind: 'height_facade',
    limit: metres('max', 1.5)
  });
  const read = checkedResult(wire);
  const back = checkedResult(storedResultOf(read, 'UCe1b'));
  // The snapshot adds each rule's key (DEC-5 of 002.11) and nothing else.
  assert.deepEqual(
    back.rules.map(({ ruleKey, ...rule }) => rule),
    read.rules
  );
  assert.deepEqual(back.rules[1].strip, { depth: 5, edges: 'side-rear', permits: true });
  // A claim the reader could not carry is kept as a claim, never read as a plain height.
  const refused = checkedResult({
    ...wire,
    rules: [{ ...onTheWire(LOWER), strip: { depthMetres: 99, edges: 'side_rear', permits: true } }]
  });
  assert.equal(refused.rules[0].strip, undefined);
  assert.equal(refused.rules[0].stripRefused, true);
  assert.equal(checkedResult(storedResultOf(refused, 'UCe1b')).rules[0].stripRefused, true);
});
