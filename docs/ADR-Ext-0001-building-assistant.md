# ADR-Ext-0001 --- Building Assistant

**Status:** Proposed

---

**ADR ID** ADR-Ext-0001
**Title** Building Assistant --- A Whole-Pipeline Knowledge Pack, Not an Orchestrator
**Status** Proposed
**Date** 2026-08-07
**Revision** 1.0
**Package** `building-assistant` (`com.archisimple.building-assistant`)
**Supersedes** ---

---

# Requirements

Before implementing this ADR review:

- `archisimple-plugins/CLAUDE.md` --- the package/extension vocabulary and the
  hot-reload constraint that forbids TypeScript and bare specifiers here
- `../archisimple/docs/adr/0027-AI-Skills-Platform.md` --- what a Skill is
- `../archisimple/docs/adr/0027.1-North-Star-Architectural-Intelligence-Planning-Pipeline.md`
  --- the four artefacts and the thirteen rules that govern them
- `../archisimple/docs/adr/0028-ai-extension-points.md` --- the seam this package
  consumes, and the ten rules it must satisfy
- `../archisimple/packages/extension-sdk/src/ai.ts` --- the authoritative shape of
  `ContributedSkill`, `ContributedPlanningStage` and `PlanningKnowledge`
- `archisimple-plugins/urban-rules/src/index.js` --- the working reference for
  both seams

---

# Summary

The Building Assistant is a package that accompanies a design **through all four
planning artefacts** --- Architectural Brief, Space Programme, Layout Plan and
Geometry Graph --- contributing a consistent body of residential-typology
knowledge at each one.

It is deliberately **not** an orchestrator. The request that prompted this ADR
asked for an extension that _drives_ the pipeline end to end. That is not
buildable from a package today and, on the evidence below, should not become
buildable in this shape: sequencing the pipeline requires an execution seam
(ADR-0028 Rule 4 denies it) and would require approving intermediate artefacts
on the user's behalf (ADR-0027.1 Rule 7 forbids a second approval mechanism).

What survives that constraint is the more useful half. The pipeline's weakness is
not that a human has to press four buttons; it is that each of the four
generations is currently informed by nothing but the utterance and the model. An
extension present at every stage, saying the same things about the same
typology, is continuity --- which is what "orchestration" was actually reaching
for.

**The assistant contributes what it knows at every stage. The host still decides
what happens.**

---

# Context

## Background

Sprint 28.3 (ADR-0028) opened two extension points to installed packages: the
Skill Registry and the planning-stage seam on `ArchitecturalPlanner`.
`urban-rules` was the first consumer and exercises both --- but only on the
`programme` stage, and only as a constraint check.

It leaves three questions unanswered, and they are the reason this ADR exists:

1. Does a **single package enriching all four stages** stay coherent, given that
   each `enrich` call receives only `(artefact, knowledge)` and no memory of what
   the same package said one stage earlier?
2. Does a package have anything useful to say **before** constraints exist ---
   on the `brief`, where there are no numbers to check yet?
3. Where exactly does contributable knowledge stop being knowledge? The
   `geometry` stage is the first place a contribution has spatial consequences.

## What exists

| Piece                                     | State                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `AiExtensionService` (`{ name: 'ai' }`)   | Implemented, Sprint 28.3. `registerSkill`, `registerPlanningStage`.     |
| Four contributable stages                 | `brief`, `programme`, `layout`, `geometry` (the Geometry _Graph_).      |
| `PlanningKnowledge` snapshot              | Frozen plain data: rooms, areas, wall counts, storeys. Nothing callable. |
| Packing strategy                          | A **first-party Skill**, `packages/skills/src/geometry-realisation/`.   |
| `ArchitecturalOperationProvider`          | Exists; **not** exposed to the SDK (ADR-0028, deliberate).              |
| Geometry Graph → walls (the Geometry Plan) | **Not implemented** anywhere.                                           |

