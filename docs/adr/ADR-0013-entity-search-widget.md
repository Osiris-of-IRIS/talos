# ADR-0013: Shared Entity-Search Widget

- **Status:** Approved
- **Date:** 2026-07-02
- **Decision IDs:** ADR-0013

## Context

Many TALOS views need the same pattern: a typeahead that finds an OSCAL entity (control,
catalog, profile, component-definition) and lets the user pick one — e.g. an SSP linking a
source profile, a component-definition composing another, an assessment plan referencing an SSP.
Because TALOS has **no server**, search runs against the **IndexedDB** working store (ADR-0004)
plus the cached BSI library — a shared widget avoids re-implementing debouncing, keyboard
navigation, and dark-mode badges per view.

## Decision

A shared React component/hook **`src/shared/EntitySearch.tsx`** (+ `useEntitySearch`):

```ts
<EntitySearch
  types={['profile','componentDefinition']}   // optional filter
  scope={{ catalogUuid, profileUuid }}         // optional scoping (re-settable)
  onSelect={(item) => …}                       // {uuid, id, title, type, origin}
  limit={20} debounceMs={200}
  renderItem={/* optional */} />
```

- **`setScope()` equivalent:** the `scope` prop can change at open-time (modal context) without
  remounting — the key design point carried over.
- **Search source:** an in-memory index built from IndexedDB records (title + id + key props),
  refreshed on store changes; small-N client-side ranking (substring/token match, later
  optionally a tiny fuzzy lib). No network calls.
- **Results include `origin`** (`user`/`imported`/`library`) so read-only/library items are
  badged (ADR-0005/0015).
- **Styling:** shared `search-widget.css` following the ADR-0010 three-tier tokens with
  `[data-theme="dark"]` support; `.sw-visible` toggles dropdown visibility; keyboard nav +
  `mousedown`-before-`blur` to avoid the premature-hide race (retained gist).

## Consequences

**Positive:** one debounced, accessible, theme-aware typeahead reused everywhere; scoping is
configure-once/update-per-context; consistent entity-type badges.
**Negative:** client-side index must stay in sync with IndexedDB (rebuild on writes); very large
workspaces may need incremental indexing (noted for perf, T-503).

## References
- ADR-0004 (IndexedDB source), ADR-0010 (badge colors), ADR-0005 (library origin).
- Test: `tests/entitySearch.test.tsx`.
