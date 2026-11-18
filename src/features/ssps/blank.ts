// Blank-artifact factory for SSPs. Decision IDs: ADR-0003, ADR-0007, ADR-0017, ADR-0019.
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import type { SystemSecurityPlan } from '@/models/ssp';
import { CREATOR_ROLE_ID } from '@/models/creator';

export function createBlankSsp(): SystemSecurityPlan {
  return {
    uuid: globalThis.crypto.randomUUID(),
    metadata: {
      title: '',
      version: '1.0.0',
      oscalVersion: OSCAL_AUTHORING_VERSION,
      lastModified: new Date().toISOString(),
      // Seed the mandatory creator role (ADR-0019), same convention as componentDefinitions/blank.ts.
      roles: [{ id: CREATOR_ROLE_ID, title: 'Creator' }],
    },
    importProfile: { href: '' },
    systemCharacteristics: {
      systemIds: [],
      systemName: '',
      description: '',
      systemInformation: { informationTypes: [] },
      status: { state: 'operational' },
      authorizationBoundary: { description: '' },
    },
    systemImplementation: {
      users: [],
      components: [],
    },
    controlImplementation: {
      description: '',
      implementedRequirements: [],
    },
  };
}
