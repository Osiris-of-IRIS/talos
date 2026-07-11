/**
 * Profile Creation Assistant (ADR-0032 §4, MVP Feedback "Profile Creation Assistant"): guided
 * profile creation — metadata, a single catalog/profile source, and an inclusion strategy (all /
 * specific controls / target-object hierarchy). Reuses the same building blocks as the plain
 * editor (MetadataEditor, EntitySearchField, ControlSelectionChecklist) plus the new
 * <TargetObjectPicker> — the assistant's own contribution is the guided flow and the
 * target-object inclusion mode, not a second implementation of anything the editor already has.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { MetadataEditor } from '@/features/shared/MetadataEditor';
import { EntitySearchField } from '@/shared/EntitySearchField';
import type { SearchItem } from '@/shared/useEntitySearch';
import { ensureArtifactResource } from '@/models/backMatter';
import { useCatalogControlsByUuid } from '@/features/shared/useCatalogControlsByUuid';
import { useWorkspaceCatalogs } from '@/features/shared/useWorkspaceCatalogs';
import { useWorkspaceProfiles } from '@/features/shared/useWorkspaceProfiles';
import { resolveProfileEffectiveControls } from '@/data/profileImportResolution';
import { getSettings } from '@/data/settingsRepository';
import { applyDefaultCreator } from '@/data/defaultCreator';
import { loadTargetObjectCategories } from '@/data/targetObjectCategoryLoader';
import { categoryTitlesInChain } from '@/data/targetObjectHierarchy';
import { ControlSelectionChecklist } from './ControlSelectionChecklist';
import { TargetObjectPicker, matchedControlIds } from './TargetObjectPicker';
import { createBlankProfile } from './blank';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import type { Profile, ProfileImport } from '@/models/profile';
import { applyInclusion } from '@/models/profile';
import type { Control } from '@/models/control';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';

const repo = () => ArtifactRepository.forType<Profile>('profile');

type InclusionMode = 'all' | 'byId' | 'targetObject';

export function ProfileCreationAssistantPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const workspaceCatalogs = useWorkspaceCatalogs();
  const workspaceProfiles = useWorkspaceProfiles();
  const catalogControlsByUuid = useCatalogControlsByUuid(workspaceCatalogs);
  const [draft, setDraft] = useState<Profile>(createBlankProfile());
  const [sourcePick, setSourcePick] = useState('');
  const [mode, setMode] = useState<InclusionMode>('all');
  const [includeIds, setIncludeIds] = useState<Set<string>>(new Set());
  const [targetObjectUuids, setTargetObjectUuids] = useState<Set<string>>(new Set());
  const [productSpecOnly, setProductSpecOnly] = useState(false);
  const [categoryRows, setCategoryRows] = useState<TargetObjectCategory[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadTargetObjectCategories()
      .then((loaded) => {
        setCategoryRows(loaded.rows);
        if (loaded.warning) showToast(loaded.warning, 'warning');
      })
      .catch((e) => showToast(e instanceof Error ? e.message : String(e), 'error'));
  }, [showToast]);

  // The assistant's draft is always a brand-new document (no edit mode) — seed the global
  // default creator (Settings page, ADR-0033) once on mount, same as the plain editor.
  useEffect(() => {
    void getSettings().then((settings) => setDraft((prev) => applyDefaultCreator(prev, settings)));
  }, []);

  const sourceCatalog = workspaceCatalogs.find((c) => c.uuid === sourcePick);
  const sourceProfile = workspaceProfiles.find((p) => p.uuid === sourcePick);
  // A profile source's checklist/target-object universe is its own effective control set,
  // recursively resolved through its own imports (T-206, ADR-0032 §5) — same shape a catalog
  // source already has, so byId/targetObject modes are no longer catalog-only.
  const sourceProfileResolution = sourceProfile
    ? resolveProfileEffectiveControls(sourceProfile.artifact, workspaceCatalogs, workspaceProfiles)
    : undefined;
  const controlsById: Map<string, Control> | undefined = sourceCatalog
    ? catalogControlsByUuid.get(sourceCatalog.uuid)
    : sourceProfileResolution?.controlsById;
  const byUuid = new Map(categoryRows.map((r) => [r.uuid, r]));
  const eligibleTitles = new Set<string>();
  for (const uuid of targetObjectUuids) {
    for (const title of categoryTitlesInChain(uuid, byUuid)) eligibleTitles.add(title);
  }

  const sourceSearchItems: SearchItem[] = [
    ...workspaceCatalogs.map((c): SearchItem => ({ id: c.uuid, title: c.artifact.metadata.title, badge: c.origin })),
    ...workspaceProfiles.map((p): SearchItem => ({ id: p.uuid, title: p.artifact.metadata.title, badge: p.origin })),
  ];

  // byId/targetObject need a resolved control universe to pick from (a catalog directly, or a
  // profile's own effective set via T-206's recursive resolution); fall back to "all" once the
  // source no longer resolves to either.
  useEffect(() => {
    if (!controlsById && mode !== 'all') setMode('all');
  }, [controlsById, mode]);

  // Both selection sets are scoped to whichever source is currently picked (includeIds are
  // control-ids from that source's own catalog; a stale set from a previously-picked catalog
  // could reference ids that don't exist in the new one). Reset on every sourcePick change —
  // including intermediate keystrokes before a new pick is committed, since the old selection is
  // meaningless once the source it was scoped to is no longer picked.
  useEffect(() => {
    setIncludeIds(new Set());
    setTargetObjectUuids(new Set());
  }, [sourcePick]);

  async function onCreate() {
    if (!draft.metadata.title.trim() || !sourcePick) return;
    const target = sourceCatalog ?? sourceProfile;
    if (!target) return;
    setSaving(true);
    try {
      const toSave = structuredClone(draft);
      toSave.metadata.lastModified = new Date().toISOString();
      const resourceUuid = ensureArtifactResource(toSave, target.uuid, target.artifact.metadata.title);
      const imp: ProfileImport = { href: `#${resourceUuid}` };
      if (mode === 'all') {
        applyInclusion(imp, { mode: 'all' });
      } else if (mode === 'byId') {
        applyInclusion(imp, { mode: 'byId', ids: [...includeIds] });
      } else {
        const ids = controlsById ? matchedControlIds(controlsById, eligibleTitles, productSpecOnly) : [];
        applyInclusion(imp, { mode: 'byId', ids });
      }
      toSave.imports = [imp];
      await repo().create({ uuid: toSave.uuid, type: 'profile', origin: 'user', artifact: toSave });
      navigate(`/profiles/${toSave.uuid}`);
    } finally {
      setSaving(false);
    }
  }

  const canCreate = !!draft.metadata.title.trim() && !!sourcePick;

  return (
    <main data-testid="profile-assistant">
      <p>
        <Link to="/profiles">← {t('landing_feature_profiles')}</Link>
      </p>
      <h1>🧭 {t('profile_assistant_heading')}</h1>
      <p>
        <small>{t('profile_assistant_intro')}</small>
      </p>

      <fieldset>
        <legend>{t('profile_assistant_step_metadata')}</legend>
        <MetadataEditor artifact={draft} onChange={setDraft} />
      </fieldset>

      <fieldset>
        <legend>{t('profile_assistant_step_source')}</legend>
        <label>
          {t('profile_imports_add_aria')}
          <EntitySearchField
            ariaLabel={t('profile_imports_add_aria')}
            dataTestId="profile-assistant-source-picker"
            items={sourceSearchItems}
            value={sourcePick}
            onChange={setSourcePick}
          />
        </label>
      </fieldset>

      {sourcePick && (
        <fieldset>
          <legend>{t('profile_assistant_step_inclusion')}</legend>
          <label>
            <input
              type="radio"
              name="inclusion-mode"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
              data-testid="profile-assistant-mode-all"
            />{' '}
            {t('profile_imports_mode_all')}
          </label>{' '}
          <label>
            <input
              type="radio"
              name="inclusion-mode"
              checked={mode === 'byId'}
              onChange={() => setMode('byId')}
              disabled={!controlsById}
              data-testid="profile-assistant-mode-by-id"
            />{' '}
            {t('profile_imports_mode_by_id')}
          </label>{' '}
          <label>
            <input
              type="radio"
              name="inclusion-mode"
              checked={mode === 'targetObject'}
              onChange={() => setMode('targetObject')}
              disabled={!controlsById}
              data-testid="profile-assistant-mode-target-object"
            />{' '}
            {t('profile_assistant_mode_target_object')}
          </label>

          {sourceProfileResolution?.hasUnresolved && (
            <p data-testid="profile-assistant-nested-unresolved-hint">
              <small>⚠️ {t('profile_imports_nested_unresolved_hint')}</small>
            </p>
          )}

          {mode === 'byId' && controlsById && (
            <ControlSelectionChecklist
              controlsById={controlsById}
              selectedIds={includeIds}
              onChange={setIncludeIds}
              dataTestId="profile-assistant-checklist"
            />
          )}

          {mode === 'targetObject' && controlsById && (
            <TargetObjectPicker
              categoryRows={categoryRows}
              controlsById={controlsById}
              selectedUuids={targetObjectUuids}
              onChange={setTargetObjectUuids}
              productSpecOnly={productSpecOnly}
              onProductSpecOnlyChange={setProductSpecOnly}
            />
          )}
        </fieldset>
      )}

      <p>
        <small>{t('profile_assistant_merge_note')}</small>
      </p>

      <button type="button" disabled={!canCreate || saving} onClick={() => void onCreate()} data-testid="profile-assistant-create">
        ✅ {t('profile_assistant_create_button')}
      </button>
    </main>
  );
}
