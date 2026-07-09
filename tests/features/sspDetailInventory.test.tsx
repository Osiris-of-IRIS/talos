/**
 * SSP detail page — Inventory Items section (ADR-0031): shows bootstrap-generated
 * system-implementation.inventory-items, with the asset-id linking to the filtered asset list.
 * Covers TEST-SSP-INV-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { SspDetailPage } from '@/features/ssps/SspDetailPage';
import type { SystemSecurityPlan } from '@/models/ssp';

const sspUuid = '99999999-8888-4777-8666-555555555556';

function baseSsp(): SystemSecurityPlan {
  return {
    uuid: sspUuid,
    metadata: { title: 'Test SSP', version: '1.0.0', oscalVersion: '1.2.2' },
    importProfile: { href: '' },
    systemCharacteristics: {
      systemIds: [],
      systemName: 'Test System',
      description: 'x',
      systemInformation: { informationTypes: [] },
      status: { state: 'operational' },
      authorizationBoundary: { description: '' },
    },
    systemImplementation: { users: [], components: [] },
    controlImplementation: { description: 'impl', implementedRequirements: [] },
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/ssps/${sspUuid}`]}>
      <Routes>
        <Route path="/ssps/:uuid" element={<SspDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SSP detail — Inventory Items (ADR-0031)', () => {
  it('does not render the section when there are no inventory items', async () => {
    await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').create({
      uuid: sspUuid,
      type: 'systemSecurityPlan',
      origin: 'user',
      artifact: baseSsp(),
    });
    renderDetail();
    expect(await screen.findByTestId('ssp-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('ssp-section-inventory')).not.toBeInTheDocument();
  });

  it('shows description, asset-id (as a filtered-assets link) and asset-type', async () => {
    const artifact = baseSsp();
    artifact.systemImplementation.inventoryItems = [
      {
        uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        description: 'Desktop-PCs für Finanzbuchhaltung',
        props: [
          { name: 'asset-id', value: 'C001' },
          { name: 'asset-type', value: 'Desktop-PC (Client)' },
        ],
      },
    ];
    await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').create({
      uuid: sspUuid,
      type: 'systemSecurityPlan',
      origin: 'user',
      artifact,
    });

    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByTestId('ssp-section-inventory-toggle'));

    const item = await screen.findByTestId('ssp-inventory-item');
    expect(item).toHaveTextContent('Desktop-PCs für Finanzbuchhaltung');
    expect(item).toHaveTextContent('Desktop-PC (Client)');
    const link = screen.getByTestId('ssp-inventory-item-asset-link');
    expect(link).toHaveTextContent('C001');
    expect(link).toHaveAttribute('href', '/assets?asset=C001');
  });
});
