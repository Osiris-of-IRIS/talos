/**
 * Management Dashboard page (ADR-0034): Control Coverage tile (workspace totals + per-SSP
 * table) live; Risk Coverage + Assessment State render as disabled "coming soon" placeholders
 * until T-400/T-402 land. Covers TEST-DASH-04.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import type { SystemSecurityPlan } from '@/models/ssp';

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

describe('DashboardPage — Risk Coverage & Assessment State placeholders', () => {
  it('renders both not-yet-built tiles as disabled "coming soon" placeholders', () => {
    renderPage();
    const risk = screen.getByTestId('dashboard-risk-empty');
    const assessment = screen.getByTestId('dashboard-assessment-empty');
    expect(risk).toHaveTextContent('Coming soon.');
    expect(assessment).toHaveTextContent('Coming soon.');
  });
});

describe('DashboardPage — Control Coverage empty state', () => {
  it('shows the SSP empty-state hint when the workspace has no SSPs', async () => {
    renderPage();
    expect(await screen.findByTestId('dashboard-control-empty')).toHaveTextContent(/No system security plans yet/);
  });
});

describe('DashboardPage — Control Coverage with data', () => {
  it('summarizes workspace totals across all SSPs', async () => {
    await seedSsp('ssp-a', 'SSP A', {
      controlImplementation: {
        description: '',
        implementedRequirements: [
          {
            uuid: 'r1',
            controlId: 'C-1',
            byComponents: [{ componentUuid: 'c1', uuid: 'bc1', description: '', props: [{ name: 'implementation-status', value: 'implemented' }] }],
          },
          {
            uuid: 'r2',
            controlId: 'C-2',
            byComponents: [{ componentUuid: 'c1', uuid: 'bc2', description: '', props: [{ name: 'implementation-status', value: 'planned' }] }],
          },
        ],
      },
    });

    renderPage();
    const summary = await screen.findByTestId('dashboard-totals-summary');
    expect(summary).toHaveTextContent('Implemented');
    expect(summary).toHaveTextContent('1');
    expect(summary).toHaveTextContent('Planned');
  });

  it('renders one breakdown row per SSP with per-status counts and a total', async () => {
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
    const table = await screen.findByTestId('dashboard-control-table');
    const rowA = screen.getByTestId('dashboard-control-row-ssp-a');
    expect(rowA).toHaveTextContent('SSP A');
    expect(rowA).toHaveTextContent('1'); // total
    const rowB = screen.getByTestId('dashboard-control-row-ssp-b');
    expect(rowB).toHaveTextContent('SSP B');
    expect(table).not.toHaveTextContent('No system security plans yet');
  });
});
