// Landing hub (T-040). Decision IDs: ADR-0006, ADR-0010, ADR-0011, ADR-0012, ADR-0026, ADR-0029.
// Cards are grouped by OSCAL layer; priority features (component-definitions, SSPs)
// live in the implementation layer. Each active card carries its ADR-0011 symbol, a one-line
// description, and either a workspace artifact count or contextual empty-state guidance
// (ADR-0006) — a count of 0 is more useful as "how do I get started" than as a bare "0".
import { useEffect } from 'react';
import { useI18n } from '@/shared/i18n';
import { useAssetsStore } from '@/features/assets/store';
import { useArtifactCounts } from '@/features/shared/useArtifactCounts';
import { navigationGroups, LAYER_TITLE_KEY, type FeatureCard } from './navigation';
import { heroBackgroundUrl } from './heroBackground';

export function LandingPage() {
  const { t } = useI18n();
  const { assets, load } = useAssetsStore();
  const hasAssets = assets.length > 0;
  const counts = useArtifactCounts();

  useEffect(() => {
    void load();
  }, [load]);

  function countOrHint(feature: FeatureCard) {
    // Assets isn't an OSCAL artifact type (ADR-0026) — its count comes from the assets store
    // already loaded above, not useArtifactCounts.
    const count = feature.path === '/assets' ? assets.length : feature.artifactType ? counts[feature.artifactType] : undefined;
    if (count === undefined) return null; // not applicable, or still loading
    if (count === 0) {
      return feature.emptyStateKey ? (
        <span className="feature-card-hint" data-testid="feature-card-empty-hint">
          {t(feature.emptyStateKey)}
        </span>
      ) : null;
    }
    return (
      <span className="feature-card-count" data-testid="feature-card-count">
        {t('landing_artifact_count', { count })}
      </span>
    );
  }

  return (
    <main>
      <header
        className="landing-hero"
        data-testid="landing-hero"
        style={{ backgroundImage: `url(${heroBackgroundUrl()})` }}
      >
        <h1>{t('app_title')}</h1>
        <p className="landing-tagline">{t('app_tagline')}</p>
      </header>
      {navigationGroups(hasAssets).map((group) => (
        <section key={group.layer} data-layer={group.layer}>
          <h2>{t(LAYER_TITLE_KEY[group.layer])}</h2>
          <ul className="feature-cards">
            {group.features.map((f) =>
              f.disabled ? (
                <li key={f.path} className="feature-card feature-card--disabled" data-testid="feature-card-disabled">
                  <span className="feature-card-symbol" aria-hidden="true">
                    {f.symbol}
                  </span>
                  <span className="feature-card-body">
                    <span aria-disabled="true" title={f.disabledTitleKey ? t(f.disabledTitleKey) : undefined}>
                      {t(f.titleKey)}
                    </span>
                    <span className="feature-card-desc">{t(f.descriptionKey)}</span>
                  </span>
                </li>
              ) : (
                <li key={f.path} className={`feature-card${f.priority ? ' priority' : ''}`}>
                  <a href={`#${f.path}`}>
                    <span className="feature-card-symbol" aria-hidden="true">
                      {f.symbol}
                    </span>
                    <span className="feature-card-body">
                      <span className="feature-card-title">
                        {t(f.titleKey)}
                        {f.priority ? <span className="priority-badge"> ★</span> : null}
                      </span>
                      <span className="feature-card-desc">{t(f.descriptionKey)}</span>
                      {countOrHint(f)}
                    </span>
                  </a>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </main>
  );
}
