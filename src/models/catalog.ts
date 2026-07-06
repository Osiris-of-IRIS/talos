/**
 * OSCAL catalog model (read-only source; ADR-0008). Extends the shared base with groups/controls.
 * Decision IDs: ADR-0003, ADR-0008, ADR-0016.
 */
import type { OscalArtifact, Prop, Link, MarkupLine } from './oscalBase';
import type { Control, Parameter, Part } from './control';

export interface CatalogGroup {
  id?: string;
  class?: string;
  title: MarkupLine;
  params?: Parameter[];
  props?: Prop[];
  links?: Link[];
  parts?: Part[];
  groups?: CatalogGroup[];
  controls?: Control[];
}

export interface Catalog extends OscalArtifact {
  params?: Parameter[];
  controls?: Control[];
  groups?: CatalogGroup[];
}
