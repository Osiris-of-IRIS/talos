/**
 * Profile `imports[].href` resolution (ADR-0032 §2): back-matter-mediated source lookup across
 * both catalogs and profiles, cycle detection, unresolved-href collection, a profile's effective
 * control-id set for the SSP import-profile "add all controls" offer (ADR-0032 §7), and recursive
 * profile-of-profile control resolution (ADR-0032 §5, T-206, ADR-0026 §9).
 * Covers TEST-PROF-01, TEST-PROF-10.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveProfileImportSource,
  wouldCreateProfileCycle,
  unresolvedProfileImportHrefs,
  resolveProfileControlIds,
  resolveProfileEffectiveControls,
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
  controls: [{ id: 'CTRL-1', title: 'Control One' }, { id: 'CTRL-2', title: 'Control Two' }, { id: 'CTRL-3', title: 'Control Three' }],
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

describe('resolveProfileControlIds', () => {
  it('expands includeAll against the resolved source catalog', () => {
    const p = makeProfile('p1', 'P1', [{ href: `#${catalogUuid}`, includeAll: {} }]);
    const result = resolveProfileControlIds(p.artifact, [catalog], []);
    expect(result.controlIds.sort()).toEqual(['CTRL-1', 'CTRL-2', 'CTRL-3']);
    expect(result.hasUnresolvedAll).toBe(false);
  });

  it('subtracts excludeControls from an includeAll expansion', () => {
    const p = makeProfile('p1', 'P1', [
      { href: `#${catalogUuid}`, includeAll: {}, excludeControls: [{ withIds: ['CTRL-2'] }] },
    ]);
    const result = resolveProfileControlIds(p.artifact, [catalog], []);
    expect(result.controlIds.sort()).toEqual(['CTRL-1', 'CTRL-3']);
  });

  it('uses explicit includeControls ids as-is, minus excludes', () => {
    const p = makeProfile('p1', 'P1', [
      {
        href: `#${catalogUuid}`,
        includeControls: [{ withIds: ['CTRL-1', 'CTRL-3'] }],
        excludeControls: [{ withIds: ['CTRL-3'] }],
      },
    ]);
    const result = resolveProfileControlIds(p.artifact, [catalog], []);
    expect(result.controlIds).toEqual(['CTRL-1']);
    expect(result.hasUnresolvedAll).toBe(false);
  });

  it('dedupes ids contributed by multiple imports', () => {
    const p = makeProfile('p1', 'P1', [
      { href: `#${catalogUuid}`, includeControls: [{ withIds: ['CTRL-1'] }] },
      { href: `#${catalogUuid}`, includeControls: [{ withIds: ['CTRL-1', 'CTRL-2'] }] },
    ]);
    const result = resolveProfileControlIds(p.artifact, [catalog], []);
    expect(result.controlIds.sort()).toEqual(['CTRL-1', 'CTRL-2']);
  });

  it('recursively resolves a profile-of-profile includeAll (T-206)', () => {
    const other = makeProfile('p2', 'Baseline Profile', [{ href: `#${catalogUuid}`, includeAll: {} }]);
    const p = makeProfile('p1', 'P1', [{ href: `#${other.uuid}`, includeAll: {} }]);
    const result = resolveProfileControlIds(p.artifact, [catalog], [other]);
    expect(result.controlIds.sort()).toEqual(['CTRL-1', 'CTRL-2', 'CTRL-3']);
    expect(result.hasUnresolvedAll).toBe(false);
  });

  it('flags hasUnresolvedAll for an includeAll on a dangling href', () => {
    const p = makeProfile('p1', 'P1', [{ href: '#missing', includeAll: {} }]);
    const result = resolveProfileControlIds(p.artifact, [catalog], []);
    expect(result.controlIds).toEqual([]);
    expect(result.hasUnresolvedAll).toBe(true);
  });
});

describe('resolveProfileEffectiveControls', () => {
  it("returns a profile's own controls as a Control map (not just ids), for a catalog source", () => {
    const p = makeProfile('p1', 'P1', [{ href: `#${catalogUuid}`, includeAll: {} }]);
    const { controlsById, hasUnresolved } = resolveProfileEffectiveControls(p.artifact, [catalog], []);
    expect([...controlsById.keys()].sort()).toEqual(['CTRL-1', 'CTRL-2', 'CTRL-3']);
    expect(controlsById.get('CTRL-1')?.title).toBe('Control One');
    expect(hasUnresolved).toBe(false);
  });

  it('recurses two levels deep (profile -> profile -> catalog), applying each level\'s own include/exclude', () => {
    const middle = makeProfile('p2', 'Middle Profile', [
      { href: `#${catalogUuid}`, includeAll: {}, excludeControls: [{ withIds: ['CTRL-3'] }] },
    ]);
    const top = makeProfile('p1', 'Top Profile', [{ href: `#${middle.uuid}`, includeAll: {} }]);
    const { controlsById, hasUnresolved } = resolveProfileEffectiveControls(top.artifact, [catalog], [middle]);
    expect([...controlsById.keys()].sort()).toEqual(['CTRL-1', 'CTRL-2']); // CTRL-3 excluded one level down
    expect(hasUnresolved).toBe(false);
  });

  it("an outer includeControls picks a subset of the nested profile's own effective set", () => {
    const middle = makeProfile('p2', 'Middle Profile', [{ href: `#${catalogUuid}`, includeAll: {} }]);
    const top = makeProfile('p1', 'Top Profile', [
      { href: `#${middle.uuid}`, includeControls: [{ withIds: ['CTRL-2'] }] },
    ]);
    const { controlsById } = resolveProfileEffectiveControls(top.artifact, [catalog], [middle]);
    expect([...controlsById.keys()]).toEqual(['CTRL-2']);
  });

  it('flags hasUnresolved (without infinite-looping) for an already-stored profile-of-profile cycle', () => {
    const p1 = makeProfile('p1', 'P1', [{ href: '#p2', includeAll: {} }]);
    const p2 = makeProfile('p2', 'P2', [{ href: '#p1', includeAll: {} }]);
    const { controlsById, hasUnresolved } = resolveProfileEffectiveControls(p1.artifact, [], [p1, p2]);
    expect(controlsById.size).toBe(0);
    expect(hasUnresolved).toBe(true);
  });

  it('flags hasUnresolved for a dangling href nested inside an otherwise-resolved profile', () => {
    const middle = makeProfile('p2', 'Middle Profile', [
      { href: `#${catalogUuid}`, includeAll: {} },
      { href: '#missing', includeAll: {} },
    ]);
    const top = makeProfile('p1', 'Top Profile', [{ href: `#${middle.uuid}`, includeAll: {} }]);
    const { controlsById, hasUnresolved } = resolveProfileEffectiveControls(top.artifact, [catalog], [middle]);
    expect([...controlsById.keys()].sort()).toEqual(['CTRL-1', 'CTRL-2', 'CTRL-3']); // resolved part still returned
    expect(hasUnresolved).toBe(true);
  });
});
