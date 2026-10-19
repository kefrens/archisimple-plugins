# Archisimple — PLU & Urban Planning Integration

**Status:** Proposal  
**Feature:** Urban Planning Assistant  
**Module:** `urban-planning`  
**Primary data sources:** Géoportail de l’Urbanisme (GPU), API Carto IGN, cadastral data  
**Target:** France

## 1. Vision

Integrate French urban planning regulations (*Plan Local d’Urbanisme — PLU*) into Archisimple to transform it from a 3D architectural design tool into an **urban planning feasibility assistant**.

Users should be able to select a real-world plot, discover its applicable planning constraints, and understand how those constraints affect their architectural project.

The feature should connect three existing capabilities:

- Geographic and cadastral data.
- Archisimple's 2D/3D geometry engine.
- AI-powered interpretation and explanation of regulatory documents.

The objective is not merely to display zoning maps, but to connect planning regulations to the actual geometry of a proposed building.

## 2. Objectives

### Primary objectives

1. Retrieve the applicable urban planning documents for a plot.
2. Display zoning boundaries and known planning constraints.
3. Extract and explain relevant regulations.
4. Calculate geometric constraints where the applicable rules are sufficiently structured.
5. Check a proposed design against the rules that can be reliably automated.
6. Help users explore alternative building configurations.
7. Generate a traceable planning feasibility report.

### Non-goals for the initial release

- Guaranteeing that a project will receive a building permit.
- Fully automating the interpretation of every French PLU.
- Replacing an architect, surveyor, planning authority or legal professional.
- Treating cadastral boundaries as a substitute for a legal boundary survey.
- Automatically determining every environmental, heritage, safety or easement constraint.

## 3. User Stories

### US-01 — Analyse a plot

As a user, I want to select a cadastral plot and retrieve its applicable urban planning information so that I can understand the constraints before designing a building.

**Acceptance criteria:**

- The user can identify a plot through the available cadastral search workflow.
- Archisimple identifies the available applicable planning documents.
- The zoning designation is displayed when available.
- Relevant source documents and their versions are accessible.
- Missing or ambiguous information is explicitly reported.

### US-02 — Visualise zoning and constraints

As a user, I want to see zoning boundaries and known planning constraints on the site plan so that I can understand where construction may be possible.

**Acceptance criteria:**

- Zoning polygons can be displayed on the 2D plan.
- The selected plot is highlighted.
- Available prescriptions and easements can be displayed as separate layers.
- Users can inspect the source of each displayed constraint.
- The interface distinguishes official data from derived or estimated geometry.

### US-03 — Calculate a theoretical building envelope

As a user, I want Archisimple to calculate a theoretical building envelope from the applicable geometric rules so that I can position my building more efficiently.

**Acceptance criteria:**

- Supported setbacks and other geometric constraints can be converted into spatial operations.
- The resulting envelope is displayed in the 2D and, where appropriate, 3D views.
- Each calculated constraint references its source rule.
- Missing or ambiguous rules prevent unsupported calculations.
- The result is labelled as a theoretical envelope, not a guarantee of buildability.

### US-04 — Check a design against planning rules

As a user, I want Archisimple to evaluate my building design against supported planning rules so that I can detect potential non-compliance while editing.

**Acceptance criteria:**

- Checks run against the current project geometry.
- Supported checks include applicable height, footprint, setbacks and other measurable requirements.
- Violations identify the affected object and relevant regulation.
- Results are updated when the project changes.
- Rules that cannot be evaluated automatically are marked as requiring verification.

### US-05 — Ask questions about planning regulations

As a user, I want to ask natural-language questions about the plot so that I can understand the practical implications of the regulations.

Example questions:

- Can I add a swimming pool?
- Can I build an additional storey?
- How far must my garage be from the road?
- Why does this building placement trigger a warning?
- What is the maximum permitted building height?

**Acceptance criteria:**

- Answers are grounded in the applicable documents and available structured data.
- Relevant article references and source links are provided.
- The system distinguishes explicit regulatory requirements from interpretations.
- Conflicting, outdated or missing information is disclosed.
- The assistant does not invent regulatory values.

### US-06 — Compare design alternatives

