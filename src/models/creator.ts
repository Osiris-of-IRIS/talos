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

/**
 * Validate the creator rule. Returns a list of human-readable problems; an empty list means the
 * artifact has a valid creator.
 */
export function validateCreator(metadata: Metadata): string[] {
  const rp = (metadata.responsibleParties ?? []).find((r) => r.roleId === CREATOR_ROLE_ID);
  if (!rp) {
    return ["No creator assigned. Assign a responsible party to the 'creator' role."];
  }
  if (rp.partyUuids.length === 0) {
    return ['The creator role has no party assigned.'];
  }
  const parties = metadata.parties ?? [];
  const problems: string[] = [];
  for (const uuid of rp.partyUuids) {
    const party = parties.find((p) => p.uuid === uuid);
    if (!party) {
      problems.push('The creator references a party that is not defined in the document.');
      continue;
    }
    const label = party.name?.trim() || `party ${party.uuid.slice(0, 8)}`;
    if (!party.name || party.name.trim().length === 0) {
      problems.push(`The creator party (${label}) is missing a name.`);
    }
    if (!hasEmail(party)) {
      problems.push(`The creator party (${label}) is missing an email address.`);
    }
  }
  return problems;
}

/** True when the artifact has a valid creator (name + email). */
export function hasValidCreator(metadata: Metadata): boolean {
  return validateCreator(metadata).length === 0;
}
