# ADR-0014: Import-Component-Definition Composition

- **Status:** Approved
- **Date:** 2026-07-02
- **Decision IDs:** ADR-0014 (references ADR-0003, ADR-0004, ADR-0010, ADR-0013)

## Context

The OSCAL component-definition model composes other definitions via `import-component-definition`
(array of `{href, remarks?}`), letting reusable building blocks be shared across definitions —
directly relevant to the priority component-definition feature. TALOS must import definitions
(from the workspace or the BSI library), remove them, and show imported content **read-only**
(editing happens by opening the linked definition).

The design (resolved-vs-unresolved refs, cycle protection, transitive read-only tree, back-matter
reference export) is captured below; persistence
changes for the client-side app.

## Decision

### Reference storage (IndexedDB, ADR-0004)
Each component-definition record holds an ordered `imports` array of
`{ importId, importedUuid?, href, remarks?, sortOrder }`:
- **Resolved** import → `importedUuid` set (points at a workspace/library definition).
- **Unresolved** import → only `href` kept (external/dangling), recorded in the
  `unresolvedReferences` store so a later resolve pass can fix it. Never silently dropped.

### Resolution
On OSCAL import, an `import-component-definition` href of the form `#<uuid>` (or a back-matter
resource carrying a document-id / title / rlink) resolves against existing definitions via a
shared resolver: **document-id (uuid) → library path → exact title**. Non-matches stay
unresolved.

### Cycle & self-import protection
A pure `wouldCreateCycle(importer, target)` check (target can already reach importer) rejects
self-imports and cycles; the recursive read-only tree (`buildImportTree`) is cycle-guarded
(ancestor already on path → flagged `cycle`, not re-expanded).

### Display
The component-definition detail page shows a read-only **Imported Definitions** section
(transitive), each node linking to its own definition, styled with the muted-green dashed
"imported" treatment (ADR-0010). Add/remove is gated to editable (non-library) definitions;
only direct imports are removable. Add-import uses the shared entity-search (ADR-0013) filtered
to component-definitions.

### Export
Resolved imports export as an OSCAL **back-matter resource** (title + bare-uuid document-id +
rlink to the definition's file/path), referenced by `#<resource-uuid>`; unresolved imports emit
their stored href verbatim. Round-tripped and golden-tested.

## Consequences

**Positive:** component-definitions compose and round-trip through OSCAL; unresolved/external
imports are preserved; imported content is never editable in place (no ownership ambiguity).
**Negative:** adds a self-referential graph; cycle handling centralized + tested.

## References
- OSCAL component-definition model. ADR-0003 (models), ADR-0004 (storage), ADR-0010 (styling),
  ADR-0013 (add-import search). Tests: component-definition import suite (T-102/T-103).
