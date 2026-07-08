/**
 * Assets upload/list page (ADR-0026).
 * Covers TEST-ASSET-04.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { useAssetsStore } from '@/features/assets/store';
import { AssetsListPage } from '@/features/assets/AssetsListPage';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useAssetsStore.setState({
    assets: [],
    assetTypes: [],
    loading: false,
    error: null,
    warnings: [],
    selected: new Set(),
  });
});

async function seedTwoAssets() {
  await useAssetsStore
    .getState()
    .importCsvTrio(
      'uuid,title\nclient-pc,Desktop-PC (Client)\n',
      'uuid,name,asset_type,description,security-sensitivity-level,information-types\n' +
        'C001,Finance Clients,client-pc,,normal,\nC002,IT Clients,client-pc,,normal,\n',
      'asset_type_uuid,targetobj_class_uuid\nclient-pc,837781a4-7b47-4695-9545-a3310eac7a66\n',
    );
}

describe('AssetsListPage', () => {
  // Real file-input upload (input.files -> File.text()) needs a real browser: covered by the
  // Playwright e2e spec (tests/e2e/bootstrap.spec.ts). This component test drives the store
  // directly, matching the convention used by the other list-page tests.
  it('shows the empty state, then a table once the asset list is loaded', async () => {
    render(
      <MemoryRouter>
        <AssetsListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('assets-empty')).toBeInTheDocument();

    await act(async () => {
      await useAssetsStore
        .getState()
        .importCsvTrio(
          'uuid,title\nclient-pc,Desktop-PC (Client)\n',
          'uuid,name,asset_type,description,security-sensitivity-level,information-types\nC001,Finance Clients,client-pc,,normal,\n',
          'asset_type_uuid,targetobj_class_uuid\nclient-pc,837781a4-7b47-4695-9545-a3310eac7a66\n',
        );
    });

    await waitFor(() => expect(screen.getByTestId('assets-count')).toBeInTheDocument());
    expect(screen.getByText('Finance Clients')).toBeInTheDocument();
    expect(screen.queryByTestId('assets-upload-warnings')).not.toBeInTheDocument();
  });

  it('shows a validation error when a file is missing', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AssetsListPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('assets-upload-submit'));
    expect(await screen.findByTestId('assets-upload-error')).toBeInTheDocument();
  });

  it('clears the asset list', async () => {
    const user = userEvent.setup();
    await useAssetsStore.getState().importCsvTrio(
      'uuid,title\nclient-pc,Desktop\n',
      'uuid,name,asset_type,description,security-sensitivity-level,information-types\nC001,Finance Clients,client-pc,,,\n',
      'asset_type_uuid,targetobj_class_uuid\nclient-pc,837781a4-7b47-4695-9545-a3310eac7a66\n',
    );
    render(
      <MemoryRouter>
        <AssetsListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('assets-count')).toBeInTheDocument();

    globalThis.confirm = () => true;
    await user.click(screen.getByTestId('assets-clear'));
    expect(await screen.findByTestId('assets-empty')).toBeInTheDocument();
  });
});

describe('bulk selection (ADR-0027)', () => {
  it('toggles a row checkbox and shows/hides the bulk-actions bar', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await seedTwoAssets();
    });
    render(
      <MemoryRouter>
        <AssetsListPage />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('assets-bulk-actions')).not.toBeInTheDocument();

    const checkboxes = screen.getAllByTestId('assets-select-item');
    await user.click(checkboxes[0]!);
    expect(screen.getByTestId('assets-selected-count')).toHaveTextContent('1');
  });

  it('select-all selects every asset, then toggling it again clears the selection', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await seedTwoAssets();
    });
    render(
      <MemoryRouter>
        <AssetsListPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('assets-select-all'));
    expect(screen.getByTestId('assets-selected-count')).toHaveTextContent('2');

    await user.click(screen.getByTestId('assets-select-all'));
    expect(screen.queryByTestId('assets-bulk-actions')).not.toBeInTheDocument();
  });

  it('download-selected triggers a CSV download of just the selected assets', async () => {
    const user = userEvent.setup();
    // jsdom doesn't implement the Blob URL DOM APIs the download trigger uses, and clicking a
    // real <a href="blob:..."> attempts real navigation jsdom doesn't support either — stub both.
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob; // typed so createObjectURL.mock.calls[0][0] is a Blob, not unknown
      return 'blob:mock';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await act(async () => {
      await seedTwoAssets();
    });
    render(
      <MemoryRouter>
        <AssetsListPage />
      </MemoryRouter>,
    );
    await user.click(screen.getAllByTestId('assets-select-item')[0]!);
    await user.click(screen.getByTestId('assets-download-selected'));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]![0].type).toBe('text/csv');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('delete-selected removes the selected assets only after confirmation', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await seedTwoAssets();
    });
    render(
      <MemoryRouter>
        <AssetsListPage />
      </MemoryRouter>,
    );
    await user.click(screen.getAllByTestId('assets-select-item')[0]!);

    globalThis.confirm = () => false;
    await user.click(screen.getByTestId('assets-delete-selected'));
    expect(useAssetsStore.getState().assets).toHaveLength(2);

    globalThis.confirm = () => true;
    await user.click(screen.getByTestId('assets-delete-selected'));
    await waitFor(() => expect(useAssetsStore.getState().assets).toHaveLength(1));
    expect(useAssetsStore.getState().assetTypes).toHaveLength(1); // asset types untouched
  });
});
