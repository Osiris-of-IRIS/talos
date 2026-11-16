/**
 * BSI library browser store. Lists the bundled manifest (read at startup) and adopts items into
 * the workspace on demand. Keeps the thrown error itself (not just its text) so the page can
 * localize upstream failures (ADR-0039). Decision IDs: ADR-0005, ADR-0004, ADR-0010, ADR-0039.
 */
import { create } from 'zustand';
import {
  getLibraryManifest,
  loadLibraryArtifact,
  adoptLibraryArtifact,
  type LibraryManifestEntry,
} from '@/data/libraryLoader';
import type { UpstreamProblem } from '@/data/upstreamFetch';

export interface LibraryState {
  items: LibraryManifestEntry[];
  /** Quellkataloge, profiles, mapping collections and unknown kinds are behind this toggle (PLAT-002, ADR-0039). */
  showAdvanced: boolean;
  busyPath: string | null;
  warning: string | null;
  /** structured reason for `warning`, for a localized toast (ADR-0039). */
  warningProblem: UpstreamProblem | null;
  error: string | null;
  /** the error as thrown (e.g. `UpstreamLoadError`), for a localized toast (ADR-0039). */
  errorCause: unknown;
  adoptedTitle: string | null;
  toggleAdvanced: () => void;
  adopt: (entry: LibraryManifestEntry) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  items: getLibraryManifest().entries,
  showAdvanced: false,
  busyPath: null,
  warning: null,
  warningProblem: null,
  error: null,
  errorCause: null,
  adoptedTitle: null,

  toggleAdvanced: () => set((s) => ({ showAdvanced: !s.showAdvanced })),

  adopt: async (entry) => {
    set({
      busyPath: entry.path,
      error: null,
      errorCause: null,
      warning: null,
      warningProblem: null,
      adoptedTitle: null,
    });
    try {
      const loaded = await loadLibraryArtifact(entry);
      await adoptLibraryArtifact(loaded);
      set({
        busyPath: null,
        adoptedTitle: entry.title,
        warning: loaded.warning ?? null,
        warningProblem: loaded.problem ?? null,
      });
    } catch (e) {
      set({ busyPath: null, error: e instanceof Error ? e.message : String(e), errorCause: e });
    }
  },
}));
