/**
 * Règles d'urbanisme (PLU) — the French planning source (Sprint 002.0, PLU Reading).
 *
 * Registers one `RegulationSource` (`fr-urban-rules.gpu`) on the host's
 * `regulations` service (SDK 1.25, platform ADR-0111). Carte-gouv-fr's France
 * profile names that id in `planningSourceIds`, so a located French project
 * shows a row under Site; the host calls `read` on a Site change, a design
 * change and Refresh, and renders what this file answers.
 *
 * **The extension knows France; the host does not** (Design Contract). Every
 * endpoint, field name (`idurba`, `datvalid`, `typezone`, `nomfic`, `typepsc`,
 * `suptype`…) and code table lives here. What crosses into the host is the
 * SDK's `RegulationReport`, typed by semantic category.
 *
 * **One file, no import.** The Development Repository evaluates this file from
 * a `data:` URL: no bare specifier, no relative import, tokens by name.
 *
 * **No second projection** (DEC-3). API Carto speaks EPSG:4326, the Site its
 * own CRS (EPSG:2154 for France). Every conversion goes through the Site
 * service's `toGeographicRing` / `fromGeographicRing`; nothing here knows the
 * Lambert formula.
 *
 * **Decisions never from a read; readings to the cache.** 002.0 wrote
 * nothing; since 002.1a the user's decisions — edge roles, confirmations,
 * entered rules (002.2) and the Surfaces answers (002.3) — go to the package's
 * own Site section, one Request each, never from a read. The session cache
 * (DEC-9) is memory; since Sprint 002.11 (SDK 1.33, platform ADR-0115) what a
 * read answered is also kept in the project — the package's Site **cache**,
 * off the history, written only when the reading changed — so a project opened
 * elsewhere or offline shows its planning rules at once, « read on <date> »,
 * and checks them again. Since 002.3 the package also registers the
 * `programme` planning-stage enricher (`ai`), which replaced `urban-rules`'.
 *
 * **Its companion service, when the deployment runs it** (Sprint 002.6a, SDK
 * 1.28): found through `plugin-service`'s `locate()`, asked only for a zone's
 * chapter (`GET v1/chapter`), so the regulation opens at the zone's page.
 * Without it, everything above is unchanged.
 */

// ── Identity ───────────────────────────────────────────────────────────────────

const SOURCE_ID = ['fr-urban-rules', 'gpu'].join('.');
const LABEL_KEY = 'fr-urban-rules.source.label';

const RegulationServiceToken = { name: 'regulations' };
const SiteServiceToken = { name: 'site' };
const RoadServiceToken = { name: 'roads' };
const MapFeatureServiceToken = { name: 'map-features' };
const SitePackageDataServiceToken = { name: 'site-package-data' };
const DocumentServiceToken = { name: 'document' };
const I18nServiceToken = { name: 'i18n' };
const PreferencesServiceToken = { name: 'preferences' };
/**
 * Sprint 002.6a (DEC-1): this package's companion service on this deployment
 * (SDK 1.28, platform ADR-0114). Ambient, bound by the host to this package;
 * `'plugin-service'` is public ABI, written by hand like `'site'`.
 */
const PluginServiceToken = { name: 'plugin-service' };

// ── Endpoints (DEC-5, DEC-6, DEC-7) ─────────────────────────────────────────────

const APICARTO_GPU = 'https://apicarto.ign.fr/api/gpu/';
const GPU_DOCUMENT_API = 'https://www.geoportail-urbanisme.gouv.fr/api/document';
const GEORISQUES = 'https://georisques.gouv.fr/api/v1/';
/**
 * Sprint 002.8 DEC-9: the hosts this package's browser code fetches — the
 * three bases above, and nothing else (`fetchJson` refuses any other). The
 * manifest's `network.hosts` (096.13's field, the package card) is this list;
 * `tests/package.test.mjs` holds the two equal. The companion service is
 * "this deployment's service" on the card, never its hosts (RD-3).
 */
const FETCHED_HOSTS = ['apicarto.ign.fr', 'www.geoportail-urbanisme.gouv.fr', 'georisques.gouv.fr'];
/**
 * RD-4: hosts the package only links to — a page the user opens, never a
 * request this code makes — so not on the card. Every other `https://`
 * literal of this file is on one of the two lists (the test reads both).
 */
const LINK_HOSTS = ['www.legifrance.gouv.fr'];

/** Per request (DEC-2): the mockups' "did not answer within 10 s". */
const REQUEST_TIMEOUT_MS = 10_000;

/** Above this, `geom` travels in a POST body (DEC-4; API Carto accepts it, probed 2026-10-20). */
const MAX_GEOM_QUERY_LENGTH = 6000;

/** A report with a source unavailable is answered from memory this long (review 2026-10-20). */
const DEGRADED_TTL_MS = 5 * 60_000;

/** Plots kept in memory: the session's most recent ones. */
const CACHE_PLOTS = 20;

/** `gaspar/pprn` answering more PPRs than this is the `latlon` failure (DEC-6). */
const PPRN_SUSPECT_COUNT = 50;

// ── The zone's page (Sprint 002.6a) ──────────────────────────────────────────────

/** DEC-2: a read waits this long for its zones' chapters, then goes on with what it has. */
const CHAPTER_WAIT_MS = 2000;
/**
 * One `GET chapter`. A miss downloads and parses the règlement on the service
 * (Lyon: 3.5 s; the service's own PDF timeout is 120 s). Nothing waits on it
 * past {@link CHAPTER_WAIT_MS}: a late answer is kept for the next read.
 */
const CHAPTER_TIMEOUT_MS = 150_000;
/**
 * Review fix Q3: a failure that may pass is asked again, backing off — each
 * failed fetch costs the user's 30-an-hour document budget on the service. The
 * GPU failing behind the service (`source_*`, 502) waits five minutes; the
 * service busy or failing (`busy`, `internal_error`), the network, a timeout
 * or an answer that is not the route's waits a minute, as `locate()` re-probes;
 * `rate_limited` waits what its `Retry-After` says, a minute to an hour. A
 * failure that says something about the document is kept for the session.
 * Refresh asks again whatever was kept.
 */
const CHAPTER_RETRY_MS = 60_000;
const CHAPTER_SOURCE_RETRY_MS = 5 * 60_000;
const CHAPTER_RETRY_MAX_MS = 60 * 60_000;
const CHAPTER_SOURCE_CODES = new Set(['source_unavailable', 'source_refused']);
/** Lookups kept in the session map, the most recent last. */
const CHAPTER_ENTRIES = 200;
/** 002.5a DEC-4's input patterns: a zone whose inputs fail them is never asked. */
const CHAPTER_INPUTS = {
  partition: /^DU_[0-9A-Z]{5,9}(?:_[0-9A-Z]{1,4})?$/,
  idurba: /^[0-9A-Za-z_-]{1,64}$/,
  nomfic: /^[0-9A-Za-z_.-]{1,160}\.pdf$/,
  zone: /^[^\p{Cc}]{1,40}$/u
};
const CHAPTER_FOUND = new Set(['outline', 'contents', 'heading']);
const CHAPTER_MATCH = new Set(['exact', 'prefix']);
/** 002.5a DEC-11's codes that describe the document or the request: kept for the session. */
const CHAPTER_LASTING = new Set([
  'invalid_request',
  'not_found',
  'version_changed',
  'document_too_large',
  'not_a_pdf',
  'document_unreadable',
  'no_text_layer',
  'zone_chapter_not_found',
  'chapter_too_large'
]);
/** The link's detail when the page is not known, by the service's code (002.5a DEC-11). */
const CHAPTER_DETAIL_KEYS = new Map([
  ['zone_chapter_not_found', 'fr-urban-rules.link.detailZoneNotFound'],
  ['version_changed', 'fr-urban-rules.link.detailVersionChanged']
]);
const chapterDetailKey = (code) =>
  CHAPTER_DETAIL_KEYS.get(code) ?? 'fr-urban-rules.link.detailPageUnknown';
/** Review fix S3: no règlement this extension opens is longer (Lyon's PLU-H: 803). */
const CHAPTER_DOCUMENT_PAGES_MAX = 2000;

/** Review fix Q3: how long a failed lookup is kept before it is asked again; `undefined` = the session. */
function chapterRetryMs(answer) {
  if (CHAPTER_LASTING.has(answer.failed)) return undefined;
  if (CHAPTER_SOURCE_CODES.has(answer.failed)) return CHAPTER_SOURCE_RETRY_MS;
  if (answer.failed === 'rate_limited' && Number.isFinite(answer.retryAfterSeconds)) {
    return Math.min(
      Math.max(answer.retryAfterSeconds * 1000, CHAPTER_RETRY_MS),
      CHAPTER_RETRY_MAX_MS
    );
  }
  return CHAPTER_RETRY_MS;
}
/** The chapter title a prefix match names in the link's label, at most this long. */
const CHAPTER_TITLE_MAX = 80;

const ATTRIBUTIONS = {
  apicarto: 'IGN — API Carto, Géoportail de l’Urbanisme',
  gpu: 'Géoportail de l’Urbanisme (geoportail-urbanisme.gouv.fr)',
  georisques: 'Géorisques — BRGM, ministère de la Transition écologique (georisques.gouv.fr)'
};

// ── The sources a report is assembled from (DEC-9) ──────────────────────────────

/**
 * Every read, with its translation key and attribution. `skipped` reads (a
 * wave the regime does not need) are not listed in `sources[]`.
 */
const SOURCES = {
  municipality: { key: 'fr-urban-rules.source.municipality', attribution: 'apicarto' },
  document: { key: 'fr-urban-rules.source.document', attribution: 'apicarto' },
  'zone-urba': { key: 'fr-urban-rules.source.zoneUrba', attribution: 'apicarto' },
  'secteur-cc': { key: 'fr-urban-rules.source.secteurCc', attribution: 'apicarto' },
  'prescription-surf': { key: 'fr-urban-rules.source.prescriptionSurf', attribution: 'apicarto' },
  'prescription-lin': { key: 'fr-urban-rules.source.prescriptionLin', attribution: 'apicarto' },
  'prescription-pct': { key: 'fr-urban-rules.source.prescriptionPct', attribution: 'apicarto' },
  'info-surf': { key: 'fr-urban-rules.source.infoSurf', attribution: 'apicarto' },
  'info-lin': { key: 'fr-urban-rules.source.infoLin', attribution: 'apicarto' },
  'info-pct': { key: 'fr-urban-rules.source.infoPct', attribution: 'apicarto' },
  'assiette-sup-s': { key: 'fr-urban-rules.source.assietteSupS', attribution: 'apicarto' },
  'assiette-sup-l': { key: 'fr-urban-rules.source.assietteSupL', attribution: 'apicarto' },
  'assiette-sup-p': { key: 'fr-urban-rules.source.assietteSupP', attribution: 'apicarto' },
  'gpu-files': { key: 'fr-urban-rules.source.gpuFiles', attribution: 'gpu' },
  'georisques-risques': {
    key: 'fr-urban-rules.source.georisquesRisques',
    attribution: 'georisques'
  },
  'georisques-pprn': { key: 'fr-urban-rules.source.georisquesPprn', attribution: 'georisques' },
  'georisques-sismique': {
    key: 'fr-urban-rules.source.georisquesSismique',
    attribution: 'georisques'
  },
  'georisques-rga': { key: 'fr-urban-rules.source.georisquesRga', attribution: 'georisques' },
  'georisques-radon': { key: 'fr-urban-rules.source.georisquesRadon', attribution: 'georisques' }
};

const PRESCRIPTION_LAYERS = ['prescription-surf', 'prescription-lin', 'prescription-pct'];
const INFORMATION_LAYERS = ['info-surf', 'info-lin', 'info-pct'];
const EASEMENT_LAYERS = ['assiette-sup-s', 'assiette-sup-l', 'assiette-sup-p'];
const GEORISQUES_SOURCES = [
  'georisques-risques',
  'georisques-pprn',
  'georisques-sismique',
  'georisques-rga',
  'georisques-radon'
];

// ── Code tables (DEC-8, DEC-11) ─────────────────────────────────────────────────

/** A code table's entry, or `undefined`: a source's `constructor` or `__proto__` is no entry. */
const own = (table, code) => (Object.hasOwn(table, code) ? table[code] : undefined);

/** PLM arrondissements → their commune (DEC-4): Géorisques answers communes. */
function communeOf(insee) {
  if (typeof insee !== 'string') return undefined;
  const code = Number(insee);
  if (code >= 75101 && code <= 75120) return '75056';
  if (code >= 69381 && code <= 69389) return '69123';
  if (code >= 13201 && code <= 13216) return '13055';
  return insee;
}

const isArrondissement = (insee) => communeOf(insee) !== insee;

/**
 * Document types to regimes (DEC-8). POS and PSMV are `plu` labelled "other
 * local plan". The priority orders several documents on one plot: a PSMV
 * governs the plot it covers, before the PLU around it.
 */
const DOCUMENT_TYPES = {
  PSMV: { regime: 'plu', label: 'fr-urban-rules.regime.otherLocalPlan', priority: 0 },
  PLUI: { regime: 'plui', label: 'fr-urban-rules.regime.plui', priority: 1 },
  PLU: { regime: 'plu', label: 'fr-urban-rules.regime.plu', priority: 2 },
  POS: { regime: 'plu', label: 'fr-urban-rules.regime.otherLocalPlan', priority: 3 },
  CC: { regime: 'cc', label: 'fr-urban-rules.regime.cc', priority: 4 }
};

const REGIME_LABELS = {
  rnu: 'fr-urban-rules.regime.rnu',
  not_published: 'fr-urban-rules.regime.notPublished',
  unknown: 'fr-urban-rules.regime.unknown'
};

/** `zone-urba.typezone` (CNIG PLU standard): the zone's kind, said in its label. */
const TYPEZONE_KEYS = {
  U: 'fr-urban-rules.typezone.U',
  AUC: 'fr-urban-rules.typezone.AUc',
  AUS: 'fr-urban-rules.typezone.AUs',
  A: 'fr-urban-rules.typezone.A',
  N: 'fr-urban-rules.typezone.N'
};

/** `secteur-cc.typesect` (CNIG carte communale standard). */
const TYPESECT_KEYS = {
  '01': 'fr-urban-rules.typesect.01',
  '02': 'fr-urban-rules.typesect.02',
  '03': 'fr-urban-rules.typesect.03',
  99: 'fr-urban-rules.typesect.99'
};

/**
 * `typepsc` (CNIG PLU standard, prescriptions). Every code is the category
 * `prescription` (DEC-11); the table only names the type column. Each meaning
 * below is confirmed by a live `libelle` of the probe (2026-10-20, Lyon
 * DU_200046977, and its file list for 05) or by the milestone's probe (§ 4.5:
 * 15, 38, 39, 42, 44); the CNIG PDF itself was not read. Any other code is
 * shown as "type NN" with its verbatim label beside it, and logged.
 */
const TYPEPSC_KEYS = {
  '01': 'fr-urban-rules.typepsc.01',
  '02': 'fr-urban-rules.typepsc.02',
  '05': 'fr-urban-rules.typepsc.05',
  '07': 'fr-urban-rules.typepsc.07',
  15: 'fr-urban-rules.typepsc.15',
  17: 'fr-urban-rules.typepsc.17',
  18: 'fr-urban-rules.typepsc.18',
  22: 'fr-urban-rules.typepsc.22',
  23: 'fr-urban-rules.typepsc.23',
  38: 'fr-urban-rules.typepsc.38',
  39: 'fr-urban-rules.typepsc.39',
  42: 'fr-urban-rules.typepsc.42',
  44: 'fr-urban-rules.typepsc.44'
};

/**
 * Easement types (SUP nomenclature) to category and flag (DEC-11). Any other
 * `suptype` is an `easement` with no flag, shown and never dropped.
 */
const SUPTYPES = {
  ac1: { category: 'easement', flag: 'abf' },
  ac4: { category: 'easement', flag: 'abf' },
  ac2: { category: 'easement', flag: 'site' },
  pm1: { category: 'risk', flag: 'ppr' },
  pm3: { category: 'risk', flag: 'ppr' },
  el7: { category: 'alignment' }
};

const FLAG_KEYS = {
  abf: 'fr-urban-rules.flag.abf',
  site: 'fr-urban-rules.flag.site',
  ppr: 'fr-urban-rules.flag.pprEasement'
};

/**
 * Sprint 002.14 (platform 096.25, SDK 1.37): what each flag kind says to the host's Risks view —
 * an icon and a group (the SDK's closed words), a short title and, for an easement, the source's
 * own code. Titles shorten the label by the easement's category (the SUP nomenclature: AC1,
 * protection of monuments historiques; AC4, the heritage protection zones); a mixed set reads as
 * the generic heritage title, never as a guess.
 */
const FLAG_PRESENTATION = {
  abf: { icon: 'heritage', group: 'constraint' },
  site: { icon: 'heritage', group: 'constraint' },
  ppr: { icon: 'easement', group: 'constraint' }
};
const FLAG_TITLE_KEYS = {
  abf: 'fr-urban-rules.flag.title.abf',
  abfAc1: 'fr-urban-rules.flag.title.abfAc1',
  abfAc4: 'fr-urban-rules.flag.title.abfAc4',
  site: 'fr-urban-rules.flag.title.site',
  ppr: 'fr-urban-rules.flag.title.pprEasement'
};
/** The graded Géorisques flags: their scale's top, the big value's key and one word per grade. */
const FLAG_LEVELS = {
  seismic: {
    max: 5,
    display: 'fr-urban-rules.flag.display.seismic',
    qualifiers: {
      1: 'fr-urban-rules.flag.qualifier.seismic.1',
      2: 'fr-urban-rules.flag.qualifier.seismic.2',
      3: 'fr-urban-rules.flag.qualifier.seismic.3',
      4: 'fr-urban-rules.flag.qualifier.seismic.4',
      5: 'fr-urban-rules.flag.qualifier.seismic.5'
    }
  },
  radon: {
    max: 3,
    display: 'fr-urban-rules.flag.display.radon',
    qualifiers: {
      1: 'fr-urban-rules.flag.qualifier.radon.1',
      2: 'fr-urban-rules.flag.qualifier.radon.2',
      3: 'fr-urban-rules.flag.qualifier.radon.3'
    }
  },
  clay: {
    max: 3,
    display: 'fr-urban-rules.flag.display.clay',
    qualifiers: {
      1: 'fr-urban-rules.flag.qualifier.clay.1',
      2: 'fr-urban-rules.flag.qualifier.clay.2',
      3: 'fr-urban-rules.flag.qualifier.clay.3'
    }
  }
};

/**
 * A graded flag's `level` (SDK 1.37): the number Géorisques gave, on its scale; none when the
 * number is not an integer of that scale (the flag is then sent without one, as before).
 */
function flagLevel(kind, grade, displayParam) {
  const scale = FLAG_LEVELS[kind];
  const value = Number(grade);
  if (!Number.isInteger(value) || value < 1 || value > scale.max) return undefined;
  return {
    value,
    max: scale.max,
    display: { key: scale.display, params: { [displayParam]: value } },
    qualifier: { key: scale.qualifiers[value] }
  };
}

/** `rga.codeExposition` (Géorisques v1): the clay shrink-swell exposure. */
const RGA_KEYS = {
  0: 'fr-urban-rules.rga.0',
  1: 'fr-urban-rules.rga.1',
  2: 'fr-urban-rules.rga.2',
  3: 'fr-urban-rules.rga.3'
};

/** Sprint 002.12: the Risks section's summary for the clay's exposure (0 is nothing to say). */
const CLAY_SUMMARY_KEYS = {
  1: 'fr-urban-rules.summary.clay.1',
  2: 'fr-urban-rules.summary.clay.2',
  3: 'fr-urban-rules.summary.clay.3'
};
/** The assumptions' key prefix, built so the key audit does not read it as a key. */
const ASSUMPTION_PREFIX = ['fr-urban-rules', 'assumption', ''].join('.');

const GEOMETRY_KEYS = {
  surface: 'fr-urban-rules.geometry.surface',
  line: 'fr-urban-rules.geometry.line',
  point: 'fr-urban-rules.geometry.point',
  none: 'fr-urban-rules.geometry.none'
};

// ── Limits (DEC-13, DEC-14; the host's, platform `regulation-source-registry.ts`) ─

const SHORT = 2000;
const LONG = 10_000;
const TABLE_ROWS = 200;
const SIMPLIFY_TOLERANCE = 0.2;
const FEATURE_POINT_LIMIT = 5000;
const REPORT_POINT_BUDGET = 80_000;
const FEATURE_LIMIT = 1900;

/** A display limit, never a silent truncation: the cut is said by the caller. */
function cut(text, cap) {
  if (typeof text !== 'string') return '';
  return text.length <= cap ? text : `${text.slice(0, cap - 3)}[…]`;
}

const verbatim = (text, cap = SHORT) => ({ text: cut(text, cap), lang: 'fr' });

// ── The fetch layer (step 4) ────────────────────────────────────────────────────

class ReadAborted extends Error {
  constructor() {
    super('The read was superseded or cancelled.');
    this.name = 'AbortError';
  }
}

/**
 * `{ json, status }` or `{ failed, detail }` — never a throw for a source's
 * own failure (carte-gouv-fr's `fetchLayer` shape). Throws only when the
 * read itself was aborted: an aborted read produces no report.
 */
async function fetchJson(fetchImpl, url, readSignal, timeoutMs, body) {
  if (readSignal.aborted) throw new ReadAborted();
  // 002.8 DEC-9: only the hosts the package card names are ever asked.
  if (!FETCHED_HOSTS.includes(new URL(url).hostname)) {
    return { failed: 'network', detail: { key: 'fr-urban-rules.status.network' } };
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([readSignal, timeout]);
  try {
    const init =
      body === undefined
        ? { signal }
        : {
            signal,
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
          };
    const response = await fetchImpl(url, init);
    if (!response.ok) {
      return { failed: 'http', status: response.status, detail: phraseOfHttp(response.status) };
    }
    // Read as text: Géorisques answers an empty 200 where it holds nothing.
    const raw = await response.text();
    if (raw.trim() === '') return { json: null };
    try {
      return { json: JSON.parse(raw) };
    } catch {
      return { failed: 'malformed', detail: MALFORMED };
    }
  } catch (cause) {
    if (readSignal.aborted) throw new ReadAborted();
    if (timeout.aborted) {
      return {
        failed: 'timeout',
        detail: {
          key: 'fr-urban-rules.status.timeout',
          params: { seconds: Math.round(timeoutMs / 1000) }
        }
      };
    }
    return { failed: 'network', detail: { key: 'fr-urban-rules.status.network' } };
  }
}

const phraseOfHttp = (status) => ({ key: 'fr-urban-rules.status.http', params: { status } });
// ── The companion service's client (Sprint 002.6a, DEC-1) ───────────────────────

/**
 * `locate()`'s answer, checked: a `baseUrl` that is an absolute `http(s)` URL
 * ending in `/`, or `undefined`. The host already checks it (096.8a); a
 * malformed one is treated as no service rather than built on.
 */
function checkedLocation(location, page = globalThis.location) {
  const baseUrl = location?.baseUrl;
  if (typeof baseUrl !== 'string' || !baseUrl.endsWith('/')) return undefined;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    // Review NIT: in the editor, the route is the page's own origin (ADR-0114 Rule 2).
    if (typeof page?.origin === 'string' && url.origin !== page.origin) return undefined;
    return { baseUrl };
  } catch {
    return undefined;
  }
}

/**
 * A `200` answer of `GET v1/chapter`, checked field by field (002.5a DEC-3):
 * `{ pages: [from, to], found, match, title?, documentPages? }`, or `undefined`.
 * Only `from`, an integer, ever reaches a URL (Design Contract).
 */
function checkedChapter(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const { pages, found, match, title, documentPages } = json;
  if (!Array.isArray(pages) || pages.length !== 2 || !pages.every(Number.isInteger))
    return undefined;
  const [from, to] = pages;
  if (from < 1 || to < from) return undefined;
  // Review fix S3: the document's page count is required, and bounds the chapter.
  if (
    !Number.isSafeInteger(documentPages) ||
    to > documentPages ||
    documentPages > CHAPTER_DOCUMENT_PAGES_MAX
  )
    return undefined;
  if (!CHAPTER_FOUND.has(found) || !CHAPTER_MATCH.has(match)) return undefined;
  if (title !== undefined && typeof title !== 'string') return undefined;
  return {
    pages: [from, to],
    found,
    match,
    ...(typeof title === 'string' && title.trim() !== ''
      ? { title: cut(title.trim(), CHAPTER_TITLE_MAX) }
      : {})
  };
}

/**
 * One `GET <baseUrl>v1/chapter` (002.5a DEC-3): the chapter, or `{ failed:
 * code }` — the service's own code when it answered one (`version_changed`,
 * `zone_chapter_not_found`, `rate_limited`…), else `unavailable` (not JSON, or
 * no code), `malformed` (a `200` of another shape), `timeout`, `network` or
 * `aborted`. Never throws. `fetch` is the editor's: same origin, so the page's
 * own sign-in rides along.
 */
async function fetchChapter(fetchImpl, baseUrl, query, signal, timeoutMs) {
  let url;
  try {
    url = new URL('v1/chapter', baseUrl);
  } catch {
    return { failed: 'unavailable' };
  }
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(url.href, {
      signal: AbortSignal.any([signal, timeout]),
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    });
    // A route that is not the service's (an index page, a proxy's error) is not JSON.
    const type = response.headers?.get?.('content-type');
    if (typeof type !== 'string' || !/\bjson\b/i.test(type)) return { failed: 'unavailable' };
    let json;
    try {
      json = JSON.parse(await response.text());
    } catch {
      return { failed: 'unavailable' };
    }
    if (response.status === 200) return checkedChapter(json) ?? { failed: 'malformed' };
    const code = json?.error;
    const retryAfterSeconds = json?.retryAfterSeconds;
    return typeof code === 'string' && /^[a-z_]{1,40}$/.test(code)
      ? {
          failed: code,
          status: response.status,
          ...(Number.isFinite(retryAfterSeconds) ? { retryAfterSeconds } : {})
        }
      : { failed: 'unavailable', status: response.status };
  } catch {
    if (signal.aborted) return { failed: 'aborted' };
    return { failed: timeout.aborted ? 'timeout' : 'network' };
  }
}

// ── The document watch (Sprint 002.10) ──────────────────────────────────────────

/**
 * DEC-3: while the row is wanted, the service is asked about the plot's
 * document once an hour — a cheap read of its store, never the GPU from here.
 */
const WATCH_POLL_MS = 60 * 60_000;
/** A document name or GPU id as the service answers it (002.5a's `idurba` pattern). */
const WATCH_NAME = /^[0-9A-Za-z_-]{1,64}$/;
/** Superseded versions the service lists, at most. */
const WATCH_PREVIOUS_MAX = 20;

/** A name as the service answers it: a string that matches, never a coerced value. */
const isWatchName = (value) => typeof value === 'string' && WATCH_NAME.test(value);

const isoDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
};
const isoInstant = (value) =>
  typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : undefined;

/**
 * A `200` answer of `GET v1/documents/<partition>`, checked field by field
 * (002.10 DEC-3): the document in force (`current`, or `null` where the GPU has
 * none in production), when the service last confirmed it, and what it
 * replaced. `undefined` for anything else — an answer that is not the route's
 * is no answer, never « unchanged ».
 */
function checkedDocumentStatus(json, partition) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return undefined;
  if (json.partition !== partition) return undefined;
  let current = null;
  if (json.current !== null) {
    const c = json.current;
    if (c === undefined || typeof c !== 'object' || Array.isArray(c)) return undefined;
    if (!isWatchName(c.originalName) || !isWatchName(c.gpuDocId)) return undefined;
    const publicationDate = isoDay(c.publicationDate);
    current = {
      gpuDocId: c.gpuDocId,
      originalName: c.originalName,
      ...(publicationDate === undefined ? {} : { publicationDate })
    };
  }
  if (json.withdrawn !== (current === null)) return undefined;
  const checkedAt = json.checkedAt === null ? null : isoInstant(json.checkedAt);
  if (checkedAt === undefined) return undefined;
  const previous = [];
  if (!Array.isArray(json.previous)) return undefined;
  for (const entry of json.previous.slice(0, WATCH_PREVIOUS_MAX)) {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      !isWatchName(entry.originalName) ||
      !isWatchName(entry.gpuDocId) ||
      isoInstant(entry.supersededAt) === undefined
    )
      return undefined;
    previous.push({
      gpuDocId: entry.gpuDocId,
      originalName: entry.originalName,
      supersededAt: entry.supersededAt
    });
  }
  const failing =
    json.failing !== null &&
    typeof json.failing === 'object' &&
    Number.isSafeInteger(json.failing.days) &&
    typeof json.failing.code === 'string' &&
    /^[a-z_]{1,40}$/.test(json.failing.code)
      ? { code: json.failing.code, days: json.failing.days }
      : undefined;
  return { current, checkedAt, previous, ...(failing === undefined ? {} : { failing }) };
}

/**
 * DEC-2: the lookups a read asks, one per zone with a `nomfic` — `{ zone, key,
 * query }`, the key `upper(idurba)/nomfic/zone`. A zone whose inputs fail
 * 002.5a's patterns is left out: it would only be refused.
 */
function chapterLookups(partition, zones, documentName) {
  const lookups = new Map();
  for (const zone of zones) {
    const query = {
      partition: partition ?? '',
      idurba: zone.idurba ?? documentName ?? '',
      nomfic: zone.nomfic ?? '',
      zone: zone.libelle ?? ''
    };
    if (!Object.entries(CHAPTER_INPUTS).every(([name, pattern]) => pattern.test(query[name])))
      continue;
    const key = `${query.idurba.toUpperCase()}/${query.nomfic}/${query.zone}`;
    if (!lookups.has(key)) lookups.set(key, { zone: query.zone, key, query });
  }
  return [...lookups.values()];
}

/** A timer that resolves after `ms`, or at once when `signal` aborts (default {@link createReader} `wait`). */
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });

// ── Section reader: keys from a newer version (Sprint 002.6a, DEC-4) ─────────────

/** The rule-key prefixes this version writes and reads; `written:` since 002.6b (0.6.0). */
const KNOWN_RULE_PREFIXES = ['rnu:', 'psc:', 'entered:', 'written:'];

/**
 * A confirmation keyed by a prefix this version does not know (`written:…`) was
 * written by a newer version: kept as it is, listed read-only, never offered
 * for Forget, Confirm or Reopen and never read as "no longer in the plan". A
 * key with no `:` at all has no prefix; it stays this version's (stale) entry.
 */
const isNewerRuleKey = (key) =>
  typeof key === 'string' &&
  key.includes(':') &&
  !KNOWN_RULE_PREFIXES.some((prefix) => key.startsWith(prefix));

// ── Written rules: the extraction client's pure half (Sprint 002.6b) ────────────

/** DEC-1: a running job is polled every 3 s for a minute, then every 10 s. */
const POLL_FAST_MS = 3000;
const POLL_SLOW_MS = 10_000;
const POLL_FAST_FOR_MS = 60_000;
/** Review S1: a job whose polls fail this many times running, or for this long, has failed. */
const POLL_FAILURES_MAX = 5;
const POLL_FAILING_MAX_MS = 15 * 60_000;
/**
 * Review S1: a job in one state (and one chunk) this long has failed. The
 * service's own bound on one extract call is 30 minutes (002.5b follow-up).
 */
const JOB_STUCK_MS = 35 * 60_000;
/** Review NIT: the longest answer read from the service (a result is ~20 kB). */
const SERVICE_ANSWER_MAX = 4 * 1024 * 1024;
/** 002.5b's job ids are UUIDs; anything else never reaches a URL. */
const JOB_ID = /^[0-9A-Za-z-]{1,64}$/;
const JOB_STATES = new Set(['queued', 'fetching', 'reading', 'extracting', 'done', 'failed']);
/** DEC-6: a confirmation's stored passage, at most. */
const WRITTEN_PASSAGE_MAX = 1000;
const WRITTEN_KINDS = new Set([
  'road_setback',
  'boundary_setback',
  'building_distance',
  'footprint_ratio',
  'floor_area_max',
  'extension_max',
  'annex_max',
  'height_total',
  'height_facade',
  'green_ratio',
  'parking',
  'other'
]);
const WRITTEN_STATEMENTS = new Set(['limit', 'not_regulated', 'see_graphic', 'described']);
const RATIO_BASES = new Set([
  'plot_area',
  'emprise',
  'surface_de_plancher',
  'existing_emprise',
  'other'
]);
const CONFIDENCES = new Set(['high', 'medium', 'low']);
/** Review NIT: no length a rule states is over 10 km, and no factor over 100. */
const METRES_MAX = 10_000;
const FACTOR_MAX = 100;
/** DEC-2's three actions that start or restart an extraction. */
const WRITTEN_ACTIONS = new Set([
  'written-extract',
  'written-extract-again',
  'written-try-again',
  // Sprint 002.11 DEC-7: take the companion's newer reading in place of the project's.
  'written-use-newer'
]);
/** A written rule's key as `writtenKeysOf` computes it, stored in a snapshot (002.11 DEC-5). */
// Sprint 002.11's review: a sector may hold a space (« UA et UB », up to 40
// characters), so only control characters are refused — else such a rule's
// stored key was dropped and recomputed from a passage DEC-2 step 5 may have shortened.
const STORED_WRITTEN_KEY = /^written:[^\u0000-\u001f\u007f]{1,240}$/;

/**
 * DEC-2: every code of 002.5a DEC-11 and 002.5b DEC-10 (and the client's own),
 * with the state it puts a zone in. `retry`: Try again is offered.
 */
const WRITTEN_CODES = {
  // 002.5a
  invalid_request: { retry: true },
  not_found: { retry: true },
  version_changed: { retry: false },
  rate_limited: { retry: true },
  source_unavailable: { retry: true },
  source_refused: { retry: true },
  document_too_large: { retry: false },
  not_a_pdf: { retry: false },
  document_unreadable: { retry: true },
  no_text_layer: { retry: false },
  zone_chapter_not_found: { retry: false },
  chapter_too_large: { retry: false },
  // 002.5b
  not_cached: { retry: true },
  busy: { retry: true },
  extraction_unavailable: { retry: true },
  extraction_failed: { retry: true },
  // 002.23: the reading was stopped (here or by the last one waiting for it)
  cancelled: { retry: true },
  // 002.16: ai-service refused the model chosen in the AI panel; another choice there, then try again
  provider_not_permitted: { retry: true },
  unknown_provider: { retry: true },
  internal_error: { retry: true },
  // the client's own: an answer that is not the route's, no answer
  unavailable: { retry: true },
  malformed: { retry: true },
  network: { retry: true },
  timeout: { retry: true }
};
/** The keys this file names, one per kind, base, code and step (002.0's `*_KEYS` convention). */
const WRITTEN_KIND_KEYS = {
  road_setback: 'fr-urban-rules.written.kind.road_setback',
  boundary_setback: 'fr-urban-rules.written.kind.boundary_setback',
  building_distance: 'fr-urban-rules.written.kind.building_distance',
  footprint_ratio: 'fr-urban-rules.written.kind.footprint_ratio',
  floor_area_max: 'fr-urban-rules.written.kind.floor_area_max',
  extension_max: 'fr-urban-rules.written.kind.extension_max',
  annex_max: 'fr-urban-rules.written.kind.annex_max',
  height_total: 'fr-urban-rules.written.kind.height_total',
  height_facade: 'fr-urban-rules.written.kind.height_facade',
  green_ratio: 'fr-urban-rules.written.kind.green_ratio',
  parking: 'fr-urban-rules.written.kind.parking',
  other: 'fr-urban-rules.written.kind.other'
};
const WRITTEN_BASE_KEYS = {
  plot_area: 'fr-urban-rules.written.base.plot_area',
  emprise: 'fr-urban-rules.written.base.emprise',
  surface_de_plancher: 'fr-urban-rules.written.base.surface_de_plancher',
  existing_emprise: 'fr-urban-rules.written.base.existing_emprise',
  other: 'fr-urban-rules.written.base.other'
};
const WRITTEN_CODE_KEYS = {
  invalid_request: 'fr-urban-rules.written.code.invalid_request',
  not_found: 'fr-urban-rules.written.code.not_found',
  version_changed: 'fr-urban-rules.written.code.version_changed',
  rate_limited: 'fr-urban-rules.written.code.rate_limited',
  source_unavailable: 'fr-urban-rules.written.code.source_unavailable',
  source_refused: 'fr-urban-rules.written.code.source_refused',
  document_too_large: 'fr-urban-rules.written.code.document_too_large',
  not_a_pdf: 'fr-urban-rules.written.code.not_a_pdf',
  document_unreadable: 'fr-urban-rules.written.code.document_unreadable',
  no_text_layer: 'fr-urban-rules.written.code.no_text_layer',
  zone_chapter_not_found: 'fr-urban-rules.written.code.zone_chapter_not_found',
  chapter_too_large: 'fr-urban-rules.written.code.chapter_too_large',
  not_cached: 'fr-urban-rules.written.code.not_cached',
  busy: 'fr-urban-rules.written.code.busy',
  extraction_unavailable: 'fr-urban-rules.written.code.extraction_unavailable',
  extraction_failed: 'fr-urban-rules.written.code.extraction_failed',
  cancelled: 'fr-urban-rules.written.code.cancelled',
  provider_not_permitted: 'fr-urban-rules.written.code.provider_not_permitted',
  unknown_provider: 'fr-urban-rules.written.code.unknown_provider',
  internal_error: 'fr-urban-rules.written.code.internal_error',
  unavailable: 'fr-urban-rules.written.code.unavailable',
  malformed: 'fr-urban-rules.written.code.malformed',
  network: 'fr-urban-rules.written.code.network',
  timeout: 'fr-urban-rules.written.code.timeout'
};
const WRITTEN_STEP_KEYS = {
  queued: 'fr-urban-rules.written.state.queued',
  fetching: 'fr-urban-rules.written.state.fetching',
  reading: 'fr-urban-rules.written.state.reading',
  extracting: 'fr-urban-rules.written.state.extracting'
};
const writtenCodeOf = (code) => (Object.hasOwn(WRITTEN_CODES, code) ? code : 'unavailable');
const writtenCodeKey = (code) => WRITTEN_CODE_KEYS[writtenCodeOf(code)];

/** 096.7's normalisation (002.5b's `normalise.mjs`, copied): what a written key hashes. */
const DOUBLE_QUOTES = new Set(['"', '«', '»', '“', '”', '„', '‟', '⹂', '〝', '〞', '〟']);
const QUOTE_LIKE = /^[\p{Pi}\p{Pf}'ʼ‚]$/u;
const DASH = /^[‐-―−]$/u;
const ZERO_WIDTH = /^[​-‍⁠]$/u;
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gsu;
function normalisedPassage(text) {
  let out = '';
  let space = false;
  for (const match of String(text).matchAll(CLUSTER)) {
    for (const character of match[0].normalize('NFKC')) {
      let folded = character;
      if (character === '­' || ZERO_WIDTH.test(character)) folded = '';
      else if (DOUBLE_QUOTES.has(character)) folded = '"';
      else if (QUOTE_LIKE.test(character)) folded = "'";
      else if (DASH.test(character)) folded = '-';
      if (folded === '') continue;
      if (/^\s$/u.test(folded)) {
        space = true;
        continue;
      }
      if (space && out.length > 0) out += ' ';
      space = false;
      out += folded;
    }
  }
  return out;
}

/** 002.5a DEC-6's code comparison: NFKC, no spaces, case folded. */
const codeKey = (code) => String(code).normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
/** 002.5a's `isParentCode`: `UCe1` for `UCe1b` — a parent only of a sector (a lower-case letter after). */
function isParentSector(code, zone) {
  const wanted = String(zone).normalize('NFKC').replace(/\s+/gu, '');
  const parent = codeKey(code);
  if (parent === '' || !wanted.toLowerCase().startsWith(parent)) return false;
  return /^\p{Ll}/u.test(wanted.slice(parent.length));
}
/** DEC-3: a rule of no sector, of the zone's, or of its parent code is the zone's. */
const sectorIsZones = (sector, zone) =>
  sector === null || codeKey(sector) === codeKey(zone) || isParentSector(sector, zone);

const finiteAtLeast = (value, minimum) =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum;

/**
 * 002.6b review Q3: the footprint coefficient a rule states, in percent — a
 * value in percent, or a written ratio **of the plot area** that caps (`max`).
 * A ratio of the emprise or the surface de plancher, or a minimum, never is.
 */
function footprintPercentOf(rule) {
  const limit = rule?.limit;
  if (limit?.kind === 'value' && limit.quantity.unit === 'percent') return limit.quantity.value;
  if (
    limit?.kind === 'ratio' &&
    limit.comparison === 'max' &&
    limit.base?.key === WRITTEN_BASE_KEYS.plot_area
  )
    return limit.percent;
  return undefined;
}

/**
 * 002.9 (a defect of 002.6b): the pleine terre share a green rule states, in
 * percent — a value in percent, or a written minimum ratio **of the plot area**
 * (the form « au minimum de 15 % » of a terrain takes as often). Any other base
 * is not the plot's share.
 */
function greenPercentOf(rule) {
  const limit = rule?.limit;
  if (limit?.kind === 'value' && limit.quantity.unit === 'percent') return limit.quantity.value;
  if (
    limit?.kind === 'ratio' &&
    limit.comparison === 'min' &&
    limit.base?.key === WRITTEN_BASE_KEYS.plot_area
  )
    return limit.percent;
  return undefined;
}

/**
 * 002.9 (a defect of 002.6b): an extension cap in percent and the base it is
 * a share of — `existing` for an entered ratio (002.2: of the existing emprise),
 * a written ratio of the existing emprise or the emprise, or a value in percent;
 * `other` for a written ratio of another base (the floor area), which the
 * existing building's emprise must never stand for.
 */
function extensionShareOf(rule) {
  const limit = rule?.limit;
  if (limit?.kind === 'value' && limit.quantity.unit === 'percent')
    return { percent: limit.quantity.value, base: 'existing' };
  if (limit?.kind === 'ratio' && limit.comparison === 'max') {
    const existing =
      limit.base?.key === WRITTEN_BASE_KEYS.existing_emprise ||
      limit.base?.key === WRITTEN_BASE_KEYS.emprise;
    return { percent: limit.percent, base: existing ? 'existing' : 'other' };
  }
  return undefined;
}

/**
 * 002.9 (criterion 6): why no written regulation is offered, by regime — a
 * carte communale has no règlement and the RNU none at all; a plan not on the
 * GPU says so in the overview already (`notice.askTownHall`).
 */
const WRITTEN_NOT_OFFERED_KEYS = {
  cc: 'fr-urban-rules.written.notOffered.cc',
  rnu: 'fr-urban-rules.written.notOffered.rnu'
};

/**
 * Sprint 002.21: the limits a strip along the plot runs along, by the service's word and by the
 * band choice it is (`BAND_EDGES`' key).
 */
const STRIP_CHOICES = {
  all: 'all',
  street: 'street',
  side: 'side',
  rear: 'rear',
  side_rear: 'side-rear'
};
/** The kinds whose limit a strip may qualify: a height in metres. */
const STRIP_KINDS = new Set(['height_total', 'height_facade']);

/**
 * Sprint 002.21: a strip as the service sent it — `{ depthMetres, edges, permits }` — read as
 * `{ depth, edges (a band choice), permits }`, for a height in metres only; `undefined` otherwise.
 */
function checkedStrip(raw, kind, limit) {
  if (!isRecord(raw) || !STRIP_KINDS.has(kind)) return undefined;
  if (limit?.kind !== 'value' || limit.unit !== 'm' || limit.comparison !== 'max') return undefined;
  if (typeof raw.edges !== 'string' || !Object.hasOwn(STRIP_CHOICES, raw.edges)) return undefined;
  if (!(finiteAtLeast(raw.depthMetres, 0.1) && raw.depthMetres <= BAND_MAX_DEPTH)) return undefined;
  if (typeof raw.permits !== 'boolean') return undefined;
  return { depth: raw.depthMetres, edges: STRIP_CHOICES[raw.edges], permits: raw.permits };
}

/**
 * Sprint 002.21: the words that put a height in a strip along the limits (« dans une bande de 0 à
 * 4 mètres », « sur une profondeur de 5 m », « dans les 3 premiers mètres », « à moins de 5 m des
 * limites »). A height limit written so, read **without** a strip — a result of the earlier prompt,
 * or a model that missed it — is a limit on part of the building; as a plain height it would be one
 * on the whole of it, so it stays a statement in words until it is read again.
 */
const STRIP_WORDS = [
  /\bbandes?\s+(?:de\s+|d['’]\s*)?(?:0\s*(?:à|a|et)\s*)?\d/iu,
  /\bprofondeur\s+(?:maximale\s+|minimale\s+)?(?:de|d['’])\s*\d/iu,
  /\b(?:dans|sur)\s+les\s+\d+(?:[.,]\d+)?\s*(?:premiers?\s+)?m[èe]tres?/iu,
  /\bà\s+moins\s+de\s+\d+(?:[.,]\d+)?\s*(?:m\b|m[èe]tres?)\s+(?:de|des)\s+(?:la\s+|les\s+)?limites?/iu
];
const mentionsStrip = (text) => STRIP_WORDS.some((re) => re.test(String(text).normalize('NFKC')));

/** One service rule, checked field by field; `undefined` when it is not 002.5b's shape. */
function checkedServiceRule(item, documentPages) {
  if (item === null || typeof item !== 'object') return undefined;
  if (!WRITTEN_KINDS.has(item.kind) || !WRITTEN_STATEMENTS.has(item.statement)) return undefined;
  if (typeof item.passage !== 'string' || item.passage.trim() === '') return undefined;
  if (!Number.isSafeInteger(item.page) || item.page < 1 || item.page > documentPages)
    return undefined;
  if (item.sector !== null && (typeof item.sector !== 'string' || item.sector.length > 40))
    return undefined;
  let limit;
  const l = item.limit;
  if (item.statement === 'limit') {
    if (l?.kind === 'value') {
      if (!['min', 'max'].includes(l.comparison) || !finiteAtLeast(l.value, 0)) return undefined;
      if (!SDK_UNITS.has(l.unit)) return undefined;
      if (l.unit === 'm' && l.value > METRES_MAX) return undefined;
      limit = { kind: 'value', comparison: l.comparison, value: l.value, unit: l.unit };
    } else if (l?.kind === 'ratio') {
      if (!['min', 'max'].includes(l.comparison) || !finiteAtLeast(l.percent, 0) || l.percent > 100)
        return undefined;
      if (!RATIO_BASES.has(l.base)) return undefined;
      limit = { kind: 'ratio', comparison: l.comparison, percent: l.percent, base: l.base };
    } else if (l?.kind === 'height_relative') {
      if (!['altitude_difference', 'facade_height'].includes(l.reference)) return undefined;
      if (!finiteAtLeast(l.factor, 0) || l.factor > FACTOR_MAX) return undefined;
      const offset = l.offsetMetres ?? null;
      const minimum = l.minimumMetres ?? null;
      if (
        offset !== null &&
        !(typeof offset === 'number' && Number.isFinite(offset) && Math.abs(offset) <= METRES_MAX)
      )
        return undefined;
      if (minimum !== null && !(finiteAtLeast(minimum, 0) && minimum <= METRES_MAX))
        return undefined;
      limit = {
        kind: 'height_relative',
        reference: l.reference,
        factor: l.factor,
        offset,
        minimum
      };
    } else return undefined;
  } else if (l !== null && l !== undefined) return undefined;
  // Review S5: a value or ratio whose comparison contradicts its kind (a
  // setback « at most », a height « at least ») is not a rule this file can
  // measure; it is left out and counted. Parking and other have no direction.
  if (
    (limit?.kind === 'value' || limit?.kind === 'ratio') &&
    item.kind !== 'parking' &&
    item.kind !== 'other' &&
    limit.comparison !== (MINIMUM_KINDS.has(item.kind) ? 'min' : 'max')
  )
    return undefined;
  const strings = (list) =>
    Array.isArray(list)
      ? list.filter((x) => typeof x === 'string' && x.trim() !== '').slice(0, 6)
      : [];
  // Sprint 002.21: a height held to a strip along the limits. A result read before it (prompt
  // version 2) has none; a claim this cannot carry is kept as a claim, never read as a plain height.
  const strip =
    item.strip === undefined || item.strip === null ? undefined : checkedStrip(item.strip, item.kind, limit);
  return {
    kind: item.kind,
    sector: item.sector,
    statement: item.statement,
    limit,
    ...(strip === undefined ? {} : { strip }),
    ...(item.strip !== undefined && item.strip !== null && strip === undefined ? { stripRefused: true } : {}),
    page: item.page,
    article:
      typeof item.article === 'string' && item.article.trim() !== ''
        ? cut(item.article.trim(), 40)
        : undefined,
    passage: item.passage,
    conditions: strings(item.conditions),
    exceptions: strings(item.exceptions),
    sectorUnplaced: item.sectorUnplaced === true,
    confidence: CONFIDENCES.has(item.confidence) ? item.confidence : 'low',
    // Sprint 002.11 DEC-5: a key stored with a restored rule, reused as computed
    // (a passage shortened to fit the project file never moves it). The
    // service never sends one.
    ...(typeof item.ruleKey === 'string' && STORED_WRITTEN_KEY.test(item.ruleKey)
      ? { ruleKey: item.ruleKey }
      : {})
  };
}

/**
 * A 002.5b result, checked (DEC-8): the document it reads, its chapter, its
 * rules (each checked; a rule of another shape is left out and counted), the
 * counts, the model and the versions. `undefined` when it is not a result.
 */
function checkedResult(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const document = json.document;
  if (
    typeof document?.idurba !== 'string' ||
    typeof document.nomfic !== 'string' ||
    !Number.isSafeInteger(document.pages) ||
    document.pages < 1 ||
    document.pages > CHAPTER_DOCUMENT_PAGES_MAX
  )
    return undefined;
  if (!Array.isArray(json.rules) || !Number.isInteger(json.schemaVersion)) return undefined;
  const rules = [];
  let refused = 0;
  for (const item of json.rules.slice(0, HOST_LIMITS.rules)) {
    const rule = checkedServiceRule(item, document.pages);
    if (rule === undefined) refused += 1;
    else rules.push(rule);
  }
  const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
  const dropped = Object.values(json.dropped ?? {}).reduce((sum, n) => sum + count(n), 0);
  const pages =
    Array.isArray(json.chapter?.pages) && json.chapter.pages.every(Number.isSafeInteger)
      ? [json.chapter.pages[0], json.chapter.pages[1]]
      : undefined;
  return {
    schemaVersion: json.schemaVersion,
    promptVersion: Number.isInteger(json.promptVersion) ? json.promptVersion : 0,
    document: {
      idurba: document.idurba,
      nomfic: document.nomfic,
      pages: document.pages,
      // Sprint 002.11 DEC-7: the règlement's hash, which tells a newer reading of the same file.
      ...(typeof document.sha256 === 'string' && /^[0-9a-f]{64}$/.test(document.sha256)
        ? { sha256: document.sha256 }
        : {}),
      // Sprint 002.11's review: the GPU document the file was read from, which names
      // its link (fixed per version) when the file list does not answer.
      ...(typeof document.documentId === 'string' && GPU_DOCUMENT_ID.test(document.documentId)
        ? { documentId: document.documentId }
        : {})
    },
    ...(pages === undefined ? {} : { chapter: { pages } }),
    rules,
    dropped: dropped + refused,
    chunks: { of: count(json.chunks?.of), failed: count(json.chunks?.failed) },
    model: {
      providerId: typeof json.model?.providerId === 'string' ? cut(json.model.providerId, 80) : '',
      model: typeof json.model?.model === 'string' ? cut(json.model.model, 120) : ''
    },
    extractedAt:
      typeof json.extractedAt === 'string' && !Number.isNaN(Date.parse(json.extractedAt))
        ? new Date(json.extractedAt).toISOString()
        : undefined
  };
}

/** 002.5b's `current`: `{ providerId, schemaVersion, promptVersion }`, or `undefined`. */
function checkedCurrent(json) {
  if (
    typeof json?.providerId !== 'string' ||
    !Number.isInteger(json.schemaVersion) ||
    !Number.isInteger(json.promptVersion)
  )
    return undefined;
  return {
    providerId: cut(json.providerId, 80),
    schemaVersion: json.schemaVersion,
    promptVersion: json.promptVersion
  };
}

/**
 * Sprint 002.16: the model the user chose in the host's AI panel (`ai.selectedModel()`, SDK 1.40),
 * as `{ providerId, model? }`, or `undefined` — no choice, a host older than 1.40 that has no such
 * member, or an answer that is not an id and a name. Never an address; the service refuses one too.
 * `undefined` means the service's own default (before 002.16, always), never a provider of ours.
 */
const CHOSEN_PROVIDER_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
function chosenModelOf(aiService) {
  let chosen;
  try {
    chosen = aiService?.selectedModel?.();
  } catch {
    return undefined;
  }
  if (typeof chosen?.providerId !== 'string' || !CHOSEN_PROVIDER_ID.test(chosen.providerId)) return undefined;
  const model = typeof chosen.model === 'string' ? chosen.model.trim() : '';
  const usable = model !== '' && model.length <= 120 && !model.includes('://') && !/\p{Cc}/u.test(model);
  return { providerId: chosen.providerId, ...(usable ? { model } : {}) };
}


// ── Sprint 002.23: the reading's progress, as a card in the AI conversation (SDK 1.41) ─────────

const READING_PART_MAX = 60;
const cardKey = (key, params) => ({ key, ...(params === undefined ? {} : { params }) });
const pagesOf = (pages) =>
  Array.isArray(pages) && Number.isSafeInteger(pages[0]) && Number.isSafeInteger(pages[1])
    ? { from: pages[0], to: pages[1] }
    : undefined;

/**
 * What an activity card says of one zone's reading, from its record: the service job's progress
 * (the parts, the chapter, the document), its result or its error. Pure; counts and page numbers
 * only — a passage never reaches a card (ADR-0028 Rule 12: a card shows progress, never rules).
 *
 * @param {{ zone, state, progress?, result?, error?, model?, counts?, cancelled? }} view
 */
export function readingCardOf(view) {
  const { zone, state, progress, result, error } = view;
  const parts = Array.isArray(progress?.parts) ? progress.parts : [];
  const of = Number.isSafeInteger(progress?.of) ? progress.of : parts.length;
  const chapterPages = pagesOf(progress?.chapter?.pages ?? result?.chapter?.pages);
  const model = view.model ?? (result?.model?.model ?? result?.model?.providerId);
  const failedParts = parts.filter((part) => part.state === 'failed');
  const running = state === 'queued' || state === 'fetching' || state === 'reading' || state === 'extracting';
  const status = running
    ? 'running'
    : view.cancelled === true || error?.code === 'cancelled'
      ? 'cancelled'
      : state === 'done'
        ? failedParts.length > 0 || (result?.chunks?.failed ?? 0) > 0
          ? 'partial'
          : 'done'
        : 'failed';

  const subtitleKey =
    chapterPages === undefined
      ? model === undefined
        ? 'fr-urban-rules.card.subtitle.zone'
        : 'fr-urban-rules.card.subtitle.zoneModel'
      : model === undefined
        ? 'fr-urban-rules.card.subtitle.pages'
        : 'fr-urban-rules.card.subtitle.pagesModel';
  const subtitle = cardKey(subtitleKey, {
    zone: String(zone ?? ''),
    ...(chapterPages === undefined ? {} : { from: chapterPages.from, to: chapterPages.to }),
    ...(model === undefined ? {} : { model })
  });

  const stepOf = (id, label, stepStatus, detail) => ({
    id,
    label,
    status: stepStatus,
    ...(detail === undefined ? {} : { detail })
  });
  const reached = (step) => ['reading', 'extracting', 'done'].includes(step);
  const step = state === 'done' ? 'done' : (progress?.step ?? state);
  const fetched = reached(step) || (status !== 'running' && parts.length > 0);
  const steps = [
    stepOf(
      'fetch',
      cardKey('fr-urban-rules.card.step.fetch'),
      fetched ? 'done' : state === 'queued' ? 'waiting' : 'running',
      fetched && progress?.document === 'hit'
        ? cardKey('fr-urban-rules.card.detail.fetchHeld')
        : fetched && progress?.document === 'miss'
          ? cardKey('fr-urban-rules.card.detail.fetchDownloaded')
          : undefined
    ),
    stepOf(
      'chapter',
      cardKey('fr-urban-rules.card.step.chapter'),
      step === 'reading' ? 'running' : fetched ? 'done' : 'waiting',
      chapterPages === undefined || !fetched
        ? undefined
        : cardKey('fr-urban-rules.card.detail.pages', { from: chapterPages.from, to: chapterPages.to })
    )
  ];
  for (const part of parts.slice(0, READING_PART_MAX)) {
    steps.push(
      stepOf(
        `part-${part.n}`,
        cardKey('fr-urban-rules.card.step.part', { n: part.n, of }),
        part.state,
        part.state === 'done'
          ? cardKey(part.cached === true ? 'fr-urban-rules.card.detail.partCached' : 'fr-urban-rules.card.detail.partRules', { rules: part.rules ?? 0 })
          : part.state === 'failed'
            ? cardKey('fr-urban-rules.card.detail.partFailed')
            : undefined
      )
    );
  }
  const allSettled = parts.length > 0 && parts.every((part) => part.state === 'done' || part.state === 'failed');
  steps.push(
    stepOf(
      'sort',
      cardKey('fr-urban-rules.card.step.sort'),
      state === 'done' ? 'done' : allSettled ? 'running' : 'waiting'
    )
  );

  const settled = parts.filter((part) => part.state === 'done' || part.state === 'failed').length;
  const notes = [];
  if (status === 'partial')
    notes.push({
      tone: 'caution',
      text: cardKey('fr-urban-rules.card.note.partial', {
        parts: failedParts.map((part) => part.n).join(', ') || '?'
      })
    });
  if (status === 'failed') notes.push({ tone: 'caution', text: { key: writtenCodeKey(error?.code) } });
  if (running)
    notes.push({ text: cardKey('fr-urban-rules.card.note.keepWorking') });

  const actions = [];
  if (status === 'running') actions.push({ id: 'cancel', label: cardKey('fr-urban-rules.card.action.cancel') });
  // Sprint 002.24: with questions about the project left, narrowing the rules is the next step.
  const narrowing = (status === 'done' || status === 'partial') && (view.counts?.ask ?? 0) > 0;
  if (narrowing)
    actions.push({
      id: 'narrow',
      label: cardKey('fr-urban-rules.card.action.narrow'),
      emphasis: 'primary'
    });
  if (status === 'done' || status === 'partial')
    actions.push({
      id: 'open',
      label: cardKey('fr-urban-rules.card.action.open'),
      ...(narrowing ? {} : { emphasis: 'primary' }),
      reveal: true
    });
  if (status === 'partial')
    actions.push(
      {
        id: 'retry',
        label:
          failedParts.length === 1
            ? cardKey('fr-urban-rules.card.action.retryPart', { n: failedParts[0].n })
            : cardKey('fr-urban-rules.card.action.retryParts')
      },
      { id: 'keep', label: cardKey('fr-urban-rules.card.action.keep') }
    );
  if ((status === 'failed' && WRITTEN_CODES[writtenCodeOf(error?.code)]?.retry !== false) || status === 'cancelled')
    actions.push({ id: 'retry', label: cardKey(status === 'cancelled' ? 'fr-urban-rules.card.action.again' : 'fr-urban-rules.card.action.retry') });

  const counts = view.counts;
  const stats =
    status === 'done' || status === 'partial'
      ? [
          { label: cardKey('fr-urban-rules.card.stat.read'), value: result?.rules?.length ?? 0 },
          ...(counts === undefined
            ? []
            : [
                { label: cardKey('fr-urban-rules.card.stat.auto'), value: counts.auto },
                ...(counts.project > 0
                  ? [{ label: cardKey('fr-urban-rules.card.stat.project'), value: counts.project }]
                  : []),
                ...(counts.grouped > 0
                  ? [{ label: cardKey('fr-urban-rules.card.stat.grouped'), value: counts.grouped }]
                  : []),
                {
                  label: cardKey('fr-urban-rules.card.stat.left'),
                  value: counts.left,
                  emphasis: true
                }
              ])
        ]
      : [];

  return {
    kind: 'activity',
    id: `reading:${view.id ?? zone}`,
    title: cardKey('fr-urban-rules.card.title'),
    subtitle,
    status,
    ...(running && of > 0 ? { progress: { done: settled, total: of } } : {}),
    // The steps are the running story. Once it is done the figures say what it came to, and a partly
    // read chapter lists only the parts that were not read: a dock is short.
    steps:
      status === 'done'
        ? []
        : status === 'partial'
          ? steps.filter((step) => step.status === 'failed')
          : // A reading that is over is not under way: a step it never finished is not spinning.
            status === 'running'
            ? steps
            : steps.map((step) => (step.status === 'running' ? { ...step, status: 'waiting' } : step)),
    stats,
    notes,
    actions
  };
}

/**
 * Posts and updates one card per zone's reading through the host's `ai.cards` (SDK 1.41), if the
 * host has one: a host older than 1.41 finds nothing here and the panel shows the wait as before.
 * Disposing it takes every card down (the extension's own subscriptions do that on a disable).
 */
export function createReadingCards({ ai, act, onDone = undefined }) {
  /** record id → { handle, view } */
  const posted = new Map();
  const service = () => {
    try {
      const candidate = ai();
      return typeof candidate?.cards?.post === 'function' ? candidate.cards : undefined;
    } catch {
      return undefined;
    }
  };
  const handlersFor = (record) => ({
    onAction: (event) => {
      try {
        // The press is not awaited: the card's button answers at once, the work goes on.
        void act(record, event.actionId);
      } catch {
        // an action that throws costs its own press, not the reading
      }
    }
  });
  return {
    /** The card for this record as it now stands: posted on first sight, updated after. */
    sync(record, extra = {}) {
      const cards = service();
      if (cards === undefined) return;
      const entry = posted.get(record.id);
      const view = {
        id: record.id,
        zone: record.zone,
        state: record.state,
        progress: record.progress,
        result: record.result,
        error: record.error,
        model: entry?.model ?? extra.model,
        counts: entry?.counts,
        cancelled: record.cancelledByUser === true
      };
      const card = readingCardOf(view);
      const json = JSON.stringify(card);
      if (entry !== undefined && entry.json === json) return;
      try {
        if (entry === undefined) {
          const handle = cards.post(card, handlersFor(record));
          posted.set(record.id, { handle, json, model: extra.model, counts: undefined, record });
        } else {
          entry.json = json;
          entry.handle.update(card);
        }
      } catch {
        // a host that refuses a card must not break the reading
      }
    },
    /** What the rules view counted, for the cards of the zones it read (their final state). */
    counts(counts, zones) {
      for (const [id, entry] of posted) {
        const record = entry.record;
        if (record.state !== 'done' || (zones !== undefined && !zones.has(record.zone))) continue;
        if (entry.counts !== undefined && JSON.stringify(entry.counts) === JSON.stringify(counts)) continue;
        const first = entry.counts === undefined;
        entry.counts = counts;
        this.sync(record);
        // Sprint 002.24: the reading has come to its figures — the moment to ask about the project, once.
        if (first) {
          try {
            onDone?.(record, counts);
          } catch {
            // a question that cannot be asked costs the question, not the reading
          }
        }
      }
    },
    dismiss(record) {
      const entry = posted.get(record.id);
      if (entry === undefined) return;
      posted.delete(record.id);
      try {
        entry.handle.dispose();
      } catch {
        // already gone
      }
    },
    dispose() {
      for (const { handle } of posted.values()) {
        try {
          handle.dispose();
        } catch {
          // already gone
        }
      }
      posted.clear();
    }
  };
}

// ── Sprint 002.24: the questions about the project, as a card in the AI conversation ───────────

/** The chips of « what will it be used for », in plain words; the panel's form lists every sub-destination. */
const USE_CHIPS = [
  'logement',
  'artisanat-commerce',
  'restauration',
  'bureau',
  'hotel',
  'industrie',
  'equipements',
  'agricole',
  'other'
];
const PROJECT_CARD_ID = 'project-nature';
const PROJECT_SUMMARY_ID = 'project-nature-summary';
const thresholdsOf = (offer) =>
  offer.questions.find((question) => question.id === 'area')?.thresholds ?? [];
/** The bucket an area answer stands on: the one containing an exact area, or the very bucket chosen. */
function selectedBucketOf(area, buckets) {
  if (area === undefined) return undefined;
  if (area.exact === true)
    return buckets.find(
      (bucket) => area.from >= bucket.from && (bucket.to === null || area.from < bucket.to)
    )?.id;
  return buckets.find((bucket) => bucket.from === area.from && bucket.to === (area.to ?? null))?.id;
}

/**
 * The question card: one question per thing the rules depend on, chips for the answers, « not decided »
 * quiet, and the line saying how many of the open rules these answers would decide. Pure.
 */
export function projectQuestionCardOf(offer, nature, decidedNow) {
  const quiet = {
    id: NOT_DECIDED,
    label: cardKey('fr-urban-rules.project.notDecided'),
    quiet: true
  };
  const buckets = areaBucketsOf(thresholdsOf(offer));
  const bucketLabel = (bucket) =>
    bucket.from === 0
      ? cardKey(PROJECT_AREA_KEYS.under, { to: bucket.to })
      : bucket.to === null
        ? cardKey(PROJECT_AREA_KEYS.over, { from: bucket.from })
        : cardKey(PROJECT_AREA_KEYS.range, { from: bucket.from, to: bucket.to });
  const questions = offer.questions.map((question) => {
    const hint = cardKey('fr-urban-rules.project.card.decidesUpTo', { n: question.n });
    switch (question.id) {
      case 'works':
        return {
          id: 'works',
          label: cardKey('fr-urban-rules.project.q.works'),
          hint,
          choices: [
            ...PROJECT_WORKS.map((id) => ({ id, label: cardKey(PROJECT_WORKS_KEYS[id]) })),
            quiet
          ],
          ...(nature.works === undefined ? {} : { selected: nature.works })
        };
      case 'use':
        return {
          id: 'use',
          label: cardKey('fr-urban-rules.project.q.use'),
          hint,
          choices: [
            ...USE_CHIPS.map((id) => ({ id, label: cardKey(PROJECT_CHIP_KEYS[id]) })),
            quiet
          ],
          ...(nature.use === undefined || !USE_CHIPS.includes(nature.use)
            ? {}
            : { selected: nature.use })
        };
      case 'area': {
        const selected = selectedBucketOf(nature.area, buckets);
        return {
          id: 'area',
          label: cardKey('fr-urban-rules.project.q.area'),
          hint: cardKey('fr-urban-rules.project.card.thresholds', {
            thresholds: question.thresholds.join(' · ')
          }),
          choices: [
            ...buckets.map((bucket) => ({ id: bucket.id, label: bucketLabel(bucket) })),
            quiet
          ],
          ...(selected === undefined ? {} : { selected })
        };
      }
      default:
        return {
          id: 'icpe',
          label: cardKey('fr-urban-rules.project.q.icpe'),
          hint,
          choices: [
            { id: 'yes', label: cardKey(PROJECT_ICPE_KEYS.yes) },
            { id: 'no', label: cardKey(PROJECT_ICPE_KEYS.no) },
            quiet
          ],
          ...(nature.icpe === undefined ? {} : { selected: nature.icpe })
        };
    }
  });
  return {
    kind: 'questions',
    id: PROJECT_CARD_ID,
    title: cardKey('fr-urban-rules.project.card.title'),
    subtitle: cardKey('fr-urban-rules.project.card.subtitle'),
    questions,
    summary: cardKey('fr-urban-rules.project.card.summary', { n: decidedNow, m: offer.base }),
    actions: [
      { id: 'later', label: cardKey('fr-urban-rules.project.card.later') },
      { id: 'apply', label: cardKey('fr-urban-rules.project.card.apply'), emphasis: 'primary' }
    ]
  };
}

/**
 * The answers the card holds, as the project's nature: a chip is an answer, « not decided » and a cleared
 * chip are none. A question the card did not ask keeps its stored answer; an exact area typed in the
 * panel stays while its bucket is still the one chosen.
 */
export function natureFromAnswers(answers, offer, current) {
  const asked = new Set(offer.questions.map((question) => question.id));
  const nature = {};
  const pick = (id, valid) => {
    if (!asked.has(id)) return current[id];
    return valid(answers[id]) ? answers[id] : undefined;
  };
  const works = pick('works', (value) => PROJECT_WORKS.includes(value));
  if (works !== undefined) nature.works = works;
  const use = pick('use', (value) => USE_CHIPS.includes(value));
  if (use !== undefined) nature.use = use;
  const icpe = pick('icpe', (value) => value === 'yes' || value === 'no');
  if (icpe !== undefined) nature.icpe = icpe;
  if (!asked.has('area')) {
    if (current.area !== undefined) nature.area = current.area;
  } else {
    const buckets = areaBucketsOf(thresholdsOf(offer));
    const bucket = buckets.find((candidate) => candidate.id === answers.area);
    if (bucket !== undefined) {
      nature.area =
        current.area?.exact === true && selectedBucketOf(current.area, buckets) === bucket.id
          ? current.area
          : { from: bucket.from, to: bucket.to };
    }
  }
  return nature;
}

/** An area answer as a card text: a number as plain words, a bucket as its key with its edges. */
const areaCardText = (area) =>
  area.exact === true
    ? { text: `${area.from} m²` }
    : area.from === 0 && area.to !== null
      ? cardKey(PROJECT_AREA_KEYS.under, { to: area.to })
      : area.to === null
        ? cardKey(PROJECT_AREA_KEYS.over, { from: area.from })
        : cardKey(PROJECT_AREA_KEYS.range, { from: area.from, to: area.to });

/** The card after the answers were applied: them as tags, how many rules they decided, and where to go next. */
export function projectSummaryCardOf(offer, nature, decidedNow) {
  const tags = [
    nature.use === undefined ? undefined : cardKey(PROJECT_USE_KEYS[nature.use]),
    nature.works === undefined ? undefined : cardKey(PROJECT_WORKS_KEYS[nature.works]),
    nature.area === undefined ? undefined : areaCardText(nature.area),
    nature.icpe === undefined ? undefined : cardKey(PROJECT_ICPE_KEYS[nature.icpe])
  ].filter((tag) => tag !== undefined);
  const left = Math.max(0, offer.base - decidedNow);
  return {
    kind: 'summary',
    id: PROJECT_SUMMARY_ID,
    title: cardKey('fr-urban-rules.project.card.title'),
    tags,
    notes: [
      {
        tone: 'info',
        text: cardKey('fr-urban-rules.project.card.applied', { n: decidedNow, m: left })
      },
      { text: cardKey('fr-urban-rules.project.card.appliedExplain') }
    ],
    actions: [
      {
        id: 'open',
        label: cardKey('fr-urban-rules.project.card.open', { m: left }),
        emphasis: 'primary',
        reveal: true
      },
      { id: 'change', label: cardKey('fr-urban-rules.project.card.change') }
    ]
  };
}

/**
 * Posts the question card once a reading is over and the answers' summary after them (SDK 1.41). `offer()`
 * is the latest of the Rules view's (`projectOfferOf`); `save(nature, offer)` stores the answers and
 * answers whether it did, `dismiss(offer)` records the document as asked. A host without `ai.cards`
 * finds nothing here: the panel's form is the way in.
 */
export function createProjectCards({ ai, offer, save, dismiss }) {
  let handle;
  const cards = () => {
    try {
      const candidate = ai();
      return typeof candidate?.cards?.post === 'function' ? candidate.cards : undefined;
    } catch {
      return undefined;
    }
  };
  const drop = () => {
    const held = handle;
    handle = undefined;
    try {
      held?.dispose();
    } catch {
      // already gone
    }
  };
  const show = (card, handlers) => {
    const service = cards();
    if (service === undefined) return false;
    drop();
    try {
      handle = service.post(card, handlers);
      return true;
    } catch {
      return false;
    }
  };
  const decidedBy = (current, nature) => projectDecidedBy(current.entries, nature);
  const ask = () => {
    const current = offer();
    if (current === undefined || current.questions.length === 0) return false;
    return show(
      projectQuestionCardOf(current, current.nature, decidedBy(current, current.nature)),
      {
        onAnswer: (event) => {
          const now = offer();
          if (now === undefined) return;
          const next = natureFromAnswers(event.answers, now, now.nature);
          try {
            handle?.update(projectQuestionCardOf(now, next, decidedBy(now, next)));
          } catch {
            // the line under the chips is a courtesy
          }
        },
        onAction: (event) => {
          const now = offer();
          if (now === undefined) return;
          if (event.actionId === 'later') {
            drop();
            dismiss(now);
            return;
          }
          if (event.actionId !== 'apply') return;
          const next = natureFromAnswers(event.answers, now, now.nature);
          if (!save(next, now)) return;
          show(projectSummaryCardOf(now, next, decidedBy(now, next)), {
            onAction: (press) => {
              if (press.actionId === 'change') ask();
            }
          });
        }
      }
    );
  };
  return {
    ask,
    /** After a reading came to its figures: the question card, once per document, while any is unanswered. */
    afterReading() {
      const current = offer();
      if (current === undefined || current.unanswered === 0 || current.asked) return;
      ask();
    },
    dispose: drop
  };
}

/** DEC-1 (B2): Extract again is offered for a partial result, another provider, an older version. */
const extractAgainOffered = (result, current) =>
  result.chunks.failed > 0 ||
  (current !== undefined &&
    (result.model.providerId !== current.providerId ||
      result.schemaVersion < current.schemaVersion ||
      result.promptVersion < current.promptVersion));

/**
 * 002.6b DEC-3's written keys of one result read for one zone, parallel to
 * `result.rules`: `written:<sector or *>:cyrb53(normalised passage)`, with
 * `~2`, `~3`… for a repeat in the result's order; `undefined` for a rule of
 * another sector. Sprint 002.11 DEC-5: a rule restored from the project's
 * snapshot carries the key computed when it was read, and keeps it — its
 * passage may have been shortened to fit the file.
 */
function writtenKeysOf(result, zone) {
  const taken = new Set();
  return result.rules.map((item) => {
    if (!item.sectorUnplaced && !sectorIsZones(item.sector, zone)) return undefined;
    if (item.ruleKey !== undefined && !taken.has(item.ruleKey)) {
      taken.add(item.ruleKey);
      return item.ruleKey;
    }
    const base = `written:${item.sector ?? '*'}:${cyrb53(normalisedPassage(item.passage))}`;
    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = `${base}~${n}`;
    taken.add(id);
    return id;
  });
}

/** DEC-3: a written rule's limit, SDK-shaped; `undefined` for a statement. */
function writtenLimitOf(rule) {
  const l = rule.limit;
  if (rule.statement === 'described') {
    return { kind: 'described', text: { text: cut(rule.passage, LONG), lang: 'fr' } };
  }
  if (l === undefined) return undefined;
  if (l.kind === 'value')
    return { kind: 'value', comparison: l.comparison, quantity: { value: l.value, unit: l.unit } };
  if (l.kind === 'ratio')
    return {
      kind: 'ratio',
      comparison: l.comparison,
      percent: l.percent,
      base: { key: WRITTEN_BASE_KEYS[l.base] }
    };
  return {
    kind: 'height_relative',
    ...(l.reference === 'facade_height' ? { reference: 'facade_height' } : {}),
    factor: l.factor,
    ...(l.offset === null ? {} : { offset: { value: l.offset, unit: 'm' } }),
    ...(l.minimum === null ? {} : { minimum: { value: l.minimum, unit: 'm' } })
  };
}

/**
 * A limit read back from the section (DEC-6), checked as the host would: a
 * confirmed written rule is measured by it, so a malformed one is no limit.
 */
function storedLimitOf(limit) {
  if (limit === null || typeof limit !== 'object') return undefined;
  const quantity = (q, units = SDK_UNITS) =>
    q !== null &&
    typeof q === 'object' &&
    typeof q.value === 'number' &&
    Number.isFinite(q.value) &&
    units.has(q.unit);
  if (
    limit.kind === 'value' &&
    ['min', 'max'].includes(limit.comparison) &&
    quantity(limit.quantity) &&
    limit.quantity.value >= 0 &&
    (limit.quantity.unit !== 'm' || limit.quantity.value <= METRES_MAX)
  )
    return {
      kind: 'value',
      comparison: limit.comparison,
      quantity: { value: limit.quantity.value, unit: limit.quantity.unit }
    };
  if (
    limit.kind === 'ratio' &&
    ['min', 'max'].includes(limit.comparison) &&
    finiteAtLeast(limit.percent, 0) &&
    limit.percent <= 100 &&
    Object.values(WRITTEN_BASE_KEYS).includes(limit.base?.key)
  )
    return {
      kind: 'ratio',
      comparison: limit.comparison,
      percent: limit.percent,
      base: { key: limit.base.key }
    };
  if (
    limit.kind === 'height_relative' &&
    finiteAtLeast(limit.factor, 0) &&
    limit.factor <= FACTOR_MAX
  ) {
    const metres = new Set(['m']);
    const bounded = (q) => quantity(q, metres) && Math.abs(q.value) <= METRES_MAX;
    if (limit.offset !== undefined && !bounded(limit.offset)) return undefined;
    if (limit.minimum !== undefined && !(bounded(limit.minimum) && limit.minimum.value >= 0))
      return undefined;
    return {
      kind: 'height_relative',
      ...(limit.reference === 'facade_height' ? { reference: 'facade_height' } : {}),
      factor: limit.factor,
      ...(limit.offset === undefined ? {} : { offset: { value: limit.offset.value, unit: 'm' } }),
      ...(limit.minimum === undefined ? {} : { minimum: { value: limit.minimum.value, unit: 'm' } })
    };
  }
  if (limit.kind === 'described' && typeof limit.text?.text === 'string')
    return { kind: 'described', text: { text: cut(limit.text.text, LONG), lang: 'fr' } };
  return undefined;
}

const INCOMPLETE = { key: 'fr-urban-rules.status.incomplete' };
const MALFORMED = { key: 'fr-urban-rules.status.malformed' };

/**
 * An API Carto FeatureCollection, or a failure. A total larger than the
 * features returned is a failed read, "incomplete" (ADR-0083 Rule 7): never
 * shown as complete.
 */
function featureCollection(answer) {
  if (answer.failed !== undefined) return answer;
  const json = answer.json;
  if (json === null || typeof json !== 'object' || !Array.isArray(json.features)) {
    return { failed: 'malformed', detail: MALFORMED };
  }
  const total = [json.totalFeatures, json.numberMatched].find(
    (value) => typeof value === 'number' && Number.isFinite(value)
  );
  if (total !== undefined && total > json.features.length) {
    return { failed: 'incomplete', detail: INCOMPLETE };
  }
  // A `null` or a bare value among the features is dropped here, never read.
  return {
    features: json.features.filter((f) => f !== null && typeof f === 'object' && !Array.isArray(f))
  };
}

// ── Geometry (DEC-3, DEC-4, DEC-14) ─────────────────────────────────────────────

const round7 = (value) => Math.round(value * 1e7) / 1e7;

/** A ring without its closing point: the Site service's rings never repeat it. */
function openRing(ring) {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  const same = Array.isArray(first)
    ? first[0] === last[0] && first[1] === last[1]
    : first.easting === last.easting && first.northing === last.northing;
  return same ? ring.slice(0, -1) : ring;
}

const squareDistanceToSegment = (p, a, b) => {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const length = dx * dx + dy * dy;
  let t =
    length === 0 ? 0 : ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / length;
  t = Math.max(0, Math.min(1, t));
  const x = a.easting + t * dx - p.easting;
  const y = a.northing + t * dy - p.northing;
  return x * x + y * y;
};

/** Douglas–Peucker on a polyline, in metres; iterative, so a long ring cannot overflow the stack. */
function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const squared = tolerance * tolerance;
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let worst = -1;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const distance = squareDistanceToSegment(points[i], points[first], points[last]);
      if (distance > worst) {
        worst = distance;
        index = i;
      }
    }
    if (index !== -1 && worst > squared) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** An open ring simplified as a closed one; `undefined` when fewer than three points remain. */
function simplifyRing(ring, tolerance) {
  if (ring.length <= 3) return ring.length === 3 ? ring : undefined;
  const simplified = simplifyLine([...ring, ring[0]], tolerance).slice(0, -1);
  return simplified.length >= 3 ? simplified : undefined;
}

/**
 * A GeoJSON geometry converted into the Site's CRS through the service and
 * simplified (DEC-14). Outer rings only, as carte-gouv-fr keeps them: a hole
 * carried as an outer ring would draw a courtyard as zoned. `unconverted` when
 * the service could not convert a part: the item is then listed without
 * geometry.
 */
function convertGeometry(geometry, site) {
  const type = geometry?.type;
  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates)) return { kind: 'none' };
  const toSite = (ring) => {
    // A position that is not two finite numbers is no point: the part is unconverted.
    const valid = ring.every(
      (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
    );
    if (!valid) return undefined;
    const converted = site.fromGeographicRing(
      ring.map(([longitude, latitude]) => ({ latitude, longitude }))
    );
    return converted === undefined
      ? undefined
      : converted.map(({ easting, northing }) => ({ easting, northing }));
  };
  if (type === 'Polygon' || type === 'MultiPolygon') {
    const polygons = type === 'Polygon' ? [coordinates] : coordinates;
    const rings = [];
    const unsimplified = [];
    for (const polygon of polygons) {
      const outer = Array.isArray(polygon) ? polygon[0] : undefined;
      if (!Array.isArray(outer) || outer.length < 4) continue;
      const converted = toSite(openRing(outer));
      if (converted === undefined) return { kind: 'surface', unconverted: true };
      unsimplified.push(converted);
      const simplified = simplifyRing(converted, SIMPLIFY_TOLERANCE);
      if (simplified !== undefined) rings.push(simplified);
    }
    return { kind: 'surface', rings, centroid: areaCentroid(unsimplified) };
  }
  if (type === 'LineString' || type === 'MultiLineString') {
    const parts = type === 'LineString' ? [coordinates] : coordinates;
    const lines = [];
    const unsimplified = [];
    for (const part of parts) {
      if (!Array.isArray(part) || part.length < 2) continue;
      const converted = toSite(part);
      if (converted === undefined) return { kind: 'line', unconverted: true };
      unsimplified.push(converted);
      lines.push(simplifyLine(converted, SIMPLIFY_TOLERANCE));
    }
    return { kind: 'line', lines, centroid: boxCentre(unsimplified.flat()) };
  }
  if (type === 'Point' || type === 'MultiPoint') return { kind: 'point' };
  return { kind: 'none' };
}

/** The centre of the points' box, in the Site's CRS; `undefined` for none. */
function boxCentre(points) {
  if (points.length === 0) return undefined;
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (const p of points) {
    minE = Math.min(minE, p.easting);
    minN = Math.min(minN, p.northing);
    maxE = Math.max(maxE, p.easting);
    maxN = Math.max(maxN, p.northing);
  }
  return { easting: (minE + maxE) / 2, northing: (minN + maxN) / 2 };
}

/**
 * 002.2 review fix S4: the area-weighted centroid of outer rings as served —
 * before simplification, so the key a confirmation names does not move with
 * the drawing tolerance — each ring weighted by its |area|; the box's centre
 * when the rings have no area.
 */
function areaCentroid(rings) {
  let total = 0;
  let x = 0;
  let y = 0;
  for (const ring of rings) {
    // Relative to the ring's first point: Lambert coordinates squared lose digits.
    const o = ring[0];
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const x0 = ring[i].easting - o.easting;
      const y0 = ring[i].northing - o.northing;
      const x1 = ring[(i + 1) % ring.length].easting - o.easting;
      const y1 = ring[(i + 1) % ring.length].northing - o.northing;
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    if (area === 0) continue;
    const weight = Math.abs(area);
    x += (o.easting + cx / (3 * area)) * weight;
    y += (o.northing + cy / (3 * area)) * weight;
    total += weight;
  }
  if (total === 0) return boxCentre(rings.flat());
  return { easting: x / total, northing: y / total };
}

/**
 * The plot's centroid in degrees, each ring weighted by its own |area|: a ring
 * wound the other way adds, never cancels. A plot is small enough for the
 * plane formula.
 */
function centroidOf(rings) {
  let total = 0;
  let x = 0;
  let y = 0;
  for (const ring of rings) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    if (area === 0) continue;
    const weight = Math.abs(area);
    x += (cx / (3 * area)) * weight;
    y += (cy / (3 * area)) * weight;
    total += weight;
  }
  if (total === 0) {
    const all = rings.flat();
    return {
      longitude: all.reduce((sum, p) => sum + p[0], 0) / all.length,
      latitude: all.reduce((sum, p) => sum + p[1], 0) / all.length
    };
  }
  return { longitude: x / total, latitude: y / total };
}

/** A small, stable digest (FNV-1a, 32 bits): the cache key's ring part. */
function digest(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The plot's key (DEC-9): the sorted parcel ids and a digest of their rings
 * rounded to the centimetre, with the CRS they are in. Never the document:
 * `idurba` is an answer, not known before the first request.
 */
function plotKey(site) {
  const parcels = site.parcels.map((parcel) => ({
    id:
      typeof parcel.properties?.idu === 'string'
        ? parcel.properties.idu
        : `${parcel.sourceId}:${parcel.featureId}`,
    rings: parcel.rings
      .map((ring) =>
        openRing(ring)
          .map((p) => `${p.easting.toFixed(2)},${p.northing.toFixed(2)}`)
          .join(';')
      )
      .join('|')
  }));
  parcels.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = parcels.map((parcel) => parcel.id).join(',');
  const anchor = parcels.length === 0 ? `${site.anchor.latitude},${site.anchor.longitude}` : '';
  return `${site.crs ?? ''}#${ids}#${digest(parcels.map((p) => p.rings).join('/') + anchor)}`;
}

/**
 * The query geometry (DEC-4): a MultiPolygon of every parcel's rings in
 * WGS84, rounded to 7 decimals and closed; or the anchor point when the Site
 * has no parcel or a CRS this build does not project (DEC-3's fallback).
 */
function plotGeometry(site, service) {
  const polygons = [];
  for (const parcel of site.parcels) {
    for (const ring of parcel.rings) {
      const open = openRing(ring);
      if (open.length < 3) continue;
      const geographic = service.toGeographicRing(open);
      if (geographic === undefined) return undefined;
      const closed = geographic.map(({ longitude, latitude }) => [
        round7(longitude),
        round7(latitude)
      ]);
      closed.push(closed[0]);
      polygons.push([closed]);
    }
  }
  if (polygons.length === 0) return undefined;
  return { type: 'MultiPolygon', coordinates: polygons };
}

function anchorGeometry(site) {
  return {
    type: 'Point',
    coordinates: [round7(site.anchor.longitude), round7(site.anchor.latitude)]
  };
}

// ── URL builders (DEC-5, DEC-6, DEC-7; criterion 7) ─────────────────────────────

/** `{ url, body }`: `geom` in the query string, or in a POST body past {@link MAX_GEOM_QUERY_LENGTH}. */
function apiCartoRequest(layer, geometry, category) {
  const encoded = encodeURIComponent(JSON.stringify(geometry));
  // `categorie` filters the SUP layers by type (`el7`; probed 2026-10-20).
  const filter = category === undefined ? '' : `&categorie=${encodeURIComponent(category)}`;
  if (encoded.length > MAX_GEOM_QUERY_LENGTH) {
    return {
      url: `${APICARTO_GPU}${layer}${filter === '' ? '' : `?${filter.slice(1)}`}`,
      body: { geom: geometry, ...(category === undefined ? {} : { categorie: category }) }
    };
  }
  return { url: `${APICARTO_GPU}${layer}?geom=${encoded}${filter}` };
}

/**
 * An EPCI's PLUi in sectors: `DU_<siren>_<sector>`, which API Carto answers and
 * the document API refuses as a `partition` (HTTP 400, probed 2026-10-20 on
 * DU_200054807_B); it is listed under the EPCI's `grid` instead.
 */
const SECTOR_PARTITION = /^DU_([0-9]{9})_([0-9A-Z]{1,4})$/;

/** The document in force only: the unfiltered list's first page can hold none of it (DEC-7). */
const gpuDocumentUrl = (partition) => {
  const sector = SECTOR_PARTITION.exec(partition);
  return sector === null
    ? `${GPU_DOCUMENT_API}?partition=${encodeURIComponent(partition)}&status=document.production`
    : `${GPU_DOCUMENT_API}?grid=${sector[1]}&status=document.production`;
};

/** A grid lists every sector: only the partition's own entries are its documents. */
const ownDocuments = (documents, partition) =>
  documents.filter(
    (d) => typeof d?.name !== 'string' || d.name.toUpperCase() === partition.toUpperCase()
  );
/** A GPU document id as the service names one (hexadecimal); anything else is not kept. */
const GPU_DOCUMENT_ID = /^[0-9a-f]{16,64}$/i;
const gpuFilesUrl = (id) => `${GPU_DOCUMENT_API}/${encodeURIComponent(id)}/files`;
const gpuFileHref = (id, name) =>
  `${GPU_DOCUMENT_API}/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`;

const coordinate = (value) => String(Math.round(value * 1e6) / 1e6);

const georisquesUrls = {
  'georisques-risques': ({ commune }) => `${GEORISQUES}gaspar/risques?code_insee=${commune}`,
  // `longitude` / `latitude`: given `latlon` it silently answers every PPR in France.
  'georisques-pprn': ({ point }) =>
    `${GEORISQUES}gaspar/pprn?longitude=${coordinate(point.longitude)}&latitude=${coordinate(point.latitude)}`,
  // The commune, never a point: the default radius answers neighbouring communes.
  'georisques-sismique': ({ commune }) => `${GEORISQUES}zonage_sismique?code_insee=${commune}`,
  'georisques-rga': ({ point }) =>
    `${GEORISQUES}rga?latlon=${coordinate(point.longitude)},${coordinate(point.latitude)}`,
  'georisques-radon': ({ code }) => `${GEORISQUES}radon?code_insee=${code}`
};

// ── Parsers: raw answers to this extension's own shape ──────────────────────────

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const optionalText = (value) => {
  const trimmed = text(value);
  return trimmed === '' ? undefined : trimmed;
};

/** GPU dates are `YYYYMMDD`; the report's are ISO (DEC-13). An unreadable one is dropped. */
function isoDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(text(value));
  if (match === null) return undefined;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day)
    ? undefined
    : `${year}-${month}-${day}`;
}

/** CNIG `idurba` is `<code>_<TYPE>_<YYYYMMDD>`, the date being the approval's. */
const idurbaDate = (idurba) => isoDate(text(idurba).split('_').pop());

/**
 * The commune from `municipality`. Lyon answers the commune and its
 * arrondissement: the commune decides. A plot across two communes answers
 * both: the one holding most of the plot (`preferred`, from the parcels) is
 * read, and every name is listed. `isRnu` stays as served: a value that is not
 * a boolean is drift, and the caller reads it as `unknown`.
 */
function parseMunicipality(features, preferred) {
  const answered = features
    .map((feature) => feature.properties ?? {})
    .filter((p) => typeof p.insee === 'string')
    .map((p) => ({ insee: p.insee, name: text(p.name), isRnu: p.is_rnu }));
  if (answered.length === 0) return undefined;
  const communes = answered.filter((c) => !isArrondissement(c.insee));
  const candidates = communes.length > 0 ? communes : answered;
  const commune = candidates.find((c) => c.insee === preferred) ?? candidates[0];
  const arrondissement = answered.find((c) => isArrondissement(c.insee));
  return {
    ...commune,
    names: [...new Set(candidates.map((c) => c.name).filter((n) => n !== ''))],
    count: candidates.length,
    arrondissement: arrondissement?.insee
  };
}

function parseDocuments(features) {
  return features
    .map((feature) => feature.properties ?? {})
    .map((p) => ({
      id: optionalText(p.gpu_doc_id) ?? optionalText(p.id),
      partition: optionalText(p.partition),
      name: optionalText(p.name),
      type: text(p.du_type).toUpperCase(),
      title: optionalText(p.grid_title),
      status: optionalText(p.gpu_status)
    }))
    .filter((d) => d.partition !== undefined && d.name !== undefined);
}

/**
 * Sprint 002.11 DEC-4: wave 1's facts from an answer — read from its raw
 * features when it has them, else from the parsed form a snapshot keeps.
 */
function municipalityOf(answer, view) {
  if (Array.isArray(answer.features)) return parseMunicipality(answer.features, preferredCommune(view));
  return isRecord(answer.municipality) ? answer.municipality : undefined;
}
const documentsOf = (answer) =>
  Array.isArray(answer.features)
    ? parseDocuments(answer.features)
    : Array.isArray(answer.documents)
      ? answer.documents
      : [];
const featureCountOf = (answer) =>
  Array.isArray(answer.features)
    ? answer.features.length
    : Number.isSafeInteger(answer.count)
      ? answer.count
      : 0;

function featureId(feature, layer, index) {
  return typeof feature.id === 'string' || typeof feature.id === 'number'
    ? String(feature.id)
    : `${layer}.${index}`;
}

/** A GPU feature layer: each item's fields and its geometry in the Site's CRS. */
function parseLayer(layer, features, site, pick) {
  return features.map((feature, index) => ({
    id: featureId(feature, layer, index),
    ...pick(feature.properties ?? {}),
    geometry: convertGeometry(feature.geometry, site)
  }));
}

const pickZone = (p) => ({
  libelle: text(p.libelle),
  libelong: optionalText(p.libelong),
  typezone: text(p.typezone),
  datvalid: optionalText(p.datvalid),
  idurba: optionalText(p.idurba),
  nomfic: optionalText(p.nomfic)
});

const pickSector = (p) => ({
  libelle: text(p.libelle),
  libelong: optionalText(p.libelong),
  typesect: text(p.typesect),
  datvalid: optionalText(p.datvalid),
  datappro: optionalText(p.datappro),
  idurba: optionalText(p.idurba),
  nomfic: optionalText(p.nomfic)
});

const pickPrescription = (p) => ({
  libelle: text(p.libelle),
  txt: optionalText(p.txt),
  type: text(p.typepsc),
  subtype: optionalText(p.stypepsc),
  datvalid: optionalText(p.datvalid)
});

const pickInformation = (p) => ({
  libelle: text(p.libelle),
  txt: optionalText(p.txt),
  type: text(p.typeinf),
  subtype: optionalText(p.stypeinf)
});

const pickEasement = (p) => ({
  suptype: text(p.suptype).toLowerCase(),
  typeass: optionalText(p.typeass),
  nomass: optionalText(p.nomass),
  modegeoass: optionalText(p.modegeoass),
  paramcalc: typeof p.paramcalc === 'number' ? p.paramcalc : undefined
});

/** Géorisques v1 paged answers: `{ results, total_pages, data }`. */
function georisquesData(json) {
  if (json === null || typeof json !== 'object' || !Array.isArray(json.data)) return undefined;
  return json;
}

// ── The planning snapshot (Sprint 002.11, SDK 1.33, platform ADR-0115) ─────────

/**
 * The snapshot's own schema (DEC-8), apart from the section's. A snapshot of a
 * higher schema is ignored and logged; a malformed one is ignored and replaced
 * at the next completed read.
 */
const SNAPSHOT_SCHEMA = 1;
/**
 * DEC-2: what `data` and its attributions may take, serialized — under
 * ADR-0115's 262,144 characters per entry, with room for the next schema.
 */
const SNAPSHOT_BUDGET = 200_000;
/** Owner answer 1: the plot's box grown by 100 m, always (DEC-2 step 1). */
const SNAPSHOT_MARGIN = 100;
/** DEC-2 step 2: the road margin, the furthest any rule here looks ({@link ROAD_MARGIN}). */
const SNAPSHOT_NEAR_MARGIN = 30;
/** DEC-2 step 3: Douglas–Peucker, in metres. */
const SNAPSHOT_SIMPLIFY = 0.5;
/** DEC-2 step 5: a written rule's passage kept to this many characters. */
const SNAPSHOT_PASSAGE_MAX = 500;
/** ADR-0115 Rule 2: at most 16 credit lines of at most 300 characters. */
const SNAPSHOT_ATTRIBUTIONS_MAX = 16;
/**
 * DEC-2's steps after the first, in order, each named in the snapshot's
 * `simplified` when taken: the overview says what was given up.
 */
const SNAPSHOT_STEPS = [
  'clip-30',
  'simplify',
  'drop-information',
  'drop-easement',
  'drop-prescription',
  'shorten-passages'
];
const SNAPSHOT_STEP_KEYS = {
  'clip-30': 'fr-urban-rules.snapshot.step.clip30',
  simplify: 'fr-urban-rules.snapshot.step.simplify',
  'drop-information': 'fr-urban-rules.snapshot.step.dropInformation',
  'drop-easement': 'fr-urban-rules.snapshot.step.dropEasement',
  'drop-prescription': 'fr-urban-rules.snapshot.step.dropPrescription',
  'shorten-passages': 'fr-urban-rules.snapshot.step.shortenPassages'
};
/** The layers whose geometry DEC-2 step 4 drops, by the step that drops it. */
const SNAPSHOT_DROPPED_LAYERS = {
  'drop-information': INFORMATION_LAYERS,
  'drop-easement': EASEMENT_LAYERS,
  'drop-prescription': PRESCRIPTION_LAYERS
};

/** A Lambert coordinate kept to the centimetre (DEC-2 step 1). */
const cmRound = (value) => Math.round(value * 100) / 100;

/** The plot's box in the Site's CRS, grown by `margin`; `undefined` without parcels. */
function plotBoxOf(view, margin) {
  let box;
  for (const parcel of view?.parcels ?? []) {
    for (const p of (parcel.rings ?? []).flat()) {
      if (!Number.isFinite(p?.easting) || !Number.isFinite(p?.northing)) continue;
      box ??= { minE: Infinity, minN: Infinity, maxE: -Infinity, maxN: -Infinity };
      box.minE = Math.min(box.minE, p.easting - margin);
      box.minN = Math.min(box.minN, p.northing - margin);
      box.maxE = Math.max(box.maxE, p.easting + margin);
      box.maxN = Math.max(box.maxN, p.northing + margin);
    }
  }
  // On the centimetre grid, outward: a point cut onto an edge stays on it once
  // rounded, so a restored snapshot cut again is unchanged (DEC-3's equality).
  return box === undefined
    ? undefined
    : {
        minE: Math.floor(box.minE * 100) / 100,
        minN: Math.floor(box.minN * 100) / 100,
        maxE: Math.ceil(box.maxE * 100) / 100,
        maxN: Math.ceil(box.maxN * 100) / 100
      };
}

/** Sutherland–Hodgman: an open ring cut to the box; `undefined` when nothing of it is inside. */
function clipRingToBox(ring, box) {
  const planes = [
    [(p) => p.easting >= box.minE, (a, b) => crossAt(a, b, 'easting', box.minE)],
    [(p) => p.easting <= box.maxE, (a, b) => crossAt(a, b, 'easting', box.maxE)],
    [(p) => p.northing >= box.minN, (a, b) => crossAt(a, b, 'northing', box.minN)],
    [(p) => p.northing <= box.maxN, (a, b) => crossAt(a, b, 'northing', box.maxN)]
  ];
  let points = openRing(ring);
  for (const [inside, cross] of planes) {
    if (points.length === 0) break;
    const out = [];
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const previous = points[(i + points.length - 1) % points.length];
      if (inside(current)) {
        if (!inside(previous)) out.push(cross(previous, current));
        out.push(current);
      } else if (inside(previous)) out.push(cross(previous, current));
    }
    points = out;
  }
  const rounded = openRing(dedupe(points.map(roundPoint)));
  return rounded.length >= 3 ? rounded : undefined;
}

/** Where the segment a→b meets the line `axis = value`. */
function crossAt(a, b, axis, value) {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  return {
    easting: axis === 'easting' ? value : a.easting + t * (b.easting - a.easting),
    northing: axis === 'northing' ? value : a.northing + t * (b.northing - a.northing)
  };
}

const roundPoint = (p) => ({ easting: cmRound(p.easting), northing: cmRound(p.northing) });
const dedupe = (points) =>
  points.filter(
    (p, i) =>
      i === 0 || p.easting !== points[i - 1].easting || p.northing !== points[i - 1].northing
  );

/** Liang–Barsky per segment: a line cut to the box, as the pieces inside it. */
function clipLineToBox(line, box) {
  const pieces = [];
  let piece = [];
  const close = () => {
    const rounded = dedupe(piece.map(roundPoint));
    if (rounded.length >= 2) pieces.push(rounded);
    piece = [];
  };
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    for (const [p, q] of [
      [-dx, a.easting - box.minE],
      [dx, box.maxE - a.easting],
      [-dy, a.northing - box.minN],
      [dy, box.maxN - a.northing]
    ]) {
      if (p === 0) {
        if (q < 0) inside = false;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (!inside || t0 > t1) {
      close();
      continue;
    }
    const start = { easting: a.easting + t0 * dx, northing: a.northing + t0 * dy };
    const end = { easting: a.easting + t1 * dx, northing: a.northing + t1 * dy };
    if (piece.length === 0 || t0 > 0) {
      close();
      piece.push(start);
    }
    piece.push(end);
    if (t1 < 1) close();
  }
  close();
  return pieces;
}

/**
 * DEC-2 steps 1–4 on one geometry, never on its facts. The `centroid` the
 * key reads is kept as `convertGeometry` computed it — on the whole,
 * unsimplified geometry — and never recomputed (DEC-5): a feature clipped to
 * nothing keeps it and draws no outline. A point or an unconverted geometry
 * is kept as it is.
 */
function shapedGeometry(geometry, { box, simplify, drop }) {
  if (geometry === null || typeof geometry !== 'object') return geometry;
  const surface = geometry.kind === 'surface' && Array.isArray(geometry.rings);
  const line = geometry.kind === 'line' && Array.isArray(geometry.lines);
  if (!surface && !line) return geometry;
  const parts = surface ? geometry.rings : geometry.lines;
  // The centroid a key reads (`roundedCentroid`), held whatever is cut below.
  const centroid = geometry.centroid ?? boxCentre(parts.flat());
  let shaped = [];
  if (!drop) {
    if (surface) {
      for (const ring of parts) {
        let cut = box === undefined ? dedupe(openRing(ring).map(roundPoint)) : clipRingToBox(ring, box);
        if (cut !== undefined && simplify) cut = simplifyRing(cut, SNAPSHOT_SIMPLIFY);
        if (cut !== undefined && cut.length >= 3) shaped.push(cut);
      }
    } else {
      for (const part of parts) {
        const pieces = box === undefined ? [dedupe(part.map(roundPoint))] : clipLineToBox(part, box);
        for (const piece of pieces) {
          const kept = simplify ? simplifyLine(piece, SNAPSHOT_SIMPLIFY) : piece;
          if (kept.length >= 2) shaped.push(kept);
        }
      }
    }
  }
  return {
    kind: geometry.kind,
    [surface ? 'rings' : 'lines']: shaped,
    ...(centroid === undefined ? {} : { centroid })
  };
}

/** One source's snapshot entry, its layers' geometry shaped by DEC-2's options. */
function shapedSource(id, entry, options) {
  if (!Array.isArray(entry.parsed)) return entry;
  const drop = options.drop.some((step) => SNAPSHOT_DROPPED_LAYERS[step].includes(id));
  return {
    ...entry,
    parsed: entry.parsed.map((item) => ({
      ...item,
      geometry: shapedGeometry(item.geometry, { ...options, drop })
    }))
  };
}

/** A written entry with its passages kept to {@link SNAPSHOT_PASSAGE_MAX} (DEC-2 step 5). */
function shortenedWritten(entry) {
  return {
    ...entry,
    result: {
      ...entry.result,
      rules: entry.result.rules.map((rule) =>
        rule.passage.length > SNAPSHOT_PASSAGE_MAX
          ? { ...rule, passage: `${rule.passage.slice(0, SNAPSHOT_PASSAGE_MAX - 1)}…` }
          : rule
      )
    }
  };
}

/** Serialized, as the host measures an entry (ADR-0115 Rule 7): `data` and its attributions. */
const snapshotSize = (data, attributions) => JSON.stringify({ data, attributions }).length;

/**
 * DEC-2: the snapshot that fits, or `undefined` when even the last step does
 * not. Step 1 (100 m) is always taken and never reported; each later step is
 * named in `simplified`. `minimumStep` forces the steps up to it (tests).
 */
function fittedSnapshot(base, { view, attributions, budget = SNAPSHOT_BUDGET, minimumStep = 0 }) {
  for (let taken = minimumStep; taken <= SNAPSHOT_STEPS.length; taken += 1) {
    const steps = SNAPSHOT_STEPS.slice(0, taken);
    const options = {
      box: plotBoxOf(view, steps.includes('clip-30') ? SNAPSHOT_NEAR_MARGIN : SNAPSHOT_MARGIN),
      simplify: steps.includes('simplify'),
      drop: steps.filter((step) => step.startsWith('drop-'))
    };
    const sources = {};
    for (const [id, entry] of Object.entries(base.sources)) {
      sources[id] = shapedSource(id, entry, options);
    }
    const written = steps.includes('shorten-passages')
      ? base.written.map(shortenedWritten)
      : base.written;
    const data = { ...base, sources, written, simplified: steps };
    if (snapshotSize(data, attributions) <= budget) return data;
  }
  return undefined;
}

/**
 * A written result as the service would answer it (002.5b's shape), so a
 * restored one goes through {@link checkedResult} as any answer does, with
 * the key each rule had for its zone (DEC-5). Never the chunks' texts.
 */
function storedResultOf(result, zone) {
  const keys = writtenKeysOf(result, zone);
  const serviceLimit = (limit) => {
    if (limit === undefined) return null;
    if (limit.kind === 'height_relative') {
      return {
        kind: 'height_relative',
        reference: limit.reference,
        factor: limit.factor,
        offsetMetres: limit.offset,
        minimumMetres: limit.minimum
      };
    }
    return limit;
  };
  return {
    schemaVersion: result.schemaVersion,
    promptVersion: result.promptVersion,
    document: result.document,
    ...(result.chapter === undefined ? {} : { chapter: result.chapter }),
    rules: result.rules.map((rule, index) => ({
      kind: rule.kind,
      sector: rule.sector,
      statement: rule.statement,
      limit: serviceLimit(rule.limit),
      ...(rule.strip === undefined
        ? {}
        : {
            strip: {
              depthMetres: rule.strip.depth,
              edges: Object.keys(STRIP_CHOICES).find((k) => STRIP_CHOICES[k] === rule.strip.edges),
              permits: rule.strip.permits
            }
          }),
      ...(rule.stripRefused === true ? { strip: { refused: true } } : {}),
      page: rule.page,
      ...(rule.article === undefined ? {} : { article: rule.article }),
      passage: rule.passage,
      conditions: rule.conditions,
      exceptions: rule.exceptions,
      sectorUnplaced: rule.sectorUnplaced,
      confidence: rule.confidence,
      ...(keys[index] === undefined ? {} : { ruleKey: keys[index] })
    })),
    dropped: { total: result.dropped },
    chunks: result.chunks,
    model: result.model,
    ...(result.extractedAt === undefined ? {} : { extractedAt: result.extractedAt })
  };
}

/**
 * What two snapshots are compared on (DEC-3): everything but when it was read —
 * and, since Sprint 002.11's review, not the order a service listed its items
 * in either: API Carto and Géorisques promise none, and a re-read listing the
 * same features in another order is the same reading, which must not mark the
 * project unsaved (ADR-0115 Rule 5). The order stored is the one read.
 */
function snapshotContent(data) {
  const { readAt, ...rest } = data;
  const unordered = (list) =>
    Array.isArray(list) ? list.map(stableJson).sort() : list;
  const sources = {};
  for (const [id, entry] of Object.entries(rest.sources ?? {})) {
    const { retrievedAt, ...kept } = entry ?? {};
    for (const name of ['parsed', 'risks', 'pprs', 'documents']) {
      if (Array.isArray(kept[name])) kept[name] = unordered(kept[name]);
    }
    sources[id] = kept;
  }
  return stableJson({ ...rest, sources, written: unordered(rest.written) });
}

/**
 * A stored snapshot, checked (DEC-8): `{ data }` when it is one this package
 * reads, `{ newer }` for a higher schema, `{ malformed }` otherwise, or
 * `undefined` when there is none. The project file is input: every member a
 * restore reads is checked here or where it is read.
 */
function checkedSnapshot(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) return { malformed: true };
  if (Number.isInteger(raw.schema) && raw.schema > SNAPSHOT_SCHEMA) return { newer: raw.schema };
  if (raw.schema !== SNAPSHOT_SCHEMA) return { malformed: true };
  if (
    typeof raw.plotKey !== 'string' ||
    typeof raw.readAt !== 'string' ||
    Number.isNaN(Date.parse(raw.readAt)) ||
    !isRecord(raw.sources) ||
    (raw.written !== undefined && !Array.isArray(raw.written))
  )
    return { malformed: true };
  for (const [id, entry] of Object.entries(raw.sources)) {
    if (!Object.hasOwn(SOURCES, id) || !isRecord(entry)) return { malformed: true };
    if (typeof entry.retrievedAt !== 'string' || Number.isNaN(Date.parse(entry.retrievedAt)))
      return { malformed: true };
    if (entry.features !== undefined || entry.failed !== undefined) return { malformed: true };
    if (entry.parsed !== undefined && !Array.isArray(entry.parsed)) return { malformed: true };
    if (Array.isArray(entry.parsed) && !entry.parsed.every((item) => isRecord(item) && isRecord(item.geometry)))
      return { malformed: true };
  }
  if (raw.sources.municipality !== undefined) {
    const m = raw.sources.municipality;
    if (!(m.municipality === null || isRecord(m.municipality)) || !Number.isSafeInteger(m.count))
      return { malformed: true };
  }
  if (raw.sources.document !== undefined) {
    const d = raw.sources.document;
    if (!Array.isArray(d.documents) || !d.documents.every(isRecord) || !Number.isSafeInteger(d.count))
      return { malformed: true };
  }
  return { data: raw };
}

/** A written entry of a snapshot, checked as a service answer is (DEC-7); `undefined` if not one. */
function restoredWrittenOf(entry) {
  if (!isRecord(entry) || typeof entry.zone !== 'string' || !isRecord(entry.query)) return undefined;
  const query = {};
  for (const name of Object.keys(CHAPTER_INPUTS)) {
    if (typeof entry.query[name] !== 'string' || !CHAPTER_INPUTS[name].test(entry.query[name]))
      return undefined;
    query[name] = entry.query[name];
  }
  const key = `${query.idurba.toUpperCase()}/${query.nomfic}/${query.zone}`;
  const result = checkedResult(entry.result);
  if (result === undefined) return undefined;
  if (
    result.document.idurba.toUpperCase() !== query.idurba.toUpperCase() ||
    result.document.nomfic !== query.nomfic
  )
    return undefined;
  return { key, query, zone: query.zone, result };
}

/** The credit lines of the sources a snapshot holds (DEC-1, ADR-0115 Rule 2). */
function snapshotAttributions(sources) {
  return [
    ...new Set(
      Object.keys(sources)
        .filter((id) => Object.hasOwn(SOURCES, id))
        .map((id) => ATTRIBUTIONS[SOURCES[id].attribution])
    )
  ]
    .map((line) => cut(line, 300))
    .slice(0, SNAPSHOT_ATTRIBUTIONS_MAX);
}

/**
 * DEC-1: one source's snapshot entry from the answer shown — its parsed form,
 * never its raw answer: wave 1's commune and documents parsed (`assemble`
 * reads their raw features otherwise), a layer's items in `parse*`'s shape
 * with their geometry in the Site's CRS, Géorisques' and the file list's
 * own small answers. `retrievedAt` is the answer's.
 */
function snapshotEntryOf(id, answer, view) {
  const { features, retrievedAt, restored, failed, detail, ...rest } = answer;
  if (id === 'municipality') {
    return {
      retrievedAt,
      municipality: municipalityOf(answer, view) ?? null,
      count: featureCountOf(answer)
    };
  }
  if (id === 'document') {
    return { retrievedAt, documents: documentsOf(answer), count: featureCountOf(answer) };
  }
  if (Array.isArray(rest.parsed)) return { retrievedAt, parsed: rest.parsed };
  return { retrievedAt, ...rest };
}

/** A finite point, or `undefined`. */
const pointOf = (p) =>
  Number.isFinite(p?.easting) && Number.isFinite(p?.northing)
    ? { easting: p.easting, northing: p.northing }
    : undefined;

/** A stored geometry, checked: only what `convertGeometry` makes. */
function restoredGeometryOf(geometry) {
  if (!isRecord(geometry)) return { kind: 'none' };
  const kind = geometry.kind;
  const centroid = pointOf(geometry.centroid);
  const parts = (list, min) =>
    (Array.isArray(list) ? list : [])
      .filter(Array.isArray)
      .map((part) => part.map(pointOf))
      .filter((part) => part.length >= min && part.every((p) => p !== undefined));
  if (kind === 'surface') {
    if (geometry.unconverted === true) return { kind, unconverted: true };
    return { kind, rings: parts(geometry.rings, 3), ...(centroid === undefined ? {} : { centroid }) };
  }
  if (kind === 'line') {
    if (geometry.unconverted === true) return { kind, unconverted: true };
    return { kind, lines: parts(geometry.lines, 2), ...(centroid === undefined ? {} : { centroid }) };
  }
  return { kind: kind === 'point' ? 'point' : 'none' };
}

/** A layer's stored item, re-read field by field as `parse*` reads a feature (DEC-8). */
const RESTORED_PICKS = {
  zone: pickZone,
  sector: pickSector,
  prescription: (p) => ({
    libelle: text(p.libelle),
    txt: optionalText(p.txt),
    type: text(p.type),
    subtype: optionalText(p.subtype),
    datvalid: optionalText(p.datvalid)
  }),
  information: (p) => ({
    libelle: text(p.libelle),
    txt: optionalText(p.txt),
    type: text(p.type),
    subtype: optionalText(p.subtype)
  }),
  easement: pickEasement
};
const restoredPickOf = (id) =>
  id === 'zone-urba'
    ? RESTORED_PICKS.zone
    : id === 'secteur-cc'
      ? RESTORED_PICKS.sector
      : PRESCRIPTION_LAYERS.includes(id)
        ? RESTORED_PICKS.prescription
        : INFORMATION_LAYERS.includes(id)
          ? RESTORED_PICKS.information
          : EASEMENT_LAYERS.includes(id)
            ? RESTORED_PICKS.easement
            : undefined;

/**
 * DEC-4: a snapshot's entry as a source's answer, marked `restored` — the
 * project file is input, so every member is re-read as this file reads an
 * answer (strings as strings, a link only to the GPU's own files); `undefined`
 * for an entry it cannot read.
 */
function restoredAnswerOf(id, entry) {
  if (!isRecord(entry) || typeof entry.retrievedAt !== 'string') return undefined;
  const base = { retrievedAt: entry.retrievedAt, restored: true };
  const strings = (value) => (typeof value === 'string' ? value : undefined);
  if (id === 'municipality') {
    const m = entry.municipality;
    if (!Number.isSafeInteger(entry.count)) return undefined;
    if (m === null) return { ...base, municipality: undefined, count: entry.count };
    if (!isRecord(m) || typeof m.insee !== 'string') return undefined;
    return {
      ...base,
      count: entry.count,
      municipality: {
        insee: m.insee,
        name: text(m.name),
        isRnu: m.isRnu,
        names: Array.isArray(m.names) ? m.names.filter((n) => typeof n === 'string') : [],
        count: Number.isSafeInteger(m.count) ? m.count : 1,
        ...(typeof m.arrondissement === 'string' ? { arrondissement: m.arrondissement } : {})
      }
    };
  }
  if (id === 'document') {
    if (!Array.isArray(entry.documents) || !Number.isSafeInteger(entry.count)) return undefined;
    return {
      ...base,
      count: entry.count,
      documents: entry.documents.filter(isRecord).map((d) => ({
        id: strings(d.id),
        partition: strings(d.partition),
        name: strings(d.name),
        type: text(d.type).toUpperCase(),
        title: strings(d.title),
        status: strings(d.status)
      }))
    };
  }
  const pick = restoredPickOf(id);
  if (pick !== undefined) {
    if (!Array.isArray(entry.parsed)) return undefined;
    return {
      ...base,
      parsed: entry.parsed.filter(isRecord).map((item, index) => ({
        id: typeof item.id === 'string' ? item.id : `${id}.${index}`,
        ...pick(item),
        geometry: restoredGeometryOf(item.geometry)
      }))
    };
  }
  if (id === 'gpu-files') {
    if (!['found', 'newer', 'not-found'].includes(entry.link)) return undefined;
    const href =
      typeof entry.href === 'string' && entry.href.startsWith(`${GPU_DOCUMENT_API}/`)
        ? entry.href
        : undefined;
    if (entry.link === 'found' && href === undefined) return undefined;
    return {
      ...base,
      link: entry.link,
      ...(typeof entry.documentId === 'string' ? { documentId: entry.documentId } : {}),
      ...(href === undefined ? {} : { href })
    };
  }
  if (entry.empty === true) return { ...base, empty: true };
  switch (id) {
    case 'georisques-risques':
      return Array.isArray(entry.risks)
        ? {
            ...base,
            risks: entry.risks
              .filter((r) => typeof r?.code === 'string' && typeof r.label === 'string')
              .map((r) => ({ code: r.code, label: r.label }))
          }
        : undefined;
    case 'georisques-pprn':
      return Array.isArray(entry.pprs)
        ? {
            ...base,
            pprs: entry.pprs
              .filter((p) => typeof p?.id === 'string')
              .map((p) => ({ id: p.id, label: text(p.label), procedure: optionalText(p.procedure) }))
          }
        : undefined;
    case 'georisques-sismique':
      return typeof entry.zone === 'string'
        ? { ...base, zone: entry.zone, label: optionalText(entry.label) }
        : undefined;
    case 'georisques-rga':
      return typeof entry.exposure === 'string'
        ? { ...base, exposure: entry.exposure, label: optionalText(entry.label) }
        : undefined;
    case 'georisques-radon':
      return typeof entry.radonClass === 'string' ? { ...base, radonClass: entry.radonClass } : undefined;
    default:
      return undefined;
  }
}

/** `YYYY-MM-DD`, local, of a date: how a snapshot's date is said (as `clock` says a time). */
const localDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayOfIso = (iso) => localDay(new Date(iso));

// ── The reader ──────────────────────────────────────────────────────────────────

/**
 * The reader behind the source, with its fetch, clock and Site service
 * injected so the tests run on recorded answers (step 4).
 *
 * - `fetch(url, init)`: the platform's `fetch`.
 * - `now()`: a `Date`.
 * - `site()`: the `site` service or `undefined` (`services.getOptional`).
 * - `timeoutMs`: per request, 10 s by default.
 * - `log(message)`: unknown codes, said once each.
 * - Since 002.1a, each optional: `roads()`, `packageData()`, `document()` —
 *   the `roads`, `site-package-data` and `document` services — and
 *   `translate(key)`, the `i18n` service's.
 */
export function createReader({
  fetch: fetchImpl,
  now = () => new Date(),
  site: siteOf,
  timeoutMs = REQUEST_TIMEOUT_MS,
  log = () => {},
  roads = () => undefined,
  packageData = () => undefined,
  document: documentOf = () => undefined,
  mapFeatures = () => undefined,
  ai = () => undefined,
  translate = () => undefined,
  // Sprint 002.6a: the companion service, asked through `getOptional` on each
  // read (DEC-1); the 2 s wait and the chapter timeout are injectable for tests.
  pluginService = () => undefined,
  wait = sleep,
  chapterWaitMs = CHAPTER_WAIT_MS,
  chapterTimeoutMs = CHAPTER_TIMEOUT_MS,
  // Sprint 002.6b: the polling timer and the after-the-read signal, injectable for tests.
  schedule = (fn, ms) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
  // Sprint 002.10 DEC-3: the document watch's hourly timer, apart from the extractions' polling
  // so each is driven on its own in tests. Never keeps a process alive (Node; the editor's timers have no `unref`).
  watchSchedule = (fn, ms) => {
    const timer = setTimeout(fn, ms);
    timer?.unref?.();
    return () => clearTimeout(timer);
  },
  // Its own clock too: the reader's `now` stamps the sources, and a question to the service is not one.
  watchClock = () => Date.now(),
  defer = (fn) => setTimeout(fn, 0),
  // Sprint 002.11 DEC-2: the snapshot's budget and the first step taken (tests force them).
  snapshotBudget = SNAPSHOT_BUDGET,
  snapshotMinimumStep = 0
}) {
  /** Sprint 002.11: set while this reader writes its cache, so its own write signals nothing. */
  let writingCache = false;
  /**
   * Sprint 002.11's review: what this reader last wrote, serialized. The host
   * says a cache changed once per microtask after the write — when `writingCache`
   * is long clear and the read has returned — so the package's own write is
   * told by its content, not by the moment; otherwise each write cost a second read.
   */
  let ownCacheWrite;
  /** Sprint 002.11 DEC-7: the last completed read's plot, for « Use it » to write the snapshot. */
  let lastSnapshotRead;
  /** Plot key → `{ report, answers, good }` (DEC-9): memory, for the session. */
  const cache = new Map();
  /**
   * 002.6a DEC-2: `upper(idurba)/nomfic/zone` → `{ promise, answer?, retryAt? }`,
   * for the session, beside the plot cache and never inside a cached report. A
   * lookup is never aborted by a read: a superseded read's answer is the next
   * read's. Disposal aborts them.
   */
  const chapters = new Map();
  let chapterSession = new AbortController();
  /** Review decision Q1: the host's `onDidChange` listeners (SDK 1.28, 096.8b). */
  const listeners = new Set();
  /**
   * 002.6b DEC-2 / DEC-1: `id` → a zone's extraction record — `{ id, key, query,
   * zone, baseUrl, state, result?, current?, error?, jobId?, progress?,
   * pending?, waiters, asked, retryAt?, cancel? }`. Session memory, never the
   * project's; the job runs on the service.
   */
  const extractions = new Map();
  /**
   * Sprint 002.23: the reading's progress as a card in the AI conversation (SDK 1.41). A host
   * without `ai.cards` has none, and the panel shows the wait as it always did.
   */
  /** Sprint 002.24: the Rules view's latest offer of questions about the project. */
  let projectOffer;
  const cards = createReadingCards({
    ai,
    act: (record, actionId) => cardAction(record, actionId),
    onDone: () => projectCards.afterReading()
  });
  const projectCards = createProjectCards({
    ai,
    offer: () => projectOffer,
    save: (nature, offer) => {
      const written = writeSectionWith(
        (section) => withProjectNature(section, nature, offer.documentKey, now().toISOString()),
        'set-project-nature'
      );
      if (written) requestSignal();
      return written;
    },
    dismiss: (offer) => {
      if (
        writeSectionWith(
          (section) => withProjectAsked(section, offer.documentKey, now().toISOString()),
          'set-project-nature'
        )
      )
        requestSignal();
    }
  });

  /** S5: reads in flight; a change during one is signalled once it has returned. */
  let readsInFlight = 0;
  let signalPending = false;
  let signalScheduled = false;
  let active;
  /** What a report was assembled from that 002.1a's rules need: the sectors' types. */
  const facts = new WeakMap();
  /**
   * B1: the EL7 alignment easements a geometry across the road intersects —
   * `assiette-sup-l` and `-s` with `categorie=el7`, through the planning reads'
   * own fetch, timeout and paging guard. `{ features, retrievedAt }` or
   * `{ refused, retrievedAt }`.
   */
  const fetchEl7 = async (geometry, signal) => {
    const features = [];
    for (const layer of ['assiette-sup-l', 'assiette-sup-s']) {
      const { url, body } = apiCartoRequest(layer, geometry, 'el7');
      const answer = featureCollection(await fetchJson(fetchImpl, url, signal, timeoutMs, body));
      if (answer.failed !== undefined) {
        return { refused: answer.failed, retrievedAt: now().toISOString() };
      }
      features.push(
        ...answer.features.filter(
          (f) => String(f.properties?.suptype ?? '').toLowerCase() === 'el7'
        )
      );
    }
    return { features, retrievedAt: now().toISOString() };
  };
  const rnu = createRnu({
    fetchEl7,
    site: siteOf,
    roads,
    packageData,
    document: documentOf,
    mapFeatures,
    ai,
    translate,
    now,
    log
  });

  /**
   * Sprint 002.12: every report that leaves the reader — a progress and the answer — has the
   * panel's shape (`panelShaped`); what the report was assembled from stays with it (`facts`).
   */
  function panelShapedKeepingFacts(report) {
    const next = panelShaped(report);
    if (next !== report && facts.has(report)) facts.set(next, facts.get(report));
    return next;
  }

  async function read(request, context = {}) {
    // A newer read supersedes an older one (DEC-2), whatever its reason. So a
    // `design` read arriving during a Refresh aborts the Refresh and answers
    // from the cache, as it was before the Refresh: chosen over queueing,
    // because the host drops a superseded answer anyway and asks again on the
    // next Refresh, and a design edit must not wait for every service.
    active?.abort();
    const controller = new AbortController();
    active = controller;
    readsInFlight += 1;
    const signals = [controller.signal];
    if (context.signal !== undefined) signals.push(context.signal);
    const signal = AbortSignal.any(signals);
    const progress = (report) => {
      if (!signal.aborted && typeof context.progress === 'function')
        context.progress(panelShapedKeepingFacts(report));
    };
    // Sprint 002.6a: the zones' chapters, started as soon as the zones are known
    // (after wave 2, or at once from the cache) so the 2 s wait overlaps the
    // other sources; applied to every report this read answers.
    let pages;
    const startPages = (regime, partition, zones, documentName) => {
      pages ??= beginPages(regime, partition, zones, documentName, signal, request.reason);
    };
    try {
      // Sprint 002.1a: the roads are asked beside the planning reads, once
      // per Site boundary per session; the rules, the edges and the checks are
      // recomputed on every read (a `design` read included) from the cached
      // report, the section and fresh measures — never cached themselves.
      const roadsAsked = rnu.roadsFor(request.site, signal, request.reason === 'refresh');
      const base = await readPlot(
        request,
        signal,
        (report) =>
          // Progress carries the rules and the edges; the checks, which ask the
          // host's measures, come with the answer only.
          progress(
            withZonePages(
              rnu.augment(report, request, rnu.roadsKnown(request.site), facts.get(report), {
                checks: false,
                written: writtenInput(pages, facts.get(report)),
                documentWatch: documentWatchOf(facts.get(report)?.partition)
              }),
              pages
            )
          ),
        startPages
      );
      if (pages === undefined) {
        const known = facts.get(base);
        startPages(base.regime?.code, known?.partition, known?.zones ?? [], known?.documentName);
      }
      const answeredRoads = await roadsAsked;
      if (signal.aborted) throw new ReadAborted();
      // Sprint 002.1b: the facing parcels and the neighbours, for the national rules only.
      if (base.regime?.code === 'rnu' || base.regime?.code === 'cc') {
        await rnu.contextFor(request.site, answeredRoads, signal, request.reason === 'refresh');
        if (signal.aborted) throw new ReadAborted();
      }
      await pages.settled();
      if (signal.aborted) throw new ReadAborted();
      const written = writtenInput(pages, facts.get(base));
      const answer = withZonePages(
        rnu.augment(base, request, answeredRoads, facts.get(base), {
          written,
          documentWatch: documentWatchOf(facts.get(base)?.partition),
          // 002.23: the rules view's own numbers, for the reading's card.
          onCounts: (counts, zones, offer) => {
            projectOffer = offer;
            cards.counts(counts, zones);
          }
        }),
        pages
      );
      // Sprint 002.11: the snapshot written when the reading changed, and said.
      return panelShapedKeepingFacts(withSnapshot(answer, request.site, written?.zones ?? []));
    } finally {
      pages?.stop();
      if (active === controller) active = undefined;
      readsInFlight -= 1;
      // S5: what changed while a read ran is signalled after it has returned.
      if (readsInFlight === 0 && signalPending) {
        signalPending = false;
        fireSoon();
      }
    }
  }

  async function readPlot(request, signal, progress, zonesKnown = () => {}) {
    const view = request.site;
    const service = siteOf();
    if (service === undefined || view === undefined) {
      return noSiteReport();
    }
    // The service converts through the *current* Site's CRS (DEC-3): if it
    // moved during the read, a newer read is coming and this one says nothing.
    if (service.current()?.crs !== view.crs) throw new ReadAborted();

    const key = plotKey(view);
    const cached = cache.get(key);
    if (
      cached !== undefined &&
      cached.report !== undefined &&
      request.reason !== 'refresh' &&
      (cached.expiresAt === undefined || now().getTime() < cached.expiresAt)
    ) {
      remember(key, cached);
      return cached.report;
    }

    const assumptions = [];
    let geometry = view.parcels.length > 0 ? plotGeometry(view, service) : undefined;
    let queryRings;
    if (geometry === undefined) {
      geometry = anchorGeometry(view);
      assumptions.push({
        id: 'anchor-only',
        text: {
          key:
            view.parcels.length === 0
              ? 'fr-urban-rules.assumption.noPlot'
              : 'fr-urban-rules.assumption.anchorOnly'
        }
      });
      queryRings = [[geometry.coordinates]];
    } else {
      queryRings = geometry.coordinates.map((polygon) => polygon[0].slice(0, -1));
    }
    const point =
      geometry.type === 'Point'
        ? { longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] }
        : centroidOf(queryRings);

    const entry = cached ?? { good: {} };
    // Sprint 002.11 DEC-4: no memory of this plot — the project's snapshot, when
    // it is this plot's, seeds the last good answers. The entry carries no
    // `report`, so nothing is answered from it without asking again.
    const restored = cached === undefined ? restoreSnapshot(key) : undefined;
    const restoredIds = new Set(Object.keys(restored?.answers ?? {}));
    if (restored !== undefined) {
      Object.assign(entry.good, restored.answers);
      entry.restoredFrom = restored.data.readAt;
    }
    const state = {
      view,
      service,
      assumptions,
      answers: { ...restored?.answers },
      pending: new Set(restoredIds),
      skipped: new Set(),
      good: entry.good
    };
    // While a snapshot's answer waits for its fresh one, the overview says so.
    const checking = () =>
      [...restoredIds].some((id) => state.answers[id]?.restored && state.pending.has(id));
    const emit = () => {
      const report = assemble(state);
      progress(
        checking() ? withSnapshotNotices(report, [checkingNotice(restored.data.readAt)]) : report
      );
    };
    if (restored !== undefined) {
      // Shown at once, through the read's own progress: the regime from the
      // snapshot's wave 1, every source `loading` with its date.
      const first = { ...state, assumptions: [...assumptions], answers: { ...state.answers }, good: {} };
      resolveRegime(
        first,
        first.answers.municipality ?? { failed: 'missing' },
        first.answers.document ?? { failed: 'missing' }
      );
      progress(withSnapshotNotices(assemble(first), [checkingNotice(restored.data.readAt)]));
    }

    /** One source: fetched, parsed, recorded; the last good answer kept for a re-read. */
    const run = async (id, task) => {
      state.pending.add(id);
      let outcome;
      try {
        outcome = await task();
      } catch (cause) {
        if (cause instanceof ReadAborted || signal.aborted) throw new ReadAborted();
        log(
          `${SOURCE_ID}: ${id} could not be read: ${cause instanceof Error ? cause.message : String(cause)}`
        );
        outcome = { failed: 'malformed', detail: MALFORMED };
      }
      if (signal.aborted) throw new ReadAborted();
      const retrievedAt = now().toISOString();
      const answer = { ...outcome, retrievedAt };
      if (outcome.failed === undefined) entry.good[id] = answer;
      state.answers[id] = answer;
      state.pending.delete(id);
      return answer;
    };

    const layer = (name) =>
      run(name, async () => {
        const { url, body } = apiCartoRequest(name, geometry);
        const collection = featureCollection(
          await fetchJson(fetchImpl, url, signal, timeoutMs, body)
        );
        if (collection.failed !== undefined) return collection;
        // Parsed here, inside the source's task: a malformed element costs this
        // source (`malformed`, logged by `run`), never the read.
        return {
          features: collection.features,
          parsed: parseFeatures(name, collection.features, service)
        };
      });

    // Wave 1: the commune and the document (DEC-5).
    // No progress before the regime is known: a report saying "unknown"
    // while the commune is still being asked would say something false.
    const [municipality, documents] = await Promise.all([layer('municipality'), layer('document')]);
    resolveRegime(state, municipality, documents);

    // What the regime needs read, every one announced `loading` before the
    // first progress, so a section still to come never reads as absent.
    const regime = state.regime.code;
    const local = regime === 'plu' || regime === 'plui';
    const zoneLayer = local ? 'zone-urba' : regime === 'cc' ? 'secteur-cc' : undefined;
    const commune = communeCode(view, state.municipality);
    const where = { commune, point, arrondissement: arrondissementCode(view, state.municipality) };
    const wave3 = [
      ...(local ? [...PRESCRIPTION_LAYERS, ...INFORMATION_LAYERS] : []),
      ...EASEMENT_LAYERS,
      ...(state.document === undefined ? [] : ['gpu-files']),
      ...GEORISQUES_SOURCES.filter(
        (id) => commune !== undefined || id === 'georisques-pprn' || id === 'georisques-rga'
      )
    ];
    for (const id of [...(zoneLayer === undefined ? [] : [zoneLayer]), ...wave3])
      state.pending.add(id);
    // Sprint 002.11: a snapshot's source this regime does not read is not shown.
    const asked = new Set(['municipality', 'document', ...state.pending]);
    for (const id of restoredIds) {
      if (asked.has(id)) continue;
      delete state.answers[id];
      state.pending.delete(id);
    }
    emit();

    // Wave 2: the zone, or the sector of a carte communale.
    if (zoneLayer !== undefined) {
      await layer(zoneLayer);
      emit();
    }
    // Sprint 002.6a: the zones are known; their chapters are asked beside wave 3.
    zonesKnown(regime, state.document?.partition, zonesOf(state), state.document?.name);

    // Wave 3: in parallel, each settling on its own.
    const taskOf = (id) => {
      if (id === 'gpu-files') return () => run(id, () => resolveLink(state, signal));
      if (GEORISQUES_SOURCES.includes(id))
        return () => run(id, () => readGeorisques(id, where, signal));
      return () => layer(id);
    };
    const tasks = wave3.map((id) => taskOf(id)().then(() => emit()));
    // Every task settles (each source catches its own failure); an abort rejects.
    const settled = await Promise.allSettled(tasks);
    if (
      signal.aborted ||
      settled.some((s) => s.status === 'rejected' && s.reason instanceof ReadAborted)
    ) {
      throw new ReadAborted();
    }
    const report = assemble(state);
    // Sprint 002.11 DEC-1, DEC-6: what this read would keep in the project, and
    // whether anything was answered afresh (offline, nothing was).
    entry.sources = snapshotSourcesOf(state, asked);
    entry.facts = factsOf(state);
    entry.freshIds = new Set(
      Object.entries(state.answers)
        .filter(([, answer]) => !answer.restored && answer.failed === undefined)
        .map(([id]) => id)
    );
    // Sprint 002.11's review: a source asked that did not answer — « unchanged »
    // then speaks only for those that did.
    entry.partly = [...asked].some((id) => !entry.freshIds.has(id));
    entry.summary = jsonClone({
      regime: { code: report.regime.code },
      ...(state.municipality === undefined
        ? {}
        : { municipality: { insee: state.municipality.insee, name: state.municipality.name } }),
      ...(state.document === undefined
        ? {}
        : {
            document: {
              idurba: entry.facts.document?.version,
              datvalid: entry.facts.document?.datvalid,
              partition: state.document.partition,
              gpuDocId: state.document.id,
              type: state.document.type,
              name: state.document.name
            }
          })
    });
    entry.compared = false;
    // An `unknown` report is never answered from memory: the next read asks
    // again. One with a source unavailable is, for five minutes only; then a
    // `site` or `design` read retries. The last good answers stay either way.
    if (report.regime.code === 'unknown') {
      entry.report = undefined;
    } else {
      entry.report = report;
      // A source shown from an earlier reading (`saved`) did not answer either.
      entry.expiresAt = report.sources.some((s) => s.state === 'unavailable' || s.state === 'saved')
        ? now().getTime() + DEGRADED_TTL_MS
        : undefined;
    }
    remember(key, entry);
    return report;
  }

  /** Most recent last; past {@link CACHE_PLOTS} the oldest plot is forgotten. */
  function remember(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > CACHE_PLOTS) cache.delete(cache.keys().next().value);
  }

  // ── The planning snapshot (Sprint 002.11) ─────────────────────────────────────

  /** The `site-package-data` service when it has the cache (SDK 1.33); `undefined` before. */
  function cacheService() {
    const service = packageData();
    return typeof service?.readCache === 'function' && typeof service.writeCache === 'function'
      ? service
      : undefined;
  }

  /** The project's snapshot, checked (DEC-8); a newer or malformed one is said once and ignored. */
  function storedSnapshot() {
    let raw;
    try {
      raw = cacheService()?.readCache();
    } catch (cause) {
      log(`${SOURCE_ID}: readCache threw: ${String(cause)}`);
      return undefined;
    }
    const checked = checkedSnapshot(raw);
    if (checked?.newer !== undefined) {
      logOnce(`${SOURCE_ID}: the project's snapshot is schema ${checked.newer}; this package reads ${SNAPSHOT_SCHEMA}: ignored`);
      return undefined;
    }
    if (checked?.malformed) {
      logOnce(`${SOURCE_ID}: the project's snapshot is malformed: ignored, replaced at the next read`);
      return undefined;
    }
    return checked?.data;
  }

  /**
   * DEC-4, DEC-7: the snapshot of `key`, as the answers it holds (each marked
   * `restored`), and its written rules seeded as extraction records — held
   * whether or not the companion is located. `undefined` for another plot.
   */
  function restoreSnapshot(key) {
    const data = storedSnapshot();
    if (data === undefined || data.plotKey !== key) return undefined;
    const answers = {};
    for (const [id, entry] of Object.entries(data.sources)) {
      const answer = restoredAnswerOf(id, entry);
      if (answer === undefined) {
        logOnce(`${SOURCE_ID}: the snapshot's ${id} is not one this package reads: not restored`);
        continue;
      }
      answers[id] = answer;
    }
    for (const raw of data.written ?? []) {
      const written = restoredWrittenOf(raw);
      if (written === undefined) {
        logOnce(`${SOURCE_ID}: a written reading of the snapshot is malformed: not restored`);
        continue;
      }
      const id = cyrb53(written.key);
      // A record this session already holds (asked, extracted) stands.
      if (extractions.has(id)) continue;
      extractions.set(id, {
        id,
        key: written.key,
        query: written.query,
        zone: written.zone,
        state: 'done',
        result: written.result,
        restored: true,
        readAt: data.readAt,
        waiters: 0,
        asked: false,
        revision: 0
      });
    }
    return { data, answers };
  }

  /** DEC-1: the snapshot's sources of a read — what is shown, raw answers dropped. */
  function snapshotSourcesOf(state, asked) {
    const sources = {};
    for (const id of Object.keys(SOURCES)) {
      if (!asked.has(id)) continue;
      const shown = usable(state, id);
      if (shown === undefined) continue;
      sources[id] = snapshotEntryOf(id, shown, state.view);
    }
    return sources;
  }

  /**
   * DEC-6's facts of a state: what « what changed » compares, never geometry,
   * with the sources each fact was read from.
   */
  function factsOf(state) {
    const zones = zonesOf(state);
    const items = (layers, label) =>
      layers.flatMap((id) => (usable(state, id)?.parsed ?? []).map(label));
    const document = state.document;
    const version = zones.find((z) => z.idurba !== undefined)?.idurba ?? document?.name;
    const datvalid = zones.find((z) => z.datvalid !== undefined)?.datvalid;
    return {
      regime: state.regime?.code,
      regimeLabel: state.regime?.label,
      document:
        document === undefined
          ? undefined
          : {
              type: document.type === 'PLUI' ? 'PLUi' : document.type,
              version,
              datvalid,
              validFrom: isoDate(datvalid) ?? idurbaDate(version)
            },
      zones: [...new Set(zones.map((z) => z.libelle).filter((l) => l !== ''))].sort(),
      prescriptions: items(PRESCRIPTION_LAYERS, (p) => ({
        id: `${p.type}|${p.subtype ?? ''}|${p.libelle}`,
        label: p.libelle || p.type
      })),
      easements: items(EASEMENT_LAYERS, (e) => ({
        id: `${e.suptype}|${e.nomass ?? ''}`,
        label: e.nomass ?? e.suptype.toUpperCase()
      })),
      risks: [
        ...(usable(state, 'georisques-risques')?.risks ?? []).map((r) => ({
          id: `risk|${r.code}`,
          label: r.label
        })),
        ...(usable(state, 'georisques-pprn')?.pprs ?? []).map((p) => ({
          id: `ppr|${p.id}`,
          label: p.label
        }))
      ]
    };
  }

  /**
   * DEC-6: the changes between the snapshot's facts and a fresh read's, on the
   * sources ready in both; structured, worded at the answer.
   */
  function changesBetween(before, after, beforeIds, afterIds) {
    const both = (ids) => ids.every((id) => beforeIds.has(id) && afterIds.has(id));
    const changes = [];
    if (both(['municipality', 'document'])) {
      const a = before.document;
      const b = after.document;
      if (
        a !== undefined &&
        b !== undefined &&
        (String(a.version ?? '').toUpperCase() !== String(b.version ?? '').toUpperCase() ||
          String(a.datvalid ?? '') !== String(b.datvalid ?? ''))
      ) {
        changes.push({
          kind: 'version',
          type: b.type,
          old: a.version ?? '—',
          new: b.version ?? '—',
          date: b.validFrom ?? '—'
        });
      }
      if (
        before.regime !== after.regime &&
        before.regimeLabel !== undefined &&
        after.regimeLabel !== undefined
      ) {
        changes.push({ kind: 'regime', old: before.regimeLabel, new: after.regimeLabel });
      }
    }
    const zoneIds = ['zone-urba', 'secteur-cc'].filter((id) => beforeIds.has(id) || afterIds.has(id));
    if (zoneIds.length > 0 && both(zoneIds) && before.zones.join('|') !== after.zones.join('|')) {
      changes.push({
        kind: 'zone',
        old: before.zones.join(', ') || '—',
        new: after.zones.join(', ') || '—'
      });
    }
    const listed = (kind, layers, list) => {
      if (!both(layers.filter((id) => beforeIds.has(id) || afterIds.has(id)))) return;
      const old = new Map(before[list].map((item) => [item.id, item.label]));
      const fresh = new Map(after[list].map((item) => [item.id, item.label]));
      for (const [id, label] of fresh) {
        if (!old.has(id)) changes.push({ kind: `${kind}-added`, label });
      }
      for (const [id, label] of old) {
        if (!fresh.has(id)) changes.push({ kind: `${kind}-removed`, label });
      }
    };
    listed('prescription', PRESCRIPTION_LAYERS, 'prescriptions');
    listed('easement', EASEMENT_LAYERS, 'easements');
    listed('risk', ['georisques-risques', 'georisques-pprn'], 'risks');
    return changes;
  }

  /** DEC-4: « Read on {date} — checking for changes… ». */
  const checkingNotice = (readAt) => ({
    kind: 'notice',
    tone: 'info',
    text: { key: 'fr-urban-rules.snapshot.checking', params: { date: dayOfIso(readAt) } }
  });

  /** A report with the snapshot's blocks first in its overview. */
  function withSnapshotNotices(report, blocks) {
    if (blocks.length === 0 || !Array.isArray(report?.overview)) return report;
    // Sprint 002.10: « what changed » already says the version changed (002.11 DEC-6);
    // the overview's own line for it is not said twice.
    const saysVersion = blocks.some(
      (b) =>
        b.text?.key === 'fr-urban-rules.snapshot.change.version' ||
        b.text?.key === 'fr-urban-rules.snapshot.change.versionNothingToReview'
    );
    const rest = saysVersion
      ? report.overview.filter(
          (b) =>
            b.text?.key !== NEW_DOCUMENT_VERSION_KEY && b.text?.key !== NEW_DOCUMENT_VERSION_UNDATED_KEY
        )
      : report.overview;
    const next = { ...report, overview: [...blocks, ...rest] };
    // What the report was assembled from stays with it (002.1a's facts).
    if (facts.has(report)) facts.set(next, facts.get(report));
    return next;
  }

  /** DEC-6: one change, worded (en and fr in the package's resources). */
  function changeBlock(change, reopened) {
    const notice = (key, params) => ({ kind: 'notice', tone: 'info', text: { key, params } });
    switch (change.kind) {
      case 'version':
        // With no confirmation to review, the line says the version alone.
        return reopened > 0
          ? notice('fr-urban-rules.snapshot.change.version', {
              type: change.type,
              old: change.old,
              new: change.new,
              date: change.date,
              count: reopened
            })
          : notice('fr-urban-rules.snapshot.change.versionNothingToReview', {
              type: change.type,
              old: change.old,
              new: change.new,
              date: change.date
            });
      case 'regime':
        // A regime's name is a phrase of its own: given as text, in the host's language.
        return notice('fr-urban-rules.snapshot.change.regime', {
          regime: translate(change.new) ?? change.new,
          old: translate(change.old) ?? change.old
        });
      case 'zone':
        return notice('fr-urban-rules.snapshot.change.zone', { old: change.old, new: change.new });
      case 'prescription-added':
        return notice('fr-urban-rules.snapshot.change.prescriptionAdded', { label: cut(change.label, 300) });
      case 'prescription-removed':
        return notice('fr-urban-rules.snapshot.change.prescriptionRemoved', { label: cut(change.label, 300) });
      case 'easement-added':
        return notice('fr-urban-rules.snapshot.change.easementAdded', { label: cut(change.label, 300) });
      case 'easement-removed':
        return notice('fr-urban-rules.snapshot.change.easementRemoved', { label: cut(change.label, 300) });
      case 'risk-added':
        return notice('fr-urban-rules.snapshot.change.riskAdded', { label: cut(change.label, 300) });
      default:
        return notice('fr-urban-rules.snapshot.change.riskRemoved', { label: cut(change.label, 300) });
    }
  }

  /** DEC-6: the facts of a stored snapshot, by the same readers as a fresh read's. */
  function factsOfSnapshot(data, view) {
    const answers = {};
    for (const [id, entry] of Object.entries(data.sources)) {
      const answer = restoredAnswerOf(id, entry);
      if (answer !== undefined) answers[id] = answer;
    }
    const state = {
      view,
      service: siteOf(),
      assumptions: [],
      answers,
      pending: new Set(),
      skipped: new Set(),
      good: {}
    };
    resolveRegime(
      state,
      answers.municipality ?? { failed: 'missing' },
      answers.document ?? { failed: 'missing' }
    );
    return { facts: factsOf(state), ids: new Set(Object.keys(answers)) };
  }

  /** DEC-6's {n}: the rules the existing reopen rule reopened on this report. */
  const reopenedCount = (report) =>
    (report?.rules ?? []).filter((rule) =>
      (rule.conditions ?? []).some((c) => c?.key === 'fr-urban-rules.rule.reopened')
    ).length;

  /**
   * DEC-1, DEC-3: the snapshot of a completed read for the plot on view — its
   * sources and the written readings shown — written when its content differs
   * from the stored one (`readAt` and every `retrievedAt` aside), and only
   * then dated now. DEC-6's comparison runs once per fetching read, against
   * the snapshot as it stood. Never throws: a refused write is said.
   */
  function snapshotStep(key, entry, view, zones) {
    const stored = storedSnapshot();
    const baseline = stored?.plotKey === key ? stored : undefined;
    if (!entry.compared) {
      entry.compared = true;
      if (baseline !== undefined) {
        if (entry.freshIds.size === 0) {
          entry.note = { kind: 'offline', since: baseline.readAt };
        } else {
          const before = factsOfSnapshot(baseline, view);
          const changes = changesBetween(before.facts, entry.facts, before.ids, entry.freshIds);
          if (changes.length > 0) entry.note = { kind: 'changed', since: baseline.readAt, changes };
          else if (entry.note?.kind === 'changed') {
            // Shown for the session (DEC-6), though the next snapshot is the new state.
          } else if (entry.restoredFrom !== undefined) {
            entry.note = {
              kind: 'unchanged',
              since: baseline.readAt,
              ...(entry.partly ? { partly: true } : {})
            };
          } else entry.note = undefined;
        }
      }
    }
    const service = cacheService();
    if (service === undefined || Object.keys(entry.sources).length === 0) return;
    // A design read answered from memory changes nothing kept: no clip, no copy (DEC-3).
    const writtenNow = zones
      .map(
        ({ record }) =>
          `${record?.id}:${record?.revision}:${record?.state}:${record?.result?.extractedAt}:${record?.restored}:${record?.result?.document?.documentId}`
      )
      .join('|');
    if (
      entry.lastStep?.sources === entry.sources &&
      entry.lastStep.written === writtenNow &&
      entry.lastStep.stored === baseline?.readAt
    )
      return;
    entry.lastStep = { sources: entry.sources, written: writtenNow, stored: baseline?.readAt };
    const base = {
      schema: SNAPSHOT_SCHEMA,
      plotKey: key,
      ...(typeof view.crs === 'string' ? { crs: view.crs } : {}),
      readAt: '',
      ...entry.summary,
      sources: entry.sources,
      written: zones
        .filter(({ record }) => record?.state === 'done' && record.result !== undefined)
        .map(({ zone, query, record }) => ({
          zone,
          query,
          result: storedResultOf(record.result, zone)
        }))
    };
    const attributions = snapshotAttributions(entry.sources);
    const fitted = fittedSnapshot(jsonClone(base), {
      view,
      attributions,
      budget: snapshotBudget,
      minimumStep: snapshotMinimumStep
    });
    if (fitted === undefined) {
      entry.saved = 'not-saved';
      log(`${SOURCE_ID}: the snapshot does not fit ${snapshotBudget} characters: not saved`);
      return;
    }
    const data = jsonClone(fitted);
    if (baseline !== undefined && snapshotContent(baseline) === snapshotContent(data)) {
      entry.saved = baseline;
      return;
    }
    data.readAt = now().toISOString();
    writingCache = true;
    try {
      service.writeCache(data, attributions);
      ownCacheWrite = stableJson(data);
      entry.saved = data;
      entry.lastStep.stored = data.readAt;
    } catch (cause) {
      // The host's limits (its 1 MB across packages, which another package may
      // have filled): the previous snapshot stays, and the overview says so.
      entry.saved = 'not-saved';
      log(`${SOURCE_ID}: writeCache refused the snapshot: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      writingCache = false;
    }
  }

  /** The overview's snapshot blocks for a read's answer (DEC-2, DEC-4, DEC-6). */
  function snapshotBlocks(entry, report) {
    const blocks = [];
    const note = entry.note;
    const notice = (tone, key, params) => ({
      kind: 'notice',
      tone,
      text: { key, ...(params === undefined ? {} : { params }) }
    });
    // Offline, nothing is said here (Sprint 002.11's review): every source is
    // `saved` with its date, and the host says « Offline — N sources shown as read
    // on {date} » once, above the overview (SDK 1.33).
    if (note?.kind === 'unchanged') {
      blocks.push(
        notice(
          'info',
          note.partly ? 'fr-urban-rules.snapshot.unchangedPartly' : 'fr-urban-rules.snapshot.unchanged',
          { date: dayOfIso(note.since) }
        )
      );
    } else if (note?.kind === 'changed') {
      blocks.push({
        kind: 'heading',
        text: { key: 'fr-urban-rules.snapshot.changedSince', params: { date: dayOfIso(note.since) } }
      });
      const reopened = reopenedCount(report);
      for (const change of note.changes) blocks.push(changeBlock(change, reopened));
    }
    if (entry.saved === 'not-saved') {
      blocks.push(notice('warning', 'fr-urban-rules.snapshot.notSaved'));
    } else if (Array.isArray(entry.saved?.simplified) && entry.saved.simplified.length > 0) {
      blocks.push(
        notice('info', 'fr-urban-rules.snapshot.simplified', {
          steps: entry.saved.simplified
            .map((step) => translate(SNAPSHOT_STEP_KEYS[step]) ?? step)
            .join(' · ')
        })
      );
    }
    return blocks;
  }

  /**
   * DEC-3: after a completed read, the snapshot step for the plot on view and
   * the overview's snapshot blocks; the report as it is when no read of this
   * plot fetched (no Site, another CRS).
   */
  function withSnapshot(report, view, zones) {
    if (view === undefined || siteOf() === undefined) return report;
    const key = plotKey(view);
    const entry = cache.get(key);
    if (entry?.sources === undefined) return report;
    lastSnapshotRead = { key, view, zones };
    snapshotStep(key, entry, view, zones);
    return withSnapshotNotices(report, snapshotBlocks(entry, report));
  }

  /** DEC-4: a cache change outside a read (a project loaded) asks the host to read again. */
  function cacheChanged() {
    if (writingCache || readsInFlight > 0) return;
    if (ownCacheWrite !== undefined) {
      let stored;
      try {
        stored = cacheService()?.readCache();
      } catch {
        stored = undefined;
      }
      // The entry is the one this reader wrote: nothing new to read.
      if (stored !== undefined && stableJson(stored) === ownCacheWrite) return;
    }
    requestSignal();
  }

  /** On deactivation: the read in flight aborted, the memory cleared. */
  function dispose() {
    active?.abort();
    active = undefined;
    cache.clear();
    rnu.clear();
    chapterSession.abort();
    chapterSession = new AbortController();
    chapters.clear();
    listeners.clear();
    for (const record of extractions.values()) record.cancel?.();
    extractions.clear();
    cards.dispose();
    projectCards.dispose();
    for (const w of watches.values()) {
      w.wanted = false;
      w.cancel?.();
    }
    watches.clear();
  }

  // ── The zone's page (Sprint 002.6a) ───────────────────────────────────────────

  /**
   * DEC-1, DEC-2: this read's view of the zones' chapters. Under a PLU(i) only:
   * `locate()` is asked (through `getOptional`, each read — the host caches
   * the probe and probes a failure again after 60 s), then one lookup per zone,
   * joined to the session map's. `settled()` waits up to {@link
   * CHAPTER_WAIT_MS} from the start, never past the read's abort, and only for
   * the zones with no page yet (review fix S4: a held page is shown at once,
   * even while Refresh asks again); `stop()` clears the timer and says the
   * read no longer waits, so an answer landing after it signals the host.
   */
  function beginPages(regime, partition, zones, documentName, signal, reason) {
    if (regime !== 'plu' && regime !== 'plui') {
      pauseOthers(new Set()); // review S2: a plot without written rules polls nothing
      // 002.10: a plot without written rules reaches no service (002.6a, 002.9: a carte communale
      // asks nothing of the companion), so it has no watch; the next read finds its document itself.
      pauseWatches();
      return { view: { applies: false }, settled: async () => {}, stop: () => {} };
    }
    const view = {
      applies: true,
      located: false,
      location: undefined,
      zones: [],
      // Sprint 002.11 DEC-7: the zones' lookups, known before `locate()` answers,
      // so a restored reading is shown with or without the companion.
      lookups: chapterLookups(partition, zones, documentName)
    };
    const awaited = [];
    let stopped = false;
    const stopWaiting = new AbortController();
    const deadline = wait(chapterWaitMs, AbortSignal.any([stopWaiting.signal, signal]));
    const work = (async () => {
      let location;
      try {
        location = await pluginService()?.locate?.({ signal });
      } catch (cause) {
        // `locate()` never throws (096.8a); a host that does is read as no service.
        log(`${SOURCE_ID}: locate() threw: ${String(cause)}`);
      }
      if (signal.aborted) return;
      view.location = checkedLocation(location);
      view.located = true;
      if (view.location === undefined) {
        pauseOthers(new Set()); // review S2
        pauseWatches();
        return;
      }
      // 002.10 DEC-3: asked beside the zones' chapters, never awaited by this read.
      if (partition !== undefined) watchPartition(view.location, partition);
      view.zones = view.lookups.map((lookup) => ({
        zone: lookup.zone,
        query: lookup.query,
        entry: lookupChapter(view.location, lookup, reason === 'refresh'),
        // Sprint 002.6b DEC-1: the zone's extraction, asked `cachedOnly` — never a model call.
        extraction: extractionFor(view.location, lookup, reason === 'refresh')
      }));
      pauseOthers(new Set(view.zones.map((z) => z.extraction.id)));
      if (stopped) return;
      for (const { entry, extraction } of view.zones) {
        for (const waited of [entry, extraction]) {
          if (awaited.includes(waited)) continue;
          if (waited === entry && shownAnswer(entry)?.pages !== undefined) continue;
          // A zone whose extraction is already known is shown at once (as S4).
          if (waited === extraction && extraction.state !== 'unknown') continue;
          if (waited.pending === undefined) continue;
          waited.waiters += 1;
          awaited.push(waited);
        }
      }
      await Promise.all(awaited.map((entry) => entry.pending));
    })().catch((cause) => log(`${SOURCE_ID}: the zones' pages: ${String(cause)}`));
    return {
      view,
      settled: () => Promise.race([work, deadline]),
      stop: () => {
        if (stopped) return;
        stopped = true;
        stopWaiting.abort();
        // An answer that landed after this read stopped waiting, but before it
        // ended, was neither applied nor signalled: it is signalled now (S5).
        for (const entry of awaited) {
          entry.waiters -= 1;
          if (entry.waiters > 0) continue;
          if (entry.revision !== undefined) {
            if (entry.applied !== entry.revision) requestSignal();
          } else signalIfChanged(entry);
        }
      }
    };
  }

  /**
   * One zone's entry in the session map: `{ answer, good, pending, retryAt,
   * waiters, applied }`. Asked when it has no answer, on Refresh, or once a
   * passing failure is due; an entry already asking is joined. The entry is
   * kept across a new ask, so the page it holds stays shown until the new
   * answer lands (review fix S4).
   */
  function lookupChapter(location, { key, query }, refresh) {
    let entry = chapters.get(key);
    if (entry === undefined) entry = { waiters: 0 };
    chapters.delete(key);
    chapters.set(key, entry);
    while (chapters.size > CHAPTER_ENTRIES) chapters.delete(chapters.keys().next().value);
    const due =
      entry.pending === undefined &&
      (entry.answer === undefined ||
        refresh ||
        (entry.retryAt !== undefined && now().getTime() >= entry.retryAt));
    if (!due) return entry;
    const pending = fetchChapter(
      fetchImpl,
      location.baseUrl,
      query,
      chapterSession.signal,
      chapterTimeoutMs
    ).then((answer) => {
      if (entry.pending === pending) entry.pending = undefined;
      if (answer.failed === 'aborted') {
        if (chapters.get(key) === entry && entry.answer === undefined) chapters.delete(key);
        return;
      }
      if (answer.failed !== undefined) {
        log(`${SOURCE_ID}: the chapter of zone ${query.zone} is not known (${answer.failed})`);
        const retry = chapterRetryMs(answer);
        entry.retryAt = retry === undefined ? undefined : now().getTime() + retry;
      } else {
        entry.good = answer;
        entry.retryAt = undefined;
      }
      entry.answer = answer;
      signalIfChanged(entry);
    });
    entry.pending = pending;
    return entry;
  }

  /**
   * What an entry shows: its answer; but a passing failure after a page keeps
   * the page (review fix S4) — only an answer about the document replaces it.
   */
  function shownAnswer(entry) {
    const answer = entry.answer;
    if (answer === undefined || answer.pages !== undefined) return answer;
    if (entry.good !== undefined && !CHAPTER_LASTING.has(answer.failed)) return entry.good;
    return answer;
  }

  /** What a link built from an entry looks like: its page, or why there is none. */
  function linkSignature(entry) {
    const answer = shownAnswer(entry);
    if (answer === undefined) return undefined;
    return answer.pages !== undefined
      ? `page:${answer.pages[0]}:${answer.match}:${answer.title ?? ''}`
      : `detail:${chapterDetailKey(answer.failed)}`;
  }

  /**
   * Review decision Q1 (096.8b's `onDidChange`): an answer that lands after
   * every read stopped waiting for it, and changes the link a read last showed,
   * asks the host to read again (reason `source`); that read finds it in the
   * map, with no request. An answer a waiting read will apply signals nothing.
   */
  function signalIfChanged(entry) {
    if (entry.waiters > 0) return;
    const signature = linkSignature(entry);
    if (signature === undefined || signature === entry.applied) return;
    requestSignal();
  }

  /**
   * 002.6b DEC-1 (S5): ask the host to read again — never during a read (the
   * fire waits until it has returned), at most once per turn; the host
   * coalesces further (096.8b, one `source` read per 2 s).
   */
  function requestSignal() {
    if (listeners.size === 0) return;
    if (readsInFlight > 0) {
      signalPending = true;
      return;
    }
    fireSoon();
  }

  function fireSoon() {
    if (signalScheduled) return;
    signalScheduled = true;
    defer(() => {
      signalScheduled = false;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (cause) {
          log(`${SOURCE_ID}: onDidChange listener: ${String(cause)}`);
        }
      }
    });
  }

  // ── The document watch (Sprint 002.10) ─────────────────────────────────────────

  /**
   * DEC-3: partition → `{ baseUrl, answer?, askedAt?, pending?, cancel?, wanted,
   * signalledFor? }`. Session memory, never the project's: the service keeps
   * the watch; this keeps its last answer for the plot on view.
   */
  const watches = new Map();

  /**
   * Called by a read that found the service under a plot with a document
   * (DEC-3): the partition's status is asked of the service — **not awaited by
   * the read**, whose budget stays the GPU's — and again once an hour while the
   * plot is the one on view. Another plot's timer is stopped (review S2 as the
   * extractions': a plot not on view polls nothing).
   */
  function watchPartition(location, partition) {
    let w = watches.get(partition);
    if (w !== undefined && w.baseUrl !== location.baseUrl) {
      w.cancel?.();
      w = undefined;
    }
    if (w === undefined) {
      w = { baseUrl: location.baseUrl, wanted: true };
      watches.set(partition, w);
    }
    w.wanted = true;
    pauseWatches(partition);
    const due =
      w.pending === undefined &&
      (w.askedAt === undefined || watchClock() - w.askedAt >= WATCH_POLL_MS);
    if (due) askWatch(w, partition);
    else armWatch(w, partition);
  }

  /** A plot with no document, or no service: nothing is polled (all, or all but `keep`). */
  function pauseWatches(keep) {
    for (const [partition, w] of watches) {
      if (partition === keep) continue;
      w.wanted = false;
      w.cancel?.();
      w.cancel = undefined;
    }
  }

  function armWatch(w, partition) {
    if (!w.wanted || w.cancel !== undefined) return;
    w.cancel = watchSchedule(() => {
      w.cancel = undefined;
      if (w.wanted && watches.get(partition) === w) askWatch(w, partition);
    }, WATCH_POLL_MS);
  }

  function askWatch(w, partition) {
    w.askedAt = watchClock();
    w.pending = (async () => {
      let url;
      try {
        url = new URL(`v1/documents/${encodeURIComponent(partition)}`, w.baseUrl);
      } catch {
        return;
      }
      const answer = await serviceCall(url);
      if (watches.get(partition) !== w || answer.failed === 'aborted') return;
      // Without the service, or on any other answer, the last one stands and the
      // read's own GPU reads are the fallback (DEC-3): nothing is said of it here.
      if (answer.status !== 200) return;
      const checked = checkedDocumentStatus(answer.json, partition);
      if (checked === undefined) {
        log(`${SOURCE_ID}: the document watch answered something that is not its route's`);
        return;
      }
      w.answer = checked;
      noteWatchAnswer(w, partition);
    })()
      .catch((cause) => log(`${SOURCE_ID}: the document watch: ${String(cause)}`))
      .finally(() => {
        w.pending = undefined;
        armWatch(w, partition);
      });
  }

  /**
   * DEC-3: an answer naming another document than the one a plot's report was
   * read against means the GPU has moved. The report is forgotten (its last good
   * answers stay) and the host is asked to read again (`onDidChange`, reason
   * `source`): that read finds the new version and compares the stored
   * confirmations with it, as §8 says. Once per document named; an unchanged
   * answer signals nothing.
   */
  function noteWatchAnswer(w, partition) {
    const named = w.answer.current?.originalName.toUpperCase() ?? null;
    const stale = [];
    for (const entry of cache.values()) {
      const held = entry.summary?.document;
      if (entry.report === undefined || held?.partition !== partition) continue;
      const have = String(held.name ?? held.idurba ?? '').toUpperCase();
      if (have === '' || have === named) continue;
      stale.push(entry);
    }
    if (stale.length === 0) return;
    const signature = named ?? 'withdrawn';
    if (w.signalledFor === signature) return;
    w.signalledFor = signature;
    for (const entry of stale) {
      entry.report = undefined;
      entry.expiresAt = undefined;
    }
    requestSignal();
  }

  /** What `augment` is told of the watch for a plot: the document in force and when it was published. */
  function documentWatchOf(partition) {
    const current = partition === undefined ? undefined : watches.get(partition)?.answer?.current;
    return current === null || current === undefined
      ? undefined
      : { originalName: current.originalName, publicationDate: current.publicationDate };
  }

  // ── Written rules: extraction records (Sprint 002.6b) ──────────────────────────

  /**
   * One request to the companion service: `{ status, json }`, or `{ failed }`
   * (`unavailable` for an answer that is not JSON, `network`, `timeout`,
   * `aborted`). Never throws; the editor's `fetch`, same origin.
   */
  async function serviceCall(url, init = {}) {
    const timeout = AbortSignal.timeout(chapterTimeoutMs);
    const signal = AbortSignal.any([chapterSession.signal, timeout]);
    try {
      const response = await fetchImpl(url.href, {
        ...init,
        signal,
        headers: { accept: 'application/json', ...(init.headers ?? {}) },
        credentials: 'same-origin'
      });
      const type = response.headers?.get?.('content-type');
      if (typeof type !== 'string' || !/\bjson\b/i.test(type)) return { failed: 'unavailable' };
      const length = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(length) && length > SERVICE_ANSWER_MAX) return { failed: 'unavailable' };
      try {
        const text = await response.text();
        if (text.length > SERVICE_ANSWER_MAX) return { failed: 'unavailable' };
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { failed: 'unavailable' };
      }
    } catch {
      if (chapterSession.signal.aborted) return { failed: 'aborted' };
      return { failed: timeout.aborted ? 'timeout' : 'network' };
    }
  }

  /** An error answer's `{ code, retryAfterSeconds? }`. */
  const errorOf = (answer) => {
    if (answer.failed !== undefined) return { code: answer.failed };
    const body = answer.json;
    const code = typeof body?.error === 'string' ? body.error : body?.error?.code;
    const retry = body?.retryAfterSeconds ?? body?.error?.retryAfterSeconds;
    // `zone_chapter_not_found` lists the codes the service saw (002.5a DEC-6): shown as text.
    const codes = body?.codes ?? body?.error?.codes;
    const listed = Array.isArray(codes)
      ? codes.filter((c) => typeof c === 'string' && /^[^\p{Cc}]{1,40}$/u.test(c)).slice(0, 60)
      : [];
    return {
      code: writtenCodeOf(code),
      ...(listed.length > 0 ? { codes: listed } : {}),
      ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: Math.min(retry, 86_400) } : {})
    };
  };

  /** Whether a result reads this zone's document version (DEC-7): another version is never shown. */
  const readsVersion = (result, query) =>
    result.document.idurba.toUpperCase() === query.idurba.toUpperCase() &&
    result.document.nomfic === query.nomfic;

  /** A result answered for a record: kept when it reads its version, else the zone is not read. */
  function takeResult(record, json) {
    const result = checkedResult(json);
    if (result === undefined) {
      fail(record, { code: 'malformed' });
      return;
    }
    if (!readsVersion(result, record.query)) {
      record.state = 'not_started';
      record.result = undefined;
      return;
    }
    record.state = 'done';
    record.result = result;
    record.error = undefined;
    record.notBefore = undefined;
    record.jobId = undefined;
    // 002.11: a reading taken (Extract, Extract again) is this session's, no longer the snapshot's.
    record.restored = false;
    record.offer = undefined;
  }

  /**
   * Sprint 002.11 DEC-7: a `cachedOnly` answer for a restored record — the
   * same document version, with other rules or passages, another file, or a
   * later extraction by a newer prompt — kept as an offer. A passage the
   * snapshot shortened (DEC-2 step 5) is compared on what it kept.
   */
  function offerIfNewer(record, json) {
    const result = checkedResult(json);
    if (result === undefined || !readsVersion(result, record.query)) return;
    const held = record.result;
    const samePassage = (kept, fresh) =>
      kept === fresh ||
      (kept.length === SNAPSHOT_PASSAGE_MAX && kept.endsWith('…') && fresh.startsWith(kept.slice(0, -1)));
    const strip = ({ ruleKey, passage, ...rule }) => stableJson(rule);
    const sameRules =
      held.rules.length === result.rules.length &&
      held.rules.every(
        (rule, i) =>
          strip(rule) === strip(result.rules[i]) && samePassage(rule.passage, result.rules[i].passage)
      );
    const sameFile =
      held.document.sha256 === undefined ||
      result.document.sha256 === undefined ||
      held.document.sha256 === result.document.sha256;
    const later =
      result.promptVersion > held.promptVersion &&
      Date.parse(result.extractedAt ?? '') > Date.parse(held.extractedAt ?? '');
    record.offer = !sameRules || !sameFile || later ? result : undefined;
    // Sprint 002.11's review: the same file's GPU document id, which an older
    // snapshot did not keep, is a fact of the file — not another reading — and is
    // taken, so the règlement's link survives the next offline open.
    if (
      held.document.documentId === undefined &&
      result.document.documentId !== undefined &&
      held.document.sha256 !== undefined &&
      held.document.sha256 === result.document.sha256
    ) {
      record.result = { ...held, document: { ...held.document, documentId: result.document.documentId } };
    }
  }

  /** A failure: a result already held stays shown when the failure may pass (as 002.6a S4). */
  function fail(record, error) {
    record.error = error;
    record.jobId = undefined;
    record.pollStarted = undefined;
    // Review S3: the time the service said to wait, kept, rendered and honoured.
    record.notBefore =
      error.retryAfterSeconds === undefined
        ? undefined
        : now().getTime() + error.retryAfterSeconds * 1000;
    if (record.result !== undefined && WRITTEN_CODES[error.code]?.retry !== false) {
      record.state = 'done';
      return;
    }
    record.state = 'failed';
  }

  /** The zone's record for this read; `cachedOnly` asked once per session, Refresh asks again. */
  function extractionFor(location, { key, query, zone }, refresh) {
    const id = cyrb53(key);
    let record = extractions.get(id);
    if (record === undefined) {
      // `revision` counts the record's changes; `applied`, the one a read last showed.
      record = { id, key, query, zone, state: 'unknown', waiters: 0, asked: false, revision: 0 };
      extractions.set(id, record);
      while (extractions.size > CHAPTER_ENTRIES) {
        const oldest = extractions.values().next().value;
        oldest.cancel?.();
        cards.dismiss(oldest);
        extractions.delete(oldest.id);
      }
    }
    record.baseUrl = location.baseUrl;
    record.paused = false;
    if (record.jobId !== undefined && JOB_STATES.has(record.state) && record.state !== 'done') {
      if (record.cancel === undefined) poll(record);
      return record;
    }
    const due =
      !record.asked ||
      refresh ||
      (record.retryAt !== undefined && now().getTime() >= record.retryAt);
    if (record.pending === undefined && due) {
      record.asked = true;
      record.retryAt = undefined;
      const before = shownOf(record);
      const pending = askCached(record).finally(() => {
        if (record.pending === pending) record.pending = undefined;
        // Review NIT: only an answer that changes what is shown counts as a change.
        if (shownOf(record) === before) return;
        record.revision += 1;
        // A waiting read applies the answer; a late one is signalled (S5).
        if (record.waiters === 0) requestSignal();
      });
      record.pending = pending;
    }
    return record;
  }

  /** What a record shows, to tell a change from a repeat. */
  const shownOf = (record) =>
    JSON.stringify([
      record.state,
      record.progress,
      record.error?.code,
      record.notBefore,
      record.result?.extractedAt,
      record.result?.rules.length,
      record.current,
      // 002.11 DEC-7: an offer that appears is a change a read should show.
      record.offer?.extractedAt ?? (record.offer === undefined ? null : 'offer')
    ]);

  /** DEC-1: `GET extractions?…&cachedOnly=1` — reads, never starts work, never a model call. */
  async function askCached(record) {
    const url = new URL('v1/extractions', record.baseUrl);
    for (const [name, value] of Object.entries(record.query)) url.searchParams.set(name, value);
    url.searchParams.set('cachedOnly', '1');
    // 002.16: who is asked about — `current` names the model the user chose, so another's result offers "again".
    const chosen = chosenModelOf(ai());
    if (chosen !== undefined) {
      url.searchParams.set('provider', chosen.providerId);
      if (chosen.model !== undefined) url.searchParams.set('model', chosen.model);
    }
    const answer = await serviceCall(url);
    if (answer.failed === 'aborted') return;
    const current = checkedCurrent(answer.json?.current);
    if (current !== undefined) record.current = current;
    if (answer.status === 200) {
      // Sprint 002.11 DEC-7: the project's reading stands — the user confirmed
      // against it; another reading of the same version is offered, never taken.
      if (record.restored && record.result !== undefined) {
        offerIfNewer(record, answer.json?.result);
        return;
      }
      takeResult(record, answer.json?.result);
      return;
    }
    const error = errorOf(answer);
    if (error.code === 'not_cached') {
      if (record.result === undefined) record.state = 'not_started';
      return;
    }
    fail(record, error);
    // Review S3: never before the service's own Retry-After.
    record.retryAt = Math.max(
      now().getTime() + (chapterRetryMs({ failed: error.code }) ?? CHAPTER_RETRY_MS),
      record.notBefore ?? 0
    );
  }

  /** DEC-1: Extract (or Extract again, `refresh=1`): one `POST`; the job is polled. */
  async function startExtraction(record, refresh) {
    const url = new URL(`v1/extractions${refresh ? '?refresh=1' : ''}`, record.baseUrl);
    const chosen = chosenModelOf(ai());
    const answer = await serviceCall(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // 002.16: the model chosen in the AI panel, read now (a change applies to this very call);
      // omitted when there is none, and the service reads with its own default as before.
      body: JSON.stringify({ ...record.query, ...(chosen === undefined ? {} : { ai: chosen }) })
    });
    if (answer.failed === 'aborted') return { code: 'unavailable' };
    if (answer.status === 200 && answer.json?.state === 'done') {
      takeResult(record, answer.json.result);
      return record.state === 'failed' ? record.error : undefined;
    }
    if (
      answer.status === 202 &&
      typeof answer.json?.jobId === 'string' &&
      JOB_ID.test(answer.json.jobId)
    ) {
      record.jobId = answer.json.jobId;
      record.cancelledByUser = false;
      record.state =
        JOB_STATES.has(answer.json.state) &&
        answer.json.state !== 'done' &&
        answer.json.state !== 'failed'
          ? answer.json.state
          : 'queued';
      record.progress = progressOf(answer.json.progress);
      record.error = undefined;
      record.notBefore = undefined;
      record.pollStarted = now().getTime();
      record.stateSince = now().getTime();
      record.pollFailures = 0;
      record.failingSince = undefined;
      cards.sync(record, { model: chosen === undefined ? undefined : (chosen.model ?? chosen.providerId) });
      poll(record);
      return undefined;
    }
    const error = errorOf(answer);
    fail(record, error);
    return error;
  }

  const progressOf = (progress) => ({
    ...(Number.isSafeInteger(progress?.chunk) && progress.chunk >= 0
      ? { chunk: progress.chunk }
      : {}),
    ...(Number.isSafeInteger(progress?.of) && progress.of >= 0 ? { of: progress.of } : {}),
    // Sprint 002.23: what the AI panel's card tells — counts, pages and states, never a passage.
    ...(typeof progress?.step === 'string' && /^[a-z]{1,20}$/.test(progress.step) ? { step: progress.step } : {}),
    ...(Number.isSafeInteger(progress?.rules) && progress.rules >= 0 ? { rules: progress.rules } : {}),
    ...(progress?.document === 'hit' || progress?.document === 'miss' || progress?.document === 'joined'
      ? { document: progress.document }
      : {}),
    ...(pagesOf(progress?.chapter?.pages) === undefined
      ? {}
      : { chapter: { pages: [...progress.chapter.pages] } }),
    ...(Array.isArray(progress?.parts)
      ? {
          parts: progress.parts
            .slice(0, READING_PART_MAX)
            .filter((part) => Number.isSafeInteger(part?.n) && ['waiting', 'running', 'done', 'failed'].includes(part.state))
            .map((part) => ({
              n: part.n,
              state: part.state,
              ...(pagesOf(part.pages) === undefined ? {} : { pages: [...part.pages] }),
              ...(Number.isSafeInteger(part.rules) && part.rules >= 0 ? { rules: part.rules } : {}),
              ...(part.cached === true ? { cached: true } : {})
            }))
        }
      : {})
  });

  /**
   * DEC-1: the job polled every 3 s, then every 10 s after a minute; stops on
   * a terminal state. Review S1: polls that fail are counted and honour the
   * service's Retry-After; five failures running, or fifteen minutes of them,
   * fail the zone (`unavailable` / `timeout`), and so does a job that stays in
   * one state past {@link JOB_STUCK_MS}. A paused record (another plot on
   * view) is not polled.
   */
  function poll(record, delay) {
    record.cancel?.();
    record.cancel = undefined;
    if (record.paused) return;
    record.pollStarted ??= now().getTime();
    record.stateSince ??= now().getTime();
    const fast = now().getTime() - record.pollStarted < POLL_FAST_FOR_MS;
    record.cancel = schedule(
      async () => {
        try {
          await (async () => {
        record.cancel = undefined;
        const jobId = record.jobId;
        if (jobId === undefined || record.paused) return;
        const answer = await serviceCall(
          new URL(`v1/extractions/${encodeURIComponent(jobId)}`, record.baseUrl)
        );
        if (answer.failed === 'aborted' || record.jobId !== jobId) return;
        const before = shownOf(record);
        const changed = () => {
          if (shownOf(record) === before) return;
          record.revision += 1;
          requestSignal();
        };
        if (answer.status === 200) {
          record.pollFailures = 0;
          record.failingSince = undefined;
          const state = answer.json?.state;
          if (state === 'done') {
            record.progress = progressOf(answer.json.progress);
            takeResult(record, answer.json.result);
            record.pollStarted = undefined;
            record.revision += 1;
            requestSignal();
            return;
          }
          if (state === 'failed') {
            fail(record, errorOf({ json: { error: answer.json.error } }));
            changed();
            return;
          }
          if (JOB_STATES.has(state)) {
            const progress = progressOf(answer.json.progress);
            if (
              state !== record.state ||
              JSON.stringify(progress) !== JSON.stringify(record.progress)
            )
              record.stateSince = now().getTime();
            record.state = state;
            record.progress = progress;
          }
          if (now().getTime() - record.stateSince > JOB_STUCK_MS) {
            fail(record, { code: 'timeout' });
            changed();
            return;
          }
          poll(record);
          changed();
          return;
        }
        if (answer.status === 404) {
          // The job is gone (the service restarted, or it ended long ago): read the cache again.
          record.jobId = undefined;
          record.state = record.result === undefined ? 'unknown' : 'done';
          record.asked = false;
          record.pollStarted = undefined;
          changed();
          return;
        }
        // A passing failure: counted, and asked again no sooner than the service says.
        record.pollFailures = (record.pollFailures ?? 0) + 1;
        record.failingSince ??= now().getTime();
        if (
          record.pollFailures >= POLL_FAILURES_MAX ||
          now().getTime() - record.failingSince >= POLL_FAILING_MAX_MS
        ) {
          fail(record, { code: answer.failed === 'timeout' ? 'timeout' : 'unavailable' });
          changed();
          return;
        }
        const retry = errorOf(answer).retryAfterSeconds;
        poll(record, retry === undefined ? undefined : retry * 1000);
          })();
        } finally {
          cards.sync(record);
        }
      },
      Math.max(fast ? POLL_FAST_MS : POLL_SLOW_MS, delay ?? 0)
    );
  }

  /**
   * Sprint 002.23: a card's buttons. Cancel stops the job on the service (best effort — the user
   * has stopped waiting either way); retry is Extract again's cheaper sibling, a plain read, which
   * the service answers from what it already read; keep takes the card down; open is the host's.
   */
  /** Writes the section as `update` makes it from the one held, undoable; `false` when it cannot (no section, read-only, stale). */
  function writeSectionWith(update, actionId) {
    try {
      const data = packageData();
      if (data === undefined || typeof data.write !== 'function') return false;
      const before = data.read();
      const { section, readOnly } = sectionOf(before);
      if (readOnly) return false;
      const label = cut(translate(UNDO_KEYS[actionId]) ?? 'Planning rules', LABEL_MAX);
      return Boolean(data.write(update(section), label, before ?? null));
    } catch (cause) {
      log(`${SOURCE_ID}: the section could not be written: ${String(cause)}`);
      return false;
    }
  }

  async function cardAction(record, actionId) {
    if (actionId === 'keep') {
      cards.dismiss(record);
      return;
    }
    if (actionId === 'narrow') {
      projectCards.ask();
      return;
    }
    if (actionId === 'cancel') {
      const jobId = record.jobId;
      if (jobId === undefined) return;
      record.cancelledByUser = true;
      record.cancel?.();
      record.cancel = undefined;
      record.jobId = undefined;
      record.pollStarted = undefined;
      record.state = record.result === undefined ? 'not_started' : 'done';
      record.error = undefined;
      record.revision += 1;
      cards.sync(record);
      requestSignal();
      await serviceCall(new URL(`v1/extractions/${encodeURIComponent(jobId)}/cancel`, record.baseUrl), {
        method: 'POST'
      });
      return;
    }
    if (actionId === 'retry') {
      if (record.baseUrl === undefined || record.starting) return;
      if (record.jobId !== undefined && record.state !== 'done' && record.state !== 'failed') return;
      record.starting = true;
      try {
        await startExtraction(record, false);
      } finally {
        record.starting = false;
      }
      record.revision += 1;
      cards.sync(record);
      requestSignal();
    }
  }

  /** DEC-1: polling stops for a zone not on view (another plot, another version); it resumes on return. */
  function pauseOthers(ids) {
    for (const record of extractions.values()) {
      if (ids.has(record.id)) continue;
      // Review S2: `paused` holds even for a poll already on its way.
      record.paused = true;
      record.cancel?.();
      record.cancel = undefined;
    }
  }

  /**
   * Sprint 002.11 DEC-7: the zones' records holding a reading — restored from
   * the project's snapshot or read this session — whether or not the
   * companion is located.
   */
  const heldWritten = (lookups) =>
    lookups
      .map(({ zone, key, query }) => ({ zone, query, record: extractions.get(cyrb53(key)) }))
      .filter(({ record }) => record?.state === 'done' && record.result !== undefined);

  /**
   * What a read hands `augment` (DEC-2): per zone, the record as it stands.
   * Without the companion, or before it is located (002.11), the readings held.
   */
  function writtenInput(pages, reportFacts) {
    const view = pages?.view;
    if (view === undefined) {
      // 002.11 DEC-4: a snapshot shown before the zones' pages are asked.
      const held = heldWritten(
        chapterLookups(reportFacts?.partition, reportFacts?.zones ?? [], reportFacts?.documentName)
      );
      return held.length === 0 ? undefined : { available: false, zones: held };
    }
    if (!view.applies) return undefined;
    if (!view.located || view.location === undefined)
      return { available: false, zones: heldWritten(view.lookups) };
    return {
      available: true,
      zones: view.zones.map((z) => {
        z.extraction.applied = z.extraction.revision;
        return { zone: z.zone, query: z.query, record: z.extraction };
      })
    };
  }

  /** DEC-1: Extract written rules, Extract again, Try again — `done` once the POST is answered. */
  async function runWrittenAction(request) {
    const id = subjectFields(request.target?.subjectId).x;
    const record = id === undefined ? undefined : extractions.get(id);
    // Sprint 002.11 DEC-7: « Use it » — the newer reading replaces the project's,
    // written to the snapshot once; no confirmation changes.
    if (request.actionId === 'written-use-newer') {
      if (record?.offer === undefined) {
        return { status: 'refused', message: { key: 'fr-urban-rules.written.readAgain' } };
      }
      record.result = record.offer;
      record.offer = undefined;
      record.restored = false;
      record.revision += 1;
      const last = lastSnapshotRead;
      const entry = last === undefined ? undefined : cache.get(last.key);
      if (entry?.sources !== undefined) snapshotStep(last.key, entry, last.view, last.zones);
      return { status: 'done' };
    }
    if (record === undefined || record.baseUrl === undefined) {
      return { status: 'refused', message: { key: 'fr-urban-rules.written.readAgain' } };
    }
    // One Extract per zone: running, or its POST already on its way (review NIT).
    if (
      record.starting ||
      (record.jobId !== undefined && record.state !== 'done' && record.state !== 'failed')
    ) {
      return { status: 'done' };
    }
    if (record.notBefore !== undefined && now().getTime() < record.notBefore) {
      return { status: 'refused', message: { key: writtenCodeKey(record.error?.code) } };
    }
    record.starting = true;
    let error;
    try {
      error = await startExtraction(record, request.actionId === 'written-extract-again');
    } finally {
      record.starting = false;
    }
    // No signal: the host reads again with `action` after the answer (096.3b).
    record.revision += 1;
    return error === undefined
      ? { status: 'done' }
      : { status: 'refused', message: { key: writtenCodeKey(error.code) } };
  }

  /** The source's `onDidChange` (SDK 1.28): a signal only; the host decides when to read. */
  function onDidChange(listener) {
    if (typeof listener !== 'function') return { dispose: () => {} };
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  }

  /**
   * DEC-3: the regulation link at the zone's page, built on every report a read
   * answers from what the session map holds then — never stored in the cached
   * report, so a late answer applies at the next read with no request. Without
   * the service, the not-available notice; on an error or before an answer,
   * the first page, which is what the label says.
   */
  function withZonePages(report, pages) {
    const view = pages?.view;
    if (view === undefined || !view.applies || !view.located || report?.document === undefined)
      return report;
    const overview = report.overview ?? [];
    const linkAt = overview.findIndex((b) => b.kind === 'link');
    if (view.location === undefined) {
      const notice = {
        kind: 'notice',
        tone: 'info',
        text: { key: 'fr-urban-rules.notice.writtenRulesUnavailable' }
      };
      // After the link, or where the link would be: before the assumptions and flags.
      const before = overview.findIndex((b) =>
        ['assumptions', 'flags', 'sources'].includes(b.kind)
      );
      const index = linkAt !== -1 ? linkAt + 1 : before === -1 ? overview.length : before;
      return {
        ...report,
        overview: [...overview.slice(0, index), notice, ...overview.slice(index)]
      };
    }
    const href = report.document.href;
    if (href === undefined || linkAt === -1 || view.zones.length === 0) return report;
    const base = href.split('#')[0];
    const link = overview[linkAt];
    // Sprint 002.11's review: a link read earlier keeps saying when, at the zone's page too.
    const asReadOn =
      link.detail?.key === 'fr-urban-rules.link.detailAsRead' ? link.detail.params?.date : undefined;
    const answers = view.zones.map(({ zone, entry }) => {
      entry.applied = linkSignature(entry);
      return { zone, answer: shownAnswer(entry) };
    });
    const paged = answers.filter((z) => z.answer?.pages !== undefined);
    let links;
    if (paged.length === 0) {
      // No page known: the one first-page link, saying why when the service said.
      const code = answers.find((z) => z.answer?.failed !== undefined)?.answer.failed;
      links = [code === undefined ? link : { ...link, detail: { key: chapterDetailKey(code) } }];
    } else {
      links = answers.map(({ zone, answer }) => {
        if (answer?.pages === undefined) {
          return {
            kind: 'link',
            label: { key: 'fr-urban-rules.link.regulationZone', params: { zone } },
            href: base,
            detail: link.detail
          };
        }
        const page = answer.pages[0];
        return {
          kind: 'link',
          label:
            answer.match === 'prefix' && answer.title !== undefined
              ? {
                  key: 'fr-urban-rules.link.regulationZoneChapter',
                  params: { zone, chapter: answer.title, page }
                }
              : { key: 'fr-urban-rules.link.regulationZonePage', params: { zone, page } },
          href: `${base}#page=${page}`,
          detail:
            asReadOn === undefined
              ? { key: 'fr-urban-rules.link.detailPage', params: { page } }
              : { key: 'fr-urban-rules.link.detailPageAsRead', params: { page, date: asReadOn } }
        };
      });
    }
    return {
      ...report,
      // Review decision Q2: the first zone that has a page, else the first link.
      document: {
        ...report.document,
        href: (links.find((l) => l.href.includes('#page=')) ?? links[0]).href
      },
      overview: [...overview.slice(0, linkAt), ...links, ...overview.slice(linkAt + 1)]
    };
  }

  /** The regime from wave 1 (DEC-8): `unknown` is never `not_published`. */
  function resolveRegime(state, municipality, documents) {
    if (municipality.failed !== undefined) {
      // The last good answer this session, shown as read then (DEC-9).
      const good = state.good.municipality;
      if (good === undefined) {
        state.regime = { code: 'unknown', label: REGIME_LABELS.unknown };
        return;
      }
      municipality = good;
    }
    const commune = municipalityOf(municipality, state.view);
    state.municipality = commune;
    if (commune === undefined || typeof commune.isRnu !== 'boolean') {
      // Features with no usable commune, or an `is_rnu` that is not a boolean:
      // the answer drifted, and drift is never "not published".
      if (commune !== undefined)
        log(`${SOURCE_ID}: municipality answered is_rnu=${String(commune.isRnu)}`);
      else if (featureCountOf(municipality) > 0)
        log(`${SOURCE_ID}: municipality answered no usable commune`);
      state.regime = { code: 'unknown', label: REGIME_LABELS.unknown };
      return;
    }
    if (commune.count > 1) {
      state.assumptions.push({
        id: 'several-communes',
        text: {
          key: 'fr-urban-rules.assumption.severalCommunes',
          params: { count: commune.count, name: commune.name }
        }
      });
    }
    if (commune.isRnu) {
      state.regime = { code: 'rnu', label: REGIME_LABELS.rnu };
      return;
    }
    let answer = documents;
    if (answer.failed !== undefined) answer = state.good.document;
    if (answer === undefined) {
      state.regime = { code: 'unknown', label: REGIME_LABELS.unknown };
      return;
    }
    const parsed = documentsOf(answer);
    const known = parsed.filter((d) => own(DOCUMENT_TYPES, d.type) !== undefined);
    for (const d of parsed) {
      if (own(DOCUMENT_TYPES, d.type) === undefined)
        log(`${SOURCE_ID}: unknown document type "${d.type}"`);
    }
    if (featureCountOf(answer) === 0) {
      state.regime = { code: 'not_published', label: REGIME_LABELS.not_published };
      return;
    }
    if (known.length === 0) {
      // Something answered, and none of it is a document this reader knows:
      // drift, never "not published".
      log(`${SOURCE_ID}: document answered ${featureCountOf(answer)} feature(s), none usable`);
      state.regime = { code: 'unknown', label: REGIME_LABELS.unknown };
      return;
    }
    known.sort(
      (a, b) => own(DOCUMENT_TYPES, a.type).priority - own(DOCUMENT_TYPES, b.type).priority
    );
    const chosen = known[0];
    if (known.length > 1) {
      state.assumptions.push({
        id: 'several-documents',
        text: {
          key: 'fr-urban-rules.assumption.severalDocuments',
          params: { count: known.length, type: chosen.type }
        }
      });
    }
    const type = own(DOCUMENT_TYPES, chosen.type);
    state.document = chosen;
    state.regime = { code: type.regime, label: type.label };
  }

  /** The regulation link (DEC-7): the document in force, matched case-insensitively, then its file. */
  async function resolveLink(state, signal) {
    const zones = zonesOf(state);
    const idurba = zones.find((z) => z.idurba !== undefined)?.idurba ?? state.document.name;
    const nomfic = zones.find((z) => z.nomfic !== undefined)?.nomfic;
    const listed = await fetchJson(
      fetchImpl,
      gpuDocumentUrl(state.document.partition),
      signal,
      timeoutMs
    );
    if (listed.failed !== undefined) return listed;
    if (!Array.isArray(listed.json)) return { failed: 'malformed', detail: MALFORMED };
    const documents = ownDocuments(listed.json, state.document.partition);
    const inForce = documents.find(
      (d) =>
        typeof d?.originalName === 'string' &&
        d.originalName.toUpperCase() === idurba.toUpperCase() &&
        typeof d.id === 'string' &&
        d.id !== ''
    );
    if (inForce === undefined) {
      return { link: documents.length > 0 ? 'newer' : 'not-found' };
    }
    if (nomfic === undefined) return { link: 'not-found', documentId: inForce.id };
    const files = await fetchJson(fetchImpl, gpuFilesUrl(inForce.id), signal, timeoutMs);
    if (files.failed === 'http' && files.status === 404)
      return { link: 'not-found', documentId: inForce.id };
    if (files.failed !== undefined) return files;
    if (!Array.isArray(files.json)) return { failed: 'malformed', detail: MALFORMED };
    const file = files.json.find((f) => f?.name === nomfic);
    if (file === undefined) return { link: 'not-found', documentId: inForce.id };
    return { link: 'found', documentId: inForce.id, href: gpuFileHref(inForce.id, nomfic) };
  }

  /** One Géorisques read (DEC-6), parsed; a suspect answer is never shown. */
  async function readGeorisques(id, where, signal) {
    const url = georisquesUrls[id]({ ...where, code: where.commune });
    const answer = await fetchJson(fetchImpl, url, signal, timeoutMs);
    if (answer.failed !== undefined) return answer;
    const json = answer.json;
    // The rule for every Géorisques read: an empty 200 body is "nothing
    // published here" — `rga` answers so where it maps nothing (Rochefort,
    // 2026-10-20). Read as empty, never as a failure; radon still asks the
    // arrondissement after it. (API Carto and the GPU never answer so: there an
    // empty body is malformed.)
    if (json === null && id !== 'georisques-radon') return { empty: true };
    switch (id) {
      case 'georisques-risques': {
        const data = georisquesData(json);
        if (data === undefined) return { failed: 'malformed', detail: MALFORMED };
        if (typeof data.total_pages === 'number' && data.total_pages > 1)
          return { failed: 'incomplete', detail: INCOMPLETE };
        const risks = [];
        for (const commune of data.data) {
          for (const risk of Array.isArray(commune?.risques_detail) ? commune.risques_detail : []) {
            if (
              typeof risk?.num_risque === 'string' &&
              typeof risk.libelle_risque_long === 'string'
            ) {
              risks.push({ code: risk.num_risque, label: risk.libelle_risque_long });
            }
          }
        }
        return { risks };
      }
      case 'georisques-pprn': {
        if (json === null || typeof json !== 'object' || !Array.isArray(json.content)) {
          return { failed: 'malformed', detail: MALFORMED };
        }
        const total =
          typeof json.totalElements === 'number' ? json.totalElements : json.content.length;
        if (total > PPRN_SUSPECT_COUNT) {
          return {
            failed: 'suspect',
            detail: { key: 'fr-urban-rules.status.suspect', params: { count: total } }
          };
        }
        if (total > json.content.length) return { failed: 'incomplete', detail: INCOMPLETE };
        return {
          pprs: json.content
            .filter((p) => typeof p?.idGaspar === 'string')
            .map((p) => ({
              id: p.idGaspar,
              label: text(p.libPpr),
              procedure: optionalText(p.modeleProcedure)
            }))
        };
      }
      case 'georisques-sismique': {
        const data = georisquesData(json);
        if (data === undefined) return { failed: 'malformed', detail: MALFORMED };
        // The commune's entry only: another commune's zone is never this plot's.
        const zone = data.data.find((d) => d?.code_insee === where.commune);
        return zone === undefined
          ? { empty: true }
          : { zone: text(zone.code_zone), label: optionalText(zone.zone_sismicite) };
      }
      case 'georisques-rga': {
        if (typeof json !== 'object') return { failed: 'malformed', detail: MALFORMED };
        const code = text(json.codeExposition);
        return code === ''
          ? { empty: true }
          : { exposure: code, label: optionalText(json.exposition) };
      }
      case 'georisques-radon': {
        const data = json === null ? { data: [] } : georisquesData(json);
        if (data === undefined) return { failed: 'malformed', detail: MALFORMED };
        const entry = data.data[0];
        if (entry !== undefined) return { radonClass: text(entry.classe_potentiel) };
        // Probed 2026-10-20: radon answers Lyon's arrondissement (69382) and
        // nothing for the commune (69123). An empty commune answer is asked
        // again with the arrondissement, never read as "no radon class".
        if (where.arrondissement !== undefined && where.arrondissement !== where.commune) {
          const again = await fetchJson(
            fetchImpl,
            georisquesUrls[id]({ code: where.arrondissement }),
            signal,
            timeoutMs
          );
          if (again.failed !== undefined) return again;
          if (again.json === null) return { empty: true };
          const second = georisquesData(again.json);
          if (second === undefined) return { failed: 'malformed', detail: MALFORMED };
          if (second.data[0] !== undefined)
            return { radonClass: text(second.data[0].classe_potentiel) };
        }
        return { empty: true };
      }
      default:
        return { failed: 'malformed', detail: MALFORMED };
    }
  }

  /** The zones of the read, parsed from whichever layer wave 2 read. */
  function zonesOf(state) {
    const answer = usable(state, 'zone-urba') ?? usable(state, 'secteur-cc');
    if (answer === undefined) return [];
    return answer.parsed ?? [];
  }

  /** A source's answer to show: the fresh one, or the last good one if it failed (DEC-9). */
  function usable(state, id) {
    const answer = state.answers[id];
    if (answer === undefined) return undefined;
    const shown = answer.failed === undefined ? answer : state.good[id];
    if (shown === undefined) return undefined;
    // Converted once per answer: the cache key carries the CRS it was converted into.
    if (Array.isArray(shown.features) && shown.parsed === undefined) {
      shown.parsed = parseFeatures(id, shown.features, state.service);
    }
    return shown;
  }

  function parseFeatures(id, features, service) {
    if (id === 'zone-urba') return parseLayer(id, features, service, pickZone);
    if (id === 'secteur-cc') return parseLayer(id, features, service, pickSector);
    if (PRESCRIPTION_LAYERS.includes(id))
      return parseLayer(id, features, service, pickPrescription);
    if (INFORMATION_LAYERS.includes(id)) return parseLayer(id, features, service, pickInformation);
    if (EASEMENT_LAYERS.includes(id)) return parseLayer(id, features, service, pickEasement);
    return [];
  }

  const loggedCodes = new Set();
  const logOnce = (message) => {
    if (loggedCodes.has(message)) return;
    loggedCodes.add(message);
    log(message);
  };

  // ── Assembly (DEC-12, DEC-13, DEC-14) ──────────────────────────────────────────

  function assemble(state) {
    const regime = state.regime ?? { code: 'unknown', label: REGIME_LABELS.unknown };
    const assumptions = [...state.assumptions];
    const zoneLayer =
      state.answers['zone-urba'] !== undefined || state.pending.has('zone-urba')
        ? 'zone-urba'
        : 'secteur-cc';
    const zones = zonesOf(state);
    const prescriptions = PRESCRIPTION_LAYERS.flatMap((id) =>
      (usable(state, id)?.parsed ?? []).map((item) => ({ ...item, layer: id }))
    );
    const information = INFORMATION_LAYERS.flatMap((id) =>
      (usable(state, id)?.parsed ?? []).map((item) => ({ ...item, layer: id }))
    );
    const easements = EASEMENT_LAYERS.flatMap((id) =>
      (usable(state, id)?.parsed ?? []).map((item) => ({ ...item, layer: id }))
    );

    // Features: every GPU item, typed by category (DEC-11), in the Site's CRS.
    const candidates = [];
    const pushFeature = (item, category, label) => {
      const geometry = item.geometry;
      if (geometry.unconverted) {
        if (!assumptions.some((a) => a.id === 'unconverted')) {
          assumptions.push({
            id: 'unconverted',
            text: { key: 'fr-urban-rules.assumption.unconverted' }
          });
        }
      }
      if (geometry.kind === 'line' && Array.isArray(geometry.lines) && geometry.lines.length > 1) {
        geometry.lines.forEach((line, index) => {
          candidates.push({ id: `${item.id}:${index + 1}`, category, official: true, label, line });
        });
        return;
      }
      const feature = { id: item.id, category, official: true, label };
      if (geometry.kind === 'surface' && Array.isArray(geometry.rings) && geometry.rings.length > 0)
        feature.rings = geometry.rings;
      if (
        geometry.kind === 'line' &&
        Array.isArray(geometry.lines) &&
        geometry.lines.length === 1 &&
        geometry.lines[0].length >= 2
      )
        feature.line = geometry.lines[0];
      candidates.push(feature);
    };
    for (const zone of zones) pushFeature(zone, 'zone', verbatim(zone.libelle || zone.id));
    for (const item of prescriptions) {
      if (own(TYPEPSC_KEYS, item.type) === undefined)
        logOnce(`${SOURCE_ID}: prescription type "${item.type}" has no name; shown as its code`);
      pushFeature(item, 'prescription', verbatim(item.libelle || item.type));
    }
    for (const item of information)
      pushFeature(item, 'information', verbatim(item.libelle || item.type));
    for (const item of easements) {
      const known = own(SUPTYPES, item.suptype);
      if (known === undefined)
        logOnce(`${SOURCE_ID}: easement type "${item.suptype}" is shown as a plain easement`);
      pushFeature(
        item,
        known?.category ?? 'easement',
        verbatim(item.nomass ?? item.suptype.toUpperCase())
      );
    }
    const { features, notDrawn } = withinBudget(candidates, assumptions);

    const flags = [...easementFlags(easements), ...georisquesFlags(state)];
    const document = reportDocument(state, zones, regime);
    const sources = sourceStatuses(state);
    const attribution = [
      ...new Set(sources.map((s) => ATTRIBUTIONS[SOURCES[s.id].attribution]))
    ].join(' · ');

    const report = {
      regime: { code: regime.code, label: { key: regime.label } },
      ...(document === undefined ? {} : { document }),
      zones: zoneList(zones),
      features,
      edges: [],
      rules: [],
      checks: [],
      flags,
      assumptions,
      sources,
      attribution,
      overview: overview(state, regime, document, zones, assumptions),
      views: views(state, regime, zoneLayer, zones, prescriptions, information, easements, notDrawn)
    };
    // What 002.1a–002.2 read beside the report: the sectors' types, the zones'
    // versions and the prescriptions with their geometry in the Site's CRS.
    facts.set(report, {
      typesects: zones.map((z) => z.typesect).filter((t) => t !== undefined),
      zones: zones.map((z) => ({
        libelle: z.libelle,
        datvalid: z.datvalid,
        idurba: z.idurba,
        typezone: z.typezone,
        nomfic: z.nomfic
      })),
      // Sprint 002.22: the commune's name, which rules stated for other communes are told apart by.
      ...(state.municipality?.name ? { commune: state.municipality.name } : {}),
      // Sprint 002.6a: what a read from the cache needs to ask the zones' chapters.
      partition: state.document?.partition,
      documentName: state.document?.name,
      prescriptions: prescriptions.map((item) => ({
        type: item.type,
        subtype: item.subtype,
        libelle: item.libelle,
        txt: item.txt,
        datvalid: item.datvalid,
        geometry: item.geometry
      }))
    });
    return report;
  }

  /** DEC-14: simplified rings, the largest outlines sent without rings, at most 1,900 features. */
  function withinBudget(candidates, assumptions) {
    const pointsOf = (f) =>
      (f.rings ?? []).reduce((sum, ring) => sum + ring.length, 0) + (f.line?.length ?? 0);
    let stripped = false;
    const features = candidates.map((f) => {
      if (pointsOf(f) > FEATURE_POINT_LIMIT) {
        stripped = true;
        const { rings, line, ...rest } = f;
        return rest;
      }
      return f;
    });
    let total = features.reduce((sum, f) => sum + pointsOf(f), 0);
    if (total > REPORT_POINT_BUDGET) {
      const order = features
        .map((f, i) => i)
        .sort((a, b) => pointsOf(features[b]) - pointsOf(features[a]));
      for (const i of order) {
        if (total <= REPORT_POINT_BUDGET) break;
        total -= pointsOf(features[i]);
        const { rings, line, ...rest } = features[i];
        features[i] = rest;
        stripped = true;
      }
    }
    if (stripped)
      assumptions.push({
        id: 'outline-too-detailed',
        text: { key: 'fr-urban-rules.assumption.outlineTooDetailed' }
      });
    const notDrawn = new Set(features.slice(FEATURE_LIMIT).map((f) => f.id.split(':')[0]));
    return { features: features.slice(0, FEATURE_LIMIT), notDrawn };
  }

  function zoneList(zones) {
    const seen = new Map();
    for (const zone of zones) {
      if (zone.libelle === '' || seen.has(zone.libelle)) continue;
      seen.set(zone.libelle, {
        id: `zone:${cut(zone.libelle, 64)}`,
        label: verbatim(zone.libelle),
        ...(zone.libelong === undefined ? {} : { description: verbatim(zone.libelong, LONG) })
      });
    }
    return [...seen.values()];
  }

  /** The report's document (DEC-13); absent under `rnu`, `not_published` and `unknown`. */
  function reportDocument(state, zones, regime) {
    const doc = state.document;
    if (doc === undefined || !['plu', 'plui', 'cc'].includes(regime.code)) return undefined;
    const version = zones.find((z) => z.idurba !== undefined)?.idurba ?? doc.name;
    const validFrom =
      zones.find((z) => z.datappro !== undefined) !== undefined
        ? isoDate(zones.find((z) => z.datappro !== undefined).datappro)
        : idurbaDate(version);
    const link = regulationLink(state, version);
    // The grid's own title ("PLUI GRAND LYON LA METROPOLE"), prefixed by the type when it lacks it.
    const typeName = doc.type === 'PLUI' ? 'PLUi' : doc.type;
    const named = doc.title ?? state.municipality?.name ?? '';
    const title = named.toUpperCase().startsWith(doc.type) ? named : `${typeName} ${named}`.trim();
    return {
      id: doc.partition,
      version,
      ...(validFrom === undefined ? {} : { validFrom }),
      title: verbatim(title),
      ...(doc.status === 'production'
        ? { status: { key: 'fr-urban-rules.document.status.production' } }
        : {}),
      ...(link === undefined ? {} : { href: link.href })
    };
  }

  /**
   * The règlement's link (DEC-7), and when it was read if not just now
   * (Sprint 002.11's review). A file's URL is fixed for a document version, so
   * a link read earlier still opens it: the GPU's fresh answer first; else its
   * last good one — this session's or the snapshot's — dated; else, when the
   * file list never answered, a written reading held for this very version,
   * which names the document's id and file, dated by its extraction.
   * `undefined` when the GPU answered that it has no such file, or nothing
   * names one.
   */
  function regulationLink(state, version) {
    const answer = state.answers['gpu-files'];
    const shown = usable(state, 'gpu-files');
    if (shown?.link === 'found') {
      return answer?.failed === undefined
        ? { href: shown.href }
        : { href: shown.href, asReadOn: shown.retrievedAt };
    }
    if (answer === undefined || answer.failed === undefined || shown !== undefined) return undefined;
    for (const record of extractions.values()) {
      const held = record.state === 'done' ? record.result : undefined;
      const doc = held?.document;
      if (typeof doc?.documentId !== 'string' || typeof doc.nomfic !== 'string') continue;
      if (doc.idurba.toUpperCase() !== String(version ?? '').toUpperCase()) continue;
      const date = held.extractedAt ?? record.readAt;
      return {
        href: gpuFileHref(doc.documentId, doc.nomfic),
        ...(date === undefined ? {} : { asReadOn: date })
      };
    }
    return undefined;
  }

  function easementFlags(easements) {
    const groups = new Map();
    for (const item of easements) {
      const flag = own(SUPTYPES, item.suptype)?.flag;
      if (flag === undefined) continue;
      // One perimeter served as an area, a line and a point counts once.
      if (!groups.has(flag)) groups.set(flag, { names: new Set(), codes: new Set() });
      groups.get(flag).names.add(item.nomass ?? item.suptype.toUpperCase());
      groups.get(flag).codes.add(item.suptype.toUpperCase());
    }
    return [...groups.entries()].map(([kind, { names, codes }]) => {
      const sorted = [...codes].sort();
      // 002.14: the heritage title names the category when the set is one the SUP names.
      const titleKey =
        kind === 'abf' && sorted.length === 1 && sorted[0] === 'AC1'
          ? FLAG_TITLE_KEYS.abfAc1
          : kind === 'abf' && sorted.length === 1 && sorted[0] === 'AC4'
            ? FLAG_TITLE_KEYS.abfAc4
            : FLAG_TITLE_KEYS[kind];
      return {
        id: `sup-${kind}`,
        kind,
        label: { key: FLAG_KEYS[kind], params: { count: names.size } },
        detail: verbatim([...names].join(' · '), LONG),
        ...FLAG_PRESENTATION[kind],
        title: { key: titleKey },
        code: cut(sorted.join(' · '), 80)
      };
    });
  }

  function georisquesFlags(state) {
    const flags = [];
    const sismique = usable(state, 'georisques-sismique');
    if (sismique?.zone !== undefined && sismique.zone !== '') {
      const level = flagLevel('seismic', sismique.zone, 'zone');
      flags.push({
        id: 'seismic',
        kind: 'seismic',
        label: { key: 'fr-urban-rules.flag.seismic', params: { zone: sismique.zone } },
        icon: 'seismic',
        group: 'hazard',
        title: { key: 'fr-urban-rules.flag.title.seismic' },
        ...(level === undefined ? {} : { level })
      });
    }
    const radon = usable(state, 'georisques-radon');
    if (radon?.radonClass !== undefined && radon.radonClass !== '') {
      const level = flagLevel('radon', radon.radonClass, 'class');
      flags.push({
        id: 'radon',
        kind: 'radon',
        label: { key: 'fr-urban-rules.flag.radon', params: { class: radon.radonClass } },
        icon: 'radon',
        group: 'hazard',
        title: { key: 'fr-urban-rules.flag.title.radon' },
        ...(level === undefined ? {} : { level })
      });
    }
    const rga = usable(state, 'georisques-rga');
    if (
      rga?.exposure !== undefined &&
      own(RGA_KEYS, rga.exposure) !== undefined &&
      rga.exposure !== '0'
    ) {
      const level = flagLevel('clay', rga.exposure, 'exposure');
      flags.push({
        id: 'clay',
        kind: 'clay',
        label: { key: 'fr-urban-rules.flag.clay', params: { exposure: rga.exposure } },
        detail: { key: own(RGA_KEYS, rga.exposure) },
        icon: 'clay',
        group: 'hazard',
        title: { key: 'fr-urban-rules.flag.title.clay' },
        ...(level === undefined ? {} : { level })
      });
    }
    for (const ppr of usable(state, 'georisques-pprn')?.pprs ?? []) {
      flags.push({
        id: `ppr-${ppr.id}`,
        kind: 'ppr',
        label: { key: 'fr-urban-rules.flag.ppr', params: { name: cut(ppr.label, 500) } },
        icon: 'hazard',
        group: 'hazard',
        title: verbatim(ppr.label)
      });
    }
    for (const risk of usable(state, 'georisques-risques')?.risks ?? []) {
      flags.push({
        id: `risk-${risk.code}`,
        kind: 'risk',
        label: { key: 'fr-urban-rules.flag.risk', params: { name: cut(risk.label, 500) } },
        detail: { key: 'fr-urban-rules.flag.riskDetail' },
        icon: 'hazard',
        group: 'listed',
        title: verbatim(risk.label)
      });
    }
    return flags;
  }

  /**
   * `sources[]` (DEC-9): `ready`, `unavailable` or `loading`; a skipped read is not listed.
   * Sprint 002.11's review: a source that did not answer while an earlier reading of it is
   * shown — this session's, or the project's snapshot — is `saved` (SDK 1.33), dated by that
   * reading: the host says « shown as read on {date} » once, and never counts it as current
   * or as merely « did not answer ».
   */
  function sourceStatuses(state) {
    const statuses = [];
    for (const id of Object.keys(SOURCES)) {
      const answer = state.answers[id];
      const name = { key: SOURCES[id].key };
      if (answer === undefined) {
        if (state.pending.has(id)) statuses.push({ id, name, state: 'loading' });
        continue;
      }
      // Sprint 002.11 DEC-4: a snapshot shown while the source is asked again.
      if (answer.restored && state.pending.has(id)) {
        statuses.push({ id, name, state: 'loading', retrievedAt: answer.retrievedAt });
        continue;
      }
      if (answer.failed === undefined) {
        const empty = isEmpty(answer);
        statuses.push({
          id,
          name,
          state: 'ready',
          retrievedAt: answer.retrievedAt,
          ...(empty ? { detail: { key: 'fr-urban-rules.status.empty' } } : {})
        });
        continue;
      }
      const good = state.good[id];
      statuses.push({
        id,
        name,
        state: good === undefined ? 'unavailable' : 'saved',
        ...(good === undefined
          ? { detail: answer.detail }
          : {
              retrievedAt: good.retrievedAt,
              // Sprint 002.11 DEC-4: a reading of another day says its date.
              detail:
                localDay(new Date(good.retrievedAt)) === localDay(now())
                  ? {
                      key: 'fr-urban-rules.status.shownAsRead',
                      params: { time: clock(good.retrievedAt) }
                    }
                  : {
                      key: 'fr-urban-rules.status.shownAsReadOn',
                      params: { date: localDay(new Date(good.retrievedAt)) }
                    }
            })
      });
    }
    return statuses;
  }

  const isEmpty = (answer) =>
    (Array.isArray(answer.features) && answer.features.length === 0) ||
    // Sprint 002.11: a restored answer holds its parsed form only.
    (answer.features === undefined && answer.count === 0) ||
    (answer.features === undefined && Array.isArray(answer.parsed) && answer.parsed.length === 0) ||
    answer.empty === true ||
    (Array.isArray(answer.risks) && answer.risks.length === 0) ||
    (Array.isArray(answer.pprs) && answer.pprs.length === 0);

  const clock = (iso) => {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // ── Overview and views (DEC-12) ───────────────────────────────────────────────

  function overview(state, regime, document, zones, assumptions) {
    const blocks = [];
    if (regime.code === 'not_published') {
      blocks.push({
        kind: 'notice',
        tone: 'warning',
        text: { key: 'fr-urban-rules.notice.notPublished' }
      });
    } else if (regime.code === 'unknown') {
      blocks.push({
        kind: 'notice',
        tone: 'error',
        text: { key: 'fr-urban-rules.notice.unknown' }
      });
    }
    const rows = [{ label: { key: 'fr-urban-rules.field.regime' }, value: { key: regime.label } }];
    if (state.municipality?.name) {
      rows.push({
        label: { key: 'fr-urban-rules.field.commune' },
        value: verbatim(
          (state.municipality.names?.length > 0
            ? state.municipality.names
            : [state.municipality.name]
          ).join(', ')
        )
      });
    }
    if (document !== undefined) {
      rows.push({ label: { key: 'fr-urban-rules.field.document' }, value: document.title });
      rows.push({
        label: { key: 'fr-urban-rules.field.version' },
        value: { text: document.version }
      });
      if (document.validFrom !== undefined) {
        rows.push({
          label: { key: 'fr-urban-rules.field.approved' },
          value: { text: document.validFrom }
        });
      }
    }
    const zoneNames = [...new Set(zones.map((z) => z.libelle).filter((l) => l !== ''))];
    if (zoneNames.length > 0) {
      rows.push({
        label: {
          key: regime.code === 'cc' ? 'fr-urban-rules.field.sector' : 'fr-urban-rules.field.zone'
        },
        value: verbatim(zoneNames.join(', '))
      });
    }
    blocks.push({ kind: 'fields', rows });
    if (document !== undefined) {
      const link = state.answers['gpu-files'];
      const shown = usable(state, 'gpu-files');
      const resolved = regulationLink(state, document.version);
      if (state.pending.has('gpu-files') && !link?.restored) {
        // Still resolving: nothing said yet (a snapshot's link is shown meanwhile, 002.11).
      } else if (resolved !== undefined) {
        blocks.push({
          kind: 'link',
          label: {
            key:
              regime.code === 'cc'
                ? 'fr-urban-rules.link.document'
                : 'fr-urban-rules.link.regulation'
          },
          href: resolved.href,
          // Sprint 002.11's review: a link read earlier says when, rather than
          // « could not be resolved » while the file it names is known.
          detail:
            resolved.asReadOn === undefined
              ? { key: 'fr-urban-rules.link.detail' }
              : { key: 'fr-urban-rules.link.detailAsRead', params: { date: dayOfIso(resolved.asReadOn) } }
        });
      } else if (link?.failed !== undefined) {
        blocks.push({
          kind: 'notice',
          tone: 'warning',
          text: { key: 'fr-urban-rules.notice.linkUnavailable' }
        });
      } else if (shown?.link === 'newer') {
        blocks.push({
          kind: 'notice',
          tone: 'warning',
          text: { key: 'fr-urban-rules.notice.newerDocument' }
        });
      } else if (shown?.link === 'not-found') {
        blocks.push({
          kind: 'notice',
          tone: 'warning',
          text: { key: 'fr-urban-rules.notice.fileNotFound' }
        });
      }
    }
    if (assumptions.length > 0) blocks.push({ kind: 'assumptions' });
    blocks.push({ kind: 'flags' });
    blocks.push({ kind: 'sources' });
    return blocks;
  }

  /** A view's notice when its source failed with nothing to show, or answered nothing. */
  function stateNotice(state, ids, noneKey) {
    if (ids.some((id) => state.pending.has(id))) {
      return { kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.notice.loading' } };
    }
    const failed = ids.filter(
      (id) => state.answers[id]?.failed !== undefined && state.good[id] === undefined
    );
    if (failed.length > 0) {
      return { kind: 'notice', tone: 'error', text: { key: 'fr-urban-rules.notice.sourceFailed' } };
    }
    return { kind: 'notice', tone: 'info', text: { key: noneKey } };
  }

  function views(state, regime, zoneLayer, zones, prescriptions, information, easements, notDrawn) {
    const list = [];
    const local = regime.code === 'plu' || regime.code === 'plui';
    if (local || regime.code === 'cc') {
      const sector = regime.code === 'cc';
      const blocks = [];
      // One block per zone label: a zone cut into several polygons is one zone.
      const shown = new Set();
      for (const zone of zones) {
        if (shown.has(zone.libelle)) continue;
        shown.add(zone.libelle);
        const rows = [
          {
            label: { key: sector ? 'fr-urban-rules.field.sector' : 'fr-urban-rules.field.zone' },
            value: verbatim(zone.libelle || '—'),
            ...(zone.libelong === undefined ? {} : { detail: verbatim(zone.libelong, LONG) })
          }
        ];
        if (sector) {
          const key = own(TYPESECT_KEYS, zone.typesect);
          if (key === undefined && zone.typesect !== '')
            logOnce(`${SOURCE_ID}: sector type "${zone.typesect}" has no name`);
          rows.push({
            label: { key: 'fr-urban-rules.field.typesect' },
            value:
              key === undefined
                ? { key: 'fr-urban-rules.typesect.other', params: { code: zone.typesect } }
                : { key }
          });
        } else {
          const key = own(TYPEZONE_KEYS, zone.typezone.toUpperCase());
          if (key === undefined && zone.typezone !== '')
            logOnce(`${SOURCE_ID}: zone type "${zone.typezone}" has no name`);
          rows.push({
            label: { key: 'fr-urban-rules.field.typezone' },
            value:
              key === undefined
                ? { key: 'fr-urban-rules.typezone.other', params: { code: zone.typezone } }
                : { key, params: { code: zone.typezone } }
          });
        }
        const valid = isoDate(zone.datvalid);
        if (valid !== undefined)
          rows.push({
            label: { key: 'fr-urban-rules.field.zoneValidFrom' },
            value: { text: valid }
          });
        if (zone.idurba !== undefined)
          rows.push({
            label: { key: 'fr-urban-rules.field.version' },
            value: { text: zone.idurba }
          });
        blocks.push({ kind: 'fields', rows });
      }
      if (blocks.length === 0)
        blocks.push(stateNotice(state, [zoneLayer], 'fr-urban-rules.notice.noZone'));
      list.push({
        id: sector ? 'sector' : 'zone',
        label: { key: sector ? 'fr-urban-rules.view.sector' : 'fr-urban-rules.view.zone' },
        blocks
      });
    }
    if (local) {
      list.push({
        id: 'prescriptions',
        label: { key: 'fr-urban-rules.view.prescriptions' },
        badge: {
          value: { key: 'fr-urban-rules.badge.count', params: { count: prescriptions.length } }
        },
        summary: {
          value: { key: 'fr-urban-rules.badge.count', params: { count: prescriptions.length } }
        },
        blocks: itemTable(
          state,
          PRESCRIPTION_LAYERS,
          prescriptions,
          'fr-urban-rules.notice.noPrescription',
          (item) => [
            own(TYPEPSC_KEYS, item.type) === undefined
              ? { key: 'fr-urban-rules.typepsc.other', params: { code: item.type } }
              : { key: own(TYPEPSC_KEYS, item.type) },
            verbatim(item.libelle || '—'),
            verbatim(item.txt ?? '—'),
            { key: GEOMETRY_KEYS[item.geometry.kind] }
          ],
          [
            'fr-urban-rules.column.type',
            'fr-urban-rules.column.label',
            'fr-urban-rules.column.value',
            'fr-urban-rules.column.geometry'
          ],
          notDrawn
        )
      });
      list.push({
        id: 'information',
        label: { key: 'fr-urban-rules.view.information' },
        summary: {
          value: { key: 'fr-urban-rules.badge.count', params: { count: information.length } }
        },
        blocks: itemTable(
          state,
          INFORMATION_LAYERS,
          information,
          'fr-urban-rules.notice.noInformation',
          (item) => [
            { key: 'fr-urban-rules.typeinf.code', params: { code: item.type } },
            verbatim(item.libelle || '—'),
            verbatim(item.txt ?? '—'),
            { key: GEOMETRY_KEYS[item.geometry.kind] }
          ],
          [
            'fr-urban-rules.column.type',
            'fr-urban-rules.column.label',
            'fr-urban-rules.column.value',
            'fr-urban-rules.column.geometry'
          ],
          notDrawn
        )
      });
    }
    list.push({
      id: 'easements',
      label: { key: 'fr-urban-rules.view.easements' },
      badge: { value: { key: 'fr-urban-rules.badge.count', params: { count: easements.length } } },
      summary: { value: { key: 'fr-urban-rules.badge.count', params: { count: easements.length } } },
      blocks: itemTable(
        state,
        EASEMENT_LAYERS,
        easements,
        'fr-urban-rules.notice.noEasement',
        (item) => [
          { text: item.suptype.toUpperCase() },
          verbatim(item.nomass ?? '—'),
          verbatim(item.typeass ?? '—'),
          { key: GEOMETRY_KEYS[item.geometry.kind] }
        ],
        [
          'fr-urban-rules.column.suptype',
          'fr-urban-rules.column.name',
          'fr-urban-rules.column.typeass',
          'fr-urban-rules.column.geometry'
        ],
        notDrawn
      )
    });
    const riskSummary = riskSummaryOf(state);
    list.push({
      id: 'risks',
      label: { key: 'fr-urban-rules.view.risks' },
      ...(riskSummary === undefined ? {} : { summary: riskSummary }),
      blocks: riskBlocks(state)
    });
    return list;
  }

  /**
   * Sprint 002.12 (DEC-3): the risk a designer acts on first, said in the Risks section's
   * summary — the clay's shrink-swell exposure, else the seismic zone, else the radon class,
   * in that order; none when no risk is read. Notable ones are amber.
   */
  function riskSummaryOf(state) {
    const rga = usable(state, 'georisques-rga');
    if (rga?.exposure !== undefined && Number(rga.exposure) >= 1 && Number(rga.exposure) <= 3) {
      return {
        value: { key: CLAY_SUMMARY_KEYS[Number(rga.exposure)] },
        ...(Number(rga.exposure) >= 2 ? { tone: 'warning' } : {})
      };
    }
    const seismic = usable(state, 'georisques-sismique');
    if (seismic?.zone) {
      return {
        value: { key: 'fr-urban-rules.summary.seismic', params: { zone: String(seismic.zone) } },
        ...(Number(seismic.zone) >= 3 ? { tone: 'warning' } : {})
      };
    }
    const radon = usable(state, 'georisques-radon');
    if (radon?.radonClass) {
      return {
        value: { key: 'fr-urban-rules.summary.radon', params: { class: String(radon.radonClass) } },
        ...(String(radon.radonClass) === '3' ? { tone: 'warning' } : {})
      };
    }
    return undefined;
  }

  function itemTable(state, ids, items, noneKey, row, columns, notDrawn) {
    if (items.length === 0) return [stateNotice(state, ids, noneKey)];
    const blocks = [
      {
        kind: 'table',
        columns: columns.map((key) => ({ key })),
        rows: items.slice(0, TABLE_ROWS).map(row)
      }
    ];
    if (items.length > TABLE_ROWS) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: {
          key: 'fr-urban-rules.notice.notListed',
          params: { count: items.length - TABLE_ROWS }
        }
      });
    }
    const undrawn = items.filter((item) => notDrawn.has(item.id)).length;
    if (undrawn > 0) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: { key: 'fr-urban-rules.notice.notDrawn', params: { count: undrawn } }
      });
    }
    if (ids.some((id) => state.pending.has(id)))
      blocks.push({ kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.notice.loading' } });
    return blocks;
  }

  function riskBlocks(state) {
    const rows = [];
    const unavailable = (id) =>
      state.answers[id]?.failed !== undefined && state.good[id] === undefined;
    const row = (labelKey, id, value) => {
      if (state.answers[id] === undefined && !state.pending.has(id)) return;
      if (state.pending.has(id))
        rows.push({ label: { key: labelKey }, value: { key: 'fr-urban-rules.value.loading' } });
      else if (unavailable(id))
        rows.push({
          label: { key: labelKey },
          value: { key: 'fr-urban-rules.value.unavailable' },
          tone: 'warning'
        });
      else
        rows.push({
          label: { key: labelKey },
          value: value ?? { key: 'fr-urban-rules.value.none' }
        });
    };
    const sismique = usable(state, 'georisques-sismique');
    row(
      'fr-urban-rules.risk.seismic',
      'georisques-sismique',
      sismique?.zone
        ? { key: 'fr-urban-rules.value.seismic', params: { zone: sismique.zone } }
        : undefined
    );
    const radon = usable(state, 'georisques-radon');
    row(
      'fr-urban-rules.risk.radon',
      'georisques-radon',
      radon?.radonClass
        ? { key: 'fr-urban-rules.value.radon', params: { class: radon.radonClass } }
        : undefined
    );
    const rga = usable(state, 'georisques-rga');
    row(
      'fr-urban-rules.risk.clay',
      'georisques-rga',
      rga?.exposure !== undefined && own(RGA_KEYS, rga.exposure) !== undefined
        ? { key: own(RGA_KEYS, rga.exposure) }
        : undefined
    );
    const pprs = usable(state, 'georisques-pprn')?.pprs ?? [];
    row(
      'fr-urban-rules.risk.ppr',
      'georisques-pprn',
      pprs.length > 0 ? verbatim(pprs.map((p) => p.label).join(' · ')) : undefined
    );
    const risks = usable(state, 'georisques-risques')?.risks ?? [];
    row(
      'fr-urban-rules.risk.listed',
      'georisques-risques',
      risks.length > 0 ? verbatim(risks.map((r) => r.label).join(' · ')) : undefined
    );
    const blocks =
      rows.length > 0
        ? [{ kind: 'fields', rows }]
        : [{ kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.notice.noRiskSource' } }];
    blocks.push({
      kind: 'notice',
      tone: 'info',
      text: { key: 'fr-urban-rules.notice.risksAreInformation' }
    });
    return blocks;
  }

  function noSiteReport() {
    return {
      regime: { code: 'unknown', label: { key: REGIME_LABELS.unknown } },
      zones: [],
      features: [],
      edges: [],
      rules: [],
      checks: [],
      flags: [],
      assumptions: [],
      sources: [],
      attribution: '',
      overview: [
        { kind: 'notice', tone: 'error', text: { key: 'fr-urban-rules.notice.noSite' } },
        {
          kind: 'fields',
          rows: [
            { label: { key: 'fr-urban-rules.field.regime' }, value: { key: REGIME_LABELS.unknown } }
          ]
        }
      ],
      views: []
    };
  }

  /**
   * 002.3 DEC-7: the programme enricher's figures for a Site — from the report
   * read this session for its plot, never a fetch; `undefined` when none was.
   */
  function programme(view) {
    const entry = cache.get(plotKey(view));
    if (entry?.report === undefined) return undefined;
    return rnu.programmeFacts(entry.report, facts.get(entry.report), view);
  }

  return {
    read,
    cache,
    dispose,
    programme,
    onDidChange,
    // Sprint 002.8: the parked variations' checks (096.11) and the questions (096.12).
    checkVariation: (request, context) => rnu.checkVariation(request, context),
    questions: rnu.questions,
    /** The headroom readers (tests: DEC-2's one computation). */
    heightHeadroom: rnu.heightHeadroom,
    storeyLimit: rnu.storeyLimit,
    measuredBuildings: rnu.measuredBuildings,
    lastReadFor: rnu.lastReadFor,
    /** Extraction records held (tests). */
    extractionCount: () => extractions.size,
    // Sprint 002.11 DEC-4: the cache's change event, outside a read.
    cacheChanged,
    /** Lookups held in the session map (tests: the LRU bound). */
    chapterCount: () => chapters.size,
    // 002.6b: the extraction actions are the reader's; every other is a section write.
    runAction: (request, context) =>
      WRITTEN_ACTIONS.has(request?.actionId)
        ? runWrittenAction(request)
        : rnu.runAction(request, context)
  };
}

// ── The panel's shape (Sprint 002.12, DEC-1 to DEC-4; platform 096.19–096.21) ───────────────

/** The boards' order: the site and its rules, then the project against them. */
const VIEW_ORDER = [
  'document',
  'zone',
  'sector',
  'prescriptions',
  'information',
  'easements',
  'risks',
  'checks',
  'rules',
  'edges',
  'envelope',
  'surfaces'
];
/** A view's SDK icon and group (1.34): words of the host's closed vocabularies. */
const VIEW_SHAPE = {
  document: ['document', 'site'],
  zone: ['zone', 'site'],
  sector: ['zone', 'site'],
  prescriptions: ['prescription', 'site'],
  information: ['information', 'site'],
  easements: ['easement', 'site'],
  risks: ['risk', 'site'],
  checks: ['checks', 'project'],
  rules: ['rules', 'project'],
  edges: ['boundary', 'project'],
  envelope: ['envelope', 'project'],
  surfaces: ['area', 'project']
};
/** The overview's notices that belong with the document's link: they move to the Document view. */
const LINK_NOTICE_KEYS = new Set([
  'fr-urban-rules.notice.linkUnavailable',
  'fr-urban-rules.notice.newerDocument',
  'fr-urban-rules.notice.fileNotFound',
  'fr-urban-rules.notice.writtenRulesUnavailable'
]);

/** A calendar day (`YYYY-MM-DD`) as a local-midnight timestamp, so no zone shifts the day. */
function dayNumber(iso) {
  const match = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (match === null) return undefined;
  const time = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  return Number.isFinite(time) ? time : undefined;
}

/**
 * A commune's name as a card writes it: the services answer « LYON » and « ROCHEFORT-EN-TERRE »;
 * a name in capitals is cased word by word (« Lyon », « Rochefort-en-Terre »), the small words
 * of a French name staying lower-case, an elision cased on both sides (« L'Isle »). A name
 * that already has lower-case letters is the source's, left as it is.
 */
function communeCase(name) {
  if (name !== name.toUpperCase() || name === name.toLowerCase()) return name;
  const small = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'en', 'sur', 'sous', 'aux', 'au', 'et', 'lès', 'lez']);
  const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);
  return name
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part, index) => {
      if (/^(\s+|-)$/.test(part) || part === '') return part;
      if (index > 0 && small.has(part)) return part;
      // « l'isle » → « L'Isle »: each side of an elision is a word.
      return part
        .split("'")
        .map(cap)
        .join("'");
    })
    .join('');
}

/**
 * The report as the redesigned panel reads it. **Presentation only**: no rule, check, feature,
 * edge or source changes. The overview keeps its notices (the host draws them under its status
 * line); its fields and the link with its own notices become a **Document** view; its `flags`
 * go into the Risks view after its first block; its `assumptions` (shown on the checks that
 * name them) and `sources` (the host's own section) leave it. The views come in the boards'
 * order with an icon, a group and, where the host does not derive one, a summary; the commune
 * is the report's `locality`; each assumption's title has a detail by the key's own `.detail`.
 * Idempotent: a report that has a Document view is returned as it is.
 */
function panelShaped(report) {
  if (!Array.isArray(report?.overview) || !Array.isArray(report.views)) return report;
  if (report.views.some((view) => view.id === 'document')) return report;
  const kept = [];
  const documentBlocks = [];
  let flags = false;
  for (const block of report.overview) {
    if (block.kind === 'notice') {
      (LINK_NOTICE_KEYS.has(block.text?.key) ? documentBlocks : kept).push(block);
    } else if (block.kind === 'fields' || block.kind === 'link') {
      documentBlocks.push(block);
    } else if (block.kind === 'flags') {
      flags = report.flags.length > 0;
    } else if (block.kind !== 'assumptions' && block.kind !== 'sources') {
      kept.push(block);
    }
  }
  const communeRow = report.overview
    .filter((block) => block.kind === 'fields')
    .flatMap((block) => block.rows)
    .find((row) => row.label?.key === 'fr-urban-rules.field.commune');
  const zoneLabels = [
    ...new Set(
      (report.zones ?? []).map((zone) => zone.label?.text).filter((t) => typeof t === 'string' && t !== '')
    )
  ];
  const withFlags = (view) => {
    if (!flags || view.id !== 'risks') return view;
    const [first, ...rest] = view.blocks;
    if (first === undefined) return { ...view, blocks: [{ kind: 'flags' }] };
    // Sprint 002.14 (round 2): the flags say each reading (a tile, a row), so the rows that listed
    // the same readings in one line each are folded beneath them as « Relevés des services » —
    // nothing is dropped: a service still loading or down is said in the fold's summary, and the
    // fold is open then.
    if (first.kind !== 'fields') return { ...view, blocks: [first, { kind: 'flags' }, ...rest] };
    const waiting = first.rows.some(
      (row) =>
        row.value?.key === 'fr-urban-rules.value.loading' ||
        row.value?.key === 'fr-urban-rules.value.unavailable'
    );
    const readings = {
      kind: 'section',
      id: 'risk-readings',
      title: { key: 'fr-urban-rules.risk.readings' },
      icon: 'information',
      ...(waiting
        ? { summary: { value: { key: 'fr-urban-rules.risk.readingsWaiting' }, tone: 'warning' }, open: true }
        : {}),
      blocks: [first]
    };
    return { ...view, blocks: [{ kind: 'flags' }, readings, ...rest] };
  };
  const summaryOf = (view) => {
    if (view.summary !== undefined) return view.summary;
    switch (view.id) {
      case 'zone':
      case 'sector':
        return zoneLabels.length > 0 ? { value: verbatim(zoneLabels.join(', ')) } : undefined;
      case 'edges':
        return report.edges.length > 0
          ? { value: { key: 'fr-urban-rules.summary.edges', params: { count: report.edges.length } } }
          : undefined;
      case 'envelope': {
        const heights = (report.features ?? [])
          .filter((feature) => feature.category === 'envelope')
          .flatMap((feature) => feature.volume?.ceilings ?? [])
          .filter((ceiling) => ceiling.kind === 'height' && Number.isFinite(ceiling.metres))
          .map((ceiling) => ceiling.metres);
        // A quantity, which the host writes in the project's unit; the volume's "3D" is the
        // host's Display summary (the SDK's summary is a phrase or a quantity, not both).
        return heights.length > 0 ? { value: { value: Math.min(...heights), unit: 'm' } } : undefined;
      }
      case 'surfaces': {
        const share = view.blocks
          .filter((block) => block.kind === 'fields')
          .flatMap((block) => block.rows)
          .find((row) => row.label?.key === 'fr-urban-rules.surfaces.emprise.share');
        return Number.isFinite(share?.value?.value)
          ? {
              value: {
                key: 'fr-urban-rules.summary.footprint',
                params: { percent: String(Math.round(share.value.value)) }
              }
            }
          : undefined;
      }
      default:
        return undefined;
    }
  };
  const documentView =
    documentBlocks.length === 0
      ? []
      : [
          {
            id: 'document',
            label: { key: 'fr-urban-rules.view.document' },
            ...(dayNumber(report.document?.validFrom) === undefined
              ? {}
              : {
                  // A date as a number, formatted by the host's message formatter in the
                  // reader's locale (`{date, date, medium}`): « 26 mars 2026 ».
                  summary: {
                    value: {
                      key: 'fr-urban-rules.summary.date',
                      params: { date: dayNumber(report.document.validFrom) }
                    }
                  }
                }),
            blocks: documentBlocks
          }
        ];
  // 002.13 DEC-2: the Envelope view shows its height checks in section (platform 096.22): the
  // measured height checks of a height rule, after the view's notices.
  const heightRuleIds = new Set(
    (report.rules ?? [])
      .filter((rule) => rule.kind === 'height_total' || rule.kind === 'height_facade')
      .map((rule) => rule.id)
  );
  const heightCheckIds = (report.checks ?? [])
    .filter(
      (check) =>
        heightRuleIds.has(check.ruleId) &&
        check.subject?.kind === 'building' &&
        check.measured !== undefined
    )
    .map((check) => check.id);
  const withSection = (view) => {
    if (view.id !== 'envelope' || heightCheckIds.length === 0) return view;
    const afterNotices = view.blocks.findIndex((block) => block.kind !== 'notice');
    const at = afterNotices === -1 ? view.blocks.length : afterNotices;
    return {
      ...view,
      blocks: [
        ...view.blocks.slice(0, at),
        {
          kind: 'height-section',
          checkIds: heightCheckIds,
          caption: { key: 'fr-urban-rules.envelope.section' }
        },
        ...view.blocks.slice(at)
      ]
    };
  };
  const shaped = [...documentView, ...report.views].map((view) => {
    const [icon, group] = VIEW_SHAPE[view.id] ?? ['other', undefined];
    const summary = summaryOf(view);
    return withSection(withFlags({
      ...view,
      icon,
      ...(group === undefined ? {} : { group }),
      ...(summary === undefined ? {} : { summary })
    }));
  });
  const rank = (view) => {
    const index = VIEW_ORDER.indexOf(view.id);
    return index === -1 ? VIEW_ORDER.length : index;
  };
  const ordered = shaped
    .map((view, index) => ({ view, index }))
    .sort((a, b) => rank(a.view) - rank(b.view) || a.index - b.index)
    .map(({ view }) => view);
  return {
    ...report,
    ...(communeRow === undefined || typeof communeRow.value?.text !== 'string'
      ? {}
      : { locality: { ...communeRow.value, text: communeCase(communeRow.value.text) } }),
    assumptions: report.assumptions.map((assumption) => {
      const detailed =
        typeof assumption.text?.key === 'string' &&
        assumption.text.key.startsWith(ASSUMPTION_PREFIX) &&
        assumption.detail === undefined
          ? {
              ...assumption,
              detail: {
                key: `${assumption.text.key}.detail`,
                ...(assumption.text.params === undefined ? {} : { params: assumption.text.params })
              }
            }
          : assumption;
      // 002.13 DEC-3: the one figure the host draws (platform 096.22, SDK 1.36).
      return assumption.id === 'height-lowest-ground' && detailed.figure === undefined
        ? { ...detailed, figure: 'height-from-lowest-ground' }
        : detailed;
    }),
    overview: kept,
    views: ordered
  };
}

/** A parcel's commune: `code_insee`, else `idu`'s first five; PLM arrondissements mapped. */
function parcelCommune(parcel) {
  const props = parcel.properties ?? {};
  if (typeof props.code_insee === 'string' && /^\d[\dAB]\d{3}$/.test(props.code_insee))
    return communeOf(props.code_insee);
  if (typeof props.idu === 'string' && props.idu.length >= 5)
    return communeOf(props.idu.slice(0, 5));
  return undefined;
}

const ringArea = (ring) => {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.easting * b.northing - b.easting * a.northing;
  }
  return Math.abs(area) / 2;
};

/**
 * The commune holding most of the plot, by the parcels' own areas (DEC-4's
 * fields, carte-gouv-fr's contract): a plot across two communes is read as the
 * larger one's, and the overview lists both.
 */
function preferredCommune(view) {
  const areas = new Map();
  for (const parcel of view?.parcels ?? []) {
    const code = parcelCommune(parcel);
    if (code === undefined) continue;
    const area = (parcel.rings ?? []).reduce((sum, ring) => sum + ringArea(openRing(ring)), 0);
    areas.set(code, (areas.get(code) ?? 0) + area);
  }
  let best;
  for (const [code, area] of areas) if (best === undefined || area > best[1]) best = [code, area];
  return best?.[0];
}

/** The commune code for Géorisques (DEC-4): the parcels' (by area), else the municipality's. */
function communeCode(view, municipality) {
  return (
    preferredCommune(view) ??
    (municipality?.insee !== undefined ? communeOf(municipality.insee) : undefined)
  );
}

/** The arrondissement, for the one Géorisques dataset that answers it (radon). */
function arrondissementCode(view, municipality) {
  for (const parcel of view.parcels) {
    const props = parcel.properties ?? {};
    for (const code of [
      props.code_insee,
      typeof props.idu === 'string' ? props.idu.slice(0, 5) : undefined
    ]) {
      if (typeof code === 'string' && isArrondissement(code)) return code;
    }
  }
  return municipality?.arrondissement;
}

// ── RNU rules, Site boundary edges and R.111-17 checks (Sprint 002.1a) ──────────

/** The 3 m floor of R.111-15 and R.111-17, and R.111-17's half the altitude difference. */
const R111_17 = { factor: 0.5, minimum: 3 };
/**
 * Comparisons at the model's 0.001 m resolution (review 2026-10-20): a
 * distance of 2.9999999 m is 3.000 m, and a margin of −0.0004 m is none.
 * Half the resolution either way, so a figure that rounds to the limit passes.
 */
const RESOLUTION_HALF = 0.0005;
const mm = (value) => Math.round(value * 1000) / 1000;
/** The host's counts (platform `REGULATION_REPORT_LIMITS`): past them a report is refused whole. */
const HOST_LIMITS = { edges: 500, checks: 1000, assumptions: 500, rules: 1000 };
/** "Jouxte la limite": five consecutive façade samples (0.25 m apart, so ≥ 1 m) within 5 cm. */
const ADJOINING = { samples: 5, distance: 0.05 };
/** DEC-3: the roads asked over the Site boundary's box grown by this. */
const ROAD_MARGIN = 30;
/** DEC-3: a road makes an edge `street` within its half width plus this, of the edge's midpoint. */
const STREET_REACH = 20;
/** DEC-3: a road without a width is taken this wide, and said. */
const ASSUMED_ROAD_WIDTH = 3;
const COS_45 = Math.SQRT1_2;
const STREET_KINDS = new Set(['road', 'roundabout']);
const STREET_LEVELS = new Set(['ground', 'bridge']);
/** The host's limit on one list of actions (096.3b). */
const MAX_ACTIONS = 200;
const SECTION_SCHEMA = 1;
const LABEL_MAX = 80;

/**
 * Sprint 002.8 DEC-7: a parked variation's buildings on the variation's view
 * of the Site service (`variationView`), read by `namedBuildings`. A symbol,
 * so no host member is ever mistaken for it.
 */
const VARIATION_BUILDINGS = Symbol('variation buildings');

/**
 * Sprint 002.8 DEC-7: the Site service as one parked variation sees it — every
 * measure asked with its `variationId`, `variations()` naming it open (so the
 * per-variation answers of 002.3 DEC-3 are read under its id), and its
 * buildings the host's list (096.11 RD-1). Everything else is the service's.
 */
function variationView(service, variationId, buildings) {
  const measures = service?.measures;
  const scoped = {};
  for (const name of ['projection', 'floorAreas', 'distances', 'plotCoverage']) {
    if (typeof measures?.[name] === 'function') {
      scoped[name] = (input = {}) => measures[name]({ ...input, variationId });
    }
  }
  return {
    current: () => service.current(),
    variations: () => [{ id: variationId, open: true }],
    measures: scoped,
    [VARIATION_BUILDINGS]: buildings.map((b) => ({
      id: b.id,
      name: typeof b.name === 'string' && b.name !== '' ? b.name : undefined
    }))
  };
}

/**
 * Sprint 002.8 (DEC-2, DEC-3): the Site service with every measure answer kept
 * — `{ method, args, answer }` — so the questions and the programme warning
 * read the very measures the checks were computed from, never a second set.
 */
function recordedMeasures(service, calls) {
  const measures = service?.measures;
  if (measures === undefined) return service;
  const kept = {};
  for (const name of ['projection', 'floorAreas', 'distances', 'plotCoverage']) {
    if (typeof measures[name] !== 'function') continue;
    kept[name] = (...args) => {
      const answer = measures[name](...args);
      calls.push({ method: name, args: args[0] ?? {}, answer });
      return answer;
    };
  }
  // Over an empty target, so a frozen host service breaks no Proxy invariant.
  return new Proxy(Object.create(null), {
    has: (_, key) => key in service,
    get(_, key) {
      if (key === 'measures') return kept;
      const value = Reflect.get(service, key);
      return typeof value === 'function' ? value.bind(service) : value;
    }
  });
}

const EDGE_ROLES = ['street', 'side', 'rear'];
const ROLE_KEYS = {
  street: 'fr-urban-rules.edges.role.street',
  side: 'fr-urban-rules.edges.role.side',
  rear: 'fr-urban-rules.edges.role.rear'
};

/** Why a measure gave nothing, in words (DEC-7); any other reason is said by its code. */
const REASON_KEYS = {
  'no-terrain': 'fr-urban-rules.reason.no-terrain',
  'outside-terrain': 'fr-urban-rules.reason.outside-terrain',
  unmeasured: 'fr-urban-rules.reason.unmeasured',
  'other-system': 'fr-urban-rules.reason.other-system',
  'no-datum': 'fr-urban-rules.reason.no-datum',
  'no-solids': 'fr-urban-rules.reason.no-solids',
  'no-rooms': 'fr-urban-rules.reason.no-rooms',
  'no-outline': 'fr-urban-rules.reason.no-outline',
  'outline-refused': 'fr-urban-rules.reason.outline-refused',
  'not-located': 'fr-urban-rules.reason.not-located',
  'no-boundary': 'fr-urban-rules.reason.no-boundary',
  'unknown-building': 'fr-urban-rules.reason.unknown-building',
  unavailable: 'fr-urban-rules.reason.unavailable',
  'alignment-outside-terrain': 'fr-urban-rules.reason.alignment-outside-terrain',
  'no-road': 'fr-urban-rules.reason.no-road',
  'roads-unavailable': 'fr-urban-rules.reason.roads-unavailable',
  'no-plot': 'fr-urban-rules.reason.no-plot',
  'no-existing': 'fr-urban-rules.reason.no-existing',
  'no-annex-marked': 'fr-urban-rules.reason.no-annex-marked',
  'ratio-base-unknown': 'fr-urban-rules.reason.ratio-base-unknown',
  'roof-refused': 'fr-urban-rules.reason.roof-refused',
  // Sprint 002.6b DEC-3.
  'building-distance': 'fr-urban-rules.reason.building-distance',
  'described-rule': 'fr-urban-rules.reason.described-rule',
  'relative-not-measured': 'fr-urban-rules.reason.relative-not-measured',
  'no-wall': 'fr-urban-rules.reason.no-wall'
};

const cm = (value) => Math.round(value * 100) / 100;
const pointKey = (p) => `${cm(p.easting).toFixed(2)},${cm(p.northing).toFixed(2)}`;
/** An edge's ends as the action and the section key them: centimetres, never its number. */
const endsKey = (a, b) => `${pointKey(a)};${pointKey(b)}`;
const sameEnds = (ends, a, b) => {
  const [p, q] = ends;
  const k = (x) => `${cm(x[0]).toFixed(2)},${cm(x[1]).toFixed(2)}`;
  return (
    (k(p) === pointKey(a) && k(q) === pointKey(b)) || (k(p) === pointKey(b) && k(q) === pointKey(a))
  );
};
const plotIdsOf = (site) =>
  [...new Set((site?.parcels ?? []).map((parcel) => String(parcel.featureId)))].sort();
const samePlot = (a, b) =>
  Array.isArray(a) && a.length === b.length && a.every((id, i) => id === b[i]);

/** The Site boundary's edges, 1-based (ADR-0089 Rule 7): edge i from point i to point i + 1. */
function boundaryEdges(site) {
  const ring = site?.boundary?.ring;
  if (!Array.isArray(ring) || ring.length < 3) return undefined;
  const points = openRing(ring);
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const length = Math.hypot(dx, dy);
    // Counter-clockwise ring: the outside is on the right of the direction of travel.
    const normal = length === 0 ? { x: 0, y: 0 } : { x: dy / length, y: -dx / length };
    return {
      edge: i + 1,
      a,
      b,
      length,
      mid: { easting: (a.easting + b.easting) / 2, northing: (a.northing + b.northing) / 2 },
      normal
    };
  });
}

function nearestOnLine(line, p) {
  let best;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const length = dx * dx + dy * dy;
    let t =
      length === 0 ? 0 : ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / length;
    t = Math.max(0, Math.min(1, t));
    const q = { easting: a.easting + t * dx, northing: a.northing + t * dy };
    const d = Math.hypot(q.easting - p.easting, q.northing - p.northing);
    if (best === undefined || d < best.distance) best = { point: q, distance: d };
  }
  return best;
}

/**
 * DEC-3: each edge's derived role. `roads` is `{ segments }`, `{ refused }` or
 * `undefined` (not asked yet). Answers the roles and the assumption each rests
 * on, by edge number.
 */
function deriveRoles(edges, roads) {
  const roles = new Map();
  if (roads === undefined || roads.refused !== undefined) {
    for (const e of edges) roles.set(e.edge, { role: 'side', assumption: 'roads-unavailable' });
    return { roles, widthAssumed: false };
  }
  const streets = roads.segments.filter(
    (s) =>
      STREET_KINDS.has(s.kind) &&
      STREET_LEVELS.has(s.level) &&
      Array.isArray(s.line) &&
      s.line.length >= 2
  );
  if (streets.length === 0) {
    for (const e of edges) roles.set(e.edge, { role: 'side', assumption: 'no-road' });
    return { roles, widthAssumed: false };
  }
  let widthAssumed = false;
  for (const e of edges) {
    if (e.length === 0) continue;
    let best;
    for (const road of streets) {
      const near = nearestOnLine(road.line, e.mid);
      if (near === undefined) continue;
      const width =
        typeof road.widthMetres === 'number' && road.widthMetres > 0 ? road.widthMetres : undefined;
      if (near.distance > (width ?? ASSUMED_ROAD_WIDTH) / 2 + STREET_REACH || near.distance === 0)
        continue;
      const toward = {
        x: (near.point.easting - e.mid.easting) / near.distance,
        y: (near.point.northing - e.mid.northing) / near.distance
      };
      if (toward.x * e.normal.x + toward.y * e.normal.y < COS_45) continue;
      if (best === undefined || near.distance < best.distance) best = { ...near, road, width };
    }
    if (best !== undefined) {
      if (best.width === undefined) widthAssumed = true;
      roles.set(e.edge, { role: 'street', assumption: `street-${e.edge}`, road: best.road.name });
    }
  }
  const streetEdges = edges.filter((e) => roles.get(e.edge)?.role === 'street');
  if (streetEdges.length === 0) {
    for (const e of edges) roles.set(e.edge, { role: 'side', assumption: 'no-street-edge' });
    return { roles, widthAssumed: false };
  }
  // The street edges' ends, once: "touching a street edge" is a set lookup, so
  // a boundary of thousands of edges stays linear.
  const streetEnds = new Set(streetEdges.flatMap((s) => [pointKey(s.a), pointKey(s.b)]));
  // The opposite directions of the street normals, distinct to the degree.
  const opposite = [
    ...new Map(
      streetEdges.map((s) => [
        Math.round((Math.atan2(-s.normal.y, -s.normal.x) * 180) / Math.PI),
        s
      ])
    ).values()
  ];
  for (const e of edges) {
    if (roles.has(e.edge)) continue;
    // Opposite a street edge, and touching none: a corner plot's far edges stay side.
    const rear =
      opposite.some((s) => -(e.normal.x * s.normal.x + e.normal.y * s.normal.y) >= COS_45) &&
      !streetEnds.has(pointKey(e.a)) &&
      !streetEnds.has(pointKey(e.b));
    roles.set(e.edge, { role: rear ? 'rear' : 'side', assumption: 'edges-derived' });
  }
  return { roles, widthAssumed };
}

/** The section, read (DEC-8): `{ section, readOnly }`; an unknown schema is read-only. */
function sectionOf(raw) {
  if (raw === undefined || raw === null) return { section: undefined, readOnly: false };
  if (typeof raw !== 'object' || Array.isArray(raw) || raw.schema !== SECTION_SCHEMA) {
    return { section: raw, readOnly: true };
  }
  // A member this sprint owns, in a shape it does not recognise, is never
  // overwritten: the section is read-only, as one of an unknown schema is.
  if (
    raw.edgeRoles !== undefined &&
    (!Array.isArray(raw.edgeRoles) || edgeRolesOf(raw).length !== raw.edgeRoles.length)
  ) {
    return { section: raw, readOnly: true };
  }
  // 002.3's members, keyed by variation: plain objects or nothing.
  for (const member of ['emprise', 'sdp', 'roles']) {
    if (raw[member] !== undefined && !isRecord(raw[member]))
      return { section: raw, readOnly: true };
  }
  // 002.2's members, likewise: never overwritten in a shape not recognised.
  for (const [member, valid] of [
    ['confirmations', isConfirmation],
    ['entered', isEntered],
    ['exclusionChoices', isExclusionChoice],
    ['exclusionsHidden', isExclusionsHidden],
    ['broughtBack', isBroughtBack]
  ]) {
    if (raw[member] !== undefined && (!Array.isArray(raw[member]) || !raw[member].every(valid))) {
      return { section: raw, readOnly: true };
    }
  }
  // Sprint 002.24: the project's nature is one record, never overwritten in a shape not recognised.
  if (raw.projectNature !== undefined && !isProjectNature(raw.projectNature))
    return { section: raw, readOnly: true };
  return { section: raw, readOnly: false };
}

const edgeRolesOf = (section) =>
  Array.isArray(section?.edgeRoles)
    ? section.edgeRoles.filter(
        (entry) =>
          entry !== null &&
          typeof entry === 'object' &&
          Array.isArray(entry.ends) &&
          entry.ends.length === 2 &&
          entry.ends.every(
            (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
          ) &&
          EDGE_ROLES.includes(entry.role)
      )
    : [];

/** The forget action's subject: the entry's ends and its plot's digest. */
const entrySubject = (entry) =>
  `${entry.ends.map((p) => `${cm(p[0]).toFixed(2)},${cm(p[1]).toFixed(2)}`).join(';')}@${digest(
    (Array.isArray(entry.plot) ? entry.plot : []).join(',')
  )}`;

/**
 * DEC-8's pure builders: the next section from the one read and the user's
 * act. Every member the act does not own is kept as it is.
 */
function withEdgeRole(section, plot, ends, role, at) {
  const kept = edgeRolesOf(section).filter(
    (entry) =>
      !(
        samePlot(entry.plot, plot) &&
        sameEnds(
          entry.ends,
          { easting: ends[0][0], northing: ends[0][1] },
          { easting: ends[1][0], northing: ends[1][1] }
        )
      )
  );
  return {
    ...(section ?? {}),
    schema: SECTION_SCHEMA,
    edgeRoles: [...kept, { plot, ends, role, at }]
  };
}

function withoutEdgeRole(section, subject) {
  const list = Array.isArray(section?.edgeRoles) ? section.edgeRoles : [];
  const index = list.findIndex(
    (entry) => edgeRolesOf({ edgeRoles: [entry] }).length === 1 && entrySubject(entry) === subject
  );
  if (index === -1) return undefined;
  return { ...section, schema: SECTION_SCHEMA, edgeRoles: list.filter((_, i) => i !== index) };
}

/** The ends of a `set-edge-role` subject: `e1,n1;e2,n2`. */
function parseEnds(subject) {
  if (typeof subject !== 'string') return undefined;
  const parts = subject.split(';').map((pair) => pair.split(',').map(Number));
  if (parts.length !== 2 || parts.some((p) => p.length !== 2 || !p.every(Number.isFinite)))
    return undefined;
  return parts;
}

// ── Opposite alignment, neighbours and bands: geometry (Sprint 002.1b) ──────────

/** DEC-1: facing parcels are searched this far beyond a street edge. */
const FACING_SEARCH = 40;
/** DEC-4: neighbouring buildings within this of the Site boundary (the extension's choice; the article says none). */
const NEIGHBOUR_RADIUS = 50;
/** DEC-1's three paths: the feature's label and the assumption it rests on. */
const ALIGNMENT_KEYS = {
  el7: 'fr-urban-rules.alignment.el7',
  parcels: 'fr-urban-rules.alignment.parcels',
  carriageway: 'fr-urban-rules.alignment.carriageway',
  'carriageway-unread': 'fr-urban-rules.alignment.carriageway'
};
const ALIGNMENT_ASSUMPTION_KEYS = {
  el7: 'fr-urban-rules.assumption.alignment.el7',
  parcels: 'fr-urban-rules.assumption.alignment.parcels',
  carriageway: 'fr-urban-rules.assumption.alignment.carriageway',
  'carriageway-unread': 'fr-urban-rules.assumption.alignment.carriagewayUnread'
};
/** Targets asked per building for R.111-16 and R.111-15, before the report's own caps. */
const MAX_LINE_TARGETS = 200;

/** A point in an edge's frame: `t` along it (0 at `a`, 1 at `b`), `s` outward, in metres. */
function inEdgeFrame(edge, point) {
  const dx = point.easting - edge.a.easting;
  const dy = point.northing - edge.a.northing;
  const along =
    edge.length === 0
      ? 0
      : (dx * (edge.b.easting - edge.a.easting) + dy * (edge.b.northing - edge.a.northing)) /
        (edge.length * edge.length);
  return { t: along, s: dx * edge.normal.x + dy * edge.normal.y };
}

/** The edge translated along its outward normal by `offset` metres (negative: inward). */
function shiftedEdge(edge, offset) {
  const move = (p) => ({
    easting: p.easting + edge.normal.x * offset,
    northing: p.northing + edge.normal.y * offset
  });
  return [move(edge.a), move(edge.b)];
}

const signedRingArea = (ring) => {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.easting * b.northing - b.easting * a.northing;
  }
  return area / 2;
};

function pointSegmentDistance(p, a, b) {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const length = dx * dx + dy * dy;
  let t =
    length === 0 ? 0 : ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / length;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.easting + t * dx - p.easting, a.northing + t * dy - p.northing);
}

/** A box over points, grown by `margin`, as a feature query in `crs`. */
function boxQuery(points, margin, crs, limit) {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (const p of points) {
    minE = Math.min(minE, p.easting);
    minN = Math.min(minN, p.northing);
    maxE = Math.max(maxE, p.easting);
    maxN = Math.max(maxN, p.northing);
  }
  return {
    crs,
    minEasting: minE - margin,
    minNorthing: minN - margin,
    maxEasting: maxE + margin,
    maxNorthing: maxN + margin,
    limit
  };
}

/** Stations along a street edge (every 5 %) at which an opposite alignment is read. */
const STATIONS = 20;
/** Below this share of stations answered, a facing source does not cover the edge. */
const MIN_COVERAGE = 0.6;
/** Without a road centreline, an EL7 line nearer than this is taken as the near side. */
const NEAR_SIDE_WITHOUT_CENTRE = 3;

/**
 * Review 2026-10-20 (B1, should-fix 2): the nearest source line across from
 * an edge, read at each station — for every station `t`, among the segments
 * spanning it, the point whose outward distance `s` is the smallest beyond
 * `sMin` and within `sMax`. Second-row parcels and a far line behind a nearer
 * one are never taken; a source covering under 60 % of the stations covers
 * the edge too poorly to stand for its alignment (`undefined`).
 */
function nearestAlong(edge, segments, sMin, sMax) {
  const framed = [];
  for (const { a, b } of segments) {
    const fa = inEdgeFrame(edge, a);
    const fb = inEdgeFrame(edge, b);
    if (fa.t !== fb.t) framed.push({ a, b, fa, fb });
  }
  const chain = [];
  for (let i = 0; i <= STATIONS; i += 1) {
    const t = i / STATIONS;
    let best;
    for (const x of framed) {
      if (t < Math.min(x.fa.t, x.fb.t) || t > Math.max(x.fa.t, x.fb.t)) continue;
      const k = (t - x.fa.t) / (x.fb.t - x.fa.t);
      const s = x.fa.s + k * (x.fb.s - x.fa.s);
      if (s <= sMin || s > sMax) continue;
      if (best === undefined || s < best.s) {
        best = {
          s,
          point: {
            easting: x.a.easting + k * (x.b.easting - x.a.easting),
            northing: x.a.northing + k * (x.b.northing - x.a.northing)
          }
        };
      }
    }
    if (best !== undefined) chain.push(best.point);
  }
  return chain.length >= MIN_COVERAGE * (STATIONS + 1) ? chain : undefined;
}

const segmentsOf = (line) => line.slice(1).map((b, i) => ({ a: line[i], b }));

/** DEC-1, path 2: the segments of the facing parcels' edges whose own outward normal faces the street edge. */
function facingSegments(edge, parcels, plotIds) {
  const segments = [];
  for (const parcel of parcels) {
    if (plotIds.includes(String(parcel.id))) continue;
    for (const raw of parcel.rings ?? []) {
      const ring = openRing(raw);
      if (ring.length < 3) continue;
      const ccw = signedRingArea(ring) > 0;
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const length = Math.hypot(b.easting - a.easting, b.northing - a.northing);
        if (length === 0) continue;
        const dx = (b.easting - a.easting) / length;
        const dy = (b.northing - a.northing) / length;
        const outward = ccw ? { x: dy, y: -dx } : { x: -dy, y: dx };
        if (outward.x * edge.normal.x + outward.y * edge.normal.y > -COS_45) continue;
        segments.push({ a, b });
      }
    }
  }
  return segments;
}

/**
 * DEC-1, path 3 (should-fix 1): the carriageway's true far edge — at each
 * station, the outward ray from the edge meets the road's centreline; the far
 * edge lies `width / 2` beyond it measured square to the road, so along the
 * ray `(width / 2) / |cos θ|`, θ the angle between the road and the edge.
 * `undefined` under two points.
 */
function carriagewayFarEdge(edge, road, width) {
  const line = road.line ?? [];
  const chain = [];
  for (let i = 0; i <= STATIONS; i += 1) {
    const t = i / STATIONS;
    const p = {
      easting: edge.a.easting + t * (edge.b.easting - edge.a.easting),
      northing: edge.a.northing + t * (edge.b.northing - edge.a.northing)
    };
    let best;
    for (const { a, b } of segmentsOf(line)) {
      const dx = b.easting - a.easting;
      const dy = b.northing - a.northing;
      const denominator = edge.normal.x * dy - edge.normal.y * dx;
      if (Math.abs(denominator) < 1e-12) continue;
      const qx = a.easting - p.easting;
      const qy = a.northing - p.northing;
      const s = (qx * dy - qy * dx) / denominator;
      const u = (qx * edge.normal.y - qy * edge.normal.x) / denominator;
      if (s <= 0 || u < 0 || u > 1) continue;
      if (best === undefined || s < best.s) {
        const length = Math.hypot(dx, dy);
        const cos = Math.abs((edge.normal.x * -dy + edge.normal.y * dx) / length);
        best = { s, cos };
      }
    }
    if (best === undefined || best.cos < 1e-6) continue;
    const reach = best.s + width / 2 / best.cos;
    chain.push({
      easting: p.easting + edge.normal.x * reach,
      northing: p.northing + edge.normal.y * reach
    });
  }
  return chain.length >= 2 ? chain : undefined;
}

/** Whether a point lies inside a ring (even–odd rule). */
function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.northing > point.northing !== b.northing > point.northing &&
      point.easting <
        ((b.easting - a.easting) * (point.northing - a.northing)) / (b.northing - a.northing) +
          a.easting
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * B2: a segment clipped to a polygon — the pieces of `p → q` whose middles lie
 * inside the ring, cut where it crosses the ring's edges. A band on a
 * triangle or an L-shaped plot stays on the plot.
 */
function clipToRing(p, q, ring) {
  const cuts = [0, 1];
  const dx = q.easting - p.easting;
  const dy = q.northing - p.northing;
  const minE = Math.min(p.easting, q.easting);
  const maxE = Math.max(p.easting, q.easting);
  const minN = Math.min(p.northing, q.northing);
  const maxN = Math.max(p.northing, q.northing);
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    // A box test first: on a boundary of thousands of edges, most are far.
    if (
      Math.max(a.easting, b.easting) < minE ||
      Math.min(a.easting, b.easting) > maxE ||
      Math.max(a.northing, b.northing) < minN ||
      Math.min(a.northing, b.northing) > maxN
    ) {
      continue;
    }
    const ex = b.easting - a.easting;
    const ey = b.northing - a.northing;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-12) continue;
    const ax = a.easting - p.easting;
    const ay = a.northing - p.northing;
    const t = (ax * ey - ay * ex) / denominator;
    const u = (ax * dy - ay * dx) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  const at = (t) => ({ easting: p.easting + t * dx, northing: p.northing + t * dy });
  const pieces = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    if (cuts[i + 1] - cuts[i] < 1e-9) continue;
    if (insideRing(at((cuts[i] + cuts[i + 1]) / 2), ring))
      pieces.push([at(cuts[i]), at(cuts[i + 1])]);
  }
  return pieces;
}

// ── Drawn and entered rules: keys, section shapes, limits (Sprint 002.2) ────────

/**
 * cyrb53 (DEC-2): a synchronous 53-bit string digest — the one the host's
 * `regulationSiteKey.ts` uses — so the rule keys stay pure.
 */
function cyrb53(text, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * A drawn prescription's centroid in the Site's CRS, rounded to the metre
 * (DEC-2): the area-weighted centroid of its unsimplified outer rings, or its
 * line's box centre (review fix S4); `-` for a point or an unconverted
 * geometry, whose keys a suffix then tells apart (`plannedRules`).
 */
function roundedCentroid(geometry) {
  const centre =
    geometry?.centroid ??
    boxCentre([...(geometry?.rings ?? []).flat(), ...(geometry?.lines ?? []).flat()]);
  if (centre === undefined) return '-';
  return `${Math.round(centre.easting)},${Math.round(centre.northing)}`;
}

/**
 * DEC-2: a drawn rule's key — its type, subtype and a digest of its words and
 * where it is drawn. Never the parsed kind: 002.6 relabels a drawn height,
 * and a better parser may read another kind; neither may orphan a confirmation.
 */
const drawnKey = (prescription) =>
  `psc:${prescription.type || '00'}:${prescription.subtype ?? '00'}:${cyrb53(
    `${prescription.libelle}|${prescription.txt ?? ''}|${roundedCentroid(prescription.geometry)}`
  )}`;

/** Kinds whose limit is a floor (DEC-3); every other limit is a cap. */
const MINIMUM_KINDS = new Set([
  'road_setback',
  'boundary_setback',
  'building_distance',
  'green_ratio'
]);
const SDK_UNITS = new Set(['m', 'm2', 'percent']);

const limitOf = (kind, value, unit) => ({
  kind: 'value',
  comparison: MINIMUM_KINDS.has(kind) ? 'min' : 'max',
  quantity: { value, unit }
});

/** DEC-6: the entry forms' kinds, by the form's unit — the rule kind, its edge roles, its label. */
const ENTERED_KINDS = {
  height_total: {
    unit: 'm',
    kind: 'height_total',
    label: 'fr-urban-rules.entered.kind.height_total'
  },
  height_facade: {
    unit: 'm',
    kind: 'height_facade',
    label: 'fr-urban-rules.entered.kind.height_facade'
  },
  street_setback: {
    unit: 'm',
    kind: 'road_setback',
    roles: ['street'],
    label: 'fr-urban-rules.entered.kind.street_setback'
  },
  side_setback: {
    unit: 'm',
    kind: 'boundary_setback',
    roles: ['side'],
    label: 'fr-urban-rules.entered.kind.side_setback'
  },
  rear_setback: {
    unit: 'm',
    kind: 'boundary_setback',
    roles: ['rear'],
    label: 'fr-urban-rules.entered.kind.rear_setback'
  },
  building_distance: {
    unit: 'm',
    kind: 'building_distance',
    label: 'fr-urban-rules.entered.kind.building_distance'
  },
  footprint_ratio: {
    unit: 'percent',
    kind: 'footprint_ratio',
    label: 'fr-urban-rules.entered.kind.footprint_ratio'
  },
  green_ratio: {
    unit: 'percent',
    kind: 'green_ratio',
    label: 'fr-urban-rules.entered.kind.green_ratio'
  },
  extension_ratio: {
    unit: 'percent',
    kind: 'extension_max',
    label: 'fr-urban-rules.entered.kind.extension_ratio'
  },
  floor_area_max: {
    unit: 'm2',
    kind: 'floor_area_max',
    label: 'fr-urban-rules.entered.kind.floor_area_max'
  },
  annex_max: { unit: 'm2', kind: 'annex_max', label: 'fr-urban-rules.entered.kind.annex_max' },
  extension_area: {
    unit: 'm2',
    kind: 'extension_max',
    label: 'fr-urban-rules.entered.kind.extension_area'
  }
};

/** DEC-6: the three entry actions, one per unit (the host converts `m` and `m2`). */
const ENTRY_FORMS = {
  'add-distance': { unit: 'm', label: 'fr-urban-rules.entered.addDistance' },
  'add-ratio': { unit: 'percent', label: 'fr-urban-rules.entered.addRatio' },
  'add-area': { unit: 'm2', label: 'fr-urban-rules.entered.addArea' },
  // Sprint 002.18: « N m high within M m of the limits », an entered height with a band.
  'add-height-band': { unit: 'm', label: 'fr-urban-rules.entered.addHeightBand', band: true }
};

/**
 * Sprint 002.18 DEC-1: which edges a height band runs along, by the choice's value — the roles
 * and the words (`condition` is the rule's own sentence, `cut` the buildable-area list's).
 */
const BAND_EDGES = {
  all: {
    roles: ['street', 'side', 'rear'],
    label: 'fr-urban-rules.band.edges.all',
    condition: 'fr-urban-rules.rule.bandCondition.all'
  },
  street: {
    roles: ['street'],
    label: 'fr-urban-rules.band.edges.street',
    condition: 'fr-urban-rules.rule.bandCondition.street'
  },
  side: {
    roles: ['side'],
    label: 'fr-urban-rules.band.edges.side',
    condition: 'fr-urban-rules.rule.bandCondition.side'
  },
  rear: {
    roles: ['rear'],
    label: 'fr-urban-rules.band.edges.rear',
    condition: 'fr-urban-rules.rule.bandCondition.rear'
  },
  'side-rear': {
    roles: ['side', 'rear'],
    label: 'fr-urban-rules.band.edges.sideRear',
    condition: 'fr-urban-rules.rule.bandCondition.sideRear'
  }
};
/** A band is at most 50 m deep: past that it is the plot, which a height over the plot says. */
const BAND_MAX_DEPTH = 50;
const bandEdgesChoice = (band) =>
  Object.entries(BAND_EDGES).find(
    ([, edges]) =>
      edges.roles.length === band.roles.length && edges.roles.every((role) => band.roles.includes(role))
  )?.[0];
function isBand(band) {
  return (
    band !== null &&
    typeof band === 'object' &&
    Number.isFinite(band.depth) &&
    band.depth > 0 &&
    band.depth <= BAND_MAX_DEPTH &&
    Array.isArray(band.roles) &&
    band.roles.length > 0 &&
    band.roles.every((role) => EDGE_ROLES.includes(role)) &&
    bandEdgesChoice(band) !== undefined
  );
}

// ── Sprint 002.21: a written height held to a strip along the limits ────────────

const WRITTEN_SETBACK_KINDS = new Set(['road_setback', 'boundary_setback']);
/** A strip's rule label, by the height it limits (the rule's kind is `other`, as an entered band's is). */
const STRIP_LABEL_KEYS = {
  height_total: 'fr-urban-rules.written.kind.heightStrip',
  height_facade: 'fr-urban-rules.written.kind.facadeStrip'
};
/**
 * The words a strip's rule says beside its limit: which limits and how deep (the entered band's
 * sentence), and — when the text lets a construction stand in it — that it is a derogation.
 */
function stripConditions(strip) {
  return [
    { key: BAND_EDGES[strip.edges].condition, params: { depth: mm(strip.depth) } },
    ...(strip.permits ? [{ key: 'fr-urban-rules.written.stripPermits' }] : [])
  ];
}
/** A strip as a confirmation stores it, checked: `{ depth, edges, permits, of }` or `undefined`. */
function storedStripOf(raw) {
  if (!isRecord(raw)) return undefined;
  if (!Object.hasOwn(BAND_EDGES, raw.edges) || !STRIP_KINDS.has(raw.of)) return undefined;
  if (!(finiteAtLeast(raw.depth, 0.1) && raw.depth <= BAND_MAX_DEPTH) || typeof raw.permits !== 'boolean')
    return undefined;
  return { depth: raw.depth, edges: raw.edges, permits: raw.permits, of: raw.of };
}

// ── Sprint 002.22: candidate rules decided automatically ─────────────────────────

/** A zone or sector code as the règlement writes one: two to four capitals, then a letter or digit or two. */
const SECTOR_CODE = /^[A-Z]{2,4}[a-z]?\d?[a-z]?\d?$/u;
/**
 * Sprint 002.22 (a): a rule of a sector is **positively** another sector's when both are codes and
 * neither is the beginning of the other (`UDa2` against a plot in `UDa1`; `UDa` and `UD` overlap
 * with `UDa1` and are kept). Anything that is not a code (a word the model put there) decides nothing.
 */
const sectorsDiffer = (sector, zone) => {
  if (typeof sector !== 'string' || typeof zone !== 'string') return false;
  const a = sector.normalize('NFKC').replace(/\s+/gu, '');
  const b = zone.normalize('NFKC').replace(/\s+/gu, '');
  if (!SECTOR_CODE.test(a) || !SECTOR_CODE.test(b)) return false;
  return !a.toLowerCase().startsWith(b.toLowerCase()) && !b.toLowerCase().startsWith(a.toLowerCase());
};
/** A place's name as a key: no accent, no case, no space, no hyphen, no apostrophe. */
const nameKey = (name) =>
  String(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');
const COMMUNE_LIST =
  /\b(?:pour|dans)\s+(?:les\s+communes?|la\s+commune)\s+(?:de\s+|d['’]\s*|du\s+|des\s+)?:?\s*([^]+)$/iu;
/** The commune names a condition lists (« pour les communes de : A, B et C »), as keys; `undefined` when it lists none. */
function communesIn(text) {
  const match = COMMUNE_LIST.exec(String(text).normalize('NFKC'));
  if (match === null) return undefined;
  const names = match[1]
    .split(/\s*(?:,|;|\bet\b)\s*/iu)
    .map(nameKey)
    .filter((name) => name !== '');
  return names.length === 0 ? undefined : names;
}
const CROSS_REFERENCE = /\bse\s+reporter\b|\bse\s+r[ée]f[ée]rer\b|\bvoir\s+(?:l['’]\s*|les\s+)?articles?\b/iu;
const A_NUMBER_WITH_UNIT = /\d[\d\s.,]*\s*(?:m\b|m2|m²|m[èe]tres?|%|pour\s*cent|places?)/iu;
/**
 * Sprint 002.22: what the system can decide about a candidate with certainty, from facts it holds —
 * the plot's zone and its commune — and the candidate itself. `{ decision, reason }` with `decision`
 * `ruled_out` (it is about something else: another sector, other communes) or `informational` (a
 * reference to another article, or the règlement saying the matter is not regulated); `undefined`
 * when there is doubt. It never decides that a rule applies: only a person confirms.
 */
function triageOf({ item, zone, commune }) {
  if (item.statement === 'not_regulated')
    return { decision: 'informational', reason: { key: 'fr-urban-rules.triage.reason.notRegulated' } };
  if (
    item.statement === 'described' &&
    item.kind === 'other' &&
    item.passage.length <= 600 &&
    CROSS_REFERENCE.test(item.passage) &&
    !A_NUMBER_WITH_UNIT.test(item.passage)
  )
    return { decision: 'informational', reason: { key: 'fr-urban-rules.triage.reason.crossReference' } };
  if (item.sector !== null && sectorsDiffer(item.sector, zone))
    return {
      decision: 'ruled_out',
      reason: { key: 'fr-urban-rules.triage.reason.sector', params: { sector: item.sector, zone } }
    };
  if (typeof commune === 'string' && commune !== '') {
    const mine = nameKey(commune);
    const lists = item.conditions.map(communesIn).filter((names) => names !== undefined);
    const absent = (names) => !names.some((n) => n === mine || n.startsWith(mine) || mine.startsWith(n));
    // « Positively absent »: every list this candidate states leaves the commune out, and the commune
    // is named nowhere in its passage either (a list cut short by a length limit decides nothing).
    if (
      mine !== '' &&
      lists.length > 0 &&
      lists.every(absent) &&
      !nameKey(item.passage).includes(mine)
    )
      return {
        decision: 'ruled_out',
        reason: { key: 'fr-urban-rules.triage.reason.commune', params: { commune } }
      };
  }
  return undefined;
}
// ── Sprint 002.24: the nature of the project ───────────────────────────────────

/**
 * A text as a comparison key: no accent, no case, no apostrophe, hyphen or star, one space between
 * words. « d’activités de service » and « d activites de service » are one.
 */
const foldText = (text) =>
  String(text)
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’'‘`\-–—*]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

/** What the user is planning: a new building, an extension of an existing one, an annex or a pool. */
const PROJECT_WORKS = ['new', 'extension', 'annex'];
/**
 * What the project is used for: the Code de l'urbanisme's sub-destinations (R.151-28), kept as the
 * règlement quotes them, and the destination it groups under `equipements`. `other` is « mixed or
 * not listed »: it settles nothing.
 */
const PROJECT_USES = [
  'logement',
  'hebergement',
  'artisanat-commerce',
  'restauration',
  'commerce-gros',
  'services-clientele',
  'hotel',
  'cinema',
  'equipements',
  'bureau',
  'industrie',
  'entrepot',
  'centre-congres',
  'agricole',
  'forestier',
  'other'
];
const COMMERCE_USES = [
  'artisanat-commerce',
  'restauration',
  'commerce-gros',
  'services-clientele',
  'hotel',
  'cinema'
];
/** A label as the règlement writes it (folded) → the uses it names; a destination names its sub-destinations. */
const USE_ALIASES = new Map(
  [
    [['logement', 'logements'], ['logement']],
    [
      ['habitation', 'habitations'],
      ['logement', 'hebergement']
    ],
    [['hebergement', 'hebergements'], ['hebergement']],
    [
      [
        'artisanat et commerce de detail',
        'artisanat et commerces de detail',
        'artisanat et commerce de details'
      ],
      ['artisanat-commerce']
    ],
    [['restauration'], ['restauration']],
    [['commerce de gros'], ['commerce-gros']],
    [
      [
        'activites de service ou s effectue l accueil d une clientele',
        'activites de services ou s effectue l accueil d une clientele',
        'activite de service ou s effectue l accueil d une clientele',
        'services avec accueil de clients'
      ],
      ['services-clientele']
    ],
    [
      [
        'hebergement hotelier et touristique',
        'hotels et autres hebergements touristiques',
        'hotel',
        'hotels'
      ],
      ['hotel']
    ],
    [['cinema'], ['cinema']],
    [
      [
        'commerce et activites de services',
        'commerce et activites de service',
        'commerces et activites de services',
        'commerces et activites de service'
      ],
      COMMERCE_USES
    ],
    [['equipements d interet collectif et services publics'], ['equipements']],
    [['bureau', 'bureaux'], ['bureau']],
    [['industrie'], ['industrie']],
    [['entrepot', 'entrepots'], ['entrepot']],
    [['centre de congres et d exposition'], ['centre-congres']],
    [
      ['autres activites des secteurs secondaire ou tertiaire'],
      ['industrie', 'entrepot', 'bureau', 'centre-congres']
    ],
    [['exploitation agricole'], ['agricole']],
    [['exploitation forestiere'], ['forestier']],
    [['exploitation agricole et forestiere'], ['agricole', 'forestier']]
  ].flatMap(([labels, ids]) => labels.map((label) => [label, ids]))
);

/**
 * The uses a candidate is about, when it says so in its own subject — a condition that is a use's name
 * (a parking table's row), one that quotes « sous-destination … » or « à destination de … », or a
 * one-line row of the uses table (« Industrie Interdit »). A use quoted that this does not know makes
 * the whole candidate unreadable (`undefined`): it is never scoped on a guess. A destination and one of
 * its sub-destinations named together are the sub-destination (the finer one wins).
 */
function usesOfCandidate(item) {
  const sets = [];
  for (const condition of item.conditions) {
    const folded = foldText(condition);
    const direct = USE_ALIASES.get(folded);
    if (direct !== undefined) {
      sets.push(direct);
      continue;
    }
    if (/sous ?destinations?|a destination d/u.test(folded)) {
      const quoted = [
        ...String(condition)
          .normalize('NFKC')
          .matchAll(/[«"]\s*([^»"]+?)\s*[»"]/gu)
      ].map((match) => USE_ALIASES.get(foldText(match[1])));
      if (quoted.length === 0 || quoted.some((ids) => ids === undefined)) return undefined;
      sets.push([...new Set(quoted.flat())]);
    }
  }
  if (sets.length === 0 && item.passage.length <= 80) {
    const row =
      /^(.+?) (?:interdit|interdite|interdits|interdites|autorise|autorisee|autorises|admis|admise|admises)$/u.exec(
        foldText(item.passage)
      );
    const ids = row === null ? undefined : USE_ALIASES.get(row[1]);
    if (ids !== undefined) sets.push(ids);
  }
  if (sets.length === 0) return undefined;
  const finest = sets.filter(
    (set) =>
      !sets.some(
        (other) =>
          other !== set && other.length < set.length && other.every((id) => set.includes(id))
      )
  );
  return [...new Set(finest.flat())].sort();
}

const EXTENSION_SUBJECT = /^(?:\[\w+\] )?(?:(?:les|une seule|une|des|l) )?extensions?\b/u;
const EXTENSION_ADMITTED =
  /^(?:\[\w+\] )?(?:est admise|sont admises|est autorisee|sont autorisees) (?:l |les |une seule )?extensions?\b/u;
/**
 * A candidate that is about the extension of an existing building and nothing else, by its subject: its
 * passage or one of its conditions begins with « extension(s) », or says extensions are admitted. Not
 * « les nouvelles constructions et les extensions »: that one is about both.
 */
function extensionOnly(item) {
  return (
    EXTENSION_SUBJECT.test(foldText(item.passage)) ||
    item.conditions.some((condition) => EXTENSION_SUBJECT.test(foldText(condition))) ||
    EXTENSION_ADMITTED.test(foldText(item.passage))
  );
}

const SDP_COMPARISON = {
  'inferieure ou egale': 'le',
  'egale ou inferieure': 'le',
  'superieure ou egale': 'ge',
  'egale ou superieure': 'ge',
  'au moins egale': 'ge',
  'au plus egale': 'le',
  inferieure: 'lt',
  superieure: 'gt'
};
const SDP_CONDITION =
  /surface de plancher (?:totale )?(?:est |sont )?(inferieure ou egale|egale ou inferieure|superieure ou egale|egale ou superieure|au moins egale|au plus egale|inferieure|superieure) ?a? ?(\d+(?:[.,]\d+)?) ?m2(.*)$/u;
/**
 * The floor-area thresholds a candidate's conditions state — « constructions d'une surface de plancher
 * inférieure à 500 m2 dans les secteurs UDa et UDa1, ou 250 m2 dans le secteur UDa2 » — as
 * `{ cmp, threshold }` for the plot's own zone. A threshold stated for sectors that do not include the
 * zone, or a condition this cannot read, is no threshold: the candidate is left alone.
 */
function sdpOf(item, zone) {
  const mine = foldText(zone ?? '').replace(/ /gu, '');
  const found = [];
  for (const condition of item.conditions) {
    const match = SDP_CONDITION.exec(foldText(condition));
    if (match === null) continue;
    const number = (text) => Number(text.replace(',', '.'));
    const tail = match[3];
    const sectors =
      /dans (?:les |le )?secteurs? ([a-z0-9]+(?: (?:et|ou) [a-z0-9]+| ?, ?[a-z0-9]+)*)/u.exec(tail);
    const second = /(?:ou|,) ?(\d+(?:[.,]\d+)?) ?m2 dans (?:le )?secteurs? ([a-z0-9]+)/u.exec(tail);
    let threshold = number(match[2]);
    if (sectors !== null || second !== null) {
      const listed = sectors === null ? [] : sectors[1].split(/ ?, ?| et | ou /u);
      if (mine !== '' && listed.includes(mine)) threshold = number(match[2]);
      else if (mine !== '' && second !== null && second[2] === mine) threshold = number(second[1]);
      else continue;
    }
    if (Number.isFinite(threshold)) found.push({ cmp: SDP_COMPARISON[match[1]], threshold });
  }
  return found;
}

const ICPE_SUBJECT =
  /^(?:\[\w+\] )?(?:dans [^,]{0,40}, )?(?:sont admises|est admise|sont autorisees) les installations classees/u;

/**
 * Sprint 002.24: what a candidate is about, read from its own subject and conditions, never from free
 * text: the uses (`uses`), the extension of an existing building (`works`), floor-area thresholds
 * (`sdp`) and classified installations (`icpe`). `undefined` when it names none — most are general.
 */
function scopeOf({ item, zone }) {
  const scope = {};
  const uses = usesOfCandidate(item);
  if (uses !== undefined) scope.uses = uses;
  if (extensionOnly(item)) scope.works = 'extension';
  const sdp = sdpOf(item, zone);
  if (sdp.length > 0) scope.sdp = sdp;
  if (ICPE_SUBJECT.test(foldText(item.passage))) scope.icpe = true;
  return Object.keys(scope).length === 0 ? undefined : scope;
}

/**
 * Whether `cmp threshold` holds for the project's floor area: `true`, `false`, or `undefined` where the
 * answer leaves it open. An exact area is a number; a bucket `[from, to)` leaves open what it straddles.
 */
function sdpHolds(cmp, threshold, area) {
  const { from, to } = area;
  if (area.exact === true) {
    return {
      lt: from < threshold,
      le: from <= threshold,
      gt: from > threshold,
      ge: from >= threshold
    }[cmp];
  }
  const high = to === null || to === undefined ? Infinity : to;
  switch (cmp) {
    case 'lt':
      return high <= threshold ? true : from >= threshold ? false : undefined;
    case 'le':
      return high <= threshold ? true : from > threshold ? false : undefined;
    case 'gt':
      return from > threshold ? true : high <= threshold ? false : undefined;
    default:
      return from >= threshold ? true : high <= threshold ? false : undefined;
  }
}

/**
 * Sprint 002.24: what the project's answers say of one scoped candidate. `excluded` — an answer
 * positively puts it outside the project (the first such fact); `applies` — the answers settle that it
 * concerns the project; `needs` — an answer that would settle it is missing. A candidate no answer
 * speaks of has none of the three. Pure; never reads a candidate beyond its scope.
 */
function projectCheck(scope, nature) {
  const check = { applies: [], needs: [] };
  if (scope === undefined) return check;
  const put = (fact, state) => {
    if (state === 'excluded') check.excluded ??= fact;
    else check[state].push(fact);
  };
  if (scope.uses !== undefined) {
    const fact = { facet: 'use', ids: scope.uses };
    if (nature.use === undefined) put(fact, 'needs');
    else if (nature.use !== 'other')
      put(fact, scope.uses.includes(nature.use) ? 'applies' : 'excluded');
  }
  if (scope.works === 'extension') {
    const fact = { facet: 'works' };
    if (nature.works === undefined) put(fact, 'needs');
    else put(fact, nature.works === 'extension' ? 'applies' : 'excluded');
  }
  for (const { cmp, threshold } of scope.sdp ?? []) {
    const fact = { facet: 'sdp', cmp, threshold };
    if (nature.area === undefined) {
      put(fact, 'needs');
      continue;
    }
    const holds = sdpHolds(cmp, threshold, nature.area);
    if (holds === undefined) put(fact, 'needs');
    else put(fact, holds ? 'applies' : 'excluded');
  }
  if (scope.icpe === true) {
    const fact = { facet: 'icpe' };
    if (nature.icpe === undefined) put(fact, 'needs');
    else put(fact, nature.icpe === 'yes' ? 'applies' : 'excluded');
  }
  return check;
}

/**
 * The questions the candidates ask, and how many each could settle (`n`: the candidates scoped to
 * it). Only a question some candidate depends on is asked, at most five. The floor-area question
 * carries the thresholds the rules state, sorted. `entries` are `{ scope }`.
 */
function projectQuestionsOf(entries) {
  const count = (facet) => entries.filter((entry) => entry.scope?.[facet] !== undefined).length;
  const thresholds = [
    ...new Set(entries.flatMap((entry) => (entry.scope?.sdp ?? []).map((limit) => limit.threshold)))
  ].sort((a, b) => a - b);
  return [
    { id: 'works', n: count('works') },
    { id: 'use', n: count('uses') },
    { id: 'area', n: count('sdp'), thresholds },
    { id: 'icpe', n: count('icpe') }
  ].filter((question) => question.n > 0);
}

// ── Sprint 002.26: rules that apply without shaping the area, and readings that can be checked ──

const NETWORK_WORDS =
  /\braccord|reseau public|assainissement|eaux usees|eaux pluviales|potable|retention|debit de fuite|impermeabilis/u;
const GEOMETRY_WORDS =
  /limites? separatives?|alignement|\brecul|\bretrait|\bhauteur|\bemprise|\bdistance|\bimplant/u;
/**
 * Whether a candidate applies to the project without shaping the buildable area: the parking
 * requirements (by kind) and the connections to the networks and the rainwater management (by the
 * words of the passage, none of them about a distance, a height or a footprint). Unsure is `false`.
 */
function noDrawingOf(item) {
  if (item.kind === 'parking') return true;
  if (
    item.kind !== 'other' ||
    item.statement === 'see_graphic' ||
    item.statement === 'not_regulated'
  )
    return false;
  const text = foldText(item.passage);
  return NETWORK_WORDS.test(text) && !GEOMETRY_WORDS.test(text);
}

/** Whether the figure a limit states is written in the passage, in its unit (« 3,5 mètres », « 30 % », « 250 m2 »). */
function quantityIn(passage, limit) {
  const text = String(passage).normalize('NFKC').toLowerCase();
  const value = limit.kind === 'ratio' ? limit.percent : limit.value;
  const unit = limit.kind === 'ratio' ? 'percent' : limit.unit;
  const after =
    unit === 'percent'
      ? '\\s*(?:%|pour cent)'
      : unit === 'm2'
        ? '\\s*(?:m²|m2)(?![a-z0-9])'
        : '\\s*(?:mètres?|metres?|m)(?![a-zà-ÿ0-9²])';
  return [String(value), String(value).replace('.', ',')].some((written) =>
    new RegExp(`(?<![\\d.,])${written.replace('.', '\\.')}${after}`, 'u').test(text)
  );
}

/** A condition that only repeats the heading the sentence stands under (« Dans la zone UD et les secteurs UDa… »). */
const HEADING_CONDITION = /^(?:dans|pour|sur) (?:toute )?(?:la |le |les )?(?:zones?|secteurs?)\b/u;
const CONDITION_WORDS =
  /\b(?:si|lorsque|lorsqu|quand|a condition|sauf|hors|en dehors|au dela|uniquement|seulement|dans le cas|en cas|excepte|en l absence|pour les constructions|pour les|le long)\b/u;
/** A condition on the scale of the whole plot, which settles nothing about which rule it is. */
const SCALE_CONDITION = /^a l echelle (?:du |de l |de la )?(?:terrain|unite fonciere)\b/u;

/**
 * Whether a candidate's condition is one this knows how to read: a heading naming the plot's zone (or
 * no zone at all), the scale of the plot, a use, an extension, or a floor-area threshold the plot's
 * zone is concerned by. Anything else — « lorsqu'elle existe », « le long des linéaires de gabarit », a
 * subject that narrows the rule (« le bassin de piscine non couvert ») — is not read.
 */
function conditionReadable(condition, item, zone) {
  const folded = foldText(condition);
  if (SCALE_CONDITION.test(folded)) return true;
  if (HEADING_CONDITION.test(folded) && !CONDITION_WORDS.test(folded)) {
    const mine = foldText(zone ?? '').replace(/ /gu, '');
    const named = (folded.match(/\bu[a-z0-9]*\b/gu) ?? []).filter((word) => word !== 'une');
    return named.length === 0 || named.some((word) => mine.startsWith(word));
  }
  if (USE_ALIASES.has(folded)) return true;
  if (/sous ?destinations?|a destination d/u.test(folded))
    return usesOfCandidate(item) !== undefined;
  if (EXTENSION_SUBJECT.test(folded)) return true;
  if (SDP_CONDITION.test(folded)) return sdpOf({ conditions: [condition] }, zone).length > 0;
  return false;
}

/**
 * A reading that can be checked against its own text, and nothing else: a limit stated with a figure
 * (a value or a percentage) the passage writes in that unit, read with high confidence, with no
 * exception and no strip, whose every condition is one this reads. Pure; the project's answers
 * (a use, a floor area it depends on) are the caller's to add.
 */
function checkedReadingOf({ item, zone }) {
  if (item.statement !== 'limit' || item.confidence !== 'high' || item.sectorUnplaced === true)
    return false;
  const limit = item.limit;
  if (limit?.kind !== 'value' && limit?.kind !== 'ratio') return false;
  if (item.strip != null || item.stripRefused === true) return false;
  if ([item.passage, ...item.conditions].some(mentionsStrip)) return false;
  if (item.exceptions.length > 0) return false;
  if (!quantityIn(item.passage, limit)) return false;
  return item.conditions.every((condition) => conditionReadable(condition, item, zone));
}

/** The buckets the floor-area chips stand for: `[0, t1)`, `[t1, t2)` … `[tk, ∞)`, from the thresholds. */
function areaBucketsOf(thresholds) {
  const edges = [0, ...thresholds];
  return edges.map((from, index) => ({
    id: `b${index}`,
    from,
    to: index + 1 < edges.length ? edges[index + 1] : null
  }));
}

/** How many scoped candidates the answers positively exclude. */
const projectDecidedBy = (entries, nature) =>
  entries.filter((entry) => projectCheck(entry.scope, nature).excluded !== undefined).length;

const isAreaAnswer = (area) =>
  area !== null &&
  typeof area === 'object' &&
  Number.isFinite(area.from) &&
  area.from >= 0 &&
  area.from <= 1_000_000 &&
  (area.exact === true
    ? area.to === area.from
    : area.to === null ||
      (Number.isFinite(area.to) && area.to > area.from && area.to <= 1_000_000)) &&
  (area.exact === undefined || area.exact === true);
/** The stored `projectNature` is a record whose every member is one of the known answers. */
const isProjectNature = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (value.works === undefined || PROJECT_WORKS.includes(value.works)) &&
  (value.use === undefined || PROJECT_USES.includes(value.use)) &&
  (value.area === undefined || isAreaAnswer(value.area)) &&
  (value.icpe === undefined || value.icpe === 'yes' || value.icpe === 'no') &&
  (value.askedFor === undefined ||
    (Array.isArray(value.askedFor) &&
      value.askedFor.length <= 50 &&
      value.askedFor.every((id) => typeof id === 'string' && id.length <= 200)));
/** The answers the section holds: a record of what is known; nothing known is `{}`. */
const projectNatureOf = (section) => {
  const stored = section?.projectNature;
  if (!isProjectNature(stored)) return {};
  const { works, use, area, icpe } = stored;
  return {
    ...(works === undefined ? {} : { works }),
    ...(use === undefined ? {} : { use }),
    ...(area === undefined ? {} : { area }),
    ...(icpe === undefined ? {} : { icpe })
  };
};
const projectAskedFor = (section) =>
  isProjectNature(section?.projectNature) && Array.isArray(section.projectNature.askedFor)
    ? section.projectNature.askedFor
    : [];
/** The next section with these answers (an empty member is no member), the document marked as asked. */
function withProjectNature(section, nature, documentKey, at) {
  const asked = [
    ...new Set([
      ...projectAskedFor(section),
      ...(typeof documentKey === 'string' && documentKey !== '' ? [documentKey] : [])
    ])
  ].slice(-50);
  const { works, use, area, icpe } = nature;
  return {
    ...(section ?? {}),
    schema: SECTION_SCHEMA,
    projectNature: {
      ...(works === undefined ? {} : { works }),
      ...(use === undefined ? {} : { use }),
      ...(area === undefined ? {} : { area }),
      ...(icpe === undefined ? {} : { icpe }),
      ...(asked.length === 0 ? {} : { askedFor: asked }),
      at
    }
  };
}
/** The next section with the document marked as asked, the answers kept: « Not now ». */
const withProjectAsked = (section, documentKey, at) =>
  withProjectNature(section, projectNatureOf(section), documentKey, at);

/** The strings of a use, a kind of works and an answer, written out: every shipped key is named in the source. */
const PROJECT_WORKS_KEYS = {
  new: 'fr-urban-rules.project.works.new',
  extension: 'fr-urban-rules.project.works.extension',
  annex: 'fr-urban-rules.project.works.annex'
};
const PROJECT_USE_KEYS = {
  logement: 'fr-urban-rules.project.use.logement',
  hebergement: 'fr-urban-rules.project.use.hebergement',
  'artisanat-commerce': 'fr-urban-rules.project.use.artisanat-commerce',
  restauration: 'fr-urban-rules.project.use.restauration',
  'commerce-gros': 'fr-urban-rules.project.use.commerce-gros',
  'services-clientele': 'fr-urban-rules.project.use.services-clientele',
  hotel: 'fr-urban-rules.project.use.hotel',
  cinema: 'fr-urban-rules.project.use.cinema',
  equipements: 'fr-urban-rules.project.use.equipements',
  bureau: 'fr-urban-rules.project.use.bureau',
  industrie: 'fr-urban-rules.project.use.industrie',
  entrepot: 'fr-urban-rules.project.use.entrepot',
  'centre-congres': 'fr-urban-rules.project.use.centre-congres',
  agricole: 'fr-urban-rules.project.use.agricole',
  forestier: 'fr-urban-rules.project.use.forestier',
  other: 'fr-urban-rules.project.use.other'
};
const PROJECT_CHIP_KEYS = {
  logement: 'fr-urban-rules.project.chip.logement',
  'artisanat-commerce': 'fr-urban-rules.project.chip.artisanat-commerce',
  restauration: 'fr-urban-rules.project.chip.restauration',
  bureau: 'fr-urban-rules.project.chip.bureau',
  hotel: 'fr-urban-rules.project.chip.hotel',
  industrie: 'fr-urban-rules.project.chip.industrie',
  equipements: 'fr-urban-rules.project.chip.equipements',
  agricole: 'fr-urban-rules.project.chip.agricole',
  other: 'fr-urban-rules.project.chip.other'
};
const PROJECT_ICPE_KEYS = {
  yes: 'fr-urban-rules.project.icpe.yes',
  no: 'fr-urban-rules.project.icpe.no'
};
const PROJECT_CMP_KEYS = {
  lt: 'fr-urban-rules.project.cmp.lt',
  le: 'fr-urban-rules.project.cmp.le',
  gt: 'fr-urban-rules.project.cmp.gt',
  ge: 'fr-urban-rules.project.cmp.ge'
};
const PROJECT_FACT_KEYS = {
  excluded: {
    use: 'fr-urban-rules.project.excluded.use',
    works: 'fr-urban-rules.project.excluded.works',
    sdp: 'fr-urban-rules.project.excluded.sdp',
    icpe: 'fr-urban-rules.project.excluded.icpe'
  },
  applies: {
    use: 'fr-urban-rules.project.applies.use',
    works: 'fr-urban-rules.project.applies.works',
    sdp: 'fr-urban-rules.project.applies.sdp',
    icpe: 'fr-urban-rules.project.applies.icpe'
  },
  needs: {
    use: 'fr-urban-rules.project.needs.use',
    works: 'fr-urban-rules.project.needs.works',
    sdp: 'fr-urban-rules.project.needs.sdp',
    icpe: 'fr-urban-rules.project.needs.icpe'
  }
};
const TRIAGE_GROUP_KEYS = {
  sector: 'fr-urban-rules.triage.group.sector',
  commune: 'fr-urban-rules.triage.group.commune',
  info: 'fr-urban-rules.triage.group.info',
  folded: 'fr-urban-rules.triage.group.folded',
  project: 'fr-urban-rules.triage.group.project'
};
const PROJECT_AREA_KEYS = {
  under: 'fr-urban-rules.project.area.under',
  range: 'fr-urban-rules.project.area.range',
  over: 'fr-urban-rules.project.area.over'
};
const fillTemplate = (template, params) =>
  Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );

/** The project's floor area as the answer says it: `320 m²`, `Under 250 m²`, `250 to 500 m²`, `500 m² or more`. */
function areaWords(area, label) {
  if (area === undefined) return '';
  if (area.exact === true) return `${area.from} m²`;
  if (area.from === 0 && area.to !== null)
    return fillTemplate(label(PROJECT_AREA_KEYS.under), { to: area.to });
  if (area.to === null) return fillTemplate(label(PROJECT_AREA_KEYS.over), { from: area.from });
  return fillTemplate(label(PROJECT_AREA_KEYS.range), { from: area.from, to: area.to });
}
/**
 * Sprint 002.24: one fact of `projectCheck` as the phrase the rule's conditions show — a key of the
 * `project.<state>.<facet>` family with what it needs: the uses the rule is about, the project's own,
 * the threshold and the area. `label(key)` translates a use, a kind of works or a comparison.
 */
function projectWords(fact, state, nature, label) {
  const key = PROJECT_FACT_KEYS[state][fact.facet];
  switch (fact.facet) {
    case 'use': {
      const names = fact.ids.slice(0, 4).map((id) => label(PROJECT_USE_KEYS[id]));
      return {
        key,
        params: {
          scope: (fact.ids.length > 4 ? [...names, '…'] : names).join(', '),
          use: nature.use === undefined ? '' : label(PROJECT_USE_KEYS[nature.use])
        }
      };
    }
    case 'works':
      return {
        key,
        params: { works: nature.works === undefined ? '' : label(PROJECT_WORKS_KEYS[nature.works]) }
      };
    case 'sdp':
      return {
        key,
        params: {
          cmp: label(PROJECT_CMP_KEYS[fact.cmp]),
          threshold: fact.threshold,
          area: areaWords(nature.area, label)
        }
      };
    default:
      return { key };
  }
}

/**
 * Sprint 002.24: the questions this reading asks about the project, with what the answers stand at:
 * the questions (`questions`, each with `n` and `answered`), how many are not answered (`unanswered`),
 * how many candidates the stored answers decide (`decided`), the open ones whatever the answers say
 * (`base`), whether any answer is stored (`known`) and the document it is asked for. Pure.
 */
function projectOfferOf(planned, left) {
  const entries = planned.projectEntries ?? [];
  const nature = planned.nature ?? {};
  const answeredOf = { works: nature.works, use: nature.use, area: nature.area, icpe: nature.icpe };
  const questions = projectQuestionsOf(entries).map((question) => ({
    ...question,
    answered: answeredOf[question.id] !== undefined
  }));
  const decided = [...(planned.autoDecided ?? new Map()).values()].filter(
    (auto) => auto.group === 'project'
  ).length;
  return {
    questions,
    entries,
    nature,
    decided,
    base: left + decided,
    unanswered: questions.filter((question) => !question.answered).length,
    known: Object.keys(nature).length > 0,
    documentKey: String(planned.current?.idurba ?? '').toUpperCase(),
    asked: (planned.projectAsked ?? []).includes(
      String(planned.current?.idurba ?? '').toUpperCase()
    ),
    zone: planned.zone
  };
}

const NOT_DECIDED = 'undecided';
const PROJECT_FIELD_KEYS = {
  works: 'fr-urban-rules.project.field.works',
  use: 'fr-urban-rules.project.field.use',
  icpe: 'fr-urban-rules.project.field.icpe'
};
/** The Rules view's « Project nature » section: what is answered, what it decides, and one form to change it. */
function projectNatureSection(planned, offer, readOnly, label) {
  const { nature } = offer;
  const words = (key) => ({ key });
  const rows = [
    {
      label: words('fr-urban-rules.project.field.works'),
      value:
        nature.works === undefined
          ? words('fr-urban-rules.project.notDecided')
          : words(PROJECT_WORKS_KEYS[nature.works])
    },
    {
      label: words('fr-urban-rules.project.field.use'),
      value:
        nature.use === undefined
          ? words('fr-urban-rules.project.notDecided')
          : words(PROJECT_USE_KEYS[nature.use])
    },
    {
      label: words('fr-urban-rules.project.field.area'),
      value:
        nature.area === undefined
          ? words('fr-urban-rules.project.notDecided')
          : { text: areaWords(nature.area, label) }
    },
    ...(offer.questions.some((question) => question.id === 'icpe') || nature.icpe !== undefined
      ? [
          {
            label: words('fr-urban-rules.project.field.icpe'),
            value:
              nature.icpe === undefined
                ? words('fr-urban-rules.project.notDecided')
                : words(PROJECT_ICPE_KEYS[nature.icpe])
          }
        ]
      : [])
  ];
  const summary = [
    nature.use === undefined ? undefined : { key: PROJECT_USE_KEYS[nature.use] },
    nature.works === undefined ? undefined : { key: PROJECT_WORKS_KEYS[nature.works] },
    nature.area === undefined ? undefined : { text: areaWords(nature.area, label) }
  ].filter((part) => part !== undefined);
  const exactArea = nature.area?.exact === true ? nature.area.from : undefined;
  const choice = (id, keyOf, ids, initial) => ({
    key: id,
    label: { key: PROJECT_FIELD_KEYS[id] },
    kind: 'choice',
    required: true,
    initial: initial ?? NOT_DECIDED,
    options: [
      { value: NOT_DECIDED, label: words('fr-urban-rules.project.notDecided') },
      ...ids.map((value) => ({ value, label: words(keyOf(value)) }))
    ]
  });
  return {
    kind: 'section',
    id: 'project-nature',
    title: words('fr-urban-rules.project.heading'),
    icon: 'rules',
    summary: {
      value: summary.length === 0 ? words('fr-urban-rules.project.summary.none') : summary[0]
    },
    blocks: [
      { kind: 'fields', rows },
      ...(offer.questions.length > 0
        ? [
            {
              kind: 'notice',
              tone: 'info',
              text: {
                key: 'fr-urban-rules.project.decides',
                params: { count: offer.decided, base: offer.base }
              }
            }
          ]
        : []),
      ...(readOnly
        ? []
        : [
            {
              kind: 'actions',
              actions: [
                {
                  id: 'set-project-nature',
                  label: words('fr-urban-rules.project.action.change'),
                  fields: [
                    choice('works', (id) => PROJECT_WORKS_KEYS[id], PROJECT_WORKS, nature.works),
                    choice('use', (id) => PROJECT_USE_KEYS[id], PROJECT_USES, nature.use),
                    {
                      key: 'area',
                      label: { key: 'fr-urban-rules.project.field.area' },
                      kind: 'number',
                      unit: 'm2',
                      min: 0,
                      max: 100000,
                      ...(exactArea === undefined ? {} : { initial: exactArea })
                    },
                    ...(offer.questions.some((question) => question.id === 'icpe') ||
                    nature.icpe !== undefined
                      ? [choice('icpe', (id) => PROJECT_ICPE_KEYS[id], ['yes', 'no'], nature.icpe)]
                      : [])
                  ]
                }
              ]
            }
          ])
    ]
  };
}

/** What a « Change project nature » form says, as answers: « not decided » and an empty area are no answer. */
function natureFromValues(values, current) {
  const nature = {};
  if (PROJECT_WORKS.includes(values?.works)) nature.works = values.works;
  if (PROJECT_USES.includes(values?.use)) nature.use = values.use;
  if (values?.icpe === 'yes' || values?.icpe === 'no') nature.icpe = values.icpe;
  const area = values?.area;
  if (typeof area === 'number' && Number.isFinite(area) && area >= 0 && area <= 100000)
    nature.area = { from: area, to: area, exact: true };
  // A bucket the chips chose stays unless a number is typed.
  else if (current.area !== undefined && current.area.exact !== true) nature.area = current.area;
  return nature;
}

/**
 * Sprint 002.22 (e): the same text read for several sectors is one card showing them. Per zone:
 * which candidates fold into another (`drop`) and which sectors a kept one stands for (`also`). A
 * candidate with a decision already stored stands for the others and is never folded away.
 */
function foldedSectors(rules, keys, zone, keep, open = () => true) {
  const groups = new Map();
  rules.forEach((item, index) => {
    if (keys[index] === undefined) return;
    const identity = JSON.stringify([
      item.kind,
      item.statement,
      item.limit,
      item.strip ?? null,
      sectorsDiffer(item.sector, zone),
      // One occurrence of the text: two of the same sentence on two pages are two rules (`~2`).
      item.page,
      normalisedPassage(item.passage),
      item.conditions.map(normalisedPassage),
      item.exceptions.map(normalisedPassage)
    ]);
    groups.set(identity, [...(groups.get(identity) ?? []), index]);
  });
  const folded = new Map();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const standing = members.find((index) => keep.has(keys[index])) ?? members[0];
    const also = [
      ...new Set(
        members
          .filter((index) => index !== standing)
          .map((index) => rules[index].sector)
          .filter((sector) => typeof sector === 'string' && sector !== rules[standing].sector)
      )
    ];
    for (const index of members) if (index !== standing) folded.set(index, { drop: true });
    folded.set(standing, { also });
  }
  foldedReadings(rules, keys, zone, keep, open, folded);
  return folded;
}

/**
 * Sprint 002.26: what is still the same rule once the sectors are folded, marked `{ fold: { kind, of } }`
 * (never dropped: it is listed among the rules decided automatically, with its reason and « Rétablir »).
 * Only candidates still open (`open`: not decided by another cause) take part, and a candidate with a
 * decision stored (`keep`) stands and is never folded.
 *
 * - `duplicate`: the same sentence under another heading — same page, kind, limit, exceptions and
 *   floor-area/use scope, the passage equal without its list marker (« [a] », « [b] ») and the
 *   conditions it quotes equal; a condition the passage does not contain is a heading and decides nothing.
 * - `fragment`: a bullet cut from its sentence (« et qu'elles respectent… ») is read with the nearest
 *   candidate before it that introduces a list (« à condition »), on the same or the page before.
 * - `implied`: an unconditional minimum below (or maximum above) another of the same measure, kind and
 *   page, stated for a sector that contains the other's and that contains the plot's zone.
 */
function foldedReadings(rules, keys, zone, keep, open, folded) {
  const live = (index) =>
    keys[index] !== undefined &&
    folded.get(index)?.drop !== true &&
    folded.get(index)?.fold === undefined &&
    open(index);
  const free = (index) => live(index) && !keep.has(keys[index]);
  const mark = (index, fold) => folded.set(index, { ...(folded.get(index) ?? {}), fold });

  // A sentence folds across sectors only where both cover the plot's zone (no sector, or one the zone
  // begins with): for a zone with no sector, « UDa » and « UDa2 » stay two rules.
  const mine = foldText(zone ?? '').replace(/ /gu, '');
  const coversZone = (sector) =>
    typeof sector !== 'string' ||
    (mine !== '' && mine.startsWith(foldText(sector).replace(/ /gu, '')));
  const sentences = new Map();
  rules.forEach((item, index) => {
    if (!live(index)) return;
    const identity = JSON.stringify([
      coversZone(item.sector) ? null : item.sector,
      item.kind,
      item.statement,
      item.limit,
      item.strip ?? null,
      item.page,
      sentenceOf(item.passage),
      item.exceptions.map(sentenceOf),
      sdpOf(item, zone),
      usesOfCandidate(item) ?? null,
      item.conditions
        .filter((condition) => sentenceOf(item.passage).includes(sentenceOf(condition)))
        .map(sentenceOf)
        .sort()
    ]);
    sentences.set(identity, [...(sentences.get(identity) ?? []), index]);
  });
  for (const members of sentences.values()) {
    if (members.length < 2) continue;
    const standing = members.find((index) => keep.has(keys[index])) ?? members[0];
    for (const index of members)
      if (index !== standing && free(index)) mark(index, { kind: 'duplicate', of: standing });
  }

  rules.forEach((item, index) => {
    if (!free(index) || !FRAGMENT.test(sentenceOf(item.passage)) || item.conditions.length > 1)
      return;
    for (let back = index - 1; back >= 0; back -= 1) {
      if (!live(back)) continue;
      const parent = rules[back];
      if (FRAGMENT.test(sentenceOf(parent.passage))) continue;
      // The nearest candidate before it that is not a bullet itself, or none.
      if (
        /\ba condition\b/u.test(sentenceOf(parent.passage)) &&
        item.page - parent.page <= 1 &&
        item.page >= parent.page
      )
        mark(index, { kind: 'fragment', of: back });
      break;
    }
  });

  const impliable = (item) =>
    item.statement === 'limit' &&
    (item.limit?.kind === 'value' || item.limit?.kind === 'ratio') &&
    item.strip == null &&
    item.stripRefused !== true &&
    item.conditions.length === 0 &&
    item.exceptions.length === 0 &&
    // A table row writes its sector first (« UDa, UDa1 et UDb Au moins 30 % »): placed by its own words.
    (item.sectorUnplaced !== true ||
      sentenceOf(item.passage).startsWith(`${foldText(item.sector ?? '')} `)) &&
    item.confidence !== 'low' &&
    typeof item.sector === 'string';
  const figure = (limit) => (limit.kind === 'ratio' ? limit.percent : limit.value);
  const measure = (limit) => (limit.kind === 'ratio' ? limit.base : limit.unit);
  const sectorKey = (sector) => foldText(sector).replace(/ /gu, '');
  const candidates = rules
    .map((item, index) => index)
    .filter((index) => live(index) && impliable(rules[index]));
  for (const weak of candidates) {
    if (!free(weak)) continue;
    const w = rules[weak];
    const stronger = candidates.find((other) => {
      const s = rules[other];
      return (
        other !== weak &&
        s.kind === w.kind &&
        s.page === w.page &&
        s.limit.kind === w.limit.kind &&
        s.limit.comparison === w.limit.comparison &&
        measure(s.limit) === measure(w.limit) &&
        (w.limit.comparison === 'min'
          ? figure(s.limit) > figure(w.limit)
          : figure(s.limit) < figure(w.limit)) &&
        sectorKey(s.sector) !== sectorKey(w.sector) &&
        sectorKey(s.sector).startsWith(sectorKey(w.sector)) &&
        sectorKey(zone ?? '').startsWith(sectorKey(s.sector))
      );
    });
    if (stronger !== undefined) mark(weak, { kind: 'implied', of: stronger });
  }
}

/**
 * A passage as a sentence to compare: no accent or case, no list marker in front, and no punctuation
 * (a PDF breaks the same list with « ; » on one page and « , » on the next) except a decimal comma.
 */
const sentenceOf = (text) =>
  foldText(text)
    .replace(/^(?:\[\w+\]|\(\w+\)|[•·▪])\s*/u, '')
    .replace(/(?<!\d)[;:,.•·▪]|[;:,.•·▪](?!\d)/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
/** A bullet that begins « et … » or « ou … »: the rest of a sentence, not a rule. */
const FRAGMENT = /^(?:et|ou) /u;
/** What a fold says of the rule it folds: ruled out, grouped apart, with the page of the rule that stands. */
const FOLD_REASON_KEYS = {
  duplicate: 'fr-urban-rules.triage.reason.duplicate',
  fragment: 'fr-urban-rules.triage.reason.fragment',
  implied: 'fr-urban-rules.triage.reason.implied'
};
const foldDecisionOf = (fold, standing) => ({
  decision: 'ruled_out',
  group: 'folded',
  reason: { key: FOLD_REASON_KEYS[fold.kind], params: { page: standing.page } }
});
/** A written rule's rank in the list of what is left to decide: what shapes the area first. */
const RULE_RANK = {
  road_setback: 0,
  boundary_setback: 0,
  building_distance: 0,
  height_total: 0,
  footprint_ratio: 1,
  floor_area_max: 1,
  green_ratio: 1,
  extension_max: 1,
  annex_max: 1,
  height_facade: 1
};
const ruleRank = (rule, info) =>
  info?.provenance === 'entered'
    ? -1
    : info?.band !== undefined
      ? 0
      : (RULE_RANK[rule.kind] ?? (rule.statement === 'described' ? 3 : 2));
const isBroughtBack = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof entry.ruleKey === 'string' &&
  typeof entry.idurba === 'string' &&
  typeof entry.datvalid === 'string' &&
  (entry.plot === undefined || Array.isArray(entry.plot));

// ── Sprint 002.17: the exclusion areas of the buildable area ────────────────────

/**
 * DEC-1: the CNIG prescription types whose polygon is cut from the buildable area without being
 * asked: `01` espace boisé classé and `05` emplacement réservé (owner decision, 2026-11-03).
 * `overridable` is the way to keep a cut type in the area; no type uses it now. `02`
 * constructibilité limitée was cut with it until Sprint 002.20 (owner, 2026-11-03): it limits and
 * does not forbid, and one polygon over a whole plot (a fire-risk zone) took all the ground — it
 * is **proposed** now, like `07`.
 */
const EXCLUSION_APPLIED = { '01': { overridable: false }, '05': { overridable: false } };
/**
 * DEC-1: types that are a number or a statement, never a place to keep clear: they are not offered
 * as exclusions. Any other type with a surface (`07` patrimoine ou paysage, a code this package
 * does not name) is **proposed**: shown, cutting nothing until the user says so.
 */
const EXCLUSION_NEVER = new Set(['15', '17', '18', '22', '23', '38', '39', '42', '44']);
/** DEC-1: at most this many areas are cut at once (each is one more overlay); the rest are said. */
const EXCLUSION_MAX = 24;
/** DEC-4: the area's rings carry at most this many points; past it the area is not drawn, said as its shape. */
const AREA_POINT_LIMIT = 20_000;
const EXCLUSION_CHOICES = ['subtract', 'keep'];

/** DEC-2: one user choice on an exclusion area, as stored in `exclusionChoices`. */
const isExclusionChoice = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof entry.key === 'string' &&
  entry.key !== '' &&
  entry.key.length <= 200 &&
  EXCLUSION_CHOICES.includes(entry.choice) &&
  typeof entry.idurba === 'string' &&
  typeof entry.datvalid === 'string' &&
  (entry.plot === undefined || Array.isArray(entry.plot));
const exclusionChoicesOf = (section) =>
  Array.isArray(section?.exclusionChoices) ? section.exclusionChoices.filter(isExclusionChoice) : [];

/**
 * DEC-1 and DEC-2: the exclusion areas of a plot — the drawn prescriptions that cut, or could cut,
 * the buildable area — each with its state: `applied` (cut), `proposed` (shown, cutting nothing),
 * `kept` (a `02` the user keeps in the area), `notSurface` (a line or a point: nothing to cut) or
 * `tooMany` (past {@link EXCLUSION_MAX}). A choice made against another document version is
 * `reopened`: it decides nothing and the default stands. Pure.
 */
function exclusionItemsOf(prescriptions, choices, plot, current) {
  const items = [];
  const seen = new Set();
  for (const prescription of prescriptions ?? []) {
    const type = String(prescription.type ?? '');
    if (EXCLUSION_NEVER.has(type)) continue;
    const applied = Object.hasOwn(EXCLUSION_APPLIED, type);
    const geometry = prescription.geometry;
    const rings = (geometry?.kind === 'surface' ? geometry.rings : undefined)?.filter(
      (ring) => Array.isArray(ring) && ring.length >= 3
    );
    const surface = Array.isArray(rings) && rings.length > 0;
    // A proposed type matters as a surface only; the others are in the prescriptions view already.
    if (!surface && !applied) continue;
    const key = drawnKey(prescription);
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = choices.find((c) => c.key === key && onPlot(c, plot));
    const active = entry !== undefined && sameVersion(entry, current) ? entry : undefined;
    let state;
    if (!surface) state = 'notSurface';
    else if (applied) state = EXCLUSION_APPLIED[type].overridable && active?.choice === 'keep' ? 'kept' : 'applied';
    else state = active?.choice === 'subtract' ? 'applied' : 'proposed';
    items.push({
      key,
      type,
      state,
      reopened: entry !== undefined && active === undefined,
      chosen: active?.choice,
      overridable: applied && EXCLUSION_APPLIED[type].overridable,
      unconverted: geometry?.unconverted === true,
      label: String(prescription.libelle || prescription.txt || type),
      rings: surface ? rings : undefined
    });
  }
  // The sure ones first, then the user's own, so the cap leaves the proposals out.
  const order = { applied: 0, kept: 1, proposed: 2, notSurface: 3, tooMany: 4 };
  items.sort((a, b) => order[a.state] - order[b.state]);
  let cut = 0;
  for (const item of items) {
    if (item.state !== 'applied') continue;
    cut += 1;
    if (cut > EXCLUSION_MAX) item.state = 'tooMany';
  }
  return items;
}

/** DEC-2: the next section with a choice on one exclusion area; one entry per area and plot. */
function withExclusionChoice(section, plot, key, choice, version, at) {
  const kept = exclusionChoicesOf(section).filter((e) => !(e.key === key && samePlot(e.plot, plot)));
  return {
    ...(section ?? {}),
    schema: SECTION_SCHEMA,
    exclusionChoices: [...kept, { key, plot, choice, ...version, at }]
  };
}
function withoutExclusionChoice(section, plot, key) {
  const list = exclusionChoicesOf(section);
  const kept = list.filter((e) => !(e.key === key && samePlot(e.plot, plot)));
  if (kept.length === list.length) return undefined;
  return { ...(section ?? {}), schema: SECTION_SCHEMA, exclusionChoices: kept };
}

/**
 * Sprint 002.20: the plots whose cut areas the user has hidden — one entry per plot, kept in the
 * section with the other per-plot choices. Shown is the default, so only a hidden plot is stored.
 */
const isExclusionsHidden = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  Array.isArray(entry.plot) &&
  entry.plot.every((id) => typeof id === 'string');
const exclusionsHiddenOf = (section) =>
  Array.isArray(section?.exclusionsHidden)
    ? section.exclusionsHidden.filter(isExclusionsHidden)
    : [];
/** Whether the plot's cut areas are drawn: yes unless the user hid them. */
const exclusionsShownOn = (section, plot) =>
  !exclusionsHiddenOf(section).some((entry) => samePlot(entry.plot, plot));
function withExclusionsShown(section, plot, shown, at) {
  const kept = exclusionsHiddenOf(section).filter((entry) => !samePlot(entry.plot, plot));
  return {
    ...(section ?? {}),
    schema: SECTION_SCHEMA,
    exclusionsHidden: shown ? kept : [...kept, { plot, at }]
  };
}

/** DEC-2: an exclusion action's subject — the area's key, the choice and the document version read. */
const exclusionSubject = (item, choice, current) =>
  `k=${subjectPart(item.key)}|c=${choice}|i=${subjectPart(current.idurba)}|d=${subjectPart(current.datvalid)}`;

/**
 * DEC-2: the types the buildable-area view itself puts to the user (`07`, the one the owner named,
 * and, since Sprint 002.20, `02`: it is the view that explains what each takes of the plot);
 * every other proposed type is put in the Prescriptions view, one action each, and cuts nothing
 * until it is taken.
 */
const EXCLUSION_PUT_IN_AREA_VIEW = new Set(['07', '02']);

/**
 * DEC-2: the Prescriptions view's blocks for the areas that could be taken out of the buildable
 * area and are not asked for in its own view — a heading, a line saying they cut nothing yet, and
 * one action each. Empty when there is none.
 */
function prescriptionChoiceBlocks(exclusions, current) {
  const proposed = exclusions.filter(
    (item) => item.state === 'proposed' && !EXCLUSION_PUT_IN_AREA_VIEW.has(item.type)
  );
  if (proposed.length === 0) return [];
  return [
    { kind: 'heading', text: { key: 'fr-urban-rules.area.heading.prescriptions' } },
    { kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.area.notice.proposed' } },
    {
      kind: 'actions',
      actions: proposed.slice(0, MAX_ACTIONS).map((item) => ({
        id: 'set-exclusion',
        label: { key: 'fr-urban-rules.area.action.subtract', params: { name: cut(item.label, 80) } },
        target: { subjectId: exclusionSubject(item, 'subtract', current) }
      }))
    }
  ];
}

/** Sprint 002.10 DEC-3: the overview's line for confirmations made against an earlier document. */
const NEW_DOCUMENT_VERSION_KEY = 'fr-urban-rules.notice.newDocumentVersion';
const NEW_DOCUMENT_VERSION_UNDATED_KEY = 'fr-urban-rules.notice.newDocumentVersionUndated';

/** The undo labels, one per decision (translated by the host's `i18n`; at most 80 characters). */
const UNDO_KEYS = {
  confirm: 'fr-urban-rules.undo.confirm',
  'edit-value': 'fr-urban-rules.undo.editValue',
  'not-applicable': 'fr-urban-rules.undo.notApplicable',
  reopen: 'fr-urban-rules.undo.reopen',
  'add-distance': 'fr-urban-rules.undo.addRule',
  'add-ratio': 'fr-urban-rules.undo.addRule',
  'add-area': 'fr-urban-rules.undo.addRule',
  'edit-entered': 'fr-urban-rules.undo.editRule',
  'confirm-entered': 'fr-urban-rules.undo.confirm',
  'remove-entered': 'fr-urban-rules.undo.removeRule',
  'forget-entry': 'fr-urban-rules.undo.forget',
  'emprise-definition': 'fr-urban-rules.undo.surfaces',
  'emprise-balconies': 'fr-urban-rules.undo.surfaces',
  'building-role': 'fr-urban-rules.undo.surfaces',
  'sdp-void': 'fr-urban-rules.undo.surfaces',
  'sdp-room': 'fr-urban-rules.undo.surfaces',
  'sdp-none': 'fr-urban-rules.undo.surfaces',
  'sdp-building': 'fr-urban-rules.undo.surfaces',
  'set-edge-role': 'fr-urban-rules.undo.edgeRole',
  'forget-edge-role': 'fr-urban-rules.undo.edgeRole',
  'add-height-band': 'fr-urban-rules.undo.addRule',
  'set-exclusion': 'fr-urban-rules.undo.exclusion',
  'forget-exclusion': 'fr-urban-rules.undo.exclusion',
  'show-exclusions': 'fr-urban-rules.undo.exclusion',
  'hide-exclusions': 'fr-urban-rules.undo.exclusion',
  'set-project-nature': 'fr-urban-rules.undo.projectNature',
  'bring-back': 'fr-urban-rules.undo.bringBack',
  'confirm-batch': 'fr-urban-rules.undo.confirmBatch'
};

/** A version as stored and compared (DEC-4): `idurba` upper-cased, `datvalid` as read. */
const versionOf = (idurba, datvalid) => ({
  idurba: String(idurba ?? '').toUpperCase(),
  datvalid: String(datvalid ?? '')
});
const sameVersion = (entry, version) =>
  String(entry.idurba ?? '').toUpperCase() === version.idurba &&
  String(entry.datvalid ?? '') === version.datvalid;

/**
 * One field of a subject, escaped (review fix, NIT): a `|` or a `=` in an
 * `idurba` or a zone's name cannot split it, and each is cut to 200 characters
 * before escaping so the subject stays far below the host's 2,000.
 */
const subjectPart = (value) => encodeURIComponent(String(value ?? '').slice(0, 200));
const unescaped = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
/** A subject's fields: `key=value` parts joined by `|`, each value escaped. */
function subjectFields(subject) {
  const out = {};
  for (const part of String(subject ?? '').split('|')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at)] = unescaped(part.slice(at + 1));
  }
  return out;
}
/**
 * A rule action's subject: the version it was read against and its value,
 * opaque to the host; since 002.6b a drawn rule's kind (`k`, DEC-5 S4), which
 * its confirmation stores. A written rule's carries the version only (DEC-4).
 */
const subjectFor = (version, value, unit, kind) =>
  [
    `i=${subjectPart(version.idurba)}`,
    `d=${subjectPart(version.datvalid)}`,
    ...(value === undefined ? [] : [`v=${subjectPart(value)}`, `u=${subjectPart(unit)}`]),
    ...(kind === undefined ? [] : [`k=${subjectPart(kind)}`])
  ].join('|');
function parseSubject(subject) {
  const out = subjectFields(subject);
  return {
    version: versionOf(out.i, out.d),
    value: out.v === undefined ? undefined : Number(out.v),
    unit: SDK_UNITS.has(out.u) ? out.u : undefined,
    kind: WRITTEN_KINDS.has(out.k) ? out.k : undefined
  };
}

const isConfirmation = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof entry.ruleKey === 'string' &&
  // 002.6a DEC-4: a newer version's entry is accepted whatever it decides;
  // its shape is that version's to judge, and it is only ever kept whole.
  (isNewerRuleKey(entry.ruleKey) ||
    entry.decision === 'confirmed' ||
    entry.decision === 'not_applicable');
const isEntered = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof entry.key === 'string' &&
  Object.hasOwn(ENTERED_KINDS, entry.kind) &&
  (entry.statement === 'limit' || entry.statement === 'not_regulated') &&
  (entry.band === undefined || (entry.kind === 'height_total' && isBand(entry.band)));
/** An entry made on this plot — or on no recorded plot, which reads as this one (DEC-3). */
const onPlot = (entry, plot) => !Array.isArray(entry.plot) || samePlot(entry.plot, plot);

/** Whether two polygons (open rings) touch: a vertex inside the other, or two edges crossing. */
function ringsIntersect(a, b) {
  if (a.some((p) => insideRing(p, b)) || b.some((p) => insideRing(p, a))) return true;
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    if (clipToRing(p, q, b).length > 0) return true;
  }
  return false;
}

// ── The envelope's outline: a per-edge inset (Sprint 002.7 DEC-1) ───────────────

/** A setback's rounded end is drawn by a tangent every 15°, never inside the circle (DEC-1). */
const INSET_CAP_STEP = Math.PI / 12;
/** The validation's tolerance (step 3): half a centimetre either way, the plan's own precision. */
const INSET_TOLERANCE = 0.005;
/** DEC-1 step 3: an envelope of 1 m² or less is no ground. */
const INSET_MIN_AREA = 1;
/**
 * Each excluded strip is grown by a tenth of a millimetre, a little more for
 * each edge, so no two strips' outlines lie on one line (collinear cadastral
 * edges with one setback): the overlay below then meets no overlap. Growing
 * is stricter, never looser.
 */
const INSET_GROWTH = 1e-4;
/**
 * Past this many edges no envelope is drawn (said as its shape): the overlay
 * grows with the square of the strips' sides, a 1,000-edge boundary takes
 * about 0.4 s, and a cadastral plot has tens (the host names 500 at most).
 */
const INSET_MAX_EDGES = 1000;

const cross2 = (ax, ay, bx, by) => ax * by - ay * bx;

/** The shortest distance between two segments that do not cross (step 3's check). */
function segmentDistance(p, q, a, b) {
  return Math.min(
    pointSegmentDistance(p, a, b),
    pointSegmentDistance(q, a, b),
    pointSegmentDistance(a, p, q),
    pointSegmentDistance(b, p, q)
  );
}

/** Whether two segments cross properly: each one's ends strictly on both sides of the other. */
function segmentsCross(p, q, a, b, eps) {
  const d1 = cross2(q.easting - p.easting, q.northing - p.northing, a.easting - p.easting, a.northing - p.northing);
  const d2 = cross2(q.easting - p.easting, q.northing - p.northing, b.easting - p.easting, b.northing - p.northing);
  const d3 = cross2(b.easting - a.easting, b.northing - a.northing, p.easting - a.easting, p.northing - a.northing);
  const d4 = cross2(b.easting - a.easting, b.northing - a.northing, q.easting - a.easting, q.northing - a.northing);
  const lp = Math.hypot(q.easting - p.easting, q.northing - p.northing);
  const la = Math.hypot(b.easting - a.easting, b.northing - a.northing);
  // Signed distances, so the tolerance is in metres whatever the segments' lengths.
  const s1 = d1 / (lp || 1);
  const s2 = d2 / (lp || 1);
  const s3 = d3 / (la || 1);
  const s4 = d4 / (la || 1);
  return (
    ((s1 > eps && s2 < -eps) || (s1 < -eps && s2 > eps)) &&
    ((s3 > eps && s4 < -eps) || (s3 < -eps && s4 > eps))
  );
}

/** The convex hull of `{ x, y }` points, counter-clockwise, without collinear points. */
function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o, a, b) => cross2(a.x - o.x, a.y - o.y, b.x - o.x, b.y - o.y);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out.at(-2), out.at(-1), p) <= 1e-12) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/**
 * The region `P` less the shapes `cuts`, by overlay: every outline cut where it
 * crosses another, each piece kept where the region lies on one side of it and
 * not the other, the pieces chained into loops (region on the left). A cut is
 * one polygon (`{ x, y }` points) or, since Sprint 002.17, a **group of rings**
 * read even–odd — a ring inside another is a hole in it — so an exclusion area
 * need not be convex (the setbacks' strips still are). `{ loops }`
 * (counter-clockwise outers, clockwise holes, `{ x, y }` points) or
 * `{ degenerate: true }` when two outlines overlap along a line.
 */
function regionLess(P, cutShapes) {
  // A cut is a group of rings; a bare polygon is a group of one.
  const cuts = cutShapes.map((cut) => (Array.isArray(cut[0]) ? cut : [cut]));
  for (const group of cuts) {
    const all = group.flat();
    group.minX = Math.min(...all.map((q) => q.x));
    group.maxX = Math.max(...all.map((q) => q.x));
    group.minY = Math.min(...all.map((q) => q.y));
    group.maxY = Math.max(...all.map((q) => q.y));
  }
  const xs = [];
  const ys = [];
  const vertex = (p) => {
    xs.push(p.x);
    ys.push(p.y);
    return xs.length - 1;
  };
  const parent = [];
  const find = (i) => {
    while (parent[i] !== undefined && parent[i] !== i) i = parent[i];
    return i;
  };
  const union = (i, j) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const segments = [];
  const outline = (polygon) => {
    const ids = polygon.map(vertex);
    ids.forEach((id, k) => {
      const next = ids[(k + 1) % ids.length];
      segments.push({ a: id, b: next, cuts: [] });
    });
  };
  outline(P);
  for (const group of cuts) for (const ring of group) outline(ring);
  for (const s of segments) {
    s.minX = Math.min(xs[s.a], xs[s.b]);
    s.maxX = Math.max(xs[s.a], xs[s.b]);
    s.minY = Math.min(ys[s.a], ys[s.b]);
    s.maxY = Math.max(ys[s.a], ys[s.b]);
  }
  // Sweep along x: only segments whose spans overlap are compared.
  const order = segments.map((s, k) => k).sort((i, j) => segments[i].minX - segments[j].minX);
  const EPS = 1e-9;
  let degenerate = false;
  for (let oi = 0; oi < order.length && !degenerate; oi += 1) {
    const s = segments[order[oi]];
    for (let oj = oi + 1; oj < order.length; oj += 1) {
      const t = segments[order[oj]];
      if (t.minX > s.maxX + EPS) break;
      if (t.minY > s.maxY + EPS || t.maxY < s.minY - EPS) continue;
      if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;
      const ax = xs[s.a];
      const ay = ys[s.a];
      const rx = xs[s.b] - ax;
      const ry = ys[s.b] - ay;
      const cx = xs[t.a];
      const cy = ys[t.a];
      const sx = xs[t.b] - cx;
      const sy = ys[t.b] - cy;
      const lr = Math.hypot(rx, ry);
      const ls = Math.hypot(sx, sy);
      const den = cross2(rx, ry, sx, sy);
      if (Math.abs(den) <= 1e-12 * lr * ls) {
        // Parallel: an overlap along one line is degenerate; anything else, no crossing.
        if (Math.abs(cross2(cx - ax, cy - ay, rx, ry)) / lr > EPS) continue;
        const t0 = ((cx - ax) * rx + (cy - ay) * ry) / (lr * lr);
        const t1 = t0 + (sx * rx + sy * ry) / (lr * lr);
        if (Math.max(t0, t1) < -EPS / lr || Math.min(t0, t1) > 1 + EPS / lr) continue;
        degenerate = true;
        break;
      }
      const tt = cross2(cx - ax, cy - ay, sx, sy) / den;
      const uu = cross2(cx - ax, cy - ay, rx, ry) / den;
      const et = EPS / lr;
      const eu = EPS / ls;
      if (tt < -et || tt > 1 + et || uu < -eu || uu > 1 + eu) continue;
      const sEnd = tt <= et ? s.a : tt >= 1 - et ? s.b : undefined;
      const tEnd = uu <= eu ? t.a : uu >= 1 - eu ? t.b : undefined;
      if (sEnd !== undefined && tEnd !== undefined) union(sEnd, tEnd);
      else if (sEnd !== undefined) t.cuts.push({ t: uu, id: sEnd });
      else if (tEnd !== undefined) s.cuts.push({ t: tt, id: tEnd });
      else {
        const id = vertex({ x: ax + tt * rx, y: ay + tt * ry });
        s.cuts.push({ t: tt, id });
        t.cuts.push({ t: uu, id });
      }
    }
  }
  if (degenerate) return { degenerate: true };

  const inside = (x, y) => {
    let within = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i, i += 1) {
      const a = P[i];
      const b = P[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) within = !within;
    }
    if (!within) return false;
    return !cuts.some((group) => {
      if (x < group.minX || x > group.maxX || y < group.minY || y > group.maxY) return false;
      let within = false;
      for (const K of group) {
        for (let i = 0, j = K.length - 1; i < K.length; j = i, i += 1) {
          const a = K[i];
          const b = K[j];
          if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
            within = !within;
        }
      }
      return within;
    });
  };
  // The pieces on the region's outline, oriented with the region on their left.
  const out = new Map();
  const seen = new Set();
  const pieces = [];
  for (const s of segments) {
    const ids = [s.a, ...s.cuts.sort((p, q) => p.t - q.t).map((c) => c.id), s.b].map(find);
    for (let k = 0; k + 1 < ids.length; k += 1) {
      const p = ids[k];
      const q = ids[k + 1];
      if (p === q) continue;
      const key = p < q ? `${p}:${q}` : `${q}:${p}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dx = xs[q] - xs[p];
      const dy = ys[q] - ys[p];
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;
      const delta = Math.min(1e-6, length / 4);
      const mx = (xs[p] + xs[q]) / 2;
      const my = (ys[p] + ys[q]) / 2;
      const left = inside(mx - (dy / length) * delta, my + (dx / length) * delta);
      const right = inside(mx + (dy / length) * delta, my - (dx / length) * delta);
      if (left === right) continue;
      const [from, to] = left ? [p, q] : [q, p];
      const piece = { from, to, used: false };
      pieces.push(piece);
      if (!out.has(from)) out.set(from, []);
      out.get(from).push(piece);
    }
  }
  const loops = [];
  for (const first of pieces) {
    if (first.used) continue;
    const loop = [];
    let piece = first;
    for (let guard = 0; guard <= pieces.length; guard += 1) {
      piece.used = true;
      loop.push({ x: xs[piece.from], y: ys[piece.from] });
      if (piece.to === first.from) break;
      const candidates = (out.get(piece.to) ?? []).filter((c) => !c.used);
      if (candidates.length === 0) return { degenerate: true };
      // Where the region touches itself, the sharpest left turn keeps each loop simple.
      const ix = xs[piece.to] - xs[piece.from];
      const iy = ys[piece.to] - ys[piece.from];
      const turnOf = (c) =>
        Math.atan2(
          cross2(ix, iy, xs[c.to] - xs[c.from], ys[c.to] - ys[c.from]),
          ix * (xs[c.to] - xs[c.from]) + iy * (ys[c.to] - ys[c.from])
        );
      piece = candidates.reduce((best, c) => (turnOf(c) > turnOf(best) ? c : best));
    }
    if (piece.to !== first.from) return { degenerate: true };
    // Points along one straight line are one side.
    const kept = loop.filter((p, k) => {
      const a = loop[(k + loop.length - 1) % loop.length];
      const b = loop[(k + 1) % loop.length];
      const ab = Math.hypot(b.x - a.x, b.y - a.y);
      return ab === 0 || Math.abs(cross2(p.x - a.x, p.y - a.y, b.x - a.x, b.y - a.y)) / ab > 1e-9;
    });
    loops.push(kept);
  }
  return { loops };
}

/**
 * DEC-1: the Site boundary inset by one distance per edge — `distances[i]` for
 * the edge from `ring[i]` to `ring[i + 1]` (an open ring, either winding) —
 * on a concave boundary as on a convex one. Answers `{ ring, reentrant }` (one
 * counter-clockwise ring) or `{ failed: 'collapsed' | 'shape' }`.
 *
 * The rule's set, "at least `d` from the limit", is the boundary less each
 * edge's strip: every point within `d` of the edge, rounded at its ends. The
 * strips are cut from the boundary by overlay (review 2026-10-21: the mitred
 * offset with edge collapse this replaced refused or misread about one plot in
 * ten among random cadastral shapes, saying "no ground" where hundreds of m²
 * were left).
 *
 * - **A strip's rounded end** is drawn by tangents every 15°, just outside the
 *   circle, so the outline stands just inside the rounded line — stricter than
 *   the rule (assumption `envelope-reentrant-corners`).
 * - **`lines[i]`** (a street edge): the alignment continues past the plot, so
 *   at a convex corner the strip runs on along its line as far as the plot
 *   reaches — the half-plane cut of 002.2, exact on a convex boundary. A side
 *   or rear limit ends at its corner, so its strip ends rounded there.
 * - **Validated**: simple rings inside the boundary, more than 1 m², no
 *   point closer to an edge than its distance (half a centimetre's
 *   tolerance). `collapsed` when nothing over 1 m² is left; `shape` when the
 *   check fails — never a silent absence (the caller says which).
 *
 * Sprint 002.17: `exclusions` — areas cut out too, each one a list of rings
 * (`{ easting, northing }` points, a ring inside another a hole in it, any
 * winding, any shape). The answer is `{ rings, reentrant }`: every piece's
 * outline counter-clockwise and every hole clockwise, so **several pieces and
 * holes are answered, not refused** (a setback that splits the plot gives two
 * pieces); `ring` is also present when the answer is one piece with no hole,
 * as before. An exclusion that lies along a boundary edge is shifted a tenth
 * of a millimetre when the overlay meets the overlap.
 */
function insetByRole(ring, distances, lines = [], exclusions = []) {
  let points = ring.map((p) => ({ easting: p.easting, northing: p.northing }));
  let ds = points.map((p, i) => {
    const d = Number(distances[i]);
    return Number.isFinite(d) && d > 0 ? d : 0;
  });
  let along = points.map((p, i) => lines[i] === true);
  if (points.length < 3) return { failed: 'shape' };
  // A zero-length edge is no edge: its neighbours meet at its point.
  for (let i = 0; i < points.length && points.length >= 3; ) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (Math.hypot(b.easting - a.easting, b.northing - a.northing) < 1e-6) {
      points.splice((i + 1) % points.length, 1);
      ds.splice(i, 1);
      along.splice(i, 1);
    } else i += 1;
  }
  if (points.length < 3 || points.length > INSET_MAX_EDGES) return { failed: 'shape' };
  if (signedRingArea(points) < 0) {
    // Clockwise: walk it the other way; edge k of the reversed ring is edge n-2-k reversed.
    const n = points.length;
    const [originalDs, originalAlong] = [ds, along];
    points = [...points].reverse();
    ds = points.map((p, k) => originalDs[(2 * n - 2 - k) % n]);
    along = points.map((p, k) => originalAlong[(2 * n - 2 - k) % n]);
  }
  const n = points.length;
  // A local frame: Lambert-93 coordinates run to millions of metres.
  const origin = points[0];
  const P = points.map((p) => ({ x: p.easting - origin.easting, y: p.northing - origin.northing }));
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % n];
    const length = Math.hypot(b.easting - a.easting, b.northing - a.northing);
    const u = { x: (b.easting - a.easting) / length, y: (b.northing - a.northing) / length };
    return { a, b, la: P[i], lb: P[(i + 1) % n], u, normal: { x: -u.y, y: u.x }, d: ds[i], line: along[i] };
  });
  const span = Math.hypot(
    Math.max(...P.map((p) => p.x)) - Math.min(...P.map((p) => p.x)),
    Math.max(...P.map((p) => p.y)) - Math.min(...P.map((p) => p.y))
  );
  // Sprint 002.17: the exclusions, in the local frame (an open ring each, never fewer than three points).
  const excluded = exclusions
    .map((group) =>
      group
        .map((r) => openRing(r).map((q) => ({ x: q.easting - origin.easting, y: q.northing - origin.northing })))
        .filter((r) => r.length >= 3)
    )
    .filter((group) => group.length > 0);
  /** The turn at the corner from `from` to `to`, in (−π, π]: positive where it is convex. */
  const turnAt = (from, to) => Math.atan2(cross2(from.u.x, from.u.y, to.u.x, to.u.y), from.u.x * to.u.x + from.u.y * to.u.y);

  // Rounded somewhere the rule's line is: a re-entrant corner, or a convex one
  // past 90° where a side or rear limit with the larger distance ends.
  let reentrant = false;
  for (let i = 0; i < n; i += 1) {
    const prev = edges[(i + n - 1) % n];
    const edge = edges[i];
    const D = Math.max(prev.d, edge.d);
    if (!(D > 0)) continue;
    const turn = turnAt(prev, edge);
    const larger = prev.d >= edge.d ? prev : edge;
    if (turn <= 1e-9 || (turn < Math.PI / 2 && !larger.line && Math.abs(prev.d - edge.d) > 1e-9))
      reentrant = true;
  }

  const attempt = (growth, shift = 0, sx = 1, sy = 0.7) => {
    const cuts = [];
    // An exclusion along an edge is moved by `shift` metres — each by its own multiple, so two that
    // lie along one another part too — so no two outlines lie on one line.
    excluded.forEach((group, k) => {
      const m = shift * (1 + ((k * 0.6180339887) % 1));
      cuts.push(group.map((r) => r.map((q) => ({ x: q.x + m * sx, y: q.y + m * sy }))));
    });
    edges.forEach((edge, i) => {
      if (!(edge.d > 0)) return;
      const r = edge.d + growth * (1 + ((i * 0.6180339887) % 1));
      const R = r / Math.cos(INSET_CAP_STEP / 2);
      const phi = Math.atan2(edge.normal.y, edge.normal.x);
      const steps = Math.round(Math.PI / INSET_CAP_STEP);
      const shape = [];
      for (let j = 0; j < steps; j += 1) {
        const atB = phi - (j + 0.5) * INSET_CAP_STEP;
        shape.push({ x: edge.lb.x + R * Math.cos(atB), y: edge.lb.y + R * Math.sin(atB) });
        const atA = phi + Math.PI - (j + 0.5) * INSET_CAP_STEP;
        shape.push({ x: edge.la.x + R * Math.cos(atA), y: edge.la.y + R * Math.sin(atA) });
      }
      if (edge.line) {
        // The alignment runs on past a convex corner, as far as the plot can reach within r of it.
        const reach = (turn) =>
          turn > 1e-9 && turn < Math.PI / 2 ? Math.min(r / Math.tan(turn), 2 * span) : 0;
        const after = reach(turnAt(edge, edges[(i + 1) % n]));
        const before = reach(turnAt(edges[(i + n - 1) % n], edge));
        for (const side of [-1, 1]) {
          const nx = edge.normal.x * r * side;
          const ny = edge.normal.y * r * side;
          if (after > 0)
            shape.push({ x: edge.lb.x + edge.u.x * after + nx, y: edge.lb.y + edge.u.y * after + ny });
          if (before > 0)
            shape.push({ x: edge.la.x - edge.u.x * before + nx, y: edge.la.y - edge.u.y * before + ny });
        }
      }
      const hull = convexHull(shape);
      hull.minX = Math.min(...hull.map((p) => p.x));
      hull.maxX = Math.max(...hull.map((p) => p.x));
      hull.minY = Math.min(...hull.map((p) => p.y));
      hull.maxY = Math.max(...hull.map((p) => p.y));
      cuts.push(hull);
    });
    return regionLess(P, cuts);
  };
  let region = attempt(INSET_GROWTH);
  if (region.degenerate) {
    // Two outlines lie on one line: grow the strips a little more and, with exclusions, move them
    // by a tenth of a millimetre — in each of four directions, keeping the answer with the fewest
    // loops (an exclusion along the boundary comes out as a notch, not as a hole a hair inside it).
    const shifts = excluded.length > 0 ? [[1, 0.7], [-1, -0.7], [1, -0.7], [-1, 0.7]] : [[0, 0]];
    let best;
    for (let k = 2; k <= 4 && best === undefined; k += 1) {
      for (const [sx, sy] of shifts) {
        const answer = attempt(INSET_GROWTH * k * 1.37, excluded.length > 0 ? INSET_GROWTH * k * 0.83 : 0, sx, sy);
        if (answer.degenerate) continue;
        if (best === undefined || answer.loops.length < best.loops.length) best = answer;
      }
    }
    region = best ?? { degenerate: true };
  }
  if (region.degenerate) return { failed: 'shape' };
  const areaOf = (loop) =>
    loop.reduce((sum, a, i) => {
      const b = loop[(i + 1) % loop.length];
      return sum + cross2(a.x, a.y, b.x, b.y);
    }, 0) / 2;
  // With no exclusion no hole can form (every strip touches the boundary); one found is a shape
  // this cannot draw. An exclusion makes holes: those under 1 m² are dropped with the slivers.
  if (excluded.length === 0 && region.loops.some((loop) => areaOf(loop) < -1e-6))
    return { failed: 'shape' };
  const outers = region.loops.filter((loop) => loop.length >= 3 && areaOf(loop) > INSET_MIN_AREA);
  if (outers.length === 0) return { failed: 'collapsed' };
  const holes = region.loops.filter((loop) => loop.length >= 3 && areaOf(loop) < -1e-6);
  const toSite = (loop) => loop.map((q) => ({ easting: q.x + origin.easting, northing: q.y + origin.northing }));
  const rings = [...outers, ...holes].map(toSite);

  // Validated against the boundary itself, whatever the overlay did.
  for (const result of rings) {
    const m = result.length;
    for (let i = 0; i < m; i += 1) {
      const p = result[i];
      const q = result[(i + 1) % m];
      const onBoundary = edges.some((e) => pointSegmentDistance(p, e.a, e.b) <= INSET_TOLERANCE);
      if (!onBoundary && !insideRing(p, points)) return { failed: 'shape' };
      for (const e of edges) {
        if (segmentsCross(p, q, e.a, e.b, INSET_TOLERANCE)) return { failed: 'shape' };
        // …never closer to an edge than its distance.
        if (e.d > 0 && segmentDistance(p, q, e.a, e.b) < e.d - INSET_TOLERANCE) return { failed: 'shape' };
      }
    }
  }
  return {
    rings,
    ...(rings.length === 1 ? { ring: rings[0] } : {}),
    reentrant
  };
}

/**
 * Sprint 002.20: the part of an exclusion area that lies on the plot, as rings (`{ easting,
 * northing }`, pieces counter-clockwise, holes clockwise), or `undefined` when none does (or the
 * overlay cannot tell). Two overlays and no new geometry: the boundary less the area, then the
 * boundary less that — the area's own part of it. An area is often a forest or a zone far larger
 * than the plot; drawn whole it would fill the 3D view's vertex budget and say nothing of the plot.
 */
function clippedToBoundary(boundary, rings) {
  const none = boundary.map(() => 0);
  const outside = insetByRole(boundary, none, [], [rings]);
  // Nothing of the plot is left outside the area: all of the plot is the area.
  if (outside.failed === 'collapsed')
    return [boundary.map((p) => ({ easting: p.easting, northing: p.northing }))];
  if (outside.rings === undefined) return undefined;
  return insetByRole(boundary, none, [], [outside.rings]).rings;
}

/**
 * 096.9 DEC-2's limits on a volume, mirrored here (Sprint 002.7 DEC-2): the
 * host drops a volume **whole** for one malformed part, and refuses a report
 * past 16 volumes, so the extension checks its own volume before sending it.
 */
const VOLUME_LIMITS = { ceilings: 8, rise: 20, metres: 500, start: 500, volumes: 16 };

// ── The regulation sheet's content (Sprint 002.7 DEC-5) ──────────────────────────

/** DEC-5 block 6: the plot plan's layers (the host draws them; the zone outline only). */
const PLOT_PLAN_CATEGORIES = [
  'zone',
  'prescription',
  'easement',
  'risk',
  'alignment',
  'setback-band',
  'envelope'
];

/**
 * DEC-5: the regulation sheet — the plot, the flags, a notice when the plan is
 * not on the GPU or a source failed, the checks with every rule not checked,
 * the host-counted rules meter, the plot plan and the assumptions; the scope
 * sentence. Pure: everything comes from the report, the Site view and what the
 * read noted beside the report. The host prints its own header (document,
 * version, read time) and footer (sources, attribution, its scope sentence),
 * so neither is repeated here (096.10 DEC-4).
 *
 * DEC-6: every figure travels as a quantity or verbatim text, never as a
 * phrase parameter — a number in `params` is formatted by the host's message
 * formatter, which groups it with U+202F in French, a glyph the print font
 * lacks.
 *
 * Absent (`undefined`) when the regime is `unknown` and nothing was read: the
 * host then offers no sheet (096.10 DEC-2).
 */
function sheetOf(report, { site, zones = [] } = {}) {
  const regime = report?.regime?.code;
  if (regime === undefined) return undefined;
  const read =
    report.features.length > 0 ||
    report.flags.length > 0 ||
    report.rules.length > 0 ||
    report.zones.length > 0;
  if (regime === 'unknown' && !read) return undefined;
  const overviewRows = (report.overview ?? [])
    .filter((b) => b.kind === 'fields')
    .flatMap((b) => b.rows);
  const overviewValue = (...keys) => overviewRows.find((r) => keys.includes(r.label?.key))?.value;

  const rows = [];
  const commune = overviewValue('fr-urban-rules.field.commune');
  if (commune !== undefined)
    rows.push({ label: { key: 'fr-urban-rules.field.commune' }, value: commune });
  const parcels = [
    ...new Set((site?.parcels ?? []).map((p) => String(p.featureId ?? '')).filter(Boolean))
  ];
  if (parcels.length > 0)
    rows.push({
      label: { key: 'fr-urban-rules.sheet.field.parcels' },
      value: { text: cut(parcels.join(', '), SHORT) }
    });
  if (typeof site?.plotArea === 'number' && site.plotArea > 0)
    rows.push({
      label: { key: 'fr-urban-rules.sheet.field.plotArea' },
      value: { value: Math.round(site.plotArea * 10) / 10, unit: 'm2' }
    });
  const zoneValue = overviewValue('fr-urban-rules.field.zone', 'fr-urban-rules.field.sector');
  if (zoneValue !== undefined)
    rows.push({
      label: {
        key: regime === 'cc' ? 'fr-urban-rules.field.sector' : 'fr-urban-rules.field.zone'
      },
      value: zoneValue
    });
  // Gordes (002.2 DEC-4): a zone's `datvalid` is not its document's; said when they differ.
  const zoneDate = isoDate(zones.find((z) => z.datvalid !== undefined)?.datvalid ?? '');
  if (zoneDate !== undefined && zoneDate !== report.document?.validFrom)
    rows.push({
      label: { key: 'fr-urban-rules.sheet.field.zoneDate' },
      value: { text: zoneDate }
    });

  const blocks = [{ kind: 'heading', text: { key: 'fr-urban-rules.sheet.heading.plot' } }];
  if (rows.length > 0) blocks.push({ kind: 'fields', rows });
  blocks.push({ kind: 'flags' });
  if (regime === 'not_published') {
    blocks.push({
      kind: 'notice',
      tone: 'warning',
      text: { key: 'fr-urban-rules.sheet.notice.notPublished' }
    });
  }
  if (regime === 'unknown' || report.sources.some((s) => s.state === 'unavailable')) {
    blocks.push({
      kind: 'notice',
      tone: 'warning',
      text: { key: 'fr-urban-rules.sheet.notice.sourceFailed' }
    });
  }
  blocks.push({ kind: 'heading', text: { key: 'fr-urban-rules.sheet.heading.rules' } });
  blocks.push({ kind: 'checks', unchecked: true });
  // ADR-0111 Rule 10: the host counts the rules by status; no count travels beside them.
  blocks.push({ kind: 'meter', rules: true });
  blocks.push({
    kind: 'plot-plan',
    categories: PLOT_PLAN_CATEGORIES,
    caption: { key: 'fr-urban-rules.sheet.plotPlan.caption' }
  });
  // The host titles the list itself ("Assumptions"): no heading of ours (walk, 2026-10-21).
  if (report.assumptions.length > 0) blocks.push({ kind: 'assumptions' });
  return {
    title: { key: 'fr-urban-rules.sheet.title' },
    blocks,
    scope: { key: 'fr-urban-rules.sheet.scope' }
  };
}

/** The parser's kinds as the SDK's rule kinds. */
const REGULATION_RULE_KIND_OF = {
  height_total: 'height_total',
  height_facade: 'height_facade',
  road_setback: 'road_setback',
  footprint_ratio: 'footprint_ratio',
  floor_area_max: 'floor_area_max',
  green_ratio: 'green_ratio',
  parking: 'parking',
  other: 'other'
};
const UNIT_SYMBOLS = { m: 'm', m2: 'm²', percent: '%' };
/** A façade's orientation in a check's label: a letter, the same in every language here. */
const FACADE_LETTERS = { north: 'N', east: 'E', south: 'S', west: 'W' };

/** An entered rule's random key part: hex from the platform's CSPRNG. */
function randomHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

// ── Surfaces and capacity: constants (Sprint 002.3) ─────────────────────────────

/** A plain object (not an array, not null): what a section member must be. */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** DEC-5: the editor's default storey height, when the storeys' own is not shown (platform `DEFAULT_LEVEL_HEIGHT`). */
const DEFAULT_FLOOR_TO_FLOOR = 3;

/**
 * DEC-6, step 1: the procedure articles, each read on Légifrance on
 * 2026-10-20 (`readOn`) — its `LEGIARTI` in force and the date that version
 * came into force (`versionFrom`) — with the text from DILA's LEGI export
 * (2025-07-13) checked against the live page. R.421-17 had a newer version
 * live (décret 2026-117, in force 2026-02-22) than the export: its f), the
 * paragraph read here, is unchanged (live page compared word for word).
 * R.421-13 (added by the review, 2026-10-20) likewise: a newer version live,
 * its opening paragraph and a) b) — what is cited — unchanged. The
 * record is `test-fixtures/fr-urban-rules/legi-articles.json` (`sprint002_3`).
 */
const PROCEDURE_ARTICLES = {
  'R.420-1': { legiarti: 'LEGIARTI000028678466', versionFrom: '2014-04-01', readOn: '2026-10-20' },
  'R.111-22': { legiarti: 'LEGIARTI000031721274', versionFrom: '2016-01-01', readOn: '2026-10-20' },
  'R.421-1': { legiarti: 'LEGIARTI000051190132', versionFrom: '2025-02-19', readOn: '2026-10-20' },
  'R.421-2': { legiarti: 'LEGIARTI000050497056', versionFrom: '2024-11-16', readOn: '2026-10-20' },
  'R.421-9': { legiarti: 'LEGIARTI000050497051', versionFrom: '2024-11-16', readOn: '2026-10-20' },
  'R.421-11': { legiarti: 'LEGIARTI000050497040', versionFrom: '2024-11-16', readOn: '2026-10-20' },
  'R.421-13': { legiarti: 'LEGIARTI000053561283', versionFrom: '2026-02-22', readOn: '2026-10-20' },
  'R.421-14': { legiarti: 'LEGIARTI000031764577', versionFrom: '2016-01-01', readOn: '2026-10-20' },
  'R.421-17': { legiarti: 'LEGIARTI000053561259', versionFrom: '2026-02-22', readOn: '2026-10-20' },
  'L.431-1': { legiarti: 'LEGIARTI000006815974', versionFrom: '2007-10-01', readOn: '2026-10-20' },
  'L.431-3': { legiarti: 'LEGIARTI000037667650', versionFrom: '2018-11-25', readOn: '2026-10-20' },
  'R.431-2': { legiarti: 'LEGIARTI000038682379', versionFrom: '2019-06-23', readOn: '2026-10-20' }
};

/**
 * DEC-6: the thresholds, each from an article above, read on 2026-10-20.
 *
 * - `tiny` 5 m², `small` 20 m², `height` 12 m: R.421-2 a), R.421-9 a),
 *   R.421-11 I a) (new constructions, emprise **or** surface de plancher);
 *   R.421-14 a) and R.421-17 f) (works on an existing building).
 * - `uZone` 40 m²: R.421-14 b) and R.421-17 f), in a zone urbaine of a PLU or
 *   a document in its place — and not when the works take the whole past one
 *   of R.431-2's ceilings.
 * - `architect` 150 m²: R.431-2 a), a construction other than agricultural
 *   whose **surface de plancher** exceeds it (L.431-3 caps the decree there).
 *   Step 1 found the sprint's "both SdP and emprise" wording in b) and c) only
 *   (agricultural buildings, greenhouses), never in a): correction 1 was wrong.
 * - `architectEmpriseVerified` false: R.431-2's last paragraph sends works on
 *   an existing building to an architect when "soit la surface de plancher,
 *   soit l'emprise au sol de l'ensemble" passes "l'un des plafonds" — and a)'s
 *   only ceiling is one of surface de plancher. Whether 150 m² of emprise alone
 *   does it is a reading the text does not settle: shown "to verify", no flag.
 */
const PROCEDURE_THRESHOLDS = {
  tiny: 5,
  small: 20,
  height: 12,
  uZone: 40,
  architect: 150,
  architectEmpriseVerified: false
};

/** Literal keys, so every key the source names stays findable (002.0 criterion 2's test). */
const CAP_SUBJECT_KEYS = {
  extension_max: 'fr-urban-rules.check.subject.extension_max',
  annex_max: 'fr-urban-rules.check.subject.annex_max',
  floor_area_max: 'fr-urban-rules.check.subject.floor_area_max'
};
const SDP_LINE_KEYS = {
  1: 'fr-urban-rules.surfaces.sdp.line1',
  2: 'fr-urban-rules.surfaces.sdp.line2',
  3: 'fr-urban-rules.surfaces.sdp.line3',
  4: 'fr-urban-rules.surfaces.sdp.line4',
  5: 'fr-urban-rules.surfaces.sdp.line5',
  6: 'fr-urban-rules.surfaces.sdp.line6',
  7: 'fr-urban-rules.surfaces.sdp.line7',
  8: 'fr-urban-rules.surfaces.sdp.line8'
};
const COUNT_KEYS = {
  upperStoreys: 'fr-urban-rules.surfaces.counts.upperStoreys',
  roofOverhangs: 'fr-urban-rules.surfaces.counts.roofOverhangs',
  balconies: 'fr-urban-rules.surfaces.counts.balconies',
  lightweight: 'fr-urban-rules.surfaces.counts.lightweight'
};
const DEFINITION_KEYS = {
  'r420-1': 'fr-urban-rules.surfaces.definition.r420-1',
  lexicon: 'fr-urban-rules.surfaces.definition.lexicon',
  'all-overhangs': 'fr-urban-rules.surfaces.definition.all-overhangs'
};
const ROLE_LABEL_KEYS = {
  extension: 'fr-urban-rules.surfaces.role.extension',
  annex: 'fr-urban-rules.surfaces.role.annex',
  none: 'fr-urban-rules.surfaces.role.none'
};
const DEDUCTION_KEYS = {
  parking: 'fr-urban-rules.surfaces.deduction.parking',
  attics: 'fr-urban-rules.surfaces.deduction.attics',
  technical: 'fr-urban-rules.surfaces.deduction.technical',
  cellars: 'fr-urban-rules.surfaces.deduction.cellars'
};
const QUESTION_KEYS = {
  collective: 'fr-urban-rules.surfaces.question.collective',
  served: 'fr-urban-rules.surfaces.question.served'
};
const PROCEDURE_KEYS = {
  none: 'fr-urban-rules.surfaces.procedure.none',
  declaration: 'fr-urban-rules.surfaces.procedure.declaration',
  permit: 'fr-urban-rules.surfaces.procedure.permit'
};

/** DEC-8: the retired package's planning stage, which only runs while it is enabled. */
const RETIRED_STAGE_ID = 'urban-rules.programme';

function createRnu({
  fetchEl7 = async () => ({ features: [], retrievedAt: new Date().toISOString() }),
  site: siteOf,
  roads: roadsOf,
  packageData,
  document: documentOf,
  mapFeatures: mapFeaturesOf = () => undefined,
  ai: aiOf = () => undefined,
  translate,
  now,
  log
}) {
  /** Sprint 002.24: a use, a kind of works or a comparison, in the language the host speaks (the key when none answers). */
  const projectLabel = (key) => translate(key) ?? key;
  /** Ring digest → `{ segments } | { refused }` (DEC-4): per Site boundary, per session. */
  const roadCache = new Map();
  /**
   * 002.6b DEC-4 (B1): written rule id → `{ rule, version, zone, citation }`,
   * as the last read showed them. The one reading an action needs: a written
   * rule's passage cannot ride in its subject. Gone → « read again ».
   */
  let writtenSession = new Map();

  const ringDigest = (site) => {
    const ring = site?.boundary?.ring;
    return Array.isArray(ring)
      ? `${site.crs ?? ''}#${digest(openRing(ring).map(pointKey).join(';'))}`
      : undefined;
  };

  const roadsKnown = (site) => {
    const key = ringDigest(site);
    return key === undefined ? undefined : roadCache.get(key);
  };

  /** DEC-4: the road service asked once per Site boundary per session; a refresh asks again. */
  async function roadsFor(site, signal, refresh) {
    const key = ringDigest(site);
    if (key === undefined) return undefined;
    if (!refresh && roadCache.has(key)) return roadCache.get(key);
    const edges = boundaryEdges(site);
    const service = roadsOf();
    let answer;
    if (edges === undefined || service === undefined || typeof service.queryRoads !== 'function') {
      // No road service is "no road found", as an empty list is (DEC-4).
      answer = { segments: [], retrievedAt: now().toISOString() };
    } else {
      // A loop, not `Math.min(...)`: a boundary of many thousand points would
      // overflow the argument list.
      const box = { minE: Infinity, minN: Infinity, maxE: -Infinity, maxN: -Infinity };
      for (const e of edges) {
        box.minE = Math.min(box.minE, e.a.easting);
        box.minN = Math.min(box.minN, e.a.northing);
        box.maxE = Math.max(box.maxE, e.a.easting);
        box.maxN = Math.max(box.maxN, e.a.northing);
      }
      try {
        const result = await service.queryRoads({
          crs: site.crs,
          minEasting: box.minE - ROAD_MARGIN,
          minNorthing: box.minN - ROAD_MARGIN,
          maxEasting: box.maxE + ROAD_MARGIN,
          maxNorthing: box.maxN + ROAD_MARGIN,
          limit: 500
        });
        answer = Array.isArray(result)
          ? { segments: result, retrievedAt: now().toISOString() }
          : { refused: String(result?.refused ?? 'unknown'), retrievedAt: now().toISOString() };
      } catch (cause) {
        answer = {
          refused: cause instanceof Error ? cause.message : String(cause),
          retrievedAt: now().toISOString()
        };
      }
    }
    if (signal.aborted) return answer;
    remembered(roadCache, key, answer);
    return answer;
  }

  function readSection() {
    try {
      return sectionOf(packageData()?.read());
    } catch (cause) {
      log(`${SOURCE_ID}: the Site section could not be read: ${String(cause)}`);
      return { section: undefined, readOnly: true };
    }
  }

  /** DEC-2: the coded rules, for a regime and a sector. */
  function rules(regime) {
    const citation = (article) => ({
      document: {
        text: `Code de l’urbanisme, version en vigueur depuis le ${ARTICLES[article].versionText}`,
        lang: 'fr'
      },
      article,
      passage: { text: ARTICLES[article].text, lang: 'fr' },
      href: legifrance(article)
    });
    const verbatimArticle = (article) => ({
      text: `${article} — ${ARTICLES[article].text}`,
      lang: 'fr'
    });
    const list = [
      {
        id: 'rnu:R.111-15',
        kind: 'building_distance',
        label: { key: 'fr-urban-rules.rule.R111-15' },
        limit: { kind: 'value', comparison: 'min', quantity: { value: 3, unit: 'm' } },
        provenance: 'coded',
        status: 'to_confirm',
        citation: citation('R.111-15'),
        conditions: [{ key: 'fr-urban-rules.rule.R111-15.condition' }],
        exceptions: [verbatimArticle('R.111-19')]
      },
      {
        id: 'rnu:R.111-16',
        kind: 'road_setback',
        label: { key: 'fr-urban-rules.rule.R111-16' },
        limit: { kind: 'height_relative', factor: 1 },
        definition: { key: 'fr-urban-rules.rule.R111-16.definition' },
        provenance: 'coded',
        status: 'confirmed',
        citation: citation('R.111-16'),
        // 002.1a's step 1 found a second paragraph; the owner made it an
        // exception (002.1a review Q2), quoted from the verified text.
        exceptions: [
          { text: `R.111-16, alinéa 2 — ${ARTICLES['R.111-16'].text.split('\n')[1]}`, lang: 'fr' },
          verbatimArticle('R.111-19')
        ]
      },
      {
        id: 'rnu:R.111-17',
        kind: 'boundary_setback',
        label: { key: 'fr-urban-rules.rule.R111-17' },
        limit: {
          kind: 'height_relative',
          factor: R111_17.factor,
          minimum: { value: R111_17.minimum, unit: 'm' }
        },
        definition: { key: 'fr-urban-rules.rule.R111-17.definition' },
        provenance: 'coded',
        status: 'confirmed',
        citation: citation('R.111-17'),
        exceptions: [verbatimArticle('R.111-18'), verbatimArticle('R.111-19')]
      },
      {
        id: 'rnu:R.111-28',
        kind: 'height_total',
        label: { key: 'fr-urban-rules.rule.R111-28' },
        statement: 'described',
        limit: { kind: 'described', text: { key: 'fr-urban-rules.rule.R111-28.limit' } },
        provenance: 'coded',
        status: 'information',
        citation: citation('R.111-28')
      }
    ];
    if (regime === 'rnu') {
      list.push({
        id: 'rnu:L.111-3',
        kind: 'other',
        label: { key: 'fr-urban-rules.rule.L111-3' },
        statement: 'described',
        limit: { kind: 'described', text: { key: 'fr-urban-rules.rule.L111-3.limit' } },
        provenance: 'coded',
        status: 'not_evaluable',
        citation: citation('L.111-3'),
        exceptions: [verbatimArticle('L.111-4')]
      });
    }
    list.push({
      id: 'rnu:other',
      kind: 'other',
      label: { key: 'fr-urban-rules.rule.other' },
      statement: 'described',
      limit: { kind: 'described', text: { key: 'fr-urban-rules.rule.other.limit' } },
      provenance: 'coded',
      status: 'not_evaluable',
      citation: {
        document: { text: 'Code de l’urbanisme', lang: 'fr' },
        article: 'R.111-2 à R.111-14, R.111-20 à R.111-27'
      }
    });
    return list;
  }

  /**
   * The buildings of the open Document (DEC-6): the main one — asked without an
   * id, its id learned from the answer — and the named ones (`Building`
   * entities). Only a check with no Site boundary, which has no target to ask
   * `distances` with, learns whether a main building exists from `projection`.
   */
  function namedBuildings(service) {
    // 002.8 DEC-7: a parked variation's buildings are the host's list (096.11
    // RD-1) — the `document` service reads the open Document only.
    const given = service?.[VARIATION_BUILDINGS];
    if (Array.isArray(given)) return given.map((b) => ({ id: b.id, name: b.name }));
    const buildings = [];
    try {
      for (const entity of documentOf()?.find('Building') ?? []) {
        const name = entity.property('name');
        buildings.push({ id: entity.id, name: name?.kind === 'string' ? name.value : undefined });
      }
    } catch (cause) {
      log(`${SOURCE_ID}: the buildings could not be listed: ${String(cause)}`);
    }
    return buildings;
  }

  /**
   * DEC-6 / DEC-7: the R.111-17 checks of one building against the non-street
   * edges. The host measures; this applies the rule to its worst pair, its
   * nearest pair and its façade samples. Pure over the measures' answers.
   */
  function evaluateBuilding(service, building, targets, edgeAssumption, note) {
    let answered = building;
    const subject = (edge) => ({
      kind: 'boundary-edge',
      id: String(edge),
      label:
        answered.name === undefined
          ? { key: 'fr-urban-rules.check.subject.main', params: { edge } }
          : {
              key: 'fr-urban-rules.check.subject.named',
              params: { building: cut(answered.name, 200), edge }
            }
    });
    const base = (edge) =>
      ['site-boundary-parcel', 'balconies-not-modelled', edgeAssumption(edge)].filter(Boolean);
    const checkId = (edge) => `r111-17:${answered.id ?? 'main'}:${edge}`;
    const notChecked = (edge, reason, extra = []) => ({
      id: checkId(edge),
      ruleId: 'rnu:R.111-17',
      subject: subject(edge),
      result: 'not_checked',
      assumptionIds: [...base(edge), note(reason), ...extra]
    });
    const ask = (outline) =>
      service.measures.distances({
        ...(building.id === undefined ? {} : { buildingId: building.id }),
        outline,
        targets,
        ratios: [R111_17.factor],
        byFacade: true
      });
    let answer = ask('withRoofOverhangs');
    const extra = [];
    if (!answer.available && answer.reason === 'outline-refused') {
      // A roof could not be resolved: its overhangs are not counted, and said.
      const storeys = ask('storeys');
      if (storeys.available) {
        answer = storeys;
        extra.push('roof-overhangs-unread');
      }
    }
    // The main building, asked without an id: none drawn is no check at all.
    if (
      building.id === undefined &&
      !answer.available &&
      (answer.reason === 'no-rooms' || answer.reason === 'unknown-building')
    ) {
      return [];
    }
    // Only the main building, asked without an id, learns its id from the answer.
    if (building.id === undefined && answer.available && typeof answer.buildingId === 'string') {
      answered = { ...building, id: answer.buildingId };
    }
    if (!answer.available) return targets.map((t) => notChecked(t.edge, answer.reason, extra));
    const facades = Array.isArray(answer.facades) ? answer.facades : [];
    const result = (edge, fields) => ({
      id: checkId(edge),
      ruleId: 'rnu:R.111-17',
      subject: subject(edge),
      ...fields
    });
    const shown = (pair, limit) => ({
      measured: { value: mm(pair.distance), unit: 'm' },
      limit: { value: mm(limit), unit: 'm' },
      figure: { dimension: { from: pair.building, to: pair.target } }
    });
    const checks = targets.map((target, index) => {
      const measured = answer.targets[index];
      if (
        measured === undefined ||
        measured.unavailable !== undefined ||
        measured.nearest === undefined
      ) {
        return notChecked(target.edge, measured?.unavailable ?? 'unavailable', extra);
      }
      const nearest = measured.nearest;
      const touching = adjoining(facades, index, nearest);
      if (touching !== undefined) {
        return result(target.edge, {
          measured: { value: mm(nearest.distance), unit: 'm' },
          result: 'no_issue',
          assumptionIds: [...base(target.edge), touching, ...extra]
        });
      }
      // Decided and shown on the same pair (review 2026-10-20): the 3 m floor
      // on the nearest pair, the rise rule on the worst pair; when both fail,
      // the larger shortfall is shown and said.
      const failsMinimum = nearest.distance < R111_17.minimum - RESOLUTION_HALF;
      const worst = (measured.worst ?? []).find((w) => w.ratio === R111_17.factor);
      const riseUnknown =
        worst === undefined || (worst.rise !== undefined && typeof worst.rise === 'object');
      if (riseUnknown) {
        const reason = worst?.rise?.unavailable ?? 'unavailable';
        // Closer than 3 m is an issue whatever the heights: definite on the
        // floor, with the rise rule said not checked.
        if (failsMinimum) {
          return result(target.edge, {
            ...shown(nearest, R111_17.minimum),
            result: 'potential_issue',
            assumptionIds: [...base(target.edge), 'governed-by-floor', note(reason), ...extra]
          });
        }
        return notChecked(target.edge, reason, extra);
      }
      const needed = R111_17.factor * worst.rise;
      const failsRise = worst.margin < -RESOLUTION_HALF;
      const datum = worst.datumDerived === true ? ['datum-derived'] : [];
      if (!failsMinimum && !failsRise) {
        const floorGoverns = R111_17.minimum >= needed;
        return result(target.edge, {
          ...(floorGoverns ? shown(nearest, R111_17.minimum) : shown(worst, needed)),
          result: 'no_issue',
          assumptionIds: [...base(target.edge), ...datum, ...extra]
        });
      }
      const floorShortfall = failsMinimum ? R111_17.minimum - nearest.distance : -Infinity;
      const riseShortfall = failsRise ? -worst.margin : -Infinity;
      const byFloor = floorShortfall >= riseShortfall;
      return result(target.edge, {
        ...(byFloor
          ? shown(nearest, R111_17.minimum)
          : shown(worst, Math.max(R111_17.minimum, needed))),
        result: 'potential_issue',
        assumptionIds: [
          ...base(target.edge),
          ...(failsMinimum && failsRise
            ? [byFloor ? 'governed-by-floor' : 'governed-by-rise']
            : []),
          ...datum,
          ...extra
        ]
      });
    });
    return checks;
  }

  /**
   * DEC-6: five consecutive samples within 5 cm on a façade run, for that
   * target, and the nearest pair within 5 cm too: `adjoins`. When another
   * sample of that edge stands between 5 cm and 3 m, the building adjoins it
   * only in part — `adjoins-partially`, still no issue, the reading said.
   * `undefined` when it does not adjoin.
   */
  function adjoining(facades, index, nearest) {
    if (!(Number.isFinite(nearest?.distance) && nearest.distance <= ADJOINING.distance)) {
      return undefined;
    }
    let run = false;
    let partly = false;
    for (const facade of facades) {
      const samples = facade?.targets?.[index]?.samples;
      if (!Array.isArray(samples)) continue;
      let streak = 0;
      for (const sample of samples) {
        const d = sample?.distance;
        const close = Number.isFinite(d) && d <= ADJOINING.distance;
        streak = close ? streak + 1 : 0;
        if (streak >= ADJOINING.samples) run = true;
        if (Number.isFinite(d) && d > ADJOINING.distance && d < R111_17.minimum - RESOLUTION_HALF) {
          partly = true;
        }
      }
    }
    if (!run) return undefined;
    return partly ? 'adjoins-partially' : 'adjoins';
  }

  /**
   * Sprint 002.4, the owner's Q5 (decided on the owner's behalf, 2026-10-20):
   * one check per rule per building. The per-edge checks of R.111-17 and of
   * the drawn and entered setbacks — ids ending `:<edge>`, subject a boundary
   * edge — are folded into one: the worst edge governs, its result, figures
   * and figure are the check's, and every other edge is listed in the
   * subject's label with its distance. Worst is the largest shortfall among
   * the potential issues; else an edge not checked (the check cannot say
   * « no issue » for an edge it did not measure); else the smallest margin.
   * Each edge's own band (DEC-5) is drawn from the per-edge checks before the
   * fold. Other checks pass through untouched, in place.
   */
  function oneCheckPerBuilding(checks) {
    const edgeOf = (check) => {
      if (check.subject?.kind !== 'boundary-edge') return undefined;
      const at = check.id.lastIndexOf(':');
      const edge = check.id.slice(at + 1);
      return at > 0 && /^\d+$/.test(edge) ? { group: check.id.slice(0, at), edge } : undefined;
    };
    const groups = new Map();
    for (const check of checks) {
      const key = edgeOf(check);
      if (key === undefined) continue;
      if (!groups.has(key.group)) groups.set(key.group, []);
      groups.get(key.group).push(check);
    }
    const shortfall = (c) =>
      c.limit !== undefined && c.measured !== undefined ? c.limit.value - c.measured.value : 0;
    const margin = (c) =>
      c.limit !== undefined && c.measured !== undefined
        ? c.measured.value - c.limit.value
        : Number.POSITIVE_INFINITY;
    const governing = (group) => {
      const issues = group.filter((c) => c.result === 'potential_issue');
      if (issues.length > 0) {
        return issues.reduce((worst, c) => (shortfall(c) > shortfall(worst) ? c : worst));
      }
      const unchecked = group.find((c) => c.result === 'not_checked');
      if (unchecked !== undefined) return unchecked;
      return group.reduce((worst, c) => (margin(c) < margin(worst) ? c : worst));
    };
    // Which pair the governing figure was taken from: its own. The others'
    // notes stay — `adjoins` is why a listed distance under 3 m is no issue.
    const OWN = new Set(['governed-by-floor', 'governed-by-rise']);
    const LABEL_KEYS = {
      'fr-urban-rules.check.subject.main': 'fr-urban-rules.check.subject.mainEdges',
      'fr-urban-rules.check.subject.named': 'fr-urban-rules.check.subject.namedEdges'
    };
    const folded = new Map();
    for (const [group, list] of groups) {
      const head = governing(list);
      const others = list.filter((c) => c !== head);
      const listed = others
        .map((c) => {
          if (c.measured === undefined) return `${c.subject.id} (—)`;
          const differs = c.limit !== undefined && c.limit.value !== head.limit?.value;
          return `${c.subject.id} (${c.measured.value} m${differs ? ` / ${c.limit.value} m` : ''})`;
        })
        .join(', ');
      const label =
        others.length > 0 && Object.hasOwn(LABEL_KEYS, head.subject.label?.key)
          ? {
              key: LABEL_KEYS[head.subject.label.key],
              params: { ...head.subject.label.params, others: cut(listed, 400) }
            }
          : head.subject.label;
      const assumptionIds = [
        ...new Set([
          ...(head.assumptionIds ?? []),
          ...others.flatMap((c) => (c.assumptionIds ?? []).filter((id) => !OWN.has(id)))
        ])
      ];
      folded.set(group, { ...head, id: group, subject: { ...head.subject, label }, assumptionIds });
    }
    const out = [];
    for (const check of checks) {
      const key = edgeOf(check);
      if (key === undefined) out.push(check);
      else if (folded.has(key.group)) {
        out.push(folded.get(key.group));
        folded.delete(key.group);
      }
    }
    return out;
  }

  /** The report with 002.1a's rules, edges, checks and views, for `rnu` and `cc`. */
  function augment(
    report,
    request,
    roads,
    reportFacts,
    { checks: measure = true, written, documentWatch, onCounts } = {}
  ) {
    const regime = report?.regime?.code;
    // 002.1a–b: the national rules under the RNU and a carte communale; 002.2:
    // drawn and entered rules wherever a regime is known.
    const national = regime === 'rnu' || regime === 'cc';
    if (!national && regime !== 'plu' && regime !== 'plui' && regime !== 'not_published') {
      // 002.7 DEC-5: no envelope for `unknown`, but a sheet when something was read.
      const sheet = sheetOf(report, { site: request.site, zones: reportFacts?.zones ?? [] });
      return sheet === undefined ? report : { ...report, sheet };
    }
    const site = request.site;
    const service = siteOf();
    const sectors = reportFacts?.typesects ?? [];
    const closed = sectors.filter((t) => t === '03').length;
    const restricted = regime === 'cc' && closed > 0;
    const partly = restricted && closed < sectors.length;
    let ruleList = national ? rules(regime) : [];
    const assumptions = [...report.assumptions];
    const assume = (id, text) => {
      if (!assumptions.some((a) => a.id === id)) assumptions.push({ id, text });
      return id;
    };
    const flags = [...report.flags];
    if (restricted) {
      flags.push({
        id: 'cc-restricted',
        kind: 'cc-restricted',
        // The whole plot in non-constructible sectors, or only some of it.
        label: {
          key: partly ? 'fr-urban-rules.flag.ccRestrictedSome' : 'fr-urban-rules.flag.ccRestricted'
        },
        icon: 'ground',
        group: 'constraint',
        title: { key: 'fr-urban-rules.flag.title.ccRestricted' },
        code: 'L.161-4',
        citation: {
          document: {
            text: `Code de l’urbanisme, version en vigueur depuis le ${ARTICLES['L.161-4'].versionText}`,
            lang: 'fr'
          },
          article: 'L.161-4',
          passage: { text: ARTICLES['L.161-4'].text, lang: 'fr' },
          href: legifrance('L.161-4')
        }
      });
    }

    // The edges (DEC-3), the corrections (DEC-8) and the views (DEC-5).
    const plot = plotIdsOf(site);
    const { section, readOnly } = readSection();
    const corrections = readOnly ? [] : edgeRolesOf(section);
    // Sprint 002.2: the coded, drawn and entered rules with the section's
    // decisions; a section saved by a newer version decides nothing here.
    const planned = plannedRules(
      report,
      reportFacts,
      ruleList,
      readOnly ? undefined : section,
      plot,
      written
    );
    ruleList = planned.rules;
    // Sprint 002.17: the exclusion areas of the buildable area, with the section's choices.
    const exclusions = exclusionItemsOf(
      reportFacts?.prescriptions,
      readOnly ? [] : exclusionChoicesOf(section),
      plot,
      planned.current
    );
    // Sprint 002.20: whether the areas taken out are drawn (on unless the user hid them on this plot).
    const exclusionsShown = readOnly || exclusionsShownOn(section, plot);
    // 002.6b DEC-4 (B1): the written rules an action may decide on, as this read
    // showed them. Review S7: only from a read's answer that knows the written
    // state — never a progress report, which knows it not yet.
    if (written !== undefined && measure) writtenSession = planned.writtenSession;
    const edges = boundaryEdges(site);
    const sources = [...report.sources];
    const reportEdges = [];
    const roleOf = new Map();
    if (edges !== undefined && roads !== undefined) {
      sources.push({
        id: 'roads',
        name: { key: 'fr-urban-rules.source.roads' },
        state: roads.refused === undefined ? 'ready' : 'unavailable',
        retrievedAt: roads.retrievedAt,
        ...(roads.refused !== undefined
          ? {
              detail: {
                key: 'fr-urban-rules.status.roadsRefused',
                params: { reason: cut(roads.refused, 200) }
              }
            }
          : roads.segments.length === 0
            ? { detail: { key: 'fr-urban-rules.status.empty' } }
            : {})
      });
    } else if (edges !== undefined) {
      sources.push({ id: 'roads', name: { key: 'fr-urban-rules.source.roads' }, state: 'loading' });
    }
    if (edges !== undefined) {
      const derived = deriveRoles(edges, roads);
      if (derived.widthAssumed)
        assume('road-width-assumed', {
          key: 'fr-urban-rules.assumption.roadWidth',
          params: { width: ASSUMED_ROAD_WIDTH }
        });
      for (const e of edges) {
        const correction = corrections.find(
          (c) => samePlot(c.plot, plot) && sameEnds(c.ends, e.a, e.b)
        );
        let role;
        let assumptionId;
        if (correction !== undefined) {
          role = correction.role;
          assumptionId = assume('edge-set-by-you', {
            key: 'fr-urban-rules.assumption.edgeSetByYou'
          });
        } else {
          const d = derived.roles.get(e.edge) ?? { role: 'side', assumption: 'edges-derived' };
          role = d.role;
          if (d.assumption.startsWith('street-')) {
            // One assumption per road, not per edge: a boundary of many edges
            // along one street names it once.
            assumptionId = assume(
              d.road === undefined ? 'street-road' : `street-${digest(d.road)}`,
              d.road === undefined
                ? { key: 'fr-urban-rules.assumption.streetEdgeUnnamed' }
                : {
                    key: 'fr-urban-rules.assumption.streetEdge',
                    params: { road: cut(d.road, 200) }
                  }
            );
          } else {
            const keys = {
              'edges-derived': 'fr-urban-rules.assumption.edgesDerived',
              'no-road': 'fr-urban-rules.assumption.noRoad',
              'no-street-edge': 'fr-urban-rules.assumption.noStreetEdge',
              'roads-unavailable': 'fr-urban-rules.assumption.roadsUnavailable'
            };
            assumptionId = assume(d.assumption, { key: keys[d.assumption] });
          }
        }
        roleOf.set(e.edge, { role, assumptionId });
        reportEdges.push({ edge: e.edge, role, assumptionId });
      }
    }

    // Sprint 002.1b (DEC-1): the opposite alignments of the street edges, and
    // the context they and R.111-28 are read from.
    const context = national ? contextKnown(site) : undefined;
    let alignments;
    try {
      alignments =
        !national || edges === undefined || roads === undefined
          ? undefined
          : alignmentsFor(edges, roleOf, roads, context, plot);
    } catch (cause) {
      log(`${SOURCE_ID}: the opposite alignments could not be built: ${String(cause)}`);
    }
    if (context?.el7 !== undefined) {
      sources.push({
        id: 'el7',
        name: { key: 'fr-urban-rules.source.el7' },
        state: context.el7.refused === undefined ? 'ready' : 'unavailable',
        retrievedAt: context.el7.retrievedAt,
        ...(context.el7.refused === undefined
          ? context.el7.lines.length === 0
            ? { detail: { key: 'fr-urban-rules.status.empty' } }
            : {}
          : {
              detail: {
                key: 'fr-urban-rules.status.el7Refused',
                params: { reason: cut(context.el7.refused, 200) }
              }
            })
      });
    }
    if (context?.parcels !== undefined) {
      sources.push({
        id: 'facing-parcels',
        name: { key: 'fr-urban-rules.source.facingParcels' },
        state: context.parcels.refused === undefined ? 'ready' : 'unavailable',
        retrievedAt: context.parcels.retrievedAt,
        ...(context.parcels.refused === undefined
          ? {}
          : {
              detail: {
                key: 'fr-urban-rules.status.facingParcelsRefused',
                params: { reason: cut(context.parcels.refused, 200) }
              }
            })
      });
    }
    if (context?.buildings !== undefined) {
      sources.push({
        id: 'neighbours',
        name: { key: 'fr-urban-rules.source.neighbours' },
        state: context.buildings.refused === undefined ? 'ready' : 'unavailable',
        retrievedAt: context.buildings.retrievedAt,
        ...(context.buildings.refused === undefined
          ? {}
          : {
              detail: {
                key: 'fr-urban-rules.status.neighboursRefused',
                params: { reason: cut(context.buildings.refused, 200) }
              }
            })
      });
    }
    // Every alignment drawn says what it was taken from (Design Contract).
    for (const path of ['el7', 'parcels', 'carriageway', 'carriageway-unread']) {
      if ([...(alignments?.values() ?? [])].some((a) => a.path === path)) {
        assume(`alignment-${path}`, { key: ALIGNMENT_ASSUMPTION_KEYS[path] });
      }
    }
    if ([...(alignments?.values() ?? [])].some((a) => a.widthAssumed)) {
      assume('road-width-assumed', {
        key: 'fr-urban-rules.assumption.roadWidth',
        params: { width: ASSUMED_ROAD_WIDTH }
      });
    }

    const note = (reason) =>
      assume(
        `not-checked-${reason}`,
        Object.hasOwn(REASON_KEYS, reason)
          ? { key: REASON_KEYS[reason] }
          : { key: 'fr-urban-rules.reason.other', params: { reason: cut(String(reason), 200) } }
      );
    // 002.8 DEC-7: the inputs a parked variation is checked against, kept below.
    const inputs = {
      report,
      site,
      regime,
      national,
      edges,
      roads,
      roleOf,
      alignments,
      planned,
      section: readOnly ? undefined : section,
      readOnly,
      reportFacts,
      flags
    };
    // Sprint 002.3 DEC-3 / 002.8 DEC-2: the measures the checks were computed from, kept.
    const calls = [];
    const measured = measure ? recordedMeasures(service, calls) : service;
    // Sprint 002.7: the theoretical envelope — its outline, its volume and its view —
    // drawn after the checks are folded, as before the refactor, so the
    // assumptions keep their order; the bands are drawn from the per-edge checks.
    let envelope = {};
    const derivedFeatures = [];
    const evaluated = evaluateChecks(
      inputs,
      { service: measured },
      {
        assume,
        note,
        measure,
        beforeSurfaces: ({ perEdge, checks }) => {
          derivedFeatures.push(
            ...[...(alignments?.values() ?? [])]
              .filter((a) => a.points !== undefined)
              .map((a) => ({
                id: `alignment:${a.edge}`,
                category: 'alignment',
                official: false,
                line: a.points,
                label: { key: ALIGNMENT_KEYS[a.path] }
              }))
          );
          if (edges !== undefined && national) {
            try {
              derivedFeatures.push(
                ...bandsFor(
                  edges,
                  roleOf,
                  perEdge,
                  alignments ?? new Map(),
                  edges.map((e) => e.a),
                  Math.max(0, 1900 - report.features.length - (alignments?.size ?? 0))
                )
              );
            } catch (cause) {
              log(`${SOURCE_ID}: the bands could not be drawn: ${String(cause)}`);
            }
          }
          try {
            envelope = envelopeOf({
              planned,
              edges,
              roleOf,
              alignments,
              regime,
              reportFacts,
              national,
              assume,
              exclusions,
              exclusionsShown,
              plotArea: site?.plotArea
            });
            if (envelope.feature !== undefined) derivedFeatures.push(envelope.feature);
            if (envelope.bandFeatures?.length > 0) derivedFeatures.push(...envelope.bandFeatures);
            if (envelope.excludedFeatures?.length > 0) derivedFeatures.push(...envelope.excludedFeatures);
          } catch (cause) {
            log(`${SOURCE_ID}: the envelope could not be drawn: ${String(cause)}`);
            envelope = {};
          }
          if (derivedFeatures.some((f) => f.category === 'setback-band')) {
            assume('bands-approximate', { key: 'fr-urban-rules.assumption.bandsApproximate' });
          }
          if (checks.some((c) => c.assumptionIds.includes('contiguous-tolerance'))) {
            assume('contiguous-tolerance', {
              key: 'fr-urban-rules.assumption.contiguousTolerance',
              params: { distance: ADJOINING.distance }
            });
          }
          // 002.3 DEC-5: the capacity reads the envelope's ground area where a confirmed setback insets it.
          return envelope.inset ? envelope.feature : undefined;
        }
      }
    );
    const { checks, surfaces } = evaluated;

    // DEC-4: R.111-28's neighbours, never a check (not part of the checks: 002.8 DEC-7).
    let neighbours;
    try {
      neighbours = neighboursOf(site, edges, context);
    } catch (cause) {
      log(`${SOURCE_ID}: the neighbouring buildings could not be read: ${String(cause)}`);
      neighbours = { refused: 'unavailable' };
    }
    const neighbourBlocks = [];
    if (neighbours !== undefined) {
      if (neighbours.refused !== undefined) {
        neighbourBlocks.push({
          kind: 'notice',
          tone: 'warning',
          text: { key: 'fr-urban-rules.notice.neighboursUnavailable' }
        });
      } else if (neighbours.noSource === true) {
        neighbourBlocks.push({
          kind: 'notice',
          tone: 'info',
          text: { key: 'fr-urban-rules.notice.neighboursNoSource' }
        });
      } else {
        const rows = [
          {
            label: { key: 'fr-urban-rules.field.neighboursAverage' },
            value:
              neighbours.average === undefined
                ? { key: 'fr-urban-rules.value.none' }
                : { value: mm(neighbours.average), unit: 'm' },
            detail: {
              key: 'fr-urban-rules.field.neighboursDetail',
              params: {
                count: neighbours.count,
                missing: neighbours.missing,
                lightweight: neighbours.lightweight,
                radius: NEIGHBOUR_RADIUS
              }
            }
          }
        ];
        if (measure && service?.measures !== undefined) {
          const shown = new Set();
          for (const building of [{ id: undefined, name: undefined }, ...namedBuildings(service)]) {
            const projection = service.measures.projection(
              building.id === undefined ? {} : { buildingId: building.id }
            );
            if (!projection.available && building.id === undefined) continue;
            // The main building may also be a `Building` entity: one row (should-fix 4).
            const id = building.id ?? (projection.available ? projection.buildingId : undefined);
            if (id !== undefined && shown.has(id)) continue;
            if (id !== undefined) shown.add(id);
            const top = projection.available
              ? projection.height?.topAboveGround?.fromLowest
              : undefined;
            rows.push({
              label:
                building.name === undefined
                  ? { key: 'fr-urban-rules.field.mainBuildingHeight' }
                  : {
                      key: 'fr-urban-rules.field.buildingHeight',
                      params: { building: cut(building.name, 200) }
                    },
              value:
                typeof top === 'number'
                  ? { value: mm(top), unit: 'm' }
                  : { key: 'fr-urban-rules.value.unavailable' }
            });
          }
        }
        neighbourBlocks.push({
          kind: 'heading',
          text: { key: 'fr-urban-rules.heading.neighbours' }
        });
        neighbourBlocks.push({ kind: 'fields', rows });
        if (neighbours.average !== undefined) {
          ruleList = ruleList.map((rule) =>
            rule.id === 'rnu:R.111-28'
              ? {
                  ...rule,
                  conditions: [
                    {
                      key: 'fr-urban-rules.rule.R111-28.neighbours',
                      params: {
                        average: mm(neighbours.average),
                        count: neighbours.count,
                        missing: neighbours.missing,
                        radius: NEIGHBOUR_RADIUS
                      }
                    }
                  ]
                }
              : rule
          );
        }
      }
    }

    // 002.6b DEC-2: the written rules' state per zone — a source line and the Rules view's blocks.
    const writtenState = writtenStateOf(written, planned);
    sources.push(...writtenState.sources);
    // 002.9 (criterion 6): where no règlement exists, the Rules view says why nothing is read.
    const notOffered = WRITTEN_NOT_OFFERED_KEYS[report.regime?.code];
    const writtenBlocks =
      notOffered === undefined || writtenState.blocks.length > 0
        ? writtenState.blocks
        : [{ kind: 'notice', tone: 'info', text: { key: notOffered } }];
    const prescriptionChoices = prescriptionChoiceBlocks(exclusions, planned.current);
    const views = [
      ...report.views.map((view) =>
        view.id === 'prescriptions' && prescriptionChoices.length > 0 && !readOnly
          ? { ...view, blocks: [...view.blocks, ...prescriptionChoices] }
          : view
      ),
      rulesView(planned, readOnly, writtenBlocks, onCounts),
      ...(surfaces === undefined ? [] : [surfaces.view]),
      edgesView(edges, reportEdges, corrections, plot, readOnly),
      {
        id: 'checks',
        label: { key: 'fr-urban-rules.view.checks' },
        blocks:
          checks.length > 0
            ? [{ kind: 'checks' }, ...neighbourBlocks, { kind: 'assumptions' }]
            : [
                {
                  kind: 'notice',
                  tone: 'info',
                  text: {
                    key: !measure
                      ? 'fr-urban-rules.notice.loading'
                      : edges === undefined
                        ? 'fr-urban-rules.notice.noBoundary'
                        : 'fr-urban-rules.notice.noCheck'
                  }
                },
                ...neighbourBlocks,
                { kind: 'assumptions' }
              ]
      },
      ...(envelope.view === undefined ? [] : [envelope.view])
    ];
    const attribution = [
      report.attribution,
      ...(roads?.segments ?? []).map((s) => s.attribution).filter((a) => typeof a === 'string')
    ]
      .filter((a, i, all) => a !== '' && all.indexOf(a) === i)
      .join(' · ');
    const augmented = fitted({
      ...report,
      overview: overviewWith(report.overview, planned, regime, retiredStageRunning(), documentWatch),
      features: [...report.features, ...derivedFeatures],
      edges: reportEdges,
      rules: ruleList,
      checks,
      flags,
      assumptions,
      sources,
      attribution: cut(attribution, SHORT),
      views
    });
    // Sprint 002.7 DEC-5: the regulation sheet, from the report as it is sent.
    const sheet = sheetOf(augmented, { site, zones: reportFacts?.zones ?? [] });
    const answered = sheet === undefined ? augmented : { ...augmented, sheet };
    // 002.8 (RD-6, DEC-5, DEC-2): a read's answer — never a progress report —
    // keeps its own inputs for `checkVariation`, the questions and the
    // programme warning, with the measures its checks were computed from.
    if (measure) {
      remembered(lastReads, contextKey(site), {
        documentVersion: answered.document?.version,
        ruleIds: new Set(answered.rules.map((r) => r.id)),
        inputs: { ...inputs, envelope: envelope.inset ? envelope.feature : undefined },
        report: answered,
        open: {
          variationKey: variationKeyOf(service),
          calls,
          buildings: evaluated.buildings,
          figures: surfaces?.figures
        }
      });
    }
    return answered;
  }

  /**
   * Sprint 002.8 DEC-7: the checks of one design against one read's inputs —
   * R.111-17, R.111-16 and R.111-15 under the national rules, the drawn,
   * entered and written rules, and the surfaces' — separated out of `augment`
   * so a parked variation is checked by the read's own pipeline.
   *
   * `inputs` are the read's: the report, the Site, the regime, the edges and
   * their roles, the roads, the alignments, the planned rules and their
   * metadata, the section, the report's facts and flags. `target.service` is
   * the Site service the design is measured through — the open Document's, or
   * a parked variation's view (`variationView`). `beforeSurfaces` runs once
   * the per-building checks are folded (`augment` draws the bands and the
   * envelope there) and answers the envelope the capacity reads. Between
   * buildings and steps, an aborted `signal` stops it (it throws).
   *
   * `{ checks, perEdge, surfaces, buildings }`: the report's checks, the
   * per-edge checks before 002.4 Q5's fold (the bands'), the Surfaces result
   * and the buildings measured.
   */
  function evaluateChecks(inputs, target, { assume, note, measure = true, signal, beforeSurfaces }) {
    const { site, national, edges, roads, roleOf, alignments, planned, section, readOnly } = inputs;
    const service = target.service;
    const stop = () => {
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    };
    const checks = [];
    const named = measure && service?.measures !== undefined ? namedBuildings(service) : [];
    // The R.111-17 checks (DEC-6, DEC-7), from fresh measures on every read.
    if (measure && national && service?.measures !== undefined) {
      assume('site-boundary-parcel', { key: 'fr-urban-rules.assumption.siteBoundaryParcel' });
      assume('balconies-not-modelled', { key: 'fr-urban-rules.assumption.balconies' });
      if (edges === undefined) {
        const main = service.measures.projection();
        const buildings = [
          ...(main.available ? [{ id: main.buildingId, name: undefined }] : []),
          ...named.filter((b) => !main.available || b.id !== main.buildingId)
        ];
        for (const building of buildings) {
          checks.push({
            id: `r111-17:${building.id ?? 'main'}:no-boundary`,
            ruleId: 'rnu:R.111-17',
            subject: {
              kind: 'building',
              ...(building.id === undefined ? {} : { id: building.id }),
              label:
                building.name === undefined
                  ? { key: 'fr-urban-rules.check.subject.mainBuilding' }
                  : { text: cut(building.name, 200) }
            },
            result: 'not_checked',
            assumptionIds: ['site-boundary-parcel', note('no-boundary')]
          });
          // R.111-16 has no street edge without a boundary either: said the same way.
          checks.push({
            id: `r111-16:${building.id ?? 'main'}:no-boundary`,
            ruleId: 'rnu:R.111-16',
            subject: {
              kind: 'building',
              ...(building.id === undefined ? {} : { id: building.id }),
              label:
                building.name === undefined
                  ? { key: 'fr-urban-rules.check.subject.mainBuilding' }
                  : { text: cut(building.name, 200) }
            },
            result: 'not_checked',
            assumptionIds: [note('no-boundary')]
          });
        }
      } else if (roads !== undefined) {
        const buildings = [{ id: undefined, name: undefined }, ...named];
        // Never past the host's 1,000 checks (refused whole): the targets each
        // building is asked for are capped, and the cap said.
        const perBuilding = Math.floor(HOST_LIMITS.checks / buildings.length);
        const all = edges
          .filter((e) => roleOf.get(e.edge)?.role !== 'street')
          .map((e) => ({ kind: 'boundary-edge', edge: e.edge }));
        const targets = all.slice(0, perBuilding);
        if (all.length > targets.length) {
          assume('checks-capped', {
            key: 'fr-urban-rules.assumption.checksCapped',
            params: { count: String(targets.length) }
          });
        }
        const seen = new Set();
        if (targets.length > 0) {
          for (const building of buildings) {
            stop();
            if (building.id !== undefined && seen.has(building.id)) continue;
            try {
              const made = evaluateBuilding(
                service,
                building,
                targets,
                (edge) => roleOf.get(edge)?.assumptionId,
                note
              );
              // The main building's id, once answered, is not checked twice as a named one.
              for (const c of made) seen.add(c.id.split(':')[1]);
              checks.push(...made);
            } catch (cause) {
              log(`${SOURCE_ID}: R.111-17 could not be evaluated: ${String(cause)}`);
              for (const t of targets)
                checks.push({
                  id: `r111-17:${building.id ?? 'main'}:${t.edge}`,
                  ruleId: 'rnu:R.111-17',
                  subject: {
                    kind: 'boundary-edge',
                    id: String(t.edge),
                    label: { key: 'fr-urban-rules.check.subject.main', params: { edge: t.edge } }
                  },
                  result: 'not_checked',
                  assumptionIds: [note('unavailable')]
                });
            }
          }
        }
      }
      if (checks.some((c) => c.assumptionIds.includes('datum-derived'))) {
        assume('datum-derived', { key: 'fr-urban-rules.assumption.datumDerived' });
      }
      if (checks.some((c) => c.assumptionIds.includes('roof-overhangs-unread'))) {
        assume('roof-overhangs-unread', { key: 'fr-urban-rules.assumption.roofOverhangsUnread' });
      }
      stop();
      // Sprint 002.1b: R.111-16 to each opposite alignment, R.111-15 between buildings.
      const projectBuildings = [{ id: undefined, name: undefined }, ...named];
      if (alignments !== undefined && alignments.size > 0) {
        try {
          checks.push(
            ...r11116Checks(service, site, projectBuildings, alignments, roleOf, note, assume)
          );
        } catch (cause) {
          log(`${SOURCE_ID}: R.111-16 could not be evaluated: ${String(cause)}`);
        }
      }
      if (alignments !== undefined && alignments.size === 0) {
        // No street edge (002.1a DEC-3 item 5): R.111-16 has no alignment to
        // measure to, and says why, once per building.
        const reason = roads?.refused !== undefined ? 'roads-unavailable' : 'no-road';
        const main = service.measures.projection();
        const subjects = [
          ...(main.available ? [{ id: main.buildingId, name: undefined }] : []),
          ...named.filter((b) => !main.available || b.id !== main.buildingId)
        ];
        for (const building of subjects) {
          checks.push({
            id: `r111-16:${building.id}:no-street`,
            ruleId: 'rnu:R.111-16',
            subject: {
              kind: 'building',
              id: building.id,
              label:
                building.name === undefined
                  ? { key: 'fr-urban-rules.check.subject.mainBuilding' }
                  : { text: cut(building.name, 200) }
            },
            result: 'not_checked',
            assumptionIds: [note(reason)]
          });
        }
      }
      stop();
      try {
        const main =
          named.length > 0 || (site.existingBuilding?.parts ?? []).length > 0
            ? service.measures.projection()
            : undefined;
        checks.push(
          ...r11115Checks(service, site, main?.available ? main.buildingId : undefined, named, note)
        );
      } catch (cause) {
        log(`${SOURCE_ID}: R.111-15 could not be evaluated: ${String(cause)}`);
      }
      for (const [id, key] of [
        ['governed-by-floor', 'fr-urban-rules.assumption.governedByFloor'],
        ['governed-by-rise', 'fr-urban-rules.assumption.governedByRise'],
        ['adjoins-partially', 'fr-urban-rules.assumption.adjoinsPartially']
      ]) {
        if (checks.some((c) => c.assumptionIds.includes(id))) assume(id, { key });
      }
      if (checks.some((c) => c.assumptionIds.includes('adjoins'))) {
        assume('adjoins', {
          key: 'fr-urban-rules.assumption.adjoins',
          params: { distance: ADJOINING.distance, length: 1 }
        });
      }
    }

    // Sprint 002.2 (DEC-7): checks on the drawn and entered rules.
    if (measure && service?.measures !== undefined) {
      stop();
      try {
        checks.push(...plannedChecks(service, planned, edges, roleOf, note, assume));
      } catch (cause) {
        log(`${SOURCE_ID}: the drawn and entered rules could not be checked: ${String(cause)}`);
      }
    }

    // 002.4 Q5: the bands are drawn per edge; the report shows one check per rule per building.
    const perEdge = [...checks];
    const folded = oneCheckPerBuilding(checks);
    const envelope = beforeSurfaces?.({ perEdge, checks: folded }) ?? inputs.envelope;

    // Sprint 002.3: the Surfaces view, its checks and the programme's figures.
    let surfaces;
    stop();
    try {
      surfaces = surfacesFor({
        service,
        site,
        planned,
        reportFacts: inputs.reportFacts,
        regime: inputs.regime,
        report: inputs.report,
        section,
        readOnly,
        envelope,
        flags: inputs.flags,
        assume,
        note,
        measure
      });
      folded.push(...surfaces.checks);
    } catch (cause) {
      log(`${SOURCE_ID}: the surfaces could not be composed: ${String(cause)}`);
    }
    return { checks: folded, perEdge, surfaces, buildings: named };
  }

  /**
   * Never past the host's counts (review 2026-10-20): a report with 501 edges,
   * 1,001 checks or 501 assumptions is refused whole, its rules and views with
   * it. The edges past 500 and the checks past 1,000 are left out, said by an
   * assumption and a notice; the assumptions are kept within 500, those a kept
   * edge or check names first.
   */
  function fitted(report) {
    let { edges, checks, assumptions, views, features } = report;
    const said = [];
    // The host refuses past 100,000 points: derived lines go first.
    // 096.9 DEC-2: a volume's lines and rings count too.
    const pointsOf = (f) =>
      (f.rings ?? []).reduce((sum, ring) => sum + ring.length, 0) +
      (f.line?.length ?? 0) +
      (f.volume?.ceilings ?? []).reduce(
        (sum, c) =>
          sum +
          (c.from?.length ?? 0) +
          (c.within ?? []).reduce((total, ring) => total + ring.length, 0),
        0
      );
    let points = features.reduce((sum, f) => sum + pointsOf(f), 0);
    if (points > 95_000) {
      const kept = [];
      for (const f of [...features].reverse()) {
        if (points > 95_000 && f.official === false) {
          points -= pointsOf(f);
          continue;
        }
        kept.unshift(f);
      }
      features = kept;
      said.push({
        id: 'features-capped',
        text: {
          key: 'fr-urban-rules.assumption.featuresCapped',
          // A string, never a number: the sheet prints assumptions, and a number in a
          // phrase is grouped with U+202F in French, outside the print font (002.7 DEC-6).
          params: { count: String(features.length) }
        }
      });
    }
    // The host refuses past 2,000 features: the official ones first, then the derived.
    if (features.length > 1900) {
      const official = features.filter((f) => f.official !== false);
      features = [...official, ...features.filter((f) => f.official === false)].slice(0, 1900);
      said.push({
        id: 'features-capped',
        text: { key: 'fr-urban-rules.assumption.featuresCapped', params: { count: '1900' } }
      });
    }
    if (edges.length > HOST_LIMITS.edges) {
      edges = edges.slice(0, HOST_LIMITS.edges);
      said.push({
        id: 'edges-capped',
        text: { key: 'fr-urban-rules.assumption.edgesCapped', params: { count: HOST_LIMITS.edges } }
      });
    }
    if (checks.length > HOST_LIMITS.checks) {
      checks = checks.slice(0, HOST_LIMITS.checks);
      said.push({
        id: 'checks-capped-report',
        text: {
          key: 'fr-urban-rules.assumption.checksCapped',
          params: { count: String(HOST_LIMITS.checks) }
        }
      });
    }
    if (said.length > 0) {
      views = views.map((v) =>
        v.id === 'edges' || v.id === 'checks'
          ? {
              ...v,
              blocks: [
                ...v.blocks,
                { kind: 'notice', tone: 'warning', text: { key: 'fr-urban-rules.notice.capped' } }
              ]
            }
          : v
      );
    }
    let all = [...assumptions, ...said.filter((a) => !assumptions.some((b) => b.id === a.id))];
    if (all.length > HOST_LIMITS.assumptions) {
      const named = new Set([
        ...edges.map((e) => e.assumptionId),
        ...checks.flatMap((c) => c.assumptionIds ?? []),
        ...said.map((a) => a.id)
      ]);
      const first = all.filter((a) => named.has(a.id));
      const rest = all.filter((a) => !named.has(a.id));
      all = [...first, ...rest].slice(0, HOST_LIMITS.assumptions);
    }
    return { ...report, features, edges, checks, assumptions: all, views };
  }

  /**
   * 002.2 DEC-5 / DEC-6: the rules view — the meter, the rules with their
   * actions (shown under each rule by `target.ruleId`), the three entry forms,
   * and the decisions no longer applied: "no longer in the plan" and "from
   * another plot", each with Forget. A section of a newer version: read-only.
   */
  function rulesView(planned, readOnly, writtenBlocks = [], onCounts = undefined) {
    const blocks = [{ kind: 'meter', rules: true }];
    // Sprint 002.22: the rules decided automatically are folded under their own heading, and what is
    // left to decide is listed with what shapes the area first.
    const auto = planned.autoDecided ?? new Map();
    const stillOpen = planned.rules
      .map((rule, index) => ({ rule, index, rank: ruleRank(rule, planned.meta.get(rule.id)) }))
      .filter(({ rule }) => !auto.has(rule.id))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ rule }) => rule);
    // Sprint 002.26: two groups are listed apart, still to confirm by a person: the readings that can be
    // checked against their own text, and the rules that apply without shaping the area.
    const batchOf = (rule) => planned.meta.get(rule.id)?.batch;
    const mainOpen = stillOpen.filter((rule) => batchOf(rule) === undefined);
    const checked = stillOpen.filter((rule) => batchOf(rule) === 'checked');
    const applies = stillOpen.filter((rule) => batchOf(rule) === 'applies');
    const grouped = checked.length + applies.length;
    // « Left to decide » is what no one has decided: a rule the user confirmed or set aside is not left.
    const leftOf = mainOpen.filter((rule) => rule.status !== 'confirmed' && rule.status !== 'not_applicable');
    const BATCH_KEYS = {
      checked: {
        id: 'checked-readings',
        heading: 'fr-urban-rules.batch.checked.heading',
        summary: 'fr-urban-rules.batch.checked.summary',
        explain: 'fr-urban-rules.batch.checked.explain',
        confirm: 'fr-urban-rules.batch.checked.confirm'
      },
      applies: {
        id: 'applies-no-drawing',
        heading: 'fr-urban-rules.batch.applies.heading',
        summary: 'fr-urban-rules.batch.applies.summary',
        explain: 'fr-urban-rules.batch.applies.explain',
        confirm: 'fr-urban-rules.batch.applies.confirm'
      }
    };
    const batchSection = (name, list) => {
      const keys = BATCH_KEYS[name];
      const count = list.length;
      const subject = `${subjectFor(planned.current)}|b=${name}|h=${cyrb53(
        list
          .map((rule) => rule.id)
          .sort()
          .join('\n')
      )}`;
      return {
        kind: 'section',
        id: keys.id,
        title: { key: keys.heading, params: { count } },
        icon: 'rules',
        summary: { value: { key: keys.summary, params: { count } } },
        blocks: [
          { kind: 'notice', tone: 'info', text: { key: keys.explain } },
          { kind: 'rules', ids: list.map((rule) => rule.id) },
          ...(readOnly
            ? []
            : [
                {
                  kind: 'actions',
                  actions: [
                    {
                      id: 'confirm-batch',
                      label: { key: keys.confirm, params: { count } },
                      emphasis: 'primary',
                      target: { subjectId: subject }
                    }
                  ]
                }
              ])
        ]
      };
    };
    const groupBlocks = [
      ...(grouped === 0
        ? []
        : [
            {
              kind: 'notice',
              tone: 'info',
              text: {
                key: 'fr-urban-rules.batch.notice',
                params: { count: grouped }
              }
            }
          ]),
      ...(checked.length === 0 ? [] : [batchSection('checked', checked)]),
      ...(applies.length === 0 ? [] : [batchSection('applies', applies)])
    ];
    // Sprint 002.24: the questions the candidates ask about the project, and what the answers decide.
    const offer = projectOfferOf(planned, stillOpen.length);
    // Sprint 002.23: what the reading's card says it came to, from the very numbers this view shows.
    if (planned.writtenRead?.readZones?.size > 0)
      onCounts?.(
        {
          read: planned.rules.length,
          auto: auto.size,
          left: leftOf.length,
          grouped,
          project: offer.decided,
          ask: offer.unanswered
        },
        planned.writtenRead.readZones,
        offer
      );
    if (auto.size === 0) {
      if (grouped > 0) {
        if (mainOpen.length > 0)
          blocks.push({ kind: 'rules', ids: mainOpen.map((rule) => rule.id) });
        blocks.push(...groupBlocks);
      } else if (planned.rules.length > 0) blocks.push({ kind: 'rules' });
      if (offer.questions.length > 0 || offer.known)
        blocks.push(projectNatureSection(planned, offer, readOnly, projectLabel));
    } else {
      const decidedRules = planned.rules.filter((rule) => auto.has(rule.id));
      const ruledOut = decidedRules.filter((rule) => auto.get(rule.id).decision === 'ruled_out').length;
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text:
          offer.decided > 0
            ? {
                key: 'fr-urban-rules.triage.noticeProject',
                params: { count: auto.size, left: leftOf.length, project: offer.decided }
              }
            : {
                key: 'fr-urban-rules.triage.notice',
                params: { count: auto.size, left: leftOf.length }
              }
      });
      if (mainOpen.length > 0) blocks.push({ kind: 'rules', ids: mainOpen.map((rule) => rule.id) });
      blocks.push(...groupBlocks);
      // Sprint 002.24: the decided ones by what decided them, when more than one thing did.
      const groupOf = (rule) => {
        const decision = auto.get(rule.id);
        if (decision.group === 'project') return 'project';
        if (decision.group === 'folded') return 'folded';
        if (decision.decision === 'informational') return 'info';
        return decision.reason?.key === 'fr-urban-rules.triage.reason.commune'
          ? 'commune'
          : 'sector';
      };
      const groups = ['sector', 'commune', 'info', 'folded', 'project']
        .map((name) => [name, decidedRules.filter((rule) => groupOf(rule) === name)])
        .filter(([, list]) => list.length > 0);
      if (offer.questions.length > 0 || offer.known)
        blocks.push(projectNatureSection(planned, offer, readOnly, projectLabel));
      blocks.push({
        kind: 'section',
        id: 'decided-automatically',
        title: { key: 'fr-urban-rules.triage.heading', params: { count: auto.size } },
        icon: 'rules',
        summary: {
          value:
            offer.decided > 0
              ? {
                  key: 'fr-urban-rules.triage.summaryProject',
                  params: { ruledOut, informational: auto.size - ruledOut, project: offer.decided }
                }
              : {
                  key: 'fr-urban-rules.triage.summary',
                  params: { ruledOut, informational: auto.size - ruledOut }
                }
        },
        blocks: [
          { kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.triage.explain' } },
          ...(groups.length < 2
            ? [{ kind: 'rules', ids: decidedRules.map((rule) => rule.id) }]
            : groups.flatMap(([name, list]) => [
                {
                  kind: 'heading',
                  text: { key: TRIAGE_GROUP_KEYS[name], params: { count: list.length } }
                },
                { kind: 'rules', ids: list.map((rule) => rule.id) }
              ])),
          ...(readOnly
            ? []
            : [
                {
                  kind: 'actions',
                  actions: decidedRules
                    .flatMap((rule) => planned.actionsFor(rule))
                    .slice(0, MAX_ACTIONS)
                }
              ])
        ]
      });
    }
    // 002.6b DEC-2: the written rules' state per zone, under the rules.
    blocks.push(...writtenBlocks);
    if (planned.writtenRead.capped > 0) {
      blocks.push({
        kind: 'notice',
        tone: 'warning',
        text: {
          key: 'fr-urban-rules.notice.writtenCapped',
          params: { count: planned.writtenRead.capped, limit: HOST_LIMITS.rules }
        }
      });
    }
    if (readOnly) {
      blocks.push({
        kind: 'notice',
        tone: 'warning',
        text: { key: 'fr-urban-rules.notice.newerSection' }
      });
      return { id: 'rules', label: { key: 'fr-urban-rules.view.rules' }, blocks };
    }
    // Review fix S1: the host keeps 200 actions in one list. The entered rules
    // and those with a value come first, a rule's actions are kept together,
    // and the rules left without theirs are counted in a notice.
    const rank = (rule) =>
      planned.meta.get(rule.id)?.provenance === 'entered'
        ? 0
        : rule.limit?.kind === 'value'
          ? 1
          : 2;
    const ordered = planned.rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => !auto.has(rule.id))
      .sort((a, b) => rank(a.rule) - rank(b.rule) || a.index - b.index);
    const ruleActions = [];
    let withoutActions = 0;
    for (const { rule } of ordered) {
      const actions = planned.actionsFor(rule);
      if (actions.length === 0) continue;
      if (ruleActions.length + actions.length > MAX_ACTIONS) {
        withoutActions += 1;
        continue;
      }
      ruleActions.push(...actions);
    }
    if (ruleActions.length > 0) blocks.push({ kind: 'actions', actions: ruleActions });
    if (withoutActions > 0) {
      blocks.push({
        kind: 'notice',
        tone: 'warning',
        text: { key: 'fr-urban-rules.notice.actionsCut', params: { count: withoutActions } }
      });
    }
    if (planned.capped > 0) {
      blocks.push({
        kind: 'notice',
        tone: 'warning',
        text: {
          key: 'fr-urban-rules.notice.rulesCapped',
          params: { count: planned.capped, limit: HOST_LIMITS.rules }
        }
      });
    }
    if (planned.duplicates > 0 || planned.suffixed > 0) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: {
          key: 'fr-urban-rules.notice.drawnDuplicates',
          params: { duplicates: planned.duplicates, suffixed: planned.suffixed }
        }
      });
    }
    const addSubject = `${subjectFor(planned.current)}|z=${subjectPart(planned.zone ?? '')}`;
    blocks.push({ kind: 'heading', text: { key: 'fr-urban-rules.heading.enterRule' } });
    blocks.push({
      kind: 'actions',
      actions: Object.entries(ENTRY_FORMS).map(([id, form]) => ({
        id,
        label: { key: form.label },
        target: { subjectId: addSubject },
        fields: entryFields(form.unit, undefined, { band: form.band === true })
      }))
    });
    const list = (entries, headingKey) => {
      if (entries.length === 0) return;
      blocks.push({ kind: 'heading', text: { key: headingKey } });
      blocks.push({
        kind: 'table',
        columns: [
          { key: 'fr-urban-rules.column.rule' },
          { key: 'fr-urban-rules.column.decision' },
          { key: 'fr-urban-rules.column.value' },
          { key: 'fr-urban-rules.column.date' }
        ],
        rows: entries.slice(0, TABLE_ROWS).map(({ entry, kind }) => [
          {
            // 002.6b DEC-7: a written decision is shown by the passage it was confirmed against.
            text: cut(
              kind === 'confirmation'
                ? typeof entry.citation?.passage === 'string' && entry.citation.passage !== ''
                  ? entry.citation.passage
                  : entry.ruleKey
                : String(entry.source?.document ?? entry.key),
              2000
            )
          },
          {
            key:
              kind === 'entered'
                ? 'fr-urban-rules.decision.entered'
                : entry.decision === 'not_applicable'
                  ? 'fr-urban-rules.decision.notApplicable'
                  : 'fr-urban-rules.decision.confirmed'
          },
          storedValue(kind === 'entered' ? entry.limit : entry.value),
          { text: String(entry.at ?? '').slice(0, 10) || '—' }
        ])
      });
      blocks.push({
        kind: 'actions',
        actions: entries.slice(0, MAX_ACTIONS).map(({ entry, kind }, i) => ({
          id: 'forget-entry',
          label: { key: 'fr-urban-rules.action.forget', params: { index: i + 1 } },
          target: { subjectId: forgetSubject(entry, kind) }
        }))
      });
    };
    list(
      planned.stale.map((entry) => ({ entry, kind: 'confirmation' })),
      'fr-urban-rules.heading.noLongerInPlan'
    );
    // 002.6b DEC-7: « n'est plus lu dans le règlement (ou lu autrement) », with Forget.
    list(
      planned.staleWritten.map((entry) => ({ entry, kind: 'confirmation' })),
      'fr-urban-rules.heading.writtenNoLongerRead'
    );
    list(planned.foreign, 'fr-urban-rules.heading.otherPlotRules');
    // 002.6a DEC-4: what a newer version decided — read-only, no Forget.
    if (planned.newer.length > 0) {
      blocks.push({ kind: 'heading', text: { key: 'fr-urban-rules.heading.newerVersionRules' } });
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: {
          key: 'fr-urban-rules.notice.newerVersionRules',
          params: { count: planned.newer.length }
        }
      });
      blocks.push({
        kind: 'table',
        columns: [
          { key: 'fr-urban-rules.column.rule' },
          { key: 'fr-urban-rules.column.value' },
          { key: 'fr-urban-rules.column.date' }
        ],
        rows: planned.newer
          .slice(0, TABLE_ROWS)
          .map((entry) => [
            { text: cut(entry.ruleKey, 2000) },
            storedValue(entry.value),
            { text: String(entry.at ?? '').slice(0, 10) || '—' }
          ])
      });
      if (planned.newer.length > TABLE_ROWS) {
        blocks.push({
          kind: 'notice',
          tone: 'info',
          text: {
            key: 'fr-urban-rules.notice.notListed',
            params: { count: planned.newer.length - TABLE_ROWS }
          }
        });
      }
    }
    return { id: 'rules', label: { key: 'fr-urban-rules.view.rules' }, blocks };
  }

  /** Review fix S6: the value a decision stored, with its unit, or a dash. */
  function storedValue(value) {
    return value?.kind === 'value' && Number.isFinite(value.value) && SDK_UNITS.has(value.unit)
      ? { value: value.value, unit: value.unit }
      : { text: '—' };
  }

  /**
   * 002.3 DEC-8: whether the retired `urban-rules` package's planning stage is
   * registered — it is only while that extension runs. Asked at each read, since
   * activation order is not promised; the `package` service has no "enabled".
   */
  function retiredStageRunning() {
    try {
      return (aiOf()?.listPlanningStages?.() ?? []).some((stage) => stage?.id === RETIRED_STAGE_ID);
    } catch {
      return false;
    }
  }

  /** 002.2 DEC-4 / DEC-6: the overview says a new version reopened rules, and where to find a règlement. */
  function overviewWith(overview, planned, regime, replaced = false, watch = undefined) {
    const notices = [];
    if (replaced) {
      notices.push({
        kind: 'notice',
        tone: 'warning',
        text: { key: 'fr-urban-rules.notice.replacesUrbanRules' }
      });
    }
    // Sprint 002.10 DEC-3: confirmations that name an earlier *document* than the one in
    // force — a new version, not only a newer date — are said as such, with the day it was
    // published when the service's watch gave it for this document, else the day it applies from.
    if (planned.reopenedByDocument > 0) {
      const published =
        watch?.publicationDate !== undefined &&
        String(watch.originalName).toUpperCase() === String(planned.documentVersion).toUpperCase()
          ? watch.publicationDate
          : undefined;
      const date = published ?? planned.documentValidFrom;
      notices.push({
        kind: 'notice',
        tone: 'warning',
        text:
          date === undefined
            ? {
                key: NEW_DOCUMENT_VERSION_UNDATED_KEY,
                params: { count: planned.reopenedByDocument }
              }
            : {
                key: NEW_DOCUMENT_VERSION_KEY,
                params: { date, count: planned.reopenedByDocument }
              },
        actions: [
          { id: 'review', label: { key: 'fr-urban-rules.action.review' }, opensView: 'rules' }
        ]
      });
    }
    if (planned.reopened > 0) {
      notices.push({
        kind: 'notice',
        tone: 'warning',
        text: { key: 'fr-urban-rules.notice.rulesReopened', params: { count: planned.reopened } },
        actions: [
          { id: 'review', label: { key: 'fr-urban-rules.action.review' }, opensView: 'rules' }
        ]
      });
    }
    if (regime === 'not_published') {
      notices.push({
        kind: 'notice',
        tone: 'info',
        text: { key: 'fr-urban-rules.notice.askTownHall' }
      });
    }
    if (notices.length === 0) return overview;
    const at = overview.findIndex((b) => b.kind === 'flags');
    return at === -1
      ? [...overview, ...notices]
      : [...overview.slice(0, at), ...notices, ...overview.slice(at)];
  }

  /** An edge's letter as the host's panel writes it: 1 → A … 26 → Z, 27 → AA (the same arithmetic as the host's). */
const edgeLetter = (number) => {
  let rest = Math.max(1, Math.floor(number));
  let letters = '';
  while (rest > 0) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
    rest = Math.floor((rest - 1) / 26);
  }
  return letters;
};

/** DEC-5: the edges view — the plot view and edge list (002.13), one action per edge, and the corrections not applied. */
  function edgesView(edges, reportEdges, corrections, plot, readOnly) {
    const label = { key: 'fr-urban-rules.view.edges' };
    if (edges === undefined) {
      return {
        id: 'edges',
        label,
        blocks: [
          { kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.notice.noBoundary' } }
        ]
      };
    }
    // 002.13 DEC-1: the host draws the plot view and the edge list (platform 096.22, SDK 1.36) from
    // the report's own edges, checks and envelope; the table that stood here — number, role,
    // length, why — is the edge list's letter, role and assumption chip. The length is dropped
    // (the owner's answer to 002.13 question 1): the letter on the plot view identifies an edge.
    const blocks = [{ kind: 'plot-plan', categories: ['envelope'] }, { kind: 'edges' }];
    if (readOnly) {
      blocks.push({
        kind: 'notice',
        tone: 'warning',
        text: { key: 'fr-urban-rules.notice.newerSection' }
      });
      return { id: 'edges', label, blocks };
    }
    blocks.push({
      kind: 'actions',
      actions: edges.slice(0, MAX_ACTIONS).map((e) => ({
        id: 'set-edge-role',
        // 002.13: the host letters the edges in the panel (platform 096.22: 1 → A, 27 → AA), so the
        // button names the edge by the letter the plot view and the edge list show.
        label: { key: 'fr-urban-rules.edges.setRole', params: { edge: edgeLetter(e.edge) } },
        target: { subjectId: endsKey(e.a, e.b) },
        fields: [
          {
            key: 'role',
            label: { key: 'fr-urban-rules.edges.role' },
            kind: 'choice',
            required: true,
            initial: reportEdges.find((r) => r.edge === e.edge)?.role ?? 'side',
            options: EDGE_ROLES.map((role) => ({ value: role, label: { key: ROLE_KEYS[role] } }))
          }
        ]
      }))
    });
    if (edges.length > MAX_ACTIONS) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: { key: 'fr-urban-rules.notice.tooManyEdges', params: { count: MAX_ACTIONS } }
      });
    }
    const unapplied = corrections.filter(
      (c) => !samePlot(c.plot, plot) || !edges.some((e) => sameEnds(c.ends, e.a, e.b))
    );
    if (unapplied.length > 0) {
      const group = (entries, key) => {
        if (entries.length === 0) return;
        blocks.push({ kind: 'heading', text: { key } });
        blocks.push({
          kind: 'table',
          columns: [
            { key: 'fr-urban-rules.edges.column.ends' },
            { key: 'fr-urban-rules.edges.column.role' }
          ],
          rows: entries.slice(0, TABLE_ROWS).map((c) => [
            {
              text: c.ends.map((p) => `${cm(p[0]).toFixed(2)} ${cm(p[1]).toFixed(2)}`).join(' → ')
            },
            { key: ROLE_KEYS[c.role] }
          ])
        });
        blocks.push({
          kind: 'actions',
          actions: entries.slice(0, MAX_ACTIONS).map((c, i) => ({
            id: 'forget-edge-role',
            label: { key: 'fr-urban-rules.edges.forget', params: { index: i + 1 } },
            target: { subjectId: entrySubject(c) }
          }))
        });
      };
      group(
        unapplied.filter((c) => samePlot(c.plot, plot)),
        'fr-urban-rules.edges.noLongerMatching'
      );
      group(
        unapplied.filter((c) => !samePlot(c.plot, plot)),
        'fr-urban-rules.edges.otherPlot'
      );
    }
    return { id: 'edges', label, blocks };
  }

  /**
   * DEC-5: `set-edge-role` and `forget-edge-role`. One write, with `expected`
   * the section read; `done` without a report — the write changes the host's
   * Site key and its re-read (`site`) is answered from the plot cache.
   */
  async function runAction(request) {
    // Never a throw for an expected outcome (096.3b): a section that cannot be
    // read, a write that throws, anything else — a refusal with its reason.
    try {
      return await runEdgeAction(request);
    } catch (cause) {
      return {
        status: 'refused',
        message: {
          key: 'fr-urban-rules.edges.writeFailed',
          params: { reason: cut(cause instanceof Error ? cause.message : String(cause), 500) }
        }
      };
    }
  }

  async function runEdgeAction(request) {
    const data = packageData();
    if (data === undefined || typeof data.write !== 'function') {
      return { status: 'refused', message: { key: 'fr-urban-rules.edges.noSection' } };
    }
    const before = data.read();
    const { section, readOnly } = sectionOf(before);
    if (readOnly)
      return { status: 'refused', message: { key: 'fr-urban-rules.notice.newerSection' } };
    let next;
    if (request.actionId === 'set-edge-role') {
      const role = request.values?.role;
      const ends = parseEnds(request.target?.subjectId);
      if (!EDGE_ROLES.includes(role) || ends === undefined) {
        return { status: 'refused', message: { key: 'fr-urban-rules.edges.changed' } };
      }
      const edge = (boundaryEdges(request.site) ?? []).find((e) => sameEnds(ends, e.a, e.b));
      if (edge === undefined)
        return { status: 'refused', message: { key: 'fr-urban-rules.edges.changed' } };
      next = withEdgeRole(
        section,
        plotIdsOf(request.site),
        [
          [cm(edge.a.easting), cm(edge.a.northing)],
          [cm(edge.b.easting), cm(edge.b.northing)]
        ],
        role,
        now().toISOString()
      );
    } else if (request.actionId === 'forget-edge-role') {
      next = withoutEdgeRole(section, request.target?.subjectId);
      if (next === undefined)
        return { status: 'refused', message: { key: 'fr-urban-rules.edges.changed' } };
    } else if (request.actionId === 'show-exclusions' || request.actionId === 'hide-exclusions') {
      // Sprint 002.20: whether the areas taken out are drawn on this plot (red, on the plan and in 3D).
      next = withExclusionsShown(
        section,
        plotIdsOf(request.site),
        request.actionId === 'show-exclusions',
        now().toISOString()
      );
    } else if (request.actionId === 'set-project-nature') {
      // Sprint 002.24: the project's nature, from the panel's form (the card's chips write the same member).
      next = withProjectNature(
        section,
        natureFromValues(request.values, projectNatureOf(section)),
        undefined,
        now().toISOString()
      );
    } else if (request.actionId === 'set-exclusion' || request.actionId === 'forget-exclusion') {
      // Sprint 002.17 DEC-2: one choice on an exclusion area, stamped with the document it was read in.
      const fields = subjectFields(request.target?.subjectId);
      const changed = { status: 'refused', message: { key: 'fr-urban-rules.edges.changed' } };
      if (typeof fields.k !== 'string' || fields.k === '') return changed;
      if (request.actionId === 'set-exclusion') {
        if (!EXCLUSION_CHOICES.includes(fields.c) || fields.i === undefined || fields.d === undefined)
          return changed;
        next = withExclusionChoice(
          section,
          plotIdsOf(request.site),
          fields.k,
          fields.c,
          versionOf(fields.i, fields.d),
          now().toISOString()
        );
      } else {
        next = withoutExclusionChoice(section, plotIdsOf(request.site), fields.k);
        if (next === undefined) return changed;
      }
    } else {
      // Sprint 002.3: the Surfaces answers, keyed by the open variation.
      const site = siteOf();
      const surface = nextSurfaceSection(
        section,
        request,
        variationKeyOf(site),
        site?.measures === undefined ? [] : projectBuildings(site)
      );
      // Sprint 002.2: the decisions on rules, the entered rules, Forget.
      const built = surface ?? nextSection(section, request, plotIdsOf(request.site));
      if (built.refused !== undefined) return { status: 'refused', message: built.refused };
      next = built.next;
    }
    const edgeAction =
      request.actionId === 'set-edge-role' ||
      request.actionId === 'forget-edge-role' ||
      request.actionId === 'set-exclusion' ||
      request.actionId === 'forget-exclusion' ||
      request.actionId === 'show-exclusions' ||
      request.actionId === 'hide-exclusions' ||
      request.actionId === 'set-project-nature';
    const label = cut(
      translate(
        Object.hasOwn(UNDO_KEYS, request.actionId)
          ? UNDO_KEYS[request.actionId]
          : 'fr-urban-rules.undo.edgeRole'
      ) ?? 'Planning rules',
      LABEL_MAX
    );
    try {
      const written = data.write(next, label, before ?? null);
      return written
        ? { status: 'done' }
        : {
            status: 'refused',
            message: {
              key: edgeAction ? 'fr-urban-rules.edges.stale' : 'fr-urban-rules.rules.stale'
            }
          };
    } catch (cause) {
      return {
        status: 'refused',
        message: {
          key: 'fr-urban-rules.edges.writeFailed',
          params: { reason: cut(cause instanceof Error ? cause.message : String(cause), 500) }
        }
      };
    }
  }

  // ── Sprint 002.1b: the opposite alignment, R.111-16, R.111-15, R.111-28, bands ──

  /** Ring digest (else the plot) → `{ streetKey, parcels, el7, buildings }`: per Site, per session. */
  const contextCache = new Map();
  /**
   * Sprint 002.8 (RD-6, DEC-5, DEC-2): context key → the last read's answer for
   * that Site — `{ documentVersion, ruleIds, inputs, report, open }`, its own
   * inputs and the measures its checks were computed from. Session memory,
   * bounded as the other caches; what `checkVariation`, the questions and the
   * programme warning read, never a network call.
   */
  const lastReads = new Map();
  const contextKey = (site) => ringDigest(site) ?? `plot#${plotIdsOf(site).join(',')}`;
  const contextKnown = (site) => contextCache.get(contextKey(site));

  /** A source answer: `{ features }`, `{ refused }`, or `{ features: [], noSource }` when nothing serves the kind. */
  const queryFeatures = async (kind, query) => {
    const service = mapFeaturesOf();
    const retrievedAt = now().toISOString();
    if (service === undefined || typeof service.queryFeatures !== 'function') {
      return { features: [], noSource: true, retrievedAt };
    }
    try {
      const listed =
        typeof service.listFeatureSources === 'function' ? service.listFeatureSources() : undefined;
      if (Array.isArray(listed) && !listed.some((source) => source?.kind === kind)) {
        return { features: [], noSource: true, retrievedAt };
      }
      const answer = await service.queryFeatures(kind, query);
      return Array.isArray(answer)
        ? { features: answer, retrievedAt }
        : { refused: String(answer?.refused ?? 'unknown'), retrievedAt };
    } catch (cause) {
      return { refused: cause instanceof Error ? cause.message : String(cause), retrievedAt };
    }
  };

  /** The edges that are street edges now: derived from the roads, or set by the user. */
  function streetEdgesOf(site, roads, edges) {
    const plot = plotIdsOf(site);
    const { section, readOnly } = readSection();
    const corrections = readOnly ? [] : edgeRolesOf(section);
    const derived = deriveRoles(edges, roads).roles;
    return edges.filter((e) => {
      const set = corrections.find((c) => samePlot(c.plot, plot) && sameEnds(c.ends, e.a, e.b));
      return (set?.role ?? derived.get(e.edge)?.role) === 'street';
    });
  }

  /**
   * B1: the corridors across the street edges, as WGS84 — each edge, and the
   * same edge carried outward past the road's centreline by the search
   * distance. API Carto answers the features a geometry intersects, so an EL7
   * line across the road is asked for with these, never with the plot.
   */
  function corridors(streets, roads, service) {
    const polygons = [];
    for (const edge of streets) {
      const reach = (centreOf(edge, roads)?.s ?? 0) + FACING_SEARCH;
      const [far0, far1] = shiftedEdge(edge, reach);
      const ring = service.toGeographicRing([edge.a, edge.b, far1, far0]);
      if (ring === undefined) return undefined;
      const closed = ring.map(({ longitude, latitude }) => [round7(longitude), round7(latitude)]);
      closed.push(closed[0]);
      polygons.push([closed]);
    }
    return { type: 'MultiPolygon', coordinates: polygons };
  }

  /**
   * DEC-1 / DEC-4's context, once per Site per session (again on `refresh`),
   * for `rnu` and `cc` only: the EL7 alignment easements across the street
   * edges (through the planning reads' own fetch), the parcels facing them (one
   * query over their box grown by 40 m, limit 200), and the buildings around
   * the Site boundary (grown by 50 m, limit 500). Asked again when the street
   * edges change; built on a copy and kept only by a read that was not
   * superseded (should-fix 5).
   */
  async function contextFor(site, roads, signal, refresh) {
    const key = contextKey(site);
    const before = (!refresh && contextCache.get(key)) || {};
    const next = { ...before };
    const edges = boundaryEdges(site);
    const service = siteOf();
    if (edges !== undefined && roads !== undefined) {
      const streets = streetEdgesOf(site, roads, edges);
      const streetKey = streets.map((e) => endsKey(e.a, e.b)).join('|');
      if (before.streetKey !== streetKey) {
        let parcels;
        let el7;
        if (streets.length > 0) {
          let geometry;
          try {
            geometry = service === undefined ? undefined : corridors(streets, roads, service);
          } catch (cause) {
            log(
              `${SOURCE_ID}: the corridors across the road could not be converted: ${String(cause)}`
            );
          }
          [parcels, el7] = await Promise.all([
            queryFeatures(
              'parcel',
              boxQuery(
                streets.flatMap((e) => [e.a, e.b]),
                FACING_SEARCH,
                site.crs,
                200
              )
            ),
            geometry === undefined
              ? Promise.resolve({ refused: 'unprojected', retrievedAt: now().toISOString() })
              : fetchEl7(geometry, signal).then((answer) => el7Lines(answer, service))
          ]);
        }
        next.streetKey = streetKey;
        next.parcels = parcels;
        next.el7 = el7;
      }
    }
    if (next.buildings === undefined) {
      const around =
        edges !== undefined
          ? edges.map((e) => e.a)
          : (site.parcels ?? []).flatMap((p) => (p.rings ?? []).flatMap((r) => openRing(r)));
      if (around.length > 0) {
        next.buildings = await queryFeatures(
          'building',
          boxQuery(around, NEIGHBOUR_RADIUS, site.crs, 500)
        );
      }
    }
    if (!signal.aborted) remembered(contextCache, key, next);
    return next;
  }

  /** The EL7 answer as lines in the Site's CRS: lines as they are, surfaces by their outer rings. */
  function el7Lines(answer, service) {
    if (answer.features === undefined) return answer;
    const lines = [];
    for (const feature of answer.features) {
      const geometry = convertGeometry(feature?.geometry, service);
      if (geometry.unconverted) continue;
      for (const line of geometry.lines ?? []) lines.push(line);
      for (const ring of geometry.rings ?? []) lines.push([...ring, ring[0]]);
    }
    return { lines, retrievedAt: answer.retrievedAt };
  }

  /** The road nearest a street edge's midpoint, on its outward side: `{ s, width, widthAssumed, road }`. */
  function centreOf(edge, roads) {
    let best;
    for (const road of roads?.segments ?? []) {
      if (!STREET_KINDS.has(road.kind) || !STREET_LEVELS.has(road.level)) continue;
      const near = nearestOnLine(road.line ?? [], edge.mid);
      if (near === undefined) continue;
      const s = inEdgeFrame(edge, near.point).s;
      if (s <= 0) continue;
      if (best === undefined || near.distance < best.distance) {
        const known = typeof road.widthMetres === 'number' && road.widthMetres > 0;
        best = {
          distance: near.distance,
          s,
          road,
          width: known ? road.widthMetres : ASSUMED_ROAD_WIDTH,
          widthAssumed: !known
        };
      }
    }
    return best;
  }

  /**
   * DEC-1: each street edge's opposite alignment, in order of preference — an
   * EL7 alignment easement beyond the road's centreline (the nearest, read per
   * station), the facing cadastral parcels (the nearest row), the carriageway's
   * true far edge. `{ edge, path, points, offset }`, `offset` the alignment's
   * mean outward distance; or `{ edge, reason }`. `path` `carriageway-unread`
   * when the parcels could not be read.
   */
  function alignmentsFor(edges, roleOf, roads, context, plotIds) {
    const alignments = new Map();
    const el7 = (context?.el7?.lines ?? []).flatMap(segmentsOf);
    for (const edge of edges) {
      if (roleOf.get(edge.edge)?.role !== 'street') continue;
      const finish = (path, points, extra = {}) => {
        const offset = points.reduce((sum, p) => sum + inEdgeFrame(edge, p).s, 0) / points.length;
        alignments.set(edge.edge, { edge: edge.edge, path, points, offset, ...extra });
      };
      const centre = centreOf(edge, roads);
      const sMin = centre?.s ?? NEAR_SIDE_WITHOUT_CENTRE;
      const easement =
        el7.length === 0 ? undefined : nearestAlong(edge, el7, sMin, sMin + FACING_SEARCH);
      if (easement !== undefined) {
        finish('el7', easement);
        continue;
      }
      const parcels = context?.parcels;
      const chain =
        parcels?.features === undefined || parcels.features.length === 0
          ? undefined
          : nearestAlong(
              edge,
              facingSegments(edge, parcels.features, plotIds),
              centre?.s ?? 0,
              FACING_SEARCH
            );
      if (chain !== undefined) {
        finish('parcels', chain);
        continue;
      }
      const far =
        centre === undefined ? undefined : carriagewayFarEdge(edge, centre.road, centre.width);
      if (far !== undefined) {
        const unread =
          parcels !== undefined && (parcels.refused !== undefined || parcels.noSource === true);
        finish(unread ? 'carriageway-unread' : 'carriageway', far, {
          widthAssumed: centre.widthAssumed
        });
        continue;
      }
      alignments.set(edge.edge, {
        edge: edge.edge,
        reason: roads?.refused !== undefined ? 'roads-unavailable' : 'no-road'
      });
    }
    return alignments;
  }

  /**
   * One building's distances, the 002.1a way: `withRoofOverhangs`, `storeys`
   * when a roof refuses; the main building asked without an id and named from
   * the answer. `{ answer, extra, id }`.
   */
  function askDistances(service, building, targets, ratios) {
    const ask = (outline) =>
      service.measures.distances({
        ...(building.id === undefined ? {} : { buildingId: building.id }),
        outline,
        targets,
        ...(ratios === undefined ? {} : { ratios })
      });
    let answer = ask('withRoofOverhangs');
    const extra = [];
    if (!answer.available && answer.reason === 'outline-refused') {
      const storeys = ask('storeys');
      if (storeys.available) {
        answer = storeys;
        extra.push('roof-overhangs-unread');
      }
    }
    const id =
      building.id ??
      (answer.available && typeof answer.buildingId === 'string' ? answer.buildingId : undefined);
    return { answer, extra, id };
  }

  const isNoBuilding = (building, answer) =>
    building.id === undefined &&
    !answer.available &&
    (answer.reason === 'no-rooms' || answer.reason === 'unknown-building');

  /** DEC-2: R.111-16, from every building to each street edge's opposite alignment, ratio 1. */
  function r11116Checks(service, site, buildings, alignments, roleOf, note, assume) {
    const checks = [];
    const extent = site.terrain?.extent;
    const outside = (points) =>
      extent !== undefined &&
      points.some(
        (p) =>
          p.easting < extent.minEasting ||
          p.easting > extent.maxEasting ||
          p.northing < extent.minNorthing ||
          p.northing > extent.maxNorthing
      );
    const entries = [...alignments.values()];
    const seen = new Set();
    if (entries.filter((a) => a.points !== undefined).length > MAX_LINE_TARGETS) {
      assume('line-targets-capped', {
        key: 'fr-urban-rules.assumption.lineTargetsCapped',
        params: { count: MAX_LINE_TARGETS }
      });
    }
    for (const building of buildings) {
      if (building.id !== undefined && seen.has(building.id)) continue;
      const label = (edge) =>
        building.name === undefined
          ? { key: 'fr-urban-rules.check.subject.r11116', params: { edge } }
          : {
              key: 'fr-urban-rules.check.subject.r11116Named',
              params: { building: cut(building.name, 200), edge }
            };
      const make = (edge, id, fields, assumptionIds) => ({
        id: `r111-16:${id ?? 'main'}:${edge}`,
        ruleId: 'rnu:R.111-16',
        subject: { kind: 'building', ...(id === undefined ? {} : { id }), label: label(edge) },
        ...fields,
        assumptionIds: [...assumptionIds, roleOf.get(edge)?.assumptionId].filter(Boolean)
      });
      const measurable = entries
        .filter((a) => a.points !== undefined && !outside(a.points))
        .slice(0, MAX_LINE_TARGETS);
      let { answer, extra, id } =
        measurable.length === 0
          ? { answer: { available: true, targets: [] }, extra: [], id: building.id }
          : askDistances(
              service,
              building,
              measurable.map((a) => ({ kind: 'line', points: a.points })),
              [1]
            );
      if (measurable.length > 0 && isNoBuilding(building, answer)) continue;
      if (measurable.length === 0 && building.id === undefined) {
        // With nothing to measure, a main building is known only from its projection.
        const main = service.measures.projection();
        if (!main.available) continue;
        id = main.buildingId;
      }
      if (id !== undefined) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      for (const a of entries) {
        if (a.points === undefined) {
          checks.push(make(a.edge, id, { result: 'not_checked' }, [note(a.reason)]));
        } else if (outside(a.points)) {
          checks.push(
            make(a.edge, id, { result: 'not_checked' }, [
              `alignment-${a.path}`,
              note('alignment-outside-terrain')
            ])
          );
        }
      }
      measurable.forEach((a, index) => {
        const base = [`alignment-${a.path}`, 'balconies-not-modelled', ...extra];
        if (!answer.available) {
          checks.push(make(a.edge, id, { result: 'not_checked' }, [...base, note(answer.reason)]));
          return;
        }
        const target = answer.targets[index];
        const worst = (target?.worst ?? []).find((w) => w.ratio === 1);
        if (target === undefined || target.unavailable !== undefined || worst === undefined) {
          checks.push(
            make(a.edge, id, { result: 'not_checked' }, [
              ...base,
              note(target?.unavailable ?? 'unavailable')
            ])
          );
          return;
        }
        if (typeof worst.rise === 'object') {
          checks.push(
            make(a.edge, id, { result: 'not_checked' }, [
              ...base,
              note(worst.rise.unavailable ?? 'unavailable')
            ])
          );
          return;
        }
        checks.push(
          make(
            a.edge,
            id,
            {
              measured: { value: mm(worst.distance), unit: 'm' },
              limit: { value: mm(Math.max(0, worst.rise)), unit: 'm' },
              result: worst.margin >= -RESOLUTION_HALF ? 'no_issue' : 'potential_issue',
              figure: { dimension: { from: worst.building, to: worst.target } }
            },
            [...base, ...(worst.datumDerived === true ? ['datum-derived'] : [])]
          )
        );
      });
    }
    return checks;
  }

  /** The outer rings of a part: a ring wound against the largest is a hole, never a target. */
  function outerRingsOf(part) {
    const rings = (part.rings ?? [])
      .map((ring) => openRing(ring))
      .filter((ring) => ring.length >= 3);
    if (rings.length === 0) return [];
    const largest = rings.reduce((big, ring) =>
      Math.abs(signedRingArea(ring)) > Math.abs(signedRingArea(big)) ? ring : big
    );
    const sign = Math.sign(signedRingArea(largest));
    return rings.filter((ring) => Math.sign(signedRingArea(ring)) === sign);
  }

  /**
   * DEC-3: R.111-15 between each pair of the project's buildings (a `building`
   * target), and between each and a kept or extended existing building (a
   * `line` per outer ring). The real result, whatever the rule's status. Within
   * 5 cm — 002.1a's adjoining tolerance — two buildings are contiguous, an
   * attached existing part included, and not checked (should-fix 6).
   */
  function r11115Checks(service, site, mainId, named, note) {
    const project = [
      ...(mainId === undefined ? [] : [{ id: mainId, name: undefined }]),
      ...named.filter((b) => b.id !== mainId)
    ];
    const name = (b) =>
      b.name === undefined ? { main: true } : { main: false, text: cut(b.name, 200) };
    const checks = [];
    const relation = site.existingBuilding?.relation ?? 'kept';
    const parts = relation === 'replaced' ? [] : (site.existingBuilding?.parts ?? []);
    const evaluate = (from, targets, labelOf, idOf) => {
      if (targets.length === 0) return;
      const { answer, extra } = askDistances(
        service,
        from,
        targets.map((t) => t.target)
      );
      targets.forEach((t, index) => {
        const base = ['balconies-not-modelled', 'contiguous-tolerance', ...extra];
        const make = (fields, assumptionIds) => ({
          id: idOf(t),
          ruleId: 'rnu:R.111-15',
          subject: { kind: 'building', id: from.id, label: labelOf(t) },
          ...fields,
          assumptionIds: [...base, ...assumptionIds]
        });
        if (!answer.available)
          return checks.push(make({ result: 'not_checked' }, [note(answer.reason)]));
        const measured = answer.targets[index];
        if (
          measured === undefined ||
          measured.unavailable !== undefined ||
          measured.nearest === undefined
        ) {
          return checks.push(
            make({ result: 'not_checked' }, [note(measured?.unavailable ?? 'unavailable')])
          );
        }
        const d = measured.nearest.distance;
        if (d <= ADJOINING.distance) return undefined; // contiguous: R.111-15 is about non-contiguous buildings
        return checks.push(
          make(
            {
              measured: { value: mm(d), unit: 'm' },
              limit: { value: R111_17.minimum, unit: 'm' },
              result: d >= R111_17.minimum - RESOLUTION_HALF ? 'no_issue' : 'potential_issue',
              figure: {
                dimension: { from: measured.nearest.building, to: measured.nearest.target }
              }
            },
            []
          )
        );
      });
    };
    project.forEach((from, i) => {
      const others = project.slice(i + 1).slice(0, MAX_LINE_TARGETS);
      evaluate(
        from,
        others.map((other) => ({ other, target: { kind: 'building', buildingId: other.id } })),
        (t) => {
          const [a, b] = [name(from), name(t.other)];
          return a.main
            ? { key: 'fr-urban-rules.check.subject.r11115Main', params: { other: b.text ?? '' } }
            : b.main
              ? { key: 'fr-urban-rules.check.subject.r11115Main', params: { other: a.text } }
              : {
                  key: 'fr-urban-rules.check.subject.r11115Pair',
                  params: { a: a.text, b: b.text }
                };
        },
        (t) => `r111-15:${from.id}:${t.other.id}`
      );
      const lines = parts
        .flatMap((part) =>
          outerRingsOf(part).map((open, r) => ({
            part,
            key: `${part.featureId}.${r}`,
            target: { kind: 'line', points: [...open, open[0]] }
          }))
        )
        .slice(0, MAX_LINE_TARGETS);
      evaluate(
        from,
        lines,
        (t) => ({
          key:
            from.name === undefined
              ? 'fr-urban-rules.check.subject.r11115ExistingMain'
              : 'fr-urban-rules.check.subject.r11115Existing',
          params: {
            part: cut(t.part.label ?? '', 200),
            ...(from.name === undefined ? {} : { building: cut(from.name, 200) })
          }
        }),
        (t) => `r111-15:${from.id}:existing:${t.key}`
      );
    });
    return checks;
  }

  /** Memoized per answer and boundary: the filter runs once a Site, not on every design read. */
  const neighbourMemo = new WeakMap();

  /**
   * DEC-4: the neighbours' average height, within 50 m of the Site boundary
   * (else the plot) — box-prefiltered, the plot's own existing building out,
   * light structures (a shed, a veranda) counted apart and left out of the
   * average, said.
   */
  function neighboursOf(site, edges, context) {
    const answer = context?.buildings;
    if (answer === undefined) return undefined;
    if (answer.refused !== undefined) return { refused: answer.refused };
    if (answer.noSource === true) return { noSource: true };
    const segments =
      edges !== undefined
        ? edges.map((e) => [e.a, e.b])
        : (site.parcels ?? []).flatMap((p) =>
            (p.rings ?? []).flatMap((r) => {
              const open = openRing(r);
              return open.map((a, i) => [a, open[(i + 1) % open.length]]);
            })
          );
    const memoKey = `${segments.length}:${segments.map(([a]) => pointKey(a)).join(';')}:${[...(site.existingBuilding?.parts ?? [])].map((p) => p.featureId).join(',')}`;
    const memo = neighbourMemo.get(answer);
    if (memo?.key === memoKey) return memo.value;
    const box = boxQuery(segments.flat(), NEIGHBOUR_RADIUS, '', 0);
    const own = new Set((site.existingBuilding?.parts ?? []).map((part) => String(part.featureId)));
    const near = answer.features.filter(
      (f) =>
        !own.has(String(f.id)) &&
        (f.rings ?? []).some((ring) =>
          ring.some(
            (p) =>
              p.easting >= box.minEasting &&
              p.easting <= box.maxEasting &&
              p.northing >= box.minNorthing &&
              p.northing <= box.maxNorthing &&
              segments.some(([a, b]) => pointSegmentDistance(p, a, b) <= NEIGHBOUR_RADIUS)
          )
        )
    );
    const solid = near.filter((f) => f.lightweight !== true);
    const heights = solid
      .map((f) => f.height?.roofMetres ?? f.height?.eavesMetres)
      .filter((h) => typeof h === 'number' && Number.isFinite(h));
    const value = {
      count: solid.length,
      missing: solid.length - heights.length,
      lightweight: near.length - solid.length,
      average:
        heights.length === 0 ? undefined : heights.reduce((s, h) => s + h, 0) / heights.length
    };
    neighbourMemo.set(answer, { key: memoKey, value });
    return value;
  }

  /**
   * DEC-5 (B2): per edge, derived `setback-band` lines — side and rear edges at
   * the 3 m minimum of R.111-17, and every checked edge at its check's current
   * limit (R.111-17's from the edge, R.111-16's from the opposite alignment's
   * mean distance) — each the edge shifted inward and **clipped to the Site
   * boundary**, so a band on a triangle or an L-shaped plot stays on it. Never
   * a polygon inset (002.7 owns the envelope).
   */
  function bandsFor(edges, roleOf, checks, alignments, ring, budget) {
    const bands = new Map();
    const add = (edge, offset, label) => {
      if (offset >= 0) return; // outside the Site boundary: no band on the plot
      // Past the features the host takes, a band would be dropped: none is drawn.
      if (bands.size >= budget) return;
      const key = `${edge.edge}:${mm(-offset)}`;
      if (bands.has(key)) return;
      const [p, q] = shiftedEdge(edge, offset);
      clipToRing(p, q, ring).forEach((piece, k) => {
        bands.set(k === 0 ? key : `${key}:${k}`, {
          id: `band:${key}${k === 0 ? '' : `:${k}`}`,
          category: 'setback-band',
          official: false,
          line: piece,
          label
        });
      });
      if (!bands.has(key)) bands.set(key, undefined);
    };
    const byNumber = new Map(edges.map((e) => [e.edge, e]));
    for (const edge of edges) {
      if (roleOf.get(edge.edge)?.role !== 'street') {
        add(edge, -R111_17.minimum, {
          key: 'fr-urban-rules.band.minimum',
          params: { distance: R111_17.minimum }
        });
      }
    }
    for (const check of checks) {
      if (check.limit === undefined) continue;
      const [rule, , edgeText] = check.id.split(':');
      const edge = byNumber.get(Number(edgeText));
      if (edge === undefined) continue;
      if (rule === 'r111-17') {
        add(edge, -check.limit.value, {
          key: 'fr-urban-rules.band.atHeight',
          params: { distance: check.limit.value, article: 'R.111-17' }
        });
      } else if (rule === 'r111-16') {
        const alignment = alignments.get(edge.edge);
        if (alignment?.offset !== undefined) {
          add(edge, alignment.offset - check.limit.value, {
            key: 'fr-urban-rules.band.atHeight',
            params: { distance: check.limit.value, article: 'R.111-16' }
          });
        }
      }
    }
    return [...bands.values()].filter((band) => band !== undefined);
  }

  // ── Sprint 002.2: drawn and entered rules, decisions, checks, envelope ─────────

  // ── Sprint 002.6b: written rules ──────────────────────────────────────────────

  /**
   * DEC-3: every zone's current extraction, as rules — the sector filter
   * first, then the key, the limit, the citation. `{ items: [{ rule, info }],
   * readZones, perZone }`: the zones whose extraction reads the current
   * version, and per zone the counts the Rules view says.
   */
  function writtenRulesOf(written, docBase, version, room = HOST_LIMITS.rules, context = {}) {
    const items = [];
    const readZones = new Set();
    const perZone = new Map();
    const seen = new Set();
    let capped = 0;
    // Review NIT: zones in a fixed order, so `~n` and the first zone's rule do not
    // depend on the order the GPU lists them in.
    const zones = [...(written?.zones ?? [])].sort((a, b) =>
      a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : 0
    );
    for (const { zone, query, record } of zones) {
      const result = record?.result;
      if (result === undefined) continue;
      if (
        result.document.idurba.toUpperCase() !== query.idurba.toUpperCase() ||
        result.document.nomfic !== query.nomfic
      )
        continue; // DEC-7: another version's rules are never shown
      // Review NIT: a partial result reads too little to say a key is no longer read.
      if (result.chunks.failed === 0) readZones.add(zone);
      let shown = 0;
      let others = 0;
      // Sprint 002.11 DEC-5: one computation of the keys, which a restored rule's stored key joins.
      const keys = writtenKeysOf(result, zone);
      // Sprint 002.22 (e): the same text read for several sectors is one card.
      const folded = foldedSectors(
        result.rules,
        keys,
        zone,
        context.keep ?? new Set(),
        // Sprint 002.26: a candidate another cause decided takes no part in the folds.
        (index) =>
          triageOf({ item: result.rules[index], zone, commune: context.commune }) === undefined
      );
      for (const [index, item] of result.rules.entries()) {
        const id = keys[index];
        if (id === undefined) {
          others += 1;
          continue;
        }
        // Two zones of one chapter read one extraction: its rule is listed once.
        if (seen.has(id)) continue;
        seen.add(id);
        if (folded.get(index)?.drop === true) continue;
        // Review NIT: never past the host's 1,000 rules; the rest are counted and said.
        if (items.length >= room) {
          capped += 1;
          continue;
        }
        shown += 1;
        // Sprint 002.21: a height held to a strip is a band; one that says so in words and was read
        // without its strip is no height to measure the whole building by (it stays in words).
        const strip = item.strip;
        const unstructuredStrip =
          strip === undefined &&
          (item.stripRefused === true ||
            (STRIP_KINDS.has(item.kind) &&
              item.statement === 'limit' &&
              [item.passage, ...item.conditions].some(mentionsStrip)));
        const limit = unstructuredStrip
          ? writtenLimitOf({ statement: 'described', passage: item.passage })
          : writtenLimitOf(item);
        const low = item.confidence === 'low' || item.sectorUnplaced;
        const citation = {
          page: item.page,
          ...(item.article === undefined ? {} : { article: item.article }),
          passage: cut(item.passage, WRITTEN_PASSAGE_MAX)
        };
        // A strip's height is `other` (as an entered band's is): the checks, the capacity and the
        // headroom read `height_total` and would take the strip's height for the building's.
        const ruleKind = strip === undefined ? item.kind : 'other';
        const rule = {
          id,
          zoneId: `zone:${cut(zone, 64)}`,
          kind: ruleKind,
          label: {
            key:
              strip === undefined
                ? WRITTEN_KIND_KEYS[item.kind]
                : STRIP_LABEL_KEYS[item.kind]
          },
          ...(item.statement === 'limit' && !unstructuredStrip
            ? {}
            : { statement: unstructuredStrip ? 'described' : item.statement }),
          ...(limit === undefined ? {} : { limit }),
          provenance: 'written',
          status: 'to_confirm',
          citation: {
            document: { key: 'fr-urban-rules.written.document' },
            ...(item.article === undefined ? {} : { article: item.article }),
            page: item.page,
            passage: { text: cut(item.passage, LONG), lang: 'fr' },
            ...(docBase === undefined ? {} : { href: `${docBase}#page=${item.page}` })
          },
          conditions: [
            ...(item.sectorUnplaced
              ? [
                  { key: 'fr-urban-rules.written.sectorUnplaced' },
                  ...(item.sector === null ? [] : [{ text: item.sector, lang: 'fr' }])
                ]
              : []),
            ...((folded.get(index)?.also ?? []).length === 0
              ? []
              : [
                  {
                    key: 'fr-urban-rules.written.alsoSectors',
                    params: { sectors: folded.get(index).also.join(', ') }
                  }
                ]),
            ...(strip === undefined ? [] : stripConditions(strip)),
            ...(unstructuredStrip ? [{ key: 'fr-urban-rules.written.stripUnstructured' }] : []),
            ...item.conditions.map((text) => ({ text: cut(text, LONG), lang: 'fr' })),
            ...(low ? [{ key: 'fr-urban-rules.written.lowConfidence' }] : [])
          ],
          ...(item.exceptions.length > 0
            ? { exceptions: item.exceptions.map((text) => ({ text: cut(text, LONG), lang: 'fr' })) }
            : {}),
          confidence: low ? 'low' : item.confidence
        };
        items.push({
          rule,
          info: {
            version,
            value:
              limit?.kind === 'value'
                ? limit.quantity.value
                : limit?.kind === 'ratio'
                  ? limit.percent
                  : undefined,
            unit:
              limit?.kind === 'value'
                ? limit.quantity.unit
                : limit?.kind === 'ratio'
                  ? 'percent'
                  : undefined,
            provenance: 'written',
            rings: [],
            kind: ruleKind,
            zone,
            citation,
            ...(strip === undefined
              ? {}
              : {
                  band: { depth: strip.depth, roles: BAND_EDGES[strip.edges].roles },
                  permits: strip.permits,
                  stripOf: item.kind,
                  stripEntry: { depth: strip.depth, edges: strip.edges, permits: strip.permits, of: item.kind }
                }),
            ...(unstructuredStrip ? { unstructuredStrip: true } : {}),
            // Sprint 002.22: what the system decides about it on its own, if anything; 002.26: or that it
            // is the same rule as another, listed there.
            ...(() => {
              const fold = folded.get(index)?.fold;
              const auto =
                triageOf({ item, zone, commune: context.commune }) ??
                (fold === undefined ? undefined : foldDecisionOf(fold, result.rules[fold.of]));
              return auto === undefined ? {} : { auto };
            })(),
            // Sprint 002.26: the groups an open rule can be listed in (the project's answers add to the second).
            ...(noDrawingOf(item) ? { noDrawing: true } : {}),
            ...(checkedReadingOf({ item, zone }) ? { checked: true } : {}),
            // Sprint 002.24: what it is about — the uses, an extension, floor-area thresholds — for the
            // answers about the project to speak of.
            ...(() => {
              const scope = scopeOf({ item, zone });
              return scope === undefined ? {} : { scope };
            })(),
            // A setback read with an exception the plan cannot draw: said when it is confirmed.
            ...(WRITTEN_SETBACK_KINDS.has(item.kind) && item.exceptions.length > 0 ? { setbackExceptions: true } : {})
          }
        });
      }
      perZone.set(zone, { shown, others });
    }
    return { items, readZones, perZone, capped };
  }

  /** DEC-6: a confirmed written rule, from the section alone (no current extraction). */
  function writtenFromSection(entry, docBase) {
    const kind = WRITTEN_KINDS.has(entry.kind) ? entry.kind : 'other';
    // Sprint 002.21: a confirmed strip stands on the section as it was confirmed.
    const strip = storedStripOf(entry.strip);
    const page =
      Number.isInteger(entry.citation?.page) && entry.citation.page >= 1
        ? entry.citation.page
        : undefined;
    const article =
      typeof entry.citation?.article === 'string' && entry.citation.article !== ''
        ? cut(entry.citation.article, 40)
        : undefined;
    const passage =
      typeof entry.citation?.passage === 'string'
        ? cut(entry.citation.passage, WRITTEN_PASSAGE_MAX)
        : '';
    let statement =
      WRITTEN_STATEMENTS.has(entry.statement) && entry.statement !== 'limit'
        ? entry.statement
        : undefined;
    let limit = storedLimitOf(entry.limit);
    if (statement === undefined && limit === undefined) statement = 'described';
    if (statement === 'described' && limit?.kind !== 'described')
      limit = { kind: 'described', text: { text: passage || '—', lang: 'fr' } };
    if (statement === 'not_regulated' || statement === 'see_graphic') limit = undefined;
    const rule = {
      id: entry.ruleKey,
      kind,
      label: { key: strip === undefined ? WRITTEN_KIND_KEYS[kind] : STRIP_LABEL_KEYS[strip.of] },
      ...(statement === undefined ? {} : { statement }),
      ...(limit === undefined ? {} : { limit }),
      provenance: 'written',
      status: 'to_confirm',
      citation: {
        document: { key: 'fr-urban-rules.written.document' },
        ...(article === undefined ? {} : { article }),
        ...(page === undefined ? {} : { page }),
        ...(passage === '' ? {} : { passage: { text: passage, lang: 'fr' } }),
        ...(docBase === undefined
          ? {}
          : { href: page === undefined ? docBase : `${docBase}#page=${page}` })
      },
      conditions: [
        ...(strip === undefined ? [] : stripConditions(strip)),
        {
          key: 'fr-urban-rules.written.fromSection',
          params: { date: String(entry.at ?? '').slice(0, 10) }
        }
      ]
    };
    return {
      rule,
      info: {
        ...(strip === undefined
          ? {}
          : {
              band: { depth: strip.depth, roles: BAND_EDGES[strip.edges].roles },
              permits: strip.permits,
              stripOf: strip.of,
              stripEntry: strip
            }),
        value:
          limit?.kind === 'value'
            ? limit.quantity.value
            : limit?.kind === 'ratio'
              ? limit.percent
              : undefined,
        unit:
          limit?.kind === 'value'
            ? limit.quantity.unit
            : limit?.kind === 'ratio'
              ? 'percent'
              : undefined,
        provenance: 'written',
        rings: [],
        kind,
        zone: entry.zone,
        fromSection: true
      }
    };
  }

  /**
   * DEC-4: a written rule's actions. Read in this session: Confirm, Does not
   * apply, and Edit value on a `value` or `ratio` limit only. Standing on the
   * section alone: Reopen only — confirming needs the rule read again.
   */
  function writtenActions(rule, info, target, decidedHere) {
    const list = [];
    const open = rule.status !== 'information' && rule.status !== 'not_evaluable';
    if (!info.fromSection && open) {
      if (rule.status === 'to_confirm') {
        // Sprint 002.12 (DEC-5): « Confirmer 15 % » — the value in the rule's own unit, as the
        // assistant's offer says it (a number parameter, written in the reader's locale); a
        // described limit keeps « Confirmer ».
        const stated = rule.limit;
        const shown =
          stated?.kind === 'value'
            ? {
                value: mm(stated.quantity.value),
                unit: UNIT_SYMBOLS[stated.quantity.unit] ?? stated.quantity.unit
              }
            : stated?.kind === 'ratio' && Number.isFinite(stated.percent)
              ? { value: stated.percent, unit: '%' }
              : undefined;
        // Sprint 002.10 DEC-4: a rule unchanged in the new version says so on its button.
        const again = info.unchanged === true;
        list.push({
          id: 'confirm',
          label:
            shown === undefined
              ? { key: again ? 'fr-urban-rules.action.confirmAgain' : 'fr-urban-rules.action.confirm' }
              : {
                  key: again
                    ? 'fr-urban-rules.action.confirmAgainValue'
                    : 'fr-urban-rules.action.confirmValue',
                  params: shown
                },
          emphasis: 'primary',
          target
        });
      }
      const limit = rule.limit;
      if (limit?.kind === 'value' || limit?.kind === 'ratio') {
        const percent = limit.kind === 'ratio' || limit.quantity.unit === 'percent';
        list.push({
          id: 'edit-value',
          label: { key: 'fr-urban-rules.action.editValue' },
          target,
          fields: [
            {
              key: 'value',
              label: { key: 'fr-urban-rules.field.value' },
              kind: 'number',
              unit: limit.kind === 'ratio' ? 'percent' : limit.quantity.unit,
              min: 0,
              ...(percent ? { max: 100 } : {}),
              required: true,
              initial: limit.kind === 'ratio' ? limit.percent : limit.quantity.value
            }
          ]
        });
      }
      if (rule.status !== 'not_applicable') {
        list.push({
          id: 'not-applicable',
          label: { key: 'fr-urban-rules.action.notApplicable' },
          target
        });
      }
    }
    if (decidedHere)
      list.push({
        id: 'reopen',
        label: { key: 'fr-urban-rules.action.reopen' },
        target: { ruleId: rule.id }
      });
    return list;
  }

  /** 002.16: « Lecture avec (panneau IA) » — the chosen model, or the deployment's default. */
  const willReadRow = (chosen) => ({
    label: { key: 'fr-urban-rules.written.field.willRead' },
    value:
      chosen === undefined
        ? { key: 'fr-urban-rules.written.defaultModel' }
        : { text: cut([chosen.providerId, chosen.model].filter(Boolean).join(' · '), 200) }
  });

  /**
   * DEC-2: per zone, its state — a `sources[]` line and the Rules view's
   * heading, notice, fields and actions. Every state is named; an empty list
   * is never "no written rules".
   */
  function writtenStateOf(written, planned) {
    const sources = [];
    const blocks = [];
    // Sprint 002.11 DEC-7: without the companion, the readings held (restored) are still shown.
    if (written === undefined || (!written.available && written.zones.length === 0))
      return { sources, blocks };
    written.zones.forEach(({ zone, record }, index) => {
      const sourceId = index === 0 ? 'written-rules' : `written-rules-${index + 1}`;
      const name = { key: 'fr-urban-rules.source.written', params: { zone: cut(zone, 64) } };
      const subject = { subjectId: `x=${subjectPart(record.id)}` };
      const action = (id, key, primary = false) => ({
        id,
        label: { key },
        ...(primary ? { emphasis: 'primary' } : {}),
        target: subject
      });
      const zoneBlocks = [
        {
          kind: 'heading',
          text: { key: 'fr-urban-rules.written.heading', params: { zone: cut(zone, 64) } }
        }
      ];
      const notice = (tone, key, params) => ({
        kind: 'notice',
        tone,
        text: { key, ...(params === undefined ? {} : { params }) }
      });
      const state = record.state;
      if (state === 'unknown') {
        sources.push({ id: sourceId, name, state: 'loading' });
        zoneBlocks.push(notice('info', 'fr-urban-rules.written.state.checking'));
      } else if (state === 'not_started') {
        sources.push({
          id: sourceId,
          name,
          state: 'ready',
          detail: { key: 'fr-urban-rules.written.status.notRead' }
        });
        zoneBlocks.push(
          notice('info', 'fr-urban-rules.written.state.notStarted', { zone: cut(zone, 64) })
        );
        // 002.16: which model will read — the one chosen in the AI panel, else the deployment's own.
        zoneBlocks.push({ kind: 'fields', rows: [willReadRow(chosenModelOf(aiOf()))] });
        zoneBlocks.push({
          kind: 'actions',
          actions: [action('written-extract', 'fr-urban-rules.written.extract', true)]
        });
      } else if (['queued', 'fetching', 'reading', 'extracting'].includes(state)) {
        const progress = record.progress ?? {};
        const params =
          state === 'extracting' && Number.isSafeInteger(progress.of) && progress.of > 0
            ? { chunk: Math.max(1, progress.chunk ?? 1), of: progress.of }
            : undefined;
        const key =
          params === undefined
            ? WRITTEN_STEP_KEYS[state]
            : 'fr-urban-rules.written.state.extractingChunk';
        sources.push({
          id: sourceId,
          name,
          state: 'loading',
          detail: { key, ...(params ? { params } : {}) }
        });
        zoneBlocks.push(notice('info', key, params));
      } else if (state === 'done' && record.result !== undefined) {
        const result = record.result;
        const partial = result.chunks.failed > 0;
        const counts = planned.writtenRead.perZone.get(zone) ?? { shown: 0, others: 0 };
        sources.push({
          id: sourceId,
          name,
          state: 'ready',
          ...(result.extractedAt === undefined ? {} : { retrievedAt: result.extractedAt }),
          ...(partial ? { detail: { key: 'fr-urban-rules.written.status.partial' } } : {})
        });
        const rows = [
          {
            label: { key: 'fr-urban-rules.written.field.read' },
            value: {
              key:
                result.chapter === undefined
                  ? 'fr-urban-rules.written.readCount'
                  : 'fr-urban-rules.written.readSummary',
              params: {
                count: counts.shown,
                ...(result.chapter === undefined
                  ? {}
                  : { from: result.chapter.pages[0], to: result.chapter.pages[1] })
              }
            }
          },
          {
            label: { key: 'fr-urban-rules.written.field.provider' },
            value: {
              text: cut(
                [result.model.providerId, result.model.model].filter(Boolean).join(' · ') || '—',
                200
              )
            }
          }
        ];
        if (counts.others > 0) {
          rows.push({
            label: { key: 'fr-urban-rules.written.field.otherSectors' },
            value: { key: 'fr-urban-rules.written.otherSectors', params: { count: counts.others } }
          });
        }
        // Sprint 002.11 DEC-7: the project's reading, dated, until one is taken in this session.
        if (record.restored) {
          zoneBlocks.push(
            notice('info', 'fr-urban-rules.snapshot.writtenAsRead', {
              date: dayOfIso(result.extractedAt ?? record.readAt),
              model: cut(result.model.model || result.model.providerId || '—', 120)
            })
          );
        }
        if (record.offer !== undefined && written.available) {
          zoneBlocks.push({
            kind: 'notice',
            tone: 'info',
            text: {
              key: 'fr-urban-rules.snapshot.newerReading',
              params: { date: dayOfIso(record.offer.extractedAt ?? now().toISOString()) }
            },
            actions: [action('written-use-newer', 'fr-urban-rules.snapshot.useNewer', true)]
          });
        }
        zoneBlocks.push({ kind: 'fields', rows });
        if (partial) {
          zoneBlocks.push(
            notice('warning', 'fr-urban-rules.written.state.partial', {
              failed: result.chunks.failed,
              of: result.chunks.of,
              dropped: result.dropped
            })
          );
        }
        const waiting = record.notBefore !== undefined && now().getTime() < record.notBefore;
        if (record.error !== undefined) {
          // A passing failure after a result: the result stays, and the failure is said.
          zoneBlocks.push(notice('warning', writtenCodeKey(record.error.code)));
          if (waiting)
            zoneBlocks.push(
              notice('info', 'fr-urban-rules.written.status.retryAfter', {
                time: clockOf(record.notBefore)
              })
            );
        }
        // Without the companion, Extract again is not offered: the notice says why (002.11).
        // 002.16: the model chosen in the AI panel now is what "again" would read with, so the
        // offer follows it at once, not only the provider the service last named.
        const chosenNow = chosenModelOf(aiOf());
        const currentNow =
          chosenNow === undefined
            ? record.current
            : { schemaVersion: 0, promptVersion: 0, ...record.current, providerId: chosenNow.providerId };
        if (written.available && !waiting && extractAgainOffered(result, currentNow)) {
          if (chosenNow !== undefined) zoneBlocks.push({ kind: 'fields', rows: [willReadRow(chosenNow)] });
          zoneBlocks.push({
            kind: 'actions',
            actions: [action('written-extract-again', 'fr-urban-rules.written.extractAgain')]
          });
        }
      } else {
        const code = writtenCodeOf(record.error?.code);
        // Review S3: the time the failure was told to wait, kept on the record — not
        // recomputed from now, which would push it back at every read.
        const waiting = record.notBefore !== undefined && now().getTime() < record.notBefore;
        const retryAt = waiting ? clockOf(record.notBefore) : undefined;
        sources.push({
          id: sourceId,
          name,
          state: 'unavailable',
          detail:
            retryAt === undefined
              ? { key: writtenCodeKey(code) }
              : { key: 'fr-urban-rules.written.status.retryAfter', params: { time: retryAt } }
        });
        zoneBlocks.push(
          notice(
            'warning',
            writtenCodeKey(code),
            code === 'zone_chapter_not_found' ? { zone: cut(zone, 64) } : undefined
          )
        );
        if (Array.isArray(record.error?.codes) && record.error.codes.length > 0) {
          zoneBlocks.push({
            kind: 'fields',
            rows: [
              {
                label: { key: 'fr-urban-rules.written.field.codesSeen' },
                value: { text: cut(record.error.codes.join(', '), 2000) }
              }
            ]
          });
        }
        if (retryAt !== undefined) {
          zoneBlocks.push(
            notice('info', 'fr-urban-rules.written.status.retryAfter', { time: retryAt })
          );
        }
        if (WRITTEN_CODES[code]?.retry && !waiting) {
          zoneBlocks.push({
            kind: 'actions',
            actions: [action('written-try-again', 'fr-urban-rules.written.tryAgain')]
          });
        }
      }
      blocks.push(...zoneBlocks);
    });
    return { sources, blocks };
  }

  /** `HH:MM`, local time, of an epoch millisecond. */
  const clockOf = (ms) => {
    const date = new Date(ms);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  /**
   * DEC-1, DEC-3, DEC-4: every rule the plot has — the coded ones (002.1a),
   * the drawn prescriptions with a numeric type, the entered ones — with the
   * section's decisions applied: `{ rules, actionsFor, reopened, stale,
   * foreign }`. Pure over the report's facts and the section read: no state of
   * the extension's own is consulted, so an undo is a section in and a report
   * out.
   */
  function plannedRules(report, reportFacts, coded, section, plot, written) {
    const confirmations = Array.isArray(section?.confirmations)
      ? section.confirmations.filter(isConfirmation)
      : [];
    const entered = Array.isArray(section?.entered) ? section.entered.filter(isEntered) : [];
    const zones = reportFacts?.zones ?? [];
    const zoneDatvalid = zones.find((z) => z.datvalid !== undefined)?.datvalid;
    const documentVersion = report.document?.version ?? report.regime.code;
    const docTitle = report.document?.title ?? {
      key: report.regime.label?.key ?? 'fr-urban-rules.regime.unknown'
    };
    const docHref = report.document?.href;
    const rules = [];
    const meta = new Map(); // rule id → { version, value, unit, provenance }
    // Sprint 002.6b (DEC-3): the zones' written rules, read before the drawn
    // ones because a written façade height relabels a drawn total height (DEC-5).
    const currentVersion = versionOf(documentVersion, zoneDatvalid);
    const enteredOnPlot = entered.filter((entry) => onPlot(entry, plot)).length;
    const read = writtenRulesOf(
      written,
      docHref?.split('#')[0],
      currentVersion,
      Math.max(0, HOST_LIMITS.rules - coded.length - enteredOnPlot),
      {
        commune: reportFacts?.commune,
        // A card with a decision stored stands for the others of its text, whatever order they come in.
        keep: new Set(confirmations.filter((c) => onPlot(c, plot)).map((c) => c.ruleKey))
      }
    );
    const broughtBack = Array.isArray(section?.broughtBack)
      ? section.broughtBack.filter(isBroughtBack)
      : [];
    // Sprint 002.24: what the user said of the project (per project, not per plot).
    const nature = projectNatureOf(section);
    const relabel =
      read.items.some(
        (r) => r.rule.kind === 'height_facade' && r.rule.statement === 'see_graphic'
      ) && !read.items.some((r) => r.rule.kind === 'height_total');

    for (const rule of coded) {
      const article = rule.citation?.article;
      const versionFrom = Object.hasOwn(ARTICLES, article ?? '')
        ? ARTICLES[article].versionFrom
        : undefined;
      const value =
        rule.limit?.kind === 'value' ? rule.limit.quantity.value : rule.limit?.minimum?.value;
      meta.set(rule.id, {
        version: versionOf('CU', versionFrom),
        value: rule.limit?.kind === 'value' ? value : undefined,
        unit: rule.limit?.kind === 'value' ? rule.limit.quantity.unit : undefined,
        provenance: 'coded'
      });
      rules.push(rule);
    }

    // Review fix S2: never past the host's 1,000 rules (refused whole). The
    // coded and the entered rules — a user's own — are kept; the drawn ones
    // past the room left are not listed, and the rules view says how many.
    const enteredHere = entered.filter((entry) => onPlot(entry, plot)).length;
    const room = Math.max(0, HOST_LIMITS.rules - coded.length - enteredHere - read.items.length);
    let drawnCount = 0;
    let capped = 0;
    let duplicates = 0;
    let suffixed = 0;
    const cappedIds = new Set();
    for (const prescription of reportFacts?.prescriptions ?? []) {
      if (!Object.hasOwn(NUMERIC_TYPEPSC, prescription.type)) continue;
      const parse = parsePrescriptionValue({
        typepsc: prescription.type,
        libelle: prescription.libelle,
        txt: prescription.txt
      });
      // Review fix S4: two prescriptions with the same words at one place are
      // one, served twice — counted and said, never dropped silently; two with
      // no place (a point, an unconverted geometry) are told apart by their
      // order, and said.
      const base = drawnKey(prescription);
      let id = base;
      if (meta.has(base) || cappedIds.has(base)) {
        if (roundedCentroid(prescription.geometry) !== '-') {
          duplicates += 1;
          continue;
        }
        let n = 2;
        while (meta.has(`${base}~${n}`) || cappedIds.has(`${base}~${n}`)) n += 1;
        id = `${base}~${n}`;
        suffixed += 1;
      }
      if (drawnCount >= room) {
        capped += 1;
        cappedIds.add(id);
        continue;
      }
      drawnCount += 1;
      const words = [prescription.libelle, prescription.txt]
        .filter((x) => typeof x === 'string' && x !== '')
        .join(' — ');
      const evaluable = parse.value !== undefined && parse.kind !== 'parking';
      const parsedKind = Object.hasOwn(REGULATION_RULE_KIND_OF, parse.kind)
        ? REGULATION_RULE_KIND_OF[parse.kind]
        : 'other';
      // 002.6b DEC-5 (Q46): the written rule says the drawn height is a façade height.
      const relabelled = relabel && parsedKind === 'height_total';
      const kind = relabelled ? 'height_facade' : parsedKind;
      meta.set(id, {
        version: versionOf(documentVersion, prescription.datvalid ?? zoneDatvalid),
        value: parse.value,
        unit: parse.unit,
        provenance: 'drawn',
        rings: prescription.geometry?.rings ?? [],
        // 002.7 DEC-2: a required setback line (CNIG 15) replaces R.111-16's alignment.
        lines: prescription.geometry?.lines ?? [],
        kind,
        relabelled
      });
      rules.push({
        id,
        kind,
        label: { text: cut(prescription.libelle || words || prescription.type, 2000), lang: 'fr' },
        ...(evaluable
          ? { limit: limitOf(kind, parse.value, parse.unit) }
          : {
              statement: 'described',
              limit: { kind: 'described', text: { text: cut(words || '—', LONG), lang: 'fr' } }
            }),
        provenance: 'drawn',
        status: evaluable ? 'to_confirm' : 'not_evaluable',
        citation: {
          document: docTitle,
          passage: { text: cut(words || '—', LONG), lang: 'fr' },
          ...(docHref === undefined ? {} : { href: docHref })
        },
        ...(parse.conditions.length > 0 || relabelled
          ? {
              conditions: [
                ...parse.conditions.map((c) => ({ text: cut(c, LONG), lang: 'fr' })),
                ...(relabelled ? [{ key: 'fr-urban-rules.written.relabelled' }] : [])
              ]
            }
          : {}),
        ...(evaluable && parse.confidence !== undefined ? { confidence: parse.confidence } : {})
      });
    }

    const current = versionOf(documentVersion, zoneDatvalid);
    const foreign = [];
    let reopenedEntered = 0;
    // Sprint 002.10 DEC-3: how many of the reopened were made against another *document*.
    let reopenedByDocument = 0;
    const otherDocument = (entry) => String(entry.idurba ?? '').toUpperCase() !== current.idurba;
    for (const entry of entered) {
      if (!onPlot(entry, plot)) {
        foreign.push({ entry, kind: 'entered' });
        continue;
      }
      const shape = ENTERED_KINDS[entry.kind];
      const value = entry.limit?.value;
      const page =
        Number.isInteger(entry.source?.page) && entry.source.page >= 1
          ? entry.source.page
          : undefined;
      const reopened = !sameVersion(entry, current);
      // Review fix B1: an entered rule's actions carry the version read now, so
      // Confirm (on a reopened one) and Edit stamp it, and it stays confirmed.
      meta.set(entry.key, {
        version: current,
        value,
        unit: shape.unit,
        provenance: 'entered',
        roles: shape.roles,
        kind: shape.kind,
        reopened,
        // Sprint 002.18: « N m high within M m of the limits ».
        band: entry.band
      });
      if (reopened) {
        reopenedEntered += 1;
        if (otherDocument(entry)) reopenedByDocument += 1;
      }
      rules.push({
        id: entry.key,
        // Sprint 002.18 DEC-1: a height held to a band is not the building's maximum height: the
        // checks, the capacity and the headroom read `height_total`, so this one is `other`.
        kind: entry.band === undefined ? shape.kind : 'other',
        label: { key: shape.label },
        ...(entry.statement === 'not_regulated'
          ? { statement: 'not_regulated' }
          : Number.isFinite(value)
            ? { limit: limitOf(shape.kind, value, shape.unit) }
            : {
                statement: 'described',
                limit: { kind: 'described', text: { key: 'fr-urban-rules.entered.noValue' } }
              }),
        provenance: 'entered',
        status: reopened ? 'to_confirm' : 'confirmed',
        citation: {
          document: { text: cut(String(entry.source?.document ?? ''), 2000) || '—' },
          ...(page === undefined ? {} : { page }),
          ...(typeof entry.source?.passage === 'string' && entry.source.passage !== ''
            ? { passage: { text: cut(entry.source.passage, LONG) } }
            : {}),
          ...(docHref === undefined
            ? {}
            : { href: page === undefined ? docHref : `${docHref}#page=${page}` })
        },
        ...(reopened || entry.band !== undefined
          ? {
              conditions: [
                ...(entry.band === undefined
                  ? []
                  : [
                      {
                        key: BAND_EDGES[bandEdgesChoice(entry.band)].condition,
                        params: { depth: mm(entry.band.depth) }
                      }
                    ]),
                ...(reopened
                  ? [
                      {
                        key: 'fr-urban-rules.rule.enteredReopened',
                        params: {
                          date: String(entry.at ?? '').slice(0, 10),
                          version: String(entry.datvalid ?? '')
                        }
                      }
                    ]
                  : [])
              ]
            }
          : {})
      });
    }

    // Sprint 002.6b: the written rules (DEC-3), merged with the drawn ones (DEC-5).
    const writtenSessionNext = new Map();
    for (const { rule, info } of read.items) {
      let shown = rule;
      if (rule.statement === 'see_graphic') {
        const drawn = rules.find(
          (r) =>
            meta.get(r.id)?.provenance === 'drawn' &&
            r.kind === rule.kind &&
            r.status !== 'not_evaluable'
        );
        shown =
          drawn === undefined
            ? {
                ...rule,
                status: 'not_evaluable',
                conditions: [
                  ...(rule.conditions ?? []),
                  { key: 'fr-urban-rules.written.seeGraphicNone' }
                ]
              }
            : {
                ...rule,
                status: 'information',
                conditions: [
                  ...(rule.conditions ?? []),
                  {
                    key: 'fr-urban-rules.written.seeDrawn',
                    params: { rule: cut(phraseText(drawn.label), 200) }
                  }
                ]
              };
      }
      meta.set(rule.id, info);
      rules.push(shown);
      writtenSessionNext.set(rule.id, {
        rule,
        version: info.version,
        zone: info.zone,
        citation: info.citation,
        ...(info.stripEntry === undefined ? {} : { strip: info.stripEntry })
      });
    }
    // DEC-6: a confirmed written rule with no current extraction stands on the section alone.
    for (const entry of confirmations) {
      if (!entry.ruleKey.startsWith('written:') || !onPlot(entry, plot) || meta.has(entry.ruleKey))
        continue;
      // DEC-7: a current extraction that no longer reads the key lists it below, with Forget.
      if (read.readZones.size > 0 && (entry.zone === undefined || read.readZones.has(entry.zone)))
        continue;
      const fromSection = writtenFromSection(entry, docHref?.split('#')[0]);
      meta.set(entry.ruleKey, { ...fromSection.info, version: currentVersion });
      rules.push(fromSection.rule);
    }

    // The decisions (DEC-3, DEC-4): a version change reopens, showing the old value and date.
    let reopened = reopenedEntered;
    const known = new Set([...rules.map((r) => r.id), ...cappedIds]);
    const stale = [];
    // 002.6a DEC-4: a newer version's entries, on any plot: listed, never stale, never forgotten.
    const newer = [];
    // 002.6b DEC-7: a written key the current extraction no longer reads.
    const staleWritten = [];
    for (const entry of confirmations) {
      if (isNewerRuleKey(entry.ruleKey)) newer.push(entry);
      else if (!onPlot(entry, plot)) foreign.push({ entry, kind: 'confirmation' });
      else if (!known.has(entry.ruleKey))
        (entry.ruleKey.startsWith('written:') ? staleWritten : stale).push(entry);
    }
    const autoDecided = new Map();
    // Sprint 002.24: the candidates the project's answers could speak of — open whatever they say.
    const projectEntries = [];
    const decided = rules.map((rule) => {
      const info = meta.get(rule.id);
      if (info.provenance === 'entered') return rule;
      const entry = confirmations.find((c) => c.ruleKey === rule.id && onPlot(c, plot));
      if (entry === undefined) {
        const backAgain = broughtBack.some(
          (b) => b.ruleKey === rule.id && onPlot(b, plot) && sameVersion(b, info.version)
        );
        // Sprint 002.24: the project's answers, for a candidate nothing else decided.
        const project =
          info.scope === undefined || info.auto !== undefined || rule.status !== 'to_confirm'
            ? undefined
            : projectCheck(info.scope, nature);
        if (
          rule.status === 'to_confirm' &&
          info.auto === undefined &&
          !backAgain &&
          info.scope !== undefined
        )
          projectEntries.push({ id: rule.id, scope: info.scope });
        // Sprint 002.22: decided automatically unless the user brought it back, against this very
        // version of the document (a new version asks the question again). Never `confirmed`.
        const auto =
          info.auto ??
          (project?.excluded === undefined
            ? undefined
            : {
                decision: 'ruled_out',
                group: 'project',
                reason: projectWords(project.excluded, 'excluded', nature, projectLabel)
              });
        if (auto === undefined || rule.status !== 'to_confirm' || backAgain) {
          // Sprint 002.26: an open rule nothing decided is listed with a group when it belongs to one — the
          // rules that apply without shaping the area, and the readings that can be checked (those the
          // project's answers leave nothing to ask about). A rule brought back is looked at one by one.
          if (rule.status === 'to_confirm' && !backAgain && auto === undefined) {
            if (info.noDrawing === true) info.batch = 'applies';
            else if (
              info.checked === true &&
              (project === undefined ||
                (project.excluded === undefined && project.needs.length === 0))
            )
              info.batch = 'checked';
          }
          // What the answers say of an open one: where it applies, and what is missing.
          const lines =
            project === undefined || backAgain
              ? []
              : [
                  ...project.applies.map((fact) =>
                    projectWords(fact, 'applies', nature, projectLabel)
                  ),
                  ...project.needs.map((fact) => projectWords(fact, 'needs', nature, projectLabel))
                ];
          return lines.length === 0
            ? rule
            : { ...rule, conditions: [...(rule.conditions ?? []), ...lines] };
        }
        info.autoDecided = true;
        autoDecided.set(rule.id, auto);
        return {
          ...rule,
          status: auto.decision === 'ruled_out' ? 'not_applicable' : 'information',
          conditions: [...(rule.conditions ?? []), auto.reason]
        };
      }
      if (!sameVersion(entry, info.version)) {
        reopened += 1;
        const byDocument = otherDocument(entry);
        if (byDocument) reopenedByDocument += 1;
        const previous = entry.value?.value;
        // Sprint 002.10 DEC-4 (owner decision Q1, 2026-11-03): a written rule that the
        // new version's reading finds again — its key is the hash of its normalised
        // passage — with the very limit the user confirmed, is offered « confirm again »
        // as one click. It stays to confirm: nothing is carried over silently.
        const unchanged =
          byDocument &&
          info.provenance === 'written' &&
          !info.fromSection &&
          rule.status === 'to_confirm' &&
          storedLimitOf(entry.limit) !== undefined &&
          stableJson(storedLimitOf(entry.limit)) === stableJson(rule.limit);
        if (unchanged) info.unchanged = true;
        return {
          ...rule,
          ...(rule.status === 'not_evaluable' || rule.status === 'information'
            ? {}
            : { status: 'to_confirm' }),
          conditions: [
            ...(rule.conditions ?? []),
            ...(unchanged
              ? [
                  {
                    key: 'fr-urban-rules.rule.unchangedInNewVersion',
                    params: {
                      date: String(entry.at ?? '').slice(0, 10),
                      version: String(entry.datvalid ?? '')
                    }
                  }
                ]
              : []),
            {
              key: 'fr-urban-rules.rule.reopened',
              params: {
                decision: entry.decision,
                value:
                  previous === undefined
                    ? '—'
                    : `${previous} ${UNIT_SYMBOLS[entry.value?.unit] ?? ''}`.trim(),
                date: String(entry.at ?? '').slice(0, 10),
                version: String(entry.datvalid ?? '')
              }
            }
          ]
        };
      }
      // 002.6b DEC-5 (S4): a drawn rule whose kind changed since it was
      // confirmed — or relabelled, against a confirmation that never said its
      // kind — is confirmed again, never silently. Review S6: only when a
      // written result read now says so (it relabels, or reads the parsed
      // kind); with none in session — no service, or its answer still to come
      // — the kind the user confirmed stands.
      const kindDiffers =
        info.provenance === 'drawn' && typeof entry.kind === 'string' && entry.kind !== rule.kind;
      const writtenSays =
        info.relabelled === true || read.items.some((r) => r.rule.kind === rule.kind);
      if (kindDiffers && !writtenSays && WRITTEN_KINDS.has(entry.kind)) {
        info.kind = entry.kind;
        rule = {
          ...rule,
          kind: entry.kind,
          ...(rule.limit?.kind === 'value'
            ? { limit: limitOf(entry.kind, rule.limit.quantity.value, rule.limit.quantity.unit) }
            : {})
        };
      } else if (kindDiffers || (info.relabelled && entry.kind === undefined)) {
        reopened += 1;
        return {
          ...rule,
          status: 'to_confirm',
          conditions: [...(rule.conditions ?? []), { key: 'fr-urban-rules.written.kindCorrected' }]
        };
      }
      // Review S4: a written rule read now as another kind than it was confirmed as reopens too.
      if (
        info.provenance === 'written' &&
        !info.fromSection &&
        typeof entry.kind === 'string' &&
        entry.kind !== rule.kind
      ) {
        reopened += 1;
        return {
          ...rule,
          status: 'to_confirm',
          conditions: [...(rule.conditions ?? []), { key: 'fr-urban-rules.written.kindCorrected' }]
        };
      }
      if (entry.decision === 'not_applicable') return { ...rule, status: 'not_applicable' };
      // Sprint 002.21: a height confirmed as the building's whose text holds it to a strip along the
      // limits (read before strips were read) is asked again once it is read as that — never kept as
      // a limit on the whole building.
      if (
        (info.unstructuredStrip === true && entry.limit?.kind === 'value') ||
        (info.stripEntry !== undefined &&
          entry.strip !== undefined &&
          !info.fromSection &&
          stableJson(entry.strip) !== stableJson(info.stripEntry))
      ) {
        reopened += 1;
        return {
          ...rule,
          status: 'to_confirm',
          conditions: [...(rule.conditions ?? []), { key: 'fr-urban-rules.written.stripReopened' }]
        };
      }
      // 002.6b DEC-6: a written rule is measured by the limit it was confirmed with.
      if (info.provenance === 'written') {
        if (rule.status === 'information' || rule.status === 'not_evaluable') return rule;
        const stored = storedLimitOf(entry.limit);
        return { ...rule, status: 'confirmed', ...(stored === undefined ? {} : { limit: stored }) };
      }
      const edited =
        entry.value?.kind === 'value' &&
        Number.isFinite(entry.value.value) &&
        SDK_UNITS.has(entry.value.unit);
      return {
        ...rule,
        status: 'confirmed',
        ...(edited && rule.kind !== 'other'
          ? { limit: limitOf(rule.kind, entry.value.value, entry.value.unit) }
          : {})
      };
    });

    // Sprint 002.26: the rules each batch confirms, kept in the session so the click confirms exactly these.
    const batches = { applies: [], checked: [] };
    for (const rule of decided) {
      const batch = meta.get(rule.id)?.batch;
      if (batch === undefined) continue;
      batches[batch].push(rule.id);
      const found = writtenSessionNext.get(rule.id);
      if (found !== undefined) found.batch = batch;
    }

    const actionsFor = (rule) => {
      const info = meta.get(rule.id);
      // 002.6b: a written rule's subject is its version alone (DEC-4); a drawn
      // rule's carries its kind (DEC-5 S4).
      const subject =
        info.provenance === 'written'
          ? subjectFor(info.version)
          : subjectFor(
              info.version,
              info.value,
              info.unit,
              info.provenance === 'drawn' ? rule.kind : undefined
            );
      const target = { ruleId: rule.id, subjectId: subject };
      // Sprint 002.22: a rule decided automatically offers one thing — to bring it back.
      if (info.autoDecided === true)
        return [{ id: 'bring-back', label: { key: 'fr-urban-rules.action.bringBack' }, target }];
      const decidedHere = confirmations.some(
        (c) => c.ruleKey === rule.id && onPlot(c, plot) && sameVersion(c, info.version)
      );
      const list = [];
      if (info.provenance === 'entered') {
        const entry = entered.find((e) => e.key === rule.id);
        const shape = ENTERED_KINDS[entry.kind];
        if (info.reopened) {
          list.push({
            id: 'confirm-entered',
            label: { key: 'fr-urban-rules.action.confirm' },
            emphasis: 'primary',
            target
          });
        }
        list.push({
          id: 'edit-entered',
          label: { key: 'fr-urban-rules.action.editEntered' },
          target,
          fields: entryFields(shape.unit, entry)
        });
        list.push({
          id: 'remove-entered',
          label: { key: 'fr-urban-rules.action.removeEntered' },
          target
        });
        return list;
      }
      // 002.6b DEC-4: a written rule read in this session is confirmed whatever
      // its limit; one standing on the section alone is only reopened.
      if (info.provenance === 'written') return writtenActions(rule, info, target, decidedHere);
      const valued = rule.limit?.kind === 'value';
      if (rule.status === 'to_confirm' && (valued || info.provenance === 'coded')) {
        list.push({
          id: 'confirm',
          label: { key: 'fr-urban-rules.action.confirm' },
          emphasis: 'primary',
          target
        });
      }
      if (valued && info.provenance !== 'coded') {
        list.push({
          id: 'edit-value',
          label: { key: 'fr-urban-rules.action.editValue' },
          target,
          fields: [
            {
              key: 'value',
              label: { key: 'fr-urban-rules.field.value' },
              kind: 'number',
              unit: rule.limit.quantity.unit,
              min: 0,
              ...(rule.limit.quantity.unit === 'percent' ? { max: 100 } : {}),
              required: true,
              initial: rule.limit.quantity.value
            }
          ]
        });
      }
      // Review fix S1: a rule with no number is no limit to set aside.
      if (
        rule.status !== 'not_applicable' &&
        rule.status !== 'information' &&
        rule.status !== 'not_evaluable'
      ) {
        list.push({
          id: 'not-applicable',
          label: { key: 'fr-urban-rules.action.notApplicable' },
          target
        });
      }
      if (decidedHere)
        list.push({
          id: 'reopen',
          label: { key: 'fr-urban-rules.action.reopen' },
          target: { ruleId: rule.id }
        });
      return list;
    };

    return {
      rules: decided,
      meta,
      actionsFor,
      reopened,
      reopenedByDocument,
      documentVersion,
      documentValidFrom: report.document?.validFrom,
      stale,
      staleWritten,
      writtenSession: writtenSessionNext,
      batches,
      autoDecided,
      nature,
      projectEntries,
      projectAsked: projectAskedFor(section),
      writtenRead: read,
      newer,
      foreign,
      current,
      capped,
      duplicates,
      suffixed,
      entered: entered.filter((entry) => onPlot(entry, plot)),
      zone: zones[0]?.libelle
    };
  }

  /**
   * DEC-6: an entry form's six fields (kind, statement, value, source, page,
   * note); editing an entered rule shows four — its kind is fixed and its note
   * kept as entered (002.2 deviation 9, corrected by the review).
   */
  function entryFields(unit, entry, { band = false } = {}) {
    const kinds = Object.entries(ENTERED_KINDS).filter(([, k]) => k.unit === unit);
    // Sprint 002.18 DEC-1: « N m high within M m of the limits » — a depth and the edges it runs along.
    const bandFields =
      band || entry?.band !== undefined
        ? [
            {
              key: 'depth',
              label: { key: 'fr-urban-rules.band.field.depth' },
              kind: 'number',
              unit: 'm',
              min: 0.1,
              max: BAND_MAX_DEPTH,
              required: true,
              ...(Number.isFinite(entry?.band?.depth) ? { initial: entry.band.depth } : {})
            },
            {
              key: 'edges',
              label: { key: 'fr-urban-rules.band.field.edges' },
              kind: 'choice',
              required: true,
              initial: entry?.band === undefined ? 'all' : bandEdgesChoice(entry.band),
              options: Object.entries(BAND_EDGES).map(([value, edges]) => ({
                value,
                label: { key: edges.label }
              }))
            }
          ]
        : [];
    return [
      ...(entry === undefined && !band
        ? [
            {
              key: 'kind',
              label: { key: 'fr-urban-rules.field.kind' },
              kind: 'choice',
              required: true,
              options: kinds.map(([value, k]) => ({ value, label: { key: k.label } }))
            }
          ]
        : []),
      ...(band || entry?.band !== undefined
        ? []
        : [
            {
              key: 'statement',
              label: { key: 'fr-urban-rules.field.statement' },
              kind: 'choice',
              required: true,
              initial: entry?.statement ?? 'limit',
              options: [
                { value: 'limit', label: { key: 'fr-urban-rules.statement.limit' } },
                { value: 'not_regulated', label: { key: 'fr-urban-rules.statement.notRegulated' } }
              ]
            }
          ]),
      {
        key: 'value',
        label: { key: band || entry?.band !== undefined ? 'fr-urban-rules.band.field.height' : 'fr-urban-rules.field.value' },
        kind: 'number',
        unit,
        min: 0,
        // Review fix S7: a percentage is at most 100.
        ...(unit === 'percent' ? { max: 100 } : {}),
        ...(band || entry?.band !== undefined ? { required: true } : {}),
        ...(Number.isFinite(entry?.limit?.value) ? { initial: entry.limit.value } : {})
      },
      ...bandFields,
      {
        key: 'source',
        label: { key: 'fr-urban-rules.field.source' },
        kind: 'text',
        required: true,
        ...(typeof entry?.source?.document === 'string' ? { initial: entry.source.document } : {})
      },
      {
        key: 'page',
        label: { key: 'fr-urban-rules.field.page' },
        kind: 'number',
        min: 1,
        ...(Number.isInteger(entry?.source?.page) ? { initial: entry.source.page } : {})
      },
      ...(entry === undefined
        ? [{ key: 'note', label: { key: 'fr-urban-rules.field.note' }, kind: 'text' }]
        : [])
    ];
  }

  /**
   * DEC-7: checks on the drawn and entered rules with a value — heights per
   * building from the projection (lowest ground at the foot, the reference
   * said; a drawn one only where it is drawn), setbacks to the edges of the
   * named roles from the `storeys` outline. A check on a rule to confirm
   * carries its real result; the host does not count it.
   */
  function plannedChecks(service, planned, edges, roleOf, note, assume) {
    const checks = [];
    const main = service.measures.projection();
    const buildings = [
      ...(main.available ? [{ id: main.buildingId, name: undefined, projection: main }] : []),
      ...namedBuildings(service).filter((b) => !main.available || b.id !== main.buildingId)
    ];
    for (const rule of planned.rules) {
      const info = planned.meta.get(rule.id);
      if (info.provenance === 'coded') continue;
      // Sprint 002.6b DEC-3: the written rules no value measures.
      if (
        info.provenance === 'written' &&
        (rule.status === 'confirmed' || rule.status === 'to_confirm') &&
        rule.limit?.kind !== 'value'
      ) {
        checks.push(...writtenChecks(service, rule, info, buildings, edges, roleOf, note, assume));
        continue;
      }
      if (
        info.provenance === 'written' &&
        rule.kind === 'building_distance' &&
        (rule.status === 'confirmed' || rule.status === 'to_confirm')
      ) {
        checks.push(...writtenChecks(service, rule, info, buildings, edges, roleOf, note, assume));
        continue;
      }
      if (
        rule.limit?.kind !== 'value' ||
        (rule.status !== 'confirmed' && rule.status !== 'to_confirm')
      )
        continue;
      const limit = rule.limit.quantity.value;
      const label = (building, edge) =>
        building.name === undefined
          ? {
              key:
                edge === undefined
                  ? 'fr-urban-rules.check.subject.mainBuilding'
                  : 'fr-urban-rules.check.subject.main',
              ...(edge === undefined ? {} : { params: { edge } })
            }
          : edge === undefined
            ? { text: cut(building.name, 200) }
            : {
                key: 'fr-urban-rules.check.subject.named',
                params: { building: cut(building.name, 200), edge }
              };
      if (rule.kind === 'height_total' || rule.kind === 'height_facade') {
        for (const building of buildings) {
          const projection =
            building.projection ?? service.measures.projection({ buildingId: building.id });
          const id = `chk:${rule.id}:${building.id}`;
          const subject = { kind: 'building', id: building.id, label: label(building) };
          const drawnHere = info.provenance === 'drawn' && info.rings.length > 0;
          // Review fix (NIT): a rule drawn on part of the plot, for a building
          // whose outline is not known, may not concern it at all — no
          // not-checked line before the place is tested.
          if (!projection.available && drawnHere) continue;
          if (!projection.available) {
            checks.push({
              id,
              ruleId: rule.id,
              subject,
              result: 'not_checked',
              assumptionIds: [note(projection.reason)]
            });
            continue;
          }
          if (info.provenance === 'drawn' && info.rings.length > 0) {
            const outline = projection.storeys;
            if (outline?.refused !== undefined) {
              checks.push({
                id,
                ruleId: rule.id,
                subject,
                result: 'not_checked',
                assumptionIds: [note('outline-refused')]
              });
              continue;
            }
            const covers = (outline?.polygons ?? []).some((polygon) =>
              info.rings.some((ring) => ringsIntersect(openRing(polygon.outer), ring))
            );
            if (!covers) continue; // the prescription is drawn elsewhere on the plot
          }
          const height = projection.height;
          if (height === undefined || height.unavailable !== undefined) {
            checks.push({
              id,
              ruleId: rule.id,
              subject,
              result: 'not_checked',
              assumptionIds: [note(height?.unavailable ?? 'unavailable')]
            });
            continue;
          }
          const above =
            rule.kind === 'height_total'
              ? height.topAboveGround?.fromLowest
              : (height.eavesAboveGround ?? height.topAboveGround)?.fromLowest;
          if (!Number.isFinite(above)) {
            checks.push({
              id,
              ruleId: rule.id,
              subject,
              result: 'not_checked',
              assumptionIds: [note(height.relativeUnavailable ?? 'unavailable')]
            });
            continue;
          }
          checks.push({
            id,
            ruleId: rule.id,
            subject,
            measured: { value: mm(above), unit: 'm' },
            limit: { value: limit, unit: 'm' },
            // Review S5: the limit's own comparison (a height is a cap unless it says otherwise).
            result: (
              rule.limit.comparison === 'min'
                ? above >= limit - RESOLUTION_HALF
                : above <= limit + RESOLUTION_HALF
            )
              ? 'no_issue'
              : 'potential_issue',
            assumptionIds: [
              assume('height-lowest-ground', {
                key: 'fr-urban-rules.assumption.heightLowestGround'
              }),
              ...(info.provenance === 'drawn' && info.rings.length > 0
                ? [
                    assume('applies-where-drawn', {
                      key: 'fr-urban-rules.assumption.appliesWhereDrawn'
                    })
                  ]
                : []),
              ...(height.datumDerived === true
                ? [assume('datum-derived', { key: 'fr-urban-rules.assumption.datumDerived' })]
                : [])
            ]
          });
        }
      } else if (rule.kind === 'road_setback' || rule.kind === 'boundary_setback') {
        const roles = info.roles ?? (rule.kind === 'road_setback' ? ['street'] : ['side', 'rear']);
        if (edges === undefined) {
          for (const building of buildings) {
            checks.push({
              id: `chk:${rule.id}:${building.id}:no-boundary`,
              ruleId: rule.id,
              subject: { kind: 'building', id: building.id, label: label(building) },
              result: 'not_checked',
              assumptionIds: [note('no-boundary')]
            });
          }
          continue;
        }
        const targets = edges
          .filter((e) => roles.includes(roleOf.get(e.edge)?.role))
          .slice(0, MAX_LINE_TARGETS)
          .map((e) => ({ kind: 'boundary-edge', edge: e.edge }));
        if (targets.length === 0) continue;
        for (const building of buildings) {
          const answer = service.measures.distances({
            buildingId: building.id,
            outline: 'storeys',
            targets
          });
          targets.forEach((target, index) => {
            const id = `chk:${rule.id}:${building.id}:${target.edge}`;
            const subject = {
              kind: 'boundary-edge',
              id: String(target.edge),
              label: label(building, target.edge)
            };
            const measured = answer.available ? answer.targets[index] : undefined;
            if (!answer.available || measured?.nearest === undefined) {
              checks.push({
                id,
                ruleId: rule.id,
                subject,
                result: 'not_checked',
                assumptionIds: [
                  note(answer.available ? (measured?.unavailable ?? 'unavailable') : answer.reason)
                ]
              });
              return;
            }
            const d = measured.nearest.distance;
            checks.push({
              id,
              ruleId: rule.id,
              subject,
              measured: { value: mm(d), unit: 'm' },
              limit: { value: limit, unit: 'm' },
              // Review S5: a setback is a floor unless its limit says otherwise.
              result: (
                rule.limit.comparison === 'max'
                  ? d <= limit + RESOLUTION_HALF
                  : d >= limit - RESOLUTION_HALF
              )
                ? 'no_issue'
                : 'potential_issue',
              assumptionIds: [
                assume('setback-storeys', { key: 'fr-urban-rules.assumption.setbackStoreys' }),
                roleOf.get(target.edge)?.assumptionId
              ].filter(Boolean),
              figure: {
                dimension: { from: measured.nearest.building, to: measured.nearest.target }
              }
            });
          });
        }
      }
    }
    return checks;
  }

  /**
   * Sprint 002.6b DEC-3: a written rule no plain value measures. A distance
   * between buildings, a described rule and a height relative to the altitude
   * difference are said not checked; a setback relative to the façade height
   * is checked per building, **one check**, the worst sample of the worst
   * façade governing (S3).
   */
  function writtenChecks(service, rule, info, buildings, edges, roleOf, note, assume) {
    const label = (building) =>
      building.name === undefined
        ? { key: 'fr-urban-rules.check.subject.mainBuilding' }
        : { text: cut(building.name, 200) };
    const notChecked = (reason) =>
      buildings.map((building) => ({
        id: `chk:${rule.id}:${building.id}`,
        ruleId: rule.id,
        subject: { kind: 'building', id: building.id, label: label(building) },
        result: 'not_checked',
        assumptionIds: [note(reason)]
      }));
    // Review S8: only a limit is measured — a statement (not regulated) is no check.
    if (rule.kind === 'building_distance')
      return rule.statement === undefined ? notChecked('building-distance') : [];
    if (rule.limit?.kind === 'described') return notChecked('described-rule');
    if (rule.limit?.kind !== 'height_relative') return [];
    const setback = rule.kind === 'road_setback' || rule.kind === 'boundary_setback';
    if (!setback || rule.limit.reference !== 'facade_height')
      return notChecked('relative-not-measured');
    if (edges === undefined) return notChecked('no-boundary');
    const roles = info.roles ?? (rule.kind === 'road_setback' ? ['street'] : ['side', 'rear']);
    const targets = edges
      .filter((e) => roles.includes(roleOf.get(e.edge)?.role))
      .slice(0, MAX_LINE_TARGETS)
      .map((e) => ({ kind: 'boundary-edge', edge: e.edge }));
    if (targets.length === 0) return [];
    const { factor } = rule.limit;
    const offset = rule.limit.offset?.value ?? 0;
    const minimum = rule.limit.minimum?.value ?? 0;
    const need = (height) => Math.max(factor * height + offset, minimum);
    const checks = [];
    for (const building of buildings) {
      const id = `chk:${rule.id}:${building.id}`;
      const answer = service.measures.distances({
        buildingId: building.id,
        outline: 'storeys',
        targets,
        byFacade: true
      });
      const facades =
        answer.available && Array.isArray(answer.facades) ? answer.facades : undefined;
      if (facades === undefined) {
        checks.push({
          id,
          ruleId: rule.id,
          subject: { kind: 'building', id: building.id, label: label(building) },
          result: 'not_checked',
          assumptionIds: [
            note(!answer.available ? answer.reason : (answer.facades?.refused ?? 'unavailable'))
          ]
        });
        continue;
      }
      const worstOf = [];
      let unavailable;
      let datumDerived = false;
      for (const facade of facades) {
        if (facade.height?.unavailable !== undefined) {
          unavailable ??= facade.height.unavailable;
          continue;
        }
        const heights = Array.isArray(facade.height?.samples) ? facade.height.samples : [];
        if (facade.height?.datumDerived === true) datumDerived = true;
        let worst;
        facade.targets.forEach((target, index) => {
          const nearest = target?.nearest;
          if (nearest === undefined || nearest.unavailable !== undefined) return;
          const heightAt = (s) => {
            if (heights.length === 0) return facade.height.max;
            return heights.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a))
              .aboveFoot;
          };
          const samples =
            Array.isArray(target.samples) && target.samples.length > 0 && heights.length > 0
              ? target.samples.map((sample) => ({
                  distance: sample.distance,
                  height: heightAt(sample.s)
                }))
              : [
                  {
                    distance: nearest.distance,
                    height: nearest.aboveFootThere ?? facade.height.max
                  }
                ];
          for (const sample of samples) {
            if (!Number.isFinite(sample.distance) || !Number.isFinite(sample.height)) continue;
            const required = need(sample.height);
            const margin = sample.distance - required;
            if (worst === undefined || margin < worst.margin) {
              worst = {
                margin,
                distance: sample.distance,
                required,
                height: sample.height,
                edge: targets[index].edge,
                nearest
              };
            }
          }
        });
        if (worst !== undefined) worstOf.push({ facade, worst });
      }
      const subject = (head, others) => ({
        kind: 'building',
        id: building.id,
        label: {
          key:
            building.name === undefined
              ? 'fr-urban-rules.check.subject.facadeMain'
              : 'fr-urban-rules.check.subject.facadeNamed',
          params: {
            ...(building.name === undefined ? {} : { building: cut(building.name, 200) }),
            facade: FACADE_LETTERS[head.facade.facade] ?? '?',
            edge: head.worst.edge,
            height: mm(head.worst.height),
            others: cut(others || '—', 400)
          }
        }
      });
      if (worstOf.length === 0) {
        checks.push({
          id,
          ruleId: rule.id,
          subject: { kind: 'building', id: building.id, label: label(building) },
          result: 'not_checked',
          assumptionIds: [note(unavailable ?? 'unavailable')]
        });
        continue;
      }
      const head = worstOf.reduce((a, b) => (b.worst.margin < a.worst.margin ? b : a));
      const failing = head.worst.margin < -RESOLUTION_HALF;
      const others = worstOf
        .filter((f) => f !== head)
        .map(
          (f) =>
            `${FACADE_LETTERS[f.facade.facade] ?? '?'} ${mm(f.worst.distance)} m / ${mm(f.worst.required)} m`
        )
        .join(', ');
      if (!failing && unavailable !== undefined) {
        // A façade whose height is not known could be the one that fails.
        checks.push({
          id,
          ruleId: rule.id,
          subject: subject(head, others),
          result: 'not_checked',
          assumptionIds: [note(unavailable)]
        });
        continue;
      }
      checks.push({
        id,
        ruleId: rule.id,
        subject: subject(head, others),
        measured: { value: mm(head.worst.distance), unit: 'm' },
        limit: { value: mm(head.worst.required), unit: 'm' },
        result: failing ? 'potential_issue' : 'no_issue',
        assumptionIds: [
          assume('setback-storeys', { key: 'fr-urban-rules.assumption.setbackStoreys' }),
          assume('facade-height-foot', { key: 'fr-urban-rules.assumption.facadeHeightFoot' }),
          ...(datumDerived
            ? [assume('datum-derived', { key: 'fr-urban-rules.assumption.datumDerived' })]
            : []),
          roleOf.get(head.worst.edge)?.assumptionId
        ].filter(Boolean),
        figure: {
          dimension: { from: head.worst.nearest.facade, to: head.worst.nearest.target }
        }
      });
    }
    return checks;
  }

  // ── Sprint 002.7: the theoretical envelope — outline, volume, view ─────────────

  /**
   * DEC-3: whether the regime can have an envelope. `none` carries the notice
   * that says why; a carte communale whose plot is only partly in a
   * restricted sector draws one, said (`partly`).
   */
  function envelopeRegime(regime, reportFacts) {
    if (regime === 'not_published') return { none: 'fr-urban-rules.envelope.notice.notPublished' };
    if (regime === 'cc') {
      const sectors = reportFacts?.typesects ?? [];
      const closed = sectors.filter((t) => t === '03').length;
      if (closed > 0 && closed === sectors.length)
        return { none: 'fr-urban-rules.envelope.notice.ccRestricted' };
      if (closed > 0) return { partly: true };
    }
    if (!['rnu', 'cc', 'plu', 'plui'].includes(regime)) return { skip: true };
    return {};
  }

  const SETBACK_KINDS = new Set(['road_setback', 'boundary_setback']);
  /** Sprint 002.17: the buildable-area list's row for the setback along each edge role. */
  const SETBACK_CUT_KEYS = {
    street: 'fr-urban-rules.area.cut.setbackStreet',
    side: 'fr-urban-rules.area.cut.setbackSide',
    rear: 'fr-urban-rules.area.cut.setbackRear'
  };
  const BUDGET_KINDS = new Set([
    'building_distance',
    'footprint_ratio',
    'green_ratio',
    'floor_area_max',
    'extension_max',
    'annex_max',
    'parking'
  ]);
  const NOT_APPLIED_STATUS = {
    to_confirm: 'fr-urban-rules.envelope.reason.toConfirm',
    information: 'fr-urban-rules.envelope.reason.information',
    not_evaluable: 'fr-urban-rules.envelope.reason.notEvaluable',
    not_applicable: 'fr-urban-rules.envelope.reason.notApplicable'
  };
  const rolesOfRule = (planned, rule) =>
    planned.meta.get(rule.id)?.roles ??
    (rule.kind === 'road_setback' ? ['street'] : ['side', 'rear']);
  const INSET_EFFECT_KEYS = {
    street: 'fr-urban-rules.envelope.effect.insetStreet',
    side: 'fr-urban-rules.envelope.effect.insetSide',
    rear: 'fr-urban-rules.envelope.effect.insetRear',
    'side,rear': 'fr-urban-rules.envelope.effect.insetSideRear'
  };

  /**
   * DEC-2: the Site boundary's edges of `roles` as polylines — each contiguous
   * run one polyline (R.111-17 measures to "the nearest point of the limit"),
   * the whole ring closed when every edge has one of the roles.
   */
  function chainsOf(edges, roleOf, roles, keep = () => true) {
    const has = edges.map((e) => roles.includes(roleOf.get(e.edge)?.role) && keep(e));
    if (!has.some(Boolean)) return [];
    if (has.every(Boolean)) return [[...edges.map((e) => e.a), edges[0].a]];
    const n = edges.length;
    const start = has.findIndex((h, i) => !h && has[(i + 1) % n]);
    const chains = [];
    let current;
    for (let step = 1; step <= n; step += 1) {
      const i = (start + step) % n;
      if (has[i]) {
        current ??= [edges[i].a];
        current.push(edges[i].b);
      } else if (current !== undefined) {
        chains.push(current);
        current = undefined;
      }
    }
    if (current !== undefined) chains.push(current);
    return chains;
  }

  /**
   * DEC-2: the opposite alignments as polylines, one per street edge, those
   * whose ends meet within a metre (consecutive street edges facing one line)
   * joined into one.
   */
  function alignmentLines(alignments) {
    const lines = [...(alignments?.values() ?? [])]
      .sort((a, b) => a.edge - b.edge)
      .map((a) => a.points)
      .filter((points) => Array.isArray(points) && points.length >= 2);
    const joined = [];
    for (const line of lines) {
      const last = joined.at(-1);
      const end = last?.at(-1);
      if (
        end !== undefined &&
        Math.hypot(end.easting - line[0].easting, end.northing - line[0].northing) <= 1
      )
        joined[joined.length - 1] = [...last, ...line.slice(1)];
      else joined.push([...line]);
    }
    return joined;
  }

  /** A rise or a factor as a short string (screen words; never a figure the sheet carries). */
  const shortNumber = (value) => String(Math.round(value * 100) / 100);

  /**
   * Sprint 002.18 DEC-2: a band's ring set — the boundary and, as its holes, the boundary inset by the
   * band's depth on the edges it runs along — which a ceiling's `within` reads even–odd as the strip
   * between them. `undefined` when no edge has one of its roles; the whole boundary when the depth
   * leaves no ground (the band is the plot); `undefined` when the strip cannot be drawn.
   */
  function bandRingsOf(edges, roleOf, band) {
    const boundary = edges.map((e) => e.a);
    const distances = edges.map((e) => (band.roles.includes(roleOf.get(e.edge)?.role) ? band.depth : 0));
    if (!distances.some((d) => d > 0)) return undefined;
    const inner = insetByRole(
      boundary,
      distances,
      edges.map((e) => roleOf.get(e.edge)?.role === 'street')
    );
    if (inner.rings !== undefined) return [boundary, ...inner.rings];
    return inner.failed === 'collapsed' ? [boundary] : undefined;
  }

  /**
   * DEC-1 and DEC-2: what each rule does to the envelope — an inset per edge
   * role (the largest confirmed minimum), a ceiling, or a reason it shapes
   * nothing. Confirmed rules only (US-04); every other one is listed with its
   * status.
   */
  function envelopeRulesOf(planned, { edges, roleOf, alignments, national, assume }) {
    const contributions = [];
    const ceilings = [];
    const notApplied = [];
    const assumptions = new Set();
    const say = (id, text) => assumptions.add(assume(id, text));
    // Review 2026-10-21: a confirmed rule the envelope cannot draw (a façade
    // height, a maximum setback, a budget…) leaves it looser than the rules —
    // said as an assumption, so the sheet carries it too, not only the view.
    const NOT_LOOSER = new Set([
      'fr-urban-rules.envelope.reason.notRegulated',
      'fr-urban-rules.envelope.reason.minimumHeight'
    ]);
    let looser = false;
    const skip = (rule, key) => {
      notApplied.push({ rule, reason: { key } });
      if (rule.status === 'confirmed' && !NOT_LOOSER.has(key)) looser = true;
    };
    const presentRoles = new Set(edges.map((e) => roleOf.get(e.edge)?.role));
    for (const rule of planned.rules) {
      const info = planned.meta.get(rule.id) ?? {};
      // Sprint 002.22: a rule decided automatically is about something else (another sector, other
      // communes) or a reference: it is in the Rules view, not in the list of what the area did not apply.
      if (info.autoDecided === true) continue;
      if (rule.status !== 'confirmed') {
        skip(rule, NOT_APPLIED_STATUS[rule.status] ?? 'fr-urban-rules.envelope.reason.notEvaluable');
        continue;
      }
      if (rule.statement === 'not_regulated') {
        skip(rule, 'fr-urban-rules.envelope.reason.notRegulated');
        continue;
      }
      if (rule.limit === undefined || rule.limit.kind === 'described') {
        skip(rule, 'fr-urban-rules.envelope.reason.described');
        continue;
      }
      if (BUDGET_KINDS.has(rule.kind)) {
        skip(rule, 'fr-urban-rules.envelope.reason.budget');
        continue;
      }
      if (rule.kind === 'height_facade') {
        skip(rule, 'fr-urban-rules.envelope.reason.heightFacade');
        continue;
      }
      // Sprint 002.21: a façade height held to a strip is no ceiling, as a façade height is none.
      if (info.stripOf === 'height_facade') {
        skip(rule, 'fr-urban-rules.envelope.reason.heightFacade');
        continue;
      }
      if (rule.kind === 'height_total' || info.band !== undefined) {
        const limit = rule.limit;
        if (limit.kind !== 'value' || limit.quantity.unit !== 'm') {
          skip(rule, 'fr-urban-rules.envelope.reason.other');
        } else if (limit.comparison === 'min') {
          skip(rule, 'fr-urban-rules.envelope.reason.minimumHeight');
        } else if (!(limit.quantity.value > 0 && limit.quantity.value <= VOLUME_LIMITS.metres)) {
          skip(rule, 'fr-urban-rules.envelope.reason.pastLimits');
        } else {
          let within =
            info.provenance === 'drawn' && Array.isArray(info.rings) && info.rings.length > 0
              ? info.rings
              : undefined;
          // Sprint 002.18 DEC-2: an entered height with a band stands within that band of the limits;
          // Sprint 002.21: so does a written one, read with its strip and confirmed.
          const band = info.band;
          if (band !== undefined) {
            within = bandRingsOf(edges, roleOf, band);
            if (within === undefined) {
              skip(rule, 'fr-urban-rules.envelope.reason.bandNoEdge');
              continue;
            }
            say('envelope-band', { key: 'fr-urban-rules.assumption.envelopeBand' });
          }
          say('envelope-height-ground', { key: 'fr-urban-rules.assumption.envelopeHeightGround' });
          if (within !== undefined && band === undefined)
            say('envelope-height-within', {
              key: 'fr-urban-rules.assumption.envelopeHeightWithin'
            });
          ceilings.push({
            rule,
            ceiling: {
              kind: 'height',
              metres: limit.quantity.value,
              ...(within === undefined ? {} : { within })
            },
            effect:
              band !== undefined
                ? {
                    key: 'fr-urban-rules.envelope.effect.heightBand',
                    params: { depth: mm(band.depth) }
                  }
                : {
                    key:
                      within === undefined
                        ? 'fr-urban-rules.envelope.effect.height'
                        : 'fr-urban-rules.envelope.effect.heightWithin'
                  },
            value: { value: limit.quantity.value, unit: 'm' },
            ...(band === undefined ? {} : { band })
          });
        }
        continue;
      }
      if (!SETBACK_KINDS.has(rule.kind)) {
        skip(rule, 'fr-urban-rules.envelope.reason.other');
        continue;
      }
      const roles = rolesOfRule(planned, rule);
      if (!roles.some((role) => presentRoles.has(role))) {
        skip(rule, 'fr-urban-rules.envelope.reason.noEdge');
        continue;
      }
      const limit = rule.limit;
      if (limit.kind === 'value') {
        if (limit.comparison !== 'min') {
          skip(rule, 'fr-urban-rules.envelope.reason.maximum');
        } else if (limit.quantity.unit !== 'm') {
          skip(rule, 'fr-urban-rules.envelope.reason.other');
        } else if (limit.quantity.value > 0) {
          contributions.push({ rule, roles, distance: limit.quantity.value });
        } else skip(rule, 'fr-urban-rules.envelope.reason.other');
        continue;
      }
      if (limit.kind !== 'height_relative' || !(limit.factor > 0)) {
        skip(rule, 'fr-urban-rules.envelope.reason.other');
        continue;
      }
      // DEC-1: its minimum insets the outline on its edges, whatever its slope.
      const minimum = limit.minimum?.unit === 'm' ? limit.minimum.value : undefined;
      if (minimum > 0) contributions.push({ rule, roles, distance: minimum });
      // DEC-2: distance ≥ factor × height + offset → height ≤ (distance − offset) / factor.
      const rise = 1 / limit.factor;
      const offset = limit.offset?.unit === 'm' ? limit.offset.value : 0;
      const start = offset === 0 ? 0 : -offset / limit.factor;
      if (!(rise > 0 && rise <= VOLUME_LIMITS.rise) || !(start >= 0 && start <= VOLUME_LIMITS.start)) {
        skip(rule, 'fr-urban-rules.envelope.reason.facadeOffset');
        continue;
      }
      let from;
      let effect;
      let effectFrom;
      if (rule.kind === 'road_setback' && national) {
        // R.111-16: from the opposite alignment — or a required setback line drawn (CNIG 15).
        const setbackLines = planned.rules
          .filter(
            (r) =>
              r.status === 'confirmed' &&
              planned.meta.get(r.id)?.provenance === 'drawn' &&
              r.id.startsWith('psc:15:')
          )
          .flatMap((r) => planned.meta.get(r.id)?.lines ?? [])
          .filter((line) => Array.isArray(line) && line.length >= 2);
        if (setbackLines.length > 0) {
          from = setbackLines;
          effect = 'fr-urban-rules.envelope.effect.slopeSetbackLine';
          effectFrom = 'fr-urban-rules.envelope.effect.slopeSetbackLineFrom';
          say('envelope-setback-line', { key: 'fr-urban-rules.assumption.envelopeSetbackLine' });
        } else {
          from = alignmentLines(alignments);
          effect = 'fr-urban-rules.envelope.effect.slopeAlignment';
          effectFrom = 'fr-urban-rules.envelope.effect.slopeAlignmentFrom';
          for (const a of alignments?.values() ?? [])
            if (a.path !== undefined && a.points !== undefined) assumptions.add(`alignment-${a.path}`);
          // Review 2026-10-21: a street edge with no opposite alignment found is not
          // left without R.111-16 — the slope rises from the edge itself, nearer
          // than any alignment across the road, so stricter than the rule.
          const bare = chainsOf(edges, roleOf, ['street'], (e) => alignments?.get(e.edge)?.points === undefined);
          if (bare.length > 0) {
            if (from.length === 0) {
              effect = 'fr-urban-rules.envelope.effect.slopeStreet';
              effectFrom = 'fr-urban-rules.envelope.effect.slopeStreetFrom';
            }
            from = [...from, ...bare];
            say('envelope-alignment-missing', { key: 'fr-urban-rules.assumption.envelopeAlignmentMissing' });
          }
        }
        if (from.length === 0) {
          skip(rule, 'fr-urban-rules.envelope.reason.noAlignment');
          continue;
        }
      } else {
        from = chainsOf(edges, roleOf, rule.kind === 'road_setback' ? ['street'] : roles);
        const street = rule.kind === 'road_setback';
        effect = street
          ? 'fr-urban-rules.envelope.effect.slopeStreet'
          : 'fr-urban-rules.envelope.effect.slopeBoundary';
        effectFrom = street
          ? 'fr-urban-rules.envelope.effect.slopeStreetFrom'
          : 'fr-urban-rules.envelope.effect.slopeBoundaryFrom';
        if (rule.kind === 'boundary_setback')
          say('envelope-boundary-slope', { key: 'fr-urban-rules.assumption.envelopeBoundarySlope' });
      }
      if (limit.reference === 'facade_height')
        say('envelope-facade-ceiling', { key: 'fr-urban-rules.assumption.envelopeFacadeCeiling' });
      if (rule.id === 'rnu:R.111-17')
        say('envelope-adjoining', { key: 'fr-urban-rules.assumption.envelopeAdjoining' });
      for (const line of from) {
        ceilings.push({
          rule,
          ceiling: { kind: 'slope', from: line, rise, ...(start > 0 ? { start } : {}) },
          effect: {
            key: start > 0 ? effectFrom : effect,
            ...(start > 0 ? { params: { start: shortNumber(start) } } : {})
          },
          value: { key: 'fr-urban-rules.envelope.value.rise', params: { rise: shortNumber(rise) } }
        });
      }
    }
    // Sprint 002.21: a confirmed strip that lets constructions stand in it, under its height, lifts
    // the confirmed setbacks it covers — the strip is a height-limited place, not a forbidden one.
    // A setback deeper than the strip, or on edges the strip does not run along, stays as it is.
    const permitting = ceilings.filter(
      (c) => c.band !== undefined && planned.meta.get(c.rule.id)?.permits === true
    );
    for (let i = contributions.length - 1; i >= 0 && permitting.length > 0; i -= 1) {
      const c = contributions[i];
      const by = permitting.find(
        (p) =>
          c.roles.every((role) => p.band.roles.includes(role)) && c.distance <= p.band.depth + 1e-6
      );
      if (by === undefined) continue;
      contributions.splice(i, 1);
      notApplied.push({
        rule: c.rule,
        reason: {
          key: 'fr-urban-rules.envelope.reason.liftedByStrip',
          params: { metres: mm(by.ceiling.metres), depth: mm(by.band.depth) }
        }
      });
      say('envelope-setback-lifted', { key: 'fr-urban-rules.assumption.envelopeSetbackLifted' });
    }
    // A setback with an exception no number states is drawn in full: stricter than the rule.
    if (contributions.some((c) => planned.meta.get(c.rule.id)?.setbackExceptions === true))
      say('envelope-setback-exceptions', {
        key: 'fr-urban-rules.assumption.envelopeSetbackExceptions'
      });
    return { contributions, ceilings, notApplied, assumptions, looser };
  }

  /**
   * DEC-2: the volume's ceilings, merged — the `height` ceilings over the same
   * area keep the lowest, and one within a prescription that a lower height
   * over the whole plot covers is dropped; the slopes as they are. `ruleIds`
   * name the rules each one stands for.
   */
  function mergedCeilings(entries) {
    const heights = new Map();
    const slopes = [];
    for (const entry of entries) {
      const c = entry.ceiling;
      if (c.kind === 'slope') {
        slopes.push({ ...c, ruleIds: [entry.rule.id] });
        continue;
      }
      const key = c.within === undefined ? '*' : JSON.stringify(c.within);
      const held = heights.get(key);
      if (held === undefined) heights.set(key, { ...c, ruleIds: [entry.rule.id] });
      else {
        held.metres = Math.min(held.metres, c.metres);
        if (!held.ruleIds.includes(entry.rule.id)) held.ruleIds.push(entry.rule.id);
      }
    }
    const whole = heights.get('*');
    const kept = [...heights.values()].filter(
      (c) => c.within === undefined || whole === undefined || c.metres < whole.metres
    );
    // Slopes from one line with one rise and start are one ceiling.
    const uniqueSlopes = [];
    for (const s of slopes) {
      const same = uniqueSlopes.find(
        (t) =>
          t.rise === s.rise &&
          (t.start ?? 0) === (s.start ?? 0) &&
          JSON.stringify(t.from) === JSON.stringify(s.from)
      );
      if (same === undefined) uniqueSlopes.push(s);
      else for (const id of s.ruleIds) if (!same.ruleIds.includes(id)) same.ruleIds.push(id);
    }
    return [...kept, ...uniqueSlopes];
  }

  /**
   * DEC-2's self-check against 096.9's limits (the host drops a volume whole
   * for one malformed part, so a volume past them is not sent at all).
   */
  function volumeExpressible(ceilings) {
    const finitePoint = (p) => Number.isFinite(p?.easting) && Number.isFinite(p?.northing);
    if (ceilings.length === 0 || ceilings.length > VOLUME_LIMITS.ceilings) return false;
    return ceilings.every((c) => {
      if (
        c.within !== undefined &&
        (c.within.length === 0 || c.within.some((r) => r.length < 3 || !r.every(finitePoint)))
      )
        return false;
      if (c.kind === 'height') return c.metres > 0 && c.metres <= VOLUME_LIMITS.metres;
      return (
        Array.isArray(c.from) &&
        c.from.length >= 2 &&
        c.from.every(finitePoint) &&
        c.rise > 0 &&
        c.rise <= VOLUME_LIMITS.rise &&
        (c.start ?? 0) >= 0 &&
        (c.start ?? 0) <= VOLUME_LIMITS.start
      );
    });
  }

  /** DEC-1: the outline's per-edge distances and the rules that set them. */
  function insetDistances(edges, roleOf, contributions) {
    return edges.map((e) => {
      const role = roleOf.get(e.edge)?.role;
      let d = 0;
      for (const c of contributions) if (c.roles.includes(role)) d = Math.max(d, c.distance);
      return d;
    });
  }

  /**
   * DEC-1 to DEC-4 (002.7), Sprint 002.17 to 002.19: the envelope —
   * `{ feature, bandFeatures, groundArea, inset, view }`. The feature (`envelope`, derived) carries
   * the **theoretical buildable area**: the Site boundary less the confirmed setbacks and the
   * exclusion areas, in one piece or several, with holes — and, when a confirmed rule shapes a
   * ceiling the editor can draw, the volume. The view lists what narrowed it (each cut with its
   * source and the area it removes alone), what is left to confirm, what shaped it, what did not
   * and why, and the assumptions it rests on. Never a verdict (ADR-0111 Rule 4).
   */
  function envelopeOf({
    planned,
    edges,
    roleOf,
    alignments,
    regime,
    reportFacts,
    national,
    assume,
    exclusions = [],
    exclusionsShown = true,
    plotArea
  }) {
    const gate = envelopeRegime(regime, reportFacts);
    const notices = [];
    const view = (blocks) => ({
      id: 'envelope',
      label: { key: 'fr-urban-rules.view.envelope' },
      blocks
    });
    const notice = (key, tone = 'info') => ({ kind: 'notice', tone, text: { key } });
    if (gate.skip) return {};
    if (gate.none !== undefined) return { view: view([notice(gate.none)]) };
    if (edges === undefined)
      return { view: view([notice('fr-urban-rules.envelope.notice.noBoundary')]) };
    if (gate.partly) notices.push(notice('fr-urban-rules.envelope.notice.ccPartly', 'warning'));
    const shaped = envelopeRulesOf(planned, { edges, roleOf, alignments, national, assume });
    const distances = insetDistances(edges, roleOf, shaped.contributions);
    const inset = distances.some((d) => d > 0);
    const ceilings = mergedCeilings(shaped.ceilings);
    const assumptionIds = new Set(shaped.assumptions);
    for (const e of edges) {
      const id = roleOf.get(e.edge)?.assumptionId;
      if (id !== undefined) assumptionIds.add(id);
    }
    const boundary = edges.map((e) => e.a);
    // A street setback runs from the alignment, which continues past the plot.
    const streets = edges.map((e) => roleOf.get(e.edge)?.role === 'street');
    const cutting = exclusions.filter((item) => item.state === 'applied');
    let rings;
    let reentrant = false;
    if (inset || ceilings.length > 0 || cutting.length > 0) {
      const outline = insetByRole(
        boundary,
        distances,
        streets,
        cutting.map((item) => item.rings)
      );
      // The host refuses a whole report past 100,000 points (`too-large`); the area stays far under it
      // or is not drawn, said as its shape — never a report lost for one detailed exclusion.
      if (
        outline.rings !== undefined &&
        outline.rings.reduce((sum, ring) => sum + ring.length, 0) <= AREA_POINT_LIMIT
      ) {
        rings = outline.rings;
        reentrant = outline.reentrant && inset;
      } else if (outline.rings !== undefined) {
        notices.push(notice('fr-urban-rules.envelope.notice.shape', 'warning'));
      } else {
        let key =
          outline.failed === 'collapsed'
            ? 'fr-urban-rules.envelope.notice.collapsed'
            : 'fr-urban-rules.envelope.notice.shape';
        // Said apart: the setbacks alone leave ground and an exclusion area takes all of it.
        if (
          outline.failed === 'collapsed' &&
          cutting.length > 0 &&
          insetByRole(boundary, distances, streets).rings !== undefined
        )
          key = 'fr-urban-rules.envelope.notice.collapsedByExclusions';
        notices.push(notice(key, 'warning'));
      }
    } else {
      notices.push(notice('fr-urban-rules.envelope.notice.noRule'));
    }
    let volume;
    if (rings !== undefined) {
      if (ceilings.length === 0) {
        notices.push(notice('fr-urban-rules.envelope.notice.noCeiling'));
      } else if (!volumeExpressible(ceilings)) {
        notices.push(notice('fr-urban-rules.envelope.notice.pastLimits', 'warning'));
      } else {
        volume = { ceilings };
        assumptionIds.add(
          assume('envelope-lattice', { key: 'fr-urban-rules.assumption.envelopeLattice' })
        );
      }
      assumptionIds.add(
        assume('envelope-approximate', { key: 'fr-urban-rules.assumption.envelopeApproximate' })
      );
      if (reentrant)
        assumptionIds.add(
          assume('envelope-reentrant-corners', {
            key: 'fr-urban-rules.assumption.envelopeReentrantCorners'
          })
        );
      assumptionIds.add(
        assume('envelope-checks', { key: 'fr-urban-rules.assumption.envelopeChecks' })
      );
      // Sprint 002.17 Q9: the area is not clipped to the plot; said when the boundary goes past it.
      if (
        typeof plotArea === 'number' &&
        plotArea > 0 &&
        Math.abs(signedRingArea(boundary)) > plotArea + Math.max(1, plotArea * 0.01)
      )
        assumptionIds.add(
          assume('envelope-boundary-line', { key: 'fr-urban-rules.assumption.envelopeBoundaryLine' })
        );
      if (cutting.length > 0)
        assumptionIds.add(
          assume('envelope-exclusions', { key: 'fr-urban-rules.assumption.envelopeExclusions' })
        );
      // An exclusion the area could not cut (a line, a point, past the cap) leaves it looser: said.
      if (exclusions.some((item) => item.state === 'notSurface' || item.state === 'tooMany'))
        assumptionIds.add(
          assume('envelope-exclusions-missing', {
            key: 'fr-urban-rules.assumption.envelopeExclusionsMissing'
          })
        );
      // Review 2026-10-21: what makes the drawn envelope looser than the rules is
      // an assumption, which the sheet prints — a view notice it does not.
      if (shaped.looser)
        assumptionIds.add(
          assume('envelope-not-applied', { key: 'fr-urban-rules.assumption.envelopeNotApplied' })
        );
      if (gate.partly)
        assumptionIds.add(
          assume('envelope-cc-partly', { key: 'fr-urban-rules.envelope.notice.ccPartly' })
        );
    }
    // The net area of a ring set: pieces count, holes take away (the overlay winds them so).
    const netArea = (list) =>
      Math.max(0, list.reduce((sum, ring) => sum + signedRingArea(ring), 0));
    const areaOf = (answer) => (answer?.rings === undefined ? undefined : netArea(answer.rings));
    const round2 = (value) => Math.round(value * 100) / 100;
    const groundArea = rings === undefined ? undefined : netArea(rings);
    const boundaryArea = Math.abs(signedRingArea(boundary));

    // ── What narrowed it: each cut, its source, and the area it removes on its own ──
    const cuts = [];
    const proposals = [];
    if (rings !== undefined) {
      const afterSetbacks = cutting.length > 0 ? areaOf(insetByRole(boundary, distances, streets)) : groundArea;
      for (const role of EDGE_ROLES) {
        if (!edges.some((e) => roleOf.get(e.edge)?.role === role)) continue;
        const governing = shaped.contributions
          .filter((c) => c.roles.includes(role))
          .sort((a, b) => b.distance - a.distance)[0];
        if (governing === undefined) continue;
        const alone = areaOf(
          insetByRole(
            boundary,
            edges.map((e) => (roleOf.get(e.edge)?.role === role ? governing.distance : 0)),
            streets
          )
        );
        cuts.push({
          label: { key: SETBACK_CUT_KEYS[role], params: { distance: mm(governing.distance) } },
          source: governing.rule.label,
          area: alone === undefined ? undefined : Math.max(0, boundaryArea - alone)
        });
      }
      for (const item of cutting) {
        const alone = areaOf(insetByRole(boundary, distances, streets, [item.rings]));
        cuts.push({
          label: verbatim(cut(item.label, 200)),
          source: { key: 'fr-urban-rules.area.source.prescription', params: { code: item.type } },
          area:
            afterSetbacks === undefined || alone === undefined
              ? undefined
              : Math.max(0, afterSetbacks - alone)
        });
      }
      if (volume !== undefined) {
        const seenBand = new Set();
        for (const entry of shaped.ceilings) {
          if (entry.band === undefined || seenBand.has(entry.rule.id)) continue;
          seenBand.add(entry.rule.id);
          cuts.push({
            label: {
              key: 'fr-urban-rules.area.cut.band',
              params: { metres: mm(entry.ceiling.metres), depth: mm(entry.band.depth) }
            },
            source: entry.rule.label,
            area: undefined
          });
        }
      }
      // What each proposal would take, if you said yes — computed on what stands now.
      for (const item of exclusions
        .filter((i) => i.state === 'proposed' && EXCLUSION_PUT_IN_AREA_VIEW.has(i.type))
        .slice(0, EXCLUSION_MAX)) {
        const answer = insetByRole(boundary, distances, streets, [
          ...cutting.map((c) => c.rings),
          item.rings
        ]);
        proposals.push({
          item,
          area:
            answer.failed === 'collapsed'
              ? groundArea
              : areaOf(answer) === undefined
                ? undefined
                : Math.max(0, groundArea - areaOf(answer))
        });
      }
    }
    const measuredCuts = cuts.filter((c) => c.area !== undefined);
    const overlapping =
      groundArea !== undefined &&
      measuredCuts.reduce((sum, c) => sum + c.area, 0) > boundaryArea - groundArea + 0.5;

    const appliedIds = new Set();
    const applied = [];
    for (const c of shaped.contributions) {
      const roles = c.roles.filter((role) => edges.some((e) => roleOf.get(e.edge)?.role === role));
      const key = INSET_EFFECT_KEYS[[...roles].sort().join(',')] ?? INSET_EFFECT_KEYS['side,rear'];
      applied.push([c.rule.label, { key }, { value: mm(c.distance), unit: 'm' }]);
      appliedIds.add(c.rule.id);
    }
    if (volume !== undefined) {
      // One row per rule and effect: two opposite alignments are one R.111-16 row (walk, Mouzay).
      const seen = new Set();
      for (const entry of shaped.ceilings) {
        const key = JSON.stringify([entry.rule.id, entry.effect, entry.value]);
        appliedIds.add(entry.rule.id);
        if (seen.has(key)) continue;
        seen.add(key);
        applied.push([entry.rule.label, entry.effect, entry.value]);
      }
    }
    const rows = [];
    if (groundArea !== undefined)
      rows.push({
        label: { key: 'fr-urban-rules.envelope.field.groundArea' },
        value: { value: round2(groundArea), unit: 'm2' }
      });
    for (const c of ceilings) {
      if (c.kind !== 'height') continue;
      const rule = planned.rules.find((r) => r.id === c.ruleIds[0]);
      rows.push({
        label: {
          key:
            c.within === undefined
              ? 'fr-urban-rules.envelope.field.height'
              : 'fr-urban-rules.envelope.field.heightWithin'
        },
        value: { value: c.metres, unit: 'm' },
        ...(rule === undefined ? {} : { detail: rule.label })
      });
    }
    const blocks = [...notices];
    if (groundArea !== undefined && boundaryArea > 0) {
      // The headline: the Site boundary's area, the area left, and its share (never a verdict).
      blocks.push({
        kind: 'stat',
        label: { key: 'fr-urban-rules.area.stat.boundary' },
        value: { value: round2(boundaryArea), unit: 'm2' }
      });
      blocks.push({
        kind: 'stat',
        label: { key: 'fr-urban-rules.area.stat.area' },
        value: { value: round2(groundArea), unit: 'm2' },
        detail: { key: 'fr-urban-rules.area.stat.areaDetail' }
      });
      blocks.push({
        kind: 'stat',
        label: { key: 'fr-urban-rules.area.stat.share' },
        value: { value: Math.round((groundArea / boundaryArea) * 100), unit: 'percent' }
      });
    }
    if (rows.length > 0) blocks.push({ kind: 'fields', rows });
    if (cuts.length > 0) {
      blocks.push({ kind: 'heading', text: { key: 'fr-urban-rules.area.heading.narrows' } });
      blocks.push({
        kind: 'table',
        columns: [
          { key: 'fr-urban-rules.area.column.cut' },
          { key: 'fr-urban-rules.area.column.source' },
          { key: 'fr-urban-rules.area.column.removed' }
        ],
        rows: cuts.slice(0, TABLE_ROWS).map((c) => [
          c.label,
          c.source,
          c.area === undefined
            ? { key: 'fr-urban-rules.area.value.ceiling' }
            : { value: round2(c.area), unit: 'm2' }
        ])
      });
      if (overlapping)
        blocks.push({ kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.area.notice.overlap' } });
    }
    // Sprint 002.20: the areas taken out are drawn red; one button hides or shows them.
    if (cutting.length > 0) {
      if (exclusionsShown)
        blocks.push({ kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.area.notice.drawnRed' } });
      blocks.push({
        kind: 'actions',
        actions: [
          {
            id: exclusionsShown ? 'hide-exclusions' : 'show-exclusions',
            label: {
              key: exclusionsShown
                ? 'fr-urban-rules.area.action.hideCut'
                : 'fr-urban-rules.area.action.showCut'
            }
          }
        ]
      });
    }
    // The choices on exclusion areas: what could be kept in the area, and what is not yet cut.
    const current = planned.current;
    const choiceSubject = (item, choice) => exclusionSubject(item, choice, current);
    const name = (item) => cut(item.label, 80);
    const choiceActions = [];
    for (const item of exclusions) {
      if (item.state === 'applied' && item.overridable)
        choiceActions.push({
          id: 'set-exclusion',
          label: { key: 'fr-urban-rules.area.action.keep', params: { name: name(item) } },
          target: { subjectId: choiceSubject(item, 'keep') }
        });
      else if (item.state === 'kept' || (item.state === 'applied' && item.chosen === 'subtract'))
        choiceActions.push({
          id: 'forget-exclusion',
          label: {
            key:
              item.state === 'kept'
                ? 'fr-urban-rules.area.action.subtractAgain'
                : 'fr-urban-rules.area.action.leave',
            params: { name: name(item) }
          },
          target: { subjectId: `k=${subjectPart(item.key)}` }
        });
    }
    if (proposals.length > 0) {
      blocks.push({ kind: 'heading', text: { key: 'fr-urban-rules.area.heading.toConfirm' } });
      blocks.push({ kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.area.notice.proposed' } });
      blocks.push({
        kind: 'table',
        columns: [
          { key: 'fr-urban-rules.area.column.cut' },
          { key: 'fr-urban-rules.area.column.source' },
          { key: 'fr-urban-rules.area.column.concerned' }
        ],
        rows: proposals.slice(0, TABLE_ROWS).map(({ item, area }) => [
          verbatim(cut(item.label, 200)),
          { key: 'fr-urban-rules.area.source.prescription', params: { code: item.type } },
          area === undefined ? { key: 'fr-urban-rules.value.unavailable' } : { value: round2(area), unit: 'm2' }
        ])
      });
      blocks.push({
        kind: 'actions',
        actions: proposals.slice(0, MAX_ACTIONS).map(({ item }) => ({
          id: 'set-exclusion',
          label: { key: 'fr-urban-rules.area.action.subtract', params: { name: name(item) } },
          emphasis: 'primary',
          target: { subjectId: choiceSubject(item, 'subtract') }
        }))
      });
    }
    if (choiceActions.length > 0)
      blocks.push({ kind: 'actions', actions: choiceActions.slice(0, MAX_ACTIONS) });
    if (exclusions.some((item) => item.reopened))
      blocks.push({ kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.area.notice.reopened' } });
    if (applied.length > 0) {
      blocks.push({ kind: 'heading', text: { key: 'fr-urban-rules.envelope.heading.applied' } });
      blocks.push({
        kind: 'table',
        columns: [
          { key: 'fr-urban-rules.column.rule' },
          { key: 'fr-urban-rules.envelope.column.effect' },
          { key: 'fr-urban-rules.envelope.column.value' }
        ],
        rows: applied.slice(0, TABLE_ROWS)
      });
    }
    // A ceiling the volume could not carry is listed as not applied, never as applied.
    const notApplied = [
      ...shaped.notApplied,
      ...(volume === undefined
        ? shaped.ceilings
            .filter((entry) => !appliedIds.has(entry.rule.id))
            .map((entry) => ({
              rule: entry.rule,
              reason: {
                key:
                  rings === undefined
                    ? 'fr-urban-rules.envelope.reason.noOutline'
                    : 'fr-urban-rules.envelope.reason.pastLimits'
              }
            }))
        : [])
    ].filter((entry, i, all) => all.findIndex((other) => other.rule.id === entry.rule.id) === i);
    // Sprint 002.17: the exclusion areas that cut nothing, each with its reason.
    const notCut = exclusions
      .filter((item) => ['kept', 'notSurface', 'tooMany'].includes(item.state))
      .map((item) => ({
        label: verbatim(cut(item.label, 200)),
        reason: {
          key:
            item.state === 'kept'
              ? 'fr-urban-rules.area.reason.kept'
              : item.state === 'tooMany'
                ? 'fr-urban-rules.area.reason.tooMany'
                : item.unconverted
                  ? 'fr-urban-rules.area.reason.unconverted'
                  : 'fr-urban-rules.area.reason.notSurface'
        }
      }));
    const notAppliedRows = [
      ...notApplied.map((entry) => [entry.rule.label, entry.reason]),
      ...notCut.map((entry) => [entry.label, entry.reason])
    ];
    if (notAppliedRows.length > 0) {
      blocks.push({ kind: 'heading', text: { key: 'fr-urban-rules.envelope.heading.notApplied' } });
      blocks.push({
        kind: 'table',
        columns: [{ key: 'fr-urban-rules.column.rule' }, { key: 'fr-urban-rules.envelope.column.reason' }],
        rows: notAppliedRows.slice(0, TABLE_ROWS)
      });
      if (notAppliedRows.length > TABLE_ROWS)
        blocks.push({
          kind: 'notice',
          tone: 'info',
          text: {
            key: 'fr-urban-rules.envelope.notice.moreNotApplied',
            params: { count: notAppliedRows.length - TABLE_ROWS }
          }
        });
    }
    if (assumptionIds.size > 0) blocks.push({ kind: 'assumptions', ids: [...assumptionIds] });
    if (rings !== undefined)
      blocks.push({ kind: 'notice', tone: 'warning', text: { key: 'fr-urban-rules.area.caution' } });
    // Sprint 002.20: each area taken out, as far as it lies on the plot, drawn translucent red on the
    // plan and in 3D — a derived prescription, which the host has a red role for. Not drawn when the
    // user hid them, and never for an area only proposed or kept.
    const excludedFeatures = [];
    if (exclusionsShown) {
      for (const item of cutting) {
        const drawn = clippedToBoundary(boundary, item.rings);
        if (drawn === undefined) continue;
        excludedFeatures.push({
          id: `excluded:${excludedFeatures.length + 1}`,
          category: 'prescription',
          official: false,
          rings: drawn,
          label: verbatim(cut(item.label, 200))
        });
      }
    }
    const feature =
      rings === undefined
        ? undefined
        : {
            id: 'envelope',
            category: 'envelope',
            official: false,
            rings,
            label: { key: 'fr-urban-rules.envelope.label' },
            ...(appliedIds.size > 0 ? { ruleIds: [...appliedIds] } : {}),
            ...(volume === undefined ? {} : { volume })
          };
    // Sprint 002.18 DEC-3: each height band is drawn as a strip on the plan (a `setback-band`); no area is lost to it.
    const bandFeatures = [];
    if (rings !== undefined && volume !== undefined) {
      const seenBand = new Set();
      for (const entry of shaped.ceilings) {
        if (entry.band === undefined || seenBand.has(entry.rule.id)) continue;
        seenBand.add(entry.rule.id);
        bandFeatures.push({
          id: `envelope-band:${bandFeatures.length + 1}`,
          // A strip along the limits: the band role's style, never the area's (which the sheet and
          // the plan draw as the buildable area itself).
          category: 'setback-band',
          official: false,
          rings: entry.ceiling.within,
          label: {
            key: 'fr-urban-rules.area.cut.band',
            params: { metres: mm(entry.ceiling.metres), depth: mm(entry.band.depth) }
          },
          ruleIds: [entry.rule.id]
        });
      }
    }
    return {
      feature,
      bandFeatures,
      excludedFeatures,
      groundArea,
      inset: (inset || cutting.length > 0) && rings !== undefined,
      view: view(blocks)
    };
  }

  // ── Sprint 002.3: surfaces, budgets, caps, capacity, procedure ────────────────

  /** The open variation's key (DEC-3): its Document id, or `open` before the host lists them. */
  function variationKeyOf(service) {
    try {
      const open = (service?.variations?.() ?? []).find((v) => v?.open === true);
      return typeof open?.id === 'string' && open.id !== '' ? open.id : 'open';
    } catch {
      return 'open';
    }
  }

  /** A variation's answers: its own, or those kept under `open` before it had an id (DEC-3). */
  function answersOf(map, key) {
    if (!isRecord(map)) return undefined;
    const own = map[key];
    if (isRecord(own)) return own;
    return key !== 'open' && isRecord(map.open) ? map.open : undefined;
  }

  /**
   * The next per-variation map: `value` under `key`; answers kept under `open`
   * move under the id on the first write that has one (DEC-3). Every other
   * variation's answers are kept — nothing is pruned (DEC-3, 002.2 DEC-5).
   */
  function withAnswers(map, key, value) {
    const next = { ...(isRecord(map) ? map : {}) };
    // Review fix (NIT): `open` moves only into the variation open at write time,
    // and only when that variation had no answers of its own — the ones it was
    // read from. Otherwise `open` is kept, never dropped silently.
    if (key !== 'open' && !isRecord(next[key])) delete next.open;
    next[key] = value;
    return next;
  }

  /** The buildings of the open Document: the main one (by its projection's id) and the named ones. */
  function projectBuildings(service) {
    let main;
    try {
      main = service.measures.projection();
    } catch {
      main = { available: false };
    }
    const named = namedBuildings(service);
    return [
      ...(main.available
        ? [{ id: main.buildingId, name: undefined, main: true, projection: main }]
        : []),
      ...named
        .filter((b) => !main.available || b.id !== main.buildingId)
        .map((b, i) => ({ ...b, ordinal: i + 1 }))
    ];
  }

  /**
   * A building's label: its name when the document shows one; else the main
   * building, or "Building n" in the Document's order (review fix S3), so two
   * unnamed buildings in a choice are never the same word.
   */
  const buildingLabel = (building) =>
    typeof building?.name === 'string' && building.name !== ''
      ? { text: cut(building.name, 200) }
      : building?.main === true
        ? { key: 'fr-urban-rules.check.subject.mainBuilding' }
        : Number.isInteger(building?.ordinal)
          ? { key: 'fr-urban-rules.surfaces.building.ordinal', params: { index: building.ordinal } }
          : { key: 'fr-urban-rules.surfaces.building.unnamed' };

  /** DEC-1: the definitions offered, and the level and parts each counts. */
  const EMPRISE_DEFINITIONS = ['r420-1', 'lexicon', 'all-overhangs'];
  const EMPRISE_COUNTS = ['upperStoreys', 'roofOverhangs', 'balconies', 'lightweight'];
  /** R.420-1's own reading, the lexicon toggles' starting point. */
  const R420_COUNTS = {
    upperStoreys: true,
    roofOverhangs: false,
    balconies: true,
    lightweight: true
  };

  /** The section's emprise choice, read defensively (an unknown value reads as the default). */
  function empriseChoice(section) {
    const raw = isRecord(section?.emprise) ? section.emprise : {};
    const definition = EMPRISE_DEFINITIONS.includes(raw.definition) ? raw.definition : 'r420-1';
    const counts = { ...R420_COUNTS };
    if (isRecord(raw.counts)) {
      for (const key of EMPRISE_COUNTS)
        if (typeof raw.counts[key] === 'boolean') counts[key] = raw.counts[key];
    }
    const page = Number.isInteger(raw.page) && raw.page >= 1 ? raw.page : undefined;
    return {
      definition,
      counts,
      page,
      balconies: isRecord(raw.balconies) ? raw.balconies : undefined
    };
  }

  /** The level and parts a definition counts. */
  function empriseReading(definition, counts) {
    if (definition === 'all-overhangs')
      return { level: 'withRoofOverhangs', lightweight: true, balconies: true };
    if (definition === 'lexicon') {
      return {
        level: counts.roofOverhangs
          ? 'withRoofOverhangs'
          : counts.upperStoreys
            ? 'storeys'
            : 'ground',
        lightweight: counts.lightweight,
        balconies: counts.balconies
      };
    }
    return { level: 'storeys', lightweight: true, balconies: true };
  }

  const area2 = (value) => Math.round(value * 100) / 100;
  const m2 = (value) => ({ value: area2(value), unit: 'm2' });
  const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const idList = (value) =>
    Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id !== '') : [];

  /** The cadastral `contenance` of the plot's parcels, summed: the extension's figure, for reference (DEC-2). */
  function contenanceOf(site) {
    let sum = 0;
    for (const parcel of site?.parcels ?? []) {
      const raw = parcel?.properties?.contenance;
      const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
      if (!Number.isFinite(value) || value <= 0) return undefined;
      sum += value;
    }
    return sum > 0 ? sum : undefined;
  }

  /**
   * DEC-5: the project's floor-to-floor height — the typical `height` of the
   * open Document's storeys, which the `document` service shows as the host
   * field `Level.property('height')` (002.8: the draft's "holds no height"
   * was false), else the editor's default storey height (3 m), said.
   */
  function floorToFloor() {
    const heights = [];
    try {
      for (const level of documentOf()?.find('Level') ?? []) {
        let value;
        try {
          value = level.property('height');
        } catch {
          value = undefined;
        }
        if (
          value !== undefined &&
          (value.kind === 'length' || value.kind === 'number') &&
          Number.isFinite(value.value) &&
          value.value > 0
        ) {
          heights.push(value.value);
        }
      }
    } catch (cause) {
      log(`${SOURCE_ID}: the storeys could not be listed: ${String(cause)}`);
    }
    if (heights.length === 0) return { value: DEFAULT_FLOOR_TO_FLOOR, assumed: true };
    const tally = new Map();
    for (const h of heights) tally.set(mm(h), (tally.get(mm(h)) ?? 0) + 1);
    const [value] = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return { value, assumed: false };
  }

  /** The confirmed heights and footprint ratio the capacity and the programme read (DEC-5, DEC-7). */
  function confirmedLimits(planned) {
    const confirmed = planned.rules.filter((r) => r.status === 'confirmed');
    const valued = (kinds) =>
      confirmed.filter((r) => kinds.includes(r.kind) && r.limit?.kind === 'value');
    const heights = valued(['height_total', 'height_facade']).map((r) => ({
      rule: r,
      value: r.limit.quantity.value
    }));
    // 002.6b review Q3: a confirmed written ratio of the plot area, a cap,
    // feeds the budget as a percentage does; `{ rule, percent }`.
    const footprints = confirmed
      .filter((r) => r.kind === 'footprint_ratio')
      .map((rule) => ({ rule, percent: footprintPercentOf(rule) }))
      .filter((f) => f.percent !== undefined);
    const ces =
      footprints.length === 0
        ? undefined
        : footprints.reduce((a, b) => (b.percent < a.percent ? b : a));
    const notRegulated = confirmed.some(
      (r) => r.kind === 'footprint_ratio' && r.statement === 'not_regulated'
    );
    return { heights, ces, notRegulated };
  }

  /** DEC-5: storeys from the confirmed heights, a range when the façade and total heights differ. */
  function storeysOf(heights, floor) {
    if (heights.length === 0) return undefined;
    const values = heights.map((h) => h.value);
    const fit = (h) => Math.max(0, Math.floor((h + RESOLUTION_HALF) / floor));
    return { low: fit(Math.min(...values)), high: fit(Math.max(...values)) };
  }

  /**
   * DEC-1 to DEC-6 on one read: the Surfaces view, the checks on the footprint,
   * green, cap and floor-area rules, and the figures the programme enricher
   * reads. The host measures; every French definition is applied here. Pure
   * over the measures' answers and the section.
   */
  function surfacesFor({
    service,
    site,
    planned,
    reportFacts,
    regime,
    report,
    section,
    readOnly,
    envelope,
    flags,
    assume,
    note,
    measure
  }) {
    const label = { key: 'fr-urban-rules.view.surfaces' };
    const view = (blocks) => ({ id: 'surfaces', label, blocks });
    if (!measure) {
      return {
        view: view([
          { kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.notice.loading' } }
        ]),
        checks: []
      };
    }
    if (service?.measures === undefined || typeof service.measures.plotCoverage !== 'function') {
      return {
        view: view([
          { kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.surfaces.noMeasures' } }
        ]),
        checks: []
      };
    }
    const blocks = [];
    const checks = [];
    const variation = variationKeyOf(service);
    const choice = empriseChoice(section);
    const buildings = projectBuildings(service);
    const byId = new Map(buildings.map((b) => [b.id, b]));
    let coverage;
    try {
      coverage = service.measures.plotCoverage();
    } catch (cause) {
      coverage = { available: false, reason: 'unavailable' };
      log(`${SOURCE_ID}: the plot coverage could not be read: ${String(cause)}`);
    }
    const relation = site.existingBuilding?.relation ?? 'kept';
    // Kept and extended parts only, and only when the Site holds an existing building (DEC-1).
    const existing =
      coverage.available &&
      coverage.existing?.refused === undefined &&
      relation !== 'replaced' &&
      (site.existingBuilding?.parts ?? []).length > 0
        ? coverage.existing
        : undefined;
    const existingArea = existing?.area ?? 0;
    // Review fix S6: under the PLU's lexicon with light structures left out, the
    // existing emprise leaves its light structures out too.
    const pluExistingArea =
      existing === undefined
        ? 0
        : choice.definition === 'lexicon' && !choice.counts.lightweight
          ? Math.max(0, existing.area - (existing.lightweightArea ?? 0))
          : existing.area;

    // ── DEC-1: the emprise au sol ──
    const balconyAnswers = answersOf(choice.balconies, variation) ?? {};
    // Review fix S2: only the main building's and those of buildings drawn now.
    const balconies = Object.entries(balconyAnswers).filter(
      ([id, v]) => positive(v) && (id === 'main' || byId.has(id))
    );
    const balconyTotal = balconies.reduce((sum, [, v]) => sum + v, 0);
    const figure = (reading) => {
      if (!coverage.available) return { refused: coverage.reason };
      const level = coverage.levels?.[reading.level];
      if (level === undefined || level.refused !== undefined)
        return { refused: level?.refused ?? 'unavailable', level: reading.level };
      const covered = reading.lightweight ? level.covered : level.coveredWithoutLightweight;
      return {
        area: covered + (reading.balconies ? balconyTotal : 0),
        covered,
        level: reading.level,
        buildings: level.buildings ?? [],
        unbuilt: level.unbuilt
      };
    };
    const r420 = figure(empriseReading('r420-1'));
    const plu = figure(empriseReading(choice.definition, choice.counts));
    const allOverhangs = figure(empriseReading('all-overhangs'));
    const definitionLabel =
      choice.definition === 'lexicon'
        ? choice.page === undefined
          ? { key: 'fr-urban-rules.surfaces.emprise.lexicon' }
          : { key: 'fr-urban-rules.surfaces.emprise.lexiconPage', params: { page: choice.page } }
        : choice.definition === 'all-overhangs'
          ? { key: 'fr-urban-rules.surfaces.emprise.allOverhangs' }
          : { key: 'fr-urban-rules.surfaces.emprise.r420' };
    const plotArea =
      typeof site.plotArea === 'number' && site.plotArea > 0
        ? site.plotArea
        : coverage.available && coverage.plotArea > 0
          ? coverage.plotArea
          : undefined;

    // Sprint 002.15 (platform 096.27, SDK 1.38): the emprise au sol is composed, not stacked — a
    // headline figure, the definition as a segmented choice, and what is not the headline folded.
    if (!coverage.available) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: {
          key: 'fr-urban-rules.surfaces.coverageUnavailable',
          params: { reason: cut(String(coverage.reason), 200) }
        }
      });
    }
    const said = [];
    const balconiesId =
      balconies.length === 0
        ? assume('balconies-not-modelled', { key: 'fr-urban-rules.assumption.balconies' })
        : assume('balconies-entered', { key: 'fr-urban-rules.assumption.balconiesEntered' });
    said.push(balconiesId);
    if (choice.definition === 'r420-1' || choice.definition === 'lexicon') {
      said.push(
        assume('overhangs-unsupported', { key: 'fr-urban-rules.assumption.overhangsUnsupported' })
      );
    }
    said.push(assume('no-ornaments', { key: 'fr-urban-rules.assumption.noOrnaments' }));
    if (relation === 'replaced' && (site.existingBuilding?.parts ?? []).length > 0) {
      said.push(assume('existing-replaced', { key: 'fr-urban-rules.assumption.existingReplaced' }));
    }
    const value = (f) =>
      f.area === undefined
        ? {
            key: 'fr-urban-rules.surfaces.notComputed',
            params: { reason: cut(String(f.refused), 200) }
          }
        : m2(f.area);
    // The confirmed footprint limit, for the headline's gauge and verdict: the one the budget and
    // the checks below use.
    const governingLimits = confirmedLimits(planned);
    if (plu.area !== undefined && plotArea !== undefined) {
      const share = Math.round((plu.area / plotArea) * 1000) / 10;
      const cesPercent = governingLimits.ces?.percent;
      // A verdict only on a confirmed limit: a rule still to confirm gives none (the host's own
      // rule for a check, ADR-0111 Rule 4).
      const within =
        cesPercent === undefined ? undefined : plu.area <= (cesPercent / 100) * plotArea + RESOLUTION_HALF;
      blocks.push({
        kind: 'stat',
        label: { key: 'fr-urban-rules.surfaces.heading.emprise' },
        value: { value: share, unit: 'percent' },
        detail: {
          key: 'fr-urban-rules.surfaces.stat.of',
          params: { area: area2(plu.area), plot: area2(plotArea) }
        },
        gauge: {
          value: { value: share, unit: 'percent' },
          ...(cesPercent === undefined ? {} : { limit: { value: cesPercent, unit: 'percent' } }),
          max: { value: 100, unit: 'percent' }
        },
        ...(within === undefined ? {} : { verdict: { result: within ? 'no_issue' : 'potential_issue' } })
      });
    } else {
      // No plot area, or no area: the definition's own value as a row, as before.
      blocks.push({
        kind: 'fields',
        rows: [
          {
            label: definitionLabel,
            value: value(plu),
            detail:
              balconies.length === 0
                ? { key: 'fr-urban-rules.surfaces.emprise.detailNoBalconies' }
                : {
                    key: 'fr-urban-rules.surfaces.emprise.detailBalconies',
                    params: { area: area2(balconyTotal) }
                  }
          }
        ]
      });
    }
    // The three definitions, one card each with its area; the setting is the same action as ever.
    const lexiconReading = figure(empriseReading('lexicon', choice.counts));
    const card = (reading) =>
      reading.area === undefined
        ? {
            figure: { key: 'fr-urban-rules.surfaces.card.notComputed' },
            detail:
              reading.refused === 'roof-refused'
                ? { key: 'fr-urban-rules.surfaces.emprise.roofRefused' }
                : {
                    key: 'fr-urban-rules.surfaces.notComputed',
                    params: { reason: cut(String(reading.refused ?? 'unavailable'), 200) }
                  }
          }
        : { figure: m2(reading.area) };
    const toggles = Object.fromEntries(
      EMPRISE_COUNTS.map((key) => [key, choice.counts[key] ? 'yes' : 'no'])
    );
    const cardValues = (definition) => ({
      definition,
      ...toggles,
      ...(choice.page === undefined ? {} : { page: choice.page })
    });
    blocks.push({
      kind: 'choice',
      label: { key: 'fr-urban-rules.surfaces.field.definition' },
      options: [
        {
          value: 'r420-1',
          label: { key: 'fr-urban-rules.surfaces.card.r420' },
          ...card(r420),
          ...(choice.definition === 'r420-1' ? { selected: true } : {}),
          values: cardValues('r420-1')
        },
        {
          value: 'lexicon',
          label:
            choice.page === undefined
              ? { key: 'fr-urban-rules.surfaces.card.lexicon' }
              : { key: 'fr-urban-rules.surfaces.card.lexiconPage', params: { page: choice.page } },
          ...card(lexiconReading),
          ...(choice.definition === 'lexicon' ? { selected: true } : {}),
          values: cardValues('lexicon')
        },
        {
          value: 'all-overhangs',
          label: { key: 'fr-urban-rules.surfaces.card.allOverhangs' },
          ...card(allOverhangs),
          ...(choice.definition === 'all-overhangs' ? { selected: true } : {}),
          values: cardValues('all-overhangs')
        }
      ],
      ...(readOnly ? {} : { action: definitionActionOf(choice) }),
      note:
        balconies.length === 0
          ? { key: 'fr-urban-rules.surfaces.choice.noBalconies' }
          : { key: 'fr-urban-rules.surfaces.choice.balconies', params: { area: area2(balconyTotal) } }
    });
    // What the headline and the cards do not say, folded: the definition's own detail, the entered
    // balconies, the per-building areas — listed for the breakdown only, never summed (DEC-1) — and
    // the definition's legal text.
    const detailBlocks = [];
    if (plu.area !== undefined && plotArea !== undefined) {
      detailBlocks.push({
        kind: 'fields',
        rows: [
          {
            label: definitionLabel,
            value: value(plu),
            detail:
              balconies.length === 0
                ? { key: 'fr-urban-rules.surfaces.emprise.detailNoBalconies' }
                : {
                    key: 'fr-urban-rules.surfaces.emprise.detailBalconies',
                    params: { area: area2(balconyTotal) }
                  }
          },
          ...(balconies.length > 0
            ? [
                {
                  label: { key: 'fr-urban-rules.surfaces.emprise.balconies' },
                  value: m2(balconyTotal),
                  detail: { key: 'fr-urban-rules.surfaces.emprise.balconiesEntered' }
                }
              ]
            : [])
        ]
      });
    } else if (balconies.length > 0) {
      detailBlocks.push({
        kind: 'fields',
        rows: [
          {
            label: { key: 'fr-urban-rules.surfaces.emprise.balconies' },
            value: m2(balconyTotal),
            detail: { key: 'fr-urban-rules.surfaces.emprise.balconiesEntered' }
          }
        ]
      });
    }
    // Per building, for the breakdown only: listed, never summed into the total (DEC-1).
    // The host's 200 rows, the existing building's two included (review NIT).
    const perBuilding = (plu.buildings ?? []).slice(
      0,
      TABLE_ROWS - (existing === undefined ? 0 : 2)
    );
    if (perBuilding.length > 0 || existing !== undefined) {
      detailBlocks.push({
        kind: 'table',
        columns: [
          { key: 'fr-urban-rules.surfaces.column.building' },
          { key: 'fr-urban-rules.surfaces.column.area' }
        ],
        rows: [
          ...perBuilding.map((b) => [
            buildingLabel(byId.get(b.buildingId) ?? { main: false }),
            b.refused === undefined
              ? m2(b.area)
              : {
                  key: 'fr-urban-rules.surfaces.notComputed',
                  params: { reason: cut(String(b.refused), 200) }
                }
          ]),
          ...(existing === undefined
            ? []
            : [
                [{ key: 'fr-urban-rules.surfaces.building.existing' }, m2(existing.area)],
                [
                  { key: 'fr-urban-rules.surfaces.building.existingLightweight' },
                  m2(existing.lightweightArea ?? 0)
                ]
              ])
        ]
      });
      detailBlocks.push({
        kind: 'notice',
        tone: 'info',
        text: { key: 'fr-urban-rules.surfaces.emprise.notSummed' }
      });
    }
    blocks.push({
      kind: 'section',
      id: 'emprise-detail',
      title: { key: 'fr-urban-rules.surfaces.section.empriseDetail' },
      icon: 'area',
      blocks: detailBlocks.length === 0 ? [articleQuote('R.420-1')] : [...detailBlocks, articleQuote('R.420-1')]
    });

    // ── DEC-2: the budget, and pleine terre ──
    const limits = confirmedLimits(planned);
    const footprintRules = planned.rules.filter(
      (r) =>
        r.kind === 'footprint_ratio' &&
        footprintPercentOf(r) !== undefined &&
        (r.status === 'confirmed' || r.status === 'to_confirm')
    );
    const allowed =
      limits.ces !== undefined && plotArea !== undefined
        ? (limits.ces.percent / 100) * plotArea
        : undefined;
    // Sprint 002.15: the budget is the host's used / remaining / allowed bar; the basis it rests on
    // is folded beneath. Without the bar (no allowance, or nothing measured) the rows say it all.
    const barDrawn = allowed !== undefined && allowed > 0 && plu.area !== undefined;
    if (barDrawn) {
      blocks.push({
        kind: 'meter',
        label: { key: 'fr-urban-rules.surfaces.budget.meter' },
        used: m2(plu.area),
        allowed: m2(allowed)
      });
    }
    const budgetRows = [
      {
        label: { key: 'fr-urban-rules.surfaces.budget.rule' },
        value:
          limits.ces !== undefined
            ? {
                key: 'fr-urban-rules.surfaces.budget.ces',
                params: { percent: limits.ces.percent }
              }
            : limits.notRegulated
              ? { key: 'fr-urban-rules.surfaces.budget.notRegulated' }
              : { key: 'fr-urban-rules.surfaces.budget.noRule' },
        ...(limits.ces === undefined ? {} : { detail: limits.ces.rule.label })
      },
      {
        label: { key: 'fr-urban-rules.surfaces.budget.plotArea' },
        value: plotArea === undefined ? { key: 'fr-urban-rules.value.none' } : m2(plotArea),
        detail: { key: 'fr-urban-rules.surfaces.budget.plotAreaDetail' }
      }
    ];
    const contenance = contenanceOf(site);
    if (contenance !== undefined) {
      budgetRows.push({
        label: { key: 'fr-urban-rules.surfaces.budget.contenance' },
        value: m2(contenance),
        detail: { key: 'fr-urban-rules.surfaces.budget.contenanceDetail' }
      });
    }
    if (coverage.available && typeof coverage.boundaryArea === 'number') {
      budgetRows.push({
        label: { key: 'fr-urban-rules.surfaces.budget.boundaryArea' },
        value: m2(coverage.boundaryArea),
        detail: { key: 'fr-urban-rules.surfaces.budget.boundaryAreaDetail' }
      });
    }
    if (allowed !== undefined && !barDrawn) {
      budgetRows.push({
        label: { key: 'fr-urban-rules.surfaces.budget.allowed' },
        value: m2(allowed)
      });
      if (plu.area !== undefined)
        budgetRows.push({
          label: { key: 'fr-urban-rules.surfaces.budget.remaining' },
          value: m2(allowed - plu.area),
          ...(allowed - plu.area < -RESOLUTION_HALF ? { tone: 'warning' } : {})
        });
    }
    if (plu.area !== undefined && !barDrawn)
      budgetRows.push({
        label: { key: 'fr-urban-rules.surfaces.budget.used' },
        value: m2(plu.area),
        detail: definitionLabel
      });
    blocks.push({
      kind: 'section',
      id: 'budget-basis',
      title: { key: 'fr-urban-rules.surfaces.section.budgetBasis' },
      icon: 'information',
      summary: { value: budgetRows[0].value },
      blocks: [{ kind: 'fields', rows: budgetRows }]
    });
    for (const rule of footprintRules) {
      const limit =
        plotArea === undefined ? undefined : (footprintPercentOf(rule) / 100) * plotArea;
      const subject = { kind: 'plot', label: { key: 'fr-urban-rules.check.subject.plot' } };
      if (plu.area === undefined || limit === undefined) {
        checks.push({
          id: `srf:${rule.id}`,
          ruleId: rule.id,
          subject,
          result: 'not_checked',
          assumptionIds: [note(plu.area === undefined ? (plu.refused ?? 'unavailable') : 'no-plot')]
        });
        continue;
      }
      checks.push({
        id: `srf:${rule.id}`,
        ruleId: rule.id,
        subject,
        measured: m2(plu.area),
        limit: m2(limit),
        result: plu.area <= limit + RESOLUTION_HALF ? 'no_issue' : 'potential_issue',
        assumptionIds: said
      });
    }
    // Pleine terre (DEC-2): the open ground is the `ground` level's unbuilt area.
    const greenRules = planned.rules.filter(
      (r) =>
        r.kind === 'green_ratio' &&
        greenPercentOf(r) !== undefined &&
        (r.status === 'confirmed' || r.status === 'to_confirm')
    );
    const ground = coverage.available ? coverage.levels?.ground : undefined;
    const unbuilt =
      ground !== undefined && ground.refused === undefined ? ground.unbuilt : undefined;
    if (unbuilt !== undefined) {
      const greenId = assume('pleine-terre-unbuilt', {
        key: 'fr-urban-rules.assumption.pleineTerre'
      });
      const confirmedGreen = greenRules.filter((r) => r.status === 'confirmed');
      const required =
        confirmedGreen.length > 0 && plotArea !== undefined
          ? (Math.max(...confirmedGreen.map((r) => greenPercentOf(r))) / 100) * plotArea
          : undefined;
      // Sprint 002.15: a fold — its summary says the shortfall, its body the gauge, the two figures,
      // the rule with its confirm button and its passage (the host's rules list).
      const short = required !== undefined && unbuilt + RESOLUTION_HALF < required;
      const round1 = (value) => Math.round(value * 10) / 10;
      const unbuiltPercent = plotArea === undefined ? undefined : round1((unbuilt / plotArea) * 100);
      const requiredPercent =
        confirmedGreen.length > 0 ? Math.max(...confirmedGreen.map((r) => greenPercentOf(r))) : undefined;
      const greenBlocks = [];
      if (unbuiltPercent !== undefined) {
        greenBlocks.push({
          kind: 'stat',
          label: { key: 'fr-urban-rules.surfaces.green.unbuilt' },
          value: { value: unbuiltPercent, unit: 'percent' },
          detail: short
            ? {
                key: 'fr-urban-rules.surfaces.green.short',
                params: {
                  percent: round1((required - unbuilt) / plotArea * 100),
                  area: area2(required - unbuilt)
                }
              }
            : { key: 'fr-urban-rules.surfaces.green.free', params: { area: area2(unbuilt) } },
          gauge: {
            value: { value: unbuiltPercent, unit: 'percent' },
            ...(requiredPercent === undefined
              ? {}
              : { limit: { value: requiredPercent, unit: 'percent' } }),
            max: { value: 100, unit: 'percent' }
          },
          ...(short ? { tone: 'warning' } : {})
        });
      }
      greenBlocks.push({
        kind: 'fields',
        rows: [
          {
            label: { key: 'fr-urban-rules.surfaces.green.unbuilt' },
            value: m2(unbuilt),
            detail: { key: 'fr-urban-rules.assumption.pleineTerre' }
          },
          ...(required === undefined
            ? []
            : [
                {
                  label: { key: 'fr-urban-rules.surfaces.green.required' },
                  value: m2(required),
                  ...(short ? { tone: 'warning' } : {})
                }
              ])
        ]
      });
      if (greenRules.length > 0) {
        greenBlocks.push({ kind: 'rules', ids: greenRules.map((r) => r.id) });
        const greenActions = readOnly ? [] : greenRules.flatMap((r) => planned.actionsFor(r));
        if (greenActions.length > 0) greenBlocks.push({ kind: 'actions', actions: greenActions });
      }
      blocks.push({
        kind: 'section',
        id: 'green',
        title: { key: 'fr-urban-rules.surfaces.section.green' },
        icon: 'area',
        summary: short
          ? {
              value: {
                key: 'fr-urban-rules.surfaces.green.short',
                params: {
                  percent: round1((required - unbuilt) / plotArea * 100),
                  area: area2(required - unbuilt)
                }
              },
              tone: 'warning'
            }
          : { value: { key: 'fr-urban-rules.surfaces.green.free', params: { area: area2(unbuilt) } } },
        blocks: greenBlocks
      });
      for (const rule of greenRules) {
        const limit =
          plotArea === undefined ? undefined : (greenPercentOf(rule) / 100) * plotArea;
        if (limit === undefined) continue;
        checks.push({
          id: `srf:${rule.id}`,
          ruleId: rule.id,
          subject: { kind: 'plot', label: { key: 'fr-urban-rules.check.subject.plot' } },
          measured: m2(unbuilt),
          limit: m2(limit),
          result: unbuilt + RESOLUTION_HALF >= limit ? 'no_issue' : 'potential_issue',
          assumptionIds: [greenId]
        });
      }
    }

    // ── DEC-3: the surface de plancher ──
    const sdp = floorArea(service, buildings, answersOf(section?.sdp, variation) ?? {});
    blocks.push({
      kind: 'section',
      id: 'floor-area',
      title: { key: 'fr-urban-rules.surfaces.heading.sdp' },
      icon: 'document',
      ...(sdp.total === undefined ? {} : { summary: { value: m2(sdp.total) } }),
      blocks: [articleQuote('R.111-22'), ...sdp.blocks]
    });
    if (sdp.partitions)
      said.push(assume('sdp-partitions', { key: 'fr-urban-rules.assumption.sdpPartitions' }));

    // ── DEC-4: extension and annex caps ──
    const roles = answersOf(section?.roles, variation) ?? {};
    const extensionIds = idList(roles.extension).filter((id) => byId.has(id));
    const annexIds = idList(roles.annex).filter((id) => byId.has(id));
    const capRules = planned.rules.filter(
      (r) =>
        ['extension_max', 'annex_max', 'floor_area_max'].includes(r.kind) &&
        (r.limit?.kind === 'value' ||
          (r.kind === 'extension_max' && extensionShareOf(r) !== undefined)) &&
        (r.status === 'confirmed' || r.status === 'to_confirm')
    );
    const levelArea = (id) =>
      (plu.buildings ?? []).find((b) => b.buildingId === id && b.refused === undefined)?.area;
    const annexArea = annexIds.reduce((sum, id) => sum + (levelArea(id) ?? 0), 0);
    const extended =
      plu.covered !== undefined && existing !== undefined
        ? Math.max(0, plu.covered - pluExistingArea - annexArea)
        : undefined;
    const capRows = [
      {
        label: { key: 'fr-urban-rules.surfaces.caps.existing' },
        value: existing === undefined ? { key: 'fr-urban-rules.value.none' } : m2(pluExistingArea),
        detail:
          report.document?.validFrom === undefined
            ? { key: 'fr-urban-rules.surfaces.caps.existingDetail' }
            : {
                key: 'fr-urban-rules.surfaces.caps.existingDetailDate',
                params: { date: report.document.validFrom }
              }
      },
      {
        label: { key: 'fr-urban-rules.surfaces.caps.extended' },
        value: extended === undefined ? { key: 'fr-urban-rules.value.none' } : m2(extended),
        detail: { key: 'fr-urban-rules.surfaces.caps.extendedDetail' }
      }
    ];
    const unclassified = buildings.filter(
      (b) => b.main !== true && !extensionIds.includes(b.id) && !annexIds.includes(b.id)
    );
    for (const b of buildings.filter(
      (x) => extensionIds.includes(x.id) || annexIds.includes(x.id)
    )) {
      capRows.push({
        label: buildingLabel(b),
        value:
          levelArea(b.id) === undefined
            ? { key: 'fr-urban-rules.value.none' }
            : m2(levelArea(b.id)),
        detail: {
          key: extensionIds.includes(b.id) ? ROLE_LABEL_KEYS.extension : ROLE_LABEL_KEYS.annex
        }
      });
    }
    if (unclassified.length > 0) {
      capRows.push({
        label: { key: 'fr-urban-rules.surfaces.caps.unclassified' },
        value: {
          text: unclassified
            .map((b) => b.name ?? '—')
            .join(', ')
            .slice(0, 2000)
        }
      });
    }
    const existingId = assume('existing-as-modelled', {
      key: 'fr-urban-rules.assumption.existingAsModelled',
      params: { date: report.document?.validFrom ?? '—' }
    });
    const extensionLimits = [];
    for (const rule of capRules) {
      const subject = { kind: 'plot', label: { key: CAP_SUBJECT_KEYS[rule.kind] } };
      const ratio = rule.limit.kind === 'ratio' || rule.limit.quantity.unit === 'percent';
      if (rule.kind === 'extension_max') {
        // 002.9: a written share of the floor area is never measured against the emprise.
        const share = ratio ? extensionShareOf(rule) : undefined;
        if (share?.base === 'other') {
          checks.push({
            id: `srf:${rule.id}`,
            ruleId: rule.id,
            subject,
            result: 'not_checked',
            assumptionIds: [note('ratio-base-unknown')]
          });
          continue;
        }
        const limit = ratio
          ? existing === undefined
            ? undefined
            : (share.percent / 100) * pluExistingArea
          : rule.limit.quantity.value;
        if (limit === undefined || extended === undefined) {
          checks.push({
            id: `srf:${rule.id}`,
            ruleId: rule.id,
            subject,
            result: 'not_checked',
            assumptionIds: [
              note(existing === undefined ? 'no-existing' : (plu.refused ?? 'unavailable'))
            ]
          });
          continue;
        }
        if (rule.status === 'confirmed') extensionLimits.push({ rule, limit });
        checks.push({
          id: `srf:${rule.id}`,
          ruleId: rule.id,
          subject,
          measured: m2(extended),
          limit: m2(limit),
          result: extended <= limit + RESOLUTION_HALF ? 'no_issue' : 'potential_issue',
          assumptionIds: [existingId]
        });
      } else if (rule.kind === 'annex_max') {
        if (annexIds.length === 0) {
          checks.push({
            id: `srf:${rule.id}`,
            ruleId: rule.id,
            subject,
            result: 'not_checked',
            assumptionIds: [note('no-annex-marked')]
          });
          continue;
        }
        for (const id of annexIds) {
          const area = levelArea(id);
          const b = byId.get(id);
          const annexSubject = { kind: 'building', id, label: buildingLabel(b) };
          if (area === undefined || ratio) {
            checks.push({
              id: `srf:${rule.id}:${id}`,
              ruleId: rule.id,
              subject: annexSubject,
              result: 'not_checked',
              assumptionIds: [note(ratio ? 'ratio-base-unknown' : 'unavailable')]
            });
            continue;
          }
          checks.push({
            id: `srf:${rule.id}:${id}`,
            ruleId: rule.id,
            subject: annexSubject,
            measured: m2(area),
            limit: m2(rule.limit.quantity.value),
            result:
              area <= rule.limit.quantity.value + RESOLUTION_HALF ? 'no_issue' : 'potential_issue',
            assumptionIds: said
          });
        }
      } else if (!ratio && sdp.total !== undefined) {
        checks.push({
          id: `srf:${rule.id}`,
          ruleId: rule.id,
          subject,
          measured: m2(sdp.total),
          limit: m2(rule.limit.quantity.value),
          result:
            sdp.total <= rule.limit.quantity.value + RESOLUTION_HALF
              ? 'no_issue'
              : 'potential_issue',
          assumptionIds:
            sdp.missing > 0 || sdp.estimate
              ? [assume('sdp-estimate', { key: 'fr-urban-rules.assumption.sdpEstimate' })]
              : []
        });
      } else {
        checks.push({
          id: `srf:${rule.id}`,
          ruleId: rule.id,
          subject,
          result: 'not_checked',
          assumptionIds: [note(ratio ? 'ratio-base-unknown' : 'unavailable')]
        });
      }
    }
    if (extensionLimits.length > 0) {
      const governing = extensionLimits.reduce((a, b) => (b.limit < a.limit ? b : a));
      capRows.push({
        label: { key: 'fr-urban-rules.surfaces.caps.allowed' },
        value: m2(governing.limit),
        detail: {
          key: 'fr-urban-rules.surfaces.caps.governedBy',
          params: { rule: phraseText(governing.rule.label) }
        }
      });
    }
    blocks.push({
      kind: 'section',
      id: 'caps',
      title: { key: 'fr-urban-rules.surfaces.heading.caps' },
      icon: 'rules',
      ...(extensionLimits.length === 0
        ? {}
        : {
            summary: {
              value: {
                key: 'fr-urban-rules.surfaces.caps.summary',
                params: {
                  area: area2(extensionLimits.reduce((a, b) => (b.limit < a.limit ? b : a)).limit)
                }
              }
            }
          }),
      blocks: [{ kind: 'fields', rows: capRows }]
    });

    // ── DEC-5: the theoretical capacity ──
    const floor = floorToFloor();
    if (floor.assumed)
      assume('floor-to-floor-default', {
        key: 'fr-urban-rules.assumption.floorToFloorDefault',
        params: { height: floor.value }
      });
    const storeys = storeysOf(limits.heights, floor.value);
    const envelopeArea =
      envelope?.rings?.[0] === undefined
        ? undefined
        : Math.max(0, envelope.rings.reduce((sum, ring) => sum + signedRingArea(ring), 0));
    const groundLimits = [envelopeArea, allowed].filter((v) => v !== undefined);
    const groundArea = groundLimits.length === 0 ? undefined : Math.min(...groundLimits);
    const capacity =
      storeys === undefined || groundArea === undefined
        ? undefined
        : { low: groundArea * storeys.low, high: groundArea * storeys.high };
    // Sprint 002.15: a fold — its summary the range, its body the range as a bar, « not a right to
    // build » in the headline's own detail, the ground and the storeys, and what was not applied.
    const capacityBlocks = [];
    if (capacity === undefined) {
      capacityBlocks.push({
        kind: 'notice',
        tone: 'info',
        text: {
          key:
            storeys === undefined
              ? groundArea === undefined
                ? 'fr-urban-rules.surfaces.capacity.missingBoth'
                : 'fr-urban-rules.surfaces.capacity.missingHeight'
              : 'fr-urban-rules.surfaces.capacity.missingGround'
        }
      });
    } else {
      const range = {
        key: 'fr-urban-rules.surfaces.capacity.rangeValue',
        params: { low: area2(capacity.low), high: area2(capacity.high) }
      };
      capacityBlocks.push({
        kind: 'stat',
        label: { key: 'fr-urban-rules.surfaces.capacity.range' },
        value: range,
        detail: { key: 'fr-urban-rules.surfaces.capacity.notARight' },
        gauge: {
          value: m2(capacity.high),
          from: m2(capacity.low)
        }
      });
      capacityBlocks.push({
        kind: 'fields',
        rows: [
          {
            label: { key: 'fr-urban-rules.surfaces.capacity.ground' },
            value: m2(groundArea),
            detail: {
              key:
                groundArea === envelopeArea
                  ? 'fr-urban-rules.surfaces.capacity.byEnvelope'
                  : 'fr-urban-rules.surfaces.capacity.byAllowance'
            }
          },
          {
            label: { key: 'fr-urban-rules.surfaces.capacity.storeys' },
            value: {
              key: 'fr-urban-rules.surfaces.capacity.storeysValue',
              params: { low: storeys.low, high: storeys.high }
            },
            detail: {
              key: 'fr-urban-rules.surfaces.capacity.floorToFloor',
              params: { height: floor.value }
            }
          }
        ]
      });
    }
    capacityBlocks.push({
      kind: 'notice',
      tone: 'info',
      text: {
        key:
          regime === 'rnu' || regime === 'cc'
            ? 'fr-urban-rules.surfaces.capacity.notAppliedNational'
            : 'fr-urban-rules.surfaces.capacity.notApplied'
      }
    });
    blocks.push({
      kind: 'section',
      id: 'capacity',
      title: { key: 'fr-urban-rules.surfaces.heading.capacity' },
      icon: 'envelope',
      summary:
        capacity === undefined
          ? { value: { key: 'fr-urban-rules.surfaces.capacity.estimate' } }
          : {
              value: {
                key: 'fr-urban-rules.surfaces.capacity.rangeValue',
                params: { low: area2(capacity.low), high: area2(capacity.high) }
              },
              tone: 'info'
            },
      blocks: capacityBlocks
    });

    // ── DEC-6: the procedure, indicative ──
    const procedure = procedureFlags({
      site,
      buildings,
      extensionIds,
      sdp,
      r420,
      existing,
      existingArea,
      regime,
      reportFacts,
      flags
    });
    blocks.push({
      kind: 'section',
      id: 'procedure',
      title: { key: 'fr-urban-rules.surfaces.heading.procedure' },
      icon: 'information',
      summary: { value: { key: 'fr-urban-rules.surfaces.procedure.indicative' } },
      blocks: [
        { kind: 'notice', tone: 'info', text: { key: 'fr-urban-rules.surfaces.procedure.indicative' } },
        { kind: 'fields', rows: procedure.rows }
      ]
    });

    // ── The answers: one action each, one Request each (096.4) ──
    if (!readOnly)
      blocks.push(
        ...surfaceActions({
          choice,
          buildings,
          sdp,
          roles: { extensionIds, annexIds },
          balconyAnswers
        })
      );
    else
      blocks.push({
        kind: 'notice',
        tone: 'warning',
        text: { key: 'fr-urban-rules.notice.newerSection' }
      });
    blocks.push({ kind: 'assumptions', ids: [...new Set(said)] });

    return {
      view: view(blocks),
      checks,
      // Sprint 002.8 DEC-3: the figures `remaining_area` states — this view's own.
      figures: {
        emprise: plu.area,
        empriseRefused: plu.area === undefined ? String(plu.refused ?? 'unavailable') : undefined,
        definition: definitionLabel,
        plotArea,
        allowed,
        ces:
          limits.ces === undefined
            ? undefined
            : { percent: limits.ces.percent, ruleId: limits.ces.rule.id },
        notRegulatedRuleId: limits.notRegulated
          ? planned.rules.find(
              (r) =>
                r.status === 'confirmed' &&
                r.kind === 'footprint_ratio' &&
                r.statement === 'not_regulated'
            )?.id
          : undefined,
        sdp: { total: sdp.total, missing: sdp.missing ?? 0, estimate: sdp.estimate === true },
        capacity,
        groundArea,
        storeys,
        floor
      },
      programme: {
        plotArea,
        allowed,
        heights: limits.heights.map((h) => h.value),
        storeys,
        capacity,
        floorToFloor: floor.value
      }
    };
  }

  /** The definition a figure is composed under, quoted from the verified text (step 1). */
  function articleQuote(article) {
    return {
      kind: 'quote',
      passage: { text: ARTICLES[article].text, lang: 'fr' },
      citation: {
        document: {
          text: `Code de l’urbanisme, version en vigueur depuis le ${ARTICLES[article].versionText}`,
          lang: 'fr'
        },
        article,
        href: legifrance(article)
      }
    };
  }

  /** A phrase's own words, for a parameter (a phrase cannot nest): the text, or its key. */
  // Acceptance fix (002.4, 2026-10-20): a phrase given by key is translated
  // before it is put into another phrase's parameters — the walk read "Governed
  // by: fr-urban-rules.entered.kind.extension_ratio" on Gordes. The key stays
  // the fallback when no translation answers (as `translate` does elsewhere).
  const phraseText = (phrase) =>
    cut(
      String(
        phrase?.text ??
          (typeof phrase?.key === 'string'
            ? (translate(phrase.key, phrase.params) ?? phrase.key)
            : '')
      ),
      200
    );

  /** DEC-3: R.111-22's lines, keyed by the article's numbers. */
  const SDP_ANSWERED = ['2', '4', '5', '6', '7', '8'];
  const SDP_ROOM_KINDS = { parking: '4', attics: '5', technical: '6', cellars: '7' };
  /** Bands are `[from, to)`: half the working resolution above 1.80 m puts a 1.80 m ceiling in 3° (DEC-3). */
  const SDP_BAND = 1.8005;

  /**
   * DEC-3: the surface de plancher of the open variation's buildings — the
   * storeys' area inside the external walls, less the floor no ceiling covers,
   * less each of R.111-22's deductions: computed (3°), answered by the user
   * (2°, 4°–8°) or assumed (1°). A room's area is deducted once; its part under
   * 1.80 m leaves the 3° line first. Answers naming a room or a storey that no
   * longer exists are ignored, never pruned.
   */
  function floorArea(service, buildings, answers) {
    const none = new Set(idList(answers.none).filter((n) => SDP_ANSWERED.includes(n)));
    const ticked = Object.fromEntries(
      Object.keys(SDP_ROOM_KINDS).map((k) => [k, new Set(idList(answers[k]))])
    );
    const collective = new Set(idList(answers.collective));
    const served = new Set(idList(answers.served));
    const voids = Array.isArray(answers.voids)
      ? answers.voids.filter(
          (v) => isRecord(v) && typeof v.storeyId === 'string' && positive(v.area)
        )
      : [];
    const rooms = [];
    const storeys = [];
    const perBuilding = [];
    let base = 0;
    let uncovered = 0;
    let low = 0;
    let error = 0;
    let unknownLow = [];
    let refused = [];
    let any = false;
    for (const building of buildings) {
      let answer;
      try {
        answer = service.measures.floorAreas({
          ...(building.main ? {} : { buildingId: building.id }),
          heightBands: [SDP_BAND]
        });
      } catch (cause) {
        answer = { available: false, reason: 'unavailable' };
      }
      if (!answer.available) {
        if (answer.reason !== 'no-rooms') refused.push(answer.reason);
        continue;
      }
      const totals = { building, base: 0, uncovered: 0, low: 0, deducted: 0 };
      for (const storey of answer.storeys ?? []) {
        storeys.push({ id: storey.levelId, building });
        const inside = storey.insideExternalWalls;
        if (inside === undefined || inside.refused !== undefined) {
          refused.push(inside?.refused ?? 'unavailable');
          continue;
        }
        any = true;
        totals.base += inside.area;
        const head = inside.headroom;
        if (head?.covered === true) {
          totals.uncovered += head.uncoveredArea ?? 0;
          totals.low += lowBand(head.bands);
          if (head.method === 'sampled' && positive(head.error)) error += head.error;
        } else {
          // Review fix (NIT): a storey no ceiling covers is not "clos et
          // couvert" — its whole area leaves the base — and the total stays an
          // estimate, said.
          if (head?.covered === false) totals.uncovered += inside.area;
          unknownLow.push(head?.refused ?? 'not-covered');
        }
        for (const room of storey.rooms ?? []) {
          if (room.refused !== undefined) continue;
          rooms.push({
            id: room.roomId,
            levelId: storey.levelId,
            name: room.name,
            netArea: room.netArea,
            low: room.headroom?.covered === true ? lowBand(room.headroom.bands) : 0,
            building
          });
        }
      }
      base += totals.base;
      uncovered += totals.uncovered;
      low += totals.low;
      perBuilding.push(totals);
    }
    const roomIds = new Map(rooms.map((r) => [r.id, r]));
    const levelIds = new Set(storeys.map((s) => s.id));
    // Review fix S1: a room ticked under two deductions is deducted once, under
    // the first (parking, attics, technical, cellars).
    const claimed = new Set();
    const sumRooms = (kind, applies = () => true) => {
      let area = 0;
      let lowPart = 0;
      for (const id of ticked[kind]) {
        const room = roomIds.get(id);
        if (room === undefined || claimed.has(id) || !applies(room)) continue;
        claimed.add(id);
        area += room.netArea;
        lowPart += room.low;
        const totals = perBuilding.find((t) => t.building === room.building);
        if (totals !== undefined) totals.deducted += room.netArea;
      }
      return { area, low: lowPart };
    };
    const voidArea = voids.filter((v) => levelIds.has(v.storeyId)).reduce((s, v) => s + v.area, 0);
    for (const v of voids.filter((x) => levelIds.has(x.storeyId))) {
      const totals = perBuilding.find(
        (t) => storeys.find((s) => s.id === v.storeyId)?.building === t.building
      );
      if (totals !== undefined) totals.deducted += v.area;
    }
    const parking = sumRooms('parking');
    const attics = sumRooms('attics');
    const technical = sumRooms('technical', (room) => collective.has(room.building.id));
    const technicalHouse = [...ticked.technical].some(
      (id) => roomIds.has(id) && !collective.has(roomIds.get(id).building.id)
    );
    const cellars = sumRooms('cellars');
    const low3 = Math.max(0, low - parking.low - attics.low - technical.low - cellars.low);
    // 8°: 10 % of what remains of a building served by internal common parts.
    let tenPercent = 0;
    for (const totals of perBuilding) {
      if (!served.has(totals.building.id)) continue;
      const lowShare = low === 0 ? 0 : (low3 * totals.low) / low;
      tenPercent += 0.1 * Math.max(0, totals.base - totals.uncovered - lowShare - totals.deducted);
    }
    const answered = (n, given) => given || none.has(n);
    const lines = [
      { n: '1', amount: undefined, state: 'assumed' },
      { n: '2', amount: voidArea, state: answered('2', voids.length > 0) ? 'answered' : 'missing' },
      { n: '3', amount: low3, state: unknownLow.length > 0 ? 'unknown' : 'computed', error },
      {
        n: '4',
        amount: parking.area,
        state: answered('4', ticked.parking.size > 0) ? 'answered' : 'missing'
      },
      {
        n: '5',
        amount: attics.area,
        state: answered('5', ticked.attics.size > 0) ? 'answered' : 'missing'
      },
      {
        n: '6',
        amount: technical.area,
        state: answered('6', ticked.technical.size > 0) ? 'answered' : 'missing',
        house: technicalHouse
      },
      {
        n: '7',
        amount: cellars.area,
        state: answered('7', ticked.cellars.size > 0) ? 'answered' : 'missing'
      },
      { n: '8', amount: tenPercent, state: answered('8', served.size > 0) ? 'answered' : 'missing' }
    ];
    const missing = lines.filter((l) => l.state === 'missing').length;
    const estimate = unknownLow.length > 0 || refused.length > 0;
    const deducted = lines
      .filter((l) => l.state === 'answered' || l.state === 'computed' || l.state === 'unknown')
      .reduce((s, l) => s + (l.amount ?? 0), 0);
    const total = any ? base - uncovered - deducted : undefined;
    const blocks = [];
    if (!any) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: {
          key:
            refused.length > 0
              ? 'fr-urban-rules.surfaces.sdp.refused'
              : 'fr-urban-rules.surfaces.sdp.noFloor'
        }
      });
      return {
        blocks,
        total: undefined,
        missing,
        estimate: true,
        rooms,
        storeys,
        partitions: false
      };
    }
    const amount = (line) =>
      line.state === 'missing'
        ? { key: 'fr-urban-rules.surfaces.sdp.answerNeeded' }
        : line.state === 'assumed'
          ? { key: 'fr-urban-rules.surfaces.sdp.notDeducted' }
          : line.state === 'unknown'
            ? {
                key: 'fr-urban-rules.surfaces.sdp.unknownHeadroom',
                params: { area: area2(line.amount) }
              }
            : m2(line.amount);
    blocks.push({
      kind: 'table',
      columns: [
        { key: 'fr-urban-rules.surfaces.column.line' },
        { key: 'fr-urban-rules.surfaces.column.article' },
        { key: 'fr-urban-rules.surfaces.column.area' }
      ],
      rows: [
        [{ key: 'fr-urban-rules.surfaces.sdp.base' }, { text: 'R.111-22' }, m2(base)],
        [{ key: 'fr-urban-rules.surfaces.sdp.uncovered' }, { text: 'R.111-22' }, m2(-uncovered)],
        ...lines.map((line) => [
          { key: SDP_LINE_KEYS[line.n] },
          { text: `R.111-22, ${line.n}°` },
          amount(line)
        ]),
        [
          missing > 0 || estimate
            ? { key: 'fr-urban-rules.surfaces.sdp.totalEstimate', params: { count: missing } }
            : { key: 'fr-urban-rules.surfaces.sdp.total' },
          { text: 'R.111-22' },
          m2(total)
        ]
      ]
    });
    if (lines[2].error > 0) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: { key: 'fr-urban-rules.surfaces.sdp.sampled', params: { error: area2(error) } }
      });
    }
    if (unknownLow.length > 0 || refused.length > 0) {
      blocks.push({
        kind: 'notice',
        tone: 'warning',
        text: {
          key: 'fr-urban-rules.surfaces.sdp.estimateReason',
          params: { reason: cut([...new Set([...unknownLow, ...refused])].join(', '), 200) }
        }
      });
    }
    if (technicalHouse) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: { key: 'fr-urban-rules.surfaces.sdp.technicalHouse' }
      });
    }
    return {
      blocks,
      total,
      missing,
      estimate,
      rooms,
      storeys,
      partitions: rooms.length > 0,
      perBuilding
    };
  }

  /** The area of the bands below 1.80 m (DEC-3). */
  function lowBand(bands) {
    if (!Array.isArray(bands)) return 0;
    return bands
      .filter((b) => typeof b?.to === 'number' && b.to <= SDP_BAND + 1e-9 && positive(b.area))
      .reduce((s, b) => s + b.area, 0);
  }

  /**
   * DEC-6: the procedure a project would likely need — indicative, every
   * threshold from {@link PROCEDURE_THRESHOLDS} with its article and the date
   * it was read on Légifrance; one not verified raises no flag and says "to
   * verify". Livre IV's emprise is always R.420-1's.
   */
  function procedureFlags({
    site,
    buildings,
    extensionIds,
    sdp,
    r420,
    existing,
    existingArea,
    regime,
    reportFacts,
    flags
  }) {
    const T = PROCEDURE_THRESHOLDS;
    const rows = [];
    const cite = (article) => ({
      key: 'fr-urban-rules.surfaces.procedure.cite',
      params: { article, date: PROCEDURE_ARTICLES[article].readOn }
    });
    const protectedArea = flags.some((f) => f.kind === 'abf' || f.kind === 'site');
    const uZone =
      (regime === 'plu' || regime === 'plui') &&
      (reportFacts?.zones ?? []).some((z) => String(z.typezone ?? '').toUpperCase() === 'U');
    const works =
      existing !== undefined &&
      (site.existingBuilding?.relation === 'extended' || extensionIds.length > 0);
    const incomplete = sdp.total === undefined || sdp.missing > 0 || sdp.estimate;
    const top = Math.max(
      ...buildings
        .map((b) => b.projection?.height?.topAboveGround?.fromLowest)
        .filter((h) => Number.isFinite(h)),
      -Infinity
    );
    const heightKnown = Number.isFinite(top);
    let procedure;
    let article;
    if (r420.area === undefined || sdp.total === undefined) {
      procedure = undefined;
    } else if (!works) {
      const E = Math.max(0, r420.area - existingArea);
      const S = sdp.total;
      const tall = heightKnown && top > T.height + RESOLUTION_HALF;
      // "Inférieure ou égale" / "supérieure à": a figure that rounds to the
      // threshold is at it (review NIT: exactly 20 m² is not "plus de 20").
      const atMost = (value, limit) => value <= limit + RESOLUTION_HALF;
      if (atMost(E, T.tiny) && atMost(S, T.tiny) && !tall && !protectedArea) {
        procedure = 'none';
        article = 'R.421-2';
      } else if (atMost(E, T.tiny) && atMost(S, T.tiny) && tall && !protectedArea) {
        // R.421-9 c): above 12 m with at most 5 m² of emprise and of floor.
        procedure = 'declaration';
        article = 'R.421-9';
      } else if (atMost(E, T.small) && atMost(S, T.small) && !tall) {
        procedure = 'declaration';
        article = protectedArea ? 'R.421-11' : 'R.421-9';
      } else {
        procedure = 'permit';
        article = 'R.421-1';
      }
      rows.push({
        label: { key: 'fr-urban-rules.surfaces.procedure.figures' },
        value: {
          key: 'fr-urban-rules.surfaces.procedure.figuresNew',
          params: { emprise: area2(E), floorArea: area2(S) }
        },
        ...(heightKnown
          ? {}
          : { detail: { key: 'fr-urban-rules.surfaces.procedure.heightUnknown' } })
      });
    } else {
      const createdE = Math.max(0, r420.area - existingArea);
      const extensionSdp = (sdp.perBuilding ?? [])
        .filter((t) => extensionIds.includes(t.building.id))
        .reduce((s, t) => s + Math.max(0, t.base - t.uncovered), 0);
      const createdS = extensionIds.length > 0 ? extensionSdp : undefined;
      const created = Math.max(createdE, createdS ?? 0);
      const totalS = sdp.total;
      const totalE = r420.area;
      const pastArchitect = totalS > T.architect + RESOLUTION_HALF;
      const atMost = (value, limit) => value <= limit + RESOLUTION_HALF;
      if (atMost(created, T.tiny)) {
        // R.421-13: works on an existing building need no formality outside
        // R.421-14 to -17 (review NIT: its own article, verified).
        procedure = 'none';
        article = 'R.421-13';
      } else if (atMost(created, T.small)) {
        procedure = 'declaration';
        article = 'R.421-17';
      } else if (uZone && atMost(created, T.uZone) && !pastArchitect) {
        procedure = 'declaration';
        article = 'R.421-17';
      } else {
        procedure = 'permit';
        article = 'R.421-14';
      }
      rows.push({
        label: { key: 'fr-urban-rules.surfaces.procedure.figures' },
        value: {
          key: 'fr-urban-rules.surfaces.procedure.figuresWorks',
          params: {
            emprise: area2(createdE),
            floorArea: createdS === undefined ? '—' : area2(createdS),
            totalEmprise: area2(totalE),
            totalFloorArea: area2(totalS)
          }
        },
        detail: {
          key: uZone
            ? 'fr-urban-rules.surfaces.procedure.uZone'
            : 'fr-urban-rules.surfaces.procedure.notUZone'
        }
      });
      // Review fix S5: with no storey of the existing building modelled, the
      // totals after works hold the extension only, and the row says so.
      const existingModelled = (sdp.perBuilding ?? []).some(
        (t) => !extensionIds.includes(t.building.id) && t.base > 0
      );
      if (!existingModelled) {
        rows.push({
          label: { key: 'fr-urban-rules.surfaces.procedure.existingFloorArea' },
          value: { key: 'fr-urban-rules.surfaces.procedure.existingNotModelled' },
          tone: 'warning'
        });
      }
      if (createdS === undefined) {
        rows.push({
          label: { key: 'fr-urban-rules.surfaces.procedure.extensionUnmarked' },
          value: { key: 'fr-urban-rules.surfaces.procedure.markExtension' },
          tone: 'warning'
        });
      }
    }
    if (procedure === undefined) {
      rows.push({
        label: { key: 'fr-urban-rules.surfaces.procedure.likely' },
        value: { key: 'fr-urban-rules.surfaces.procedure.notComputed' }
      });
      return { rows, procedure };
    }
    rows.push({
      label: { key: 'fr-urban-rules.surfaces.procedure.likely' },
      value: { key: PROCEDURE_KEYS[procedure] },
      detail: incomplete
        ? { key: 'fr-urban-rules.surfaces.procedure.incomplete', params: { article } }
        : cite(article),
      tone: 'info'
    });
    // The architect (L.431-1, L.431-3, R.431-2): for a permit only.
    let architect;
    if (procedure !== 'permit') {
      architect = {
        value: { key: 'fr-urban-rules.surfaces.procedure.architectNotForDeclaration' },
        detail: cite('L.431-1')
      };
    } else if (sdp.total > T.architect + RESOLUTION_HALF && incomplete) {
      // Review fix S4: past 150 m² on an estimate — answers missing or a
      // headroom unknown — is no verdict either way.
      architect = {
        value: { key: 'fr-urban-rules.surfaces.procedure.toVerifyEstimate' },
        detail: cite('R.431-2')
      };
    } else if (sdp.total > T.architect + RESOLUTION_HALF) {
      architect = {
        value: { key: 'fr-urban-rules.surfaces.procedure.architectRequired' },
        detail: cite('R.431-2'),
        tone: 'warning',
        flag: true
      };
    } else if (works && r420.area > T.architect + RESOLUTION_HALF && !T.architectEmpriseVerified) {
      architect = {
        value: { key: 'fr-urban-rules.surfaces.procedure.toVerify' },
        detail: {
          key: 'fr-urban-rules.surfaces.procedure.architectEmpriseToVerify',
          params: { area: T.architect }
        }
      };
    } else {
      architect = {
        value: { key: 'fr-urban-rules.surfaces.procedure.architectNotRequired' },
        detail: cite('R.431-2')
      };
    }
    rows.push({
      label: { key: 'fr-urban-rules.surfaces.procedure.architect' },
      value: architect.value,
      detail: architect.detail,
      ...(architect.tone ? { tone: architect.tone } : {})
    });
    if (protectedArea)
      rows.push({
        label: { key: 'fr-urban-rules.surfaces.procedure.protected' },
        value: { key: 'fr-urban-rules.surfaces.procedure.seeFlags' }
      });
    return { rows, procedure, architect: architect.flag === true, article };
  }

  /**
   * The emprise definition's action (DEC-1): a `definition` choice, the four yes/no counts and an
   * optional page. The Surfaces view's choice runs it from a card (Sprint 002.15) and its actions
   * block offers the same object, so the two share one identity — and one busy state.
   */
  function definitionActionOf(choice) {
    const yesNo = [
      { value: 'yes', label: { key: 'fr-urban-rules.surfaces.answer.yes' } },
      { value: 'no', label: { key: 'fr-urban-rules.surfaces.answer.no' } }
    ];
    const toggle = (key) => ({
      key,
      label: { key: COUNT_KEYS[key] },
      kind: 'choice',
      required: true,
      initial: choice.counts[key] ? 'yes' : 'no',
      options: yesNo
    });
    return {
        id: 'emprise-definition',
        label: { key: 'fr-urban-rules.surfaces.action.definition' },
        fields: [
          {
            key: 'definition',
            label: { key: 'fr-urban-rules.surfaces.field.definition' },
            kind: 'choice',
            required: true,
            initial: choice.definition,
            options: EMPRISE_DEFINITIONS.map((d) => ({
              value: d,
              label: { key: DEFINITION_KEYS[d] }
            }))
          },
          ...EMPRISE_COUNTS.map(toggle),
          {
            key: 'page',
            label: { key: 'fr-urban-rules.field.page' },
            kind: 'number',
            min: 1,
            ...(choice.page === undefined ? {} : { initial: choice.page })
          }
        ]
      };
  }

  /** The Surfaces view's actions (DEC-1, DEC-3, DEC-4): each a choice-led form, one Request when applied. */
  function surfaceActions({ choice, buildings, sdp, roles, balconyAnswers }) {
    const yesNo = [
      { value: 'yes', label: { key: 'fr-urban-rules.surfaces.answer.yes' } },
      { value: 'no', label: { key: 'fr-urban-rules.surfaces.answer.no' } }
    ];
    const buildingOptions = buildings
      .slice(0, 50)
      .map((b) => ({ value: b.main ? 'main' : b.id, label: buildingLabel(b) }));
    const roomOptions = sdp.rooms.slice(0, 50).map((r, i) => ({
      value: r.id,
      label:
        r.name === undefined || r.name === ''
          ? { key: 'fr-urban-rules.surfaces.room', params: { index: i + 1 } }
          : { text: cut(r.name, 200) }
    }));
    const storeyOptions = [...new Map(sdp.storeys.map((s) => [s.id, s])).values()]
      .slice(0, 50)
      .map((s, i) => ({
        value: s.id,
        label: { key: 'fr-urban-rules.surfaces.storey', params: { index: i + 1 } }
      }));
    const actions = [definitionActionOf(choice)];
    if (buildingOptions.length > 0) {
      actions.push({
        id: 'emprise-balconies',
        label: { key: 'fr-urban-rules.surfaces.action.balconies' },
        fields: [
          {
            key: 'building',
            label: { key: 'fr-urban-rules.surfaces.field.building' },
            kind: 'choice',
            required: true,
            initial: buildingOptions[0].value,
            options: buildingOptions
          },
          {
            key: 'area',
            label: { key: 'fr-urban-rules.surfaces.field.area' },
            kind: 'number',
            unit: 'm2',
            min: 0,
            required: true,
            ...(positive(balconyAnswers[buildingOptions[0].value])
              ? { initial: balconyAnswers[buildingOptions[0].value] }
              : {})
          }
        ]
      });
    }
    const named = buildingOptions.filter((o) => o.value !== 'main');
    if (named.length > 0) {
      actions.push({
        id: 'building-role',
        label: { key: 'fr-urban-rules.surfaces.action.role' },
        fields: [
          {
            key: 'building',
            label: { key: 'fr-urban-rules.surfaces.field.building' },
            kind: 'choice',
            required: true,
            initial: named[0].value,
            options: named
          },
          {
            key: 'role',
            label: { key: 'fr-urban-rules.surfaces.field.role' },
            kind: 'choice',
            required: true,
            initial: 'none',
            options: ['extension', 'annex', 'none'].map((r) => ({
              value: r,
              label: { key: ROLE_LABEL_KEYS[r] }
            }))
          }
        ]
      });
    }
    if (storeyOptions.length > 0) {
      actions.push({
        id: 'sdp-void',
        label: { key: 'fr-urban-rules.surfaces.action.void' },
        fields: [
          {
            key: 'storey',
            label: { key: 'fr-urban-rules.surfaces.field.storey' },
            kind: 'choice',
            required: true,
            initial: storeyOptions[0].value,
            options: storeyOptions
          },
          {
            key: 'area',
            label: { key: 'fr-urban-rules.surfaces.field.area' },
            kind: 'number',
            unit: 'm2',
            min: 0,
            required: true
          }
        ]
      });
    }
    if (roomOptions.length > 0) {
      actions.push({
        id: 'sdp-room',
        label: { key: 'fr-urban-rules.surfaces.action.room' },
        fields: [
          {
            key: 'deduction',
            label: { key: 'fr-urban-rules.surfaces.field.deduction' },
            kind: 'choice',
            required: true,
            initial: 'parking',
            options: Object.keys(SDP_ROOM_KINDS).map((k) => ({
              value: k,
              label: { key: DEDUCTION_KEYS[k] }
            }))
          },
          {
            key: 'room',
            label: { key: 'fr-urban-rules.surfaces.field.room' },
            kind: 'choice',
            required: true,
            initial: roomOptions[0].value,
            options: roomOptions
          },
          {
            key: 'answer',
            label: { key: 'fr-urban-rules.surfaces.field.answer' },
            kind: 'choice',
            required: true,
            initial: 'yes',
            options: yesNo
          }
        ]
      });
    }
    actions.push({
      id: 'sdp-none',
      label: { key: 'fr-urban-rules.surfaces.action.none' },
      fields: [
        {
          key: 'deduction',
          label: { key: 'fr-urban-rules.surfaces.field.deduction' },
          kind: 'choice',
          required: true,
          initial: '2',
          options: SDP_ANSWERED.map((n) => ({ value: n, label: { key: SDP_LINE_KEYS[n] } }))
        },
        {
          key: 'answer',
          label: { key: 'fr-urban-rules.surfaces.field.noneApplies' },
          kind: 'choice',
          required: true,
          initial: 'yes',
          options: yesNo
        }
      ]
    });
    if (buildingOptions.length > 0) {
      actions.push({
        id: 'sdp-building',
        label: { key: 'fr-urban-rules.surfaces.action.building' },
        fields: [
          {
            key: 'building',
            label: { key: 'fr-urban-rules.surfaces.field.building' },
            kind: 'choice',
            required: true,
            initial: buildingOptions[0].value,
            options: buildingOptions
          },
          {
            key: 'question',
            label: { key: 'fr-urban-rules.surfaces.field.question' },
            kind: 'choice',
            required: true,
            initial: 'collective',
            options: ['collective', 'served'].map((q) => ({
              value: q,
              label: { key: QUESTION_KEYS[q] }
            }))
          },
          {
            key: 'answer',
            label: { key: 'fr-urban-rules.surfaces.field.answer' },
            kind: 'choice',
            required: true,
            initial: 'yes',
            options: yesNo
          }
        ]
      });
    }
    const blocks = [
      { kind: 'heading', text: { key: 'fr-urban-rules.surfaces.heading.answers' } },
      { kind: 'actions', actions }
    ];
    if (sdp.rooms.length > 50 || buildings.length > 50 || sdp.storeys.length > 50) {
      blocks.push({
        kind: 'notice',
        tone: 'info',
        text: { key: 'fr-urban-rules.surfaces.firstFifty' }
      });
    }
    return blocks;
  }

  /**
   * The Surfaces actions' next section (DEC-1, DEC-3, DEC-4): one member
   * changed, the answers keyed by the open variation; `{ next }` or `{ refused }`.
   */
  function nextSurfaceSection(section, request, variation, buildingsNow) {
    const base = { ...(section ?? {}), schema: SECTION_SCHEMA };
    const values = request.values ?? {};
    const refuse = (key) => ({ refused: { key } });
    const resolveBuilding = (value) => {
      if (value === 'main') return buildingsNow.find((b) => b.main)?.id ?? 'main';
      return typeof value === 'string' && value !== '' ? value : undefined;
    };
    const emprise = isRecord(section?.emprise) ? section.emprise : {};
    switch (request.actionId) {
      case 'emprise-definition': {
        if (!EMPRISE_DEFINITIONS.includes(values.definition))
          return refuse('fr-urban-rules.surfaces.refused.definition');
        const counts = {};
        for (const key of EMPRISE_COUNTS) {
          if (values[key] !== 'yes' && values[key] !== 'no')
            return refuse('fr-urban-rules.surfaces.refused.definition');
          counts[key] = values[key] === 'yes';
        }
        const page = values.page;
        if (page !== undefined && !(Number.isInteger(page) && page >= 1))
          return refuse('fr-urban-rules.entered.pageInteger');
        const next = { ...emprise, definition: values.definition, counts };
        if (page === undefined) delete next.page;
        else next.page = page;
        return { next: { ...base, emprise: next } };
      }
      case 'emprise-balconies': {
        const id = values.building === 'main' ? 'main' : resolveBuilding(values.building);
        if (id === undefined || !positive(values.area))
          return refuse('fr-urban-rules.surfaces.refused.area');
        const current = { ...(answersOf(emprise.balconies, variation) ?? {}) };
        if (values.area === 0) delete current[id];
        else current[id] = values.area;
        return {
          next: {
            ...base,
            emprise: { ...emprise, balconies: withAnswers(emprise.balconies, variation, current) }
          }
        };
      }
      case 'building-role': {
        const id = resolveBuilding(values.building);
        if (id === undefined || !['extension', 'annex', 'none'].includes(values.role))
          return refuse('fr-urban-rules.surfaces.refused.role');
        const current = answersOf(section?.roles, variation) ?? {};
        const extension = idList(current.extension).filter((x) => x !== id);
        const annex = idList(current.annex).filter((x) => x !== id);
        if (values.role === 'extension') extension.push(id);
        if (values.role === 'annex') annex.push(id);
        return {
          next: {
            ...base,
            roles: withAnswers(section?.roles, variation, { ...current, extension, annex })
          }
        };
      }
      case 'sdp-void':
      case 'sdp-room':
      case 'sdp-none':
      case 'sdp-building': {
        const current = { ...(answersOf(section?.sdp, variation) ?? {}) };
        if (request.actionId === 'sdp-void') {
          if (typeof values.storey !== 'string' || values.storey === '' || !positive(values.area))
            return refuse('fr-urban-rules.surfaces.refused.area');
          const voids = (Array.isArray(current.voids) ? current.voids : []).filter(
            (v) => v?.storeyId !== values.storey
          );
          if (values.area > 0) voids.push({ storeyId: values.storey, area: values.area });
          current.voids = voids;
        } else if (request.actionId === 'sdp-room') {
          if (
            !Object.hasOwn(SDP_ROOM_KINDS, values.deduction) ||
            typeof values.room !== 'string' ||
            values.room === '' ||
            (values.answer !== 'yes' && values.answer !== 'no')
          )
            return refuse('fr-urban-rules.surfaces.refused.answer');
          const list = idList(current[values.deduction]).filter((x) => x !== values.room);
          if (values.answer === 'yes') list.push(values.room);
          current[values.deduction] = list;
        } else if (request.actionId === 'sdp-none') {
          if (
            !SDP_ANSWERED.includes(values.deduction) ||
            (values.answer !== 'yes' && values.answer !== 'no')
          )
            return refuse('fr-urban-rules.surfaces.refused.answer');
          const list = idList(current.none).filter((x) => x !== values.deduction);
          if (values.answer === 'yes') list.push(values.deduction);
          current.none = list;
        } else {
          const id = resolveBuilding(values.building);
          if (
            id === undefined ||
            !['collective', 'served'].includes(values.question) ||
            (values.answer !== 'yes' && values.answer !== 'no')
          )
            return refuse('fr-urban-rules.surfaces.refused.answer');
          const list = idList(current[values.question]).filter((x) => x !== id);
          if (values.answer === 'yes') list.push(id);
          current[values.question] = list;
        }
        return { next: { ...base, sdp: withAnswers(section?.sdp, variation, current) } };
      }
      default:
        return undefined;
    }
  }

  /**
   * DEC-7: what the programme enricher reads, synchronously, from the report
   * this session read for the plot (the reader's cache), the section and the
   * Site: the confirmed limits, the allowance, the envelope's area and the
   * capacity. `undefined` when no report was read for the Site's plot.
   */
  function programmeFacts(report, reportFacts, site) {
    if (report === undefined) return undefined;
    const regime = report.regime?.code;
    const national = regime === 'rnu' || regime === 'cc';
    const { section, readOnly } = readSection();
    const plot = plotIdsOf(site);
    const planned = plannedRules(
      report,
      reportFacts,
      national ? rules(regime) : [],
      readOnly ? undefined : section,
      plot
    );
    const limits = confirmedLimits(planned);
    const plotArea =
      typeof site.plotArea === 'number' && site.plotArea > 0 ? site.plotArea : undefined;
    const allowed =
      limits.ces !== undefined && plotArea !== undefined
        ? (limits.ces.percent / 100) * plotArea
        : undefined;
    let envelopeArea;
    const edges = boundaryEdges(site);
    const gate = envelopeRegime(regime, reportFacts);
    if (edges !== undefined && gate.none === undefined && !gate.skip) {
      const corrections = readOnly ? [] : edgeRolesOf(section);
      const derived = deriveRoles(edges, roadsKnown(site)).roles;
      const roleOf = new Map(
        edges.map((e) => {
          const set = corrections.find((c) => samePlot(c.plot, plot) && sameEnds(c.ends, e.a, e.b));
          return [e.edge, { role: set?.role ?? derived.get(e.edge)?.role ?? 'side' }];
        })
      );
      // 002.7 DEC-1: the outline alone (the capacity reads its ground area where a setback insets it).
      const contributions = envelopeRulesOf(planned, {
        edges,
        roleOf,
        alignments: undefined,
        national,
        assume: (id) => id
      }).contributions;
      const distances = insetDistances(edges, roleOf, contributions);
      // Sprint 002.17: the exclusion areas that cut are part of what is left to build on.
      const cutting = exclusionItemsOf(
        reportFacts?.prescriptions,
        readOnly ? [] : exclusionChoicesOf(section),
        plot,
        planned.current
      ).filter((item) => item.state === 'applied');
      if (distances.some((d) => d > 0) || cutting.length > 0) {
        const outline = insetByRole(
          edges.map((e) => e.a),
          distances,
          edges.map((e) => roleOf.get(e.edge)?.role === 'street'),
          cutting.map((item) => item.rings)
        );
        if (outline.rings !== undefined)
          envelopeArea = Math.max(0, outline.rings.reduce((sum, ring) => sum + signedRingArea(ring), 0));
      }
    }
    const floor = floorToFloor();
    const storeys = storeysOf(limits.heights, floor.value);
    const groundLimits = [envelopeArea, allowed].filter((v) => v !== undefined);
    const ground = groundLimits.length === 0 ? undefined : Math.min(...groundLimits);
    // Sprint 002.8 DEC-2: the storey count is `heightHeadroom`'s — the tightest
    // confirmed limit, absolute or relative to a distance, over the last read's
    // main building — no longer the absolute heights alone (002.3 DEC-7).
    const { headroom, storeys: storeysAllowed } = programmeHeadroom(site, planned.rules, floor.value);
    const governing = headroom.confirmed;
    return {
      plotArea,
      allowed,
      ces: limits.ces?.percent,
      notRegulated: limits.notRegulated,
      heights: limits.heights,
      storeysAllowed,
      governing:
        governing === undefined
          ? undefined
          : governing.kind === 'absolute'
            ? { kind: 'absolute', height: governing.limit, ruleId: governing.rule.id }
            : { kind: 'relative', ruleId: governing.rule.id },
      floorToFloor: floor,
      capacity:
        storeys === undefined || ground === undefined
          ? undefined
          : { low: ground * storeys.low, high: ground * storeys.high },
      anyConfirmed:
        limits.heights.length > 0 ||
        limits.ces !== undefined ||
        limits.notRegulated ||
        governing !== undefined
    };
  }

  /**
   * 002.6b DEC-6: a written decision — the full limit, the kind, the citation,
   * `provenance`, the zone — from the rule as the session read it. The rule
   * gone, or read against another version: « read again », nothing written.
   */
  function nextWritten(base, request, ruleId, version, plot, withoutRule, refuse) {
    const found = writtenSession.get(ruleId);
    if (found === undefined || !sameVersion(version, found.version))
      return refuse('fr-urban-rules.written.readAgain');
    const rule = found.rule;
    if (rule.statement === 'see_graphic') return refuse('fr-urban-rules.edges.changed');
    let limit = rule.limit;
    let edited = false;
    if (request.actionId === 'edit-value') {
      if (limit?.kind !== 'value' && limit?.kind !== 'ratio')
        return refuse('fr-urban-rules.edges.changed');
      const given = request.values?.value;
      if (!(typeof given === 'number' && Number.isFinite(given) && given >= 0))
        return refuse('fr-urban-rules.entered.valueRequired');
      const percent = limit.kind === 'ratio' || limit.quantity.unit === 'percent';
      if (percent && given > 100) return refuse('fr-urban-rules.entered.percentMax');
      edited = given !== (limit.kind === 'ratio' ? limit.percent : limit.quantity.value);
      limit =
        limit.kind === 'ratio'
          ? { ...limit, percent: given }
          : { ...limit, quantity: { value: given, unit: limit.quantity.unit } };
    }
    const entry = writtenEntryOf(
      found,
      ruleId,
      version,
      plot,
      request.actionId === 'not-applicable' ? 'not_applicable' : 'confirmed',
      limit,
      edited
    );
    return { next: { ...base, confirmations: [...withoutRule(ruleId), entry] } };
  }

  /** A written decision as the section stores it (DEC-6): one shape for a single act and for a batch. */
  function writtenEntryOf(found, ruleId, version, plot, decision, stated, edited) {
    const rule = found.rule;
    let limit = stated;
    if (limit?.kind === 'described')
      limit = {
        kind: 'described',
        text: { text: cut(limit.text.text, WRITTEN_PASSAGE_MAX), lang: 'fr' }
      };
    const value =
      limit?.kind === 'value'
        ? { kind: 'value', value: limit.quantity.value, unit: limit.quantity.unit }
        : limit?.kind === 'ratio'
          ? { kind: 'value', value: limit.percent, unit: 'percent' }
          : undefined;
    return {
      ruleKey: ruleId,
      plot,
      ...version,
      decision,
      kind: rule.kind,
      ...(rule.statement === undefined ? {} : { statement: rule.statement }),
      ...(value === undefined ? {} : { value }),
      ...(limit === undefined ? {} : { limit }),
      edited,
      at: now().toISOString(),
      provenance: 'written',
      ...(typeof found.zone === 'string' ? { zone: found.zone } : {}),
      ...(found.strip === undefined ? {} : { strip: found.strip }),
      citation: found.citation
    };
  }

  /**
   * Sprint 002.26: one click confirms a batch — exactly the rules the view listed under it (the subject
   * carries their digest, so a list that changed since is « read again », never a different set), each
   * with the entry a single « Confirm » writes. Nothing here decides anything by itself.
   */
  function nextBatch(base, confirmations, request, version, plot, refuse) {
    const fields = subjectFields(request.target?.subjectId);
    if (fields.b !== 'checked' && fields.b !== 'applies')
      return refuse('fr-urban-rules.edges.changed');
    const members = [...writtenSession].filter(
      ([, found]) => found.batch === fields.b && sameVersion(version, found.version)
    );
    const ids = members.map(([id]) => id).sort();
    if (ids.length === 0 || cyrb53(ids.join('\n')) !== fields.h)
      return refuse('fr-urban-rules.written.readAgain');
    const entries = members
      .filter(([id]) => !confirmations.some((c) => c.ruleKey === id && onPlot(c, plot)))
      .map(([id, found]) =>
        writtenEntryOf(found, id, version, plot, 'confirmed', found.rule.limit, false)
      );
    return { next: { ...base, confirmations: [...confirmations, ...entries] } };
  }

  /** DEC-5's section builders: the next section from the one read and the act; `{ next }` or `{ refused }`. */
  function nextSection(section, request, plot) {
    const base = { ...(section ?? {}), schema: SECTION_SCHEMA };
    const confirmations = Array.isArray(section?.confirmations) ? section.confirmations : [];
    const entered = Array.isArray(section?.entered) ? section.entered : [];
    const ruleId = request.target?.ruleId;
    const { version, value, unit, kind: subjectKind } = parseSubject(request.target?.subjectId);
    const at = now().toISOString();
    const withoutRule = (key) =>
      confirmations.filter((c) => !(c.ruleKey === key && onPlot(c, plot)));
    const refuse = (key) => ({ refused: { key } });
    // Review fix S1 (DEC-4): a newer version's decision is never confirmed,
    // edited or reopened here, whatever the request names.
    if (
      ['confirm', 'not-applicable', 'edit-value', 'reopen'].includes(request.actionId) &&
      isNewerRuleKey(ruleId)
    ) {
      return refuse('fr-urban-rules.edges.changed');
    }
    if (request.actionId === 'confirm-batch') return nextBatch(base, confirmations, request, version, plot, refuse);
    // Sprint 002.22: a rule decided automatically is brought back — one entry per rule and plot,
    // against the document version read, which a new version lets expire.
    if (request.actionId === 'bring-back') {
      if (typeof ruleId !== 'string' || !ruleId.startsWith('written:'))
        return refuse('fr-urban-rules.edges.changed');
      const kept = (Array.isArray(section?.broughtBack) ? section.broughtBack : []).filter(
        (entry) => isBroughtBack(entry) && !(entry.ruleKey === ruleId && onPlot(entry, plot))
      );
      return {
        next: { ...base, broughtBack: [...kept, { ruleKey: ruleId, plot, ...version, at }] }
      };
    }
    // Sprint 002.6b DEC-4 (B1): a written rule is looked up in the session.
    if (
      typeof ruleId === 'string' &&
      ruleId.startsWith('written:') &&
      ['confirm', 'not-applicable', 'edit-value'].includes(request.actionId)
    ) {
      return nextWritten(base, request, ruleId, version, plot, withoutRule, refuse);
    }
    switch (request.actionId) {
      case 'confirm':
      case 'not-applicable':
      case 'edit-value': {
        if (typeof ruleId !== 'string') return refuse('fr-urban-rules.edges.changed');
        const editing = request.actionId === 'edit-value';
        const given = editing ? request.values?.value : value;
        if (editing && !(typeof given === 'number' && Number.isFinite(given) && given >= 0)) {
          return refuse('fr-urban-rules.entered.valueRequired');
        }
        if (editing && unit === 'percent' && given > 100) {
          return refuse('fr-urban-rules.entered.percentMax');
        }
        // Review fix (NIT): `edited` says the value differs from the one read.
        const edited = editing && given !== value;
        const entry = {
          ruleKey: ruleId,
          plot,
          ...version,
          decision: request.actionId === 'not-applicable' ? 'not_applicable' : 'confirmed',
          // 002.6b DEC-5 (S4): a drawn decision stores the kind it was taken on.
          ...(ruleId.startsWith('psc:') && subjectKind !== undefined ? { kind: subjectKind } : {}),
          ...(given !== undefined && unit !== undefined
            ? { value: { kind: 'value', value: given, unit } }
            : {}),
          edited,
          at
        };
        return { next: { ...base, confirmations: [...withoutRule(ruleId), entry] } };
      }
      case 'reopen':
        return { next: { ...base, confirmations: withoutRule(ruleId) } };
      case 'confirm-entered': {
        // Review fix B1: a reopened entered rule confirmed against the version read now.
        const old = entered.find((e) => e?.key === ruleId);
        if (old === undefined) return refuse('fr-urban-rules.edges.changed');
        return {
          next: {
            ...base,
            entered: entered.map((e) => (e?.key === ruleId ? { ...old, ...version, at } : e))
          }
        };
      }
      case 'add-distance':
      case 'add-ratio':
      case 'add-area':
      case 'add-height-band':
      case 'edit-entered': {
        const editing = request.actionId === 'edit-entered';
        const old = editing ? entered.find((e) => e?.key === ruleId) : undefined;
        if (editing && old === undefined) return refuse('fr-urban-rules.edges.changed');
        const form = editing ? undefined : ENTRY_FORMS[request.actionId];
        const kindKey = editing ? old.kind : form?.band ? 'height_total' : request.values?.kind;
        const shape = Object.hasOwn(ENTERED_KINDS, kindKey ?? '')
          ? ENTERED_KINDS[kindKey]
          : undefined;
        if (shape === undefined || (form !== undefined && shape.unit !== form.unit))
          return refuse('fr-urban-rules.entered.kindRequired');
        // Sprint 002.18: an entered height held to a band — a depth and the edges it runs along.
        let band;
        if (form?.band === true || (editing && old.band !== undefined)) {
          const depth = request.values?.depth;
          const edgesChoice = request.values?.edges;
          if (!(typeof depth === 'number' && Number.isFinite(depth) && depth > 0 && depth <= BAND_MAX_DEPTH))
            return refuse('fr-urban-rules.band.depthRequired');
          if (!Object.hasOwn(BAND_EDGES, edgesChoice ?? ''))
            return refuse('fr-urban-rules.band.edgesRequired');
          band = { depth, roles: [...BAND_EDGES[edgesChoice].roles] };
        }
        const statement =
          band === undefined && request.values?.statement === 'not_regulated' ? 'not_regulated' : 'limit';
        const typed = request.values?.value;
        if (
          statement === 'limit' &&
          !(typeof typed === 'number' && Number.isFinite(typed) && typed >= 0)
        ) {
          return refuse('fr-urban-rules.entered.valueRequired');
        }
        if (statement === 'limit' && shape.unit === 'percent' && typed > 100) {
          return refuse('fr-urban-rules.entered.percentMax');
        }
        const document =
          typeof request.values?.source === 'string' ? request.values.source.trim() : '';
        if (document === '') return refuse('fr-urban-rules.entered.sourceRequired');
        const page = request.values?.page;
        // Review fix (NIT): a page that is not a whole number ≥ 1 is refused, never dropped.
        if (page !== undefined && !(Number.isInteger(page) && page >= 1)) {
          return refuse('fr-urban-rules.entered.pageInteger');
        }
        const note = editing ? old.source?.passage : request.values?.note;
        const entry = {
          key: editing ? old.key : `entered:${randomHex(12)}`,
          plot,
          ...(parsePlanned(request).zone === undefined ? {} : { zone: parsePlanned(request).zone }),
          kind: kindKey,
          statement,
          ...(statement === 'limit'
            ? { limit: { kind: 'value', value: typed, unit: shape.unit } }
            : {}),
          ...(shape.roles === undefined ? {} : { edgeRoles: shape.roles }),
          ...(band === undefined ? {} : { band }),
          source: {
            document,
            ...(Number.isInteger(page) && page >= 1 ? { page } : {}),
            ...(typeof note === 'string' && note.trim() !== '' ? { passage: note.trim() } : {})
          },
          ...version,
          at
        };
        return {
          next: {
            ...base,
            entered: editing
              ? entered.map((e) => (e?.key === old.key ? entry : e))
              : [...entered, entry],
            ...(editing
              ? { confirmations: confirmations.filter((c) => c.ruleKey !== old.key) }
              : {})
          }
        };
      }
      case 'remove-entered': {
        if (!entered.some((e) => e?.key === ruleId)) return refuse('fr-urban-rules.edges.changed');
        return {
          next: {
            ...base,
            entered: entered.filter((e) => e?.key !== ruleId),
            confirmations: confirmations.filter((c) => c.ruleKey !== ruleId)
          }
        };
      }
      case 'forget-entry': {
        const subject = String(request.target?.subjectId ?? '');
        // 002.6a DEC-4: a newer version's entry is never forgotten here, whatever the subject says.
        const matches = (entry, kind) =>
          !(kind === 'confirmation' && isNewerRuleKey(entry?.ruleKey)) &&
          forgetSubject(entry, kind) === subject;
        const keptConfirmations = confirmations.filter((c) => !matches(c, 'confirmation'));
        const keptEntered = entered.filter((e) => !matches(e, 'entered'));
        if (
          keptConfirmations.length === confirmations.length &&
          keptEntered.length === entered.length
        ) {
          return refuse('fr-urban-rules.edges.changed');
        }
        return { next: { ...base, confirmations: keptConfirmations, entered: keptEntered } };
      }
      default:
        return refuse('fr-urban-rules.edges.unknownAction');
    }
  }

  /** The zone an entry form was offered in, from the add action's subject (`z=`). */
  function parsePlanned(request) {
    const zone = subjectFields(request.target?.subjectId).z;
    return { zone: zone === undefined || zone === '' ? undefined : zone };
  }

  const forgetSubject = (entry, kind) =>
    `${kind === 'confirmation' ? 'c' : 'e'}:${kind === 'confirmation' ? entry?.ruleKey : entry?.key}@${digest((Array.isArray(entry?.plot) ? entry.plot : []).join(','))}`;

  /** A bounded memory: most recent last, past {@link CACHE_PLOTS} the oldest forgotten (should-fix 7). */
  function remembered(map, key, value) {
    map.delete(key);
    map.set(key, value);
    while (map.size > CACHE_PLOTS) map.delete(map.keys().next().value);
  }

  // ── Sprint 002.8: per-variation checks, height headroom, the assistant's questions ──

  /**
   * RD-6: the last read's own entry for the Site, when it is the report given —
   * the same document version and every rule of the report among its own (a
   * rule the read did not hold means another read). `undefined` otherwise.
   */
  function lastReadFor(report, site) {
    if (!isRecord(report) || !Array.isArray(report.rules) || site === undefined) return undefined;
    let entry;
    try {
      entry = lastReads.get(contextKey(site));
    } catch {
      return undefined;
    }
    if (entry === undefined) return undefined;
    if ((report.document?.version ?? undefined) !== entry.documentVersion) return undefined;
    if (!report.rules.every((rule) => entry.ruleIds.has(rule?.id))) return undefined;
    return entry;
  }

  /**
   * DEC-7: one parked variation's checks, by the read's own pipeline
   * (`evaluateChecks`) over the variation's view of the Site service, the
   * host's buildings (096.11 RD-1) and the last read's inputs (RD-6). Reads no
   * network and starts no read; throws when no read of this Site is the report
   * given, and when the signal is aborted (between buildings and steps). The
   * assumptions a check names are kept only where the report holds them — the
   * host would drop the others and count them.
   */
  async function checkVariation(request, { signal } = {}) {
    const entry = lastReadFor(request?.report, request?.site);
    if (entry === undefined) {
      throw new Error(`${SOURCE_ID}: no read of this Site matches the report; read it again`);
    }
    if (typeof request.variationId !== 'string' || request.variationId === '') {
      throw new Error(`${SOURCE_ID}: a variation check needs a variation id`);
    }
    const service = siteOf();
    if (service?.measures === undefined) throw new Error(`${SOURCE_ID}: no Site measures`);
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const view = variationView(
      service,
      request.variationId,
      Array.isArray(request.buildings) ? request.buildings : []
    );
    const assume = (id) => id;
    const note = (reason) => `not-checked-${reason}`;
    const { checks } = evaluateChecks(entry.inputs, { service: view }, { assume, note, signal });
    const known = new Set(
      (Array.isArray(request.report.assumptions) ? request.report.assumptions : []).map((a) => a?.id)
    );
    // The host refuses more than 1,000 checks whole (096.11), as a read's (`fitted`).
    return {
      checks: checks.slice(0, HOST_LIMITS.checks).map((check) =>
        check.assumptionIds === undefined
          ? check
          : { ...check, assumptionIds: check.assumptionIds.filter((id) => known.has(id)) }
      )
    };
  }

  /**
   * DEC-2 / DEC-3: what the read measured for each building of the open
   * Document — its projection (height), its storeys and top storey's floor,
   * and the worst pairs of the relative limits (R.111-17's ratio ½ to the
   * non-street edges, R.111-16's ratio 1 to the opposite alignments) — taken
   * from the measures the read's checks were computed from (`open.calls`).
   */
  function measuredBuildings(open) {
    const calls = Array.isArray(open?.calls) ? open.calls : [];
    const mainCall = calls.find(
      (c) => c.method === 'projection' && c.args?.buildingId === undefined && c.answer?.available
    );
    const mainId = mainCall?.answer.buildingId;
    const list = [];
    if (typeof mainId === 'string') list.push({ id: mainId, name: undefined, main: true });
    for (const b of open?.buildings ?? []) {
      if (!list.some((x) => x.id === b.id)) list.push({ id: b.id, name: b.name, main: false });
    }
    const mine = (building, c) =>
      c.args?.buildingId === building.id ||
      (building.main && c.args?.buildingId === undefined);
    return list.map((building) => {
      const projection = calls.find(
        (c) => c.method === 'projection' && mine(building, c) && c.answer?.available
      )?.answer;
      const floors = calls.find(
        (c) => c.method === 'floorAreas' && mine(building, c) && c.answer?.available
      )?.answer;
      const storeys = Array.isArray(floors?.storeys) ? floors.storeys : undefined;
      const top = storeys?.at(-1)?.insideExternalWalls;
      const relative = [];
      for (const [ruleId, ratio, kind] of [
        ['rnu:R.111-17', R111_17.factor, 'boundary-edge'],
        ['rnu:R.111-16', 1, 'line']
      ]) {
        const asked = calls.find(
          (c) =>
            c.method === 'distances' &&
            mine(building, c) &&
            c.answer?.available &&
            Array.isArray(c.args?.ratios) &&
            c.args.ratios.includes(ratio) &&
            (c.args.targets ?? []).every((t) => t?.kind === kind)
        );
        if (asked === undefined) continue;
        const facades = Array.isArray(asked.answer.facades) ? asked.answer.facades : [];
        let worst;
        (asked.answer.targets ?? []).forEach((target, index) => {
          if (target?.nearest === undefined) return;
          // R.111-17: an edge the building adjoins is no limit on its height (002.1a DEC-6).
          if (kind === 'boundary-edge' && adjoining(facades, index, target.nearest) !== undefined) {
            return;
          }
          const pair = (target.worst ?? []).find((w) => w.ratio === ratio);
          if (pair === undefined || typeof pair.rise !== 'number') return;
          if (worst === undefined || pair.margin < worst.margin) worst = pair;
        });
        if (worst !== undefined) relative.push({ ruleId, factor: ratio, margin: worst.margin });
      }
      return {
        ...building,
        projection,
        storeys: storeys?.length,
        topStoreyArea: top !== undefined && top.refused === undefined ? top.area : undefined,
        relative
      };
    });
  }

  const ABSOLUTE_HEIGHT_KINDS = new Set(['height_total', 'height_facade']);

  /** A building's measured top and eaves above the lowest ground at its foot, as the checks read them. */
  function currentHeight(projection) {
    const height = projection?.height;
    if (projection === undefined) return { reason: 'no-building' };
    if (height === undefined || height.unavailable !== undefined) {
      return { reason: height?.unavailable ?? 'unavailable' };
    }
    const top = height.topAboveGround?.fromLowest;
    const eaves = height.eavesAboveGround?.fromLowest ?? top;
    if (!Number.isFinite(top)) return { reason: height.relativeUnavailable ?? 'unavailable' };
    return { top, eaves: Number.isFinite(eaves) ? eaves : top };
  }

  /**
   * DEC-2: the height a building may still gain under each height rule of the
   * report, and the tightest among the confirmed rules and among those to
   * confirm. Absolute limits (`height_total`, `height_facade`, a drawn
   * « Hauteur Max-n »): limit − current, from the rule's check where it has
   * one (so a drawn limit counts only where it is drawn). Relative limits:
   * the worst pair's margin `m = d − k·Δz` over `k` — conservative, the top
   * raised by `h` everywhere (R.111-17, R.111-16) — or, for a PLU's own
   * façade-relative setback, its check's margin over its factor. A rule that
   * cannot be measured is listed `notChecked`. With no building measured, an
   * absolute limit leaves its whole value and a relative one is not checked.
   *
   * One computation, three readers: `can_add_storey`, `max_height` and the
   * programme warning (`storeyLimit`).
   */
  function heightHeadroom(report, building, storeyHeight) {
    const current = currentHeight(building?.projection);
    const checks = Array.isArray(report?.checks) ? report.checks : [];
    const limits = [];
    const notChecked = [];
    const ofBuilding = (rule) =>
      checks.find(
        (c) =>
          c.ruleId === rule.id &&
          (building?.id === undefined || c.subject?.id === building.id || c.subject?.id === undefined)
      );
    for (const rule of Array.isArray(report?.rules) ? report.rules : []) {
      if (rule.status !== 'confirmed' && rule.status !== 'to_confirm' && rule.status !== 'not_evaluable')
        continue;
      const absolute = ABSOLUTE_HEIGHT_KINDS.has(rule.kind);
      const relative = rule.limit?.kind === 'height_relative';
      if (!absolute && !relative) continue;
      if (rule.status === 'not_evaluable' || (absolute && rule.limit?.kind !== 'value')) {
        if (absolute && rule.statement !== 'not_regulated') notChecked.push(rule);
        continue;
      }
      if (absolute) {
        const { quantity, comparison } = rule.limit;
        if (comparison !== 'max' || quantity.unit !== 'm') continue;
        const check = ofBuilding(rule);
        let headroom;
        if (check?.measured !== undefined && check?.limit !== undefined) {
          // The rule's value as it stands, against the height its check measured:
          // the programme warning reads the section's rules, which may hold a
          // value edited since that read (review 2026-10-21).
          headroom = quantity.value - check.measured.value;
        } else if (check?.result === 'not_checked') {
          notChecked.push(rule);
          continue;
        } else if (rule.id.startsWith('psc:') && current.top !== undefined) {
          // A drawn limit with no check for this building is drawn elsewhere on the plot.
          continue;
        } else if (current.top !== undefined) {
          headroom = quantity.value - (rule.kind === 'height_facade' ? current.eaves : current.top);
        } else if (current.reason === 'no-building') {
          headroom = quantity.value;
        } else {
          notChecked.push(rule);
          continue;
        }
        limits.push({ rule, kind: 'absolute', limit: quantity.value, headroom: mm(headroom) });
        continue;
      }
      const factor = rule.limit.factor;
      if (!(factor > 0)) continue;
      const measured = (building?.relative ?? []).find((r) => r.ruleId === rule.id);
      if (measured !== undefined) {
        // A target the read could not measure (an alignment off the terrain) is said too.
        const unmeasured = checks.some(
          (c) =>
            c.ruleId === rule.id &&
            c.result === 'not_checked' &&
            (c.subject?.id === undefined || c.subject.id === building.id)
        );
        limits.push({
          rule,
          kind: 'relative',
          factor,
          headroom: mm(measured.margin / factor),
          ...(unmeasured ? { partly: true } : {})
        });
        continue;
      }
      const check = ofBuilding(rule);
      if (
        !rule.id.startsWith('rnu:') &&
        check?.measured !== undefined &&
        check?.limit !== undefined &&
        rule.limit.reference === 'facade_height'
      ) {
        limits.push({
          rule,
          kind: 'relative',
          factor,
          headroom: mm((check.measured.value - check.limit.value) / factor)
        });
        continue;
      }
      // R.111-16 and R.111-17 with nothing measured (no boundary, no alignment) stay unchecked.
      if (current.reason !== 'no-building') notChecked.push(rule);
    }
    limits.sort((a, b) => a.headroom - b.headroom);
    const tightest = (status) => limits.find((l) => l.rule.status === status);
    return {
      current,
      limits,
      notChecked,
      confirmed: tightest('confirmed'),
      toConfirm: tightest('to_confirm'),
      storeyHeight
    };
  }

  /**
   * DEC-2: the storeys the confirmed headroom allows — the current storeys
   * plus the storeys the headroom holds. When the storeys are not measured
   * (no floor answered), the height the rules allow — the current top plus the
   * headroom, the limit itself for an absolute one — over the storey height,
   * which is 002.3 DEC-5's count for an absolute limit.
   */
  function storeyLimit(headroom, storeyHeight, currentStoreys) {
    if (headroom?.confirmed === undefined || !(storeyHeight > 0)) return undefined;
    const room = headroom.confirmed.headroom;
    if (Number.isInteger(currentStoreys)) {
      return currentStoreys + Math.floor((room + RESOLUTION_HALF) / storeyHeight);
    }
    // An absolute limit is the height itself — a façade limit counts the
    // storeys under the eaves, never the roof above them (review 2026-10-21:
    // top + (façade limit − eaves) counted the roof as storeys).
    const allowed =
      headroom.confirmed.kind === 'absolute'
        ? headroom.confirmed.limit
        : (headroom.current.top ?? 0) + room;
    return Math.max(0, Math.floor((allowed + RESOLUTION_HALF) / storeyHeight));
  }

  /**
   * The programme warning's reading (002.3 DEC-7, moved onto `heightHeadroom`
   * here): the main building of the last read for the Site, or none.
   */
  function programmeHeadroom(site, rules, storeyHeight) {
    const entry = site === undefined ? undefined : lastReads.get(contextKey(site));
    const buildings = entry === undefined ? [] : measuredBuildings(entry.open);
    const building = buildings.find((b) => b.main) ?? buildings[0];
    // The rules as the section stands now (the enricher's own), the checks and
    // measures of the last read: a rule entered since is limit − current height.
    const headroom = heightHeadroom(
      { rules, checks: entry?.report?.checks ?? [] },
      building,
      storeyHeight
    );
    return { headroom, storeys: storeyLimit(headroom, storeyHeight, building?.storeys) };
  }

  // ── The questions (096.12; DEC-1 to DEC-6) ──

  const metres = (value) => ({ value: mm(value), unit: 'm' });
  const squareMetres = (value) => ({ value: Math.round(value * 100) / 100, unit: 'm2' });
  const cannotAnswer = (key, params) => ({
    status: 'cannot-answer',
    summary: params === undefined ? { key } : { key, params },
    claims: []
  });
  /** DEC-6: the closed list, offered only on its condition; `interp.notADecision` always, last. */
  const INTERPRETATIONS = {
    attic: 'fr-urban-rules.question.interp.attic',
    relativeEstimate: 'fr-urban-rules.question.interp.relativeEstimate',
    notADecision: 'fr-urban-rules.question.interp.notADecision'
  };
  const interpretations = (...conditions) => [
    ...conditions.filter(Boolean).map((key) => ({ key })),
    { key: INTERPRETATIONS.notADecision }
  ];
  /** 096.12: at most twelve claims; past them the host drops and counts. */
  const MAX_CLAIMS = 12;
  const QUESTION_BUILDINGS = 4;

  /** The read the answer stands on, or the reason it cannot answer (criterion 13). */
  function questionRead(input) {
    const report = input?.report;
    if (!isRecord(report) || !Array.isArray(report.rules) || report.rules.length === 0) {
      if (report?.regime?.code === 'not_published') {
        return { refused: cannotAnswer('fr-urban-rules.question.notPublished') };
      }
      return { refused: cannotAnswer('fr-urban-rules.question.notRead') };
    }
    const entry = lastReadFor(report, input.site);
    if (entry === undefined) return { refused: cannotAnswer('fr-urban-rules.question.readAgain') };
    return { report, entry };
  }

  /**
   * DEC-1: the buildings an answer is about — the one named (matched on the
   * open Document's names), the only one, or up to four; `{ refused }` when
   * none is drawn or the name matches none.
   */
  function questionBuildings(entry, name) {
    const all = measuredBuildings(entry.open);
    if (all.length === 0) return { refused: cannotAnswer('fr-urban-rules.question.noBuilding') };
    if (typeof name === 'string' && name.trim() !== '') {
      const wanted = name.trim().toLocaleLowerCase('fr');
      const found = all.filter((b) => b.name?.trim().toLocaleLowerCase('fr') === wanted);
      if (found.length === 0) {
        return {
          refused: cannotAnswer('fr-urban-rules.question.buildingUnknown', {
            building: cut(name.trim(), 80)
          })
        };
      }
      return { buildings: found.slice(0, 1), more: 0 };
    }
    return {
      buildings: all.slice(0, QUESTION_BUILDINGS),
      more: Math.max(0, all.length - QUESTION_BUILDINGS)
    };
  }

  /** The claim that heads a building's part when an answer covers several. */
  const buildingHeading = (building) =>
    building.name === undefined
      ? { text: { key: 'fr-urban-rules.question.forMainBuilding' }, basis: 'report' }
      : {
          text: {
            key: 'fr-urban-rules.question.forBuilding',
            params: { building: cut(building.name, 200) }
          },
          basis: 'report'
        };

  /**
   * DEC-5: **Confirm {value}** for a rule to confirm with a value — the very
   * section 002.2's Confirm action builds (`nextSection`, `nextWritten` for a
   * written rule) with the target the Rules view's action carries. Nothing
   * when the read holds no such action, the section is a newer version's, or
   * the builder refuses.
   */
  function confirmOffer(entry, ruleId, input) {
    const planned = entry.inputs.planned;
    const rule = planned.rules.find((r) => r.id === ruleId);
    if (rule === undefined || rule.status !== 'to_confirm' || !planned.meta.has(ruleId)) {
      return undefined;
    }
    let action;
    try {
      action = planned.actionsFor(rule).find((a) => a.id === 'confirm');
    } catch {
      return undefined;
    }
    if (action === undefined) return undefined;
    const { section, readOnly } = sectionOf(input.sectionData);
    if (readOnly) return undefined;
    const built = nextSection(section, { actionId: 'confirm', target: action.target }, plotIdsOf(input.site));
    if (built.refused !== undefined || built.next === undefined) return undefined;
    const limit = rule.limit;
    // The value as the rule states it, in the rule's own unit — what Confirm
    // records — never converted to the project's: an offer label is a phrase,
    // with no quantities (096.12). A number parameter, so the host's message
    // formatter writes it in the reader's locale (« Confirmer 11,5 m »).
    const shown =
      limit?.kind === 'value'
        ? {
            value: mm(limit.quantity.value),
            unit: UNIT_SYMBOLS[limit.quantity.unit] ?? limit.quantity.unit
          }
        : limit?.kind === 'ratio' && Number.isFinite(limit.percent)
          ? { value: limit.percent, unit: '%' }
          : undefined;
    if (shown === undefined) return undefined;
    return {
      label: { key: 'fr-urban-rules.question.offer.confirm', params: shown },
      data: built.next
    };
  }

  /**
   * DEC-4 / DEC-8: a rule's name inside a claim — its own label, by key in the
   * extension's words (`fr-urban-rules.rule.*`), or a drawn prescription's label
   * in guillemets, cut. The host cites the rule; this only says which one.
   */
  function ruleName(rule) {
    const label = rule?.label;
    if (!isRecord(label)) return '—';
    if (typeof label.text === 'string') return `« ${cut(label.text, 80)} »`;
    let text;
    try {
      text = translate(label.key, label.params);
    } catch {
      text = undefined;
    }
    return cut(typeof text === 'string' && text !== '' ? text : String(label.key), 120);
  }

  /** A relative rule measured only in part: the targets left unchecked are said. */
  const partlyClaim = (rule) => ({
    text: { key: 'fr-urban-rules.question.limit.partlyChecked', params: { rule: ruleName(rule) } },
    basis: 'rule',
    ruleId: rule.id
  });

  /** The claims of one height limit for `can_add_storey`. */
  function storeyLimitClaim(limit, storey) {
    // Already past the limit today: said as such, never as a negative room.
    if (limit.headroom < -RESOLUTION_HALF) {
      return {
        text: {
          key:
            limit.kind === 'absolute'
              ? 'fr-urban-rules.question.limit.over'
              : 'fr-urban-rules.question.relative.over',
          params: { rule: ruleName(limit.rule) }
        },
        values: {
          ...(limit.kind === 'absolute' ? { limit: metres(limit.limit) } : {}),
          excess: metres(-limit.headroom)
        },
        basis: 'rule',
        ruleId: limit.rule.id
      };
    }
    const after = limit.headroom - storey;
    const fits = after >= -RESOLUTION_HALF;
    if (limit.kind === 'absolute') {
      return {
        text: {
          key: fits
            ? 'fr-urban-rules.question.limit.fits'
            : 'fr-urban-rules.question.limit.exceeds',
          params: { rule: ruleName(limit.rule) }
        },
        values: {
          limit: metres(limit.limit),
          headroom: metres(limit.headroom),
          storey: metres(storey),
          ...(fits ? { after: metres(after) } : { excess: metres(-after) })
        },
        basis: 'rule',
        ruleId: limit.rule.id
      };
    }
    return {
      text: {
        key: fits
          ? 'fr-urban-rules.question.relative.fits'
          : 'fr-urban-rules.question.relative.exceeds',
        params: { rule: ruleName(limit.rule) }
      },
      values: {
        headroom: metres(limit.headroom),
        storey: metres(storey),
        ...(fits ? { after: metres(after) } : { excess: metres(-after) })
      },
      basis: 'rule',
      ruleId: limit.rule.id
    };
  }

  /**
   * The potential issues of the report no height changes: setbacks by value,
   * budgets, distances — and a relative limit's own floor (R.111-17's 3 m),
   * which no height lowers (review 2026-10-21). An edge's check is this
   * building's by its id (`…:<building>:<edge>`, folded to `…:<building>`).
   */
  function issuesWhateverTheHeight(report, building) {
    const rules = new Map(report.rules.map((r) => [r.id, r]));
    const own = (c) => {
      const about = c.subject?.kind === 'plot' || c.subject?.id === undefined;
      if (about || c.subject.id === building.id) return true;
      if (c.subject.kind !== 'boundary-edge') return false;
      const parts = String(c.id).split(':');
      return parts.includes(building.id) || (building.main === true && parts.includes('main'));
    };
    return report.checks.filter((c) => {
      if (c.result !== 'potential_issue') return false;
      const rule = rules.get(c.ruleId);
      if (rule === undefined || ABSOLUTE_HEIGHT_KINDS.has(rule.kind)) return false;
      if (rule.limit?.kind === 'height_relative') {
        const minimum = rule.limit.minimum?.value;
        const floored =
          Number.isFinite(minimum) &&
          c.limit !== undefined &&
          c.measured !== undefined &&
          Math.abs(c.limit.value - minimum) <= RESOLUTION_HALF &&
          c.measured.value < minimum - RESOLUTION_HALF;
        if (!floored) return false;
      }
      return own(c);
    });
  }

  function answerCanAddStorey(input) {
    const read = questionRead(input);
    if (read.refused !== undefined) return read.refused;
    const { report, entry } = read;
    const chosen = questionBuildings(entry, input.args?.building);
    if (chosen.refused !== undefined) return chosen.refused;
    const given = input.args?.storeyHeight;
    const floor = typeof given === 'number' ? { value: given, assumed: false } : floorToFloor();
    const storey = floor.value;
    const several = chosen.buildings.length > 1;
    const claims = [];
    let exceeds = false;
    let toConfirmExceeds = false;
    let anyLimit = false;
    let attic = false;
    let relativeGoverns = false;
    let governing;
    let measuredOne = false;
    for (const building of chosen.buildings) {
      const headroom = heightHeadroom(report, building, storey);
      if (several) claims.push(buildingHeading(building));
      if (headroom.current.top === undefined) {
        if (!several) {
          return cannotAnswer('fr-urban-rules.question.heightUnavailable', {
            reason: cut(String(headroom.current.reason), 80)
          });
        }
        claims.push({
          text: {
            key: 'fr-urban-rules.question.heightUnavailable',
            params: { reason: cut(String(headroom.current.reason), 80) }
          },
          basis: 'measured'
        });
        continue;
      }
      measuredOne = true;
      claims.push({
        text: { key: 'fr-urban-rules.question.height.current' },
        values: { current: metres(headroom.current.top) },
        basis: 'measured'
      });
      claims.push({
        text: { key: 'fr-urban-rules.question.height.next' },
        values: { next: metres(headroom.current.top + storey) },
        basis: 'measured'
      });
      for (const limit of headroom.limits) {
        anyLimit = true;
        claims.push(storeyLimitClaim(limit, storey));
        if (limit.partly) claims.push(partlyClaim(limit.rule));
        if (limit.rule.kind === 'height_facade') attic = true;
        const over = limit.headroom - storey < -RESOLUTION_HALF;
        if (over && limit.rule.status === 'confirmed') exceeds = true;
        if (over && limit.rule.status === 'to_confirm') toConfirmExceeds = true;
        if (governing === undefined || limit.headroom < governing.headroom) governing = limit;
      }
      for (const rule of headroom.notChecked) {
        claims.push({
          text: { key: 'fr-urban-rules.question.limit.notChecked', params: { rule: ruleName(rule) } },
          basis: 'rule',
          ruleId: rule.id
        });
      }
      for (const check of issuesWhateverTheHeight(report, building)) {
        claims.push({
          text: {
            key:
              check.measured !== undefined && check.limit !== undefined
                ? 'fr-urban-rules.question.issueStays'
                : 'fr-urban-rules.question.issueStaysUnmeasured',
            params: { rule: ruleName(report.rules.find((r) => r.id === check.ruleId)) }
          },
          ...(check.measured !== undefined && check.limit !== undefined
            ? { values: { measured: check.measured, limit: check.limit } }
            : {}),
          basis: 'rule',
          ruleId: check.ruleId,
          checkId: check.id
        });
      }
      const now = entry.open.figures?.sdp?.total;
      if (!several && typeof now === 'number' && typeof building.topStoreyArea === 'number') {
        const after = now + building.topStoreyArea;
        claims.push({
          text: { key: 'fr-urban-rules.question.sdpAfter' },
          values: { now: squareMetres(now), after: squareMetres(after) },
          basis: 'measured'
        });
        const threshold = PROCEDURE_THRESHOLDS.architect;
        if (now <= threshold + RESOLUTION_HALF && after > threshold + RESOLUTION_HALF) {
          claims.push({
            text: { key: 'fr-urban-rules.question.architect' },
            values: { threshold: squareMetres(threshold) },
            basis: 'report'
          });
        }
      }
    }
    if (measuredOne && !several) {
      claims.splice(2, 0, {
        text: { key: 'fr-urban-rules.question.can_add_storey.empriseUnchanged' },
        basis: 'report'
      });
    }
    relativeGoverns = governing?.kind === 'relative';
    // RD-2: the storey height an answer used — assumed (the editor's default), or the
    // open design's own floor-to-floor height — is said whenever the user named none.
    const storeySaid = typeof given !== 'number';
    if (storeySaid) {
      claims.push({
        text: {
          key: floor.assumed
            ? 'fr-urban-rules.question.storeyHeightAssumed'
            : 'fr-urban-rules.question.storeyHeightProject'
        },
        values: { height: metres(storey) },
        basis: 'report'
      });
    }
    if (chosen.more > 0) {
      claims.push({
        text: { key: 'fr-urban-rules.question.andMore', params: { count: chosen.more } },
        basis: 'report'
      });
    }
    const summaryKey = exceeds
      ? 'fr-urban-rules.question.can_add_storey.exceeds'
      : toConfirmExceeds
        ? 'fr-urban-rules.question.can_add_storey.roomButToConfirm'
        : anyLimit
          ? 'fr-urban-rules.question.can_add_storey.room'
          : 'fr-urban-rules.question.can_add_storey.noLimit';
    const offer =
      governing !== undefined && governing.kind === 'absolute' && !several
        ? confirmOffer(entry, governing.rule.id, input)
        : undefined;
    return {
      status: 'answered',
      summary: { key: summaryKey },
      values: { storey: metres(storey) },
      claims: keepClaims(claims, storeySaid && chosen.more === 0),
      interpretation: interpretations(
        attic && INTERPRETATIONS.attic,
        relativeGoverns && INTERPRETATIONS.relativeEstimate
      ).slice(-3),
      ...(offer === undefined ? {} : { offer })
    };
  }

  /**
   * At most twelve claims, in order; the assumed storey height (RD-2) is kept
   * whatever is cut, since every figure after it depends on it.
   */
  function keepClaims(claims, keepLast) {
    if (claims.length <= MAX_CLAIMS) return claims;
    if (!keepLast) return claims.slice(0, MAX_CLAIMS);
    const last = claims.at(-1);
    return [...claims.slice(0, MAX_CLAIMS - 1), last];
  }

  function answerMaxHeight(input) {
    const read = questionRead(input);
    if (read.refused !== undefined) return read.refused;
    const { report, entry } = read;
    const chosen = questionBuildings(entry, input.args?.building);
    if (chosen.refused !== undefined) return chosen.refused;
    const several = chosen.buildings.length > 1;
    const claims = [];
    // The tightest limit of any status (the offer's, DEC-5) and the tightest
    // confirmed one (the summary's): a summary carries no rule, so the host
    // cannot mark a rule to confirm in it (review 2026-10-21).
    let governing;
    let governingHeight;
    let confirmed;
    let confirmedHeight;
    for (const building of chosen.buildings) {
      const headroom = heightHeadroom(report, building, floorToFloor().value);
      if (several) claims.push(buildingHeading(building));
      const top = headroom.current.top;
      if (top !== undefined) {
        claims.push({
          text: { key: 'fr-urban-rules.question.height.current' },
          values: { current: metres(top) },
          basis: 'measured'
        });
      }
      for (const limit of headroom.limits) {
        if (limit.kind === 'absolute') {
          claims.push({
            text: {
              key:
                top === undefined
                  ? 'fr-urban-rules.question.max.absoluteOnly'
                  : limit.headroom < -RESOLUTION_HALF
                    ? 'fr-urban-rules.question.limit.over'
                    : 'fr-urban-rules.question.max.absolute',
              params: { rule: ruleName(limit.rule) }
            },
            values: {
              limit: metres(limit.limit),
              ...(top === undefined
                ? {}
                : limit.headroom < -RESOLUTION_HALF
                  ? { excess: metres(-limit.headroom) }
                  : { headroom: metres(limit.headroom) })
            },
            basis: 'rule',
            ruleId: limit.rule.id
          });
        } else if (top === undefined) {
          // A relative limit is a height only above a measured top.
          claims.push({
            text: { key: 'fr-urban-rules.question.limit.notChecked', params: { rule: ruleName(limit.rule) } },
            basis: 'rule',
            ruleId: limit.rule.id
          });
          continue;
        } else {
          claims.push({
            text: {
              key:
                limit.headroom < -RESOLUTION_HALF
                  ? 'fr-urban-rules.question.max.relativeOver'
                  : 'fr-urban-rules.question.max.relative',
              params: { rule: ruleName(limit.rule) }
            },
            values:
              limit.headroom < -RESOLUTION_HALF
                ? { height: metres(top + limit.headroom), excess: metres(-limit.headroom) }
                : { height: metres(top + limit.headroom), headroom: metres(limit.headroom) },
            basis: 'rule',
            ruleId: limit.rule.id
          });
        }
        if (limit.partly) claims.push(partlyClaim(limit.rule));
        const height = limit.kind === 'absolute' ? limit.limit : top + limit.headroom;
        if (governing === undefined || limit.headroom < governing.headroom) {
          governing = limit;
          governingHeight = height;
        }
        if (
          limit.rule.status === 'confirmed' &&
          (confirmed === undefined || limit.headroom < confirmed.headroom)
        ) {
          confirmed = limit;
          confirmedHeight = height;
        }
      }
      for (const rule of headroom.notChecked) {
        claims.push({
          text: { key: 'fr-urban-rules.question.limit.notChecked', params: { rule: ruleName(rule) } },
          basis: 'rule',
          ruleId: rule.id
        });
      }
    }
    if (chosen.more > 0) {
      claims.push({
        text: { key: 'fr-urban-rules.question.andMore', params: { count: chosen.more } },
        basis: 'report'
      });
    }
    const offer =
      governing !== undefined && governing.kind === 'absolute' && !several
        ? confirmOffer(entry, governing.rule.id, input)
        : undefined;
    const lower = governing !== undefined && governing !== confirmed;
    let summaryKey;
    let summaryValues;
    if (governing === undefined) {
      summaryKey = 'fr-urban-rules.question.max_height.none';
    } else if (confirmed === undefined) {
      summaryKey = 'fr-urban-rules.question.max_height.toConfirmOnly';
      summaryValues = { height: metres(governingHeight) };
    } else {
      summaryKey = {
        absolute: lower
          ? 'fr-urban-rules.question.max_height.absoluteButToConfirm'
          : 'fr-urban-rules.question.max_height.absolute',
        relative: lower
          ? 'fr-urban-rules.question.max_height.relativeButToConfirm'
          : 'fr-urban-rules.question.max_height.relative'
      }[confirmed.kind];
      summaryValues = {
        height: metres(confirmedHeight),
        ...(lower ? { lower: metres(governingHeight) } : {})
      };
    }
    return {
      status: 'answered',
      summary: { key: summaryKey },
      ...(summaryValues === undefined ? {} : { values: summaryValues }),
      claims: keepClaims(claims, false),
      interpretation: interpretations(
        (governing?.kind === 'relative' || confirmed?.kind === 'relative') &&
          INTERPRETATIONS.relativeEstimate
      ),
      ...(offer === undefined ? {} : { offer })
    };
  }

  /** The result word of a check, by key (`no_issue` is the strongest — never « compliant »). */
  const RESULT_CLAIM_KEYS = {
    no_issue: 'fr-urban-rules.question.road.setbackNoIssue',
    potential_issue: 'fr-urban-rules.question.road.setbackIssue',
    not_checked: 'fr-urban-rules.question.road.setbackNotChecked'
  };
  const ALIGNMENT_CLAIM_KEYS = {
    no_issue: 'fr-urban-rules.question.road.alignmentNoIssue',
    potential_issue: 'fr-urban-rules.question.road.alignmentIssue',
    not_checked: 'fr-urban-rules.question.road.alignmentNotChecked'
  };

  function answerRoadDistance(input) {
    const read = questionRead(input);
    if (read.refused !== undefined) return read.refused;
    const { report, entry } = read;
    const streets = (Array.isArray(report.edges) ? report.edges : []).filter(
      (e) => e.role === 'street'
    );
    if (streets.length === 0) return cannotAnswer('fr-urban-rules.question.road_distance.noStreet');
    const chosen = questionBuildings(entry, input.args?.building);
    if (chosen.refused !== undefined) return chosen.refused;
    const several = chosen.buildings.length > 1;
    const service = siteOf();
    const claims = [];
    let nearest;
    for (const building of chosen.buildings) {
      if (several) claims.push(buildingHeading(building));
      // DEC-3: the horizontal distance to each street edge, the setback checks' own level.
      let answer;
      try {
        answer = service?.measures?.distances?.({
          ...(building.main ? {} : { buildingId: building.id }),
          outline: 'storeys',
          targets: streets.slice(0, MAX_LINE_TARGETS).map((e) => ({ kind: 'boundary-edge', edge: e.edge }))
        });
      } catch (cause) {
        answer = { available: false, reason: 'unavailable' };
        log(`${SOURCE_ID}: road_distance could not measure: ${String(cause)}`);
      }
      streets.slice(0, 4).forEach((edge, index) => {
        const target = answer?.available ? answer.targets?.[index] : undefined;
        const d = target?.nearest?.distance;
        if (Number.isFinite(d)) {
          if (nearest === undefined || d < nearest) nearest = d;
          claims.push({
            text: { key: 'fr-urban-rules.question.road.edge', params: { edge: edge.edge } },
            values: { distance: metres(d) },
            basis: 'measured'
          });
        } else {
          claims.push({
            text: {
              key: 'fr-urban-rules.question.road.edgeUnmeasured',
              params: {
                edge: edge.edge,
                reason: cut(String(target?.unavailable ?? answer?.reason ?? 'unavailable'), 80)
              }
            },
            basis: 'measured'
          });
        }
      });
      for (const check of report.checks) {
        if (check.ruleId === 'rnu:R.111-16' && (check.subject?.id ?? building.id) === building.id) {
          claims.push({
            text: {
              key: ALIGNMENT_CLAIM_KEYS[check.result] ?? ALIGNMENT_CLAIM_KEYS.not_checked,
              params: { edge: check.id.split(':').at(-1) }
            },
            ...(check.measured !== undefined && check.limit !== undefined
              ? { values: { measured: check.measured, limit: check.limit } }
              : {}),
            basis: 'rule',
            ruleId: check.ruleId,
            checkId: check.id
          });
        }
      }
      const setbacks = report.rules.filter(
        (r) => r.kind === 'road_setback' && r.id !== 'rnu:R.111-16' && r.status !== 'not_applicable'
      );
      for (const rule of setbacks) {
        const check = report.checks.find(
          (c) =>
            c.ruleId === rule.id &&
            (c.id === `chk:${rule.id}:${building.id}` ||
              c.id.startsWith(`chk:${rule.id}:${building.id}:`))
        );
        if (check === undefined) {
          claims.push({
            text: { key: 'fr-urban-rules.question.limit.notChecked', params: { rule: ruleName(rule) } },
            basis: 'rule',
            ruleId: rule.id
          });
          continue;
        }
        claims.push({
          text: {
            key: RESULT_CLAIM_KEYS[check.result] ?? RESULT_CLAIM_KEYS.not_checked,
            params: { rule: ruleName(rule) }
          },
          ...(check.measured !== undefined && check.limit !== undefined
            ? { values: { measured: check.measured, limit: check.limit } }
            : {}),
          basis: 'rule',
          ruleId: rule.id,
          checkId: check.id
        });
      }
    }
    // DEC-3: the edge-role assumption, in the report's own words.
    const assumptions = new Map((report.assumptions ?? []).map((a) => [a.id, a]));
    const said = new Set();
    for (const edge of streets) {
      const assumption = assumptions.get(edge.assumptionId);
      if (assumption === undefined || said.has(assumption.id) || !('key' in (assumption.text ?? {})))
        continue;
      said.add(assumption.id);
      claims.push({ text: assumption.text, basis: 'report' });
    }
    if (chosen.more > 0) {
      claims.push({
        text: { key: 'fr-urban-rules.question.andMore', params: { count: chosen.more } },
        basis: 'report'
      });
    }
    return {
      status: 'answered',
      summary: {
        key:
          nearest === undefined
            ? 'fr-urban-rules.question.road_distance.unmeasured'
            : 'fr-urban-rules.question.road_distance.summary'
      },
      ...(nearest === undefined ? {} : { values: { distance: metres(nearest) } }),
      claims: keepClaims(claims, false),
      interpretation: interpretations()
    };
  }

  function answerRemainingArea(input) {
    const read = questionRead(input);
    if (read.refused !== undefined) return read.refused;
    const { entry } = read;
    const figures = entry.open.figures;
    if (figures === undefined) return cannotAnswer('fr-urban-rules.question.notMeasured');
    const claims = [];
    const used = figures.emprise;
    if (used !== undefined) {
      claims.push({
        text: { key: 'fr-urban-rules.question.area.empriseUsed' },
        values: { used: squareMetres(used) },
        basis: 'measured'
      });
      claims.push({ text: figures.definition, basis: 'report' });
    } else {
      claims.push({
        text: {
          key: 'fr-urban-rules.question.area.empriseUnmeasured',
          params: { reason: cut(figures.empriseRefused ?? 'unavailable', 80) }
        },
        basis: 'measured'
      });
    }
    let summary;
    let values;
    if (figures.ces !== undefined && figures.allowed !== undefined) {
      claims.push({
        text: { key: 'fr-urban-rules.question.area.allowed' },
        values: {
          allowed: squareMetres(figures.allowed),
          percent: { value: figures.ces.percent, unit: 'percent' }
        },
        basis: 'rule',
        ruleId: figures.ces.ruleId
      });
      if (used !== undefined) {
        const remaining = figures.allowed - used;
        claims.push({
          text: { key: 'fr-urban-rules.question.area.remaining' },
          values: { remaining: squareMetres(remaining) },
          basis: 'rule',
          ruleId: figures.ces.ruleId
        });
        summary =
          remaining < -RESOLUTION_HALF
            ? 'fr-urban-rules.question.remaining_area.over'
            : 'fr-urban-rules.question.remaining_area.summary';
        values =
          remaining < -RESOLUTION_HALF
            ? { excess: squareMetres(-remaining) }
            : { remaining: squareMetres(remaining), allowed: squareMetres(figures.allowed) };
      }
    } else if (figures.notRegulatedRuleId !== undefined) {
      claims.push({
        text: { key: 'fr-urban-rules.question.area.notRegulated' },
        basis: 'rule',
        ruleId: figures.notRegulatedRuleId
      });
      summary = 'fr-urban-rules.question.remaining_area.notRegulated';
    }
    summary ??= 'fr-urban-rules.question.remaining_area.noBudget';
    const sdp = figures.sdp;
    if (typeof sdp?.total === 'number') {
      claims.push({
        text: {
          key:
            sdp.missing > 0 || sdp.estimate
              ? 'fr-urban-rules.question.area.sdpEstimate'
              : 'fr-urban-rules.question.area.sdp'
        },
        values: { total: squareMetres(sdp.total) },
        basis: 'measured'
      });
    }
    if (figures.capacity !== undefined) {
      claims.push({
        text: { key: 'fr-urban-rules.question.area.capacity' },
        values: { low: squareMetres(figures.capacity.low), high: squareMetres(figures.capacity.high) },
        basis: 'report'
      });
    } else {
      claims.push({ text: { key: 'fr-urban-rules.question.area.capacityMissing' }, basis: 'report' });
    }
    return {
      status: 'answered',
      summary: { key: summary },
      ...(values === undefined ? {} : { values }),
      claims: keepClaims(claims, false),
      interpretation: interpretations()
    };
  }

  const buildingParameter = {
    kind: 'text',
    description:
      'The name of one building of the project, as the user calls it. Leave it out to answer for every building (up to four).',
    maxLength: 80
  };

  /** DEC-1: the four questions, offered to a model as `regulations_<id>` (096.12). */
  const questions = [
    {
      id: 'can_add_storey',
      description:
        'Answers whether one more storey fits the height rules of the planning report for this French plot, from the measured building height and each height limit (confirmed or to confirm), with the potential issues that stay whatever the height and the floor area after the storey. Pass storeyHeight when the user names a floor-to-floor height; otherwise the design’s own storey height, or an assumed 3 m, is used and said. Does not decide whether a permit will be granted.',
      parameters: {
        storeyHeight: {
          kind: 'number',
          description: 'The floor-to-floor height of the storey to add.',
          unit: 'm',
          min: 2,
          max: 6
        },
        building: buildingParameter
      },
      answer: (input) => answerCanAddStorey(input)
    },
    {
      id: 'road_distance',
      description:
        'Answers how far the building stands from the street on this French plot: the measured horizontal distance to each Site boundary edge set as the street, and the street setback rules of the planning report with their checks (R.111-16 to the opposite alignment under the national rules). Does not measure to a road the boundary does not face, and does not decide whether a permit will be granted.',
      parameters: { building: buildingParameter },
      answer: (input) => answerRoadDistance(input)
    },
    {
      id: 'max_height',
      description:
        'Answers what the maximum building height is on this French plot under the planning report: every height limit, tightest first, the limits relative to a distance stated as heights at the building, and the measured current height; rules not read or not checked are listed as such. Does not say what may be built and does not decide whether a permit will be granted.',
      parameters: { building: buildingParameter },
      answer: (input) => answerMaxHeight(input)
    },
    {
      id: 'remaining_area',
      description:
        'Answers how much more can be built on this French plot: the emprise au sol used, allowed and remaining under its definition, the surface de plancher, and the theoretical capacity range, which is an estimate and never a right to build. Does not decide whether a permit will be granted.',
      answer: (input) => answerRemainingArea(input)
    }
  ];

  return {
    roadsFor,
    roadsKnown,
    contextFor,
    augment,
    runAction,
    programmeFacts,
    checkVariation,
    questions,
    heightHeadroom,
    storeyLimit,
    measuredBuildings,
    lastReadFor,
    clear: () => {
      roadCache.clear();
      contextCache.clear();
      lastReads.clear();
      writtenSession = new Map();
    }
  };
}

// ── Drawn prescriptions: the parser (Sprint 002.2, DEC-1) ───────────────────────

/** `typepsc` to the rule kind a number would be (DEC-1); any other code is not parsed. */
const NUMERIC_TYPEPSC = {
  39: 'height',
  38: 'footprint',
  42: 'green',
  44: 'parking',
  15: 'setback'
};

const normalised = (value) =>
  typeof value === 'string'
    ? value
        .toLowerCase()
        .replace(/[  ]/g, ' ')
        .replace(/(\d),(\d)/g, '$1.$2')
        .trim()
    : '';

/**
 * A number is never read after a digit or a decimal point (« .5 » is no 5), nor
 * after a sign standing alone (« -3 m » is no 3 m; « Max-22 » still reads):
 * review fixes 2026-10-20, S3.
 */
const NUM = String.raw`(?<![\d.])(?<!(?:^|[\s(/])-)(\d+(?:\.\d+)?)`;
const LENGTH = new RegExp(`${NUM}\\s*(?:mètres?|metres?|m)(et|ht)?(?![a-zà-ÿ0-9²])`, 'g');
const PERCENT = new RegExp(`${NUM}\\s*%`, 'g');
const AREA = new RegExp(`${NUM}\\s*(?:m²|m2)(?![a-z0-9])`, 'g');
const MAX_NUMBER = new RegExp(`max(?:imum|imale|i)?\\s*[-:]?\\s*${NUM}`);
const BARE = /^\d+(?:\.\d+)?$/;
const STOREYS = /r\s*\+\s*\d+(?:\s*\+\s*(?:c|combles?|a|attique))?/;
const FACADE_WORDS = /fa[cç]ade|[ée]gout|acrot[èe]re/;
const TOTAL_WORDS = /fa[iî]tage|hors tout|absolue/;
/** S3: words that make a number something other than the kind's own limit. */
const MINIMUM_WORDS = /\bmini(?:mum|male|mal|ma)?\b|\bminim|au moins/;
const LEVEL_AFTER = /^\s*(?:niveaux?|[ée]tages?|niv\b)/;
const LEVEL_WORDS = /niveaux?|[ée]tages?|\bniv\b/;
const ALTITUDE_WORDS = /\bngf\b|altitude/;
const THOUSANDS = /\d\s\d{3}(?!\d)/;

const all = (pattern, text) =>
  [...text.matchAll(pattern)].map((m) => ({
    value: Number(m[1]),
    suffix: m[2],
    index: m.index,
    raw: m[0]
  }));

/** A minimum written just before a number (« mini 18 m »), with no « max » between them. */
function minimumBefore(source, index) {
  const before = source.slice(Math.max(0, index - 25), index);
  const at = before.search(MINIMUM_WORDS);
  return at !== -1 && !/max/.test(before.slice(at));
}

/**
 * DEC-1: a drawn prescription's number, read from its `txt`, then its
 * `libelle` — `{ kind, value, unit, confidence, conditions }`, or `{ kind,
 * conditions }` with no value when nothing can be read (the rule is then not
 * evaluable, its words quoted). Pure and synchronous. `R+n` is a condition,
 * never metres.
 *
 * Review fixes (2026-10-20, S3): no value is read — the rule stays not
 * evaluable, its words quoted — from an altitude (« NGF », « altitude »), a
 * figure with a thousands separator (« 1 000 »), a count of levels (« 3
 * niveaux »), a minimum where a cap is meant (« mini 18 m » with no « max »),
 * a zero, or two figures no keyword tells apart.
 */
function parsePrescriptionValue({ typepsc, libelle, txt }) {
  const family = NUMERIC_TYPEPSC[String(typepsc)];
  const label = normalised(libelle);
  const text = normalised(txt);
  const both = `${text} ${label}`;
  const conditions = [];
  const storeys = both.match(STOREYS);
  if (storeys !== null) conditions.push(storeys[0].toUpperCase().replace(/\s+/g, ''));
  if (family === undefined) return { kind: 'other', conditions };
  if (family === 'parking') return { kind: 'parking', conditions };
  const kindOfFamily = {
    height: FACADE_WORDS.test(both) && !TOTAL_WORDS.test(both) ? 'height_facade' : 'height_total',
    setback: 'road_setback',
    footprint: 'footprint_ratio',
    green: 'green_ratio'
  }[family];
  const none = { kind: kindOfFamily, conditions };
  // An altitude or a thousands separator: no figure here is the kind's limit.
  if (ALTITUDE_WORDS.test(both) || THOUSANDS.test(both)) return none;
  const found = (value, rest) => (value > 0 ? { conditions, ...rest, value } : none);
  // A minimum and no « max » anywhere: a floor where a cap is meant.
  if (
    (family === 'height' || family === 'footprint') &&
    MINIMUM_WORDS.test(both) &&
    !/max/.test(both)
  )
    return none;
  if (family === 'height') {
    const facade = kindOfFamily === 'height_facade';
    const kindOf = (suffix) =>
      suffix === 'et'
        ? 'height_facade'
        : suffix === 'ht'
          ? 'height_total'
          : facade
            ? 'height_facade'
            : 'height_total';
    const usable = (source) => (m) => !minimumBefore(source, m.index);
    const fromTxt = all(LENGTH, text);
    if (fromTxt.length === 1) {
      if (!usable(text)(fromTxt[0])) return none;
      return found(fromTxt[0].value, {
        kind: kindOf(fromTxt[0].suffix),
        unit: 'm',
        confidence: 'high'
      });
    }
    // Several heights: the one a keyword names — « max », « égout » (façade),
    // « faîtage » (total); none named, none read.
    const keyed = (source, matches) =>
      matches.find((m) => /max/.test(source.slice(Math.max(0, m.index - 25), m.index))) ??
      matches.find((m) => /fa[iî]tage/.test(source.slice(m.index, m.index + 25)));
    for (const [source, original] of [
      [text, txt],
      [label, libelle]
    ]) {
      const matches = all(LENGTH, source);
      if (matches.length <= 1) continue;
      const chosen = keyed(source, matches);
      if (chosen === undefined || !usable(source)(chosen)) {
        return { ...none, conditions: [...new Set([...conditions, String(original).trim()])] };
      }
      return found(chosen.value, {
        kind: /[ée]gout/.test(source.slice(chosen.index, chosen.index + 25))
          ? 'height_facade'
          : kindOf(chosen.suffix),
        unit: 'm',
        confidence: 'low',
        conditions: [...new Set([...conditions, String(original).trim()])]
      });
    }
    const fromLabel = all(LENGTH, label);
    if (fromLabel.length === 1) {
      if (!usable(label)(fromLabel[0])) return none;
      return found(fromLabel[0].value, {
        kind: kindOf(fromLabel[0].suffix),
        unit: 'm',
        confidence: 'medium'
      });
    }
    // No unit: a number after « max », or a bare number in `txt`. A count of
    // levels, or a minimum, is neither.
    const max = MAX_NUMBER.exec(label);
    if (max !== null && !LEVEL_AFTER.test(label.slice(max.index + max[0].length))) {
      const value = Number(max[1]);
      return found(value, {
        kind: kindOf(),
        unit: 'm',
        confidence: BARE.test(text) && Number(text) === value ? 'high' : 'medium'
      });
    }
    if (BARE.test(text) && !LEVEL_WORDS.test(label) && !MINIMUM_WORDS.test(label)) {
      // DEC-1: a bare number is `low`, whatever the label says.
      return found(Number(text), { kind: kindOf(), unit: 'm', confidence: 'low' });
    }
    return none;
  }
  if (family === 'setback') {
    for (const [source, confidence] of [
      [text, 'high'],
      [label, 'medium']
    ]) {
      const lengths = all(LENGTH, source);
      if (lengths.length === 1)
        return found(lengths[0].value, { kind: 'road_setback', unit: 'm', confidence });
      if (lengths.length > 1) return none;
    }
    return none;
  }
  if (family === 'footprint') {
    for (const [source, confidence] of [
      [text, 'high'],
      [label, 'medium']
    ]) {
      const percent = all(PERCENT, source);
      const area = all(AREA, source);
      if (percent.length + area.length > 1) return none;
      const only = percent[0] ?? area[0];
      if (only === undefined) continue;
      if (minimumBefore(source, only.index)) return none;
      return percent.length === 1
        ? found(only.value, { kind: 'footprint_ratio', unit: 'percent', confidence })
        : found(only.value, { kind: 'floor_area_max', unit: 'm2', confidence });
    }
    return none;
  }
  // green: a percentage, or a coefficient ≤ 1 written as a bare number (the SDK has no coefficient unit).
  for (const [source, confidence] of [
    [text, 'high'],
    [label, 'medium']
  ]) {
    const percent = all(PERCENT, source);
    if (percent.length === 1)
      return found(percent[0].value, { kind: 'green_ratio', unit: 'percent', confidence });
    if (percent.length > 1) return none;
  }
  if (BARE.test(text) && Number(text) > 0 && Number(text) <= 1) {
    return found(Math.round(Number(text) * 1000) / 10, {
      kind: 'green_ratio',
      unit: 'percent',
      confidence: 'medium'
    });
  }
  return none;
}

// ── The law (Sprint 002.1a, DEC-1) ───────────────────────────────────────────────

/**
 * The Code de l'urbanisme articles the RNU rules rest on, each the version in
 * force read on 2026-10-20: its `LEGIARTI` id, the date it came into force
 * (`versionFrom`, ISO — what 002.2's confirmations key to) and its text,
 * verbatim. The text is the article XML of that `LEGIARTI` version in DILA's
 * official LEGI export (the Légifrance database, 2025-07-13 global file); live
 * Légifrance confirmed on 2026-10-20 that each id is still the version in
 * force, from the same date, with the same opening. A new version of an
 * article is a new `LEGIARTI` id: re-read it and change this table, never the
 * text alone. The record is `test-fixtures/fr-urban-rules/legi-articles.json`.
 */
const ARTICLES = {
  'R.111-1': {
    legiarti: 'LEGIARTI000034355056',
    versionFrom: '2017-04-01',
    versionText: '1er avril 2017',
    text: "Le règlement national d'urbanisme est applicable aux constructions et aménagements faisant l'objet d'un permis de construire, d'un permis d'aménager ou d'une déclaration préalable ainsi qu'aux autres utilisations du sol régies par le présent code.\nToutefois les dispositions des articles R. 111-3, R. 111-5 à R. 111-19 et R. 111-28 à R. 111-30 ne sont pas applicables dans les territoires dotés d'un plan local d'urbanisme ou d'un document d'urbanisme en tenant lieu.\nLes termes utilisés par le règlement national d'urbanisme peuvent être définis par un lexique national d'urbanisme, pris par arrêté du ministre chargé de l'urbanisme."
  },
  'R.111-15': {
    legiarti: 'LEGIARTI000031721290',
    versionFrom: '2016-01-01',
    versionText: '1er janvier 2016',
    text: "Une distance d'au moins trois mètres peut être imposée entre deux bâtiments non contigus situés sur un terrain appartenant au même propriétaire."
  },
  'R.111-16': {
    legiarti: 'LEGIARTI000031721288',
    versionFrom: '2016-01-01',
    versionText: '1er janvier 2016',
    text: "Lorsque le bâtiment est édifié en bordure d'une voie publique, la distance comptée horizontalement de tout point de l'immeuble au point le plus proche de l'alignement opposé doit être au moins égale à la différence d'altitude entre ces deux points. Lorsqu'il existe une obligation de construire au retrait de l'alignement, la limite de ce retrait se substitue à l'alignement. Il en sera de même pour les constructions élevées en bordure des voies privées, la largeur effective de la voie privée étant assimilée à la largeur réglementaire des voies publiques.\nToutefois une implantation de la construction à l'alignement ou dans le prolongement des constructions existantes peut être imposée."
  },
  'R.111-17': {
    legiarti: 'LEGIARTI000031721286',
    versionFrom: '2016-01-01',
    versionText: '1er janvier 2016',
    text: "A moins que le bâtiment à construire ne jouxte la limite parcellaire, la distance comptée horizontalement de tout point de ce bâtiment au point de la limite parcellaire qui en est le plus rapproché doit être au moins égale à la moitié de la différence d'altitude entre ces deux points, sans pouvoir être inférieure à trois mètres."
  },
  'R.111-18': {
    legiarti: 'LEGIARTI000031721284',
    versionFrom: '2016-01-01',
    versionText: '1er janvier 2016',
    text: "Lorsque, par son gabarit ou son implantation, un immeuble bâti existant n'est pas conforme aux prescriptions de l'article R. 111-17, le permis de construire ne peut être accordé que pour des travaux qui ont pour objet d'améliorer la conformité de l'implantation ou du gabarit de cet immeuble avec ces prescriptions, ou pour des travaux qui sont sans effet sur l'implantation ou le gabarit de l'immeuble."
  },
  'R.111-19': {
    legiarti: 'LEGIARTI000031721282',
    versionFrom: '2016-01-01',
    versionText: '1er janvier 2016',
    text: "Des dérogations aux règles édictées aux articles R. 111-15 à R. 111-18 peuvent être accordées par décision motivée de l'autorité compétente mentionnée aux articles L. 422-1 à L. 422-3, après avis du maire de la commune lorsque celui-ci n'est pas l'autorité compétente.\nEn outre, le préfet peut, après avis du maire, apporter des aménagements aux règles prescrites aux articles R. 111-15 à R. 111-18, sur les territoires où l'établissement de plans locaux d'urbanisme a été prescrit, mais où ces plans n'ont pas encore été approuvés."
  },
  'R.111-28': {
    legiarti: 'LEGIARTI000031721256',
    versionFrom: '2016-01-01',
    versionText: '1er janvier 2016',
    text: "Dans les secteurs déjà partiellement bâtis, présentant une unité d'aspect et non compris dans des programmes de rénovation, l'autorisation de construire à une hauteur supérieure à la hauteur moyenne des constructions avoisinantes peut être refusée ou subordonnée à des prescriptions particulières."
  },
  'L.111-3': {
    legiarti: 'LEGIARTI000031210179',
    versionFrom: '2016-01-01',
    versionText: '1er janvier 2016',
    text: "En l'absence de plan local d'urbanisme, de tout document d'urbanisme en tenant lieu ou de carte communale, les constructions ne peuvent être autorisées que dans les parties urbanisées de la commune."
  },
  'L.111-4': {
    legiarti: 'LEGIARTI000047303702',
    versionFrom: '2023-03-12',
    versionText: '12 mars 2023',
    text: "Peuvent toutefois être autorisés en dehors des parties urbanisées de la commune :\n1° L'adaptation, le changement de destination, la réfection, l'extension des constructions existantes ou la construction de bâtiments nouveaux à usage d'habitation à l'intérieur du périmètre regroupant les bâtiments d'une ancienne exploitation agricole, dans le respect des traditions architecturales locales ;\n2° Les constructions et installations nécessaires à l'exploitation agricole, à des équipements collectifs dès lors qu'elles ne sont pas incompatibles avec l'exercice d'une activité agricole, pastorale ou forestière sur le terrain sur lequel elles sont implantées, à la réalisation d'aires d'accueil ou de terrains de passage des gens du voyage, à la mise en valeur des ressources naturelles et à la réalisation d'opérations d'intérêt national ;\n2° bis Les constructions et installations nécessaires à la transformation, au conditionnement et à la commercialisation des produits agricoles, lorsque ces activités constituent le prolongement de l'acte de production et dès lors qu'elles ne sont pas incompatibles avec l'exercice d'une activité agricole, pastorale ou forestière sur le terrain sur lequel elles sont implantées. Ces constructions et installations ne peuvent pas être autorisées dans les zones naturelles, ni porter atteinte à la sauvegarde des espaces naturels et des paysages. L'autorisation d'urbanisme est soumise pour avis à la commission départementale de la préservation des espaces naturels, agricoles et forestiers ;\n3° Les constructions et installations incompatibles avec le voisinage des zones habitées et l'extension mesurée des constructions et installations existantes ;\n4° Les constructions ou installations, sur délibération motivée du conseil municipal, si celui-ci considère que l'intérêt de la commune, en particulier pour éviter une diminution de la population communale, le justifie, dès lors qu'elles ne portent pas atteinte à la sauvegarde des espaces naturels et des paysages, à la salubrité et à la sécurité publiques, qu'elles n'entraînent pas un surcroît important de dépenses publiques et que le projet n'est pas contraire aux objectifs visés à l'article L. 101-2 et aux dispositions des chapitres I et II du titre II du livre Ier ou aux directives territoriales d'aménagement précisant leurs modalités d'application.\nPour l'application du présent article, les installations de production et, le cas échéant, de commercialisation, par un ou plusieurs exploitants agricoles, de biogaz, d'électricité et de chaleur par la méthanisation qui respectent les conditions fixées à l'article L. 311-1 du code rural et de la pêche maritime sont considérées comme des constructions ou des installations nécessaires à l'exploitation agricole mentionnées au 2° du présent article."
  },
  'R.420-1': {
    legiarti: 'LEGIARTI000028678466',
    versionFrom: '2014-04-01',
    versionText: '1er avril 2014',
    text: "L'emprise au sol au sens du présent livre est la projection verticale du volume de la construction, tous débords et surplombs inclus.\nToutefois, les ornements tels que les éléments de modénature et les marquises sont exclus, ainsi que les débords de toiture lorsqu'ils ne sont pas soutenus par des poteaux ou des encorbellements."
  },
  'R.111-22': {
    legiarti: 'LEGIARTI000031721274',
    versionFrom: '2016-01-01',
    versionText: '1er janvier 2016',
    text: "La surface de plancher de la construction est égale à la somme des surfaces de plancher de chaque niveau clos et couvert, calculée à partir du nu intérieur des façades après déduction :\n1° Des surfaces correspondant à l'épaisseur des murs entourant les embrasures des portes et fenêtres donnant sur l'extérieur ;\n2° Des vides et des trémies afférentes aux escaliers et ascenseurs ;\n3° Des surfaces de plancher d'une hauteur sous plafond inférieure ou égale à 1,80 mètre ;\n4° Des surfaces de plancher aménagées en vue du stationnement des véhicules motorisés ou non, y compris les rampes d'accès et les aires de manœuvres ;\n5° Des surfaces de plancher des combles non aménageables pour l'habitation ou pour des activités à caractère professionnel, artisanal, industriel ou commercial ;\n6° Des surfaces de plancher des locaux techniques nécessaires au fonctionnement d'un groupe de bâtiments ou d'un immeuble autre qu'une maison individuelle au sens de l'article L. 231-1 du code de la construction et de l'habitation, y compris les locaux de stockage des déchets ;\n7° Des surfaces de plancher des caves ou des celliers, annexes à des logements, dès lors que ces locaux sont desservis uniquement par une partie commune ;\n8° D'une surface égale à 10 % des surfaces de plancher affectées à l'habitation telles qu'elles résultent le cas échéant de l'application des alinéas précédents, dès lors que les logements sont desservis par des parties communes intérieures."
  },
  'L.161-4': {
    legiarti: 'LEGIARTI000047303314',
    versionFrom: '2023-03-12',
    versionText: '12 mars 2023',
    text: "I.-La carte communale délimite les secteurs où les constructions sont autorisées et les secteurs où les constructions ne sont pas admises, à l'exception :\n1° De l'adaptation, du changement de destination, de la réfection ou de l'extension des constructions existantes ainsi que de l'édification d'annexes à proximité d'un bâtiment existant ;\n2° Des constructions et installations nécessaires :\na) A des équipements collectifs ;\nb) A l'exploitation agricole ou forestière, à la transformation, au conditionnement et à la commercialisation des produits agricoles lorsque ces activités constituent le prolongement de l'acte de production ;\nc) A la mise en valeur des ressources naturelles ;\nd) Au stockage et à l'entretien du matériel des coopératives d'utilisation de matériel agricole.\nLes constructions et installations mentionnées au 2° ne peuvent être autorisées que lorsqu'elles ne sont pas incompatibles avec l'exercice d'une activité agricole, pastorale ou forestière sur le terrain sur lequel elles sont implantées et qu'elles ne portent pas atteinte à la sauvegarde des espaces naturels ou des paysages.\nLes constructions et installations mentionnées aux b et d du même 2° sont soumises à l'avis de la commission départementale de la préservation des espaces naturels, agricoles et forestiers.\nPour l'application du présent article, les installations de méthanisation mentionnées à l'article L. 111-4 sont considérées comme des constructions ou des installations nécessaires à l'exploitation agricole au sens du b du 2° du présent article.\nDans les communes non couvertes par un schéma de cohérence territoriale, la carte communale peut délimiter les zones d'accélération pour l'implantation d'installations terrestres de production d'énergies renouvelables arrêtées en application de l'article L. 141-5-3 du code de l'énergie.\nII.-La carte communale peut délimiter des secteurs dans lesquels est soumise à conditions l'implantation d'installations de production d'énergies renouvelables, dès lors qu'elles sont incompatibles avec le voisinage habité ou avec l'usage des terrains situés à proximité ou qu'elles portent atteinte à la sauvegarde des espaces naturels et des paysages, à la qualité architecturale, urbaine et paysagère, à la mise en valeur du patrimoine et à l'insertion des installations dans le milieu environnant.\nDans les communes des départements pour lesquels a préalablement été arrêtée une cartographie des zones d'accélération pour l'implantation d'installations terrestres de production d'énergies renouvelables en application de l'article L. 141-5-3 du code de l'énergie et lorsque l'avis du comité régional de l'énergie a estimé, dans les conditions prévues au même article L. 141-5-3, que les zones d'accélération identifiées par ladite cartographie sont suffisantes pour l'atteinte des objectifs régionaux établis en application de l'article L. 141-5-1 du même code, la carte communale peut également délimiter des secteurs où est exclue l'implantation d'installations de production d'énergies renouvelables, dès lors qu'elles sont incompatibles avec le voisinage habité ou avec l'usage des terrains situés à proximité ou qu'elles portent atteinte à la sauvegarde des espaces naturels et des paysages, à la qualité architecturale, urbaine et paysagère, à la mise en valeur du patrimoine et à l'insertion des installations dans le milieu environnant. Les secteurs délimités en application du présent alinéa sont applicables uniquement aux projets dont la demande d'autorisation auprès de l'autorité compétente est déposée après l'approbation de la carte communale délimitant de tels secteurs. Les secteurs délimités en application du présent alinéa ne sont pas applicables aux procédés de production d'énergies renouvelables en toiture ou aux procédés de chaleur à usage individuel."
  }
};

const legifrance = (article) =>
  `https://www.legifrance.gouv.fr/codes/article_lc/${ARTICLES[article].legiarti}`;

// ── The programme warning (Sprint 002.3, DEC-7) ──────────────────────────────────

const AiServiceToken = { name: 'ai' };
// Joined, as `SOURCE_ID` is: an id, not a translation key.
const PROGRAMME_STAGE_ID = ['fr-urban-rules', 'programme'].join('.');

/**
 * DEC-7: the `programme` planning-stage enricher that replaces `urban-rules`'.
 * Synchronous and within the host's 50 ms: it reads the report this session
 * read for the Site's plot (`facts(view)`, the reader's cache — never a fetch),
 * the section and the Site. Returns a new programme, never mutates; abstains
 * (the input as it is) with no Site, a Site outside France, or an artefact
 * that is not a programme. Strings through `i18n` (`fr-urban-rules.programme.*`).
 *
 * - No report read for the plot: one assumption, "Planning rules not read
 *   yet", and no warning — the host reads the report only once its row is
 *   wanted.
 * - No confirmed footprint or height rule: one assumption, no warning.
 * - Otherwise the limits as assumptions, and a warning when the programme's
 *   total passes the capacity's upper bound, or its storeys the storeys the
 *   confirmed (absolute) heights allow — 002.8 moves the count onto
 *   `heightHeadroom`.
 */
function createProgrammeStage({ facts, site, translate = () => undefined }) {
  const say = (key, params) => {
    let text;
    try {
      text = translate(key, params);
    } catch {
      text = undefined;
    }
    if (typeof text === 'string' && text !== '' && text !== key) return text;
    return params === undefined ? key : `${key} ${JSON.stringify(params)}`;
  };
  const round = (value) => Math.round(value * 100) / 100;
  return {
    id: PROGRAMME_STAGE_ID,
    stage: 'programme',
    enrich: (programme) => {
      if (programme === null || typeof programme !== 'object' || !Array.isArray(programme.spaces)) {
        return programme;
      }
      let view;
      try {
        view = site()?.current();
      } catch {
        return programme;
      }
      if (view === undefined || view.country !== 'FR') return programme;
      let read;
      try {
        read = facts(view);
      } catch {
        read = undefined;
      }
      const assumptions = [];
      const warnings = [];
      if (read === undefined) {
        assumptions.push(say('fr-urban-rules.programme.notRead'));
      } else if (!read.anyConfirmed) {
        assumptions.push(say('fr-urban-rules.programme.noRule'));
      } else {
        if (read.ces !== undefined && read.allowed !== undefined) {
          assumptions.push(
            say('fr-urban-rules.programme.footprint', {
              percent: read.ces,
              plot: round(read.plotArea),
              allowed: round(read.allowed)
            })
          );
        } else if (read.notRegulated) {
          assumptions.push(say('fr-urban-rules.programme.notRegulated'));
        }
        // 002.8 DEC-2: the storeys `heightHeadroom` allows, and the rule that governs them.
        const relative = read.governing?.kind === 'relative';
        const governingHeight =
          read.governing?.kind === 'absolute'
            ? read.governing.height
            : Math.max(...read.heights.map((h) => h.value));
        if (read.storeysAllowed !== undefined) {
          assumptions.push(
            relative
              ? say('fr-urban-rules.programme.storeysRelative', {
                  storeys: read.storeysAllowed,
                  floor: read.floorToFloor.value
                })
              : say('fr-urban-rules.programme.storeys', {
                  height: governingHeight,
                  storeys: read.storeysAllowed,
                  floor: read.floorToFloor.value
                })
          );
        }
        if (read.floorToFloor.assumed && read.storeysAllowed !== undefined) {
          assumptions.push(
            say('fr-urban-rules.programme.floorDefault', { height: read.floorToFloor.value })
          );
        }
        if (read.capacity !== undefined) {
          assumptions.push(
            say('fr-urban-rules.programme.capacity', {
              low: round(read.capacity.low),
              high: round(read.capacity.high)
            })
          );
          const total = programme.totalArea;
          if (typeof total === 'number' && total > read.capacity.high + RESOLUTION_HALF) {
            warnings.push(
              say('fr-urban-rules.programme.overCapacity', {
                total: round(total),
                high: round(read.capacity.high)
              })
            );
          }
        }
        const storeys = programme.storeys;
        if (
          typeof storeys === 'number' &&
          read.storeysAllowed !== undefined &&
          storeys > read.storeysAllowed
        ) {
          warnings.push(
            relative
              ? say('fr-urban-rules.programme.overStoreysRelative', {
                  storeys,
                  allowed: read.storeysAllowed
                })
              : say('fr-urban-rules.programme.overStoreys', {
                  storeys,
                  allowed: read.storeysAllowed,
                  height: governingHeight
                })
          );
        }
      }
      return {
        ...programme,
        assumptions: [...(programme.assumptions ?? []), ...assumptions],
        warnings: [...(programme.warnings ?? []), ...warnings]
      };
    }
  };
}

// ── Capturing the acceptance fixtures (Sprint 002.4, DEC-2) ─────────────────────

// Joined, as `SOURCE_ID` is: an id, not a translation key.
const CAPTURE_COMMAND_ID = ['fr-urban-rules', 'dev', 'captureFixtures'].join('.');

/**
 * The preference that registers the capture command (the owner's Q8 in 002.4,
 * decided on the owner's behalf, 2026-10-20): off unless it is exactly `true`.
 * Read once, at activation — the preferences service has no change event —
 * so it takes effect when the package is next activated (re-enabled, reloaded
 * or the page reloaded). The host keeps it in `localStorage` under
 * `archisimple.ext.shared.fr-urban-rules.devCapture`.
 */
const DEV_CAPTURE_PREFERENCE = ['fr-urban-rules', 'devCapture'].join('.');

/** JSON-cloned: what a fixture file holds, and what a replay compares. `undefined` stays. */
const jsonClone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** A member step of a recorded path: `.name`, or `["odd key"]`. */
const pathStep = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`);

/** A key-sorted JSON text: two equal inputs name one result, whatever their key order. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * DEC-2's recorder: `service` with every method call — `measures.*` and the
 * methods of what a call returns (a document entity's own) included —
 * kept in `pairs` as `{ path, args, result }`, JSON-cloned. A returned value's
 * methods are named after their call: `find(["Building"])[0].name`. A
 * method in `refuse` throws instead (DEC-2: the capture writes nothing).
 * Absent members stay absent, so the reader's `typeof … === 'function'` tests
 * answer as they do on the real service.
 */
function recordingService(service, pairs, refuse = []) {
  const record = (path, fn, self) =>
    function recorded(...args) {
      const cloned = jsonClone(args);
      const base = `${path}(${stableJson(cloned)})`;
      const keep = (entry) => {
        pairs.push({ path, args: cloned, ...entry });
      };
      let result;
      try {
        result = fn.apply(self, args);
      } catch (cause) {
        keep({ error: cause instanceof Error ? cause.message : String(cause) });
        throw cause;
      }
      if (result !== null && typeof result?.then === 'function') {
        return result.then(
          (value) => {
            const copy = copyOut(value, base);
            keep({ async: true, result: jsonClone(copy) });
            return copy;
          },
          (cause) => {
            keep({ async: true, error: cause instanceof Error ? cause.message : String(cause) });
            throw cause;
          }
        );
      }
      const copy = copyOut(result, base);
      keep(copy === undefined ? {} : { result: jsonClone(copy) });
      return copy;
    };
  // A returned value, copied with its data materialised and its methods recorded.
  // `seen` holds the ancestors only: a cycle is cut, a shared value copied twice.
  const copyOut = (value, base, seen = new Set()) => {
    if (typeof value === 'function') return record(base, value, undefined);
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return undefined;
    seen.add(value);
    try {
      return copyMembers(value, base, seen);
    } finally {
      seen.delete(value);
    }
  };
  const copyMembers = (value, base, seen) => {
    if (Array.isArray(value)) return value.map((v, i) => copyOut(v, `${base}[${i}]`, seen));
    const copy = {};
    const names = new Set(Object.keys(value));
    let p = Object.getPrototypeOf(value);
    for (; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const name of Reflect.ownKeys(p)) {
        if (typeof name === 'string' && name !== 'constructor') names.add(name);
      }
    }
    for (const name of names) {
      const member = value[name];
      copy[name] =
        typeof member === 'function'
          ? record(`${base}${pathStep(name)}`, member, value)
          : copyOut(member, `${base}${pathStep(name)}`, seen);
    }
    return copy;
  };
  // Over an empty target, so a frozen service breaks no Proxy invariant.
  const wrap = (object, prefix) =>
    new Proxy(Object.create(null), {
      has: (_, key) => key in object,
      get(_, key) {
        const value = Reflect.get(object, key);
        if (typeof key !== 'string') return value;
        const path = prefix === '' ? key : `${prefix}${pathStep(key)}`;
        if (refuse.includes(path)) {
          return () => {
            throw new Error(`${CAPTURE_COMMAND_ID}: ${path} refused while capturing`);
          };
        }
        if (typeof value === 'function') return record(path, value, object);
        if (value !== null && typeof value === 'object') return wrap(value, path);
        return value;
      }
    });
  return service === undefined || service === null ? undefined : wrap(service, '');
}

/** DEC-2: the real `fetch`, each answer kept as `{ url, method, body, status, text }`. */
function recordingFetch(fetchImpl, answers) {
  return async (url, init = {}) => {
    const entry = { url: String(url), method: init.method ?? 'GET', body: init.body ?? null };
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (cause) {
      answers.push({ ...entry, error: cause instanceof Error ? cause.name : String(cause) });
      throw cause;
    }
    if (typeof response.clone === 'function') {
      answers.push({ ...entry, status: response.status, text: await response.clone().text() });
      return response;
    }
    // A stand-in without `clone` (a test's): read once, answered from the copy.
    const text = await response.text();
    answers.push({ ...entry, status: response.status, text });
    return { ok: response.ok, status: response.status, text: async () => text };
  };
}

/** One browser download: the extension runs in the page, so an `<a download>` on a Blob URL. */
async function downloadJson(name, value) {
  const page = globalThis.document;
  const blob = new Blob([`${JSON.stringify(value ?? null, null, 2)}\n`], {
    type: 'application/json'
  });
  const href = URL.createObjectURL(blob);
  const link = page.createElement('a');
  link.href = href;
  link.download = name;
  link.hidden = true;
  page.body.appendChild(link);
  link.click();
  link.remove();
  // Spaced, so the browser does not fold six downloads into one prompt.
  await new Promise((resolve) => setTimeout(resolve, 250));
  return href;
}

/**
 * Sprint 002.4 DEC-2, "How captures are made": one read of the current plot by
 * a fresh reader over recording services, then six downloads — the inputs a
 * test replays and the report for reference. Writes nothing to the project:
 * `site-package-data.write` and `document.transact` are refused. The SDK
 * cannot tell a Development-Repository install from a published one, so the
 * command ships in both (DEC-2).
 *
 * The request is the host's own: the last one it passed to the source's
 * `read` — its Site view carries `plotArea`, the parcels' union, which
 * `site.current()` does not and this package cannot compute (no second
 * implementation of a host figure). With no read yet, `site.current()`.
 *
 * Files, renamed to `test-fixtures/fr-urban-rules/acceptance/<plot>/…` by
 * dropping the `fr-capture-` prefix: `site` (the request's Site view),
 * `site-calls`, `context` (`roads`, `map-features`, `document`), `section`,
 * `answers`, `report` — and, since 002.8, `variations` when the host has asked
 * for a parked variation's checks: `[{ variationId, buildings, checks }]`.
 */
async function captureFixtures(context, lastRequest, variations = []) {
  const optional = (token) => context.services.getOptional(token);
  const siteService = optional(SiteServiceToken);
  const view = lastRequest?.site ?? siteService?.current();
  if (siteService === undefined || view === undefined) {
    context.logger.warn(`${CAPTURE_COMMAND_ID}: no located Site to capture`);
    return;
  }
  if (lastRequest === undefined) {
    context.logger.warn(
      `${CAPTURE_COMMAND_ID}: no read by the host yet; the Site view has no plotArea`
    );
  }
  const calls = { site: [], roads: [], mapFeatures: [], document: [], packageData: [] };
  const answers = [];
  const site = recordingService(siteService, calls.site);
  const roads = recordingService(optional(RoadServiceToken), calls.roads);
  const mapFeatures = recordingService(optional(MapFeatureServiceToken), calls.mapFeatures);
  const documentService = recordingService(optional(DocumentServiceToken), calls.document, [
    'transact'
  ]);
  const packageData = optional(SitePackageDataServiceToken);
  const readOnlyData =
    packageData === undefined
      ? undefined
      : recordingService({ read: () => packageData.read() }, calls.packageData);
  const reader = createReader({
    fetch: recordingFetch((url, init) => globalThis.fetch(url, init), answers),
    site: () => site,
    log: (message) => context.logger.debug(message),
    roads: () => roads,
    mapFeatures: () => mapFeatures,
    packageData: () => readOnlyData,
    document: () => documentService,
    translate: (key, params) => optional(I18nServiceToken)?.translate(key, params)
  });
  const hrefs = [];
  try {
    const country = lastRequest?.country ?? view.country ?? 'FR';
    const report = await reader.read(
      { site: view, country, reason: 'site' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    // Sprint 002.8 DEC-7: each parked variation the host last asked about, checked
    // again over the recording service — so its measures, asked with its
    // `variationId`, land in `site-calls` — with the host's own buildings.
    const checked = [];
    for (const { variationId, buildings } of variations) {
      try {
        const { checks } = await reader.checkVariation(
          { site: view, country, variationId, report, buildings },
          { signal: new AbortController().signal }
        );
        checked.push({ variationId, buildings, checks: jsonClone(checks) });
      } catch (cause) {
        checked.push({ variationId, buildings, error: String(cause) });
      }
    }
    const files = [
      ['fr-capture-site.json', jsonClone(view)],
      ['fr-capture-site-calls.json', calls.site],
      [
        'fr-capture-context.json',
        {
          roads: roads === undefined ? null : calls.roads,
          'map-features': mapFeatures === undefined ? null : calls.mapFeatures,
          document: documentService === undefined ? null : calls.document
        }
      ],
      ['fr-capture-section.json', jsonClone(packageData?.read()) ?? null],
      ['fr-capture-answers.json', answers],
      ['fr-capture-report.json', jsonClone(report)],
      ...(checked.length === 0 ? [] : [['fr-capture-variations.json', checked]])
    ];
    for (const [name, value] of files) hrefs.push(await downloadJson(name, value));
    // The last download has started before its Blob URL goes.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    context.logger.info(
      `${CAPTURE_COMMAND_ID}: ${calls.site.length} site calls, ${answers.length} answers captured`
    );
  } finally {
    for (const href of hrefs) URL.revokeObjectURL(href);
    reader.dispose();
  }
}

// ── Activation ──────────────────────────────────────────────────────────────────

let current;

export function activate(context) {
  const regulations = context.services.get(RegulationServiceToken);
  const reader = createReader({
    fetch: (url, init) => globalThis.fetch(url, init),
    now: () => new Date(),
    site: () => context.services.getOptional(SiteServiceToken),
    log: (message) => context.logger.debug(message),
    roads: () => context.services.getOptional(RoadServiceToken),
    mapFeatures: () => context.services.getOptional(MapFeatureServiceToken),
    packageData: () => context.services.getOptional(SitePackageDataServiceToken),
    document: () => context.services.getOptional(DocumentServiceToken),
    ai: () => context.services.getOptional(AiServiceToken),
    translate: (key, params) =>
      context.services.getOptional(I18nServiceToken)?.translate(key, params),
    // 002.6a DEC-1: `getOptional` on each read — a host without the token answers `undefined`.
    pluginService: () => context.services.getOptional(PluginServiceToken)
  });
  // 002.4 DEC-2: the capture replays the host's own request (its `plotArea`).
  let lastRequest;
  // 002.8 DEC-7: and the host's last variation checks (their buildings), per variation id.
  const variationRequests = new Map();
  context.subscriptions.add(
    regulations.registerRegulationSource({
      id: SOURCE_ID,
      labelKey: LABEL_KEY,
      read: (request, readContext) => {
        lastRequest = request;
        return reader.read(request, readContext);
      },
      runAction: (request, actionContext) => reader.runAction(request, actionContext),
      // Review decision Q1: a late chapter asks the host to read again (SDK 1.28).
      onDidChange: (listener) => reader.onDidChange(listener),
      // Sprint 002.8 DEC-7: a parked variation, checked by the read's own pipeline (SDK 1.31).
      checkVariation: (request, variationContext) => {
        if (typeof request?.variationId === 'string') {
          variationRequests.set(request.variationId, {
            variationId: request.variationId,
            buildings: Array.isArray(request.buildings) ? request.buildings : []
          });
        }
        return reader.checkVariation(request, variationContext);
      },
      // Sprint 002.8 DEC-1: the assistant's four questions (SDK 1.32; offered with `ai`).
      questions: reader.questions
    })
  );
  // Sprint 002.3 (DEC-7): the programme warning, `urban-rules`' replacement.
  const ai = context.services.getOptional(AiServiceToken);
  if (typeof ai?.registerPlanningStage === 'function') {
    context.subscriptions.add(
      ai.registerPlanningStage(
        createProgrammeStage({
          facts: (view) => reader.programme(view),
          site: () => context.services.getOptional(SiteServiceToken),
          translate: (key, params) =>
            context.services.getOptional(I18nServiceToken)?.translate(key, params)
        })
      )
    );
  }
  // Sprint 002.4 DEC-2: the developer capture (needs `commands`, which nothing
  // else uses), registered only when the developer preference is on (Q8).
  let devCapture = false;
  try {
    devCapture =
      context.services.getOptional(PreferencesServiceToken)?.get(DEV_CAPTURE_PREFERENCE) === true;
  } catch (cause) {
    context.logger.debug(`${DEV_CAPTURE_PREFERENCE}: unreadable, off (${String(cause)})`);
  }
  if (devCapture && typeof context.commands?.register === 'function') {
    context.subscriptions.add(
      context.commands.register({
        id: CAPTURE_COMMAND_ID,
        titleKey: 'fr-urban-rules.dev.captureFixtures.title',
        categoryKey: LABEL_KEY,
        keywords: ['fixtures', 'capture', 'developer'],
        run: () => {
          captureFixtures(context, lastRequest, [...variationRequests.values()]).catch((cause) =>
            context.logger.error(`${CAPTURE_COMMAND_ID}: ${String(cause)}`)
          );
        }
      })
    );
  }
  // Sprint 002.11 DEC-4: a snapshot arriving outside a read (a project loaded
  // while the source was registered) asks the host to read again.
  const packageData = context.services.getOptional(SitePackageDataServiceToken);
  if (typeof packageData?.onDidChangeCache === 'function') {
    context.subscriptions.add(packageData.onDidChangeCache(() => reader.cacheChanged()));
  }
  // Disposed with the extension: no read outlives it, and no memory either.
  context.subscriptions.add({ dispose: () => reader.dispose() });
  current = reader;
}

export function deactivate() {
  current?.dispose();
  current = undefined;
}

export const __testing = {
  SOURCE_ID,
  checkedDocumentStatus,
  FETCHED_HOSTS,
  LINK_HOSTS,
  variationView,
  SOURCES,
  TYPEPSC_KEYS,
  TYPEZONE_KEYS,
  TYPESECT_KEYS,
  SUPTYPES,
  communeOf,
  centroidOf,
  preferredCommune,
  isoDate,
  idurbaDate,
  openRing,
  simplifyLine,
  simplifyRing,
  plotKey,
  plotGeometry,
  apiCartoRequest,
  gpuDocumentUrl,
  gpuFilesUrl,
  gpuFileHref,
  georisquesUrls,
  featureCollection,
  fetchJson,
  createReader,
  ARTICLES,
  R111_17,
  ADJOINING,
  boundaryEdges,
  insetByRole,
  triageOf,
  noDrawingOf,
  checkedReadingOf,
  conditionReadable,
  quantityIn,
  sentenceOf,
  scopeOf,
  usesOfCandidate,
  sdpOf,
  sdpHolds,
  projectCheck,
  projectWords,
  projectQuestionsOf,
  projectDecidedBy,
  projectOfferOf,
  areaBucketsOf,
  areaWords,
  natureFromValues,
  projectNatureOf,
  withProjectNature,
  withProjectAsked,
  isProjectNature,
  foldText,
  PROJECT_USES,
  PROJECT_WORKS,
  foldedSectors,
  sectorsDiffer,
  communesIn,
  storedResultOf,
  sheetOf,
  VOLUME_LIMITS,
  PLOT_PLAN_CATEGORIES,
  deriveRoles,
  sectionOf,
  withEdgeRole,
  withoutEdgeRole,
  endsKey,
  entrySubject,
  parsePrescriptionValue,
  drawnKey,
  createProgrammeStage,
  CAPTURE_COMMAND_ID,
  DEV_CAPTURE_PREFERENCE,
  recordingService,
  recordingFetch,
  PROCEDURE_ARTICLES,
  PROCEDURE_THRESHOLDS,
  subjectFieldsOf: subjectFields,
  checkedResult,
  normalisedPassage,
  checkedChapter,
  checkedLocation,
  chapterLookups,
  isNewerRuleKey,
  CHAPTER_WAIT_MS
};
