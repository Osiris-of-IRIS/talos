/**
 * IndexedDB schema and connection. Decision IDs: ADR-0004.
 *
 * One object store per artifact type plus supporting stores. Working artifacts are keyed by
 * `uuid`; the library cache by `path`; unresolved references by a surrogate `id`; settings by a
 * fixed key. Schema changes bump DB_VERSION and add an upgrade branch.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OscalArtifactType } from '@/models/oscalBase';

export const DB_NAME = 'talos';
export const DB_VERSION = 2;

export type ArtifactStore =
  | 'catalogs'
  | 'profiles'
  | 'componentDefinitions'
  | 'ssps'
  | 'assessmentPlans'
  | 'assessmentResults'
  | 'poams';

export const ARTIFACT_STORES: ArtifactStore[] = [
  'catalogs',
  'profiles',
  'componentDefinitions',
  'ssps',
  'assessmentPlans',
  'assessmentResults',
  'poams',
];

/** Where a stored artifact came from — drives read-only treatment and provenance badges. */
export type Origin = 'user' | 'imported' | 'library';

export interface StoredArtifact<T = unknown> {
  uuid: string;
  type: OscalArtifactType;
  origin: Origin;
  createdAt: string;
  updatedAt: string;
  artifact: T;
}

export interface LibraryCacheEntry {
  path: string;
  sha: string;
  artifactType: OscalArtifactType | 'catalog';
  title: string;
  fetchedAt: string;
  document: unknown;
}

export interface UnresolvedReference {
  id: string;
  refKind: string;
  href: string;
  sourceUuid: string;
  sourceStore: ArtifactStore;
  createdAt: string;
}

export interface TalosSettings {
  key: 'app';
  language: 'de' | 'en';
  theme: 'light' | 'dark';
  lastLibrarySync?: string;
}

interface TalosDB extends DBSchema {
  catalogs: { key: string; value: StoredArtifact };
  profiles: { key: string; value: StoredArtifact };
  componentDefinitions: { key: string; value: StoredArtifact };
  ssps: { key: string; value: StoredArtifact };
  assessmentPlans: { key: string; value: StoredArtifact };
  assessmentResults: { key: string; value: StoredArtifact };
  poams: { key: string; value: StoredArtifact };
  libraryCache: { key: string; value: LibraryCacheEntry };
  unresolvedReferences: {
    key: string;
    value: UnresolvedReference;
    indexes: { bySource: string };
  };
  settings: { key: string; value: TalosSettings };
}

let dbPromise: Promise<IDBPDatabase<TalosDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<TalosDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TalosDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const store of ARTIFACT_STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'uuid' });
          }
        }
        if (!db.objectStoreNames.contains('libraryCache')) {
          db.createObjectStore('libraryCache', { keyPath: 'path' });
        }
        if (!db.objectStoreNames.contains('unresolvedReferences')) {
          const refs = db.createObjectStore('unresolvedReferences', { keyPath: 'id' });
          refs.createIndex('bySource', 'sourceUuid');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

/** Test/reset hook: drop the cached connection so a fresh open runs the upgrade. */
export function _resetDbForTests(): void {
  dbPromise = null;
}
