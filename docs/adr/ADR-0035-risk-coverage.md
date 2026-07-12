# ADR-0035: Risk Coverage — Per-SSP Threat/Control Aggregation & Threat Catalog Loader

- **Status:** Approved
- **Date:** 2026-07-12
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0035 (references ADR-0004, ADR-0005, ADR-0023, ADR-0026, ADR-0034)

## Context

T-400 (Risk Coverage, DASH-001) is the second Management Dashboard tile, landing into the page
shell ADR-0034 built. The data source technical_design.md §14 flagged as unconfirmed is live:
the BSI library's `Dokumentation/namespaces/basethreats.csv` (469 elementary threats: ID/Begriff/
Definition/uuid) and `controls[].props[name="threats"]` (899/998 Grundschutz++ controls, a
comma-separated list of threat IDs, `ns` pointing at that exact CSV).

Two decisions needed a real answer, not just implementation:

1. **Per-SSP, not workspace-global.** The first draft of this ADR aggregated "is a tagged control
   implemented in *any* workspace SSP" — human supervisor correction: a threat can be fully
   handled by System A and completely unaddressed by System B, and a single global "covered
   anywhere" number hides that gap entirely. Coverage must be computed independently per SSP.
2. **What "covered" means**, given a threat can map to several controls with varying security
   levels (`props[name="sec_level"]`, confirmed live: exactly two values, `normal-SdT` and
   `erhöht`, on all 998 controls).

## Decision

### 1. Threat catalog: new loader, new store, `DB_VERSION` 4→5

`src/models/threatCatalog.ts` (`ThreatCatalogEntry`) + `src/data/threatCatalogLoader.ts` mirror
the target-object-category namespace loader byte-for-byte (ADR-0026/T-034): injectable
fetch-with-retry/timeout, cached in a new IndexedDB store (`threatCatalogCache`), degrades to a
stale cached copy with a warning on failure, throws only when nothing is cached at all. This is a
real schema change (`db.ts`), so `DB_VERSION` bumps 4→5 — additive only, no migration of existing
stores.

### 2. Per-SSP bucket, five values, fixed priority order

For each threat and each workspace SSP independently (own `implementedRequirements` only — never
another SSP's):

1. **Unmapped** — no control, in any workspace catalog, carries this threat in its `threats`
   prop. Catalog-level, not SSP-level — every SSP evaluates the same set of unmapped threats
   (a data-availability gap, not an implementation one).
2. Otherwise, a tagged control is **OK** for this SSP if that control-id's implemented-requirement
   in *this* SSP reduces (via `controlCoverage.ts`'s existing `controlBucket`, ADR-0034) to
   `implemented` or `alternative`.
   - **Full** — every tagged control is OK.
   - **Baseline covered** — every tagged control with `sec_level = normal-SdT` is OK, regardless
     of `erhöht` ones. If a threat has *zero* `normal-SdT` tagged controls, this bucket is
     unreachable via this rule (nothing to vacuously satisfy) — it falls through to
     partial/uncovered based on its `erhöht` controls instead of trivially passing.
   - **Partially** — at least one tagged control is OK, but neither of the above.
   - **Uncovered** — no tagged control is OK in this SSP.

`buildThreatToControlsIndex` (`riskCoverage.ts`) builds the threat→controls reverse index once,
reusing `indexCatalogControls`/`uniqueCatalogControlEntries` (`catalogResolution.ts`, ADR-0021's
existing alt-identifier dedup) across every workspace catalog, deduped by control-id — no new
resolution mechanism.

### 3. Workspace pie chart: sum-across-SSPs ÷ SSP-count, not a global bucket

The headline visualization is a pie chart (human supervisor decision — a deliberate departure
from Control Coverage's bar chart, appropriate here since the five buckets are a strict
part-of-whole composition of "the risk landscape," not an open-ended magnitude comparison). Each
bucket's workspace value is `Σ(per-SSP count) / number of SSPs` — an **average risk posture per
SSP**, not a raw sum (which would scale meaninglessly with SSP count) and not a global best-case
number (which would hide the exact cross-SSP gap this ADR exists to surface). Because Unmapped is
identical across every SSP by construction (§2.1), it survives the average unchanged — no special
casing needed, the math falls out correctly on its own.

### 4. Drill-down: By-SSP bucket-count table, not a named-risk list

Same collapsed-by-default `<CollapsibleSection>` pattern as Control Coverage's "By SSP" (ADR-0034)
— one row per SSP, one column per bucket, a Total column. A named-risk-per-SSP list (which
specific threats are uncovered where) was considered and deferred (human supervisor decision) —
more UI/scope than a first version needs; the bucket table already answers "which SSP has gaps."

## Consequences

**Positive:** the per-SSP model directly answers the question that motivated this ADR (systems
aren't uniformly covered); reusing `controlBucket`/`indexCatalogControls`/`uniqueCatalogControlEntries`
means zero new resolution logic, only a new reverse index; the loader/store pattern is now proven
twice (target-object-categories, threats), making a third live-fetched BSI namespace trivial to
add later.

**Negative:** `DB_VERSION` 5 means every existing workspace runs a real (if additive-only) IndexedDB
upgrade on next load; the pie chart's averaged values are typically non-integer (e.g. "2.5 risks
uncovered per SSP"), which reads correctly as an average but needs care in the UI copy so it isn't
mistaken for a literal count; no named-risk drill-down in this version means a manager still has
to open a specific SSP's own detail page to see *which* threats it's missing.

## References

- ADR-0004 (IndexedDB store/version conventions), ADR-0005 (live-fetch loader pattern),
  ADR-0021 (alt-identifier dedup, reused via `uniqueCatalogControlEntries`), ADR-0023
  (`implementation-status` — the OK/not-OK check is `controlBucket` from ADR-0034), ADR-0026/T-034
  (the target-object-category loader this one mirrors), ADR-0034 (dashboard page shell,
  Recharts, `controlBucket`, the By-SSP collapsible pattern).
- Implementation: `src/models/threatCatalog.ts`, `src/data/threatCatalogLoader.ts`,
  `src/data/db.ts` (`threatCatalogCache`, `DB_VERSION`), `src/features/dashboard/riskCoverage.ts`,
  `src/features/dashboard/DashboardPage.tsx`.
- Tests: `tests/data/threatCatalogLoader.test.ts`, `tests/features/riskCoverage.test.ts`
  (`TEST-DASH-01`).
