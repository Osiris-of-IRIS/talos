# ADR-0039: BSI Upstream — Follow Live `main`, Layout-Aware Index, Non-Silent Failures

- **Status:** Approved
- **Date:** 2026-11-16
- **Deciders:** Product owner (Q1 "follow live `main`", 2026-11-16), engineering (layout mapping,
  resilience mechanics)
- **Decided by:** product owner (live `main` vs. pinned commit); engineering (everything else)
- **Amends:** ADR-0005 (repository layout, manifest semantics, refresh policy, error reporting).
  Also touches ADR-0026 (category matching) and ADR-0035 (threat-catalog load errors).
- **Decision IDs:** ADR-0039

## Context

In 2026-10 BSI reorganised the Stand-der-Technik-Bibliothek
(`https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek`) from `Anwenderkataloge/`,
`Quellkataloge/`, `Implementierungsbeschreibungen/`, `Dokumentation/` into:

```
control_layer/<Name>/<Name>-resolved_catalog.json           resolved user catalogs (GS++, WLAN, Lieferkette)
control_layer/<Name>/sources/profiles/<Name>-profile.json   profiles over the source catalogs
control_layer/{Kernel,Risikomanagement,…}/…-catalog.json     source catalogs (imported by the profiles)
control_layer/Mindeststandard-TLS/…-catalog.json             standalone catalog
control_layer/Mappings/**/…-mapping_collection.json          OSCAL mapping collections (ISO 27001, IT-GS 2023)
implementation_layer/**/…-component_definition.json          component-definitions
assessment_layer/                                            (no artifacts published yet)
documentation/namespaces/*.csv                               namespace CSVs
```

Every path in the bundled index and both namespace URLs returned 404. Library adopt, the Profile
Assistant's target-object picker, BSI-style bootstrap and Risk Coverage all broke; the dashboard
broke *silently* (missing `.catch`, empty chart, uncaught rejection). The index also contained
placeholder shas (`000…0001`, `size: 0`), so ADR-0005's "pins a known-good set" was never true.

Separately, BSI renamed target-object category `837781a4-…` from "Endgeräte" to
"Mobile Endgeräte" (same uuid, narrower meaning), and 48 of the 636 `target_object_categories`
tags in the GS++ catalog are comma-joined lists ("Nutzende, Mobile Endgeräte") that the
title-equality matcher never matched.

The product owner decided (Q1) that TALOS follows BSI's **live `main`**, not a pinned commit.

## Decision

### 1. Source of truth: live `main` (PO Q1)

- All runtime fetches go to `https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/<path>`
  (`LIBRARY_RAW_BASE`); paths are percent-encoded per segment (BSI paths contain spaces and `+`).
- The bundled `src/data/library-index.json` records `ref: "main"`, the upstream `commit` it was
  generated from and per-file git blob `sha`/`size`. These are **informational** (drift detection,
  cache keys), not a content pin: the first fetch of a library file returns whatever is on `main`
  at that moment. Caveat (unchanged ADR-0005 behaviour): the `libraryCache` entry is keyed by
  path + *index* sha, so once a file is cached in a browser it is reused until a newer index ships;
  namespace CSVs are re-fetched on every load. Revalidating cached library files against live
  `main` (e.g. conditional GET with ETag) is a recorded follow-up.
- Consequence accepted by the PO: upstream moves *will* recur; TALOS must make them visible
  and cheap to repair (sections 3–5) rather than impossible.

### 2. Layout mapping and UX equivalence

Classification lives in one pure, unit-tested module, `tools/libraryLayout.mjs` (TEST-LIB-04),
shared by the index generator and the drift check. It classifies by file-name suffix inside the
three OSCAL layer folders, so a move *within* a layer only needs an index regeneration:

| Upstream file | `artifactType` | Library category | Shown by default |
|---|---|---|---|
| `-resolved_catalog.json` | catalog | **Anwenderkatalog** | yes |
| `-catalog.json` imported by a BSI profile (relative back-matter `rlinks`) | catalog | **Quellkatalog** | advanced |
| `-catalog.json` not imported by any profile (e.g. Mindeststandard TLS) | catalog | **Anwenderkatalog** | yes |
| `-profile.json` | profile | **Profil** | advanced |
| `-component_definition.json` | component-definition | **Komponente** | yes |
| `-mapping_collection.json` | mapping-collection | **Mapping** | advanced, "not supported yet" (PO Q11) |
| `assessment_layer` suffixes (anticipated) | assessment-* / poam / ssp | **Assessment** | advanced, not supported |

