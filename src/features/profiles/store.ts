// Profiles workspace store. Decision IDs: ADR-0032.
import { createArtifactStore } from '@/features/shared/createArtifactStore';
import type { Profile } from '@/models/profile';

export const useProfilesStore = createArtifactStore<Profile>('profile', 'profile');
