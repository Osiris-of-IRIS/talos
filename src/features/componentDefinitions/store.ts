// Component-definitions workspace store. Decision IDs: ADR-0002, ADR-0004.
import { createArtifactStore } from '@/features/shared/createArtifactStore';
import type { ComponentDefinition } from '@/models/componentDefinition';

export const useComponentDefinitionsStore = createArtifactStore<ComponentDefinition>(
  'componentDefinition',
  'component-definition',
);