## Motivation

The five things the request named --- brief, space programme, layout, planning,
packing strategy --- are not five peers, and conflating them is the first thing
this ADR has to correct:

| Named          | What it actually is                                                                          | Contributable?                                   |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Brief          | Artefact 1, stage `brief`                                                                    | Yes --- enrich                                   |
| Space Programme | Artefact 2, stage `programme`                                                                | Yes --- enrich                                   |
| Layout         | Artefact 3, stage `layout`                                                                   | Yes --- enrich                                   |
| "Planning"     | The pipeline itself --- classification, synthesis, approval. Host-owned.                     | **No** --- it is the thing doing the sequencing  |
| Packing strategy | A Skill consumed _during_ Geometry Graph synthesis, before `enrich` runs                   | **No** --- see Rule 6                            |

The `geometry` stage provider is handed a Geometry Graph that has **already been
packed**. `ArchitecturalPlanner.enrich` runs on the synthesised artefact, so
selecting or replacing the packing strategy is not reachable from a package. An
enricher may evaluate the packing it was given; it cannot choose it.

## Constraints

- **No execution seam.** No `CommandDispatcher`, no `Proposal`, no document
  handle reaches an enricher (ADR-0028 Rule 4). The package therefore cannot
  trigger a stage, cannot approve an artefact, and cannot turn a Geometry Graph
  into walls.
- **No cross-stage channel.** `enrich(artefact, knowledge)` is the entire input.
  There is no per-session context, and the four calls may be separated by
  minutes, revisions or a reload.
- **Frozen input, fresh output.** The artefact is deep-frozen; a mutation drops
  the provider for that call (ADR-0028 Rule 5).
- **Synchronous, 50 ms per enrichment.** Over budget is a drop, reported by id.
- **Plain ES module JavaScript.** Hot-reloaded from a `data:` URL --- no
  TypeScript, no bare specifiers, tokens written out by hand.
- **ADR-0027.1 Rule 3.** One responsibility per artefact. A Brief carrying
  coordinates is malformed, and an enricher is fully capable of malforming one.
- **ADR-0027.1 Rule 13.** Optimisation revises an artefact; it never adds a stage
  and never reads the stage above.

---

# Decision

**The `building-assistant` package shall register one planning-stage enricher on
each of the four stages, plus the Skills those enrichers compute with, and shall
sequence nothing.**

Each enricher is a **pure function of the artefact it is handed**. The
assistant's continuity across stages comes from re-deriving the same typology
model from each artefact independently --- never from state carried between
calls. Two enrichers agree because they reason identically about the same
design, not because one told the other.

The package declares `ai` and nothing else.

---

# Rules

Numbered so later revisions and the package's own tests can cite them, in the
convention of ADR-0022, ADR-0027.1 and ADR-0028.

## Rule 1 --- The assistant contributes to every stage and sequences none

Four enrichers, four independent registrations. The package holds no notion of
"the current stage", exposes no `run()`, and registers no command that starts a
generation. The host classifies, synthesises, enriches and asks for approval, in
that order, exactly as it does with no packages installed.
**Testable**: the package's public surface contains no function that calls
anything.

## Rule 2 --- No cross-stage state

No module-level mutable variable outlives an `enrich` call. Typology, room
mix and circulation allowance are **re-derived from the artefact on every call**.

This is the rule most likely to be broken for convenience and the one that
matters most. A cached verdict from the `programme` stage read during `layout`
is stale the moment the programme is revised --- the same reason layout quality
and packing evaluation are deliberately not persisted in their artefacts. Caching
across stages would reintroduce the failure the pipeline was designed to prevent,
inside a package the host cannot inspect.
**Testable**: two `enrich` calls in either order produce identical output.

## Rule 3 --- One namespace, one id per contribution

