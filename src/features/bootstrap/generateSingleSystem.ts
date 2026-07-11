/**
 * Single-System SSP bootstrap (ADR-0026 §MVP-Feedback "Single System" variant, T-301 follow-up):
 * the user picks exactly one asset and one baseline source (a workspace catalog *or* profile,
 * unlike NIST/BSI-style, which are catalog-only) and gets back one SSP for that asset holding
 * every control the source resolves to — no target-object-category filtering, unlike BSI-style.
 */
import type { Asset, AssetType } from '@/models/asset';
import type { Catalog } from '@/models/catalog';
import type { Profile } from '@/models/profile';
import type { StoredArtifact } from '@/data/db';
import { resolveProfileControlIds } from '@/data/profileImportResolution';
import { assetCorrelationKey } from './bootstrapProvenance';
import {
  buildAssetInventoryItem,
  buildAssetSystemCharacteristics,
  buildControlImplementationFromIds,
  uniqueCatalogControls,
  type BootstrapSspPlan,
} from './planBuilders';
import type { GenerateResult } from './generateNist';

export type SingleSystemSource = { type: 'catalog'; catalog: Catalog } | { type: 'profile'; profile: Profile };

export interface GenerateSingleSystemParams {
  asset: Asset;
  assetType: AssetType | undefined;
  source: SingleSystemSource;
  /** Only needed to resolve a profile source's own imports (`resolveProfileControlIds`) — unused
   * for a catalog source. */
  catalogs: StoredArtifact<Catalog>[];
  profiles: StoredArtifact<Profile>[];
}

export function generateSingleSystem(params: GenerateSingleSystemParams): GenerateResult {
  const { asset, assetType, source, catalogs, profiles } = params;
  const warnings: string[] = [];

  let controlIds: string[];
  let sourceLabel: string;
  if (source.type === 'catalog') {
    controlIds = uniqueCatalogControls(source.catalog).map((c) => c.id);
    sourceLabel = `catalog "${source.catalog.metadata.title}"`;
  } else {
    const resolution = resolveProfileControlIds(source.profile, catalogs, profiles);
    controlIds = resolution.controlIds;
    sourceLabel = `profile "${source.profile.metadata.title}"`;
    if (resolution.hasUnresolvedAll) {
      warnings.push(
        `Profile "${source.profile.metadata.title}" has an import (possibly nested inside another profile) that could not be fully resolved — a dangling reference or a profile-of-profile cycle; some controls may be missing.`,
      );
    }
  }
  if (controlIds.length === 0) {
    warnings.push(`The chosen ${sourceLabel} resolves to no controls.`);
  }

  const correlationKey = assetCorrelationKey(asset.assetId);
  const plan: BootstrapSspPlan = {
    correlationKey,
    systemCharacteristics: buildAssetSystemCharacteristics(asset, correlationKey),
    controlImplementation: buildControlImplementationFromIds(
      `Bootstrapped from ${sourceLabel} (Single-System style, ADR-0026).`,
      controlIds,
    ),
    inventoryItems: [buildAssetInventoryItem(asset, assetType)],
  };

  return { plans: [plan], warnings };
}
