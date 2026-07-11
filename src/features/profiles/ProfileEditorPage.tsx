// Profile editor (create + edit). Decision IDs: ADR-0003, ADR-0032 (feature CTRL-001, T-200/T-201).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { MetadataEditor } from '@/features/shared/MetadataEditor';
import { BackMatterEditor } from '@/features/shared/BackMatterEditor';
import { EntitySearchField } from '@/shared/EntitySearchField';
import type { SearchItem } from '@/shared/useEntitySearch';
import { ensureArtifactResource } from '@/models/backMatter';
import { useCatalogControlsByUuid } from '@/features/shared/useCatalogControlsByUuid';
import { useWorkspaceCatalogs } from '@/features/shared/useWorkspaceCatalogs';
import { useWorkspaceProfiles } from '@/features/shared/useWorkspaceProfiles';
import {
  resolveProfileImportSource,
  resolveProfileEffectiveControls,
  unresolvedProfileImportHrefs,
  wouldCreateProfileCycle,
} from '@/data/profileImportResolution';
import { syncUnresolvedReferences } from '@/data/unresolvedReferences';
import { useSeedDefaultCreator } from '@/features/shared/useSeedDefaultCreator';
import { ControlSelectionChecklist } from './ControlSelectionChecklist';
import { createBlankProfile } from './blank';
import { useI18n } from '@/shared/i18n';
import type { Profile, ProfileImport, ProfileSetParameter } from '@/models/profile';
import { applyInclusion, applyExclusion } from '@/models/profile';
import { parseCommaList } from '@/data/commaList';

const repo = () => ArtifactRepository.forType<Profile>('profile');

/** Keeps the values text in local state so mid-word spaces/commas survive typing (same pattern as
 * ControlImplementationsEditor's SetParameterRow) — the parsed array is written to the model on
 * every change, but the *displayed* text isn't re-derived from that array until blur. */
function SetParameterValuesInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { t } = useI18n();
  const [raw, setRaw] = useState(value.join(', '));
  return (
    <input
      aria-label={t('ci_param_values_aria')}
      placeholder={t('ci_param_values_placeholder')}
      data-testid="profile-sp-values"
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(parseCommaList(e.target.value));
      }}
      onBlur={() => setRaw(value.join(', '))}
    />
  );
}

