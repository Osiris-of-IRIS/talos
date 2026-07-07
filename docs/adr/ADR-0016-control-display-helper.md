# ADR-0016: Reusable Control-Display Helper

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0016 (references ADR-0008, ADR-0009, ADR-0010, ADR-0011)

## Context

Controls are referenced throughout the app (component-definition `implemented-requirements`,
SSP `implemented-requirements`, profiles). Wherever a control is shown we want one consistent,
compact rendering rather than ad-hoc markup. The supervisor specified the exact presentation,
confirmed against BSI catalog data (`{{ insert: param, <id> }}` insertions; `alt-identifier`
prop = uuid; `class`; statement/guidance `parts`).

## Decision

A single reusable helper — pure functions in `src/models/controlDisplay.ts` and a
`<ControlDisplay>` component (`src/features/shared/`) — renders a resolved OSCAL `control`:

1. **Headline:** `{label} {title}`, where **label** is the control's `prop name="label"` value,
   falling back to `control.id` when absent (BSI controls carry no `label`, so the id is shown).
2. **Statement:** the control's `statement` part prose, truncated to the **first 180 characters**
   (measured on the display string after insertions are resolved).
3. **Parameter insertions:** occurrences of `{{ insert: param, <param-id> }}` are replaced with
   `< {value} >`, where value = the resolved param **values** (from the referencing
   `set-parameters`, else the param's own `values`) or, if none, the param **label** (else id).
   These tokens are coloured with the **params accent** (ADR-0010/0011, `#f97316`) via a
   `control-param` class.
4. **Tooltip (hover/focus):** shows the control `id`, `uuid` (= the `alt-identifier` prop),
   `class`, and **all** parts (each part's name + prose).
5. **Headline click → external viewer:** opens the catalog in the BSI Stand-der-Technik-Viewer
   in a new tab (ADR-0008). The concrete viewer href is supplied by the caller (the resolution
   layer owns how the catalog URL is built); when absent, the headline renders as plain text.

Rendered prose goes through the safe markup renderer (ADR-0009). The component is decoupled from
catalog resolution: it takes an already-resolved `control` plus optional `set-parameters` and a
viewer href, so it is reused unchanged by every feature.

## Consequences

**Positive:** one consistent, accessible control rendering; param substitution and colouring are
centralized and testable; viewer hand-off matches ADR-0008.
**Negative:** requires the control to be resolved from a (cached) catalog first — a separate
concern; until catalog resolution exists, callers pass controls they already hold.

## References
- BSI catalog data (insert syntax, `alt-identifier`, parts). ADR-0008 (viewer), ADR-0009
  (markup), ADR-0010/0011 (params colour/symbols). Model: `src/models/control.ts`.
