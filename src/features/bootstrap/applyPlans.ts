/**
 * Apply generated bootstrap plans to the workspace `ssps` store (ADR-0026): idempotent —
 * re-running the assistant updates a previously-generated SSP (matched by its `bootstrap-source`
 * correlation-key prop) in place, rather than creating a duplicate. Only
 * `system-characteristics`/`control-implementation` are overwritten; everything else an editor
 * added by hand (system-implementation components, back-matter, metadata) is preserved.
 */
import { ArtifactRepository } from '@/data/artifactRepository';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan } from '@/models/ssp';
import { createBlankSsp } from '@/features/ssps/blank';
import { findSspByCorrelationKey } from './bootstrapProvenance';
import type { BootstrapSspPlan } from './planBuilders';

export interface ApplyResult {
  created: number;
  updated: number;
}

/** Write one plan (create or update), returning which it did. Each plan targets a distinct SSP
 * record (unique correlation key per batch), so these writes have no ordering dependency on
 * each other and can run concurrently. */
async function applyOnePlan(
  repo: ArtifactRepository<SystemSecurityPlan>,
  existing: StoredArtifact<SystemSecurityPlan>[],
  plan: BootstrapSspPlan,
): Promise<'created' | 'updated'> {
  // metadata.title is the document title shown everywhere (list pages, filenames) — distinct
  // from system-characteristics.system-name, but there's no user typing a separate one in for a
  // generated SSP, so mirror the system name into it. Set on update too, so a re-run heals a
  // title that drifted (e.g. the asset was renamed) or was never set (pre-fix data).
  const title = plan.systemCharacteristics.systemName;
  const match = findSspByCorrelationKey(existing, plan.correlationKey);
  if (match) {
    await repo.update(match.uuid, {
      ...match.artifact,
      metadata: { ...match.artifact.metadata, title },
      systemCharacteristics: plan.systemCharacteristics,
      controlImplementation: plan.controlImplementation,
      // inventoryItems is regenerated every run, same as system-characteristics/control-implementation
      // above; components/users are preserved (spread from the existing systemImplementation) since
      // those stay a manual, post-bootstrap editing step (ADR-0026, ADR-0031).
      systemImplementation: { ...match.artifact.systemImplementation, inventoryItems: plan.inventoryItems },
    });
    return 'updated';
  }
  const blank = createBlankSsp();
  const artifact: SystemSecurityPlan = {
    ...blank,
    metadata: { ...blank.metadata, title },
    systemCharacteristics: plan.systemCharacteristics,
    controlImplementation: plan.controlImplementation,
    systemImplementation: { ...blank.systemImplementation, inventoryItems: plan.inventoryItems },
  };
  await repo.create({ uuid: blank.uuid, type: 'systemSecurityPlan', origin: 'user', artifact });
  return 'created';
}

export async function applyBootstrapPlans(plans: BootstrapSspPlan[]): Promise<ApplyResult> {
  const repo = ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');
  const existing = await repo.getAll();

  const outcomes = await Promise.all(plans.map((plan) => applyOnePlan(repo, existing, plan)));

  return {
    created: outcomes.filter((o) => o === 'created').length,
    updated: outcomes.filter((o) => o === 'updated').length,
  };
}
