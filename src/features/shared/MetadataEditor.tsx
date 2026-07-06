// Reusable metadata editor — used by every artifact type. Decision IDs: ADR-0003, ADR-0015, ADR-0017, ADR-0019.
import { useState } from 'react';
import { externalizeLink, isExternalUrl } from '@/models/backMatter';
import { validateCreator } from '@/models/creator';
import type { OscalArtifact, Party } from '@/models/oscalBase';

interface Props<T extends OscalArtifact> {
  artifact: T;
  onChange: (next: T) => void;
}

export function MetadataEditor<T extends OscalArtifact>({ artifact, onChange }: Props<T>) {
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
      setRoleError(`A role with id "${id}" already exists.`);
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
      <legend>Metadata</legend>

      <label>
        Title
        <input
          data-testid="md-title"
          value={md.title}
          onChange={(e) => patch((d) => (d.metadata.title = e.target.value))}
        />
      </label>

      <label>
        Version
        <input
          data-testid="md-version"
          value={md.version}
          onChange={(e) => patch((d) => (d.metadata.version = e.target.value))}
        />
      </label>

      <label>
        Remarks
        <textarea
          data-testid="md-remarks"
          value={md.remarks ?? ''}
          onChange={(e) => patch((d) => (d.metadata.remarks = e.target.value || undefined))}
        />
      </label>

      <div data-testid="md-roles">
        <strong>Roles</strong> <small>(referenceable by responsible-parties)</small>
        <ul>
          {roles.map((r) => (
            <li key={r.id} data-testid="md-role">
              🧑‍💼 <strong>{r.title}</strong> <small>({r.id})</small>{' '}
              <button type="button" aria-label={`Remove role ${r.id}`} onClick={() => removeRole(r.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <input
          data-testid="md-role-id"
          placeholder="id (e.g. provider)"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
        />
        <input
          data-testid="md-role-title"
          placeholder="title"
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
        />
        <button type="button" data-testid="md-add-role" onClick={addRole}>
          ➕ Add role
        </button>
        {roleError && (
          <p role="alert" data-testid="md-role-error">
            ⚠️ {roleError}
          </p>
        )}
      </div>

      <div data-testid="md-parties">
        <strong>Parties</strong> <small>(persons/organizations)</small>
        <ul>
          {parties.map((p) => (
            <li key={p.uuid} data-testid="md-party">
              {p.type === 'person' ? '👤' : '🏢'} <strong>{p.name}</strong>{' '}
              <small>{p.emailAddresses?.[0] ? `✉️ ${p.emailAddresses[0]}` : ''}</small>{' '}
              <button type="button" aria-label={`Remove party ${p.name}`} onClick={() => removeParty(p.uuid)}>
                ✕
              </button>
              <details data-testid={`md-party-details-${p.uuid}`}>
                <summary>Details (optional)</summary>
                <label>
                  Email
                  <input
                    aria-label={`Email for ${p.name}`}
                    value={p.emailAddresses?.[0] ?? ''}
                    onChange={(e) => setPartyEmailValue(p.uuid, e.target.value)}
                  />
                </label>
                <fieldset>
                  <legend>Address</legend>
                  <input
                    aria-label={`Address line for ${p.name}`}
                    placeholder="street / line"
                    value={p.addresses?.[0]?.addrLines?.[0] ?? ''}
                    onChange={(e) => setAddressField(p.uuid, 'line', e.target.value)}
                  />
                  <input
                    aria-label={`City for ${p.name}`}
                    placeholder="city"
                    value={p.addresses?.[0]?.city ?? ''}
                    onChange={(e) => setAddressField(p.uuid, 'city', e.target.value)}
                  />
                  <input
                    aria-label={`Postal code for ${p.name}`}
                    placeholder="postal code"
                    value={p.addresses?.[0]?.postalCode ?? ''}
                    onChange={(e) => setAddressField(p.uuid, 'postalCode', e.target.value)}
                  />
                  <input
                    aria-label={`Country for ${p.name}`}
                    placeholder="country"
                    value={p.addresses?.[0]?.country ?? ''}
                    onChange={(e) => setAddressField(p.uuid, 'country', e.target.value)}
                  />
                </fieldset>
                {organizations.some((o) => o.uuid !== p.uuid) && (
                  <fieldset>
                    <legend>Member of organizations</legend>
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
          <option value="organization">Organization</option>
          <option value="person">Person</option>
        </select>
        <input
          data-testid="md-party-name"
          placeholder="name"
          value={partyName}
          onChange={(e) => setPartyName(e.target.value)}
        />
        <input
          data-testid="md-party-email"
          placeholder="email (required for a creator)"
          value={partyEmail}
          onChange={(e) => setPartyEmail(e.target.value)}
        />
        <button type="button" data-testid="md-add-party" onClick={addParty}>
          ➕ Add party
        </button>
      </div>

      <div data-testid="md-responsible-parties">
        <strong>Responsible parties</strong>{' '}
        <small>(assign a defined party to a defined role)</small>
        {creatorProblems.length > 0 ? (
          <p role="status" data-testid="md-creator-status" style={{ color: 'var(--color-warning, #a15c00)' }}>
            ⚠️ Creator required: {creatorProblems.join(' ')}
          </p>
        ) : (
          <p data-testid="md-creator-status" style={{ color: 'var(--color-ok, #1a7f37)' }}>
            ✓ Creator set
          </p>
        )}
        <ul>
          {responsibleParties.map((rp) => (
            <li key={rp.roleId} data-testid="md-rp">
              <strong>{roleTitleById(rp.roleId)}</strong>: {rp.partyUuids.map(partyNameByUuid).join(', ')}{' '}
              <button
                type="button"
                aria-label={`Remove responsible party ${rp.roleId}`}
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
              <option value="">— select role —</option>
              {availableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.id})
                </option>
              ))}
            </select>
            <fieldset data-testid="md-rp-parties">
              <legend>Parties</legend>
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
              ➕ Assign responsible party
            </button>
          </div>
        ) : (
          <p data-testid="md-rp-guidance">
            <small>
              {roles.length === 0 || parties.length === 0
                ? 'Define at least one role and one party to assign responsible parties.'
                : 'All roles already have a responsible party.'}
            </small>
          </p>
        )}
      </div>

      <div>
        <strong>Links</strong>{' '}
        <small>(external URLs become back-matter resources — ADR-0015)</small>
        <ul>
          {links.map((l, i) => (
            <li key={`${l.href}-${i}`} data-testid="md-link">
              🔗 {l.text ?? l.href} <small>({l.href})</small>{' '}
              <button
                type="button"
                aria-label={`Remove link ${l.text ?? l.href}`}
                onClick={() => patch((d) => d.metadata.links?.splice(i, 1))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <input
          data-testid="md-link-href"
          placeholder="https://… or #ref"
          value={linkHref}
          onChange={(e) => setLinkHref(e.target.value)}
        />
        <input
          data-testid="md-link-text"
          placeholder="link text (optional)"
          value={linkText}
          onChange={(e) => setLinkText(e.target.value)}
        />
        <button type="button" data-testid="md-add-link" onClick={addLink}>
          ➕ Add link
        </button>
        {isExternalUrl(linkHref) && <small> → will be stored in back-matter</small>}
      </div>
    </fieldset>
  );
}
