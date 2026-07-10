/**
 * `import-component-definition` resolution (ADR-0014): resolve an import's href to a workspace
 * component-definition, detect cycles/self-imports before an add-import commits, and build the
 * read-only transitive tree for the detail page. Mirrors `catalogResolution.ts`'s
 * back-matter-mediated `source` resolution (T-142/ADR-0024) — same three-tier fallback
 * (document-id → resource's own uuid → title), same "resource exists but matches nothing ⇒
 * unresolved" rule, same legacy direct-uuid fallback when no back-matter resource is involved at
 * all (hand-authored or pre-ADR-0014 documents).
 */
import type { BackMatter } from '@/models/oscalBase';
import type { ComponentDefinition, ImportComponentDefinition } from '@/models/componentDefinition';
import type { StoredArtifact } from './db';
import { refOf, resolveBackMatterReference } from './backMatterReferenceResolution';

type CompDef = StoredArtifact<ComponentDefinition>;

/**
 * Resolve one import to the workspace component-definition it refers to, or `undefined` when
 * unresolved (dangling/external href, or a back-matter resource that identifies nothing in the
 * workspace).
 */
export function resolveImport(
  imp: ImportComponentDefinition,
  backMatter: BackMatter | undefined,
  workspace: CompDef[],
): CompDef | undefined {
  return resolveBackMatterReference<CompDef>(refOf(imp.href), backMatter, [
    {
      findByUuid: (uuid) => workspace.find((w) => w.uuid === uuid),
      findByTitle: (title) => workspace.find((w) => w.artifact.metadata.title === title),
    },
  ]);
}

/**
 * True when adding an import of `targetUuid` into `importerUuid` would create a cycle (including
 * a plain self-import) — i.e. `target` can already (transitively, via its own resolved imports)
 * reach `importer`.
 */
export function wouldCreateCycle(importerUuid: string, targetUuid: string, workspace: CompDef[]): boolean {
  if (importerUuid === targetUuid) return true;
  const byUuid = new Map(workspace.map((w) => [w.uuid, w]));
  const visited = new Set<string>();

  function reaches(fromUuid: string): boolean {
    if (fromUuid === importerUuid) return true;
    if (visited.has(fromUuid)) return false;
    visited.add(fromUuid);
    const from = byUuid.get(fromUuid);
    const imports = from?.artifact.importComponentDefinitions ?? [];
    return imports.some((imp) => {
      const resolved = resolveImport(imp, from!.artifact.backMatter, workspace);
      return resolved !== undefined && reaches(resolved.uuid);
    });
  }

  return reaches(targetUuid);
}

/**
 * Every import href that doesn't resolve against the workspace (dangling/external) — never
 * silently dropped; the caller records these in the `unresolvedReferences` store (ADR-0014) so a
 * later resolve pass can find and fix them.
 */
export function unresolvedImportHrefs(
  imports: ImportComponentDefinition[] | undefined,
  backMatter: BackMatter | undefined,
  workspace: CompDef[],
): string[] {
  return (imports ?? [])
    .filter((imp) => !resolveImport(imp, backMatter, workspace))
    .map((imp) => imp.href);
}

export interface ImportTreeNode {
  importHref: string;
  remarks?: string;
  /** Undefined when the import doesn't resolve to any workspace component-definition. */
  resolved?: CompDef;
  children: ImportTreeNode[];
  /** True when `resolved` is already an ancestor on this path — its own imports are not expanded
   * again, so a cyclic graph (which `wouldCreateCycle` should have prevented forming, but an
   * externally-imported OSCAL document might still contain) renders as a flagged leaf, not an
   * infinite tree. */
  cycle: boolean;
}

/** The read-only transitive import tree for the detail page (ADR-0014), cycle-guarded. */
export function buildImportTree(
  root: CompDef,
  workspace: CompDef[],
  ancestors: Set<string> = new Set([root.uuid]),
): ImportTreeNode[] {
  const imports = root.artifact.importComponentDefinitions ?? [];
  return imports.map((imp): ImportTreeNode => {
    const resolved = resolveImport(imp, root.artifact.backMatter, workspace);
    if (!resolved) {
      return { importHref: imp.href, remarks: imp.remarks, children: [], cycle: false };
    }
    if (ancestors.has(resolved.uuid)) {
      return { importHref: imp.href, remarks: imp.remarks, resolved, children: [], cycle: true };
    }
    return {
      importHref: imp.href,
      remarks: imp.remarks,
      resolved,
      children: buildImportTree(resolved, workspace, new Set([...ancestors, resolved.uuid])),
      cycle: false,
    };
  });
}
