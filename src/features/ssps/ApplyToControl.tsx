/**
 * "Apply to..." button row (T-512, ADR-0037): one button per scope the owning SSP can propagate
 * to (its own asset-type / its own groups — never an arbitrary pick, see `propagateChange.ts`).
 * Renders nothing when there's nothing to propagate to, or the SSP isn't saved yet (`disabled`).
 */
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import type { PropagationScope, PropagationResult } from './propagateChange';

interface Props {
  scopes: PropagationScope[];
  disabled?: boolean;
  onApply: (scope: PropagationScope) => Promise<PropagationResult>;
}

export function ApplyToControl({ scopes, disabled, onApply }: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();

  if (disabled || scopes.length === 0) return null;

  async function handleApply(scope: PropagationScope) {
    const result = await onApply(scope);
    const parts = [t('ssp_apply_result_updated', { count: result.updated.length })];
    if (result.skipped.length > 0) {
      parts.push(
        t('ssp_apply_result_skipped', {
          count: result.skipped.length,
          reasons: result.skipped.map((s) => `${s.title} (${s.reason})`).join('; '),
        }),
      );
    }
    showToast(parts.join(' '), result.updated.length > 0 ? 'success' : 'warning');
  }

  return (
    <span data-testid="apply-to-control">
      <em>{t('ssp_apply_to_label')}</em>{' '}
      {scopes.map((scope) => (
        <button
          key={`${scope.kind}-${scope.value}`}
          type="button"
          data-testid="apply-to-scope-button"
          onClick={() => void handleApply(scope)}
        >
          ➜ {scope.label}
        </button>
      ))}
    </span>
  );
}
