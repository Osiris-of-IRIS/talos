/**
 * Management Dashboard — Control Coverage aggregation (ADR-0034, DASH-002). Pure, no React/
 * Recharts import — a control's `implementation-status` lives per by-component (ADR-0023,
 * T-113), so a single implemented-requirement is reduced to one bucket via a fixed,
 * least-complete-wins order; see ADR-0034 for the full rationale.
 */
import { getImplementationStatus } from '@/features/ssps/componentImport';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan, SspImplementedRequirement, ByComponent } from '@/models/ssp';

export const COVERAGE_BUCKETS = [
  'unspecified',
  'planned',
  'alternative',
  'partial',
  'implemented',
  'not-applicable',
] as const;
export type CoverageBucket = (typeof COVERAGE_BUCKETS)[number];

export type CoverageCounts = Record<CoverageBucket, number>;

export interface SspControlCoverage {
  uuid: string;
  title: string;
  counts: CoverageCounts;
  total: number;
}

export interface ControlCoverageSummary {
  workspaceTotals: CoverageCounts;
  bySsp: SspControlCoverage[];
}

/** Worst-wins order for statuses that carry real completeness information (ADR-0034). */
const COMPLETENESS_ORDER: Partial<Record<string, number>> = {
  planned: 0,
  alternative: 1,
  partial: 2,
  implemented: 3,
};

function zeroCounts(): CoverageCounts {
  return Object.fromEntries(COVERAGE_BUCKETS.map((b) => [b, 0])) as CoverageCounts;
}

/** Reduces one implemented-requirement's by-components to a single coverage bucket (ADR-0034). */
export function controlBucket(requirement: SspImplementedRequirement): CoverageBucket {
  const byComponents: ByComponent[] = requirement.byComponents ?? [];
  const statuses = byComponents.map((bc) => getImplementationStatus(bc)).filter((s): s is string => s !== undefined);

  if (statuses.length === 0) return 'unspecified';
  if (statuses.every((s) => s === 'not-applicable')) return 'not-applicable';

  const informative = statuses.filter((s) => s !== 'not-applicable' && s in COMPLETENESS_ORDER);
  if (informative.length === 0) return 'unspecified';

  const worst = informative.reduce((worstSoFar, s) =>
    COMPLETENESS_ORDER[s]! < COMPLETENESS_ORDER[worstSoFar]! ? s : worstSoFar,
  );
  return worst as CoverageBucket;
}

/** Workspace-wide totals + one row per SSP (ADR-0034 — a totals-only view isn't enough for a
 * manager comparing systems). O(SSPs × requirements × by-components), a single linear pass. */
export function computeControlCoverage(ssps: StoredArtifact<SystemSecurityPlan>[]): ControlCoverageSummary {
  const workspaceTotals = zeroCounts();
  const bySsp: SspControlCoverage[] = ssps.map((record) => {
    const counts = zeroCounts();
    const requirements = record.artifact.controlImplementation?.implementedRequirements ?? [];
    for (const requirement of requirements) {
      const bucket = controlBucket(requirement);
      counts[bucket] += 1;
      workspaceTotals[bucket] += 1;
    }
    const total = requirements.length;
    return { uuid: record.uuid, title: record.artifact.metadata.title, counts, total };
  });

  return { workspaceTotals, bySsp };
}
