/**
 * Persistence-layer tests (fake-indexeddb). Decision IDs: ADR-0001, ADR-0004.
 * Covers TEST-PERS-01, TEST-PERS-02 (feature_registry PLAT-003).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ArtifactRepository, TYPE_TO_STORE } from '@/data/artifactRepository';
import { _resetDbForTests } from '@/data/db';
import type { ComponentDefinition } from '@/models/componentDefinition';

function makeCompDef(uuid: string, title = 'Test'): ComponentDefinition {
  return {
    uuid,
    metadata: { title, version: '1.0.0', oscalVersion: '1.2.2' },
  };
}

beforeEach(() => {
  // Fresh in-memory IndexedDB per test.
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('TYPE_TO_STORE', () => {
  it('maps every artifact type to a store', () => {
    expect(TYPE_TO_STORE.componentDefinition).toBe('componentDefinitions');
    expect(TYPE_TO_STORE.systemSecurityPlan).toBe('ssps');
    expect(TYPE_TO_STORE.planOfActionAndMilestones).toBe('poams');
    expect(TYPE_TO_STORE.profile).toBe('profiles');
  });
});

describe('ArtifactRepository CRUD', () => {
  it('creates, reads, and counts', async () => {
    const repo = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
    expect(await repo.count()).toBe(0);

    const created = await repo.create({
      uuid: 'a',
      type: 'componentDefinition',
      origin: 'user',
      artifact: makeCompDef('a'),
    });
    expect(created.createdAt).toBe(created.updatedAt);
    expect(created.origin).toBe('user');

    const got = await repo.get('a');
    expect(got?.artifact.metadata.title).toBe('Test');
    expect(await repo.count()).toBe(1);
  });

  it('rejects duplicate create', async () => {
    const repo = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
    await repo.create({ uuid: 'a', type: 'componentDefinition', origin: 'user', artifact: makeCompDef('a') });
    await expect(
      repo.create({ uuid: 'a', type: 'componentDefinition', origin: 'user', artifact: makeCompDef('a') }),
    ).rejects.toThrow(/already exists/);
  });

  it('update refreshes updatedAt and keeps createdAt', async () => {
    const repo = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
    const created = await repo.create({
      uuid: 'a',
      type: 'componentDefinition',
      origin: 'user',
      artifact: makeCompDef('a', 'Old'),
    });
    await new Promise((r) => setTimeout(r, 2));
    const updated = await repo.update('a', makeCompDef('a', 'New'));
    expect(updated.artifact.metadata.title).toBe('New');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('update throws when missing', async () => {
    const repo = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
    await expect(repo.update('missing', makeCompDef('missing'))).rejects.toThrow(/not found/);
  });

  it('put preserves createdAt on replace (import-as-overwrite)', async () => {
    const repo = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
    const created = await repo.create({
      uuid: 'a',
      type: 'componentDefinition',
      origin: 'user',
      artifact: makeCompDef('a'),
    });
    await repo.put({
      uuid: 'a',
      type: 'componentDefinition',
      origin: 'imported',
      createdAt: 'ignored',
      updatedAt: 'ignored',
      artifact: makeCompDef('a', 'Replaced'),
    });
    const got = await repo.get('a');
    expect(got?.createdAt).toBe(created.createdAt);
    expect(got?.origin).toBe('imported');
    expect(got?.artifact.metadata.title).toBe('Replaced');
  });

  it('deletes', async () => {
    const repo = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
    await repo.create({ uuid: 'a', type: 'componentDefinition', origin: 'user', artifact: makeCompDef('a') });
    await repo.delete('a');
    expect(await repo.get('a')).toBeUndefined();
    expect(await repo.count()).toBe(0);
  });

  it('isolates stores by type', async () => {
    const cd = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
    const ssp = ArtifactRepository.forType('systemSecurityPlan');
    await cd.create({ uuid: 'a', type: 'componentDefinition', origin: 'user', artifact: makeCompDef('a') });
    expect(await cd.count()).toBe(1);
    expect(await ssp.count()).toBe(0);
  });
});
