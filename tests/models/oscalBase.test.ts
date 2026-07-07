/**
 * Import OSCAL-version policy (ADR-0007). Decision IDs: ADR-0001, ADR-0007.
 * Covers TEST-VER-01 (feature_registry PLAT-004).
 */
import { describe, it, expect } from 'vitest';
import { checkImportOscalVersion, OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';

describe('checkImportOscalVersion', () => {
  it('accepts the authoring version 1.2.2 with no warning', () => {
    expect(checkImportOscalVersion('1.2.2')).toBeUndefined();
    expect(OSCAL_AUTHORING_VERSION).toBe('1.2.2');
  });

  it('accepts other 1.x versions with a normalize-on-export warning', () => {
    for (const v of ['1.0.0', '1.1.2', '1.2.0', '1.3']) {
      const warning = checkImportOscalVersion(v);
      expect(warning).toMatch(new RegExp(`${v}.*1\\.2\\.2`));
    }
  });

  it('warns (does not throw) when oscal-version is absent', () => {
    for (const v of [undefined, null, '']) {
      const warning = checkImportOscalVersion(v as unknown);
      expect(warning).toMatch(/no metadata\.oscal-version/i);
    }
  });

  it('rejects non-1.x versions (2.x, 0.x) with a clear error', () => {
    expect(() => checkImportOscalVersion('2.0.0')).toThrow(/1\.x only/);
    expect(() => checkImportOscalVersion('0.9.0')).toThrow(/1\.x only/);
  });

  it('rejects unparseable version strings', () => {
    expect(() => checkImportOscalVersion('draft')).toThrow(/Unrecognized/);
    expect(() => checkImportOscalVersion(1.2 as unknown)).toThrow(/Unrecognized/);
  });
});