`building-assistant.brief`, `.programme`, `.layout`, `.geometry` for stages;
`building-assistant.<verb><Noun>` for skills. Ids are unique across **all**
registered providers, operation and stage alike (ADR-0028 Rule 8), and ownership
travels in the id because the shared service instance cannot attribute a call to
a caller.

## Rule 4 --- An enricher never writes above its stage's responsibility

The `brief` and `programme` enrichers emit **no geometry of any kind** --- no
coordinate, no dimension, no adjacency graph. The `layout` enricher emits no wall
thickness. This is ADR-0027.1 Rule 3 restated as a package obligation, because
the host validates artefact _shape_, not artefact _propriety_: a Brief with a
`spaces` array full of rectangles would pass Rule 5's structural check and be
architecturally wrong.
**Testable**: a schema assertion per stage over the diff the enricher produces.

## Rule 5 --- Every contributed number comes from a Skill

If the assistant states a figure --- a circulation allowance, a minimum room
dimension, a storey balance --- that figure is produced by a Skill it registered
or by one the platform already publishes. No arithmetic is inlined in `enrich`.

This is ADR-0027.1 Rule 9 (deterministic computation belongs to Skills) applied
downward, and it is what makes the assistant auditable: every number it adds is
independently invocable by id, with the same inputs, outside any pipeline run.

## Rule 6 --- The assistant never re-implements platform computation

Area, geometry, unit and spatial maths already exist and are not reproduced here
(ADR-0027). **Packing in particular**: `packing-strategy`, `packing-evaluation`
and `packing-conformance` are first-party Skills consumed during Geometry Graph
synthesis, which completes _before_ `enrich` is called. The `geometry` enricher
may therefore comment on the packing it was handed --- it may not select,
parameterise or replace it. A package that wants to influence packing is asking
for an extension point that does not exist; see _Future Evolution_.

## Rule 7 --- Abstain by returning the input

Unrecognised typology, missing figures, an artefact shape the assistant does not
understand --- return the input object unchanged. Abstention is a normal,
frequent outcome and is always preferable to a guess, because a guess made at the
`brief` stage propagates through three more artefacts before anyone sees a plan.

## Rule 8 --- Every contribution is self-describing

Text the assistant adds names the assistant. "Assumes a 12% circulation
allowance (Building Assistant)" is a contribution; "assumes 12% circulation" is
an anonymous claim the user will attribute to the application. ADR-0028 Rule 10
records _which_ providers touched an artefact; this rule makes the artefact
readable without that record.

## Rule 9 --- Degrade to nothing, never to a default

A missing or malformed preference means abstain (Rule 7), not fall back to a
built-in value. A silent default here is a building shaped by a number nobody
chose. `urban-rules` correctly does the opposite --- its defaults _are_ a
complete, valid local plan --- and the difference is the point: a zoning table
has a legitimate default, a design assumption does not.

## Rule 10 --- Capabilities are exactly `ai`

No `document`, no `components`, no `geo`. The assistant has no reason to write to
the model and declaring the capability would be a claim it does not need. If a
future revision surfaces diagnostics through a command, it adds `commands` and
that command still calls nothing.

---

# Decision Drivers

| Driver                 | Priority |
| ---------------------- | -------- |
| Architectural honesty  | High     |
| Extensibility          | High     |
| Simplicity             | High     |
| Maintainability        | High     |
| Feature completeness   | Medium   |
| Performance            | Low      |

---

# Alternatives Considered

## Option A --- An orchestrating extension that drives the pipeline

### Description

The package as originally requested: a command that takes a user's intent and
runs Brief → Programme → Layout → Geometry to completion, producing a plan in one
step.

### Advantages

- Exactly the requested user experience: one instruction, one result.
- Makes the four-stage pipeline's value visible without four interactions.

### Disadvantages

- **Requires an execution seam.** Sequencing means calling
  `generateProgramme`, `generateLayout`, `generateGeometry`. None is reachable
  from `AiExtensionService`, and ADR-0028 Rule 4 forbids handing an enricher
  anything callable.
