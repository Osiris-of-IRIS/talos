// Hook: load workspace profiles, for the profile import-source picker and the Profile Creation
// Assistant. Decision IDs: ADR-0032.
import { useEffect, useState } from 'react';
import { ArtifactRepository } from '@/data/artifactRepository';
import type { StoredArtifact } from '@/data/db';
import type { Profile } from '@/models/profile';

export function useWorkspaceProfiles(): StoredArtifact<Profile>[] {
  const [items, setItems] = useState<StoredArtifact<Profile>[]>([]);
  useEffect(() => {
    let active = true;
    void ArtifactRepository.forType<Profile>('profile')
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
