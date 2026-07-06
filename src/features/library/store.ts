/**
 * BSI library browser store. Lists the bundled manifest (read at startup) and adopts items into
 * the workspace on demand. Decision IDs: ADR-0005, ADR-0004, ADR-0010.
 */
import { create } from 'zustand';
import {
  getLibraryManifest,
  loadLibraryArtifact,
  adoptLibraryArtifact,
  type LibraryManifestEntry,
} from '@/data/libraryLoader';

export interface LibraryState {
  items: LibraryManifestEntry[];
  /** Quellkataloge are hidden behind this advanced toggle (feature PLAT-002). */
  showAdvanced: boolean;
  busyPath: string | null;
  warning: string | null;
  error: string | null;
  adoptedTitle: string | null;
  toggleAdvanced: () => void;
  adopt: (entry: LibraryManifestEntry) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  items: getLibraryManifest().entries,
  showAdvanced: false,
  busyPath: null,
  warning: null,
  error: null,
  adoptedTitle: null,

  toggleAdvanced: () => set((s) => ({ showAdvanced: !s.showAdvanced })),

  adopt: async (entry) => {
    set({ busyPath: entry.path, error: null, warning: null, adoptedTitle: null });
    try {
      const loaded = await loadLibraryArtifact(entry);
      await adoptLibraryArtifact(loaded);
      set({ busyPath: null, adoptedTitle: entry.title, warning: loaded.warning ?? null });
    } catch (e) {
      set({ busyPath: null, error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
