/**
 * Management Dashboard — Risk Coverage aggregation (ADR-0035, DASH-001): threat->control
 * reverse index across workspace catalogs, per-SSP (not global) bucket reduction
 * (unmapped/uncovered/partial/baseline/full), and workspace averages (sum-across-SSPs /
 * SSP-count).
 * Covers TEST-DASH-01.
 */
import { describe, it, expect } from 'vitest';
import { computeRiskCoverage, RISK_BUCKETS } from '@/features/dashboard/riskCoverage';
import type { StoredArtifact } from '@/data/db';
import type { Catalog } from '@/models/catalog';
import type { Control } from '@/models/control';
import type { SystemSecurityPlan, SspImplementedRequirement, ByComponent } from '@/models/ssp';
import type { ThreatCatalogEntry } from '@/models/threatCatalog';

function control(id: string, secLevel: string | undefined, threats: string | undefined): Control {
  const props = [];
  if (secLevel !== undefined) props.push({ name: 'sec_level', value: secLevel });
  if (threats !== undefined) props.push({ name: 'threats', value: threats });
  return { id, title: id, props };
}

function catalog(uuid: string, controls: Control[]): StoredArtifact<Catalog> {
  return {
    uuid,
    type: 'catalog',
    origin: 'user',
    createdAt: '',
    updatedAt: '',
    artifact: { uuid, metadata: { title: 'Catalog', version: '1.0.0', oscalVersion: '1.2.2' }, controls } as Catalog,
  };
}

function bc(status: string): ByComponent {
  return { componentUuid: 'c1', uuid: `bc-${Math.random()}`, description: '', props: [{ name: 'implementation-status', value: status }] };
}

function requirement(controlId: string, status: string): SspImplementedRequirement {
  return { uuid: `req-${controlId}`, controlId, byComponents: [bc(status)] };
}

function ssp(uuid: string, title: string, requirements: SspImplementedRequirement[]): StoredArtifact<SystemSecurityPlan> {
  return {
    uuid,
    type: 'systemSecurityPlan',
    origin: 'user',
    createdAt: '',
    updatedAt: '',
    artifact: {
      uuid,
      metadata: { title, version: '1.0.0', oscalVersion: '1.2.2' },
      controlImplementation: { description: '', implementedRequirements: requirements },
    } as SystemSecurityPlan,
  };
}

function threat(id: string): ThreatCatalogEntry {
  return { id, title: id, definition: '', uuid: id };
}

