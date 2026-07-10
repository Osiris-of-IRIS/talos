/**
 * Target-object-category tree picker for the Profile Creation Assistant (ADR-0032 §4): nested
 * list colored by root-category subtree, click-to-select with ancestor-chain highlighting, an
 * optional "product description only" filter, and a live matched-control counter.
 *
 * Selection & inclusion semantics (read literally from the MVP ticket): `selectedUuids` is the
 * explicit click set; every selection's ancestor chain (`ancestorChain`) is rendered with the
 * lighter "included via descendant" border AND counts toward control inclusion — recomputed fresh
 * from `selectedUuids` on every render, so deselecting a node correctly un-includes its ancestors
 * unless a sibling selection keeps them alive (no separate bookkeeping needed).
 */
import { useEffect, useMemo, useRef } from 'react';
import { ancestorChain, categoryTitlesInChain, controlMatchesAnyTitle } from '@/data/targetObjectHierarchy';
import { uniqueCatalogControlEntries } from '@/data/catalogResolution';
import { controlHasTag } from '@/models/controlTags';
import { colorForCategory, ROOT_CATEGORY_COLORS } from './targetObjectColors';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';
import type { Control } from '@/models/control';

// Verified against the live BSI Grundschutz++ Anwenderkatalog (fetched, not assumed): 144
// controls carry this tag, "Produktspezifikation" doesn't occur at all — a supervisor correction
// to ADR-0032 §4's original (incorrect) tag name, 2026-07-10.
const PRODUCT_SPEC_TAG = 'Produktbeschreibung';

interface Props {
  categoryRows: TargetObjectCategory[];
  controlsById: Map<string, Control>;
  selectedUuids: Set<string>;
  onChange: (next: Set<string>) => void;
  productSpecOnly: boolean;
  onProductSpecOnlyChange: (next: boolean) => void;
}

interface TreeNode {
  row: TargetObjectCategory;
  children: TreeNode[];
}

function buildTree(rows: TargetObjectCategory[]): TreeNode[] {
  const childrenOf = new Map<string, TargetObjectCategory[]>();
  const roots: TargetObjectCategory[] = [];
  for (const row of rows) {
    if (row.parentUuid) {
      const list = childrenOf.get(row.parentUuid) ?? [];
      list.push(row);
      childrenOf.set(row.parentUuid, list);
    } else {
      roots.push(row);
    }
  }
  function toNode(row: TargetObjectCategory): TreeNode {
    return { row, children: (childrenOf.get(row.uuid) ?? []).map(toNode) };
  }
  return roots.map(toNode);
}

/** Every control (including nested sub-controls) matching `eligibleTitles`, optionally narrowed
 * to controls also tagged "Produktbeschreibung" — the same set the picker will write as
 * `includeControls[].withIds` when the assistant creates the profile. */
export function matchedControlIds(
  controlsById: Map<string, Control>,
  eligibleTitles: Set<string>,
  productSpecOnly: boolean,
): string[] {
  // Each control exactly once (ADR-0021 dual-keying, see uniqueCatalogControlEntries) — without
  // this, a matched control with an alt-identifier was written twice into includeControls[].withIds
  // (once under its literal id, once under its `_{uuid}` form), duplicating it in the profile.
  return uniqueCatalogControlEntries(controlsById)
    .filter(([, control]) => controlMatchesAnyTitle(control, eligibleTitles))
    .filter(([, control]) => !productSpecOnly || controlHasTag(control, PRODUCT_SPEC_TAG))
    .map(([id]) => id);
}

export function TargetObjectPicker({
  categoryRows,
  controlsById,
  selectedUuids,
  onChange,
  productSpecOnly,
  onProductSpecOnlyChange,
}: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const byUuid = useMemo(
    () => new Map(categoryRows.map((r) => [r.uuid, r])),
    [categoryRows],
  );
  const tree = useMemo(() => buildTree(categoryRows), [categoryRows]);

  // colorForCategory silently falls back to gray for a root category not in
  // ROOT_CATEGORY_COLORS (e.g. BSI renames a root in the live-fetched hierarchy, ADR-0032 §4) —
  // surface that via the same toast mechanism the hierarchy loader itself uses for staleness,
  // rather than letting a whole subtree go quietly gray with no indication anything's off. Reads
  // t/showToast from a ref (not the effect's own deps) so this fires once per hierarchy load —
  // `t` isn't memoized by I18nProvider, so listing it directly would re-fire on every render.
  const latestRef = useRef({ t, showToast });
  latestRef.current = { t, showToast };
  useEffect(() => {
    const unmappedRoots = tree.filter((node) => !ROOT_CATEGORY_COLORS[node.row.title]).map((node) => node.row.title);
    if (unmappedRoots.length > 0) {
      const { t, showToast } = latestRef.current;
      showToast(t('target_object_unmapped_root_warning', { titles: unmappedRoots.join(', ') }), 'warning');
    }
  }, [tree]);

  const eligibleUuids = useMemo(() => {
    const set = new Set<string>();
    for (const uuid of selectedUuids) {
      for (const ancestorUuid of ancestorChain(uuid, byUuid)) set.add(ancestorUuid);
    }
    return set;
  }, [selectedUuids, byUuid]);

  const eligibleTitles = useMemo(() => {
    const set = new Set<string>();
    for (const uuid of selectedUuids) {
      for (const title of categoryTitlesInChain(uuid, byUuid)) set.add(title);
    }
    return set;
  }, [selectedUuids, byUuid]);

  const matchCount = matchedControlIds(controlsById, eligibleTitles, productSpecOnly).length;

  function toggle(uuid: string) {
    const next = new Set(selectedUuids);
    if (next.has(uuid)) next.delete(uuid);
    else next.add(uuid);
    onChange(next);
  }

  function renderNode(node: TreeNode): React.ReactNode {
    const { row } = node;
    const isSelected = selectedUuids.has(row.uuid);
    const isIncluded = !isSelected && eligibleUuids.has(row.uuid);
    const color = colorForCategory(row.uuid, byUuid);
    return (
      <li key={row.uuid}>
        <button
          type="button"
          data-testid="target-object-node"
          data-state={isSelected ? 'selected' : isIncluded ? 'included' : 'none'}
          title={row.definition || undefined}
          aria-pressed={isSelected}
          onClick={() => toggle(row.uuid)}
          style={{
            backgroundColor: `${color}33`,
            border: isSelected ? `3px solid ${color}` : isIncluded ? `1px solid ${color}` : '1px solid transparent',
          }}
        >
          {row.title}
        </button>
        {node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    );
  }

  return (
    <div data-testid="target-object-picker">
      <ul data-testid="target-object-tree">{tree.map(renderNode)}</ul>
      <label>
        <input
          type="checkbox"
          checked={productSpecOnly}
          onChange={(e) => onProductSpecOnlyChange(e.target.checked)}
          data-testid="target-object-product-spec-only"
        />{' '}
        {t('target_object_product_spec_only')}
      </label>
      <p data-testid="target-object-match-count">{t('target_object_match_count', { count: matchCount })}</p>
    </div>
  );
}
