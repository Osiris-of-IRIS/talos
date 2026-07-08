/**
 * Assets workspace store (ADR-0026): CSV-trio upload replaces the whole asset list.
 * Covers TEST-ASSET-03.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { useAssetsStore } from '@/features/assets/store';

const GOLDEN_DIR = join(__dirname, '../data/golden/recplast');
function readGolden(name: string): string {
  return readFileSync(join(GOLDEN_DIR, name), 'utf-8');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useAssetsStore.setState({ assets: [], assetTypes: [], loading: false, error: null, warnings: [] });
});

describe('useAssetsStore', () => {
  it('imports the golden Recplast CSV trio with no warnings', async () => {
    const store = useAssetsStore.getState();
    await store.importCsvTrio(
      readGolden('asset_types.csv'),
      readGolden('assets.csv'),
      readGolden('mappings.csv'),
    );
    const state = useAssetsStore.getState();
    expect(state.assets).toHaveLength(94);
    expect(state.assetTypes).toHaveLength(23);
    expect(state.warnings).toEqual([]);
  });

  it('surfaces a non-blocking warning for an asset referencing an unknown asset type', async () => {
    const store = useAssetsStore.getState();
    await store.importCsvTrio(
      'uuid,title\nclient-pc,Desktop\n',
      'uuid,name,asset_type,description,security-sensitivity-level,information-types\nX1,Ghost,phantom,,,\n',
      'asset_type_uuid,targetobj_class_uuid\nclient-pc,837781a4-7b47-4695-9545-a3310eac7a66\n',
    );
    const state = useAssetsStore.getState();
    expect(state.assets).toHaveLength(1); // stored anyway (draft-friendly, non-blocking)
    expect(state.warnings).toHaveLength(1);
    expect(state.warnings[0]).toMatch(/phantom/);
  });

  it('replaces (not merges) the asset list on re-upload', async () => {
    const store = useAssetsStore.getState();
    await store.importCsvTrio(
      'uuid,title\nclient-pc,Desktop\n',
      'uuid,name,asset_type,description,security-sensitivity-level,information-types\nC1,First,client-pc,,,\n',
      'asset_type_uuid,targetobj_class_uuid\nclient-pc,837781a4-7b47-4695-9545-a3310eac7a66\n',
    );
    await store.importCsvTrio(
      'uuid,title\nserver,Server\n',
      'uuid,name,asset_type,description,security-sensitivity-level,information-types\nS1,Second,server,,,\n',
      'asset_type_uuid,targetobj_class_uuid\nserver,19c946fc-e991-44ee-87c5-7bbe5d5aaf55\n',
    );
    const state = useAssetsStore.getState();
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0]!.uuid).toBe('S1');
    expect(state.assetTypes).toHaveLength(1);
    expect(state.assetTypes[0]!.uuid).toBe('server');
  });

  it('clear() empties both stores', async () => {
    const store = useAssetsStore.getState();
    await store.importCsvTrio(
      readGolden('asset_types.csv'),
      readGolden('assets.csv'),
      readGolden('mappings.csv'),
    );
    await useAssetsStore.getState().clear();
    const state = useAssetsStore.getState();
    expect(state.assets).toEqual([]);
    expect(state.assetTypes).toEqual([]);
  });
});