- **Requires approving on the user's behalf.** Each artefact is approved through
  `Proposal` + `AiSessionController.approveProposal`. An orchestrator either
  stops at every stage --- in which case it has orchestrated nothing --- or
  auto-approves, which is a second approval mechanism (ADR-0027.1 Rule 7) and
  the exact failure the pipeline exists to prevent.
- **The last step does not exist.** Turning an approved Geometry Graph into walls
  is not implemented anywhere, so "generate a layout" cannot terminate in a
  drawing regardless of what a package does.
- Reviewability is the pipeline's product. An orchestrator's honest description
  is "skip the four reviews", which is a request to remove the feature.

### Why Rejected

It is not blocked by a missing convenience; it is blocked by three separate
standing rules, each of which exists for a reason this option would demonstrate.

## Option B --- One enricher on `programme` only

### Description

Follow `urban-rules` exactly: a single stage provider, on the stage where the
numbers live.

### Advantages

- The proven shape. Smallest possible surface, one id, trivially reviewable.
- Sidesteps Rule 2 entirely --- with one stage there is nothing to stay
  consistent with.

### Disadvantages

- Says nothing at the `brief`, which is where a typology assumption is cheapest
  to correct and most expensive to leave wrong.
- Leaves the ADR's central question --- whether one package can enrich four
  stages coherently --- untested, when it is the next thing anyone building on
  Sprint 28.3 will attempt.

### Why Rejected

It is the safe subset of this ADR rather than an alternative to it, and Rule 2
is precisely the finding worth having.

## Option C --- Build it into `apps/web` as a first-party feature

### Description

Ship the same knowledge inside the application, where it could hold a dispatcher
and legitimately sequence stages.

### Advantages

- No constraint problem: first-party code may do all of this.
- Typed, compiled, refactored with the pipeline.

### Disadvantages

- Residential typology knowledge changes on a different cadence from the
  application, which is the argument ADR-0028 accepted for putting knowledge in
  packages at all.
- Answers ADR-0004's question ("could this be a plugin?") with "yes, but we did
  not", for a subject that is the canonical example.
- Does not make the platform seam any better; it routes around it.

### Why Rejected

The knowledge belongs in a package. Only the sequencing does not, and the
sequencing is not part of this decision.

## Option D --- Expose `ArchitecturalOperationProvider` to the SDK first, then orchestrate

### Description

An application-repo ADR exposing operation providers --- which emit
`CommandRequest`s --- to installed packages, after which an orchestrating
assistant becomes expressible.

### Advantages

- The only path to the requested behaviour that does not break a rule.
- ADR-0028's _Future Evolution_ already names it as the obvious next question.

### Disadvantages

- A materially larger risk than exposing enrichment: emitting a `CommandRequest`
  from a `data:`-URL module is third-party code with execution consequences.
- Belongs in `../archisimple` as a sprint plus an ADR. Nothing in this repo can
  decide it.
- Still does not deliver "generate a plan in one step" --- the approval rule and
  the missing Geometry Plan are independent of it.

### Why Deferred, Not Rejected

It is the right question at the wrong layer. If whole-pipeline automation is
genuinely wanted, this ADR is not where it gets decided.

---

# Consequences

## Positive

- The first package to exercise all four stages, which is the untested half of
  Sprint 28.3's seam.
- A design gains consistent, attributed, auditable assumptions from the brief
  onward, instead of only a constraint check at the programme.
- Every figure the assistant contributes is invocable by id outside a pipeline
  run (Rule 5), so its reasoning is inspectable in a way the model's is not.
- Rule 2 produces a reusable finding: whether stage enrichers can stay coherent
  with no channel between them.

## Negative

- Four enrichers is four times the third-party code running inside artefact
  generation, and four opportunities for a 50 ms breach.
