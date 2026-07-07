// Language preference dropdown (ADR-0012): lives in the topbar next to <ThemeToggle>.
import { useI18n, SUPPORTED_LANGUAGES, type Language } from './i18n';

const LANGUAGE_LABEL: Record<Language, string> = { en: 'English', de: 'Deutsch' };

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="language-switcher">
      <span className="sr-only">{t('language_switcher_label')}</span>
      <select
        data-testid="language-switcher"
        aria-label={t('language_switcher_label')}
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {LANGUAGE_LABEL[lang]}
          </option>
        ))}
      </select>
    </label>
  );
}
