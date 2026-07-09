/**
 * Correlation-key provenance for bootstrap-generated SSPs (ADR-0026). Re-running the assistant
 * must update, not duplicate, previously-generated SSPs — each generated SSP's
 * `system-characteristics.props` carries a `bootstrap-source` prop naming the asset (or the ISMS
 * sentinel) it was generated from, mirroring the plain kebab-case prop convention used for
 * component-import provenance (ADR-0023, `componentImport.ts`).
 */
import type { Prop } from '@/models/oscalBase';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan } from '@/models/ssp';

const PROP_BOOTSTRAP_SOURCE = 'bootstrap-source';

/** Correlation key for the single BSI-style "ISMS as a whole" SSP. */
export const ISMS_CORRELATION_KEY = 'isms';

/** Correlation key for a per-asset generated SSP. */
export function assetCorrelationKey(assetId: string): string {
  return `asset:${assetId}`;
}

/** Set (replacing any existing) the `bootstrap-source` prop. */
export function withBootstrapSource(props: Prop[] | undefined, correlationKey: string): Prop[] {
  return [
    ...(props ?? []).filter((p) => p.name !== PROP_BOOTSTRAP_SOURCE),
    { name: PROP_BOOTSTRAP_SOURCE, value: correlationKey },
  ];
}

export function getBootstrapSource(props: Prop[] | undefined): string | undefined {
  return props?.find((p) => p.name === PROP_BOOTSTRAP_SOURCE)?.value;
}

/** Find a previously bootstrap-generated SSP by its correlation key, for idempotent re-run. */
export function findSspByCorrelationKey(
  ssps: StoredArtifact<SystemSecurityPlan>[],
  correlationKey: string,
): StoredArtifact<SystemSecurityPlan> | undefined {
  return ssps.find(
    (r) => getBootstrapSource(r.artifact.systemCharacteristics.props) === correlationKey,
  );
}
