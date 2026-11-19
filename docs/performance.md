# TALOS Performance

Decision IDs: ADR-0002. Verification: todo T-503.

## Budgets (initial targets)
| Metric | Budget |
|---|---|
| App-shell JS (gzip) | ≤ 250 KB |
| Time-to-interactive (landing, mid-tier device) | ≤ 2.5 s |
| Open + render a large catalog / component-definition | ≤ 500 ms after fetch |
| IndexedDB list query (typical workspace) | ≤ 50 ms |
| Entity-search keystroke → results | ≤ 100 ms (debounced 200 ms) |

## Techniques
- **Route-level code splitting** (per feature) so the landing page stays light.
- **Virtualized lists** for large catalogs / long requirement tables.
- **Memoized markup rendering**; optional cache for repeated markup fields `[ADR-0009]`.
- **Incremental search index** rebuilt on store writes; avoid full re-index per keystroke
  `[ADR-0013]`.
- **Lazy library bodies:** fetch catalog/component JSON on open, cache by path+sha `[ADR-0005]`.
- Prefer the dependency-free markup renderer to keep the bundle small `[ADR-0009]`.

## OSCAL schema validation (ADR-0040)
- **Bundle impact** (production build, 2026-11-19, gzip): app shell `index-*.js` **143.7 KB**
  (was 243.5 KB on `main` @ 70c1213; the compliance module + 129 new locale keys per language add
  ~14 KB, and the Management Dashboard — Recharts — is now a lazy route chunk, 113.5 KB, so the shell
  is well inside the 250 KB budget). Lazy validator chunks, loaded on the first check of that model:
  catalog 12.9 KB, component-definition 12.8 KB, profile 16.6 KB, SSP 19.9 KB, shared formats 2.2 KB
  (minified 159–270 KB each; documentation keywords stripped before generation).
- **Cost:** schema validation itself is fast (GS++ resolved catalog, ~7 MB: ~20 ms in Node); the
  dominant cost is building the export document (kebab-case conversion + empty-array pruning) of a
  large catalog. TEST-SCHEMA-02 asserts a 1000-control catalog checks in < 1.5 s (incl. export
  document) under the test runner.
- **Strategy — never per keystroke:** stored records are memoized per `type|uuid|updatedAt`
  (bounded, 500 entries) so a list page, a picker and a detail page share one check per saved
  revision; editor drafts are memoized per object identity and debounced 600 ms
  (`DRAFT_COMPLIANCE_DEBOUNCE_MS`); pickers validate their candidates once on mount, sequentially.
  `getComplianceStats().totalMs` and the per-check `durationMs` log field show the real cost.
- **If it becomes a problem:** move the check to a Web Worker (CSP `default-src 'self'` allows
  same-origin workers) — a follow-up, not needed at today's sizes.

## Measurement
- Vite bundle-size report in CI; fail the build if the shell budget regresses.
- Lighthouse (Playwright) run for TTI on the landing route.
- Micro-benchmarks for codec round-trip and IndexedDB queries on representative BSI fixtures.

## Observability
Structured logs include timing for library fetch, validation, and export; slow operations warn
(yellow) `[ADR-0002]`.
