// Hook: load workspace catalogs (raw stored artifacts, not the control-resolution index) — for
// pickers that need origin/title/uuid rather than an indexed control map. Decision IDs: ADR-0032.
import { useWorkspaceArtifacts } from './useWorkspaceArtifacts';
import type { StoredArtifact } from '@/data/db';
import type { Catalog } from '@/models/catalog';

export function useWorkspaceCatalogs(): StoredArtifact<Catalog>[] {
  return useWorkspaceArtifacts<Catalog>('catalog');
}
