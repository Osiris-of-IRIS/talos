// Reusable metadata editor — used by every artifact type. Decision IDs: ADR-0003, ADR-0015, ADR-0017, ADR-0019, ADR-0012.
import { useState } from 'react';
import { externalizeLink, isExternalUrl } from '@/models/backMatter';
import { validateCreator } from '@/models/creator';
import { useI18n } from '@/shared/i18n';
import { MarkupEditor } from '@/shared/MarkupEditor';
import type { OscalArtifact, Party } from '@/models/oscalBase';

interface Props<T extends OscalArtifact> {
  artifact: T;
  onChange: (next: T) => void;
}

export function MetadataEditor<T extends OscalArtifact>({ artifact, onChange }: Props<T>) {
  const { t } = useI18n();
  const [linkHref, setLinkHref] = useState('');
  const [linkText, setLinkText] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [roleError, setRoleError] = useState<string | null>(null);
  const [partyType, setPartyType] = useState<Party['type']>('organization');
  const [partyName, setPartyName] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [rpRoleId, setRpRoleId] = useState('');
  const [rpPartyUuids, setRpPartyUuids] = useState<Set<string>>(new Set());

  function patch(mutator: (draft: T) => void) {
    const draft = structuredClone(artifact);
    mutator(draft);
    onChange(draft);
  }

  const md = artifact.metadata;
  const links = md.links ?? [];
  const roles = md.roles ?? [];
  const parties = md.parties ?? [];
  const responsibleParties = md.responsibleParties ?? [];

  // A responsible-party's role-id is unique within metadata (OSCAL), so only offer roles that
  // are not yet assigned. Combined with party checkboxes seeded from `parties`, this makes it
  // impossible to reference a role or party not defined in the document (ADR-0003/0017).
  const assignedRoleIds = new Set(responsibleParties.map((rp) => rp.roleId));
  const availableRoles = roles.filter((r) => !assignedRoleIds.has(r.id));
  const canAssign = availableRoles.length > 0 && parties.length > 0;

  function addRole() {
    const id = roleId.trim();
    const title = roleTitle.trim();
    if (!id || !title) return;
    if (roles.some((r) => r.id === id)) {
      setRoleError(t('md_role_duplicate_error', { id }));
      return;
    }
    patch((d) => ((d.metadata.roles ??= []).push({ id, title })));
    setRoleId('');
    setRoleTitle('');
    setRoleError(null);
  }

  function removeRole(id: string) {
    patch((d) => {
      d.metadata.roles = (d.metadata.roles ?? []).filter((r) => r.id !== id);
      // integrity: a responsible-party that referenced this role can no longer resolve.
      d.metadata.responsibleParties = (d.metadata.responsibleParties ?? []).filter(
        (rp) => rp.roleId !== id,
      );
    });
  }

  function addParty() {
    const name = partyName.trim();
    if (!name) return;
    const email = partyEmail.trim();
    patch((d) =>
      (d.metadata.parties ??= []).push({
        uuid: crypto.randomUUID(),
        type: partyType,
        name,
        ...(email ? { emailAddresses: [email] } : {}),
      }),
    );
    setPartyName('');
    setPartyEmail('');
  }

  function patchParty(uuid: string, mutator: (p: Party) => void) {
    patch((d) => {
      const p = (d.metadata.parties ?? []).find((x) => x.uuid === uuid);
      if (p) mutator(p);
    });
  }

  function setPartyEmailValue(uuid: string, value: string) {
    const v = value.trim();
    patchParty(uuid, (p) => {
      if (v) p.emailAddresses = [v];
      else delete p.emailAddresses;
    });
  }

  function setAddressField(uuid: string, field: 'city' | 'state' | 'postalCode' | 'country' | 'line', value: string) {
    patchParty(uuid, (p) => {
      const addr = (p.addresses ??= [{}])[0]!;
      if (field === 'line') {
        if (value.trim()) addr.addrLines = [value];
        else delete addr.addrLines;
      } else if (value.trim()) {
        addr[field] = value;
      } else {
        delete addr[field];
      }
      // drop an empty address object entirely
      if (Object.keys(addr).length === 0) delete p.addresses;
    });
  }

  function toggleMembership(uuid: string, orgUuid: string) {
    patchParty(uuid, (p) => {
      const set = new Set(p.memberOfOrganizations ?? []);
      if (set.has(orgUuid)) set.delete(orgUuid);
      else set.add(orgUuid);
      if (set.size > 0) p.memberOfOrganizations = [...set];
      else delete p.memberOfOrganizations;
    });
  }

  function removeParty(uuid: string) {
    patch((d) => {
      d.metadata.parties = (d.metadata.parties ?? []).filter((p) => p.uuid !== uuid);
      // integrity: strip the uuid from every responsible-party; drop any left with no parties.
      d.metadata.responsibleParties = (d.metadata.responsibleParties ?? [])
        .map((rp) => ({ ...rp, partyUuids: rp.partyUuids.filter((u) => u !== uuid) }))
        .filter((rp) => rp.partyUuids.length > 0);
    });
  }

  function toggleRpParty(uuid: string) {
    setRpPartyUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  function addResponsibleParty() {
    if (!rpRoleId || rpPartyUuids.size === 0) return;
    // guard: only references that exist in the document (defensive; UI already constrains this).
    if (!roles.some((r) => r.id === rpRoleId)) return;
    const uuids = [...rpPartyUuids].filter((u) => parties.some((p) => p.uuid === u));
    if (uuids.length === 0) return;
    patch((d) => ((d.metadata.responsibleParties ??= []).push({ roleId: rpRoleId, partyUuids: uuids })));
    setRpRoleId('');
    setRpPartyUuids(new Set());
  }

  const roleTitleById = (id: string) => roles.find((r) => r.id === id)?.title ?? id;
  const partyNameByUuid = (uuid: string) => parties.find((p) => p.uuid === uuid)?.name ?? uuid;
  const organizations = parties.filter((p) => p.type === 'organization');
  const creatorProblems = validateCreator(md); // ADR-0019: mandatory creator (name + email)

  function addLink() {
    const href = linkHref.trim();
    if (!href) return;
    patch((d) => {
      // External URLs are externalized into back-matter and referenced by #uuid (ADR-0015).
      const link = externalizeLink(d, { href, ...(linkText.trim() ? { text: linkText.trim() } : {}) });
      (d.metadata.links ??= []).push(link);
    });
    setLinkHref('');
    setLinkText('');
  }

  return (
    <fieldset data-testid="metadata-editor">
      <legend>{t('md_legend')}</legend>

      <label>
        {t('md_title_label')}
        <input
          data-testid="md-title"
          value={md.title}
          onChange={(e) => patch((d) => (d.metadata.title = e.target.value))}
        />
      </label>

      <label>
        {t('md_version_label')}
        <input
          data-testid="md-version"
          value={md.version}
          onChange={(e) => patch((d) => (d.metadata.version = e.target.value))}
        />
      </label>

      <label>
        {t('md_remarks_label')}
        <MarkupEditor
          dataTestId="md-remarks"
          ariaLabel={t('md_remarks_label')}
          rows={7}
          value={md.remarks ?? ''}
          onChange={(v) => patch((d) => (d.metadata.remarks = v || undefined))}
        />
      </label>

      <div data-testid="md-roles">
        <strong>{t('md_roles_heading')}</strong> <small>{t('md_roles_hint')}</small>
        <ul>
          {roles.map((r) => (
            <li key={r.id} data-testid="md-role">
              🧑‍💼 <strong>{r.title}</strong> <small>({r.id})</small>{' '}
              <button
                type="button"
                aria-label={t('md_remove_role', { id: r.id })}
                onClick={() => removeRole(r.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <input
          data-testid="md-role-id"
          placeholder={t('md_role_id_placeholder')}
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
        />
        <input
          data-testid="md-role-title"
          placeholder={t('md_role_title_placeholder')}
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
        />
        <button type="button" data-testid="md-add-role" onClick={addRole}>
          ➕ {t('md_add_role')}
        </button>
        {roleError && (
          <p role="alert" data-testid="md-role-error">
            ⚠️ {roleError}
          </p>
        )}
      </div>

      <div data-testid="md-parties">
        <strong>{t('md_parties_heading')}</strong> <small>{t('md_parties_hint')}</small>
        <ul>
          {parties.map((p) => (
            <li key={p.uuid} data-testid="md-party">
              {p.type === 'person' ? '👤' : '🏢'} <strong>{p.name}</strong>{' '}
              <small>{p.emailAddresses?.[0] ? `✉️ ${p.emailAddresses[0]}` : ''}</small>{' '}
              <button
                type="button"
                aria-label={t('md_remove_party', { name: p.name ?? '' })}
                onClick={() => removeParty(p.uuid)}
              >
                ✕
              </button>
              <details data-testid={`md-party-details-${p.uuid}`}>
                <summary>{t('md_party_details_summary')}</summary>
                <label>
                  {t('md_email_label')}
                  <input
                    aria-label={t('md_email_for', { name: p.name ?? '' })}
                    value={p.emailAddresses?.[0] ?? ''}
                    onChange={(e) => setPartyEmailValue(p.uuid, e.target.value)}
                  />
                </label>
                <fieldset>
                  <legend>{t('md_address_legend')}</legend>
                  <input
                    aria-label={t('md_address_line_for', { name: p.name ?? '' })}
                    placeholder={t('md_address_line_placeholder')}
                    value={p.addresses?.[0]?.addrLines?.[0] ?? ''}
                    onChange={(e) => setAddressField(p.uuid, 'line', e.target.value)}
                  />
                  <input
                    aria-label={t('md_city_for', { name: p.name ?? '' })}
                    placeholder={t('md_city_placeholder')}
                    value={p.addresses?.[0]?.city ?? ''}
                    onChange={(e) => setAddressField(p.uuid, 'city', e.target.value)}
                  />
                  <input
                    aria-label={t('md_postal_code_for', { name: p.name ?? '' })}
                    placeholder={t('md_postal_code_placeholder')}
                    value={p.addresses?.[0]?.postalCode ?? ''}
                    onChange={(e) => setAddressField(p.uuid, 'postalCode', e.target.value)}
                  />
                  <input
                    aria-label={t('md_country_for', { name: p.name ?? '' })}
                    placeholder={t('md_country_placeholder')}
                    value={p.addresses?.[0]?.country ?? ''}
                    onChange={(e) => setAddressField(p.uuid, 'country', e.target.value)}
                  />
                </fieldset>
                {organizations.some((o) => o.uuid !== p.uuid) && (
                  <fieldset>
                    <legend>{t('md_member_of_orgs_legend')}</legend>
                    {organizations
                      .filter((o) => o.uuid !== p.uuid)
                      .map((o) => (
                        <label key={o.uuid}>
                          <input
                            type="checkbox"
                            checked={(p.memberOfOrganizations ?? []).includes(o.uuid)}
                            onChange={() => toggleMembership(p.uuid, o.uuid)}
                          />
                          {o.name}
                        </label>
                      ))}
                  </fieldset>
                )}
              </details>
            </li>
          ))}
        </ul>
        <select
          data-testid="md-party-type"
          value={partyType}
          onChange={(e) => setPartyType(e.target.value as Party['type'])}
        >
          <option value="organization">{t('md_party_type_organization')}</option>
          <option value="person">{t('md_party_type_person')}</option>
        </select>
        <input
          data-testid="md-party-name"
          placeholder={t('md_party_name_placeholder')}
          value={partyName}
          onChange={(e) => setPartyName(e.target.value)}
        />
        <input
          data-testid="md-party-email"
          placeholder={t('md_party_email_placeholder')}
          value={partyEmail}
          onChange={(e) => setPartyEmail(e.target.value)}
        />
        <button type="button" data-testid="md-add-party" onClick={addParty}>
          ➕ {t('md_add_party')}
        </button>
      </div>

      <div data-testid="md-responsible-parties">
        <strong>{t('md_responsible_parties_heading')}</strong> <small>{t('md_responsible_parties_hint')}</small>
        {creatorProblems.length > 0 ? (
          <p role="status" data-testid="md-creator-status" style={{ color: 'var(--color-warning, #a15c00)' }}>
            ⚠️ {t('md_creator_required', { problems: creatorProblems.join(' ') })}
          </p>
        ) : (
          <p data-testid="md-creator-status" style={{ color: 'var(--color-ok, #1a7f37)' }}>
            ✓ {t('md_creator_set')}
          </p>
        )}
        <ul>
          {responsibleParties.map((rp) => (
            <li key={rp.roleId} data-testid="md-rp">
              <strong>{roleTitleById(rp.roleId)}</strong>: {rp.partyUuids.map(partyNameByUuid).join(', ')}{' '}
              <button
                type="button"
                aria-label={t('md_remove_responsible_party', { roleId: rp.roleId })}
                onClick={() =>
                  patch(
                    (d) =>
                      (d.metadata.responsibleParties = (d.metadata.responsibleParties ?? []).filter(
                        (x) => x.roleId !== rp.roleId,
                      )),
                  )
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {canAssign ? (
          <div>
            <select
              data-testid="md-rp-role"
              value={rpRoleId}
              onChange={(e) => setRpRoleId(e.target.value)}
            >
              <option value="">{t('md_rp_role_placeholder')}</option>
              {availableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.id})
                </option>
              ))}
            </select>
            <fieldset data-testid="md-rp-parties">
              <legend>{t('md_parties_heading')}</legend>
              {parties.map((p) => (
                <label key={p.uuid}>
                  <input
                    type="checkbox"
                    checked={rpPartyUuids.has(p.uuid)}
                    onChange={() => toggleRpParty(p.uuid)}
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              data-testid="md-add-rp"
              disabled={!rpRoleId || rpPartyUuids.size === 0}
              onClick={addResponsibleParty}
            >
              ➕ {t('md_assign_responsible_party')}
            </button>
          </div>
        ) : (
          <p data-testid="md-rp-guidance">
            <small>
              {roles.length === 0 || parties.length === 0
                ? t('md_rp_guidance_need_both')
                : t('md_rp_guidance_all_assigned')}
            </small>
          </p>
        )}
      </div>

      <div>
        <strong>{t('md_links_heading')}</strong> <small>{t('md_links_hint')}</small>
        <ul>
          {links.map((l, i) => (
            <li key={`${l.href}-${i}`} data-testid="md-link">
              🔗 {l.text ?? l.href} <small>({l.href})</small>{' '}
              <button
                type="button"
                aria-label={t('md_remove_link', { text: l.text ?? l.href })}
                onClick={() => patch((d) => d.metadata.links?.splice(i, 1))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <input
          data-testid="md-link-href"
          placeholder={t('md_link_href_placeholder')}
          value={linkHref}
          onChange={(e) => setLinkHref(e.target.value)}
        />
        <input
          data-testid="md-link-text"
          placeholder={t('md_link_text_placeholder')}
          value={linkText}
          onChange={(e) => setLinkText(e.target.value)}
        />
        <button type="button" data-testid="md-add-link" onClick={addLink}>
          ➕ {t('md_add_link')}
        </button>
        {isExternalUrl(linkHref) && <small> {t('md_link_backmatter_hint')}</small>}
      </div>
    </fieldset>
  );
}
