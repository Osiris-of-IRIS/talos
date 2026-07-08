/**
 * Applying bootstrap plans to the workspace `ssps` store: create-then-update idempotency
 * (ADR-0026), preserving hand-authored fields outside system-characteristics/control-implementation.
 * Covers TEST-BOOTSTRAP-02.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import type { SystemSecurityPlan } from '@/models/ssp';
import { applyBootstrapPlans } from '@/features/bootstrap/applyPlans';
import { buildAssetSystemCharacteristics, buildControlImplementation } from '@/features/bootstrap/planBuilders';
import { assetCorrelationKey } from '@/features/bootstrap/bootstrapProvenance';
import type { Asset } from '@/models/asset';
import type { Control } from '@/models/control';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

const ASSET: Asset = {
  uuid: 'C001',
  name: 'Clients der Finanzbuchhaltung',
  assetType: 'client-pc',
  description: 'Desktop-PCs',
  securitySensitivityLevel: 'erhöht',
  informationTypes: 'Finanzdaten',
};

function control(id: string): Control {
  return { id, title: id };
}

describe('applyBootstrapPlans', () => {
  it('creates a new SSP for a plan with no prior correlation match', async () => {
    const key = assetCorrelationKey(ASSET.uuid);
    const plan = {
      correlationKey: key,
      systemCharacteristics: buildAssetSystemCharacteristics(ASSET, key),
      controlImplementation: buildControlImplementation('note', [control('A.1')]),
    };
    const result = await applyBootstrapPlans([plan]);
    expect(result).toEqual({ created: 1, updated: 0 });

    const all = await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.artifact.systemCharacteristics.systemName).toBe(ASSET.name);
    expect(all[0]!.artifact.controlImplementation.implementedRequirements[0]!.controlId).toBe('A.1');
  });

  it('updates the same SSP in place on re-run (no duplicate), preserving hand-edited fields', async () => {
    const key = assetCorrelationKey(ASSET.uuid);
    const planV1 = {
      correlationKey: key,
      systemCharacteristics: buildAssetSystemCharacteristics(ASSET, key),
      controlImplementation: buildControlImplementation('note v1', [control('A.1')]),
    };
    await applyBootstrapPlans([planV1]);

    const repo = ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');
    const [created] = await repo.getAll();
    // Simulate a hand-edit: an analyst added a system-implementation component in the SSP editor.
    await repo.update(created!.uuid, {
      ...created!.artifact,
      systemImplementation: {
        ...created!.artifact.systemImplementation,
        users: [],
        components: [
          {
            uuid: 'sc-1',
            type: 'software',
            title: 'Hand-added component',
            description: '',
            status: { state: 'operational' },
          },
        ],
      },
    });

    const planV2 = {
      correlationKey: key,
      systemCharacteristics: buildAssetSystemCharacteristics(ASSET, key),
      controlImplementation: buildControlImplementation('note v2', [control('A.1'), control('A.2')]),
    };
    const result = await applyBootstrapPlans([planV2]);
    expect(result).toEqual({ created: 0, updated: 1 });

    const all = await repo.getAll();
    expect(all).toHaveLength(1); // no duplicate
    expect(all[0]!.uuid).toBe(created!.uuid);
    expect(all[0]!.artifact.controlImplementation.implementedRequirements.map((r) => r.controlId)).toEqual([
      'A.1',
      'A.2',
    ]);
    expect(all[0]!.artifact.systemImplementation.components).toHaveLength(1); // preserved
  });
});
