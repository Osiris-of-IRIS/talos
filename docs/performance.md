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

## Measurement
- Vite bundle-size report in CI; fail the build if the shell budget regresses.
- Lighthouse (Playwright) run for TTI on the landing route.
- Micro-benchmarks for codec round-trip and IndexedDB queries on representative BSI fixtures.

## Observability
Structured logs include timing for library fetch, validation, and export; slow operations warn
(yellow) `[ADR-0002]`.
