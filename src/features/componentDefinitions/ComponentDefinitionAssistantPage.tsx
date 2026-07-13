/**
 * Component-Definition Creation Assistant (T-511, ADR-0036, MVP Feedback "component-definition
 * assistant"): guided single-component component-definition creation — component fields, a
 * single catalog/profile source, and a description-per-control screen. Reuses the same building
 * blocks the plain editor already has (`SetParameterRow` from `ControlImplementationsEditor`,
 * `ControlDisplay`, the `.control-requirements-table` 40/60 layout) — the assistant's own
 * contribution is the guided flow and the "generate one requirement per control" step, not a
 * second implementation of anything the editor already has (same precedent as
 * `ProfileCreationAssistantPage`).
 *
 * No metadata/creator UI is shown here (unlike the plain editor) — per the MVP Feedback spec, the
 * component-definition's title and creator are fully derived (title template) or auto-applied
 * (global default creator, ADR-0033) rather than user-edited in this flow.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { useCatalogIndex } from '@/features/shared/useCatalogIndex';
import {
  sourceOptions,
  findSourceEntryByUuid,
  uniqueCatalogControlEntries,
} from '@/data/catalogResolution';
import { getSettings } from '@/data/settingsRepository';
import { applyDefaultCreator } from '@/data/defaultCreator';
import { ensureArtifactResource } from '@/models/backMatter';
import { COMPONENT_TYPES } from '@/models/componentTypes';
import { DatalistInput } from '@/shared/DatalistInput';
import { MarkupEditor } from '@/shared/MarkupEditor';
import { EntitySearchField } from '@/shared/EntitySearchField';
import type { SearchItem } from '@/shared/useEntitySearch';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { ControlDisplay } from '@/features/shared/ControlDisplay';
import { SetParameterRow } from './ControlImplementationsEditor';
import { createBlankComponentDefinition } from './blank';
import { viewerHref } from '@/config';
import { useI18n } from '@/shared/i18n';
import type { ComponentDefinition, DefinedComponent, ImplementedRequirement } from '@/models/componentDefinition';

const COMPONENT_TYPE_OPTIONS = COMPONENT_TYPES.map((ct) => ({ value: ct.value, label: ct.description }));

const repo = () => ArtifactRepository.forType<ComponentDefinition>('componentDefinition');

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export function ComponentDefinitionAssistantPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const catalogIndex = useCatalogIndex();
  const paramsExpanded = useExpandedSet();

  const [componentTitle, setComponentTitle] = useState('');
  const [componentType, setComponentType] = useState('software');
  const [componentDescription, setComponentDescription] = useState('');
  const [sourceUuid, setSourceUuid] = useState('');
  const [requirements, setRequirements] = useState<ImplementedRequirement[]>([]);
  const [saving, setSaving] = useState(false);

  const sourceEntry = sourceUuid && catalogIndex ? findSourceEntryByUuid(catalogIndex, sourceUuid) : undefined;

  const sourceSearchItems: SearchItem[] = catalogIndex
    ? sourceOptions(catalogIndex).map((o) => ({
        id: o.uuid,
        title: o.title,
        badge: t(o.kind === 'catalog' ? 'ci_source_kind_catalog' : 'ci_source_kind_profile'),
      }))
    : [];

  // The requirement set is entirely derived from the picked source (item 2) — a stale set from a
  // previously-picked source could reference control-ids that don't exist in the new one, same
  // reset rationale as ProfileCreationAssistantPage's includeIds reset on sourcePick change.
  // Depends on `sourceUuid`/`catalogIndex` only, not the `sourceEntry` object itself:
  // `findSourceEntryByUuid` (via `combinedSourceEntries`) allocates a fresh wrapper object on
  // every call, so using it as a dependency would re-fire this effect on every render.
  useEffect(() => {
    if (!sourceUuid || !catalogIndex) {
      setRequirements([]);
      return;
    }
    const entry = findSourceEntryByUuid(catalogIndex, sourceUuid);
    if (!entry) {
      setRequirements([]);
      return;
    }
    const unique = uniqueCatalogControlEntries(entry.controlsById);
    setRequirements(unique.map(([id]): ImplementedRequirement => ({ uuid: uuid(), controlId: id })));
  }, [sourceUuid, catalogIndex]);

  function patchRequirement(idx: number, mutator: (r: ImplementedRequirement) => void) {
    setRequirements((prev) => {
      const next = [...prev];
      const clone = structuredClone(next[idx]!);
      mutator(clone);
      next[idx] = clone;
      return next;
    });
  }

  async function onCreate() {
    if (!componentTitle.trim() || !sourceEntry) return;
    setSaving(true);
    try {
      let cd = createBlankComponentDefinition();
      cd.metadata.title = t('cdefa_generated_title', { title: componentTitle });
      const settings = await getSettings();
      cd = applyDefaultCreator(cd, settings);

      const resourceUuid = ensureArtifactResource(cd, sourceEntry.uuid, sourceEntry.title);
      const component: DefinedComponent = {
        uuid: uuid(),
        type: componentType,
        title: componentTitle,
        description: componentDescription,
        controlImplementations: [
          {
            uuid: uuid(),
            source: `#${resourceUuid}`,
            description: t('cdefa_ci_description_template', { title: componentTitle, source: sourceEntry.title }),
            implementedRequirements: requirements,
          },
        ],
      };
      cd.components = [component];

      await repo().create({ uuid: cd.uuid, type: 'componentDefinition', origin: 'user', artifact: cd });
      navigate(`/component-definitions/${cd.uuid}`);
    } finally {
      setSaving(false);
    }
  }

  const canCreate = !!componentTitle.trim() && !!sourceEntry;

  return (
    <main data-testid="cdef-assistant">
      <p>
        <Link to="/component-definitions">← {t('landing_feature_component_definitions')}</Link>
      </p>
      <h1>✦ {t('cdefa_heading')}</h1>
      <p>
        <small>{t('cdefa_intro')}</small>
      </p>

      <fieldset>
        <legend>{t('cdefa_step_component')}</legend>
        <label>
          {t('cdef_field_component_title')}
          <input
            aria-label={t('cdef_field_component_title')}
            data-testid="cdefa-component-title"
            value={componentTitle}
            onChange={(e) => setComponentTitle(e.target.value)}
          />
        </label>
        <label>
          {t('cdef_component_type_label')}
          <DatalistInput
            ariaLabel={t('cdef_component_type_aria')}
            dataTestId="cdefa-component-type"
            listId="cdefa-component-type-options"
            options={COMPONENT_TYPE_OPTIONS}
            value={componentType}
            onChange={setComponentType}
          />
        </label>
        <label>
          {t('common_description')}
          <MarkupEditor
            dataTestId="cdefa-component-description"
            ariaLabel={t('cdef_field_component_description')}
            rows={5}
            value={componentDescription}
            onChange={setComponentDescription}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>{t('cdefa_step_source')}</legend>
        <label>
          {t('cdefa_source_label')}
          <EntitySearchField
            ariaLabel={t('cdefa_source_label')}
            dataTestId="cdefa-source-picker"
            items={sourceSearchItems}
            value={sourceUuid}
            onChange={setSourceUuid}
          />
        </label>
        {catalogIndex && catalogIndex.catalogCount === 0 && (
          <p data-testid="cdefa-no-catalogs-hint">
            {t('ci_no_catalogs_hint_pre')}{' '}
            <Link to="/catalogs">{t('landing_feature_catalogs')}</Link>
            {t('ci_no_catalogs_hint_mid')}{' '}
            <Link to="/library">{t('landing_feature_library')}</Link>.
          </p>
        )}
      </fieldset>

      {sourceEntry && (
        <fieldset>
          <legend>{t('cdefa_requirements_heading', { count: requirements.length })}</legend>
          <table className="control-requirements-table" data-testid="cdefa-requirements-table">
            <colgroup>
              <col className="control-requirements-col-control" />
              <col className="control-requirements-col-detail" />
            </colgroup>
            <tbody>
              {requirements.map((req, idx) => {
                const control = sourceEntry.controlsById.get(req.controlId);
                const hasParams = !!control?.params?.length;
                const showParams = paramsExpanded.isExpanded(req.uuid);
                return (
                  <tr
                    key={req.uuid}
                    data-testid="cdefa-requirement-row"
                    className={hasParams ? 'has-param-warning' : undefined}
                  >
                    <td>
                      {control && (
                        <ControlDisplay
                          control={control}
                          setParameters={req.setParameters}
                          viewerUrl={viewerHref(sourceEntry.libraryPath)}
                        />
                      )}
                      {hasParams && (
                        <div>
                          <button
                            type="button"
                            data-testid="cdefa-set-parameter-toggle"
                            aria-label={t('cdefa_set_parameter_toggle_aria', { controlId: req.controlId })}
                            aria-expanded={showParams}
                            onClick={() => paramsExpanded.toggle(req.uuid)}
                          >
                            λ {t('cdefa_set_parameter_button')}
                          </button>
                          {showParams && (
                            <div data-testid="cdefa-set-parameters">
                              {(req.setParameters ?? []).map((sp, spIdx) => (
                                <SetParameterRow
                                  key={spIdx}
                                  value={sp}
                                  paramOptions={control!.params!}
                                  onChange={(next) =>
                                    patchRequirement(idx, (r) => {
                                      r.setParameters![spIdx] = next;
                                    })
                                  }
                                  onRemove={() =>
                                    patchRequirement(idx, (r) => {
                                      r.setParameters!.splice(spIdx, 1);
                                    })
                                  }
                                />
                              ))}
                              <button
                                type="button"
                                data-testid="cdefa-add-set-parameter"
                                onClick={() =>
                                  patchRequirement(idx, (r) => {
                                    (r.setParameters ??= []).push({ paramId: '' });
                                  })
                                }
                              >
                                ➕ {t('ci_add_set_parameter')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <label>
                        {t('common_description')}
                        <MarkupEditor
                          dataTestId="cdefa-requirement-description"
                          ariaLabel={t('common_description')}
                          rows={4}
                          value={req.description ?? ''}
                          onChange={(v) =>
                            patchRequirement(idx, (r) => {
                              r.description = v || undefined;
                            })
                          }
                        />
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </fieldset>
      )}

      <button type="button" disabled={!canCreate || saving} onClick={() => void onCreate()} data-testid="cdefa-create">
        ✅ {t('cdefa_create_button')}
      </button>
    </main>
  );
}
