/**
 * Localized wording for OSCAL import outcomes (ADR-0007 version policy, ADR-0012 i18n). The data
 * layer reports structured codes (`ImportWarning`, `OscalVersionError`); every UI surface renders
 * them here, so an upload and a library adoption read the same in both languages.
 */
import { OscalVersionError, type ImportWarning } from '@/models/oscalBase';
import type { TranslateParams } from './i18n';
import { upstreamErrorMessage } from './upstreamMessages';

type T = (key: string, params?: TranslateParams) => string;

const WARNING_KEYS: Record<ImportWarning['code'], string> = {
  'oscal-version-missing': 'import_warning_oscal_version_missing',
  'oscal-version-other': 'import_warning_oscal_version_other',
};

const ERROR_KEYS: Record<OscalVersionError['code'], string> = {
  'oscal-version-unsupported': 'import_error_oscal_version_unsupported',
  'oscal-version-unrecognized': 'import_error_oscal_version_unrecognized',
};

/** One warning, in the UI language. */
export function formatImportWarning(t: T, warning: ImportWarning): string {
  return t(WARNING_KEYS[warning.code], warning.params);
}

/** Several warnings as one toast text (empty string when there are none). */
export function formatImportWarnings(t: T, warnings: readonly ImportWarning[]): string {
  return warnings.map((w) => formatImportWarning(t, w)).join(' ');
}

/**
 * Toast text for an error thrown while importing/adopting: localized for OSCAL version errors,
 * upstream failures go through the upstream formatter (ADR-0039), anything else as-is.
 */
export function importErrorMessage(t: T, err: unknown): string {
  if (err instanceof OscalVersionError) return t(ERROR_KEYS[err.code], err.params);
  return upstreamErrorMessage(t, err);
}
