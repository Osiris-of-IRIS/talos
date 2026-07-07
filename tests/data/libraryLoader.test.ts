/**
 * BSI library loader — manifest, lazy fetch, cache-by-sha, offline fallback, adopt.
 * Decision IDs: ADR-0001, ADR-0005. Covers TEST-LIB-01, TEST-LIB-02, TEST-LIB-03.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import {
  getLibraryManifest,
  loadLibraryArtifact,
  adoptLibraryArtifact,
  type LibraryManifestEntry,
} from '@/data/libraryLoader';
import catalogDoc from './catalog-minimal.json';
import compDefDoc from './component-definition-minimal.json';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

/** A mock fetch returning `doc` as JSON; optionally fails the first `failFirst` calls. */
function mockFetch(doc: unknown, opts: { failFirst?: number; alwaysFail?: boolean } = {}) {
  let calls = 0;
  return vi.fn(async () => {
    calls++;
    if (opts.alwaysFail || (opts.failFirst && calls <= opts.failFirst)) {
      throw new Error('network down');
    }
    return { ok: true, status: 200, json: async () => doc } as Response;
  });
}

const catalogEntry = (sha = 'sha-a'): LibraryManifestEntry => ({
  path: 'Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json',
  artifactType: 'catalog',
  title: 'Grundschutz++',
  category: 'Anwenderkatalog',
  sha,
  size: 0,
});

const compDefEntry = (): LibraryManifestEntry => ({
  path: 'Implementierungsbeschreibungen/Komponenten/Passwortrichtlinie/Passwortrichtlinie-component_definition.json',
  artifactType: 'component-definition',
  title: 'Passwortrichtlinie',
  category: 'Komponente',
  sha: 'sha-cd',
  size: 0,
});

describe('manifest (TEST-LIB-01)', () => {
  it('bundles entries across the three categories, read-only', () => {
    const m = getLibraryManifest();
    expect(m.license).toBe('CC-BY-SA-4.0');
    const categories = new Set(m.entries.map((e) => e.category));
    expect(categories).toEqual(new Set(['Anwenderkatalog', 'Quellkatalog', 'Komponente']));
    expect(m.entries.some((e) => e.artifactType === 'catalog')).toBe(true);
    expect(m.entries.some((e) => e.artifactType === 'component-definition')).toBe(true);
  });
});

describe('lazy fetch + cache by path+sha (TEST-LIB-01)', () => {
  it('fetches, validates, caches, then serves the cache without refetching', async () => {
    const fetch = mockFetch(catalogDoc);
    const first = await loadLibraryArtifact(catalogEntry(), { fetch, backoffMs: 0 });
    expect(first.fromCache).toBe(false);
    expect(first.type).toBe('catalog');
    expect(fetch.mock.calls.length).toBe(1);

    const second = await loadLibraryArtifact(catalogEntry(), { fetch, backoffMs: 0 });
    expect(second.fromCache).toBe(true);
    expect(fetch.mock.calls.length).toBe(1); // sha matched → no refetch
  });

  it('refetches when the manifest sha changes', async () => {
    const fetch = mockFetch(catalogDoc);
    await loadLibraryArtifact(catalogEntry('sha-a'), { fetch, backoffMs: 0 });
    await loadLibraryArtifact(catalogEntry('sha-b'), { fetch, backoffMs: 0 });
    expect(fetch.mock.calls.length).toBe(2);
  });

  it('rejects a file whose type does not match the manifest', async () => {
    const fetch = mockFetch(compDefDoc); // a component-definition served for a "catalog" entry
    await expect(loadLibraryArtifact(catalogEntry(), { fetch, backoffMs: 0 })).rejects.toThrow(
      /expected catalog/i,
    );
  });

  it('retries a transient failure before succeeding', async () => {
    const fetch = mockFetch(catalogDoc, { failFirst: 1 });
    const loaded = await loadLibraryArtifact(catalogEntry(), { fetch, backoffMs: 0, retries: 2 });
    expect(loaded.fromCache).toBe(false);
    expect(fetch.mock.calls.length).toBe(2);
  });
});

describe('offline fallback (TEST-LIB-03)', () => {
  it('serves a stale cached copy with a warning when the network is down', async () => {
    // Prime the cache at sha-a.
    await loadLibraryArtifact(catalogEntry('sha-a'), { fetch: mockFetch(catalogDoc), backoffMs: 0 });
    // Upstream moved to sha-b but the network is down → fall back to the cached sha-a copy.
    const offline = await loadLibraryArtifact(catalogEntry('sha-b'), {
      fetch: mockFetch(catalogDoc, { alwaysFail: true }),
      backoffMs: 0,
      retries: 1,
    });
    expect(offline.fromCache).toBe(true);
    expect(offline.warning).toMatch(/offline/i);
  });

  it('throws when the fetch fails and nothing is cached', async () => {
    await expect(
      loadLibraryArtifact(catalogEntry(), {
        fetch: mockFetch(catalogDoc, { alwaysFail: true }),
        backoffMs: 0,
        retries: 1,
      }),
    ).rejects.toThrow(/no cached copy/i);
  });
});

describe('adopt (TEST-LIB-02)', () => {
  it('copies a library artifact into the workspace with a new uuid and origin user', async () => {
    const loaded = await loadLibraryArtifact(compDefEntry(), { fetch: mockFetch(compDefDoc), backoffMs: 0 });
    const newUuid = await adoptLibraryArtifact(loaded);

    const originalUuid = (compDefDoc as { 'component-definition': { uuid: string } })['component-definition'].uuid;
    expect(newUuid).not.toBe(originalUuid);

    const rec = await ArtifactRepository.forType('componentDefinition').get(newUuid);
    expect(rec?.origin).toBe('user');
    expect((rec?.artifact as { uuid: string }).uuid).toBe(newUuid);
  });
});
