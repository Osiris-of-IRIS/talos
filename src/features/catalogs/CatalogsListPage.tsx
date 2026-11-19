// Catalogs list + upload (read-only sources; viewed externally per ADR-0008). Feature: control layer.
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCatalogsStore } from './store';
import { VIEWER_URL } from '@/config';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import { formatImportWarnings, importErrorMessage } from '@/shared/importMessages';
import { useBulkExportDownload } from '@/features/shared/compliance/useExportDownload';
import { useImportComplianceWarning, useRecordsCompliance } from '@/features/shared/compliance/useCompliance';
import { ComplianceBadge } from '@/features/shared/compliance/ComplianceBadge';
import { BulkActionsBar } from '@/features/shared/BulkActionsBar';

export function CatalogsListPage() {
  const { t } = useI18n();
  // Read through a ref so a re-created `t` never re-fires the import-warning toast effect.
  const tRef = useRef(t);
  tRef.current = t;
  const { showToast } = useToast();
  const { items, loading, error, warnings, selected, load, importFromText, remove, toggleSelected, selectAll, removeMany } =
    useCatalogsStore();
  const fileInput = useRef<HTMLInputElement>(null);
  // Per-row OSCAL compliance, validate-on-export, and the post-import compliance warning (ADR-0040).
  const complianceByUuid = useRecordsCompliance(items);
  const { requestBulkDownload, dialog: bulkExportDialog } = useBulkExportDownload();
  const warnImportCompliance = useImportComplianceWarning();

  useEffect(() => {
    void load();
  }, [load]);

  // Reacts to the store's own error/warnings state (not just this component's own upload calls)
  // so a warning/error set by any caller — including a test driving the store directly — still
  // surfaces. Both fields are freshly-created values whenever the store sets them (a new array,
  // or reset to null/[] first), so this never misses a repeated identical result.
  useEffect(() => {
    if (error) showToast(error, 'error');
  }, [error, showToast]);

  useEffect(() => {
    if (warnings.length > 0) showToast(formatImportWarnings(tRef.current, warnings), 'warning');
  }, [warnings, showToast]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uuid = await importFromText(await file.text());
      await warnImportCompliance('catalog', uuid);
    } catch (err) {
      showToast(importErrorMessage(t, err), 'error');
    } finally {
      e.target.value = '';
    }
  }

  function onDownloadSelected() {
    const records = items.filter((r) => selected.has(r.uuid));
    void requestBulkDownload(records, `catalogs-export-${Date.now()}.zip`);
  }

  async function onDeleteSelected() {
    if (!globalThis.confirm(t('bulk_delete_confirm', { count: String(selected.size) }))) return;
    await removeMany([...selected]);
  }

  const allSelected = items.length > 0 && items.every((r) => selected.has(r.uuid));

  return (
    <main data-testid="catalog-list">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>📘 {t('landing_feature_catalogs')}</h1>
      <p>
        <small>{t('catalog_readonly_hint')}</small>
      </p>

      <div>
        <button type="button" onClick={() => fileInput.current?.click()}>
          ⭱ {t('catalog_upload')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="catalog-upload-input"
          onChange={onFileChange}
        />
      </div>

      {loading && <p>{t('common_loading')}</p>}
      {!loading && items.length === 0 && (
        <p data-testid="catalog-empty">📂 {t('catalog_empty')}</p>
      )}

      {items.length > 0 && (
        <p>
          <label>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => selectAll(items.map((r) => r.uuid))}
              data-testid="catalog-select-all"
            />{' '}
            {t('bulk_select_all')}
          </label>
        </p>
      )}

      <BulkActionsBar
        count={selected.size}
        downloadLabelKey="bulk_download_selected_zip"
        onDownload={onDownloadSelected}
        onDelete={() => void onDeleteSelected()}
        testIdPrefix="catalog"
      />

      <ul>
        {items.map((r) => (
          <li key={r.uuid} data-testid="catalog-item">
            <input
              type="checkbox"
              checked={selected.has(r.uuid)}
              onChange={() => toggleSelected(r.uuid)}
              aria-label={t('bulk_select_item', { title: r.artifact.metadata.title })}
              data-testid="catalog-select-item"
            />{' '}
            {r.artifact.metadata.title} <small>({r.origin})</small>{' '}
            <ComplianceBadge report={complianceByUuid.get(r.uuid)} title={r.artifact.metadata.title} />{' '}
            <a href={VIEWER_URL} target="_blank" rel="noopener noreferrer">
              ≡ {t('catalog_view_in_viewer')}
            </a>{' '}
            <button
              type="button"
              aria-label={t('catalog_delete', { title: r.artifact.metadata.title })}
              onClick={() => void remove(r.uuid)}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
      {bulkExportDialog}
    </main>
  );
}
