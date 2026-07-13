# ADR-0036: Component-Definition Creation Assistant (Single Component)

- **Status:** Approved
- **Date:** 2026-07-13
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0036 (references ADR-0003, ADR-0011, ADR-0013, ADR-0016, ADR-0021,
  ADR-0024, ADR-0033)

## Context

`todo.md`'s "MVP Feedback" section (2026-07-13) asked for a third guided-authoring assistant,
alongside the existing Profile Creation Assistant (ADR-0032) and SSP Bootstrap Assistant
(ADR-0026): building a component-definition with a single component is otherwise a lot of manual
form-filling in the plain editor — pick a component, pick its control source, then hand-type an
`implemented-requirement` for every control in that source one at a time. The MVP ticket specifies
a 3-step flow: (1) component fields, (2) a catalog/profile source that generates the
control-implementation and one blank-description requirement per control, (3) a description-per-control
screen with a visible warning + set-parameter action on any control that carries params.

## Decision

### 1. No second implementation — reuse the editor's own building blocks

The assistant is a new page (`ComponentDefinitionAssistantPage.tsx`), not a new data layer. It
reuses, verbatim: `ControlDisplay` (control rendering), the `.control-requirements-table` 40/60 CSS
(ADR-0028), `SetParameterRow` (exported from `ControlImplementationsEditor.tsx` for this purpose —
previously a local, unexported function), `ensureArtifactResource` (back-matter-mediated source,
item 5 of ADR-0024 — the picked catalog/profile's own uuid is never written directly into
`control-implementation.source`), `useCatalogIndex`/`sourceOptions`/`findSourceEntryByUuid`/
`uniqueCatalogControlEntries` (catalog+profile resolution, ADR-0021's alt-identifier dedup), and
`applyDefaultCreator` (ADR-0033's global default creator). Same precedent as `ProfileCreationAssistantPage`
(ADR-0032 §4): the assistant's own contribution is the guided flow, not a parallel implementation
of anything the editor/model layer already has.

### 2. No metadata/creator editing UI — everything is derived or auto-applied

Unlike the plain editor, this page shows no `MetadataEditor` and no explicit creator fields. Per
the MVP spec, `metadata.title` is fully generated (`"Component definition for {title}"` / German
`"Komponentendefinition für {title}"`, i18n'd rather than hardcoded so it follows the active UI
language — the two other generated strings, the control-implementation description, are i18n'd
the same way) and the creator party is applied automatically from the global default-creator
setting (`applyDefaultCreator`, ADR-0033), exactly once, at save time (no live draft to keep in
sync — simpler than `ProfileCreationAssistantPage`'s reactive seed-on-mount, since there's no
editable metadata form here to update).

### 3. Step 2 generates the full requirement set — no filtering in v1

Picking a source builds one `ControlImplementation` whose `implementedRequirements` covers **every**
control in that source (`uniqueCatalogControlEntries`, so a control with an ADR-0021 alt-identifier
is generated once, not twice), each with an empty description per the MVP spec ("leave the
implemented-requirements.description empty for now"). No inclusion-mode picker like the Profile
Assistant's all/by-id/target-object choice exists here — explicitly out of v1 scope. **Known
tradeoff, flagged not hidden:** against a large catalog (e.g. BSI Grundschutz's ~998-control
Anwenderkatalog) this generates a correspondingly large table and document; no virtualization or
pagination was added, matching the project's current performance-budget state (T-503 unstarted).

### 4. Has-param warning: a left accent bar, not a full box border

A requirement row whose control carries `params` gets a `has-param-warning` class — a 3px
`var(--color-warning)` left border on the row's first cell (`app.css`), not a full box border,
which would visually compete with the table's own row dividers. The row's "Set parameter" button
(λ, ADR-0011) only renders when the control has params, and toggles (not always-visible) the
existing `SetParameterRow` list — reused verbatim, so the user can set any subset ("one or all")
of the control's params exactly the same way the plain editor already supports, not a new
one-value-for-every-param bulk action.

### 5. Symbol & navigation

Uses **✦** (ADR-0011's "AI/assistant features" symbol — now three assistants, not two; ADR-0011
updated), listed in the `Assistants` landing/sidebar group (`navigation.ts`) alongside the other
two, route `/component-definitions/assistant` (registered before the `:uuid` detail route, same
ordering precedent as `/profiles/assistant`).

## Consequences

**Positive:** guided single-component authoring in three steps instead of manual field-by-field
entry; zero duplicated control-rendering/param-editing logic; consistent with the two existing
assistants' conventions (symbol, back-matter-mediated source, default-creator auto-apply).

**Negative:** no way to narrow the generated requirement set to a subset of a large source's
controls in v1 (flagged in §3); the assistant always creates exactly one component — bulk/multi-component
generation is out of scope, matching the MVP ticket's own wording ("a single component").

## References
- ADR-0032 (Profile Creation Assistant — same reuse precedent), ADR-0026 (SSP Bootstrap Assistant),
  ADR-0024 §item 5 (back-matter-mediated source), ADR-0021 (alt-identifier dedup), ADR-0033
  (global default creator), ADR-0011 (symbol registry), ADR-0028 (40/60 control-requirements-table).