- Rule 2 forces re-derivation on every call --- deliberately redundant work,
  chosen over a cache that would go stale.
- The package does not do what was asked for. That gap is the ADR's subject
  rather than a defect, but it remains a gap.

## Trade-offs

**Continuity by re-derivation over continuity by memory.** Slower and more
verbose than threading a session object through four calls. Accepted because the
seam provides no such thread, and simulating one in module state would make the
assistant's output depend on invisible history --- indistinguishable from a bug
when it disagrees with itself.

**Abstention over defaults (Rule 9).** The assistant will frequently contribute
nothing. Accepted: a silent default at the brief stage is three artefacts deep
before anyone can see it.

---

# Architectural Impact

## Affected Packages

- `building-assistant` --- new package in this repository
- `@archisimple/extension-sdk` --- **none**; consumed as published
- `@archisimple/skills`, `@archisimple/architectural-intelligence` --- **none**;
  reached only through `AiExtensionService`

No change is required in `../archisimple`. If one turns out to be required, this
ADR is wrong and the requirement belongs in an application-repo ADR.

## Affected Extension Points

- `SkillRegistry` --- new contributions
- `PlanningStageProvider` --- new contributions on all four stages

## Affected Capabilities

- `ai` --- declared; second consumer after `urban-rules`

---

# Architectural Principles

| Principle                                | Impact                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Runtime owns state                       | Unchanged --- no contribution reaches the document                 |
| Automation API is the execution boundary | Reinforced --- Option A rejected precisely to preserve it          |
| AI proposes, never acts                  | Reinforced --- the assistant does not even propose                 |
| Provider-based architecture              | Exercised across all four stages for the first time                |
| Plugin-first architecture                | Advanced --- domain knowledge ships outside the application        |
| Derive, don't duplicate                  | **Rule 2 is this principle** applied across stage boundaries       |
| Failure is isolated                      | Inherited --- a dropped enricher costs this package alone          |

---

# Architecture Patterns

- Service + Provider + Registry (consumed, not extended)
- Strategy (each contributed Skill)
- Pure function pipeline stage (each enricher)

---

# Compatibility

## Backward Compatibility

- [x] Yes

Additive in every direction. The package is installed or it is not; with it
absent the pipeline behaves exactly as it does today. `sdkVersion` is `1.0`;
nothing here needs a newer host than Sprint 28.3.

## Migration

None. No artefact schema, no file version, no Automation contract is touched.

---

# Risks

| Risk                                                              | Impact | Mitigation                                                                       |
| ----------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| Cross-stage caching is added later "for performance"              | High   | Rule 2 + an order-independence test in `tests/package.test.mjs`                 |
| The `brief` enricher emits geometry and malforms the artefact     | High   | Rule 4 + a per-stage shape assertion                                            |
| Four enrichers breach the 50 ms budget on a large programme       | Medium | Rule 5 keeps computation in Skills, which are measurable in isolation           |
| Users read contributed assumptions as the application's own       | Medium | Rule 8 --- every contribution names its source                                  |
| A default assumption silently shapes a building                   | Medium | Rule 9 --- abstain rather than default                                          |
| The package drifts toward orchestration one convenience at a time | Medium | Rule 1 is stated as a surface property, not an intention                        |
| Artefact internals are treated as a stable API                    | Low    | Accepted --- artefacts cross as plain data with no stability promise (ADR-0028) |

---

# Validation

- **Unit tests** (`node --test building-assistant/tests/package.test.mjs`, no
  install, no build):
  - each enricher returns a **new** object and never mutates a frozen input;
  - each enricher returns its input unchanged for an unrecognised artefact
    (Rule 7);
  - **order independence** --- enriching `layout` before or after `programme`
    yields identical output (Rule 2);
  - the `brief` and `programme` enrichers emit no coordinate-bearing field
    (Rule 4);
  - every contributed skill is synchronous and returns a discriminated outcome;
  - every added string contains the assistant's attribution (Rule 8).
