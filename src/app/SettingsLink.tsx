// App settings (⚙️) topbar link (ADR-0033) — lives next to <LanguageSwitcher>/<ThemeToggle>,
// same tier of global-preference control, not an OSCAL-layer feature (so not in navigation.ts's
// sidebar/landing groups).
import { NavLink } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';

export function SettingsLink() {
  const { t } = useI18n();
  const label = t('settings_link_aria');

  return (
    <NavLink
      to="/settings"
      className="theme-toggle"
      aria-label={label}
      title={label}
      data-testid="settings-link"
    >
      ⚙️
    </NavLink>
  );
}
