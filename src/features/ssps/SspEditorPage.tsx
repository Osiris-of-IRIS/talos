// SSP editor (create + edit). Decision IDs: ADR-0003, ADR-0017, ADR-0019, ADR-0023, ADR-0032 (feature IMPL-002, T-111, T-204).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { MetadataEditor } from '@/features/shared/MetadataEditor';
import { BackMatterEditor } from '@/features/shared/BackMatterEditor';
import { CollapsibleSection } from '@/shared/CollapsibleSection';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { useCatalogIndex } from '@/features/shared/useCatalogIndex';
import { useWorkspaceCatalogs } from '@/features/shared/useWorkspaceCatalogs';
import { useWorkspaceComponentDefinitions } from '@/features/shared/useWorkspaceComponentDefinitions';
import { useWorkspaceProfiles } from '@/features/shared/useWorkspaceProfiles';
import { EntitySearchField } from '@/shared/EntitySearchField';
import type { SearchItem } from '@/shared/useEntitySearch';
import { ensureArtifactResource } from '@/models/backMatter';
import { resolveProfileImportSource, resolveProfileControlIds } from '@/data/profileImportResolution';
import { SystemCharacteristicsEditor } from './SystemCharacteristicsEditor';
import { SystemImplementationEditor } from './SystemImplementationEditor';
import { SspControlImplementationEditor } from './SspControlImplementationEditor';
import { createBlankSsp } from './blank';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import type { SystemSecurityPlan } from '@/models/ssp';

const repo = () => ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');

const SECTION_IDS = ['characteristics', 'implementation', 'control-impl'] as const;

