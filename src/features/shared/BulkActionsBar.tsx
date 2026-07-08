// Shared bulk-selection action bar: "N selected" + download/delete. Decision IDs: ADR-0027.
import { useI18n } from '@/shared/i18n';

interface BulkActionsBarProps {
  count: number;
  /** i18n key for the download button label — pages differ (zip vs CSV). */
  downloadLabelKey: string;
  onDownload: () => void;
  onDelete: () => void;
  testIdPrefix: string;
}

export function BulkActionsBar({ count, downloadLabelKey, onDownload, onDelete, testIdPrefix }: BulkActionsBarProps) {
  const { t } = useI18n();
  if (count === 0) return null;

  return (
    <div data-testid={`${testIdPrefix}-bulk-actions`}>
      <span data-testid={`${testIdPrefix}-selected-count`}>
        {t('bulk_selected_count', { count: String(count) })}
      </span>{' '}
      <button type="button" onClick={onDownload} data-testid={`${testIdPrefix}-download-selected`}>
        ⭱ {t(downloadLabelKey)}
      </button>{' '}
      <button type="button" onClick={onDelete} data-testid={`${testIdPrefix}-delete-selected`}>
        🗑️ {t('bulk_delete_selected')}
      </button>
    </div>
  );
}