As a user, I want to compare different building configurations against the known constraints so that I can explore feasible design options.

**Acceptance criteria:**

- Users can compare multiple project variants.
- Supported indicators are calculated consistently.
- Warnings and unresolved checks are displayed for each variant.
- The system does not label a design as fully compliant when relevant rules remain unchecked.

### US-07 — Generate a planning feasibility report

As a user, I want to export a report summarising the planning analysis so that I can share it with an architect, builder or planning authority.

**Acceptance criteria:**

- The report identifies the plot and planning documents used.
- It includes zoning, available rules, calculations and warnings.
- It records document versions and analysis assumptions.
- It includes links to the official sources.
- It clearly states the scope and limitations of the analysis.

## 4. Proposed Features

### 4.1 Plot Analysis

The entry point for the feature is an **Analyse this plot** action.

The analysis should provide:

- Plot identification and geometry.
- Applicable planning document and version.
- Zoning classification, such as UA, UB, UC, AU, A or N.
- Available graphical prescriptions.
- Available public utility easements and other relevant constraints.
- Links to the official regulations.
- A summary of information that remains unavailable or requires verification.

The exact information available will depend on the municipality and the completeness of its published data.

### 4.2 Theoretical Buildable Envelope

The geometry engine should calculate a theoretical building envelope using supported rules.

Potential constraints include:

- Setbacks from roads.
- Distances from neighbouring plot boundaries.
- Mandatory building alignments.
- Maximum building footprint.
- Designated non-buildable areas.
- Applicable height constraints.
- Relevant graphical prescriptions.

Implementation may use polygon buffers, intersections, differences and other spatial operations.

Not every planning rule can be reduced to a geometric calculation. Some rules depend on the type of building, the existing construction, the road classification or specific exceptions.

The envelope must therefore include its assumptions and the rules that were actually applied.

### 4.3 Live Compliance Checking

During design, Archisimple evaluates supported rules against the current building model.

Example indicators:

| Indicator | Example |
|---|---|
| Proposed building footprint | 128 m² |
| Calculated maximum footprint | 145 m² |
| Proposed setback | 2.5 m |
| Required setback | 3 m |
| Result | Potential setback violation |

All values above are illustrative.

The compliance engine should distinguish between geometric measurements, regulatory limits, user-provided assumptions and calculated results.

### 4.4 AI Urban Planning Assistant

The AI assistant should combine:

1. Structured planning data.
2. Retrieval of relevant passages from official documents.
3. Geometric measurements from the project.
4. A reasoning layer that explains the results.
5. References that allow users to verify the answer.

The AI should not independently determine legal compliance from an unverified text summary.

For critical checks, deterministic calculations should be performed by the rule engine rather than delegated to the language model.

### 4.5 Feasibility Report

The report should include:

- Plot and project identification.
- Planning documents and versions.
- Applicable zoning.
- Rules identified and their source articles.
- Geometric measurements and calculations.
- Detected potential violations.
- Unresolved questions and missing information.
- Official document links.
- Date of analysis and relevant limitations.

## 5. Data Sources

### 5.1 Géoportail de l’Urbanisme

Official source for French urban planning documents and associated data.

Responsibilities:

- Discover applicable planning documents.
- Retrieve published document packages where available.
- Obtain zoning, prescriptions and regulatory documents.
- Track document identifiers, versions and publication metadata.

Website: https://www.geoportail-urbanisme.gouv.fr/

### 5.2 API Carto IGN — Urban Planning Module

Potential source for on-demand access to urban planning data.

Responsibilities:

- Query planning information for a plot or geometry.
- Retrieve available zoning and prescriptions.
- Reduce the need to download the entire national dataset during initial development.

Documentation: https://apicarto.ign.fr/api/doc/gpu

The available endpoints, schemas, coverage and service status must be verified during implementation.

### 5.3 Cadastral Data

Cadastral data can support plot identification and approximate geometry.

Responsibilities:

- Locate a plot.
- Display cadastral boundaries.
- Connect a plot to planning information.

Cadastral boundaries must not be treated as a legal boundary survey.

### 5.4 Planning Regulations

Published regulatory documents may include PDF files and structured geographic data.

