/**
 * Localized wording for OSCAL import warnings/errors (ADR-0007 version policy, ADR-0012 i18n):
 * structured codes from the data layer are rendered from the locale catalogs, never as the
 * English fallback text. Decision IDs: ADR-0001, ADR-0007, ADR-0012.
 * Covers TEST-IMPORTMSG-01 (feature_registry PLAT-004).
 */
import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import { formatImportWarning, importErrorMessage } from '@/shared/importMessages';
import { checkImportOscalVersion, OscalVersionError } from '@/models/oscalBase';
import { UpstreamLoadError } from '@/data/upstreamFetch';
import type { TranslateParams } from '@/shared/i18n';

function tFor(catalog: Record<string, string>) {
  return (key: string, params?: TranslateParams) =>
    (catalog[key] ?? key).replace(/\{(\w+)\}/g, (m, k: string) => (params && k in params ? String(params[k]) : m));
}
const tEn = tFor(en as Record<string, string>);
const tDe = tFor(de as Record<string, string>);

function warningFor(version: unknown) {
  const r = checkImportOscalVersion(version);
  if (r.level !== 'warning') throw new Error('expected a warning');
  return r.warning;
}

describe('formatImportWarning', () => {
  it('renders the off-version warning in English and German', () => {
    const w = warningFor('1.1.2');
    expect(formatImportWarning(tEn, w)).toBe('Imported as OSCAL 1.1.2; exporting will normalize to 1.2.3.');
    expect(formatImportWarning(tDe, w)).toMatch(/1\.1\.2.*1\.2\.3/);
    expect(formatImportWarning(tDe, w)).toMatch(/Export/);
    expect(formatImportWarning(tDe, w)).not.toBe(formatImportWarning(tEn, w));
  });

  it('renders the missing-version warning in both languages', () => {
    const w = warningFor(undefined);
    expect(formatImportWarning(tEn, w)).toMatch(/no metadata\.oscal-version/);
    expect(formatImportWarning(tDe, w)).toMatch(/keine metadata\.oscal-version/);
  });
});

describe('importErrorMessage', () => {
  it('localizes OSCAL version errors', () => {
    let err: unknown;
    try {
      checkImportOscalVersion('2.0.0');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OscalVersionError);
    expect(importErrorMessage(tEn, err)).toMatch(/"2\.0\.0".*1\.x only/);
    expect(importErrorMessage(tDe, err)).toMatch(/2\.0\.0.*nur OSCAL 1\.x/);
  });

  it('delegates upstream failures to the upstream formatter and passes other errors through', () => {
    const upstream = new UpstreamLoadError('raw', {
      resource: 'library-artifact',
      url: 'https://example.org/x.json',
      status: 404,
      detail: 'HTTP 404',
      title: 'Keycloak',
    });
    expect(importErrorMessage(tEn, upstream)).toMatch(/Keycloak.*HTTP 404/);
    expect(importErrorMessage(tEn, new Error('File is not valid JSON.'))).toBe('File is not valid JSON.');
    expect(importErrorMessage(tEn, 'boom')).toBe('boom');
  });
});
