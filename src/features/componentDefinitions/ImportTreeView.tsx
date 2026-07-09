// Read-only, transitive import-tree display (ADR-0014) — recurses into each resolved import's own
// imports; a cycle-flagged node renders but is not expanded further (its target is already an
// ancestor on this path).
import { Link } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import type { ImportTreeNode } from '@/data/componentImportResolution';

export function ImportTreeView({ nodes }: { nodes: ImportTreeNode[] }) {
  const { t } = useI18n();
  if (nodes.length === 0) return null;
  return (
    <ul data-testid="cdef-import-tree">
      {nodes.map((node, i) => (
        <li key={`${node.importHref}-${i}`} data-testid="cdef-import-node">
          {node.resolved ? (
            <Link
              to={`/component-definitions/${node.resolved.uuid}`}
              className="imported-badge"
              data-testid="cdef-import-node-link"
            >
              📦 {node.resolved.artifact.metadata.title}
            </Link>
          ) : (
            <span data-testid="cdef-import-node-unresolved" title={node.importHref}>
              ⚠️ {t('cdef_imports_unresolved')}
            </span>
          )}
          {node.cycle && <small data-testid="cdef-import-cycle"> ↺ {t('cdef_imports_cycle_detected')}</small>}
          {node.remarks && <small> — {node.remarks}</small>}
          {node.children.length > 0 && <ImportTreeView nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}
