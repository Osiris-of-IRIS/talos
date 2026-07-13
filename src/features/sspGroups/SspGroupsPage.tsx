/**
 * SSP Groups management (T-512, ADR-0037): a small user-authored tree used to scope the
 * "apply a change to other SSPs" propagation feature. Not an OSCAL artifact — same tier as
 * assets/asset-types (ADR-0026) — so this is a bespoke CRUD page over `sspGroupRepository.ts`,
 * not an `ArtifactRepository`-backed list/detail/editor trio like the OSCAL features.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import { getAllSspGroups, createSspGroup, updateSspGroup, deleteSspGroup } from '@/data/sspGroupRepository';
import { descendantChain, groupDepth } from '@/data/sspGroupHierarchy';
import type { SspGroup } from '@/models/sspGroup';

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export function SspGroupsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<SspGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedTitles, setEditedTitles] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState('');
  const [newParentUuid, setNewParentUuid] = useState('');

  async function refresh() {
    setGroups(await getAllSspGroups());
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function addGroup() {
    const title = newTitle.trim();
    if (!title) return;
    await createSspGroup({ uuid: uuid(), title, parentGroupUuid: newParentUuid || undefined });
    setNewTitle('');
    setNewParentUuid('');
    await refresh();
  }

  async function renameGroup(group: SspGroup) {
    const title = (editedTitles[group.uuid] ?? group.title).trim();
    if (!title || title === group.title) return;
    await updateSspGroup({ ...group, title });
    await refresh();
  }

  async function reparentGroup(group: SspGroup, parentGroupUuid: string) {
    await updateSspGroup({ ...group, parentGroupUuid: parentGroupUuid || undefined });
    await refresh();
  }

  async function removeGroup(group: SspGroup) {
    if (!globalThis.confirm(t('ssp_groups_delete_confirm', { title: group.title }))) return;
    await deleteSspGroup(group.uuid);
    await refresh();
  }

  const byUuid = new Map(groups.map((g) => [g.uuid, g]));

  return (
    <main data-testid="ssp-groups-page">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>🗂️ {t('ssp_groups_heading')}</h1>
      <p>
        <small>{t('ssp_groups_intro')}</small>
      </p>

      {loading ? (
        <p>{t('common_loading')}</p>
      ) : groups.length === 0 ? (
        <p data-testid="ssp-groups-empty">{t('ssp_groups_empty')}</p>
      ) : (
        <ul data-testid="ssp-groups-list">
          {groups.map((group) => {
            // A group can never become its own descendant's child (would create a cycle) — the
            // parent-picker excludes the group itself and everything already under it.
            const excluded = new Set(descendantChain(group.uuid, groups));
            const parentOptions = groups.filter((g) => !excluded.has(g.uuid));
            return (
              <li key={group.uuid} data-testid="ssp-group-row" style={{ paddingLeft: `${groupDepth(group.uuid, byUuid) * 1.5}rem` }}>
                <input
                  aria-label={t('ssp_groups_title_aria')}
                  data-testid="ssp-group-title"
                  value={editedTitles[group.uuid] ?? group.title}
                  onChange={(e) => setEditedTitles((prev) => ({ ...prev, [group.uuid]: e.target.value }))}
                  onBlur={() => void renameGroup(group)}
                />
                <label>
                  {t('ssp_groups_parent_label')}
                  <select
                    aria-label={t('ssp_groups_parent_label')}
                    data-testid="ssp-group-parent"
                    value={group.parentGroupUuid ?? ''}
                    onChange={(e) => void reparentGroup(group, e.target.value)}
                  >
                    <option value="">{t('ssp_groups_parent_none')}</option>
                    {parentOptions.map((p) => (
                      <option key={p.uuid} value={p.uuid}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" aria-label={t('ssp_groups_delete_aria', { title: group.title })} onClick={() => void removeGroup(group)}>
                  🗑️
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <fieldset>
        <legend>{t('ssp_groups_add_heading')}</legend>
        <label>
          {t('ssp_groups_title_aria')}
          <input
            aria-label={t('ssp_groups_title_aria')}
            data-testid="ssp-group-new-title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
        </label>
        <label>
          {t('ssp_groups_parent_label')}
          <select
            aria-label={t('ssp_groups_parent_label')}
            data-testid="ssp-group-new-parent"
            value={newParentUuid}
            onChange={(e) => setNewParentUuid(e.target.value)}
          >
            <option value="">{t('ssp_groups_parent_none')}</option>
            {groups.map((g) => (
              <option key={g.uuid} value={g.uuid}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" data-testid="ssp-group-add" disabled={!newTitle.trim()} onClick={() => void addGroup()}>
          ➕ {t('ssp_groups_add_button')}
        </button>
      </fieldset>
    </main>
  );
}
