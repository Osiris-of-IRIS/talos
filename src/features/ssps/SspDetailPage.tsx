// SSP detail (read view). Decision IDs: ADR-0003, ADR-0009, ADR-0008, ADR-0023 (feature IMPL-002).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { downloadArtifact } from '@/data/fileIo';
import { MarkupView } from '@/shared/MarkupView';
import { CollapsibleSection } from '@/shared/CollapsibleSection';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { useI18n } from '@/shared/i18n';
import { useWorkspaceComponentDefinitions } from './useWorkspaceComponentDefinitions';
import { componentStaleness, getImplementationStatus } from './componentImport';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan } from '@/models/ssp';

export function SspDetailPage() {
  const { uuid = '' } = useParams();
  const { t } = useI18n();
  const [record, setRecord] = useState<StoredArtifact<SystemSecurityPlan> | null | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);
  const workspaceComponentDefs = useWorkspaceComponentDefinitions();
  // Every section, component, and requirement starts collapsed (supervisor note: SSPs can be
  // large) — a scannable outline first, full detail on click.
  const sections = useExpandedSet();
  const componentsExpanded = useExpandedSet();
  const requirementsExpanded = useExpandedSet();

  function onDownload(r: StoredArtifact<SystemSecurityPlan>) {
    try {
      setExportError(null);
      downloadArtifact(r);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let active = true;
    void ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan')
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
          <Link to="/ssps">← {t('landing_feature_ssps')}</Link>
        </p>
        <p role="alert" data-testid="ssp-not-found">{t('ssp_not_found')}</p>
      </main>
    );
  }

  const ssp = record.artifact;
  const components = ssp.systemImplementation?.components ?? [];
  const requirements = ssp.controlImplementation?.implementedRequirements ?? [];

  return (
    <main data-testid="ssp-detail">
      <p>
        <Link to="/ssps">← {t('landing_feature_ssps')}</Link>
      </p>
      <h1>
        🖥️ <MarkupView value={ssp.metadata.title} label={t('cdef_field_title')} />
      </h1>
      <p>
        <small>
          uuid {record.uuid} · v{ssp.metadata.version} · OSCAL {ssp.metadata.oscalVersion} · {record.origin}
        </small>
      </p>
      {record.origin !== 'library' && (
        <Link to={`/ssps/${record.uuid}/edit`} data-testid="ssp-edit">
          ✎ {t('common_edit')}
        </Link>
      )}{' '}
      <button type="button" onClick={() => onDownload(record)}>
        ⭳ {t('common_download')}
      </button>
      {exportError && (
        <p role="alert" data-testid="ssp-export-error" style={{ color: 'var(--color-error, #cf222e)' }}>
          ⚠️ {exportError}
        </p>
      )}

      <CollapsibleSection
        testId="ssp-section-characteristics"
        isOpen={sections.isExpanded('characteristics')}
        onToggle={() => sections.toggle('characteristics')}
        summary={t('ssp_system_characteristics_heading')}
      >
        <p data-testid="ssp-system-name">
          <strong>{ssp.systemCharacteristics?.systemName}</strong>
        </p>
        <MarkupView value={ssp.systemCharacteristics?.description} multiline label={t('common_description')} />
        <p>
          <small>{t('ssp_imports_profile')} <code>{ssp.importProfile?.href}</code></small>
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        testId="ssp-section-implementation"
        isOpen={sections.isExpanded('implementation')}
        onToggle={() => sections.toggle('implementation')}
        summary={t('ssp_system_implementation_heading')}
      >
        {components.map((c) => {
          const isOpen = componentsExpanded.isExpanded(c.uuid);
          const staleness = componentStaleness(c, workspaceComponentDefs);
          return (
            <div key={c.uuid} data-testid="ssp-component">
              <button
                type="button"
                data-testid="ssp-component-summary"
                aria-expanded={isOpen}
                onClick={() => componentsExpanded.toggle(c.uuid)}
              >
                {isOpen ? '▾' : '▸'} {c.title} <small>[{c.type}]</small>
              </button>{' '}
              {staleness === 'stale' && (
                <span data-testid="ssp-component-stale-badge" title={t('si_stale_title')}>
                  Δ {t('si_stale_label')}
                </span>
              )}
              {staleness === 'missing' && (
                <span data-testid="ssp-component-stale-badge" title={t('si_missing_title')}>
                  Δ {t('si_missing_label')}
                </span>
              )}
              {isOpen && (
                <div data-testid="ssp-component-body">
                  <MarkupView value={c.description} multiline label={t('common_description')} />
                  <p>
                    <small>{t('sc_status_label')}: {c.status.state}</small>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection
        testId="ssp-section-control-impl"
        isOpen={sections.isExpanded('control-impl')}
        onToggle={() => sections.toggle('control-impl')}
        summary={t('ci_heading_ssp', { count: requirements.length })}
      >
        {requirements.map((ir) => {
          const isOpen = requirementsExpanded.isExpanded(ir.uuid);
          return (
            <div key={ir.uuid} data-testid="ssp-requirement">
              <button
                type="button"
                data-testid="ssp-requirement-summary"
                aria-expanded={isOpen}
                onClick={() => requirementsExpanded.toggle(ir.uuid)}
              >
                {isOpen ? '▾' : '▸'} <code>{ir.controlId}</code>{' '}
                <small>· {t('ssp_by_components_count', { count: (ir.byComponents ?? []).length })}</small>
              </button>
              {isOpen && (
                <div data-testid="ssp-requirement-body">
                  {ir.remarks ? <MarkupView value={ir.remarks} label={t('md_remarks_label')} /> : null}
                  <ul data-testid="ssp-by-components">
                    {(ir.byComponents ?? []).map((bc) => {
                      const comp = components.find((c) => c.uuid === bc.componentUuid);
                      const status = getImplementationStatus(bc);
                      return (
                        <li key={bc.uuid} data-testid="ssp-by-component">
                          <strong>{comp?.title ?? bc.componentUuid}</strong>
                          {status ? <small> · {t(`implementation_status_${status}`)}</small> : null}
                          {' — '}
                          <MarkupView value={bc.description} label={t('common_description')} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </CollapsibleSection>
    </main>
  );
}
