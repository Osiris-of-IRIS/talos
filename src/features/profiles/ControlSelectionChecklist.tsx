/**
 * Source-scoped control checklist: pick a set of control-ids from a resolved catalog's control
 * tree, filterable by id/alt-identifier/title/statement prose. Shared by the profile editor's
 * by-id/exclude inclusion mode (T-201) and the Profile Creation Assistant's step 3b — one
 * checklist, not two (ADR-0032 §3/§5).
 */
import { useState } from 'react';
import { ControlDisplay } from '@/features/shared/ControlDisplay';
import { getControlHeadline, getControlAltIdentifier, getStatementProse } from '@/models/controlDisplay';
import { useI18n } from '@/shared/i18n';
import type { Control } from '@/models/control';

interface Props {
  controlsById: Map<string, Control>;
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  dataTestId?: string;
}

function matchesFilter(id: string, control: Control, needle: string): boolean {
  if (!needle) return true;
  const haystack = [
    id,
    getControlAltIdentifier(control) ?? '',
    getControlHeadline(control),
    getStatementProse(control),
  ]
    .join(' \n ')
    .toLowerCase();
  return haystack.includes(needle.toLowerCase());
}

export function ControlSelectionChecklist({ controlsById, selectedIds, onChange, dataTestId }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  const rows = [...controlsById.entries()].filter(([id, control]) => matchesFilter(id, control, filter));

  return (
    <div data-testid={dataTestId ?? 'control-selection-checklist'}>
      <label>
        {t('control_checklist_filter_label')}
        <input
          type="search"
          aria-label={t('control_checklist_filter_aria')}
          data-testid="control-checklist-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <p data-testid="control-checklist-count">
        {t('control_checklist_selected_count', { count: selectedIds.size })}
      </p>
      <ul data-testid="control-checklist-list">
        {rows.map(([id, control]) => (
          <li key={id} data-testid="control-checklist-item">
            <label>
              <input
                type="checkbox"
                checked={selectedIds.has(id)}
                onChange={() => toggle(id)}
                aria-label={t('control_checklist_item_aria', { title: getControlHeadline(control) })}
                data-testid="control-checklist-checkbox"
              />{' '}
              <ControlDisplay control={control} />
            </label>
          </li>
        ))}
        {rows.length === 0 && <li data-testid="control-checklist-empty">{t('control_checklist_empty')}</li>}
      </ul>
    </div>
  );
}
