// Reusable back-matter (resources) editor. Decision IDs: ADR-0003, ADR-0015.
import { useRef, useState } from 'react';
import {
  addFileResource,
  ensureUrlResource,
  removeResource,
  shouldWarnFileSize,
  DEFAULT_MAX_EMBEDDED_FILE_BYTES,
} from '@/models/backMatter';
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
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
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
    setError(null);
    setWarning(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (shouldWarnFileSize(bytes.length)) {
        setWarning(
          `"${file.name}" is ${(bytes.length / (1024 * 1024)).toFixed(1)} MiB — this enlarges the document. Consider referencing by URL.`,
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      e.target.value = '';
    }
  }

  return (
    <fieldset data-testid="backmatter-editor">
      <legend>Back-matter resources</legend>

      <ul>
        {resources.map((r) => (
          <li key={r.uuid} data-testid="bm-resource">
            {r.base64 ? '📄' : '🔗'} {r.title ?? r.base64?.filename ?? r.rlinks?.[0]?.href ?? r.uuid}{' '}
            <button
              type="button"
              aria-label={`Remove resource ${r.title ?? r.uuid}`}
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
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          data-testid="bm-title"
          placeholder="title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="button" data-testid="bm-add-url" onClick={addUrl}>
          ➕ Add URL resource
        </button>
      </div>

      <div>
        <button type="button" onClick={() => fileInput.current?.click()}>
          📄 Embed file…
        </button>
        <input ref={fileInput} type="file" hidden data-testid="bm-file-input" onChange={onFile} />
        <small> (max {(maxEmbeddedFileBytes / (1024 * 1024)).toFixed(0)} MiB)</small>
      </div>

      {warning && (
        <p role="status" data-testid="bm-warning">
          ⚠️ {warning}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="bm-error">
          ⚠️ {error}
        </p>
      )}
    </fieldset>
  );
}
