# ADR-0024: Editor UX Polish — Markup Editor, Datalist Focus Fix, Back-Matter Source Resolution, Control-ID Typeahead

- **Status:** Approved
- **Date:** 2026-07-08
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0024 (references ADR-0003, ADR-0009, ADR-0011, ADR-0015, ADR-0016, ADR-0017)

## Context

Supervisor feedback on the component-definition editor (todo.md, "user feedback about the
component-definition editing") identified 8 issues. On investigation, most "should be below X"
items were already correctly ordered — the real gaps were **field sizing**, the lack of any
**markdown-aware editing** (every long-text field was a bare `<textarea>`), a **native
`<datalist>` UX bug**, and two **real resolution/data-model gaps**: `control-implementation.source`
skipped the back-matter indirection real OSCAL tooling expects, and the control-id typeahead
showed raw ids instead of anything readable. The supervisor asked for these applied to both the
component-definition and SSP editors.

## Decision

### 1. `<MarkupEditor>` (`src/shared/MarkupEditor.tsx`)
A toolbar (Bold/Italic/Code/Link, wrapping the current textarea selection or inserting a
placeholder at the cursor — ADR-0009's supported subset) plus a Preview toggle that swaps to the
existing `<Markup>` renderer. **Not** an always-on split pane — that would fight the "full width"
requirement and double the UI surface. No new dependency: consistent with ADR-0009's
dependency-free rendering philosophy and the CSP's `default-src 'self'`. Replaces every
long-text field across both editors (`rows=7` for remarks-class fields, `rows=5` for
description-class fields — the supervisor's specific minimums), full width via CSS.
**Testid convention:** the outer wrapper keeps the field's existing testid; the actual textarea is
suffixed `-textarea` (e.g. `ir-description` → `ir-description-textarea`) since the wrapper also
contains toolbar buttons.

### 2. `<DatalistInput>` (`src/shared/DatalistInput.tsx`)
Browsers filter `<datalist>` suggestions against the input's *current* text, so a pre-filled
controlled field appears to offer only its own value until cleared — a well-known native-datalist
gotcha, not a bug in the picker logic. Fix: clear the displayed value on focus (revealing every
option) and restore it on blur if the user typed nothing. Applied to **every** datalist-backed
field in both editors (component type, control-id, param-id, source, SSP status), not just the
one originally reported — same defect, same fix, no reason to leave the others broken.

### 3. Back-matter-mediated `source` resolution (component-definitions only)
`control-implementation.source` previously wrote/read `#<catalog-uuid>` directly. Real OSCAL
expects `#<back-matter-resource-uuid>`, with that resource identifying the actual source via
`document-ids` (then its own uuid, then title, per the supervisor's specified fallback order).
`findCatalogEntry` (`src/data/catalogResolution.ts`) now tries, in order: (1) a back-matter
resource matching the ref, resolved via its `document-ids` → a workspace catalog uuid, else the
resource's own uuid, else its title; (2) the legacy direct-uuid match (kept as a fallback so
already-authored TALOS documents keep resolving). Picking a catalog now calls
`ensureCatalogSourceResource` (`src/models/backMatter.ts`, mirrors `ensureUrlResource`, ADR-0015)
to create/reuse a resource and stores `#<resourceUuid>`. **Does not apply to SSPs** —
`control-implementation` has no per-requirement `source` field there (SSP controls come from
`import-profile`, and profiles are deferred, ADR-0017), so there is nothing to fix on that side.

### 4. Control-id typeahead richness (`controlIdOptionsForSource`, `allControlIdOptions`)
Datalist options now render `getControlHeadline(control)` ("{label|id} {title}", ADR-0016) as
display text while the `value` stays the literal id/alt-id actually written to `control-id` —
`<option value="X">display text</option>` already supports this split, no new widget needed.
Applied to both the source-scoped compdef picker and the unscoped SSP picker (`allControlIdOptions`
iterates every workspace catalog, since SSPs have no source to scope by).

### 5. Field ordering
`<BackMatterEditor>` moves to render **after** all artifact-specific content (matching the NIST
JSON model outline: metadata → body → back-matter) in both `ComponentDefinitionEditorPage` and
`SspEditorPage` — applied to both per the supervisor's explicit "apply to both now."

### A note on a bug found along the way
Wiring back-matter resource creation into the source picker surfaced a real stale-closure race:
two `setDraft(directValue)` calls from the same synchronous event handler (ensuring a back-matter
resource, then patching the component's source field) both cloned from the same pre-event `draft`
closure, so the second call silently discarded the first. Fixed by converting
`ComponentDefinitionEditorPage`'s draft mutators to the functional `setState(prev => next)` form,
which React composes correctly across multiple calls in one batch. Worth remembering as a general
rule: any handler that triggers more than one state update needs the functional form, not direct
values built from a closure variable.

## Consequences

**Positive:** long-text fields are finally editable at a reasonable size with basic formatting
help; datalist pickers behave as users expect on focus; component-definitions authored in TALOS
now produce OSCAL that references catalogs the way real tooling does; control-id suggestions are
actually readable. The stale-closure fix removes a latent bug class other multi-mutation handlers
could have hit later.
**Negative:** `MarkupEditor`'s toolbar only covers ADR-0009's markup subset (no headings, lists,
tables — OSCAL's markup-line/markup-multiline don't support them either, so this is scope-correct,
not a limitation); the back-matter resolution's title-matching tier is a weak, case-sensitive
exact match (acceptable as a last-resort fallback, not the primary path).

## References
- ADR-0009 (markup renderer/subset), ADR-0011 (Δ/▾▸ symbols), ADR-0015 (back-matter resources,
  `ensureUrlResource` precedent), ADR-0016 (`getControlHeadline`), ADR-0017 (SSP phase-1 scope —
  why item 5 doesn't apply to SSPs). Implementation: `src/shared/{MarkupEditor,DatalistInput}.tsx`,
  `src/models/backMatter.ts` (`ensureCatalogSourceResource`), `src/data/catalogResolution.ts`
  (`findCatalogEntry`, `controlIdOptionsForSource`, `allControlIdOptions`). Tests:
  `tests/shared/{MarkupEditor,DatalistInput}.test.tsx`, `tests/models/backMatter.test.ts`,
  `tests/data/catalogResolution.test.ts`, `tests/features/{componentDefinitionEditor,sspEditor}.test.tsx`.
