/**
 * Global default creator auto-seed (ADR-0033, ADR-0019): applying the Settings-page-configured
 * name/email/uuid to a freshly-created artifact's metadata.parties/responsibleParties.
 * Covers TEST-SETTINGS-01.
 */
import { describe, it, expect } from 'vitest';
import { applyDefaultCreator } from '@/data/defaultCreator';
import { CREATOR_ROLE_ID } from '@/models/creator';
import type { OscalArtifact } from '@/models/oscalBase';
import type { TalosSettings } from '@/data/db';

function blankArtifact(): OscalArtifact {
  return {
    uuid: 'aaaaaaaa-0000-4000-8000-000000000001',
    metadata: {
      title: '',
      version: '1.0.0',
      oscalVersion: '1.2.2',
      lastModified: '2026-07-11T00:00:00Z',
      roles: [{ id: CREATOR_ROLE_ID, title: 'Creator' }],
    },
  };
}

const baseSettings: TalosSettings = { key: 'app', language: 'en', theme: 'light' };

describe('applyDefaultCreator', () => {
  it('is a no-op when neither name nor email is configured', () => {
    const artifact = blankArtifact();
    const result = applyDefaultCreator(artifact, baseSettings);
    expect(result).toBe(artifact);
    expect(result.metadata.parties).toBeUndefined();
  });

  it('is a no-op when only a name is configured (no email)', () => {
    const artifact = blankArtifact();
    const result = applyDefaultCreator(artifact, { ...baseSettings, creatorName: 'Jane Doe' });
    expect(result.metadata.parties).toBeUndefined();
  });

  it('is a no-op when only an email is configured (no name)', () => {
    const artifact = blankArtifact();
    const result = applyDefaultCreator(artifact, { ...baseSettings, creatorEmail: 'jane@example.com' });
    expect(result.metadata.parties).toBeUndefined();
  });

  it('seeds a person party + creator responsible-party when both name and email are configured', () => {
    const artifact = blankArtifact();
    const result = applyDefaultCreator(artifact, {
      ...baseSettings,
      creatorName: 'Jane Doe',
      creatorEmail: 'jane@example.com',
    });
    expect(result.metadata.parties).toHaveLength(1);
    const party = result.metadata.parties![0]!;
    expect(party.type).toBe('person');
    expect(party.name).toBe('Jane Doe');
    expect(party.emailAddresses).toEqual(['jane@example.com']);

    const rp = result.metadata.responsibleParties?.find((r) => r.roleId === CREATOR_ROLE_ID);
    expect(rp?.partyUuids).toEqual([party.uuid]);
  });

  it('uses the configured creatorUuid instead of minting a fresh one', () => {
    const artifact = blankArtifact();
    const result = applyDefaultCreator(artifact, {
      ...baseSettings,
      creatorName: 'Jane Doe',
      creatorEmail: 'jane@example.com',
      creatorUuid: 'cccccccc-1111-4111-8111-111111111111',
    });
    expect(result.metadata.parties![0]!.uuid).toBe('cccccccc-1111-4111-8111-111111111111');
  });

  it('mints a real uuid when none is configured', () => {
    const artifact = blankArtifact();
    const result = applyDefaultCreator(artifact, {
      ...baseSettings,
      creatorName: 'Jane Doe',
      creatorEmail: 'jane@example.com',
    });
    expect(result.metadata.parties![0]!.uuid).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('never overwrites an already-assigned creator (defensive no-op)', () => {
    const artifact = blankArtifact();
    artifact.metadata.parties = [{ uuid: 'existing-party', type: 'person', name: 'Existing', emailAddresses: ['e@x.com'] }];
    artifact.metadata.responsibleParties = [{ roleId: CREATOR_ROLE_ID, partyUuids: ['existing-party'] }];
    const result = applyDefaultCreator(artifact, {
      ...baseSettings,
      creatorName: 'Jane Doe',
      creatorEmail: 'jane@example.com',
    });
    expect(result).toBe(artifact);
    expect(result.metadata.parties).toHaveLength(1);
    expect(result.metadata.parties![0]!.name).toBe('Existing');
  });

  it('trims whitespace-only name/email as unconfigured', () => {
    const artifact = blankArtifact();
    const result = applyDefaultCreator(artifact, { ...baseSettings, creatorName: '   ', creatorEmail: '  ' });
    expect(result.metadata.parties).toBeUndefined();
  });
});
