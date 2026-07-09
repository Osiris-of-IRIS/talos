/**
 * Persistence for unresolved cross-artifact references (ADR-0014, ADR-0004): a dangling
 * `import-component-definition` href (or any future `refKind`) is recorded here — never silently
 * dropped — so a later resolve pass can find and fix it. Re-syncing a source's unresolved set
 * replaces its prior entries for that `refKind` wholesale; it is not an accumulating log.
 */
import { getDb, type ArtifactStore, type UnresolvedReference } from './db';

function refId(sourceUuid: string, refKind: string, href: string): string {
  return `${sourceUuid}:${refKind}:${href}`;
}

/** Replace `sourceUuid`'s recorded unresolved refs of `refKind` with exactly `hrefs`. */
export async function syncUnresolvedReferences(
  sourceUuid: string,
  sourceStore: ArtifactStore,
  refKind: string,
  hrefs: string[],
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('unresolvedReferences', 'readwrite');
  const existing = await tx.store.index('bySource').getAll(sourceUuid);
  const stale = existing.filter((e) => e.refKind === refKind);
  const createdAt = new Date().toISOString();
  await Promise.all([
    ...stale.map((e) => tx.store.delete(e.id)),
    ...hrefs.map((href) =>
      tx.store.put({
        id: refId(sourceUuid, refKind, href),
        refKind,
        href,
        sourceUuid,
        sourceStore,
        createdAt,
      } satisfies UnresolvedReference),
    ),
  ]);
  await tx.done;
}

/** Every unresolved reference recorded for a given source artifact (any refKind). */
export async function getUnresolvedReferencesFor(sourceUuid: string): Promise<UnresolvedReference[]> {
  const db = await getDb();
  return db.getAllFromIndex('unresolvedReferences', 'bySource', sourceUuid);
}
