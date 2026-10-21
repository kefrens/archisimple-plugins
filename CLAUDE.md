# CLAUDE.md

Guidance for Claude Code when working in this repository.

This repo holds **ArchiSimple plugins**, one per folder — each an independently
distributable package:

```text
archisimple-plugins/
  CLAUDE.md
  fr-urban-rules/          one package
    package.json           the manifest
    src/index.js           the entry point
  sh3f-importer/           another package
    package.json
    src/index.js
```

That shape is not incidental. It is exactly the **multi-package Development
Repository** layout the application supports: add `archisimple-plugins/` **once**
in Preferences → Repositories → Add local folder, and every subfolder carrying a
`package.json` is discovered, installed and hot-reloaded as its own package.

The application itself lives at `../archisimple` (a sibling checkout). Nothing in
this repo builds against it, imports from it, or is part of its pnpm workspace.

---

## Vocabulary — get this right before writing anything

ArchiSimple distinguishes three things that everyday speech calls "a plugin":

| Term          | What it is                                                                                   | Built here?                                       |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Package**   | The distribution unit. A folder with a manifest; ships as a `.aspkg` archive.                | **Yes** — always                                  |
| **Extension** | A package that carries _code_: `type: "extension"`, with an `entryPoint` the host activates. | **Yes** — whenever there is behaviour             |
| **Plugin**    | `@archisimple/plugin-api` — in-app registration, compiled into the application.              | **No** — not distributable, lives in the app repo |

So: every folder here is a **package**. A folder with behaviour is an
**extension**. Use those words in code, commit messages and docs, even when the
user says "plugin".


---

## When a draft's shape changes, regenerate ArchiSimple's fixture

`apps/web/src/library/__tests__/fixtures/imported-library.json` over there is a
**capture of what `sh3f-importer` actually emits**, produced by running this
package's real entry point. It is the only thing that checks the two
repositories' mirrors agree — neither imports the other, and CI checks out one.

So after changing what a draft carries — a new field, a renamed payload key, a
different realisation — regenerate it:

```bash
cd ../archisimple && pnpm --filter import-capture run capture        # rewrite
cd ../archisimple && pnpm --filter import-capture run capture:check  # is it stale?
```

**It is a script, not a test, on purpose.** A CI test that skipped when this
checkout is absent would report green for something it did not do, which is worse
than no test.

---

## The one constraint that shapes everything

An extension developed here is loaded by reading its entry point's raw text and
evaluating it:

```js
import('data:text/javascript;charset=utf-8,<your source>');
```

Standard dynamic `import()` of a `data:` URL. **No bundler, no transpiler, no
`node_modules` resolution.** Two hard consequences:

1. **Write `.js`, not `.ts`.** Plain ES module JavaScript, evaluated exactly as
   written. TypeScript here is not "unsupported tooling" — it is a syntax error
   at load time.
2. **No bare specifier imports.** `import { ThemeServiceToken } from
'@archisimple/extension-sdk'` fails exactly as it would in a browser
   `<script type="module">`. There is nothing to resolve it against.

### How you reach services without importing the SDK

A service token is just `{ name: string }`, and the registry resolves **by that
name**. So this, written by hand with no import at all, resolves the same
service the SDK's exported token would:

```js
const ThemeServiceToken = { name: 'theme' };
const theme = context.services.get(ThemeServiceToken);
```

Well-known token names — read from `defineServiceToken(...)` in
`../archisimple/packages/extension-sdk/src/services.ts` (SDK 1.33, 2026-10-21; no token added since 1.28) and
`plugin-services.ts` beside it; diff against them when this table looks short:

