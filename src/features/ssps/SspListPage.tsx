// SSP list + upload. Decision IDs: ADR-0006, ADR-0004, ADR-0027 (feature IMPL-002).
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSspsStore } from './store';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import { downloadArtifactsAsZip } from '@/data/bulkExport';
import { BulkActionsBar } from '@/features/shared/BulkActionsBar';

export function SspListPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { items, loading, error, warnings, selected, load, importFromText, remove, toggleSelected, selectAll, removeMany } =
    useSspsStore();
  const fileInput = useRef<HTMLInputElement>(null);

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
    if (warnings.length > 0) showToast(warnings.join(' '), 'warning');
  }, [warnings, showToast]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importFromText(text);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      e.target.value = '';
    }
  }

  function onDownloadSelected() {
    const records = items.filter((r) => selected.has(r.uuid));
    const skipped = downloadArtifactsAsZip(records, `ssps-export-${Date.now()}.zip`);
    if (skipped.length > 0) {
      showToast(t('bulk_download_warning', { count: String(skipped.length), details: skipped.join('; ') }), 'warning');
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
