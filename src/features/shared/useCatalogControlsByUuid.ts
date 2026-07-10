// Hook: memoized per-catalog control index, keyed by catalog uuid — avoids re-walking a whole
// catalog's control tree (indexCatalogControls) on every render for every row that references it.
import { useMemo } from 'react';
import { indexCatalogControls } from '@/data/catalogResolution';
import type { StoredArtifact } from '@/data/db';
import type { Catalog } from '@/models/catalog';
import type { Control } from '@/models/control';

export function useCatalogControlsByUuid(catalogs: StoredArtifact<Catalog>[]): Map<string, Map<string, Control>> {
  return useMemo(() => {
    const map = new Map<string, Map<string, Control>>();
    for (const c of catalogs) map.set(c.uuid, indexCatalogControls(c.artifact));
    return map;
  }, [catalogs]);
}
