/**
 * Editor for a component's control-implementations → implemented-requirements → set-parameters.
 * Source-driven pickers (T-142): `source` picks a workspace catalog, `control-id` and
 * `set-parameter.param-id` are datalist-typeaheads seeded from the resolved catalog (manual entry
 * still allowed; origin-agnostic so T-034 library catalogs slot into the same lists). The full
 * ADR-0013 entity-search widget (T-036) can later replace the datalists. When the workspace has
 * zero catalogs, shows an info message linking to upload/library (T-161).
 *
 * Source resolution is back-matter-mediated (item 5, ADR-0024): picking a catalog creates/reuses
 * a back-matter resource identifying it (`onEnsureCatalogSource`) instead of writing the
 * catalog's own uuid directly into `source`. Control-id suggestions show the resolved control's
 * headline, not a raw id/uuid (item 7, ADR-0024). All datalist inputs use `<DatalistInput>` so
 * focusing a pre-filled field offers every option, not just the current value (item 3, ADR-0024).
 * Decision IDs: ADR-0003, ADR-0013, ADR-0016, ADR-0012, ADR-0024 (feature IMPL-001, T-101/T-142/T-161).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  catalogSourceOptions,
  controlIdOptionsForSource,
  findCatalogEntry,
  paramsForControl,
  sourceToCatalogUuid,
  type CatalogIndex,
} from '@/data/catalogResolution';
import { useI18n } from '@/shared/i18n';
import { MarkupEditor } from '@/shared/MarkupEditor';
import { DatalistInput } from '@/shared/DatalistInput';
import type { Parameter } from '@/models/control';
import type { BackMatter } from '@/models/oscalBase';
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
  /** The owning artifact's back-matter, for source resolution (item 5, ADR-0024). */
  backMatter?: BackMatter;
  /** Ensures a back-matter resource exists for a picked catalog and returns `#<resourceUuid>`. */
  onEnsureCatalogSource?: (catalogUuid: string, catalogTitle: string) => string;
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
  listId,
}: {
  value: SetParameter;
  onChange: (next: SetParameter) => void;
  onRemove: () => void;
  paramOptions: Parameter[];
  listId: string;
}) {
  const { t } = useI18n();
  const [rawValues, setRawValues] = useState((value.values ?? []).join(', '));
  return (
    <div data-testid="set-parameter">
      <DatalistInput
        ariaLabel={t('ci_param_id_aria')}
        dataTestId="sp-param-id"
        listId={listId}
        placeholder={t('ci_param_id_placeholder')}
        value={value.paramId}
        options={paramOptions.map((p) => ({ value: p.id, label: p.label ?? p.id }))}
        onChange={(v) => onChange({ ...value, paramId: v })}
      />
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

export function ControlImplementationsEditor({ value, onChange, catalogIndex, backMatter, onEnsureCatalogSource }: Props) {
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

  function setSource(ciIdx: number, typed: string) {
    // If the typed/picked value directly names a workspace catalog's own uuid, transparently
    // "upgrade" it to a proper back-matter-mediated reference (item 5) instead of storing the
    // catalog uuid directly; free text and already-resolved refs pass through unchanged.
    const catalogUuid = sourceToCatalogUuid(typed);
    const matched = catalogIndex?.catalogs.find((c) => c.uuid === catalogUuid);
    const resolved = matched && onEnsureCatalogSource ? onEnsureCatalogSource(matched.uuid, matched.title) : typed;
    update((c) => (c.controlImplementations![ciIdx]!.source = resolved));
  }

  return (
    <div data-testid="control-implementations">
      <strong>{t('ci_heading', { count: cis.length })}</strong>
      {cis.map((ci, ciIdx) => {
        const resolvedSource = catalogIndex ? findCatalogEntry(catalogIndex, ci.source, backMatter) : undefined;
        return (
        <fieldset key={ci.uuid} data-testid="control-implementation">
          <legend>{t('ci_legend')}</legend>
          <label>
            {t('ci_source_label')}
            <DatalistInput
              dataTestId="ci-source"
              listId={`source-options-${ci.uuid}`}
              value={ci.source}
              placeholder={t('ci_source_placeholder')}
              options={sourceOptions.map((o) => ({ value: o.ref, label: o.title }))}
              onChange={(v) => setSource(ciIdx, v)}
            />
            {catalogIndex &&
              (resolvedSource ? (
                <small data-testid="ci-source-resolved"> ✓ {resolvedSource.title}</small>
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
            <MarkupEditor
              dataTestId="ci-description"
              ariaLabel={t('common_description')}
              rows={5}
              value={ci.description}
              onChange={(v) => update((c) => (c.controlImplementations![ciIdx]!.description = v))}
            />
          </label>

          <div>
            <em>{t('ci_requirements_heading', { count: ci.implementedRequirements.length })}</em>
            {ci.implementedRequirements.map((ir, irIdx) => {
              const paramOptions = catalogIndex
                ? paramsForControl(catalogIndex, ci.source, ir.controlId, backMatter)
                : [];
              const controlIdOptions = catalogIndex
                ? controlIdOptionsForSource(catalogIndex, ci.source, backMatter)
                : [];
              return (
              <fieldset key={ir.uuid} data-testid="implemented-requirement">
                <label>
                  {t('ci_control_id_label')}
                  <DatalistInput
                    dataTestId="ir-control-id"
                    listId={`controlids-${ir.uuid}`}
                    value={ir.controlId}
                    placeholder={t('ci_control_id_placeholder')}
                    options={controlIdOptions}
                    onChange={(v) =>
                      update((c) => (c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.controlId = v))
                    }
                  />
                </label>
                <label>
                  {t('common_description')}
                  <MarkupEditor
                    dataTestId="ir-description"
                    ariaLabel={t('common_description')}
                    rows={5}
                    value={ir.description ?? ''}
                    onChange={(v) =>
                      update(
                        (c) =>
                          (c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.description =
                            v || undefined),
                      )
                    }
                  />
                </label>
                <label>
                  {t('md_remarks_label')}
                  <MarkupEditor
                    dataTestId="ir-remarks"
                    ariaLabel={t('md_remarks_label')}
                    rows={5}
                    value={ir.remarks ?? ''}
                    onChange={(v) =>
                      update(
                        (c) =>
                          (c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.remarks =
                            v || undefined),
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
                      listId={`params-${ir.uuid}`}
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
        );
      })}
      <button type="button" data-testid="add-control-implementation" onClick={addCi}>
        ➕ {t('ci_add_ci')}
      </button>
    </div>
  );
}
