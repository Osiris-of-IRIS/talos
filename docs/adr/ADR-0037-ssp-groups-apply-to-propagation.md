# ADR-0037: SSP Groups & "Apply to..." Change Propagation

- **Status:** Approved
- **Date:** 2026-07-13
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0037 (references ADR-0003, ADR-0004, ADR-0011, ADR-0023, ADR-0031)

## Context

`todo.md`'s "MVP Feedback" section (2026-07-13, second item) asked for a way to apply a change
made to one SSP — an implementation-status edit, a description edit, or importing a component —
to (1) every other SSP with the same asset type, and (2) every other SSP in the same group,
explicitly noting groups don't exist yet and need "SSPs in multiple nested groups". Unlike the
Component-Definition Assistant (ADR-0036), this ticket has two genuinely separate parts: a new
organizational data model (groups), and a propagation engine that uses it.

## Decision

### 1. Asset-type grouping needs no new data model — it's already there

A bootstrap-generated per-asset SSP (ADR-0026) already carries exactly one `inventory-item` with
an `asset-type` prop (ADR-0031). `getSspAssetType` (`src/features/ssps/sspAssetType.ts`) reads it
directly. A hand-authored SSP has no inventory-item and is simply not eligible for asset-type
propagation — an accepted limitation, not a gap to build around, since the feature request's own
framing is about environments bootstrapped from an asset list.

### 2. SSP Groups: a new user-authored tree, not an OSCAL artifact

`SspGroup` (`src/models/sspGroup.ts`: `uuid`/`title`/`parentGroupUuid?`) is TALOS-internal
organizational data — same tier as `AssetType`/`Asset` (ADR-0026), not an OSCAL artifact type.
It gets its own `sspGroups` IndexedDB store (`db.ts`, `DB_VERSION` 5→6, additive-only migration)
and CRUD repository (`src/data/sspGroupRepository.ts`). Unlike `AssetType` (CSV-upload-only, no
manual CRUD UI existed anywhere in the app before this), groups are the first purely
user-authored taxonomy TALOS has — a new page, `SspGroupsPage.tsx` (`/ssp-groups`, Data layer nav
card, symbol 🗂️), provides add/rename/reparent/delete over a flat list rendered with
depth-indentation (`groupDepth`, walking `parentGroupUuid` to the root — mirrors
`ancestorChain`'s depth-counting, ADR-0026).

**Deleting a group reparents its direct children to its own parent** (cascade up one level) rather
than orphaning or cascade-deleting the subtree — a branch deletion should not take its contents
down with it, matching the least-surprise "delete a folder, its contents move up one level"
convention. The parent-picker (both the CRUD page and, implicitly, membership) excludes a group's
own descendants from its own reparent options (`descendantChain`-based exclusion) so a cycle can
never be created through the UI.

### 3. Group membership: `metadata.props`, not `system-characteristics.props` (human supervisor decision)

An SSP's group membership is a single `metadata.props[name="groups"]` entry holding a
comma-separated list of group uuids (`src/data/sspGroupMembership.ts`) — the exact same shape as a
control's `tags` prop (`controlTags.ts`, ADR-0032 §4). `metadata` (not `system-characteristics`)
was the explicit choice: it's the OSCAL-standard place for artifact-level classification props,
shared across every artifact type's base shape (`OscalArtifact.metadata.props`), not an SSP-only
side channel — membership round-trips through ordinary OSCAL export/import like any other prop,
no TALOS-specific extension to the wire format. An SSP can belong to several groups at once (the
prop holds every uuid, not just one) — a checkbox list in `SspEditorPage`'s new "Groups" fieldset
toggles membership; a dangling group-uuid reference (its group was since deleted) is a soft
reference, simply resolved to nothing rather than treated as an error.

### 4. Propagation targets are always the source SSP's own scopes — never an arbitrary pick

`propagationScopesFor(ssp, groups)` returns exactly: the SSP's own asset-type (if any) plus one
scope per group it's a member of (if any) — never lets the user pick an unrelated group from a
workspace-wide list. This matches the ticket's literal wording ("all other SSPs for **the same**
asset type" / "**the same** group") and keeps the UI to a small, predictable button row instead of
a general-purpose broadcast tool. A group scope is **descendant-inclusive**
(`resolveScopeTargets` + `descendantChain`) — applying to a group also reaches every SSP in its
nested subgroups, matching the ticket's own "nested groups" framing and the same
ancestor/descendant-chain pattern ADR-0026 already established for target-object categories.

### 5. Cross-SSP matching keys on shared origin, never a per-SSP uuid

A by-component edit (implementation-status + description) is matched across SSPs by
`controlId` + the component's `source-component-definition-uuid`/`source-component-uuid`
provenance (ADR-0023) — **not** `ByComponent.componentUuid` or `SystemComponent.uuid`, both of
which are freshly minted per-document and never equal across two SSPs even for what a human would
call "the same" shared component. A target SSP missing that control, or having it but not wired to
the same shared component, is **skipped with a stated reason** — propagation only aligns *values*
on structure that already exists; it never creates a control-implementation, a by-component, or an
imported component as a side effect of what looks like a value edit (human supervisor decision,
smaller blast radius than the alternative of silently backfilling structure).

Component-import propagation (`propagateComponentImport`) mirrors `SystemImplementationEditor`'s
single-SSP import button exactly: it adds the `SystemComponent` (via the existing
`importComponentFromDefinition`) and nothing else — no auto-created by-components, matching the
plain editor's own behavior where wiring a component to a control is always a separate manual
step. A target that already has the same shared component (matched by origin, not by re-checking
title/type/description, which the target may have since edited) is skipped.

### 6. UI: one button per scope, bundling status+description into a single action

`<ApplyToControl>` (`src/features/ssps/ApplyToControl.tsx`) renders one "Apply to: {label}" button
per scope, next to each by-component row (`SspControlImplementationEditor`) and each imported
component row (`SystemImplementationEditor`); a toast reports "Applied to N SSP(s)" plus any
skip reasons. It renders nothing (not a disabled placeholder) when the SSP is unsaved (`isNew` —
there's no persisted uuid yet for another SSP to have matched against) or has zero scopes. The
by-component control bundles status **and** description into one propagation action rather than
two separate buttons per the ticket's two example changes — both live on the same `ByComponent`,
and a single "apply this by-component's current state" action is a simpler, still-faithful reading
of "a change made to an SSP" than doubling the button count per row.

## Consequences

**Positive:** groups are reusable organizational data (not single-purpose to this feature) with a
real CRUD page; propagation never silently restructures a target SSP; matching survives a target
having independently edited its own copy of a shared component's title/description.

**Negative:** no arbitrary/cross-cutting group picker in v1 — a source SSP can only propagate to
scopes it's already itself a member of, so "apply this to some other unrelated group I'm not part
of" isn't possible without first joining that group; a hand-authored SSP (no inventory-item) is
permanently ineligible for asset-type propagation.

## References
- ADR-0026 (asset/target-object-category hierarchy, ancestor-chain precedent), ADR-0023
  (component-import provenance, by-component implementation-status), ADR-0031 (inventory-item
  asset-type), ADR-0032 §4 (tags-prop convention this mirrors), ADR-0011 (symbol registry, 🗂️),
  ADR-0004 (persistence/DB versioning).
