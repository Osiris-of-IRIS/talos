/**
 * Editor for a component's control-implementations → implemented-requirements → set-parameters.
 * Source-driven pickers (T-142): `source` picks a workspace catalog, `control-id` and
 * `set-parameter.param-id` are datalist-typeaheads seeded from the resolved catalog (manual entry
 * still allowed; origin-agnostic so T-034 library catalogs slot into the same lists). The full
 * ADR-0013 entity-search widget (T-036) can later replace the datalists. When the workspace has
 * zero catalogs, shows an info message linking to upload/library (T-161).
 * Decision IDs: ADR-0003, ADR-0013, ADR-0016, ADR-0012 (feature IMPL-001, T-101/T-142/T-161).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  catalogSourceOptions,
  controlIdsForSource,
  findCatalogEntry,
  paramsForControl,
  type CatalogIndex,
} from '@/data/catalogResolution';
import { useI18n } from '@/shared/i18n';
import type { Parameter } from '@/models/control';
import type {
  ControlImplementation,
  DefinedComponent,
  ImplementedRequirement,
  SetParameter,
} from '@/models/componentDefinition';

interface Props {
  value: DefinedComponent;
  onChange: (next: DefinedComponent) => void;
  /** Workspace catalog index for source/control/param pickers (T-142); null while loading. */
  catalogIndex?: CatalogIndex | null;
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function parseValues(raw: string): string[] | undefined {
  const vals = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return vals.length > 0 ? vals : undefined;
}

/**
 * One set-parameter row. Keeps the values text in local state so mid-word spaces/commas survive
 * typing; the parsed array is written to the model on change.
 */
function SetParameterRow({
  value,
  onChange,
  onRemove,
  paramOptions,
  datalistId,
}: {
  value: SetParameter;
  onChange: (next: SetParameter) => void;
  onRemove: () => void;
  paramOptions: Parameter[];
  datalistId: string;
}) {
  const { t } = useI18n();
  const [rawValues, setRawValues] = useState((value.values ?? []).join(', '));
  return (
    <div data-testid="set-parameter">
      <input
        aria-label={t('ci_param_id_aria')}
        data-testid="sp-param-id"
        list={datalistId}
        value={value.paramId}
        placeholder={t('ci_param_id_placeholder')}
        onChange={(e) => onChange({ ...value, paramId: e.target.value })}
      />
      <datalist id={datalistId}>
        {paramOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label ?? p.id}
          </option>
        ))}
      </datalist>
      <input
        aria-label={t('ci_param_values_aria')}
        data-testid="sp-values"
        value={rawValues}
        placeholder={t('ci_param_values_placeholder')}
        onChange={(e) => {
          setRawValues(e.target.value);
          onChange({ ...value, values: parseValues(e.target.value) });
        }}
      />
      <button type="button" aria-label={t('ci_remove_set_parameter')} onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

