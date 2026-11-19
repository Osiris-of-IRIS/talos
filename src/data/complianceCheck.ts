/**
 * OSCAL compliance checking service (ADR-0040) — the single module behind every place TALOS asks
 * "is this artifact valid OSCAL?": export (draft warning), the compliance gate for workflow inputs,
 * and the compliance badge/issue list in editors, detail and list pages.
 *
 * Strategy (docs/performance.md): validation runs on demand, never per keystroke —
 *  - stored records are memoized by `type|uuid|updatedAt` (bounded), so a list page, a picker and a
 *    detail page share one check per saved revision;
 *  - editor drafts are memoized by object identity (a WeakMap), and editors debounce (see
 *    `useArtifactCompliance`), so typing re-validates at most once per pause;
 *  - the validator chunk of a model is loaded on first use (src/models/schemaValidator.ts).
 * Every check and gate decision is logged with decision_ids and counted (`getComplianceStats`).
 *
 * Decision IDs: ADR-0040, ADR-0019, ADR-0002.
 */
import { buildExportDocument } from '@/models/exportDocument';
import { loadSchemaValidator } from '@/models/schemaValidator';
import {
  gateDecision,
  issuesFromSchemaErrors,
  type ComplianceReport,
  type GateDecision,
} from '@/models/compliance';
import { creatorProblems, type CreatorProblem } from '@/models/creator';
import { OSCAL_AUTHORING_VERSION, type Metadata, type OscalArtifactType } from '@/models/oscalBase';
import { logger } from '@/shared/logger';
import type { StoredArtifact } from './db';

export const COMPLIANCE_DECISION_IDS = ['ADR-0040'];

export interface ComplianceStats {
  checks: number;
  compliant: number;
  nonCompliant: number;
  unchecked: number;
  /** cumulative validation wall time (ms), incl. building the export document */
  totalMs: number;
  gateAllowed: number;
  gateBlocked: number;
  compliantExports: number;
  draftExports: number;
}

const ZERO: ComplianceStats = {
  checks: 0,
  compliant: 0,
  nonCompliant: 0,
  unchecked: 0,
  totalMs: 0,
  gateAllowed: 0,
  gateBlocked: 0,
  compliantExports: 0,
  draftExports: 0,
};
let stats: ComplianceStats = { ...ZERO };

export function getComplianceStats(): ComplianceStats {
  return { ...stats };
}

const RECORD_CACHE_LIMIT = 500;
let recordCache = new Map<string, Promise<ComplianceReport>>();
let artifactCache = new WeakMap<object, Map<OscalArtifactType, Promise<ComplianceReport>>>();

