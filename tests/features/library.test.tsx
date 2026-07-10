/**
 * BSI library browser page. Decision IDs: ADR-0001, ADR-0005, ADR-0010.
 * Covers TEST-LIB-01 (listing/badge/attribution) and TEST-LIB-02 (adopt).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { LibraryPage } from '@/features/library/LibraryPage';
import { useLibraryStore } from '@/features/library/store';
import { ToastProvider } from '@/shared/toast';
import catalogDoc from '../data/catalog-minimal.json';
import compDefDoc from '../data/component-definition-minimal.json';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  useLibraryStore.setState({
    showAdvanced: false,
    busyPath: null,
    warning: null,
    error: null,
    adoptedTitle: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listing + attribution (TEST-LIB-01)', () => {
  it('shows Anwenderkataloge + Komponenten by default and hides Quellkataloge', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <LibraryPage />
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(screen.getByText('Grundschutz++')).toBeInTheDocument(); // Anwenderkatalog
    expect(screen.getByText('Passwortrichtlinie')).toBeInTheDocument(); // Komponente
    expect(screen.queryByText('Kernel (Quellkatalog)')).not.toBeInTheDocument(); // hidden
    // provenance badge + licence attribution present
    expect(screen.getAllByTestId('library-badge').length).toBeGreaterThan(0);
    expect(screen.getByTestId('library-attribution')).toHaveTextContent('CC-BY-SA-4.0');
  });

  it('reveals Quellkataloge behind the advanced toggle', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <LibraryPage />
        </MemoryRouter>
      </ToastProvider>,
    );
    await user.click(screen.getByTestId('library-advanced-toggle'));
    expect(screen.getByText('Kernel (Quellkatalog)')).toBeInTheDocument();
  });
});

describe('adopt (TEST-LIB-02)', () => {
  it('fetches and copies a library component-definition into the workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (String(url).includes('component_definition') ? compDefDoc : catalogDoc),
      })),
    );
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <LibraryPage />
        </MemoryRouter>
      </ToastProvider>,
    );

    const item = screen.getByText('Passwortrichtlinie').closest('li')!;
    await user.click(within(item).getByRole('button', { name: /Adopt Passwortrichtlinie/ }));

    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveAttribute('data-level', 'success');
    expect(toast).toHaveTextContent('Passwortrichtlinie');
    const adopted = await ArtifactRepository.forType('componentDefinition').getAll();
    expect(adopted).toHaveLength(1);
    expect(adopted[0]!.origin).toBe('user');
  });
});
