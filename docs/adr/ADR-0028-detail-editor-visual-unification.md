# ADR-0028: Detail/Editor Visual Unification — Full-Width Nested Boxes, SSP Control|Implementation Table, By-Component Description Prefill

- **Status:** Approved
- **Date:** 2026-07-08
- **Deciders:** UI experts (reviewer feedback), human supervisor, engineering
- **Decision IDs:** ADR-0028 (references ADR-0003, ADR-0011, ADR-0016, ADR-0017, ADR-0023, ADR-0024)

## Context

UI-expert feedback on the SSP and component-definition editors/detail pages identified four
issues: (1) expandable sections/rows didn't read as one cohesive table — each floated as a
disparate, unbordered block; (2) SSPs' control-implementation requirements were shown as plain
`<code>{control-id}</code>` text with no resolved control info at all, unlike
component-definitions' existing control\|description table; (3) picking a component for an SSP
by-component never looked at what that component's *own* source component-definition already says
about implementing the same control, so authors retyped a description that may already exist; (4)
nesting (a component's control-implementations, a requirement's by-components) wasn't visually
distinguishable from its parent — no border marked where one "object" ended and the next began.

## Decision

### 1. One shared "expandable box" CSS language: `.collapsible-section` / `.collapsible-toggle` / `.collapsible-body`
Added to `app.css`, reusing the exact visual language `fieldset`/`fieldset fieldset` already
established (border, `--radius-lg`, `--color-border-strong`, `box-shadow`, full width) so
detail/read views (which use plain `<div>`/`<section>`, not `<fieldset>`, since they aren't forms)
get the same bordered-box treatment as editor `<fieldset>`s. Nesting one `.collapsible-section`
inside another gets the dashed/no-shadow demotion via a plain descendant selector
(`.collapsible-section .collapsible-section`), mirroring `fieldset fieldset` — hierarchy reads
from the border alone, no extra markup or modifier classes needed. Applied to
`<CollapsibleSection>` itself (SSP's three main sections) **and** to every bespoke
expand/collapse row that doesn't use that component: component-definition's individual components
(editor + detail), SSP's system-implementation components, SSP's control-implementation
requirements and by-components. A stack of these now reads as one continuous table instead of
disparate floating pieces — no new shared React component was introduced (lower risk than
refactoring every page onto one component this pass); the visual unification comes entirely from
sharing CSS class names across otherwise-independent markup.

### 2. SSP control-implementation gets the same control\|implementation table as component-definitions
`compdef-requirements-table`'s CSS was generalized into a shared `.control-requirements-table`
(40%/60% columns) used by **both** pages. `SspDetailPage` now resolves each requirement's
control-id via the same `resolveControl`/`<ControlDisplay>` machinery component-definitions
already use (previously: nothing — SSPs never resolved or displayed anything beyond the raw
control-id string) and renders it in the left 40% column; the right 60% column holds by-components
+ remarks (the "implementing info," structurally different from component-definitions'
description/set-parameters/remarks, but the same column proportions and row-per-requirement
shape). Per supervisor decision, this stops at the **detail (read) page** — the editor
(`SspControlImplementationEditor`) keeps its existing vertical form layout, matching the
precedent that component-definitions' own editor never adopted the table either (only its detail
page did). Removing the per-requirement collapse toggle (every row now shows in full once Control
Implementation is expanded, exactly matching component-definitions' table, which was never
collapsible per-row) was a deliberate simplification enabled by this change, not a separate
decision.

### 3. By-component description prefill from the source component's own matching requirement
`findMatchingRequirementDescription(sc, controlId, workspaceComponentDefinitions)`
(`componentImport.ts`) resolves the `SystemComponent`'s import provenance (ADR-0023) to its source
`DefinedComponent`, then searches **that component's own** `controlImplementations[]` (not the
whole component-definition, not other components in it — components can differ) for an
`implementedRequirement` matching `controlId`; first match wins if the same control-id appears
under more than one of that component's control-implementations. `SspControlImplementationEditor`
calls this the moment a by-component's `component-select` changes, and **only** when the
by-component's `description` is still empty — never re-triggered by a later control-id edit, and
never overwrites text the author already typed. This is prefill, not sync: after the initial
population the two descriptions are independent, editable text.

### 4. Nesting clarity is the same mechanism as item 1, not a separate change
The supervisor's "borders around the whole object, nesting subsets inside that border" request is
satisfied by the same `.collapsible-section` nesting rule from decision 1 — a by-component row
(`bc-row`) now gets `.collapsible-section` too (a static bordered box, no collapse toggle needed;
the class only supplies the border/spacing) so it reads as a distinct nested object inside its
parent requirement's box, exactly like `fieldset fieldset` already did for
component-implementations/requirements in the component-definition editor.

## Consequences

**Positive:** one CSS vocabulary now describes "this is a boxed, possibly-nested object" across
every editor and detail page, form or not; SSPs finally resolve and display controls at all in
their detail view (a real functional gap, not just cosmetic); by-component authoring gets a
real head start when the underlying component already documents the same control elsewhere.
**Negative:** no shared React component was extracted for the box pattern — it's CSS-class
convention only, so a future page implementing its own expand/collapse must remember to apply the
same three class names by hand (not enforced by the type system); the SSP editor and detail page
now differ more visibly in structure (vertical form vs. 40/60 table) than before, which is
consistent with the existing component-definition precedent but is a real asymmetry a future
reviewer could reasonably question; the prefill only ever looks inside the *same* component, so an
SSP with two different by-components implementing the same control from two different source
components won't cross-pollinate descriptions (deliberate, per supervisor: "it has to be in the
same component").

## References
- ADR-0003 (OSCAL model), ADR-0011 (interactive symbols/Δ badge), ADR-0016 (`<ControlDisplay>` /
  control resolution), ADR-0017 (SSP editor phase-1 scope), ADR-0023 (component import provenance
  this prefill builds on), ADR-0024 (the `fieldset`/`fieldset fieldset` nesting precedent this
  generalizes to non-form views). Implementation: `src/app/app.css` (`.collapsible-section` /
  `.control-requirements-table`), `src/shared/CollapsibleSection.tsx`,
  `src/features/componentDefinitions/{ComponentDefinitionEditorPage,ComponentDefinitionDetailPage}.tsx`,
  `src/features/ssps/{SspDetailPage,SystemImplementationEditor,SspControlImplementationEditor,SspEditorPage}.tsx`,
  `src/features/ssps/componentImport.ts` (`findMatchingRequirementDescription`). Tests:
  `tests/shared/CollapsibleSection.test.tsx`, `tests/features/sspDetailControlResolve.test.tsx`,
  extended `componentDefinitions.test.tsx`, `componentDefinitionEditor.test.tsx`,
  `sspEditor.test.tsx`, `ssps.test.tsx`, `componentImport.test.ts` (TEST-COLLAPSE-02,
  TEST-SSP-RES-01).
