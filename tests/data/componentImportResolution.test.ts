/**
 * import-component-definition resolution (ADR-0014): back-matter-mediated href resolution
 * (mirrors control-implementation.source, T-142/ADR-0024), cycle/self-import protection, and the
 * read-only transitive import tree.
 * Covers TEST-CDEF-IMP-01.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveImport,
  wouldCreateCycle,
  buildImportTree,
  unresolvedImportHrefs,
} from '@/data/componentImportResolution';
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition } from '@/models/componentDefinition';

function def(
  uuid: string,
  title: string,
  overrides: Partial<ComponentDefinition> = {},
): StoredArtifact<ComponentDefinition> {
  return {
    uuid,
    type: 'componentDefinition',
    origin: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifact: {
      uuid,
      metadata: { title, version: '1.0.0', oscalVersion: '1.2.2' },
      ...overrides,
    },
  };
}

describe('resolveImport', () => {
  const target = def('11111111-1111-4111-8111-111111111111', 'Target Def');

  it('resolves via a back-matter resource document-id (preferred tier)', () => {
    const importer = def('22222222-2222-4222-8222-222222222222', 'Importer', {
      backMatter: {
        resources: [{ uuid: 'res-1', title: 'Target Def', documentIds: [{ identifier: target.uuid }] }],
      },
    });
    const resolved = resolveImport({ href: '#res-1' }, importer.artifact.backMatter, [target, importer]);
    expect(resolved?.uuid).toBe(target.uuid);
  });

  it('resolves via the resource\'s own uuid when no document-id matches (second tier)', () => {
    const backMatter = { resources: [{ uuid: target.uuid, title: 'Something else' }] };
    const resolved = resolveImport({ href: `#${target.uuid}` }, backMatter, [target]);
    expect(resolved?.uuid).toBe(target.uuid);
  });

  it('resolves via the resource title when neither document-id nor self-uuid match (weakest tier)', () => {
    const backMatter = { resources: [{ uuid: 'res-2', title: 'Target Def' }] };
    const resolved = resolveImport({ href: '#res-2' }, backMatter, [target]);
    expect(resolved?.uuid).toBe(target.uuid);
  });

  it('returns undefined when a resource exists but identifies nothing in the workspace', () => {
    const backMatter = { resources: [{ uuid: 'res-3', title: 'Nobody Home' }] };
    const resolved = resolveImport({ href: '#res-3' }, backMatter, [target]);
    expect(resolved).toBeUndefined();
  });

  it('falls back to treating the href as a direct component-definition uuid when no resource matches at all (legacy)', () => {
    const resolved = resolveImport({ href: `#${target.uuid}` }, undefined, [target]);
    expect(resolved?.uuid).toBe(target.uuid);
  });

  it('returns undefined for a dangling href that matches nothing', () => {
    const resolved = resolveImport({ href: '#does-not-exist' }, undefined, [target]);
    expect(resolved).toBeUndefined();
  });
});

describe('wouldCreateCycle', () => {
  it('flags a self-import', () => {
    const a = def('aaaaaaaa-0000-4000-8000-000000000001', 'A');
    expect(wouldCreateCycle(a.uuid, a.uuid, [a])).toBe(true);
  });

  it('flags a direct cycle (A already imports B; B importing A would close the loop)', () => {
    const b = def('bbbbbbbb-0000-4000-8000-000000000002', 'B');
    const a = def('aaaaaaaa-0000-4000-8000-000000000001', 'A', {
      importComponentDefinitions: [{ href: `#${b.uuid}` }],
    });
    expect(wouldCreateCycle(b.uuid, a.uuid, [a, b])).toBe(true);
  });

  it('flags an indirect cycle (A imports B imports C; C importing A would close the loop)', () => {
    const a = def('aaaaaaaa-0000-4000-8000-000000000001', 'A');
    const c = def('cccccccc-0000-4000-8000-000000000003', 'C', {
      importComponentDefinitions: [{ href: `#${a.uuid}` }],
    });
    const b = def('bbbbbbbb-0000-4000-8000-000000000002', 'B', {
      importComponentDefinitions: [{ href: `#${c.uuid}` }],
    });
    a.artifact.importComponentDefinitions = [{ href: `#${b.uuid}` }];
    expect(wouldCreateCycle(c.uuid, a.uuid, [a, b, c])).toBe(true);
  });

  it('allows importing an unrelated definition', () => {
    const a = def('aaaaaaaa-0000-4000-8000-000000000001', 'A');
    const b = def('bbbbbbbb-0000-4000-8000-000000000002', 'B');
    expect(wouldCreateCycle(a.uuid, b.uuid, [a, b])).toBe(false);
  });
});

describe('unresolvedImportHrefs', () => {
  it('lists only the hrefs that fail to resolve, never dropping them', () => {
    const target = def('11111111-1111-4111-8111-111111111111', 'Target Def');
    const hrefs = unresolvedImportHrefs(
      [{ href: `#${target.uuid}` }, { href: '#missing-1' }, { href: 'https://example.org/external.json' }],
      undefined,
      [target],
    );
    expect(hrefs).toEqual(['#missing-1', 'https://example.org/external.json']);
  });

  it('returns an empty array when every import resolves', () => {
    const target = def('11111111-1111-4111-8111-111111111111', 'Target Def');
    expect(unresolvedImportHrefs([{ href: `#${target.uuid}` }], undefined, [target])).toEqual([]);
  });

  it('returns an empty array for no imports', () => {
    expect(unresolvedImportHrefs(undefined, undefined, [])).toEqual([]);
  });
});

describe('buildImportTree', () => {
  it('builds a single-level tree with both resolved and unresolved imports', () => {
    const target = def('11111111-1111-4111-8111-111111111111', 'Target Def');
    const root = def('22222222-2222-4222-8222-222222222222', 'Root', {
      importComponentDefinitions: [{ href: `#${target.uuid}`, remarks: 'shared lib' }, { href: '#missing' }],
    });
    const tree = buildImportTree(root, [root, target]);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.resolved?.uuid).toBe(target.uuid);
    expect(tree[0]!.remarks).toBe('shared lib');
    expect(tree[0]!.cycle).toBe(false);
    expect(tree[1]!.resolved).toBeUndefined();
  });

  it('recurses transitively (A -> B -> C)', () => {
    const c = def('cccccccc-0000-4000-8000-000000000003', 'C');
    const b = def('bbbbbbbb-0000-4000-8000-000000000002', 'B', {
      importComponentDefinitions: [{ href: `#${c.uuid}` }],
    });
    const a = def('aaaaaaaa-0000-4000-8000-000000000001', 'A', {
      importComponentDefinitions: [{ href: `#${b.uuid}` }],
    });
    const tree = buildImportTree(a, [a, b, c]);
    expect(tree[0]!.resolved?.uuid).toBe(b.uuid);
    expect(tree[0]!.children[0]!.resolved?.uuid).toBe(c.uuid);
  });

  it('flags a cycle instead of expanding forever', () => {
    const b = def('bbbbbbbb-0000-4000-8000-000000000002', 'B');
    const a = def('aaaaaaaa-0000-4000-8000-000000000001', 'A', {
      importComponentDefinitions: [{ href: `#${b.uuid}` }],
    });
    b.artifact.importComponentDefinitions = [{ href: `#${a.uuid}` }];
    const tree = buildImportTree(a, [a, b]);
    expect(tree[0]!.resolved?.uuid).toBe(b.uuid);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.cycle).toBe(true);
    expect(tree[0]!.children[0]!.children).toHaveLength(0); // not re-expanded
  });
});
