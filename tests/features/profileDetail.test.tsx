/**
 * Profile detail page: resolved imports (catalog/profile source), included/excluded control
 * display, set-parameters. Decision IDs: ADR-0032. Covers TEST-PROF-04.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
