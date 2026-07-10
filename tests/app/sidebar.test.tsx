/**
 * Persistent sidebar navigation: logo→home link, collapsible toggle, primary nav links (shared
 * with the landing page via src/app/navigation.ts), bootstrap-assistant gating (ADR-0026, ADR-0029).
 * Covers TEST-SIDEBAR-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests, getDb } from '@/data/db';
import { Sidebar } from '@/app/Sidebar';
import { useAssetsStore } from '@/features/assets/store';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useAssetsStore.setState({ assets: [], assetTypes: [], loading: false, error: null, warnings: [] });
});

describe('Sidebar', () => {
  it('renders the logo as a link to the homepage', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const link = screen.getByTestId('sidebar-logo-link');
    expect(link).toHaveAttribute('href', '/');
    expect(link.querySelector('img')).toHaveAttribute('src');
  });

  it('renders primary nav links, and collapses/expands on toggle', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('sidebar-nav')).toBeInTheDocument();
    expect(screen.getByTestId('global-search-input')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'System Security Plans' })).toHaveAttribute('href', '/ssps');

    await user.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.queryByTestId('sidebar-nav')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByTestId('sidebar-nav')).toBeInTheDocument();
  });

  it('lists the Profile Creation Assistant before the SSP Bootstrap Assistant (ADR-0032)', async () => {
    // Seed an asset so the bootstrap-assistant link is a real <a> too (otherwise it renders
    // disabled, not a link — see "renders the bootstrap-assistant link live" below).
    const db = await getDb();
    await db.put('assets', {
      assetId: 'C001',
      name: 'Test asset',
      assetType: 'client-pc',
      description: '',
      securitySensitivityLevel: '',
      informationTypes: '',
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: 'Profile Creation Assistant' });
    expect(link).toHaveAttribute('href', '/profiles/assistant');
    await waitFor(() => expect(screen.getByRole('link', { name: /SSP Bootstrap Assistant/ })).toBeInTheDocument());
    const links = screen.getAllByRole('link').map((l) => l.textContent);
    expect(links.indexOf('Profile Creation Assistant')).toBeLessThan(links.indexOf('SSP Bootstrap Assistant'));
  });

  it('highlights the active route', () => {
    render(
      <MemoryRouter initialEntries={['/ssps']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'System Security Plans' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Component-Definitions' })).not.toHaveClass('active');
  });

  it('renders the bootstrap-assistant link disabled (no href) when there are no assets', async () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const disabled = await screen.findByTestId('sidebar-link-disabled');
    expect(disabled).toHaveTextContent('SSP Bootstrap Assistant');
    expect(screen.queryByRole('link', { name: /SSP Bootstrap Assistant/ })).not.toBeInTheDocument();
  });

  it('renders the bootstrap-assistant link live once an asset exists', async () => {
    const db = await getDb();
    await db.put('assets', {
      assetId: 'C001',
      name: 'Test asset',
      assetType: 'client-pc',
      description: '',
      securitySensitivityLevel: '',
      informationTypes: '',
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /SSP Bootstrap Assistant/ })).toHaveAttribute('href', '/bootstrap'),
    );
    expect(screen.queryByTestId('sidebar-link-disabled')).not.toBeInTheDocument();
  });
});
