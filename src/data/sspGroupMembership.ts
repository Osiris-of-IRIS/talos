/**
 * An SSP's group membership (T-512, ADR-0037, human supervisor decision): a single
 * `metadata.props[name="groups"]` entry holding a comma-separated list of `SspGroup` uuids — same
 * shape as a control's `tags` prop (`controlTags.ts`), chosen specifically so group membership
 * round-trips through OSCAL export/import as ordinary metadata (unlike `system-characteristics`,
 * which is SSP-specific), not a TALOS-only side channel. An SSP can belong to several groups at
 * once (the prop holds every uuid, not just one).
 */
import type { SystemSecurityPlan } from '@/models/ssp';
import { parseCommaList } from './commaList';

const GROUPS_PROP = 'groups';

export function getSspGroupIds(ssp: SystemSecurityPlan): string[] {
  const raw = ssp.metadata.props?.find((p) => p.name === GROUPS_PROP)?.value;
  return raw ? parseCommaList(raw) : [];
}

/** Mutates `ssp.metadata.props` in place (matches this codebase's other in-place prop setters,
 * e.g. `withBootstrapSource` returns a new array but is always assigned back by its one caller —
 * here callers already work against a `structuredClone`d draft, so in-place is the simpler fit). */
export function setSspGroupIds(ssp: SystemSecurityPlan, groupUuids: string[]): void {
  const filtered = (ssp.metadata.props ?? []).filter((p) => p.name !== GROUPS_PROP);
  ssp.metadata.props = groupUuids.length > 0 ? [...filtered, { name: GROUPS_PROP, value: groupUuids.join(', ') }] : filtered;
}
