# ArchiSimple Plugins

Distributable packages for [ArchiSimple](https://github.com/kefrens/archisimple)
— one folder per package, each independently installable.

Nothing here is part of the application's build. These packages are written
against the **Extension SDK** and loaded by the running application, which is
the same path any third-party package takes.

```text
archisimple-plugins/
  urban-rules/            one package
    package.json          the manifest — the authoritative description
    src/index.js          the entry point, plain ESM JavaScript
    tests/                runs under `node --test`, no install, no build
  sh3f-importer/          another
  docs/                   design notes and extension ADRs
```

That shape is not incidental: it is the multi-package **Development Repository**
layout the application supports. Add this folder **once** in Preferences →
Repositories → Add local folder, and every subfolder carrying a `package.json`
is discovered, installed and hot-reloaded as its own package.

---

## Packages

| Package                        | Type      | What it does                                                                                     |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------ |
| [urban-rules/](urban-rules/)   | extension | Applies local planning limits — site coverage, buildable floor area, storey caps — to the Space Programme, before any geometry exists. The reference for contributing knowledge to the planning pipeline. |
| [sh3f-importer/](sh3f-importer/) | extension | Imports Sweet Home 3D furniture libraries (`.sh3f`) into the Library — categories, metre dimensions, plan icons, doors and windows, and the licence each entry carries. The reference for contributing an **importer**, and the proof that a format needs no change to the application. |

---

## Vocabulary

ArchiSimple distinguishes three things everyday speech calls "a plugin". Getting
this right saves confusion later:

| Term          | What it is                                                                        | Built here?                                       |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Package**   | The distribution unit. A folder with a manifest; ships as a `.aspkg` archive.     | **Yes** — always                                  |
| **Extension** | A package that carries _code_: `type: "extension"` with an `entryPoint`.          | **Yes** — whenever there is behaviour             |
| **Plugin**    | `@archisimple/plugin-api` — in-app registration, compiled into the application.   | **No** — lives in the application repo            |

So every folder here is a **package**; a folder with behaviour is an
**extension**.

---

## The one constraint that shapes everything

An extension developed here is loaded by reading its entry point's raw text and
evaluating it as a module:

```js
import('data:text/javascript;charset=utf-8,<your source>');
```

Standard dynamic `import()` of a `data:` URL. **No bundler, no transpiler, no
`node_modules` resolution.** Two hard consequences:

1. **Write `.js`, not `.ts`.** Plain ES module JavaScript, evaluated exactly as
   written. TypeScript here is a syntax error at load time.
2. **No bare specifier imports.** `import … from '@archisimple/extension-sdk'`
   fails exactly as it would in a browser `<script type="module">` — there is
   nothing to resolve it against.

Services are still reachable, because a service token is just `{ name: string }`
and the registry resolves by that name:

```js
const ThemeServiceToken = { name: 'theme' };
const theme = context.services.get(ThemeServiceToken);
```

Well-known token names: `logging`, `document`, `selection`, `command`,
`resource`, `theme`, `i18n`, `package`, `preferences`, `component-model`,
`geo-map`, `ai`. `context.commands` and `context.events` arrive directly on the
context, no lookup needed.

---

## The extension contract

```js
export function activate(context) {
  const { services, commands, events, logger, subscriptions } = context;

  subscriptions.add(
    commands.register({
      id: 'urban-rules.checkSetback',
      titleKey: 'urban-rules.checkSetback.title',
      categoryKey: 'urban-rules.category',
      run: () => logger.info('checking setbacks')
    })
  );
}

export function deactivate() {}
```

**Everything goes into `subscriptions`.** The host disposes the store on unload,
so teardown is clean even if `deactivate` is omitted or throws — that is what
makes hot reload work without leaking commands and handlers.

Commands carry `titleKey` / `categoryKey`, never literal display text; the
strings ship as i18n resources.

### Capabilities

Declare exactly what you use. Read-only observation is **ambient** and needs
nothing.

| Capability   | Grants                                                  |
| ------------ | ------------------------------------------------------- |
| `commands`   | `context.commands.register()`                           |
| `events`     | `context.events.on()`                                   |
| `document`   | Document **writes** (`transact`). Reading is ambient.   |
| `components` | Registering components and entity kinds                 |
| `geo`        | Contributing base-map layers                            |
| `ai`         | Contributing Skills and planning stages (ADR-0028)      |

`import`, `export`, `rendering`, `properties`, `object-types` and `generators`
are reserved: valid in a manifest, but no service is gated on them yet.

Using an **undeclared** capability drops that call and reports it; the extension
keeps running. Declaring an **unknown** one refuses the manifest outright, so a
typo fails loudly at parse time.

---

## Development loop

1. **Add the repository, once.** ArchiSimple → Preferences → Repositories → Add
   local folder → pick this folder. _Requires a Chromium-based browser_ (File
   System Access API).
2. **Edit `src/index.js` and save.** A poller notices, re-reads the manifest,
   reinstalls the package, deactivates the running extension and activates the
   new one.
3. **Watch the diagnostics.** Preferences → Development Repository shows status,
   `lastReloadAt` and any message. `Validate` there is a dry run.
4. **Run the tests** — no install, no build:
   ```bash
   node --test urban-rules/tests/package.test.mjs
   ```
5. **Validate and ship:**
   ```bash
   archisimple package validate ./urban-rules
   archisimple package build    ./urban-rules --out dist
   ```

`build` validates first and writes nothing if validation fails. An `.aspkg` is a
ZIP with stored (uncompressed) entries and deterministic bytes — the same
project always hashes the same.

The `archisimple` CLI comes from the application repo:

```bash
cd ../archisimple && pnpm build     # once
archisimple create package          # interactive manifest wizard
```

---

## Publishing, so a deployment can install these

The development loop above needs a local folder and a Chromium file picker, so it
reaches exactly one machine. A **deployed** ArchiSimple — a Docker image on a NAS,
say — has no folder to point at, and with no importer installed
`File → Import library` is correctly greyed out: nothing there can read a library.

The answer is a **remote repository** (ADR-0025). These plugins are built into
`.aspkg` archives and published with an `index.json`; a user adds that URL under
Preferences → Repositories and installs from it. ADR-0025's position is that "a
Marketplace is simply another implementation of `PackageRepository`", so nothing
about the install path is special — the pipeline that installs a bundled theme
installs a downloaded one.

```bash
# Build every plugin here, and the index that advertises them.
node tools/build-index.mjs --cli ../archisimple/tools/cli/dist/archisimple.js

# Check the result with the platform's own parser, not a schema restated here.
node tools/check-index.mjs --platform ../archisimple
```

`.github/workflows/publish-index.yml` does both on every push to `main` and
publishes `dist/` to GitHub Pages.

**It needs one secret.** `kefrens/archisimple` is private, and a workflow's
automatic `GITHUB_TOKEN` is scoped to the repository running it — so the
platform checkout needs a token of its own:

| | |
| --- | --- |
| Secret | `PLATFORM_REPO_TOKEN` |
| Kind | fine-grained personal access token |
| Access | **read-only** `Contents` on `kefrens/archisimple`, nothing else |

Read-only is enough: the workflow only reads the platform, and writes solely to
this repository's Pages. Also enable **Settings → Pages → Source: GitHub
Actions** here.

Without the secret the checkout fails with `Not Found` while retrieving the
default branch — GitHub's answer for a private repository the caller cannot see,
which reads like a misspelled repository name and is not. The workflow checks for
the secret first and says so plainly.

**The builder is not reimplemented here, and must not be.** The archive format,
its determinism and its SHA-256 belong to `@archisimple/package-builder`, reached
through `@archisimple/cli` — which is why the workflow checks out the platform
rather than installing something: both are private and unpublished. A second
implementation of the `.aspkg` format would drift from the real one and surface
as a checksum mismatch on a user's machine. The platform's Finding I-82 is four
sprints lost to that mistake in a quieter place.

`download` in the index is **relative**, and the platform resolves it against the
URL the index was fetched from. So the same `dist/` works from GitHub Pages, from
a release, or from any folder something serves — no build-time knowledge of where
it will live.

## Rules inherited from the platform

Not this repo's preferences — what the host enforces.

- **The SDK is the entire surface.** An extension never imports an application
  package and never reaches internal state. There is no escape hatch, by design.
- **No hardcoded user-visible strings**, and **no hardcoded colours** — read
  design tokens through the theme service.
- **Derive, don't duplicate.** Never cache a value the model can compute.
- **Failure is isolated.** A malformed manifest, an incompatible `sdkVersion`, a
  missing entry point or a throwing `activate` costs _that package and nothing
  else_. Don't write defensive scaffolding for this; it already exists.
- **Distribution and execution are separate.** The Package Manager installs; the
  Extension Host runs. A package is valid or not independently of whether its
  code works.

---

## Conventions

- Folder name is the package's short name in kebab-case; the manifest `id` is
  the reverse-DNS form (`com.archisimple.urban-rules`).
- Command ids and translation keys are namespaced by package.
- Each package is self-contained: no shared `node_modules`, no cross-folder
  imports, no build step. If two need the same helper, copy it — a package that
  cannot be zipped and installed on its own is not a package.
- Conventional Commits, scoped by package: `feat(urban-rules): …`.

---

## Reference material

In the application repo at `../archisimple`:

| Path                                         | What it gives you                                              |
| -------------------------------------------- | -------------------------------------------------------------- |
| `docs/sdk/00-getting-started/hot-reload.md`  | Why plain JS and the token-name contract. **Read this first.** |
| `docs/sdk/01-concepts/extension-sdk.md`      | The contract, capabilities, versioning, isolation.             |
| `docs/sdk/03-cookbook/`                      | Task recipes: add a command, a menu, a dialog, settings.       |
| `docs/guidelines/extension-guidelines.md`    | The authoritative capability and isolation tables.             |
| `docs/guidelines/package-guidelines.md`      | Field-by-field manifest table; what the builder checks.        |
| `examples/example-command-pack/src/index.js` | The shortest correct extension.                                |
| `packages/extension-sdk/src/`                | Source of truth for tokens, events, capabilities, types.       |
