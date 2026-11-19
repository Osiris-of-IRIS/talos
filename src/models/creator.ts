/**
 * Mandatory creator identity (ADR-0019). Every OSCAL artifact must declare a creator: a
 * `responsible-party` with role-id `creator` whose referenced party (a person or organization
 * defined in `metadata/parties`) has both a name and at least one email address.
 *
 * In OSCAL, `creator` is a reserved role id. This module is the single source of truth for the
 * rule; it is surfaced non-blocking in the editor and enforced at export (ADR-0007/T-151 path).
 */
import type { Metadata, Party } from './oscalBase';

/** Reserved OSCAL role id for the primary author of a document. */
export const CREATOR_ROLE_ID = 'creator';

/** Parties assigned to the creator role (resolved against `metadata/parties`). */
export function getCreatorParties(metadata: Metadata): Party[] {
  const rp = (metadata.responsibleParties ?? []).find((r) => r.roleId === CREATOR_ROLE_ID);
  if (!rp) return [];
  const parties = metadata.parties ?? [];
  return rp.partyUuids
    .map((uuid) => parties.find((p) => p.uuid === uuid))
    .filter((p): p is Party => p !== undefined);
}

function hasEmail(party: Party): boolean {
  return (party.emailAddresses ?? []).some((e) => e.trim().length > 0);
}

export type CreatorProblemCode =
  | 'creator-missing'
  | 'creator-no-party'
  | 'creator-party-undefined'
  | 'creator-party-no-name'
  | 'creator-party-no-email';

/** A structured creator-rule violation; the UI localizes it (src/shared/complianceMessages.ts). */
export interface CreatorProblem {
  code: CreatorProblemCode;
  /** `label`: the party's name or `party <uuid8>`, for the per-party codes. */
  params: Record<string, string>;
}

/** The creator rule as structured problems (empty ⇒ valid). Single source for `validateCreator`. */
export function creatorProblems(metadata: Metadata): CreatorProblem[] {
  const rp = (metadata.responsibleParties ?? []).find((r) => r.roleId === CREATOR_ROLE_ID);
  if (!rp) return [{ code: 'creator-missing', params: {} }];
  if (rp.partyUuids.length === 0) return [{ code: 'creator-no-party', params: {} }];
  const parties = metadata.parties ?? [];
  const problems: CreatorProblem[] = [];
  for (const uuid of rp.partyUuids) {
    const party = parties.find((p) => p.uuid === uuid);
    if (!party) {
      problems.push({ code: 'creator-party-undefined', params: {} });
      continue;
    }
    const label = party.name?.trim() || `party ${party.uuid.slice(0, 8)}`;
    if (!party.name || party.name.trim().length === 0) problems.push({ code: 'creator-party-no-name', params: { label } });
    if (!hasEmail(party)) problems.push({ code: 'creator-party-no-email', params: { label } });
  }
  return problems;
}

/** English wording of each creator problem — logs and non-UI callers; the UI uses the locales. */
export function creatorProblemMessage(p: CreatorProblem): string {
  switch (p.code) {
    case 'creator-missing':
      return "No creator assigned. Assign a responsible party to the 'creator' role.";
    case 'creator-no-party':
      return 'The creator role has no party assigned.';
    case 'creator-party-undefined':
      return 'The creator references a party that is not defined in the document.';
    case 'creator-party-no-name':
      return `The creator party (${p.params.label}) is missing a name.`;
    case 'creator-party-no-email':
      return `The creator party (${p.params.label}) is missing an email address.`;
  }
}

/**
 * Validate the creator rule. Returns a list of human-readable (English) problems; an empty list
 * means the artifact has a valid creator.
 */
export function validateCreator(metadata: Metadata): string[] {
  return creatorProblems(metadata).map(creatorProblemMessage);
}

/** True when the artifact has a valid creator (name + email). */
export function hasValidCreator(metadata: Metadata): boolean {
  return validateCreator(metadata).length === 0;
}
