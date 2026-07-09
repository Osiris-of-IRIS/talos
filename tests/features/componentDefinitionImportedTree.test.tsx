/**
 * Component-definition detail — read-only transitive "Imported Definitions" tree (ADR-0014).
 * Covers TEST-CDEF-IMP-02.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { ComponentDefinitionDetailPage } from '@/features/componentDefinitions/ComponentDefinitionDetailPage';
import type { ComponentDefinition } from '@/models/componentDefinition';

const repo = () => ArtifactRepository.forType<ComponentDefinition>('componentDefinition');

const rootUuid = '11111111-1111-4111-8111-111111111111';
const childUuid = '22222222-2222-4222-8222-222222222222';
const grandchildUuid = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

function renderDetail(uuid: string) {
  return render(
    <MemoryRouter initialEntries={[`/component-definitions/${uuid}`]}>
      <Routes>
        <Route path="/component-definitions/:uuid" element={<ComponentDefinitionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Imported Definitions — detail page (ADR-0014)', () => {
  it('shows nothing when there are no imports', async () => {
    await repo().create({
      uuid: rootUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid: rootUuid, metadata: { title: 'Root', version: '1.0.0', oscalVersion: '1.2.2' } },
    });
    renderDetail(rootUuid);
    expect(await screen.findByTestId('compdef-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('cdef-imported-definitions')).not.toBeInTheDocument();
  });

  it('renders a resolved import as a link, and an unresolved one as a marker', async () => {
    await repo().create({
      uuid: childUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid: childUuid, metadata: { title: 'Child Def', version: '1.0.0', oscalVersion: '1.2.2' } },
    });
    await repo().create({
      uuid: rootUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: rootUuid,
        metadata: { title: 'Root', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: `#${childUuid}` }, { href: '#dangling' }],
      },
    });

    renderDetail(rootUuid);
    expect(await screen.findByRole('link', { name: /Child Def/ })).toHaveAttribute(
      'href',
      `/component-definitions/${childUuid}`,
    );
    expect(screen.getByTestId('cdef-import-node-unresolved')).toBeInTheDocument();
  });

  it('recurses transitively into a resolved import\'s own imports', async () => {
    await repo().create({
      uuid: grandchildUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid: grandchildUuid, metadata: { title: 'Grandchild', version: '1.0.0', oscalVersion: '1.2.2' } },
    });
    await repo().create({
      uuid: childUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: childUuid,
        metadata: { title: 'Child Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: `#${grandchildUuid}` }],
      },
    });
    await repo().create({
      uuid: rootUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: rootUuid,
        metadata: { title: 'Root', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: `#${childUuid}` }],
      },
    });

    renderDetail(rootUuid);
    expect(await screen.findByRole('link', { name: /Child Def/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Grandchild/ })).toBeInTheDocument();
  });

  it('flags a cycle instead of expanding forever', async () => {
    await repo().create({
      uuid: childUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: childUuid,
        metadata: { title: 'Child Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: `#${rootUuid}` }],
      },
    });
    await repo().create({
      uuid: rootUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: rootUuid,
        metadata: { title: 'Root', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: `#${childUuid}` }],
      },
    });

    renderDetail(rootUuid);
    expect(await screen.findByTestId('cdef-import-cycle')).toBeInTheDocument();
  });
});
