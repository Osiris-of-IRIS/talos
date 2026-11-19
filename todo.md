# TALOS backlog

Each ticket is implemented on its own branch with tests first (CodeCraft), reviewed by the lead and merged by the product owner.
Every product-owner decision becomes, or amends, an ADR in the ticket that implements it ("Decided by: product owner").

Status: `[ ]` open · `[~]` in progress · `[x]` done
Effort: S / M / L

---

## Done

- [x] **#1 Repair BSI library integration after the upstream layout change.** PR #1, ADR-0039.
- [x] **#2 OSCAL 1.2.3: authoring/export bump, 1.2.x import policy, new component types.** PR #2, ADR-0007 amended.
- [x] **#3 Schema-valid export and schema check.** Branch `feat/schema-valid-export`, ADR-0040 (amends ADR-0003/0007/0018/0019). NIST 1.2.3 schemas vendored and compiled at build time; validate on export with draft download naming every non-compliant field; compliance gate at every workflow-input consumption point (G1–G8); valid by construction; `$schema` in exports.

---

## Next, in priority order

### [ ] #4 Example environment button on the assets page (S)
- **Value:** try TALOS in one click, without preparing your own asset list.
- **Scope:**
  - A button on `#/assets` ("Beispielumgebung laden" / "Load example environment") loads the RecPlast example asset workspace. The JSON was provided by the PO on 2026-11-18 and has 23 asset types and 97 assets in the existing asset-workspace JSON format.
  - Ship the file with the app; no network needed. Labels come from `de.json`/`en.json`.
  - If the workspace already has assets, ask whether to replace or merge them. Loading twice must not duplicate anything.
- **Note:** in the provided file, `client-pc` still maps to `837781a4` ("Mobile Endgeräte"). The approved golden data maps desktop PCs to "IT-Systeme" (`427da6dd`, ADR-0039). Align the shipped example with the golden data.

### [ ] #5 One catalog per identity: idempotent import and adopt (M)
- **Value:** loading the same catalog again, from the BSI library or by upload, leaves exactly one catalog in the working tree instead of duplicates.
- **Today:** library adopt (`adoptLibraryArtifact`) and upload (`createArtifactStore`) both assign a fresh uuid every time, so each load adds a copy.
- **Scope:**
  - Identify a catalog by a stable identifier. Use `metadata.document-ids`, which OSCAL keeps the same across versions of one document. Fall back to the document uuid, then to the library path, when no document-id exists.
  - Same document and same version: keep the existing catalog and tell the user it is already loaded.
  - Same document, different version: offer to update the existing catalog in place, keeping its TALOS id so profiles and SSPs that reference it stay intact. Keep the previous version only if the user asks for it.
  - When TALOS creates or adopts a catalog without a document-id, it adds a stable one.
  - Apply the same rule to profiles and component-definitions where it fits.
- **Depends on / relates to:** #8 portable references (the resolver should use the same document-id).
- **ADRs:** new ADR (artifact identity and versioning).

### [ ] #6 Native OSCAL implementation-status and namespaced TALOS props (M)
- **Scope:**
  - Store implementation status in OSCAL's native `implementation-status` field instead of a custom prop.
  - Move every TALOS-specific prop (`source-*`, `bootstrap-source`, `groups`, …) into a TALOS namespace.
  - No backward-compatible reading of the old form; we're still in development.
- **PO decisions:** Q5.
- **Namespace URI (PO, 2026-11-18):** `https://osiris-of-iris.github.io/talos/ns`.
- **ADRs:** new ADR.

### [ ] #7 Bootstrap: real baseline and safe re-runs (M)
- **Scope:**
  - BSI-style bootstrap generates per-category profiles and sets `import-profile`. NIST-style bootstrap requires the user to pick a profile.
  - When SSPs already exist, ask the user whether to create them from scratch or update the existing ones. Update keeps hand-entered statuses and remarks (merge by control-id) and updates `last-modified`.
- **PO decisions:** Q6, Q7.
- **ADRs:** new ADR, superseding ADR-0026 §7.

### [ ] #8 Portable references (M)
- **Scope:**
  - Exported back-matter resources carry `rlinks` and `document-ids`, so profile → catalog and SSP → profile references resolve outside TALOS.
  - The resolver uses rlinks and document-ids, so BSI's own profiles resolve too.
- **PO decisions:** Q8.

### [ ] #9 Tailoring by BSI attributes (M)
- **Scope:** filter profile tailoring by Grundschutz++ `sec_level` and the CIA protection levels, with modal verb (MUSS/SOLLTE/KANN) and effort as secondary filters.
- **PO decisions:** Q9.

### [ ] #10 Assistant entry step and required remarks (S–M)
- **Scope:**
  - One entry step routes the user to the right assistant (B.1).
  - `metadata.remarks` is required where the mission statement asks for it.

