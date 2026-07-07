# ADR-0015: Back-Matter Resource Management & Embedded-File Limits

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0015 (references ADR-0003, ADR-0004)

## Context

OSCAL `back-matter` holds `resources` — the canonical place for external documents, citations,
and embedded files. Elsewhere in a document, `link` objects (in `metadata`, on components,
requirements, etc.) carry an `href`. When those hrefs are raw external URLs scattered across the
document, the same reference is duplicated, cannot carry a title/hash/citation, and is harder to
manage or round-trip cleanly.

OSCAL's intended pattern is: **put the external reference in a back-matter `resource` and point
`link.href` at it with an internal fragment `#<resource-uuid>`.** Resources may also **embed a
file** as base64. Since TALOS stores everything in IndexedDB and embeds files directly in the
exported JSON (ADR-0004), unbounded embedding would bloat storage and every document.

## Decision

### 1. Links become back-matter references
When a user adds/edits a `link` whose `href` is an **external URL** (`http(s)://`), TALOS
**externalizes** it: it ensures a back-matter `resource` exists (with an `rlink` to the URL and
an optional title), then stores the link as `href: "#<resource-uuid>"`. This is the default,
applied uniformly to links in `metadata` and on nested objects (components, requirements, …).

- **Dedupe:** resources are deduplicated by normalized `rlink.href`, so the same URL yields one
  resource reused by many links.
- **Not forced everywhere:** already-internal (`#…`) and app-relative (`/…`, `#…` route) links
  are left as-is. A user may keep a plain external link if they explicitly opt out, but the
  authoring default is externalization.
- **Round-trip:** import preserves existing back-matter and `#`-refs verbatim; unresolved
  `#`-refs are kept (ADR-0003 fidelity), never dropped.

### 2. Embedded files (base64) size limit
A resource may embed a file via `base64 { filename, media-type, value }`.

- **Hard limit: 5 MiB raw** per file (before base64 encoding) — `backMatter.maxEmbeddedFileBytes`
  in config (`5 * 1024 * 1024`). Uploads over the limit are **rejected** with a clear red error.
- **Soft warning at 1 MiB** — the UI warns (yellow) that the file materially enlarges the
  document and suggests referencing by URL instead.
- **Alternative for large files:** add the file as an `rlink` (URL reference) rather than an
  embedded base64 resource.
- The limit is centralized so it is enforced identically in the upload path and any import path.

### 3. Where this lives
`src/models/backMatter.ts` owns the pure helpers (`ensureUrlResource`, `addFileResource`,
`externalizeLink`, base64 encode/decode with the size guard, dedupe). The shared Back-Matter
editor (ADR-0003 reusable base) consumes them; feature editors never hand-roll resource logic.

## Consequences

**Positive**
- External references are consolidated, titled, de-duplicated, and cleanly round-tripped.
- Documents and IndexedDB stay bounded; large evidence is referenced, not embedded.
- One implementation of resource/link/base64 logic, reused by every artifact type.

**Negative**
- Externalization changes `link.href` on save (from a URL to `#uuid`); users must understand the
  back-matter indirection (surfaced in the editor UI).
- A configurable limit means very large embedded files are unsupported by design (mitigated by
  URL rlinks).

## References
- NIST OSCAL back-matter / resource model; `link` datatype.
- ADR-0003 (reusable base + back-matter editor), ADR-0004 (IndexedDB/export size), ADR-0009
  (rendered titles), ADR-0014 (import-component-definition also emits back-matter references).
