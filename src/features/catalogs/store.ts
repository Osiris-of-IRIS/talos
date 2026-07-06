// Catalogs workspace store (read-only sources). Decision IDs: ADR-0005, ADR-0008.
import { createArtifactStore } from '@/features/shared/createArtifactStore';
import type { Catalog } from '@/models/catalog';

export const useCatalogsStore = createArtifactStore<Catalog>('catalog', 'catalog');
