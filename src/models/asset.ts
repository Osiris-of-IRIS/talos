/**
 * Asset / asset-type model for the SSP-bootstrap assistant (ADR-0026, ADR-0031, T-301). Not an
 * OSCAL artifact — TALOS-internal input data (an asset list + its taxonomy) that drives generation
 * of `SystemSecurityPlan` documents (including their `system-implementation.inventory-items`,
 * ADR-0031), never itself imported/exported as OSCAL. Column shapes mirror the golden data
 * (`tests/data/golden/recplast`), which is itself the canonical three-file CSV format:
 * `asset_types.csv`, `assets.csv`, `mappings.csv` — plus a bespoke combined-JSON alternative.
 */
import { parseCsv } from '@/data/csvParse';
import { stringifyCsv } from '@/data/csvStringify';

const ASSETS_CSV_HEADER = [
  'asset-id',
  'name',
  'asset-type',
  'description',
  'security-sensitivity-level',
  'information-types',
  'ipv4-address',
  'ipv6-address',
  'fqdn',
  'netbios-name',
  'mac-address',
  'serial-number',
  'physical-location',
  'vendor-name',
  'uri',
  'is-scanned',
];

export interface AssetType {
  uuid: string;
  title: string;
  /** BSI target-object-category UUID this asset type maps to (`mappings.csv`), if any. */
  targetObjectCategoryUuid?: string;
  /** NIST OSCAL `asset-type` prop enum value aligned to this type, where one clearly fits
   * (ADR-0031) — e.g. `network-router` → `router`. Absent when there's no honest equivalent;
   * generation then falls back to this type's own `title` (spec-legal: the enum allows other
   * values). */
  oscalAssetType?: string;
}

/**
 * A single asset. `assetId` is a free-form organizational tracking code (e.g. `C001`) — **not** an
 * OSCAL uuid (ADR-0031): OSCAL's `inventory-item.uuid` requires a real RFC4122 UUID, minted fresh
 * at bootstrap-generation time; `assetId` becomes that item's `props[name="asset-id"]` instead.
 * The optional fields below mirror `inventory-item`'s recognized props one-for-one; absent means
 * "not applicable/unknown for this asset" and the prop is omitted from generation entirely, never
 * emitted as a blank prop.
 */
export interface Asset {
  assetId: string;
  name: string;
  /** References `AssetType.uuid`. */
  assetType: string;
  description: string;
  securitySensitivityLevel: string;
  informationTypes: string;
  ipv4Address?: string;
  ipv6Address?: string;
  fqdn?: string;
  netbiosName?: string;
  macAddress?: string;
  serialNumber?: string;
  physicalLocation?: string;
  vendorName?: string;
  uri?: string;
  /** `'yes'` | `'no'` — matches the `is-scanned` prop's allowed values. */
  isScanned?: string;
}

export interface AssetWorkspace {
  assetTypes: AssetType[];
  assets: Asset[];
}

function requireField(row: Record<string, string>, key: string, rowLabel: string): string {
  const value = row[key];
  if (!value || value.trim() === '') {
    throw new Error(`${rowLabel} is missing required field "${key}".`);
  }
  return value;
}

/** Parse `asset_types.csv` (columns: `uuid,title`, optional `oscal-asset-type`). */
export function parseAssetTypesCsv(text: string): AssetType[] {
  return parseCsv(text).map((row, i) => {
    const label = `asset_types.csv row ${i + 2}`;
    const oscalAssetType = row['oscal-asset-type']?.trim();
    return {
      uuid: requireField(row, 'uuid', label),
      title: requireField(row, 'title', label),
      ...(oscalAssetType ? { oscalAssetType } : {}),
    };
  });
}

/** A blank/missing cell means the optional prop doesn't apply to this asset — `undefined`, not `''`. */
function optionalField(row: Record<string, string>, key: string): string | undefined {
  const value = row[key];
  return value && value.trim() !== '' ? value : undefined;
}

/**
 * Parse `assets.csv` (columns: `asset-id,name,asset-type,description,
 * security-sensitivity-level,information-types`, plus the optional inventory-item prop columns —
 * see the `Asset` doc comment). Every optional column is fine to omit from the file entirely.
 */
