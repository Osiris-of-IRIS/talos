// Hook: load workspace component-definitions, for the SSP system-implementation import picker.
// Decision IDs: ADR-0023.
import { useEffect, useState } from 'react';
import { ArtifactRepository } from '@/data/artifactRepository';
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition } from '@/models/componentDefinition';

export function useWorkspaceComponentDefinitions(): StoredArtifact<ComponentDefinition>[] {
  const [items, setItems] = useState<StoredArtifact<ComponentDefinition>[]>([]);
  useEffect(() => {
    let active = true;
    void ArtifactRepository.forType<ComponentDefinition>('componentDefinition')
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
