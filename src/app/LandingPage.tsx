// Landing hub — full implementation in T-040. Decision IDs: ADR-0006, ADR-0012.
// Cards are grouped by OSCAL layer; priority features (component-definitions, SSPs)
// live in the implementation layer.
import { useI18n } from '@/shared/i18n';

type LayerId = 'Data' | 'Control' | 'Implementation' | 'Assessment';

interface FeatureCard {
  titleKey: string;
  path: string;
  priority?: boolean;
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
};

const GROUPS: FeatureGroup[] = [
  {
    layer: 'Data',
    features: [{ titleKey: 'landing_feature_library', path: '/library' }],
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
];

export function LandingPage() {
  const { t } = useI18n();
  return (
    <main>
      <header className="landing-hero">
        <h1>{t('app_title')}</h1>
        <p className="landing-tagline">{t('app_tagline')}</p>
      </header>
      {GROUPS.map((group) => (
        <section key={group.layer} data-layer={group.layer}>
          <h2>{t(LAYER_TITLE_KEY[group.layer])}</h2>
          <ul className="feature-cards">
            {group.features.map((f) => (
              <li key={f.path} className={`feature-card${f.priority ? ' priority' : ''}`}>
                <a href={`#${f.path}`}>
                  {t(f.titleKey)}
                  {f.priority ? <span className="priority-badge"> ★</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
