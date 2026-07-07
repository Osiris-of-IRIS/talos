# ADR-0019: Mandatory Creator Identity (name + email)

- **Status:** Approved
- **Date:** 2026-07-03
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0019
- **Relates to:** ADR-0003 (data model), ADR-0004 (persistence/file I/O), ADR-0007 (version/export), ADR-0017 (authoring scope)

## Context

Compliance artifacts are only useful downstream if their provenance is known: who authored
this document, and how are they reached. OSCAL expresses authorship through `metadata`
identity: a `role`, a `party`, and a `responsible-party` binding a party to a role. The
reserved role id `creator` denotes the primary author.

Until now TALOS captured roles/parties/responsible-parties (ADR-0017, T-141) but required none
of them, so an artifact could be exported with no identifiable author or contact. The
supervisor requires that **every OSCAL artifact declare a creator with at least a name and an
email**, while keeping optional richer party detail (address, organization membership).

This must respect the draft-friendly principle (PLAT-003, ADR-0004): editing is never blocked
by validation; validity is surfaced non-blocking and **enforced at export**.

## Decision

1. **Mandatory creator.** Every artifact must have a `responsible-party` with role-id
   **`creator`** whose referenced party (defined in `metadata/parties`) has a **name** and at
   least one non-empty **email address**. `creator` is the reserved OSCAL role id.

2. **Single source of truth.** `src/models/creator.ts` owns the rule: `CREATOR_ROLE_ID`,
   `getCreatorParties`, `validateCreator(metadata) → string[]` (empty ⇒ valid), `hasValidCreator`.

3. **Enforcement points**
   - **Editor (non-blocking):** the shared `MetadataEditor` shows a live creator status
     (warning listing what is missing, or "✓ Creator set"). Editing is never blocked.
   - **Export (blocking):** `validateForExport` gates `downloadArtifact`, which throws when the
     creator rule (or any future export rule) is unmet; the detail page surfaces the message.
     The gate lives in the DOM/download path, **not** in the pure `serializeArtifact`, so OSCAL
     round-trip/codec tests are unaffected. This is the first concrete rule of the export
     validity gate (T-151).
   - **Authoring seed:** new artifacts (`blank.ts`) start with a `creator` role so the author is
     guided to add a party (name + email) and assign it.

4. **Optional party detail.** Parties may additionally carry an **address** and
   **member-of-organizations** links (to organization parties defined in the same document);
   both are optional and edited per-party in the metadata editor.

5. **Referential integrity** (from ADR-0017) still holds: the creator can only reference a role
   and parties defined in the document, and deleting them cascades.

## Alternatives considered

- **Block editing/saving without a creator:** violates the draft-friendly principle; rejected in
  favour of non-blocking editor + export gate.
- **Accept any responsible-party as "author":** too loose; `creator` is the precise OSCAL role.
- **Require email only, not name:** a contactless or nameless author defeats the provenance goal.

## Consequences

**Positive:** every exported artifact has an identifiable, reachable author; the rule is testable
and centralized; extends cleanly to the general export-validity gate (T-151) and future NIST
schema validation (T-030).
**Negative:** users must supply creator identity before export; imported third-party files
lacking a creator cannot be re-exported until one is added (surfaced clearly, not silently).
**Neutral:** the creator is stored like any other responsible-party; no schema extension.

## References
- OSCAL metadata: role / party / responsible-party; reserved role id `creator`.
- `src/models/creator.ts`, `src/data/fileIo.ts` (`validateForExport`), `MetadataEditor`.
- Tests: TEST-CREATOR-01, TEST-META-01, TEST-FILE-01, TEST-CDEF-01.
