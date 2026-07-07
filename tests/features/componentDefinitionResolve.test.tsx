/**
 * Component-definition detail resolves control-ids to <ControlDisplay> via cached catalogs.
 * Decision IDs: ADR-0001, ADR-0016 (T-120). Covers TEST-CDEF-RES-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { ComponentDefinitionDetailPage } from '@/features/componentDefinitions/ComponentDefinitionDetailPage';
import { parseOscalUpload } from '@/data/fileIo';
import type { Catalog } from '@/models/catalog';
import type { ComponentDefinition } from '@/models/componentDefinition';
import catalogJson from '../data/catalog-minimal.json';

const cdUuid = '11111111-2222-4333-8444-555555555555';

function compDefReferencing(controlId: string): ComponentDefinition {
  return {
    uuid: cdUuid,
    metadata: { title: 'Ref CD', version: '1.0.0', oscalVersion: '1.2.2' },
    components: [
      {
        uuid: 'comp-1',
        type: 'policy',
        title: 'Policy',
        description: 'x',
        controlImplementations: [
          {
            uuid: 'ci-1',
            source: '#cat',
            description: 'impl',
            implementedRequirements: [
              { uuid: 'ir-1', controlId, setParameters: [{ paramId: 'asst.1.1.2-prm1', values: ['den IT-Betrieb'] }] },
            ],
          },
        ],
      },
    ],
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
  await ArtifactRepository.forType<ComponentDefinition>('componentDefinition').create({
    uuid: cdUuid,
    type: 'componentDefinition',
    origin: 'user',
    artifact: compDefReferencing(controlId),
  });
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/component-definitions/${cdUuid}`]}>
      <Routes>
        <Route path="/component-definitions/:uuid" element={<ComponentDefinitionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('control resolution in detail', () => {
  it('renders <ControlDisplay> with resolved headline + param when the catalog is present', async () => {
    await seed('ASST.1.1.2', true);
    renderDetail();
    expect(await screen.findByTestId('control-display')).toBeInTheDocument();
    expect(screen.getByTestId('control-headline')).toHaveTextContent('ASST.1.1.2 Zuweisung');
    // set-parameter override flows into the param token
    expect(screen.getByTestId('control-param')).toHaveTextContent('< den IT-Betrieb >');
  });

  it('falls back to the plain control-id when unresolved', async () => {
    await seed('ASST.1.1.2', false);
    renderDetail();
    expect(await screen.findByTestId('compdef-requirement-unresolved')).toHaveTextContent('ASST.1.1.2');
  });
});
