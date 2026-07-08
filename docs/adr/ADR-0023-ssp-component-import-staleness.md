# ADR-0023: SSP Component Import, Staleness Tracking & Implementation-Status Convention

- **Status:** Approved
- **Date:** 2026-07-07
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0023 (references ADR-0003, ADR-0011, ADR-0016, ADR-0017)

## Context

The SSP editor (T-111) needed a way to populate `system-implementation.components[]` so that
`implemented-requirements[].by-components[].component-uuid` has something valid to reference. In
OSCAL, a by-component's `component-uuid` **must** point at a component inside the SSP's own
`system-implementation.components[]` — it cannot reference a component-definition's component
directly. The supervisor's requirement — "by-components are applied using components from the
uploaded/applied component-defs" — combined with wanting drift between the SSP's copy and its
source surfaced (not silently going stale) shaped the decisions below. The supervisor also asked
for default-collapsed sections given SSPs "can be large and quite complex," and for
implementation-status tracking (T-113) to land in the same pass.

## Decision

### 1. Components are only ever imported, never authored from scratch
`SystemImplementationEditor` offers a two-step picker (component-definition → its component) and
an "Import" action; there is no "create a blank system-component" path in this pass. This
guarantees every SSP-local component traces back to a real, catalogued component-definition
component, keeping by-components meaningful rather than free-standing SSP-only inventions.

### 2. Provenance & staleness via `props[]`, not a model-shape change
Import stamps three OSCAL `props` on the new `system-component` (`src/features/ssps/componentImport.ts`):

| prop name | value |
|---|---|
| `source-component-definition-uuid` | the source component-definition's uuid |
| `source-component-uuid` | the source `DefinedComponent`'s uuid |
| `source-snapshot` | a content hash of the source's `{title, type, description}` at import time |

Staleness (`componentStaleness`) recomputes the hash of the *current* live source and compares it
to the stored snapshot: `fresh` (matches) / `stale` (source content changed) / `missing` (source
component-definition or component no longer in the workspace) / `not-imported` (no provenance —
e.g. hand-authored via direct OSCAL upload, not through this editor). Using `props[]` — OSCAL's
own extension mechanism — means this is genuinely valid OSCAL and round-trips losslessly through
any external tool, unlike a bespoke top-level field would.

A stale component shows the already-reserved **Δ** symbol (ADR-0011, "staleness (source changed
since save)") in both the editor and the read-only detail view, with a one-click **refresh**
action (editor only) that re-copies `title`/`type`/`description` from the live source and updates
the snapshot — the component's own `uuid` and `status` are preserved (a refresh isn't a new
import).

### 3. Removing a component cascades to its by-components
Deleting a `system-implementation` component fires `onComponentRemoved(uuid)` up to
`SspEditorPage`, which strips every `by-components[]` entry across all
`implemented-requirements[]` referencing that uuid — mirrors the existing role/party cascade
pattern in `MetadataEditor` (never leave a dangling reference in the UI).

### 4. Implementation-status (T-113) lives on the by-component, not the requirement
`implementation-status` (`planned` / `implemented` / `partial` / `alternative` / `not-applicable`)
is stored as a `props` entry on each `by-component`, not a field on the requirement — a single
control can be implemented by multiple components in different states (e.g. one component fully
implemented, another still planned), so per-by-component is the meaningful granularity and matches
common real-world OSCAL usage.

### 5. Control-id picker is unscoped (no per-requirement "source")
Component-definitions scope their control-id picker by `control-implementation.source` (T-142).
SSPs have no equivalent per-requirement source field — their controls come from `import-profile`,
and profiles are deferred (ADR-0017) — so `SspControlImplementationEditor` offers control-id
suggestions from **all** workspace catalogs unscoped, via the same `catalogIndex.byControlId` map.

### 6. Default-collapsed, three-level UX
`System Characteristics` / `System Implementation` / `Control Implementation` are three
`<CollapsibleSection>` (new shared component, `src/shared/CollapsibleSection.tsx`) instances; within
System Implementation each component, and within Control Implementation each requirement, is
independently collapsible too (`src/shared/useExpandedSet.ts`, a small `Set<id>`-backed hook now
also used to de-duplicate the pre-existing component-definition editor/detail collapse logic,
T-163/T-167). **A brand-new SSP starts with all three sections expanded** (so authoring can start
immediately); **an existing/loaded SSP starts fully collapsed** (scannable outline first),
matching the precedent set for the component-definition editor's new-vs-loaded distinction.

## Consequences

**Positive:** by-components always resolve to a real, workspace-backed component; staleness is
visible instead of silently drifting; implementation-status is queryable per-component per-control,
matching how real compliance teams track partial rollouts; the SSP editor/detail pages stay usable
even with many components/requirements; `CollapsibleSection`/`useExpandedSet` are now shared
infrastructure rather than duplicated per-feature.
**Negative:** the staleness snapshot is a simple content hash (title/type/description only) — it
won't catch changes to fields outside that triple (e.g. a source component's `props`); refresh is
manual, not automatic, so a stale badge can persist until someone acts on it; system-implementation
`users`/`inventory-items` remain unmodeled in the UI (deferred, unchanged from T-111's original scope).

## References
- ADR-0003 (OSCAL model), ADR-0011 (Δ staleness symbol, ▾/▸ collapse symbols), ADR-0016 (control
  display / catalog resolution helpers reused here), ADR-0017 (SSP editor phase-1 scope, profiles
  deferred). Implementation: `src/features/ssps/{componentImport,SspEditorPage,
  SystemCharacteristicsEditor,SystemImplementationEditor,SspControlImplementationEditor,blank}.ts(x)`,
  `src/shared/{CollapsibleSection,useExpandedSet}.ts(x)`. Tests: `tests/features/componentImport.test.ts`,
  `tests/features/sspEditor.test.tsx`, `tests/features/ssps.test.tsx` (TEST-SSP-EDIT-01, TEST-SSP-IMPORT-01).
