/**
 * OSCAL component `type` suggestions match the NIST OSCAL v1.2.3 allowed-values list (in order),
 * and every description is a localized UI string (ADR-0012), with the English catalog carrying
 * NIST's own wording. Decision IDs: ADR-0001, ADR-0003, ADR-0007, ADR-0012.
 * Covers TEST-COMPTYPE-01 (feature_registry IMPL-001).
 */
import { describe, it, expect } from 'vitest';
import { COMPONENT_TYPES } from '@/models/componentTypes';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import nist from '../data/oscal-1.2.3-component-types.json';

const EN = en as Record<string, string>;
const DE = de as Record<string, string>;

describe('COMPONENT_TYPES (OSCAL 1.2.3)', () => {
  it('lists exactly the 15 NIST 1.2.3 values in metaschema order', () => {
    expect(COMPONENT_TYPES.map((c) => c.value)).toEqual(nist.values.map((v) => v.value));
    expect(COMPONENT_TYPES).toHaveLength(15);
  });

  it('includes the values added in 1.2.3 (region, zone, resource-container, network)', () => {
    const values = COMPONENT_TYPES.map((c) => c.value);
    for (const v of ['region', 'zone', 'resource-container', 'network']) expect(values).toContain(v);
  });

  it('carries an i18n key per value (no hard-coded description), present in en and de', () => {
    for (const c of COMPONENT_TYPES) {
      expect(c).not.toHaveProperty('description');
      expect(c.labelKey).toMatch(/^component_type_desc_[a-z_]+$/);
      expect(EN[c.labelKey], c.labelKey).toBeTruthy();
      expect(DE[c.labelKey], c.labelKey).toBeTruthy();
    }
  });

  it('the English catalog uses the NIST 1.2.3 description verbatim', () => {
    for (const { value, description } of nist.values) {
      const c = COMPONENT_TYPES.find((x) => x.value === value)!;
      expect(EN[c.labelKey]).toBe(description);
    }
  });
});
