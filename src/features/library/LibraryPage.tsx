// BSI library browser: list read-only library artifacts, adopt into the workspace.
// Decision IDs: ADR-0005, ADR-0006, ADR-0010, ADR-0012.
import { Link } from 'react-router-dom';
import { LIBRARY_LICENSE } from '@/config';
import { getLibraryManifest, type LibraryManifestEntry } from '@/data/libraryLoader';
import { useLibraryStore } from './store';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';

const DEFAULT_CATEGORIES = new Set(['Anwenderkatalog', 'Komponente']);

export function LibraryPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { items, showAdvanced, busyPath, toggleAdvanced, adopt } = useLibraryStore();
  const manifest = getLibraryManifest();
  const visible = items.filter((e) => showAdvanced || DEFAULT_CATEGORIES.has(e.category));

  async function onAdopt(entry: LibraryManifestEntry) {
    await adopt(entry);
    const { error, warning, adoptedTitle } = useLibraryStore.getState();
    if (error) {
      showToast(error, 'error');
      return;
    }
    if (warning) showToast(warning, 'warning');
    if (adoptedTitle) showToast(t('library_adopted_status', { title: adoptedTitle }), 'success');
  }

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
              onClick={() => void onAdopt(e)}
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
