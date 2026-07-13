/**
 * An SSP's group membership, `metadata.props[name="groups"]` (T-512, ADR-0037). Covers TEST-SGRP-01.
 */
import { describe, it, expect } from 'vitest';
import { getSspGroupIds, setSspGroupIds } from '@/data/sspGroupMembership';
import type { SystemSecurityPlan } from '@/models/ssp';

function blankSsp(): SystemSecurityPlan {
  return {
    uuid: 'ssp-1',
    metadata: { title: 'Test SSP', version: '1.0.0', oscalVersion: '1.2.2' },
    importProfile: { href: '' },
    systemCharacteristics: {} as SystemSecurityPlan['systemCharacteristics'],
    systemImplementation: { users: [], components: [] },
    controlImplementation: { description: '', implementedRequirements: [] },
  };
}

describe('getSspGroupIds / setSspGroupIds', () => {
  it('returns an empty array when no groups prop is set', () => {
    expect(getSspGroupIds(blankSsp())).toEqual([]);
  });

  it('round-trips a single group', () => {
    const ssp = blankSsp();
    setSspGroupIds(ssp, ['g1']);
    expect(getSspGroupIds(ssp)).toEqual(['g1']);
  });

  it('round-trips multiple groups, comma-separated like a control tags prop', () => {
    const ssp = blankSsp();
    setSspGroupIds(ssp, ['g1', 'g2', 'g3']);
    expect(ssp.metadata.props).toEqual([{ name: 'groups', value: 'g1, g2, g3' }]);
    expect(getSspGroupIds(ssp)).toEqual(['g1', 'g2', 'g3']);
  });

  it('removes the prop entirely when set to an empty list', () => {
    const ssp = blankSsp();
    setSspGroupIds(ssp, ['g1']);
    setSspGroupIds(ssp, []);
    expect(ssp.metadata.props).toEqual([]);
    expect(getSspGroupIds(ssp)).toEqual([]);
  });

  it('preserves other props untouched', () => {
    const ssp = blankSsp();
    ssp.metadata.props = [{ name: 'other-prop', value: 'keep-me' }];
    setSspGroupIds(ssp, ['g1']);
    expect(ssp.metadata.props).toContainEqual({ name: 'other-prop', value: 'keep-me' });
    expect(ssp.metadata.props).toContainEqual({ name: 'groups', value: 'g1' });
  });
});
