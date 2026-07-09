/**
 * Unresolved cross-artifact reference persistence (ADR-0014, ADR-0004): never silently dropped;
 * re-syncing replaces a source's prior entries for that refKind.
 * Covers TEST-CDEF-IMP-03.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { syncUnresolvedReferences, getUnresolvedReferencesFor } from '@/data/unresolvedReferences';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('syncUnresolvedReferences / getUnresolvedReferencesFor', () => {
  it('records every unresolved href for a source', async () => {
    await syncUnresolvedReferences('cd-1', 'componentDefinitions', 'import-component-definition', [
      '#missing-1',
      'https://example.org/external.json',
    ]);
    const refs = await getUnresolvedReferencesFor('cd-1');
    expect(refs.map((r) => r.href).sort()).toEqual(['#missing-1', 'https://example.org/external.json'].sort());
    expect(refs.every((r) => r.sourceUuid === 'cd-1' && r.refKind === 'import-component-definition')).toBe(true);
  });

  it('re-syncing replaces the prior set for that refKind (not an accumulating log)', async () => {
    await syncUnresolvedReferences('cd-1', 'componentDefinitions', 'import-component-definition', ['#missing-1']);
    await syncUnresolvedReferences('cd-1', 'componentDefinitions', 'import-component-definition', ['#missing-2']);

    const refs = await getUnresolvedReferencesFor('cd-1');
    expect(refs.map((r) => r.href)).toEqual(['#missing-2']);
  });

  it('syncing an empty list clears all previously recorded refs for that source', async () => {
    await syncUnresolvedReferences('cd-1', 'componentDefinitions', 'import-component-definition', ['#missing-1']);
    await syncUnresolvedReferences('cd-1', 'componentDefinitions', 'import-component-definition', []);
    expect(await getUnresolvedReferencesFor('cd-1')).toEqual([]);
  });

  it('keeps different sources independent', async () => {
    await syncUnresolvedReferences('cd-1', 'componentDefinitions', 'import-component-definition', ['#a']);
    await syncUnresolvedReferences('cd-2', 'componentDefinitions', 'import-component-definition', ['#b']);
    expect((await getUnresolvedReferencesFor('cd-1')).map((r) => r.href)).toEqual(['#a']);
    expect((await getUnresolvedReferencesFor('cd-2')).map((r) => r.href)).toEqual(['#b']);
  });
});
