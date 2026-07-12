// Workspace record counts per OSCAL artifact type, for the landing page's count badges
// (ADR-0006). Uses ArtifactRepository.count() — a cheap IndexedDB count, not getAll() — since
// only the number is needed, not the records themselves.
import { useEffect, useState } from 'react';
import { ArtifactRepository } from '@/data/artifactRepository';
import type { OscalArtifactType } from '@/models/oscalBase';

const COUNTED_TYPES: OscalArtifactType[] = ['catalog', 'profile', 'componentDefinition', 'systemSecurityPlan'];

export function useArtifactCounts(): Partial<Record<OscalArtifactType, number>> {
  const [counts, setCounts] = useState<Partial<Record<OscalArtifactType, number>>>({});

  useEffect(() => {
    let active = true;
    void Promise.all(
      COUNTED_TYPES.map((type) =>
        ArtifactRepository.forType(type)
          .count()
          .then((count) => [type, count] as const),
      ),
    ).then((entries) => {
      if (active) setCounts(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, []);

  return counts;
}
