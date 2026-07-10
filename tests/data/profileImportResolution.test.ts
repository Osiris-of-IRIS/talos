/**
 * Profile `imports[].href` resolution (ADR-0032 §2): back-matter-mediated source lookup across
 * both catalogs and profiles, cycle detection, unresolved-href collection.
 * Covers TEST-PROF-01.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveProfileImportSource,
  wouldCreateProfileCycle,
  unresolvedProfileImportHrefs,
} from '@/data/profileImportResolution';
import type { StoredArtifact } from '@/data/db';
import type { Catalog } from '@/models/catalog';
import type { Profile } from '@/models/profile';

function stored<T>(uuid: string, artifact: T): StoredArtifact<T> {
  return { uuid, type: 'profile', origin: 'user', createdAt: '', updatedAt: '', artifact };
}

const catalogUuid = 'cccccccc-0000-4000-8000-000000000001';
const catalog: StoredArtifact<Catalog> = stored(catalogUuid, {
  uuid: catalogUuid,
  metadata: { title: 'Test Catalog', version: '1.0.0', oscalVersion: '1.2.2' },
  controls: [{ id: 'CTRL-1', title: 'Control One' }],
} as Catalog);

function makeProfile(uuid: string, title: string, imports: Profile['imports'] = []): StoredArtifact<Profile> {
  return stored(uuid, {
    uuid,
    metadata: { title, version: '1.0.0', oscalVersion: '1.2.2' },
    imports,
  } as Profile);
}

describe('resolveProfileImportSource', () => {
  it('resolves a direct-uuid href to a catalog (legacy fallback)', () => {
    const p = makeProfile('p1', 'P1', [{ href: `#${catalogUuid}` }]);
    const resolved = resolveProfileImportSource(p.artifact.imports[0]!, undefined, [catalog], []);
    expect(resolved?.type).toBe('catalog');
    expect(resolved?.item.uuid).toBe(catalogUuid);
  });

  it('resolves via a back-matter resource (document-id tier)', () => {
    const resourceUuid = 'r1';
    const p = makeProfile('p1', 'P1', [{ href: `#${resourceUuid}` }]);
    p.artifact.backMatter = { resources: [{ uuid: resourceUuid, documentIds: [{ identifier: catalogUuid }] }] };
    const resolved = resolveProfileImportSource(p.artifact.imports[0]!, p.artifact.backMatter, [catalog], []);
    expect(resolved?.type).toBe('catalog');
    expect(resolved?.item.uuid).toBe(catalogUuid);
  });

  it('resolves to a profile source', () => {
    const other = makeProfile('p2', 'Baseline Profile');
    const p = makeProfile('p1', 'P1', [{ href: `#${other.uuid}` }]);
    const resolved = resolveProfileImportSource(p.artifact.imports[0]!, undefined, [], [other]);
    expect(resolved?.type).toBe('profile');
    expect(resolved?.item.uuid).toBe('p2');
  });

  it('is unresolved for a dangling href', () => {
    const p = makeProfile('p1', 'P1', [{ href: '#does-not-exist' }]);
    expect(resolveProfileImportSource(p.artifact.imports[0]!, undefined, [catalog], [])).toBeUndefined();
  });

  it('is unresolved for an external (non-#) href', () => {
    const p = makeProfile('p1', 'P1', [{ href: 'https://example.com/catalog.json' }]);
    expect(resolveProfileImportSource(p.artifact.imports[0]!, undefined, [catalog], [])).toBeUndefined();
  });
});

describe('wouldCreateProfileCycle', () => {
  it('flags a self-import', () => {
    expect(wouldCreateProfileCycle('p1', 'p1', [])).toBe(true);
  });

  it('flags a transitive cycle', () => {
    const p1 = makeProfile('p1', 'P1', []);
    const p2 = makeProfile('p2', 'P2', [{ href: '#p1' }]);
    expect(wouldCreateProfileCycle('p1', 'p2', [p1, p2])).toBe(true);
  });

  it('allows a non-cyclic import', () => {
    const p2 = makeProfile('p2', 'P2', []);
    expect(wouldCreateProfileCycle('p1', 'p2', [p2])).toBe(false);
  });
});

describe('unresolvedProfileImportHrefs', () => {
  it('collects only dangling hrefs', () => {
    const p = makeProfile('p1', 'P1', [{ href: `#${catalogUuid}` }, { href: '#missing' }]);
    expect(unresolvedProfileImportHrefs(p.artifact.imports, undefined, [catalog], [])).toEqual(['#missing']);
  });
});
