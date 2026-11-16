/**
 * BSI library loader — manifest, lazy fetch, cache-by-sha, offline fallback, adopt.
 * Decision IDs: ADR-0001, ADR-0005, ADR-0007. Covers TEST-LIB-01, TEST-LIB-02, TEST-LIB-03, TEST-LIB-07.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import {
  getLibraryManifest,
  loadLibraryArtifact,
  adoptLibraryArtifact,
  type LibraryManifestEntry,
} from '@/data/libraryLoader';
import { UpstreamLoadError } from '@/data/upstreamFetch';
import { OscalVersionError } from '@/models/oscalBase';
import { logger } from '@/shared/logger';
import catalogDoc from './catalog-minimal.json';
import compDefDoc from './component-definition-minimal.json';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
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
  path: 'control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json',
  artifactType: 'catalog',
  title: 'Grundschutz++',
  category: 'Anwenderkatalog',
  sha,
  size: 0,
});

const compDefEntry = (): LibraryManifestEntry => ({
  path: 'implementation_layer/Passwortrichtlinie/Passwortrichtlinie-component_definition.json',
  artifactType: 'component-definition',
  title: 'Passwortrichtlinie',
  category: 'Komponente',
  sha: 'sha-cd',
  size: 0,
});

describe('manifest (TEST-LIB-01)', () => {
  it('bundles entries across the upstream categories, read-only (ADR-0039 layout)', () => {
    const m = getLibraryManifest();
    expect(m.license).toBe('CC-BY-SA-4.0');
    const categories = new Set(m.entries.map((e) => e.category));
    expect(categories).toEqual(new Set(['Anwenderkatalog', 'Quellkatalog', 'Profil', 'Komponente', 'Mapping']));
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

describe('root "$schema" key (TEST-LIB-01, ADR-0039)', () => {
  it('loads and adopts a library file that carries a root $schema key', async () => {
    const withSchema = { $schema: 'https://example.org/oscal_complete_schema.json', ...compDefDoc };
    const loaded = await loadLibraryArtifact(compDefEntry(), { fetch: mockFetch(withSchema), backoffMs: 0 });
    expect(loaded.type).toBe('componentDefinition');
    const newUuid = await adoptLibraryArtifact(loaded);
    expect(await ArtifactRepository.forType('componentDefinition').get(newUuid)).toBeTruthy();
  });
});

/** `doc` with its wrapper's metadata.oscal-version replaced (or removed when `version` is undefined). */
function withOscalVersion<T extends object>(doc: T, version: string | undefined): T {
  const copy = structuredClone(doc) as Record<string, { metadata: Record<string, unknown> }>;
  const wrapper = Object.keys(copy)[0]!;
  if (version === undefined) delete copy[wrapper]!.metadata['oscal-version'];
  else copy[wrapper]!.metadata['oscal-version'] = version;
  return copy as unknown as T;
}

describe('ADR-0007 version policy on library loads (TEST-LIB-07)', () => {
  it('flags a 1.1.x library file with the same structured warning as an upload', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => ({}) as never);
    const loaded = await loadLibraryArtifact(catalogEntry(), {
      fetch: mockFetch(withOscalVersion(catalogDoc, '1.1.3')),
      backoffMs: 0,
    });
    expect(loaded.versionWarnings).toHaveLength(1);
    expect(loaded.versionWarnings[0]!.code).toBe('oscal-version-other');
    expect(loaded.versionWarnings[0]!.params).toEqual({ version: '1.1.3', target: '1.2.3' });
    // the upstream (offline/cache) warning channel is untouched
    expect(loaded.warning).toBeUndefined();
    expect(loaded.problem).toBeUndefined();
  });

  it('also applies the policy on a cache hit', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => ({}) as never);
    const fetch = mockFetch(withOscalVersion(catalogDoc, '1.0.4'));
    await loadLibraryArtifact(catalogEntry(), { fetch, backoffMs: 0 });
    const second = await loadLibraryArtifact(catalogEntry(), { fetch, backoffMs: 0 });
    expect(second.fromCache).toBe(true);
    expect(second.versionWarnings.map((w) => w.code)).toEqual(['oscal-version-other']);
  });

  it('loads a 1.2.2 library file with no warning (info log only)', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => ({}) as never);
    const loaded = await loadLibraryArtifact(compDefEntry(), {
      fetch: mockFetch(withOscalVersion(compDefDoc, '1.2.2')),
      backoffMs: 0,
    });
    expect(loaded.versionWarnings).toEqual([]);
    expect(info).toHaveBeenCalledWith(
      expect.stringMatching(/1\.2\.x/),
      ['ADR-0007'],
      expect.objectContaining({ source: 'library', version: '1.2.2', path: compDefEntry().path }),
    );
  });

  it('rejects a non-1.x library file with a version error, not as an upstream outage', async () => {
    const loading = loadLibraryArtifact(catalogEntry(), {
      fetch: mockFetch(withOscalVersion(catalogDoc, '2.0.0')),
      backoffMs: 0,
    });
    await expect(loading).rejects.toBeInstanceOf(OscalVersionError);
    await expect(loading).rejects.not.toBeInstanceOf(UpstreamLoadError);
  });
});
