/**
 * Lightweight i18n: flat JSON catalogs + a `t(key, params?)` context. Decision IDs: ADR-0012.
 *
 * Missing key -> English -> raw key, so a missing translation never breaks the UI. The context's
 * *default* value (used when no <I18nProvider> is mounted, e.g. isolated component tests)
 * resolves against the English catalog too — the same fallback tier, one level up. The real app
 * always mounts exactly one <I18nProvider> at the root (src/app/App.tsx), which loads the
 * persisted preference from the settings store (ADR-0004) and defaults to DEFAULT_LANGUAGE.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_LANGUAGE } from '@/config';
import { getSettings, saveSettings } from '@/data/settingsRepository';
import en from '@/locales/en.json';
import de from '@/locales/de.json';

export type Language = 'de' | 'en';
export const SUPPORTED_LANGUAGES: Language[] = ['de', 'en'];

type Catalog = Record<string, string>;
const CATALOGS: Record<Language, Catalog> = { en, de };

export type TranslateParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

function translate(language: Language, key: string, params?: TranslateParams): string {
  const template = CATALOGS[language][key] ?? CATALOGS.en[key] ?? key;
  return interpolate(template, params);
}

interface I18nContextValue {
  language: Language;
  t: (key: string, params?: TranslateParams) => string;
  setLanguage: (lang: Language) => void;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: (key, params) => translate('en', key, params),
  setLanguage: () => {},
});

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

interface I18nProviderProps {
  children: ReactNode;
  /** Test-only override: pins the language and skips the async settings read/persist. */
  language?: Language;
}

export function I18nProvider({ children, language: fixedLanguage }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(fixedLanguage ?? DEFAULT_LANGUAGE);

  useEffect(() => {
    if (fixedLanguage) return;
    let active = true;
    void getSettings().then((s) => {
      if (active) setLanguageState(s.language);
    });
    return () => {
      active = false;
    };
  }, [fixedLanguage]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  function setLanguage(lang: Language) {
    setLanguageState(lang);
    if (!fixedLanguage) void saveSettings({ language: lang });
  }

  const value: I18nContextValue = {
    language,
    t: (key, params) => translate(language, key, params),
    setLanguage,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
