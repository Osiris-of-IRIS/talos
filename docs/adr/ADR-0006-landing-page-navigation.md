# ADR-0006: Landing Page & Feature Navigation Hub

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0006

## Context

The mission requires a **landing page from which all features can be accessed**. TALOS spans
three OSCAL layers plus assistants and a dashboard; without a clear hub the feature set is hard
to navigate. As a static SPA (ADR-0002) the landing page is the app's `/#/` root and the
primary orientation surface.

## Decision

Provide a **landing page** as the router root that links to **every** feature, organized to
mirror the mission's structure and the OSCAL layer model (ADR-0010 colors).

### Sections

1. **Control Layer** (blue) — Profiles; Catalog/Library browser.
2. **Implementation Layer** (green) — **Component-Definitions**, **SSPs** *(priority; visually
   emphasized)*.
3. **Assessment Layer** (amber) — Assessment Plans, Assessment Results, POA&M.
4. **Assistants** (✦) — "Create a tailored solution", "Bootstrap an environment".
5. **Management Dashboard** — Risk Coverage, Control Coverage, Assessment State.
6. **Data** — BSI Library browser, Upload OSCAL file, Export/Import workspace.

### Behavior

- Each feature is a **card** using its layer accent color (ADR-0010) and symbol (ADR-0011),
  with a one-line description and a count of the user's artifacts of that type (from IndexedDB).
- **Empty-state guidance**: when the workspace is empty, cards suggest starting points
  (adopt from BSI library, upload a file, or launch an assistant).
- Priority features (component-definitions, SSPs) are surfaced most prominently.
- Fully **i18n** (de/en, ADR-0012) and theme-aware (ADR-0010).
- The landing route is also the reachable fallback for `404.html` (ADR-0002).

### Consistency

- Landing cards and their target feature pages share layer color + symbol so navigation is
  visually predictable (a "landing alignment" convention: the card that launches a feature and
  that feature's header use the same accent).

## Consequences

**Positive**
- Single discoverable entry point satisfying the mission requirement.
- Layer-colored, symbol-tagged cards give immediate structure and reinforce OSCAL semantics.
- Artifact counts + empty states orient new and returning users.

**Negative**
- The landing page must be kept in sync as features are added (each new feature registers a
  card) — enforced via `feature_registry.yaml`.

## References
- ADR-0002 (routing/fallback), ADR-0010 (layer colors), ADR-0011 (symbols), ADR-0012 (i18n),
  ADR-0004 (artifact counts), ADR-0005 (library browser).
