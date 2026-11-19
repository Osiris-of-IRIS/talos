/**
 * Localized wording for OSCAL compliance issues (ADR-0040, ADR-0012) and the ADR-0019 creator
 * export blockers. The data layer reports structured issues (pointer, path segments, code +
 * params); every UI surface renders them here, so the export dialog, the compliance badge and the
 * blocked-input notice read the same in both languages.
 *  - Path: OSCAL field labels (`oscal_field_<key>`, falling back to the JSON key itself), array
 *    items numbered from 1 with their identifying hint, joined by " › ".
 *  - Reason: `compliance_reason_<code>`, specialised per OSCAL datatype / JSON-schema format.
 */
import type { ComplianceIssue } from '@/models/compliance';
import type { CreatorProblem } from '@/models/creator';
import type { TranslateParams } from './i18n';

type T = (key: string, params?: TranslateParams) => string;

/** `t(key)` when the catalog has the key, otherwise `fallback` (i18n returns the raw key when missing). */
function tOr(t: T, key: string, fallback: string, params?: TranslateParams): string {
  const s = t(key, params);
  return s === key ? fallback : s;
}

function snake(s: string): string {
  return s.replace(/-/g, '_');
}

/** One label per OSCAL JSON key (localized where known). */
export function fieldLabel(t: T, key: string): string {
  return tOr(t, `oscal_field_${snake(key)}`, key);
}

/** "System characteristics › System IDs" / "Implemented requirements #3 (ac-1) › Description". */
export function formatIssuePath(t: T, issue: ComplianceIssue): string {
  const parts: string[] = [];
  for (const seg of issue.path) {
    if ('key' in seg) {
      parts.push(fieldLabel(t, seg.key));
    } else {
      const item = `#${seg.index + 1}${seg.hint ? ` (${seg.hint})` : ''}`;
      if (parts.length > 0) parts[parts.length - 1] += ` ${item}`;
      else parts.push(item);
    }
  }
  return parts.length > 0 ? parts.join(' › ') : t('compliance_path_document');
}

export function formatIssueReason(t: T, issue: ComplianceIssue): string {
  const p = issue.params;
  switch (issue.code) {
    case 'datatype':
      if (!p.datatype) return t('compliance_reason_pattern', { pattern: p.pattern ?? '' });
      return tOr(
        t,
        `compliance_reason_datatype_${p.datatype}`,
        t('compliance_reason_datatype', p),
        p,
      );
    case 'format':
      return tOr(
        t,
        `compliance_reason_format_${snake(p.format ?? '')}`,
        t('compliance_reason_format', p),
        p,
      );
    default:
      return t(`compliance_reason_${snake(issue.code)}`, p);
  }
}

/** "<path>: <reason>" — one line per non-compliant field. */
export function formatIssue(t: T, issue: ComplianceIssue): string {
  return `${formatIssuePath(t, issue)}: ${formatIssueReason(t, issue)}`;
}

const CREATOR_KEYS: Record<CreatorProblem['code'], string> = {
  'creator-missing': 'creator_problem_missing',
  'creator-no-party': 'creator_problem_no_party',
  'creator-party-undefined': 'creator_problem_party_undefined',
  'creator-party-no-name': 'creator_problem_party_no_name',
  'creator-party-no-email': 'creator_problem_party_no_email',
};

export function formatCreatorProblem(t: T, problem: CreatorProblem): string {
  return t(CREATOR_KEYS[problem.code], problem.params);
}
