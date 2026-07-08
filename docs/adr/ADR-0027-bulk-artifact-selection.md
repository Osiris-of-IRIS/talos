# ADR-0027: Bulk Artifact Selection — Multi-Delete & Zip/CSV Bundle Download

- **Status:** Approved
- **Date:** 2026-07-08
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0027 (references ADR-0004, ADR-0019, ADR-0023, ADR-0026)

## Context

The supervisor asked for a way to mark multiple artifacts (component-definitions, SSPs, catalogs,
assets) on their list pages and delete or download several/all of them at once. `ADR-0004` already
planned an "export/import all: a single bundle (zip or JSON manifest) of the whole workspace" and
`fflate` was installed for exactly that from the project's earliest scaffold (`T-023`) — but no
code ever called it. This ADR realizes that deferred plan, scoped to a per-page selection rather
than a single whole-workspace bundle (which remains future work), and adds the multi-delete half
the original plan didn't cover at all.

## Decision

### 1. A shared "selection slice", not three (or four) copies of the same state
`src/features/shared/selectionSlice.ts` exports `createSelectionSlice<T>(set, get)`: `selected:
Set<string>`, `toggleSelected`, `selectAll(uuids)` (select all / toggle-off if all given uuids are
already selected), `clearSelection`. It's a plain zustand-slice factory (not a `StateCreator`
composition) so it can be spread into any store's own `create<T>((set, get) => ({...}))` call
without that store needing to know anything about the other slices composed alongside it.
Composed into **both** `createArtifactStore` (so component-definitions, SSPs, and catalogs all get
selection for free from one change, ADR-0004's generic artifact-store factory) **and** the bespoke
`useAssetsStore` (assets aren't OSCAL artifacts and don't go through that factory, ADR-0026) —
one mechanism, two call sites, rather than reimplementing toggle/select-all per store.

### 2. Every store gains `removeMany(uuids)`, not a loop of single `remove(uuid)` calls
Both `createArtifactStore` and `useAssetsStore` get a `removeMany` action: deletes are issued
concurrently (`Promise.all`), followed by **one** reload and **one** selection-clear — not N
reloads. `useAssetsStore.removeMany` only ever touches the `assets` store, never `assetTypes`
(bulk-deleting an asset must not silently orphan the type taxonomy other assets still reference).
Single-item `remove(uuid)` also now drops that uuid from `selected` if it was checked, so a stale
selection can't reference a deleted record.

### 3. Bulk download is two different formats, chosen by what the data actually is
- **OSCAL artifacts** (component-definitions/SSPs/catalogs): `src/data/bulkExport.ts` —
  `buildArtifactsZip(records)` (pure) zips every record via `fflate`'s `zipSync`, keyed by the
  existing `defaultFilename` convention; `downloadArtifactsAsZip` (thin DOM wrapper) triggers the
  browser download. This is the exact `serializeArtifact`/`downloadArtifact` pure/DOM split
  `fileIo.ts` already established, extended to a batch.
- **Assets** (not OSCAL, no `serializeArtifact`/export-validation semantics): `serializeAssetsCsv`
  (`src/models/asset.ts`, the write-side inverse of `parseAssetsCsv`, backed by a new
  `src/data/csvStringify.ts` RFC4180-quoting helper) + `downloadAssetsAsCsv` (`bulkExport.ts`)
  download the selected rows as one `.csv` — the format they were uploaded in, not a zip
  containing one file.

**A single zip file, not N sequential downloads** — deliberately: browsers throttle or block
several near-simultaneous downloads triggered without a fresh user gesture per file, so "download
5 selected component-definitions" as 5 separate `<a download>` clicks is unreliable in practice.

### 4. A record failing export validation is skipped, not blocking, with a named warning
An OSCAL artifact with no valid creator (ADR-0019) can't be exported — `buildArtifactsZip` skips
it (`"<title>: <problems>"` in the returned `skipped[]`) and zips everything else, rather than
failing the whole batch. Matches the draft-friendly philosophy already established for single-item
export (`validateForExport`/`downloadArtifact` throws for *one* record; the bulk path can't do
that without punishing every other valid record in the same selection for one bad one). When
*every* selected record is invalid, `buildArtifactsZip` returns `zipBytes: null` and no download is
triggered at all — an empty zip would be a confusing no-op success. Assets have no equivalent
per-row export validation, so `downloadAssetsAsCsv` has no skip path.

### 5. Bulk delete requires a `confirm()` dialog; single-item delete still doesn't
Matches the existing "Clear asset list" confirmation pattern (`AssetsListPage`). Deleting several
records at once is a materially bigger, harder-to-undo action than the pre-existing single-row
delete buttons (which stay exactly as they were — no new confirmation added there, out of scope).

### 6. UI: a per-row checkbox, one "select all" checkbox, and a shared `<BulkActionsBar>`
Every list page (`ComponentDefinitionsListPage`, `SspListPage`, `CatalogsListPage`,
`AssetsListPage`) gets a checkbox per row and a "select all" checkbox, wired directly to that
page's own store (kept inline — trivial, and each page already fully owns its row markup, `<li>`
vs. `<tr>`). The "N selected / Download / Delete" bar itself **is** extracted
(`src/features/shared/BulkActionsBar.tsx`) since that part is pixel-for-pixel identical across all
four pages and was about to become the fourth near-copy of the same JSX. It renders nothing when
`count === 0`.

## Consequences

**Positive:** `fflate` finally has a caller, realizing the bundle-export half of ADR-0004's
long-deferred plan; the selection mechanism is genuinely one implementation reused four times, not
four; bulk delete is efficient (one reload per batch, not N); the zip/CSV split keeps each format
honest to its data instead of forcing OSCAL zip semantics onto tabular asset data.
**Negative:** this is explicitly **per-page, per-type** selection — a user cannot select a mix of
component-definitions and SSPs and download them together in one bundle. A true whole-workspace,
all-types export/import bundle (with a manifest, per PLAT-003's original acceptance criterion)
remains unbuilt future work; this ADR narrows but does not close that gap. Assets' bulk delete
only ever removes `assets`, never their referenced `assetTypes` — a type can become unused (never
referenced by any remaining asset) without being cleaned up; this is intentional (deleting a type
out from under a still-existing asset would corrupt that asset's `assetType` reference) but leaves
type-list hygiene as a manual follow-up.

## References
- ADR-0004 (persistence/file-I/O, the deferred "export bundle" this realizes), ADR-0019 (creator
  export gate, the skip-with-warning source), ADR-0023 (props-based provenance — a parallel
  precedent for "batch this, reload once" thinking), ADR-0026 (the assets store this also extends).
  Implementation: `src/features/shared/{selectionSlice,BulkActionsBar}.ts(x)`,
  `src/data/{bulkExport,csvStringify}.ts`, `src/features/shared/createArtifactStore.ts`,
  `src/features/assets/store.ts`, and all four `*ListPage.tsx` files. Tests:
  `tests/features/selectionSlice.test.ts`, `tests/shared/BulkActionsBar.test.tsx`,
  `tests/data/{bulkExport,csvStringify}.test.ts`, extended `componentDefinitions.test.tsx`,
  `ssps.test.tsx`, `catalogsListPage.test.tsx`, `assetsStore.test.ts`, `assetsListPage.test.tsx`
  (TEST-BULK-01..04, TEST-SELECT-01, TEST-CAT-01).
