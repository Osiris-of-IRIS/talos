/**
 * Live-fetch loader for the BSI target-object-category namespace CSV (ADR-0026). Mirrors the
 * BSI library loader (ADR-0005): injectable fetcher with timeout + retry/backoff, cached in
 * IndexedDB, degrades to a stale cached copy with a warning when offline (never a hard crash,
 * ADR-0002). Unlike the library, this namespace has no manifest/sha to pin freshness against —
 * every load attempts a fresh fetch and only falls back to cache on failure.
 */
import { getDb } from './db';
import { parseTargetObjectCategoriesCsv, type TargetObjectCategory } from '@/models/targetObjectCategory';
import { TARGET_OBJECT_CATEGORIES_URL } from '@/config';

const CACHE_KEY = 'target-object-categories' as const;

export interface LoadedTargetObjectCategories {
  rows: TargetObjectCategory[];
  fromCache: boolean;
  warning?: string;
}

export interface TargetObjectCategoryDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  now?: () => string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url: string, deps: TargetObjectCategoryDeps): Promise<string> {
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
 * Load the target-object-category hierarchy: fetch + parse + cache, falling back to the last
 * cached copy (with a warning) on failure, and only throwing when nothing is cached.
 */
export async function loadTargetObjectCategories(
  deps: TargetObjectCategoryDeps = {},
): Promise<LoadedTargetObjectCategories> {
  const now = deps.now ?? (() => new Date().toISOString());
  const db = await getDb();

  try {
    const text = await fetchTextWithRetry(TARGET_OBJECT_CATEGORIES_URL, deps);
    const rows = parseTargetObjectCategoriesCsv(text);
    await db.put('targetObjectCategoryCache', { key: CACHE_KEY, fetchedAt: now(), rows });
    return { rows, fromCache: false };
  } catch (fetchErr) {
    const cached = await db.get('targetObjectCategoryCache', CACHE_KEY);
    if (cached) {
      return {
        rows: cached.rows as TargetObjectCategory[],
        fromCache: true,
        warning: `Offline: showing a cached copy of the target-object-category hierarchy (fetched ${cached.fetchedAt}).`,
      };
    }
    throw new Error(
      `Could not load the target-object-category hierarchy and no cached copy exists: ${
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      }`,
    );
  }
}
