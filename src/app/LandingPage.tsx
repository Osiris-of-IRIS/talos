// Landing hub — full implementation in T-040. Decision IDs: ADR-0006, ADR-0012.
// Cards are grouped by OSCAL layer; priority features (component-definitions, SSPs)
// live in the implementation layer.
import { useEffect, useState } from 'react';
import { useI18n } from '@/shared/i18n';
import { getDb } from '@/data/db';

type LayerId = 'Data' | 'Control' | 'Implementation' | 'Assessment' | 'Assistants';

interface FeatureCard {
  titleKey: string;
  path: string;
  priority?: boolean;
  /** When true, the card renders disabled with `disabledTitleKey` as a hover explanation (ADR-0026). */
  disabled?: boolean;
  disabledTitleKey?: string;
}

interface FeatureGroup {
  layer: LayerId;
  features: FeatureCard[];
}

const LAYER_TITLE_KEY: Record<LayerId, string> = {
  Data: 'landing_layer_data',
  Control: 'landing_layer_control',
  Implementation: 'landing_layer_implementation',
  Assessment: 'landing_layer_assessment',
  Assistants: 'landing_layer_assistants',
};

function groups(hasAssets: boolean): FeatureGroup[] {
  return [
    {
      layer: 'Data',
      features: [
        { titleKey: 'landing_feature_library', path: '/library' },
        { titleKey: 'landing_feature_assets', path: '/assets' },
      ],
    },
    {
      layer: 'Control',
      features: [
        { titleKey: 'landing_feature_catalogs', path: '/catalogs' },
        { titleKey: 'landing_feature_profiles', path: '/profiles' },
      ],
    },
    {
      layer: 'Implementation',
      features: [
        { titleKey: 'landing_feature_component_definitions', path: '/component-definitions', priority: true },
        { titleKey: 'landing_feature_ssps', path: '/ssps', priority: true },
      ],
    },
    {
      layer: 'Assessment',
      features: [
        { titleKey: 'landing_feature_assessment_plans', path: '/assessment-plans' },
        { titleKey: 'landing_feature_assessment_results', path: '/assessment-results' },
        { titleKey: 'landing_feature_poams', path: '/poams' },
      ],
    },
    {
      layer: 'Assistants',
      features: [
        {
          titleKey: 'landing_feature_bootstrap',
          path: '/bootstrap',
          disabled: !hasAssets,
          disabledTitleKey: 'landing_bootstrap_disabled_title',
        },
      ],
    },
  ];
}

export function LandingPage() {
  const { t } = useI18n();
  const [hasAssets, setHasAssets] = useState(false);

  useEffect(() => {
    let active = true;
    void getDb()
      .then((db) => db.count('assets'))
      .then((count) => {
        if (active) setHasAssets(count > 0);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <header className="landing-hero">
        <h1>{t('app_title')}</h1>
        <p className="landing-tagline">{t('app_tagline')}</p>
      </header>
      {groups(hasAssets).map((group) => (
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
