/**
 * Editor for a component's control-implementations → implemented-requirements → set-parameters.
 * Source-driven pickers (T-142): `source` picks a workspace catalog, `control-id` and
 * `set-parameter.param-id` are entity-search typeaheads (ADR-0013, `EntitySearchField` in `items`
 * mode) seeded from the resolved catalog (manual entry still allowed; origin-agnostic so T-034
 * library catalogs slot into the same lists). When the workspace has zero catalogs, shows an info
 * message linking to upload/library (T-161).
 *
 * Source resolution is back-matter-mediated (item 5, ADR-0024): picking a catalog creates/reuses
 * a back-matter resource identifying it (`onEnsureCatalogSource`) instead of writing the
 * catalog's own uuid directly into `source`. Control-id suggestions show the resolved control's
 * headline, not a raw id/uuid (item 7, ADR-0024). All pickers use `<EntitySearchField>` so
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
  resolveControlForSource,
  sourceToCatalogUuid,
  type CatalogIndex,
} from '@/data/catalogResolution';
import { useI18n } from '@/shared/i18n';
import { MarkupEditor } from '@/shared/MarkupEditor';
import { EntitySearchField } from '@/shared/EntitySearchField';
import type { SearchItem } from '@/shared/useEntitySearch';
import { ControlDisplay } from '@/features/shared/ControlDisplay';
import { viewerHref } from '@/config';
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
}: {
  value: SetParameter;
  onChange: (next: SetParameter) => void;
  onRemove: () => void;
  paramOptions: Parameter[];
}) {
  const { t } = useI18n();
  const [rawValues, setRawValues] = useState((value.values ?? []).join(', '));
  // Item 4 (UI feedback): once a choice-constrained param is picked, values must come from its
  // defined choices — no free text — so a selection can never drift out of sync with the control.
  const selectedParam = paramOptions.find((p) => p.id === value.paramId);
  const choices = selectedParam?.select?.choice;
  const paramSearchItems: SearchItem[] = paramOptions.map((p) => ({ id: p.id, title: p.label ?? p.id }));

  function toggleChoice(choice: string) {
    const set = new Set(value.values ?? []);
    if (set.has(choice)) set.delete(choice);
    else set.add(choice);
    onChange({ ...value, values: set.size > 0 ? [...set] : undefined });
  }

  return (
    <div data-testid="set-parameter">
      <EntitySearchField
        ariaLabel={t('ci_param_id_aria')}
        dataTestId="sp-param-id"
        placeholder={t('ci_param_id_placeholder')}
        value={value.paramId}
        items={paramSearchItems}
        onChange={(v) => onChange({ ...value, paramId: v })}
      />
      {choices ? (
        selectedParam!.select!.howMany === 'one-or-more' ? (
          <fieldset data-testid="sp-values-choice">
            <legend>{t('ci_param_choice_legend')}</legend>
            {choices.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={(value.values ?? []).includes(c)}
                  onChange={() => toggleChoice(c)}
                />
                {c}
              </label>
            ))}
          </fieldset>
        ) : (
          <select
            data-testid="sp-values-select"
            aria-label={t('ci_param_values_aria')}
            value={value.values?.[0] ?? ''}
            onChange={(e) => onChange({ ...value, values: e.target.value ? [e.target.value] : undefined })}
          >
            <option value="">{t('ci_param_choice_placeholder')}</option>
            {choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )
      ) : (
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
      )}
      <button type="button" aria-label={t('ci_remove_set_parameter')} onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

export function ControlImplementationsEditor({ value, onChange, catalogIndex, backMatter, onEnsureCatalogSource }: Props) {
  const { t } = useI18n();
  const cis = value.controlImplementations ?? [];
  const sourceSearchItems: SearchItem[] = catalogIndex
    ? catalogSourceOptions(catalogIndex).map((o) => ({ id: o.ref, title: o.title }))
    : [];

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
            <EntitySearchField
              dataTestId="ci-source"
              value={ci.source}
              placeholder={t('ci_source_placeholder')}
              items={sourceSearchItems}
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
              const controlIdSearchItems: SearchItem[] = catalogIndex
                ? controlIdOptionsForSource(catalogIndex, ci.source, backMatter).map((o) => ({
                    id: o.value,
                    title: o.label,
                  }))
                : [];
              // Item 3 (UI feedback): show the actual control content next to the editable
              // fields, 40/60 like the read-only viewer (ADR-0028), so an author can see whether
              // the description/remarks actually fit the control they picked.
              const resolvedControl = catalogIndex
                ? resolveControlForSource(catalogIndex, ci.source, ir.controlId, backMatter)
                : undefined;
              return (
              <fieldset key={ir.uuid} data-testid="implemented-requirement">
                <label>
                  {t('ci_control_id_label')}
                  <EntitySearchField
                    dataTestId="ir-control-id"
                    value={ir.controlId}
                    placeholder={t('ci_control_id_placeholder')}
                    items={controlIdSearchItems}
                    onChange={(v) =>
                      update((c) => (c.controlImplementations![ciIdx]!.implementedRequirements[irIdx]!.controlId = v))
                    }
                  />
                </label>

                <table className="control-requirements-table" data-testid="ir-requirements-table">
                  <colgroup>
                    <col className="control-requirements-col-control" />
                    <col className="control-requirements-col-detail" />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td>
                        {resolvedControl ? (
                          <ControlDisplay
                            control={resolvedControl.control}
                            setParameters={ir.setParameters}
                            viewerUrl={viewerHref(resolvedControl.catalogLibraryPath)}
                          />
                        ) : (
                          <em data-testid="ir-control-unresolved-hint">{t('ci_control_unresolved_hint')}</em>
                        )}
                      </td>
                      <td>
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
                      </td>
                    </tr>
                  </tbody>
                </table>

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
