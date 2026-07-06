/**
 * OSCAL component `type` allowed values (component-definition defined-component). The list is
 * suggested, not closed — custom values are permitted (allow-other). Source: NIST OSCAL v1.2.2
 * metaschema `allowed-values-component-type`. Decision IDs: ADR-0003.
 */
export interface ComponentTypeOption {
  value: string;
  description: string;
}

export const COMPONENT_TYPES: ComponentTypeOption[] = [
  { value: 'interconnection', description: 'A connection to something outside this system.' },
  { value: 'software', description: 'Any software, operating system, or firmware.' },
  { value: 'hardware', description: 'A physical device.' },
  { value: 'service', description: 'A service that may provide APIs.' },
  { value: 'policy', description: 'An enforceable policy.' },
  { value: 'physical', description: 'A tangible asset used to provide physical protections or countermeasures.' },
  { value: 'process-procedure', description: 'A list of steps or actions to take to achieve some end result.' },
  { value: 'plan', description: 'An applicable plan.' },
  { value: 'guidance', description: 'Any guideline or recommendation.' },
  { value: 'standard', description: 'Any organizational or industry standard.' },
  { value: 'validation', description: 'An external assessment performed on some other component, validated by a third-party.' },
];
