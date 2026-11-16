/**
 * Shared fetch + failure reporting for everything TALOS reads from the BSI Stand-der-Technik-
 * Bibliothek at runtime: library artifacts (ADR-0005), the target-object-category namespace
 * (ADR-0026) and the elementary-threats namespace (ADR-0035). TALOS follows BSI's live `main`
 * (ADR-0039, PO decision Q1), so an upstream move is an expected failure mode, not an exotic one:
 *
 *  - timeout + retry with backoff for transient failures (network errors, 5xx, 408, 429);
 *  - other 4xx — in practice a 404 after a move — fail immediately: retrying cannot help;
 *  - failures are raised as a structured `UpstreamLoadError` carrying an `UpstreamProblem`
 *    (resource, url, status) so the UI can show a localized, actionable message;
 *  - every failure is logged with decision_ids and counted (`getUpstreamStats`), whether or not a
 *    cached copy saved the day.
 *
 * Decision IDs: ADR-0039, ADR-0005, ADR-0002.
 */
import { logger } from '@/shared/logger';

export const UPSTREAM_DECISION_IDS = ['ADR-0039', 'ADR-0005'];

export type UpstreamResource = 'library-artifact' | 'target-object-categories' | 'threat-catalog';

export interface UpstreamProblem {
  resource: UpstreamResource;
  /** Library item title (library artifacts only). */
  title?: string;
  url: string;
  /** HTTP status, when the server answered; undefined for network errors/timeouts. */
  status?: number;
  /** Technical detail (English), e.g. "HTTP 404 for …" or "network down". */
  detail: string;
  /** When a stale cached copy was served instead: when that copy was fetched. */
  cachedAt?: string;
}

/** Raised by `fetchUpstream` for one failed URL. */
export class UpstreamFetchError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UpstreamFetchError';
  }
}

/** Raised by the loaders when an upstream resource failed and no cached copy exists. */
export class UpstreamLoadError extends Error {
  constructor(
    message: string,
    readonly problem: UpstreamProblem,
  ) {
    super(message);
    this.name = 'UpstreamLoadError';
  }
}

export interface UpstreamFetchDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 4xx other than 408/429 is permanent: the file is not where we expect it. */
function isRetriableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export async function fetchUpstream(url: string, as: 'json', deps?: UpstreamFetchDeps): Promise<unknown>;
export async function fetchUpstream(url: string, as: 'text', deps?: UpstreamFetchDeps): Promise<string>;
export async function fetchUpstream(
  url: string,
  as: 'json' | 'text',
  deps: UpstreamFetchDeps = {},
): Promise<unknown> {
  const f = deps.fetch ?? globalThis.fetch;
  if (!f) throw new UpstreamFetchError('No fetch implementation available.', url);
  const retries = deps.retries ?? 2;
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const backoffMs = deps.backoffMs ?? 250;
  let lastErr: UpstreamFetchError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await f(url, { signal: controller.signal });
      if (!res.ok) {
        lastErr = new UpstreamFetchError(`HTTP ${res.status} for ${url}`, url, res.status);
        if (!isRetriableStatus(res.status)) throw lastErr;
      } else {
        return as === 'json' ? ((await res.json()) as unknown) : await res.text();
      }
    } catch (e) {
      if (e instanceof UpstreamFetchError && e.status !== undefined && !isRetriableStatus(e.status)) throw e;
      lastErr =
        e instanceof UpstreamFetchError
          ? e
          : new UpstreamFetchError(e instanceof Error ? e.message : String(e), url);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await delay(backoffMs * (attempt + 1));
  }
  throw lastErr ?? new UpstreamFetchError(`Fetch failed for ${url}`, url);
}

/** Turn any fetch/parse failure into the problem shape the UI and logs share. */
export function toUpstreamProblem(
  resource: UpstreamResource,
  url: string,
  err: unknown,
  extra: { title?: string } = {},
): UpstreamProblem {
  const status = err instanceof UpstreamFetchError ? err.status : undefined;
  return {
    resource,
    url,
    ...(extra.title !== undefined ? { title: extra.title } : {}),
    ...(status !== undefined ? { status } : {}),
    detail: err instanceof Error ? err.message : String(err),
  };
}

interface UpstreamStats {
  failures: number;
  notFound: number;
  servedFromCache: number;
  byResource: Record<UpstreamResource, number>;
}

function emptyStats(): UpstreamStats {
  return {
    failures: 0,
    notFound: 0,
    servedFromCache: 0,
    byResource: { 'library-artifact': 0, 'target-object-categories': 0, 'threat-catalog': 0 },
  };
}

let stats = emptyStats();

/** In-memory failure counters (metric for diagnostics; low-cardinality: by resource kind only). */
export function getUpstreamStats(): Readonly<UpstreamStats> {
  return { ...stats, byResource: { ...stats.byResource } };
}

export function _resetUpstreamStatsForTests(): void {
  stats = emptyStats();
}

/**
 * Log + count an upstream failure. `error` level when nothing could be served (the feature is
 * degraded), `warn` when a cached copy was served instead.
 */
export function reportUpstreamFailure(problem: UpstreamProblem, servedFromCache: boolean): void {
  stats.failures++;
  if (problem.status === 404) stats.notFound++;
  if (servedFromCache) stats.servedFromCache++;
  stats.byResource[problem.resource]++;
  const context = {
    resource: problem.resource,
    url: problem.url,
    status: problem.status,
    detail: problem.detail,
    servedFromCache,
    ...(problem.title !== undefined ? { title: problem.title } : {}),
    ...(problem.cachedAt !== undefined ? { cachedAt: problem.cachedAt } : {}),
    failuresSoFar: stats.failures,
  };
  if (servedFromCache) {
    logger.warn('BSI upstream resource unavailable — serving cached copy', UPSTREAM_DECISION_IDS, context);
  } else {
    logger.error('BSI upstream resource could not be loaded', UPSTREAM_DECISION_IDS, context);
  }
}
