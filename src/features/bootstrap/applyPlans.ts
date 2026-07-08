/**
 * Apply generated bootstrap plans to the workspace `ssps` store (ADR-0026): idempotent —
 * re-running the assistant updates a previously-generated SSP (matched by its `bootstrap-source`
 * correlation-key prop) in place, rather than creating a duplicate. Only
 * `system-characteristics`/`control-implementation` are overwritten; everything else an editor
 * added by hand (system-implementation components, back-matter, metadata) is preserved.
 */
import { ArtifactRepository } from '@/data/artifactRepository';
import type { SystemSecurityPlan } from '@/models/ssp';
import { createBlankSsp } from '@/features/ssps/blank';
import { findSspByCorrelationKey } from './bootstrapProvenance';
import type { BootstrapSspPlan } from './planBuilders';

export interface ApplyResult {
  created: number;
  updated: number;
}

export async function applyBootstrapPlans(plans: BootstrapSspPlan[]): Promise<ApplyResult> {
  const repo = ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');
  const existing = await repo.getAll();
  let created = 0;
  let updated = 0;

  for (const plan of plans) {
    const match = findSspByCorrelationKey(existing, plan.correlationKey);
    if (match) {
      await repo.update(match.uuid, {
        ...match.artifact,
        systemCharacteristics: plan.systemCharacteristics,
        controlImplementation: plan.controlImplementation,
      });
      updated++;
    } else {
      const blank = createBlankSsp();
      const artifact: SystemSecurityPlan = {
        ...blank,
        systemCharacteristics: plan.systemCharacteristics,
        controlImplementation: plan.controlImplementation,
      };
      await repo.create({ uuid: blank.uuid, type: 'systemSecurityPlan', origin: 'user', artifact });
      created++;
    }
  }
  return { created, updated };
}
