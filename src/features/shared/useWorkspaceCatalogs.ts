// Hook: load workspace catalogs (raw stored artifacts, not the control-resolution index) — for
// pickers that need origin/title/uuid rather than an indexed control map. Decision IDs: ADR-0032.
import { useEffect, useState } from 'react';
import { ArtifactRepository } from '@/data/artifactRepository';
import type { StoredArtifact } from '@/data/db';
import type { Catalog } from '@/models/catalog';

export function useWorkspaceCatalogs(): StoredArtifact<Catalog>[] {
  const [items, setItems] = useState<StoredArtifact<Catalog>[]>([]);
  useEffect(() => {
    let active = true;
    void ArtifactRepository.forType<Catalog>('catalog')
      .getAll()
      .then((r) => {
        if (active) setItems(r);
      });
    return () => {
      active = false;
    };
  }, []);
  return items;
}
