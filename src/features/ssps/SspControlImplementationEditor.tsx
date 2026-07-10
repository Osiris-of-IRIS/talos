/**
 * SSP control-implementation editor: implemented-requirements, each with by-components that
 * reference the SSP's own (imported) system-implementation components — never free text or an
 * external component-definition uuid directly, so every by-component resolves. Deferred:
 * statements, set-parameters (not requested for this pass — see MVP feedback). Control-id options
 * are offered from all workspace catalogs (unscoped): unlike component-definitions, an SSP has no
 * per-requirement "source" — its controls come from `import-profile`, and profiles are deferred
 * (ADR-0017), so a single unscoped picker is used instead of a source-scoped one (T-142).
 * Decision IDs: ADR-0003, ADR-0016, ADR-0017, ADR-0023.
 */
import { useI18n } from '@/shared/i18n';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { MarkupEditor } from '@/shared/MarkupEditor';
import { EntitySearchField } from '@/shared/EntitySearchField';
import type { SearchItem } from '@/shared/useEntitySearch';
import {
  getImplementationStatus,
  setImplementationStatus,
  findMatchingRequirementDescription,
  IMPLEMENTATION_STATUS_VALUES,
} from './componentImport';
import { allControlIdOptions, type CatalogIndex } from '@/data/catalogResolution';
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { SystemComponent, SspControlImplementation, SspImplementedRequirement, ByComponent } from '@/models/ssp';

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

interface Props {
  value: SspControlImplementation;
  onChange: (next: SspControlImplementation) => void;
  systemComponents: SystemComponent[];
  catalogIndex: CatalogIndex | null;
  /** For prefilling a by-component's description from its source component (item 3, ADR-0028). */
  workspaceComponentDefs: StoredArtifact<ComponentDefinition>[];
}

