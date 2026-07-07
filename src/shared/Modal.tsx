// Generic modal dialog primitive. Decision IDs: ADR-0022.
// Plain overlay + role="dialog" (not the native <dialog>/showModal()) so behaviour is identical
// and testable across browsers and jsdom.
import { useEffect } from 'react';
import { useI18n } from './i18n';
import './modal.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          data-testid="modal-close"
          aria-label={t('modal_close')}
          title={t('modal_close')}
          onClick={onClose}
        >
          ✕
        </button>
        {title && <h3 className="modal-title">{title}</h3>}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
