/**
 * SSP component import + staleness tracking + by-component implementation-status.
 * Decision IDs: ADR-0001, ADR-0003, ADR-0011 (Δ staleness symbol). Covers TEST-SSP-IMPORT-01.
 *
 * Provenance/staleness are tracked via OSCAL `props[]` (no model-shape changes), so round-trip
 * fidelity to real OSCAL tooling is preserved (ADR-0023).
 */
import { describe, it, expect } from 'vitest';
import {
  hashComponentContent,
  importComponentFromDefinition,
  getComponentProvenance,
  componentStaleness,
  refreshComponentFromSource,
  getImplementationStatus,
  setImplementationStatus,
  IMPLEMENTATION_STATUS_VALUES,
} from '@/features/ssps/componentImport';
import type { DefinedComponent } from '@/models/componentDefinition';
import type { ByComponent } from '@/models/ssp';

const source: DefinedComponent = {
  uuid: 'comp-1',
  type: 'software',
  title: 'nginx',
  description: 'Reverse proxy and web server.',
};

const cdUuid = 'cd-1';

describe('hashComponentContent', () => {
  it('is deterministic for the same content', () => {
    const a = hashComponentContent('nginx', 'software', 'Reverse proxy');
    const b = hashComponentContent('nginx', 'software', 'Reverse proxy');
    expect(a).toBe(b);
  });

  it('differs when any field changes', () => {
    const base = hashComponentContent('nginx', 'software', 'Reverse proxy');
    expect(hashComponentContent('nginx2', 'software', 'Reverse proxy')).not.toBe(base);
    expect(hashComponentContent('nginx', 'service', 'Reverse proxy')).not.toBe(base);
    expect(hashComponentContent('nginx', 'software', 'Something else')).not.toBe(base);
  });
});

describe('importComponentFromDefinition', () => {
  it('creates a SystemComponent with a new uuid, copied content, and provenance props', () => {
    const sc = importComponentFromDefinition(cdUuid, source);
    expect(sc.uuid).not.toBe(source.uuid);
    expect(sc.title).toBe('nginx');
    expect(sc.type).toBe('software');
    expect(sc.description).toBe('Reverse proxy and web server.');
    expect(sc.status).toEqual({ state: 'operational' });

    const prov = getComponentProvenance(sc);
    expect(prov).toEqual({
      componentDefinitionUuid: cdUuid,
      componentUuid: 'comp-1',
      snapshot: hashComponentContent('nginx', 'software', 'Reverse proxy and web server.'),
    });
  });
});

describe('componentStaleness', () => {
  it('returns "not-imported" for a component with no provenance props', () => {
    const manual = { uuid: 'x', type: 'software', title: 'manual', description: 'd', status: { state: 'operational' } };
    expect(componentStaleness(manual, [])).toBe('not-imported');
  });

  it('returns "fresh" when the source component is unchanged', () => {
    const sc = importComponentFromDefinition(cdUuid, source);
    const workspace = [{ uuid: cdUuid, artifact: { uuid: cdUuid, metadata: { title: 'CD', version: '1', oscalVersion: '1.2.2' }, components: [source] } }];
    expect(componentStaleness(sc, workspace as never)).toBe('fresh');
  });

  it('returns "stale" when the source component content changed', () => {
    const sc = importComponentFromDefinition(cdUuid, source);
    const changed = { ...source, description: 'Now also terminates TLS.' };
    const workspace = [{ uuid: cdUuid, artifact: { uuid: cdUuid, metadata: { title: 'CD', version: '1', oscalVersion: '1.2.2' }, components: [changed] } }];
    expect(componentStaleness(sc, workspace as never)).toBe('stale');
  });

  it('returns "missing" when the source component-definition is no longer in the workspace', () => {
    const sc = importComponentFromDefinition(cdUuid, source);
    expect(componentStaleness(sc, [])).toBe('missing');
  });

  it('returns "missing" when the source component-definition exists but the component was removed from it', () => {
    const sc = importComponentFromDefinition(cdUuid, source);
    const workspace = [{ uuid: cdUuid, artifact: { uuid: cdUuid, metadata: { title: 'CD', version: '1', oscalVersion: '1.2.2' }, components: [] } }];
    expect(componentStaleness(sc, workspace as never)).toBe('missing');
  });
});

describe('refreshComponentFromSource', () => {
  it('re-copies content and updates the snapshot, keeping the SystemComponent uuid and status', () => {
    const sc = importComponentFromDefinition(cdUuid, source);
    sc.status = { state: 'under-development' }; // user edited status after import
    const changed = { ...source, description: 'Now also terminates TLS.' };

    const refreshed = refreshComponentFromSource(sc, changed);
    expect(refreshed.uuid).toBe(sc.uuid);
    expect(refreshed.description).toBe('Now also terminates TLS.');
    expect(refreshed.status).toEqual({ state: 'under-development' });
    expect(componentStaleness(refreshed, [
      { uuid: cdUuid, artifact: { uuid: cdUuid, metadata: { title: 'CD', version: '1', oscalVersion: '1.2.2' }, components: [changed] } },
    ] as never)).toBe('fresh');
  });
});

describe('implementation-status props (T-113)', () => {
  it('lists the 5 OSCAL implementation-status values', () => {
    expect(IMPLEMENTATION_STATUS_VALUES).toEqual([
      'planned',
      'implemented',
      'partial',
      'alternative',
      'not-applicable',
    ]);
  });

  it('get/set round-trip via a prop on the by-component', () => {
    const bc: ByComponent = { componentUuid: 'x', uuid: 'bc-1', description: 'd' };
    expect(getImplementationStatus(bc)).toBeUndefined();
    const withStatus = setImplementationStatus(bc, 'partial');
    expect(getImplementationStatus(withStatus)).toBe('partial');
  });
});
