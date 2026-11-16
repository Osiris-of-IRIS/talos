/**
 * Dashboard Risk Coverage when the BSI threat catalog cannot be loaded (ADR-0039, ADR-0035): the
 * failure is caught (no unhandled rejection), shown as an error toast and as an inline note in the
 * Risk tile, instead of a silently empty chart.
 * Decision IDs: ADR-0001, ADR-0035, ADR-0039.
 * Covers TEST-DASH-07.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ToastProvider } from '@/shared/toast';
import { UpstreamLoadError } from '@/data/upstreamFetch';

const URL_404 =
  'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/documentation/namespaces/basethreats.csv';

vi.mock('@/data/threatCatalogLoader', () => ({
  loadThreatCatalog: vi.fn(async () => {
    throw new UpstreamLoadError('Could not load the threat catalog and no cached copy exists: HTTP 404', {
      resource: 'threat-catalog',
      url: URL_404,
      status: 404,
      detail: `HTTP 404 for ${URL_404}`,
    });
  }),
}));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('DashboardPage — threat catalog load failure (TEST-DASH-07)', () => {
  it('shows an error toast and an inline Risk-tile note; the rejection is handled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      render(
        <ToastProvider>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </ToastProvider>,
      );
      const toast = await screen.findByTestId('toast');
      expect(toast).toHaveAttribute('data-level', 'error');
      expect(toast).toHaveTextContent(/elementary threats/i);
      expect(toast).toHaveTextContent(/HTTP 404/);
      expect(await screen.findByTestId('dashboard-risk-load-error')).toHaveTextContent(/threat catalog could not be loaded/i);
      // Let the SSP/catalog store loads settle too (avoids act() noise), then check no rejection escaped.
      await screen.findByTestId('dashboard-risk-empty-state');
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
