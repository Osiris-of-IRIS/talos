// Primary navigation data, shared by the landing page's card grid and the sidebar (ADR-0029)
// so the two never drift out of sync. Decision IDs: ADR-0006, ADR-0012, ADR-0026, ADR-0029.
export type LayerId = 'Data' | 'Control' | 'Implementation' | 'Assessment' | 'Assistants';

export interface FeatureCard {
  titleKey: string;
  path: string;
  priority?: boolean;
  /** When true, renders disabled with `disabledTitleKey` as a hover explanation (ADR-0026). */
  disabled?: boolean;
  disabledTitleKey?: string;
}

export interface FeatureGroup {
  layer: LayerId;
  features: FeatureCard[];
}

export const LAYER_TITLE_KEY: Record<LayerId, string> = {
  Data: 'landing_layer_data',
  Control: 'landing_layer_control',
  Implementation: 'landing_layer_implementation',
  Assessment: 'landing_layer_assessment',
  Assistants: 'landing_layer_assistants',
};

export function navigationGroups(hasAssets: boolean): FeatureGroup[] {
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
        { titleKey: 'landing_feature_profile_assistant', path: '/profiles/assistant' },
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
