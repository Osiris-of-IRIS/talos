/**
 * Assets upload/list page (ADR-0026).
 * Covers TEST-ASSET-04.
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
  useAssetsStore.setState({ assets: [], assetTypes: [], loading: false, error: null, warnings: [] });
});

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
