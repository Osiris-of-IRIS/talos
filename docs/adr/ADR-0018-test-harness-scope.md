# ADR-0018: Test-Harness Scope — Python Contract & Traceability Checker

- **Status:** Approved
- **Date:** 2026-07-03
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0018
- **Relates to:** ADR-0001 (TDD methodology), ADR-0003 (OSCAL data model), ADR-0007 (version support)

## Context

ADR-0001 mandates a declarative test catalog (`tests/tests.yaml`) and a YAML-driven
harness (`tests/test_harness/runner.py`) that "executes the catalog, validates golden
data/schemas, and emits JSON logs + JUnit XML". TALOS is otherwise a pure
JavaScript/TypeScript codebase whose tests already run under **Vitest** (`npm test`)
and **Playwright** (`npm run test:e2e`), both gating the Pages deploy (ADR-0002).

That raises a scoping question: what should the Python harness actually *do*, given the
JS runners already execute the tests? Two options were considered:

1. **Wrapper** — shell out to `npm test` / `npm run test:e2e` from Python and re-emit
   their results. This duplicates the JS gate, couples Python to the Node toolchain,
   and adds no new signal.
2. **Independent contract & traceability checker** — validate the things the JS suite
   does *not*: the auditable ADR ↔ feature ↔ test chain (ADR-0001's core promise) and
   the golden OSCAL fixtures as data.

A second constraint: the NIST OSCAL v1.2.2 JSON Schemas are **not yet vendored** (that
is remaining work in T-030), so full schema validation of fixtures is not yet possible.

## Decision

1. **`runner.py` is an independent contract & traceability gate, not a JS-runner
   wrapper.** The "two runners coexist" note in ADR-0001 is realised as a genuine
   division of labour: Vitest/Playwright execute behaviour; the harness audits
   structure and data. It enforces:
   - **catalog-structure** — every suite/golden entry is well-formed.
   - **file-exists** — every `implemented` suite's file is present.
   - **traceability** — `Covers TEST-*` headers in `tests/` and catalog ids agree
     (a tree id missing from the catalog is an error; a file not naming its own id is
     a warning).
   - **feature-linkage** — suite `feature` ids exist in `feature_registry.yaml`, and
     every registry `linked_test_id` is catalogued.
   - **adr-coverage** — every ADR listed in `adr_coverage_required` has ≥1 *implemented*
     test (ADR-0001 rule 4, guarded against regression).
   - **golden-data** — golden OSCAL fixtures parse, carry the correct single wrapper
     key, required base fields, and `oscal-version` 1.2.2 (ADR-0003/0007); fragments
     are checked for their id field.

2. **The catalog mirrors implementation status.** Suites are `implemented` or
   `planned`; planned suites (features still Draft in `feature_registry.yaml`) need no
   file yet, so `tests.yaml` doubles as a test-side status board.

3. **Full NIST JSON-Schema validation is deferred to T-030** (schema vendoring). Until
   then golden-data checks are structural ("schema-lite"). When schemas land, the
   harness's `golden-data` check is extended to Ajv-equivalent validation; this ADR is
   revisited, not superseded.

4. **Outputs & gate.** The harness emits JSON-lines logs (with `decision_ids`) and a
   JUnit XML report under `test-results/`, exits non-zero on any error, and runs in CI
   (with its own stdlib `unittest` self-tests) *before* the JS suite. PyYAML is its only
   dependency (`tests/test_harness/requirements.txt`).

## Consequences

**Positive**
- The ADR ↔ feature ↔ test chain is now machine-checked; drift (a new test not
  catalogued, a required ADR losing coverage, a feature linking a nonexistent test) is
  caught in CI instead of by review.
- Golden fixtures cannot silently regress base-field/version conformance.
- No Node/Python coupling; the harness runs standalone and fast (< 1s locally).

**Negative**
- A second dependency toolchain (Python + PyYAML) in CI.
- The catalog must be kept in sync when tests are added — but that is exactly the
  traceability discipline the harness now enforces (adding a test without cataloguing
  it fails the build).

**Neutral**
- Golden-data validation is intentionally partial until T-030; documented as such so it
  is not mistaken for full schema conformance.

## References
- ADR-0001 (TDD methodology, catalog + harness requirement).
- ADR-0003 / ADR-0007 (OSCAL data model, v1.2.2 authoring).
- `tests/tests.yaml`, `tests/test_harness/runner.py`, `tests/test_harness/test_runner.py`.
