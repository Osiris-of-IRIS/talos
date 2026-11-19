// Localized list of non-compliant fields (ADR-0040): "<path>: <reason>", JSON pointer as a tooltip.
import { useI18n } from '@/shared/i18n';
import { formatIssuePath, formatIssueReason } from '@/shared/complianceMessages';
import type { ComplianceIssue } from '@/models/compliance';

interface Props {
  issues: readonly ComplianceIssue[];
  /** Show at most this many, then "…and N more" (default: all). */
  limit?: number;
}

export function ComplianceIssueList({ issues, limit }: Props) {
  const { t } = useI18n();
  const shown = limit !== undefined ? issues.slice(0, limit) : issues;
  return (
    <>
      <ul className="compliance-issue-list" data-testid="compliance-issue-list">
        {shown.map((issue) => (
          <li
            key={`${issue.pointer} ${issue.code}`}
            data-testid="compliance-issue"
            title={issue.pointer}
          >
            <strong>{formatIssuePath(t, issue)}</strong>: {formatIssueReason(t, issue)}
          </li>
        ))}
      </ul>
      {shown.length < issues.length && (
        <p>
          <small data-testid="compliance-issues-more">
            {t('compliance_issues_more', { count: issues.length - shown.length })}
          </small>
        </p>
      )}
    </>
  );
}
