// Type declarations for tools/oscalValidators.mjs (plain Node ESM, used by vite/vitest config). ADR-0040.
import type { Plugin } from 'vite';

export const VIRTUAL_PREFIX: string;
export function schemaDir(root?: string): string;
export function readManifest(root?: string): {
  oscalVersion: string;
  source: string;
  schemas: Record<
    string,
    { file: string; url: string; sha256: string; id: string; rootKey: string }
  >;
};
export function stripDocs<T>(node: T): T;
export function patternDatatypes(schema: {
  definitions?: Record<string, { pattern?: string }>;
}): Record<string, string>;
export function generateValidatorModule(artifactType: string, root?: string): string;
export function oscalValidatorsPlugin(root?: string): Plugin;
