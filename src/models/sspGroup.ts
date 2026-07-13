/**
 * SSP Group (T-512, ADR-0037) — a user-authored organizational tree for SSPs, not an OSCAL
 * artifact type (same status as `AssetType`/`Asset`, ADR-0026): TALOS-internal grouping data used
 * to scope the "apply a change to other SSPs" propagation feature. `parentGroupUuid` makes the
 * flat list a tree — a group with no parent is a root.
 */
export interface SspGroup {
  uuid: string;
  title: string;
  parentGroupUuid?: string;
}
