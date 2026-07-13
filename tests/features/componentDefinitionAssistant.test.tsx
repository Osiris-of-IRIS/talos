/**
 * Component-Definition Creation Assistant (T-511, ADR-0036): component fields + source pick +
 * generated-requirements-per-control flow, the has-param warning marker, and the reused
 * set-parameter widget. Covers TEST-CDA-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { ComponentDefinitionAssistantPage } from '@/features/componentDefinitions/ComponentDefinitionAssistantPage';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { Catalog } from '@/models/catalog';

const repo = () => ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
const catalogRepo = () => ArtifactRepository.forType<Catalog>('catalog');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/component-definitions/assistant" element={<ComponentDefinitionAssistantPage />} />
        <Route path="/component-definitions/:uuid" element={<div data-testid="detail-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const catalogUuid = 'cccccccc-1111-4111-8111-111111111111';

async function seedCatalog() {
  await catalogRepo().create({
    uuid: catalogUuid,
    type: 'catalog',
    origin: 'user',
    artifact: {
      uuid: catalogUuid,
      metadata: { title: 'Grundschutz Test', version: '1.0.0', oscalVersion: '1.2.2' },
      controls: [
        { id: 'C1', title: 'No-param control' },
        { id: 'C2', title: 'Param control', params: [{ id: 'p1', label: 'Value' }] },
        {
          id: 'C3',
          title: 'Alt-identifier control',
          props: [{ name: 'alt-identifier', value: 'aaaaaaaa-5555-4555-8555-555555555555' }],
        },
      ],
    } as Catalog,
  });
}

const otherCatalogUuid = 'cccccccc-2222-4222-8222-222222222222';

async function seedOtherCatalog() {
  await catalogRepo().create({
    uuid: otherCatalogUuid,
    type: 'catalog',
    origin: 'user',
    artifact: {
      uuid: otherCatalogUuid,
      metadata: { title: 'Other Catalog', version: '1.0.0', oscalVersion: '1.2.2' },
      controls: [{ id: 'X1', title: 'Unrelated control' }],
    } as Catalog,
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('gating and empty state', () => {
  it('disables create until a title and source are set', async () => {
    await seedCatalog();
    renderAt('/component-definitions/assistant');
    expect(screen.getByTestId('cdefa-create')).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByTestId('cdefa-component-title'), 'Firewall');
    expect(screen.getByTestId('cdefa-create')).toBeDisabled();

    await user.type(screen.getByTestId('cdefa-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    expect(screen.getByTestId('cdefa-create')).not.toBeDisabled();
  });

  it('shows a hint when the workspace has no catalogs or profiles yet', async () => {
    renderAt('/component-definitions/assistant');
    expect(await screen.findByTestId('cdefa-no-catalogs-hint')).toBeInTheDocument();
  });
});

describe('requirement generation', () => {
  it('creates a component-definition with one requirement per unique control and the generated title/description', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/component-definitions/assistant');

    await user.type(screen.getByTestId('cdefa-component-title'), 'Firewall');
    await user.type(screen.getByTestId('cdefa-component-description-textarea'), 'A perimeter firewall.');
    await user.type(screen.getByTestId('cdefa-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));

    // 3 unique controls, not 4 — C3's alt-identifier must not double-count it (ADR-0021).
    const rows = await screen.findAllByTestId('cdefa-requirement-row');
    expect(rows).toHaveLength(3);

    await user.type(within(rows[0]!).getByTestId('cdefa-requirement-description-textarea'), 'Covers C1.');

    await user.click(screen.getByTestId('cdefa-create'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const rec = (await repo().getAll())[0]!;
    expect(rec.artifact.metadata.title).toBe('Component definition for Firewall');
    const component = rec.artifact.components![0]!;
    expect(component.title).toBe('Firewall');
    expect(component.description).toBe('A perimeter firewall.');
    const ci = component.controlImplementations![0]!;
    expect(ci.description).toBe('Describes how Firewall implements the requirements from Grundschutz Test.');
    expect(ci.implementedRequirements).toHaveLength(3);
    expect(ci.implementedRequirements.map((r) => r.controlId).sort()).toEqual(['C1', 'C2', 'C3']);
    expect(ci.implementedRequirements.find((r) => r.controlId === 'C1')?.description).toBe('Covers C1.');
    expect(ci.implementedRequirements.find((r) => r.controlId === 'C2')?.description).toBeUndefined();

    // source is back-matter-mediated (item 5, ADR-0024), not the catalog's own uuid directly.
    expect(ci.source.startsWith('#')).toBe(true);
    const resourceUuid = ci.source.slice(1);
    const resource = rec.artifact.backMatter?.resources?.find((r) => r.uuid === resourceUuid);
    expect(resource?.documentIds?.[0]?.identifier).toBe(catalogUuid);
  });

  it('resets requirements when the source is changed to a different catalog', async () => {
    await seedCatalog();
    await seedOtherCatalog();
    const user = userEvent.setup();
    renderAt('/component-definitions/assistant');

    await user.type(screen.getByTestId('cdefa-component-title'), 'Firewall');
    await user.type(screen.getByTestId('cdefa-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    expect(await screen.findAllByTestId('cdefa-requirement-row')).toHaveLength(3);

    // Blur the source picker (focus elsewhere) before reopening it — mousedown-selecting a result
    // deliberately keeps the input focused (EntitySearchField.tsx), so a same-field clear+retype
    // with no intervening focus change never re-fires onFocus/reopens the dropdown.
    await user.click(screen.getByTestId('cdefa-component-title'));
    await user.clear(screen.getByTestId('cdefa-source-picker-input'));
    await user.type(screen.getByTestId('cdefa-source-picker-input'), 'Other');
    await user.click(await screen.findByText('Other Catalog'));

    await waitFor(async () => expect(await screen.findAllByTestId('cdefa-requirement-row')).toHaveLength(1));
  });
});

describe('has-param warning + set-parameter', () => {
  it('marks the control-with-params row and lets the user set its parameter values', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/component-definitions/assistant');

    await user.type(screen.getByTestId('cdefa-component-title'), 'Firewall');
    await user.type(screen.getByTestId('cdefa-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));

    const rows = await screen.findAllByTestId('cdefa-requirement-row');
    const c2Row = rows[1]!; // C1, C2, C3 in catalog order
    expect(c2Row.className).toContain('has-param-warning');
    expect(rows[0]!.className).not.toContain('has-param-warning');

    await user.click(within(c2Row).getByTestId('cdefa-set-parameter-toggle'));
    await user.click(within(c2Row).getByTestId('cdefa-add-set-parameter'));
    // the entity-search dropdown ranks by title (the param's label, "Value"), not its raw id.
    await user.type(within(c2Row).getByTestId('sp-param-id-input'), 'Value');
    await user.click(await screen.findByText('Value'));
    await user.type(within(c2Row).getByTestId('sp-values'), '42');

    await user.click(screen.getByTestId('cdefa-create'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const rec = (await repo().getAll())[0]!;
    const c2 = rec.artifact.components![0]!.controlImplementations![0]!.implementedRequirements.find(
      (r) => r.controlId === 'C2',
    );
    expect(c2?.setParameters).toEqual([{ paramId: 'p1', values: ['42'] }]);
  });
});
