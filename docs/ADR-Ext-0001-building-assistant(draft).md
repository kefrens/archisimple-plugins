# ADR-0001 — Extension: Building Assistant

**Status:** Proposed

## Context

Designing a building from natural language is a multi-stage architectural process rather than a single AI request.

Over time, ArchiSimple has introduced several architectural artifacts that progressively refine a design:

- Architectural Brief
- Space Programme
- Planning
- Packing Strategy
- Layout
- Geometry

These artifacts represent different abstraction levels of the design and should remain explicit, persistent, reviewable and independently editable.

The current conversational approach has several limitations:

- project state is inferred from chat history rather than persisted artifacts;
- approvals rely on natural language ("approved"), making the workflow fragile;
- users have limited visibility into the current design stage;
- structured architectural information is collected through conversation rather than an appropriate guided workflow;
- the AI is responsible for both orchestration and generation, coupling UX with implementation.

As ArchiSimple evolves, architectural workflow orchestration should become a first-class feature independent of the CAD engine.

---

## Decision

Introduce a new plugin under the ArchiSimple plugin ecosystem.

```
archisimple-plugins/
    building-assistant/
```

The Building Assistant becomes the primary workflow for creating buildings from user requirements.

Rather than exposing a blank AI chat, the assistant guides users through the complete architectural design process using a wizard-based workflow.

The Building Assistant owns:

- workflow orchestration
- wizard user interface
- AI interactions
- architectural artifact generation
- approval workflow
- workflow state management

The Building Assistant **does not** own geometry generation.

Geometry generation remains the responsibility of the existing ArchiSimple geometry engine and command architecture.

---

## Goals

The Building Assistant aims to:

- provide a guided building creation experience;
- progressively refine a project from requirements to geometry;
- make every architectural decision explicit and reviewable;
- persist every intermediate artifact inside the project;
- separate AI orchestration from deterministic CAD operations;
- allow regeneration of downstream stages after modifications.

---

## User Experience

The assistant is exposed through a dedicated ribbon button.

```
Ribbon

+----------------------------------------------------------+

 File  Edit  View  ...

 [ Building Assistant ]

+----------------------------------------------------------+
```

Clicking the button opens a dockable wizard.

Example:

```
Building Assistant

✓ Brief

✓ Programme

○ Planning

○ Packing

○ Layout

○ Geometry
```

The wizard becomes the primary interface for building generation.

Natural language remains available for refinement and modifications once artifacts have been generated.

---

## Guided Workflow

The assistant guides the user through successive stages.

```
Project

↓

Architectural Brief

↓

Space Programme

↓

Planning

↓

Packing Strategy

↓

Layout

↓

Geometry
```

Each stage consumes the previous artifact and produces a new one.

Each artifact is persisted inside the project.

---

## Workflow Stages

Each stage has a common lifecycle.

```
Draft

↓

Approved

↓

Outdated
```

Changing an upstream stage automatically invalidates downstream stages.

Example:

```
Brief modified

↓

Programme becomes Outdated

↓

Planning becomes Outdated

↓

Packing becomes Outdated

↓

Layout becomes Outdated

↓

Geometry becomes Outdated
```

This guarantees consistency throughout the design process.

---

## Wizard Flow

### Step 1 — Building Type

The assistant collects the overall project intent.

Examples:

- House
- Apartment
- Extension
- Garage
- Office
- Commercial Building

---

### Step 2 — Requirements

The assistant collects structured architectural requirements.

Examples:

- floor area
- number of storeys
- number of bedrooms
- bathrooms
- separate toilets
- garage
- office
- accessibility
- additional requirements

This information forms the Architectural Brief.

---

### Step 3 — Space Programme

The assistant generates the Space Programme.

The user reviews:

- spaces
- areas
- relationships
- priorities

The programme can be regenerated or edited before approval.

---

### Step 4 — Planning

The assistant determines:

- circulation
- zoning
- functional organisation
- adjacencies

Alternative planning strategies may be proposed.

---

### Step 5 — Packing Strategy

The assistant selects or proposes a packing strategy.

Examples:

- Compact
- Courtyard
- Linear
- L-shaped
- U-shaped

Additional strategies may be introduced by plugins.

---

### Step 6 — Layout

The assistant generates one or more candidate layouts.

Users can compare alternatives before approval.

---

### Step 7 — Geometry

Once the layout is approved, the assistant requests geometry generation from ArchiSimple.

The resulting model becomes fully editable using the existing CAD tools.

---

## Responsibilities

### Building Assistant

Responsible for:

- workflow orchestration
- wizard UI
- AI providers
- artifact generation
- approvals
- workflow progress
- project guidance

### ArchiSimple Core

Responsible for:

- topology
- geometry
- constraints
- rendering
- commands
- undo / redo
- persistence
- editing

The Building Assistant communicates with ArchiSimple exclusively through public APIs.

No plugin directly manipulates internal geometry structures.

---

## Architecture

```
+------------------------------------------------+

Building Assistant Plugin

    Wizard UI

        │

Workflow Engine

        │

Artifact Generators

    Brief
    Programme
    Planning
    Packing
    Layout

        │

Geometry Generator

        │

ArchiSimple Public API

        │

Commands

        │

Geometry Engine

+------------------------------------------------+
```

The assistant orchestrates the workflow.

ArchiSimple executes deterministic geometry operations.

---

## Workflow Engine

The Building Assistant introduces the concept of Workflow Stages.

Each stage exposes a common interface.

Example:

```ts
interface WorkflowStage<TArtifact> {
    id: string;
    name: string;

    status:
        | "draft"
        | "approved"
        | "outdated";

    artifact?: TArtifact;

    canGenerate(): boolean;

    canApprove(): boolean;

    invalidate(): void;
}
```

Concrete stages include:

- BriefStage
- ProgrammeStage
- PlanningStage
- PackingStage
- LayoutStage
- GeometryStage

This architecture allows future workflow extensions without modifying the core workflow engine.

---

## Future Extensions

The workflow has been designed to be extensible.

Potential future stages include:

- Site Analysis
- Urban Rules
- PLU Integration
- Energy Optimisation
- Structural Optimisation
- Cost Estimation
- Furniture Layout
- Interior Design
- Construction Documentation

Each extension introduces a new workflow stage rather than modifying existing ones.

---

## Consequences

### Advantages

- Clear and deterministic workflow.
- Guided user experience.
- Persistent architectural artifacts.
- Explicit approvals.
- AI becomes an orchestration layer rather than a geometry engine.
- Easier regeneration after modifications.
- Better separation of concerns.
- Extensible plugin architecture.

### Trade-offs

- Additional plugin to maintain.
- Requires workflow management infrastructure.
- Introduces new project artifacts.
- Higher initial implementation effort than a chat-based solution.

---

## Rationale

The Building Assistant separates architectural reasoning from geometry generation.

Instead of relying on conversational state, the assistant manages an explicit workflow composed of persistent architectural artifacts.

This keeps the ArchiSimple core deterministic while allowing rapid evolution of AI providers, workflow logic and future architectural assistants.

The resulting architecture is easier to understand, easier to test, more extensible, and provides a significantly better user experience than a purely conversational interface.