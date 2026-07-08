/**
 * Catalog control resolution: index catalog controls by id and resolve `control-id → Control`
 * across the workspace's cached catalogs. Decision IDs: ADR-0005, ADR-0008, ADR-0016, ADR-0021.
 *
 * MVP resolves a control-id against all available catalogs (BSI control ids are globally
 * distinctive, e.g. ASST.1.1.2). Source-scoped and profile→catalog resolution are refined in the
 * scoping task (T-140).
 *
 * Alt-identifier form (ADR-0021): BSI data sometimes references a control by a synthetic,
 * underscore-prefixed UUID (`_0573247f-...`) instead of its literal id, because OSCAL ids must be
 * valid NCNames. Such a reference resolves by matching the referenced control's `alt-identifier`
 * prop (case-insensitively), not its `id`. `indexCatalogControls` indexes every control under
 * both forms in the same map — a `_`-prefixed key can never collide with a real BSI mnemonic id.
 */
import { ArtifactRepository } from './artifactRepository';
import type { StoredArtifact } from './db';
import type { Catalog, CatalogGroup } from '@/models/catalog';
import type { Control, Parameter } from '@/models/control';
import type { BackMatter } from '@/models/oscalBase';
import { getControlAltIdentifier, getControlHeadline } from '@/models/controlDisplay';

const ALT_ID_REF_RE = /^_[0-9a-fA-F-]{36}$/;

/**
 * Normalizes a `control-id` reference for map lookup/indexing: the `_{uuid}` alt-identifier form
 * (ADR-0021) is lowercased for case-insensitive matching; a literal BSI id passes through
 * unchanged (those are case-sensitive mnemonics, e.g. `SENS.4.1.2`).
 */
export function normalizeControlIdKey(controlId: string): string {
  return ALT_ID_REF_RE.test(controlId) ? controlId.toLowerCase() : controlId;
}

export interface ResolvedControl {
  control: Control;
  catalogUuid: string;
  catalogTitle: string;
  /** public/library path of the source catalog, if known (for the viewer hand-off, ADR-0008). */
  catalogLibraryPath?: string;
}

function walkControls(
  controls: Control[] | undefined,
  visit: (c: Control) => void,
): void {
  for (const c of controls ?? []) {
    visit(c);
    walkControls(c.controls, visit); // nested (enhancement) controls
  }
}

function walkGroups(groups: CatalogGroup[] | undefined, visit: (c: Control) => void): void {
  for (const g of groups ?? []) {
    walkControls(g.controls, visit);
    walkGroups(g.groups, visit);
  }
}

/** Flatten every control (top-level, grouped, nested) of a catalog into a `id → Control` map. */
export function indexCatalogControls(catalog: Catalog): Map<string, Control> {
  const index = new Map<string, Control>();
  const add = (c: Control) => {
    if (!index.has(c.id)) index.set(c.id, c);
    // ADR-0021: also index by the `_{uuid}` alt-identifier form, when the control carries one.
    const altId = getControlAltIdentifier(c);
    if (altId) {
      const key = normalizeControlIdKey(`_${altId}`);
      if (!index.has(key)) index.set(key, c);
    }
  };
  walkControls(catalog.controls, add);
  walkGroups(catalog.groups, add);
  return index;
}

/** A single workspace catalog, with its controls indexed by id (for source-scoped pickers). */
export interface CatalogEntry {
  uuid: string;
  title: string;
  controlsById: Map<string, Control>;
}

export interface CatalogIndex {
  /** control-id → ResolvedControl (first catalog wins on collision). */
  byControlId: Map<string, ResolvedControl>;
  /** per-catalog entries, in workspace order (drives the source→catalog picker, T-142). */
  catalogs: CatalogEntry[];
  catalogCount: number;
}

/** Build a resolution index from a set of stored catalogs. */
export function buildCatalogIndex(catalogs: StoredArtifact<Catalog>[]): CatalogIndex {
  const byControlId = new Map<string, ResolvedControl>();
  const entries: CatalogEntry[] = [];
  for (const rec of catalogs) {
    const libraryPath = (rec as { libraryPath?: string }).libraryPath;
    const controlsById = indexCatalogControls(rec.artifact);
    entries.push({ uuid: rec.uuid, title: rec.artifact.metadata.title, controlsById });
    for (const [id, control] of controlsById) {
      if (!byControlId.has(id)) {
        byControlId.set(id, {
          control,
          catalogUuid: rec.uuid,
          catalogTitle: rec.artifact.metadata.title,
          ...(libraryPath ? { catalogLibraryPath: libraryPath } : {}),
        });
      }
    }
  }
  return { byControlId, catalogs: entries, catalogCount: catalogs.length };
}

/** A control-implementation `source` href → the referenced catalog uuid (strips a leading `#`). */
export function sourceToCatalogUuid(source: string | undefined): string | undefined {
  if (!source) return undefined;
  return source.startsWith('#') ? source.slice(1) : source;
}

