/**
 * Resilience against BSI upstream moves (ADR-0039): one shared fetch-with-retry for the library
 * and both namespace CSVs; a 404 is reported immediately (not retried) as a structured
 * `UpstreamLoadError`; every failure is logged with decision_ids and counted; a stale-cache
 * fallback says *why* it is stale (moved upstream vs. offline).
 * Decision IDs: ADR-0001, ADR-0005, ADR-0039.
 * Covers TEST-LIB-05.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import {
  fetchUpstream,
  UpstreamFetchError,
  UpstreamLoadError,
  getUpstreamStats,
  _resetUpstreamStatsForTests,
} from '@/data/upstreamFetch';
import { loadLibraryArtifact, type LibraryManifestEntry } from '@/data/libraryLoader';
import { loadThreatCatalog } from '@/data/threatCatalogLoader';
import { loadTargetObjectCategories } from '@/data/targetObjectCategoryLoader';
import { TARGET_OBJECT_CATEGORIES_URL, THREATS_CATALOG_URL } from '@/config';
import { logger } from '@/shared/logger';
import catalogDoc from './catalog-minimal.json';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  _resetUpstreamStatsForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

function status(code: number, body = '') {
  return vi.fn(async () => ({ ok: code >= 200 && code < 300, status: code, text: async () => body, json: async () => JSON.parse(body) }) as Response);
}

const entry: LibraryManifestEntry = {
  path: 'control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json',
  artifactType: 'catalog',
  title: 'Grundschutz++',
  category: 'Anwenderkatalog',
  sha: 'a'.repeat(40),
  size: 1,
};

describe('fetchUpstream (TEST-LIB-05)', () => {
  it('does not retry an HTTP 404 — a moved file will not come back on retry', async () => {
    const f = status(404);
    const err = await fetchUpstream('https://x/a.csv', 'text', { fetch: f, retries: 3, backoffMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamFetchError);
    expect(err.status).toBe(404);
    expect(err.url).toBe('https://x/a.csv');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx and network errors', async () => {
    const f = status(503);
    await expect(fetchUpstream('https://x/a.csv', 'text', { fetch: f, retries: 2, backoffMs: 0 })).rejects.toThrow(
      /HTTP 503/,
    );
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('returns text or parsed JSON on success', async () => {
    await expect(fetchUpstream('u', 'text', { fetch: status(200, 'a,b') })).resolves.toBe('a,b');
    await expect(fetchUpstream('u', 'json', { fetch: status(200, '{"k":1}') })).resolves.toEqual({ k: 1 });
  });
});

describe('loaders surface structured, logged errors (TEST-LIB-05)', () => {
  it('library: 404 with no cache throws UpstreamLoadError (resource, title, url, status) and logs an error with ADR-0039', async () => {
    const errSpy = vi.spyOn(logger, 'error');
    const err = await loadLibraryArtifact(entry, { fetch: status(404), backoffMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamLoadError);
    expect(err.message).toMatch(/no cached copy/i);
    expect(err.problem).toMatchObject({ resource: 'library-artifact', title: 'Grundschutz++', status: 404 });
    expect(err.problem.url).toContain('control_layer/Grundschutz%2B%2B/Grundschutz%2B%2B-resolved_catalog.json');
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringMatching(/BSI upstream/i),
      expect.arrayContaining(['ADR-0039', 'ADR-0005']),
      expect.objectContaining({ resource: 'library-artifact', status: 404, servedFromCache: false }),
    );
    expect(getUpstreamStats()).toMatchObject({ failures: 1, notFound: 1, servedFromCache: 0 });
  });

  it('library: 404 with a cached copy serves it with a "moved upstream" problem and logs a warning', async () => {
    await loadLibraryArtifact(entry, { fetch: status(200, JSON.stringify(catalogDoc)), backoffMs: 0 });
    const warnSpy = vi.spyOn(logger, 'warn');
    const moved = await loadLibraryArtifact({ ...entry, sha: 'b'.repeat(40) }, { fetch: status(404), backoffMs: 0 });
    expect(moved.fromCache).toBe(true);
    expect(moved.problem).toMatchObject({ resource: 'library-artifact', status: 404 });
    expect(moved.problem?.cachedAt).toBeTruthy();
    expect(moved.warning).toMatch(/404/);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['ADR-0039']),
      expect.objectContaining({ servedFromCache: true }),
    );
    expect(getUpstreamStats().servedFromCache).toBe(1);
  });

  it('threat catalog: 404 throws UpstreamLoadError for the threats namespace URL', async () => {
    const err = await loadThreatCatalog({ fetch: status(404), backoffMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamLoadError);
    expect(err.problem).toMatchObject({ resource: 'threat-catalog', url: THREATS_CATALOG_URL, status: 404 });
  });

  it('target-object categories: 404 throws UpstreamLoadError for the categories namespace URL', async () => {
    const err = await loadTargetObjectCategories({ fetch: status(404), backoffMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamLoadError);
    expect(err.problem).toMatchObject({
      resource: 'target-object-categories',
      url: TARGET_OBJECT_CATEGORIES_URL,
      status: 404,
    });
  });
});

describe('namespace URLs follow the new upstream layout (TEST-LIB-05)', () => {
  it('points at documentation/namespaces on live main', () => {
    expect(TARGET_OBJECT_CATEGORIES_URL).toBe(
      'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/documentation/namespaces/target_object_categories.csv',
    );
    expect(THREATS_CATALOG_URL).toBe(
      'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/documentation/namespaces/basethreats.csv',
    );
  });
});
