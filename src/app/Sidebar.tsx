// Persistent left-hand navigation: logo (links home) + primary links, collapsible to reclaim
// width on content-heavy editor pages. Decision IDs: ADR-0029.
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import { useAssetsStore } from '@/features/assets/store';
import { navigationGroups, LAYER_TITLE_KEY } from './navigation';
import { GlobalSearch } from './GlobalSearch';
import logo from '@/assets/logo.png';

export function Sidebar() {
  const { t } = useI18n();
  const { assets, load } = useAssetsStore();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const hasAssets = assets.length > 0;

  return (
    <nav className="app-sidebar" data-collapsed={collapsed} aria-label={t('sidebar_nav_label')}>
      <div className="app-sidebar-header">
        <Link to="/" className="app-sidebar-logo" aria-label={t('sidebar_logo_home_aria')} data-testid="sidebar-logo-link">
          <img src={logo} alt={t('app_title')} />
        </Link>
        <button
          type="button"
          className="app-sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? 'sidebar_expand_aria' : 'sidebar_collapse_aria')}
          title={t(collapsed ? 'sidebar_expand_aria' : 'sidebar_collapse_aria')}
          data-testid="sidebar-toggle"
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {!collapsed && (
        <div className="app-sidebar-body" data-testid="sidebar-nav">
          <GlobalSearch />
          {navigationGroups(hasAssets).map((group) => (
            <div key={group.layer} className="app-sidebar-group">
              <h3>{t(LAYER_TITLE_KEY[group.layer])}</h3>
              <ul>
                {group.features.map((f) =>
                  f.disabled ? (
                    <li key={f.path}>
                      <span
                        aria-disabled="true"
                        data-testid="sidebar-link-disabled"
                        title={f.disabledTitleKey ? t(f.disabledTitleKey) : undefined}
                      >
                        {t(f.titleKey)}
                      </span>
                    </li>
                  ) : (
                    <li key={f.path}>
                      <NavLink to={f.path} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                        {t(f.titleKey)}
                      </NavLink>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
