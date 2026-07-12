/**
 * Landing page: SSP-bootstrap-assistant card gating on the assets prerequisite (ADR-0026);
 * configured hero background image (ADR-0029); per-card symbol/description/count/empty-state
 * guidance (ADR-0006, ADR-0011); Assessment-layer + Dashboard "coming soon" placeholders.
 * Covers TEST-LAND-01, TEST-LAND-02, TEST-LAND-03, TEST-LAND-04.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests, getDb } from '@/data/db';
import { LandingPage } from '@/app/LandingPage';
import { useAssetsStore } from '@/features/assets/store';
import { heroBackgroundUrl } from '@/app/heroBackground';
import { ArtifactRepository } from '@/data/artifactRepository';

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
    // Not-yet-built features (Assessment layer, Dashboard) are also always-disabled, so scope
    // to the bootstrap-assistant card specifically rather than assuming it's the only match.
    await waitFor(() => expect(screen.getAllByTestId('feature-card-disabled').length).toBeGreaterThan(0));
    const disabled = screen
      .getAllByTestId('feature-card-disabled')
      .find((c) => c.textContent?.includes('SSP Bootstrap Assistant'));
    expect(disabled).toBeDefined();
    expect(screen.queryByRole('link', { name: /SSP Bootstrap Assistant/ })).not.toBeInTheDocument();
  });

  it('renders the bootstrap card as a live link once an asset exists', async () => {
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
        <LandingPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /SSP Bootstrap Assistant/ })).toBeInTheDocument(),
    );
    expect(
      screen.queryAllByTestId('feature-card-disabled').some((c) => c.textContent?.includes('SSP Bootstrap Assistant')),
    ).toBe(false);
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

describe('LandingPage — feature cards: symbols, descriptions, layer colors (TEST-LAND-01)', () => {
  it('pairs every active card with its ADR-0011 symbol, title, and one-line description', async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const catalogsLink = await screen.findByRole('link', { name: /Catalogs/ });
    expect(catalogsLink).toHaveTextContent('📘');
    expect(catalogsLink).toHaveTextContent('Control catalogs your profiles and implementations reference.');

    const sspsLink = screen.getByRole('link', { name: /System Security Plans/ });
    expect(sspsLink).toHaveTextContent('🖥️');
  });

  it("shows each artifact type's workspace count once records exist", async () => {
    await ArtifactRepository.forType('catalog').create({ uuid: 'c1', type: 'catalog', origin: 'user', artifact: {} });
    await ArtifactRepository.forType('profile').create({ uuid: 'p1', type: 'profile', origin: 'user', artifact: {} });
    await ArtifactRepository.forType('profile').create({ uuid: 'p2', type: 'profile', origin: 'user', artifact: {} });

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const catalogsLink = await screen.findByRole('link', { name: /Catalogs/ });
    await waitFor(() => expect(catalogsLink).toHaveTextContent('1 in your workspace'));
    const profilesLink = screen.getByRole('link', { name: /Profiles/ });
    expect(profilesLink).toHaveTextContent('2 in your workspace');
  });
});

describe('LandingPage — empty-state guidance (TEST-LAND-02)', () => {
  it('shows a contextual hint instead of a count badge for zero-record artifact types', async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No catalogs yet\. Upload one/)).toBeInTheDocument();
    expect(screen.getByText(/No profiles yet\. Upload an OSCAL file/)).toBeInTheDocument();
    expect(screen.getByText(/No component-definitions yet/)).toBeInTheDocument();
    expect(screen.getByText(/No system security plans yet/)).toBeInTheDocument();
    expect(screen.getByText(/No assets yet/)).toBeInTheDocument();
  });

  it('replaces the hint with a live count once a record of that type is added', async () => {
    await ArtifactRepository.forType('catalog').create({ uuid: 'c1', type: 'catalog', origin: 'user', artifact: {} });
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const catalogsLink = await screen.findByRole('link', { name: /Catalogs/ });
    await waitFor(() => expect(catalogsLink).toHaveTextContent('1 in your workspace'));
    expect(catalogsLink).not.toHaveTextContent('No catalogs yet');
  });
});

describe('LandingPage — Assessment layer placeholders', () => {
  it('renders Assessment Plans/Results/POA&M as disabled "coming soon" cards, not dead links', async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const disabledCards = await screen.findAllByTestId('feature-card-disabled');
    const disabledTitles = disabledCards.map((c) => c.textContent);
    for (const label of ['Assessment Plans', 'Assessment Results', 'Plan of Action & Milestones']) {
      expect(disabledTitles.some((t) => t?.includes(label))).toBe(true);
    }
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
    for (const path of ['assessment-plans', 'assessment-results', 'poams']) {
      expect(hrefs).not.toContain(`#/${path}`);
    }
  });
});

describe('LandingPage — Management Dashboard card (ADR-0034)', () => {
  it('renders as a live link now that Control Coverage has landed', async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const dashboardLink = await screen.findByRole('link', { name: /Management Dashboard/ });
    expect(dashboardLink).toHaveAttribute('href', '#/dashboard');
    expect(dashboardLink).toHaveTextContent('📊');
    const disabledCards = screen.queryAllByTestId('feature-card-disabled');
    expect(disabledCards.some((c) => c.textContent?.includes('Management Dashboard'))).toBe(false);
  });
});
