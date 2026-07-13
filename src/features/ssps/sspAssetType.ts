/**
 * An SSP's asset-type, read from its own `system-implementation.inventory-items[].props`
 * (ADR-0031) — only a bootstrap-generated per-asset SSP has one; a hand-authored SSP has none and
 * is simply not eligible for "apply to the same asset type" propagation (T-512, ADR-0037).
 */
import type { SystemSecurityPlan } from '@/models/ssp';

const ASSET_TYPE_PROP = 'asset-type';

export function getSspAssetType(ssp: SystemSecurityPlan): string | undefined {
  for (const item of ssp.systemImplementation.inventoryItems ?? []) {
    const value = item.props?.find((p) => p.name === ASSET_TYPE_PROP)?.value;
    if (value) return value;
  }
  return undefined;
}
