/**
 * SSP-group CRUD, fake-indexeddb (T-512, ADR-0037). Covers TEST-SGRP-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { getAllSspGroups, createSspGroup, updateSspGroup, deleteSspGroup } from '@/data/sspGroupRepository';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('SSP group CRUD', () => {
  it('creates and lists groups, sorted by title', async () => {
    await createSspGroup({ uuid: 'b', title: 'Bravo' });
    await createSspGroup({ uuid: 'a', title: 'Alpha' });
    const all = await getAllSspGroups();
    expect(all.map((g) => g.title)).toEqual(['Alpha', 'Bravo']);
  });

  it('updates a group (rename, reparent)', async () => {
    await createSspGroup({ uuid: 'a', title: 'Alpha' });
    await createSspGroup({ uuid: 'b', title: 'Bravo' });
    await updateSspGroup({ uuid: 'b', title: 'Bravo Renamed', parentGroupUuid: 'a' });
    const all = await getAllSspGroups();
    expect(all.find((g) => g.uuid === 'b')).toEqual({ uuid: 'b', title: 'Bravo Renamed', parentGroupUuid: 'a' });
  });

  it('deleting a group reparents its direct children to its own parent, not orphaning or deleting them', async () => {
    await createSspGroup({ uuid: 'root', title: 'Root' });
    await createSspGroup({ uuid: 'mid', title: 'Mid', parentGroupUuid: 'root' });
    await createSspGroup({ uuid: 'leaf', title: 'Leaf', parentGroupUuid: 'mid' });

    await deleteSspGroup('mid');

    const all = await getAllSspGroups();
    expect(all.map((g) => g.uuid).sort()).toEqual(['leaf', 'root']);
    expect(all.find((g) => g.uuid === 'leaf')?.parentGroupUuid).toBe('root');
  });

  it('deleting a root group with children promotes them to roots (parentGroupUuid undefined)', async () => {
    await createSspGroup({ uuid: 'root', title: 'Root' });
    await createSspGroup({ uuid: 'child', title: 'Child', parentGroupUuid: 'root' });

    await deleteSspGroup('root');

    const all = await getAllSspGroups();
    expect(all.map((g) => g.uuid)).toEqual(['child']);
    expect(all[0]?.parentGroupUuid).toBeUndefined();
  });
});