describe('computeRiskCoverage — per-SSP bucketing', () => {
  const catalogs = [
    catalog('cat-1', [
      control('C1', 'normal-SdT', 'T1, T2'),
      control('C2', 'erhöht', 'T1'),
      control('C3', 'normal-SdT', 'T3'),
      control('C4', 'normal-SdT', undefined), // untagged control, irrelevant to any threat
    ]),
  ];
  const threats = [threat('T1'), threat('T2'), threat('T3'), threat('T4')]; // T4 tagged by nobody

  it('buckets the SAME threat differently per SSP — proves this is not a global "OK anywhere" check', () => {
    const sspA = ssp('ssp-a', 'SSP A', [requirement('C1', 'implemented'), requirement('C2', 'planned')]);
    const sspB = ssp('ssp-b', 'SSP B', [
      requirement('C1', 'planned'),
      requirement('C2', 'implemented'),
      requirement('C3', 'implemented'),
    ]);

    const summary = computeRiskCoverage(threats, catalogs, [sspA, sspB]);
    const rowA = summary.bySsp.find((r) => r.uuid === 'ssp-a')!;
    const rowB = summary.bySsp.find((r) => r.uuid === 'ssp-b')!;

    // T1: SSP A has C1(normal) ok, C2(erhöht) not ok -> all-normal-ok -> baseline.
    //     SSP B has C1(normal) not ok, C2(erhöht) ok -> some ok, not baseline -> partial.
    expect(rowA.counts.baseline).toBe(1);
    expect(rowB.counts.partial).toBe(1);

    // T2: SSP A has C1 ok, only tagged control -> full. SSP B has C1 not ok -> uncovered.
    expect(rowA.counts.full).toBe(1); // T2
    expect(rowB.counts.uncovered).toBe(1); // T2
  });

  it('gives each SSP the exact expected bucket distribution', () => {
    const sspA = ssp('ssp-a', 'SSP A', [requirement('C1', 'implemented'), requirement('C2', 'planned')]);
    const sspB = ssp('ssp-b', 'SSP B', [
      requirement('C1', 'planned'),
      requirement('C2', 'implemented'),
      requirement('C3', 'implemented'),
    ]);

    const summary = computeRiskCoverage(threats, catalogs, [sspA, sspB]);
    const rowA = summary.bySsp.find((r) => r.uuid === 'ssp-a')!;
    const rowB = summary.bySsp.find((r) => r.uuid === 'ssp-b')!;

    // SSP A: T1=baseline, T2=full, T3=uncovered (no requirement for C3), T4=unmapped.
    expect(rowA.counts).toEqual({ unmapped: 1, uncovered: 1, partial: 0, baseline: 1, full: 1 });
    expect(rowA.total).toBe(4);

    // SSP B: T1=partial, T2=uncovered, T3=full, T4=unmapped.
    expect(rowB.counts).toEqual({ unmapped: 1, uncovered: 1, partial: 1, baseline: 0, full: 1 });
    expect(rowB.total).toBe(4);
  });

  it('averages workspace totals as sum-across-SSPs / SSP-count, not a raw sum', () => {
    const sspA = ssp('ssp-a', 'SSP A', [requirement('C1', 'implemented'), requirement('C2', 'planned')]);
    const sspB = ssp('ssp-b', 'SSP B', [
      requirement('C1', 'planned'),
      requirement('C2', 'implemented'),
      requirement('C3', 'implemented'),
    ]);

    const summary = computeRiskCoverage(threats, catalogs, [sspA, sspB]);
    // unmapped identical in both SSPs (1 each) -> average unchanged at 1.
    expect(summary.workspaceAverages.unmapped).toBe(1);
    // baseline: 1 (A) + 0 (B) = 1 / 2 SSPs = 0.5.
    expect(summary.workspaceAverages.baseline).toBe(0.5);
    // partial: 0 (A) + 1 (B) = 1 / 2 = 0.5.
    expect(summary.workspaceAverages.partial).toBe(0.5);
    // full: 1 (A) + 1 (B) = 2 / 2 = 1.
    expect(summary.workspaceAverages.full).toBe(1);
    // uncovered: 1 (A) + 1 (B) = 2 / 2 = 1.
    expect(summary.workspaceAverages.uncovered).toBe(1);
  });

  it('does not divide by zero when there are no SSPs — all averages are zero', () => {
    const summary = computeRiskCoverage(threats, catalogs, []);
    expect(summary.bySsp).toEqual([]);
    for (const bucket of RISK_BUCKETS) {
      expect(summary.workspaceAverages[bucket]).toBe(0);
    }
  });
});

describe('computeRiskCoverage — baseline requires at least one normal-SdT tagged control', () => {
  it('does not vacuously grant baseline to a threat with only erhöht-level tagged controls', () => {
    const catalogs = [catalog('cat-1', [control('C1', 'erhöht', 'T1')])];
    const threats = [threat('T1')];

    const notOk = computeRiskCoverage(threats, catalogs, [ssp('ssp-a', 'A', [requirement('C1', 'planned')])]);
    // No normal-SdT tagged controls at all -> baseline unreachable; zero ok controls -> uncovered.
    expect(notOk.bySsp[0]!.counts.baseline).toBe(0);
    expect(notOk.bySsp[0]!.counts.uncovered).toBe(1);

    const ok = computeRiskCoverage(threats, catalogs, [ssp('ssp-a', 'A', [requirement('C1', 'implemented')])]);
    // 100% of tagged controls ok -> full (not baseline, since "full" is checked first).
    expect(ok.bySsp[0]!.counts.full).toBe(1);
    expect(ok.bySsp[0]!.counts.baseline).toBe(0);
  });
});
