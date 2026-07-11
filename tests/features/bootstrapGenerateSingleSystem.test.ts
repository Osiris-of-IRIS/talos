/**
 * Single-System SSP bootstrap generation (ADR-0026 MVP-Feedback "Single System" variant): one
 * asset + one catalog-or-profile baseline -> one SSP, no target-object-category filtering (that's
 * BSI-style's job). Covers TEST-BOOTSTRAP-03.
 */
import { describe, it, expect } from 'vitest';
import { generateSingleSystem } from '@/features/bootstrap/generateSingleSystem';
import { assetCorrelationKey, getBootstrapSource } from '@/features/bootstrap/bootstrapProvenance';
import type { Asset, AssetType } from '@/models/asset';
import type { Catalog } from '@/models/catalog';
import type { Profile } from '@/models/profile';
import type { StoredArtifact } from '@/data/db';

function stored<T>(uuid: string, artifact: T): StoredArtifact<T> {
  return { uuid, type: 'catalog', origin: 'user', createdAt: '', updatedAt: '', artifact };
}

const catalogUuid = 'cccccccc-0000-4000-8000-000000000001';
const catalog: Catalog = {
  uuid: catalogUuid,
  metadata: { title: 'Test Catalog', version: '1.0.0', oscalVersion: '1.2.2' },
  controls: [{ id: 'CTRL-1', title: 'Control One' }, { id: 'CTRL-2', title: 'Control Two' }],
} as Catalog;
const storedCatalog = stored(catalogUuid, catalog);

const ASSET: Asset = {
  assetId: 'C001',
  name: 'Finance Desktop',
  assetType: 'client-pc',
  description: 'Desktop PC',
  securitySensitivityLevel: 'normal',
  informationTypes: 'Finance data',
};
const ASSET_TYPE: AssetType = { uuid: 'client-pc', title: 'Desktop-PC (Client)' };

describe('generateSingleSystem', () => {
  it('creates exactly one plan for the picked asset, with every control from a catalog source', () => {
    const { plans, warnings } = generateSingleSystem({
      asset: ASSET,
      assetType: ASSET_TYPE,
      source: { type: 'catalog', catalog },
      catalogs: [storedCatalog],
      profiles: [],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.systemCharacteristics.systemName).toBe('Finance Desktop');
    expect(plans[0]!.controlImplementation.implementedRequirements.map((r) => r.controlId).sort()).toEqual([
      'CTRL-1',
      'CTRL-2',
    ]);
    expect(warnings).toEqual([]);
  });

  it('tags the plan with the asset correlation key, matching NIST/BSI-style for idempotent re-run', () => {
    const { plans } = generateSingleSystem({
      asset: ASSET,
      assetType: ASSET_TYPE,
      source: { type: 'catalog', catalog },
      catalogs: [storedCatalog],
      profiles: [],
    });
    expect(plans[0]!.correlationKey).toBe(assetCorrelationKey('C001'));
    expect(getBootstrapSource(plans[0]!.systemCharacteristics.props)).toBe(assetCorrelationKey('C001'));
  });

  it('builds a single inventory-item for the asset (ADR-0031)', () => {
    const { plans } = generateSingleSystem({
      asset: ASSET,
      assetType: ASSET_TYPE,
      source: { type: 'catalog', catalog },
      catalogs: [storedCatalog],
      profiles: [],
    });
    expect(plans[0]!.inventoryItems).toHaveLength(1);
    expect(plans[0]!.inventoryItems![0]!.props).toEqual(
      expect.arrayContaining([{ name: 'asset-id', value: 'C001' }]),
    );
  });

  it('resolves every control from a profile source (includeAll against its catalog import)', () => {
    const profile: Profile = {
      uuid: 'p1',
      metadata: { title: 'Baseline Profile', version: '1.0.0', oscalVersion: '1.2.2' },
      imports: [{ href: `#${catalogUuid}`, includeAll: {} }],
    } as Profile;
    const { plans, warnings } = generateSingleSystem({
      asset: ASSET,
      assetType: ASSET_TYPE,
      source: { type: 'profile', profile },
      catalogs: [storedCatalog],
      profiles: [],
    });
    expect(plans[0]!.controlImplementation.implementedRequirements.map((r) => r.controlId).sort()).toEqual([
      'CTRL-1',
      'CTRL-2',
    ]);
    expect(warnings).toEqual([]);
  });

  it('recursively resolves a profile-of-profile baseline (T-206) with no warning', () => {
    const other: Profile = {
      uuid: 'p2',
      metadata: { title: 'Other Profile', version: '1.0.0', oscalVersion: '1.2.2' },
      imports: [{ href: `#${catalogUuid}`, includeAll: {} }],
    } as Profile;
    const storedOther = stored('p2', other);
    const profile: Profile = {
      uuid: 'p1',
      metadata: { title: 'Baseline Profile', version: '1.0.0', oscalVersion: '1.2.2' },
      imports: [{ href: '#p2', includeAll: {} }],
    } as Profile;
    const { plans, warnings } = generateSingleSystem({
      asset: ASSET,
      assetType: ASSET_TYPE,
      source: { type: 'profile', profile },
      catalogs: [storedCatalog],
      profiles: [storedOther],
    });
    expect(plans[0]!.controlImplementation.implementedRequirements.map((r) => r.controlId).sort()).toEqual([
      'CTRL-1',
      'CTRL-2',
    ]);
    expect(warnings).toEqual([]);
  });

  it('warns (does not guess, does not infinite-loop) when a profile baseline has an already-stored profile-of-profile cycle', () => {
    const p1: Profile = {
      uuid: 'p1',
      metadata: { title: 'Baseline Profile', version: '1.0.0', oscalVersion: '1.2.2' },
      imports: [{ href: '#p2', includeAll: {} }],
    } as Profile;
    const p2: Profile = {
      uuid: 'p2',
      metadata: { title: 'Other Profile', version: '1.0.0', oscalVersion: '1.2.2' },
      imports: [{ href: '#p1', includeAll: {} }],
    } as Profile;
    const { plans, warnings } = generateSingleSystem({
      asset: ASSET,
      assetType: ASSET_TYPE,
      source: { type: 'profile', profile: p1 },
      catalogs: [storedCatalog],
      profiles: [stored('p1', p1), stored('p2', p2)],
    });
    expect(plans[0]!.controlImplementation.implementedRequirements).toEqual([]);
    expect(warnings.some((w) => w.includes('Baseline Profile'))).toBe(true);
  });

  it('warns when the chosen catalog resolves to no controls', () => {
    const emptyCatalog: Catalog = {
      uuid: 'empty',
      metadata: { title: 'Empty Catalog', version: '1.0.0', oscalVersion: '1.2.2' },
      controls: [],
    } as unknown as Catalog;
    const { warnings } = generateSingleSystem({
      asset: ASSET,
      assetType: ASSET_TYPE,
      source: { type: 'catalog', catalog: emptyCatalog },
      catalogs: [],
      profiles: [],
    });
    expect(warnings.some((w) => w.includes('Empty Catalog'))).toBe(true);
  });
});