export function parseAssetsCsv(text: string): Asset[] {
  return parseCsv(text).map((row, i) => {
    const label = `assets.csv row ${i + 2} (asset-id "${row['asset-id'] || '?'}")`;
    return {
      assetId: requireField(row, 'asset-id', label),
      name: requireField(row, 'name', label),
      assetType: requireField(row, 'asset-type', label),
      description: row.description ?? '',
      securitySensitivityLevel: row['security-sensitivity-level'] ?? '',
      informationTypes: row['information-types'] ?? '',
      ipv4Address: optionalField(row, 'ipv4-address'),
      ipv6Address: optionalField(row, 'ipv6-address'),
      fqdn: optionalField(row, 'fqdn'),
      netbiosName: optionalField(row, 'netbios-name'),
      macAddress: optionalField(row, 'mac-address'),
      serialNumber: optionalField(row, 'serial-number'),
      physicalLocation: optionalField(row, 'physical-location'),
      vendorName: optionalField(row, 'vendor-name'),
      uri: optionalField(row, 'uri'),
      isScanned: optionalField(row, 'is-scanned'),
    };
  });
}

/** Serialize assets back to the `assets.csv` shape (the inverse of `parseAssetsCsv`) — used to download a selected subset (ADR-0027). */
export function serializeAssetsCsv(assets: Asset[]): string {
  return stringifyCsv(
    ASSETS_CSV_HEADER,
    assets.map((a) => ({
      'asset-id': a.assetId,
      name: a.name,
      'asset-type': a.assetType,
      description: a.description,
      'security-sensitivity-level': a.securitySensitivityLevel,
      'information-types': a.informationTypes,
      'ipv4-address': a.ipv4Address ?? '',
      'ipv6-address': a.ipv6Address ?? '',
      fqdn: a.fqdn ?? '',
      'netbios-name': a.netbiosName ?? '',
      'mac-address': a.macAddress ?? '',
      'serial-number': a.serialNumber ?? '',
      'physical-location': a.physicalLocation ?? '',
      'vendor-name': a.vendorName ?? '',
      uri: a.uri ?? '',
      'is-scanned': a.isScanned ?? '',
    })),
  );
}

/** Parse `mappings.csv` (columns: `asset_type_uuid,targetobj_class_uuid`) into a lookup map. */
export function parseAssetTypeMappingsCsv(text: string): Map<string, string> {
  const map = new Map<string, string>();
  parseCsv(text).forEach((row, i) => {
    const label = `mappings.csv row ${i + 2}`;
    const assetTypeUuid = requireField(row, 'asset_type_uuid', label);
    const categoryUuid = requireField(row, 'targetobj_class_uuid', label);
    map.set(assetTypeUuid, categoryUuid);
  });
  return map;
}

/** Merge a `mappings.csv` lookup into asset types, setting `targetObjectCategoryUuid`. */
export function applyAssetTypeMappings(types: AssetType[], mappings: Map<string, string>): AssetType[] {
  return types.map((t) => {
    const targetObjectCategoryUuid = mappings.get(t.uuid);
    return targetObjectCategoryUuid ? { ...t, targetObjectCategoryUuid } : t;
  });
}

/** Cross-check every asset references a known asset type; returns human-readable problem strings. */
export function crossCheckAssets(assets: Asset[], types: AssetType[]): string[] {
  const known = new Set(types.map((t) => t.uuid));
  return assets
    .filter((a) => !known.has(a.assetType))
    .map((a) => `Asset "${a.assetId}" (${a.name}) references unknown asset type "${a.assetType}".`);
}

/**
 * Serialize the whole asset workspace (types + assets; `mappings.csv` is already folded into
 * `targetObjectCategoryUuid`, so no separate mappings shape is needed here) to a bespoke JSON
 * document — not an OSCAL artifact, same status as the CSV shape (ADR-0031).
 */
export function serializeAssetWorkspaceJson(types: AssetType[], assets: Asset[]): string {
  return JSON.stringify({ assetTypes: types, assets }, null, 2);
}

/** Parse a workspace JSON document produced by `serializeAssetWorkspaceJson` (or hand-authored to the same shape). */
export function parseAssetWorkspaceJson(text: string): AssetWorkspace {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Asset workspace file is not valid JSON.');
  }
  if (json === null || typeof json !== 'object') {
    throw new Error('Asset workspace JSON must be an object with "assetTypes" and "assets" arrays.');
  }
  const { assetTypes, assets } = json as Partial<AssetWorkspace>;
  if (!Array.isArray(assetTypes)) {
    throw new Error('Asset workspace JSON is missing an "assetTypes" array.');
  }
  if (!Array.isArray(assets)) {
    throw new Error('Asset workspace JSON is missing an "assets" array.');
  }
  return { assetTypes, assets };
}
