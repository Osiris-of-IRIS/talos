/**
 * OSCAL compliance model (ADR-0040): the one notion of "valid" TALOS uses — an artifact is
 * *compliant* when the document TALOS would export for it (`buildExportDocument`) validates
 * against the vendored NIST OSCAL JSON schema of its model, for the authoring version.
 *
 * This module is pure: it turns raw Ajv errors into human-addressable issues (a JSON pointer, the
 * path as OSCAL keys + numbered array items with an identifying hint, a reason code + params that
 * the UI localizes via src/shared/complianceMessages.ts) and decides the compliance gate.
 * The async check (loading validators, memoization, logging, metrics) is src/data/complianceCheck.ts.
 *
 * Decision IDs: ADR-0040, ADR-0012.
 */
import type { SchemaError } from './schemaValidator';

export type ComplianceIssueCode =
  | 'required'
  | 'required-one-of'
  | 'empty'
  | 'min-items'
  | 'datatype'
  | 'format'
  | 'type'
  | 'enum'
  | 'invalid-value'
  | 'unknown-field'
  | 'no-matching-alternative'
  | 'other';

/** One path step below the document's wrapper key: an OSCAL JSON key or an array position. */
export type IssuePathSegment = { key: string } | { index: number; hint?: string };

export interface ComplianceIssue {
  /** JSON pointer into the exported document, e.g. `/system-security-plan/system-characteristics/system-ids`. */
  pointer: string;
  /** The pointer below the wrapper key, as segments the UI labels (src/shared/complianceMessages.ts). */
  path: IssuePathSegment[];
  code: ComplianceIssueCode;
  /** Reason parameters, all strings (interpolated into the localized reason). */
  params: Record<string, string>;
}

export type ComplianceStatus = 'compliant' | 'non-compliant' | 'unchecked';

export interface ComplianceReport {
  /** `unchecked`: no schema is bundled for this model (e.g. assessment layer, later tickets). */
  status: ComplianceStatus;
  /** The OSCAL version validated against (always the authoring version). */
  oscalVersion: string;
  /** The schema `$id` used, when checked. */
  schemaId?: string;
  issues: ComplianceIssue[];
}

const COMBINATORS = new Set(['anyOf', 'oneOf']);
/** Errors an `anyOf` branch emits only to say "this is not my branch". */
const DISCRIMINATORS = new Set(['required', 'additionalProperties']);
/** Fields that best identify an array item to a human, in order of preference. */
const HINT_FIELDS = [
  'control-id',
  'id',
  'param-id',
  'statement-id',
  'title',
  'name',
  'system-name',
  'href',
];

function decodeSegment(s: string): string {
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

function encodeSegment(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

function splitPointer(pointer: string): string[] {
  return pointer === '' ? [] : pointer.slice(1).split('/').map(decodeSegment);
}

function valueAt(doc: unknown, segments: string[]): unknown {
  let cur: unknown = doc;
  for (const s of segments) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[s];
  }
  return cur;
}

function isUnder(pointer: string, parent: string): boolean {
  return pointer.startsWith(parent + '/');
}

function hintFor(item: unknown): string | undefined {
  if (item === null || typeof item !== 'object') return undefined;
  const o = item as Record<string, unknown>;
  for (const f of HINT_FIELDS) {
    const v = o[f];
    if (typeof v === 'string' && v.trim()) return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  }
  return typeof o.uuid === 'string' && o.uuid ? o.uuid.slice(0, 8) : undefined;
}

/** Segments below the wrapper key, array items numbered with a hint read from the document. */
function pathFor(doc: unknown, pointer: string): IssuePathSegment[] {
  const segs = splitPointer(pointer);
  const out: IssuePathSegment[] = [];
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i]!;
    const container = valueAt(doc, segs.slice(0, i));
    if (Array.isArray(container) && /^\d+$/.test(s)) {
      const index = Number(s);
      const hint = hintFor(container[index]);
      out.push(hint ? { index, hint } : { index });
    } else {
      out.push({ key: s });
    }
  }
  return out;
}

interface Draft {
  pointer: string;
  code: ComplianceIssueCode;
  params: Record<string, string>;
}

function str(v: unknown): string {
  return Array.isArray(v) ? v.map(String).join(', ') : String(v);
}

function draftFromError(
  e: SchemaError,
  doc: unknown,
  patternDatatypes: Record<string, string>,
): Draft {
  const p = e.params ?? {};
  const value = valueAt(doc, splitPointer(e.instancePath));
  switch (e.keyword) {
    case 'required':
      return {
        pointer: `${e.instancePath}/${encodeSegment(String(p.missingProperty))}`,
        code: 'required',
        params: {},
      };
    case 'additionalProperties':
      return {
        pointer: `${e.instancePath}/${encodeSegment(String(p.additionalProperty))}`,
        code: 'unknown-field',
        params: {},
      };
    case 'minItems':
      return { pointer: e.instancePath, code: 'min-items', params: { limit: str(p.limit) } };
    case 'type':
      return { pointer: e.instancePath, code: 'type', params: { expected: str(p.type) } };
    case 'enum':
      return { pointer: e.instancePath, code: 'enum', params: { allowed: str(p.allowedValues) } };
  }
  if ((e.keyword === 'pattern' || e.keyword === 'format') && value === '') {
    return { pointer: e.instancePath, code: 'empty', params: {} };
  }
  if (e.keyword === 'pattern') {
    const datatype = patternDatatypes[String(p.pattern)];
    return datatype
      ? { pointer: e.instancePath, code: 'datatype', params: { datatype } }
      : {
          pointer: e.instancePath,
          code: 'datatype',
          params: { datatype: '', pattern: String(p.pattern) },
        };
  }
  if (e.keyword === 'format')
    return { pointer: e.instancePath, code: 'format', params: { format: str(p.format) } };
  return {
    pointer: e.instancePath,
    code: 'other',
    params: { keyword: e.keyword, message: e.message ?? '' },
  };
}

