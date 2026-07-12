/**
 * IndexedDB schema and connection. Decision IDs: ADR-0004.
 *
 * One object store per artifact type plus supporting stores. Working artifacts are keyed by
 * `uuid`; the library cache by `path`; unresolved references by a surrogate `id`; settings by a
 * fixed key. Schema changes bump DB_VERSION and add an upgrade branch.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OscalArtifactType } from '@/models/oscalBase';
import type { Asset, AssetType } from '@/models/asset';

export const DB_NAME = 'talos';
export const DB_VERSION = 5;

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
  /** Global default creator identity (ADR-0033): applied to every newly-created artifact's
   * `metadata.parties`/`responsibleParties` (the `creator` role, ADR-0019) so the user doesn't
   * have to re-enter it per document. `creatorUuid`, once picked (user-supplied or
   * auto-generated on first save), is persisted and reused for every subsequent document — the
   * same real-world person keeps the same OSCAL party uuid everywhere TALOS generates it. */
  creatorName?: string;
  creatorEmail?: string;
  creatorUuid?: string;
}

/** Cached copy of the BSI target-object-category namespace CSV (ADR-0026). Not sha-pinned like
 * the library (no manifest for it) — refreshed on every successful fetch, served stale on failure. */
export interface TargetObjectCategoryCacheEntry {
  key: 'target-object-categories';
  fetchedAt: string;
  rows: unknown;
}

/** Cached copy of the BSI `basethreats.csv` elementary-threats namespace (ADR-0035). Same
 * not-sha-pinned, refresh-on-success/serve-stale-on-failure treatment as the target-object-category
 * cache above. */
export interface ThreatCatalogCacheEntry {
  key: 'threat-catalog';
  fetchedAt: string;
  rows: unknown;
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
  /** SSP-bootstrap input data (ADR-0026) — not an OSCAL artifact type. */
  assets: { key: string; value: Asset };
  assetTypes: { key: string; value: AssetType };
  targetObjectCategoryCache: { key: string; value: TargetObjectCategoryCacheEntry };
  threatCatalogCache: { key: string; value: ThreatCatalogCacheEntry };
}

let dbPromise: Promise<IDBPDatabase<TalosDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<TalosDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TalosDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v3->v4 (ADR-0031): Asset.uuid renamed to Asset.assetId (it was never a real uuid — see
        // the model doc comment) — the store's keyPath must follow. No migration of existing rows:
        // assets are re-uploadable bootstrap input data, not user-authored artifacts, so dropping
        // and recreating is simplest; a re-upload (CSV trio or the new JSON alternative) restores
        // the workspace exactly as it was.
        if (oldVersion > 0 && oldVersion < 4 && db.objectStoreNames.contains('assets')) {
          db.deleteObjectStore('assets');
        }
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
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'assetId' });
        }
        if (!db.objectStoreNames.contains('assetTypes')) {
          db.createObjectStore('assetTypes', { keyPath: 'uuid' });
        }
        if (!db.objectStoreNames.contains('targetObjectCategoryCache')) {
          db.createObjectStore('targetObjectCategoryCache', { keyPath: 'key' });
        }
        // v4->v5 (ADR-0035): new threat-catalog cache store — additive only, no migration.
        if (!db.objectStoreNames.contains('threatCatalogCache')) {
          db.createObjectStore('threatCatalogCache', { keyPath: 'key' });
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
