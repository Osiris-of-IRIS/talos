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
import { resolveBackMatterReference } from './backMatterReferenceResolution';

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

/**
 * Every control's canonical `[id, Control]` entry, exactly once — unlike raw `Map.entries()` on
 * an `indexCatalogControls` result. That map deliberately dual-keys a control under both its
 * literal id and its `_{uuid}` alt-identifier form (ADR-0021), so any two different id references
 * to the same control resolve via a single O(1) lookup; a caller that instead wants "the set of
 * controls" (a checklist row per control, a count of matched controls) must not iterate the raw
 * map, or a control with an alt-identifier appears twice. Filters to the entries whose key is the
 * control's own `id` — the alt-identifier-keyed duplicate entry's key never equals that.
 */
export function uniqueCatalogControlEntries(controlsById: Map<string, Control>): [string, Control][] {
  return [...controlsById.entries()].filter(([id, control]) => id === control.id);
}

/** A single workspace catalog, with its controls indexed by id (for source-scoped pickers). */
export interface CatalogEntry {
  uuid: string;
  title: string;
  controlsById: Map<string, Control>;
  /** public/library path of the catalog, if known (for the viewer hand-off, ADR-0008). */
  libraryPath?: string;
}

/**
 * A workspace profile as a `control-implementation.source` candidate (T-205): its own effective
 * control set, already resolved (recursively, through profile-of-profile imports too — T-206) by
 * the caller into a plain `id -> Control` map. This module stays free of any dependency on
 * `profileImportResolution.ts`/the `Profile` model on purpose — that module already imports
 * *this* one (`indexCatalogControls`/`uniqueCatalogControlEntries`), so resolving a profile's
 * controls here too would be a cycle. The orchestration (fetch profiles, call
 * `resolveProfileEffectiveControls`, build this list) lives in `useCatalogIndex.ts` instead.
 */
export interface ProfileSourceEntry {
  uuid: string;
  title: string;
  controlsById: Map<string, Control>;
}

/** A `control-implementation.source` candidate, catalog or profile, in the shape the source-scoped
 * pickers (T-142/T-205) need regardless of which kind it is. */
export interface SourceEntry {
  kind: 'catalog' | 'profile';
  uuid: string;
  title: string;
  controlsById: Map<string, Control>;
  /** public/library path, catalog sources only (for the viewer hand-off, ADR-0008). */
  libraryPath?: string;
}

export interface CatalogIndex {
  /** control-id → ResolvedControl, catalogs only (first catalog wins on collision) — backs the
   * *unscoped* picker (SSPs have no per-requirement source, `allControlIdOptions`). */
  byControlId: Map<string, ResolvedControl>;
  /** per-catalog entries, in workspace order (drives the source→catalog picker, T-142). */
  catalogs: CatalogEntry[];
  catalogCount: number;
  /** per-profile entries (T-205) — a profile is also a valid `control-implementation.source`. */
  profiles: ProfileSourceEntry[];
}

/** Catalog and profile source entries combined, for the source-scoped pickers (T-142/T-205). */
function combinedSourceEntries(index: CatalogIndex): SourceEntry[] {
  return [
    ...index.catalogs.map(
      (c): SourceEntry => ({ kind: 'catalog', uuid: c.uuid, title: c.title, controlsById: c.controlsById, ...(c.libraryPath ? { libraryPath: c.libraryPath } : {}) }),
    ),
    ...index.profiles.map(
      (p): SourceEntry => ({ kind: 'profile', uuid: p.uuid, title: p.title, controlsById: p.controlsById }),
    ),
  ];
}

/** Build a resolution index from a set of stored catalogs, plus optional already-resolved profile
 * source entries (T-205 — see `ProfileSourceEntry`'s doc comment for why they're pre-resolved). */
