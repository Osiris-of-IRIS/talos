// App shell: HashRouter + routes. Decision IDs: ADR-0002, ADR-0006.
import { HashRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from './LandingPage';
import { ComponentDefinitionsListPage } from '@/features/componentDefinitions/ComponentDefinitionsListPage';
import { ComponentDefinitionDetailPage } from '@/features/componentDefinitions/ComponentDefinitionDetailPage';
import { ComponentDefinitionEditorPage } from '@/features/componentDefinitions/ComponentDefinitionEditorPage';
import { SspListPage } from '@/features/ssps/SspListPage';
import { SspDetailPage } from '@/features/ssps/SspDetailPage';
import { CatalogsListPage } from '@/features/catalogs/CatalogsListPage';
import { LibraryPage } from '@/features/library/LibraryPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/component-definitions" element={<ComponentDefinitionsListPage />} />
        <Route path="/component-definitions/new" element={<ComponentDefinitionEditorPage />} />
        <Route path="/component-definitions/:uuid" element={<ComponentDefinitionDetailPage />} />
        <Route path="/component-definitions/:uuid/edit" element={<ComponentDefinitionEditorPage />} />
        <Route path="/ssps" element={<SspListPage />} />
        <Route path="/ssps/:uuid" element={<SspDetailPage />} />
        <Route path="/catalogs" element={<CatalogsListPage />} />
        <Route path="/library" element={<LibraryPage />} />
      </Routes>
    </HashRouter>
  );
}
