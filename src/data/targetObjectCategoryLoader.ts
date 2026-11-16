/**
 * Live-fetch loader for the BSI target-object-category namespace CSV (ADR-0026). Shares the
 * upstream fetch of the BSI library loader (ADR-0005, ADR-0039): timeout + retry/backoff, cached
 * in IndexedDB, degrades to a stale cached copy with a warning (never a hard crash, ADR-0002).
 * Unlike the library, this namespace has no manifest/sha to pin freshness against — every load
 * attempts a fresh fetch from live `main` and only falls back to cache on failure. Failures are
 * logged with decision_ids and raised as `UpstreamLoadError` when nothing is cached (ADR-0039).
 */
import { getDb } from './db';
import {
  parseTargetObjectCategoriesCsv,
  type TargetObjectCategory,
} from '@/models/targetObjectCategory';
import { TARGET_OBJECT_CATEGORIES_URL } from '@/config';
import {
  fetchUpstream,
  reportUpstreamFailure,
  toUpstreamProblem,
  UpstreamLoadError,
  type UpstreamFetchDeps,
  type UpstreamProblem,
} from './upstreamFetch';

const CACHE_KEY = 'target-object-categories' as const;

export interface LoadedTargetObjectCategories {
  rows: TargetObjectCategory[];
  fromCache: boolean;
  warning?: string;
  /** structured reason for `warning` (ADR-0039). */
  problem?: UpstreamProblem;
}

export interface TargetObjectCategoryDeps extends UpstreamFetchDeps {
  now?: () => string;
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
    const text = await fetchUpstream(TARGET_OBJECT_CATEGORIES_URL, 'text', deps);
    const rows = parseTargetObjectCategoriesCsv(text);
    await db.put('targetObjectCategoryCache', { key: CACHE_KEY, fetchedAt: now(), rows });
    return { rows, fromCache: false };
  } catch (fetchErr) {
    const problem = toUpstreamProblem(
      'target-object-categories',
      TARGET_OBJECT_CATEGORIES_URL,
      fetchErr,
    );
    const cached = await db.get('targetObjectCategoryCache', CACHE_KEY);
    if (cached) {
      const withCache = { ...problem, cachedAt: cached.fetchedAt };
      reportUpstreamFailure(withCache, true);
      return {
        rows: cached.rows as TargetObjectCategory[],
        fromCache: true,
        warning: `Offline: showing a cached copy of the target-object-category hierarchy (fetched ${cached.fetchedAt}).`,
        problem: withCache,
      };
    }
    reportUpstreamFailure(problem, false);
    throw new UpstreamLoadError(
      `Could not load the target-object-category hierarchy and no cached copy exists: ${problem.detail}`,
      problem,
    );
  }
}
