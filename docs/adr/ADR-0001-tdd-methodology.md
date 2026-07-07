# ADR-0001: Test-Driven Development Methodology

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0001

## Context

TALOS builds and edits OSCAL artifacts whose correctness is defined by an external
specification (NIST OSCAL v1.2.2). Round-trip fidelity (import → edit → export) and schema
conformance are the core quality attributes: a silently dropped field or malformed export
breaks downstream compliance tooling. This risk profile makes a **documentation-first,
test-driven** methodology the appropriate default rather than an optional practice.

Because TALOS is a **static client-side app** (see ADR-0002) there is no server test bed;
tests must run in the browser/JS toolchain and in CI on GitHub Actions.

## Decision

Adopt TDD as a binding project rule:

1. **Documentation first.** Every lasting decision is captured as an ADR before code; each
   feature is registered in `docs/feature_registry.yaml` with acceptance criteria and linked
   test IDs before implementation.
2. **Tests before/with code.** For each feature or bug, define the test (in `tests/tests.yaml`
   and the corresponding test file) before or alongside the implementation. Code is "done"
   only when its linked tests pass.
3. **Golden data + schema snapshots.** OSCAL round-trip and contract tests use golden
   artifacts and NIST JSON-Schema snapshots stored under `tests/data/`. Any intentional change
   to output updates the golden file in the same commit.
4. **Coverage of every ADR.** Each ADR that has runtime behavior must have at least one linked
   test. Supervisor decisions are treated as ADRs and likewise tested.
5. **New scenario → stop and test.** When a new scenario surfaces mid-implementation, add the
   test (+ golden data) first, then implement.

### Tooling

| Layer | Tool | Notes |
|---|---|---|
| Unit / component | **Vitest** + **React Testing Library** | Fast, Vite-native, jsdom. |
| OSCAL schema / contract | **Ajv** against NIST JSON Schemas | Validates every import/export. |
| Golden round-trip | Vitest + fixtures in `tests/data/` | import(json) → model → export(json) deep-equals. |
| End-to-end | **Playwright** | Landing → feature → upload/edit/download flows in a real browser. |
| YAML-driven harness | `tests/test_harness/runner.py` | Executes `tests/tests.yaml`, validates golden data/schemas, emits JSON logs + JUnit XML (ADR requirement). |

### CI gate

The GitHub Actions pipeline (ADR-0002) runs the full suite; a failing suite **blocks** the
Pages deploy. No advancing to the next task until the suite is green.

## Consequences

**Positive**
- OSCAL fidelity is protected by golden round-trip + schema tests.
- Traceability: ADR ↔ feature-registry ↔ test IDs form an auditable chain.
- Regressions are caught in CI before deploy.

**Negative**
- Upfront cost per feature (write tests + golden data first).
- Golden files must be maintained deliberately when output legitimately changes.

**Neutral**
- Two test runners (Vitest for JS, `runner.py` for YAML-driven contract/golden checks) coexist;
  both emit machine-readable output.

## References
- NIST OSCAL v1.2.2 models (profile, component-definition, SSP, assessment-plan/results, POA&M).
- ADR-0002 (static architecture / CI), ADR-0003 (OSCAL data model + validators).
