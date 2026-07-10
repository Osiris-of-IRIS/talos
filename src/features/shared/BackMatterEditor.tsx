// Reusable back-matter (resources) editor. Decision IDs: ADR-0003, ADR-0015, ADR-0012.
import { useRef, useState } from 'react';
import {
  addFileResource,
  ensureUrlResource,
  removeResource,
  shouldWarnFileSize,
  DEFAULT_MAX_EMBEDDED_FILE_BYTES,
} from '@/models/backMatter';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import type { OscalArtifact } from '@/models/oscalBase';

interface Props<T extends OscalArtifact> {
  artifact: T;
  onChange: (next: T) => void;
  maxEmbeddedFileBytes?: number;
}

export function BackMatterEditor<T extends OscalArtifact>({
  artifact,
  onChange,
  maxEmbeddedFileBytes = DEFAULT_MAX_EMBEDDED_FILE_BYTES,
}: Props<T>) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const resources = artifact.backMatter?.resources ?? [];

  function patch(mutator: (draft: T) => void) {
    const draft = structuredClone(artifact);
    mutator(draft);
    onChange(draft);
  }

  function addUrl() {
    const u = url.trim();
    if (!u) return;
    patch((d) => ensureUrlResource(d, u, title.trim() || undefined));
    setUrl('');
    setTitle('');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (shouldWarnFileSize(bytes.length)) {
        showToast(
          t('bm_file_size_warning', {
            name: file.name,
            mib: (bytes.length / (1024 * 1024)).toFixed(1),
          }),
          'warning',
        );
      }
      patch((d) =>
        addFileResource(
          d,
          { filename: file.name, mediaType: file.type || undefined, bytes },
          maxEmbeddedFileBytes,
        ),
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      e.target.value = '';
    }
  }

  return (
    <fieldset data-testid="backmatter-editor">
      <legend>{t('bm_legend')}</legend>

      <ul>
        {resources.map((r) => (
          <li key={r.uuid} data-testid="bm-resource">
            {r.base64 ? '📄' : '🔗'} {r.title ?? r.base64?.filename ?? r.rlinks?.[0]?.href ?? r.uuid}{' '}
            <button
              type="button"
              aria-label={t('bm_remove_resource', { title: r.title ?? r.uuid })}
              onClick={() => patch((d) => removeResource(d, r.uuid))}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>

      <div>
        <input
          data-testid="bm-url"
          placeholder={t('bm_url_placeholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          data-testid="bm-title"
          placeholder={t('bm_title_placeholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="button" data-testid="bm-add-url" onClick={addUrl}>
          ➕ {t('bm_add_url')}
        </button>
      </div>

      <div>
        <button type="button" onClick={() => fileInput.current?.click()}>
          📄 {t('bm_embed_file')}
        </button>
        <input ref={fileInput} type="file" hidden data-testid="bm-file-input" onChange={onFile} />
        <small> {t('bm_max_size', { mib: (maxEmbeddedFileBytes / (1024 * 1024)).toFixed(0) })}</small>
      </div>

    </fieldset>
  );
}
