// Hook: load the workspace catalog resolution index. Decision IDs: ADR-0016, ADR-0005.
import { useEffect, useState } from 'react';
import { loadCatalogIndex, type CatalogIndex } from '@/data/catalogResolution';

export function useCatalogIndex(): CatalogIndex | null {
  const [index, setIndex] = useState<CatalogIndex | null>(null);
  useEffect(() => {
    let active = true;
    void loadCatalogIndex().then((i) => {
      if (active) setIndex(i);
    });
    return () => {
      active = false;
    };
  }, []);
  return index;
}