export function _resetComplianceForTests(): void {
  stats = { ...ZERO };
  recordCache = new Map();
  artifactCache = new WeakMap();
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

/** Validate an already-built export (wire) document of `type`. */
export async function checkDocumentCompliance(
  type: OscalArtifactType,
  doc: unknown,
): Promise<ComplianceReport> {
  const loaded = await loadSchemaValidator(type);
  if (!loaded) {
    stats.checks++;
    stats.unchecked++;
    return { status: 'unchecked', oscalVersion: OSCAL_AUTHORING_VERSION, issues: [] };
  }
  const ok = loaded.validate(doc);
  const issues = ok
    ? []
    : issuesFromSchemaErrors(loaded.validate.errors ?? [], doc, loaded.patternDatatypes);
  stats.checks++;
  if (issues.length === 0) stats.compliant++;
  else stats.nonCompliant++;
  return {
    status: issues.length === 0 ? 'compliant' : 'non-compliant',
    oscalVersion: OSCAL_AUTHORING_VERSION,
    schemaId: loaded.schemaId,
    issues,
  };
}

async function runCheck(
  type: OscalArtifactType,
  artifact: unknown,
  context: Record<string, unknown>,
): Promise<ComplianceReport> {
  const t0 = now();
  const report = await checkDocumentCompliance(type, buildExportDocument(type, artifact));
  const ms = Math.round(now() - t0);
  stats.totalMs += ms;
  if (report.status === 'non-compliant') {
    logger.info('OSCAL schema check: not compliant', COMPLIANCE_DECISION_IDS, {
      type,
      ...context,
      issues: report.issues.length,
      firstIssue: report.issues[0]?.pointer,
      durationMs: ms,
    });
  }
  return report;
}

/** Check an artifact (e.g. an editor draft). Memoized by object identity — pass a new object per edit. */
export function checkArtifactCompliance(
  type: OscalArtifactType,
  artifact: object,
): Promise<ComplianceReport> {
  let perType = artifactCache.get(artifact);
  if (!perType) {
    perType = new Map();
    artifactCache.set(artifact, perType);
  }
  let p = perType.get(type);
  if (!p) {
    p = runCheck(type, artifact, { source: 'draft' });
    perType.set(type, p);
  }
  return p;
}

/** Check a stored record. Memoized per saved revision (`type|uuid|updatedAt`). */
export function checkRecordCompliance(record: StoredArtifact): Promise<ComplianceReport> {
  if (!record.updatedAt) return checkArtifactCompliance(record.type, record.artifact as object);
  const key = `${record.type}|${record.uuid}|${record.updatedAt}`;
  let p = recordCache.get(key);
  if (!p) {
    p = runCheck(record.type, record.artifact, { uuid: record.uuid, origin: record.origin });
    recordCache.set(key, p);
    if (recordCache.size > RECORD_CACHE_LIMIT) recordCache.delete(recordCache.keys().next().value!);
  }
  return p;
}

/** Where a workflow input is consumed (log context + low-cardinality metric label). */
export type GateConsumer =
  | 'ssp-import-profile'
  | 'ssp-component-import'
  | 'profile-import'
  | 'profile-assistant-source'
  | 'cdef-import'
  | 'cdef-control-implementation-source'
  | 'cdef-assistant-source'
  | 'bootstrap-baseline';

/** Log + count one compliance-gate decision (ADR-0040). */
export function recordGateDecision(
  decision: GateDecision,
  consumer: GateConsumer,
  record: StoredArtifact,
): void {
  if (decision.usable) {
    stats.gateAllowed++;
    return;
  }
  if (decision.reason === 'pending') return;
  stats.gateBlocked++;
  logger.warn(
    'Compliance gate: non-compliant artifact refused as workflow input',
    COMPLIANCE_DECISION_IDS,
    {
      consumer,
      type: record.type,
      uuid: record.uuid,
      reason: decision.reason,
      issues: decision.report.issues.length,
    },
  );
}

/** Check `record` and decide whether it may be used as an input of `consumer`. */
export async function gateRecord(
  record: StoredArtifact,
  consumer: GateConsumer,
): Promise<GateDecision> {
  const decision = gateDecision(await checkRecordCompliance(record));
  recordGateDecision(decision, consumer, record);
  return decision;
}

/** What blocks a download outright (ADR-0019 creator rule) vs. what only makes it a draft. */
export interface ExportPlan {
  blockers: CreatorProblem[];
  report: ComplianceReport;
}

export function exportBlockers(record: StoredArtifact): CreatorProblem[] {
  const metadata = (record.artifact as { metadata?: Metadata }).metadata;
  return metadata ? creatorProblems(metadata) : [{ code: 'creator-missing', params: {} }];
}

export async function prepareExport(record: StoredArtifact): Promise<ExportPlan> {
  return { blockers: exportBlockers(record), report: await checkRecordCompliance(record) };
}

/** Count (and log, for drafts) a completed download. */
export function recordExport(record: StoredArtifact, report: ComplianceReport): void {
  if (report.status === 'compliant') {
    stats.compliantExports++;
    return;
  }
  stats.draftExports++;
  logger.warn('Exported a non-compliant artifact as a draft', COMPLIANCE_DECISION_IDS, {
    type: record.type,
    uuid: record.uuid,
    issues: report.issues.length,
  });
}

export interface BulkExportPlan {
  /** skipped from the zip (ADR-0019 creator rule) */
  blocked: { record: StoredArtifact; blockers: CreatorProblem[] }[];
  /** included only after the user confirms the draft dialog */
  drafts: { record: StoredArtifact; report: ComplianceReport }[];
  compliant: { record: StoredArtifact; report: ComplianceReport }[];
}

export async function planBulkExport(records: StoredArtifact[]): Promise<BulkExportPlan> {
  const plan: BulkExportPlan = { blocked: [], drafts: [], compliant: [] };
  for (const record of records) {
    const blockers = exportBlockers(record);
    if (blockers.length > 0) {
      plan.blocked.push({ record, blockers });
      continue;
    }
    const report = await checkRecordCompliance(record);
    (report.status === 'compliant' ? plan.compliant : plan.drafts).push({ record, report });
  }
  return plan;
}
