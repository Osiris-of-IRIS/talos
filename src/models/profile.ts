/**
 * OSCAL profile model — extends the shared OscalArtifact base with the profile body
 * (control tailoring: import/select/exclude, merge strategy, parameter/control modification).
 * Decision IDs: ADR-0003, ADR-0032.
 *
 * Typed for lossless round-trip of the full NIST OSCAL v1.2.2 shape; fields the editor
 * doesn't expose yet (`matching`, `merge.flat`/`merge.custom`, `modify.alters`) stay typed as
 * `unknown` passthrough rather than a fully-modeled-but-unused shape — the envelope codec
 * (envelope.ts) is generic key-casing only, so an `unknown` field round-trips exactly like a
 * fully-typed one (ADR-0032 §1).
 */
import type { OscalArtifact, Prop, Link, MarkupLine, MarkupMultiline } from './oscalBase';

export interface SelectControlById {
  withChildControls?: 'yes' | 'no';
  withIds?: string[];
  /** Pattern-based selection — typed as passthrough only, not editor-supported (ADR-0032 §1). */
  matching?: unknown[];
}

export interface ProfileImport {
  href: string;
  /** Presence (an empty object) means "include every control from this source." */
  includeAll?: Record<string, never>;
  includeControls?: SelectControlById[];
  excludeControls?: SelectControlById[];
}

export type InclusionSpec = { mode: 'all' } | { mode: 'byId'; ids: string[] };

/**
 * The only place allowed to set `includeAll`/`includeControls` on an import — `includeAll`'s
 * presence and `includeControls`'s presence are OSCAL-mutually-exclusive (ADR-0032 §1), and
 * nothing in the type above enforces that; every mutation site (the editor's mode toggle/id
 * pickers, the Profile Creation Assistant's create step) funnels through this so a future call
 * site can't produce an import with both set, or neither.
 */
export function applyInclusion(imp: ProfileImport, spec: InclusionSpec): void {
  if (spec.mode === 'all') {
    imp.includeAll = {};
    delete imp.includeControls;
  } else {
    delete imp.includeAll;
    imp.includeControls = [{ withIds: spec.ids }];
  }
}

/** The only place allowed to set/clear `excludeControls` — `undefined` clears it (the "exclude
 * specific controls" checkbox off), an array (possibly empty) sets it. Independent of
 * `includeAll`/`includeControls` (OSCAL allows excluding from either inclusion mode). */
export function applyExclusion(imp: ProfileImport, ids: string[] | undefined): void {
  if (ids === undefined) delete imp.excludeControls;
  else imp.excludeControls = [{ withIds: ids }];
}

export interface Merge {
  combine?: { method?: 'use-first' | 'merge' | 'keep' };
  /** Presence (an empty object) selects the flat strategy — not editor-supported (ADR-0032 §5). */
  flat?: Record<string, never>;
  asIs?: boolean;
  /** Custom group/ordering strategy — passthrough only, not editor-supported (ADR-0032 §5). */
  custom?: unknown;
}

export interface ProfileParameterSelection {
  howMany?: 'one' | 'one-or-more';
  choice?: string[];
}

export interface ProfileSetParameter {
  paramId: string;
  class?: string;
  dependsOn?: string;
  props?: Prop[];
  links?: Link[];
  label?: MarkupLine;
  usage?: MarkupMultiline;
  values?: string[];
  select?: ProfileParameterSelection;
  remarks?: MarkupMultiline;
}

export interface Modify {
  setParameters?: ProfileSetParameter[];
  /** Control-element add/remove surgery — passthrough only, not editor-supported (ADR-0032 §1). */
  alters?: unknown[];
}

/** The merge block every profile TALOS authors gets (ADR-0032 §5) — v1 always merges as-is. */
export const AS_IS_MERGE: Merge = { asIs: true };

export interface Profile extends OscalArtifact {
  imports: ProfileImport[];
  merge?: Merge;
  modify?: Modify;
}
