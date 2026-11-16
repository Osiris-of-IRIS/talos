/**
 * BSI library browser page. Decision IDs: ADR-0001, ADR-0005, ADR-0010.
 * Covers TEST-LIB-01 (listing/badge/attribution), TEST-LIB-02 (adopt) and TEST-LIB-06 (new upstream
 * layout: profiles/mapping collections behind the advanced toggle, unsupported kinds never crash,
 * a 404 on adopt shows a localized, actionable error — ADR-0039) and TEST-LIB-07 (ADR-0007 version
 * policy on adopt: localized warning for 1.0/1.1 library files, silent for 1.2.x).
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
import { I18nProvider } from '@/shared/i18n';
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
    expect(screen.queryByText('BSI Stand der Technik Kernel')).not.toBeInTheDocument(); // Quellkatalog, hidden
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
    expect(screen.getByText('BSI Stand der Technik Kernel')).toBeInTheDocument();
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

function renderLibrary() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('new upstream layout (TEST-LIB-06)', () => {
  it('hides profiles and mapping collections by default, reveals them behind the advanced toggle', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const listText = () => screen.getByTestId('library-list').textContent ?? '';
    expect(listText()).not.toMatch(/\[profile\]/);
    expect(listText()).not.toMatch(/\[mapping-collection\]/);
    expect(screen.getByText('Keycloak')).toBeInTheDocument(); // new upstream component
    await user.click(screen.getByTestId('library-advanced-toggle'));
    expect(listText()).toMatch(/\[profile\]/);
    expect(listText()).toMatch(/\[mapping-collection\]/);
  });

  it('marks mapping collections "not supported yet" with a disabled adopt button instead of crashing', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByTestId('library-advanced-toggle'));
    const mappingItems = screen
      .getAllByTestId('library-item')
      .filter((li) => li.textContent?.includes('[mapping-collection]'));
    expect(mappingItems.length).toBeGreaterThan(0);
    for (const li of mappingItems) {
      expect(within(li).getByTestId('library-unsupported')).toHaveTextContent(/not supported/i);
      expect(within(li).getByRole('button')).toBeDisabled();
    }
  });

  it('shows a localized, actionable error toast when the adopted file 404s upstream', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' })),
    );
    const user = userEvent.setup();
    renderLibrary();
    const item = screen.getByText('Keycloak').closest('li')!;
    await user.click(within(item).getByRole('button', { name: /Adopt Keycloak/ }));
    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveAttribute('data-level', 'error');
    expect(toast).toHaveTextContent('Keycloak');
    expect(toast).toHaveTextContent(/HTTP 404/);
    expect(toast).toHaveTextContent(/reorganised/i);
    expect(await ArtifactRepository.forType('componentDefinition').getAll()).toHaveLength(0);
  });
});

describe('ADR-0007 version policy on adopt (TEST-LIB-07)', () => {
  function stubFetchWithVersion(version: string) {
    const doc = structuredClone(compDefDoc) as unknown as { 'component-definition': { metadata: Record<string, unknown> } };
    doc['component-definition'].metadata['oscal-version'] = version;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => doc })),
    );
  }

  function renderLibraryDe() {
    return render(
      <I18nProvider language="de">
        <ToastProvider>
          <MemoryRouter>
            <LibraryPage />
          </MemoryRouter>
        </ToastProvider>
      </I18nProvider>,
    );
  }

  it('shows a localized version warning when adopting a 1.1.x library file, and still adopts it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetchWithVersion('1.1.2');
    const user = userEvent.setup();
    renderLibraryDe();
    const item = screen.getByText('Passwortrichtlinie').closest('li')!;
    await user.click(within(item).getByRole('button', { name: /Passwortrichtlinie/ }));
    const toasts = await screen.findAllByTestId('toast');
    const warning = toasts.find((t) => t.getAttribute('data-level') === 'warning');
    expect(warning).toBeDefined();
    expect(warning).toHaveTextContent('Als OSCAL 1.1.2 importiert; beim Export wird auf 1.2.3 normalisiert.');
    expect(toasts.some((t) => t.getAttribute('data-level') === 'success')).toBe(true);
    expect(await ArtifactRepository.forType('componentDefinition').getAll()).toHaveLength(1);
  });

  it('adopts a 1.2.2 library file without a version warning', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubFetchWithVersion('1.2.2');
    const user = userEvent.setup();
    renderLibraryDe();
    const item = screen.getByText('Passwortrichtlinie').closest('li')!;
    await user.click(within(item).getByRole('button', { name: /Passwortrichtlinie/ }));
    const toasts = await screen.findAllByTestId('toast');
    expect(toasts.map((t) => t.getAttribute('data-level'))).toEqual(['success']);
  });
});
