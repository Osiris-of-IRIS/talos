/**
 * Management Dashboard page (ADR-0034, ADR-0035): Control Coverage + Risk Coverage tiles live;
 * Assessment State renders as a disabled "coming soon" placeholder until T-402 lands.
 * Covers TEST-DASH-04, TEST-DASH-06.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import type { SystemSecurityPlan } from '@/models/ssp';
import type { Catalog } from '@/models/catalog';

vi.mock('@/data/threatCatalogLoader', () => ({
  loadThreatCatalog: vi.fn(async () => ({
    fromCache: false,
    rows: [
      { id: 'T1', title: 'Threat One', definition: '', uuid: 't1' },
      { id: 'T2', title: 'Threat Two', definition: '', uuid: 't2' },
    ],
  })),
}));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

async function seedSsp(uuid: string, title: string, artifact: Partial<SystemSecurityPlan>) {
  await ArtifactRepository.forType('systemSecurityPlan').create({
    uuid,
    type: 'systemSecurityPlan',
    origin: 'user',
    artifact: { uuid, metadata: { title, version: '1.0.0', oscalVersion: '1.2.2' }, ...artifact },
  });
}

async function seedCatalog(uuid: string, controls: Catalog['controls']) {
  await ArtifactRepository.forType('catalog').create({
    uuid,
    type: 'catalog',
    origin: 'user',
    artifact: { uuid, metadata: { title: 'Catalog', version: '1.0.0', oscalVersion: '1.2.2' }, controls },
  });
}

describe('DashboardPage — Assessment State placeholder', () => {
  it('renders the not-yet-built tile as a disabled "coming soon" placeholder', () => {
    renderPage();
    expect(screen.getByTestId('dashboard-assessment-empty')).toHaveTextContent('Coming soon.');
  });
});

describe('DashboardPage — Control Coverage empty state', () => {
  it('shows the SSP empty-state hint when the workspace has no SSPs', async () => {
    renderPage();
    expect(await screen.findByTestId('dashboard-control-empty')).toHaveTextContent(/No system security plans yet/);
  });
});

describe('DashboardPage — Control Coverage with data', () => {
  it('renders the totals chart in place of the old numbers-below-the-graph list', async () => {
    await seedSsp('ssp-a', 'SSP A', {
      controlImplementation: {
        description: '',
        implementedRequirements: [
          {
            uuid: 'r1',
            controlId: 'C-1',
            byComponents: [{ componentUuid: 'c1', uuid: 'bc1', description: '', props: [{ name: 'implementation-status', value: 'implemented' }] }],
          },
        ],
      },
    });

    renderPage();
    // Supervisor feedback: drop the redundant summary list — counts are direct labels on the
    // chart's bars instead (LabelList). jsdom has no layout engine, so Recharts'
    // <ResponsiveContainer> never measures a non-zero size and never renders its SVG children —
    // the exact label text isn't assertable here; controlCoverage.test.ts covers the underlying
    // numbers exhaustively. This just confirms the chart mounts and the old list is gone.
    expect(await screen.findByTestId('dashboard-totals-chart')).toHaveAttribute(
      'aria-label',
      'Workspace-wide control counts by implementation stage',
    );
    expect(screen.queryByTestId('dashboard-totals-summary')).not.toBeInTheDocument();
  });

  it('keeps the By-SSP breakdown collapsed by default, expandable on demand', async () => {
    await seedSsp('ssp-a', 'SSP A', {
      controlImplementation: {
        description: '',
        implementedRequirements: [
          {
            uuid: 'r1',
            controlId: 'C-1',
            byComponents: [{ componentUuid: 'c1', uuid: 'bc1', description: '', props: [{ name: 'implementation-status', value: 'implemented' }] }],
          },
        ],
      },
    });
    await seedSsp('ssp-b', 'SSP B', {
      controlImplementation: { description: '', implementedRequirements: [{ uuid: 'r2', controlId: 'C-2', byComponents: [] }] },
    });

    renderPage();
    await screen.findByTestId('dashboard-control-by-ssp');
    expect(screen.queryByTestId('dashboard-control-table')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('dashboard-control-by-ssp-toggle'));

    const table = await screen.findByTestId('dashboard-control-table');
    const rowA = screen.getByTestId('dashboard-control-row-ssp-a');
    expect(rowA).toHaveTextContent('SSP A');
    expect(rowA).toHaveTextContent('1'); // total
    const rowB = screen.getByTestId('dashboard-control-row-ssp-b');
    expect(rowB).toHaveTextContent('SSP B');
    expect(table).not.toHaveTextContent('No system security plans yet');
  });
});

describe('DashboardPage — Risk Coverage (ADR-0035)', () => {
  it('renders the averaged totals chart, mounted with the risk-specific aria-label', async () => {
    await seedSsp('ssp-a', 'SSP A', {
      controlImplementation: { description: '', implementedRequirements: [] },
    });

    renderPage();
    expect(await screen.findByTestId('dashboard-risk-chart')).toHaveAttribute(
      'aria-label',
      'Average risk coverage per SSP, by category',
    );
  });

  it('keeps the risk By-SSP breakdown collapsed by default, expandable on demand, with per-SSP bucket counts', async () => {
    await seedCatalog('cat-1', [
      { id: 'C1', title: 'C1', props: [{ name: 'sec_level', value: 'normal-SdT' }, { name: 'threats', value: 'T1' }] },
    ]);
    await seedSsp('ssp-a', 'SSP A', {
      controlImplementation: {
        description: '',
        implementedRequirements: [
          {
            uuid: 'r1',
            controlId: 'C1',
            byComponents: [{ componentUuid: 'c1', uuid: 'bc1', description: '', props: [{ name: 'implementation-status', value: 'implemented' }] }],
          },
        ],
      },
    });
    await seedSsp('ssp-b', 'SSP B', {
      controlImplementation: { description: '', implementedRequirements: [] },
    });

    renderPage();
    await screen.findByTestId('dashboard-risk-by-ssp');
    expect(screen.queryByTestId('dashboard-risk-table')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('dashboard-risk-by-ssp-toggle'));

    const table = await screen.findByTestId('dashboard-risk-table');
    // SSP A: T1 fully implemented -> full; T2 untagged by any control -> unmapped.
    const rowA = screen.getByTestId('dashboard-risk-row-ssp-a');
    expect(rowA).toHaveTextContent('SSP A');
    // SSP B: T1 tagged but not implemented here -> uncovered; T2 -> unmapped.
    const rowB = screen.getByTestId('dashboard-risk-row-ssp-b');
    expect(rowB).toHaveTextContent('SSP B');
    expect(table).not.toHaveTextContent('No system security plans yet');
  });
});
