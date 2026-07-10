// Blank-artifact factory for profiles. Decision IDs: ADR-0003, ADR-0007, ADR-0019, ADR-0032.
import type { Profile } from '@/models/profile';
import { AS_IS_MERGE } from '@/models/profile';
import { CREATOR_ROLE_ID } from '@/models/creator';

export function createBlankProfile(): Profile {
  return {
    uuid: globalThis.crypto.randomUUID(),
    metadata: {
      title: '',
      version: '1.0.0',
      oscalVersion: '1.2.2',
      lastModified: new Date().toISOString(),
      // Seed the mandatory creator role (ADR-0019) so authoring guides the user to add a party
      // with a name + email and assign it as the responsible creator.
      roles: [{ id: CREATOR_ROLE_ID, title: 'Creator' }],
    },
    imports: [],
    merge: AS_IS_MERGE,
  };
}
