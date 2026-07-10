/**
 * Generic back-matter-mediated reference resolution (ADR-0013/0014/0024/0032): the shared
 * three-tier fallback every cross-artifact `#<uuid>` reference in TALOS resolves through —
 * `control-implementation.source` → catalog (T-142), `import-component-definition` → another
 * component-definition (ADR-0014/T-102), and a profile's `imports[].href` → a catalog or another
 * profile (ADR-0032) all follow the identical algorithm:
 *
 *   1. `href` → a back-matter resource (`#<resourceUuid>`); from that resource:
 *      1a. a `document-id` matching a target's uuid,
 *      1b. the resource's own uuid, in case it happens to equal a target's uuid,
 *      1c. the resource's `title` matching a target's title (weakest tier).
 *   2. No matching resource at all → legacy/direct fallback: treat the ref as the target's uuid
 *      itself (keeps already-authored/hand-written TALOS documents resolvable).
 *
 * `pools` are searched in order at each tier — a caller with more than one candidate target type
 * (e.g. a profile import resolving against catalogs *or* profiles) passes multiple pools; a
 * single-target-type caller (catalog source, component-definition import) passes exactly one.
 */
import type { BackMatter } from '@/models/oscalBase';

/** Looks a resolved value up by the two keys a back-matter tier can offer. */
export interface ReferencePool<T> {
  findByUuid: (uuid: string) => T | undefined;
  findByTitle: (title: string) => T | undefined;
}

/** Strip a leading `#`; an href without one has no OSCAL-legal local reference to resolve. Kept
 * here for callers that require the strict `#`-prefixed form (component-definition/profile
 * imports) — `control-implementation.source` accepts a bare uuid too and does its own stripping
 * (`catalogResolution.ts`'s `sourceToCatalogUuid`), so it doesn't use this. */
export function refOf(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return href.startsWith('#') ? href.slice(1) || undefined : undefined;
}

function findAcrossPools<T>(uuid: string, title: string | undefined, pools: ReferencePool<T>[]): T | undefined {
  for (const pool of pools) {
    const found = pool.findByUuid(uuid);
    if (found) return found;
  }
  if (title) {
    for (const pool of pools) {
      const found = pool.findByTitle(title);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Resolve an already-normalized `ref` (no leading `#` — each caller strips its own href format
 * first, since acceptance rules differ: catalog `source` allows a bare uuid, component-definition
 * and profile imports require the `#` prefix) against `pools`, back-matter-mediated. Returns
 * `undefined` when unresolved (dangling ref, or a back-matter resource that identifies nothing in
 * any pool).
 */
export function resolveBackMatterReference<T>(
  ref: string | undefined,
  backMatter: BackMatter | undefined,
  pools: ReferencePool<T>[],
): T | undefined {
  if (!ref) return undefined;

  const resource = backMatter?.resources?.find((r) => r.uuid === ref);
  if (resource) {
    for (const d of resource.documentIds ?? []) {
      const found = findAcrossPools(d.identifier, undefined, pools);
      if (found) return found;
    }
    return findAcrossPools(resource.uuid, resource.title, pools);
  }

  return findAcrossPools(ref, undefined, pools);
}
