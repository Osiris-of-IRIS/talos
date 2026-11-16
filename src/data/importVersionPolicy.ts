/**
 * The one place both import paths — file upload (fileIo.ts) and BSI library loads
 * (libraryLoader.ts) — apply ADR-0007's OSCAL-version policy, so they cannot drift apart.
 * Returns the user-facing (localizable) warnings, logs every non-current version with
 * decision_ids, and counts outcomes per level (a low-cardinality metric, like upstreamFetch's).
 *
 * Decision IDs: ADR-0007, ADR-0002.
 */
import { checkImportOscalVersion, OSCAL_AUTHORING_VERSION, type ImportWarning } from '@/models/oscalBase';
import { logger } from '@/shared/logger';

export const IMPORT_VERSION_DECISION_IDS = ['ADR-0007'];

/** Where the document came from (log context + metric label). */
export type ImportSource = 'upload' | 'library';

export interface ImportVersionStats {
  /** at the authoring version */
  none: number;
  /** another 1.2.x patch: imported silently, logged at info level */
  info: number;
  /** user was warned (missing version, 1.0/1.1, other minors) */
  warning: number;
}

const stats: ImportVersionStats = { none: 0, info: 0, warning: 0 };

/** Snapshot of the per-level counters since app start (or the last test reset). */
export function getImportVersionStats(): ImportVersionStats {
  return { ...stats };
}

export function _resetImportVersionStatsForTests(): void {
  stats.none = 0;
  stats.info = 0;
  stats.warning = 0;
}

/**
 * Apply the policy to a document's declared `oscal-version`. Throws `OscalVersionError` for
 * versions TALOS cannot import (non-1.x, unparseable) — the caller lets that propagate.
 * @param context extra log fields identifying the document, e.g. `{ title }` or `{ path }`.
 */
export function applyImportVersionPolicy(
  version: unknown,
  source: ImportSource,
  context: Record<string, string> = {},
): ImportWarning[] {
  const result = checkImportOscalVersion(version);
  stats[result.level]++;
  if (result.level === 'info') {
    logger.info('Imported another OSCAL 1.2.x patch version; export will normalize it', IMPORT_VERSION_DECISION_IDS, {
      source,
      version: result.version,
      ...context,
      target: OSCAL_AUTHORING_VERSION,
    });
    return [];
  }
  if (result.level === 'warning') {
    logger.warn(result.warning.message, IMPORT_VERSION_DECISION_IDS, {
      source,
      code: result.warning.code,
      ...result.warning.params,
      ...context,
    });
    return [result.warning];
  }
  return [];
}
