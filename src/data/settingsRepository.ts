/**
 * Read/write the single `app` row of the `settings` object store (ADR-0004, ADR-0012).
 * Views never touch IndexedDB directly — this is the one entry point for app-level settings
 * (language, theme, library sync bookkeeping).
 */
import { getDb, type TalosSettings } from './db';
import { DEFAULT_LANGUAGE } from '@/config';

const DEFAULTS: TalosSettings = {
  key: 'app',
  language: DEFAULT_LANGUAGE,
  theme: 'light',
};

export async function getSettings(): Promise<TalosSettings> {
  const db = await getDb();
  const stored = await db.get('settings', 'app');
  return stored ?? DEFAULTS;
}

export async function saveSettings(
  patch: Partial<Omit<TalosSettings, 'key'>>,
): Promise<TalosSettings> {
  const db = await getDb();
  const current = await getSettings();
  const next: TalosSettings = { ...current, ...patch, key: 'app' };
  await db.put('settings', next);
  return next;
}
