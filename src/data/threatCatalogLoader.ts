/**
 * Live-fetch loader for the BSI elementary-threats namespace CSV (`basethreats.csv`, ADR-0035).
 * Mirrors `targetObjectCategoryLoader.ts` (ADR-0026) byte-for-byte: injectable fetcher with
 * timeout + retry/backoff, cached in IndexedDB, degrades to a stale cached copy with a warning
 * when offline (never a hard crash, ADR-0002). No manifest/sha to pin freshness against — every
 * load attempts a fresh fetch and only falls back to cache on failure.
 */
import { getDb } from './db';
import { parseBasethreatsCsv, type ThreatCatalogEntry } from '@/models/threatCatalog';
import { THREATS_CATALOG_URL } from '@/config';

const CACHE_KEY = 'threat-catalog' as const;

export interface LoadedThreatCatalog {
  rows: ThreatCatalogEntry[];
  fromCache: boolean;
  warning?: string;
}

export interface ThreatCatalogDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  now?: () => string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url: string, deps: ThreatCatalogDeps): Promise<string> {
  const f = deps.fetch ?? globalThis.fetch;
  if (!f) throw new Error('No fetch implementation available.');
  const retries = deps.retries ?? 2;
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const backoffMs = deps.backoffMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await f(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await delay(backoffMs * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Load the elementary-threats catalog: fetch + parse + cache, falling back to the last cached
 * copy (with a warning) on failure, and only throwing when nothing is cached.
 */
export async function loadThreatCatalog(deps: ThreatCatalogDeps = {}): Promise<LoadedThreatCatalog> {
  const now = deps.now ?? (() => new Date().toISOString());
  const db = await getDb();

  try {
    const text = await fetchTextWithRetry(THREATS_CATALOG_URL, deps);
    const rows = parseBasethreatsCsv(text);
    await db.put('threatCatalogCache', { key: CACHE_KEY, fetchedAt: now(), rows });
    return { rows, fromCache: false };
  } catch (fetchErr) {
    const cached = await db.get('threatCatalogCache', CACHE_KEY);
    if (cached) {
      return {
        rows: cached.rows as ThreatCatalogEntry[],
        fromCache: true,
        warning: `Offline: showing a cached copy of the threat catalog (fetched ${cached.fetchedAt}).`,
      };
    }
    throw new Error(
      `Could not load the threat catalog and no cached copy exists: ${
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      }`,
    );
  }
}
