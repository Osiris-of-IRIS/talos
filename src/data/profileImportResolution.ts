/**
 * `imports[].href` resolution for profiles (ADR-0032 §2): a profile's import source is either a
 * workspace catalog or another workspace profile, back-matter-mediated exactly like
 * `control-implementation.source` (T-142/`catalogResolution.ts`) and `import-component-definition`
 * (T-102/`componentImportResolution.ts`) — same shared resolver (`backMatterReferenceResolution.ts`),
 * with a catalog pool and a profile pool tried in order at each tier.
 */
import type { BackMatter } from '@/models/oscalBase';
import type { Catalog } from '@/models/catalog';
import type { Control } from '@/models/control';
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

export interface ProfileControlsResolution {
  /** This profile's own effective control set, `id -> Control`, recursively resolved through
   * profile-of-profile imports (T-206) down to catalog sources — the same shape a checklist/
   * target-object picker expects from a catalog (`indexCatalogControls`): an `includeAll` import
   * copies its resolved source's map wholesale, so it stays dual-keyed (literal id + `_{uuid}`
   * alt-identifier, ADR-0021) exactly like that source was; callers that want "the set of
   * controls" must go through `uniqueCatalogControlEntries`, same as a plain catalog map. */
  controlsById: Map<string, Control>;
  /** True when some import along the chain couldn't be fully resolved — a dangling/external href,
   * or an already-stored profile-of-profile cycle broke the walk (`visited`-guarded; this can
   * happen even without an add-time cycle check catching it, e.g. imported data). Whatever *did*
   * resolve is still returned, never discarded. */
  hasUnresolved: boolean;
}

export interface ProfileImportControlsResolution extends ProfileControlsResolution {
  /** Every control the import's *source* resolves to, before this import's own excludes are
   * applied — needed to look up an excluded control's own display info (the profile detail page,
   * T-513, shows what an import explicitly excludes, not just what makes it through). */
  sourceControlsById: Map<string, Control>;
}

/**
 * One import's own contribution to a profile's effective control set (ADR-0032 §5/§7, T-206):
 * a catalog-sourced import contributes its own `indexCatalogControls` map directly; a
 * profile-sourced import recursively resolves *that* profile's own effective set first, via
 * `resolveProfileEffectiveControls`. `merge`/`modify` don't affect which controls make it through
 * (merge is fixed `as-is` for v1, ADR-0032 §6), so only this one import's own
 * `includeAll`/`includeControls`/`excludeControls` matter. `visited` guards recursive
 * profile-of-profile resolution against a cycle in already-stored data (see
 * `resolveProfileEffectiveControls`'s doc comment).
 */
export function resolveProfileImportControls(
  imp: ProfileImport,
  profile: Profile,
  catalogs: StoredArtifact<Catalog>[],
  profiles: StoredArtifact<Profile>[],
  visited: Set<string> = new Set(),
): ProfileImportControlsResolution {
  const excluded = new Set(imp.excludeControls?.[0]?.withIds ?? []);
  const resolved = resolveProfileImportSource(imp, profile.backMatter, catalogs, profiles);
  let sourceControlsById: Map<string, Control>;
  let hasUnresolved = false;

  if (resolved?.type === 'catalog') {
    sourceControlsById = indexCatalogControls(resolved.item.artifact);
  } else if (resolved?.type === 'profile') {
    const nested = resolveProfileEffectiveControls(resolved.item.artifact, catalogs, profiles, visited);
    sourceControlsById = nested.controlsById;
    hasUnresolved = nested.hasUnresolved;
  } else {
    return { sourceControlsById: new Map(), controlsById: new Map(), hasUnresolved: true };
  }

  const controlsById = new Map<string, Control>();
  if (imp.includeAll) {
    for (const [id, control] of sourceControlsById) {
      if (!excluded.has(id)) controlsById.set(id, control);
    }
  } else {
    for (const id of imp.includeControls?.[0]?.withIds ?? []) {
      if (excluded.has(id)) continue;
      const control = sourceControlsById.get(id);
      if (control) controlsById.set(id, control);
    }
  }

  return { sourceControlsById, controlsById, hasUnresolved };
}

/**
 * A profile's own effective control set (ADR-0032 §5/§7, T-206) — every import's own contribution
 * (`resolveProfileImportControls`) merged together. `visited` (the chain of profile uuids walked
 * so far) guards against a cycle in already-stored data — not just at add-time
 * (`wouldCreateProfileCycle`, used when a *new* import is picked in the editor); a cycle here just
 * stops the walk and flags `hasUnresolved`, never loops forever.
 */
export function resolveProfileEffectiveControls(
  profile: Profile,
  catalogs: StoredArtifact<Catalog>[],
  profiles: StoredArtifact<Profile>[],
  visited: Set<string> = new Set(),
): ProfileControlsResolution {
  if (visited.has(profile.uuid)) return { controlsById: new Map(), hasUnresolved: true };
  const nextVisited = new Set(visited).add(profile.uuid);

  const controlsById = new Map<string, Control>();
  let hasUnresolved = false;

  for (const imp of profile.imports) {
    const importResolution = resolveProfileImportControls(imp, profile, catalogs, profiles, nextVisited);
    if (importResolution.hasUnresolved) hasUnresolved = true;
    for (const [id, control] of importResolution.controlsById) controlsById.set(id, control);
  }

  return { controlsById, hasUnresolved };
}

export interface ProfileControlResolution {
  /** Deduped effective control-id set, across every import, minus each import's own excludes. */
  controlIds: string[];
  /** True when some import (at this profile or a nested one, T-206) couldn't be fully resolved —
   * a dangling/external href, or a profile-of-profile cycle. */
  hasUnresolvedAll: boolean;
}

/**
 * A profile's effective, deduped control-id set (ADR-0032 §7) — used by the SSP `import-profile`
 * picker and the Single-System bootstrap variant (ADR-0026 §9) to offer/generate every resolved
 * control. Thin wrapper over `resolveProfileEffectiveControls`, deduped via
 * `uniqueCatalogControlEntries` the same way a catalog-sourced control list already was.
 */
export function resolveProfileControlIds(
  profile: Profile,
  catalogs: StoredArtifact<Catalog>[],
  profiles: StoredArtifact<Profile>[],
): ProfileControlResolution {
  const { controlsById, hasUnresolved } = resolveProfileEffectiveControls(profile, catalogs, profiles);
  return {
    controlIds: uniqueCatalogControlEntries(controlsById).map(([id]) => id),
    hasUnresolvedAll: hasUnresolved,
  };
}
