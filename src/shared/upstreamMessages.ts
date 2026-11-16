/**
 * Localized, actionable wording for BSI upstream failures (ADR-0039, ADR-0012). Loaders raise or
 * return a structured `UpstreamProblem`; every UI surface formats it here so a moved file reads the
 * same everywhere: what failed, why (moved upstream vs. unreachable), the URL, and what helps.
 */
import { UpstreamLoadError, type UpstreamProblem } from '@/data/upstreamFetch';
import type { TranslateParams } from './i18n';

type T = (key: string, params?: TranslateParams) => string;

function resourceLabel(t: T, problem: UpstreamProblem): string {
  switch (problem.resource) {
    case 'library-artifact':
      return t('upstream_resource_library', { title: problem.title ?? '' });
    case 'target-object-categories':
      return t('upstream_resource_target_object_categories');
    case 'threat-catalog':
      return t('upstream_resource_threat_catalog');
  }
}

/** Message for a problem: `servedFromCache` picks the warning (stale copy shown) wording. */
export function formatUpstreamProblem(
  t: T,
  problem: UpstreamProblem,
  servedFromCache: boolean,
): string {
  const params = {
    resource: resourceLabel(t, problem),
    url: problem.url,
    status: problem.status ?? '',
    detail: problem.detail,
    cachedAt: problem.cachedAt ?? '',
  };
  const moved = problem.status === 404 || problem.status === 410;
  if (servedFromCache) {
    return t(
      moved ? 'upstream_warning_cached_moved' : 'upstream_warning_cached_unreachable',
      params,
    );
  }
  return t(moved ? 'upstream_error_moved' : 'upstream_error_unreachable', params);
}

/** Toast text for any error a loader threw: localized for upstream failures, raw message otherwise. */
export function upstreamErrorMessage(t: T, err: unknown): string {
  if (err instanceof UpstreamLoadError) return formatUpstreamProblem(t, err.problem, false);
  return err instanceof Error ? err.message : String(err);
}

/** Toast text for a loader result that fell back to cache (localized when structured). */
export function upstreamWarningMessage(
  t: T,
  loaded: { warning?: string; problem?: UpstreamProblem },
): string | undefined {
  if (loaded.problem) return formatUpstreamProblem(t, loaded.problem, true);
  return loaded.warning;
}
