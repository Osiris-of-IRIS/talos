/**
 * Back-matter resource helpers. Decision IDs: ADR-0001, ADR-0015.
 * Covers TEST-BM-01.
 */
import { describe, it, expect } from 'vitest';
import {
  ensureUrlResource,
  externalizeLink,
  addFileResource,
  removeResource,
  bytesToBase64,
  base64ToBytes,
  shouldWarnFileSize,
  isExternalUrl,
  ensureArtifactResource,
  DEFAULT_MAX_EMBEDDED_FILE_BYTES,
  EMBEDDED_FILE_WARN_BYTES,
} from '@/models/backMatter';
import type { OscalArtifact } from '@/models/oscalBase';

function artifact(): OscalArtifact {
  return { uuid: 'x', metadata: { title: 't', version: '1', oscalVersion: '1.2.2' } };
}

describe('isExternalUrl', () => {
  it('detects http(s) but not internal/relative', () => {
    expect(isExternalUrl('https://x.com')).toBe(true);
    expect(isExternalUrl('http://x.com')).toBe(true);
    expect(isExternalUrl('#abc')).toBe(false);
    expect(isExternalUrl('/profiles')).toBe(false);
  });
});

describe('ensureUrlResource', () => {
  it('creates a resource with an rlink and returns its uuid', () => {
    const a = artifact();
    const id = ensureUrlResource(a, 'https://nist.gov', 'NIST');
    const res = a.backMatter?.resources?.[0];
    expect(res?.uuid).toBe(id);
    expect(res?.rlinks?.[0]?.href).toBe('https://nist.gov');
    expect(res?.title).toBe('NIST');
  });

  it('dedupes by rlink href', () => {
    const a = artifact();
    const id1 = ensureUrlResource(a, 'https://nist.gov');
    const id2 = ensureUrlResource(a, 'https://nist.gov');
    expect(id1).toBe(id2);
    expect(a.backMatter?.resources).toHaveLength(1);
  });
});

describe('externalizeLink', () => {
  it('turns an external link into a #uuid reference + back-matter resource', () => {
    const a = artifact();
    const link = externalizeLink(a, { href: 'https://nist.gov', rel: 'reference', text: 'NIST' });
    expect(link.href).toMatch(/^#/);
    const id = link.href.slice(1);
    expect(a.backMatter?.resources?.[0]?.uuid).toBe(id);
    expect(link.rel).toBe('reference');
  });

  it('leaves internal and relative links unchanged', () => {
    const a = artifact();
    expect(externalizeLink(a, { href: '#already' }).href).toBe('#already');
    expect(externalizeLink(a, { href: '/route' }).href).toBe('/route');
    expect(a.backMatter).toBeUndefined();
  });
});

describe('base64', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 65, 66]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe('addFileResource', () => {
  it('embeds a small file as base64', () => {
    const a = artifact();
    const bytes = new TextEncoder().encode('hello');
    const id = addFileResource(a, { filename: 'note.txt', mediaType: 'text/plain', bytes });
    const res = a.backMatter?.resources?.find((r) => r.uuid === id);
    expect(res?.base64?.filename).toBe('note.txt');
    expect(new TextDecoder().decode(base64ToBytes(res!.base64!.value))).toBe('hello');
  });

  it('rejects a file over the size limit', () => {
    const a = artifact();
    const big = new Uint8Array(DEFAULT_MAX_EMBEDDED_FILE_BYTES + 1);
    expect(() => addFileResource(a, { filename: 'big.bin', bytes: big })).toThrow(/exceeding/);
    expect(a.backMatter).toBeUndefined();
  });

  it('honors a custom max', () => {
    const a = artifact();
    expect(() => addFileResource(a, { filename: 'x', bytes: new Uint8Array(11) }, 10)).toThrow();
  });
});

describe('shouldWarnFileSize', () => {
  it('warns at or above the soft threshold', () => {
    expect(shouldWarnFileSize(EMBEDDED_FILE_WARN_BYTES)).toBe(true);
    expect(shouldWarnFileSize(EMBEDDED_FILE_WARN_BYTES - 1)).toBe(false);
  });
});

describe('removeResource', () => {
  it('removes by uuid', () => {
    const a = artifact();
    const id = ensureUrlResource(a, 'https://x.com');
    expect(removeResource(a, id)).toBe(true);
    expect(a.backMatter?.resources).toHaveLength(0);
    expect(removeResource(a, 'nope')).toBe(false);
  });
});

describe('ensureArtifactResource (item 5: back-matter-mediated control-implementation.source)', () => {
  it('creates a resource carrying the catalog as a document-id, and returns its uuid', () => {
    const a = artifact();
    const catalogUuid = 'cccccccc-0000-4000-8000-000000000001';
    const resourceUuid = ensureArtifactResource(a, catalogUuid, 'BSI Kernel');
    const res = a.backMatter?.resources?.[0];
    expect(res?.uuid).toBe(resourceUuid);
    expect(res?.title).toBe('BSI Kernel');
    expect(res?.documentIds?.[0]?.identifier).toBe(catalogUuid);
    expect(resourceUuid).not.toBe(catalogUuid); // the resource has its own identity
  });

  it('dedupes: reuses the existing resource for the same catalog', () => {
    const a = artifact();
    const catalogUuid = 'cccccccc-0000-4000-8000-000000000001';
    const first = ensureArtifactResource(a, catalogUuid, 'BSI Kernel');
    const second = ensureArtifactResource(a, catalogUuid, 'BSI Kernel');
    expect(second).toBe(first);
    expect(a.backMatter?.resources).toHaveLength(1);
  });
});
