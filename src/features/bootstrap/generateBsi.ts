/**
 * BSI-style SSP bootstrap (ADR-0026): a single SSP for the ISMS as a whole, holding every catalog
 * control with no `target_object_categories` tag; plus one SSP per mapped asset, holding every
 * control tagged with the asset's target-object-category or one of its ancestors in the BSI
 * hierarchy.
 */
import type { Asset, AssetType } from '@/models/asset';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';
import type { Catalog } from '@/models/catalog';
import { buildCategoryIndex, categoryTitlesInChain, hasNoTargetObjectCategory, controlMatchesAnyTitle } from '@/data/targetObjectHierarchy';
import { ISMS_CORRELATION_KEY, assetCorrelationKey } from './bootstrapProvenance';
import {
  buildAssetInventoryItem,
  buildAssetSystemCharacteristics,
  buildIsmsSystemCharacteristics,
  buildControlImplementation,
  resolveAssetCategory,
  uniqueCatalogControls,
  type BootstrapSspPlan,
} from './planBuilders';
import type { GenerateResult } from './generateNist';

export interface GenerateBsiParams {
  assets: Asset[];
  assetTypes: AssetType[];
  categoryRows: TargetObjectCategory[];
  catalog: Catalog;
  /** Display name for the ISMS-wide SSP (UI-supplied, translated — ADR-0012). */
  ismsSystemName: string;
}

export function generateBsi(params: GenerateBsiParams): GenerateResult {
  const { assets, assetTypes, categoryRows, catalog, ismsSystemName } = params;
  const typeByUuid = new Map(assetTypes.map((t) => [t.uuid, t]));
  const byUuid = buildCategoryIndex(categoryRows);
  const controls = uniqueCatalogControls(catalog);
  const warnings: string[] = [];

  const plans: BootstrapSspPlan[] = [
    {
      correlationKey: ISMS_CORRELATION_KEY,
      systemCharacteristics: buildIsmsSystemCharacteristics(ismsSystemName, ISMS_CORRELATION_KEY),
      controlImplementation: buildControlImplementation(
        `Bootstrapped from catalog "${catalog.metadata.title}" (BSI-style, ISMS-wide, ADR-0026).`,
        controls.filter(hasNoTargetObjectCategory),
      ),
    },
  ];

  for (const asset of assets) {
    const resolved = resolveAssetCategory(asset, typeByUuid, byUuid);
    if (!resolved.ok) {
      warnings.push(resolved.warning);
      continue;
    }
    const correlationKey = assetCorrelationKey(asset.assetId);
    // Resolve the ancestor chain once per asset (not once per control): controlMatchesAnyTitle
    // just checks against this precomputed set instead of re-walking ChildOfUUID for every control.
    const eligibleTitles = new Set(categoryTitlesInChain(resolved.category.uuid, byUuid));
    const matching = controls.filter((c) => controlMatchesAnyTitle(c, eligibleTitles));
    plans.push({
      correlationKey,
      systemCharacteristics: buildAssetSystemCharacteristics(asset, correlationKey),
      controlImplementation: buildControlImplementation(
        `Bootstrapped from catalog "${catalog.metadata.title}" (BSI-style, ADR-0026).`,
        matching,
      ),
      inventoryItems: [buildAssetInventoryItem(asset, typeByUuid.get(asset.assetType))],
    });
  }

  return { plans, warnings };
}
