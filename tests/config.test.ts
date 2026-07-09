// Covers TEST-CONFIG-01 (runtime config schema validation, fail-fast on invalid config, T-025)
import { describe, it, expect } from 'vitest';
import { TALOS_CONFIG, validateConfig, type TalosConfig } from '@/config';
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';

function withOverride(overrides: Partial<TalosConfig>): TalosConfig {
  return { ...TALOS_CONFIG, ...overrides } as TalosConfig;
}

describe('validateConfig', () => {
  it('accepts the real app config with no errors', () => {
    expect(validateConfig(TALOS_CONFIG)).toEqual([]);
  });

  it('rejects a basePath that does not start with "/"', () => {
    const errors = validateConfig(withOverride({ basePath: 'talos/' }));
    expect(errors.some((e) => e.includes('basePath'))).toBe(true);
  });

  it('rejects a non-absolute library.rawBase URL', () => {
    const errors = validateConfig(
      withOverride({ library: { ...TALOS_CONFIG.library, rawBase: 'not-a-url' } }),
    );
    expect(errors.some((e) => e.includes('library.rawBase'))).toBe(true);
  });

  it('rejects a non-absolute viewerUrl', () => {
    const errors = validateConfig(withOverride({ viewerUrl: 'ftp://bad-scheme' }));
    expect(errors.some((e) => e.includes('viewerUrl'))).toBe(true);
  });

  it('rejects a defaultLanguage outside de/en', () => {
    const errors = validateConfig(
      withOverride({ defaultLanguage: 'fr' as unknown as TalosConfig['defaultLanguage'] }),
    );
    expect(errors.some((e) => e.includes('defaultLanguage'))).toBe(true);
  });

  it('rejects an oscalVersion other than the authoring version', () => {
    const errors = validateConfig(
      withOverride({ oscalVersion: '1.2.0' as unknown as TalosConfig['oscalVersion'] }),
    );
    expect(errors.some((e) => e.includes('oscalVersion'))).toBe(true);
    expect(errors.some((e) => e.includes(OSCAL_AUTHORING_VERSION))).toBe(true);
  });

  it('rejects a zero or negative backMatter.maxEmbeddedFileBytes', () => {
    const zero = validateConfig(withOverride({ backMatter: { maxEmbeddedFileBytes: 0 } }));
    const negative = validateConfig(withOverride({ backMatter: { maxEmbeddedFileBytes: -1 } }));
    expect(zero.some((e) => e.includes('maxEmbeddedFileBytes'))).toBe(true);
    expect(negative.some((e) => e.includes('maxEmbeddedFileBytes'))).toBe(true);
  });

  it('rejects a non-integer backMatter.maxEmbeddedFileBytes', () => {
    const errors = validateConfig(withOverride({ backMatter: { maxEmbeddedFileBytes: 1.5 } }));
    expect(errors.some((e) => e.includes('maxEmbeddedFileBytes'))).toBe(true);
  });

  it('collects every violation in one pass rather than stopping at the first', () => {
    const errors = validateConfig(
      withOverride({
        basePath: 'talos/',
        viewerUrl: 'not-a-url',
        defaultLanguage: 'fr' as unknown as TalosConfig['defaultLanguage'],
      }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
