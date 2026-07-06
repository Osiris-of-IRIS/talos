// Catalogs list + upload (read-only sources; viewed externally per ADR-0008). Feature: control layer.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCatalogsStore } from './store';
import { VIEWER_URL } from '@/config';

export function CatalogsListPage() {
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
        <Link to="/">← TALOS</Link>
      </p>
      <h1>📘 Catalogs</h1>
      <p>
        <small>Catalogs are read-only sources; open them in the Stand-der-Technik-Viewer for full browsing.</small>
      </p>

      <div>
        <button type="button" onClick={() => fileInput.current?.click()}>
          ⭱ Upload catalog (OSCAL JSON)
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
      {loading && <p>Loading…</p>}
      {!loading && items.length === 0 && (
        <p data-testid="catalog-empty">📂 No catalogs yet. Upload one, or (soon) load from the BSI library.</p>
      )}

      <ul>
        {items.map((r) => (
          <li key={r.uuid} data-testid="catalog-item">
            {r.artifact.metadata.title} <small>({r.origin})</small>{' '}
            <a href={VIEWER_URL} target="_blank" rel="noopener noreferrer">
              ≡ view in SdT-Viewer
            </a>{' '}
            <button type="button" aria-label={`Delete ${r.artifact.metadata.title}`} onClick={() => void remove(r.uuid)}>
              🗑️
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
