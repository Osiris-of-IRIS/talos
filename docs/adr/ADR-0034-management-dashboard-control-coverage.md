# ADR-0034: Management Dashboard — Page Shell, Charting Dependency & Control Coverage Aggregation

- **Status:** Approved
- **Date:** 2026-07-12
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0034 (references ADR-0002, ADR-0006, ADR-0010, ADR-0011, ADR-0023, ADR-0029)

## Context

T-040 added a disabled "Management Dashboard" placeholder card to the landing page/sidebar
(`ADR-0029`'s `navigationGroups()`) ahead of the dashboard itself. The mission statement's
Management Dashboard has three tiles — Risk Coverage (T-400), Control Coverage (T-401),
Assessment State (T-402) — of which only Control Coverage is buildable today: Risk Coverage needs
a new threat-catalog loader (data source confirmed live in the BSI library, but not yet built) and
Assessment State is hard-blocked on the Assessment layer (T-210/T-220), which has no model/store/
UI at all yet. This ADR scopes T-401 and the reusable page shell the other two tiles will land
into later.

Two things needed a real decision, not just implementation:

1. **No charting library exists in the project.** TALOS is a static, minimal-footprint SPA
   (ADR-0002); adding one is the kind of dependency choice that should be recorded, not just
   `npm install`ed silently.
2. **`implementation-status` lives per by-component, not per control** (`src/features/ssps/
   componentImport.ts`, T-113). A single implemented-requirement (control) can have several
   by-components, each with its own status. "SSP controls by implementation stage" (the mission
   statement's own framing, and DASH-002's `feature_registry.yaml` acceptance criterion) requires
   collapsing that per-by-component data down to one bucket per control — the reduction rule is a
   real policy decision with more than one defensible answer.

## Decision

### 1. Charting: Recharts

Adopted as the project's one charting dependency, used by all three dashboard tiles (T-400/401/
402), not just this one. Rationale: composable React-native API (`<BarChart>`/`<Cell>` etc., no
imperative canvas/DOM wiring to keep in sync with React state), SVG-based (so ADR-0010 CSS custom
properties work directly as `fill`/`stroke` values, matching every other themed element — no
separate color pipeline), reasonable size (~90KB gzipped) for a dependency used across the whole
dashboard rather than a single chart. Alternatives considered: hand-rolled SVG/CSS bars (rejected
— human supervisor decision, in favor of a library's built-in accessibility/tooltip/legend
plumbing over three tiles' worth of hand-rolled equivalents); Chart.js (rejected — canvas
rendering can't be styled with CSS custom properties or inspected/tested via the DOM the way
Testing Library needs); visx (rejected — lower-level, more code for the same result, better suited
to a single highly-custom chart than three fairly standard bar/table tiles).

### 2. Dashboard page shell (`src/features/dashboard/DashboardPage.tsx`), reused by T-400/402

One page at `/dashboard`, routed from `App.tsx`, reached via the landing/sidebar "Management
Dashboard" card — which **flips from disabled to a live link** as of this ADR (T-040's "coming
soon" placeholder was always meant to be temporary once *any* tile shipped). The page renders one
section per tile, in the same fixed order as the mission statement and `navigationGroups()`'s
Dashboard section: Risk Coverage, Control Coverage, Assessment State. Only Control Coverage is
live in this ADR; the other two render the same disabled/"coming soon" card treatment T-040
established for not-yet-built landing features (`feature-card--disabled`, `aria-disabled`,
hover-title) — so the shell communicates the full intended dashboard on day one, and T-400/T-402
each become "swap one placeholder for a real tile" rather than new page-structure work.

### 3. Control Coverage aggregation (`src/features/dashboard/controlCoverage.ts`)

A pure module, no React/Recharts import — independently unit-testable, mirroring every other
`src/data/*Resolution.ts` pure-helper precedent in this codebase.

**Per-control reduction** (human supervisor decision): a control's overall bucket is derived from
its by-components' `implementation-status` values as follows:

1. Zero by-components, or none carry the `implementation-status` prop at all → **`unspecified`**
   (a sixth bucket alongside OSCAL's five status values — nothing silently drops out of the
   totals, and it surfaces SSPs/controls that need attention).
2. Drop any `not-applicable` entries *if at least one other status is also present* — an N/A
   by-component says nothing about a control's overall completeness when another by-component
   actually implements it.
3. If **every** by-component is `not-applicable` → bucket is **`not-applicable`**.
4. Otherwise, the control's bucket is the **least complete** remaining status, by this fixed
   order (worst wins): `planned` < `alternative` < `partial` < `implemented`. `alternative` (a
   compensating control, not the literal one) ranks above `planned` (nothing in place yet) but
   below `partial`/`implemented` (something concrete and verifiable is in place either way).

**Aggregation scope:** both a workspace-wide total (every control across every SSP) and a
per-SSP breakdown (one row per SSP) are computed and shown — a manager comparing systems needs
the per-SSP view, not just a global number (human supervisor decision, over a totals-only v1).

**Complexity:** O(SSPs × implemented-requirements × by-components) — a single linear pass, no
nested lookups; trivial at the client-side workspace sizes this app targets (ADR-0002).

## Consequences

**Positive:** Recharts' SVG output composes cleanly with ADR-0010's token architecture and
ADR-0020's theme toggle (no separate canvas-to-CSS bridge); the page shell means T-400 and T-402
are additive, not a redesign; the reduction algorithm is explicit and tested rather than an
unstated implementation detail a future reader would have to reverse-engineer from the code.

**Negative:** Recharts is now a real dependency to keep current (React 18/19 compatibility,
bundle size) across three tiles' worth of future charts, not just one; the `alternative` ranking
relative to `planned`/`partial` is a judgment call — reasonable, but a control implemented purely
via a compensating measure could arguably be read as "fully handled" rather than "worse than
partial," which this ranking deliberately rejects (a partial *literal* implementation is treated
as more complete than a *fully alternative* one) — revisit if this reads wrong once real SSP data
populates the tile.

## References

- ADR-0002 (static client-side, minimal footprint), ADR-0006 (landing/dashboard section list),
  ADR-0010 (color tokens — Recharts fills reference the same CSS custom properties), ADR-0011
  (symbols — 📊 already registered for Dashboard in T-040), ADR-0023 (`implementation-status`
  convention this ADR aggregates), ADR-0029 (`navigationGroups()`, the disabled-card pattern
  reused for the not-yet-built tiles).
- Implementation: `src/features/dashboard/controlCoverage.ts`, `src/features/dashboard/
  DashboardPage.tsx`, `src/app/App.tsx` (`/dashboard` route), `src/app/navigation.ts` (Dashboard
  card no longer disabled).
- Tests: `tests/features/controlCoverage.test.ts` (`TEST-DASH-02`), `tests/features/
  dashboardPage.test.tsx`.
