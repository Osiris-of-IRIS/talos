/**
 * The compliance gate in the UI (ADR-0040, PO decision backlog #3): only OSCAL-compliant artifacts
 * may be used as input to a later step. One hook per consumption point:
 *
 *  - `useInputGate(candidates, consumer)` — for pickers that commit on pick (SSP import-profile,
 *    profile/component-definition imports, control-implementation source): `markerFor(uuid)` labels
 *    non-compliant options, `await admit(record)` refuses a non-compliant pick and keeps a
 *    `notice` explaining why and which fields to fix.
 *  - `useGatedSelection(candidates, selectedUuid, consumer)` — for pickers that hold a selection
 *    (assistant sources, bootstrap baseline, SSP component-definition select): `usable` gates the
 *    next action, `notice` explains a blocked selection.
 * Both log and count every decision (src/data/complianceCheck.ts `recordGateDecision`).
 *
 * Decision IDs: ADR-0040.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/shared/i18n';
import { gateRecord, recordGateDecision, type GateConsumer } from '@/data/complianceCheck';
import { gateDecision, type ComplianceReport, type GateDecision } from '@/models/compliance';
import type { StoredArtifact } from '@/data/db';
import { useRecordsCompliance } from './useCompliance';
import { BlockedInputNotice } from './BlockedInputNotice';

export interface InputGate {
  reports: Map<string, ComplianceReport>;
  /** Gate decision for a candidate (`undefined` if `uuid` is not a candidate). */
  decisionFor: (uuid: string) => GateDecision | undefined;
  /** " ⚠ not OSCAL-compliant" for a known non-compliant candidate, '' otherwise. */
  markerFor: (uuid: string) => string;
  /** Check `record` (awaiting a running check) — true when it may be used; else shows the notice. */
  admit: (record: StoredArtifact) => Promise<boolean>;
  clear: () => void;
  notice: ReactNode;
}

export function useInputGate(
  candidates: readonly StoredArtifact[],
  consumer: GateConsumer,
): InputGate {
  const { t } = useI18n();
  const reports = useRecordsCompliance(candidates);
  const [blocked, setBlocked] = useState<{
    record: StoredArtifact;
    report: ComplianceReport;
  } | null>(null);

  function decisionFor(uuid: string): GateDecision | undefined {
    if (!candidates.some((c) => c.uuid === uuid)) return undefined;
    return gateDecision(reports.get(uuid));
  }

  function markerFor(uuid: string): string {
    const d = decisionFor(uuid);
    return d && !d.usable && d.reason !== 'pending' ? t('gate_not_compliant_marker') : '';
  }

  async function admit(record: StoredArtifact): Promise<boolean> {
    const decision = await gateRecord(record, consumer);
    if (decision.usable) {
      setBlocked(null);
      return true;
    }
    if (decision.reason !== 'pending') setBlocked({ record, report: decision.report });
    return false;
  }

  return {
    reports,
    decisionFor,
    markerFor,
    admit,
    clear: () => setBlocked(null),
    notice: blocked ? (
      <BlockedInputNotice
        record={blocked.record}
        report={blocked.report}
        onDismiss={() => setBlocked(null)}
      />
    ) : null,
  };
}

export interface GatedSelection extends InputGate {
  /** The selected candidate (if `selectedUuid` names one). */
  selected: StoredArtifact | undefined;
  /** true only once the selected candidate is known to be compliant. */
  usable: boolean;
  /** true while the selected candidate's check is still running. */
  pending: boolean;
}

export function useGatedSelection(
  candidates: readonly StoredArtifact[],
  selectedUuid: string,
  consumer: GateConsumer,
): GatedSelection {
  const gate = useInputGate(candidates, consumer);
  const selected = candidates.find((c) => c.uuid === selectedUuid);
  const decision = selected ? gateDecision(gate.reports.get(selected.uuid)) : undefined;
  const settled = decision && !(decision.usable === false && decision.reason === 'pending');
  const decisionKey = decision ? (decision.usable ? 'usable' : decision.reason) : 'none';

  useEffect(() => {
    if (selected && decision && settled) recordGateDecision(decision, consumer, selected);
    // Count once per (selection, outcome), not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.uuid, selected?.updatedAt, decisionKey]);

  const blockedNotice =
    selected && decision && !decision.usable && decision.reason !== 'pending' ? (
      <BlockedInputNotice record={selected} report={decision.report} />
    ) : null;

  return {
    ...gate,
    selected,
    usable: decision?.usable === true,
    pending: !!selected && !settled,
    notice: blockedNotice ?? gate.notice,
  };
}