export function ProfileEditorPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const isNew = !uuid;
  const [draft, setDraft] = useState<Profile | null>(isNew ? createBlankProfile() : null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importPick, setImportPick] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  // Stable per-row identity for set-parameters, kept in lockstep with
  // draft.modify.setParameters by every add/remove/load path below — `modify.set-parameters`
  // has no id field of its own (OSCAL), and keying the list by array index would let a later
  // row's <SetParameterValuesInput> (which buffers its own text locally) keep showing an
  // earlier row's stale text after a row above it is removed (React reuses the component
  // instance for a reused index/key without resetting its local state).
  const [spKeys, setSpKeys] = useState<string[]>([]);
  const workspaceCatalogs = useWorkspaceCatalogs();
  const workspaceProfiles = useWorkspaceProfiles();
  const catalogControlsByUuid = useCatalogControlsByUuid(workspaceCatalogs);
  useSeedDefaultCreator(isNew, setDraft);

  useEffect(() => {
    if (isNew || !uuid) return;
    let active = true;
    void repo()
      .get(uuid)
      .then((r) => {
        if (!active) return;
        if (r) {
          setDraft(r.artifact);
          setSpKeys((r.artifact.modify?.setParameters ?? []).map(() => globalThis.crypto.randomUUID()));
        } else {
          setNotFound(true);
        }
      });
    return () => {
      active = false;
    };
  }, [uuid, isNew]);

  if (notFound) {
    return (
      <main>
        <p>
          <Link to="/profiles">← {t('landing_feature_profiles')}</Link>
        </p>
        <p role="alert">{t('profile_not_found')}</p>
      </main>
    );
  }
  if (!draft) return <main>{t('common_loading')}</main>;

  function update(next: Profile) {
    setDraft(next);
  }

  const draftUuid = draft.uuid;

  function patchImport(idx: number, mutator: (imp: ProfileImport) => void) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      mutator(next.imports[idx]!);
      return next;
    });
  }

  /** Add an import of the picked workspace catalog/profile (ADR-0032 §2): rejects a profile-import
   * cycle before committing, then references the target via a back-matter resource. */
  function addImport() {
    const targetUuid = importPick.trim();
    if (!targetUuid) return;
    if (wouldCreateProfileCycle(draftUuid, targetUuid, workspaceProfiles)) {
      setImportError(t('profile_imports_cycle_error'));
      return;
    }
    const catalog = workspaceCatalogs.find((c) => c.uuid === targetUuid);
    const profile = workspaceProfiles.find((p) => p.uuid === targetUuid);
    const target = catalog ?? profile;
    if (!target) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const resourceUuid = ensureArtifactResource(next, target.uuid, target.artifact.metadata.title);
      const imp: ProfileImport = { href: `#${resourceUuid}` };
      applyInclusion(imp, { mode: 'all' });
      next.imports.push(imp);
      return next;
    });
    setImportPick('');
    setImportError(null);
  }

  function removeImport(idx: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.imports.splice(idx, 1);
      return next;
    });
  }

  function setImportMode(idx: number, mode: 'all' | 'byId') {
    patchImport(idx, (imp) => applyInclusion(imp, mode === 'all' ? { mode: 'all' } : { mode: 'byId', ids: [] }));
  }

  function setIncludeIds(idx: number, ids: Set<string>) {
    patchImport(idx, (imp) => applyInclusion(imp, { mode: 'byId', ids: [...ids] }));
  }

  function setIncludeIdsText(idx: number, text: string) {
    patchImport(idx, (imp) => applyInclusion(imp, { mode: 'byId', ids: parseCommaList(text) }));
  }

  function toggleExclude(idx: number, on: boolean) {
    patchImport(idx, (imp) => applyExclusion(imp, on ? [] : undefined));
  }

  function setExcludeIds(idx: number, ids: Set<string>) {
    patchImport(idx, (imp) => applyExclusion(imp, [...ids]));
  }

  function setExcludeIdsText(idx: number, text: string) {
    patchImport(idx, (imp) => applyExclusion(imp, parseCommaList(text)));
  }

  function addSetParameter() {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      (next.modify ??= {}).setParameters ??= [];
      next.modify.setParameters!.push({ paramId: '', values: [] });
      return next;
    });
    setSpKeys((prev) => [...prev, globalThis.crypto.randomUUID()]);
  }

  function patchSetParameter(idx: number, patch: Partial<ProfileSetParameter>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      Object.assign(next.modify!.setParameters![idx]!, patch);
      return next;
    });
  }

  function removeSetParameter(idx: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.modify!.setParameters!.splice(idx, 1);
      return next;
    });
    setSpKeys((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const current = draft;
    if (!current || !current.metadata.title.trim()) return;
    setSaving(true);
    try {
      const toSave = structuredClone(current);
      toSave.metadata.lastModified = new Date().toISOString();
      if (isNew) {
        await repo().create({ uuid: toSave.uuid, type: 'profile', origin: 'user', artifact: toSave });
      } else {
        await repo().update(toSave.uuid, toSave);
      }
      await syncUnresolvedReferences(
        toSave.uuid,
        'profiles',
        'profile-import',
        unresolvedProfileImportHrefs(toSave.imports, toSave.backMatter, workspaceCatalogs, workspaceProfiles),
      );
      navigate(`/profiles/${toSave.uuid}`);
    } finally {
      setSaving(false);
    }
  }

  const imports = draft.imports;
  const importSearchItems: SearchItem[] = [
    ...workspaceCatalogs.map((c): SearchItem => ({ id: c.uuid, title: c.artifact.metadata.title, badge: c.origin })),
    ...workspaceProfiles
      .filter((p) => p.uuid !== draftUuid && !wouldCreateProfileCycle(draftUuid, p.uuid, workspaceProfiles))
      .map((p): SearchItem => ({ id: p.uuid, title: p.artifact.metadata.title, badge: p.origin })),
  ];
  const unresolvedCount = unresolvedProfileImportHrefs(imports, draft.backMatter, workspaceCatalogs, workspaceProfiles).length;
  const setParameters = draft.modify?.setParameters ?? [];

  return (
    <main data-testid="profile-editor">
      <p>
        <Link to="/profiles">← {t('landing_feature_profiles')}</Link>
      </p>
      <h1>{isNew ? `➕ ${t('profile_new')}` : `✎ ${t('profile_edit_heading')}`}</h1>

      <MetadataEditor artifact={draft} onChange={update} />

      <fieldset>
        <legend>{t('profile_imports_heading', { count: imports.length })}</legend>
        {unresolvedCount > 0 && (
          <p role="status" data-testid="profile-imports-unresolved-banner" style={{ color: 'var(--color-warning, #a15c00)' }}>
            ⚠️ {t('profile_imports_unresolved_banner', { count: unresolvedCount })}
          </p>
        )}
        <ul data-testid="profile-imports-list">
          {imports.map((imp, i) => {
            const resolved = resolveProfileImportSource(imp, draft.backMatter, workspaceCatalogs, workspaceProfiles);
            // A profile-sourced import's checklist universe is *that* profile's own effective
            // control set, recursively resolved through its own imports (T-206, ADR-0032 §5) —
            // same shape a catalog-sourced universe already has, so the same
            // <ControlSelectionChecklist> renders either way instead of falling back to a plain
            // comma-separated text field.
            const nestedResolution =
              resolved?.type === 'profile'
                ? resolveProfileEffectiveControls(resolved.item.artifact, workspaceCatalogs, workspaceProfiles)
                : undefined;
            const controlsById =
              resolved?.type === 'catalog' ? catalogControlsByUuid.get(resolved.item.uuid) : nestedResolution?.controlsById;
            const mode: 'all' | 'byId' = imp.includeAll ? 'all' : 'byId';
            return (
              <li key={`${imp.href}-${i}`} className="collapsible-section" data-testid="profile-import-item">
                {resolved ? (
                  <span data-testid="profile-import-source">
                    {resolved.type === 'catalog' ? '📘' : '📑'}{' '}
                    <Link to={resolved.type === 'catalog' ? '/catalogs' : `/profiles/${resolved.item.uuid}`}>
                      {resolved.item.artifact.metadata.title}
                    </Link>
                  </span>
                ) : (
                  <span data-testid="profile-import-unresolved" title={imp.href}>
                    ⚠️ {t('profile_imports_unresolved')}
                  </span>
                )}{' '}
                <button
                  type="button"
                  aria-label={t('profile_imports_remove_aria', { title: resolved?.item.artifact.metadata.title ?? imp.href })}
                  data-testid="profile-import-remove"
                  onClick={() => removeImport(i)}
                >
                  🗑️ {t('profile_imports_remove_button')}
                </button>
                <div className="collapsible-body">
                  <label>
                    <input
                      type="radio"
                      name={`import-mode-${i}`}
                      checked={mode === 'all'}
                      onChange={() => setImportMode(i, 'all')}
                      data-testid="profile-import-mode-all"
                    />{' '}
                    {t('profile_imports_mode_all')}
                  </label>{' '}
                  <label>
                    <input
                      type="radio"
                      name={`import-mode-${i}`}
                      checked={mode === 'byId'}
                      onChange={() => setImportMode(i, 'byId')}
                      data-testid="profile-import-mode-by-id"
                    />{' '}
                    {t('profile_imports_mode_by_id')}
                  </label>
                  {nestedResolution?.hasUnresolved && (
                    <p data-testid="profile-import-nested-unresolved-hint">
                      <small>⚠️ {t('profile_imports_nested_unresolved_hint')}</small>
                    </p>
                  )}
                  {mode === 'byId' &&
                    (controlsById ? (
                      <ControlSelectionChecklist
                        controlsById={controlsById}
                        selectedIds={new Set(imp.includeControls?.[0]?.withIds ?? [])}
                        onChange={(ids) => setIncludeIds(i, ids)}
                        dataTestId="profile-import-include-checklist"
                      />
                    ) : (
                      <label>
                        {t('profile_imports_ids_text_label')}
                        <input
                          data-testid="profile-import-include-text"
                          value={(imp.includeControls?.[0]?.withIds ?? []).join(', ')}
                          onChange={(e) => setIncludeIdsText(i, e.target.value)}
                        />
                      </label>
                    ))}
                  <p>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!imp.excludeControls}
                        onChange={(e) => toggleExclude(i, e.target.checked)}
                        data-testid="profile-import-exclude-toggle"
                      />{' '}
                      {t('profile_imports_exclude_toggle')}
                    </label>
                  </p>
                  {imp.excludeControls &&
                    (controlsById ? (
                      <ControlSelectionChecklist
                        controlsById={controlsById}
                        selectedIds={new Set(imp.excludeControls[0]?.withIds ?? [])}
                        onChange={(ids) => setExcludeIds(i, ids)}
                        dataTestId="profile-import-exclude-checklist"
                      />
                    ) : (
                      <label>
                        {t('profile_imports_ids_text_label')}
                        <input
                          data-testid="profile-import-exclude-text"
                          value={(imp.excludeControls[0]?.withIds ?? []).join(', ')}
                          onChange={(e) => setExcludeIdsText(i, e.target.value)}
                        />
                      </label>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
        <label>
          {t('profile_imports_add_label')}
          <EntitySearchField
            ariaLabel={t('profile_imports_add_aria')}
            dataTestId="profile-import-picker"
            items={importSearchItems}
            value={importPick}
            onChange={setImportPick}
          />
        </label>{' '}
        <button type="button" data-testid="profile-import-add" onClick={addImport}>
          ➕ {t('profile_imports_add_label')}
        </button>
        {importError && (
          <p role="alert" data-testid="profile-import-error">
            ⚠️ {importError}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>{t('profile_set_parameters_heading', { count: setParameters.length })}</legend>
        <ul data-testid="profile-set-parameters-list">
          {setParameters.map((sp, i) => (
            <li key={spKeys[i] ?? i} data-testid="profile-set-parameter">
              <input
                aria-label={t('ci_param_id_aria')}
                placeholder={t('ci_param_id_placeholder')}
                data-testid="profile-sp-param-id"
                value={sp.paramId}
                onChange={(e) => patchSetParameter(i, { paramId: e.target.value })}
              />{' '}
              <SetParameterValuesInput
                value={sp.values ?? []}
                onChange={(values) => patchSetParameter(i, { values })}
              />{' '}
              <button type="button" data-testid="profile-sp-remove" onClick={() => removeSetParameter(i)}>
                🗑️ {t('ci_remove_set_parameter')}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" data-testid="profile-sp-add" onClick={addSetParameter}>
          ➕ {t('profile_set_parameters_add')}
        </button>
      </fieldset>

      <BackMatterEditor artifact={draft} onChange={update} />

      <div>
        <button type="button" data-testid="save-profile" onClick={() => void save()} disabled={saving}>
          💾 {t('common_save')}
        </button>{' '}
        {!draft.metadata.title.trim() && <small>{t('profile_title_required')}</small>}
      </div>
    </main>
  );
}
