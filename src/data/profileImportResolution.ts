/**
 * `imports[].href` resolution for profiles (ADR-0032 §2): a profile's import source is either a
 * workspace catalog or another workspace profile, back-matter-mediated exactly like
 * `control-implementation.source` (T-142/`catalogResolution.ts`) and `import-component-definition`
 * (T-102/`componentImportResolution.ts`) — same shared resolver (`backMatterReferenceResolution.ts`),
 * with a catalog pool and a profile pool tried in order at each tier.
 */
import type { BackMatter } from '@/models/oscalBase';
import type { Catalog } from '@/models/catalog';
import type { Profile, ProfileImport } from '@/models/profile';
import type { StoredArtifact } from './db';
import { refOf, resolveBackMatterReference, type ReferencePool } from './backMatterReferenceResolution';
import { indexCatalogControls, uniqueCatalogControlEntries } from './catalogResolution';

export type ResolvedImportSource =
  | { type: 'catalog'; item: StoredArtifact<Catalog> }
  | { type: 'profile'; item: StoredArtifact<Profile> };

function catalogPool(catalogs: StoredArtifact<Catalog>[]): ReferencePool<ResolvedImportSource> {
  return {
    findByUuid: (uuid) => {
      const c = catalogs.find((c) => c.uuid === uuid);
      return c ? { type: 'catalog', item: c } : undefined;
    },
    findByTitle: (title) => {
      const c = catalogs.find((c) => c.artifact.metadata.title === title);
      return c ? { type: 'catalog', item: c } : undefined;
    },
  };
}

function profilePool(profiles: StoredArtifact<Profile>[]): ReferencePool<ResolvedImportSource> {
  return {
    findByUuid: (uuid) => {
      const p = profiles.find((p) => p.uuid === uuid);
      return p ? { type: 'profile', item: p } : undefined;
    },
    findByTitle: (title) => {
      const p = profiles.find((p) => p.artifact.metadata.title === title);
      return p ? { type: 'profile', item: p } : undefined;
    },
  };
}

/**
 * Resolve one import to the workspace catalog or profile it refers to, or `undefined` when
 * unresolved (dangling/external href, or a back-matter resource that identifies nothing in the
 * workspace).
 */
export function resolveProfileImportSource(
  imp: ProfileImport,
  backMatter: BackMatter | undefined,
  catalogs: StoredArtifact<Catalog>[],
  profiles: StoredArtifact<Profile>[],
): ResolvedImportSource | undefined {
  return resolveBackMatterReference<ResolvedImportSource>(refOf(imp.href), backMatter, [
    catalogPool(catalogs),
    profilePool(profiles),
  ]);
}

/**
 * True when adding an import of `targetUuid` into `importerUuid` would create a cycle (including a
 * plain self-import). Only profile→profile chains can cycle (a catalog has no `imports` of its
 * own), so this only ever resolves against the profile pool.
 */
export function wouldCreateProfileCycle(
  importerUuid: string,
  targetUuid: string,
  profiles: StoredArtifact<Profile>[],
): boolean {
  if (importerUuid === targetUuid) return true;
  const byUuid = new Map(profiles.map((p) => [p.uuid, p]));
  const visited = new Set<string>();
  const pool = profilePool(profiles);

  function reaches(fromUuid: string): boolean {
    if (fromUuid === importerUuid) return true;
    if (visited.has(fromUuid)) return false;
    visited.add(fromUuid);
    const from = byUuid.get(fromUuid);
    const imports = from?.artifact.imports ?? [];
    return imports.some((imp) => {
      const resolved = resolveBackMatterReference(refOf(imp.href), from!.artifact.backMatter, [pool]);
      return resolved?.type === 'profile' && reaches(resolved.item.uuid);
    });
  }

  return reaches(targetUuid);
}

/**
 * Every import href that doesn't resolve against the workspace (dangling/external) — never
 * silently dropped; the caller records these in the `unresolvedReferences` store (same convention
 * as ADR-0014) so a later resolve pass can find and fix them.
 */
export function unresolvedProfileImportHrefs(
  imports: ProfileImport[] | undefined,
  backMatter: BackMatter | undefined,
  catalogs: StoredArtifact<Catalog>[],
  profiles: StoredArtifact<Profile>[],
): string[] {
  return (imports ?? [])
    .filter((imp) => !resolveProfileImportSource(imp, backMatter, catalogs, profiles))
    .map((imp) => imp.href);
}

export interface ProfileControlResolution {
  /** Deduped effective control-id set, across every import, minus each import's own excludes. */
  controlIds: string[];
  /** True when at least one `includeAll` import couldn't be expanded — its source resolved to
   * another profile (not a catalog) or didn't resolve at all. Expanding a profile-sourced
   * `includeAll` means recursively resolving *that* profile's own imports first — out of scope
   * until T-206 lands (ADR-0032 §5) — so it's reported here instead of silently guessed at or
   * dropped. */
  hasUnresolvedAll: boolean;
}

/**
 * A profile's effective, deduped control-id set (ADR-0032 §7) — used by the SSP `import-profile`
 * picker to offer adding every control as a blank implemented-requirement. `includeControls`
 * (explicit ids) are used as-is regardless of the import's source type — no resolution needed.
 * `includeAll` is only expandable when the import resolves to a **catalog**; a profile-sourced
 * `includeAll` sets `hasUnresolvedAll` instead (see T-206).
 */
export function resolveProfileControlIds(
  profile: Profile,
  catalogs: StoredArtifact<Catalog>[],
  profiles: StoredArtifact<Profile>[],
): ProfileControlResolution {
  const ids = new Set<string>();
  let hasUnresolvedAll = false;
  for (const imp of profile.imports) {
    const excluded = new Set(imp.excludeControls?.[0]?.withIds ?? []);
    if (imp.includeAll) {
      const resolved = resolveProfileImportSource(imp, profile.backMatter, catalogs, profiles);
      if (resolved?.type === 'catalog') {
        const controlsById = indexCatalogControls(resolved.item.artifact);
        for (const [id] of uniqueCatalogControlEntries(controlsById)) {
          if (!excluded.has(id)) ids.add(id);
        }
      } else {
        hasUnresolvedAll = true;
      }
    } else {
      for (const id of imp.includeControls?.[0]?.withIds ?? []) {
        if (!excluded.has(id)) ids.add(id);
      }
    }
  }
  return { controlIds: [...ids], hasUnresolvedAll };
}
