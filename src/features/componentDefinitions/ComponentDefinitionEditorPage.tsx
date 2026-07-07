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
import type { ComponentDefinition, DefinedComponent } from '@/models/componentDefinition';

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  function update(next: ComponentDefinition) {
    setDraft(next);
  }

  function addComponent() {
    const next = structuredClone(draft!);
    const c: DefinedComponent = {
      uuid: globalThis.crypto.randomUUID(),
      type: 'software',
      title: 'New component',
      description: '',
    };
    (next.components ??= []).push(c);
    setDraft(next);
    setExpanded((prev) => new Set(prev).add(c.uuid));
  }

  function patchComponent(idx: number, mutator: (c: DefinedComponent) => void) {
    const next = structuredClone(draft!);
    mutator(next.components![idx]!);
    setDraft(next);
  }

  function removeComponent(idx: number) {
    const removedUuid = draft!.components![idx]!.uuid;
    const next = structuredClone(draft!);
    next.components!.splice(idx, 1);
    setDraft(next);
    setExpanded((prev) => {
      const nextExpanded = new Set(prev);
      nextExpanded.delete(removedUuid);
      return nextExpanded;
    });
  }

  function toggleExpanded(componentUuid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(componentUuid)) next.delete(componentUuid);
      else next.add(componentUuid);
      return next;
    });
  }

  function requirementCount(c: DefinedComponent): number {
    return (c.controlImplementations ?? []).reduce((sum, ci) => sum + ci.implementedRequirements.length, 0);
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
      navigate(`/component-definitions/${toSave.uuid}`);
    } finally {
      setSaving(false);
    }
  }

  const components = draft.components ?? [];

  return (
    <main data-testid="compdef-editor">
      <p>
        <Link to="/component-definitions">← {t('landing_feature_component_definitions')}</Link>
      </p>
      <h1>{isNew ? `➕ ${t('cdef_new')}` : `✎ ${t('cdef_edit_heading')}`}</h1>

      <MetadataEditor artifact={draft} onChange={update} />
      <BackMatterEditor artifact={draft} onChange={update} />

      <fieldset>
        <legend>{t('compdef_components_count', { count: components.length })}</legend>
        <datalist id="component-type-options">
          {COMPONENT_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.description}
            </option>
          ))}
        </datalist>
        {components.map((c, i) => {
          const isOpen = expanded.has(c.uuid);
          const reqCount = requirementCount(c);
          return (
          <div key={c.uuid} data-testid="compdef-edit-component">
            <button
              type="button"
              data-testid="compdef-component-summary"
              aria-expanded={isOpen}
              aria-label={t(isOpen ? 'cdef_component_collapse_aria' : 'cdef_component_expand_aria', {
                title: c.title,
              })}
              onClick={() => toggleExpanded(c.uuid)}
            >
              {isOpen ? '▾' : '▸'} {c.title} <small>[{c.type}]</small>{' '}
              <small>· {t('cdef_component_requirements_count', { count: reqCount })}</small>
            </button>
            {isOpen && (
              <div data-testid="compdef-component-body">
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
                  <input
                    aria-label={t('cdef_component_type_aria')}
                    data-testid="component-type"
                    list="component-type-options"
                    value={c.type}
                    onChange={(e) => patchComponent(i, (cc) => (cc.type = e.target.value))}
                  />
                </label>
                <label>
                  {t('common_description')}
                  <textarea
                    aria-label={t('cdef_field_component_description')}
                    value={c.description}
                    onChange={(e) => patchComponent(i, (cc) => (cc.description = e.target.value))}
                  />
                </label>
                <ControlImplementationsEditor
                  value={c}
                  onChange={(next) => patchComponent(i, (cc) => Object.assign(cc, next))}
                  catalogIndex={catalogIndex}
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

      <div>
        <button type="button" data-testid="save-compdef" onClick={() => void save()} disabled={saving}>
          💾 {t('common_save')}
        </button>{' '}
        {!draft.metadata.title.trim() && <small>{t('cdef_title_required')}</small>}
      </div>
    </main>
  );
}
