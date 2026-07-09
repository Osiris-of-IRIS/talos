/**
 * SSP detail resolves control-ids to <ControlDisplay> via cached catalogs, in a control|implementation
 * table (ADR-0028) — mirrors the component-definition detail page's existing pattern (ADR-0016, T-120).
 * Covers TEST-SSP-RES-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { SspDetailPage } from '@/features/ssps/SspDetailPage';
import { parseOscalUpload } from '@/data/fileIo';
import type { Catalog } from '@/models/catalog';
import type { SystemSecurityPlan } from '@/models/ssp';
import catalogJson from '../data/catalog-minimal.json';

const sspUuid = '99999999-8888-4777-8666-555555555555';

function sspWithRequirement(controlId: string): SystemSecurityPlan {
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
    controlImplementation: {
      description: 'impl',
      implementedRequirements: [{ uuid: 'ir-1', controlId }],
    },
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

async function seed(controlId: string, withCatalog: boolean) {
  if (withCatalog) {
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: record.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: record.artifact,
    });
  }
  await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').create({
    uuid: sspUuid,
    type: 'systemSecurityPlan',
    origin: 'user',
    artifact: sspWithRequirement(controlId),
  });
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/ssps/${sspUuid}`]}>
      <Routes>
        <Route path="/ssps/:uuid" element={<SspDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function expandControlImpl() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('ssp-section-control-impl-toggle'));
}

describe('control | implementation table layout (ADR-0028)', () => {
  it('renders the requirement row as a two-cell table row', async () => {
    await seed('ASST.1.1.2', true);
    renderDetail();
    await expandControlImpl();

    const row = screen.getByTestId('ssp-requirement');
    expect(row.tagName).toBe('TR');
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(2);
  });

  it('renders <ControlDisplay> with the resolved headline when the catalog is present', async () => {
    await seed('ASST.1.1.2', true);
    renderDetail();
    await expandControlImpl();
    expect(await screen.findByTestId('control-display')).toBeInTheDocument();
    expect(screen.getByTestId('control-headline')).toHaveTextContent('ASST.1.1.2 Zuweisung');
  });

  it('falls back to the plain control-id when unresolved', async () => {
    await seed('ASST.1.1.2', false);
    renderDetail();
    await expandControlImpl();
    expect(await screen.findByTestId('ssp-requirement-unresolved')).toHaveTextContent('ASST.1.1.2');
  });
});
