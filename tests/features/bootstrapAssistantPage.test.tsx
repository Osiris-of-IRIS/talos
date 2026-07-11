/**
 * SSP Bootstrap Assistant wizard page (ADR-0026): prerequisite gating, catalog + methodology
 * selection, generation, idempotent re-run.
 * Covers TEST-ASST-02, TEST-BOOTSTRAP-02, TEST-BOOTSTRAP-03 (Single System variant).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { useAssetsStore } from '@/features/assets/store';
import { useCatalogsStore } from '@/features/catalogs/store';
import { ArtifactRepository } from '@/data/artifactRepository';
import type { SystemSecurityPlan } from '@/models/ssp';
import type { Profile } from '@/models/profile';
import { BootstrapAssistantPage } from '@/features/bootstrap/BootstrapAssistantPage';
import catalogDoc from '../data/catalog-target-object-categories.json';

vi.mock('@/data/targetObjectCategoryLoader', () => ({
  loadTargetObjectCategories: vi.fn(async () => ({
    rows: [
      { title: 'Anwendungen', definition: '', typ: 'IT-Systeme', category: '', synonyms: '', parentUuid: undefined, uuid: '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871' },
    ],
    fromCache: false,
  })),
}));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useAssetsStore.setState({ assets: [], assetTypes: [], loading: false, error: null, warnings: [] });
  useCatalogsStore.setState({ items: [], loading: false, error: null, warnings: [] });
});

async function seedCatalog() {
  await ArtifactRepository.forType('catalog').create({
    uuid: catalogDoc.catalog.uuid,
    type: 'catalog',
    origin: 'user',
    artifact: catalogDoc.catalog,
  });
}

async function seedAsset() {
  await useAssetsStore
    .getState()
    .importCsvTrio(
      'uuid,title\nclient-pc,Desktop\n',
      'asset-id,name,asset-type,description,security-sensitivity-level,information-types\nC001,Finance Clients,client-pc,,normal,\n',
      'asset_type_uuid,targetobj_class_uuid\nclient-pc,7e41ecf5-1831-4691-ad0c-4fc7bbc1b871\n',
    );
}

describe('BootstrapAssistantPage', () => {
  it('shows a loading indicator instead of a false "no assets" banner while the stores are still loading', async () => {
    await act(async () => {
      await seedAsset();
      await seedCatalog();
    });
    // Simulate the moment right after mount, before load() resolves: a user with existing
    // assets+catalogs should not see the prerequisite banner flash. Stub `load` to never resolve
    // so the loading state stays deterministic for the test's synchronous assertions below —
    // restored afterward so later tests in this file get the real store behavior back.
    const realAssetsLoad = useAssetsStore.getState().load;
    const realCatalogsLoad = useCatalogsStore.getState().load;
    useAssetsStore.setState({ loading: true, load: () => new Promise(() => {}) });
    useCatalogsStore.setState({ loading: true, load: () => new Promise(() => {}) });

    const { unmount } = render(
      <MemoryRouter>
        <BootstrapAssistantPage />
      </MemoryRouter>,
    );
    try {
      expect(screen.queryByTestId('bootstrap-no-assets')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bootstrap-no-catalogs')).not.toBeInTheDocument();
    } finally {
      // Unmount before restoring the real `load` so the store-state change isn't applied to a
      // still-mounted component outside of React's act() tracking.
      unmount();
      useAssetsStore.setState({ load: realAssetsLoad });
      useCatalogsStore.setState({ load: realCatalogsLoad });
    }
  });

  it('shows the no-assets prerequisite message when the workspace has no assets', async () => {
    render(
      <MemoryRouter>
        <BootstrapAssistantPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('bootstrap-no-assets')).toBeInTheDocument();
    expect(screen.queryByTestId('bootstrap-generate')).not.toBeInTheDocument();
  });

  it('shows the no-catalogs message once assets exist but no catalog is uploaded', async () => {
    await act(async () => {
      await seedAsset();
    });
    render(
      <MemoryRouter>
        <BootstrapAssistantPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('bootstrap-no-catalogs')).toBeInTheDocument();
  });

  it('generates SSPs and reports the created count', async () => {
    await act(async () => {
      await seedAsset();
      await seedCatalog();
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BootstrapAssistantPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('bootstrap-catalog-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('bootstrap-catalog-select'), catalogDoc.catalog.uuid);
    await user.click(screen.getByTestId('bootstrap-methodology-bsi'));
    await user.click(screen.getByTestId('bootstrap-generate'));

    await waitFor(() => expect(screen.getByTestId('bootstrap-result')).toBeInTheDocument());
    // BSI-style: 1 ISMS SSP + 1 per mapped asset (one asset here) = 2 created
    expect(screen.getByTestId('bootstrap-result')).toHaveTextContent('2 SSP(s) created');

    const all = await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').getAll();
    expect(all).toHaveLength(2);
  });

  it('re-running generation updates rather than duplicates', async () => {
    await act(async () => {
      await seedAsset();
      await seedCatalog();
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BootstrapAssistantPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('bootstrap-catalog-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('bootstrap-catalog-select'), catalogDoc.catalog.uuid);
    await user.click(screen.getByTestId('bootstrap-generate'));
    await waitFor(() => expect(screen.getByTestId('bootstrap-result')).toBeInTheDocument());

    await user.click(screen.getByTestId('bootstrap-generate'));
    await waitFor(() => expect(screen.getByTestId('bootstrap-result')).toHaveTextContent('0 SSP(s) created'));

    const all = await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').getAll();
    expect(all).toHaveLength(1); // NIST-style: 1 system asset -> 1 SSP, still 1 after re-run
  });

  it('Single System variant: generates exactly one SSP for the picked asset + catalog', async () => {
    await act(async () => {
      await seedAsset();
      await seedCatalog();
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BootstrapAssistantPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('bootstrap-methodology-single-system')).toBeInTheDocument());
    await user.click(screen.getByTestId('bootstrap-methodology-single-system'));
    await user.selectOptions(screen.getByTestId('bootstrap-single-asset-select'), 'C001');
    await user.selectOptions(screen.getByTestId('bootstrap-single-source-select'), catalogDoc.catalog.uuid);
    await user.click(screen.getByTestId('bootstrap-generate'));

    await waitFor(() => expect(screen.getByTestId('bootstrap-result')).toBeInTheDocument());
    expect(screen.getByTestId('bootstrap-result')).toHaveTextContent('1 SSP(s) created');

    const all = await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').getAll();
    expect(all).toHaveLength(1);
  });

  it('Single System variant: also accepts a workspace profile as the baseline', async () => {
    await act(async () => {
      await seedAsset();
      await seedCatalog();
      await ArtifactRepository.forType<Profile>('profile').create({
        uuid: 'profile-1',
        type: 'profile',
        origin: 'user',
        artifact: {
          uuid: 'profile-1',
          metadata: { title: 'Baseline Profile', version: '1.0.0', oscalVersion: '1.2.2' },
          imports: [{ href: `#${catalogDoc.catalog.uuid}`, includeAll: {} }],
        } as Profile,
      });
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BootstrapAssistantPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('bootstrap-methodology-single-system')).toBeInTheDocument());
    await user.click(screen.getByTestId('bootstrap-methodology-single-system'));
    await user.selectOptions(screen.getByTestId('bootstrap-single-asset-select'), 'C001');
    await waitFor(() =>
      expect(screen.getByTestId('bootstrap-single-source-select')).toHaveTextContent('Baseline Profile'),
    );
    await user.selectOptions(screen.getByTestId('bootstrap-single-source-select'), 'profile-1');
    await user.click(screen.getByTestId('bootstrap-generate'));

    await waitFor(() => expect(screen.getByTestId('bootstrap-result')).toBeInTheDocument());
    expect(screen.getByTestId('bootstrap-result')).toHaveTextContent('1 SSP(s) created');
  });
});
