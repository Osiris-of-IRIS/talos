/**
 * SSP feature: store + list + detail. Decision IDs: ADR-0001, ADR-0004.
 * Covers TEST-SSP-01 (feature_registry IMPL-002).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { useSspsStore } from '@/features/ssps/store';
import { SspListPage } from '@/features/ssps/SspListPage';
import { SspDetailPage } from '@/features/ssps/SspDetailPage';
import golden from '../data/ssp-minimal.json';

const goldenText = JSON.stringify(golden);

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useSspsStore.setState({ items: [], loading: false, error: null });
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

describe('detail page', () => {
  it('renders system characteristics and implemented requirements', async () => {
    const uuid = await useSspsStore.getState().importFromText(goldenText);
    render(
      <MemoryRouter initialEntries={[`/ssps/${uuid}`]}>
        <Routes>
          <Route path="/ssps/:uuid" element={<SspDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('ssp-detail')).toBeInTheDocument();
    expect(screen.getByTestId('ssp-system-name')).toHaveTextContent('Webserver Cluster');
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
});
