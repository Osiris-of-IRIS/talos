// SSP list + upload. Decision IDs: ADR-0006, ADR-0004, ADR-0027 (feature IMPL-002).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSspsStore } from './store';
import { useI18n } from '@/shared/i18n';
import { downloadArtifactsAsZip } from '@/data/bulkExport';
import { BulkActionsBar } from '@/features/shared/BulkActionsBar';

export function SspListPage() {
  const { t } = useI18n();
  const { items, loading, error, warnings, selected, load, importFromText, remove, toggleSelected, selectAll, removeMany } =
    useSspsStore();
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
      const text = await file.text();
      await importFromText(text);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      e.target.value = '';
    }
  }

  function onDownloadSelected() {
    setDownloadWarning(null);
    const records = items.filter((r) => selected.has(r.uuid));
    const skipped = downloadArtifactsAsZip(records, `ssps-export-${Date.now()}.zip`);
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
    <main data-testid="ssp-list">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>🖥️ {t('landing_feature_ssps')}</h1>

      <div>
        <Link to="/ssps/new" data-testid="ssp-new">
          ➕ {t('ssp_new')}
        </Link>{' '}
        <button type="button" onClick={() => fileInput.current?.click()}>
          ⭱ {t('common_upload_oscal')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
          data-testid="ssp-upload-input"
          hidden
        />
      </div>

      {uploadError && (
        <p role="alert" data-testid="ssp-upload-error">
          ⚠️ {uploadError}
        </p>
      )}
      {error && <p role="alert">⚠️ {error}</p>}
      {warnings.length > 0 && (
        <p role="status" data-testid="ssp-upload-warning" style={{ color: 'var(--color-warning, #a15c00)' }}>
          ⚠️ {warnings.join(' ')}
        </p>
      )}
      {loading && <p>{t('common_loading')}</p>}

      {!loading && items.length === 0 && (
        <p data-testid="ssp-empty">📂 {t('ssp_empty')}</p>
      )}

      {items.length > 0 && (
        <p>
          <label>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => selectAll(items.map((r) => r.uuid))}
              data-testid="ssp-select-all"
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
        testIdPrefix="ssp"
      />

      {downloadWarning && (
        <p role="status" data-testid="ssp-download-warning" style={{ color: 'var(--color-warning, #a15c00)' }}>
          ⚠️ {downloadWarning}
        </p>
      )}

      <ul>
        {items.map((r) => (
          <li key={r.uuid} data-testid="ssp-item">
            <input
              type="checkbox"
              checked={selected.has(r.uuid)}
              onChange={() => toggleSelected(r.uuid)}
              aria-label={t('bulk_select_item', { title: r.artifact.metadata.title })}
              data-testid="ssp-select-item"
            />{' '}
            <Link to={`/ssps/${r.uuid}`}>{r.artifact.metadata.title}</Link> <small>({r.origin})</small>{' '}
            <button
              type="button"
              onClick={() => void remove(r.uuid)}
              aria-label={t('ssp_delete', { title: r.artifact.metadata.title })}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
