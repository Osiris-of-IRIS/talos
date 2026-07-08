// Textarea + toolbar (inserts OSCAL markup syntax, ADR-0009's supported subset) + a Preview
// toggle rendering via the existing <Markup> renderer. Decision IDs: ADR-0009, ADR-0011.
import { useRef, useState } from 'react';
import { Markup } from './Markup';
import { useI18n } from './i18n';
import './markupEditor.css';

interface MarkupEditorProps {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  rows?: number;
  dataTestId?: string;
  ariaLabel?: string;
  placeholder?: string;
}

interface Wrap {
  before: string;
  after: string;
  placeholder: string;
}

function wrapSelection(value: string, start: number, end: number, wrap: Wrap): { next: string; selStart: number; selEnd: number } {
  const selected = value.slice(start, end) || wrap.placeholder;
  const next = value.slice(0, start) + wrap.before + selected + wrap.after + value.slice(end);
  return { next, selStart: start + wrap.before.length, selEnd: start + wrap.before.length + selected.length };
}

export function MarkupEditor({ value, onChange, multiline = true, rows = 5, dataTestId, ariaLabel, placeholder }: MarkupEditorProps) {
  const { t } = useI18n();
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tid = dataTestId ?? 'markup-editor';

  function applyWrap(wrap: Wrap) {
    const el = textareaRef.current;
    if (!el) return;
    const { next, selStart, selEnd } = wrapSelection(value, el.selectionStart ?? 0, el.selectionEnd ?? 0, wrap);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  return (
    <div className="markup-editor" data-testid={tid}>
      <div className="markup-editor-toolbar" role="toolbar" aria-label={t('me_toolbar_label')}>
        <button type="button" data-testid={`${tid}-bold`} title={t('me_bold_title')} aria-label={t('me_bold_title')} onClick={() => applyWrap({ before: '**', after: '**', placeholder: 'bold' })}>
          <strong>B</strong>
        </button>
        <button type="button" data-testid={`${tid}-italic`} title={t('me_italic_title')} aria-label={t('me_italic_title')} onClick={() => applyWrap({ before: '*', after: '*', placeholder: 'italic' })}>
          <em>i</em>
        </button>
        <button type="button" data-testid={`${tid}-code`} title={t('me_code_title')} aria-label={t('me_code_title')} onClick={() => applyWrap({ before: '`', after: '`', placeholder: 'code' })}>
          {'</>'}
        </button>
        <button type="button" data-testid={`${tid}-link`} title={t('me_link_title')} aria-label={t('me_link_title')} onClick={() => applyWrap({ before: '[', after: '](https://)', placeholder: 'link' })}>
          🔗
        </button>
        <button
          type="button"
          data-testid={`${tid}-preview-toggle`}
          className="markup-editor-preview-toggle"
          aria-pressed={previewing}
          onClick={() => setPreviewing((p) => !p)}
        >
          {previewing ? `✎ ${t('me_edit_button')}` : `👁️ ${t('me_preview_button')}`}
        </button>
      </div>
      {previewing ? (
        <div className="markup-editor-preview" data-testid={`${tid}-preview`}>
          <Markup value={value} multiline={multiline} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="markup-editor-textarea"
          data-testid={`${tid}-textarea`}
          aria-label={ariaLabel}
          placeholder={placeholder}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
