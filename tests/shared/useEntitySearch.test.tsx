/**
 * Shared entity-search core hook (T-036, ADR-0013): debounced ranking over either the workspace
 * IndexedDB (by artifact type) or a caller-provided item list (for nested data like controls/params).
 * Covers TEST-SEARCH-01.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { useEntitySearch, type UseEntitySearchOptions } from '@/shared/useEntitySearch';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { Catalog } from '@/models/catalog';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedComponentDefinitions() {
  await ArtifactRepository.forType<ComponentDefinition>('componentDefinition').create({
    uuid: '11111111-1111-4111-8111-111111111111',
    type: 'componentDefinition',
    origin: 'user',
    artifact: { uuid: '11111111-1111-4111-8111-111111111111', metadata: { title: 'Password Policy', version: '1.0.0', oscalVersion: '1.2.2' } },
  });
  await ArtifactRepository.forType<ComponentDefinition>('componentDefinition').create({
    uuid: '22222222-2222-4222-8222-222222222222',
    type: 'componentDefinition',
    origin: 'library',
    artifact: { uuid: '22222222-2222-4222-8222-222222222222', metadata: { title: 'WLAN Component', version: '1.0.0', oscalVersion: '1.2.2' } },
  });
}

async function seedCatalog() {
  await ArtifactRepository.forType<Catalog>('catalog').create({
    uuid: '33333333-3333-4333-8333-333333333333',
    type: 'catalog',
    origin: 'imported',
    artifact: { uuid: '33333333-3333-4333-8333-333333333333', metadata: { title: 'BSI Kernel', version: '1.0.0', oscalVersion: '1.2.2' }, controls: [] },
  });
}

function Harness({ options }: { options: UseEntitySearchOptions }) {
  const { query, setQuery, results, loading } = useEntitySearch(options);
  return (
    <div>
      <input aria-label="q" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading && <span data-testid="loading" />}
      <ul>
        {results.map((r) => (
          <li key={r.id} data-testid="result">
            {r.title}
            {r.badge && ` (${r.badge})`}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('useEntitySearch — IndexedDB (types) mode', () => {
  it('yields no results for an empty query', async () => {
    await seedComponentDefinitions();
    render(<Harness options={{}} />);
    expect(screen.queryByTestId('result')).not.toBeInTheDocument();
  });

  it('restricts to the given types', async () => {
    await seedComponentDefinitions();
    await seedCatalog();
    let setQueryRef!: (q: string) => void;
    function Probe() {
      const state = useEntitySearch({ types: ['catalog'] });
      setQueryRef = state.setQuery;
      return (
        <ul>
          {state.results.map((r) => (
            <li key={r.id} data-testid="result">
              {r.title}
            </li>
          ))}
        </ul>
      );
    }
    render(<Probe />);
    await act(async () => {
      setQueryRef('e');
    });
    expect(await screen.findByText('BSI Kernel')).toBeInTheDocument();
    expect(screen.queryByText('Password Policy')).not.toBeInTheDocument();
  });

  it('stamps the origin as badge and {uuid,type,origin} as data', async () => {
    await seedComponentDefinitions();
    let setQueryRef!: (q: string) => void;
    let resultsRef: ReturnType<typeof useEntitySearch>['results'] = [];
    function Probe() {
      const state = useEntitySearch({});
      setQueryRef = state.setQuery;
      resultsRef = state.results;
      return (
        <ul>
          {state.results.map((r) => (
            <li key={r.id} data-testid="result">
              {r.title}
            </li>
          ))}
        </ul>
      );
    }
    render(<Probe />);
    act(() => setQueryRef('wlan'));
    await screen.findByText('WLAN Component');
    expect(resultsRef).toHaveLength(1);
    expect(resultsRef[0]!.badge).toBe('library');
    expect(resultsRef[0]!.data).toEqual({
      uuid: '22222222-2222-4222-8222-222222222222',
      type: 'componentDefinition',
      origin: 'library',
    });
  });

  it('applies an optional scope predicate on top of the text match', async () => {
    await seedComponentDefinitions();
    let setQueryRef!: (q: string) => void;
    function Probe() {
      const state = useEntitySearch({ scope: (item) => item.badge === 'user' });
      setQueryRef = state.setQuery;
      return (
        <ul>
          {state.results.map((r) => (
            <li key={r.id} data-testid="result">
              {r.title}
            </li>
          ))}
        </ul>
      );
    }
    render(<Probe />);
    await act(async () => {
      setQueryRef('o');
    });
    expect(await screen.findByText('Password Policy')).toBeInTheDocument();
    expect(screen.queryByText('WLAN Component')).not.toBeInTheDocument();
  });

  it('caps results at the given limit', async () => {
    await seedComponentDefinitions();
    let setQueryRef!: (q: string) => void;
    function Probe() {
      const state = useEntitySearch({ limit: 1 });
      setQueryRef = state.setQuery;
      return (
        <ul>
          {state.results.map((r) => (
            <li key={r.id} data-testid="result">
              {r.title}
            </li>
          ))}
        </ul>
      );
    }
    render(<Probe />);
    act(() => setQueryRef('o'));
    await screen.findAllByTestId('result');
    expect(screen.getAllByTestId('result')).toHaveLength(1);
  });

  it('debounces: results only update after debounceMs elapses', async () => {
    await seedComponentDefinitions();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let setQueryRef!: (q: string) => void;
    function Probe() {
      const state = useEntitySearch({ debounceMs: 300 });
      setQueryRef = state.setQuery;
      return (
        <ul>
          {state.results.map((r) => (
            <li key={r.id} data-testid="result">
              {r.title}
            </li>
          ))}
        </ul>
      );
    }
    render(<Probe />);
    await act(async () => {
      setQueryRef('password');
    });
    expect(screen.queryByTestId('result')).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('result')).toBeInTheDocument();
  });
});

describe('useEntitySearch — items (fixed list) mode', () => {
  it('searches the provided list instead of fetching from IndexedDB', async () => {
    let setQueryRef!: (q: string) => void;
    function Probe() {
      const state = useEntitySearch({
        items: [
          { id: 'APP.1.1.1', title: 'APP.1.1.1 Allgemeine Anwendungen' },
          { id: 'SYS.1.1.1', title: 'SYS.1.1.1 Allgemeiner Server' },
        ],
      });
      setQueryRef = state.setQuery;
      return (
        <ul>
          {state.results.map((r) => (
            <li key={r.id} data-testid="result">
              {r.title}
            </li>
          ))}
        </ul>
      );
    }
    render(<Probe />);
    await act(async () => {
      setQueryRef('APP');
    });
    expect(await screen.findByText('APP.1.1.1 Allgemeine Anwendungen')).toBeInTheDocument();
    expect(screen.queryByText('SYS.1.1.1 Allgemeiner Server')).not.toBeInTheDocument();
  });

  it('never touches IndexedDB when items is provided (loading starts false)', () => {
    let loadingRef = true;
    function Probe() {
      const state = useEntitySearch({ items: [] });
      loadingRef = state.loading;
      return null;
    }
    render(<Probe />);
    expect(loadingRef).toBe(false);
  });
});
