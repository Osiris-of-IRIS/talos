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
| [ADR-0020](adr/ADR-0020-visual-theme-cretan-bronze.md) | Visual Theme — "Ancient Guardian" (Cretan Bronze Motif) | Approved | ADR-0020 |
| [ADR-0021](adr/ADR-0021-control-id-resolution.md) | Control-ID Resolution (Literal ID vs. Alt-Identifier UUID Reference) | Approved | ADR-0021 |
| [ADR-0022](adr/ADR-0022-markup-truncate-expand.md) | Markup Truncate-and-Expand Display Helper | Approved | ADR-0022 |
| [ADR-0023](adr/ADR-0023-ssp-component-import-staleness.md) | SSP Component Import, Staleness Tracking & Implementation-Status Convention | Approved | ADR-0023 |
| [ADR-0024](adr/ADR-0024-editor-ux-polish.md) | Editor UX Polish — Markup Editor, Datalist Focus Fix, Back-Matter Source Resolution, Control-ID Typeahead | Approved | ADR-0024 |
| [ADR-0025](adr/ADR-0025-universal-markup-editor-adoption.md) | Universal `<MarkupEditor>` Adoption for OSCAL `markup-multiline` Fields | Approved | ADR-0025 |
| [ADR-0026](adr/ADR-0026-ssp-bootstrap-methodology.md) | SSP Bootstrap Assistant — Asset Model, Target-Object-Category Hierarchy & Generation Methodology | Approved | ADR-0026 |
| [ADR-0027](adr/ADR-0027-bulk-artifact-selection.md) | Bulk Artifact Selection — Multi-Delete & Zip/CSV Bundle Download | Approved | ADR-0027 |
| [ADR-0028](adr/ADR-0028-detail-editor-visual-unification.md) | Detail/Editor Visual Unification — Full-Width Nested Boxes, SSP Control\|Implementation Table, By-Component Description Prefill | Approved | ADR-0028 |
| [ADR-0029](adr/ADR-0029-sidebar-navigation-branding.md) | Sidebar Navigation, Logo Branding, Configurable Hero Background | Approved | ADR-0029 |
| [ADR-0030](adr/ADR-0030-expanded-markup-rendering.md) | Expanded OSCAL Markup Rendering — Full Metaschema Subset | Approved | ADR-0030 |
| [ADR-0031](adr/ADR-0031-asset-inventory-oscal-alignment.md) | Asset Inventory Data Structure — OSCAL Alignment & Inventory-Item Generation | Approved | ADR-0031 |
| [ADR-0032](adr/ADR-0032-profile-tailoring.md) | OSCAL Profile CRUD, Tailoring Model & the Profile Creation Assistant | Approved | ADR-0032 |
| [ADR-0033](adr/ADR-0033-global-default-creator-settings.md) | Global Default Creator Identity & Settings Page | Approved | ADR-0033 |
| [ADR-0034](adr/ADR-0034-management-dashboard-control-coverage.md) | Management Dashboard — Page Shell, Charting Dependency & Control Coverage Aggregation | Approved | ADR-0034 |
| [ADR-0035](adr/ADR-0035-risk-coverage.md) | Risk Coverage — Per-SSP Threat/Control Aggregation & Threat Catalog Loader | Approved | ADR-0035 |

## Notes

- New ADRs take the next free number in sequence.
- Every ADR with runtime behavior must have ≥1 linked test (ADR-0001).