/**
 * Turn the validator's raw errors into issues. `anyOf`/`oneOf` (OSCAL uses them for "enum or free
 * token" values and for alternative object shapes) are collapsed, innermost first:
 *  - with errors *below* the alternative's position, those are the real problems: keep them, drop
 *    the "not my branch" discriminators reported once per branch and the combinator error itself;
 *  - otherwise the value fits no alternative: one issue — `empty` for an empty value,
 *    `required-one-of` (naming the fields) when every branch just required a different field,
 *    `invalid-value` for a scalar, `no-matching-alternative` for an object.
 * Identical issues (each branch re-reports a shared sub-error) are reported once, in first-seen order.
 */
export function issuesFromSchemaErrors(
  errors: readonly SchemaError[],
  doc: unknown,
  patternDatatypes: Record<string, string>,
): ComplianceIssue[] {
  let plain = errors.filter((e) => !COMBINATORS.has(e.keyword));
  const combinatorPointers = [
    ...new Set(errors.filter((e) => COMBINATORS.has(e.keyword)).map((e) => e.instancePath)),
  ].sort((a, b) => splitPointer(b).length - splitPointer(a).length);
  const synthetic = new Map<string, { draft: Draft; position: number }>();

  for (const at of combinatorPointers) {
    const firstIndex = errors.findIndex(
      (e) => e.instancePath === at || isUnder(e.instancePath, at),
    );
    const deeper = plain.filter((e) => isUnder(e.instancePath, at));
    const here = plain.filter((e) => e.instancePath === at);
    if (deeper.length > 0) {
      // Keep a discriminator only if every branch reported it (it then appears more than once).
      const counts = new Map<string, number>();
      for (const e of here)
        counts.set(
          JSON.stringify([e.keyword, e.params]),
          (counts.get(JSON.stringify([e.keyword, e.params])) ?? 0) + 1,
        );
      plain = plain.filter(
        (e) =>
          e.instancePath !== at ||
          !DISCRIMINATORS.has(e.keyword) ||
          (counts.get(JSON.stringify([e.keyword, e.params])) ?? 0) > 1,
      );
      continue;
    }
    plain = plain.filter((e) => e.instancePath !== at);
    const value = valueAt(doc, splitPointer(at));
    let draft: Draft;
    if (value === '') draft = { pointer: at, code: 'empty', params: {} };
    else if (here.length > 0 && here.every((e) => e.keyword === 'required')) {
      draft = {
        pointer: at,
        code: 'required-one-of',
        params: {
          fields: [...new Set(here.map((e) => String(e.params.missingProperty)))].join(', '),
        },
      };
    } else if (value !== null && typeof value === 'object')
      draft = { pointer: at, code: 'no-matching-alternative', params: {} };
    else draft = { pointer: at, code: 'invalid-value', params: {} };
    synthetic.set(at, { draft, position: firstIndex });
  }

  const positioned: { draft: Draft; position: number }[] = [
    ...plain.map((e) => ({
      draft: draftFromError(e, doc, patternDatatypes),
      position: errors.indexOf(e),
    })),
    ...synthetic.values(),
  ].sort((a, b) => a.position - b.position);

  const seen = new Set<string>();
  const out: ComplianceIssue[] = [];
  for (const { draft } of positioned) {
    const key = `${draft.pointer} ${draft.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      pointer: draft.pointer,
      path: pathFor(doc, draft.pointer),
      code: draft.code,
      params: draft.params,
    });
  }
  return out;
}

export type GateDecision =
  | { usable: true }
  | { usable: false; reason: 'non-compliant' | 'unchecked'; report: ComplianceReport }
  | { usable: false; reason: 'pending' };

/**
 * The compliance gate (PO decision, backlog #3): only an OSCAL-compliant artifact may be used as
 * the input of a later step (profile → SSP, catalog/profile → assistants and bootstrap,
 * component-definition → SSP, …). Fails closed: a model without a bundled schema (`unchecked`) or
 * a check still running (`pending`, no report yet) is not usable.
 */
export function gateDecision(report: ComplianceReport | undefined): GateDecision {
  if (!report) return { usable: false, reason: 'pending' };
  if (report.status === 'compliant' && report.issues.length === 0) return { usable: true };
  return {
    usable: false,
    reason: report.status === 'unchecked' ? 'unchecked' : 'non-compliant',
    report,
  };
}
