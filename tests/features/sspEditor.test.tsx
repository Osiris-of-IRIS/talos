/**
 * SSP editor: create/edit, system-characteristics, system-implementation (component import +
 * staleness + refresh), control-implementation (requirements + by-components + status), and
 * default-collapsed sections/rows. Decision IDs: ADR-0001, ADR-0003, ADR-0017, ADR-0023.
 * Covers TEST-SSP-03.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { SspEditorPage } from '@/features/ssps/SspEditorPage';
import { parseOscalUpload } from '@/data/fileIo';
import type { SystemSecurityPlan } from '@/models/ssp';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { Catalog } from '@/models/catalog';
import catalogJson from '../data/catalog-minimal.json';

const sspRepo = () => ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');
const cdRepo = () => ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
const catalogRepo = () => ArtifactRepository.forType<Catalog>('catalog');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ssps/new" element={<SspEditorPage />} />
        <Route path="/ssps/:uuid/edit" element={<SspEditorPage />} />
        <Route path="/ssps/:uuid" element={<div data-testid="detail-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function seedComponentDefinition() {
  const cdUuid = '77777777-7777-4777-8777-777777777777';
  await cdRepo().create({
    uuid: cdUuid,
    type: 'componentDefinition',
    origin: 'user',
    artifact: {
      uuid: cdUuid,
      metadata: { title: 'nginx CD', version: '1.0.0', oscalVersion: '1.2.2' },
      components: [
        {
          uuid: 'comp-nginx',
          type: 'software',
          title: 'nginx',
          description: 'Reverse proxy and web server.',
        },
      ],
    },
  });
  return cdUuid;
}

async function seedComponentDefinitionWithRequirement() {
  const cdUuid = '88888888-8888-4888-8888-888888888888';
  await cdRepo().create({
    uuid: cdUuid,
    type: 'componentDefinition',
    origin: 'user',
    artifact: {
      uuid: cdUuid,
      metadata: { title: 'nginx CD', version: '1.0.0', oscalVersion: '1.2.2' },
      components: [
        {
          uuid: 'comp-nginx',
          type: 'software',
          title: 'nginx',
          description: 'Reverse proxy and web server.',
          controlImplementations: [
            {
              uuid: 'ci-1',
              source: '#cat',
              description: 'impl',
              implementedRequirements: [
                { uuid: 'ir-1', controlId: 'IA-5', description: 'nginx enforces password policy for admin access.' },
              ],
            },
          ],
        },
      ],
    },
  });
  return cdUuid;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('create', () => {
  it('creates a blank SSP from metadata, with sections auto-expanded for a new document', async () => {
    const user = userEvent.setup();
    renderAt('/ssps/new');

    expect(screen.getByTestId('ssp-editor')).toBeInTheDocument();
    // new-document sections start expanded so the author can start typing immediately
    expect(screen.getByTestId('ssp-section-characteristics-body')).toBeInTheDocument();
    expect(screen.getByTestId('ssp-section-implementation-body')).toBeInTheDocument();
    expect(screen.getByTestId('ssp-section-control-impl-body')).toBeInTheDocument();

    await user.type(screen.getByTestId('md-title'), 'My SSP');
    await user.click(screen.getByTestId('save-ssp'));

    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());
    const all = await sspRepo().getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.artifact.metadata.title).toBe('My SSP');
    expect(all[0]!.origin).toBe('user');
  });

  it('does not save without a title', async () => {
    const user = userEvent.setup();
    renderAt('/ssps/new');
    await waitFor(() => expect(screen.getByTestId('si-no-component-defs-hint')).toBeInTheDocument());
    await user.click(screen.getByTestId('save-ssp'));
    expect(await sspRepo().count()).toBe(0);
  });
});

describe('system characteristics', () => {
  it('edits system name, description, status, and authorization boundary', async () => {
    const user = userEvent.setup();
    renderAt('/ssps/new');
    await user.type(screen.getByTestId('md-title'), 'Chars SSP');
    await user.type(screen.getByTestId('sc-system-name'), 'Web Cluster');
    await user.type(screen.getByTestId('sc-description-textarea'), 'Public web hosting.');
    await user.clear(screen.getByTestId('sc-status'));
    await user.type(screen.getByTestId('sc-status'), 'operational');
    await user.type(screen.getByTestId('sc-authorization-boundary-textarea'), 'The cluster and its LB.');

    await user.click(screen.getByTestId('save-ssp'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const ssp = (await sspRepo().getAll())[0]!.artifact;
    expect(ssp.systemCharacteristics.systemName).toBe('Web Cluster');
    expect(ssp.systemCharacteristics.description).toBe('Public web hosting.');
    expect(ssp.systemCharacteristics.status.state).toBe('operational');
    expect(ssp.systemCharacteristics.authorizationBoundary.description).toBe('The cluster and its LB.');
  });
});

describe('system implementation — import components from component-definitions', () => {
  it('imports a component-definition component into system-implementation.components', async () => {
    await seedComponentDefinition();
    const user = userEvent.setup();
    renderAt('/ssps/new');
    await user.type(screen.getByTestId('md-title'), 'Import SSP');

    await waitFor(() => expect(screen.getByTestId('si-cd-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-cd-select'), 'nginx CD');
    await waitFor(() => expect(within(screen.getByTestId('si-component-select')).getByText('nginx')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-component-select'), 'comp-nginx');
    await user.click(screen.getByTestId('si-import'));

    const summaries = screen.getAllByTestId('si-component-summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toHaveClass('collapsible-toggle'); // UI feedback items 1+4
    expect(summaries[0]).toHaveTextContent('nginx');
    expect(summaries[0]).toHaveTextContent('software');

    await user.click(screen.getByTestId('save-ssp'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());
    const ssp = (await sspRepo().getAll())[0]!.artifact;
    expect(ssp.systemImplementation.components).toHaveLength(1);
    expect(ssp.systemImplementation.components[0]!.title).toBe('nginx');
    expect(ssp.systemImplementation.components[0]!.props?.some((p) => p.name === 'source-component-uuid')).toBe(true);
  });

  it('shows no staleness badge immediately after import (source unchanged)', async () => {
    await seedComponentDefinition();
    const user = userEvent.setup();
    renderAt('/ssps/new');
    await waitFor(() => expect(screen.getByTestId('si-cd-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-cd-select'), 'nginx CD');
    await user.selectOptions(screen.getByTestId('si-component-select'), 'comp-nginx');
    await user.click(screen.getByTestId('si-import'));

    expect(screen.queryByTestId('si-component-stale-badge')).not.toBeInTheDocument();
  });
});

describe('control implementation — requirements, by-components, status', () => {
  it('adds a requirement with a by-component referencing an imported system component', async () => {
    await seedComponentDefinition();
    const user = userEvent.setup();
    renderAt('/ssps/new');
    await user.type(screen.getByTestId('md-title'), 'CI SSP');

    // import a component first so it's available to the by-components picker
    await waitFor(() => expect(screen.getByTestId('si-cd-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-cd-select'), 'nginx CD');
    await user.selectOptions(screen.getByTestId('si-component-select'), 'comp-nginx');
    await user.click(screen.getByTestId('si-import'));

    await user.click(screen.getByTestId('ci-add-requirement'));
    await user.type(screen.getByTestId('ir-control-id'), 'IA-5');

    await user.click(screen.getByTestId('ci-add-by-component'));
    await waitFor(() => expect(within(screen.getByTestId('bc-component-select')).getByText('nginx')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('bc-component-select'), 'nginx');
    await user.type(screen.getByTestId('bc-description-textarea'), 'nginx enforces password policy.');
    await user.selectOptions(screen.getByTestId('bc-status'), 'implemented');

    await user.click(screen.getByTestId('save-ssp'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const ssp = (await sspRepo().getAll())[0]!.artifact;
    const ir = ssp.controlImplementation.implementedRequirements[0]!;
    expect(ir.controlId).toBe('IA-5');
    const bc = ir.byComponents![0]!;
    expect(bc.description).toBe('nginx enforces password policy.');
    expect(bc.componentUuid).toBe(ssp.systemImplementation.components[0]!.uuid);
    expect(bc.props?.find((p) => p.name === 'implementation-status')?.value).toBe('implemented');
  });

  it('prefills a new by-component\'s description from the source component\'s matching requirement (item 3, ADR-0028)', async () => {
    await seedComponentDefinitionWithRequirement();
    const user = userEvent.setup();
    renderAt('/ssps/new');
    await user.type(screen.getByTestId('md-title'), 'Prefill SSP');

    await waitFor(() => expect(screen.getByTestId('si-cd-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-cd-select'), 'nginx CD');
    await user.selectOptions(screen.getByTestId('si-component-select'), 'comp-nginx');
    await user.click(screen.getByTestId('si-import'));

    await user.click(screen.getByTestId('ci-add-requirement'));
    await user.type(screen.getByTestId('ir-control-id'), 'IA-5');
    await user.click(screen.getByTestId('ci-add-by-component'));
    await waitFor(() => expect(within(screen.getByTestId('bc-component-select')).getByText('nginx')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('bc-component-select'), 'nginx');

    await waitFor(() =>
      expect(screen.getByTestId('bc-description-textarea')).toHaveValue(
        'nginx enforces password policy for admin access.',
      ),
    );
  });

  it('does not overwrite a description the user already typed when picking/changing the component', async () => {
    await seedComponentDefinitionWithRequirement();
    const user = userEvent.setup();
    renderAt('/ssps/new');
    await waitFor(() => expect(screen.getByTestId('si-cd-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-cd-select'), 'nginx CD');
    await user.selectOptions(screen.getByTestId('si-component-select'), 'comp-nginx');
    await user.click(screen.getByTestId('si-import'));

    await user.click(screen.getByTestId('ci-add-requirement'));
    await user.type(screen.getByTestId('ir-control-id'), 'IA-5');
    await user.click(screen.getByTestId('ci-add-by-component'));
    await user.type(screen.getByTestId('bc-description-textarea'), 'My own custom description.');
    await user.selectOptions(screen.getByTestId('bc-component-select'), 'nginx');

    expect(screen.getByTestId('bc-description-textarea')).toHaveValue('My own custom description.');
  });

  it('control-id datalist shows "{label|id} {title}" display text, unscoped across all workspace catalogs (item 7)', async () => {
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await catalogRepo().create({ uuid: record.uuid, type: 'catalog', origin: 'imported', artifact: record.artifact });

    const user = userEvent.setup();
    const { container } = renderAt('/ssps/new');
    await user.click(screen.getByTestId('ci-add-requirement'));
    await waitFor(() =>
      expect(container.querySelector('option[value="ASST.1.1.2"]')?.textContent).toBe('ASST.1.1.2 Zuweisung'),
    );
  });

  it('removing a system-implementation component cascades to remove its by-components entries', async () => {
    await seedComponentDefinition();
    const user = userEvent.setup();
    renderAt('/ssps/new');
    await user.type(screen.getByTestId('md-title'), 'Cascade SSP');
    await waitFor(() => expect(screen.getByTestId('si-cd-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-cd-select'), 'nginx CD');
    await user.selectOptions(screen.getByTestId('si-component-select'), 'comp-nginx');
    await user.click(screen.getByTestId('si-import'));

    await user.click(screen.getByTestId('ci-add-requirement'));
    await user.click(screen.getByTestId('ci-add-by-component'));
    await user.selectOptions(screen.getByTestId('bc-component-select'), 'nginx');
    expect(screen.getAllByTestId('bc-row')).toHaveLength(1);

    await user.click(screen.getByTestId('si-remove-component'));
    expect(screen.queryAllByTestId('bc-row')).toHaveLength(0);
  });
});

describe('loaded (existing) SSP — sections and rows collapsed by default', () => {
  const uuid = '99999999-1111-4999-8999-999999999999';

  it('collapses all sections and rows on load, and reflects staleness for a changed source component', async () => {
    const cdUuid = await seedComponentDefinition();
    const compUuid = 'comp-nginx';
    const scUuid = 'sc-imported-1';
    await sspRepo().create({
      uuid,
      type: 'systemSecurityPlan',
      origin: 'user',
      artifact: {
        uuid,
        metadata: { title: 'Loaded SSP', version: '1.0.0', oscalVersion: '1.2.2' },
        importProfile: { href: '' },
        systemCharacteristics: {
          systemIds: [],
          systemName: 'Existing System',
          description: 'x',
          systemInformation: { informationTypes: [] },
          status: { state: 'operational' },
          authorizationBoundary: { description: 'x' },
        },
        systemImplementation: {
          users: [],
          components: [
            {
              uuid: scUuid,
              type: 'software',
              title: 'nginx',
              description: 'Reverse proxy and web server.',
              status: { state: 'operational' },
              props: [
                { name: 'source-component-definition-uuid', value: cdUuid },
                { name: 'source-component-uuid', value: compUuid },
                { name: 'source-snapshot', value: 'deadbeef' }, // deliberately stale vs. live source
              ],
            },
          ],
        },
        controlImplementation: {
          description: 'x',
          implementedRequirements: [{ uuid: 'ir-1', controlId: 'IA-5', byComponents: [] }],
        },
      },
    });

    renderAt(`/ssps/${uuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Loaded SSP'));

    expect(screen.queryByTestId('ssp-section-characteristics-body')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ssp-section-implementation-body')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ssp-section-control-impl-body')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('ssp-section-implementation-toggle'));
    expect(screen.queryByTestId('si-component-body')).not.toBeInTheDocument();
    expect(screen.getByTestId('si-component-stale-badge')).toBeInTheDocument();

    // per-item collapse also applies to requirements within Control Implementation
    await user.click(screen.getByTestId('ssp-section-control-impl-toggle'));
    expect(screen.getByTestId('ir-summary')).toHaveTextContent('IA-5');
    expect(screen.getByTestId('ir-row')).toHaveClass('collapsible-section'); // UI feedback items 1+4
    expect(screen.queryByTestId('ir-control-id')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('ir-summary'));
    expect(screen.getByTestId('ir-control-id')).toHaveValue('IA-5');
  });
});
