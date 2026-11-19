# ADR-0007: OSCAL Version Support & Compatibility

- **Status:** Approved — **amended 2026-11-16** (see "Amendment 2026-11-16" below): authoring/export
  target is now **OSCAL v1.2.3**; other 1.2.x patch versions import without a warning; library loads
  apply the same policy as uploads. Where the original text and the amendment disagree, the
  amendment wins. Schema validation + bundling implemented by **ADR-0040** (2026-11-19).
- **Date:** 2026-07-02 (amended 2026-11-16)
- **Deciders:** Human supervisor (Q1 of technical-design clarification), engineering; amendment:
  product owner (backlog #2, PO decisions Q2 + Q3 of 2026-11-16)
- **Decided by:** product owner (amendment: version bump, 1.2.x warning policy); engineering
  (implementation mechanics)
- **Decision IDs:** ADR-0007

## Context

OSCAL is versioned; documents declare their version in `metadata.oscal-version`. TALOS authors
new artifacts and imports existing ones (user files and the BSI library). Different producers
emit 1.0.x, 1.1.x, or 1.2.x. We need a clear, bounded compatibility policy so authoring stays
simple while imports remain lossless, without committing to a full multi-version converter now.

## Decision

- **Authoring target: OSCAL v1.2.2** *(amended: now v1.2.3)*. All artifacts *created* in TALOS,
  and all *exports*, use `oscal-version: "1.2.2"` and are validated against the v1.2.2 JSON
  Schemas (ADR-0003).
- **Import: accept any OSCAL 1.x.** On import, TALOS reads and stores the document as-is,
  preserving its declared `oscal-version`.
  - If the version differs from 1.2.2, surface a **yellow warning** ("imported as <version>;
    exporting will normalize to 1.2.2") — never a hard failure. *(Amended: no warning for other
    1.2.x patch versions.)*
  - Validate against the document's own schema version when that schema is bundled; otherwise
    validate against 1.2.2 and warn that validation used a different version.
- **No automatic up-/down-conversion** of the body in v1. A field that exists only in a newer
  version is preserved on round-trip where the model allows; genuinely incompatible constructs
  are flagged, not silently dropped (parallels the unresolved-reference policy, ADR-0003/0099).
- **Export normalization:** on export, `oscal-version` is written as 1.2.2 (the authored
  version); the user is informed when the source was a different version.
- **Schema bundling:** the v1.2.2 JSON Schemas are vendored into the repo; older-version schemas
  may be added later to enable exact-version validation.

## Amendment 2026-11-16 (product owner, backlog #2)

**Context.** NIST released OSCAL v1.2.3 (tag 2026-08-06). Compared with 1.2.2 it changes no
structure: the JSON schemas differ only in `$id` and the component-type enum; the metaschema adds
allowed values (component types `region`, `zone`, `resource-container`, `network`; control
`status` values; location `type`/data-center `class` values) and relaxes one constraint (metadata
link uniqueness → WARNING). Review: `reviews/oscal-1.2.3-review.md` (R1, R2). With 1.2.2 as the
target, every 1.2.3 import was warned about and *down*-stamped on export. Separately, library
loads (ADR-0005) never applied this policy at all, although the original text covers them.

**Decisions** (PO Q2, Q3 — supersede the matching original bullets):

1. **Authoring/export target: OSCAL v1.2.3.** `OSCAL_AUTHORING_VERSION` in
   `src/models/oscalBase.ts` is the single source of truth. Blank factories, the runtime config
   (`validateConfig`), export normalization and the test harness's golden-data check
   (`read_authoring_version`) all derive from it; no other literal is allowed (TEST-VER-02).
2. **Import warning policy by version:**
   | Declared `oscal-version` | Result |
   |---|---|
   | `1.2.3` (authoring) | accepted, nothing reported |
   | other `1.2.x` (1.2.0–1.2.2, later patches) | accepted, **no user warning**; structured **info** log (decision_ids `ADR-0007`) |
   | `1.0.x`, `1.1.x`, any other 1.x minor | accepted with the **yellow warning** ("imported as X; exporting will normalize to 1.2.3") |
   | missing/empty | accepted with a warning (treated as 1.2.3) |
   | non-1.x / unparseable | rejected (unchanged) |
   Rationale: patch releases within a minor are structurally compatible; the 1.0/1.1 → 1.2 step is
   not (e.g. 1.2.0 made `system-implementation/users` optional and added the Control Mapping model),
   so users still need to hear about it.
3. **Library loads apply the same policy as uploads.** `loadLibraryArtifact` runs it on both the
   fetch and the cache-hit path (after, not inside, the fetch error handling — an unsupported version
   is a version error, not an upstream outage, ADR-0039). The warning surfaces when the user adopts
   the item (today the only library entry point), with the same wording as an upload. Current BSI
   catalogs/profiles declare 1.1.3, so adopting them shows the warning by design.
4. **Warnings and version errors are structured and localized** (ADR-0012): the data layer returns
   `ImportWarning { code, params, message }` / throws `OscalVersionError { code, params }`;
   `src/shared/importMessages.ts` renders them from `src/locales/{de,en}.json`. `message` is the
   English text for logs only.
5. **Observability:** `src/data/importVersionPolicy.ts` is the one helper both paths call; it logs
   info (1.2.x) / warn (other) records with `decision_ids: ["ADR-0007"]` and counts outcomes per
   level (`getImportVersionStats()`: `none`/`info`/`warning`, low cardinality).
6. **Stored data is not migrated.** Artifacts already in IndexedDB keep their stored
   `oscalVersion` (e.g. `1.2.2`); export normalizes to 1.2.3 as before. Detail pages show the stored
   value.

**Unchanged / still open.** Body content is not up- or down-converted. ~~The schema-validation and
schema-bundling bullets above remain unimplemented~~ — **implemented by ADR-0040 (backlog #3,
2026-11-19):** the NIST 1.2.3 JSON schemas are vendored (`schemas/oscal/1.2.3/`, sha256 in
`MANIFEST.json`) and compiled to standalone validators at build time; every export, every
workflow input (compliance gate) and every upload/adoption is checked against the 1.2.3 schema of
its model. Only the authoring version's schemas are bundled: a 1.1.x import is validated as the
1.2.3 document TALOS would export (the "validate against 1.2.x and warn" branch above); exact
older-version validation stays a future option. Exports now also carry `"$schema"` (PO decision
2026-11-18).

**Consequences.** + NIST-current version claim; 1.2.x files from other tools (e.g. BSI mapping
collections and component-definitions at 1.2.2) import silently. − Users adopting 1.1.x BSI
catalogs now see a warning they did not see before (consistency with upload); an info-level log
line is the only trace of a 1.2.0–1.2.2 import.

**Tests:** TEST-VER-01 (policy), TEST-VER-02 (single source), TEST-IMPORTMSG-01 (localized
wording), TEST-LIB-07 (library path), TEST-FILE-01 (upload + export normalization),
TEST-CDEF-01 (UI toast), TEST-COMPTYPE-01 (1.2.3 component types, ADR-0003 data).

## Alternatives considered

- **Strict v1.2.2 only (reject other versions):** simplest, but breaks ingest of real-world and
  BSI files that may lag or lead the version. Rejected.
- **Full multi-version converter now:** high effort, low near-term value; the models are largely
  stable across 1.x. **Deferred** as a future enhancement (up-conversion pipeline).

## Consequences

**Positive:** predictable single authoring/export version; robust ingest with clear user
signalling; no data loss on round-trip.
**Negative:** cross-version edge cases (a construct valid only in another version) need explicit
handling and tests; validation may occasionally run against a near-neighbor schema with a warning.

## References
- NIST OSCAL v1.2.2 schemas; amendment: NIST OSCAL v1.2.3 release
  (https://github.com/usnistgov/OSCAL/releases/tag/v1.2.3). ADR-0003 (models/validation), ADR-0004 (stores raw + version),
  ADR-0005 (BSI import). Tests: version-detection + round-trip warnings (T-030).
