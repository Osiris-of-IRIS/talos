// Hook: load every workspace SSP — for "apply a change to other SSPs" propagation (T-512, ADR-0037).
import { useWorkspaceArtifacts } from './useWorkspaceArtifacts';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan } from '@/models/ssp';

export function useWorkspaceSsps(): StoredArtifact<SystemSecurityPlan>[] {
  return useWorkspaceArtifacts<SystemSecurityPlan>('systemSecurityPlan');
}
