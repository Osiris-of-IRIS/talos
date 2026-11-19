/**
 * OSCAL compliance status chip (ADR-0040) for list rows, detail pages and editors. Clicking a
 * non-compliant badge opens the full list of non-compliant fields in a modal.
 */
import { useState } from 'react';
import { useI18n } from '@/shared/i18n';
import { Modal } from '@/shared/Modal';
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import type { ComplianceReport } from '@/models/compliance';
import { ComplianceIssueList } from './ComplianceIssueList';

interface Props {
  report: ComplianceReport | undefined;
  /** Artifact title, for the modal heading. */
  title?: string;
}

export function ComplianceBadge({ report, title }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const version = OSCAL_AUTHORING_VERSION;
  const status = report?.status ?? 'checking';
  const label =
    status === 'checking'
      ? t('compliance_badge_checking')
      : status === 'compliant'
        ? t('compliance_badge_compliant', { version })
        : status === 'unchecked'
          ? t('compliance_badge_unchecked')
          : t('compliance_badge_non_compliant', { count: report!.issues.length });
  return (
    <>
      <button
        type="button"
        className={`compliance-badge compliance-badge--${status}`}
        data-testid="compliance-badge"
        data-status={status}
        title={t('compliance_badge_title', { version })}
        disabled={status !== 'non-compliant'}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {report && report.status === 'non-compliant' && (
        <Modal open={open} onClose={() => setOpen(false)} title={title}>
          <p>
            <strong>
              {t('compliance_issues_heading', { count: report.issues.length, version })}
            </strong>
          </p>
          <ComplianceIssueList issues={report.issues} />
          <p>
            <small>{t('compliance_panel_hint')}</small>
          </p>
        </Modal>
      )}
    </>
  );
}
