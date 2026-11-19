// System-characteristics editor: name, description, status, authorization-boundary, and — so every
// required OSCAL field of an SSP can be filled in TALOS (ADR-0040) — system IDs and information
// types (title + description). Deferred: security-impact-level, information-type categorizations
// and impact levels. Decision IDs: ADR-0003, ADR-0017, ADR-0024, ADR-0040.
import { useI18n } from '@/shared/i18n';
import { MarkupEditor } from '@/shared/MarkupEditor';
import { DatalistInput } from '@/shared/DatalistInput';
import { SYSTEM_STATUS_STATES } from '@/models/systemStatus';
import { SYSTEM_ID_TYPE_UUID, type SystemCharacteristics } from '@/models/ssp';

const STATUS_OPTIONS = SYSTEM_STATUS_STATES.map((s) => ({ value: s.value, label: s.description }));
const SYSTEM_ID_TYPE_OPTIONS = [
  { value: SYSTEM_ID_TYPE_UUID, label: 'UUID (RFC 4122)' },
  { value: 'http://fedramp.gov/ns/oscal', label: 'FedRAMP' },
];

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
      <fieldset data-testid="sc-system-ids">
        <legend>{t('sc_system_ids_heading')}</legend>
        {(value.systemIds ?? []).map((sid, i) => (
          <div key={i} data-testid="sc-system-id-row">
            <label>
              {t('sc_system_id_type_label')}
              <DatalistInput
                dataTestId="sc-system-id-type"
                listId={`system-id-type-options-${i}`}
                options={SYSTEM_ID_TYPE_OPTIONS}
                value={sid.identifierType ?? ''}
                onChange={(v) =>
                  patch((d) => {
                    if (v) d.systemIds[i]!.identifierType = v;
                    else delete d.systemIds[i]!.identifierType;
                  })
                }
              />
            </label>
            <label>
              {t('sc_system_id_value_label')}
              <input
                data-testid="sc-system-id-value"
                value={sid.id}
                onChange={(e) => patch((d) => (d.systemIds[i]!.id = e.target.value))}
              />
            </label>
            <button
              type="button"
              data-testid="sc-remove-system-id"
              aria-label={t('sc_remove_system_id_aria', { id: sid.id })}
              title={t('sc_remove_system_id_aria', { id: sid.id })}
              onClick={() => patch((d) => d.systemIds.splice(i, 1))}
            >
              🗑️
            </button>
          </div>
        ))}
        <button
          type="button"
          data-testid="sc-add-system-id"
          onClick={() => patch((d) => (d.systemIds ??= []).push({ identifierType: SYSTEM_ID_TYPE_UUID, id: globalThis.crypto.randomUUID() }))}
        >
          ➕ {t('sc_add_system_id')}
        </button>
      </fieldset>
      <fieldset data-testid="sc-information-types">
        <legend>{t('sc_information_types_heading')}</legend>
        <p>
          <small>{t('sc_information_types_hint')}</small>
        </p>
        {(value.systemInformation?.informationTypes ?? []).map((it, i) => (
          <div key={it.uuid ?? i} data-testid="sc-information-type-row">
            <label>
              {t('sc_information_type_title_label')}
              <input
                data-testid="sc-information-type-title"
                value={it.title}
                onChange={(e) => patch((d) => (d.systemInformation.informationTypes[i]!.title = e.target.value))}
              />
            </label>
            <label>
              {t('common_description')}
              <MarkupEditor
                dataTestId="sc-information-type-description"
                ariaLabel={t('common_description')}
                rows={3}
                value={it.description}
                onChange={(v) => patch((d) => (d.systemInformation.informationTypes[i]!.description = v))}
              />
            </label>
            <button
              type="button"
              data-testid="sc-remove-information-type"
              aria-label={t('sc_remove_information_type_aria', { title: it.title })}
              title={t('sc_remove_information_type_aria', { title: it.title })}
              onClick={() => patch((d) => d.systemInformation.informationTypes.splice(i, 1))}
            >
              🗑️
            </button>
          </div>
        ))}
        <button
          type="button"
          data-testid="sc-add-information-type"
          onClick={() =>
            patch((d) => {
              d.systemInformation ??= { informationTypes: [] };
              (d.systemInformation.informationTypes ??= []).push({
                uuid: globalThis.crypto.randomUUID(),
                title: '',
                description: '',
              });
            })
          }
        >
          ➕ {t('sc_add_information_type')}
        </button>
      </fieldset>
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
