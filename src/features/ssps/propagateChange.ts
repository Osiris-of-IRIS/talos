/**
 * "Apply a change to other SSPs" (T-512, ADR-0037, MVP Feedback "apply to group / all
 * features"). A propagation target is always one of the *source* SSP's own scopes — its asset
 * type (ADR-0031, bootstrap-only) or one of the groups it belongs to (`sspGroupMembership.ts`) —
 * never an arbitrary unrelated scope (human supervisor decision, matching the ticket's literal
 * "the same asset type"/"the same group" wording). A group scope is descendant-inclusive: it also
 * reaches every nested subgroup (`descendantChain`).
 *
 * Matching a control+component pair across SSPs keys on `controlId` plus the by-component's
 * originating `source-component-definition-uuid`/`source-component-uuid` provenance (ADR-0023) —
 * never the per-SSP `componentUuid`, which is freshly minted on every import and never equal
 * across two SSPs even for "the same" shared component. A target missing that control or that
 * component is skipped, not backfilled (human supervisor decision) — propagation only aligns
 * *values* on structure that already exists, it never creates structure as a side effect.
 */
import { ArtifactRepository } from '@/data/artifactRepository';
import { descendantChain } from '@/data/sspGroupHierarchy';
import { getSspGroupIds } from '@/data/sspGroupMembership';
import { getSspAssetType } from './sspAssetType';
import { getComponentProvenance, importComponentFromDefinition, setImplementationStatus } from './componentImport';
import type { ImplementationStatus } from './componentImport';
import type { StoredArtifact } from '@/data/db';
import type { SspGroup } from '@/models/sspGroup';
import type { DefinedComponent } from '@/models/componentDefinition';
import type { SystemComponent, SystemSecurityPlan } from '@/models/ssp';

const repo = () => ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');

/** Mirrors componentImport.ts's private PROP_IMPLEMENTATION_STATUS — only needed here to *clear*
 * the prop when the source by-component has no status set; `setImplementationStatus` (exported)
 * covers the set case. */
const PROP_IMPLEMENTATION_STATUS = 'implementation-status';

export interface PropagationScope {
  kind: 'assetType' | 'group';
  /** asset-type string value, or group uuid. */
  value: string;
  label: string;
}

export interface PropagationResult {
  updated: string[];
  skipped: { title: string; reason: string }[];
}

/** Every scope the given SSP can propagate to right now. */
export function propagationScopesFor(ssp: SystemSecurityPlan, allGroups: SspGroup[]): PropagationScope[] {
  const scopes: PropagationScope[] = [];
  const assetType = getSspAssetType(ssp);
  if (assetType) scopes.push({ kind: 'assetType', value: assetType, label: assetType });
  const byUuid = new Map(allGroups.map((g) => [g.uuid, g]));
  for (const groupUuid of getSspGroupIds(ssp)) {
    const group = byUuid.get(groupUuid);
    if (group) scopes.push({ kind: 'group', value: group.uuid, label: group.title });
  }
  return scopes;
}

/** Every workspace SSP a scope reaches, excluding the source SSP itself. */
export function resolveScopeTargets(
  scope: PropagationScope,
  sourceUuid: string,
  allSsps: StoredArtifact<SystemSecurityPlan>[],
  allGroups: SspGroup[],
): StoredArtifact<SystemSecurityPlan>[] {
  const others = allSsps.filter((r) => r.uuid !== sourceUuid);
  if (scope.kind === 'assetType') {
    return others.filter((r) => getSspAssetType(r.artifact) === scope.value);
  }
  const reachableGroupUuids = new Set(descendantChain(scope.value, allGroups));
  return others.filter((r) => getSspGroupIds(r.artifact).some((g) => reachableGroupUuids.has(g)));
}

/** True when a SystemComponent's provenance names the same component-definition component as
 * `sourceComponentDefUuid`/`sourceComponentUuid` — the cross-SSP "same shared component" match. */
function sameOrigin(sc: SystemComponent, sourceComponentDefUuid: string, sourceComponentUuid: string): boolean {
  const prov = getComponentProvenance(sc);
  return !!prov && prov.componentDefinitionUuid === sourceComponentDefUuid && prov.componentUuid === sourceComponentUuid;
}

/**
 * Propagate one by-component's `implementation-status` + `description` to every target SSP that
 * already has a matching control-id wired to the same shared component. `sourceComponent` is the
 * *source* SSP's own SystemComponent (used only for its provenance props — its uuid is never
 * compared directly, since a per-SSP componentUuid never matches across two documents).
 */
export async function propagateByComponentField(
  sourceComponent: SystemComponent,
  controlId: string,
  status: string | undefined,
  description: string,
  targets: StoredArtifact<SystemSecurityPlan>[],
): Promise<PropagationResult> {
  const result: PropagationResult = { updated: [], skipped: [] };
  const prov = getComponentProvenance(sourceComponent);
  if (!prov) {
    for (const t of targets) {
      result.skipped.push({ title: t.artifact.metadata.title, reason: 'source component was not imported from a component-definition' });
    }
    return result;
  }

  for (const target of targets) {
    const title = target.artifact.metadata.title;
    const ir = target.artifact.controlImplementation.implementedRequirements.find((r) => r.controlId === controlId);
    if (!ir) {
      result.skipped.push({ title, reason: `control "${controlId}" not present` });
      continue;
    }
    const matchingComponentUuids = new Set(
      target.artifact.systemImplementation.components
        .filter((c) => sameOrigin(c, prov.componentDefinitionUuid, prov.componentUuid))
        .map((c) => c.uuid),
    );
    const bc = (ir.byComponents ?? []).find((b) => matchingComponentUuids.has(b.componentUuid));
    if (!bc) {
      result.skipped.push({ title, reason: `component not wired to control "${controlId}"` });
      continue;
    }

    const next = structuredClone(target.artifact);
    const nextIr = next.controlImplementation.implementedRequirements.find((r) => r.controlId === controlId)!;
    const nextBc = nextIr.byComponents!.find((b) => matchingComponentUuids.has(b.componentUuid))!;
    nextBc.description = description;
    nextBc.props = status
      ? setImplementationStatus(nextBc, status as ImplementationStatus).props
      : (nextBc.props ?? []).filter((p) => p.name !== PROP_IMPLEMENTATION_STATUS);
    next.metadata.lastModified = new Date().toISOString();
    await repo().update(target.uuid, next);
    result.updated.push(title);
  }
  return result;
}

/**
 * Propagate "import this component" to every target SSP that doesn't already have it (matched by
 * shared origin, not by re-checking title/type/description — a target may have since edited its
 * own copy). Mirrors `SystemImplementationEditor`'s single-SSP import button exactly — adds the
 * SystemComponent only, never auto-creates by-components (same as a manual single-SSP import).
 */
export async function propagateComponentImport(
  componentDefinitionUuid: string,
  component: DefinedComponent,
  targets: StoredArtifact<SystemSecurityPlan>[],
): Promise<PropagationResult> {
  const result: PropagationResult = { updated: [], skipped: [] };
  for (const target of targets) {
    const title = target.artifact.metadata.title;
    const alreadyHas = target.artifact.systemImplementation.components.some((c) =>
      sameOrigin(c, componentDefinitionUuid, component.uuid),
    );
    if (alreadyHas) {
      result.skipped.push({ title, reason: 'already has this component' });
      continue;
    }
    const next = structuredClone(target.artifact);
    next.systemImplementation.components.push(importComponentFromDefinition(componentDefinitionUuid, component));
    next.metadata.lastModified = new Date().toISOString();
    await repo().update(target.uuid, next);
    result.updated.push(title);
  }
  return result;
}
