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
import { createSelectionSlice, type SelectionSlice } from '@/features/shared/selectionSlice';

/**
 * Replace both the assets and asset-types stores in a single IndexedDB transaction, so a failure
 * partway through (e.g. a quota error) rolls back both writes instead of leaving them mutually
 * inconsistent (new types with stale assets, or vice versa).
 */
export async function replaceAssetLists(
  db: Awaited<ReturnType<typeof getDb>>,
  types: AssetType[],
  assets: Asset[],
): Promise<void> {
  const tx = db.transaction(['assetTypes', 'assets'], 'readwrite');
  // Mark tx.done "handled" immediately: our explicit tx.abort() below (for a synchronous request
  // failure IndexedDB wouldn't otherwise auto-abort on) makes it reject on a path that never
  // reaches the `await tx.done` below, which would otherwise surface as an unhandled rejection.
  const done = tx.done.catch(() => undefined);
  const typesStore = tx.objectStore('assetTypes');
  const assetsStore = tx.objectStore('assets');
  try {
    await Promise.all([typesStore.clear(), assetsStore.clear()]);
    await Promise.all([
      ...types.map((t) => typesStore.put(t)),
      ...assets.map((a) => assetsStore.put(a)),
    ]);
    await tx.done;
  } catch (err) {
    // IndexedDB only auto-aborts (and rolls back) on an *async* request failure; a request that
    // throws synchronously (e.g. `put()` on a record missing its keyPath) never becomes a
    // transactional request at all, so it wouldn't roll back the writes already made in this
    // transaction unless we abort explicitly here.
    try {
      tx.abort();
    } catch {
      // already aborted/finished — nothing to do.
    }
    await done;
    throw err;
  }
}

export interface AssetsState extends SelectionSlice {
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
  /** Bulk delete (ADR-0027): removes only the given assets (never asset-types, which would orphan
   * other assets); one reload afterward, not one per item; clears the selection. */
  removeMany: (uuids: string[]) => Promise<void>;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  ...createSelectionSlice<AssetsState>(set, get),
  assets: [],
  assetTypes: [],
  loading: false,
  error: null,
  warnings: [],

  load: async () => {
    // Warnings are ephemeral (tied to the most recent import in this session, never persisted),
    // so a (re)load always clears them — importCsvTrio sets the real ones again right after.
    set({ loading: true, error: null, warnings: [] });
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
    // Replaces the whole asset list, so any selection from the previous list is now stale.
    set({ error: null, warnings: [], selected: new Set() });
    const types = applyAssetTypeMappings(
      parseAssetTypesCsv(assetTypesText),
      parseAssetTypeMappingsCsv(mappingsText),
    );
    const assets = parseAssetsCsv(assetsText);
    const warnings = crossCheckAssets(assets, types);

    const db = await getDb();
    await replaceAssetLists(db, types, assets);

    await get().load();
    set({ warnings });
  },

  clear: async () => {
    const db = await getDb();
    const tx = db.transaction(['assets', 'assetTypes'], 'readwrite');
    await Promise.all([tx.objectStore('assets').clear(), tx.objectStore('assetTypes').clear()]);
    await tx.done;
    await get().load();
    set({ selected: new Set() });
  },

  removeMany: async (uuids) => {
    const db = await getDb();
    const tx = db.transaction('assets', 'readwrite');
    await Promise.all(uuids.map((uuid) => tx.store.delete(uuid)));
    await tx.done;
    await get().load();
    set({ selected: new Set() });
  },
}));
