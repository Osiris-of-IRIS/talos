/**
 * Shared toast notification system (T-035, ADR-0002/0010/0012): transient action-result feedback
 * (upload/export/download/adopt succeeded or failed) surfaces here instead of a per-page inline
 * banner. `success`/`info` auto-dismiss after `durationMs`; `warning`/`error` persist until the
 * user dismisses them — an error toast disappearing on a timer before it's been read would be a
 * regression, not an improvement, over the inline banners this replaces.
 *
 * Deliberately NOT used for persistent, contextual state (a "not found" page state, prerequisite
 * gating like "no assets yet", per-field validation, or an ongoing document-content hint like
 * ADR-0019's creator status) — those need to stay visible while the user works, not vanish like a
 * notification. Those banners stay inline; only genuinely transient results moved here.
 *
 * The context's default value (no <ToastProvider> mounted, e.g. isolated component tests that
 * don't need to assert on toast behavior) is a safe no-op — same fallback-tier convention as
 * `useI18n()` (src/shared/i18n.tsx) — so existing tests never crash just for not wrapping in one.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from './i18n';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

interface ToastRecord {
  id: string;
  level: ToastLevel;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, level?: ToastLevel) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const DEFAULT_DURATION_MS = 6000;
/** Levels that auto-dismiss; warning/error require a manual dismiss. */
const AUTO_DISMISS_LEVELS: ReadonlySet<ToastLevel> = new Set(['info', 'success']);

interface ToastProviderProps {
  children: ReactNode;
  /** Test-only override for the auto-dismiss delay. */
  durationMs?: number;
}

export function ToastProvider({ children, durationMs = DEFAULT_DURATION_MS }: ToastProviderProps) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Stable across re-renders (useCallback) so a consumer can safely list it in an effect's
  // dependency array without the effect re-firing every time any toast anywhere shows/hides.
  const showToast = useCallback(
    (message: string, level: ToastLevel = 'info') => {
      const id = globalThis.crypto.randomUUID();
      setToasts((prev) => [...prev, { id, level, message }]);
      if (AUTO_DISMISS_LEVELS.has(level)) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), durationMs),
        );
      }
    },
    [dismiss, durationMs],
  );

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-container" data-testid="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.level}`}
            role={toast.level === 'error' ? 'alert' : 'status'}
            data-testid="toast"
            data-level={toast.level}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              aria-label={t('toast_dismiss_aria')}
              data-testid="toast-dismiss"
              onClick={() => dismiss(toast.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
