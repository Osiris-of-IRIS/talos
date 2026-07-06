/**
 * Generic CRUD repository over the per-type artifact object stores. Views never touch
 * IndexedDB directly — they go through a repository. Decision IDs: ADR-0004.
 */
import { getDb, type ArtifactStore, type Origin, type StoredArtifact } from './db';
import type { OscalArtifactType } from '@/models/oscalBase';

/** Maps an OSCAL artifact type to its object store. */
export const TYPE_TO_STORE: Record<OscalArtifactType, ArtifactStore> = {
  catalog: 'catalogs',
  profile: 'profiles',
  componentDefinition: 'componentDefinitions',
  systemSecurityPlan: 'ssps',
  assessmentPlan: 'assessmentPlans',
  assessmentResults: 'assessmentResults',
  planOfActionAndMilestones: 'poams',
};

export interface CreateArtifactInput<T> {
  uuid: string;
  type: OscalArtifactType;
  origin: Origin;
  artifact: T;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class ArtifactRepository<T = unknown> {
  constructor(private readonly store: ArtifactStore) {}

  static forType<T = unknown>(type: OscalArtifactType): ArtifactRepository<T> {
    return new ArtifactRepository<T>(TYPE_TO_STORE[type]);
  }

  async getAll(): Promise<StoredArtifact<T>[]> {
    const db = await getDb();
    return (await db.getAll(this.store)) as StoredArtifact<T>[];
  }

  async get(uuid: string): Promise<StoredArtifact<T> | undefined> {
    const db = await getDb();
    return (await db.get(this.store, uuid)) as StoredArtifact<T> | undefined;
  }

  async count(): Promise<number> {
    const db = await getDb();
    return db.count(this.store);
  }

  /** Insert a new record, stamping createdAt/updatedAt. Rejects if the uuid already exists. */
  async create(input: CreateArtifactInput<T>): Promise<StoredArtifact<T>> {
    const db = await getDb();
    const existing = await db.get(this.store, input.uuid);
    if (existing) {
      throw new Error(`Artifact ${input.uuid} already exists in ${this.store}.`);
    }
    const ts = nowIso();
    const record: StoredArtifact<T> = {
      uuid: input.uuid,
      type: input.type,
      origin: input.origin,
      createdAt: ts,
      updatedAt: ts,
      artifact: input.artifact,
    };
    await db.put(this.store, record as StoredArtifact);
    return record;
  }

  /** Update an existing record's artifact body, refreshing updatedAt. */
  async update(uuid: string, artifact: T): Promise<StoredArtifact<T>> {
    const db = await getDb();
    const existing = (await db.get(this.store, uuid)) as StoredArtifact<T> | undefined;
    if (!existing) {
      throw new Error(`Artifact ${uuid} not found in ${this.store}.`);
    }
    const record: StoredArtifact<T> = { ...existing, artifact, updatedAt: nowIso() };
    await db.put(this.store, record as StoredArtifact);
    return record;
  }

  /** Insert-or-replace (used by import). Preserves createdAt when replacing. */
  async put(record: StoredArtifact<T>): Promise<void> {
    const db = await getDb();
    const existing = (await db.get(this.store, record.uuid)) as StoredArtifact<T> | undefined;
    const toStore: StoredArtifact<T> = {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt,
      updatedAt: nowIso(),
    };
    await db.put(this.store, toStore as StoredArtifact);
  }

  async delete(uuid: string): Promise<void> {
    const db = await getDb();
    await db.delete(this.store, uuid);
  }
}
