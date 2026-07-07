# ADR-0007: OSCAL Version Support & Compatibility

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor (Q1 of technical-design clarification), engineering
- **Decision IDs:** ADR-0007

## Context

OSCAL is versioned; documents declare their version in `metadata.oscal-version`. TALOS authors
new artifacts and imports existing ones (user files and the BSI library). Different producers
emit 1.0.x, 1.1.x, or 1.2.x. We need a clear, bounded compatibility policy so authoring stays
simple while imports remain lossless, without committing to a full multi-version converter now.

## Decision

- **Authoring target: OSCAL v1.2.2.** All artifacts *created* in TALOS, and all *exports*, use
  `oscal-version: "1.2.2"` and are validated against the v1.2.2 JSON Schemas (ADR-0003).
- **Import: accept any OSCAL 1.x.** On import, TALOS reads and stores the document as-is,
  preserving its declared `oscal-version`.
  - If the version differs from 1.2.2, surface a **yellow warning** ("imported as <version>;
    exporting will normalize to 1.2.2") — never a hard failure.
  - Validate against the document's own schema version when that schema is bundled; otherwise
    validate against 1.2.2 and warn that validation used a different version.
- **No automatic up-/down-conversion** of the body in v1. A field that exists only in a newer
  version is preserved on round-trip where the model allows; genuinely incompatible constructs
  are flagged, not silently dropped (parallels the unresolved-reference policy, ADR-0003/0099).
- **Export normalization:** on export, `oscal-version` is written as 1.2.2 (the authored
  version); the user is informed when the source was a different version.
- **Schema bundling:** the v1.2.2 JSON Schemas are vendored into the repo; older-version schemas
  may be added later to enable exact-version validation.

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
- NIST OSCAL v1.2.2 schemas. ADR-0003 (models/validation), ADR-0004 (stores raw + version),
  ADR-0005 (BSI import). Tests: version-detection + round-trip warnings (T-030).
