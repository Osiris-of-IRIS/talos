# ADR-0004: Client-Side Persistence (IndexedDB + File I/O)

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0004

## Context

TALOS has no backend (ADR-0002), yet it is a **workflow** tool over interlinked artifacts
(profile → SSP → assessment → POA&M; component-definitions imported into SSPs). Users must not
lose work on refresh, cross-artifact references must resolve against a store, and the bootstrap
assistant may generate many SSPs at once. Portability and sharing require exchanging OSCAL JSON
files. All of this must remain 100% static and keep sensitive compliance data **on-device**.

## Decision

Two complementary mechanisms:

### 1. IndexedDB (working store)

A single database `talos` (versioned) with one object store per artifact type plus supporting
stores:

| Object store | Key | Contents |
|---|---|---|
| `profiles`, `componentDefinitions`, `ssps`, `assessmentPlans`, `assessmentResults`, `poams` | `uuid` | typed OSCAL model + local metadata (createdAt, updatedAt, origin) |
| `libraryCache` | `path` | fetched BSI artifacts (read-only, ADR-0005) |
| `unresolvedReferences` | surrogate id | dangling cross-artifact refs kept for later resolution |
| `settings` | fixed key | language, theme, config, last-library-sync |

- **Origin flag** per record: `user` (created), `imported` (uploaded), `library` (from BSI) —
  drives read-only treatment and provenance badges.
- **Schema versioning:** IndexedDB `onupgradeneeded` migrations, versioned and logged with
  `decision_ids`.
- A thin repository/service layer wraps all access (`getAll`, `get`, `put`, `delete`, `query`)
  so views never touch IndexedDB directly (mirrors the ADR-0013 search-over-store need).

### 2. File I/O (portability)

- **Upload:** user selects an OSCAL JSON file → envelope codec + Ajv validate (ADR-0003) →
  stored with `origin: imported`. Invalid files rejected with a clear red error.
- **Download:** any artifact serialized to spec-conformant OSCAL JSON via the File download
  (Blob) API.
- **Export/import all:** a single bundle (zip or JSON manifest) of the whole workspace for
  backup and device transfer.

### Quota & durability

- Request **persistent storage** (`navigator.storage.persist()`) to reduce eviction risk;
  surface remaining quota via `navigator.storage.estimate()`.
- On quota errors, fail gracefully with guidance to export/prune; never silently drop data.
- The app warns that browser data can be cleared and encourages periodic file export as backup.

## Alternatives considered

- **File-only (stateless):** simplest, but loses work on refresh and cannot resolve
  cross-artifact references across a session — poor fit for a workflow tool. Rejected as
  baseline.
- **LocalStorage:** ~5 MB and synchronous; too small for catalogs/SSP sets. Rejected.
- **File System Access API (direct folder editing):** great UX but Chromium-only. **Deferred**
  as a future enhancement layered on top of the file-I/O abstraction.

## Consequences

**Positive**
- Work survives refresh; references resolve; assistants' bulk output persists.
- Data never leaves the device — a privacy advantage for compliance content.
- File I/O covers sharing/backup and interop with other OSCAL tooling.

**Negative**
- Browser can clear storage; no cross-device sync (mitigated by export/import).
- Quota management and IndexedDB migrations add complexity.

## References
- ADR-0002 (static architecture), ADR-0003 (models/validation), ADR-0005 (library cache),
  ADR-0014 (unresolved references pattern).
