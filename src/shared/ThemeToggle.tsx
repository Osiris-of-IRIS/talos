// Explicit dark/light toggle (ADR-0010, ADR-0011 symbols, ADR-0020). Decision IDs: ADR-0020.
import { useTheme } from './theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      data-testid="theme-toggle"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