| Service              | Token name          | Notes                                                                     |
| -------------------- | ------------------- | ------------------------------------------------------------------------- |
| Logging              | `logging`           | also on `context.logger`                                                  |
| Document             | `document`          | reads ambient; writes need the `document` capability                      |
| Selection            | `selection`         | read-only                                                                 |
| Commands             | `command`           | also on `context.commands`                                                |
| Resources            | `resource`          |                                                                           |
| Theme                | `theme`             | read + `onDidChange`; cannot switch the theme                             |
| Localization         | `i18n`              | `translate(key, params)`                                                  |
| Installed packages   | `package`           |                                                                           |
| Preferences          | `preferences`       | `get` / `set` / `delete`                                                  |
| Component Model      | `component-model`   | writes need the `components` capability                                   |
| Geo Map              | `geo-map`           | writes need the `geo` capability                                          |
| Map features         | `map-features`      | registering needs `map-features`; listing and querying do not (Sprint 081.1) |
| Terrain              | `terrain`           | registering needs `terrain`; listing does not                             |
| Vegetation (canopy)  | `vegetation`        | registering needs `vegetation`; listing does not (SDK 1.22)               |
| Roads                | `roads`             | registering needs `map-features`; listing and querying do not (SDK 1.23)  |
| Site                 | `site`              | **ambient**, read-only; resolve with `getOptional` (SDK 1.24)             |
| Regulations          | `regulations`       | registering needs `regulations`; listing does not (SDK 1.25). A source's `checkVariation` (1.31) needs nothing more; its `questions` (1.32) are offered only with `ai`, an answer's offer only with `document` |
| Site package data    | `site-package-data` | your own section only; reading ambient, `write` needs `document` (1.27); since 1.33 also your own **cache** — `readCache` ambient, `writeCache(data, attributions?)` needs `document`, off the history, write only when the reading changed — and `onDidChangeCache` |
| Plugin service       | `plugin-service`    | **ambient**, bound to your package; `locate()` → your companion's base URL or `undefined` (1.28) |
| Country profiles     | `country-profile`   | registering needs `country-profile`; listing does not                     |
| AI contributions     | `ai`                | registering needs the `ai` capability; listing does not                   |
| Asset catalogue      | `assets`            | registering needs the `assets` capability; listing does not               |
| Importers            | `importer`          | registering needs the `import` capability; listing does not               |
| Exporters            | `exporter`          | registering needs the `export` capability; listing does not               |
| Sheet exporters      | `sheet-exporter`    | registering needs the `export` capability; listing does not               |

`'site'`, `'regulations'`, `'site-package-data'`, `'sheet-exporter'` and
`'plugin-service'` are declared public ABI: an extension here writes them by hand.
[fr-urban-rules/](fr-urban-rules/) (0.5.0, Sprint 002.6a) is the reference for
finding its companion service with `getOptional` and `locate()` on each read,
and since 0.9.0 (Sprint 002.11, SDK 1.33) for keeping what it read in the Site
cache: a snapshot dated, fitted to a budget and said, restored at open, written
only when it changed (ADR-0115).

`context.commands` and `context.events` arrive **directly on the context** — no
token, no lookup.

> This constraint applies to packages developed _here_. An extension compiled
> into the application repo is real TypeScript importing
> `@archisimple/extension-sdk` by name, with a _symbolic_ `entryPoint` its module
> loader already knows. Do not copy that pattern into this repo.

---

## Anatomy of a package folder

```text
my-plugin/
  package.json             the manifest — the authoritative description
  src/index.js             entryPoint, plain ESM JavaScript (extensions only)
  resources/               themes, i18n, materials… (resource packages)
    themes/x.json
    i18n/my-plugin/en.json
  tests/package.test.mjs   runs under `node --test`, no install, no build
  icons/
  README.md
  CHANGELOG.md
  LICENSE
```

### The manifest

```json
{
  "schemaVersion": 1,
  "id": "com.example.my-plugin",
  "name": "Urban Rules",
  "version": "1.0.0",
  "author": "Arnaud",
  "description": "One sentence. Shown in the package list.",
  "type": "extension",
  "minimumApplicationVersion": "0.1.0",
  "sdkVersion": "1.0",
  "entryPoint": "src/index.js",
  "capabilities": ["commands", "events"],
  "dependencies": [],
  "resources": [],
  "overrides": []
}
```

- `schemaVersion` is the manifest schema (`1`), not the package's own `version`.
- `id` is dot/dash-separated alphanumeric segments; `version` is semver.
- `type`: `extension` when it carries code, `resource` when it carries only
  content (themes, translations, materials, templates, icons, textures).
