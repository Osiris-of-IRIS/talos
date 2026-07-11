// Hook: on mount, for a genuinely new (not-yet-saved) document, seeds the creator party from the
// global default-creator setting (Settings page, ADR-0033) if configured — a no-op for an
// existing document being edited (isNew=false) and a no-op when nothing is configured.
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getSettings } from '@/data/settingsRepository';
import { applyDefaultCreator } from '@/data/defaultCreator';
import type { OscalArtifact } from '@/models/oscalBase';

export function useSeedDefaultCreator<T extends OscalArtifact>(
  isNew: boolean,
  setDraft: Dispatch<SetStateAction<T | null>>,
): void {
  useEffect(() => {
    if (!isNew) return;
    let active = true;
    void getSettings().then((settings) => {
      if (!active) return;
      setDraft((prev) => (prev ? applyDefaultCreator(prev, settings) : prev));
    });
    return () => {
      active = false;
    };
  }, [isNew, setDraft]);
}
