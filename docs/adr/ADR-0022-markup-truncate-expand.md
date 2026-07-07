# ADR-0022: Markup Truncate-and-Expand Display Helper

- **Status:** Approved
- **Date:** 2026-07-07
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0022 (references ADR-0009, ADR-0011, ADR-0016)

## Context

`<Markup>` (ADR-0009) renders OSCAL markup-line/markup-multiline content as safe HTML but never
bounds its size. Component/SSP detail pages call it directly for titles, descriptions, and
remarks — fields that can be arbitrarily long (a control-implementation `description`, an
`implemented-requirement` `remarks`). Rendered at full length these fields blow out list/detail
layouts and make pages with many requirements hard to scan. Supervisor feedback (MVP Feedback,
`todo.md`) asked for one common helper, reused everywhere markup-line/markup-multiline content is
*displayed* (not edited), that truncates by default and lets the user expand to the full,
beautified content — with a consistent field size across the app and more room for multiline
fields than single-line ones.

`<ControlDisplay>` (ADR-0016) already truncates control `statement` prose to a fixed 180
characters with its own tooltip-based full-content affordance, confirmed against BSI catalog
data. That truncation is intentionally bespoke to control statements and is out of scope here —
this ADR does not change it.

## Decision

A single reusable wrapper, **`<MarkupView>`** (`src/shared/MarkupView.tsx`), sits in front of
`<Markup>` and is the only way display code shows markup-line/markup-multiline content going
forward (mirrors the ADR-0009 rule that no component renders OSCAL markup by hand).

1. **Truncation heuristic:** plain-text length (via `stripMarkdown`, ADR-0009), not DOM layout
   measurement — consistent with ADR-0016's existing 180-char precedent and deterministic under
   jsdom/unit tests. Inline (`multiline=false`) fields get a **120-character** budget; multiline
   fields get a **240-character** budget (~2-3 lines), matching the "multiline fields should get
   more space" requirement.
2. **Consistent sizing:** a fixed-width container class (`.markup-view`) with a taller variant
   (`.markup-view--multiline`) so every field of a given kind occupies the same footprint
   regardless of which page it's on.
3. **Expand affordance:** shown **only when the content actually exceeds its budget** (no dead
   controls on short text) — an icon button (ADR-0011 conventions: `aria-label` + `title`) that
   opens a **modal dialog** (`src/shared/Modal.tsx`, a new generic `<dialog>`-based primitive)
   rendering the full content via `<Markup multiline>` regardless of the field's own
   single/multi-line-ness, since the point of expanding is to read everything.
4. **Scope:** applies to all display-only `<Markup>` call sites in feature detail pages
   (component-definition, SSP, …). **Excluded:** `<ControlDisplay>`'s statement/param rendering,
   which keeps its own ADR-0016 truncation so the two strategies don't collide on one primitive.

## Consequences

**Positive:** one consistent, predictably-sized presentation for long OSCAL text everywhere;
truncation is plain-text-based so it's cheap and unit-testable without layout measurement; no
behavior change for short content (no button appears).
**Negative:** the character-budget heuristic is an approximation of "2-3 lines" — a very narrow
container could still wrap a "short" string across more visual lines than intended; acceptable
given the fixed-width sizing this ADR also introduces.

## References
- ADR-0009 (markup renderer), ADR-0011 (symbol conventions), ADR-0016 (control-display's own
  truncation, left unchanged). Test file: `tests/shared/markupView.test.tsx` (T-160).
