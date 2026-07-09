/**
 * Landing page: SSP-bootstrap-assistant card gating on the assets prerequisite (ADR-0026);
 * configured hero background image (ADR-0029).
 * Covers TEST-LAND-03.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests, getDb } from '@/data/db';
import { LandingPage } from '@/app/LandingPage';
import { useAssetsStore } from '@/features/assets/store';
import { heroBackgroundUrl } from '@/app/heroBackground';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useAssetsStore.setState({ assets: [], assetTypes: [], loading: false, error: null, warnings: [] });
});

describe('LandingPage — bootstrap assistant card gating', () => {
  it('renders the bootstrap card disabled (no link) when there are no assets', async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const disabled = await screen.findByTestId('feature-card-disabled');
    expect(disabled).toHaveTextContent('SSP Bootstrap Assistant');
    expect(screen.queryByRole('link', { name: /SSP Bootstrap Assistant/ })).not.toBeInTheDocument();
  });

  it('renders the bootstrap card as a live link once an asset exists', async () => {
    const db = await getDb();
    await db.put('assets', {
      uuid: 'C001',
      name: 'Test asset',
      assetType: 'client-pc',
      description: '',
      securitySensitivityLevel: '',
      informationTypes: '',
    });

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /SSP Bootstrap Assistant/ })).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('feature-card-disabled')).not.toBeInTheDocument();
  });
});

describe('LandingPage — hero background (ADR-0029)', () => {
  it('renders the hero with the background image resolved from the centralized config', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const hero = screen.getByTestId('landing-hero');
    expect(hero.style.backgroundImage).toContain(heroBackgroundUrl());
  });
});
