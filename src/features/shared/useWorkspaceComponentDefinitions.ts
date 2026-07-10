// Hook: load workspace component-definitions, for the SSP system-implementation import picker.
// Decision IDs: ADR-0023.
import { useWorkspaceArtifacts } from './useWorkspaceArtifacts';
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition } from '@/models/componentDefinition';

export function useWorkspaceComponentDefinitions(): StoredArtifact<ComponentDefinition>[] {
  return useWorkspaceArtifacts<ComponentDefinition>('componentDefinition');
}
