// Explicit dark/light toggle (ADR-0010, ADR-0011 symbols, ADR-0020). Decision IDs: ADR-0020, ADR-0012.
import { useTheme } from './theme';
import { useI18n } from './i18n';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isDark = theme === 'dark';
  const label = t(isDark ? 'theme_toggle_to_light' : 'theme_toggle_to_dark');

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
