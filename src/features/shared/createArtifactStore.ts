/**
 * Generic workspace-store factory shared by every artifact feature (component-definitions,
 * SSPs, …). Wraps the artifact repository so views stay declarative. Decision IDs: ADR-0002, ADR-0004.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { ArtifactRepository } from '@/data/artifactRepository';
import { parseOscalUpload } from '@/data/fileIo';
import type { StoredArtifact } from '@/data/db';
import type { OscalArtifactType } from '@/models/oscalBase';

/** Minimal shape every OSCAL artifact model satisfies (via OscalArtifact). */
export interface ArtifactLike {
  uuid: string;
  metadata: { title: string };
}

export interface ArtifactStoreState<T extends ArtifactLike> {
  items: StoredArtifact<T>[];
  loading: boolean;
  error: string | null;
  /** Non-blocking warnings from the most recent import (e.g. off-version OSCAL, ADR-0007). */
  warnings: string[];
  load: () => Promise<void>;
  /** Import from OSCAL JSON text; returns the stored uuid (import-as-copy on collision, Q7). */
  importFromText: (text: string) => Promise<string>;
  remove: (uuid: string) => Promise<void>;
}

function newUuid(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Build a Zustand store bound to one artifact type.
 * @param type      OSCAL artifact type (selects the object store).
 * @param typeLabel human-readable label used in error messages (e.g. "component-definition").
 */
export function createArtifactStore<T extends ArtifactLike>(
  type: OscalArtifactType,
  typeLabel: string,
): UseBoundStore<StoreApi<ArtifactStoreState<T>>> {
  const repo = (): ArtifactRepository<T> => ArtifactRepository.forType<T>(type);

  return create<ArtifactStoreState<T>>((set, get) => ({
    items: [],
    loading: false,
    error: null,
    warnings: [],

    load: async () => {
      set({ loading: true, error: null });
      try {
        const items = await repo().getAll();
        items.sort((a, b) => a.artifact.metadata.title.localeCompare(b.artifact.metadata.title));
        set({ items, loading: false });
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    },

    importFromText: async (text: string) => {
      set({ warnings: [] });
      const parsed = parseOscalUpload<T>(text);
      if (parsed.type !== type) {
        throw new Error(`Expected a ${typeLabel}, got ${parsed.type}.`);
      }
      const r = repo();
      let uuid = parsed.record.uuid;
      if (await r.get(uuid)) {
        uuid = newUuid();
        parsed.record.artifact.uuid = uuid;
      }
      await r.create({ uuid, type, origin: parsed.record.origin, artifact: parsed.record.artifact });
      await get().load();
      set({ warnings: parsed.warnings });
      return uuid;
    },

    remove: async (uuid: string) => {
      await repo().delete(uuid);
      await get().load();
    },
  }));
}