export function SspEditorPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { showToast } = useToast();
  const catalogIndex = useCatalogIndex();
  const workspaceCatalogs = useWorkspaceCatalogs();
  const workspaceComponentDefs = useWorkspaceComponentDefinitions();
  const workspaceProfiles = useWorkspaceProfiles();
  const isNew = !uuid;
  const [draft, setDraft] = useState<SystemSecurityPlan | null>(isNew ? createBlankSsp() : null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  // SSPs can be large (supervisor note): sections default-collapsed for an existing/loaded SSP,
  // but auto-expanded for a brand-new one so authoring can start immediately.
  const sections = useExpandedSet(isNew ? SECTION_IDS : []);

  useEffect(() => {
    if (isNew || !uuid) return;
    let active = true;
    void repo()
      .get(uuid)
      .then((r) => {
        if (!active) return;
        if (r) setDraft(r.artifact);
        else setNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [uuid, isNew]);

  if (notFound) {
    return (
      <main>
        <p>
          <Link to="/ssps">← {t('landing_feature_ssps')}</Link>
        </p>
        <p role="alert">{t('ssp_not_found')}</p>
      </main>
    );
  }
  if (!draft) return <main>{t('common_loading')}</main>;

  function update(next: SystemSecurityPlan) {
    setDraft(next);
  }

  /** Wire `import-profile` to a real workspace-profile picker (T-204, ADR-0032 §7): picking a
   * profile upgrades the href to a back-matter reference (same convention as every other
   * cross-artifact picker), then offers to add every control the profile resolves to as a blank
   * implemented-requirement — skipping any control-id already present, so re-picking the same
   * profile later only ever tops up what's missing rather than duplicating rows. Free text that
   * doesn't match a workspace profile passes through unchanged (manual/legacy hrefs keep working). */
  function setImportProfile(typed: string) {
    const current = draft;
    if (!current) return;
    const matched = workspaceProfiles.find((p) => p.uuid === typed);
    if (!matched) {
      update({ ...current, importProfile: { ...current.importProfile, href: typed } });
      return;
    }
    const next = structuredClone(current);
    const resourceUuid = ensureArtifactResource(next, matched.uuid, matched.artifact.metadata.title);
    next.importProfile.href = `#${resourceUuid}`;

    const { controlIds } = resolveProfileControlIds(matched.artifact, workspaceCatalogs, workspaceProfiles);
    const existingIds = new Set(next.controlImplementation.implementedRequirements.map((ir) => ir.controlId));
    const idsToAdd = controlIds.filter((id) => !existingIds.has(id));

    if (
      idsToAdd.length > 0 &&
      globalThis.confirm(
        t('ssp_import_profile_add_controls_confirm', {
          count: String(idsToAdd.length),
          title: matched.artifact.metadata.title,
        }),
      )
    ) {
      for (const controlId of idsToAdd) {
        next.controlImplementation.implementedRequirements.push({
          uuid: globalThis.crypto.randomUUID(),
          controlId,
          byComponents: [],
        });
      }
      showToast(t('ssp_import_profile_added_toast', { count: String(idsToAdd.length) }), 'success');
    }
    update(next);
  }

  function removeByComponentsReferencing(componentUuid: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      for (const ir of next.controlImplementation.implementedRequirements) {
        ir.byComponents = (ir.byComponents ?? []).filter((bc) => bc.componentUuid !== componentUuid);
      }
      return next;
    });
  }

  async function save() {
    const current = draft;
    if (!current || !current.metadata.title.trim()) return;
    setSaving(true);
    try {
      const toSave = structuredClone(current);
      toSave.metadata.lastModified = new Date().toISOString();
      if (isNew) {
        await repo().create({
          uuid: toSave.uuid,
          type: 'systemSecurityPlan',
          origin: 'user',
          artifact: toSave,
        });
      } else {
        await repo().update(toSave.uuid, toSave);
      }
      navigate(`/ssps/${toSave.uuid}`);
    } finally {
      setSaving(false);
    }
  }

  const importProfileSearchItems: SearchItem[] = workspaceProfiles.map((p) => ({
    id: p.uuid,
    title: p.artifact.metadata.title,
    badge: p.origin,
  }));
  const resolvedImportSource = resolveProfileImportSource(draft.importProfile, draft.backMatter, workspaceCatalogs, workspaceProfiles);
  const resolvedImportProfile = resolvedImportSource?.type === 'profile' ? resolvedImportSource.item : undefined;

  return (
    <main data-testid="ssp-editor">
      <p>
        <Link to="/ssps">← {t('landing_feature_ssps')}</Link>
      </p>
      <h1>{isNew ? `➕ ${t('ssp_new')}` : `✎ ${t('ssp_edit_heading')}`}</h1>

      <MetadataEditor artifact={draft} onChange={update} />

      <fieldset>
        <legend>{t('ssp_import_profile_heading')}</legend>
        <label>
          {t('ssp_import_profile_label')}
          <EntitySearchField
            dataTestId="ssp-import-profile"
            value={draft.importProfile.href}
            placeholder={t('ssp_import_profile_placeholder')}
            items={importProfileSearchItems}
            onChange={setImportProfile}
          />
        </label>
        {resolvedImportProfile ? (
          <small data-testid="ssp-import-profile-resolved"> ✓ {resolvedImportProfile.artifact.metadata.title}</small>
        ) : (
          draft.importProfile.href && <small data-testid="ssp-import-profile-unresolved"> {t('ssp_import_profile_unresolved')}</small>
        )}
      </fieldset>

      <CollapsibleSection
        testId="ssp-section-characteristics"
        isOpen={sections.isExpanded('characteristics')}
        onToggle={() => sections.toggle('characteristics')}
        summary={t('ssp_system_characteristics_heading')}
      >
        <SystemCharacteristicsEditor
          value={draft.systemCharacteristics}
          onChange={(sc) => update({ ...draft, systemCharacteristics: sc })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        testId="ssp-section-implementation"
        isOpen={sections.isExpanded('implementation')}
        onToggle={() => sections.toggle('implementation')}
        summary={t('ssp_system_implementation_heading')}
      >
        <SystemImplementationEditor
          value={draft.systemImplementation}
          onChange={(si) => update({ ...draft, systemImplementation: si })}
          onComponentRemoved={removeByComponentsReferencing}
          workspaceComponentDefs={workspaceComponentDefs}
        />
      </CollapsibleSection>

      <CollapsibleSection
        testId="ssp-section-control-impl"
        isOpen={sections.isExpanded('control-impl')}
        onToggle={() => sections.toggle('control-impl')}
        summary={t('ci_heading_ssp', { count: draft.controlImplementation.implementedRequirements.length })}
      >
        <SspControlImplementationEditor
          value={draft.controlImplementation}
          onChange={(ci) => update({ ...draft, controlImplementation: ci })}
          systemComponents={draft.systemImplementation.components}
          catalogIndex={catalogIndex}
          workspaceComponentDefs={workspaceComponentDefs}
        />
      </CollapsibleSection>

      <BackMatterEditor artifact={draft} onChange={update} />

      <div>
        <button type="button" data-testid="save-ssp" onClick={() => void save()} disabled={saving}>
          💾 {t('common_save')}
        </button>{' '}
        {!draft.metadata.title.trim() && <small>{t('cdef_title_required')}</small>}
      </div>
    </main>
  );
}
