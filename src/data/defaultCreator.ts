/**
 * Applies the global default creator (Settings page, ADR-0033) to a freshly-created,
 * not-yet-saved OSCAL artifact — the party + `creator` responsible-party half of the mandatory
 * creator rule (ADR-0019) that `blank.ts` factories deliberately leave for the user to fill in by
 * hand. A no-op when the global setting isn't configured (needs both a name and an email — same
 * bar as `validateCreator`) or when the artifact already has a creator assigned (defensive; never
 * overwrites an existing one).
 *
 * The "same person keeps the same party uuid across every document" guarantee is provided by the
 * Settings page (which persists an auto-generated uuid back into settings on first save, ADR-0033)
 * — this function's own `crypto.randomUUID()` fallback only covers the defensive case of
 * `creatorUuid` being unset despite a name/email being present, and is not itself stable across
 * calls.
 */
import { CREATOR_ROLE_ID } from '@/models/creator';
import type { OscalArtifact } from '@/models/oscalBase';
import type { TalosSettings } from './db';

export function applyDefaultCreator<T extends OscalArtifact>(artifact: T, settings: TalosSettings): T {
  const name = settings.creatorName?.trim();
  const email = settings.creatorEmail?.trim();
  if (!name || !email) return artifact;

  const md = artifact.metadata;
  if ((md.responsibleParties ?? []).some((rp) => rp.roleId === CREATOR_ROLE_ID)) return artifact;

  const uuid = settings.creatorUuid?.trim() || globalThis.crypto.randomUUID();
  return {
    ...artifact,
    metadata: {
      ...md,
      parties: [...(md.parties ?? []), { uuid, type: 'person', name, emailAddresses: [email] }],
      responsibleParties: [...(md.responsibleParties ?? []), { roleId: CREATOR_ROLE_ID, partyUuids: [uuid] }],
    },
  };
}
