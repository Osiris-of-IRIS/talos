// Hook: load workspace profiles, for the profile import-source picker and the Profile Creation
// Assistant. Decision IDs: ADR-0032.
import { useWorkspaceArtifacts } from './useWorkspaceArtifacts';
import type { StoredArtifact } from '@/data/db';
import type { Profile } from '@/models/profile';

export function useWorkspaceProfiles(): StoredArtifact<Profile>[] {
  return useWorkspaceArtifacts<Profile>('profile');
}
