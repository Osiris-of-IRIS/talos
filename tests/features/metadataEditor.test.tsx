/**
 * Shared MetadataEditor — roles, parties, responsible-parties. Decision IDs: ADR-0001, ADR-0003, ADR-0017.
 * Covers TEST-META-01 (feature_registry PLAT-004).
 *
 * Enforces the OSCAL referential model: a responsible-party's role-id must reference a role
 * defined in the document, and its party-uuids must reference parties defined in the document.
 * The UI therefore only lets you compose responsible-parties from existing roles/parties, and
 * keeps integrity when roles/parties are deleted.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetadataEditor } from '@/features/shared/MetadataEditor';
import type { ComponentDefinition } from '@/models/componentDefinition';

function makeArtifact(): ComponentDefinition {
  return {
    uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    metadata: {
      title: 'Test CD',
      version: '1.0.0',
      oscalVersion: '1.2.2',
      lastModified: '2026-07-03T10:00:00Z',
    },
  };
}

/** Controlled harness so the editor reflects its own onChange updates. */
function Harness() {
  const [a, setA] = useState<ComponentDefinition>(makeArtifact());
  return (
    <>
      <MetadataEditor artifact={a} onChange={setA} />
      <pre data-testid="dump">{JSON.stringify(a.metadata)}</pre>
    </>
  );
}

function dump() {
  return JSON.parse(screen.getByTestId('dump').textContent!) as ComponentDefinition['metadata'];
}

async function addRole(user: ReturnType<typeof userEvent.setup>, id: string, title: string) {
  await user.type(screen.getByTestId('md-role-id'), id);
  await user.type(screen.getByTestId('md-role-title'), title);
  await user.click(screen.getByTestId('md-add-role'));
}

async function addParty(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  type = 'organization',
  email?: string,
) {
  await user.selectOptions(screen.getByTestId('md-party-type'), type);
  await user.type(screen.getByTestId('md-party-name'), name);
  if (email) await user.type(screen.getByTestId('md-party-email'), email);
  await user.click(screen.getByTestId('md-add-party'));
}

describe('MetadataEditor roles & parties', () => {
  it('adds a role and a party into metadata', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await addRole(user, 'provider', 'Anbieter');
    await addParty(user, 'ACME GmbH');

    const md = dump();
    expect(md.roles).toEqual([{ id: 'provider', title: 'Anbieter' }]);
    expect(md.parties).toHaveLength(1);
    expect(md.parties![0]).toMatchObject({ type: 'organization', name: 'ACME GmbH' });
    expect(md.parties![0]!.uuid).toMatch(/[0-9a-f-]{36}/);
  });

  it('rejects a duplicate role id', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addRole(user, 'provider', 'Anbieter');
    await addRole(user, 'provider', 'Zweiter');
    expect(screen.getByTestId('md-role-error')).toBeInTheDocument();
    expect(dump().roles).toHaveLength(1);
  });
});

