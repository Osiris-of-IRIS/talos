/**
 * OSCAL component-definition model — extends the shared OscalArtifact base with the
 * component-definition body. Priority feature (IMPL-001). Decision IDs: ADR-0003, ADR-0014.
 */
import type { OscalArtifact, Prop, Link, MarkupLine, MarkupMultiline } from './oscalBase';

export interface ImportComponentDefinition {
  href: string;
  remarks?: MarkupMultiline;
}

export interface SetParameter {
  paramId: string;
  values?: string[];
  remarks?: MarkupMultiline;
}

export interface Statement {
  statementId: string;
  uuid: string;
  description?: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  responsibleRoles?: { roleId: string; partyUuids?: string[] }[];
  remarks?: MarkupMultiline;
}

export interface ImplementedRequirement {
  uuid: string;
  controlId: string;
  description?: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  setParameters?: SetParameter[];
  responsibleRoles?: { roleId: string; partyUuids?: string[] }[];
  statements?: Statement[];
  remarks?: MarkupMultiline;
}

export interface ControlImplementation {
  uuid: string;
  source: string;
  description: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  setParameters?: SetParameter[];
  implementedRequirements: ImplementedRequirement[];
}

export interface DefinedComponent {
  uuid: string;
  type: string;
  title: MarkupLine;
  description: MarkupMultiline;
  purpose?: MarkupLine;
  props?: Prop[];
  links?: Link[];
  responsibleRoles?: { roleId: string; partyUuids?: string[] }[];
  protocols?: unknown[];
  controlImplementations?: ControlImplementation[];
  remarks?: MarkupMultiline;
}

export interface Capability {
  uuid: string;
  name: string;
  description: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  incorporatesComponents?: { componentUuid: string; description: MarkupMultiline }[];
  controlImplementations?: ControlImplementation[];
  remarks?: MarkupMultiline;
}

export interface ComponentDefinition extends OscalArtifact {
  importComponentDefinitions?: ImportComponentDefinition[];
  components?: DefinedComponent[];
  capabilities?: Capability[];
}
