// System Security Plans workspace store. Decision IDs: ADR-0002, ADR-0004.
import { createArtifactStore } from '@/features/shared/createArtifactStore';
import type { SystemSecurityPlan } from '@/models/ssp';

export const useSspsStore = createArtifactStore<SystemSecurityPlan>(
  'systemSecurityPlan',
  'system security plan',
);
