/**
 * Management Dashboard — Risk Coverage aggregation (ADR-0035, DASH-001). Pure, no React/Recharts
 * import. Coverage is computed independently per SSP (a threat can be fully handled by one
 * system and unaddressed by another — a global "OK anywhere" number would hide that gap); the
 * workspace-wide figure is an average across SSPs, not a raw sum or a global best-case bucket.
 */
import { indexCatalogControls, uniqueCatalogControlEntries } from '@/data/catalogResolution';
import { controlBucket } from './controlCoverage';
import { parseCommaList } from '@/data/commaList';
import type { StoredArtifact } from '@/data/db';
import type { Catalog } from '@/models/catalog';
import type { SystemSecurityPlan, SspImplementedRequirement } from '@/models/ssp';
import type { ThreatCatalogEntry } from '@/models/threatCatalog';

export const RISK_BUCKETS = ['unmapped', 'uncovered', 'partial', 'baseline', 'full'] as const;
export type RiskBucket = (typeof RISK_BUCKETS)[number];
export type RiskCounts = Record<RiskBucket, number>;

export interface SspRiskCoverage {
  uuid: string;
  title: string;
  counts: RiskCounts;
  total: number;
}

export interface RiskCoverageSummary {
  /** sum(per-SSP count) / number of SSPs, per bucket — an average risk posture per SSP, not a
   * raw sum (ADR-0035). Zero when there are no SSPs. */
  workspaceAverages: RiskCounts;
  bySsp: SspRiskCoverage[];
}

interface TaggedControl {
  id: string;
  secLevel: string | undefined;
}

function zeroCounts(): RiskCounts {
  return Object.fromEntries(RISK_BUCKETS.map((b) => [b, 0])) as RiskCounts;
}

const SEC_LEVEL_NORMAL = 'normal-SdT';

/** Reverse index: threat id -> every workspace-catalog control tagged with it (deduped by
 * control-id across catalogs; a control's own catalog is irrelevant once indexed). */
function buildThreatToControlsIndex(catalogs: StoredArtifact<Catalog>[]): Map<string, TaggedControl[]> {
  const controlsById = new Map<string, TaggedControl & { threatIds: string[] }>();
  for (const record of catalogs) {
    const entries = uniqueCatalogControlEntries(indexCatalogControls(record.artifact));
    for (const [, control] of entries) {
      if (controlsById.has(control.id)) continue; // already recorded from another catalog
      const secLevel = control.props?.find((p) => p.name === 'sec_level')?.value;
      const threatsValue = control.props?.find((p) => p.name === 'threats')?.value;
      const threatIds = threatsValue ? parseCommaList(threatsValue) : [];
      controlsById.set(control.id, { id: control.id, secLevel, threatIds });
    }
  }

  const index = new Map<string, TaggedControl[]>();
  for (const control of controlsById.values()) {
    for (const threatId of control.threatIds) {
      const list = index.get(threatId) ?? [];
      list.push({ id: control.id, secLevel: control.secLevel });
      index.set(threatId, list);
    }
  }
  return index;
}

/** True if this control-id's implemented-requirement in one SSP reduces (ADR-0034's
 * controlBucket) to "implemented" or "alternative" — the OSCAL statuses that mean a real,
 * concrete mitigation is in place, not just planned or partially done. */
function isOkInSsp(controlId: string, requirementsByControlId: Map<string, SspImplementedRequirement>): boolean {
  const requirement = requirementsByControlId.get(controlId);
  if (!requirement) return false;
  const bucket = controlBucket(requirement);
  return bucket === 'implemented' || bucket === 'alternative';
}

/** One threat's bucket within one SSP (ADR-0035's fixed priority order). */
function threatBucketForSsp(tagged: TaggedControl[], requirementsByControlId: Map<string, SspImplementedRequirement>): RiskBucket {
  if (tagged.length === 0) return 'unmapped';

  const okControls = tagged.filter((c) => isOkInSsp(c.id, requirementsByControlId));
  if (okControls.length === tagged.length) return 'full';

  const normalLevelControls = tagged.filter((c) => c.secLevel === SEC_LEVEL_NORMAL);
  if (normalLevelControls.length > 0 && normalLevelControls.every((c) => isOkInSsp(c.id, requirementsByControlId))) {
    return 'baseline';
  }

  return okControls.length > 0 ? 'partial' : 'uncovered';
}

/** Workspace-wide risk coverage: one bucket per threat per SSP, plus the cross-SSP average
 * (ADR-0035 — never a raw sum, never a global "covered anywhere" number). */
export function computeRiskCoverage(
  threats: ThreatCatalogEntry[],
  catalogs: StoredArtifact<Catalog>[],
  ssps: StoredArtifact<SystemSecurityPlan>[],
): RiskCoverageSummary {
  const threatToControls = buildThreatToControlsIndex(catalogs);

  const bySsp: SspRiskCoverage[] = ssps.map((record) => {
    const requirementsByControlId = new Map<string, SspImplementedRequirement>();
    for (const requirement of record.artifact.controlImplementation?.implementedRequirements ?? []) {
      requirementsByControlId.set(requirement.controlId, requirement);
    }
    const counts = zeroCounts();
    for (const threat of threats) {
      const tagged = threatToControls.get(threat.id) ?? [];
      counts[threatBucketForSsp(tagged, requirementsByControlId)] += 1;
    }
    return { uuid: record.uuid, title: record.artifact.metadata.title, counts, total: threats.length };
  });

  const workspaceAverages = zeroCounts();
  if (bySsp.length > 0) {
    for (const row of bySsp) {
      for (const bucket of RISK_BUCKETS) workspaceAverages[bucket] += row.counts[bucket];
    }
    for (const bucket of RISK_BUCKETS) workspaceAverages[bucket] /= bySsp.length;
  }

  return { workspaceAverages, bySsp };
}