export function ControlImplementationsEditor({ value, onChange, catalogIndex }: Props) {
  const { t } = useI18n();
  const cis = value.controlImplementations ?? [];
  const sourceOptions = catalogIndex ? catalogSourceOptions(catalogIndex) : [];

  function update(mutator: (c: DefinedComponent) => void) {
    const next = structuredClone(value);
    mutator(next);
    onChange(next);
  }

  function addCi() {
    update((c) => {
      (c.controlImplementations ??= []).push({
        uuid: uuid(),
        source: '',
        description: '',
        implementedRequirements: [],
      } satisfies ControlImplementation);
    });
  }

  function addRequirement(ciIdx: number) {
    update((c) => {
      c.controlImplementations![ciIdx]!.implementedRequirements.push({
        uuid: uuid(),
        controlId: '',
      } satisfies ImplementedRequirement);
    });
  }

  return (
    <div data-testid="control-implementations">
      <strong>{t('ci_heading', { count: cis.length })}</strong>
      {cis.map((ci, ciIdx) => (
        <fieldset key={ci.uuid} data-testid="control-implementation">
          <legend>{t('ci_legend')}</legend>
          <label>
            {t('ci_source_label')}
            <input
              data-testid="ci-source"
              list={`source-options-${ci.uuid}`}
              value={ci.source}
              placeholder={t('ci_source_placeholder')}
              onChange={(e) => update((c) => (c.controlImplementations![ciIdx]!.source = e.target.value))}
            />
            <datalist id={`source-options-${ci.uuid}`}>
              {sourceOptions.map((o) => (
                <option key={o.uuid} value={o.ref}>
                  {o.title}
                </option>
              ))}
            </datalist>
            {catalogIndex &&
              (findCatalogEntry(catalogIndex, ci.source) ? (
                <small data-testid="ci-source-resolved">
                  {' '}
                  ✓ {findCatalogEntry(catalogIndex, ci.source)!.title}
                </small>
              ) : (
                ci.source && <small> {t('ci_source_unresolved')}</small>
              ))}
          </label>
          {catalogIndex && catalogIndex.catalogCount === 0 && (
            <p data-testid="no-catalogs-hint">
              {t('ci_no_catalogs_hint_pre')}{' '}
              <Link to="/catalogs">{t('landing_feature_catalogs')}</Link>
              {t('ci_no_catalogs_hint_mid')}{' '}
              <Link to="/library">{t('landing_feature_library')}</Link>.
            </p>
          )}
          <label>
            {t('common_description')}
            <textarea
              data-testid="ci-description"
              value={ci.description}
              onChange={(e) => update((c) => (c.controlImplementations![ciIdx]!.description = e.target.value))}
            />
          </label>

          <div>
            <em>{t('ci_requirements_heading', { count: ci.implementedRequirements.length })}</em>
            {ci.implementedRequirements.map((ir, irIdx) => {
              const paramOptions = catalogIndex
                ? paramsForControl(catalogIndex, ci.source, ir.controlId)
                : [];
              const controlIdOptions = catalogIndex ? controlIdsForSource(catalogIndex, ci.source) : [];
              return (
              <fieldset key={ir.uuid} data-testid="implemented-requirement">
                <label>
                  {t('ci_control_id_label')}
                  <input
                    data-testid="ir-control-id"
                    list={`controlids-${ir.uuid}`}
                    value={ir.controlId}
                    placeholder={t('ci_control_id_placeholder')}
                    onChange={(e) =>
                      update((c) => (c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.controlId = e.target.value))
                    }
                  />
                  <datalist id={`controlids-${ir.uuid}`}>
                    {controlIdOptions.map((id) => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                </label>
                <label>
                  {t('common_description')}
                  <textarea
                    data-testid="ir-description"
                    value={ir.description ?? ''}
                    onChange={(e) =>
                      update(
                        (c) =>
                          (c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.description =
                            e.target.value || undefined),
                      )
                    }
                  />
                </label>
                <label>
                  {t('md_remarks_label')}
                  <textarea
                    data-testid="ir-remarks"
                    value={ir.remarks ?? ''}
                    onChange={(e) =>
                      update(
                        (c) =>
                          (c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.remarks =
                            e.target.value || undefined),
                      )
                    }
                  />
                </label>

                <div data-testid="set-parameters">
                  <em>{t('ci_set_parameters_heading')}</em>
                  {(ir.setParameters ?? []).map((sp, spIdx) => (
                    <SetParameterRow
                      key={spIdx}
                      value={sp}
                      onChange={(next) =>
                        update(
                          (c) =>
                            (c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.setParameters![spIdx] = next),
                        )
                      }
                      onRemove={() =>
                        update((c) =>
                          c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.setParameters!.splice(spIdx, 1),
                        )
                      }
                      paramOptions={paramOptions}
                      datalistId={`params-${ir.uuid}`}
                    />
                  ))}
                  <button
                    type="button"
                    data-testid="add-set-parameter"
                    onClick={() =>
                      update((c) => {
                        const req = c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!;
                        (req.setParameters ??= []).push({ paramId: '' });
                      })
                    }
                  >
                    ➕ {t('ci_add_set_parameter')}
                  </button>
                </div>

                <button
                  type="button"
                  aria-label={t('ci_remove_requirement_aria')}
                  onClick={() =>
                    update((c) => c.controlImplementations![ciIdx]!.implementedRequirements.splice(irIdx, 1))
                  }
                >
                  🗑️ {t('ci_remove_requirement_button')}
                </button>
              </fieldset>
              );
            })}
            <button type="button" data-testid="add-requirement" onClick={() => addRequirement(ciIdx)}>
              ➕ {t('ci_add_requirement')}
            </button>
          </div>

          <button
            type="button"
            aria-label={t('ci_remove_ci_aria')}
            onClick={() => update((c) => c.controlImplementations!.splice(ciIdx, 1))}
          >
            🗑️ {t('ci_remove_ci_button')}
          </button>
        </fieldset>
      ))}
      <button type="button" data-testid="add-control-implementation" onClick={addCi}>
        ➕ {t('ci_add_ci')}
      </button>
    </div>
  );
}
