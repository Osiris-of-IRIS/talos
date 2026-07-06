// SSP list + upload. Decision IDs: ADR-0006, ADR-0004 (feature IMPL-002).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSspsStore } from './store';

export function SspListPage() {
  const { items, loading, error, warnings, load, importFromText, remove } = useSspsStore();
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
    <main data-testid="ssp-list">
      <p>
        <Link to="/">← TALOS</Link>
      </p>
      <h1>🖥️ System Security Plans</h1>

      <div>
        <button type="button" onClick={() => fileInput.current?.click()}>
          ⭱ Upload OSCAL file
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
      {loading && <p>Loading…</p>}

      {!loading && items.length === 0 && (
        <p data-testid="ssp-empty">📂 No system security plans yet. Upload an OSCAL file to start.</p>
      )}

      <ul>
        {items.map((r) => (
          <li key={r.uuid} data-testid="ssp-item">
            <Link to={`/ssps/${r.uuid}`}>{r.artifact.metadata.title}</Link> <small>({r.origin})</small>{' '}
            <button
              type="button"
              onClick={() => void remove(r.uuid)}
              aria-label={`Delete ${r.artifact.metadata.title}`}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
