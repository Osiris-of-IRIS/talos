// BSI library browser: list read-only library artifacts, adopt into the workspace.
// Decision IDs: ADR-0005, ADR-0006, ADR-0010, ADR-0012.
import { Link } from 'react-router-dom';
import { LIBRARY_LICENSE } from '@/config';
import { getLibraryManifest } from '@/data/libraryLoader';
import { useLibraryStore } from './store';
import { useI18n } from '@/shared/i18n';

const DEFAULT_CATEGORIES = new Set(['Anwenderkatalog', 'Komponente']);

export function LibraryPage() {
  const { t } = useI18n();
  const { items, showAdvanced, busyPath, warning, error, adoptedTitle, toggleAdvanced, adopt } =
    useLibraryStore();
  const manifest = getLibraryManifest();
  const visible = items.filter((e) => showAdvanced || DEFAULT_CATEGORIES.has(e.category));

  return (
    <main data-testid="library">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>📚 {t('landing_feature_library')}</h1>
      <p data-testid="library-attribution">
        <small>
          {t('library_attribution_intro')}{' '}
          <a href={manifest.source} target="_blank" rel="noopener noreferrer">
            {t('library_attribution_source_link')}
          </a>
          {t('library_attribution_license', { license: LIBRARY_LICENSE })}{' '}
          <strong>{t('library_readonly')}</strong>
          {t('library_attribution_adopt_note')}
        </small>
      </p>

      <label>
        <input
          type="checkbox"
          data-testid="library-advanced-toggle"
          checked={showAdvanced}
          onChange={toggleAdvanced}
        />{' '}
        {t('library_show_advanced')}
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
          ✓ {t('library_adopted_status', { title: adoptedTitle })}
        </p>
      )}

      <ul data-testid="library-list">
        {visible.map((e) => (
          <li key={e.path} data-testid="library-item">
            <strong>{e.title}</strong> <small>[{e.artifactType}]</small>{' '}
            <span
              data-testid="library-badge"
              style={{ color: 'var(--color-impl-muted, #6b7f6b)' }}
              title={t('library_badge_title')}
            >
              📚 {t('library_readonly')}
            </span>{' '}
            <small>({e.category})</small>{' '}
            <button
              type="button"
              aria-label={t('library_adopt_aria', { title: e.title })}
              disabled={busyPath === e.path}
              onClick={() => void adopt(e)}
            >
              {busyPath === e.path ? '…' : `⭳ ${t('library_adopt_button')}`}
            </button>
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p data-testid="library-empty">{t('library_empty')}</p>}
    </main>
  );
}
