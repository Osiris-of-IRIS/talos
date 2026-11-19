/**
 * Validate on export (ADR-0040, PO decision backlog #3), shared by every download button:
 *  - an ADR-0019 export blocker (no valid creator) → localized error toast, no download;
 *  - OSCAL-compliant → download at once;
 *  - non-compliant → the draft dialog names every non-compliant field (localized path + reason);
 *    the file is downloaded only after "Download as draft".
 * The bulk variant (ADR-0027 zip) skips blocked records as before and asks once for all drafts.
 * Decision IDs: ADR-0040, ADR-0019, ADR-0027, ADR-0012.
 */
import { useState, type ReactNode } from 'react';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import { formatCreatorProblem } from '@/shared/complianceMessages';
import { downloadArtifact } from '@/data/fileIo';
import { downloadArtifactsAsZip } from '@/data/bulkExport';
import {
  planBulkExport,
  prepareExport,
  recordExport,
  type BulkExportPlan,
} from '@/data/complianceCheck';
import type { ComplianceReport } from '@/models/compliance';
import type { StoredArtifact } from '@/data/db';
import { ExportDraftDialog, type DraftEntry } from './ExportDraftDialog';

function titleOf(record: StoredArtifact): string {
  return (record.artifact as { metadata?: { title?: string } }).metadata?.title || record.uuid;
}

export function useExportDownload(): {
  requestDownload: (record: StoredArtifact) => Promise<void>;
  dialog: ReactNode;
} {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<DraftEntry | null>(null);

  function download(record: StoredArtifact, report: ComplianceReport) {
    try {
      downloadArtifact(record);
      recordExport(record, report);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  async function requestDownload(record: StoredArtifact) {
    const plan = await prepareExport(record);
    if (plan.blockers.length > 0) {
      showToast(
        t('export_blocked', {
          problems: plan.blockers.map((p) => formatCreatorProblem(t, p)).join(' '),
        }),
        'error',
      );
      return;
    }
    if (plan.report.status === 'compliant') download(record, plan.report);
    else setDraft({ record, report: plan.report });
  }

  const dialog = draft ? (
    <ExportDraftDialog
      entries={[draft]}
      bulk={false}
      onCancel={() => setDraft(null)}
      onConfirm={() => {
        download(draft.record, draft.report);
        setDraft(null);
      }}
    />
  ) : null;

  return { requestDownload, dialog };
}

export function useBulkExportDownload(): {
  requestBulkDownload: (records: StoredArtifact[], zipFilename: string) => Promise<void>;
  dialog: ReactNode;
} {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [pending, setPending] = useState<{ plan: BulkExportPlan; zipFilename: string } | null>(
    null,
  );

  function run(plan: BulkExportPlan, zipFilename: string) {
    const exportable = [...plan.compliant, ...plan.drafts];
    downloadArtifactsAsZip(
      exportable.map((e) => e.record),
      zipFilename,
    );
    for (const e of exportable) recordExport(e.record, e.report);
    if (plan.blocked.length > 0) {
      const details = plan.blocked
        .map(
          ({ record, blockers }) =>
            `${titleOf(record)}: ${blockers.map((b) => formatCreatorProblem(t, b)).join(' ')}`,
        )
        .join('; ');
      showToast(
        t('bulk_download_warning', { count: String(plan.blocked.length), details }),
        'warning',
      );
    }
  }

  async function requestBulkDownload(records: StoredArtifact[], zipFilename: string) {
    const plan = await planBulkExport(records);
    if (plan.drafts.length === 0) run(plan, zipFilename);
    else setPending({ plan, zipFilename });
  }

  const dialog = pending ? (
    <ExportDraftDialog
      entries={pending.plan.drafts}
      bulk
      onCancel={() => setPending(null)}
      onConfirm={() => {
        run(pending.plan, pending.zipFilename);
        setPending(null);
      }}
    />
  ) : null;

  return { requestBulkDownload, dialog };
}
