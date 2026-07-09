/**
 * SSP feature: store + list + detail. Decision IDs: ADR-0001, ADR-0004, ADR-0023.
 * Covers TEST-SSP-01 (feature_registry IMPL-002).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { useSspsStore } from '@/features/ssps/store';
import { SspListPage } from '@/features/ssps/SspListPage';
import { SspDetailPage } from '@/features/ssps/SspDetailPage';
import golden from '../data/ssp-minimal.json';
import type { ComponentDefinition } from '@/models/componentDefinition';

const goldenText = JSON.stringify(golden);

function renderDetailAt(uuid: string) {
  return render(
    <MemoryRouter initialEntries={[`/ssps/${uuid}`]}>
      <Routes>
        <Route path="/ssps/:uuid" element={<SspDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useSspsStore.setState({ items: [], loading: false, error: null, selected: new Set() });
});

describe('store', () => {
  it('imports and lists an SSP', async () => {
    const uuid = await useSspsStore.getState().importFromText(goldenText);
    expect(uuid).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(useSspsStore.getState().items).toHaveLength(1);
  });

  it('rejects a non-SSP document', async () => {
    const cd = JSON.stringify({ 'component-definition': { uuid: 'x', metadata: { title: 't' } } });
    await expect(useSspsStore.getState().importFromText(cd)).rejects.toThrow(
      /Expected a system security plan/,
    );
  });
});

describe('list page', () => {
  it('shows the empty state, then the imported SSP', async () => {
    render(
      <MemoryRouter>
        <SspListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('ssp-empty')).toBeInTheDocument();
    await act(async () => {
      await useSspsStore.getState().importFromText(goldenText);
    });
    await waitFor(() => expect(screen.getByText('Beispiel-SSP Webserver')).toBeInTheDocument());
  });
});

describe('bulk selection (ADR-0027)', () => {
  it('toggles a row checkbox and shows/hides the bulk-actions bar', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await useSspsStore.getState().importFromText(goldenText);
    });
    render(
      <MemoryRouter>
        <SspListPage />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('ssp-bulk-actions')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('ssp-select-item'));
    expect(screen.getByTestId('ssp-selected-count')).toHaveTextContent('1');
  });

  it('download-selected surfaces a skip warning for an item with no valid creator (ADR-0019)', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await useSspsStore.getState().importFromText(goldenText);
    });
    render(
      <MemoryRouter>
        <SspListPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('ssp-select-item'));
    await user.click(screen.getByTestId('ssp-download-selected'));
    const warning = await screen.findByTestId('ssp-download-warning');
    expect(warning).toHaveTextContent('1');
    expect(warning).toHaveTextContent('Beispiel-SSP Webserver');
  });

  it('delete-selected removes the selected items only after confirmation', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await useSspsStore.getState().importFromText(goldenText);
    });
    render(
      <MemoryRouter>
        <SspListPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('ssp-select-item'));

    globalThis.confirm = () => false;
    await user.click(screen.getByTestId('ssp-delete-selected'));
    expect(useSspsStore.getState().items).toHaveLength(1);

    globalThis.confirm = () => true;
    await user.click(screen.getByTestId('ssp-delete-selected'));
    await waitFor(() => expect(useSspsStore.getState().items).toHaveLength(0));
  });
});

describe('detail page', () => {
  it('renders system characteristics and implemented requirements once sections are expanded', async () => {
    const uuid = await useSspsStore.getState().importFromText(goldenText);
    renderDetailAt(uuid);
    expect(await screen.findByTestId('ssp-detail')).toBeInTheDocument();

    // sections are collapsed by default (SSPs can be large)
    expect(screen.queryByTestId('ssp-system-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ssp-requirement')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('ssp-section-characteristics-toggle'));
    expect(screen.getByTestId('ssp-system-name')).toHaveTextContent('Webserver Cluster');

    await user.click(screen.getByTestId('ssp-section-control-impl-toggle'));
    // Requirements render as a control|implementation table (ADR-0028, matches the
    // component-definition detail page) — no per-requirement collapse, every row shows in full
    // once Control Implementation is open.
    expect(screen.getByTestId('ssp-requirements-table')).toBeInTheDocument();
    expect(screen.getByTestId('ssp-requirement')).toHaveTextContent('IA-5');
  });

  it('shows not-found for an unknown uuid', async () => {
    render(
      <MemoryRouter initialEntries={['/ssps/nope']}>
        <Routes>
          <Route path="/ssps/:uuid" element={<SspDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('ssp-not-found')).toBeInTheDocument();
  });

  it('links to the editor', async () => {
    const uuid = await useSspsStore.getState().importFromText(goldenText);
    renderDetailAt(uuid);
    expect(await screen.findByTestId('ssp-edit')).toHaveAttribute('href', `/ssps/${uuid}/edit`);
  });

  it('shows the by-component title, description, and implementation-status once expanded', async () => {
    const uuid = await useSspsStore.getState().importFromText(goldenText);
    renderDetailAt(uuid);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('ssp-section-control-impl-toggle'));

    const byComponent = screen.getByTestId('ssp-by-component');
    expect(byComponent).toHaveTextContent('nginx');
    expect(byComponent).toHaveTextContent('nginx enforces password policy for admin access.');
  });

  it('shows a staleness badge for an imported component whose source has changed', async () => {
    const cdUuid = 'cd-changed';
    await ArtifactRepository.forType<ComponentDefinition>('componentDefinition').create({
      uuid: cdUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: cdUuid,
        metadata: { title: 'nginx CD', version: '1.0.0', oscalVersion: '1.2.2' },
        components: [{ uuid: 'comp-nginx', type: 'software', title: 'nginx', description: 'CHANGED description' }],
      },
    });
    const uuid = await useSspsStore.getState().importFromText(
      JSON.stringify({
        'system-security-plan': {
          ...(golden as { 'system-security-plan': Record<string, unknown> })['system-security-plan'],
          uuid: 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb',
          'system-implementation': {
            users: [],
            components: [
              {
                uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                type: 'software',
                title: 'nginx',
                description: 'Reverse proxy and web server.',
                status: { state: 'operational' },
                props: [
                  { name: 'source-component-definition-uuid', value: cdUuid },
                  { name: 'source-component-uuid', value: 'comp-nginx' },
                  { name: 'source-snapshot', value: 'stale-hash' },
                ],
              },
            ],
          },
        },
      }),
    );

    renderDetailAt(uuid);
    await userEvent.setup().click(await screen.findByTestId('ssp-section-implementation-toggle'));
    expect(screen.getByTestId('ssp-component-stale-badge')).toBeInTheDocument();
  });
});
