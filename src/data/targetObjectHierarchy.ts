/**
 * Ancestor-chain matching between a catalog control's `target_object_categories` tag(s) and the
 * BSI target-object-category hierarchy (ADR-0026). Controls tag themselves with the category's
 * German title (not its uuid), on either their own `props` or nested inside a `part`'s `props`
 * (verified against the live BSI Kernel catalog — the tag usually lives on the `statement` part).
 *
 * Example from the BSI hierarchy: an asset mapped to "Webanwendungen" also pulls in controls
 * tagged "Webserver" or "Anwendungen" — its ancestors via `ChildOfUUID`.
 */
import type { Control, Part } from '@/models/control';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';

const TARGET_OBJECT_CATEGORIES_PROP = 'target_object_categories';

/** Index target-object-categories by uuid for ancestor-chain lookups. */
export function buildCategoryIndex(rows: TargetObjectCategory[]): Map<string, TargetObjectCategory> {
  return new Map(rows.map((r) => [r.uuid, r]));
}

/**
 * The category's own uuid followed by every ancestor's uuid, walking `parentUuid` to the root.
 * Guards against a malformed cycle by stopping once a uuid repeats.
 */
export function ancestorChain(categoryUuid: string, byUuid: Map<string, TargetObjectCategory>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = categoryUuid;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = byUuid.get(current)?.parentUuid;
  }
  return chain;
}

/** `ancestorChain`, resolved to the German titles controls actually tag themselves with. */
export function categoryTitlesInChain(categoryUuid: string, byUuid: Map<string, TargetObjectCategory>): string[] {
  return ancestorChain(categoryUuid, byUuid)
    .map((uuid) => byUuid.get(uuid)?.title)
    .filter((title): title is string => Boolean(title));
}

function partTargetCategories(parts: Part[] | undefined): string[] {
  const out: string[] = [];
  for (const part of parts ?? []) {
    for (const prop of part.props ?? []) {
      if (prop.name === TARGET_OBJECT_CATEGORIES_PROP) out.push(prop.value);
    }
    out.push(...partTargetCategories(part.parts));
  }
  return out;
}

/**
 * Every `target_object_categories` value tagged anywhere on a control: its own `props`, and
 * recursively through its `parts` (and their nested `parts`). Does not descend into nested
 * sub-controls (`control.controls`) — those are indexed as separate controls elsewhere.
 */
export function controlTargetCategories(control: Control): string[] {
  const ownProps = (control.props ?? [])
    .filter((p) => p.name === TARGET_OBJECT_CATEGORIES_PROP)
    .map((p) => p.value);
  return [...ownProps, ...partTargetCategories(control.parts)];
}

/** True when a control carries no `target_object_categories` tag at all — BSI-style ISMS scope. */
export function hasNoTargetObjectCategory(control: Control): boolean {
  return controlTargetCategories(control).length === 0;
}

/**
 * True when a control's tagged categories intersect a pre-resolved set of eligible titles (an
 * ancestor chain resolved once, e.g. via `categoryTitlesInChain`). Splitting this out from
 * `controlMatchesCategoryOrAncestor` lets a caller filtering many controls against the *same*
 * asset's category resolve the chain once instead of once per control.
 */
export function controlMatchesAnyTitle(control: Control, eligibleTitles: Set<string>): boolean {
  return controlTargetCategories(control).some((title) => eligibleTitles.has(title));
}

/**
 * True when a control's tagged category is the given category itself, or one of its ancestors
 * (per the BSI hierarchy) — the BSI-style per-asset SSP matching rule.
 */
export function controlMatchesCategoryOrAncestor(
  control: Control,
  categoryUuid: string,
  byUuid: Map<string, TargetObjectCategory>,
): boolean {
  return controlMatchesAnyTitle(control, new Set(categoryTitlesInChain(categoryUuid, byUuid)));
}
