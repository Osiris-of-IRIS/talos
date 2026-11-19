# ADR-0040: OSCAL Schema Validation, Draft Export and the Compliance Gate for Workflow Inputs

- **Status:** Approved
- **Date:** 2026-11-19
- **Deciders:** Product owner (Q4 "schema errors at export", 2026-11-16; "`$schema` in exports",
  2026-11-18 — backlog #3), engineering (validation mechanics, error model, UI)
- **Decided by:** product owner (validate on export, draft download with a warning naming every
  non-compliant field, only compliant artifacts feed later steps, valid by construction,
  `$schema`); engineering (everything else)
- **Amends:** ADR-0007 (the schema-validation and schema-bundling bullets are now implemented),
  ADR-0003 (§Validation), ADR-0018 (golden-data scope of the harness), ADR-0019 / T-151 (only the
  creator rule still *blocks* an export; title/version are schema issues).
- **Decision IDs:** ADR-0040

## Context

ADR-0003 and ADR-0007 promised "Ajv validators generated from the vendored NIST schemas; import and
export both validate". Neither existed: `ajv` was an unused dependency, no schema was vendored, and
`validateForExport` checked only title, version and the ADR-0019 creator. The 1.2.3 review
(`reviews/oscal-1.2.3-review.md` R3/R4) and the workflow review (T-02) verified with the NIST 1.2.3
schemas that every TALOS-authored blank or bootstrap SSP, profile and component-definition failed
the schema (empty required arrays, a missing required `description`, no editor for `system-ids` /
`information-types`), while `validateForExport` returned `[]` for all of them. The page's
Content-Security-Policy (`script-src 'self'`, no `'unsafe-eval'`) forbids Ajv's runtime
compilation (`new Function`). BSI publishes at least one schema-invalid artifact upstream
(`implementation_layer/Lieferkettensicherheit/…-component_definition.json`: `links` is an object).

## Decision

### 1. One notion of "valid": OSCAL compliance
An artifact is **compliant** when the document TALOS would export for it (§3) validates against the
vendored NIST OSCAL JSON schema of its model, for the authoring version (1.2.3, ADR-0007) —
regardless of the version the stored document declares. `src/models/compliance.ts` (pure: issue
model, gate decision) and `src/data/complianceCheck.ts` (async check, memoization, logs, metrics)
are the only implementation; export, the compliance gate and every badge use them. A model without
a bundled schema is `unchecked` (assessment layer, later tickets). The ADR-0019 creator rule is a
TALOS policy, not OSCAL compliance: it stays a separate *export blocker* (§5).

### 2. Vendored schemas, validators generated at build time
- `schemas/oscal/1.2.3/oscal_{catalog,profile,component,ssp}_schema.json` are the NIST v1.2.3
  release assets, byte-identical; `MANIFEST.json` records each file's release URL, sha256, `$id`
  and root key. The harness check `schema-snapshot` verifies them (ADR-0018 amendment).
- `tools/oscalValidators.mjs` compiles each schema with Ajv 8 (`strict: false`, `allErrors: true`
  so every field is named, `unicodeRegExp: true` for `\p{L}` tokens, `ajv-formats` full formats)
  into **standalone ES module code** — no `eval`/`new Function` at runtime, so the CSP stays as is.
  Documentation keywords (`title`/`description`/`$comment`) are stripped before generation (about
  half the embedded schema size; property names are kept). The module also exports the schema
  `$id` and a `pattern → OSCAL datatype` map used to explain pattern errors.
- A Vite/Vitest plugin serves them as `virtual:oscal-validator/<artifactType>`; the app imports
  each with a literal dynamic `import()` (`src/models/schemaValidator.ts`), so every model is its
  own lazily loaded chunk. Generation fails the build if the generated code needs any runtime
  module other than `ajv-formats/dist/formats.js`.

### 3. The export document — built once, validated and downloaded identically
`buildExportDocument(type, artifact)` (`src/models/exportDocument.ts`): oscal-version normalized
to the authoring version (ADR-0007), kebab-case wire form (ADR-0003), **empty arrays dropped**
(every array in the 1.2.3 schemas has `minItems: 1`, so `[]` is never valid while an absent
optional array is; an empty *required* array becomes "missing", which the report names), and
**`"$schema"` first** = the NIST `$id` of the model (`http://csrc.nist.gov/ns/oscal/1.2.3/oscal-
{catalog,profile,component-definition,ssp}-schema.json`). `serializeArtifact` is
`JSON.stringify(buildExportDocument(...))`. Import ignores a root `$schema` (ADR-0039), so
round-trips stay lossless.

### 4. Error model and wording
Each issue: JSON pointer into the export document, path segments (OSCAL keys; array items with
an identifying hint — control-id, id, title, name, uuid prefix), a reason code (`required`,
`required-one-of`, `empty`, `datatype`, `format`, `type`, `enum`, `invalid-value`, `unknown-field`,
`no-matching-alternative`, `min-items`, `other`) and string params. OSCAL's `anyOf`s (enum-or-token
values; alternative object shapes such as profile `import`, `merge`, catalog `group`, metadata
`party`) are collapsed: deeper errors win (branch "not mine" discriminators dropped unless every
branch reported them); otherwise one issue (`empty` / `required-one-of` naming the fields /
`invalid-value` / `no-matching-alternative`). Duplicates are reported once. The UI renders
"<field path>: <reason>" from `src/locales/{de,en}.json` (`oscal_field_*` labels, falling back to
the OSCAL JSON key; `compliance_reason_*`) via `src/shared/complianceMessages.ts` — never Ajv's
English text.

