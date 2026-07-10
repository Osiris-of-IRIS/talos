// Hook: load every workspace artifact of one type — the shared body behind
// useWorkspaceCatalogs/useWorkspaceProfiles/useWorkspaceComponentDefinitions.
import { useEffect, useState } from 'react';
import { ArtifactRepository } from '@/data/artifactRepository';
import type { StoredArtifact } from '@/data/db';
import type { OscalArtifactType } from '@/models/oscalBase';

export function useWorkspaceArtifacts<T>(type: OscalArtifactType): StoredArtifact<T>[] {
  const [items, setItems] = useState<StoredArtifact<T>[]>([]);
  useEffect(() => {
    let active = true;
    void ArtifactRepository.forType<T>(type)
      .getAll()
      .then((r) => {
        if (active) setItems(r);
      });
    return () => {
      active = false;
    };
  }, [type]);
  return items;
}
