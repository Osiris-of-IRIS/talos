/**
 * App-wide search (T-036 follow-up, ADR-0013): a persistent sidebar search box across every
 * artifact type with a real detail page (catalog, component-definition, system-security-plan).
 * Picking a result navigates straight to its detail page (or the list page for catalogs, which
 * have no per-item route) and resets the box.
 * Covers TEST-SEARCH-03.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { GlobalSearch } from '@/app/GlobalSearch';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { SystemSecurityPlan } from '@/models/ssp';
import type { Catalog } from '@/models/catalog';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderSearch(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <GlobalSearch />
      <Routes>
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function seedArtifacts() {
  await ArtifactRepository.forType<ComponentDefinition>('componentDefinition').create({
    uuid: '11111111-1111-4111-8111-111111111111',
    type: 'componentDefinition',
    origin: 'user',
    artifact: { uuid: '11111111-1111-4111-8111-111111111111', metadata: { title: 'Password Policy', version: '1.0.0', oscalVersion: '1.2.2' } },
  });
  await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').create({
    uuid: '22222222-2222-4222-8222-222222222222',
    type: 'systemSecurityPlan',
    origin: 'user',
    artifact: {
      uuid: '22222222-2222-4222-8222-222222222222',
      metadata: { title: 'Passwordless Cluster SSP', version: '1.0.0', oscalVersion: '1.2.2' },
      importProfile: { href: '#profile' },
      systemCharacteristics: {
        systemIds: [],
        systemName: 'x',
        description: 'x',
        systemInformation: { informationTypes: [] },
        status: { state: 'operational' },
        authorizationBoundary: { description: 'x' },
      },
      systemImplementation: { users: [], components: [] },
      controlImplementation: { description: 'x', implementedRequirements: [] },
    },
  });
  await ArtifactRepository.forType<Catalog>('catalog').create({
    uuid: '33333333-3333-4333-8333-333333333333',
    type: 'catalog',
    origin: 'imported',
    artifact: { uuid: '33333333-3333-4333-8333-333333333333', metadata: { title: 'Password Kernel Catalog', version: '1.0.0', oscalVersion: '1.2.2' }, controls: [] },
  });
}

describe('GlobalSearch', () => {
  it('renders an empty search box with no dropdown', () => {
    renderSearch();
    expect(screen.getByTestId('global-search-input')).toHaveValue('');
    expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument();
  });

  it('refetches its index on focus, so an artifact created after mount is still found (it never remounts across the app session)', async () => {
    const user = userEvent.setup();
    renderSearch();
    await seedArtifacts();
    await user.click(screen.getByTestId('global-search-input'));
    await user.type(screen.getByTestId('global-search-input'), 'password');
    expect(await screen.findByText('Password Policy')).toBeInTheDocument();
  });

  it('narrows to matching artifacts across every searchable type, tagged with a type badge', async () => {
    await seedArtifacts();
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByTestId('global-search-input'), 'password');

    expect(await screen.findByText('Password Policy')).toBeInTheDocument();
    expect(screen.getByText('Passwordless Cluster SSP')).toBeInTheDocument();
    expect(screen.getByText('Password Kernel Catalog')).toBeInTheDocument();
    expect(screen.getAllByTestId('es-result')).toHaveLength(3);
  });

  it('shows a no-results message when nothing matches', async () => {
    await seedArtifacts();
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByTestId('global-search-input'), 'zzz-nope');
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('navigates to a component-definition\'s detail page and resets the box on pick', async () => {
    await seedArtifacts();
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByTestId('global-search-input'), 'Password Policy');
    await user.click(await screen.findByText('Password Policy'));

    expect(await screen.findByTestId('location')).toHaveTextContent('/component-definitions/11111111-1111-4111-8111-111111111111');
    expect(screen.getByTestId('global-search-input')).toHaveValue('');
    expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument();
  });

  it('navigates to an SSP\'s detail page on pick', async () => {
    await seedArtifacts();
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByTestId('global-search-input'), 'Passwordless Cluster');
    await user.click(await screen.findByText('Passwordless Cluster SSP'));

    expect(await screen.findByTestId('location')).toHaveTextContent('/ssps/22222222-2222-4222-8222-222222222222');
  });

  it('navigates to the catalogs list page on pick (catalogs have no per-item route)', async () => {
    await seedArtifacts();
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByTestId('global-search-input'), 'Password Kernel');
    await user.click(await screen.findByText('Password Kernel Catalog'));

    expect(await screen.findByTestId('location')).toHaveTextContent('/catalogs');
  });

  it('closes on Escape without navigating', async () => {
    await seedArtifacts();
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByTestId('global-search-input'), 'password');
    await screen.findAllByTestId('es-result');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('navigates via keyboard: ArrowDown + Enter picks the highlighted result', async () => {
    await seedArtifacts();
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByTestId('global-search-input'), 'Password Policy');
    await screen.findByTestId('es-result');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(await screen.findByTestId('location')).toHaveTextContent('/component-definitions/11111111-1111-4111-8111-111111111111');
  });
});
