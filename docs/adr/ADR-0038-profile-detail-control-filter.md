# ADR-0038: Profile Detail Page Control Text Filter

- **Status:** Approved
- **Date:** 2026-07-13
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0038 (references ADR-0016, ADR-0021, ADR-0032)

## Context

`todo.md`'s "MVP Feedback" section (2026-07-13) asked for a search filter on the profile detail
page (`/profiles/:uuid`) to narrow the controls shown, by id/title/statement prose. Tracing the
existing code turned up that a text filter with exactly that matching rule already exists —
`ControlSelectionChecklist`'s `matchesFilter`, used in the profile editor's by-id mode and the
Profile Creation Assistant — just not on the read-only detail page. It also turned up two real
display gaps on the detail page that a filter has nothing to act on without fixing: an
`includeAll` import showed only the "All controls" mode label, no control list at all; and a
profile-sourced import (as opposed to a catalog source) never resolved its controls, showing raw
unresolved ids even though the by-id checklist and Profile Creation Assistant have recursively
resolved profile sources since T-206.

## Decision

### 1. Reuse the filter, don't reinvent it

`ControlSelectionChecklist`'s local `matchesFilter` is extracted to `controlMatchesSearch`
(`src/models/controlDisplay.ts`, alongside the module's other pure control-text helpers) and now
used by both `ControlSelectionChecklist` and `ProfileDetailPage` — one implementation, not two
copies of the same id/alt-identifier/headline/statement-prose substring match. The new export
accepts `control: Control | undefined` (the checklist always has a resolved `Control`; the detail
page sometimes doesn't, for a dangling id) and falls back to matching the raw id string alone when
there's nothing else to search.

### 2. Fix the two display gaps the filter surfaced, as part of the same change

A filter over an empty list, or a list that silently drops profile-sourced controls, isn't useful.
Both gaps are fixed using resolution machinery that already exists and is already trusted
elsewhere (T-206's recursive profile resolution) — not new logic:

- **`resolveProfileImportControls`** (new, `profileImportResolution.ts`) is `resolveProfileEffectiveControls`'s
  per-import body, extracted so a caller can get *one* import's own contribution — both its
  post-exclude effective set (`controlsById`) and its pre-exclude source set (`sourceControlsById`,
  needed to still show *what* was excluded, matching the page's existing include/exclude
  transparency). `resolveProfileEffectiveControls` becomes a thin wrapper that merges every
  import's contribution — behavior-identical refactor, verified by the 20 pre-existing tests for
  the function it replaced passing unchanged.
- The detail page now resolves every import via this function (catalog **or** profile source,
  recursively) instead of its own catalog-only `catalogControlsByUuid` lookup — the profile-source
  gap disappears as a side effect of switching to the same trusted resolver everything else uses.
- An `includeAll` import now renders its full resolved control list (filterable, with an
  empty-state message matching the checklist's own `control_checklist_empty` string) instead of
  just the mode label.

### 3. One page-level filter input, not one per import

A profile typically has a single import; the model technically allows several. Rather than one
filter box per import section, a single filter input above the "Imports" heading applies uniformly
to every import section's include/exclude/effective lists — simpler UI, and consistent with "add
**a** search filter" (singular) in the feature request.

## Consequences

**Positive:** no duplicated filter logic; the detail page can now actually show what an
`includeAll` or profile-sourced import resolves to, which it categorically could not before.

**Negative:** none identified — this is a net-additive, behavior-preserving-where-untouched change.

## References
- ADR-0032 (profile CRUD, existing `ControlSelectionChecklist`), ADR-0016 (control-display
  helpers), ADR-0021 (alt-identifier dedup, `uniqueCatalogControlEntries`).
