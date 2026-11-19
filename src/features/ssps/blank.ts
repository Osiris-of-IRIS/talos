// Blank-artifact factory for SSPs. Decision IDs: ADR-0003, ADR-0007, ADR-0017, ADR-0019, ADR-0040.
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import { uuidSystemId, type SystemSecurityPlan } from '@/models/ssp';
import { CREATOR_ROLE_ID } from '@/models/creator';

// Valid by construction (ADR-0040): no empty required arrays — a UUID system id is seeded (the SSP's
// own uuid), `users` (optional since OSCAL 1.2.0) is not emitted. What only a human can supply
// (system name, information types, components, requirements) is reported by the compliance check.
export function createBlankSsp(): SystemSecurityPlan {
  const uuid = globalThis.crypto.randomUUID();
  return {
    uuid,
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
      systemIds: [uuidSystemId(uuid)],
      systemName: '',
      description: '',
      systemInformation: { informationTypes: [] },
      status: { state: 'operational' },
      authorizationBoundary: { description: '' },
    },
    systemImplementation: {
      components: [],
    },
    controlImplementation: {
      description: '',
      implementedRequirements: [],
    },
  };
}
