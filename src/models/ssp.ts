/**
 * OSCAL System Security Plan (SSP) model — extends the shared OscalArtifact base with the
 * SSP body. Priority feature (IMPL-002). Decision IDs: ADR-0003.
 */
import type { OscalArtifact, Prop, Link, MarkupLine, MarkupMultiline, ResponsibleParty } from './oscalBase';

export interface ImportProfile {
  href: string;
  remarks?: MarkupMultiline;
}

export interface ResponsibleRole {
  roleId: string;
  partyUuids?: string[];
  props?: Prop[];
  links?: Link[];
  remarks?: MarkupMultiline;
}

export interface SystemId {
  identifierType?: string;
  id: string;
}

export interface Information {
  uuid?: string;
  informationTypes: {
    uuid?: string;
    title: MarkupLine;
    description: MarkupMultiline;
    props?: Prop[];
    links?: Link[];
  }[];
}

export interface SystemCharacteristics {
  systemIds: SystemId[];
  systemName: string;
  systemNameShort?: string;
  description: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  dateAuthorized?: string;
  securitySensitivityLevel?: string;
  systemInformation: Information;
  securityImpactLevel?: {
    securityObjectiveConfidentiality?: string;
    securityObjectiveIntegrity?: string;
    securityObjectiveAvailability?: string;
  };
  status: { state: string; remarks?: MarkupMultiline };
  authorizationBoundary: { description: MarkupMultiline; props?: Prop[]; links?: Link[] };
  remarks?: MarkupMultiline;
}

export interface SystemComponent {
  uuid: string;
  type: string;
  title: MarkupLine;
  description: MarkupMultiline;
  purpose?: MarkupLine;
  props?: Prop[];
  links?: Link[];
  status: { state: string; remarks?: MarkupMultiline };
  responsibleRoles?: ResponsibleRole[];
  protocols?: unknown[];
  remarks?: MarkupMultiline;
}

export interface SystemUser {
  uuid: string;
  title?: MarkupLine;
  shortName?: string;
  description?: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  roleIds?: string[];
  authorizedPrivileges?: {
    title: MarkupLine;
    description?: MarkupMultiline;
    functionsPerformed: string[];
  }[];
  remarks?: MarkupMultiline;
}

/** A component implemented within a given inventory item (ADR-0031). Generation never populates
 * this — it would need an asset↔component mapping TALOS doesn't have (ADR-0026 scopes
 * system-implementation components as a manual, post-bootstrap step) — but the type is complete
 * per the OSCAL v1.2.2 `inventory-item/implemented-components` assembly. */
export interface ImplementedComponentRef {
  componentUuid: string;
  props?: Prop[];
  links?: Link[];
  responsibleParties?: ResponsibleParty[];
  remarks?: MarkupMultiline;
}

/** A single managed inventory item (ADR-0031), mirroring OSCAL v1.2.2's `inventory-item`
 * assembly. `uuid` must be a real RFC4122 UUID (OSCAL's own cross-reference id) — an asset's
 * human tracking code becomes a `props[name="asset-id"]` entry instead, never this uuid. */
export interface InventoryItem {
  uuid: string;
  description: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  responsibleParties?: ResponsibleParty[];
  implementedComponents?: ImplementedComponentRef[];
  remarks?: MarkupMultiline;
}

export interface SystemImplementation {
  props?: Prop[];
  links?: Link[];
  users: SystemUser[];
  components: SystemComponent[];
  inventoryItems?: InventoryItem[];
  remarks?: MarkupMultiline;
}

export interface ByComponent {
  componentUuid: string;
  uuid: string;
  description: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  setParameters?: { paramId: string; values?: string[] }[];
  responsibleRoles?: ResponsibleRole[];
  remarks?: MarkupMultiline;
}

export interface SspStatement {
  statementId: string;
  uuid: string;
  description?: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  responsibleRoles?: ResponsibleRole[];
  byComponents?: ByComponent[];
  remarks?: MarkupMultiline;
}

export interface SspImplementedRequirement {
  uuid: string;
  controlId: string;
  props?: Prop[];
  links?: Link[];
  setParameters?: { paramId: string; values?: string[] }[];
  responsibleRoles?: ResponsibleRole[];
  statements?: SspStatement[];
  byComponents?: ByComponent[];
  remarks?: MarkupMultiline;
}

export interface SspControlImplementation {
  description: MarkupMultiline;
  setParameters?: { paramId: string; values?: string[] }[];
  implementedRequirements: SspImplementedRequirement[];
}

export interface SystemSecurityPlan extends OscalArtifact {
  importProfile: ImportProfile;
  systemCharacteristics: SystemCharacteristics;
  systemImplementation: SystemImplementation;
  controlImplementation: SspControlImplementation;
}
