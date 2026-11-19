/// <reference types="vite/client" />

/** App version, injected at build time from package.json (`vite.config.ts`/`vitest.config.ts`, T-025). */
declare const __APP_VERSION__: string;

/**
 * Build-time generated standalone OSCAL JSON-Schema validators (ADR-0040), one virtual module per
 * artifact type with a vendored schema — see tools/oscalValidators.mjs.
 */
declare module 'virtual:oscal-validator/*' {
  import type { SchemaValidateFunction } from '@/models/schemaValidator';
  const validate: SchemaValidateFunction;
  export default validate;
  export const schemaId: string;
  export const patternDatatypes: Record<string, string>;
}