### 5. Validate on export (PO Q4)
`useExportDownload` / `useBulkExportDownload` (`src/features/shared/compliance/`):
- **Blocker** (ADR-0019: no creator with name + email) → localized error toast, no download — as
  before. Title and version are no longer blockers (they are required OSCAL fields → §1).
- **Compliant** → download at once.
- **Non-compliant** → the draft dialog names every non-compliant field; the file (with `$schema`)
  is downloaded only after "Download as draft". Nothing in the file marks it as a draft.
- **Bulk zip** (ADR-0027): blocked records are skipped with the existing warning toast; if any
  selected record is non-compliant, one dialog lists every draft with its fields first.
- Draft and compliant downloads are counted and drafts logged (§10).

### 6. The compliance gate for workflow inputs (PO Q4)
Only a compliant artifact may be used as the input of a later step. `gateDecision(report)` is the
single rule and **fails closed**: `unchecked` (no schema) and `pending` (check still running) are
not usable. In the UI, non-compliant candidates are marked "⚠ not OSCAL-compliant" in the picker,
a pick is refused, and a notice names the artifact, says how to fix it (edit and save it; for a
catalog — TALOS cannot edit catalogs — or a library item: correct the source and upload again),
lists the non-compliant fields and links to the artifact.

**Consumption points (all gated):**

| # | Where | Input | Mechanism |
|---|---|---|---|
| G1 | SSP editor › import-profile picker | profile → SSP baseline (and the "add its controls" offer) | `useInputGate.admit` before committing |
| G2 | SSP editor › system-implementation › import component | component-definition → SSP component | `useGatedSelection`, import disabled |
| G2b | SSP editor › refresh a stale imported component | component-definition (re-read) | `admit` before refresh |
| G2c | SSP editor › "Apply to…" component import (ADR-0037) | component-definition → other SSPs | control hidden unless source compliant |
| G2d | SSP editor › by-component description prefill (ADR-0028) | component-definition requirement text | only compliant component-definitions are offered |
| G3 | Profile editor › add import | catalog or profile → profile | `admit` |
| G4 | Profile Creation Assistant › source | catalog or profile | `useGatedSelection`, inclusion steps hidden, Create disabled |
| G5 | Component-definition editor › add / resolve import-component-definition | component-definition → component-definition | `admit` |
| G6 | Component-definition editor › control-implementation source | catalog or profile → component-definition | `admit` (free-text / non-workspace sources pass) |
| G7 | Component-Definition Assistant › source | catalog or profile | `useGatedSelection`, no requirement rows, Create disabled |
| G8 | Bootstrap Assistant › baseline (NIST/BSI catalog; single-system catalog or profile) | catalog / profile → generated SSPs | `useGatedSelection`, Generate disabled |

