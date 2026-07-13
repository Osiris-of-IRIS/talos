/**
 * SSP-group tree walking (T-512, ADR-0037). Covers TEST-SGRP-01.
 */
import { describe, it, expect } from 'vitest';
import { descendantChain, groupDepth } from '@/data/sspGroupHierarchy';
import type { SspGroup } from '@/models/sspGroup';

const groups: SspGroup[] = [
  { uuid: 'root', title: 'Root' },
  { uuid: 'child-a', title: 'Child A', parentGroupUuid: 'root' },
  { uuid: 'child-b', title: 'Child B', parentGroupUuid: 'root' },
  { uuid: 'grandchild', title: 'Grandchild', parentGroupUuid: 'child-a' },
  { uuid: 'unrelated', title: 'Unrelated' },
];

describe('descendantChain', () => {
  it('includes the group itself plus every descendant, recursively', () => {
    expect(descendantChain('root', groups).sort()).toEqual(['child-a', 'child-b', 'grandchild', 'root'].sort());
  });

  it('returns just the leaf itself when it has no children', () => {
    expect(descendantChain('grandchild', groups)).toEqual(['grandchild']);
  });

  it('does not include unrelated groups', () => {
    expect(descendantChain('root', groups)).not.toContain('unrelated');
  });

  it('does not infinite-loop on a malformed cycle', () => {
    const cyclic: SspGroup[] = [
      { uuid: 'x', title: 'X', parentGroupUuid: 'y' },
      { uuid: 'y', title: 'Y', parentGroupUuid: 'x' },
    ];
    expect(descendantChain('x', cyclic).sort()).toEqual(['x', 'y']);
  });
});

describe('groupDepth', () => {
  const byUuid = new Map(groups.map((g) => [g.uuid, g]));

  it('is 0 for a root group', () => {
    expect(groupDepth('root', byUuid)).toBe(0);
  });

  it('increments per level of nesting', () => {
    expect(groupDepth('child-a', byUuid)).toBe(1);
    expect(groupDepth('grandchild', byUuid)).toBe(2);
  });
});
