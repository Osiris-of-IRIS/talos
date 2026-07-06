/**
 * Catalog control resolution: index catalog controls by id and resolve `control-id → Control`
 * across the workspace's cached catalogs. Decision IDs: ADR-0005, ADR-0008, ADR-0016.
 *
 * MVP resolves a control-id against all available catalogs (BSI control ids are globally
 * distinctive, e.g. ASST.1.1.2). Source-scoped and profile→catalog resolution are refined in the
 * scoping task (T-140).
 */
import { ArtifactRepository } from './artifactRepository';
import type { StoredArtifact } from './db';
import type { Catalog, CatalogGroup } from '@/models/catalog';
import type { Control, Parameter } from '@/models/control';

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

/** The workspace catalog referenced by a `source`, if any (origin-agnostic; T-034 extends the list). */
export function findCatalogEntry(index: CatalogIndex, source: string | undefined): CatalogEntry | undefined {
  const uuid = sourceToCatalogUuid(source);
  return uuid ? index.catalogs.find((c) => c.uuid === uuid) : undefined;
}

/** Source-picker options for `control-implementation.source` (ref is the `#uuid` written to the model). */
export function catalogSourceOptions(index: CatalogIndex): { ref: string; uuid: string; title: string }[] {
  return index.catalogs.map((c) => ({ ref: `#${c.uuid}`, uuid: c.uuid, title: c.title }));
}

/** Control-ids available under a chosen source (empty for an unresolved/free-text source). */
export function controlIdsForSource(index: CatalogIndex, source: string | undefined): string[] {
  const entry = findCatalogEntry(index, source);
  return entry ? [...entry.controlsById.keys()] : [];
}

/** Parameters of a control within a chosen source — the valid `set-parameter.param-id` picks (ADR-0016). */
export function paramsForControl(
  index: CatalogIndex,
  source: string | undefined,
  controlId: string,
): Parameter[] {
  const entry = findCatalogEntry(index, source);
  return entry?.controlsById.get(controlId)?.params ?? [];
}

/** Load all workspace catalogs and build the resolution index. */
export async function loadCatalogIndex(): Promise<CatalogIndex> {
  const catalogs = await ArtifactRepository.forType<Catalog>('catalog').getAll();
  return buildCatalogIndex(catalogs);
}

export function resolveControl(index: CatalogIndex, controlId: string): ResolvedControl | undefined {
  return index.byControlId.get(controlId);
}
