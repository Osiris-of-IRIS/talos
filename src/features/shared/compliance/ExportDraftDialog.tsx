// Draft-export dialog (ADR-0040): names every non-compliant field before a draft download.
import { useI18n } from '@/shared/i18n';
import { Modal } from '@/shared/Modal';
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import type { ComplianceReport } from '@/models/compliance';
import type { StoredArtifact } from '@/data/db';
import { ComplianceIssueList } from './ComplianceIssueList';

function titleOf(record: StoredArtifact): string {
  return (record.artifact as { metadata?: { title?: string } }).metadata?.title || record.uuid;
}

export interface DraftEntry {
  record: StoredArtifact;
  report: ComplianceReport;
}

export function ExportDraftDialog({
  entries,
  bulk,
  onConfirm,
  onCancel,
}: {
  entries: DraftEntry[];
  bulk: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const version = OSCAL_AUTHORING_VERSION;
  return (
    <Modal open onClose={onCancel} title={t('export_dialog_title')}>
      <div data-testid="export-dialog">
        <p>
          {bulk
            ? t('export_dialog_bulk_intro', { count: entries.length, version })
            : t('export_dialog_intro', { title: titleOf(entries[0]!.record), version })}
        </p>
        {entries.map(({ record, report }) => (
          <div key={record.uuid} data-testid="export-dialog-entry">
            {bulk && (
              <p>
                <strong>{titleOf(record)}</strong>
              </p>
            )}
            <ComplianceIssueList issues={report.issues} />
          </div>
        ))}
        <p>
          <button type="button" data-testid="export-draft-download" onClick={onConfirm}>
            ⭳ {t(bulk ? 'export_dialog_download_bulk' : 'export_dialog_download_draft')}
          </button>{' '}
          <button type="button" data-testid="export-cancel" onClick={onCancel}>
            {t('common_cancel')}
          </button>
        </p>
      </div>
    </Modal>
  );
}
