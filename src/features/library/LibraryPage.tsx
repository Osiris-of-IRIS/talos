// BSI library browser: list read-only library artifacts, adopt into the workspace.
// Decision IDs: ADR-0005, ADR-0006, ADR-0010.
import { Link } from 'react-router-dom';
import { LIBRARY_LICENSE } from '@/config';
import { getLibraryManifest } from '@/data/libraryLoader';
import { useLibraryStore } from './store';

const DEFAULT_CATEGORIES = new Set(['Anwenderkatalog', 'Komponente']);

export function LibraryPage() {
  const { items, showAdvanced, busyPath, warning, error, adoptedTitle, toggleAdvanced, adopt } =
    useLibraryStore();
  const manifest = getLibraryManifest();
  const visible = items.filter((e) => showAdvanced || DEFAULT_CATEGORIES.has(e.category));

  return (
    <main data-testid="library">
      <p>
        <Link to="/">← TALOS</Link>
      </p>
      <h1>📚 BSI-Bibliothek</h1>
      <p data-testid="library-attribution">
        <small>
          Stand-der-Technik-Bibliothek des BSI —{' '}
          <a href={manifest.source} target="_blank" rel="noopener noreferrer">
            Quelle
          </a>
          . Lizenz: {LIBRARY_LICENSE}. Bibliotheks­inhalte sind <strong>schreibgeschützt</strong>;
          „Übernehmen" kopiert eine bearbeitbare Fassung in Ihren Arbeitsbereich.
        </small>
      </p>

      <label>
        <input
          type="checkbox"
          data-testid="library-advanced-toggle"
          checked={showAdvanced}
          onChange={toggleAdvanced}
        />{' '}
        Quellkataloge anzeigen (erweitert)
      </label>

      {error && (
        <p role="alert" data-testid="library-error" style={{ color: 'var(--color-error, #cf222e)' }}>
          ⚠️ {error}
        </p>
      )}
      {warning && (
        <p role="status" data-testid="library-warning" style={{ color: 'var(--color-warning, #a15c00)' }}>
          ⚠️ {warning}
        </p>
      )}
      {adoptedTitle && (
        <p role="status" data-testid="library-adopted" style={{ color: 'var(--color-ok, #1a7f37)' }}>
          ✓ „{adoptedTitle}" in den Arbeitsbereich übernommen.
        </p>
      )}

      <ul data-testid="library-list">
        {visible.map((e) => (
          <li key={e.path} data-testid="library-item">
            <strong>{e.title}</strong> <small>[{e.artifactType}]</small>{' '}
            <span
              data-testid="library-badge"
              style={{ color: 'var(--color-impl-muted, #6b7f6b)' }}
              title="Bibliotheksartefakt — schreibgeschützt"
            >
              📚 read-only
            </span>{' '}
            <small>({e.category})</small>{' '}
            <button
              type="button"
              aria-label={`Adopt ${e.title}`}
              disabled={busyPath === e.path}
              onClick={() => void adopt(e)}
            >
              {busyPath === e.path ? '…' : '⭳ Übernehmen'}
            </button>
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p data-testid="library-empty">Keine Bibliotheksartikel.</p>}
    </main>
  );
}
