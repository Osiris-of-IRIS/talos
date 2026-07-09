/**
 * Component-definition editor: create, edit, link-externalization. Decision IDs: ADR-0001, ADR-0003, ADR-0015.
 * Covers TEST-CDEF-EDIT-01 (feature IMPL-001, T-101).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { ComponentDefinitionEditorPage } from '@/features/componentDefinitions/ComponentDefinitionEditorPage';
import { parseOscalUpload } from '@/data/fileIo';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { Catalog } from '@/models/catalog';
import catalogJson from '../data/catalog-minimal.json';

const repo = () => ArtifactRepository.forType<ComponentDefinition>('componentDefinition');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/component-definitions/new" element={<ComponentDefinitionEditorPage />} />
        <Route path="/component-definitions/:uuid/edit" element={<ComponentDefinitionEditorPage />} />
        <Route path="/component-definitions/:uuid" element={<div data-testid="detail-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('create', () => {
  it('creates a component-definition with a component and an externalized link', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');

    await user.type(screen.getByTestId('md-title'), 'My Policy');
    await user.click(screen.getByTestId('add-component'));
    await user.type(screen.getByTestId('component-title'), 'X'); // append to default title

    await user.type(screen.getByTestId('md-link-href'), 'https://nist.gov');
    await user.type(screen.getByTestId('md-link-text'), 'NIST');
    await user.click(screen.getByTestId('md-add-link'));

    await user.click(screen.getByTestId('save-compdef'));

    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const all = await repo().getAll();
    expect(all).toHaveLength(1);
    const cd = all[0]!.artifact;
    expect(cd.metadata.title).toBe('My Policy');
    expect(cd.components).toHaveLength(1);
    // external link externalized into back-matter, referenced by #uuid (ADR-0015)
    const link = cd.metadata.links?.[0];
    expect(link?.href).toMatch(/^#/);
    const resId = link!.href.slice(1);
    expect(cd.backMatter?.resources?.find((r) => r.uuid === resId)?.rlinks?.[0]?.href).toBe(
      'https://nist.gov',
    );
    expect(all[0]!.origin).toBe('user');
  });

  it('does not save without a title', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');
    await user.click(screen.getByTestId('save-compdef'));
    expect(await repo().count()).toBe(0);
  });
});

describe('component body: type + control-implementations', () => {
  it('sets a custom type and builds a full implemented-requirement with a set-parameter', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');

    await user.type(screen.getByTestId('md-title'), 'Body Test');
    await user.click(screen.getByTestId('add-component'));

    // type field is a datalist input — accepts a standard value or a custom one
    const typeInput = screen.getByTestId('component-type');
    await user.clear(typeInput);
    await user.type(typeInput, 'policy');

    await user.click(screen.getByTestId('add-control-implementation'));
    await user.type(screen.getByTestId('ci-source'), '#cat-1');
    await user.click(screen.getByTestId('add-requirement'));
    await user.type(screen.getByTestId('ir-control-id'), 'ASST.1.1.2');
    await user.type(screen.getByTestId('ir-description-textarea'), 'nginx enforces the policy.');
    await user.type(screen.getByTestId('ir-remarks-textarea'), 'reviewed 2026');
    await user.click(screen.getByTestId('add-set-parameter'));
    await user.type(screen.getByTestId('sp-param-id'), 'asst.1.1.2-prm1');
    await user.type(screen.getByTestId('sp-values'), 'den IT-Betrieb, die Rolle');

    await user.click(screen.getByTestId('save-compdef'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const cd = (await repo().getAll())[0]!.artifact;
    const comp = cd.components![0]!;
    expect(comp.type).toBe('policy');
    const ci = comp.controlImplementations![0]!;
    expect(ci.source).toBe('#cat-1');
    const ir = ci.implementedRequirements[0]!;
    expect(ir.controlId).toBe('ASST.1.1.2');
    expect(ir.description).toBe('nginx enforces the policy.');
    expect(ir.remarks).toBe('reviewed 2026');
    expect(ir.setParameters![0]).toEqual({ paramId: 'asst.1.1.2-prm1', values: ['den IT-Betrieb', 'die Rolle'] });
  });
});

describe('source→catalog + param pickers (T-142)', () => {
  it('offers workspace catalogs, control-ids and params as datalist options', async () => {
    const user = userEvent.setup();
    // Seed a workspace catalog so the pickers have something to resolve.
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: record.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: record.artifact,
    });

    const { container } = renderAt('/component-definitions/new');
    const optionValues = () =>
      Array.from(container.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'));

    await user.type(screen.getByTestId('md-title'), 'Picker Test');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));

    // source datalist offers the catalog (async index load) by title, value = #uuid
    await waitFor(() => expect(screen.getByText('BSI Kernel (excerpt)')).toBeInTheDocument());
    expect(optionValues()).toContain(`#${record.uuid}`);

    // pick the catalog as source → resolves
    await user.type(screen.getByTestId('ci-source'), `#${record.uuid}`);
    expect(await screen.findByTestId('ci-source-resolved')).toHaveTextContent('BSI Kernel (excerpt)');

    // add a requirement → its control-id datalist offers the catalog's control ids, with a
    // readable "{label|id} {title}" display text, not just the raw id (item 7)
    await user.click(screen.getByTestId('add-requirement'));
    await waitFor(() => expect(optionValues()).toContain('ASST.1.1.2'));
    expect(container.querySelector('option[value="ASST.1.1.2"]')?.textContent).toBe('ASST.1.1.2 Zuweisung');

    // once a control is chosen, its params are offered as set-parameter options
    await user.type(screen.getByTestId('ir-control-id'), 'ASST.1.1.2');
    await user.click(screen.getByTestId('add-set-parameter'));
    await waitFor(() => expect(optionValues()).toContain('asst.1.1.2-prm1'));
  });

  it('picking a catalog creates a back-matter resource and stores a resource-mediated source, not the raw catalog uuid (item 5)', async () => {
    const user = userEvent.setup();
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: record.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: record.artifact,
    });

    renderAt('/component-definitions/new');
    await user.type(screen.getByTestId('md-title'), 'Source Resolution Test');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));
    await waitFor(() => expect(screen.getByText('BSI Kernel (excerpt)')).toBeInTheDocument());

    await user.type(screen.getByTestId('ci-source'), `#${record.uuid}`);
    await screen.findByTestId('ci-source-resolved');

    await user.click(screen.getByTestId('save-compdef'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const cd = (await repo().getAll())[0]!.artifact;
    const source = cd.components![0]!.controlImplementations![0]!.source;
    expect(source).not.toBe(`#${record.uuid}`); // not the raw catalog uuid
    const resourceUuid = source.slice(1);
    const resource = cd.backMatter?.resources?.find((r) => r.uuid === resourceUuid);
    expect(resource?.documentIds?.[0]?.identifier).toBe(record.uuid);
  });
});

describe('no workspace catalogs — guidance message (T-161)', () => {
  it('shows an info message linking to catalog upload/library when no catalogs exist', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');
    await user.type(screen.getByTestId('md-title'), 'No Catalogs');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));

    const hint = await screen.findByTestId('no-catalogs-hint');
    expect(hint).toHaveTextContent(/upload|adopt/i);
    expect(screen.getByRole('link', { name: /catalogs/i })).toHaveAttribute('href', '/catalogs');
    expect(screen.getByRole('link', { name: /library/i })).toHaveAttribute('href', '/library');
  });

  it('does not show the message once a workspace catalog exists', async () => {
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: record.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: record.artifact,
    });

    const user = userEvent.setup();
    renderAt('/component-definitions/new');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));

    await waitFor(() => expect(screen.getByText('BSI Kernel (excerpt)')).toBeInTheDocument());
    expect(screen.queryByTestId('no-catalogs-hint')).not.toBeInTheDocument();
  });
});

describe('edit', () => {
  it('updates an existing component-definition', async () => {
    const uuid = '99999999-9999-4999-8999-999999999999';
    await repo().create({
      uuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid, metadata: { title: 'Old', version: '1.0.0', oscalVersion: '1.2.2' }, components: [] },
    });

    const user = userEvent.setup();
    renderAt(`/component-definitions/${uuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Old'));

    await user.clear(screen.getByTestId('md-title'));
    await user.type(screen.getByTestId('md-title'), 'New Title');
    await user.click(screen.getByTestId('save-compdef'));

    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());
    const rec = await repo().get(uuid);
    expect(rec?.artifact.metadata.title).toBe('New Title');
  });
});

describe('component list — collapse/expand (item 2)', () => {
  const uuid = '88888888-8888-4888-8888-888888888888';

  async function seedTwoComponents() {
    await repo().create({
      uuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid,
        metadata: { title: 'Multi', version: '1.0.0', oscalVersion: '1.2.2' },
        components: [
          {
            uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            type: 'software',
            title: 'nginx',
            description: 'web server',
            controlImplementations: [
              {
                uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                source: '#cat-1',
                description: 'ci',
                implementedRequirements: [
                  { uuid: 'r1', controlId: 'ASST.1.1.2' },
                  { uuid: 'r2', controlId: 'ASST.1.1.3' },
                ],
              },
            ],
          },
          {
            uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            type: 'policy',
            title: 'password policy',
            description: 'policy doc',
          },
        ],
      },
    });
  }

  it('renders existing components collapsed (title/type/requirement count), and expands on click', async () => {
    await seedTwoComponents();
    const user = userEvent.setup();
    renderAt(`/component-definitions/${uuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Multi'));

    const summaries = screen.getAllByTestId('compdef-component-summary');
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toHaveClass('collapsible-toggle'); // UI feedback items 1+4
    expect(summaries[0]).toHaveTextContent('nginx');
    expect(summaries[0]).toHaveTextContent('software');
    expect(summaries[0]).toHaveTextContent('2'); // 2 implemented-requirements
    expect(summaries[1]).toHaveTextContent('password policy');
    expect(summaries[1]).toHaveTextContent('0');

    // collapsed by default: no field inputs visible yet
    expect(screen.queryAllByTestId('component-title')).toHaveLength(0);

    await user.click(summaries[0]!);
    expect(screen.getByTestId('component-title')).toHaveValue('nginx');

    // the other component is still collapsed
    expect(screen.queryAllByTestId('component-title')).toHaveLength(1);

    await user.click(summaries[0]!);
    expect(screen.queryAllByTestId('component-title')).toHaveLength(0);
  });

  it('auto-expands a newly-added component', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');
    await user.click(screen.getByTestId('add-component'));
    expect(screen.getByTestId('component-title')).toBeInTheDocument();
  });
});
