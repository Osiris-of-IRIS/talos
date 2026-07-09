/**
 * System-implementation editor: components are only ever imported (copied) from workspace
 * component-definitions, never authored from scratch (supervisor decision) — this keeps
 * by-components referencing real, catalogued components. Each import is tracked (provenance +
 * content-hash snapshot props, ADR-0023) so drift from the source is surfaced as a Δ staleness
 * badge (ADR-0011), with a one-click refresh. Deferred: users, inventory-items.
 * Decision IDs: ADR-0003, ADR-0017, ADR-0023.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { MarkupEditor } from '@/shared/MarkupEditor';
import { DatalistInput } from '@/shared/DatalistInput';
import {
  importComponentFromDefinition,
  refreshComponentFromSource,
  componentStaleness,
  getComponentProvenance,
} from './componentImport';
import { SYSTEM_STATUS_STATES } from '@/models/systemStatus';
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { SystemComponent, SystemImplementation } from '@/models/ssp';

const STATUS_OPTIONS = SYSTEM_STATUS_STATES.map((s) => ({ value: s.value, label: s.description }));

interface Props {
  value: SystemImplementation;
  onChange: (next: SystemImplementation) => void;
  /** Fired (in addition to onChange) when a component is removed, so the parent can cascade-clean by-components. */
  onComponentRemoved?: (componentUuid: string) => void;
  workspaceComponentDefs: StoredArtifact<ComponentDefinition>[];
}

export function SystemImplementationEditor({
  value,
  onChange,
  onComponentRemoved,
  workspaceComponentDefs,
}: Props) {
  const { t } = useI18n();
  const expanded = useExpandedSet();
  const [selectedCdUuid, setSelectedCdUuid] = useState('');
  const [selectedComponentUuid, setSelectedComponentUuid] = useState('');

  function patch(mutator: (draft: SystemImplementation) => void) {
    const draft = structuredClone(value);
    mutator(draft);
    onChange(draft);
  }

  const selectedCd = workspaceComponentDefs.find((r) => r.uuid === selectedCdUuid);
  const importableComponents = selectedCd?.artifact.components ?? [];

  function doImport() {
    const comp = importableComponents.find((c) => c.uuid === selectedComponentUuid);
    if (!selectedCd || !comp) return;
    const sc = importComponentFromDefinition(selectedCd.uuid, comp);
    patch((d) => {
      d.components.push(sc);
    });
    expanded.expand(sc.uuid);
    setSelectedComponentUuid('');
  }

  function removeComponent(uuid: string) {
    patch((d) => {
      d.components = d.components.filter((c) => c.uuid !== uuid);
    });
    expanded.collapse(uuid);
    onComponentRemoved?.(uuid);
  }

  function refreshComponent(idx: number) {
    const sc = value.components[idx]!;
    const prov = getComponentProvenance(sc);
    const cd = workspaceComponentDefs.find((r) => r.uuid === prov?.componentDefinitionUuid);
    const source = cd?.artifact.components?.find((c) => c.uuid === prov?.componentUuid);
    if (!source) return;
    patch((d) => {
      d.components[idx] = refreshComponentFromSource(sc, source);
    });
  }

  function patchComponent(idx: number, mutator: (c: SystemComponent) => void) {
    patch((d) => mutator(d.components[idx]!));
  }

  return (
    <div data-testid="system-implementation-editor">
      <fieldset>
        <legend>{t('si_import_legend')}</legend>
        {workspaceComponentDefs.length === 0 ? (
          <p data-testid="si-no-component-defs-hint">
            {t('si_no_component_defs_pre')}{' '}
            <Link to="/component-definitions">{t('landing_feature_component_definitions')}</Link>.
          </p>
        ) : (
          <>
            <select
              data-testid="si-cd-select"
              aria-label={t('si_cd_select_label')}
              value={selectedCdUuid}
              onChange={(e) => {
                setSelectedCdUuid(e.target.value);
                setSelectedComponentUuid('');
              }}
            >
              <option value="">{t('si_cd_select_placeholder')}</option>
              {workspaceComponentDefs.map((r) => (
                <option key={r.uuid} value={r.uuid}>
                  {r.artifact.metadata.title}
                </option>
              ))}
            </select>
            <select
              data-testid="si-component-select"
              aria-label={t('si_component_select_label')}
              value={selectedComponentUuid}
              onChange={(e) => setSelectedComponentUuid(e.target.value)}
              disabled={!selectedCd}
            >
              <option value="">{t('si_component_select_placeholder')}</option>
              {importableComponents.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="si-import"
              disabled={!selectedCdUuid || !selectedComponentUuid}
              onClick={doImport}
            >
              ⭳ {t('si_import_button')}
            </button>
          </>
        )}
      </fieldset>

      <div data-testid="si-components-list">
        {value.components.map((c, idx) => {
          const isOpen = expanded.isExpanded(c.uuid);
          const staleness = componentStaleness(c, workspaceComponentDefs);
          return (
            <div key={c.uuid} className="collapsible-section" data-testid="si-component">
              <button
                type="button"
                className="collapsible-toggle"
                data-testid="si-component-summary"
                aria-expanded={isOpen}
                onClick={() => expanded.toggle(c.uuid)}
              >
                {isOpen ? '▾' : '▸'} {c.title} <small>[{c.type}]</small>
                {staleness === 'stale' && (
                  <span data-testid="si-component-stale-badge" title={t('si_stale_title')}>
                    Δ {t('si_stale_label')}
                  </span>
                )}
                {staleness === 'missing' && (
                  <span data-testid="si-component-stale-badge" title={t('si_missing_title')}>
                    Δ {t('si_missing_label')}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="collapsible-body" data-testid="si-component-body">
                  <label>
                    {t('common_description')}
                    <MarkupEditor
                      dataTestId="si-component-description"
                      ariaLabel={t('common_description')}
                      rows={5}
                      value={c.description}
                      onChange={(v) => patchComponent(idx, (cc) => (cc.description = v))}
                    />
                  </label>
                  <label>
                    {t('sc_status_label')}
                    <DatalistInput
                      dataTestId="si-component-status"
                      listId={`system-component-status-options-${c.uuid}`}
                      options={STATUS_OPTIONS}
                      value={c.status.state}
                      onChange={(v) => patchComponent(idx, (cc) => (cc.status.state = v))}
                    />
                  </label>
                  {staleness === 'stale' && (
                    <button type="button" data-testid="si-refresh-component" onClick={() => refreshComponent(idx)}>
                      {t('si_refresh_button')}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="si-remove-component"
                    aria-label={t('si_remove_component_aria', { title: c.title })}
                    onClick={() => removeComponent(c.uuid)}
                  >
                    🗑️ {t('si_remove_component_button')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
