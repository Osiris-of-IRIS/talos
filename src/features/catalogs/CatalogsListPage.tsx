// Catalogs list + upload (read-only sources; viewed externally per ADR-0008). Feature: control layer.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCatalogsStore } from './store';
import { VIEWER_URL } from '@/config';
import { useI18n } from '@/shared/i18n';
import { downloadArtifactsAsZip } from '@/data/bulkExport';
import { BulkActionsBar } from '@/features/shared/BulkActionsBar';

export function CatalogsListPage() {
  const { t } = useI18n();
  const { items, loading, error, warnings, selected, load, importFromText, remove, toggleSelected, selectAll, removeMany } =
    useCatalogsStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadWarning, setDownloadWarning] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importFromText(await file.text());
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      e.target.value = '';
    }
  }

  function onDownloadSelected() {
    setDownloadWarning(null);
    const records = items.filter((r) => selected.has(r.uuid));
    const skipped = downloadArtifactsAsZip(records, `catalogs-export-${Date.now()}.zip`);
    if (skipped.length > 0) {
      setDownloadWarning(t('bulk_download_warning', { count: String(skipped.length), details: skipped.join('; ') }));
    }
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

      {uploadError && (
        <p role="alert" data-testid="catalog-upload-error">
          ⚠️ {uploadError}
        </p>
      )}
      {error && <p role="alert">⚠️ {error}</p>}
      {warnings.length > 0 && (
        <p role="status" data-testid="catalog-upload-warning" style={{ color: 'var(--color-warning, #a15c00)' }}>
          ⚠️ {warnings.join(' ')}
        </p>
      )}
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

      {downloadWarning && (
        <p role="status" data-testid="catalog-download-warning" style={{ color: 'var(--color-warning, #a15c00)' }}>
          ⚠️ {downloadWarning}
        </p>
      )}

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
    </main>
  );
}
