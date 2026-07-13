/**
 * "Apply a change to other SSPs" propagation engine (T-512, ADR-0037). Covers TEST-SGRP-02.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import {
  propagationScopesFor,
  resolveScopeTargets,
  propagateByComponentField,
  propagateComponentImport,
} from '@/features/ssps/propagateChange';
import { setSspGroupIds } from '@/data/sspGroupMembership';
import { importComponentFromDefinition } from '@/features/ssps/componentImport';
import type { SystemSecurityPlan } from '@/models/ssp';
import type { DefinedComponent } from '@/models/componentDefinition';
import type { SspGroup } from '@/models/sspGroup';

const sspRepo = () => ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');

const cdUuid = 'cd-1';
const sharedComponent: DefinedComponent = {
  uuid: 'comp-1',
  type: 'software',
  title: 'Shared Firewall',
  description: 'x',
};

function blankSsp(uuid: string, title: string): SystemSecurityPlan {
  return {
    uuid,
    metadata: { title, version: '1.0.0', oscalVersion: '1.2.2' },
    importProfile: { href: '' },
    systemCharacteristics: {} as SystemSecurityPlan['systemCharacteristics'],
    systemImplementation: { users: [], components: [] },
    controlImplementation: { description: '', implementedRequirements: [] },
  };
}

/** An SSP that already imported `sharedComponent` and wired it to `controlId` via a by-component. */
function sspWithWiredComponent(uuid: string, title: string, controlId: string, status?: string): SystemSecurityPlan {
  const ssp = blankSsp(uuid, title);
  const sc = importComponentFromDefinition(cdUuid, sharedComponent);
  ssp.systemImplementation.components.push(sc);
  ssp.controlImplementation.implementedRequirements.push({
    uuid: 'ir-1',
    controlId,
    byComponents: [
      {
        uuid: 'bc-1',
        componentUuid: sc.uuid,
        description: 'old description',
        ...(status ? { props: [{ name: 'implementation-status', value: status }] } : {}),
      },
    ],
  });
  return ssp;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('propagationScopesFor', () => {
  it('includes the asset-type scope when the SSP has one', () => {
    const ssp = blankSsp('s1', 'Source');
    ssp.systemImplementation.inventoryItems = [{ uuid: 'i1', description: 'x', props: [{ name: 'asset-type', value: 'router' }] }];
    const scopes = propagationScopesFor(ssp, []);
    expect(scopes).toEqual([{ kind: 'assetType', value: 'router', label: 'router' }]);
  });

  it('includes one scope per group the SSP belongs to, resolved to titles', () => {
    const ssp = blankSsp('s1', 'Source');
    setSspGroupIds(ssp, ['g1', 'g2']);
    const groups: SspGroup[] = [
      { uuid: 'g1', title: 'Berlin' },
      { uuid: 'g2', title: 'Munich' },
    ];
    expect(propagationScopesFor(ssp, groups)).toEqual([
      { kind: 'group', value: 'g1', label: 'Berlin' },
      { kind: 'group', value: 'g2', label: 'Munich' },
    ]);
  });

  it('silently drops a dangling group reference (group no longer exists)', () => {
    const ssp = blankSsp('s1', 'Source');
    setSspGroupIds(ssp, ['deleted-group']);
    expect(propagationScopesFor(ssp, [])).toEqual([]);
  });
});

describe('resolveScopeTargets', () => {
  it('asset-type scope matches other SSPs with the same asset type, excluding the source', () => {
    const source = blankSsp('s1', 'Source');
    const match = blankSsp('s2', 'Match');
    match.systemImplementation.inventoryItems = [{ uuid: 'i1', description: 'x', props: [{ name: 'asset-type', value: 'router' }] }];
    const noMatch = blankSsp('s3', 'NoMatch');
    noMatch.systemImplementation.inventoryItems = [{ uuid: 'i2', description: 'x', props: [{ name: 'asset-type', value: 'server' }] }];
    const all = [source, match, noMatch].map((artifact) => ({ uuid: artifact.uuid, type: 'systemSecurityPlan' as const, origin: 'user' as const, createdAt: '', updatedAt: '', artifact }));

    const targets = resolveScopeTargets({ kind: 'assetType', value: 'router', label: 'router' }, 's1', all, []);
    expect(targets.map((t) => t.uuid)).toEqual(['s2']);
  });

  it('group scope reaches SSPs in nested subgroups (descendant-inclusive)', () => {
    const groups: SspGroup[] = [
      { uuid: 'root', title: 'Root' },
      { uuid: 'child', title: 'Child', parentGroupUuid: 'root' },
    ];
    const inChild = blankSsp('s2', 'InChild');
    setSspGroupIds(inChild, ['child']);
    const unrelated = blankSsp('s3', 'Unrelated');
    const all = [blankSsp('s1', 'Source'), inChild, unrelated].map((artifact) => ({ uuid: artifact.uuid, type: 'systemSecurityPlan' as const, origin: 'user' as const, createdAt: '', updatedAt: '', artifact }));

    const targets = resolveScopeTargets({ kind: 'group', value: 'root', label: 'Root' }, 's1', all, groups);
    expect(targets.map((t) => t.uuid)).toEqual(['s2']);
  });
});

describe('propagateByComponentField', () => {
  it('updates status+description on every target that already has the control wired to the same shared component', async () => {
    const source = sspWithWiredComponent('s1', 'Source', 'CTRL-1', 'planned');
    const target = sspWithWiredComponent('s2', 'Target', 'CTRL-1');
    await sspRepo().create({ uuid: 's2', type: 'systemSecurityPlan', origin: 'user', artifact: target });

    const sourceComponent = source.systemImplementation.components[0]!;
    const result = await propagateByComponentField(
      sourceComponent,
      'CTRL-1',
      'implemented',
      'new description',
      [{ uuid: 's2', type: 'systemSecurityPlan', origin: 'user', createdAt: '', updatedAt: '', artifact: target }],
    );

    expect(result.updated).toEqual(['Target']);
    expect(result.skipped).toEqual([]);
    const rec = (await sspRepo().get('s2'))!;
    const bc = rec.artifact.controlImplementation.implementedRequirements[0]!.byComponents![0]!;
    expect(bc.description).toBe('new description');
    expect(bc.props).toEqual([{ name: 'implementation-status', value: 'implemented' }]);
  });

  it('skips a target missing the control-id, with a reason', async () => {
    const source = sspWithWiredComponent('s1', 'Source', 'CTRL-1');
    const target = blankSsp('s2', 'Target');
    const sourceComponent = source.systemImplementation.components[0]!;

    const result = await propagateByComponentField(sourceComponent, 'CTRL-1', 'implemented', 'x', [
      { uuid: 's2', type: 'systemSecurityPlan', origin: 'user', createdAt: '', updatedAt: '', artifact: target },
    ]);

    expect(result.updated).toEqual([]);
    expect(result.skipped).toEqual([{ title: 'Target', reason: 'control "CTRL-1" not present' }]);
  });

  it('skips a target that has the control but not wired to the same shared component', async () => {
    const source = sspWithWiredComponent('s1', 'Source', 'CTRL-1');
    const target = blankSsp('s2', 'Target');
    target.controlImplementation.implementedRequirements.push({ uuid: 'ir-x', controlId: 'CTRL-1', byComponents: [] });
    const sourceComponent = source.systemImplementation.components[0]!;

    const result = await propagateByComponentField(sourceComponent, 'CTRL-1', 'implemented', 'x', [
      { uuid: 's2', type: 'systemSecurityPlan', origin: 'user', createdAt: '', updatedAt: '', artifact: target },
    ]);

    expect(result.updated).toEqual([]);
    expect(result.skipped).toEqual([{ title: 'Target', reason: 'component not wired to control "CTRL-1"' }]);
  });

  it('skips every target when the source component was never imported (no provenance to match on)', async () => {
    const handAuthored = { uuid: 'sc-1', type: 'software', title: 'Hand-authored', description: 'x', status: { state: 'operational' } };
    const target = blankSsp('s2', 'Target');

    const result = await propagateByComponentField(handAuthored, 'CTRL-1', 'implemented', 'x', [
      { uuid: 's2', type: 'systemSecurityPlan', origin: 'user', createdAt: '', updatedAt: '', artifact: target },
    ]);

    expect(result.updated).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/not imported/);
  });
});

