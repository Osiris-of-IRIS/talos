/**
 * Explains why a picked artifact cannot be used as a workflow input (compliance gate, ADR-0040):
 * names the artifact, says how to fix it (edit it — or, for catalogs, which TALOS cannot edit,
 * correct and re-upload the source file), lists the non-compliant fields and links to it.
 */
import { Link } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import type { ComplianceReport } from '@/models/compliance';
import type { StoredArtifact } from '@/data/db';
import { ComplianceIssueList } from './ComplianceIssueList';

const NOTICE_ISSUE_LIMIT = 10;

function routeFor(record: StoredArtifact): string {
  switch (record.type) {
    case 'profile':
      return `/profiles/${record.uuid}`;
    case 'componentDefinition':
      return `/component-definitions/${record.uuid}`;
    case 'systemSecurityPlan':
      return `/ssps/${record.uuid}`;
    default:
      return '/catalogs';
  }
}

interface Props {
  record: StoredArtifact;
  report: ComplianceReport;
  onDismiss?: () => void;
}

export function BlockedInputNotice({ record, report, onDismiss }: Props) {
  const { t } = useI18n();
  const title =
    (record.artifact as { metadata?: { title?: string } }).metadata?.title || record.uuid;
  const readOnly = record.type === 'catalog' || record.origin === 'library';
  return (
    <div role="alert" className="input-blocked-notice" data-testid="input-blocked-notice">
      <p>
        <strong>⛔ {t('gate_blocked_title', { title, version: OSCAL_AUTHORING_VERSION })}</strong>
      </p>
      {report.status === 'unchecked' ? (
        <p>{t('gate_blocked_unchecked')}</p>
      ) : (
        <>
          <p>{t(readOnly ? 'gate_blocked_fix_readonly' : 'gate_blocked_fix_editable')}</p>
          <ComplianceIssueList issues={report.issues} limit={NOTICE_ISSUE_LIMIT} />
        </>
      )}
      <p>
        <Link to={routeFor(record)} data-testid="input-blocked-open">
          {t('gate_blocked_open', { title })}
        </Link>
        {onDismiss && (
          <>
            {' '}
            <button type="button" data-testid="input-blocked-dismiss" onClick={onDismiss}>
              {t('gate_blocked_dismiss')}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