Responsibilities:

- Retrieve relevant articles.
- Preserve the original document and its version.
- Extract rule candidates for structured processing.
- Maintain links between extracted rules and their source passages.

## 6. Proposed Architecture

```text
Public Data Sources
    |
    +-- Géoportail de l'Urbanisme
    +-- API Carto IGN
    +-- Cadastral Data
    +-- Planning Regulation Documents
    |
    v
Urban Planning Data Adapter
    |
    +-- Document Discovery
    +-- Data Normalisation
    +-- Version Tracking
    +-- Geometry Validation
    +-- Document Parsing
    |
    v
Canonical Planning Data Model
    |
    +-------------------------+
    |                         |
    v                         v
Geometry Engine          Regulatory Engine
    |                         |
    +------------+------------+
                 |
                 v
         Archisimple Integration
                 |
     +-----------+-----------+
     |           |           |
     v           v           v
   2D/3D       AI Assistant  Reports
   Overlays    and Search    and Checks
```

### Architectural principles

- Keep external data-source integrations separate from the core application.
- Normalise data into a source-independent model.
- Preserve original source documents and identifiers.
- Track the applicable document version.
- Separate deterministic calculations from AI-generated explanations.
- Cache external responses where appropriate.
- Support partial availability when a source or document is unavailable.
- Make every result traceable to its source and assumptions.

## 7. Proposed Data Model

The following entities are conceptual and should be aligned with Archisimple's existing persistence and domain models.

### PlanningDocument

Represents an urban planning document.

Potential fields:

- `id`
- `source`
- `externalId`
- `municipalityId`
- `documentType`
- `status`
- `approvalDate`
- `publicationDate`
- `effectiveDate`, where available
- `version`
- `sourceUrl`
- `retrievedAt`

### PlanningZone

Represents a zoning area.

Potential fields:

- `id`
- `documentId`
- `zoneCode`
- `label`
- `geometry`
- `regulationReference`

### PlanningRule

Represents a normalised rule extracted from structured data or regulatory documents.

Potential fields:

- `id`
- `documentId`
- `zoneId`
- `ruleType`
- `value`
- `unit`
- `conditions`
- `exceptions`
- `sourceArticle`
- `sourcePassage`
- `interpretationStatus`
- `validationStatus`

### PlanningPrescription

Represents a geographical prescription or constraint.

Potential fields:

- `id`
- `documentId`
- `prescriptionType`
- `geometry`
- `description`
- `sourceReference`

### ComplianceCheck

Represents the outcome of evaluating a project against a rule.

Potential fields:

- `id`
- `projectId`
- `ruleId`
- `checkedObjectId`
- `result`
- `measuredValue`
- `requiredValue`
- `assumptions`
- `explanation`
- `checkedAt`

Potential results:

- `pass`
- `potential_violation`
- `needs_review`
- `not_evaluable`

## 8. Rule Interpretation and Confidence

Each rule should have explicit processing and validation states.

Suggested states:

- `verified`: the rule and its applicability have been validated.
- `extracted`: a candidate rule has been identified in a source document.
- `needs_review`: interpretation or applicability requires confirmation.
- `unsupported`: the rule cannot currently be evaluated automatically.
- `not_applicable`: the rule has been determined not to apply in the current context.

These states should not be confused with the outcome of a compliance check.

A rule may be verified while the project violates it. Conversely, a project may pass all implemented checks while other relevant rules remain unexamined.

## 9. User Interface Integration

Proposed entry point:

**Project → Site → Urban Planning**

Suggested interface sections:

1. **Overview**
   - Plot identification.
   - Planning document.
   - Zoning.
   - Analysis completeness.

2. **Map**
   - Plot boundary.
   - Zoning polygons.
   - Known constraints.
   - Theoretical building envelope.

3. **Rules**
   - Applicable rules.
   - Source articles.
   - Conditions and exceptions.
   - Validation status.

4. **Project Checks**
   - Supported checks.
   - Potential violations.
   - Measurements.
   - Unresolved checks.

5. **AI Assistant**
   - Natural-language questions.
   - Contextual answers.
   - Source references.

