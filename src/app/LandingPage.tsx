// Landing hub — full implementation in T-040. Decision IDs: ADR-0006, ADR-0012, ADR-0029.
// Cards are grouped by OSCAL layer; priority features (component-definitions, SSPs)
// live in the implementation layer.
import { useEffect } from 'react';
import { useI18n } from '@/shared/i18n';
import { useAssetsStore } from '@/features/assets/store';
import { navigationGroups, LAYER_TITLE_KEY } from './navigation';
import { heroBackgroundUrl } from './heroBackground';

export function LandingPage() {
  const { t } = useI18n();
  const { assets, load } = useAssetsStore();
  const hasAssets = assets.length > 0;

  useEffect(() => {
    void load();
  }, [load]);

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
                <li
                  key={f.path}
                  className="feature-card feature-card--disabled"
                  data-testid="feature-card-disabled"
                  title={f.disabledTitleKey ? t(f.disabledTitleKey) : undefined}
                >
                  <span aria-disabled="true">{t(f.titleKey)}</span>
                </li>
              ) : (
                <li key={f.path} className={`feature-card${f.priority ? ' priority' : ''}`}>
                  <a href={`#${f.path}`}>
                    {t(f.titleKey)}
                    {f.priority ? <span className="priority-badge"> ★</span> : null}
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
