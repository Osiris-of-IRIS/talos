# ADR-0011: UI Symbol Conventions

- **Status:** Approved
- **Date:** 2026-07-02
- **Decision IDs:** ADR-0011

## Context

Consistent symbols make a dense compliance UI learnable. TALOS defines a single symbol registry
scoped to the features it ships; concepts are added to the registry as features introduce them.

## Decision

Adopt a shared symbol registry. Every interactive symbol carries `aria-label` + `title`
(accessibility); domain colors per ADR-0010.

### Domain / OSCAL concepts
- **λ** Parameters (`set-parameter`) — params color.
- **📝** Guidance / prose / remarks.
- **🔗** Links & references; **🏷️** props/labels.
- **≈ = ⊂ ⊃ ∩ ∅** OSCAL mapping relationship types (equivalent/equal/subset/superset/intersects/none), color-coded.

### Layers & artifacts
- **📘** Catalog · **🎛️** Profile (tailoring) · **🧩** Component-Definition · **🖥️** SSP ·
  **📋** Assessment Plan · **✅** Assessment Results · **🛠️** POA&M *(text label always paired)*.

### Security / risk
- **🔥** Risk/threat · **🧮** risk calculation/matrix · **🐞** vulnerability/weakness.

### Actions & navigation
- **➕** add · **✎** edit · **≡** view (read-only) · **🗑️** delete · **✕** remove/close ·
  **✓** confirm · **💾** save · **⭳** download/export (OSCAL JSON) · **⭱** upload · **⋮** overflow ·
  **⚙** settings · **🔍** search · **→ / ←** inline nav.

### Views / state / feedback
- **🌲** tree view · **📋** list view · **👁️** preview · **▾/▸** collapse/expand ·
  **🌙/☀️** dark/light toggle · **⚠️** warning · **Δ** staleness (source changed since save) ·
  **💡** tip · **📂** empty state.

### Provenance & AI
- **imported/library** read-only badge (dashed, muted green — ADR-0010) with **≡** view-only.
- **✦** AI/assistant features (the two workflow assistants); decorative bursts use **✺/✶**.

### Guidelines
Same symbol = same meaning app-wide; pair critical actions with text labels; use widely
supported Unicode; `aria-label`+`title` on interactive symbols; sufficient contrast both themes.

## Consequences

**Positive:** learnable, consistent iconography; strong visual hierarchy with ADR-0010 colors.
**Negative:** symbol rendering varies across platforms; registry must be maintained as features land.

## References
- ADR-0010 (colors), ADR-0005 (library provenance), ADR-0014 (imported), ADR-0006 (landing cards).
