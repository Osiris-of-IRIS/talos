/**
 * Shared entity-search core (T-036, ADR-0013): debounced, ranked, in-memory search — either over
 * the workspace IndexedDB (via `ArtifactRepository`, one or more artifact types) or over a
 * caller-provided item list, for searching data that isn't its own top-level artifact store
 * (e.g. controls within a chosen catalog, params within a chosen control — T-142's pickers).
 *
 * `SearchItem.data` is an opaque payload the caller stashes and reads back from a result — e.g.
 * `{uuid, type, origin}` for an artifact result, so a consumer can build a route or badge without
 * re-deriving it. Two consumers build on this: `<EntitySearchField>` (a controlled value/onChange
 * field, drop-in replacement for `<DatalistInput>`) and `<GlobalSearch>` (search-and-navigate, no
 * persistent value) — kept separate rather than one dual-mode component, since "show/replace a
 * form field's current value" and "search then navigate away" are different enough UX contracts
 * that cramming both into one prop surface would be more confusing than two small components
 * sharing this one hook.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArtifactRepository } from '@/data/artifactRepository';
import type { Origin } from '@/data/db';
import { OSCAL_WRAPPER_KEYS, type OscalArtifactType } from '@/models/oscalBase';

const ALL_TYPES = Object.keys(OSCAL_WRAPPER_KEYS) as OscalArtifactType[];
const DEFAULT_LIMIT = 20;
const DEFAULT_DEBOUNCE_MS = 200;

export interface SearchItem {
  /** Stable unique key — the value actually written to the model (a uuid, a control-id, ...). */
  id: string;
  title: string;
  /** Optional secondary label shown next to the title (e.g. origin for artifacts). */
  badge?: string;
  /** Opaque payload the caller can read back in its selection handler. */
  data?: unknown;
}

/** `SearchItem.data` shape for artifact-store results (the `types`-backed mode). */
export interface ArtifactSearchData {
  uuid: string;
  type: OscalArtifactType;
  origin: Origin;
}

async function loadArtifactIndex(types: OscalArtifactType[]): Promise<SearchItem[]> {
  const perType = await Promise.all(
    types.map(async (type) => {
      const records = await ArtifactRepository.forType<{ metadata: { title: string } }>(type).getAll();
      return records.map(
        (r): SearchItem => ({
          id: r.uuid,
          title: r.artifact.metadata.title,
          badge: r.origin,
          data: { uuid: r.uuid, type, origin: r.origin } satisfies ArtifactSearchData,
        }),
      );
    }),
  );
  return perType.flat();
}

/** Ranks by match position (earlier = better), then alphabetically. Substring, case-insensitive. */
function rank(index: SearchItem[], query: string, limit: number): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return index
    .map((item) => ({ item, pos: item.title.toLowerCase().indexOf(q) }))
    .filter((entry) => entry.pos >= 0)
    .sort((a, b) => a.pos - b.pos || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export interface UseEntitySearchOptions {
  /** Restrict the IndexedDB-backed index to these artifact types; defaults to every type. Ignored
   * when `items` is provided. */
  types?: OscalArtifactType[];
  /** Search this fixed list instead of fetching from IndexedDB — for nested data (controls,
   * params) that isn't its own artifact store. */
  items?: SearchItem[];
  limit?: number;
  debounceMs?: number;
  /** Re-evaluated on every search, so it can change (e.g. a modal narrowing to a chosen parent)
   * without remounting the widget. */
  scope?: (item: SearchItem) => boolean;
}

export interface UseEntitySearchState {
  query: string;
  setQuery: (q: string) => void;
  results: SearchItem[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useEntitySearch(options: UseEntitySearchOptions = {}): UseEntitySearchState {
  const { types = ALL_TYPES, items: providedItems, limit = DEFAULT_LIMIT, debounceMs = DEFAULT_DEBOUNCE_MS, scope } = options;
  const [loadedItems, setLoadedItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(!providedItems);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const typesKey = types.join(',');

  const refresh = useMemo(
    () => async () => {
      if (providedItems) return; // caller-managed list — nothing to fetch
      setLoading(true);
      setLoadedItems(await loadArtifactIndex(typesKey ? (typesKey.split(',') as OscalArtifactType[]) : []));
      setLoading(false);
    },
    [typesKey, providedItems],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const index = providedItems ?? loadedItems;
  const scoped = scope ? index.filter(scope) : index;
  const results = useMemo(() => rank(scoped, debouncedQuery, limit), [scoped, debouncedQuery, limit]);

  return { query, setQuery, results, loading, refresh };
}
