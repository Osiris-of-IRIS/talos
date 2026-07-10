// Component-definition editor (create + edit). Decision IDs: ADR-0003, ADR-0015 (feature IMPL-001, T-101).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { MetadataEditor } from '@/features/shared/MetadataEditor';
import { BackMatterEditor } from '@/features/shared/BackMatterEditor';
import { ControlImplementationsEditor } from './ControlImplementationsEditor';
import { useCatalogIndex } from '@/features/shared/useCatalogIndex';
import { createBlankComponentDefinition } from './blank';
import { COMPONENT_TYPES } from '@/models/componentTypes';
import { useI18n } from '@/shared/i18n';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { MarkupEditor } from '@/shared/MarkupEditor';
import { DatalistInput } from '@/shared/DatalistInput';
import { EntitySearchField } from '@/shared/EntitySearchField';
import type { SearchItem } from '@/shared/useEntitySearch';
import { ensureArtifactResource } from '@/models/backMatter';
import { useWorkspaceComponentDefinitions } from '@/features/shared/useWorkspaceComponentDefinitions';
import { resolveImport, wouldCreateCycle, unresolvedImportHrefs } from '@/data/componentImportResolution';
import { syncUnresolvedReferences } from '@/data/unresolvedReferences';
import type { ComponentDefinition, DefinedComponent } from '@/models/componentDefinition';

const COMPONENT_TYPE_OPTIONS = COMPONENT_TYPES.map((ct) => ({ value: ct.value, label: ct.description }));

const repo = () => ArtifactRepository.forType<ComponentDefinition>('componentDefinition');

export function ComponentDefinitionEditorPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const catalogIndex = useCatalogIndex();
  const isNew = !uuid;
  const [draft, setDraft] = useState<ComponentDefinition | null>(isNew ? createBlankComponentDefinition() : null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  // Which components render their full editor vs. a collapsed summary row (item 2). A newly
  // added component auto-opens; an existing/loaded one starts collapsed.
  const expanded = useExpandedSet();
  const workspaceComponentDefs = useWorkspaceComponentDefinitions();
  const [importPick, setImportPick] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  // Per-row pending pick for the inline "resolve a dangling import" picker (T-105), keyed by
  // import index — independent of importPick, which is only for the add-new-import picker.
  const [resolvePicks, setResolvePicks] = useState<Record<number, string>>({});

  useEffect(() => {
    if (isNew || !uuid) return;
    let active = true;
    void repo()
      .get(uuid)
      .then((r) => {
        if (!active) return;
        if (r) setDraft(r.artifact);
        else setNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [uuid, isNew]);

  if (notFound) {
    return (
      <main>
        <p>
          <Link to="/component-definitions">← {t('landing_feature_component_definitions')}</Link>
        </p>
        <p role="alert">{t('cdef_not_found')}</p>
      </main>
    );
  }
  if (!draft) return <main>{t('common_loading')}</main>;

  // All draft mutations use the functional setState form (prev => next) — not direct values —
  // so that when a single event handler triggers multiple updates in sequence (e.g. ensuring a
  // back-matter resource, then patching a component field), each update composes on top of the
  // previous one instead of racing against a stale `draft` closure and silently clobbering it.
  function update(next: ComponentDefinition) {
    setDraft(next);
  }

  function addComponent() {
    const c: DefinedComponent = {
      uuid: globalThis.crypto.randomUUID(),
      type: 'software',
      title: 'New component',
      description: '',
    };
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      (next.components ??= []).push(c);
      return next;
    });
    expanded.expand(c.uuid);
  }

  function patchComponent(idx: number, mutator: (c: DefinedComponent) => void) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      mutator(next.components![idx]!);
      return next;
    });
  }

  function removeComponent(idx: number) {
    const removedUuid = draft!.components![idx]!.uuid;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.components!.splice(idx, 1);
      return next;
    });
    expanded.collapse(removedUuid);
  }

  function requirementCount(c: DefinedComponent): number {
    return (c.controlImplementations ?? []).reduce((sum, ci) => sum + ci.implementedRequirements.length, 0);
  }

  /** Ensures a back-matter resource identifying `catalogUuid` and returns `#<resourceUuid>` (item 5). */
  function ensureCatalogSource(catalogUuid: string, catalogTitle: string): string {
    const existing = draft!.backMatter?.resources?.find((r) =>
      r.documentIds?.some((d) => d.identifier === catalogUuid),
    );
    const resourceUuid = existing?.uuid ?? globalThis.crypto.randomUUID();
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      ensureArtifactResource(next, catalogUuid, catalogTitle, resourceUuid);
      return next;
    });
    return `#${resourceUuid}`;
  }

  /** Add an import of the picked workspace component-definition (ADR-0014): rejects a self-import
   * or a cycle before committing, then references the target via a back-matter resource
   * (never the target's own uuid directly). */
  function addImport() {
    const targetUuid = importPick.trim();
    if (!targetUuid) return;
    if (wouldCreateCycle(draft!.uuid, targetUuid, workspaceComponentDefs)) {
      setImportError(t('cdef_imports_cycle_error'));
      return;
    }
    const target = workspaceComponentDefs.find((w) => w.uuid === targetUuid);
    if (!target) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const resourceUuid = ensureArtifactResource(next, target.uuid, target.artifact.metadata.title);
      (next.importComponentDefinitions ??= []).push({ href: `#${resourceUuid}` });
      return next;
    });
    setImportPick('');
    setImportError(null);
  }

  /** Resolve a dangling import in place (T-105): rewrite its href to point at the picked
   * workspace target via a back-matter resource, preserving remarks — same cycle guard as adding
   * a fresh import. Once resolved, the next save() clears it from the unresolvedReferences store
   * (unresolvedImportHrefs no longer lists it). */
  function resolveDanglingImport(idx: number) {
    const targetUuid = resolvePicks[idx]?.trim();
    if (!targetUuid) return;
    if (wouldCreateCycle(draft!.uuid, targetUuid, workspaceComponentDefs)) {
      setImportError(t('cdef_imports_cycle_error'));
      return;
    }
    const target = workspaceComponentDefs.find((w) => w.uuid === targetUuid);
    if (!target) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const resourceUuid = ensureArtifactResource(next, target.uuid, target.artifact.metadata.title);
      next.importComponentDefinitions![idx]!.href = `#${resourceUuid}`;
      return next;
    });
    setResolvePicks((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    setImportError(null);
  }

  function removeImport(idx: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.importComponentDefinitions!.splice(idx, 1);
      return next;
    });
  }

  function patchImportRemarks(idx: number, remarks: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.importComponentDefinitions![idx]!.remarks = remarks;
      return next;
    });
  }

  async function save() {
    const current = draft;
    if (!current || !current.metadata.title.trim()) return;
    setSaving(true);
    try {
      const toSave = structuredClone(current);
      toSave.metadata.lastModified = new Date().toISOString();
      if (isNew) {
        await repo().create({
          uuid: toSave.uuid,
          type: 'componentDefinition',
          origin: 'user',
          artifact: toSave,
        });
      } else {
        await repo().update(toSave.uuid, toSave);
      }
      // Never silently drop a dangling import (ADR-0014) — record it for a later resolve pass.
      await syncUnresolvedReferences(
        toSave.uuid,
        'componentDefinitions',
        'import-component-definition',
        unresolvedImportHrefs(toSave.importComponentDefinitions, toSave.backMatter, workspaceComponentDefs),
      );
      navigate(`/component-definitions/${toSave.uuid}`);
    } finally {
      setSaving(false);
    }
  }

  const components = draft.components ?? [];
  const imports = draft.importComponentDefinitions ?? [];
  const importSearchItems: SearchItem[] = workspaceComponentDefs
    .filter((w) => w.uuid !== draft.uuid && !wouldCreateCycle(draft.uuid, w.uuid, workspaceComponentDefs))
    .map((w) => ({ id: w.uuid, title: w.artifact.metadata.title, badge: w.origin }));
  const unresolvedCount = unresolvedImportHrefs(imports, draft.backMatter, workspaceComponentDefs).length;

  return (
    <main data-testid="compdef-editor">
      <p>
        <Link to="/component-definitions">← {t('landing_feature_component_definitions')}</Link>
      </p>
      <h1>{isNew ? `➕ ${t('cdef_new')}` : `✎ ${t('cdef_edit_heading')}`}</h1>

      <MetadataEditor artifact={draft} onChange={update} />

      <fieldset>
        <legend>{t('cdef_imports_heading', { count: imports.length })}</legend>
        {unresolvedCount > 0 && (
          <p role="status" data-testid="cdef-imports-unresolved-banner" style={{ color: 'var(--color-warning, #a15c00)' }}>
            ⚠️ {t('cdef_imports_unresolved_banner', { count: unresolvedCount })}
          </p>
        )}
        <ul data-testid="cdef-imports-list">
          {imports.map((imp, i) => {
            const resolved = resolveImport(imp, draft.backMatter, workspaceComponentDefs);
            return (
              <li key={`${imp.href}-${i}`} data-testid="cdef-import-item">
                {resolved ? (
                  <Link to={`/component-definitions/${resolved.uuid}`}>{resolved.artifact.metadata.title}</Link>
                ) : (
                  <span data-testid="cdef-import-unresolved" title={imp.href}>
                    ⚠️ {t('cdef_imports_unresolved')}
                  </span>
                )}{' '}
                <input
                  aria-label={t('cdef_imports_remarks_label')}
                  placeholder={t('cdef_imports_remarks_label')}
                  data-testid="cdef-import-remarks"
                  value={imp.remarks ?? ''}
                  onChange={(e) => patchImportRemarks(i, e.target.value)}
                />{' '}
                {!resolved && (
                  <>
                    <label>
                      {t('cdef_imports_resolve_label')}
                      <EntitySearchField
                        ariaLabel={t('cdef_imports_resolve_aria', { href: imp.href })}
                        dataTestId="cdef-import-resolve-picker"
                        items={importSearchItems}
                        value={resolvePicks[i] ?? ''}
                        onChange={(v) => setResolvePicks((prev) => ({ ...prev, [i]: v }))}
                      />
                    </label>{' '}
                    <button type="button" data-testid="cdef-import-resolve" onClick={() => resolveDanglingImport(i)}>
                      ✓ {t('cdef_imports_resolve_button')}
                    </button>{' '}
                  </>
                )}
                <button
                  type="button"
                  aria-label={t('cdef_imports_remove_aria', { title: resolved?.artifact.metadata.title ?? imp.href })}
                  data-testid="cdef-import-remove"
                  onClick={() => removeImport(i)}
                >
                  🗑️ {t('cdef_imports_remove_button')}
                </button>
              </li>
            );
          })}
        </ul>
        <label>
          {t('cdef_imports_add_label')}
          <EntitySearchField
            ariaLabel={t('cdef_imports_add_aria')}
            dataTestId="cdef-import-picker"
            items={importSearchItems}
            value={importPick}
            onChange={setImportPick}
          />
        </label>{' '}
        <button type="button" data-testid="cdef-import-add" onClick={addImport}>
          ➕ {t('cdef_imports_add_label')}
        </button>
        {importError && (
          <p role="alert" data-testid="cdef-import-error">
            ⚠️ {importError}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>{t('compdef_components_count', { count: components.length })}</legend>
        {components.map((c, i) => {
          const isOpen = expanded.isExpanded(c.uuid);
          const reqCount = requirementCount(c);
          return (
          <div key={c.uuid} className="collapsible-section" data-testid="compdef-edit-component">
            <button
              type="button"
              className="collapsible-toggle"
              data-testid="compdef-component-summary"
              aria-expanded={isOpen}
              aria-label={t(isOpen ? 'cdef_component_collapse_aria' : 'cdef_component_expand_aria', {
                title: c.title,
              })}
              onClick={() => expanded.toggle(c.uuid)}
            >
              {isOpen ? '▾' : '▸'} {c.title} <small>[{c.type}]</small>{' '}
              <small>· {t('cdef_component_requirements_count', { count: reqCount })}</small>
            </button>
            {isOpen && (
              <div className="collapsible-body" data-testid="compdef-component-body">
                <label>
                  {t('md_title_label')}
                  <input
                    aria-label={t('cdef_field_component_title')}
                    data-testid="component-title"
                    value={c.title}
                    onChange={(e) => patchComponent(i, (cc) => (cc.title = e.target.value))}
                  />
                </label>
                <label>
                  {t('cdef_component_type_label')}
                  <DatalistInput
                    ariaLabel={t('cdef_component_type_aria')}
                    dataTestId="component-type"
                    listId={`component-type-options-${c.uuid}`}
                    options={COMPONENT_TYPE_OPTIONS}
                    value={c.type}
                    onChange={(v) => patchComponent(i, (cc) => (cc.type = v))}
                  />
                </label>
                <label>
                  {t('common_description')}
                  <MarkupEditor
                    dataTestId="component-description"
                    ariaLabel={t('cdef_field_component_description')}
                    rows={5}
                    value={c.description}
                    onChange={(v) => patchComponent(i, (cc) => (cc.description = v))}
                  />
                </label>
                <ControlImplementationsEditor
                  value={c}
                  onChange={(next) => patchComponent(i, (cc) => Object.assign(cc, next))}
                  catalogIndex={catalogIndex}
                  backMatter={draft.backMatter}
                  onEnsureCatalogSource={ensureCatalogSource}
                />
                <button
                  type="button"
                  aria-label={t('cdef_remove_component_aria', { title: c.title })}
                  onClick={() => removeComponent(i)}
                >
                  🗑️ {t('cdef_remove_component_button')}
                </button>
              </div>
            )}
          </div>
          );
        })}
        <button type="button" data-testid="add-component" onClick={addComponent}>
          ➕ {t('cdef_add_component')}
        </button>
      </fieldset>

      <BackMatterEditor artifact={draft} onChange={update} />

      <div>
        <button type="button" data-testid="save-compdef" onClick={() => void save()} disabled={saving}>
          💾 {t('common_save')}
        </button>{' '}
        {!draft.metadata.title.trim() && <small>{t('cdef_title_required')}</small>}
      </div>
    </main>
  );
}
