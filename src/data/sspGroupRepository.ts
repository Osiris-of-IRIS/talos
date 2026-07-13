/**
 * CRUD over the `sspGroups` store (T-512, ADR-0037). Unlike `ArtifactRepository`'s OSCAL stores,
 * groups have no origin/timestamps/import-export lifecycle — this is TALOS-internal organizational
 * data, same tier as `assetTypes`.
 */
import { getDb } from './db';
import type { SspGroup } from '@/models/sspGroup';

export async function getAllSspGroups(): Promise<SspGroup[]> {
  const db = await getDb();
  const groups = await db.getAll('sspGroups');
  return groups.sort((a, b) => a.title.localeCompare(b.title));
}

export async function createSspGroup(group: SspGroup): Promise<void> {
  const db = await getDb();
  await db.add('sspGroups', group);
}

export async function updateSspGroup(group: SspGroup): Promise<void> {
  const db = await getDb();
  await db.put('sspGroups', group);
}

/**
 * Deletes a group. Its direct children are reparented to the deleted group's own parent (cascade
 * up one level), not orphaned and not deleted themselves — deleting a branch node should not take
 * its subtree down with it. SSPs that referenced the deleted group's uuid in their `groups` prop
 * (`sspGroupMembership.ts`) are left as-is: a dangling group-uuid reference is a soft reference,
 * resolved by simply not matching any current group when memberships are read back (same
 * tolerance the rest of the app gives dangling back-matter/import references).
 */
export async function deleteSspGroup(uuid: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('sspGroups', 'readwrite');
  const store = tx.objectStore('sspGroups');
  const [target, all] = await Promise.all([store.get(uuid), store.getAll()]);
  const newParent = target?.parentGroupUuid;
  for (const child of all) {
    if (child.parentGroupUuid === uuid) {
      await store.put({ ...child, parentGroupUuid: newParent });
    }
  }
  await store.delete(uuid);
  await tx.done;
}
