// System-characteristics editor — core fields only (T-111 scope): name, description, status,
// authorization-boundary. Deferred: system-ids, security-impact-level, system-information detail.
// Decision IDs: ADR-0003, ADR-0017, ADR-0024.
import { useI18n } from '@/shared/i18n';
import { MarkupEditor } from '@/shared/MarkupEditor';
import { DatalistInput } from '@/shared/DatalistInput';
import { SYSTEM_STATUS_STATES } from '@/models/systemStatus';
import type { SystemCharacteristics } from '@/models/ssp';

const STATUS_OPTIONS = SYSTEM_STATUS_STATES.map((s) => ({ value: s.value, label: s.description }));

interface Props {
  value: SystemCharacteristics;
  onChange: (next: SystemCharacteristics) => void;
}

export function SystemCharacteristicsEditor({ value, onChange }: Props) {
  const { t } = useI18n();

  function patch(mutator: (draft: SystemCharacteristics) => void) {
    const draft = structuredClone(value);
    mutator(draft);
    onChange(draft);
  }

  return (
    <div data-testid="system-characteristics-editor">
      <label>
        {t('sc_system_name_label')}
        <input
          data-testid="sc-system-name"
          value={value.systemName}
          onChange={(e) => patch((d) => (d.systemName = e.target.value))}
        />
      </label>
      <label>
        {t('common_description')}
        <MarkupEditor
          dataTestId="sc-description"
          ariaLabel={t('common_description')}
          rows={5}
          value={value.description}
          onChange={(v) => patch((d) => (d.description = v))}
        />
      </label>
      <label>
        {t('sc_status_label')}
        <DatalistInput
          dataTestId="sc-status"
          listId="system-status-options"
          options={STATUS_OPTIONS}
          value={value.status.state}
          onChange={(v) => patch((d) => (d.status.state = v))}
        />
      </label>
      <label>
        {t('sc_authorization_boundary_label')}
        <MarkupEditor
          dataTestId="sc-authorization-boundary"
          ariaLabel={t('sc_authorization_boundary_label')}
          rows={5}
          value={value.authorizationBoundary.description}
          onChange={(v) => patch((d) => (d.authorizationBoundary.description = v))}
        />
      </label>
    </div>
  );
}
