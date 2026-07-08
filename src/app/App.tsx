// App shell: HashRouter + routes. Decision IDs: ADR-0002, ADR-0006, ADR-0020, ADR-0012.
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeToggle } from '@/shared/ThemeToggle';
import { LanguageSwitcher } from '@/shared/LanguageSwitcher';
import { I18nProvider } from '@/shared/i18n';
import { LandingPage } from './LandingPage';
import { ComponentDefinitionsListPage } from '@/features/componentDefinitions/ComponentDefinitionsListPage';
import { ComponentDefinitionDetailPage } from '@/features/componentDefinitions/ComponentDefinitionDetailPage';
import { ComponentDefinitionEditorPage } from '@/features/componentDefinitions/ComponentDefinitionEditorPage';
import { SspListPage } from '@/features/ssps/SspListPage';
import { SspDetailPage } from '@/features/ssps/SspDetailPage';
import { SspEditorPage } from '@/features/ssps/SspEditorPage';
import { CatalogsListPage } from '@/features/catalogs/CatalogsListPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { AssetsListPage } from '@/features/assets/AssetsListPage';
import { BootstrapAssistantPage } from '@/features/bootstrap/BootstrapAssistantPage';
import './app.css';

export function App() {
  return (
    <I18nProvider>
      <HashRouter>
        <div className="app-shell">
          <div className="app-topbar">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/component-definitions" element={<ComponentDefinitionsListPage />} />
            <Route path="/component-definitions/new" element={<ComponentDefinitionEditorPage />} />
            <Route path="/component-definitions/:uuid" element={<ComponentDefinitionDetailPage />} />
            <Route path="/component-definitions/:uuid/edit" element={<ComponentDefinitionEditorPage />} />
            <Route path="/ssps" element={<SspListPage />} />
            <Route path="/ssps/new" element={<SspEditorPage />} />
            <Route path="/ssps/:uuid" element={<SspDetailPage />} />
            <Route path="/ssps/:uuid/edit" element={<SspEditorPage />} />
            <Route path="/catalogs" element={<CatalogsListPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/assets" element={<AssetsListPage />} />
            <Route path="/bootstrap" element={<BootstrapAssistantPage />} />
          </Routes>
        </div>
      </HashRouter>
    </I18nProvider>
  );
}
