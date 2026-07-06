/**
 * Back-matter resource helpers: externalize links into back-matter resources and embed files
 * as base64 with a size limit. Pure functions (no DOM). Decision IDs: ADR-0015, ADR-0003.
 */
import type { BackMatter, Link, OscalArtifact, Resource } from './oscalBase';

/** Hard limit for an embedded (base64) file, raw bytes before encoding (5 MiB). */
export const DEFAULT_MAX_EMBEDDED_FILE_BYTES = 5 * 1024 * 1024;
/** Soft warning threshold (1 MiB). */
export const EMBEDDED_FILE_WARN_BYTES = 1024 * 1024;

export function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function ensureBackMatter(artifact: OscalArtifact): BackMatter {
  if (!artifact.backMatter) artifact.backMatter = {};
  if (!artifact.backMatter.resources) artifact.backMatter.resources = [];
  return artifact.backMatter;
}

/** Find an existing resource whose rlink matches this URL (dedupe by exact href). */
function findResourceByRlink(bm: BackMatter, url: string): Resource | undefined {
  return bm.resources?.find((r) => r.rlinks?.some((l) => l.href === url));
}

/**
 * Ensure a back-matter resource exists for an external URL; returns its uuid. Reuses an existing
 * resource with the same rlink (dedupe). Decision IDs: ADR-0015.
 */
export function ensureUrlResource(artifact: OscalArtifact, url: string, title?: string): string {
  const bm = ensureBackMatter(artifact);
  const existing = findResourceByRlink(bm, url);
  if (existing) return existing.uuid;
  const resource: Resource = { uuid: uuid(), rlinks: [{ href: url }] };
  if (title) resource.title = title;
  bm.resources!.push(resource);
  return resource.uuid;
}

/**
 * Convert an external link into a back-matter reference. External URL hrefs become a resource and
 * the returned link points at `#<uuid>`; internal/relative links are returned unchanged.
 */
export function externalizeLink(artifact: OscalArtifact, link: Link): Link {
  if (!isExternalUrl(link.href)) return link;
  const resourceUuid = ensureUrlResource(artifact, link.href.trim(), link.text ?? undefined);
  return { ...link, href: `#${resourceUuid}` };
}

/** Base64-encode raw bytes (works in browser and Node/jsdom). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Decode base64 back to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export interface EmbeddedFileInput {
  filename: string;
  mediaType?: string;
  bytes: Uint8Array;
  title?: string;
}

/**
 * Add a base64-embedded file as a back-matter resource; returns its uuid. Enforces the raw-byte
 * size limit (ADR-0015). Throws with a clear message when the file is too large.
 */
export function addFileResource(
  artifact: OscalArtifact,
  file: EmbeddedFileInput,
  maxBytes: number = DEFAULT_MAX_EMBEDDED_FILE_BYTES,
): string {
  if (file.bytes.length > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new Error(
      `File "${file.filename}" is ${(file.bytes.length / (1024 * 1024)).toFixed(1)} MiB, exceeding the ${mb} MiB embed limit. Reference it by URL instead.`,
    );
  }
  const bm = ensureBackMatter(artifact);
  const resource: Resource = {
    uuid: uuid(),
    base64: {
      filename: file.filename,
      ...(file.mediaType ? { mediaType: file.mediaType } : {}),
      value: bytesToBase64(file.bytes),
    },
  };
  if (file.title) resource.title = file.title;
  bm.resources!.push(resource);
  return resource.uuid;
}

/** True when an embedded file should trigger the soft (yellow) size warning. */
export function shouldWarnFileSize(byteLength: number): boolean {
  return byteLength >= EMBEDDED_FILE_WARN_BYTES;
}

/** Remove a back-matter resource by uuid; returns true if one was removed. */
export function removeResource(artifact: OscalArtifact, resourceUuid: string): boolean {
  const resources = artifact.backMatter?.resources;
  if (!resources) return false;
  const idx = resources.findIndex((r) => r.uuid === resourceUuid);
  if (idx < 0) return false;
  resources.splice(idx, 1);
  return true;
}
