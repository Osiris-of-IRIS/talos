// Catalogs list + upload (read-only sources; viewed externally per ADR-0008). Feature: control layer.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCatalogsStore } from './store';
import { VIEWER_URL } from '@/config';
import { useI18n } from '@/shared/i18n';

export function CatalogsListPage() {
  const { t } = useI18n();
  const { items, loading, error, warnings, load, importFromText, remove } = useCatalogsStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

      <ul>
        {items.map((r) => (
          <li key={r.uuid} data-testid="catalog-item">
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
