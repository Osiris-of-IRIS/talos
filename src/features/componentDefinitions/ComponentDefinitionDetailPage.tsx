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
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition } from '@/models/componentDefinition';

export function ComponentDefinitionDetailPage() {
  const { uuid = '' } = useParams();
  const { t } = useI18n();
  const catalogIndex = useCatalogIndex();
  const [record, setRecord] = useState<StoredArtifact<ComponentDefinition> | null | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);

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

      <h2>{t('compdef_components_count', { count: cd.components?.length ?? 0 })}</h2>
      {cd.components?.map((c) => (
        <section key={c.uuid} data-testid="compdef-component">
          <h3>
            <MarkupView value={c.title} label={t('cdef_field_component_title')} /> <small>[{c.type}]</small>
          </h3>
          <MarkupView value={c.description} multiline label={t('cdef_field_component_description')} />
          {c.controlImplementations?.map((ci) => (
            <div key={ci.uuid}>
              <h4>{t('cdef_control_implementation_heading')}</h4>
              <MarkupView value={ci.description} multiline label={t('cdef_field_ci_description')} />
              <ul>
                {ci.implementedRequirements.map((ir) => (
                  <li key={ir.uuid} data-testid="compdef-requirement">
                    {(() => {
                      const resolved = catalogIndex ? resolveControl(catalogIndex, ir.controlId) : undefined;
                      return resolved ? (
                        <ControlDisplay
                          control={resolved.control}
                          setParameters={ir.setParameters}
                          viewerUrl={viewerHref(resolved.catalogLibraryPath)}
                        />
                      ) : (
                        <code data-testid="compdef-requirement-unresolved">{ir.controlId}</code>
                      );
                    })()}
                    {ir.description ? (
                      <>
                        {' — '}
                        <MarkupView value={ir.description} label={t('cdef_field_ir_description')} />
                      </>
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
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
