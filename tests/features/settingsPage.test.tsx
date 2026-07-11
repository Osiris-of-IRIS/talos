/**
 * Settings page (ADR-0033): loads/saves the default creator identity, auto-generates + persists
 * a stable uuid on first save, clear button. Covers TEST-SETTINGS-02.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { getSettings, saveSettings } from '@/data/settingsRepository';
import { SettingsPage } from '@/features/settings/SettingsPage';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  it('starts with empty fields and the unconfigured status when nothing is saved yet', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('settings-creator-name')).toHaveValue(''));
    expect(screen.getByTestId('settings-creator-status')).toHaveTextContent('Not set yet');
  });

  it('saves name+email and auto-generates a uuid when none is given, persisting it back to settings', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('settings-creator-name')).toBeInTheDocument());

    await user.type(screen.getByTestId('settings-creator-name'), 'Jane Doe');
    await user.type(screen.getByTestId('settings-creator-email'), 'jane@example.com');
    expect(screen.getByTestId('settings-creator-uuid')).toHaveValue('');

    await user.click(screen.getByTestId('settings-save'));
    await waitFor(() => expect(screen.getByTestId('settings-creator-uuid')).not.toHaveValue(''));

    const uuidShown = (screen.getByTestId('settings-creator-uuid') as HTMLInputElement).value;
    expect(uuidShown).toMatch(/^[0-9a-f-]{36}$/i);
    expect(screen.getByTestId('settings-creator-status')).toHaveTextContent('will have it applied automatically');

    const saved = await getSettings();
    expect(saved.creatorName).toBe('Jane Doe');
    expect(saved.creatorEmail).toBe('jane@example.com');
    expect(saved.creatorUuid).toBe(uuidShown);
  });

  it('reuses (does not re-mint) an already-configured uuid on a subsequent save', async () => {
    await saveSettings({ creatorName: 'Jane Doe', creatorEmail: 'jane@example.com', creatorUuid: 'fixed-uuid-1' });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('settings-creator-uuid')).toHaveValue('fixed-uuid-1'));

    await user.clear(screen.getByTestId('settings-creator-email'));
    await user.type(screen.getByTestId('settings-creator-email'), 'jane2@example.com');
    await user.click(screen.getByTestId('settings-save'));

    await waitFor(async () => expect((await getSettings()).creatorEmail).toBe('jane2@example.com'));
    const saved = await getSettings();
    expect(saved.creatorUuid).toBe('fixed-uuid-1');
  });

  it('respects a user-supplied uuid instead of generating one', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('settings-creator-name')).toBeInTheDocument());

    await user.type(screen.getByTestId('settings-creator-name'), 'Jane Doe');
    await user.type(screen.getByTestId('settings-creator-email'), 'jane@example.com');
    await user.type(screen.getByTestId('settings-creator-uuid'), 'my-own-uuid');
    await user.click(screen.getByTestId('settings-save'));

    await waitFor(async () => expect((await getSettings()).creatorUuid).toBe('my-own-uuid'));
  });

  it('clears the configured creator identity', async () => {
    await saveSettings({ creatorName: 'Jane Doe', creatorEmail: 'jane@example.com', creatorUuid: 'fixed-uuid-1' });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('settings-creator-name')).toHaveValue('Jane Doe'));

    await user.click(screen.getByTestId('settings-clear'));
    await waitFor(() => expect(screen.getByTestId('settings-creator-name')).toHaveValue(''));

    const saved = await getSettings();
    expect(saved.creatorName).toBeUndefined();
    expect(saved.creatorEmail).toBeUndefined();
    expect(saved.creatorUuid).toBeUndefined();
  });
});
