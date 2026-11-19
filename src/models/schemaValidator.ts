/**
 * NIST OSCAL JSON-Schema validators (ADR-0040). The validators are generated at build time from
 * the vendored schemas (`schemas/oscal/<version>/`, tools/oscalValidators.mjs) because the page's
 * Content-Security-Policy forbids Ajv's runtime compilation; each model is its own lazily loaded
 * chunk, so pages that never validate pay nothing.
 *
 * Decision IDs: ADR-0040, ADR-0007, ADR-0003.
 */
import { OSCAL_AUTHORING_VERSION, type OscalArtifactType } from './oscalBase';

/** One Ajv error, as the generated standalone validators report it. */
export interface SchemaError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}

/** The generated validate function: `validate(doc)` → boolean, errors on `validate.errors`. */
export interface SchemaValidateFunction {
  (data: unknown): boolean;
  errors?: SchemaError[] | null;
}

export interface LoadedSchemaValidator {
  validate: SchemaValidateFunction;
  /** The schema's `$id` — what TALOS writes as `"$schema"` into exports. */
  schemaId: string;
  /** `{ regexSource: datatypeName }`, to explain a `pattern` error by its OSCAL datatype. */
  patternDatatypes: Record<string, string>;
}

const base = `http://csrc.nist.gov/ns/oscal/${OSCAL_AUTHORING_VERSION}`;

/**
 * The NIST JSON-schema `$id` of every model TALOS validates, for the authoring version — derived
 * from `OSCAL_AUTHORING_VERSION` (single source, TEST-VER-02) and checked against the vendored
 * schemas' own `$id` (TEST-SCHEMA-01).
 */
export const OSCAL_SCHEMA_IDS: Partial<Record<OscalArtifactType, string>> = {
  catalog: `${base}/oscal-catalog-schema.json`,
  profile: `${base}/oscal-profile-schema.json`,
  componentDefinition: `${base}/oscal-component-definition-schema.json`,
  systemSecurityPlan: `${base}/oscal-ssp-schema.json`,
};

type ValidatorModule = {
  default: SchemaValidateFunction;
  schemaId: string;
  patternDatatypes: Record<string, string>;
};

// Literal dynamic imports, so the bundler emits one chunk per model (lazy-load, ADR-0040).
const LOADERS: Partial<Record<OscalArtifactType, () => Promise<ValidatorModule>>> = {
  catalog: () => import('virtual:oscal-validator/catalog'),
  profile: () => import('virtual:oscal-validator/profile'),
  componentDefinition: () => import('virtual:oscal-validator/componentDefinition'),
  systemSecurityPlan: () => import('virtual:oscal-validator/systemSecurityPlan'),
};

/** Artifact types with a bundled schema. Others (assessment layer) are reported "unchecked". */
export const SCHEMA_VALIDATED_TYPES = Object.keys(LOADERS) as OscalArtifactType[];

const loaded = new Map<OscalArtifactType, Promise<LoadedSchemaValidator>>();

/** Load (once) the validator for `type`; `undefined` when no schema is bundled for it. */
export function loadSchemaValidator(
  type: OscalArtifactType,
): Promise<LoadedSchemaValidator | undefined> {
  const loader = LOADERS[type];
  if (!loader) return Promise.resolve(undefined);
  let p = loaded.get(type);
  if (!p) {
    p = loader().then((m) => ({
      validate: m.default,
      schemaId: m.schemaId,
      patternDatatypes: m.patternDatatypes,
    }));
    // A failed chunk load (offline after a deploy) must be retryable, not cached forever.
    p.catch(() => loaded.delete(type));
    loaded.set(type, p);
  }
  return p;
}