- **Manifest validation** --- `archisimple package validate ./building-assistant`
  passes; `capabilities` is exactly `["ai"]`.
- **Manual validation** --- loaded from a Development Repository alongside
  `urban-rules`, both enriching `programme`, with both attributions visible on
  the proposal card and no id collision.

---

# Success Criteria

- [ ] Four stage providers and at least one Skill register under one namespace.
- [ ] A generated Brief, Programme, Layout and Geometry Graph each carry an
      attributed contribution from the assistant.
- [ ] The assistant and `urban-rules` coexist on the `programme` stage, in
      registration order, both attributed.
- [ ] Order-independence test passes (Rule 2).
- [ ] Removing the package returns the pipeline to its un-enriched output
      exactly.
- [ ] No change was required in `../archisimple`.

---

# Future Evolution

Revisit when:

- **Packing becomes contributable.** Rule 6 exists because synthesis completes
  before enrichment. A `strategy` seam on Geometry Graph synthesis is a genuine
  extension point and an application-repo ADR.
- **Operation providers are exposed** (Option D). Orchestration becomes
  expressible --- and the approval question (ADR-0027.1 Rule 7) still has to be
  answered separately.
- **The Geometry Plan lands.** Once approved Geometry Graphs become walls, the
  `geometry` enricher's output has execution consequences and Rule 4 needs
  re-reading, as ADR-0028 already notes.
- **A stage provider needs I/O.** A live standards lookup is a Provider, not a
  Skill, and nothing in the SDK provides one.

---

# Related Documents

## Related ADRs

- ADR-0004 --- Plugin-First Architecture
- ADR-0021 --- Plugin Lifecycle Management (owner-stamped teardown)
- ADR-0022 --- Automation API as the System Boundary
- ADR-0025 --- Unified Plugin Platform
- ADR-0027 --- AI Skills Platform
- ADR-0027.1 --- Architectural Intelligence Planning Pipeline (Rules 3, 7, 9, 13)
- ADR-0028 --- AI Extension Points (Rules 3--10)

## Related Packages

- `urban-rules` --- the reference consumer, and the single-stage counterexample

---

# Architecture Curator Checklist

- [x] The decision does not duplicate an existing architectural concept.
- [x] Existing extension points were considered first --- and are the whole
      mechanism.
- [x] Existing services were evaluated before introducing new ones; none is
      introduced.
- [x] No new registry, no new approval surface, no new capability.
- [x] The requested behaviour was evaluated against the standing rules and the
      gap is documented rather than worked around.
- [ ] An Architecture Review has been completed.

---

# Implementation Status

| Item                  | Status |
| --------------------- | ------ |
| Accepted              | ☐      |
| Implemented           | ☐      |
| Sprint Completed      | ☐      |

---

# Notes

**On the word "orchestrate".** It carries two meanings and the request needs
only one of them. _Sequencing_ --- deciding which stage runs next --- is
host-owned and stays that way. _Coherence_ --- making sure the four artefacts
describe the same building --- is knowledge, and is available to a package today.
This ADR takes the second and names the first as out of reach, so that a later
reader does not rediscover the constraint by hitting it.

**Why Rule 2 is the interesting one.** Everything else here restates a platform
rule in package terms. Rule 2 is new, because `urban-rules` never faced it: with
one stage there is nothing to be consistent with. A four-stage package will be
tempted to remember, the seam offers no way to remember legitimately, and module
state is right there. The order-independence test is the whole guard.

**Not decided here.** Whether a stage provider should declare which artefact
fields it may touch. ADR-0028 leaves this open and explicitly defers it "until a
second provider exists to disagree with the first" --- this is that second
provider, and on the `programme` stage it will share an artefact with
`urban-rules`. If they disagree, that deferred question becomes concrete, and the
answer belongs in an application-repo ADR revising ADR-0028, not here.