/**
 * Resolve a `source` href to a workspace catalog uuid, preferring the OSCAL-correct back-matter
 * indirection over a direct match (item 5, ADR-0024):
 *   1. `source` → a back-matter resource (`#<resourceUuid>`); from that resource:
 *      1a. a `document-id` matching a workspace catalog's uuid,
 *      1b. the resource's own uuid, in case it happens to equal a catalog's uuid,
 *      1c. the resource's `title` matching a catalog's title (weakest tier).
 *   2. No matching resource at all → legacy/direct fallback: treat the ref as a catalog uuid
 *      itself (T-142's original behavior; keeps already-authored TALOS documents resolvable).
 */
function resolveSourceCatalogUuid(
  source: string | undefined,
  backMatter: BackMatter | undefined,
  index: CatalogIndex,
): string | undefined {
  const ref = sourceToCatalogUuid(source);
  if (!ref) return undefined;

  const resource = backMatter?.resources?.find((r) => r.uuid === ref);
  if (resource) {
    const byDocId = resource.documentIds
      ?.map((d) => index.catalogs.find((c) => c.uuid === d.identifier))
      .find((c): c is CatalogEntry => c !== undefined);
    if (byDocId) return byDocId.uuid;

    const bySelfUuid = index.catalogs.find((c) => c.uuid === resource.uuid);
    if (bySelfUuid) return bySelfUuid.uuid;

    const byTitle = resource.title ? index.catalogs.find((c) => c.title === resource.title) : undefined;
    if (byTitle) return byTitle.uuid;

    return undefined; // a resource exists but doesn't identify any workspace catalog
  }

  return index.catalogs.find((c) => c.uuid === ref)?.uuid;
}

/**
 * The workspace catalog referenced by a `source`, if any (origin-agnostic; T-034 extends the
 * list). `backMatter` enables the back-matter-mediated resolution above; omit it to get the
 * legacy direct-uuid-only behavior (e.g. callers with no artifact context).
 */
export function findCatalogEntry(
  index: CatalogIndex,
  source: string | undefined,
  backMatter?: BackMatter,
): CatalogEntry | undefined {
  const catalogUuid = resolveSourceCatalogUuid(source, backMatter, index);
  return catalogUuid ? index.catalogs.find((c) => c.uuid === catalogUuid) : undefined;
}

/** Source-picker options for `control-implementation.source` (ref is the `#uuid` written to the model). */
export function catalogSourceOptions(index: CatalogIndex): { ref: string; uuid: string; title: string }[] {
  return index.catalogs.map((c) => ({ ref: `#${c.uuid}`, uuid: c.uuid, title: c.title }));
}

/** Control-ids available under a chosen source (empty for an unresolved/free-text source). */
export function controlIdsForSource(
  index: CatalogIndex,
  source: string | undefined,
  backMatter?: BackMatter,
): string[] {
  const entry = findCatalogEntry(index, source, backMatter);
  return entry ? [...entry.controlsById.keys()] : [];
}

export interface ControlIdOption {
  value: string;
  label: string;
}

/**
 * Control-id datalist options for a chosen source (item 7, ADR-0024): `value` is the literal id
 * or `_{uuid}` alt-id form actually written to `control-id`; `label` is the resolved control's
 * headline ("{label|id} {title}", ADR-0016) so the picker shows something readable instead of a
 * raw id/uuid.
 */
export function controlIdOptionsForSource(
  index: CatalogIndex,
  source: string | undefined,
  backMatter?: BackMatter,
): ControlIdOption[] {
  const entry = findCatalogEntry(index, source, backMatter);
  if (!entry) return [];
  return [...entry.controlsById.entries()].map(([id, control]) => ({
    value: id,
    label: getControlHeadline(control),
  }));
}

/** Same as `controlIdOptionsForSource`, unscoped across every workspace catalog (SSPs have no per-requirement source). */
export function allControlIdOptions(index: CatalogIndex): ControlIdOption[] {
  return [...index.byControlId.entries()].map(([id, resolved]) => ({
    value: id,
    label: getControlHeadline(resolved.control),
  }));
}

/** Parameters of a control within a chosen source — the valid `set-parameter.param-id` picks (ADR-0016). */
export function paramsForControl(
  index: CatalogIndex,
  source: string | undefined,
  controlId: string,
  backMatter?: BackMatter,
): Parameter[] {
  const entry = findCatalogEntry(index, source, backMatter);
  return entry?.controlsById.get(normalizeControlIdKey(controlId))?.params ?? [];
}

/** Load all workspace catalogs and build the resolution index. */
export async function loadCatalogIndex(): Promise<CatalogIndex> {
  const catalogs = await ArtifactRepository.forType<Catalog>('catalog').getAll();
  return buildCatalogIndex(catalogs);
}

export function resolveControl(index: CatalogIndex, controlId: string): ResolvedControl | undefined {
  return index.byControlId.get(normalizeControlIdKey(controlId));
}