export function buildCatalogIndex(catalogs: StoredArtifact<Catalog>[], profiles: ProfileSourceEntry[] = []): CatalogIndex {
  const byControlId = new Map<string, ResolvedControl>();
  const entries: CatalogEntry[] = [];
  for (const rec of catalogs) {
    const libraryPath = (rec as { libraryPath?: string }).libraryPath;
    const controlsById = indexCatalogControls(rec.artifact);
    entries.push({
      uuid: rec.uuid,
      title: rec.artifact.metadata.title,
      controlsById,
      ...(libraryPath ? { libraryPath } : {}),
    });
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
  return { byControlId, catalogs: entries, catalogCount: catalogs.length, profiles };
}

/** A control-implementation `source` href → the referenced catalog/profile uuid (strips a leading `#`). */
export function sourceToRefUuid(source: string | undefined): string | undefined {
  if (!source) return undefined;
  return source.startsWith('#') ? source.slice(1) : source;
}

/**
 * Resolve a `source` href to a workspace catalog/profile uuid, preferring the OSCAL-correct
 * back-matter indirection over a direct match (item 5, ADR-0024):
 *   1. `source` → a back-matter resource (`#<resourceUuid>`); from that resource:
 *      1a. a `document-id` matching a workspace catalog/profile's uuid,
 *      1b. the resource's own uuid, in case it happens to equal one,
 *      1c. the resource's `title` matching a catalog/profile's title (weakest tier).
 *   2. No matching resource at all → legacy/direct fallback: treat the ref as a catalog/profile
 *      uuid itself (T-142's original behavior; keeps already-authored TALOS documents resolvable).
 */
function resolveSourceUuid(
  source: string | undefined,
  backMatter: BackMatter | undefined,
  index: CatalogIndex,
): string | undefined {
  const ref = sourceToRefUuid(source);
  if (!ref) return undefined;
  const sources = combinedSourceEntries(index);
  const entry = resolveBackMatterReference<SourceEntry>(ref, backMatter, [
    {
      findByUuid: (uuid) => sources.find((s) => s.uuid === uuid),
      findByTitle: (title) => sources.find((s) => s.title === title),
    },
  ]);
  return entry?.uuid;
}

/**
 * The workspace catalog or profile referenced by a `source`, if any (T-205 — a profile's own
 * candidates are its effective control set, T-206). `backMatter` enables the back-matter-mediated
 * resolution above; omit it to get the legacy direct-uuid-only behavior (e.g. callers with no
 * artifact context).
 */
export function findSourceEntry(
  index: CatalogIndex,
  source: string | undefined,
  backMatter?: BackMatter,
): SourceEntry | undefined {
  const refUuid = resolveSourceUuid(source, backMatter, index);
  return refUuid ? combinedSourceEntries(index).find((s) => s.uuid === refUuid) : undefined;
}

/** Look up a source entry directly by its own uuid (not via a `source` href) — used when a picker
 * offers a raw workspace uuid to "upgrade" into a back-matter-mediated reference (item 5). */
export function findSourceEntryByUuid(index: CatalogIndex, uuid: string): SourceEntry | undefined {
  return combinedSourceEntries(index).find((s) => s.uuid === uuid);
}

/** Source-picker options for `control-implementation.source` (ref is the `#uuid` written to the
 * model) — every workspace catalog and profile (T-205). */
export function sourceOptions(index: CatalogIndex): { ref: string; uuid: string; title: string; kind: 'catalog' | 'profile' }[] {
  return combinedSourceEntries(index).map((s) => ({ ref: `#${s.uuid}`, uuid: s.uuid, title: s.title, kind: s.kind }));
}

/** Control-ids available under a chosen source (empty for an unresolved/free-text source). */
export function controlIdsForSource(
  index: CatalogIndex,
  source: string | undefined,
  backMatter?: BackMatter,
): string[] {
  const entry = findSourceEntry(index, source, backMatter);
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
  const entry = findSourceEntry(index, source, backMatter);
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
  const entry = findSourceEntry(index, source, backMatter);
  return entry?.controlsById.get(normalizeControlIdKey(controlId))?.params ?? [];
}

/**
 * Resolve a control within a chosen source (item 3, ADR-0030) — the source-scoped counterpart to
 * `resolveControl` (which is unscoped, for SSPs). Used to show the actual control content next to
 * an implemented-requirement's editor fields instead of just the raw id. `catalogUuid`/
 * `catalogTitle` below name the *source* entry's uuid/title regardless of kind (T-205) — kept as
 * historically named since `ResolvedControl` is shared with the unscoped, catalog-only path too.
 */
export function resolveControlForSource(
  index: CatalogIndex,
  source: string | undefined,
  controlId: string,
  backMatter?: BackMatter,
): ResolvedControl | undefined {
  const entry = findSourceEntry(index, source, backMatter);
  const control = entry?.controlsById.get(normalizeControlIdKey(controlId));
  if (!entry || !control) return undefined;
  return {
    control,
    catalogUuid: entry.uuid,
    catalogTitle: entry.title,
    ...(entry.libraryPath ? { catalogLibraryPath: entry.libraryPath } : {}),
  };
}

/** Load all workspace catalogs and build the resolution index (catalogs only — see
 * `useCatalogIndex.ts` for the profile-aware version used by the source picker, T-205). */
export async function loadCatalogIndex(): Promise<CatalogIndex> {
  const catalogs = await ArtifactRepository.forType<Catalog>('catalog').getAll();
  return buildCatalogIndex(catalogs);
}

export function resolveControl(index: CatalogIndex, controlId: string): ResolvedControl | undefined {
  return index.byControlId.get(normalizeControlIdKey(controlId));
}
