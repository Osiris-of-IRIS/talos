/**
 * Shared OSCAL artifact data model — the reusable envelope common to every OSCAL
 * document (metadata + back-matter), extended per type. Decision IDs: ADR-0003, ADR-0007.
 *
 * Field names use camelCase in the app model; the JSON wire form is kebab-case and is
 * converted only in the envelope codec (see envelope.ts). Aligned to NIST OSCAL v1.2.2.
 */

/** OSCAL markup-line: inline markdown subset. Rendered via ADR-0009. */
export type MarkupLine = string;
/** OSCAL markup-multiline: block + inline markdown. Rendered via ADR-0009. */
export type MarkupMultiline = string;

export interface Prop {
  name: string;
  value: string;
  uuid?: string;
  ns?: string;
  class?: string;
  group?: string;
  remarks?: MarkupMultiline;
}

export interface Link {
  href: string;
  rel?: string;
  mediaType?: string;
  resourceFragment?: string;
  text?: MarkupLine;
}

export interface DocumentId {
  /** Absent scheme means the identifier is a bare UUID (OSCAL convention). */
  scheme?: string;
  identifier: string;
}

export interface Role {
  id: string;
  title: MarkupLine;
  shortName?: string;
  description?: MarkupMultiline;
  props?: Prop[];
  links?: Link[];
  remarks?: MarkupMultiline;
}

export interface Address {
  type?: string;
  addrLines?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Party {
  uuid: string;
  type: 'person' | 'organization';
  name?: string;
  shortName?: string;
  externalIds?: { scheme: string; id: string }[];
  props?: Prop[];
  links?: Link[];
  emailAddresses?: string[];
  telephoneNumbers?: { type?: string; number: string }[];
  addresses?: Address[];
  memberOfOrganizations?: string[];
  remarks?: MarkupMultiline;
}

export interface ResponsibleParty {
  roleId: string;
  partyUuids: string[];
  props?: Prop[];
  links?: Link[];
  remarks?: MarkupMultiline;
}

export interface Revision {
  title?: MarkupLine;
  published?: string;
  lastModified?: string;
  version?: string;
  oscalVersion?: string;
  props?: Prop[];
  links?: Link[];
  remarks?: MarkupMultiline;
}

export interface Metadata {
  title: MarkupLine;
  published?: string;
  lastModified?: string;
  version: string;
  oscalVersion: string;
  revisions?: Revision[];
  documentIds?: DocumentId[];
  props?: Prop[];
  links?: Link[];
  roles?: Role[];
  parties?: Party[];
  responsibleParties?: ResponsibleParty[];
  remarks?: MarkupMultiline;
}

export interface Rlink {
  href: string;
  mediaType?: string;
  hashes?: { algorithm: string; value: string }[];
}

export interface Base64 {
  filename?: string;
  mediaType?: string;
  value: string;
}

export interface Citation {
  text: MarkupLine;
  props?: Prop[];
  links?: Link[];
}

export interface Resource {
  uuid: string;
  title?: MarkupLine;
  description?: MarkupMultiline;
  props?: Prop[];
  documentIds?: DocumentId[];
  citation?: Citation;
  rlinks?: Rlink[];
  base64?: Base64;
  remarks?: MarkupMultiline;
}

export interface BackMatter {
  resources?: Resource[];
}

/** The reusable envelope every OSCAL top-level document shares (ADR-0003). */
export interface OscalArtifact {
  uuid: string;
  metadata: Metadata;
  backMatter?: BackMatter;
}

/** OSCAL top-level document types and their JSON wrapper keys (kebab-case). */
export const OSCAL_WRAPPER_KEYS = {
  catalog: 'catalog',
  profile: 'profile',
  componentDefinition: 'component-definition',
  systemSecurityPlan: 'system-security-plan',
  assessmentPlan: 'assessment-plan',
  assessmentResults: 'assessment-results',
  planOfActionAndMilestones: 'plan-of-action-and-milestones',
} as const;

export type OscalArtifactType = keyof typeof OSCAL_WRAPPER_KEYS;

/** The single version every artifact authored or exported by TALOS declares (ADR-0007). */
export const OSCAL_AUTHORING_VERSION = '1.2.2';

/**
 * Apply ADR-0007's import policy to a document's `metadata.oscal-version`:
 *  - `1.2.2` (the authoring version) → accepted, no warning (returns `undefined`).
 *  - any other `1.x` → accepted with a non-blocking warning (export normalizes to 1.2.2).
 *  - missing/empty → accepted with a warning (assume the authoring version).
 *  - non-1.x (2.x, 0.x) → **throws** (TALOS imports OSCAL 1.x only).
 *  - unparseable → **throws**.
 * Never hard-fails for a version *within* 1.x, per ADR-0007.
 */
export function checkImportOscalVersion(version: unknown): string | undefined {
  if (version === undefined || version === null || version === '') {
    return `Document has no metadata.oscal-version; treating it as ${OSCAL_AUTHORING_VERSION}. Export will write ${OSCAL_AUTHORING_VERSION}.`;
  }
  if (typeof version !== 'string' || !/^\d+\.\d+/.test(version)) {
    throw new Error(`Unrecognized OSCAL version "${String(version)}". TALOS imports OSCAL 1.x only.`);
  }
  const major = version.split('.')[0];
  if (major !== '1') {
    throw new Error(
      `Unsupported OSCAL version "${version}". TALOS imports OSCAL 1.x only (authoring/export is ${OSCAL_AUTHORING_VERSION}).`,
    );
  }
  if (version !== OSCAL_AUTHORING_VERSION) {
    return `Imported as OSCAL ${version}; exporting will normalize to ${OSCAL_AUTHORING_VERSION}.`;
  }
  return undefined;
}