export function SspControlImplementationEditor({
  value,
  onChange,
  systemComponents,
  catalogIndex,
  workspaceComponentDefs,
}: Props) {
  const { t } = useI18n();
  const expanded = useExpandedSet();

  function patch(mutator: (draft: SspControlImplementation) => void) {
    const draft = structuredClone(value);
    mutator(draft);
    onChange(draft);
  }

  function addRequirement() {
    const ir: SspImplementedRequirement = { uuid: uuid(), controlId: '', byComponents: [] };
    patch((d) => d.implementedRequirements.push(ir));
    expanded.expand(ir.uuid);
  }

  function removeRequirement(idx: number) {
    const removedUuid = value.implementedRequirements[idx]!.uuid;
    patch((d) => d.implementedRequirements.splice(idx, 1));
    expanded.collapse(removedUuid);
  }

  function patchRequirement(idx: number, mutator: (ir: SspImplementedRequirement) => void) {
    patch((d) => mutator(d.implementedRequirements[idx]!));
  }

  function addByComponent(irIdx: number) {
    const bc: ByComponent = { componentUuid: '', uuid: uuid(), description: '' };
    patch((d) => (d.implementedRequirements[irIdx]!.byComponents ??= []).push(bc));
  }

  function removeByComponent(irIdx: number, bcIdx: number) {
    patch((d) => d.implementedRequirements[irIdx]!.byComponents!.splice(bcIdx, 1));
  }

  function updateByComponent(irIdx: number, bcIdx: number, patchFn: (bc: ByComponent) => ByComponent) {
    patch((d) => {
      const bcs = d.implementedRequirements[irIdx]!.byComponents!;
      bcs[bcIdx] = patchFn(bcs[bcIdx]!);
    });
  }

  const controlIdSearchItems: SearchItem[] = catalogIndex
    ? allControlIdOptions(catalogIndex).map((o) => ({ id: o.value, title: o.label }))
    : [];

  return (
    <div data-testid="ssp-control-implementation-editor">
      <label>
        {t('common_description')}
        <MarkupEditor
          dataTestId="ci-description"
          ariaLabel={t('common_description')}
          rows={5}
          value={value.description}
          onChange={(v) => patch((d) => (d.description = v))}
        />
      </label>

      <div data-testid="ci-requirements-list">
        {value.implementedRequirements.map((ir, irIdx) => {
          const isOpen = expanded.isExpanded(ir.uuid);
          return (
            <div key={ir.uuid} className="collapsible-section" data-testid="ir-row">
              <button
                type="button"
                className="collapsible-toggle"
                data-testid="ir-summary"
                aria-expanded={isOpen}
                onClick={() => expanded.toggle(ir.uuid)}
              >
                {isOpen ? '▾' : '▸'} {ir.controlId || t('ci_untitled_requirement')}{' '}
                <small>· {t('ssp_by_components_count', { count: (ir.byComponents ?? []).length })}</small>
              </button>
              {isOpen && (
                <div className="collapsible-body" data-testid="ir-body">
                  <label>
                    {t('ci_control_id_label')}
                    <EntitySearchField
                      dataTestId="ir-control-id"
                      value={ir.controlId}
                      items={controlIdSearchItems}
                      onChange={(v) => patchRequirement(irIdx, (d) => (d.controlId = v))}
                    />
                  </label>
                  <label>
                    {t('md_remarks_label')}
                    <MarkupEditor
                      dataTestId="ir-remarks"
                      ariaLabel={t('md_remarks_label')}
                      rows={5}
                      value={ir.remarks ?? ''}
                      onChange={(v) => patchRequirement(irIdx, (d) => (d.remarks = v || undefined))}
                    />
                  </label>

                  <div data-testid="ir-by-components">
                    <strong>{t('ci_by_components_heading')}</strong>
                    {(ir.byComponents ?? []).map((bc, bcIdx) => (
                      <div key={bc.uuid} className="collapsible-section" data-testid="bc-row">
                        <select
                          data-testid="bc-component-select"
                          aria-label={t('bc_component_label')}
                          value={bc.componentUuid}
                          onChange={(e) =>
                            updateByComponent(irIdx, bcIdx, (b) => {
                              const componentUuid = e.target.value;
                              // Prefill from the source component's own matching requirement
                              // (item 3, ADR-0028) — only when the description is still empty, so
                              // a description the user already typed is never silently overwritten.
                              if (b.description) return { ...b, componentUuid };
                              const selected = systemComponents.find((c) => c.uuid === componentUuid);
                              const prefill = selected
                                ? findMatchingRequirementDescription(selected, ir.controlId, workspaceComponentDefs)
                                : undefined;
                              return prefill ? { ...b, componentUuid, description: prefill } : { ...b, componentUuid };
                            })
                          }
                        >
                          <option value="">{t('bc_component_placeholder')}</option>
                          {systemComponents.map((c) => (
                            <option key={c.uuid} value={c.uuid}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                        <MarkupEditor
                          dataTestId="bc-description"
                          ariaLabel={t('common_description')}
                          rows={5}
                          value={bc.description}
                          onChange={(v) => updateByComponent(irIdx, bcIdx, (b) => ({ ...b, description: v }))}
                        />
                        <select
                          data-testid="bc-status"
                          aria-label={t('bc_status_label')}
                          value={getImplementationStatus(bc) ?? ''}
                          onChange={(e) =>
                            updateByComponent(irIdx, bcIdx, (b) =>
                              e.target.value
                                ? setImplementationStatus(b, e.target.value as (typeof IMPLEMENTATION_STATUS_VALUES)[number])
                                : b,
                            )
                          }
                        >
                          <option value="">{t('bc_status_placeholder')}</option>
                          {IMPLEMENTATION_STATUS_VALUES.map((s) => (
                            <option key={s} value={s}>
                              {t(`implementation_status_${s}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          aria-label={t('ci_remove_by_component_aria')}
                          onClick={() => removeByComponent(irIdx, bcIdx)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button type="button" data-testid="ci-add-by-component" onClick={() => addByComponent(irIdx)}>
                      ➕ {t('ci_add_by_component')}
                    </button>
                  </div>

                  <button type="button" data-testid="ir-remove" onClick={() => removeRequirement(irIdx)}>
                    🗑️ {t('ci_remove_requirement_button')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" data-testid="ci-add-requirement" onClick={addRequirement}>
        ➕ {t('ci_add_requirement')}
      </button>
    </div>
  );
}
