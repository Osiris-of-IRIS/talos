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
import type { Prop } from '@/models/oscalBase';
import type { InventoryItem, SspControlImplementation, SystemCharacteristics } from '@/models/ssp';
import { withBootstrapSource } from './bootstrapProvenance';

/** A generated (or to-be-updated) SSP body, correlated to its source asset / the ISMS sentinel. */
export interface BootstrapSspPlan {
  correlationKey: string;
  systemCharacteristics: SystemCharacteristics;
  controlImplementation: SspControlImplementation;
  /** One inventory-item for the source asset (ADR-0031); absent for the BSI ISMS-wide plan, which
   * isn't itself an asset. */
  inventoryItems?: InventoryItem[];
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
      warning: `Asset "${asset.assetId}" (${asset.name}) has no resolvable target-object-category; skipped.`,
    };
  }
  return { ok: true, category };
}

/**
 * Build a single `inventory-item` from an asset (ADR-0031): a fresh real `uuid` is minted (OSCAL
 * requires one — the asset's own tracking code is not a uuid), carrying `asset-id`/`asset-type`
 * plus every populated optional prop as `props[]`. A prop is included only when the asset has a
 * value for it — never emitted blank.
 */
export function buildAssetInventoryItem(asset: Asset, assetType: AssetType | undefined): InventoryItem {
  const props: Prop[] = [
    { name: 'asset-id', value: asset.assetId },
    { name: 'asset-type', value: assetType?.oscalAssetType || assetType?.title || asset.assetType },
  ];
  const optionalProps: [string, string | undefined][] = [
    ['ipv4-address', asset.ipv4Address],
    ['ipv6-address', asset.ipv6Address],
    ['fqdn', asset.fqdn],
    ['netbios-name', asset.netbiosName],
    ['mac-address', asset.macAddress],
    ['serial-number', asset.serialNumber],
    ['physical-location', asset.physicalLocation],
    ['vendor-name', asset.vendorName],
    ['uri', asset.uri],
    ['is-scanned', asset.isScanned],
  ];
  for (const [name, value] of optionalProps) {
    if (value) props.push({ name, value });
  }
  return {
    uuid: globalThis.crypto.randomUUID(),
    description: asset.description || asset.name,
    props,
  };
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

/** Same as `buildControlImplementation`, from already-resolved control ids rather than `Control`
 * objects — the Single-System generator's profile-sourced path only has ids (`resolveProfileControlIds`
 * resolves against a profile's own imports, which doesn't hand back full `Control` objects when
 * those ids were named explicitly rather than expanded from a catalog). */
export function buildControlImplementationFromIds(description: string, controlIds: string[]): SspControlImplementation {
  return {
    description,
    implementedRequirements: controlIds.map((controlId) => ({
      uuid: globalThis.crypto.randomUUID(),
      controlId,
    })),
  };
}
