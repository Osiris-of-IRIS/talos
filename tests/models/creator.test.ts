/**
 * Mandatory creator identity (ADR-0019). Decision IDs: ADR-0001, ADR-0019.
 * Covers TEST-CREATOR-01 (feature_registry PLAT-004).
 */
import { describe, it, expect } from 'vitest';
import { validateCreator, hasValidCreator, getCreatorParties, CREATOR_ROLE_ID } from '@/models/creator';
import type { Metadata } from '@/models/oscalBase';

const base = (): Metadata => ({
  title: 'X',
  version: '1.0.0',
  oscalVersion: '1.2.2',
  lastModified: '2026-07-03T10:00:00Z',
});

const validCreatorMeta = (): Metadata => ({
  ...base(),
  roles: [{ id: CREATOR_ROLE_ID, title: 'Creator' }],
  parties: [
    { uuid: 'p1', type: 'person', name: 'Erika Mustermann', emailAddresses: ['erika@example.org'] },
  ],
  responsibleParties: [{ roleId: CREATOR_ROLE_ID, partyUuids: ['p1'] }],
});

describe('validateCreator', () => {
  it('passes when a creator party has a name and an email', () => {
    expect(validateCreator(validCreatorMeta())).toEqual([]);
    expect(hasValidCreator(validCreatorMeta())).toBe(true);
  });

  it('fails when there is no creator responsible-party', () => {
    const md = base();
    expect(validateCreator(md)).toHaveLength(1);
    expect(validateCreator(md)[0]).toMatch(/No creator/i);
    expect(hasValidCreator(md)).toBe(false);
  });

  it('fails when the creator party has no email', () => {
    const md = validCreatorMeta();
    md.parties![0]!.emailAddresses = [];
    expect(validateCreator(md).some((p) => /email/i.test(p))).toBe(true);
  });

  it('treats a whitespace-only email as missing', () => {
    const md = validCreatorMeta();
    md.parties![0]!.emailAddresses = ['   '];
    expect(validateCreator(md).some((p) => /email/i.test(p))).toBe(true);
  });

  it('fails when the creator party has no name', () => {
    const md = validCreatorMeta();
    md.parties![0]!.name = '';
    expect(validateCreator(md).some((p) => /name/i.test(p))).toBe(true);
  });

  it('fails when the creator references an undefined party', () => {
    const md = validCreatorMeta();
    md.responsibleParties = [{ roleId: CREATOR_ROLE_ID, partyUuids: ['missing'] }];
    expect(validateCreator(md).some((p) => /not defined/i.test(p))).toBe(true);
  });

  it('resolves creator parties', () => {
    expect(getCreatorParties(validCreatorMeta()).map((p) => p.name)).toEqual(['Erika Mustermann']);
    expect(getCreatorParties(base())).toEqual([]);
  });
});
