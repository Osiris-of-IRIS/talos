# ADR-0010: Color Palette (OSCAL Layers)

- **Status:** Approved
- **Date:** 2026-07-02
- **Decision IDs:** ADR-0010

## Context

TALOS UI spans OSCAL layers and domains that users must tell apart at a glance, in both light
and dark themes. Ad-hoc colors cause low-contrast, inconsistent screens. We adopt a palette
keyed to the **OSCAL layer diagram** and a strict token architecture.

## Decision

Domain/layer accent colors, applied consistently across themes:

| Domain | Layer / family | Light | Dark |
|---|---|---|---|
| Catalogs | control / blue | `#2563eb` | `#60a5fa` |
| Profiles | control / blue (lighter = derived) | `#0ea5e9` | `#38bdf8` |
| **Component-Definitions, SSPs** | **implementation / green** | `#16a34a` (mid `#22c55e`) | `#4ade80` |
| Assessment (plan/results/POA&M) | assessment / amber | `#d97706` | `#fbbf24` |
| Threats / Risks | — | `#dc2626` / `#a855f7` | same |
| Params | — | `#f97316` | `#f97316` |
| Imported / read-only (incl. BSI library) | muted green, **dashed** border + badge | `#22c55e` @ 8% fill | `#15803d` |
| Unresolved reference | amber warning | `#f59e0b` | `#f59e0b` |
| Links / edit-button | neutral: body text + **underline** | `var(--color-text)` | same |

### Token architecture (three tiers)

- **Tier 1 — Foundation (`main.css`)**: semantic tokens (`--color-bg`, `--color-text`,
  `--color-border`, …) and the **single** `[data-theme="dark"]` block. Owns all theme switching.
- **Tier 2 — Page/feature aliases**: wire generic tokens to Tier 1
  (`--ssp-bg: var(--color-bg)`), declare **only** unique accents as raw values. Never duplicate
  a dark-mode variable block.
- **Tier 3 — Component overrides**: scoped `[data-theme="dark"] .class {…}` only where tokens
  can't express it.

Rules: explicit `data-theme` attribute (user toggle) — **never** `@media (prefers-color-scheme)`.
Maintain contrast in both themes; links are neutral+underline (no domain-colored links).

## Consequences

**Positive:** consistent, layer-semantic, accessible theming; free theme switching when tokens
are wired correctly; imported/library and unresolved content are visually unmistakable.
**Negative:** new feature CSS must follow the tier rules; palette must be honored to avoid drift.

## References
- OSCAL layer model (https://pages.nist.gov/OSCAL/learn/concepts/layer/).
- ADR-0005 (library provenance badge), ADR-0011 (symbols), ADR-0014 (imported styling).
