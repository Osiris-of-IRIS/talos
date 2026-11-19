/**
 * React hooks over the compliance service (ADR-0040). Validation is asynchronous (lazy validator
 * chunk) and memoized in src/data/complianceCheck.ts; these hooks only subscribe to results.
 *  - `useRecordCompliance(record)`   — one stored artifact (detail pages).
 *  - `useRecordsCompliance(records)` — many (list pages, workflow-input pickers), keyed by uuid.
 *  - `useDraftCompliance(type, draft)` — an editor draft, debounced so typing never validates
 *    per keystroke.
 * Decision IDs: ADR-0040.
 */
import { useEffect, useState } from 'react';
import { checkArtifactCompliance, checkRecordCompliance } from '@/data/complianceCheck';
import type { ComplianceReport } from '@/models/compliance';
import { OSCAL_AUTHORING_VERSION, type OscalArtifactType } from '@/models/oscalBase';
import { ArtifactRepository } from '@/data/artifactRepository';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import type { StoredArtifact } from '@/data/db';

/** Editor drafts re-validate at most once per pause of this length. */
export const DRAFT_COMPLIANCE_DEBOUNCE_MS = 600;

export function useRecordCompliance(
  record: StoredArtifact | null | undefined,
): ComplianceReport | undefined {
  const [report, setReport] = useState<ComplianceReport | undefined>(undefined);
  useEffect(() => {
    setReport(undefined);
    if (!record) return;
    let active = true;
    void checkRecordCompliance(record).then((r) => {
      if (active) setReport(r);
    });
    return () => {
      active = false;
    };
  }, [record]);
  return report;
}

export function useRecordsCompliance(
  records: readonly StoredArtifact[],
): Map<string, ComplianceReport> {
  const [reports, setReports] = useState<Map<string, ComplianceReport>>(new Map());
  // Re-run only when the set of saved revisions changes, not on every new array identity.
  const key = records.map((r) => `${r.type}|${r.uuid}|${r.updatedAt}`).join(',');
  useEffect(() => {
    let active = true;
    void (async () => {
      for (const r of records) {
        const report = await checkRecordCompliance(r);
        if (!active) return;
        setReports((prev) =>
          prev.get(r.uuid) === report ? prev : new Map(prev).set(r.uuid, report),
        );
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures `records`' content
  }, [key]);
  return reports;
}

export function useDraftCompliance(
  type: OscalArtifactType,
  draft: object | null | undefined,
  debounceMs = DRAFT_COMPLIANCE_DEBOUNCE_MS,
): ComplianceReport | undefined {
  const [report, setReport] = useState<ComplianceReport | undefined>(undefined);
  useEffect(() => {
    if (!draft) return;
    let active = true;
    const timer = setTimeout(() => {
      void checkArtifactCompliance(type, draft).then((r) => {
        if (active) setReport(r);
      });
    }, debounceMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [type, draft, debounceMs]);
  return report;
}

/**
 * After an upload or library adoption: warn (toast) when the imported artifact is not OSCAL
 * compliant. Import never fails for that reason — third-party content stays importable and
 * editable, it is only flagged and blocked as a workflow input (ADR-0040).
 */
export function useImportComplianceWarning(): (
  type: OscalArtifactType,
  uuid: string,
) => Promise<void> {
  const { t } = useI18n();
  const { showToast } = useToast();
  return async (type, uuid) => {
    const record = await ArtifactRepository.forType(type).get(uuid);
    if (!record) return;
    const report = await checkRecordCompliance(record);
    if (report.status !== 'non-compliant') return;
    const title = (record.artifact as { metadata?: { title?: string } }).metadata?.title || uuid;
    showToast(
      t('import_compliance_warning', {
        title,
        version: OSCAL_AUTHORING_VERSION,
        count: report.issues.length,
      }),
      'warning',
    );
  };
}
