/**
 * Shared bulk-selection zustand slice (ADR-0027): `selected` uuids for multi-item delete/download,
 * composed into every list store that supports it (`createArtifactStore` and the bespoke assets
 * store) instead of reimplementing the same toggle/select-all/clear logic per store.
 */
import type { StoreApi } from 'zustand';

export interface SelectionSlice {
  selected: Set<string>;
  toggleSelected: (uuid: string) => void;
  /** Selects every given uuid, or clears the selection if all of them are already selected (toggle-off). */
  selectAll: (uuids: string[]) => void;
  clearSelection: () => void;
}

export function createSelectionSlice<T extends SelectionSlice>(
  set: StoreApi<T>['setState'],
  get: StoreApi<T>['getState'],
): SelectionSlice {
  return {
    selected: new Set(),

    toggleSelected: (uuid) => {
      const next = new Set(get().selected);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      set({ selected: next } as Partial<T>);
    },

    selectAll: (uuids) => {
      const current = get().selected;
      const allSelected = uuids.length > 0 && uuids.every((id) => current.has(id));
      set({ selected: allSelected ? new Set() : new Set(uuids) } as Partial<T>);
    },

    clearSelection: () => set({ selected: new Set() } as Partial<T>),
  };
}
