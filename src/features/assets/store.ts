/**
 * Assets workspace store (ADR-0026) — the SSP-bootstrap input data. Not an OSCAL artifact type,
 * so this is a bespoke store rather than `createArtifactStore`; a CSV-trio upload **replaces**
 * the whole asset list (re-upload = re-sync, not merge), matching "the asset list" as a single
 * unit of data rather than individually-authored records.
 */
import { create } from 'zustand';
import { getDb } from '@/data/db';
import {
  parseAssetTypesCsv,
  parseAssetsCsv,
  parseAssetTypeMappingsCsv,
  applyAssetTypeMappings,
  crossCheckAssets,
  type Asset,
  type AssetType,
} from '@/models/asset';

async function replaceStore<S extends 'assets' | 'assetTypes'>(
  db: Awaited<ReturnType<typeof getDb>>,
  storeName: S,
  items: (S extends 'assets' ? Asset : AssetType)[],
): Promise<void> {
  const tx = db.transaction(storeName, 'readwrite');
  await tx.store.clear();
  await Promise.all(items.map((item) => tx.store.put(item)));
  await tx.done;
}

export interface AssetsState {
  assets: Asset[];
  assetTypes: AssetType[];
  loading: boolean;
  error: string | null;
  /** Non-blocking cross-check warnings from the most recent import (e.g. unknown asset_type refs). */
  warnings: string[];
  load: () => Promise<void>;
  /** Replace the whole asset list from the three golden-data-shaped CSV files. */
  importCsvTrio: (assetTypesText: string, assetsText: string, mappingsText: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  assets: [],
  assetTypes: [],
  loading: false,
  error: null,
  warnings: [],

  load: async () => {
    set({ loading: true, error: null });
    try {
      const db = await getDb();
      const [assets, assetTypes] = await Promise.all([db.getAll('assets'), db.getAll('assetTypes')]);
      assets.sort((a, b) => a.name.localeCompare(b.name));
      assetTypes.sort((a, b) => a.title.localeCompare(b.title));
      set({ assets, assetTypes, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  importCsvTrio: async (assetTypesText, assetsText, mappingsText) => {
    set({ error: null, warnings: [] });
    const types = applyAssetTypeMappings(
      parseAssetTypesCsv(assetTypesText),
      parseAssetTypeMappingsCsv(mappingsText),
    );
    const assets = parseAssetsCsv(assetsText);
    const warnings = crossCheckAssets(assets, types);

    const db = await getDb();
    await replaceStore(db, 'assetTypes', types);
    await replaceStore(db, 'assets', assets);

    await get().load();
    set({ warnings });
  },

  clear: async () => {
    const db = await getDb();
    await db.clear('assets');
    await db.clear('assetTypes');
    await get().load();
  },
}));
