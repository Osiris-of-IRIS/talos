// Component-definition list + upload. Decision IDs: ADR-0006, ADR-0004, ADR-0014 (feature IMPL-001).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useComponentDefinitionsStore } from './store';
import { useI18n } from '@/shared/i18n';

export function ComponentDefinitionsListPage() {
  const { t } = useI18n();
  const { items, loading, error, warnings, load, importFromText, remove } = useComponentDefinitionsStore();
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
      const text = await file.text();
      await importFromText(text);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      e.target.value = '';
    }
  }

  return (
    <main data-testid="compdef-list">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>🧩 {t('landing_feature_component_definitions')}</h1>

      <div>
        <Link to="/component-definitions/new" data-testid="compdef-new">
          ➕ {t('cdef_new')}
        </Link>{' '}
        <button type="button" onClick={() => fileInput.current?.click()}>
          ⭱ {t('common_upload_oscal')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
          data-testid="compdef-upload-input"
          hidden
        />
      </div>

      {uploadError && (
        <p role="alert" data-testid="compdef-upload-error">
          ⚠️ {uploadError}
        </p>
      )}
      {error && <p role="alert">⚠️ {error}</p>}
      {warnings.length > 0 && (
        <p role="status" data-testid="compdef-upload-warning" style={{ color: 'var(--color-warning, #a15c00)' }}>
          ⚠️ {warnings.join(' ')}
        </p>
      )}
      {loading && <p>{t('common_loading')}</p>}

      {!loading && items.length === 0 && (
        <p data-testid="compdef-empty">📂 {t('cdef_empty')}</p>
      )}

      <ul>
        {items.map((r) => (
          <li key={r.uuid} data-testid="compdef-item">
            <Link to={`/component-definitions/${r.uuid}`}>{r.artifact.metadata.title}</Link>{' '}
            <small>({r.origin})</small>{' '}
            <button
              type="button"
              onClick={() => void remove(r.uuid)}
              aria-label={t('cdef_delete', { title: r.artifact.metadata.title })}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
