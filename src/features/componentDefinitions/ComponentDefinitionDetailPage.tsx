// Component-definition detail (read view). Decision IDs: ADR-0003, ADR-0009, ADR-0008 (IMPL-001).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { downloadArtifact } from '@/data/fileIo';
import { MarkupView } from '@/shared/MarkupView';
import { ControlDisplay } from '@/features/shared/ControlDisplay';
import { useCatalogIndex } from '@/features/shared/useCatalogIndex';
import { resolveControl } from '@/data/catalogResolution';
import { viewerHref } from '@/config';
import { useI18n } from '@/shared/i18n';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { useWorkspaceComponentDefinitions } from '@/features/shared/useWorkspaceComponentDefinitions';
import { buildImportTree } from '@/data/componentImportResolution';
import { ImportTreeView } from './ImportTreeView';
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition, DefinedComponent } from '@/models/componentDefinition';

function requirementCount(c: DefinedComponent): number {
  return (c.controlImplementations ?? []).reduce((sum, ci) => sum + ci.implementedRequirements.length, 0);
}

export function ComponentDefinitionDetailPage() {
  const { uuid = '' } = useParams();
  const { t } = useI18n();
  const catalogIndex = useCatalogIndex();
  const [record, setRecord] = useState<StoredArtifact<ComponentDefinition> | null | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);
  // Every component starts collapsed (item 3): a scannable list first, full detail on click.
  const expanded = useExpandedSet();
  const workspaceComponentDefs = useWorkspaceComponentDefinitions();

  function onDownload(r: StoredArtifact<ComponentDefinition>) {
    try {
      setExportError(null);
      downloadArtifact(r);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let active = true;
    void ArtifactRepository.forType<ComponentDefinition>('componentDefinition')
      .get(uuid)
      .then((r) => {
        if (active) setRecord(r ?? null);
      });
    return () => {
      active = false;
    };
  }, [uuid]);

  if (record === undefined) return <main>{t('common_loading')}</main>;
  if (record === null) {
    return (
      <main>
        <p>
          <Link to="/component-definitions">← {t('landing_feature_component_definitions')}</Link>
        </p>
        <p role="alert" data-testid="compdef-not-found">{t('cdef_not_found')}</p>
      </main>
    );
  }

  const cd = record.artifact;
  const importTree = buildImportTree(record, workspaceComponentDefs);
  return (
    <main data-testid="compdef-detail">
      <p>
        <Link to="/component-definitions">← {t('landing_feature_component_definitions')}</Link>
      </p>
      <h1>
        🧩 <MarkupView value={cd.metadata.title} label={t('cdef_field_title')} />
      </h1>
      <p>
        <small>
          uuid {record.uuid} · v{cd.metadata.version} · OSCAL {cd.metadata.oscalVersion} · {record.origin}
        </small>
      </p>
      {record.origin !== 'library' && (
        <Link to={`/component-definitions/${record.uuid}/edit`} data-testid="compdef-edit">
          ✎ {t('common_edit')}
        </Link>
      )}{' '}
      <button type="button" onClick={() => onDownload(record)}>
        ⭳ {t('common_download')}
      </button>
      {exportError && (
        <p role="alert" data-testid="compdef-export-error" style={{ color: 'var(--color-error, #cf222e)' }}>
          ⚠️ {exportError}
        </p>
      )}

      {importTree.length > 0 && (
        <section data-testid="cdef-imported-definitions">
          <h2>{t('cdef_imported_definitions_heading', { count: importTree.length })}</h2>
          <ImportTreeView nodes={importTree} />
        </section>
      )}

      <h2>{t('compdef_components_count', { count: cd.components?.length ?? 0 })}</h2>
      {cd.components?.map((c) => {
        const isOpen = expanded.isExpanded(c.uuid);
        return (
        <section key={c.uuid} className="collapsible-section" data-testid="compdef-component">
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
            <small>· {t('cdef_component_requirements_count', { count: requirementCount(c) })}</small>
          </button>
          {isOpen && (
            <div className="collapsible-body" data-testid="compdef-component-body">
              <h3>
                <MarkupView value={c.title} label={t('cdef_field_component_title')} /> <small>[{c.type}]</small>
              </h3>
              <MarkupView value={c.description} multiline label={t('cdef_field_component_description')} />
              {c.controlImplementations?.map((ci) => (
                <div key={ci.uuid}>
                  <h4>{t('cdef_control_implementation_heading')}</h4>
                  <MarkupView value={ci.description} multiline label={t('cdef_field_ci_description')} />
                  <table className="control-requirements-table" data-testid="compdef-requirements-table">
                    <colgroup>
                      <col className="control-requirements-col-control" />
                      <col className="control-requirements-col-detail" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{t('cdef_requirements_col_control')}</th>
                        <th>{t('cdef_requirements_col_description')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ci.implementedRequirements.map((ir) => {
                        const resolved = catalogIndex ? resolveControl(catalogIndex, ir.controlId) : undefined;
                        return (
                          <tr key={ir.uuid} data-testid="compdef-requirement">
                            <td>
                              {resolved ? (
                                <ControlDisplay
                                  control={resolved.control}
                                  setParameters={ir.setParameters}
                                  viewerUrl={viewerHref(resolved.catalogLibraryPath)}
                                />
                              ) : (
                                <code data-testid="compdef-requirement-unresolved">{ir.controlId}</code>
                              )}
                            </td>
                            <td>
                              {ir.description ? (
                                <MarkupView value={ir.description} label={t('cdef_field_ir_description')} />
                              ) : null}
                              {ir.setParameters && ir.setParameters.length > 0 && (
                                <ul data-testid="compdef-set-parameters">
                                  {ir.setParameters.map((sp) => (
                                    <li key={sp.paramId}>
                                      λ <code>{sp.paramId}</code> = {(sp.values ?? []).join(', ') || '—'}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {ir.remarks ? (
                                <div data-testid="compdef-requirement-remarks">
                                  <small>📝 <MarkupView value={ir.remarks} label={t('md_remarks_label')} /></small>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>
        );
      })}
    </main>
  );
}
