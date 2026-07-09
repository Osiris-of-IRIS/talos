/**
 * SSP system-implementation components are imported (copied) from workspace component-definitions
 * rather than authored from scratch, and by-components carry an OSCAL `implementation-status`
 * prop. Decision IDs: ADR-0003, ADR-0011 (Δ staleness symbol), ADR-0023.
 *
 * Provenance + a content-hash "snapshot" are stored as OSCAL `props[]` on the imported
 * SystemComponent (no model-shape changes, so round-trip fidelity to real OSCAL tooling is
 * preserved). `componentStaleness` recomputes the hash of the *current* source component and
 * compares it against the stored snapshot to detect drift since import.
 */
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition, DefinedComponent } from '@/models/componentDefinition';
import type { SystemComponent, ByComponent } from '@/models/ssp';

const PROP_CD_UUID = 'source-component-definition-uuid';
const PROP_COMPONENT_UUID = 'source-component-uuid';
const PROP_SNAPSHOT = 'source-snapshot';
const PROP_IMPLEMENTATION_STATUS = 'implementation-status';

export type ComponentStaleness = 'fresh' | 'stale' | 'missing' | 'not-imported';

export const IMPLEMENTATION_STATUS_VALUES = [
  'planned',
  'implemented',
  'partial',
  'alternative',
  'not-applicable',
] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUS_VALUES)[number];

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/** Deterministic content hash used to detect drift between an import and its live source. */
export function hashComponentContent(title: string, type: string, description: string): string {
  return fnv1a(JSON.stringify({ title, type, description }));
}

function propValue(props: { name: string; value: string }[] | undefined, name: string): string | undefined {
  return props?.find((p) => p.name === name)?.value;
}

/** Import (copy) a component-definition's component into the SSP as a new SystemComponent. */
export function importComponentFromDefinition(
  componentDefinitionUuid: string,
  component: DefinedComponent,
): SystemComponent {
  return {
    uuid: globalThis.crypto.randomUUID(),
    type: component.type,
    title: component.title,
    description: component.description,
    status: { state: 'operational' },
    props: [
      { name: PROP_CD_UUID, value: componentDefinitionUuid },
      { name: PROP_COMPONENT_UUID, value: component.uuid },
      {
        name: PROP_SNAPSHOT,
        value: hashComponentContent(component.title, component.type, component.description),
      },
    ],
  };
}

export interface ComponentProvenance {
  componentDefinitionUuid: string;
  componentUuid: string;
  snapshot: string;
}

/** Read back the provenance props written by `importComponentFromDefinition`, if present. */
export function getComponentProvenance(sc: SystemComponent): ComponentProvenance | undefined {
  const componentDefinitionUuid = propValue(sc.props, PROP_CD_UUID);
  const componentUuid = propValue(sc.props, PROP_COMPONENT_UUID);
  const snapshot = propValue(sc.props, PROP_SNAPSHOT);
  if (!componentDefinitionUuid || !componentUuid || !snapshot) return undefined;
  return { componentDefinitionUuid, componentUuid, snapshot };
}

/**
 * Compare an imported SystemComponent's stored snapshot against its live source in the workspace.
 * `not-imported`: no provenance props (never imported, e.g. hand-authored or from an uploaded SSP).
 * `missing`: the source component-definition, or the specific component within it, is gone.
 * `stale` / `fresh`: the source component's content hash differs from / matches the snapshot.
 */
export function componentStaleness(
  sc: SystemComponent,
  workspaceComponentDefinitions: StoredArtifact<ComponentDefinition>[],
): ComponentStaleness {
  const prov = getComponentProvenance(sc);
  if (!prov) return 'not-imported';
  const sourceCd = workspaceComponentDefinitions.find((r) => r.uuid === prov.componentDefinitionUuid);
  const sourceComponent = sourceCd?.artifact.components?.find((c) => c.uuid === prov.componentUuid);
  if (!sourceComponent) return 'missing';
  const currentHash = hashComponentContent(
    sourceComponent.title,
    sourceComponent.type,
    sourceComponent.description,
  );
  return currentHash === prov.snapshot ? 'fresh' : 'stale';
}

/** Re-copy content from the (changed) source component and refresh the snapshot. Keeps uuid + status. */
export function refreshComponentFromSource(sc: SystemComponent, source: DefinedComponent): SystemComponent {
  const prov = getComponentProvenance(sc);
  return {
    ...sc,
    title: source.title,
    type: source.type,
    description: source.description,
    props: [
      ...(sc.props ?? []).filter(
        (p) => ![PROP_CD_UUID, PROP_COMPONENT_UUID, PROP_SNAPSHOT].includes(p.name),
      ),
      { name: PROP_CD_UUID, value: prov?.componentDefinitionUuid ?? '' },
      { name: PROP_COMPONENT_UUID, value: source.uuid },
      { name: PROP_SNAPSHOT, value: hashComponentContent(source.title, source.type, source.description) },
    ],
  };
}

/**
 * Find the description of the source component's own implemented-requirement for `controlId`
 * (UI feedback item 3, ADR-0028) — used to prefill a by-component's description when the user
 * picks a component for a requirement, so the SSP doesn't start from a blank field when the
 * source component-definition already documents how it implements the same control. Only looks
 * within the *same* source component (not the whole component-definition, nor other components in
 * it); if that control-id appears under more than one of the component's own control-implementations,
 * the first match (document order) wins.
 */
export function findMatchingRequirementDescription(
  sc: SystemComponent,
  controlId: string,
  workspaceComponentDefinitions: StoredArtifact<ComponentDefinition>[],
): string | undefined {
  if (!controlId) return undefined;
  const prov = getComponentProvenance(sc);
  if (!prov) return undefined;
  const sourceCd = workspaceComponentDefinitions.find((r) => r.uuid === prov.componentDefinitionUuid);
  const sourceComponent = sourceCd?.artifact.components?.find((c) => c.uuid === prov.componentUuid);
  if (!sourceComponent) return undefined;
  for (const ci of sourceComponent.controlImplementations ?? []) {
    const match = ci.implementedRequirements.find((ir) => ir.controlId === controlId);
    if (match?.description) return match.description;
  }
  return undefined;
}

/** The by-component's `implementation-status` prop (T-113), one of IMPLEMENTATION_STATUS_VALUES. */
export function getImplementationStatus(bc: ByComponent): string | undefined {
  return propValue(bc.props, PROP_IMPLEMENTATION_STATUS);
}

export function setImplementationStatus(bc: ByComponent, status: ImplementationStatus): ByComponent {
  return {
    ...bc,
    props: [...(bc.props ?? []).filter((p) => p.name !== PROP_IMPLEMENTATION_STATUS), { name: PROP_IMPLEMENTATION_STATUS, value: status }],
  };
}
