// Profile list + upload. Decision IDs: ADR-0006, ADR-0004, ADR-0032 (feature CTRL-001, T-200).
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useProfilesStore } from './store';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import { downloadArtifactsAsZip } from '@/data/bulkExport';
import { BulkActionsBar } from '@/features/shared/BulkActionsBar';

export function ProfilesListPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { items, loading, error, warnings, selected, load, importFromText, remove, toggleSelected, selectAll, removeMany } =
    useProfilesStore();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

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
      await importFromText(await file.text());
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      e.target.value = '';
    }
  }

  function onDownloadSelected() {
    const records = items.filter((r) => selected.has(r.uuid));
    const skipped = downloadArtifactsAsZip(records, `profiles-export-${Date.now()}.zip`);
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
    <main data-testid="profile-list">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>📑 {t('landing_feature_profiles')}</h1>

      <div>
        <Link to="/profiles/new" data-testid="profile-new">
          ➕ {t('profile_new')}
        </Link>{' '}
        <Link to="/profiles/assistant" data-testid="profile-assistant-link">
          🧭 {t('profile_assistant_link')}
        </Link>{' '}
        <button type="button" onClick={() => fileInput.current?.click()}>
          ⭱ {t('common_upload_oscal')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
          data-testid="profile-upload-input"
          hidden
        />
      </div>

      {loading && <p>{t('common_loading')}</p>}

      {!loading && items.length === 0 && (
        <p data-testid="profile-empty">📂 {t('profile_empty')}</p>
      )}

      {items.length > 0 && (
        <p>
          <label>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => selectAll(items.map((r) => r.uuid))}
              data-testid="profile-select-all"
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
        testIdPrefix="profile"
      />

      <ul>
        {items.map((r) => (
          <li key={r.uuid} data-testid="profile-item">
            <input
              type="checkbox"
              checked={selected.has(r.uuid)}
              onChange={() => toggleSelected(r.uuid)}
              aria-label={t('bulk_select_item', { title: r.artifact.metadata.title })}
              data-testid="profile-select-item"
            />{' '}
            <Link to={`/profiles/${r.uuid}`}>{r.artifact.metadata.title}</Link> <small>({r.origin})</small>{' '}
            <button
              type="button"
              onClick={() => void remove(r.uuid)}
              aria-label={t('profile_delete', { title: r.artifact.metadata.title })}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