6. **Report**
   - Exportable feasibility analysis.
   - Assumptions and limitations.
   - Source documents and version metadata.

## 10. Implementation Roadmap

### Phase 1 — MVP: Understand the Plot

Deliverables:

- Plot selection.
- Integration with the available official planning data source.
- Zoning display.
- Document and version metadata.
- Access to regulatory documents.
- AI-generated summaries with source references.
- Explicit handling of missing data.

Success criterion: users can understand the published planning information associated with a selected plot.

### Phase 2 — Geometric Constraints

Deliverables:

- Normalised representation of supported geometric rules.
- Theoretical building envelope.
- 2D overlays and relevant 3D visualisation.
- Initial checks for setbacks, footprint and height where data permits.
- Traceability from calculations to source rules.

Success criterion: users can see how supported planning rules affect their proposed building geometry.

### Phase 3 — Design-Time Assistant

Deliverables:

- Checks triggered by project geometry changes.
- Contextual warnings.
- Natural-language questions about rules and results.
- Comparison of project variants.
- Initial feasibility report.

Success criterion: users can identify and address supported planning constraints while designing.

### Phase 4 — National Coverage and Data Quality

Deliverables:

- Scalable data ingestion.
- National indexing where justified.
- Version updates and document change detection.
- Caching and degraded/offline behaviour.
- Monitoring of source availability and data quality.
- Expanded rule coverage.

Success criterion: the feature scales beyond the initial pilot municipalities while preserving source traceability and explicit uncertainty.

## 11. Quality, Legal and Operational Requirements

### Data freshness

- Record source publication and retrieval dates.
- Detect changes to planning documents where supported.
- Avoid silently mixing incompatible document versions.
- Re-evaluate results when relevant source data changes.

### Explainability

Every automated result should show:

- Which rule was evaluated.
- Where the rule originated.
- Which geometry was measured.
- Which assumptions were applied.
- Whether the result is conclusive or requires review.

### Reliability

- Validate geometries and coordinate reference systems.
- Handle missing or invalid data.
- Make external source failures visible.
- Avoid treating missing rules as permission to build.

### Legal limitations

The feature provides planning assistance, not a binding administrative decision or a guarantee of building permit approval.

The analysis must account for the limits of available data, the applicable rules and their exceptions, and constraints that may require professional or administrative verification.

## 12. Initial Technical Investigation

Before implementation, validate the following:

1. Identify the supported GPU and API Carto endpoints and their current schemas.
2. Test plot-to-document matching in a small selection of municipalities.
3. Inspect representative PLU datasets and regulatory PDFs.
4. Determine which rules are already available as structured data.
5. Define a canonical representation for geometries, documents and rules.
6. Evaluate document extraction and source citation quality.
7. Implement one deterministic geometric check end to end.
8. Validate results against manually reviewed examples.
9. Measure API latency, coverage and caching requirements.
10. Decide whether a national data import is necessary.

## 13. Recommended First Milestone

Implement **Analyse this plot** as a self-contained first feature.

The first milestone should:

1. Accept a selected cadastral plot.
2. Retrieve available planning data.
3. Display its zoning.
4. Provide links to the applicable official documents.
5. Summarise the relevant regulations with source references.
6. Identify missing information and unresolved constraints.
7. Establish the data model required for subsequent geometric checks.

This delivers immediate user value without requiring complete automated interpretation of every French PLU.

## 14. Definition of Done — First Milestone

- [ ] Plot selection is integrated with the existing Archisimple workflow.
- [ ] The applicable planning document can be identified when available.
- [ ] Zoning is displayed with source attribution.
- [ ] Official documents are accessible.
- [ ] Extracted information references its source.
- [ ] Missing or ambiguous information is clearly reported.
- [ ] AI summaries do not invent rules or numerical values.
- [ ] External source failures are handled gracefully.
- [ ] The feature is tested against manually verified sample plots.
- [ ] The architecture supports future geometric checks without redesigning the data model.

---

**Recommendation:** Start with plot analysis and source-grounded regulatory summaries. Add deterministic geometry-based checks next, followed by continuous compliance checking and AI-assisted design optimisation. This provides a practical path from an informative planning layer to a genuinely differentiated architectural design assistant.
