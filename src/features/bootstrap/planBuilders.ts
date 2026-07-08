/**
 * Shared building blocks for the SSP-bootstrap generators (ADR-0026): the target-artifact shape
 * (`BootstrapSspPlan`), per-asset `system-characteristics` seeding, and catalog-control dedupe
 * (a control can be indexed twice — literal id + `_uuid` alt-identifier form, ADR-0021 — under
 * the same object reference).
 */
import { indexCatalogControls } from '@/data/catalogResolution';
import type { Catalog } from '@/models/catalog';
import type { Control } from '@/models/control';
import type { Asset, AssetType } from '@/models/asset';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';
import type { SspControlImplementation, SystemCharacteristics } from '@/models/ssp';
import { withBootstrapSource } from './bootstrapProvenance';

/** A generated (or to-be-updated) SSP body, correlated to its source asset / the ISMS sentinel. */
export interface BootstrapSspPlan {
  correlationKey: string;
  systemCharacteristics: SystemCharacteristics;
  controlImplementation: SspControlImplementation;
}

/** Every distinct control in a catalog (deduped across its literal-id / alt-id index entries). */
export function uniqueCatalogControls(catalog: Catalog): Control[] {
  return [...new Set(indexCatalogControls(catalog).values())];
}

/** Seed `system-characteristics` from an asset's CSV fields, tagged with its correlation key. */
export function buildAssetSystemCharacteristics(asset: Asset, correlationKey: string): SystemCharacteristics {
  return {
    systemIds: [],
    systemName: asset.name,
    description: asset.description || asset.name,
    props: withBootstrapSource(undefined, correlationKey),
    systemInformation: {
      informationTypes: asset.informationTypes
        ? [{ title: asset.informationTypes, description: asset.informationTypes }]
        : [],
    },
    status: { state: 'operational' },
    authorizationBoundary: { description: '' },
    ...(asset.securitySensitivityLevel
      ? { securitySensitivityLevel: asset.securitySensitivityLevel }
      : {}),
  };
}

/** Seed `system-characteristics` for the BSI-style "ISMS as a whole" SSP. */
export function buildIsmsSystemCharacteristics(systemName: string, correlationKey: string): SystemCharacteristics {
  return {
    systemIds: [],
    systemName,
    description: systemName,
    props: withBootstrapSource(undefined, correlationKey),
    systemInformation: { informationTypes: [] },
    status: { state: 'operational' },
    authorizationBoundary: { description: '' },
  };
}

export type AssetCategoryResolution =
  | { ok: true; category: TargetObjectCategory }
  | { ok: false; warning: string };

/**
 * Resolve an asset's `assetType` to its mapped `TargetObjectCategory`, shared by both generators
 * (NIST/BSI) so the resolution rule and warning wording can't silently drift between them. Returns
 * a warning (asset skipped, not an error) when the type or its category mapping is missing or
 * doesn't resolve against the loaded hierarchy.
 */
export function resolveAssetCategory(
  asset: Asset,
  typeByUuid: Map<string, AssetType>,
  byUuid: Map<string, TargetObjectCategory>,
): AssetCategoryResolution {
  const type = typeByUuid.get(asset.assetType);
  const categoryUuid = type?.targetObjectCategoryUuid;
  const category = categoryUuid ? byUuid.get(categoryUuid) : undefined;
  if (!type || !categoryUuid || !category) {
    return {
      ok: false,
      warning: `Asset "${asset.uuid}" (${asset.name}) has no resolvable target-object-category; skipped.`,
    };
  }
  return { ok: true, category };
}

/** Build `control-implementation.implemented-requirements` from a set of controls (no by-components — see ADR-0026). */
export function buildControlImplementation(description: string, controls: Control[]): SspControlImplementation {
  return {
    description,
    implementedRequirements: controls.map((c) => ({
      uuid: globalThis.crypto.randomUUID(),
      controlId: c.id,
    })),
  };
}
