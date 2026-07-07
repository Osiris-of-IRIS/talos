# ADR-0021: Control-ID Resolution (Literal ID vs. Alt-Identifier UUID Reference)

- **Status:** Approved
- **Date:** 2026-07-07
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0021 (references ADR-0003, ADR-0005, ADR-0008, ADR-0016)

## Context

`implemented-requirements[].control-id` (component-definitions, ADR-0014; SSPs) is a free-text
reference into a source catalog. In BSI Stand-der-Technik-Bibliothek data it takes **two
different forms** and TALOS must resolve both:

1. The control's own OSCAL `id`, e.g. `SENS.4.1.2`.
2. A synthetic, underscore-prefixed UUID, e.g. `_0573247f-65f3-4768-9d27-6c9c0f42c6cd` — OSCAL
   ids must be valid XML NCNames (cannot start with a digit), so a raw UUID is written with a
   leading `_`. This form must be resolved by matching the referenced control's **`alt-identifier`
   prop** value (bare UUID, no leading `_`), not its `id`.

Confirmed against real upstream BSI data: the `Passwortrichtlinie` component-definition's
`control-implementations[].implemented-requirements[].control-id` values (e.g.
`_0573247f-65f3-4768-9d27-6c9c0f42c6cd`) reference the `Grundschutz++` catalog
(`control-implementation.source = "#11111111-1111-4111-8111-111111111111"`, the catalog's own
`uuid`), whose control `SENS.4.1.2` carries `props: [{ "name": "alt-identifier", "value":
"0573247f-65f3-4768-9d27-6c9c0f42c6cd" }]`.

**Current gap:** `indexCatalogControls` (`src/data/catalogResolution.ts`) indexes controls only by
literal `control.id`. Resolving an alt-identifier-form `control-id` against a real BSI catalog
(e.g. Passwortrichtlinie + Grundschutz++) fails today — `resolveControl` returns `undefined`, so
`<ControlDisplay>` (ADR-0016) falls back to unresolved/plain rendering even though the reference
is valid. This ADR documents the resolution rule; implementation and tests are tracked as a
follow-up (`todo.md`, `TEST-CTRLID-01`).

## Decision

### Resolution algorithm
Given a `control-id` string and a scoped catalog's indexed controls:

1. **Alt-identifier form:** if the string matches `^_[0-9a-fA-F-]{36}$` (a leading underscore
   followed by a UUID), strip the leading `_` and resolve by looking up a control whose
   `alt-identifier` prop (`propValue(control.props, 'alt-identifier')`, already used by
   `controlDisplay.ts` for the ADR-0016 tooltip) case-insensitively equals the remaining UUID.
2. **Literal form:** otherwise, resolve by the control's own `id` (existing behavior, unchanged).
3. **Indexing:** `indexCatalogControls` builds one `id → Control` map per catalog containing
   **both** keys for every control — its literal `id` and, when present, its alt-identifier value
   re-prefixed with `_`. A `_`-prefixed key can never collide with a real BSI control id (BSI ids
   are dot-separated mnemonics, e.g. `SENS.4.1.2`; none start with `_`), so both forms share one
   map and one O(1) lookup with no ambiguity.
4. **Unresolved either way:** falls through to the existing unresolved-reference treatment
   (ADR-0010 amber, ADR-0014 verbatim-preserved reference) — never silently dropped.

This is resolution logic only; it does not change the MVP's workspace-wide catalog matching
scope (source-scoped resolution refinement remains T-140, ADR-0005/ADR-0008 catalog/viewer
hand-off is unaffected).

### Why not resolve by uuid alone (dropping the `_` requirement)
Requiring the exact `_{uuid}` shape (rather than treating any bare UUID-looking `control-id` as an
alt-identifier lookup) avoids ambiguity with catalogs that legitimately use bare UUIDs as their
literal control `id` — the underscore prefix is the actual OSCAL/NCName convention BSI data uses
to signal "this is a UUID reference," so checking for it keeps the two resolution paths
unambiguous rather than heuristic.

## Consequences

**Positive:** component-definitions/SSPs authored against real BSI catalogs (e.g.
Passwortrichtlinie ↔ Grundschutz++) resolve correctly instead of silently showing as unresolved;
one shared, testable rule for both consumers (component-definitions, SSPs); no change to public
resolution API shape (`resolveControl`, `paramsForControl`, `controlIdsForSource` keep their
signatures — only the index they read gains alt-identifier keys).
**Negative:** a second index entry per control (memory overhead is negligible — one extra map key
for controls that carry `alt-identifier`); catalogs with malformed/duplicate `alt-identifier`
values would need a first-wins rule identical to the existing same-id collision handling.

## References
- BSI catalog/component-definition data (`Anwenderkataloge/Grundschutz++`,
  `Implementierungsbeschreibungen/Komponenten/Passwortrichtlinie`), fetched from
  `raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek` (ADR-0005) and confirmed
  2026-07-07. ADR-0003 (control model), ADR-0008 (viewer hand-off), ADR-0016 (`alt-identifier` /
  tooltip, `controlDisplay.ts`). Implementation: `src/data/catalogResolution.ts`.
