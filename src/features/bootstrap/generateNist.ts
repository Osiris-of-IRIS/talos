/**
 * NIST-style SSP bootstrap (ADR-0026): one SSP per "system"-typed asset — an asset whose mapped
 * target-object-category has `Typ === "IT-Systeme"` in the BSI hierarchy — with
 * `system-characteristics` seeded from the asset and `control-implementation` populated with
 * every control in the chosen catalog (NIST style does not filter by target-object-category).
 */
import type { Asset, AssetType } from '@/models/asset';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';
import type { Catalog } from '@/models/catalog';
import { buildCategoryIndex } from '@/data/targetObjectHierarchy';
import { assetCorrelationKey } from './bootstrapProvenance';
import {
  buildAssetInventoryItem,
  buildAssetSystemCharacteristics,
  buildControlImplementation,
  resolveAssetCategory,
  uniqueCatalogControls,
  type BootstrapSspPlan,
} from './planBuilders';

const SYSTEM_TYP = 'IT-Systeme';

export interface GenerateNistParams {
  assets: Asset[];
  assetTypes: AssetType[];
  categoryRows: TargetObjectCategory[];
  catalog: Catalog;
}

export interface GenerateResult {
  plans: BootstrapSspPlan[];
  warnings: string[];
}

export function generateNist(params: GenerateNistParams): GenerateResult {
  const { assets, assetTypes, categoryRows, catalog } = params;
  const typeByUuid = new Map(assetTypes.map((t) => [t.uuid, t]));
  const byUuid = buildCategoryIndex(categoryRows);
  const controls = uniqueCatalogControls(catalog);
  const warnings: string[] = [];

  if (controls.length === 0) {
    warnings.push(`Catalog "${catalog.metadata.title}" has no controls.`);
  }

  const plans: BootstrapSspPlan[] = [];
  for (const asset of assets) {
    const resolved = resolveAssetCategory(asset, typeByUuid, byUuid);
    if (!resolved.ok) {
      warnings.push(resolved.warning);
      continue;
    }
    if (resolved.category.typ !== SYSTEM_TYP) continue; // not a "system"-typed asset — not an error, just excluded

    const correlationKey = assetCorrelationKey(asset.assetId);
    plans.push({
      correlationKey,
      systemCharacteristics: buildAssetSystemCharacteristics(asset, correlationKey),
      controlImplementation: buildControlImplementation(
        `Bootstrapped from catalog "${catalog.metadata.title}" (NIST-style, ADR-0026).`,
        controls,
      ),
      inventoryItems: [buildAssetInventoryItem(asset, typeByUuid.get(asset.assetType))],
    });
  }
  return { plans, warnings };
}
