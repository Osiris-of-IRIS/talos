/**
 * Import OSCAL-version policy (ADR-0007, as amended 2026-11-16 by the product owner: authoring
 * 1.2.3; other 1.2.x patch versions import silently at info level; 1.0/1.1 and any other 1.x
 * minor still warn). Decision IDs: ADR-0001, ADR-0007.
 * Covers TEST-VER-01 (feature_registry PLAT-004).
 */
import { describe, it, expect } from 'vitest';
import {
  checkImportOscalVersion,
  OSCAL_AUTHORING_VERSION,
  OscalVersionError,
} from '@/models/oscalBase';

describe('checkImportOscalVersion', () => {
  it('authors and exports OSCAL 1.2.3', () => {
    expect(OSCAL_AUTHORING_VERSION).toBe('1.2.3');
  });

  it('accepts the authoring version 1.2.3 with nothing to report', () => {
    expect(checkImportOscalVersion('1.2.3')).toEqual({ level: 'none' });
  });

  it('accepts other 1.2.x patch versions with no warning (info level only)', () => {
    for (const v of ['1.2.0', '1.2.1', '1.2.2', '1.2.9']) {
      expect(checkImportOscalVersion(v)).toEqual({ level: 'info', version: v });
    }
  });

  it('warns for 1.0, 1.1 and any other 1.x minor (normalize-on-export warning)', () => {
    for (const v of ['1.0.0', '1.0.4', '1.1.2', '1.1.3', '1.3', '1.3.0', '1.20.0']) {
      const result = checkImportOscalVersion(v);
      expect(result.level).toBe('warning');
      if (result.level !== 'warning') continue;
      expect(result.warning.code).toBe('oscal-version-other');
      expect(result.warning.params).toEqual({ version: v, target: '1.2.3' });
      // English rendering for logs / non-UI callers
      expect(result.warning.message).toMatch(new RegExp(`${v.replace(/\./g, '\\.')}.*1\\.2\\.3`));
    }
  });

  it('does not mistake a 1.2-prefixed minor (1.20, 1.21) for a 1.2.x patch', () => {
    expect(checkImportOscalVersion('1.21.0').level).toBe('warning');
  });

  it('warns (does not throw) when oscal-version is absent', () => {
    for (const v of [undefined, null, '']) {
      const result = checkImportOscalVersion(v as unknown);
      expect(result.level).toBe('warning');
      if (result.level !== 'warning') continue;
      expect(result.warning.code).toBe('oscal-version-missing');
      expect(result.warning.params).toEqual({ target: '1.2.3' });
      expect(result.warning.message).toMatch(/no metadata\.oscal-version/i);
    }
  });

  it('rejects non-1.x versions (2.x, 0.x) with a structured, clear error', () => {
    for (const v of ['2.0.0', '0.9.0']) {
      let caught: unknown;
      try {
        checkImportOscalVersion(v);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(OscalVersionError);
      const err = caught as OscalVersionError;
      expect(err.code).toBe('oscal-version-unsupported');
      expect(err.params).toEqual({ version: v, target: '1.2.3' });
      expect(err.message).toMatch(/1\.x only/);
    }
  });

  it('rejects unparseable version strings with a structured error', () => {
    for (const v of ['draft', 1.2 as unknown]) {
      let caught: unknown;
      try {
        checkImportOscalVersion(v);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(OscalVersionError);
      expect((caught as OscalVersionError).code).toBe('oscal-version-unrecognized');
      expect((caught as OscalVersionError).message).toMatch(/Unrecognized/);
    }
  });
});