**Deliberately not gated** (read-only use, or not a later workflow step): detail pages and control
display / title resolution (`useCatalogIndex`, viewer hand-off); the unscoped control-id typeahead
in the SSP requirement editor (a suggestion list, the baseline is the import-profile); the
Management Dashboard (a report over SSPs; gating would hide data rather than protect a step); SSP
groups membership; library browse/adopt and upload (imports, see §7). Transitive inputs — the
catalogs a compliant profile resolves through — are gated where they are picked (G3/G4), not
re-checked when the profile is consumed (follow-up). Future assessment-layer inputs (SSP → AP,
backlog #11) must use `useInputGate`/`useGatedSelection` with the same rule.

### 7. Imported third-party content
Upload and library adopt never fail for schema reasons: the artifact is stored and editable, a
warning toast says it is not compliant (count), its badge lists the fields, and it is blocked as a
workflow input until fixed. Validation uses the 1.2.3 schema even for 1.1.x documents (ADR-0007:
"validate against 1.2.x and warn"), because that is what TALOS exports.

### 8. Valid by construction (where TALOS authors)
- Blank SSP: one `system-ids` entry (`identifier-type` `http://datatracker.ietf.org/doc/html/rfc4122`,
  id = SSP uuid); `users` not emitted (optional since 1.2.0, model field now optional).
- Bootstrap: plans keep the SSP's existing system ids on re-run, otherwise seed the SSP uuid (stable).
- SSP editor: system-ids and information-types (title + description) editors, so every required
  SSP field can be filled in TALOS (components still only by import from a compliant
  component-definition — supervisor decision, ADR-0023).
- Component-definition: `ImplementedRequirement.description` is required in the model; the
  assistant and the editor always write it (empty text is valid markup-multiline).
- Empty arrays never reach a file (§3).
What only a human can supply stays reported, not invented: system name, information types,
components, implemented requirements, profile imports, titles.

### 9. Display and validation strategy
Badges on every list row (catalogs, profiles, component-definitions, SSPs), on detail pages (click
→ modal with all fields) and in editors (the unsaved draft). Checks never run per keystroke:
stored records are memoized per `type|uuid|updatedAt` (bounded, 500), drafts per object identity,
and editors debounce 600 ms; the validator chunk loads on first use.

### 10. Observability
`logger` records with `decision_ids: ["ADR-0040"]` for non-compliant checks (type, issue count,
first pointer, duration), refused gate inputs (consumer, type, reason) and draft exports.
`getComplianceStats()`: checks, compliant/non-compliant/unchecked, cumulative ms, gate
allowed/blocked, compliant/draft exports (low-cardinality counters, no uuids).

## Alternatives considered
- **Runtime Ajv `compile()`** — needs `'unsafe-eval'` in the CSP. Rejected.
- **Committing generated validator code** — ~1.3 MB of generated JS in git, easy to drift from the
  schemas. Rejected for build-time generation from the vendored schemas.
- **One validator over the complete schema** — shared definitions, but one ~300 KB chunk for any
  check. Rejected for per-model lazy chunks.
- **Block non-compliant exports** — contradicts PO Q4 (drafts must remain downloadable).
- **Treat the creator rule as a schema-like draft issue** — would silently relax an approved ADR;
  kept as a blocker (open question to the PO in the backlog #3 report).
- **Python `jsonschema` in the harness** — Python `re` has no `\p{L}`; a second validator could
  disagree with the app's. The harness checks schema integrity; Vitest validates fixtures with the
  production validators.

## Consequences
**Positive:** exported files are checked against the official 1.2.3 schemas and say which schema
they claim; later workflow steps only ever consume compliant inputs; users see exactly which field
to fix, in their language; TALOS-authored artifacts are compliant once a human has supplied the
genuinely required content; CSP unchanged.
**Negative:** a non-compliant imported catalog (TALOS cannot edit catalogs) can only be fixed
outside TALOS; existing workspaces with old drafts now show them as non-compliant and blocked as
inputs until edited; ~14 KB gzip more in the app shell (offset by lazy-loading the dashboard) and
13–20 KB gzip per model chunk on first validation (docs/performance.md).
**Neutral:** JSON-schema validation only — OSCAL metaschema constraints (allowed values with
`allow-other="no"`, cardinality such as `by-component` for `this-system`, cross-references) are not
checked (follow-up).

## Out of scope / follow-ups
Metaschema-constraint validation (e.g. via a future WASM/JS port of oscal-cli rules); native
`implementation-status` and namespaced TALOS props (#6); bootstrap baseline + re-run merge (#7);
portable references (#8); idempotent import (#5); transitive gate on profile sources; a
"this-system" component default (metaschema cardinality); assessment-layer schemas (#11).

## Tests
TEST-SCHEMA-01 (vendoring + generator), -02 (golden contract: valid fixtures, invalid fixtures with
golden `.expected.json` reports, performance), -03 (error model + gate decision), -04 (export
document: `$schema`, pruning, version), -05 (localized wording), -06 (valid by construction:
blanks, editors, assistants, bootstrap), -07 (validate on export: single, draft dialog, creator
blocker, bulk), -08 (gate at G1–G8), -09 (E2E under the real CSP), harness `schema-snapshot`.

## References
- NIST OSCAL v1.2.3 release: https://github.com/usnistgov/OSCAL/releases/tag/v1.2.3 (assets
  `oscal_*_schema.json`; sha256 in `schemas/oscal/1.2.3/MANIFEST.json`).
- `reviews/oscal-1.2.3-review.md` (R3, R4, §5), `reviews/workflow-review.md` (T-02).
- ADR-0002 (CSP / static app), ADR-0003, ADR-0007, ADR-0012, ADR-0018, ADR-0019, ADR-0023,
  ADR-0026, ADR-0027, ADR-0039.
