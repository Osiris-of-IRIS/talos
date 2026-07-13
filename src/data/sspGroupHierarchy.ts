/**
 * SSP-group tree walking (T-512, ADR-0037) — the descendant-direction mirror of
 * `targetObjectHierarchy.ts`'s `ancestorChain`: given a group, every uuid a "apply to this group"
 * propagation should reach (the group itself plus all of its nested subgroups, recursively).
 */
import type { SspGroup } from '@/models/sspGroup';

/**
 * The group's own uuid plus every descendant's uuid (children, recursively). Guards against a
 * malformed cycle by never revisiting a uuid already in the chain.
 */
export function descendantChain(groupUuid: string, groups: SspGroup[]): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();

  function visit(uuid: string) {
    if (seen.has(uuid)) return;
    seen.add(uuid);
    chain.push(uuid);
    for (const child of groups) {
      if (child.parentGroupUuid === uuid) visit(child.uuid);
    }
  }

  visit(groupUuid);
  return chain;
}

/** Depth of a group in its tree (root = 0) — for indented display in the groups CRUD page. */
export function groupDepth(groupUuid: string, byUuid: Map<string, SspGroup>): number {
  let depth = 0;
  let current = byUuid.get(groupUuid)?.parentGroupUuid;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth++;
    current = byUuid.get(current)?.parentGroupUuid;
  }
  return depth;
}
