# TALOS Testing Strategy

Decision IDs: ADR-0001 (TDD), plus per-feature ADRs.

## Principles
- **Documentation-first TDD**: ADR + feature-registry entry before code; tests before/with code;
  code is done only when linked tests pass `[ADR-0001]`.
- Every ADR with runtime behavior has ≥1 linked test. Supervisor decisions are ADRs and tested.
- New scenario mid-implementation → stop, add test + golden data, then implement.

## Test types & tools
| Type | Tool | Scope |
|---|---|---|
| Unit / component | Vitest + React Testing Library (jsdom) | codecs, validators, renderer, search, editors, stores |
| Golden round-trip | Vitest + fixtures | `import(json) → model → export(json)` deep-equal per artifact type |
| Contract / schema | Ajv + vendored NIST v1.2.2 schemas | every import/export validated |
| Integration | Vitest (fake-indexeddb) | persistence repositories, library loader, file I/O |
| E2E | Playwright | one major user flow per feature (see E2E convention below) |
| YAML harness | `tests/test_harness/runner.py` | reads `tests/tests.yaml`; **contract & traceability gate** (ADR-0018) — not a JS-runner wrapper; JSON logs + JUnit XML |

## E2E (Playwright) convention — required for every major feature

Every major, user-facing feature **must** ship at least one Playwright E2E test covering its
primary end-to-end flow. A feature slice is not "done" without it.

- **Location & name:** `tests/e2e/<feature>.spec.ts` (`.spec.ts`, not `.test.ts`, so Vitest
  ignores it — Vitest `exclude` covers `tests/e2e/**`).
- **Run:** `npm run test:e2e`. The Playwright `webServer` starts the Vite dev server at
  `http://localhost:5173/talos/`; base path stays `/talos/` (ADR-0002). Never start a server by
  hand in a test.
- **Selectors:** target stable `data-testid` attributes (e.g. `compdef-list`, `compdef-item`,
  `compdef-upload-input`, `compdef-detail`) or ARIA roles/names — **never** brittle CSS/text-only
  selectors. Each feature adds the `data-testid`s its E2E needs.
- **Isolation:** clear IndexedDB between tests (`afterEach` → `indexedDB.deleteDatabase('talos')`),
  since persistence survives navigations (ADR-0004). Do not rely on test ordering.
- **Scope:** cover the happy path a user actually performs (e.g. upload → list → detail →
  download), plus navigation from the landing page. Exhaustive edge cases stay in Vitest.
- **CI:** `test:e2e` is a **blocking** gate in `.github/workflows/deploy.yml`
  (`playwright install --with-deps chromium` → `npm run test:e2e`) before build/deploy.
- **Reference implementation:** `tests/e2e/componentDefinitions.spec.ts` — copy its shape for
  new features.

## Declarative catalog & harness (`tests/tests.yaml` + `runner.py`) — ADR-0018

`tests/tests.yaml` is the **single source of truth** mapping every test to its feature
(`feature_registry.yaml`) and its ADRs. Each suite is `status: implemented` (has a `file`
that must exist and carry a `Covers TEST-…` header) or `status: planned` (feature still
Draft, no file yet), so the catalog doubles as a test-side status board.

`tests/test_harness/runner.py` is an **independent contract & traceability gate** — it does
*not* run the JS tests (Vitest/Playwright do). It enforces: catalog-structure, file-exists,
traceability (`Covers TEST-*` headers ↔ catalog), feature-linkage, adr-coverage (every ADR in
`adr_coverage_required` keeps ≥1 implemented test), and golden-data (fixtures parse + correct
wrapper/base-fields/`oscal-version` 1.2.2). Full NIST JSON-Schema validation is deferred to
T-030. It emits `test-results/harness-log.jsonl` + `test-results/harness-junit.xml`, exits
non-zero on failure, and gates CI ahead of the JS suite.

- **Run locally:** `npm run test:harness` (needs `pip install -r tests/test_harness/requirements.txt`).
- **Self-tests:** `python -m unittest discover -s tests/test_harness -p 'test_*.py'`.
- **Adding a test:** add its `Covers TEST-…` header *and* a catalog entry — the harness fails
  the build if a test is uncatalogued or a required ADR loses coverage.

## Golden data & snapshots
- `tests/data/` holds golden OSCAL artifacts and JSON-Schema snapshots.
- Intentional output changes update the golden file **in the same commit**, with rationale.
- BSI-derived fixtures retain CC-BY-SA-4.0 attribution.

## Coverage focus
- OSCAL fidelity (no dropped/mangled fields), XSS in markup `[ADR-0009]`, cycle handling in
  imports `[ADR-0014]`, uuid-collision behavior `[ADR-0004]`, version-warning on import
  `[ADR-0007]`, mandatory-creator validation + export gate `[ADR-0019]`, referential integrity of
  responsible-parties `[ADR-0017]`, i18n key parity `[ADR-0012]`, unresolved-reference preservation.

## CI gate
GitHub Actions runs lint + typecheck + the full suite; a failure **blocks** the Pages deploy
`[ADR-0002]`. `runner.py` emits JUnit XML consumed by the workflow.

## Metrics
Track change-failure rate and MTTR (final report, T-506); flaky tests are quarantined with an
issue, not ignored.
