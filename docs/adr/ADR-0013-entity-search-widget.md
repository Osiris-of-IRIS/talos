# ADR-0013: Shared Entity-Search Widget

- **Status:** Approved
- **Date:** 2026-07-02 (revised 2026-07-10: picker replacement + app-wide search)
- **Decision IDs:** ADR-0013

## Context

Many TALOS views need the same pattern: a typeahead that finds something and lets the user pick
it — an OSCAL artifact (a component-definition to import, a catalog to use as a
control-implementation source), or nested data that isn't its own artifact store (a control-id
within a chosen catalog, a param-id within a chosen control). Because TALOS has **no server**,
search runs entirely against the **IndexedDB** working store (ADR-0004) — a shared core avoids
re-implementing debouncing, keyboard navigation, and dark-mode badges per view.

A second, related need emerged once the picker-replacement work was underway: users have no way
to find an artifact by title from outside its own list page — an app-wide search.

## Decision

One hook, two purpose-built consumers — not a single dual-mode component. "Show/replace a form
field's current value" (a picker) and "search then navigate away" (app-wide search) are different
enough UX contracts that cramming both into one prop surface would be more confusing than sharing
a core and building two small components on top of it.

**`src/shared/useEntitySearch.ts`** — the core hook:

```ts
useEntitySearch({
  types?: OscalArtifactType[],  // IndexedDB-backed index (default: every type)
  items?: SearchItem[],         // OR a fixed list, for nested data (controls, params) —
                                 // mutually exclusive with `types`
  scope?: (item: SearchItem) => boolean,
  limit?: number,
  debounceMs?: number,
}) => { query, setQuery, results, loading, refresh }
```

`SearchItem` is `{ id, title, badge?, data? }`; in `types` mode, `data` carries
`{uuid, type, origin}` (`ArtifactSearchData`) so a consumer can build a route or badge without
re-deriving it, and `badge` is the artifact's origin (`user`/`imported`/`library`, ADR-0005).
Ranking is substring/position + alphabetical, case-insensitive, debounced (200ms default).

**`src/shared/EntitySearchField.tsx`** — a controlled `value`/`onChange` component, a drop-in
replacement for `<DatalistInput>` (ADR-0024's picker): same clear-on-focus/restore-on-blur
contract, but a ranked/debounced dropdown instead of the browser's native `<datalist>`. Picking a
result commits its `id`; free-text keystrokes still pass through on every change, so manual entry
keeps working. Wired into every artifact-store and nested-data picker that used to be a
`<DatalistInput>` (T-036 follow-up): component-definition import (add + inline-resolve),
control-implementation source→catalog, control-id (source-scoped and SSP-unscoped), and
set-parameter param-id. `<DatalistInput>` itself is kept only for fixed-enum pickers (component
type, system/component status) — never a search-over-artifacts candidate.

**`src/app/GlobalSearch.tsx`** — a persistent search box in the sidebar (mounted in
`Sidebar.tsx`, hidden when the sidebar is collapsed, alongside the existing nav links). Fire-and-
forget: no persistent value, typing narrows a dropdown across every artifact type with a real
detail page (catalog, component-definition, system-security-plan), and picking a result navigates
straight there and resets the box. Catalogs have no per-item detail route (T-142's `/catalogs` is
list-only), so a catalog result routes to the list page instead of a `:uuid` path — the one
deliberate exception to "navigate to the detail page."

**Styling:** shared `entitySearch.css` (ADR-0010 tokens, theme-aware without a
`prefers-color-scheme` block) for the dropdown, reused by both `EntitySearchField` and
`GlobalSearch`; keyboard nav (arrows/Enter/Escape) plus `mousedown`-before-`blur` on each result
to avoid the premature-hide race.

**Refresh-on-focus:** `useEntitySearch`'s `types`-mode index is fetched once per mount, not
re-fetched on every render or write. `GlobalSearch` in particular lives in the sidebar for the
whole app session and never remounts on hash-only route changes, so without a re-fetch its index
would go stale the instant any artifact is created/edited after first paint (caught via manual
browser verification, not the vitest suite — fake-indexeddb tests all remount fresh per test, so
this staleness never surfaces there). Both `EntitySearchField` and `GlobalSearch` call the hook's
`refresh()` from their `onFocus` handler, so the index is always current by the time a dropdown
actually opens.

## Consequences

**Positive:** one debounced, ranked search core reused by both form pickers and app-wide search;
`items` mode lets nested, non-artifact data (controls, params) reuse the exact same ranking/
keyboard-nav code without a redundant IndexedDB round-trip; consistent origin/type badges.
**Negative:** client-side index rebuilds per `types` change rather than incrementally (fine at
TALOS's expected workspace scale; noted for perf, T-503). Global search's "list page, not detail
page" exception for catalogs is a minor UX inconsistency to keep in mind if a per-catalog detail
route is ever added — that call site (`src/app/GlobalSearch.tsx`'s `detailPathFor`) would need
updating alongside it.

## References
- ADR-0004 (IndexedDB source), ADR-0010 (badge colors/tokens), ADR-0005 (library origin),
  ADR-0024 (the `<DatalistInput>` picker contract this replaces).
- Tests: `tests/shared/useEntitySearch.test.tsx`, `tests/shared/EntitySearchField.test.tsx`,
  `tests/app/globalSearch.test.tsx`.
