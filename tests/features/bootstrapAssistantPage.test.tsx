/**
 * SSP Bootstrap Assistant wizard page (ADR-0026): prerequisite gating, catalog + methodology
 * selection, generation, idempotent re-run.
 * Covers TEST-ASST-02, TEST-BOOTSTRAP-02.
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
      'uuid,name,asset_type,description,security-sensitivity-level,information-types\nC001,Finance Clients,client-pc,,normal,\n',
      'asset_type_uuid,targetobj_class_uuid\nclient-pc,7e41ecf5-1831-4691-ad0c-4fc7bbc1b871\n',
    );
}

describe('BootstrapAssistantPage', () => {
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
});
