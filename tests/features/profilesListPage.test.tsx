/**
 * Profiles list page: upload/list/delete + bulk selection (ADR-0032, mirrors ADR-0027).
 * Covers TEST-PROF-02.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { useProfilesStore } from '@/features/profiles/store';
import { ProfilesListPage } from '@/features/profiles/ProfilesListPage';
import { ToastProvider } from '@/shared/toast';
import golden from '../data/profile-minimal.json';

const goldenText = JSON.stringify(golden);

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <ProfilesListPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useProfilesStore.setState({ items: [], loading: false, error: null, selected: new Set() });
});

describe('list page', () => {
  it('shows the empty state, then the imported profile', async () => {
    renderPage();
    expect(await screen.findByTestId('profile-empty')).toBeInTheDocument();
    await act(async () => {
      await useProfilesStore.getState().importFromText(goldenText);
    });
    await waitFor(() => expect(screen.getByText('Web Application Baseline')).toBeInTheDocument());
  });

  it('links to the new-profile editor and the creation assistant', async () => {
    renderPage();
    expect(screen.getByTestId('profile-new')).toHaveAttribute('href', '/profiles/new');
    expect(screen.getByTestId('profile-assistant-link')).toHaveAttribute('href', '/profiles/assistant');
  });
});

describe('bulk selection', () => {
  it('toggles a row checkbox and deletes after confirmation', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await useProfilesStore.getState().importFromText(goldenText);
    });
    renderPage();
    expect(screen.queryByTestId('profile-bulk-actions')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('profile-select-item'));
    expect(screen.getByTestId('profile-selected-count')).toHaveTextContent('1');

    globalThis.confirm = () => true;
    await user.click(screen.getByTestId('profile-delete-selected'));
    await waitFor(() => expect(useProfilesStore.getState().items).toHaveLength(0));
  });
});