The Anwender-/Quellkatalog split is derived from data (what BSI's own profiles import), not from
folder names — `Kernel/` and `Risikomanagement/` sit beside `Mindeststandard-TLS/` in the new
layout, so folder position alone cannot tell them apart. The default view is unchanged in spirit
(user catalogs + components); everything aimed at catalog editors or not yet usable sits behind
the existing advanced toggle (label extended to "source catalogs, profiles and mappings").
Profiles are adoptable but their imports resolve only once T-05 (rlink/document-id resolution)
lands; that is why they are not in the default view.

Unrecognised `.json` files in the layer folders are reported by the generator (stderr +
`skipped`), never silently dropped. Entries whose `artifactType` TALOS cannot open are listed with
a disabled Adopt button. A root `"$schema"` key (present in BSI's ITGS mapping collection) is
ignored by the envelope parser instead of failing the "exactly one wrapper key" check.

### 3. Namespace CSVs travel with the index

The generator locates `target_object_categories.csv` and `basethreats.csv` **by file name** in
the upstream tree and records their paths under `namespaces` in the index; `src/config.ts` derives
`TARGET_OBJECT_CATEGORIES_URL`/`THREATS_CATALOG_URL` from them and `validateConfig` checks them at
boot (`library.namespaces.*`). One regeneration fixes library and namespaces together; generation
fails loudly if either CSV disappears.

### 4. Non-silent failures

- One shared fetch (`src/data/upstreamFetch.ts`) for library artifacts and both namespaces:
  timeout + retry with backoff for transient failures (network, 5xx, 408, 429); **other 4xx fail
  immediately** (retrying a moved file is pointless).
- Failures with nothing cached raise `UpstreamLoadError` carrying an `UpstreamProblem`
  `{resource, title?, url, status?, detail, cachedAt?}`; cache fallbacks return the same `problem`.
- Every failure is logged with `decision_ids: ["ADR-0039","ADR-0005"]` — `error` when the feature
  is degraded, `warn` when a stale cache was served — and counted in `getUpstreamStats()`
  (`failures`, `notFound`, `servedFromCache`, `byResource`; labels limited to the 3 resource kinds).
- The UI formats problems via `src/shared/upstreamMessages.ts` (i18n de/en): a 404 says the file
  moved upstream and TALOS's index needs an update, with the URL; network failures say to check
  the connection. Every live-fetch call site has a `.catch` → error toast; the dashboard Risk tile
  additionally shows an inline note instead of a silently empty chart.
- `main.tsx` installs an `unhandledrejection` logger as a safety net (not a substitute).

### 5. Drift detection without network-dependent CI

`npm run check:library` (`tools/check-library.mjs`) requests every indexed path and both namespace
URLs on live `main` and exits non-zero on any non-200 (`--json` for structured output). It is
**not** part of `npm run check`, the harness or CI gating — the test suite stays offline. Run it
before releases or from a scheduled, non-blocking job; on failure regenerate the index:
`node tools/gen-library-index.mjs [--clone <dir>] > src/data/library-index.json`.

### 6. Target-object-category matching

Assets reach their category by uuid and the ancestor chain is walked by uuid; only the last hop
(category → catalog controls) is by title, because BSI catalogs carry nothing else in
`target_object_categories`. uuid matching of controls is therefore not possible with upstream data.
Mitigations: comma-joined tags are split, titles are compared trimmed + NFC-normalised, and
BSI-style bootstrap warns (and logs) when catalog tags name categories absent from the live
hierarchy (e.g. a workspace catalog adopted before a rename). The golden recplast mapping moves
`client-pc` from "Mobile Endgeräte" to its parent "IT-Systeme" (justification in
`tests/data/golden/recplast/README.md`; TEST-TOC-05).

## Alternatives considered

- **Pin a commit sha in config** (reviewer recommendation): reproducible, immune to moves until a
  deliberate bump. Rejected by the PO (Q1): users should get BSI's current content.
- **Runtime GitHub Trees API discovery** (no bundled index): self-healing after moves, but subject
  to the 60 req/h unauthenticated limit per user IP and slower startup; kept as the generator's
  API mode instead.
- **Classify by folder name** (`sources/` = Quellkatalog): fails for `Kernel/` and
  `Risikomanagement/`, which are top-level in `control_layer/`.
- **Network contract test in CI**: rejected — CI must not depend on GitHub availability; replaced by
  the opt-in `check:library` script.
- **Match controls by synonyms / fuzzy titles**: unreliable; BSI tags use canonical titles.

## Consequences

**Positive**
- Library, Profile Assistant target-object mode, bootstrap and Risk Coverage work again on the new
  layout; 18 upstream artifacts (was 9 stale) with real blob shas.
- The next upstream move produces a clear, localized, logged error naming the URL, and a one-command
  check + one-command regeneration path.
- 48 previously ignored multi-category tags now match; desktop PCs no longer receive mobile-device
  controls in the golden data.

**Negative / accepted risks**
- Live `main` means content can change under a stable index; `sha` is no longer a freshness
  guarantee: a browser's cached copy may be older or newer than the blob the index sha names.
- A move still breaks the affected feature until someone regenerates and redeploys the index;
  TALOS cannot self-repair.
- Matching remains title-based for the last hop; a catalog/hierarchy rename mismatch is now
  *reported*, not *repaired*.

## References

- PO decisions 2026-11-16 (Q1, Q11); workflow review T-01; OSCAL 1.2.3 review §1 item 5.
- Tests: TEST-LIB-04/05/06, TEST-TOC-04/05, TEST-DASH-07; TEST-LIB-01, TEST-MODEL-01,
  TEST-CONFIG-01, TEST-BOOTSTRAP-01 extended.
- ADR-0005 (amended), ADR-0026, ADR-0035, ADR-0002, ADR-0012.
