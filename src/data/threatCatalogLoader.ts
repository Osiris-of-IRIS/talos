/**
 * Live-fetch loader for the BSI elementary-threats namespace CSV (`basethreats.csv`, ADR-0035).
 * Same contract as `targetObjectCategoryLoader.ts` (ADR-0026): shared upstream fetch with
 * timeout + retry/backoff (ADR-0039), cached in IndexedDB, degrades to a stale cached copy with a
 * warning (never a hard crash, ADR-0002). No manifest/sha to pin freshness against — every load
 * attempts a fresh fetch from live `main` and only falls back to cache on failure. Failures are
 * logged with decision_ids and raised as `UpstreamLoadError` when nothing is cached (ADR-0039).
 */
import { getDb } from './db';
import { parseBasethreatsCsv, type ThreatCatalogEntry } from '@/models/threatCatalog';
import { THREATS_CATALOG_URL } from '@/config';
import {
  fetchUpstream,
  reportUpstreamFailure,
  toUpstreamProblem,
  UpstreamLoadError,
  type UpstreamFetchDeps,
  type UpstreamProblem,
} from './upstreamFetch';

const CACHE_KEY = 'threat-catalog' as const;

export interface LoadedThreatCatalog {
  rows: ThreatCatalogEntry[];
  fromCache: boolean;
  warning?: string;
  /** structured reason for `warning` (ADR-0039). */
  problem?: UpstreamProblem;
}

export interface ThreatCatalogDeps extends UpstreamFetchDeps {
  now?: () => string;
}

/**
 * Load the elementary-threats catalog: fetch + parse + cache, falling back to the last cached
 * copy (with a warning) on failure, and only throwing when nothing is cached.
 */
export async function loadThreatCatalog(deps: ThreatCatalogDeps = {}): Promise<LoadedThreatCatalog> {
  const now = deps.now ?? (() => new Date().toISOString());
  const db = await getDb();

  try {
    const text = await fetchUpstream(THREATS_CATALOG_URL, 'text', deps);
    const rows = parseBasethreatsCsv(text);
    await db.put('threatCatalogCache', { key: CACHE_KEY, fetchedAt: now(), rows });
    return { rows, fromCache: false };
  } catch (fetchErr) {
    const problem = toUpstreamProblem('threat-catalog', THREATS_CATALOG_URL, fetchErr);
    const cached = await db.get('threatCatalogCache', CACHE_KEY);
    if (cached) {
      const withCache = { ...problem, cachedAt: cached.fetchedAt };
      reportUpstreamFailure(withCache, true);
      return {
        rows: cached.rows as ThreatCatalogEntry[],
        fromCache: true,
        warning: `Offline: showing a cached copy of the threat catalog (fetched ${cached.fetchedAt}).`,
        problem: withCache,
      };
    }
    reportUpstreamFailure(problem, false);
    throw new UpstreamLoadError(
      `Could not load the threat catalog and no cached copy exists: ${problem.detail}`,
      problem,
    );
  }
}
