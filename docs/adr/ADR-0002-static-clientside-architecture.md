# ADR-0002: Static Client-Side Architecture (React + Vite + TypeScript on GitHub Pages)

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0002

## Context

The mission fixes the hosting target as **GitHub Pages**, which serves **static files only** —
there is no server runtime, no database, and no server-side rendering. Every capability
(OSCAL editing, validation, workflow logic, dashboards, assistants) must therefore run
entirely in the browser.

This rules out any server framework, server-side rendering, database, or backend API: there is
no runtime to host them. Persistence, search, and all workflow logic must be implemented
client-side (see ADR-0004 for persistence, ADR-0013 for search).

The dominant implementation cost is **deeply nested, validation-heavy editors** (SSP
`implemented-requirements → by-components → statements`; component-definition
`control-implementations`; back-matter; parameters). This favors a typed component model over
hand-rolled DOM manipulation.

## Decision

Build TALOS as a **single-page static application**:

- **Framework:** **React** with **TypeScript**, bundled by **Vite** to static assets in `/dist`.
- **Routing:** **`HashRouter`** (`/#/component-definitions/…`) so deep links work on GitHub
  Pages without server rewrite rules. A `404.html` copy of `index.html` is provided as a
  belt-and-braces fallback for any non-hash paths.
- **No backend:** all logic client-side. External network access is limited to fetching the
  read-only BSI library (ADR-0005). User artifacts never leave the device (ADR-0004).
- **Types from the spec:** OSCAL TypeScript models are aligned to NIST OSCAL v1.2.2 JSON
  Schemas; Ajv validates at import/export boundaries (ADR-0003).
- **Vite `base`:** set to the repository Pages sub-path (e.g. `/talos/`) so asset URLs resolve
  under `https://<user>.github.io/talos/`.

### Build & deploy

GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. `npm ci`
2. Lint + typecheck + **full test suite** (ADR-0001) — **blocking gate**.
3. `vite build` → `/dist`.
4. Deploy `/dist` to GitHub Pages (`actions/deploy-pages`).

### Runtime requirements (project standard)

- Console output shows progress/statistics; **warnings in yellow, errors in red** (styled
  console + in-app toasts).
- Structured, JSON-shaped log records include `decision_ids` (ADR IDs) for traceability;
  in the browser this is a logging utility writing structured objects (with a ring-buffer for
  in-app diagnostics) rather than a rotating file handler.
- **Config schema validated at startup** — invalid config fails fast with a clear red error
  (ADR-0004/T-025).

## Alternatives considered

- **Vanilla JS + Vite** — smallest bundle, no framework, but manual state↔DOM
  sync for deep OSCAL trees becomes the primary cost; no compile-time typing. Rejected.
- **Svelte + Vite + TS** — small bundles, clean reactivity, but a smaller ecosystem for
  JSON-Schema forms/tree components. Viable; not selected.
- **Any server framework** — incompatible with the GitHub Pages hosting constraint. Rejected.

## Consequences

**Positive**
- Recursive OSCAL editors map naturally to React components; TypeScript + Ajv catch shape
  errors early.
- Zero hosting cost/ops; fully static, cacheable, offline-capable after first load.
- Data privacy: nothing is sent to a server.

**Negative**
- Larger baseline bundle than vanilla/Svelte; must watch performance budgets (T-503).
- All persistence/limits live in the browser (IndexedDB quota, no cross-device sync) — handled
  in ADR-0004.
- `HashRouter` URLs contain `#`; acceptable trade-off for static hosting.

## References
- ADR-0001 (TDD/CI), ADR-0003 (OSCAL model), ADR-0004 (persistence), ADR-0005 (BSI library).
- GitHub Pages static hosting; `actions/deploy-pages`.
