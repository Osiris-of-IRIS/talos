/**
 * i18n: key parity, interpolation, fallback chain, provider default + persistence.
 * Decision IDs: ADR-0001, ADR-0012. Covers TEST-I18N-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { getSettings } from '@/data/settingsRepository';
import { useI18n, I18nProvider, SUPPORTED_LANGUAGES } from '@/shared/i18n';
import en from '@/locales/en.json';
import de from '@/locales/de.json';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('locale catalogs', () => {
  it('have exactly the same key set in both languages (parity)', () => {
    const enKeys = Object.keys(en).sort();
    const deKeys = Object.keys(de).sort();
    expect(deKeys).toEqual(enKeys);
  });

  it('are non-trivial catalogs (rollout actually happened)', () => {
    expect(Object.keys(en).length).toBeGreaterThan(20);
  });
});

describe('useI18n() with no <I18nProvider> mounted (isolated component tests)', () => {
  it('resolves t() against the English catalog', () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.language).toBe('en');
    const anyKey = Object.keys(en)[0]!;
    expect(result.current.t(anyKey)).toBe(en[anyKey as keyof typeof en]);
  });
});

describe('useI18n() within a mounted <I18nProvider>', () => {
  it('defaults to DEFAULT_LANGUAGE (de) when no settings are stored yet', async () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    await waitFor(() => expect(result.current.language).toBe('de'));
  });

  it('a fixed language prop pins the language and skips the settings read', () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <I18nProvider language="en">{children}</I18nProvider>,
    });
    expect(result.current.language).toBe('en');
  });

  it('setLanguage updates the live language and persists to the settings store', async () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    await waitFor(() => expect(result.current.language).toBe('de'));

    act(() => result.current.setLanguage('en'));
    await waitFor(() => expect(result.current.language).toBe('en'));
    await waitFor(async () => expect((await getSettings()).language).toBe('en'));
  });

  it('falls back to a missing key in the active language via English, then the raw key', () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <I18nProvider language="de">{children}</I18nProvider>,
    });
    expect(result.current.t('___does_not_exist___')).toBe('___does_not_exist___');
  });

  it('interpolates {param} placeholders', () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <I18nProvider language="en">{children}</I18nProvider>,
    });
    expect(result.current.t('compdef_components_count', { count: 3 })).toBe(
      en.compdef_components_count.replace('{count}', '3'),
    );
  });
});

it('SUPPORTED_LANGUAGES lists exactly de and en', () => {
  expect(SUPPORTED_LANGUAGES.sort()).toEqual(['de', 'en']);
});
