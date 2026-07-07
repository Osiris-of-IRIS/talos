# ADR Registry

Canonical index of Architecture Decision Records for TALOS. ADRs are numbered continuously in
the order decisions were made.

| ADR | Title | Status | Decision IDs |
|-----|-------|--------|--------------|
| [ADR-0001](adr/ADR-0001-tdd-methodology.md) | Test-Driven Development Methodology | Approved | ADR-0001 |
| [ADR-0002](adr/ADR-0002-static-clientside-architecture.md) | Static Client-Side Architecture (React + Vite + TS, GitHub Pages) | Approved | ADR-0002 |
| [ADR-0003](adr/ADR-0003-oscal-artifact-data-model.md) | Reusable OSCAL Artifact Data Model | Approved | ADR-0003 |
| [ADR-0004](adr/ADR-0004-clientside-persistence.md) | Client-Side Persistence (IndexedDB + File I/O) | Approved | ADR-0004 |
| [ADR-0005](adr/ADR-0005-bsi-library-integration.md) | BSI Stand-der-Technik-Bibliothek Integration | Approved | ADR-0005 |
| [ADR-0006](adr/ADR-0006-landing-page-navigation.md) | Landing Page & Feature Navigation Hub | Approved | ADR-0006 |
| [ADR-0007](adr/ADR-0007-oscal-version-support.md) | OSCAL Version Support & Compatibility | Approved | ADR-0007 |
| [ADR-0008](adr/ADR-0008-external-catalog-viewer.md) | Catalog & Control Viewing via External SdT-Viewer | Approved | ADR-0008 |
| [ADR-0009](adr/ADR-0009-oscal-markdown-rendering.md) | OSCAL Markdown Rendering Strategy | Approved | ADR-0009 |
| [ADR-0010](adr/ADR-0010-color-palette.md) | Color Palette (OSCAL layers) | Approved | ADR-0010 |
| [ADR-0011](adr/ADR-0011-ui-symbol-conventions.md) | UI Symbol Conventions | Approved | ADR-0011 |
| [ADR-0012](adr/ADR-0012-i18n.md) | Internationalization (de/en) | Approved | ADR-0012 |
| [ADR-0013](adr/ADR-0013-entity-search-widget.md) | Shared Entity-Search Widget | Approved | ADR-0013 |
| [ADR-0014](adr/ADR-0014-import-component-definition.md) | Import-Component-Definition Composition | Approved | ADR-0014 |
| [ADR-0015](adr/ADR-0015-back-matter-resources.md) | Back-Matter Resource Management & Embedded-File Limits | Approved | ADR-0015 |
| [ADR-0016](adr/ADR-0016-control-display-helper.md) | Reusable Control-Display Helper | Approved | ADR-0016 |
| [ADR-0017](adr/ADR-0017-authoring-scope-phase1.md) | Authoring Scope & Cross-Artifact Reference-Picking (Phase 1) | Approved | ADR-0017 |
| [ADR-0018](adr/ADR-0018-test-harness-scope.md) | Test-Harness Scope (Python contract & traceability checker) | Approved | ADR-0018 |
| [ADR-0019](adr/ADR-0019-mandatory-creator-identity.md) | Mandatory Creator Identity (name + email), enforced at export | Approved | ADR-0019 |
| [ADR-0020](adr/ADR-0020-visual-theme-stargate-egyptian.md) | Visual Theme — "Ancient Guardian" (Stargate / Egyptian Motif) | Approved | ADR-0020 |
| [ADR-0021](adr/ADR-0021-control-id-resolution.md) | Control-ID Resolution (Literal ID vs. Alt-Identifier UUID Reference) | Approved | ADR-0021 |
| [ADR-0022](adr/ADR-0022-markup-truncate-expand.md) | Markup Truncate-and-Expand Display Helper | Approved | ADR-0022 |

## Notes

- New ADRs take the next free number in sequence.
- Every ADR with runtime behavior must have ≥1 linked test (ADR-0001).
