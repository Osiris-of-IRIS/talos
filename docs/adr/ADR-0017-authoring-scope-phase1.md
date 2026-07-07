# ADR-0017: Authoring Scope & Cross-Artifact Reference-Picking (Phase 1)

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor (T-140 scoping), engineering
- **Decision IDs:** ADR-0017 (references ADR-0003, ADR-0005, ADR-0008, ADR-0013, ADR-0014, ADR-0016)

## Context

The T-140 audit found large gaps between the OSCAL component-definition/SSP models and what the
editors support, and no cross-artifact reference is pickable yet. This ADR bounds the next phase
so we build a coherent, tested increment rather than boiling the ocean.

## Decision (phase 1)

### SSP editor — **core authoring** only
In scope: metadata + back-matter, `import-profile`, `system-characteristics` core
(system-name, description, status, authorization-boundary), and `control-implementation` →
`implemented-requirements` (control-id, description, implementation **status**, `by-components`).
**Deferred:** `system-implementation` (users/components/inventory/leveraged-authorizations),
per-`statement` editing, `security-impact-level`, and `system-information` detail.

### Metadata editor — add identity fields
Extend the shared `MetadataEditor` with **roles, parties, responsible-parties** (keeping
title/version/remarks/links/props). **Deferred:** revisions, document-ids UI.

**Referential integrity (supervisor decision, T-141).** A `responsible-party` may reference
**only** roles and parties defined in the same document (OSCAL: `role-id` → a `metadata/role`,
`party-uuid` → a `metadata/party`). The UI enforces this by construction: responsible-parties
are composed from a **role dropdown** and **party checkboxes seeded from the document's own
roles/parties** — never free text. `role-id` is unique per document, so an already-assigned role
drops out of the dropdown. Deleting a role or party **cascades**: dependent responsible-parties
are stripped of the reference and removed when they become empty, so no dangling reference can
persist.

### Reference-picking — **workspace-first**
Pickers resolve over **uploaded/created** artifacts now; **BSI-library loading is T-034** (the
next task) and slots into the same pickers. Pickers are source-agnostic about origin.

**In scope this phase:**
- `control-implementation.source` → **pick a catalog** (workspace), via the shared entity-search
  (ADR-0013); this enables `set-parameter.param-id` to be **picked from the resolved catalog's
  params** (ADR-0016 resolution).
- `import-component-definition` → **pick a component-definition** (compose, ADR-0014 / T-102),
  read-only transitive imported view.

**Out of scope this phase (deferred, tracked):**
- **Profiles** entirely — no Profile feature yet; therefore `control-implementation.source →
  profile` and SSP `import-profile → profile` are **not** pickers. SSP `import-profile.href`
  stays a manual/free-text field with a note until the Profile feature lands.
- `statements`, `capabilities`, and component `purpose/props/links/responsible-roles/protocols`.

## Consequences

- A bounded, testable phase: metadata identity fields, a catalog source-picker (+ param picker),
  component-definition compose, and a core SSP editor.
- Pickers are built origin-agnostic, so **T-034** (BSI library) extends them for free.
- Profiles become a distinct later phase; their absence is explicit, not accidental.

## References
- ADR-0003 (models), ADR-0005 (library, deferred to T-034), ADR-0008 (viewer), ADR-0013
  (entity-search pickers), ADR-0014 (compose), ADR-0016 (control resolution). Tickets:
  T-141 (metadata), T-142 (source→catalog + param picker), T-102 (compose), T-111 (SSP core).