- `sdkVersion` is `major.minor`, **not** semver. Read the current one from
  `SDK_VERSION` in `../archisimple/packages/extension-sdk/src/sdk-version.ts`
  rather than from this line (it said `1.1` long after `1.23`; it is **`1.33`**
  on 2026-10-21). A `1.0` extension runs on a `1.4` host (additive only); a
  different major is refused outright. Declare the minor that added the seam you
  use — `1.1` for an importer, `1.24` for the Site view, `1.25` for
  `regulations`, `1.27` for Site package data, `1.28` for the plugin service,
  `1.31` for a source's `checkVariation`, `1.32` for its `questions`, `1.33` for the Site cache and a source's `saved` state — so an older host refuses the
  manifest with a reason instead of handing you a runtime `undefined`.
- `entryPoint` here is a **path relative to the package root** (`src/index.js`),
  because that is what the Development Repository reads.
- A package declaring a **role** rather than content uses a `provides` block —
  e.g. `{ "roles": ["ai-provider"], "aiProviders": [{ "id": "…", "label": "…" }] }`.

Prefer generating the manifest over hand-writing it:

```bash
cd /Users/arnaud/Dev/IA/archisimple && pnpm build     # once
archisimple create package                             # interactive wizard, run from this repo
```

The wizard writes a manifest correct by construction and validates it on the
spot. Types: `empty`, `theme`, `extension`, `toolbar`, `resource-pack`,
`ai-provider`, `importer`, `exporter`, `inspector`, `command-pack`.

---

## The extension contract

```js
export function activate(context) {
  const { extension, services, commands, events, logger, subscriptions } = context;

  subscriptions.add(
    commands.register({
      id: 'my-plugin.checkSetback',
      titleKey: 'my-plugin.checkSetback.title',
      categoryKey: 'my-plugin.category',
      keywords: ['setback', 'zoning'],
      run: () => logger.info('checking setbacks')
    })
  );

  subscriptions.add(
    events.on('SelectionChanged', (event) => {
      logger.debug(`selection is now ${event.selectedIds.length} entities`);
    })
  );
}

export function deactivate() {}
```

- `activate` may be `async`; the host waits before considering the extension
  running.
- **Everything goes into `subscriptions`.** The host disposes the store on
  unload, so teardown is clean even if `deactivate` is omitted or throws. This is
  what makes hot reload work without leaking commands and handlers.
- The module may export `{ extension }`, `activate`/`deactivate`, or a default —
  the host accepts all three. Prefer named `activate`/`deactivate`.
- **Never register a command with literal display text.** `titleKey` and
  `categoryKey` are translation keys; ship the strings in
  `resources/i18n/<id>/en.json`.

### Events you can subscribe to

`ApplicationStarted`, `DocumentOpened`, `DocumentClosed`, `DocumentChanged`,
`ObjectCreated`, `ObjectDeleted`, `EntityModified`, `PropertyChanged`,
`TransactionCommitted`, `SelectionChanged`, `ThemeChanged`, `LanguageChanged`,
`PackageInstalled`.

### Writing to the document

```js
const doc = context.services.get({ name: 'document' });
doc.transact('Add setback marker', (editor) => {
  const id = editor.create({
    type: 'Annotation',
    properties: {/* … */}
  });
  editor.setProperty(id, 'label', { kind: 'string', value: 'setback' });
});
```

Requires the `document` capability. Every mutation is a transaction — one undo
entry, on the application's shared undo stack. There is no other way to change
the model, and reaching around this is not possible from an extension.

---

## Capabilities — declare exactly what you use

Read from `EXTENSION_CAPABILITIES` in
`../archisimple/packages/extension-sdk/src/capabilities.ts` (SDK 1.33, unchanged since 1.25 — 1.33's `writeCache` reuses `document`;
2026-10-21):

