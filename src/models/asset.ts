/**
 * Asset / asset-type model for the SSP-bootstrap assistant (ADR-0026, T-301). Not an OSCAL
 * artifact — TALOS-internal input data (an asset list + its taxonomy) that drives generation of
 * `SystemSecurityPlan` documents, never itself imported/exported as OSCAL. Column shapes mirror
 * the golden data (`tests/data/golden/recplast`), which is itself the canonical three-file CSV
 * format: `asset_types.csv`, `assets.csv`, `mappings.csv`.
 */
import { parseCsv } from '@/data/csvParse';
import { stringifyCsv } from '@/data/csvStringify';

const ASSETS_CSV_HEADER = [
  'uuid',
  'name',
  'asset_type',
  'description',
  'security-sensitivity-level',
  'information-types',
];

export interface AssetType {
  uuid: string;
  title: string;
  /** BSI target-object-category UUID this asset type maps to (`mappings.csv`), if any. */
  targetObjectCategoryUuid?: string;
}

export interface Asset {
  uuid: string;
  name: string;
  /** References `AssetType.uuid`. */
  assetType: string;
  description: string;
  securitySensitivityLevel: string;
  informationTypes: string;
}

function requireField(row: Record<string, string>, key: string, rowLabel: string): string {
  const value = row[key];
  if (!value || value.trim() === '') {
    throw new Error(`${rowLabel} is missing required field "${key}".`);
  }
  return value;
}

/** Parse `asset_types.csv` (columns: `uuid,title`). */
export function parseAssetTypesCsv(text: string): AssetType[] {
  return parseCsv(text).map((row, i) => {
    const label = `asset_types.csv row ${i + 2}`;
    return {
      uuid: requireField(row, 'uuid', label),
      title: requireField(row, 'title', label),
    };
  });
}

/**
 * Parse `assets.csv` (columns: `uuid,name,asset_type,description,security-sensitivity-level,
 * information-types`).
 */
export function parseAssetsCsv(text: string): Asset[] {
  return parseCsv(text).map((row, i) => {
    const label = `assets.csv row ${i + 2} (uuid "${row.uuid || '?'}")`;
    return {
      uuid: requireField(row, 'uuid', label),
      name: requireField(row, 'name', label),
      assetType: requireField(row, 'asset_type', label),
      description: row.description ?? '',
      securitySensitivityLevel: row['security-sensitivity-level'] ?? '',
      informationTypes: row['information-types'] ?? '',
    };
  });
}

/** Serialize assets back to the `assets.csv` shape (the inverse of `parseAssetsCsv`) — used to download a selected subset (ADR-0027). */
export function serializeAssetsCsv(assets: Asset[]): string {
  return stringifyCsv(
    ASSETS_CSV_HEADER,
    assets.map((a) => ({
      uuid: a.uuid,
      name: a.name,
      asset_type: a.assetType,
      description: a.description,
      'security-sensitivity-level': a.securitySensitivityLevel,
      'information-types': a.informationTypes,
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
    .map((a) => `Asset "${a.uuid}" (${a.name}) references unknown asset type "${a.assetType}".`);
}