describe('MetadataEditor responsible-parties (referential integrity)', () => {
  it('gates the responsible-party form until at least one role AND one party exist', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByTestId('md-rp-guidance')).toBeInTheDocument();
    expect(screen.queryByTestId('md-rp-role')).not.toBeInTheDocument();

    await addRole(user, 'provider', 'Anbieter');
    expect(screen.getByTestId('md-rp-guidance')).toBeInTheDocument(); // still no party
    expect(screen.queryByTestId('md-rp-role')).not.toBeInTheDocument();

    await addParty(user, 'ACME GmbH');
    expect(screen.queryByTestId('md-rp-guidance')).not.toBeInTheDocument();
    expect(screen.getByTestId('md-rp-role')).toBeInTheDocument();
  });

  it('only offers roles and parties defined in the document', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addRole(user, 'provider', 'Anbieter');
    await addRole(user, 'owner', 'Eigentümer');
    await addParty(user, 'ACME GmbH');

    // role dropdown: empty option + exactly the two defined roles, nothing else
    const roleOptions = within(screen.getByTestId('md-rp-role')).getAllByRole('option');
    const roleValues = roleOptions.map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(roleValues).toEqual(['provider', 'owner']);

    // party choices are checkboxes seeded from the defined parties — no free-text ref input
    expect(screen.getByRole('checkbox', { name: /ACME GmbH/ })).toBeInTheDocument();
    expect(screen.queryByTestId('md-rp-party-freetext')).not.toBeInTheDocument();
  });

  it('assigns a responsible-party referencing a defined role-id and party-uuid', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addRole(user, 'provider', 'Anbieter');
    await addParty(user, 'ACME GmbH');
    const partyUuid = dump().parties![0]!.uuid;

    await user.selectOptions(screen.getByTestId('md-rp-role'), 'provider');
    await user.click(screen.getByRole('checkbox', { name: /ACME GmbH/ }));
    await user.click(screen.getByTestId('md-add-rp'));

    expect(dump().responsibleParties).toEqual([{ roleId: 'provider', partyUuids: [partyUuid] }]);
  });

  it('prevents a second responsible-party for the same role (role removed from the dropdown)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addRole(user, 'provider', 'Anbieter');
    await addParty(user, 'ACME GmbH');

    await user.selectOptions(screen.getByTestId('md-rp-role'), 'provider');
    await user.click(screen.getByRole('checkbox', { name: /ACME GmbH/ }));
    await user.click(screen.getByTestId('md-add-rp'));

    // all roles now assigned -> form gone, guidance shown, only one responsible-party
    expect(screen.queryByTestId('md-rp-role')).not.toBeInTheDocument();
    expect(dump().responsibleParties).toHaveLength(1);
  });

  it('keeps integrity when a party is removed (dropped from responsible-parties)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addRole(user, 'provider', 'Anbieter');
    await addParty(user, 'ACME GmbH');

    await user.selectOptions(screen.getByTestId('md-rp-role'), 'provider');
    await user.click(screen.getByRole('checkbox', { name: /ACME GmbH/ }));
    await user.click(screen.getByTestId('md-add-rp'));
    expect(dump().responsibleParties).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Remove party ACME GmbH/ }));

    expect(dump().parties ?? []).toHaveLength(0);
    // the responsible-party had only this party -> removed entirely (no dangling ref)
    expect(dump().responsibleParties ?? []).toHaveLength(0);
  });

  it('keeps integrity when a role is removed (its responsible-party is dropped)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addRole(user, 'provider', 'Anbieter');
    await addParty(user, 'ACME GmbH');

    await user.selectOptions(screen.getByTestId('md-rp-role'), 'provider');
    await user.click(screen.getByRole('checkbox', { name: /ACME GmbH/ }));
    await user.click(screen.getByTestId('md-add-rp'));

    await user.click(screen.getByRole('button', { name: /Remove role provider/ }));

    expect(dump().roles ?? []).toHaveLength(0);
    expect(dump().responsibleParties ?? []).toHaveLength(0);
  });
});

describe('MetadataEditor party depth & mandatory creator (ADR-0019)', () => {
  it('captures an email when adding a party', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addParty(user, 'Erika', 'person', 'erika@example.org');
    expect(dump().parties![0]!.emailAddresses).toEqual(['erika@example.org']);
  });

  it('warns until a creator with name + email is assigned, then clears', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId('md-creator-status')).toHaveTextContent(/Creator required/);

    await addRole(user, 'creator', 'Creator');
    await addParty(user, 'Erika', 'person', 'erika@example.org');
    await user.selectOptions(screen.getByTestId('md-rp-role'), 'creator');
    await user.click(screen.getByRole('checkbox', { name: /Erika/ }));
    await user.click(screen.getByTestId('md-add-rp'));

    expect(screen.getByTestId('md-creator-status')).toHaveTextContent(/Creator set/);
    expect(dump().responsibleParties).toEqual([{ roleId: 'creator', partyUuids: [expect.any(String)] }]);
  });

  it('still requires an email: a creator party without one keeps the warning', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addRole(user, 'creator', 'Creator');
    await addParty(user, 'Erika', 'person'); // no email
    await user.selectOptions(screen.getByTestId('md-rp-role'), 'creator');
    await user.click(screen.getByRole('checkbox', { name: /Erika/ }));
    await user.click(screen.getByTestId('md-add-rp'));
    expect(screen.getByTestId('md-creator-status')).toHaveTextContent(/missing an email/i);
  });

  it('edits optional address and org-membership on a party', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addParty(user, 'ACME GmbH', 'organization');
    await addParty(user, 'Erika', 'person', 'erika@example.org');

    await user.type(screen.getByLabelText('City for Erika'), 'Bonn');
    await user.type(screen.getByLabelText('Country for Erika'), 'DE');
    await user.click(screen.getByRole('checkbox', { name: 'ACME GmbH' }));

    const erika = dump().parties!.find((p) => p.name === 'Erika')!;
    expect(erika.addresses![0]).toMatchObject({ city: 'Bonn', country: 'DE' });
    const acmeUuid = dump().parties!.find((p) => p.name === 'ACME GmbH')!.uuid;
    expect(erika.memberOfOrganizations).toEqual([acmeUuid]);
  });
});
