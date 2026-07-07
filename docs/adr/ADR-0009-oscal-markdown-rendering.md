# ADR-0009: OSCAL Markdown Rendering Strategy

- **Status:** Approved
- **Date:** 2026-07-02
- **Decision IDs:** ADR-0009

## Context

OSCAL uses markdown throughout via the **markup-line** (inline) and **markup-multiline**
(block+inline) datatypes: control titles, part prose, remarks, parameter labels/usage,
metadata descriptions, group titles. TALOS renders these in many places (profile/control
views, component-definition and SSP editors, dashboards, library browser). Rendering must be
**XSS-safe** because OSCAL content may be user-supplied or fetched from the BSI library.

The safe approach is a single shared renderer that HTML-escapes before parsing and enforces a
link-URL allowlist.

## Decision

A single shared TypeScript module **`src/shared/oscalMarkdown.ts`**:

```ts
export function renderInlineMarkdown(text: string): string;      // markup-line
export function renderMultilineMarkdown(text: string): string;   // markup-multiline
export function stripMarkdown(text: string): string;             // plain-text (search/titles)
```

- **Security model (unchanged gist):** (1) HTML-escape all input; (2) apply a safe regex/AST
  subset; (3) sanitize link URLs against an **allowlist** (`http`, `https`, and app-relative
  hash routes only — reject `javascript:`, `data:`, `file:`, `vbscript:`).
- **Supported subset:** bold, italic, code, links, subscript (`~x~`), superscript (`^x^`);
  multiline adds paragraphs. **No** raw HTML passthrough, **no** images (security).
- Consumed in React via a small `<Markup line|multiline value={…}/>` wrapper that sets
  sanitized HTML; no component renders OSCAL markup by hand.
- If a vetted library is used (e.g. `marked` + `DOMPurify`), it is constrained to the subset
  and the same URL allowlist; default is the dependency-free regex renderer for a small bundle.

## Consequences

**Positive:** one XSS-safe renderer, consistent output everywhere, unit-testable edge cases
(script tags, event handlers, malicious URLs, nested formatting, empty/null).
**Negative:** must track OSCAL spec/markdown changes in one place; regex subset needs care.

## References
- NIST Metaschema datatypes (markup-line/markup-multiline). ADR-0003 (models), ADR-0002 (security).
- Test file: `tests/oscalMarkdown.test.ts` (T-036).
