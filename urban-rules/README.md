# Urban Rules

Applies local planning limits — site coverage, buildable floor area and storey
caps — to the **Space Programme**, before any geometry exists.

Built against ArchiSimple's AI extension points (Sprint 28.3, ADR-0028). It is
the reference for contributing *knowledge* to the planning pipeline.

## What it contributes

| Kind                       | Id                             | What it does                                                     |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| Skill                      | `urban-rules.maxBuildableArea` | Plot area × site coverage × permitted storeys → max floor area.  |
| Planning-stage provider    | `urban-rules.programme`        | Records the limits on the programme and warns when it exceeds them. |

Both require the `ai` capability. Remove it from the manifest and both
registrations are dropped with a diagnostic — the application still plans
normally, it just stops knowing about your local plan.

## Configuration

Preferences → Plugins → Urban Rules:

| Preference             | Default | Meaning                                          |
| ---------------------- | ------- | ------------------------------------------------ |
| `plotAreaSquareMetres` | `500`   | The site's total area.                           |
| `siteCoverageRatio`    | `0.4`   | Fraction of the plot the footprint may cover.    |
| `maxStoreys`           | `2`     | Storeys permitted by the local plan.             |

With the defaults: 500 m² × 40% = 200 m² footprint, × 2 storeys = **400 m²**
buildable. A programme totalling more than that is approved with a warning
attached, not refused — the plugin states the constraint; the architect decides.

## What it cannot do

It cannot draw, move or delete anything, and that is by design. A stage provider
receives an artefact and a read-only snapshot and returns an artefact. Whether
that becomes a wall is three stages away and the user's decision, through the one
approval mechanism (ADR-0027.1 Rules 1 and 7).

It also cannot reach the network. The rules are a table in `src/index.js`, which
is what keeps `maxBuildableArea` a **Skill** — pure and synchronous. The day it
needs a live cadastre lookup it must become a Provider instead; the host refuses
an async skill at registration rather than letting that happen quietly.

## Developing

```bash
# From this repo's root — Volta cannot parse an ArchiSimple manifest, so run
# node from outside the package folder.
node --test urban-rules/tests/package.test.mjs
```

Then in ArchiSimple: Preferences → Repositories → Add local folder → pick the
`archisimple-plugins/` folder. Edit `src/index.js`, save, and the next generated
Space Programme reflects the change.

## Packaging

```bash
archisimple package validate ./urban-rules
archisimple package build    ./urban-rules --out dist
```
