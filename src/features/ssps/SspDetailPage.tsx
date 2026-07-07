// SSP detail (read view). Decision IDs: ADR-0003, ADR-0009, ADR-0008 (feature IMPL-002).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { downloadArtifact } from '@/data/fileIo';
import { MarkupView } from '@/shared/MarkupView';
import { useI18n } from '@/shared/i18n';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan } from '@/models/ssp';

export function SspDetailPage() {
  const { uuid = '' } = useParams();
  const { t } = useI18n();
  const [record, setRecord] = useState<StoredArtifact<SystemSecurityPlan> | null | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);

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
      <button type="button" onClick={() => onDownload(record)}>
        ⭳ {t('common_download')}
      </button>
      {exportError && (
        <p role="alert" data-testid="ssp-export-error" style={{ color: 'var(--color-error, #cf222e)' }}>
          ⚠️ {exportError}
        </p>
      )}

      <h2>{t('ssp_system_characteristics_heading')}</h2>
      <p data-testid="ssp-system-name">
        <strong>{ssp.systemCharacteristics?.systemName}</strong>
      </p>
      <MarkupView value={ssp.systemCharacteristics?.description} multiline label={t('common_description')} />
      <p>
        <small>{t('ssp_imports_profile')} <code>{ssp.importProfile?.href}</code></small>
      </p>

      <h2>{t('ssp_requirements_heading', { count: requirements.length })}</h2>
      <ul>
        {requirements.map((ir) => (
          <li key={ir.uuid} data-testid="ssp-requirement">
            <code>{ir.controlId}</code>
            {ir.byComponents && ir.byComponents.length > 0 ? (
              <small> · {t('ssp_by_components_count', { count: ir.byComponents.length })}</small>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
