/**
 * OSCAL catalog control model (the control/param/part subset TALOS displays).
 * Decision IDs: ADR-0003, ADR-0016.
 */
import type { Prop, Link, MarkupLine, MarkupMultiline } from './oscalBase';

export interface ParameterSelection {
  howMany?: 'one' | 'one-or-more';
  choice?: string[];
}

export interface Parameter {
  id: string;
  class?: string;
  props?: Prop[];
  links?: Link[];
  label?: MarkupLine;
  usage?: MarkupMultiline;
  values?: string[];
  select?: ParameterSelection;
  remarks?: MarkupMultiline;
}

export interface Part {
  id?: string;
  name: string;
  ns?: string;
  class?: string;
  title?: MarkupLine;
  props?: Prop[];
  prose?: MarkupMultiline;
  parts?: Part[];
  links?: Link[];
}

export interface Control {
  id: string;
  class?: string;
  title: MarkupLine;
  params?: Parameter[];
  props?: Prop[];
  links?: Link[];
  parts?: Part[];
  controls?: Control[];
}
