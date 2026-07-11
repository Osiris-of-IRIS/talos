// Hook: load the workspace catalog+profile resolution index. Decision IDs: ADR-0016, ADR-0005, ADR-0032 (T-205).
import { useEffect, useState } from 'react';
import { ArtifactRepository } from '@/data/artifactRepository';
import { buildCatalogIndex, type CatalogIndex, type ProfileSourceEntry } from '@/data/catalogResolution';
import { resolveProfileEffectiveControls } from '@/data/profileImportResolution';
import type { Catalog } from '@/models/catalog';
import type { Profile } from '@/models/profile';

export function useCatalogIndex(): CatalogIndex | null {
  const [index, setIndex] = useState<CatalogIndex | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      ArtifactRepository.forType<Catalog>('catalog').getAll(),
      ArtifactRepository.forType<Profile>('profile').getAll(),
    ]).then(([catalogs, profiles]) => {
      if (!active) return;
      // A profile is also a valid `control-implementation.source` (T-205): its own effective
      // control set, recursively resolved through its own imports (T-206) — computed here, not in
      // catalogResolution.ts, which deliberately stays free of any dependency on
      // profileImportResolution.ts (that module already imports catalogResolution.ts; the reverse
      // would be a cycle).
      const profileEntries: ProfileSourceEntry[] = profiles.map((p) => ({
        uuid: p.uuid,
        title: p.artifact.metadata.title,
        controlsById: resolveProfileEffectiveControls(p.artifact, catalogs, profiles).controlsById,
      }));
      setIndex(buildCatalogIndex(catalogs, profileEntries));
    });
    return () => {
      active = false;
    };
  }, []);
  return index;
}
