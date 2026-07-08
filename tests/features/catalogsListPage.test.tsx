/**
 * Catalogs list page: upload/list/delete + bulk selection (ADR-0027).
 * Covers TEST-CAT-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { useCatalogsStore } from '@/features/catalogs/store';
import { CatalogsListPage } from '@/features/catalogs/CatalogsListPage';
import golden from '../data/catalog-minimal.json';

const goldenText = JSON.stringify(golden);

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useCatalogsStore.setState({ items: [], loading: false, error: null, selected: new Set() });
});

describe('list page', () => {
  it('shows the empty state, then the imported catalog', async () => {
    render(
      <MemoryRouter>
        <CatalogsListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('catalog-empty')).toBeInTheDocument();
    await act(async () => {
      await useCatalogsStore.getState().importFromText(goldenText);
    });
    await waitFor(() => expect(screen.getByText('BSI Kernel (excerpt)')).toBeInTheDocument());
  });
});

describe('bulk selection (ADR-0027)', () => {
  it('toggles a row checkbox and shows the bulk-actions bar', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await useCatalogsStore.getState().importFromText(goldenText);
    });
    render(
      <MemoryRouter>
        <CatalogsListPage />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('catalog-bulk-actions')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('catalog-select-item'));
    expect(screen.getByTestId('catalog-selected-count')).toHaveTextContent('1');
  });

  it('download-selected surfaces a skip warning for a catalog with no valid creator (ADR-0019)', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await useCatalogsStore.getState().importFromText(goldenText);
    });
    render(
      <MemoryRouter>
        <CatalogsListPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('catalog-select-item'));
    await user.click(screen.getByTestId('catalog-download-selected'));
    const warning = await screen.findByTestId('catalog-download-warning');
    expect(warning).toHaveTextContent('1');
    expect(warning).toHaveTextContent('BSI Kernel (excerpt)');
  });

  it('delete-selected removes the selected items only after confirmation', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await useCatalogsStore.getState().importFromText(goldenText);
    });
    render(
      <MemoryRouter>
        <CatalogsListPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('catalog-select-item'));

    globalThis.confirm = () => false;
    await user.click(screen.getByTestId('catalog-delete-selected'));
    expect(useCatalogsStore.getState().items).toHaveLength(1);

    globalThis.confirm = () => true;
    await user.click(screen.getByTestId('catalog-delete-selected'));
    await waitFor(() => expect(useCatalogsStore.getState().items).toHaveLength(0));
  });
});
