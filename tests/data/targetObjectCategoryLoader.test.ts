/**
 * Target-object-category namespace loader — live fetch, cache, offline fallback (ADR-0026,
 * mirrors the BSI library loader pattern of ADR-0005).
 * Covers TEST-TOC-02.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests, getDb } from '@/data/db';
import { loadTargetObjectCategories } from '@/data/targetObjectCategoryLoader';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

const CSV =
  'Zielobjekt,Definition,Typ,Kategorie,Synonyme,ChildOfUUID,UUID\n' +
  'Anwendungen,"Funktionseinheiten.",Anwendungen,Technisch,Apps,,7e41ecf5-1831-4691-ad0c-4fc7bbc1b871\n';

function mockFetch(text: string, opts: { failFirst?: number; alwaysFail?: boolean } = {}) {
  let calls = 0;
  return vi.fn(async () => {
    calls++;
    if (opts.alwaysFail || (opts.failFirst && calls <= opts.failFirst)) {
      throw new Error('network down');
    }
    return { ok: true, status: 200, text: async () => text } as Response;
  });
}

describe('loadTargetObjectCategories', () => {
  it('fetches, parses, and caches the namespace CSV', async () => {
    const fetch = mockFetch(CSV);
    const loaded = await loadTargetObjectCategories({ fetch, backoffMs: 0 });
    expect(loaded.fromCache).toBe(false);
    expect(loaded.rows).toHaveLength(1);
    expect(loaded.rows[0]!.title).toBe('Anwendungen');
    expect(fetch.mock.calls.length).toBe(1);
  });

  it('retries a transient failure before succeeding', async () => {
    const fetch = mockFetch(CSV, { failFirst: 1 });
    const loaded = await loadTargetObjectCategories({ fetch, backoffMs: 0, retries: 2 });
    expect(loaded.fromCache).toBe(false);
    expect(fetch.mock.calls.length).toBe(2);
  });

  it('falls back to a cached copy with a warning when offline', async () => {
    await loadTargetObjectCategories({ fetch: mockFetch(CSV), backoffMs: 0 });
    const offline = await loadTargetObjectCategories({
      fetch: mockFetch(CSV, { alwaysFail: true }),
      backoffMs: 0,
      retries: 1,
    });
    expect(offline.fromCache).toBe(true);
    expect(offline.rows).toHaveLength(1);
    expect(offline.warning).toMatch(/offline/i);
  });

  it('throws when the fetch fails and nothing is cached', async () => {
    await expect(
      loadTargetObjectCategories({ fetch: mockFetch(CSV, { alwaysFail: true }), backoffMs: 0, retries: 1 }),
    ).rejects.toThrow(/no cached copy/i);
  });

  it('persists the cache entry in IndexedDB across loader instances', async () => {
    await loadTargetObjectCategories({ fetch: mockFetch(CSV), backoffMs: 0 });
    const db = await getDb();
    const cached = await db.get('targetObjectCategoryCache', 'target-object-categories');
    expect(cached?.rows).toHaveLength(1);
  });
});
