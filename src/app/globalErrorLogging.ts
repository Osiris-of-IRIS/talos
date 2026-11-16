/**
 * Safety net for async failures nobody awaited (ADR-0039, ADR-0002): an unhandled promise
 * rejection — e.g. a live BSI fetch path missing its `.catch` — is at least recorded as a
 * structured, decision-tagged error instead of vanishing into the browser console as an
 * anonymous "Uncaught (in promise)". This does not replace handling at the call site: every
 * upstream load must still show the user a toast (see DashboardPage, ADR-0039).
 */
import type { Logger } from '@/shared/logger';

export function installGlobalErrorLogging(
  target: Pick<Window, 'addEventListener'>,
  log: Logger,
): void {
  target.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    log.error('Unhandled promise rejection', ['ADR-0039', 'ADR-0002'], {
      name: reason instanceof Error ? reason.name : typeof reason,
      message: reason instanceof Error ? reason.message : String(reason),
      ...(reason && typeof reason === 'object' && 'problem' in reason
        ? { problem: (reason as { problem: unknown }).problem }
        : {}),
    });
  });
}
