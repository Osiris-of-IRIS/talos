/**
 * Editor for a component's control-implementations → implemented-requirements → set-parameters.
 * Source-driven pickers (T-142): `source` picks a workspace catalog, `control-id` and
 * `set-parameter.param-id` are datalist-typeaheads seeded from the resolved catalog (manual entry
 * still allowed; origin-agnostic so T-034 library catalogs slot into the same lists). The full
 * ADR-0013 entity-search widget (T-036) can later replace the datalists.
 * Decision IDs: ADR-0003, ADR-0013, ADR-0016 (feature IMPL-001, T-101/T-142).
 */
import { useState } from 'react';
import {
  catalogSourceOptions,
  controlIdsForSource,
  findCatalogEntry,
  paramsForControl,
  type CatalogIndex,
} from '@/data/catalogResolution';
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
  const [rawValues, setRawValues] = useState((value.values ?? []).join(', '));
  return (
    <div data-testid="set-parameter">
      <input
        aria-label="Parameter id"
        data-testid="sp-param-id"
        list={datalistId}
        value={value.paramId}
        placeholder="param id (pick from source catalog)"
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
        aria-label="Parameter values"
        data-testid="sp-values"
        value={rawValues}
        placeholder="values, comma-separated"
        onChange={(e) => {
          setRawValues(e.target.value);
          onChange({ ...value, values: parseValues(e.target.value) });
        }}
      />
      <button type="button" aria-label="Remove set-parameter" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

export function ControlImplementationsEditor({ value, onChange, catalogIndex }: Props) {
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
      <strong>Control implementations ({cis.length})</strong>
      {cis.map((ci, ciIdx) => (
        <fieldset key={ci.uuid} data-testid="control-implementation">
          <legend>Control implementation</legend>
          <label>
            Source (pick a workspace catalog, or enter a catalog/profile href)
            <input
              data-testid="ci-source"
              list={`source-options-${ci.uuid}`}
              value={ci.source}
              placeholder="#<uuid> or catalog/profile reference"
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
                ci.source && <small> (unresolved — free-text href)</small>
              ))}
          </label>
          <label>
            Description
            <textarea
              data-testid="ci-description"
              value={ci.description}
              onChange={(e) => update((c) => (c.controlImplementations![ciIdx]!.description = e.target.value))}
            />
          </label>

          <div>
            <em>Implemented requirements ({ci.implementedRequirements.length})</em>
            {ci.implementedRequirements.map((ir, irIdx) => {
              const paramOptions = catalogIndex
                ? paramsForControl(catalogIndex, ci.source, ir.controlId)
                : [];
              const controlIdOptions = catalogIndex ? controlIdsForSource(catalogIndex, ci.source) : [];
              return (
              <fieldset key={ir.uuid} data-testid="implemented-requirement">
                <label>
                  Control ID
                  <input
                    data-testid="ir-control-id"
                    list={`controlids-${ir.uuid}`}
                    value={ir.controlId}
                    placeholder="e.g. ASST.1.1.2"
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
                  Description
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
                  Remarks
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
                  <em>Set parameters</em>
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
                    ➕ Set parameter
                  </button>
                </div>

                <button
                  type="button"
                  aria-label="Remove implemented requirement"
                  onClick={() =>
                    update((c) => c.controlImplementations![ciIdx]!.implementedRequirements.splice(irIdx, 1))
                  }
                >
                  🗑️ Remove requirement
                </button>
              </fieldset>
              );
            })}
            <button type="button" data-testid="add-requirement" onClick={() => addRequirement(ciIdx)}>
              ➕ Add requirement
            </button>
          </div>

          <button
            type="button"
            aria-label="Remove control implementation"
            onClick={() => update((c) => c.controlImplementations!.splice(ciIdx, 1))}
          >
            🗑️ Remove control implementation
          </button>
        </fieldset>
      ))}
      <button type="button" data-testid="add-control-implementation" onClick={addCi}>
        ➕ Add control implementation
      </button>
    </div>
  );
}
