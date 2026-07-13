/**
 * Profile detail page: resolved imports (catalog/profile source), included/excluded control
 * display, set-parameters, and the control text filter (T-513, ADR-0038). Decision IDs:
 * ADR-0032, ADR-0038. Covers TEST-PROF-04.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { ProfileDetailPage } from '@/features/profiles/ProfileDetailPage';
import type { Profile } from '@/models/profile';
import type { Catalog } from '@/models/catalog';

const repo = () => ArtifactRepository.forType<Profile>('profile');
const catalogRepo = () => ArtifactRepository.forType<Catalog>('catalog');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profiles/:uuid" element={<ProfileDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

const catalogUuid = 'cccccccc-2222-4222-8222-222222222222';
const profileUuid = 'pppppppp-2222-4222-8222-222222222222';
const resourceUuid = 'rrrrrrrr-2222-4222-8222-222222222222';

async function seed() {
  await catalogRepo().create({
    uuid: catalogUuid,
    type: 'catalog',
    origin: 'user',
    artifact: {
      uuid: catalogUuid,
      metadata: { title: 'Grundschutz Test', version: '1.0.0', oscalVersion: '1.2.2' },
      controls: [
        { id: 'APP.1.1.1', title: 'Secure web apps' },
        { id: 'APP.1.1.2', title: 'Inventory apps' },
      ],
    } as Catalog,
  });
  await repo().create({
    uuid: profileUuid,
    type: 'profile',
    origin: 'user',
    artifact: {
      uuid: profileUuid,
      metadata: { title: 'Web Baseline', version: '1.0.0', oscalVersion: '1.2.2' },
      imports: [
        {
          href: `#${resourceUuid}`,
          includeControls: [{ withIds: ['APP.1.1.1'] }],
          excludeControls: [{ withIds: ['APP.1.1.2'] }],
        },
      ],
      merge: { asIs: true },
      modify: { setParameters: [{ paramId: 'ia-5.1_prm_2', values: ['14'] }] },
      backMatter: {
        resources: [{ uuid: resourceUuid, title: 'Grundschutz Test', documentIds: [{ identifier: catalogUuid }] }],
      },
    } as Profile,
  });
}

describe('detail page', () => {
  it('shows the resolved import source, included/excluded controls, and set-parameters', async () => {
    await seed();
    renderAt(`/profiles/${profileUuid}`);
    await waitFor(() => expect(screen.getByText('Web Baseline')).toBeInTheDocument());

    const importSection = await screen.findByTestId('profile-detail-import');
    expect(importSection).toHaveTextContent('Grundschutz Test');
    expect(await screen.findByTestId('profile-detail-include-control')).toHaveTextContent('Secure web apps');
    expect(await screen.findByTestId('profile-detail-exclude-control')).toHaveTextContent('Inventory apps');

    const setParams = screen.getByTestId('profile-detail-set-parameters');
    expect(setParams).toHaveTextContent('ia-5.1_prm_2');
    expect(setParams).toHaveTextContent('14');
  });

  it('shows not-found for a missing uuid', async () => {
    renderAt('/profiles/does-not-exist');
    expect(await screen.findByTestId('profile-not-found')).toBeInTheDocument();
  });
});

describe('control filter (T-513, ADR-0038)', () => {
  const bigCatalogUuid = 'cccccccc-3333-4333-8333-333333333333';
  const byIdProfileUuid = 'pppppppp-3333-4333-8333-333333333333';
  const allProfileUuid = 'pppppppp-4444-4444-8444-444444444444';
  const bigResourceUuid = 'rrrrrrrr-3333-4333-8333-333333333333';

  async function seedBigCatalog() {
    await catalogRepo().create({
      uuid: bigCatalogUuid,
      type: 'catalog',
      origin: 'user',
      artifact: {
        uuid: bigCatalogUuid,
        metadata: { title: 'Big Catalog', version: '1.0.0', oscalVersion: '1.2.2' },
        controls: [
          { id: 'C1', title: 'Web application firewall' },
          { id: 'C2', title: 'Database encryption at rest' },
          { id: 'C3', title: 'Network segmentation' },
        ],
      } as Catalog,
    });
  }

  it('narrows the by-id include list to controls matching the filter text (id/title/prose)', async () => {
    await seedBigCatalog();
    await repo().create({
      uuid: byIdProfileUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: byIdProfileUuid,
        metadata: { title: 'By-Id Profile', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: `#${bigResourceUuid}`, includeControls: [{ withIds: ['C1', 'C2', 'C3'] }] }],
        merge: { asIs: true },
        backMatter: { resources: [{ uuid: bigResourceUuid, title: 'Big Catalog', documentIds: [{ identifier: bigCatalogUuid }] }] },
      } as Profile,
    });

    const user = userEvent.setup();
    renderAt(`/profiles/${byIdProfileUuid}`);
    expect(await screen.findAllByTestId('profile-detail-include-control')).toHaveLength(3);

    await user.type(screen.getByTestId('profile-detail-control-filter'), 'firewall');
    await waitFor(() => expect(screen.getAllByTestId('profile-detail-include-control')).toHaveLength(1));
    expect(screen.getByTestId('profile-detail-include-control')).toHaveTextContent('Web application firewall');
  });

  it('shows an empty-state message when the filter matches nothing', async () => {
    await seedBigCatalog();
    await repo().create({
      uuid: byIdProfileUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: byIdProfileUuid,
        metadata: { title: 'By-Id Profile', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: `#${bigResourceUuid}`, includeAll: {} }],
        merge: { asIs: true },
        backMatter: { resources: [{ uuid: bigResourceUuid, title: 'Big Catalog', documentIds: [{ identifier: bigCatalogUuid }] }] },
      } as Profile,
    });

    const user = userEvent.setup();
    renderAt(`/profiles/${byIdProfileUuid}`);
    expect(await screen.findAllByTestId('profile-detail-include-control')).toHaveLength(3);

    await user.type(screen.getByTestId('profile-detail-control-filter'), 'no-such-control-xyz');
    expect(await screen.findByTestId('profile-detail-controls-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-detail-include-control')).not.toBeInTheDocument();
  });

  it('lists every resolved control for an includeAll import — previously nothing was shown at all', async () => {
    await seedBigCatalog();
    await repo().create({
      uuid: allProfileUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: allProfileUuid,
        metadata: { title: 'Include-All Profile', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: `#${bigResourceUuid}`, includeAll: {} }],
        merge: { asIs: true },
        backMatter: { resources: [{ uuid: bigResourceUuid, title: 'Big Catalog', documentIds: [{ identifier: bigCatalogUuid }] }] },
      } as Profile,
    });

    renderAt(`/profiles/${allProfileUuid}`);
    const rows = await screen.findAllByTestId('profile-detail-include-control');
    expect(rows.map((r) => r.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('firewall'), expect.stringContaining('encryption'), expect.stringContaining('segmentation')]),
    );
  });

  it('resolves controls for a profile-sourced import too, not just a catalog source', async () => {
    await seedBigCatalog();
    const baselineProfileUuid = 'pppppppp-5555-4555-8555-555555555555';
    await repo().create({
      uuid: baselineProfileUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: baselineProfileUuid,
        metadata: { title: 'Baseline', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: `#${bigResourceUuid}`, includeAll: {} }],
        merge: { asIs: true },
        backMatter: { resources: [{ uuid: bigResourceUuid, title: 'Big Catalog', documentIds: [{ identifier: bigCatalogUuid }] }] },
      } as Profile,
    });
    await repo().create({
      uuid: allProfileUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: allProfileUuid,
        metadata: { title: 'Derived Profile', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: `#${baselineProfileUuid}`, includeControls: [{ withIds: ['C1'] }] }],
        merge: { asIs: true },
      } as Profile,
    });

    renderAt(`/profiles/${allProfileUuid}`);
    expect(await screen.findByTestId('profile-detail-include-control')).toHaveTextContent('Web application firewall');
  });
});
