/**
 * `imports[].href` resolution for profiles (ADR-0032 §2): a profile's import source is either a
 * workspace catalog or another workspace profile, back-matter-mediated exactly like
 * `control-implementation.source` (T-142/`catalogResolution.ts`) and `import-component-definition`
 * (T-102/`componentImportResolution.ts`) — same three-tier fallback (document-id → resource's own
 * uuid → title), same "resource exists but matches nothing ⇒ unresolved" rule, same legacy
 * direct-uuid fallback when no back-matter resource is involved at all.
 */
import type { BackMatter } from '@/models/oscalBase';
import type { Catalog } from '@/models/catalog';
import type { Profile, ProfileImport } from '@/models/profile';
import type { StoredArtifact } from './db';

export type ResolvedImportSource =
  | { type: 'catalog'; item: StoredArtifact<Catalog> }
  | { type: 'profile'; item: StoredArtifact<Profile> };

/** Strip a leading `#`; an href without one has no OSCAL-legal local reference to resolve. */
function refOf(href: string): string | undefined {
  return href.startsWith('#') ? href.slice(1) || undefined : undefined;
}

function findByUuidOrTitle(
  uuid: string,
  title: string | undefined,
  catalogs: StoredArtifact<Catalog>[],
  profiles: StoredArtifact<Profile>[],
): ResolvedImportSource | undefined {
  const catalog = catalogs.find((c) => c.uuid === uuid);
  if (catalog) return { type: 'catalog', item: catalog };
  const profile = profiles.find((p) => p.uuid === uuid);
  if (profile) return { type: 'profile', item: profile };
  if (title) {
    const catalogByTitle = catalogs.find((c) => c.artifact.metadata.title === title);
    if (catalogByTitle) return { type: 'catalog', item: catalogByTitle };
    const profileByTitle = profiles.find((p) => p.artifact.metadata.title === title);
    if (profileByTitle) return { type: 'profile', item: profileByTitle };
  }
  return undefined;
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
  const ref = refOf(imp.href);
  if (!ref) return undefined;

  const resource = backMatter?.resources?.find((r) => r.uuid === ref);
  if (resource) {
    for (const d of resource.documentIds ?? []) {
      const found = findByUuidOrTitle(d.identifier, undefined, catalogs, profiles);
      if (found) return found;
    }
    return findByUuidOrTitle(resource.uuid, resource.title, catalogs, profiles);
  }

  return findByUuidOrTitle(ref, undefined, catalogs, profiles);
}

/**
 * True when adding an import of `targetUuid` into `importerUuid` would create a cycle (including a
 * plain self-import). Only profile→profile chains can cycle (a catalog has no `imports` of its
 * own), so this only walks resolved profile sources.
 */
export function wouldCreateProfileCycle(
  importerUuid: string,
  targetUuid: string,
  profiles: StoredArtifact<Profile>[],
): boolean {
  if (importerUuid === targetUuid) return true;
  const byUuid = new Map(profiles.map((p) => [p.uuid, p]));
  const visited = new Set<string>();

  function reaches(fromUuid: string): boolean {
    if (fromUuid === importerUuid) return true;
    if (visited.has(fromUuid)) return false;
    visited.add(fromUuid);
    const from = byUuid.get(fromUuid);
    const imports = from?.artifact.imports ?? [];
    return imports.some((imp) => {
      const resolved = resolveProfileImportSource(imp, from!.artifact.backMatter, [], profiles);
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
