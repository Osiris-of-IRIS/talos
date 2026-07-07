/**
 * Component-definition feature: store + list + detail. Decision IDs: ADR-0001, ADR-0004.
 * Covers TEST-CDEF-01 (feature_registry IMPL-001).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { useComponentDefinitionsStore } from '@/features/componentDefinitions/store';
import { ComponentDefinitionsListPage } from '@/features/componentDefinitions/ComponentDefinitionsListPage';
import { ComponentDefinitionDetailPage } from '@/features/componentDefinitions/ComponentDefinitionDetailPage';
import golden from '../data/component-definition-minimal.json';
import offVersion from '../data/component-definition-v1_1.json';

const goldenText = JSON.stringify(golden);

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useComponentDefinitionsStore.setState({ items: [], loading: false, error: null });
});

describe('store', () => {
  it('imports, lists, and removes', async () => {
    const store = useComponentDefinitionsStore.getState();
    const uuid = await store.importFromText(goldenText);
    expect(useComponentDefinitionsStore.getState().items).toHaveLength(1);

    await store.importFromText(goldenText); // collision -> import-as-copy
    expect(useComponentDefinitionsStore.getState().items).toHaveLength(2);
    const uuids = useComponentDefinitionsStore.getState().items.map((r) => r.uuid);
    expect(new Set(uuids).size).toBe(2);

    await store.remove(uuid);
    expect(useComponentDefinitionsStore.getState().items).toHaveLength(1);
  });

  it('rejects a non-component-definition document', async () => {
    const ssp = JSON.stringify({ 'system-security-plan': { uuid: 'x', metadata: { title: 't' } } });
    await expect(useComponentDefinitionsStore.getState().importFromText(ssp)).rejects.toThrow(
      /Expected a component-definition/,
    );
  });
});

describe('list page', () => {
  it('shows the empty state, then the imported item', async () => {
    render(
      <MemoryRouter>
        <ComponentDefinitionsListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('compdef-empty')).toBeInTheDocument();

    await act(async () => {
      await useComponentDefinitionsStore.getState().importFromText(goldenText);
    });
    await waitFor(() => expect(screen.getByText('Passwortrichtlinie')).toBeInTheDocument());
  });

  it('surfaces a yellow warning when importing an off-version (1.x) OSCAL file (ADR-0007)', async () => {
    render(
      <MemoryRouter>
        <ComponentDefinitionsListPage />
      </MemoryRouter>,
    );
    await act(async () => {
      await useComponentDefinitionsStore.getState().importFromText(JSON.stringify(offVersion));
    });
    // stored despite the version, and the non-blocking warning is shown
    expect(useComponentDefinitionsStore.getState().warnings).toHaveLength(1);
    const banner = await screen.findByTestId('compdef-upload-warning');
    expect(banner).toHaveTextContent(/1\.1\.2.*1\.2\.2/);
    expect(screen.getByText('Legacy-Komponente (OSCAL 1.1.2)')).toBeInTheDocument();
  });
});

describe('detail page', () => {
  it('renders metadata, components, and control requirements', async () => {
    const uuid = await useComponentDefinitionsStore.getState().importFromText(goldenText);
    render(
      <MemoryRouter initialEntries={[`/component-definitions/${uuid}`]}>
        <Routes>
          <Route path="/component-definitions/:uuid" element={<ComponentDefinitionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('compdef-detail')).toBeInTheDocument();
    expect(screen.getByText('Password Policy')).toBeInTheDocument();
    expect(screen.getByText('IA-5')).toBeInTheDocument();
  });

  it('shows not-found for an unknown uuid', async () => {
    render(
      <MemoryRouter initialEntries={['/component-definitions/does-not-exist']}>
        <Routes>
          <Route path="/component-definitions/:uuid" element={<ComponentDefinitionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('compdef-not-found')).toBeInTheDocument();
  });

  it('blocks download and shows an error when the artifact has no valid creator (ADR-0019)', async () => {
    const user = userEvent.setup();
    // minimal fixture: role "provider", no creator -> not exportable
    const uuid = await useComponentDefinitionsStore.getState().importFromText(goldenText);
    render(
      <MemoryRouter initialEntries={[`/component-definitions/${uuid}`]}>
        <Routes>
          <Route path="/component-definitions/:uuid" element={<ComponentDefinitionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByTestId('compdef-detail');
    await user.click(screen.getByRole('button', { name: /Download OSCAL/ }));
    expect(await screen.findByTestId('compdef-export-error')).toHaveTextContent(/Cannot export.*creator/i);
  });
});
