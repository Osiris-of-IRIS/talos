// Blank-artifact factory for component-definitions. Decision IDs: ADR-0003, ADR-0007, ADR-0019.
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import type { ComponentDefinition } from '@/models/componentDefinition';
import { CREATOR_ROLE_ID } from '@/models/creator';

export function createBlankComponentDefinition(): ComponentDefinition {
  return {
    uuid: globalThis.crypto.randomUUID(),
    metadata: {
      title: '',
      version: '1.0.0',
      oscalVersion: OSCAL_AUTHORING_VERSION,
      lastModified: new Date().toISOString(),
      // Seed the mandatory creator role (ADR-0019) so authoring guides the user to add a party
      // with a name + email and assign it as the responsible creator.
      roles: [{ id: CREATOR_ROLE_ID, title: 'Creator' }],
    },
    components: [],
  };
}