describe('propagateComponentImport', () => {
  it('imports the component into a target that does not already have it', async () => {
    const target = blankSsp('s2', 'Target');
    await sspRepo().create({ uuid: 's2', type: 'systemSecurityPlan', origin: 'user', artifact: target });

    const result = await propagateComponentImport(cdUuid, sharedComponent, [
      { uuid: 's2', type: 'systemSecurityPlan', origin: 'user', createdAt: '', updatedAt: '', artifact: target },
    ]);

    expect(result.updated).toEqual(['Target']);
    const rec = (await sspRepo().get('s2'))!;
    expect(rec.artifact.systemImplementation.components).toHaveLength(1);
    expect(rec.artifact.systemImplementation.components[0]!.title).toBe('Shared Firewall');
  });

  it('skips a target that already has this shared component (matched by origin, not title)', async () => {
    const target = sspWithWiredComponent('s2', 'Target', 'CTRL-1');

    const result = await propagateComponentImport(cdUuid, sharedComponent, [
      { uuid: 's2', type: 'systemSecurityPlan', origin: 'user', createdAt: '', updatedAt: '', artifact: target },
    ]);

    expect(result.updated).toEqual([]);
    expect(result.skipped).toEqual([{ title: 'Target', reason: 'already has this component' }]);
  });
});
