/**
 * Shared OSCAL artifact data model — the reusable envelope common to every OSCAL
 * document (metadata + back-matter), extended per type. Decision IDs: ADR-0003, ADR-0007.
 *
 * Field names use camelCase in the app model; the JSON wire form is kebab-case and is
 * converted only in the envelope codec (see envelope.ts). Aligned to NIST OSCAL v1.2.3.
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

/**
 * The single version every artifact authored or exported by TALOS declares (ADR-0007). This is
 * the one source of truth: blank factories, runtime config, export normalization and the test
 * harness all read it from here (TEST-VER-02).
 */
export const OSCAL_AUTHORING_VERSION = '1.2.3';

/** Codes for non-blocking import warnings; the UI renders them via `t()` (ADR-0012). */
export type ImportWarningCode = 'oscal-version-missing' | 'oscal-version-other';

/**
 * A non-blocking import warning. `code` + `params` are what the UI localizes
 * (src/shared/importMessages.ts); `message` is the English rendering for logs and non-UI callers.
 */
export interface ImportWarning {
  code: ImportWarningCode;
  params: Record<string, string>;
  message: string;
}

export type OscalVersionErrorCode = 'oscal-version-unsupported' | 'oscal-version-unrecognized';

/** Thrown when a document's oscal-version cannot be imported at all (ADR-0007). */
export class OscalVersionError extends Error {
  constructor(
    readonly code: OscalVersionErrorCode,
    readonly params: Record<string, string>,
    message: string,
  ) {
    super(message);
    this.name = 'OscalVersionError';
  }
}

/**
 * Outcome of the import version policy:
 *  - `none`    — the document is at the authoring version.
 *  - `info`    — another patch of the authoring major.minor (e.g. 1.2.2 while authoring 1.2.3):
 *                structurally compatible, so no user-facing warning; callers log it at info level.
 *  - `warning` — accepted, but the user is told (missing version, 1.0/1.1, any other 1.x minor).
 */
export type OscalVersionCheck =
  | { level: 'none' }
  | { level: 'info'; version: string }
  | { level: 'warning'; warning: ImportWarning };

/** `major.minor` of a version string (`'1.2.3'` → `'1.2'`). */
function majorMinor(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

/**
 * Apply ADR-0007's import policy (amended 2026-11-16, product owner) to a document's
 * `metadata.oscal-version`:
 *  - the authoring version → `none`.
 *  - another patch of the same major.minor (1.2.x) → `info` (no warning; patch releases are
 *    structurally compatible).
 *  - any other `1.x` (1.0, 1.1, 1.3, …) → `warning` (export normalizes to the authoring version).
 *  - missing/empty → `warning` (assume the authoring version).
 *  - non-1.x (2.x, 0.x) → **throws** `OscalVersionError` (TALOS imports OSCAL 1.x only).
 *  - unparseable → **throws** `OscalVersionError`.
 * Never hard-fails for a version *within* 1.x.
 */
export function checkImportOscalVersion(version: unknown): OscalVersionCheck {
  const target = OSCAL_AUTHORING_VERSION;
  if (version === undefined || version === null || version === '') {
    return {
      level: 'warning',
      warning: {
        code: 'oscal-version-missing',
        params: { target },
        message: `Document has no metadata.oscal-version; treating it as ${target}. Export will write ${target}.`,
      },
    };
  }
  if (typeof version !== 'string' || !/^\d+\.\d+/.test(version)) {
    throw new OscalVersionError(
      'oscal-version-unrecognized',
      { version: String(version), target },
      `Unrecognized OSCAL version "${String(version)}". TALOS imports OSCAL 1.x only.`,
    );
  }
  const major = version.split('.')[0];
  if (major !== '1') {
    throw new OscalVersionError(
      'oscal-version-unsupported',
      { version, target },
      `Unsupported OSCAL version "${version}". TALOS imports OSCAL 1.x only (authoring/export is ${target}).`,
    );
  }
  if (version === target) return { level: 'none' };
  if (majorMinor(version) === majorMinor(target)) return { level: 'info', version };
  return {
    level: 'warning',
    warning: {
      code: 'oscal-version-other',
      params: { version, target },
      message: `Imported as OSCAL ${version}; exporting will normalize to ${target}.`,
    },
  };
}