| Capability        | Actually grants something today                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| `commands`        | ✅ `context.commands.register()`                                                    |
| `events`          | ✅ `context.events.on()`                                                            |
| `document`        | ✅ document **writes** (`transact`), and since SDK 1.27 your Site section's `write`, since 1.33 its cache's `writeCache` |
| `components`      | ✅ registering components and entity kinds                                          |
| `geo`             | ✅ contributing base-map layers (and a profile's geocoder)                          |
| `ai`              | ✅ contributing Skills and planning stages (Sprint 28.3), and a regulation source's questions to the assistant (096.12, SDK 1.32) |
| `assets`          | ✅ contributing Library asset definitions (Sprint 040.4)                            |
| `import`          | ✅ registering an importer (Sprint 041.1)                                           |
| `export`          | ✅ registering an exporter or a sheet exporter (Sprint 044.0, 080.5)                |
| `map-features`    | ✅ registering queryable feature sources, and road sources (Sprint 081.1, 095.15)   |
| `terrain`         | ✅ registering elevation providers (Sprint 081.3)                                   |
| `country-profile` | ✅ registering a country profile (Sprint 082.3); grants no network of its own       |
| `vegetation`      | ✅ registering canopy sources (Sprint 095.11)                                       |
| `regulations`     | ✅ registering a regulation source (Sprint 096.2, SDK 1.25)                         |

**Reserved, and grant nothing yet**: `rendering`, `properties`, `object-types`,
`generators`. They are valid in a manifest and parse fine — but no service is
gated on them, so declaring one buys you nothing today. Do not design a package
around one of these expecting it to work.

> `import` and `export` were on that list until Sprints 041.1 and 044.0. Each
> now gates its registration; listing what is registered stays ambient.

The **Site** (`site`, SDK 1.24) is read-only and ambient: no capability. A
regulation source (`regulations`, SDK 1.25) gets the Site view in each read and
converts through the Site service; [fr-urban-rules/](fr-urban-rules/) is the
working reference.

Read-only observation (logging, preferences, package, document, selection,
resource, theme, i18n, component model, geo map) is **ambient** — always
available, no capability needed. An extension may read the active theme and
react to it changing; it may not switch the theme out from under the user.

Two different failure modes, worth knowing apart:

- **Using an undeclared capability** → the call is dropped and reported
  (`undeclared-capability`). The extension keeps running.
- **Declaring a capability the SDK does not define** → the manifest is refused
  (`unknown-capability`) and the extension does not load at all. A typo fails
  loudly at parse time.

Declaring one you do not use is harmless, but don't.

---

## The development loop

1. **Add the repository, once.** In ArchiSimple: Preferences → Repositories →
   Add local folder → pick `archisimple-plugins/`. Every subfolder is discovered.
   _Requires a Chromium-based browser_ (File System Access API).
2. **Edit `src/index.js` and save.** A poller notices the folder changed (there
   is no filesystem-watch API reachable from a directory handle), re-reads the
   manifest, reinstalls the package, re-evaluates the entry point, deactivates
   the running extension and activates the new one.
3. **Watch the diagnostics.** Preferences → Development Repository shows
   status, `lastReloadAt` and any message. `Validate` there is a dry run.
4. **Run the starter test** — no install, no build:
   ```bash
   # From THIS folder, not from inside the package. Volta reads the nearest
   # package.json and cannot parse an ArchiSimple manifest — its `name` is a
   # display name ("Urban Rules"), not an npm name.
   node --test my-plugin/tests/package.test.mjs
   ```
5. **Validate and ship:**
   ```bash
   archisimple package validate ./my-plugin
   archisimple package build    ./my-plugin --out dist
   ```
   `build` validates first and writes nothing if validation fails. Exit codes:
   `0` ok, `1` not distributable, `2` bad usage. `--json` for CI.

A missing dependency is a _warning_ by default, because a project folder cannot
know what will already be installed where it lands. Point at a folder of
packages to make it a hard failure:

```bash
archisimple package build ./my-plugin --out dist --repository ../archisimple/content
```

`.aspkg` is a ZIP with stored (uncompressed) entries and deterministic bytes —
the same project always hashes the same.

---

## Rules inherited from the platform

These are not this repo's preferences; they are what the host enforces.

- **The SDK is the entire surface.** An extension never imports an application
  package, never reaches internal state, never depends on how the app is built
  today. There is no escape hatch, by design.
- **No hardcoded user-visible strings.** Commands carry `titleKey` /
  `categoryKey`; text ships as i18n resources.
- **No hardcoded colours.** Read design tokens through the theme service.
- **Derive, don't duplicate.** Never cache a value the model can compute.
- **Failure is isolated.** A malformed manifest, an incompatible `sdkVersion`, a
  missing entry point, a throwing `activate` or a throwing event handler costs
  _that package and nothing else_ — it is reported by id and the application
  starts without it. Don't write defensive scaffolding for this; it exists.
- **Distribution and execution are separate concerns.** The Package Manager
  installs; the Extension Host runs. A package is valid or not independently of
  whether its code works.

---

## Contributing AI knowledge (`ai` capability)

Since Sprint 28.3 (ADR-0028) a package can contribute **deterministic knowledge**
to the AI platform. Two kinds, one service, gated by the `ai` capability:

```js
const AiExtensionServiceToken = { name: 'ai' };

export function activate(context) {
  const ai = context.services.get(AiExtensionServiceToken);

  // A Skill: pure, synchronous, resolved by id like any built-in.
  context.subscriptions.add(
    ai.registerSkill({
      id: 'my-plugin.maxBuildableArea',
      summary: 'Compute the maximum buildable floor area on a plot.',
      execute: (input, skillContext) => ({ ok: true, value: input.plot * 0.4 })
    })
  );

  // A planning-stage enricher: artefact in, richer artefact out.
  context.subscriptions.add(
    ai.registerPlanningStage({
      id: 'my-plugin.programme',
      stage: 'programme', // 'brief' | 'programme' | 'layout' | 'geometry'
      enrich: (programme, knowledge) => ({
        ...programme,
        warnings: [...programme.warnings, 'exceeds the local plan']
      })
    })
  );
}
```

Rules the host enforces, not suggests:

- **Return a new object; never mutate.** The artefact is deep-frozen before you
  see it, so a write throws and your provider is dropped for that call. Spreading
  the input is the way; `programme.warnings.push(...)` is not.
- **Stay synchronous.** An `async` skill is refused at registration. Asynchrony
  implies I/O, and a capability needing I/O is a Provider, not a Skill.
- **50 ms budget per enrichment.** Over it, you are dropped and reported.
- **Abstain by returning the input** unchanged.
- **You get a snapshot, not a service.** `knowledge` is frozen plain data —
  `roomCount`, `rooms`, `totalFloorAreaSquareMetres`, `wallCount`,
  `loadBearingWallCount`, `storeyCount`. There is nothing callable on it.
- **Ids are namespaced by convention** (`fr-urban-rules.programme`); duplicates are
  refused across every registered provider.
- **Listing is ambient.** `listSkills()` / `listPlanningStages()` work without the
  `ai` capability; only registering needs it.

Enrichment always runs **before** the user sees the proposal, and the ids that
touched an artefact are recorded on it, so the card can name you. You contribute
what you know — never what happens.

[fr-urban-rules/](fr-urban-rules/) is the working reference for the planning-stage
seam (`fr-urban-rules.programme`, Sprint 002.3); no package here contributes a
Skill since `urban-rules` was retired (002.3 DEC-7, DEC-8).

The same `ai` capability lets a **regulation source's questions** reach the
assistant (SDK 1.32, platform 096.12): `questions` on the source registered with
`regulations`, each `answer(input)` **synchronous** within 250 ms on a
deep-frozen `{ args, report, site, variationId, sectionData }` (the budget is
measured, not enforced: a loop hangs the editor), answering claims —
`basis: 'rule'` with a `ruleId` the host cites, `'measured'`, `'report'` — never
a citation or a passage of your own; up to three *Interpretation* phrases; and
one optional `offer`, your next Site section, which the host proposes (it needs
`document`). A tool name is `regulations_<id>`, `[a-z0-9_]{1,40}`.
[fr-urban-rules/](fr-urban-rules/) is the reference (Sprint 002.8).

---

## What you cannot build here today

Check this list before promising a capability:

- **An AI provider with its own code.** A package can _declare_ an AI provider
  through a `provides` block, but the adapter that talks to a model lives in
  `@archisimple/ai-engine` inside the application repo. The `ai` capability
  contributes knowledge, not providers.
- **A custom renderer.** `packages/rendering` publishes no provider interface and
  the `rendering` capability has no service behind it.
- **Property panels, object types, generators.** Reserved capabilities, no
  extension point wired yet. (Import and export formats are wired: see the
  capability table.)
- **An `ArchitecturalOperationProvider`.** Stage providers enrich; operation
  providers emit `CommandRequest`s. Sprint 28.3 exposed the first and
  deliberately not the second (ADR-0028 Rule 4).
- **Anything touching the Automation API directly.** Extensions do not get a
  `CommandDispatcher`. Document writes go through `document.transact`.

When a request needs one of these, say so plainly and propose the alternative:
either the capability gets wired in the application repo first (a sprint + ADR
there), or the feature ships as part of the app rather than as a package.

---

## Reference material in the application repo

Everything below is at `../archisimple`:

| Path                                         | What it gives you                                                 |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `docs/sdk/00-getting-started/hot-reload.md`  | Why plain JS and the token-name contract. **Read this first.**    |
| `docs/sdk/01-concepts/extension-sdk.md`      | The contract, capabilities, versioning, isolation.                |
| `docs/sdk/02-guides/`                        | Per-template guides: commands, toolbars, views, themes, settings… |
| `docs/sdk/03-cookbook/`                      | Task recipes: add a command, a menu, a dialog, persist settings.  |
| `docs/sdk/06-cli/`                           | Full CLI reference, including the Project Importer.               |
| `docs/guidelines/extension-guidelines.md`    | The authoritative capability and isolation tables.                |
| `docs/guidelines/package-guidelines.md`      | Field-by-field manifest table; what the builder checks, how hard. |
| `examples/example-command-pack/src/index.js` | The shortest correct extension. Read it before writing a new one. |
| `examples/`                                  | Also toolbar, importer, exporter examples — same shape.           |
| `packages/extension-sdk/src/`                | The source of truth for tokens, events, capabilities, types.      |
| `CLAUDE.md`                                  | The application's own architecture rules.                         |

---

## Services — server-side code that is not a package

Since Sprint 002.5a, [services/](services/) holds the repository's
**companion services** (platform ADR-0114): Node programs the deployment runs
in one `plugin-services` container, never zipped, installed or loaded into the
editor. A package and its service meet only over HTTP, at
`/plugins-api/<package id>/` on the editor's origin.

```text
services/
  Dockerfile                  the plugin-services image, built from the PARENT folder
  gateway/                    mounts each service by package id; health; path safety
  fr-urban-rules-service/     com.archisimple.fr-urban-rules's service (pdfjs-dist)
```

- **Two levels down, on purpose.** The Development Repository treats every
  _immediate_ subfolder holding a `package.json` as a package, and
  `tools/build-index.mjs` every one whose `package.json` has an `id`. So
  `services/` itself has no `package.json`, a service's is a plain npm
  manifest (`"private": true`, no `id`, `"archisimple": { "packageId" }`),
  and there is **never** a root `package.json`.
  `services/gateway/tests/discovery.test.mjs` copies both rules and checks.
- **Node ≥ 22.13**, not the browser's rules: a service may have npm
  dependencies (exact pins, committed lockfile, installed with
  `npm ci --omit=dev --omit=optional`). Still plain `.mjs`, no build step.
  `publish-index.yml` runs on Node 22 for this reason, and runs the services'
  tests and `npm audit` on every push to `main`.
- **Tests use globs**: `node --test 'services/*/tests/*.test.mjs'`, from this
  folder. No test touches the network.
- **A service holds no model key** and reads no `AI_PROVIDER_*` variable; it
  reaches `ai-service` by `ARCHISIMPLE_AI_SERVICE_URL` (ADR-0114 Rule 7).
- **Its hosts are its own allow-list**: the deployment does not filter
  egress. The service's README lists them, with its limits and variables.
- Recorded fixtures live in `test-fixtures/<package>/`, as for packages.

## Conventions for this repo

- **`test-fixtures/` is deliberately not a package.** It holds recorded answers a
  package's tests read (`test-fixtures/<package>/…`), kept outside the package
  folder because the package builder has no exclude list: inside, they would
  ship in the `.aspkg` (3.3 MB for `fr-urban-rules`, against 0.16 MB without).
  It carries no `package.json`, so neither the Development Repository nor
  `tools/build-index.mjs` treats it as one. Never add a manifest there.

- **Folder name = the package's short name**, kebab-case: `assistant-builder`,
  `fr-urban-rules`. The manifest `id` is the reverse-DNS form.
- **Command ids are namespaced by package**: `fr-urban-rules.…`. Same for
  translation keys.
- Each package is self-contained: no shared `node_modules`, no cross-folder
  imports, no build step. If two packages need the same helper, copy it — a
  package that cannot be zipped and installed on its own is not a package.
- Conventional Commits, scoped by package: `feat(fr-urban-rules): …`.
