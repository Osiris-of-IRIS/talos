/**
 * App-wide search (T-036 follow-up, ADR-0013): a persistent sidebar search box, backed by
 * `useEntitySearch` in `types` mode across every artifact type with a real detail page. Unlike
 * `<EntitySearchField>` (a controlled form-field value), this is fire-and-forget — there's no
 * value to hold, typing just narrows a dropdown, and picking a result navigates straight to that
 * artifact's detail page and resets the box, ready for the next search.
 *
 * Catalogs have no per-item detail route (T-142's `/catalogs` is list-only), so a catalog result
 * routes to the list page instead of a `:uuid` detail path.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import { useEntitySearch, type ArtifactSearchData, type SearchItem } from '@/shared/useEntitySearch';
import type { OscalArtifactType } from '@/models/oscalBase';
import './globalSearch.css';

const SEARCHABLE_TYPES: OscalArtifactType[] = ['catalog', 'componentDefinition', 'systemSecurityPlan'];

const TYPE_LABEL_KEY: Record<OscalArtifactType, string> = {
  catalog: 'landing_feature_catalogs',
  profile: 'landing_feature_profiles',
  componentDefinition: 'landing_feature_component_definitions',
  systemSecurityPlan: 'landing_feature_ssps',
  assessmentPlan: 'landing_feature_assessment_plans',
  assessmentResults: 'landing_feature_assessment_results',
  planOfActionAndMilestones: 'landing_feature_poams',
};

function detailPathFor(data: ArtifactSearchData): string {
  switch (data.type) {
    case 'componentDefinition':
      return `/component-definitions/${data.uuid}`;
    case 'systemSecurityPlan':
      return `/ssps/${data.uuid}`;
    case 'catalog':
    default:
      return '/catalogs';
  }
}

export function GlobalSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const { query, setQuery, results, refresh } = useEntitySearch({ types: SEARCHABLE_TYPES });

  function select(item: SearchItem) {
    setQuery('');
    setOpen(false);
    navigate(detailPathFor(item.data as ArtifactSearchData));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[highlighted];
      if (item) select(item);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showResults = open && query.trim().length > 0;

  return (
    <div className="global-search entity-search">
      <input
        data-testid="global-search-input"
        aria-label={t('global_search_aria')}
        placeholder={t('global_search_placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          // <GlobalSearch> lives in the sidebar for the whole app session — it never remounts on
          // hash-only route changes, so the IndexedDB-backed index (fetched once on mount by
          // useEntitySearch) would otherwise go stale the moment any artifact is created/edited
          // after first paint.
          void refresh();
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showResults && (
        <ul className="entity-search-results" data-testid="global-search-results">
          {results.length === 0 ? (
            <li className="global-search-empty">{t('global_search_no_results')}</li>
          ) : (
            results.map((item, i) => {
              const data = item.data as ArtifactSearchData;
              return (
                <li
                  key={item.id}
                  data-testid="es-result"
                  className={i === highlighted ? 'entity-search-result--highlighted' : undefined}
                  // mousedown (not click) fires before the input's onBlur closes the dropdown.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(item);
                  }}
                >
                  {item.title}
                  <small> ({t(TYPE_LABEL_KEY[data.type])})</small>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
