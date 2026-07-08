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
  const match = findSspByCorrelationKey(existing, plan.correlationKey);
  if (match) {
    await repo.update(match.uuid, {
      ...match.artifact,
      systemCharacteristics: plan.systemCharacteristics,
      controlImplementation: plan.controlImplementation,
    });
    return 'updated';
  }
  const blank = createBlankSsp();
  const artifact: SystemSecurityPlan = {
    ...blank,
    systemCharacteristics: plan.systemCharacteristics,
    controlImplementation: plan.controlImplementation,
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
