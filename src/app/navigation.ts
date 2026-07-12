// Primary navigation data, shared by the landing page's card grid and the sidebar (ADR-0029)
// so the two never drift out of sync. Decision IDs: ADR-0006, ADR-0011, ADR-0012, ADR-0026, ADR-0029.
import type { OscalArtifactType } from '@/models/oscalBase';

export type LayerId = 'Data' | 'Control' | 'Implementation' | 'Assessment' | 'Assistants' | 'Dashboard';

export interface FeatureCard {
  titleKey: string;
  descriptionKey: string;
  path: string;
  /** ADR-0011 registry symbol, paired with the text label — never symbol-only. */
  symbol: string;
  priority?: boolean;
  /** When true, renders disabled with `disabledTitleKey` as a hover explanation (ADR-0026). */
  disabled?: boolean;
  disabledTitleKey?: string;
  /** Workspace record count source (ADR-0006) — omit for cards with no natural count (Library, Assistants, disabled placeholders). */
  artifactType?: OscalArtifactType;
  /** i18n key for empty-state guidance (ADR-0006), shown instead of the count badge when the count is 0. */
  emptyStateKey?: string;
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
  Dashboard: 'landing_layer_dashboard',
};

export function navigationGroups(hasAssets: boolean): FeatureGroup[] {
  return [
    {
      layer: 'Data',
      features: [
        { titleKey: 'landing_feature_library', descriptionKey: 'landing_feature_library_desc', path: '/library', symbol: '📚' },
        {
          titleKey: 'landing_feature_assets',
          descriptionKey: 'landing_feature_assets_desc',
          path: '/assets',
          symbol: '📦',
          emptyStateKey: 'assets_empty',
        },
      ],
    },
    {
      layer: 'Control',
      features: [
        {
          titleKey: 'landing_feature_catalogs',
          descriptionKey: 'landing_feature_catalogs_desc',
          path: '/catalogs',
          symbol: '📘',
          artifactType: 'catalog',
          emptyStateKey: 'catalog_empty',
        },
        {
          titleKey: 'landing_feature_profiles',
          descriptionKey: 'landing_feature_profiles_desc',
          path: '/profiles',
          symbol: '🎛️',
          artifactType: 'profile',
          emptyStateKey: 'profile_empty',
        },
      ],
    },
    {
      layer: 'Implementation',
      features: [
        {
          titleKey: 'landing_feature_component_definitions',
          descriptionKey: 'landing_feature_component_definitions_desc',
          path: '/component-definitions',
          symbol: '🧩',
          priority: true,
          artifactType: 'componentDefinition',
          emptyStateKey: 'cdef_empty',
        },
        {
          titleKey: 'landing_feature_ssps',
          descriptionKey: 'landing_feature_ssps_desc',
          path: '/ssps',
          symbol: '🖥️',
          priority: true,
          artifactType: 'systemSecurityPlan',
          emptyStateKey: 'ssp_empty',
        },
      ],
    },
    {
      layer: 'Assessment',
      features: [
        {
          titleKey: 'landing_feature_assessment_plans',
          descriptionKey: 'landing_feature_assessment_plans_desc',
          path: '/assessment-plans',
          symbol: '📋',
          disabled: true,
          disabledTitleKey: 'landing_coming_soon_title',
        },
        {
          titleKey: 'landing_feature_assessment_results',
          descriptionKey: 'landing_feature_assessment_results_desc',
          path: '/assessment-results',
          symbol: '✅',
          disabled: true,
          disabledTitleKey: 'landing_coming_soon_title',
        },
        {
          titleKey: 'landing_feature_poams',
          descriptionKey: 'landing_feature_poams_desc',
          path: '/poams',
          symbol: '🛠️',
          disabled: true,
          disabledTitleKey: 'landing_coming_soon_title',
        },
      ],
    },
    {
      layer: 'Assistants',
      features: [
        {
          titleKey: 'landing_feature_profile_assistant',
          descriptionKey: 'landing_feature_profile_assistant_desc',
          path: '/profiles/assistant',
          symbol: '✦',
        },
        {
          titleKey: 'landing_feature_bootstrap',
          descriptionKey: 'landing_feature_bootstrap_desc',
          path: '/bootstrap',
          symbol: '✦',
          disabled: !hasAssets,
          disabledTitleKey: 'landing_bootstrap_disabled_title',
        },
      ],
    },
    {
      layer: 'Dashboard',
      features: [
        {
          titleKey: 'landing_feature_dashboard',
          descriptionKey: 'landing_feature_dashboard_desc',
          path: '/dashboard',
          symbol: '📊',
          disabled: true,
          disabledTitleKey: 'landing_coming_soon_title',
        },
      ],
    },
  ];
}
