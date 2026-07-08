/**
 * Shared bulk-selection zustand slice (ADR-0027), composed into every list store that supports
 * multi-select delete/download.
 * Covers TEST-SELECT-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createSelectionSlice, type SelectionSlice } from '@/features/shared/selectionSlice';

interface TestStore extends SelectionSlice {
  dummy: string;
}

const useTestStore = create<TestStore>((set, get) => ({
  dummy: 'x',
  ...createSelectionSlice<TestStore>(set, get),
}));

beforeEach(() => {
  useTestStore.setState({ selected: new Set() });
});

describe('createSelectionSlice', () => {
  it('starts with an empty selection', () => {
    expect(useTestStore.getState().selected.size).toBe(0);
  });

  it('toggleSelected adds then removes a uuid', () => {
    const { toggleSelected } = useTestStore.getState();
    toggleSelected('a');
    expect(useTestStore.getState().selected.has('a')).toBe(true);
    toggleSelected('a');
    expect(useTestStore.getState().selected.has('a')).toBe(false);
  });

  it('toggleSelected on one uuid does not affect another already selected', () => {
    const { toggleSelected } = useTestStore.getState();
    toggleSelected('a');
    toggleSelected('b');
    expect([...useTestStore.getState().selected].sort()).toEqual(['a', 'b']);
  });

  it('selectAll selects every given uuid when not all are already selected', () => {
    useTestStore.getState().selectAll(['a', 'b', 'c']);
    expect([...useTestStore.getState().selected].sort()).toEqual(['a', 'b', 'c']);
  });

  it('selectAll clears the selection when every given uuid is already selected (toggle-off)', () => {
    useTestStore.getState().selectAll(['a', 'b']);
    useTestStore.getState().selectAll(['a', 'b']);
    expect(useTestStore.getState().selected.size).toBe(0);
  });

  it('selectAll with an empty list clears rather than no-op selecting nothing', () => {
    useTestStore.getState().selectAll(['a']);
    useTestStore.getState().selectAll([]);
    expect(useTestStore.getState().selected.size).toBe(0);
  });

  it('clearSelection empties the selection regardless of prior state', () => {
    useTestStore.getState().selectAll(['a', 'b']);
    useTestStore.getState().clearSelection();
    expect(useTestStore.getState().selected.size).toBe(0);
  });
});
