/**
 * OSCAL component `type` allowed values (component-definition defined-component and SSP
 * system-component share the list since 1.2.3). The list is suggested, not closed — custom values
 * are permitted (allow-other). Source: NIST OSCAL v1.2.3 metaschema
 * `shared-constraints/allowed-values-component-type.ent`, in its order.
 *
 * Descriptions are UI copy (datalist labels), so they live in the locale catalogs under
 * `labelKey` (ADR-0012); the English catalog carries NIST's wording verbatim (TEST-COMPTYPE-01).
 * Decision IDs: ADR-0003, ADR-0007, ADR-0012.
 */
export interface ComponentTypeOption {
  value: string;
  /** i18n key of the human-readable description, e.g. `component_type_desc_network`. */
  labelKey: string;
}

function option(value: string): ComponentTypeOption {
  return { value, labelKey: `component_type_desc_${value.replace(/-/g, '_')}` };
}

export const COMPONENT_TYPES: readonly ComponentTypeOption[] = [
  option('interconnection'),
  option('software'),
  option('hardware'),
  option('service'),
  option('policy'),
  option('physical'),
  option('process-procedure'),
  option('plan'),
  option('guidance'),
  option('standard'),
  option('validation'),
  // added to the shared list in OSCAL 1.2.3 (network was SSP-only before)
  option('region'),
  option('zone'),
  option('resource-container'),
  option('network'),
];

/** Datalist options (`value` + localized description) for the component-type pickers. */
export function componentTypeOptions(
  t: (key: string) => string,
): { value: string; label: string }[] {
  return COMPONENT_TYPES.map((ct) => ({ value: ct.value, label: t(ct.labelKey) }));
}
