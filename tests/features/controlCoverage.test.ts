/**
 * Management Dashboard — Control Coverage aggregation (ADR-0034, DASH-002): per-control
 * worst-status-wins reduction over by-component `implementation-status` (ADR-0023), the
 * `not-applicable` special-casing, the `unspecified` bucket, and workspace + per-SSP totals.
 * Covers TEST-DASH-02.
 */
import { describe, it, expect } from 'vitest';
import { controlBucket, computeControlCoverage, COVERAGE_BUCKETS } from '@/features/dashboard/controlCoverage';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan, SspImplementedRequirement, ByComponent } from '@/models/ssp';

function bc(status?: string): ByComponent {
  return {
    componentUuid: 'comp-1',
    uuid: `bc-${Math.random()}`,
    description: '',
    ...(status !== undefined ? { props: [{ name: 'implementation-status', value: status }] } : {}),
  };
}

function requirement(controlId: string, byComponents: ByComponent[]): SspImplementedRequirement {
  return { uuid: `req-${controlId}`, controlId, byComponents };
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

describe('controlBucket', () => {
  it('buckets a control with no by-components as unspecified', () => {
    expect(controlBucket(requirement('C-1', []))).toBe('unspecified');
  });

  it('buckets a control whose by-components have no implementation-status prop as unspecified', () => {
    expect(controlBucket(requirement('C-1', [bc(undefined), bc(undefined)]))).toBe('unspecified');
  });

  it('buckets a control where every by-component is not-applicable as not-applicable', () => {
    expect(controlBucket(requirement('C-1', [bc('not-applicable'), bc('not-applicable')]))).toBe('not-applicable');
  });

  it('drops not-applicable entries when another real status is present', () => {
    expect(controlBucket(requirement('C-1', [bc('not-applicable'), bc('planned')]))).toBe('planned');
  });

  it('picks the least-complete status when statuses are mixed (implemented + partial -> partial)', () => {
    expect(controlBucket(requirement('C-1', [bc('implemented'), bc('partial')]))).toBe('partial');
  });

  it('ranks planned as worse than alternative', () => {
    expect(controlBucket(requirement('C-1', [bc('alternative'), bc('planned')]))).toBe('planned');
  });

  it('ranks alternative as worse than partial', () => {
    expect(controlBucket(requirement('C-1', [bc('alternative'), bc('partial')]))).toBe('alternative');
  });

  it('buckets a fully-implemented control as implemented', () => {
    expect(controlBucket(requirement('C-1', [bc('implemented'), bc('implemented')]))).toBe('implemented');
  });

  it('treats an unrecognized status value as if it were absent', () => {
    expect(controlBucket(requirement('C-1', [bc('bogus-status')]))).toBe('unspecified');
  });
});

describe('computeControlCoverage', () => {
  it('returns a zeroed summary for an empty workspace', () => {
    const summary = computeControlCoverage([]);
    expect(summary.bySsp).toEqual([]);
    for (const bucket of COVERAGE_BUCKETS) {
      expect(summary.workspaceTotals[bucket]).toBe(0);
    }
  });

  it('aggregates one row per SSP with its own counts and total', () => {
    const sspA = ssp('ssp-a', 'SSP A', [
      requirement('C-1', [bc('implemented')]),
      requirement('C-2', [bc('planned')]),
    ]);
    const sspB = ssp('ssp-b', 'SSP B', [requirement('C-3', [])]);

    const summary = computeControlCoverage([sspA, sspB]);
    expect(summary.bySsp).toHaveLength(2);

    const rowA = summary.bySsp.find((r) => r.uuid === 'ssp-a');
    expect(rowA?.title).toBe('SSP A');
    expect(rowA?.counts.implemented).toBe(1);
    expect(rowA?.counts.planned).toBe(1);
    expect(rowA?.total).toBe(2);

    const rowB = summary.bySsp.find((r) => r.uuid === 'ssp-b');
    expect(rowB?.counts.unspecified).toBe(1);
    expect(rowB?.total).toBe(1);
  });

  it('sums workspace totals across every SSP', () => {
    const sspA = ssp('ssp-a', 'SSP A', [requirement('C-1', [bc('implemented')])]);
    const sspB = ssp('ssp-b', 'SSP B', [requirement('C-2', [bc('implemented')]), requirement('C-3', [bc('planned')])]);

    const summary = computeControlCoverage([sspA, sspB]);
    expect(summary.workspaceTotals.implemented).toBe(2);
    expect(summary.workspaceTotals.planned).toBe(1);
    expect(Object.values(summary.workspaceTotals).reduce((a, b) => a + b, 0)).toBe(3);
  });
});
