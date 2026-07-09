/**
 * ControlImplementationsEditor — resolved control display (40/60, item 3) and choice-constrained
 * set-parameters (item 4). Decision IDs: ADR-0001, ADR-0003, ADR-0013, ADR-0016, ADR-0030.
 * Covers TEST-CDEF-EDIT-03 (feature_registry IMPL-001).
 *
 * Uses a hand-built CatalogIndex (via buildCatalogIndex over an in-memory Catalog object) instead
 * of the shared tests/data/catalog-minimal.json fixture, deliberately: that fixture's one param
 * (asst.1.1.2-prm1) is reused verbatim by several other tests asserting free-text set-parameter
 * behavior, so adding a `select.choice` to it (or adding a sibling control, which would change the
 * fixture's control-id counts) would risk breaking those. A fresh, local fixture keeps this test
 * fully isolated.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlImplementationsEditor } from '@/features/componentDefinitions/ControlImplementationsEditor';
import { buildCatalogIndex, type CatalogIndex } from '@/data/catalogResolution';
import type { Catalog } from '@/models/catalog';
import type { StoredArtifact } from '@/data/db';
import type { DefinedComponent } from '@/models/componentDefinition';

const CATALOG_UUID = 'cccccccc-1111-4000-8000-000000000001';

function makeCatalogIndex(): CatalogIndex {
  const catalog: Catalog = {
    uuid: CATALOG_UUID,
    metadata: { title: 'Test Catalog', version: '1.0.0', oscalVersion: '1.2.2', lastModified: '2026-07-09T00:00:00Z' },
    controls: [
      {
        id: 'TEST.1',
        title: 'Test Control',
        params: [
          { id: 'plain-prm', label: 'Plain param' },
          {
            id: 'single-choice-prm',
            label: 'Single-choice param',
            select: { howMany: 'one', choice: ['low', 'medium', 'high'] },
          },
          {
            id: 'multi-choice-prm',
            label: 'Multi-choice param',
            select: { howMany: 'one-or-more', choice: ['red', 'green', 'blue'] },
          },
        ],
        parts: [{ name: 'statement', prose: 'Do the thing.' }],
      },
    ],
  };
  return buildCatalogIndex([{ uuid: catalog.uuid, artifact: catalog } as StoredArtifact<Catalog>]);
}

function makeComponent(controlId: string): DefinedComponent {
  return {
    uuid: 'comp-1',
    type: 'software',
    title: 'Comp',
    description: 'desc',
    controlImplementations: [
      {
        uuid: 'ci-1',
        source: `#${CATALOG_UUID}`,
        description: 'CI description',
        implementedRequirements: [
          { uuid: 'ir-1', controlId, setParameters: [] },
        ],
      },
    ],
  };
}

function Harness({ controlId }: { controlId: string }) {
  const [value, setValue] = useState<DefinedComponent>(makeComponent(controlId));
  const catalogIndex = makeCatalogIndex();
  return (
    <>
      <ControlImplementationsEditor value={value} onChange={setValue} catalogIndex={catalogIndex} />
      <pre data-testid="dump">{JSON.stringify(value)}</pre>
    </>
  );
}

function dump(): DefinedComponent {
  return JSON.parse(screen.getByTestId('dump').textContent!) as DefinedComponent;
}

describe('resolved control display, 40/60 (UI feedback item 3)', () => {
  it('shows the resolved control content next to the requirement editor fields', () => {
    render(<Harness controlId="TEST.1" />);
    expect(screen.getByTestId('ir-requirements-table')).toBeInTheDocument();
    expect(screen.getByTestId('control-display')).toBeInTheDocument();
    expect(screen.getByTestId('control-headline')).toHaveTextContent('Test Control');
    // editable fields are still present, in the same row
    expect(screen.getByTestId('ir-description-textarea')).toBeInTheDocument();
  });

  it('shows a hint (not a blocking error) when the control-id does not resolve', () => {
    render(<Harness controlId="UNKNOWN.1" />);
    expect(screen.queryByTestId('control-display')).not.toBeInTheDocument();
    expect(screen.getByTestId('ir-control-unresolved-hint')).toBeInTheDocument();
    // editing is never blocked by an unresolved control
    expect(screen.getByTestId('ir-description-textarea')).toBeInTheDocument();
  });
});

describe('choice-constrained set-parameters (UI feedback item 4)', () => {
  it('keeps free-text values for a param with no select.choice', async () => {
    const user = userEvent.setup();
    render(<Harness controlId="TEST.1" />);
    await user.click(screen.getByTestId('add-set-parameter'));
    await user.type(screen.getByTestId('sp-param-id'), 'plain-prm');
    await user.type(screen.getByTestId('sp-values'), 'anything, goes');
    expect(dump().controlImplementations![0]!.implementedRequirements[0]!.setParameters![0]).toEqual({
      paramId: 'plain-prm',
      values: ['anything', 'goes'],
    });
  });

  it('renders a single-select dropdown constrained to the choices (howMany: one)', async () => {
    const user = userEvent.setup();
    render(<Harness controlId="TEST.1" />);
    await user.click(screen.getByTestId('add-set-parameter'));
    await user.type(screen.getByTestId('sp-param-id'), 'single-choice-prm');

    const select = screen.getByTestId('sp-values-select');
    expect(within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(
      expect.arrayContaining(['low', 'medium', 'high']),
    );
    await user.selectOptions(select, 'medium');
    expect(dump().controlImplementations![0]!.implementedRequirements[0]!.setParameters![0]).toEqual({
      paramId: 'single-choice-prm',
      values: ['medium'],
    });
  });

  it('renders checkboxes constrained to the choices (howMany: one-or-more), allowing multiple', async () => {
    const user = userEvent.setup();
    render(<Harness controlId="TEST.1" />);
    await user.click(screen.getByTestId('add-set-parameter'));
    await user.type(screen.getByTestId('sp-param-id'), 'multi-choice-prm');

    await user.click(screen.getByRole('checkbox', { name: 'red' }));
    await user.click(screen.getByRole('checkbox', { name: 'blue' }));
    const values = dump().controlImplementations![0]!.implementedRequirements[0]!.setParameters![0]!.values!;
    expect(values).toEqual(expect.arrayContaining(['red', 'blue']));
    expect(values).toHaveLength(2);
  });
});
