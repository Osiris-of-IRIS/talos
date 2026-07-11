// Global app settings (ADR-0033): the default creator identity (name/email/optional uuid)
// applied to every newly-created OSCAL artifact's `creator` responsible-party (ADR-0019), so the
// user doesn't have to re-enter it per document.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSettings, saveSettings } from '@/data/settingsRepository';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';

export function SettingsPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [uuid, setUuid] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => {
      setName(s.creatorName ?? '');
      setEmail(s.creatorEmail ?? '');
      setUuid(s.creatorUuid ?? '');
      setLoading(false);
    });
  }, []);

  const configured = Boolean(name.trim() && email.trim());
  const isEmpty = !name.trim() && !email.trim() && !uuid.trim();

  async function onSave() {
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      // Stable identity (ADR-0033): once a uuid is picked here (user-supplied or auto-generated
      // on this first save), it's persisted and reused for every subsequent document — never
      // re-minted on a later save — so the same real-world person keeps the same OSCAL party uuid
      // across every artifact TALOS generates for them.
      let effectiveUuid = uuid.trim();
      if (!effectiveUuid && trimmedName && trimmedEmail) {
        effectiveUuid = globalThis.crypto.randomUUID();
      }
      const saved = await saveSettings({
        creatorName: trimmedName || undefined,
        creatorEmail: trimmedEmail || undefined,
        creatorUuid: effectiveUuid || undefined,
      });
      setName(saved.creatorName ?? '');
      setEmail(saved.creatorEmail ?? '');
      setUuid(saved.creatorUuid ?? '');
      showToast(t('settings_saved_toast'), 'success');
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    setSaving(true);
    try {
      await saveSettings({ creatorName: undefined, creatorEmail: undefined, creatorUuid: undefined });
      setName('');
      setEmail('');
      setUuid('');
      showToast(t('settings_cleared_toast'), 'success');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main>{t('common_loading')}</main>;

  return (
    <main data-testid="settings-page">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>⚙️ {t('settings_page_heading')}</h1>
      <p>
        <small>{t('settings_intro')}</small>
      </p>

      <fieldset>
        <legend>{t('settings_creator_legend')}</legend>
        <p>
          <small>{t('settings_creator_hint')}</small>
        </p>
        <label className="md-field">
          {t('settings_creator_name_label')}
          <input
            data-testid="settings-creator-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="md-field">
          {t('settings_creator_email_label')}
          <input
            data-testid="settings-creator-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="md-field">
          {t('settings_creator_uuid_label')}
          <input
            data-testid="settings-creator-uuid"
            placeholder={t('settings_creator_uuid_placeholder')}
            value={uuid}
            onChange={(e) => setUuid(e.target.value)}
          />
        </label>
        <p>
          <small>{t('settings_creator_uuid_hint')}</small>
        </p>

        {configured ? (
          <p data-testid="settings-creator-status" style={{ color: 'var(--color-ok, #1a7f37)' }}>
            ✓ {t('settings_creator_status_configured')}
          </p>
        ) : (
          <p data-testid="settings-creator-status">
            <small>{t('settings_creator_status_unconfigured')}</small>
          </p>
        )}

        <button type="button" data-testid="settings-save" disabled={saving} onClick={() => void onSave()}>
          💾 {t('common_save')}
        </button>{' '}
        <button
          type="button"
          data-testid="settings-clear"
          disabled={saving || isEmpty}
          onClick={() => void onClear()}
        >
          🗑️ {t('settings_clear_button')}
        </button>
      </fieldset>
    </main>
  );
}
