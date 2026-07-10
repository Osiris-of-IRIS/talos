// SSP detail (read view). Decision IDs: ADR-0003, ADR-0009, ADR-0008, ADR-0016, ADR-0023, ADR-0028 (feature IMPL-002).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { downloadArtifact } from '@/data/fileIo';
import { MarkupView } from '@/shared/MarkupView';
import { CollapsibleSection } from '@/shared/CollapsibleSection';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import { useWorkspaceComponentDefinitions } from '@/features/shared/useWorkspaceComponentDefinitions';
import { componentStaleness, getImplementationStatus } from './componentImport';
import { ControlDisplay } from '@/features/shared/ControlDisplay';
import { useCatalogIndex } from '@/features/shared/useCatalogIndex';
import { resolveControl } from '@/data/catalogResolution';
import { viewerHref } from '@/config';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan } from '@/models/ssp';

export function SspDetailPage() {
  const { uuid = '' } = useParams();
  const { t } = useI18n();
  const { showToast } = useToast();
  const catalogIndex = useCatalogIndex();
  const [record, setRecord] = useState<StoredArtifact<SystemSecurityPlan> | null | undefined>(undefined);
  const workspaceComponentDefs = useWorkspaceComponentDefinitions();
  // Every section and component starts collapsed (supervisor note: SSPs can be large) — a
  // scannable outline first, full detail on click. Requirements are not individually collapsible
  // — once Control Implementation is open, every row shows in full (matches the
  // component-definition detail page's control|implementation table, ADR-0028).
  const sections = useExpandedSet();
  const componentsExpanded = useExpandedSet();

  function onDownload(r: StoredArtifact<SystemSecurityPlan>) {
    try {
      downloadArtifact(r);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
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
  const inventoryItems = ssp.systemImplementation?.inventoryItems ?? [];
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
            <div key={c.uuid} className="collapsible-section" data-testid="ssp-component">
              <button
                type="button"
                className="collapsible-toggle"
                data-testid="ssp-component-summary"
                aria-expanded={isOpen}
                onClick={() => componentsExpanded.toggle(c.uuid)}
              >
                {isOpen ? '▾' : '▸'} {c.title} <small>[{c.type}]</small>
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
              </button>
              {isOpen && (
                <div className="collapsible-body" data-testid="ssp-component-body">
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

      {inventoryItems.length > 0 && (
        <CollapsibleSection
          testId="ssp-section-inventory"
          isOpen={sections.isExpanded('inventory')}
          onToggle={() => sections.toggle('inventory')}
          summary={t('ssp_inventory_items_heading', { count: inventoryItems.length })}
        >
          <ul data-testid="ssp-inventory-items">
            {inventoryItems.map((item) => {
              const assetId = item.props?.find((p) => p.name === 'asset-id')?.value;
              const assetType = item.props?.find((p) => p.name === 'asset-type')?.value;
              return (
                <li key={item.uuid} data-testid="ssp-inventory-item">
                  <MarkupView value={item.description} label={t('common_description')} />
                  {assetId && (
                    <>
                      {' — '}
                      <small>
                        {t('ssp_inventory_item_asset_id_label')}:{' '}
                        <Link to={`/assets?asset=${encodeURIComponent(assetId)}`} data-testid="ssp-inventory-item-asset-link">
                          {assetId}
                        </Link>
                        {assetType && (
                          <>
                            {' · '}
                            {t('ssp_inventory_item_asset_type_label')}: {assetType}
                          </>
                        )}
                      </small>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        testId="ssp-section-control-impl"
        isOpen={sections.isExpanded('control-impl')}
        onToggle={() => sections.toggle('control-impl')}
        summary={t('ci_heading_ssp', { count: requirements.length })}
      >
        <table className="control-requirements-table" data-testid="ssp-requirements-table">
          <colgroup>
            <col className="control-requirements-col-control" />
            <col className="control-requirements-col-detail" />
          </colgroup>
          <thead>
            <tr>
              <th>{t('cdef_requirements_col_control')}</th>
              <th>{t('ssp_requirements_col_implementation')}</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((ir) => {
              const resolved = catalogIndex ? resolveControl(catalogIndex, ir.controlId) : undefined;
              return (
                <tr key={ir.uuid} data-testid="ssp-requirement">
                  <td>
                    {resolved ? (
                      <ControlDisplay
                        control={resolved.control}
                        viewerUrl={viewerHref(resolved.catalogLibraryPath)}
                      />
                    ) : (
                      <code data-testid="ssp-requirement-unresolved">{ir.controlId}</code>
                    )}
                  </td>
                  <td>
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
                    {ir.remarks ? (
                      <div data-testid="ssp-requirement-remarks">
                        <small>📝 <MarkupView value={ir.remarks} label={t('md_remarks_label')} /></small>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CollapsibleSection>
    </main>
  );
}
