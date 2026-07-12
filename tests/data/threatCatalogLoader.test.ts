/**
 * Threat catalog (basethreats.csv) namespace loader — live fetch, cache, offline fallback
 * (ADR-0035, mirrors the target-object-category loader pattern of ADR-0026).
 * Covers TEST-DASH-05.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests, getDb } from '@/data/db';
import { loadThreatCatalog } from '@/data/threatCatalogLoader';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

const CSV = 'ID,Begriff,Definition,uuid\n' + 'G 0.1,Feuer,"Feuer kann Schäden verursachen.",aaaa-1111\n';

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

describe('loadThreatCatalog', () => {
  it('fetches, parses, and caches the namespace CSV', async () => {
    const fetch = mockFetch(CSV);
    const loaded = await loadThreatCatalog({ fetch, backoffMs: 0 });
    expect(loaded.fromCache).toBe(false);
    expect(loaded.rows).toHaveLength(1);
    expect(loaded.rows[0]!.id).toBe('G 0.1');
    expect(loaded.rows[0]!.title).toBe('Feuer');
    expect(fetch.mock.calls.length).toBe(1);
  });

  it('retries a transient failure before succeeding', async () => {
    const fetch = mockFetch(CSV, { failFirst: 1 });
    const loaded = await loadThreatCatalog({ fetch, backoffMs: 0, retries: 2 });
    expect(loaded.fromCache).toBe(false);
    expect(fetch.mock.calls.length).toBe(2);
  });

  it('falls back to a cached copy with a warning when offline', async () => {
    await loadThreatCatalog({ fetch: mockFetch(CSV), backoffMs: 0 });
    const offline = await loadThreatCatalog({
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
      loadThreatCatalog({ fetch: mockFetch(CSV, { alwaysFail: true }), backoffMs: 0, retries: 1 }),
    ).rejects.toThrow(/no cached copy/i);
  });

  it('persists the cache entry in IndexedDB across loader instances', async () => {
    await loadThreatCatalog({ fetch: mockFetch(CSV), backoffMs: 0 });
    const db = await getDb();
    const cached = await db.get('threatCatalogCache', 'threat-catalog');
    expect(cached?.rows).toHaveLength(1);
  });
});