### [ ] #11 Assessment layer MVP (L, split into four tickets)
Each ticket generates from SSP + catalog and adds a table editor (PO Q10). Each one consumes only compliant inputs (#3).
- [ ] #11a Assessment Plan
- [ ] #11b Assessment Results
- [ ] #11c POA&M (ordering by effort and required/related links)
- [ ] #11d Assessment-state dashboard tile (C.3)

### [ ] #12 Mapping collections, read-only (M)
- **Scope:** ISO 27001 → GS++ and IT-GS 2023 → GS++.
- **Until then:** a clear, localized "not supported" message on upload.
- **PO decisions:** Q11.

---

## Follow-ups and smaller items

- [ ] **Gate tests G2c/G2d (S).** "Apply to…" propagation and by-component prefill are gated (ADR-0040 §6) but only code-reviewed; add dedicated tests.
- [ ] **Localization sweep (S–M).** Move every remaining hard-coded user-facing string into `src/locales/de.json` / `en.json`, and add a harness check that fails on new ones. Known strings:
  - the store's type-mismatch message;
  - the `fileIo` errors (invalid JSON, missing uuid/title);
  - the library loader's "not supported", type-mismatch and offline warnings;
  - the bootstrap generator warnings;
  - the mapping-collection upload error.
  - (done in #3: the ADR-0019 creator problems in the metadata editor and on export are now localized.)
- [ ] **Library cache freshness (S).** Re-check cached library files against BSI on adopt with a conditional GET (ETag). PO-approved, ADR-0039.
- [ ] **Weekly drift check (S).** A scheduled GitHub Actions job runs `npm run check:library -- --json`. It only reports and never blocks a deploy. PO-approved, ADR-0039.
- [ ] **Unknown-category warning in the Profile Assistant picker (S).** Today only the bootstrap warns.
- [ ] **Index generator API mode (S).** Run `tools/gen-library-index.mjs` in its GitHub Trees API mode once with a token; only `--clone` mode is verified.
- [ ] **`tests/tests.yaml` cleanup (S).** TEST-MODEL-01 has duplicate `type`/`runner` keys.
- [ ] **Low priority (S).** Detail pages show "exports as 1.2.3" next to an older stored `oscal-version`.
- [ ] **Follow-ups from #3 (ADR-0040):**
  - [ ] **OSCAL metaschema constraints (M–L).** The compliance check is JSON-schema only. Allowed values with `allow-other="no"` (e.g. TALOS props without `ns`, fixed by #6), cardinality rules (`by-component` for a `this-system` component) and cross-reference checks are not validated.
  - [ ] **Transitive compliance gate (S).** A compliant profile is accepted as an SSP baseline even when a catalog it resolves through is not compliant; gate the resolved chain, not only the picked artifact.
  - [ ] **`this-system` component default (S).** Needs a decision: seed a `this-system` component in new SSPs (metaschema cardinality) or keep "components only by import" (ADR-0023).
  - [ ] **Assessment-layer schemas (#11).** Bundle the AP/AR/POA&M schemas with #11a–c; SSP → AP is a new consumption point (`useGatedSelection`).
  - [ ] **Entity-search re-open (S).** After picking a result, typing into the still-focused `<EntitySearchField>` does not reopen the result list until it is blurred and focused again (found while testing the gate).
  - [ ] **Validation in a Web Worker (S), only if needed.** Large catalogs build their export document on the main thread (see docs/performance.md).
  - [ ] **Catalog fix path (S).** Non-compliant catalogs cannot be edited in TALOS; consider a minimal metadata editor (e.g. `last-modified`, `version`) so imported catalogs can be made compliant without leaving TALOS.

---

## Product-owner decisions not yet recorded in an ADR

| Date | Topic | Decision | ADR goes with |
|------|-------|----------|---------------|
| 2026-11-16 | implementation-status | Native OSCAL field, TALOS namespace for props, no old form | #6 |
| 2026-11-18 | TALOS namespace URI | `https://osiris-of-iris.github.io/talos/ns` | #6 |
| 2026-11-16 | Bootstrap re-run | Ask: create from scratch or update existing SSPs | #7 |
| 2026-11-16 | Bootstrap profile | BSI-style generates per-category profiles; NIST-style picks a profile | #7 |
| 2026-11-16 | Portable references | Yes | #8 |
| 2026-11-16 | Tailoring | `sec_level` + CIA levels first; modal verb + effort secondary | #9 |
| 2026-11-16 | Assessment MVP | Generator + table editor | #11 |
| 2026-11-16 | Mapping collections | Read-only, after assessment MVP; "not supported" message until then | #12 |
| 2026-11-18 | BSI 1.1.x version warning | Show on every adopt, like uploads | (implemented in #2) |
| 2026-11-16 | Localization | All user-facing text from the central de/en files | Localization sweep |
