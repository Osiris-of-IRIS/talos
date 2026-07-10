// Profile detail (read view). Decision IDs: ADR-0003, ADR-0009, ADR-0032 (feature CTRL-001).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { downloadArtifact } from '@/data/fileIo';
import { MarkupView } from '@/shared/MarkupView';
import { ControlDisplay } from '@/features/shared/ControlDisplay';
import { indexCatalogControls } from '@/data/catalogResolution';
import { useWorkspaceCatalogs } from '@/features/shared/useWorkspaceCatalogs';
import { useWorkspaceProfiles } from '@/features/shared/useWorkspaceProfiles';
import { resolveProfileImportSource, unresolvedProfileImportHrefs } from '@/data/profileImportResolution';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import type { StoredArtifact } from '@/data/db';
import type { Profile } from '@/models/profile';

export function ProfileDetailPage() {
  const { uuid = '' } = useParams();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [record, setRecord] = useState<StoredArtifact<Profile> | null | undefined>(undefined);
  const workspaceCatalogs = useWorkspaceCatalogs();
  const workspaceProfiles = useWorkspaceProfiles();

  function onDownload(r: StoredArtifact<Profile>) {
    try {
      downloadArtifact(r);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  useEffect(() => {
    let active = true;
    void ArtifactRepository.forType<Profile>('profile')
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
          <Link to="/profiles">← {t('landing_feature_profiles')}</Link>
        </p>
        <p role="alert" data-testid="profile-not-found">
          {t('profile_not_found')}
        </p>
      </main>
    );
  }

  const profile = record.artifact;
  const imports = profile.imports;
  const unresolvedCount = unresolvedProfileImportHrefs(imports, profile.backMatter, workspaceCatalogs, workspaceProfiles).length;
  const setParameters = profile.modify?.setParameters ?? [];

  return (
    <main data-testid="profile-detail">
      <p>
        <Link to="/profiles">← {t('landing_feature_profiles')}</Link>
      </p>
      <h1>
        📑 <MarkupView value={profile.metadata.title} label={t('profile_field_title')} />
      </h1>
      <p>
        <small>
          uuid {record.uuid} · v{profile.metadata.version} · OSCAL {profile.metadata.oscalVersion} · {record.origin}
        </small>
      </p>
      {record.origin !== 'library' && (
        <Link to={`/profiles/${record.uuid}/edit`} data-testid="profile-edit">
          ✎ {t('common_edit')}
        </Link>
      )}{' '}
      <button type="button" onClick={() => onDownload(record)}>
        ⭳ {t('common_download')}
      </button>
      {unresolvedCount > 0 && (
        <p role="status" data-testid="profile-detail-unresolved-banner" style={{ color: 'var(--color-warning, #a15c00)' }}>
          ⚠️ {t('profile_imports_unresolved_detail_banner', { count: unresolvedCount })}
          {record.origin !== 'library' && (
            <>
              {' '}
              <Link to={`/profiles/${record.uuid}/edit`}>✎ {t('common_edit')}</Link>
            </>
          )}
        </p>
      )}
      <h2>{t('profile_imports_heading', { count: imports.length })}</h2>
      {imports.map((imp, i) => {
        const resolved = resolveProfileImportSource(imp, profile.backMatter, workspaceCatalogs, workspaceProfiles);
        const controlsById = resolved?.type === 'catalog' ? indexCatalogControls(resolved.item.artifact) : undefined;
        const includeIds = imp.includeControls?.[0]?.withIds ?? [];
        const excludeIds = imp.excludeControls?.[0]?.withIds ?? [];
        return (
          <section key={`${imp.href}-${i}`} className="collapsible-section" data-testid="profile-detail-import">
            <h3>
              {resolved ? (
                <>
                  {resolved.type === 'catalog' ? '📘' : '📑'}{' '}
                  <Link to={resolved.type === 'catalog' ? '/catalogs' : `/profiles/${resolved.item.uuid}`}>
                    {resolved.item.artifact.metadata.title}
                  </Link>
                </>
              ) : (
                <span data-testid="profile-detail-import-unresolved">⚠️ {t('profile_imports_unresolved')}</span>
              )}
            </h3>
            <div>
              {imp.includeAll ? t('profile_imports_mode_all') : t('profile_imports_mode_by_id')}
              {!imp.includeAll && includeIds.length > 0 && (
                <>
                  {': '}
                  {controlsById
                    ? includeIds.map((id) => {
                        const c = controlsById.get(id);
                        return (
                          <span key={id} data-testid="profile-detail-include-control">
                            {c ? <ControlDisplay control={c} /> : <code>{id}</code>}{' '}
                          </span>
                        );
                      })
                    : includeIds.join(', ')}
                </>
              )}
            </div>
            {excludeIds.length > 0 && (
              <div>
                {t('profile_imports_exclude_toggle')}
                {': '}
                {controlsById
                  ? excludeIds.map((id) => {
                      const c = controlsById.get(id);
                      return (
                        <span key={id} data-testid="profile-detail-exclude-control">
                          {c ? <ControlDisplay control={c} /> : <code>{id}</code>}{' '}
                        </span>
                      );
                    })
                  : excludeIds.join(', ')}
              </div>
            )}
          </section>
        );
      })}
      {setParameters.length > 0 && (
        <>
          <h2>{t('profile_set_parameters_heading', { count: setParameters.length })}</h2>
          <ul data-testid="profile-detail-set-parameters">
            {setParameters.map((sp, i) => (
              // Index, not paramId — modify.set-parameters has no id field, and paramId is not
              // guaranteed unique (e.g. two blank entries mid-edit) so keying by it can collide.
              <li key={i}>
                λ <code>{sp.paramId}</code> = {(sp.values ?? []).join(', ') || '—'}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
